# Representation alternatives and adjudication

## Decision criteria

The comparison tested whether each representation:

- separates unevaluated query intent from evidence-qualified product assertion;
- preserves policy ownership in D5;
- separates policy disposition from interpretation state;
- preserves required versus preference product behavior;
- avoids changing the frozen `ConstraintDecision` shape;
- remains compatible with D6-A and the D6-B0 dependency;
- minimizes new invalid states and migration work.

## Alternatives

| Alternative | Disposition | Strongest case | Decisive problem |
| --- | --- | --- | --- |
| Add `REQUIRE_MATCH` to `GateDecision` | **CONFIRMED** | Encodes a query gate obligation in the existing policy output and preserves the field set | Requires an intentional new gate literal and v0.2 freeze |
| Add a required/preference field to `ConstraintDecision` | **REJECTED** | Makes policy use explicit without overloading `gate` | Changes the frozen output shape everywhere, duplicates gate/score, and permits incoherent combinations |
| Create parallel `StructuredConstraintPlan` | **REJECTED** | Could isolate query planning from product decisions | Creates a second policy authority, synchronization problem, and D6-local bypass forbidden by D6-B0 |
| Reuse `ASSERT_MATCH` at query level | **REJECTED** | Adds no vocabulary | Falsely asserts product match before evidence and collapses the query/product distinction |

## Why `REQUIRE_MATCH` is sufficient

`ConstraintDecision.subject` already distinguishes `QUERY` from
`FIXTURE_PRODUCT`. The new literal supplies the missing query obligation:

```text
QUERY + REQUIRE_MATCH
  means candidate evidence must later satisfy this constraint

FIXTURE_PRODUCT + ASSERT_MATCH + ASSERTED
  means evaluated evidence supports the product assertion
```

Required/preference use is already represented by the coordinated gate and
score tuple:

```text
required query   REQUIRE_MATCH + NONE
preference query DO_NOT_GATE + PREFERENCE_ALLOWED
```

Adding another field would not resolve a missing semantic; it would merely
create a second encoding that could disagree.

## Downstream compatibility

The only current non-test source consumer outside D5 is D6-A exact admission:

- `candidate-admission.ts` calls `decideConstraint` for a
  `FIXTURE_PRODUCT`;
- it admits only `ASSERT_MATCH + ASSERTED` with the two exact reasons;
- `ExactVariantResult` carries the complete `ConstraintDecision`.

A query-only `REQUIRE_MATCH` branch cannot satisfy or disturb that exact
admission predicate. Preserving the field set prevents a D6-A shape change.

## Refinements to supplied rulings

- `ROUTE` is fixed to `EDUCATION_OR_CONSULTATION` for S1; a provisional
  fixture cannot invent arbitrary route vocabulary.
- `UNSUPPORTED` keeps the current `UNKNOWN` partition.
- every policy disposition has an inspectable reason semantic.
- exact new reason/profile/policy spellings remain provisional until source
  review.
- invalid policy fixture configuration throws deterministically rather than
  producing a customer-semantic decision.

No supplied ruling was materially rejected or left unresolved.

## Ruling-by-ruling adjudication

| Ruling | Disposition | Reconnaissance result |
| --- | --- | --- |
| `S1-R01` | `CONFIRMED` | Current query continuous policy is absent and D6-B0 defers it until measurement governance. |
| `S1-R02` | `CONFIRMED` | The D6-B1 target is governed non-claim stylistic categorical only. |
| `S1-R03` | `CONFIRMED` | `DECLARED` is the contracted B1 input; derived free-text preferences remain deferred. |
| `S1-R04` | `CONFIRMED` | Interpretation state describes meaning; injected decision policy must own hardness. |
| `S1-R05` | `REFINED` | The five dispositions stand; `ROUTE` is narrowed to the existing consultation fallback for S1. |
| `S1-R06` | `CONFIRMED` | `REQUIRE_MATCH` is necessary to avoid query-level product assertion and preserves the field set. |
| `S1-R07` | `CONFIRMED` | Neither another use field nor a parallel plan supplies missing semantics without duplication. |
| `S1-R08` | `REFINED` | The supplied required/preference tuples stand; route/clarification tuples are completed and unsupported keeps `UNKNOWN`. |
| `S1-R09` | `CONFIRMED` | B1 is required-only and unranked; all other dispositions stop before enumeration. |
| `S1-R10` | `REFINED` | Existing evidence partitions/reasons are reused, but preference changes gate/score without changing evidence truth. |
| `S1-R11` | `CONFIRMED` | Only verified/measured and evidence-curated inputs may assert; vendor authority does not transfer from claims. |
| `S1-R12` | `CONFIRMED` | An authoritative preference match is an asserted fact but not a gate; mismatch cannot exclude. |
| `S1-R13` | `CONFIRMED` | Current confirmation mechanics change intent only and retain the existing reason. |
| `S1-R14` | `CONFIRMED` | Exact IDs, fixture shape, profile spelling, and new reason spellings remain provisional. |
| `S1-R15` | `CONFIRMED` | Existing ownership/import boundaries require no parser, normalizer, or D6 change. |
| `S1-R16` | `CONFIRMED` | Constraint rules advance provisionally; promotion waits for source review and a v0.2 vocabulary contract. |

The refinements narrow or complete the supplied behavior without reversing a
material human ruling.
