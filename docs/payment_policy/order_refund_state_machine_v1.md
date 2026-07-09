# Order Cancellation / Refund State Machine — Design Lock v1

- **Date**: 2026-07-10
- **Status**: DESIGN LOCK — docs only. Nothing in this document is implemented by this document.
- **Base commit context**: `2f5838f feat(orders): add cancellation and refund order statuses`
- **Related**: `payment_policy_open_v6.md` (환불/취소 트랙 — "나가는 절반"), `payment_policy_confirmed_v6.md`, `b5_void_design_v3.md` (pg.void / completion compensation), `multi_pg_priority_fallback_v1.md` (post-contact immutability), `a3_outbox_design_v2.md`.

---

## 1. Purpose and scope

This document locks the design of the order cancellation/refund state machine so that later
implementation slices can be built and reviewed against a fixed contract. It is a **design lock,
not implementation**.

**Already implemented at HEAD (vocabulary + display only):**

- `OrderStatus` enum expanded to `PAID / CANCELLED / REFUND_PENDING / PARTIALLY_REFUNDED / REFUNDED`
  (`prisma/schema.prisma:281`).
- Shopper-facing labels for all five values in `src/app/(shop)/orders/order-status.ts`
  (결제 완료 / 주문 취소 / 환불 처리 중 / 부분 환불 / 환불 완료), used by the customer order
  list and detail pages for **display only**.
- Verified at HEAD: no production code writes any `OrderStatus` other than the `PAID` default at
  order creation (completion transaction). There are no `order.update` call sites. The state
  machine described here has **no writers yet** — by design.

**Not yet implemented (explicitly out of scope for this doc):**

- Refund ledger (`RefundAttempt` model) — no schema change of any kind.
- Cancel/refund server actions (admin or customer).
- Provider refund API calls (Toss cancel, future Eximbay, anything else).
- Admin refund UI.
- Customer-facing cancel/refund buttons.
- Refund-related webhook mutation or reconciliation repair.

## 2. Responsibility split

Four record types, four distinct responsibilities. None may absorb another's role.

| Record | Responsibility | Is NOT |
|---|---|---|
| `Order.status` (`OrderStatus`) | Customer-facing commerce state of the order as a whole. What the shopper sees on `/orders`. | A money-movement log. Not a provider state mirror. |
| `Payment.status` (`PaymentAttemptStatus`) | State of one **payment attempt** against a checkout session (capture lifecycle). | An order state. Not a refund history. `VOIDED` has completion-compensation semantics (§3, §6). |
| `RefundAttempt` ledger (future, §7) | Money-movement **evidence and idempotency record** for each refund/cancel money operation. Source of truth for "how much has actually been returned". | A UI convenience table. Rows are never deleted; money facts are immutable once terminal. |
| `PaymentEvent` | Provider/payment **event evidence** (webhooks, lookups; append-only, `@@unique([provider, transmissionId])`, verified mode/credential binding). | Sufficient input for order refund state by itself. Events inform the ledger; they never directly set `OrderStatus` (§6). |

`Order.disputeStatus` (chargebacks/disputes) is an **orthogonal axis** and is not part of this
state machine. It is mentioned here only to state that nothing in this document reads or writes it.

## 3. Current statuses

### 3.1 `OrderStatus` — intended meanings

| Value | Meaning (locked) | Shopper label (already shipped) |
|---|---|---|
| `PAID` | Capture succeeded and order exists. In this codebase an `Order` row is only created by the completion transaction after a successful capture, so `PAID` is the birth state of every order. | 결제 완료 |
| `REFUND_PENDING` | A cancellation/refund workflow is **open** for this order: at least one refund attempt has been requested and the workflow has not reached a resting state. Non-terminal. | 환불 처리 중 |
| `PARTIALLY_REFUNDED` | Resting state: some money has verifiably been returned (cumulative succeeded refunds > 0 and < payment amount) and no workflow is currently open. Non-terminal. | 부분 환불 |
| `CANCELLED` | Terminal: the full captured amount has verifiably been returned **and** the order will not be (or was not) fulfilled — the cancellation flavor of a full refund (e.g., before production start; MR aborted/`CANCELLED`). | 주문 취소 |
| `REFUNDED` | Terminal: the full captured amount has verifiably been returned, where fulfillment had progressed (return-style full refund), or the cancellation flavor does not apply. | 환불 완료 |

`CANCELLED` vs `REFUNDED` is a **commerce-semantics distinction, not a money distinction** — both
require identical full-refund ledger evidence. The choice between them is made by the actor
(admin, v1) based on fulfillment state, and the exact fulfillment-based eligibility rule
(MR/production cutoff — `payment_policy_open_v6.md` §4-1, MFG-2) is a policy-track decision that
gates the customer-facing flow, not this state machine.

### 3.2 `PaymentAttemptStatus` — and why it must not be overloaded

Current values: `INITIATED / AWAITING / SUCCEEDED / FAILED / VOIDED`.

These describe the lifecycle of **one capture attempt**. They must not be overloaded to carry
refund history, for four reasons:

1. **Cardinality.** One payment can have many refunds (partials, retries). A single status column
   cannot represent a ledger.
2. **`VOIDED` already has a meaning.** Per `b5_void_design_v3.md`, `SUCCEEDED → VOIDED` is the
   completion-compensation path: capture succeeded but local order completion failed durably, so
   the capture is voided — **in that path no `Order` row exists at all**. Inferring
   `Order.CANCELLED` from `Payment.VOIDED` is therefore a category error today, and stays
   forbidden even if future void-after-order scenarios appear (§6).
3. **Evidence shape.** Refunds need per-operation idempotency keys, amounts, actors, reasons, and
   provider refund identities. None of that fits attempt status.
4. **Post-contact immutability** (`multi_pg_priority_fallback_v1.md`): after provider contact,
   an attempt's provider/mode/amount/currency are frozen. Refund history mutating the capture
   attempt row would violate that policy.

Adding refund-ish values (e.g., `REFUNDED`) to `PaymentAttemptStatus` is **rejected**.

## 4. Cancellation/refund taxonomy

| Term | Definition (locked) |
|---|---|
| Customer cancellation request | A shopper's **request** to cancel/refund. In v1 this is an inquiry (CS channel); it creates no state transition by itself. Future: may create a `RefundAttempt` in `REQUESTED` after policy lock (§11). |
| Admin/merchant cancellation | An admin-initiated cancel/refund workflow. The **first implemented workflow** (§12). Admin approves eligibility, creates ledger rows, triggers execution. |
| Provider void/cancel | Provider-side reversal of a capture (`pg.void`, `ProviderVoidExecutor`). Today: completion-compensation only, pre-order. Distinct from refund execution and from this state machine. |
| Full refund | Cumulative succeeded refunded amount equals the captured `Payment.amount`. Enables `CANCELLED` or `REFUNDED`. |
| Partial refund | A succeeded refund attempt with amount < remaining refundable. Leads to `PARTIALLY_REFUNDED` as the resting state. |
| Refund pending | An open workflow: ≥1 `RefundAttempt` in a non-terminal status (`REQUESTED/PROCESSING/MANUAL_REVIEW`). Order shows `REFUND_PENDING`. |
| Provider retryable failure | Provider refund call failed with a transient class (timeout, 5xx, rate limit). The same attempt may be retried **with the same idempotency key**. |
| Provider terminal failure | Provider definitively refused (invalid state, already refunded elsewhere, policy refusal). The attempt is closed `FAILED_TERMINAL`; a new attempt (new key) is required to try again. |
| Ambiguous/manual-review state | Provider response does not durably establish success or failure (ambiguous HTTP outcome, mismatched echo, lookup unavailable). Attempt parks in `MANUAL_REVIEW`; **no order terminal transition may consume it** until resolved by verified lookup or operator decision. |

## 5. Allowed `OrderStatus` transitions

General mechanics (locked): every transition is applied as a **guarded conditional update**
(`updateMany where { id, status: from }`, count must equal 1 — same pattern as the existing
finalizer/void transitions), inside the same DB transaction as the ledger write that evidences it.
Provider calls happen **before** the terminal-transition transaction, and their results must be
durably recorded on the `RefundAttempt` row first.

| From | To | Trigger | Actor | Required evidence | Provider call in this step? | Idempotency required? | Shopper-facing copy |
|---|---|---|---|---|---|---|---|
| `PAID` | `REFUND_PENDING` | Refund/cancel workflow opened | Admin (v1); system on future customer request | ≥1 `RefundAttempt` row created in `REQUESTED` with amount, currency, reason, actor | No (ledger only) | Yes — attempt row carries its unique `idempotencyKey` from creation | 환불 처리 중 |
| `REFUND_PENDING` | `CANCELLED` | Full refund succeeded; order not fulfilled | Admin decision + system | Cumulative `SUCCEEDED` refunds == `Payment.amount`; each with durable provider result (`providerRefundId` and/or verified lookup); no in-flight attempts; fulfillment not started (MR aborted/absent) | Executed in prior step(s); transition consumes recorded results | Yes (execution steps); transition itself is guarded-conditional | 주문 취소 |
| `REFUND_PENDING` | `REFUNDED` | Full refund succeeded; cancellation flavor not applicable | Admin decision + system | Same money evidence as above (cumulative == `Payment.amount`, durable provider results, no in-flight attempts) | Executed in prior step(s) | Yes | 환불 완료 |
| `REFUND_PENDING` | `PARTIALLY_REFUNDED` | Workflow closes with partial success | Admin decision + system | Cumulative `SUCCEEDED` > 0 and < `Payment.amount`; no in-flight attempts remain | Executed in prior step(s) | Yes | 부분 환불 |
| `REFUND_PENDING` | `PAID` | Request withdrawn/declined with **zero** money moved | Admin | Zero `SUCCEEDED` refunds; all attempts closed (`FAILED_TERMINAL`/`CANCELLED`); decline reason recorded | No | Guarded-conditional transition only | 결제 완료 |
| `PARTIALLY_REFUNDED` | `REFUND_PENDING` | Another refund round opened | Admin (v1) | New `RefundAttempt` in `REQUESTED`; over-refund guard passes (§9) | No (ledger only) | Yes | 환불 처리 중 |
| `PARTIALLY_REFUNDED` | `REFUNDED` | Final round brings cumulative to total | Admin decision + system | Cumulative `SUCCEEDED` == `Payment.amount`; durable provider results; no in-flight attempts | Executed in prior step(s) | Yes | 환불 완료 |

Notes:

- `REFUND_PENDING → PAID` is added beyond the minimum required list deliberately: without it, a
  declined/withdrawn request with no money moved would trap the order in a non-resting state.
- There is **no direct `PAID → CANCELLED`** in v1. Because an `Order` exists only after successful
  capture, every order cancellation involves returning captured funds and must route through
  `REFUND_PENDING` so money movement is always ledger-evidenced before a terminal state.
- `CANCELLED` and `REFUNDED` are terminal: no outbound transitions.
- `PARTIALLY_REFUNDED → CANCELLED` is not allowed in v1 (see §6); once partial fulfillment/refund
  history exists, the full-refund terminal is `REFUNDED`. Revisit only with a concrete case.

## 6. Forbidden transitions and forbidden inference

| Forbidden | Why |
|---|---|
| `CANCELLED → PAID`, `REFUNDED → PAID` (or any transition out of a terminal state) | Terminal means terminal. Reversals of mistaken terminal states are an operator/data-repair procedure with its own audit trail, not a state-machine edge. |
| Direct `PAID → REFUNDED` (or `PAID → CANCELLED`) without refund ledger evidence | Terminal money states require ledger rows with durable provider results. No shortcut, including for MOCK/sandbox. |
| `PARTIALLY_REFUNDED → CANCELLED` | v1 simplification; prevents "cancelled" orders with partial-fulfillment refund history. |
| Any `OrderStatus` change inferred **only** from `Payment.status == VOIDED` | `VOIDED` is completion-compensation semantics (capture voided because no order could be created). Where an order exists, voiding/refunding must go through the ledger. `Payment.VOIDED` never implies `Order.CANCELLED`. |
| Any `OrderStatus` change based **only** on a raw webhook body | Webhooks are untrusted input until verified (query-verified/lookup posture, `webhook_verified_mode_design_v1.md`). Even verified events only update the **ledger**; order transitions consume ledger state. |
| A customer button directly mutating `OrderStatus` | Customer actions may at most create a request record (post policy lock). Transitions are applied only by the workflow engine/admin action with ledger evidence. |
| Local terminal transition before provider/local evidence is durable | The provider result (or verified lookup outcome) must be persisted on the `RefundAttempt` row before the transaction that flips the order to `CANCELLED/REFUNDED/PARTIALLY_REFUNDED`. No "optimistic terminal" states. |
| Writing refund history into `PaymentAttemptStatus` | §3.2. |

## 7. Refund ledger requirement (`RefundAttempt`)

**Locked requirement:** a dedicated refund ledger model must exist before any cancel/refund
action is implemented. Proposed name `RefundAttempt` (mirrors `Payment` attempt naming). Rows are
append-only in spirit: status advances within a row's lifecycle, money facts
(amount/currency/provider identity) are immutable after creation, and rows are never deleted.

Proposed minimal fields (schema slice B, separately approved migration):

| Field | Type (indicative) | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `orderId` | `String` (FK → Order) | |
| `paymentId` | `String` (FK → Payment) | The captured attempt being refunded. |
| `amount` | `Int` | Minor units, ≥ 1 (§9). |
| `currency` | `String` | Must equal `Payment.currency` (§9). |
| `status` | `RefundAttemptStatus` | §8. |
| `reason` | `String` | Required non-empty (existing copy `REASON_REQUIRED` already anticipates this). |
| `actorType` | enum-ish (`ADMIN / CUSTOMER / SYSTEM`) | v1 writes only `ADMIN`/`SYSTEM`. |
| `actorUserId` | `String?` | Required when `actorType != SYSTEM`. |
| `provider` | `PaymentProvider` | Copied from payment; frozen after provider contact. |
| `mode` | `PaymentMode` | Copied from payment; frozen after provider contact. |
| `providerRefundId` | `String?` | Provider's refund/cancel identity, when the provider issues one. |
| `idempotencyKey` | `String @unique` | Generated once at row creation (suggested derivation: `refund:{paymentId}:{refundAttemptId}`); passed to the provider as `operationKey`; never regenerated. |
| `requestedAt` | `DateTime` | |
| `processedAt` | `DateTime?` | Set on `SUCCEEDED`. |
| `failedAt` | `DateTime?` | Set on terminal failure. |
| `failureCode` | `String?` | Normalized code (aligned with `ProviderErrorCode`). |
| `safeFailureMessage` | `String?` | Redacted, shopper/admin-safe. Raw provider payloads stay in `PaymentEvent`/diagnostics, never here. |
| `createdAt` / `updatedAt` | `DateTime` | |

Likely indexes/constraints:

- `@@index([orderId, status])` — workflow queries per order.
- `@@index([paymentId, status])` — refundable-sum computation.
- `@@unique([idempotencyKey])` — hard idempotency.
- Provider refund identity uniqueness where the provider supports one:
  `@@unique([provider, providerRefundId])` (partial/nullable-safe semantics — Prisma treats NULLs
  as distinct, matching the existing `@@unique([provider, providerPaymentKey])` pattern).
- **Single-in-flight guard (recommended):** at most one attempt per payment in
  `REQUESTED/PROCESSING/MANUAL_REVIEW`. Enforced transactionally in the action (and optionally by
  a partial unique index later). The pre-staged admin copy `REFUND_IN_PROGRESS`
  ("처리 중인 환불이 있습니다") already assumes this semantics.

## 8. `RefundAttemptStatus` proposal

Adopt the proposed set unchanged:

| Status | Meaning | Maps to provider result classes |
|---|---|---|
| `REQUESTED` | Row created, eligibility approved, provider **not yet contacted**. Freely cancellable. | — |
| `PROCESSING` | Provider contacted (or contact in flight). Post-contact immutability applies from here. | `pending` results park here |
| `SUCCEEDED` | Durable provider success (direct result or verified lookup). Counts toward cumulative refunded. | `succeeded`, `idempotent_succeeded` |
| `FAILED_RETRYABLE` | Transient failure; retry reuses the **same row and same idempotency key**. | `retryable` |
| `FAILED_TERMINAL` | Definitive refusal; row closed; a new attempt requires a new row/key. | `terminal`, `auth_stop` |
| `MANUAL_REVIEW` | Ambiguous provider state; operator/lookup resolution required; blocks order terminal transitions. | `manual_review`, `ambiguous_state` |
| `CANCELLED` | Withdrawn before provider contact (`REQUESTED → CANCELLED` only). | — |

Deliberate choice: **no separate `PENDING` status**. Async provider rails (e.g., a future
bank-transfer/konbini-style refund that completes later) map to `PROCESSING` with
`providerRefundId` recorded; if a real async rail arrives and `PROCESSING` proves overloaded,
split `PENDING_PROVIDER` out then. Adding it speculatively now would create a dead state.

## 9. Partial refund math (locked rules)

- All refund amounts are **positive minor-unit integers** (`Int`, ≥ 1). A zero-amount refund is
  invalid (consistent with the admin catalog `amount >= 1` precedent and `INVALID_AMOUNT` copy).
- `RefundAttempt.currency` must equal `Payment.currency` (which equals `Order.currency` by the
  existing completion invariant). No cross-currency refunds; FX-loss questions on multi-currency
  are a policy-track item (`payment_policy_open_v6.md`), deferred.
- **Cumulative refunded amount = Σ amount of `SUCCEEDED` attempts** for the payment. Nothing else
  counts — not `PROCESSING`, not `MANUAL_REVIEW`, not provider webhooks that haven't been
  resolved into a `SUCCEEDED` row.
- **Over-refund guard:** a new attempt for amount `A` is admissible iff
  `Σ(SUCCEEDED) + Σ(in-flight REQUESTED/PROCESSING/MANUAL_REVIEW) + A ≤ Payment.amount`,
  evaluated inside a transaction with a row lock on the payment (or equivalent serialization via
  the single-in-flight guard, which reduces this to `Σ(SUCCEEDED) + A ≤ Payment.amount`).
  Violation surfaces as `INSUFFICIENT_REFUNDABLE` (copy already staged).
- KRW/JPY/USD minor-unit handling follows the existing invariant: storage/validation/arithmetic
  know only "minor-unit integer, non-negative" (AGENTS §7); decimal knowledge lives only at the
  display boundary (`CURRENCY_META`/`formatPrice`) and future PG wire formatting. **No ×100
  anywhere in refund logic.**
- **Line-level refund allocation is deferred** (the Cancellation-entity/line-allocation design in
  `payment_policy_open_v6.md` §1.1 owns it). v1 refunds are order-level amounts.
- **Tax/shipping/customs refund math is deferred** (shipping fees are not charged yet; tax/customs
  are not modeled). The ledger stores plain amounts; allocation semantics come later.

## 10. Provider interface recommendation

A future **refund executor** contract, separate from the existing `ProviderVoidExecutor`
(pg.void / completion compensation) and from confirm/capture:

```
refund({ providerPaymentKey, amount, currency, operationKey, reason })
```

Result categories (aligned with the existing void/confirm normalization vocabulary):

- `succeeded` — durable success now.
- `idempotent_succeeded` — provider recognized `operationKey`/refund identity as already done.
- `pending` — provider accepted; completion is asynchronous (maps to `PROCESSING`).
- `retryable` — transient; same attempt + same `operationKey` may retry.
- `terminal` — definitive refusal.
- `manual_review` — provider signaled a state requiring human/lookup resolution.
- `auth_stop` — credential/authorization failure; stop, do not retry blindly.
- `ambiguous_state` — outcome not establishable; `providerLookupRequired: true` semantics, parks
  the attempt in `MANUAL_REVIEW`.

Deltas vs `ProviderVoidResult`, on purpose: refund adds `amount`/`currency` (partial refunds) and
`pending` (async rails). Everything else mirrors the existing classification so the bridge/mapping
layer can be shared conceptually.

**Do not encode Toss-only semantics into the generic interface** — e.g., Toss cancel's
`cancelAmount`/`taxFreeAmount` fields, virtual-account refund receive-account collection, or
settlement-window behavior belong in the Toss adapter (slice E), sourced from official docs only
(AGENTS §7). Likewise the Japan cash-like-method refund-account wait state (open_v6 §0-1) is a
policy/adapter concern, not a contract field.

## 11. Customer UI policy (v1)

- **No customer cancel/refund buttons.** Not on `/orders`, not on `/orders/[id]`, not anywhere.
- The custom-wig/MTO production-start cutoff policy (open_v6 §4-1; MFG-2 per-state cancellability)
  and jurisdictional refund windows (§6.0, including US state notice requirements) must be locked
  **before** any customer-facing commitment is rendered, because a button is a legal promise.
- Until then, customer-facing copy stays **inquiry-style only** ("고객센터로 문의해주세요" tier),
  with no self-service affordance.
- `/orders` pages may **display** the five statuses (labels already shipped in
  `order-status.ts`) but must not trigger transitions. Display-only is the locked ceiling for
  customer UI until slice G.

## 12. Admin workflow recommendation (first real workflow)

- The **first implemented workflow is admin-only** (slice D), after the ledger exists (B) and the
  MOCK executor is test-proven (C).
- The admin surface needs, minimally: order detail with payment + refund-ledger view;
  fulfillment/MR status display (eligibility context); computed refundable remainder; amount +
  required reason input; **idempotent submit** (attempt row created first, guarded by
  single-in-flight + over-refund checks); visible `MANUAL_REVIEW` parking state with a resolution
  path; decline/withdraw path (`REFUND_PENDING → PAID` when nothing moved).
- The admin action must **never set a terminal `OrderStatus` directly**. It creates/advances
  `RefundAttempt` rows; order transitions are computed from ledger state per §5. Existing staged
  admin copy (`REASON_REQUIRED`, `INSUFFICIENT_REFUNDABLE`, `REFUND_IN_PROGRESS`,
  `INVALID_TRANSITION`) should be reused.

## 13. Audit/events

- **`PaymentEvent` alone is not enough.** It is keyed to provider transmissions
  (`[provider, transmissionId]`) and admin/manual actions have no transmission. It also carries no
  actor identity or order-state semantics.
- A future **`OrderEvent`/`RefundEvent`** (or one generic audit table) is likely needed at slice
  B/D time. Minimum recordable facts for every manual/admin action and every applied transition:
  actor type + actor user id, previous status → next status, reason, amount, idempotency key,
  provider result summary (normalized code + safe message, never raw payloads), related
  `refundAttemptId`, and free-form operator notes.
- `RefundAttempt` itself carries much of this for money operations; the audit table covers status
  transitions and decisions (e.g., declines) that move no money.

## 14. Risks / failure modes

| Risk | Mitigation locked in this design |
|---|---|
| Double refund | Unique `idempotencyKey` per attempt passed as provider `operationKey`; `idempotent_succeeded` result class; single-in-flight guard. |
| Over-refund | §9 transactional guard: Σ(succeeded) + Σ(in-flight) + new ≤ `Payment.amount`; `INSUFFICIENT_REFUNDABLE`. |
| Provider success + local failure | Provider result durably recorded on the attempt row before any order transition; recovery = re-resolve attempt from provider identity/lookup, never re-execute blindly. |
| Local terminal state without provider success | Forbidden by §6 (no optimistic terminal); transitions consume recorded evidence only. |
| Ambiguous provider response | `MANUAL_REVIEW` parking state; blocks terminal transitions; resolution via verified lookup or operator decision with audit. |
| Out-of-order / duplicate webhook | Events append to `PaymentEvent` (deduped by transmission id) and update the **ledger** only via resolution logic; order state never reads raw webhooks (§6). |
| Confusing `Payment.VOIDED` with `Order.CANCELLED` | Explicitly forbidden inference (§3.2, §6). |
| Partial refund tax/shipping/customs ambiguity | Deferred with explicit scope statement (§9); ledger stores plain amounts so later allocation logic attaches cleanly. |
| Customer legal/policy promise risk | No customer affordance until policy lock (§11); slice G is last. |
| Provider internals leakage | `safeFailureMessage` only on the ledger; raw payloads confined to `PaymentEvent`/diagnostics with existing redaction discipline; customer pages already select no provider internals. |

## 15. Recommended implementation sequence

| Slice | Content | Gate |
|---|---|---|
| A | **This docs-only design lock.** | Human review of this document. |
| B | Schema-only `RefundAttempt` ledger (+ audit table decision), migration, no actions. | Separately approved migration; STRICT recon → design confirmation against §7/§8. |
| C | MOCK-only refund executor + behavioral tests (idempotency, over-refund guard, classification mapping, transition math). | Verify green; no real provider surface. |
| D | Admin-only refund request/execution action + minimal admin UI, wired to §5 transitions. | Admin auth + audit trail in place; runtime smoke on MOCK. |
| E | Toss refund adapter (official docs only, sandbox first, own design lock like the confirm/void adapters). | Official Toss cancel-API doc verification; sandbox smoke procedure. |
| F | Reconciliation/webhook repair for refunds (verified-event → ledger resolution, drift detection). | Follows existing reconciliation posture. |
| G | Customer-facing request flow (request-only; still no direct mutation). | MTO/legal/fulfillment policy lock (§11) — hard gate. |

Each slice is a separate commit series with its own review; no slice may pull forward a later
slice's surface "while we're here".

## 16. Explicit out-of-scope (repeated)

This document does **not** implement, and must not be read as authorizing:

- schema changes or migrations (including `RefundAttempt` itself),
- server actions (admin or customer),
- provider API calls of any kind,
- customer-facing buttons or flows,
- admin UI,
- webhook-driven mutation,
- reconciliation-driven mutation,
- line-level refund allocation,
- tax/shipping/customs refund math.

It locks vocabulary, transitions, evidence rules, ledger shape, and sequencing — nothing else.
