# Discovery Decision Log

## Change-control rule

A frozen contract changes only through:

1. a new versioned file;
2. `supersedes` / `superseded-by` metadata;
3. a decision-log entry naming changed rules and reason;
4. a README pointer update.

Pre-integration drafts may be replaced without installing the obsolete draft, but the package adjudication is recorded here.

## 2026-07-29 — R4 pre-integration adjudication

### Disposition

```text
INTEGRATE AFTER TARGETED AMENDMENTS
```

The pre-integration v0.1 documentation draft was not installed.

### Blocking amendments adopted in v0.2

- separate descriptive and normative authority;
- require Scope sections;
- use four-axis status blocks;
- mark authorized-module lists as scope boundaries, not work orders;
- restrict `SAME_FAMILY_OPTION` to one `WigStyle` parent;
- freeze candidate admission and assertion basis, not candidate source forever;
- make image/content/behavior arms independently gated;
- preserve health-adjacent sensitivity through canonical IDs;
- require exposure ID, component versions, candidate fingerprint, and outcome join key;
- require actual-HEAD/staleness verification during installation;
- use branch/PR integration by default.

### Item-to-item invariants

- behavior data is not required for cold start;
- one universal similarity relation is rejected;
- every candidate source passes one admission/evidence choke point;
- assertion-bearing relations require governed positive basis;
- behavior may rerank safe candidates and may later generate non-assertive candidates after gates;
- force-filling sparse modules is rejected;
- activation is per relation purpose × product scope;
- clicks are not similarity truth without exposure/confound treatment.

### Current provisional relation purposes

- `SAME_FAMILY_OPTION` — one `WigStyle` parent only;
- `SIMILAR_STYLE`;
- `SIMILAR_CONSTRUCTION`;
- `COMMERCIAL_ALTERNATIVE`;
- `COMPARE_WITH`;
- `MANUFACTURING_NEARBY` reserved in prose, absent from active enum.

Purpose semantics freeze; serialized labels are versioned/additive and freeze on first emission.

### Visual boundary

- strand-level rendering is separate/deferred;
- generic product preview is catalog/commerce presentation;
- customer-photo fitting is private and not catalog evidence;
- catalog image similarity and visual search are discovery arms with separate gates.

### Current evidence verdict

- no representative catalog exists in safe B0 sources;
- demo data is test-only;
- production item-to-item, semantic ranking, visual search, and personalization remain disabled.

### Product/legal/privacy decisions deferred

- current audience values;
- vendor attestation and authenticity claims;
- market medical/certification authority;
- comfort/naturalness wording;
- UNKNOWN presentation;
- non-shippable visibility;
- conflicting-evidence commerce handling;
- health-adjacent event fields/collection, raw query retention, identifier linkage, and cross-market pooling.

### Sellability dependencies

- cart style/variant coherence;
- price/publication admission;
- exact variant landing;
- live market/shipping eligibility;
- durable suppression authority.

### Next authorized sequence

- documentation integration only;
- D4 provisional owner/module design;
- D5 source-only parser/decision slice and first vocabulary freeze;
- D6 deterministic test/structured retrieval vertical slice;
- representative catalog intake before production similarity.

## 2026-07-30 — D5 source-vocabulary v0.1 freeze

### Reviewed implementation

- pull request: #3;
- reviewed source head:
  `0e6b3cc7780d73b33302ab00df9e3a49490e2502`;
- main merge:
  `d41542612ff4f730fcd938604a3fc7abd69e5e1c`;
- reviewed discovery scope: six discovery test files and 84 discovery tests;
- full repository verification at reviewed head: 182 test files and 4,787
  tests passed.

### Frozen source vocabulary

- normalizer: `d5-conservative-normalizer/v0.1`;
- parser: `d5-injected-span-parser/v0.1`;
- constraint rules: `d5-constraint-decisions/v0.1`;
- request schema remains provisional:
  `d5-source-only-request/v0.2-provisional`;
- golden fixture remains fixture-only and provisional:
  `d5-golden-cases/v0.2-provisional`.

The durable `DiscoveryReasonCode` vocabulary is frozen at these twelve codes:

- `EXACT_IDENTITY_MATCH`;
- `EXACT_IDENTITY_NO_SUBSTITUTION`;
- `EVIDENCE_QUALIFIED_MATCH`;
- `EVIDENCE_QUALIFIED_MISMATCH`;
- `PRODUCT_EVIDENCE_UNKNOWN`;
- `PRODUCT_EVIDENCE_CONFLICT`;
- `CLAIM_AUTHORITY_UNAVAILABLE_ROUTE`;
- `UNSUPPORTED_CONCEPT`;
- `CONTRADICTORY_QUERY`;
- `CONFIRMATION_CHANGED_INTENT_ONLY`;
- `AUDIENCE_NAMESPACE_PRESERVED`;
- `MODEL_INFERRED_CLAIM_HAS_NO_AUTHORITY`.

### Removed vocabulary

The following four unexercised literals were removed:

- `AttributeBand.STRUCTURAL_FUNCTIONAL`;
- `AttributeBand.DIMENSIONAL_CATEGORICAL`;
- `SpeechRequirement.DISCLOSE_RELAXATION`;
- `RelaxationDecision.DISCLOSED_AUTOMATIC`.

### Authority and next sequence

The freeze is source-only. It authorizes no production catalog evidence,
events, routes, retrieval, recommendation, commerce behavior, or production
activation.

The next planned sequence is a D6 source-only deterministic retrieval vertical
slice, subject to a separate task authorization. This freeze-installation task
does not authorize or implement D6.

## 2026-07-30 — D6-A0 exact vertical-slice contract

### Baseline and evidence

- observed main baseline:
  `2cbdfe3af7e333c28da66ebb588984a4428089ec`;
- immutable reconnaissance evidence:
  `WIG-COM-DSC-R7-COD-D6-A0-v0.1`;
- relevant catalog, route, cart, checkout, fitting, admin-price, schema, and
  market paths have no source changes from the B0 observed commit to this
  baseline;
- B0 database population counts remain historical evidence and were not
  refreshed.

### Exact source-only slice

- `WigVariant` is the exact result unit and carries its canonical `WigStyle`
  parent;
- D6-A1 scope is exactly one canonical `SKU` identity constraint;
- the candidate source, catalog identity proof, and eligibility summary are
  injected synthetic fixtures;
- every candidate must pass one pure admission choke point;
- any displayed price uses the selected variant amount, never a style minimum;
- landing preserves the exact style/variant pair and rejects mismatch without
  rewrite, replacement, redirect, or repair;
- the existing cart style/variant identity blocker remains outside D6-A1;
- the event seam is injected, disabled by default, and performs no emission,
  collection, or storage;
- structured retrieval remains deferred to a separately contracted D6-A2
  task.

### Authorization

D6-A1 requires a separate explicit source task. This documentation decision
authorizes no source implementation, production adapter, route or UI work,
cart repair, event collection, or production activation.

## 2026-07-30 — D6-A1 source-vocabulary freeze

### Bound implementation

- D6-A1 source merge:
  `80c98ad54e9f3409c57fcf71a277db584242047e`;
- reviewed D6-A1 source head:
  `bb90e747b3bd0c052ba6cd33714ca8d54c5def5f`;
- freeze-preparation head:
  `872ad2fec669bd71d42c2362a32276489e44fa63`;
- freeze-preparation merge:
  `bb8f6e1e5d2a4c13f58c7daf60ed6333806f2d71`.

### Frozen source boundary

- `runExactSkuFixtureSlice` is the sole primary entrypoint;
- every matched candidate passes one mandatory admission choke point;
- `verifyExactLanding` is the one frozen durable supporting export;
- module export does not by itself establish a supported entrypoint;
- the seven D6-A1 module responsibilities are frozen, but the subtree is not
  permanently closed.

Exactly three component values are frozen:

- candidate source: `d6-exact-fixture-retriever/v0.1`;
- admission rules: `d6-exact-candidate-admission/v0.1`;
- landing contract: `d6-exact-landing/v0.1`.

Exactly two component values remain provisional:

- event schema: `d6-discovery-events/v0.1-provisional`;
- fixture snapshot: `d6-exact-retrieval-fixture/v0.1-provisional`.

The exact-SKU namespace, selected-variant price basis, reviewed result and
landing field sets, escaping run-result branch fields, request and admission
statuses/reasons, landing verification literals, fixture-failure reasons, and
injected event-delivery statuses are frozen at v0.1.

### Reused and provisional boundaries

D6-A1 reuses the frozen D5 values `EXACT_IDENTITY_MATCH`,
`EXACT_IDENTITY_NO_SUBSTITUTION`, and `EXACT_IDENTITY_NOT_FOUND` without
redefining them.

Fixture input types and values, the exact request input shape, event name and
payload schema, event-seam shape, helper names other than
`verifyExactLanding`, internal statuses/helpers, invariant text, and
accountability-key JSON encoding remain provisional. Exhaustive conformance
records for provisional shapes do not freeze them.

### Removed vocabulary

- `candidateSetFingerprint`;
- `DELIVERED_TO_IN_MEMORY_SINK`;
- `D5_EXACT_DECISION_REJECTED`;
- `admission-level LANDING_INTEGRITY_MISMATCH`;
- `ExactAdmissionResult.landingVerification`;
- `EligibilitySummaryFixture.version`;
- `EligibilitySummaryFixture.reason`;
- `EligibilitySummaryFixture.fulfillmentClass`.

### Authority and next sequence

This docs-only freeze grants no production catalog, sellability, orderability,
adapter, route, UI, cart, checkout, payment, event collection, or activation
authority.

D6-A completes only when this contract, README pointer, and decision-log entry
merge. D6-B requires a separate versioned contract and explicit work order.

## 2026-07-30 — D6-B0 structured retrieval gate

### Baseline and evidence

- observed main baseline:
  `85d0b49b5e3eec3af6a604caaf3580c07d76a281`;
- immutable current-repository evidence:
  `WIG-COM-DSC-R11-COD-D6-B0-v0.1`;
- the older catalog census remains historical and was not used as current
  database population evidence.

### Governed structured retrieval

- D6-B is structured relational retrieval, separate from exact identity,
  free-text search, ranking, recommendation, and production catalog
  integration;
- the candidate unit is `WigVariant` with an explicit canonical `WigStyle`
  parent and selected-variant price basis;
- all candidates pass one structured admission choke point;
- D6-B preserves per-constraint gate, score, partition, speech, relaxation,
  route, reason, and evidence semantics without a weighted scalar;
- D6-A remains exact-only; exact-plus-structured composition is deferred;
- the first provisional attributes are generic governed color-family and
  texture-family concepts; exact ontology IDs are deferred to D5-S1, and
  evidence remains variant-scoped and storage-neutral;
- a versioned Stage-0 authority-universe scope/proof gates participation before
  enumeration, while candidate-specific commerce eligibility is independently
  mandatory inside admission; neither input substitutes for the other;
- cap/base/lace, attachment, fulfillment, and lead time are conceptually
  structural/functional even where their evidence and commerce admission facts
  remain externally owned; stock is eligibility, and this contract does not
  assign price a final conceptual band;
- numeric length, claims, category/tag assertion, ranking, relaxation, events,
  and production adapters remain deferred.

### Blocking dependency and sequence

Adversarial reconnaissance confirmed that D5-S1 is required for categorical
D6-B1. Current D5 source rejects query-level categorical constraints and
permits fixture-product categorical evidence only through the claim-bearing
material profile. D6-B cannot bypass that boundary without inventing policy
locally. Current continuous fixture tolerance does not justify query-level
continuous policy before the categorical-only B1 slice.

The authorized sequence is:

```text
D5-S1 categorical policy extension and vocabulary freeze
→ D6-B1 unranked categorical fixture slice and freeze
→ measurement method/unit/evidence/tolerance governance
→ D5-S2 continuous query policy
→ D6-B2 governed numeric length fixture retrieval
→ D6-B3 exact-plus-structured composition
→ D6-C production governed adapters
```

This documentation decision authorizes no D5-S1 or D6-B source work, schema or
catalog change, event collection, commerce integration, or production
activation.

## 2026-07-30 — D5-S1 categorical policy gate

### Baseline and evidence

- observed main baseline:
  `32b8cd7aef2c6f6302ee835e154ec3b6a3b559cb`;
- immutable source reconnaissance:
  `WIG-COM-DSC-R14-COD-D5-S1-A0-v0.1`;
- all sixteen supplied human rulings were confirmed or refined against current
  source and contracts;
- the later C1 adjudication narrowed request-local policy binding, product
  preference scope, route authority, product evidence validity, and the
  whole-request B1 predicate without changing the selected representation.

### Representation decision

D5-S1 preserves the frozen eleven-field `ConstraintDecision` shape and adds the
provisional query gate `REQUIRE_MATCH` in a later, separately authorized source
task.

- `QUERY + REQUIRE_MATCH` means a future candidate must receive an
  evidence-qualified satisfying product decision;
- `FIXTURE_PRODUCT + ASSERT_MATCH + ASSERTED` remains the product assertion;
- query-level `ASSERT_MATCH`, a new required/preference output field, and a
  parallel structured-constraint plan are rejected.

This is the smallest representation that keeps required query intent separate
from product evidence while preserving D6-A exact behavior.

### Categorical policy boundary

- S1 is limited to `DECLARED`, governed, non-claim `STYLISTIC`
  `CATEGORICAL` constraints with a dedicated provisional profile;
- required/preference behavior comes from exactly one injected, versioned
  categorical policy bound to one request-local interpreted-constraint target
  plus matching governed attribute identity, not interpretation state;
- request-local constraint identity is not a durable global key, policy is not
  a global attribute default, and sibling constraints cannot reuse policy by
  attribute alone;
- dispositions are `REQUIRED`, `PREFERENCE`, `ROUTE`, `CLARIFICATION`, and
  `UNSUPPORTED`;
- D6-B1 may consume a request only when every constraint is eligible
  `REQUIRED + REQUIRE_MATCH`; any non-required or out-of-scope sibling stops
  the whole request before enumeration without silently dropping a decision;
- query preference remains non-gating, while fixture-product preference
  evaluation is deferred to a future preference/ranking contract;
- route means outside active discovery authority, uses
  `OUTSIDE_DISCOVERY_AUTHORITY` plus `EDUCATION_OR_CONSULTATION`, and does not
  reuse the claim-specific route reason;
- clarification and unsupported also stop before candidate enumeration;
- only verified/measured and human-curated-from-evidence stylistic evidence may
  assert; vendor-attested, model-inferred, missing, conflicting, and unknown
  evidence may not;
- absent required-attribute evidence is `UNKNOWN`, same-attribute wrong-value
  evidence is `VIOLATING`, and explicitly wrong-attribute evidence plus
  categorical `NOT_REPRESENTABLE` are invalid S1 fixture inputs;
- `REQUIRE_MATCH` is legal only for `QUERY`;
- confirmation changes intent only and reuses
  `CONFIRMATION_CHANGED_INTENT_ONLY`;
- exact profile, fixture-policy, and new reason spellings remain provisional.

### Sequence and authority

The expected later source boundary is `types.ts`, `versions.ts`,
`decide-constraint.ts`, and discovery tests only. Constraint rules move to
`d5-constraint-decisions/v0.2-provisional` during implementation; parser and
normalizer remain v0.1. Promotion requires adversarial source review and a D5
source-vocabulary v0.2 contract superseding v0.1.

D5-S2 continuous query policy remains deferred until measurement governance.
This decision authorizes no D5-S1 source, D6-B source, existing-contract edit,
schema, catalog, route, UI, adapter, event, commerce, or production behavior.

## 2026-07-30 — D5 source-vocabulary v0.2 freeze

### Bound implementation

- D5-S1 source merge:
  `ad45704cc769951c645c97837b6922f5c4f2437d`;
- reviewed D5-S1 source head:
  `85c1069212e41f2104b590d9df11e51a037770bf`;
- D5 v0.2 source freeze-prep head:
  `a7c3522d14443c45b98c916d037c4ae0bea780c6`;
- D5 v0.2 source freeze-prep merge:
  `20ccceb0e8e98d2c8de3e7f87a867ce115a2792a`.

### Frozen additions

- decision profile: `GOVERNED_STYLISTIC_CATEGORICAL`;
- query-only required-intent gate: `REQUIRE_MATCH`;
- categorical policy dispositions:
  `REQUIRED`, `PREFERENCE`, `ROUTE`, `CLARIFICATION`, and `UNSUPPORTED`;
- categorical-policy reasons:
  `CATEGORICAL_REQUIRED_BY_POLICY`,
  `CATEGORICAL_PREFERENCE_BY_POLICY`,
  `CATEGORICAL_OUTSIDE_DISCOVERY_AUTHORITY_ROUTE`,
  `CATEGORICAL_CLARIFICATION_REQUIRED`, and
  `CATEGORICAL_UNSUPPORTED_BY_POLICY`;
- stylistic model reason:
  `MODEL_INFERRED_STYLISTIC_HAS_NO_ASSERTION_AUTHORITY`;
- constraint rules: `d5-constraint-decisions/v0.2`.

### Inherited and provisional boundaries

The eleven-field `ConstraintDecision` is unchanged, and all v0.1 durable
vocabulary is inherited without semantic change. Fixture carrier names, the
`CATEGORICAL_POLICY` discriminator, and the exact seven-field carrier shape
remain provisional and fixture-only. The request schema and golden fixture
remain `d5-source-only-request/v0.2-provisional` and
`d5-golden-cases/v0.2-provisional`. No production policy transport,
persistence, API, database schema, or adapter is frozen.

### Supersession and sequence

The v0.2 contract supersedes v0.1 as the current D5 source-vocabulary
authority. The v0.1 contract remains historical and unchanged. D5-S1 completes
only when this documentation freeze merges. D6-B1 is then the next possible
separately authorized source task; this record does not authorize it. D5-S2,
ranking, production ontology, adapters, events, commerce, and production work
remain deferred.

This documentation-only freeze grants no production authority.

## 2026-07-31 — D6-B1 source-vocabulary v0.1 freeze

### Bound implementation

- D6-B1 source implementation first commit:
  `844b258d75ecf58a1efd43583af9e6c1be9db686`;
- D6-B1 reviewed source/C1 head:
  `d79fffa3bb1198bbe92306ab456026e48b087c46`;
- D6-B1 source implementation merge:
  `ac032b524b6f15c366a580997e671b6cf4531b2e`;
- D6-B1 source freeze-preparation first commit:
  `d24daf7f185b134cedaa4e892f5090e69d97c124`;
- D6-B1 freeze-preparation reviewed C1/head:
  `bb2bf420c5bd6cc0b51f7001199d5acec7f57d31`;
- D6-B1 freeze-preparation merge/current baseline:
  `67256e901dc2dcb4eb0b2e75a73d6ba9dca17c73`.

### Frozen source boundary

- `runStructuredCategoricalFixtureSlice` is the sole primary entrypoint;
- `verifyStructuredLanding` is the one durable supporting entrypoint;
- all other helper exports remain provisional implementation surfaces;
- the nine reviewed module responsibilities are frozen: source vocabulary,
  component registry, whole-request planning, Stage-0 validation, scoped
  fixture enumeration, exact evidence evaluation, candidate admission,
  landing integrity, and sole end-to-end orchestration;
- duplicate governed attributes reject at both the request-plan and direct
  admission boundaries;
- a module export does not itself establish a supported entrypoint, and the
  nine-file subtree is not permanently closed.

### Frozen components and ordering

Exactly five component values are final:

- request plan: `d6-b1-structured-request-plan/v0.1`;
- Stage 0: `d6-b1-stage-0-authority-universe/v0.1`;
- candidate source:
  `d6-b1-categorical-fixture-candidate-source/v0.1`;
- admission rules: `d6-b1-structured-candidate-admission/v0.1`;
- landing contract: `d6-b1-structured-landing/v0.1`.

Exactly two component values remain provisional:

- retrieval fixture:
  `d6-b1-categorical-retrieval-fixture/v0.1-provisional`;
- eligibility fixture: `d6-b1-eligibility-fixture/v0.1-provisional`.

Canonical request, Stage-0, candidate-source, admission, and completed-result
ordering uses locale-independent UTF-16 code-unit lexical order.
`VARIANT_ID_THEN_STYLE_ID` records technical determinism, not ranking.

### Frozen result and failure vocabulary

- the whole request must contain one or two governed constraints and every
  constraint must satisfy the D5 `REQUIRED + REQUIRE_MATCH` predicate;
- Stage 0 validates caller context and exact variant/style membership before
  candidate access or enumeration;
- complete D5 query and product decisions remain visible;
- every enumerated candidate reaches one mandatory admission choke point;
- asserted, unknown, violating, withheld, and admission-rejected outcomes
  remain separate, with aggregate precedence
  `WITHHELD > VIOLATING > UNKNOWN > ASSERTED`;
- reviewed attribution, landing, candidate, admission, counts, completed, and
  escaping run-result field sets are frozen;
- reviewed request, Stage-0, candidate-source, evidence, admission, and
  landing statuses and reasons are frozen;
- evidence-selection statuses are `SELECTED`, `ABSENT`, and `REJECTED`;
- landing preserves exact selected variant, canonical style, amount, currency,
  and `SELECTED_VARIANT` price basis, and a mismatch is visible and never
  repaired;
- `ELIGIBILITY_VARIANT_MISMATCH` is removed and remains absent, while
  `CANDIDATE_SOURCE_ACCOUNTABILITY_INVALID` is frozen and present.

### Reused and provisional boundaries

D6-B1 reuses the D5 v0.2 governed categorical profile, required-query gate,
required policy disposition, product gate/partitions, categorical and evidence
reasons, model-inference non-assertion reason, confirmation semantics, and the
complete eleven-field `ConstraintDecision` without redefining them.

Fixture and request/admission input carriers, fixture IDs and ontology values,
snapshot contents, synthetic evidence references, amounts, currencies,
fixture reasons, helper exports other than `verifyStructuredLanding`, internal
flow types and helper names, and invariant error text remain provisional.
`INCOMPATIBLE_D5_QUERY_DECISION` and
`INCOMPATIBLE_D5_PRODUCT_DECISION` remain provisional compatibility
sentinels. Accountability field names and semantic inputs are frozen, while
their `JSON.stringify` encoding is provisional and is not a cryptographic
fingerprint.

### Authority and next sequence

This docs-only freeze grants no production catalog, ontology, eligibility,
sellability, database, schema, adapter, route, UI, API, cart, checkout,
payment, fulfillment, order, event, analytics, ranking, recommendation,
relaxation, composition, or activation authority.

D6-B1 completes only when this documentation pull request merges. The later
sequence of measurement method/unit/evidence/tolerance governance, D5-S2, and
D6-B2 remains separate and unauthorized. Exact-plus-structured composition
also remains separate and unauthorized.

## 2026-07-31 — Measurement-governance foundation v0.1

### Baseline and adjudication

- source baseline:
  `cb11341ca9ed9123c6a92c5eae3e25679da7fe6d`;
- accepted MG0 reconnaissance:
  `WIG-COM-DSC-R29-COD-MG0-RECON-v0.1`;
- binding human adjudication:
  `WIG-COM-DSC-R30-HUM-MG1-ADJUDICATION-v0.1`;
- contract type: documentation-only measurement-governance foundation;
- source correction before MG1: not required;
- physical method pilot before D5-S2 implementation: required.

### Frozen governance boundary

MG1 v0.1 separates and assigns authority for:

- measurand and measurement method;
- canonical unit and exact conversion;
- measurement result, measured quantity, uncertainty information, uncertainty
  basis, and decision interval;
- manufacturing/specification tolerance;
- D5-owned query relation and retrieval match interval;
- nominal-label evidence;
- presentation-owned display conversion and rounding;
- exact-variant product ownership and specimen context.

Measurement uncertainty, manufacturing tolerance, retrieval match interval,
nominal labels, and display rounding are not interchangeable. No owner may
silently take or default another owner's decision. D6 consumes D5 decisions and
does not invent measurement or query policy locally.

### First measurand and method family

The first governed measurand family is variant-scoped, zone-identified,
installed root-to-tip strand-path length under one versioned standardized
straightening method.

The reference-point family begins at an installed emergence/root reference and
ends at the physical strand tip along the strand path.

The method family is dry and conditioned, removes geometric slack or curl by a
governed light-tension straightening procedure, and does not intentionally
produce material fiber elongation. Method identity/version and query/evidence
method compatibility are required.

MG1 v0.1 does not validate or freeze the exact zone, root-reference
realization, statistic, sample count, repeat count, lot rule, tension/force,
conditioning procedure, instrument/resolution, or uncertainty procedure.

Nominal marketed length, natural-state strand path, standardized apparent
vertical drop, and multi-zone/distributional profiles remain separate
measurands.

### Unit, numeric, and uncertainty boundary

The first bounded length family uses positive safe-integer micrometres for
canonical comparison. The exact relationships are:

```text
1 inch = 25.4 millimetres exactly
1 centimetre = 10 millimetres exactly
1 millimetre = 1000 micrometres exactly
```

Initial source/display unit families are inch, centimetre, and millimetre.
Canonicalization occurs once through a measurement-owned registry, matching
uses canonical integers, and presentation-owned display rounding never feeds
matching.

Accepted decimal precision must permit exact conversion. Negative, zero,
non-finite, overflow, unsafe-integer, excess-precision, unsupported-unit, and
out-of-bound values fail visibly. The final physical upper bound remains
provisional.

A measurement result requires a measured value, uncertainty information and
basis, method/version, specimen context, and provenance. A conservative closed
decision interval is permitted only with stated derivation and any claimed
coverage/confidence semantics. Missing or ungoverned uncertainty cannot assert
in the first slice and never widens retrieval tolerance silently.

### Query and retrieval boundary

The first query relation is `APPROXIMATE_TARGET`. Plain `18 inch` is neither
exact physical equality nor nominal-label matching.

Minimum, maximum, closed/open ranges, and comparator or range syntax whose
semantics are not preserved must reject visibly or route to clarification in
the first D5-S2 slice.

The first inclusive closed-interval model is:

```text
evidence decision interval wholly inside query match interval -> ASSERTED
evidence decision interval wholly disjoint from query match interval -> VIOLATING
partial overlap, boundary ambiguity, missing/ungoverned uncertainty,
or method incompatibility -> UNKNOWN
```

Retrieval match deltas remain provisional, D5-owned, and separately versioned.
MG1 authorizes no ranking or automatic relaxation.

### Current source quarantine

The current `ContinuousConstraint`, direct `QueryUnitEntry` surface binding,
`MEASURED_QUANTITY`, `ContinuousTolerancePolicyFixture`,
`lowerDelta`/`upperDelta`, same-unit-only evaluation, and
`WigVariant.length` string remain provisional and non-authoritative.

The current synthetic tolerance reasons and diagnostic are not promoted.
Known parser hazards include negative-sign loss, decimal-comma partial parse,
range-endpoint collapse, comparator and approximation loss, multiple
unassociated quantities, and unsafe large finite values.

Current query-level continuous rejection remains in force. No current evidence
state alone establishes assertion-capable method-bound numeric length
evidence.

### Required downstream gates

MGP1 must select the exact physical method parameters using repeatability,
cross-texture, uncertainty, and customer-meaning evidence. It must compare at
least median, upper quantile, and maximum.

UR1 must separately install a bounded source-only unit registry with exact
conversion, precision/bounds validation, deterministic serialization, and
visible failure.

D5-S2 implementation requires merged MG1 v0.1, completed MGP1, reviewed UR1,
and a later MG1 version or method addendum freezing the selected method.

D6-B2 remains a later source-only, synthetic-fixture-only slice that consumes
frozen D5-S2 decisions without reinterpretation and does not change D6-B1.

### Authority and deferrals

This documentation-only foundation grants no source, test, database, schema,
catalog, ontology, adapter, route, UI, API, event, analytics, ranking,
relaxation, composition, commerce, or production authority.

`WigVariant.length` remains presentation/demo-only. Production storage,
catalog migration/backfill, evidence adapters, thresholds, coverage, and
activation remain deferred.

Any later change to frozen MG1 semantics requires a new versioned contract,
README authority-pointer update, and decision-log entry. Changes to frozen D5,
D6, or constraint-hardness semantics require those contracts' own change
control rather than an MG1 redefinition.

## 2026-07-31 — Manual item-relations foundation v0.1

### User decision and selected first slice

- The user confirmed that the launch catalog will contain at least three
  distinct styles.
- Physical product development remains in progress.
- The selected first item-to-item slice is a reusable, manually curated,
  pre-launch foundation.
- The relation unit is canonical `WigStyle → WigStyle`.
- Relations are directional and explicitly market-scoped, beginning with
  `KR`.
- Exactly `SIMILAR_STYLE` and `COMPARE_WITH` are authorized purposes.
- There is one row per directed source/target/market tuple, with purpose as
  one mutable classification on that row.
- Priority is manual editorial ordering and not an algorithmic relevance
  score.
- Authenticated admin IDs are preserved as immutable actor snapshots without
  requiring `User` foreign keys.
- Customer links land on the exact canonical target style PDP, where variant
  selection remains.
- Customer exposure requires a valid source style that exists, is globally
  active, and is active/published in the relation market.
- Target eligibility requires one same active variant carrying a price in the
  active market; separate active-variant and priced-variant witnesses are
  insufficient.

### Activation and non-authority

- The customer module has a separately inspectable, default-off activation
  boundary.
- This contract does not authorize production activation.
- `SAME_FAMILY_OPTION` remains derived from variants under one canonical style
  and is not persisted.
- `SIMILAR_CONSTRUCTION` and `COMMERCIAL_ALTERNATIVE` remain blocked.
- No D5 or D6 runtime integration is introduced.
- No event emission, collection, persistence, or analytics is authorized.
- No automatic candidate generation, image similarity, behavior reranking,
  personalization, launch-offer readiness, MTO, payment, shipping, or
  fulfillment work is authorized.
- Inactive draft relations may omit `internalRationale`.
- Active relations require a governed, Unicode-trimmed, nonblank
  `internalRationale`, and active purpose or rationale updates revalidate that
  rule.

### Later re-entry gates and next task

- Deterministic content generation waits for real styles, governed stylistic
  coverage, and judged relation pairs.
- Governed image generation waits for image roles, rights, confound controls,
  and judged image pairs.
- Behavior reranking waits for reliable exposures, positions, candidate sets,
  purpose-specific support, deterministic control, privacy approval, and
  rollback.
- Personalization waits for repeat usage, privacy and retention governance,
  evaluation support, and protected-alternative tests.
- Catalog count alone does not authorize any automatic arm.
- The exact next task after this contract merges is
  `M2M-S1 manual style relation persistence + admin curation + default-off PDP read`.

### M2M-S1 as-built, operations, and documentation standard

- [PR #19](https://github.com/DuckCow/mira-wig/pull/19) installed M2M-S1 on
  main at merge SHA
  `05be8faa3d79670102da431f14c9a3579e82bacb`.
- Source implementation and the C1 activation-boundary correction and C2 exact
  active-state correction are complete and reviewed. The reviewed source head
  is `d938e333d022d4593f66a9e096ec38cfdd3745c0`.
- Customer activation remains off. Both KR purpose keys remain blank and
  default-off, and no production relation data was seeded.
- The post-merge
  `manual-item-relations-source-status-v0.1.md` records installed source truth
  separately from the unchanged frozen
  `manual-item-relations-contract-v0.1.md`.
- A dormant operations runbook was installed for curation, future activation
  preparation, diagnostics, and rollback. It grants no activation authority.
- Medium and high-risk repository features now require a durable post-merge
  source-status/as-built record under the feature documentation standard.
- Default collaboration roles are: Fable for primary product planning, UX,
  customer journey, and operator workflow; ChatGPT for adjudication, contract
  drafting, bounded authorization, and review coordination; Codex for
  repository implementation, migrations, tests, validation, and draft PR
  preparation; and Opus for selective independent technical audit of
  high-risk work.
- Opus is a selective audit role, not the default source implementer.
- Added documentation:
  `docs/discovery/manual-item-relations-source-status-v0.1.md`,
  `docs/engineering/feature-documentation-standard-v0.1.md`,
  `docs/operations/README.md`, and
  `docs/operations/manual-item-relations-operations-v0.1.md`, with discovery
  README and decision-log cross-references.
- This documentation installation changes no source, test, schema, migration,
  dependency, environment value, relation data, activation, customer behavior,
  automatic recommendation, D5/D6 integration, event, reranking,
  personalization, commerce, fulfillment, or production behavior.

## 2026-07-31 — M2M-S3 Fable product/operations adjudication v0.1

### Audit disposition

- Review input:
  `WIG-COM-REC-R2-FAB-M2M-S3-POSTMERGE-PRODUCT-OPS-AUDIT REPORT v1`.
- Binding adjudication:
  `WIG-COM-REC-R3-HUM-M2M-S3-ADJUDICATION-v0.1`.
- Whole product model: `KEEP`.
- Dormant foundation: `SAFE TO RETAIN`.
- Customer activation remains off.
- No new versioned product contract is required by this adjudication.

### Source-verified resolutions and deferred patch

- F-10 is resolved by the current public read. It rechecks source global
  activity and exact-market publication, target global activity and
  exact-market publication, and one same active target variant carrying an
  exact-market price whenever customer candidates load. No F-10 read-path
  source patch is required.
- Public ordering is priority ascending followed by target style ID using the
  source-owned locale-independent UTF-16 code-unit comparator. Fable's
  tie-break uncertainty is closed.
- F-09 is accepted as a separately authorized, activation-blocking source
  patch. Before any customer gate is enabled, the KR relation-manager
  administrator surface must show a read-only
  `OFF / ON / INVALID CONFIGURATION` state for each purpose. This
  documentation task does not implement that indicator.

### Product and operations policy

- First customer activation is `SIMILAR_STYLE` only with customer label
  `비슷한 스타일`.
- The `COMPARE_WITH` customer gate remains off until a separately approved
  real comparison affordance or navigation-only customer copy exists.
- Active real-launch rationales must record at least two observable common
  attributes, at least one meaningful difference, and one sentence explaining
  the customer-exploration intent.
- A named reviewer other than the author must review purpose, rationale,
  representative images, target diagnostics, and exact landing before row
  activation for a real launch relation. Reviewer and date are operating
  evidence; no review-state database field is claimed.
- Event-triggered maintenance is the normative minimum: before customer
  activation; on retirement, unpublication, pricing/publication eligibility
  change, or material image/style change; before another purpose; and before
  automatic candidates.
- Arbitrary calendar and row/style-count thresholds remain planning signals,
  not normative requirements.
- `internalRationale` owns current editorial justification and must not be
  overloaded with dated state history.
- An ungoverned rejected-pair spreadsheet is rejected as negative training
  truth. A future automatic-candidate contract must govern negative meaning,
  market, purpose, review time, evidence, expiry/supersession, export, and
  label use.
- Inbound visibility, overview/filtering, broken-eligibility queues, bulk
  ordering, formal review state, history/version, provenance, negative
  evidence, and manual-plus-automatic combination remain later re-entry
  candidates. Read/UI work is not presumed to require a database migration.
- Media-role architecture planning may proceed independently. This clearance
  does not authorize media source changes, image similarity, automatic
  candidates, customer-private image access, or production activation.

### Installed documentation and non-authority

Added:

- `docs/product/README.md`;
- `docs/product/manual-item-relations-product-ops-adjudication-v0.1.md`; and
- `docs/operations/manual-item-relations-activation-template-v0.1.md`.

Modified:

- `docs/operations/manual-item-relations-operations-v0.1.md`;
- `docs/operations/README.md`; and
- `docs/discovery/decision-log.md`.

The runbook now contains the purpose-assignment rule, bounded rationale
template and Korean examples, independent review, event-triggered maintenance,
F-09 and F-10 dispositions, and the `SIMILAR_STYLE`-only first-activation
policy. The dormant activation template grants no authority until a completed,
reviewed, dated record is separately approved.

No source, test, schema, migration, dependency, environment value, relation
data, customer exposure, automatic recommendation, D5/D6 integration, image
similarity, event, reranking, personalization, commerce, fulfillment, or
production behavior was changed or activated.

## 2026-07-31 — Product-media architecture and design contract v0.1

- Fable M1 product-media planning completed;
- the 15-item docket received human adjudication;
- Product Media Contract v0.1 frozen as design authority;
- asset + assignment accepted with amendments;
- style and variant assignment subjects accepted;
- role, view, and presentation axes remain independent;
- lifecycle meanings are separated into review, availability, staleness, and
  approved use;
- rights and consent default-deny;
- supplier rights assumed mixed/unverified until evidence exists;
- launch variants are not assumed color-only;
- mannequin-led evidence core accepted;
- strict future style-publication and variant-checkout media floors accepted;
- base interior promoted to future sellability evidence;
- representative inheritance requires disclosure;
- generated media excluded from launch PDP evidence and future similarity;
- legacy `coverImageKey`/`imageKeys[]` are not semantic authority;
- source, schema, migration, backfill, customer-publication enforcement,
  checkout enforcement, embeddings, training, and similarity remain
  unauthorized;
- independent Opus technical architecture audit is the next gate.

## 2026-07-31 — Product Media Contract v0.2 documentation conformance

- Product Media Contract v0.2 survived independent T7 adversarial audit with
  textual amendments;
- all four T7 documentation-install blockers were remediated;
- production-grade foundation and deferred-capability re-entry rules are
  retained;
- the Deployment Qualification Annex remains governed and UNPOPULATED;
- Live Boundary Defect Register v0.2 owns LBD-01 through LBD-07;
- no risk acceptance was granted for those defects;
- no known external Product Truth Authority exists;
- a bounded internal Catalog Product Specification authority is required after
  reviewed documentation install; and
- no technical source, schema, migration, storage provider, deployment
  mechanism, legacy migration, customer enforcement, or machine-use authority
  was granted.

## 2026-08-04 — Catalog Product Specification and C1 semantic foundation

### Disposition

```text
INSTALL BOUNDED DESIGN AUTHORITY
SOURCE / SCHEMA / MIGRATION / CUSTOMER ACTIVATION NOT AUTHORIZED
```

### Authority decision

- no known external Product Truth Authority currently exists;
- the project owner remains final Product Specification decision owner;
- delegated approval must be enforceable and distinct from generic `ADMIN` before source work;
- approved-and-effective Product Specification truth alone may advance a Product Truth Reference;
- Candidate A product truth is global with respect to market; publication, price, availability, lead time and fulfilment remain Commerce-owned.

### Domain boundaries

- `WigStyle` remains merchandising family and `WigVariant` current finite-SKU identity;
- `TechnicalModelVersion` is a separate versioned technical interpretation identity;
- unevaluated base/cap sameness fails closed to a distinct Technical Model;
- Hair Geometry Profile length/curl are product-shape classifications, not measured-length evidence;
- hair material/fiber authenticity requires governed evidence and explicit classification;
- immutable `ConfigurationRevision` owns product intent only; fit/body truth, ViewState, commerce facts, Build Spec, manufacturing and shipping state remain outside it;
- rendering may compose Revision + fit/default input + ViewState without transferring fit authority into the Revision;
- render and production are sibling derivations; C1 persists neither projection.

### Current-source preservation and recorded debts

- current free-form `WigVariant.color/length/curl`, legacy `WigVariant.price`, line snapshots, ManufacturingRequest, media keys and D5/D6 fixtures are not promoted;
- current finite-SKU C0 checkout/payment/order invariants remain authoritative;
- MTO admission currently uses `stock` without MTO consumption; STOCKED allocation currently happens after capture; finalization reasserts parent identity rather than current publication/price;
- the Product Media LBD register still lists LBD-06/LBD-07 as open despite C0 source closure; reconciliation is a separate docs task.

### Candidate A gate

Candidate A remains blocked until governed launch facts, exact TMV/PSV/profile compatibility, scope-bounded canonicalization/equality, externally enforced immutability, a real fail-closed consumer, exact source mapping, separate source authorization and independent review exist. No customer configurator route may be added even default-off in Candidate A.

### Review and precedence closure

The installed contract incorporates accepted Opus technical/domain and Fable product/UX findings. `docs/handoff/mira_handoff_v37.md` was reviewed for Claude-review precedence; it is historical relative to current source, explicitly yields current facts to code, and grants no conflicting Product Specification/C1 authority. Local model-review reports remain review evidence rather than repository authority.
