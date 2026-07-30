-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0009 — Help, Learning & Insights
--
-- Adds: business_dictionary (seeded content), calculator_history (per user),
--       and the insights engine as READ-ONLY RPCs over existing data.
--
-- HARD CONSTRAINTS:
--   * Additive. No ALTER of existing tables. No shared-view changes.
--   * Insights are DERIVED — no new operational data, no writes to money/stock.
--   * Every insight respects: business timezone, voided exclusion, and the
--     per-base-unit cost invariant (reads snapshots, never recomputes cost).
-- ============================================================================

-- ============================================================================
-- 1. BUSINESS DICTIONARY  (shared reference content, not per-business)
-- ============================================================================

create table public.business_dictionary (
  id           uuid primary key default gen_random_uuid(),
  term         text not null,
  slug         text not null unique,       -- stable key for the ⓘ deep-link
  short_def    text not null,              -- one-line, for the inline ⓘ popover
  full_def     text not null,              -- plain-language explanation
  example      text,                        -- practical example
  related      text[] not null default '{}',-- slugs of related terms
  category     text,                        -- 'money' | 'inventory' | 'sales' | ...
  created_at   timestamptz not null default now()
);

create index business_dictionary_term_trgm_idx
  on public.business_dictionary using gin (term gin_trgm_ops);

-- Readable by any authenticated user; content is universal.
alter table public.business_dictionary enable row level security;
create policy dictionary_select on public.business_dictionary
  for select using (true);

-- ---- Seed content (plain language, no jargon) --------------------------------
insert into public.business_dictionary (term, slug, short_def, full_def, example, related, category) values
('Revenue','revenue',
  'The total money you take in from sales before any costs.',
  'Revenue is all the money customers pay you for what you sell, before you subtract what the goods cost you or any expenses. It is your "top line".',
  'If you sell 100 packs of biscuits at ₦400 each, your revenue is ₦40,000 — even though some of that has to cover what the biscuits cost you.',
  array['gross-profit','net-profit','cogs'],'money'),
('Cost of Goods Sold','cogs',
  'What the items you sold actually cost you to buy.',
  'Cost of Goods Sold (COGS) is the amount you originally paid for exactly the items you sold. It does not include rent or salaries — only the stock itself.',
  'You sold 100 packs that cost you ₦338.64 each. Your COGS is ₦33,864.',
  array['revenue','gross-profit','average-cost'],'money'),
('Gross Profit','gross-profit',
  'What is left after subtracting what your sold goods cost.',
  'Gross profit is revenue minus cost of goods sold. It shows how much you make on the products themselves, before other running costs.',
  'Revenue ₦40,000 − COGS ₦33,864 = ₦6,136 gross profit.',
  array['revenue','cogs','net-profit'],'money'),
('Net Profit','net-profit',
  'What you truly keep after all costs and expenses.',
  'Net profit is gross profit minus all your other expenses — rent, transport, salaries, and so on. It is the real "bottom line" of the business.',
  'Gross profit ₦6,136 − expenses ₦2,000 = ₦4,136 net profit.',
  array['gross-profit','expense'],'money'),
('Cash Flow','cash-flow',
  'The movement of money in and out of your business.',
  'Cash flow is about timing — when money actually arrives and leaves. You can be profitable but still short of cash if money is tied up in stock or owed by customers.',
  'You made a profit this month, but most of it went into buying new stock, so your cash is low.',
  array['cash-drawer','available-cash'],'money'),
('Cash Drawer','cash-drawer',
  'The till where cash sales are kept during a work session.',
  'The cash drawer holds the physical money taken in during a shift. The app tracks what should be in it so you can check against what is actually there.',
  'You start the day with ₦5,000, take ₦20,000 in cash sales, so the drawer should hold ₦25,000.',
  array['shift','float','safe-drop'],'money'),
('Shift','shift',
  'One work session at a till, from open to close.',
  'A shift is a single session of a cashier working the till. The app tracks all cash activity during that session so it can be reconciled at the end.',
  'A cashier opens a shift in the morning and closes it in the evening; only that day''s sales belong to it.',
  array['cash-drawer','float'],'money'),
('Float','float',
  'The starting cash placed in the till at the beginning of a shift.',
  'The float (or opening float) is the money you put in the drawer before trading starts, so you have change for customers. It is counted separately from sales.',
  'You put ₦5,000 of small notes in the drawer to make change — that is your float.',
  array['shift','cash-drawer'],'money'),
('Purchase Order','purchase-order',
  'A formal request to a supplier for stock you want to buy.',
  'A purchase order (PO) lists what you intend to buy, how much, and the expected cost. Creating it does not change your stock — stock only goes up when the goods actually arrive.',
  'You send a PO to your supplier for 10 cartons of biscuits at ₦14,900 each.',
  array['supplier-credit','average-cost'],'inventory'),
('Supplier Credit','supplier-credit',
  'Stock received now but paid for later.',
  'Supplier credit means your supplier lets you take goods now and pay after an agreed period. You owe the money (a payable) even though cash has not left yet.',
  'You receive ₦40,000 of stock on 30-day terms — your stock goes up now, but you owe ₦40,000.',
  array['purchase-order','available-cash'],'money'),
('Inventory Valuation','inventory-valuation',
  'The total worth of the stock you currently hold, at cost.',
  'Inventory valuation is how much your current stock is worth based on what it cost you — quantity on hand multiplied by average cost per unit.',
  '120 packs on hand at ₦338.64 each = ₦40,637 of inventory value.',
  array['average-cost','stock-value','cogs'],'inventory'),
('Average Cost','average-cost',
  'The blended cost of one unit when you bought at different prices.',
  'When you buy the same product at different prices over time, average cost blends them into one per-unit figure, weighted by quantity. It always reflects the cost of a single base unit, not a carton.',
  'Buy 100 at ₦5 then 100 at ₦7 → average cost ₦6 each.',
  array['inventory-valuation','cogs'],'inventory'),
('Expense','expense',
  'Money spent running the business that is not buying stock.',
  'Expenses are the running costs of the business — rent, transport, fuel, electricity, salaries. They reduce profit but are separate from the cost of stock.',
  'Paying ₦2,000 for fuel to deliver goods is an expense.',
  array['net-profit','petty-cash'],'money'),
('Safe Drop','safe-drop',
  'Moving excess cash from the till to a safe — it is not spent.',
  'A safe drop takes surplus cash out of the drawer and puts it in a secure place. The money still belongs to the business; it has only changed location, so it does not affect profit.',
  'You move ₦10,000 from a full till to the office safe for security.',
  array['cash-drawer','petty-cash'],'money'),
('Petty Cash','petty-cash',
  'A small cash fund for minor everyday purchases.',
  'Petty cash is a small amount set aside for small, quick expenses so you do not disturb the main till. Spending from it is recorded as an expense.',
  'Buying tape and cleaning materials for ₦500 from the petty cash fund.',
  array['expense','safe-drop'],'money'),
('Stock Value','stock-value',
  'The worth of stock for one product line, at cost.',
  'Stock value is the current quantity of a product multiplied by its average cost — how much that product line is worth to you right now.',
  '44 pieces at ₦338.64 = ₦14,900 stock value.',
  array['inventory-valuation','average-cost'],'inventory'),
('Available Cash','available-cash',
  'Money you can actually spend right now, after what you owe.',
  'Available cash adds up your cash, bank, safe and petty cash, then subtracts what you owe suppliers. It answers "can I afford my next purchase?" — which is different from profit.',
  'Cash ₦50,000 but you owe suppliers ₦40,000 → available cash ₦10,000.',
  array['cash-flow','supplier-credit','net-profit'],'money');

-- ============================================================================
-- 2. CALCULATOR HISTORY  (per user, private)
-- ============================================================================

create table public.calculator_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null default 'standard',  -- 'standard'|'margin'|'markup'|'discount'|'unit'|'profit'
  expression  text,
  result      text,
  created_at  timestamptz not null default now()
);

create index calculator_history_user_idx on public.calculator_history (user_id, created_at desc);

alter table public.calculator_history enable row level security;
create policy calc_history_own on public.calculator_history
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ============================================================================
-- 3. INSIGHTS ENGINE  (read-only RPC over existing data)
--    Returns a list of plain-language insight objects. No new stored data.
--    Each respects business timezone + voided exclusion + cost invariant.
-- ============================================================================

create or replace function public.business_insights(p_business_id uuid)
returns jsonb
language plpgsql stable
security definer set search_path = public
as $$
declare
  v_tz text;
  v_today   timestamptz;
  v_yest    timestamptz;
  v_wk      timestamptz;
  v_prev_wk timestamptz;
  v_month   timestamptz;
  v_prev_month timestamptz;
  v_insights jsonb := '[]'::jsonb;
  v_can_cost boolean;

  v_today_rev numeric; v_dow_avg numeric;
  v_wk_exp numeric; v_prev_wk_exp numeric;
  r record;
begin
  if not public.is_member_of(p_business_id) then
    raise exception 'Not a member of this business.';
  end if;
  v_can_cost := public.has_role_in(p_business_id, array['owner','manager']::public.member_role[]);

  select timezone into v_tz from public.businesses where id = p_business_id;
  v_today   := (date_trunc('day',   now() at time zone v_tz)) at time zone v_tz;
  v_yest    := v_today - interval '1 day';
  v_wk      := (date_trunc('week',  now() at time zone v_tz)) at time zone v_tz;
  v_prev_wk := v_wk - interval '7 days';
  v_month   := (date_trunc('month', now() at time zone v_tz)) at time zone v_tz;
  v_prev_month := (date_trunc('month', (now() at time zone v_tz) - interval '1 month')) at time zone v_tz;

  -- (a) Today vs same weekday average (last 8 weeks) --------------------------
  select coalesce(sum(grand_total),0) into v_today_rev
    from public.sales
   where business_id = p_business_id and status='completed' and completed_at >= v_today;

  select coalesce(avg(day_rev),0) into v_dow_avg from (
    select sum(grand_total) as day_rev
      from public.sales
     where business_id = p_business_id and status='completed'
       and completed_at >= v_today - interval '56 days'
       and completed_at <  v_today
       and extract(dow from (completed_at at time zone v_tz)) = extract(dow from (v_today at time zone v_tz))
     group by date_trunc('day', completed_at at time zone v_tz)
  ) d;

  if v_dow_avg > 0 and v_today_rev > 0 then
    v_insights := v_insights || jsonb_build_object(
      'type', case when v_today_rev >= v_dow_avg then 'positive' else 'attention' end,
      'category','sales',
      'text', case
        when v_today_rev >= v_dow_avg
        then format('Today''s sales are %s%% above your usual for this weekday.',
                    round((v_today_rev - v_dow_avg)/v_dow_avg*100))
        else format('Today''s sales are %s%% below your usual for this weekday.',
                    round((v_dow_avg - v_today_rev)/v_dow_avg*100))
      end);
  end if;

  -- (b) Weekly expense change --------------------------------------------------
  select coalesce(sum(amount),0) into v_wk_exp
    from public.expenses where business_id=p_business_id and spent_at >= v_wk;
  select coalesce(sum(amount),0) into v_prev_wk_exp
    from public.expenses where business_id=p_business_id
     and spent_at >= v_prev_wk and spent_at < v_wk;

  if v_can_cost and v_prev_wk_exp > 0 and abs(v_wk_exp - v_prev_wk_exp)/v_prev_wk_exp >= 0.15 then
    v_insights := v_insights || jsonb_build_object(
      'type', case when v_wk_exp > v_prev_wk_exp then 'attention' else 'positive' end,
      'category','expenses',
      'text', format('Expenses are %s%% %s than last week.',
                     round(abs(v_wk_exp - v_prev_wk_exp)/v_prev_wk_exp*100),
                     case when v_wk_exp > v_prev_wk_exp then 'higher' else 'lower' end));
  end if;

  -- (c) Per-product margin drop (owner/manager only) ---------------------------
  if v_can_cost then
    for r in
      select p.name,
             sum(case when s.completed_at >= v_wk then si.line_total else 0 end) as rev_now,
             sum(case when s.completed_at >= v_wk then si.line_cost  else 0 end) as cost_now,
             sum(case when s.completed_at >= v_prev_wk and s.completed_at < v_wk then si.line_total else 0 end) as rev_prev,
             sum(case when s.completed_at >= v_prev_wk and s.completed_at < v_wk then si.line_cost  else 0 end) as cost_prev
        from public.sale_items si
        join public.sales s on s.id=si.sale_id and s.status='completed'
        join public.product_variants v on v.id=si.variant_id
        join public.products p on p.id=v.product_id
       where si.business_id=p_business_id
         and s.completed_at >= v_prev_wk
       group by p.id, p.name
      having sum(case when s.completed_at >= v_wk then si.line_total else 0 end) > 0
         and sum(case when s.completed_at >= v_prev_wk and s.completed_at < v_wk then si.line_total else 0 end) > 0
    loop
      if (r.rev_now - r.cost_now)/nullif(r.rev_now,0)
         < (r.rev_prev - r.cost_prev)/nullif(r.rev_prev,0) - 0.05 then
        v_insights := v_insights || jsonb_build_object(
          'type','attention','category','margin',
          'text', format('Your margin on %s has fallen this week — likely a higher supplier cost.', r.name));
      end if;
    end loop;
  end if;

  -- (d) Stock runway: products low relative to recent sales velocity -----------
  for r in
    select vs.product_name, vs.qty_on_hand,
           coalesce((
             select sum(si.quantity)/30.0
               from public.sale_items si
               join public.sales s on s.id=si.sale_id and s.status='completed'
              where si.variant_id = vs.variant_id
                and s.completed_at >= v_today - interval '30 days'
           ),0) as daily_velocity
      from public.v_variant_stock vs
     where vs.business_id=p_business_id and vs.is_active
       and vs.stock_status in ('low','out_of_stock')
    limit 3
  loop
    if r.daily_velocity > 0 then
      v_insights := v_insights || jsonb_build_object(
        'type','attention','category','stock',
        'text', format('%s will last about %s days at your recent selling rate.',
                       r.product_name, greatest(round(r.qty_on_hand / r.daily_velocity), 0)));
    end if;
  end loop;

  -- (e) Cash sufficiency for restock (owner/manager) ---------------------------
  if v_can_cost then
    declare
      v_avail numeric := public.account_balance(p_business_id,'cash')
                       + public.account_balance(p_business_id,'bank')
                       + public.account_balance(p_business_id,'safe')
                       + public.account_balance(p_business_id,'petty_cash')
                       - public.account_balance(p_business_id,'supplier_payable');
      v_low_count int;
    begin
      select count(*) into v_low_count from public.v_variant_stock
       where business_id=p_business_id and is_active and stock_status in ('low','out_of_stock');
      if v_low_count > 0 and v_avail > 0 then
        v_insights := v_insights || jsonb_build_object(
          'type','positive','category','cash',
          'text', format('You have %s item(s) to restock and cash available to cover a purchase.', v_low_count));
      end if;
    end;
  end if;

  return v_insights;
end;
$$;

-- ============================================================================
-- 4. GRANTS
-- ============================================================================

grant select on public.business_dictionary to authenticated;
grant execute on function public.business_insights(uuid) to authenticated;
