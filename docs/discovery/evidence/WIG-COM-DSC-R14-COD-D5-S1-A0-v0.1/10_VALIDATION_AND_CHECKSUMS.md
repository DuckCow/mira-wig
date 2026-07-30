# Validation and source checksums

## Bound source checksums

The SHA-256 values below bind the material current-repository inputs used by
this reconnaissance:

```text
39d016eca3570b8a0a6876440d1caccc342fc76c796e26c99d5bb8003cd27ae2  src/lib/discovery/types.ts
8ff7abb813a5200c22e72a313a22505f1f0f1d00c9067758513024cc99aeeafc  src/lib/discovery/versions.ts
2aad5e27ab7cd9670d9c7af2037b09dff0fb76cdc1c56a2ddef8b442de136cdf  src/lib/discovery/parse-query.ts
dba8c67a2f38889541750b4b326e08e838531a5e382c6358377774964ac64792  src/lib/discovery/decide-constraint.ts
37fad8bd6b9d7a576add615ae97050c74455fba8243bd7a43ebb38c6ccafe8e0  src/lib/discovery/__tests__/types.test.ts
e931eac640be263718d8b3fe7122c7b2fccdcf1f3e0f9b845ed39105f1b468fb  src/lib/discovery/__tests__/decide-constraint.test.ts
a149bd1b8db8423ca338cedf2d4593ef541d685f677c3585cffce2a217967420  src/lib/discovery/__tests__/golden-cases.test.ts
eb980d091b91581bfa15a7ab4c21bd2c506b0a3de8818aa9f1e2a2c5bc6ba5e0  src/lib/discovery/__tests__/boundary.test.ts
f9904f7649f41ef0d593f1bfaa66400a94fe734c386c86614de6f893f163e3d3  src/lib/discovery/retrieval/types.ts
aea59b0a6e0a888a03017105f36a46c43d4004f4e3a6d308be0b3173891c5cc4  src/lib/discovery/retrieval/candidate-admission.ts
5cc9ae8ecba77ad8d5c7a4c233bef2864c9b10793ae565c1166599a42c2177e4  src/lib/discovery/retrieval/__tests__/freeze-conformance.test.ts
1cf9d17a0824ea66e7c501b6b942d620977969b000b56e7104bd722b9efe011f  docs/discovery/d5-source-vocabulary-contract-v0.1.md
ad1e60241db486705b3017dec72025754602ff19b20beb9b7b556f0fe2c30100  docs/discovery/d6-structured-retrieval-contract-v0.1.md
```

## Validation plan

Before commit:

1. parse every JSON evidence file;
2. verify every manifest SHA-256 and byte-size entry;
3. verify the evidence directory contains exactly the eleven required files;
4. verify documentation links;
5. inspect `git diff --check`;
6. confirm changed paths are limited to the authorized contract, evidence,
   README, and decision log;
7. run `npm run verify`;
8. confirm the committed worktree is clean.

The resulting command status and commit SHA belong in the draft PR body, not in
this immutable snapshot.

## Adversarial consistency audit

| Audit | Result |
| --- | --- |
| Query intent is represented as product evidence | NO |
| Interpretation state determines hardness | NO |
| Confirmation creates product evidence | NO |
| Route, clarification, or unsupported invokes retrieval | NO |
| Preference excludes or ranks in D6-B1 | NO |
| Vendor attestation gains stylistic authority | NO |
| Model inference gains stylistic assertion authority | NO |
| Claim or continuous semantics are weakened | NO |
| `ConstraintDecision` field set changes | NO |
| Ontology IDs or storage ownership are frozen | NO |
| Parser, normalizer, or D6 source becomes required | NO |
| D6-A exact admission semantics change | NO |
| D6-B invents local policy | NO |
| Continuous query policy enters D5-S1 | NO |
| Existing versioned contract is edited | NO |
| Version sequence contradicts current freezes | NO |
| An outcome lacks an inspectable rationale | NO |
| Existing reason meaning is silently broadened | NO |
| Source implementation is authorized | NO |
| Production behavior is activated | NO |
| Human ruling is rejected or unresolved | NO |

No `BLOCKER` or `UNRESOLVED` result remains.
