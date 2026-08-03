-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0026 — Fix PIN lockout + lock-screen re-entry
--
-- BUG 1 (lockout never worked):
--   pin_unlock increments failed_count and THEN `raise exception`. The raise
--   rolls back the whole function, undoing the increment — so failed_count
--   never rises and the 5-attempt lockout has never triggered, despite the UI
--   promising it. A 4-digit PIN with unlimited attempts is trivially brute-
--   forced. Fix: record the failed attempt in a way that survives the failure.
--
-- BUG 2 (lock screen can't re-enter without re-picking the operator):
--   pin_unlock always MINTS A NEW session. When a signed-in operator locks the
--   screen, the client has a locked session but re-entering the PIN calls a
--   path that doesn't line up, so it errors until the user goes back and re-
--   selects the operator. Fix: a dedicated unlock_session(token, pin) that
--   re-validates the PIN for the operator already attached to that session and
--   flips it active — no operator re-selection, no new session.
--
-- Both fixes keep hashing/secrecy and reflex rules (extensions.* pgcrypto,
-- writing functions VOLATILE). Rebuilds pin_unlock; adds unlock_session.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: record a failed PIN attempt in its OWN autonomous-style path.
-- Postgres has no true autonomous txn without dblink, so instead we structure
-- pin_unlock to do the counter UPDATE and RETURN a failure result WITHOUT
-- raising — the caller treats {ok:false} as a bad PIN. Because we return
-- (not raise), the UPDATE commits. This is the crux of the fix.
-- ---------------------------------------------------------------------------

create or replace function public.pin_unlock(
  p_business_id uuid,
  p_member_id   uuid,
  p_terminal_id uuid,
  p_pin         text
)
returns jsonb
language plpgsql
volatile
security definer set search_path = public, extensions
as $$
declare
  v_pin   public.employee_pins;
  v_token text;
  v_role  public.member_role;
  v_new_fail int;
begin
  if not public.is_member_of(p_business_id) then
    return jsonb_build_object('ok', false, 'reason', 'device_not_authenticated');
  end if;

  select * into v_pin from public.employee_pins
   where member_id = p_member_id and business_id = p_business_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
  end if;

  -- Locked?
  if v_pin.locked_until is not null and v_pin.locked_until > now() then
    perform public.record_activity(p_business_id, 'pin_locked', p_member_id, null, p_terminal_id,
      null, 'employee', p_member_id, 'exception', jsonb_build_object('locked_until', v_pin.locked_until));
    return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_pin.locked_until);
  end if;

  -- Wrong PIN → increment and RETURN (not raise), so the increment COMMITS.
  if v_pin.pin_hash <> extensions.crypt(p_pin, v_pin.pin_hash) then
    v_new_fail := v_pin.failed_count + 1;
    update public.employee_pins
       set failed_count = v_new_fail,
           locked_until = case when v_new_fail >= 5 then now() + interval '15 minutes' else null end,
           updated_at = now()
     where member_id = p_member_id;
    perform public.record_activity(p_business_id, 'pin_failed', p_member_id, null, p_terminal_id,
      null, 'employee', p_member_id, 'notice', jsonb_build_object('failed_count', v_new_fail));
    return jsonb_build_object('ok', false, 'reason',
      case when v_new_fail >= 5 then 'locked' else 'incorrect' end,
      'attempts_remaining', greatest(0, 5 - v_new_fail));
  end if;

  -- Correct → reset counter, mint session.
  update public.employee_pins set failed_count = 0, locked_until = null, updated_at = now()
   where member_id = p_member_id;

  select role into v_role from public.business_members where id = p_member_id;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.employee_sessions (business_id, member_id, terminal_id, token, status)
  values (p_business_id, p_member_id, p_terminal_id, v_token, 'active');
  update public.terminals set last_active_at = now() where id = p_terminal_id;
  perform public.record_activity(p_business_id, 'session_opened', p_member_id, null, p_terminal_id,
    null, 'employee', p_member_id, 'info', '{}'::jsonb);

  return jsonb_build_object('ok', true, 'token', v_token, 'member_id', p_member_id, 'role', v_role);
end;
$$;

-- ---------------------------------------------------------------------------
-- unlock_session — re-enter after a lock WITHOUT re-selecting the operator.
-- Re-validates the PIN for the operator already bound to the locked session,
-- flips it back to active, and returns the same context session_context gives.
-- ---------------------------------------------------------------------------
create or replace function public.unlock_session(
  p_token text,
  p_pin   text
)
returns jsonb
language plpgsql
volatile
security definer set search_path = public, extensions
as $$
declare
  v_sess public.employee_sessions;
  v_pin  public.employee_pins;
  v_new_fail int;
  v_role public.member_role;
begin
  select * into v_sess from public.employee_sessions
   where token = p_token and status in ('active','locked');
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_session');
  end if;

  select * into v_pin from public.employee_pins
   where member_id = v_sess.member_id and business_id = v_sess.business_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
  end if;

  if v_pin.locked_until is not null and v_pin.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_pin.locked_until);
  end if;

  if v_pin.pin_hash <> extensions.crypt(p_pin, v_pin.pin_hash) then
    v_new_fail := v_pin.failed_count + 1;
    update public.employee_pins
       set failed_count = v_new_fail,
           locked_until = case when v_new_fail >= 5 then now() + interval '15 minutes' else null end,
           updated_at = now()
     where member_id = v_sess.member_id;
    perform public.record_activity(v_sess.business_id, 'pin_failed', v_sess.member_id, null,
      v_sess.terminal_id, null, 'employee', v_sess.member_id, 'notice',
      jsonb_build_object('failed_count', v_new_fail, 'context', 'unlock'));
    return jsonb_build_object('ok', false, 'reason',
      case when v_new_fail >= 5 then 'locked' else 'incorrect' end,
      'attempts_remaining', greatest(0, 5 - v_new_fail));
  end if;

  -- Correct → reset counter, reactivate the SAME session.
  update public.employee_pins set failed_count = 0, locked_until = null, updated_at = now()
   where member_id = v_sess.member_id;
  update public.employee_sessions set status = 'active', last_seen_at = now()
   where id = v_sess.id;

  select role into v_role from public.business_members where id = v_sess.member_id;
  perform public.record_activity(v_sess.business_id, 'session_unlocked', v_sess.member_id, null,
    v_sess.terminal_id, null, 'employee', v_sess.member_id, 'info', '{}'::jsonb);

  return jsonb_build_object('ok', true, 'token', p_token, 'member_id', v_sess.member_id, 'role', v_role);
end;
$$;

grant execute on function public.pin_unlock(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.unlock_session(text, text) to authenticated;
