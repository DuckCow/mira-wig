# Order Cancellation / Refund State Machine — Design Lock v1

- **Date**: 2026-07-10
- **Status**: DESIGN LOCK — docs only. Nothing in this document is implemented by this document.
- **Base commit context**: `2f5838f feat(orders): add cancellation and refund order statuses`
- **Related**: `refund_request_eligibility_v1.md` (request-creation eligibility SSOT),
  `customer_refund_intake_v1.md` (non-financial customer review intake),
  `refund_execution_v1.md` (execution-command and evidence-resolution SSOT),
  `payment_policy_open_v6.md` (환불/취소 트랙 — "나가는 절반"),
  `payment_policy_confirmed_v6.md`, `b5_void_design_v3.md` (pg.void / completion compensation),
  `multi_pg_priority_fallback_v1.md` (post-contact immutability), `a3_outbox_design_v2.md`.

---

## 1. Purpose and scope

This document locks the design of the order cancellation/refund state machine so that later
implementation slices can be built and reviewed against a fixed contract. It is a **design lock,
not implementation**.

**Already implemented at HEAD (vocabulary + display only):**

- `OrderStatus` enum expanded to `PAID / CANCELLED / REFUND_PENDING / PARTIALLY_REFUNDED / REFUNDED`
  (`prisma/schema.prisma:281`).
- Shopper-facing labels for all five values in `src/app/(shop)/orders/order-status.ts`
  (결제 완료 / 주문 취소 / 환불 요청 처리 중 / 부분 환불 / 환불 완료), used by the customer order
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

Refund and payment records have distinct responsibilities. None may absorb another's role.

| Record | Responsibility | Is NOT |
|---|---|---|
| `Order.status` (`OrderStatus`) | Customer-facing commerce state of the order as a whole. What the shopper sees on `/orders`. | A money-movement log. Not a provider state mirror. |
| `Payment.status` (`PaymentAttemptStatus`) | State of one **payment attempt** against a checkout session (capture lifecycle). | An order state. Not a refund history. `VOIDED` has completion-compensation semantics (§3, §6). |
| `CustomerRefundIntake` (future) | Customer-authored, non-financial request for merchant review. | Merchant approval, refund balance reservation, or execution evidence. |
| `RefundAttempt` | Merchant-approved refund intent, immutable financial identity, provider-neutral idempotency key, and current refund-domain status. `SUCCEEDED` attempts are the source for cumulative returned amount. | Dispatch state or append-only provider observations. |
| `RefundExecutionCommand` (future) | Durable execution work and mutable operational dispatch projection. | A replacement for `RefundAttempt` or provider evidence. |
| `RefundExecutionEvidence` (future) | Append-only normalized provider/operator observations used by the resolution core. | Current domain status, raw provider payload storage, or a transition edge. |
| `RefundAttemptTransition` | Append-only domain decision edge and related Order-state evidence. | Provider evidence; a transition reason is not proof of money movement. |
| `PaymentEvent` | Provider/payment transmission evidence for existing webhook flows. | Generic refund evidence or sufficient input for Order refund state by itself. |

`Order.disputeStatus` (chargebacks/disputes) is an **orthogonal axis** and is not part of this
state machine. It is mentioned here only to state that nothing in this document reads or writes it.

## 3. Current statuses

### 3.1 `OrderStatus` — intended meanings

| Value | Meaning (locked) | Shopper label (already shipped) |
|---|---|---|
| `PAID` | Capture succeeded and order exists. In this codebase an `Order` row is only created by the completion transaction after a successful capture, so `PAID` is the birth state of every order. | 결제 완료 |
| `REFUND_PENDING` | A cancellation/refund workflow is **open** for this order: at least one refund attempt has been requested and the workflow has not reached a resting state. Non-terminal. | 환불 요청 처리 중 |
| `PARTIALLY_REFUNDED` | Resting state: some money has verifiably been returned (cumulative succeeded refunds > 0 and < payment amount) and no workflow is currently open. Non-terminal. | 부분 환불 |
| `CANCELLED` | Terminal: the full captured amount has verifiably been returned **and** the order will not be (or was not) fulfilled — the cancellation flavor of a full refund (e.g., before production start; MR aborted/`CANCELLED`). | 주문 취소 |
| `REFUNDED` | Terminal: the full captured amount has verifiably been returned, where fulfillment had progressed (return-style full refund), or the cancellation flavor does not apply. | 환불 완료 |

`CANCELLED` vs `REFUNDED` is a **commerce-semantics distinction, not a money distinction**. Generic
refund execution always maps verified full success to `REFUNDED`. Producing `CANCELLED` additionally
requires a separately proven fulfillment/cancellation policy and is not authorized by the generic
executor (`refund_execution_v1.md` §19).

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
| Customer refund intake | A shopper's non-financial request for merchant review under `customer_refund_intake_v1.md`. Submission creates no `RefundAttempt`, reserves no balance, and changes no Order or Payment state. Only explicit admin approval may atomically create `RefundAttempt.REQUESTED`. |
| Admin/merchant cancellation | An admin-initiated cancel/refund workflow. The **first implemented workflow** (§12). Request-creation eligibility and merchant approval follow `refund_request_eligibility_v1.md`; execution remains a separate later boundary. |
| Provider void/cancel | Provider-side reversal of a capture (`pg.void`, `ProviderVoidExecutor`). Today: completion-compensation only, pre-order. Distinct from refund execution and from this state machine. |
| Full refund | Cumulative succeeded refunded amount equals the captured `Payment.amount`. Generic execution produces `REFUNDED`; a separate cancellation policy may later produce `CANCELLED`. |
| Partial refund | A succeeded refund attempt with amount < remaining refundable. Leads to `PARTIALLY_REFUNDED` as the resting state. |
| Refund pending | An open workflow: ≥1 `RefundAttempt` in a non-terminal status (`REQUESTED/PROCESSING/FAILED_RETRYABLE/MANUAL_REVIEW`). Order shows `REFUND_PENDING`. |
| Provider retryable failure | Authoritative evidence proves no money moved and retry with the same attempt, command, and idempotency key is safe. Ambiguous timeouts do not qualify. |
| Provider terminal failure | Authoritative evidence proves no money moved and the operation must not retry. Ambiguous outcomes never release the reservation as terminal failure. |
| Ambiguous/manual-review state | Provider response does not durably establish success or failure (ambiguous HTTP outcome, mismatched echo, lookup unavailable). Attempt parks in `MANUAL_REVIEW`; **no order terminal transition may consume it** until resolved by verified lookup or operator decision. |

## 5. Allowed `OrderStatus` transitions

General mechanics (locked): every transition is applied as a **guarded conditional update**
(`updateMany where { id, status: from }`, count must equal 1 — same pattern as the existing
finalizer/void transitions). Where execution evidence causes or authorizes an Order transition,
the evidence and domain transition commit atomically through `refund_execution_v1.md`'s
resolution core. Provider calls happen outside database transactions.

Request creation follows `refund_request_eligibility_v1.md`'s request transaction. Pre-contact
`REQUESTED -> CANCELLED` requires no provider/execution evidence and follows
`order_refund_request_closure_v1.md`, which atomically commits attempt closure, Order restoration,
and transition audit evidence.

| From | To | Trigger | Actor | Required evidence | Provider call in this step? | Idempotency required? | Shopper-facing copy |
|---|---|---|---|---|---|---|---|
| `PAID` | `REFUND_PENDING` | Merchant-approved refund workflow opened, directly or through intake approval | Admin approval | ≥1 `RefundAttempt` row created in `REQUESTED` with amount, currency, merchant reason, and admin actor | No (ledger only) | Yes — attempt row carries its unique `idempotencyKey` from creation | 환불 요청 처리 중 |
| `REFUND_PENDING` | `CANCELLED` | Separate future commerce-cancellation resolution after full refund | Admin decision + system | Cumulative `SUCCEEDED` refunds == `Payment.amount` plus separately locked fulfillment/cancellation eligibility; no guarded attempt remains | No generic executor authority; separate operator path | Yes | 주문 취소 |
| `REFUND_PENDING` | `REFUNDED` | Generic full refund succeeded | System through evidence-resolution core | Cumulative `SUCCEEDED` == `Payment.amount`; authoritative immutable execution evidence; no guarded attempt remains | Executed before resolution transaction | Yes | 환불 완료 |
| `REFUND_PENDING` | `PARTIALLY_REFUNDED` | Generic partial refund succeeded | System through evidence-resolution core | Cumulative `SUCCEEDED` > 0 and < `Payment.amount`; authoritative immutable evidence; no guarded attempt remains | Executed before resolution transaction | Yes | 부분 환불 |
| `REFUND_PENDING` | `PAID` | Request withdrawn/declined with **zero** money moved | Admin | Zero `SUCCEEDED` refunds; all attempts closed (`FAILED_TERMINAL`/`CANCELLED`); decline reason recorded | No | Guarded-conditional transition only | 결제 완료 |
| `PARTIALLY_REFUNDED` | `REFUND_PENDING` | Another merchant-approved refund round opened, directly or through intake approval | Admin approval | New `RefundAttempt` in `REQUESTED`; over-refund guard passes (§9) | No (ledger only) | Yes | 환불 요청 처리 중 |
| `PARTIALLY_REFUNDED` | `REFUNDED` | Final round brings cumulative to total | System through evidence-resolution core | Cumulative `SUCCEEDED` == `Payment.amount`; authoritative immutable evidence; no guarded attempt remains | Executed before resolution transaction | Yes | 환불 완료 |

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
| Local terminal transition without durable authoritative evidence | Immutable execution evidence, attempt/command updates, and the Order transition must commit through the resolution contract. No "optimistic terminal" states. |
| Writing refund history into `PaymentAttemptStatus` | §3.2. |

## 7. Refund ledger requirement (`RefundAttempt`)

`RefundAttempt` owns one merchant-approved money intent and its current refund-domain status.
Status advances within the row's lifecycle, while amount, currency, designated Payment, provider,
mode, and provider-neutral idempotency identity are immutable after creation. Append-only external
observations belong to `RefundExecutionEvidence`, not this row.

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
| `actorType` | enum-ish (`ADMIN / SYSTEM`) | Admin approval and system execution provenance only. |
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

`CUSTOMER` is deliberately not a `RefundAttempt` actor. Customer provenance is owned by
`CustomerRefundIntake` under `customer_refund_intake_v1.md`; customers never create
`RefundAttempt` transitions. Admin approval provenance remains `ADMIN`, and execution provenance
remains `SYSTEM`.

Likely indexes/constraints:

- `@@index([orderId, status])` — workflow queries per order.
- `@@index([paymentId, status])` — refundable-sum computation.
- `@@unique([idempotencyKey])` — hard idempotency.
- Provider refund identity uniqueness where the provider supports one:
  `@@unique([provider, providerRefundId])` (partial/nullable-safe semantics — Prisma treats NULLs
  as distinct, matching the existing `@@unique([provider, providerPaymentKey])` pattern).
- **Single-in-flight guard (recommended):** at most one attempt per payment in
  `REQUESTED/PROCESSING/FAILED_RETRYABLE/MANUAL_REVIEW`. Enforced transactionally in the action (and optionally by
  a partial unique index later). The pre-staged admin copy `REFUND_IN_PROGRESS`
  ("처리 중인 환불이 있습니다") already assumes this semantics.

## 8. `RefundAttemptStatus` proposal

Adopt the proposed set unchanged:

| Status | Meaning | Maps to provider result classes |
|---|---|---|
| `REQUESTED` | Merchant-approved intent to attempt returning a specific amount; payment refundability was verified at creation, provider **not yet contacted**, and success not guaranteed. Withdrawable only while the close contract permits. Creation eligibility is owned by `refund_request_eligibility_v1.md`. | — |
| `PROCESSING` | The intent is durably claimed and exactly one durable execution command exists. Provider contact is authorized and may have occurred, but acceptance and money return are unproven. | Command `READY`/`LEASED`/`WAITING_EVIDENCE`; accepted-pending remains here. |
| `SUCCEEDED` | Durable authoritative success (direct result or verified lookup). Counts toward cumulative refunded. | `SUCCEEDED` |
| `FAILED_RETRYABLE` | Confirmed non-execution permits retry using the **same row, command, and idempotency key**. | `NOT_EXECUTED_RETRYABLE` |
| `FAILED_TERMINAL` | Definitive zero-money terminal outcome; row closed and guarded amount released. | `NOT_EXECUTED_TERMINAL` |
| `MANUAL_REVIEW` | Ambiguous or conflicting evidence requires operator/lookup resolution and blocks Order terminalization. | `UNKNOWN`, identity conflict, or amount/currency conflict |
| `CANCELLED` | Pre-contact withdrawal, or a future evidence-gated operator cancellation under a separately locked policy. The current close control supports only `REQUESTED -> CANCELLED`. | — |

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
  `Σ(SUCCEEDED) + Σ(in-flight REQUESTED/PROCESSING/FAILED_RETRYABLE/MANUAL_REVIEW) + A ≤ Payment.amount`,
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

## 10. Provider execution ownership

The provider-neutral adapter input, result taxonomy, idempotency, command polling, immutable
evidence, retry, ambiguity, and resolution contracts are owned exclusively by
`refund_execution_v1.md`. In particular, free-text request reason is not generic provider input,
and a network error is not retryable unless the adapter proves non-execution.

Provider-specific fields and finality rules require an official-provider design lock under
`AGENTS.md` §7. The existing `ProviderVoidExecutor` remains completion-compensation infrastructure
and is not a refund executor.

## 11. Customer UI policy (v1)

- The non-financial customer review-intake contract is locked in
  `customer_refund_intake_v1.md`. Schema, dormant core, tests, and SANDBOX UI may proceed under that
  contract, but no production customer intake control is authorized yet.
- The custom-wig/MTO production-start cutoff policy (open_v6 §4-1; MFG-2 per-state cancellability)
  and jurisdictional refund windows (§6.0, including US state notice requirements) require
  explicit legal and product signoff before production activation. A no-promise review button is
  still a customer-facing commitment.
- Until that signoff, production customer-facing copy stays **inquiry-style only**
  ("고객센터로 문의해주세요" tier), with no self-service affordance.
- `/orders` pages may **display** the five statuses (labels already shipped in
  `order-status.ts`) but must not trigger transitions. Display-only is the locked ceiling for
  customer UI until slice G.
- Customer list and detail badges render `REFUND_PENDING` as `환불 요청 처리 중`. The grammatical
  object is the active refund request, not refund execution or money movement. The order detail
  additionally renders `환불 요청이 접수되어 처리 중입니다. 환불 여부와 완료 시점은 아직 확정되지
  않았습니다.` while the order remains `REFUND_PENDING`.
- `REFUND_PENDING` alone does not prove provider contact and promises neither approval, money
  movement, successful completion, nor timing. Internal attempt phases remain hidden from customer
  pages in v1.
- Generic succeeded execution moves the Order to `PARTIALLY_REFUNDED` or `REFUNDED`. `CANCELLED`
  requires the separate commerce policy described in §3. Withdrawal or definitive zero-money
  terminal failure restores the appropriate non-pending resting state, which removes the pending
  badge and explanation.

## 12. Admin workflow recommendation (first real workflow)

The payment-refundability, merchant-approval, execution-suitability, and UI-projection boundaries
for creating `REQUESTED` are owned by `refund_request_eligibility_v1.md`. This section preserves
workflow sequencing and does not duplicate that eligibility contract.

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
- `RefundAttemptTransition` records lifecycle and Order decision edges with actor and operation
  identity. `RefundExecutionEvidence` separately records normalized external/operator
  observations. Neither record may substitute for the other.
- Raw provider payloads, secrets, and unrestricted errors do not belong in refund execution
  evidence. Source-specific transmission storage remains separately owned.

## 14. Risks / failure modes

| Risk | Mitigation locked in this design |
|---|---|
| Double refund | Stable unique `RefundAttempt.idempotencyKey`, one command per attempt, provider idempotent replay, evidence deduplication, and the single-open-attempt guard. |
| Over-refund | §9 transactional guard: Σ(succeeded) + Σ(in-flight) + new ≤ `Payment.amount`; `INSUFFICIENT_REFUNDABLE`. |
| Provider success + local failure | Durable command plus stable provider identity allows idempotent replay/lookup; resolution commits evidence and domain effects atomically. |
| Local terminal state without provider success | Forbidden by §6 (no optimistic terminal); transitions consume recorded evidence only. |
| Ambiguous provider response | `MANUAL_REVIEW` parking state; blocks terminal transitions; resolution via verified lookup or operator decision with audit. |
| Out-of-order / duplicate webhook | Source identity is deduplicated; normalized evidence reaches the single resolution core, and Order state never reads raw webhooks (§6). |
| Confusing `Payment.VOIDED` with `Order.CANCELLED` | Explicitly forbidden inference (§3.2, §6). |
| Partial refund tax/shipping/customs ambiguity | Deferred with explicit scope statement (§9); ledger stores plain amounts so later allocation logic attaches cleanly. |
| Customer legal/policy promise risk | No customer affordance until policy lock (§11); slice G is last. |
| Provider internals leakage | Refund evidence stores only bounded safe fields; customer pages expose no provider internals. |

## 15. Recommended implementation sequence

| Slice | Content | Gate |
|---|---|---|
| A | **This docs-only design lock.** | Human review of this document. |
| B | Schema-only `RefundAttempt` ledger (+ audit table decision), migration, no actions. | Separately approved migration; STRICT recon → design confirmation against §7/§8. |
| C | `refund_execution_v1.md` plus schema-only command/evidence slice. | Separate docs and schema review; no runtime. |
| D | Claim, resolution core, provider-neutral adapter, and deterministic dormant MOCK in isolated STRICT slices. | Behavioral, DB, concurrency, and crash-recovery tests; no active UI. |
| E | Toss refund adapter (official docs only, sandbox first, own design lock like the confirm/void adapters). | Official Toss cancel-API doc verification; sandbox smoke procedure. |
| F | Reconciliation/webhook repair for refunds (verified-event → ledger resolution, drift detection). | Follows existing reconciliation posture. |
| G | Customer-facing non-financial intake flow under `customer_refund_intake_v1.md`. | Dormant/SANDBOX work may proceed; production activation requires MTO/legal/product signoff (§11). |

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

It locks Order/refund transition vocabulary and amount semantics. Execution-command and provider
evidence rules are delegated to `refund_execution_v1.md`.
