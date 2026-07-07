# mira project handoff v33 - provider confirm bridge implementation snapshot

**New session role note:** continue the mira payment-core work. Human = orchestration/final decisions/commits, Codex = implementation/recon/runtime checks. **v33 is the current handoff and supersedes v32.** v32 remains the provider confirm bridge/action taxonomy design snapshot; v33 carries it forward and records the committed D1-B provider confirm bridge/action taxonomy implementation.

**SSOT map:**
- Payment policy baseline -> `docs/payment_policy/payment_policy_confirmed_v6.md` and `docs/payment_policy/payment_policy_open_v6.md`.
- D1-B adapter boundary design lock -> `docs/payment_policy/d1b_adapter_boundary_design_v1.md`.
- ProviderRef persistence decision -> `docs/payment_policy/d1b_provider_ref_persistence_decision_v1.md`.
- Confirm/capture outbound idempotency decision -> `docs/payment_policy/d1b_confirm_idempotency_decision_v1.md`.
- Provider-specific confirm/capture mapping design lock -> `docs/payment_policy/d1b_provider_confirm_capture_mapping_v1.md`.
- Toss callback/orderId decision lock -> `docs/payment_policy/d1b_toss_callback_orderid_decision_v1.md`.
- Toss confirm adapter design lock -> `docs/payment_policy/d1b_toss_confirm_adapter_design_v1.md`.
- Provider confirm result bridge / action taxonomy design lock -> `docs/payment_policy/d1b_provider_confirm_result_bridge_design_v1.md`.
- Code facts -> the actual source files and tests.
- Code rules -> `AGENTS.md` v4. Collaboration loop -> `docs/collaboration-protocol.md` v3.
- Data model -> `prisma/schema.prisma` + migrations.
- Handoff line -> **v33 is current**, v32 is provider confirm bridge/action taxonomy design lock, v31 is Toss confirm fake adapter seam snapshot, v30 is Toss confirm mapper contract snapshot.

---

## 1. Current baseline

- Current handoff: `docs/handoff/mira_handoff_v33.md`.
- Previous verification baseline before the bridge implementation: **28 files / 396 tests**.
- Current verification baseline after the bridge implementation: **28 files / 402 tests**.
- Provider confirm bridge/action taxonomy implementation commit: `8028d50 feat(payment): add provider confirm result bridge`.
- Full provider confirm bridge/action taxonomy implementation commit hash: `8028d50907995e4f2d555aeaab14acac9f6faa1b`.
- D1-A provider selection contract is complete.
- D1-B provider adapter contract types are complete.
- ProviderRef persistence schema patch is complete.
- ProviderRef initiate write patch is complete.
- Confirm/capture outbound idempotency schema + fake-provider confirm flow patch is complete.
- Provider-specific confirm/capture mapping design lock is complete.
- Toss callback/orderId fake-flow scaffold is complete.
- Toss confirm mapper/contract patch is complete.
- D1-B Toss confirm fake HTTP adapter seam is complete.
- D1-B provider confirm bridge/action taxonomy is complete.
- Real Toss/PayPal adapters remain blocked.
- Current resolver still returns mock providers.

Changed/added files in the committed bridge patch:

```text
src/app/actions/__tests__/payment.test.ts
src/app/actions/payment.ts
src/lib/payment/providers/confirm-bridge.ts
src/lib/payment/providers/types.ts
```

---

## 2. v33 delta

D1-B provider confirm bridge/action taxonomy completed.

The patch added:

- `NormalizedProviderConfirmResult` bridge support.
- A provider confirm bridge module at `src/lib/payment/providers/confirm-bridge.ts`.
- Action-level provider failure codes for retryable, terminal, manual-review, stop, and programmer-error results.
- `PaymentProvider.confirm` support for either legacy `PaymentConfirmFacts` or normalized confirm results.
- Focused action tests for normalized success and failure classes.

The bridge keeps legacy fake-provider success behavior working while allowing future real adapters to return the normalized shared confirm contract.

---

## 3. Bridge behavior

### succeeded

- `succeeded` maps to `CaptureFacts`.
- `CaptureFacts` flows into `completeFromCapture`.
- Completion remains responsible for local order/payment/session/stock/cart convergence.
- `Payment.providerPaymentKey` is not written directly by the bridge.

### RETRYABLE

- No completion.
- No void.
- No terminal mutation.
- `providerConfirmIdempotencyKey` is preserved.
- The current `Payment` attempt remains pending.
- The action returns retryable provider failure.

### TERMINAL

- The current `Payment` attempt is marked `FAILED`.
- The checkout session is not failed by the bridge.
- No void is enqueued.
- No order or completion side effects are created.
- A new attempt can still proceed through the existing session/payment flow.

### MANUAL_REVIEW

- The `Payment` attempt stays pending.
- A safe marker is persisted.
- No completion is attempted.
- No void is enqueued.
- Raw provider diagnostics are not exposed through the action result.

### STOP

- No money-state mutation.
- A safe operator/config marker is persisted on the pending payment.
- The action response is non-retryable to avoid a browser retry loop.
- No completion or void is attempted.

### PROGRAMMER_ERROR

- The bridge fails closed.
- No provider retry is requested.
- No money-state mutation is performed by default.
- Internal detail and raw provider diagnostics are not exposed through the action result.

---

## 4. Persistence

D1 uses existing fields:

```text
Payment.errorCode
Payment.errorMessage
```

No schema change was made.

Implemented stored marker codes:

- `PROVIDER_CONFIRM_TERMINAL`
- `PROVIDER_CONFIRM_MANUAL_REVIEW`
- `PROVIDER_CONFIRM_STOP`

Persistence rules:

- Store local safe marker codes/messages only.
- Do not store raw provider diagnostics in action-visible results.
- Do not write `Payment.providerPaymentKey` from the bridge.
- Keep `providerConfirmIdempotencyKey` stable across retryable confirm attempts.

---

## 5. Explicit non-changes

The patch did not add or change:

- schema or migrations;
- env/package/generated files;
- real Toss wiring;
- real PayPal wiring;
- provider resolver wiring;
- mock provider routing behavior;
- provider API calls;
- credential or env reads;
- Toss success route completion;
- webhook behavior;
- void behavior;
- outbox behavior;
- reconciliation behavior.

Provider confirm failure before capture evidence does not enqueue void. Void/compensation remains behind `completeFromCapture` after captured facts exist.

---

## 6. Verification evidence

Accepted checks for the committed bridge/action taxonomy patch:

```text
npx vitest run src/app/actions/__tests__/payment.test.ts
```

Result:

```text
1 file / 19 tests passed
```

Additional verification:

```text
npx prisma validate: passed
npm run verify: passed
```

Final verify baseline:

```text
28 files / 402 tests
```

Delta from v32 implementation baseline:

```text
28 files / 396 tests -> 28 files / 402 tests
```

Existing `<img>` lint warnings remain warnings only.

---

## 7. Remaining follow-up

- C2 detector support for provider confirm markers remains follow-up.
- C2 should eventually observe terminal, manual-review, and stop provider confirm markers.
- C2 should eventually detect stale provider confirm attempts with a preserved confirm idempotency key and no final provider payment key.
- Real Toss adapter wiring remains blocked until C2 visibility and launch guards are accepted.
- Real PayPal adapter wiring remains blocked.
- Real provider credential/env wiring remains blocked.
- Toss success route remains non-completing.
- Webhook verifier/parser remains unwired for real money.
- Real void taxonomy remains unresolved.
- `VOID-HOOK-DEBT` remains unresolved.
- No live enablement.

---

## 8. Recommended next step

Recommended next work:

```text
D1-B C2 provider confirm marker detector design/recon
```

Purpose:

- make provider confirm terminal/manual-review/stop markers visible to operators;
- keep real provider wiring blocked until stale and marked confirm attempts are observable;
- preserve the current bridge behavior without adding repair side effects.
