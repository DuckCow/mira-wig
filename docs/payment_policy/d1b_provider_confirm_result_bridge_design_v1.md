# D1-B provider confirm result bridge / action taxonomy v1

> Status: design lock, not an implementation patch.
> Date: 2026-07-07.
> Baseline: `main` pushed/clean, handoff v31, verify baseline 28 files / 396 tests.
> Scope: bridge normalized provider confirm results into the local confirm action before any real Toss or PayPal adapter is wired.

## 1. Purpose

This document locks the D1-B provider confirm result bridge and action taxonomy.

It answers how `NormalizedProviderConfirmResult` should affect:

- `confirmPayment` action result;
- `Payment.status`;
- `Payment.errorCode` and `Payment.errorMessage`;
- local completion;
- void/compensation;
- C2 reconciliation visibility.

This is a design lock only. It exists because the current Toss fake adapter can return rich normalized outcomes, but the current production confirm action can only safely represent provider success and coarse provider retryable failure. Real Toss or PayPal wiring must not collapse all provider failures into `PROVIDER_RETRYABLE`.

## 2. Non-goals

- No real Toss adapter wiring.
- No real PayPal adapter wiring.
- No provider API calls.
- No credentials.
- No schema change in this document.
- No migration.
- No webhook implementation.
- No void/cancel implementation.
- No settlement, fees, or FX.
- No execution-time cross-PG fallback.
- No live enablement.

## 3. Current state summary

Current production behavior:

- `confirmPayment` uses the older `PaymentProvider.confirm(input) -> PaymentConfirmFacts` port from `src/lib/payment/providers/types.ts`.
- Provider success maps to `CaptureFacts` and calls `completeFromCapture`.
- Provider throw becomes coarse action error `PROVIDER_RETRYABLE` with `retryable: true`.
- Provider failure leaves the local `Payment` pending with `providerPaymentKey = null`.
- `Payment.providerConfirmIdempotencyKey` is persisted before provider confirm and reused on retry.
- No void is enqueued on provider failure.
- `completeFromCapture` is called only after provider success facts exist.
- The normalized Toss adapter result from `createTossConfirmAdapter({ httpClient })` is not wired into production.
- `Payment.errorCode` and `Payment.errorMessage` exist in schema but are not currently used for provider confirm failure taxonomy.
- C2 reconciliation currently covers local completion, webhook events, webhook ingress rejections, and void outbox states. It does not yet detect confirm-attempt provider failure states.

## 4. Normalized provider result taxonomy

The shared provider contract already defines:

```text
succeeded
RETRYABLE
TERMINAL
MANUAL_REVIEW
STOP
PROGRAMMER_ERROR
```

Success carries:

- `providerPaymentKey`;
- `amountMinor`;
- `currency`;
- optional `capturedAt`, `approvedAt`, and `providerTimestamp`;
- `idempotencyKey`;
- optional `rawProviderStatus`;
- optional `providerRef`, `providerOrderId`, and `providerPaymentId`;
- redacted diagnostics.

Failure carries:

- `classification`;
- `normalizedCode`;
- optional `providerErrorCode`;
- `safeMessage`;
- optional `httpStatus`;
- `ambiguousProviderState`;
- `providerLookupRequired`;
- optional `idempotencyKey`;
- redacted diagnostics.

The bridge derives retry/manual/operator behavior from `classification`; the failure shape does not need separate retryable or manual-review booleans.

## 5. Desired bridge semantics

### succeeded

- Map to `CaptureFacts`.
- Call `completeFromCapture`.
- Local completion persists the final `Payment.providerPaymentKey`.
- Local completion handles order/session/stock/cart convergence.
- Local completion handles void outbox enqueue only when captured funds cannot be locally completed.

### RETRYABLE

- Do not call `completeFromCapture`.
- Do not mark `Payment` terminal.
- Do not enqueue void.
- Preserve `Payment.providerConfirmIdempotencyKey`.
- Keep the payment attempt retryable.
- Return an action result indicating retryable provider failure.
- C2 should later detect stale pending confirm attempts if the attempt remains stuck.

### TERMINAL

- Treat as provider evidence that funds were not captured, or as a terminal non-capture/decline state.
- Do not call completion.
- Do not enqueue void.
- Mark only the current local `Payment` attempt as `FAILED`.
- Keep the checkout session retryable/new-attempt-capable while normal checkout-session policy allows it.
- Return a safe terminal failure to the caller.
- Do not expose raw provider diagnostics to the user.

### MANUAL_REVIEW

- Do not call completion.
- Do not enqueue void automatically.
- Do not mark local completion success.
- Preserve a durable safe marker for operator/C2 visibility before real-money wiring.
- Keep the `Payment` in its pending state for D1 so ambiguous money movement is not hidden as a normal terminal failure.
- Store safe `Payment.errorCode` and `Payment.errorMessage`.
- Return a safe manual-review action result.

### STOP

- Treat as auth/config/provider setup failure or unsafe adapter configuration.
- Do not complete.
- Do not void.
- Do not retry in a browser loop.
- Preserve or surface a safe operator/config marker.
- Keep money state unchanged.
- Return a safe operator/config action result.

### PROGRAMMER_ERROR

- Treat as local code/request construction error.
- Fail closed.
- Do not complete.
- Do not void.
- Do not retry provider.
- Prefer throw/internal handling or an internal action result with redacted details.
- Do not change money state unless a future patch proves a safe internal marker is useful.

## 6. Payment state mutation decision

Options:

- A. No `Payment` mutation for non-success results.
  - Lowest implementation cost.
  - Unsafe for `MANUAL_REVIEW` because state is lost after the request.
- B. Use existing `Payment.errorCode` and `Payment.errorMessage` only.
  - No migration.
  - Gives C2 and operators a durable marker.
  - Does not by itself distinguish terminal retry/new-attempt eligibility unless paired with status rules.
- C. Mark terminal declines as `Payment.status = FAILED`.
  - Fits existing status space.
  - Allows a new local payment attempt without pretending funds moved.
  - Must not mark the checkout session failed and must not enqueue void.
- D. Mark manual review/stop as `Payment.status = FAILED`.
  - Too lossy for D1 because ambiguous money movement would look like a normal failed attempt.
  - Rejected for `MANUAL_REVIEW`.
- E. Add a new `Payment` status later.
  - Better long-term modeling for manual review and operator stop.
  - Requires schema/migration and more C2/UI decisions.
- F. Add `PaymentProviderAttempt` later.
  - Best audit shape for repeated provider attempts and diagnostics.
  - Higher migration/design cost, deferred until the bridge proves the needed history.

Decision:

- `RETRYABLE`: no terminal mutation. Preserve pending status and confirm idempotency key. Optional safe `errorCode/errorMessage` update is allowed in the implementation patch if tests prove it helps C2 without making hot retries noisy.
- `TERMINAL`: mark the current `Payment` attempt `FAILED`; write safe `errorCode/errorMessage`; do not change checkout session status; do not void.
- `MANUAL_REVIEW`: keep pending status; write safe `errorCode/errorMessage`; require C2/operator visibility before real money wiring.
- `STOP`: keep money state unchanged; write or return a safe operator/config marker; no browser retry loop.
- `PROGRAMMER_ERROR`: fail closed with redacted details; no money-state mutation by default.

Current D1 can use existing `Payment.errorCode` and `Payment.errorMessage`. New status values or `PaymentProviderAttempt` are deferred.

## 7. Action result taxonomy

The current action result can express only success or coarse error plus `retryable`. The future bridge should extend the confirm action taxonomy with provider-specific safe codes while keeping the same broad action style.

Recommended future result codes:

```text
PROVIDER_RETRYABLE
PROVIDER_TERMINAL
PROVIDER_MANUAL_REVIEW
PROVIDER_STOP
PROVIDER_PROGRAMMER_ERROR
```

Action behavior:

- `PROVIDER_RETRYABLE`
  - User-safe message: temporary provider issue.
  - `retryable: true`.
  - Client may offer retry with the same local attempt.
  - Operator diagnostics omitted from public response.
  - Public Toss success route should not expose raw provider details.
- `PROVIDER_TERMINAL`
  - User-safe message: payment could not be approved.
  - `retryable: false` for the same provider confirm attempt.
  - Client may allow a new payment attempt if checkout session remains usable.
  - Raw provider codes omitted unless explicitly classified as user-safe.
- `PROVIDER_MANUAL_REVIEW`
  - User-safe message: payment requires review.
  - `retryable: false`.
  - Client should not loop retries.
  - Operator diagnostics omitted from public response.
  - Public Toss success route should not expose this directly until a reviewed UX exists.
- `PROVIDER_STOP`
  - User-safe message: payment provider is temporarily unavailable.
  - `retryable: false`.
  - Client should not retry in a loop.
  - Operator/config details are server-side only.
- `PROVIDER_PROGRAMMER_ERROR`
  - User-safe message: payment operation failed.
  - `retryable: false`.
  - Prefer internal throw/log path with redacted diagnostics.
  - Never expose raw provider diagnostics.

Provider `safeMessage` can be used for server logs or operator surfaces only after redaction review. Browser responses should use stable local messages.

## 8. Persistence and C2 visibility

D1 can use existing fields:

```text
Payment.errorCode
Payment.errorMessage
```

Recommended safe stored codes:

- `PROVIDER_CONFIRM_RETRYABLE`
- `PROVIDER_CONFIRM_TERMINAL`
- `PROVIDER_CONFIRM_MANUAL_REVIEW`
- `PROVIDER_CONFIRM_STOP`
- `PROVIDER_CONFIRM_PROGRAMMER_ERROR`

Storage rules:

- Store local normalized code/category, not raw provider secrets or raw response bodies.
- Store bounded safe message only.
- Never store auth headers, full provider payment keys, raw bodies, card/payer data, or credentials.
- `RETRYABLE` may be action-only for the first bridge patch, but storing a safe marker is allowed if C2 tests need it.
- `MANUAL_REVIEW`, `STOP`, and `TERMINAL` should be durable before real adapter wiring.

Recommended C2 future finding kinds:

- `STALE_PROVIDER_CONFIRM_ATTEMPT`
- `PROVIDER_CONFIRM_MANUAL_REVIEW`
- `PROVIDER_CONFIRM_STOP`
- `PROVIDER_CONFIRM_TERMINAL_FAILED`

C2 should detect:

- pending `Payment` with `providerConfirmIdempotencyKey` older than a threshold and no `providerPaymentKey`;
- `providerRef` present but no final `providerPaymentKey` and no order after a threshold;
- `Payment.errorCode = PROVIDER_CONFIRM_MANUAL_REVIEW`;
- `Payment.errorCode = PROVIDER_CONFIRM_STOP`;
- terminal failed payment attempts when useful for operator reports.

`PaymentProviderAttempt` is deferred until the project needs repeated-attempt history, lookup runbooks, richer provider diagnostics, or audit-grade provider request records.

## 9. Void/compensation boundary

- Provider confirm failure before capture evidence does not enqueue void.
- Void is only for a captured payment that cannot be locally completed, or a later explicit compensating cancellation need.
- `MANUAL_REVIEW` must not trigger void automatically.
- `TERMINAL` provider decline must not trigger void.
- If provider state is ambiguous and funds may have moved, manual review or provider lookup is required.
- `completeFromCapture` remains the boundary that can enqueue compensation after captured facts exist.

## 10. Provider lookup boundary

- The bridge may classify ambiguous outcomes as `MANUAL_REVIEW` for D1 fake wiring.
- Provider lookup remains a separate future port.
- Real-money launch needs provider lookup or a reviewed manual-review runbook for ambiguous already-processed, timeout, retention-expired, and provider/local mismatch states.
- Do not fold lookup into the confirm bridge yet.
- Do not mint a new confirm idempotency key to escape ambiguous provider state.

## 11. Implementation options

### A. Design only, no code yet

- Correctness: good as a review gate.
- Migration cost: none.
- UI compatibility: no impact.
- C2 observability: unchanged.
- Risk: does not prevent later code drift unless followed by tests.
- Toss/PayPal readiness: necessary but not sufficient.

### B. Fake provider bridge patch using normalized results but no real adapter wiring

- Correctness: good next implementation step.
- Migration cost: none if existing `Payment.errorCode/errorMessage` are enough.
- UI compatibility: low risk because no non-test client currently depends on confirm-specific failure classes.
- C2 observability: can add minimal detectors.
- Risk: moderate if it overbuilds provider attempt history too early.
- Toss/PayPal readiness: improves readiness without real calls.

### C. Extend `confirmPayment` action taxonomy while still using fake provider result injection

- Correctness: strong if tests cover all classifications.
- Migration cost: none.
- UI compatibility: manageable, but action callers must handle new codes before public UX exposure.
- C2 observability: only good if paired with durable markers.
- Risk: low if scoped to fake adapter/bridge.
- Toss/PayPal readiness: required before real adapter wiring.

### D. Add Payment error marker usage

- Correctness: good D1 compromise.
- Migration cost: none.
- UI compatibility: none unless surfaced.
- C2 observability: good enough for v0 findings.
- Risk: limited field expressiveness.
- Toss/PayPal readiness: acceptable for fake bridge; may need richer audit later.

### E. Add provider attempt table

- Correctness: strongest long-term audit story.
- Migration cost: high.
- UI compatibility: none initially.
- C2 observability: strongest.
- Risk: overbuilding for D1 before bridge behavior is proven.
- Toss/PayPal readiness: useful later, not required for fake-only bridge.

## 12. Recommended next step

After this design lock is reviewed, implement:

```text
D1-B provider confirm bridge/action taxonomy patch with fake provider only
```

That patch should:

- bridge `NormalizedProviderConfirmResult` into action/completion behavior;
- extend action error codes safely;
- use existing `Payment.errorCode/errorMessage` for durable safe markers;
- add focused action and C2 tests;
- keep production resolver/mock behavior controlled by tests;
- keep real Toss and PayPal adapters unwired.

The patch must exclude:

- real Toss API calls;
- real PayPal API calls;
- resolver wiring to real adapters;
- Toss success route completion;
- live credentials;
- webhook implementation;
- void/cancel implementation;
- settlement, fees, or FX.

## 13. Future test plan

Required tests for the eventual patch:

- normalized success calls `completeFromCapture`;
- retryable failure does not complete or void and preserves `providerConfirmIdempotencyKey`;
- terminal failure marks only the `Payment` attempt failed;
- terminal failure allows a future new attempt when checkout session policy allows it;
- manual review persists a safe marker and does not complete or void;
- stop/config result does not hot-retry;
- programmer error fails closed;
- action result redacts provider diagnostics;
- C2 can detect designed durable states;
- no real provider API calls.

## 14. Stop conditions before adapter wiring

Stop before wiring a real Toss or PayPal confirm adapter if any of these remains true:

- action result taxonomy is not implemented;
- manual-review durable marker is not implemented;
- C2 cannot observe manual/stop states if required by launch policy;
- terminal decline would be misclassified as retryable;
- manual review would be lost after request return;
- provider confirm failure would enqueue void incorrectly;
- retryable failure would mint a new confirm idempotency key;
- adapter wiring would collapse taxonomy into `PROVIDER_RETRYABLE`;
- tests require real provider calls.

## 15. Recommended next step

Recommended sequence:

1. Review and accept this design lock.
2. Implement the fake-only provider confirm bridge/action taxonomy patch.
3. Add C2 visibility for the selected durable markers.
4. Keep real Toss adapter wiring blocked until the bridge is accepted and green.

Do not wire the real Toss adapter yet.
