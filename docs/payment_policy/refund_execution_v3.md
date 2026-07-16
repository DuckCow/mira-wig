# Refund Execution Provider Dispatch and Fenced Result - Policy Amendment v3

- **Date:** 2026-07-16
- **Status:** PROPOSED DESIGN LOCK - documentation only; normative only after review and commit.
- **Amends:** `refund_execution_v1.md` and `refund_execution_v2.md`
- **Act boundary:** ACT E3P1 - provider-neutral dispatch, contact, unknown-outcome, and fenced-result policy
- **Base commit context:** `04657a4 feat(refund): add lease event ledger and release`
- **Implementation state:** Not implemented or activated by this document.

---

## 1. Purpose, authority, and non-activation

This document is a versioned amendment, not a complete restatement of the refund-execution
policy. It governs:

- provider invocation authorization;
- append-oriented dispatch-attempt history;
- separation of authorization from possible provider contact;
- provider operation identity across physical dispatch ordinals;
- unknown provider-outcome classification;
- fresh E4 lease-generation/token/ordinal fencing;
- exact durable-evidence replay; and
- ownership boundaries for positive-ordinal recovery.

The authority order is:

1. `refund_execution_v1.md` remains authoritative except where v2 or this amendment explicitly
   supersedes or scopes it.
2. `refund_execution_v2.md` remains authoritative except where this amendment explicitly scopes
   or supersedes it.
3. This amendment is authoritative for the subjects listed above after review and commit.

E2A exact-command lease acquisition and E2B1 lease event/release behavior remain unchanged. The
E2B1 release primitive remains exact-current-fence, ordinal-zero, and structurally pre-contact
only.

This document authorizes no schema change, migration, runtime caller, provider adapter, provider
contact, worker, gate enablement, production deployment, or database mutation by itself.

## 2. Supersession and scoping map

| Prior authority | Prior statement | v3 effect | Controlling rule |
|---|---|---|---|
| v1 §5 | `PROCESSING` broadly permits possible provider contact. | Retained only as a conservative domain status; scoped by v2 and v3. | Claim and lease do not authorize contact. Contact is possible only after the v3 contact transition commits. |
| v1 §6, §13, §22 | A combined dispatcher may lease, allocate an ordinal, contact, and resolve. | Superseded. | Lease, dispatch authorization, contact, and E4 result application are separate authorities and acts. |
| v1 §8 | `RefundAttempt.idempotencyKey` is the provider-neutral logical refund identity. | Retained and strengthened. | Every physical dispatch ordinal for one attempt MUST bind to the same logical provider operation identity. |
| v1 §11-§13 | Evidence is normalized external observation and worker dedup is `refund-result:{commandId}:{dispatchAttempt}`. | Retained. | Authorization/contact state MUST NOT be represented as evidence; generation is not part of evidence identity. |
| v1 §16 | Possible contact may use same-key replay only under a proven provider contract. | Retained. | Provider-neutral recovery defaults to unknown; provider-specific lookup or documented replay owns contacted work. |
| v1 §17-§18 | Fresh adapter evidence requires `LEASED` plus exact positive ordinal and applies atomically. | Extended. | Fresh E4 insertion MUST also prove current lease generation and raw-token possession and match a contact-possible dispatch row. |
| v2 §4-§7 | Lease generation/token and dispatch ordinal are separate. | Retained. | Generation/token prove the current lease incarnation; the ordinal identifies physical invocation authorization. |
| v2 §13 | Lease acquisition and its result cannot derive or expose provider request material. | Retained for lease acquisition and release; narrowly scoped for E3. | A trusted dispatch-authorization handle MAY carry only the minimum internal request facts needed by the contact boundary after authorization commits. |
| v2 §14.3 | E3 owns authorization, ordinal allocation, request derivation, and invocation wiring. | Scoped. | E3A owns dormant schema and authorization; later contact/adapter acts remain separately gated and provider-specific. |
| v2 §14.4 | E4 must add generation/token fencing. | Resolved and strengthened. | Fresh observation requires ordinal + generation + raw token; exact existing-evidence replay is a separate authority path. |
| v2 §14.5, §15 | Unknown outcomes and safe replay belong to later reconciliation. | Retained and extended. | `CONTACT_MAY_HAVE_OCCURRED` is the earliest durable unknown boundary and blocks ordinary reauthorization. |

The trusted dispatch-handle exception does not apply to UI, Server Action results, public APIs,
ordinary application results, logs, metrics, analytics, browser state, evidence, or transition
records. Lease-acquisition and lease-release results MUST continue to expose no provider payment
reference, provider operation key, request fingerprint, or provider request.

## 3. Definitions

For this policy:

- **Logical refund operation** means the one merchant-approved refund money intent represented by
  one `RefundAttempt` and its immutable provider-neutral identity.
- **Physical provider invocation authorization** means one durable grant to make at most one
  physical provider-contact attempt for that logical refund operation.
- **Dispatch ordinal** means the positive monotonically increasing authorization count within one
  command.
- **Dispatch attempt** means the append-oriented durable record of one physical invocation
  authorization and its contact state.
- **Authorization** means allocation of a dispatch ordinal and immutable binding of the logical
  request facts. It does not permit provider contact by itself.
- **Contact may have occurred** means the trusted contact boundary durably granted permission for
  the request to enter client/transport. It does not assert transmission, receipt, or execution.
- **Provider observation** means normalized information attributable to an adapter response,
  verified lookup, verified webhook, reconciliation, or authorized operator evidence.
- **Fresh observation** means a provider observation not yet stored under its source-dedup
  identity and offered for insertion by the current fenced dispatch owner.
- **Durable evidence replay** means exact acknowledgment of an already persisted immutable
  evidence observation and its coherent application artifacts without inserting a new provider
  fact.
- **Unknown provider outcome** means provider execution may have occurred but authoritative
  normalized local evidence does not prove the outcome.
- **Reconciliation** means separately authorized acquisition and application of provider or
  operator evidence for unresolved work.
- **Current lease incarnation** means the command's current positive `leaseGeneration` together
  with possession of the raw token whose digest equals `leaseTokenHash`.
- **Request fingerprint** means a SHA-256 integrity digest over the versioned canonical immutable
  authorized request facts.
- **Provider operation key** means the stable usable provider wire idempotency/operation identity
  allocated or mapped once for one `RefundAttempt`.

## 4. Compact authority table

| Authority | Durable or secret proof | Owns | MUST NOT substitute for |
|---|---|---|---|
| Logical refund operation | `RefundAttempt.idempotencyKey` | One refund-money-operation identity | Dispatch ordinal, lease token, evidence identity |
| Current lease incarnation | `leaseGeneration` + raw token verified against `leaseTokenHash` | Current command possession | Provider operation or observation identity |
| Current ordinal projection | `RefundExecutionCommand.dispatchAttempt` | Latest authorized physical invocation ordinal | Historical authorization ledger |
| Dispatch history | `RefundExecutionDispatchAttempt` | Immutable authorization and contact history per ordinal | Provider observation evidence |
| Provider observation | `RefundExecutionEvidence` | Durable normalized external fact | Lease or contact bookkeeping |
| Lease history | `RefundExecutionCommandEvent` | Internal lease acquisition/release history | Dispatch or provider history |

These authorities MUST remain distinct in schema, contracts, logs, tests, and recovery logic.

## 5. Stable provider operation identity

One `RefundAttempt` MUST map to exactly one stable logical provider operation identity.

- `RefundAttempt.idempotencyKey` remains the provider-neutral logical identity.
- The usable provider wire key MUST be allocated or mapped once and durably recoverable after a
  crash.
- Every later physical dispatch ordinal for the same attempt MUST reuse that wire key verbatim.
- A new dispatch ordinal MUST NOT create a new refund identity.
- Re-derived request facts that differ under the same operation key MUST fail closed locally
  before contact.
- A different actual refund MUST use a new `RefundAttempt` through the existing request policy.

A provider-specific policy MUST decide whether `RefundAttempt.idempotencyKey` is usable directly
on the wire or maps once to a stored provider-specific value. That mapping MUST preserve one
logical operation and MUST NOT be recomputed under an algorithm that can drift.

The provider wire key MUST NOT be derived from:

- command ID plus ordinal;
- dispatch-attempt row ID;
- a new random value per retry;
- worker identity;
- lease owner; or
- lease generation/token.

The usable wire key is operationally sensitive. It MUST NOT enter UI, public or ordinary results,
logs, metrics labels, analytics, browser state, screenshots, or test assertion failure output.

## 6. Dispatch-attempt historical authority

E3A MUST introduce an append-oriented conceptual authority named
`RefundExecutionDispatchAttempt`. Exact Prisma field names are owned by E3A, but every row MUST
represent one positive physical invocation authorization and contain at least:

- command identity;
- positive ordinal;
- positive authorizing lease generation;
- immutable provider snapshot;
- immutable mode snapshot;
- stable usable provider operation key;
- canonical request fingerprint;
- authoritative authorization timestamp;
- contact state;
- nullable authoritative contact-mark timestamp; and
- creation timestamp.

Required constraints are:

```text
unique(command, ordinal)
ordinal >= 1
leaseGeneration >= 1
command deletion restricted while dispatch history exists
```

The dispatch row MUST NOT require or persist:

- raw lease token;
- lease-token hash snapshot;
- raw provider payload;
- lease owner;
- worker identity;
- customer identity;
- customer text; or
- free-form refund reason.

The authorization transaction verifies the live token fence. The dispatch row records the
authorizing generation and immutable authorization facts without expanding secret-derived
durable storage. A persisted lease-token hash snapshot is therefore neither required nor
authorized by this policy.

`RefundExecutionCommand.dispatchAttempt` remains the sufficient current/latest ordinal
projection. E3A MUST NOT add a mutable active-attempt reference unless later implementation
evidence proves a concrete integrity or query requirement and receives separate adjudication.

## 7. Authorization and contact state model

The minimum dispatch-attempt state progression is:

```text
AUTHORIZED
    -> CONTACT_MAY_HAVE_OCCURRED
```

| State/transition | Durable meaning | Contact permitted | Ordinary reauthorization |
|---|---|---|---|
| No dispatch row for next ordinal | No physical invocation has been authorized for that ordinal. | No | Only through a valid new-authorization transaction |
| `AUTHORIZED` | One ordinal and immutable request identity are committed; contact has not been permitted. | No | Blocked while this authorization is unresolved |
| `AUTHORIZED -> CONTACT_MAY_HAVE_OCCURRED` | The current fenced contact boundary grants one permission to pass the request to transport. | Yes, only to the transaction winner's trusted internal continuation | Blocked |
| `CONTACT_MAY_HAVE_OCCURRED` | Contact was permitted and may have happened; no transmission or execution assertion is made. | No generic second permit | Blocked; recovery only |
| Durable evidence application | A normalized provider observation has been atomically persisted and applied. | No implication | Governed by result/retry/reconciliation policy |

Additional observation or reconciliation states MAY be added only by later acts. Evidence status
MUST NOT represent authorization or contact state.

An idempotent acknowledgment that the contact marker already exists MUST NOT issue a new generic
contact permit. Once the marker exists, a lost response from the contact-handoff transaction is
already inside the unknown-outcome boundary. Any repeat contact requires the selected provider's
separately locked same-key recovery authority.

## 8. Dormant dispatch-authorization transaction

The trusted caller supplies exactly the local possession facts needed to identify the current
lease:

```text
commandId
leaseGeneration
raw leaseToken
```

The caller MUST NOT supply:

```text
ordinal
amount or currency
provider or mode
provider payment reference
provider operation key
request fingerprint
provider request body
authoritative transaction time
```

One authorization transaction MUST:

1. check its own capability using the standard fail-closed parser;
2. discover the candidate without accepting caller financial/provider facts;
3. lock `Order`, then `RefundAttempt`, then `RefundExecutionCommand`;
4. reload and validate the authoritative aggregate and lineage;
5. capture one authoritative database timestamp after the locks;
6. require coherent current `LEASED` state;
7. require exact current generation and raw-token digest match;
8. require the lease to be unexpired at the captured database time;
9. require coherent Payment, provider, mode, amount, currency, provider payment reference,
   attempt identity, command ownership, transitions, evidence, and sibling reservation state;
10. require no unresolved dispatch authorization that forbids another invocation;
11. validate or establish the attempt-stable provider operation-key binding;
12. allocate exactly the next positive ordinal without wrap, reset, or caller influence;
13. derive the immutable provider-neutral request facts under lock;
14. compute the versioned canonical request fingerprint;
15. insert one `AUTHORIZED` dispatch-attempt row;
16. advance `RefundExecutionCommand.dispatchAttempt` to the same ordinal with a guarded CAS; and
17. commit before returning the trusted internal dispatch handle.

The transaction MUST make no provider call. It MUST hold no network client, queue, or transport
operation. Allocation exhaustion MUST fail closed with zero writes; ordinals MUST never wrap,
reset, or be reused.

The success handle MAY carry only the minimum internal facts needed to reconstitute the authorized
request and later prove the current fence, including command/attempt identity, ordinal,
generation, raw token, provider/mode, provider payment reference, amount, currency, and stable
provider operation key. It MUST be immutable, trusted-internal, non-loggable, and unavailable to
ordinary application boundaries.

## 9. Authorization replay

New authorization and exact authorization replay are different operations:

```text
new authorization  -> may allocate N + 1
exact replay        -> returns the already committed N and allocates nothing
```

A crash or lost internal response after authorization commit MUST leave exactly:

```text
one durable AUTHORIZED row
one matching advanced command ordinal
zero permission for provider contact
```

An exact replay with the still-current generation and raw token MUST require that the dispatch row
remains `AUTHORIZED` and MUST reconstitute the same immutable authorization and request facts from
durable state. If the row has advanced to `CONTACT_MAY_HAVE_OCCURRED`, authorization replay MUST
return only a bounded contacted/recovery classification and MUST NOT return a new contact-capable
handle. Replay MUST NOT create `N + 1`, change the operation key, change the fingerprint, change
the authorization timestamp, return the command to `READY`, or claim contact.

Loss of the raw token through process death does not create authority to bypass the fence. Future
authorized-but-uncontacted recovery MAY transfer, abandon, or reconstitute the same authorization
under a separately locked algorithm, but MUST NOT silently allocate a second ordinal or logical
refund identity.

## 10. Request derivation and fingerprint

Provider-neutral request facts MUST be derived only from the locked authoritative aggregate. The
provider wire request shape MUST be created only after authorization commits, through a
provider-specific mapper governed by a provider-specific policy.

The provider-neutral fingerprint input is the UTF-8 encoding of an ordered canonical array whose
serialization version and facts are:

```text
[
  "refund-provider-request/v1",
  provider,
  mode,
  providerPaymentReference,
  positiveMinimumUnitAmount,
  uppercaseCurrency,
  stableProviderOperationKey
]
```

The canonical array order, version tag, string normalization, escaping, separators, and base-10
integer representation MUST be frozen by E3A as one exact byte serialization and behavior-tested
with stable test vectors. Incidental runtime object-key order MUST NOT define the serialization.
Dispatch ordinal, lease generation, worker identity, clock, and random values MUST NOT enter the
fingerprint because they do not change the logical provider request. Every dispatch ordinal for
the same immutable request MUST therefore bind to the same fingerprint.

The stored fingerprint MUST be the lowercase hexadecimal SHA-256 digest of that canonical byte
sequence. It is an integrity check, not a secret or proof of authority. It MUST NOT be used as
authentication, a provider idempotency key, a customer-visible identifier, or proof of provider
contact.

A provider-specific policy MUST define and test any additional fixed wire fact required by that
provider before contact is implemented. It MUST also define whether that fact extends the
provider-specific fingerprint contract. Re-derived facts that do not reproduce the stored
fingerprint under the same operation key MUST fail closed before contact.

## 11. Contact-handoff transaction

Provider contact requires a separate authoritative transaction that transitions exactly one
dispatch attempt:

```text
AUTHORIZED -> CONTACT_MAY_HAVE_OCCURRED
```

The contact-handoff transaction MUST:

1. check its own capability fail closed;
2. discover the candidate without accepting caller financial/provider facts;
3. lock `Order`, then `RefundAttempt`, then `RefundExecutionCommand`, then the matching dispatch
   attempt when an additional row lock is required;
4. reload and validate the aggregate and immutable authorization facts;
5. require the exact current command ordinal and `AUTHORIZED` dispatch row;
6. revalidate the exact current lease generation and raw-token digest;
7. capture authoritative database time;
8. require the lease to be unexpired at that time;
9. transition the dispatch row exactly once and record the contact-mark time; and
10. commit before any provider client receives the request.

Only the successful transition winner MAY continue to the one provider-call attempt represented
by that ordinal. No provider call may hold an Order, RefundAttempt, RefundExecutionCommand, or
dispatch-attempt lock.

If the lease expires before the contact transaction commits, contact is not authorized. If the
lease expires after the transaction commits, expiry does not revoke the granted permission and
does not prove that provider contact or execution did not occur.

## 12. Unknown-outcome boundary and representation

The commit of `CONTACT_MAY_HAVE_OCCURRED` is the earliest durable unknown-outcome boundary. The
marker proves permission and possible exposure only. It does not prove that bytes were sent, the
provider received the request, or the refund executed.

After that commit, none of these facts proves non-execution:

- connection or response timeout;
- `AbortSignal` or client cancellation;
- connection reset or disconnect;
- HTTP 5xx;
- process death or worker shutdown;
- response loss;
- missing local evidence; or
- lease expiry.

The provider-neutral default MUST remain conservative unless a provider-specific policy cites an
exact official guarantee and locks the applicable recovery operation.

An unobserved unknown is represented durably as:

```text
dispatch attempt = CONTACT_MAY_HAVE_OCCURRED
command = non-runnable at its current positive ordinal
authoritative RefundExecutionEvidence = absent
```

This means the provider may have executed while no authoritative normalized local observation is
stored. The unresolved dispatch attempt MUST block ordinary reauthorization. The system MUST NOT:

- move the command to `READY`;
- use E2B1 pre-contact release;
- allocate a new logical operation key;
- switch providers;
- blindly authorize another invocation; or
- classify the missing response as failure.

Provider-specific lookup, documented same-key replay, verified webhook evidence, or authorized
manual reconciliation owns recovery.

## 13. Observed `UNKNOWN` versus unobserved unknown

These states are distinct:

| State | Durable facts | Result-planner authority |
|---|---|---|
| Unobserved unknown | `CONTACT_MAY_HAVE_OCCURRED`; no provider observation evidence | None; reconciliation owns acquisition of evidence |
| Observed `UNKNOWN` | A normalized provider observation with outcome `UNKNOWN` is durably inserted through E4 | Existing v1 result planning may park and move the attempt to manual review |

A process crash, timeout, expired lease, or contact marker alone MUST NOT fabricate an
`UNKNOWN` evidence row. Only a genuine normalized provider/adapter observation may enter the
existing result planner.

## 14. Fresh E4 fenced observation and atomic application

The fresh adapter-observation boundary MUST accept at least:

```text
commandId
dispatchAttempt
leaseGeneration
raw leaseToken
normalized observation
```

The caller MUST NOT supply authoritative transaction time, Order identity, RefundAttempt
identity, Payment identity, provider, mode, expected money, operation key, request fingerprint,
evidence source, or source-dedup key.

Under the authoritative E4 transaction, fresh insertion MUST validate:

- command status is `LEASED`;
- the input ordinal is positive and equals the command's current ordinal;
- the matching immutable dispatch-attempt row exists;
- that row is `CONTACT_MAY_HAVE_OCCURRED`;
- the input generation equals the current lease generation and the row's authorizing generation;
- the raw-token digest equals the command's current `leaseTokenHash`;
- provider, mode, amount, currency, operation identity, and request fingerprint remain coherent;
- the normalized observation is coherent with the authorized request;
- aggregate ownership, lineage, transitions, sibling reservations, and provider-refund identity
  remain coherent; and
- no conflicting evidence exists under the derived source identity.

The final command CAS MUST include at least:

```text
command identity
refund-attempt identity
current command status
dispatch ordinal
lease generation
lease-token digest
```

Observation insertion, application classification, attempt/Order/command/provider-identity
projection, transition insertion, and lease-field clearing MUST remain one atomic transaction.
Any failure after the first write MUST roll back every write. Ordinal-only freshness is forbidden.

## 15. Exact durable-evidence replay

Fresh insertion and exact durable-evidence replay are separate authority paths.

Fresh insertion requires the current ordinal and lease-generation/raw-token fence. Exact replay
MAY succeed after lease fields clear, the command leaves `LEASED`, or the worker restarts only
when:

- the existing evidence source-dedup identity matches;
- the normalized observation exactly matches every immutable stored observation field;
- persisted evidence application, attempt, command, Order, provider identity, and transition
  artifacts are coherent; and
- no new provider fact or domain transition is inserted.

The adapter-observation identity remains:

```text
refund-result:{commandId}:{dispatchAttempt}
```

Lease generation belongs only in the fresh-insertion fence and dispatch authorization history. It
MUST NOT enter the evidence dedup identity. One physical invocation ordinal has one observation
identity even if operational ownership later changes. Adding generation would permit a reclaimed
lease incarnation to reinterpret or duplicate the same physical invocation's evidence.

An older ordinal's observation MUST NOT be interpreted as the current ordinal's fresh result. A
later stale-observation or reconciliation path MAY persist it only under separately locked source
authority and MUST serialize through the same evidence application core.

## 16. Provider-observation storage

`RefundExecutionEvidence` remains the authoritative normalized provider-observation record. The
default flow is:

```text
normalize in memory
-> persist normalized evidence
-> apply result atomically
```

Routine raw provider-payload storage is not authorized. A provider-specific amendment MAY propose
encrypted raw retention only if it locks necessity, retention, access control, redaction,
encryption, deletion, and audit ownership. Until then, raw request/response bodies MUST remain out
of refund evidence, dispatch history, ordinary logs, and admin projections.

## 17. Crash-window consequences

| Crash window | Durable truth | Permitted next authority |
|---|---|---|
| Authorization transaction rolls back | No new row or ordinal | Retry the transaction if the lease remains current |
| Authorization commits before handle is received | One `AUTHORIZED` row; ordinal advanced; no contact permission | Exact authorization replay with current fence, or future authorized-uncontacted recovery |
| Handle is received before contact transition | Same `AUTHORIZED` state | Contact transaction or future uncontacted recovery |
| Contact transition commits before provider client invocation | `CONTACT_MAY_HAVE_OCCURRED`; no evidence | Unknown-outcome recovery; no generic second contact permit |
| Provider call begins and process dies | Contact possible; no evidence | Provider-specific lookup, documented same-key replay, webhook, or manual reconciliation |
| Provider succeeds but response is lost | Contact possible; no local authoritative observation | Same provider-specific recovery only |
| Response is received before E4 commits | Observation exists only in memory | Attempt E4 while current; otherwise provider-specific recovery |
| E4 transaction rolls back | No partial evidence/application commit | Retry the exact fresh input only while the same fence remains current; otherwise reconciliation |
| E4 commits before response is returned | Evidence and projections are durable and coherent | Exact durable-evidence replay |

No crash window authorizes a new logical refund identity. No positive ordinal may be silently
discarded or overwritten.

## 18. Positive-ordinal recovery boundary

E2B1 release remains ordinal-zero only. A committed positive-ordinal authorization cannot be
released, reset, or returned to `READY` by that primitive.

Recovery MUST distinguish:

- `AUTHORIZED` and provably uncontacted; and
- `CONTACT_MAY_HAVE_OCCURRED` and possibly contacted.

Future authorized-but-uncontacted recovery MAY transfer, abandon, or reconstitute the same
authorization. It MUST preserve the same logical provider operation identity and MUST NOT infer a
new physical invocation authorization without a separately proven transition.

If such recovery changes the current lease generation, its later policy MUST introduce a durable
fence-binding fact without rewriting the immutable original authorization. Until that authority
exists, contact handoff and fresh E4 insertion require the original authorizing generation to
remain the current lease generation.

Contacted recovery requires provider-specific lookup, officially documented same-key replay,
verified webhook evidence, or manual reconciliation. Lease expiry alone authorizes none of these
as a blind provider call.

V3 implements and activates no positive-ordinal recovery algorithm.

## 19. Capability separation

| Conceptual capability | Owns | Independent shutdown rule | Required availability |
|---|---|---|---|
| Dispatch authorization | New ordinal and `AUTHORIZED` history | MAY be disabled to stop new financial exposure | Not implied by lease or worker enablement |
| Provider contact/invocation | Contact transition and one external call continuation | MUST be separately disableable | Requires E4A and provider-specific policy first |
| Fresh observation/result application | Fenced evidence insertion and atomic projections | MUST remain available for already contacted in-flight work when new contact is disabled | Independent fail-closed gate |
| Lookup/reconciliation | Finality acquisition for unresolved work | MUST remain available or have named manual ownership after contact is disabled | Provider-specific authority required |
| Worker orchestration | Discovery, polling, lifecycle, signals, shutdown | Implies no financial mutation capability | E2C-owned and last in ordering |

Every mutation capability MUST use the standard parser:

```text
unset or blank after trim  -> disabled
trimmed exact ENABLED      -> enabled
any other nonblank value   -> invalid and fail closed
```

V3 freezes no exact environment-variable names or sentinel spelling for new capabilities. Each
implementation act freezes only its own gate. Every mutation capability MUST check its gate at
the authoritative transaction boundary before any write. No public, test-only, script, route,
Server Action, or alternate exported mutation core may bypass that gate.

Worker enablement implies none of dispatch authorization, contact, evidence application, or
reconciliation. Disabling new authorization or contact MUST NOT disable safe finality handling for
work already exposed to the provider.

## 20. Privacy, logging, and assertion-output safety

These values MUST NOT be exposed in ordinary operational or product surfaces:

- raw lease token or lease-token digest;
- provider operation key;
- provider payment or refund reference;
- a request fingerprint when it enables cross-record correlation;
- raw provider payload;
- customer identity, contact data, or address;
- full internal command, Order, Payment, or RefundAttempt IDs.

Safe operational output MAY include only bounded state, dispatch ordinal, lease generation,
event/state type, bounded safe failure code, duration bucket, and an approved non-reversible
bounded correlation value.

Contracts and tests MUST avoid passing secret-bearing handles or request objects to assertion
matchers whose failure output could serialize them. Tests MUST compare presence, format, digest
relationships, or individual approved fields without printing the raw token, token digest,
provider key/reference, fingerprint, customer data, or full internal IDs.

## 21. Migration truthfulness

The E3A migration preflight MUST abort before schema changes if any of these exists:

```text
any LEASED RefundExecutionCommand
any positive RefundExecutionCommand.dispatchAttempt
any RefundExecutionEvidence row
```

Existing positive ordinals or evidence cannot be truthfully reconstructed into append-oriented
dispatch authorization/contact history. The migration MUST NOT guess whether authorization,
contact, invocation, or observation occurred.

Existing `READY` commands, ordinal-zero commands, lease-ownership events, and
provider-refund-ID-absent rows MUST receive no fabricated dispatch-attempt row or contact state.
No backfill may claim provider authorization, contact, invocation, or observation.

Production currently remains pre-E2A/E2B1. This fact does not relax the preflight and does not
authorize migration deployment. Later deployment MUST preserve migration order and independently
revalidate production truth.

## 22. Provider-neutral versus provider-specific ownership

Provider-neutral policy owns:

- logical operation identity;
- ordinal allocation and append-oriented authorization history;
- current lease-fence validation;
- authorization/contact separation;
- provider-neutral request facts and fingerprint;
- conservative unknown classification;
- normalized evidence envelope;
- fresh E4 fence and exact evidence replay; and
- no-blind-retry and no-provider-switch rules.

Provider-specific policy owns:

- endpoint and wire request/response shape;
- usable operation-key mapping and official idempotency guarantees;
- amount/currency wire conversion;
- provider-required fixed reason or metadata;
- client timeout and cancellation behavior;
- exact response/error classification;
- status lookup and correlation;
- safe same-key replay;
- webhook coverage and verification;
- rate limits, retention, and reconciliation cadence; and
- sandbox/live differences.

The shared model MUST NOT depend on an assumed synchronous provider response or undocumented SDK
behavior.

## 23. Human-selected first provider boundary

The human decision recorded for later provider-specific work is:

```text
first real refund provider: Toss Payments
initial market:             KR
currency:                   KRW
initial real-provider mode: SANDBOX
```

This selection does not authorize Toss implementation or contact. This provider-neutral amendment
does not define or assert Toss endpoint, header/idempotency semantics, wire amount, replay window,
lookup correlation, webhook coverage, error mapping, client timeouts, or sandbox/live differences.
Those facts require a separate official-evidence-backed Toss refund policy before E3B.

## 24. Act ordering and activation prerequisites

| Order | Act | Required exit | Structurally absent at exit |
|---|---|---|---|
| 1 | V3 provider-neutral policy | This authority reviewed and committed | Schema/runtime/provider changes |
| 2 | E3A | Dispatch-attempt schema and dormant authorization behavior verified | Contact transition, provider call, worker, production caller |
| 3 | E4A | Generation/token/ordinal-fenced fresh insertion and exact replay verified | Provider contact and Toss adapter |
| 4 | Toss-specific refund policy | Official Toss wire, idempotency, lookup, timeout, and recovery authority locked | Toss contact implementation |
| 5 | E3B | Contact handoff and Toss SANDBOX adapter behavior verified behind disabled gates | Worker and production activation |
| 6 | Provider-specific reconciliation | Every contacted pending/unknown path has a finality owner | Blind retry and production activation |
| 7 | E2B2, separately adjudicated | Only approved recovery primitives implemented and tested | Implicit positive-ordinal reclaim |
| 8 | E2C | Worker discovery/lifecycle/shutdown implemented without implied financial capability | Gate enablement |
| 9 | Separate activation act | Migrations, runbook, ownership, sandbox evidence, and gates audited | Automatic LIVE enablement |

E4A MUST be implemented and verified before any provider-contact capability exists. E3A MAY
precede E4A only while there is no production caller, contact transition, provider invocation
path, or gate that can create provider exposure.

## 25. Compliance requirements for later acts

E3A verification MUST prove at least:

- disabled/invalid capability produces zero writes;
- current generation/token and unexpired lease authorize one ordinal;
- wrong or stale generation/token produces zero writes;
- two authorizers allocate exactly one ordinal;
- exact authorization replay returns the same immutable request identity without allocation;
- the stable provider operation key and fingerprint cannot drift across ordinals;
- positive ordinal prevents E2B1 release;
- authorization creates no evidence, result application, contact, or provider call; and
- migration preflight and privacy constraints are behaviorally enforced.

E4A verification MUST prove at least:

- current ordinal + generation + raw token accepts coherent fresh observation;
- wrong generation/token or older ordinal produces zero writes;
- no fresh observation is accepted without a matching contact-possible dispatch row;
- evidence and all projections commit or roll back atomically;
- exact existing-evidence replay succeeds after lease clearance without a new write;
- changed evidence under the same dedup identity fails closed;
- generation is absent from the evidence dedup identity; and
- token fields clear only in the successful atomic result exit.

Contact and provider-contract tests belong to later provider-specific acts and MUST include
timeout, abort, disconnect, response loss, pending response, same-key replay, changed-payload
reuse, lookup, authentication/configuration failure, and process-crash boundaries.

## 26. Explicitly deferred and prohibited behavior

This amendment neither defines nor authorizes:

- Toss adapter implementation or any provider invocation;
- worker, discovery, polling, scheduler, queue consumer, route, Server Action, or UI control;
- lease renewal or expired reclaim;
- positive-ordinal reclaim, transfer, or abandonment algorithm;
- automatic lookup cadence or webhook ingestion;
- manual repair mutation;
- raw provider-payload retention;
- production migration deployment;
- feature-gate enablement;
- browser acceptance; or
- mutation or backfill of existing production artifacts.

Any later act proposing one of these behaviors MUST identify its authority, preserve the ordering
above, and supply behavioral tests appropriate to the financial and concurrency risk.
