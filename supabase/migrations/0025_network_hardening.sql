-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0025 — Harden the connect bridge; give price history a writer
--
-- Three gaps in 0024. None is a data-leak, but two of them let the bridge —
-- the one place the public plane touches the private plane — do the wrong
-- thing quietly.
--
-- ---------------------------------------------------------------------------
-- 1. accept_supplier_connection duplicates the private supplier
--
--    The only guard is `if v_conn.status = 'accepted' then return`. So the
--    path accept -> revoke -> request again -> accept inserts a SECOND private
--    suppliers row for the same relationship and overwrites private_supplier_id,
--    orphaning the first. The retailer ends up with two identical suppliers,
--    one of which now has purchase orders hanging off it and no connection
--    pointing at it. Now: if a private supplier already exists for this
--    connection, reactivate and reuse it.
--
-- 2. accept_supplier_connection accepts from any state
--
--    A declined or revoked connection could still be accepted by the supplier,
--    re-creating a relationship the requester walked away from. Now only a
--    'requested' connection can be accepted.
--
-- 3. request_supplier_connection doesn't check the target is actually public
--
--    A profile id is a uuid, so this isn't a browsing vector, but nothing
--    stopped a request against a profile that is private, unverified, or
--    rejected. That would put a row in front of a business that never listed
--    itself, and accepting it would mint a private supplier from an unverified
--    profile. Now the target must be public AND verified — the same condition
--    the marketplace itself uses.
--
-- Also: listing_price_history had no writer. 0024 describes it as the
-- marketplace-intelligence foundation, but nothing ever inserted a row, so it
-- would have been empty forever. A trigger on the price tiers records every
-- price as it is set.
--
-- Additive: replaces two functions, adds one trigger. No table changes.
-- ============================================================================

-- ============================================================================
-- 1. request_supplier_connection — target must be publicly listed
-- ============================================================================
create or replace function public.request_supplier_connection(
  p_business_id uuid,
  p_supplier_profile_id uuid
)
returns public.supplier_connections
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.supplier_connections;
  v_profile public.supplier_profiles;
begin
  if not public.has_role_in(p_business_id, array['owner','manager']::public.member_role[]) then
    raise exception 'Only an owner or manager can connect with a supplier.';
  end if;

  select * into v_profile from public.supplier_profiles where id = p_supplier_profile_id;
  if not found then
    raise exception 'Supplier not found.';
  end if;
  -- The same condition the marketplace view uses. A profile that isn't listed
  -- cannot be connected to, even by someone who knows its id.
  if not (v_profile.is_public and v_profile.verification = 'verified') then
    raise exception 'That supplier is not accepting connections yet.';
  end if;
  -- A business connecting to itself would create a private supplier row
  -- pointing at its own profile.
  if v_profile.business_id = p_business_id then
    raise exception 'You cannot connect to your own supplier profile.';
  end if;

  insert into public.supplier_connections (requester_business_id, supplier_profile_id, status)
  values (p_business_id, p_supplier_profile_id, 'requested')
  on conflict (requester_business_id, supplier_profile_id) do update
    set status = 'requested', requested_at = now(), responded_at = null
  returning * into v_row;

  return v_row;
end;
$$;

-- ============================================================================
-- 2. accept_supplier_connection — idempotent, state-checked, reuses the
--    private supplier it already created
-- ============================================================================
create or replace function public.accept_supplier_connection(
  p_connection_id uuid
)
returns public.supplier_connections
language plpgsql
security definer set search_path = public
as $$
declare
  v_conn public.supplier_connections;
  v_profile public.supplier_profiles;
  v_new_supplier uuid;
begin
  -- Locked: two accepts racing each other would each insert a private supplier.
  select * into v_conn from public.supplier_connections
   where id = p_connection_id
     for update;
  if not found then raise exception 'Connection not found.'; end if;

  select * into v_profile from public.supplier_profiles where id = v_conn.supplier_profile_id;
  if not public.has_role_in(v_profile.business_id, array['owner','manager']::public.member_role[]) then
    raise exception 'Only the supplier can accept this connection.';
  end if;

  if v_conn.status = 'accepted' then return v_conn; end if;
  if v_conn.status <> 'requested' then
    raise exception 'This connection is no longer open to accept.';
  end if;

  -- Reuse the private supplier from a previous accept rather than minting a
  -- second one. Purchase orders may already reference it.
  if v_conn.private_supplier_id is not null
     and exists (select 1 from public.suppliers where id = v_conn.private_supplier_id) then
    update public.suppliers
       set is_active = true, updated_at = now()
     where id = v_conn.private_supplier_id;
    v_new_supplier := v_conn.private_supplier_id;
  else
    -- Or one the retailer already has pointing at this same public profile.
    select id into v_new_supplier
      from public.suppliers
     where business_id = v_conn.requester_business_id
       and supplier_profile_id = v_profile.id
     limit 1;

    if v_new_supplier is not null then
      update public.suppliers set is_active = true, updated_at = now()
       where id = v_new_supplier;
    else
      insert into public.suppliers (
        business_id, name, phone, email, notes, supplier_profile_id, is_active
      )
      values (
        v_conn.requester_business_id,
        left(coalesce(nullif(trim(v_profile.display_name), ''), 'Network supplier'), 160),
        v_profile.contact_phone, v_profile.contact_email,
        'Connected via network', v_profile.id, true
      )
      returning id into v_new_supplier;
    end if;
  end if;

  update public.supplier_connections
     set status = 'accepted', responded_at = now(), private_supplier_id = v_new_supplier
   where id = p_connection_id
  returning * into v_conn;

  return v_conn;
end;
$$;

-- ============================================================================
-- 3. decline / revoke — the other two states had no way to be reached
-- ============================================================================
create or replace function public.decline_supplier_connection(p_connection_id uuid)
returns public.supplier_connections
language plpgsql
security definer set search_path = public
as $$
declare
  v_conn public.supplier_connections;
  v_profile public.supplier_profiles;
begin
  select * into v_conn from public.supplier_connections where id = p_connection_id for update;
  if not found then raise exception 'Connection not found.'; end if;
  select * into v_profile from public.supplier_profiles where id = v_conn.supplier_profile_id;
  if not public.has_role_in(v_profile.business_id, array['owner','manager']::public.member_role[]) then
    raise exception 'Only the supplier can decline this connection.';
  end if;

  update public.supplier_connections
     set status = 'declined', responded_at = now()
   where id = p_connection_id
  returning * into v_conn;
  return v_conn;
end;
$$;

/**
 * The requester walking away. Deactivates the private supplier rather than
 * deleting it — purchase orders and receipts reference it, and history must
 * not disappear because a relationship ended.
 */
create or replace function public.revoke_supplier_connection(p_connection_id uuid)
returns public.supplier_connections
language plpgsql
security definer set search_path = public
as $$
declare v_conn public.supplier_connections;
begin
  select * into v_conn from public.supplier_connections where id = p_connection_id for update;
  if not found then raise exception 'Connection not found.'; end if;
  if not public.has_role_in(v_conn.requester_business_id,
       array['owner','manager']::public.member_role[]) then
    raise exception 'Only the requesting business can revoke this connection.';
  end if;

  if v_conn.private_supplier_id is not null then
    update public.suppliers set is_active = false, updated_at = now()
     where id = v_conn.private_supplier_id;
  end if;

  update public.supplier_connections
     set status = 'revoked', responded_at = now()
   where id = p_connection_id
  returning * into v_conn;
  return v_conn;
end;
$$;

-- ============================================================================
-- 4. Price history actually gets written
--    0024 created listing_price_history and described it as the intelligence
--    foundation, but nothing inserted into it. Every tier price is now
--    recorded as it is set, which is what a price trend is later computed from.
-- ============================================================================
create or replace function public.capture_listing_price()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare v_canonical uuid;
begin
  select canonical_product_id into v_canonical
    from public.supplier_listings where id = new.listing_id;
  if v_canonical is null then return new; end if;

  insert into public.listing_price_history (listing_id, canonical_product_id, unit_price, min_qty)
  values (new.listing_id, v_canonical, new.unit_price, new.min_qty);
  return new;
end;
$$;

drop trigger if exists listing_price_tiers_history on public.listing_price_tiers;
create trigger listing_price_tiers_history
  after insert or update of unit_price on public.listing_price_tiers
  for each row execute function public.capture_listing_price();

-- ============================================================================
-- 5. GRANTS
-- ============================================================================
grant execute on function public.request_supplier_connection(uuid, uuid) to authenticated;
grant execute on function public.accept_supplier_connection(uuid)        to authenticated;
grant execute on function public.decline_supplier_connection(uuid)       to authenticated;
grant execute on function public.revoke_supplier_connection(uuid)        to authenticated;
