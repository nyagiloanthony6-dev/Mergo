import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { flashParams, type SP } from "@/lib/flash";
import { date, num, usd } from "@/lib/format";
import { Badge, Card, Empty, Flash, PageHeader, Stat } from "@/components/ui";

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const me = await requireProfile();
  const { error, ok } = await flashParams(searchParams);
  const supabase = await createClient();

  const [waiting, stuffing, transit, atDar, ready, { data: unpaid }, { data: recentContainers }, { data: branchWaiting }] = await Promise.all([
    supabase.from("v_receipt_summary").select("id", { count: "exact", head: true }).in("stage", ["received", "partially_loaded"]),
    supabase.from("containers").select("id", { count: "exact", head: true }).eq("status", "stuffing"),
    supabase.from("containers").select("id", { count: "exact", head: true }).eq("status", "in_transit"),
    supabase.from("containers").select("id", { count: "exact", head: true }).in("status", ["arrived", "under_customs", "cleared"]),
    supabase.from("v_receipt_summary").select("id", { count: "exact", head: true }).eq("stage", "offloaded"),
    supabase.from("v_receipt_summary").select("balance_usd").gt("balance_usd", 0),
    supabase.from("v_container_summary").select("*").not("status", "in", "(offloaded,empty_returned)").order("created_at", { ascending: false }).limit(10),
    supabase.from("v_receipt_summary").select("branch_code, total_cbm, stage").in("stage", ["received", "partially_loaded"]),
  ]);
  const outstanding = (unpaid ?? []).reduce((s, r) => s + Number(r.balance_usd), 0);
  const byBranch = new Map<string, number>();
  for (const r of branchWaiting ?? []) byBranch.set(r.branch_code, (byBranch.get(r.branch_code) ?? 0) + Number(r.total_cbm));

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader title={`Karibu, ${me.full_name?.split(" ")[0] ?? ""}`} subtitle={me.company.name} actions={<><Link href="/receiving/new" className="btn">+ Receive goods</Link><Link href="/containers/new" className="btn-secondary">+ Container</Link></>} />
      <Flash error={error} ok={ok} />
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Receipts awaiting loading" value={waiting.count ?? 0} href="/receiving?stage=received" />
        <Stat label="Containers stuffing" value={stuffing.count ?? 0} href="/containers?status=stuffing" />
        <Stat label="In transit" value={transit.count ?? 0} href="/containers?status=in_transit" />
        <Stat label="At Dar (port / customs)" value={atDar.count ?? 0} href="/warehouse" />
        <Stat label="Ready for release" value={ready.count ?? 0} href="/warehouse" />
        <Stat label="LCL outstanding" value={usd(outstanding)} href="/receiving" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Cargo waiting at origin (CBM)">
          {byBranch.size ? (
            <ul className="space-y-2 text-sm">
              {[...byBranch.entries()].sort((a, b) => b[1] - a[1]).map(([b, cbm]) => (
                <li key={b} className="flex justify-between"><span className="font-mono">{b}</span><span className="tabular-nums">{num(cbm)} CBM</span></li>
              ))}
            </ul>
          ) : <Empty>Nothing waiting</Empty>}
        </Card>
        <Card title="Active containers" className="lg:col-span-2">
          <table className="table">
            <thead><tr><th>Container</th><th>Mode</th><th>Origin</th><th className="num">CBM</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {recentContainers?.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/containers/${c.id}`} className="font-mono text-brand-600 hover:underline">{c.container_no}</Link></td>
                  <td><Badge value={c.mode} label={c.mode} /></td>
                  <td className="font-mono">{c.branch_code}</td>
                  <td className="num">{num(c.total_cbm)} / {num(c.max_cbm, 0)}</td>
                  <td><Badge value={c.status} /></td>
                  <td>{date(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!recentContainers?.length && <Empty>No active containers</Empty>}
        </Card>
      </div>
    </div>
  );
}
