-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0028 — Listing photos, listing detail, and network messaging
--
-- Three gaps in the Phase 11 network, all of them things a buyer needs before
-- they will send money to a stranger:
--
--   1. A supplier could publish a listing but not a PHOTO of it. The only
--      image anywhere was canonical_products.image_url — one shared picture
--      per real-world product, curated centrally. That is the right image for
--      "which product is this", and the wrong one for "what will actually
--      arrive in the crate". Suppliers get their own gallery per listing.
--
--   2. There was nothing to open. Listings only ever appeared as summary rows
--      inside a card; a buyer could see a from-price and a tier table and had
--      no way to see the full offer.
--
--   3. There was no way to ask a question. Every path ended at "Connect",
--      which mints a private supplier record — a commitment — when what a
--      buyer wants first is a sentence: "do you deliver to X, and what's the
--      lead time on 200?" Messaging is that step, and it is deliberately
--      anchored to a supplier (and optionally a listing), not general chat.
--
-- PLANE BOUNDARY. Everything here is on the PUBLIC plane. A thread carries
-- text and two SNAPSHOTTED display names, and nothing else. It never joins to
-- `businesses`, `products`, `sales`, or any private table — not even
-- indirectly through a view. See §4 for why the names are snapshots rather
-- than joins: a supplier must be able to see who is asking, and the buyer's
-- business row is not readable by them. Snapshotting makes that disclosure an
-- explicit, one-field, buyer-initiated act instead of a widened RLS policy.
-- ============================================================================

-- ============================================================================
-- 1. LISTING DETAIL FIELDS
--    What a buyer asks before ordering: what exactly is it, how fast, and how
--    is it packed.
-- ============================================================================
alter table public.supplier_listings
  add column if not exists description text,
  add column if not exists lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  add column if not exists pack_description text;

-- ============================================================================
-- 2. LISTING PHOTOS
--    Paths, not URLs. The object lives in the `network-images` bucket (§3) and
--    the client builds a public URL from the path — the same shape as every
--    other image in the app, so nothing has to special-case a stored URL.
-- ============================================================================
create table if not exists public.supplier_listing_images (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.supplier_listings(id) on delete cascade,
  -- Denormalised so RLS and the storage path agree without a join.
  business_id  uuid not null references public.businesses(id) on delete cascade,
  storage_path text not null,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists supplier_listing_images_listing_idx
  on public.supplier_listing_images (listing_id, sort_order);

alter table public.supplier_listing_images enable row level security;

-- Readable by anyone who can read the listing itself — same predicate as
-- listings_public_read (0027), so a photo can never be visible on a listing
-- that isn't.
drop policy if exists listing_images_read on public.supplier_listing_images;
create policy listing_images_read on public.supplier_listing_images
  for select to authenticated
  using (
    exists (
      select 1
        from public.supplier_listings l
        join public.supplier_profiles sp on sp.id = l.supplier_profile_id
       where l.id = listing_id
         and ((sp.is_public and sp.verification <> 'rejected')
              or public.is_member_of(sp.business_id))
    )
  );

drop policy if exists listing_images_write on public.supplier_listing_images;
create policy listing_images_write on public.supplier_listing_images
  for all to authenticated
  using (public.has_role_in(business_id, array['owner','manager']::public.member_role[]))
  with check (
    public.has_role_in(business_id, array['owner','manager']::public.member_role[])
    -- The listing must belong to the same business, or a manager of business A
    -- could hang photos on business B's listing.
    and exists (
      select 1 from public.supplier_listings l
       where l.id = listing_id and l.business_id = supplier_listing_images.business_id
    )
  );

-- ============================================================================
-- 3. THE PUBLIC IMAGE BUCKET
--
--    Every other bucket in this project is PRIVATE, and reads go through
--    createSignedUrl() gated by is_member_of() on the first path segment. That
--    model cannot work here: the whole point of a marketplace photo is that a
--    business which is NOT a member sees it. Signing would require a SELECT
--    policy the viewer can pass, which means either duplicating the listing
--    visibility predicate inside a storage policy (it would drift) or
--    loosening it to "any authenticated user", which is a public bucket with
--    extra steps and a slower read path.
--
--    So: public bucket, read with getPublicUrl(), and the SELECT policy is
--    deliberately absent because a public bucket serves objects from the
--    public endpoint regardless. WRITES stay locked to the owning business by
--    the same first-path-segment rule as every other bucket.
--
--    The consequence, stated plainly: an object in this bucket is readable by
--    anyone holding its URL, including after the listing is hidden or
--    deleted. Only publish-intent images go here. Nothing in the app writes a
--    product photo to both this bucket and product-images.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('network-images', 'network-images', true, 5242880, array['image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists network_images_write on storage.objects;
create policy network_images_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'network-images'
    and public.has_role_in(
          public.safe_uuid((storage.foldername(name))[1]),
          array['owner','manager']::public.member_role[])
  );

drop policy if exists network_images_update on storage.objects;
create policy network_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'network-images'
    and public.has_role_in(
          public.safe_uuid((storage.foldername(name))[1]),
          array['owner','manager']::public.member_role[])
  );

drop policy if exists network_images_delete on storage.objects;
create policy network_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'network-images'
    and public.has_role_in(
          public.safe_uuid((storage.foldername(name))[1]),
          array['owner','manager']::public.member_role[])
  );

-- ============================================================================
-- 4. MESSAGE THREADS
--
--    Why every display field is a SNAPSHOT and not a join:
--
--    A thread has two sides. The buyer can already read the supplier's name —
--    supplier_profiles is publicly readable once published. The supplier can
--    read NOTHING about the buyer: `businesses` is member-scoped, and it must
--    stay that way. So a view that joined to `businesses` for the buyer's name
--    would return null to the supplier under security_invoker, or leak the
--    whole row under security_definer.
--
--    Instead the buyer's business name is copied onto the thread at the moment
--    the buyer chooses to make contact, by a definer RPC (§5). That is one
--    field, disclosed by a deliberate act, to one counterparty. It also means
--    the thread list is a single-table read with no joins at all — nothing in
--    it can be widened later by accident.
-- ============================================================================
create table if not exists public.network_threads (
  id                    uuid primary key default gen_random_uuid(),

  buyer_business_id     uuid not null references public.businesses(id) on delete cascade,
  -- Snapshot. See the note above.
  buyer_display_name    text not null,

  supplier_profile_id   uuid not null references public.supplier_profiles(id) on delete cascade,
  supplier_business_id  uuid not null references public.businesses(id) on delete cascade,
  supplier_display_name text not null,

  -- The procurement anchor. Null means "about you in general" — a supplier
  -- with one listing shouldn't force a buyer to pick it before saying hello.
  listing_id            uuid references public.supplier_listings(id) on delete set null,
  listing_label         text,

  last_message_at       timestamptz,
  last_message_preview  text,
  last_sender_business_id uuid references public.businesses(id) on delete set null,

  -- Unread is derived: messages after the side's own last-read stamp.
  buyer_last_read_at    timestamptz,
  supplier_last_read_at timestamptz,

  created_at            timestamptz not null default now()
);

-- One thread per buyer/supplier/anchor. Two partial indexes rather than one on
-- coalesce(...), because a null listing_id is a genuinely different key, not a
-- sentinel: "about your storefront" and "about this listing" are two threads.
create unique index if not exists network_threads_general_idx
  on public.network_threads (buyer_business_id, supplier_profile_id)
  where listing_id is null;
create unique index if not exists network_threads_listing_idx
  on public.network_threads (buyer_business_id, supplier_profile_id, listing_id)
  where listing_id is not null;

create index if not exists network_threads_buyer_idx
  on public.network_threads (buyer_business_id, last_message_at desc);
create index if not exists network_threads_supplier_idx
  on public.network_threads (supplier_business_id, last_message_at desc);

create table if not exists public.network_messages (
  id                 uuid primary key default gen_random_uuid(),
  thread_id          uuid not null references public.network_threads(id) on delete cascade,
  sender_business_id uuid not null references public.businesses(id) on delete cascade,
  sender_user_id     uuid references auth.users(id) on delete set null,
  -- Who typed it, for a business where several people share the login.
  sender_name        text,
  body               text not null check (length(btrim(body)) between 1 and 4000),
  created_at         timestamptz not null default now()
);

create index if not exists network_messages_thread_idx
  on public.network_messages (thread_id, created_at);

alter table public.network_threads enable row level security;
alter table public.network_messages enable row level security;

-- Either side of the thread. Nobody else, ever — there is no public read here
-- and there must never be one.
drop policy if exists network_threads_participant_read on public.network_threads;
create policy network_threads_participant_read on public.network_threads
  for select to authenticated
  using (
    public.is_member_of(buyer_business_id) or public.is_member_of(supplier_business_id)
  );

-- There is deliberately no INSERT or UPDATE policy on either table, and no
-- insert/update grant. Every write goes through a definer RPC (§5), because
-- every write has an invariant a policy cannot express: a thread's snapshotted
-- names must come from the server, a message's sender_business_id must be the
-- caller's own side, and last_message_preview must match the message that was
-- actually stored. A permissive client-side UPDATE would let a participant
-- rewrite the preview of a conversation the other side is reading.
drop policy if exists network_threads_participant_update on public.network_threads;

drop policy if exists network_messages_participant_read on public.network_messages;
create policy network_messages_participant_read on public.network_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.network_threads t
       where t.id = thread_id
         and (public.is_member_of(t.buyer_business_id)
              or public.is_member_of(t.supplier_business_id))
    )
  );

-- ============================================================================
-- 5. MESSAGING RPCs
-- ============================================================================

/**
 * Open (or reuse) a thread with a public supplier and post the first message.
 *
 * The caller passes the supplier PROFILE id and their own business id. Every
 * other identity field is resolved here, not trusted from the client.
 */
create or replace function public.start_network_thread(
  p_business_id uuid,
  p_supplier_profile_id uuid,
  p_body text,
  p_listing_id uuid default null
) returns public.network_threads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile  public.supplier_profiles;
  v_thread   public.network_threads;
  v_buyer    text;
  v_label    text;
  v_sender   text;
  v_body     text := btrim(coalesce(p_body, ''));
begin
  if not public.is_member_of(p_business_id) then
    raise exception 'Not a member of this business';
  end if;
  if v_body = '' then
    raise exception 'Write a message before sending it';
  end if;

  select * into v_profile
    from public.supplier_profiles
   where id = p_supplier_profile_id;

  if v_profile.id is null then
    raise exception 'Supplier not found';
  end if;
  -- Same visibility rule as the marketplace (0027): published and not
  -- rejected. A hidden storefront cannot be messaged into existence.
  if not (v_profile.is_public and v_profile.verification <> 'rejected') then
    raise exception 'That supplier is not accepting messages';
  end if;
  if v_profile.business_id = p_business_id then
    raise exception 'That is your own storefront';
  end if;

  -- The anchor must belong to the supplier being messaged.
  if p_listing_id is not null then
    select coalesce(l.supplier_product_name, cp.name) into v_label
      from public.supplier_listings l
      join public.canonical_products cp on cp.id = l.canonical_product_id
     where l.id = p_listing_id and l.supplier_profile_id = p_supplier_profile_id;
    if v_label is null then
      raise exception 'That product is not listed by this supplier';
    end if;
  end if;

  select name into v_buyer from public.businesses where id = p_business_id;
  select display_name into v_sender
    from public.business_members
   where business_id = p_business_id and user_id = auth.uid() and status = 'active'
   limit 1;

  insert into public.network_threads (
    buyer_business_id, buyer_display_name,
    supplier_profile_id, supplier_business_id, supplier_display_name,
    listing_id, listing_label
  ) values (
    p_business_id, coalesce(v_buyer, 'A business'),
    v_profile.id, v_profile.business_id, v_profile.display_name,
    p_listing_id, v_label
  )
  on conflict do nothing
  returning * into v_thread;

  -- Already talking about this. Reuse it rather than erroring — from the
  -- buyer's side "message this supplier" is one action whether or not they
  -- have done it before.
  if v_thread.id is null then
    select * into v_thread
      from public.network_threads
     where buyer_business_id = p_business_id
       and supplier_profile_id = p_supplier_profile_id
       and listing_id is not distinct from p_listing_id;
  end if;

  insert into public.network_messages (thread_id, sender_business_id, sender_user_id, sender_name, body)
  values (v_thread.id, p_business_id, auth.uid(), v_sender, v_body);

  update public.network_threads
     set last_message_at = now(),
         last_message_preview = left(v_body, 160),
         last_sender_business_id = p_business_id,
         buyer_last_read_at = now()
   where id = v_thread.id
  returning * into v_thread;

  return v_thread;
end;
$$;

/**
 * Post to an existing thread. Either side may send; nobody else can, and the
 * check is on membership rather than on which side the caller thinks it is.
 */
create or replace function public.send_network_message(
  p_thread_id uuid,
  p_body text
) returns public.network_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread  public.network_threads;
  v_msg     public.network_messages;
  v_sender  text;
  v_side    uuid;
  v_body    text := btrim(coalesce(p_body, ''));
begin
  if v_body = '' then
    raise exception 'Write a message before sending it';
  end if;

  select * into v_thread from public.network_threads where id = p_thread_id;
  if v_thread.id is null then
    raise exception 'Conversation not found';
  end if;

  if public.is_member_of(v_thread.buyer_business_id) then
    v_side := v_thread.buyer_business_id;
  elsif public.is_member_of(v_thread.supplier_business_id) then
    v_side := v_thread.supplier_business_id;
  else
    raise exception 'Not part of this conversation';
  end if;

  select display_name into v_sender
    from public.business_members
   where business_id = v_side and user_id = auth.uid() and status = 'active'
   limit 1;

  insert into public.network_messages (thread_id, sender_business_id, sender_user_id, sender_name, body)
  values (p_thread_id, v_side, auth.uid(), v_sender, v_body)
  returning * into v_msg;

  update public.network_threads
     set last_message_at = v_msg.created_at,
         last_message_preview = left(v_body, 160),
         last_sender_business_id = v_side,
         -- Sending is reading: your own message never comes back as unread.
         buyer_last_read_at =
           case when v_side = buyer_business_id then v_msg.created_at else buyer_last_read_at end,
         supplier_last_read_at =
           case when v_side = supplier_business_id then v_msg.created_at else supplier_last_read_at end
   where id = p_thread_id;

  return v_msg;
end;
$$;

/** Stamp the caller's side as read up to now. */
create or replace function public.mark_network_thread_read(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread public.network_threads;
begin
  select * into v_thread from public.network_threads where id = p_thread_id;
  if v_thread.id is null then
    return;
  end if;

  if public.is_member_of(v_thread.buyer_business_id) then
    update public.network_threads set buyer_last_read_at = now() where id = p_thread_id;
  elsif public.is_member_of(v_thread.supplier_business_id) then
    update public.network_threads set supplier_last_read_at = now() where id = p_thread_id;
  end if;
end;
$$;

-- ============================================================================
-- 6. THREAD LIST VIEW
--    Resolves "which side am I" so the client never has to, and carries the
--    unread count. security_invoker: the RLS policy above is the gate, and
--    the only table touched is one the caller can already read.
-- ============================================================================
create or replace view public.v_network_threads
with (security_invoker = true) as
select
  t.id,
  t.buyer_business_id,
  t.supplier_business_id,
  t.supplier_profile_id,
  t.listing_id,
  t.listing_label,
  t.last_message_at,
  t.last_message_preview,
  t.created_at,
  public.is_member_of(t.buyer_business_id) as i_am_buyer,
  case
    when public.is_member_of(t.buyer_business_id) then t.supplier_display_name
    else t.buyer_display_name
  end as counterparty_name,
  (
    select count(*)
      from public.network_messages m
     where m.thread_id = t.id
       and m.sender_business_id <> (
             case when public.is_member_of(t.buyer_business_id)
                  then t.buyer_business_id else t.supplier_business_id end)
       and m.created_at > coalesce(
             case when public.is_member_of(t.buyer_business_id)
                  then t.buyer_last_read_at else t.supplier_last_read_at end,
             '-infinity'::timestamptz)
  ) as unread_count
from public.network_threads t;

-- ============================================================================
-- 7. LISTING DETAIL VIEW
--    One row per listing, everything the detail page needs except the tiers
--    and images (which are lists, and read separately).
-- ============================================================================
create or replace view public.v_listing_detail
with (security_invoker = true) as
select
  l.id                 as listing_id,
  l.business_id        as supplier_business_id,
  l.supplier_profile_id,
  l.canonical_product_id,
  coalesce(l.supplier_product_name, cp.name) as title,
  cp.name              as canonical_name,
  cp.brand,
  cp.category,
  cp.base_unit,
  cp.image_url         as canonical_image_url,
  l.description,
  l.pack_description,
  l.lead_time_days,
  l.purchase_unit,
  l.conversion_to_base,
  l.min_order_qty,
  l.availability,
  l.currency_code,
  l.created_at,
  l.updated_at,
  sp.display_name      as supplier_name,
  sp.location_text,
  sp.logo_url          as supplier_logo_url,
  sp.verification,
  public.earned_trust_tier(sp.id) as trust_tier,
  sp.completed_orders,
  sp.fulfillment_rate,
  sp.repeat_customers,
  sp.avg_response_minutes,
  sp.min_order_note,
  sp.contact_phone,
  sp.contact_email,
  sp.created_at        as supplier_since,
  (select min(unit_price) from public.listing_price_tiers t where t.listing_id = l.id) as from_price
from public.supplier_listings l
join public.supplier_profiles sp on sp.id = l.supplier_profile_id
join public.canonical_products cp on cp.id = l.canonical_product_id;

-- ============================================================================
-- 8. VISIBILITY IS A SWITCH, NOT A ONE-WAY DOOR
--
--    0027's publish_supplier_profile set `is_public = true` on the UPDATE
--    branch as well as the INSERT. That is right the first time — publishing
--    is what the function is for — and wrong every time after: a supplier who
--    deliberately took themselves off the network, then came back to fix a
--    typo in their description, was silently re-listed by pressing Save.
--
--    The insert still publishes. The update now leaves is_public exactly as it
--    found it, and going live again is its own explicit act.
-- ============================================================================
create or replace function public.publish_supplier_profile(
  p_business_id uuid,
  p_display_name text,
  p_description text default null,
  p_location_text text default null
)
returns public.supplier_profiles
language plpgsql
security definer set search_path = public
as $$
declare v_row public.supplier_profiles;
begin
  if not public.has_role_in(p_business_id, array['owner','manager']::public.member_role[]) then
    raise exception 'Only an owner or manager can publish a supplier profile.';
  end if;

  insert into public.supplier_profiles (
    business_id, display_name, description, location_text,
    is_public, verification, trust_tier
  )
  values (
    p_business_id, p_display_name,
    nullif(trim(coalesce(p_description,'')),''),
    nullif(trim(coalesce(p_location_text,'')),''),
    true, 'pending', 'provisional'
  )
  on conflict (business_id) do update
    set display_name  = excluded.display_name,
        description   = coalesce(excluded.description, public.supplier_profiles.description),
        location_text = coalesce(excluded.location_text, public.supplier_profiles.location_text),
        -- Deliberately NOT `true`. See the note above.
        updated_at    = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- ============================================================================
-- 9. GRANTS
-- ============================================================================
grant select, insert, update, delete on public.supplier_listing_images to authenticated;
grant select on public.network_threads to authenticated;
grant select on public.network_messages to authenticated;
grant select on public.v_network_threads to authenticated;
grant select on public.v_listing_detail to authenticated;
grant execute on function public.start_network_thread(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.send_network_message(uuid, text) to authenticated;
grant execute on function public.mark_network_thread_read(uuid) to authenticated;
grant execute on function public.publish_supplier_profile(uuid, text, text, text) to authenticated;
