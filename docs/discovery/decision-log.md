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

## 2026-08-04 — R2B strand-bundle and async-loader design freeze

### Baseline and evidence

- parent R1 pull request: `#29`;
- merged R1 baseline:
  `424f0dffd270d79f54f97bb9a4715fb27e9ef2b7`;
- read-only repository reconnaissance:
  `WIG-REN-WEB-R2-COD-R0-BUNDLE-RECON-v0.1`;
- current R1 source remains admin-only, visual-only, synchronous at the producer
  seam and independent of product, fitting, commerce and manufacturing
  authority.

### Frozen R2B decisions

- classify R2B as a medium feature under the Feature Documentation Standard;
- require this Design Contract before source implementation;
- serve exactly one committed synthetic bundle through an admin-protected route;
- require both `/admin/**` middleware coverage and route-local `requireAdmin()`;
- use one fixed little-endian binary buffer;
- encode exactly positions, strand offsets, widths, density ranks and importance
  ranks;
- reject generic buffer-view/accessor indirection for schema v1;
- decode directly into the existing validated `StrandAsset`;
- do not add `PackedStrandAsset` in R2B;
- preserve `importanceRank` without activating LOD behavior;
- use canonical JSON plus one LF and byte-for-byte normalized comparison;
- use SHA-256 only as payload-mismatch evidence, not authenticity;
- retain the R1 diagnostic limits and reject production-scale expansion;
- keep the active READY render until a replacement bundle and replacement
  backend complete first-render initialization;
- leave external storage, learned generation, Product Media, product mapping,
  customer exposure and production activation deferred.

### Rejected or deferred candidates

Rejected for R2B:

- public static fixture delivery;
- bundler-imported or bundler-emitted fixture delivery;
- an async wrapper without actual bytes;
- a duplicate packed model adapted back into objects;
- direct packed renderer conversion without profiling evidence.

Deferred:

- glTF/GLB or project-specific extensions;
- external storage/CDN/asset registry;
- production limits;
- importance-based LOD;
- learned-model output;
- customer or commerce integration.

### Authority

This decision and its Design Contract authorize documentation installation
only.

They do not authorize:

- source implementation;
- dependency or lockfile changes;
- storage/provider contact;
- Product Media or Product Specification changes;
- customer, fitting, commerce or manufacturing behavior;
- source activation.

The next gate is a separately reviewed R2B Implementation Task Contract.

## 2026-08-04 — R2B strand-bundle and async-loader source installation

### Reviewed source chain

- governing Design Contract merge:
  `972097cc8f6176c33ace69c5468a04aadf120fab`;
- implementation pull request:
  `#31`;
- reviewed implementation head:
  `084cb0b230fa7bdc9d6c35fb8eca1db72b13d16f`;
- main merge:
  `e63b7de793c765acd9c4ed9d6238389989660738`;
- final independent diff disposition:
  `PASS — READY TO COMMIT`;
- GitHub Actions CI run `#275`:
  success.

### Installed source boundary

R2B installs:

- a deterministic compiler for one synthetic visual-only strand fixture;
- a canonical JSON manifest and one fixed little-endian binary payload;
- route-local admin authorization and exact same-origin fixture delivery;
- bounded streamed loading, real cancellation and SHA-256 mismatch detection;
- decode into the existing validated `StrandAsset`;
- hidden candidate backend initialization and first-render promotion;
- one latest-user-intent ordering across reload and backend-mode operations;
- terminal teardown and stale-completion suppression;
- narrow production output tracing for the two fixture files.

### Reviewed corrections

Independent review required and source review closed:

- async viewport setup-failure containment;
- provisional versus committed backend mode ownership;
- terminal coordinator teardown and resurrection prevention;
- containment of rejecting stream cancellation;
- shared cross-operation reload/mode intent;
- full Unicode `Cc` strand-ID rejection;
- manifest encoder and decoder byte ceilings;
- security headers on `200`, `401`, `403` and `404`.

### Verification

At the reviewed source head:

- focused R2B suites:
  `5 files / 72 tests passed`;
- literal repository verification:
  `216 files / 5,332 tests passed`;
- typecheck, repository-wide lint and production build:
  passed;
- deterministic compiler `--check`:
  passed;
- refund build-context:
  unchanged and verified;
- package and lockfile:
  unchanged.

### Authority and activation

The installed source remains:

```text
SOURCE_ONLY
VISUAL_ONLY
ADMIN_DIAGNOSTIC_ONLY
NOT CUSTOMER-ACTIVATED
```

It grants no:

- customer route or navigation;
- persistence or external storage;
- learned inference or generation;
- Product Media assignment;
- product, variant, fit or order authority;
- commerce or manufacturing behavior;
- production-scale or LOD claim.

The next documentation gate is the R2B source-status/as-built record. Any R2C
scaling/LOD, learned-producer, external-asset, fitting or customer work requires
separate reviewed authority.

## 2026-08-04 — R2C-A render-runtime scaling measurement design freeze

### Parent source

- R2B source-status merge:
  `3cb1d48e95000759ac8259d7dd931a5dd097c9c7`;
- read-only reconnaissance:
  `WIG-REN-WEB-R2CA-COD-R0-SCALING-RECON-v0.1`;
- classification:
  `SOURCE_ONLY / EVIDENCE_COLLECTION`.

### Frozen experiment boundary

R2C-A will:

- use a dedicated admin-only performance surface;
- use a distinct validated `BENCHMARK_ONLY` input above canonical R2B limits;
- preserve the R2B route, fixture, manifest/binary schema and 96-strand
  canonical limit;
- measure aggregate owned CPU/wall-clock renderer stages;
- keep GPU timestamps and true-GPU-memory claims outside v0.1;
- retain results only in memory with explicit local JSON copy/download;
- add no telemetry, DB, external storage, product, fitting, commerce or
  manufacturing authority.

### Scale and sampling decisions

- automatic ladder:
  `72, 144, 288, 576, 1,152`;
- manual-only extension:
  `2,304, 4,608`;
- point-count axis:
  `3, 6, 8` at the highest common safe level not above `576`;
- initial sampling:
  `2 warm-ups + 7 measured`;
- initial p90:
  prohibited;
- decision-critical confirmation:
  `20 measured`, nearest-rank p90;
- lifecycle:
  `20 cycles at 72`, `5 at the highest admitted level`, with a separate
  operator action required for `20` high-level cycles.

### Safety decisions

- hard typed-array lower-bound cap:
  `64 MiB`;
- one synchronous owned stage:
  `1,000 ms`;
- candidate-to-logical-READY:
  `3,000 ms`;
- severe long task:
  `1,000 ms` when supported;
- whole run:
  `15 minutes`;
- fixed CSS viewport:
  `800 × 600`;
- existing DPR cap:
  retained at `2`;
- hidden-tab, viewport, drawing-buffer or DPR changes:
  invalidate the active sample/run.

These are diagnostic safety ceilings, not production budgets.

### Evidence threshold

An R2C-B architecture decision requires:

- two device classes including a lower-capability device;
- Chromium-family and Safari/WebKit evidence;
- actual backend recorded;
- paired counterbalanced backend sessions when comparing WebGPU and WebGL2;
- raw samples and stop records;
- a 20-sample confirmation for a decision-critical cell.

### Authority

This freeze authorizes documentation installation only.

It does not authorize:

- benchmark source implementation;
- R2B limit or fixture changes;
- LOD, packed rendering, workers or glTF;
- learned generation;
- persistence, telemetry or external storage;
- customer, product, fit, commerce or manufacturing behavior.

The next gate is a separately reviewed R2C-A Implementation Task Contract.

## 2026-08-08 — R2C-A network-boundary contract supersession v0.2

### Trigger evidence

Final browser verification of the R2C-A implementation observed:

```text
GET https://lh3.googleusercontent.com/...
```

Network attribution established:

- the request is initiated by the signed-in shared application frame/profile
  image;
- it occurs on the performance page while IDLE before benchmark start;
- it also occurs on `/styles` and `/admin/styles`;
- starting the benchmark introduced no new external request;
- no R2C-A source path owns or consumes the request;
- no unrelated application-shell source was changed.

Disposition:

```text
PRE-EXISTING SHARED APP REQUEST
```

### Contract correction

`render-runtime-scaling-measurement-design-contract-v0.2.md` supersedes v0.1.

The semantic correction is limited to network ownership:

- R2C-A-owned external requests remain prohibited;
- R2C-A telemetry, uploads and third-party asset fetches remain prohibited;
- same-origin guarded provenance actions remain allowed;
- the installed same-origin R2B control route remains allowed;
- a pre-existing shared application-shell external request does not by itself
  violate R2C-A when it is independently attributed, occurs without benchmark
  execution, is not consumed by R2C-A and was not introduced or modified by an
  authorized R2C-A path.

No authority is granted to the shared request. R2C-A may not depend on, modify,
suppress, proxy, cache or normalize it without separate review.

### Unchanged design authority

All other R2C-A v0.1 decisions remain unchanged, including:

- benchmark-only input separation;
- scale ladder and safety ceilings;
- User Timing stage semantics;
- no GPU-time or true-GPU-memory claim;
- provenance and result rules;
- no persistence or telemetry;
- no customer/product/fit/commerce/manufacturing activation;
- separate reviewed source-status and measurement-result gates.

This is a design-contract semantic version change, not source activation.

## 2026-08-09 — R2C-A scope reduction adjudication / Design Contract v0.3

### Disposition

```text
SUPERSEDE_WITH_MINIMAL_V0_3
```

A fresh read-only audit was performed after repeated independent review of the
uncommitted R2C-A source candidate.

The audit found that R2C-A only needs to answer which current application-owned
renderer stage first becomes materially limiting across a bounded synthetic
strand envelope, well enough to open a targeted R2C-B experiment.

The v0.2 decision-grade benchmark framework had become disproportionate to
that question. Remaining implementation risk was increasingly caused by
cross-run admission, installed-control evidence, lifecycle campaigns,
confirmatory statistics, comparability, optional browser probes and provenance
state machinery rather than by core renderer-stage measurement.

### v0.3 retained core

- admin-only explicit-start surface;
- immutable validated `BENCHMARK_ONLY` synthetic input;
- `72 / 144 / 288 / 576 / 1152` at six points per strand;
- AUTO + forced WEBGL2 with requested/actual backend separated;
- one warm-up + five measured samples per cell;
- raw samples plus count/median/minimum/maximum;
- truthful input/backend/geometry/render/teardown stage timing;
- fixed 800×600 viewport and DPR/drawing-buffer stability;
- 1,000 ms synchronous-stage and 3,000 ms logical-ready hard stops;
- 15-minute whole-session ceiling;
- per-sample final zero benchmark-owned resources;
- one guarded clean-source run-start provenance snapshot;
- one small versioned local JSON artifact;
- no persistence, telemetry, upload or benchmark-owned external traffic.

### v0.3 deferred or removed from mandatory R2C-A

- installed R2B transport control;
- 2,304 / 4,608 extension;
- mandatory 3 / 6 / 8 point axis;
- cross-run progressive-admission artifacts;
- cross-result comparability/fingerprint authority;
- two-device and Chromium+Safari completion gate;
- 20-sample confirmatory mode and p90;
- 20 / 5 / 20 lifecycle campaigns;
- Long Tasks and UA-specific memory;
- color, rotation, density-rebuild and mode-replacement timing;
- 64 MiB predictive admission;
- repeated page/start/end Git provenance matching;
- clipboard/download byte-identity proof.

Two-device, Chromium and Safari/WebKit evidence remain required before a later
prototype result is promoted into a durable R2C-B architecture choice.

### Current source disposition

The current uncommitted v0.4 R2C-A implementation remains protected evidence
only. It is not accepted as the v0.3 implementation and must not be committed
merely to preserve sunk work.

After reviewed v0.3 documentation merge, perform fresh read-only implementation
reconnaissance and classify each current R2C-A path as KEEP, SIMPLIFY, DELETE or
UNCHANGED_SUPPORT.

C5 corrections against Design Contract v0.2 are retired once v0.3 becomes
effective.

### Authority

This decision changes documentation authority only.

It does not:

- edit or authorize current R2C-A source;
- authorize decision-bearing high-load measurement;
- widen R2B limits;
- activate customer/product/fit/commerce/order/manufacturing behavior;
- select any R2C-B renderer or asset remedy.

## 2026-08-09 — R2C-A-S1 point/tessellation sensitivity freeze

### Parent evidence

```text
A1 source:
  5c3a072f74dc4114138ca9cf28c447b193c55369

A1 artifact SHA-256:
  e794c33ff922f81fa195dfb1ce91eb61f3e79e1abe8f9075193e35cc2e20bc78

A1 disposition:
  GEOMETRY_CREATE / DOMINANT_CPU_GEOMETRY_PREPARATION
```

### Frozen S1 scope

```text
strand counts:
  576 / 1152

points:
  3 / 6 / 8

requested backend:
  AUTO only

sampling:
  1 warm-up + 5 measured per cell
```

### Frozen causal boundary

Point count, Catmull-Rom work and longitudinal TubeGeometry tessellation vary
together:

```text
P3 → tubularSegments 6
P6 → tubularSegments 15
P8 → tubularSegments 21

radialSegments:
  4 fixed
```

S1 cannot independently attribute `GEOMETRY_CREATE` cost to control points,
Catmull-Rom work or longitudinal tessellation.

### Frozen engineering gates

```text
P3 sensitivity gate:
  G3 <= 0.75 × G6

P8 sensitivity gate:
  G8 >= 1.15 × G6
```

These are exploratory engineering decision gates, not statistical-significance
thresholds.

### Frozen dispositions

```text
COUPLED_POINT_TESSELLATION_SENSITIVE
  → CONTROL_POINT_VS_TESSELLATION_DECOUPLING

WEAK_COUPLED_COMPLEXITY_SENSITIVITY
  → PER_STRAND_FIXED_CONSTRUCTION_OVERHEAD

MIXED_OR_NONLINEAR
  → no remedy selection; smallest decoupling factorial follow-up first
```

### Authority

- Parent R2C-A v0.3 identity remains unchanged.
- S1 has distinct input, `r2ca-s1-synthetic-generator/v1` generator and
  `mira.render-lab.r2ca-s1-result` Result v1 identities.
- P3/P8 have no visual-fidelity authority.
- This decision does not authorize S1 source implementation.
- It does not authorize R2C-B implementation or a durable architecture.
- It does not authorize customer or product activation.

## 2026-08-10 — R2C-A-S1 primary Result-v1 evidence adjudication

### Result and custody identity

```text
source:
  7ec020fd74d29c044e3ff8c57a53d8a495ae035f

artifact:
  mira-r2ca-s1-v01-2026-08-10T05-05-41.133Z.json

bytes:
  73091

SHA-256:
  84b2d4cabded90d942ce27b933e0252fecc6f5ab32825ae85bc1b0ede82df737

outcome / stop:
  COMPLETE / NONE

canonical validation:
  PASS
```

Original and archival custody copies were byte-identical. The canonical
filename and SHA-256 are durable authority; local absolute custody paths are
not repository authority.

### Independent evidence adjudication

```text
evidence validity:
  VALID WITH BOUNDED EVIDENCE LIMITATION

limitation:
  IMPORTANT NON-BLOCKING METADATA DEFECT

actual browser evidence:
  Chrome/151.0.0.0

operator-declared browser major:
  140
```

Exact browser-major equality was not a frozen admission gate, the raw user
agent was retained, and all six cells ran in one stable session/backend. The
discrepancy does not invalidate the within-session P3/P6/P8 comparison, but the
run is Chrome 151 evidence and declared major 140 is not reliable version
provenance. The Result-v1 artifact is not retroactively edited.

Independent audit confirmed six cells in frozen order, one valid warm-up and
five valid measured samples per cell, 30/30 `VALID/NONE` measured samples,
AUTO requested and WEBGPU actual throughout, zero cleanup/final ownership,
78/78 recomputed metric summaries, and exact recomputation of all serialized
analysis fields.

### Frozen disposition and authority

```text
disposition:
  MIXED_OR_NONLINEAR

prototypeTarget:
  NONE

durable remedy:
  NOT SELECTED

R2C-B:
  NOT ACTIVATED
```

The evidence is threshold-proximate/unstable under the preregistered rules.
Neither point reduction nor tessellation reduction is selected. After reviewed
merge of the detailed Result Evidence / Adjudication record, the next allowable
work is a separately reviewed Design / Experiment Contract for the smallest
`CONTROL_POINT_VS_TESSELLATION_DECOUPLING` factorial experiment. This decision
does not design that experiment or activate R2C-B, customer or product paths.

## 2026-08-10 — R2C-A-S2 control-point/tessellation decoupling design freeze

### Governing completed S1 evidence

```text
source:
  7ec020fd74d29c044e3ff8c57a53d8a495ae035f

artifact SHA-256:
  84b2d4cabded90d942ce27b933e0252fecc6f5ab32825ae85bc1b0ede82df737

evidence validity:
  VALID WITH BOUNDED EVIDENCE LIMITATION

disposition / prototypeTarget:
  MIXED_OR_NONLINEAR / NONE
```

The completed S1 evidence selects no remedy. It authorizes one bounded
`R2C-A-S2` decoupling experiment and does not activate R2C-B.

### Frozen S2 design

```text
strand counts:
  576 / 1152

control-point levels:
  3 / 8

TubeGeometry.tubularSegments levels:
  6 / 21

radialSegments:
  4 fixed

cells:
  exact 2 × 2 × 2 crossing in the deterministic order frozen by the S2 contract

sampling:
  1 warm-up + 5 measured per cell
```

P6/T15 is intentionally not a same-session center, and no center or expanded
campaign may be added after seeing evidence. Control-point representation and
longitudinal tessellation are separate factors. Analysis remains independent
at each strand count and uses the contract's conservative raw simple-effect
and interaction ranges.

Robust interaction direction is retained as descriptive nonadditivity
evidence. It does not preempt stable factor-side evidence. Only the exact
same-orientation qualitative point or tessellation crossover at both strand
levels selects `INTERACTION_OR_NONADDITIVE`; all other dispositions follow the
ordered affirmative rules and otherwise fall through to `UNRESOLVED`.

Browser admission separately freezes `browserEngine`, the selected
Chromium-family `browserProduct`, and that product's `browserMajor`. Recognized
wrapper products take precedence over embedded Chrome/Chromium tokens;
missing, ambiguous, conflicting, unparseable or declared-versus-actual product
or major evidence fails admission before the first warm-up.

### Authority and anti-sprawl

A complete S2 result may select only one bounded later investigation class.
It does not authorize a production setting, visual-fidelity conclusion,
durable renderer remedy, R2C-B, or customer/product activation.

An `UNRESOLVED` result selects no renderer remedy and does not automatically
authorize P6/T15, a 3×3 design, more samples, adaptive extension, S3, R2C-C or
R2C-B. The exact cells, order, formulas, lifecycle, cleanup, evidence boundary
and authority are frozen by
`docs/engineering/render-runtime-control-point-tessellation-decoupling-design-contract-v0.1.md`.

## 2026-08-10 — R2C-A-S2 primary Result evidence adjudication

### Result and custody identity

```text
execution commit:
  900de0cd8ea0ab0b621bb0142201fbf05b6bd451

artifact:
  mira-r2ca-s2-v01-2026-08-10T13-36-27.790Z.json

bytes:
  98,778

SHA-256:
  6fb828d1b552cda9713435e7b3d7fcaf8d6abc5d00355b581df25ed7cb2a17a9

Result Adjudication:
  docs/engineering/render-runtime-control-point-tessellation-decoupling-result-adjudication-v0.1.md
```

The original and archival custody copies were byte-identical. Canonical
validation passed, and independent standard-library recomputation matched all
104 metric summaries and all 89 serialized analysis fields with zero
mismatches.

### Durable disposition and authority

```text
S2 Result:
  VALID

Disposition:
  UNRESOLVED

Target:
  NONE

Renderer remedy:
  NONE

Automatic renderer follow-up:
  NONE

Default roadmap transition:
  RETURN TO COMMERCE / PRODUCT

R2C-B:
  NOT ACTIVATED
```

The descriptive longitudinal-tessellation main effects do not override the
frozen conservative predicates. No P6/T15 center, expanded campaign, S3,
R2C-C, R2C-B, tessellation remedy, control-point remedy, or other renderer
follow-up receives automatic authority. The S2 lifecycle closes only after
independent review and merge of the Result Adjudication record.

## 2026-08-11 — Eximbay EX2A pure protocol-kernel contract candidate

### Preserved authority

```text
Classification: SOURCE_ONLY
Current authorized change: documentation only
Eximbay runtime: NONE
External/network/browser/payment/refund/database authority: NONE
Routing and fallback eligibility: DISABLED
Sandbox/live activation: NOT AUTHORIZED
Status ingress: UNAVAILABLE
Refund-worker provider authority: TOSS_ONLY_EXPLICIT
```

### Selected design candidate

The candidate
[Eximbay EX2A Pure Protocol Kernel Design / Implementation Contract v0.1](../engineering/eximbay-ex2a-pure-protocol-kernel-design-contract-v0.1.md)
freezes a future side-effect-free `PAYMENT` protocol kernel: integer/string
USD/JPY amount encoding, one canonical ready/SDK fact set, ephemeral FGKey,
one provider-order identity candidate per `Payment.id`, exact raw status-query
carriage, bounded untrusted parsing, nominal verification separation, trusted
fact validation, duplicate comparison, safe diagnostics, and inquiry-status
labels.

Concrete provider-order wire derivation remains blocked until complete current
official constraints are source-frozen. SDK version, status transport and
acknowledgement, provider adapters, credentials, routes, routing, completion,
refunds, and activation are excluded. The candidate grants no implementation
authority until independent review and accepted merge; every later EX2 slice
requires separate authorization.

## 2026-08-11 — Eximbay EX2A pure protocol-kernel source installation

### Reviewed contract and source chain

```text
Design Contract PR / head / merge:
  #46
  54ac64276c243deb0929956b1bfc9bd073bbd93e
  bd95a2bb1364715923e4639f3e1a674a5191107d

source PR / reviewed head / merge:
  #47
  6c7d09d11f79c7d9baca21d52b18ea59c3145e42
  685fc048c8cb6fb834593e3b1f56756817c8e9ab
```

The historical
[EX2A Design Contract](../engineering/eximbay-ex2a-pure-protocol-kernel-design-contract-v0.1.md)
remains unchanged as normative design authority for its lifecycle stage. The
separate
[EX2A Source Status / As-Built v0.1](../engineering/eximbay-ex2a-pure-protocol-kernel-source-status-v0.1.md)
records the later installed source truth without rewriting the earlier
contract-candidate entry.

### Installed source and verification

PR #47 installed exactly 20 reviewed paths: 1 modified EX1 architecture test
and 19 added EX2A source/test paths, with 2,268 insertions and 1 deletion. The
deterministic, side-effect-free kernel owns USD/JPY minor-unit encoding and
inverse decoding, canonical preparation facts, ready/SDK semantic projections,
an opaque Payment-owned provider-order candidate, exact raw status-query
carriage and bounded parsing, safe aggregate diagnostics, nominal verified-type
separation, conservative trusted-fact validation, duplicate classification,
inquiry-state classification, and production isolation regression checks.

All six independent source-review findings closed with no new Blocker,
Important, or Minor finding, no contract clarification, and final source
architecture accepted. Focused verification passed 7 test files / 122 tests,
typecheck, and focused strict ESLint. A separately isolated clean
`npm run verify` passed 244 test files / 5,697 tests with exit code 0 after all
32 migrations were applied to a disposable PostgreSQL database. The exact 20
reviewed files matched SHA-256 before and after testing with zero mismatch.
GitHub CI run #307, run ID `31433573045`, separately concluded `success`.

### Runtime authority and next gate

```text
EX2A source:
  INSTALLED / REVIEWED

Eximbay runtime/network/SDK/credentials/routes/persistence/completion:
  NONE

routing/fallback:
  DISABLED

sandbox/live activation:
  NOT AUTHORIZED

refund/void:
  EXCLUDED

refund-worker authority:
  TOSS_ONLY_EXPLICIT
```

Provider-order wire constraints, SDK deployment identity, `status_url`
transport and acknowledgement/retries, test credential/MID semantics,
P000/USD/JPY merchant capability, 3DS/browser prerequisites, and refund wire
and recovery remain unresolved re-entry gates. The next authorized analysis
step is EX2B / EX2F prerequisite provider-evidence reconnaissance. This record
does not authorize network calls, credentials, application routes, SDK
invocation, provider routing, activation, completion, refund, void,
reconciliation, order creation, or manufacturing creation.

## 2026-08-11 — Eximbay BF2 shared-test `/ready` preflight contract candidate

### Lifecycle and provider-recon disposition

- EX2A lifecycle is closed through its installed Source Status / As-Built
  record;
- the prerequisite provider-evidence reconnaissance completed with the
  disposition that a bounded provider test must precede full EX2B;
- full EX2B remains blocked; and
- the selected first external evidence action is a public shared-test
  `POST /v1/payments/ready` preflight.

### Candidate external boundary

The candidate
[BF2 Shared-Test `/ready` Preflight Provider Evidence / Execution Contract v0.1](../engineering/eximbay-bf2-shared-test-ready-preflight-contract-v0.1.md)
freezes a maximum of three strictly sequential, adaptive `/ready` requests
under current public shared-test credentials, fresh never-reused order IDs,
bounded timeouts, no retries or redirects, sanitized evidence capture, and
immediate raw-FGKey disposal.

The baseline must succeed before a synthetic lowercase CUID1-like
representative plus P000/USD request. Request 3-A uses P000/JPY only after
conclusive Request-2 acceptance. Request 3-B removes P000 while retaining the
synthetic representative family and canonical USD amount only after a
conclusive, bounded, Branch-B-eligible Request-2 rejection. Request-2 transport
ambiguity or an ineligible explicit rejection stops without Request 3. This is
bounded discrimination, not proof of root cause. Acceptance never proves the
complete Eximbay `order_id` grammar or authorizes `Payment.id` as the final wire
value.

Sanitized local Result-v1 custody in predeclared non-repository `original/` and
`archive/` locations is mandatory before any provider contact. The final
byte-identical artifacts bind the adaptive path and provider-request count;
raw responses, credentials, and FGKeys are excluded.

### Current authority and next gate

This authoring task is documentation only. No Eximbay provider contact is
authorized before independent review and merge, and even then execution
requires a separate explicit task. SDK loading, payment-page invocation,
callback creation, payment, verification, completion, inquiry, refund, void,
reconciliation, live access, routing, persistence, order creation, and
manufacturing creation remain unauthorized.

After BF2 execution, a separate bounded adjudication must decide whether the
next step is vendor clarification, BF3 SDK evidence, an EX2B1 contract, or stop.

## 2026-08-11 — Eximbay BF2 shared-test `/ready` Result adjudication

### Contract, execution, and custody

```text
BF2 contract PR / reviewed head / merge:
  #49
  98f8126f545cfb3faeb2330c06347da641cb406d
  0216042c970c285f934237b42c863045729d3420

BF2 execution:
  OCCURRED ONCE

provider contacts used:
  3 / 3

Result run ID:
  20260811T020910297Z

Result bytes / SHA-256:
  5522
  e2efba46224b00c7d591e2875b1f7aa0fc5ff86d86a9d18f2e62802b273b95e7

custody:
  VALID_CUSTODY

execution:
  EXECUTION_CONFORMANT

evidence:
  BF2_EVIDENCE_VALID_WITH_LIMITATIONS

BF2 repeat:
  NOT AUTHORIZED
```

The original and archive sanitized Result-v1 files were separate regular
files, 5,522 bytes each, byte-identical, and carried the same SHA-256. They
remain external local evidence and were not copied into the repository.

### Supported observations and boundaries

All three exact shared-test `/ready` contacts were `OBSERVED_ACCEPTED` under
the BF2 preparation predicate:

1. numeric baseline, USD `"1.00"`, no forced payment method;
2. synthetic `c` + 24-lowercase-base36 representative, P000, USD `"1.00"`;
3. a distinct synthetic representative in the same family, P000, JPY `"1"`.

These are accepted preparation responses, not successful payments. They do
not prove the complete Eximbay `order_id` grammar, acceptance of all family
members or Prisma-created `Payment.id` values, Mira merchant-account
capability, SDK behavior, callbacks, 3DS, authorization, capture, settlement,
refund, production routing, or live activation.

### Durable disposition and next gate

```text
BF2 final disposition:
  BF2 RESULT VALID WITH LIMITATIONS — NEXT DESIGN GATE MAY PROCEED

next:
  EX2B1 — Provider Order Identity + Server-Side /ready Preparation
  Design Contract

BF3 SDK:
  KEEP SEPARATE BEFORE EX2B2

BF4 callback:
  EVIDENCE STILL REQUIRED

merchant-account/live:
  SEPARATE / NOT AUTHORIZED
```

EX2B1 may design a Mira-controlled provider-order identity using the selected
synthetic family, independently of raw `Payment.id`, only after fresh
repository reconnaissance and reviewed design authority. This adjudication
does not freeze persistence schema. `providerRef` must not be silently
overloaded absent a future audit proving semantic compatibility.

## 2026-08-11 — Eximbay EX2B1 provider-order and provider-free `/ready` contract candidate

### BF2 closure and fresh reconnaissance

```text
BF2 custody:
  VALID_CUSTODY

BF2 execution:
  EXECUTION_CONFORMANT

BF2 evidence:
  BF2_EVIDENCE_VALID_WITH_LIMITATIONS

BF2 repeat:
  NOT AUTHORIZED
```

Fresh source reconnaissance at
`cd51f8398980401fd573d95aff417c5028f2a5fe` confirmed that `Payment` is the
physical provider-attempt and provider-contact owner, while one
`CheckoutSession` may retain historical `Payment` attempts. Current
`CONTACT_AUTHORIZED`, `CONTACTED`, `OUTCOME_UNKNOWN`, and `SUPERSEDED`
semantics are sufficient; no new attempt owner or lifecycle state is selected.

```text
BF2 lifecycle:
  CLOSED
```

### Frozen candidate decisions

The candidate
[EX2B1 Provider Order Identity + Provider-Free `/ready` Preparation Design Contract v0.1](../engineering/eximbay-ex2b1-provider-order-ready-preparation-design-contract-v0.1.md)
selects:

```text
preferred persistence:
  generic nullable Payment.providerOrderId

providerRef:
  REUSE_INCOMPATIBLE

providerPaymentKey:
  REUSE_INCOMPATIBLE

idempotencyKey:
  independent

raw Payment.id:
  not provider wire

generation:
  CSPRNG + unbiased rejection sampling

identity family:
  ^c[0-9a-z]{24}$

persistence:
  new EXIMBAY Payment creation transaction

uniqueness:
  provider-scoped and database-authoritative

immutability:
  database enforced

contact order:
  persist -> CONTACT_AUTHORIZED -> CONTACTED commit -> future contact
```

Current PrismaPg 7.8 does not expose sufficiently reliable structured named-
constraint identity for exact provider-order collision retry authority.
Current EX2B1 therefore generates one candidate for one authoritative creation
operation and performs zero automatic collision-regeneration attempts. Any
duplicate, generic `P2002`, or unrelated uniqueness failure rolls the
transaction back and fails closed before provider contact. A future bounded
regeneration design requires separate review and a structured primitive that
positively distinguishes the exact provider-order constraint.

The future provider-free materializer binds installed EX2A canonical facts and
their opaque Payment-owned candidate to a separately trusted persisted
provider-order binding. It may emit the persisted value only as wire
`payment.order_id`; it reuses the installed EX2A amount codec and adds no
transport, credentials, endpoint, authentication, FGKey, or SDK behavior.

### Independent architecture audit — bounded corrections

```text
EX2B1 architecture:
  ACCEPTED WITH BOUNDED CORRECTIONS

EX2B1-AUD-001:
  CORRECTED

EX2B1-AUD-002:
  CORRECTED

EX2B1-AUD-003:
  CORRECTED

webhook-first EXIMBAY:
  NOT AUTHORIZED IN THIS SLICE

future genuine EXIMBAY webhook-first:
  REQUIRES SEPARATELY REVIEWED BF4 / SCHEMA / COMPLETION EVOLUTION

PrismaPg exact providerOrderId constraint discrimination:
  NOT FEASIBLE ON CURRENT STACK

automatic providerOrderId collision regeneration:
  DISABLED

collision:
  FAIL CLOSED BEFORE CONTACT

future bounded regeneration:
  REQUIRES SEPARATELY REVIEWED STRUCTURED CONSTRAINT IDENTITY

intentional EXIMBAY test fixtures:
  MIGRATE TO VALID INSERT-TIME providerOrderId WITHOUT WEAKENING EXCLUSIONS
```

Existing non-Eximbay webhook-first behavior remains unchanged. EX2B1 may not
fabricate an Eximbay `Payment` or merchant identity from a callback that lacks
pre-existing correlation. Intentional Eximbay fixtures must be constructed
validly at insertion time; tests must not mutate another provider's row into
Eximbay or weaken refund, void, routing, factory, or activation exclusions.

### Evidence and authority boundary

The selected identity family is supported only by BF2's two exact accepted
synthetic representatives. It is not Eximbay's complete grammar, does not prove
every family member, and does not establish Prisma `Payment.id` acceptance.
Additional provider evidence and vendor clarification are not required for this
provider-free EX2B1 contract. BF3 SDK evidence, BF4 callback evidence, provider
transport, Mira merchant-account capability, sandbox activation, and live
activation remain separate.

```text
additional provider evidence:
  not required for EX2B1 contract

vendor clarification:
  not required for EX2B1 contract

BF3 / BF4 / live:
  still separate
```

This candidate is documentation only and is not installed. It grants no source
implementation authority until independent adversarial review and accepted
merge; later source work still requires a separate explicit task. No provider
request, credential, SDK, route, routing, activation, refund, void, Order, or
ManufacturingRequest authority is created.

## 2026-08-11 — Eximbay EX2B1 source installation and Source Status candidate

### Source installation and review closure

```text
source PR / reviewed head / merge:
  #52
  8ac1230992538f80a0d1fe50cfe03ee433b349d8
  016ac179b5568f24e9467462e3a86a8ca530fd6d

source findings:
  B-01 CLOSED
  I-01 CLOSED

new Blocker / Important / Minor findings at closure:
  0 / 0 / 0
```

PR #52 installed durable per-`Payment` Eximbay provider-order identity,
database-enforced provider shape, provider-scoped uniqueness and immutability,
one-candidate fail-closed collision behavior, trusted canonical-persistence
binding, provider-free READY request materialization, and an Eximbay
webhook-first fail-closed boundary. The broad-review provenance defect B-01
was closed by removing caller-supplied persistence authority. I-01 was closed
with direct PostgreSQL same-session convergence and two-session forced-
collision tests.

### Verification, runtime boundary, and lifecycle

Final source verification passed Prisma validation/generation, PostgreSQL 18.4
full migration history `33/33`, focused database and behavior suites,
typecheck, candidate/repository lint excluding only `.local-review/**`, and
the separately run full suite at 248 files / 5,732 tests. The reviewed 22-path
candidate manifest remained
`0ad9ea392d3033ef0278470e0f2f49bc84e3c018e7e7fc89f3cf39fedaae411a`
before and after verification. Literal `npm run verify` did not complete
because lint encountered 14 pre-existing parser errors under
`.local-review/**`; it is not recorded as passing.

CI #317 initially encountered an isolated cleanup-hook timeout in an unchanged
Toss refund recontact test. Bounded inspection found no candidate-path semantic
connection requiring a source correction; one failed-job-only rerun against
the unchanged source head completed successfully.

```text
EX2B1 source:
  MERGED / INSTALLED / REVIEWED

provider contact / routing / credentials / SDK / callback / completion:
  NONE

refund / void:
  BLOCKED

test/live Eximbay runtime activation:
  NOT AUTHORIZED

Source Status candidate:
  CREATED — PENDING INDEPENDENT DOCUMENTATION REVIEW / INSTALLATION

EX2B1 lifecycle:
  PENDING SOURCE-STATUS INSTALLATION
```

The separate
[EX2B1 Source Status / As-Built v0.1](../engineering/eximbay-ex2b1-provider-order-ready-preparation-source-status-v0.1.md)
records the complete installed truth and evidence. BF3 SDK evidence, BF4
callback/status evidence, actual provider transport, financial verification,
merchant/live activation, and refund/void/recovery remain separately gated.

## 2026-08-11 — Eximbay EX2B1 Source Status installation and lifecycle closure

### Installation identity and review disposition

```text
Source Status PR:
  #53

reviewed head:
  918d1f8343663576f3820a8ca1a997804848c423

merge:
  0a5f06e0ca372c4cc1849c9ba8a891a42bf46c76

CI:
  #319
  success

independent documentation findings:
  Blocker 0
  Important 0
  Minor 0

EX2B1 Source Status:
  INSTALLED

EX2B1 lifecycle:
  CLOSED
```

This closure means only that the bounded EX2B1 lifecycle is complete: its
Design Contract is installed, its source is implemented, reviewed, verified,
and merged, and its Source Status is independently reviewed, merged, and
installed. It does not mean that the Eximbay integration is complete or that
`/ready` HTTP, an SDK, callback handling, payments, merchant production
capability, or refund/void/recovery is implemented or activated.

### Runtime boundary and next gate

```text
provider contact:
  NONE

routing:
  NOT AUTHORIZED

credentials:
  NONE

SDK/browser handoff:
  NOT INSTALLED

callback:
  NOT INSTALLED

refund/void:
  BLOCKED

sandbox/live runtime activation:
  NOT AUTHORIZED

next gate:
  BF3 SDK evidence
```

BF3 has not started or completed. EX2B2 remains gated by BF3, and BF4
callback/status_url evidence remains separately gated.

## 2026-08-11 — Eximbay BF3 static JavaScript SDK evidence contract candidate

### Lifecycle and task authority

```text
EX2B1 lifecycle:
  CLOSED

next separately gated work:
  BF3 SDK evidence / reconciliation

task classification:
  EVIDENCE_COLLECTION_CONTRACT

current task-level authorization:
  DOCUMENTATION_ONLY

current provider-contact authority:
  NONE

BF3 contract:
  CANDIDATE

BF3 provider execution:
  NOT AUTHORIZED

BF3 result:
  NONE

BF3 SDK canonical version:
  UNRESOLVED

EX2B2:
  NOT AUTHORIZED
```

The candidate
[BF3 Static JavaScript SDK Evidence / Execution Contract v0.1](../engineering/eximbay-bf3-static-javascript-sdk-evidence-contract-v0.1.md)
does not reopen EX2B1 and does not load or execute an SDK. Only focused
canonical Result-v1 byte-determinism closure and merge, followed by a separate
explicit BF3 execution task, may grant the bounded static-resource contacts
below. BF3-CLR-001 and BF3-CLR-003 are closed. The bounded canonical-byte
correction resolves the sole remaining dependency of BF3-CLR-002 and
BF3-AUD-004, subject to that final focused review.

### Current official evidence and unresolved conflict

Fresh official-document review on 2026-08-11 confirmed that the dedicated
JavaScript SDK page and common payment-page preparation page show the test v2
SDK. The PAYMENT, PAYER_AUTH, and AUTHORIZE flow pages each show test v2 in SDK
Preparation and test v1 in Payment Page Initiation. No inspected explicit
current-version or deprecation notice resolves the conflict.

The common page publishes the production base origin, but the inspected current
documentation does not explicitly establish either exact production asset
path. Accordingly, production v1/v2 SDK paths are not authorized targets,
optional probes, fallbacks, discovery requests, or Result-v1 slots.

### Frozen candidate execution boundary

After reviewed merge and separate invocation, the contract may authorize one
sequential execution with at most two total provider HTTP requests: one
credential-free GET to TEST V2, then one to TEST V1:

```text
https://api-test.eximbay.com/v2/javascriptSDK.js
https://api-test.eximbay.com/v1/javascriptSDK.js
```

No production SDK path is probed, and no unused request ordinal may be
reassigned.

Automatic retries and redirect following are disabled. TLS verification,
timeouts, a 262,144-byte streaming ceiling, identity content encoding, exact
byte counts, SHA-256, external original/archive custody, and inert offline
inspection are mandatory. JavaScript execution, browser script loading,
`EXIMBAY.request_pay()`, `/ready`, credentials, payment-page invocation,
callbacks, source changes, and runtime activation remain prohibited.

Result-v1 freezes only semantic execution/evidence truth before packaging and
is serialized exactly once. A separate non-recursive PackageIntegrity-v1
records Result creation, original/archive write and verification, exact-byte
equality, and later package custody truth without changing Result-v1.

### Adjudication and next gate

SDK asset version and REST `/v1/payments/...` version remain independent axes.
Asset reachability alone cannot establish canonicality. After decision-grade
Result-v1 and PackageIntegrity-v1 admission, independent later adjudication
must choose v2 supported for EX2B2 design, v1 supported for EX2B2 design,
vendor clarification required, or invalid/incomplete semantic evidence.
Package failure denies admission without changing Result-v1.

A supported BF3 disposition authorizes only a later EX2B2 design contract to
adopt the selected exact test SDK candidate. It does not authorize SDK source
implementation, SDK execution, provider runtime, merchant production
capability, or customer activation.

### Bounded canonical JSON byte-profile correction

```text
correction classification:
  DOCUMENTATION_ONLY
  BOUNDED_CANONICAL_BYTE_ENCODING_CORRECTION

canonical profile:
  BF3_CANONICAL_JSON_UTF8_V1

applies identically to:
  Result-v1
  PackageIntegrity-v1

BF3-CLR-003:
  CLOSED

BF3-CLR-002:
  CORRECTED — PENDING FINAL FOCUSED CLOSURE

BF3-AUD-004:
  CORRECTED — PENDING FINAL FOCUSED CLOSURE

BF3 provider execution:
  NOT AUTHORIZED
```

The profile freezes the typed JSON data model, required member presence,
existing schema and array order, one Unicode-scalar string escape algorithm,
literal UTF-8 printable Unicode, integer lexical forms, exact millisecond UTC
timestamps, two-space/LF layout, BOM prohibition, the single final LF, and the
complete Result-v1 hashing boundary. It also freezes local scalar and nested
artifact preflight vectors that must pass before any later provider contact.

The decisive U+FFFD ambiguity is closed: a semantic U+FFFD is emitted only as
literal UTF-8 `EF BF BD` inside the JSON string, never as `\uFFFD` or `\ufffd`.
The PackageIntegrity-v1 record uses the same profile but remains non-recursive;
Result-v1 remains ignorant of its own write, archive, verification, and package
outcome. No README serialization detail was needed because its existing
candidate summary remains accurate.

After this correction, equal schema-valid semantic values plus the already
frozen field and array order determine exactly one byte sequence for each
artifact. One final review is limited to canonical Result-v1 byte determinism,
closure of BF3-CLR-002 and BF3-AUD-004, and regression checking the already
closed BF3-CLR-003. It does not reopen provider evidence, SDK canonicality,
HTTP behavior, target inventory, static analysis, warnings, terminal state, or
custody architecture.

## 2026-08-12 — Eximbay BF3 static JavaScript SDK Result adjudication

### Contract, run, and package admission

```text
contract merge:
  5a02801379e65c3adf44726d895ac810026a1976

run ID:
  20260811T220109Z-c4779de2

package admission:
  VALID

execution conformance:
  CONFORMANT

semantic result:
  INVALID_OR_INCOMPLETE

BF3 disposition:
  BF3_EVIDENCE_INVALID_OR_INCOMPLETE
```

PackageIntegrity-v1 is 1,199 bytes with SHA-256
`3ffabb7bffa44e16edfb3958993d1487d9b7a42a6215d945ad6eb8b34405780c`.
The original and archive Result-v1 files are valid canonical bytes, directly
byte-identical at 7,200 bytes, with SHA-256
`daa413c8754969f4187079b45c722bb1a79a0da77a6725927814c8105269de5a`.
The external evidence remains outside Git.

### Source-admission anomaly and evidence ceiling

Both exact test SDK URLs were contacted once and returned HTTP 200 with
complete retained bodies. TEST V2 declared Content-Type `application/json` and
bound 4,287 bytes; TEST V1 also declared `application/json` and bound 3,459
bytes. The installed JavaScript media-type allowlist did not admit either
response, so all static observations and all static comparisons remain
`UNRESOLVED_BY_STATIC_INSPECTION`.

The raw V2 and V1 bodies differ by byte count, SHA-256, and direct byte
comparison. That establishes a raw byte difference only. It does not establish
a semantic SDK difference, a canonical version, browser behavior, payment-page
behavior, production path, merchant readiness, or EX2B2 readiness.

### Durable boundary and next lawful gate

```text
BF3 re-run:
  NOT AUTHORIZED

EX2B2:
  BLOCKED

next lawful gate:
  STOP PENDING NEW AUTHORITY

possible separately reviewed planning continuation:
  BF3 evidence-plan / contract revision addressing the observed Content-Type
  anomaly
```

The completed run consumed both provider-request ordinals. The result record
creates no new provider contact, confirmation GET, vendor contact, revised
evidence method, SDK interpretation, SDK execution, EX2B2 design, or runtime
activation authority. Any future evidence-plan revision neither reinterprets
this run nor authorizes a rerun by itself.

## 2026-08-12 — Eximbay BF3-R1 retained-byte evidence contract candidate

### Historical state and observed anomaly

```text
historical BF3 result:
  INSTALLED / IMMUTABLE

BF3 disposition:
  BF3_EVIDENCE_INVALID_OR_INCOMPLETE

observed anomaly:
  both exact historical responses declared application/json
```

The historical BF3 contract, conformant execution, valid package, immutable
Result-v1, warnings, terminal outcome, stop reason, disposition, and no-rerun
boundary remain unchanged.

### Selected evidence architecture

Current standards research distinguishes browser classic-script MIME behavior
from offline inert-byte textual evidence. The selected immediate architecture
is a zero-provider-contact derived-evidence contract that first re-verifies the
exact retained original/archive identities, then—only if both pass—permits
the frozen fatal UTF-8 decode-without-BOM method, five atomic exact literal
predicates, and language-neutral RFC 8259 grammar recognition without
JavaScript execution. The retained historical PackageIntegrity-v1 and
Result-v1 are part of the same global upstream gate, and future derived output
uses distinct original/archive custody plus a non-recursive integrity record.

```text
provider contact:
  NOT AUTHORIZED

browser execution:
  NOT AUTHORIZED

derived execution:
  NOT YET AUTHORIZED — REQUIRES INDEPENDENT REVIEW, MERGE, AND SEPARATE INVOCATION

canonical SDK selection:
  UNRESOLVED / NOT AUTHORIZED BY DERIVED EXECUTION

EX2B2:
  BLOCKED
```

Browser request-context equivalence, `X-Content-Type-Options`, and
`Cross-Origin-Resource-Policy` remain unresolved. A later provider header or
browser evidence action is planning-only and would require a new separately
reviewed contract.

### Independent review and bounded-correction status

```text
independent broad review:
  COMPLETED

findings:
  BF3R1-AUD-001 THROUGH BF3R1-AUD-007

bounded corrections:
  APPLIED / PENDING FOCUSED CLOSURE

authorized next review:
  FOCUSED CLOSURE OF THOSE SEVEN FINDINGS ONLY
```

The correction changes no historical BF3 artifact or disposition and grants no
provider contact, retained SDK interpretation, derived execution, JavaScript
execution, browser execution, vendor contact, BF3 rerun, or EX2B2 authority.

## 2026-08-12 — Eximbay BF3-R1 E1 derived-evidence Result adjudication candidate

### Run, package, execution, and admitted semantic result

```text
BF3-R1 E1 execution:
  COMPLETE

derived run ID:
  20260812T003616Z-88533a1e

package:
  VALID

execution:
  CONFORMANT

derived semantic evidence:
  COMPLETE / ADMITTED

DerivedEvidence outcome:
  DERIVED_TEXT_EVIDENCE_COMPLETE
```

The candidate durable
[BF3-R1 E1 Derived-Evidence Result Evidence / Independent Adjudication v0.1](../engineering/eximbay-bf3-r1-derived-evidence-result-adjudication-v0.1.md)
binds the external three-file package by exact run identity, canonical
basenames, byte counts, SHA-256 values, distinct original/archive filesystem
identities, and direct byte equality. The external evidence remains outside
Git. This result record is pending one independent documentation/evidence-
binding review before installation.

### Bounded static result

For both retained exact bodies, strict UTF-8 decoding succeeded, the required
SDK-related literals were observed as adjudicated, the production-origin
literal was not observed, and the frozen RFC 8259 JSON grammar recognizer
failed. The historical transport record established `Content-Type:
application/json` for both exact captured responses. Therefore the bounded
captured Content-Type/body-grammar mismatch is observed for those historical
responses under the frozen recognizer.

These observations do not establish valid JavaScript, runtime behavior,
browser compatibility, SDK canonicality, current response equivalence,
provider misconfiguration, or EX2B2 readiness. SDK asset version and REST API
path version remain separate axes.

### Lifecycle boundary and next lawful gate

```text
next lawful gate:
  NO_PROVIDER_CONTACT_NEEDED_YET

BF3-R1 E1 re-execution:
  NOT AUTHORIZED

provider contact:
  NOT AUTHORIZED

JavaScript execution:
  NONE

browser execution:
  NONE

historical BF3 result:
  IMMUTABLE

historical BF3 disposition:
  BF3_EVIDENCE_INVALID_OR_INCOMPLETE

EX2B2:
  BLOCKED

next repository step:
  INDEPENDENT REVIEW OF DURABLE RESULT RECORD
```

`NO_PROVIDER_CONTACT_NEEDED_YET` records that a separately reviewed local,
zero-contact, non-executing static evidence method may still reduce material
uncertainty. It does not design or authorize the identified offline ECMAScript
grammar / bounded source-shape candidate method. Header request-context,
controlled-browser, and vendor-clarification gates are deferred while that
lower-cost deterministic avenue remains; they are not permanently excluded.

## 2026-08-12 — Eximbay BF3-R1 lifecycle closure / authority reconciliation

The earlier BF3-R1 contract and E1 result-record candidate/pending wording is
preserved as a chronological pre-installation snapshot. PR #57 subsequently
installed the independently reviewed BF3-R1 retained-byte evidence contract at
merge `dc253973ee5e20c1e7710cf722589e2f58d70ed4`. PR #58 subsequently installed
the independently reviewed BF3-R1 E1 result/adjudication record at merge
`482bfbb20063eaf525756f159d9532d3abb9e938`.

An additive
[BF3-R1 Lifecycle Closure / Authority Reconciliation v0.1](../engineering/eximbay-bf3-r1-lifecycle-closure-v0.1.md)
was authored as a candidate to reconcile those stale embedded lifecycle
labels. The contract and result-record installation facts are already true
independently of this candidate. The closure is pending focused review and is
not installed. If that review closes and the reviewed candidate is subsequently
merged, the actual merge SHA and exact merge-time closure-file byte count and
SHA-256 become its external installation authority. A future BF3-R2 contract
must bind and independently verify those actual values before using the closure
as upstream lifecycle authority. The closure's eventual authority is additive
and lifecycle-status-only; the historical files and all technical BF3-R1
evidence, execution facts, methods, hashes, evidence ceilings, and boundaries
remain unchanged.

```text
next lawful gate:
  NO_PROVIDER_CONTACT_NEEDED_YET

BF3-R1 E1 re-execution:
  NOT AUTHORIZED

provider contact:
  NOT AUTHORIZED

BF3-R2:
  CANDIDATE / NOT INSTALLED / NOT EXECUTED

BF3-R1 lifecycle closure:
  CANDIDATE / PENDING FOCUSED REVIEW / NOT INSTALLED

EX2B2:
  BLOCKED
```

## 2026-08-12 — Eximbay BF3-R2 bounded correction candidate after lifecycle installation

The prior BF3-R2 broad-review history remains chronological and is not
rewritten. PR #59 subsequently installed the BF3-R1 lifecycle closure at merge
`dc0c90b66ea4e1d901e152714e4c9b8959bb6bb7`. The exact merge-time closure
file was independently recomputed as `10013` bytes with SHA-256
`53ab1638326a6e377aa92eec25257afde50fd3a7b5b79fdf4fed30c2db392880`;
the corrected BF3-R2 candidate binds all four lifecycle authority fields and
admits no README, decision-log, filename, working-tree, or stale-result
fallback.

The corrected
[BF3-R2 Offline ECMAScript Syntax / Bounded Source-Shape Evidence Contract v0.1](../engineering/eximbay-bf3-r2-offline-ecmascript-source-shape-evidence-contract-v0.1.md)
embeds the exact reviewed decision-bearing harness and macOS deny-network
profile, freezes startup/environment/module-resolution admission, separates
Espree parse completion from later source-shape failure, corrects Program range
and UTF-16 half-open occurrence semantics, binds the complete ordered method
identity set, freezes a host-visible non-evaluation sentinel, and requires safe
integer/count bounds. Synthetic-only preflight reproduced original vectors A–G
and the new correction vectors without reading either retained SDK body.

```text
BF3R2-AUD-001:
  CLOSED THROUGH INSTALLED LIFECYCLE CLOSURE PR #59

installed lifecycle closure merge:
  dc0c90b66ea4e1d901e152714e4c9b8959bb6bb7

exact lifecycle closure file identity:
  10013 BYTES
  SHA-256 53ab1638326a6e377aa92eec25257afde50fd3a7b5b79fdf4fed30c2db392880

BF3R2-AUD-002..010:
  BOUNDED CORRECTIONS AUTHORED / PENDING FOCUSED CLOSURE

BF3-R2:
  CORRECTED CANDIDATE / UNINSTALLED / UNEXECUTED

BF3-R2 execution:
  NOT AUTHORIZED

retained SDK evaluation:
  NOT AUTHORIZED

provider / browser:
  NOT AUTHORIZED / NONE

EXIMBAY SDK canonical version:
  UNRESOLVED

EX2B2:
  BLOCKED

next:
  ONE FOCUSED BF3R2 AUD-002..010 CLOSURE REVIEW
```

## 2026-08-12 — Eximbay BF3-R2 bounded AUD-002/AUD-003 correction

The immediately preceding corrected-candidate entry remains chronological.
The focused review left only AUD-002 and AUD-003 open. This bounded correction
does not reopen AUD-001 or AUD-004 through AUD-010 and grants no BF3-R2
execution authority.

The contract now embeds separately hashed exact artifacts:

```text
BF3R2_POSIX_PRE_NODE_LAUNCHER_V2:
  12127 bytes
  SHA-256 77f34c9c8520994beed63cae440344226540337eccefeb2011b42b0109e2862c

BF3R2_ANALYSIS_HARNESS_V3:
  104234 bytes
  SHA-256 9c7ee711397a4697c72595742f4d4f37fb1ca9ab32d698766ea6302ad228f7af

BF3R2_SELF_ERASING_STARTUP_CONTAMINATION_REGRESSION_V1:
  417 bytes
  SHA-256 c02bc8e0861a668b1ded6d8f8263b5fcb8190e5b00c2328d56ee20cf7d845bd5

BF3R2_ACTUAL_LAUNCHER_PROCESS_MATRIX_V1:
  13072 bytes
  SHA-256 6ae7e615a21a644a41c5a2f4d8b38ed3a292e4ade661cdad3ab683a89cad1355
```

The launcher, not mutable Node state, owns primary startup admission. It
constructs a fixed `/usr/bin/env -i` -> `/usr/bin/sandbox-exec` -> Node argv,
accepts exact production grammar plus a separately enumerated TEST-ONLY vector
grammar, binds FD 3 parent/token and clean-launch acknowledgement, classifies
every launcher/child/receipt/cleanup failure, and writes external launch
authority only after exact receipt validation and temporary-state cleanup.
Node `execArgv`, environment, and cache inspection remain defense in depth. The
exact startup fixture contaminated a direct Node invocation, but that process
failed external launch admission at 65 with no production artifact; the exact
reviewed launcher rejected the same startup control at 64 before Node.

The production evidence validator is exact, recursive, and closed for every
nested object, including complete `upstreamAuthority` and
`executionEnvironment`. Eight negative schema vectors reject missing/extra
nested fields, wrong enum/hash/count/identity, `syntheticFixture`, and complete
synthetic authority substitution before production package admission.
Synthetic analysis now creates only TEST-ONLY result/package-check schemas and
cannot emit production evidence, production PackageIntegrity, or
`PACKAGE_VALID`. The 31-vector actual-launcher process matrix verified process
exit, stdout/stderr, file sets, launch records, temporary cleanup, direct and
reviewed startup regression, and production artifact non-admission. Production
PackageIntegrity still represents only read-back-verified `PACKAGE_VALID`;
failed durable writes remain terminal state plus actual file set.

```text
BF3R2-AUD-001:
  CLOSED / REGRESSION PASS
BF3R2-AUD-002:
  CORRECTED
BF3R2-AUD-003:
  CORRECTED
BF3R2-AUD-004..010:
  CLOSED / REGRESSION PASS

BF3-R2:
  CORRECTED CANDIDATE / UNINSTALLED / UNEXECUTED
BF3-R2 execution:
  NOT AUTHORIZED
retained SDK parse / vm.Script / evaluation:
  NONE
provider / browser / external network:
  NONE
EXIMBAY SDK canonical version:
  UNRESOLVED
EX2B2:
  BLOCKED
next:
  ONE FOCUSED BF3R2 AUD-002/AUD-003 CLOSURE REVIEW
```

## 2026-08-12 — Eximbay BF3-R2 H4 final corrected candidate synchronization

The preceding BF3-R2 review and correction entries remain chronological and
unchanged. H4 synchronized the final execution-authoritative identities and
method descriptions outside the three frozen embedded regions, then ran only
the already-defined TEST-ONLY synthetic validation. BF3-R2 production
execution and retained SDK parsing, compile-only construction, and evaluation
remain unauthorized.

```text
BF3R2_ANALYSIS_HARNESS_V4:
  107473 bytes
  SHA-256 fbc8642fa193f8e2282898d68ab065be179c7d354b07df1c2f46408709e5a521

BF3R2_POSIX_PRE_NODE_LAUNCHER_V3:
  12533 bytes
  SHA-256 5c1128131238ea25e30fcdd62d9ff1373462ef545116d50fbda200281c63a72f

BF3R2_PROCESS_TERMINAL_MATRIX_V2:
  13492 bytes
  SHA-256 a95bc37edfe2efaa111283358ff98bb770c4b6be1157cc99d28cfdcbd8658ec1
```

Production `admittedHarnessIdentity` is derived only from the exact Harness V4
bytes extracted from the reviewed installed contract. Production validation
requires `executionEnvironment.harnessByteCount` and
`executionEnvironment.harnessSha256` to equal that derived identity. Caller
fields and synthetic authority cannot define it.

The exact clean TEST-ONLY launch exited `0`, printed
`BF3R2_SYNTHETIC_HELPER_REGRESSION_PASS 18`,
`BF3R2_SYNTHETIC_VECTOR_PASS NONE SOURCE_SHAPE_EVIDENCE_COMPLETE`, and
`BF3R2_SYNTHETIC_LAUNCH_OBSERVED`, and recorded:

```text
productionNegativeSchemaVectorCount: 10
productionEvidenceOutcome: NOT_CREATED
productionPackageIntegrityOutcome: NOT_CREATED
productionPackageAdmissionOutcome: PROHIBITED
```

The exact positive Harness V4 identity passed its production equality check.
The wrong positive safe byte count and syntactically valid alternate 64-hex
SHA-256 both failed production validation. No production semantic evidence,
PackageIntegrity, or `PACKAGE_VALID` admission was reachable. The exact Process
Matrix V2 then exited `0` with
`BF3R2_PROCESS_TERMINAL_MATRIX_PASS 31`. Closed-finding regressions for
BF3R2-AUD-001 and BF3R2-AUD-003..010 passed without reopening their designs.

```text
BF3R2-AUD-001:
  CLOSED / REGRESSION PASS
BF3R2-AUD-002:
  CORRECTED / READY FOR ONE FOCUSED CLOSURE REVIEW
BF3R2-AUD-003..010:
  CLOSED / REGRESSION PASS

BF3-R2:
  FINAL CORRECTED CANDIDATE / UNINSTALLED
BF3-R2 execution:
  NOT AUTHORIZED
retained SDK parse / vm.Script / evaluation:
  NONE
provider / browser / external network:
  NONE
EXIMBAY SDK canonical version:
  UNRESOLVED
EX2B2:
  BLOCKED
next:
  ONE BF3R2-AUD-002 FOCUSED CLOSURE REVIEW ONLY
```

## 2026-08-14 — Eximbay vendor clarification / canonical SDK authority reconciliation

### Admitted first-party version authority

Direct Eximbay vendor clarification states:

```text
JavaScript SDK:
  v2

REST/payment API:
  v1
```

Current dedicated SDK and top-level payment-preparation documentation shows:

```text
test origin:
  https://api-test.eximbay.com

production origin:
  https://api.eximbay.com

SDK example:
  /v2/javascriptSDK.js

Payment Ready:
  /v1/payments/ready
```

Current official PAYMENT, PAYER_AUTH, and AUTHORIZE flow pages retain this
internal SDK-version inconsistency:

```text
SDK Preparation:
  /v2/javascriptSDK.js

later Payment Page Initiation snippet:
  /v1/javascriptSDK.js

residual official-document conflict:
  RETAINED / NOT CANONICAL AFTER DIRECT VENDOR CLARIFICATION
```

The v1 initiation snippets are not silently reinterpreted as REST `/v1`
examples. Canonical SDK v2 is selected because the direct vendor clarification
explicitly selects JavaScript SDK v2 and the dedicated SDK/top-level
preparation documentation also uses v2, not because every current official
page is internally consistent. The remaining conflicting snippets are an
observable documentation ambiguity only. A later vendor correction materially
contradicting v2 requires re-adjudication.

SDK asset version and REST API path version remain separate axes. JavaScript
SDK v2 with REST `/v1/...` is not a version contradiction.

### Environment conflict reconciliation

The vendor email's final two environment bullets swap the test and production
origins. That fragment contradicts the same email's exact `api-test` SDK
example, the current official SDK/API environment tables, and current official
READY examples. The fragment is retained as evidence but is not admitted as
environment mapping. The user has asked the vendor whether the bullets were
reversed; the clarification reply remains pending. A later materially
contradictory reply requires re-adjudication.

The current source-design dispositions are:

```text
canonical SDK for EX2B2 design:
  v2

canonical SDK basis:
  direct vendor clarification explicitly selects JavaScript SDK v2
  + dedicated SDK/top-level preparation documentation uses v2

residual flow-page SDK conflict:
  SDK Preparation -> v2
  later Payment Page Initiation snippet -> v1
  RETAINED / NOT CANONICAL

API path family:
  v1

exact test SDK asset:
  https://api-test.eximbay.com/v2/javascriptSDK.js

production SDK candidate:
  https://api.eximbay.com/v2/javascriptSDK.js

production candidate classification:
  OFFICIAL_DOC_COMPOSITION_FOR_SOURCE_DESIGN
```

The production candidate is composed from the official production base origin
and current official v2 SDK path. It is not represented as a directly
documented exact production asset or literal vendor quote.

### Historical preservation and next gate

The durable
[vendor clarification / official-document authority adjudication](../engineering/eximbay-bf3-vendor-clarification-authority-adjudication-v0.1.md)
preserves every historical BF3, BF3-R1, and BF3-R2 artifact and result. New
first-party authority resolves the narrow canonical-version question without
making prior evidence say what it never established.

```text
EX2B1 lifecycle:
  HISTORICALLY CLOSED

BF3/R1/R2 history:
  PRESERVED

BF3-R2 further execution for the canonical-SDK version question:
  NOT REQUIRED AFTER ADMISSION OF THE NEW AUTHORITY

BF3-R2 execution:
  STILL UNAUTHORIZED / UNEXECUTED

EX2B2:
  UNBLOCKED FOR DESIGN CONTRACT ONLY

EX2B2 source implementation:
  NOT AUTHORIZED

provider contact:
  NOT AUTHORIZED

SDK/browser runtime:
  NOT AUTHORIZED

sandbox/live activation:
  NOT AUTHORIZED

BF4:
  SEPARATE / STILL GATED
```

No `/ready` HTTP, SDK network load or execution, `EXIMBAY.request_pay`,
credential use, callback, merchant capability, refund/cancel/void, financial
completion, runtime, or activation authority is created.

## 2026-08-14 — Eximbay EX2B2 READY transport + SDK handoff design candidate

At post-BF3-VCL installed baseline
`624342ebcf8a0c8c54f10d016f8185cdf7d89de8`, EX2B2 had design-only authority.
The new documentation candidate separates server READY transport/response
admission from browser SDK v2 loading and handoff. It does not claim source is
installed or reviewed.

Selected design dispositions:

```text
environment owner:
  persisted Payment.mode
  server config is a fail-closed matching interlock

READY:
  REST /v1 endpoint selected from trusted mode
  canonical EX2A facts + non-forgeable EX2B1 persisted-order binding
  all local construction before markContactStarted
  one contact only after durable CONTACTED
  strict bounded response admission

ambiguity:
  OUTCOME_UNKNOWN
  no blind automatic READY recontact
  all post-contact non-2xx unknown by default

readyFgkey:
  separate ephemeral one-time browser-safe channel
  not persisted, logged, providerRef, or providerPaymentKey
  durable generic READY alone is non-actionable

statusFgkey / callbackFgkey:
  newly generated later status-result value
  BF4-owned; not compared with readyFgkey

SDK:
  canonical v2
  final SDK wire uses the same non-forgeable persisted-order authority as READY
  pure projectEximbaySdk alone is not final wire authority
  fixed trusted mode-to-source mapping
  one document loader / one invocation latch

financial truth:
  neither request_pay nor return_url
  existing local finalized Payment/Order evidence only
```

The current official flow-page inconsistency remains retained:

```text
SDK Preparation -> v2
Payment Page Initiation -> residual v1 snippet
```

readyFgkey TTL/reuse, READY retry/idempotency, merchant capability, directly
documented exact production SDK asset availability, and recovery after lost
handoff remain authority gaps with fail-closed boundaries. BF4 separately owns
status callback verification, duplicate/order handling, and completion.

Implementation slicing is S1 pure/injected transport, parser, and trusted SDK
wire materialization; S2 dormant server HTTP/config; S3 two-channel mocked
browser handoff/loader; separately authorized E1A READY evidence; optional
non-completing E1B SDK-surface evidence; BF4; then separately authorized E2
end-to-end sandbox. EXIMBAY routing remains disabled throughout source-only
slices.

```text
candidate status:
  DOCUMENTATION ONLY / D1R CORRECTIONS APPLIED
  HUMAN CLOSURE REVIEW: PASS
  INSTALLATION STATUS: READY FOR DOCUMENTATION INSTALLATION

reviewed semantic packet:
  WIG_PAY_EXIM_EX2B2_D1_REVIEW_v0_2.zip
  SHA-256 d74574873370b79c2db955fd8cedc4332f23b8625a280e5e20885167980b46c0

source implementation:
  NOT AUTHORIZED

provider contact:
  NONE / NOT AUTHORIZED

SDK load or execution:
  NONE / NOT AUTHORIZED

sandbox/live/customer activation:
  NONE / NOT AUTHORIZED

BF4:
  SEPARATE / DEFERRED
```

### D1R bounded independent-review correction

The D1 candidate was not installed. Independent review found two blockers,
four important findings, and one minor finding. This bounded correction closes
them by design invariant without rewriting earlier installed history:

```text
EX2B2-D1R-B01:
  CLOSED_BY_CORRECTED_DESIGN
  final READY and SDK wire order_id share the same non-forgeable persisted
  Payment.providerOrderId binding authority

EX2B2-D1R-B02:
  CLOSED_BY_CORRECTED_DESIGN
  durable READY metadata and fresh transient readyFgkey handoff are separate;
  lost/re-entered handoff is non-actionable and cannot trigger READY/request_pay

EX2B2-D1R-I01:
  CLOSED_BY_CORRECTED_DESIGN
  readyFgkey != newly generated BF4 statusFgkey; /v1/payments/verify is BF4 only

EX2B2-D1R-I02:
  CLOSED_BY_CORRECTED_DESIGN
  E1A READY-only; E1B non-completing SDK surface; E2 after BF4

EX2B2-D1R-I03:
  CLOSED_BY_CORRECTED_DESIGN
  post-contact 3xx/4xx/429/5xx -> OUTCOME_UNKNOWN by default

EX2B2-D1R-I04:
  CLOSED_BY_CORRECTED_DESIGN
  serialized browser package is untrusted; freezing is defensive only

EX2B2-D1R-M01:
  CLOSED_BY_CORRECTED_DESIGN
  unsupported nesting promise removed; exact byte/root/primitive/duplicate
  protections retained

new Payment.attemptLifecycle state:
  NOT REQUIRED
  CONTACTED + READY plus an explicit non-actionable lost-handoff service result
  deterministically represents durable truth without persisting ephemeral state

next:
  DOCUMENTATION INSTALLATION
```

## 2026-08-15 — Eximbay EX2B2-S1 READY kernel source merge and P8 source-status candidate

EX2B2-S1 is MERGED / INSTALLED / REVIEWED. The historical design authority
was installed by PR #65 at merge
`82bb1589a7c221773104f5320beeab77dac6646a`, from reviewed head
`b7539525323d6d7d441b7f9a3352ad04a7d26707`; design post-merge CI #344 was
successful. Source PR #66 (`feat(payment): add Eximbay EX2B2 S1 ready kernel`)
was reviewed at head `5dac5d92916cd539f15b7f2cda8f41f56cad4041` and merged to
main at `2bc5ad6ece6c429c2ad1375a99cb5ccfacc3dadd`, whose first parent is the
design merge. The source candidate was one commit, three paths, 1,405
additions, and zero deletions:

```text
src/lib/payment/eximbay/ready-kernel.ts
src/lib/payment/eximbay/__tests__/ready-kernel.integration.test.ts
src/lib/payment/eximbay/__tests__/s1-isolation.test.ts
```

PR CI #345 (run ID `31846538344`) completed successfully at the exact reviewed
source head. Post-merge main CI #346 (run ID `31847182344`, push on `main`)
completed successfully at exact merge `2bc5ad6ece6c429c2ad1375a99cb5ccfacc3dadd`.

The final reviewed source-closure packet was
`WIG_PAY_EXIM_EX2B2_S1_REVIEW_v0_3.zip`, SHA-256
`38ec4f46e1e5b15224fddae1b35f7f85dc69d676716045ca627951952dfc6ead`, 41,813
bytes, 15 entries. Initial independent review found BLOCKER 1, IMPORTANT 3,
and MINOR 1: missing exact success/plan binding, missing outbound byte bound,
missing response chunk-event bound, incomplete clean-baseline build
attribution, and insufficiently explicit sensitivity of the credential-free
plan body. S1R closed those five findings with bounded source corrections.
S1R2 dispositioned `S1R2-I01` as IMPORTANT and
`DEFERRED_BY_INSTALLED_BOUNDARY_TO_S2`: S1 proves only its closed
caller-supplied mode and exact endpoint mapping, not provenance from persisted
`Payment.mode`.

Final independent source closure is PASS with open S1 source blocker 0 and
important 0. The S1 source provides deterministic READY plan construction,
bounded strict response admission, exact plan/success provenance, and final
persisted-order SDK-wire data materialization through an injected transport
port. It does not install provider networking, credentials, SDK loading or
execution, `EXIMBAY.request_pay`, initiation integration, BF4, routing, or
activation.

```text
runtime authority:
  NONE

P8 Source Status:
  CANDIDATE FOR INDEPENDENT DOCUMENT REVIEW

next lawful gate:
  P8 independent documentation review/install

EX2B2-S2:
  NOT AUTHORIZED BY THIS RECORD; separate persisted-mode/config/credential
  pre-contact authority is mandatory

provider contact:
  NOT AUTHORIZED

SDK execution:
  NOT AUTHORIZED

activation:
  NOT AUTHORIZED
```

## 2026-08-15 — Eximbay EX2B2-S2 canonical fact / mode / transport design closure

The exact human-adjudicated D0R packet was
`WIG_PAY_EXIM_EX2B2_S2_D0_REVIEW_v0_2.zip`, 30,088 bytes, SHA-256
`7c1c9d8e3eb42d0f048d1f57cf2e738e0c0a041eca3ddd09c5dbfd63d68fe6c5`.
Its final independent byte-level closure passed with BLOCKER 0, IMPORTANT 0,
and MINOR 0. Human policy adjudication is complete, and D0R-I01 is closed.

The S2 Design Contract candidate freezes these application policies and becomes
installed authority only after independent review and merge:

```text
purchaser:
  owned CheckoutSession -> canonical User.name and User.email
  shipping recipientName is never a buyerName fallback

User.name activation boundary:
  initial account creation is Google OAuth only
  normalized-nonblank persistence is not proven at this baseline
  activation remains blocked until the invariant or a reviewed correction /
  collection path exists
  S2 still reloads and rejects invalid canonical purchaser facts pre-contact

language:
  JP market -> JP
  US market -> EN
  other market -> pre-contact reject
  market-default policy, not storefront-locale parity

method:
  server-validated CARD -> P000 only

environment/config:
  persisted Payment.mode owns an existing attempt
  same-mode atomic MID/API-key pair
  existing Eximbay mode mismatch preserves the exact uncontacted Payment and
  providerOrderId before generic supersession

origin:
  dedicated strict HTTPS PAYMENT_PUBLIC_ORIGIN
  no request/header/NEXTAUTH_URL fallback

contact:
  complete S1 plan with zero bytes
  exact owner/session/Payment freshness claim
  CONTACTED commits before exactly one 15-second, zero-retry, no-redirect
  transport attempt

post-contact:
  every unclassified result and every non-0000 provider result is
  OUTCOME_UNKNOWN
  exact admitted 0000 is READY only, never financial success

READY custody:
  durable generic READY is non-actionable and contains no readyFgkey
  exact fresh S1 plan + exact trusted success identity may remain only in the
  same server-memory continuation for future S3 consumption
  loss never authorizes same-attempt recontact
```

D0R-I01 is closed by preserving the exact fresh S1 plan/success pair internally
without persisting, serializing, logging, reconstructing, or exposing it from
S2. S3, not S2, owns trusted SDK-wire browser handoff and
`EXIMBAY.request_pay`; BF4, not S2, owns the reserved status path, verification,
duplicates, acknowledgement, and financial completion.

```text
S2 source:
  UNIMPLEMENTED / NOT AUTHORIZED BY DOCUMENT EXISTENCE ALONE

provider contact:
  NONE

routing:
  DISABLED / UNCHANGED

SDK / BF4 / sandbox / live / customer activation:
  NONE

next gate:
  after independently reviewed documentation merge, one separately issued
  bounded S2 Implementation Task Contract
```

## 2026-08-15 — Eximbay EX2B2-S2 source installation and P8 Source Status refresh

The exact reviewed S2 source candidate was installed by source PR #69. The
reviewed head was `002e1c778e650dc66767ef5dab5d1a7a3573b0ed` and the normal
merge to `main` was `bb2ab48176e9b6a5216e870616f4730fe9a85825`. The final
review packet was `WIG_PAY_EXIM_EX2B2_S2_I1_SOURCE_REVIEW_v0_2.zip`, 34,015
bytes, SHA-256
`fe79dc2b625c042705b3f49912965c8ec1770fd3c8308bd88fe0949ffe27e518`.

Final independent source closure was PASS with zero blocker, zero important,
and zero minor findings. The bounded I1R findings were all closed:

```text
I1R-I01  generic lifecycle predicates restored to baseline; Eximbay-specific
         claim/OUTCOME_UNKNOWN predicates retained
I1R-I02  syntax-aware S1 importer detection and exact allowlists installed
I1R-I03  exact PreparedEximbayReadyContact consumed before transport
I1R-M01  redaction evidence corrected; invalid canonical User.email pre-contact
         and zero-fetch coverage installed
```

PR CI run `31872599036` and post-merge main CI run `31872952017` completed
successfully at their exact reviewed identities. The installed S2 source is
dormant: routing, provider contact, SDK/request_pay, BF4/status completion,
sandbox/live runtime, and customer activation remain unauthorized.

This P8 lifecycle correction installs the new current
[S2 Source Status / As-Built v0.1](../engineering/eximbay-ex2b2-s2-ready-contact-source-status-v0.1.md)
and advances S1 to
[Source Status / As-Built v0.2](../engineering/eximbay-ex2b2-s1-ready-kernel-source-status-v0.2.md).
S1 production source bytes remain unchanged; reviewed S2 is now its exact
downstream production importer, so the historical S1 v0.1 no-production-
importer statement is preserved as historical and not current reachability
truth. The next lawful gates are separately authorized evidence/integration
slices, not this documentation-only P8.

## 2026-08-15 — Eximbay EX2B2-S3 reviewed source installation + P8 current As-Built refresh

The exact reviewed S3 source candidate was installed by source PR #71. The
reviewed source head was `d66b34a001e4868e887912eb8c1a1fe1b523688b` and the
normal merge to current `main` was
`7d619c893f05ccc163dafb7eb6f07c16c055b0d0`. The reviewed source packet was
`WIG_PAY_EXIM_EX2B2_S3_I1_SOURCE_REVIEW_v0_2.zip`, 44290 bytes, SHA-256
`c717b8be4a18052995a82c004d6113f93c9e2a60b5315e04be88f9d5e4aac42a`; the
reviewed full diff was 138121 bytes, SHA-256
`e9f9922aa4a77604dea45b472fe6aee2b41473b55d0585badfd305cbb3899ad9`.

Final independent S3 source closure passed with BLOCKER 0, IMPORTANT 0, and
MINOR 0. PR CI `31888938288` and post-merge main CI `31889295693` passed. The
installed candidate is exactly 16 paths (7 ADD, 9 MODIFY). It is dormant and
non-authoritative: routing remains disabled; no provider contact, real SDK
load, real `EXIMBAY.request_pay`, credentials, BF4/status behavior, CSP/header
activation, or customer runtime was used or enabled.

The S3 merge establishes the current reachability consequences for the earlier
records. EX2A remains the full unchanged pure protocol kernel; the only new
EX2A reachability is `sdk-handoff.ts` consuming `decodeEximbayAmount(...)` for
locked Payment amount/currency lineage comparison. S1's kernel bytes remain
unchanged while the exact production importer allowlists now include the S2
modules and S3 server handoff. S2 retains canonical purchaser, persisted mode,
atomic MID/API-key resolution, opaque Authorization custody, one-shot contact,
conservative outcome, and transient FreshAuthority custody; no real credential
value or provider use is approved. S3 consumes that authority once and does
not make durable READY actionable. Its production loader is concrete SDK-load-
capable source; fake DOM/global tests are synthetic, the current application
consumer is zero, and no real SDK was fetched or executed.

This independently reviewed P8 refresh records the four current Source Status versions:

```text
EX2A Source Status v0.2 — current pure-kernel As-Built
S1  Source Status v0.3 — current importer/reachability As-Built
S2  Source Status v0.2 — current contact/handoff As-Built
S3  Source Status v0.1 — current installed dormant browser-handoff As-Built
```

Every historical predecessor remains byte-for-byte preserved and linked as
historical; no source, test, schema, config, routing, CSP, CI, or dependency
path is changed by this documentation refresh.

Initial independent P8 documentation review disposition was BLOCKER 0,
IMPORTANT 4, MINOR 1. The bounded corrections close the authored
defects as follows: P8R-I01 restores the full EX2A scope and correct next gate;
P8R-I02 records the production attempt-channel delta and exact S2 credential
ownership; P8R-I03 records the concrete dormant loader, fixed source/class,
state behavior and correction history; P8R-I04 restores governing,
limitations, rollback and change-control metadata; P8R-M01 applies HIGH risk
taxonomy and consistent lifecycle wording. Corrections are applied. Final
independent documentation closure is:

```text
PASS — BLOCKER 0 / IMPORTANT 0 / MINOR 0
```

The final reviewed packet is
`WIG_PAY_EXIM_EX2B2_S3_P8_REVIEW_v0_2.zip`, 39039 bytes, SHA-256
`ef4fb2b8111974733fd853e174cc9d0cc3568187a5a1ad64a6eca2ebaf275d61`.
The final-reviewed six-path diff is 41757 bytes, SHA-256
`16abae6ab46d052b064a19ae0bb26111adffc8f72fbaf935fec3b9848652bf51`.

D22 remains `S1 -> S2 -> S3 -> E1A -> E1B`. After this reviewed P8 Source
Status refresh is installed, the next D22 gate is separately authorized E1A.
E1A is not authorized by this entry.

## 2026-08-16 — Eximbay EX2B2-E1A D1R3 execution-assurance reconciliation installed

E1A Execution Contract v0.1 could overstate user-space workflow evidence as
malicious-same-user executable attestation. Higher-precedence EX2B2 threat
authority instead retains process compromise and compromised server code as
residual risks. D1R3 therefore reconciled the claim to trusted-local-
operator/host workflow and artifact evidence without weakening the installed
H1 operational controls.

Independent D1R3 review passed with BLOCKER 0, IMPORTANT 0, and MINOR 0. PR #74
installed the exact reviewed v0.2 bytes: reviewed head
`c8bf5e1db94bde9e1f5e45b8138d2ebb16df264d`, merge
`be49d616eddf2b8e9aa16e09f22796064c877e29`, and successful post-merge CI run
`31929728330`. The installed contract is
[E1A Execution Contract v0.2](../engineering/eximbay-ex2b2-e1a-ready-transport-evidence-execution-contract-v0.2.md),
SHA-256
`14d19c6fe327b0bb38fc0dae04fcb04848117a0657ad978eee5279d90004b29f`;
the reviewed D1R3 packet SHA-256 is
`822096be479db1ed2bbd3d98bb3e8ad4fde3054a27fb3aeb44f3a283302a1656`.

Version v0.2 now supersedes v0.1 for future E1A H1 and E1A invocation
authority. Version v0.1 remains immutable historical review evidence.
H1R4-D01 is closed. The next work is limited to one separately authorized,
zero-contact H1R5 correction of H1R4-B01, H1R4-I01, and H1R4-I02 using the
installed v0.2 authority.

External attestation and malicious-same-user threat architecture must not be
reopened absent a new higher-authority change. This decision and its linked
[Source Status / As-Built](../engineering/eximbay-ex2b2-e1a-contract-source-status-v0.1.md)
grant no H1 execution, provider-contact, credential, database, SDK,
`request_pay`, routing, or activation authority.

## 2026-08-16 — Eximbay MIRA-PUBLIC-READY-1 closure and E1A track retirement

### Frozen execution identity and admitted result

```text
execution source:
  e19edce4cec21d5640ab48cb4c8f295b3b4ef767

execution tree:
  ce8e16bc5ebb86c59a3b4d2f01e56574314dd1a8

MIRA-PUBLIC-READY-1:
  CLOSED / ADMITTED

provider contacts:
  1

automatic retries:
  0

contactedBefore:
  true

HTTP status / media type:
  200 / application/json

provider result:
  READY_ADMITTED

durable lifecycle:
  INITIATED / CONTACTED / READY

fresh authority created:
  true

bounded financial or customer side effects:
  NONE

SDK / request_pay / BF4:
  NONE

external sanitized Result bytes:
  1258

external sanitized Result SHA-256:
  69d644f0003f24846779cfaf3cd06ee06ecd930a984d5515aeb727e6a56ef9f0
```

The admitted execution used exactly one READY provider contact and no retry.
It created fresh authority and durably recorded `INITIATED`, `CONTACTED`, and
`READY`. It did not invoke an SDK, `request_pay`, or BF4, and produced no
bounded financial or customer side effect.

### Retirement and future authority

The account-bound E1A track tied to
`e19edce4cec21d5640ab48cb4c8f295b3b4ef767` is **RETIRED**. Account-bound E1A
is deferred. H1 v0.6 is historical, reviewed, external-only material and has
no standing invocation authority; this record does not claim that H1 is
installed.

Any future E1A re-entry requires a fresh rebind to then-current `main` and
explicit human authority. Historical contracts remain unchanged, and this
closure creates no provider contact, SDK, `request_pay`, BF4, routing, or
activation authority.

## 2026-08-16 — Eximbay EX2B2 E1A/E1B independent evidence branches

The human architecture decision for the EX2B2 Design Contract v0.2
changes only the prospective evidence sequence:

```text
PREVIOUS PARENT SEQUENCE:
  S1 -> S2 -> S3 -> E1A -> E1B

ADJUDICATED CHANGE:
  S1 -> S2 -> S3
                +-> E1A
                +-> E1B
```

E1A and E1B answer different evidence questions. E1A is merchant/account-bound
READY transport-capability evidence. E1B is credential-free, non-completing
public TEST v2 SDK load/global/callable evidence and consumes no READY
authority, FGKey, MID/API key/Authorization, Payment state, merchant capability,
or `request_pay` authority. Therefore E1A is not a physical or authority
dependency of bounded E1B after Design Contract v0.2 is human-reviewed and
installed.

```text
MIRA-PUBLIC-READY-1:
  CLOSED / ADMITTED
  separate evidence; not E1B prerequisite

account-bound E1A:
  DEFERRED / NOT SATISFIED

E1B:
  NOT EXECUTED
  requires reviewed installation + separate human invocation

E2:
  BLOCKED pending BF4 readiness + separately adjudicated merchant/sandbox authority
```

This entry is durable evidence of the human adjudication; the detailed
normative semantics belong to Design Contract v0.2 and become governing through
reviewed installation. E1B still requires a separate human invocation after
installation. This entry creates no provider/API/SDK contact, credential or
Payment-state use, `request_pay`, BF4/completion, routing, LIVE, customer, or
activation authority and does not rewrite historical E1A evidence.

## 2026-08-17 — Eximbay BF4 dedicated dormant status verification/completion architecture

The reviewed human architecture adjudication for BF4 adopts a dedicated
dormant `status_url` orchestrator and rejects generic-webhook generalization as
its first owner. The detailed normative semantics belong to the reviewed
[BF4 Design Contract](../engineering/eximbay-bf4-status-verification-completion-design-contract-v0.1.md)
and companion
[Threat / Failure Model](../engineering/eximbay-bf4-status-verification-completion-threat-model-v0.1.md),
and become governing upon reviewed documentation installation; this entry is
the durable decision-log summary.

```text
ADOPT:
  dedicated dormant BF4 orchestrator

REJECT:
  generic webhook generalization as first BF4 owner
  verify-only direct completion

SCHEMA:
  no schema change, conditional on the closed BF4 PaymentEvent envelope and
  exact transition table

COMPLETION:
  existing completeFromCapture only

VERIFY:
  integrity only

RETRIEVE:
  authoritative SALE/money/identity required before completion

AMBIGUITY:
  Payment attempt OUTCOME_UNKNOWN + retained event claim
  no automatic provider recontact

E1B:
  CLOSED / ADMITTED

E1A:
  DEFERRED / NOT SATISFIED

E2:
  still blocked
```

Correction: definitive `/verify` rejection does not simply erase the
transaction claim. It atomically rotates the active transaction claim into an
exact-raw rejection tombstone, releasing the transaction namespace while
preventing repeated verification of identical rejected raw input. The
reviewed Design Contract remains the detailed normative owner.

Targeted closure correction: reject-tombstone lookup is required both before
and after successful contact-claim acquisition, inside the claim-admission
transaction. Provider contact begins only after that transaction commits. This
closes the tombstone/claim TOCTOU without a schema change.

The current official Eximbay documentation leaves callback HTTP method,
query-string carrier location, callback content type, acknowledgement HTTP
status/content type, merchant-selected failure code/message, `/verify` and
`/retrieve` retry semantics, `transaction_date` timezone, and literal `+`
behavior unresolved. These remain future transport/evidence gates, not
provider facts.

The accepted raw-retention policy keeps exact callback raw only while needed
for verification, ambiguity adjudication, or local completion recovery; a
terminal processed/rejected event replaces it with SHA-256 plus allowlisted
facts/diagnostics. Unresolved ambiguous events may retain exact raw until human
resolution. A time-based unresolved-event retention rule remains a future
human privacy/operations gate.

This reviewed decision grants documentation authority only. It creates no source,
schema, provider/API/SDK contact, credential, `request_pay`, routing,
sandbox/LIVE, customer, E2, or activation authority. Targeted correctness
review is PASS. After documentation installation, the next gate is a separately
authorized dormant BF4 source implementation task.

## 2026-08-17 — Eximbay BF4 authoritative SALE money-mismatch owner correction / closure

BF4 I1 implementation discovery exposed a frozen v0.1 conflict between the
pre-success use of `RECONCILIATION_REQUIRED` and the installed Payment database
constraints. The source implementation is paused for design-authority
correction. The detailed reviewed normative owner is the
[BF4 Design Contract v0.2](../engineering/eximbay-bf4-status-verification-completion-design-contract-v0.2.md);
this entry is decision evidence only.

```text
IMPLEMENTATION DISCOVERY:
  BF4 I1 exposed a frozen v0.1 mismatch between pre-success
  RECONCILIATION_REQUIRED and installed Payment constraints.

DISPOSITION:
  source implementation paused for design authority correction.

ADOPT:
  authoritative SALE money mismatch remains Payment OUTCOME_UNKNOWN with
  remediationStatus NONE and no providerPaymentKey/financialSucceededAt;
  PaymentEvent VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION owns the
  provider-observed mismatch.

REJECT:
  promoting Payment to SUCCEEDED solely to satisfy remediation enum constraints
  schema weakening
  new reconciliation state/table
  silently treating mismatch as exact SALE

I1:
  preserved uncommitted
  not yet implementation-admitted
```

Targeted review accepted the D2 semantic direction but found one blocker and
two important same-class authority-closure defects:

```text
F1:
  Threat Model v0.1 T-BF4-17 retained the impossible pre-success
  RECONCILIATION_REQUIRED claim.

CORRECTION:
  version Threat Model to v0.2 and supersede that phrase.

F2:
  money-mismatch scope requires transaction_type=PAYMENT.

F3:
  when Payment is transition-safe, its OUTCOME_UNKNOWN transition and the
  VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION event evidence must commit
  atomically in one local database transaction.

HUMAN TARGETED CLOSURE:
  PASS

F1:
  CLOSED

F2:
  CLOSED

F3:
  CLOSED

ARCHITECTURE:
  unchanged

SCHEMA:
  unchanged

I1:
  preserved / paused / not admitted
```

The Design Contract v0.2 and
[Threat / Failure Model v0.2](../engineering/eximbay-bf4-status-verification-completion-threat-model-v0.2.md)
form the v0.2 authority pair, governing upon reviewed installation. Both v0.1
documents remain immutable historical predecessors. This bounded
correction creates no source, schema, migration, provider/API/SDK contact,
credential, `request_pay`, routing, E2, or activation authority. The next gate
is `SEPARATELY AUTHORIZED BF4 I1 REBIND/CORRECTION + IMPLEMENTATION CORRECTNESS CLOSURE`.
