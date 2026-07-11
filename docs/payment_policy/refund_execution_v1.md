# Refund Execution and Evidence Resolution - Design Lock v1

- **Date:** 2026-07-11
- **Status:** DESIGN LOCK - documentation only; this document changes no runtime behavior.
- **Base commit context:** `c9ad7b5 fix(refund): harden refund request action contract`
- **Related:** `refund_request_eligibility_v1.md` (request creation),
  `order_refund_request_closure_v1.md` (pre-contact withdrawal),
  `order_refund_state_machine_v1.md` (domain transition vocabulary and Order states),
  `a3_outbox_design_v2.md` (capture-compensation transport precedent)

---

## 1. Purpose and ownership

This document is the authoritative provider-neutral and SANDBOX policy for refund execution and
evidence resolution. It owns:

- execution claim;
- durable execution-command ownership;
- provider-neutral money-operation identity;
- command leasing, retry readiness, and parking;
- append-only execution evidence and source deduplication;
- provider-result classification and evidence application;
- ambiguity, manual review, retry, and terminal resolution;
- the close-versus-claim race;
- refund-execution effects on `Order` and `Payment`;
- webhook, lookup, reconciliation, and manual-resolution ownership; and
- operational activation gates.

It does not own:

- request-creation eligibility (`refund_request_eligibility_v1.md`);
- pre-contact `REQUESTED -> CANCELLED` withdrawal
  (`order_refund_request_closure_v1.md`);
- customer refund-request UI;
- provider-specific API fields or finality guarantees; or
- manufacturing or cancellation eligibility.

This document authorizes no schema, migration, executor, worker, provider, queue, action, UI, or
database mutation by itself. Real-provider behavior still requires an official-provider design
lock under `AGENTS.md` section 7.

## 2. Stable responsibility split

Four refund records have distinct responsibilities:

| Record | Owns | Does not own |
|---|---|---|
| `RefundAttempt` | Merchant-approved money intent, immutable financial identity, provider-neutral idempotency key, and current refund-domain status. | Dispatch state or append-only external observations. |
| `RefundExecutionCommand` | Durable pending execution work and its mutable operational dispatch projection. | Refund-domain truth or provider evidence. |
| `RefundExecutionEvidence` | One immutable provider, lookup, webhook, reconciliation, or operator observation. | Current attempt status or mutable work scheduling. |
| `RefundAttemptTransition` | One append-only refund-domain decision edge, actor, operation identity, and related Order-state evidence. | Provider evidence; its reason cannot substitute for execution evidence. |

One `RefundAttempt` has at most one `RefundExecutionCommand`. The command is the sole source of
truth for pending refund execution work, but `RefundAttempt` remains the source of truth for the
domain lifecycle.

`PaymentEvent` remains payment/webhook transmission evidence. It is not reused as the refund
execution evidence model because manual and synchronous observations do not share its
transmission semantics, and raw provider payload storage does not belong in the refund ledger.

## 3. Atomic execution claim

The claim core is trigger-independent. A future administrator, scheduler, poller, worker, or
queue consumer may invoke it only through an explicitly activated boundary; this document does
not choose that trigger.

The claim transaction is:

```text
Order FOR UPDATE
-> RefundAttempt FOR UPDATE
-> validate authoritative aggregate
-> guarded REQUESTED -> PROCESSING CAS
-> create one RefundExecutionCommand
-> append REQUESTED -> PROCESSING RefundAttemptTransition
-> commit
```

All three writes occur in one transaction. Command-creation or transition-insertion failure
rolls back the attempt claim. Claim performs no provider call.

The claim validates at least:

- the target belongs to the locked Order and designated Payment;
- Order remains `REFUND_PENDING`;
- target status is exactly `REQUESTED`;
- no execution command already exists except an exact claim replay;
- `providerRefundId` is null;
- Payment remains `SUCCEEDED` and has the provider payment reference required by the selected
  execution capability;
- amount, currency, provider, mode, and historical sibling identity are consistent; and
- the current single-open-attempt invariant holds.

Claim replay uses `refund-exec-claim:{commandId}` as its distinct transition operation identity.
The operation key is deterministically derived from the server-generated command ID, globally
unique through the transition operation-key constraint, and stable for historical claim replay.
It is not caller-supplied, the request-creation operation key, `RefundAttempt.idempotencyKey`, or
provider-visible. It is not reused for result persistence, retry re-arm, reconciliation, manual
resolution, or provider contact.

The safe claim result exposes only local IDs, statuses, and replay state. It does not expose the
provider payment reference or provider operation key.

## 4. Close-versus-claim race

Pre-contact close and execution claim both use:

```text
Order FOR UPDATE
-> target RefundAttempt FOR UPDATE
-> REQUESTED status CAS
```

Exactly one wins.

- If close wins, the claim changes no row, creates no command or transition, and the provider is
  never contacted.
- If claim wins, close observes or re-reads `PROCESSING` or the committed command, returns the
  existing safe `PROVIDER_CONTACT_ALREADY_STARTED` classification, and performs no writes.

Provider contact before the claim transaction commits is forbidden. A command may never coexist
with a still-`REQUESTED` attempt.

## 5. Stable meaning of `PROCESSING`

`PROCESSING` means:

> The refund intent has been durably claimed and a durable execution command exists. Provider
> contact is authorized and may already have occurred, but provider acceptance and successful
> money return are not proven.

This remains true while the command is ready, before a worker starts, while a lease is active or
expired, during a provider call, after accepted-pending evidence, while waiting for evidence, or
after a worker crash following possible provider contact.

`PROCESSING` does not mean only:

- a worker is currently running;
- an HTTP request is currently in flight;
- the provider accepted the operation; or
- money moved.

Operational command status expresses dispatch detail. The attempt remains `PROCESSING` when an
accepted operation is pending or execution evidence is still awaited.

## 6. Command authority and lifecycle

`RefundExecutionCommand` is an immutable execution intent through its one-to-one relation to a
`RefundAttempt`, plus a mutable operational projection. It is not an evidence log and does not
replace the attempt lifecycle.

The first dormant MOCK lifecycle supports conceptually:

```text
READY
-> LEASED
-> DONE
 | WAITING_EVIDENCE
 | WAITING_RETRY
 | PARKED

WAITING_RETRY -> READY
LEASED -> READY (eligible expired lease only)
```

Rules:

- `WAITING_RETRY -> READY` requires explicit domain authorization and an `availableAt` policy.
- Lease acquisition uses CAS and persists a stable dispatch-attempt ordinal before provider
  contact.
- Lease expiry retains the same `RefundAttempt.idempotencyKey`, but expiry alone neither proves
  non-execution nor authorizes another provider invocation.
- Recovery after possible contact is permitted only as same-key idempotent replay under an
  established adapter/provider guarantee. Without that guarantee, the command waits or parks for
  evidence resolution instead of calling the provider again.
- `DONE` means terminal attempt/evidence application completed; it is not proof of success by
  itself.
- `PARKED` is operationally non-runnable and requires operator or reconciliation ownership.

This lock does not choose retry count, backoff, lease duration, parking threshold, or worker
hosting. No delivery-attempt or lease-history model is required for dormant MOCK; production
observability may justify one later.

## 7. `PaymentOutbox` boundary

The first dormant MOCK dispatch mechanism is direct polling of `RefundExecutionCommand`.

`PaymentOutbox` is not:

- the refund source of truth;
- the execution command;
- the retry-policy owner;
- the ambiguity-policy owner; or
- sufficient terminal refund evidence.

Its current hard retry ceiling, zombie recovery, JSON payload, and `FAILED` state are designed
around completion compensation and do not carry refund-domain evidence semantics.

A later production optimization may emit a transport wake-up that references a command ID. The
command remains authoritative, wake-up loss must not lose work, and transport state must never
replace command or attempt state. No `PaymentOutbox` wake-up belongs in the first command schema.

## 8. Provider-neutral money-operation identity

The existing immutable `RefundAttempt.idempotencyKey` is the provider-neutral refund
money-operation identity. It is:

- stable for the attempt lifetime;
- reused for every safe retry and idempotent replay;
- never regenerated;
- not browser-controlled; and
- not duplicated into a command operation-key column.

An adapter may deterministically derive a provider wire key when official format or length rules
require it. The derivation must preserve one logical refund operation, remain deterministic, and
be documented against official provider requirements. It must not create a second authoritative
local identity.

The command does not copy amount, currency, provider, mode, payment ID, or provider payment
reference for the first architecture. The immutable attempt and designated Payment remain the
financial identity source and are validated under the locked Order aggregate.

Transition, provider, and observation identities remain distinct:

```text
request creation     refund-request:{refundAttemptId}
pre-contact close    refund-close:{refundAttemptId}:{operationId}
execution claim      refund-exec-claim:{commandId}
execution result     refund-exec-apply:{evidenceId}
provider operation   RefundAttempt.idempotencyKey
worker observation   refund-result:{commandId}:{dispatchAttempt}
webhook observation  refund-webhook:{provider}:{providerTransmissionId}
reconciliation       refund-reconcile:{refundAttemptId}:{reconciliationRunId}
manual resolution    refund-resolve:{refundAttemptId}:{resolutionId}
```

## 9. Provider-neutral adapter contract

Conceptual input is limited to:

```text
provider payment reference
positive minimum-unit amount
currency
stable provider-neutral operation identity
```

The free-text refund reason is not transmitted by default. A provider-specific fixed code or
safe bounded description, if required, belongs to a later official-provider lock.

Normalized result categories are:

| Result | Meaning |
|---|---|
| `SUCCEEDED` | Authoritative final refund success. |
| `ACCEPTED_PENDING` | Provider accepted or registered the operation, but final outcome is pending. |
| `NOT_EXECUTED_RETRYABLE` | Provider/adapter proves no money movement occurred and replay with the same identity is safe. |
| `NOT_EXECUTED_TERMINAL` | Provider/adapter proves no money movement occurred and the operation must not retry. |
| `UNKNOWN` | Contact or outcome cannot be classified safely. |

A generic network exception is `UNKNOWN` unless the adapter proves that no provider contact or
execution occurred. `UNKNOWN` must never become an automatic retry merely because the error looks
transient.

Provider refund/reference ID is optional in every generic result. The contract does not assume
that every provider supplies one at acceptance or completion.

MOCK memoizes immutable input by `RefundAttempt.idempotencyKey`. Identical replay returns the
same logical outcome; conflicting reuse fails closed. MOCK must support deterministic success,
accepted-pending, confirmed retryable non-execution, confirmed terminal non-execution, and
unknown outcomes for behavioral tests.

## 10. `providerRefundId` authority

`RefundAttempt.providerRefundId` is the authoritative current provider-refund identity
projection.

- It is null before a provider-issued identity is observed.
- The resolution core first writes it in the same transaction that applies or parks the evidence
  carrying it.
- Authoritative success or accepted-pending evidence may supply it.
- Once non-null, it is immutable.
- A later observation with the same ID is compatible.
- A different non-null ID is conflicting evidence and cannot drive terminal success or failure.

Evidence rows may record the identity they observed, but do not become a second current-value
authority. A conflict is persisted as `CONFLICT` and moves or retains a non-terminal attempt in
`MANUAL_REVIEW`. If a contradictory observation arrives after a terminal attempt, terminal state
is not silently reopened; the conflict is retained and escalated as a data-integrity/manual-repair
finding.

Admin UI receives only identity presence unless another policy explicitly permits more. Request
replay does not compare `providerRefundId` because it is execution evidence, not request input.

## 11. Append-only execution evidence

`RefundExecutionEvidence` records every durable provider or operator observation needed for
resolution, including synchronous adapter responses, verified lookups, webhooks,
reconciliation observations, and manual evidence.

Required conceptual fields for dormant MOCK are:

- evidence ID;
- command and `RefundAttempt` relations;
- evidence source;
- globally unique source-dedup key;
- normalized outcome;
- immutable application classification;
- observed provider refund/reference ID, when supplied;
- reported amount and currency, when supplied;
- bounded normalized safe code and safe message;
- observation timestamp; and
- creation timestamp.

Application classifications are:

| Application | Meaning |
|---|---|
| `APPLIED` | New authoritative compatible evidence changed an allowed domain, command, or provider-identity projection. |
| `PARKED` | New compatible evidence lacks authority for the requested terminal result and remains guarded pending later resolution. |
| `DUPLICATE` | A new-key compatible observation adds no decision because its result is already reflected. |
| `CONFLICT` | New-key evidence contradicts immutable identity or existing applied evidence. |

Classification describes the evidence's relationship to the authoritative aggregate, not merely
whether any projection changed. The resolver applies this precedence:

1. An existing `sourceDedupKey` with the exact immutable observation returns the stored
   application without a new row or write. Changed immutable evidence under that key returns
   `EVIDENCE_IDEMPOTENCY_CONFLICT` without a write.
2. Aggregate or artifact corruption that prevents safe attribution fails closed without an
   evidence row.
3. A new-key immutable-identity contradiction is inserted as `CONFLICT`.
4. A new compatible observation whose result is already reflected is inserted as `DUPLICATE`.
5. A new authoritative compatible observation changing allowed projections is inserted as
   `APPLIED`.
6. A new compatible observation lacking terminal authority is inserted as `PARKED`.

A `CONFLICT` observation may move a non-terminal attempt to or retain it in `MANUAL_REVIEW` and
park the command; its application remains `CONFLICT`, not `APPLIED`. The application records the
evidence-to-aggregate meaning, while `RefundAttemptTransition` records the safe domain reaction.
Safely attributable conflict evidence arriving after a terminal attempt is retained as
`CONFLICT`, does not reopen the attempt, leaves the command `DONE`, and requires later operational
review.

Evidence is immutable after insertion. A parked observation later consumed by a resolution does
not change from `PARKED` to `APPLIED`. The later decision is represented by a new resolution
operation, observation/linkage, append-only transition, and current-state projection updates. A
future mutable application projection, if useful, must be a separately owned record.

Evidence contains no raw JSON, credentials, secrets, provider payment keys, unrestricted errors,
stack traces, or duplicated Order identity. The adapter boundary emits only bounded, redacted safe
diagnostics for persistence.

## 12. Source-specific trust matrix

One resolution core applies all sources; source trust does not create competing transition
writers.

| Source | Direct authority |
|---|---|
| Synchronous adapter response | May apply `SUCCEEDED`, `NOT_EXECUTED_RETRYABLE`, or `NOT_EXECUTED_TERMINAL` only when the adapter classifies the result authoritatively. `ACCEPTED_PENDING` waits; `UNKNOWN` parks unless immediate authoritative lookup resolves it. |
| Verified provider lookup | May apply verified success or confirmed non-execution. |
| Webhook | Persists evidence, but is not generic terminal authority. Provider-specific verification/lookup is required unless a later official-provider policy grants verified webhook authority. |
| Reconciliation | May apply only lookup-level authoritative evidence. |
| Operator/manual | Requires a dedicated authorized resolution operation, bounded justification, source attribution, and the same locks/CAS. Raw provider payload is forbidden. |

The first exported result-resolution entry point accepts only `ADAPTER_RESPONSE`. Lookup,
webhook, reconciliation, operator, and stale-worker entry points remain deferred; reserving their
source enum values grants no runtime authority.

## 13. Evidence deduplication

Source-dedup identity distinguishes exact observation replay, a later new observation, an
equivalent duplicate, and contradictory evidence.

- Worker result: `refund-result:{commandId}:{dispatchAttempt}`. `dispatchAttempt` is a persisted
  ordinal allocated before that provider-call attempt, not a process-local UUID. Re-persisting
  the same result uses the same key.
- Webhook: `refund-webhook:{provider}:{providerTransmissionId}`. Real-provider identity and
  verification rules are deferred.
- Reconciliation: `refund-reconcile:{refundAttemptId}:{reconciliationRunId}`, with a stable run
  ID for one reconciliation execution.
- Manual resolution: `refund-resolve:{refundAttemptId}:{resolutionId}`, server-issued.
- Lookup: one stable operation identity per genuine lookup observation; process retry must not
  generate unlimited duplicate rows.

A fresh manual browser invocation with a new server-issued resolution ID is not exact replay, but
the Order/attempt/command locks and status CAS still prevent a second money application.

One dispatch ordinal identifies one provider invocation. The resolver derives
`refund-result:{commandId}:{dispatchAttempt}` internally; callers do not supply the source,
source-dedup key, Order ID, RefundAttempt ID, Payment identity, provider, mode, expected
amount/currency, or provider operation identity. Persistence retries for that invocation reuse
its original normalized observation, ordinal, and evidence key. A newly authorized provider
invocation receives a new durable ordinal; lease reacquisition alone does not authorize it.
Process-local UUIDs are never worker-evidence dedup identities.

An exact key replay compares command, source, outcome, observed provider-refund identity,
reported amount, reported currency, normalized safe code, normalized safe message, and
`observedAt`. `application` is computed and is not caller evidence. Exact match returns the stored
historical evidence/result even after Attempt, Command, or Order projections advance; mismatch is
`EVIDENCE_IDEMPOTENCY_CONFLICT` with no write. The persistence retry must preserve `observedAt`
and normalized diagnostics exactly, so a safe-message difference is a conflict. Equivalent
observations under different valid source operations may be recorded as `DUPLICATE` without
applying money twice.

Normalization must be deterministic. Safe-message normalization cannot read the clock or include
random values, invocation counters, process-specific content, raw provider errors, secrets, or
internal identifiers.

## 14. State-transition evidence prerequisites

The existing transition graph remains authoritative. Execution adds these prerequisites:

| Transition | Required evidence/operation |
|---|---|
| `REQUESTED -> PROCESSING` | Atomic claim and durable command; no provider evidence. |
| `REQUESTED -> CANCELLED` | Pre-contact withdrawal owned exclusively by `order_refund_request_closure_v1.md`; no command exists. |
| `PROCESSING -> SUCCEEDED` | Authoritative success with consistent attempt/payment/provider/amount/currency identity. |
| `PROCESSING -> FAILED_RETRYABLE` | Confirmed non-execution with safe retry classification. |
| `PROCESSING -> FAILED_TERMINAL` | Definitive zero-money terminal evidence. |
| `PROCESSING -> MANUAL_REVIEW` | Ambiguity, identity conflict, amount/currency conflict, or another unsafe-to-apply finding. |
| `FAILED_RETRYABLE -> PROCESSING` | Explicit retry authorization, same command, same provider operation identity. |
| `FAILED_RETRYABLE -> FAILED_TERMINAL` | Later definitive zero-money evidence. |
| `MANUAL_REVIEW -> SUCCEEDED` | Verified success evidence. |
| `MANUAL_REVIEW -> FAILED_TERMINAL` | Definitive zero-money evidence. |
| `MANUAL_REVIEW -> PROCESSING` | Proof that retry is safe plus explicit retry authorization. |

Existing `FAILED_RETRYABLE -> CANCELLED` and `MANUAL_REVIEW -> CANCELLED` edges remain
operator-only vocabulary. They require proven non-execution and a separately locked operator
policy. Dormant MOCK does not implement them, and the generic pre-contact close control must not
act on either status.

## 15. Attempt-command consistency

| Attempt status | Required command state |
|---|---|
| `REQUESTED` | No command. |
| `PROCESSING` | Exactly one command in `READY`, `LEASED`, or `WAITING_EVIDENCE`. |
| `FAILED_RETRYABLE` | Same command in `PARKED` when no retry schedule is authorized or after policy exhaustion; `WAITING_RETRY` only under a separately trusted retry policy. |
| `MANUAL_REVIEW` | Same command in `WAITING_EVIDENCE` or `PARKED`. |
| `SUCCEEDED` / `FAILED_TERMINAL` | Command `DONE`. |
| Pre-contact `CANCELLED` | No command. |

Future evidence-gated post-contact cancellation must define command terminalization separately.
Any attempt/command mismatch is a fail-closed operational finding, not permission for silent
repair.

## 16. Retry contract

### 16.1 Domain retry versus same-key idempotent replay

A **domain retry** is the explicit `FAILED_RETRYABLE -> PROCESSING` re-arm. It is allowed only
after evidence confirms non-execution and preserves the same attempt, command, and
`RefundAttempt.idempotencyKey`.

A **same-key idempotent replay** after an uncertain or possibly contacted dispatch is not a
domain retry and creates no new refund intent. The worker may replay the same logical provider
operation only when the applicable adapter/provider contract establishes that the same operation
identity cannot create a second logical refund and safely returns or recovers the original
operation. Deterministic MOCK provides this guarantee by memoizing that stable identity; support
by any real provider must be verified later from official documentation.

Lease expiry alone is not proof of non-execution. If provider contact is proven not to have
occurred, ordinary redispatch is safe. If contact may have occurred, same-key replay requires the
guarantee above. Without it, the command must not automatically call the provider again and moves
or remains in `WAITING_EVIDENCE`, `PARKED`, or `MANUAL_REVIEW` through the existing resolution
contract. Same-key replay is never the `FAILED_RETRYABLE -> PROCESSING` domain transition.

### 16.2 Retry policy and operational failures

Retry policy owns retry budget, backoff, `availableAt`, re-arm authorization, and escalation to
`PARKED` or `MANUAL_REVIEW`. This lock deliberately chooses no numeric values. Fields needed to
support the policy may exist in the dormant schema without assigning production values.

The first generic adapter-response resolver does not own a retry policy. It parks confirmed
retryable non-execution instead of selecting `WAITING_RETRY`, inventing `availableAt`, or
authorizing another dispatch. `WAITING_RETRY` becomes legal only when provider-specific retry
classification, backoff, scheduling, and execution ownership are decided together.

Credential, authorization, configuration, disabled-account, or equivalent operational failures
may authoritatively prove non-execution, but that alone does not make blind automatic retry useful.
Unless a later provider-specific policy classifies the condition as safely and usefully
auto-retryable, the command is `PARKED` for operator/configuration intervention. The attempt may
remain `FAILED_RETRYABLE` when correction and explicit re-arm remain possible. No additional
provider result category is introduced.

`UNKNOWN`, accepted-pending, provider-identity conflict, or amount/currency conflict cannot
automatically retry. They require authoritative lookup or manual resolution.

## 17. Evidence-resolution transaction

### 17.1 First adapter-response freshness boundary

The first exported entry point accepts a new `ADAPTER_RESPONSE` only when all of these facts hold
under lock:

```text
RefundAttempt.status = PROCESSING
RefundExecutionCommand.status = LEASED
input dispatchAttempt = persisted command.dispatchAttempt
dispatchAttempt > 0
```

Exact equality is required; `dispatchAttempt <= command.dispatchAttempt` is not sufficient. A
stale ordinal may be real evidence, but its handling belongs to later lease/worker recovery
policy. Existing-key replay is resolved before freshness checks, so exact persistence replay
remains valid after projections advance. `READY`, `WAITING_EVIDENCE`, `WAITING_RETRY`, `PARKED`,
and `DONE` accept no new adapter-response observation in this slice and may only acknowledge an
exact previously persisted replay.

### 17.2 Atomic application

Every writer that applies execution evidence uses:

```text
Order FOR UPDATE
-> RefundAttempt FOR UPDATE
-> RefundExecutionCommand FOR UPDATE
-> authoritative sibling/evidence reads
```

The transaction:

1. resolves evidence-operation replay or deduplication;
2. validates attempt, command, designated Payment, provider, amount, currency, and existing
   provider-refund identity;
3. computes the immutable evidence application classification from the locked state;
4. inserts the immutable evidence row;
5. applies the allowed attempt CAS;
6. updates Order status when required;
7. updates command status;
8. writes the first compatible `providerRefundId` when supplied;
9. appends a `RefundAttemptTransition` for each domain-status change; and
10. commits.

Classification is computed before insertion so the evidence row is never mutated. Steps 3-4 are
one logical evidence write. Any failure after the first write throws and rolls back evidence and
all domain changes together.

Expected contradictory evidence should be retained as `CONFLICT` and safely parked when the
transition graph permits. It must not be discarded merely because it cannot drive the requested
terminal transition. Recording still observes privacy, bounded-text, and immutable-identity
constraints.

Future stale-worker, webhook, lookup, reconciliation, and manual entry points must serialize
through this transaction. Their authority and freshness rules are deferred; the first
adapter-response entry point must not silently admit them.

## 18. Result application

### 18.1 Verified success

- Record compatible authoritative evidence as `APPLIED`.
- Require a present positive reported amount/currency pair exactly matching the RefundAttempt and
  designated Payment.
- Apply `PROCESSING -> SUCCEEDED`; set `processedAt = now`; clear `failedAt`, `failureCode`, and
  `safeFailureMessage`.
- Persist the first compatible provider identity when supplied; a provider refund ID is not
  mandatory for generic success.
- Derive cumulative succeeded amount including the target.
- Move Order to `PARTIALLY_REFUNDED` or `REFUNDED` per section 19.
- Keep `Payment.status` `SUCCEEDED`.
- Move command `LEASED -> DONE`; clear lease fields and last-safe-error projections; append the
  transition.

### 18.2 Accepted pending

- Record `ACCEPTED_PENDING` as `APPLIED` to command state.
- Keep attempt `PROCESSING`; keep `processedAt`, `failedAt`, `failureCode`, and
  `safeFailureMessage` null; compatibly first-write `providerRefundId` when supplied.
- Move command `LEASED -> WAITING_EVIDENCE`; clear lease fields and last-safe-error projections.
- Keep Order `REFUND_PENDING` and Payment unchanged.
- Do not create a self-transition for the attempt.

`APPLIED` is correct because authoritative command and possibly provider-identity projections
changed. The provider operation has an outstanding finality obligation, so `WAITING_EVIDENCE` is
semantically valid. Restricted or general production activation remains blocked until a durable
lookup, webhook, reconciliation, or equivalent finality-acquisition owner exists; none is
implemented by this policy clarification.

### 18.3 Confirmed retryable non-execution

- Record the evidence as `APPLIED`.
- Apply `PROCESSING -> FAILED_RETRYABLE`; keep `processedAt` and `failedAt` null; project the
  canonical normalized diagnostic to `failureCode` and `safeFailureMessage`.
- Keep Order `REFUND_PENDING` and the amount reserved.
- Move command `LEASED -> PARKED`; clear lease fields and project the same diagnostic to
  `lastSafeErrorCode` and `lastSafeErrorMessage`.
- Keep Payment unchanged. No automatic retry is scheduled or authorized.

`FAILED_RETRYABLE + PARKED` is coherent: the Attempt states that same-identity retry remains
permissible, while the Command states that no retry is currently authorized.

### 18.4 Confirmed terminal non-execution

- Require definitive zero-money evidence and record it as `APPLIED`.
- Apply `PROCESSING -> FAILED_TERMINAL`; keep `processedAt` null; set `failedAt = now`; project the
  canonical normalized diagnostic to `failureCode` and `safeFailureMessage`.
- Restore Order to `PAID` when prior succeeded sum is zero, otherwise
  `PARTIALLY_REFUNDED` when it is below captured total.
- Move command `LEASED -> DONE`; clear lease fields and project the same diagnostic to its
  last-safe-error fields. Keep Payment unchanged.

### 18.5 Unknown or conflicting outcome

- Record a compatible `UNKNOWN` observation as `APPLIED`.
- Apply `PROCESSING -> MANUAL_REVIEW`; keep `processedAt` and `failedAt` null; project the
  canonical ambiguity diagnostic to `failureCode` and `safeFailureMessage`.
- Move command `LEASED -> PARKED`; clear lease fields and project the same diagnostic to its
  last-safe-error fields.
- Keep Order `REFUND_PENDING`, preserve the guarded amount, and keep Payment unchanged.
- Do not automatically retry or release the reservation. `WAITING_EVIDENCE` is not selected in
  the first slice because no named durable evidence-acquisition path owns the case.

### 18.6 Diagnostic projection ownership

`RefundExecutionEvidence.safeCode` and `safeMessage` are the immutable normalized diagnostic for
one observation. `RefundAttempt.failureCode` and `safeFailureMessage` are the current refund-domain
failure or manual-review projection and already have an admin-detail reader.
`RefundExecutionCommand.lastSafeErrorCode` and `lastSafeErrorMessage` are the current operational
execution projection.

One normalized safe candidate is reused for every applicable projection; each table must not
normalize or rewrite it independently. Every non-success outcome requires a stable canonical,
bounded, deterministic, non-sensitive `safeCode`, even when the adapter supplies no code. Exact
code strings are selected in the implementation slice. `safeMessage` may be null; when present it
must be bounded, deterministic, privacy-safe, and free of raw provider text, timestamps, random
values, secrets, and internal identifiers.

### 18.7 Amount, currency, and provider-identity conflicts

Every supplied normalized amount/currency pair must match the RefundAttempt and designated
Payment. `SUCCEEDED` additionally requires the pair to be present. A success observation with no
pair is insufficiently authoritative: insert it as `PARKED`, move the Attempt to `MANUAL_REVIEW`,
park the Command, and keep the Order `REFUND_PENDING`. A supplied mismatched pair is `CONFLICT`.

A different non-null observed provider-refund ID from the authoritative Attempt projection is
`CONFLICT`; the projection is never overwritten. Non-execution and `UNKNOWN` evidence may record
an observed provider ID but cannot establish the Attempt projection. Malformed or raw values are
not persisted. In the first slice, a safely attributable new amount/currency or provider-identity
conflict moves `PROCESSING -> MANUAL_REVIEW`, moves `LEASED -> PARKED`, retains Order
`REFUND_PENDING`, and leaves Payment unchanged; the evidence application remains `CONFLICT`.

### 18.8 Result-transition operation identity

`refund-exec-apply:{evidenceId}` identifies a RefundAttempt status transition caused by execution
evidence. It is derived from the server-generated immutable evidence ID, globally unique through
the transition operation-key constraint, stable for replay, and not caller-supplied. It is not a
request, close, claim, provider-operation, evidence-source-dedup, retry, reconciliation, or manual
resolution identity.

Use this namespace only when RefundAttempt status changes. `ACCEPTED_PENDING` creates no
RefundAttempt self-transition. A `CONFLICT` or `PARKED` observation that safely moves a
non-terminal Attempt to `MANUAL_REVIEW` uses the same evidence-derived transition namespace while
retaining its own evidence application classification.

## 19. Order and Payment effects

Order remains `REFUND_PENDING` while an attempt is `REQUESTED`, `PROCESSING`,
`FAILED_RETRYABLE`, or `MANUAL_REVIEW`.

Verified success derives Order status only from consistent succeeded-ledger evidence:

```text
0 < cumulative SUCCEEDED amount < captured Payment amount
-> PARTIALLY_REFUNDED

cumulative SUCCEEDED amount == captured Payment amount
-> REFUNDED

cumulative SUCCEEDED amount <= 0 where success is being applied
or cumulative SUCCEEDED amount > captured Payment amount
or mixed/invalid currency or amount
-> fail closed; retain/enter MANUAL_REVIEW and preserve REFUND_PENDING
```

Generic refund execution never produces `OrderStatus.CANCELLED`. `CANCELLED` is a separate
commerce/fulfillment outcome requiring a separately proven policy. The existing Order status and
attempt transition vocabulary is retained for that future operator path.

Definitive zero-money terminal evidence restores `PAID` when there is no prior verified refund,
or `PARTIALLY_REFUNDED` after an earlier partial success.

`Payment.status` remains `SUCCEEDED`. Refund history belongs to `RefundAttempt` and Order state;
no refunded Payment status is added. `Payment.VOIDED` remains completion-compensation semantics.

The customer `REFUND_PENDING` copy remains truthful across every guarded execution state because
it promises neither provider acceptance, successful money movement, nor timing.

## 20. Full-success derivation ownership

The existing resting-state helper intentionally handles only non-full closure results. Result
resolution must introduce or deliberately expand one pure, reviewed derivation for verified
success:

```text
less than captured -> PARTIALLY_REFUNDED
equal to captured  -> REFUNDED
greater/mixed      -> fail closed
```

Do not force full-success behavior into the current helper without explicitly changing its
ownership and tests. Money arithmetic remains positive minimum-unit integer arithmetic; KRW/JPY
are never multiplied by 100.

## 21. Minimum dormant MOCK schema contract

### 21.1 `RefundExecutionCommand`

Required conceptual fields:

- ID;
- unique `refundAttemptId` relation;
- command-status enum;
- `availableAt`;
- nullable lease owner and lease-until timestamp;
- persisted non-negative dispatch-attempt ordinal/count;
- nullable bounded last safe error code and message; and
- creation/update timestamps.

Required constraints/indexes:

- one command per attempt;
- `onDelete: Restrict`;
- non-negative counter;
- coherent lease fields where supported by repository migration convention;
- polling index for command status and `availableAt`; and
- lease-expiry index appropriate to the final query.

Reject duplicated provider operation key, amount, currency, provider, mode, payment reference,
raw payload, or provider-specific fields.

### 21.2 `RefundExecutionEvidence`

Required conceptual fields are those in section 11, with:

- `onDelete: Restrict` relations;
- database-enforced consistency between the evidence command relation and attempt relation; the
  schema slice must use a compound relation or another hard constraint rather than application
  convention alone;
- globally unique source-dedup key;
- append-only ownership;
- positive reported amount when present and coherent amount/currency shape;
- bounded safe text constraints;
- command/attempt/source/time indexes; and
- source enum values sufficient for worker response, lookup, webhook, reconciliation, and
  operator evidence.

Reserving source enum values does not implement those ingestion paths. No delivery-history table
or `PaymentOutbox` row is required for dormant MOCK.

Exact Prisma names, nullable combinations, text bounds, and manual PostgreSQL checks require a
separate schema-design/recon slice. This document locks responsibilities and invariants, not a
migration.

## 22. Dormant dispatcher boundary

The first worker/runtime harness:

- polls eligible command rows directly;
- leases with CAS and a persisted dispatch ordinal;
- invokes the provider-neutral adapter outside a DB transaction;
- persists results only through the resolution core;
- is callable from tests or a local SANDBOX harness; and
- has no production scheduler, cron, route, UI button, or automatic trigger.

No real provider adapter, request-form activation, execution button, or automatic production
claim is authorized.

## 23. Webhook, lookup, reconciliation, and manual ownership

The resolution core is the only refund state-application writer. Other paths may authenticate,
verify, normalize, and submit evidence; they do not independently terminalize an attempt or
Order.

- Webhook ingress deduplicates provider transmission identity and stores only normalized refund
  evidence in this model. Existing `PaymentEvent` may retain transmission evidence, but does not
  directly change refund state.
- Lookup records a stable observation and may supply terminal authority according to the
  provider-specific contract.
- Reconciliation discovers stale/inconsistent command, attempt, provider identity, and evidence
  states. It may apply only verified lookup-level evidence through the same core.
- Manual resolution requires authenticated actor provenance, bounded justification, stable
  operation identity, and the same locks/CAS.

Webhook and worker races resolve under Order -> attempt -> command locking. Late evidence after a
compatible terminal result is duplicate evidence; contradictory late evidence is retained and
escalated, never used for silent terminal reversal.

MOCK does not require webhook or real-provider reconciliation. Unknown/pending MOCK modes still
require deterministic test resolution paths before any UI activation.

## 24. Operational queue and rollout gates

A read-only queue is not required for unit/integration testing of the dormant MOCK executor.

Before restricted internal production execution, require:

- named operator ownership;
- a runbook; and
- reliable discovery of active, retryable, and parked requests; and
- a durable finality-acquisition owner for every path that can produce `WAITING_EVIDENCE`.

Before general production, require:

- a read-only refund worklist;
- terminal-failure and withdrawal communication policy;
- customer notification decision;
- named execution/manual-resolution ownership; and
- real-provider reconciliation design.

The worklist may show safe Order reference, attempt status, amount/currency, age, retry/manual
indicator, and detail link. It must not expose provider payment keys, raw evidence, or unrestricted
errors. `FAILED_TERMINAL` remains available for historical filtering but is not active work by
default.

## 25. Human and product decisions left open

This document does not decide:

- initial claim trigger;
- retry maximum or backoff;
- lease duration;
- parking threshold;
- worker deployment;
- manual/off-provider execution support;
- evidence retention period;
- production queue ownership or hours;
- real-provider idempotency/finality;
- webhook terminal authority;
- reconciliation cadence; or
- evidence-gated post-contact cancellation policy.

Lease acquisition and worker dispatch, stale-ordinal evidence, lease-expiry replay, retry budget
and backoff, retry re-arm, provider lookup, webhook authority, reconciliation, operator/manual
resolution, worklist/queue implementation, database-level evidence immutability, and production
finality-acquisition ownership remain deferred. No numeric retry or lease values are selected.

It does ratify command/evidence separation, the revised `PROCESSING` meaning,
`RefundAttempt.idempotencyKey` authority, `providerRefundId` projection authority, full verified
refund to `REFUNDED`, and unchanged `Payment.status` semantics.

## 26. Staged implementation entry

After human acceptance, implementation remains isolated:

1. Schema-only command/evidence models and migration, with Prisma 7/manual-check recon.
2. Claim core plus replay, rollback, and close-race integration tests.
3. Evidence-resolution core and verified-success/resting-state derivation tests.
4. Provider-neutral adapter plus deterministic MOCK.
5. Dormant command poller/lease harness and crash/idempotency tests.
6. Retry and manual/reconciliation resolution cores.
7. Read-only operational discovery.
8. SANDBOX activation review.
9. Request-form activation only after all existing eligibility gates pass.

Each slice must preserve payment initiation, confirmation, completion, provider routing,
`PaymentEvent`, `PaymentOutbox`, checkout, customer ownership/privacy, and manufacturing policy.

## 27. Explicit non-goals

This design lock does not implement or authorize:

- Prisma schema or migration changes;
- command/evidence runtime code;
- provider calls or adapters;
- worker deployment;
- queue UI;
- refund request or execution controls;
- real-provider webhook ingestion;
- reconciliation cadence;
- customer notifications;
- manufacturing policy;
- `PaymentOutbox` extension;
- Payment status changes; or
- database backfill or mutation.
