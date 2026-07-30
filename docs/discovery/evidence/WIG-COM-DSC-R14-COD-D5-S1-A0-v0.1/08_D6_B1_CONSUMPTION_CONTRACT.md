# D6-B1 consumption contract

## Blocking relationship

The current D6-B contract requires D5 to own:

- query-level categorical policy;
- required/preference/route/clarification/unsupported effects;
- non-claim stylistic fixture-product evidence decisions;
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

The future D6-B1 slice must preserve the complete query decision for
accountability.

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

## Non-authority

D6-B1 may not:

- infer policy from interpretation state, attribute ID, query wording, or
  catalog recall;
- invent a parallel structured plan or local policy enum;
- treat query `REQUIRE_MATCH` as proof of a product match;
- assert vendor, model, missing, conflicting, or ungoverned evidence;
- alter D6-A exact behavior;
- handle exact-plus-structured composition;
- connect production catalog, eligibility, route, UI, event, or commerce
  systems.

## Compatibility with D6-A

D6-A calls D5 only for a fixture-product exact identity and admits only
`ASSERT_MATCH + ASSERTED` plus exact identity reasons. D5-S1 adds a query-only
gate branch and preserves the field set, so D6-A requires no source change.
