"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { done, fail, optStr, str } from "@/lib/flash";

const blFields = (fd: FormData) => ({
  bl_no: str(fd, "bl_no").toUpperCase(),
  shipping_line: optStr(fd, "shipping_line"),
  vessel: optStr(fd, "vessel"),
  voyage: optStr(fd, "voyage"),
  port_of_loading: optStr(fd, "port_of_loading"),
  port_of_discharge: str(fd, "port_of_discharge") || "Dar es Salaam",
  etd: optStr(fd, "etd"),
  eta: optStr(fd, "eta"),
  notes: optStr(fd, "notes"),
});

export async function createBl(fd: FormData) {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.from("bills_of_lading").insert(blFields(fd)).select("id").single();
  if (error) fail("/bls", error.code === "23505" ? "That BL number already exists" : error);
  redirect(`/bls/${data.id}?ok=` + encodeURIComponent("BL created — now assign containers"));
}

export async function updateBl(fd: FormData) {
  await requireProfile();
  const supabase = await createClient();
  const id = str(fd, "id");
  const { error } = await supabase.from("bills_of_lading").update(blFields(fd)).eq("id", id);
  if (error) fail(`/bls/${id}`, error);
  done(`/bls/${id}`, "BL saved");
}

export async function assignContainers(fd: FormData) {
  await requireProfile();
  const supabase = await createClient();
  const id = str(fd, "bl_id");
  const ids = fd.getAll("container_id").map(String);
  if (!ids.length) fail(`/bls/${id}`, "Select containers to assign");
  const { error } = await supabase.from("containers").update({ bl_id: id }).in("id", ids);
  if (error) fail(`/bls/${id}`, error);
  done(`/bls/${id}`, `${ids.length} container(s) assigned`);
}

export async function removeContainer(fd: FormData) {
  await requireProfile();
  const supabase = await createClient();
  const id = str(fd, "bl_id");
  const { data: c } = await supabase.from("containers").select("status").eq("id", str(fd, "container_id")).single();
  if (c && !["stuffing", "stuffed"].includes(c.status)) fail(`/bls/${id}`, "Container has already departed; it cannot be removed from the BL");
  const { error } = await supabase.from("containers").update({ bl_id: null }).eq("id", str(fd, "container_id"));
  if (error) fail(`/bls/${id}`, error);
  revalidatePath(`/bls/${id}`);
  redirect(`/bls/${id}`);
}
