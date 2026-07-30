# Product evidence truth table

## Assertion authority

Only `VERIFIED_OR_MEASURED` and `HUMAN_CURATED_FROM_EVIDENCE` may assert an S1
stylistic categorical match. Attribute identity and categorical value kind
must be comparable; the value ID must match for an assertion.

`APPROVED_VENDOR_ATTESTED`, `UNAPPROVED_VENDOR_DECLARATION`,
`MODEL_INFERRED`, `MISSING`, `UNKNOWN_AUTHORITY`, and `CONFLICTING` cannot
assert. Vendor policy used by the current claim-bearing profile does not
transfer to S1.

D5-S1 fixture-product evaluation occurs only after the query constraint has
resolved to `REQUIRED + REQUIRE_MATCH`.

| Evidence state/result | Gate | Score | Partition | Speech | Reason semantic | Required-set effect |
| --- | --- | --- | --- | --- | --- | --- |
| authoritative same-attribute, same-value match | `ASSERT_MATCH` | `NONE` | `ASSERTED` | `DISCLOSE_EVIDENCE_BASIS` | reuse `EVIDENCE_QUALIFIED_MATCH` | satisfies |
| authoritative same-attribute, different-value evidence | `DO_NOT_GATE` | `NONE` | `VIOLATING` | `NO_PRODUCT_ASSERTION` | reuse `EVIDENCE_QUALIFIED_MISMATCH` | exclude |
| no evidence for the required attribute | `DO_NOT_GATE` | `NONE` | `UNKNOWN` | `NO_PRODUCT_ASSERTION`, `DISCLOSE_UNKNOWN` | reuse `PRODUCT_EVIDENCE_UNKNOWN` | does not satisfy |
| matching-attribute unknown, vendor, or otherwise non-authoritative evidence | `DO_NOT_GATE` | `NONE` | `UNKNOWN` | `NO_PRODUCT_ASSERTION`, `DISCLOSE_UNKNOWN` | reuse `PRODUCT_EVIDENCE_UNKNOWN` or a narrower new non-authority semantic | does not satisfy |
| matching-attribute model inference | `DO_NOT_GATE` | `NONE` | `UNKNOWN` | `NO_PRODUCT_ASSERTION`, `DISCLOSE_UNKNOWN` | new stylistic non-authority semantic | does not satisfy |
| conflicting matching-attribute evidence | `DO_NOT_GATE` | `NONE` | `WITHHELD` | `NO_PRODUCT_ASSERTION`, `DISCLOSE_UNKNOWN` | reuse `PRODUCT_EVIDENCE_CONFLICT` | does not satisfy |

## Invalid fixture evidence

| Input | Result |
| --- | --- |
| explicitly supplied evidence record under another attribute identity | deterministic invalid S1 fixture input |
| categorical `NOT_REPRESENTABLE` | deterministic invalid S1 fixture input; no candidate decision |

Wrong-attribute evidence is not candidate `UNKNOWN`. `UNSUPPORTED_CONCEPT` is
not reused or broadened for categorical product representability.

## Separation invariants

- Query `REQUIRE_MATCH` is not a product assertion.
- Fixture-product `REQUIRE_MATCH` is invalid.
- Product `ASSERT_MATCH` requires authoritative evidence.
- Confirmation never upgrades evidence state or partition.
- Product evidence truth remains independent of query policy.
- Product preference evidence decisions are deferred to a future
  preference/ranking contract with an actual consumer.
