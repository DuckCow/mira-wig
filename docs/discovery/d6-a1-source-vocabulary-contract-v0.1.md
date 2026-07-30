# D6-A1 Source Vocabulary Contract v0.1

## Status

```text
DESIGN:                 FROZEN (D6-A1 exact-SKU source vocabulary v0.1)
SOURCE IMPLEMENTATION:  FROZEN at main merge bb8f6e1e5d2a4c13f58c7daf60ed6333806f2d71
PRODUCTION ACTIVATION:  NOT AUTHORIZED
CHANGE CONTROL:         supersedes: none | superseded-by: none
```

This contract installs the first normative source-vocabulary freeze for the
pure D6-A1 exact-SKU fixture retrieval slice.

It binds source merge `80c98ad54e9f3409c57fcf71a277db584242047e`,
reviewed source head `bb90e747b3bd0c052ba6cd33714ca8d54c5def5f`,
freeze-preparation head
`872ad2fec669bd71d42c2362a32276489e44fa63`, and freeze-preparation merge
`bb8f6e1e5d2a4c13f58c7daf60ed6333806f2d71`.

Before this file is merged, the source and external freeze-preparation reports
are reviewed implementation evidence, not independent normative authority.
This versioned contract, its decision-log entry, and the README authority
pointer establish the freeze when they merge.

## Scope

This contract governs the D6-A1 source vocabulary for:

- exact-SKU applicability and exact synthetic lookup;
- one mandatory candidate-admission choke point;
- frozen D5 exact-decision integration;
- selected-variant result pricing;
- exact style/variant landing intent and integrity verification;
- transparent exact-lookup accountability;
- the default-off injected delivery-seam result status;
- the reviewed D6-A1 module responsibilities and supported entrypoints.

It does not own or authorize production catalog truth, a catalog adapter,
sellability or orderability, routes, UI, cart, checkout, payment, fitting,
rendering, manufacturing, event emission or collection, D6-B, or production
activation.

## Classification boundary

The freeze is selective. Frozen result fields, landing fields, escaping
statuses and reasons, component values, module responsibilities, supported
entrypoints, and event-delivery statuses do not freeze adjacent provisional
vocabulary.

In particular:

- fixture input types and fixture data remain provisional and fixture-only;
- the event name, payload schema, and event-seam shape remain provisional;
- helper names other than `verifyExactLanding` remain provisional;
- internal statuses, helpers, invariant text, and accountability-key encoding
  remain provisional;
- recording a provisional shape in conformance tests does not freeze it;
- a module export is not automatically a supported public entrypoint.

## Frozen module responsibilities

| Module | Frozen responsibility |
| --- | --- |
| `types.ts` | D6-A1 exact-slice source vocabulary |
| `versions.ts` | D6 exact component-version registry |
| `exact-fixture-retriever.ts` | exact fixture lookup, validation, and accountability |
| `candidate-admission.ts` | request assessment and the single admission choke point |
| `landing.ts` | pure landing intent and integrity verification |
| `event-seam.ts` | default-off injected delivery seam |
| `exact-slice.ts` | sole vertical-slice orchestrator |

The responsibility map is frozen; the seven-file subtree is not permanently
closed. Additive modules may be proposed only through explicit change control.
No `index.ts` barrel is part of v0.1.

## Frozen entrypoints and component values

The sole primary entrypoint is:

```text
runExactSkuFixtureSlice
```

The one frozen durable supporting export is:

```text
verifyExactLanding
```

The remaining production exports are not thereby supported entrypoints.

Exactly three component values are frozen:

| Component | Frozen value |
| --- | --- |
| candidate source | `d6-exact-fixture-retriever/v0.1` |
| admission rules | `d6-exact-candidate-admission/v0.1` |
| landing contract | `d6-exact-landing/v0.1` |

Exactly two component values remain provisional:

| Component | Provisional value |
| --- | --- |
| event schema | `d6-discovery-events/v0.1-provisional` |
| fixture snapshot | `d6-exact-retrieval-fixture/v0.1-provisional` |

## Frozen behavioral invariants

- exactly one canonical `SKU` constraint is accepted;
- raw query text is not reparsed;
- incompatible D5 parser versions fail before lookup;
- exact miss never substitutes;
- duplicate SKU and variant identities invalidate fixtures deterministically;
- every matched candidate passes one admission choke point;
- frozen D5 exact-match and no-substitution semantics are reused;
- unrelated eligibility summaries do not alter the candidate outcome;
- price basis is `SELECTED_VARIANT`;
- landing mismatch is visible and never repaired;
- event delivery is default-off;
- an injected sink failure does not replace the core result;
- no ranking or production authority is introduced.

## Frozen output fields

The following field sets are frozen. Field order is not normative.

| Shape or branch | Frozen fields |
| --- | --- |
| `D5RetrievalAttributionVersions` | `normalizer`, `parser`, `constraintRules`, `lexicon`, `ontology` |
| `ExactFixtureIdentity` | `namespace`, `canonicalValue` |
| `ExactVariantResult` | `displayedStyleId`, `displayedVariantId`, `exactIdentity`, `priceBasis`, `amount`, `currency`, `optionFacts`, `exactLookupAccountabilityKey`, `candidateSourceVersion`, `fixtureSnapshotVersion`, `admissionVersion`, `landingVersion`, `d5Versions`, `d5Decision`, `eligibilityFixtureReason` |
| `ExactLandingIntent` | `displayedStyleId`, `displayedVariantId`, `priceBasis`, `exactIdentity`, `fallbackRoutes`, `speechRequirements`, `exactLookupAccountabilityKey`, `candidateSourceVersion`, `fixtureSnapshotVersion`, `admissionVersion`, `landingVersion`, `d5Versions` |
| `ExactLandingVerification` verified branch | `status` |
| `ExactLandingVerification` mismatch branch | `status`, `reason` |
| `ExactAdmissionResult` admitted branch | `status`, `result`, `landingIntent` |
| `ExactAdmissionResult` rejected branch | `status`, `reason`, `exactLookupAccountabilityKey` |
| `ExactSliceRunResult` request-rejection branch | `status`, `reason`, `eventDelivery` |
| `ExactSliceRunResult` exact-not-found branch | `status`, `reasons`, `fallbackRoutes`, `exactLookupAccountabilityKey`, `eventDelivery` |
| `ExactSliceRunResult` fixture-invalid branch | `status`, `reason`, `eventDelivery` |
| `ExactSliceRunResult` admission-rejected branch | `status`, `reason`, `exactLookupAccountabilityKey`, `eventDelivery` |
| `ExactSliceRunResult` admitted branch | `status`, `result`, `landingIntent`, `eventDelivery` |

Freezing these field names does not promote fixture-sourced values into
production truth. The event name and payload fields remain provisional even
though the escaping run results freeze their `eventDelivery` field.

## Frozen literals

Exact namespace and price basis:

```text
SKU
SELECTED_VARIANT
```

Escaping statuses:

```text
REQUEST_NOT_APPLICABLE
REQUEST_INVALID
UNSUPPORTED_EXACT_NAMESPACE
EXACT_NOT_FOUND
FIXTURE_INVALID
ADMISSION_REJECTED
ADMITTED
```

Request reasons:

```text
NO_EXACT_IDENTITY
ADDITIONAL_CONSTRAINTS_OUTSIDE_EXACT_SLICE
MULTIPLE_EXACT_IDENTITIES
BLANK_EXACT_IDENTITY
EXACT_IDENTITY_UNRESOLVED
EXACT_IDENTITY_CONTRADICTED
INCOMPATIBLE_D5_PARSER_VERSION
UNSUPPORTED_EXACT_NAMESPACE
```

Frozen failure reasons for fixture-only candidate input failures:

```text
CANDIDATE_SNAPSHOT_PROVENANCE_INVALID
CANDIDATE_FIXTURE_PROVENANCE_INVALID
DUPLICATE_CANONICAL_SKU
DUPLICATE_VARIANT_ID
```

Freezing these escaping reasons does not freeze the fixture input types,
snapshot contents, or synthetic fixture values.

Admission rejection reasons:

```text
CANDIDATE_SOURCE_PROVENANCE_INVALID
CATALOG_PROOF_MISSING
CATALOG_PROOF_DUPLICATE
CANDIDATE_IDENTITY_INTEGRITY_MISMATCH
ELIGIBILITY_SUMMARY_MISSING
ELIGIBILITY_SUMMARY_DUPLICATE
ELIGIBILITY_IDENTITY_MISMATCH
ELIGIBILITY_SUMMARY_PROVENANCE_INVALID
ELIGIBILITY_SUMMARY_UNKNOWN
ELIGIBILITY_SUMMARY_INELIGIBLE
SELECTED_VARIANT_PRICE_INVALID
```

Landing verification:

```text
VERIFIED
LANDING_INTEGRITY_MISMATCH
```

Injected delivery seam:

```text
DISABLED
INJECTED_SINK_RETURNED
INJECTED_SINK_THREW
```

The three delivery values describe only the injected seam result. They do not
freeze the event name or payload and do not prove production emission,
collection, transmission, or storage.

`exactLookupAccountabilityKey` is a frozen output field name with transparent
tuple semantics. Its JSON encoding remains provisional and it is not a
cryptographic candidate-set fingerprint.

## D5 semantics reused

D6-A1 reuses, without redefining:

```text
EXACT_IDENTITY_MATCH
EXACT_IDENTITY_NO_SUBSTITUTION
EXACT_IDENTITY_NOT_FOUND
```

The first two are frozen D5 reasons; the third is the frozen D5 fallback route.
Their authority remains the D5 source-vocabulary contract.

## Still provisional

### Fixture-only

- `ExactCandidateFixture`;
- `ExactCandidateFixtureSnapshot`;
- `CatalogIdentityProofFixture`;
- `EligibilitySummaryFixture`;
- `FixtureOptionFact`;
- `FixtureEligibilityOutcome` and its values;
- all synthetic IDs, amounts, currencies, facts, evidence references,
  free-form eligibility `fixtureReason` values, and snapshot contents.

### Durable-discovery candidates

- `RunExactSkuFixtureSliceInput` exact shape;
- event name `D6_EXACT_SLICE_EVALUATED_PROVISIONAL`;
- `ExactSliceEventPayload` exact shape and payload fields;
- `ExactSliceEventSeam` exact shape;
- helper names `assessExactSliceRequest`,
  `retrieveExactCandidateFixture`, `admitExactCandidate`,
  `buildExactLandingIntent`, and `deliverExactSliceEvent`;
- module and type names beyond the frozen responsibility, output, and
  entrypoint boundaries.

### Internal-only

- `APPLICABLE`;
- `MATCH`;
- internal helper functions;
- accountability-key JSON encoding;
- invariant error text.

Conformance tests may exhaustively record any of these provisional shapes for
manifest completeness. Test coverage does not confer frozen authority.

## Removed vocabulary

- `candidateSetFingerprint`;
- `DELIVERED_TO_IN_MEMORY_SINK`;
- `D5_EXACT_DECISION_REJECTED`;
- `admission-level LANDING_INTEGRITY_MISMATCH`;
- `ExactAdmissionResult.landingVerification`;
- `EligibilitySummaryFixture.version`;
- `EligibilitySummaryFixture.reason`;
- `EligibilitySummaryFixture.fulfillmentClass`.

The standalone `LANDING_INTEGRITY_MISMATCH` status and reason remain frozen
only for `ExactLandingVerification`.

## Change control

Frozen fields, literals, responsibilities, component values, supported
entrypoints, and behavioral invariants may not be renamed, removed,
repurposed, or semantically broadened in place. A change requires:

1. a new versioned source-vocabulary contract;
2. `supersedes` / `superseded-by` metadata;
3. a decision-log entry naming the changed rules and reason;
4. a README authority-pointer update;
5. compatibility or migration tests where applicable;
6. a separately authorized source task.

Provisional fixture, event, helper, and internal changes may not silently alter
the frozen boundary. D6-B or a production adapter requires a separate contract
and work order and may not silently alter D6-A1.

## Completion ruling

Only when this contract, README pointer, and decision-log entry merge:

```text
D6-A0: COMPLETE
D6-A1 implementation: COMPLETE
D6-A1 freeze preparation: COMPLETE
D6-A1 normative freeze: COMPLETE
D6-A: COMPLETE
```

This ruling does not authorize D6-B or production activation.
