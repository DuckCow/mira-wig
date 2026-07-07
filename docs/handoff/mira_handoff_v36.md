# mira project handoff v36 - whole-project current snapshot

**New session role note:** continue the mira project with the human as orchestration/final decisions/commits and Codex as recon/implementation/runtime checks. **v36 is the current whole-project handoff and supersedes v35 for session startup context.** v35 remains the detailed payment-track C2 provider-confirm detector implementation snapshot; do not use v36 as a replacement for that fine-grained payment evidence.

**Why v36 exists:** v35 is useful but payment-track heavy. This handoff restores whole-project anchors from current repo inspection and carries the v35 payment state forward in summary form.

**SSOT map:**
- Code facts -> current source and tests under `src/`, `scripts/`, `prisma/`.
- Data model -> `prisma/schema.prisma` + `prisma/migrations/`.
- Code rules -> `AGENTS.md` v4.
- Collaboration loop -> `docs/collaboration-protocol.md` v3.
- Payment policy/design -> latest files under `docs/payment_policy/`, especially `payment_policy_confirmed_v6.md`, `payment_policy_open_v6.md`, and the D1/C2 design locks.
- Payment implementation snapshot -> `docs/handoff/mira_handoff_v35.md`.
- Handoff line -> **v36 is current**, v35 is the payment detector implementation snapshot, v34 is the C2 provider confirm detector design lock, v33 is provider confirm bridge/action taxonomy implementation.

---

## 1. Project-wide baseline

- App: Next.js 16 App Router, React 19, TypeScript strict.
- Styling: Tailwind v4 via `src/app/globals.css`.
- DB: PostgreSQL via Prisma 7 and `@prisma/adapter-pg`.
- Auth: NextAuth + Prisma adapter + Google OAuth, JWT session strategy by project rule.
- Storage: catalog storage switches mock/S3 by `STORAGE_PROVIDER`; fitting storage is always mock.
- AI fitting: provider abstraction exists; current provider is mock unless later changed.
- Payment: new payment core is under active rebuild; see payment summary below.
- Verify baseline from committed v35 payment implementation: **28 files / 407 tests**.
- Last full verify evidence: `npm run verify` passed after commit `ce65fc6`; typecheck passed, lint had 0 errors and existing `<img>` warnings only, tests passed `28 files / 407 tests`.
- v36 drafting is docs-only; no fresh verify was required or run for this handoff unless a later report says otherwise.

Primary scripts from `package.json`:

```text
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test
npm run test:setup
npm run verify
npm run make-admin
npm run payment:reconcile
```

Repo docs caveat:

- `README.md` is still the default create-next-app README and is not a useful product/status source.
- `docs/go-live-checklist.md` is stale relative to the current post-cutover payment rebuild. It describes an older "code live-ready" payment state and must be treated as historical until rewritten against the current payment core.

---

## 2. Domain inventory

### Auth / session

- Purpose: Google OAuth login, role-aware sessions, ADMIN guard.
- Key paths:
  - `src/lib/auth.ts`
  - `src/lib/session.ts`
  - `src/lib/admin.ts`
  - `src/lib/admin-role.ts`
  - `src/app/(auth)/login/page.tsx`
  - `src/app/api/auth/[...nextauth]/route.ts`
- Current status: present and used by shop, admin, cart, checkout, fitting, and payment actions.
- Tests: `src/lib/__tests__/admin.test.ts`.
- Open risks/deferred work: production env values (`NEXTAUTH_URL`, `NEXTAUTH_SECRET`, Google credentials) remain deployment concerns; do not inspect real `.env`.

### Market / internationalization anchor

- Purpose: resolve current market from cookie/geo headers; provide market config and formatting.
- Key paths:
  - `src/lib/market/index.ts`
  - `src/lib/market/resolve.ts`
  - `src/lib/market/types.ts`
  - `src/app/actions/market.ts`
  - `src/components/features/MarketSelector.tsx`
- Current status: active for KR/US/JP, with currency metadata and market-aware catalog/checkout paths.
- Tests: `src/lib/market/__tests__/market.test.ts`.
- Open risks/deferred work: tax/customs/legal/localization decisions remain open in payment policy, especially US landed cost/sales tax and JP legal display/3DS context.

### Catalog / product browsing

- Purpose: browse wig styles and variants with market-specific availability and prices.
- Key paths:
  - `src/lib/catalog.ts`
  - `src/lib/catalog.types.ts`
  - `src/app/(shop)/styles/page.tsx`
  - `src/app/(shop)/styles/[id]/page.tsx`
  - `src/components/features/StyleCard.tsx`
- Current status: active. Style list/detail pages query only active styles/variants and market availability; prices come from `VariantMarketPrice.amount`.
- Tests: covered indirectly through catalog-admin/market tests; no dedicated public catalog test file found.
- Open risks/deferred work: `src/app/page.tsx` is still a default Next starter page, so the public home page is not product-ready.

### Admin catalog / market price operations

- Purpose: manage wig styles, variants, stock, cover uploads, market prices, market availability, and price gaps.
- Key paths:
  - `src/app/admin/styles/page.tsx`
  - `src/app/admin/styles/[id]/page.tsx`
  - `src/app/admin/gaps/page.tsx`
  - `src/app/actions/admin/catalog.ts`
  - `src/app/actions/admin/market-price.ts`
  - `src/lib/catalog-admin/`
  - `src/lib/admin-catalog-data.ts`
- Current status: active. Admin actions require ADMIN and delegate to lib modules. Market price gap diagnosis is read-only.
- Tests:
  - `src/app/actions/__tests__/admin-catalog.test.ts`
  - `src/app/actions/__tests__/admin-market-price.test.ts`
  - `src/lib/catalog-admin/__tests__/catalog-admin.test.ts`
  - `src/lib/catalog-admin/__tests__/market-price.test.ts`
- Open risks/deferred work: admin order/refund screens are stubs pending new payment/order read models.

### Storage

- Purpose: abstract catalog image storage and fitting upload/result storage.
- Key paths:
  - `src/lib/storage/index.ts`
  - `src/lib/storage/mock.ts`
  - `src/lib/storage/s3.ts`
  - `src/app/api/mock-storage/route.ts`
- Current status: active abstraction. `catalogStorage` uses mock only when `STORAGE_PROVIDER=mock`; otherwise S3. `fittingStorage` is always mock.
- Tests: `src/lib/storage/__tests__/providers.test.ts`.
- Open risks/deferred work: production S3 credentials/bucket and private object policy remain deployment concerns; fitting storage must be revisited before real VTO/face-photo persistence.

### AI fitting

- Purpose: upload a face image, start a fitting job for a variant, poll result, and show fitting result page.
- Key paths:
  - `src/lib/ai/`
  - `src/lib/fitting/`
  - `src/app/actions/fitting.ts`
  - `src/app/fitting/[id]/page.tsx`
  - `src/components/features/FittingModal.tsx`
- Current status: scaffolded and tested with mock provider/storage. Source/result image keys are validated as storage keys, not URLs.
- Tests:
  - `src/lib/fitting/__tests__/fitting.test.ts`
  - `src/app/actions/__tests__/fitting.test.ts`
- Open risks/deferred work: real external VTO provider integration, privacy/retention policy, real fitting storage, and runtime upload verification remain future work.

### Cart

- Purpose: authenticated cart add/update/remove with stock checks.
- Key paths:
  - `src/lib/cart.ts`
  - `src/app/actions/cart.ts`
  - `src/app/(shop)/cart/page.tsx`
  - `src/app/(shop)/cart/CartItemActions.tsx`
- Current status: active. Business logic lives in `src/lib/cart.ts`; actions are thin session/revalidate wrappers.
- Tests: no dedicated cart test file found in current test layout.
- Open risks/deferred work: cart still reads `WigVariant.price` for item price display, while catalog/checkout policy uses market prices. This may be legacy-compatible behavior and should be rechecked before production cart pricing.

### Checkout session

- Purpose: create immutable checkout sessions from cart snapshot plus shipping input.
- Key paths:
  - `src/lib/payment/session/`
  - `src/app/actions/checkout.ts`
  - `src/app/(shop)/checkout/page.tsx`
  - `src/app/(shop)/checkout/CheckoutForm.tsx`
- Current status: backend session lifecycle exists and is tested, but the visible checkout page is currently a cutover stub saying payment core is in progress.
- Tests: `src/lib/payment/session/__tests__/session.integration.test.ts`.
- Open risks/deferred work: reconnect checkout UI to session creation/payment initiation after the next accepted payment UI/server-action step.

### Orders / manufacturing

- Purpose: post-payment Order, OrderItem, OrderShipping, and ManufacturingRequest models exist in the new schema.
- Key paths:
  - `prisma/schema.prisma`
  - `src/lib/payment/complete/`
  - `src/lib/order/`
  - `src/app/(shop)/orders/page.tsx`
  - `src/app/(shop)/orders/[id]/page.tsx`
  - `src/app/admin/orders/page.tsx`
- Current status: schema and payment completion logic exist; customer orders and admin orders pages are currently cutover stubs. `src/lib/order/` contains validation/snapshot helpers.
- Tests:
  - `src/lib/payment/complete/__tests__/complete.integration.test.ts`
  - `src/lib/order/__tests__/validation.test.ts`
- Open risks/deferred work: rebuild order/customer/admin read models, refund UI, manufacturing workflow UI, and MR state transitions beyond initial creation.

### Payment core

- Purpose: new checkout/payment/order completion core with provider abstraction, outbox, webhook, void, reconciliation, and Toss-specific scaffolds.
- Key paths:
  - `src/lib/payment/`
  - `src/app/actions/payment.ts`
  - `src/app/api/payments/toss/success/route.ts`
  - `src/app/api/payments/toss/webhook/route.ts`
  - `src/app/api/payments/paypal/webhook/route.ts`
  - `scripts/payment-reconcile.ts`
  - `scripts/outbox-dispatch.ts`
- Current status: active rebuild, not live-enabled. Detailed current state is summarized in §3 and fully recorded in v35.
- Tests: most current tests are payment-track tests under `src/lib/payment/**/__tests__` plus action/route tests.
- Open risks/deferred work: real provider wiring, launch guards, real webhook verification/parsing, provider credentials/env, live readiness, retention/PII policy, and order/admin UI reconnection.

### Reconciliation / operations

- Purpose: report-only C2 findings for payment/order/session/event/outbox/provider-confirm anomalies.
- Key paths:
  - `src/lib/payment/reconciliation/`
  - `scripts/payment-reconcile.ts`
- Current status: report-only and read-only. Provider-confirm detector from v35 is complete.
- Tests:
  - `src/lib/payment/reconciliation/__tests__/reconcile.integration.test.ts`
  - `src/lib/payment/reconciliation/__tests__/report-wrapper.test.ts`
- Open risks/deferred work: retention policies, operational runbooks, and any future repair behavior require separate design locks.

### UI components

- Purpose: shared feature and primitive UI components.
- Key paths:
  - `src/components/features/`
  - `src/components/ui/`
- Current status: used across shop/admin/auth. Existing lint warnings are `<img>` usage in fitting UI only.
- Tests: no dedicated component tests found.
- Open risks/deferred work: product landing/home experience is not implemented; several pages are utilitarian/scaffolded.

---

## 3. Payment track summary from v35

v35 remains the detailed payment C2 provider-confirm detector snapshot. Current summary:

- D1-A provider selection contract is complete.
- D1-B provider adapter contract types are complete.
- ProviderRef persistence is complete.
- Confirm idempotency persistence is complete.
- Toss callback/orderId fake-flow scaffold is complete.
- Toss confirm mapper/contract is complete.
- Toss confirm fake HTTP adapter seam is complete.
- Provider confirm bridge/action taxonomy is complete.
- C2 provider-confirm detector is complete.
- `resolveProvider` still returns mock providers.
- Real Toss adapter wiring is blocked.
- Real PayPal adapter wiring is blocked.
- Toss success route persists providerRef only and does not complete local orders/payments.
- C2 reconciliation remains report-only.
- No live provider credentials or env reads should be added without a new explicit prompt and design lock.

Payment design anchors:

- `docs/payment_policy/payment_policy_confirmed_v6.md`
- `docs/payment_policy/payment_policy_open_v6.md`
- `docs/payment_policy/d1b_adapter_boundary_design_v1.md`
- `docs/payment_policy/d1b_provider_ref_persistence_decision_v1.md`
- `docs/payment_policy/d1b_confirm_idempotency_decision_v1.md`
- `docs/payment_policy/d1b_provider_confirm_capture_mapping_v1.md`
- `docs/payment_policy/d1b_toss_callback_orderid_decision_v1.md`
- `docs/payment_policy/d1b_toss_confirm_adapter_design_v1.md`
- `docs/payment_policy/d1b_provider_confirm_result_bridge_design_v1.md`
- `docs/payment_policy/c2_provider_confirm_detector_design_v1.md`

Do not repeat v35 details here; inspect v35 and source/tests when doing payment work.

---

## 4. Schema / migration anchors

Current schema domains:

- Auth: `User`, `Account`, `Session`, `VerificationToken`, `UserRole`.
- Market/catalog: `Market`, `VariantMarketPrice`, `WigStyleMarket`, `WigStyle`, `WigVariant`, wig enums.
- Fitting: `Fitting`, `FittingStatus`.
- Cart/wishlist: `CartItem`, `WishlistItem`.
- Payment/order core: `CheckoutSession`, `CheckoutSessionLine`, `CheckoutSessionShipping`, `Payment`, `Order`, `OrderItem`, `OrderShipping`, `ManufacturingRequest`, `PaymentOutbox`, `PaymentEvent`, `WebhookIngressRejection`, related enums.
- Reviews: `Review`.

Migration line includes:

- Initial app/catalog/market/fitting migrations from June 2026.
- Legacy payment/order drop migration: `20260705204105_cutover_drop_legacy_payment_order`.
- New payment core v0: `20260705214229_a2_payment_core_v0`.
- Outbox addendum: `20260705221004_a2_addendum_outbox_updated_at`.
- Webhook ingress contract: `20260706130000_c2_i1_webhook_ingress_contract`.
- D1-B providerRef: `20260707090000_d1b_provider_ref`.
- D1-B confirm idempotency key: `20260707110000_d1b_confirm_idempotency_key`.

No schema or migration change is part of v36.

---

## 5. Operational scripts / commands

Read-only/reporting:

- `npm run verify` -> typecheck + lint + tests.
- `npm run payment:reconcile` -> runs `scripts/payment-reconcile.ts`; report-only C2 JSON output. Supports `--stale-provider-confirm-ms`.

DB-mutating operational scripts:

- `npm run test:setup` -> creates test DB if needed and deploys migrations to `.env.test` database.
- `npm run make-admin -- <email>` -> promotes an existing OAuth-created user to ADMIN.
- `scripts/outbox-dispatch.ts` -> dispatches payment outbox jobs, currently with `pg.void` handler registry.
- `prisma/seed.ts` -> seeds markets/catalog sample data using `DATABASE_URL`.

Development:

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run typecheck`
- `npm run test`

Do not inspect or print real `.env` secrets. `.env.example` is safe reference only and contains placeholder values.

---

## 6. Tests layout

Current test layout includes:

- app actions: admin catalog, admin market price, fitting, payment.
- payment route: Toss success route.
- admin/lib: admin role guard.
- catalog-admin: catalog admin and market price.
- fitting: fitting orchestration.
- market: market resolution/formatting.
- order: validation.
- storage: provider behavior.
- payment: concurrency, attempt initiate, completion, outbox, provider contracts/routing/fake adapters, Toss callback/orderId/confirm/adapter, reconciliation, session, void, webhook.

Known baseline:

```text
28 files / 407 tests
```

This baseline is from the post-v35 full verify run. v36 itself is docs-only and did not change the test count.

---

## 7. Current blockers / deferred items

Payment blockers carried from v35:

- Real Toss adapter wiring remains blocked.
- Real PayPal adapter wiring remains blocked.
- Real provider credential/env wiring remains blocked.
- Provider resolver still returns mock providers.
- Toss success route remains non-completing.
- Webhook verifier/parser remains mock-oriented for current D-stage.
- Real void taxonomy and broader refund policy remain unresolved.
- `VOID-HOOK-DEBT` remains unresolved.
- No live enablement.

Policy/open blockers:

- `payment_policy_open_v6.md` keeps launch-critical/open items around delayed-completion paths, PII/retention, refund/cancel state machine, tax/customs, PG selection/contract details, disputes/chargebacks, and jurisdiction-specific custom-order withdrawal rules.
- `docs/go-live-checklist.md` is stale and should not be used as current live readiness evidence.

Non-payment blockers/gaps found from current repo:

- Public home page is still the default create-next-app starter.
- README is still default create-next-app text.
- Checkout page is a cutover/payment-core-in-progress stub.
- Customer order list/detail pages are stubs.
- Admin order management page is a cutover stub.
- Cart price display still uses `WigVariant.price`; market-price correctness should be reviewed before production.
- Real AI/VTO provider integration is not wired.
- Fitting storage remains mock-only by design.
- Production storage/Auth/env/deployment runbooks are not current.
- Component/UI runtime coverage is thin; many tests focus on lib/actions/payment.

---

## 8. Recommended next work

If continuing payment:

- Create the next explicit design lock before real provider wiring.
- Likely options: D1-B/C2 launch guard, real Toss adapter wiring design, real webhook verification/parser design, or provider resolver/live enablement design.
- Do not wire real Toss/PayPal or read credentials until the design lock says exactly how.

If broadening beyond payment:

- Refresh product-facing app shell: replace default `src/app/page.tsx` and README with current Mira product context.
- Reconnect checkout/customer orders/admin orders after the next payment UI/action boundary is accepted.
- Do a cart pricing recon to decide whether `WigVariant.price` should remain as legacy fallback or be replaced by market-price-derived views.
- Do a fitting/storage privacy recon before real AI provider work.
- Rewrite or archive `docs/go-live-checklist.md` so it no longer claims stale live-readiness.

Keep the next task narrow and follow the collaboration loop for STRICT paths.

---

## 9. Verification / status of this handoff

This v36 handoff is docs-only.

It does not change:

- production code;
- tests;
- schema or migrations;
- env/package files;
- generated files;
- provider API code;
- provider resolver wiring;
- webhook/void/outbox behavior.

No verify run is required for this handoff unless the reviewer explicitly asks for one.
