-- ============================================================================
-- 0031 — CATEGORY ICONS  (Phase 12C, Requirement 10)
--
-- STATUS: NOT APPLIED. Written for architect review, per the standing rule that
-- migrations are reviewed and applied live by the architect, not by the client.
--
-- Purely additive: one nullable column on an existing table. No existing row
-- changes, no constraint tightens, nothing is dropped. A database without this
-- column still runs the app — the client detects 42703 on the first read and
-- degrades to name-only categories with the icon controls shown as inert and
-- explained, rather than as controls that quietly accept a choice nobody stores.
--
-- WHAT THE COLUMN HOLDS: an icon KEY from the curated set the client owns
-- (src/features/products/category-icons.ts), e.g. 'bread', 'plumbing', 'salon'.
-- A raw emoji is also accepted, for the escape hatch where a shop's category is
-- outside the curated set. It is NOT a file path and NOT an uploaded image —
-- forcing an upload per category is exactly the friction Requirement 10 rejects.
--
-- WHY A KEY RATHER THAN THE GLYPH: an emoji character is not a stable
-- identifier. It renders differently per platform, and moving to a drawn icon
-- set later would orphan every stored character. A key survives that; the glyph
-- stays a rendering detail the client owns.
-- ============================================================================

alter table public.product_categories
  add column if not exists icon text;

-- Bound the length so the column cannot become a general-purpose text field.
-- 32 characters comfortably fits the longest curated key and any single emoji
-- including its variation selectors and ZWJ sequences.
alter table public.product_categories
  drop constraint if exists product_categories_icon_len;
alter table public.product_categories
  add constraint product_categories_icon_len
  check (icon is null or length(icon) between 1 and 32);

comment on column public.product_categories.icon is
  'Curated icon key (see the client icon set) or a single emoji. Visual metadata only — never a file path or uploaded image.';

-- No RLS change: the existing product_categories policies already scope reads
-- and writes by business, and an icon is no more sensitive than the name beside
-- it. No index: the column is never filtered or sorted on, only projected.
