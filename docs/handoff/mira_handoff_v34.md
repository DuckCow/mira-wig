# mira project handoff v34 - C2 provider confirm detector design snapshot

**New session role note:** continue the mira payment-core work. Human = orchestration/final decisions/commits, Codex = implementation/recon/runtime checks. **v34 is the current handoff and supersedes v33.** v33 remains the provider confirm bridge/action taxonomy implementation snapshot; v34 carries it forward and records the committed C2 provider confirm marker detector extension design lock.

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
- Handoff line -> **v34 is current**, v33 is provider confirm bridge/action taxonomy implementation snapshot, v32 is provider confirm bridge/action taxonomy design lock, v31 is Toss confirm fake adapter seam snapshot.

---

## 1. Current baseline

- Current handoff: `docs/handoff/mira_handoff_v34.md`.
- Current verification baseline: **28 files / 402 tests**.
- C2 provider confirm detector design doc: `docs/payment_policy/c2_provider_confirm_detector_design_v1.md`.
- C2 provider confirm detector design commit: `e438ae8 docs(payment): add C2 provider confirm detector design`.
- Full C2 provider confirm detector design commit hash: `e438ae8379575a0067f6e32069cbd49a7e9eb55c`.
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
- C2 provider confirm marker detector read-only recon is complete.
- C2 provider confirm marker detector design lock is complete.
- Real Toss/PayPal adapters remain blocked.
- Current resolver still returns mock providers.
- Current C2 reconciliation remains report-only.

Changed/added file in the committed design lock patch:

```text
docs/payment_policy/c2_provider_confirm_detector_design_v1.md
```

The design commit was docs-only:

- no production code changed;
- no schema/migration changed;
- no env/package changed;
- no provider API code added;
- no real Toss adapter added;
- no real PayPal adapter added;
- no live credential wiring added;
- no verify run required for the docs-only commit.

---

## 2. v34 delta

C2 provider confirm detector extension is now designed.

Purpose:

- make provider confirm bridge states visible to C2 before real provider wiring;
- keep C2 report-only;
- avoid repair, retry, confirm, void, provider calls, or mutation;
- avoid schema changes and persistent reconciliation finding tables.

The design locks future C2 detection for durable provider confirm markers written on `Payment.errorCode` and `Payment.errorMessage`.

---

## 3. Durable bridge markers

Current durable provider-confirm markers:

```text
PROVIDER_CONFIRM_TERMINAL
PROVIDER_CONFIRM_MANUAL_REVIEW
PROVIDER_CONFIRM_STOP
```

Current behavior:

- `RETRYABLE`: no marker, no terminal mutation, payment remains pending, confirm key preserved.
- `TERMINAL`: `PROVIDER_CONFIRM_TERMINAL` marker written and current `Payment.status = FAILED`.
- `MANUAL_REVIEW`: `PROVIDER_CONFIRM_MANUAL_REVIEW` marker written, payment remains pending.
- `STOP`: `PROVIDER_CONFIRM_STOP` marker written, payment remains pending.
- `PROGRAMMER_ERROR`: no durable marker today.

`PROVIDER_CONFIRM_PROGRAMMER_ERROR` is not yet a C2 finding because the bridge does not persist a durable marker for it today.

Provider confirm failures do not enqueue void and do not create local order/completion effects.

---

## 4. Planned C2 findings

Planned future C2 finding kinds:

```text
STALE_PROVIDER_CONFIRM_ATTEMPT
PROVIDER_CONFIRM_TERMINAL_FAILED
PROVIDER_CONFIRM_MANUAL_REVIEW
PROVIDER_CONFIRM_STOP
```

Do not record or implement `PROVIDER_CONFIRM_PROGRAMMER_ERROR` for the immediate detector patch unless the bridge later persists it.

---

## 5. Stale confirm attempt

Planned condition for `STALE_PROVIDER_CONFIRM_ATTEMPT`:

```text
Payment.providerConfirmIdempotencyKey IS NOT NULL
Payment.providerPaymentKey IS NULL
Payment has no Order
Payment.status IN (INITIATED, AWAITING)
Payment.updatedAt older than staleProviderConfirmAfterMs
Payment.errorCode is null or not in provider-confirm marker set
```

Design notes:

- `Payment.updatedAt` is a D1 approximation because there is no dedicated confirm-key timestamp.
- `providerRef` is not required because confirm key proves confirm orchestration started.
- Terminal `FAILED` payments are excluded.
- False positives include long in-flight confirms, user abandonment, or unrelated `updatedAt` changes.

---

## 6. Severity / action matrix

| Finding kind | Severity | Recommended action | Confidence |
|---|---|---|---|
| `STALE_PROVIDER_CONFIRM_ATTEMPT` | `warning` | `WATCH_STALE` | `medium` |
| `PROVIDER_CONFIRM_TERMINAL_FAILED` | `warning` | `ALERT_ONLY` | `high` |
| `PROVIDER_CONFIRM_MANUAL_REVIEW` | `critical` | `MANUAL_REVIEW` | `high` |
| `PROVIDER_CONFIRM_STOP` | `critical` | `MANUAL_REVIEW` | `high` |

The existing reconciliation action vocabulary already contains `WATCH_STALE`, `ALERT_ONLY`, and `MANUAL_REVIEW`, so no new action value is required by the design.

---

## 7. Layer placement

The design recommends a separate provider-confirm detector layer.

Likely future file:

```text
src/lib/payment/reconciliation/provider-confirm.ts
```

Repo-style equivalent if preferred:

```text
src/lib/payment/reconciliation/layer3.ts
```

Rationale:

- `layer1` is local payment/order/session correctness.
- `layer2` is webhook/event/outbox/rejected-ingress taxonomy.
- Provider confirm markers are pre-capture provider-boundary action state.
- A separate layer is easier to extend with future provider lookup.

---

## 8. Options / thresholds

Future option:

```text
staleProviderConfirmAfterMs
```

Default:

```text
10 * 60_000
```

Design notes:

- Do not reuse webhook stale threshold even if default matches.
- The wrapper should expose `--stale-provider-confirm-ms` if implementation adds the option.
- JSON output shape remains compatible because findings are counted generically.

---

## 9. Details and redaction

Finding details may include:

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

Finding details must not include:

- full `providerRef`;
- full `providerConfirmIdempotencyKey`;
- full `providerPaymentKey` if avoidable;
- provider raw diagnostics;
- secrets;
- auth headers;
- raw provider payloads.

---

## 10. No-mutation boundary

Implementation must not call or import:

```text
completeFromCapture
dispatchPending
createVoidHandler
transitionCheckoutSession
provider.confirm
Toss adapter
PayPal adapter
provider APIs
Prisma create/update/delete/updateMany/upsert/deleteMany
```

The detector must only read and return structured findings.

---

## 11. Manual report wrapper

- Wrapper already counts arbitrary finding kinds by kind, severity, and recommended action.
- Wrapper should add `--stale-provider-confirm-ms` only if implementation exposes `staleProviderConfirmAfterMs`.
- Strict JSON output remains compatible.
- No repair flags should be added.

---

## 12. Future test plan

Future implementation tests:

- provider confirm manual-review marker produces finding;
- provider confirm stop marker produces finding;
- provider confirm terminal marker produces finding;
- stale provider confirm attempt produces finding;
- recent provider confirm attempt does not produce stale finding;
- terminal failed provider confirm is not also stale;
- retryable pending with no marker can become stale;
- no `PROGRAMMER_ERROR` finding until marker exists;
- no-mutation guard includes marker fields;
- wrapper counts new findings if seeded;
- no `lastError` parsing;
- no provider API calls.

---

## 13. Remaining blockers / next step

Recommended next step:

```text
C2 provider confirm detector extension patch
```

Expected implementation scope:

- add provider-confirm detector layer;
- add `staleProviderConfirmAfterMs`;
- add wrapper CLI option if needed;
- add tests;
- remain report-only;
- no provider calls;
- no mutation.

Real Toss/PayPal adapter wiring remains blocked until C2 visibility and launch guards are accepted.
