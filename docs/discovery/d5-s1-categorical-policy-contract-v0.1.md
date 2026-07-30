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
- required-policy non-claim stylistic categorical fixture-product evidence
  decisions;
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
required/preference intent or required-policy non-claim stylistic
product-evidence decisions from its policy owner.

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

D5 consumes a versioned injected policy that applies to exactly one
interpreted-constraint decision target within one decision request. Its
dispositions are:

```text
REQUIRED
PREFERENCE
ROUTE
CLARIFICATION
UNSUPPORTED
```

Applicability requires the request-local constraint identity, matching governed
categorical attribute identity, and exactly one applicable versioned policy.
A policy is not a global attribute default and may not be reused for a sibling
constraint merely because the attribute IDs match. The same governed attribute
may receive different dispositions in different requests. Request-local
constraint identity is not a globally durable cross-request policy key.

The exact fixture type, field names, profile literal, and version literal
remain provisional until source review. The later source implementation must
validate fixture-only and synthetic markers, a nonblank policy version, the
request-local target and attribute identities, and exactly one applicable
policy. Missing, duplicate, conflicting, blank-version, target-mismatched, or
attribute-mismatched policy input is invalid and must fail deterministically.
D5 must not guess or default a disposition.

For the first slice, `ROUTE` means exactly that D5 cannot decide the governed
categorical concept within the active discovery authority and routes to the
existing `EDUCATION_OR_CONSULTATION` fallback. It is not a within-authority
consultation route. Its reason is a new categorical-route semantic; the
claim-specific `CLAIM_AUTHORITY_UNAVAILABLE_ROUTE` reason must not be reused.
`CLARIFICATION` means the existing `CLARIFICATION` fallback. `UNSUPPORTED`
means the existing `EXPLICIT_UNSUPPORTED` fallback. This prevents the
provisional policy shape from smuggling an ungoverned route vocabulary into
D5-S1.

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
partition on a query decision. It is legal only for a `QUERY` subject. A
fixture-product decision must never return `REQUIRE_MATCH`.

The following alternatives are rejected:

- a required/preference field on every `ConstraintDecision`, because it changes
  the frozen shape, creates invalid cross-field combinations, and expands every
  downstream consumer;
- a parallel structured-constraint plan, because it creates a competing policy
  authority and synchronization boundary;
- query-level `ASSERT_MATCH`, because it falsely represents unevaluated query
  intent as product evidence.

## 7. Query truth table

Every query branch has `diagnostics = []` and includes
`NO_PRODUCT_ASSERTION`.

| Disposition | Authority | Gate | Score | Partition | Relaxation | Speech addition | Fallback | Provisional reason semantic |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `REQUIRED` | `NOT_APPLICABLE` | `REQUIRE_MATCH` | `NONE` | `NOT_APPLICABLE` | `NEVER` | none | none | categorical required by policy |
| `PREFERENCE` | `NOT_APPLICABLE` | `DO_NOT_GATE` | `PREFERENCE_ALLOWED` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | none | none | categorical preference by policy |
| `ROUTE` | `OUTSIDE_DISCOVERY_AUTHORITY` | `ROUTE_ONLY` | `NONE` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `DISCLOSE_ROUTE_LIMITATION` | `EDUCATION_OR_CONSULTATION` | categorical policy route outside discovery authority |
| `CLARIFICATION` | `NOT_APPLICABLE` | `REQUIRE_CLARIFICATION` | `NONE` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `DISCLOSE_ROUTE_LIMITATION` | `CLARIFICATION` | categorical policy clarification |
| `UNSUPPORTED` | `NOT_APPLICABLE` | `UNSUPPORTED` | `NONE` | `UNKNOWN` | `NOT_APPLICABLE` | `DISCLOSE_ROUTE_LIMITATION` | `EXPLICIT_UNSUPPORTED` | categorical policy unsupported |

Each disposition requires an inspectable durable reason. Exact new reason
spellings remain provisional until source review; existing reasons may be
reused only without broadening their meaning.

D6-B1 may enumerate only when every interpreted constraint in the entire
structured-only request is eligible and resolves to
`REQUIRED + REQUIRE_MATCH`. `REQUIRED + REQUIRED` may proceed only when no
contradiction, duplicate attribute, or other invalid condition exists. Any
preference, route, clarification, unsupported, exact, continuous,
claim-bearing, derived, or otherwise out-of-scope sibling makes the entire
request stop before B1 enumeration. No constraint is silently dropped,
upgraded, relaxed, or consumed according to order, and every per-constraint
decision remains preserved. Aggregate D6-B1 result fields and precedence remain
deferred to D6-B1.

Query-level `PREFERENCE` remains a non-gating policy decision. D5-S1 does not
evaluate fixture-product preference evidence; that work is deferred to a
separately governed preference/ranking contract with an actual consumer.

## 8. Fixture-product evidence

Fixture-product evaluation is authorized only after the query constraint has
resolved to `REQUIRED + REQUIRE_MATCH`. The product constraint retains the
query constraint's categorical value, attribute band, and dedicated decision
profile. Its fixture-product subject remains fixture-only and provisional.

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
UNKNOWN_AUTHORITY
```

Vendor-attested stylistic evidence is deferred even if a claim-bearing policy
elsewhere permits vendor attestation.

| Evidence outcome | Gate | Score | Partition | Candidate effect |
| --- | --- | --- | --- | --- |
| authoritative same-attribute, same-value match | `ASSERT_MATCH` | `NONE` | `ASSERTED` | satisfies |
| authoritative same-attribute, different-value evidence | `DO_NOT_GATE` | `NONE` | `VIOLATING` | excluded from asserted required set |
| no evidence for the required attribute | `DO_NOT_GATE` | `NONE` | `UNKNOWN` | does not satisfy |
| matching-attribute unknown or non-authoritative evidence | `DO_NOT_GATE` | `NONE` | `UNKNOWN` | does not satisfy |
| conflicting matching-attribute evidence | `DO_NOT_GATE` | `NONE` | `WITHHELD` | does not satisfy |

An explicitly supplied evidence record under a different attribute identity is
invalid S1 fixture input; it is not candidate `UNKNOWN`. Categorical
`NOT_REPRESENTABLE` is also invalid S1 fixture input and produces no candidate
decision. `UNSUPPORTED_CONCEPT` must not be reused or broadened for product
representability.

`EVIDENCE_QUALIFIED_MATCH`, `EVIDENCE_QUALIFIED_MISMATCH`,
`PRODUCT_EVIDENCE_UNKNOWN`, and `PRODUCT_EVIDENCE_CONFLICT` are reused only
with their existing meanings. Model-inferred stylistic evidence requires a new
non-claim-specific non-assertion reason; its spelling remains provisional.

`ROUTE`, `CLARIFICATION`, and `UNSUPPORTED` are query dispositions and do not
authorize fixture-product evaluation. Neither does query-level `PREFERENCE`;
product preference evidence decisions are deferred.

## 9. Confirmation

`USER_CONFIRMATION`:

- may establish declared intent;
- reuses `CONFIRMATION_CHANGED_INTENT_ONLY`;
- does not create, upgrade, or repair product evidence;
- does not bypass or select the injected policy;
- retains the same request-local target and categorical value identity;
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
- fixture-product `REQUIRE_MATCH` is rejected;
- preference is non-gating and cannot affect B1 ordering or exclusion;
- product preference evidence evaluation is absent and deferred;
- route, clarification, and unsupported stop before retrieval;
- route uses `OUTSIDE_DISCOVERY_AUTHORITY` and a new categorical-route reason,
  never the claim-specific route reason;
- only declared, governed, stylistic categorical input is eligible;
- wrong kind, band, profile, or interpretation remains rejected;
- missing, duplicate, conflicting, blank-version, and mismatched policies fail
  deterministically;
- policies bind to one request-local target plus attribute identity and cannot
  be reused across sibling constraints by attribute alone;
- required product match, mismatch, unknown, and conflict;
- absent required-attribute evidence is unknown, explicitly wrong-attribute
  evidence is invalid, and same-attribute wrong-value evidence is violating;
- categorical `NOT_REPRESENTABLE` is rejected without broadening
  `UNSUPPORTED_CONCEPT`;
- model-inferred and both vendor evidence states cannot assert;
- confirmation changes intent only;
- mixed-disposition and otherwise out-of-scope requests stop wholly before B1
  enumeration while retaining all per-constraint decisions;
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
