-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0018 — Operator Mode (single source of truth)
--
-- (Authored as 0017; renumbered because 0017_fix_v_operators_has_pin.sql was
--  already applied. Sections 1-2 are as supplied; 3-4 are backfills added so
--  applying this to a live database can't silently drop an existing business's
--  PIN gate, or leave the owner reading as "Unnamed".)
--
-- Phase 8's PIN/operator/terminal machinery is currently exposed during
-- first-run onboarding, before a business has any staff. The correct model:
--
--   Single-Owner Mode (default): no PIN, no operator selection, no terminal
--     restriction, no shift enforcement. The owner just uses the software.
--
--   Multi-Operator Mode: activated when the owner adds the first employee.
--     Owner PIN + employee PINs + terminals + operator selection become active.
--
-- The frontend needs ONE unambiguous flag for which mode a business is in, so
-- the gate isn't derived three different ways and drift into the bug seen now
-- (operator screen + "No PIN" shown to a solo owner).
--
-- This migration adds businesses.operator_mode and a helper to flip it on.
-- It is purely a mode flag; all Phase 8 security still applies IN multi-operator
-- mode exactly as built. Additive.
-- ============================================================================

-- ============================================================================
-- 1. Mode flag on the business (defaults to single-owner)
-- ============================================================================
alter table public.businesses
  add column if not exists operator_mode text not null default 'single_owner';
-- values: 'single_owner' | 'multi_operator'

-- ============================================================================
-- 2. enable_operator_mode — called when the owner adds the first employee
--    Requires the owner to have set their own PIN first (enforced by caller,
--    but we also refuse to enable if the caller-owner has no PIN, so a business
--    can never enter multi-operator mode with an unprotected owner).
-- ============================================================================
create or replace function public.enable_operator_mode(p_business_id uuid)
returns public.businesses
language plpgsql
security definer set search_path = public
as $$
declare
  v_biz public.businesses;
  v_owner_member uuid;
begin
  if not public.has_role_in(p_business_id, array['owner']::public.member_role[]) then
    raise exception 'Only an owner can enable operator mode.';
  end if;

  -- The acting owner must have a PIN, so multi-operator mode never starts with
  -- an owner who can't authenticate as an operator.
  select bm.id into v_owner_member
    from public.business_members bm
   where bm.business_id = p_business_id
     and bm.user_id = (select auth.uid())
     and bm.role = 'owner'
   limit 1;

  if v_owner_member is null then
    raise exception 'Owner membership not found.';
  end if;
  if not exists (select 1 from public.employee_pins where member_id = v_owner_member) then
    raise exception 'Set your owner PIN before enabling employee mode.';
  end if;

  update public.businesses
     set operator_mode = 'multi_operator'
   where id = p_business_id
  returning * into v_biz;

  perform public.record_activity(
    p_business_id, 'operator_mode_enabled', v_owner_member, null, null, null,
    'business', p_business_id, 'notice', '{}'::jsonb);

  return v_biz;
end;
$$;

-- Optional: allow returning to single-owner mode only if no non-owner
-- operators remain (e.g. the owner removed all staff).
create or replace function public.disable_operator_mode(p_business_id uuid)
returns public.businesses
language plpgsql
security definer set search_path = public
as $$
declare v_biz public.businesses;
begin
  if not public.has_role_in(p_business_id, array['owner']::public.member_role[]) then
    raise exception 'Only an owner can change operator mode.';
  end if;
  if exists (
    select 1 from public.business_members
     where business_id = p_business_id and role <> 'owner' and status = 'active'
  ) then
    raise exception 'Remove or deactivate all employees before leaving employee mode.';
  end if;

  update public.businesses set operator_mode = 'single_owner'
   where id = p_business_id returning * into v_biz;
  return v_biz;
end;
$$;

grant execute on function public.enable_operator_mode(uuid)  to authenticated;
grant execute on function public.disable_operator_mode(uuid) to authenticated;

-- ============================================================================
-- 3. Backfill — a business that ALREADY has staff must not silently lose its
--    PIN gate the moment this column lands defaulting to 'single_owner'.
--    Anyone with a non-owner active member is, by definition, already in
--    multi-operator territory. Idempotent: re-running changes nothing.
-- ============================================================================
update public.businesses b
   set operator_mode = 'multi_operator'
 where b.operator_mode = 'single_owner'
   and exists (
     select 1 from public.business_members bm
      where bm.business_id = b.id
        and bm.role <> 'owner'
        and bm.status = 'active'
   );

-- ============================================================================
-- 4. Owners have no display_name — create_business never set one, so every
--    account holder reads as "Unnamed" on the operator list. The name is
--    already known; it just never made it onto the member row.
-- ============================================================================
update public.business_members bm
   set display_name = p.full_name
  from public.profiles p
 where p.id = bm.user_id
   and nullif(trim(coalesce(bm.display_name, '')), '') is null
   and nullif(trim(coalesce(p.full_name, '')), '') is not null;

-- And stamp it going forward. Same signature, same behaviour — the owner's
-- membership simply carries their name from the first moment it exists.
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
  v_name text;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  select nullif(trim(coalesce(full_name, '')), '') into v_name
    from public.profiles where id = v_user;

  insert into public.businesses (name, currency_code, currency_exponent, timezone, country_code)
  values (trim(p_name), upper(p_currency_code), p_currency_exponent, p_timezone, upper(p_country_code))
  returning * into v_biz;

  insert into public.business_members (business_id, user_id, role, status, display_name)
  values (v_biz.id, v_user, 'owner', 'active', v_name);

  insert into public.locations (business_id, name, is_default)
  values (v_biz.id, coalesce(nullif(trim(p_location_name), ''), 'Main Location'), true);

  return v_biz;
end;
$$;
