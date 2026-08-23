# Marketplace upgrade — existing → required map

**Status: slice 1 of the MARKETPLACE_UPGRADE_BRIEF.** This is the mandatory
inspection deliverable (§0). Nothing in the brief's later slices should be
built until the rows below are agreed, because the whole point of the exercise
is to *evolve* the marketplace rather than grow a second one beside it.

Built from the migrations in `supabase/migrations/` and the routes in
`src/app/router.tsx`.

> **Not yet verified against the live database.** The Supabase connection
> dropped mid-session, so "applied" below means "present in this repo's
> migrations", not "confirmed live". Migrations `0022`–`0028` have never been
> confirmed applied to the project. Everything Phase 10/11 depends on them.

---

## 1. What already exists

### Public plane (cross-business) — Phase 11, migrations 0024–0028

| Object | Kind | Role today | Verdict |
| --- | --- | --- | --- |
| `canonical_products` | table | The one product identity layer | **Reuse. Never create a second catalog.** |
| `supplier_profiles` | table | Public supplier identity + `is_public`, `verification`, `trust_tier`, trust counters | Reuse; extend for trust metrics |
| `supplier_listings` | table | A supplier's offer of a canonical product | Reuse; extended in 0028 with description / pack / lead time |
| `listing_price_tiers` | table | Wholesale price breaks | Reuse — quotes negotiate *from* these |
| `listing_price_history` | table | Written by the 0025 trigger | Reuse for price trend + "4% below your last price" |
| `supplier_listing_images` | table | Supplier's own photos (0028) | Reuse |
| `supplier_connections` | table | request → accept → mints a private `suppliers` row | Reuse — this is the Connect step of the journey |
| `network_threads` / `network_messages` | tables | Procurement-linked messaging (0028) | **Reuse and make contextual** (§5), do not replace |
| `v_marketplace_listings` | view | Discovery: canonical product → N public suppliers + `from_price` | The grid already reads this |
| `v_listing_detail` | view | One listing in full (0028) | Reuse for Product Detail |
| `v_network_threads` | view | Threads resolved from the caller's side | Reuse |
| `earned_trust_tier()` | fn | Tier from verification + history | Reuse; feeds explainable ranking |
| `trust_tier_limits()` | fn | Caps per tier — **defined, not enforced** | The enforcement point when escrow lands |

### Private plane (per-business) — the Business OS the marketplace must feed

| Object | Role | Marketplace touchpoint |
| --- | --- | --- |
| `suppliers` (+ `supplier_profile_id`) | The private relationship layer | Accept-connection lands here |
| `products` / `product_variants` (+ `canonical_product_id`) | What this business stocks | Barcode → canonical → find suppliers |
| `purchase_orders` / `purchase_order_items` | Existing procurement | **Quote accept hands off to `create_purchase_order`** |
| `goods_receipts` / `receive_goods()` | Receiving | Delivery confirmation reuses this |
| `financial_events` / `emit_financial_event()` | The money ledger | Escrow settlement posts here |
| `activity_events` / `record_activity()` | Audit | Marketplace activity reuses this |
| `resolve_barcode()` | Scan → variant | Barcode → find suppliers |
| `product_suppliers` | Per-supplier purchase unit + conversion | Quote → PO conversion already understands this |

### Routes that exist today

```
/network                     Marketplace grid  (v_marketplace_listings)
/network/suppliers/:id       Supplier storefront
/network/listings/:id        Listing detail            (0028, new)
/network/messages[/:id]      Threads + conversation    (0028, new)
/network/connections         Connect requests in/out
/network/my-profile          "My storefront"
/network/my-listings         "What I sell"
```

---

## 2. What the brief asks for that does **not** exist

| Required | Nearest existing thing | Action |
| --- | --- | --- |
| Marketplace **Home** (§6) | `/network` grid doubles as home | Split: Home = entry + saved + activity; Search = the grid |
| **Product Search** with filters (§7) | Grid has search + category only | Extend the same view read — location, price, MOQ, availability, verification, existing relationship |
| **Supplier Comparison** (§16) | Marketplace card expands to N offers | New view; reuse the same rows |
| **Request Quote / Quote Management** (§13) | — | **New tables**: `quotes`, `quote_items`, `quote_events` |
| **PO handoff from quote** (§14) | `create_purchase_order` exists | New linkage column + RPC; do *not* build a second purchasing system |
| **Escrow status** (§10–12) | — | **New tables**: `escrow_transactions`, `escrow_events` — shell only |
| **Wallet** (three balances) (§11) | `financial_events` is per-business, not marketplace | **New**: `wallet_balances` + ledger. Available / Pending escrow / Withdrawable |
| **Delivery confirmation + dispute** (§7 of slice list) | `goods_receipts` covers receiving, not the two-party confirmation | **New**: `delivery_confirmations`, `marketplace_disputes` |
| **Trust metrics capture** (§15) | Counters on `supplier_profiles` | **New**: `supplier_trust_metrics` event capture. No composite score before there is data |
| **Saved products / suppliers** (§5) | — | **New**: small `marketplace_saved` table |
| **Purchasing-for context** (mockup top bar) | `useActiveBusiness` | Reuse — it is the active business, already in the shell |

---

## 3. Repositioning (§5) — rename and move, do not duplicate

| Today | Becomes | Note |
| --- | --- | --- |
| "What I sell" | **My Listings (Selling)** | Same page, same tables |
| "My storefront" | **My storefront** (kept) | Supplier business management |
| "Marketplace" | **Search Products** | Home takes the `/network` root |
| "Messages" | **Messages** (kept) | Gains context: supplier / product / quote / PO / delivery / dispute |
| "Connections" | **Saved Suppliers** + connection requests | Connect stays the bridge |

---

## 4. Decisions taken from this map

1. **One catalog.** Every new object references `canonical_products`. No second
   product identity anywhere.
2. **Quotes are the only genuinely new commercial primitive.** Everything
   downstream of Accept is existing procurement.
3. **Escrow and wallet get tables and states now, no money movement.** The
   provider decision gates the engine; the shell must not imply otherwise.
4. **The global sidebar stays.** Marketplace nav is injected as a section
   *inside* it, the way the mockup does — global items above, a
   `SUPPLIER NETWORK` group below.
5. **The mockup's brown (`#C7481F`) is not adopted.** Its layout, hierarchy and
   spacing are. Colour comes from the app's tokens.
6. **Two-plane boundary is unchanged.** No new object may join a public-plane
   read to a private table, directly or through a view.

---

## 5. Sequencing (from the brief, with the current state folded in)

| Slice | State |
| --- | --- |
| 1. Inspect + map | **this document** |
| 2. Global: scrollbars, typography/contrast, marketplace nav injection, resizable sidebar | in progress |
| 3. Restructure into Home / Search / Product Detail / Supplier Profile | next |
| 4. Supplier comparison + explainable ranking | pending |
| 5. Quotes → accept → `create_purchase_order` | pending — first new migration |
| 6. Escrow + wallet shell | pending |
| 7. Delivery confirmation + disputes | pending |
| 8. Trust metric capture | pending |

**Blocking everything:** migrations `0022`–`0028` need applying, and the map
above needs verifying against the live database once the connection is back.
