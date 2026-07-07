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
- Toss API keys: https://docs.tosspayments.com/reference/using-api/api-keys
- Toss error codes: https://docs.tosspayments.com/reference/error-codes
- Toss webhook events: https://docs.tosspayments.com/reference/using-api/webhook-events
- Toss webhook guide: https://docs.tosspayments.com/guides/v2/webhook
- Toss LLM quick reference: https://docs.tosspayments.com/guides/v2/get-started/llms-quick-reference

## 3. Toss Confirmed Facts

- CONFIRMED, Toss Payment APIs: `POST /v1/payments/confirm` authorizes/finalizes a payment.
- CONFIRMED, Toss Payment APIs: confirm request requires `paymentKey`, `orderId`, and `amount`.
- CONFIRMED, Toss Payment APIs: confirm success returns a Payment object.
- CONFIRMED, Toss Payment APIs: `GET /v1/payments/{paymentKey}` retrieves a payment by `paymentKey`.
- CONFIRMED, Toss Payment APIs: `POST /v1/payments/{paymentKey}/cancel` cancels full or partial payments.
- CONFIRMED, Toss Payment APIs: cancel request requires `cancelReason`; `cancelAmount` is optional and defaults to full cancellation.
- CONFIRMED, Toss Payment APIs: POST requests support `Idempotency-Key`.
- CONFIRMED, Toss Payment APIs: the same idempotency key returns the same response, and the key is valid for 15 days.
- CONFIRMED, Toss authorization docs: Toss API authenticates with the secret key using HTTP Basic auth.
- CONFIRMED, Toss authorization docs: the secret key is used as the user ID, the password is empty, and `:` is appended after the secret key before encoding.
- CONFIRMED, Toss API keys: client key and secret key are a set and must be used together.
- CONFIRMED, Toss API keys: mixing non-matching keys or test/live keys causes `INVALID_API_KEY`.
- CONFIRMED, Toss API keys: test keys start with `test`.
- CONFIRMED, Toss API keys: client key is used to initialize the SDK in the browser.
- CONFIRMED, Toss API keys: secret key is used for Toss API calls.
- CONFIRMED, Toss API keys: Payment Widget keys include `gck` for client key and `gsk` for secret key.
- CONFIRMED, Toss API keys: API individual integration keys include `ck` for client key and `sk` for secret key.
- CONFIRMED, Toss API keys: secret keys must not be exposed externally.
- CONFIRMED, Toss error codes: Toss documents API error codes including `UNAUTHORIZED_KEY`, `FORBIDDEN_REQUEST`, `DATA_NOT_FOUND`, and `COMMON_ERROR`.
- CONFIRMED, Toss error codes: cancel-related documented codes include `ALREADY_CANCELED_PAYMENT`, `FAILED_CANCEL_PAYMENT`, `NOT_CANCELABLE_PAYMENT`, and `NOT_PARTIAL_CANCELABLE_PAYMENT`.
- CONFIRMED, Toss webhook events: Toss webhooks include `tosspayments-webhook-transmission-id`.
- CONFIRMED, Toss webhook events: `tosspayments-webhook-transmission-id` is the webhook unique identifier.
- CONFIRMED, Toss webhook events: `tosspayments-webhook-transmission-time` is the sent time.
- CONFIRMED, Toss webhook events: `tosspayments-webhook-transmission-retried-count` is the retry count.
- CONFIRMED, Toss webhook events: `tosspayments-webhook-signature` is included only for `payout.changed` and `seller.changed`.
- CONFIRMED, Toss webhook events: `PAYMENT_STATUS_CHANGED` is an ordinary payment status webhook.
- CONFIRMED, Toss webhook events: `PAYMENT_STATUS_CHANGED` body includes `eventType`, `createdAt`, and `data`.
- CONFIRMED, Toss webhook events: `data` is the changed Payment object for `PAYMENT_STATUS_CHANGED`.
- CONFIRMED, Toss webhook events: `CANCEL_STATUS_CHANGED` body includes `data` as the changed Cancel object.
- CONFIRMED, Toss webhook events: `DEPOSIT_CALLBACK` has its own `secret` field for virtual-account request validation, separate from ordinary payment webhook verification.
- CONFIRMED, Toss webhook events: `PAYMENT_STATUS_CHANGED`, `DEPOSIT_CALLBACK`, and `CANCEL_STATUS_CHANGED` are payment-related webhook types.
- CONFIRMED, Toss webhook guide: webhook receiver should return HTTP 200 within 10 seconds if received successfully.
- CONFIRMED, Toss webhook guide: if the initial webhook delivery fails, Toss retries up to 7 times.
- CONFIRMED, Toss webhook guide: retry schedule is 1, 4, 16, 64, 256, 1024, and 4096 minutes.
- CONFIRMED, Toss webhook guide: the final retry is about 3 days 19 hours after first delivery.
- CONFIRMED, Toss webhook guide: Toss sends failure email if webhook delivery fails.
- CONFIRMED, Toss webhook guide: webhook events are HTTP POST JSON payloads.
- CONFIRMED, Toss webhook guide: webhooks are configured per MID and sent separately per MID.
- CONFIRMED, Toss LLM quick reference: client initiates payment authentication via JS SDK.
- CONFIRMED, Toss LLM quick reference: server validates/finalizes payment state with the secret key.
- CONFIRMED, Toss LLM quick reference: server must not trust client-provided amount, status, or success.
- CONFIRMED, Toss LLM quick reference: webhook handling may require server-side re-query/verification.
- CONFIRMED, Toss LLM quick reference: general payment webhooks such as `PAYMENT_STATUS_CHANGED`, `DEPOSIT_CALLBACK`, and `CANCEL_STATUS_CHANGED` have no signature header.
- CONFIRMED, Toss LLM quick reference: Toss recommends re-calling the Payment Query API with `paymentKey` to verify status for general payment webhooks.
- CONFIRMED, Toss LLM quick reference: payout/seller webhooks use `tosspayments-webhook-signature` HMAC verification.
- IMPLICATION, from confirmed Toss webhook and quick-reference facts: Toss ordinary payment webhook verification is query-verification via `GET /v1/payments/{paymentKey}`, not pure HMAC signature verification. Payout/seller HMAC verification is separate from ordinary payment webhooks.

## 4. Toss OPEN Questions

- OPEN: exact live key prefix and concrete credential environment variable naming.
- OPEN: complete mapping from Toss provider errors to mira's normalized failure taxonomy.
- OPEN: status mapping from Toss Payment object to mira `CaptureFacts`, ignored events, `future_refund`, and `future_void`.
- OPEN: query-verified replay semantics: re-run lookup vs persist authoritative lookup result.
- OPEN: whether `PaymentEvent` identity must include verified mode or credential environment in addition to provider + `tosspayments-webhook-transmission-id`.
- OPEN: exact handling of `DEPOSIT_CALLBACK` virtual-account secret validation vs ordinary payment query-verification in mira's future verifier contracts.

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
