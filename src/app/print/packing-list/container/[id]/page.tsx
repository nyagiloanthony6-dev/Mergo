import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date } from "@/lib/format";
import { ContainerHead, PackingTable, containerLines } from "../../../PackingList";

export default async function ContainerPackingList({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireProfile();
  const supabase = await createClient();
  const { data: c } = await supabase.from("v_container_summary").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const lines = await containerLines(id, c.mode);
  return (
    <>
      <div className="mb-4 flex items-start justify-between border-b-2 border-ink pb-3">
        <div><div className="text-lg font-bold">{me.company.name}</div><div className="text-slate-500">Port of discharge: Dar es Salaam, Tanzania</div></div>
        <div className="text-right"><div className="text-xl font-bold tracking-wide">PACKING LIST</div><div className="text-slate-500">Printed {date(new Date().toISOString())}</div></div>
      </div>
      <ContainerHead c={c} />
      <PackingTable lines={lines} />
    </>
  );
}
