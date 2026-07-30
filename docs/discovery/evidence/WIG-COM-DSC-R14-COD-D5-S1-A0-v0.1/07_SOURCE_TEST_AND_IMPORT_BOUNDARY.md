# Source, test, and import boundary

## Current production source

The D5 production tree is exactly:

```text
src/lib/discovery/types.ts
src/lib/discovery/versions.ts
src/lib/discovery/normalize-query.ts
src/lib/discovery/parse-query.ts
src/lib/discovery/decide-constraint.ts
```

`boundary.test.ts` locks both this inventory and the import graph. D5-S1 should
not add a production module.

Source anchors:

- production inventory and imports:
  `src/lib/discovery/__tests__/boundary.test.ts:7-91`;
- current decision target, subject, and output types:
  `src/lib/discovery/types.ts:373-503`;
- current gate/score/partition/reason literals:
  `src/lib/discovery/types.ts:418-483`;
- policy fixture union:
  `src/lib/discovery/types.ts:345-371`.

## Consumer trace

### `ConstraintDecision`

- declared in `types.ts`;
- constructed only through `makeDecision` in `decide-constraint.ts`;
- returned by `decideConstraint`;
- asserted throughout D5 decision and golden tests;
- imported into D6-A retrieval types and embedded in `ExactVariantResult`;
- consumed by D6-A exact candidate admission.

Anchors: `src/lib/discovery/decide-constraint.ts:64-81`,
`src/lib/discovery/retrieval/types.ts:159-174`, and
`src/lib/discovery/retrieval/candidate-admission.ts:200-225`.

### Gate, score, partition, relaxation, fallback, and reason vocabulary

- declared in `types.ts`;
- exhaustively enumerated in `types.test.ts`;
- assigned by decision branches in `decide-constraint.ts`;
- asserted in D5 decision/golden tests;
- exact gate/partition/reasons inspected by D6-A admission;
- reasons and speech/fallback carried into D6-A result and landing shapes.

The exhaustive lists are at
`src/lib/discovery/__tests__/types.test.ts:83-150`.

### `D5DecisionProfile`

- declared in `types.ts`;
- carried by lexicon entries and interpreted constraints;
- selected from injected lexicon data by `parse-query.ts`;
- exhaustively exercised in parser/type/decision tests;
- validated in `decide-constraint.ts`.

The parser reads the profile and interpretation directly from the selected
candidate at `src/lib/discovery/parse-query.ts:507-524`.

### Policy fixtures

- declared as the `DecisionPolicyFixture` union in `types.ts`;
- deduplicated, validated, and narrowed in `decide-constraint.ts`;
- currently cover continuous tolerance, claim authority, and vendor
  attestation;
- are supplied only by source tests and synthetic callers.

Policy deduplication and kind validation are centralized at
`src/lib/discovery/decide-constraint.ts:106-149`.

### `decideConstraint`

- sole public D5 decision entrypoint;
- used by D5 unit and golden tests;
- used by D6-A `candidate-admission.ts` for exact fixture-product evidence;
- has no route, UI, Prisma, catalog, or network caller.

Current query categorical rejection is explicit at
`src/lib/discovery/decide-constraint.ts:632-649` and
`src/lib/discovery/decide-constraint.ts:765-785`. Current fixture categorical
validation is claim-profile-only at
`src/lib/discovery/decide-constraint.ts:665-678,715-734`.

## Expected later source boundary

A separately authorized D5-S1 implementation should be confined to:

```text
src/lib/discovery/types.ts
src/lib/discovery/versions.ts
src/lib/discovery/decide-constraint.ts
src/lib/discovery/__tests__/**
```

`parse-query.ts` already carries injected profile and interpretation state.
Categorical hardness belongs to the injected decision policy, so no parser or
normalizer change is expected.

## Required compatibility tests

- exhaustive gate list includes `REQUIRE_MATCH`;
- exact `ConstraintDecision` key set remains unchanged;
- every query and product truth-table row is behavior-tested;
- invalid policy multiplicity, identity, and version are tested;
- current D5 golden cases remain semantically unchanged;
- D6-A exact admission remains `ASSERT_MATCH + ASSERTED` with exact reasons;
- D5 and D6-A import-boundary tests remain green;
- no prohibited runtime dependency enters D5.

## Forbidden expansion

The later source task must not modify D6-A or D6-B to accommodate D5-S1, add a
barrel or forwarding module, import catalog/Prisma/route/UI code, or introduce
runtime I/O, time, randomness, storage, or events.
