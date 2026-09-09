# Refund Execution Exact-Command Lease and Fencing - Policy Amendment v2

Prospective source amendment: [durable refund execution authorization v1](refund_execution_authorization_v1.md)
scopes post-M consumed-canary ordinal-zero re-entry and retires that lane's READY detour.
Existing contact/result and separately authorized recovery retain their owners. No live activation is granted.


- **Date:** 2026-07-16
- **Status:** PROPOSED DESIGN LOCK - documentation only; normative only after review and commit.
- **Amends:** `refund_execution_v1.md`
- **Act boundary:** ACT E2A - EXACT-COMMAND REFUND EXECUTION LEASE AND FENCING
- **Implementation state:** Not implemented by this document.

---

## 1. Authority and effective date

This document is a versioned amendment to `refund_execution_v1.md`, not a complete restatement of
that policy. After this amendment is reviewed and committed, it is the authoritative policy for:

- exact-command lease acquisition;
- separation of a command-lease incarnation from provider-dispatch authorization;
- lease-generation and lease-token fencing;
- E2A time, gate, schema, transaction, and non-contact boundaries; and
- allocation of the superseded dormant harness responsibilities to later acts.

For those subjects, this amendment supersedes the named v1 clauses in section 3. All v1 provisions
not explicitly superseded remain authoritative. References elsewhere in the repository to
`refund_execution_v1.md` remain valid for unaffected refund-execution policy; exact-command lease
semantics must additionally follow this amendment after it becomes effective.

The adjudicated E2A contract is locked for later implementation, but E2A runtime implementation
remains prohibited until this amendment is reviewed and committed. Committing this policy does not
enable a feature gate, create a production caller, or change runtime behavior.

## 2. Historical and current implementation truth

This amendment changes documentation authority only. The current repository still contains a
dormant combined authorizer that:

- changes a command from `READY` to `LEASED`;
- increments `dispatchAttempt`; and
- returns provider request material.

That combined authorizer is not production-reachable, is not policy-compliant E2A, and must not be
wired into production. The later E2A implementation slice must remove it rather than preserve it as
a second dormant or ungated path.

The current dormant adapter-response resolver also predates this separation. It remains
production-unreachable and must continue to fail closed for an E2A `LEASED` command whose
`dispatchAttempt` is zero. The repository does not yet have the lease-generation column,
lease-token digest, corrected lease constraints, E2A gate, or compliant exact-command lease
primitive required below. This document does not claim otherwise.

## 3. v1 contradiction and authority map

| v1 section | Existing v1 statement | v2 replacement or clarification | Authority effect | Reason |
|---|---|---|---|---|
| §4, close-versus-claim | A successful claim causes close to use the conservative `PROVIDER_CONTACT_ALREADY_STARTED` classification. | The close behavior and safe classification remain. The classification does not prove that provider contact is authorized or has occurred; claim and E2A lease alone authorize no provider contact. | Retained with clarification. | Preserve close safety without treating a conservative taxonomy label as a dispatch fact. |
| §5, `PROCESSING` | Claim means provider contact is authorized and may already have occurred. | `PROCESSING` means the intent is claimed and a command exists. Provider contact becomes authorized only through the later E3 dispatch-authorization boundary and may have occurred only after that boundary. | Superseded for provider-contact meaning. | Claim, lease possession, and provider contact are separate capabilities. |
| §6, command lifecycle | Lease acquisition persists a dispatch-attempt ordinal before provider contact. | Lease acquisition increments `leaseGeneration`, creates a token digest, and leaves `dispatchAttempt` unchanged. E2A implements no `LEASED -> READY`, reclaim, renewal, or expiry recovery. | Superseded for lease acquisition and E2A recovery. The no-blind-retry rule is retained. | A lease incarnation is not a provider invocation. |
| §6 and §25, duration | v1 chooses no lease duration. | E2A uses one module-owned fixed five-minute dormant-only duration. It is not the final operational duration; E2B/E2C must select that policy. | Narrowly superseded for E2A only. | Deterministic dormant leasing needs a bounded deadline without prematurely fixing production operations. |
| §7, dispatch mechanism | The first dormant mechanism directly polls commands. | E2A is exact-command only and performs no discovery or polling. Discovery and polling belong to E2C. The `PaymentOutbox` boundaries remain unchanged. | Polling sentence superseded for E2A; outbox rules retained. | Avoid coupling lease correctness to an unselected worker runtime. |
| §8 and §9, provider identity/request | The attempt idempotency key and provider-neutral request are later provider-operation inputs. | Those identities and adapter rules remain authoritative for later dispatch. E2A neither derives nor returns provider request material. | Retained with an E2A boundary clarification. | Possessing a lease must not confer provider-call capability. |
| §11, execution evidence | Evidence records normalized provider, lookup, webhook, reconciliation, or operator observations. | Evidence remains external execution-observation data. Lease acquisition, possession, expiry, and fencing are not evidence and E2A creates no evidence row. | Retained with clarification. | Internal lease bookkeeping must not masquerade as provider observation. |
| §13, dispatch ordinal | One dispatch ordinal identifies one provider invocation and is allocated before that provider-call attempt; lease reacquisition alone does not authorize it. | Those statements remain authoritative. Allocation occurs only in a later E3 dispatch-authorization transaction, never in E2A lease acquisition. | Retained and made controlling over the old §6/§22 coupling. | This is the stable provider-invocation identity boundary. |
| §16.1, expiry and replay | Expiry does not prove non-execution; possible contact cannot blindly retry. | Retained without weakening. E2A adds no recovery or automatic reclaim, even though it performs no contact itself. | Retained. | Recovery needs a later durable provider-contact fact and explicit policy. |
| §17.1, fresh adapter response | Fresh adapter response requires `LEASED`, exact positive `dispatchAttempt`, and `PROCESSING`. | The current dormant resolver retains this fail-closed boundary and therefore rejects E2A leases with ordinal zero. Future result application must also prove the applicable lease generation/token fence; E2B/E4 own that extension. | Retained for current dormant behavior; amended for future fencing. | E2A must not accidentally activate result application. |
| §18, result application | Authoritative observations drive the existing evidence, attempt, command, and Order outcomes. | Those outcome and atomic-application rules remain. E4 must add the applicable generation/token fence before any new observation can use them after E3 dispatch authorization. | Retained with a future fence prerequisite. | Preserve verified result semantics without letting ordinal-only possession authorize a write. |
| §21.1, command schema | Lease owner/deadline and nonnegative dispatch ordinal are the minimum command lease fields. | Add `leaseGeneration` and `leaseTokenHash`, strengthen lease coherence, and retire `LEASED -> dispatchAttempt > 0`. Other v1 command fields and non-duplication rules remain. | Superseded and extended for E2A schema. | The schema must represent lease possession independently of provider invocation. |
| §22, dormant dispatcher | One harness polls, leases with a dispatch ordinal, calls the provider, and resolves the result. | E2A only leases one caller-supplied command ID with generation/token fencing. It has no polling, provider request, provider call, or result application. | Superseded for the next implementation boundary. | The combined harness hides distinct safety and activation boundaries. |
| §25, deferred decisions | Lease acquisition, worker dispatch, and all numeric lease values are deferred. | Exact-command E2A lease semantics and its dormant five-minute constant are now locked. Worker dispatch, operational duration, expiry recovery, and provider contact remain deferred as allocated in section 14. | Partially superseded. | Freeze only the adjudicated minimal slice. |
| §26 item 5, staged entry | A combined dormant poller/lease harness is one implementation step. | Replace that combined step with the isolated E2A/E2B/E2C/E3/E4 ownership sequence in section 14. | Superseded for future sequencing. | Lease, worker, provider call, and result persistence must not land as one act. |
| §27, non-goals | A design lock does not itself implement schema, runtime, provider, or worker behavior. | Retained. This amendment itself changes no runtime or database behavior. | Retained. | Preserve documentation-versus-implementation truth. |

## 4. Stable responsibility split

The following identities are distinct and must never be substituted for one another:

```text
command-lease incarnation       RefundExecutionCommand.leaseGeneration
lease possession secret         raw lease token, verified by leaseTokenHash
provider operation identity     RefundAttempt.idempotencyKey
provider invocation ordinal     RefundExecutionCommand.dispatchAttempt
provider observation identity   refund-result:{commandId}:{dispatchAttempt}
```

`leaseGeneration` and the raw token prove possession of one command-lease incarnation. They are
not provider identities. `dispatchAttempt` counts authorized provider invocations. The attempt
idempotency key continues to identify the one logical refund money operation across any later safe
provider replay.

## 5. Lease generation

`leaseGeneration` identifies one command-lease incarnation.

- It starts at zero before any lease has been acquired.
- The first successful lease changes it from zero to one.
- Every future successful reacquisition increments it monotonically by exactly one.
- It is never reset or decremented.
- It is independent of provider-dispatch authorization and provider invocation.
- A failed or conflicting acquisition does not consume a generation.
- E2A has no reacquisition path; the monotonic rule reserves the future E2B behavior.

Generation exhaustion must fail closed without a write. A generation is not an operation key,
provider idempotency key, evidence-dedup key, or replay token.

## 6. Lease possession token

Every successful lease incarnation receives a newly generated 256-bit random raw token.

- Only the SHA-256 digest of the raw token is persisted.
- The persisted representation is exactly 64 lowercase hexadecimal characters.
- The raw token exists only in the trusted in-memory lease handle.
- The token is replaced, not reused, for every future successful reacquisition.
- The token is not a provider idempotency key, provider operation identity, dispatch ordinal,
  evidence identity, actor identity, or worker identity.

The raw token and its digest must never enter:

- an admin or customer UI;
- a Server Action or other ordinary result;
- structured or unstructured logs;
- `RefundExecutionEvidence`;
- `RefundAttemptTransition`;
- safe diagnostic fields;
- provider requests or responses; or
- screenshots, browser evidence, or test output.

The trusted lease primitive may return the raw token only in its in-memory internal lease handle.
No production-facing adapter exists in E2A. A retry from the same textual `leaseOwner` without the
raw current token is not replay and must fail as a bounded conflict. E2A does not define a
token-bearing reacquisition or renewal operation.

## 7. Provider-dispatch ordinal

`dispatchAttempt` identifies the provider-invocation authorization count.

- Lease acquisition does not increment it.
- Every E2A-eligible command enters with `dispatchAttempt == 0`.
- E2A success leaves `dispatchAttempt == 0`.
- A future E3 dispatch-authorization transaction allocates the ordinal.
- One positive ordinal corresponds to exactly one authorized provider invocation.
- A later persistence retry for that invocation reuses the same ordinal and normalized
  observation; it does not allocate a new ordinal.
- Lease reacquisition alone never authorizes a provider invocation and never allocates an ordinal.

The v1 worker-observation key remains:

```text
refund-result:{commandId}:{dispatchAttempt}
```

It becomes meaningful only after E3 has allocated a positive ordinal for an authorized provider
invocation.

## 8. E2A entry predicate

E2A accepts exactly one caller-supplied command ID. Under the authoritative transaction, all of
the following must be true:

```text
RefundExecutionCommand.status = READY
RefundExecutionCommand.availableAt <= captured database time
RefundExecutionCommand.dispatchAttempt = 0
RefundExecutionCommand.leaseGeneration >= 0
RefundExecutionCommand.leaseOwner IS NULL
RefundExecutionCommand.leaseUntil IS NULL
RefundExecutionCommand.leaseTokenHash IS NULL

RefundAttempt.status = PROCESSING
Order.status = REFUND_PENDING
Payment.status = SUCCEEDED
RefundAttempt.providerRefundId IS NULL
RefundExecutionEvidence count = 0
```

The locked aggregate must also prove:

- one coherent request-creation transition;
- one coherent manual-SANDBOX claim transition linked to the command;
- exactly one open refund target;
- exactly one command for the target;
- coherent command, attempt, Payment, and Order ownership;
- coherent amount and currency;
- coherent provider and mode;
- a still-present nonblank provider payment reference, validated only as an aggregate invariant
  and never returned by E2A; and
- no incompatible terminal, failure, or provider-evidence projection.

Unsupported capability, missing ownership, malformed input, corruption, ambiguity, or a failed
predicate returns a bounded failure classification with zero writes. The failure result must not
expose lease owner, raw token, token digest, provider reference, operation key, internal corruption
detail, actor reference, customer data, or provider data.

## 9. E2A success and failure boundary

### 9.1 Success

One successful E2A transaction produces exactly:

```text
RefundExecutionCommand.status = LEASED
RefundExecutionCommand.leaseOwner = bounded nonblank internal owner label
RefundExecutionCommand.leaseUntil = captured database time + five minutes
RefundExecutionCommand.leaseGeneration = prior generation + 1
RefundExecutionCommand.leaseTokenHash = SHA-256(raw token), lowercase hex
RefundExecutionCommand.dispatchAttempt = 0
```

It produces none of the following:

- RefundAttempt status change;
- Order status change;
- Payment mutation;
- `RefundAttemptTransition`;
- `RefundExecutionEvidence`;
- provider payment reference in the result;
- provider operation key in the result;
- provider request derivation;
- provider adapter selection;
- provider invocation;
- discovery, polling, renewal, release, reclaim, or expiry recovery; or
- result application.

The internal success handle may contain only the information needed for trusted in-memory lease
possession, including the command identity already supplied by the trusted caller, generation,
raw token, and deadline. It is not an ordinary application result and must not cross into UI,
action, logging, or evidence surfaces.

### 9.2 Failure

Every failure produces zero writes. Concurrency loss, wrong status, not-yet-due work, active lease,
malformed input, disabled or invalid gate configuration, and aggregate inconsistency receive
bounded fail-closed classifications. Failure does not return internal owner, token, provider, or
corruption detail.

## 10. Transaction, concurrency, and time

E2A uses exact-command acquisition only. It performs no candidate scan or command discovery and
uses neither `FOR UPDATE SKIP LOCKED` nor a serializable-isolation requirement.

The lock order is:

```text
Order FOR UPDATE
-> RefundAttempt FOR UPDATE
-> RefundExecutionCommand FOR UPDATE
```

After all three row locks are acquired, the transaction captures `clock_timestamp()` exactly
once. That one timestamp is used to:

- decide whether `availableAt` is due; and
- derive `leaseUntil`.

The caller supplies neither `now` nor an absolute lease deadline. E2A owns one fixed five-minute
dormant-only duration in its lease module. The constant is not operator-configurable, is not an
environment variable, and is not asserted to be the final production lease duration. E2B/E2C must
select the real operational duration before recovery or a worker runtime is activated.

After validation, E2A performs a final guarded compare-and-swap covering at least the command ID,
target relation, `READY` status, due `availableAt`, prior generation, zero dispatch ordinal, and
absent lease/token fields. Two concurrent acquirers therefore produce exactly one winner. The
loser returns a bounded conflict with zero writes. Textual owner equality does not turn the loser
into a replay.

## 11. Lease capability gate

E2A freezes exactly one new capability key:

```text
REFUND_EXECUTION_LEASE_ENABLED
```

Parsing is:

```text
unset or blank after trim  -> disabled
trimmed exact ENABLED      -> enabled
any other nonblank value   -> invalid and fail closed
```

The lease capability is checked inside the authoritative transaction before any write. It ships
disabled by default. The existing claim capability does not imply lease capability, and lease
capability does not imply polling, worker execution, provider dispatch, or result application.

E2A introduces no production caller. This amendment does not freeze names for future worker,
dispatch, result-application, recovery, or reconciliation gates.

## 12. Required E2A schema and migration direction

The later E2A migration must add to `RefundExecutionCommand`:

```text
leaseGeneration INTEGER NOT NULL DEFAULT 0
CHECK (leaseGeneration >= 0)

leaseTokenHash VARCHAR(64) NULL
when non-null:
CHECK (leaseTokenHash matches exactly ^[0-9a-f]{64}$)
```

The command lease coherence contract becomes:

```text
status = LEASED:
  leaseOwner IS NOT NULL and nonblank
  leaseUntil IS NOT NULL
  leaseTokenHash IS NOT NULL
  leaseGeneration >= 1

status != LEASED:
  leaseOwner IS NULL
  leaseUntil IS NULL
  leaseTokenHash IS NULL
```

The existing database constraint requiring `LEASED -> dispatchAttempt > 0` must be retired.
Existing nonnegative `dispatchAttempt`, command ownership, and applicable safe-diagnostic
constraints remain.

E2A does not require:

- a provider-contact field;
- a command-event or lease-history table;
- a new command status;
- a new polling or partial index;
- a worker-identity column;
- new provider schema; or
- a provider request snapshot.

Before the migration performs schema changes, it must count existing `LEASED` rows. Any existing
`LEASED` row blocks the migration. The migration must not fabricate a token, contact fact, worker
identity, lease generation history, or provider history. Existing `READY` rows truthfully receive
generation zero through the default and retain a null token digest; their command meaning is
unchanged. The preserved production `READY` artifact therefore remains semantically unchanged and
must not be mutated by migration preflight or implementation verification.

## 13. Current combined-authorizer retirement

The E2A implementation must remove the current combined authorizer path that leases a command,
increments `dispatchAttempt`, and returns provider request material. Adapting only its caller or
adding a compliant sibling while leaving the combined path intact is insufficient.

After E2A, no dormant, exported, test-only, action, route, script, or ungated path may remain
capable of:

- leasing without generation/token fencing;
- incrementing `dispatchAttempt` during lease acquisition;
- accepting caller-supplied `now` or an absolute lease deadline;
- returning a provider payment key/reference from lease acquisition;
- returning the attempt provider operation key from lease acquisition; or
- deriving or returning a provider request from lease acquisition.

This retirement requirement does not prescribe a worker, provider adapter, or future dispatch
implementation.

## 14. Deferred-act ownership

### 14.1 E2B - lease recovery and extended fencing

E2B owns:

- a durable provider-contact fact needed before recovery;
- a command-event ledger before operational ownership can be overwritten;
- expired-lease classification;
- release, reclaim, and renewal;
- stale-fence validation;
- the resolver's generation/token fence extension; and
- the real lease-duration policy together with E2C operational needs.

This amendment does not freeze the provider-contact schema shape, command-event schema, recovery
statuses, recovery gate names, or algorithms. E2A implements none of these behaviors.

### 14.2 E2C - worker discovery and lifecycle

E2C owns command discovery and polling, worker host selection, process lifecycle, signals,
graceful shutdown, and any worker capability gate. This amendment freezes no worker host, loop,
package script, deployment target, poll interval, backoff, or gate name.

### 14.3 E3 - provider-dispatch authorization

E3 owns provider-dispatch authorization, `dispatchAttempt` allocation, provider request derivation,
and provider-invocation gate and wiring. Provider invocation remains outside database transactions.
This amendment does not freeze a provider-dispatch file, gate name, adapter, or wiring shape.

### 14.4 E4 - fenced observation persistence and result application

E4 owns fenced provider-observation persistence, result application, and current-versus-stale fence
behavior. Future fresh result application must prove both:

```text
the immutable positive dispatch ordinal
and
the applicable lease generation/token fence
```

E4 must preserve exact observation replay and evidence deduplication from v1. E2A creates no
observation and cannot call the current resolver successfully with ordinal zero.

### 14.5 Later reconciliation act

A later reconciliation act owns unknown provider outcomes, provider lookup, safe same-key replay
where an applicable provider contract proves it safe, and manual review. Lease expiry alone never
proves that no provider call occurred and never authorizes a blind provider retry.

## 15. Expiry and unknown-outcome rule

E2A implements no expiry recovery and no automatic reclaim. It does not change a leased command
back to `READY`, replace an owner, rotate a token, renew a deadline, allocate another generation,
or invoke a provider after expiry.

The following v1 rule remains absolute:

> Lease expiry alone does not prove non-execution and does not authorize another provider
> invocation.

Even though E2A itself performs no provider contact, later recovery must rely on a durable
provider-contact fact rather than infer non-contact from an expired deadline. If contact may have
occurred, only verified provider lookup, a provider-specific proven same-key replay contract, or
manual/reconciliation ownership may resolve the outcome. Blind retry remains forbidden.

## 16. Evidence and transition boundary

`RefundExecutionEvidence` represents one immutable external execution observation under v1. It is
not a lease event, audit log, possession proof, or command-transition history. E2A inserts no
evidence row.

`RefundAttemptTransition` represents a refund-domain status decision. Since E2A changes neither
the attempt nor the Order status, it inserts no transition. E2A's mutable command lease projection
is sufficient for this dormant first-acquisition slice; E2B must introduce command-event ownership
before release, reclaim, renewal, or overwritten operational ownership is allowed.

## 17. E2A compliance gate for implementation review

The later E2A implementation is policy-compliant only if behavioral tests prove at least:

- disabled and invalid lease-gate configurations produce zero writes;
- one eligible exact READY command becomes LEASED with generation one and a valid token digest;
- `dispatchAttempt` remains zero;
- caller-supplied clocks or absolute deadlines are impossible at the contract boundary;
- availability and deadline use one database timestamp captured after all locks;
- two concurrent acquirers produce one winner;
- same-owner retry without the raw current token is not replay;
- wrong status, future availability, existing evidence, provider identity, or aggregate
  inconsistency produces zero writes;
- success creates no transition or evidence and mutates no attempt, Order, or Payment;
- lease results contain no provider payment reference, operation key, or provider request;
- no provider adapter is invoked;
- the dormant resolver rejects the resulting ordinal-zero lease; and
- the retired combined authorizer has no remaining reachable or test-only duplicate path.

Tests must use controlled synthetic fixtures in the independently proven test database. They must
not use production artifacts or print lease tokens, token digests, provider keys, operation keys,
actor references, customer text, contact information, or addresses.

## 18. Explicit E2A non-goals

E2A does not implement or authorize:

- command discovery or polling;
- a worker, scheduler, route, Server Action, UI control, or package script;
- provider request derivation or provider invocation;
- provider observation or result application;
- lease renewal, release, reclaim, or expiry recovery;
- a provider-contact fact or command-event ledger;
- retry, lookup, reconciliation, or manual resolution;
- a production lease-duration policy;
- a real-provider contract or adapter change;
- production gate enablement; or
- mutation or backfill of existing production artifacts.

The E2A code slice must remain isolated from all of those later responsibilities.
