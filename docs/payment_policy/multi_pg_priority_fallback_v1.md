# Multi-PG Priority and Fallback Policy v1

> Status: design lock, not implementation.
> Date: 2026-07-08.
> Scope: future multi-PG / multi-PSP routing, priority, and fallback before adding another real provider.

## 1. Status and Scope

This document locks the priority and fallback policy for future multi-PG support, including future providers such as KG Inicis, Eximbay, PayPal, Japanese PSPs, or another regional PG.

It does not require a current schema change, source change, migration, provider API change, routing live allowlist change, test change, or generated artifact change.

It does not implement a second PSP and does not imply live readiness.

## 2. Current Repo Facts

- `src/lib/payment/providers/routing.ts` defines `RoutingRule.candidates` as an ordered array of provider candidates.
- Current routing priority is `RoutingRule.candidates` array order. The current KR card rule lists `[TOSS, PAYPAL]`, so Toss has priority over PayPal for that rule.
- `resolveProviderForPayment()` in `src/lib/payment/providers/routing.ts` filters candidates by static eligibility and selects `eligible[0]`.
- Filtered-out candidates are recorded in memory as `filteredOut: FilteredProvider[]`, with provider and reason, but no durable candidate-skip persistence exists yet.
- There is no failure-driven fallback today. Current routing selects one provider before row creation; confirm, webhook, void, and reconciliation do not try another provider after a selected provider fails.
- `src/lib/payment/attempt/initiate.ts` creates the `Payment` row with `provider: input.provider.code` and `mode: input.mode`; that row is the provider/mode lock for the attempt.
- `prisma/schema.prisma` stores `Payment.provider`, `Payment.mode`, `Payment.providerRef`, and `Payment.providerPaymentKey`. It also has provider-keyed identity/indexes such as `@@unique([provider, providerPaymentKey])` and `@@index([provider, providerRef])`.
- `providerRef` and `providerPaymentKey` are provider-scoped and not portable across providers. They represent provider-specific pre-capture and capture identities.
- `src/app/actions/payment.ts` prepares confirm by querying pending payments with the selected `provider`; it does not confirm a different provider's row.
- Completion uses provider-scoped `CaptureFacts` in `src/lib/payment/complete/types.ts` and checks `Payment.mode` plus `providerPaymentKey` against the persisted row during completion.
- Webhook handling records provider-scoped events and forwards provider-scoped capture facts through the shared completion path.
- Void handling in `src/lib/payment/void/handler.ts` checks that the outbox payload provider and `providerPaymentKey` match the persisted payment before calling a void executor.
- Reconciliation code in `src/lib/payment/reconciliation/**` compares provider and `providerPaymentKey` when interpreting outbox, event, and payment facts.
- Multiple `Payment` attempts can already coexist under one `CheckoutSession`; failed or stale rows remain as audit records. `Order.checkoutSessionId` and `Order.paymentId` are unique in `prisma/schema.prisma`, and completion guards protect the single winning order.

## 3. Priority Policy

- DECISION: Provider priority is `RoutingRule.candidates` array order.
- DECISION: Candidate order is now an explicit contract, not an accidental implementation detail.
- DECISION: The first eligible candidate wins.
- Static eligibility may filter candidates before any `Payment` row exists.
- Static eligibility includes registry availability, mode support, method support, currency support, amount bounds, and live enablement where applicable.
- Future dynamic priority, provider health routing, latency-aware routing, and score-based routing are out of scope for this policy.

## 4. Pre-Row Automatic Selection Window

- DECISION: Automatic candidate iteration is allowed only before a `Payment` row exists and before any provider contact.
- If candidate #1 is not eligible or cannot produce a working adapter before a `Payment` row exists, candidate #2 may be considered.
- Adapter-resolution failures may be selection inputs only in this pre-row window.
- Examples of pre-row adapter-resolution inputs include credential absence, SANDBOX external opt-in state, adapter availability, and fail-closed provider factory results.
- Candidate skip reasons must be logged at least structurally: provider, rule id, mode, market, method, currency, and machine-readable reason.
- Durable skip persistence is deferred until a second PSP exists.
- If all candidates fail pre-row selection, return `PROVIDER_UNAVAILABLE` and create no `Payment` row.
- Candidate iteration itself never contacts a provider.
- Provider contact happens only after row creation as part of the selected attempt.

## 5. Provider Immutability

- DECISION: `Payment.provider` becomes immutable at `Payment` row creation.
- DECISION: `Payment.mode` remains pinned per row and must remain meaningful.
- After a `Payment` row exists, the system must never silently switch provider for that row.
- `providerRef` and `providerPaymentKey` are provider-specific and must never be carried across providers.
- A row created for one provider may not be completed, voided, reconciled, or retried as another provider.

## 6. Post-Row Fallback Policy

- DECISION: There is no automatic post-row cross-PG fallback.
- Confirm must never fallback to another provider.
- Webhook handling must never complete another provider's row.
- Void handling must never target another provider's row.
- Reconciliation must never reinterpret another provider's row.
- Post-row fallback is user-driven only.
- A user-driven retry or provider/method switch creates a new `Payment` row.
- The new row may use a different provider.
- The same `CheckoutSession` may be reused only while the session is still usable and has no successful capture/order.
- The failed, declined, timed-out, or abandoned row remains as audit history.
- Do not reuse an existing `Payment` row for another provider.
- OPEN, same-provider pending retry ambiguity: user-driven new attempts are structurally allowed under the same `CheckoutSession`, but a still-pending prior attempt for the same provider needs an explicit retry-UX policy. Today, if two pending rows exist for the same provider, confirm can become ambiguous. Terminal declines are fine because the failed row is no longer pending, but retryable failures may leave the prior row pending. The future retry-UX implementation, aligned with `docs/payment_policy/payment_policy_open_v6.md` §7.4, must decide whether to supersede or abandon the prior pending attempt, scope confirm to the newest/intended attempt, or otherwise prevent same-provider pending ambiguity. This document does not resolve that decision.

## 7. Declines, Timeouts, and Ambiguous States

- DECISION: `PROVIDER_DECLINED` must not trigger automatic re-charging through another PG.
- DECISION: Ambiguous states such as timeout or provider-state-ambiguous must not trigger automatic fallback.
- A timeout may mean the provider acted; automatic fallback risks a double charge.
- Provider-state ambiguity may require lookup, webhook replay, reconciliation, operator review, or user-visible "payment checking" UX, not silent provider switching.
- User-visible retry or explicit provider/method switch is allowed only under a clearly defined new-attempt flow.

## 8. Idempotency and Identity

- DECISION: Initiate, confirm, capture, and void idempotency keys must remain provider/attempt scoped.
- Fallback attempts must not share `providerRef` or `providerPaymentKey` across providers.
- Capture identity remains provider-scoped.
- Existing key examples such as `confirm:{provider}:{paymentId}` and `void:{provider}:{providerPaymentKey}` are consistent with provider-scoped identity.
- Future fallback tests must prove idempotency-key and capture-key non-collision across providers and attempts.

## 9. SANDBOX vs LIVE

- DECISION: The same fallback semantics apply in SANDBOX and LIVE.
- Priority data may differ by environment or mode, but state-machine semantics must not.
- SANDBOX external opt-in and LIVE `liveEnabled` are selection inputs only before row creation.
- Once a row exists, mode/provider immutability dominates.
- A SANDBOX row must not be retried as LIVE. A LIVE row must not be retried as SANDBOX. Use a new attempt when changing mode or provider.

## 10. Audit and C2 Visibility

- Post-row attempts are auditable through provider-scoped `Payment` rows and their status/error fields.
- Pre-row candidate skips are currently not durable.
- Durable skip persistence remains OPEN until a second PSP exists.
- Reconciliation findings for fallback audit remain OPEN until a second PSP exists.
- C2 should eventually be able to answer which providers were attempted, skipped, failed, declined, timed out, retried, or completed.
- C2 should distinguish pre-row skips from post-row provider attempts. A skipped provider is not the same as a failed provider charge attempt.

## 11. Explicit Prohibitions

- No execution-time cross-PG fallback.
- No provider switch during confirm.
- No provider switch during webhook processing.
- No provider switch during void handling.
- No provider switch during reconciliation.
- No automatic provider fallback on decline.
- No automatic provider fallback on ambiguous provider state.
- No cross-provider `providerRef` reuse.
- No cross-provider `providerPaymentKey` reuse.
- No reuse of an existing `Payment` row for another provider.
- No fallback attempt that hides or deletes the previous provider-scoped audit row.

## 12. Required Future Tests

Future implementation work must include behavior tests for:

- pre-row candidate #1 unresolvable -> candidate #2 selected, zero `Payment` rows for #1, skip reason logged
- all candidates unresolvable -> `PROVIDER_UNAVAILABLE`, zero `Payment` rows
- decline does not auto-contact another provider
- timeout does not auto-contact another provider
- provider-state ambiguity does not auto-contact another provider
- user-driven retry creates a new `Payment` row, possibly with a new provider, with the old row intact
- same-provider user retry after a retryable/pending prior attempt does not lead to confirm ambiguity; the future retry-UX implementation must prove its chosen rule, such as superseding or abandoning prior pending attempts or scoping confirm to the intended attempt
- one `Order` maximum under concurrent fallback/retry attempts
- confirm never touches another provider's row
- webhook handling never touches another provider's row
- void handling never touches another provider's row
- reconciliation never reinterprets another provider's row
- idempotency keys do not collide across fallback attempts
- providerRef/providerPaymentKey values are never carried from one provider attempt to another
- SANDBOX external opt-in and LIVE `liveEnabled` affect only pre-row selection, not post-row provider immutability

## 13. Out of Scope

- second PSP implementation
- KG Inicis wiring
- Eximbay wiring
- PayPal wiring
- Japan PSP wiring
- dynamic priority
- health-based routing
- durable skip persistence
- fallback reconciliation finding types
- admin/provider routing UI
- liveEnabled population
- go-live checklist changes
- real provider credential naming
- real provider API calls

## 14. References

- `docs/payment_policy/payment_policy_confirmed_v6.md`: PG-1 confirms market-specific multi-PG routing and provider-scoped payment identity pressure; PG-2 lists current provider candidates.
- `docs/payment_policy/payment_policy_open_v6.md`: open questions include PG selection, payment retry UX, delayed/ambiguous completion paths, and reconciliation/audit concerns.
- `docs/payment_policy/d1b_adapter_boundary_design_v1.md`: adapter boundary design, providerRef persistence direction, and no execution-time cross-PG fallback as a non-goal.
- `docs/payment_policy/d1c_provider_wiring_design_v1.md`: provider factory, credential gates, SANDBOX external opt-in, LIVE gating, and provider-specific wiring decisions.
- `docs/payment_policy/webhook_verified_mode_design_v1.md`: verified mode and provider context must come from verified provider facts, not current config.
- Current routing behavior: `src/lib/payment/providers/routing.ts` uses ordered `RoutingRule.candidates`, static eligibility filtering, in-memory `filteredOut`, and first eligible provider selection.
- Current factory/action behavior: `src/app/actions/payment-provider-boundary.ts`, `src/lib/payment/providers/factory.ts`, and `src/lib/payment/attempt/initiate.ts` select an adapter before row creation and persist provider/mode on the resulting `Payment` attempt.
- Current post-selection behavior: `src/app/actions/payment.ts`, `src/lib/payment/complete/**`, `src/lib/payment/webhook/**`, `src/lib/payment/void/**`, and `src/lib/payment/reconciliation/**` are provider-scoped after a `Payment` row exists.
