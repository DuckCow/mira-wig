# Provider Docs Snapshot v1

> Status: official-document snapshot, not implementation.
> Retrieval date: 2026-07-08.
> Scope: Toss Payments and PayPal provider facts needed before real provider wiring.

## 1. Status and Scope

This document separates provider facts confirmed by the listed official documents from items still open for design or implementation.

Rules for this snapshot:

- `CONFIRMED` means the fact is backed by an official source listed in this document.
- `OPEN` means the fact is not established by the listed official sources.
- Do not treat memory, prior implementation, handoff summaries, or provider assumptions as provider facts.
- Do not infer credential environment variable names from these docs.
- Do not imply live readiness.

This is a documentation lock only. It does not implement real adapters, webhooks, credential loading, live allowlists, schema changes, or provider API calls.

## 2. Toss Source Map

- Toss Payment APIs: https://docs.tosspayments.com/en/api-guide
- Toss authorization docs: https://docs.tosspayments.com/reference/using-api/authorization
- Toss webhook events: https://docs.tosspayments.com/reference/using-api/webhook-events
- Toss LLM quick reference: https://docs.tosspayments.com/guides/v2/get-started/llms-quick-reference

## 3. Toss Confirmed Facts

- CONFIRMED, Toss Payment APIs: `POST /v1/payments/confirm` authorizes/finalizes a payment.
- CONFIRMED, Toss Payment APIs: confirm request requires `paymentKey`, `orderId`, and `amount`.
- CONFIRMED, Toss Payment APIs: `GET /v1/payments/{paymentKey}` retrieves a payment by `paymentKey`.
- CONFIRMED, Toss Payment APIs: `POST /v1/payments/{paymentKey}/cancel` cancels full or partial payments.
- CONFIRMED, Toss Payment APIs: POST idempotency uses `Idempotency-Key`, valid for 15 days.
- CONFIRMED, Toss authorization docs: Toss API authenticates with the secret key using HTTP Basic auth.
- CONFIRMED, Toss authorization docs: the secret key is used as the user ID, the password is empty, and `:` is appended after the secret key before encoding.
- CONFIRMED, Toss webhook events: Toss webhooks include `tosspayments-webhook-transmission-id`.
- CONFIRMED, Toss webhook events: `tosspayments-webhook-signature` is included only for `payout.changed` and `seller.changed`.
- CONFIRMED, Toss webhook events: `PAYMENT_STATUS_CHANGED` exists for ordinary payment status changes and its body contains a Payment object in `data`.
- CONFIRMED, Toss webhook events: `PAYMENT_STATUS_CHANGED`, `DEPOSIT_CALLBACK`, and `CANCEL_STATUS_CHANGED` are payment-related webhook types.
- CONFIRMED, Toss LLM quick reference: client initiates payment authentication via JS SDK.
- CONFIRMED, Toss LLM quick reference: server validates/finalizes payment state with the secret key.
- CONFIRMED, Toss LLM quick reference: server must not trust client-provided amount, status, or success.
- CONFIRMED, Toss LLM quick reference: webhook handling may require server-side re-query/verification.

## 4. Toss OPEN Questions

- OPEN: exact ordinary-payment webhook retry/redelivery schedule, if not confirmed by the listed official docs.
- OPEN: whether `PAYMENT_STATUS_CHANGED` has all fields needed for deterministic event identity beyond `tosspayments-webhook-transmission-id`.
- OPEN: whether ordinary payment webhook verification should be modeled as re-query of `paymentKey`, full `data.paymentKey`, or another official mechanism.
- OPEN: exact test/live key naming or prefix details.
- OPEN: exact provider error code taxonomy needed for mira's normalized provider error model.
- OPEN: exact success, cancel, partial cancel, deposit, and ambiguous-state mapping into mira's confirm/webhook/void taxonomy.
- OPEN: whether ordinary payment webhook payload authenticity has a provider-supported mechanism other than lookup with secret-authenticated provider API state.

## 5. PayPal Source Map

- PayPal Orders API guide: https://developer.paypal.com/api/rest/integration/orders-api/
- PayPal REST API overview: https://developer.paypal.com/api/rest/
- PayPal REST API requests/idempotency: https://developer.paypal.com/api/rest/requests/
- PayPal Webhooks API: https://developer.paypal.com/docs/api/webhooks/v1/
- PayPal webhook event names: https://developer.paypal.com/api/rest/webhooks/event-names/

## 6. PayPal Confirmed Facts

- CONFIRMED, PayPal Orders API guide: PayPal Checkout uses Orders v2.
- CONFIRMED, PayPal Orders API guide: merchant calls Create order and receives order ID and approval URL.
- CONFIRMED, PayPal Orders API guide: buyer is redirected to the approval URL.
- CONFIRMED, PayPal REST API overview: PayPal REST API uses OAuth 2.0 access tokens.
- CONFIRMED, PayPal REST API overview: client ID and client secret are used to obtain access tokens.
- CONFIRMED, PayPal REST API requests/idempotency: `PayPal-Request-Id` enforces idempotency on REST API POST calls.
- CONFIRMED, PayPal Webhooks API: PayPal provides `POST /v1/notifications/verify-webhook-signature`.
- CONFIRMED, PayPal Webhooks API: the verification request includes the webhook event plus signature-related values.
- CONFIRMED, PayPal Webhooks API: required verification values include `auth_algo`, `cert_url`, `transmission_id`, `transmission_sig`, `transmission_time`, and `webhook_id`.
- CONFIRMED, PayPal Webhooks API: `transmission_id` comes from `PAYPAL-TRANSMISSION-ID`.
- CONFIRMED, PayPal Webhooks API: `transmission_sig` comes from `PAYPAL-TRANSMISSION-SIG`.
- CONFIRMED, PayPal Webhooks API: `transmission_time` comes from `PAYPAL-TRANSMISSION-TIME`.
- CONFIRMED, PayPal Webhooks API: `webhook_id` is the webhook ID configured in the PayPal Developer Portal.
- CONFIRMED, PayPal webhook event names: PayPal supports webhook event categories including Payments, Orders, and Payment orders.

## 7. PayPal OPEN Questions

- OPEN: exact relevant Orders/Payments webhook event names for capture success, denial, refund, and void.
- OPEN: local signature verification vs `POST /v1/notifications/verify-webhook-signature` API choice.
- OPEN: webhook ID separation by sandbox/live.
- OPEN: OAuth token caching and lifetime behavior.
- OPEN: exact capture, refund, and void endpoint mapping for mira's void taxonomy.
- OPEN: exact provider error code taxonomy needed for mira's normalized provider error model.
- OPEN: exact idempotency retention duration and duplicate response behavior for each POST endpoint mira will call.
- OPEN: exact mapping between Orders v2 create/approval/capture state and mira's `providerRef`, `providerPaymentKey`, confirm, and completion facts.

## 8. Cross-Provider Implications

- IMPLICATION, from confirmed Toss webhook facts: Toss ordinary payment webhooks may not fit a pure HMAC-signature verifier model because the listed signature header is confirmed only for `payout.changed` and `seller.changed`, while ordinary payment webhook types are separate payment-related events.
- IMPLICATION, from confirmed PayPal webhook facts: PayPal fits a signature/webhook-ID verification model using the official verify endpoint.
- DESIGN IMPLICATION: `VerifiedProviderContext` must support at least signature-verified and query-verified modes.
- DESIGN IMPLICATION: mira code must not assume every provider webhook has the same verification primitive.
- DESIGN IMPLICATION: provider lookup results and verification results must be carried through the boundary without trusting client-provided or unauthenticated webhook body facts as final capture facts.

## 9. Non-Goals

- No implementation.
- No credential environment variable names.
- No live allowlist entries.
- No real provider adapter.
- No real webhook verification.
- No schema change.
- No package or generated artifact changes.
