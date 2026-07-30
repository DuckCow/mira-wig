# Candidate admission and partition analysis

## Candidate unit

`WigVariant` plus an explicit canonical `WigStyle` parent is the smallest unit
that preserves option identity, selected-variant price, fitting identity,
cart/checkout identity, and exact landing. A style-only candidate would require
an implicit/default variant that does not exist in schema or UI. A
variant-only candidate without its canonical parent would reproduce the
current cart incoherence risk.

## Source versus admission

The replaceable source may enumerate possible variant candidates and attach
source/snapshot accountability. It has no authority to call a candidate an
asserted match.

The single structured admission choke point must validate:

1. structured-only request applicability and policy-plan version;
2. candidate membership, variant identity, and canonical parent;
3. per-candidate/per-attribute evidence identity, provenance, state, and
   uniqueness;
4. the D5 policy decision for every constraint;
5. injected eligibility identity, market, freshness/version, and outcome;
6. selected-variant price basis and landing identity;
7. component attribution and deterministic accountability.

No asserted result, ordering, exposure, landing, or later ranker may bypass
this point.

## Partition preservation

For each candidate, D6-B preserves each constraint's `gate`, `score`,
`partition`, speech, relaxation, routes, reasons, and evidence attribution.
It does not average or sum these values.

- `ASSERTED`: eligible for the asserted set only when every policy-designated
  required constraint permits assertion and eligibility admits the candidate.
- `UNKNOWN`: retained in an inspectable unknown partition, never relabeled as
  match.
- `VIOLATING`: retained as a mismatch/violating partition where the future
  contract permits visibility, never force-filled into asserted results.
- `WITHHELD`: not asserted or exposed as confirmed; reason/disclosure remains
  inspectable under the governing policy.
- conflicting or duplicate evidence is a visible admission failure/partition,
  not last-write-wins.

Preference-only constraints cannot create evidence or exclude a candidate.
No D6-B1 ranker exists, so source order cannot become an accidental relevance
order. Deterministic output should use a declared identity ordering only for
stable serialization.

## Empty outcome

Zero asserted results preserve the original constraints and report the
candidate/evidence partitions and stable reasons. There is no automatic
relaxation, sibling substitution, free-text fallback, or forced fill.
