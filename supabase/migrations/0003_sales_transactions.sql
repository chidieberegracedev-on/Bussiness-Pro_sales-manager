-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0003 — Sales & Transactions
--
-- Adds: sale_status enum, sales, sale_items, sale_payments, per-business
--       sale-number counter, complete_sale() and void_sale() RPCs, and a
--       read view for list screens.
--
-- Composes with 0001. Inventory is touched ONLY through the existing
-- record_stock_movement(); no inventory logic is duplicated here.
-- No existing table is altered. No data migration.
-- ============================================================================

-- ============================================================================
-- 1. ENUM
-- ============================================================================

create type public.sale_status as enum ('completed', 'voided');

-- ============================================================================
-- 2. PER-BUSINESS SALE NUMBER COUNTER
--    A dedicated counter row per business, incremented atomically inside the
--    sale transaction. This is the concurrency-safe alternative to count(*)+1,
--    which hands two simultaneous cashiers the same number.
-- ============================================================================

create table public.sale_counters (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  next_number bigint not null default 0
);

-- ============================================================================
-- 3. SALES  (transaction header)
-- ============================================================================

create table public.sales (
  -- Client-generated. Doubles as the idempotency key for complete_sale().
  id             uuid primary key,

  business_id    uuid not null references public.businesses(id) on delete cascade,
  location_id    uuid not null references public.locations(id),
  sale_number    bigint not null,

  status         public.sale_status not null default 'completed',

  -- Money. All snapshots; never recomputed from live product data.
  subtotal       numeric(18,4) not null default 0 check (subtotal >= 0),
  discount_total numeric(18,4) not null default 0 check (discount_total >= 0),
  tax_total      numeric(18,4) not null default 0 check (tax_total >= 0),
  grand_total    numeric(18,4) not null default 0 check (grand_total >= 0),
  cost_total     numeric(18,4) not null default 0 check (cost_total >= 0),

  currency_code  char(3) not null,   -- snapshot of business currency at sale time

  sold_by        uuid references public.profiles(id) on delete set null,
  note           text,

  voided_at      timestamptz,
  voided_by      uuid references public.profiles(id) on delete set null,
  void_reason    text,

  completed_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),

  unique (business_id, sale_number)
);

create index sales_business_time_idx on public.sales (business_id, completed_at desc);
create index sales_business_status_idx on public.sales (business_id, status);

-- ============================================================================
-- 4. SALE ITEMS  (immutable line snapshot)
--    Display and money come from these snapshots, never from a live join to
--    product_variants. Editing a product later cannot change a past sale.
-- ============================================================================

create table public.sale_items (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid not null references public.sales(id) on delete cascade,
  business_id  uuid not null references public.businesses(id) on delete cascade,

  -- Reference only, for analytics tracing back to the live product.
  -- Never read for display or money.
  variant_id   uuid references public.product_variants(id) on delete set null,

  -- Snapshots, captured at completion:
  product_name text not null,
  variant_name text,
  sku          text,

  quantity     numeric(14,3) not null check (quantity > 0),   -- base units
  unit_price   numeric(18,4) not null check (unit_price >= 0),
  unit_cost    numeric(18,4) not null check (unit_cost >= 0),
  line_total   numeric(18,4) not null check (line_total >= 0),
  line_cost    numeric(18,4) not null check (line_cost >= 0),

  created_at   timestamptz not null default now()
);

create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_variant_idx on public.sale_items (variant_id);

-- ============================================================================
-- 5. SALE PAYMENTS
--    One row per sale this phase. Own table so split/partial payment is an
--    additive insert later, not a schema change.
-- ============================================================================

create table public.sale_payments (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid not null references public.sales(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  method      text not null check (method in ('cash','card','transfer','other')),
  amount      numeric(18,4) not null check (amount >= 0),
  created_at  timestamptz not null default now()
);

create index sale_payments_sale_idx on public.sale_payments (sale_id);

-- ============================================================================
-- 6. RLS
--    Reads for members. No client write path — sales are written only through
--    the RPCs (SECURITY DEFINER), exactly like stock_movements.
-- ============================================================================

alter table public.sales         enable row level security;
alter table public.sale_items    enable row level security;
alter table public.sale_payments enable row level security;

create policy sales_select on public.sales
  for select using (public.is_member_of(business_id));

create policy sale_items_select on public.sale_items
  for select using (public.is_member_of(business_id));

create policy sale_payments_select on public.sale_payments
  for select using (public.is_member_of(business_id));

-- sale_counters is internal; no client access at all.
alter table public.sale_counters enable row level security;

-- ============================================================================
-- 7. RPC: complete_sale
--    The single atomic entry point. Web and Android both call this.
--
--    p_items    jsonb array, each:
--      { "variant_id": "<uuid>", "quantity": <number>, "movement_id": "<uuid>" }
--    p_payments jsonb array, each:
--      { "method": "cash", "amount": <number> }
--
--    Selling price and cost are read SERVER-SIDE. The client cannot set them.
-- ============================================================================

create or replace function public.complete_sale(
  p_sale_id     uuid,
  p_business_id uuid,
  p_location_id uuid,
  p_items       jsonb,
  p_payments    jsonb default '[]'::jsonb,
  p_note        text  default null
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
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  -- Cashiers and above may complete a sale.
  if not public.has_role_in(p_business_id,
       array['owner','manager','cashier']::public.member_role[]) then
    raise exception 'Insufficient permission to complete a sale.';
  end if;

  -- Idempotency: a replayed sale id returns the original, writes nothing.
  select * into v_existing from public.sales where id = p_sale_id;
  if found then
    return v_existing;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A sale must contain at least one item.';
  end if;

  if not exists (
    select 1 from public.locations
     where id = p_location_id and business_id = p_business_id
  ) then
    raise exception 'Location does not belong to this business.';
  end if;

  select currency_code into v_currency
    from public.businesses where id = p_business_id;

  -- Allocate a sequential per-business number atomically.
  insert into public.sale_counters (business_id, next_number)
  values (p_business_id, 1)
  on conflict (business_id)
    do update set next_number = public.sale_counters.next_number + 1
  returning next_number into v_number;

  -- Insert the header first so items and movements can reference it.
  insert into public.sales (
    id, business_id, location_id, sale_number, status,
    subtotal, discount_total, tax_total, grand_total, cost_total,
    currency_code, sold_by, note
  ) values (
    p_sale_id, p_business_id, p_location_id, v_number, 'completed',
    0, 0, 0, 0, 0,
    v_currency, v_user, nullif(trim(coalesce(p_note,'')), '')
  )
  returning * into v_sale;

  -- Lines.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Each line must have a positive quantity.';
    end if;

    -- Read live price and identity, server-side, for this business only.
    select v.id, v.selling_price, v.variant_name, v.sku, p.name as product_name
      into v_variant
      from public.product_variants v
      join public.products p on p.id = v.product_id
     where v.id = (v_item ->> 'variant_id')::uuid
       and v.business_id = p_business_id;

    if not found then
      raise exception 'Variant % not found in this business.', v_item ->> 'variant_id';
    end if;

    -- Deduct through the existing ledger RPC. This snapshots COGS at the
    -- moving average, leaves the average unchanged, and is itself idempotent.
    v_movement := public.record_stock_movement(
      p_movement_id   => (v_item ->> 'movement_id')::uuid,
      p_variant_id    => v_variant.id,
      p_location_id   => p_location_id,
      p_movement_type => 'sale',
      p_quantity      => -v_qty,
      p_reference_type => 'sale',
      p_reference_id   => p_sale_id
    );

    v_line_total := round(v_qty * v_variant.selling_price, 4);
    v_line_cost  := round(v_qty * v_movement.unit_cost, 4);

    insert into public.sale_items (
      sale_id, business_id, variant_id,
      product_name, variant_name, sku,
      quantity, unit_price, unit_cost, line_total, line_cost
    ) values (
      p_sale_id, p_business_id, v_variant.id,
      v_variant.product_name, v_variant.variant_name, v_variant.sku,
      v_qty, v_variant.selling_price, v_movement.unit_cost, v_line_total, v_line_cost
    );

    v_subtotal   := v_subtotal + v_line_total;
    v_cost_total := v_cost_total + v_line_cost;
  end loop;

  -- Payments (stored as passed; change-due is a client concern this phase).
  for v_payment in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb))
  loop
    insert into public.sale_payments (sale_id, business_id, method, amount)
    values (
      p_sale_id, p_business_id,
      coalesce(v_payment ->> 'method', 'other'),
      coalesce((v_payment ->> 'amount')::numeric, 0)
    );
  end loop;

  -- Finalize totals. No discount or tax this phase; columns stay zero.
  update public.sales
     set subtotal    = v_subtotal,
         grand_total = v_subtotal,
         cost_total  = v_cost_total
   where id = p_sale_id
  returning * into v_sale;

  return v_sale;
end;
$$;

-- ============================================================================
-- 8. RPC: void_sale
--    Flips status to 'voided' and returns every sold unit to stock via a
--    compensating 'sale_reversal' movement at the original COGS.
--    Owner/manager only. Idempotent under the sale row lock.
-- ============================================================================

create or replace function public.void_sale(
  p_sale_id uuid,
  p_reason  text default null
)
returns public.sales
language plpgsql
security definer set search_path = public
as $$
declare
  v_user  uuid := (select auth.uid());
  v_sale  public.sales;
  v_item  record;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  -- Lock the sale row so concurrent voids serialize.
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Sale not found.';
  end if;

  if not public.has_role_in(v_sale.business_id,
       array['owner','manager']::public.member_role[]) then
    raise exception 'Only an owner or manager can void a sale.';
  end if;

  -- Idempotent: already voided returns unchanged.
  if v_sale.status = 'voided' then
    return v_sale;
  end if;

  -- Return each line to stock at its recorded cost, restoring the basis.
  for v_item in
    select * from public.sale_items where sale_id = p_sale_id
  loop
    perform public.record_stock_movement(
      p_movement_id    => gen_random_uuid(),
      p_variant_id     => v_item.variant_id,
      p_location_id    => v_sale.location_id,
      p_movement_type  => 'sale_reversal',
      p_quantity       => v_item.quantity,          -- positive: back into stock
      p_unit_cost      => v_item.unit_cost,         -- restore original COGS
      p_reference_type => 'void',
      p_reference_id   => p_sale_id,
      p_note           => 'Void of sale #' || v_sale.sale_number
    );
  end loop;

  update public.sales
     set status      = 'voided',
         voided_at   = now(),
         voided_by   = v_user,
         void_reason = nullif(trim(coalesce(p_reason,'')), '')
   where id = p_sale_id
  returning * into v_sale;

  return v_sale;
end;
$$;

-- ============================================================================
-- 9. VIEW: v_sale_summary  (list screens, both platforms)
-- ============================================================================

create or replace view public.v_sale_summary
with (security_invoker = true) as
select
  s.id,
  s.business_id,
  s.location_id,
  s.sale_number,
  s.status,
  s.subtotal,
  s.grand_total,
  s.cost_total,
  (s.grand_total - s.cost_total) as gross_profit,
  s.currency_code,
  s.sold_by,
  pr.full_name as sold_by_name,
  s.completed_at,
  s.voided_at,
  (select count(*) from public.sale_items si where si.sale_id = s.id) as item_count,
  (select coalesce(sum(si.quantity), 0) from public.sale_items si where si.sale_id = s.id) as unit_count
from public.sales s
left join public.profiles pr on pr.id = s.sold_by;

-- ============================================================================
-- 10. GRANTS
-- ============================================================================

grant select on public.sales         to authenticated;
grant select on public.sale_items    to authenticated;
grant select on public.sale_payments to authenticated;
grant select on public.v_sale_summary to authenticated;

grant execute on function
  public.complete_sale(uuid, uuid, uuid, jsonb, jsonb, text) to authenticated;
grant execute on function
  public.void_sale(uuid, text) to authenticated;
