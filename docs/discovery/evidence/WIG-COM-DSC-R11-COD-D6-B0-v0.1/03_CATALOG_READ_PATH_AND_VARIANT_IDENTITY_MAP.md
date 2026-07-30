# Catalog read paths and variant-identity map

## Storefront catalog

| Path | Unit and behavior |
| --- | --- |
| `src/lib/catalog.ts:38-99` → `src/app/(shop)/styles/page.tsx:92-167` | Style listing. Requires active style and active style-market publication; optional enum category filter; free-text name substring or exact tag member; sort by style `sortOrder`; returns minimum market price across active variants, including a published style with no price as `null`. |
| `src/lib/catalog.ts:103-163` → `src/app/(shop)/styles/[id]/page.tsx:84-140` | Style detail. Requires active style, but does not re-check `WigStyleMarket`; returns active variants in SKU order. Each variant price is its selected market row or `null`; style base price is the minimum. |
| `src/app/(shop)/styles/[id]/variantUtils.ts:17-59` and `VariantSelector.tsx:209-280` | Client selects exact variant by `(color,length,curl)`. Initial selection is empty; no default variant. Cart and fitting receive selected `variant.id` plus the route style ID. |

The listing and detail publication rules are asymmetric: list checks active
style-market publication, while direct detail checks only style active state.
Missing variant-market price does not suppress the detail variant; it displays
as unavailable and blocks add-to-cart in the client.

## Admin catalog

| Path | Unit and behavior |
| --- | --- |
| `src/lib/admin-catalog-data.ts:19-37` → `src/app/admin/styles/page.tsx` | All styles, active first then sort order; variant count. |
| `src/lib/admin-catalog-data.ts:39-57` → `src/app/admin/styles/[id]/page.tsx` | Style detail and all variants ordered by SKU, including inactive variants. |
| `src/lib/admin-catalog-data.ts:59-83` | Style-market publication plus active variant market prices. |
| `src/lib/catalog-admin/market-price.ts:83-130` → admin market-price and gaps surfaces | Reads style variants, market prices, and style-market rows for administrative pricing/publication operations. It is a commerce/admin owner, not discovery evidence. |

Admin mutation validation also performs catalog reads before writes:

- style update/deactivation checks style identity
  (`src/lib/catalog-admin/index.ts:80-96`);
- variant creation validates the canonical parent style, while variant update,
  stock update, and deactivation validate variant identity
  (`src/lib/catalog-admin/index.ts:101-172`);
- market-price mutation validates variant identity, and publication mutation
  validates style identity then reads active variants and market-price
  membership for warnings (`src/lib/catalog-admin/market-price.ts:45-105`).

These are mutation-validation reads, not presentation reads or D6 evidence
authority.

## Fitting presentation and initiation

- Fitting initiation is variant-level. `checkVariantForMarket` verifies
  variant active and
  style-market active, then supplies variant ID and SKU to the provider
  (`src/lib/fitting/db.ts:28-70`). It does not check variant-market price,
  stock, or style active.
- Fitting-result presentation directly reads the fitting's variant
  `color`, `length`, and `curl` plus parent style ID/name, then renders those
  values and links back to the parent style
  (`src/app/fitting/[id]/page.tsx:81-128`). This is a presentation read, not
  governed discovery evidence.

## Wishlist, cart, checkout, completion, and order

- Wishlist has schema-only style identity and no current production read/write
  path. `WishlistItem` stores `wigStyleId`, not variant identity
  (`prisma/schema.prisma:239-249`).
- Cart stores both `wigStyleId` and `variantId`, but the schema has no compound
  relation proving the variant belongs to that style
  (`prisma/schema.prisma:224-237`). `addToCart` validates active variant,
  stock, and market price, but does not validate the supplied style ID against
  the variant parent (`src/lib/cart.ts:104-141`). This is the existing
  incoherent-pair risk.
- Cart display reads the stored style relation independently from the variant
  relation and reads selected-market variant price
  (`src/lib/cart.ts:53-96`). It can therefore display a mismatched style parent
  if a bad pair was stored.
- Checkout page requires every cart line to have a price
  (`src/app/(shop)/checkout/page.tsx:57-68`). Payment session creation reloads
  variant facts, checks active/stock, reads selected-market price, and
  snapshots style name, color, hex, length, curl, image, and currency
  (`src/lib/payment/session/create.ts:93-190`). This is a checkout snapshot
  read and does not rely on the cart's separate style ID.
- Order completion copies session-line `variantId`, selected unit amount,
  fulfillment type, and snapshot; order reads render snapshot and financial
  values rather than current catalog price
  (`src/lib/payment/complete/transaction.ts:165-176`;
  `src/app/(shop)/orders/[id]/customer-order-detail-data.ts:29-66`).
- Completion conditionally mutates inventory for each `STOCKED` line with an
  atomic `stock >= quantity` predicate and decrement; failure becomes
  `STOCK_INSUFFICIENT` (`src/lib/payment/complete/transaction.ts:195-217`).
  This is a completion-time inventory mutation, not a catalog presentation
  read or a discovery candidate-source rule.

## Identity and price conclusions

The D6 structured candidate/result unit must be a `WigVariant` with an explicit
canonical `WigStyle` parent. Style-level retrieval alone cannot preserve
option identity. Displayed result price must be the selected variant's
market-qualified amount, never the listing's minimum. Publication, price,
stock, fitting availability, checkout admission, and orderability remain
distributed current owners and cannot be reconstructed inside D6-B.

This map distinguishes observed presentation reads, mutation-validation
reads, checkout snapshot reads, and inventory mutations. It does not claim
that every incidental catalog access outside the traced D6-B boundary is
exhaustively enumerated.
