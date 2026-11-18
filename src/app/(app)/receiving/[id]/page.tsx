import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { flashParams, type SP } from "@/lib/flash";
import { date, dateTime, num, tzs, usd } from "@/lib/format";
import { Badge, Card, Field, Flash, PageHeader } from "@/components/ui";
import { addItem, deleteItem } from "../actions";

export default async function ReceiptDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const { error, ok } = await flashParams(searchParams);
  const supabase = await createClient();
  const { data: r } = await supabase.from("v_receipt_summary").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();

  const [{ data: items }, { data: payments }, { data: categories }] = await Promise.all([
    supabase
      .from("lcl_receipt_items")
      .select("*, category:cargo_categories(name), container:containers(id, container_no, status)")
      .eq("receipt_id", id)
      .order("created_at"),
    supabase.from("payments").select("*").eq("receipt_id", id).order("paid_at"),
    supabase.from("cargo_categories").select("id, name").eq("active", true).order("name"),
  ]);
  const editable = !r.release_no;

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        title={`Receipt ${r.receipt_no}`}
        subtitle={<>{r.customer_name} · {r.customer_phone} · {r.branch_name} · {dateTime(r.received_at)}</>}
        actions={
          <>
            <Link href={`/print/receipt/${r.id}`} target="_blank" className="btn-secondary">Print receipt</Link>
            <Link href={`/payments/new?receipt=${r.id}`} className="btn-secondary">Record payment</Link>
            <Link href={`/customers/${r.customer_id}`} className="btn-secondary">Customer</Link>
          </>
        }
      />
      <Flash error={error} ok={ok} />

      <div className="grid gap-4 sm:grid-cols-5">
        <div className="card p-4"><div className="label">Stage</div><Badge value={r.stage} /></div>
        <div className="card p-4"><div className="label">Packages / CBM / KG</div><div className="font-medium tabular-nums">{r.total_packages} · {num(r.total_cbm, 3)} · {num(r.total_kg)}</div></div>
        <div className="card p-4"><div className="label">Charge</div><div className="text-lg font-semibold">{usd(r.total_charge_usd)}</div></div>
        <div className="card p-4"><div className="label">Paid</div><div className="text-lg font-semibold">{usd(r.paid_usd)}</div></div>
        <div className="card p-4"><div className="label">Balance</div><div className={`text-lg font-semibold ${Number(r.balance_usd) > 0 ? "text-red-700" : "text-emerald-700"}`}>{usd(r.balance_usd)}</div></div>
      </div>

      <Card title="Items">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>Item</th><th>Category</th><th className="num">CBM</th><th className="num">KG</th><th className="num">Pcs</th><th className="num">Pkgs</th><th>Charged by</th><th className="num">Charge</th><th>Container</th><th>Dar tally</th><th></th></tr>
            </thead>
            <tbody>
              {items?.map((i) => (
                <tr key={i.id}>
                  <td>{i.item_name}{i.hs_code && <div className="text-xs text-slate-500">HS {i.hs_code}</div>}</td>
                  <td>{i.category?.name}</td>
                  <td className="num">{num(i.cbm, 3)}</td>
                  <td className="num">{num(i.weight_kg)}</td>
                  <td className="num">{i.pieces}</td>
                  <td className="num">{i.packages}</td>
                  <td className="text-xs">{num(i.chargeable_qty, 3)} {i.basis_applied} × {usd(i.rate_usd)}</td>
                  <td className="num font-medium">{usd(i.charge_usd)}</td>
                  <td>{i.container ? <Link href={`/containers/${i.container.id}`} className="font-mono text-brand-600 hover:underline">{i.container.container_no}</Link> : <span className="text-slate-400">awaiting</span>}</td>
                  <td>{i.tally_status !== "pending" ? <><Badge value={i.tally_status} />{i.location && <div className="text-xs text-slate-500">{i.location}</div>}</> : "—"}</td>
                  <td>
                    {editable && !i.container && (
                      <form action={deleteItem}>
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="receipt_id" value={r.id} />
                        <button className="text-xs text-red-600 hover:underline">Delete</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editable && (
          <form action={addItem} className="mt-4 grid grid-cols-2 items-end gap-2 border-t border-slate-100 pt-4 md:grid-cols-9">
            <input type="hidden" name="receipt_id" value={r.id} />
            <Field label="Item name" className="col-span-2"><input name="item_name" className="input" required /></Field>
            <Field label="Category" className="col-span-2">
              <select name="category_id" className="input">{categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </Field>
            <Field label="CBM"><input name="cbm" type="number" step="0.001" min="0" className="input" /></Field>
            <Field label="KG"><input name="weight_kg" type="number" step="0.01" min="0" className="input" /></Field>
            <Field label="Pcs"><input name="pieces" type="number" min="0" className="input" /></Field>
            <Field label="Pkgs"><input name="packages" type="number" min="0" defaultValue="1" className="input" /></Field>
            <button className="btn">Add item</button>
          </form>
        )}
      </Card>

      <Card title="Payments" actions={<Link href={`/payments/new?receipt=${r.id}`} className="text-sm text-brand-600 hover:underline">+ Record payment</Link>}>
        {payments?.length ? (
          <table className="table">
            <thead><tr><th>No</th><th>Date</th><th>Side</th><th>Method</th><th className="num">Amount</th><th className="num">FX</th><th className="num">USD</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono">{p.payment_no}</td><td>{date(p.paid_at)}</td><td className="capitalize">{p.side}</td><td>{p.method ?? "—"}</td>
                  <td className="num">{p.currency === "TZS" ? tzs(p.amount) : usd(p.amount)}</td>
                  <td className="num">{p.fx_rate ? num(p.fx_rate) : "—"}</td>
                  <td className="num">{usd(p.amount_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-sm text-slate-500">No payments yet.</p>}
      </Card>

      {r.release_no && (
        <Card title="Release">
          <p className="text-sm">Release order <span className="font-mono">{r.release_no}</span> issued {dateTime(r.released_at)}{r.delivered_at && <> · delivered {dateTime(r.delivered_at)}</>}</p>
        </Card>
      )}
      {r.notes && <p className="text-sm text-slate-600">Notes: {r.notes}</p>}
    </div>
  );
}
