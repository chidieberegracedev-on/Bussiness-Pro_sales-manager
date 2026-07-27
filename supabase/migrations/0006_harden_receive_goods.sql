-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0006 — Harden receive_goods against empty-string input
--
-- Root cause of the "couldn't record receipt" failure:
--   receive_goods cast JSON fields directly, e.g.
--     (v_item ->> 'discrepancy_reason')::public.receipt_discrepancy
--   When the client sends an EMPTY STRING for a line with no discrepancy,
--   ''::receipt_discrepancy raises "invalid input value for enum" BEFORE the
--   surrounding coalesce can supply a default. The same trap applies to the
--   numeric and uuid casts (''::numeric and ''::uuid both throw).
--
-- Fix: wrap every optional cast in nullif(x, '') so an empty string becomes
--   NULL and coalesce handles it. movement_id falls back to a generated UUID
--   so a missing id cannot crash the receipt (receipt-level idempotency on
--   p_receipt_id still prevents double processing).
--
-- Additive: replaces the function body only. No table or type changes.
-- Conversion math (cost ÷ conversion before the ledger) is UNCHANGED.
-- ============================================================================

create or replace function public.receive_goods(
  p_receipt_id  uuid,
  p_po_id       uuid,
  p_items       jsonb,
  p_note        text default null
)
returns public.goods_receipts
language plpgsql
security definer set search_path = public
as $$
declare
  v_user     uuid := (select auth.uid());
  v_existing public.goods_receipts;
  v_po       public.purchase_orders;
  v_receipt  public.goods_receipts;
  v_item     jsonb;
  v_poi      public.purchase_order_items;
  v_qty_good_base   numeric(14,3);
  v_unit_cost_base  numeric(18,4);
  v_good_purchase   numeric(14,3);
  v_cost_purchase   numeric(18,4);
  v_reason          public.receipt_discrepancy;
  v_movement_id     uuid;
  v_outstanding     int;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;

  select * into v_po from public.purchase_orders where id = p_po_id;
  if not found then raise exception 'Purchase order not found.'; end if;

  if not public.has_role_in(v_po.business_id,
       array['owner','manager','cashier']::public.member_role[]) then
    raise exception 'Insufficient permission to receive goods.';
  end if;

  if v_po.status in ('cancelled','completed') then
    raise exception 'Cannot receive against a % purchase order.', v_po.status;
  end if;

  -- Receipt-level idempotency.
  select * into v_existing from public.goods_receipts where id = p_receipt_id;
  if found then return v_existing; end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A receipt must contain at least one line.';
  end if;

  insert into public.goods_receipts (
    id, po_id, business_id, location_id, received_by, note
  ) values (
    p_receipt_id, p_po_id, v_po.business_id, v_po.location_id, v_user,
    nullif(trim(coalesce(p_note,'')),'')
  )
  returning * into v_receipt;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- po_item_id is required; an empty/invalid value fails the lookup clearly.
    select * into v_poi from public.purchase_order_items
     where id = nullif(v_item ->> 'po_item_id','')::uuid and po_id = p_po_id;
    if not found then
      raise exception 'PO item % is not on this order.', coalesce(v_item ->> 'po_item_id','(missing)');
    end if;

    -- All optional fields: nullif('') -> NULL -> coalesce default. No raw cast.
    v_good_purchase := coalesce(nullif(v_item ->> 'qty_good_purchase','')::numeric, 0);
    v_cost_purchase := coalesce(nullif(v_item ->> 'unit_cost_purchase','')::numeric, 0);
    v_reason        := coalesce(nullif(v_item ->> 'discrepancy_reason','')::public.receipt_discrepancy, 'none');
    v_movement_id   := coalesce(nullif(v_item ->> 'movement_id','')::uuid, gen_random_uuid());

    -- CONVERSION (unchanged): good qty and cost move to base units here, once,
    -- before anything touches the ledger.
    v_qty_good_base  := round(v_good_purchase * v_poi.conversion_to_base, 3);
    v_unit_cost_base := case
      when v_poi.conversion_to_base > 0
      then round(v_cost_purchase / v_poi.conversion_to_base, 4)
      else 0 end;

    insert into public.goods_receipt_items (
      receipt_id, po_item_id, business_id, variant_id,
      qty_received_purchase, qty_good_base, qty_damaged_base, qty_discrepancy_base,
      discrepancy_reason, unit_cost_purchase, unit_cost_base, note
    ) values (
      p_receipt_id, v_poi.id, v_po.business_id, v_poi.variant_id,
      coalesce(nullif(v_item ->> 'qty_received_purchase','')::numeric, 0),
      v_qty_good_base,
      coalesce(nullif(v_item ->> 'qty_damaged_base','')::numeric, 0),
      coalesce(nullif(v_item ->> 'qty_discrepancy_base','')::numeric, 0),
      v_reason,
      v_cost_purchase,
      v_unit_cost_base,
      nullif(trim(coalesce(v_item ->> 'note','')),'')
    );

    -- Only usable stock enters inventory, at the CONVERTED per-base cost.
    if v_qty_good_base > 0 then
      perform public.record_stock_movement(
        p_movement_id     => v_movement_id,
        p_variant_id      => v_poi.variant_id,
        p_location_id     => v_po.location_id,
        p_movement_type   => 'restock',
        p_quantity        => v_qty_good_base,
        p_unit_cost       => v_unit_cost_base,
        p_purchase_unit_qty => v_good_purchase,
        p_purchase_unit   => v_poi.purchase_unit,
        p_reference_type  => 'goods_receipt',
        p_reference_id    => p_receipt_id,
        p_note            => 'Received against PO #' || v_po.po_number
      );
    end if;

    update public.purchase_order_items
       set qty_received_base = qty_received_base + v_qty_good_base,
           status = case
             when qty_received_base + v_qty_good_base
                  >= (qty_ordered_purchase * conversion_to_base) then 'complete'
             when qty_received_base + v_qty_good_base > 0 then 'partial'
             else 'pending' end
     where id = v_poi.id;

    update public.product_suppliers
       set last_purchase_cost = coalesce(nullif(v_item ->> 'unit_cost_purchase','')::numeric, last_purchase_cost),
           updated_at = now()
     where variant_id = v_poi.variant_id and supplier_id = v_po.supplier_id;
  end loop;

  select count(*) into v_outstanding
    from public.purchase_order_items
   where po_id = p_po_id and status <> 'complete';

  update public.purchase_orders
     set status = case when v_outstanding = 0 then 'completed'
                       else 'partially_received' end,
         updated_at = now()
   where id = p_po_id;

  return v_receipt;
end;
$$;
