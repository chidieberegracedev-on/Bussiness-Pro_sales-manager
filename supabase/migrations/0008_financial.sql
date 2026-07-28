-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0008 — Financial Management & Cash Control
--
-- Adds an APPEND-ONLY financial event ledger (same pattern as
-- stock_movements) plus expenses, cash-drawer shifts, and the emission of
-- financial events from complete_sale. Every balance is a PROJECTION of the
-- ledger — there are no stored balance columns.
--
-- HARD CONSTRAINTS:
--   * Additive. No ALTER of existing business tables beyond adding emission
--     inside complete_sale (function replace).
--   * Does NOT modify v_variant_stock or v_sale_summary (Android reads them).
--   * Double-entry underneath; NO accounting vocabulary is exposed to users.
--   * Every financial amount is exact decimal; per-base-unit cost invariant
--     is inherited (COGS reads sale_items.unit_cost — already converted).
--   * Web only; no Android surface.
-- ============================================================================

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

-- Accounts. 'bank' is a single logical account this phase; bank_account_id on
-- events (nullable) lets multiple named bank accounts be added later without
-- reshaping data.
create type public.financial_account as enum (
  'cash', 'bank', 'safe', 'petty_cash', 'supplier_payable',
  'revenue', 'cogs', 'expense'
);

create type public.financial_direction as enum ('debit', 'credit');

create type public.financial_event_type as enum (
  'sale_revenue', 'sale_cogs', 'cash_in', 'bank_in',
  'expense', 'supplier_payable_add', 'supplier_payment',
  'safe_drop_out', 'safe_drop_in', 'petty_cash_out', 'petty_cash_fund',
  'float_open', 'drawer_variance', 'adjustment'
);

create type public.shift_status as enum ('open', 'closed');

-- ============================================================================
-- 2. BANK ACCOUNTS  (one row this phase; table exists so multi-bank is additive)
-- ============================================================================

create table public.bank_accounts (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null default 'Bank',
  is_default  boolean not null default true,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index bank_accounts_one_default_idx
  on public.bank_accounts (business_id) where is_default;
create index bank_accounts_business_idx on public.bank_accounts (business_id);

-- ============================================================================
-- 3. EXPENSE CATEGORIES
-- ============================================================================

create table public.expense_categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 60),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index expense_categories_unique_idx
  on public.expense_categories (business_id, lower(name));

-- ============================================================================
-- 4. CASH SHIFTS  (one open shift per location)
-- ============================================================================

create table public.cash_shifts (
  id            uuid primary key,        -- client-generated
  business_id   uuid not null references public.businesses(id) on delete cascade,
  location_id   uuid not null references public.locations(id),
  opened_by     uuid references public.profiles(id) on delete set null,
  opened_at     timestamptz not null default now(),
  opening_float numeric(18,4) not null default 0 check (opening_float >= 0),

  closed_by     uuid references public.profiles(id) on delete set null,
  closed_at     timestamptz,
  counted_cash  numeric(18,4),           -- entered blind, before expected shown
  expected_cash numeric(18,4),           -- computed server-side at close
  variance      numeric(18,4),           -- counted - expected

  status        public.shift_status not null default 'open',
  note          text,
  created_at    timestamptz not null default now()
);

-- At most one open shift per location.
create unique index cash_shifts_one_open_per_location_idx
  on public.cash_shifts (location_id) where status = 'open';
create index cash_shifts_business_idx on public.cash_shifts (business_id, opened_at desc);

-- ============================================================================
-- 5. EXPENSES
-- ============================================================================

create table public.expenses (
  id            uuid primary key,        -- client-generated (idempotent)
  business_id   uuid not null references public.businesses(id) on delete cascade,
  location_id   uuid references public.locations(id),
  category_id   uuid references public.expense_categories(id) on delete set null,
  amount        numeric(18,4) not null check (amount > 0),
  currency_code char(3) not null,
  paid_from     public.financial_account not null default 'cash'
                  check (paid_from in ('cash','bank','petty_cash')),
  bank_account_id uuid references public.bank_accounts(id),
  description   text,
  receipt_path  text,
  shift_id      uuid references public.cash_shifts(id),
  spent_at      timestamptz not null default now(),
  recorded_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index expenses_business_time_idx on public.expenses (business_id, spent_at desc);
create index expenses_category_idx on public.expenses (category_id);

-- ============================================================================
-- 6. FINANCIAL EVENTS  (append-only ledger — the single source of truth)
-- ============================================================================

create table public.financial_events (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,

  event_type     public.financial_event_type not null,
  account        public.financial_account not null,
  direction      public.financial_direction not null,  -- hidden from users
  amount         numeric(18,4) not null check (amount >= 0),
  currency_code  char(3) not null,

  bank_account_id uuid references public.bank_accounts(id),   -- when account='bank'
  shift_id        uuid references public.cash_shifts(id),
  category_id     uuid references public.expense_categories(id),

  reference_type text,     -- 'sale' | 'goods_receipt' | 'expense' | 'shift' | ...
  reference_id   uuid,

  occurred_at    timestamptz not null default now(),
  created_by     uuid references public.profiles(id) on delete set null,
  note           text,
  created_at     timestamptz not null default now()
);

create index financial_events_business_account_time_idx
  on public.financial_events (business_id, account, occurred_at);
create index financial_events_reference_idx
  on public.financial_events (reference_type, reference_id);
create index financial_events_shift_idx
  on public.financial_events (shift_id) where shift_id is not null;

-- Append-only: reuse the existing guard.
create trigger financial_events_no_update
  before update on public.financial_events
  for each row execute function public.deny_mutation();
create trigger financial_events_no_delete
  before delete on public.financial_events
  for each row execute function public.deny_mutation();

-- ============================================================================
-- 7. RLS
-- ============================================================================

alter table public.bank_accounts      enable row level security;
alter table public.expense_categories enable row level security;
alter table public.cash_shifts        enable row level security;
alter table public.expenses           enable row level security;
alter table public.financial_events   enable row level security;

-- Financial data is owner/manager-sensitive; reads limited to members but
-- cost/profit surfacing is gated in the projections, not here.
create policy bank_accounts_select on public.bank_accounts
  for select using (public.is_member_of(business_id));
create policy bank_accounts_write on public.bank_accounts
  for all using (public.has_role_in(business_id, array['owner','manager']::public.member_role[]))
  with check (public.has_role_in(business_id, array['owner','manager']::public.member_role[]));

create policy expense_categories_select on public.expense_categories
  for select using (public.is_member_of(business_id));
create policy expense_categories_write on public.expense_categories
  for all using (public.has_role_in(business_id, array['owner','manager']::public.member_role[]))
  with check (public.has_role_in(business_id, array['owner','manager']::public.member_role[]));

create policy cash_shifts_select on public.cash_shifts
  for select using (public.is_member_of(business_id));

create policy expenses_select on public.expenses
  for select using (public.is_member_of(business_id));

create policy financial_events_select on public.financial_events
  for select using (public.is_member_of(business_id));

-- Writes to shifts, expenses, and events go through RPCs (SECURITY DEFINER).

-- ============================================================================
-- 8. INTERNAL: emit a financial event (not user-callable directly)
-- ============================================================================

create or replace function public.emit_financial_event(
  p_business_id   uuid,
  p_event_type    public.financial_event_type,
  p_account       public.financial_account,
  p_direction     public.financial_direction,
  p_amount        numeric,
  p_currency      char(3),
  p_reference_type text default null,
  p_reference_id  uuid default null,
  p_shift_id      uuid default null,
  p_category_id   uuid default null,
  p_bank_account_id uuid default null,
  p_created_by    uuid default null,
  p_note          text default null,
  p_occurred_at   timestamptz default now()
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare v_id uuid;
begin
  if p_amount is null or p_amount < 0 then
    raise exception 'Financial event amount must be non-negative.';
  end if;
  insert into public.financial_events (
    business_id, event_type, account, direction, amount, currency_code,
    bank_account_id, shift_id, category_id, reference_type, reference_id,
    created_by, note, occurred_at
  ) values (
    p_business_id, p_event_type, p_account, p_direction, p_amount, p_currency,
    p_bank_account_id, p_shift_id, p_category_id, p_reference_type, p_reference_id,
    p_created_by, p_note, p_occurred_at
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ============================================================================
-- 9. BALANCE PROJECTION  (every balance is sum-of-events; no stored balance)
-- ============================================================================

create or replace function public.account_balance(
  p_business_id uuid,
  p_account     public.financial_account
)
returns numeric
language sql stable
security definer set search_path = public
as $$
  select coalesce(sum(
    case when direction = 'credit' then amount else -amount end
  ), 0)
  from public.financial_events
  where business_id = p_business_id and account = p_account;
$$;

-- All balances at once, for the dashboard.
create or replace function public.financial_position(p_business_id uuid)
returns jsonb
language plpgsql stable
security definer set search_path = public
as $$
declare v jsonb;
begin
  if not public.has_role_in(p_business_id, array['owner','manager']::public.member_role[]) then
    raise exception 'Financial position is available to owners and managers.';
  end if;

  select jsonb_build_object(
    'cash',             public.account_balance(p_business_id, 'cash')::text,
    'bank',             public.account_balance(p_business_id, 'bank')::text,
    'safe',             public.account_balance(p_business_id, 'safe')::text,
    'petty_cash',       public.account_balance(p_business_id, 'petty_cash')::text,
    'supplier_payable', public.account_balance(p_business_id, 'supplier_payable')::text,
    -- Available cash = liquid accounts minus what is owed.
    'available_cash', (
        public.account_balance(p_business_id, 'cash')
      + public.account_balance(p_business_id, 'bank')
      + public.account_balance(p_business_id, 'safe')
      + public.account_balance(p_business_id, 'petty_cash')
      - public.account_balance(p_business_id, 'supplier_payable')
    )::text,
    'currency_code', (select currency_code from public.businesses where id = p_business_id)
  ) into v;
  return v;
end;
$$;

-- ============================================================================
-- 10. RPC: record_expense
-- ============================================================================

create or replace function public.record_expense(
  p_expense_id  uuid,
  p_business_id uuid,
  p_amount      numeric,
  p_paid_from   text default 'cash',
  p_category_id uuid default null,
  p_description text default null,
  p_location_id uuid default null,
  p_shift_id    uuid default null,
  p_receipt_path text default null,
  p_spent_at    timestamptz default now()
)
returns public.expenses
language plpgsql
security definer set search_path = public
as $$
declare
  v_user     uuid := (select auth.uid());
  v_existing public.expenses;
  v_expense  public.expenses;
  v_currency char(3);
  v_bank     uuid;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  -- Owners/managers always; cashiers may record (role gate can tighten later).
  if not public.has_role_in(p_business_id,
       array['owner','manager','cashier']::public.member_role[]) then
    raise exception 'Insufficient permission to record an expense.';
  end if;

  select * into v_existing from public.expenses where id = p_expense_id;
  if found then return v_existing; end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Expense amount must be positive.';
  end if;
  if p_paid_from not in ('cash','bank','petty_cash') then
    raise exception 'Expense must be paid from cash, bank, or petty_cash.';
  end if;

  select currency_code into v_currency from public.businesses where id = p_business_id;
  if p_paid_from = 'bank' then
    select id into v_bank from public.bank_accounts
     where business_id = p_business_id and is_default limit 1;
  end if;

  insert into public.expenses (
    id, business_id, location_id, category_id, amount, currency_code,
    paid_from, bank_account_id, description, receipt_path, shift_id, spent_at, recorded_by
  ) values (
    p_expense_id, p_business_id, p_location_id, p_category_id, p_amount, v_currency,
    p_paid_from::public.financial_account, v_bank,
    nullif(trim(coalesce(p_description,'')),''), p_receipt_path, p_shift_id, p_spent_at, v_user
  )
  returning * into v_expense;

  -- Two events: the expense (P&L) and the cash/bank/petty outflow.
  perform public.emit_financial_event(
    p_business_id, 'expense', 'expense', 'debit', p_amount, v_currency,
    'expense', p_expense_id, p_shift_id, p_category_id, null, v_user,
    'Expense', p_spent_at);

  perform public.emit_financial_event(
    p_business_id, 'expense', p_paid_from::public.financial_account, 'debit',
    p_amount, v_currency, 'expense', p_expense_id, p_shift_id, p_category_id, v_bank, v_user,
    'Expense payment', p_spent_at);

  return v_expense;
end;
$$;

-- ============================================================================
-- 11. RPC: cash shift open / close (blind reconciliation)
-- ============================================================================

create or replace function public.open_shift(
  p_shift_id     uuid,
  p_business_id  uuid,
  p_location_id  uuid,
  p_opening_float numeric default 0
)
returns public.cash_shifts
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_existing public.cash_shifts;
  v_shift public.cash_shifts;
  v_currency char(3);
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if not public.has_role_in(p_business_id,
       array['owner','manager','cashier']::public.member_role[]) then
    raise exception 'Insufficient permission to open a shift.';
  end if;

  select * into v_existing from public.cash_shifts where id = p_shift_id;
  if found then return v_existing; end if;

  if exists (select 1 from public.cash_shifts
              where location_id = p_location_id and status = 'open') then
    raise exception 'A shift is already open at this location.';
  end if;

  select currency_code into v_currency from public.businesses where id = p_business_id;

  insert into public.cash_shifts (
    id, business_id, location_id, opened_by, opening_float, status
  ) values (
    p_shift_id, p_business_id, p_location_id, v_user, coalesce(p_opening_float,0), 'open'
  )
  returning * into v_shift;

  -- Opening float is cash placed into the drawer (a cash inflow to the drawer).
  if coalesce(p_opening_float,0) > 0 then
    perform public.emit_financial_event(
      p_business_id, 'float_open', 'cash', 'credit', p_opening_float, v_currency,
      'shift', p_shift_id, p_shift_id, null, null, v_user, 'Opening float');
  end if;

  return v_shift;
end;
$$;

-- Close is blind: caller submits counted_cash; expected is computed here and
-- only returned in the result. The caller cannot see expected beforehand.
create or replace function public.close_shift(
  p_shift_id     uuid,
  p_counted_cash numeric,
  p_note         text default null
)
returns public.cash_shifts
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_shift public.cash_shifts;
  v_expected numeric(18,4);
  v_variance numeric(18,4);
  v_currency char(3);
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'A counted cash amount is required to close a shift.';
  end if;

  select * into v_shift from public.cash_shifts where id = p_shift_id for update;
  if not found then raise exception 'Shift not found.'; end if;
  if not public.has_role_in(v_shift.business_id,
       array['owner','manager','cashier']::public.member_role[]) then
    raise exception 'Insufficient permission to close this shift.';
  end if;
  if v_shift.status = 'closed' then
    return v_shift;   -- idempotent
  end if;

  -- Expected = net of all cash-account events tagged to this shift.
  select coalesce(sum(case when direction='credit' then amount else -amount end),0)
    into v_expected
    from public.financial_events
   where shift_id = p_shift_id and account = 'cash';

  v_variance := round(p_counted_cash - v_expected, 4);

  select currency_code into v_currency from public.businesses where id = v_shift.business_id;

  -- A variance is itself an explainable event (keeps cash balance == reality).
  if v_variance <> 0 then
    perform public.emit_financial_event(
      v_shift.business_id, 'drawer_variance', 'cash',
      case when v_variance > 0 then 'credit' else 'debit' end,
      abs(v_variance), v_currency, 'shift', p_shift_id, p_shift_id, null, null, v_user,
      'Drawer variance on close');
  end if;

  update public.cash_shifts
     set status = 'closed', closed_by = v_user, closed_at = now(),
         counted_cash = p_counted_cash, expected_cash = v_expected, variance = v_variance,
         note = nullif(trim(coalesce(p_note,'')),'')
   where id = p_shift_id
  returning * into v_shift;

  return v_shift;
end;
$$;

-- ============================================================================
-- 12. RPC: cash transfers — safe drop, petty cash funding
--     Money moved, never created/destroyed: paired events sum to zero.
-- ============================================================================

create or replace function public.transfer_cash(
  p_event_id    uuid,
  p_business_id uuid,
  p_from        text,          -- 'cash' | 'bank' | 'safe' | 'petty_cash'
  p_to          text,
  p_amount      numeric,
  p_shift_id    uuid default null,
  p_note        text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_currency char(3);
  v_type public.financial_event_type;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if not public.has_role_in(p_business_id,
       array['owner','manager','cashier']::public.member_role[]) then
    raise exception 'Insufficient permission.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Transfer amount must be positive.';
  end if;
  if p_from = p_to then raise exception 'Source and destination differ.'; end if;

  -- Idempotency on the paired transfer: if either leg exists, stop.
  if exists (select 1 from public.financial_events where reference_id = p_event_id
             and reference_type = 'transfer') then
    return;
  end if;

  select currency_code into v_currency from public.businesses where id = p_business_id;
  v_type := case
    when p_to = 'safe' then 'safe_drop_out'
    when p_to = 'petty_cash' then 'petty_cash_fund'
    else 'adjustment' end;

  -- Out of source (debit) and into destination (credit): nets to zero.
  perform public.emit_financial_event(
    p_business_id, v_type, p_from::public.financial_account, 'debit',
    p_amount, v_currency, 'transfer', p_event_id, p_shift_id, null, null, v_user, p_note);
  perform public.emit_financial_event(
    p_business_id, v_type, p_to::public.financial_account, 'credit',
    p_amount, v_currency, 'transfer', p_event_id, p_shift_id, null, null, v_user, p_note);
end;
$$;

-- ============================================================================
-- 13. EXTEND complete_sale TO EMIT FINANCIAL EVENTS
--     Replaces the function, preserving all existing behaviour and adding
--     revenue, COGS, and per-payment cash/bank events. COGS reads the
--     already-converted per-base cost from the movement (invariant respected).
--     A p_shift_id is accepted so cash sales attach to the open drawer.
-- ============================================================================

create or replace function public.complete_sale(
  p_sale_id     uuid,
  p_business_id uuid,
  p_location_id uuid,
  p_items       jsonb,
  p_payments    jsonb default '[]'::jsonb,
  p_note        text  default null,
  p_shift_id    uuid  default null
)
returns public.sales
language plpgsql
security definer set search_path = public
as $$
declare
  v_user     uuid := (select auth.uid());
  v_existing public.sales;
  v_sale     public.sales;
  v_number   bigint;
  v_currency char(3);
  v_item     jsonb;
  v_payment  jsonb;
  v_variant  record;
  v_qty      numeric(14,3);
  v_movement public.stock_movements;
  v_line_total numeric(18,4);
  v_line_cost  numeric(18,4);
  v_subtotal   numeric(18,4) := 0;
  v_cost_total numeric(18,4) := 0;
  v_method     text;
  v_amount     numeric(18,4);
  v_bank       uuid;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if not public.has_role_in(p_business_id,
       array['owner','manager','cashier']::public.member_role[]) then
    raise exception 'Insufficient permission to complete a sale.';
  end if;

  select * into v_existing from public.sales where id = p_sale_id;
  if found then return v_existing; end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A sale must contain at least one item.';
  end if;
  if not exists (select 1 from public.locations
                  where id = p_location_id and business_id = p_business_id) then
    raise exception 'Location does not belong to this business.';
  end if;

  select currency_code into v_currency from public.businesses where id = p_business_id;

  insert into public.sale_counters (business_id, next_number)
  values (p_business_id, 1)
  on conflict (business_id)
    do update set next_number = public.sale_counters.next_number + 1
  returning next_number into v_number;

  insert into public.sales (
    id, business_id, location_id, sale_number, status,
    subtotal, discount_total, tax_total, grand_total, cost_total,
    currency_code, sold_by, note
  ) values (
    p_sale_id, p_business_id, p_location_id, v_number, 'completed',
    0,0,0,0,0, v_currency, v_user, nullif(trim(coalesce(p_note,'')),'')
  )
  returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Each line must have a positive quantity.';
    end if;

    select v.id, v.selling_price, v.variant_name, v.sku, p.name as product_name
      into v_variant
      from public.product_variants v
      join public.products p on p.id = v.product_id
     where v.id = (v_item ->> 'variant_id')::uuid and v.business_id = p_business_id;
    if not found then
      raise exception 'Variant % not found in this business.', v_item ->> 'variant_id';
    end if;

    v_movement := public.record_stock_movement(
      p_movement_id    => (v_item ->> 'movement_id')::uuid,
      p_variant_id     => v_variant.id,
      p_location_id    => p_location_id,
      p_movement_type  => 'sale',
      p_quantity       => -v_qty,
      p_reference_type => 'sale',
      p_reference_id   => p_sale_id
    );

    v_line_total := round(v_qty * v_variant.selling_price, 4);
    v_line_cost  := round(v_qty * v_movement.unit_cost, 4);   -- converted per-base cost

    insert into public.sale_items (
      sale_id, business_id, variant_id, product_name, variant_name, sku,
      quantity, unit_price, unit_cost, line_total, line_cost
    ) values (
      p_sale_id, p_business_id, v_variant.id,
      v_variant.product_name, v_variant.variant_name, v_variant.sku,
      v_qty, v_variant.selling_price, v_movement.unit_cost, v_line_total, v_line_cost
    );

    v_subtotal   := v_subtotal + v_line_total;
    v_cost_total := v_cost_total + v_line_cost;
  end loop;

  for v_payment in select * from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb))
  loop
    insert into public.sale_payments (sale_id, business_id, method, amount)
    values (
      p_sale_id, p_business_id,
      coalesce(v_payment ->> 'method','other'),
      coalesce((v_payment ->> 'amount')::numeric, 0)
    );
  end loop;

  update public.sales
     set subtotal = v_subtotal, grand_total = v_subtotal, cost_total = v_cost_total
   where id = p_sale_id
  returning * into v_sale;

  -- ---- FINANCIAL EVENTS (new) --------------------------------------------
  -- Revenue (credit) and COGS (debit), from the snapshotted, converted values.
  perform public.emit_financial_event(
    p_business_id, 'sale_revenue', 'revenue', 'credit', v_subtotal, v_currency,
    'sale', p_sale_id, p_shift_id, null, null, v_user, 'Sale revenue');
  if v_cost_total > 0 then
    perform public.emit_financial_event(
      p_business_id, 'sale_cogs', 'cogs', 'debit', v_cost_total, v_currency,
      'sale', p_sale_id, p_shift_id, null, null, v_user, 'Cost of goods sold');
  end if;

  -- Money in, per payment split → cash or bank. Split payments fall out here.
  select id into v_bank from public.bank_accounts
   where business_id = p_business_id and is_default limit 1;

  for v_payment in select * from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb))
  loop
    v_method := coalesce(v_payment ->> 'method','other');
    v_amount := coalesce((v_payment ->> 'amount')::numeric, 0);
    if v_amount > 0 then
      if v_method = 'cash' then
        perform public.emit_financial_event(
          p_business_id, 'cash_in', 'cash', 'credit', v_amount, v_currency,
          'sale', p_sale_id, p_shift_id, null, null, v_user, 'Cash sale');
      else
        -- card / transfer / other → bank this phase
        perform public.emit_financial_event(
          p_business_id, 'bank_in', 'bank', 'credit', v_amount, v_currency,
          'sale', p_sale_id, p_shift_id, null, v_bank, v_user, 'Non-cash sale');
      end if;
    end if;
  end loop;

  return v_sale;
end;
$$;

-- ============================================================================
-- 14. VIEW: unified cashbook (the event stream, human-facing)
-- ============================================================================

create or replace view public.v_cashbook
with (security_invoker = true) as
select
  fe.id,
  fe.business_id,
  fe.occurred_at,
  fe.event_type,
  fe.account,
  case when fe.direction = 'credit' then fe.amount else -fe.amount end as signed_amount,
  fe.amount,
  fe.currency_code,
  fe.reference_type,
  fe.reference_id,
  fe.shift_id,
  fe.note
from public.financial_events fe
where fe.account in ('cash','bank','safe','petty_cash');

-- ============================================================================
-- 15. GRANTS
-- ============================================================================

grant select on public.v_cashbook to authenticated;

grant execute on function public.account_balance(uuid, public.financial_account) to authenticated;
grant execute on function public.financial_position(uuid) to authenticated;
grant execute on function public.record_expense(uuid, uuid, numeric, text, uuid, text, uuid, uuid, text, timestamptz) to authenticated;
grant execute on function public.open_shift(uuid, uuid, uuid, numeric) to authenticated;
grant execute on function public.close_shift(uuid, numeric, text) to authenticated;
grant execute on function public.transfer_cash(uuid, uuid, text, text, numeric, uuid, text) to authenticated;
grant execute on function public.complete_sale(uuid, uuid, uuid, jsonb, jsonb, text, uuid) to authenticated;

-- emit_financial_event is internal; not granted to authenticated.
