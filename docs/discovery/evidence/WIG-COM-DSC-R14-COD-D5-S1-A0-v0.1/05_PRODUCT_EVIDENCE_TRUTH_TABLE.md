# Product evidence truth table

## Assertion authority

Only `VERIFIED_OR_MEASURED` and `HUMAN_CURATED_FROM_EVIDENCE` may assert an S1
stylistic categorical match. Attribute identity and categorical value kind
must be comparable; the value ID must match for an assertion.

`APPROVED_VENDOR_ATTESTED`, `UNAPPROVED_VENDOR_DECLARATION`,
`MODEL_INFERRED`, `MISSING`, `UNKNOWN_AUTHORITY`, `NOT_REPRESENTABLE`, and
`CONFLICTING` cannot assert. Vendor policy used by the current claim-bearing
profile does not transfer to S1.

## Required policy

| Evidence state/result | Gate | Score | Partition | Speech | Reason semantic | Required-set effect |
| --- | --- | --- | --- | --- | --- | --- |
| authoritative comparable match | `ASSERT_MATCH` | `NONE` | `ASSERTED` | `DISCLOSE_EVIDENCE_BASIS` | reuse `EVIDENCE_QUALIFIED_MATCH` | satisfies |
| authoritative comparable mismatch | `DO_NOT_GATE` | `NONE` | `VIOLATING` | `NO_PRODUCT_ASSERTION` | reuse `EVIDENCE_QUALIFIED_MISMATCH` | exclude |
| missing, unknown, vendor, noncomparable, or wrong attribute | `DO_NOT_GATE` | `NONE` | `UNKNOWN` | `NO_PRODUCT_ASSERTION`, `DISCLOSE_UNKNOWN` as applicable | reuse `PRODUCT_EVIDENCE_UNKNOWN` | does not satisfy |
| model inferred | `DO_NOT_GATE` | `NONE` | `UNKNOWN` | `NO_PRODUCT_ASSERTION`, `DISCLOSE_UNKNOWN` | new stylistic non-authority semantic | does not satisfy |
| conflicting | `DO_NOT_GATE` | `NONE` | `WITHHELD` | `NO_PRODUCT_ASSERTION`, `DISCLOSE_UNKNOWN` | reuse `PRODUCT_EVIDENCE_CONFLICT` | does not satisfy |
| not representable | `UNSUPPORTED` | `NONE` | `UNKNOWN` | `NO_PRODUCT_ASSERTION`, `DISCLOSE_ROUTE_LIMITATION` | reuse only if `UNSUPPORTED_CONCEPT` meaning is unchanged; otherwise new provisional semantic | does not satisfy |

## Preference policy

| Evidence state/result | Gate | Score | Partition | Candidate effect |
| --- | --- | --- | --- | --- |
| authoritative comparable match | `DO_NOT_GATE` | `PREFERENCE_ALLOWED` | `ASSERTED` | preserves a non-gating future signal |
| authoritative comparable mismatch | `DO_NOT_GATE` | `NONE` | `VIOLATING` | does not exclude |
| missing, unknown, vendor, noncomparable, or wrong attribute | `DO_NOT_GATE` | `NONE` | `UNKNOWN` | does not exclude |
| model inferred | `DO_NOT_GATE` | `NONE` | `UNKNOWN` | does not exclude |
| conflicting | `DO_NOT_GATE` | `NONE` | `WITHHELD` | does not exclude |
| not representable | `UNSUPPORTED` | `NONE` | `UNKNOWN` | stops assertion; does not create preference authority |

The same evidence and speech reasons apply as in the required table. Only an
authoritative matching product fact may be `ASSERTED`; preference policy changes
gating/scoring, not evidence truth.

## Separation invariants

- Query `REQUIRE_MATCH` is not a product assertion.
- Product `ASSERT_MATCH` requires authoritative evidence.
- A preference match may be `ASSERTED` while remaining non-gating.
- A preference mismatch is `VIOLATING` but never excludes.
- Confirmation never upgrades evidence state or partition.
- D6-B1 consumes none of the preference product path for ranking.
