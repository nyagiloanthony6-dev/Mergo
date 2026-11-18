// Client-side preview of the pricing rule. The database trigger (trg_price_item)
// is the source of truth; keep the two in sync.
export type Basis = "CBM" | "KG" | "PCS";

export type Rate = {
  id: string;
  category_id: string;
  branch_id: string;
  default_basis: Basis;
  rate_cbm: number | null;
  rate_kg: number | null;
  rate_pcs: number | null;
  min_charge: number;
  effective_from: string;
};

export function priceItem(
  item: { cbm: number; weight_kg: number; pieces: number },
  rate: Rate | undefined,
  heavyKgPerCbm: number,
) {
  if (!rate) return null;
  let basis: Basis = rate.default_basis;
  if (basis === "CBM" && item.cbm > 0 && rate.rate_kg != null && item.weight_kg / item.cbm > heavyKgPerCbm) {
    basis = "KG";
  }
  const qty = basis === "CBM" ? item.cbm : basis === "KG" ? item.weight_kg : item.pieces;
  const unit = Number((basis === "CBM" ? rate.rate_cbm : basis === "KG" ? rate.rate_kg : rate.rate_pcs) ?? 0);
  const charge = Math.max(Math.round(qty * unit * 100) / 100, Number(rate.min_charge));
  return { basis, qty, unit, charge, heavy: basis !== rate.default_basis };
}

/** Latest rate effective on or before `onDate` for category + branch. */
export function pickRate(rates: Rate[], categoryId: string, branchId: string, onDate = new Date()) {
  const day = onDate.toISOString().slice(0, 10);
  return rates
    .filter((r) => r.category_id === categoryId && r.branch_id === branchId && r.effective_from <= day)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
}
