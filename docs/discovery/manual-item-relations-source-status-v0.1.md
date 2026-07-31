# Manual Item Relations Source Status v0.1

## Status

```text
DESIGN AUTHORITY:
  manual-item-relations-contract-v0.1.md
PARENT AUTHORITY:
  item-to-item-rollout-contract-v0.2.md
SOURCE IMPLEMENTATION:
  COMPLETE
SOURCE REVIEW:
  COMPLETE
MAIN MERGE:
  05be8faa3d79670102da431f14c9a3579e82bacb
CUSTOMER ACTIVATION:
  OFF
PRODUCTION RELATION DATA:
  NONE / NOT SEEDED
AUTOMATIC ITEM-TO-ITEM:
  NOT IMPLEMENTED
D5/D6 PRODUCTION INTEGRATION:
  NOT IMPLEMENTED
EVENTS / RERANKING / PERSONALIZATION:
  NOT IMPLEMENTED
CHANGE CONTROL:
  supersedes: none | superseded-by: none
```

## 1. Document role and non-authority

This document records the reviewed source truth installed by M2M-S1. It is not
a new design contract and grants no customer or production activation.

- The [design contract](./manual-item-relations-contract-v0.1.md) records the
  pre-implementation semantics, boundaries, and authorization state.
- This source-status/as-built record describes the source that was actually
  installed and the invariants reviewed after implementation.
- The [operations runbook](../operations/manual-item-relations-operations-v0.1.md)
  describes operator preparation, diagnostics, and rollback.
- A future activation record must separately authorize and identify any
  customer exposure.

The frozen design contract remains historical and unchanged. Source completion
does not retroactively change its pre-implementation status block.

## 2. Reviewed source chain

The reviewed implementation chain is:

```text
09cb9198bd86f006b00b7e3a54afc230d20c6897
  feat(catalog): add manual item relations
01ac9c4653348f56370a4e8a23a2eda8d758120e
  fix(catalog): close manual relation activation bypass
d938e333d022d4593f66a9e096ec38cfdd3745c0
  fix(catalog): validate manual relation active state
05be8faa3d79670102da431f14c9a3579e82bacb
  Merge pull request #19 from DuckCow/feat/manual-item-relations-v0.1
```

[PR #19](https://github.com/DuckCow/mira-wig/pull/19) binds the review
conversation and CI evidence. It is not the sole durable authority; the merge
commit, this record, the schema and migration, source, and tests remain the
repository evidence.

The merge has first parent
`0cece28f7915149f4e5888e0582e95c9fa932c3f` and second parent, the reviewed C2
head, `d938e333d022d4593f66a9e096ec38cfdd3745c0`.

## 3. Installed capabilities

M2M-S1 installed only:

- directional canonical `WigStyle -> WigStyle` persistence;
- explicit market scope on every relation;
- exactly `SIMILAR_STYLE` and `COMPARE_WITH`;
- one row per source/target/market tuple, independent of purpose;
- inactive draft creation;
- editing of purpose, priority, and internal rationale;
- active/inactive transitions without hard deletion;
- creation and last-update actor snapshots derived from the authenticated
  administrator session;
- KR-first administrator curation, target choices, and target diagnostics;
- purpose-grouped public reads;
- exact canonical target-style PDP links; and
- purpose-specific, default-off customer gates.

It installed no relation seed data and enabled neither customer gate.

## 4. Source map

### Persistence and migration

- `prisma/schema.prisma` owns the Prisma enum, relation model, relations,
  uniqueness declaration, and indexes.
- `prisma/migrations/20260731120000_add_manual_item_relations/migration.sql`
  owns the PostgreSQL enum and table, foreign keys, tuple uniqueness, priority
  bounds, source/target distinction, the narrow active-rationale check, and
  indexes.

### Service and read model

- `src/lib/manual-item-relations/types.ts` owns the two-purpose vocabulary,
  error vocabulary, administrator carriers, diagnostics, and customer-safe
  result shapes.
- `src/lib/manual-item-relations/validation.ts` owns exact purpose, priority,
  active-state, rationale normalization, rationale code-point bounds, and
  locale-independent UTF-16 ordering.
- `src/lib/manual-item-relations/admin.ts` owns creation, bounded edits,
  transitions, activation eligibility, actor snapshots, administrator lists,
  and target diagnostics.
- `src/lib/manual-item-relations/activation.ts` owns market-aware,
  purpose-specific exact activation parsing.
- `src/lib/manual-item-relations/public.ts` owns the gated customer read,
  source and target eligibility, safe public shape, grouping, ordering,
  de-duplication, and per-purpose cap.

### Actions and UI

- `src/app/actions/admin/manual-item-relations.ts` authenticates the admin,
  whitelists mutable fields, delegates to the service, maps bounded errors,
  and revalidates normalized persisted source paths.
- `src/app/admin/styles/[id]/ManualItemRelationsSection.tsx` provides the
  KR-first inactive-draft, editing, transition, and diagnostic surface.
- `src/app/admin/styles/[id]/page.tsx` loads and mounts that admin surface.
- `src/app/(shop)/styles/[id]/RelatedStylesSection.tsx` loads the gated safe
  read, fails closed on invalid activation configuration, hides empty groups,
  and renders exact target-style cards.
- `src/app/(shop)/styles/[id]/page.tsx` places the related-style module after
  the main product and variant decision area.
- `src/lib/admin-messages.ts` owns administrator-facing error copy.
- `.env.example` documents both dormant keys without setting live values.

### Test evidence by layer

- Validation and activation:
  `src/lib/manual-item-relations/__tests__/validation.test.ts` and
  `activation.test.ts`.
- Real PostgreSQL schema, administrator lifecycle, and public read:
  `schema.integration.test.ts`, `admin.integration.test.ts`, and
  `public.integration.test.ts` under
  `src/lib/manual-item-relations/__tests__/`.
- Authenticated action boundary:
  `src/app/actions/__tests__/admin-manual-item-relations.test.ts`.
- Administrator and customer rendering:
  `src/app/admin/styles/[id]/manual-item-relations-section.test.ts` and
  `src/app/(shop)/styles/[id]/related-styles-section.test.ts`.
- Central administrator messages: `src/lib/admin-messages.test.ts`.

### Global migration-packaging compatibility

The following paths changed only to update migration inventory, count, and hash
authority for the thirtieth committed migration:

- `infra/refund-sandbox/p3e-b2/contracts/runtime-image-connection-v1.json`;
- `scripts/build-refund-worker-bundles.mts`;
- `src/lib/payment/refund/__tests__/refund-p3e-b2-runtime-image-policy.test.ts`;
- `src/lib/payment/refund/__tests__/worker-migration-filesystem.test.ts`; and
- `src/lib/payment/refund/__tests__/worker-migration-readiness.integration.test.ts`.

Those mechanical compatibility changes do not alter refund or payment runtime
semantics.

## 5. Invariant ownership

| Invariant | Database | Service/runtime | Action/UI | Public read | Test evidence |
| --- | --- | --- | --- | --- | --- |
| Source differs from target | `CHECK` plus FKs | Rejects before write | Bounded error | Excludes self defensively | Schema, admin |
| Priority is integer `0..10000` | Lower/upper `CHECK` | Safe-integer and bounds validation | Number input and bounded error | Orders ascending | Validation, schema, admin |
| Directed tuple uniqueness | Unique source/target/market index | Pre-check plus duplicate-race mapping | Duplicate error | One persisted row; defensive target de-duplication | Schema, admin |
| FK integrity | Source, target, and market FKs with restricted delete | Reference existence checks | Bounded not-found errors | Relational query | Schema, admin |
| Active relation has nonblank rationale | Narrow PostgreSQL `btrim` check | Unicode-normalizes and requires a non-null result for activation/active edits | Rationale editing and errors | Rationale is not selected | Schema, validation, admin |
| Unicode rationale normalization and 500-code-point limit | `VARCHAR(500)` is not the Unicode rule | ECMAScript trim, control-character rejection, and code-point count | Input and bounded errors | Not exposed | Validation, admin |
| Exact purpose vocabulary | PostgreSQL/Prisma enum | Exact runtime validation | Two choices only | Purpose-specific groups | Validation, schema, UI, public |
| Actor identity comes from authenticated session | Actor snapshots are stored without `User` FKs | Receives only the trusted actor value | `requireAdmin` runs first and client actor fields are ignored | Actor IDs are absent | Action, admin |
| Source and target are globally active and exact-market published | Relational integrity only | Activation validates both | Target diagnostics; source failures are visible | Source hides all; invalid targets are omitted | Admin and public integration |
| Same active target variant has exact-market price | Relational integrity only | Activation uses one same-variant witness | Target diagnostics | Customer query uses the same witness | Admin and public integration |
| Stock is excluded from stylistic truth | No stock relation check | Stock is not read for relation eligibility | No stock claim | Stock-zero eligible target can appear | Admin and public integration |
| Public result excludes rationale and actor IDs | Storage retains admin fields | Public select and result type omit them | Rationale remains admin-only | Safe shape only | Public integration and UI |
| Customer activation is default-off per purpose | No database activation authority | Blank/unset off; exact `ENABLED` only | Invalid config fails closed | No enabled purpose means no relation query | Activation, public, PDP |
| KR keys cannot activate non-KR | No database activation authority | Non-KR returns no enabled purposes before reading KR values | No non-KR switch | Non-KR public result is empty | Activation and public integration |
| Active-state transition requires exact runtime boolean | Boolean column | Rejects non-boolean values before relation read/write/transaction | Raw input passes without coercion | Not applicable | Validation, admin, action |
| Customer link lands on exact target style | Target FK stores canonical style ID | Safe result preserves target ID | Card receives that exact ID | `/styles/{targetStyleId}` | PDP rendering |

PostgreSQL does not own ECMAScript Unicode trimming, control-character
validation, or the 500-code-point rule. Those are application-owned.

## 6. Review corrections

### C1

C1 removed direct purpose-list activation injection, forced all public reads
through market-aware exact activation parsing, preserved non-KR off even when
KR configuration is injected, and used the normalized persisted source
identity for cache revalidation.

### C2

C2 required exact runtime `true` or `false` for active-state transitions.
Strings, numbers, nullish values, objects, and arrays are rejected before any
relation read, write, transaction, or cache revalidation.

## 7. Historical test evidence

This is historical evidence at the reviewed source and merge on 2026-07-31,
not a promise about permanent future repository totals.

- focused M2M validation, activation, service, action, and UI tests passed;
- real PostgreSQL schema, admin-lifecycle, and public-read integration passed;
- activation, action, and exact-landing rendering tests passed;
- the discovery regression suite passed;
- `prisma validate` and `prisma generate` passed;
- typecheck, lint, and the full repository verify passed at the reviewed C2
  head;
- GitHub CI run 249 completed successfully for the reviewed C2 head; and
- GitHub push CI run
  [30594313415](https://github.com/DuckCow/mira-wig/actions/runs/30594313415)
  completed successfully on the exact merge SHA
  `05be8faa3d79670102da431f14c9a3579e82bacb`.

The reviewed C2 PR evidence reports 203 test files and 5,050 tests passing for
the full verify, 19 files and 255 tests for discovery regressions, and three
files and 24 tests for the real PostgreSQL M2M set. These counts are historical
at `d938e333d022d4593f66a9e096ec38cfdd3745c0`.

## 8. Known limitations and deferred extensions

- Customer gates are blank and default-off.
- No production relation data is seeded.
- The administrator UI is KR-first.
- Only two purposes exist.
- There is no hard delete, expiry, version, or explicit `PIN`, `BLOCK`, or
  `PREFER` model.
- There are no automatic content or image candidates.
- There are no events, exposure accounting, behavior reranking, or
  personalization.
- There is no D5 or D6 production integration.
- The relations make no commercial-alternative or construction-equivalence
  claim.
- There is no production activation evidence.

These are intentional current boundaries or deferred extensions, not
automatically defects.

## 9. Re-entry gates

- **Customer activation:** requires real launch styles, independently reviewed
  relations, exact publication/price/landing evidence, approved customer copy,
  staging-equivalent review, a named rollback owner, and a separate dated
  activation record under the parent contract.
- **Content-based automation:** requires representative real styles, governed
  stylistic attributes with sufficient coverage, judged pairs, a versioned
  candidate source, and enforcement of the parent admission rules.
- **Image candidates:** additionally require image roles, rights, ownership,
  product/model/background confound controls, device review, and judged image
  pairs.
- **Behavior reranking:** requires reliable exposure records and positions,
  candidate-set accountability, purpose-specific support, deterministic
  control, privacy approval, evaluation, and rollback.
- **Personalization:** requires sufficient repeat usage, privacy and retention
  governance, approved identity linkage, evaluation support, and tests that
  important alternatives are not hidden.

No fixed catalog count or existence of this source-status record opens one of
these gates.
