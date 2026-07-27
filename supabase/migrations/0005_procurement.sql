-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0005 — Procurement, Suppliers & Restocking
--
-- Adds: suppliers, product_suppliers (per-supplier unit conversion),
--       purchase orders + items, goods receipts + items, PO number counter,
--       and the RPCs create_purchase_order / receive_goods /
--       restock_suggestions / create_po_from_suggestions.
--
-- HARD CONSTRAINTS:
--   * Additive only. No ALTER of existing tables. No new tables replace old.
--   * Does NOT modify v_variant_stock or v_sale_summary (Android reads them).
--   * Inventory changes ONLY through the existing record_stock_movement().
--   * CONVERSION AUTHORITY moves to product_suppliers; the product-level
--     purchase_unit/purchase_conversion_qty remain as fallback only.
--   * COST REACHING THE LEDGER IS ALWAYS PER BASE UNIT. Receiving divides
--     purchase-unit cost by conversion_to_base BEFORE calling the ledger.
-- ============================================================================

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

create type public.po_status as enum (
  'draft', 'ordered', 'partially_received', 'completed', 'cancelled'
);

create type public.po_item_status as enum ('pending', 'partial', 'complete');

create type public.receipt_discrepancy as enum (
  'none', 'damaged', 'wrong', 'expired', 'missing', 'other'
);

-- ============================================================================
-- 2. SUPPLIERS
-- ============================================================================

create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 160),
  phone       text,
  email       text,
  address     text,
  notes       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index suppliers_business_idx on public.suppliers (business_id) where is_active;

create trigger suppliers_touch
  before update on public.suppliers
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 3. PRODUCT_SUPPLIERS  — variant-level link + per-supplier conversion
--    This is where buy-side conversion belongs (a product bought from two
--    suppliers may come in different pack sizes). Product-level unit fields
--    remain as a fallback for products with no supplier link.
-- ============================================================================

create table public.product_suppliers (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses(id) on delete cascade,
  variant_id         uuid not null references public.product_variants(id) on delete cascade,
  supplier_id        uuid not null references public.suppliers(id) on delete cascade,

  supplier_sku       text,
  purchase_unit      text not null default 'unit',        -- 'carton'
  conversion_to_base numeric(14,3) not null default 1     -- base units per purchase unit
                       check (conversion_to_base > 0),
  last_purchase_cost numeric(18,4) check (last_purchase_cost is null or last_purchase_cost >= 0),

  is_preferred       boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (variant_id, supplier_id)
);

create index product_suppliers_variant_idx  on public.product_suppliers (variant_id);
create index product_suppliers_supplier_idx on public.product_suppliers (supplier_id);

-- At most one preferred supplier per variant.
create unique index product_suppliers_one_preferred_idx
  on public.product_suppliers (variant_id) where is_preferred;

create trigger product_suppliers_touch
  before update on public.product_suppliers
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 4. PO NUMBER COUNTER (per business, like sale_counters)
-- ============================================================================

create table public.po_counters (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  next_number bigint not null default 0
);

alter table public.po_counters enable row level security;

-- ============================================================================
-- 5. PURCHASE ORDERS
-- ============================================================================

create table public.purchase_orders (
  id             uuid primary key,        -- client-generated
  business_id    uuid not null references public.businesses(id) on delete cascade,
  supplier_id    uuid not null references public.suppliers(id),
  location_id    uuid not null references public.locations(id),
  po_number      bigint not null,

  status         public.po_status not null default 'draft',
  expected_total numeric(18,4) not null default 0 check (expected_total >= 0),
  currency_code  char(3) not null,

  note           text,
  ordered_at     timestamptz,
  cancelled_at   timestamptz,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (business_id, po_number)
);

create index purchase_orders_business_status_idx on public.purchase_orders (business_id, status);
create index purchase_orders_supplier_idx on public.purchase_orders (supplier_id);

create trigger purchase_orders_touch
  before update on public.purchase_orders
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 6. PURCHASE ORDER ITEMS
--    conversion_to_base is SNAPSHOT at order time so a later supplier change
--    to pack size cannot retroactively alter an in-flight order's math.
-- ============================================================================

create table public.purchase_order_items (
  id                        uuid primary key default gen_random_uuid(),
  po_id                     uuid not null references public.purchase_orders(id) on delete cascade,
  business_id               uuid not null references public.businesses(id) on delete cascade,
  variant_id                uuid not null references public.product_variants(id),

  product_name              text not null,        -- snapshot
  purchase_unit             text not null,        -- snapshot
  conversion_to_base        numeric(14,3) not null check (conversion_to_base > 0),  -- snapshot

  qty_ordered_purchase      numeric(14,3) not null check (qty_ordered_purchase > 0),
  expected_unit_cost        numeric(18,4) not null default 0 check (expected_unit_cost >= 0),

  qty_received_base         numeric(14,3) not null default 0,   -- running total in base units
  status                    public.po_item_status not null default 'pending',

  created_at                timestamptz not null default now()
);

create index purchase_order_items_po_idx on public.purchase_order_items (po_id);
create index purchase_order_items_variant_idx on public.purchase_order_items (variant_id);

-- ============================================================================
-- 7. GOODS RECEIPTS  (a receiving event against a PO)
-- ============================================================================

create table public.goods_receipts (
  id          uuid primary key,           -- client-generated, idempotency key
  po_id       uuid not null references public.purchase_orders(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  received_by uuid references public.profiles(id) on delete set null,
  received_at timestamptz not null default now(),
  note        text,
  created_at  timestamptz not null default now()
);

create index goods_receipts_po_idx on public.goods_receipts (po_id);
create index goods_receipts_business_idx on public.goods_receipts (business_id, received_at desc);

-- ============================================================================
-- 8. GOODS RECEIPT ITEMS
--    Damaged/discrepancy quantities do NOT enter usable inventory; only
--    qty_good_base is passed to the ledger. Discrepancies are recorded here
--    for supplier communication and audit.
-- ============================================================================

create table public.goods_receipt_items (
  id                        uuid primary key default gen_random_uuid(),
  receipt_id                uuid not null references public.goods_receipts(id) on delete cascade,
  po_item_id                uuid not null references public.purchase_order_items(id),
  business_id               uuid not null references public.businesses(id) on delete cascade,
  variant_id                uuid not null references public.product_variants(id),

  qty_received_purchase     numeric(14,3) not null check (qty_received_purchase >= 0),
  qty_good_base             numeric(14,3) not null check (qty_good_base >= 0),   -- enters inventory
  qty_damaged_base          numeric(14,3) not null default 0 check (qty_damaged_base >= 0),
  qty_discrepancy_base      numeric(14,3) not null default 0 check (qty_discrepancy_base >= 0),
  discrepancy_reason        public.receipt_discrepancy not null default 'none',

  unit_cost_purchase        numeric(18,4) not null default 0 check (unit_cost_purchase >= 0),
  unit_cost_base            numeric(18,4) not null default 0 check (unit_cost_base >= 0),  -- derived

  note                      text,
  created_at                timestamptz not null default now()
);

create index goods_receipt_items_receipt_idx on public.goods_receipt_items (receipt_id);
create index goods_receipt_items_poitem_idx on public.goods_receipt_items (po_item_id);

-- ============================================================================
-- 9. RLS
-- ============================================================================

alter table public.suppliers            enable row level security;
alter table public.product_suppliers    enable row level security;
alter table public.purchase_orders      enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.goods_receipts       enable row level security;
alter table public.goods_receipt_items  enable row level security;

-- Suppliers & links: read for members, write for owner/manager.
create policy suppliers_select on public.suppliers
  for select using (public.is_member_of(business_id));
create policy suppliers_write on public.suppliers
  for all
  using      (public.has_role_in(business_id, array['owner','manager']::public.member_role[]))
  with check (public.has_role_in(business_id, array['owner','manager']::public.member_role[]));

create policy product_suppliers_select on public.product_suppliers
  for select using (public.is_member_of(business_id));
create policy product_suppliers_write on public.product_suppliers
  for all
  using      (public.has_role_in(business_id, array['owner','manager']::public.member_role[]))
  with check (public.has_role_in(business_id, array['owner','manager']::public.member_role[]));

-- Purchase orders: read for members; written via RPC (SECURITY DEFINER).
-- Draft editing before 'ordered' is allowed directly for owner/manager.
create policy purchase_orders_select on public.purchase_orders
  for select using (public.is_member_of(business_id));
create policy purchase_orders_write on public.purchase_orders
  for all
  using      (public.has_role_in(business_id, array['owner','manager']::public.member_role[]))
  with check (public.has_role_in(business_id, array['owner','manager']::public.member_role[]));

create policy po_items_select on public.purchase_order_items
  for select using (public.is_member_of(business_id));
create policy po_items_write on public.purchase_order_items
  for all
  using      (public.has_role_in(business_id, array['owner','manager']::public.member_role[]))
  with check (public.has_role_in(business_id, array['owner','manager']::public.member_role[]));

-- Receipts: read for members. Written only through receive_goods().
create policy goods_receipts_select on public.goods_receipts
  for select using (public.is_member_of(business_id));
create policy goods_receipt_items_select on public.goods_receipt_items
  for select using (public.is_member_of(business_id));

-- ============================================================================
-- 10. RPC: create_purchase_order
--     Creating a PO NEVER touches inventory. Snapshots conversion per line.
-- ============================================================================

create or replace function public.create_purchase_order(
  p_po_id       uuid,
  p_business_id uuid,
  p_supplier_id uuid,
  p_items       jsonb,          -- [{variant_id, qty_ordered_purchase, expected_unit_cost}]
  p_location_id uuid default null,
  p_status      text default 'draft',   -- 'draft' or 'ordered'
  p_note        text default null
)
returns public.purchase_orders
language plpgsql
security definer set search_path = public
as $$
declare
  v_user     uuid := (select auth.uid());
  v_existing public.purchase_orders;
  v_po       public.purchase_orders;
  v_number   bigint;
  v_currency char(3);
  v_location uuid;
  v_item     jsonb;
  v_variant  record;
  v_ps       record;
  v_qty      numeric(14,3);
  v_cost     numeric(18,4);
  v_conv     numeric(14,3);
  v_punit    text;
  v_pname    text;
  v_total    numeric(18,4) := 0;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if not public.has_role_in(p_business_id, array['owner','manager']::public.member_role[]) then
    raise exception 'Insufficient permission to create a purchase order.';
  end if;

  -- Idempotency.
  select * into v_existing from public.purchase_orders where id = p_po_id;
  if found then return v_existing; end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A purchase order must contain at least one item.';
  end if;
  if p_status not in ('draft','ordered') then
    raise exception 'A new PO status must be draft or ordered.';
  end if;

  v_location := coalesce(p_location_id,
    (select id from public.locations where business_id = p_business_id and is_default limit 1));
  if v_location is null then raise exception 'No default location.'; end if;

  select currency_code into v_currency from public.businesses where id = p_business_id;

  insert into public.po_counters (business_id, next_number)
  values (p_business_id, 1)
  on conflict (business_id)
    do update set next_number = public.po_counters.next_number + 1
  returning next_number into v_number;

  insert into public.purchase_orders (
    id, business_id, supplier_id, location_id, po_number, status,
    expected_total, currency_code, note, ordered_at, created_by
  ) values (
    p_po_id, p_business_id, p_supplier_id, v_location, v_number, p_status::public.po_status,
    0, v_currency, nullif(trim(coalesce(p_note,'')),''),
    case when p_status = 'ordered' then now() else null end, v_user
  )
  returning * into v_po;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty  := (v_item ->> 'qty_ordered_purchase')::numeric;
    v_cost := coalesce((v_item ->> 'expected_unit_cost')::numeric, 0);
    if v_qty is null or v_qty <= 0 then
      raise exception 'Each PO line needs a positive quantity.';
    end if;

    select v.id, p.name as product_name
      into v_variant
      from public.product_variants v
      join public.products p on p.id = v.product_id
     where v.id = (v_item ->> 'variant_id')::uuid
       and v.business_id = p_business_id;
    if not found then
      raise exception 'Variant % not found in this business.', v_item ->> 'variant_id';
    end if;

    -- Prefer the product_supplier conversion for THIS supplier; fall back to
    -- the product-level fields; finally default to 1:1.
    select purchase_unit, conversion_to_base
      into v_ps
      from public.product_suppliers
     where variant_id = v_variant.id and supplier_id = p_supplier_id;

    if found then
      v_punit := v_ps.purchase_unit;
      v_conv  := v_ps.conversion_to_base;
    else
      select coalesce(pr.purchase_unit, pr.base_unit),
             coalesce(pr.purchase_conversion_qty, 1)
        into v_punit, v_conv
        from public.product_variants vv
        join public.products pr on pr.id = vv.product_id
       where vv.id = v_variant.id;
    end if;

    insert into public.purchase_order_items (
      po_id, business_id, variant_id, product_name,
      purchase_unit, conversion_to_base,
      qty_ordered_purchase, expected_unit_cost
    ) values (
      p_po_id, p_business_id, v_variant.id, v_variant.product_name,
      v_punit, v_conv, v_qty, v_cost
    );

    v_total := v_total + round(v_qty * v_cost, 4);
  end loop;

  update public.purchase_orders set expected_total = v_total where id = p_po_id
  returning * into v_po;

  return v_po;
end;
$$;

-- ============================================================================
-- 11. RPC: receive_goods  — THE CORE OF THE PHASE
--     Converts purchase-unit quantities and costs to BASE units before the
--     ledger. Damaged/discrepancy qty never enters inventory. Atomic and
--     idempotent on the receipt id.
--
--     p_items jsonb, each:
--       {
--         "po_item_id": uuid,
--         "qty_received_purchase": number,   -- what physically arrived
--         "qty_good_purchase":     number,   -- of that, usable
--         "qty_damaged_base":      number,   -- optional, base units
--         "qty_discrepancy_base":  number,   -- optional, base units
--         "discrepancy_reason":    text,     -- 'none'|'damaged'|...
--         "unit_cost_purchase":    number,   -- actual cost per purchase unit
--         "movement_id":           uuid,     -- client-generated idempotency
--         "note":                  text
--       }
-- ============================================================================

create or replace function public.receive_goods(
  p_receipt_id  uuid,
  p_po_id       uuid,
  p_items       jsonb,
  p_note        text default null
)
returns public.goods_receipts
language plpgsql
security definer set search_path = public
as $$
declare
  v_user     uuid := (select auth.uid());
  v_existing public.goods_receipts;
  v_po       public.purchase_orders;
  v_receipt  public.goods_receipts;
  v_item     jsonb;
  v_poi      public.purchase_order_items;
  v_qty_good_base   numeric(14,3);
  v_unit_cost_base  numeric(18,4);
  v_good_purchase   numeric(14,3);
  v_outstanding     int;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;

  select * into v_po from public.purchase_orders where id = p_po_id;
  if not found then raise exception 'Purchase order not found.'; end if;

  -- Cashiers may receive stock (a warehouse task); managers/owners too.
  if not public.has_role_in(v_po.business_id,
       array['owner','manager','cashier']::public.member_role[]) then
    raise exception 'Insufficient permission to receive goods.';
  end if;

  if v_po.status in ('cancelled','completed') then
    raise exception 'Cannot receive against a % purchase order.', v_po.status;
  end if;

  -- Idempotency: replayed receipt returns unchanged.
  select * into v_existing from public.goods_receipts where id = p_receipt_id;
  if found then return v_existing; end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A receipt must contain at least one line.';
  end if;

  insert into public.goods_receipts (
    id, po_id, business_id, location_id, received_by, note
  ) values (
    p_receipt_id, p_po_id, v_po.business_id, v_po.location_id, v_user,
    nullif(trim(coalesce(p_note,'')),'')
  )
  returning * into v_receipt;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_poi from public.purchase_order_items
     where id = (v_item ->> 'po_item_id')::uuid and po_id = p_po_id;
    if not found then
      raise exception 'PO item % not on this order.', v_item ->> 'po_item_id';
    end if;

    v_good_purchase := coalesce((v_item ->> 'qty_good_purchase')::numeric, 0);

    -- CONVERSION — the anti-trap. Good qty and cost move to base units here,
    -- once, before anything touches the ledger.
    v_qty_good_base  := round(v_good_purchase * v_poi.conversion_to_base, 3);
    v_unit_cost_base := case
      when v_poi.conversion_to_base > 0
      then round(coalesce((v_item ->> 'unit_cost_purchase')::numeric, 0) / v_poi.conversion_to_base, 4)
      else 0 end;

    insert into public.goods_receipt_items (
      receipt_id, po_item_id, business_id, variant_id,
      qty_received_purchase, qty_good_base, qty_damaged_base, qty_discrepancy_base,
      discrepancy_reason, unit_cost_purchase, unit_cost_base, note
    ) values (
      p_receipt_id, v_poi.id, v_po.business_id, v_poi.variant_id,
      coalesce((v_item ->> 'qty_received_purchase')::numeric, 0),
      v_qty_good_base,
      coalesce((v_item ->> 'qty_damaged_base')::numeric, 0),
      coalesce((v_item ->> 'qty_discrepancy_base')::numeric, 0),
      coalesce((v_item ->> 'discrepancy_reason')::public.receipt_discrepancy, 'none'),
      coalesce((v_item ->> 'unit_cost_purchase')::numeric, 0),
      v_unit_cost_base,
      nullif(trim(coalesce(v_item ->> 'note','')),'')
    );

    -- Only usable stock enters inventory, at the CONVERTED per-base cost.
    if v_qty_good_base > 0 then
      perform public.record_stock_movement(
        p_movement_id     => (v_item ->> 'movement_id')::uuid,
        p_variant_id      => v_poi.variant_id,
        p_location_id     => v_po.location_id,
        p_movement_type   => 'restock',
        p_quantity        => v_qty_good_base,
        p_unit_cost       => v_unit_cost_base,
        p_purchase_unit_qty => v_good_purchase,
        p_purchase_unit   => v_poi.purchase_unit,
        p_reference_type  => 'goods_receipt',
        p_reference_id    => p_receipt_id,
        p_note            => 'Received against PO #' || v_po.po_number
      );
    end if;

    -- Update the PO line's running received total and status.
    update public.purchase_order_items
       set qty_received_base = qty_received_base + v_qty_good_base,
           status = case
             when qty_received_base + v_qty_good_base
                  >= (qty_ordered_purchase * conversion_to_base) then 'complete'
             when qty_received_base + v_qty_good_base > 0 then 'partial'
             else 'pending' end
     where id = v_poi.id;

    -- Keep the supplier's last purchase cost fresh (per purchase unit).
    update public.product_suppliers
       set last_purchase_cost = coalesce((v_item ->> 'unit_cost_purchase')::numeric, last_purchase_cost),
           updated_at = now()
     where variant_id = v_poi.variant_id and supplier_id = v_po.supplier_id;
  end loop;

  -- Recompute PO status from its lines.
  select count(*) into v_outstanding
    from public.purchase_order_items
   where po_id = p_po_id and status <> 'complete';

  update public.purchase_orders
     set status = case when v_outstanding = 0 then 'completed'
                       else 'partially_received' end,
         updated_at = now()
   where id = p_po_id;

  return v_receipt;
end;
$$;

-- ============================================================================
-- 12. RPC: restock_suggestions
--     Composes low-stock variants with their preferred supplier. No new store.
-- ============================================================================

create or replace function public.restock_suggestions(p_business_id uuid)
returns table (
  supplier_id       uuid,
  supplier_name     text,
  variant_id        uuid,
  product_name      text,
  variant_name      text,
  qty_on_hand       numeric,
  low_stock_threshold numeric,
  suggested_qty_base numeric,
  purchase_unit     text,
  conversion_to_base numeric,
  suggested_qty_purchase numeric,
  last_purchase_cost numeric
)
language plpgsql stable
security definer set search_path = public
as $$
begin
  if not public.is_member_of(p_business_id) then
    raise exception 'Not a member of this business.';
  end if;

  return query
  select
    s.id, s.name,
    vs.variant_id, vs.product_name, vs.variant_name,
    vs.qty_on_hand, vs.low_stock_threshold,
    -- target = threshold * 2 as a labelled default; UI may override
    greatest((vs.low_stock_threshold * 2) - vs.qty_on_hand, 0) as suggested_qty_base,
    coalesce(ps.purchase_unit, 'unit'),
    coalesce(ps.conversion_to_base, 1),
    ceil(greatest((vs.low_stock_threshold * 2) - vs.qty_on_hand, 0)
         / coalesce(ps.conversion_to_base, 1)) as suggested_qty_purchase,
    ps.last_purchase_cost
  from public.v_variant_stock vs
  left join public.product_suppliers ps
    on ps.variant_id = vs.variant_id and ps.is_preferred
  left join public.suppliers s on s.id = ps.supplier_id
  where vs.business_id = p_business_id
    and vs.is_active
    and vs.stock_status in ('low','out_of_stock','negative')
  order by s.name nulls last, vs.product_name;
end;
$$;

-- ============================================================================
-- 13. VIEWS: purchase history
-- ============================================================================

create or replace view public.v_purchase_order_summary
with (security_invoker = true) as
select
  po.id, po.business_id, po.supplier_id,
  s.name as supplier_name,
  po.po_number, po.status, po.expected_total, po.currency_code,
  po.ordered_at, po.created_at,
  (select count(*) from public.purchase_order_items pi where pi.po_id = po.id) as item_count,
  (select coalesce(sum(gri.qty_good_base * gri.unit_cost_base), 0)
     from public.goods_receipt_items gri
     join public.goods_receipts gr on gr.id = gri.receipt_id
    where gr.po_id = po.id) as received_value
from public.purchase_orders po
join public.suppliers s on s.id = po.supplier_id;

-- Per-variant purchase history (received lines), for supplier price trends.
create or replace view public.v_purchase_history
with (security_invoker = true) as
select
  gri.business_id,
  gri.variant_id,
  poi.product_name,
  gr.po_id,
  po.po_number,
  po.supplier_id,
  sup.name as supplier_name,
  gr.received_at,
  gri.qty_good_base,
  gri.unit_cost_base,
  gri.unit_cost_purchase,
  poi.purchase_unit,
  (gri.qty_good_base * gri.unit_cost_base) as line_value
from public.goods_receipt_items gri
join public.goods_receipts gr on gr.id = gri.receipt_id
join public.purchase_order_items poi on poi.id = gri.po_item_id
join public.purchase_orders po on po.id = gr.po_id
join public.suppliers sup on sup.id = po.supplier_id;

-- ============================================================================
-- 14. GRANTS
-- ============================================================================

grant select on public.v_purchase_order_summary to authenticated;
grant select on public.v_purchase_history       to authenticated;

grant execute on function
  public.create_purchase_order(uuid, uuid, uuid, jsonb, uuid, text, text) to authenticated;
grant execute on function
  public.receive_goods(uuid, uuid, jsonb, text) to authenticated;
grant execute on function
  public.restock_suggestions(uuid) to authenticated;
