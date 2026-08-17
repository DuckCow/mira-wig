# Eximbay BF4 — `status_url` Verification / Retrieval / Completion Threat / Failure Model v0.2

## Status

```text
DOCUMENT CLASS:
  THREAT / FAILURE MODEL

RISK CLASS:
  HIGH — PAYMENT CALLBACK / FINANCIAL RECONCILIATION

VERSION:
  v0.2

INSTALLATION STATUS:
  READY FOR DOCUMENTATION INSTALLATION

HUMAN TARGETED CORRECTNESS REVIEW:
  PASS

SEMANTIC SCOPE:
  AUTHORITATIVE SALE MONEY-MISMATCH OWNERSHIP / CRASH ORDERING ONLY

SUPERSEDES UPON INSTALLATION:
  eximbay-bf4-status-verification-completion-threat-model-v0.1.md

CURRENT COMPANION UPON INSTALLATION:
  eximbay-bf4-status-verification-completion-design-contract-v0.2.md

SOURCE / SCHEMA / PROVIDER / ACTIVATION AUTHORITY:
  NONE

E2:
  BLOCKED
```

This document is a narrow normative overlay on the immutable
[BF4 Threat / Failure Model v0.1](./eximbay-bf4-status-verification-completion-threat-model-v0.1.md)
and the companion
[BF4 Design Contract v0.2](./eximbay-bf4-status-verification-completion-design-contract-v0.2.md).
Upon reviewed installation, it incorporates every v0.1 threat unchanged except
the contradictory T-BF4-17 money-mismatch remediation language replaced below.
The v0.1 file remains an immutable historical predecessor.

This document does not prove source exists, admit BF4 I1, or authorize source,
schema, provider contact, credentials, routing, E2, or activation.

## 1. Corrected T-BF4-17 — Authoritative `SALE` money mismatch and crash-safe ownership

```text
PRECONDITION:
  provider verification is admitted;
  callback transaction_type = PAYMENT;
  retrieve authoritatively reports rescode=0000 and status=SALE;
  MID, providerOrderId, and transactionId exactly match;
  currency and/or decoded amount differs from persisted Payment money.

FAILURE / ATTACK:
  local code uses Payment remediation state before exact local financial
  success, falsely promotes Payment to SUCCEEDED to satisfy database
  constraints, or commits mismatch-event evidence separately from a safe
  Payment OUTCOME_UNKNOWN transition.

PROTECTED GUARANTEE:
  provider-observed financial exposure is retained without claiming exact
  local financial success, and crash cannot split the two safe durable owners.

DETECTION:
  provider-free database integration and crash-window tests assert exact
  classification, pre-success Payment invariants, event evidence, and atomic
  commit/rollback.

PREVENTION:
  a transition-safe Payment remains pre-success OUTCOME_UNKNOWN with
  remediationStatus NONE, providerPaymentKey null, financialSucceededAt null,
  and blockingEndedAt null; the PaymentEvent mismatch stage owns the bounded
  authoritative provider evidence; no completion or success acknowledgement
  occurs. The event CAS and safe Payment lifecycle update execute in one local
  database transaction after retrieval returns.

DURABLE EFFECT:
  when the Payment transition is safe, Payment OUTCOME_UNKNOWN and
  VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION with
  ADMITTED_SALE_MISMATCH, SALE_MONEY_MISMATCH, bounded saleFacts, and retained
  claim commit atomically; blocking remains open.

RECOVERY:
  separately authorized human/operator reconciliation.

RESIDUAL RISK:
  the provider may have captured a different amount while Mira remains blocked.

EVIDENCE GATE:
  provider-free database integration/crash tests plus a later separately
  authorized reconciliation design.
```

If the Payment is not transition-safe, BF4 retains the mismatch event evidence
in a transaction-safe manner without forcing Payment state. Automatic provider
recontact and completion remain zero, success acknowledgement is prohibited,
and human adjudication is required.

A failure of callback `transaction_type`, MID, `providerOrderId`, or
`transactionId` is an identity/semantic mismatch under preserved v0.1
semantics, not the corrected money-mismatch case.

The v0.1 T-BF4-17 phrase that an exact correlated `SALE` money mismatch may use
`RECONCILIATION_REQUIRED` without assigning a provider key is explicitly
superseded. No Payment remediation state is used before exact local financial
success.

## 2. Crash-split failure closure

The prohibited crash sequence is:

```text
mismatch event commits
-> process crashes
-> safe Payment OUTCOME_UNKNOWN does not commit
```

Prevention is the single local transaction in Design Contract v0.2: lock or CAS
the exact safe Payment, CAS the event from `RETRIEVE_OUTCOME_UNKNOWN` to the
mismatch stage with evidence, update that Payment to `OUTCOME_UNKNOWN` while
preserving its pre-success invariants, then commit. A failure rolls back the
safe paired transition; commit requires both exact owner writes to succeed. No
transaction is held across provider contact.

## 3. Preserved threats and change control

All v0.1 protected guarantees, threats, residual risks, and evidence gates
outside the exact T-BF4-17 replacement above remain incorporated unchanged.
No threat taxonomy, schema, durable state, provider protocol, contact ceiling,
retry path, completion owner, or acknowledgement authority is added.

```text
SOURCE / SCHEMA / PROVIDER / ACTIVATION AUTHORITY:
  NONE

EXTERNAL EFFECTS:
  0

NEXT GATE:
  SEPARATELY AUTHORIZED BF4 I1 REBIND/CORRECTION + IMPLEMENTATION CORRECTNESS CLOSURE
```
