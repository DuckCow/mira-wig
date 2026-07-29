# WIG-COM-DSC-R7 — D6 Exact Retrieval Vertical-Slice Contract v0.1

## Status

```text
DESIGN:                 FROZEN (D6 exact source-only vertical slice v0.1)
SOURCE IMPLEMENTATION:  NOT AUTHORIZED by this documentation task; requires explicit D6-A1 task
PRODUCTION ACTIVATION:  NOT AUTHORIZED
CHANGE CONTROL:         supersedes: none | superseded-by: none
SOURCE BASELINE:        main 2cbdfe3af7e333c28da66ebb588984a4428089ec
```

This contract defines the smallest source-only D6 vertical slice. It does not
install or authorize the source implementation. New D6 serialized names remain
provisional through D6-A1 and freeze only through a later, separately reviewed
versioned contract.

## Scope

This contract owns only:

- selecting one exact SKU constraint from frozen D5 output;
- an injected synthetic exact-candidate source;
- exact candidate identity and provenance;
- one pure candidate-admission choke point;
- injected catalog identity proof and eligibility-summary fixtures;
- exact variant result construction;
- exact style/variant landing intent and integrity verification;
- a default-off, no-storage event seam;
- source-only tests and component-version attribution.

It does not own or authorize:

- production catalog truth or product evidence;
- production Prisma/catalog readers;
- market publication, destination, shipping, stock, capacity, price, checkout
  admission, or orderability rules;
- production request transport or search route;
- `/styles` replacement;
- PDP URL syntax or client preselection;
- cart identity repair or cart writes;
- checkout, payment, order, fitting, rendering, manufacturing, or admin writes;
- production lexicon, ontology assignments, claims, or localization;
- structured, semantic, image, behavior, recommendation, or personalized
  retrieval;
- event emission, collection, storage, retention, or learning;
- alternatives or substitutions after an exact miss.

## 1. Authority and inputs

### 1.1 D5 authority

D6 consumes frozen D5 values and behavior. It must not reinterpret raw query
text.

The exact slice accepts D5 outputs containing:

```text
ConstraintValue.kind = EXACT_IDENTITY
namespace = SKU
canonical exact identity value
```

It may call the frozen pure `decideConstraint` behavior against injected
fixture evidence. It does not rename or broaden D5 durable reasons.

### 1.2 Caller context

Market, locale, query language, and audience remain caller-provided context.
D6 does not call `cookies`, `headers`, routes, or market DB rows.

Query text never changes audience.

### 1.3 Injected fixture inputs

D6-A1 may receive plain immutable fixture values for:

- exact candidate source snapshot;
- catalog identity proof;
- option facts;
- eligibility summary;
- component versions;
- event sink configuration.

All fixture values must be visibly marked synthetic and fixture-only.

## 2. Exact-slice request applicability

The exact slice is applicable only when:

1. exactly one interpreted constraint is `EXACT_IDENTITY`;
2. its namespace is exactly `SKU`;
3. it is not contradicted or unresolved;
4. the canonical identity value is nonblank;
5. caller context is supplied.

Behavior:

- no exact identity → slice is not applicable;
- more than one exact identity → explicit invalid/unsupported request state;
- unsupported namespace → explicit unsupported exact-namespace state;
- no raw-text fallback parsing;
- no case folding, partial match, prefix match, fuzzy match, synonym,
  transliteration, or semantic expansion.

The exact serialized names for these new D6 status values remain provisional
through A1 and freeze only after its tests pass and a later freeze review is
installed.

## 3. Exact fixture candidate source

### 3.1 Candidate unit

One candidate represents one variant and carries:

```text
variantId
canonicalStyleId
SKU namespace and canonical value
candidate-source provenance
fixture snapshot/version
```

A style without an exact variant is not a candidate for this slice.

### 3.2 Lookup

Lookup uses exact canonical SKU equality.

The source returns:

- zero candidates when absent;
- exactly one candidate when present.

A fixture snapshot containing duplicate canonical SKU identities is invalid
and must fail before result construction. Input order may not affect output.

### 3.3 No substitution

An exact miss returns an explicit miss before any alternative concept. D6-A1
does not return sibling variants, styles, fuzzy hits, or commercially similar
items.

The D5 semantics remain:

```text
EXACT_IDENTITY_NO_SUBSTITUTION
EXACT_IDENTITY_NOT_FOUND
```

## 4. Catalog identity proof

The injected catalog proof is the authority for:

```text
variantId
canonicalStyleId
canonical SKU
option facts used by the result
```

The proof must correspond to the retrieved candidate.

Mismatch cases include:

- candidate variant ID differs;
- canonical style ID differs;
- SKU namespace/value differs;
- fixture or snapshot provenance differs where the contract requires equality.

A mismatch is not repaired. It produces a visible integrity failure and no
admitted result.

The provisional failure label may be:

```text
CANDIDATE_IDENTITY_INTEGRITY_MISMATCH
```

It is not a frozen durable D5 reason.

## 5. Eligibility-summary boundary

### 5.1 Ownership

D6-A1 receives an injected synthetic eligibility summary. It does not derive
eligibility from:

- `WigStyle.isActive`;
- `WigVariant.isActive`;
- `WigStyleMarket`;
- `VariantMarketPrice`;
- `stock`;
- `fulfillmentType`;
- static `MARKET_CONFIGS`;
- destination;
- shipping;
- cart or checkout logic.

Those facts belong to existing catalog/commerce owners and are not consolidated
today.

### 5.2 Required consistency

The summary must match:

```text
variantId
marketCode
summary version
```

and may carry:

```text
outcome
reason
selected-variant amount
currency
fulfillment class
```

Exact serialized names remain provisional.

### 5.3 Admission effect

Only a fixture summary explicitly stating an admissible outcome permits an
admitted result.

Missing, mismatched, unknown, or ineligible summaries return an explicit
non-admitted outcome. They never become orderability claims.

D6-A1 must not infer admission from publication or price alone.

## 6. Mandatory candidate-admission choke point

Every exact candidate passes one pure admission function before result
construction.

The choke point verifies, in order:

1. request applicability;
2. exact source provenance;
3. catalog identity proof consistency;
4. D5 exact-identity decision;
5. eligibility-summary identity and market consistency;
6. admissible fixture outcome;
7. selected-variant price basis where a price is displayed;
8. required result/landing identities are present.

No candidate bypasses this function.

The function returns independent fields rather than a weighted score. It may
include provisional D6 status/reason fields but must preserve D5 reason
semantics.

No ranking occurs. The admitted exact result count is at most one.

## 7. Exact result contract

A successful source-only exact result carries enough information to prove:

```text
displayedStyleId = catalogProof.canonicalStyleId
displayedVariantId = catalogProof.variantId
exact SKU = requested canonical SKU
displayed price basis = SELECTED_VARIANT
displayed amount/currency = injected eligibility summary
option facts = injected catalog proof
```

It also carries:

- candidate-source/fixture version;
- admission version;
- landing-contract version;
- D5 component versions required for attribution;
- match/admission reasons;
- disclosure requirements;
- a deterministic candidate-set fingerprint or equivalent provisional
  accountability value.

The result must not carry:

- style minimum price as the selected price;
- ungoverned claim facts;
- customer-private fitting data;
- raw query;
- user/account/session identity;
- cart or checkout mutation capability.

The exact new D6 result type and nested field names remain provisional until
A1 freeze review.

## 8. Landing intent and proof

D6-A1 constructs a pure landing intent, not a route.

It preserves:

```text
displayedStyleId
displayedVariantId
selected-variant price basis
exact identity provenance
fallback disclosure
component versions
```

A landing verifier receives the intent and injected catalog proof.

It must:

1. compare displayed variant to canonical variant;
2. compare displayed style to canonical parent;
3. compare exact SKU provenance when supplied;
4. preserve the exact selected variant;
5. return success or a visible integrity failure.

On mismatch it must not:

- rewrite the displayed style;
- replace the variant;
- redirect;
- select a sibling variant;
- use style minimum price;
- call cart;
- claim landing success.

The provisional visible failure label is:

```text
LANDING_INTEGRITY_MISMATCH
```

Route syntax, UI copy, and PDP state remain deferred.

## 9. Default-off event seam

D6-A1 may define a pure/injected event seam that is disabled by default.

Requirements:

- no network, DB, file, analytics SDK, queue, or outbox;
- disabled means the sink is not called;
- no raw query;
- no user/account/session ID;
- no health-adjacent intent fields;
- no fitting image, payment, or address data;
- event names and schema remain provisional because no production emission
  occurs;
- payload construction includes component versions and candidate
  accountability where tested;
- enabling collection is outside D6-A1 authority.

The seam must not make a no-op look like a successful production emission.

## 10. Provisional component versions

D6-A1 should begin with explicit provisional registry values equivalent to:

```text
candidate source: d6-exact-fixture-retriever/v0.1-provisional
admission rules: d6-exact-candidate-admission/v0.1-provisional
landing contract: d6-exact-landing/v0.1-provisional
event schema: d6-discovery-events/v0.1-provisional
fixture snapshot: d6-exact-retrieval-fixture/v0.1-provisional
```

Do not modify the frozen D5 component values.

The exact D6 registry type and names are reviewed at the end of A1 before any
freeze.

## 11. Planned source placement for D6-A1

A future explicit D6-A1 task may authorize only additive pure modules
equivalent to:

```text
src/lib/discovery/retrieval/types.ts
src/lib/discovery/retrieval/versions.ts
src/lib/discovery/retrieval/exact-fixture-retriever.ts
src/lib/discovery/retrieval/candidate-admission.ts
src/lib/discovery/retrieval/landing.ts
src/lib/discovery/retrieval/event-seam.ts
src/lib/discovery/retrieval/__tests__/fixtures/**
src/lib/discovery/retrieval/__tests__/**
```

These exact module and type names remain provisional. The current D5 boundary
test intentionally recognizes the reviewed five production files; A1 may
update that test only to permit and validate the additive retrieval subtree
while preserving the frozen D5 responsibilities and prohibited edges.

No `index.ts` barrel is authorized.

Allowed runtime imports:

- frozen D5 discovery types/functions;
- pure D6 retrieval modules;
- type-only market types if genuinely necessary.

Prohibited runtime imports:

```text
@prisma/client
@/lib/db
next/**
src/app/**
@/lib/catalog
@/lib/cart
@/lib/payment/**
@/lib/fitting/**
@/lib/storage/**
network/provider/analytics modules
test fixtures from production modules
```

## 12. Minimum A1 tests

The machine-readable matrix preserved in the D6-A0 evidence snapshot is the
minimum.

Required properties include:

- exact hit;
- exact miss with no substitute;
- duplicate fixture SKU rejection;
- unsupported namespace;
- multiple exact constraints rejected;
- canonical candidate/proof mismatch;
- market/summary mismatch;
- missing/unknown/ineligible summary;
- selected variant price versus lower sibling price;
- exact landing preservation;
- landing mismatch without repair;
- D5 exact reasons preserved;
- deterministic output and fingerprint;
- immutable inputs;
- default-off event sink not called;
- import-boundary enforcement;
- all existing D5 tests unchanged.

Retrieval golden data remains separate from parser/decision golden data.

## 13. Stop conditions for D6-A1

Stop and return for contract amendment if implementation requires:

- Prisma, DB, route, cookie, header, network, storage, or current-time access;
- a production catalog reader;
- deriving sellability from distributed current checks;
- changing a frozen D5 output field, literal, durable reason, or module
  responsibility;
- route/PDP/client integration;
- cart identity repair or mutation;
- production event collection;
- raw-query persistence;
- a production lexicon, ontology, evidence register, or claim authority;
- structured/fuzzy/semantic alternatives;
- a new dependency;
- schema or migration work;
- more than one candidate-admission path.

## 14. D6-A1 completion and freeze review

Passing tests permits only a source review.

At A1 completion:

1. compare actual new D6 statuses, result fields, versions, and module
   boundaries to this contract;
2. remove redundant or UI-presupposing vocabulary;
3. classify durable, fixture-only, internal, provisional, and removed symbols;
4. decide which D6 serialized fields/reasons are ready for v0.1 freeze;
5. install any normative freeze through a new versioned contract,
   decision-log entry, and README pointer;
6. keep production activation disabled.
