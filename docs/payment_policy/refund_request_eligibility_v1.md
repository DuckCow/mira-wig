# Refund Request Eligibility — Design Lock v1

- **Date:** 2026-07-10
- **Status:** DESIGN LOCK — documentation only; this document changes no runtime behavior.
- **Base commit context:** `9896ae6 docs(refund): include retryable attempts in guarded set`
- **Related:** `order_refund_state_machine_v1.md`, `order_refund_request_closure_v1.md`,
  `payment_policy_confirmed_v6.md`, `payment_policy_open_v6.md`

## 1. Purpose and ownership

This document is the authoritative policy source for creating a new admin refund request. It
owns:

- the stable meaning of `RefundAttemptStatus.REQUESTED`;
- payment-level refundability at request creation;
- merchant approval and pre-decision advisory review;
- future execution suitability;
- the admin UI projection boundary;
- current v1 hard blockers, amount rules, and currency authority;
- stale-UI transaction authority;
- activation and rollout gates; and
- current implementation gaps and unresolved product decisions.

It does not own refund status transitions or terminal order-state derivation; those remain in
`order_refund_state_machine_v1.md`. It does not own withdrawal of an unexecuted request; that
remains in `order_refund_request_closure_v1.md`. It does not design a provider executor.

## 2. Stable meaning of `REQUESTED`

`REQUESTED` records a merchant-approved intent to attempt returning a specific amount.
Payment-level refundability was transactionally verified at creation. Provider contact has not
begun. Provider acceptance and successful money return are not guaranteed. The request remains
withdrawable while the close contract permits it.

The distinctions are mandatory:

```text
merchant-approved refund intent
!= provider acceptance
!= successful money return
```

An undecided review intake creates no `RefundAttempt`. `REQUESTED` is not:

- a customer request awaiting merchant approval;
- an unapproved operational ticket;
- proof that provider execution has begun; or
- proof that a refund will succeed.

The current customer explanation remains compatible:

```text
환불 여부와 완료 시점은 아직 확정되지 않았습니다.
```

The merchant may have approved the intent while provider acceptance, actual money return, and
completion timing remain uncertain. Customer presentation must continue to avoid exposing the
internal attempt phase or promising an outcome.

## 3. Authoritative decision model

Eligibility is not one boolean. It comprises three authoritative decisions plus a presentation
layer.

### 3.1 Payment refundability

Payment refundability is a transactionally authoritative predicate owned by the refund request
core. It answers whether the designated Order/Payment ledger can safely reserve the requested
amount now.

It uses stored payment and ledger evidence. Browser assertions, a prior page render, and advisory
business context cannot make this predicate true.

### 3.2 Merchant approval and review

Merchant approval is a human decision, or a future business-policy decision, informed by safe
advisory context. It answers whether the merchant has decided to attempt returning the amount.

Cases still awaiting this decision remain outside the refund ledger. Submitting the future admin
request control is the approval act; a separate review intake would require a separately designed
workflow and must not overload `RefundAttempt`.

### 3.3 Execution suitability

Execution suitability is owned by a future executor boundary. It answers whether the approved
intent can be executed:

- automatically through a supported provider rail;
- through a legitimate manual execution path; or
- not through any currently available execution path.

Execution suitability does not retroactively redefine merchant approval or payment
refundability. Request creation must not claim that provider refund capability was verified.

### 3.4 UI projection

The admin UI projects the authoritative decisions and safe advisory facts. It is not another
eligibility authority. A visible or enabled control is only advisory; a stale page never grants
permission to create a request.

## 4. Current v1 payment-refundability contract

The first workflow fails closed and creates no new request when any of these conditions holds:

- `Order.status` is not `PAID` or `PARTIALLY_REFUNDED`;
- another non-terminal attempt exists in `REQUESTED`, `PROCESSING`, `FAILED_RETRYABLE`, or
  `MANUAL_REVIEW`;
- the designated `Payment.status` is not `SUCCEEDED`;
- Order and designated Payment amount or currency do not match;
- the requested amount is zero, negative, not a safe integer, or exceeds the currently
  requestable balance;
- refund-ledger currencies are mixed or otherwise inconsistent;
- `Order.disputeStatus` is non-null under the temporary dispute rule in §7; or
- the designated Payment lacks a usable `providerPaymentKey` under the first-workflow evidence
  rule below.

The provider-payment-key rule is a current v1 data-integrity and first-provider-workflow
constraint. It is not an eternal intrinsic requirement for every possible merchant refund. It
may be revisited only after a real manual or off-provider execution rail is designed. Until then,
missing reference evidence fails closed rather than adding another unresolved execution gap.
Presence of the key does not prove that a refund execution rail exists or supports this request.

Provider refund capability is not verified by these checks. Provider capability, supported
amount behavior, and automatic/manual routing remain execution-suitability concerns.

## 5. Amount and currency contract

Let:

```text
C = designated captured Payment amount
S = sum of SUCCEEDED refund amounts
R = sum of guarded amounts in:
    REQUESTED
    PROCESSING
    FAILED_RETRYABLE
    MANUAL_REVIEW
```

Then:

```text
remaining refundable = max(0, C - S)
currently requestable = max(0, C - S - R)
```

Rules:

- A request equal to the entire currently requestable amount is permitted. When no amount was
  previously refunded or reserved, this permits a request equal to the full captured amount `C`.
- A request above the currently requestable amount fails closed.
- Zero and negative requests fail.
- `FAILED_TERMINAL` and `CANCELLED` release their reservation.
- `FAILED_RETRYABLE` and `MANUAL_REVIEW` retain their reservation.
- Amounts are stored and validated as minimum-unit safe integers.
- KRW and JPY are not multiplied by 100. USD is stored in cents at the boundary-established
  minimum unit.
- The designated stored Payment currency is authoritative.
- The browser never supplies authoritative currency.
- Raw Payment IDs, provider references, provider keys, and refund identifiers are not request UI
  inputs.

Line-item, shipping, tax, discount, return, and customs allocation semantics are not modeled.
The v1 ledger can reserve an order-level amount safely, but it does not explain which commercial
components that amount represents. Operator guidance for partial refunds remains an open
business-policy decision.

Financial arithmetic must remain in shared refund-domain helpers and server read-model
projections. It must not be copied into JSX or recomputed from current catalog/cart data.

## 6. Historical ledger consistency

The target policy requires every existing refund attempt for the Order to remain consistent with
the designated Payment identity, currency, provider, and mode. Invalid amounts, mixed identity,
or contradictory aggregate evidence fail closed.

The request and close cores both enforce historical attempt payment, currency, provider, and mode
consistency against the designated Payment. Request creation performs this validation after exact
replay resolution and before ordinary new-request eligibility or any write. Close keeps its
additional Order, Payment, target, and resting-state checks within the close transaction.

Normal request writers derive those fields from the designated Payment, so this is not a claim
that normal rows are currently mismatched. It is defense-in-depth hardening against legacy,
manual, corrupted, or future-writer inconsistencies.

Legacy attempts without creation-transition evidence retain their stored status and amount
semantics. Missing transition history does not release a guarded reservation or authorize a new
request; contradictory evidence fails closed under the applicable request/closure contract.

## 7. Temporary dispute rule

A non-null `Order.disputeStatus` is a temporary fail-closed request-creation rule.

Refunding while a chargeback or dispute may also return funds can create double-credit risk. The
current marker is an untyped nullable field, not a complete dispute lifecycle, and cannot support
phase-specific decisions safely. Request creation therefore blocks rather than guessing.

This blanket rule is not permanent policy. It may be relaxed only after a typed dispute and
chargeback state machine defines authoritative phases, ownership, evidence, and races with refund
execution.

## 8. Merchant-approval advisory context

Manufacturing, fulfillment, market, shipping country, and jurisdiction remain outside the v1
payment-refundability hard predicate. They inform merchant approval because they may affect
cancellation rights, return handling, commercial loss, terminal Order flavor, or legal duties;
they do not change captured-payment arithmetic.

The current data cannot establish those decisions reliably:

- `ManufacturingRequest` has a current status and optional start time, but no complete production
  writer or append-only transition history;
- no shipment or delivery state machine exists;
- current records cannot prove all return, cancellation, or restockability conditions; and
- market and shipping jurisdiction policy remains partly unresolved.

Production state, a missing MTO ManufacturingRequest, market, and shipping-country context may be
shown to an admin as advisory or review information. None independently authorizes or prohibits
payment refund creation in v1.

This does not prohibit future race-safe hard rules. Such a rule requires:

- a reliable lifecycle and authoritative evidence;
- transactional locking and rechecking of every participating row;
- a documented lock order and race owner; and
- behavioral tests for request creation versus the competing lifecycle transition.

Manufacturing cancellation or hold behavior remains a separate concern from payment-ledger
refundability unless a later design lock proves a concrete invariant requiring composition.

## 9. Execution-suitability boundary

Execution suitability is future work, separate from request creation. Potential outcomes are:

- automatic provider execution is available;
- legitimate manual execution is required; or
- no execution path is currently available.

The decision may depend on provider refund capability, provider reference use, automatic versus
manual routing, official provider semantics, normalized failure/result classes, and
reconciliation coverage.

This document does not design the executor, provider contract, outbox command, retries, or
resolution states. An approved request must not be activated in production when neither an
execution rail nor a genuine manual-resolution path exists.

## 10. UI projection and stale-state authority

The future admin UI may display safe projections including:

- captured amount;
- cumulative succeeded-refund amount;
- guarded/reserved amount;
- currently requestable amount;
- stored currency;
- whether another guarded attempt exists;
- safe advisory reason codes; and
- manufacturing, market, shipping-country, or dispute context appropriate for administrators.

The UI must not receive or expose:

- raw provider payment keys;
- provider refund identifiers;
- transition operation keys;
- payment/refund idempotency keys;
- raw provider payloads or raw errors; or
- internal actor user IDs.

The request transaction remains authoritative. A stale submission follows:

```text
submit
-> Order lock
-> authoritative reload
-> eligibility and amount recomputation
-> guarded write or structured rejection
-> refresh-and-inspect
```

Changes to Order status, refund attempts, dispute state, payment evidence, or any future hard
business predicate between render and submit are resolved by the locked transaction, not by the
old UI projection.

## 11. Browser retry and operation identity

The current admin action mints a new RefundAttempt UUID for every invocation. If the first request
commits, its response is lost, and the administrator submits again, the second invocation
normally observes `REFUND_PENDING` or the guarded attempt and is rejected without creating a
duplicate.

Therefore:

- current behavior is money-safe without stable browser identity;
- the second invocation is not an exact replay of the first;
- refresh-and-inspect is the current safe fallback; and
- a stable form-instance operation identity may improve exact replay, audit, and UX.

Stable browser identity is a form-boundary design choice, not a financial-safety eligibility
blocker. This document does not choose a deterministic operation key, client token, or issuance
mechanism.

## 12. Review terminology

Two different review concepts must never share one undifferentiated meaning.

### 12.1 Merchant review required before `REQUESTED`

- No `RefundAttempt` exists.
- The merchant has not approved the refund intent.
- This is advisory/business-decision workflow language.

A future UI should prefer explicit wording such as “merchant review required” for this state.

### 12.2 Persisted `RefundAttemptStatus.MANUAL_REVIEW`

- A guarded `RefundAttempt` already exists.
- Merchant-approved intent was already recorded.
- Execution or provider evidence is ambiguous, or the attempt is operationally parked.
- The amount remains reserved.

This docs-only slice does not rename the Prisma enum. Action and UI error taxonomies must avoid
using one bare `MANUAL_REVIEW_REQUIRED` label for both concepts without additional context.

## 13. Current activation hardening

### 13.1 Should fix before request UI

- Define and enforce a bounded reason input contract.
- Give request input the same plain-object validation posture as close input.
- Revalidate the admin order-detail path after successful request creation.
- Define explicit stale-state rejection copy and refresh-and-inspect behavior.

### 13.2 Safe to decide during form design

- Stable browser form token or operation identity.

### 13.3 Production rollout prerequisites

- A working execution rail or genuine manual-resolution path.
- Named operational ownership of pending and parked requests.
- An appropriate queue/worklist before general production availability.
- Notification policy before customer-initiated requests or terminal-failure customer
  communication.

Queue/worklist availability is an operational activation requirement, not part of payment
refundability.

## 14. Rollout gates

### 14.1 Before this eligibility document is complete

The architectural ownership and v1 fail-closed contract may be locked while the explicit
human/product questions in §15 remain open. Those questions must not be silently answered by
implementation.

### 14.2 Before request-core hardening

This eligibility SSOT must be accepted. The hardening slice must remain in the refund core with
behavioral and integration tests and must not activate UI or provider execution.

### 14.3 Before SANDBOX request UI

Follow the sequence in `order_refund_request_closure_v1.md` §16. Dormant MOCK execution and
provider-evidence resolution prerequisites remain mandatory unless a human explicitly amends
that sequence. Complete all §13.1 action/core hardening first.

### 14.4 Before restricted internal production UI

Require a working execution or legitimate manual-resolution path plus a runbook and named owner
for parked requests. A dedicated queue may be deferred only when the restricted operators can
reliably discover and resolve every request.

### 14.5 Before general production UI

Require:

- operational queue/worklist ownership;
- terminal-failure and withdrawal communication policy;
- a customer notification decision; and
- a production execution or manual-resolution path.

### 14.6 Before an automatic provider executor

Require a separate executor design lock covering:

- the official provider contract;
- execution idempotency;
- command/outbox ownership;
- response-loss behavior;
- retry, ambiguous, and terminal result taxonomy; and
- reconciliation.

## 15. Human and product decisions left open

1. Manufacturing/MTO cancellation cutoff and exclusions.
2. Jurisdictional return and refund windows.
3. Typed dispute and chargeback lifecycle.
4. Whether a real manual or off-provider refund execution rail will exist.
5. Whether the locked staged sequence should ever permit earlier SANDBOX form activation.
6. Operational queue ownership.
7. Customer refund-lifecycle notification behavior.
8. Order-level partial-refund guidance before line, shipping, tax, discount, and customs
   allocation exists.
9. Bounded reason format: structured reason code plus operator note, or bounded free text.

## 16. Current implementation boundary

Current code already provides transactional request creation, server-owned admin provenance,
guarded amount arithmetic, exact core replay for a reused attempt identity, historical attempt
identity consistency in request and close, request closure, and safe read-only admin/customer
projections. The request action remains dormant and no active UI creates requests.

Current gaps relevant to this contract are:

- bounded reason and plain-object request validation parity;
- request-success revalidation and explicit stale-state UI behavior;
- refund execution and provider-evidence resolution;
- operational queue/worklist ownership;
- complete manufacturing and delivery evidence; and
- typed dispute policy.

No current implementation should be described as having solved these future boundaries.

## 17. Explicit non-goals

This document does not implement or authorize:

- production or test code changes;
- schema or migration changes;
- an admin or customer request form;
- provider refund calls or executor design;
- queue, notification, webhook, outbox, or reconciliation behavior;
- ManufacturingRequest changes or manufacturing locks;
- a review-intake schema or approval status;
- customer refund/cancel controls;
- line, shipping, tax, discount, return, or customs allocation; or
- any database mutation or data backfill.
