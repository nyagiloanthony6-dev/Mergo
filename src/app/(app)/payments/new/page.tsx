import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { flashParams, type SP } from "@/lib/flash";
import { tzs, usd } from "@/lib/format";
import { Field, Flash, PageHeader } from "@/components/ui";
import { recordPayment } from "../actions";

export default async function NewPayment({ searchParams }: { searchParams: SP }) {
  const me = await requireProfile();
  const { error, params } = await flashParams(searchParams);
  const supabase = await createClient();
  const receiptId = typeof params.receipt === "string" ? params.receipt : "";
  const containerId = typeof params.container === "string" ? params.container : "";
  const lookup = typeof params.lookup === "string" ? params.lookup.trim().toUpperCase() : "";

  // Find by receipt number or container number
  if (lookup && !receiptId && !containerId) {
    const { data: r } = await supabase.from("lcl_receipts").select("id").eq("receipt_no", lookup).maybeSingle();
    if (r) redirect(`/payments/new?receipt=${r.id}`);
    const { data: c } = await supabase.from("containers").select("id").eq("container_no", lookup).eq("mode", "FCL").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (c) redirect(`/payments/new?container=${c.id}`);
  }

  const { data: fx } = await supabase.from("fx_rates").select("rate").order("effective_from", { ascending: false }).limit(1).maybeSingle();
  let target: { label: string; customer: string; charge: number; paid: number; balance: number } | null = null;
  if (receiptId) {
    const { data: r } = await supabase.from("v_receipt_summary").select("*").eq("id", receiptId).maybeSingle();
    if (r) target = { label: `LCL receipt ${r.receipt_no}`, customer: `${r.customer_name} · ${r.customer_phone}`, charge: +r.total_charge_usd, paid: +r.paid_usd, balance: +r.balance_usd };
  } else if (containerId) {
    const { data: c } = await supabase.from("v_container_summary").select("container_no, fcl_customer_name, fcl_customer_phone").eq("id", containerId).maybeSingle();
    const { data: b } = await supabase.from("v_fcl_balance").select("*").eq("container_id", containerId).maybeSingle();
    if (c && b) target = { label: `FCL container ${c.container_no}`, customer: `${c.fcl_customer_name} · ${c.fcl_customer_phone}`, charge: +b.charge_usd, paid: +b.paid_usd, balance: +b.balance_usd };
  }
  const defaultSide = me.branch_id ? "origin" : "destination";

  return (
    <div className="max-w-2xl">
      <PageHeader title="Record payment" subtitle="Payments can be taken at origin or in Dar, in USD or TZS" />
      <Flash error={error ?? (lookup && !target ? `No receipt or FCL container found for "${lookup}"` : undefined)} />
      {!target ? (
        <form className="card flex items-end gap-2 p-6">
          <Field label="Receipt number or FCL container number" className="flex-1"><input name="lookup" defaultValue={lookup} className="input font-mono uppercase" required /></Field>
          <button className="btn">Find</button>
        </form>
      ) : (
        <form action={recordPayment} className="card space-y-4 p-6">
          {receiptId && <input type="hidden" name="receipt_id" value={receiptId} />}
          {containerId && <input type="hidden" name="container_id" value={containerId} />}
          <div className="rounded-md bg-slate-50 p-4 text-sm">
            <div className="font-medium">{target.label}</div>
            <div className="text-slate-600">{target.customer}</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div><span className="label">Charge</span>{usd(target.charge)}</div>
              <div><span className="label">Paid</span>{usd(target.paid)}</div>
              <div><span className="label">Balance</span><span className="font-semibold text-red-700">{usd(target.balance)}</span></div>
            </div>
            {fx && target.balance > 0 && (
              <div className="mt-2 text-xs text-slate-500">Balance in TZS at today&apos;s rate ({tzs(fx.rate)}): <span className="font-semibold">{tzs(target.balance * Number(fx.rate))}</span></div>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Paid at">
              <select name="side" defaultValue={defaultSide} className="input"><option value="origin">Origin</option><option value="destination">Destination (Dar)</option></select>
            </Field>
            <Field label="Currency">
              <select name="currency" className="input"><option>USD</option><option>TZS</option></select>
            </Field>
            <Field label="Amount"><input name="amount" type="number" step="0.01" min="0.01" className="input" required /></Field>
            <Field label="FX rate (TZS payments only)">
              <input name="fx_rate" type="number" step="0.0001" defaultValue={fx?.rate ?? ""} className="input" placeholder="TZS per USD" />
            </Field>
            <Field label="Method">
              <select name="method" className="input"><option>Cash</option><option>Bank transfer</option><option>Mobile money</option><option>Other</option></select>
            </Field>
            <Field label="Reference"><input name="reference" className="input" placeholder="Bank / M-Pesa ref" /></Field>
          </div>
          <button className="btn">Save payment</button>
        </form>
      )}
    </div>
  );
}
