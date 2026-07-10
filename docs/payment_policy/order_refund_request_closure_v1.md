# RefundAttempt Lifecycle Transition Audit and Request Closure — Design Lock v1

- **Date:** 2026-07-10
- **Status:** DESIGN LOCK — documentation only; this document does not implement code or schema.
- **Base commit context:** `d6e1845 feat(admin): read-only order detail with refund ledger and review summary`
- **Related:** `order_refund_state_machine_v1.md`, `payment_policy_confirmed_v6.md`, `payment_policy_open_v6.md`

## 1. Purpose and activation gate

This document locks two related contracts:

1. append-only audit evidence for the `RefundAttempt` lifecycle; and
2. cancellation of an unexecuted refund request.

It is a design lock, not an implementation. It authorizes no code, schema, action, UI,
provider, webhook, outbox, reconciliation, or data mutation by itself.

The admin refund request form must remain inactive. The current request flow creates a
`RefundAttempt` in `REQUESTED` and atomically changes an `Order` from `PAID` or
`PARTIALLY_REFUNDED` to `REFUND_PENDING`. No refund executor or request-close path currently
exists. Activating the form in that state would create a permanent operational dead end: the
order would remain `REFUND_PENDING`, the open attempt would block later requests, and an
operator would have no supported way to restore a resting state.

The transition-audit schema and close core defined here are prerequisites for form activation.
They are necessary but not sufficient: the later activation gates in §16 still apply.

## 2. Authoritative model responsibility

The future model name is `RefundAttemptTransition`.

Its responsibilities are limited to:

- append-only evidence of `RefundAttempt` lifecycle transitions;
- merchant, admin, and system decision audit;
- operation-level idempotent replay evidence; and
- evidence of the related `Order` status before and after the operation.

The model must never contain:

- raw provider payloads;
- raw webhook data;
- provider payment keys;
- provider refund response bodies;
- raw provider errors; or
- generic JSON metadata.

Provider evidence and merchant/system transition decisions are separate evidence domains.
Provider transmissions remain in `PaymentEvent`; provider refund identity and sanitized attempt
failure fields remain on `RefundAttempt`. `RefundAttemptTransition` records only the decision
edge, actor, reason, operation identity, and related order-state evidence.

## 3. Exact future Prisma model

The schema slice must implement this conceptual model:

```prisma
model RefundAttemptTransition {
  id                 String                  @id @default(cuid())

  refundAttemptId    String
  refundAttempt      RefundAttempt           @relation(
    fields: [refundAttemptId],
    references: [id],
    onDelete: Restrict
  )

  fromStatus         RefundAttemptStatus?
  toStatus           RefundAttemptStatus

  orderStatusBefore  OrderStatus
  orderStatusAfter   OrderStatus

  actorType          RefundAttemptActorType
  actorUserId        String?

  reason             String
  operationKey       String                  @unique
  createdAt          DateTime                @default(now())

  @@index([refundAttemptId, createdAt])
}
```

`RefundAttempt` gains only this inverse relation:

```prisma
transitions RefundAttemptTransition[]
```

This slice must not add:

- a duplicated `orderId`;
- `updatedAt`;
- JSON metadata;
- mutable cancellation fields;
- provider evidence fields;
- direct `PaymentEvent` reuse; or
- a generic `OrderEvent`.

`orderId` is derived through the immutable `RefundAttempt` relation. Duplicating it on the
transition would create a second source of truth that could disagree with
`RefundAttempt.orderId`. The current order-detail query can traverse
`Order → RefundAttempt → RefundAttemptTransition` using the existing order-attempt indexes and
the new `(refundAttemptId, createdAt)` index. A duplicated order key may be reconsidered only for
a demonstrated query requirement and only with database-enforced relational consistency.

Transition rows are append-only. They have no update or delete workflow and therefore no
`updatedAt`. `onDelete: Restrict` makes their audit ownership explicit: a `RefundAttempt` cannot
be deleted while transition evidence exists.

## 4. Database constraints

Prisma 7 cannot express the required PostgreSQL `CHECK` constraints in the Prisma schema. The
later schema slice must create its migration with `prisma migrate dev --create-only`, then edit
the generated SQL to add checks equivalent to the following rules:

1. `fromStatus IS NULL` if and only if `toStatus = REQUESTED`.
2. No legal non-null transition may target `REQUESTED`.
3. A non-null `fromStatus` must differ from `toStatus`.
4. `actorType = ADMIN` requires a non-null `actorUserId`.
5. A non-null `actorUserId` must not be blank after trimming.
6. `reason` must not be empty after trimming.

The creation rule should use the PostgreSQL boolean biconditional form:

```sql
CHECK (
  ("fromStatus" IS NULL) =
  ("toStatus" = 'REQUESTED'::"RefundAttemptStatus")
)
```

Additional checks conceptually equivalent to these are required:

```sql
CHECK ("fromStatus" IS NULL OR "fromStatus" <> "toStatus")

CHECK (
  "actorType" <> 'ADMIN'::"RefundAttemptActorType"
  OR "actorUserId" IS NOT NULL
)

CHECK ("actorUserId" IS NULL OR BTRIM("actorUserId") <> '')

CHECK (BTRIM("reason") <> '')
```

The biconditional creation check already prevents a non-null transition from targeting
`REQUESTED`. The migration may still name and document that invariant explicitly, but it must
not duplicate the same logical condition in competing forms.

The schema slice must verify against the repository's bundled Prisma 7 documentation and
tooling that later migration generation does not silently drop or recreate these manual
constraints. Application validation remains mandatory. SQL checks are final defense only.

Do not encode the full `RefundAttemptStatus` transition graph as SQL checks. The graph remains
owned by the refund-domain transition helper and behavioral tests; duplicating it in SQL would
create two transition-policy sources of truth.

## 5. Creation transition

The transition model supports lifecycle creation as:

```text
null → REQUESTED
```

The same row records the related order edge:

```text
PAID → REFUND_PENDING
```

or:

```text
PARTIALLY_REFUNDED → REFUND_PENDING
```

The existing `RefundAttempt` row remains valid creation evidence. The transition row adds the
explicit lifecycle edge, order edge, actor decision, and replay identity required by the new
audit contract.

Writing creation transitions is a separate STRICT retrofit after the schema slice. Existing
`RefundAttempt` rows must not receive guessed or fabricated transition rows. Rows without a
creation transition are explicitly pre-transition-audit legacy rows, and the attempt itself
remains their creation evidence.

## 6. Operation-key namespaces

The transition audit uses these operation-key namespaces:

```text
refund-request:{refundAttemptId}
refund-close:{refundAttemptId}:{operationId}
refund-exec:{refundAttemptId}:{executionCommandId}
refund-resolve:{refundAttemptId}:{resolutionId}
```

Rules:

- `operationKey` is globally unique within `RefundAttemptTransition`.
- Operation identity is server-issued; callers do not supply provider idempotency values.
- Provider idempotency remains separate from transition replay identity.
- A future stable executor command identity may derive a provider operation key at the provider
  boundary, but that does not turn this transition key into provider evidence.
- Do not add uniqueness on `(refundAttemptId, transitionType)` or equivalent. Legitimate
  lifecycles may repeat transition classes through retry and manual-resolution paths.

The operation namespace identifies the kind of logical command. The actual transition remains
typed by `fromStatus` and `toStatus`; no additional generic event-type or JSON field is needed.

## 7. Unexecuted request closure semantics

“Cancel an unexecuted refund request” means withdrawing a pre-provider-contact `REQUESTED`
attempt and restoring the order to its ledger-derived resting state.

All of these preconditions are required:

- `Order.status` is `REFUND_PENDING`.
- The target `RefundAttempt` belongs to that order.
- The target status is exactly `REQUESTED`.
- `providerRefundId` is null.
- No committed executor or refund-execution outbox claim exists.
- The target is the only non-terminal/open attempt.
- Order, Payment, and refund-ledger identities are internally consistent.
- Order, Payment, and refund-ledger amounts and currencies are internally consistent.

The transaction performs exactly these effects:

- `RefundAttempt`: `REQUESTED → CANCELLED`.
- `Order`: `REFUND_PENDING → PAID` when the succeeded sum is zero.
- `Order`: `REFUND_PENDING → PARTIALLY_REFUNDED` when the succeeded sum is positive and below
  the captured total.
- Append one `RefundAttemptTransition` recording both status edges and the close operation.

This use case explicitly excludes targets in:

- `PROCESSING`;
- `FAILED_RETRYABLE`; or
- `MANUAL_REVIEW`.

Those states may already involve provider contact or an ambiguous provider result. Closing them
requires separate provider-evidence resolution paths and cannot reuse this pre-contact
withdrawal contract.

Once an executor exists, `REQUESTED` must remain canonical proof that provider contact has not
started: the executor must commit its `PROCESSING` claim before external contact. A non-null
provider identity or committed execution claim contradicting `REQUESTED` fails closed.

## 8. Ledger-derived resting state

Restoration uses ledger evidence only. Do not store or read `previousOrderStatus`.

The succeeded sum is the sum of positive, valid amounts from `SUCCEEDED` attempts belonging to
the same order/payment and matching the locked payment/order currency. It yields:

| Succeeded sum | Close result |
|---|---|
| `0` | `PAID` |
| greater than `0` and less than total | `PARTIALLY_REFUNDED` |
| equal to total | `REFUND_LEDGER_INCONSISTENT` |
| greater than total | `REFUND_LEDGER_INCONSISTENT` |
| invalid amount | `REFUND_LEDGER_INCONSISTENT` |
| cross-currency attempt | `REFUND_LEDGER_INCONSISTENT` |

An equal-to-total sum must fail closed in this operation. Closure withdraws an unexecuted
attempt; it has neither the authority nor the fulfillment/provider evidence to terminalize the
order as `REFUNDED` or `CANCELLED`. Full-refund terminalization belongs to a successful refund
completion or resolution use case.

The close-core slice should create one narrow, pure SSOT helper for this validation and resting
state derivation. Keep it private to the close/refund domain initially, promote it when the
executor or manual-resolution path becomes a second consumer, and never duplicate the formula.

Ledger derivation is authoritative because cancelling a `REQUESTED` attempt removes no
successful money evidence. A stored previous status would duplicate derivable state and could
silently drift over multiple partial-refund rounds.

## 9. Transaction and lock ordering

Every future writer that mutates `RefundAttempt.status` or derives/writes order refund state must
follow this application architecture lock order:

```text
Order → target RefundAttempt
```

This is an application architecture contract, not a database-enforced constraint. Every future
request, close, executor, retry, webhook-resolution, reconciliation-resolution, and manual-review
writer in that class must follow it. A writer may perform a preliminary non-locking lookup to
discover immutable `orderId`, but its mutation transaction locks the order first.

CAS remains mandatory even with explicit row locks.

The closure transaction is:

1. Authorize outside the refund core.
2. Normalize input and generate server-issued operation identity and time.
3. Begin the database transaction.
4. Lock the `Order` with `SELECT ... FOR UPDATE`.
5. Lock the target `RefundAttempt` with `SELECT ... FOR UPDATE` and verify ownership.
6. Resolve exact `operationKey` replay.
7. Load Payment identity and sibling attempts.
8. Validate contact evidence, target status, open attempts, and ledger consistency.
9. Apply guarded CAS `RefundAttempt: REQUESTED → CANCELLED`.
10. Apply guarded CAS `Order: REFUND_PENDING → ledger-derived resting state`.
11. Insert the `RefundAttemptTransition`.
12. Commit.

Write-order rules:

- CAS writes happen before transition insertion.
- Returning a structured failure object is permitted only before any successful write.
- Any failure after the first successful write must throw a typed rollback error.
- Transaction-level error mapping occurs outside the transaction callback.
- `P2002` handling follows §11 rather than being blindly treated as an idempotency conflict.

The close operation does not lock:

- every sibling `RefundAttempt`;
- `Payment`; or
- `ManufacturingRequest`.

The order is the aggregate mutex for refund writers. The target lock stabilizes the row being
transitioned, while CAS remains the final race guard. Sibling attempts are read under the order
lock, Payment is immutable input for this operation, and MR is neither read nor changed.
Additional locks would protect no closure invariant and would increase contention and deadlock
surface.

## 10. Executor-claim race

A future executor claims work through:

```text
REQUESTED → PROCESSING
```

Closure and executor must both:

- lock the Order first;
- lock the target RefundAttempt second; and
- use a status-guarded CAS requiring `REQUESTED`.

Exactly one operation wins.

If closure wins:

- the executor claim affects zero rows; and
- the provider must never be contacted.

If the executor wins:

- close observes or re-reads the advanced/contact state; and
- close returns `PROVIDER_CONTACT_ALREADY_STARTED` without writes.

Provider contact before the `PROCESSING` claim transaction commits is forbidden. A future refund
execution outbox command and the `PROCESSING` claim must be committed atomically. An execution
command must never coexist with a still-`REQUESTED` attempt.

The CAS is the authoritative winner even though both operations also use explicit row locks.

## 11. Idempotency and replay

The close operation uses:

```text
refund-close:{refundAttemptId}:{operationId}
```

Exact replay compares:

- `operationKey`;
- `refundAttemptId`;
- `fromStatus`;
- `toStatus`;
- `actorType`;
- `actorUserId`;
- normalized `reason`; and
- the operation-specific expected `orderStatusBefore`.

Exact replay does not compare:

- current time;
- a newly generated `now`; or
- current `Order.status`.

The stored `orderStatusAfter` is historical output, not caller-controlled replay input. Replay
returns only safe stored values:

- `transitionId`;
- `refundAttemptId`;
- `toStatus`;
- `orderStatusAfter`;
- `createdAt`; and
- `replayed: true`.

The same key with differing immutable fields returns `IDEMPOTENCY_CONFLICT`.

Core replay exists only when the same server-issued operation identity is reused. A fresh browser
invocation that generates a new operation ID is money-safe but is not exact replay; stable
form-token issuance is a later UI-boundary decision.

On a `P2002` failure:

1. Re-read by `operationKey` outside the rolled-back transaction.
2. If immutable fields match, return exact replay.
3. If a row exists but conflicts, return `IDEMPOTENCY_CONFLICT`.
4. If no matching operation row exists, rethrow as an unexpected database failure.

This prevents unrelated unique-constraint failures from being mislabeled as idempotency
conflicts.

## 12. Evidence-strength grading

When an operation changes `Order.status`, `orderStatusBefore` and `orderStatusAfter` are
CAS-proven evidence of that order transition: the guarded predicate proves the before value, and
the written value defines the after value.

For attempt-only transitions where `Order.status` does not change, the two values are equal and
are lock-observed while holding the Order lock. Equal before/after values do not claim that an
order transition occurred. A future writer violating the Order-lock contract would weaken that
observation, which is why the lock contract is mandatory for every refund writer in this class.

## 13. Payment, provider, webhook, outbox, and MR semantics

Closure has no money-movement side effect. The following are locked:

- `Payment.status` remains `SUCCEEDED`.
- `Payment.VOIDED` remains completion-compensation semantics and is unrelated.
- No provider call occurs.
- No `PaymentEvent` row is written.
- No `PaymentOutbox` row is written.
- No webhook or reconciliation path participates.
- Payment initiation, confirmation, and completion are unchanged.
- No `ManufacturingRequest` is read, written, or locked.

Manufacturing and commercial refund eligibility belong to request creation and future execution
policy, not withdrawal of an unexecuted internal request. A future manufacturing hold/release
mechanism, if adopted, is a separate design and must not be inferred from this close operation.

## 14. Structured failures

Expected domain failures are:

- `INVALID_ORDER_ID`
- `INVALID_REFUND_ATTEMPT_ID`
- `INVALID_CLOSE_OPERATION_ID`
- `INVALID_REASON`
- `INVALID_ACTOR_USER_ID`
- `ORDER_NOT_FOUND`
- `REFUND_ATTEMPT_NOT_FOUND`
- `REFUND_ATTEMPT_NOT_CANCELLABLE`
- `PROVIDER_CONTACT_ALREADY_STARTED`
- `ORDER_STATUS_CONFLICT`
- `IDEMPOTENCY_CONFLICT`
- `REFUND_LEDGER_INCONSISTENT`

Classification rules:

| Condition | Failure |
|---|---|
| `PROCESSING`, `FAILED_RETRYABLE`, or `MANUAL_REVIEW` target | `PROVIDER_CONTACT_ALREADY_STARTED` |
| non-null provider identity or committed execution claim | `PROVIDER_CONTACT_ALREADY_STARTED` |
| `SUCCEEDED`, `FAILED_TERMINAL`, or `CANCELLED` target | `REFUND_ATTEMPT_NOT_CANCELLABLE` |
| guarded Order update loses | `ORDER_STATUS_CONFLICT` |
| contradictory ledger, payment, identity, currency, amount, or open-attempt state | `REFUND_LEDGER_INCONSISTENT` |

An attempt CAS loss before any write may re-read the target and return the appropriate structured
failure. An Order CAS loss occurs after the attempt write and therefore throws a typed rollback
error before mapping to `ORDER_STATUS_CONFLICT` outside the transaction.

Unknown database failures and deadlocks throw. They are not serialized as expected domain
failures.

## 15. Required future tests

The close-core slice requires real database integration coverage for:

- `REQUESTED` close with zero succeeded refunds restores `PAID`.
- `REQUESTED` close after earlier partial success restores `PARTIALLY_REFUNDED`.
- The target becomes `CANCELLED`.
- Transition evidence, target update, and Order update are atomic.
- `Payment.status` remains `SUCCEEDED`.
- Exact same-operation replay returns the original transition and creates no duplicate.
- Conflicting operation-key reuse returns `IDEMPOTENCY_CONFLICT`.
- Concurrent same-operation callers produce one transition and an exact replay.
- Concurrent distinct closes produce exactly one successful close.
- Close versus executor claim proves exactly one winner.
- `PROCESSING`, `FAILED_RETRYABLE`, and `MANUAL_REVIEW` targets are rejected.
- Non-null provider identity or contact evidence is rejected.
- Invalid, equal-to-total, over-total, or mixed-currency ledger state fails closed.
- Forced transition-insert failure rolls back target and Order writes.
- Forced guarded-update conflict rolls back all prior writes.
- `PaymentEvent` and `PaymentOutbox` remain unchanged.
- No provider module is imported or called.

The request-creation retrofit separately requires tests for `null → REQUESTED`, both permitted
Order edges, transition/request atomicity, exact replay, and no guessed legacy backfill.

## 16. Staged implementation sequence

Implementation order is locked as follows:

1. This docs-only design lock.
2. Schema-only `RefundAttemptTransition` plus migration and manual checks.
3. Request-creation transition-audit retrofit.
4. Narrow resting-state helper plus internal close core and integration tests.
5. Dormant admin close action.
6. Read-only transition rendering and `REQUESTED` close control.
7. Customer `REFUND_PENDING` copy decision and correction.
8. Authoritative manufacturing/commercial refund eligibility.
9. MOCK executor and provider-evidence resolution paths.
10. Only after all preceding gates, activate a MOCK/SANDBOX admin request form.

Each item is an isolated review/commit slice. No slice may pull provider execution, customer
controls, or later workflow states forward “while here.”

## 17. Customer copy

Customer copy is intentionally unresolved and does not block docs, schema, or close-core work.
Candidates are:

- `환불 요청 접수`;
- `환불 진행 중`; or
- phase-derived copy from the active `RefundAttempt.status`.

This is a product/human decision and must be resolved before form activation. The decision should
test at least two scenarios: a `REQUESTED` attempt later withdrawn with no money moved, and a
`PROCESSING` attempt that proceeds to provider resolution. No new `OrderStatus` is authorized by
this document.

## 18. Architecture protection

This design does not alter or weaken:

- payment initiation;
- payment confirmation;
- payment completion;
- provider routing;
- webhook handling;
- `PaymentEvent`;
- `PaymentOutbox` or reconciliation;
- `Payment.status` refund semantics;
- checkout; or
- customer order ownership and privacy.

The future close core reads locked Order/refund evidence and writes only the target
`RefundAttempt`, the related `Order`, and one `RefundAttemptTransition` in a single transaction.

## 19. Explicit out of scope

This design lock does not implement or authorize:

- real or MOCK provider execution;
- provider adapters or credentials;
- refund execution outbox topics;
- manufacturing holds;
- customer withdrawal controls;
- a generic audit table;
- expansion of `OrderStatus`;
- `Payment.status` changes;
- webhook-driven refund mutation;
- reconciliation-driven refund mutation;
- line-level refund allocation;
- shipping, tax, or customs refund calculations;
- admin refund request-form wiring; or
- speculative transition backfill.

## 20. Implementation-entry gate

The next implementation slice after human approval of this document is schema-only. It may touch
only `prisma/schema.prisma` and one generated migration for `RefundAttemptTransition` and the
manual checks in §4. It must not include request retrofit, close-core logic, actions, UI, provider
code, outbox, webhook, reconciliation, customer copy, or data backfill.

Before that schema slice is accepted, it must verify the manual PostgreSQL checks using the
repository's actual Prisma 7 tooling and confirm that migration generation preserves rather than
silently removes them. Runtime behavior remains prohibited until the later STRICT slices and
their tests are approved.
