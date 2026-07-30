# D5 Source Vocabulary Contract v0.2

## Status

```text
DESIGN:                 FROZEN — D5 source vocabulary v0.2
SOURCE IMPLEMENTATION:  FROZEN at reviewed source head a7c3522d14443c45b98c916d037c4ae0bea780c6
SOURCE MERGE:           20ccceb0e8e98d2c8de3e7f87a867ce115a2792a
PRODUCTION ACTIVATION:  NOT AUTHORIZED
CHANGE CONTROL:         supersedes d5-source-vocabulary-contract-v0.1.md
```

This contract is the current normative authority for D5 source vocabulary. It
supersedes
[`d5-source-vocabulary-contract-v0.1.md`](./d5-source-vocabulary-contract-v0.1.md)
while incorporating the v0.1 frozen foundation without semantic change. The
v0.1 file remains an immutable historical record and must not be edited in
place.

The reviewed implementation is source evidence. This versioned contract, the
README authority pointer, the decision-log record, and the immutable evidence
snapshot install the normative v0.2 freeze. Future changes to frozen
vocabulary require a later versioned contract.

This contract freezes source semantics. It does not establish production
catalog truth, a production request or policy transport, ranking, events,
commerce behavior, or production activation.

## Scope

This contract governs D5 source-only responsibilities for:

- query normalization and raw-range correspondence;
- deterministic injected parsing;
- unsupported-concept and contradiction representation;
- pure constraint decisions;
- source-only reason and explanation vocabulary;
- governed stylistic categorical query policy;
- required-only stylistic fixture-product evidence decisions;
- request-local categorical-policy semantics;
- runtime invalid-input boundaries relevant to D5-S1;
- source component-version attribution.

It does not own or authorize:

- production lexicon or ontology values;
- production policy storage, persistence, or transport;
- product-evidence ingestion adapters;
- catalog truth;
- production retrieval or ranking;
- D6-B1 aggregation or result vocabulary;
- recommendation;
- events or event storage;
- routes or UI;
- commerce, cart, checkout, payment, or orders;
- fitting, rendering, or manufacturing;
- D5-S2 continuous query policy;
- production activation.

## Classification model

Every covered symbol is classified independently on three orthogonal axes:

| Axis | Values |
| --- | --- |
| Stability | `FROZEN_SOURCE_V0_1`, `FROZEN_SOURCE_V0_2`, `STILL_PROVISIONAL`, `REMOVED` |
| Scope | `DURABLE_DISCOVERY`, `INTERNAL_ONLY`, `FIXTURE_ONLY`, `DOWNSTREAM_D6_ONLY` |
| Surface | `MODULE_RESPONSIBILITY`, `PRIMARY_ENTRYPOINT`, `SUPPORTING_EXPORT`, `SERIALIZED_OUTPUT_SHAPE`, `SERIALIZED_LITERAL`, `REGISTRY_METADATA`, `TYPE_ONLY_HELPER`, `RUNTIME_VALIDATION_RULE`, `NORMATIVE_BEHAVIOR`, `TEST_ONLY_ATTRIBUTION` |

These axes remain independent. Freezing the semantic meaning of a categorical
policy disposition does not promote the fixture carrier that currently
transports it in synthetic tests into a production schema.

## Inherited v0.1 foundation

All items in this section are incorporated from v0.1 without semantic change.
They retain their v0.1 stability classification unless this contract
explicitly says otherwise.

### Module responsibilities and primary entrypoints

The five D5 module responsibilities remain
`FROZEN_SOURCE_V0_1 + DURABLE_DISCOVERY + MODULE_RESPONSIBILITY`:

| Module | Frozen responsibility |
| --- | --- |
| `types.ts` | Owns the D5 source type vocabulary. |
| `versions.ts` | Owns the source component-version registry. |
| `normalize-query.ts` | Owns pure query normalization and raw-range correspondence. |
| `parse-query.ts` | Owns deterministic injected parsing. |
| `decide-constraint.ts` | Owns pure D5 constraint decisions. |

The primary entrypoints remain
`FROZEN_SOURCE_V0_1 + DURABLE_DISCOVERY + PRIMARY_ENTRYPOINT`:

- `normalizeQuery`;
- `parseQuery`;
- `decideConstraint`.

This freezes responsibilities and dependency direction, not a permanently
closed five-file subtree. `mapNormalizedRangeToRaw` remains a provisional
internal supporting export.

### Frozen serialized output shapes

The following top-level field sets remain
`FROZEN_SOURCE_V0_1 + DURABLE_DISCOVERY + SERIALIZED_OUTPUT_SHAPE`:

| Shape | Frozen fields |
| --- | --- |
| `TextRange` | `startInclusive`, `endExclusive` |
| `NormalizedOffsetMapEntry` | `normalizedRange`, `rawRange` |
| `NormalizedQuery` | `rawText`, `comparisonText`, `normalizationForm`, `coordinateSystem`, `inputState`, `offsetMap` |
| `QuerySpan` | `spanId`, `constraintId`, `rawRange`, `normalizedRange`, `rawText`, `normalizedText`, `owner`, `conceptId`, `lexiconEntryId`, `identityRecognizerId`, `languageTag`, `interpretationState` |
| `InterpretedConstraint` | `constraintId`, `value`, `source`, `interpretationState`, `attributeBand`, `decisionProfile` |
| `UnsupportedConcept` | `constraintId`, `conceptId`, `spanId`, `state` |
| `Contradiction` | `constraintId`, `leftConstraintId`, `rightConstraintId`, `attributeId`, `kind` |
| `ParserResult` | `normalizedQuery`, `spans`, `constraints`, `unsupported`, `contradictions`, `diagnostics`, `parserVersion`, `lexiconVersion`, `ontologyVersion` |
| `ConstraintDecision` | `constraintId`, `subject`, `authorityOutcome`, `gate`, `score`, `speechRequirements`, `partition`, `relaxation`, `fallbackRoutes`, `reasons`, `diagnostics` |

`ConstraintDecision` therefore remains exactly eleven fields. No
required/preference field is added. Nested payload shapes that v0.1 did not
freeze remain provisional.

### Frozen normalization, parsing, and constraint literals

These v0.1 literals remain frozen and unchanged:

| Vocabulary | Frozen literals |
| --- | --- |
| normalization form | `NFC` |
| coordinate system | `UTF16_CODE_UNIT` |
| normalized input state | `EMPTY`, `NON_EMPTY` |
| interpretation state | `DECLARED`, `DERIVED`, `BRIDGED`, `UNRESOLVED` |
| constraint value kind | `EXACT_IDENTITY`, `CATEGORICAL`, `CONTINUOUS`, `OUTCOME_INTENT`, `UNKNOWN_OR_UNSUPPORTED`, `AUTHORITY_ROUTE` |
| constraint source kind | `QUERY_SPAN`, `USER_CONFIRMATION` |
| attribute band | `IDENTITY`, `CLAIM_BEARING`, `DIMENSIONAL_CONTINUOUS`, `STYLISTIC`, `OUTCOME_INTENT`, `AUTHORITY_ROUTE` |
| query span owner | `EXACT_IDENTITY`, `CONCEPT`, `NUMBER_WITH_UNIT`, `OUTCOME_INTENT`, `AUDIENCE_ROUTE`, `UNSUPPORTED` |
| unsupported constraint state | `UNSUPPORTED`, `AMBIGUOUS` |
| unsupported-concept output state | `UNRESOLVED` |
| contradiction kind | `MUTUALLY_EXCLUSIVE_VALUES` |

Only the query-level `DecisionSubject.kind = QUERY` and
`ConstraintDecisionTarget.decisionLevel = QUERY` are inherited durable
subject/level literals. `FIXTURE_PRODUCT`, its decision level, and
`fixtureProductId` remain fixture-only and provisional.

### Frozen decision vocabulary

The v0.1 decision vocabulary remains frozen and unchanged:

| Vocabulary | Frozen literals |
| --- | --- |
| authority outcome | `PRESERVE_CALLER_CONTEXT`, `OUTSIDE_DISCOVERY_AUTHORITY`, `NOT_APPLICABLE` |
| gate decision | `ASSERT_MATCH`, `DO_NOT_GATE`, `REQUIRE_CLARIFICATION`, `ROUTE_ONLY`, `UNSUPPORTED` |
| score decision | `NONE`, `PREFERENCE_ALLOWED` |
| speech requirement | `NO_PRODUCT_ASSERTION`, `DISCLOSE_EVIDENCE_BASIS`, `DISCLOSE_UNKNOWN`, `DISCLOSE_ROUTE_LIMITATION` |
| evidence partition | `ASSERTED`, `UNKNOWN`, `VIOLATING`, `WITHHELD`, `NOT_APPLICABLE` |
| relaxation decision | `NEVER`, `CONFIRMATION_REQUIRED`, `NOT_APPLICABLE` |
| fallback route | `CLARIFICATION`, `EDUCATION_OR_CONSULTATION`, `AUDIENCE_SWITCH_OFFER`, `EXPLICIT_UNSUPPORTED`, `EXACT_IDENTITY_NOT_FOUND` |

### Inherited durable reason codes

The exact twelve v0.1 durable `DiscoveryReasonCode` literals remain frozen
without semantic change:

1. `EXACT_IDENTITY_MATCH`
2. `EXACT_IDENTITY_NO_SUBSTITUTION`
3. `EVIDENCE_QUALIFIED_MATCH`
4. `EVIDENCE_QUALIFIED_MISMATCH`
5. `PRODUCT_EVIDENCE_UNKNOWN`
6. `PRODUCT_EVIDENCE_CONFLICT`
7. `CLAIM_AUTHORITY_UNAVAILABLE_ROUTE`
8. `UNSUPPORTED_CONCEPT`
9. `CONTRADICTORY_QUERY`
10. `CONFIRMATION_CHANGED_INTENT_ONLY`
11. `AUDIENCE_NAMESPACE_PRESERVED`
12. `MODEL_INFERRED_CLAIM_HAS_NO_AUTHORITY`

Durable discovery reasons remain separate from fixture reasons and
diagnostics. `FixtureReasonCode`, `FixtureDecisionDiagnostic`, and their
current values remain fixture-only and provisional. The combined
`ConstraintReasonCode` source type does not promote fixture reasons into
durable discovery vocabulary.

### Inherited behavioral invariants

The v0.1 invariants remain frozen:

- raw query text is preserved exactly;
- comparison text uses whole-string NFC normalization and UTF-16 code-unit
  coordinates;
- every emitted raw range slices the exact represented raw surface;
- query interpretation and product evidence remain independent;
- query-level and fixture-product-level decisions are not interchangeable;
- a query cannot switch the caller-provided audience namespace;
- model-inferred claims have no assertion authority;
- D5 introduces no weighted policy score or production ranking;
- unsupported, contradiction, unknown, conflict, mismatch, route, and
  exact-identity outcomes preserve their reason semantics;
- D5 grants no retrieval, recommendation, commerce, event, or production
  authority.

### Removed v0.1 vocabulary

The four v0.1 removals remain `REMOVED` and inactive:

- `AttributeBand.STRUCTURAL_FUNCTIONAL`;
- `AttributeBand.DIMENSIONAL_CATEGORICAL`;
- `SpeechRequirement.DISCLOSE_RELAXATION`;
- `RelaxationDecision.DISCLOSED_AUTOMATIC`.

They may return only through a later versioned contract with implemented
semantics and behavioral tests.

## Component versions

The current registry classifications are:

| Component | Value | Classification |
| --- | --- | --- |
| normalizer | `d5-conservative-normalizer/v0.1` | `FROZEN_SOURCE_V0_1 + DURABLE_DISCOVERY + REGISTRY_METADATA` |
| parser | `d5-injected-span-parser/v0.1` | `FROZEN_SOURCE_V0_1 + DURABLE_DISCOVERY + REGISTRY_METADATA` |
| constraint rules | `d5-constraint-decisions/v0.2` | `FROZEN_SOURCE_V0_2 + DURABLE_DISCOVERY + REGISTRY_METADATA` |
| request schema | `d5-source-only-request/v0.2-provisional` | `STILL_PROVISIONAL + DURABLE_DISCOVERY + REGISTRY_METADATA` |
| golden fixture | `d5-golden-cases/v0.2-provisional` | `STILL_PROVISIONAL + FIXTURE_ONLY + REGISTRY_METADATA` |

The `v0.2` constraint-rules value means reviewed source-only authority. It
does not mean production activation.

## Final v0.2 durable vocabulary

### Decision profile

`GOVERNED_STYLISTIC_CATEGORICAL` is
`FROZEN_SOURCE_V0_2 + DURABLE_DISCOVERY + SERIALIZED_LITERAL`.

Only this new `D5DecisionProfile` literal is promoted by v0.2. Existing profile
labels that v0.1 left provisional remain provisional.

### Query gate

`REQUIRE_MATCH` is
`FROZEN_SOURCE_V0_2 + DURABLE_DISCOVERY + SERIALIZED_LITERAL`.

Its subject-aware meaning is:

- `QUERY + REQUIRE_MATCH` represents required intent for which a future
  candidate still needs a satisfying evidence-qualified product decision;
- it is not an evidence assertion;
- a query decision using `REQUIRE_MATCH` never uses the `ASSERTED` partition;
- fixture-product decisions never emit `REQUIRE_MATCH`;
- product evidence assertion remains `ASSERT_MATCH + ASSERTED`.

### Categorical policy dispositions

The following semantic literal set is
`FROZEN_SOURCE_V0_2 + DURABLE_DISCOVERY + SERIALIZED_LITERAL`:

- `REQUIRED`;
- `PREFERENCE`;
- `ROUTE`;
- `CLARIFICATION`;
- `UNSUPPORTED`.

These meanings are durable D5 policy semantics. Their current exported alias
name and fixture carrier are not thereby promoted into a production request
schema. Additions or semantic changes require a later versioned contract.

### New durable reason codes

The following six `DiscoveryReasonCode` literals are
`FROZEN_SOURCE_V0_2 + DURABLE_DISCOVERY + SERIALIZED_LITERAL`:

1. `CATEGORICAL_REQUIRED_BY_POLICY`
2. `CATEGORICAL_PREFERENCE_BY_POLICY`
3. `CATEGORICAL_OUTSIDE_DISCOVERY_AUTHORITY_ROUTE`
4. `CATEGORICAL_CLARIFICATION_REQUIRED`
5. `CATEGORICAL_UNSUPPORTED_BY_POLICY`
6. `MODEL_INFERRED_STYLISTIC_HAS_NO_ASSERTION_AUTHORITY`

The total durable reason set is the inherited twelve plus these six. The five
categorical-policy reasons correspond one-to-one with the five query
dispositions. The route reason is categorical-policy-specific and does not
broaden `CLAIM_AUTHORITY_UNAVAILABLE_ROUTE`.

`MODEL_INFERRED_STYLISTIC_HAS_NO_ASSERTION_AUTHORITY` denies assertion
authority for a required product match. It does not prohibit a future,
separately governed bounded and non-authoritative stylistic ranking signal.
The broad string `MODEL_INFERRED_STYLISTIC_HAS_NO_AUTHORITY` is superseded,
removed, and must not be emitted.

## Fixture-only provisional categorical policy carrier

The following remain
`STILL_PROVISIONAL + FIXTURE_ONLY`:

- the exported alias name `CategoricalPolicyDisposition`;
- the exported type name `CategoricalPolicyFixture`;
- the `CATEGORICAL_POLICY` discriminator;
- the exact seven-field carrier:
  - `kind`;
  - `fixtureOnly`;
  - `synthetic`;
  - `targetConstraintId`;
  - `attributeId`;
  - `disposition`;
  - `policyVersion`;
- fixture `policyVersion` values.

The five disposition meanings are frozen, but the carrier, exported names,
discriminator, and exact seven-field shape are synthetic fixture
infrastructure. They define no production policy persistence, transport, API,
or database schema.

## Frozen governed categorical query behavior

All query tuples have `diagnostics = []`.

| Disposition | Authority | Gate | Score | Partition | Relaxation | Speech | Fallback | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `REQUIRED` | `NOT_APPLICABLE` | `REQUIRE_MATCH` | `NONE` | `NOT_APPLICABLE` | `NEVER` | `NO_PRODUCT_ASSERTION` | none | `CATEGORICAL_REQUIRED_BY_POLICY` |
| `PREFERENCE` | `NOT_APPLICABLE` | `DO_NOT_GATE` | `PREFERENCE_ALLOWED` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `NO_PRODUCT_ASSERTION` | none | `CATEGORICAL_PREFERENCE_BY_POLICY` |
| `ROUTE` | `OUTSIDE_DISCOVERY_AUTHORITY` | `ROUTE_ONLY` | `NONE` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `NO_PRODUCT_ASSERTION`, `DISCLOSE_ROUTE_LIMITATION` | `EDUCATION_OR_CONSULTATION` | `CATEGORICAL_OUTSIDE_DISCOVERY_AUTHORITY_ROUTE` |
| `CLARIFICATION` | `NOT_APPLICABLE` | `REQUIRE_CLARIFICATION` | `NONE` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `NO_PRODUCT_ASSERTION`, `DISCLOSE_ROUTE_LIMITATION` | `CLARIFICATION` | `CATEGORICAL_CLARIFICATION_REQUIRED` |
| `UNSUPPORTED` | `NOT_APPLICABLE` | `UNSUPPORTED` | `NONE` | `UNKNOWN` | `NOT_APPLICABLE` | `NO_PRODUCT_ASSERTION`, `DISCLOSE_ROUTE_LIMITATION` | `EXPLICIT_UNSUPPORTED` | `CATEGORICAL_UNSUPPORTED_BY_POLICY` |

Query eligibility is exactly:

```text
value.kind = CATEGORICAL
interpretationState = DECLARED
attributeBand = STYLISTIC
decisionProfile = GOVERNED_STYLISTIC_CATEGORICAL
exactly one matching injected categorical policy
matching request-local targetConstraintId
matching attributeId
```

Continuous query policy remains outside D5-S1.

## Frozen required-product behavior

Fixture-product evaluation is permitted only with a matching `REQUIRED`
categorical policy.

| Evidence state | Gate | Score | Partition | Result |
| --- | --- | --- | --- | --- |
| authoritative, same attribute and value | `ASSERT_MATCH` | `NONE` | `ASSERTED` | satisfies |
| authoritative, same attribute and different value | `DO_NOT_GATE` | `NONE` | `VIOLATING` | does not satisfy |
| absent evidence | `DO_NOT_GATE` | `NONE` | `UNKNOWN` | does not satisfy |
| non-authoritative or unknown evidence | `DO_NOT_GATE` | `NONE` | `UNKNOWN` | does not satisfy |
| conflicting evidence | `DO_NOT_GATE` | `NONE` | `WITHHELD` | does not satisfy |
| model-inferred evidence | `DO_NOT_GATE` | `NONE` | `UNKNOWN` | no assertion authority |

Only these evidence states may assert in D5-S1:

- `VERIFIED_OR_MEASURED`;
- `HUMAN_CURATED_FROM_EVIDENCE`.

The following are invalid D5-S1 fixture inputs and produce no candidate
decision:

- explicitly wrong attribute identity;
- categorical `NOT_REPRESENTABLE`;
- fixture-product evaluation under a non-`REQUIRED` disposition.

The inherited conservative behavior remains:

- evidence for another `fixtureProductId` is treated as absent and becomes
  `UNKNOWN`;
- confirmed product decisions retain `CONFIRMATION_REQUIRED`;
- no product decision emits `REQUIRE_MATCH`;
- no D5-S1 product decision emits `PREFERENCE_ALLOWED`;
- query `PREFERENCE`, `ROUTE`, `CLARIFICATION`, and `UNSUPPORTED` do not
  authorize product evaluation.

`CONFIRMATION_REQUIRED` on a confirmed product outcome is the inherited
relaxation boundary. This contract does not newly authorize relaxation.

## Confirmation and runtime validation

The following confirmation behavior is
`FROZEN_SOURCE_V0_2 + DURABLE_DISCOVERY + NORMATIVE_BEHAVIOR`:

- `USER_CONFIRMATION` reuses `CONFIRMATION_CHANGED_INTENT_ONLY`;
- confirmation changes intent only;
- confirmation does not create, upgrade, or repair product evidence;
- for the governed stylistic categorical profile, `priorConstraintId` must
  equal the current `constraintId`;
- the parser remains responsible for confirming prior semantic-value equality;
- confirmed product outcomes retain inherited `CONFIRMATION_REQUIRED`.

The observable invalid-input boundary is
`FROZEN_SOURCE_V0_2 + FIXTURE_ONLY + RUNTIME_VALIDATION_RULE`:

- categorical disposition is one of the five exact literals;
- policy `fixtureOnly` and `synthetic` are exactly boolean `true`;
- D5-S1 evidence `fixtureOnly` and `synthetic` are exactly boolean `true`;
- `policyVersion`, `targetConstraintId`, and `attributeId` are nonblank runtime
  strings;
- missing, duplicate, conflicting, unexpected-kind, target-mismatched, and
  attribute-mismatched categorical policy input is invalid;
- invalid input throws `TypeError`.

Exact error-message wording remains internal and provisional. These fixture
checks do not define a production policy schema.

## Request-local identity and caller obligation

The enforceable D5 source boundary is:

```text
one decideConstraint invocation
+ exactly one categorical policy
+ exact targetConstraintId
+ exact attributeId
```

This is
`FROZEN_SOURCE_V0_2 + DURABLE_DISCOVERY + NORMATIVE_BEHAVIOR`.

- Constraint IDs are request-local, not globally durable identifiers.
- D5 stores no policy registry or cross-request cache.
- Per-invocation injection is the enforceable D5 source boundary.
- Sibling constraints cannot reuse policy by attribute alone.
- Cross-request policy lifecycle belongs to future caller/orchestration work.
- No request-scope token or D5 batch API is frozen or authorized.

## D6 compatibility and dependency

- D6-A exact behavior remains unchanged.
- D6-A continues to require product `ASSERT_MATCH + ASSERTED` with
  exact-identity reasons.
- D6-A test-only attribution may carry
  `d5-constraint-decisions/v0.2`.
- No retrieval production source changed in D5 v0.2.
- The D6-A landing-event test change was attribution-only.

The D6-A constraint-rules attribution is
`FROZEN_SOURCE_V0_2 + DOWNSTREAM_D6_ONLY + TEST_ONLY_ATTRIBUTION`; it does not
promote an event schema or production event implementation.

D6-B1 may begin only after this contract, the README authority pointer, the
decision-log record, and the evidence snapshot merge. This contract does not
authorize the D6-B1 whole-request predicate, aggregate statuses, candidate
enumeration, or result vocabulary. Those remain for a separately authorized
source task.

## Provisional and deferred boundaries

The following remain provisional:

- `RawQueryInput` exact shape;
- locale, language, audience, query-language, and discovery-context wrapper
  shapes and factory signatures;
- existing `D5DecisionProfile` labels other than
  `GOVERNED_STYLISTIC_CATEGORICAL`;
- query lexicon, unit, exact-recognizer, confirmation, and parser helper
  shapes not frozen by v0.1;
- `ConstraintDecisionTarget`, `DecideConstraintInput`, and decision-target
  helper type names and exact shapes;
- parser diagnostics and exact diagnostic schemas;
- nested constraint payload shapes not expressly frozen;
- fixture evidence, policy, reason, diagnostic, and synthetic data carriers;
- component registry implementation details beyond frozen values;
- `d5-source-only-request/v0.2-provisional`;
- `d5-golden-cases/v0.2-provisional`.

The following work remains deferred and unauthorized:

- product preference evidence and ranking;
- D5-S2 continuous query policy;
- measurement method, unit, evidence, and tolerance governance;
- D6-B1 source until this freeze merges;
- D6-B2 numeric retrieval;
- exact-plus-structured composition;
- production governed adapters;
- production ontology and lexicon values;
- events, commerce, and production activation.

## Rejected representations

v0.2 rejects:

- query-level `ASSERT_MATCH`;
- adding required/preference fields to the eleven-field
  `ConstraintDecision`;
- a parallel structured-constraint plan;
- treating the fixture policy carrier as production transport;
- a global attribute-default policy;
- request-global reuse of request-local IDs;
- a D5 batch API for D6-B1;
- the broad reason spelling
  `MODEL_INFERRED_STYLISTIC_HAS_NO_AUTHORITY`;
- silently dropping non-required constraints before D6-B1 enumeration.

## Change control

Frozen items may not be renamed, removed, repurposed, or semantically broadened
in place. A rename, removal, addition, or semantic change to frozen v0.2
vocabulary requires:

1. a later versioned source-vocabulary contract;
2. explicit `supersedes` and `superseded-by` metadata;
3. a decision-log record naming the changed rules and reason;
4. a README authority-pointer update;
5. source compatibility or migration tests where applicable.

Provisional and fixture-only changes do not silently alter frozen parent fields
or durable reasons. Source or test work requires separate task-level
authorization, and production gates remain closed until explicitly
adjudicated.
