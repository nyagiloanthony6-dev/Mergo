"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cleanContainerNo, validateContainerNo } from "@/lib/container";
import { STATUS_FLOW, type ContainerStatus } from "@/lib/format";
import { done, fail, numOrNull, optStr, str } from "@/lib/flash";
import { upsertCustomer } from "../receiving/actions";

export async function createContainer(fd: FormData) {
  await requireProfile();
  const supabase = await createClient();
  const container_no = cleanContainerNo(str(fd, "container_no"));
  const invalid = validateContainerNo(container_no);
  if (invalid && str(fd, "skip_check") !== "on") fail("/containers/new", invalid);

  const mode = str(fd, "mode") as "LCL" | "FCL";
  let fcl_customer_id: string | null = null;
  if (mode === "FCL") {
    try {
      fcl_customer_id = await upsertCustomer(str(fd, "customer_name"), str(fd, "customer_phone"));
    } catch (e) {
      fail("/containers/new", e);
    }
  }
  const { data, error } = await supabase
    .from("containers")
    .insert({
      container_no,
      type_code: str(fd, "type_code"),
      mode,
      branch_id: str(fd, "branch_id"),
      seal_no: optStr(fd, "seal_no"),
      fcl_customer_id,
      fcl_goods_description: mode === "FCL" ? optStr(fd, "fcl_goods_description") : null,
      fcl_freight_usd: mode === "FCL" ? numOrNull(fd, "fcl_freight_usd") : null,
    })
    .select("id")
    .single();
  if (error) {
    fail("/containers/new", error.code === "23505" ? `Container ${container_no} is already active in the system` : error);
  }
  redirect(`/containers/${data.id}?ok=` + encodeURIComponent("Container created — start stuffing"));
}

export async function updateContainer(fd: FormData) {
  await requireProfile();
  const supabase = await createClient();
  const id = str(fd, "id");
  const patch: Record<string, unknown> = { seal_no: optStr(fd, "seal_no"), notes: optStr(fd, "notes") };
  if (fd.has("fcl_freight_usd")) patch.fcl_freight_usd = numOrNull(fd, "fcl_freight_usd");
  if (fd.has("fcl_goods_description")) patch.fcl_goods_description = optStr(fd, "fcl_goods_description");
  const { error } = await supabase.from("containers").update(patch).eq("id", id);
  if (error) fail(`/containers/${id}`, error);
  done(`/containers/${id}`, "Saved");
}

/** Move a container one step forward (or back) in its status flow. */
export async function setStatus(fd: FormData) {
  await requireProfile();
  const supabase = await createClient();
  const id = str(fd, "id");
  const back = `/containers/${id}`;
  const target = str(fd, "status") as ContainerStatus;
  const direction = str(fd, "direction"); // "forward" | "back"

  const { data: c } = await supabase.from("v_container_summary").select("*").eq("id", id).single();
  if (!c) fail(back, "Container not found");
  const flow = STATUS_FLOW[c.mode as "LCL" | "FCL"];
  const cur = flow.findIndex((s) => s.status === c.status);
  const next = flow.findIndex((s) => s.status === target);
  if (next < 0 || (direction === "forward" ? next !== cur + 1 : next !== cur - 1)) fail(back, "Invalid status change");

  const patch: Record<string, unknown> = { status: target };
  if (direction === "forward") {
    if (target === "stuffed") {
      if (Number(c.item_count) === 0) fail(back, "Load goods into the container before sealing it");
      if (!c.seal_no) fail(back, "Enter the seal number before marking the container as stuffed");
    }
    if (target === "in_transit" && !c.bl_id) fail(back, "Assign the container to a BL before it departs");
    if (target === "offloaded") {
      const { count } = await supabase
        .from("lcl_receipt_items")
        .select("id", { count: "exact", head: true })
        .eq("container_id", id)
        .eq("tally_status", "pending");
      if (count) fail(back, `${count} item(s) not tallied yet — finish the offload tally first`);
    }
    const col = flow[next].column;
    if (col) patch[col] = new Date().toISOString();
  } else {
    const col = flow[cur].column; // undo: clear the timestamp of the step we are leaving
    if (col) patch[col] = null;
  }
  const { error } = await supabase.from("containers").update(patch).eq("id", id);
  if (error) fail(back, error);
  revalidatePath("/containers");
  redirect(back);
}

export async function loadItems(fd: FormData) {
  await requireProfile();
  const supabase = await createClient();
  const id = str(fd, "container_id");
  const ids = fd.getAll("item_id").map(String);
  if (!ids.length) fail(`/containers/${id}`, "Select items to load");
  const { error } = await supabase.from("lcl_receipt_items").update({ container_id: id }).in("id", ids);
  if (error) fail(`/containers/${id}`, error);
  done(`/containers/${id}`, `${ids.length} item(s) loaded`);
}

export async function unloadItem(fd: FormData) {
  await requireProfile();
  const supabase = await createClient();
  const id = str(fd, "container_id");
  const { error } = await supabase.from("lcl_receipt_items").update({ container_id: null }).eq("id", str(fd, "item_id"));
  if (error) fail(`/containers/${id}`, error);
  revalidatePath(`/containers/${id}`);
  redirect(`/containers/${id}`);
}

export async function addFclItem(fd: FormData) {
  await requireProfile();
  const supabase = await createClient();
  const id = str(fd, "container_id");
  const { error } = await supabase.from("fcl_container_items").insert({
    container_id: id,
    description: str(fd, "description"),
    hs_code: optStr(fd, "hs_code"),
    packages: Number(str(fd, "packages") || 0),
    pieces: Number(str(fd, "pieces") || 0),
    cbm: Number(str(fd, "cbm") || 0),
    weight_kg: Number(str(fd, "weight_kg") || 0),
  });
  if (error) fail(`/containers/${id}`, error);
  revalidatePath(`/containers/${id}`);
  redirect(`/containers/${id}`);
}

export async function deleteFclItem(fd: FormData) {
  await requireProfile();
  const supabase = await createClient();
  const id = str(fd, "container_id");
  const { error } = await supabase.from("fcl_container_items").delete().eq("id", str(fd, "item_id"));
  if (error) fail(`/containers/${id}`, error);
  revalidatePath(`/containers/${id}`);
  redirect(`/containers/${id}`);
}

// ---------------- Documents (shared by containers and BLs) ----------------
export async function uploadDocument(fd: FormData) {
  const me = await requireProfile();
  const supabase = await createClient();
  const containerId = optStr(fd, "container_id");
  const blId = optStr(fd, "bl_id");
  const back = containerId ? `/containers/${containerId}` : `/bls/${blId}`;
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) fail(back, "Choose a file to upload");

  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${me.company_id}/${containerId ? "container/" + containerId : "bl/" + blId}/${Date.now()}-${safeName}`;
  const { error: upErr } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type || undefined });
  if (upErr) fail(back, upErr);
  const { error } = await supabase.from("documents").insert({
    container_id: containerId,
    bl_id: blId,
    doc_type: str(fd, "doc_type"),
    file_name: file.name,
    file_path: path,
  });
  if (error) {
    await supabase.storage.from("documents").remove([path]);
    fail(back, error);
  }
  done(back, "Document uploaded");
}

export async function deleteDocument(fd: FormData) {
  await requireProfile();
  const supabase = await createClient();
  const back = str(fd, "back");
  const { data: doc } = await supabase.from("documents").select("file_path").eq("id", str(fd, "id")).single();
  if (doc) await supabase.storage.from("documents").remove([doc.file_path]);
  const { error } = await supabase.from("documents").delete().eq("id", str(fd, "id"));
  if (error) fail(back, error);
  done(back, "Document removed");
}

// ---------------- Dar warehouse offload tally ----------------
export async function saveTally(fd: FormData) {
  await requireProfile();
  const supabase = await createClient();
  const id = str(fd, "container_id");
  const ids = fd.getAll("item_id").map(String);
  for (const itemId of ids) {
    const dar = str(fd, `dar_${itemId}`);
    const status = str(fd, `status_${itemId}`);
    if (dar === "" && status === "pending") continue;
    const { error } = await supabase
      .from("lcl_receipt_items")
      .update({
        dar_packages: dar === "" ? null : Number(dar),
        tally_status: status,
        location: optStr(fd, `loc_${itemId}`),
        tally_note: optStr(fd, `note_${itemId}`),
        tallied_at: status === "pending" ? null : new Date().toISOString(),
      })
      .eq("id", itemId);
    if (error) fail(`/containers/${id}/offload`, error);
  }
  done(`/containers/${id}/offload`, "Tally saved");
}
