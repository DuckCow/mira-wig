# Toss SANDBOX Confirm Smoke Procedure v1

> Status: manual operator smoke procedure, not implementation.
> Date: 2026-07-08.
> Scope: Toss SANDBOX/test confirm adapter only.

## 1. Status and Scope

This document is a manual smoke procedure for validating the Toss SANDBOX/test confirm adapter after it has been wired behind the SANDBOX external opt-in gate.

It is not a CI test, not a live-readiness statement, and not a go-live checklist.

It covers only the Toss SANDBOX/test confirm adapter path. It does not cover Toss webhook verification, Toss query-verifier work, Toss void/cancel execution, PayPal behavior, LIVE behavior, or real-money processing.

## 2. Safety Invariants

- Default `TOSS + SANDBOX` behavior is mock-backed.
- External Toss test calls require explicit opt-in.
- Credential presence alone must not enable external calls.
- `TOSS_LIVE_SECRET_KEY` must not be used for this procedure.
- Secrets must never be printed, logged, screenshotted, or pasted into chat.
- Do not populate `liveEnabled`.
- Run only in local development or a designated sandbox/staging environment.
- Do not run against production DB, production deployment, or live provider credentials.

## 3. Preconditions

- Git tree is clean before starting the smoke.
- Latest migrations are applied to the local or designated sandbox/staging database.
- `npm run verify` is passing before smoke unless the operator explicitly waives this precondition and records why.
- Toss test/sandbox merchant credentials are available outside the repo.
- Operator understands how to restart the app/server after environment changes.
- Operator has confirmed this is not a production DB or production deployment.
- Rollback path is known before enabling the external SANDBOX opt-in.
- OPEN, paymentKey acquisition prerequisite: the server-side Toss confirm path is wired, but the product UI does not yet provide a Toss browser-side payment flow. To run this smoke procedure, the operator must have a safe way to produce a Toss sandbox/test `paymentKey`. Acceptable future mechanisms may include an officially supported and documented Toss developer-console/test-harness flow, a temporary reviewed SDK test page, or future checkout front-end Toss widget wiring. This procedure does not implement or prove that browser-side flow. If a client key is involved, it must be the matching Toss sandbox/test client key for the sandbox/test secret key; a mismatched key pair may fail as `INVALID_API_KEY`.

## 4. Environment Setup

Required environment values, using placeholders only:

```dotenv
PAYMENT_MODE=SANDBOX
TOSS_SANDBOX_EXTERNAL_ENABLED=ENABLED
TOSS_SANDBOX_SECRET_KEY=<sandbox/test secret key>
```

Unset or empty `PAYMENT_MODE` defaults to `SANDBOX` in code, but this manual smoke procedure requires setting it explicitly to `SANDBOX` for auditability and operator clarity.

Values and changes that must remain absent or disabled:

- No `liveEnabled` changes.
- No `TOSS_LIVE_SECRET_KEY` use.
- No production endpoint.
- No production environment.
- No production database.

The existing `.env.example` documents the relevant key names and the default mock behavior. Real values belong only in private local or sandbox/staging environment configuration, never in committed files.

## 5. Preflight Checks

- Verify default `TOSS + SANDBOX` mock behavior before opt-in if practical.
- Verify an invalid `TOSS_SANDBOX_EXTERNAL_ENABLED` value fails closed.
- Verify missing `TOSS_SANDBOX_SECRET_KEY` fails closed when the external opt-in is enabled.
- Verify no raw secret appears in logs, terminal output, browser-visible errors, or user-facing error responses.
- Verify environment values are not committed, staged, screenshotted, or pasted into chat.
- Verify no `liveEnabled` entry was added.
- Verify `PAYMENT_MODE` is exactly `SANDBOX`.

## 6. Smoke Execution Steps

These steps are intentionally high-level because UI routes and operator tooling may evolve.

1. Start the app/server with the SANDBOX environment from this procedure.
2. Create or use a test checkout/session in the local or designated sandbox/staging environment.
3. Initiate the payment flow using Toss in SANDBOX.
4. Complete the Toss test payment flow using the provider's sandbox/test surface.
5. Confirm that the server calls Toss confirm only through the explicit SANDBOX opt-in path.
6. Verify the resulting `Payment` row:
   - `provider = TOSS`
   - `mode = SANDBOX`
   - `status = SUCCEEDED`
   - `errorCode = null`
   - `providerRef` and `providerPaymentKey` are populated according to the Toss test result
   - `providerPaymentKey` is not mock-prefixed when the real Toss test adapter path is used
7. Verify `Order` is created only after successful completion.
8. Verify no duplicate `Order` is created.
9. Verify this procedure makes no webhook assumption; webhook verification/query-verifier behavior is out of scope.

## 7. Expected Success Evidence

- A successful payment and order exist in the local or sandbox/staging DB.
- `Payment.status = SUCCEEDED`.
- `Payment.errorCode = null`.
- No secret value appears in logs, terminal output, browser output, user-facing errors, screenshots, or chat.
- No LIVE indicator appears in config, logs, DB rows, or provider/operator surfaces.
- No `liveEnabled` change exists.
- If the real Toss test adapter path is used, `providerPaymentKey` is not mock-prefixed.
- Logs and errors are redacted.
- The smoke result is explainable from provider-scoped `Payment` and `Order` rows.

## 8. Abort Criteria

Abort immediately if any of the following occurs:

- Any live credential is used.
- Any secret appears in logs, terminal output, browser output, screenshots, or chat.
- `PAYMENT_MODE` is not exactly `SANDBOX`.
- `liveEnabled` is touched.
- An unexpected provider is selected.
- Any request appears to target production or live money.
- Confirm result is ambiguous.
- Duplicate order/payment state appears.
- Timeout or retry behavior is unclear.
- Operator cannot prove the run is using local or designated sandbox/staging resources.

## 9. Rollback and Cleanup

1. Unset `TOSS_SANDBOX_EXTERNAL_ENABLED`.
2. Unset `TOSS_SANDBOX_SECRET_KEY`.
3. Restart the app/server so environment changes are applied.
4. Verify `TOSS + SANDBOX` returns to the mock-backed default.
5. Clean local or sandbox/staging test records according to existing safe DB cleanup practices.
6. Do not delete audit-relevant rows in shared environments without explicit approval.
7. Re-run a default mock-backed sanity check if practical.

## 10. What This Procedure Does Not Prove

- LIVE readiness.
- Go-live readiness.
- Toss webhook verification correctness.
- Toss query-verifier correctness.
- Toss refund/void correctness.
- PayPal behavior.
- Production credential correctness.
- Production endpoint correctness.
- `liveEnabled` policy correctness.
- Reconciliation completeness.

## 11. Follow-Ups

- Query-verifier contract.
- Toss webhook verification.
- `PaymentEvent.verifiedMode`.
- Toss void/cancel executor.
- Operator smoke procedure for void/refund when implemented.
- Final go-live checklist rewrite.

## 12. References

- `docs/payment_policy/d1c_provider_wiring_design_v1.md`: SANDBOX adapter selection policy, opt-in behavior, credential caveats, and LIVE non-goals.
- `docs/payment_policy/provider_docs_snapshot_v1.md`: Toss official-doc snapshot for confirm API, Basic auth, key-scope facts, and provider error facts.
- `docs/payment_policy/multi_pg_priority_fallback_v1.md`: provider immutability, no post-row cross-PG fallback, and retry/fallback safety posture.
- `.env.example`: documents the relevant environment key names and default mock behavior in prose; do not copy real values into committed files.
