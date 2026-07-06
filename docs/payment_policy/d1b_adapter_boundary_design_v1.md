# D1-B adapter boundary design v1

> Status: design lock input, not an implementation patch.
> Date: 2026-07-07.
> Baseline: `main` pushed/clean, handoff v18, D1-A provider selection complete, verify baseline 20 files / 287 tests.
> Scope: provider adapter boundary before real Toss or PayPal adapters.

## 1. Purpose

D1-A answered: `Which provider should be selected?`

D1-B answers: `What contract must a selected provider adapter implement?`

This document locks the D1-B adapter boundary so Toss and PayPal do not grow incompatible shapes. It is the design layer between provider selection and real provider implementation.

Terminology:

- Design lock: this document.
- Implementation patch: future local TypeScript types, fake adapters, and contract tests.
- Real provider adapter: future Toss/PayPal HTTP integration after official-doc and sandbox validation.
- Live enablement: future operational step gated by explicit LIVE allowlist and production credentials.

## 2. Non-goals

- No real Toss or PayPal API implementation.
- No provider API calls.
- No live credential wiring.
- No schema change in this design doc.
- No DB-backed routing table.
- No settlement, fees, or FX reconciliation.
- No execution-time cross-PG fallback.
- No production live enablement.
- No claim that provider-specific docs are fully verified by this document.

## 3. Current state summary

Current `src/lib/payment/providers/types.ts` defines a narrow `PaymentProvider` port:

- `initiate(input) -> { kind: "ready" } | { kind: "redirect"; approveUrl?; providerRef? }`
- `confirm(input) -> { providerPaymentKey; amount; currency; capturedAt? }`

Current gaps:

- Void/cancel is separate in `src/lib/payment/void/` as `VoidExecutor`.
- Webhook verification and parsing live in `src/lib/payment/webhook/`, but `handleWebhook` is still mock-wired.
- Refund, settlement, provider status lookup, provider health, fees, and FX routing are missing.
- `src/lib/payment/providers/resolve.ts` still returns mock provider implementations for every provider code.
- D1-A routing selects a provider from market, method, currency, amount, and mode, but the server action currently uses `PaymentMode.SANDBOX`.
- C2-I1 separates trusted authenticated provider events (`PaymentEvent`) from rejected inbound (`WebhookIngressRejection`).
- `Payment.provider` pins the selected provider for a payment attempt.
- `Payment` does not persist payment method, provider mode, routing rule id, or pre-capture provider reference.
- Pending payments keep `providerPaymentKey = null`, and B2 alpha uses that null value to claim pending attempts.

## 4. Recommended D1 boundaries

D1 should use several small provider-facing ports. Do not build one provider object that owns every lifecycle concern.

Required D1 ports:

```ts
interface PaymentProvider {
  code: PaymentProviderCode;
  initiate(input: ProviderInitiateInput): Promise<ProviderInitiateResult>;
  confirm(input: ProviderConfirmInput): Promise<ProviderConfirmResult>;
}

interface ProviderAdapterFactory {
  createPaymentProvider(input: ProviderFactoryInput): PaymentProvider;
  createWebhookVerifier(input: ProviderFactoryInput): WebhookVerifier;
  createWebhookParser(input: ProviderFactoryInput): WebhookParser;
  createVoidExecutor(input: ProviderFactoryInput): VoidExecutor;
}

interface WebhookVerifier {
  verify(raw: RawWebhookRequest): Promise<WebhookVerificationResult>;
}

interface WebhookParser {
  parse(input: VerifiedWebhookInput): Promise<NormalizedWebhookEvent>;
}

interface VoidExecutor {
  void(input: VoidExecutorInput): Promise<VoidExecutorResult>;
}
```

D2/later unless a D1 official-doc finding proves otherwise:

- `RefundProvider`
- `SettlementProvider`
- `ProviderStatusLookup`
- `ProviderHealth`
- `Fee/FxRouting`

Exception: a minimal `ProviderStatusLookup` may be pulled into D1 only if confirm/capture timeout semantics cannot be made safe through provider idempotency and webhook re-entry alone.

## 5. Normalized initiate result

Normalized initiate must describe what the provider created without implying capture happened.

```ts
type ProviderInitiateResult =
  | {
      kind: "ready";
      provider: PaymentProviderCode;
      idempotencyKey: string;
      providerRef?: string;
      providerOrderId?: string;
      providerPaymentId?: string;
      diagnostics?: RedactedProviderDiagnostics;
    }
  | {
      kind: "redirect";
      provider: PaymentProviderCode;
      approveUrl: string;
      idempotencyKey: string;
      providerRef?: string;
      providerOrderId?: string;
      providerPaymentId?: string;
      diagnostics?: RedactedProviderDiagnostics;
    };
```

Rules:

- `approveUrl` is returned only for redirect/approval flows.
- `providerRef` is the provider-side pre-capture reference if one exists.
- `providerOrderId` and `providerPaymentId` are explicit aliases when provider docs distinguish them.
- `idempotencyKey` is the outbound key actually used for initiate.
- Diagnostics are redacted, bounded, and safe for logs/tests.
- The adapter must report whether `providerRef` must be persisted before confirm.

Current concern: reusing `Payment.providerPaymentKey` while a payment is pending is unsafe. The current alpha path claims pending attempts with `providerPaymentKey = null`, and `(provider, providerPaymentKey)` uniqueness means this field is currently the post-capture identity, not the pre-capture reference.

## 6. ProviderRef persistence decision

This is the highest-risk D1-B design issue.

### Option A. Persist providerRef on `Payment` by adding a new field later

Safety: strongest. It preserves `providerPaymentKey` as post-capture identity and gives initiate/confirm/webhook a stable pre-capture reference.

Compatibility with pending payment claiming: good. Existing pending claim rules can keep requiring `providerPaymentKey = null`.

PayPal order-id style flows: good. A PayPal order id can be stored without pretending it is a capture id.

Toss payment-key/order-id style flows: good. If Toss exposes a pre-confirm reference, store it separately from final captured key.

Webhook correlation: improved. Parser can correlate by `providerRef` when providerPaymentKey is absent or delayed.

Confirm retry/idempotency: improved. Confirm key can be derived from local payment id plus providerRef where required.

Migration cost: moderate. Requires schema and migration later, but avoids semantic overload.

### Option B. Reuse `providerPaymentKey` before capture

Safety: weak. It overloads one column with two meanings.

Compatibility with pending payment claiming: poor. Current alpha finds pending attempts with `providerPaymentKey = null`.

PayPal order-id style flows: risky if order id and capture id differ.

Toss payment-key/order-id style flows: risky if the provider distinguishes request/order/payment/capture identifiers.

Webhook correlation: ambiguous.

Confirm retry/idempotency: ambiguous.

Migration cost: low now, high cleanup risk later.

### Option C. Store providerRef in metadata/JSON

Safety: medium. It avoids overloading `providerPaymentKey`, but the schema currently has no metadata field on `Payment`.

Compatibility with pending payment claiming: good if separate from `providerPaymentKey`.

PayPal order-id style flows: workable.

Toss payment-key/order-id style flows: workable.

Webhook correlation: weaker than typed fields unless indexed and validated.

Confirm retry/idempotency: workable but less explicit.

Migration cost: moderate. Adds a JSON field and later indexing questions.

### Option D. Do not persist providerRef; rely on client roundtrip

Safety: weak for real providers. Browser/client state can be lost or tampered with, and webhook-first recovery becomes harder.

Compatibility with pending payment claiming: no schema impact.

PayPal order-id style flows: fragile if confirm needs the provider-created order id.

Toss payment-key/order-id style flows: depends on provider details and should not be assumed.

Webhook correlation: poor.

Confirm retry/idempotency: weak.

Migration cost: none now, but likely forces later redesign.

### Option E. Defer real initiate adapters until schema decision

Safety: strongest operationally.

Compatibility with pending payment claiming: preserves current behavior.

PayPal order-id style flows: blocks unsafe implementation until reference semantics are known.

Toss payment-key/order-id style flows: blocks unsafe implementation until reference semantics are known.

Webhook correlation: unchanged.

Confirm retry/idempotency: unchanged.

Migration cost: none now.

Recommendation: adopt Option A as the design direction, and enforce Option E as a stop condition until the schema decision is accepted. Do not implement real initiate adapters while providerRef persistence is unresolved. Do not reuse `providerPaymentKey` as the pre-capture reference.

## 7. Normalized confirm/capture result

Confirm/capture should return a normalized provider result, not throw arbitrary provider errors into the server action.

```ts
type ProviderConfirmResult =
  | ProviderConfirmSucceeded
  | ProviderConfirmFailed;

interface ProviderConfirmSucceeded {
  kind: "succeeded";
  provider: PaymentProviderCode;
  providerPaymentKey: string;
  amountMinor: number;
  currency: string;
  capturedAt?: Date;
  providerTimestamp?: Date;
  rawProviderStatus: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  idempotencyKey: string;
  diagnostics?: RedactedProviderDiagnostics;
}

interface ProviderConfirmFailed {
  kind: "failed";
  classification: ProviderFailureClass;
  normalizedCode: ProviderErrorCode;
  providerErrorCode?: string;
  safeMessage: string;
  httpStatus?: number;
  ambiguousProviderState: boolean;
  providerLookupRequired: boolean;
  diagnostics?: RedactedProviderDiagnostics;
}
```

`CaptureFacts` remains the inner core input to `completeFromCapture`. Provider result normalization happens before `completeFromCapture`, then success is reduced to:

- `checkoutSessionId`
- `provider`
- `providerPaymentKey`
- `amount`
- `currency`
- `capturedAt?`
- `receivedAt`

Provider diagnostics and raw status must not leak into `CaptureFacts`; they belong at the adapter/action/webhook boundary or future durable diagnostics if explicitly designed.

## 8. Confirm/capture idempotency

Current issue: `PaymentConfirmInput` has no outbound idempotency key. Real adapters must not invent unstable keys.

Candidate keys:

- Existing local `capture:{provider}:{providerPaymentKey}`: good after the provider payment key is known, but often too late for outbound confirm.
- Pre-capture providerRef based key: good when confirm/capture operates on a provider-created order/reference.
- Checkout session/payment id based key: stable and available locally, but must avoid reusing the same key for distinct provider operations.
- Provider header constraints: unknown until official-doc verification; D1 types must allow a transformation layer.

Recommendation:

- Use a local canonical key with operation prefix and stable local/payment/provider identity.
- For initiate: keep `initiate:{sessionId}:{uuid}`.
- For confirm/capture: use a deterministic D1 key such as `confirm:{provider}:{paymentId}` when confirming an existing local payment, or `confirm:{provider}:{providerRef}` when official provider flow requires providerRef and it is persisted.
- For webhook-first local capture, keep local alpha key `capture:{provider}:{providerPaymentKey}` as a DB idempotency key only, not an outbound header.
- For void/cancel: keep `void:{provider}:{providerPaymentKey}` from outbox dedup/operationKey.
- Transform/sanitize canonical keys before provider headers if Toss `Idempotency-Key` or PayPal `PayPal-Request-Id` has length/charset constraints. Do not hash secrets into these keys.

Stop: do not implement real confirm/capture until outbound idempotency key source and provider header mapping are tested with fake HTTP clients.

## 9. Webhook boundary

Provider-specific webhook code must plug into the common C2-I1 ingress model without weakening it.

Responsibilities before common completion:

- Preserve raw request body exactly as read by `request.text()`.
- Extract metadata candidates before trust: candidate transmission/event id, candidate event type, and bounded diagnostic info.
- Verify signature/identity using provider-specific official rules.
- Extract trusted event/transmission id after verification.
- Map provider event type into normalized event categories.
- Parse into normalized capture, ignored, and future void/refund events.
- Record rejected inbound attempts in `WebhookIngressRejection`, not `PaymentEvent`.
- Record authenticated events in `PaymentEvent`.
- Preserve duplicate semantics: terminal duplicate is 2xx/no reprocess, non-terminal duplicate reprocesses stored authenticated raw, raw mismatch writes rejected inbound.
- Preserve response-code policy: verify/metadata failure non-2xx, retryable completion non-2xx, parsed local terminal completion 2xx, ignored 2xx.
- Provider-specific retry semantics must be verified against official docs before changing response policy.

Current implementation requirement: later `handleWebhook` must accept provider-specific verifier/parser dependencies. It must stop hard-wiring `createMockWebhookVerifier()` and `parseMockWebhook` before real webhooks are enabled.

Suggested normalized parser result:

```ts
type NormalizedWebhookEvent =
  | { kind: "capture"; facts: CaptureFacts; diagnostics?: RedactedProviderDiagnostics }
  | { kind: "ignored"; reason: string; diagnostics?: RedactedProviderDiagnostics }
  | { kind: "future_void"; providerPaymentKey: string; reason: string }
  | { kind: "future_refund"; providerPaymentKey: string; refundRef: string };
```

Only `capture` and `ignored` are D1. Future void/refund events are typed here only to avoid parser shape drift; do not implement their local effects in D1.

## 10. Void/cancel boundary

Real void/cancel must expand the current two-outcome result.

```ts
type VoidExecutorResult =
  | { kind: "succeeded" }
  | { kind: "idempotent_succeeded"; providerStatus?: string }
  | { kind: "retryable"; normalizedCode: ProviderErrorCode; safeMessage: string }
  | { kind: "terminal"; normalizedCode: ProviderErrorCode; safeMessage: string }
  | { kind: "manual_review"; normalizedCode: ProviderErrorCode; safeMessage: string }
  | { kind: "auth_stop"; normalizedCode: ProviderErrorCode; safeMessage: string }
  | { kind: "invalid_request_stop"; normalizedCode: ProviderErrorCode; safeMessage: string }
  | { kind: "ambiguous_state"; normalizedCode: ProviderErrorCode; safeMessage: string };
```

Rules:

- Input remains provider, providerPaymentKey, operationKey, and reason.
- `operationKey` maps to the provider idempotency header through a provider-specific transformation.
- Already canceled for the same capture should be idempotent success if official docs/sandbox confirm it.
- Already refunded or state mismatch is manual review or ambiguous until provider behavior is verified.
- Auth/credential failures are D-stage stops, not hot retries.
- Invalid request/programmer errors are stops, not hot retries.
- Duration must be measured around the provider call.
- `OUTBOX_ZOMBIE_AFTER_MS` is 5 minutes. Real adapter rollout must prove external operation duration plus safety margin is below that threshold or change the lease/zombie model first.
- `VOID-HOOK-DEBT` must be resolved before real void goes live. `createVoidHandler` currently exposes `transitionPayment` injection that appears test-hook-like; it must be removed, documented as a legitimate composition seam, or otherwise contained before real side effects.

## 11. Provider error taxonomy

Normalized D1 classes:

- `retryable_network_or_provider`: timeout, network failure, provider 5xx, temporary unavailable, retryable rate limit. Local handling: retryable action result or outbox retry.
- `terminal_provider_or_user`: declined, expired approval, canceled approval, non-retryable provider state. Local handling: user-safe failure, no automatic completion.
- `idempotent_success`: already captured or already canceled for the same operation. Local handling: treat as success and continue local convergence.
- `manual_review`: ambiguous state, already refunded, provider/local mismatch, unclear duplicate. Local handling: no blind retry if repeated side effect risk exists; surface to reconciliation/operator.
- `d_stage_stop`: credential/auth failure, missing required env, LIVE mode without allowlist, official-doc ambiguity. Local handling: fail closed and stop rollout.
- `programmer_error`: malformed adapter input, impossible local state, unsupported currency/method after D1-A selection. Local handling: fail fast, test coverage, no provider retry loop.

Provider error messages must be redacted before leaving the adapter boundary. Safe diagnostics may include provider code, safe status string, HTTP status, request id, and bounded message. Do not log secrets, tokens, auth headers, webhook signatures, full raw secret-bearing payloads, or client secrets.

## 12. Sandbox/live environment boundary

Adapter factory safety rules:

- Mode comes from D1-A provider resolution, not from ad hoc provider code.
- LIVE adapter creation requires explicit D1-A LIVE allowlist for market, provider, method, and currency.
- Mock is never eligible in LIVE.
- Unknown market must fail closed.
- Resolver/factory must refuse LIVE without required provider credentials for that mode.
- Current env names are ambiguous: Toss has single key names, PayPal has `PAYPAL_ENV` but single credential names. Do not infer safety from variable presence alone.
- Sandbox and LIVE credential validation must be explicit in the factory.
- A real adapter must not be created in LIVE merely because env vars exist.
- Secret redaction is mandatory in logs, errors, tests, and diagnostics.
- `.env` secrets must not be printed. `.env.example` names are documentation only.

Factory input should include at least:

```ts
interface ProviderFactoryInput {
  provider: PaymentProviderCode;
  mode: PaymentMode;
  market: string;
  method: PaymentMethod;
  currency: string;
  ruleId: string;
  liveEnabled: boolean;
}
```

The factory may read process env internally, but tests should inject a fake env object so no real secrets are required.

## 13. Contract test strategy

The later D1-B contract patch should add tests before any real provider calls.

Required tests:

- Fake HTTP client adapter tests for initiate and confirm/capture.
- Idempotency header mapping tests for initiate, confirm/capture, and void/cancel.
- Error normalization tests for retryable, terminal, idempotent success, manual review, stop, and programmer error.
- Sandbox/live guard tests, including LIVE without allowlist and mock in LIVE.
- Webhook verifier/parser fixture tests using official sample payloads later.
- Webhook dependency-injection tests proving common core no longer hard-wires mock verifier/parser.
- Void executor taxonomy tests with stubbed provider responses.
- Duration/zombie-margin tests with fake timers or measured fake calls.
- No external provider calls in normal `npm run verify`.
- No real secrets in tests. Use fake env and fake HTTP.

## 14. Stop conditions

Stop before real provider adapter implementation if any of these remains true:

- ProviderRef persistence is undecided or unimplemented for flows that require it.
- Confirm/capture outbound idempotency is undecided.
- Sandbox/live env separation is ambiguous.
- Webhook verification model is unclear or still mock-wired.
- `VOID-HOOK-DEBT` is unresolved for real void.
- Provider-specific official docs are ambiguous or not yet checked.
- Tests require real provider API calls to pass.
- Provider adapters would need incompatible Toss/PayPal shapes.
- A provider response can mean "unknown whether money moved" without a lookup/retry policy.
- Error messages would expose secrets or unsafe raw provider payloads.

## 15. Recommended next step

Recommended next step: D1-B contract patch with types, fake adapters, and contract tests only.

Why:

- This document already chooses the boundary direction and rejects overloaded `providerPaymentKey`.
- A contract patch can lock normalized result shapes, factory guards, idempotency mapping, webhook dependency injection, and void taxonomy without real API calls.
- Fake adapters keep `npm run verify` deterministic and provider-call-free.
- Real Toss/PayPal work should wait until official-doc deep dives and sandbox tests validate the contract.

Precondition for real initiate adapters after the contract patch: accept and implement the providerRef persistence decision, preferably a dedicated field rather than reusing `providerPaymentKey`.

