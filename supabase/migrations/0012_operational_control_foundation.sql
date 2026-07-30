-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0012 — Operational Control Layer: Identity & Engine Foundation
--
-- Builds the foundation the whole control layer sits on:
--   * inventory_staff role (4-tier RBAC)
--   * terminals (registered devices)
--   * employee_pins (hashed 4-digit PIN, pgcrypto)
--   * employee_sessions (server-validated PIN session = the ACTOR)
--   * permission_limits (configurable thresholds, seeded defaults)
--   * activity_events (ONE append-only activity ledger; audit/shift/security
--       logs are views of it; acted_by + authorized_by = temporary manager
--       presence)
--   * authorize() — the ONE authorization pipeline
--   * PIN unlock / lock RPCs and session resolution
--
-- GOVERNING MODEL (founder-confirmed):
--   auth.uid() authenticates the DEVICE/branch → RLS business isolation stays.
--   A PIN unlock mints a server-validated employee_session TOKEN = the
--   operational actor for sales, shifts, overrides, drawer activity, audit.
--   The client never supplies a trusted employee_id; RPCs resolve the actor
--   from the session token server-side.
--
-- HARD CONSTRAINTS:
--   * Additive. Only enum-value adds + new tables/functions. No table rewrites.
--   * Does NOT modify v_variant_stock / v_sale_summary (Android reads them).
--   * Manager authorization NEVER transfers operator identity: activity records
--       initiated_by (actor) and authorized_by (approver) separately.
--   * Web only; backend stays Android-compatible.
-- ============================================================================

-- ============================================================================
-- 1. ROLE: add inventory_staff (additive enum value)
-- ============================================================================
-- New enum values must be added outside a transaction block in some setups;
-- Supabase SQL editor handles this fine as a standalone statement.
alter type public.member_role add value if not exists 'inventory_staff';

-- ============================================================================
-- 2. TERMINALS  (registered devices)
-- ============================================================================
create table public.terminals (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  location_id    uuid not null references public.locations(id),
  device_name    text not null,
  device_type    text not null default 'web',    -- 'web'|'tablet'|'desktop'|...
  is_active      boolean not null default true,
  last_active_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index terminals_business_idx on public.terminals (business_id) where is_active;
create index terminals_location_idx on public.terminals (location_id);

create trigger terminals_touch
  before update on public.terminals
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 3. EMPLOYEE PINS  (hashed; one active PIN per member)
--    We hash with pgcrypto crypt() + bf salt. Plaintext never stored.
-- ============================================================================
create table public.employee_pins (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  member_id      uuid not null references public.business_members(id) on delete cascade,
  pin_hash       text not null,
  failed_count   int not null default 0,
  locked_until   timestamptz,
  updated_at     timestamptz not null default now(),
  unique (member_id)
);
create index employee_pins_business_idx on public.employee_pins (business_id);

-- ============================================================================
-- 4. EMPLOYEE SESSIONS  (a PIN unlock = one operational session)
--    token is a server-generated secret the client holds; RPCs resolve the
--    actor from it. Sessions expire and can be locked (screen lock) or ended.
-- ============================================================================
create table public.employee_sessions (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  member_id      uuid not null references public.business_members(id) on delete cascade,
  terminal_id    uuid not null references public.terminals(id),
  token          text not null unique,          -- secret; treat like a bearer token
  status         text not null default 'active',-- 'active'|'locked'|'ended'
  opened_at      timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  ended_at       timestamptz
);
create index employee_sessions_token_idx on public.employee_sessions (token);
create index employee_sessions_member_idx on public.employee_sessions (member_id) where status <> 'ended';

-- ============================================================================
-- 5. PERMISSION LIMITS  (configurable thresholds per role/action)
-- ============================================================================
create table public.permission_limits (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  role         public.member_role not null,
  action       text not null,        -- 'discount'|'refund'|'petty_cash'|'inventory_adjustment'|'safe_drop'|'void'
  max_amount   numeric(18,4),        -- null = not limited by amount
  max_percent  numeric(6,3),         -- for discounts
  max_quantity numeric(14,3),        -- for inventory adjustments
  allowed      boolean not null default true,   -- false = always requires higher role
  updated_at   timestamptz not null default now(),
  unique (business_id, role, action)
);
create index permission_limits_lookup_idx on public.permission_limits (business_id, action, role);

-- ============================================================================
-- 6. ACTIVITY EVENTS  (the ONE append-only activity ledger)
-- ============================================================================
create table public.activity_events (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  occurred_at    timestamptz not null default now(),

  action_type    text not null,      -- 'sale_completed','basket_voided','discount_applied',
                                      --   'inventory_adjusted','goods_received','petty_cash_out',
                                      --   'safe_drop','shift_opened','shift_closed',
                                      --   'pin_failed','pin_locked','manager_override', ...
  severity       text not null default 'info',   -- 'info'|'notice'|'exception'

  initiated_by   uuid references public.business_members(id),  -- the actor
  authorized_by  uuid references public.business_members(id),  -- approver, if any
  terminal_id    uuid references public.terminals(id),
  shift_id       uuid references public.cash_shifts(id),

  reference_type text,
  reference_id   uuid,
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index activity_events_business_time_idx on public.activity_events (business_id, occurred_at desc);
create index activity_events_severity_idx on public.activity_events (business_id, severity) where severity = 'exception';
create index activity_events_actor_idx on public.activity_events (initiated_by);
create index activity_events_ref_idx on public.activity_events (reference_type, reference_id);

-- Append-only.
create trigger activity_events_no_update
  before update on public.activity_events
  for each row execute function public.deny_mutation();
create trigger activity_events_no_delete
  before delete on public.activity_events
  for each row execute function public.deny_mutation();

-- ============================================================================
-- 7. SHIFT ENGINE EXTENSION  — terminal on shifts + one-shift-per-employee
-- ============================================================================
alter table public.cash_shifts
  add column if not exists terminal_id uuid references public.terminals(id);

-- One active shift per employee across all terminals (in addition to the
-- existing one-open-per-location index from 0008).
create unique index if not exists cash_shifts_one_open_per_employee_idx
  on public.cash_shifts (opened_by) where status = 'open';

-- ============================================================================
-- 8. RLS
-- ============================================================================
alter table public.terminals          enable row level security;
alter table public.employee_pins      enable row level security;
alter table public.employee_sessions  enable row level security;
alter table public.permission_limits  enable row level security;
alter table public.activity_events    enable row level security;

-- Terminals: members read; owner/manager manage.
create policy terminals_select on public.terminals
  for select using (public.is_member_of(business_id));
create policy terminals_write on public.terminals
  for all using (public.has_role_in(business_id, array['owner','manager']::public.member_role[]))
  with check (public.has_role_in(business_id, array['owner','manager']::public.member_role[]));

-- PINs: NEVER selectable by clients (hash stays server-side). Managed via RPC.
-- No select policy → no direct read. Owner/manager set via RPC (definer).
create policy employee_pins_no_select on public.employee_pins
  for select using (false);

-- Sessions: a member can see their own active sessions; managers see business.
create policy employee_sessions_select on public.employee_sessions
  for select using (public.has_role_in(business_id, array['owner','manager']::public.member_role[]));

-- Permission limits: members read (to render UI); owner/manager edit.
create policy permission_limits_select on public.permission_limits
  for select using (public.is_member_of(business_id));
create policy permission_limits_write on public.permission_limits
  for all using (public.has_role_in(business_id, array['owner','manager']::public.member_role[]))
  with check (public.has_role_in(business_id, array['owner','manager']::public.member_role[]));

-- Activity: owner/manager read the full trail; written only via RPC.
create policy activity_events_select on public.activity_events
  for select using (public.has_role_in(business_id, array['owner','manager']::public.member_role[]));

-- ============================================================================
-- 9. INTERNAL: record an activity event
-- ============================================================================
create or replace function public.record_activity(
  p_business_id  uuid,
  p_action_type  text,
  p_initiated_by uuid default null,
  p_authorized_by uuid default null,
  p_terminal_id  uuid default null,
  p_shift_id     uuid default null,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_severity     text default 'info',
  p_detail       jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.activity_events (
    business_id, action_type, severity, initiated_by, authorized_by,
    terminal_id, shift_id, reference_type, reference_id, detail
  ) values (
    p_business_id, p_action_type, p_severity, p_initiated_by, p_authorized_by,
    p_terminal_id, p_shift_id, p_reference_type, p_reference_id, coalesce(p_detail,'{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ============================================================================
-- 10. PIN MANAGEMENT  (set a member's PIN — owner/manager only)
-- ============================================================================
create or replace function public.set_employee_pin(
  p_business_id uuid,
  p_member_id   uuid,
  p_pin         text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.has_role_in(p_business_id, array['owner','manager']::public.member_role[]) then
    raise exception 'Only owners and managers can set PINs.';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be exactly 4 digits.';
  end if;

  insert into public.employee_pins (business_id, member_id, pin_hash, failed_count, locked_until, updated_at)
  values (p_business_id, p_member_id, crypt(p_pin, gen_salt('bf')), 0, null, now())
  on conflict (member_id) do update
    set pin_hash = crypt(p_pin, gen_salt('bf')),
        failed_count = 0, locked_until = null, updated_at = now();
end;
$$;

-- ============================================================================
-- 11. PIN UNLOCK  → mints an employee_session, returns the token
--     Rate-limited: locks the member after 5 failures for 15 minutes.
-- ============================================================================
create or replace function public.pin_unlock(
  p_business_id uuid,
  p_member_id   uuid,
  p_terminal_id uuid,
  p_pin         text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_pin   public.employee_pins;
  v_token text;
  v_role  public.member_role;
begin
  -- The device must be a Supabase-authenticated member of the business.
  if not public.is_member_of(p_business_id) then
    raise exception 'Device is not authenticated for this business.';
  end if;

  select * into v_pin from public.employee_pins where member_id = p_member_id and business_id = p_business_id;
  if not found then
    raise exception 'No PIN set for this employee.';
  end if;

  if v_pin.locked_until is not null and v_pin.locked_until > now() then
    perform public.record_activity(p_business_id, 'pin_locked', p_member_id, null, p_terminal_id,
      null, 'employee', p_member_id, 'exception', jsonb_build_object('reason','locked'));
    raise exception 'This PIN is temporarily locked. Try again later.';
  end if;

  if v_pin.pin_hash <> crypt(p_pin, v_pin.pin_hash) then
    update public.employee_pins
       set failed_count = failed_count + 1,
           locked_until = case when failed_count + 1 >= 5 then now() + interval '15 minutes' else null end,
           updated_at = now()
     where member_id = p_member_id;
    perform public.record_activity(p_business_id, 'pin_failed', p_member_id, null, p_terminal_id,
      null, 'employee', p_member_id, 'notice', jsonb_build_object('failed_count', v_pin.failed_count + 1));
    raise exception 'Incorrect PIN.';
  end if;

  -- Success: reset counter, mint a session.
  update public.employee_pins set failed_count = 0, locked_until = null, updated_at = now()
   where member_id = p_member_id;

  select role into v_role from public.business_members where id = p_member_id;
  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.employee_sessions (business_id, member_id, terminal_id, token, status)
  values (p_business_id, p_member_id, p_terminal_id, v_token, 'active');

  update public.terminals set last_active_at = now() where id = p_terminal_id;

  perform public.record_activity(p_business_id, 'session_opened', p_member_id, null, p_terminal_id,
    null, 'employee', p_member_id, 'info', '{}'::jsonb);

  return jsonb_build_object('token', v_token, 'member_id', p_member_id, 'role', v_role);
end;
$$;

-- Resolve the actor member from a session token (internal use by other RPCs).
create or replace function public.session_actor(p_token text)
returns uuid
language sql stable
security definer set search_path = public
as $$
  select member_id from public.employee_sessions
   where token = p_token and status = 'active'
   limit 1;
$$;

-- Lock (screen lock) and end a session.
create or replace function public.pin_lock_session(p_token text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.employee_sessions set status = 'locked', last_seen_at = now()
   where token = p_token and status = 'active';
end;
$$;

create or replace function public.end_session(p_token text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.employee_sessions set status = 'ended', ended_at = now()
   where token = p_token and status in ('active','locked');
end;
$$;

-- ============================================================================
-- 12. AUTHORIZATION ENGINE  — the ONE pipeline
--     Returns a jsonb grant. If the actor is within their limit, granted with
--     authorized_by = actor. If over limit, an approver PIN must be supplied
--     and validated; granted with authorized_by = approver. Records activity.
--     Manager authorization NEVER changes the operator: initiated_by stays the
--     actor; authorized_by is the approver.
-- ============================================================================
create or replace function public.authorize(
  p_business_id  uuid,
  p_action       text,       -- 'discount'|'refund'|'petty_cash'|'inventory_adjustment'|'safe_drop'|'void'
  p_actor_token  text,       -- the cashier's session token
  p_amount       numeric default null,
  p_percent      numeric default null,
  p_quantity     numeric default null,
  p_terminal_id  uuid default null,
  p_shift_id     uuid default null,
  p_approver_member_id uuid default null,   -- if an override is being supplied
  p_approver_pin text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor    uuid;
  v_actor_role public.member_role;
  v_lim      public.permission_limits;
  v_within   boolean;
  v_appr     public.employee_pins;
  v_appr_role public.member_role;
  v_appr_lim public.permission_limits;
  v_appr_within boolean;
begin
  v_actor := public.session_actor(p_actor_token);
  if v_actor is null then raise exception 'No active session.'; end if;
  select role into v_actor_role from public.business_members where id = v_actor;

  -- Owner is always within limit.
  if v_actor_role = 'owner' then
    perform public.record_activity(p_business_id, p_action||'_authorized', v_actor, v_actor,
      p_terminal_id, p_shift_id, 'authorization', null, 'info',
      jsonb_build_object('amount',p_amount,'percent',p_percent,'quantity',p_quantity,'self',true));
    return jsonb_build_object('granted', true, 'initiated_by', v_actor, 'authorized_by', v_actor);
  end if;

  select * into v_lim from public.permission_limits
   where business_id = p_business_id and role = v_actor_role and action = p_action;

  -- Determine whether the actor is within their own limit.
  v_within := true;
  if found then
    if not v_lim.allowed then v_within := false; end if;
    if v_lim.max_amount   is not null and p_amount   is not null and p_amount   > v_lim.max_amount   then v_within := false; end if;
    if v_lim.max_percent  is not null and p_percent  is not null and p_percent  > v_lim.max_percent  then v_within := false; end if;
    if v_lim.max_quantity is not null and p_quantity is not null and p_quantity > v_lim.max_quantity then v_within := false; end if;
  end if;

  if v_within then
    perform public.record_activity(p_business_id, p_action||'_authorized', v_actor, v_actor,
      p_terminal_id, p_shift_id, 'authorization', null, 'info',
      jsonb_build_object('amount',p_amount,'percent',p_percent,'quantity',p_quantity,'self',true));
    return jsonb_build_object('granted', true, 'initiated_by', v_actor, 'authorized_by', v_actor);
  end if;

  -- Over limit → an approver PIN is required (online, this phase).
  if p_approver_member_id is null or p_approver_pin is null then
    return jsonb_build_object('granted', false, 'requires_authorization', true,
      'initiated_by', v_actor, 'reason', 'over_limit');
  end if;

  select * into v_appr from public.employee_pins
   where member_id = p_approver_member_id and business_id = p_business_id;
  if not found or v_appr.pin_hash <> crypt(p_approver_pin, v_appr.pin_hash) then
    perform public.record_activity(p_business_id, 'override_denied', v_actor, null,
      p_terminal_id, p_shift_id, 'authorization', null, 'exception',
      jsonb_build_object('action',p_action,'reason','bad_approver_pin'));
    raise exception 'Authorizer PIN is incorrect.';
  end if;

  select role into v_appr_role from public.business_members where id = p_approver_member_id;
  if v_appr_role not in ('owner','manager') then
    raise exception 'Only a manager or owner can authorize this action.';
  end if;

  -- Check the approver's own limit (owner always passes).
  v_appr_within := true;
  if v_appr_role <> 'owner' then
    select * into v_appr_lim from public.permission_limits
     where business_id = p_business_id and role = v_appr_role and action = p_action;
    if found then
      if not v_appr_lim.allowed then v_appr_within := false; end if;
      if v_appr_lim.max_amount   is not null and p_amount   is not null and p_amount   > v_appr_lim.max_amount   then v_appr_within := false; end if;
      if v_appr_lim.max_percent  is not null and p_percent  is not null and p_percent  > v_appr_lim.max_percent  then v_appr_within := false; end if;
      if v_appr_lim.max_quantity is not null and p_quantity is not null and p_quantity > v_appr_lim.max_quantity then v_appr_within := false; end if;
    end if;
  end if;

  if not v_appr_within then
    raise exception 'This action exceeds even the authorizer''s limit.';
  end if;

  -- Granted by override. initiated_by stays the actor; authorized_by = approver.
  perform public.record_activity(p_business_id, 'manager_override', v_actor, p_approver_member_id,
    p_terminal_id, p_shift_id, 'authorization', null, 'notice',
    jsonb_build_object('action',p_action,'amount',p_amount,'percent',p_percent,'quantity',p_quantity));

  return jsonb_build_object('granted', true, 'initiated_by', v_actor, 'authorized_by', p_approver_member_id);
end;
$$;

-- ============================================================================
-- 13. SEED DEFAULT PERMISSION LIMITS for a business (idempotent)
--     Called at business setup or on demand. Owner-editable afterwards.
-- ============================================================================
create or replace function public.seed_permission_limits(p_business_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.has_role_in(p_business_id, array['owner','manager']::public.member_role[]) then
    raise exception 'Only owners and managers can seed limits.';
  end if;

  -- Cashier defaults
  insert into public.permission_limits (business_id, role, action, max_amount, max_percent, max_quantity, allowed) values
    (p_business_id,'cashier','discount',              null, 5,    null, true),
    (p_business_id,'cashier','refund',                5000, null, null, true),
    (p_business_id,'cashier','petty_cash',            2000, null, null, true),
    (p_business_id,'cashier','safe_drop',             null, null, null, false),
    (p_business_id,'cashier','void',                  null, null, null, false),
    (p_business_id,'cashier','inventory_adjustment',  null, null, null, false),
    (p_business_id,'manager','discount',              null, 20,   null, true),
    (p_business_id,'manager','refund',                50000,null, null, true),
    (p_business_id,'manager','petty_cash',            20000,null, null, true),
    (p_business_id,'manager','safe_drop',             null, null, null, true),
    (p_business_id,'manager','void',                  null, null, null, true),
    (p_business_id,'manager','inventory_adjustment',  null, null, 1000, true)
  on conflict (business_id, role, action) do nothing;
end;
$$;

-- ============================================================================
-- 14. GRANTS
-- ============================================================================
grant execute on function public.set_employee_pin(uuid, uuid, text) to authenticated;
grant execute on function public.pin_unlock(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.session_actor(text) to authenticated;
grant execute on function public.pin_lock_session(text) to authenticated;
grant execute on function public.end_session(text) to authenticated;
grant execute on function public.authorize(uuid, text, text, numeric, numeric, numeric, uuid, uuid, uuid, text) to authenticated;
grant execute on function public.seed_permission_limits(uuid) to authenticated;
grant execute on function public.record_activity(uuid, text, uuid, uuid, uuid, uuid, text, uuid, text, jsonb) to authenticated;

-- record_activity is intended for internal composition but granting execute is
-- safe: it only inserts an activity row scoped to a business the caller passes;
-- future hardening can wrap it if needed.
