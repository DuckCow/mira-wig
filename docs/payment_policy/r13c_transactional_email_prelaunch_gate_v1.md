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

**Current status: `PASS`**

**Final disposition:** `R13C_D1_ORDER_PAID_APPLICATION_PATH_CANARY_PASS`

**Evidence classification:** `DEVELOPMENT_APPLICATION_PATH_EVIDENCE`

#### D1 evidence record — 2026-08-27

This human-confirmed, non-production canary used published code commit
`59880f4a1f20c09110b1ff322e996214b426ef77` (tree
`f89cb1b754dc343f0424c51fd0562f916a11fa2e`) against the local isolated
PostgreSQL database `wig_platform_test`.

- Run ID: `r13c_d1_6238c5bd-9f24-49a4-b361-b08a9b846c61`.
- Payment provider/mode: `MOCK` / `SANDBOX`.
- Frozen `CheckoutSession.communicationLocale`: `ko`.
- Canary Order ID: `cmtb95w5i0004n2yiavl93qgo`.
- Initial completion result: `completed`.
- Persisted result: Payment `SUCCEEDED`, CheckoutSession `COMPLETED`, one
  Order with status `PAID`.
- Order-paid intent: one `customer.order-paid.email.v1` row with dedup key
  `customer-order-paid:v1:cmtb95w5i0004n2yiavl93qgo` and payload `{ orderId }`
  only.
- First dispatcher: `claimed=1`, `succeeded=1`, `retried=0`,
  `terminalFailed=0`.
- Final Outbox state before cleanup: `DONE`, `processedAt` present,
  `nextAttemptAt=null`, `lastError=null`.
- SES: `ap-northeast-2`, Configuration Set `mira-transactional-v1`, one real
  `SendEmail` attempt, Korean handler/template, subject
  `주문이 접수되었습니다`.
- Human inbox confirmation: `PASS` — the expected email arrived with matching
  subject, content, Korean language, Order ID, item/money presentation, and
  Mira order-detail CTA.
- Rendered body SHA-256:
  `d28cdf049b5f3a50f24a0c53602f78ad0a4c1b7552c5307efef6d88ba630f99d`.
- Replay of the same capture returned `alreadyCompleted`; Order count stayed
  `1`, intent count stayed `1`, the second dispatcher claimed `0`, and the
  final SES send-call count stayed `1`.
- Exact canary fixture cleanup passed with `0` residual canary database rows.
- Eximbay calls: `0`; production DB effects: `0`; production topic-registration
  mutations: `0`; Git publication during the canary: `0`.

The proved bounded path was:

```text
MOCK/SANDBOX payment completion
  -> CheckoutSession.communicationLocale=ko
  -> Order/Payment/CheckoutSession completion
  -> one order-paid PaymentOutbox intent
  -> real Prisma projection
  -> real Korean template
  -> generic dispatcher
  -> published SES adapter
  -> SES
  -> human-confirmed controlled inbox
```

This is development application-path evidence only. It does
not establish Eximbay payment ingress, Eximbay refund closure, refund-success
email E2E, production sender/domain deliverability, production IAM/runtime,
customer production activation, final PL-06 production-like evidence, locale
release smoke, or customer-facing timestamp timezone correctness.

### CUSTOMER-FACING TIMESTAMP TIMEZONE — UNRESOLVED

- **Severity:** `IMPORTANT`
- **Goal relevance:** `DIRECT`
- **Status:** `OPEN / PRE-LAUNCH BLOCKING DEPENDENCY`
- **Defect class:** `CUSTOMER_TIMESTAMP_TIMEZONE_PRESENTATION`

Installed evidence in `src/lib/payment/email/templates.ts` shows that both the
order-paid and refund-succeeded templates use the shared `formatDate(...)`,
which currently specifies `timeZone: "UTC"`. The human-confirmed Korean D1
email visibly rendered `결제 완료일: 2026. 8. 27. 오전 8:20` without an explicit
UTC label.

R13B freezes the checkout-time communication Locale, but current installed
authority does not define the intended customer-facing timezone policy. The
current UTC rendering must therefore not be treated as intended product
behavior merely because the source currently produces it. An unlabeled UTC
clock value can be read as the customer's local time. The issue affects both
order-paid and refund-succeeded email timestamps because they share the same
formatter.

No timezone policy is selected in this document. In particular, this record does
not choose UTC with a label, customer-local, shipping-country, Market, browser,
account, or checkout-frozen IANA timezone, and it does not derive timezone from
`communicationLocale` or Market. A separate explicit product/architecture
decision is required, followed only by the implementation and dependent release
evidence that decision requires.

This finding does not retroactively invalidate
`R13C_D1_ORDER_PAID_APPLICATION_PATH_CANARY_PASS`: D1 established the
application/Outbox/handler/SES/inbox path and replay convergence. D1 must not,
however, be cited as final evidence that customer-facing timestamp presentation
is release-ready.

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
adapter call is insufficient. PL-06 cannot become `PASS` until the
customer-facing timestamp/timezone policy is explicitly decided, implemented if
required, reviewed/tested, and exercised by the final production-like
order-paid evidence.

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
logical intent on replay. PL-09 cannot become `PASS` until the same
customer-facing timestamp/timezone policy is explicitly decided, implemented if
required, reviewed/tested, and exercised by the final refund-succeeded
application-path evidence.

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
through the actual application path and verify receipt and expected content,
including correct timestamp/timezone presentation under the resolved policy.
PL-11 remains `PENDING` until that content verification is satisfied.

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
