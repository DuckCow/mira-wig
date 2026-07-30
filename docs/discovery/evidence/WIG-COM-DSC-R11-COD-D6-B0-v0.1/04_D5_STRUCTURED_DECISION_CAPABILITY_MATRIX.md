# D5 structured-decision capability matrix

## Representable shapes versus executable policy

| Constraint kind | Query level | Fixture-product level | Current evidence |
| --- | --- | --- | --- |
| `EXACT_IDENTITY` | Rejected | Supported only with `IDENTITY`, no profile | `src/lib/discovery/decide-constraint.ts:632-663,715-735` |
| `CATEGORICAL` | Rejected | Supported only as `CLAIM_BEARING` + `CLAIM_BEARING_MATERIAL` | `src/lib/discovery/decide-constraint.ts:632-678,715-735` |
| `CONTINUOUS` | Rejected | Supported only as `DIMENSIONAL_CONTINUOUS` with optional synthetic tolerance policy | `src/lib/discovery/decide-constraint.ts:632-650,680-690,715-735` |
| `OUTCOME_INTENT` | Supported only as sensitive-use-context route with unavailable claim authority | Rejected | `src/lib/discovery/decide-constraint.ts:585-601,765-804` |
| `AUTHORITY_ROUTE` | Supported | Rejected | `src/lib/discovery/decide-constraint.ts:603-614,765-804` |
| `UNKNOWN_OR_UNSUPPORTED` | Supported under strict unresolved stylistic validation | Fixture-product only for `NOT_REPRESENTABLE` evidence | `src/lib/discovery/decide-constraint.ts:616-630,693-735` |
| contradiction | Query subject only | Rejected | `src/lib/discovery/decide-constraint.ts:737-763` |

The types can serialize categorical and continuous values
(`src/lib/discovery/types.ts:121-164`), but that does not make them legal at
query level. Tests explicitly require query-level exact/material constraints
to throw and require non-claim stylistic categorical fixture-product input to
throw (`src/lib/discovery/__tests__/decide-constraint.test.ts:432-514`).

## Preserved decision dimensions

Each current `ConstraintDecision` independently carries:

- `gate`: assert, do-not-gate, clarify, route, unsupported;
- `score`: none or preference allowed;
- `partition`: asserted, unknown, violating, withheld, not applicable;
- speech requirements;
- relaxation;
- fallback routes;
- durable or fixture reason codes;
- fixture diagnostics.

See `src/lib/discovery/types.ts:410-484`. Current product evidence processing
distinguishes missing/unknown, conflicting, model-inferred, authoritative
match, authoritative mismatch, and tolerance outcomes; it does not expose a
weighted scalar (`src/lib/discovery/decide-constraint.ts:200-224,339-582`).

## Smallest required D5-S1 extension

Before D6-B1, D5 must add:

1. a query-level policy disposition for governed categorical constraints;
2. an explicit policy-owned required/preference/route/clarification effect;
3. fixture-product support for non-claim `STYLISTIC` categorical evidence;
4. validation preserving current claim-bearing and sensitive-use rules;
5. compatibility tests retaining current reason, partition, disclosure, and
   relaxation semantics;
6. a versioned D5 source-vocabulary contract.

D6-B cannot supply these semantics without becoming a competing
constraint-policy owner.

Current fixture-product continuous support and its optional synthetic
tolerance policy do not establish query-level continuous policy:
`validateQueryConstraint` still rejects `CONTINUOUS`, and the fixture
machinery does not govern measurement method, canonical unit, product
evidence, or customer-facing tolerance semantics. None of that is needed by
the categorical-only D6-B1 slice.

The dependency is therefore split:

```text
D5-S1 = governed categorical query policy + non-claim stylistic categorical evidence
D5-S2 = continuous query policy after measurement/unit/evidence/tolerance governance
```

D5-S2 is a later prerequisite for D6-B2, not D6-B1.
