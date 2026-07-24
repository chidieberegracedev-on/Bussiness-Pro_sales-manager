-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0001 — Foundation, Products, Variants, Inventory
--
-- Scope: authentication profiles, businesses, memberships, locations,
--        product categories, products, variants, inventory levels,
--        and the append-only stock movement ledger.
--
-- Not in this migration: sales, transactions, receipts, suppliers, tax.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";   -- fuzzy product name search

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

create type public.member_role   as enum ('owner', 'manager', 'cashier');
create type public.member_status as enum ('active', 'invited', 'suspended');

create type public.stock_movement_type as enum (
  'initial',        -- opening stock when a variant is created
  'restock',        -- purchased / received stock (inbound)
  'sale',           -- sold (outbound)  [Phase 3]
  'sale_reversal',  -- return / voided sale (inbound)  [Phase 3]
  'adjustment',     -- manual correction (either direction)
  'damage',         -- write-off (outbound)
  'transfer_in',    -- multi-location  [future]
  'transfer_out'    -- multi-location  [future]
);

-- ============================================================================
-- 2. SHARED TRIGGER HELPERS
-- ============================================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.deny_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'stock_movements is append-only. Record a correcting adjustment instead of editing history.';
end;
$$;

-- ============================================================================
-- 3. PROFILES
-- ============================================================================

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  avatar_path text,
  locale      text not null default 'en-US',   -- BCP 47, drives number/date formatting
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Auto-create a profile row whenever a Supabase auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, locale)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'locale', ''), 'en-US')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 4. BUSINESSES
-- ============================================================================

create table public.businesses (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(trim(name)) between 1 and 120),

  -- Money. currency_code is ISO 4217. currency_exponent is the number of minor
  -- units (2 for USD/EUR/NGN, 0 for JPY/KRW, 3 for KWD/BHD/OMR). It is stored
  -- rather than looked up so historical formatting stays stable.
  currency_code     char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  currency_exponent smallint not null default 2 check (currency_exponent between 0 and 4),

  -- IANA timezone. Drives what "today" means for every report and dashboard.
  timezone          text not null default 'UTC',
  country_code      char(2) check (country_code ~ '^[A-Z]{2}$'),  -- ISO 3166-1 alpha-2

  logo_path         text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger businesses_touch
  before update on public.businesses
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 5. MEMBERSHIPS
-- ============================================================================

create table public.business_members (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  user_id      uuid not null references public.profiles(id)   on delete cascade,
  role         public.member_role   not null default 'cashier',
  status       public.member_status not null default 'active',
  display_name text,

  -- Reserved for shared-terminal PIN sign-in (see DATA_MODEL.md §Auth).
  -- Not used in Phase 1-2. Never store a raw PIN.
  pin_hash     text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (business_id, user_id)
);

create index business_members_lookup_idx
  on public.business_members (user_id, business_id)
  where status = 'active';

create trigger business_members_touch
  before update on public.business_members
  for each row execute function public.touch_updated_at();

-- A business must always retain at least one active owner.
create or replace function public.guard_last_owner()
returns trigger
language plpgsql
as $$
declare
  v_owners int;
begin
  if (tg_op = 'DELETE' and old.role = 'owner')
     or (tg_op = 'UPDATE' and old.role = 'owner'
         and (new.role <> 'owner' or new.status <> 'active')) then
    select count(*) into v_owners
      from public.business_members
     where business_id = old.business_id
       and role = 'owner'
       and status = 'active'
       and id <> old.id;
    if v_owners = 0 then
      raise exception 'A business must have at least one active owner.';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger business_members_guard_owner
  before update or delete on public.business_members
  for each row execute function public.guard_last_owner();

-- ============================================================================
-- 6. LOCATIONS
--    V1 uses exactly one default location per business. The table exists now
--    so multi-location becomes an additive feature rather than a migration.
-- ============================================================================

create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 120),
  is_default  boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index locations_one_default_idx
  on public.locations (business_id)
  where is_default;

create index locations_business_idx on public.locations (business_id);

create trigger locations_touch
  before update on public.locations
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 7. PRODUCT CATEGORIES
-- ============================================================================

create table public.product_categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 60),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index product_categories_unique_name_idx
  on public.product_categories (business_id, lower(name));

create trigger product_categories_touch
  before update on public.product_categories
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 8. PRODUCTS
--
--    Every product has at least one variant. A "simple" product has exactly
--    one default variant with empty option_values, hidden from the UI.
--    This keeps stock, price, cost, SKU, and barcode in exactly one place.
-- ============================================================================

create table public.products (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 200),
  description text,
  category_id uuid references public.product_categories(id) on delete set null,
  image_path  text,

  -- Units. Stock is ALWAYS counted and stored in base_unit.
  -- purchase_unit + purchase_conversion_qty describe how the business buys.
  -- Example: base_unit='piece', purchase_unit='carton', conversion=24.
  base_unit               text not null default 'piece',
  purchase_unit           text,
  purchase_conversion_qty numeric(14,3)
    check (purchase_conversion_qty is null or purchase_conversion_qty > 0),

  -- UI hint only. Business logic never branches on this.
  has_variants boolean not null default false,

  -- Ordered option dimension names, e.g. {'Size','Color'}. Empty for simple.
  option_names text[] not null default '{}',

  is_active   boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint products_purchase_unit_pair check (
    (purchase_unit is null and purchase_conversion_qty is null) or
    (purchase_unit is not null and purchase_conversion_qty is not null)
  ),
  constraint products_option_names_len check (cardinality(option_names) <= 3)
);

create index products_business_idx  on public.products (business_id) where is_active;
create index products_category_idx  on public.products (category_id);
create index products_name_trgm_idx on public.products using gin (name gin_trgm_ops);

create trigger products_touch
  before update on public.products
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 9. PRODUCT VARIANTS
-- ============================================================================

create table public.product_variants (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  product_id   uuid not null references public.products(id)   on delete cascade,

  -- Positionally matches products.option_names. Empty for the default variant.
  option_values text[] not null default '{}',
  variant_name  text,   -- denormalized display label, e.g. 'Medium / Blue'

  sku     text,
  barcode text,   -- EAN-13, UPC-A, EAN-8, Code 128 — no format enforced

  selling_price       numeric(18,4) not null default 0 check (selling_price >= 0),
  low_stock_threshold numeric(14,3) not null default 0 check (low_stock_threshold >= 0),

  is_active  boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index product_variants_options_idx
  on public.product_variants (product_id, option_values);

create unique index product_variants_one_default_idx
  on public.product_variants (product_id)
  where is_default;

create unique index product_variants_sku_idx
  on public.product_variants (business_id, lower(sku))
  where sku is not null;

create unique index product_variants_barcode_idx
  on public.product_variants (business_id, barcode)
  where barcode is not null;

create index product_variants_product_idx on public.product_variants (product_id);

create trigger product_variants_touch
  before update on public.product_variants
  for each row execute function public.touch_updated_at();

-- option_values must have the same arity as the parent product's option_names.
create or replace function public.check_variant_options()
returns trigger
language plpgsql
as $$
declare
  v_expected int;
begin
  select cardinality(option_names) into v_expected
    from public.products where id = new.product_id;

  if cardinality(new.option_values) <> v_expected then
    raise exception
      'Variant has % option value(s) but the product defines % option dimension(s).',
      cardinality(new.option_values), v_expected;
  end if;
  return new;
end;
$$;

create trigger product_variants_check_options
  before insert or update of option_values, product_id on public.product_variants
  for each row execute function public.check_variant_options();

-- ============================================================================
-- 10. INVENTORY LEVELS  (cached projection of the ledger)
--     Source of truth is stock_movements. This table exists for fast reads
--     and is maintained exclusively by record_stock_movement().
-- ============================================================================

create table public.inventory_levels (
  variant_id  uuid not null references public.product_variants(id) on delete cascade,
  location_id uuid not null references public.locations(id)        on delete cascade,
  business_id uuid not null references public.businesses(id)       on delete cascade,

  qty_on_hand numeric(14,3) not null default 0,          -- may be negative
  avg_cost    numeric(18,4) not null default 0 check (avg_cost >= 0),

  updated_at  timestamptz not null default now(),
  primary key (variant_id, location_id)
);

create index inventory_levels_business_idx on public.inventory_levels (business_id);

-- ============================================================================
-- 11. STOCK MOVEMENTS  (append-only ledger — the source of truth)
-- ============================================================================

create table public.stock_movements (
  -- Client-generated UUID. Doubles as the idempotency key so a retried or
  -- replayed request can never create a duplicate movement.
  id          uuid primary key,

  business_id uuid not null references public.businesses(id)       on delete cascade,
  location_id uuid not null references public.locations(id),
  variant_id  uuid not null references public.product_variants(id),

  movement_type public.stock_movement_type not null,

  -- SIGNED, always expressed in the product's base_unit.
  -- Positive = inbound, negative = outbound.
  quantity  numeric(14,3) not null check (quantity <> 0),

  -- Cost per base unit attributable to THIS movement.
  -- Inbound: actual purchase cost. Outbound: COGS at the moving average.
  unit_cost numeric(18,4) not null default 0 check (unit_cost >= 0),

  -- Immutable running-balance snapshots, written at insert time.
  qty_after      numeric(14,3) not null,
  avg_cost_after numeric(18,4) not null,

  -- Optional record of how the stock was entered, for receipts and audit.
  -- e.g. purchase_unit_qty = 2, purchase_unit = 'carton' -> quantity = 48
  purchase_unit_qty numeric(14,3),
  purchase_unit     text,

  reference_type text,   -- 'sale' | 'restock_batch' | 'adjustment' | ...
  reference_id   uuid,

  note       text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index stock_movements_business_time_idx
  on public.stock_movements (business_id, created_at desc);
create index stock_movements_variant_time_idx
  on public.stock_movements (variant_id, created_at desc);
create index stock_movements_reference_idx
  on public.stock_movements (reference_type, reference_id);

create trigger stock_movements_no_update
  before update on public.stock_movements
  for each row execute function public.deny_mutation();

create trigger stock_movements_no_delete
  before delete on public.stock_movements
  for each row execute function public.deny_mutation();

-- ============================================================================
-- 12. AUTHORIZATION HELPERS
--     SECURITY DEFINER so RLS policies on business_members do not recurse.
-- ============================================================================

create or replace function public.is_member_of(p_business uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.business_members
     where business_id = p_business
       and user_id = (select auth.uid())
       and status  = 'active'
  );
$$;

create or replace function public.has_role_in(p_business uuid, p_roles public.member_role[])
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.business_members
     where business_id = p_business
       and user_id = (select auth.uid())
       and status  = 'active'
       and role    = any(p_roles)
  );
$$;

create or replace function public.shares_business_with(p_user uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1
      from public.business_members me
      join public.business_members them using (business_id)
     where me.user_id = (select auth.uid())
       and me.status = 'active'
       and them.user_id = p_user
       and them.status = 'active'
  );
$$;

-- ============================================================================
-- 13. ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles           enable row level security;
alter table public.businesses         enable row level security;
alter table public.business_members   enable row level security;
alter table public.locations          enable row level security;
alter table public.product_categories enable row level security;
alter table public.products           enable row level security;
alter table public.product_variants   enable row level security;
alter table public.inventory_levels   enable row level security;
alter table public.stock_movements    enable row level security;

-- ---- profiles --------------------------------------------------------------
create policy profiles_select_self_or_colleague on public.profiles
  for select using (id = (select auth.uid()) or public.shares_business_with(id));

create policy profiles_update_self on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---- businesses ------------------------------------------------------------
-- INSERT is intentionally absent: businesses are created via create_business().
create policy businesses_select_member on public.businesses
  for select using (public.is_member_of(id));

create policy businesses_update_owner_manager on public.businesses
  for update using (public.has_role_in(id, array['owner','manager']::public.member_role[]))
  with check     (public.has_role_in(id, array['owner','manager']::public.member_role[]));

create policy businesses_delete_owner on public.businesses
  for delete using (public.has_role_in(id, array['owner']::public.member_role[]));

-- ---- business_members ------------------------------------------------------
create policy members_select_member on public.business_members
  for select using (public.is_member_of(business_id));

create policy members_write_owner_manager on public.business_members
  for all
  using      (public.has_role_in(business_id, array['owner','manager']::public.member_role[]))
  with check (public.has_role_in(business_id, array['owner','manager']::public.member_role[]));

-- ---- generic business-scoped tables ---------------------------------------
create policy locations_select on public.locations
  for select using (public.is_member_of(business_id));
create policy locations_write on public.locations
  for all
  using      (public.has_role_in(business_id, array['owner','manager']::public.member_role[]))
  with check (public.has_role_in(business_id, array['owner','manager']::public.member_role[]));

create policy categories_select on public.product_categories
  for select using (public.is_member_of(business_id));
create policy categories_write on public.product_categories
  for all
  using      (public.has_role_in(business_id, array['owner','manager']::public.member_role[]))
  with check (public.has_role_in(business_id, array['owner','manager']::public.member_role[]));

create policy products_select on public.products
  for select using (public.is_member_of(business_id));
create policy products_write on public.products
  for all
  using      (public.has_role_in(business_id, array['owner','manager']::public.member_role[]))
  with check (public.has_role_in(business_id, array['owner','manager']::public.member_role[]));

create policy variants_select on public.product_variants
  for select using (public.is_member_of(business_id));
create policy variants_write on public.product_variants
  for all
  using      (public.has_role_in(business_id, array['owner','manager']::public.member_role[]))
  with check (public.has_role_in(business_id, array['owner','manager']::public.member_role[]));

-- ---- inventory: read-only to clients; written only by RPC -----------------
create policy inventory_levels_select on public.inventory_levels
  for select using (public.is_member_of(business_id));

create policy stock_movements_select on public.stock_movements
  for select using (public.is_member_of(business_id));

-- ============================================================================
-- 14. RPC: create_business
--     Business + owner membership + default location, atomically.
-- ============================================================================

create or replace function public.create_business(
  p_name              text,
  p_currency_code     char(3),
  p_currency_exponent smallint default 2,
  p_timezone          text     default 'UTC',
  p_country_code      char(2)  default null,
  p_location_name     text     default 'Main Location'
)
returns public.businesses
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_biz  public.businesses;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  insert into public.businesses (name, currency_code, currency_exponent, timezone, country_code)
  values (trim(p_name), upper(p_currency_code), p_currency_exponent, p_timezone, upper(p_country_code))
  returning * into v_biz;

  insert into public.business_members (business_id, user_id, role, status)
  values (v_biz.id, v_user, 'owner', 'active');

  insert into public.locations (business_id, name, is_default)
  values (v_biz.id, coalesce(nullif(trim(p_location_name), ''), 'Main Location'), true);

  return v_biz;
end;
$$;

-- ============================================================================
-- 15. RPC: record_stock_movement
--     The ONLY path that writes inventory. Idempotent, row-locked, and
--     responsible for moving weighted-average cost.
-- ============================================================================

create or replace function public.record_stock_movement(
  p_movement_id       uuid,
  p_variant_id        uuid,
  p_location_id       uuid,
  p_movement_type     public.stock_movement_type,
  p_quantity          numeric,
  p_unit_cost         numeric default null,
  p_purchase_unit_qty numeric default null,
  p_purchase_unit     text    default null,
  p_reference_type    text    default null,
  p_reference_id      uuid    default null,
  p_note              text    default null
)
returns public.stock_movements
language plpgsql
security definer set search_path = public
as $$
declare
  v_user     uuid := (select auth.uid());
  v_existing public.stock_movements;
  v_business uuid;
  v_level    public.inventory_levels;
  v_qty_before numeric(14,3);
  v_avg_before numeric(18,4);
  v_qty_after  numeric(14,3);
  v_avg_after  numeric(18,4);
  v_cost       numeric(18,4);
  v_row        public.stock_movements;
  v_allowed    public.member_role[];
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;
  if p_quantity is null or p_quantity = 0 then
    raise exception 'Movement quantity must be non-zero.';
  end if;

  -- Idempotency: a replayed movement id returns the original row untouched.
  select * into v_existing from public.stock_movements where id = p_movement_id;
  if found then
    return v_existing;
  end if;

  select business_id into v_business
    from public.product_variants where id = p_variant_id;
  if v_business is null then
    raise exception 'Variant not found.';
  end if;

  -- Sales may be recorded by cashiers; all other movement types are
  -- inventory management and require manager or owner.
  if p_movement_type in ('sale', 'sale_reversal') then
    v_allowed := array['owner','manager','cashier']::public.member_role[];
  else
    v_allowed := array['owner','manager']::public.member_role[];
  end if;

  if not public.has_role_in(v_business, v_allowed) then
    raise exception 'Insufficient permission to record this movement.';
  end if;

  if not exists (
    select 1 from public.locations
     where id = p_location_id and business_id = v_business
  ) then
    raise exception 'Location does not belong to this business.';
  end if;

  -- Serialize concurrent movements against the same variant/location.
  select * into v_level
    from public.inventory_levels
   where variant_id = p_variant_id and location_id = p_location_id
     for update;

  if not found then
    insert into public.inventory_levels (variant_id, location_id, business_id)
    values (p_variant_id, p_location_id, v_business)
    on conflict (variant_id, location_id) do nothing;

    select * into v_level
      from public.inventory_levels
     where variant_id = p_variant_id and location_id = p_location_id
       for update;
  end if;

  v_qty_before := v_level.qty_on_hand;
  v_avg_before := v_level.avg_cost;
  v_qty_after  := v_qty_before + p_quantity;

  if p_quantity > 0 then
    -- Inbound. Fall back to the current average when no cost is supplied
    -- (e.g. a positive adjustment correcting a miscount).
    v_cost := coalesce(p_unit_cost, v_avg_before);

    if v_qty_before <= 0 then
      -- No meaningful prior cost basis; the incoming cost becomes the basis.
      v_avg_after := v_cost;
    else
      v_avg_after := ((v_qty_before * v_avg_before) + (p_quantity * v_cost)) / v_qty_after;
    end if;
  else
    -- Outbound. Cost of goods leaving is the average at this instant.
    -- Outbound movements never change the average.
    v_cost      := v_avg_before;
    v_avg_after := v_avg_before;
  end if;

  begin
    insert into public.stock_movements (
      id, business_id, location_id, variant_id, movement_type,
      quantity, unit_cost, qty_after, avg_cost_after,
      purchase_unit_qty, purchase_unit,
      reference_type, reference_id, note, created_by
    ) values (
      p_movement_id, v_business, p_location_id, p_variant_id, p_movement_type,
      p_quantity, v_cost, v_qty_after, v_avg_after,
      p_purchase_unit_qty, p_purchase_unit,
      p_reference_type, p_reference_id, nullif(trim(coalesce(p_note,'')), ''), v_user
    )
    returning * into v_row;
  exception when unique_violation then
    -- Concurrent replay of the same movement id.
    select * into v_row from public.stock_movements where id = p_movement_id;
    return v_row;
  end;

  update public.inventory_levels
     set qty_on_hand = v_qty_after,
         avg_cost    = v_avg_after,
         updated_at  = now()
   where variant_id = p_variant_id and location_id = p_location_id;

  return v_row;
end;
$$;

-- ============================================================================
-- 16. RPC: create_product
--     Product + variants + inventory level rows + optional opening stock,
--     in a single transaction.
--
--     p_variants is a JSON array. Each element:
--       {
--         "id":                  "<uuid>",           -- optional, client-generated
--         "option_values":       ["Medium","Blue"],  -- [] for a simple product
--         "variant_name":        "Medium / Blue",
--         "sku":                 "SHIRT-M-BLU",
--         "barcode":             "5012345678900",
--         "selling_price":       25.00,
--         "low_stock_threshold": 5,
--         "opening_qty":         12,                 -- optional, base units
--         "opening_unit_cost":   14.50,              -- required if opening_qty > 0
--         "opening_movement_id": "<uuid>"            -- optional idempotency key
--       }
-- ============================================================================

create or replace function public.create_product(
  p_business_id             uuid,
  p_name                    text,
  p_variants                jsonb,
  p_description             text    default null,
  p_category_id             uuid    default null,
  p_image_path              text    default null,
  p_base_unit               text    default 'piece',
  p_purchase_unit           text    default null,
  p_purchase_conversion_qty numeric default null,
  p_option_names            text[]  default '{}',
  p_location_id             uuid    default null
)
returns public.products
language plpgsql
security definer set search_path = public
as $$
declare
  v_product   public.products;
  v_location  uuid;
  v_variant   jsonb;
  v_variant_id uuid;
  v_index     int := 0;
  v_opening   numeric(14,3);
begin
  if not public.has_role_in(p_business_id, array['owner','manager']::public.member_role[]) then
    raise exception 'Insufficient permission to create products.';
  end if;

  if p_variants is null or jsonb_array_length(p_variants) = 0 then
    raise exception 'A product must have at least one variant.';
  end if;

  v_location := coalesce(
    p_location_id,
    (select id from public.locations
      where business_id = p_business_id and is_default limit 1)
  );
  if v_location is null then
    raise exception 'No default location found for this business.';
  end if;

  insert into public.products (
    business_id, name, description, category_id, image_path,
    base_unit, purchase_unit, purchase_conversion_qty,
    has_variants, option_names, created_by
  ) values (
    p_business_id, trim(p_name), p_description, p_category_id, p_image_path,
    p_base_unit, p_purchase_unit, p_purchase_conversion_qty,
    cardinality(p_option_names) > 0, p_option_names, (select auth.uid())
  )
  returning * into v_product;

  for v_variant in select * from jsonb_array_elements(p_variants)
  loop
    v_variant_id := coalesce((v_variant ->> 'id')::uuid, gen_random_uuid());

    insert into public.product_variants (
      id, business_id, product_id, option_values, variant_name,
      sku, barcode, selling_price, low_stock_threshold, is_default
    ) values (
      v_variant_id,
      p_business_id,
      v_product.id,
      coalesce(
        (select array_agg(value::text order by ordinality)
           from jsonb_array_elements_text(coalesce(v_variant -> 'option_values', '[]'::jsonb))
                with ordinality),
        '{}'
      ),
      nullif(trim(coalesce(v_variant ->> 'variant_name', '')), ''),
      nullif(trim(coalesce(v_variant ->> 'sku', '')), ''),
      nullif(trim(coalesce(v_variant ->> 'barcode', '')), ''),
      coalesce((v_variant ->> 'selling_price')::numeric, 0),
      coalesce((v_variant ->> 'low_stock_threshold')::numeric, 0),
      v_index = 0
    );

    insert into public.inventory_levels (variant_id, location_id, business_id)
    values (v_variant_id, v_location, p_business_id)
    on conflict do nothing;

    v_opening := coalesce((v_variant ->> 'opening_qty')::numeric, 0);
    if v_opening > 0 then
      perform public.record_stock_movement(
        p_movement_id   => coalesce((v_variant ->> 'opening_movement_id')::uuid, gen_random_uuid()),
        p_variant_id    => v_variant_id,
        p_location_id   => v_location,
        p_movement_type => 'initial',
        p_quantity      => v_opening,
        p_unit_cost     => coalesce((v_variant ->> 'opening_unit_cost')::numeric, 0),
        p_note          => 'Opening stock'
      );
    end if;

    v_index := v_index + 1;
  end loop;

  return v_product;
end;
$$;

-- ============================================================================
-- 17. RPC: recalculate_inventory_level
--     Rebuilds the cached level from the ledger. Used by the reconciliation
--     check and available to owners/managers for repair.
-- ============================================================================

create or replace function public.recalculate_inventory_level(
  p_variant_id  uuid,
  p_location_id uuid
)
returns public.inventory_levels
language plpgsql
security definer set search_path = public
as $$
declare
  v_business uuid;
  v_last     public.stock_movements;
  v_level    public.inventory_levels;
begin
  select business_id into v_business
    from public.product_variants where id = p_variant_id;

  if not public.has_role_in(v_business, array['owner','manager']::public.member_role[]) then
    raise exception 'Insufficient permission.';
  end if;

  select * into v_last
    from public.stock_movements
   where variant_id = p_variant_id and location_id = p_location_id
   order by created_at desc, id desc
   limit 1;

  update public.inventory_levels
     set qty_on_hand = coalesce((
           select sum(quantity) from public.stock_movements
            where variant_id = p_variant_id and location_id = p_location_id
         ), 0),
         avg_cost   = coalesce(v_last.avg_cost_after, 0),
         updated_at = now()
   where variant_id = p_variant_id and location_id = p_location_id
  returning * into v_level;

  return v_level;
end;
$$;

-- ============================================================================
-- 18. VIEWS
-- ============================================================================

-- Flattened variant + stock view for list screens and low-stock detection.
create or replace view public.v_variant_stock
with (security_invoker = true) as
select
  v.id                as variant_id,
  v.business_id,
  v.product_id,
  p.name              as product_name,
  p.image_path,
  p.base_unit,
  p.has_variants,
  p.category_id,
  c.name              as category_name,
  v.variant_name,
  v.option_values,
  v.sku,
  v.barcode,
  v.selling_price,
  v.low_stock_threshold,
  v.is_active,
  il.location_id,
  coalesce(il.qty_on_hand, 0) as qty_on_hand,
  coalesce(il.avg_cost, 0)    as avg_cost,
  coalesce(il.qty_on_hand, 0) * coalesce(il.avg_cost, 0) as stock_value,
  case
    when coalesce(il.qty_on_hand, 0) < 0 then 'negative'
    when coalesce(il.qty_on_hand, 0) = 0 then 'out_of_stock'
    when coalesce(il.qty_on_hand, 0) <= v.low_stock_threshold then 'low'
    else 'ok'
  end as stock_status
from public.product_variants v
join public.products p         on p.id = v.product_id
left join public.product_categories c on c.id = p.category_id
left join public.inventory_levels il  on il.variant_id = v.id;

-- ============================================================================
-- 19. GRANTS
-- ============================================================================

grant usage on schema public to authenticated;
grant select on public.v_variant_stock to authenticated;

grant execute on function public.create_business(text, char, smallint, text, char, text) to authenticated;
grant execute on function public.create_product(uuid, text, jsonb, text, uuid, text, text, text, numeric, text[], uuid) to authenticated;
grant execute on function public.record_stock_movement(uuid, uuid, uuid, public.stock_movement_type, numeric, numeric, numeric, text, text, uuid, text) to authenticated;
grant execute on function public.recalculate_inventory_level(uuid, uuid) to authenticated;
