-- =====================================================================
-- Cargo Consol — LCL consolidation & FCL shipping
-- Initial schema (multi-tenant, Supabase / PostgreSQL 15+)
-- All money is stored in USD. TZS payments are converted with an FX rate.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type staff_role       as enum ('admin', 'origin', 'documentation', 'warehouse', 'finance');
create type charge_basis     as enum ('CBM', 'KG', 'PCS');
create type shipment_mode    as enum ('LCL', 'FCL');
create type container_status as enum (
  'stuffing',        -- container opened, goods being loaded
  'stuffed',         -- sealed, ready for export
  'in_transit',      -- departed origin
  'arrived',         -- arrived Dar port
  'under_customs',   -- customs clearance in progress
  'cleared',         -- customs cleared
  'offloaded',       -- LCL: devanned at Dar warehouse
  'delivered',       -- FCL: container delivered to customer
  'empty_returned'   -- FCL: empty returned to shipping line
);
create type tally_status     as enum ('pending', 'ok', 'short', 'damaged', 'excess');
create type document_type    as enum ('packing_list', 'commercial_invoice', 'bill_of_lading', 'other');
create type payment_side     as enum ('origin', 'destination');
create type delivery_method  as enum ('collect', 'delivery');

-- ---------------------------------------------------------------------
-- Tenancy: companies & staff profiles
-- ---------------------------------------------------------------------
create table companies (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  -- above this many kg per CBM, CBM-priced cargo is charged by weight
  heavy_kg_per_cbm numeric(10,2) not null default 500,
  created_at       timestamptz not null default now()
);

create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  company_id  uuid not null references companies (id) on delete cascade,
  full_name   text,
  role        staff_role not null default 'origin',
  branch_id   uuid,              -- home branch (optional)
  created_at  timestamptz not null default now()
);

create or replace function current_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from profiles where id = auth.uid()
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false)
$$;

-- Called once by a freshly signed-up user to create their company.
create or replace function create_company(p_company_name text, p_full_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_company uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'You already belong to a company';
  end if;
  insert into companies (name) values (p_company_name) returning id into v_company;
  insert into profiles (id, company_id, full_name, role) values (auth.uid(), v_company, p_full_name, 'admin');
  return v_company;
end $$;

-- ---------------------------------------------------------------------
-- Document numbering (per company, per key)
-- ---------------------------------------------------------------------
create table doc_counters (
  company_id uuid not null references companies (id) on delete cascade,
  key        text not null,
  value      integer not null default 0,
  primary key (company_id, key)
);

create or replace function next_doc_number(p_company uuid, p_key text) returns integer
language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  insert into doc_counters (company_id, key, value) values (p_company, p_key, 1)
  on conflict (company_id, key) do update set value = doc_counters.value + 1
  returning value into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Setup / configuration
-- ---------------------------------------------------------------------
create table branches (            -- origin warehouses: Guangzhou, Yiwu, Mumbai, Dubai ...
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default current_company_id() references companies (id) on delete cascade,
  code        text not null check (code ~ '^[A-Z0-9]{2,6}$'),
  name        text not null,
  country     text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (company_id, code)
);
alter table profiles add constraint profiles_branch_fk foreign key (branch_id) references branches (id) on delete set null;

create table container_types (     -- global reference data
  code    text primary key,
  name    text not null,
  max_cbm numeric(8,2) not null,   -- practical loadable volume
  max_kg  numeric(10,2) not null,  -- max payload
  sort    integer not null default 0
);
insert into container_types (code, name, max_cbm, max_kg, sort) values
  ('20GP', '20ft Standard',   28, 28000, 1),
  ('40GP', '40ft Standard',   58, 26500, 2),
  ('40HQ', '40ft High Cube',  68, 26500, 3),
  ('45HQ', '45ft High Cube',  78, 27500, 4);

create table cargo_categories (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null default current_company_id() references companies (id) on delete cascade,
  name             text not null,
  heavy_kg_per_cbm numeric(10,2),   -- optional override of company threshold
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (company_id, name)
);

-- Rate per category per branch. Old rows are kept so historical charges stay explainable.
create table category_rates (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null default current_company_id() references companies (id) on delete cascade,
  category_id    uuid not null references cargo_categories (id) on delete cascade,
  branch_id      uuid not null references branches (id) on delete cascade,
  default_basis  charge_basis not null,
  rate_cbm       numeric(12,2) check (rate_cbm >= 0),   -- USD per CBM
  rate_kg        numeric(12,2) check (rate_kg  >= 0),   -- USD per KG (also used for heavy cargo)
  rate_pcs       numeric(12,2) check (rate_pcs >= 0),   -- USD per piece
  min_charge     numeric(12,2) not null default 0 check (min_charge >= 0),
  effective_from date not null default current_date,
  created_at     timestamptz not null default now(),
  check (
    (default_basis = 'CBM' and rate_cbm is not null) or
    (default_basis = 'KG'  and rate_kg  is not null) or
    (default_basis = 'PCS' and rate_pcs is not null)
  )
);
create index on category_rates (category_id, branch_id, effective_from desc);

create table fx_rates (            -- TZS per 1 USD
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null default current_company_id() references companies (id) on delete cascade,
  currency       text not null default 'TZS' check (currency = 'TZS'),
  rate           numeric(14,4) not null check (rate > 0),
  effective_from timestamptz not null default now(),
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);
create index on fx_rates (company_id, effective_from desc);

-- ---------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------
create table customers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default current_company_id() references companies (id) on delete cascade,
  name        text not null,
  phone       text not null,          -- stored normalised, e.g. 255754000000
  created_at  timestamptz not null default now(),
  unique (company_id, phone)
);

-- ---------------------------------------------------------------------
-- Bills of lading (one master BL can cover many containers)
-- ---------------------------------------------------------------------
create table bills_of_lading (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null default current_company_id() references companies (id) on delete cascade,
  bl_no             text not null,
  shipping_line     text,
  vessel            text,
  voyage            text,
  port_of_loading   text,
  port_of_discharge text not null default 'Dar es Salaam',
  etd               date,
  eta               date,
  notes             text,
  created_at        timestamptz not null default now(),
  unique (company_id, bl_no)
);

-- ---------------------------------------------------------------------
-- Containers (LCL consolidation or FCL)
-- ---------------------------------------------------------------------
create table containers (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null default current_company_id() references companies (id) on delete cascade,
  container_no          text not null check (container_no ~ '^[A-Z]{4}[0-9]{7}$'),
  type_code             text not null references container_types (code),
  mode                  shipment_mode not null,
  branch_id             uuid not null references branches (id),
  seal_no               text,
  bl_id                 uuid references bills_of_lading (id) on delete set null,
  status                container_status not null default 'stuffing',
  -- FCL only
  fcl_customer_id       uuid references customers (id),
  fcl_goods_description text,
  fcl_freight_usd       numeric(12,2) check (fcl_freight_usd >= 0),
  -- milestones
  stuffed_at            timestamptz,
  departed_at           timestamptz,
  arrived_at            timestamptz,
  customs_at            timestamptz,
  cleared_at            timestamptz,
  offloaded_at          timestamptz,
  delivered_at          timestamptz,
  empty_returned_at     timestamptz,
  notes                 text,
  created_at            timestamptz not null default now(),
  check (mode <> 'FCL' or fcl_customer_id is not null),
  check (mode <> 'LCL' or status not in ('delivered', 'empty_returned')),
  check (mode <> 'FCL' or status <> 'offloaded')
);
-- Container numbers are reused across trips: only one *active* use at a time.
create unique index containers_active_no on containers (company_id, container_no)
  where status in ('stuffing', 'stuffed', 'in_transit', 'arrived', 'under_customs', 'cleared');
create index on containers (company_id, status);
create index on containers (bl_id);

create table fcl_container_items (  -- FCL packing list lines
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null default current_company_id() references companies (id) on delete cascade,
  container_id uuid not null references containers (id) on delete cascade,
  description  text not null,
  hs_code      text,
  packages     integer not null default 0 check (packages >= 0),
  pieces       integer not null default 0 check (pieces >= 0),
  cbm          numeric(10,3) not null default 0 check (cbm >= 0),
  weight_kg    numeric(10,2) not null default 0 check (weight_kg >= 0),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- LCL receipts (goods received at origin warehouse)
-- ---------------------------------------------------------------------
create table lcl_receipts (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null default current_company_id() references companies (id) on delete cascade,
  receipt_no       text,
  branch_id        uuid not null references branches (id),
  customer_id      uuid not null references customers (id),
  received_at      timestamptz not null default now(),
  total_charge_usd numeric(12,2) not null default 0,
  notes            text,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  unique (company_id, receipt_no)
);
create index on lcl_receipts (company_id, customer_id);

create table lcl_receipt_items (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null default current_company_id() references companies (id) on delete cascade,
  receipt_id      uuid not null references lcl_receipts (id) on delete cascade,
  item_name       text not null,
  hs_code         text,
  category_id     uuid not null references cargo_categories (id),
  cbm             numeric(10,3) not null default 0 check (cbm >= 0),
  weight_kg       numeric(10,2) not null default 0 check (weight_kg >= 0),
  pieces          integer not null default 0 check (pieces >= 0),
  packages        integer not null default 1 check (packages >= 0),
  -- pricing snapshot (filled by trigger)
  rate_id         uuid references category_rates (id),
  basis_applied   charge_basis,
  chargeable_qty  numeric(12,3),
  rate_usd        numeric(12,2),
  charge_usd      numeric(12,2),
  -- loading
  container_id    uuid references containers (id) on delete set null,
  loaded_at       timestamptz,
  -- Dar warehouse tally
  dar_packages    integer check (dar_packages >= 0),
  tally_status    tally_status not null default 'pending',
  tally_note      text,
  location        text,
  tallied_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index on lcl_receipt_items (receipt_id);
create index on lcl_receipt_items (container_id);

-- ---------------------------------------------------------------------
-- Documents (files live in Supabase Storage bucket "documents")
-- ---------------------------------------------------------------------
create table documents (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null default current_company_id() references companies (id) on delete cascade,
  container_id uuid references containers (id) on delete cascade,
  bl_id        uuid references bills_of_lading (id) on delete cascade,
  doc_type     document_type not null,
  file_name    text not null,
  file_path    text not null,
  uploaded_by  uuid default auth.uid(),
  uploaded_at  timestamptz not null default now(),
  check (container_id is not null or bl_id is not null)
);

-- ---------------------------------------------------------------------
-- Payments (origin or destination; USD or TZS)
-- ---------------------------------------------------------------------
create table payments (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null default current_company_id() references companies (id) on delete cascade,
  payment_no   text,
  customer_id  uuid not null references customers (id),
  receipt_id   uuid references lcl_receipts (id) on delete restrict,   -- LCL
  container_id uuid references containers (id) on delete restrict,     -- FCL
  side         payment_side not null,
  currency     text not null check (currency in ('USD', 'TZS')),
  amount       numeric(14,2) not null check (amount > 0),
  fx_rate      numeric(14,4),          -- TZS per USD, set when currency = TZS
  amount_usd   numeric(14,2),
  method       text,                   -- cash, bank, mobile money ...
  reference    text,
  paid_at      timestamptz not null default now(),
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (company_id, payment_no),
  check (num_nonnulls(receipt_id, container_id) = 1)
);

-- ---------------------------------------------------------------------
-- Release orders (LCL goods leaving Dar warehouse)
-- ---------------------------------------------------------------------
create table release_orders (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null default current_company_id() references companies (id) on delete cascade,
  release_no      text,
  receipt_id      uuid not null unique references lcl_receipts (id) on delete restrict,
  delivery_method delivery_method not null default 'collect',
  delivery_address text,
  collected_by    text,
  released_at     timestamptz not null default now(),
  released_by     uuid default auth.uid(),
  delivered_at    timestamptz,
  notes           text,
  unique (company_id, release_no)
);

-- =====================================================================
-- Business logic
-- =====================================================================

-- Document numbers ----------------------------------------------------
create or replace function trg_receipt_no() returns trigger language plpgsql as $$
declare v_code text;
begin
  if new.receipt_no is null then
    select code into v_code from branches where id = new.branch_id;
    new.receipt_no := v_code || '-' || to_char(new.received_at, 'YY')
      || lpad(next_doc_number(new.company_id, 'receipt:' || v_code || ':' || to_char(new.received_at, 'YY'))::text, 5, '0');
  end if;
  return new;
end $$;
create trigger lcl_receipts_no before insert on lcl_receipts for each row execute function trg_receipt_no();

create or replace function trg_payment_no() returns trigger language plpgsql as $$
begin
  if new.payment_no is null then
    new.payment_no := 'PMT-' || to_char(now(), 'YY')
      || lpad(next_doc_number(new.company_id, 'payment:' || to_char(now(), 'YY'))::text, 6, '0');
  end if;
  return new;
end $$;
create trigger payments_no before insert on payments for each row execute function trg_payment_no();

create or replace function trg_release_no() returns trigger language plpgsql as $$
begin
  if new.release_no is null then
    new.release_no := 'RO-' || to_char(now(), 'YY')
      || lpad(next_doc_number(new.company_id, 'release:' || to_char(now(), 'YY'))::text, 6, '0');
  end if;
  return new;
end $$;
create trigger release_orders_no before insert on release_orders for each row execute function trg_release_no();

-- Pricing -------------------------------------------------------------
-- charge = max(chargeable_qty × rate, min_charge)
-- Heavy cargo: if the category is priced by CBM but weight/CBM exceeds the
-- threshold (category override, else company default) and a KG rate exists,
-- the item is charged by KG.
create or replace function trg_price_item() returns trigger language plpgsql as $$
declare
  v_receipt   lcl_receipts%rowtype;
  v_rate      category_rates%rowtype;
  v_threshold numeric;
  v_basis     charge_basis;
  v_qty       numeric;
  v_unit      numeric;
begin
  if tg_op = 'UPDATE'
     and new.category_id = old.category_id and new.cbm = old.cbm
     and new.weight_kg = old.weight_kg and new.pieces = old.pieces then
    return new;  -- nothing that affects price changed
  end if;

  select * into v_receipt from lcl_receipts where id = new.receipt_id;

  select r.* into v_rate
    from category_rates r
   where r.category_id = new.category_id
     and r.branch_id   = v_receipt.branch_id
     and r.effective_from <= v_receipt.received_at::date
   order by r.effective_from desc, r.created_at desc
   limit 1;
  if not found then
    raise exception 'No rate configured for category % at this branch', new.category_id
      using errcode = 'P0001', hint = 'Add a rate under Settings → Rates';
  end if;

  select coalesce(cc.heavy_kg_per_cbm, c.heavy_kg_per_cbm) into v_threshold
    from cargo_categories cc join companies c on c.id = cc.company_id
   where cc.id = new.category_id;

  v_basis := v_rate.default_basis;
  if v_basis = 'CBM' and new.cbm > 0 and v_rate.rate_kg is not null
     and new.weight_kg / new.cbm > v_threshold then
    v_basis := 'KG';
  end if;

  v_qty  := case v_basis when 'CBM' then new.cbm when 'KG' then new.weight_kg else new.pieces end;
  v_unit := case v_basis when 'CBM' then v_rate.rate_cbm when 'KG' then v_rate.rate_kg else v_rate.rate_pcs end;

  new.rate_id        := v_rate.id;
  new.basis_applied  := v_basis;
  new.chargeable_qty := v_qty;
  new.rate_usd       := v_unit;
  new.charge_usd     := greatest(round(v_qty * v_unit, 2), v_rate.min_charge);
  return new;
end $$;
create trigger lcl_items_price before insert or update on lcl_receipt_items
  for each row execute function trg_price_item();

create or replace function trg_receipt_total() returns trigger language plpgsql as $$
declare v_id uuid := coalesce(new.receipt_id, old.receipt_id);
begin
  update lcl_receipts
     set total_charge_usd = coalesce((select sum(charge_usd) from lcl_receipt_items where receipt_id = v_id), 0)
   where id = v_id;
  return null;
end $$;
create trigger lcl_items_total after insert or update or delete on lcl_receipt_items
  for each row execute function trg_receipt_total();

-- Loading rules -------------------------------------------------------
-- Items can only be loaded into / removed from an LCL container that is
-- still being stuffed and belongs to the same origin branch.
create or replace function trg_item_loading() returns trigger language plpgsql as $$
declare v_c containers%rowtype; v_branch uuid;
begin
  if new.container_id is not distinct from old.container_id then return new; end if;

  if old.container_id is not null then
    select * into v_c from containers where id = old.container_id;
    if found and v_c.status <> 'stuffing' then
      raise exception 'Container % is already sealed; items cannot be removed', v_c.container_no;
    end if;
  end if;

  if new.container_id is not null then
    select * into v_c from containers where id = new.container_id;
    select branch_id into v_branch from lcl_receipts where id = new.receipt_id;
    if v_c.mode <> 'LCL' then raise exception 'Container % is FCL', v_c.container_no; end if;
    if v_c.status <> 'stuffing' then raise exception 'Container % is not open for stuffing', v_c.container_no; end if;
    if v_c.branch_id <> v_branch then raise exception 'Item and container are at different branches'; end if;
    new.loaded_at := now();
  else
    new.loaded_at := null;
  end if;
  return new;
end $$;
create trigger lcl_items_loading before update of container_id on lcl_receipt_items
  for each row execute function trg_item_loading();

-- Payments: convert to USD --------------------------------------------
create or replace function trg_payment_fx() returns trigger language plpgsql as $$
begin
  if new.currency = 'USD' then
    new.fx_rate := null;
    new.amount_usd := new.amount;
  else
    if new.fx_rate is null then
      select rate into new.fx_rate from fx_rates
       where company_id = new.company_id and effective_from <= new.paid_at
       order by effective_from desc limit 1;
    end if;
    if new.fx_rate is null then
      raise exception 'No TZS exchange rate set' using hint = 'Add one under Settings → Exchange rate';
    end if;
    new.amount_usd := round(new.amount / new.fx_rate, 2);
  end if;
  return new;
end $$;
create trigger payments_fx before insert or update on payments
  for each row execute function trg_payment_fx();

-- =====================================================================
-- Views (security_invoker so RLS of the caller applies)
-- =====================================================================
create or replace function container_stage_rank(s container_status) returns integer
language sql immutable as $$
  select case s
    when 'stuffing' then 1 when 'stuffed' then 2 when 'in_transit' then 3
    when 'arrived' then 4 when 'under_customs' then 5 when 'cleared' then 6
    when 'offloaded' then 7 when 'delivered' then 8 when 'empty_returned' then 9 end
$$;

create view v_container_summary with (security_invoker = true) as
select c.*,
       ct.name   as type_name,
       ct.max_cbm,
       ct.max_kg,
       b.code    as branch_code,
       b.name    as branch_name,
       bl.bl_no,
       fc.name   as fcl_customer_name,
       fc.phone  as fcl_customer_phone,
       coalesce(l.cbm, f.cbm, 0)            as total_cbm,
       coalesce(l.weight_kg, f.weight_kg, 0) as total_kg,
       coalesce(l.packages, f.packages, 0)  as total_packages,
       coalesce(l.items, f.items, 0)        as item_count,
       coalesce(l.customers, case when c.mode = 'FCL' then 1 else 0 end) as customer_count
  from containers c
  join container_types ct on ct.code = c.type_code
  join branches b on b.id = c.branch_id
  left join bills_of_lading bl on bl.id = c.bl_id
  left join customers fc on fc.id = c.fcl_customer_id
  left join lateral (
    select sum(i.cbm) cbm, sum(i.weight_kg) weight_kg, sum(i.packages) packages,
           count(*) items, count(distinct r.customer_id) customers
      from lcl_receipt_items i join lcl_receipts r on r.id = i.receipt_id
     where i.container_id = c.id
  ) l on c.mode = 'LCL'
  left join lateral (
    select sum(cbm) cbm, sum(weight_kg) weight_kg, sum(packages) packages, count(*) items
      from fcl_container_items where container_id = c.id
  ) f on c.mode = 'FCL';

create view v_receipt_summary with (security_invoker = true) as
select r.*,
       cu.name  as customer_name,
       cu.phone as customer_phone,
       b.code   as branch_code,
       b.name   as branch_name,
       agg.item_count,
       agg.loaded_count,
       agg.total_cbm,
       agg.total_kg,
       agg.total_packages,
       coalesce(p.paid_usd, 0)                       as paid_usd,
       r.total_charge_usd - coalesce(p.paid_usd, 0)  as balance_usd,
       ro.release_no,
       ro.released_at,
       ro.delivered_at,
       case
         when ro.delivered_at is not null then 'delivered'
         when ro.id is not null           then 'released'
         when agg.loaded_count = 0        then 'received'
         when agg.loaded_count < agg.item_count then 'partially_loaded'
         else case agg.min_rank
           when 1 then 'loaded' when 2 then 'loaded' when 3 then 'in_transit'
           when 4 then 'arrived' when 5 then 'under_customs' when 6 then 'cleared'
           else 'offloaded' end
       end as stage
  from lcl_receipts r
  join customers cu on cu.id = r.customer_id
  join branches b on b.id = r.branch_id
  left join release_orders ro on ro.receipt_id = r.id
  left join lateral (
    select count(*) item_count,
           count(i.container_id) loaded_count,
           coalesce(sum(i.cbm), 0) total_cbm,
           coalesce(sum(i.weight_kg), 0) total_kg,
           coalesce(sum(i.packages), 0) total_packages,
           min(container_stage_rank(c.status)) min_rank
      from lcl_receipt_items i left join containers c on c.id = i.container_id
     where i.receipt_id = r.id
  ) agg on true
  left join lateral (
    select sum(amount_usd) paid_usd from payments where receipt_id = r.id
  ) p on true;

create view v_fcl_balance with (security_invoker = true) as
select c.id as container_id,
       coalesce(c.fcl_freight_usd, 0) as charge_usd,
       coalesce((select sum(amount_usd) from payments p where p.container_id = c.id), 0) as paid_usd,
       coalesce(c.fcl_freight_usd, 0) - coalesce((select sum(amount_usd) from payments p where p.container_id = c.id), 0) as balance_usd
  from containers c where c.mode = 'FCL';

-- Public tracking: needs receipt number AND phone ---------------------
create or replace function track_receipt(p_receipt_no text, p_phone text)
returns table (company_name text, receipt_no text, customer_name text, branch_name text,
               received_at timestamptz, stage text, total_packages bigint, total_cbm numeric,
               container_no text, eta date)
language sql stable security definer set search_path = public as $$
  select co.name, r.receipt_no, cu.name, b.name, r.received_at,
         case
           when ro.delivered_at is not null then 'delivered'
           when ro.id is not null then 'released'
           when agg.loaded = 0 then 'received'
           when agg.loaded < agg.cnt then 'partially_loaded'
           else case agg.min_rank when 1 then 'loaded' when 2 then 'loaded' when 3 then 'in_transit'
                 when 4 then 'arrived' when 5 then 'under_customs' when 6 then 'cleared' else 'offloaded' end
         end,
         agg.pk, agg.cbm, agg.cno, agg.eta
    from lcl_receipts r
    join customers cu on cu.id = r.customer_id
    join companies co on co.id = r.company_id
    join branches b on b.id = r.branch_id
    left join release_orders ro on ro.receipt_id = r.id
    cross join lateral (
      select count(*) cnt, count(i.container_id) loaded, sum(i.packages) pk, sum(i.cbm) cbm,
             min(container_stage_rank(c.status)) min_rank,
             string_agg(distinct c.container_no, ', ') cno, max(bl.eta) eta
        from lcl_receipt_items i
        left join containers c on c.id = i.container_id
        left join bills_of_lading bl on bl.id = c.bl_id
       where i.receipt_id = r.id
    ) agg
   where upper(r.receipt_no) = upper(trim(p_receipt_no))
     and right(regexp_replace(cu.phone, '\D', '', 'g'), 9) = right(regexp_replace(p_phone, '\D', '', 'g'), 9)
   limit 1
$$;

-- =====================================================================
-- Row level security
-- =====================================================================
alter table companies           enable row level security;
alter table profiles            enable row level security;
alter table doc_counters        enable row level security;
alter table branches            enable row level security;
alter table container_types     enable row level security;
alter table cargo_categories    enable row level security;
alter table category_rates      enable row level security;
alter table fx_rates            enable row level security;
alter table customers           enable row level security;
alter table bills_of_lading     enable row level security;
alter table containers          enable row level security;
alter table fcl_container_items enable row level security;
alter table lcl_receipts        enable row level security;
alter table lcl_receipt_items   enable row level security;
alter table documents           enable row level security;
alter table payments            enable row level security;
alter table release_orders      enable row level security;

create policy company_read   on companies for select to authenticated using (id = current_company_id());
create policy company_update on companies for update to authenticated using (id = current_company_id() and is_admin());

create policy profiles_read  on profiles for select to authenticated using (company_id = current_company_id());
create policy profiles_admin on profiles for update to authenticated
  using (company_id = current_company_id() and is_admin()) with check (company_id = current_company_id());

create policy container_types_read on container_types for select to authenticated using (true);

-- Setup tables: everyone in the company reads, admins write.
do $$
declare t text;
begin
  foreach t in array array['branches', 'cargo_categories', 'category_rates', 'fx_rates'] loop
    execute format('create policy %1$s_read on %1$s for select to authenticated using (company_id = current_company_id())', t);
    execute format('create policy %1$s_write on %1$s for all to authenticated using (company_id = current_company_id() and is_admin()) with check (company_id = current_company_id() and is_admin())', t);
  end loop;
  -- Operational tables: any staff member of the company.
  foreach t in array array['customers', 'bills_of_lading', 'containers', 'fcl_container_items',
                           'lcl_receipts', 'lcl_receipt_items', 'documents', 'payments', 'release_orders'] loop
    execute format('create policy %1$s_tenant on %1$s for all to authenticated using (company_id = current_company_id()) with check (company_id = current_company_id())', t);
  end loop;
end $$;

grant execute on function track_receipt(text, text) to anon, authenticated;
grant execute on function create_company(text, text) to authenticated;
