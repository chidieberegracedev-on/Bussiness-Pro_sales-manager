# Business Pro / Sales Manager

Web app for Phase 1–2: foundation (auth, businesses, members), products & variants, and inventory (stock movements, weighted-average cost, low-stock).

Built per `ARCHITECTURE/WEB_IMPLEMENTATION.md`: Vite + React 19 + TypeScript, Tailwind CSS v4, hand-rolled shadcn/ui-style primitives on Radix UI, TanStack Query, Zustand, react-hook-form + zod, Supabase JS, decimal.js for all money/quantity arithmetic.

## Setup

1. **Install dependencies**
   ```sh
   npm install
   ```

2. **Create a Supabase project** (or run `supabase start` locally with the Supabase CLI).

3. **Apply the migrations** in `supabase/migrations/`, in order:
   - `0001_foundation_products_inventory.sql` — schema, RLS, RPCs (`create_business`, `create_product`, `record_stock_movement`, `recalculate_inventory_level`), and the `v_variant_stock` view.
   - `0002_storage_buckets.sql` — `business-logos` and `product-images` storage buckets (public, 2MB/5MB limits, `image/webp` only — the client always re-encodes to WebP before upload), with policies mirroring the RLS model (DATA_MODEL.md §13: readable by anyone, writable by owner/manager of the business under `{business_id}/...`). If you've already applied an earlier version of this migration against a live project, `create policy` will fail on re-run since it isn't idempotent — drop the six `*_read`/`*_write`/`*_update`/`*_delete` policies first, or apply the diff by hand.

   ```sh
   supabase db push
   # or, against a local stack:
   supabase start && supabase db reset
   ```

4. **Configure environment variables**
   ```sh
   cp .env.example .env.local
   ```
   Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your Supabase project settings.

5. **Configure auth redirect URLs** — Supabase Dashboard → Authentication → URL Configuration. This cannot be set from code or migrations.

   | Field | Value |
   |---|---|
   | Site URL | your production URL, e.g. `https://your-app.vercel.app` |
   | Redirect URLs (allow list) | `https://your-app.vercel.app/**`, `https://your-app-*.vercel.app/**` (Vercel preview deployments), `http://localhost:5173/**` (local dev) |

   Wildcards are only honored in the allow list, never in Site URL. If Site URL is left pointing at `localhost`, email confirmation links will resolve to a dev server that isn't running on the recipient's machine and the browser will show a connection error — the confirmation itself will have already succeeded server-side (`auth.users.email_confirmed_at` gets set), only the redirect fails.

6. **Run the dev server**
   ```sh
   npm run dev
   ```

## Project structure

```
src/
  app/            router, guards, providers
  features/       auth, business, products, inventory, settings — one folder per domain
  components/
    ui/            shadcn-style primitives (Radix + CVA) — do not add feature logic here
    layout/        AppShell, Sidebar, TopBar, PageHeader
    data/          EmptyState, ErrorState, loading skeletons, Pagination, StockStatusBadge
    money/         <Money>, <MoneyInput> — the only place currency is formatted
    quantity/      <Quantity>, <QuantityInput>, <UnitSelect>
  lib/            money.ts, units.ts, format.ts, currencies.ts, errors.ts, supabase.ts
  types/          database.ts (hand-authored from the migration — see note below)
supabase/
  migrations/     0001 schema+RLS+RPCs, 0002 storage buckets
vercel.json       SPA rewrite — every path serves index.html so client-side
                  routes like /auth/callback resolve on a hard refresh/deep link
```

## Notes on implementation choices

- **`src/types/database.ts` is hand-authored**, not generated, since this environment has no live Supabase project to run `supabase gen types typescript` against. Regenerate it once a project exists — the file documents this at the top. `Relationships` arrays are left empty; embedded-resource query results are cast explicitly at each call site rather than relying on inferred join types.
- **shadcn/ui components are hand-rolled** on Radix UI + class-variance-authority (matching what the `shadcn` CLI would generate) because the shadcn registry was unreachable from this environment. Functionally equivalent.
- **Product list pagination is client-side** over a capped fetch (5,000 rows) from `v_variant_stock`, grouped by product in JS — the approach `WEB_IMPLEMENTATION.md §8.1` explicitly allows for V1 scale ("aggregate server-side if the list exceeds a few thousand variants").
- **Money and quantities are handled as strings end-to-end** via `decimal.js`, never as JS `number`, until the final display conversion (BR-7.1).
- Money/date formatting always separates **business currency + timezone** (what's being displayed) from **user locale** (how it's displayed) per DATA_MODEL.md §4–5.
- **Password reset is not implemented.** It isn't in `WEB_IMPLEMENTATION.md`'s routes table, so no `/forgot-password` UI exists. `resetPasswordForEmail()` would need the same `emailRedirectTo`/callback treatment as sign-up if this is added later.

## What to verify manually before sign-off

This build has not been run against a live Supabase project or real users. Before treating Phase 1–2 as done, work through `TESTING_CHECKLIST.md` end-to-end, in particular:

- §4–5 (weighted-average cost arithmetic, idempotency/concurrency) — verify against the database directly, not just the UI.
- §9 (isolation/permissions) — **must be verified against the API directly**, per AC-8.1/8.2.
- §12 (integrity queries) — run after any test session; all must return zero rows.
- The Android app is out of scope for this repository (`ARCHITECTURE/WEB_IMPLEMENTATION.md` only).
