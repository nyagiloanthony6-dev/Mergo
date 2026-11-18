import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { flashParams, safeQ, type SP } from "@/lib/flash";
import { date } from "@/lib/format";
import { Card, Empty, Field, Flash, PageHeader } from "@/components/ui";
import { createBl } from "./actions";

export default async function BlList({ searchParams }: { searchParams: SP }) {
  const { error, ok, params } = await flashParams(searchParams);
  const q = typeof params.q === "string" ? safeQ(params.q) : "";
  const supabase = await createClient();
  let query = supabase.from("bills_of_lading").select("*, containers(id, mode, status)").order("created_at", { ascending: false }).limit(200);
  if (q) query = query.or(`bl_no.ilike.%${q}%,vessel.ilike.%${q}%`);
  const { data: bls } = await query;

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader title="Bills of lading" subtitle="One master BL can cover many containers. Documentation assigns containers after stuffing." />
      <Flash error={error} ok={ok} />
      <Card title="New BL">
        <form action={createBl} className="grid grid-cols-2 items-end gap-2 md:grid-cols-8">
          <Field label="BL number" className="col-span-2"><input name="bl_no" className="input font-mono uppercase" required /></Field>
          <Field label="Shipping line"><input name="shipping_line" className="input" /></Field>
          <Field label="Vessel"><input name="vessel" className="input" /></Field>
          <Field label="Voyage"><input name="voyage" className="input" /></Field>
          <Field label="Port of loading"><input name="port_of_loading" className="input" placeholder="Nansha" /></Field>
          <Field label="ETD"><input name="etd" type="date" className="input" /></Field>
          <Field label="ETA Dar"><input name="eta" type="date" className="input" /></Field>
          <div className="col-span-2 md:col-span-8 flex justify-end"><button className="btn">Create BL</button></div>
        </form>
      </Card>
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="BL number or vessel" className="input max-w-xs" />
        <button className="btn-secondary">Search</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>BL</th><th>Shipping line</th><th>Vessel / voyage</th><th>POL</th><th>ETD</th><th>ETA</th><th className="num">Containers</th><th className="num">LCL / FCL</th></tr></thead>
          <tbody>
            {bls?.map((b) => {
              const cs = (b.containers ?? []) as { mode: string }[];
              return (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td><Link href={`/bls/${b.id}`} className="font-mono font-medium text-brand-600 hover:underline">{b.bl_no}</Link></td>
                  <td>{b.shipping_line ?? "—"}</td>
                  <td>{[b.vessel, b.voyage].filter(Boolean).join(" / ") || "—"}</td>
                  <td>{b.port_of_loading ?? "—"}</td>
                  <td>{date(b.etd)}</td>
                  <td>{date(b.eta)}</td>
                  <td className="num">{cs.length}</td>
                  <td className="num">{cs.filter((c) => c.mode === "LCL").length} / {cs.filter((c) => c.mode === "FCL").length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!bls?.length && <Empty>No BLs yet</Empty>}
      </div>
    </div>
  );
}
