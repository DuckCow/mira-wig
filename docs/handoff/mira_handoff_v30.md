# mira project handoff v30 - Toss confirm mapper contract snapshot

**New session role note:** continue the mira payment-core work. Human = orchestration/final decisions/commits, Codex = implementation/recon/runtime checks. **v30 is the current handoff and supersedes v29.** v29 remains the Toss confirm adapter design-lock snapshot; v30 carries it forward and records the committed D1-B Toss confirm fake mapper/contract patch.

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
- Handoff line -> **v30 is current**, v29 is Toss confirm adapter design lock, v28 is Toss callback/orderId fake-flow scaffold, v27 is Toss callback/orderId decision lock, v26 is provider-specific confirm/capture mapping lock, v25 is confirm idempotency schema + fake-provider flow.

---

## 1. Current baseline

- Current handoff: `docs/handoff/mira_handoff_v30.md`.
- Previous verification baseline before the Toss confirm mapper patch: **26 files / 344 tests**.
- Current verification baseline after the Toss confirm mapper patch: **27 files / 376 tests**.
- Toss confirm mapper commit: `b7410cc feat(payment): add Toss confirm mapper contract`.
- Full Toss confirm mapper commit hash: `b7410cc6ba9a0f29a94114ccf5039befe13e3ee5`.
- D1-A provider selection contract is complete.
- D1-B provider adapter contract types are complete.
- ProviderRef persistence schema patch is complete.
- ProviderRef initiate write patch is complete.
- Confirm/capture outbound idempotency schema + fake-provider confirm flow patch is complete.
- Provider-specific confirm/capture mapping design lock is complete.
- Toss callback/orderId decision is complete.
- Toss callback/orderId fake-flow scaffold is complete.
- Toss confirm adapter design lock is complete.
- D1-B Toss confirm fake mapper/contract patch is complete.
- Real Toss/PayPal adapters remain blocked.
- Current resolver still returns mock providers.

Changed/added files in the committed mapper patch:

```text
src/lib/payment/providers/toss/confirm.ts
src/lib/payment/providers/toss/errors.ts
src/lib/payment/providers/toss/redaction.ts
src/lib/payment/providers/toss/__tests__/confirm.test.ts
```

---

## 2. v30 delta

The committed patch added pure Toss confirm contract code only:

- Toss confirm request builder;
- Toss Payment response normalizer;
- Toss confirm error classifier;
- safe redaction/diagnostics helper;
- focused tests.

It did not add a real Toss adapter, Toss HTTP, credentials, env reads, provider resolver wiring, payment action changes, Toss success route changes, callback helper changes, webhook/void/outbox/reconciliation production behavior, schema/migration/env/package changes, or generated files.

Normal verification still uses fake/pure tests only.

---

## 3. Request builder

Implemented request mapping:

```text
POST /v1/payments/confirm
body.paymentKey = Payment.providerRef
body.orderId = deriveTossOrderId(Payment.id)
body.amount = Payment.amount
header.Idempotency-Key = Payment.providerConfirmIdempotencyKey
```

Pre-HTTP failures:

- missing `providerRef`;
- missing `providerConfirmIdempotencyKey`;
- non-KRW currency;
- invalid amount;
- bad derived orderId.

Preserved rules:

- It does not use callback query amount.
- It does not build Authorization with a real secret.
- It does not read `TOSS_SECRET_KEY`.
- It does not perform HTTP.

Preserved invariants:

```text
Toss orderId = mira_toss_{Payment.id}
Payment.providerRef = Toss paymentKey after callback validation and before confirm
Payment.providerConfirmIdempotencyKey = outbound Toss Idempotency-Key source
Payment.providerPaymentKey = Toss paymentKey only after Toss confirm returns DONE
Payment.idempotencyKey = initiate/local attempt key, not confirm key
```

---

## 4. Response normalizer

D1 success requirements:

```text
status === DONE
response.paymentKey === Payment.providerRef
response.orderId === deriveTossOrderId(Payment.id)
response.totalAmount === Payment.amount
response.currency === KRW, if present
```

Success mapping:

```text
providerPaymentKey = response.paymentKey
capturedAt = response.approvedAt if valid
rawProviderStatus = response.status
diagnostics = safe/redacted only
```

Rules captured by tests:

- non-DONE does not succeed;
- identity, amount, or currency mismatch does not succeed;
- malformed Toss Payment object does not succeed;
- invalid `approvedAt` does not succeed;
- missing `approvedAt` uses `receivedAt` fallback with explicit diagnostics;
- mismatches do not emit `CaptureFacts`;
- raw Toss response is not persisted or returned in diagnostics.

---

## 5. Error classifier

Taxonomy mapping:

```text
RETRYABLE:
- timeout/network
- HTTP 5xx/internal
- PROVIDER_ERROR
- FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING
- FAILED_INTERNAL_SYSTEM_PROCESSING
- IDEMPOTENT_REQUEST_PROCESSING

STOP:
- auth/key/basic failures

PROGRAMMER_ERROR:
- malformed local request
- missing local providerRef/idempotency/orderId/amount before HTTP

TERMINAL:
- user/payment-method declines
- expired/canceled sessions when not ambiguous

MANUAL_REVIEW:
- ALREADY_PROCESSED_PAYMENT without matching success proof
- unknown/ambiguous/unrecognized codes
```

Classifier rules:

- It does not invent idempotent success from an error code alone.
- `ALREADY_PROCESSED_PAYMENT` remains manual review unless separate matching success evidence exists.
- Unrecognized Toss codes fail conservatively.
- The tiny test-only revision explicitly covers `FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING` and `FAILED_INTERNAL_SYSTEM_PROCESSING` as `RETRYABLE`.

---

## 6. Redaction

Recorded behavior:

- Toss `paymentKey` is masked.
- Idempotency key is safely hashed/truncated.
- Safe messages are bounded.
- Diagnostics do not include `TOSS_SECRET_KEY`.
- Diagnostics do not include Authorization or Basic auth.
- Diagnostics do not include raw request body.
- Diagnostics do not include raw response body.
- Diagnostics do not include payer/card/receipt details.
- Diagnostics do not include full `paymentKey`.

---

## 7. Verification evidence

Accepted post-revision checks:

- Targeted Toss confirm tests passed.
- `npx prisma validate` passed.
- `npm run verify` passed.
- Final baseline: **27 files / 376 tests**.
- Existing `<img>` lint warnings remain warnings only.

Coverage includes:

- request body mapping;
- idempotency header mapping;
- missing providerRef/key failures;
- non-KRW and invalid amount failures;
- DONE response normalization;
- paymentKey/orderId/amount/currency mismatch failures;
- approvedAt mapping and fallback;
- retryable Toss errors;
- `FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING`;
- `FAILED_INTERNAL_SYSTEM_PROCESSING`;
- `IDEMPOTENT_REQUEST_PROCESSING`;
- `ALREADY_PROCESSED_PAYMENT` manual review;
- redaction safety;
- no real Toss API calls;
- resolver still mock-backed.

---

## 8. Explicit non-changes

- No real Toss adapter was added.
- No Toss HTTP/API calls were added.
- No credentials/env reads were added.
- No integration wiring was added.
- No resolver wiring was added.
- No payment action changed.
- No Toss success route changed.
- No callback helper changed.
- No webhook/void/outbox/reconciliation production behavior changed.
- No schema/migration/env/package changed.
- Normal verify remains fake/pure-test only.

---

## 9. Remaining blockers before real Toss confirm

- Fake mapper is not wired into production confirm flow.
- Real Toss HTTP adapter is not implemented.
- `TOSS_SECRET_KEY`/credentials are not wired.
- Sandbox/live guard is not implemented.
- Callback route remains non-completing.
- Exact invalid input codes still need sandbox/support confirmation before live launch.
- Provider lookup/manual-review runbook is not implemented.
- Webhook verifier/parser remains mock-wired.
- Real void taxonomy is unresolved.
- `VOID-HOOK-DEBT` is unresolved.
- No live enablement.

---

## 10. Recommended next step

Recommended read-only recon:

```text
D1-B Toss confirm adapter integration boundary recon
```

Purpose:

- decide how to wire the pure Toss mapper into a sandbox-only adapter with fake HTTP tests;
- decide adapter factory guard shape;
- ensure the success route still does not complete via mock;
- keep real Toss API calls out of normal verify.

Do not recommend live enablement yet.
