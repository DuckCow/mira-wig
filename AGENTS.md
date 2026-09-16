# Mira

## Authority and scope

- Use the designated canonical product lineage as the default mutation base. Historical, dirty, review and deployment worktrees are reference-only unless explicitly authorized; authorized uncommitted work may continue. Preserve unrelated user changes.
- Source, schema, migrations, runtime configuration, tests and observed durable state describe installed reality. Explicit human instructions and applicable contracts define normative authority. Report conflicts; do not silently reconcile them.
- Reviews, diagnoses, plans and tests do not authorize mutation. Git index/ref changes or publication, deployment/live activation, provider contact, credential use, permission changes, destructive operations and durable-state effects require explicit authority for the target, effect, scope and limit. Session/model changes do not reset consumed authority or prior effects.
- Make the smallest sufficient correction within scope. Do not generalize incident machinery without demonstrated need. Continue authorized local corrections; stop the affected path for unresolved authority or a new structural defect, without expanding into adjacent redesign.
- Preserve frozen migrations, evidence, execution identities and correctness unless explicitly authorized. Never weaken gates, security contracts or historical digests to pass tests.

## Scoped references

Read only the applicable contracts; their substantive guarantees remain binding.

- Next.js changes: installed guides in `node_modules/next/dist/docs/`.
- Financial/security/privacy, schema/durable state, concurrency/idempotency, external effects/jobs or production activation: `docs/engineering/mira-backend-high-risk-governance-v0.1.md`.
- Payment: current task and provider contracts in `docs/payment_policy/`; logic owner: `src/lib/payment/`.
- Discovery/search/recommendation: `docs/discovery/README.md` and `docs/discovery/catalog-evidence-status-v0.2.md`.
- Governance changes: `docs/engineering/ai-engineering-governance-v0.1.md`.
- New documentation: `docs/engineering/feature-documentation-standard-v0.2.md`.

## Repository constraints

- Schema changes use migrations; `prisma/schema.prisma` and `prisma/migrations/` define the data model. STRICT rules live in `eslint.config.mjs`.
- Preserve historical checkout/order/payment snapshots. Amounts are nonnegative integer minor units; do not multiply KRW/JPY by 100.
- Store S3 keys, not URLs; access private objects through short-lived presigned URLs. Preserve face/fit-photo consent, access and retention boundaries.
- Use existing provider abstractions. `catalogStorage` follows provider configuration; `fittingStorage` retains its installed mock boundary.

## Verification

- Verify proportionally, starting with affected behavior. `npm run verify` is the normal completion check for source/runtime changes. Repeat valid checks only when changes, failures or unresolved concerns warrant it. Documentation-only changes need content/reference/diff checks and any applicable validator.
- PostgreSQL tests run serially in the database project in `vitest.config.ts`; name them `*.integration.test.ts` or register them there. Before `npm run test:setup`, confirm both the local database creation target and the `.env.test` migration target are authorized test databases.
- Report actual checks, failures and limitations. Mock/preview output does not prove durable success.
