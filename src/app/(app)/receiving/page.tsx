import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { flashParams, safeQ, type SP } from "@/lib/flash";
import { date, num, STATUS_LABEL, usd } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";

const STAGES = ["received", "partially_loaded", "loaded", "in_transit", "arrived", "under_customs", "cleared", "offloaded", "released", "delivered"];

export default async function ReceivingList({ searchParams }: { searchParams: SP }) {
  const { error, ok, params } = await flashParams(searchParams);
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const stage = typeof params.stage === "string" ? params.stage : "";
  const branch = typeof params.branch === "string" ? params.branch : "";
  const supabase = await createClient();

  let query = supabase.from("v_receipt_summary").select("*").order("received_at", { ascending: false }).limit(200);
  if (q) { const s = safeQ(q); query = query.or(`receipt_no.ilike.%${s}%,customer_name.ilike.%${s}%,customer_phone.ilike.%${s.replace(/\D/g, "") || s}%`); }
  if (stage) query = query.eq("stage", stage);
  if (branch) query = query.eq("branch_id", branch);
  const [{ data: rows }, { data: branches }] = await Promise.all([query, supabase.from("branches").select("id, code").order("code")]);

  return (
    <div className="max-w-7xl">
      <PageHeader title="LCL receiving" subtitle="Goods received at origin warehouses" actions={<Link href="/receiving/new" className="btn">+ Receive goods</Link>} />
      <Flash error={error} ok={ok} />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Receipt no, customer or phone" className="input max-w-xs" />
        <select name="branch" defaultValue={branch} className="input max-w-40">
          <option value="">All branches</option>
          {branches?.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
        </select>
        <select name="stage" defaultValue={stage} className="input max-w-48">
          <option value="">All stages</option>
          {STAGES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <button className="btn-secondary">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Branch</th><th className="num">Pkgs</th><th className="num">CBM</th><th className="num">KG</th><th className="num">Charge</th><th className="num">Balance</th><th>Stage</th></tr>
          </thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td><Link href={`/receiving/${r.id}`} className="font-mono font-medium text-brand-600 hover:underline">{r.receipt_no}</Link></td>
                <td>{date(r.received_at)}</td>
                <td>{r.customer_name}<div className="text-xs text-slate-500">{r.customer_phone}</div></td>
                <td className="font-mono">{r.branch_code}</td>
                <td className="num">{r.total_packages}</td>
                <td className="num">{num(r.total_cbm, 3)}</td>
                <td className="num">{num(r.total_kg)}</td>
                <td className="num">{usd(r.total_charge_usd)}</td>
                <td className={`num ${Number(r.balance_usd) > 0 ? "text-red-700" : "text-emerald-700"}`}>{usd(r.balance_usd)}</td>
                <td><Badge value={r.stage} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows?.length && <Empty>No receipts found</Empty>}
      </div>
    </div>
  );
}
