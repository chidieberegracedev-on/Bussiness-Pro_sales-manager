-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0022 — Scan & Print Infrastructure: schema + resolver + counting
--
-- Builds the database foundation for Phase 10 (the wide physical-world layer):
--   * product_barcodes — multi-barcode per variant (manufacturer/internal/
--       carton/warehouse/promotional), each resolving to ONE variant.
--   * resolve_barcode() — the single lookup every scan path calls. Search
--       order: variant.barcode (primary) → product_barcodes aliases. Returns
--       the variant AND its unit context (so carton scans respect conversion).
--   * count sessions — inventory_count_sessions (snapshots expected qty at
--       open) + inventory_count_items (per-variant counted vs snapshot).
--       Variance always compares against the SNAPSHOT, never live inventory,
--       so sales/receiving during a count cannot corrupt reconciliation.
--   * approve_count_session() — manager/owner-PIN-gated: posts each variance
--       as an adjustment stock movement (per-base cost, existing ledger),
--       emits a Stock-Shrinkage financial expense for net loss, and records
--       one activity event (counted by clerk, approved by manager).
--   * print_jobs — the queue every print request becomes a row in; the client
--       Print Engine drains it. Job model is device-neutral (HAL adapters).
--
-- HARD CONSTRAINTS:
--   * Additive. Reuses record_stock_movement (adjustment), emit_financial_event
--       (shrinkage), authorize()/record_activity (Phase 9). No shared-view
--       changes. Per-base-unit cost invariant respected — scanning never
--       bypasses conversion.
-- ============================================================================

-- ============================================================================
-- 1. MULTI-BARCODE
-- ============================================================================
create type public.barcode_kind as enum (
  'manufacturer', 'internal', 'carton', 'warehouse', 'promotional', 'other'
);

create table public.product_barcodes (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  variant_id   uuid not null references public.product_variants(id) on delete cascade,
  code         text not null,
  kind         public.barcode_kind not null default 'manufacturer',
  -- For carton/case barcodes: how many BASE units this code represents, so a
  -- carton scan at receiving increases base inventory correctly. 1 for unit
  -- barcodes. This ties the barcode layer to the Phase 5 conversion rule.
  units_per_scan numeric(14,3) not null default 1 check (units_per_scan > 0),
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now()
);

-- A given code is unique within a business (one code → one variant).
create unique index product_barcodes_code_unique_idx
  on public.product_barcodes (business_id, code);
create index product_barcodes_variant_idx on public.product_barcodes (variant_id);

alter table public.product_barcodes enable row level security;
create policy product_barcodes_select on public.product_barcodes
  for select using (public.is_member_of(business_id));
create policy product_barcodes_write on public.product_barcodes
  for all using (public.has_role_in(business_id, array['owner','manager','inventory_staff']::public.member_role[]))
  with check (public.has_role_in(business_id, array['owner','manager','inventory_staff']::public.member_role[]));

-- ============================================================================
-- 2. resolve_barcode — THE single resolver every scan path calls
--    Search order: variant.barcode (primary) → product_barcodes alias.
--    Returns variant identity + unit context. business-scoped.
-- ============================================================================
create or replace function public.resolve_barcode(
  p_business_id uuid,
  p_code        text
)
returns jsonb
language plpgsql stable
security definer set search_path = public
as $$
declare
  v_variant record;
  v_units numeric(14,3) := 1;
  v_kind  text := 'manufacturer';
begin
  if not public.is_member_of(p_business_id) then
    raise exception 'Not a member of this business.';
  end if;

  -- 1) primary barcode on the variant itself
  select v.id, v.variant_name, v.selling_price, v.sku, p.name as product_name, p.id as product_id
    into v_variant
    from public.product_variants v
    join public.products p on p.id = v.product_id
   where v.business_id = p_business_id and v.barcode = p_code
   limit 1;

  -- 2) alias in product_barcodes
  if not found then
    select v.id, v.variant_name, v.selling_price, v.sku, p.name as product_name, p.id as product_id,
           pb.units_per_scan, pb.kind::text as kind
      into v_variant
      from public.product_barcodes pb
      join public.product_variants v on v.id = pb.variant_id
      join public.products p on p.id = v.product_id
     where pb.business_id = p_business_id and pb.code = p_code
     limit 1;
    if found then
      v_units := v_variant.units_per_scan;
      v_kind  := v_variant.kind;
    end if;
  end if;

  if not found then
    return jsonb_build_object('found', false, 'code', p_code);
  end if;

  return jsonb_build_object(
    'found',         true,
    'code',          p_code,
    'variant_id',    v_variant.id,
    'product_id',    v_variant.product_id,
    'product_name',  v_variant.product_name,
    'variant_name',  v_variant.variant_name,
    'sku',           v_variant.sku,
    'selling_price', v_variant.selling_price::text,
    'units_per_scan',v_units::text,   -- base units this scan represents (carton-aware)
    'kind',          v_kind
  );
end;
$$;

-- ============================================================================
-- 3. INVENTORY COUNT SESSIONS  (snapshot-based)
-- ============================================================================
create type public.count_mode as enum (
  'cycle','blind','aisle','category','supplier','zone','full','recount'
);
create type public.count_status as enum ('open','counting','pending_approval','approved','cancelled');

create table public.inventory_count_sessions (
  id           uuid primary key,        -- client-generated
  business_id  uuid not null references public.businesses(id) on delete cascade,
  location_id  uuid not null references public.locations(id),
  mode         public.count_mode not null default 'cycle',
  status       public.count_status not null default 'open',
  is_blind     boolean not null default false,   -- hide expected until submit
  filter       jsonb not null default '{}'::jsonb, -- aisle/category/supplier/zone selector
  opened_by    uuid references public.business_members(id),
  opened_at    timestamptz not null default now(),
  approved_by  uuid references public.business_members(id),
  approved_at  timestamptz,
  note         text
);
create index count_sessions_business_idx on public.inventory_count_sessions (business_id, status);

create table public.inventory_count_items (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.inventory_count_sessions(id) on delete cascade,
  business_id   uuid not null references public.businesses(id) on delete cascade,
  variant_id    uuid not null references public.product_variants(id),
  location_id   uuid not null references public.locations(id),
  expected_qty  numeric(14,3) not null,   -- SNAPSHOT at session open — never re-read from live
  counted_qty   numeric(14,3),            -- null until counted
  avg_cost_snapshot numeric(18,4) not null default 0,  -- per-base cost at snapshot, for shrinkage value
  created_at    timestamptz not null default now(),
  unique (session_id, variant_id)
);
create index count_items_session_idx on public.inventory_count_items (session_id);

alter table public.inventory_count_sessions enable row level security;
alter table public.inventory_count_items    enable row level security;
create policy count_sessions_select on public.inventory_count_sessions
  for select using (public.is_member_of(business_id));
create policy count_items_select on public.inventory_count_items
  for select using (public.is_member_of(business_id));
-- writes via RPC (definer)

-- ---------------------------------------------------------------------------
-- open_count_session — snapshots expected qty + avg cost for the filtered set
-- ---------------------------------------------------------------------------
create or replace function public.open_count_session(
  p_session_id  uuid,
  p_business_id uuid,
  p_location_id uuid,
  p_mode        text default 'cycle',
  p_is_blind    boolean default false,
  p_variant_ids uuid[] default null      -- null = all active variants at location
)
returns public.inventory_count_sessions
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_opener uuid;
  v_session public.inventory_count_sessions;
begin
  if not public.has_role_in(p_business_id, array['owner','manager','inventory_staff']::public.member_role[]) then
    raise exception 'Insufficient permission to open a count.';
  end if;

  select id into v_opener from public.business_members
   where business_id = p_business_id and user_id = v_user limit 1;

  insert into public.inventory_count_sessions (
    id, business_id, location_id, mode, is_blind, status, opened_by
  ) values (
    p_session_id, p_business_id, p_location_id, p_mode::public.count_mode, p_is_blind, 'open', v_opener
  )
  returning * into v_session;

  -- SNAPSHOT: freeze expected qty + per-base avg cost now. Later sales/receiving
  -- do NOT change these rows, so variance stays honest.
  insert into public.inventory_count_items (
    session_id, business_id, variant_id, location_id, expected_qty, avg_cost_snapshot
  )
  select p_session_id, p_business_id, il.variant_id, il.location_id,
         il.qty_on_hand, il.avg_cost
    from public.inventory_levels il
    join public.product_variants v on v.id = il.variant_id
   where il.location_id = p_location_id
     and v.business_id = p_business_id
     and v.is_active
     and (p_variant_ids is null or il.variant_id = any(p_variant_ids));

  return v_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_count — set counted qty for a variant (scan +1 handled client-side,
-- submits the running total). Idempotent per (session, variant).
-- ---------------------------------------------------------------------------
create or replace function public.record_count(
  p_session_id uuid,
  p_variant_id uuid,
  p_counted_qty numeric
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare v_biz uuid;
begin
  select business_id into v_biz from public.inventory_count_sessions where id = p_session_id;
  if v_biz is null then raise exception 'Count session not found.'; end if;
  if not public.has_role_in(v_biz, array['owner','manager','inventory_staff']::public.member_role[]) then
    raise exception 'Insufficient permission.';
  end if;

  update public.inventory_count_items
     set counted_qty = p_counted_qty
   where session_id = p_session_id and variant_id = p_variant_id;

  update public.inventory_count_sessions set status = 'counting'
   where id = p_session_id and status = 'open';
end;
$$;

-- ---------------------------------------------------------------------------
-- approve_count_session — MANAGER/OWNER PIN GATE. Posts variances as
-- adjustments (existing ledger, per-base cost), emits Stock-Shrinkage expense
-- for net loss, records one activity event. Nothing changes inventory until
-- this approval.
-- ---------------------------------------------------------------------------
create or replace function public.approve_count_session(
  p_session_id  uuid,
  p_approver_member_id uuid,
  p_approver_pin text,
  p_actor_token text default null
)
returns jsonb
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_sess public.inventory_count_sessions;
  v_appr public.employee_pins;
  v_appr_role public.member_role;
  v_actor uuid;
  v_item record;
  v_delta numeric(14,3);
  v_shrinkage_value numeric(18,4) := 0;
  v_currency char(3);
  v_expense_cat uuid;
  v_adjust_count int := 0;
begin
  select * into v_sess from public.inventory_count_sessions where id = p_session_id;
  if not found then raise exception 'Count session not found.'; end if;
  if v_sess.status = 'approved' then
    return jsonb_build_object('already_approved', true);
  end if;

  -- Manager/owner PIN gate (same discipline as authorize()).
  select * into v_appr from public.employee_pins
   where member_id = p_approver_member_id and business_id = v_sess.business_id;
  if not found or v_appr.pin_hash <> extensions.crypt(p_approver_pin, v_appr.pin_hash) then
    perform public.record_activity(v_sess.business_id, 'count_approval_denied', null, null, null, null,
      'count_session', p_session_id, 'exception', jsonb_build_object('reason','bad_pin'));
    raise exception 'Approver PIN is incorrect.';
  end if;
  select role into v_appr_role from public.business_members where id = p_approver_member_id;
  if v_appr_role not in ('owner','manager') then
    raise exception 'Only a manager or owner can approve a count.';
  end if;

  v_actor := coalesce(public.session_actor(p_actor_token), v_sess.opened_by);
  select currency_code into v_currency from public.businesses where id = v_sess.business_id;

  -- Post each variance as an adjustment through the EXISTING ledger.
  for v_item in
    select * from public.inventory_count_items
     where session_id = p_session_id and counted_qty is not null
  loop
    v_delta := v_item.counted_qty - v_item.expected_qty;   -- vs SNAPSHOT
    if v_delta <> 0 then
      perform public.record_stock_movement(
        p_movement_id    => gen_random_uuid(),
        p_variant_id     => v_item.variant_id,
        p_location_id    => v_item.location_id,
        p_movement_type  => 'adjustment',
        p_quantity       => v_delta,                       -- signed
        p_reference_type => 'count_session',
        p_reference_id   => p_session_id,
        p_note           => 'Stock count adjustment'
      );
      v_adjust_count := v_adjust_count + 1;
      -- Shrinkage value only for LOSSES (negative delta), at snapshot cost.
      if v_delta < 0 then
        v_shrinkage_value := v_shrinkage_value + (abs(v_delta) * v_item.avg_cost_snapshot);
      end if;
    end if;
  end loop;

  -- Net shrinkage → a Stock Shrinkage expense (Phase 7 financial ledger).
  if v_shrinkage_value > 0 then
    insert into public.expense_categories (business_id, name)
    values (v_sess.business_id, 'Stock Shrinkage')
    on conflict (business_id, lower(name)) do nothing;
    select id into v_expense_cat from public.expense_categories
     where business_id = v_sess.business_id and lower(name) = 'stock shrinkage' limit 1;

    perform public.emit_financial_event(
      p_business_id    => v_sess.business_id,
      p_event_type     => 'expense'::public.financial_event_type,
      p_account        => 'expense'::public.financial_account,
      p_direction      => 'debit'::public.financial_direction,
      p_amount         => v_shrinkage_value,
      p_currency       => v_currency,
      p_reference_type => 'count_session',
      p_reference_id   => p_session_id,
      p_category_id    => v_expense_cat,
      p_created_by     => v_actor,
      p_note           => 'Stock shrinkage write-off');
  end if;

  update public.inventory_count_sessions
     set status = 'approved', approved_by = p_approver_member_id, approved_at = now()
   where id = p_session_id;

  perform public.record_activity(
    v_sess.business_id, 'count_approved', v_actor, p_approver_member_id, null, null,
    'count_session', p_session_id, 'notice',
    jsonb_build_object('adjustments', v_adjust_count, 'shrinkage_value', v_shrinkage_value::text));

  return jsonb_build_object(
    'approved', true, 'adjustments', v_adjust_count, 'shrinkage_value', v_shrinkage_value::text);
end;
$$;

-- ============================================================================
-- 4. PRINT QUEUE  (device-neutral job rows; the client Print Engine drains it)
-- ============================================================================
create type public.print_job_type as enum (
  'receipt','product_label','shelf_label','warehouse_label','variance_report','count_report','po_document','other'
);
create type public.print_job_status as enum ('queued','printing','done','failed','cancelled');

create table public.print_jobs (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  terminal_id  uuid references public.terminals(id),
  job_type     public.print_job_type not null,
  status       public.print_job_status not null default 'queued',
  payload      jsonb not null default '{}'::jsonb,   -- what to render (device-neutral)
  copies       int not null default 1 check (copies > 0),
  requested_by uuid references public.business_members(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index print_jobs_queue_idx on public.print_jobs (business_id, status, created_at)
  where status in ('queued','printing');

create trigger print_jobs_touch
  before update on public.print_jobs
  for each row execute function public.touch_updated_at();

alter table public.print_jobs enable row level security;
create policy print_jobs_rw on public.print_jobs
  for all using (public.is_member_of(business_id))
  with check (public.is_member_of(business_id));

-- ============================================================================
-- 5. GRANTS
-- ============================================================================
grant execute on function public.resolve_barcode(uuid, text) to authenticated;
grant execute on function public.open_count_session(uuid, uuid, uuid, text, boolean, uuid[]) to authenticated;
grant execute on function public.record_count(uuid, uuid, numeric) to authenticated;
grant execute on function public.approve_count_session(uuid, uuid, text, text) to authenticated;
grant select, insert, update on public.print_jobs to authenticated;
