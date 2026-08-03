-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0027 — Progressive trust tiers (verification gates RISK, not ACCESS)
--
-- 0024 made verification a gate on EXISTENCE: v_marketplace_listings and three
-- RLS policies all require verification = 'verified', so a newly published
-- supplier is invisible to everyone until an admin reviews them. A supplier
-- who lists ten products on Monday and appears nowhere is not "pending" from
-- their point of view — they conclude the marketplace is broken and leave.
--
-- The model inverts: a supplier is PROVISIONALLY ACTIVE the moment they
-- publish. They can list, be found, and receive inquiries the same day.
-- Verification and trading history then unlock limits, ranking and badges.
--
--   provisional  published, listed, discoverable. Buyer sees "new supplier".
--   verified     identity/location/business confirmed. Higher limits.
--   trusted      verified AND a real fulfilment record.
--   preferred    consistently high performance. Priority visibility.
--
-- WHAT THIS CHANGES: visibility now needs is_public AND verification <>
-- 'rejected'. A rejected supplier is removed from the network — that is the
-- only verification state that hides anything.
--
-- WHAT IT DOES NOT DO: transaction limits are DEFINED here as data but nothing
-- enforces them, because the transactions they would limit (quotations, escrow)
-- do not exist yet. See the note at the bottom.
--
-- Additive: one enum, one column, one function, replaces one view and four
-- policies.
-- ============================================================================

create type public.trust_tier as enum ('provisional','verified','trusted','preferred');

alter table public.supplier_profiles
  add column if not exists trust_tier public.trust_tier not null default 'provisional';

-- Existing verified suppliers keep their standing.
update public.supplier_profiles
   set trust_tier = 'verified'
 where verification = 'verified' and trust_tier = 'provisional';

-- ============================================================================
-- 1. The tier a supplier has EARNED, from verification + real trading history.
--
--    Deliberately a function rather than something a human sets: "trusted"
--    should mean a supplier delivered, not that somebody liked them. The
--    stored trust_tier column is the floor (an admin can promote to
--    'preferred'); this returns the greater of the two.
-- ============================================================================
create or replace function public.earned_trust_tier(p_profile_id uuid)
returns public.trust_tier
language plpgsql stable
security definer set search_path = public
as $$
declare
  p public.supplier_profiles;
begin
  select * into p from public.supplier_profiles where id = p_profile_id;
  if not found then return 'provisional'; end if;

  -- An explicit promotion always wins.
  if p.trust_tier = 'preferred' then return 'preferred'; end if;

  if p.verification <> 'verified' then
    return 'provisional';
  end if;

  -- Verified AND a fulfilment record that means something.
  if p.completed_orders >= 50
     and coalesce(p.fulfillment_rate, 0) >= 95
     and p.repeat_customers >= 10 then
    return 'preferred';
  end if;

  if p.completed_orders >= 10
     and coalesce(p.fulfillment_rate, 0) >= 90 then
    return 'trusted';
  end if;

  return 'verified';
end;
$$;

-- ============================================================================
-- 2. Visibility: published is enough. Only 'rejected' hides a supplier.
-- ============================================================================
drop policy if exists supplier_profiles_public_read on public.supplier_profiles;
create policy supplier_profiles_public_read on public.supplier_profiles
  for select to authenticated
  using ((is_public and verification <> 'rejected') or public.is_member_of(business_id));

drop policy if exists listings_public_read on public.supplier_listings;
create policy listings_public_read on public.supplier_listings
  for select to authenticated
  using (
    exists (select 1 from public.supplier_profiles sp
             where sp.id = supplier_profile_id
               and ((sp.is_public and sp.verification <> 'rejected')
                    or public.is_member_of(sp.business_id)))
  );

drop policy if exists tiers_public_read on public.listing_price_tiers;
create policy tiers_public_read on public.listing_price_tiers
  for select to authenticated
  using (
    exists (select 1 from public.supplier_listings l
             join public.supplier_profiles sp on sp.id = l.supplier_profile_id
            where l.id = listing_id
              and ((sp.is_public and sp.verification <> 'rejected')
                   or public.is_member_of(sp.business_id)))
  );

drop policy if exists price_history_read on public.listing_price_history;
create policy price_history_read on public.listing_price_history
  for select to authenticated
  using (
    exists (select 1 from public.supplier_listings l
             join public.supplier_profiles sp on sp.id = l.supplier_profile_id
            where l.id = listing_id and sp.is_public and sp.verification <> 'rejected')
  );

-- ============================================================================
-- 3. The marketplace view carries the tier so buyers can weigh an offer.
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
  public.earned_trust_tier(sp.id) as trust_tier,
  sp.fulfillment_rate,
  sp.completed_orders,
  sp.repeat_customers,
  sp.avg_response_minutes,
  sp.created_at   as supplier_since,
  l.purchase_unit,
  l.min_order_qty,
  l.availability,
  l.currency_code,
  (select min(unit_price) from public.listing_price_tiers t where t.listing_id = l.id) as from_price
from public.supplier_listings l
join public.supplier_profiles sp on sp.id = l.supplier_profile_id
join public.canonical_products cp on cp.id = l.canonical_product_id
where sp.is_public and sp.verification <> 'rejected' and l.availability = 'active';

-- ============================================================================
-- 4. Publishing now activates immediately.
--    verification starts 'pending' (an admin still reviews), but the supplier
--    is live from this moment. That is the whole change.
-- ============================================================================
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

  insert into public.supplier_profiles (
    business_id, display_name, description, location_text,
    is_public, verification, trust_tier
  )
  values (
    p_business_id, p_display_name,
    nullif(trim(coalesce(p_description,'')),''),
    nullif(trim(coalesce(p_location_text,'')),''),
    true, 'pending', 'provisional'
  )
  on conflict (business_id) do update
    set display_name  = excluded.display_name,
        description   = coalesce(excluded.description, public.supplier_profiles.description),
        location_text = coalesce(excluded.location_text, public.supplier_profiles.location_text),
        is_public     = true,
        updated_at    = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- ============================================================================
-- 5. Tier limits — DEFINED, NOT ENFORCED
--
--    These are the exposure caps each tier is meant to carry. Nothing reads
--    them yet, and nothing should pretend to: the objects they would limit
--    (quotations, orders, escrow balances) are a later phase. They live here
--    so the tier ladder means something concrete on screen, and so the
--    enforcement point has a single source when it arrives.
--
--    ESCROW IS NOT IMPLEMENTED. There is no fund-holding, release, milestone,
--    or dispute logic anywhere in this schema, by decision — it is a dedicated
--    future phase pending a payment-provider choice. `escrow_release_hours`
--    below is a stated intent, not a behaviour.
-- ============================================================================
create or replace function public.trust_tier_limits(p_tier public.trust_tier)
returns jsonb
language sql immutable
as $$
  select case p_tier
    when 'provisional' then jsonb_build_object(
      'max_active_order_value', 500000,
      'max_concurrent_orders', 3,
      'escrow_release_hours', 72,
      'ranking_boost', 0)
    when 'verified' then jsonb_build_object(
      'max_active_order_value', 5000000,
      'max_concurrent_orders', 15,
      'escrow_release_hours', 48,
      'ranking_boost', 1)
    when 'trusted' then jsonb_build_object(
      'max_active_order_value', 25000000,
      'max_concurrent_orders', 50,
      'escrow_release_hours', 24,
      'ranking_boost', 2)
    else jsonb_build_object(
      'max_active_order_value', null,
      'max_concurrent_orders', null,
      'escrow_release_hours', 12,
      'ranking_boost', 3)
  end;
$$;

grant execute on function public.earned_trust_tier(uuid) to authenticated;
grant execute on function public.trust_tier_limits(public.trust_tier) to authenticated;
grant select on public.v_marketplace_listings to authenticated;
grant execute on function public.publish_supplier_profile(uuid, text, text, text) to authenticated;
