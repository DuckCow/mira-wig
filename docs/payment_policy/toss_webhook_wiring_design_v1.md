# D1-D Toss Webhook Wiring Design v1

> Status: design lock, not implementation.
> Date: 2026-07-08.
> Scope: first real Toss webhook production wiring after the dormant query-verified provider module.

## 1. Status and Scope

This document locks the next safe sequence for bringing Toss query-verified webhook handling into production code for SANDBOX only.

It builds on `docs/payment_policy/d1c_provider_wiring_design_v1.md`, `docs/payment_policy/webhook_verified_mode_design_v1.md`, and the dormant provider module in `src/lib/payment/providers/toss/webhook.ts`.

It does not supersede D1-B or D1-C. It narrows the first wiring patch so real Toss webhook behavior is introduced without LIVE enablement, PayPal work, cancel/void/refund semantics, or async ingestion.

Provider-specific facts come from `docs/payment_policy/provider_docs_snapshot_v1.md`. Any provider behavior not confirmed there remains `OPEN`.

## 2. Current Repo Facts

- CURRENT FACT: `src/lib/payment/webhook/handle.ts` is still mock-verifier based.
- CURRENT FACT: current webhook parsing fills `CaptureFacts.mode` from `configuredPaymentMode()` as interim behavior.
- CURRENT FACT: current duplicate/replay handling reprocesses stored raw body without re-verification.
- CURRENT FACT: accepted webhook traffic is represented by `PaymentEvent`; rejected ingress is represented by `WebhookIngressRejection`.
- CURRENT FACT: `PaymentEvent` currently has no `verifiedMode` or `verifiedCredentialBinding`.
- CURRENT FACT: `PaymentEvent` identity is currently `@@unique([provider, transmissionId])`.
- CURRENT FACT: `WebhookIngressRejectionStage` currently supports `METADATA_EXTRACT` and `VERIFY`.
- CURRENT FACT: `Payment.mode` exists and completion already treats verified/capture mode vs `Payment.mode` mismatch as terminal void-less `MODE_MISMATCH`.
- CURRENT FACT: dormant Toss provider logic is pure and fake-port tested; it is not production-wired.
- CURRENT FACT: dormant Toss provider logic treats `PAYMENT_STATUS_CHANGED` as query-verified ordinary capture input and keeps `DEPOSIT_CALLBACK` out of scope.
- CURRENT FACT: dormant Toss provider logic warns that `CANCEL_STATUS_CHANGED` short-circuit is not a normal production `PaymentEvent` acceptance path.

## 3. Design Decisions

### A. Patch Sequence

- DECISION: the safe sequence is:
  1. D1-D docs lock: this document.
  2. Dormant real ports patch.
  3. SANDBOX-only production wiring patch.
- AMENDMENT NOTE: D1-D Patch 3 is split into Patch 3a (behavior-preserving webhook pipeline seam, no schema, no gates, no real Toss wiring) and Patch 3b (schema + real Toss SANDBOX wiring together). This preserves the rule that `verifiedMode` lands in the same patch as real verification.
- DECISION: the dormant real ports patch includes a Toss lookup HTTP port:
  - `GET /v1/payments/{paymentKey}`.
  - injected `fetchFn`.
  - `Promise.race` timeout.
  - injected authorization.
  - no environment reads.
  - no production wiring.
- DECISION: the dormant real ports patch includes a Prisma correlation resolver:
  - `paymentId -> checkoutSessionId`.
  - `null` means definitively absent, unknown, or not owned by Mira.
  - infrastructure errors throw.
  - no production wiring.
- DECISION: the SANDBOX-only production wiring patch includes:
  - production ingress dispatch.
  - replay restructure.
  - webhook verifier/parser capability registration.
  - real Toss lookup port.
  - Prisma correlation resolver.
  - `PaymentEvent.verifiedMode`.
  - `PaymentEvent.verifiedCredentialBinding`.
  - verified-vs-configured divergence defer.
- DESIGN RULE: reject standalone early patches for `PaymentEvent.verifiedMode` migration only, factory webhook scaffolding only, or full production wiring in one giant patch.

### B. PaymentEvent Provenance

- DECISION: `PaymentEvent.verifiedMode PaymentMode?` and `PaymentEvent.verifiedCredentialBinding String?` land only in the SANDBOX-only production wiring patch.
- DESIGN RULE: both fields are nullable.
- DESIGN RULE: do not backfill existing rows.
- DESIGN RULE: `NULL` means pre-verification/mock/interim era.
- DECISION: `verificationMethod` is not persisted in the first wiring patch unless later PayPal wiring proves it is needed.
- DECISION: `verifiedCredentialBinding` is persisted because replay after credential rotation needs stable binding provenance.

### C. Event Identity

- DECISION: keep current `@@unique([provider, transmissionId])` unchanged.
- DESIGN RULE: do not include nullable `verifiedMode` in the first unique index.
- RATIONALE: PostgreSQL treats `NULL` values as distinct, so nullable-mode identity could allow legacy `NULL` rows to escape dedup and silently weaken mock-era duplicate protection.
- DESIGN RULE: a duplicate whose persisted `verifiedMode` differs from the incoming verified mode is a VERIFY-stage `WebhookIngressRejection`, mode-collision anomaly, and manual-review case. It is never silent duplicate collapse.
- DESIGN RULE: this mode-collision condition is unreachable in real traffic for the first SANDBOX-only production wiring patch because only one Toss binding/mode exists, but the wiring patch must still implement the check with a synthetic-row test so the LIVE-binding patch cannot accidentally inherit silent collapse behavior.

### D. Ingress Dispatch

- DECISION: provider comes from the per-provider route path.
- DECISION: verified mode comes only from configured credential binding.
- DESIGN RULE: never trust webhook body, query, or headers for provider or mode.

### E. Credential Binding

- DECISION: first wiring is SANDBOX-only Toss binding:

```text
provider: TOSS
mode: SANDBOX
credentialBinding: "toss:sandbox:v1"
verificationMethod: QUERY_LOOKUP
```

- DESIGN RULE: `credentialBinding` is a stable opaque id, not an environment variable name.
- DESIGN RULE: no try-all-secrets behavior.
- DESIGN RULE: one binding equals one provider, one mode, and one verification method.
- DECISION: webhook verifier capability reuses `TOSS_SANDBOX_SECRET_KEY`.
- DESIGN RULE: do not invent a second Toss webhook secret name.
- DECISION: this intentionally closes D1-C's deferred webhook-verifier credential naming question for the first Toss SANDBOX webhook wiring. Reusing `TOSS_SANDBOX_SECRET_KEY` avoids drift between server-side Toss confirm/query credentials and webhook query-verification credentials; it does not open LIVE credential naming or PayPal naming.
- DECISION: webhook capability is gated by both:
  - a `WEBHOOK_VERIFIER` entry in the SANDBOX code registry.
  - provider-scoped `TOSS_SANDBOX_EXTERNAL_ENABLED=ENABLED`.
- DESIGN RULE: absent opt-in keys keep the current mock webhook path unchanged.

### F. ACK Budget

- DECISION: use inline lookup, record, and inline complete for the first SANDBOX wiring patch.
- DESIGN RULE: Toss webhook acknowledgement window is 10 seconds.
- DECISION: lookup timeout default is 3000 ms and must be injectable.
- DESIGN RULE: do not reuse the confirm adapter's 10000 ms timeout for webhook lookup.
- DECISION: no async ingestion or outbox in the first wiring patch.
- DECISION: Toss redelivery is the retry engine.
- DESIGN RULE: retryable failures return HTTP 500.
- DESIGN RULE: provider lookup timeout, provider lookup 5xx/non-2xx unavailable, or lookup-port infrastructure failure happens before `recordEvent`; therefore it records a VERIFY-stage `WebhookIngressRejection`, returns non-2xx, preferably HTTP 500/503 according to the final handler taxonomy, creates no `PaymentEvent` row, and relies on Toss redelivery to retry verification and re-run lookup.

### G. Per-Attempt Order

- DECISION: for Toss real wiring, process each attempt in this order:

```text
Toss metadata extraction
-> verify via provider lookup
-> recordEvent / dedup
-> verified-vs-configured mode divergence gate
-> parse
-> complete
```

- DESIGN RULE: current duplicate/replay behavior must be restructured because it reprocesses stored raw body without re-verification.
- DESIGN RULE: lookup-unavailable failures stop before `recordEvent`; `recordEvent / dedup` is reached only after provider lookup verification succeeds.
- DESIGN RULE: Toss query-verification replay must re-run lookup under the persisted verified credential binding.

### H. Divergence and Mismatch

- DECISION: verified mode vs current `configuredPaymentMode()` divergence records the event first, then marks `RETRYABLE_FAILED`.
- DECISION: divergence uses a distinct code such as `COMPLETE.MODE_DIVERGENCE`.
- DESIGN RULE: divergence returns HTTP 500, is retryable, is never terminal, and never manufactures facts from current config.
- DECISION: verified mode vs `Payment.mode` mismatch continues through the existing completion path as terminal void-less `MODE_MISMATCH`.
- DESIGN RULE: no new mismatch mechanism is required for verified mode vs `Payment.mode` in the first wiring patch.

### I. Replay and Credential Rotation

- DECISION: non-terminal duplicates re-run lookup under persisted `verifiedCredentialBinding`.
- DECISION: if the persisted binding is unavailable after credential rotation, defer retryably.
- DESIGN RULE: never fall back to current config for replay.
- DESIGN RULE: raw-hash duplicate guard remains unchanged.
- DESIGN RULE: legacy Toss rows with `verifiedMode = NULL` are not guessed into the verified path after real wiring is enabled.
- DESIGN RULE: duplicate rows with persisted `verifiedMode` different from incoming verified mode are rejected before reprocessing; they must not be reprocessed under current config.
- DECISION: legacy `NULL` Toss rows require manual review or another safe failure posture.

### J. CANCEL_STATUS_CHANGED and DEPOSIT_CALLBACK

- DECISION: in the first SANDBOX production wiring patch, `CANCEL_STATUS_CHANGED` is not accepted as a normal verified `PaymentEvent`.
- DECISION: in the first SANDBOX production wiring patch, `DEPOSIT_CALLBACK` is not accepted as a normal verified `PaymentEvent`.
- DECISION: both are recorded as `WebhookIngressRejection` with unsupported-event semantics and HTTP 200 acknowledgement.
- DECISION: production wiring changes the dormant verifier posture so unsupported cancel/deposit triggers return a verifier rejection with HTTP-200 ack intent, not verified trigger input.
- DESIGN RULE: this restores the invariant that `verified` means provider-corroborated.
- DESIGN RULE: use a distinct unsupported-event / acked-unsupported rejection code so ops dashboards do not count these as failed verification.
- DESIGN RULE: no `PaymentEvent` row, no provider lookup, no ordinary capture, no cancel/void/refund semantics, and no virtual-account/deposit semantics for these events.
- RATIONALE: the dormant verifier currently has a cancel short-circuit warning; production wiring resolves it by not treating unauthenticated cancel triggers as normal verified `PaymentEvent` rows.
- OPEN: `DEPOSIT_CALLBACK` must be revisited before any virtual-account feature.

### K. Unknown Toss Statuses

- DECISION: unknown Toss statuses remain ignored-with-reason in the first wiring patch.
- DESIGN RULE: ignored reason prefix must be operationally visible.
- OPEN: reconciliation visibility is a separate follow-up.
- FOLLOW-UP: add reconciliation layer2 `ALERT_ONLY` finding and spike detector for ignored events with reason prefix `TOSS_STATUS_`.

## 4. Hidden Assumptions and Failure Modes

- DESIGN RULE: do not assume a route path plus webhook body is verified provider/mode provenance.
- DESIGN RULE: do not persist current `PAYMENT_MODE` as verified mode.
- DESIGN RULE: do not let nullable verified-mode identity weaken existing duplicate protection.
- DESIGN RULE: do not replay query-verified events from stored raw body alone.
- DESIGN RULE: do not use current config after credential rotation to manufacture replay facts.
- DESIGN RULE: do not treat `CANCEL_STATUS_CHANGED` or `DEPOSIT_CALLBACK` as ordinary capture events.
- DESIGN RULE: do not conflate Toss ordinary payment query-verification with payout/seller HMAC verification.
- DESIGN RULE: do not treat SANDBOX wiring as LIVE readiness.

## 5. Required Tests

### A. Dormant Real Ports Patch

Toss lookup HTTP port tests:

- fake fetch success.
- timeout.
- non-2xx.
- malformed body.
- `paymentKey` URL-encoding and charset validation before path interpolation.
- authorization header shape without leaking real secret.
- sentinel secret non-leak.
- default timeout honored and injectable.
- no real fetch.

Prisma correlation resolver tests:

- hit.
- definitive miss returns `null`.
- wrong-provider payment returns `null`.
- database or infrastructure error throws and never returns `null`.

### B. SANDBOX Production Wiring Patch

- verified context supplies facts mode.
- current `PAYMENT_MODE` no longer supplies facts mode.
- verified-vs-configured divergence marks retryable defer and returns HTTP 500.
- verified mode vs `Payment.mode` mismatch becomes terminal void-less `MODE_MISMATCH`.
- replay re-runs lookup under persisted binding.
- duplicate event with persisted `verifiedMode` different from incoming verified mode creates a VERIFY-stage `WebhookIngressRejection`, with no silent duplicate collapse and no reprocessing under current config.
- lookup unavailable before `recordEvent` records a rejection, returns a non-2xx response, creates no `PaymentEvent` row, and later redelivery re-runs lookup.
- credential rotation or unavailable binding causes retryable defer.
- legacy `verifiedMode = NULL` row uses safe/manual-review posture.
- `CANCEL_STATUS_CHANGED` becomes acked unsupported rejection with HTTP 200, no `PaymentEvent` row, and no lookup.
- `DEPOSIT_CALLBACK` becomes acked unsupported rejection with HTTP 200, no `PaymentEvent` row, and no lookup.
- duplicate raw-hash guard remains unchanged.
- mock path remains unchanged when opt-in keys are absent.
- no external call happens unless all required webhook opt-in gates are enabled.

## 6. Out of Scope

- OUT OF SCOPE: LIVE webhook binding.
- OUT OF SCOPE: `liveEnabled` population.
- OUT OF SCOPE: PayPal.
- OUT OF SCOPE: void, cancel, or refund semantics.
- OUT OF SCOPE: `DEPOSIT_CALLBACK` validation.
- OUT OF SCOPE: reconciliation changes.
- OUT OF SCOPE: outbox or async ingestion.
- OUT OF SCOPE: `CheckoutSession.mode`.
- OUT OF SCOPE: Cart pricing P1-B.
- OUT OF SCOPE: `session.integration` parallel flake.
- OUT OF SCOPE: production live readiness.

## 7. References

- `docs/payment_policy/provider_docs_snapshot_v1.md`
- `docs/payment_policy/d1c_provider_wiring_design_v1.md`
- `docs/payment_policy/webhook_verified_mode_design_v1.md`
- `docs/payment_policy/d1b_adapter_boundary_design_v1.md`
- `src/lib/payment/providers/toss/webhook.ts`
- `src/lib/payment/webhook/handle.ts`
- `src/lib/payment/webhook/record.ts`
- `prisma/schema.prisma`
