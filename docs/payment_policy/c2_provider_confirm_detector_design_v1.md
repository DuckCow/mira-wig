# C2 provider confirm marker detector extension v1

> Status: design lock, not an implementation patch.
> Date: 2026-07-07.
> Baseline: `main` pushed/clean, handoff v33, verify baseline 28 files / 402 tests.
> Scope: C2 report-only detection of provider confirm bridge states.

## 1. Purpose

This document locks how C2 report-only reconciliation will detect provider confirm bridge states.

The provider confirm bridge can now leave durable safe markers on `Payment.errorCode` and
`Payment.errorMessage`. C2 needs to observe those states before real Toss or PayPal provider
confirm wiring is allowed.

This is not a repair, retry, confirm, void, provider-call, or mutation implementation.

## 2. Non-goals

- No code implementation in this document.
- No schema change.
- No migrations.
- No provider API calls.
- No provider confirm retry.
- No `completeFromCapture`.
- No void dispatch.
- No checkout/session mutation.
- No persistent reconciliation finding table.
- No admin UI.
- No live provider enablement.

## 3. Current bridge marker inventory

Current durable provider-confirm markers written by `src/lib/payment/providers/confirm-bridge.ts`:

```text
PROVIDER_CONFIRM_TERMINAL
PROVIDER_CONFIRM_MANUAL_REVIEW
PROVIDER_CONFIRM_STOP
```

Current marker messages:

```text
PROVIDER_CONFIRM_TERMINAL -> Provider confirm ended with a terminal non-capture state.
PROVIDER_CONFIRM_MANUAL_REVIEW -> Provider confirm requires manual review.
PROVIDER_CONFIRM_STOP -> Provider confirm stopped for operator configuration review.
```

Current classification behavior:

- `RETRYABLE`: no marker, no terminal mutation, payment remains pending, confirm key preserved.
- `TERMINAL`: marker written and current `Payment.status = FAILED`.
- `MANUAL_REVIEW`: marker written, payment remains pending.
- `STOP`: marker written, payment remains pending.
- `PROGRAMMER_ERROR`: no marker today; keep out of the C2 detector until the bridge persists it.

Provider confirm failures do not enqueue void and do not create local order/completion effects.

## 4. Current C2 coverage gap

Current C2 reconciliation does not read:

- `Payment.errorCode`;
- `Payment.errorMessage`;
- `Payment.providerConfirmIdempotencyKey`;
- `Payment.providerRef`.

Current C2 reconciliation does not detect:

- stale provider confirm attempts;
- provider-confirm manual-review markers;
- provider-confirm stop markers;
- provider-confirm terminal markers.

Existing findings only indirectly overlap through local completion, order/session consistency, void outbox,
trusted webhook event, and webhook ingress rejection findings.

## 5. Finding classes to add

Add separate finding kinds:

```text
STALE_PROVIDER_CONFIRM_ATTEMPT
PROVIDER_CONFIRM_TERMINAL_FAILED
PROVIDER_CONFIRM_MANUAL_REVIEW
PROVIDER_CONFIRM_STOP
```

Do not add `PROVIDER_CONFIRM_PROGRAMMER_ERROR` until a durable bridge marker exists.

### STALE_PROVIDER_CONFIRM_ATTEMPT

- Source model: `Payment`, with `CheckoutSession` and optional `Order` relation only for IDs/absence.
- Query condition: pending payment with confirm key present, final provider payment key absent, no order, old enough by `staleProviderConfirmAfterMs`, and no current provider-confirm marker.
- Severity: `warning`.
- Recommended action: `WATCH_STALE`.
- Confidence: `medium`.
- Source IDs: `payment`, `checkoutSession`.
- Details fields: `paymentId`, `checkoutSessionId`, `provider`, `paymentStatus`, `errorCode`, `ageMs`, `hasProviderRef`, `hasProviderConfirmIdempotencyKey`, `hasProviderPaymentKey`, `hasOrder`.
- False-positive risk: long in-flight confirm, user abandonment, manual operator wait, or unrelated `updatedAt` changes.

### PROVIDER_CONFIRM_TERMINAL_FAILED

- Source model: `Payment`.
- Query condition: `Payment.errorCode = PROVIDER_CONFIRM_TERMINAL` and `Payment.status = FAILED`.
- Severity: `warning`.
- Recommended action: `ALERT_ONLY`.
- Confidence: `high`.
- Source IDs: `payment`, `checkoutSession`.
- Details fields: `paymentId`, `checkoutSessionId`, `provider`, `paymentStatus`, `errorCode`, `ageMs`, `hasProviderRef`, `hasProviderConfirmIdempotencyKey`, `hasProviderPaymentKey`, `hasOrder`.
- False-positive risk: low; this is a deliberate bridge marker. It is not automatically critical because terminal provider confirm means no capture evidence.

### PROVIDER_CONFIRM_MANUAL_REVIEW

- Source model: `Payment`.
- Query condition: `Payment.errorCode = PROVIDER_CONFIRM_MANUAL_REVIEW`.
- Severity: `critical`.
- Recommended action: `MANUAL_REVIEW`.
- Confidence: `high`.
- Source IDs: `payment`, `checkoutSession`.
- Details fields: `paymentId`, `checkoutSessionId`, `provider`, `paymentStatus`, `errorCode`, `ageMs`, `hasProviderRef`, `hasProviderConfirmIdempotencyKey`, `hasProviderPaymentKey`, `hasOrder`.
- False-positive risk: low; this is a deliberate bridge marker for ambiguous/provider-review state.

### PROVIDER_CONFIRM_STOP

- Source model: `Payment`.
- Query condition: `Payment.errorCode = PROVIDER_CONFIRM_STOP`.
- Severity: `critical`.
- Recommended action: `MANUAL_REVIEW`.
- Confidence: `high`.
- Source IDs: `payment`, `checkoutSession`.
- Details fields: `paymentId`, `checkoutSessionId`, `provider`, `paymentStatus`, `errorCode`, `ageMs`, `hasProviderRef`, `hasProviderConfirmIdempotencyKey`, `hasProviderPaymentKey`, `hasOrder`.
- False-positive risk: low; this is a deliberate bridge marker for operator/config stop state.

## 6. Query conditions

### STALE_PROVIDER_CONFIRM_ATTEMPT

Recommended condition:

```text
Payment.providerConfirmIdempotencyKey IS NOT NULL
Payment.providerPaymentKey IS NULL
Payment has no Order
Payment.status IN (INITIATED, AWAITING)
Payment.updatedAt older than staleProviderConfirmAfterMs
Payment.errorCode is null or not in provider-confirm marker set
```

`Payment.updatedAt` is the D1 approximation because there is no confirm-key timestamp.

Do not require `providerRef`, because the confirm key proves confirm orchestration started.

Exclude terminal `FAILED` payments.

False positives include long in-flight confirms, user abandonment, or unrelated `updatedAt` changes.

### PROVIDER_CONFIRM_TERMINAL_FAILED

Recommended condition:

```text
Payment.errorCode = PROVIDER_CONFIRM_TERMINAL
Payment.status = FAILED
```

### PROVIDER_CONFIRM_MANUAL_REVIEW

Recommended condition:

```text
Payment.errorCode = PROVIDER_CONFIRM_MANUAL_REVIEW
```

### PROVIDER_CONFIRM_STOP

Recommended condition:

```text
Payment.errorCode = PROVIDER_CONFIRM_STOP
```

## 7. Severity / action matrix

| Finding kind | Severity | Recommended action | Confidence |
|---|---|---|---|
| `STALE_PROVIDER_CONFIRM_ATTEMPT` | `warning` | `WATCH_STALE` | `medium` |
| `PROVIDER_CONFIRM_TERMINAL_FAILED` | `warning` | `ALERT_ONLY` | `high` |
| `PROVIDER_CONFIRM_MANUAL_REVIEW` | `critical` | `MANUAL_REVIEW` | `high` |
| `PROVIDER_CONFIRM_STOP` | `critical` | `MANUAL_REVIEW` | `high` |

Current `ReconciliationRecommendedAction` already contains `WATCH_STALE`, `ALERT_ONLY`, and
`MANUAL_REVIEW`, so no new action vocabulary is needed for this design.

## 8. Details / redaction policy

Finding details may include:

- `paymentId`;
- `checkoutSessionId`;
- `provider`;
- payment status;
- `errorCode`;
- `ageMs`;
- `hasProviderRef`;
- `hasProviderConfirmIdempotencyKey`;
- `hasProviderPaymentKey`;
- `hasOrder`.

Finding details must not include:

- full `providerRef`;
- full `providerConfirmIdempotencyKey`;
- full `providerPaymentKey` if avoidable;
- provider raw diagnostics;
- secrets;
- auth headers;
- raw provider payloads.

## 9. Layer placement

Add a small separate provider-confirm detector layer in a later implementation patch.

Possible file:

```text
src/lib/payment/reconciliation/provider-confirm.ts
```

Alternative if repo style prefers numbered layers:

```text
src/lib/payment/reconciliation/layer3.ts
```

Recommendation: use a named provider-confirm detector file unless the implementation review prefers
numbered layer consistency.

Rationale:

- `layer1` is local payment/order/session correctness.
- `layer2` is webhook/event/outbox/rejected-ingress taxonomy.
- Provider confirm markers are pre-capture provider-boundary action state.
- A separate layer is cleaner and easier to extend with future provider lookup.

## 10. Options / thresholds

Add a future option:

```text
staleProviderConfirmAfterMs
```

Recommended default:

```text
10 * 60_000
```

Do not reuse webhook stale thresholds even if the default matches; provider confirm staleness is a
different domain from webhook event staleness.

If the implementation exposes this option, the manual wrapper should expose:

```text
--stale-provider-confirm-ms
```

JSON output shape remains unchanged because findings are already summarized generically by kind,
severity, and recommended action.

## 11. No-mutation boundary

The detector must not call or import:

- `completeFromCapture`;
- `dispatchPending`;
- `createVoidHandler`;
- `transitionCheckoutSession`;
- `provider.confirm`;
- Toss adapter;
- PayPal adapter;
- provider APIs;
- Prisma `create`;
- Prisma `update`;
- Prisma `delete`;
- Prisma `updateMany`;
- Prisma `upsert`;
- Prisma `deleteMany`.

It should only read and return structured findings.

## 12. Manual report wrapper implication

- Existing wrapper counts arbitrary finding kinds by kind, severity, and recommended action.
- Wrapper should add `--stale-provider-confirm-ms` only if implementation exposes `staleProviderConfirmAfterMs`.
- Strict JSON output remains compatible.
- No repair flags should be added.

## 13. Test plan

Future implementation tests:

- provider confirm manual-review marker produces finding;
- provider confirm stop marker produces finding;
- provider confirm terminal marker produces finding;
- stale provider confirm attempt produces finding;
- recent provider confirm attempt does not produce stale finding;
- terminal failed provider confirm is not also stale;
- retryable pending with no marker can become stale;
- no `PROGRAMMER_ERROR` finding until marker exists;
- no mutation guard includes marker fields;
- wrapper counts new findings if seeded;
- no `lastError` parsing;
- no provider API calls.

## 14. Stop conditions

Stop implementation if:

- bridge markers are not durable enough;
- detector would need string parsing beyond exact `Payment.errorCode`;
- stale age cannot be approximated with current timestamps;
- implementation would require schema changes;
- implementation would require mutation or repair;
- wrapper JSON would need breaking changes;
- recommendedAction/severity enum cannot represent the matrix safely.

## 15. Recommended next step

Recommended next patch:

```text
C2 provider confirm detector extension patch
```

Implementation should:

- add the provider-confirm detector layer;
- add `staleProviderConfirmAfterMs`;
- add wrapper CLI option if needed;
- add tests;
- keep C2 report-only;
- avoid provider calls and mutation.
