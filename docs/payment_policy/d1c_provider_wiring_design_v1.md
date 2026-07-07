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
- DECISION, Toss replay semantics: re-run the Toss lookup on each retry/replay for the first query-verified verifier. This gives fresh provider truth across Toss's retry window and across deferred states such as `COMPLETE.CONFIG_UNAVAILABLE`, at the cost of one external provider call per replay. Persisting an authoritative lookup result would be deterministic but can become stale, so it is not the first verifier default.
- DESIGN RULE: replay/retry lookup must run under the event's verified credential binding, never the currently configured `PAYMENT_MODE`; otherwise an env flip or credential rotation could query the wrong provider environment and manufacture facts under the wrong mode.
- TEST RULE: tests must inject fake lookup ports and must not perform external calls.
- CONFIRMED, Toss snapshot: Toss server-side code validates/finalizes payment state with the secret key, server must not trust client-provided amount/status/success, and general payment webhook handling should re-call the Payment Query API with `paymentKey`.
- DESIGN, Toss ordinary payment webhooks: treat `PAYMENT_STATUS_CHANGED` and `CANCEL_STATUS_CHANGED` as query-verified, not pure HMAC-signature verified.
- OPEN, Toss snapshot: `DEPOSIT_CALLBACK` is deferred to the virtual-account `secret` validation vs ordinary payment query-verification decision; do not resolve it here.
- DESIGN, Toss ordinary payment webhooks: authoritative state for `PAYMENT_STATUS_CHANGED` must come from `GET /v1/payments/{paymentKey}`, not blindly from the webhook body.
- DESIGN, Toss ordinary payment webhooks: payout/seller `tosspayments-webhook-signature` HMAC verification is a separate primitive and must not be conflated with ordinary payment webhook query-verification.
- CONFIRMED, Toss snapshot: if initial webhook delivery fails, Toss retries up to 7 times on a 1, 4, 16, 64, 256, 1024, and 4096 minute schedule, with the final retry about 3 days 19 hours after first delivery.
- OPEN, 10-second ACK budget: mira's current webhook handling runs verification and completion synchronously in the request, while Toss query-verification adds an external provider lookup to that path. The Toss verifier patch must decide whether inline lookup plus completion fits the 10-second response budget, or whether ingress should acknowledge first and process asynchronously. This closes only with measured fake-port timeout tests plus a design choice for provider latency/error behavior; this document does not decide it.
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
- OPEN, Toss identity criteria: before real verification or `PaymentEvent.verifiedMode`, decide whether mira event identity must include verified mode or credential environment in addition to provider + `tosspayments-webhook-transmission-id`. Keep current identity only if official docs/recon prove the transmission ID cannot collide across sandbox/live credential environments feeding the same table; otherwise scope identity by verified mode or credential environment. This aligns with `webhook_verified_mode_design_v1.md`.
- OPEN, PayPal snapshot: webhook ID separation by sandbox/live.

### E. Credential Requirements

- DESIGN: introduce provider/mode/capability dimensions later.
- DESIGN: credential requirement tables must be keyed by provider, mode, and capability.
- DESIGN: credential names must be mode-scoped.
- DESIGN: required capabilities include at least action adapter, webhook verifier, and void executor.
- DESIGN: credential checks remain presence-only at the factory boundary.
- DESIGN RULE: do not invent concrete credential environment variable names now.
- CONFIRMED, Toss snapshot: client key and secret key are a matched set; mixing non-matching keys or test/live keys causes `INVALID_API_KEY`.
- CONFIRMED, Toss snapshot: client key initializes the browser SDK and secret key is used for server API calls.
- DESIGN, Toss credentials: credential requirement design must account for matched browser client key + server secret key pairs, without naming concrete environment variables yet.
- DESIGN CAVEAT, Toss credentials: factory credential checks are presence-only and cannot prove client/secret key pair consistency. Toss validates pair consistency at provider call time, so the future Toss credential/error normalization patch must handle `INVALID_API_KEY` without introducing concrete environment variable names here.
- CONFIRMED, Toss snapshot: live API secret keys start with `live_sk` or `live_gsk`.
- OPEN, Toss snapshot: exact live client key prefix and concrete credential environment variable naming.
- OPEN, PayPal snapshot: webhook ID separation by sandbox/live and OAuth token caching/lifetime behavior.

### F. SANDBOX Adapter Selection Policy

- DECISION: `TOSS + SANDBOX` stays mock-backed by default.
- DECISION: external SANDBOX provider calls require two independent opt-in keys.
- Code key: a reviewed code-registry entry keyed by provider, `mode = SANDBOX`, and capability. Capability examples include action adapter, webhook verifier, and void executor.
- Deployment key: a provider-scoped deployment environment opt-in. The concrete environment variable name remains deferred with credential naming, and the key is absent by default everywhere.
- DESIGN RULE: neither key alone enables external provider calls.
- DESIGN RULE: credential presence never substitutes for either key.
- DESIGN RULE: credential checks are evaluated only after both opt-in keys pass.
- DESIGN RULE: invalid `PAYMENT_MODE` already fails closed rather than silently defaulting; half-configured sandbox external intent must likewise fail closed rather than quietly returning mock success.

Resolution semantics:

| Code key | Deployment key | Credentials / adapter | Result |
|---|---|---|---|
| absent | absent | ignored | Use mock. This is the permanent default. |
| present | absent | ignored | Typed fail-closed error, sanitized to `PROVIDER_UNAVAILABLE` at the action boundary; never silent mock. |
| absent | present | ignored | Typed fail-closed error, sanitized to `PROVIDER_UNAVAILABLE`; never silent mock. |
| present | present | SANDBOX credentials missing | Typed fail-closed error; no external call. |
| present | present | SANDBOX credentials present + registered adapter | External provider test-key adapter may be selected; still no LIVE behavior. |

Representation decision:

- This is adapter selection under existing `PaymentMode.SANDBOX`.
- Do not add a third `PaymentMode` enum member such as `PROVIDER_SANDBOX`.
- Mock vs provider-test may be represented as internal adapter selection or diagnostic state only.
- The `mock:` `providerPaymentKey` prefix remains the current data discriminator for mock-created rows.
- No schema change is needed for this policy.

Scope and interaction:

- LIVE gating is untouched.
- The two-key opt-in is evaluated only inside the factory SANDBOX branch.
- `ProviderFactoryContext` shape remains unchanged.
- Existing `TOSS + SANDBOX` mock-backed tests remain permanent default-invariant tests.
- Future real Toss test-key adapter tests should be added beside the default mock tests, not by weakening them.
- Mechanism code lands with or immediately before the Toss adapter patch; do not implement the mechanism earlier as dead config.
- Toss confirm adapter wiring must not silently replace mock SANDBOX behavior.

### G. Toss Status and Error Mapping

Payment status table:

| Toss status | Mira provisional category | Decision state |
|---|---|---|
| `READY` | ignored / pending | OPEN: no capture fact until authoritative status becomes final. |
| `IN_PROGRESS` | ignored / pending | OPEN: no capture fact until approval completes. |
| `WAITING_FOR_DEPOSIT` | ignored / pending | OPEN: virtual-account flow and `DEPOSIT_CALLBACK` remain separate. |
| `DONE` | capture success | DECIDED for query-verified `PAYMENT_STATUS_CHANGED` when amount/currency/provider key match. |
| `CANCELED` | future_void or ignored, depending on local payment/order state | OPEN: must not create duplicate success. |
| `PARTIAL_CANCELED` | future_refund | OPEN until refund/partial-cancel handling exists. |
| `ABORTED` | terminal failure or ignored, depending on local payment/order state | OPEN: safe default is fail-closed/manual review for unknown transitions. |
| `EXPIRED` | terminal failure or ignored, depending on local payment/order state | OPEN: safe default is fail-closed/manual review for unknown transitions. |
| unknown/unconfirmed | manual review / fail closed | DECIDED safe posture. |

Error normalization table:

| Toss error group | Official examples | Mira provisional category |
|---|---|---|
| Credential/config | `INVALID_API_KEY`, `UNAUTHORIZED_KEY`, `INCORRECT_BASIC_AUTH_FORMAT` | OPEN: likely provider unavailable/auth config failure; exact normalized code must be locked in Toss adapter patch. |
| Temporary/provider/system | `PROVIDER_ERROR`, `COMMON_ERROR`, `FAILED_INTERNAL_SYSTEM_PROCESSING`, `FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING`, `UNKNOWN_PAYMENT_ERROR` | OPEN: likely retryable or manual review depending operation and ambiguity. |
| Customer/payment decline | `REJECT_CARD_PAYMENT`, `REJECT_ACCOUNT_PAYMENT`, `REJECT_CARD_COMPANY`, `INVALID_REJECT_CARD`, `FDS_ERROR` | OPEN: likely terminal/manual review split. |
| Request/programmer/input | `INVALID_REQUEST`, `BELOW_MINIMUM_AMOUNT`, `INVALID_CARD_INSTALLMENT_PLAN`, `NOT_SUPPORTED_MONTHLY_INSTALLMENT_PLAN` | OPEN: distinguish user-correctable, programmer error, and provider-terminal cases. |
| Not found/state mismatch | `NOT_FOUND_PAYMENT`, `NOT_FOUND_PAYMENT_SESSION`, `ALREADY_PROCESSED_PAYMENT`, `ALREADY_CANCELED_PAYMENT` | OPEN: operation-specific idempotency/state handling needed. |
| Cancel/refund constraints | `NOT_CANCELABLE_PAYMENT`, `NOT_CANCELABLE_AMOUNT`, `NOT_ALLOWED_PARTIAL_REFUND`, `EXCEED_CANCEL_LIMIT`, `EXCEED_MAX_REFUND_DUE` | OPEN: belongs to future void/refund taxonomy. |

Complete Toss error normalization remains OPEN. Unknown or unmapped Toss statuses/errors must keep the safe manual-review / fail-closed posture.

### H. Implementation Order

Recommended order, subject to official-doc gap closure:

1. Toss docs snapshot update.
2. Toss SANDBOX external-adapter opt-in mechanism, with or immediately before real Toss test-key adapter wiring.
3. Toss confirm adapter design/implementation.
4. Toss query-verifier contract and authoritative-state design.
5. Toss webhook verifier implementation.
6. PayPal order/adapter design.
7. PayPal webhook verification.

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
- External Toss test-key calls introduced into default SANDBOX behavior without explicit opt-in.

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
- Toss SANDBOX stays mock-backed unless an explicit adapter opt-in test enables external test-key behavior.
- Unknown Toss statuses/errors fail closed or route to manual review without leaking provider internals.
- SANDBOX opt-in key matrix uses injected fake env: no keys -> mock, code key only -> fail closed, env key only -> fail closed, both keys + missing credentials -> fail closed, both keys + credentials + adapter -> external adapter selected.
- Sentinel-port test proves no accidental external calls in every non-fully-enabled SANDBOX row.
- Existing `TOSS + SANDBOX` mock tests remain green and unchanged as default-invariant tests.
- Half-configured SANDBOX opt-in errors are sanitized and do not expose environment variable names or values.
- LIVE path is unaffected by any SANDBOX opt-in combination.

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
- Actual SANDBOX opt-in mechanism code.
- Toss confirm adapter.
- Concrete credential environment variable names.
- Credential requirement table content.
- Toss test-key acquisition/operator setup.
- Webhook-capability SANDBOX opt-in wiring.
- `liveEnabled` population.
- PayPal work.

## 7. References

- `docs/payment_policy/provider_docs_snapshot_v1.md`
- `docs/payment_policy/webhook_verified_mode_design_v1.md`
- `docs/payment_policy/d1b_adapter_boundary_design_v1.md`
