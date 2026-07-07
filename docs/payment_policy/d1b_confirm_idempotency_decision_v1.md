# D1-B confirm/capture outbound idempotency decision v1

> Status: design decision, not an implementation patch.
> Date: 2026-07-07.
> Baseline: `main` pushed/clean, handoff v23, D1-A provider selection complete, D1-B provider adapter contract complete, providerRef persistence/write complete, verify baseline 23 files / 305 tests.
> Scope: outbound confirm/capture idempotency before real Toss or PayPal adapters.

## 1. Purpose

D1-B identified another real-provider blocker:

```text
confirm/capture outbound idempotency is not modeled yet.
```

ProviderRef persistence now gives the system a durable place for provider-side pre-capture object references, but confirm/capture still lacks a stable outbound provider request key.

The core problem:

```text
Real provider confirm/capture calls need a stable outbound idempotency key before final providerPaymentKey exists.
Current confirm flow does not load the local Payment before calling provider.confirm.
```

This document turns the confirm/capture outbound idempotency recon into a concrete design decision. It decides the local operation key, where the exact key should be persisted, and what remains blocked before real Toss/PayPal confirm/capture adapters.

## 2. Non-goals

- No migration in this document.
- No code implementation.
- No real Toss adapter implementation.
- No real PayPal adapter implementation.
- No provider API calls.
- No live credential wiring.
- No provider-specific header implementation.
- No webhook implementation.
- No void implementation.
- No settlement, fees, or FX work.
- No execution-time cross-PG fallback.
- No provider-specific guarantee that has not been verified against official Toss or PayPal docs.

## 3. Current confirm flow

Current behavior:

- `confirmPayment` starts in `src/app/actions/payment.ts`.
- It validates provider, market, session ownership, and selected payment method.
- It resolves the current provider through `resolveProvider`.
- `resolveProvider` still returns mock-backed providers for every provider code.
- It calls `provider.confirm`.
- Before `provider.confirm`, it does not load or claim a local `Payment`.
- `provider.confirm` receives:
  - checkout session id;
  - provider code;
  - optional `providerPaymentKey`;
  - amount;
  - currency.
- `provider.confirm` does not receive `payment.id`.
- `provider.confirm` does not receive `Payment.idempotencyKey`.
- `provider.confirm` does not receive `providerRef`.
- `provider.confirm` does not receive a deterministic outbound confirm key.
- `providerPaymentKey` is learned from provider confirm output.
- Final `providerPaymentKey` is persisted later through `recordCapture`.
- `recordCapture` first uses the unique `(provider, providerPaymentKey)` identity, then claims a pending local attempt by `checkoutSessionId`, `provider`, pending status, and `providerPaymentKey = null`.

Today, provider retryable failures are represented by thrown provider errors caught at the action boundary and translated to `PROVIDER_RETRYABLE` with `retryable: true`. The current production path is still mock-bounded and does not issue real provider confirm/capture HTTP calls.

## 4. Idempotency inventory

Current local identities:

| Identity | Current source | Classification | Notes |
|---|---|---|---|
| `Payment.idempotencyKey = initiate:{sessionId}:{uuid}` | `src/lib/payment/attempt/initiate.ts` | outbound initiate idempotency / local payment-attempt identity | Passed to provider initiate. It is initiate-attempt oriented and must not be reused for confirm/capture. |
| `(provider, providerPaymentKey)` | `Payment` unique constraint | local DB final capture identity | Final post-capture provider payment identity. Available only after provider capture/approval identity is known. |
| `capture:{provider}:{providerPaymentKey}` | `recordCapture` fallback create path | local DB idempotency | Used for webhook/API-first local capture rows after final provider key exists. Not an outbound provider header. |
| `void:{provider}:{providerPaymentKey}` | completion compensation and void handler | outbox dedup / void operation key | Post-capture void/cancel identity. Not usable before final provider key exists. |
| `(provider, transmissionId)` | `PaymentEvent` unique constraint | webhook replay protection | Trusted only after webhook verification. Inbound replay identity, not outbound confirm idempotency. |
| `Payment.providerRef` | provider initiate result | provider object correlation | Pre-capture provider-side object/reference. Nullable and non-unique; not the primary idempotency identity. |

None of the existing local keys is currently the outbound provider confirm/capture key.

## 5. Decision

Decision:

```text
Add a future nullable unique Payment.providerConfirmIdempotencyKey.
Use canonical local operation key confirm:{provider}:{payment.id}.
Persist the exact outbound confirm/capture idempotency key before or at first provider confirm/capture call.
Do not reuse Payment.idempotencyKey.
Do not use providerPaymentKey or capture:{provider}:{providerPaymentKey}.
Do not use providerRef as the primary idempotency source.
```

This is a design decision only. The schema migration, Prisma client update if required, code changes, fake-provider flow changes, and tests come in a later implementation patch.

Real Toss/PayPal confirm/capture adapters remain blocked until this decision is implemented or explicitly superseded by a reviewed design.

## 6. Field semantics

Future field:

```prisma
providerConfirmIdempotencyKey String? @unique
```

Semantics:

- Model: `Payment`.
- Type: nullable string.
- Unique when present.
- No existing-row backfill required.
- Write time: once, before or at the first outbound provider confirm/capture attempt for the local payment attempt.
- Read time: every confirm/capture retry, including retry after process restart.
- Exposure: server-side operation key only, not user-facing.
- It stores the exact local outbound confirm/capture idempotency key used by the server.
- It is distinct from `Payment.idempotencyKey`.
- It is distinct from local post-capture `capture:{provider}:{providerPaymentKey}`.
- It is distinct from `providerRef`.

The field should not be updated to a different value for the same local payment attempt. If a row already has a non-null value, confirm/capture must reuse it.

## 7. Canonical key formula

Canonical local operation key:

```text
confirm:{provider}:{payment.id}
```

Rationale:

- Available before capture once confirm loads the local `Payment`.
- Stable across retries.
- Stable across process restarts.
- Unique across multiple attempts in one checkout session because each attempt has a distinct `Payment.id`.
- Provider-scoped and readable for diagnostics.
- Does not depend on final `providerPaymentKey`.
- Works even if `providerRef` is missing.
- Clearly separates confirm/capture from initiate, local capture, void, and webhook replay keys.

Provider-specific adapters may transform this key to satisfy official header constraints. The local canonical key must remain stable. If provider-specific transformation is lossy or creates a separate provider request identity, that requires an explicit later decision before real adapters.

## 8. Options rejected

Rejected:

- Reusing `Payment.idempotencyKey`: it is currently initiate-attempt oriented for initiated payments and local capture oriented for webhook/API-first rows.
- Using `checkoutSessionId`: a checkout session can have multiple payment attempts, so this would collide across attempts.
- Using `providerRef` as the primary idempotency identity: it is nullable, non-unique, provider-scoped semantics are not fully verified, and it is an object reference rather than the local operation identity.
- Using `providerPaymentKey`: it is the final captured/approved provider payment identity and may not exist before confirm/capture.
- Using `capture:{provider}:{providerPaymentKey}`: it is local DB idempotency after capture, too late for outbound confirm/capture.
- Deriving a non-persisted key without storing the exact key used: this is weaker for audit, retry after deployment changes, and provider header transformation.
- Waiting until real Toss/PayPal adapter implementation to decide: that would risk incompatible adapter shapes and unsafe retry behavior.

## 9. Confirm flow change required later

Future implementation must change confirm to load or claim the local pending `Payment` before the provider call.

The future implementation should:

- Identify the pending local `Payment` for the checkout session and selected provider.
- Ensure there is a stable `payment.id` before provider confirm/capture.
- Create or reuse `providerConfirmIdempotencyKey`.
- Pass `payment.id`, `providerRef`, and `providerConfirmIdempotencyKey` to the provider boundary.
- Call provider confirm/capture.
- Normalize provider success or failure before calling completion.
- Map success into `CaptureFacts`.
- Never mint a different confirm idempotency key for the same local payment attempt.

This confirm-flow patch is future work. It is not part of this decision document.

Implementation must also decide what to do if no pending local payment exists. The current mock action supports confirm without initiate and `recordCapture` can create a captured row from final provider facts. Real provider confirm/capture should not invent an outbound key from only `checkoutSessionId`; it should either require a local payment attempt or use a separately reviewed API-first flow.

## 10. Provider header mapping

Future real adapters should map the local key to provider-specific headers such as:

- Toss `Idempotency-Key`.
- PayPal `PayPal-Request-Id`.

Exact provider constraints must be verified against official provider docs before implementation. Required official-doc checks include header name, accepted length, accepted charset, replay window, operation scoping, conflict behavior, and whether the same header namespace is shared across create/confirm/capture/void operations.

Rules:

- Provider-specific length and charset transforms belong in adapters.
- The local canonical key should remain stable even if the provider header value is transformed.
- If transformation is lossy, a provider request id or hash field may be needed later.
- Diagnostics may include safe/redacted request id information.
- Do not print or log auth headers, signatures, raw secret-bearing payloads, provider tokens, or client secrets.
- `.env.example` names are documentation only. Actual `.env` secrets must not be printed.

## 11. Failure and retry semantics

Expected behavior:

- Network timeout before provider response: retry with the same `providerConfirmIdempotencyKey`.
- Provider 5xx: retry with the same key.
- Retryable provider rate limit: retry with the same key after policy-governed backoff.
- Provider says already captured: treat as idempotent success only if provider identity, amount, currency, and captured/approved state match the intended operation.
- Provider idempotency conflict: STOP or manual review; do not retry with a new key.
- Local completion fails after provider capture succeeds: do not re-confirm with a new key. Re-enter local completion from the known provider capture facts, webhook, or reconciliation path.
- Process restart: reload and reuse persisted `providerConfirmIdempotencyKey`.
- Webhook-first capture: use the local capture path and do not misuse the outbound confirm key.
- Multiple browser confirm submissions: converge on the same pending payment and the same confirm key.

C1/C2 coverage already helps local convergence after a captured fact exists. It does not replace outbound provider idempotency before the provider response is known.

## 12. Relationship to providerRef

Rules:

- Confirm idempotency should not require `providerRef` as its source.
- Real provider confirm may still require `providerRef` as the provider object reference.
- Missing `providerRef` should block real provider flows that require it.
- Fake/mock providers may continue without `providerRef`.
- Confirm should not look up payment by `providerRef` alone because it is nullable and non-unique.
- If official provider flow requires a provider-created object reference, confirm should load and validate `Payment.providerRef`, then pass it to the provider adapter as object identity, not as the primary idempotency key.

Meaning split:

```text
providerRef = provider-side pre-capture object/reference for the payment attempt
providerConfirmIdempotencyKey = local outbound confirm/capture operation idempotency key
providerPaymentKey = final captured/approved provider payment identity
```

## 13. Future migration plan

Migration name suggestion:

```text
d1b_confirm_idempotency_key
```

Expected Prisma model change:

```prisma
model Payment {
  // existing fields...
  providerConfirmIdempotencyKey String? @unique
}
```

Migration properties:

- Nullable-safe for existing rows.
- No backfill required.
- Existing `providerRef` data remains unchanged.
- Existing `providerPaymentKey` data remains unchanged.
- Existing `Payment.idempotencyKey` data remains unchanged.
- Generated Prisma client update if repo convention requires it.
- Normal verify should remain provider-API-free.

Affected tests should be focused on schema shape, confirm action/fake provider behavior, idempotent retry behavior, and preservation of existing local completion/webhook/void behavior.

Verify expectation for the implementation patch:

```text
npx prisma validate
npm run verify
```

## 14. Future test plan

Required tests when implementing the schema/action patch:

- Confirm loads pending local payment before provider call.
- Repeated confirm uses the same persisted key.
- Retryable provider failure preserves key.
- Local completion failure after provider success does not change key.
- Different payment attempts in the same checkout session get different keys.
- Different providers get different keys.
- Key does not depend on final `providerPaymentKey`.
- ProviderRef missing behavior is explicit.
- Webhook-first capture does not require outbound confirm key.
- Confirm without a pending local payment is explicitly accepted only for mock/fake or explicitly rejected for real provider flow.
- Provider adapter receives `payment.id`, `providerRef`, and `providerConfirmIdempotencyKey` when applicable.
- No real provider API calls are made in normal verify.

## 15. Stop conditions before real adapters

Stop before real Toss/PayPal adapters if any of these remains true:

- `providerConfirmIdempotencyKey` is not implemented.
- Confirm still does not load local `Payment` before provider call.
- Provider-specific header constraints are unverified.
- ProviderRef requirement for real confirm is undocumented.
- Webhook verifier/parser injection is not wired.
- Sandbox/live credential separation is not implemented.
- Real void taxonomy and `VOID-HOOK-DEBT` are unresolved.
- Tests require real provider calls.
- Provider idempotency conflict behavior is unknown.
- Provider already-captured behavior cannot be safely normalized.
- A provider response can mean "unknown whether money moved" without a lookup, retry, webhook, or manual-review policy.

## 16. Recommended next step

Recommended next implementation step:

```text
D1-B confirm idempotency schema + fake-provider confirm flow patch
```

Scope for that patch:

- Add nullable unique `Payment.providerConfirmIdempotencyKey`.
- Update confirm to load the local pending `Payment` before provider call.
- Write or reuse `confirm:{provider}:{payment.id}` before or at first outbound confirm/capture.
- Pass `payment.id`, `providerRef`, and the persisted confirm idempotency key to the provider boundary.
- Add fake/mock-only tests.
- Keep real Toss/PayPal HTTP calls out of normal verify.

Do not start real Toss/PayPal adapters until this patch is reviewed and the provider-specific official-doc header constraints are verified.
