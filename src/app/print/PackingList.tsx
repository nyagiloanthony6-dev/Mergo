import { createClient } from "@/lib/supabase/server";
import { date, num } from "@/lib/format";

type Line = { customer: string; phone: string; ref: string; description: string; hs: string | null; packages: number; pieces: number; cbm: number; kg: number };

/** Packing list rows for one container. LCL lines are grouped by customer/receipt. */
export async function containerLines(containerId: string, mode: string): Promise<Line[]> {
  const supabase = await createClient();
  if (mode === "FCL") {
    const { data: c } = await supabase.from("containers").select("customer:customers(name, phone)").eq("id", containerId).single();
    const cust = (c?.customer ?? {}) as unknown as { name?: string; phone?: string };
    const { data } = await supabase.from("fcl_container_items").select("*").eq("container_id", containerId).order("created_at");
    return (data ?? []).map((i) => ({ customer: cust.name ?? "", phone: cust.phone ?? "", ref: "FCL", description: i.description, hs: i.hs_code, packages: i.packages, pieces: i.pieces, cbm: +i.cbm, kg: +i.weight_kg }));
  }
  const { data } = await supabase
    .from("lcl_receipt_items")
    .select("*, receipt:lcl_receipts(receipt_no, customer:customers(name, phone))")
    .eq("container_id", containerId);
  return (data ?? [])
    .map((i) => ({ customer: i.receipt?.customer?.name ?? "", phone: i.receipt?.customer?.phone ?? "", ref: i.receipt?.receipt_no ?? "", description: i.item_name, hs: i.hs_code, packages: i.packages, pieces: i.pieces, cbm: +i.cbm, kg: +i.weight_kg }))
    .sort((a, b) => a.customer.localeCompare(b.customer) || a.ref.localeCompare(b.ref));
}

export function PackingTable({ lines }: { lines: Line[] }) {
  const t = lines.reduce((s, l) => ({ pk: s.pk + l.packages, pc: s.pc + l.pieces, cbm: s.cbm + l.cbm, kg: s.kg + l.kg }), { pk: 0, pc: 0, cbm: 0, kg: 0 });
  return (
    <table className="w-full border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left">
      <thead>
        <tr><th>#</th><th>Consignee</th><th>Phone</th><th>Ref</th><th>Description</th><th>HS</th><th className="text-right">Pkgs</th><th className="text-right">Pcs</th><th className="text-right">CBM</th><th className="text-right">G.W. kg</th></tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i}>
            <td>{i + 1}</td><td>{l.customer}</td><td>{l.phone}</td><td className="font-mono">{l.ref}</td><td>{l.description}</td><td>{l.hs ?? ""}</td>
            <td className="text-right tabular-nums">{l.packages}</td><td className="text-right tabular-nums">{l.pieces || ""}</td>
            <td className="text-right tabular-nums">{num(l.cbm, 3)}</td><td className="text-right tabular-nums">{num(l.kg)}</td>
          </tr>
        ))}
        <tr className="font-semibold">
          <td colSpan={6} className="text-right">TOTAL</td>
          <td className="text-right tabular-nums">{t.pk}</td><td className="text-right tabular-nums">{t.pc || ""}</td>
          <td className="text-right tabular-nums">{num(t.cbm, 3)}</td><td className="text-right tabular-nums">{num(t.kg)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function ContainerHead({ c }: { c: Record<string, any> }) {
  return (
    <div className="mb-3 grid grid-cols-4 gap-x-6 gap-y-1">
      <div><span className="text-slate-500">Container:</span> <b className="font-mono">{c.container_no}</b></div>
      <div><span className="text-slate-500">Size:</span> {c.type_code}</div>
      <div><span className="text-slate-500">Seal:</span> {c.seal_no ?? "—"}</div>
      <div><span className="text-slate-500">Mode:</span> {c.mode}</div>
      <div><span className="text-slate-500">Origin:</span> {c.branch_name}</div>
      <div><span className="text-slate-500">BL:</span> <span className="font-mono">{c.bl_no ?? "—"}</span></div>
      <div><span className="text-slate-500">Stuffed:</span> {date(c.stuffed_at)}</div>
      <div><span className="text-slate-500">Consignees:</span> {c.customer_count}</div>
    </div>
  );
}
