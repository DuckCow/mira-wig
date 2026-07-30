# Stage, versioning, and freeze plan

## Stage sequence

```text
D5-S1-A0
  read-only source reconnaissance
  normative design contract
  immutable evidence

→ D5-S1-A1 under a separate explicit source work order
  types/versions/decide-constraint/tests only
  constraint rules v0.2-provisional
  all new vocabulary provisional

→ D5-S1 source review and adjudicated fixes
  adversarial truth-table and vocabulary review
  no promotion while findings remain

→ D5-S1 source freeze preparation
  exhaustive conformance
  promote reviewed constraint-rules version only

→ D5 source-vocabulary contract v0.2
  supersede v0.1 without rewriting history
  freeze reviewed literal, reason, profile, policy, and behavior changes

→ D6-B1 under its own contract and source authorization
```

## Component versions

| Component | Current | D5-S1 implementation stage | Freeze rule |
| --- | --- | --- | --- |
| normalizer | `d5-conservative-normalizer/v0.1` | unchanged | remains frozen v0.1 |
| parser | `d5-injected-span-parser/v0.1` | unchanged | remains frozen v0.1 |
| constraint rules | `d5-constraint-decisions/v0.1` | `d5-constraint-decisions/v0.2-provisional` | promote only after source review |
| lexicon | injected/provisional | no production content | do not freeze content |
| ontology | injected/provisional | exact S1 IDs deferred | do not freeze content |

## Vocabulary status

During source implementation, all of the following remain provisional:

- `REQUIRE_MATCH`;
- categorical policy fixture type and fields;
- categorical disposition type;
- dedicated stylistic decision-profile spelling;
- new categorical policy reason spellings;
- stylistic model-inference non-authority reason spelling;
- helper, module-internal, and validation-error wording.

The v0.2 vocabulary contract must separately classify durable output
vocabulary, fixture-only policy vocabulary, internal symbols, and removed or
rejected alternatives.

## Deferred D5-S2

Continuous query policy remains deferred until measurement method, canonical
unit, evidence, and tolerance governance are contracted. D5-S1 does not change
current continuous source behavior or its fixture-only reasons.

## Activation boundary

No stage in this plan implicitly authorizes production ontology content,
catalog evidence, retrieval adapters, routes, UI, ranking, relaxation, event
collection, commerce integration, or production activation.
