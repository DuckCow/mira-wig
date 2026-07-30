# D6 Structured Retrieval Contract v0.1

## Status

```text
DESIGN:                 FROZEN (D6-B0 structured retrieval boundaries v0.1)
SOURCE IMPLEMENTATION:  NOT AUTHORIZED; blocked by the D5 structured-constraint policy dependency
PRODUCTION ACTIVATION:  NOT AUTHORIZED
CHANGE CONTROL:         supersedes: none | superseded-by: none
SOURCE BASELINE:        main 85d0b49b5e3eec3af6a604caaf3580c07d76a281
EVIDENCE SNAPSHOT:      WIG-COM-DSC-R11-COD-D6-B0-v0.1
```

This contract governs the design boundary for D6-B governed structured
attribute retrieval. It is not a source work order.

## Scope

This contract owns:

- structured-retrieval ownership boundaries and the variant candidate unit;
- the ordering and separation of Stage-0 authority-universe scoping and
  candidate-specific commerce eligibility;
- candidate-source and admission responsibilities;
- preservation of per-constraint partitions and decision dimensions;
- the categorical-only D5-S1 dependency required by D6-B1;
- the fixture-only D6-B1 target and the gates between later D6-B stages.

It does not authorize or define:

- D5 or D6 source implementation;
- continuous measurement, unit, evidence, or tolerance policy;
- production catalog or eligibility adapters;
- ranking, relaxation, or exact-plus-structured composition;
- routes, UI, commerce writes, events, or production activation.

## 1. Objective

D6-B will retrieve variant candidates from governed structured constraints
without allowing free-form demo fields, unverified claims, commerce state, or
constraint-policy guesses to become search authority.

D6-B is distinct from D6-A exact identity retrieval, free-text lexical or
semantic retrieval, ranking and recommendation, zero-result relaxation,
production catalog integration, and commerce admission.

## 2. Current repository reality

At the bound repository baseline:

- `WigVariant.color`, `length`, and `curl` are unconstrained strings;
- `WigStyle.tags` is an unconstrained string array;
- `WigStyle.category` is an enum whose values mix use context, merchandising,
  product class, and claim-adjacent language;
- committed seed values look controlled but are not a governed production
  ontology;
- the catalog lacks per-attribute provenance, evidence references, normalized
  color family, measured length convention, bangs, part, silhouette,
  material/authenticity evidence, cap/base/attachment facts, and claim
  substantiation;
- current D5 types can represent categorical and continuous constraints;
- current D5 decision source rejects query-level categorical and continuous
  constraints and allows fixture-product categorical decisions only for the
  claim-bearing material profile;
- D6-A is frozen as exact-only.

A populated field is evidence of software behavior, not product truth or
retrieval authority.

## 3. Ownership boundaries

### D5 / constraint-policy owner

Owns interpretation state; attribute band and decision profile; required
versus preference versus route/clarification effect; evidence authority;
per-product constraint decision; evidence partition; speech/disclosure
requirements; and relaxation permission.

### D6-B

Owns structured candidate-source invocation; candidate-source attribution and
accountability; one mandatory structured candidate-admission choke point;
deterministic aggregation without semantic loss; result partitioning and
empty-state reasons; variant/style identity preservation; source-only landing
intent; and a no-ranking result ordering contract where explicitly authorized.

D6-B must not infer constraint hardness from an attribute ID, parser state,
query wording, catalog field, or current recall.

### Commerce/catalog authorities

Publication, destination/shipping, price authority, stock/capacity,
orderability, checkout admission, fulfillment, and durable suppression remain
outside discovery. D6-B may consume a versioned injected eligibility summary
but does not recompute these facts.

## 4. Candidate unit and authority universe

The candidate unit is:

```text
WigVariant + explicit canonical WigStyle parent
```

Every result preserves:

```text
displayedVariantId
displayedStyleId
matched governed attributes
selected-variant price basis
candidate-source attribution
constraint decisions
eligibility attribution
landing integrity
```

Audience, market publication, destination/shipping, and durable safety/legal
authority define the universe before structured matching. Query text never
changes them.

D6-B consumes a versioned, injected Stage-0 authority-universe scope/proof
before candidate enumeration. Items excluded by that proof never enter
candidate-source membership, accountability, partitions, counts, ordering, or
exposure.

## 5. Candidate source and admission

The exact ordered boundary is:

1. caller context;
2. injected versioned Stage-0 authority-universe scope/proof;
3. candidate enumeration only within that scope;
4. structured evidence evaluation and D5 decisions;
5. one candidate-admission choke point, including mandatory
   candidate-specific commerce eligibility;
6. partitioned/asserted result formation;
7. exposure.

Candidate sources are replaceable, but every enumerated candidate enters the
one mandatory structured candidate-admission choke point.

A source may discover possible candidates. It may not declare a product an
asserted match.

Admission receives, at minimum:

- governed structured request/plan;
- candidate identity and canonical style parent;
- per-candidate per-attribute evidence;
- constraint-policy decisions from the authorized owner;
- injected candidate-specific commerce eligibility summary;
- all relevant component and snapshot versions.

No candidate bypasses admission before asserted results, ordering, exposure,
landing, or future ranking.

Candidate-specific commerce eligibility cannot substitute for Stage-0
authority-universe scoping. Discovery consumes and versions both injected
inputs but recomputes neither. This design does not freeze a separate runtime
module for either boundary.

## 6. Preserve per-constraint truth

D6-B retains each constraint decision and its:

```text
gate
score
partition
speech requirements
relaxation
fallback routes
reasons
evidence attribution
```

The logical partitions `ASSERTED`, `UNKNOWN`, `VIOLATING`, and `WITHHELD`
remain distinct and may not be collapsed into a weighted score.

A candidate enters the asserted match set only when the future constraint plan
and all required per-candidate decisions permit that assertion. Unknown,
violating, and withheld candidates never appear inside an asserted set as
though confirmed.

Preference-only constraints may affect a future explicitly authorized ranker,
but they cannot exclude a candidate or create an asserted fact by themselves.
Exact provisional aggregation type and field names are deferred to the first
source review.

## 7. No ranking or relaxation in D6-B1

```text
ranking: NONE
automatic relaxation: NONE
behavior learning: NONE
semantic similarity: NONE
```

Zero asserted results preserve the original structured constraints and expose
an inspectable empty/partitioned outcome.

Any future relaxation comes from the constraint-policy owner, changes one
eligible class at a time, remains disclosed and reversible, never relaxes
audience, market, shipping, identity, or claim-bearing contradictions, and
requires a separate contract and tests.

## 8. Attribute authority

### First target after the D5 dependency

The provisional first attributes are:

```text
governed color-family concept
governed texture-family concept
```

These are governed categorical ontology concepts, not direct aliases for
`WigVariant.color` and `WigVariant.curl`.

Exact ontology IDs are deferred. D5-S1 may assign provisional IDs under its
own review. Every evidence instance is variant-scoped and storage-neutral; the
concept names do not imply `WigStyle`, `WigVariant`, or Prisma ownership.

The first source slice accepts only one or two declared/user-selected
categorical stylistic constraints. Free-text derived preferences remain
deferred until the query-policy extension explicitly supports them.

### Deferred continuous length

Numeric hair length requires a measurement convention, canonical unit,
texture/measurement-method disclosure where material, measured evidence, and
a versioned tolerance policy. Current `short`, `medium`, and `long` strings do
not satisfy this contract.

### Excluded from D6-B1

- material, human/synthetic/blend, Remy, virgin, origin, grade;
- medical/certified/chemotherapy/hypoallergenic/safety claims;
- comfort, naturalness, breathability, sensitive-scalp outcomes;
- category and tags as asserted evidence;
- stock, which is candidate eligibility rather than a D6-B1 query attribute;
- fulfillment class and lead time, which are structural/functional concepts
  whose evidence and commerce admission facts may be commerce-owned;
- bangs, part, silhouette, cap/base, attachment, or fit until represented and
  governed;
- price, whose future customer-constraint policy is deferred and whose final
  conceptual band this contract does not assign.

Cap/base/lace construction and attachment are structural/functional
attributes. Their classification, and the structural/functional
classification of fulfillment and lead time, does not include any of them in
D6-B1 or transfer their evidence or admission authority to discovery.

## 9. Current blocking dependency: D5-S1

D6-B1 source is blocked until a separate versioned D5 structured-constraint
policy extension provides:

1. query-level decisions for governed categorical constraints;
2. an explicit policy-owned effect for required, preference, route,
   clarification, or unsupported use;
3. fixture-product decision support for non-claim stylistic categorical
   evidence;
4. attribute-band and decision-profile validation;
5. preserved claim-bearing restrictions;
6. stable per-product partitions, reasons, disclosure, and relaxation output;
7. compatibility and change-control tests;
8. a new D5 source-vocabulary contract.

D6-B may not create an equivalent local enum or heuristic to bypass this
dependency.

D5-S1 is categorical-only. It does not alter or freeze current D5 continuous
source semantics. The later numeric-length sequence is:

```text
measurement method, canonical unit, evidence, and tolerance governance
→ D5-S2 continuous query-policy extension
→ D6-B2 numeric length fixture retrieval
```

## 10. D6-B1 target after D5-S1

```text
source-only
synthetic fixture only
structured-only request
one or two DECLARED categorical stylistic constraints
variant candidate unit
one admission choke point
no ranking
no relaxation
no event collection
no Prisma/route/UI/cart/checkout integration
```

The candidate fixture must carry governed attribute evidence separately from
the current database strings.

The structured result must preserve canonical variant/style landing and
selected-variant price basis through an injected eligibility summary.

All source types, statuses, reasons, versions, and module names remain
provisional until B1 source review.

## 11. Composition with D6-A

Routing is explicit:

```text
exact identity only         → D6-A
structured constraints only → D6-B
exact + structured          → deferred composition contract
```

D6-B1 must reject or declare not applicable to mixed requests. It must not
ignore the structured constraints, turn exact identity into a soft
preference, widen exact lookup, run D6-A and silently filter afterward, or
choose a path based on whichever constraint appears first.

A future composition slice may validate structured constraints against the
exact candidate, but it requires a separate versioned contract.

## 12. Determinism and accountability

The fixture slice must be deterministic and immutable. Attribute and candidate
accountability includes, as applicable:

- structured request/plan version;
- parser, ontology, lexicon, and constraint-policy versions;
- candidate-source and admission versions;
- governed attribute-fixture snapshot;
- evidence references/states;
- eligibility snapshot/version;
- landing version.

No current time, randomness, global state, network, file storage, database, or
analytics provider is permitted.

## 13. Required source tests before B1 freeze review

At minimum:

- one declared color-family constraint;
- one declared texture-family constraint;
- two compatible constraints;
- two contradictory same-attribute constraints rejected before candidates;
- unsupported, outcome, authority, continuous, claim-bearing, exact, and mixed
  requests rejected or declared outside B1;
- asserted candidate, known mismatch, missing evidence, conflicting evidence,
  and duplicate evidence;
- candidate/style identity mismatch;
- Stage-0-excluded items never enter candidate membership, accountability,
  partitions, counts, or exposure;
- candidate-specific commerce eligibility is independently required inside
  admission and cannot replace Stage 0;
- missing/duplicate/stale eligibility summary;
- unrelated candidate/evidence membership and order independence;
- no candidate bypasses admission;
- zero asserted results with no relaxation;
- no ranking;
- deterministic output and immutable input;
- exact landing identity and selected-variant price basis;
- default-off event seam not called;
- prohibited dependency/import scans;
- all D5 and D6-A frozen source/tests unchanged.

## 14. Stop conditions

Stop before source implementation if it requires changing frozen D5 or D6-A
vocabulary without a new contract; local hard/soft-policy invention in D6;
direct use of free-form database fields as evidence; production catalog,
Prisma, route, UI, or cart access; claim-bearing first-slice attributes;
continuous length without measurement/tolerance governance; ranking or
automatic relaxation; mixed exact-plus-structured behavior; production event
collection; a new dependency; or schema/migration work.

## 15. Sequence

```text
D6-B0 reconnaissance and contract
→ D5-S1 categorical structured-constraint policy contract and source
→ D5-S1 source-vocabulary freeze
→ D6-B1 categorical stylistic fixture retrieval
→ D6-B1 source review and freeze
→ measurement method/unit/evidence/tolerance governance
→ D5-S2 continuous query-policy extension
→ D6-B2 numeric length fixture retrieval
→ D6-B3 exact-plus-structured composition
→ D6-C production governed catalog/eligibility adapter
```

No later stage is authorized by this contract.
