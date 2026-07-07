# D1-C Provider Wiring Design v1

> Status: design lock, not implementation.
> Date: 2026-07-08.
> Scope: next provider wiring decisions after the Stage 1 provider factory seam.

## 1. Status and Relationship to Existing Locks

This document builds on the Stage 1 provider factory seam and on `docs/payment_policy/webhook_verified_mode_design_v1.md`.

It does not supersede D1-B. It narrows the next wiring decisions for real Toss/PayPal adapter and webhook work, while preserving the D1-B adapter boundary in `docs/payment_policy/d1b_adapter_boundary_design_v1.md`.

Provider-specific facts come from `docs/payment_policy/provider_docs_snapshot_v1.md`. Any provider-specific behavior not marked `CONFIRMED` there remains `OPEN` here.

## 2. Current Mira Boundary Assumptions

- The provider factory exists.
- Credential checks are presence-only and concrete credential names are deferred.
- `Payment.mode` exists.
- `PaymentEvent.verifiedMode` does not yet exist.
- Real webhook verifier/parser wiring is not implemented.
- No real Toss or PayPal adapter is wired.
- No `liveEnabled` routing registry entries are populated by this design.

## 3. Design Decisions

### A. Verified-by-Lookup Support

- DESIGN: `ProviderWebhookVerifier` must support verification that obtains authoritative provider state via an injected lookup/HTTP port.
- DESIGN: for lookup-verified providers, the webhook body is a trigger, not the authoritative capture source.
- DESIGN: parser or completion must receive authoritative state from the verifier without a second external call.
- DESIGN GAP: `ProviderVerifiedWebhookInput` currently carries the raw verified request/input but not an authoritative provider lookup result. Lookup-verified providers therefore require a future contract extension so authoritative provider state can flow from verifier to parser/completion without a second external call.
- OPEN/DESIGN: lookup-verified provider replay semantics are intentionally undecided. A retry/replay may either re-run the provider lookup or reuse a persisted authoritative lookup result. Re-running lookup gives fresh provider truth but performs an external call on each retry/replay. Reusing a persisted lookup result is deterministic but may become stale. This matters for deferred events such as `COMPLETE.CONFIG_UNAVAILABLE`, which may be retried much later. The Toss verifier patch must decide this explicitly; this document does not resolve it.
- TEST RULE: tests must inject fake lookup ports and must not perform external calls.
- CONFIRMED, Toss snapshot: Toss server-side code validates/finalizes payment state with the secret key, server must not trust client-provided amount/status/success, and general payment webhook handling should re-call the Payment Query API with `paymentKey`.
- DESIGN, Toss ordinary payment webhooks: treat `PAYMENT_STATUS_CHANGED` and `CANCEL_STATUS_CHANGED` as query-verified, not pure HMAC-signature verified.
- OPEN, Toss snapshot: `DEPOSIT_CALLBACK` is deferred to the virtual-account `secret` validation vs ordinary payment query-verification decision; do not resolve it here.
- DESIGN, Toss ordinary payment webhooks: authoritative state for `PAYMENT_STATUS_CHANGED` must come from `GET /v1/payments/{paymentKey}`, not blindly from the webhook body.
- DESIGN, Toss ordinary payment webhooks: payout/seller `tosspayments-webhook-signature` HMAC verification is a separate primitive and must not be conflated with ordinary payment webhook query-verification.
- CONFIRMED, Toss snapshot: if initial webhook delivery fails, Toss retries up to 7 times on a 1, 4, 16, 64, 256, 1024, and 4096 minute schedule, with the final retry about 3 days 19 hours after first delivery.
- DESIGN IMPLICATION: mira's current webhook handling runs verification and completion synchronously in the request. Toss query-verification adds an external provider lookup to that path. The Toss verifier patch must decide whether inline lookup plus completion fits the 10-second response budget, or whether ingress should acknowledge first and process asynchronously. This document does not decide that.
- DESIGN IMPLICATION: long retryable defers still need reconciliation or internal reentry visibility if they outlast Toss provider retry.

### B. Verified-by-Signature Support

- DESIGN: `ProviderWebhookVerifier` must also support signature/API-verification style providers such as PayPal.
- CONFIRMED, PayPal snapshot: PayPal provides `POST /v1/notifications/verify-webhook-signature`.
- CONFIRMED, PayPal snapshot: PayPal REST API uses OAuth 2.0 access tokens, obtained using client ID and client secret.
- DESIGN IMPLICATION: PayPal verify-signature requires an OAuth-authenticated provider API call or another official verification path.
- TEST RULE: tests must use fake verification ports and must not call PayPal.

### C. Verified Provider Context

- DESIGN: verified context must include provider, mode, credential binding/environment, and verification method.
- DESIGN: `CaptureFacts.mode` must come from verified context after real verification lands.
- DESIGN: configured `PAYMENT_MODE` may remain an act-now gate, but must not manufacture verified provider facts.
- REFERENCE: `docs/payment_policy/webhook_verified_mode_design_v1.md` owns the verified-mode persistence decision.

### D. Event Identity

- DESIGN: Toss and PayPal event identity must be decided before implementation.
- CURRENT FACT: `PaymentEvent` is currently unique on provider + transmission ID.
- DESIGN RISK: future mode or credential-environment scoping may be needed.
- DESIGN RULE: do not silently collapse sandbox/live event IDs.
- CONFIRMED, Toss snapshot: `tosspayments-webhook-transmission-id` is the native Toss webhook unique identifier.
- OPEN, Toss snapshot: whether mira event identity must include verified mode or credential environment in addition to provider + `tosspayments-webhook-transmission-id`.
- OPEN, PayPal snapshot: webhook ID separation by sandbox/live.

### E. Credential Requirements

- DESIGN: introduce provider/mode/capability dimensions later.
- DESIGN: capability examples include action adapter, webhook verifier, and void executor.
- DESIGN: credential checks remain presence-only at the factory boundary.
- DESIGN RULE: do not invent concrete credential environment variable names now.
- CONFIRMED, Toss snapshot: client key and secret key are a matched set; mixing non-matching keys or test/live keys causes `INVALID_API_KEY`.
- CONFIRMED, Toss snapshot: client key initializes the browser SDK and secret key is used for server API calls.
- DESIGN, Toss credentials: credential requirement design must account for matched browser client key + server secret key pairs, without naming concrete environment variables yet.
- DESIGN CAVEAT, Toss credentials: factory credential checks are presence-only and cannot prove client/secret key pair consistency. Toss validates pair consistency at provider call time, so the future Toss credential/error normalization patch must handle `INVALID_API_KEY` without introducing concrete environment variable names here.
- OPEN, Toss snapshot: exact live key prefix and concrete credential environment variable naming.
- OPEN, PayPal snapshot: webhook ID separation by sandbox/live and OAuth token caching/lifetime behavior.

### F. Implementation Order

Recommended order, subject to official-doc gap closure:

1. Toss docs snapshot update.
2. Toss confirm adapter design/implementation.
3. Toss query-verifier contract and authoritative-state design.
4. Toss webhook verifier implementation.
5. PayPal order/adapter design.
6. PayPal webhook verification.

This order is not live readiness. If official docs contradict it, revisit the order before implementation.

## 4. Hidden Assumptions and Failure Modes

- False provenance if configured mode is stored as verified mode.
- Webhook body trusted instead of the provider lookup result.
- Duplicate identity collision across sandbox/live.
- Environment variable presence enabling LIVE without registry `liveEnabled`.
- PayPal OAuth or verify API failure incorrectly treated as terminal payload failure.
- Toss ordinary payment webhook treated as HMAC-signature verified without an official ordinary-payment signature mechanism.
- Provider-specific error codes normalized from guesses instead of official taxonomy.
- Credential names or live key prefixes invented before official docs review.

## 5. Required Future Tests

- Fake lookup port injection.
- Facts come from lookup result, not webhook body.
- Signature/API verification success and failure.
- Verified mode vs `Payment.mode` mismatch.
- Verified mode vs configured mode retryable defer.
- Event identity and cross-mode duplicate behavior.
- Redaction of credential values.
- No external network in tests.
- Environment variable presence cannot enable LIVE without registry `liveEnabled`.
- PayPal OAuth/verification transport failure is retryable/non-terminal when appropriate.
- Toss lookup failure is classified separately from malformed provider payload.

## 6. Out of Scope

- Source changes.
- Schema changes.
- Real adapters.
- Real webhook verification.
- Credential environment variable names.
- `liveEnabled` population.
- `PaymentEvent.verifiedMode` migration.
- Provider API calls.
- Webhook verifier/parser factory wiring.
- Void executor factory wiring.

## 7. References

- `docs/payment_policy/provider_docs_snapshot_v1.md`
- `docs/payment_policy/webhook_verified_mode_design_v1.md`
- `docs/payment_policy/d1b_adapter_boundary_design_v1.md`
