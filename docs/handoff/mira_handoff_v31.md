# mira project handoff v31 - Toss confirm fake adapter seam snapshot

**New session role note:** continue the mira payment-core work. Human = orchestration/final decisions/commits, Codex = implementation/recon/runtime checks. **v31 is the current handoff and supersedes v30.** v30 remains the Toss confirm mapper/contract snapshot; v31 carries it forward and records the committed D1-B Toss confirm fake HTTP adapter seam.

**SSOT map:**
- Payment policy baseline -> `docs/payment_policy/payment_policy_confirmed_v6.md` and `docs/payment_policy/payment_policy_open_v6.md`.
- D1-B adapter boundary design lock -> `docs/payment_policy/d1b_adapter_boundary_design_v1.md`.
- ProviderRef persistence decision -> `docs/payment_policy/d1b_provider_ref_persistence_decision_v1.md`.
- Confirm/capture outbound idempotency decision -> `docs/payment_policy/d1b_confirm_idempotency_decision_v1.md`.
- Provider-specific confirm/capture mapping design lock -> `docs/payment_policy/d1b_provider_confirm_capture_mapping_v1.md`.
- Toss callback/orderId decision lock -> `docs/payment_policy/d1b_toss_callback_orderid_decision_v1.md`.
- Toss confirm adapter design lock -> `docs/payment_policy/d1b_toss_confirm_adapter_design_v1.md`.
- Code facts -> the actual source files and tests.
- Code rules -> `AGENTS.md` v4. Collaboration loop -> `docs/collaboration-protocol.md` v3.
- Data model -> `prisma/schema.prisma` + migrations.
- Handoff line -> **v31 is current**, v30 is Toss confirm mapper contract snapshot, v29 is Toss confirm adapter design lock, v28 is Toss callback/orderId fake-flow scaffold, v27 is Toss callback/orderId decision lock.

---

## 1. Current baseline

- Current handoff: `docs/handoff/mira_handoff_v31.md`.
- Previous verification baseline before the fake HTTP adapter seam: **27 files / 376 tests**.
- Current verification baseline after the fake HTTP adapter seam: **28 files / 396 tests**.
- Toss confirm fake adapter seam commit: `7025591 feat(payment): add Toss confirm fake adapter seam`.
- Full Toss confirm fake adapter seam commit hash: `70255914dac3a1576425271d75fdf958d687b583`.
- D1-A provider selection contract is complete.
- D1-B provider adapter contract types are complete.
- ProviderRef persistence schema patch is complete.
- ProviderRef initiate write patch is complete.
- Confirm/capture outbound idempotency schema + fake-provider confirm flow patch is complete.
- Provider-specific confirm/capture mapping design lock is complete.
- Toss callback/orderId fake-flow scaffold is complete.
- Toss confirm mapper/contract patch is complete.
- D1-B Toss confirm fake HTTP adapter seam is complete.
- Real Toss/PayPal adapters remain blocked.
- Current resolver still returns mock providers.

Changed/added files in the committed adapter seam patch:

```text
src/lib/payment/providers/toss/adapter.ts
src/lib/payment/providers/toss/__tests__/adapter.test.ts
```

---

## 2. v31 delta

D1-B Toss confirm fake HTTP adapter seam completed.

The patch added:

- `createTossConfirmAdapter({ httpClient })`.
- `TossConfirmHttpClient`.
- `TossConfirmHttpRequest`.
- `TossConfirmHttpResult`.
- A Toss-local adapter wrapper around the existing pure mapper/classifier/redaction helpers.
- Focused fake-HTTP seam tests.

The adapter uses injected fake HTTP only. It is not production-wired.

---

## 3. Adapter behavior

The adapter uses the existing pure Toss confirm pieces:

```text
buildTossConfirmRequest
normalizeTossConfirmResponse
classifyTossConfirmError
```

It returns `NormalizedProviderConfirmResult` from the shared D1-B provider contract.

Request mapping remains:

```text
body.paymentKey = Payment.providerRef
body.orderId = deriveTossOrderId(Payment.id)
body.amount = Payment.amount
header.Idempotency-Key = Payment.providerConfirmIdempotencyKey
```

Adapter behavior covered:

- Success path for a valid fake `DONE` Toss Payment response.
- Mismatch path returning non-success/manual-review.
- Retryable provider states.
- Manual-review ambiguous states.
- Stop/auth/config states.
- Programmer-error/local malformed states.

---

## 4. Explicit non-changes

The patch did not add or change:

- global `fetch`;
- real Toss HTTP/API calls;
- env or credential reads;
- `TOSS_SECRET_KEY` wiring;
- resolver wiring;
- mock provider behavior;
- provider routing behavior;
- payment action behavior;
- Toss success route completion;
- webhook behavior;
- void behavior;
- outbox behavior;
- reconciliation behavior;
- schema or migrations;
- env/package/generated files;
- live enablement.

Current resolver still returns mock providers. The Toss success route still persists validated `providerRef` only and reports `confirm: "blocked_until_real_toss_adapter"`.

---

## 5. Redaction and diagnostics

Diagnostics remain safe/redacted.

Tests assert diagnostics do not include:

- Authorization;
- Basic auth;
- secrets;
- raw request body;
- raw response body;
- full `paymentKey`;
- full idempotency key;
- payer/card/receipt details.

The adapter relies on the existing Toss redaction helpers rather than inventing a parallel diagnostics shape.

---

## 6. Verification evidence

Accepted checks for the committed adapter seam patch:

```text
npx vitest run \
  src/lib/payment/providers/toss/__tests__/adapter.test.ts \
  src/lib/payment/providers/toss/__tests__/confirm.test.ts \
  src/lib/payment/providers/toss/__tests__/order-id.test.ts \
  src/lib/payment/providers/toss/__tests__/callback.test.ts \
  src/app/api/payments/toss/success/__tests__/route.test.ts
```

Result:

```text
5 files / 85 tests passed
```

Additional verification:

```text
npx prisma validate: passed
npm run verify: passed
```

Final verify baseline:

```text
28 files / 396 tests
```

Delta from v30 baseline:

```text
27 files / 376 tests -> 28 files / 396 tests
```

Existing `<img>` lint warnings remain warnings only.

---

## 7. Remaining blockers before real Toss confirm

- Fake adapter seam is not wired into production confirm flow.
- Real Toss HTTP adapter is not implemented.
- `TOSS_SECRET_KEY`/credentials are not wired.
- Sandbox/live guard is not implemented.
- Current action-level failure taxonomy is still too narrow for real Toss failure wiring.
- A provider failure bridge is still needed before adapter wiring into `confirmPayment`.
- Callback route remains non-completing.
- Provider lookup/manual-review runbook is not implemented.
- Exact invalid input codes still need sandbox/support confirmation before live launch.
- Webhook verifier/parser remains mock-wired.
- Real void taxonomy is unresolved.
- `VOID-HOOK-DEBT` is unresolved.
- No live enablement.

---

## 8. Recommended next step

Recommended next read-only recon:

```text
D1-B provider failure bridge / action taxonomy recon
```

Purpose:

- decide how `NormalizedProviderConfirmResult` failures should map to payment action behavior;
- preserve retry/manual-review/stop/programmer-error distinctions;
- keep Toss adapter non-wired until the bridge is accepted;
- ensure success route completion remains blocked until safe server-side confirm orchestration exists.

Do not recommend live enablement yet.
