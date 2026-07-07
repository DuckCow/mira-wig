# mira project handoff v32 - provider confirm bridge design snapshot

**New session role note:** continue the mira payment-core work. Human = orchestration/final decisions/commits, Codex = implementation/recon/runtime checks. **v32 is the current handoff and supersedes v31.** v31 remains the Toss confirm fake adapter seam snapshot; v32 carries it forward and records the committed D1-B provider confirm result bridge / action taxonomy design lock.

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
- Handoff line -> **v32 is current**, v31 is Toss confirm fake adapter seam snapshot, v30 is Toss confirm mapper contract snapshot, v29 is Toss confirm adapter design lock.

---

## 1. Current baseline

- Current handoff: `docs/handoff/mira_handoff_v32.md`.
- Current verification baseline: **28 files / 396 tests**.
- D1-B provider confirm bridge design doc: `docs/payment_policy/d1b_provider_confirm_result_bridge_design_v1.md`.
- Provider confirm bridge design commit: `3c561ec docs(payment): add provider confirm bridge design`.
- Full provider confirm bridge design commit hash: `3c561eccbbf368c9c0e4772a3e96b67fc6d0923d`.
- D1-A provider selection contract is complete.
- D1-B provider adapter contract types are complete.
- ProviderRef persistence schema patch is complete.
- ProviderRef initiate write patch is complete.
- Confirm/capture outbound idempotency schema + fake-provider confirm flow patch is complete.
- Provider-specific confirm/capture mapping design lock is complete.
- Toss callback/orderId fake-flow scaffold is complete.
- Toss confirm mapper/contract patch is complete.
- D1-B Toss confirm fake HTTP adapter seam is complete.
- Provider failure bridge/action taxonomy recon is complete.
- D1-B provider confirm result bridge / action taxonomy design lock is complete.
- Real Toss/PayPal adapters remain blocked.
- Current production confirm flow still uses the older `PaymentProvider.confirm -> PaymentConfirmFacts` path.
- Current resolver still returns mock providers.

Changed/added file in the committed design lock patch:

```text
docs/payment_policy/d1b_provider_confirm_result_bridge_design_v1.md
```

The design commit was docs-only:

- no production code changed;
- no schema/migration changed;
- no env/package changed;
- no provider API code added;
- no real Toss adapter added;
- no real PayPal adapter added;
- no live credential wiring added;
- no verify run required for the docs-only commit.

---

## 2. v32 delta

D1-B provider confirm result bridge / action taxonomy design lock completed.

The design locks how `NormalizedProviderConfirmResult` should bridge into:

- `confirmPayment` action results;
- `Payment.status`;
- `Payment.errorCode` and `Payment.errorMessage`;
- local completion;
- void/compensation;
- C2 reconciliation visibility.

Purpose:

- prevent real Toss/PayPal adapter wiring from collapsing provider failures into coarse `PROVIDER_RETRYABLE`;
- preserve `RETRYABLE`, `TERMINAL`, `MANUAL_REVIEW`, `STOP`, and `PROGRAMMER_ERROR` distinctions;
- keep real provider wiring blocked until bridge behavior is implemented and tested.

---

## 3. Bridge decisions

### succeeded

- Map to `CaptureFacts`.
- Call `completeFromCapture`.
- Final `providerPaymentKey` remains written by completion.
- Local completion handles order/session/stock/cart/outbox convergence.

### RETRYABLE

- Do not call completion.
- Do not enqueue void.
- Do not mark payment terminal.
- Preserve `providerConfirmIdempotencyKey`.
- Keep payment attempt retryable.
- Return retryable provider failure result.

### TERMINAL

- Provider did not capture funds, or result is terminal non-capture/decline.
- Do not call completion.
- Do not enqueue void.
- Mark only the current `Payment` attempt `FAILED`.
- Do not mark checkout session failed.
- Allow new attempt behavior according to existing session/payment flow.

### MANUAL_REVIEW

- Do not call completion.
- Do not enqueue void.
- Keep pending.
- Store safe marker using existing `Payment.errorCode` and `Payment.errorMessage`.
- Preserve operator/C2 visibility.
- Do not lose the state after request returns.

### STOP

- Auth/config/provider setup issue.
- No money-state mutation.
- No browser retry loop.
- Safe operator/config marker only.

### PROGRAMMER_ERROR

- Fail closed.
- No provider retry.
- No money-state mutation by default.
- No raw provider diagnostics exposed.

---

## 4. Persistence decision

D1 uses existing fields:

```text
Payment.errorCode
Payment.errorMessage
```

No schema change is required for the design lock. No `PaymentProviderAttempt` table is added yet. `PaymentProviderAttempt` remains a later audit/history option if repeated-attempt history, lookup runbooks, richer provider diagnostics, or audit-grade provider request records become necessary.

Recommended safe stored codes:

- `PROVIDER_CONFIRM_RETRYABLE`
- `PROVIDER_CONFIRM_TERMINAL`
- `PROVIDER_CONFIRM_MANUAL_REVIEW`
- `PROVIDER_CONFIRM_STOP`
- `PROVIDER_CONFIRM_PROGRAMMER_ERROR`

Storage rules carried forward:

- Store local normalized code/category, not raw provider secrets or raw response bodies.
- Store bounded safe message only.
- Do not store auth headers, full provider payment keys, raw bodies, card/payer data, or credentials.
- `MANUAL_REVIEW`, `STOP`, and `TERMINAL` should be durable before real adapter wiring.

---

## 5. Action result taxonomy

Recommended future action codes/classes:

- `PROVIDER_RETRYABLE`
- `PROVIDER_TERMINAL`
- `PROVIDER_MANUAL_REVIEW`
- `PROVIDER_STOP`
- `PROVIDER_PROGRAMMER_ERROR`

Action boundary rules:

- Browser responses use user-safe messages only.
- Provider diagnostics are operator-only and redacted.
- Raw provider codes are not exposed unless explicitly reviewed as safe.
- Public Toss success route must not expose raw provider details.
- Public Toss success route remains non-completing until a reviewed server-side confirm orchestration exists.

---

## 6. C2 implications

Proposed future C2 findings:

- `STALE_PROVIDER_CONFIRM_ATTEMPT`
- `PROVIDER_CONFIRM_MANUAL_REVIEW`
- `PROVIDER_CONFIRM_STOP`
- `PROVIDER_CONFIRM_TERMINAL_FAILED`

C2 implications:

- C2 must eventually see stale provider confirm attempts.
- C2 must distinguish manual-review, stop, and terminal provider confirm markers.
- C2 should detect pending `Payment` rows with `providerConfirmIdempotencyKey` older than a threshold and no `providerPaymentKey`.
- C2 should detect `providerRef` present but no final `providerPaymentKey` and no order after a threshold.
- C2 remains report-only unless a separate design explicitly adds repair behavior.

---

## 7. Void and compensation boundary

- Provider confirm failure before capture evidence does not enqueue void.
- Terminal provider decline must not trigger void.
- Manual review must not trigger void automatically.
- Void remains only for captured payment that cannot be locally completed or requires compensating cancellation.
- Ambiguous provider state requires manual review or provider lookup, not blind void.
- `completeFromCapture` remains the boundary that can enqueue compensation after captured facts exist.

---

## 8. Provider lookup boundary

- Provider lookup remains a separate future port.
- D1 bridge can classify ambiguity as manual review.
- Real money launch requires lookup or a manual-review runbook for ambiguous already-processed, timeout, retention-expired, provider/local mismatch, and similar states.
- Do not fold lookup into the confirm bridge yet.
- Do not mint a new confirm idempotency key to escape ambiguous provider state.

---

## 9. Remaining blockers before real provider wiring

Real Toss/PayPal adapters remain STOP until at least:

- bridge/action taxonomy implementation exists;
- manual-review durable marker behavior is implemented;
- C2 can observe provider confirm manual/stop/terminal states;
- provider-specific Toss/PayPal id/header constraints remain verified;
- sandbox/live credential separation is implemented;
- real webhook verifier/parser remains unwired;
- real void taxonomy remains unresolved;
- `VOID-HOOK-DEBT` remains unresolved;
- no live enablement yet.

Additional carried blockers:

- Real Toss HTTP adapter is not implemented.
- Real PayPal adapter is not implemented.
- Callback route remains non-completing.
- Provider lookup/manual-review runbook is not implemented.
- Exact invalid input codes still need sandbox/support confirmation before live launch.

---

## 10. Recommended next step

Recommended next implementation patch:

```text
D1-B provider confirm bridge/action taxonomy patch with fake provider only
```

The next patch should:

- bridge `NormalizedProviderConfirmResult` into action/completion behavior;
- extend action error codes safely;
- use existing `Payment.errorCode` and `Payment.errorMessage` for durable safe markers;
- add focused action and C2 tests;
- keep production resolver/mock behavior controlled by tests;
- keep real Toss and PayPal adapters unwired.

The next patch must still exclude:

- real Toss API calls;
- real PayPal API calls;
- resolver wiring to real providers;
- Toss success route completion;
- live credentials;
- webhook/void/settlement implementation;
- execution-time cross-PG fallback.

Do not recommend live enablement yet.
