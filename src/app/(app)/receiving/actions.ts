"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { errMsg, normalizePhone } from "@/lib/format";
import { fail, str } from "@/lib/flash";

export async function findCustomerByPhone(phone: string) {
  await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("customers").select("id, name, phone").eq("phone", normalizePhone(phone)).maybeSingle();
  return data;
}

/** Find or create a customer by phone; updates the name if it changed. */
export async function upsertCustomer(name: string, phoneRaw: string) {
  const supabase = await createClient();
  const phone = normalizePhone(phoneRaw);
  if (phone.length < 9) throw new Error("Enter a valid phone number");
  const { data: existing } = await supabase.from("customers").select("id, name").eq("phone", phone).maybeSingle();
  if (existing) {
    if (name && existing.name !== name) await supabase.from("customers").update({ name }).eq("id", existing.id);
    return existing.id as string;
  }
  if (!name) throw new Error("Customer name is required for a new customer");
  const { data, error } = await supabase.from("customers").insert({ name, phone }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export type ReceiptItemInput = {
  item_name: string;
  hs_code?: string;
  category_id: string;
  cbm: number;
  weight_kg: number;
  pieces: number;
  packages: number;
};

export async function createReceipt(input: {
  branch_id: string;
  customer_name: string;
  customer_phone: string;
  notes?: string;
  items: ReceiptItemInput[];
}): Promise<{ error: string } | void> {
  await requireProfile();
  const supabase = await createClient();
  let receiptId: string;
  try {
    if (!input.items.length) throw new Error("Add at least one item");
    for (const it of input.items) {
      if (!it.item_name || !it.category_id) throw new Error("Every item needs a name and category");
      if (it.cbm <= 0 && it.weight_kg <= 0 && it.pieces <= 0) throw new Error(`Enter CBM, weight or pieces for "${it.item_name}"`);
    }
    const customer_id = await upsertCustomer(input.customer_name.trim(), input.customer_phone);
    const { data: receipt, error } = await supabase
      .from("lcl_receipts")
      .insert({ branch_id: input.branch_id, customer_id, notes: input.notes || null })
      .select("id")
      .single();
    if (error) throw error;
    receiptId = receipt.id;
    const { error: e2 } = await supabase
      .from("lcl_receipt_items")
      .insert(input.items.map((it) => ({ ...it, hs_code: it.hs_code || null, receipt_id: receipt.id })));
    if (e2) {
      await supabase.from("lcl_receipts").delete().eq("id", receipt.id);
      throw e2;
    }
  } catch (e) {
    return { error: errMsg(e) };
  }
  revalidatePath("/receiving");
  redirect(`/receiving/${receiptId}?ok=` + encodeURIComponent("Goods received"));
}

export async function addItem(fd: FormData) {
  await requireProfile();
  const supabase = await createClient();
  const receipt_id = str(fd, "receipt_id");
  const back = `/receiving/${receipt_id}`;
  const { error } = await supabase.from("lcl_receipt_items").insert({
    receipt_id,
    item_name: str(fd, "item_name"),
    hs_code: str(fd, "hs_code") || null,
    category_id: str(fd, "category_id"),
    cbm: Number(str(fd, "cbm") || 0),
    weight_kg: Number(str(fd, "weight_kg") || 0),
    pieces: Number(str(fd, "pieces") || 0),
    packages: Number(str(fd, "packages") || 0),
  });
  if (error) fail(back, error);
  revalidatePath(back);
  redirect(back);
}

export async function deleteItem(fd: FormData) {
  await requireProfile();
  const supabase = await createClient();
  const back = `/receiving/${str(fd, "receipt_id")}`;
  const { data: item } = await supabase.from("lcl_receipt_items").select("container_id").eq("id", str(fd, "id")).single();
  if (item?.container_id) fail(back, "Item is loaded in a container — remove it from the container first");
  const { error } = await supabase.from("lcl_receipt_items").delete().eq("id", str(fd, "id"));
  if (error) fail(back, error);
  revalidatePath(back);
  redirect(back);
}
