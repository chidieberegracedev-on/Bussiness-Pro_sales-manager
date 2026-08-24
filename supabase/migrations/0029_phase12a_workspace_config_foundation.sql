-- ============================================================
-- PHASE 12A FOUNDATION — business vertical + config + preferences
-- APPLIED LIVE to Supabase project quldxdhnvkgiuznbjpld (2026-08).
-- Additive only. Classified per a live schema audit:
--   business_type          -> NEW (no vertical config existed)
--   business_pos_config     -> NEW relational config (NOT a json blob on businesses)
--   employee profile fields -> EXTEND business_members (don't replace)
--   employee_preferences    -> NEW (personal workspace prefs, off txn tables)
-- Restaurant/boutique OPERATIONAL tables are DEFERRED to 12B by design.
-- Note: product_variants.option_values (jsonb) ALREADY supports boutique
--       size/colour — not rebuilt here.
-- ============================================================

do $$ begin
  if not exists (select 1 from pg_type where typname='business_vertical') then
    create type public.business_vertical as enum ('general','grocery','boutique','restaurant');
  end if;
end $$;

alter table public.businesses
  add column if not exists business_type public.business_vertical not null default 'general';

create table if not exists public.business_pos_config (
  business_id        uuid primary key references public.businesses(id) on delete cascade,
  product_view       text not null default 'grid',
  category_first     boolean not null default true,
  show_product_images boolean not null default true,
  barcode_first      boolean not null default true,
  allow_hold_resume  boolean not null default true,
  capture_customer   boolean not null default false,
  allow_line_discount boolean not null default true,
  tables_enabled     boolean not null default false,
  modifiers_enabled  boolean not null default false,
  kitchen_workflow_enabled boolean not null default false,
  variants_enabled   boolean not null default false,
  returns_enabled    boolean not null default false,
  receipt_footer     text,
  free_form          jsonb not null default '{}'::jsonb,
  updated_at         timestamptz not null default now()
);

drop trigger if exists business_pos_config_touch on public.business_pos_config;
create trigger business_pos_config_touch
  before update on public.business_pos_config
  for each row execute function public.touch_updated_at();

alter table public.business_pos_config enable row level security;
create policy pos_config_read on public.business_pos_config
  for select to authenticated using (public.is_member_of(business_id));
create policy pos_config_write on public.business_pos_config
  for all to authenticated
  using (public.has_role_in(business_id, array['owner','manager']::public.member_role[]))
  with check (public.has_role_in(business_id, array['owner','manager']::public.member_role[]));

alter table public.business_members
  add column if not exists avatar_path text,
  add column if not exists assigned_terminal_id uuid references public.terminals(id);

create table if not exists public.employee_preferences (
  member_id       uuid primary key references public.business_members(id) on delete cascade,
  business_id     uuid not null references public.businesses(id) on delete cascade,
  pos_layout      text not null default 'inherit',
  input_mode      text not null default 'inherit',
  sidebar_width   text not null default 'expanded',
  notify_prefs    jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);

drop trigger if exists employee_preferences_touch on public.employee_preferences;
create trigger employee_preferences_touch
  before update on public.employee_preferences
  for each row execute function public.touch_updated_at();

alter table public.employee_preferences enable row level security;
create policy emp_prefs_self_read on public.employee_preferences
  for select to authenticated using (public.is_member_of(business_id));
create policy emp_prefs_self_write on public.employee_preferences
  for all to authenticated
  using (public.is_member_of(business_id)) with check (public.is_member_of(business_id));

insert into public.business_pos_config (business_id)
select id from public.businesses
on conflict (business_id) do nothing;
