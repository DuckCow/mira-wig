# mira 프로젝트 인계 문서 v29 (Handoff) — Toss confirm adapter design lock

**새 세션의 Claude에게**: 너는 mira를 이어서 작업한다. 역할 = **설계 판단 + Codex 프롬프트 작성 + 결과 리뷰**(코드 직접 작성 안 함). 사람 = 오케스트레이터·최종 결정·커밋, Codex = 구현·정찰·런타임. **v29가 현재 handoff이며 v28을 supersede한다.** v28은 Toss callback/orderId fake-flow scaffold snapshot으로 보존한다. v29의 고유 가치는 v28의 현재 코드/검증 baseline을 carry forward하면서 **D1-B Toss confirm adapter design lock**이 docs-only로 확정·커밋된 사실을 기록하는 것이다.

**SSOT 지도:**
- 결제 설계 확정 baseline → `docs/payment_policy/payment_policy_confirmed_v6.md` (미결 → `payment_policy_open_v6.md`).
- D1-B adapter boundary design lock → `docs/payment_policy/d1b_adapter_boundary_design_v1.md`.
- providerRef persistence decision → `docs/payment_policy/d1b_provider_ref_persistence_decision_v1.md`.
- confirm/capture outbound idempotency decision → `docs/payment_policy/d1b_confirm_idempotency_decision_v1.md`.
- provider-specific confirm/capture mapping design lock → `docs/payment_policy/d1b_provider_confirm_capture_mapping_v1.md`.
- Toss callback/orderId decision lock → `docs/payment_policy/d1b_toss_callback_orderid_decision_v1.md`.
- Toss confirm adapter design lock → `docs/payment_policy/d1b_toss_confirm_adapter_design_v1.md`.
- 코드 사실 → 위 문서들 + 실제 소스. 산문 요약보다 소스와 설계 문서를 우선한다.
- 코드측 규칙 → `AGENTS.md`(v4). 협업 방식 → `docs/collaboration-protocol.md`(v3).
- 데이터 모델 → `prisma/schema.prisma` + migration.
- handoff 계보 → **v29가 현재판**, v28은 Toss callback/orderId fake-flow scaffold snapshot, v27은 Toss callback/orderId decision lock snapshot, v26은 provider-specific confirm/capture mapping design lock snapshot, v25는 confirm idempotency schema + fake-provider flow snapshot, v24는 confirm/capture outbound idempotency decision snapshot, v23은 providerRef write patch snapshot, v22는 provider adapter contract patch snapshot, v21은 providerRef schema patch snapshot, v20은 providerRef persistence decision snapshot, v19는 D1-B adapter boundary design snapshot, v18은 D0/D1-A provider selection snapshot, v17은 C2-v0 threshold/action policy review snapshot, v16은 C2-v0 manual report smoke baseline snapshot, v15는 manual C2-v0 report wrapper baseline snapshot, v14는 C2-v0 detector/classifier baseline snapshot, v13은 C2-I1 baseline snapshot, v12는 C1/post-C1 baseline snapshot, v11은 Stage B 완료 / policy v6 baseline snapshot.

---

## 1. Current baseline

- Current handoff: `docs/handoff/mira_handoff_v29.md`.
- Verify baseline: **26 files / 344 tests**.
- D1-A provider selection contract is complete.
- D1-B provider adapter contract types are complete.
- ProviderRef persistence schema patch is complete.
- ProviderRef initiate write patch is complete.
- Confirm/capture outbound idempotency schema + fake-provider confirm flow patch is complete.
- Provider-specific confirm/capture mapping design lock is complete.
- Toss callback/orderId decision is complete.
- Toss callback/orderId fake-flow scaffold is complete.
- D1-B Toss confirm adapter docs/contract recon is complete.
- D1-B Toss confirm adapter design lock is complete.
- Real Toss/PayPal adapters remain blocked.
- Current resolver still returns mock providers.

---

## 2. v29 delta

**D1-B Toss confirm adapter design lock 완료 사실:**

- Design doc: `docs/payment_policy/d1b_toss_confirm_adapter_design_v1.md`.
- Commit: `1ad95c8 docs(payment): add Toss confirm adapter design`.
- Full commit hash: `1ad95c87758e93a8968f6b67b321cfd1fb807328`.
- Current handoff: `docs/handoff/mira_handoff_v29.md`.
- Verify baseline remains **26 files / 344 tests**.
- 성격: docs-only design lock, not implementation.

**Docs-only safety outcomes:**

- No production code changed.
- No schema/migration changed.
- No env/package changed.
- No generated files changed.
- No provider API code added.
- No real Toss adapter added.
- No Toss HTTP call added.
- No credentials wired.
- No verify run required for the docs-only commit.

This design lock defines the future Toss confirm adapter contract before any real Toss HTTP implementation:

```text
local Payment fields -> Toss confirm request
Toss Payment response -> normalized provider success
Toss error/ambiguous states -> local taxonomy
Toss diagnostics -> safe redacted diagnostics
```

It is not a live enablement plan, webhook plan, void/refund plan, settlement/fees/FX plan, or provider API implementation.

---

## 3. Locked Toss confirm request mapping

Future request mapping:

```text
POST /v1/payments/confirm
Authorization: Basic base64(TOSS_SECRET_KEY + ":")
Idempotency-Key: Payment.providerConfirmIdempotencyKey

body.paymentKey = Payment.providerRef
body.orderId = deriveTossOrderId(Payment.id)
body.amount = Payment.amount
```

Rules:

- `paymentKey` must come only from persisted `Payment.providerRef`.
- Missing `providerRef` fails before HTTP.
- `orderId` is re-derived from `Payment.id`, not persisted separately.
- `amount` comes from local `Payment.amount`.
- Callback query `amount` is validation evidence only and must not be reused for confirm construction.
- Unchecked client input must not supply confirm body, auth, or idempotency fields.

Preserved invariants:

```text
Toss orderId = mira_toss_{Payment.id}
Payment.providerRef = Toss paymentKey after callback validation and before confirm
Payment.providerConfirmIdempotencyKey = outbound Toss Idempotency-Key source
Payment.providerPaymentKey = Toss paymentKey only after Toss confirm returns DONE
Payment.idempotencyKey = initiate/local attempt key, not confirm key
```

---

## 4. Locked Toss response normalization

D1 success condition:

```text
status === DONE
response.paymentKey === Payment.providerRef
response.orderId === deriveTossOrderId(Payment.id)
response.totalAmount === Payment.amount
response.currency === KRW, if present
```

Success mapping:

```text
providerPaymentKey = response.paymentKey
capturedAt = response.approvedAt, if valid
raw provider status = response.status
diagnostics = safe/redacted fields only
```

Rules:

- `Payment.providerPaymentKey` remains final-only.
- Mismatch must not emit `CaptureFacts`.
- If `DONE` but `approvedAt` is missing, local `receivedAt` can be fallback only with diagnostics.
- Raw Toss response is not persisted in D1.
- Method/receipt/transaction details are not persisted in D1.

---

## 5. Amount, currency, and idempotency rules

- Toss D1 uses local integer KRW amount directly.
- No decimal conversion.
- No rounding.
- Pre-HTTP amount/currency mismatch is `STOP` or `PROGRAMMER_ERROR`.
- Post-response mismatch is `MANUAL_REVIEW` and must not complete locally.
- `Idempotency-Key = Payment.providerConfirmIdempotencyKey`.
- Local key `confirm:TOSS:{payment.id}` fits current D1 local design.
- Never mint a new key after timeout, 5xx, provider unavailable, or `IDEMPOTENT_REQUEST_PROCESSING`.
- After Toss retention window, do not blindly retry with a new key.

---

## 6. Locked error taxonomy

Local taxonomy:

```text
IDEMPOTENT_SUCCESS
RETRYABLE
TERMINAL
MANUAL_REVIEW
STOP
PROGRAMMER_ERROR
```

Examples:

- `IDEMPOTENT_SUCCESS`: same idempotency key returns a matching successful Toss Payment object.
- `RETRYABLE`: timeout, 5xx/internal errors, `PROVIDER_ERROR`, `IDEMPOTENT_REQUEST_PROCESSING`.
- `TERMINAL`: user/payment method declines and expired/canceled sessions when not ambiguous.
- `MANUAL_REVIEW`: `ALREADY_PROCESSED_PAYMENT` without matching proof, unknown/ambiguous state, response mismatch.
- `STOP`: auth/secret/live/mode/config failures.
- `PROGRAMMER_ERROR`: malformed local request, missing providerRef/key/orderId/amount before HTTP.

Unresolved taxonomy items:

- Exact Toss invalid-case codes for bad `paymentKey`, bad `orderId`, and bad `amount` need sandbox/support confirmation before live launch.
- Provider lookup/manual-review runbook is still needed before real money launch.

---

## 7. Security and redaction

Never log:

- `TOSS_SECRET_KEY`;
- Basic auth header;
- full `paymentKey`;
- raw Toss request/response;
- payer/card/receipt details.

Diagnostics should be limited to:

- local payment id;
- provider;
- HTTP status;
- Toss code;
- safe message class;
- derived orderId;
- masked paymentKey;
- idempotency hash/truncation.

---

## 8. Sandbox/live boundary

Future adapter factory requirements:

- Server-side Toss secret key is required for confirm.
- Test secret key begins with `test_sk`.
- Live secret key begins with `live_sk`.
- Mode comes from D1-A resolution.
- Live adapter creation requires explicit live allowlist.
- Normal `npm run verify` must use fake HTTP only.
- No real Toss calls in unit/integration tests.

Current state remains:

- `resolveProvider` still returns mock-backed providers for every provider code.
- `GET /api/payments/toss/success` remains a non-completing scaffold.
- Toss webhook verifier/parser remains mock-wired.
- Void executor remains mock-wired.

---

## 9. Remaining blockers before real Toss confirm

- Fake mapper/contract patch not implemented yet.
- Real Toss HTTP adapter not implemented.
- Real Toss credentials not wired.
- Sandbox/live guard not implemented.
- Callback route remains non-completing.
- Exact invalid input codes need sandbox/support confirmation.
- Provider lookup/manual-review policy not implemented.
- Webhook verifier/parser remains mock-wired.
- Real void taxonomy unresolved.
- `VOID-HOOK-DEBT` unresolved.
- No live enablement.

---

## 10. Recommended next step

Recommended next implementation patch:

```text
D1-B Toss confirm fake mapper/contract patch
```

The next patch may include:

- Toss request builder;
- Toss response normalizer;
- Toss error classifier;
- Toss redaction helper;
- fake HTTP client tests.

The next patch must still exclude:

- real Toss API calls;
- real credentials;
- live enablement;
- webhook verification;
- void/refund;
- settlement, fees, or FX.

Do not proceed directly to real Toss HTTP. Lock request/response/error mapping with fake HTTP tests first.
