# D6-A compatibility and composition

## Frozen exact-only path

`runExactSkuFixtureSlice` is the sole frozen primary entrypoint and
`verifyExactLanding` the sole frozen durable supporting export
(`docs/discovery/d6-a1-source-vocabulary-contract-v0.1.md:55-80`).

Current request assessment rejects:

- no exact identity;
- multiple exact identities;
- any additional constraint;
- non-SKU namespace;
- blank, unresolved, or contradicted exact identity;
- incompatible frozen D5 parser version.

See `src/lib/discovery/retrieval/candidate-admission.ts:44-100` and
`src/lib/discovery/retrieval/exact-slice.ts:43-80`.

Every exact hit passes `admitExactCandidate`, which validates synthetic source,
catalog identity proof, frozen D5 exact decision, candidate-specific market
eligibility, selected-variant price, and constructed landing integrity
(`src/lib/discovery/retrieval/candidate-admission.ts:358-405`). Result and
landing preserve variant/style identity and selected-variant price. The event
seam is injected, default-off, and sink failure cannot replace the core
outcome (`src/lib/discovery/retrieval/event-seam.ts:62-79`).

D6-A's candidate-specific eligibility pattern is not a substitute for D6-B's
pre-enumeration Stage-0 authority-universe scope/proof. D6-B has two injected
gates in this order:

1. a versioned Stage-0 scope/proof limits which items may enter candidate
   source membership and accountability;
2. candidate-specific commerce eligibility is mandatory inside admission for
   each enumerated candidate.

Discovery may reuse the pure injected-boundary pattern, but it must consume and
version both D6-B inputs without recomputing or conflating them.

## Safe reuse by D6-B

D6-B may reuse the architectural invariants:

- pure deterministic fixture-only orchestration;
- explicit variant plus canonical style identity;
- pre-enumeration scoping through an injected Stage-0 proof;
- selected-variant price basis through independently injected
  candidate-specific eligibility;
- one mandatory admission choke point;
- no repair on landing mismatch;
- component attribution;
- default-off/no-storage event boundary;
- import-boundary and immutability testing patterns.

It must not reuse exact-only statuses, reasons, candidate source, exact
accountability encoding, or exact admission as though they governed
multi-candidate structured semantics. New D6-B types, modules, versions,
partitions, and result vocabulary remain provisional until their own review.
This architectural reuse does not freeze a separate Stage-0 runtime module.

## Explicit composition

```text
exact-only       -> D6-A
structured-only  -> D6-B
exact+structured -> deferred D6-B3 composition contract
```

D6-B1 must reject or declare mixed requests inapplicable. Silently ignoring
structured constraints, softening exact identity, widening exact lookup, or
post-filtering D6-A would change the frozen D6-A contract and is prohibited.
