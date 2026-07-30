# Validation and source checksums

## Bound source checksums

These SHA-256 values bind the most material current-repository inputs used by
the reconnaissance:

```text
d532c427aa50aa7e4295b7a4822303f1db38d8c3653a45ad4ab354d404592eaa  prisma/schema.prisma
2700e8faa080ec892435de06fbe883ec08ba497c79ef668a740519caed689db8  prisma/seed.ts
1a68fe76bc53466e3ae8447ab6e4bd01b0d5179977746b27d4c48acbfe2fb6f8  src/lib/catalog.ts
c43d776097fb4c60fb67b7a19b985ba4efef109be1c78f0752a7fc6a7f9631b1  src/lib/cart.ts
1bf1ca279c55f1c798ca434250caff8db78a9081a77b32963433858f63085568  src/lib/fitting/db.ts
ce05cc854b2fe246ae70189d3ca5d2a7de871afc6b22a5bab4959b3514e884cc  src/lib/payment/session/create.ts
39d016eca3570b8a0a6876440d1caccc342fc76c796e26c99d5bb8003cd27ae2  src/lib/discovery/types.ts
dba8c67a2f38889541750b4b326e08e838531a5e382c6358377774964ac64792  src/lib/discovery/decide-constraint.ts
18214333b8d14cbcb6ed186d1669e6312da779dc97732a9c94559e9964fdb403  src/lib/discovery/retrieval/exact-slice.ts
aea59b0a6e0a888a03017105f36a46c43d4004f4e3a6d308be0b3173891c5cc4  src/lib/discovery/retrieval/candidate-admission.ts
1cf9d17a0824ea66e7c501b6b942d620977969b000b56e7104bd722b9efe011f  docs/discovery/d5-source-vocabulary-contract-v0.1.md
5c3fe15f89d04feaa5cff9ba4f25c83b9cdf359a9a09d599c70948400c8fed48  docs/discovery/d6-a1-source-vocabulary-contract-v0.1.md
```

## Validation plan

Before commit:

1. parse all JSON evidence;
2. verify manifest SHA-256 entries;
3. verify the evidence directory contains exactly the eleven required files;
4. inspect `git diff --check`;
5. confirm changed paths are limited to the authorized contract, evidence
   snapshot, README, and decision log;
6. run `npm run verify`;
7. confirm the final worktree is clean after commit.

The resulting command status and commit SHA are recorded in the draft pull
request rather than modifying this immutable evidence after validation.

## Adversarial consistency audit

| Audit | Classification |
| --- | --- |
| Contract contradicts current D5 validation | NO_ISSUE |
| Free-form values become ontology authority | NO_ISSUE |
| `MEDICAL`, `HAIR_LOSS`, or tags become claim evidence | NO_ISSUE |
| Commerce facts become query-derived discovery facts | NO_ISSUE |
| Style replaces variant as option unit | NO_ISSUE |
| Candidate source bypasses admission | NO_ISSUE |
| Unknown/conflicting/violating enter asserted results | NO_ISSUE |
| Preference logic invented in D6 | NO_ISSUE |
| Ranking or relaxation silently authorized | NO_ISSUE |
| D6-A broadened in place | NO_ISSUE |
| Exact-plus-structured silently implemented | NO_ISSUE |
| D5-S1 or D6-B1 source authorized | NO_ISSUE |
| Production routes/adapters implied | NO_ISSUE |
| Event collection implied | NO_ISSUE |
| Evidence treated as normative | NO_ISSUE |
| Existing versioned contracts edited | NO_ISSUE |

No `BLOCKER` or `UNRESOLVED` audit result remains.
