import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { flashParams, type SP } from "@/lib/flash";
import { date, dateTime, num, STATUS_FLOW, STATUS_LABEL, usd } from "@/lib/format";
import { Badge, CapacityBar, Card, Empty, Field, Flash, PageHeader } from "@/components/ui";
import { Documents } from "@/components/Documents";
import { addFclItem, deleteFclItem, loadItems, setStatus, unloadItem, updateContainer } from "../actions";

export default async function ContainerDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const { error, ok } = await flashParams(searchParams);
  const supabase = await createClient();
  const { data: c } = await supabase.from("v_container_summary").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();

  const isLCL = c.mode === "LCL";
  const stuffing = c.status === "stuffing";
  const flow = STATUS_FLOW[c.mode as "LCL" | "FCL"];
  const cur = flow.findIndex((s) => s.status === c.status);
  const next = flow[cur + 1];
  const prev = flow[cur - 1];

  const [{ data: loaded }, { data: available }, { data: fclItems }, { data: fclBal }] = await Promise.all([
    isLCL
      ? supabase
          .from("lcl_receipt_items")
          .select("*, category:cargo_categories(name), receipt:lcl_receipts(id, receipt_no, customer:customers(name, phone))")
          .eq("container_id", id)
          .order("loaded_at")
      : Promise.resolve({ data: [] as any[] }),
    isLCL && stuffing
      ? supabase
          .from("lcl_receipt_items")
          .select("*, category:cargo_categories(name), receipt:lcl_receipts!inner(id, receipt_no, branch_id, received_at, customer:customers(name))")
          .is("container_id", null)
          .eq("receipt.branch_id", c.branch_id)
          .order("created_at")
          .limit(500)
      : Promise.resolve({ data: [] as any[] }),
    !isLCL ? supabase.from("fcl_container_items").select("*").eq("container_id", id).order("created_at") : Promise.resolve({ data: [] as any[] }),
    !isLCL ? supabase.from("v_fcl_balance").select("*").eq("container_id", id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader
        title={c.container_no}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge value={c.mode} label={c.mode} /> {c.type_name} · from {c.branch_name} ·
            BL {c.bl_no ? <Link href={`/bls/${c.bl_id}`} className="font-mono text-brand-600 hover:underline">{c.bl_no}</Link> : <span className="text-amber-700">not assigned</span>}
            {c.mode === "FCL" && <> · {c.fcl_customer_name} ({c.fcl_customer_phone})</>}
          </span>
        }
        actions={
          <>
            <Link href={`/print/packing-list/container/${c.id}`} target="_blank" className="btn-secondary">Packing list</Link>
            {isLCL && cur >= flow.findIndex((s) => s.status === "arrived") && <Link href={`/containers/${c.id}/offload`} className="btn-secondary">Offload tally</Link>}
            {!isLCL && <Link href={`/payments/new?container=${c.id}`} className="btn-secondary">Record payment</Link>}
          </>
        }
      />
      <Flash error={error} ok={ok} />

      {/* Status stepper */}
      <Card>
        <ol className="mb-4 flex flex-wrap gap-y-2 text-xs">
          {flow.map((s, i) => {
            const ts = s.column ? (c as Record<string, string | null>)[s.column] : c.created_at;
            return (
              <li key={s.status} className="flex items-center">
                <div className={`rounded px-2 py-1 ${i < cur ? "bg-brand-100 text-brand-700" : i === cur ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                  <div className="font-medium">{STATUS_LABEL[s.status]}</div>
                  <div className="opacity-75">{i <= cur ? date(ts) : "—"}</div>
                </div>
                {i < flow.length - 1 && <span className="mx-1 text-slate-300">→</span>}
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap gap-2">
          {next && (
            <form action={setStatus}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="status" value={next.status} />
              <input type="hidden" name="direction" value="forward" />
              <button className="btn">Mark as {STATUS_LABEL[next.status]}</button>
            </form>
          )}
          {prev && (
            <form action={setStatus}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="status" value={prev.status} />
              <input type="hidden" name="direction" value="back" />
              <button className="btn-secondary">Undo: back to {STATUS_LABEL[prev.status]}</button>
            </form>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Load" className="lg:col-span-1">
          <div className="space-y-4">
            <CapacityBar used={Number(c.total_cbm)} max={Number(c.max_cbm)} unit="CBM" />
            <CapacityBar used={Number(c.total_kg)} max={Number(c.max_kg)} unit="kg" />
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div><div className="label">Packages</div><div className="font-semibold">{c.total_packages}</div></div>
              <div><div className="label">Lines</div><div className="font-semibold">{c.item_count}</div></div>
              <div><div className="label">Customers</div><div className="font-semibold">{c.customer_count}</div></div>
            </div>
          </div>
        </Card>
        <Card title="Details" className="lg:col-span-2">
          <form action={updateContainer} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={c.id} />
            <Field label="Seal number"><input name="seal_no" defaultValue={c.seal_no ?? ""} className="input" /></Field>
            {!isLCL && (
              <>
                <Field label="Freight charge (USD)"><input name="fcl_freight_usd" type="number" step="0.01" defaultValue={c.fcl_freight_usd ?? ""} className="input" /></Field>
                <Field label="Goods description" className="sm:col-span-2"><input name="fcl_goods_description" defaultValue={c.fcl_goods_description ?? ""} className="input" /></Field>
              </>
            )}
            <Field label="Notes" className="sm:col-span-2"><input name="notes" defaultValue={c.notes ?? ""} className="input" /></Field>
            <div className="flex items-center justify-between sm:col-span-2">
              {!isLCL && fclBal ? (
                <span className="text-sm">Charge {usd(fclBal.charge_usd)} · Paid {usd(fclBal.paid_usd)} · <span className={Number(fclBal.balance_usd) > 0 ? "font-semibold text-red-700" : "font-semibold text-emerald-700"}>Balance {usd(fclBal.balance_usd)}</span></span>
              ) : <span />}
              <button className="btn-secondary">Save details</button>
            </div>
          </form>
        </Card>
      </div>

      {isLCL ? (
        <>
          <Card title={`Loaded goods (${loaded?.length ?? 0})`}>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Receipt</th><th>Customer</th><th>Item</th><th>Category</th><th className="num">Pkgs</th><th className="num">CBM</th><th className="num">KG</th><th>Loaded</th><th></th></tr></thead>
                <tbody>
                  {loaded?.map((i) => (
                    <tr key={i.id}>
                      <td><Link href={`/receiving/${i.receipt.id}`} className="font-mono text-brand-600 hover:underline">{i.receipt.receipt_no}</Link></td>
                      <td>{i.receipt.customer?.name}</td>
                      <td>{i.item_name}</td>
                      <td>{i.category?.name}</td>
                      <td className="num">{i.packages}</td>
                      <td className="num">{num(i.cbm, 3)}</td>
                      <td className="num">{num(i.weight_kg)}</td>
                      <td className="text-xs">{dateTime(i.loaded_at)}</td>
                      <td>
                        {stuffing && (
                          <form action={unloadItem}>
                            <input type="hidden" name="container_id" value={c.id} />
                            <input type="hidden" name="item_id" value={i.id} />
                            <button className="text-xs text-red-600 hover:underline">Remove</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loaded?.length && <Empty>Nothing loaded yet</Empty>}
            </div>
          </Card>

          {stuffing && (
            <Card title={`Waiting at ${c.branch_code} warehouse (${available?.length ?? 0})`}>
              {available?.length ? (
                <form action={loadItems}>
                  <input type="hidden" name="container_id" value={c.id} />
                  <div className="max-h-[480px] overflow-auto">
                    <table className="table">
                      <thead><tr><th className="w-8"></th><th>Receipt</th><th>Received</th><th>Customer</th><th>Item</th><th className="num">Pkgs</th><th className="num">CBM</th><th className="num">KG</th></tr></thead>
                      <tbody>
                        {available.map((i) => (
                          <tr key={i.id} className="hover:bg-slate-50">
                            <td><input type="checkbox" name="item_id" value={i.id} /></td>
                            <td className="font-mono">{i.receipt.receipt_no}</td>
                            <td>{date(i.receipt.received_at)}</td>
                            <td>{i.receipt.customer?.name}</td>
                            <td>{i.item_name} <span className="text-xs text-slate-500">· {i.category?.name}</span></td>
                            <td className="num">{i.packages}</td>
                            <td className="num">{num(i.cbm, 3)}</td>
                            <td className="num">{num(i.weight_kg)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex justify-end"><button className="btn">Load selected into {c.container_no}</button></div>
                </form>
              ) : <Empty>No goods waiting at this branch</Empty>}
            </Card>
          )}
        </>
      ) : (
        <Card title="FCL packing details">
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Description</th><th>HS code</th><th className="num">Pkgs</th><th className="num">Pcs</th><th className="num">CBM</th><th className="num">KG</th><th></th></tr></thead>
              <tbody>
                {fclItems?.map((i) => (
                  <tr key={i.id}>
                    <td>{i.description}</td><td>{i.hs_code ?? "—"}</td>
                    <td className="num">{i.packages}</td><td className="num">{i.pieces}</td>
                    <td className="num">{num(i.cbm, 3)}</td><td className="num">{num(i.weight_kg)}</td>
                    <td>
                      {["stuffing", "stuffed"].includes(c.status) && (
                        <form action={deleteFclItem}>
                          <input type="hidden" name="container_id" value={c.id} />
                          <input type="hidden" name="item_id" value={i.id} />
                          <button className="text-xs text-red-600 hover:underline">Delete</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!fclItems?.length && <Empty>Add the goods stuffed into this container</Empty>}
          </div>
          {["stuffing", "stuffed"].includes(c.status) && (
            <form action={addFclItem} className="mt-4 grid grid-cols-2 items-end gap-2 border-t border-slate-100 pt-4 md:grid-cols-8">
              <input type="hidden" name="container_id" value={c.id} />
              <Field label="Description" className="col-span-2"><input name="description" className="input" required /></Field>
              <Field label="HS code"><input name="hs_code" className="input" /></Field>
              <Field label="Pkgs"><input name="packages" type="number" min="0" className="input" /></Field>
              <Field label="Pcs"><input name="pieces" type="number" min="0" className="input" /></Field>
              <Field label="CBM"><input name="cbm" type="number" step="0.001" min="0" className="input" /></Field>
              <Field label="KG"><input name="weight_kg" type="number" step="0.01" min="0" className="input" /></Field>
              <button className="btn">Add line</button>
            </form>
          )}
        </Card>
      )}

      <Documents containerId={c.id} packingListHref={`/print/packing-list/container/${c.id}`} />
    </div>
  );
}
