import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { flashParams, type SP } from "@/lib/flash";
import { date, num, tzs, usd } from "@/lib/format";
import { Empty, Flash, PageHeader, Stat } from "@/components/ui";

export default async function Payments({ searchParams }: { searchParams: SP }) {
  const { error, ok, params } = await flashParams(searchParams);
  const from = typeof params.from === "string" && params.from ? params.from : new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const to = typeof params.to === "string" && params.to ? params.to : new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("payments")
    .select("*, customer:customers(name, phone), receipt:lcl_receipts(id, receipt_no), container:containers(id, container_no)")
    .gte("paid_at", from)
    .lt("paid_at", new Date(new Date(to).getTime() + 864e5).toISOString())
    .order("paid_at", { ascending: false })
    .limit(500);
  const sum = (f: (p: any) => boolean) => (rows ?? []).filter(f).reduce((s, p) => s + Number(p.amount_usd), 0);

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader title="Payments" actions={<Link href="/payments/new" className="btn">+ Record payment</Link>} />
      <Flash error={error} ok={ok} />
      <form className="flex flex-wrap items-end gap-2">
        <label><span className="label">From</span><input type="date" name="from" defaultValue={from} className="input" /></label>
        <label><span className="label">To</span><input type="date" name="to" defaultValue={to} className="input" /></label>
        <button className="btn-secondary">Apply</button>
      </form>
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Total (USD equiv.)" value={usd(sum(() => true))} />
        <Stat label="Collected at origin" value={usd(sum((p) => p.side === "origin"))} />
        <Stat label="Collected in Dar" value={usd(sum((p) => p.side === "destination"))} />
        <Stat label="Received in TZS" value={tzs((rows ?? []).filter((p) => p.currency === "TZS").reduce((s, p) => s + Number(p.amount), 0))} />
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>No</th><th>Date</th><th>Customer</th><th>For</th><th>Side</th><th>Method</th><th>Ref</th><th className="num">Amount</th><th className="num">FX</th><th className="num">USD</th></tr></thead>
          <tbody>
            {rows?.map((p) => (
              <tr key={p.id}>
                <td className="font-mono">{p.payment_no}</td>
                <td>{date(p.paid_at)}</td>
                <td>{p.customer?.name}<div className="text-xs text-slate-500">{p.customer?.phone}</div></td>
                <td>
                  {p.receipt ? <Link href={`/receiving/${p.receipt.id}`} className="font-mono text-brand-600 hover:underline">{p.receipt.receipt_no}</Link>
                    : p.container ? <Link href={`/containers/${p.container.id}`} className="font-mono text-brand-600 hover:underline">{p.container.container_no}</Link> : "—"}
                </td>
                <td className="capitalize">{p.side}</td>
                <td>{p.method ?? "—"}</td>
                <td>{p.reference ?? "—"}</td>
                <td className="num">{p.currency === "TZS" ? tzs(p.amount) : usd(p.amount)}</td>
                <td className="num">{p.fx_rate ? num(p.fx_rate) : "—"}</td>
                <td className="num font-medium">{usd(p.amount_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows?.length && <Empty>No payments in this period</Empty>}
      </div>
    </div>
  );
}
