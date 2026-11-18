import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { flashParams, type SP } from "@/lib/flash";
import { num } from "@/lib/format";
import { Badge, Card, Empty, Field, Flash, PageHeader } from "@/components/ui";
import { Documents } from "@/components/Documents";
import { assignContainers, removeContainer, updateBl } from "../actions";

export default async function BlDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const { error, ok } = await flashParams(searchParams);
  const supabase = await createClient();
  const { data: bl } = await supabase.from("bills_of_lading").select("*").eq("id", id).maybeSingle();
  if (!bl) notFound();
  const [{ data: containers }, { data: unassigned }] = await Promise.all([
    supabase.from("v_container_summary").select("*").eq("bl_id", id).order("container_no"),
    supabase.from("v_container_summary").select("*").is("bl_id", null).in("status", ["stuffing", "stuffed"]).order("created_at"),
  ]);
  const tot = (containers ?? []).reduce(
    (t, c) => ({ cbm: t.cbm + Number(c.total_cbm), kg: t.kg + Number(c.total_kg), pk: t.pk + Number(c.total_packages) }),
    { cbm: 0, kg: 0, pk: 0 },
  );

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader
        title={`BL ${bl.bl_no}`}
        subtitle={<>{containers?.length ?? 0} containers · {tot.pk} packages · {num(tot.cbm)} CBM · {num(tot.kg, 0)} kg</>}
        actions={<Link href={`/print/packing-list/bl/${bl.id}`} target="_blank" className="btn-secondary">Combined packing list</Link>}
      />
      <Flash error={error} ok={ok} />

      <Card title="BL details">
        <form action={updateBl} className="grid grid-cols-2 items-end gap-2 md:grid-cols-5">
          <input type="hidden" name="id" value={bl.id} />
          <Field label="BL number"><input name="bl_no" defaultValue={bl.bl_no} className="input font-mono uppercase" required /></Field>
          <Field label="Shipping line"><input name="shipping_line" defaultValue={bl.shipping_line ?? ""} className="input" /></Field>
          <Field label="Vessel"><input name="vessel" defaultValue={bl.vessel ?? ""} className="input" /></Field>
          <Field label="Voyage"><input name="voyage" defaultValue={bl.voyage ?? ""} className="input" /></Field>
          <Field label="Port of loading"><input name="port_of_loading" defaultValue={bl.port_of_loading ?? ""} className="input" /></Field>
          <Field label="Port of discharge"><input name="port_of_discharge" defaultValue={bl.port_of_discharge} className="input" /></Field>
          <Field label="ETD"><input name="etd" type="date" defaultValue={bl.etd ?? ""} className="input" /></Field>
          <Field label="ETA"><input name="eta" type="date" defaultValue={bl.eta ?? ""} className="input" /></Field>
          <Field label="Notes"><input name="notes" defaultValue={bl.notes ?? ""} className="input" /></Field>
          <button className="btn-secondary">Save</button>
        </form>
      </Card>

      <Card title="Containers on this BL">
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Container</th><th>Mode</th><th>Type</th><th>Origin</th><th>Seal</th><th className="num">Pkgs</th><th className="num">CBM</th><th className="num">KG</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {containers?.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/containers/${c.id}`} className="font-mono text-brand-600 hover:underline">{c.container_no}</Link></td>
                  <td><Badge value={c.mode} label={c.mode} /></td>
                  <td className="font-mono">{c.type_code}</td>
                  <td className="font-mono">{c.branch_code}</td>
                  <td>{c.seal_no ?? <span className="text-amber-700">missing</span>}</td>
                  <td className="num">{c.total_packages}</td>
                  <td className="num">{num(c.total_cbm)}</td>
                  <td className="num">{num(c.total_kg, 0)}</td>
                  <td><Badge value={c.status} /></td>
                  <td>
                    {["stuffing", "stuffed"].includes(c.status) && (
                      <form action={removeContainer}>
                        <input type="hidden" name="bl_id" value={bl.id} />
                        <input type="hidden" name="container_id" value={c.id} />
                        <button className="text-xs text-red-600 hover:underline">Remove</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!containers?.length && <Empty>No containers assigned yet</Empty>}
        </div>
      </Card>

      <Card title={`Assign containers (${unassigned?.length ?? 0} without a BL)`}>
        {unassigned?.length ? (
          <form action={assignContainers}>
            <input type="hidden" name="bl_id" value={bl.id} />
            <div className="max-h-96 overflow-auto">
              <table className="table">
                <thead><tr><th className="w-8"></th><th>Container</th><th>Mode</th><th>Type</th><th>Origin</th><th className="num">CBM</th><th>Status</th></tr></thead>
                <tbody>
                  {unassigned.map((c) => (
                    <tr key={c.id}>
                      <td><input type="checkbox" name="container_id" value={c.id} /></td>
                      <td className="font-mono">{c.container_no}</td>
                      <td>{c.mode}</td>
                      <td className="font-mono">{c.type_code}</td>
                      <td className="font-mono">{c.branch_code}</td>
                      <td className="num">{num(c.total_cbm)}</td>
                      <td><Badge value={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-end"><button className="btn">Assign selected to {bl.bl_no}</button></div>
          </form>
        ) : <Empty>All stuffed containers already have a BL</Empty>}
      </Card>

      <Documents blId={bl.id} packingListHref={`/print/packing-list/bl/${bl.id}`} />
    </div>
  );
}
