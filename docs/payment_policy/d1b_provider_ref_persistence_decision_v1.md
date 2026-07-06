# D1-B providerRef persistence decision v1

> Status: design decision, not an implementation patch.
> Date: 2026-07-07.
> Baseline: `main` pushed/clean, handoff v19, D1-A provider selection complete, D1-B adapter boundary design complete, verify baseline 20 files / 287 tests.
> Scope: durable representation of provider-side pre-capture references before real Toss or PayPal initiate adapters.

## 1. Purpose

D1-B adapter boundary design identified a gap:

```text
Real providers may return a pre-capture provider reference before final capture.
Current schema has no durable place for that reference.
```

This document turns the providerRef recon into a concrete design decision. It decides where a provider-side pre-capture reference belongs, what it means, and what must remain blocked until the persistence migration exists.

The decision protects the current completion invariant: local completion, webhook processing, void, outbox, and reconciliation all treat `providerPaymentKey` as the final post-capture provider payment identity.

## 2. Non-goals

- No migration in this document.
- No real Toss adapter implementation.
- No real PayPal adapter implementation.
- No provider API calls.
- No live enablement.
- No webhook implementation change.
- No void implementation change.
- No settlement, fees, or FX work.
- No execution-time cross-PG fallback.
- No provider-specific guarantee that has not been verified against official Toss or PayPal docs.

## 3. Current lifecycle and invariant

Current lifecycle:

- `Payment` is created during initiate in `src/lib/payment/attempt/initiate.ts`.
- `Payment.provider` stores the selected provider code.
- `Payment.providerPaymentKey` remains `null` while the payment is `INITIATED` or `AWAITING`.
- The provider initiate port may return `providerRef`, but the current initiate flow does not persist it.
- `confirmPayment` calls the provider and maps provider output into `CaptureFacts`.
- `recordCapture` first checks the unique `(provider, providerPaymentKey)` identity.
- If no captured row exists, `recordCapture` claims a pending local attempt by `checkoutSessionId`, `provider`, pending status, and `providerPaymentKey = null`.
- If no pending local attempt exists, webhook/API-first capture creates a succeeded local `Payment` with `idempotencyKey = capture:{provider}:{providerPaymentKey}`.
- Final completion guards check `providerPaymentKey`, amount, currency, session state, and capture window.
- Terminal completion failure enqueues `pg.void` with `void:{provider}:{providerPaymentKey}`.
- Webhook processed state and reconciliation also record or inspect final `providerPaymentKey`.

Invariant:

```text
providerPaymentKey must mean final provider payment/capture identity, not pre-capture provider object identity.
```

This invariant is load-bearing. Overloading `providerPaymentKey` before capture would break or confuse pending attempt claiming, completion guards, webhook processed records, void deduplication, void payload validation, and reconciliation confidence.

## 4. Decision

Decision:

```text
Add a future nullable `Payment.providerRef` field for provider-side pre-capture references.
Do not reuse `providerPaymentKey`.
Do not store providerRef on CheckoutSession.
Do not rely on client roundtrip only for real providers.
```

This is a design decision only. The schema migration, Prisma client update, code changes, and tests come in a later implementation patch.

Real Toss/PayPal initiate adapters remain blocked until this persistence decision is implemented or explicitly superseded by a reviewed design.

## 5. Field semantics

Future field:

- Model: `Payment`.
- Field name: `providerRef`.
- Type: nullable string.
- Meaning: provider-side pre-capture object/reference for this payment attempt.
- Write time: after provider initiate succeeds and returns a provider reference, before the server treats the initiate response as durably recoverable.
- Read time:
  - confirm retry;
  - redirect recovery;
  - webhook correlation when a provider event references a pre-capture object;
  - provider status lookup later, if needed;
  - diagnostics and reconciliation.
- Exposure: server-side operational field only, not a user-facing id.

Meaning split:

- `providerRef` = pre-capture provider object/reference for a local `Payment` attempt.
- `providerPaymentKey` = final captured/approved provider payment identity.

`providerRef` is attempt-scoped. It must not live on `CheckoutSession`, because one checkout session can have multiple payment attempts and the selected provider/reference can differ per attempt.

## 6. Index / uniqueness recommendation

Do not invent provider uniqueness guarantees.

Recommended first migration shape:

```text
Add nullable `Payment.providerRef`.
Add a non-unique lookup index scoped by provider, such as `(provider, providerRef)`.
```

Rationale:

- PostgreSQL allows multiple `NULL` values in normal unique constraints, but null handling alone does not solve provider semantics.
- ProviderRef uniqueness may be scoped by provider account, sandbox/live mode, merchant, object type, or official provider rules that are not verified in this document.
- The schema does not yet persist sandbox/live mode.
- Multiple attempts per checkout session are allowed.
- Duplicate initiate retry behavior is not fully designed.
- A false unique guarantee could block valid retries or cross-mode data.

If official provider docs later guarantee uniqueness across the persisted scope, a provider-scoped unique constraint can be reconsidered. If `providerMode` is added in the same migration and official docs require mode/account scoping, use that scope in the constraint rather than assuming `(provider, providerRef)` is globally unique.

Until uniqueness is proven, code that correlates by `providerRef` must handle zero, one, or many rows. Ambiguous matches must fail closed or move to manual review; they must not silently complete a payment.

## 7. Related audit fields

Potential fields:

- `providerMode`.
- `paymentMethod`.
- `routingRuleId`.
- `routingVersion`.
- `providerConfirmIdempotencyKey`.

Decision by field:

- `providerMode`: high value and recommended for the same schema patch if sandbox/live rows can coexist in the same database, or if providerRef uniqueness/correlation needs mode scope. Live enablement remains blocked without durable sandbox/live separation.
- `providerConfirmIdempotencyKey`: directly related to real confirm/capture safety and recommended before real confirm/capture adapters. It should store the actual outbound confirm/capture idempotency key once first used.
- `paymentMethod`: useful for audit, CS, and product debugging, but not required to solve providerRef persistence. Defer unless the D1-B schema patch already touches provider selection audit.
- `routingRuleId`: useful for audit/debug because D1-A already produces rule IDs, but not required to persist providerRef safely. Defer unless routing audit is explicitly included in the next patch.
- `routingVersion`: useful only if routing rules become versioned/configurable. Defer for now.

Minimum hard gate for real initiate adapters: `Payment.providerRef`.

Hard gate before real confirm/capture adapters: deterministic outbound confirm/capture idempotency, preferably with persisted `providerConfirmIdempotencyKey` if any retry may cross process boundaries or provider header mapping may change.

## 8. Confirm/capture idempotency decision

Current `Payment.idempotencyKey` is not a safe outbound confirm/capture key.

Current meanings:

- For initiated payments, `Payment.idempotencyKey` is generated as `initiate:{sessionId}:{uuid}` and is passed to provider initiate.
- For webhook/API-first captures, local capture creates `idempotencyKey = capture:{provider}:{providerPaymentKey}`.
- The local `capture:{provider}:{providerPaymentKey}` key is DB idempotency after the final provider payment key is known. It is too late for outbound confirm/capture.

Decision:

- Keep `Payment.idempotencyKey` as the existing local payment-attempt idempotency key. Do not reuse it for outbound confirm/capture.
- Use a separate deterministic confirm/capture operation key.
- Default key source for normal local-payment confirm: `confirm:{provider}:{payment.id}`.
- If official provider flow requires a provider-created reference, load and validate `Payment.providerRef`; pass it as the provider object reference, not as a replacement for local payment identity.
- Persist the actual outbound key in future `Payment.providerConfirmIdempotencyKey` before or at first confirm/capture attempt if retries need durable exact header reuse.
- Keep webhook-first local capture idempotency as `capture:{provider}:{providerPaymentKey}`. This remains local DB idempotency only, not an outbound provider header.

Provider-specific header names, accepted length/charset, replay window, and operation scoping still require Toss/PayPal official documentation and fake HTTP contract tests before real adapters.

## 9. Options rejected

Rejected:

- Reusing `providerPaymentKey`: breaks the final-payment identity invariant and pending local claim rule.
- Storing providerRef only in JSON metadata: less explicit, harder to index, harder to validate, and weaker for contract tests.
- Storing providerRef on `CheckoutSession`: wrong scope because provider references belong to a payment attempt.
- Client-roundtrip-only providerRef: unsafe for real providers because browser state can be lost or tampered with, and webhook-first recovery becomes weaker.
- Provider-specific general field names such as `providerOrderId`: too narrow as the common contract; providers may expose order, session, intent, payment, or authorization identifiers with different meanings.
- Proceeding with real initiate adapters before the providerRef persistence migration.

Deferred, not rejected:

- Provider-specific secondary reference fields, if official docs prove that separate order/capture/authorization ids need durable first-class fields later.
- Durable provider status lookup, unless confirm timeout semantics force it earlier.
- Settlement, fees, FX, refunds, and provider health.

## 10. Future migration plan

Migration name suggestion:

```text
d1b_provider_ref_persistence
```

Expected Prisma model changes:

```prisma
model Payment {
  // existing fields...
  providerRef                   String?
  providerConfirmIdempotencyKey String? @unique

  @@index([provider, providerRef])
}
```

If `providerMode` is included in the same patch, prefer a durable enum instead of free text:

```prisma
enum PaymentProviderMode {
  SANDBOX
  LIVE
}

model Payment {
  // existing fields...
  providerMode PaymentProviderMode?

  @@index([provider, providerMode, providerRef])
}
```

The exact uniqueness constraint for `providerRef` remains deferred until official provider docs prove the right scope. If a unique constraint is added later, it should include all required provider/account/mode dimensions and should not rely on an unstored concept.

Migration properties:

- Nullable-safe for existing rows.
- No existing data backfill required.
- Existing `providerPaymentKey` data remains unchanged.
- Existing `Payment.idempotencyKey` data remains unchanged.
- Prisma client generation will be required in the implementation patch.
- Normal verify should remain provider-API-free.

Expected implementation areas:

- Initiate persistence updates `Payment.providerRef` when provider initiate returns one.
- Action or adapter result shape must not expose providerRef as a user-facing identifier.
- Confirm loads the local payment and uses persisted providerRef where required.
- Confirm writes or reuses `providerConfirmIdempotencyKey` deterministically.
- Webhook parser/correlation can use providerRef only in provider-specific, ambiguity-safe paths.
- Reconciliation may report pending/awaiting rows with providerRef in diagnostics later.

## 11. Test plan for future implementation

Required tests when the migration/code patch is implemented:

- Initiate persists `providerRef` when the fake provider returns it.
- `providerPaymentKey` remains `null` until capture.
- Pending local claim still works with `providerPaymentKey = null`.
- Confirm can load and use persisted providerRef.
- Repeated confirm uses a stable outbound idempotency key.
- The actual outbound confirm/capture idempotency key is persisted or deterministically reproduced exactly as designed.
- Webhook can correlate pre-capture providerRef where a fake provider event is designed to use it.
- Ambiguous duplicate providerRef behavior matches the index/constraint decision and fails closed.
- Webhook/API-first capture without providerRef still works through final `providerPaymentKey`.
- Void dedup and void payload validation continue to use final `providerPaymentKey`.
- Reconciliation behavior for final captured payments remains unchanged.
- `npm run verify` performs no real provider API calls.

## 12. Stop conditions

Stop before real adapters if any of these remains true:

- `Payment.providerRef` is not implemented.
- Confirm/capture outbound idempotency is unresolved.
- Provider-specific providerRef uniqueness and object-id constraints are unknown.
- Sandbox/live mode is not durably modeled where the target environment can mix modes or needs mode-scoped uniqueness.
- Webhook correlation rules are provider-specific but undocumented.
- A client-roundtrip-only providerRef flow is proposed for real providers.
- `providerPaymentKey` is proposed as a pre-capture reference.
- Real provider webhooks are proposed before verifier/parser dependency injection.
- Real void is proposed before `VOID-HOOK-DEBT`, expanded result taxonomy, and idempotent-success semantics are resolved.

## 13. Recommended next step

Recommended next implementation step:

```text
D1-B providerRef schema patch
```

Scope for that patch:

- Migration and Prisma client update for nullable `Payment.providerRef`.
- Include `providerConfirmIdempotencyKey` if confirm/capture operation idempotency is implemented in the same patch.
- Include `providerMode` if sandbox/live can coexist in the database or if providerRef lookup scope needs it.
- Fake adapters and tests only.
- No real Toss/PayPal HTTP calls in normal verify.

If schema work is intentionally deferred, the alternate next step is:

```text
D1-B contract patch with fake adapters only
```

That alternate must keep real initiate adapters blocked until the providerRef migration lands.
