# Baseline and scope

## Evidence status

```text
EVIDENCE TYPE:          IMMUTABLE DESCRIPTIVE REPOSITORY SNAPSHOT
SNAPSHOT ID:            WIG-COM-DSC-R11-COD-D6-B0-v0.1
OBSERVED COMMIT:        85d0b49b5e3eec3af6a604caaf3580c07d76a281
OBSERVED BRANCH:        main
OBSERVED DATE:          2026-07-30
TASK CLASSIFICATION:    SOURCE_ONLY DOCUMENTATION + READ_ONLY REPOSITORY EVIDENCE
TASK AUTHORIZATION:     D6-B0 RECONNAISSANCE AND CONTRACT ONLY
```

Before reconnaissance, local `main`, `origin/main`, and `HEAD` all resolved to
the observed commit and `git status --short --untracked-files=all` was empty.
The commit is merge commit `85d0b49b…`, containing reviewed PR #8 head
`f7e1f778…`.

## Scope

Read-only inspection covered:

- `prisma/schema.prisma`, committed migrations, and `prisma/seed.ts`;
- storefront and admin catalog readers and their callers;
- style/variant, fitting, wishlist, cart, checkout, payment-session, order,
  market-publication, and price boundaries;
- D5 production source, tests, and normative source-vocabulary contract;
- D6-A production source, tests, exact-slice contract, and normative
  source-vocabulary contract;
- current discovery foundation, hardness, evidence, testing, README, and
  decision-log authorities.

No database was queried. The older R3 catalog census remains historical
evidence and was not promoted to current population evidence because its
currentness rule is invalidated by a later repository HEAD
(`docs/discovery/catalog-evidence-status-v0.2.md:20-40`).

## Descriptive versus normative authority

Files `01` through `10` in this directory are descriptive evidence bound to
the observed commit. They do not authorize source or production behavior.
Normative D6-B boundaries are installed only by
`docs/discovery/d6-structured-retrieval-contract-v0.1.md`.

## Excluded actions

No source, test, schema, migration, seed, database row, route, UI, adapter,
event, catalog, cart, checkout, payment, fitting, rendering, or manufacturing
behavior was changed. D5-S1 and D6-B source implementation were not performed.
