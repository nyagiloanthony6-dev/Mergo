import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { flashParams, safeQ, type SP } from "@/lib/flash";
import { CONTAINER_STATUSES, date, num, STATUS_LABEL } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";

export default async function ContainersList({ searchParams }: { searchParams: SP }) {
  const { error, ok, params } = await flashParams(searchParams);
  const q = typeof params.q === "string" ? safeQ(params.q) : "";
  const status = typeof params.status === "string" ? params.status : "";
  const mode = typeof params.mode === "string" ? params.mode : "";
  const supabase = await createClient();
  let query = supabase.from("v_container_summary").select("*").order("created_at", { ascending: false }).limit(200);
  if (q) query = query.or(`container_no.ilike.%${q}%,bl_no.ilike.%${q}%,fcl_customer_name.ilike.%${q}%`);
  if (status) query = query.eq("status", status);
  else if (!q) query = query.not("status", "in", "(offloaded,empty_returned)");
  if (mode) query = query.eq("mode", mode);
  const { data: rows } = await query;

  return (
    <div className="max-w-7xl">
      <PageHeader title="Containers" subtitle="LCL consolidation and FCL containers" actions={<Link href="/containers/new" className="btn">+ New container</Link>} />
      <Flash error={error} ok={ok} />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Container, BL or FCL customer" className="input max-w-xs" />
        <select name="mode" defaultValue={mode} className="input max-w-32"><option value="">LCL + FCL</option><option>LCL</option><option>FCL</option></select>
        <select name="status" defaultValue={status} className="input max-w-48">
          <option value="">Active (not closed)</option>
          {CONTAINER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <button className="btn-secondary">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Container</th><th>Mode</th><th>Type</th><th>Origin</th><th>BL</th><th>Customer(s)</th><th className="num">Pkgs</th><th className="num">CBM</th><th className="num">KG</th><th>Status</th><th>Created</th></tr>
          </thead>
          <tbody>
            {rows?.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td><Link href={`/containers/${c.id}`} className="font-mono font-medium text-brand-600 hover:underline">{c.container_no}</Link></td>
                <td><Badge value={c.mode} label={c.mode} /></td>
                <td className="font-mono">{c.type_code}</td>
                <td className="font-mono">{c.branch_code}</td>
                <td className="font-mono">{c.bl_no ?? <span className="text-slate-400">—</span>}</td>
                <td>{c.mode === "FCL" ? c.fcl_customer_name : `${c.customer_count} customers`}</td>
                <td className="num">{c.total_packages}</td>
                <td className="num">{num(c.total_cbm, 2)}<span className="text-xs text-slate-400"> / {num(c.max_cbm, 0)}</span></td>
                <td className="num">{num(c.total_kg, 0)}</td>
                <td><Badge value={c.status} /></td>
                <td>{date(c.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows?.length && <Empty>No containers</Empty>}
      </div>
    </div>
  );
}
