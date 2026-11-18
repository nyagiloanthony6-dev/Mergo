import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { flashParams, type SP } from "@/lib/flash";
import { date, dateTime, num, tzs, usd } from "@/lib/format";
import { Card, Empty, Field, Flash, PageHeader } from "@/components/ui";
import { addBranch, addCategory, addFx, addRate, addStaff, toggleBranch, updateCompany, updateStaff } from "./actions";

const ROLES = ["admin", "origin", "documentation", "warehouse", "finance"];

export default async function SettingsPage({ searchParams }: { searchParams: SP }) {
  const me = await requireProfile();
  const { error, ok } = await flashParams(searchParams);
  const supabase = await createClient();
  const isAdmin = me.role === "admin";

  const [{ data: branches }, { data: categories }, { data: rates }, { data: fx }, { data: staff }, { data: types }] =
    await Promise.all([
      supabase.from("branches").select("*").order("code"),
      supabase.from("cargo_categories").select("*").order("name"),
      supabase
        .from("category_rates")
        .select("*, category:cargo_categories(name), branch:branches(code)")
        .order("effective_from", { ascending: false }),
      supabase.from("fx_rates").select("*").order("effective_from", { ascending: false }).limit(10),
      supabase.from("profiles").select("*, branch:branches(code)").order("full_name"),
      supabase.from("container_types").select("*").order("sort"),
    ]);

  // current = latest effective row per category+branch
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set<string>();
  const currentIds = new Set<string>();
  for (const r of rates ?? []) {
    const k = r.category_id + r.branch_id;
    if (r.effective_from <= today && !seen.has(k)) {
      seen.add(k);
      currentIds.add(r.id);
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader title="Settings" subtitle={isAdmin ? "Configuration used across the system" : "Read only — ask an admin to change settings"} />
      <Flash error={error} ok={ok} />

      <Card title="Company">
        <form action={updateCompany} className="grid gap-4 sm:grid-cols-3">
          <Field label="Company name"><input name="name" defaultValue={me.company.name} className="input" required /></Field>
          <Field label="Heavy cargo threshold (kg per CBM)">
            <input name="heavy_kg_per_cbm" type="number" step="1" min="1" defaultValue={me.company.heavy_kg_per_cbm} className="input" required />
          </Field>
          <div className="flex items-end">{isAdmin && <button className="btn">Save</button>}</div>
          <p className="text-xs text-slate-500 sm:col-span-3">
            When a CBM-priced item weighs more than this per CBM, it is charged by weight (KG rate) instead.
          </p>
        </form>
      </Card>

      <div id="branches" className="grid gap-6 lg:grid-cols-2">
        <Card title="Origin branches">
          <table className="table mb-4">
            <thead><tr><th>Code</th><th>Name</th><th>Country</th><th></th></tr></thead>
            <tbody>
              {branches?.map((b) => (
                <tr key={b.id} className={b.active ? "" : "opacity-50"}>
                  <td className="font-mono">{b.code}</td><td>{b.name}</td><td>{b.country}</td>
                  <td className="text-right">
                    {isAdmin && (
                      <form action={toggleBranch}>
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="active" value={String(!b.active)} />
                        <button className="text-xs text-brand-600 hover:underline">{b.active ? "Deactivate" : "Activate"}</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!branches?.length && <Empty>No branches yet — add Guangzhou, Yiwu, Dubai, Mumbai…</Empty>}
          {isAdmin && (
            <form action={addBranch} className="grid grid-cols-[80px_1fr_1fr_auto] items-end gap-2">
              <Field label="Code"><input name="code" placeholder="GZ" className="input uppercase" required maxLength={6} /></Field>
              <Field label="Name"><input name="name" placeholder="Guangzhou" className="input" required /></Field>
              <Field label="Country"><input name="country" placeholder="China" className="input" required /></Field>
              <button className="btn">Add</button>
            </form>
          )}
        </Card>

        <Card title="Cargo categories">
          <table id="categories" className="table mb-4">
            <thead><tr><th>Category</th><th className="num">Heavy threshold</th></tr></thead>
            <tbody>
              {categories?.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="num">{c.heavy_kg_per_cbm ? `${num(c.heavy_kg_per_cbm, 0)} kg/CBM` : <span className="text-slate-400">company default</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!categories?.length && <Empty>No categories yet — e.g. General goods, Spare parts, Electronics, Textiles</Empty>}
          {isAdmin && (
            <form action={addCategory} className="grid grid-cols-[1fr_140px_auto] items-end gap-2">
              <Field label="Name"><input name="name" className="input" required /></Field>
              <Field label="Heavy kg/CBM (opt.)"><input name="heavy_kg_per_cbm" type="number" min="1" className="input" /></Field>
              <button className="btn">Add</button>
            </form>
          )}
        </Card>
      </div>

      <Card title="Rates per category per branch (USD)">
        <div id="rates" className="overflow-x-auto">
          <table className="table mb-4">
            <thead>
              <tr><th>Category</th><th>Branch</th><th>Charge by</th><th className="num">Per CBM</th><th className="num">Per KG</th><th className="num">Per PC</th><th className="num">Min charge</th><th>Effective</th><th></th></tr>
            </thead>
            <tbody>
              {rates?.map((r) => (
                <tr key={r.id} className={currentIds.has(r.id) ? "" : "text-slate-400"}>
                  <td>{r.category?.name}</td>
                  <td className="font-mono">{r.branch?.code}</td>
                  <td>{r.default_basis}</td>
                  <td className="num">{r.rate_cbm != null ? usd(r.rate_cbm) : "—"}</td>
                  <td className="num">{r.rate_kg != null ? usd(r.rate_kg) : "—"}</td>
                  <td className="num">{r.rate_pcs != null ? usd(r.rate_pcs) : "—"}</td>
                  <td className="num">{usd(r.min_charge)}</td>
                  <td>{date(r.effective_from)}</td>
                  <td>{currentIds.has(r.id) ? <span className="text-xs text-emerald-700">current</span> : r.effective_from > today ? <span className="text-xs">scheduled</span> : <span className="text-xs">old</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rates?.length && <Empty>No rates yet. Receiving is blocked until a category has a rate at the branch.</Empty>}
        </div>
        {isAdmin && (
          <form action={addRate} className="grid grid-cols-2 items-end gap-2 md:grid-cols-9">
            <Field label="Category" className="col-span-2">
              <select name="category_id" className="input" required>{categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </Field>
            <Field label="Branch">
              <select name="branch_id" className="input" required>{branches?.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select>
            </Field>
            <Field label="Charge by">
              <select name="default_basis" className="input"><option>CBM</option><option>KG</option><option>PCS</option></select>
            </Field>
            <Field label="Per CBM"><input name="rate_cbm" type="number" step="0.01" min="0" className="input" /></Field>
            <Field label="Per KG"><input name="rate_kg" type="number" step="0.01" min="0" className="input" /></Field>
            <Field label="Per PC"><input name="rate_pcs" type="number" step="0.01" min="0" className="input" /></Field>
            <Field label="Min charge"><input name="min_charge" type="number" step="0.01" min="0" defaultValue="0" className="input" /></Field>
            <Field label="Effective from"><input name="effective_from" type="date" defaultValue={today} className="input" /></Field>
            <div className="col-span-2 md:col-span-9 flex items-center justify-between gap-4">
              <p className="text-xs text-slate-500">Setting a new rate keeps the old one for receipts already recorded. Fill the KG rate on CBM categories so heavy cargo can switch to weight.</p>
              <button className="btn">Save rate</button>
            </div>
          </form>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Exchange rate (TZS per 1 USD)">
          <div id="fx">
            {fx?.[0] ? (
              <div className="mb-4">
                <div className="text-3xl font-semibold tabular-nums">{tzs(fx[0].rate)}</div>
                <div className="text-xs text-slate-500">set {dateTime(fx[0].effective_from)} — used for TZS payments</div>
              </div>
            ) : (
              <Empty>No rate set — TZS payments are blocked until you add one.</Empty>
            )}
            {isAdmin && (
              <form action={addFx} className="flex items-end gap-2">
                <Field label="New rate" className="flex-1"><input name="rate" type="number" step="0.01" min="1" className="input" required /></Field>
                <button className="btn">Update</button>
              </form>
            )}
            {fx && fx.length > 1 && (
              <ul className="mt-4 space-y-1 text-xs text-slate-500">
                {fx.slice(1).map((f) => <li key={f.id}>{tzs(f.rate)} · {dateTime(f.effective_from)}</li>)}
              </ul>
            )}
          </div>
        </Card>

        <Card title="Container types">
          <table className="table">
            <thead><tr><th>Code</th><th>Type</th><th className="num">Usable CBM</th><th className="num">Max payload</th></tr></thead>
            <tbody>
              {types?.map((t) => (
                <tr key={t.code}><td className="font-mono">{t.code}</td><td>{t.name}</td><td className="num">{num(t.max_cbm)}</td><td className="num">{num(t.max_kg, 0)} kg</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="Staff">
        <div id="staff" className="overflow-x-auto">
          <table className="table mb-4">
            <thead><tr><th>Name</th><th>Role</th><th>Home branch</th><th></th></tr></thead>
            <tbody>
              {staff?.map((s) => (
                <tr key={s.id}>
                  <td>{s.full_name}</td>
                  {isAdmin && s.id !== me.id ? (
                    <td colSpan={3}>
                      <form action={updateStaff} className="flex gap-2">
                        <input type="hidden" name="id" value={s.id} />
                        <select name="role" defaultValue={s.role} className="input max-w-40">{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
                        <select name="branch_id" defaultValue={s.branch_id ?? ""} className="input max-w-40">
                          <option value="">— Dar / none —</option>
                          {branches?.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
                        </select>
                        <button className="btn-secondary">Save</button>
                      </form>
                    </td>
                  ) : (
                    <>
                      <td className="capitalize">{s.role}</td>
                      <td>{s.branch?.code ?? "—"}</td>
                      <td />
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isAdmin && (
          <form action={addStaff} className="grid grid-cols-2 items-end gap-2 md:grid-cols-6">
            <Field label="Full name"><input name="full_name" className="input" required /></Field>
            <Field label="Email"><input name="email" type="email" className="input" required /></Field>
            <Field label="Temp password"><input name="password" minLength={8} className="input" required /></Field>
            <Field label="Role"><select name="role" className="input">{ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field>
            <Field label="Home branch">
              <select name="branch_id" className="input"><option value="">— Dar / none —</option>{branches?.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select>
            </Field>
            <button className="btn">Add staff</button>
          </form>
        )}
      </Card>
    </div>
  );
}
