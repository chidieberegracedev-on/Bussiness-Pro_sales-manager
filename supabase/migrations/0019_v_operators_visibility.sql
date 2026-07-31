-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0019 — v_operators: drop the redundant WHERE, keep definer PIN reads
--
-- Supersedes the draft supplied as "0018_fix_v_operators.sql". That draft was
-- right about the WHERE clause and wrong about has_pin; this migration takes
-- the first half and keeps 0017's fix for the second. Renumbered because
-- 0018_operator_mode.sql already occupies 0018.
--
-- ---------------------------------------------------------------------------
-- FIX 1 (from the draft) — the redundant row filter
--
--   0016 declared the view with `where public.is_member_of(bm.business_id)`.
--   The view is security_invoker, so business_members' own RLS
--   (members_select_member: using (is_member_of(business_id))) already scopes
--   the rows to the caller's business. The predicate adds nothing in the app,
--   and it actively lies when debugging: in the SQL editor you run as postgres,
--   RLS is bypassed, but that explicit WHERE still evaluates is_member_of()
--   against a null auth.uid() and returns ZERO ROWS. Removing it lets the base
--   table do the scoping, which is the intended behaviour.
--
-- ---------------------------------------------------------------------------
-- FIX 2 (retained from 0017) — has_pin must NOT read employee_pins inline
--
--   employee_pins carries `create policy employee_pins_no_select ... using
--   (false)` so hashes can never be selected by a client. In a
--   security_invoker view, an inline
--
--       exists (select 1 from public.employee_pins where member_id = bm.id)
--
--   runs with the CALLER's permissions and therefore evaluates to FALSE for
--   every operator, forever — the "No PIN" badge on an operator who has one.
--
--   This is the trap: as postgres in the SQL editor RLS is bypassed and the
--   inline subquery reads TRUE, so the view looks correct right up until the
--   browser asks. PIN state must go through the SECURITY DEFINER helpers,
--   which are allowed to see the table and return only a boolean and a
--   timestamp — never the hash.
--
-- Self-contained: both helpers are (re)created here, so applying this fixes
-- the view whether or not 0017 ever ran. Additive; no data change; hash
-- secrecy unchanged.
-- ============================================================================

-- ============================================================================
-- 1. The definer helpers PIN state is read through
-- ============================================================================
create or replace function public.operator_has_pin(p_member_id uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (select 1 from public.employee_pins where member_id = p_member_id);
$$;

create or replace function public.operator_pin_locked_until(p_member_id uuid)
returns timestamptz
language sql stable
security definer set search_path = public
as $$
  select locked_until from public.employee_pins where member_id = p_member_id;
$$;

grant execute on function public.operator_has_pin(uuid)          to authenticated;
grant execute on function public.operator_pin_locked_until(uuid) to authenticated;

-- ============================================================================
-- 2. The view — no WHERE, PIN state via the helpers
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
from public.business_members bm;
-- (No WHERE: the security_invoker view inherits business_members' RLS, which
--  already restricts rows to the caller's business.)

grant select on public.v_operators to authenticated;

-- ============================================================================
-- 3. Verifying this actually worked
--
--   Running `select * from public.v_operators` in the SQL editor now returns
--   every row, because postgres bypasses RLS — that tells you the view is
--   readable, but it does NOT prove has_pin works for a browser client, since
--   the helpers would succeed either way. To check the real thing, confirm the
--   helper is definer-owned:
--
--     select proname, prosecdef from pg_proc
--      where proname in ('operator_has_pin','operator_pin_locked_until');
--     -- prosecdef must be true for both
--
--   Then set a PIN in the app and reload the Operators screen. The badge reads
--   from has_pin, so "PIN set" appearing there is the end-to-end proof.
-- ============================================================================
