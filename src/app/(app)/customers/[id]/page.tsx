import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { date, num, usd } from "@/lib/format";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: c } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const [{ data: receipts }, { data: fcl }] = await Promise.all([
    supabase.from("v_receipt_summary").select("*").eq("customer_id", id).order("received_at", { ascending: false }),
    supabase.from("v_container_summary").select("*").eq("fcl_customer_id", id).order("created_at", { ascending: false }),
  ]);
  const lclBalance = (receipts ?? []).reduce((s, r) => s + Number(r.balance_usd), 0);
  const lclCbm = (receipts ?? []).reduce((s, r) => s + Number(r.total_cbm), 0);

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader title={c.name} subtitle={<span className="font-mono">{c.phone}</span>} />
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="LCL receipts" value={receipts?.length ?? 0} />
        <Stat label="LCL volume" value={`${num(lclCbm)} CBM`} />
        <Stat label="FCL containers" value={fcl?.length ?? 0} />
        <Stat label="LCL balance due" value={usd(lclBalance)} />
      </div>
      <Card title="LCL receipts">
        <table className="table">
          <thead><tr><th>Receipt</th><th>Date</th><th>Branch</th><th className="num">Pkgs</th><th className="num">CBM</th><th className="num">Charge</th><th className="num">Balance</th><th>Stage</th></tr></thead>
          <tbody>
            {receipts?.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/receiving/${r.id}`} className="font-mono text-brand-600 hover:underline">{r.receipt_no}</Link></td>
                <td>{date(r.received_at)}</td><td className="font-mono">{r.branch_code}</td>
                <td className="num">{r.total_packages}</td><td className="num">{num(r.total_cbm, 3)}</td>
                <td className="num">{usd(r.total_charge_usd)}</td><td className="num">{usd(r.balance_usd)}</td>
                <td><Badge value={r.stage} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!receipts?.length && <Empty>No LCL shipments</Empty>}
      </Card>
      <Card title="FCL containers">
        <table className="table">
          <thead><tr><th>Container</th><th>Type</th><th>BL</th><th className="num">Freight</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            {fcl?.map((f) => (
              <tr key={f.id}>
                <td><Link href={`/containers/${f.id}`} className="font-mono text-brand-600 hover:underline">{f.container_no}</Link></td>
                <td className="font-mono">{f.type_code}</td><td className="font-mono">{f.bl_no ?? "—"}</td>
                <td className="num">{usd(f.fcl_freight_usd)}</td><td><Badge value={f.status} /></td><td>{date(f.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!fcl?.length && <Empty>No FCL shipments</Empty>}
      </Card>
    </div>
  );
}
