# R13C Transactional Email Pre-Launch Gate v1

- **Decision owner:** PROJECT OWNER
- **Date:** 2026-08-27
- **Document class:** Production release gate / evidence checklist
- **Scope:** R13B transactional order-paid and refund-succeeded email delivery

## PRE-LAUNCH BLOCKER

Transactional email production activation must not proceed until every
applicable blocking gate in this document is `PASS` or explicitly `SUPERSEDED`
by the project owner.

This is a release gate and evidence checklist. It is not new email architecture,
not a replacement for R13B or R13C, and not production-activation authority.

## Current source and review status

R13C-A source implementation is complete and published:

```text
published main:       e09a56a217cb8b641017c9974e09a867ed35b8b5
published tree:       761b3b55981eeb70357869e3b0e057d72c874103
feature commit:       60c7096c58f863862b8bfae9dfd9c015763e3c86
PR:                   #119
publication:          R13C_A_REVIEWED_SOURCE_PUBLICATION_COMPLETE
independent review:   R13C_A4_BOUNDED_REVIEW_PASS
findings:             BLOCKER 0 / IMPORTANT 0 / MINOR 0 / NEW_STRUCTURAL 0
```

Published source does not by itself authorize production activation.

## Non-production transport evidence

The following completed development canaries are `NON_PRODUCTION_TRANSPORT_EVIDENCE`
only (as of 2026-08-27):

- SES region: `ap-northeast-2`.
- Configuration Set: `mira-transactional-v1`.
- Development SES email identity: `VERIFIED` (the address is intentionally not
  recorded here).
- Credential mechanism: temporary credentials through `aws login`.
- Long-lived access key created for this path: `NO`.
- SES Mailbox Simulator success: `PASS`.
- SES console controlled real-inbox canary: `PASS`.
- Published Mira `createSesTransactionalEmailPort()` → SES → controlled
  real-inbox canary: `PASS`.

The adapter canary exercised SES v2 `SendEmail`, `maxAttempts=1`, the
Configuration Set, and hashed Mira correlation tags.

This evidence does **not** establish payment-success → email application E2E,
refund-success → email application E2E, production sender/domain deliverability,
production credentials/runtime, or customer activation. No AWS account ID, IAM
UserId, development address, password, MFA detail, or credential/session value
is recorded in this document.

## Installed policy snapshot — R13B remains normative

### Order paid

- Topic: `customer.order-paid.email.v1`.
- Payload: `{ "orderId": "..." }` only.
- Deduplication: `customer-order-paid:v1:{orderId}`.
- One intent is created only by the transaction that newly creates the Order,
  completes the CheckoutSession, and finalizes successful Payment truth.
- Browser returns, premature callbacks, and replays do not own the send.

### Refund succeeded

- Topic: `customer.refund-succeeded.email.v1`.
- Payload: `{ "refundAttemptId": "..." }` only.
- Deduplication: `customer-refund-succeeded:v1:{refundAttemptId}`.
- The intent is created only when the exact RefundAttempt newly becomes
  `SUCCEEDED` and coherent Order refund state is applied in the same
  transaction.
- `REQUESTED`, `APPROVED`, `PROCESSING`, `REFUND_PENDING`, `MANUAL_REVIEW`,
  `FAILED_RETRYABLE`, and every other non-success state do not trigger it.

### Locale

`CheckoutSession.communicationLocale` is the checkout-time frozen communication
fact and admits `ko`, `en`, or `ja`. It is not recomputed at dispatch from GeoIP,
browser state, current storefront locale, or `Market.defaultLocale`. Historical
`NULL` is not guessed or backfilled.

### Transport

`PaymentOutbox` owns durable intent and retry. SES delivery is at-least-once;
the rare accepted-but-ambiguous transport duplicate is an accepted v1 residual
risk. Provider availability is outside the financial database transaction.

## Near-term development canary

### ORDER-PAID APPLICATION-PATH CANARY

**Current status: `PENDING`**

Preferred controlled path before transactional-email development is paused:

```text
authoritative/sandbox payment success
  -> CheckoutSession.communicationLocale
  -> Order/payment completion
  -> PaymentOutbox order-paid intent
  -> email handler
  -> locale-selected template
  -> published SES adapter
  -> controlled inbox
```

This is not equivalent to final production-like release validation.

## Pre-launch gates

All unfinished gates begin as `PENDING`. Each gate records status, date,
environment, evidence, owner/approver, and a commit/PR/CI/canary reference when
applicable. A `SUPERSEDED` gate must retain the reason and the authority for
supersession.

### PL-01 — Production AWS ownership

**Status:** `PENDING`  
**Date:** —  
**Environment:** —  
**Evidence required:** Identify the final production SES account, company-controlled
account recovery/root ownership appropriate for production, and final region. A
company-controlled recovery system is required; Google Workspace specifically is
not required.  
**Owner/approver:** PROJECT OWNER / production AWS owner  
**Commit / PR / CI / canary reference:** —

### PL-02 — Production sender identity

**Status:** `PENDING`  
**Date:** —  
**Environment:** —  
**Evidence required:** Approve the final transactional sender and support
Reply-To. The current candidate shape is `Mira <orders@tx.<brand-domain>>`; the
actual domain remains deferred and must not be invented. Prove SES domain
identity `VERIFIED`, Easy DKIM `PASS`, Custom MAIL FROM, appropriate MAIL FROM
MX/SPF, and inspected/intentionally configured DMARC.  
**Owner/approver:** PROJECT OWNER / sender-domain owner  
**Commit / PR / CI / canary reference:** —

### PL-03 — SES production sending access

**Status:** `PENDING`  
**Date:** —  
**Environment:** —  
**Evidence required:** Record production sending capability for actual customer
recipients in the intended account and region, including production-access and
quota evidence.  
**Owner/approver:** PROJECT OWNER / AWS operator  
**Commit / PR / CI / canary reference:** —

### PL-04 — Transactional Configuration Set

**Status:** `PENDING`  
**Date:** —  
**Environment:** —  
**Evidence required:** Prove the production Configuration Set is
`mira-transactional-v1`, or a separately reviewed successor, and that its policy
matches the adapter. Transactional mail must not accidentally inherit marketing
tracking or suppression behavior.  
**Owner/approver:** PROJECT OWNER / AWS operator  
**Commit / PR / CI / canary reference:** —

### PL-05 — Production credentials / IAM

**Status:** `PENDING`  
**Date:** —  
**Environment:** —  
**Evidence required:** Select and explicitly review the production credential
mechanism, preferring temporary role-based credentials. Prove least privilege
for SES sending and no broad administrator credential in application runtime.
No credential value belongs in this record.  
**Owner/approver:** PROJECT OWNER / security owner  
**Commit / PR / CI / canary reference:** —

### PL-06 — Order-paid application-path E2E

**Status:** `PENDING`  
**Date:** —  
**Environment:** —  
**Evidence required:** With a controlled non-customer recipient and data, run
authoritative payment success → Order/CheckoutSession completion → order-paid
Outbox → handler → saved locale → correct template → SES → controlled inbox.
Verify recipient, subject, order identity, item/money presentation, saved
locale, order-detail CTA, one business intent, and no duplicate intent on replay.
Use final production-like email configuration for release evidence; a direct
adapter call is insufficient.  
**Owner/approver:** PROJECT OWNER / payments owner  
**Commit / PR / CI / canary reference:** —

### PL-07 — Locale release smoke

**Status:** `PENDING`  
**Date:** —  
**Environment:** —  
**Evidence required:** Verify `ko`, `en`, and `ja`. Evidence may combine one
full application-path E2E, template/handler-to-SES smoke for remaining locales,
and automated coverage; three redundant full payment-provider transactions are
not required when that combined evidence is sufficient.  
**Owner/approver:** PROJECT OWNER / email owner  
**Commit / PR / CI / canary reference:** —

### PL-08 — Eximbay refund closure prerequisite

**Status:** `PENDING`  
**Date:** —  
**Environment:** —  
**Evidence required:** Complete the actual Eximbay refund sandbox/external
closure relevant to production before treating refund-email E2E as closed.
Provider refund truth must not be fabricated to make an email test pass.  
**Owner/approver:** PROJECT OWNER / Eximbay payment owner  
**Commit / PR / CI / canary reference:** —

### PL-09 — Refund-succeeded application-path E2E

**Status:** `PENDING`  
**Date:** —  
**Environment:** —  
**Evidence required:** After PL-08, run RefundAttempt → `SUCCEEDED` → coherent
Order refund state → refund-succeeded Outbox → handler → saved locale → correct
refund template → SES → controlled inbox. Verify order identity, refund amount,
full/partial result as applicable, locale, one business intent, and no new
logical intent on replay.  
**Owner/approver:** PROJECT OWNER / refunds owner  
**Commit / PR / CI / canary reference:** —

### PL-10 — Production registration / backlog safety

**Status:** `PENDING`  
**Date:** —  
**Environment:** —  
**Evidence required:** Production registration is intentionally zero. Before
registering `customer.order-paid.email.v1` or
`customer.refund-succeeded.email.v1`, prove activation cannot process unsafe or
unexpected historical backlog. Registration requires separate review and
explicit human authority.  
**Owner/approver:** PROJECT OWNER / operations owner  
**Commit / PR / CI / canary reference:** —

### PL-11 — Controlled production canary

**Status:** `PENDING`  
**Date:** —  
**Environment:** —  
**Evidence required:** After final sender, domain, credentials, and registration
are ready but before ordinary customer traffic, send controlled canary email(s)
through the actual application path and verify receipt and expected content.  
**Owner/approver:** PROJECT OWNER / release owner  
**Commit / PR / CI / canary reference:** —

### PL-12 — Final activation approval

**Status:** `PENDING`  
**Date:** —  
**Environment:** —  
**Evidence required:** Obtain explicit human approval after every applicable
prior gate is `PASS`. Code merge, AWS setup, or a successful development canary
alone does not authorize customer activation.  
**Owner/approver:** PROJECT OWNER  
**Commit / PR / CI / canary reference:** —

## Deferred and out of scope

Shipment-dispatched email remains a future P0. It requires authoritative durable
fulfillment/carrier-custody truth first and must not be implemented merely to
satisfy this checklist. A label, tracking-number reservation, warehouse
preparation, packing start, or ready-to-ship marker is not sufficient authority.

Marketing and post-purchase recommendation email require a separate
communication, consent, and campaign system. Transactional activation is not
marketing consent and must not be reused as such. No generic communication
platform is introduced here.

## Change control

- If source behavior changes materially after a gate is proven, re-establish only
  the affected gate and its dependent evidence.
- Do not gratuitously rerun unrelated gates.
- A changed sender domain, account, or region invalidates only evidence that
  depends on that identity.
- Historical `PASS` evidence must not be rewritten as if it occurred under a
  new production identity.
- `SUPERSEDED` preserves the reason, replacement, date, and responsible
  authority.

## Final activation fence

> **TRANSACTIONAL EMAIL PRODUCTION ACTIVATION = BLOCKED**
>
> Activation remains blocked until every applicable `PL-01` through `PL-12`
> gate is `PASS` or explicitly `SUPERSEDED` by human authority.

Current production topic registration remains intentionally zero until separately
authorized. This document authorizes no AWS, SES, DNS, database, deployment, or
LIVE effect.

## Non-goals

This document does not modify R13B/R13C authority, application source, tests,
configuration, dependencies, schema, migrations, workers, topic registration,
Eximbay refund behavior, fulfillment, marketing, or release-management
machinery. It does not send email, contact AWS or providers, request production
access, create secrets, mutate a database, or create a GitHub issue.
