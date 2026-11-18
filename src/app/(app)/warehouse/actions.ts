"use server";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { done, fail, optStr, str } from "@/lib/flash";

export async function releaseReceipt(fd: FormData) {
  const me = await requireProfile();
  const supabase = await createClient();
  const receiptId = str(fd, "receipt_id");
  const { data: r } = await supabase.from("v_receipt_summary").select("stage, balance_usd").eq("id", receiptId).single();
  if (!r) fail("/warehouse", "Receipt not found");
  if (r.stage !== "offloaded") fail("/warehouse", "Goods must be offloaded at the warehouse before release");
  const override = str(fd, "override") === "on" && me.role === "admin";
  if (Number(r.balance_usd) > 0.009 && !override) fail("/warehouse", "Customer has an unpaid balance — record payment first");

  const method = str(fd, "delivery_method") as "collect" | "delivery";
  const { data, error } = await supabase
    .from("release_orders")
    .insert({
      receipt_id: receiptId,
      delivery_method: method,
      delivery_address: method === "delivery" ? optStr(fd, "delivery_address") : null,
      collected_by: optStr(fd, "collected_by"),
      notes: override ? "Released with balance (admin override)" : null,
      // collected at the counter = delivered now
      delivered_at: method === "collect" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) fail("/warehouse", error);
  redirect(`/print/release/${data.id}`);
}

export async function markDelivered(fd: FormData) {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("release_orders").update({ delivered_at: new Date().toISOString() }).eq("id", str(fd, "id"));
  if (error) fail("/warehouse", error);
  done("/warehouse", "Marked as delivered");
}
