# Customer Refund Intake - Design Lock v1

- **Date:** 2026-07-11
- **Status:** DESIGN LOCK - documentation only; this document changes no runtime behavior.
- **Base commit context:** `d15f533 feat(admin): add refund execution worklist`
- **Related:** `refund_request_eligibility_v1.md` (merchant-approved request creation),
  `order_refund_state_machine_v1.md` (Order state vocabulary),
  `order_refund_request_closure_v1.md` (pre-contact RefundAttempt closure),
  `refund_execution_v1.md` (approved-attempt execution), `payment_policy_open_v6.md`

---

## 1. Purpose and non-goals

This document is the authoritative policy source for customer-authored refund-review intake. A
`CustomerRefundIntake` records that the owner of an Order asked the merchant to review whether a
refund should be approved. It is a non-financial review artifact, not a refund ledger entry.

The distinctions are mandatory:

```text
CustomerRefundIntake.SUBMITTED
!= merchant approval
!= RefundAttempt.REQUESTED
!= provider execution
!= successful money return
```

This document owns the intake lifecycle, customer input, ownership, privacy, duplicate handling,
withdrawal, admin approval/rejection, Order interaction, customer wording, notification
classification, production activation gate, conceptual schema, and SANDBOX acceptance path.

It does not authorize schema, migration, action, UI, provider, worker, queue, notification, or
database changes. It does not change refundability, ledger arithmetic, execution, terminal Order
state, or provider policy owned by the related documents.

## 2. Lifecycle and statuses

V1 has exactly four statuses:

| Status | Meaning |
|---|---|
| `SUBMITTED` | The owning customer has submitted a non-financial request for merchant review. No merchant decision or money intent exists yet. |
| `WITHDRAWN` | The owning customer withdrew the intake before merchant approval. Terminal for this intake. |
| `REJECTED` | An administrator decided not to create a refund attempt from this intake. Terminal for this intake. |
| `APPROVED` | An administrator approved a specific merchant refund intent and atomically linked the intake to the newly created `RefundAttempt.REQUESTED`. Terminal for this intake. |

The only v1 transitions are:

```text
SUBMITTED -> WITHDRAWN   owning customer
SUBMITTED -> REJECTED    administrator
SUBMITTED -> APPROVED    administrator, atomically with RefundAttempt.REQUESTED creation
```

There is no `UNDER_REVIEW` status in v1. Reading an intake, assigning internal work, or discussing
it does not create another durable customer-visible phase. Terminal intake rows are immutable
except for data-repair procedures governed outside this workflow.

## 3. Financial boundary

An intake is non-financial. Submission, duplicate convergence, withdrawal, and rejection MUST NOT:

- create or mutate a `RefundAttempt`;
- reserve refundable balance;
- change `Order.status` or `Payment.status`;
- create an execution command or evidence;
- contact a provider; or
- imply approval, eligibility, execution, or successful money movement.

Only the `SUBMITTED -> APPROVED` transaction creates a merchant-approved financial intent. The
created `RefundAttempt.REQUESTED` then owns amount, currency, payment identity, provider/mode
identity, idempotency, ledger reservation, and later execution under the existing refund policy.

## 4. Customer amount policy

The customer intake has no editable or selectable refund amount. It MUST NOT store amount,
currency, line allocation, shipping allocation, tax allocation, customs allocation, or a requested
percentage.

The customer asks for review of the Order as a whole. The administrator selects the specific
amount during approval using authoritative stored Order, Payment, and refund-ledger evidence.
Customer wishes about scope may appear only in the optional explanation and do not bind the
approved amount. Customer copy MUST NOT imply that submitting the intake asks for, reserves, or
guarantees a full refund or any particular amount.

Customer partial-amount and item-level selection are deferred because line allocation is not
modeled; shipping, tax, discount, customs, and FX handling remain unresolved; and displaying a
"full remaining refund" could become an unapproved customer promise.

## 5. Customer reason contract

### 5.1 Reason category

Every submission requires exactly one category from this v1 product taxonomy:

- `단순 변심`
- `상품 하자`
- `배송 문제·지연`
- `기타`

These four Korean categories and their v1 business meanings are product-ratified. Exact database
enum symbols are deferred to the schema-design slice, and additional-language labels are deferred
to localization and UI design. A future taxonomy change requires a new policy version and MUST
NOT reinterpret historical intake records. Unknown values fail validation; callers do not invent
categories.

### 5.2 Optional detail

The customer may provide optional detail. It is trimmed before evaluation and storage. A value
that is empty after trimming is stored as absent, not as an empty string. A present normalized
detail is limited to 500 Unicode code points. The maximum is mandatory, is measured in code points
rather than UTF-16 code units or bytes, and MUST NOT be enforced through silent truncation.

Unicode General Category `Cc` control characters are rejected, except that ordinary line breaks
MAY be supported only under a precise normalization rule locked and tested by the schema/core
design slice. Unicode General Category `Cf` handling is deferred to that slice. An implementation
must not classify all whitespace as a control character or accidentally accept arbitrary control
characters.

The UI must warn the customer not to enter card numbers, bank-account or bank credentials,
authentication credentials, tokens, or other payment credentials and secrets. This is input
policy and guidance, not a claim that free text is automatically detected, redacted, or sanitized.
The stored text MUST NOT be described as sanitized.

The owning customer may view the category and normalized detail on their own intake. Submitted
reason content is not editable. A customer who wants to replace it must withdraw the still-open
intake and submit a new one.

An authenticated administrator reviewing the intake MAY access its reason category and optional
customer detail solely for intake review and merchant decision-making; this does not authorize
visibility on unrelated admin surfaces.

### 5.3 Separation from merchant rationale

Customer intake text MUST NOT be automatically copied into:

```text
RefundAttempt.reason
RefundAttemptTransition.reason on the null -> REQUESTED creation edge
```

Approval requires a separate, non-empty merchant rationale satisfying the existing normalized
refund-request reason bounds. An administrator MAY deliberately summarize relevant customer facts
into that rationale, but no verbatim or automatic copy is permitted. The merchant rationale is
admin-only audit evidence; customer intake text remains customer-authored review context.

Neither intake text nor the intake identifier may become provider request data, a provider key,
an idempotency key, execution evidence, a transition operation key, or provider diagnostics.

## 6. Provenance and actor boundary

The intake preserves customer and review provenance through, conceptually:

- `customerUserId` and `submittedAt` for submission;
- `withdrawnAt` for customer withdrawal;
- `reviewedAt` and `reviewedByUserId` for admin approval or rejection; and
- `approvedRefundAttemptId` for the exact approved financial intent.

Do not add `CUSTOMER` to `RefundAttemptActorType`. A customer does not author a
`RefundAttemptTransition`. Approval creates the `null -> REQUESTED` transition with actor type
`ADMIN` and the approving administrator's identity. Customer provenance remains on the intake.

V1 does not require a `CustomerRefundIntakeTransition` table. The row's terminal timestamps,
review identity, status, and approved-attempt link are the bounded v1 lifecycle evidence. A future
multi-step or reassignment workflow may revisit append-only intake events through a separate lock.

## 7. Ownership and privacy

All customer reads and writes require an authenticated server-side session and an ownership query
anchored by both `Order.id` and `Order.userId == session.user.id`. Missing and non-owned Orders or
intakes MUST be indistinguishable to the caller. A hidden field, route parameter, or intake ID is
never ownership proof.

Customer callers may supply only the owned Order identifier, reason category, optional reason
detail, and a future server-issued transport token if separately designed. They MUST NOT supply or
override:

- customer user identity;
- amount, currency, payment, provider, or mode;
- refund-attempt or execution identity;
- idempotency, operation, command, evidence, or lease keys;
- eligibility, approval, reviewer, or status fields; or
- timestamps.

Customer surfaces may display only the customer's own broad intake state, reason category and
detail, submission time, withdrawal state, generic rejection state, and post-approval progress
derived from `Order.status`. They MUST NOT expose merchant rejection rationale, merchant refund
rationale, `Payment`, `RefundAttempt`, command, transition, or evidence identifiers, provider/mode
as refund-operation data, provider references, command or lease state, dispatch attempts, internal
failure codes or diagnostics, raw payloads, internal operation keys, other customers' data, or
hidden storage identifiers.

## 8. Duplicate submission and idempotency

There is at most one `SUBMITTED` intake per Order. This invariant requires a durable partial unique
index, not only an application pre-check.

Duplicate submits and transport retries converge to safe success with the existing `SUBMITTED`
row. A retry with changed category or detail does not mutate the existing row and does not create a
second open intake. V1 does not introduce an intake operation token.

After an intake reaches `WITHDRAWN` or `REJECTED`, a new intake may be submitted if current policy
permits it. An `APPROVED` intake does not authorize another intake; current Order and refund-ledger
eligibility governs any future path.

## 9. Customer withdrawal

Withdrawal is available only for the owning customer's `SUBMITTED` intake. The transaction uses
the canonical lock order:

```text
authorize owner
-> lock Order
-> lock target CustomerRefundIntake
-> verify SUBMITTED and ownership
-> guarded SUBMITTED -> WITHDRAWN CAS
-> set withdrawnAt
-> commit
```

Withdrawal creates no `RefundAttempt`, contacts no provider, changes no Order or Payment state,
and releases no financial reservation because the intake never reserved one.

Approval and withdrawal race on the same Order then intake locks and the same `SUBMITTED` guarded
transition. Exactly one wins. After approval, customer withdrawal is unavailable. Customer-facing
fallback copy is:

```text
환불 진행 중인 요청은 고객센터로 문의해주세요.
```

That copy does not authorize closing the linked `RefundAttempt`; any pre-contact attempt closure is
the separate admin contract in `order_refund_request_closure_v1.md`.

## 10. Admin rejection and approval

### 10.1 Rejection

An administrator may transition only `SUBMITTED -> REJECTED`. A rejection rationale is required.
It is admin-only, trimmed, non-empty, limited to 500 Unicode code points, and never silently
truncated. Rejection records that rationale with `reviewedAt` and `reviewedByUserId`. It uses a
guarded `SUBMITTED -> REJECTED` CAS or equivalent one-winner transition and races with approval and
withdrawal; exactly one operation wins, and a loser returns a safe current-state or conflict
result. Rejection creates no `RefundAttempt` and changes no Order or Payment state. The rationale
is not customer-visible.

Customer copy is exactly:

```text
온라인 환불 요청을 진행할 수 없습니다.
자세한 내용은 고객센터로 문의해주세요.
```

### 10.2 Approval transaction

Intake approval is one explicit merchant approval act. The authoritative transaction is:

```text
authorize administrator
-> begin transaction
-> lock Order
-> lock CustomerRefundIntake
-> verify SUBMITTED, relation, and customer ownership provenance
-> revalidate current refund-request eligibility
-> select the authoritative refund amount
-> require a separate normalized merchant rationale
-> create RefundAttempt.REQUESTED using the existing request semantics
-> create its null -> REQUESTED transition
-> link approvedRefundAttemptId one-to-one
-> set intake APPROVED, reviewedAt, and reviewedByUserId
-> commit atomically
```

No half-state is legal: an `APPROVED` intake always links to its exact created attempt, and an
attempt created through intake approval always has its intake link. Exact replay of the same link
returns safe success. A conflicting attempt link or reuse fails closed.

If eligibility changed since submission, approval fails with no writes and the intake remains
`SUBMITTED`. The administrator may later approve after authoritative conditions permit or
explicitly reject it. Submission-time display or eligibility is never authority for approval.

## 11. Order and other refund interaction

Submission, withdrawal, and rejection do not change `Order.status`. `REFUND_PENDING` begins only
when approval atomically creates `RefundAttempt.REQUESTED`, following the existing request core.

Independent admin-created refund attempts remain permitted by their existing eligibility
contract; an intake is not a global lock on merchant refund work. If an independent refund makes
intake approval ineligible, approval fails without changing the intake. The administrator must
explicitly reject the intake with an appropriate admin-only rationale, such as supersession. No
automatic `SUBMITTED -> REJECTED` transition is inferred from another refund.

## 12. Customer-facing wording

Customer copy describes review intake, not financial execution.

For `SUBMITTED`:

```text
환불 검토 요청이 접수되었습니다.
환불 가능 여부 확인 후 안내드립니다.
```

For `REJECTED`:

```text
온라인 환불 요청을 진행할 수 없습니다.
자세한 내용은 고객센터로 문의해주세요.
```

For `WITHDRAWN`:

```text
환불 검토 요청이 철회되었습니다.
```

`APPROVED` has no long-lived intake-specific progress copy. After approval, the existing Order and
refund-status presentation is authoritative. Customer UI MUST NOT expose `REQUESTED`, provider
contact, execution commands, or internal review phases.

## 13. Notification classification

The following are non-blocking for schema, dormant core, and SANDBOX work:

- on-screen submission acknowledgement;
- on-screen withdrawal acknowledgement; and
- authenticated in-app progress display.

Before production activation, product and legal owners must decide:

- whether approval creates a proactive notification;
- whether rejection creates a proactive notification;
- whether terminal refund failure creates a proactive notification; and
- whether each notification is in-app only or uses email, SMS, push, or another channel.

This document implements no notification transport and makes no delivery guarantee.
`MANUAL_REVIEW` remains an internal refund-attempt state and is not a customer notification state.

## 14. Manufacturing, legal, and activation gate

Permission to submit an intake is not proof that a refund is eligible for approval. A future
availability projection may consider an owned Order in `PAID` or `PARTIALLY_REFUNDED`, while
excluding an active refund workflow, dispute conflict, or existing `SUBMITTED` intake. That
projection is advisory and must not bypass transaction-time approval eligibility.

Schema, dormant server contracts, tests, and SANDBOX end-to-end work may proceed under this design
lock. Production customer intake UI MUST remain dormant until explicit legal and product signoff
confirms that offering a no-promise review intake is appropriate under the custom-wig/MTO
production rules, applicable cancellation and refund rights, jurisdictional notice obligations,
and customer-support process.

The intake UI must not promise eligibility, amount, approval, production cancellation, provider
contact, successful refund, or completion timing. A production button is not authorized merely
because the intake itself is non-financial.

## 15. Conceptual schema requirements

The future schema slice should model these fields:

```text
id
orderId
customerUserId
status
reasonCode
reasonDetail
submittedAt
withdrawnAt
reviewedAt
reviewedByUserId
rejectionReason
approvedRefundAttemptId
createdAt
updatedAt
```

Field ownership is locked as follows:

- the server owns identity, status, timestamps, and relations;
- the authenticated customer owns the category and optional detail at initial submission only;
- the reviewing administrator owns `reviewedByUserId` and `rejectionReason`;
- the approval transaction owns `approvedRefundAttemptId`; and
- authoritative Order, Payment, refund amount, currency, provider, mode, and eligibility remain
  outside the intake.

Expected database invariants include:

- an `Order` relation with explicit restrictive delete behavior;
- core enforcement that `customerUserId` matches the locked Order owner;
- a partial unique index permitting at most one `SUBMITTED` row per Order;
- a unique nullable `approvedRefundAttemptId` relation;
- status-dependent nullability checks for withdrawal, review, rejection, and approval fields; and
- no provider, payment, amount, currency, operation-key, command, evidence, dispatch, or lease
  columns.

V1 adds no intake transition table. Exact Prisma types, enum code names, constraint SQL, migration
shape, and replay keys require a separate schema recon and implementation review.

## 16. SANDBOX end-to-end acceptance path

A future SANDBOX-only acceptance flow is:

```text
owned customer Order
-> customer intake submission
-> production-dormant merchant approval core
-> RefundAttempt.REQUESTED
-> existing claim core
-> existing dispatch authorization
-> deterministic MOCK provider
-> existing result resolver
-> refreshed customer-safe Order state
```

The approval core under test must be the real dormant production module, not a fake approval
helper. Provider invocation and resolver composition MAY continue to use the existing test-only
worker harness. The acceptance flow must prove:

1. an authenticated customer opens an owned eligible Order;
2. the customer submits one category and optional bounded detail;
3. the Order and Payment remain unchanged and no `RefundAttempt` exists;
4. duplicate submission converges to the same `SUBMITTED` intake;
5. the owning customer can view and withdraw a submitted intake, with no financial effects;
6. for a separate submitted intake, an administrator reviews authoritative current evidence,
   chooses amount, and supplies a separate merchant rationale;
7. approval atomically creates one `RefundAttempt.REQUESTED`, its creation transition, and the
   one-to-one intake link while moving the Order to `REFUND_PENDING`;
8. the existing claim, dispatch authorization, deterministic MOCK provider, and result resolver
   may then process only that approved attempt; and
9. customer surfaces show intake wording before approval and existing Order/refund wording after
   approval, without provider internals or merchant-only rationale.

The smoke must also cover the approval-versus-withdrawal race and changed-eligibility failure. It
must not add a production scheduler, production worker, real provider, customer execution control,
or admin provider-call button, and must not activate production routing.

## 17. Deferred decisions and capabilities

Deferred to separately reviewed slices:

- exact Prisma enum/code names, migration SQL, and database CHECK expressions;
- customer and admin actions, pages, forms, and authorization tests;
- server-issued browser operation tokens if later needed;
- precise ordinary-line-break normalization;
- final legal and product activation approval;
- reason labels in additional languages beyond the locked Korean v1 labels;
- a safe customer-visible rejection-code taxonomy;
- intake history beyond the bounded row lifecycle;
- notification channels and templates;
- abuse throttling;
- expiry;
- a multi-step `UNDER_REVIEW` workflow;
- intake editing;
- customer amount or item selection;
- automated statutory-right approval;
- customer-support escalation and response-time policy;
- MTO production cutoff, return logistics, jurisdictional rules, and legal copy;
- line, shipping, tax, discount, customs, and return allocation;
- production eligibility projection and activation;
- production worker, provider finality, retry, and recovery;
- real-provider refund execution, webhook, and reconciliation; and
- analytics, search, filtering, retention, deletion, and data-subject handling beyond existing
  legal/privacy requirements.

Deferred does not mean undefined where this v1 policy already locks the default behavior.
