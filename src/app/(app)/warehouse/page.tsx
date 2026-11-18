import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { flashParams, safeQ, type SP } from "@/lib/flash";
import { date, dateTime, num, usd } from "@/lib/format";
import { Badge, Card, Empty, Flash, PageHeader } from "@/components/ui";
import { markDelivered, releaseReceipt } from "./actions";

export default async function Warehouse({ searchParams }: { searchParams: SP }) {
  const me = await requireProfile();
  const { error, ok, params } = await flashParams(searchParams);
  const q = typeof params.q === "string" ? safeQ(params.q) : "";
  const supabase = await createClient();

  let ready = supabase.from("v_receipt_summary").select("*").eq("stage", "offloaded").order("received_at").limit(300);
  if (q) ready = ready.or(`receipt_no.ilike.%${q}%,customer_name.ilike.%${q}%,customer_phone.ilike.%${q.replace(/\D/g, "") || q}%`);

  const [{ data: inbound }, { data: readyRows }, { data: outForDelivery }] = await Promise.all([
    supabase.from("v_container_summary").select("*").in("status", ["in_transit", "arrived", "under_customs", "cleared"]).order("arrived_at", { nullsFirst: false }),
    ready,
    supabase
      .from("release_orders")
      .select("*, receipt:lcl_receipts(receipt_no, customer:customers(name, phone))")
      .eq("delivery_method", "delivery")
      .is("delivered_at", null)
      .order("released_at"),
  ]);

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader title="Dar warehouse" subtitle="Arrivals, clearance, offloading, release and delivery" />
      <Flash error={error} ok={ok} />

      <Card title={`Inbound containers (${inbound?.length ?? 0})`}>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Container</th><th>Mode</th><th>BL</th><th>Customer(s)</th><th className="num">Pkgs</th><th>Status</th><th>Arrived</th><th></th></tr></thead>
            <tbody>
              {inbound?.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/containers/${c.id}`} className="font-mono text-brand-600 hover:underline">{c.container_no}</Link></td>
                  <td><Badge value={c.mode} label={c.mode} /></td>
                  <td className="font-mono">{c.bl_no ?? "—"}</td>
                  <td>{c.mode === "FCL" ? c.fcl_customer_name : `${c.customer_count} customers`}</td>
                  <td className="num">{c.total_packages}</td>
                  <td><Badge value={c.status} /></td>
                  <td>{date(c.arrived_at)}</td>
                  <td>{c.mode === "LCL" && ["arrived", "under_customs", "cleared"].includes(c.status) && <Link href={`/containers/${c.id}/offload`} className="text-xs text-brand-600 hover:underline">Offload tally</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!inbound?.length && <Empty>No inbound containers</Empty>}
        </div>
      </Card>

      <Card title={`Ready for release (${readyRows?.length ?? 0})`}>
        <form className="mb-3 flex gap-2">
          <input name="q" defaultValue={q} placeholder="Receipt, customer or phone" className="input max-w-xs" />
          <button className="btn-secondary">Search</button>
        </form>
        <div className="overflow-x-auto">
          <table className="table min-w-[1000px]">
            <thead><tr><th>Receipt</th><th>Customer</th><th className="num">Pkgs</th><th className="num">CBM</th><th className="num">Balance</th><th>Release</th></tr></thead>
            <tbody>
              {readyRows?.map((r) => {
                const owes = Number(r.balance_usd) > 0.009;
                return (
                  <tr key={r.id}>
                    <td><Link href={`/receiving/${r.id}`} className="font-mono text-brand-600 hover:underline">{r.receipt_no}</Link></td>
                    <td>{r.customer_name}<div className="text-xs text-slate-500">{r.customer_phone}</div></td>
                    <td className="num">{r.total_packages}</td>
                    <td className="num">{num(r.total_cbm, 3)}</td>
                    <td className={`num ${owes ? "font-semibold text-red-700" : "text-emerald-700"}`}>
                      {usd(r.balance_usd)}
                      {owes && <div><Link href={`/payments/new?receipt=${r.id}`} className="text-xs font-normal text-brand-600 hover:underline">Record payment</Link></div>}
                    </td>
                    <td>
                      <form action={releaseReceipt} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="receipt_id" value={r.id} />
                        <select name="delivery_method" className="input w-32"><option value="collect">Collect</option><option value="delivery">Delivery</option></select>
                        <input name="collected_by" placeholder="Collected by / driver" className="input w-40" />
                        <input name="delivery_address" placeholder="Delivery address" className="input w-44" />
                        {owes && me.role === "admin" && <label className="text-xs"><input type="checkbox" name="override" /> override</label>}
                        <button className="btn" disabled={owes && me.role !== "admin"}>Release</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!readyRows?.length && <Empty>Nothing waiting for release</Empty>}
        </div>
      </Card>

      <Card title={`Out for delivery (${outForDelivery?.length ?? 0})`}>
        <table className="table">
          <thead><tr><th>Release</th><th>Receipt</th><th>Customer</th><th>Address</th><th>Released</th><th></th></tr></thead>
          <tbody>
            {outForDelivery?.map((o) => (
              <tr key={o.id}>
                <td><Link href={`/print/release/${o.id}`} target="_blank" className="font-mono text-brand-600 hover:underline">{o.release_no}</Link></td>
                <td className="font-mono">{o.receipt?.receipt_no}</td>
                <td>{o.receipt?.customer?.name}<div className="text-xs text-slate-500">{o.receipt?.customer?.phone}</div></td>
                <td>{o.delivery_address ?? "—"}</td>
                <td>{dateTime(o.released_at)}</td>
                <td>
                  <form action={markDelivered}>
                    <input type="hidden" name="id" value={o.id} />
                    <button className="btn-secondary">Mark delivered</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!outForDelivery?.length && <Empty>No pending deliveries</Empty>}
      </Card>
    </div>
  );
}
