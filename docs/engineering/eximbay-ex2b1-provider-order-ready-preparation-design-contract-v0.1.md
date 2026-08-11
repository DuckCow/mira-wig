# Eximbay EX2B1 — Provider Order Identity + Provider-Free `/ready` Preparation Design Contract v0.1

## Status

```text
DOCUMENT CLASS:
  DESIGN CONTRACT

RISK CLASS:
  HIGH — PAYMENT IDENTITY, PERSISTENCE, CONCURRENCY, AND PROVIDER PROTOCOL

TASK CLASSIFICATION:
  SOURCE_ONLY

CURRENT TASK-LEVEL AUTHORIZATION:
  DOCUMENTATION ONLY

STATUS:
  CANDIDATE — NOT INSTALLED

INDEPENDENT ARCHITECTURE AUDIT:
  ACCEPTED WITH BOUNDED CORRECTIONS

AUDIT FINDINGS:
  EX2B1-AUD-001 — CORRECTED
  EX2B1-AUD-002 — CORRECTED
  EX2B1-AUD-003 — CORRECTED

REPOSITORY BASELINE:
  main at cd51f8398980401fd573d95aff417c5028f2a5fe

EXIMBAY RUNTIME AUTHORITY:
  NONE

EXIMBAY PROVIDER CONTACT:
  NONE

EXIMBAY CREDENTIAL / SDK AUTHORITY:
  NONE

EXIMBAY SANDBOX / LIVE ACTIVATION:
  NOT AUTHORIZED

CHANGE CONTROL:
  supersedes: none
  superseded-by: none
```

This candidate grants no current source implementation authority until it has
received independent adversarial architecture review and has been accepted and
merged. Even after merge, implementation requires a separate, explicit,
baseline-bound source task under this contract. The candidate itself does not
install schema, source, migration, test, route, credential, adapter, or runtime
authority.

The independent audit reported zero Blockers, two Important findings, and one
Minor finding. This corrected candidate changes only the Eximbay webhook-first
boundary, current collision failure behavior, and intentional Eximbay fixture
migration obligations. All other accepted architecture remains unchanged.

## 1. Purpose and exact objective

EX2B1 defines exactly two future source capabilities:

1. a persisted, Mira-controlled provider-order identity owned by one physical
   `Payment` attempt; and
2. provider-free materialization of already validated EX2A preparation facts
   plus that trusted persisted identity into immutable server-side `/ready`
   request facts.

The future EX2B1 implementation must remain:

```text
provider-free
credential-free
network-free
SDK-free
runtime-disabled
```

It must make zero Eximbay requests. It must not make Eximbay selectable,
externally callable, browser-invokable, refundable, voidable, or active in any
environment.

## 2. Governing authority and precedence

This contract is subordinate to and must be read with:

1. [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md).
2. [EX2A Pure Protocol Kernel Design / Implementation Contract v0.1](./eximbay-ex2a-pure-protocol-kernel-design-contract-v0.1.md).
3. [EX2A Pure Protocol Kernel Source Status / As-Built v0.1](./eximbay-ex2a-pure-protocol-kernel-source-status-v0.1.md).
4. [BF2 Shared-Test `/ready` Preflight Provider Evidence / Execution Contract v0.1](./eximbay-bf2-shared-test-ready-preflight-contract-v0.1.md).
5. [BF2 Shared-Test `/ready` Preflight Result Evidence / Independent Adjudication v0.1](./eximbay-bf2-ready-preflight-result-adjudication-v0.1.md).
6. The latest confirmed/open payment-policy pair:
   [confirmed v6](../payment_policy/payment_policy_confirmed_v6.md) and
   [open v6](../payment_policy/payment_policy_open_v6.md).
7. [Multi-PG Priority and Fallback Policy v1](../payment_policy/multi_pg_priority_fallback_v1.md).
8. [D1-B providerRef persistence decision v1](../payment_policy/d1b_provider_ref_persistence_decision_v1.md).
9. [D1-B confirm/capture outbound idempotency decision v1](../payment_policy/d1b_confirm_idempotency_decision_v1.md).
10. Current `prisma/schema.prisma`, migrations, and payment source at the
    repository baseline above.

Repository schema and current source govern repository facts. Installed EX2A
source governs the current pure-kernel contract. The BF2 adjudication governs
what the one completed provider-evidence action observed. This contract must be
revised, not silently interpreted, if later implementation reconnaissance finds
a conflict among those authorities.

## 3. Installed BF2 truth and evidence ceiling

The installed BF2 dispositions are preserved exactly:

```text
VALID_CUSTODY

EXECUTION_CONFORMANT

BF2_EVIDENCE_VALID_WITH_LIMITATIONS

BF2 repeat:
NOT AUTHORIZED
```

BF2 observed only:

```text
O1:
PAYMENT
USD "1.00"
no forced payment method
OBSERVED_SUPPORTED

O2:
synthetic provider-order representative
P000
USD "1.00"
OBSERVED_SUPPORTED

O3:
different synthetic provider-order representative
P000
JPY "1"
OBSERVED_SUPPORTED
```

The selected experimental identity policy is:

```text
^c[0-9a-z]{24}$
```

It means literal lowercase `c` followed by 24 lowercase base-36 characters,
for an exact length of 25. BF2 did not establish Eximbay's complete grammar,
did not prove acceptance of every family member, and did not test a
Prisma-created `Payment.id`.

## 4. Fresh repository reconnaissance

Reconnaissance at the stated baseline confirmed:

- `CheckoutSession.payments` is one-to-many and retains historical physical
  provider attempts.
- `Payment` is the physical provider-attempt record. There is no separate
  `PaymentAttempt` or generic provider-call owner.
- `Payment.id` is the repository-internal attempt primary identity.
- `Payment.provider` and `Payment.mode` pin provider contact authority to the
  attempt row; post-row cross-provider fallback is prohibited.
- current initiation first serializes on the `CheckoutSession`, validates
  commerce state, and creates a `CONTACT_AUTHORIZED` `Payment` before provider
  contact.
- compatible pre-contact re-entry reuses the same `Payment`; incompatible
  pre-contact re-entry may atomically supersede the old row and create a new
  row.
- `markContactStarted` commits `CONTACTED` and `contactStartedAt` before the
  provider initiation capability is invoked outside the transaction.
- `OUTCOME_UNKNOWN` blocks blind recontact after a contact exception.
- the partial unique index `Payment_one_blocking_attempt_per_session_key`
  provides database closure for one open blocking attempt per session.
- `providerRef` is a nullable provider-specific initiation/intermediate
  reference and has a non-unique `(provider, providerRef)` lookup index.
- `providerPaymentKey` is the provider-issued final financial identity and has
  provider-scoped uniqueness.
- `Payment.idempotencyKey` is initiation-attempt idempotency;
  `providerConfirmIdempotencyKey` is confirm/capture-operation idempotency.
- the installed EX2A `EximbayProviderOrderCandidate` is an opaque, memory-only,
  non-wire semantic authority associated with one `Payment` identity.
- the provider registry, canonical activation guard, factory, credentials,
  routes, void path, and refund worker all keep Eximbay disabled or excluded.
- the C0 migration supplies precedents for fail-closed historical preflight,
  explicit transactions, PostgreSQL `CHECK` constraints, partial uniqueness,
  row-level immutability triggers, and migration rollback tests.

No current source contradicted the selected ownership model. The reconnaissance
conclusion is therefore:

```text
Payment is sufficient as the provider-order identity owner.
No PaymentAttempt, CallRecord, or new attempt owner is justified.
```

## 5. Persistence semantic and ownership

The future schema semantic name is frozen as:

```text
Payment.providerOrderId String?
```

No current naming conflict exists. Its meaning is:

```text
merchant-created provider-facing order correlation identity

owned by exactly one physical Payment attempt

assigned and committed before provider contact authority can become CONTACTED

immutable after insertion

never transferred, copied, reassigned, or recycled between Payments

independent of every provider-issued financial identity
```

It is not any of:

```text
Payment.id
providerRef
providerPaymentKey
idempotencyKey
providerConfirmIdempotencyKey
refund idempotency or provider-refund identity
void/cancel operation identity
```

## 6. Provider scoping

EX2B1 freezes this slice-level invariant:

```text
provider == EXIMBAY
  -> providerOrderId is required and valid

provider != EXIMBAY
  -> providerOrderId is null
```

Existing and future `MOCK`, `TOSS`, and `PAYPAL` rows must not receive invented
values. Toss may continue to derive its own provider-facing order identity
under its existing semantics. This slice does not claim that no future provider
can ever adopt `providerOrderId`; adoption by another provider requires a new
reviewed contract and migration.

## 7. Provider-order identity grammar

The exact EX2B1 application and persistence grammar is:

```text
^c[0-9a-z]{24}$

length:
  25 ASCII characters

prefix:
  literal lowercase c

remaining alphabet:
  0123456789abcdefghijklmnopqrstuvwxyz
```

Reject uppercase, punctuation, whitespace, control characters, Unicode outside
ASCII, wrong length, and wrong prefix. Do not trim, case-fold, replace, encode,
or otherwise normalize. Invalid persisted input fails closed.

This is a selected Mira identity family supported by two exact BF2 observations.
It is not described as Eximbay's complete grammar or universal acceptance.

## 8. Random generation policy

New identifiers must use:

```text
cryptographically secure random bytes
+
unbiased rejection sampling into the 36-character alphabet
```

Generation must reject out-of-range byte values rather than reduce arbitrary
bytes modulo 36. It must not use `Math.random`, transformed UUID text, Prisma
`cuid()`, a transformation of `Payment.id`, modulo-biased mapping, timestamps,
session identities, or idempotency keys.

Random generation and Prisma allocation live outside the installed EX2A pure
protocol kernel. EX2A remains deterministic, randomness-free, Prisma-free,
environment-free, and network-free. Exact future helper and file names are not
frozen.

## 9. Database-authoritative collision closure

Probability is not correctness. PostgreSQL must install authoritative
provider-scoped uniqueness equivalent to:

```text
UNIQUE(provider, providerOrderId)
```

Nullable semantics must preserve multiple null values for non-Eximbay rows.
The exact Prisma declaration or reviewed raw SQL may follow repository
conventions. The database constraint remains authoritative even though the
current PrismaPg application error mapping cannot reliably expose its exact
named identity.

## 10. Current collision fail-closed policy

Current EX2B1 source authority freezes:

```text
generated candidates per authoritative creation operation:
  1

automatic providerOrderId collision regeneration attempts:
  0

providerOrderId automatic collision regeneration:
  DISABLED
```

The operation generates one valid candidate and attempts one authoritative
`Payment` contact-authorization transaction. If insertion fails because of any
uniqueness conflict, generic `P2002`, or uniqueness failure whose exact
constraint identity is unavailable, the transaction rolls back and the
operation fails closed before provider contact. It must not generate a second
candidate or automatically perform a second creation transaction.

Do not infer exact provider-order collision authority from:

```text
generic P2002
error message text
locale-sensitive PostgreSQL detail parsing
field-tuple heuristics
Prisma meta.target heuristics
```

Never resume an aborted PostgreSQL transaction. A failed creation commits no
`Payment`, creates no `CONTACT_AUTHORIZED` authority, and permits zero provider
contact. A separate later operation may run normal authoritative creation logic
from the beginning, but the failed operation itself performs no regeneration
or automatic retry and must not be converted into compatible re-entry.

## 11. Current PrismaPg constraint truth and future regeneration gate

The independent audit establishes this current-stack result:

```text
EXACT_CONSTRAINT_DISCRIMINATION_NOT_FEASIBLE
```

The installed PrismaPg 7.8 path maps PostgreSQL `23505` without a sufficiently
reliable structured named-constraint identity for provider-order retry
authority. This is not merely missing test coverage. EX2B1 must not add a new
driver, raw `pg` bypass, message parser, dependency upgrade, or adapter patch to
recover regeneration.

A future separately reviewed change may introduce bounded collision
regeneration only if a structured collision primitive can positively
distinguish the exact provider-order uniqueness constraint from every unrelated
uniqueness failure. If that future condition is proven, each retry must discard
the candidate, restart the full authorization transaction, reacquire locks,
and re-evaluate current state. This paragraph grants no current retry authority:

```text
current EX2B1 source implementation:
  MUST NOT implement regeneration
```

## 12. Allocation timing and contact authority

For a newly created Eximbay attempt, the required order is:

```text
generate a valid candidate for the new-row decision
  -> create the Payment inside the existing contact-authorization transaction
  -> persist providerOrderId on that Payment
  -> commit the transaction with CONTACT_AUTHORIZED
  -> markContactStarted transaction commits CONTACTED + contactStartedAt
  -> only then may a future transport slice contact the provider
```

Provider-order persistence belongs to creation of a new Eximbay `Payment` in
the existing authorization transaction. It is not a later patch-up write. No
provider call may occur in that transaction, and EX2B1 adds no provider call at
all.

## 13. Compatible re-entry

When current attempt logic decides that an existing `Payment` is compatible and
reusable, EX2B1 must return:

```text
same Payment
same persisted providerOrderId
```

It must not generate, compare against, or persist a replacement identity for
that row. Generation is only for creation of a new Eximbay `Payment`.

## 14. Incompatible supersession

When an uncontacted `CONTACT_AUTHORIZED` attempt is validly superseded:

```text
old Payment retains its providerOrderId permanently
old providerOrderId retires with that Payment
new Payment receives a newly generated providerOrderId
```

The old identity is never moved, copied, reassigned, or recycled, even when
the provider definitely did not observe it.

## 15. Rollback semantics

If creation of the new `Payment` rolls back, the random candidate has no durable
authority and may be discarded. Contact cannot have begun because the
`CONTACT_AUTHORIZED` commit did not occur. A later full transaction attempt may
generate a fresh candidate.

Rollback does not permit reuse of a candidate that belonged to a committed
superseded, terminal, contacted, unknown-outcome, or finalized `Payment`.

## 16. Contact lifecycle ordering and ambiguity

The current ordering remains:

```text
CONTACT_AUTHORIZED
  -> markContactStarted
  -> CONTACTED + contactStartedAt committed
  -> provider contact may begin
```

No new lifecycle state is added solely for provider-order allocation. The
current `CONTACT_AUTHORIZED`, `CONTACTED`, `OUTCOME_UNKNOWN`, and `SUPERSEDED`
semantics are sufficient. A proposed new state is a contract change requiring
new evidence and review.

Once `CONTACTED` is durably committed, the same `Payment` must never be blindly
contacted again. A later transport slice must distinguish known response from
ambiguous outcome and use `OUTCOME_UNKNOWN` or separately designed recovery.
Regenerating `providerOrderId` must never hide or route around possible prior
contact.

### 16.1 Eximbay webhook-first creation boundary

EX2B1 does not authorize webhook-first Eximbay `Payment` creation. Every
Eximbay `Payment` that owns `providerOrderId` in this slice must originate from
the locally initiated Payment-attempt creation path defined by this contract.

Current generic completion architecture can create webhook-first `Payment`
rows for other providers, but installed evidence does not establish that every
future Eximbay callback supplies a recoverable merchant `order_id`. Therefore:

```text
existing non-EXIMBAY webhook-first flows:
  UNCHANGED

EXIMBAY webhook-first creation:
  NOT AUTHORIZED BY EX2B1
```

An attempt to use generic webhook-first fabrication without a pre-existing,
correlated Eximbay `Payment` and its persisted `providerOrderId` must fail
closed. It must not satisfy the database invariant by inventing a random,
placeholder, `Payment.id`-derived, or otherwise transaction-unrelated
`providerOrderId`.

A future genuine Eximbay webhook-first requirement needs separately reviewed
BF4/provider evidence and one of these not-yet-selected design changes:

```text
verified callback correlation to an already existing Payment

or

a revised schema/completion model permitting a genuinely provider-originated
EXIMBAY Payment without fabricated merchant identity
```

This contract does not choose between them and does not assume a future
callback payload contains `order_id`.

## 17. PostgreSQL shape constraint

The future migration must install database invariants equivalent to:

```text
provider = EXIMBAY
  -> providerOrderId IS NOT NULL
  AND providerOrderId ~ '^c[0-9a-z]{24}$'

provider <> EXIMBAY
  -> providerOrderId IS NULL
```

TypeScript validation alone is insufficient. Direct SQL and ORM writes must
receive the same fail-closed result.

## 18. Database-enforced immutability

After insertion:

```text
providerOrderId cannot change
providerOrderId cannot be cleared
```

The database, not only application APIs, must enforce this. The preferred
repository precedent is a PostgreSQL `BEFORE UPDATE` trigger using
`IS DISTINCT FROM`, or a functionally equivalent reviewed mechanism. It must
reject null-to-value, value-to-null, and value-to-different-value updates. The
provider-shape check and immutability together must also prevent converting a
row between the Eximbay and non-Eximbay identity semantics.

General database immutability of `Payment.provider` is pre-existing debt and is
not solved by EX2B1. This slice must nevertheless make both
`EXIMBAY -> non-EXIMBAY` and `non-EXIMBAY -> EXIMBAY` invalid ways to evade the
new identity semantics. Do not broaden EX2B1 into a generic provider-
immutability migration.

## 19. Migration preflight and atomicity

Before the first EX2B1 schema mutation, the migration must inspect current
durable state. If any historical `Payment` with `provider = EXIMBAY` exists:

```text
STOP — migration fails closed
```

Do not backfill, derive, fabricate, or guess a provider-order identity. This
preflight follows installed EX1 authority, under which runtime Eximbay payment
creation was unavailable.

The migration must install the column, shape checks, provider-scoped
uniqueness, and immutability mechanism atomically in one PostgreSQL transaction.
Any later DDL failure must roll back every preceding EX2B1 mutation. Historical
`MOCK`, `TOSS`, and `PAYPAL` rows and their identity meanings remain unchanged.

## 20. `providerRef` separation

```text
providerRef != providerOrderId
```

Current source and its governing decision define `providerRef` as a nullable,
provider-specific intermediate/initiation output reference. Its provider scope
and uniqueness are intentionally not the new merchant-order contract. EX2B1
must not write Eximbay `order_id` into `providerRef`. A future Eximbay use of
`providerRef` requires a separately defined provider concept.

The repository decision that once rejected a generic field named
`providerOrderId` for the common `providerRef` contract is not a naming conflict:
EX2B1 now has separate BF2 evidence and a narrower, explicitly defined durable
semantic. It does not broaden or replace `providerRef`.

## 21. `providerPaymentKey` separation

```text
providerPaymentKey = provider-issued financial identity
```

It remains post-contact/post-verification authority. Merchant-created
`providerOrderId` must never be written there. One future Eximbay `Payment` may
legitimately contain both identities, with different owners and authority.

## 22. Idempotency separation

`Payment.idempotencyKey` is initiation-operation idempotency.
`providerConfirmIdempotencyKey` is outbound confirm/capture idempotency. Refund
and void/cancel operation keys own their respective provider operations.

No such key may be equal to, derived from, aliased to, or used as a fallback for
`providerOrderId`, and `providerOrderId` must not be used as an idempotency key.

## 23. `Payment.id` separation

`Payment.id` remains repository primary identity only. It must not be sent as
Eximbay `order_id`, and must not be prefixed, truncated, encoded, hashed, or
otherwise transformed into the new identity. The selected identity is
independently generated.

## 24. Preservation of the installed EX2A candidate

The installed `EximbayProviderOrderCandidate` remains:

```text
opaque
memory-only
non-wire
Payment-owned semantic authority
```

Do not add the persisted wire string to that object, weaken its private
WeakMap/brand boundary, reveal its Payment identity through spreading or
serialization, or replace it with a string. Existing EX2A canonical preparation
facts may continue to carry this opaque candidate.

## 25. Trusted persisted binding

EX2B1 may introduce a separate nominal binding whose only semantic authority is
to establish that:

1. the EX2A candidate belongs to repository `Payment` X;
2. the persistently loaded `Payment` X has provider `EXIMBAY`;
3. `Payment` X owns persisted `providerOrderId` Y; and
4. Y satisfies the frozen EX2B1 grammar.

The binding must be immutable, separate from the existing candidate, and
non-forgeable through ordinary object construction. Its production authority
must originate at a persistence boundary that loads and validates the actual
`Payment`; a caller-supplied object that merely resembles a Prisma row is not
trusted persistence evidence. The brand/constructor must not be exposed as a
general public bypass. Exact TypeScript names and module grouping are left to
the implementation review.

The binding proves identity ownership only. It grants no contact, routing,
network, provider-response, completion, or financial authority. Those
authorities remain governed by their separate lifecycle and future-slice gates.

## 26. Binding mismatch behavior

Binding or materialization must fail closed for:

```text
candidate belongs to a different Payment
wrong provider
missing providerOrderId
invalid providerOrderId grammar
hand-built or untrusted binding
binding from another Payment
different Payment's providerOrderId
persisted Payment disappearing or changing before the owned snapshot is established
```

Failure must never silently substitute `Payment.id`, `idempotencyKey`,
`providerRef`, `providerPaymentKey`, a session identity, or a newly generated
value.

## 27. Provider-free `/ready` materialization

EX2B1 authorizes a new provider-free materialization seam with inputs:

```text
validated installed EX2A canonical preparation facts
+
trusted persisted provider-order binding
```

Its output is an immutable, server-side `/ready` request-facts value. The wire
field must be:

```text
payment.order_id = binding's persisted providerOrderId
```

The materialized shape carries exactly the already validated preparation facts
under their installed wire names:

```text
payment:
  transaction_type
  order_id
  currency
  amount
  lang
  payment_method when present

merchant:
  mid

buyer:
  name
  email

url:
  return_url
  status_url
```

The materializer must verify that the binding owns the exact opaque candidate
carried by the canonical facts. It must reuse the installed EX2A canonical
amount wire value and every other validated preparation fact without
reinterpreting them. The result must be deeply isolated from caller mutation.

The materializer performs no HTTP, authentication, endpoint resolution,
environment lookup, credential lookup, SDK work, FGKey handling, database
mutation, provider selection, or routing.

## 28. Supported preparation slice

The required evidence-backed cases are:

```text
transaction_type:
  PAYMENT

P000 + USD:
  amount "1.00" for 100 minor units

P000 + JPY:
  amount "1" for 1 minor unit

no forced payment method + USD:
  amount "1.00" for 100 minor units
```

Currency remains only `USD | JPY`; the only explicit method remains `P000`, and
method absence must follow already validated EX2A facts. The installed EX2A
canonical constructor currently permits method absence independently of those
two currencies. A general pure projection need not invent a special rejection
for such already-valid facts, but any unobserved combination must be labeled
EX2A semantic projection only, not BF2-observed provider support. Do not add a
currency, method, or transaction model.

## 29. Amount authority

The installed EX2A integer/string amount codec is the sole Eximbay wire amount
authority. Do not create a second codec, use display formatting, divide into a
floating major-unit number, call `toFixed`, or round.

Canonical expectations remain:

```text
USD: exactly two minor-unit digits
JPY: zero minor-unit digits
```

## 30. MID, credential, and FGKey boundary

EX2B1 does not configure, retrieve, or validate a real merchant account. The
materializer may carry an already validated canonical `mid` as non-secret data.
Tests use synthetic non-secret values.

Do not add:

```text
MID environment variable
API key
Authorization value or header
credential loader
production merchant configuration
```

The `/ready` request-facts output must not contain `fgkey`. FGKey is future
provider response authority and cannot be an EX2B1 input or output.

## 31. Network and transport prohibition

EX2B1 source contains no Eximbay transport authority. Do not add Eximbay use of:

```text
fetch
undici request
https.request
axios
curl
endpoint or host constant
Authorization or Basic authentication
retry/backoff policy
provider HTTP response parser
```

There is no `/ready` HTTP adapter or provider request. A future transport slice
requires a separate current-evidence contract.

## 32. SDK and browser prohibition

Do not load an Eximbay JavaScript SDK, choose v1 or v2, call a browser handoff,
open a payment page, or consume FGKey in a browser. The gate remains:

```text
KEEP_BF3_SEPARATE_BEFORE_EX2B2
```

## 33. Callback and ingress prohibition

Do not create a `status_url` route, callback route, raw-query route integration,
acknowledgement behavior, or retry handler. BF4 remains required. The existing
EX2A pure parser remains non-route, non-network protocol logic.

## 34. Factory, routing, and runtime exclusion

EX2B1 must not modify source that makes Eximbay selectable or externally
callable. Preserve fail-closed behavior in:

```text
PROVIDER_REGISTRY
ROUTING_RULES
MARKET_DEFAULTS
canonicalActivationFailure
provider factories
credential and deployment mappings
actions and routes
webhook routing
refund eligibility
void eligibility
```

The mere existence of a persisted identity, generator, binding, or request
facts must not change runtime reachability. Eximbay remains disabled with no
allowed modes, methods, currencies, live markets, adapters, credentials,
routes, refund execution, or void execution.

## 35. EX2A and dependency isolation

The installed EX2A pure modules remain deterministic and isolated. Randomness,
Prisma, server environment, provider factories, routes, network, completion,
refund, and void dependencies must not enter them.

The persistence allocator belongs outside that pure kernel, naturally in the
Payment-attempt ownership layer or another reviewed lower dependency. A pure
validation/binding/materialization unit may live near the Eximbay protocol
source only when its import graph remains explicit, pure, and covered by the
existing isolation proof. The current EX2A public candidate and preparation
contracts must not be rewritten merely to accommodate persistence.

## 36. Payment creation integration boundary

A future EX2B1 source task may modify the Payment-attempt creation path solely
to:

```text
allocate providerOrderId for a newly created EXIMBAY Payment
persist it in the existing creation transaction
reuse it on compatible same-Payment re-entry
retain it through supersession/contact/later lifecycle changes
```

No provider call, provider resolution change, routing change, or activation may
be added there. Existing lock order, transaction visibility, commerce
validation, one-blocking-attempt rule, and contact-claim ordering must remain
visible and behavior-tested.

## 37. Test-only reachability

Production routing must remain fail-closed. Tests may reach the lower-level
EXIMBAY creation/binding/materialization behavior through direct lower-level
calls, dedicated fixtures, or explicit test-only authority. They must not add a
production debug bypass, public action, route, factory adapter, registry entry,
environment flag, or general export that makes raw provider initiation
authority importable outside its current owner.

The current provider-initiation ownership tests are a protected boundary. Any
test seam must preserve their central invariant that only the committed
`CONTACTED` owner can possess raw provider initiation capability.

## 38. Required behavior and concurrency tests

Future source tests must cover at least:

- exact grammar acceptance and every rejected character/length/prefix class;
- CSPRNG output validation and rejection-sampling behavior without testing
  statistical probability as the correctness mechanism;
- concurrent same-session creation and active-attempt convergence;
- compatible pre-contact re-entry returns the same `Payment` and ID;
- incompatible supersession leaves the old ID on the old row and creates a new
  ID on the replacement;
- providerOrderId uniqueness under concurrency;
- a duplicate providerOrderId fails the creation transaction closed;
- no replacement random ID is generated after a duplicate failure;
- an unrelated `Payment.idempotencyKey` uniqueness failure fails closed;
- a generic or unknown `P2002` never triggers provider-order regeneration;
- an open-blocking-attempt conflict follows existing authoritative lifecycle
  handling rather than provider-order regeneration;
- every failed insertion produces zero provider-contact authority;
- allocation commits with `CONTACT_AUTHORIZED` before `CONTACTED`;
- `markContactStarted` does not mutate the ID;
- `CONTACTED` retains the exact ID;
- output-less `CONTACTED` and `OUTCOME_UNKNOWN` paths never regenerate or
  recontact;
- rollback leaves no durable candidate authority;
- materialization maps the persisted ID, not any other identity;
- candidate/Payment/binding mismatches fail closed;
- Eximbay webhook-first creation without a pre-existing correlated `Payment`
  fails closed and fabricates no providerOrderId;
- existing non-Eximbay webhook-first behavior remains unchanged;
- intentional Eximbay test fixtures are valid from insertion time without
  weakening provider exclusions;
- new public source surfaces perform zero network I/O;
- EX1 routing, factory, credential, route, refund, and void exclusions remain
  green.

Tests must identify exactly which `Payment` and `providerOrderId` survive each
race. String-presence checks alone are insufficient.

## 39. Failure-before-contact and ordering tests

At minimum, establish this intermediate state:

```text
providerOrderId allocated
Payment committed
attemptLifecycle = CONTACT_AUTHORIZED
contactStartedAt = null
```

Then prove:

```text
compatible retry:
  same Payment / same providerOrderId

valid supersession:
  old Payment keeps old providerOrderId
  new Payment gets new providerOrderId

contact claim:
  CONTACTED keeps the same providerOrderId
```

No transport is needed or permitted to test this invariant.

## 40. Required PostgreSQL constraint tests

Tests must exercise the database directly enough that ORM validation or
omission cannot hide defects. Verify rejection of:

```text
EXIMBAY Payment without providerOrderId
EXIMBAY Payment with invalid grammar
non-EXIMBAY Payment with providerOrderId
duplicate (EXIMBAY, providerOrderId)
providerOrderId mutation
providerOrderId clearing
null-to-value assignment after insertion
```

Also verify valid Eximbay insertion and preservation of existing provider rows.

## 41. Required migration proofs

Migration integration tests must cover:

1. empty database deployment through the full repository migration history;
2. existing non-Eximbay rows preserved byte/field-semantically;
3. unexpected historical Eximbay row stops before any EX2B1 mutation;
4. valid Eximbay insertion;
5. every shape, uniqueness, and immutability rejection from §40;
6. duplicate provider-order insertion rolls back and remains a pre-contact
   failure without automatic regeneration; and
7. rollback of the column and all preceding EX2B1 DDL when a later migration
   statement is forced to fail.

No historical backfill or direct database repair is authorized.

### 41.1 Intentional Eximbay fixture migration

Installing the new database invariant intentionally invalidates current tests
that insert an Eximbay `Payment` without `providerOrderId` or create another
provider's row and later mutate `provider` to `EXIMBAY`. This is expected
fixture debt, not a reason to weaken production constraints.

The future source task must inventory the entire test tree for intentional
Eximbay `Payment` fixtures. Reviewed examples include:

```text
src/lib/payment/refund/__tests__/claim.integration.test.ts
src/lib/payment/refund/__tests__/request.integration.test.ts
src/lib/payment/refund/__tests__/resolve-execution.integration.test.ts
```

The inventory is not limited to those examples. Every intentional Eximbay row
must be created validly at insertion time with a syntactically valid, unique
test `providerOrderId`. Where a test currently mutates a non-Eximbay row into
Eximbay, replace that setup with direct construction of a valid Eximbay row.

Fixture migration must not disable a `CHECK`, drop uniqueness, bypass the
immutability trigger, make the field optional for Eximbay, add a production
debug path, or permit provider mutation for test convenience. Refund, void,
routing, factory, and activation exclusion assertions must retain their actual
fail-closed behavior; the new field is setup data, not capability.

## 42. Provider-free materialization tests

Require exact output tests for:

```text
P000 / USD "1.00"
P000 / JPY "1"
no-method / USD "1.00"
```

and for other already valid EX2A canonical facts only with the evidence label
distinction in §28. Verify deep immutability and mutation isolation. Assert:

```text
wire payment.order_id == persisted providerOrderId
wire payment.order_id != Payment.id
wire payment.order_id != idempotencyKey
wire payment.order_id != providerRef
wire payment.order_id != providerPaymentKey
```

The test must also prove no `fgkey`, endpoint, credential, or authorization
field is present.

## 43. Network and runtime isolation proof

Behavior-level tests must exercise ID allocation, trusted binding, and
materialization with network primitives trapped and observe zero calls. Source
dependency/import checks remain required as regression defense but must not be
the only proof when behavior can be exercised.

The existing EX1 invariance suite must continue to prove:

```text
EXIMBAY unselectable
no external Eximbay adapter
no Eximbay credential or deployment key
no SDK dependency or import
no Eximbay callback/ready/verify/retrieve/refund route
refund and void blocked
TOSS_ONLY_EXPLICIT refund-worker authority unchanged
```

## 44. Backward compatibility

```text
MOCK:
  unchanged

TOSS:
  unchanged

PAYPAL:
  unchanged
```

No existing provider's external request, idempotency, providerRef,
providerPaymentKey, refund, void, or routing contract changes. Existing
non-Eximbay rows remain null in the new column. Existing non-Eximbay
webhook-first creation behavior remains unchanged; only Eximbay webhook-first
fabrication is excluded by this slice.

## 45. Future compatibility without present authority

The persisted identity may later be useful for callback correlation, provider
lookup, customer support evidence, or reconciliation. EX2B1 implements none of
those capabilities.

Refund and void must not begin using `providerOrderId` merely because it exists.
Provider financial actions remain bound to verified provider financial identity
unless later current provider evidence and a separately reviewed contract
explicitly change that rule.

## 46. Threat and failure model

| Threat or failure | Required disposition |
| --- | --- |
| Random collision | Database unique constraint is authoritative; current operation rolls back and fails closed without regeneration. |
| Modulo bias | CSPRNG rejection sampling only. |
| Collision error confused with blocking/idempotency conflict | Every generic/unknown uniqueness error fails closed; no regeneration. |
| Application infers exact constraint from Prisma metadata or text | Prohibited on current PrismaPg 7.8 path. |
| Compatible re-entry mints another ID | Reuse the persisted same-Payment identity. |
| Supersession recycles an unseen ID | Prohibited; retire identity with old Payment and generate new. |
| Direct SQL changes or clears ID | Database immutability trigger rejects. |
| Historical Eximbay row lacks trustworthy ID | Migration stops; no backfill. |
| Candidate and persisted row are mismatched | Trusted binding creation/materialization fails closed. |
| Hand-built object forges trusted binding | Nominal/private authority boundary rejects ordinary construction. |
| Internal Payment/idempotency/provider reference leaks to wire | Exact separation and materialization tests reject. |
| New code accidentally contacts provider | Behavior-level network trap and dependency isolation fail. |
| Persisted identity makes Eximbay selectable | EX1 routing/factory/credential/route invariance tests fail. |
| Generic webhook-first completion fabricates an Eximbay row | Fail closed without inventing providerOrderId; existing-provider behavior remains unchanged. |
| Test mutates another provider row into Eximbay | Replace with valid insert-time Eximbay fixture; never weaken production invariant. |
| Contact outcome is ambiguous | Preserve same `Payment` and ID; use existing unknown-outcome discipline, never regenerate. |
| Materializer duplicates amount logic | Reuse installed EX2A canonical amount wire value. |
| FGKey is confused as request input | EX2B1 output excludes it; SDK/transport remain separate gates. |

## 47. Source authorization boundary for a future task

A separately authorized EX2B1 source implementation may modify only what is
necessary for:

```text
Payment.providerOrderId persistence
one atomic migration
CSPRNG generation
pre-contact collision fail-closed handling
Payment-attempt allocation integration
trusted persisted binding
provider-free ready materialization
behavior/PostgreSQL/migration/isolation tests
intentional EXIMBAY fixture migration
Source Status / As-Built after reviewed merge
minimal documentation pointers
```

Expected classes of future changed paths may include the Prisma schema, one
migration, Payment-attempt allocation source, a server-owned random generator,
pure validation/binding/materialization source, and focused tests. Exact file
names are not frozen where current ownership and dependency direction can be
preserved more clearly.

## 48. Explicit out-of-scope gates

EX2B1 grants no authority for:

```text
Eximbay provider transport or HTTP adapter
credentials, MID environment configuration, or authentication
SDK selection, loading, invocation, or browser handoff
return/status callback routes or acknowledgement behavior
verify, retrieve, inquiry, reconciliation transport
confirm, capture, authorization, or payment completion
refund, cancellation, or void
provider factory, registry, routing, fallback, or activation
sandbox or live merchant use
real customer/provider order creation
Order or ManufacturingRequest behavior
production deployment
BF2 repeat
```

BF3, BF4, later transport, merchant-account, sandbox, and live gates remain
separate. Completing EX2B1 does not automatically authorize EX2B2 or any other
slice.

## 49. Implementation stop conditions

Return to design before source installation if:

- current source no longer makes `Payment` the physical attempt/contact owner;
- a naming collision changes the semantic meaning of `providerOrderId`;
- current source proposes any automatic provider-order collision regeneration;
- a future retry proposal lacks separately reviewed structured exact-constraint
  discrimination;
- the migration cannot atomically install every invariant;
- existing Eximbay rows are found;
- implementation would require changing routing, factory, credentials, routes,
  refund, void, or runtime activation;
- provider contact, endpoint knowledge, SDK, credential, or environment lookup
  becomes necessary;
- the EX2A candidate must expose a wire string or lose its private authority;
- a trusted persisted binding cannot be made provenance-safe and nominal;
- current payment policy or source contradicts this contract.

## 50. Verification for this candidate

This documentation-only authoring task requires:

```text
all local Markdown links resolve
git diff --check passes
changed paths are exactly the new contract, engineering README, and decision log
no source/schema/migration/test/route/config/dependency change
no staged file, commit, push, PR, or merge
```

No `npm run verify`, Prisma command, database operation, provider request, SDK
load, credential access, or runtime route test is required or authorized for
this documentation-only candidate.

## 51. Rollback, recovery, and change control

Before acceptance, rollback is removal of this candidate and its two minimal
documentation pointers. After reviewed merge, semantic change requires a new
version with explicit supersession and a decision-log entry; do not rewrite the
historical contract to impersonate later source truth.

The future implementation rollback unit is the unused, runtime-disabled
provider-order schema/source slice under a separately reviewed migration and
rollback plan. If provider contact, credentials, SDK state, Eximbay customer
payments, or unexpected historical Eximbay rows appear, that is not routine
EX2B1 rollback: stop, preserve evidence, maintain runtime disablement, and open
a separate incident/design adjudication.

After a reviewed source merge, a separate Source Status / As-Built record must
bind the actual schema, migration, source, tests, review findings, verification,
limitations, and continued runtime non-authority under the Feature
Documentation Standard.

The corrected candidate returns to the same independent reviewer that raised
EX2B1-AUD-001 through EX2B1-AUD-003 for one focused finding-closure review.

## Verdict

```text
EX2B1 DESIGN CONTRACT v0.1
CANDIDATE — NOT INSTALLED — READY FOR FOCUSED FINDING CLOSURE AFTER CORRECTION VERIFICATION
```
