-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0024 — Business Network & Procurement Exchange (foundation)
--
-- (Authored as 0023; renumbered because 0023_count_approval_hardening.sql was
--  already applied. Contents unchanged. See 0025 for the hardening that
--  follows it.)
--
-- Introduces the PUBLIC cross-business plane beside the untouched PRIVATE
-- per-business plane. This is the first migration where data is intentionally
-- readable across businesses — handled by putting public data in its OWN
-- tables with permissive READ and tightly restricted WRITE. Private tables
-- (Phase 1-10) keep their strict RLS and NEVER gain a public read path.
--
-- Builds: supplier public profiles (opt-in + verification), canonical catalog
-- (the procurement identity layer, barcode-seeded), supplier listings + price
-- tiers, and the CONNECT BRIDGE (public supplier → private Phase 5 supplier
-- relationship). Anticipates quotations/trust/demand/messaging via structure
-- and captured history, even though those flows are later slices.
--
-- SAFETY INVARIANTS:
--   * Public tables: select using (true) for authenticated; writes restricted
--     to the owning business. Private tables unchanged.
--   * Suppliers NEVER write retailer inventory. No path here touches
--     stock_movements. Inventory stays behind receiving (Phase 5).
--   * Canonical product is the identity every listing/quote/PO references.
--   * Additive. Shared views v_variant_stock/v_sale_summary untouched.
-- ============================================================================

-- ============================================================================
-- 1. ENUMS
-- ============================================================================
create type public.supplier_verification as enum ('unverified','pending','verified','rejected');
create type public.listing_status as enum ('active','out_of_stock','hidden');
create type public.connect_status as enum ('requested','accepted','declined','revoked');

-- ============================================================================
-- 2. CANONICAL CATALOG  (the procurement identity layer)
--    One row per real-world product. Barcode-seeded, admin-curated. Every
--    listing/quotation/PO/receiving/price-intelligence references this id.
-- ============================================================================
create table public.canonical_products (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  brand        text,
  category     text,
  gtin         text,           -- primary barcode (EAN/UPC) if known — the spine
  base_unit    text not null default 'unit',
  image_url    text,
  is_active    boolean not null default true,
  created_by_business uuid references public.businesses(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index canonical_products_gtin_idx on public.canonical_products (gtin) where gtin is not null;
create index canonical_products_name_trgm_idx on public.canonical_products using gin (name gin_trgm_ops);

create trigger canonical_products_touch
  before update on public.canonical_products
  for each row execute function public.touch_updated_at();

-- Link a business's own variant to a canonical product (so "what I stock" and
-- "what suppliers sell" are the same identity → restock-from-network works).
-- Nullable/additive: existing variants are unaffected until linked.
alter table public.product_variants
  add column if not exists canonical_product_id uuid references public.canonical_products(id);
create index if not exists product_variants_canonical_idx
  on public.product_variants (canonical_product_id) where canonical_product_id is not null;

-- Link barcodes to canonical products too (resolver → canonical identity).
alter table public.product_barcodes
  add column if not exists canonical_product_id uuid references public.canonical_products(id);

-- ============================================================================
-- 3. SUPPLIER PUBLIC PROFILES  (the acquisition layer — opt-in, verified)
--    A business becomes a public supplier by an explicit opt-in. Private by
--    default: no row here = not on the marketplace.
-- ============================================================================
create table public.supplier_profiles (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  display_name   text not null,
  logo_url       text,
  description    text,
  location_text  text,
  delivery_areas text[],
  min_order_note text,
  contact_phone  text,
  contact_whatsapp text,
  contact_email  text,
  verification   public.supplier_verification not null default 'unverified',
  is_public      boolean not null default false,   -- visible only when true AND verified
  -- transparent trust indicators (captured/derived; NOT a composite score yet)
  completed_orders int not null default 0,
  fulfillment_rate numeric(5,2),
  avg_response_minutes int,
  repeat_customers int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (business_id)
);
create index supplier_profiles_public_idx on public.supplier_profiles (is_public, verification)
  where is_public and verification = 'verified';

create trigger supplier_profiles_touch
  before update on public.supplier_profiles
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 4. SUPPLIER LISTINGS  (a supplier's offer OF a canonical product) + tiers
-- ============================================================================
create table public.supplier_listings (
  id             uuid primary key default gen_random_uuid(),
  supplier_profile_id uuid not null references public.supplier_profiles(id) on delete cascade,
  business_id    uuid not null references public.businesses(id) on delete cascade,  -- owner
  canonical_product_id uuid not null references public.canonical_products(id),
  supplier_product_name text,        -- the supplier's own label (display aid)
  purchase_unit  text not null default 'unit',
  conversion_to_base numeric(14,3) not null default 1 check (conversion_to_base > 0),
  min_order_qty  numeric(14,3) not null default 1,
  availability   public.listing_status not null default 'active',
  currency_code  char(3) not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index supplier_listings_canonical_idx on public.supplier_listings (canonical_product_id) where availability = 'active';
create index supplier_listings_supplier_idx on public.supplier_listings (supplier_profile_id);

create trigger supplier_listings_touch
  before update on public.supplier_listings
  for each row execute function public.touch_updated_at();

-- Wholesale/bulk price tiers (Rice: 1-9 bags X, 10-49 Y, 50+ Z).
create table public.listing_price_tiers (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.supplier_listings(id) on delete cascade,
  business_id  uuid not null references public.businesses(id) on delete cascade,
  min_qty      numeric(14,3) not null check (min_qty >= 1),
  max_qty      numeric(14,3),          -- null = and above
  unit_price   numeric(18,4) not null check (unit_price >= 0),  -- per purchase unit
  created_at   timestamptz not null default now()
);
create index listing_price_tiers_listing_idx on public.listing_price_tiers (listing_id, min_qty);

-- Price history capture (marketplace intelligence foundation; not displayed yet).
create table public.listing_price_history (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.supplier_listings(id) on delete cascade,
  canonical_product_id uuid not null references public.canonical_products(id),
  unit_price  numeric(18,4) not null,
  min_qty     numeric(14,3) not null default 1,
  recorded_at timestamptz not null default now()
);
create index listing_price_history_canonical_idx on public.listing_price_history (canonical_product_id, recorded_at);

-- ============================================================================
-- 5. CONNECT BRIDGE  (public supplier → private relationship)
--    A public supplier does NOT auto-become a business supplier. A connect
--    request, once accepted, creates a private Phase 5 suppliers row linked to
--    the public profile. This preserves discovery vs operational separation.
-- ============================================================================
create table public.supplier_connections (
  id             uuid primary key default gen_random_uuid(),
  requester_business_id uuid not null references public.businesses(id) on delete cascade,
  supplier_profile_id   uuid not null references public.supplier_profiles(id) on delete cascade,
  status         public.connect_status not null default 'requested',
  private_supplier_id uuid references public.suppliers(id) on delete set null, -- created on accept
  requested_at   timestamptz not null default now(),
  responded_at   timestamptz,
  unique (requester_business_id, supplier_profile_id)
);
create index supplier_connections_requester_idx on public.supplier_connections (requester_business_id, status);
create index supplier_connections_profile_idx on public.supplier_connections (supplier_profile_id, status);

-- Link a private Phase 5 supplier back to the public profile it came from
-- (nullable/additive — hand-created private suppliers have no public origin).
alter table public.suppliers
  add column if not exists supplier_profile_id uuid references public.supplier_profiles(id);

-- ============================================================================
-- 6. RLS  — the two-plane boundary
-- ============================================================================
alter table public.canonical_products    enable row level security;
alter table public.supplier_profiles     enable row level security;
alter table public.supplier_listings     enable row level security;
alter table public.listing_price_tiers   enable row level security;
alter table public.listing_price_history enable row level security;
alter table public.supplier_connections  enable row level security;

-- Canonical catalog: readable by ANY authenticated user (public identity layer).
-- Writes: any member may create a canonical product (barcode-seeded), edits by
-- an admin process later. Keep create permissive so catalog can grow; no
-- private data lives here.
create policy canonical_select on public.canonical_products
  for select to authenticated using (true);
create policy canonical_insert on public.canonical_products
  for insert to authenticated with check (auth.uid() is not null);
create policy canonical_update on public.canonical_products
  for update to authenticated using (created_by_business is not null
    and public.is_member_of(created_by_business))
  with check (true);

-- Supplier profiles: PUBLIC READ only when opted-in AND verified; the owning
-- business always sees its own. Writes restricted to the owner.
create policy supplier_profiles_public_read on public.supplier_profiles
  for select to authenticated
  using ((is_public and verification = 'verified') or public.is_member_of(business_id));
create policy supplier_profiles_write on public.supplier_profiles
  for all to authenticated
  using (public.has_role_in(business_id, array['owner','manager']::public.member_role[]))
  with check (public.has_role_in(business_id, array['owner','manager']::public.member_role[]));

-- Listings + tiers: public read when the parent profile is public+verified, or
-- the owner. Writes by the owning business only.
create policy listings_public_read on public.supplier_listings
  for select to authenticated
  using (
    exists (select 1 from public.supplier_profiles sp
             where sp.id = supplier_profile_id
               and ((sp.is_public and sp.verification='verified') or public.is_member_of(sp.business_id)))
  );
create policy listings_write on public.supplier_listings
  for all to authenticated
  using (public.has_role_in(business_id, array['owner','manager']::public.member_role[]))
  with check (public.has_role_in(business_id, array['owner','manager']::public.member_role[]));

create policy tiers_public_read on public.listing_price_tiers
  for select to authenticated
  using (
    exists (select 1 from public.supplier_listings l
             join public.supplier_profiles sp on sp.id = l.supplier_profile_id
            where l.id = listing_id
              and ((sp.is_public and sp.verification='verified') or public.is_member_of(sp.business_id)))
  );
create policy tiers_write on public.listing_price_tiers
  for all to authenticated
  using (public.has_role_in(business_id, array['owner','manager']::public.member_role[]))
  with check (public.has_role_in(business_id, array['owner','manager']::public.member_role[]));

-- Price history: readable for public/verified listings (intelligence layer),
-- written server-side. No direct client write policy.
create policy price_history_read on public.listing_price_history
  for select to authenticated
  using (
    exists (select 1 from public.supplier_listings l
             join public.supplier_profiles sp on sp.id = l.supplier_profile_id
            where l.id = listing_id and sp.is_public and sp.verification='verified')
  );

-- Connections: visible to BOTH sides (requester and the supplier's owner).
create policy connections_read on public.supplier_connections
  for select to authenticated
  using (
    public.is_member_of(requester_business_id)
    or exists (select 1 from public.supplier_profiles sp
                where sp.id = supplier_profile_id and public.is_member_of(sp.business_id))
  );

-- ============================================================================
-- 7. RPCs — opt-in, connect bridge, price-tier capture
-- ============================================================================

-- Become a public supplier (opt-in). Verification is a separate admin step;
-- is_public alone does not make it visible until verification='verified'.
create or replace function public.publish_supplier_profile(
  p_business_id uuid,
  p_display_name text,
  p_description text default null,
  p_location_text text default null
)
returns public.supplier_profiles
language plpgsql
security definer set search_path = public
as $$
declare v_row public.supplier_profiles;
begin
  if not public.has_role_in(p_business_id, array['owner','manager']::public.member_role[]) then
    raise exception 'Only an owner or manager can publish a supplier profile.';
  end if;
  insert into public.supplier_profiles (business_id, display_name, description, location_text, is_public, verification)
  values (p_business_id, p_display_name, nullif(trim(coalesce(p_description,'')),''),
          nullif(trim(coalesce(p_location_text,'')),''), true, 'pending')
  on conflict (business_id) do update
    set display_name = excluded.display_name,
        description = coalesce(excluded.description, public.supplier_profiles.description),
        location_text = coalesce(excluded.location_text, public.supplier_profiles.location_text),
        is_public = true, updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

-- Request to connect with a public supplier.
create or replace function public.request_supplier_connection(
  p_business_id uuid,
  p_supplier_profile_id uuid
)
returns public.supplier_connections
language plpgsql
security definer set search_path = public
as $$
declare v_row public.supplier_connections;
begin
  if not public.has_role_in(p_business_id, array['owner','manager']::public.member_role[]) then
    raise exception 'Only an owner or manager can connect with a supplier.';
  end if;
  insert into public.supplier_connections (requester_business_id, supplier_profile_id, status)
  values (p_business_id, p_supplier_profile_id, 'requested')
  on conflict (requester_business_id, supplier_profile_id) do update set status = 'requested', requested_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

-- Supplier accepts → creates the PRIVATE Phase 5 suppliers row on the
-- requester's side, linked to the public profile. This is the bridge.
create or replace function public.accept_supplier_connection(
  p_connection_id uuid
)
returns public.supplier_connections
language plpgsql
security definer set search_path = public
as $$
declare
  v_conn public.supplier_connections;
  v_profile public.supplier_profiles;
  v_new_supplier uuid;
begin
  select * into v_conn from public.supplier_connections where id = p_connection_id;
  if not found then raise exception 'Connection not found.'; end if;

  select * into v_profile from public.supplier_profiles where id = v_conn.supplier_profile_id;
  -- Only the supplier's owner/manager may accept.
  if not public.has_role_in(v_profile.business_id, array['owner','manager']::public.member_role[]) then
    raise exception 'Only the supplier can accept this connection.';
  end if;
  if v_conn.status = 'accepted' then return v_conn; end if;

  -- Create the private supplier relationship on the REQUESTER's side.
  insert into public.suppliers (business_id, name, phone, email, notes, supplier_profile_id, is_active)
  values (v_conn.requester_business_id, v_profile.display_name, v_profile.contact_phone,
          v_profile.contact_email, 'Connected via network', v_profile.id, true)
  returning id into v_new_supplier;

  update public.supplier_connections
     set status = 'accepted', responded_at = now(), private_supplier_id = v_new_supplier
   where id = p_connection_id
  returning * into v_conn;

  return v_conn;
end;
$$;

-- ============================================================================
-- 8. MARKETPLACE DISCOVERY VIEW  (canonical product → its public suppliers)
-- ============================================================================
create or replace view public.v_marketplace_listings
with (security_invoker = true) as
select
  l.id            as listing_id,
  l.canonical_product_id,
  cp.name         as product_name,
  cp.brand,
  cp.category,
  cp.image_url,
  sp.id           as supplier_profile_id,
  sp.display_name as supplier_name,
  sp.location_text,
  sp.verification,
  sp.fulfillment_rate,
  sp.completed_orders,
  l.purchase_unit,
  l.min_order_qty,
  l.availability,
  l.currency_code,
  (select min(unit_price) from public.listing_price_tiers t where t.listing_id = l.id) as from_price
from public.supplier_listings l
join public.supplier_profiles sp on sp.id = l.supplier_profile_id
join public.canonical_products cp on cp.id = l.canonical_product_id
where sp.is_public and sp.verification = 'verified' and l.availability = 'active';

-- ============================================================================
-- 9. GRANTS
-- ============================================================================
grant select on public.v_marketplace_listings to authenticated;
grant execute on function public.publish_supplier_profile(uuid, text, text, text) to authenticated;
grant execute on function public.request_supplier_connection(uuid, uuid) to authenticated;
grant execute on function public.accept_supplier_connection(uuid) to authenticated;
