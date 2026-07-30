# Frozen vocabulary impact matrix

## Current frozen surface

The D5 v0.1 source-vocabulary contract freezes:

- all eleven `ConstraintDecision` fields;
- the five current gate literals;
- score, speech, partition, relaxation, fallback, and twelve durable reason
  literals;
- the distinction between durable query subject/level and provisional
  fixture-product subject/level.

Relevant source anchors:

- `src/lib/discovery/types.ts:373-484`;
- `src/lib/discovery/__tests__/types.test.ts:83-150`;
- `docs/discovery/d5-source-vocabulary-contract-v0.1.md:112-213`.

## D5-S1 impact

| Surface | Current state | D5-S1 design | Compatibility classification |
| --- | --- | --- | --- |
| `ConstraintDecision` fields | eleven frozen fields | unchanged | compatible |
| `GateDecision` | five frozen literals | add provisional `REQUIRE_MATCH` | requires v0.2 contract |
| `ScoreDecision` | `NONE`, `PREFERENCE_ALLOWED` | unchanged | semantic reuse |
| `EvidencePartition` | five literals | unchanged | semantic reuse |
| `RelaxationDecision` | three literals | unchanged | semantic reuse |
| fallback routes | five literals | unchanged | semantic reuse |
| speech requirements | four literals | unchanged | semantic reuse |
| durable reasons | twelve literals | add categorical-policy semantics and one stylistic model-inference semantic | requires provisional source spellings and v0.2 freeze |
| `D5DecisionProfile` | current labels provisional | add a dedicated provisional stylistic profile | provisional fixture/input vocabulary |
| `DecisionPolicyFixture` | continuous, claim, vendor fixtures | add categorical policy fixture | provisional fixture-only vocabulary |
| constraint-rules component | `d5-constraint-decisions/v0.1` | `v0.2-provisional` during implementation | later promotion only |
| parser/normalizer versions | v0.1 | unchanged | compatible |

## Exhaustive consumers

`types.test.ts` deliberately enumerates every gate and durable reason. A later
source change must update those lists. The frozen D6-A conformance suite embeds
`ConstraintDecision` inside the exact result but does not exhaustively
redeclare D5 gate literals. Its admission code checks specifically for
fixture-product `ASSERT_MATCH` and exact reasons.

Changing the decision field set would force:

- the sole D5 construction path in `makeDecision`;
- all D5 decision tests and serialized golden expectations;
- the D6-A result shape carried through `ExactVariantResult`;
- the frozen D6-A output-shape contract and conformance tests.

Adding a subject-aware gate literal avoids that migration while still requiring
an intentional D5 v0.2 vocabulary freeze.

## No in-place contract rewrite

The existing D5 v0.1 contract remains historical authority for v0.1. D5-S1
source, if separately authorized, stays provisional until a new v0.2
source-vocabulary contract supersedes it. This A0 task does not edit v0.1.
