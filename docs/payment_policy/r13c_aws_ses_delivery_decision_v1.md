# R13C AWS SES Delivery Decision v1

- **Decision owner:** PROJECT OWNER
- **Date:** 2026-08-27
- **State:** ACCEPTED SOURCE CANDIDATE; PRODUCTION ACTIVATION DEFERRED
- **Scope:** Provider transport below the R13B transactional-email port

## Decision

Mira selects AWS SES v2 `SendEmail` as the initial transactional-email delivery
infrastructure. SES offers a narrow, replaceable transport with the AWS SDK v3 credential chain
and regional control, while Mira remains the sole owner of commerce events, recommendations,
consent, campaigns, customer-safe projections, and ko/en/ja template truth. Templates stay in
Mira source; SES does not become a commerce or content authority.

Resend, Postmark, SendGrid/Mailgun-style providers, and relevant cloud alternatives were
considered alongside SES. Resend's 24-hour provider idempotency is useful but was not treated as
mandatory because Mira's durable `PaymentOutbox` dedup identity is the authoritative prevention
for duplicate business intents. SES `SendEmail` has no equivalent client idempotency token.
Consequently, a rare accepted-response/lost-response retry can produce a customer duplicate.
That at-least-once ambiguity is an accepted v1 residual risk, not an exactly-once claim.

The AWS SDK client is constructed for one explicit region, initially `ap-northeast-2`, with
`maxAttempts: 1`. The adapter adds no retry loop; existing `PaymentOutbox` retry/backoff owns every
subsequent attempt. V1 has one SES provider and one region, with no automatic provider,
multi-region, or Global Endpoint failover.

Every request uses a trusted Configuration Set, semantically `mira-transactional-v1`, and two
non-PII tags: `mira_channel=transactional` and a SHA-256 hash of the Mira business-delivery
identity. These preserve a future event-reconciliation path without exposing the raw identity.
No `EmailDeliveryAttempt` ledger, SES event consumer, or provider MessageId persistence is added;
those require an actual operational trigger and separate authority.

Production activation remains a separate task covering real sender identity, credentials,
Configuration Set resources, DNS/authentication, production handler registration, deployment,
and real sends. This source decision authorizes none of those effects.

Shipment-dispatched transactional email is a future P0 once authoritative durable fulfillment
custody/shipment truth exists. Its trigger must be the actual custody/shipment transition, not
label generation, tracking-number reservation, warehouse preparation, packing start, or a
ready-to-ship marker. R13C-A creates no fulfillment state, topic, or shipment source.
