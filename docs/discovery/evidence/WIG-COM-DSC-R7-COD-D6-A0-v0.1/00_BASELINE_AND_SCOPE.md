# D6-A0 Baseline and Scope

```text
EVIDENCE ID:               WIG-COM-DSC-R7-COD-D6-A0-v0.1
OBSERVED DATE:             2026-07-30
OBSERVED MAIN:             2cbdfe3af7e333c28da66ebb588984a4428089ec
TASK CLASSIFICATION:       SOURCE_ONLY DOCUMENTATION + READ-ONLY REPOSITORY RECONNAISSANCE
DATABASE ACCESS:           NOT PERFORMED
SOURCE IMPLEMENTATION:     NOT AUTHORIZED
PRODUCTION ACTIVATION:     NOT AUTHORIZED
```

## Scope

This immutable snapshot records repository-source evidence for the first D6
exact-SKU source-only vertical slice. It distinguishes:

- **descriptive current behavior**, which is observed in schema, source, and
  tests at the main SHA above; and
- **normative desired behavior**, which is installed separately by
  `docs/discovery/d6-exact-vertical-slice-contract-v0.1.md`.

Current source and schema were treated as descriptive authority. Frozen
discovery contracts were treated as normative authority within their declared
scope.

## Baseline gate

- `main` and `origin/main` both resolved to the observed SHA.
- Worktree, index, and untracked inventory were clean.
- `git diff --check` passed.
- No database was queried.
- The B0 observed database population remains historical evidence; its counts
  were not refreshed or presented as current facts.

## Source-continuity check

The following comparison returned no changed paths:

```text
a963af6aea6c01c1ac4d2041d6140e664418f78b..2cbdfe3af7e333c28da66ebb588984a4428089ec
```

Scope:

```text
prisma/schema.prisma
src/lib/catalog.ts
src/lib/catalog.types.ts
src/components/features/StyleCard.tsx
src/app/(shop)/styles/**
src/lib/cart.ts
src/app/actions/cart.ts
src/lib/payment/session/create.ts
src/lib/fitting/db.ts
src/lib/catalog-admin/market-price.ts
src/lib/market/**
```

This verifies source continuity for those paths only. It does not refresh the
B0 database snapshot.

## Decision adjudication

| Decision | Disposition | Repository-source result |
| --- | --- | --- |
| D6A0-01 variant result unit | `CONFIRMED` | Unique variant SKU and required variant-to-style parent relation are present. |
| D6A0-02 one exact SKU constraint | `CONFIRMED` | D5 exact identity semantics exist; representative structured evidence and production lexicon do not. |
| D6A0-03 injected fixture source | `CONFIRMED` | Demo/B0 data is not production truth and no production retrieval adapter is authorized. |
| D6A0-04 injected eligibility summary | `CONFIRMED` | Eligibility checks are distributed and no consolidated owner-approved summary exists. |
| D6A0-05 one admission choke point | `CONFIRMED` | Required by the frozen discovery foundation contract. |
| D6A0-06 selected-variant price | `CONFIRMED` | Exact option price is variant-market price; listing price is a style minimum. |
| D6A0-07 exact landing mismatch failure | `CONFIRMED` | Current route has no inbound variant state; canonical parent is available for proof and rejection. |
| D6A0-08 no cart call or repair | `CONFIRMED` | Cart stores independent style/variant IDs and does not enforce their coherence. |
| D6A0-09 default-off event seam | `CONFIRMED` | Event collection is gated; first-emission vocabulary remains provisional. |
| D6A0-10 structured retrieval deferred | `CONFIRMED` | Free-form current attributes have unknown authority. |
| D6A0-11 route/UI deferred | `CONFIRMED` | Pure source identity and landing proof do not require runtime wiring. |
| D6A0-12 additive retrieval subtree | `REFINED` | D5 permits additive modules, but exact names remain provisional and A1 must explicitly update the current five-file boundary test. |

No decision was `REJECTED` or `UNRESOLVED`; no material stop condition was
found.

## Immutability

After merge, this directory is an immutable evidence snapshot. Corrections or
new observations require a new evidence ID and directory; these files are not
edited in place.
