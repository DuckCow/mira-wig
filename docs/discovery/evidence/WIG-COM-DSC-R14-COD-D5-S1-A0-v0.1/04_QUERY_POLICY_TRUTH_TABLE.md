# Query policy truth table

## Eligibility precondition

The table applies only to a `DECLARED` `CATEGORICAL` constraint in the
`STYLISTIC` band, carrying the dedicated provisional S1 profile and exactly one
matching injected categorical policy. Other combinations fail D5 input
validation and do not fall through to a disposition.

Every row has:

```text
subject:            QUERY
authority outcome:  NOT_APPLICABLE
diagnostics:        []
speech:             includes NO_PRODUCT_ASSERTION
```

## Complete tuples

| Policy disposition | Gate | Score | Partition | Relaxation | Additional speech | Fallback routes | D6-B1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `REQUIRED` | `REQUIRE_MATCH` | `NONE` | `NOT_APPLICABLE` | `NEVER` | none | `[]` | enumerate |
| `PREFERENCE` | `DO_NOT_GATE` | `PREFERENCE_ALLOWED` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | none | `[]` | stop |
| `ROUTE` | `ROUTE_ONLY` | `NONE` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `DISCLOSE_ROUTE_LIMITATION` | `EDUCATION_OR_CONSULTATION` | stop |
| `CLARIFICATION` | `REQUIRE_CLARIFICATION` | `NONE` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `DISCLOSE_ROUTE_LIMITATION` | `CLARIFICATION` | stop |
| `UNSUPPORTED` | `UNSUPPORTED` | `NONE` | `UNKNOWN` | `NOT_APPLICABLE` | `DISCLOSE_ROUTE_LIMITATION` | `EXPLICIT_UNSUPPORTED` | stop |

## Reason requirements

Each row must have one disposition-specific inspectable reason. Provisional
semantic slots are:

```text
categorical required by policy
categorical preference by policy
categorical policy route
categorical policy clarification required
categorical policy unsupported
```

Exact literals are not frozen by A0. A `USER_CONFIRMATION` source adds
`CONFIRMATION_CHANGED_INTENT_ONLY` without replacing the policy reason.

## Invalid configuration table

| Input defect | Result |
| --- | --- |
| no matching categorical policy | deterministic invalid input |
| duplicate matching policy | deterministic invalid input |
| conflicting matching policies | deterministic invalid input |
| policy attribute differs from constraint attribute | deterministic invalid input |
| blank policy version | deterministic invalid input |
| wrong kind, band, profile, or interpretation state | deterministic invalid input |
| derived, bridged, or unresolved interpretation | outside S1; deterministic invalid input |

No invalid fixture condition is converted into `PREFERENCE`, `ROUTE`, or
`UNSUPPORTED`.

## Confirmation table

| Source | Interpretation effect | Policy effect | Evidence effect | Reason effect |
| --- | --- | --- | --- | --- |
| `QUERY_SPAN` | retains injected interpretation | none | none | disposition reason |
| `USER_CONFIRMATION` | may establish `DECLARED` for the same constraint/value | none; same exact policy validation | none; cannot upgrade a product partition | disposition reason plus `CONFIRMATION_CHANGED_INTENT_ONLY` |

Confirmation cannot repair a wrong kind, band, profile, policy identity, or
policy multiplicity.
