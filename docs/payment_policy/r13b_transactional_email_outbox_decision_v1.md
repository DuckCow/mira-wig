# R13B Transactional Email Outbox Decision v1

- **Decision owner:** PROJECT OWNER
- **Date:** 2026-08-27
- **State:** ACCEPTED
- **Scope:** R13B order-paid and refund-succeeded customer transactional email source

## Decision

External email API calls do not belong inside payment or refund financial database
transactions. Mail-provider availability must not become part of provider financial truth or
the financial commit boundary.

R13B therefore adopts the existing `PaymentOutbox`. The transaction that durably establishes
the relevant financial and business transition writes the customer-email intent with the same
`Prisma.TransactionClient`. Generic A3 claim, retry/backoff, zombie recovery, and at-least-once
dispatcher semantics remain unchanged.

R13B owns exactly these events:

| Symbol | Wire topic | Dedup identity | Payload |
|---|---|---|---|
| `CUSTOMER_ORDER_PAID_EMAIL_V1` | `customer.order-paid.email.v1` | `customer-order-paid:v1:{orderId}` | `{ "orderId": "..." }` |
| `CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1` | `customer.refund-succeeded.email.v1` | `customer-refund-succeeded:v1:{refundAttemptId}` | `{ "refundAttemptId": "..." }` |

The payload contains only the minimum durable identity required to reconstruct the email at
handling time. It does not contain rendered HTML/text, recipient or shipping data, Locale,
provider receipt URLs, provider transaction identities, payment keys, or secrets.

The handler reconstructs customer-safe send material from authoritative persisted Mira state.
The recipient is the server-owned authenticated `User.email` relation. Historical item identity
comes from the persisted `OrderItem.snapshotData`, and refund presentation reuses the customer
refund ledger projection and invariants.

R13B preserves at-least-once delivery. It guarantees one durable business intent for each dedup
identity, not exactly-once external delivery across process crashes. Every future
`TransactionalEmailPort` invocation receives the stable dedup identity so a real adapter may map
it to provider idempotency support where available.

## Transaction owners

The order-paid intent is created only by the transaction that newly creates the `Order`,
completes the `CheckoutSession`, and finalizes the successful `Payment`. Browser returns,
callbacks before financial admission, and post-commit best-effort functions do not own it.

The refund-succeeded intent is created only by the transaction that newly transitions the exact
`RefundAttempt` to `SUCCEEDED` and coherently applies `PARTIALLY_REFUNDED` or `REFUNDED` to the
`Order`. `REQUESTED`, `APPROVED`, `PROCESSING`, `REFUND_PENDING`, `MANUAL_REVIEW`,
`FAILED_RETRYABLE`, and all other non-success states do not create this intent. Replays of an
already completed transition do not create a new logical intent, and pre-R13B successes are not
swept or backfilled.

## Frozen communication Locale

Transactional-email language is a checkout-time presentation/communication fact. New sessions
persist an admitted `ko`, `en`, or `ja` `CheckoutSession.communicationLocale` before asynchronous
completion. It does not own or alter Market, currency, pricing, payment routing, or any Order
financial fact, and it is never recomputed at dispatch time from current storefront state,
GeoIP, browser state, catalog language, or `Market.defaultLocale`.

The column is nullable only for historical compatibility. Historical nulls are not guessed or
backfilled. A legacy session without a communication Locale still completes payment/refund
normally, but creates no new R13B customer-email intent.

## Customer surface and activation fence

R13A remains authoritative: R13B email contains no Toss or Eximbay receipt URL or provider
receipt CTA. Its only CTA is the authenticated Mira order-detail page, built from a separately
injected and strictly validated public HTTPS Mira origin. No production domain is selected here.

R13B defines a provider-neutral `TransactionalEmailPort` and uses only fake/in-memory adapters in
tests. It installs no email provider, SMTP dependency, credential, DNS change, or production
adapter. The production `scripts/outbox-dispatch.ts` registry remains unchanged and registers
zero R13B email topics. Real transport selection, sender-domain activation, and production
handler registration require separate human authority.

This decision does not authorize deployment, LIVE operation, provider contact, or real email
delivery.
