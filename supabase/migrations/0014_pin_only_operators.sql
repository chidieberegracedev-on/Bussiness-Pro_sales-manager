-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0014 — Operators without Supabase accounts
--
-- The control layer's core model is "operators are not users": the business
-- has ONE Supabase account (the owner's), and employees are operator records
-- inside it who sign in with a PIN, not an email. But business_members.user_id
-- is NOT NULL and references profiles(id) → auth.users, so today every
-- operator must be a real Supabase user. That is why there is no "Add operator"
-- button — the insert would violate the foreign key.
--
-- Fix: allow user_id to be NULL (a PIN-only operator), keep the uniqueness
-- guarantee only for real users, and add a safe server-side create_operator
-- RPC so the directory can add operators without raw table writes.
--
-- Additive/loosening only. RLS helpers match user_id = auth.uid(); a NULL
-- user_id simply never matches those (correct — PIN-only operators are reached
-- via member_id through their session, not via auth.uid()). No shared views
-- touched. No Android impact.
-- ============================================================================

-- ============================================================================
-- 1. Allow PIN-only operators: user_id becomes nullable
-- ============================================================================
alter table public.business_members
  alter column user_id drop not null;

-- Replace the unique(business_id, user_id) TABLE CONSTRAINT (auto-named
-- business_members_business_id_user_id_key) with a partial unique INDEX that
-- applies only when user_id is present. Two PIN-only operators (both NULL)
-- are allowed; a real user still can't be added to the same business twice.
alter table public.business_members
  drop constraint if exists business_members_business_id_user_id_key;

create unique index if not exists business_members_business_user_unique_idx
  on public.business_members (business_id, user_id)
  where user_id is not null;

-- ============================================================================
-- 2. create_operator  — the safe insert path for the Add Operator form
--    Owner/manager creates a PIN-only operator (no Supabase account) and,
--    optionally, sets their PIN in the same call.
-- ============================================================================
create or replace function public.create_operator(
  p_business_id  uuid,
  p_display_name text,
  p_role         text,
  p_pin          text default null
)
returns public.business_members
language plpgsql
security definer set search_path = public
as $$
declare
  v_member public.business_members;
begin
  if not public.has_role_in(p_business_id, array['owner','manager']::public.member_role[]) then
    raise exception 'Only owners and managers can add operators.';
  end if;
  if p_display_name is null or length(trim(p_display_name)) = 0 then
    raise exception 'An operator name is required.';
  end if;
  if p_role not in ('owner','manager','inventory_staff','cashier') then
    raise exception 'Invalid role.';
  end if;
  -- Managers may not mint owners.
  if p_role = 'owner'
     and not public.has_role_in(p_business_id, array['owner']::public.member_role[]) then
    raise exception 'Only an owner can create another owner.';
  end if;

  insert into public.business_members (business_id, user_id, role, status, display_name)
  values (p_business_id, null, p_role::public.member_role, 'active', trim(p_display_name))
  returning * into v_member;

  -- Optionally set the PIN in the same step.
  if p_pin is not null then
    if p_pin !~ '^[0-9]{4}$' then
      raise exception 'PIN must be exactly 4 digits.';
    end if;
    insert into public.employee_pins (business_id, member_id, pin_hash)
    values (p_business_id, v_member.id, crypt(p_pin, gen_salt('bf')));
  end if;

  perform public.record_activity(
    p_business_id, 'operator_created', null, null, null, null,
    'operator', v_member.id, 'info',
    jsonb_build_object('name', trim(p_display_name), 'role', p_role));

  return v_member;
end;
$$;

-- ============================================================================
-- 3. update_operator / deactivate_operator  — manage existing operators
-- ============================================================================
create or replace function public.update_operator(
  p_business_id  uuid,
  p_member_id    uuid,
  p_display_name text default null,
  p_role         text default null,
  p_status       text default null
)
returns public.business_members
language plpgsql
security definer set search_path = public
as $$
declare v_member public.business_members;
begin
  if not public.has_role_in(p_business_id, array['owner','manager']::public.member_role[]) then
    raise exception 'Only owners and managers can update operators.';
  end if;
  if p_role is not null and p_role not in ('owner','manager','inventory_staff','cashier') then
    raise exception 'Invalid role.';
  end if;
  if p_role = 'owner'
     and not public.has_role_in(p_business_id, array['owner']::public.member_role[]) then
    raise exception 'Only an owner can grant the owner role.';
  end if;

  update public.business_members
     set display_name = coalesce(nullif(trim(coalesce(p_display_name,'')),''), display_name),
         role   = coalesce(nullif(p_role,'')::public.member_role, role),
         status = coalesce(nullif(p_status,'')::public.member_status, status),
         updated_at = now()
   where id = p_member_id and business_id = p_business_id
  returning * into v_member;

  if not found then raise exception 'Operator not found.'; end if;

  perform public.record_activity(
    p_business_id, 'operator_updated', null, null, null, null,
    'operator', p_member_id, 'info', '{}'::jsonb);

  return v_member;
end;
$$;

-- ============================================================================
-- 4. GRANTS
-- ============================================================================
grant execute on function public.create_operator(uuid, text, text, text) to authenticated;
grant execute on function public.update_operator(uuid, uuid, text, text, text) to authenticated;
