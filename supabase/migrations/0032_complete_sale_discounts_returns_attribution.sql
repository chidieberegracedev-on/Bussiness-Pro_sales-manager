-- ============================================================================
-- 0032 — complete_sale: line discounts, returns, customers, and the operator
--
-- STATUS: NOT APPLIED. For architect review.
--
-- This is the ONE function every sale in the system goes through, so it is
-- deliberately not applied on my own judgement. It is written as a proposal
-- with each invariant it must preserve stated next to the code that preserves
-- it. The four capabilities below are the last thing blocking 12B slice 2b
-- (returns + customers) and the allow_line_discount switch, all of which have
-- their tables and columns already (0030) and nothing that can write them.
--
-- WHAT CHANGES
--   1. optional per-line discount            → sale_items.discount_amount
--   2. returns as negative quantities        → sales.is_return / parent_sale_id
--   3. optional customer                     → sales.customer_id
--   4. operator attribution                  → sales.sold_by = business_members
--
-- WHAT DOES NOT CHANGE, and must not
--   * The PRICE is still read server-side from product_variants.selling_price.
--     The client may propose a DISCOUNT; it may never propose a price. This is
--     the whole reason the RPC exists.
--   * Idempotency by p_sale_id: a retry returns the existing sale untouched.
--     A till that times out mid-charge must not double-charge.
--   * Cost comes from the stock movement's converted per-base unit_cost, never
--     recomputed from products.
--   * Stock still moves only through record_stock_movement.
--   * Money still moves only through emit_financial_event.
--   * A failure raises BEFORE anything is recorded, never after — a write
--     followed by `raise` in the same transaction is rolled back, so "record
--     then raise" silently loses the record.
--
-- OPEN FOR THE ARCHITECT
--   (a) sold_by now holds a business_members id, but the column still has
--       `references public.profiles(id)`. Section 1 retargets the FK. Every
--       existing row holds an auth user id, so the migration BACKFILLS them to
--       the matching member row rather than leaving dangling references —
--       and any row with no matching member is set to null instead of being
--       silently pointed at the wrong person.
--   (b) Section 5 changes v_sale_summary's join accordingly. Confirm nothing
--       else (the Android client especially) reads sold_by expecting a user id.
-- ============================================================================

-- ============================================================================
-- 1. sales.sold_by BECOMES AN OPERATOR, NOT AN ACCOUNT
--
--    complete_sale wrote auth.uid() — the BUSINESS account the till is signed
--    in as, not the cashier who rang the sale. Every sale in a shop therefore
--    reads as the owner's, and per-employee sales figures are one bucket.
--    activity_events.initiated_by already models the real operator; sold_by
--    now matches it.
-- ============================================================================

-- Backfill BEFORE retargeting the constraint, or the new FK cannot validate.
-- A user with several member rows in one business cannot happen: there is a
-- unique index on (business_id, user_id).
update public.sales s
   set sold_by = m.id
  from public.business_members m
 where m.user_id = s.sold_by
   and m.business_id = s.business_id
   and s.sold_by is not null;

-- Anything still pointing at a profile has no member row in that business —
-- a removed employee, or a legacy row. Null is honest; a wrong name is not.
update public.sales
   set sold_by = null
 where sold_by is not null
   and not exists (select 1 from public.business_members m where m.id = sold_by);

alter table public.sales drop constraint if exists sales_sold_by_fkey;
alter table public.sales
  add constraint sales_sold_by_fkey
  foreign key (sold_by) references public.business_members(id) on delete set null;

comment on column public.sales.sold_by is
  'The OPERATOR who rang the sale (business_members.id), resolved server-side. Not the account the device is signed in as.';

-- voided_by is the same mistake in the same table.
update public.sales s
   set voided_by = m.id
  from public.business_members m
 where m.user_id = s.voided_by
   and m.business_id = s.business_id
   and s.voided_by is not null;
update public.sales
   set voided_by = null
 where voided_by is not null
   and not exists (select 1 from public.business_members m where m.id = voided_by);
alter table public.sales drop constraint if exists sales_voided_by_fkey;
alter table public.sales
  add constraint sales_voided_by_fkey
  foreign key (voided_by) references public.business_members(id) on delete set null;

-- ============================================================================
-- 2. HOW MUCH OF A LINE HAS ALREADY COME BACK
--
--    Returns must be blocked past the original quantity, and partial returns
--    across several visits have to accumulate. Derived, never stored: a
--    "returned_quantity" column on sale_items would be a second source of
--    truth that drifts the moment one write in a pair fails.
-- ============================================================================
create or replace function public.returned_quantity(
  p_sale_id    uuid,
  p_variant_id uuid
)
returns numeric
language sql stable
security definer set search_path = public
as $$
  select coalesce(sum(-si.quantity), 0)
    from public.sales r
    join public.sale_items si on si.sale_id = r.id
   where r.parent_sale_id = p_sale_id
     and r.status = 'completed'
     and si.variant_id = p_variant_id;
$$;

comment on function public.returned_quantity(uuid, uuid) is
  'Units of one variant already returned against one original sale, across every return visit. A voided return does not count.';

-- ============================================================================
-- 3. complete_sale, EXTENDED
--
--    New arguments are all defaulted, so every existing call site keeps
--    working unchanged and this can be applied before the client ships.
-- ============================================================================
create or replace function public.complete_sale(
  p_sale_id     uuid,
  p_business_id uuid,
  p_location_id uuid,
  p_items       jsonb,
  p_payments    jsonb default '[]'::jsonb,
  p_note        text  default null,
  p_shift_id    uuid  default null,
  -- NEW. A return reverses the sale named here.
  p_parent_sale_id uuid default null,
  p_customer_id    uuid default null
)
returns public.sales
language plpgsql
security definer set search_path = public
as $$
declare
  v_user     uuid := (select auth.uid());
  v_member   uuid;
  v_existing public.sales;
  v_sale     public.sales;
  v_number   bigint;
  v_currency char(3);
  v_item     jsonb;
  v_payment  jsonb;
  v_variant  record;
  v_qty      numeric(14,3);
  v_discount numeric(18,4);
  v_movement public.stock_movements;
  v_line_total numeric(18,4);
  v_line_cost  numeric(18,4);
  v_subtotal   numeric(18,4) := 0;
  v_discount_total numeric(18,4) := 0;
  v_cost_total numeric(18,4) := 0;
  v_method     text;
  v_amount     numeric(18,4);
  v_bank       uuid;
  v_is_return  boolean := p_parent_sale_id is not null;
  v_movement_type public.stock_movement_type;
  v_original   record;
  v_already    numeric(14,3);
  v_limit      numeric(18,4);
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if not public.has_role_in(p_business_id,
       array['owner','manager','cashier']::public.member_role[]) then
    raise exception 'Insufficient permission to complete a sale.';
  end if;

  -- The operator. In multi-operator mode the PIN session names them; in
  -- single-owner mode the account holder IS the operator, so their own member
  -- row is the right answer rather than a null.
  select id into v_member
    from public.business_members
   where business_id = p_business_id and user_id = v_user
   limit 1;

  select * into v_existing from public.sales where id = p_sale_id;
  if found then return v_existing; end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A sale must contain at least one item.';
  end if;
  if not exists (select 1 from public.locations
                  where id = p_location_id and business_id = p_business_id) then
    raise exception 'Location does not belong to this business.';
  end if;
  if p_customer_id is not null
     and not exists (select 1 from public.customers
                      where id = p_customer_id and business_id = p_business_id) then
    raise exception 'Customer does not belong to this business.';
  end if;

  -- ---- RETURN PRECONDITIONS --------------------------------------------
  -- Every one of these raises before a single row is written. Validating
  -- halfway through would leave the caller believing a partial return
  -- succeeded, since the raise rolls the earlier writes back invisibly.
  if v_is_return then
    select * into v_original from public.sales
     where id = p_parent_sale_id and business_id = p_business_id;
    if not found then
      raise exception 'The sale being returned was not found in this business.';
    end if;
    if v_original.status <> 'completed' then
      raise exception 'Only a completed sale can be returned.';
    end if;
    if v_original.is_return then
      raise exception 'A return cannot itself be returned.';
    end if;
    if not public.has_role_in(p_business_id,
         array['owner','manager']::public.member_role[])
       and not exists (
         select 1 from public.permission_limits pl
          where pl.business_id = p_business_id
            and pl.action = 'refund'
            and pl.allowed
            and pl.role = (select role from public.business_members
                            where id = v_member)) then
      raise exception 'This role may not process a refund without approval.';
    end if;
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
    currency_code, sold_by, note, parent_sale_id, is_return, customer_id
  ) values (
    p_sale_id, p_business_id, p_location_id, v_number, 'completed',
    0,0,0,0,0, v_currency, v_member, nullif(trim(coalesce(p_note,'')),''),
    p_parent_sale_id, v_is_return, p_customer_id
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

    -- ---- RETURN QUANTITY CEILING ---------------------------------------
    -- Cumulative across visits, so three separate one-unit returns against a
    -- two-unit line is refused on the third and not on the first.
    if v_is_return then
      select coalesce(sum(si.quantity), 0) into v_limit
        from public.sale_items si
       where si.sale_id = p_parent_sale_id and si.variant_id = v_variant.id;
      if v_limit = 0 then
        raise exception 'That item was not on the sale being returned.';
      end if;
      v_already := public.returned_quantity(p_parent_sale_id, v_variant.id);
      if v_already + v_qty > v_limit then
        raise exception
          'Only % of that item remain returnable (% sold, % already returned).',
          v_limit - v_already, v_limit, v_already;
      end if;
    end if;

    -- ---- DISCOUNT --------------------------------------------------------
    -- Proposed by the client, bounded here. The unit price is still read from
    -- the variant: the client never gets to name a price, only to ask for an
    -- amount off one. A discount on a return is meaningless — the refund is
    -- whatever was actually charged — so it is ignored rather than applied.
    v_discount := coalesce((v_item ->> 'discount')::numeric, 0);
    if v_is_return then
      v_discount := 0;
    elsif v_discount < 0 then
      raise exception 'A discount cannot be negative.';
    elsif v_discount > round(v_qty * v_variant.selling_price, 4) then
      raise exception 'A discount cannot exceed the line total.';
    end if;

    -- Stock goes out on a sale and back in on a return, through the movement
    -- type that already exists for exactly this.
    v_movement_type := case when v_is_return then 'sale_reversal' else 'sale' end;
    v_movement := public.record_stock_movement(
      p_movement_id    => (v_item ->> 'movement_id')::uuid,
      p_variant_id     => v_variant.id,
      p_location_id    => p_location_id,
      p_movement_type  => v_movement_type,
      p_quantity       => case when v_is_return then v_qty else -v_qty end,
      p_reference_type => 'sale',
      p_reference_id   => p_sale_id
    );

    v_line_total := round(v_qty * v_variant.selling_price, 4) - v_discount;
    v_line_cost  := round(v_qty * v_movement.unit_cost, 4);

    -- A return's LINES are stored negative, so v_sale_summary, the reports and
    -- every existing sum net returns off revenue with no special case at all.
    insert into public.sale_items (
      sale_id, business_id, variant_id, product_name, variant_name, sku,
      quantity, unit_price, unit_cost, discount_amount, line_total, line_cost
    ) values (
      p_sale_id, p_business_id, v_variant.id,
      v_variant.product_name, v_variant.variant_name, v_variant.sku,
      case when v_is_return then -v_qty else v_qty end,
      v_variant.selling_price, v_movement.unit_cost, v_discount,
      case when v_is_return then -v_line_total else v_line_total end,
      case when v_is_return then -v_line_cost else v_line_cost end
    );

    if v_is_return then
      v_subtotal   := v_subtotal - v_line_total;
      v_cost_total := v_cost_total - v_line_cost;
    else
      v_subtotal   := v_subtotal + v_line_total;
      v_cost_total := v_cost_total + v_line_cost;
      v_discount_total := v_discount_total + v_discount;
    end if;
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

  -- grand_total is what actually changed hands: subtotal is already net of
  -- discount, so adding discount_total here would double-count it.
  update public.sales
     set subtotal = v_subtotal,
         discount_total = v_discount_total,
         grand_total = v_subtotal,
         cost_total = v_cost_total
   where id = p_sale_id
  returning * into v_sale;

  -- ---- FINANCIAL EVENTS --------------------------------------------------
  -- emit_financial_event takes a non-negative amount and a direction, so a
  -- return is the same event with the direction reversed — not a negative
  -- amount, which the check constraint would reject anyway.
  if v_subtotal <> 0 then
    perform public.emit_financial_event(
      p_business_id, 'sale_revenue', 'revenue',
      case when v_is_return then 'debit' else 'credit' end,
      abs(v_subtotal), v_currency,
      'sale', p_sale_id, p_shift_id, null, null, v_user,
      case when v_is_return then 'Refunded revenue' else 'Sale revenue' end);
  end if;
  if v_cost_total <> 0 then
    perform public.emit_financial_event(
      p_business_id, 'sale_cogs', 'cogs',
      case when v_is_return then 'credit' else 'debit' end,
      abs(v_cost_total), v_currency,
      'sale', p_sale_id, p_shift_id, null, null, v_user,
      case when v_is_return then 'Cost of returned goods' else 'Cost of goods sold' end);
  end if;

  select id into v_bank from public.bank_accounts
   where business_id = p_business_id and is_default limit 1;

  for v_payment in select * from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb))
  loop
    v_method := coalesce(v_payment ->> 'method','other');
    v_amount := coalesce((v_payment ->> 'amount')::numeric, 0);
    if v_amount > 0 then
      if v_method = 'cash' then
        perform public.emit_financial_event(
          p_business_id, 'cash_in', 'cash',
          case when v_is_return then 'debit' else 'credit' end,
          v_amount, v_currency,
          'sale', p_sale_id, p_shift_id, null, null, v_user,
          case when v_is_return then 'Cash refund' else 'Cash sale' end);
      else
        perform public.emit_financial_event(
          p_business_id, 'bank_in', 'bank',
          case when v_is_return then 'debit' else 'credit' end,
          v_amount, v_currency,
          'sale', p_sale_id, p_shift_id, null, v_bank, v_user,
          case when v_is_return then 'Non-cash refund' else 'Non-cash sale' end);
      end if;
    end if;
  end loop;

  -- ---- THE AUDIT TRAIL ---------------------------------------------------
  -- sale_completed was named in 0012's comment but nothing ever emitted it, so
  -- the activity log has a hole exactly where the money is. Emitting it here
  -- means attribution has one home rather than being derived from whichever
  -- shift happened to be open.
  insert into public.activity_events (
    business_id, action_type, severity, initiated_by, shift_id,
    reference_type, reference_id, detail
  ) values (
    p_business_id,
    case when v_is_return then 'sale_returned' else 'sale_completed' end,
    case when v_is_return then 'notice' else 'info' end,
    v_member, p_shift_id, 'sale', p_sale_id,
    jsonb_build_object(
      'sale_number', v_number,
      'total', v_subtotal,
      'discount_total', v_discount_total,
      'parent_sale_id', p_parent_sale_id)
  );

  return v_sale;
end;
$$;

-- ============================================================================
-- 4. GRANTS
--    The old 7-argument signature is dropped so two versions cannot coexist —
--    PostgREST would otherwise have to guess which overload a call meant.
-- ============================================================================
drop function if exists public.complete_sale(uuid, uuid, uuid, jsonb, jsonb, text, uuid);
grant execute on function
  public.complete_sale(uuid, uuid, uuid, jsonb, jsonb, text, uuid, uuid, uuid)
  to authenticated;
grant execute on function public.returned_quantity(uuid, uuid) to authenticated;

-- ============================================================================
-- 5. v_sale_summary FOLLOWS sold_by
--
--    It joined profiles to name the seller. sold_by is a member now, so the
--    join moves — and the name prefers the member's display_name, which is what
--    the PIN pad shows and therefore what the operator answers to.
--
--    The EXISTING columns keep their exact names, types and ORDER. `create or
--    replace view` cannot insert a column in the middle — it fails outright —
--    and 0004 records that the Android client reads this view, so new columns
--    are appended at the end where nothing positional can break.
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
  coalesce(m.display_name, pr.full_name) as sold_by_name,
  s.completed_at,
  s.voided_at,
  (select count(*) from public.sale_items si where si.sale_id = s.id) as item_count,
  (select coalesce(sum(si.quantity), 0) from public.sale_items si where si.sale_id = s.id) as unit_count,
  -- Appended by 0032.
  s.discount_total,
  s.is_return,
  s.parent_sale_id,
  s.customer_id,
  c.name as customer_name
from public.sales s
left join public.business_members m on m.id = s.sold_by
left join public.profiles pr on pr.id = m.user_id
left join public.customers c on c.id = s.customer_id;

grant select on public.v_sale_summary to authenticated;
