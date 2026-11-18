"use client";
import { useMemo, useState, useTransition } from "react";
import { pickRate, priceItem, type Rate } from "@/lib/pricing";
import { usd } from "@/lib/format";
import { createReceipt, findCustomerByPhone } from "../actions";

type Opt = { id: string; name: string };
type Branch = { id: string; code: string; name: string };
type Row = { key: number; item_name: string; hs_code: string; category_id: string; cbm: string; weight_kg: string; pieces: string; packages: string };

const blank = (key: number, category_id = ""): Row => ({ key, item_name: "", hs_code: "", category_id, cbm: "", weight_kg: "", pieces: "", packages: "1" });

export function ReceiptForm({ branches, categories, rates, heavyKgPerCbm, defaultBranch }: {
  branches: Branch[]; categories: Opt[]; rates: Rate[]; heavyKgPerCbm: number; defaultBranch?: string;
}) {
  const [branchId, setBranchId] = useState(defaultBranch ?? branches[0]?.id ?? "");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [known, setKnown] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([blank(1, categories[0]?.id)]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const priced = useMemo(
    () => rows.map((r) => {
      const rate = pickRate(rates, r.category_id, branchId);
      return { rate, price: priceItem({ cbm: +r.cbm || 0, weight_kg: +r.weight_kg || 0, pieces: +r.pieces || 0 }, rate, heavyKgPerCbm) };
    }),
    [rows, rates, branchId, heavyKgPerCbm],
  );
  const total = priced.reduce((s, p) => s + (p.price?.charge ?? 0), 0);
  const totals = rows.reduce((t, r) => ({ cbm: t.cbm + (+r.cbm || 0), kg: t.kg + (+r.weight_kg || 0), pk: t.pk + (+r.packages || 0) }), { cbm: 0, kg: 0, pk: 0 });

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function lookup() {
    if (phone.replace(/\D/g, "").length < 9) return;
    const c = await findCustomerByPhone(phone);
    if (c) { setName(c.name); setKnown(c.name); } else setKnown(null);
  }

  function submit() {
    setError(null);
    const missing = priced.findIndex((p) => !p.rate);
    if (missing >= 0) return setError(`Item ${missing + 1}: no rate for this category at the selected branch. Add it in Settings.`);
    start(async () => {
      const res = await createReceipt({
        branch_id: branchId, customer_name: name, customer_phone: phone, notes,
        items: rows.map((r) => ({
          item_name: r.item_name.trim(), hs_code: r.hs_code.trim(), category_id: r.category_id,
          cbm: +r.cbm || 0, weight_kg: +r.weight_kg || 0, pieces: +r.pieces || 0, packages: +r.packages || 0,
        })),
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <section className="card grid gap-4 p-4 md:grid-cols-4">
        <label className="block">
          <span className="label">Receiving branch</span>
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Customer phone</span>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={lookup} placeholder="0754 000 000" required />
        </label>
        <label className="block">
          <span className="label">Customer name {known && <span className="normal-case text-emerald-700">· existing customer</span>}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="block">
          <span className="label">Notes</span>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Marks, supplier, remarks…" />
        </label>
      </section>

      <section className="card overflow-x-auto">
        <table className="table min-w-[980px]">
          <thead>
            <tr>
              <th className="w-8">#</th><th>Item name</th><th className="w-44">Category</th><th className="w-24">HS code</th>
              <th className="w-24 num">CBM</th><th className="w-24 num">Weight kg</th><th className="w-20 num">Pcs</th><th className="w-20 num">Pkgs</th>
              <th className="w-40 num">Charge</th><th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const p = priced[i].price;
              return (
                <tr key={r.key}>
                  <td className="pt-4 text-slate-400">{i + 1}</td>
                  <td><input className="input" value={r.item_name} onChange={(e) => update(r.key, { item_name: e.target.value })} placeholder="e.g. Ladies shoes" /></td>
                  <td>
                    <select className="input" value={r.category_id} onChange={(e) => update(r.key, { category_id: e.target.value })}>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </td>
                  <td><input className="input" value={r.hs_code} onChange={(e) => update(r.key, { hs_code: e.target.value })} /></td>
                  <td><input className="input text-right" type="number" step="0.001" min="0" value={r.cbm} onChange={(e) => update(r.key, { cbm: e.target.value })} /></td>
                  <td><input className="input text-right" type="number" step="0.01" min="0" value={r.weight_kg} onChange={(e) => update(r.key, { weight_kg: e.target.value })} /></td>
                  <td><input className="input text-right" type="number" step="1" min="0" value={r.pieces} onChange={(e) => update(r.key, { pieces: e.target.value })} /></td>
                  <td><input className="input text-right" type="number" step="1" min="0" value={r.packages} onChange={(e) => update(r.key, { packages: e.target.value })} /></td>
                  <td className="num pt-3">
                    {p ? (
                      <>
                        <div className="font-medium">{usd(p.charge)}</div>
                        <div className="text-xs text-slate-500">
                          {p.qty} {p.basis} × {usd(p.unit)}{p.heavy && <span className="ml-1 text-amber-700">heavy</span>}
                        </div>
                      </>
                    ) : <span className="text-xs text-red-600">no rate</span>}
                  </td>
                  <td className="pt-3">
                    {rows.length > 1 && (
                      <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="text-slate-400 hover:text-red-600" aria-label="Remove">✕</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-medium">
              <td colSpan={4} className="px-3 py-2">
                <button type="button" className="btn-secondary" onClick={() => setRows((rs) => [...rs, blank(Math.max(...rs.map((x) => x.key)) + 1, rs[rs.length - 1]?.category_id)])}>
                  + Add item
                </button>
              </td>
              <td className="num px-3 py-2">{totals.cbm.toFixed(3)}</td>
              <td className="num px-3 py-2">{totals.kg.toFixed(2)}</td>
              <td />
              <td className="num px-3 py-2">{totals.pk}</td>
              <td className="num px-3 py-2 text-lg">{usd(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </section>

      <div className="flex justify-end">
        <button className="btn" disabled={pending || !phone || !name} onClick={submit}>{pending ? "Saving…" : "Save receipt"}</button>
      </div>
    </div>
  );
}
