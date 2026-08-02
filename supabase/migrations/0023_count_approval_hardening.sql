-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0023 — Harden approve_count_session
--
-- Two defects in 0022's approval path. Both are the kind that look fine in
-- review and fail silently in production.
--
-- ---------------------------------------------------------------------------
-- DEFECT 1 — the denial audit record is rolled back by its own raise
--
--   0022 does:
--       perform public.record_activity(... 'count_approval_denied' ...);
--       raise exception 'Approver PIN is incorrect.';
--
--   `raise exception` aborts the transaction, so the INSERT that
--   record_activity just performed is rolled back with it. The denial is
--   never written. A wrong manager PIN on a stock count — precisely the event
--   the Exceptions Center exists to surface — leaves no trace at all.
--
--   There is no way to persist a write and raise in the same transaction.
--   So the failure stops raising: it returns {approved:false, reason:...},
--   the transaction commits, and the audit record survives. The client treats
--   approved:false as a failure and shows the reason.
--
-- ---------------------------------------------------------------------------
-- DEFECT 2 — no lock against concurrent approval
--
--   The early `if v_sess.status = 'approved' then return` is read without a
--   lock, so two approvals racing each other both read 'open' and both post
--   the full set of adjustments. Inventory would be double-corrected and the
--   shrinkage expense double-counted, silently. The session row is now taken
--   `for update`, so the second caller blocks and then sees 'approved'.
--
-- Additive: replaces one function. Signature and success shape unchanged.
-- ============================================================================

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
  -- Locked read: a second approval blocks here, then sees 'approved' below.
  select * into v_sess from public.inventory_count_sessions
   where id = p_session_id
     for update;
  if not found then raise exception 'Count session not found.'; end if;
  if v_sess.status = 'approved' then
    return jsonb_build_object('approved', true, 'already_approved', true);
  end if;
  if v_sess.status = 'cancelled' then
    return jsonb_build_object('approved', false, 'reason', 'cancelled');
  end if;

  -- Manager/owner PIN gate. Returns rather than raises, so the denial record
  -- below actually commits (see DEFECT 1).
  select * into v_appr from public.employee_pins
   where member_id = p_approver_member_id and business_id = v_sess.business_id;

  if not found or v_appr.pin_hash <> extensions.crypt(p_approver_pin, v_appr.pin_hash) then
    perform public.record_activity(
      v_sess.business_id, 'count_approval_denied', v_sess.opened_by, p_approver_member_id,
      null, null, 'count_session', p_session_id, 'exception',
      jsonb_build_object('reason', 'bad_pin'));
    return jsonb_build_object('approved', false, 'reason', 'bad_pin');
  end if;

  if v_appr.locked_until is not null and v_appr.locked_until > now() then
    perform public.record_activity(
      v_sess.business_id, 'count_approval_denied', v_sess.opened_by, p_approver_member_id,
      null, null, 'count_session', p_session_id, 'exception',
      jsonb_build_object('reason', 'locked_out'));
    return jsonb_build_object('approved', false, 'reason', 'locked_out');
  end if;

  select role into v_appr_role from public.business_members where id = p_approver_member_id;
  if v_appr_role not in ('owner','manager') then
    perform public.record_activity(
      v_sess.business_id, 'count_approval_denied', v_sess.opened_by, p_approver_member_id,
      null, null, 'count_session', p_session_id, 'exception',
      jsonb_build_object('reason', 'not_authorized', 'role', v_appr_role));
    return jsonb_build_object('approved', false, 'reason', 'not_authorized');
  end if;

  v_actor := coalesce(public.session_actor(p_actor_token), v_sess.opened_by);
  select currency_code into v_currency from public.businesses where id = v_sess.business_id;

  -- Post each variance as an adjustment through the EXISTING ledger, at the
  -- per-base cost the snapshot froze. Never a direct write to inventory.
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
        p_quantity       => v_delta,
        p_reference_type => 'count_session',
        p_reference_id   => p_session_id,
        p_note           => 'Stock count adjustment'
      );
      v_adjust_count := v_adjust_count + 1;
      if v_delta < 0 then
        v_shrinkage_value := v_shrinkage_value + (abs(v_delta) * v_item.avg_cost_snapshot);
      end if;
    end if;
  end loop;

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

grant execute on function public.approve_count_session(uuid, uuid, text, text) to authenticated;

-- ============================================================================
-- Cancelling a session. Without this an abandoned count sits in 'counting'
-- forever and the operator has no way to walk away from a miscount.
-- ============================================================================
create or replace function public.cancel_count_session(p_session_id uuid)
returns public.inventory_count_sessions
language plpgsql
security definer set search_path = public
as $$
declare
  v_sess public.inventory_count_sessions;
begin
  select * into v_sess from public.inventory_count_sessions where id = p_session_id for update;
  if not found then raise exception 'Count session not found.'; end if;
  if not public.has_role_in(v_sess.business_id,
       array['owner','manager','inventory_staff']::public.member_role[]) then
    raise exception 'Insufficient permission.';
  end if;
  if v_sess.status = 'approved' then
    raise exception 'An approved count cannot be cancelled.';
  end if;

  update public.inventory_count_sessions
     set status = 'cancelled'
   where id = p_session_id
  returning * into v_sess;

  perform public.record_activity(
    v_sess.business_id, 'count_cancelled', v_sess.opened_by, null, null, null,
    'count_session', p_session_id, 'notice', '{}'::jsonb);

  return v_sess;
end;
$$;

grant execute on function public.cancel_count_session(uuid) to authenticated;
