# Eximbay EX2B1 — Provider Order Identity + Provider-Free `/ready` Preparation Source Status / As-Built v0.1

## Status

```text
DOCUMENT CLASS:
  SOURCE STATUS / AS-BUILT

RISK CLASS:
  HIGH — PAYMENT IDENTITY, PERSISTENCE, CONCURRENCY, AND PROVIDER PROTOCOL

TASK CLASSIFICATION:
  SOURCE_ONLY

TASK-LEVEL AUTHORIZATION:
  DOCUMENTATION_ONLY

SOURCE STATUS VERSION:
  v0.1

DESIGN CONTRACT:
  HISTORICAL NORMATIVE ARTIFACT / REVIEWED AND MERGED

EX2B1 SOURCE:
  MERGED / INSTALLED / REVIEWED

SOURCE REVIEW FINDINGS:
  CLOSED

FINAL SOURCE VERIFICATION:
  PASS WITH THE LITERAL npm run verify EXCEPTION IN SECTION 13

EX2B1 SOURCE STATUS RECORD:
  PENDING REVIEW / INSTALLATION

EX2B1 LIFECYCLE:
  PENDING SOURCE-STATUS INSTALLATION

EXIMBAY RUNTIME AUTHORITY:
  NONE

EXIMBAY PROVIDER CONTACT:
  NONE

EXIMBAY SANDBOX / LIVE RUNTIME ACTIVATION:
  NOT AUTHORIZED
```

## 1. Status and authority

This record documents the actual Eximbay EX2B1 source merged to `main` by PR
#52. It binds the installed source identity, exact merged scope, durable
persistence semantics, database authority, lifecycle integration, trusted
binding and provider-free request preparation, review corrections,
verification evidence, limitations, and deferred gates at merge commit
`016ac179b5568f24e9467462e3a86a8ca530fd6d`.

This is a Source Status / As-Built record under the
[Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md).
It is descriptive source authority linked to the governing design. It is not
a new Design Contract, provider protocol contract, provider-contact task,
operations runbook, callback contract, refund/void contract, or activation
record.

The lifecycle distinctions are explicit:

```text
designed:
  YES — historical normative Design Contract reviewed and merged

implemented:
  YES — source reviewed and merged

source findings closed:
  YES — B-01 and I-01 closed before merge

provider-contacting:
  NO

runtime-integrated or routed:
  NO

activated:
  NO

this Source Status independently reviewed and installed:
  NO — review and installation pending
```

The historical Design Contract retains its original candidate/status text.
That document froze normative design at its lifecycle stage; this separate
record captures the later installed source truth without rewriting history.

## 2. Governing documentation and precedence

This record is governed by:

1. [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md).
2. [EX2B1 Provider Order Identity + Provider-Free `/ready` Preparation Design Contract v0.1](./eximbay-ex2b1-provider-order-ready-preparation-design-contract-v0.1.md).
3. [EX2A Pure Protocol Kernel Design / Implementation Contract v0.1](./eximbay-ex2a-pure-protocol-kernel-design-contract-v0.1.md).
4. [EX2A Pure Protocol Kernel Source Status / As-Built v0.1](./eximbay-ex2a-pure-protocol-kernel-source-status-v0.1.md).
5. [BF2 Shared-Test `/ready` Preflight Provider Evidence / Execution Contract v0.1](./eximbay-bf2-shared-test-ready-preflight-contract-v0.1.md).
6. [BF2 Shared-Test `/ready` Preflight Result Evidence / Independent Adjudication v0.1](./eximbay-bf2-ready-preflight-result-adjudication-v0.1.md).
7. The merged schema, migration, source, tests, and Git history identified in
   this record.
8. The independent source-review and final-verification records bound to the
   reviewed source candidate and summarized here.

Repository schema and migration bytes govern installed persistence facts.
Merged source and behavior tests govern installed application behavior. The
BF2 records govern only the bounded shared-test preparation observations they
actually established. No general Eximbay knowledge or unsupported provider
capability is inferred by this record.

## 3. Exact reviewed and installed chain

### 3.1 Design Contract installed baseline

The EX2B1 Design Contract was installed before source implementation. The
source candidate was based directly on:

```text
Design Contract installed baseline / source merge parent 1:
  91ad3aa7f0e06b1e04324677902ae8bb176060db
```

### 3.2 Source implementation

Repository history establishes:

```text
source PR:
  #52

PR title:
  feat(payment): add Eximbay EX2B1 provider order preparation

reviewed source head / source merge parent 2:
  8ac1230992538f80a0d1fe50cfe03ee433b349d8

source merge commit on main:
  016ac179b5568f24e9467462e3a86a8ca530fd6d

source merge parent 1:
  91ad3aa7f0e06b1e04324677902ae8bb176060db

commits in source candidate:
  1

changed paths:
  22

additions / deletions:
  1,660 / 35
```

This record is bound to the merge commit on `main`, not merely to the source
branch head.

### 3.3 Final reviewed-candidate content identity

Final source verification bound the 22-path reviewed candidate with this
candidate-content manifest:

```text
0ad9ea392d3033ef0278470e0f2f49bc84e3c018e7e7fc89f3cf39fedaae411a
```

The deterministic algorithm was:

```text
sort candidate paths bytewise

for each file:
path<TAB>byte-count<TAB>file-SHA-256<LF>

SHA-256 the resulting record stream
```

The final verification recorded:

```text
PRE_VERIFICATION manifest
==
POST_VERIFICATION manifest
```

Verification therefore did not alter the reviewed candidate bytes. This is a
verification-run candidate-content manifest. It is not a repository-wide hash
and is not a Git object hash.

## 4. Exact installed source scope

PR #52 changed exactly these 22 paths:

```text
M  infra/refund-sandbox/p3e-b2/contracts/runtime-image-connection-v1.json
A  prisma/migrations/20260811120000_eximbay_ex2b1_provider_order_identity/migration.sql
M  prisma/schema.prisma
A  src/lib/payment/__tests__/eximbay-fixture.ts
A  src/lib/payment/attempt/__tests__/eximbay-ex2b1-migration.integration.test.ts
M  src/lib/payment/attempt/__tests__/initiate.integration.test.ts
A  src/lib/payment/attempt/__tests__/provider-order-id.test.ts
M  src/lib/payment/attempt/initiate.ts
A  src/lib/payment/attempt/provider-order-id.ts
M  src/lib/payment/complete/__tests__/complete.integration.test.ts
M  src/lib/payment/complete/record-capture.ts
A  src/lib/payment/eximbay/__tests__/isolation.test.ts
A  src/lib/payment/eximbay/__tests__/ready.integration.test.ts
A  src/lib/payment/eximbay/ready.ts
M  src/lib/payment/refund/__tests__/claim.integration.test.ts
M  src/lib/payment/refund/__tests__/refund-dispatch-fixture.ts
M  src/lib/payment/refund/__tests__/refund-p3e-b2-runtime-image-policy.test.ts
M  src/lib/payment/refund/__tests__/request.integration.test.ts
M  src/lib/payment/refund/__tests__/resolve-execution.integration.test.ts
M  src/lib/payment/refund/__tests__/worker-migration-filesystem.test.ts
M  src/lib/payment/refund/__tests__/worker-migration-inventory-closure.test.ts
M  src/lib/payment/refund/__tests__/worker-migration-readiness.integration.test.ts
```

The refund paths update intentional Eximbay fixtures and the pre-existing
refund-sandbox migration/runtime inventory authority. They do not add Eximbay
refund authority.

## 5. Installed persistence and identity semantics

The installed Prisma field is:

```prisma
Payment.providerOrderId String?
```

Its installed semantic is:

```text
Payment:
  physical provider-attempt owner

providerOrderId:
  merchant-created provider-order identity owned by that Payment attempt
```

The identity is distinct from every repository and provider operation identity
below:

```text
providerOrderId != Payment.id
providerOrderId != Payment.idempotencyKey
providerOrderId != providerConfirmIdempotencyKey
providerOrderId != providerRef
providerOrderId != providerPaymentKey
providerOrderId != refund or void operation identity
```

It is allocated only for a newly created Eximbay `Payment`, persists with that
physical attempt, and is not transferred or recycled.

## 6. Installed provider-order grammar and generation

The exact installed grammar is:

```text
^c[0-9a-z]{24}$

length:
  25 ASCII characters

prefix:
  literal lowercase c

payload:
  24 lowercase base36 characters
```

`generateEximbayProviderOrderId` uses the Node server CSPRNG and unbiased
rejection sampling. Bytes `0..251` are accepted; bytes `252..255` are rejected.
Accepted bytes are mapped to the 36-character alphabet only after admission.

The implementation does not use:

```text
Math.random
Payment.id derivation
timestamp derivation
cuid derivation
modulo-biased mapping of arbitrary bytes
```

Provider-order generator behavior was fixed by 11 tests, including exact
shape, byte-251 admission, rejection of 252 through 255, fresh entropy after a
fully rejected chunk, and invalid prefix/length/character classes.

## 7. Collision policy and authoritative creation

The current installed policy is:

```text
one providerOrderId candidate
  -> one authoritative Payment-creation transaction
  -> success OR rollback/fail closed

automatic collision regeneration:
  DISABLED
```

The current PrismaPg error path cannot safely support the exact named-
constraint discrimination needed to authorize selective regeneration. EX2B1
therefore neither parses an error message nor infers exact collision identity
from a generic `P2002`. A uniqueness failure rolls back the creation operation;
the losing operation commits no `Payment`, receives no provider-contact
authority, performs no provider contact, and generates no replacement
candidate after the collision.

This is the current EX2B1 authority, not a claim that regeneration can never be
designed. A future retry policy requires separate reviewed authority and a
structured exact-constraint primitive.

## 8. Database As-Built and historical migration behavior

Migration
`20260811120000_eximbay_ex2b1_provider_order_identity` installs all EX2B1 DDL
inside one PostgreSQL transaction in this order:

1. historical Eximbay `Payment` preflight;
2. nullable `providerOrderId` column;
3. provider/identity shape constraint;
4. provider-scoped unique index; and
5. provider-order immutability function and trigger.

The installed shape invariant is:

```text
provider == EXIMBAY
  -> providerOrderId is present
  -> providerOrderId matches ^c[0-9a-z]{24}$

provider != EXIMBAY
  -> providerOrderId == NULL
```

Provider-scoped uniqueness is implemented by the unique index equivalent to:

```text
UNIQUE(provider, providerOrderId)
```

Database-enforced immutability uses a `BEFORE UPDATE OF "providerOrderId"`
trigger and `IS DISTINCT FROM`. It rejects value changes, clearing, and
null-to-value assignment. The shape constraint plus trigger also closes
provider-transition attempts that would evade the identity model.

Historical migration behavior is fail closed:

```text
unexpected historical EXIMBAY Payment exists
  -> migration aborts before EX2B1 DDL installation
```

There is no random backfill, `Payment.id`-derived identity, placeholder
identity, or silent weakening. Final verification established that after the
historical-preflight failure all of these remained absent:

```text
providerOrderId column
shape constraint
provider-scoped unique index
immutability function and trigger
```

The migration suite also proved atomic rollback when a later DDL statement was
forced to fail, preservation of non-Eximbay rows, valid Eximbay insertion, and
database rejection of invalid shape, non-Eximbay identity, duplicates,
identity mutation, clearing, and provider-transition escapes.

## 9. Payment lifecycle integration

The installed new-attempt ordering is:

```text
new EXIMBAY Payment required
  -> providerOrderId generated
  -> providerOrderId persisted in the authoritative creation transaction
  -> CONTACT_AUTHORIZED commits
  -> CONTACTED + contactStartedAt commits
  -> future provider contact may begin
```

An intermediate-state behavior test observes the committed
`CONTACT_AUTHORIZED` `Payment` with its final `providerOrderId`, a null
`contactStartedAt`, and zero provider-seam calls before releasing contact
claim. The later `CONTACTED` row retains the same identity.

EX2B1 adds no final Eximbay provider-contact implementation.

### 9.1 Compatible re-entry

```text
compatible pre-contact EXIMBAY re-entry
  -> same Payment
  -> same persisted providerOrderId
  -> no replacement providerOrderId
```

### 9.2 Supersession

```text
superseded Payment
  -> permanently keeps its original providerOrderId

replacement Payment
  -> receives a fresh providerOrderId
```

The old identity is neither transferred nor recycled.

## 10. Trusted persisted binding As-Built

The installed production binding API accepts only:

```text
caller supplies:
  candidate
  expected Payment identity

binding issuer:
  owns canonical persistence provenance internally
```

`createTrustedEximbayProviderOrderBinding` imports and uses Mira's canonical
server database boundary internally. Production callers cannot nominate a
`PrismaClient`, Prisma-shaped object, repository, `findUnique` callback, or
arbitrary persistence implementation.

Issuance proves from trusted persistence that:

```text
candidate belongs to expected Payment X
loaded Payment.id == X
loaded provider == EXIMBAY
persisted providerOrderId exists
persisted providerOrderId matches the EX2B1 grammar
```

The returned frozen object is associated with its private authority through a
module-private `WeakMap`. Hand-built, spread/copied, structurally imitated,
Proxy-backed, or otherwise ordinary objects cannot acquire that runtime
authority. The binding proves identity ownership only; it grants no routing,
contact, response-verification, completion, or financial authority.

## 11. Provider-free READY preparation As-Built

The installed source capability is:

```text
canonical EX2A preparation facts
+
trusted persisted provider-order binding
  -> deeply immutable provider-free READY request facts
```

The exact wire semantic is:

```text
payment.order_id = persisted providerOrderId
```

The materializer reuses EX2A canonical projections, including EX2A's installed
amount codec, and replaces the opaque candidate with only the trusted persisted
wire identity. The covered BF2-backed cases are:

```text
P000 / USD / "1.00"
P000 / JPY / "1"
```

The source also behavior-tests the installed EX2A no-method USD projection.
That projection is not described as additional BF2 merchant/provider evidence.

The returned outer object and its `payment`, `merchant`, `buyer`, and `url`
members are frozen and isolated from mutable input aliases. The request facts
contain no endpoint, authorization value, or FGKey.

```text
FGKey:
  NOT part of EX2B1 request-preparation authority
```

EX2B1 does not receive, verify, persist, or process FGKey as provider-response
authority.

## 12. Webhook-first boundary and EX2A preservation

The installed completion boundary is:

```text
EXIMBAY completion/capture
+
no correlated locally initiated Payment
  -> fail closed
```

EX2B1 does not fabricate a `Payment` or `providerOrderId` for webhook-first
Eximbay completion. A capture explicitly correlated to an existing Eximbay
attempt may preserve that attempt and its identities. Existing supported
non-Eximbay webhook-first behavior remains unchanged. Future Eximbay callback
correlation is separately gated.

The installed EX2A pure kernel remains unchanged by PR #52. No new EX2A
Prisma, server persistence, CSPRNG, environment, network, browser, or SDK
authority was added. The opaque `EximbayProviderOrderCandidate` remains
separate from persisted wire `providerOrderId` identity.

## 13. Independent source-review history and closure

The first independently reviewed source candidate was not treated as perfect.
The broad source audit found:

| Finding | Severity | Durable finding |
| --- | --- | --- |
| `B-01` | Blocker | Caller-supplied Prisma-shaped persistence could forge trusted binding provenance. |
| `I-01` | Important | Eximbay-specific concurrency behavior lacked direct simultaneous proof. |

### 13.1 B-01 correction

The bounded correction:

- removed caller-supplied persistence from the production binding API;
- made the binding issuer own the canonical Mira database boundary internally;
  and
- deleted the structural Prisma trust detector.

The corrected eight-test binding suite includes the exact spoof, Proxy, and
structural-imitation regressions without reproducing exploit code here.

```text
B-01:
  CLOSED
```

### 13.2 I-01 correction

The correction added real PostgreSQL tests for:

- same-session concurrent compatible convergence; and
- two-session forced provider-order uniqueness collision.

```text
I-01:
  CLOSED

NEW BLOCKER:
  0

NEW IMPORTANT:
  0

NEW MINOR:
  0
```

These are durable source-review outcomes. They do not claim that this Source
Status candidate has already received independent documentation review.

## 14. Concurrent PostgreSQL proof

Real PostgreSQL testing established, for the tested architecture:

```text
two compatible simultaneous EXIMBAY initiations
same CheckoutSession
  -> one Payment
  -> one providerOrderId
  -> one provider-seam contact
```

PostgreSQL observation showed the second operation active and waiting on a
lock, with a blocking PID, while the first held the session-row serialization
point. This is direct proof for the installed same-session architecture; it is
not a claim about arbitrary distributed-system behavior.

The forced collision test established:

```text
two different CheckoutSessions
same deterministic providerOrderId
concurrent creation
  -> exactly one winner
  -> loser commits no Payment
  -> loser performs no provider contact
  -> no replacement candidate is generated
```

The generator may run once for each independently authorized operation. The
prohibition is post-collision regeneration within the failed operation.

## 15. Migration inventory and refund-sandbox authority

The final repository migration inventory is:

```text
migration count:
  33

last migration:
  20260811120000_eximbay_ex2b1_provider_order_identity

full empty-database history:
  33 / 33 applied
```

Installing migration #33 required updating the pre-existing refund-sandbox
migration inventory and packaged runtime manifest authority. It did not grant
Eximbay refund authority. The verified installed values are:

```text
migration inventory digest:
  a2329aacde7eb91c8b6c905a66f97e3bcb923162d4c2e1de35a165e8b0ced88d

schema digest:
  05393bc34466a42bef8d03e5cc5d83081954b24ec1f554c10f515c2ae6f9e450

EX2B1 migration digest:
  90c7767da3ddef345fc1f942ca5a8263b97cc38e385c9850f5bb40d9ee3ca8a5

runtime manifest digest:
  1f24d3a7cf3df538e25961bcd4e8ec94fb80181134af4761d0067e1a99d92dce
```

## 16. Final source-verification record

Final verification ran against unchanged candidate bytes and recorded:

```text
Prisma validate:
  PASS

Prisma generate:
  PASS

PostgreSQL:
  18.4

full migration history:
  33 / 33 PASS

historical EXIMBAY preflight:
  PASS

DB shape / uniqueness / immutability:
  PASS

B-01 binding regression:
  8 / 8 PASS

I-01 initiation / concurrency:
  36 / 36 PASS

provider-order generator:
  11 / 11 PASS

completion / webhook-first:
  29 / 29 PASS

focused regressions:
  26 files / 565 tests PASS

typecheck:
  PASS

candidate/repository lint excluding only .local-review/**:
  PASS

full tests run separately:
  248 files / 5,732 tests PASS
```

The candidate manifest remained
`0ad9ea392d3033ef0278470e0f2f49bc84e3c018e7e7fc89f3cf39fedaae411a`
before and after final verification.

### 16.1 Literal `npm run verify` exception

The literal command `npm run verify` did **not** complete. Its lint stage
encountered 14 pre-existing parser errors under `.local-review/**`.
`.local-review/**` was not part of the 22-path EX2B1 candidate.

The truthful result is therefore:

```text
literal npm run verify:
  DID NOT COMPLETE

reason:
  14 pre-existing parser errors under .local-review/**

typecheck:
  PASS

candidate/repository lint excluding only .local-review/**:
  PASS

full tests run separately:
  PASS — 248 files / 5,732 tests
```

This record does not describe literal `npm run verify` itself as passing.

## 17. GitHub CI and source installation

Source PR #52 ran CI #317. Its initial execution encountered one failure in:

```text
src/lib/payment/refund/providers/toss/__tests__/recover-toss-refund-recontact.integration.test.ts

failure:
  afterEach hook timed out at 10,000 ms

observed result:
  247 / 248 test files passed
  5,731 / 5,732 tests passed
```

The failing Toss refund recontact test was unchanged by the candidate. Bounded
inspection found that the shared refund fixture preserved null
`providerOrderId` for the Toss path and that the test entered no EX2B1
provider-order generation, trusted-binding, or READY materialization path. The
reviewed candidate bytes remained unchanged.

Exactly one failed-job-only rerun was performed against the same source head.
It completed successfully. No source change was made between the failed
execution and the successful rerun. This record does not assign a stronger
cause classification than the available evidence supports.

```text
source PR:
  #52

source head:
  8ac1230992538f80a0d1fe50cfe03ee433b349d8

source merge commit:
  016ac179b5568f24e9467462e3a86a8ca530fd6d

CI #317:
  completed / success
```

This Source Status is authored after the source installation.

## 18. Preserved exclusions and evidence ceiling

EX2B1 establishes durable, per-`Payment` Eximbay provider-order identity and
provider-free READY request preparation under database-enforced identity
invariants.

It does not establish provider network contact, browser SDK handoff, callback
verification, financial completion authority, routing activation, refund or
void, or live merchant capability.

The source merge preserved these exclusions:

```text
routing:
  disabled

provider selection:
  disabled

external Eximbay adapter:
  absent

credential configuration:
  absent

public Eximbay callback/webhook:
  absent

refund:
  blocked

void:
  blocked

SDK/browser handoff:
  absent

test/live Eximbay runtime activation:
  absent
```

The runtime-activation statement is separate from the historical BF2 public
shared-test evidence. EX2B1 did not remove or reinterpret that bounded provider
evidence; it also did not promote it into Mira runtime or merchant capability.

EX2B1 does not prove:

- that Mira's merchant account is production-enabled;
- that a Mira MID or API key exists;
- that P000 is enabled for a Mira production MID;
- that USD or JPY production settlement is enabled;
- which SDK version is canonical;
- `status_url` transport, acknowledgement, or retry semantics;
- callback financial verification;
- end-to-end card-payment success; or
- Eximbay refund, void, retrieve, or recovery behavior.

Facts not established above remain not established. General Eximbay knowledge
does not fill those gaps.

## 19. Deferred gates and re-entry

The bounded deferred work is:

```text
BF3:
  SDK evidence remains separately gated because current provider documentation
  was previously inconsistent or ambiguous.

BF4:
  callback/status_url evidence remains separately required.

actual Eximbay network transport:
  not part of EX2B1

financial verification/completion:
  not part of EX2B1

merchant/live activation:
  not part of EX2B1

refund/void/recovery:
  not part of EX2B1
```

This Source Status does not design any of those future stages.

## 20. Rollback, recovery, and change control

EX2B1 is installed but provider-free and runtime-disabled. Its technical
rollback unit is the reviewed schema/migration and source/test/inventory slice,
not an ad hoc field removal or runtime toggle. Any rollback must preserve
migration history, database invariants, existing row truth, and the pre-contact
failure boundary under a separately reviewed plan.

No provider cancellation, customer recovery, payment-page recovery, or
credential rotation is expected from EX2B1 itself because it performs no
Eximbay provider request and owns no credential or SDK state. Discovery of
provider contact, credential state, public callback reachability, or activated
merchant behavior would exceed this record: stop, preserve evidence, maintain
runtime disablement, and open a separate incident/design adjudication.

This v0.1 record describes source installed by PR #52 at the exact merge in
Section 3. A material change to durable identity semantics, schema,
constraints, collision policy, trusted persistence provenance, lifecycle
ordering, READY authority, webhook-first behavior, routing, callbacks,
completion, refund/void, or activation requires review and a new Source Status
version or an explicit reviewed update under the Feature Documentation
Standard.

## 21. Next lifecycle gate

The next gate for this artifact is:

```text
independent EX2B1 Source Status / As-Built documentation review
```

That review must verify source/status fidelity, hashes and PR/CI/test counts,
lifecycle wording, exclusion boundaries, and absence of unsupported claims. It
must not reopen the already merged source architecture.

Only a reviewed merge of this Source Status can install the final lifecycle
closure declaration. Until then:

```text
Source implementation:
  INSTALLED

Source review findings:
  CLOSED

Final source verification:
  PASS WITH THE DISCLOSED LITERAL VERIFY EXCEPTION

Source Status record:
  PENDING REVIEW / INSTALLATION

EX2B1 lifecycle:
  PENDING SOURCE-STATUS INSTALLATION
```

## Verdict

```text
EX2B1 SOURCE STATUS / AS-BUILT v0.1 CANDIDATE COMPLETE
— READY FOR INDEPENDENT DOCUMENTATION REVIEW
```
