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
