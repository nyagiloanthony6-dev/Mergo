import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime, num } from "@/lib/format";

export default async function ReleasePrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireProfile();
  const supabase = await createClient();
  const { data: ro } = await supabase.from("release_orders").select("*").eq("id", id).maybeSingle();
  if (!ro) notFound();
  const [{ data: r }, { data: items }] = await Promise.all([
    supabase.from("v_receipt_summary").select("*").eq("id", ro.receipt_id).single(),
    supabase.from("lcl_receipt_items").select("*, container:containers(container_no)").eq("receipt_id", ro.receipt_id).order("created_at"),
  ]);
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-start justify-between border-b-2 border-ink pb-3">
        <div><div className="text-lg font-bold">{me.company.name}</div><div className="text-slate-500">Dar es Salaam warehouse</div></div>
        <div className="text-right"><div className="text-lg font-bold">RELEASE ORDER</div><div className="font-mono text-base">{ro.release_no}</div><div className="text-slate-500">{dateTime(ro.released_at)}</div></div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <div><span className="text-slate-500">Customer:</span> <b>{r?.customer_name}</b> · {r?.customer_phone}</div>
        <div><span className="text-slate-500">Receipt:</span> <span className="font-mono">{r?.receipt_no}</span></div>
        <div><span className="text-slate-500">Method:</span> {ro.delivery_method === "delivery" ? "Delivery" : "Customer collection"}</div>
        <div><span className="text-slate-500">{ro.delivery_method === "delivery" ? "Driver" : "Collected by"}:</span> {ro.collected_by ?? "—"}</div>
        {ro.delivery_address && <div className="col-span-2"><span className="text-slate-500">Address:</span> {ro.delivery_address}</div>}
      </div>
      <table className="mb-6 w-full border-collapse [&_td]:border-b [&_td]:border-slate-200 [&_td]:py-1 [&_th]:border-b-2 [&_th]:border-slate-400 [&_th]:py-1 [&_th]:text-left">
        <thead><tr><th>Item</th><th>Container</th><th>Location</th><th className="text-right">Pkgs</th><th className="text-right">CBM</th><th>Released ✓</th></tr></thead>
        <tbody>
          {items?.map((i) => (
            <tr key={i.id}><td>{i.item_name}</td><td className="font-mono">{i.container?.container_no}</td><td>{i.location ?? ""}</td><td className="text-right">{i.dar_packages ?? i.packages}</td><td className="text-right">{num(i.cbm, 3)}</td><td></td></tr>
          ))}
        </tbody>
      </table>
      {ro.notes && <p className="mb-4 text-xs">{ro.notes}</p>}
      <div className="mt-10 grid grid-cols-3 gap-8 text-xs">
        <div className="border-t border-slate-400 pt-1">Released by (storekeeper)</div>
        <div className="border-t border-slate-400 pt-1">Gate / security</div>
        <div className="border-t border-slate-400 pt-1">Received by (customer/driver)</div>
      </div>
    </div>
  );
}
