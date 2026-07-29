# D5 Source Vocabulary Contract v0.1

## Status

```text
DESIGN:                 FROZEN (D5 source vocabulary v0.1)
SOURCE IMPLEMENTATION:  FROZEN at main merge d41542612ff4f730fcd938604a3fc7abd69e5e1c
PRODUCTION ACTIVATION:  NOT AUTHORIZED; downstream gates remain
CHANGE CONTROL:         supersedes: none | superseded-by: none
```

This is the first normative D5 source-vocabulary freeze required by the
discovery foundation contract §§5 and 7. It installs the freeze for the D5
source-only parser and constraint-decision slice reviewed in pull request #3
and binds the reviewed source head
`0e6b3cc7780d73b33302ab00df9e3a49490e2502` as contained by main merge
`d41542612ff4f730fcd938604a3fc7abd69e5e1c`.

Before this file was installed, source strings and external vocabulary reports
were evidence of the reviewed implementation, not independent normative
authority. This versioned contract, its decision-log entry, and the README
authority pointer establish the freeze. A future change to frozen vocabulary
requires a new versioned contract; this file is not edited in place.

## Scope

This contract governs only the D5 source vocabulary for:

- query normalization and raw-range correspondence;
- deterministic injected query parsing;
- unsupported-concept and contradiction representation;
- pure constraint decisions and source-only reason and explanation vocabulary;
- the D5 discovery module responsibilities and primary entrypoints.

It does not own or authorize catalog truth or evidence ingestion, product
claims or vendor-attestation authority, a product evidence adapter, production
request/response transport or query API, production lexicon content, final
ontology assignments, candidate retrieval/admission/ranking, recommendation,
variant landing, event emission or storage, commerce, cart, checkout, payment,
routes, UI, fitting, rendering, manufacturing, D6 implementation, or
production activation.

## Classification model

Every symbol covered by this contract is classified independently on three
axes:

| Axis | Values |
| --- | --- |
| Stability | `FROZEN_SOURCE_V0_1`, `STILL_PROVISIONAL`, `REMOVED` |
| Scope | `DURABLE_DISCOVERY`, `INTERNAL_ONLY`, `FIXTURE_ONLY` |
| Surface | `MODULE_RESPONSIBILITY`, `PRIMARY_ENTRYPOINT`, `SUPPORTING_EXPORT`, `SERIALIZED_OUTPUT_SHAPE`, `SERIALIZED_LITERAL`, `REGISTRY_METADATA`, `TYPE_ONLY_HELPER` |

The axes are orthogonal. For example, a source component version can be
`FROZEN_SOURCE_V0_1` + `DURABLE_DISCOVERY` + `REGISTRY_METADATA`, while a
fixture reason can be `STILL_PROVISIONAL` + `FIXTURE_ONLY` +
`SERIALIZED_LITERAL`. A supporting export can be durable yet provisional, and
an internal helper can remain provisional even when the output field names it
supports are frozen.

## Frozen module responsibilities

The ownership root `src/lib/discovery/**` is
`FROZEN_SOURCE_V0_1` + `DURABLE_DISCOVERY` +
`MODULE_RESPONSIBILITY`.

The D5 responsibilities are frozen as follows:

| Module | Frozen responsibility |
| --- | --- |
| `types.ts` | Owns the D5 source type vocabulary. |
| `versions.ts` | Owns the source component version registry. |
| `normalize-query.ts` | Owns pure query normalization and raw-range correspondence. |
| `parse-query.ts` | Owns deterministic injected parsing. |
| `decide-constraint.ts` | Owns pure D5 constraint decisions. |

The primary entrypoints are
`FROZEN_SOURCE_V0_1` + `DURABLE_DISCOVERY` + `PRIMARY_ENTRYPOINT`:

- `normalizeQuery`
- `parseQuery`
- `decideConstraint`

This freezes responsibilities and dependency direction, not a permanently
closed five-file set. D6 and other future additive discovery modules may be
introduced under change control without silently changing these
responsibilities or dependency direction. No such module is authorized by this
contract. `mapNormalizedRangeToRaw` remains a provisional internal supporting
export.

## Frozen component versions

The following registry values are
`FROZEN_SOURCE_V0_1` + `DURABLE_DISCOVERY` + `REGISTRY_METADATA`:

| Component | Frozen value |
| --- | --- |
| normalizer | `d5-conservative-normalizer/v0.1` |
| parser | `d5-injected-span-parser/v0.1` |
| constraint rules | `d5-constraint-decisions/v0.1` |

The following values remain provisional:

| Component | Value | Classification |
| --- | --- | --- |
| request schema | `d5-source-only-request/v0.2-provisional` | `STILL_PROVISIONAL` + `DURABLE_DISCOVERY` + `REGISTRY_METADATA` |
| golden fixture | `d5-golden-cases/v0.2-provisional` | `STILL_PROVISIONAL` + `FIXTURE_ONLY` + `REGISTRY_METADATA` |

For the frozen values, `v0.1` means a reviewed source-only component contract,
not production activation.

## Frozen serialized output shapes

The listed top-level field names and their order-independent presence are
`FROZEN_SOURCE_V0_1` + `DURABLE_DISCOVERY` +
`SERIALIZED_OUTPUT_SHAPE`.

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

For `NormalizedOffsetMapEntry`, the field names are frozen while the
implementation granularity of individual map entries remains
`STILL_PROVISIONAL` + `INTERNAL_ONLY`. Parser diagnostic labels and their
schema remain provisional. `ConstraintDecision.diagnostics` is a
fixture-only provisional value space in D5. Nested payload shapes not
expressly frozen below remain provisional.

## Frozen serialized literals

Unless a narrower scope is stated, the literals in this section are
`FROZEN_SOURCE_V0_1` + `DURABLE_DISCOVERY` +
`SERIALIZED_LITERAL`.

### Normalization and interpretation

| Vocabulary | Frozen literals |
| --- | --- |
| normalization form | `NFC` |
| coordinate system | `UTF16_CODE_UNIT` |
| normalized input state | `EMPTY`, `NON_EMPTY` |
| interpretation state | `DECLARED`, `DERIVED`, `BRIDGED`, `UNRESOLVED` |

### Constraints and spans

| Vocabulary | Frozen literals |
| --- | --- |
| constraint value kind | `EXACT_IDENTITY`, `CATEGORICAL`, `CONTINUOUS`, `OUTCOME_INTENT`, `UNKNOWN_OR_UNSUPPORTED`, `AUTHORITY_ROUTE` |
| constraint source kind | `QUERY_SPAN`, `USER_CONFIRMATION` |
| attribute band | `IDENTITY`, `CLAIM_BEARING`, `DIMENSIONAL_CONTINUOUS`, `STYLISTIC`, `OUTCOME_INTENT`, `AUTHORITY_ROUTE` |
| query span owner | `EXACT_IDENTITY`, `CONCEPT`, `NUMBER_WITH_UNIT`, `OUTCOME_INTENT`, `AUDIENCE_ROUTE`, `UNSUPPORTED` |
| unsupported constraint state | `UNSUPPORTED`, `AMBIGUOUS` |
| unsupported-concept output state | `UNRESOLVED` |
| contradiction kind | `MUTUALLY_EXCLUSIVE_VALUES` |

`D5DecisionProfile` labels remain provisional even though
`InterpretedConstraint.decisionProfile` is a frozen output field. Constraint
kind discriminants are frozen, but their exact nested payload shapes remain
provisional unless expressly frozen elsewhere in this contract.

### Durable subject and decision level

Only the following query-level literals are durable and frozen:

- `DecisionSubject.kind`: `QUERY`
- `ConstraintDecisionTarget.decisionLevel`: `QUERY`

The `FIXTURE_PRODUCT` subject and decision level are explicitly fixture-only
and provisional; they are not durable discovery vocabulary.

### Decision vocabulary

| Vocabulary | Frozen literals |
| --- | --- |
| authority outcome | `PRESERVE_CALLER_CONTEXT`, `OUTSIDE_DISCOVERY_AUTHORITY`, `NOT_APPLICABLE` |
| gate decision | `ASSERT_MATCH`, `DO_NOT_GATE`, `REQUIRE_CLARIFICATION`, `ROUTE_ONLY`, `UNSUPPORTED` |
| score decision | `NONE`, `PREFERENCE_ALLOWED` |
| speech requirement | `NO_PRODUCT_ASSERTION`, `DISCLOSE_EVIDENCE_BASIS`, `DISCLOSE_UNKNOWN`, `DISCLOSE_ROUTE_LIMITATION` |
| evidence partition | `ASSERTED`, `UNKNOWN`, `VIOLATING`, `WITHHELD`, `NOT_APPLICABLE` |
| relaxation decision | `NEVER`, `CONFIRMATION_REQUIRED`, `NOT_APPLICABLE` |
| fallback route | `CLARIFICATION`, `EDUCATION_OR_CONSULTATION`, `AUDIENCE_SWITCH_OFFER`, `EXPLICIT_UNSUPPORTED`, `EXACT_IDENTITY_NOT_FOUND` |

### Durable discovery reason codes

`DiscoveryReasonCode` is the durable reason-code type. Its exact twelve
frozen literals are:

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

These codes are source-only semantics. They do not establish production
product evidence, claim authority, customer-visible wording, event vocabulary,
or activation authority. Customer-visible wording remains separately
governed. A rename, removal, addition, or semantic change requires a new
contract version rather than an in-place edit.

## Fixture-only provisional vocabulary

Everything in this section is `STILL_PROVISIONAL` + `FIXTURE_ONLY`. It exists
to exercise D5 decisions against synthetic fixtures and cannot be cited as
production catalog evidence or emitted as production events, reasons, or
diagnostics.

### Fixture subject and decision level

- `DecisionSubject.kind`: `FIXTURE_PRODUCT`
- `ConstraintDecisionTarget.decisionLevel`: `FIXTURE_PRODUCT`
- `fixtureProductId`

### Fixture evidence and policy types

- `ProductEvidenceValue`
- `ProductEvidenceFixture`
- `ProductEvidenceFixtureState`
- `ContinuousTolerancePolicyFixture`
- `ClaimAuthorityPolicyFixture`
- `VendorAttestationPolicyFixture`
- `DecisionPolicyFixture`

### Fixture reason codes and diagnostics

`FixtureReasonCode` contains:

- `CONTINUOUS_WITHIN_SYNTHETIC_TOLERANCE`
- `CONTINUOUS_OUTSIDE_SYNTHETIC_TOLERANCE`
- `SYNTHETIC_TOLERANCE_REQUIRED`

`FixtureDecisionDiagnostic` contains:

- `SYNTHETIC_TOLERANCE_APPLIED`
- `SYNTHETIC_VENDOR_ATTESTATION_POLICY_APPLIED`

`ConstraintReasonCode` is the combined source type used by the D5 decision
shape; it does not promote fixture reasons into durable discovery vocabulary.

### Fixture data

The following also remain fixture-only and provisional:

- the `d5-golden-cases/v0.2-provisional` golden fixture schema;
- the synthetic test lexicon and ontology identifiers;
- test identity recognizers;
- synthetic product identifiers;
- synthetic evidence references;
- synthetic tolerance, claim-authority, and vendor-attestation policy values.

## Durable discovery vocabulary that remains provisional

The following source surfaces are durable-discovery candidates but remain
`STILL_PROVISIONAL`; this contract does not freeze their exact shape, label
set, or signature:

- `RawQueryInput` exact input shape;
- `LocaleCode`, `LanguageTag`, and `AudienceNamespace` exact wrapper shapes;
- allowed `AudienceNamespace` values;
- `QueryLanguage` and `DiscoveryContext` exact input shapes;
- `createLocaleCode`, `createLanguageTag`, `createAudienceNamespace`,
  `createAutoQueryLanguage`, and `createDeclaredQueryLanguage` names and
  signatures;
- `D5DecisionProfile` labels;
- `QueryLexicon`, `QueryLexiconEntry`, `QueryLexiconMatchPolicy`, and
  `QueryUnitEntry` exact shapes or labels;
- `ExactIdentityRecognition` and `ExactIdentityRecognizer` exact shapes;
- `QueryConfirmation` and `ParseQueryInput` exact shapes;
- `ConstraintDecisionTarget`, `DecideConstraintInput`, and decision-target
  helper type names or exact shapes;
- `ParserDiagnosticCode` labels and `ParserDiagnostic` exact shape;
- `DISCOVERY_COMPONENT_VERSIONS.requestSchema`;
- nested constraint payload shapes not expressly frozen by this contract.

Their present source shapes remain evidence for D5 and may not be silently
treated as frozen by downstream work. Presence inside a frozen parent output
field does not freeze nested provisional vocabulary.

## Internal-only vocabulary that remains provisional

The following are `STILL_PROVISIONAL` + `INTERNAL_ONLY`:

- `mapNormalizedRangeToRaw`;
- `NormalizedOffsetMapEntry` implementation granularity;
- decision-target helper aliases;
- component-version registry implementation details other than the frozen
  version values listed above.

## Removed vocabulary

The following literals are `REMOVED`; they are not active D5 source
vocabulary:

- `AttributeBand.STRUCTURAL_FUNCTIONAL`
- `AttributeBand.DIMENSIONAL_CATEGORICAL`
- `SpeechRequirement.DISCLOSE_RELAXATION`
- `RelaxationDecision.DISCLOSED_AUTOMATIC`

The broader concepts are not prohibited forever. They may return only through
a new version with implemented semantics and behavioral tests. This contract
does not reserve their old spellings.

## Frozen behavioral invariants

The vocabulary is interpreted subject to these D5 invariants:

- the raw query is preserved exactly;
- comparison text uses whole-string NFC normalization and UTF-16 code-unit
  coordinates;
- every emitted raw range slices the exact raw surface represented by its
  span;
- query interpretation and product evidence are independent;
- query-level and fixture-product-level decisions are not interchangeable;
- a query cannot switch the caller-provided audience namespace;
- model-inferred claims have no assertion authority;
- D5 does not introduce weighted scoring, risk-recall, or production ranking;
- no weighted score trades claim risk against recall;
- unsupported, contradiction, unknown, conflict, mismatch, route, and
  exact-identity outcomes retain stable reasonability;
- D5 grants no retrieval, recommendation, commerce, event, or production
  activation authority.

## Change control

Frozen items may not be renamed, removed, repurposed, or semantically
broadened in place. A frozen D5 source-vocabulary change requires all of the
following:

1. create a new versioned source-vocabulary contract;
2. add `supersedes` / `superseded-by` metadata;
3. record the exact changed symbols and reason in
   `docs/discovery/decision-log.md`;
4. update the authority pointer in `docs/discovery/README.md`;
5. add source compatibility or migration tests where applicable.

Provisional and fixture-only changes do not silently alter frozen parent
fields or durable reasons. Source or test implementation still requires a
separately authorized task, and production gates remain closed unless
explicitly adjudicated.
