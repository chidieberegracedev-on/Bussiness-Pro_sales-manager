-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0017 — Fix v_operators.has_pin always reading false
--
-- BUG: 0016 declared v_operators with `security_invoker = true`, so the
--   inline `exists (select 1 from employee_pins ...)` subquery runs with the
--   CALLING user's permissions. employee_pins has RLS `using (false)`, so the
--   caller sees zero rows and has_pin evaluates to FALSE for every operator —
--   even immediately after a PIN is set.
--
--   That reintroduced the exact bug 0016 set out to fix, and it traps the owner
--   on the PIN-setup screen: the gate reads "no PINs exist", so it shows setup
--   again, forever.
--
-- FIX: keep security_invoker (business_members RLS should still apply to the
--   caller) but read PIN state through the SECURITY DEFINER helpers, which are
--   allowed to see employee_pins. operator_has_pin() already exists; this adds
--   the matching lockout helper.
--
-- Additive: replaces one view, adds one function. Hash secrecy is unchanged —
-- neither helper returns the hash.
-- ============================================================================

-- ============================================================================
-- 1. Lockout helper — mirrors operator_has_pin, also SECURITY DEFINER
-- ============================================================================
create or replace function public.operator_pin_locked_until(p_member_id uuid)
returns timestamptz
language sql stable
security definer set search_path = public
as $$
  select locked_until from public.employee_pins where member_id = p_member_id;
$$;

grant execute on function public.operator_pin_locked_until(uuid) to authenticated;

-- ============================================================================
-- 2. v_operators — same shape, but PIN state via the definer helpers
-- ============================================================================
create or replace view public.v_operators
with (security_invoker = true) as
select
  bm.id            as member_id,
  bm.business_id,
  bm.display_name,
  bm.role,
  bm.status,
  bm.user_id is not null as is_account_user,
  bm.created_at,
  public.operator_has_pin(bm.id)          as has_pin,
  public.operator_pin_locked_until(bm.id) as locked_until
from public.business_members bm
where public.is_member_of(bm.business_id);

grant select on public.v_operators to authenticated;
