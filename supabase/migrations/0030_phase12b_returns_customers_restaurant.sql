-- ============================================================================
-- PHASE 12B — returns linkage, customers, restaurant operations
--
-- STATUS: NOT APPLIED. Written for architect review per the 12B directive
-- ("bring the migration to Claude to review + apply live — do not assume it's
-- applied"). No UI in this repo depends on it yet, and none should until it is
-- confirmed live.
--
-- ----------------------------------------------------------------------------
-- AUDIT, re-confirmed against the schema in this repo (not from the brief):
--
--   Boutique variants        REUSE.  products.option_names text[] +
--                                    product_variants.option_values text[],
--                                    positionally matched. NOTE: the directive
--                                    describes option_values as jsonb — it is
--                                    text[]. Already read by the new variant
--                                    picker; no schema needed. DONE, no SQL.
--   Return inventory path    REUSE.  stock_movements has 'sale_reversal'
--                                    (0001) and void_sale already uses it
--                                    (0003). Not reinvented below.
--   Return refunds           REUSE.  financial_events + emit_financial_event.
--   Returns linkage          NEW.    §1 — sales has no parent/return marker.
--   Customers                NEW.    §2 — no customers table exists anywhere.
--   Line discounts           NEW.    §3 — sale_items has no discount column
--                                    AND complete_sale reads selling_price
--                                    server-side, so a discount typed at the
--                                    till today is silently NOT charged. The
--                                    config switch is disabled in the UI until
--                                    this lands.
--   Restaurant               NEW.    §4 — none of tables/areas/orders/
--                                    modifiers exist.
-- ============================================================================

-- ============================================================================
-- 1. RETURNS LINKAGE
--
--    A return is a SALE, not a new kind of object: same table, same numbering,
--    same ledger, negative quantities. That keeps one revenue history instead
--    of two that have to be reconciled. All it was missing is a pointer back
--    to what it reverses.
-- ============================================================================
alter table public.sales
  add column if not exists parent_sale_id uuid references public.sales(id),
  add column if not exists is_return boolean not null default false;

create index if not exists sales_parent_idx
  on public.sales (parent_sale_id) where parent_sale_id is not null;

-- A return must point at something, and a normal sale must not.
alter table public.sales drop constraint if exists sales_return_has_parent;
alter table public.sales add constraint sales_return_has_parent
  check ((is_return and parent_sale_id is not null) or (not is_return));

-- ============================================================================
-- 2. CUSTOMERS  (gated by business_pos_config.capture_customer)
--
--    Deliberately minimal. This is "who was this sale for" for a boutique that
--    wants to process an exchange six weeks later — not a CRM. Anything richer
--    should be argued for on its own merits rather than smuggled in here.
-- ============================================================================
create table if not exists public.customers (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  name         text not null,
  phone        text,
  email        text,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists customers_business_idx on public.customers (business_id, name);
-- Phone is how a shop actually looks someone up at the counter.
create index if not exists customers_phone_idx
  on public.customers (business_id, phone) where phone is not null;

drop trigger if exists customers_touch on public.customers;
create trigger customers_touch
  before update on public.customers
  for each row execute function public.touch_updated_at();

alter table public.customers enable row level security;

drop policy if exists customers_read on public.customers;
create policy customers_read on public.customers
  for select to authenticated using (public.is_member_of(business_id));

-- A cashier creates customers at the counter; that is the whole point.
drop policy if exists customers_write on public.customers;
create policy customers_write on public.customers
  for all to authenticated
  using (public.has_role_in(business_id,
         array['owner','manager','cashier']::public.member_role[]))
  with check (public.has_role_in(business_id,
         array['owner','manager','cashier']::public.member_role[]));

alter table public.sales
  add column if not exists customer_id uuid references public.customers(id) on delete set null;
create index if not exists sales_customer_idx
  on public.sales (customer_id) where customer_id is not null;

-- ============================================================================
-- 3. LINE DISCOUNTS
--
--    sale_items gets the columns, and complete_sale is extended to accept an
--    optional per-line discount. The price itself is STILL read server-side —
--    the client may propose a discount, never a price. Without this the
--    allow_line_discount switch cannot be honoured at all, because the RPC
--    recomputes every line from selling_price and would charge full price
--    whatever the till displayed.
-- ============================================================================
alter table public.sale_items
  add column if not exists discount_amount numeric(18,4) not null default 0
    check (discount_amount >= 0);

-- ============================================================================
-- 4. RESTAURANT OPERATIONS
--
--    Why not held_baskets: a held basket is a parked cart with no identity of
--    its own. A restaurant order is a long-lived object that a table points at,
--    that several people touch, that changes state (ordered → preparing →
--    served), and that carries per-item modifiers. Overloading held_baskets
--    would mean a status column, a table column, an items table and a
--    modifiers table hanging off a jsonb blob — at which point it is a new
--    table wearing the wrong name.
--
--    Checkout is unchanged: closing an order calls complete_sale like every
--    other sale, and the restaurant flow feeds the same sales/financial spine.
-- ============================================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'table_state') then
    create type public.table_state as enum
      ('available','seated','ordering','served','bill','cleaning');
  end if;
  if not exists (select 1 from pg_type where typname = 'restaurant_order_state') then
    create type public.restaurant_order_state as enum
      ('open','sent','preparing','ready','served','closed','cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'service_mode') then
    create type public.service_mode as enum ('dine_in','takeaway','delivery');
  end if;
end $$;

create table if not exists public.dining_areas (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists dining_areas_business_idx on public.dining_areas (business_id, sort_order);

create table if not exists public.dining_tables (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  area_id     uuid references public.dining_areas(id) on delete set null,
  label       text not null,
  seats       integer not null default 2 check (seats > 0),
  state       public.table_state not null default 'available',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists dining_tables_label_idx
  on public.dining_tables (business_id, label);

drop trigger if exists dining_tables_touch on public.dining_tables;
create trigger dining_tables_touch
  before update on public.dining_tables
  for each row execute function public.touch_updated_at();

create table if not exists public.restaurant_orders (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  location_id  uuid not null references public.locations(id),
  table_id     uuid references public.dining_tables(id) on delete set null,
  service_mode public.service_mode not null default 'dine_in',
  state        public.restaurant_order_state not null default 'open',
  -- Who is serving it. Same accountability chain as a shift or a sale.
  opened_by    uuid references public.business_members(id) on delete set null,
  shift_id     uuid references public.cash_shifts(id) on delete set null,
  guest_count  integer check (guest_count is null or guest_count > 0),
  note         text,
  -- Set when the order is closed through complete_sale. THIS is the join back
  -- to the money: an order is not revenue, the sale it produced is.
  sale_id      uuid references public.sales(id) on delete set null,
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz,
  updated_at   timestamptz not null default now()
);
create index if not exists restaurant_orders_open_idx
  on public.restaurant_orders (business_id, state) where state <> 'closed';
create index if not exists restaurant_orders_table_idx
  on public.restaurant_orders (table_id) where table_id is not null;

drop trigger if exists restaurant_orders_touch on public.restaurant_orders;
create trigger restaurant_orders_touch
  before update on public.restaurant_orders
  for each row execute function public.touch_updated_at();

create table if not exists public.restaurant_order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.restaurant_orders(id) on delete cascade,
  business_id  uuid not null references public.businesses(id) on delete cascade,
  variant_id   uuid not null references public.product_variants(id),
  quantity     numeric(14,3) not null check (quantity > 0),
  -- A price is snapshotted when the item is ordered, because a menu price
  -- change mid-service must not silently reprice a table that already ordered.
  unit_price   numeric(18,4) not null check (unit_price >= 0),
  state        public.restaurant_order_state not null default 'open',
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists restaurant_order_items_order_idx
  on public.restaurant_order_items (order_id);

-- Modifiers are per ORDER ITEM, not per product: "no onions" belongs to one
-- burger on one table, not to the burger in the catalog.
create table if not exists public.restaurant_order_item_modifiers (
  id            uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.restaurant_order_items(id) on delete cascade,
  business_id   uuid not null references public.businesses(id) on delete cascade,
  label         text not null,
  price_delta   numeric(18,4) not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists restaurant_modifiers_item_idx
  on public.restaurant_order_item_modifiers (order_item_id);

-- The reusable menu of modifiers an operator picks from.
create table if not exists public.modifier_options (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  group_name  text not null,
  label       text not null,
  price_delta numeric(18,4) not null default 0,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists modifier_options_business_idx
  on public.modifier_options (business_id, group_name, sort_order);

-- ---------------------------------------------------------------------------
-- RLS. Same conventions as everything else: per-business isolation through the
-- existing SECURITY DEFINER helpers, never a bespoke predicate.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'dining_areas','dining_tables','restaurant_orders',
    'restaurant_order_items','restaurant_order_item_modifiers','modifier_options'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format(
      'create policy %I_read on public.%I for select to authenticated
         using (public.is_member_of(business_id))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    -- Waiting staff are cashiers in this model: they seat, order and serve.
    execute format(
      'create policy %I_write on public.%I for all to authenticated
         using (public.has_role_in(business_id,
                array[''owner'',''manager'',''cashier'']::public.member_role[]))
         with check (public.has_role_in(business_id,
                array[''owner'',''manager'',''cashier'']::public.member_role[]))', t, t);
  end loop;
end $$;

grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.dining_areas to authenticated;
grant select, insert, update, delete on public.dining_tables to authenticated;
grant select, insert, update, delete on public.restaurant_orders to authenticated;
grant select, insert, update, delete on public.restaurant_order_items to authenticated;
grant select, insert, update, delete on public.restaurant_order_item_modifiers to authenticated;
grant select, insert, update, delete on public.modifier_options to authenticated;

-- ============================================================================
-- 5. OPEN QUESTIONS FOR REVIEW — do not apply without deciding these
--
-- (a) complete_sale must be extended before returns or discounts can work:
--       * accept `p_discount` per item and write sale_items.discount_amount,
--         still deriving unit_price server-side;
--       * accept negative quantities (or a p_is_return flag) so a return
--         reverses stock through 'sale_reversal' and posts a refund through
--         emit_financial_event;
--       * set parent_sale_id / is_return.
--     That is a change to the ONE function every sale in the system goes
--     through, so it is deliberately not written here on my own judgement.
--
-- (b) Should a return be blocked when it would exceed the original quantity?
--     Server-side check, and it needs a rule for partial returns across
--     multiple visits.
--
-- (c) Table state vs order state overlap: a table is 'seated' while its order
--     is 'open'. Two sources of truth that can disagree. Either derive table
--     state from its open order, or accept the denormalisation and write both
--     in one RPC. My preference is to derive it.
--
-- (d) restaurant_orders.opened_by references business_members, but sales.sold_by
--     references profiles. Inconsistent — worth settling before more tables
--     copy one or the other.
-- ============================================================================
