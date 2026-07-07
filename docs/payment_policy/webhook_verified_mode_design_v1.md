# Webhook Verified Mode Design v1

> Status: design lock, not an implementation patch.
> Date: 2026-07-07.
> Scope: future verification-derived webhook mode before real Toss/PayPal webhook verification.

## 1. Status and Scope

This document locks the future design for deriving webhook event mode from real provider verification.

It does not require a current schema change, source change, provider API change, live allowlist change, or test change.

Current `CaptureFacts.mode` is filled from `configuredPaymentMode()` only as an interim source for the mock/no-real-verification phase. That interim source is not evidence of provider event mode and must not be treated as verified provenance.

This document governs future real webhook verification work for Toss, PayPal, and any later provider that feeds payment completion through webhook events.

## 2. Current Repo Facts

- `Payment.mode` exists and is pinned when the payment attempt is created.
- `CaptureFacts.mode` exists and is checked against `Payment.mode` during completion.
- `MODE_MISMATCH` is terminal but void-less.
- Webhook invalid `PAYMENT_MODE` config failures are retryable and must not terminally consume a provider event.
- Accepted webhook traffic is represented by `PaymentEvent`.
- Rejected inbound traffic is represented by `WebhookIngressRejection`.
- `PaymentEvent` is created only after verification/ingress acceptance.
- `PaymentEvent` currently has no verified mode field.

## 3. Core Invariant

After real webhook verification lands, the source of webhook event mode is the verified provider context, not current `PAYMENT_MODE`.

Required chain:

```text
credential environment / verifier binding
-> verified provider context
-> verified event mode
-> CaptureFacts.mode
-> comparison with Payment.mode
```

`PAYMENT_MODE` may express current deployment intent, but it must not manufacture facts about an already authenticated provider event.

## 4. Future Contract

Mode concepts in this design:

- configured mode = current deployment intent from `PAYMENT_MODE`
- adapter/verifier mode = the mode a factory-built adapter/verifier was constructed for, derived from `ProviderFactoryContext.mode`
- verified event mode = the mode proven by the verified provider context

When real verification lands, the verified variant of `ProviderWebhookVerificationResult` must include explicit verified context.

That context should include at least:

- provider
- mode
- credential environment or credential binding identifier
- enough provider/key identity to support deterministic replay and audit

`CaptureFacts.mode` must be filled from this verified context.

`configuredPaymentMode()` must stop being the source of webhook fact mode. It may remain an act-now gate if the future implementation keeps deployment-intent checks, but that is separate from fact derivation.

## 5. Persistence Decision

Do not add `PaymentEvent.verifiedMode` now.

Add `PaymentEvent.verifiedMode PaymentMode?` in the same patch that wires real verification.

Rules:

- The field must be nullable.
- Existing pre-verification rows should remain `NULL`.
- `NULL` means pre-verification/mock/interim era, not SANDBOX.
- Do not backfill configured mode into verified mode.
- Avoid false provenance.

Persisting verified mode before real verification exists would imply evidence the system does not yet have.

## 6. Act-Now Gate vs Fact Source

After real verification:

Verified event mode vs `Payment.mode` mismatch:

- terminal `MODE_MISMATCH`
- void-less
- no duplicate success
- no void dedup-slot poisoning

Verified event mode vs current configured `PAYMENT_MODE` mismatch:

- retryable defer, similar to `COMPLETE.CONFIG_UNAVAILABLE`
- do not process the event while deployment intent diverges
- do not terminally consume the event

This retryable defer only self-heals if the provider redelivers the event or the system otherwise re-enters processing. `RETRYABLE_FAILED` does not by itself guarantee self-healing. If mode divergence outlasts provider retry windows, events may strand. Future work needs reconciliation visibility or an internal reentry mechanism, but this document does not implement that mechanism.

Current configured mode may remain an act-now gate. It must not be a source of webhook facts.

## 7. Ambiguity Policy

A webhook must not silently "try all secrets and infer" a mode.

One verifier/credential binding should correspond to one provider + mode context.

If an event appears to verify under multiple credential contexts, reject it as an ambiguity/integrity anomaly. Do not choose one arbitrarily.

Record this as `WebhookIngressRejection` at the `VERIFY` stage. No `PaymentEvent` row should be created for a multi-credential ambiguity.

## 8. Replay and Duplicate Policy

Replay should be deterministic after credential rotation.

Once `PaymentEvent.verifiedMode` exists, replay should use the persisted verified context/mode rather than current config.

Existing legacy rows with `verifiedMode = NULL` may use current interim behavior until a real verification migration strategy defines otherwise.

Duplicate handling should preserve existing raw body/hash safety.

Current repo identity for accepted webhook events is unique on `(provider, transmissionId)`. The real verification patch must explicitly resolve whether accepted event identity/dedup remains provider-scoped or must include verified mode / credential environment. Do not prescribe a schema change now. The risk is that sandbox and live credential environments feeding the same table could collide on `transmissionId`; such a collision could be misclassified as duplicate/raw mismatch and make an authentic event unprocessable.

## 9. Required Tests for Future Implementation

Future real verification work must include behavior tests for:

- verified context supplies `CaptureFacts.mode`
- configured mode no longer supplies fact mode
- verified mode vs `Payment.mode` mismatch -> terminal void-less `MODE_MISMATCH`
- verified mode vs current configured mode mismatch -> retryable defer
- replay after credential rotation uses persisted verified mode/context
- `verifiedMode = NULL` legacy behavior
- multi-credential ambiguity creates a VERIFY-stage ingress rejection
- multi-credential ambiguity creates no `PaymentEvent` row
- duplicate/raw-hash behavior unchanged

## 10. Out of Scope

- real Toss/PayPal verification implementation
- real provider adapters
- live allowlist population
- credential loading policy
- `WebhookIngressRejection` forensic enhancements
- reconciliation mode-based classification
- `CheckoutSession` mode

## 11. References

- `docs/payment_policy/payment_policy_confirmed_v6.md`
- `docs/payment_policy/payment_policy_open_v6.md`
- `docs/payment_policy/d1b_adapter_boundary_design_v1.md`
- Current payment behavior: `Payment.mode` persistence, `CaptureFacts.mode`, terminal void-less `MODE_MISMATCH`, retryable webhook config failures, accepted `PaymentEvent`, rejected `WebhookIngressRejection`.
