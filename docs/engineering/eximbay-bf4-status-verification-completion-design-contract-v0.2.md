# Eximbay BF4 — `status_url` Verification / Retrieval / Completion Design Contract v0.2

## Status

```text
DOCUMENT CLASS:
  DESIGN CONTRACT

RISK CLASS:
  HIGH — PAYMENT CALLBACK / FINANCIAL RECONCILIATION

VERSION:
  v0.2

INSTALLATION STATUS:
  READY FOR DOCUMENTATION INSTALLATION

HUMAN TARGETED CORRECTNESS REVIEW:
  PASS

CURRENT AUTHORITY:
  DOCUMENTATION ONLY

SEMANTIC SCOPE:
  AUTHORITATIVE SALE MONEY-MISMATCH DURABLE OWNERSHIP ONLY

SUPERSEDES UPON INSTALLATION:
  eximbay-bf4-status-verification-completion-design-contract-v0.1.md

CURRENT COMPANION UPON INSTALLATION:
  eximbay-bf4-status-verification-completion-threat-model-v0.2.md

THREAT MODEL v0.1:
  immutable historical predecessor

SOURCE / SCHEMA / PROVIDER / CREDENTIAL / ACTIVATION AUTHORITY:
  NONE

E1B:
  CLOSED / ADMITTED / NOT REOPENED

E1A:
  DEFERRED / NOT SATISFIED

E2:
  BLOCKED
```

This document is a narrow normative overlay on the historical
[BF4 Design Contract v0.1](./eximbay-bf4-status-verification-completion-design-contract-v0.1.md).
Upon reviewed installation, v0.2 incorporates v0.1 unchanged except for the
authoritative `SALE` money-mismatch ownership correction in this document.
The v0.1 file remains an immutable historical predecessor. The reviewed
[BF4 Threat / Failure Model v0.1](./eximbay-bf4-status-verification-completion-threat-model-v0.1.md)
also remains immutable, but its T-BF4-17 money-mismatch remediation phrase is
not compatible with this correction. Upon reviewed installation, this Design
Contract v0.2 and the
[BF4 Threat / Failure Model v0.2](./eximbay-bf4-status-verification-completion-threat-model-v0.2.md)
become the current BF4 documentation authority pair. Threat Model v0.2
incorporates v0.1 except for that exact superseded semantic.

This document does not prove or admit source implementation. In particular,
the uncommitted BF4 I1 source remains paused and not implementation-admitted
pending a separate implementation rebind.

## 1. Authority, finding, and installed conflict

This document is governed by [`AGENTS.md`](../../AGENTS.md), the
[Mira AI Engineering Governance](./ai-engineering-governance-v0.1.md), the
[Mira Backend / High-Risk Engineering Governance](./mira-backend-high-risk-governance-v0.1.md),
and the [Feature Documentation Standard](./feature-documentation-standard-v0.1.md).
It was prepared from installed `main` commit
`cb46de11d4b2de925781b1ceab59cef76002b916`, tree
`12a9c481a1e0f16da9c1bd8f2b00929c0bf51a42`.

```text
SEVERITY:
  BLOCKER

GOAL RELEVANCE:
  DIRECT

DEFECT CLASS:
  NEW_STRUCTURAL — INSTALLED DESIGN / DATABASE INVARIANT CONFLICT
```

BF4 v0.1 requires an authoritative provider `SALE` with exact
MID/order/transaction identity but mismatched persisted money to set, when
transition-safe:

```text
Payment.attemptLifecycle = OUTCOME_UNKNOWN
Payment.remediationStatus = RECONCILIATION_REQUIRED
```

The installed
[`Payment_remediation_evidence_check`](../../prisma/migrations/20260801120000_c0_commerce_integrity_foundation/migration.sql)
requires `REQUIRED`, `PENDING`, or `RECONCILIATION_REQUIRED` to have
`Payment.status=SUCCEEDED`. The installed
`Payment_financial_success_evidence_check` in the same migration requires a
`SUCCEEDED` Payment to have both a non-null `providerPaymentKey` and a non-null
`financialSucceededAt`.

Those requirements conflict with BF4's frozen authority rules: a money
mismatch is not exact local financial-success admission, and
`providerPaymentKey` cannot be assigned before verified, retrieved, exact
`SALE` admission including persisted money equality. The current
[`Payment` schema](../../prisma/schema.prisma) therefore cannot represent the
v0.1 transition without either violating a database constraint or falsely
admitting local financial success.

This is a design-owner conflict, not a schema defect. The database constraints
remain unchanged and must not be weakened.

## 2. Corrected authoritative `SALE` mismatch semantics

This correction applies only when all of the following provider observations
have been admitted:

```text
/verify integrity admitted
callback transaction_type = PAYMENT
/retrieve rescode = 0000
/retrieve status = SALE
MID exact
providerOrderId exact
transactionId exact
currency and/or decoded amount != persisted Payment money
```

A failure of `transaction_type`, MID, `providerOrderId`, or `transactionId`
is not this v0.2 money-mismatch case. It remains the existing
identity/semantic-mismatch path under the preserved v0.1 semantics.

The resulting authority is:

```text
provider-observed financial exposure:
  YES

locally admitted exact financial success:
  NO

commerce completion authority:
  NO
```

### 2.1 Payment ownership

When compare-and-set proves the transition is safe, the exact correlated
Payment becomes or remains:

```text
attemptLifecycle:
  OUTCOME_UNKNOWN

status:
  preserve the existing pre-success financial status
  MUST NOT promote to SUCCEEDED

remediationStatus:
  NONE

providerPaymentKey:
  null

financialSucceededAt:
  null

blockingEndedAt:
  null
```

No Payment remediation state is created before exact local financial success
is admitted. If the Payment is finalized, terminal, superseded, suspended,
remediating, financially succeeded, provider-keyed, identity-divergent, or
otherwise cannot safely enter the exact pre-success `OUTCOME_UNKNOWN` state,
automatic BF4 processing stops without forcing a Payment transition.

### 2.2 PaymentEvent ownership

The BF4 PaymentEvent durably owns the provider-observed mismatch:

```text
stage:
  VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION

claim:
  retained

retrieval:
  ADMITTED_SALE_MISMATCH

saleFacts:
  retain the bounded authoritative retrieved facts required for later human
  adjudication

exact raw:
  retain only as permitted by the existing unresolved-event minimization rules

automatic provider recontact:
  0

completion:
  0

success acknowledgement:
  prohibited before human terminal adjudication
```

The event stage is the sole durable statement that Eximbay reported a `SALE`
which Mira did not locally admit because money equality failed.
`Payment.remediationStatus` is not a second owner of this pre-admission
condition.

### 2.3 Crash-safe local ownership transition

When the exact correlated Payment is transition-safe, Payment and PaymentEvent
ownership must change in one local database transaction after retrieval has
returned:

```text
BEGIN

1. lock / CAS the exact Payment identity and safe pre-success state

2. CAS PaymentEvent:
   RETRIEVE_OUTCOME_UNKNOWN
   ->
   VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION
   with:
     retrieval = ADMITTED_SALE_MISMATCH
     diagnostic = SALE_MONEY_MISMATCH
     bounded authoritative saleFacts
     retained claim

3. update the same exact Payment:
   attemptLifecycle = OUTCOME_UNKNOWN

   while preserving:
     existing pre-success status
     remediationStatus = NONE
     providerPaymentKey = null
     financialSucceededAt = null
     blockingEndedAt = null

4. COMMIT
```

Commit is permitted only when the event CAS and the exact safe-Payment update
both affect their expected owner. Any identity, state, or stage miss rolls back
the paired transaction and enters the applicable safe stop.

The semantic guarantee is:

```text
IF Payment is safe at mismatch admission:
  event mismatch evidence and Payment OUTCOME_UNKNOWN commit together

NO state:
  event durably says SALE_MONEY_MISMATCH while a safe Payment remains CONTACTED
  solely because of a crash between independent writes
```

If the Payment is not transition-safe, BF4 does not force its state or discard
the admitted retrieved mismatch. It persists the mismatch event evidence in a
transaction-safe manner, then stops automatically with provider recontact `0`,
completion `0`, success acknowledgement prohibited, and human adjudication
required.

No database transaction remains open across provider contact. This atomicity
is local only, after the single retrieval has already returned.

## 3. Minimum-sufficient correction

```text
FAILURE MODE:
  v0.1 asks for a Payment state the database intentionally makes impossible
  without falsely admitting local financial success.

ACTUAL FAILURE WITHOUT CORRECTION:
  compliant source cannot represent the v0.1 transition; source either violates
  database constraints or falsely writes SUCCEEDED/provider key.

SIMPLER ALTERNATIVE:
  keep Payment in existing pre-success OUTCOME_UNKNOWN and let the already
  designed PaymentEvent mismatch stage own provider-observed reconciliation need.

WHY SUFFICIENT:
  Payment keeps its local financial-truth invariant; PaymentEvent already owns
  BF4 provider evidence, replay, and adjudication state; the blocking Payment
  remains unresolved; no provider retry or commerce completion occurs.

ASSURANCE GAIN:
  resolves an impossible cross-owner transition without weakening exact-money
  admission or database constraints.

COMPLEXITY COST:
  LOW — one semantic owner correction, no schema/state/protocol addition.
```

No enum, stage, table, column, worker, process, or generic reconciliation
framework is added.

The crash-ordering correction uses the existing transaction and CAS owners:

```text
FAILURE MODE:
  split local writes allow crash after mismatch-event commit but before
  Payment OUTCOME_UNKNOWN.

ACTUAL FAILURE:
  durable provider evidence exists but the Payment lifecycle remains stale,
  and terminal mismatch replay need not repair it.

SIMPLER ALTERNATIVE:
  two writes without atomicity.

WHY INSUFFICIENT:
  crash creates a durable owner mismatch.

CORRECTION:
  one local transaction for event CAS + safe Payment lifecycle update.

ASSURANCE GAIN:
  exact durable ownership across crash.

COMPLEXITY COST:
  LOW — existing database transaction/CAS primitives only.
```

## 4. Human re-entry boundary

```text
automatic BF4:
  STOP

automatic provider recontact:
  0

automatic completion:
  0

next action:
  separately authorized human/operator reconciliation
```

Without separate reviewed authority appropriate to the action, an operator
may not clear `OUTCOME_UNKNOWN`, promote the Payment to `SUCCEEDED`, assign
`providerPaymentKey`, change expected money, refund or cancel, or complete
commerce. This document does not design the later reconciliation workflow or
pre-decide how the provider-observed exposure is resolved.

## 5. Preserved BF4 v0.1 guarantees

All BF4 v0.1 semantics outside §2 are preserved unchanged, including:

```text
exact raw custody
READY/status FGKey separation
pre-existing Payment correlation
no callback-first Payment
claim/tombstone namespaces
post-claim tombstone recheck
contact marker before provider delegation
max one automatic /verify
max one automatic /retrieve
zero blind retry
non-0000 verify remains unknown absent definitive authority
AUTH/REGISTERED/NONE behavior
exact money required for exact SALE admission
providerPaymentKey only after exact local admission
completeFromCapture only
raw minimization
acknowledgement semantics
no public callback route before transport evidence
literal + fail-closed
transaction_date timezone unresolved
routing disabled
E1B closed/admitted
E1A deferred
E2 blocked
NO_SCHEMA_CHANGE_REQUIRED
```

This correction does not redesign callback ingress, the PaymentEvent envelope
vocabulary, claim namespaces, reject tombstones, the TOCTOU protocol,
verify/retrieve contact ceilings or response admission, non-`SALE` behavior,
generic completion, acknowledgement, raw minimization, literal-plus or
timestamp policy, routing/dormancy, or callback transport evidence gates.

## 6. Change control and next gate

Upon reviewed installation, this document and Threat / Failure Model v0.2
become the current BF4 documentation authority pair for their declared
semantic scope. Both v0.1 documents remain immutable historical predecessors,
and the BF4 I1 source remains paused and not implementation-admitted.

```text
SOURCE / SCHEMA / PROVIDER / CREDENTIAL / ACTIVATION AUTHORITY:
  NONE

EXTERNAL EFFECTS:
  0

NEXT GATE:
  SEPARATELY AUTHORIZED BF4 I1 REBIND/CORRECTION + IMPLEMENTATION CORRECTNESS CLOSURE
```
