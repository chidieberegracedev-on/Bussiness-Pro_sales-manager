-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0013 — Held baskets, actor-resolved activity, control-layer views
--
-- Completes the operational control foundation that 0012 started:
--   * held_baskets — server-persisted basket hold/resume/search/transfer
--   * record_activity_as_actor() — the client passes a SESSION TOKEN, never a
--       member id, so attribution cannot be spoofed (BR-C1.4)
--   * inventory_staff permission limits — 'inventory_staff' is used as a
--       literal here rather than in 0012, because Postgres will not let a
--       function body reference an enum value added in the same transaction.
--       This migration must therefore run AFTER 0012 has committed.
--   * v_activity_feed / v_live_shifts / v_shift_discrepancies — the management
--       views. Every one is a projection of activity_events + cash_shifts;
--       no new source of truth.
--
-- HARD CONSTRAINTS:
--   * Additive. No table rewrites, no changes to existing RPC logic.
--   * Does NOT modify v_variant_stock / v_sale_summary (Android reads them).
--   * Manager authorization never transfers operator identity.
-- ============================================================================

-- ============================================================================
-- 1. HELD BASKETS  (park a sale, resume it, or transfer it to another terminal)
-- ============================================================================

create table public.held_baskets (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  terminal_id uuid references public.terminals(id) on delete set null,
  shift_id    uuid references public.cash_shifts(id) on delete set null,
  member_id   uuid references public.business_members(id) on delete set null,

  label       text,                                  -- "Blue shirt, 3 items"
  basket      jsonb not null default '[]'::jsonb,    -- the cart lines
  item_count  int not null default 0,
  total       numeric(18,4) not null default 0,

  status      text not null default 'held',          -- 'held'|'resumed'|'discarded'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  resumed_at  timestamptz
);

create index held_baskets_business_idx on public.held_baskets (business_id, created_at desc);
create index held_baskets_open_idx on public.held_baskets (business_id, status) where status = 'held';
create index held_baskets_terminal_idx on public.held_baskets (terminal_id) where status = 'held';

create trigger held_baskets_touch
  before update on public.held_baskets
  for each row execute function public.touch_updated_at();

alter table public.held_baskets enable row level security;

-- Any member of the business can see and work held baskets — a basket held on
-- one terminal must be resumable on another (BR-C6.4).
create policy held_baskets_select on public.held_baskets
  for select using (public.is_member_of(business_id));
create policy held_baskets_write on public.held_baskets
  for all using (public.is_member_of(business_id))
  with check (public.is_member_of(business_id));

-- ============================================================================
-- 2. ACTOR-RESOLVED ACTIVITY
--    record_activity() takes initiated_by as a uuid, which means a client could
--    claim to be anyone. This wrapper takes the SESSION TOKEN instead and
--    resolves the actor server-side, so attribution is trustworthy (BR-C1.4).
-- ============================================================================

create or replace function public.record_activity_as_actor(
  p_business_id    uuid,
  p_action_type    text,
  p_actor_token    text,
  p_authorized_by  uuid default null,
  p_terminal_id    uuid default null,
  p_shift_id       uuid default null,
  p_reference_type text default null,
  p_reference_id   uuid default null,
  p_severity       text default 'info',
  p_detail         jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor uuid;
begin
  if not public.is_member_of(p_business_id) then
    raise exception 'Not a member of this business.';
  end if;

  -- A null token is allowed: management actions taken by the device account
  -- itself have no PIN actor, and are recorded with initiated_by null.
  if p_actor_token is not null then
    v_actor := public.session_actor(p_actor_token);
    if v_actor is null then
      raise exception 'No active session.';
    end if;
    -- Keep the session warm so idle-timeout logic has a real last_seen.
    update public.employee_sessions
       set last_seen_at = now()
     where token = p_actor_token and status = 'active';
  end if;

  return public.record_activity(
    p_business_id, p_action_type, v_actor, p_authorized_by,
    p_terminal_id, p_shift_id, p_reference_type, p_reference_id,
    p_severity, p_detail
  );
end;
$$;

-- Resolve the full actor context for a token in one round trip, so the client
-- can render the session banner without holding a member id it could tamper
-- with. Returns null-ish row when the token is not active.
create or replace function public.session_context(p_token text)
returns jsonb
language plpgsql stable
security definer set search_path = public
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
      'member_id',   m.id,
      'business_id', s.business_id,
      'terminal_id', s.terminal_id,
      'terminal_name', t.device_name,
      'role',        m.role,
      'display_name', coalesce(m.display_name, p.full_name),
      'status',      s.status,
      'opened_at',   s.opened_at,
      'last_seen_at', s.last_seen_at
    )
    into v
    from public.employee_sessions s
    join public.business_members m on m.id = s.member_id
    left join public.profiles p on p.id = m.user_id
    left join public.terminals t on t.id = s.terminal_id
   where s.token = p_token and s.status in ('active','locked')
   limit 1;
  return v;   -- null when no matching session
end;
$$;

-- Resume a locked session by re-entering the same employee's PIN. Keeps the
-- original session row (and therefore the held basket keyed to it) alive
-- rather than minting a new one (BR-C1.7).
create or replace function public.pin_resume_session(
  p_token text,
  p_pin   text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_session public.employee_sessions;
  v_pin     public.employee_pins;
begin
  select * into v_session from public.employee_sessions
   where token = p_token and status in ('active','locked');
  if not found then
    raise exception 'No session to resume.';
  end if;
  if not public.is_member_of(v_session.business_id) then
    raise exception 'Device is not authenticated for this business.';
  end if;

  select * into v_pin from public.employee_pins where member_id = v_session.member_id;
  if not found then raise exception 'No PIN set for this employee.'; end if;

  if v_pin.locked_until is not null and v_pin.locked_until > now() then
    raise exception 'This PIN is temporarily locked. Try again later.';
  end if;

  if v_pin.pin_hash <> crypt(p_pin, v_pin.pin_hash) then
    update public.employee_pins
       set failed_count = failed_count + 1,
           locked_until = case when failed_count + 1 >= 5 then now() + interval '15 minutes' else null end,
           updated_at = now()
     where member_id = v_session.member_id;
    perform public.record_activity(v_session.business_id, 'pin_failed', v_session.member_id, null,
      v_session.terminal_id, null, 'employee', v_session.member_id, 'notice',
      jsonb_build_object('failed_count', v_pin.failed_count + 1, 'context', 'resume'));
    raise exception 'Incorrect PIN.';
  end if;

  update public.employee_pins set failed_count = 0, locked_until = null, updated_at = now()
   where member_id = v_session.member_id;

  update public.employee_sessions
     set status = 'active', last_seen_at = now()
   where token = p_token;

  perform public.record_activity(v_session.business_id, 'session_resumed', v_session.member_id, null,
    v_session.terminal_id, null, 'employee', v_session.member_id, 'info', '{}'::jsonb);

  return public.session_context(p_token);
end;
$$;

-- ============================================================================
-- 3. INVENTORY STAFF LIMITS
--    Safe to reference the literal here: 0012 committed the enum value.
-- ============================================================================

create or replace function public.seed_inventory_staff_limits(p_business_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.has_role_in(p_business_id, array['owner','manager']::public.member_role[]) then
    raise exception 'Only owners and managers can seed limits.';
  end if;

  -- Inventory staff work the backroom: they may adjust stock within a bound,
  -- but never touch the drawer, discounts, refunds, or voids.
  insert into public.permission_limits (business_id, role, action, max_amount, max_percent, max_quantity, allowed) values
    (p_business_id,'inventory_staff','inventory_adjustment', null, null, 500,  true),
    (p_business_id,'inventory_staff','discount',             null, null, null, false),
    (p_business_id,'inventory_staff','refund',               null, null, null, false),
    (p_business_id,'inventory_staff','petty_cash',           null, null, null, false),
    (p_business_id,'inventory_staff','safe_drop',            null, null, null, false),
    (p_business_id,'inventory_staff','void',                 null, null, null, false)
  on conflict (business_id, role, action) do nothing;
end;
$$;

-- ============================================================================
-- 4. MANAGEMENT VIEWS  (projections of activity_events + cash_shifts)
-- ============================================================================

-- The activity trail with human names attached, for the audit and exceptions
-- screens. security_invoker so the activity_events RLS policy (owner/manager)
-- governs who can read it.
create or replace view public.v_activity_feed
with (security_invoker = true) as
select
  ae.id,
  ae.business_id,
  ae.occurred_at,
  ae.action_type,
  ae.severity,
  ae.initiated_by,
  coalesce(im.display_name, ip.full_name) as initiated_by_name,
  im.role                                  as initiated_by_role,
  ae.authorized_by,
  coalesce(am.display_name, ap.full_name)  as authorized_by_name,
  ae.terminal_id,
  t.device_name                            as terminal_name,
  ae.shift_id,
  ae.reference_type,
  ae.reference_id,
  ae.detail
from public.activity_events ae
left join public.business_members im on im.id = ae.initiated_by
left join public.profiles ip on ip.id = im.user_id
left join public.business_members am on am.id = ae.authorized_by
left join public.profiles ap on ap.id = am.user_id
left join public.terminals t on t.id = ae.terminal_id;

-- Live shift monitor: open shifts with their operator, terminal, runtime, and
-- live drawer cash projected from the shift's cash events.
create or replace view public.v_live_shifts
with (security_invoker = true) as
select
  cs.id,
  cs.business_id,
  cs.location_id,
  cs.terminal_id,
  t.device_name as terminal_name,
  cs.opened_by,
  coalesce(m.display_name, p.full_name) as opened_by_name,
  m.role as opened_by_role,
  cs.opened_at,
  cs.opening_float,
  (
    select coalesce(sum(case when fe.direction = 'credit' then fe.amount else -fe.amount end), 0)
      from public.financial_events fe
     where fe.shift_id = cs.id and fe.account = 'cash'
  ) as drawer_cash,
  (
    select count(*) from public.activity_events ae
     where ae.shift_id = cs.id and ae.severity = 'exception'
  ) as exception_count
from public.cash_shifts cs
left join public.terminals t on t.id = cs.terminal_id
left join public.business_members m on m.id = cs.opened_by
left join public.profiles p on p.id = m.user_id
where cs.status = 'open';

-- Historical discrepancy matrix: closed shifts with expected / counted /
-- variance and the activity counts that give the variance context.
create or replace view public.v_shift_discrepancies
with (security_invoker = true) as
select
  cs.id,
  cs.business_id,
  cs.terminal_id,
  t.device_name as terminal_name,
  cs.opened_by,
  coalesce(m.display_name, p.full_name) as opened_by_name,
  cs.opened_at,
  cs.closed_at,
  cs.opening_float,
  cs.counted_cash,
  cs.expected_cash,
  cs.variance,
  cs.note,
  (select count(*) from public.activity_events ae
    where ae.shift_id = cs.id and ae.action_type like '%void%') as void_count,
  (select count(*) from public.activity_events ae
    where ae.shift_id = cs.id and ae.action_type = 'manager_override') as override_count,
  (select count(*) from public.activity_events ae
    where ae.shift_id = cs.id and ae.severity = 'exception') as exception_count
from public.cash_shifts cs
left join public.terminals t on t.id = cs.terminal_id
left join public.business_members m on m.id = cs.opened_by
left join public.profiles p on p.id = m.user_id
where cs.status = 'closed';

-- ============================================================================
-- 5. GRANTS
-- ============================================================================

grant select on public.v_activity_feed        to authenticated;
grant select on public.v_live_shifts          to authenticated;
grant select on public.v_shift_discrepancies  to authenticated;

grant execute on function public.record_activity_as_actor(uuid, text, text, uuid, uuid, uuid, text, uuid, text, jsonb) to authenticated;
grant execute on function public.session_context(text) to authenticated;
grant execute on function public.pin_resume_session(text, text) to authenticated;
grant execute on function public.seed_inventory_staff_limits(uuid) to authenticated;
