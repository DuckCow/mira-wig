# D6-B1 Source Vocabulary Contract v0.1

## Status

```text
DESIGN:                 FROZEN (D6-B1 governed categorical source vocabulary v0.1)
SOURCE IMPLEMENTATION:  FROZEN at main merge 67256e901dc2dcb4eb0b2e75a73d6ba9dca17c73
PRODUCTION ACTIVATION:  NOT AUTHORIZED
CHANGE CONTROL:         supersedes: none | superseded-by: none
```

This contract installs normative source-vocabulary authority for the
source-only, fixture-only D6-B1 governed categorical retrieval slice.

It binds the exact content-addressed implementation history:

```text
source implementation first commit:
  844b258d75ecf58a1efd43583af9e6c1be9db686

source implementation merge:
  ac032b524b6f15c366a580997e671b6cf4531b2e

reviewed source head:
  d79fffa3bb1198bbe92306ab456026e48b087c46

freeze-preparation first commit:
  d24daf7f185b134cedaa4e892f5090e69d97c124

freeze-preparation head:
  bb2bf420c5bd6cc0b51f7001199d5acec7f57d31

freeze-preparation merge:
  67256e901dc2dcb4eb0b2e75a73d6ba9dca17c73
```

The reviewed source and tests at those commits are implementation evidence.
This contract, its README pointer, and its decision-log record become
normative authority only when this docs-only pull request merges. No duplicate
evidence snapshot or checksum package is required because the exact reviewed
source and freeze preparation already reside in content-addressed Git history.

## Scope

This contract governs only the reviewed source vocabulary for the source-only,
fixture-only D6-B1 slice:

- one or two declared governed stylistic categorical constraints;
- whole-request D5 `REQUIRED + REQUIRE_MATCH` admission;
- Stage-0 authority-universe validation before enumeration;
- synthetic scoped candidate enumeration;
- frozen D5 product-decision reuse;
- one mandatory candidate-admission choke point;
- separate asserted, unknown, violating, withheld, and admission-rejected
  outcomes;
- deterministic UTF-16 code-unit technical ordering;
- selected-variant landing intent and integrity verification;
- visible D5/D6 attribution and accountability semantics;
- explicit no-ranking, no-relaxation, and no-event behavior.

This contract does not govern or authorize:

- production catalog truth;
- production ontology assignments;
- production eligibility or sellability;
- database, Prisma, schema, migration, adapter, route, UI, API, cart, checkout,
  payment, fulfillment, or order behavior;
- ranking, recommendation, semantic similarity, learning, or automatic
  relaxation;
- event emission, collection, storage, or analytics;
- D5-S2;
- D6-B2 numeric length;
- exact-plus-structured composition;
- production activation.

## Selective classification boundary

The freeze is selective.

- A module export is not automatically a supported entrypoint.
- Exact frozen result fields, escaping branch fields, statuses, reasons,
  component values, module responsibilities, and supported entrypoints do not
  freeze adjacent provisional carriers.
- Test coverage of a provisional shape does not make that shape normative.
- The nine-file subtree is not permanently closed.
- No `index.ts` barrel is part of v0.1.

## Frozen module responsibilities

| Module | Frozen responsibility |
| --- | --- |
| `types.ts` | D6-B1 source vocabulary |
| `versions.ts` | D6-B1 component-version registry |
| `request-plan.ts` | whole-request applicability, required policy/query decisions, canonical ordering, and accepted-input detachment |
| `authority-universe.ts` | Stage-0 caller-context and membership validation plus accountability semantics |
| `fixture-candidate-source.ts` | Stage-0-scoped synthetic candidate enumeration and source attribution |
| `evidence-evaluation.ts` | exact evidence selection and frozen D5 fixture-product decision delegation |
| `candidate-admission.ts` | one mandatory admission choke point, complete tuple validation, eligibility validation, and partition/result construction |
| `landing.ts` | pure selected-variant landing intent and integrity verification |
| `structured-slice.ts` | sole end-to-end D6-B1 orchestration |

The responsibility map is frozen.
The subtree is not permanently closed.
Additive modules require explicit change control.

## Frozen supported entrypoints

```text
PRIMARY:
  runStructuredCategoricalFixtureSlice

DURABLE SUPPORTING:
  verifyStructuredLanding
```

All other current helper exports remain provisional implementation surfaces.
The exact set of non-supported helper exports is not frozen. The component
registry export symbol is not itself a supported public entrypoint.

## Frozen component registry

The exact seven registry fields are:

```text
requestPlan
stage0Scope
candidateSource
admissionRules
landingContract
fixtureSnapshot
eligibilitySnapshot
```

Exactly five values are frozen:

```text
request plan:
  d6-b1-structured-request-plan/v0.1

Stage 0:
  d6-b1-stage-0-authority-universe/v0.1

candidate source:
  d6-b1-categorical-fixture-candidate-source/v0.1

admission rules:
  d6-b1-structured-candidate-admission/v0.1

landing contract:
  d6-b1-structured-landing/v0.1
```

Exactly two values remain provisional:

```text
retrieval fixture snapshot:
  d6-b1-categorical-retrieval-fixture/v0.1-provisional

eligibility snapshot:
  d6-b1-eligibility-fixture/v0.1-provisional
```

The five frozen D5 attribution field names are:

```text
normalizer
parser
constraintRules
lexicon
ontology
```

D5 value authority remains in the D5 source-vocabulary contract.

## Frozen behavioral invariants

1. The request contains exactly one or two accepted constraints.
2. Each accepted constraint is declared, stylistic, categorical, governed, and
   backed by exactly one required categorical policy.
3. The whole request must be D5 `REQUIRED + REQUIRE_MATCH`.
4. No sibling constraint may be silently dropped.
5. Duplicate governed attributes are invalid.
6. Confirmation changes intent only.
7. Accepted constraint and policy inputs are detached from caller ownership.
8. Stage 0 executes before candidate access.
9. Stage 0 binds market, locale, query language, audience namespace, and exact
   `variantId + canonicalStyleId` membership.
10. Empty Stage-0 membership is valid.
11. Duplicate Stage-0 membership and conflicting style parent are distinct
    failures.
12. Candidate enumeration reads only Stage-0-scoped variant keys.
13. A missing candidate for an allowed membership produces zero enumeration,
    not fixture corruption.
14. Candidate source may enumerate identity but may not assert a match.
15. Evidence selection is exact by candidate variant, request-local constraint,
    and governed attribute.
16. Absent evidence produces frozen D5 `UNKNOWN`.
17. Malformed, duplicate, wrong-attribute, and categorical
    `NOT_REPRESENTABLE` evidence reject rather than becoming truth.
18. Complete D5 query and product decisions are preserved.
19. Every enumerated candidate reaches exactly one admission attempt.
20. Stage 0 and candidate-specific eligibility are independently mandatory.
21. Eligibility relation begins with exact variant identity.
22. Only candidates whose every required product decision is
    `ASSERT_MATCH + ASSERTED` enter the asserted set.
23. All per-constraint decisions remain visible.
24. Aggregate precedence is:
    `WITHHELD > VIOLATING > UNKNOWN > ASSERTED`.
25. Admission rejections remain outside truth partitions.
26. Zero asserted results and zero enumeration complete without ranking,
    substitution, retry, or relaxation.
27. Technical ordering is locale-independent UTF-16 code-unit lexical
    ordering.
28. `VARIANT_ID_THEN_STYLE_ID` is technical determinism, not relevance
    ranking.
29. Selected variant ID, canonical style ID, amount, and currency survive
    landing unchanged.
30. Landing mismatch is visible and never repaired.
31. No event field, event delivery claim, D6-A invocation, database access,
    ranking, recommendation, or production authority is introduced.

## Frozen output field sets

Field order is not normative.

### Registry and attribution

```text
D6B1StructuredRetrievalComponentVersions:
  requestPlan
  stage0Scope
  candidateSource
  admissionRules
  landingContract
  fixtureSnapshot
  eligibilitySnapshot

D5StructuredRetrievalAttributionVersions:
  normalizer
  parser
  constraintRules
  lexicon
  ontology
```

### Request and Stage 0

```text
StructuredRequestRejection:
  status
  reason

Stage0ContextBinding:
  marketCode
  locale
  queryLanguage
  audienceNamespace

Stage0AllowedCanonicalPair:
  variantId
  canonicalStyleId

ValidatedStage0AuthorityUniverse:
  status
  stage0ScopeVersion
  fixtureSnapshotVersion
  context
  allowedCanonicalPairs
  accountabilityKey

Stage0Rejection:
  status
  reason
```

`StructuredRequestPlan` has a frozen role and type name, but its exact nested
carrier shape remains provisional because it embeds provisional constraint
and policy carriers.

### Candidate source and evidence

```text
StructuredCandidateSourceAttribution:
  fixtureSnapshotVersion
  candidateSourceVersion
  scopedMembership
  enumeratedCandidateIdentities
  accountabilityKey

CandidateSourceRejection:
  status
  reason

StructuredEvidenceAttribution:
  constraintId
  attributeId
  status
  matchingRecordCount
  evidenceState
  syntheticEvidenceRef
  fixtureSnapshotVersion

StructuredEligibilityAttribution:
  fixtureSnapshotVersion
  eligibilitySnapshotVersion
  variantId
  canonicalStyleId
  marketCode
  fixtureReason

MatchedGovernedAttribute:
  constraintId
  attributeId
  valueId
```

### Landing and candidate result

```text
StructuredLandingIntent:
  displayedVariantId
  displayedStyleId
  priceBasis
  amount
  currency
  matchedGovernedAttributes
  candidateSourceAttribution
  stage0Attribution
  evidenceAttribution
  eligibilityAttribution
  d5Versions
  d6Versions

StructuredLandingVerification verified branch:
  status

StructuredLandingVerification mismatch branch:
  status
  reason

StructuredCandidateResult:
  displayedVariantId
  displayedStyleId
  partition
  priceBasis
  amount
  currency
  matchedGovernedAttributes
  queryDecisions
  productDecisions
  candidateSourceAttribution
  stage0Attribution
  evidenceAttribution
  eligibilityAttribution
  d5Versions
  d6Versions
  landingIntent
  landingIntegrity
```

### Admission, counts, and run result

```text
StructuredAdmissionResult admitted branch:
  status
  candidate

StructuredAdmissionResult rejected branch:
  status
  variantId
  canonicalStyleId
  reason
  candidateSourceAttribution
  stage0Attribution
  evidenceAttribution
  d5Versions
  d6Versions

StructuredResultCounts:
  scopedMembership
  enumeratedCandidates
  admissionAttempts
  asserted
  unknown
  violating
  withheld
  admissionRejected

StructuredSliceCompleted:
  status
  requestPlan
  stage0Attribution
  candidateSourceAttribution
  assertedCandidates
  unknownCandidates
  violatingCandidates
  withheldCandidates
  admissionRejections
  counts
  technicalOrder
  ranking
  relaxation
  d5Versions
  d6Versions
```

The escaping run-result branch field sets are:

```text
REQUEST_REJECTED:
  status
  reason
  d5Versions
  d6Versions

STAGE0_REJECTED:
  status
  reason
  requestPlan
  d5Versions
  d6Versions

CANDIDATE_SOURCE_REJECTED:
  status
  reason
  requestPlan
  stage0Attribution
  d5Versions
  d6Versions

COMPLETED:
  the StructuredSliceCompleted field set above
```

`StructuredCandidateResultCore` is not frozen.

## Frozen literals and statuses

Supported and escaping statuses:

```text
APPLICABLE
REQUEST_REJECTED
VALIDATED
STAGE0_REJECTED
CANDIDATE_SOURCE_REJECTED
ADMITTED
ADMISSION_REJECTED
COMPLETED
VERIFIED
LANDING_INTEGRITY_MISMATCH
```

Evidence-attribution selection statuses:

```text
SELECTED
ABSENT
REJECTED
```

Result partitions:

```text
ASSERTED
UNKNOWN
VIOLATING
WITHHELD
```

The following values are frozen:

```text
SELECTED_VARIANT
VARIANT_ID_THEN_STYLE_ID
ranking = NONE
relaxation = NONE
```

The following are internal and are not frozen public vocabulary:

```text
SCOPED_CANDIDATES
EVALUATED
EVIDENCE_REJECTED
```

The following are fixture-only and provisional:

```text
ADMISSIBLE_FIXTURE
UNKNOWN_FIXTURE
INELIGIBLE_FIXTURE
```

## Frozen reason vocabulary

### Request reasons

```text
INCOMPATIBLE_D5_PARSER_VERSION
CONSTRAINT_COUNT_OUTSIDE_D6_B1
UNSUPPORTED_OR_UNRESOLVED_REQUEST
AFFECTING_CONTRADICTION
OUTSIDE_GOVERNED_CATEGORICAL_SLICE
INVALID_CONSTRAINT_SOURCE
UNSUPPORTED_GOVERNED_ATTRIBUTE
DUPLICATE_GOVERNED_ATTRIBUTE
POLICY_COUNT_MISMATCH
POLICY_PROVENANCE_INVALID
POLICY_IDENTITY_MISMATCH
NON_REQUIRED_POLICY
```

The compatibility sentinel remains provisional:

```text
INCOMPATIBLE_D5_QUERY_DECISION
```

### Stage-0 reasons

```text
STAGE0_PROVENANCE_INVALID
STAGE0_CONTEXT_MISMATCH
STAGE0_MEMBERSHIP_INVALID
DUPLICATE_STAGE0_MEMBERSHIP
CONFLICTING_STAGE0_STYLE_PARENT
```

### Candidate-source reasons

```text
CANDIDATE_SOURCE_PROVENANCE_INVALID
CANDIDATE_FIXTURE_PROVENANCE_INVALID
DUPLICATE_CANDIDATE_VARIANT_ID
CANDIDATE_CANONICAL_PARENT_MISMATCH
```

### Evidence reasons

```text
EVIDENCE_PROVENANCE_INVALID
DUPLICATE_CANDIDATE_ATTRIBUTE_EVIDENCE
EVIDENCE_ATTRIBUTE_IDENTITY_MISMATCH
EVIDENCE_NOT_REPRESENTABLE
```

The compatibility sentinel remains provisional:

```text
INCOMPATIBLE_D5_PRODUCT_DECISION
```

### Admission reasons

```text
CANDIDATE_OUTSIDE_STAGE0_SCOPE
CANDIDATE_SOURCE_ACCOUNTABILITY_INVALID
REQUEST_PLAN_INVARIANT_FAILED
PRODUCT_DECISION_SET_INVALID
ELIGIBILITY_SUMMARY_MISSING
ELIGIBILITY_SUMMARY_DUPLICATE
ELIGIBILITY_PROVENANCE_INVALID
ELIGIBILITY_SUMMARY_STALE
ELIGIBILITY_MARKET_MISMATCH
ELIGIBILITY_STYLE_MISMATCH
ELIGIBILITY_SUMMARY_UNKNOWN
ELIGIBILITY_SUMMARY_INELIGIBLE
SELECTED_VARIANT_AMOUNT_INVALID
SELECTED_VARIANT_CURRENCY_INVALID
```

The four frozen evidence reasons may also escape through the
admission-rejection union.

The frozen landing reason is:

```text
LANDING_INTEGRITY_MISMATCH
```

```text
ELIGIBILITY_VARIANT_MISMATCH is removed and must remain absent.
```

## D5 semantics reused, not redefined

D6-B1 reuses the frozen D5 v0.2 authority for:

```text
GOVERNED_STYLISTIC_CATEGORICAL
REQUIRE_MATCH
REQUIRED
ASSERT_MATCH
DO_NOT_GATE
ASSERTED
UNKNOWN
VIOLATING
WITHHELD
CATEGORICAL_REQUIRED_BY_POLICY
EVIDENCE_QUALIFIED_MATCH
EVIDENCE_QUALIFIED_MISMATCH
PRODUCT_EVIDENCE_UNKNOWN
PRODUCT_EVIDENCE_CONFLICT
MODEL_INFERRED_STYLISTIC_HAS_NO_ASSERTION_AUTHORITY
CONFIRMATION_CHANGED_INTENT_ONLY
```

D6-B1 does not redefine those values. The complete eleven-field
`ConstraintDecision` remains D5-owned.

## Accountability and ordering semantics

The following semantic accountability is frozen:

- Stage 0 accounts for its final component version, provisional fixture
  snapshot, caller context, and canonically ordered exact membership.
- Candidate source accounts for exact scoped membership and enumerated
  identities.
- Unrelated snapshot keys do not participate.
- Admission revalidates candidate markers, versions, exact membership, unique
  enumeration, current-candidate presence, and source accountability.
- Evidence attribution is per constraint.
- Eligibility attribution preserves the selected exact variant/style/market
  fixture basis.
- D5 and D6 component versions remain visible.

The frozen ordering semantics are:

```text
UTF-16 code-unit lexical order
```

The following are not frozen:

- `JSON.stringify` byte encoding;
- accountability keys as cryptographic fingerprints;
- helper comparator names;
- normalization or natural-language collation.

The `accountabilityKey` field names are frozen; their encoding is provisional.

## Still provisional

### Fixture-only and input carriers

```text
GovernedFixtureAttributeId values
GovernedCategoricalConstraint exact carrier
Stage0AuthorityUniverseFixture
StructuredCandidateFixture
StructuredCandidateFixtureSnapshot
StructuredProductEvidenceFixture additions
StructuredEligibilitySummaryFixture
StructuredFixtureEligibilityOutcome and its values
RunStructuredCategoricalFixtureSliceInput exact carrier
AdmitStructuredCandidateInput
all fixture IDs
all fixture ontology values
policy, lexicon, and ontology fixture versions
evidence references
amounts and currencies
fixtureReason values
snapshot contents
```

### Internal flow and helper vocabulary

```text
StructuredRequestAssessment
Stage0Validation
StructuredCandidateEnumeration
StructuredCandidateEvidenceEvaluation
ScopedStructuredCandidates
StructuredCandidateResultCore
all helper exports other than verifyStructuredLanding
all internal helper names
exact invariant error text
the two compatibility-sentinel spellings
```

### Encoding and production boundaries

The following remain provisional or unauthorized:

```text
accountability JSON encoding
production catalog adapter
production ontology
production eligibility transport
database persistence
event name/payload/seam
ranking
recommendation
relaxation
exact-plus-structured composition
D5-S2
D6-B2
production activation
```

## Change control and completion

This v0.1 has no predecessor and supersedes none.

Changes require a new versioned contract, README update, and decision-log
entry. Source conformance changes require explicit source authorization.
Production activation requires a separate contract and task.

D6-B1 becomes complete only when this docs-only pull request merges.

The next possible sequence remains:

```text
measurement method/unit/evidence/tolerance governance
→ D5-S2
→ D6-B2
```

This contract does not authorize that sequence.
