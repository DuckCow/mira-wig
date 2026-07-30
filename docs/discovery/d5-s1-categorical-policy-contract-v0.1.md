# D5-S1 categorical-policy design contract v0.1

## Status

```text
DESIGN:                 FROZEN (D5-S1 categorical-policy boundaries v0.1)
SOURCE IMPLEMENTATION:  NOT AUTHORIZED
PRODUCTION ACTIVATION:  NOT AUTHORIZED
CHANGE CONTROL:         supersedes: none | superseded-by: none
SOURCE BASELINE:        main 32b8cd7aef2c6f6302ee835e154ec3b6a3b559cb
EVIDENCE SNAPSHOT:      WIG-COM-DSC-R14-COD-D5-S1-A0-v0.1
```

This contract is normative. The bound evidence snapshot is descriptive and
immutable; it cannot override this contract.

## 1. Scope and authority

D5-S1 owns only categorical policy needed by the future D6-B1 source-only
slice:

- query-level governed, non-claim, stylistic categorical dispositions;
- the separation of required query intent from product assertion;
- non-claim stylistic categorical fixture-product evidence decisions;
- policy, confirmation, evidence, partition, speech, reason, and compatibility
  rules;
- the minimum later source/test boundary and version sequence.

This contract does not authorize source implementation, query-level continuous
policy, production ontology or lexicon content, claim-bearing or
structural/functional policy, D6-B source, ranking, relaxation, adapters,
routes, UI, events, catalog reads, commerce writes, or production activation.

## 2. Current blocker

Current D5 represents `CATEGORICAL`, but rejects it at query level. At
fixture-product level it accepts categorical evaluation only through the
claim-bearing material profile. D6-B1 therefore cannot obtain governed
required/preference intent or non-claim stylistic product-evidence decisions
from its policy owner.

D6-B1 may not compensate with a local enum, heuristic, plan, or reinterpretation
of D5 output.

## 3. Eligible categorical domain

D5-S1 applies only when all of the following are true:

```text
constraint kind:       CATEGORICAL
attribute band:        STYLISTIC
decision profile:      dedicated governed stylistic categorical profile
interpretation state:  DECLARED
policy:                exactly one matching injected categorical policy
```

`USER_CONFIRMATION` may make an interpretation declared, but changes intent
only. `DERIVED`, `BRIDGED`, and `UNRESOLVED` categorical interpretations remain
outside S1. Exact attribute IDs, value IDs, profile spelling, fixture-policy
shape, and storage ownership remain provisional and injected.

D5-S1 does not add or alter continuous query policy. Measurement method, unit,
evidence, and tolerance governance must precede the separate D5-S2 continuous
extension.

## 4. Three independent state axes

D5-S1 preserves three different questions:

1. **Interpretation:** what the query means and whether that meaning is
   declared.
2. **Policy disposition:** whether that declared constraint is required,
   preferred, routed, clarified, or unsupported.
3. **Product evidence:** whether evidence for a particular fixture product
   supports, violates, withholds, or cannot establish the assertion.

Interpretation state does not determine hardness. Confirmation does not create
policy and does not create product evidence. Product evidence does not rewrite
query intent.

## 5. Injected categorical policy

D5 consumes a versioned injected policy associated with the governed
attribute. Its dispositions are:

```text
REQUIRED
PREFERENCE
ROUTE
CLARIFICATION
UNSUPPORTED
```

The exact fixture type, field names, profile literal, and version literal
remain provisional until source review. The later source implementation must
validate fixture-only and synthetic markers, a nonblank policy version, an
exact attribute match, and exactly one applicable policy. Missing, duplicate,
conflicting, blank-version, or attribute-mismatched policy input is invalid and
must fail deterministically. D5 must not guess or default a disposition.

For the first slice, `ROUTE` means the existing
`EDUCATION_OR_CONSULTATION` fallback. `CLARIFICATION` means the existing
`CLARIFICATION` fallback. `UNSUPPORTED` means the existing
`EXPLICIT_UNSUPPORTED` fallback. This prevents the provisional policy shape
from smuggling an ungoverned route vocabulary into D5-S1.

## 6. Query-level representation

The frozen `ConstraintDecision` field set is preserved.

D5-S1 adds one provisional `GateDecision` literal:

```text
REQUIRE_MATCH
```

Its subject-aware meaning is:

- `REQUIRE_MATCH` on `QUERY`: a future candidate must receive an
  evidence-qualified satisfying product decision before entering the asserted
  required-match set.
- `ASSERT_MATCH` on `FIXTURE_PRODUCT`: evaluated product evidence supports the
  product match.

`REQUIRE_MATCH` is not an evidence assertion and never uses the `ASSERTED`
partition on a query decision.

The following alternatives are rejected:

- a required/preference field on every `ConstraintDecision`, because it changes
  the frozen shape, creates invalid cross-field combinations, and expands every
  downstream consumer;
- a parallel structured-constraint plan, because it creates a competing policy
  authority and synchronization boundary;
- query-level `ASSERT_MATCH`, because it falsely represents unevaluated query
  intent as product evidence.

## 7. Query truth table

Every query branch has `authorityOutcome = NOT_APPLICABLE`,
`diagnostics = []`, and includes `NO_PRODUCT_ASSERTION`.

| Disposition | Gate | Score | Partition | Relaxation | Speech addition | Fallback | Provisional reason semantic |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `REQUIRED` | `REQUIRE_MATCH` | `NONE` | `NOT_APPLICABLE` | `NEVER` | none | none | categorical required by policy |
| `PREFERENCE` | `DO_NOT_GATE` | `PREFERENCE_ALLOWED` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | none | none | categorical preference by policy |
| `ROUTE` | `ROUTE_ONLY` | `NONE` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `DISCLOSE_ROUTE_LIMITATION` | `EDUCATION_OR_CONSULTATION` | categorical policy route |
| `CLARIFICATION` | `REQUIRE_CLARIFICATION` | `NONE` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `DISCLOSE_ROUTE_LIMITATION` | `CLARIFICATION` | categorical policy clarification |
| `UNSUPPORTED` | `UNSUPPORTED` | `NONE` | `UNKNOWN` | `NOT_APPLICABLE` | `DISCLOSE_ROUTE_LIMITATION` | `EXPLICIT_UNSUPPORTED` | categorical policy unsupported |

Each disposition requires an inspectable durable reason. Exact new reason
spellings remain provisional until source review; existing reasons may be
reused only without broadening their meaning.

D6-B1 may proceed only for `REQUIRED` plus `REQUIRE_MATCH`. Preference, route,
clarification, and unsupported decisions stop before B1 enumeration. D6-B1
does not rank, filter, or exclude using a preference decision.

## 8. Fixture-product evidence

The product constraint retains the query constraint's categorical value,
attribute band, and dedicated decision profile. Its fixture-product subject
remains fixture-only and provisional.

Only these S1 evidence states may assert:

```text
VERIFIED_OR_MEASURED
HUMAN_CURATED_FROM_EVIDENCE
```

They may assert only when attribute and categorical value identities are
comparable and the value matches.

These states cannot assert in S1:

```text
APPROVED_VENDOR_ATTESTED
UNAPPROVED_VENDOR_DECLARATION
MODEL_INFERRED
MISSING
CONFLICTING
NOT_REPRESENTABLE
UNKNOWN_AUTHORITY
```

Vendor-attested stylistic evidence is deferred even if a claim-bearing policy
elsewhere permits vendor attestation.

### Required policy

| Evidence outcome | Gate | Score | Partition | Candidate effect |
| --- | --- | --- | --- | --- |
| authoritative match | `ASSERT_MATCH` | `NONE` | `ASSERTED` | satisfies |
| authoritative mismatch | `DO_NOT_GATE` | `NONE` | `VIOLATING` | excluded from asserted required set |
| missing, unknown, or non-authoritative | `DO_NOT_GATE` | `NONE` | `UNKNOWN` | does not satisfy |
| conflicting | `DO_NOT_GATE` | `NONE` | `WITHHELD` | does not satisfy |

### Preference policy

| Evidence outcome | Gate | Score | Partition | Candidate effect |
| --- | --- | --- | --- | --- |
| authoritative match | `DO_NOT_GATE` | `PREFERENCE_ALLOWED` | `ASSERTED` | non-gating future signal |
| authoritative mismatch | `DO_NOT_GATE` | `NONE` | `VIOLATING` | does not exclude |
| missing, unknown, or non-authoritative | `DO_NOT_GATE` | `NONE` | `UNKNOWN` | does not exclude |
| conflicting | `DO_NOT_GATE` | `NONE` | `WITHHELD` | does not exclude |

`EVIDENCE_QUALIFIED_MATCH`, `EVIDENCE_QUALIFIED_MISMATCH`,
`PRODUCT_EVIDENCE_UNKNOWN`, and `PRODUCT_EVIDENCE_CONFLICT` are reused only
with their existing meanings. Model-inferred stylistic evidence requires a new
non-claim-specific non-assertion reason; its spelling remains provisional.

`ROUTE`, `CLARIFICATION`, and `UNSUPPORTED` are query dispositions and do not
authorize fixture-product evaluation.

## 9. Confirmation

`USER_CONFIRMATION`:

- may establish declared intent;
- reuses `CONFIRMATION_CHANGED_INTENT_ONLY`;
- does not create, upgrade, or repair product evidence;
- does not bypass or select the injected policy;
- does not change a product partition;
- does not authorize relaxation.

The confirmation reason is additive to the applicable query or product reason;
it is not a substitute for it.

## 10. Compatibility and later source boundary

A separately authorized source task must first prove confinement to:

```text
src/lib/discovery/types.ts
src/lib/discovery/versions.ts
src/lib/discovery/decide-constraint.ts
src/lib/discovery/__tests__/**
```

No parser, normalizer, D6-A, D6-B, Prisma, route, UI, adapter, event, or
production behavior change is expected. The parser already carries profile and
interpretation state from injected lexical input; policy remains a
`decideConstraint` input.

The current D6-A exact path continues to require fixture-product
`ASSERT_MATCH`, `ASSERTED`, and exact-identity reasons. Adding a query-only
`REQUIRE_MATCH` branch and preserving the decision field set does not change
that behavior. Exhaustive gate tests must intentionally add the new literal.

## 11. Minimum source tests

A later source task must cover:

- all five query dispositions and their complete output tuples;
- required query uses `REQUIRE_MATCH`, never `ASSERT_MATCH`;
- preference is non-gating and cannot affect B1 ordering or exclusion;
- route, clarification, and unsupported stop before retrieval;
- only declared, governed, stylistic categorical input is eligible;
- wrong kind, band, profile, or interpretation remains rejected;
- missing, duplicate, conflicting, blank-version, and mismatched policies fail
  deterministically;
- required and preference product match, mismatch, unknown, and conflict;
- value-kind and attribute mismatches cannot assert;
- model-inferred and both vendor evidence states cannot assert;
- confirmation changes intent only;
- current exact, claim, continuous, outcome, contradiction, unsupported, and
  audience-route behavior remains unchanged;
- `ConstraintDecision` has exactly its existing eleven fields;
- exhaustive gate, reason, profile, policy, and version tests;
- the D5 and D6-A import-boundary and exact-slice suites remain green.

## 12. Version and freeze sequence

The separately authorized implementation target is:

```text
constraint rules: d5-constraint-decisions/v0.2-provisional
normalizer:       remains v0.1
parser:           remains v0.1
```

The sequence is:

```text
D5-S1-A0 contract and immutable reconnaissance
→ D5-S1 source at v0.2-provisional
→ adversarial source and vocabulary review
→ constraint-rules v0.2 promotion
→ D5 source-vocabulary contract v0.2 superseding v0.1
→ D6-B1 contract and source under separate authorization
```

The eventual D5 v0.2 vocabulary contract must name every changed literal,
reason, profile, fixture policy, behavior, component version, and rejected
alternative. This design contract itself authorizes none of those source
changes.
