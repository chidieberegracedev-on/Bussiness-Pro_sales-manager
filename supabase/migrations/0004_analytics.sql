-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0004 — Analytics & Reporting (READ-ONLY, ADDITIVE-ONLY)
--
-- Creates read-only views and parameterized RPCs for the dashboard, sales
-- reports, product performance, and current-state inventory intelligence.
--
-- HARD CONSTRAINTS (enforced by discipline; reviewer must verify):
--   * No new tables.
--   * No ALTER of any existing table.
--   * Does NOT modify v_variant_stock or v_sale_summary (Android reads them).
--   * Every aggregate filters status = 'completed' (voided excluded).
--   * Every date bucket uses the business timezone, never UTC.
--   * Cost/profit come from existing snapshots; never recomputed from products.
--   * All views are security_invoker so RLS isolates by business.
-- ============================================================================

-- ============================================================================
-- 1. HELPER: business-local "now" and day boundaries
--    Centralizes the timezone rule so no query reinvents it (and gets it wrong).
-- ============================================================================

-- Start of "today" for a business, returned as a UTC timestamptz suitable for
-- direct comparison against completed_at.
create or replace function public.business_day_start(
  p_business_id uuid,
  p_days_offset int default 0
)
returns timestamptz
language sql stable
security definer set search_path = public
as $$
  select (
    date_trunc(
      'day',
      (now() at time zone (select timezone from public.businesses where id = p_business_id))
    ) + make_interval(days => p_days_offset)
  ) at time zone (select timezone from public.businesses where id = p_business_id);
$$;

-- Start of the current ISO week (Monday) in business time.
create or replace function public.business_week_start(p_business_id uuid)
returns timestamptz
language sql stable
security definer set search_path = public
as $$
  select (
    date_trunc(
      'week',
      (now() at time zone (select timezone from public.businesses where id = p_business_id))
    )
  ) at time zone (select timezone from public.businesses where id = p_business_id);
$$;

-- Start of the current month in business time.
create or replace function public.business_month_start(p_business_id uuid)
returns timestamptz
language sql stable
security definer set search_path = public
as $$
  select (
    date_trunc(
      'month',
      (now() at time zone (select timezone from public.businesses where id = p_business_id))
    )
  ) at time zone (select timezone from public.businesses where id = p_business_id);
$$;

-- ============================================================================
-- 2. RPC: dashboard_summary
--    One call returns the headline KPIs for today / week / month plus deltas.
--    All money as text (NUMERIC) to preserve exact decimal on the client.
-- ============================================================================

create or replace function public.dashboard_summary(p_business_id uuid)
returns jsonb
language plpgsql stable
security definer set search_path = public
as $$
declare
  v_today_start     timestamptz := public.business_day_start(p_business_id, 0);
  v_yesterday_start timestamptz := public.business_day_start(p_business_id, -1);
  v_week_start      timestamptz := public.business_week_start(p_business_id);
  v_month_start     timestamptz := public.business_month_start(p_business_id);
  v_result jsonb;
begin
  if not public.is_member_of(p_business_id) then
    raise exception 'Not a member of this business.';
  end if;

  with completed as (
    select * from public.sales
     where business_id = p_business_id
       and status = 'completed'
  ),
  today as (
    select coalesce(sum(grand_total),0) rev, coalesce(sum(cost_total),0) cost, count(*) n
      from completed where completed_at >= v_today_start
  ),
  yest as (
    select coalesce(sum(grand_total),0) rev, count(*) n
      from completed
     where completed_at >= v_yesterday_start and completed_at < v_today_start
  ),
  wk as (
    select coalesce(sum(grand_total),0) rev, coalesce(sum(cost_total),0) cost, count(*) n
      from completed where completed_at >= v_week_start
  ),
  mo as (
    select coalesce(sum(grand_total),0) rev, coalesce(sum(cost_total),0) cost, count(*) n
      from completed where completed_at >= v_month_start
  )
  select jsonb_build_object(
    'today', jsonb_build_object(
      'revenue',      (select rev::text from today),
      'cost',         (select cost::text from today),
      'gross_profit', (select (rev - cost)::text from today),
      'transactions', (select n from today),
      'avg_transaction', (select case when n > 0 then round(rev / n, 4)::text else '0' end from today)
    ),
    'yesterday', jsonb_build_object(
      'revenue',      (select rev::text from yest),
      'transactions', (select n from yest)
    ),
    'week', jsonb_build_object(
      'revenue',      (select rev::text from wk),
      'gross_profit', (select (rev - cost)::text from wk),
      'transactions', (select n from wk)
    ),
    'month', jsonb_build_object(
      'revenue',      (select rev::text from mo),
      'gross_profit', (select (rev - cost)::text from mo),
      'transactions', (select n from mo)
    ),
    'currency_code', (select currency_code from public.businesses where id = p_business_id)
  ) into v_result;

  return v_result;
end;
$$;

-- ============================================================================
-- 3. RPC: sales_report
--    Aggregates over an explicit from/to range in business time.
--    Range is caller-supplied so custom ranges and presets share one path.
-- ============================================================================

create or replace function public.sales_report(
  p_business_id uuid,
  p_from        timestamptz,
  p_to          timestamptz
)
returns jsonb
language plpgsql stable
security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_member_of(p_business_id) then
    raise exception 'Not a member of this business.';
  end if;

  with completed as (
    select * from public.sales
     where business_id = p_business_id
       and status = 'completed'
       and completed_at >= p_from
       and completed_at <  p_to
  ),
  totals as (
    select
      coalesce(sum(grand_total),0) rev,
      coalesce(sum(cost_total),0)  cost,
      count(*) n
    from completed
  ),
  units as (
    select coalesce(sum(si.quantity),0) q
      from public.sale_items si
      join completed c on c.id = si.sale_id
  ),
  pay as (
    select sp.method, coalesce(sum(sp.amount),0) amt, count(*) n
      from public.sale_payments sp
      join completed c on c.id = sp.sale_id
     group by sp.method
  )
  select jsonb_build_object(
    'total_revenue',   (select rev::text from totals),
    'total_cost',      (select cost::text from totals),
    'gross_profit',    (select (rev - cost)::text from totals),
    'transaction_count', (select n from totals),
    'units_sold',      (select q::text from units),
    'avg_transaction', (select case when n > 0 then round(rev / n, 4)::text else '0' end from totals),
    'payment_breakdown', coalesce((
      select jsonb_agg(jsonb_build_object(
        'method', method, 'amount', amt::text, 'count', n
      ) order by amt desc) from pay
    ), '[]'::jsonb),
    'currency_code', (select currency_code from public.businesses where id = p_business_id)
  ) into v_result;

  return v_result;
end;
$$;

-- ============================================================================
-- 4. RPC: sales_timeseries
--    A revenue/profit series bucketed by day (or hour) in business time,
--    for the dashboard trend chart and report charts.
-- ============================================================================

create or replace function public.sales_timeseries(
  p_business_id uuid,
  p_from        timestamptz,
  p_to          timestamptz,
  p_bucket      text default 'day'   -- 'day' | 'hour'
)
returns table (
  bucket_start timestamptz,
  revenue      text,
  cost         text,
  transactions bigint
)
language plpgsql stable
security definer set search_path = public
as $$
declare
  v_tz text;
begin
  if not public.is_member_of(p_business_id) then
    raise exception 'Not a member of this business.';
  end if;
  if p_bucket not in ('day','hour') then
    raise exception 'Bucket must be day or hour.';
  end if;

  select timezone into v_tz from public.businesses where id = p_business_id;

  return query
  select
    (date_trunc(p_bucket, (s.completed_at at time zone v_tz)) at time zone v_tz) as bucket_start,
    sum(s.grand_total)::text,
    sum(s.cost_total)::text,
    count(*)
  from public.sales s
  where s.business_id = p_business_id
    and s.status = 'completed'
    and s.completed_at >= p_from
    and s.completed_at <  p_to
  group by 1
  order by 1;
end;
$$;

-- ============================================================================
-- 5. RPC: product_performance
--    Ranks products over a range. Aggregates sale_items back to the product
--    via variant -> product. Includes zero-activity products via LEFT JOIN.
--    Cost/profit columns are gated: only owner/manager receive them.
-- ============================================================================

create or replace function public.product_performance(
  p_business_id uuid,
  p_from        timestamptz,
  p_to          timestamptz
)
returns table (
  product_id     uuid,
  product_name   text,
  units_sold     text,
  revenue        text,
  cost           text,
  gross_profit   text,
  last_sold_at   timestamptz
)
language plpgsql stable
security definer set search_path = public
as $$
declare
  v_can_see_cost boolean;
begin
  if not public.is_member_of(p_business_id) then
    raise exception 'Not a member of this business.';
  end if;

  v_can_see_cost := public.has_role_in(
    p_business_id, array['owner','manager']::public.member_role[]);

  return query
  select
    p.id,
    p.name,
    coalesce(sum(si.quantity), 0)::text,
    coalesce(sum(si.line_total), 0)::text,
    case when v_can_see_cost then coalesce(sum(si.line_cost), 0)::text else null end,
    case when v_can_see_cost
         then coalesce(sum(si.line_total) - sum(si.line_cost), 0)::text else null end,
    max(s.completed_at)
  from public.products p
  left join public.product_variants v on v.product_id = p.id
  left join public.sale_items si on si.variant_id = v.id
  left join public.sales s
    on s.id = si.sale_id
   and s.status = 'completed'
   and s.completed_at >= p_from
   and s.completed_at <  p_to
  where p.business_id = p_business_id
  group by p.id, p.name
  order by coalesce(sum(si.line_total), 0) desc;
end;
$$;

-- ============================================================================
-- 6. VIEW: v_inventory_value
--    Current-state inventory value per business, from existing cached levels.
--    No history, no trends (deferred). security_invoker keeps RLS active.
-- ============================================================================

create or replace view public.v_inventory_value
with (security_invoker = true) as
select
  il.business_id,
  count(distinct il.variant_id)                          as variant_count,
  coalesce(sum(il.qty_on_hand), 0)                       as total_units,
  coalesce(sum(il.qty_on_hand * il.avg_cost), 0)         as total_cost_value,
  coalesce(sum(
    case when il.qty_on_hand < 0 then 1 else 0 end), 0)  as negative_variant_count
from public.inventory_levels il
group by il.business_id;

-- ============================================================================
-- 7. VIEW: v_inventory_value_by_category
--    Inventory value split by category for the composition breakdown.
-- ============================================================================

create or replace view public.v_inventory_value_by_category
with (security_invoker = true) as
select
  p.business_id,
  p.category_id,
  c.name                                          as category_name,
  count(distinct v.id)                            as variant_count,
  coalesce(sum(il.qty_on_hand), 0)                as total_units,
  coalesce(sum(il.qty_on_hand * il.avg_cost), 0)  as total_cost_value
from public.products p
join public.product_variants v on v.product_id = p.id
left join public.inventory_levels il on il.variant_id = v.id
left join public.product_categories c on c.id = p.category_id
group by p.business_id, p.category_id, c.name;

-- ============================================================================
-- 8. INDEX SUPPORT
--    Confirm the aggregates have index support. These are idempotent.
-- ============================================================================

create index if not exists sales_business_completed_status_idx
  on public.sales (business_id, completed_at, status);

-- sale_items(sale_id) and sale_items(variant_id) already exist from 0003.

-- ============================================================================
-- 9. GRANTS
-- ============================================================================

grant select on public.v_inventory_value              to authenticated;
grant select on public.v_inventory_value_by_category  to authenticated;

grant execute on function public.dashboard_summary(uuid)                          to authenticated;
grant execute on function public.sales_report(uuid, timestamptz, timestamptz)     to authenticated;
grant execute on function public.sales_timeseries(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.product_performance(uuid, timestamptz, timestamptz)    to authenticated;
grant execute on function public.business_day_start(uuid, int)   to authenticated;
grant execute on function public.business_week_start(uuid)       to authenticated;
grant execute on function public.business_month_start(uuid)      to authenticated;
