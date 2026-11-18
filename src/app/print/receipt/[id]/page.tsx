import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime, num, usd } from "@/lib/format";

export default async function ReceiptPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireProfile();
  const supabase = await createClient();
  const { data: r } = await supabase.from("v_receipt_summary").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();
  const { data: items } = await supabase.from("lcl_receipt_items").select("*, category:cargo_categories(name)").eq("receipt_id", id).order("created_at");
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-start justify-between border-b-2 border-ink pb-3">
        <div><div className="text-lg font-bold">{me.company.name}</div><div className="text-slate-500">{r.branch_name} warehouse</div></div>
        <div className="text-right"><div className="text-lg font-bold">GOODS RECEIPT</div><div className="font-mono text-base">{r.receipt_no}</div><div className="text-slate-500">{dateTime(r.received_at)}</div></div>
      </div>
      <div className="mb-4"><span className="text-slate-500">Customer:</span> <b>{r.customer_name}</b> · {r.customer_phone}</div>
      <table className="mb-4 w-full border-collapse [&_td]:border-b [&_td]:border-slate-200 [&_td]:py-1 [&_th]:border-b-2 [&_th]:border-slate-400 [&_th]:py-1 [&_th]:text-left">
        <thead><tr><th>Item</th><th className="text-right">Pkgs</th><th className="text-right">CBM</th><th className="text-right">KG</th><th>Charged by</th><th className="text-right">Amount</th></tr></thead>
        <tbody>
          {items?.map((i) => (
            <tr key={i.id}>
              <td>{i.item_name}<div className="text-xs text-slate-500">{i.category?.name}</div></td>
              <td className="text-right">{i.packages}</td><td className="text-right">{num(i.cbm, 3)}</td><td className="text-right">{num(i.weight_kg)}</td>
              <td className="text-xs">{num(i.chargeable_qty, 3)} {i.basis_applied} × {usd(i.rate_usd)}</td>
              <td className="text-right">{usd(i.charge_usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto w-64 space-y-1">
        <div className="flex justify-between"><span>Total</span><b>{usd(r.total_charge_usd)}</b></div>
        <div className="flex justify-between"><span>Paid</span><span>{usd(r.paid_usd)}</span></div>
        <div className="flex justify-between border-t border-slate-300 pt-1"><span>Balance</span><b>{usd(r.balance_usd)}</b></div>
      </div>
      <p className="mt-8 text-xs text-slate-500">Keep this receipt. Track your cargo online with receipt number {r.receipt_no} and your phone number. Charges in USD; TZS accepted at the day&apos;s rate.</p>
      <div className="mt-10 grid grid-cols-2 gap-10 text-xs"><div className="border-t border-slate-400 pt-1">Received by (staff)</div><div className="border-t border-slate-400 pt-1">Customer signature</div></div>
    </div>
  );
}
