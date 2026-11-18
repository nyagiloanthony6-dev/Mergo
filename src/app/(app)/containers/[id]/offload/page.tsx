import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { flashParams, type SP } from "@/lib/flash";
import { num } from "@/lib/format";
import { Badge, Flash, PageHeader } from "@/components/ui";
import { saveTally } from "../../actions";

const STATUSES = ["pending", "ok", "short", "damaged", "excess"];

export default async function OffloadTally({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const { error, ok } = await flashParams(searchParams);
  const supabase = await createClient();
  const { data: c } = await supabase.from("containers").select("id, container_no, status, mode").eq("id", id).maybeSingle();
  if (!c || c.mode !== "LCL") notFound();
  const { data: items } = await supabase
    .from("lcl_receipt_items")
    .select("*, receipt:lcl_receipts(receipt_no, customer:customers(name, phone))")
    .eq("container_id", id)
    .order("receipt_id");
  const pending = items?.filter((i) => i.tally_status === "pending").length ?? 0;
  const issues = items?.filter((i) => ["short", "damaged", "excess"].includes(i.tally_status)).length ?? 0;

  return (
    <div className="max-w-7xl">
      <PageHeader
        title={`Offload tally — ${c.container_no}`}
        subtitle={<>Count packages against the packing list as goods come off the container. {pending} pending · {issues} with issues</>}
        actions={<Link href={`/containers/${id}`} className="btn-secondary">Back to container</Link>}
      />
      <Flash error={error} ok={ok} />
      <form action={saveTally} className="card overflow-x-auto">
        <input type="hidden" name="container_id" value={id} />
        <table className="table min-w-[1000px]">
          <thead>
            <tr><th>Receipt</th><th>Customer</th><th>Item</th><th className="num">Shipped pkgs</th><th className="num">CBM</th><th className="w-28">Counted pkgs</th><th className="w-36">Result</th><th className="w-36">Location</th><th>Note</th></tr>
          </thead>
          <tbody>
            {items?.map((i) => (
              <tr key={i.id}>
                <td className="font-mono">{i.receipt?.receipt_no}<input type="hidden" name="item_id" value={i.id} /></td>
                <td>{i.receipt?.customer?.name}<div className="text-xs text-slate-500">{i.receipt?.customer?.phone}</div></td>
                <td>{i.item_name}</td>
                <td className="num font-medium">{i.packages}</td>
                <td className="num">{num(i.cbm, 3)}</td>
                <td><input name={`dar_${i.id}`} type="number" min="0" defaultValue={i.dar_packages ?? ""} className="input text-right" /></td>
                <td>
                  <select name={`status_${i.id}`} defaultValue={i.tally_status} className="input">
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td><input name={`loc_${i.id}`} defaultValue={i.location ?? ""} placeholder="Zone / bay" className="input" /></td>
                <td><input name={`note_${i.id}`} defaultValue={i.tally_note ?? ""} className="input" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-slate-200 p-4">
          <span className="text-xs text-slate-500">Tip: if counted = shipped, choose <Badge value="ok" label="ok" />. When every line is tallied, mark the container as offloaded.</span>
          <button className="btn">Save tally</button>
        </div>
      </form>
    </div>
  );
}
