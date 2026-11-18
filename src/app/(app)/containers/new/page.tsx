import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { flashParams, type SP } from "@/lib/flash";
import { Field, Flash, PageHeader } from "@/components/ui";
import { createContainer } from "../actions";

export default async function NewContainer({ searchParams }: { searchParams: SP }) {
  const me = await requireProfile();
  const { error, params } = await flashParams(searchParams);
  const supabase = await createClient();
  const [{ data: branches }, { data: types }] = await Promise.all([
    supabase.from("branches").select("id, code, name").eq("active", true).order("code"),
    supabase.from("container_types").select("*").order("sort"),
  ]);
  const mode = params.mode === "FCL" ? "FCL" : "LCL";

  return (
    <div className="max-w-3xl">
      <PageHeader title="New container" subtitle="Create the container when stuffing starts" />
      <Flash error={error} />
      <div className="mb-4 flex gap-2">
        <a href="/containers/new?mode=LCL" className={mode === "LCL" ? "btn" : "btn-secondary"}>LCL consolidation</a>
        <a href="/containers/new?mode=FCL" className={mode === "FCL" ? "btn" : "btn-secondary"}>FCL (whole container)</a>
      </div>
      <form action={createContainer} className="card grid gap-4 p-6 sm:grid-cols-2">
        <input type="hidden" name="mode" value={mode} />
        <Field label="Container number"><input name="container_no" className="input font-mono uppercase" placeholder="CSQU3054383" required /></Field>
        <Field label="Size / type">
          <select name="type_code" className="input" defaultValue="40HQ">
            {types?.map((t) => <option key={t.code} value={t.code}>{t.code} — {t.name}</option>)}
          </select>
        </Field>
        <Field label="Origin branch">
          <select name="branch_id" className="input" defaultValue={me.branch_id ?? undefined}>
            {branches?.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
          </select>
        </Field>
        <Field label="Seal number (can be added later)"><input name="seal_no" className="input" /></Field>
        {mode === "FCL" && (
          <>
            <Field label="Customer phone"><input name="customer_phone" className="input" required placeholder="0754 000 000" /></Field>
            <Field label="Customer name"><input name="customer_name" className="input" required /></Field>
            <Field label="Goods description" className="sm:col-span-2"><input name="fcl_goods_description" className="input" placeholder="e.g. Household furniture" /></Field>
            <Field label="Freight charge (USD)"><input name="fcl_freight_usd" type="number" step="0.01" min="0" className="input" /></Field>
          </>
        )}
        <label className="flex items-center gap-2 text-xs text-slate-500 sm:col-span-2">
          <input type="checkbox" name="skip_check" /> Container number fails the check digit but is correct (rare)
        </label>
        <div className="sm:col-span-2"><button className="btn">Create container</button></div>
      </form>
    </div>
  );
}
