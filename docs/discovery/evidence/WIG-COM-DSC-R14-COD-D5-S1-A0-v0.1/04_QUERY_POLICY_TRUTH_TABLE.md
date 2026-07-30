# Query policy truth table

## Eligibility precondition

The table applies only to a `DECLARED` `CATEGORICAL` constraint in the
`STYLISTIC` band, carrying the dedicated provisional S1 profile and exactly one
matching injected categorical policy for that request-local target and
governed attribute. Other combinations fail D5 input validation and do not
fall through to a disposition.

One policy applies to one interpreted-constraint decision target in one
decision request. Request-local constraint identity is not a durable
cross-request policy key. A policy is not a global attribute default and cannot
be reused for a sibling by attribute identity alone.

Every row has:

```text
subject:      QUERY
diagnostics:  []
speech:       includes NO_PRODUCT_ASSERTION
```

## Complete tuples

| Policy disposition | Authority | Gate | Score | Partition | Relaxation | Additional speech | Fallback routes | D6-B1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `REQUIRED` | `NOT_APPLICABLE` | `REQUIRE_MATCH` | `NONE` | `NOT_APPLICABLE` | `NEVER` | none | `[]` | conditionally enumerate |
| `PREFERENCE` | `NOT_APPLICABLE` | `DO_NOT_GATE` | `PREFERENCE_ALLOWED` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | none | `[]` | stop |
| `ROUTE` | `OUTSIDE_DISCOVERY_AUTHORITY` | `ROUTE_ONLY` | `NONE` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `DISCLOSE_ROUTE_LIMITATION` | `EDUCATION_OR_CONSULTATION` | stop |
| `CLARIFICATION` | `NOT_APPLICABLE` | `REQUIRE_CLARIFICATION` | `NONE` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `DISCLOSE_ROUTE_LIMITATION` | `CLARIFICATION` | stop |
| `UNSUPPORTED` | `NOT_APPLICABLE` | `UNSUPPORTED` | `NONE` | `UNKNOWN` | `NOT_APPLICABLE` | `DISCLOSE_ROUTE_LIMITATION` | `EXPLICIT_UNSUPPORTED` | stop |

## Reason requirements

Each row must have one disposition-specific inspectable reason. Provisional
semantic slots are:

```text
categorical required by policy
categorical preference by policy
categorical policy route outside discovery authority
categorical policy clarification required
categorical policy unsupported
```

Exact literals are not frozen by A0. A `USER_CONFIRMATION` source adds
`CONFIRMATION_CHANGED_INTENT_ONLY` without replacing the policy reason.
The route reason is a new categorical semantic and must not reuse
`CLAIM_AUTHORITY_UNAVAILABLE_ROUTE`.

## Invalid configuration table

| Input defect | Result |
| --- | --- |
| no matching categorical policy | deterministic invalid input |
| duplicate matching policy | deterministic invalid input |
| conflicting matching policies | deterministic invalid input |
| policy target differs from the request-local constraint target | deterministic invalid input |
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
| `USER_CONFIRMATION` | may establish `DECLARED` for the same request-local constraint/value | none; same target and attribute policy validation | none; cannot upgrade a product partition | disposition reason plus `CONFIRMATION_CHANGED_INTENT_ONLY` |

Confirmation cannot repair a wrong kind, band, profile, policy identity, or
policy multiplicity.

## Whole-request D6-B1 rule

| Request decisions | Request result before enumeration |
| --- | --- |
| every constraint is eligible `REQUIRED + REQUIRE_MATCH` | may proceed if no contradiction, duplicate attribute, or other invalid condition exists |
| any `PREFERENCE`, `ROUTE`, `CLARIFICATION`, or `UNSUPPORTED` sibling | entire request stops |
| any exact, continuous, claim-bearing, derived, or otherwise out-of-scope sibling | entire request stops |
| any invalid or contradictory constraint set | entire request stops as invalid |

No constraint is silently dropped, upgraded, relaxed, or consumed by order.
All per-constraint decisions remain preserved. Aggregate D6-B1 result fields
and precedence remain deferred to D6-B1.
