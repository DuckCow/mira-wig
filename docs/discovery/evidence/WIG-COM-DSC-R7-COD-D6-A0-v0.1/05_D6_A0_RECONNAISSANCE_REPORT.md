# WIG-COM-DSC-R7 — D6-A0 Repository Reconnaissance Report v0.1

## Status

```text
TASK CLASSIFICATION:       SOURCE_ONLY DOCUMENTATION / READ-ONLY RECONNAISSANCE
OBSERVED MAIN:             2cbdfe3af7e333c28da66ebb588984a4428089ec
OBSERVED DATE:             2026-07-30
PRODUCTION ACTIVATION:     NOT AUTHORIZED
SOURCE IMPLEMENTATION:     NOT AUTHORIZED BY THIS REPORT
DATABASE INSPECTION:       NOT PERFORMED
```

## 1. Current-source verdict

The first D6 implementation should not replace `/styles`, query Prisma,
preselect a live PDP variant, call cart, or derive sellability.

The smallest safe slice is:

```text
D5 exact SKU constraint
→ injected exact-candidate fixture source
→ injected catalog identity proof
→ injected eligibility-summary fixture
→ one mandatory candidate-admission function
→ exact variant result
→ exact style/variant landing intent and integrity proof
→ default-off event seam
```

All of this remains pure and source-only. D6-A1 still requires a separate
explicit task.

## 2. Current owners

### Query and decision

`src/lib/discovery/types.ts`, `parse-query.ts`, and `decide-constraint.ts` own
the frozen D5 exact-identity output and decision semantics. D6 consumes their
canonical values and does not reinterpret raw text.

### Market request context

- `src/lib/market/resolve.ts#getCurrentMarketCode` resolves the request market
  from cookie, geo header, and fallback.
- `src/lib/market/types.ts#MarketCode` owns the market type.
- Discovery consumes the resolved value; A1 does not read cookies or headers.

### Catalog identity

- `prisma/schema.prisma#WigVariant.sku` is unique.
- `prisma/schema.prisma#WigVariant.wigStyleId` is the canonical parent
  relation.
- Variant identity, option facts, activity, fulfillment, stock, and
  market-price relations are catalog/commerce data.
- `WigStyle` is a grouping and display parent, not the exact option result
  unit.

### Current listing and detail

- `src/lib/catalog.ts#getWigStyles` retrieves style rows and `toSummary`
  calculates a minimum active-variant market price.
- `buildWhere` searches style name and tags only.
- `src/components/features/StyleCard.tsx#StyleCard` links only to
  `/styles/{styleId}` and displays the minimum price with `~`.
- `src/lib/catalog.ts#getWigStyleById` returns active variants with
  market-specific price, but the route accepts style ID only.
- `src/app/(shop)/styles/[id]/VariantSelector.tsx#VariantSelector` starts with
  color, length, and curl all `null`.
- No inbound exact variant state exists.

### Cart and checkout

- `prisma/schema.prisma#CartItem` stores independent `wigStyleId` and
  `variantId`.
- `src/lib/cart.ts#addToCart` validates variant, price, and stock but does not
  prove the supplied style is the variant's canonical parent.
- `src/lib/cart.ts#fetchCartRows` reads the independently stored style for cart
  display.
- `src/lib/payment/session/create.ts#loadCartItems` ignores
  `CartItem.wigStyleId`; `toSnapshot` uses `variant.wigStyle`.
- Therefore an incoherent cart can present one style and checkout another.
- D6 must not repair or bypass this owner boundary.

### Eligibility

Current checks are distributed:

- listing: style-market publication;
- detail: style global activity and active variants, but not style-market
  publication;
- fitting: variant activity and style-market publication;
- cart: variant activity, market price, and stock;
- checkout: active market, shipping country, variant activity, stock, and
  market price;
- admin publication: may succeed while returning warnings for missing prices.

No consolidated, owner-approved read-only eligibility summary exists.

## 3. Source continuity and evidence limits

The named schema, catalog, listing/detail, cart, checkout, fitting,
admin-price, and market paths have no changes between B0 observed commit
`a963af6aea6c01c1ac4d2041d6140e664418f78b` and observed main
`2cbdfe3af7e333c28da66ebb588984a4428089ec`.

This does not make B0 database counts current. The historical B0 snapshot
described a committed demo population that was not representative. No database
was queried for D6-A0.

Current schema still lacks governed material, authenticity, measurements,
provenance, claim authority, image roles, and many structural attributes.
Free-form color, length, and curl remain authority-unknown.

D6-A1 therefore uses synthetic injected fixtures. It does not treat seed/demo
or a local database as product truth.

## 4. Binding decisions for the first exact slice

1. **Result unit:** `WigVariant`, with canonical `WigStyle` parent carried
   explicitly.
2. **Query class:** exactly one D5 `EXACT_IDENTITY` constraint in namespace
   `SKU`.
3. **Comparison:** exact canonical value equality; no case folding, fuzzy
   matching, or substitution after parsing.
4. **Candidate count:** zero or one; duplicate canonical SKU in the fixture
   snapshot is invalid fixture state.
5. **Candidate source:** injected synthetic fixture; no Prisma or production
   catalog reader.
6. **Admission:** one mandatory pure choke point consumes candidate, catalog
   proof, caller context, D5 decision, and injected eligibility summary.
7. **Eligibility:** supplied fixture authority; discovery does not recompute
   publication, price, stock, shipping, or orderability.
8. **Price basis:** selected variant only; never style minimum price.
9. **Landing:** preserves `displayedStyleId` and `displayedVariantId`;
   canonical-parent mismatch fails visibly and is never repaired.
10. **Fallback:** exact miss precedes any alternatives; A1 returns no
    substitute candidates.
11. **Events:** a default-off seam may be implemented; no event is emitted or
    collected.
12. **Privacy:** no raw query, user/session/account ID, fitting image, address,
    or payment data.
13. **Writes:** no cart, checkout, payment, catalog, fitting, route, UI, or
    schema writes.
14. **D5 compatibility:** frozen D5 modules, output fields, literals, and
    durable reasons are not renamed or broadened.

## 5. Decision adjudication

Decisions D6A0-01 through D6A0-11 are `CONFIRMED`.

D6A0-12 is `REFINED`: the additive retrieval subtree is compatible with the
D5 contract, but exact module/type names remain provisional. The current D5
boundary test recognizes exactly the reviewed five production files, so an
explicit A1 task must update that test to admit and constrain the subtree.

No decision is `REJECTED` or `UNRESOLVED`.

## 6. Deferred decisions

- production catalog/evidence adapter;
- consolidated commerce eligibility-summary owner and serialized contract;
- destination/shipping visibility;
- current cart style/variant repair;
- route syntax for variant preselection;
- PDP/UI implementation;
- governed structured retrieval for length/material/style;
- production lexicon/ontology;
- unknown-item presentation;
- media roles and rights;
- production event schema, retention, and collection;
- alternatives after exact miss.

## 7. Recommended sequence

```text
D6-A0  docs-only source reconnaissance + exact-slice contract
D6-A1  pure exact-SKU fixture retrieval/admission/landing/event-seam source slice
D6-A2  governed structured fixture path under a separate contract/task
D6-A3  owner-approved read-only adapters only after catalog/evidence/eligibility decisions
UI/route/cart integration only after variant landing and cart integrity owners are resolved
```

## 8. Immutability

This report and its sibling evidence files are immutable after merge. New
repository observations require a new evidence snapshot rather than edits in
place.
