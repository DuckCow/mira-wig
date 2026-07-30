# D6-B1 consumption contract

## Blocking relationship

The current D6-B contract requires D5 to own:

- query-level categorical policy;
- required/preference/route/clarification/unsupported effects;
- required-policy non-claim stylistic fixture-product evidence decisions;
- stable per-product partitions, reasons, disclosure, and relaxation output.

D6-B1 remains blocked until D5-S1 source and its v0.2 vocabulary freeze are
separately completed.

## Allowed query input

D6-B1 may consume only:

```text
subject:    QUERY
kind:       CATEGORICAL
band:       STYLISTIC
state:      DECLARED
policy:     REQUIRED
gate:       REQUIRE_MATCH
score:      NONE
partition:  NOT_APPLICABLE
```

The future D6-B1 slice must preserve every complete query decision for
accountability.

The predicate applies to the entire structured-only request: every interpreted
constraint must be eligible and resolve to `REQUIRED + REQUIRE_MATCH`.
`REQUIRED + REQUIRED` may proceed only when there is no contradiction,
duplicate attribute, or other invalid condition.

## Stop-before-enumeration outcomes

D6-B1 must not enumerate candidates for:

- `PREFERENCE`;
- `ROUTE`;
- `CLARIFICATION`;
- `UNSUPPORTED`;
- any invalid or out-of-scope D5-S1 input.

Preference is not silently upgraded to required behavior. B1 has no preference
ranking, preference filtering, preference exclusion, weighted score, or
automatic relaxation.

Any non-required or out-of-scope sibling stops the entire request before
enumeration. No constraint is silently dropped, upgraded, relaxed, or consumed
according to order. All per-constraint decisions remain preserved. Aggregate
D6-B1 result fields and precedence remain deferred to D6-B1.

Query-level preference remains a D5 stop decision. Fixture-product preference
evidence decisions are deferred to a future preference/ranking contract with an
actual consumer.

## Candidate assertion

For every required constraint, an asserted candidate must receive an
evidence-qualified fixture-product decision with:

```text
gate:       ASSERT_MATCH
partition:  ASSERTED
reason:     EVIDENCE_QUALIFIED_MATCH
```

`UNKNOWN`, `VIOLATING`, and `WITHHELD` do not satisfy a required query.
Candidate-specific commerce eligibility remains a separate mandatory admission
input and cannot substitute for the D5 evidence decision.

No evidence for the required attribute produces `UNKNOWN`. Same-attribute
wrong-value evidence produces `VIOLATING`. Explicitly wrong-attribute evidence
and categorical `NOT_REPRESENTABLE` are invalid S1 fixture inputs and produce
no candidate decision.

## Non-authority

D6-B1 may not:

- infer policy from interpretation state, attribute ID, query wording, or
  catalog recall;
- invent a parallel structured plan or local policy enum;
- treat query `REQUIRE_MATCH` as proof of a product match;
- return `REQUIRE_MATCH` for a fixture-product decision;
- assert vendor, model, missing, conflicting, or ungoverned evidence;
- alter D6-A exact behavior;
- handle exact-plus-structured composition;
- connect production catalog, eligibility, route, UI, event, or commerce
  systems.

## Compatibility with D6-A

D6-A calls D5 only for a fixture-product exact identity and admits only
`ASSERT_MATCH + ASSERTED` plus exact identity reasons. D5-S1 adds a query-only
gate branch and preserves the field set, so D6-A requires no source change.
