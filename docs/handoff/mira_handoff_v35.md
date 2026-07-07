# mira project handoff v35 - C2 provider confirm detector implementation snapshot

**New session role note:** continue the mira payment-core work. Human = orchestration/final decisions/commits, Codex = implementation/recon/runtime checks. **v35 is the current handoff and supersedes v34.** v34 remains the C2 provider confirm detector design snapshot; v35 carries it forward and records the committed C2 provider-confirm detector extension implementation.

**SSOT map:**
- Payment policy baseline -> `docs/payment_policy/payment_policy_confirmed_v6.md` and `docs/payment_policy/payment_policy_open_v6.md`.
- D1-B adapter boundary design lock -> `docs/payment_policy/d1b_adapter_boundary_design_v1.md`.
- ProviderRef persistence decision -> `docs/payment_policy/d1b_provider_ref_persistence_decision_v1.md`.
- Confirm/capture outbound idempotency decision -> `docs/payment_policy/d1b_confirm_idempotency_decision_v1.md`.
- Provider-specific confirm/capture mapping design lock -> `docs/payment_policy/d1b_provider_confirm_capture_mapping_v1.md`.
- Toss callback/orderId decision lock -> `docs/payment_policy/d1b_toss_callback_orderid_decision_v1.md`.
- Toss confirm adapter design lock -> `docs/payment_policy/d1b_toss_confirm_adapter_design_v1.md`.
- Provider confirm result bridge / action taxonomy design lock -> `docs/payment_policy/d1b_provider_confirm_result_bridge_design_v1.md`.
- C2 provider confirm detector design lock -> `docs/payment_policy/c2_provider_confirm_detector_design_v1.md`.
- Code facts -> the actual source files and tests.
- Code rules -> `AGENTS.md` v4. Collaboration loop -> `docs/collaboration-protocol.md` v3.
- Data model -> `prisma/schema.prisma` + migrations.
- Handoff line -> **v35 is current**, v34 is C2 provider confirm detector design lock, v33 is provider confirm bridge/action taxonomy implementation snapshot, v32 is provider confirm bridge/action taxonomy design lock.

---

## 1. Current baseline

- Current handoff: `docs/handoff/mira_handoff_v35.md`.
- Previous verification baseline before C2 provider-confirm detector implementation: **28 files / 402 tests**.
- Current verification baseline after C2 provider-confirm detector implementation: **28 files / 407 tests**.
- C2 provider-confirm detector implementation commit: `ce65fc6 feat(payment): add provider confirm reconciliation findings`.
- Full C2 provider-confirm detector implementation commit hash: `ce65fc621065a8adf73f86eda4311c220f573e98`.
- D1-A provider selection contract is complete.
- D1-B provider adapter contract types are complete.
- ProviderRef persistence schema patch is complete.
- ProviderRef initiate write patch is complete.
- Confirm/capture outbound idempotency schema + fake-provider confirm flow patch is complete.
- Provider-specific confirm/capture mapping design lock is complete.
- Toss callback/orderId fake-flow scaffold is complete.
- Toss confirm mapper/contract patch is complete.
- D1-B Toss confirm fake HTTP adapter seam is complete.
- D1-B provider confirm bridge/action taxonomy is complete.
- C2 provider confirm marker detector design lock is complete.
- C2 provider-confirm detector extension is complete.
- Real Toss/PayPal adapters remain blocked.
- Current resolver still returns mock providers.
- Current C2 reconciliation remains report-only.

Changed/added files in the committed C2 provider-confirm detector patch:

```text
scripts/payment-reconcile.ts
src/lib/payment/reconciliation/__tests__/reconcile.integration.test.ts
src/lib/payment/reconciliation/__tests__/report-wrapper.test.ts
src/lib/payment/reconciliation/provider-confirm.ts
src/lib/payment/reconciliation/reconcile.ts
src/lib/payment/reconciliation/types.ts
src/lib/payment/reconciliation/utils.ts
```

---

## 2. v35 delta

C2 provider-confirm detector extension completed.

The patch added:

- provider-confirm reconciliation findings;
- a dedicated provider-confirm reconciliation layer;
- a stale provider confirm attempt threshold option;
- manual `payment:reconcile` wrapper support for the stale threshold;
- focused C2 integration and wrapper tests.

The detector remains report-only and read-only.

---

## 3. New finding kinds

New finding kinds:

```text
STALE_PROVIDER_CONFIRM_ATTEMPT
PROVIDER_CONFIRM_TERMINAL_FAILED
PROVIDER_CONFIRM_MANUAL_REVIEW
PROVIDER_CONFIRM_STOP
```

No `PROVIDER_CONFIRM_PROGRAMMER_ERROR` finding exists yet, because the bridge does not persist that marker today.

---

## 4. Provider-confirm reconciliation layer

Added provider-confirm reconciliation layer:

- reads `Payment.errorCode` exact markers;
- reads `providerConfirmIdempotencyKey` for stale confirm attempts;
- appends structured reconciliation findings;
- report-only / read-only;
- no provider calls;
- no mutation;
- no repair;
- no void;
- no confirm execution.

The layer is wired into `reconcilePaymentCore` after the existing layer1 and layer2 detectors. Existing C2 findings continue to run; no previous detector was removed.

---

## 5. Stale condition

`STALE_PROVIDER_CONFIRM_ATTEMPT` condition:

```text
providerConfirmIdempotencyKey present
providerPaymentKey null
no Order
Payment status INITIATED/AWAITING
updatedAt older than staleProviderConfirmAfterMs
no provider-confirm marker
```

Notes:

- `Payment.updatedAt` is the D1 approximation for confirm attempt age.
- `providerRef` is not required.
- Terminal failed provider-confirm marker rows are not also stale.
- Manual-review and stop marker rows are not stale.

---

## 6. Marker findings

Marker findings:

| Durable marker | Finding kind | Severity | Recommended action | Confidence |
|---|---|---|---|---|
| `PROVIDER_CONFIRM_TERMINAL` with `Payment.status = FAILED` | `PROVIDER_CONFIRM_TERMINAL_FAILED` | `warning` | `ALERT_ONLY` | `high` |
| `PROVIDER_CONFIRM_MANUAL_REVIEW` | `PROVIDER_CONFIRM_MANUAL_REVIEW` | `critical` | `MANUAL_REVIEW` | `high` |
| `PROVIDER_CONFIRM_STOP` | `PROVIDER_CONFIRM_STOP` | `critical` | `MANUAL_REVIEW` | `high` |

Stale provider confirm attempts use:

| Finding kind | Severity | Recommended action | Confidence |
|---|---|---|---|
| `STALE_PROVIDER_CONFIRM_ATTEMPT` | `warning` | `WATCH_STALE` | `medium` |

No `SECURITY_SIGNAL` was invented for provider-confirm stop without a durable marker subtype.

---

## 7. Details and redaction

Finding details are bounded to safe values:

- `paymentId`;
- `checkoutSessionId`;
- `provider`;
- payment status;
- `errorCode`;
- `ageMs`;
- `hasProviderRef`;
- `hasProviderConfirmIdempotencyKey`;
- `hasProviderPaymentKey`;
- `hasOrder`.

Finding details do not include:

- full `providerRef`;
- full `providerConfirmIdempotencyKey`;
- full `providerPaymentKey`;
- raw provider diagnostics;
- raw provider payloads;
- secrets;
- auth headers;
- Toss/PayPal raw response data.

---

## 8. Options / wrapper

Options/wrapper:

- `staleProviderConfirmAfterMs` added.
- Default is **10 minutes** (`10 * 60_000`).
- `payment:reconcile` supports `--stale-provider-confirm-ms`.
- CLI parsing validates non-negative integer values.
- Strict JSON output shape is unchanged.
- Generic counts by kind, severity, and recommended action still work.
- No repair flags were added.

---

## 9. Verification evidence

Accepted checks for the committed C2 provider-confirm detector patch:

```text
npx vitest run src/lib/payment/reconciliation/__tests__/reconcile.integration.test.ts
```

Result:

```text
1 file / 13 tests passed
```

Wrapper test:

```text
npx vitest run src/lib/payment/reconciliation/__tests__/report-wrapper.test.ts
```

Result:

```text
1 file / 2 tests passed
```

Additional verification:

```text
npx prisma validate: passed
npm run verify: passed
```

Verify baseline:

```text
28 files / 407 tests
```

Delta from v34 implementation baseline:

```text
28 files / 402 tests -> 28 files / 407 tests
```

Existing `<img>` lint warnings remain warnings only.

---

## 10. Explicit non-changes

The patch did not add or change:

- schema or migrations;
- env/package/generated files;
- payment actions;
- provider bridge behavior;
- Toss adapter behavior;
- PayPal adapter behavior;
- webhook production behavior;
- void production behavior;
- outbox production behavior;
- provider API calls;
- mutation/repair/confirm/void behavior;
- wrapper JSON output shape.

---

## 11. Remaining follow-up

- Real Toss adapter wiring remains blocked.
- Real PayPal adapter wiring remains blocked.
- Real provider credential/env wiring remains blocked.
- Provider resolver still returns mock providers.
- Toss success route remains non-completing.
- Webhook verifier/parser remains unwired for real money.
- Real void taxonomy remains unresolved.
- `VOID-HOOK-DEBT` remains unresolved.
- No live enablement.

---

## 12. Recommended next step

Recommended next step:

```text
Next D1-B/C2 launch-guard or real-provider wiring design lock, as directed by the human.
```

Do not wire real Toss/PayPal adapters until the next explicit design lock and implementation prompt.
