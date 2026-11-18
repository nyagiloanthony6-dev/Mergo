# Mergo — LCL consolidation & FCL shipping

Multi-tenant web app for freight forwarders shipping from overseas origins (China, India, Dubai …) to Dar es Salaam.
Built with **Next.js 15 (App Router) + Supabase (Postgres, Auth, Storage) + Tailwind**.

> White-label: set `NEXT_PUBLIC_APP_NAME` to change the displayed name.

## The flow

```
LCL:  Receive goods (origin) → Load into container → Seal (stuffed) → Assign to BL → In transit
      → Arrived Dar → Under customs → Cleared → Offload tally at warehouse → Release → Delivered

FCL:  Book container for one customer → Stuff + packing lines → Seal → Assign to BL → In transit
      → Arrived → Under customs → Cleared → Delivered to customer → Empty returned
```

| Module | Where | What it does |
|---|---|---|
| Settings | `/settings` | Origin branches, cargo categories, **rates per category per branch**, heavy-cargo threshold, **TZS exchange rate**, staff accounts |
| LCL receiving | `/receiving` | Customer (looked up by phone), items with CBM / KG / pcs / packages, auto-priced; printable goods receipt |
| Containers | `/containers` | Create container (ISO 6346 check-digit validated, 20GP/40GP/40HQ/45HQ), load waiting LCL items with live CBM/KG capacity bars, FCL packing lines, status timeline, documents |
| Bills of lading | `/bls` | One master BL → many containers. Documentation assigns containers after stuffing. Combined packing list per BL |
| Documents | container & BL pages | Auto packing list + uploaded commercial invoice, BL, others (Supabase Storage, private) |
| Dar warehouse | `/warehouse` | Inbound containers, offload tally (counted vs shipped, short/damaged, location), release orders (blocked if unpaid), deliveries |
| Payments | `/payments` | Origin or destination, USD or TZS (converted at the FX rate, which is stored on each payment) |
| Customers | `/customers` | History, volumes, balances |
| Public tracking | `/track` | Customer enters receipt no + phone |

## Pricing rule (enforced in the database)

```
charge = max(chargeable_qty × rate, min_charge)        -- per item line
chargeable_qty = CBM | KG | PCS                        -- the category's default basis at that branch
heavy cargo: if basis is CBM and kg/CBM > threshold and a KG rate exists → charged by KG
```

- The threshold is set per company (default 500 kg/CBM) and can be overridden per category.
- Rates are versioned by `effective_from`. A new rate doesn't change receipts already recorded, and each item stores the rate it was charged at.
- Trigger `trg_price_item` is the source of truth. `src/lib/pricing.ts` only shows the live preview in the receiving form.

## Setup

1. **Create a Supabase project.** In the SQL editor, run `supabase/migrations/0001_init.sql`, then `0002_storage.sql`.
   (Or use the CLI: `supabase link` then `supabase db push`.)
2. In **Authentication → Providers**, keep Email enabled. While testing, you can turn off "Confirm email".
3. Copy `.env.example` to `.env.local` and fill in the URL, anon key and service-role key. The service-role key is only used by admins to create staff accounts.
4. Run `npm install` and then `npm run dev`. Open http://localhost:3000.
5. Sign up, then create your company (you become admin). In Settings, add branches, categories, rates and the exchange rate. Then start receiving goods.

**Deploy:** push to GitHub, import the repo in Vercel, and add the same env vars.

## Roles

`admin` (settings + everything), `origin`, `documentation`, `warehouse`, `finance`. For now, every role can use all operational screens, and only admins can change settings or create staff. RLS isolates each company's data.

## Built-in safeguards

- An item can't be loaded into a sealed container, an FCL container, or a container at another branch.
- Items can't be removed once a container is sealed.
- A container can't be sealed without a seal number and goods.
- A container can't depart without a BL.
- A container can't be marked offloaded until every line is tallied.
- Goods can't be released with an unpaid balance (admins can override; the override is noted on the release order).
- A container number can only be active once at a time (numbers are reused across trips).
- TZS payments are blocked until an exchange rate is set.

## Planned next (schema is ready for them)

- **Price master per product/item per branch:** add a `price_master` table (item → branch → rate). The pricing trigger looks it up before the category rate.
- **Discounts and waivers:** add an `adjustments` table (receipt_id or container_id, type, amount_usd, reason, approved_by). The balance views subtract it.
- Integration with the LCL delivery dispatch system: release orders with `delivery_method = 'delivery'` are its input.
- SMS/WhatsApp notifications on stage changes, and customer invoices/statements.

## Project layout

```
supabase/migrations/   schema, triggers, views, RLS, storage policies
src/lib/               supabase clients, auth, pricing preview, ISO 6346 check, formatting
src/app/(app)/         staff screens (receiving, containers, bls, warehouse, payments, customers, settings)
src/app/print/         printable receipt, packing lists (container / BL), release order
src/app/track/         public cargo tracking
```
