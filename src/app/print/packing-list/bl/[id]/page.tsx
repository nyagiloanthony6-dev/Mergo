import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, num } from "@/lib/format";
import { ContainerHead, PackingTable, containerLines } from "../../../PackingList";

export default async function BlPackingList({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireProfile();
  const supabase = await createClient();
  const { data: bl } = await supabase.from("bills_of_lading").select("*").eq("id", id).maybeSingle();
  if (!bl) notFound();
  const { data: containers } = await supabase.from("v_container_summary").select("*").eq("bl_id", id).order("container_no");
  const sections = await Promise.all((containers ?? []).map(async (c) => ({ c, lines: await containerLines(c.id, c.mode) })));
  const tot = (containers ?? []).reduce((s, c) => ({ pk: s.pk + +c.total_packages, cbm: s.cbm + +c.total_cbm, kg: s.kg + +c.total_kg }), { pk: 0, cbm: 0, kg: 0 });

  return (
    <>
      <div className="mb-4 flex items-start justify-between border-b-2 border-ink pb-3">
        <div><div className="text-lg font-bold">{me.company.name}</div><div className="text-slate-500">Combined packing list for customs</div></div>
        <div className="text-right"><div className="text-xl font-bold tracking-wide">PACKING LIST</div><div className="font-mono">BL {bl.bl_no}</div></div>
      </div>
      <div className="mb-6 grid grid-cols-4 gap-x-6 gap-y-1">
        <div><span className="text-slate-500">Shipping line:</span> {bl.shipping_line ?? "—"}</div>
        <div><span className="text-slate-500">Vessel/voyage:</span> {[bl.vessel, bl.voyage].filter(Boolean).join(" / ") || "—"}</div>
        <div><span className="text-slate-500">POL:</span> {bl.port_of_loading ?? "—"}</div>
        <div><span className="text-slate-500">POD:</span> {bl.port_of_discharge}</div>
        <div><span className="text-slate-500">ETD:</span> {date(bl.etd)}</div>
        <div><span className="text-slate-500">ETA:</span> {date(bl.eta)}</div>
        <div><span className="text-slate-500">Containers:</span> {containers?.length ?? 0}</div>
        <div><span className="text-slate-500">Totals:</span> {tot.pk} pkgs · {num(tot.cbm, 3)} CBM · {num(tot.kg)} kg</div>
      </div>
      {sections.map(({ c, lines }) => (
        <section key={c.id} className="mb-8 break-inside-avoid-page">
          <ContainerHead c={c} />
          <PackingTable lines={lines} />
        </section>
      ))}
    </>
  );
}
