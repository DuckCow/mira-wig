# Manual Item Relations Contract v0.1

## Status

```text
DESIGN:                 FROZEN (manual item relations v0.1)
SOURCE IMPLEMENTATION:  NOT AUTHORIZED
PRODUCTION ACTIVATION:  NOT AUTHORIZED
CHANGE CONTROL:         supersedes: none | superseded-by: none
SOURCE BASELINE:        main 4868f8dbac3df1be48f3fa7beae1d9428f5892a7
ADJUDICATION:            WIG-COM-REC-R0-HUM-M2M-S0-ADJUDICATION-v0.1
```

This documentation-only contract freezes the bounded pre-launch foundation
for manually curated, market-scoped, directional relations between canonical
`WigStyle` records.

It freezes design authority for a later source task. It does not implement or
authorize persistence, an admin surface, a customer surface, production
activation, automatic recommendation, or any other source behavior.

## 1. Scope and non-authority

This contract owns only:

- directional `WigStyle → WigStyle` manual relations;
- explicit per-relation market scope, beginning with `KR`;
- the `SIMILAR_STYLE` and `COMPARE_WITH` purposes;
- one relation row per directed source/target/market tuple;
- manually assigned editorial priority;
- immutable authenticated admin actor-ID snapshots;
- exact canonical target-style landing;
- a separately inspectable, default-off customer activation boundary.

This contract does not own or authorize:

- `SAME_FAMILY_OPTION` persistence;
- `SIMILAR_CONSTRUCTION`;
- `COMMERCIAL_ALTERNATIVE`;
- `MANUFACTURING_NEARBY`;
- variant-to-variant or mixed style/variant relation persistence;
- automatic candidate generation;
- D5 or D6 runtime integration;
- semantic similarity or image similarity;
- behavior reranking or behavior candidate generation;
- personalization;
- customer event emission, collection, persistence, or analytics;
- launch-offer or commercial-alternative readiness;
- final material, construction, fit, certification, or performance claims;
- MTO, lead-time, capacity, payment, shipping, fulfillment, or production
  activation;
- Prisma schema, migration, source, test, route, API, admin UI, or public PDP
  changes in this task.

The physical product remains under development. This contract deliberately
avoids depending on unresolved physical-product or commerce decisions.

## 2. Parent-contract relationship

[`item-to-item-rollout-contract-v0.2.md`](./item-to-item-rollout-contract-v0.2.md)
remains the parent authority for item-to-item purpose semantics, candidate
admission, assertion basis, rollout gates, behavior boundaries, and production
activation.

The parent contract left manual-relation persistence choices unresolved. This
contract makes those choices for one bounded manual first slice without
changing the parent's never-bypass admission or assertion-basis rules.

Where this contract is silent, the parent contract continues to govern. A
conflict requires a later versioned contract and decision record; it must not
be resolved by implementation convenience.

## 3. Relation unit, direction, and market

### 3.1 Canonical unit

The relation unit is:

```text
WigStyle → WigStyle
```

Both ends use canonical style identity. Variant selection remains within the
canonical target style PDP and is not relation persistence.

Rejected for v0.1:

- variant-to-variant relation rows;
- mixed style/variant relation rows;
- a persisted `SAME_FAMILY_OPTION` relation.

`SAME_FAMILY_OPTION` remains derived from variants that share one canonical
`WigStyle` parent.

### 3.2 Direction

Relations are directional. A relation from style A to style B does not imply a
relation from B to A. An editor who wants both directions must create and
curate two distinct rows.

### 3.3 Explicit market scope

Every relation belongs to exactly one market, beginning with `KR`.

- No relation is global.
- Market scope is explicit on the persisted row.
- A `KR` relation is not copied, inferred, or activated for `US`, `JP`, or any
  other market.
- Customer reads require exact equality between the relation market and the
  active market.

## 4. Purposes and assertion classes

Exactly two purposes are authorized:

```text
SIMILAR_STYLE
COMPARE_WITH
```

### `SIMILAR_STYLE`

A manually curated stylistic resemblance. Editorial review may consider
silhouette, color family, texture, fringe, part, or fullness.

Assertion class: stylistic resemblance that may degrade to preference under
the parent contract. It does not assert material, construction, fit,
certification, performance, or commercial substitutability.

### `COMPARE_WITH`

A non-assertive editorial statement that a pair may be useful to compare.

Assertion class: non-assertive comparison. It does not assert physical
equivalence, compatibility, or substitutability.

Not authorized:

- `SAME_FAMILY_OPTION` persistence, because same-family options remain derived
  from the shared canonical style parent;
- `SIMILAR_CONSTRUCTION`, until governed structural facts and evidence exist;
- `COMMERCIAL_ALTERNATIVE`, until offer and commerce readiness are governed;
- `MANUFACTURING_NEARBY`, which remains reserved and manufacturing-owned.

Purpose is one mutable classification on one relation row. It is not a reason
to duplicate the same directed source/target/market tuple.

## 5. Persistence semantics for the later source task

The later source task must implement the semantic equivalent of:

```text
enum WigStyleRelationPurpose {
  SIMILAR_STYLE
  COMPARE_WITH
}

model WigStyleRelation {
  id                   String
  sourceStyleId        String
  targetStyleId        String
  marketCode           String
  purpose              WigStyleRelationPurpose
  priority             Int
  isActive             Boolean
  internalRationale    String?
  createdByAdminUserId String
  updatedByAdminUserId String
  createdAt            DateTime
  updatedAt            DateTime
}
```

Required relationships:

```text
sourceStyle → WigStyle
targetStyle → WigStyle
market      → Market
```

The actor IDs are immutable authenticated admin-ID snapshots. They record the
authenticated actor at creation and last update and deliberately do not
require `User` foreign keys.

Inactive rows remain persisted. Hard delete is not required in v0.1.
Deactivation preserves editorial history and prevents ambiguity about whether
a tuple is new or previously curated.

### 5.1 One row per directed pair and market

For one tuple:

```text
sourceStyleId
targetStyleId
marketCode
```

there is at most one row, whether active or inactive.

The database must own a unique constraint over:

```text
(sourceStyleId, targetStyleId, marketCode)
```

Two rows for the same tuple under different purposes are forbidden. Changing
purpose updates the one existing row.

### 5.2 Priority and deterministic order

`priority` is a manually assigned, bounded integer. Lower values display
first.

The later source task must select and visibly enforce exact bounds that reject:

- negative values;
- unsafe integers;
- unreasonably large values.

The deterministic tie-break order is:

```text
priority ascending
then target style ID by locale-independent UTF-16 code-unit lexical order
```

Technical determinism must not use `.localeCompare()`. Manual priority is
editorial ordering, not an algorithmic relevance score.

### 5.3 Internal rationale

`internalRationale` is an admin-only editorial explanation.

- Nullable storage supports an inactive editorial draft.
- An inactive relation may exist without a rationale.
- Activation requires a governed Unicode-trimmed, nonblank, bounded rationale.
- Changing purpose on an active relation revalidates the active-state rationale
  rule.
- Updating rationale on an active relation may not leave it blank or invalid.
- When present, it is bounded and Unicode-trimmed.
- It is never customer copy.
- It must not enter the public read model.
- It must not assert unsupported material, construction, performance, medical,
  fit, or commercial claims.
- Exact length and control-character validation belongs to the bounded source
  contract and must follow repository admin-validation conventions.

## 6. Invariants and database requirements

The later source implementation must enforce:

```text
sourceStyleId != targetStyleId
```

at both:

- the action/runtime boundary;
- a migration-owned database `CHECK` constraint.

The migration must also own the directed source/target/market uniqueness
constraint.

Required indexes must support:

- source style + market + active state + purpose + priority reads;
- target-style lookup.

The source task must reject invalid writes visibly. It must not silently
repair, mirror, duplicate, globalize, or infer relations.

## 7. Authenticated admin operations

The first source slice must support an authenticated admin actor performing:

- list relations for one source style and market;
- create one relation;
- change purpose;
- change priority;
- change internal rationale;
- activate;
- deactivate.

Hard delete is not required.

Operation behavior is explicit:

- create may create an inactive draft without a rationale;
- activate must reject a missing, blank, or invalid rationale;
- changing purpose while active must revalidate the rationale rule;
- updating rationale while active may not leave it blank or invalid;
- deactivate preserves the rationale and editorial history.

No operation may silently supply a default rationale.

Admin target choices must:

- exclude the source style;
- exclude an already-related target for the selected market;
- use canonical style identity;
- show whether the target style is globally active;
- show whether the target is available in the selected market.

An admin may prepare an inactive relation before customer activation.
Preparation does not activate the public module.

## 8. Customer candidate gate

A future public read may return a target only when all of the following hold:

```text
relation is active
relation source equals the requested canonical source style
relation market exactly equals the active market

source style exists
source style is globally active
source style is active/published in the relation market

target style exists
target style is globally active
target style is active/published in the relation market
target style is not the source style

there exists at least one exact target variant such that:
  variant is active
  and that same variant has a market price in the active market
```

The public read must additionally preserve:

- the unique directed relation tuple;
- purpose-specific grouping;
- deterministic manual-priority ordering;
- exact canonical target-style identity.

It must not:

- require behavior data;
- invoke D5 or D6;
- infer relation purpose from free text;
- silently repair invalid relations;
- treat stock as v0.1 stylistic-relation truth;
- present the relation as a `COMMERCIAL_ALTERNATIVE`.

Separate active-variant and priced-variant witnesses do not satisfy the target
gate. An inactive priced variant cannot qualify, and an active unpriced variant
cannot qualify. Invalid source context hides the entire module; invalid or
stale target rows are omitted from customer results and remain visible to admin
diagnostics. Neither case may be silently repaired or substituted.

Stock remains outside the v0.1 stylistic-relation truth condition. This remains
a manual stylistic/editorial relation and not a `COMMERCIAL_ALTERNATIVE`
assertion.

## 9. Customer presentation and exact landing

The future PDP module must:

- render after the main product and variant decision area;
- group targets by purpose;
- use customer labels equivalent to:
  - `SIMILAR_STYLE` → `비슷한 스타일`;
  - `COMPARE_WITH` → `함께 비교해 보세요`;
- hide an empty purpose group;
- hide the entire module when no eligible relation remains;
- never force-fill candidates;
- link to the exact canonical target style PDP;
- leave variant choice on that target PDP;
- reuse the existing market-aware style card/read model where safe;
- display no `internalRationale`.

At most four targets per purpose may be customer-visible. A target may not
appear twice in the module.

Exact target-style landing is mandatory. A mismatch must be visible to the
owning diagnostics or validation path and must never be repaired by
substitution, redirect, or another style.

## 10. Ownership boundaries

### 10.1 D5 and D6

The first manual relation slice does not call D5 or D6 at runtime.

It inherits, without redefining, these D5-compatible invariants:

- missing evidence is not satisfying evidence;
- conflicting evidence cannot support an assertion;
- model inference is not a customer-facing product fact;
- claim-bearing or structural assertions require governed evidence.

A later automatic `SIMILAR_STYLE` source may consume governed stylistic
attributes and evidence only after its own contract and gate. A later
`SIMILAR_CONSTRUCTION` source requires separately governed structural facts
and evidence.

D5 does not own item-to-item candidate generation or ranking. This contract
does not integrate the manual relation with D5 or D6 production runtime.

### 10.2 Catalog

Catalog authority owns canonical style and variant identity, global style
activity, market publication, active variants, and price presence. Manual
relations do not create or repair catalog truth.

### 10.3 Commerce and product claims

Commerce authority continues to own offer, price, stock/capacity, shipping,
checkout admission, payment, fulfillment, and commercial substitutability.

Manual `SIMILAR_STYLE` and `COMPARE_WITH` relations do not establish those
facts or bypass their gates.

## 11. Default-off activation boundary

Admin curation may be implemented before launch. Customer exposure must be
controlled by a separately inspectable, default-off activation seam.

The first source implementation must not silently activate the module in any
environment, market, purpose, or catalog scope.

A later activation decision must explicitly record:

```text
market = KR
enabled purposes = SIMILAR_STYLE and/or COMPARE_WITH
catalog scope
```

Minimum activation evidence:

- at least three real launch styles;
- manually reviewed relations;
- valid exact target-style landing;
- market visibility checks;
- a priced active target variant;
- every exposed source style is globally active and `KR`-published;
- every exposed target has at least one same active variant carrying a `KR`
  price;
- every active relation has a valid nonblank `internalRationale`;
- no self relation;
- no duplicate directed source/target/market tuple;
- no unsupported customer claim;
- insufficient candidate sets hide instead of being padded;
- an operator can deactivate the module immediately.

Product and Merchandising own the activation decision under the parent
contract. Production activation remains unauthorized by this document.

## 12. Event boundary

No customer event emission, collection, persistence, or analytics is
authorized in the first persistence/admin/default-off-read slice.

An event seam may be designed only by a later, separately authorized task
under
[`testing-events-and-evaluation-contract-v0.2.md`](./testing-events-and-evaluation-contract-v0.2.md).

The parent contract's exposure-accountability requirements remain future
activation dependencies. They are not implemented or waived here.

## 13. Automatic-recommendation re-entry gates

No fixed catalog count alone authorizes an automatic arm.

### Manual item-to-item

Begins only after this contract merges and the separately authorized source
task begins.

### Deterministic content candidate generation

Reconsider only when real catalog styles and governed stylistic attributes
have sufficient coverage and judged relation pairs exist.

### Governed image candidate generation

Reconsider only after image roles, rights, model/background confound controls,
and judged image pairs exist.

### Behavior reranking

Reconsider only after reliable exposure records, displayed positions,
candidate sets, purpose-specific support, a deterministic control, privacy
approval, and rollback exist.

### Personalization

Reconsider only after sufficient repeat usage, privacy and retention
governance, evaluation support, and protected-alternative tests exist.

None of these later gates authorizes work in this task.

## 14. Product-development independence

This contract intentionally does not freeze:

- hair material;
- base construction;
- attachment;
- cap size;
- fit;
- lead time;
- MTO capacity;
- return policy;
- shipping promise.

The manual `SIMILAR_STYLE` and `COMPARE_WITH` foundation remains usable while
the physical product is still under development because neither purpose
asserts those facts.

## 15. Source implementation dependency

The exact next task after this contract merges is:

```text
M2M-S1 manual style relation persistence + admin curation + default-off PDP read
```

Subject to exact read-only reconnaissance, its expected source areas are:

- `prisma/schema.prisma`;
- one additive migration;
- admin catalog data, types, and actions;
- an admin style-detail relation section;
- the catalog public read model;
- a style-PDP related-style component;
- targeted behavioral tests.

M2M-S1 must remain one bounded vertical slice and preserve the default-off
customer boundary. It must not begin automatic recommendation, D5 or D6
production integration, customer events, behavior learning, personalization,
offer readiness, MTO, payment, shipping, or fulfillment work.

M2M-S1 must include tests for:

- missing source;
- globally inactive source;
- source with wrong-market or inactive-market publication;
- missing target;
- globally inactive target;
- target with wrong-market or inactive-market publication;
- an active variant with no market price plus an inactive priced variant,
  which must reject or be omitted;
- an active priced variant, which qualifies;
- an inactive draft with null rationale, which is allowed;
- activation with null or blank rationale, which is rejected;
- an active purpose change that revalidates the rationale;
- a public read that excludes `internalRationale`.

This contract's merge is a dependency, not source authorization. M2M-S1
requires its own explicit task-level authorization.

## 16. Change control

This contract has no predecessor and supersedes none.

Frozen semantics may not be renamed, removed, repurposed, broadened, or
activated in place. A change requires:

1. a later versioned manual-item-relations contract;
2. explicit `supersedes` and `superseded-by` metadata;
3. a decision-log entry naming the changed rule and reason;
4. a README authority-pointer update;
5. source compatibility or migration tests where applicable;
6. a separately authorized source task;
7. a separately recorded production-activation decision where customer
   exposure is involved.

Implementation convenience, catalog count alone, model agreement, or
pre-launch urgency does not change this frozen boundary.
