-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0016 — Operator PIN status + owner PIN reset
--
-- Problem 1 (PIN shows "No PIN" after a successful set):
--   employee_pins has RLS `using (false)` so hashes can never be read — correct
--   for security, but it also means the directory can't tell WHETHER a PIN
--   exists. Every operator shows "No PIN" even right after setting one.
--
-- Fix: expose a boolean has_pin (never the hash) via a view the directory reads.
--
-- Problem 2 (owner forgot PIN):
--   Add a reset path. Because the business is authenticated by the owner's
--   Supabase login, an authenticated owner can reset any operator's PIN
--   (that IS the recovery channel — control of the business email/login).
--
-- Additive; no changes to existing tables or the hash secrecy.
-- ============================================================================

-- ============================================================================
-- 1. v_operators — the directory view, with has_pin but never the hash
-- ============================================================================
create or replace view public.v_operators
with (security_invoker = true) as
select
  bm.id            as member_id,
  bm.business_id,
  bm.display_name,
  bm.role,
  bm.status,
  bm.user_id is not null as is_account_user,   -- owner/real-user vs PIN-only operator
  bm.created_at,
  exists (
    select 1 from public.employee_pins ep where ep.member_id = bm.id
  )                as has_pin,
  (select ep.locked_until from public.employee_pins ep where ep.member_id = bm.id) as locked_until
from public.business_members bm
where public.is_member_of(bm.business_id);

grant select on public.v_operators to authenticated;

-- ============================================================================
-- 2. has_pin(member_id) — a direct check for a single operator (safe boolean)
-- ============================================================================
create or replace function public.operator_has_pin(p_member_id uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (select 1 from public.employee_pins where member_id = p_member_id);
$$;

grant execute on function public.operator_has_pin(uuid) to authenticated;

-- ============================================================================
-- 3. reset_operator_pin — owner/manager sets or clears any operator's PIN
--    (Recovery channel: control of the Supabase business login authorizes it.
--     For a forgotten OWNER PIN, the owner is authenticated via Supabase and
--     can reset their own here.)
-- ============================================================================
create or replace function public.reset_operator_pin(
  p_business_id uuid,
  p_member_id   uuid,
  p_new_pin     text
)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
begin
  if not public.has_role_in(p_business_id, array['owner','manager']::public.member_role[]) then
    raise exception 'Only owners and managers can reset PINs.';
  end if;
  if p_new_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be exactly 4 digits.';
  end if;
  -- A manager may not reset an owner's PIN; only an owner can.
  if exists (select 1 from public.business_members
              where id = p_member_id and role = 'owner')
     and not public.has_role_in(p_business_id, array['owner']::public.member_role[]) then
    raise exception 'Only an owner can reset an owner PIN.';
  end if;

  insert into public.employee_pins (business_id, member_id, pin_hash, failed_count, locked_until, updated_at)
  values (p_business_id, p_member_id, extensions.crypt(p_new_pin, extensions.gen_salt('bf')), 0, null, now())
  on conflict (member_id) do update
    set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf')),
        failed_count = 0, locked_until = null, updated_at = now();

  perform public.record_activity(
    p_business_id, 'pin_reset', null, null, null, null,
    'operator', p_member_id, 'notice', '{}'::jsonb);
end;
$$;

grant execute on function public.reset_operator_pin(uuid, uuid, text) to authenticated;
