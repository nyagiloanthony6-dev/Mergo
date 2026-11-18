"use server";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fail, numOrNull, optStr, str } from "@/lib/flash";

export async function recordPayment(fd: FormData) {
  await requireProfile();
  const supabase = await createClient();
  const receipt_id = optStr(fd, "receipt_id");
  const container_id = optStr(fd, "container_id");
  const back = `/payments/new?${receipt_id ? "receipt=" + receipt_id : "container=" + container_id}`;

  let customer_id: string | null = null;
  if (receipt_id) {
    const { data } = await supabase.from("lcl_receipts").select("customer_id").eq("id", receipt_id).single();
    customer_id = data?.customer_id ?? null;
  } else if (container_id) {
    const { data } = await supabase.from("containers").select("fcl_customer_id").eq("id", container_id).single();
    customer_id = data?.fcl_customer_id ?? null;
  }
  if (!customer_id) fail(back, "Select a receipt or FCL container");

  const currency = str(fd, "currency");
  const { error } = await supabase.from("payments").insert({
    customer_id,
    receipt_id,
    container_id,
    side: str(fd, "side"),
    currency,
    amount: Number(str(fd, "amount")),
    fx_rate: currency === "TZS" ? numOrNull(fd, "fx_rate") : null,
    method: optStr(fd, "method"),
    reference: optStr(fd, "reference"),
  });
  if (error) fail(back, error);
  redirect((receipt_id ? `/receiving/${receipt_id}` : `/containers/${container_id}`) + "?ok=" + encodeURIComponent("Payment recorded"));
}
