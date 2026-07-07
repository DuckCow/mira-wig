# mira 프로젝트 인계 문서 v24 (Handoff) — confirm idempotency decision

**새 세션의 Claude에게**: 너는 mira를 이어서 작업한다. 역할 = **설계 판단 + Codex 프롬프트 작성 + 결과 리뷰**(코드 직접 작성 안 함). 사람 = 오케스트레이터·최종 결정·커밋, Codex = 구현·정찰·런타임. **v24가 D1-B confirm/capture outbound idempotency decision 후 현재 handoff이며 v23을 supersede한다.** 단, **v23은 providerRef write patch snapshot으로 보존**, **v22는 provider adapter contract patch snapshot으로 보존**, **v21은 providerRef schema patch snapshot으로 보존**, **v20은 providerRef persistence decision snapshot으로 보존**, **v19는 D1-B adapter boundary design snapshot으로 보존**, **v18은 D0/D1-A provider selection snapshot으로 보존**, **v17은 C2-v0 threshold/action policy review snapshot으로 보존**, **v16은 C2-v0 manual report smoke baseline snapshot으로 보존**, **v15는 manual C2-v0 report wrapper baseline snapshot으로 보존**, **v14는 C2-v0 detector/classifier baseline snapshot으로 보존**, **v13은 C2-I1 baseline snapshot으로 보존**, **v12는 C1/post-C1 baseline snapshot으로 보존**, **v11은 Stage B 완료 / policy v6 baseline snapshot으로 보존**한다. v24의 고유 가치는 v23의 providerRef write 기준을 carry forward하면서 **D1-B confirm/capture outbound idempotency decision**을 현재 handoff로 고정하는 것이다. 완료된 코드가 *어떻게* 동작하는지의 SSOT는 각 설계 문서와 실제 소스이며 여기서 복제하지 않는다.

**SSOT 지도 (여기 말고 저기를 읽어라):**
- 결제 설계 확정 baseline → `docs/payment_policy/payment_policy_confirmed_v6.md` (미결 → `payment_policy_open_v6.md`). **v6가 Stage B 반영 후 정합 확인된 최신 baseline** — 이걸 신뢰 기준으로 삼아라.
- 각 구현의 설계·결정 근거 → `docs/payment_policy/`의 설계 문서: a2_schema_v0_draft_v2(스키마)·a3_outbox_design_v2(outbox)·b1_session_design_v2(세션)·b2_completion_design_v2(완료 α/β/γ)·b3_confirm_design_v1(진입점)·b4_webhook_design_v1(웹훅)·b5_void_design_v3(void)·**d1b_adapter_boundary_design_v1(어댑터 경계)**·**d1b_provider_ref_persistence_decision_v1(providerRef persistence)**·**d1b_confirm_idempotency_decision_v1(confirm/capture outbound idempotency)**. **코드 사실은 이 문서들 + 실제 소스**, 산문 요약 아님.
- D1-B adapter boundary design lock → `docs/payment_policy/d1b_adapter_boundary_design_v1.md`.
- providerRef persistence decision → `docs/payment_policy/d1b_provider_ref_persistence_decision_v1.md`.
- confirm/capture outbound idempotency decision → `docs/payment_policy/d1b_confirm_idempotency_decision_v1.md`.
- 코드측 규칙 → `AGENTS.md`(v4). 협업 방식 → `docs/collaboration-protocol.md`(v3). 인양 지식 → `legacy_salvage_notes.md`.
- 데이터 모델 → `prisma/schema.prisma` + migration. 라이브 절차 → `docs/go-live-checklist.md`.
- handoff 계보 → **v24가 현재판**, v23은 providerRef write patch snapshot, v22는 provider adapter contract patch snapshot, v21은 providerRef schema patch snapshot, v20은 providerRef persistence decision snapshot, v19는 D1-B adapter boundary design snapshot, v18은 D0/D1-A provider selection snapshot, v17은 C2-v0 threshold/action policy review snapshot, v16은 C2-v0 manual report smoke baseline snapshot, v15는 manual C2-v0 report wrapper baseline snapshot, v14는 C2-v0 detector/classifier baseline snapshot, v13은 C2-I1 baseline snapshot, v12는 C1/post-C1 baseline snapshot, v11은 Stage B 완료 / policy v6 baseline snapshot.
- 새 `[dev]` 채팅: 이 문서 + protocol(필요 시 AGENTS) 붙이고 §6-1부터. 언어 한국어. repo: `DuckCow/mira-wig`(private, main).

---

## 1. 프로젝트 (불변)

mira = AI 커스텀 가발 e-커머스(피팅=차별점, 해자=커스터마이징→주문→제작). 1차 KR·US·JP. 제품 바 = "고객이 바로 써도 문제없는 수준".

---

## 2. 지금 위치 (한눈에)

- ✅ **커머스 기반(불변)**: browse/카탈로그·cart(담기)·auth·피팅(mock)·어드민 카탈로그/마켓 가격·CI(PG18·Node24)·스토리지(S3/mock). `src/lib/order/`의 `snapshot.ts`·`types.ts` 생존(단 `core.ts`는 B1이 흡수·삭제 — 세션 모듈로 이관됨).
- ✅ **결제 코어 골격 완성(Stage B, A2~B5)** — seam/mock 기반, 실 PG 실행은 D 이연:
  - **A2** 스키마(CheckoutSession·Order(결제 후)·Payment 이중 유니크·MR·PaymentOutbox·PaymentEvent) + `updatedAt` 보완.
  - **A3** outbox(원자 클레임·지수 백오프·좀비 회수·**terminal_failed 결과 계약**).
  - **B1** 세션 수명주기(생성 시 검증·동결·lazy 만료·전이 가드).
  - **B2** 완료 처리 — **α(캡처 기록)/β(완료 tx: 행 잠금·가드·주문·MR·재고·카트)/γ(void 인텐트)** 3분해.
  - **B3** 진입점(Provider 포트 + Mock + `resolveProvider` seam + initiate/confirm 액션).
  - **B4** 웹훅(record→verify seam→parse→complete, 원장 record-and-forward, **503 스텁 재배선 완료**).
  - **B5** void 핸들러(outbox 소비·멱등·**VoidExecutor seam** + operationKey).
  - Stage B 테스트 204→252(+48). 실 PG 어댑터·서명 검증·void 실행은 전부 **seam으로 비어 있음**(D-stage).
- ✅ **C1 동시성 하네스 완료** — `src/lib/payment/__tests__/c1-concurrency.integration.test.ts` 추가. verify baseline **16 files / 252 tests → 17 files / 260 tests**. C1은 Postgres READ COMMITTED 위 bounded evidence/regression coverage이며 formal proof가 아니다.
- ✅ **C2-I1 웹훅 인입 계약 완료** — commit `be5a7a3 feat(payment): add webhook ingress contract`. verify baseline **17 files / 260 tests → 17 files / 266 tests**. `npm run verify` green. 이 작업은 **B4/C2-prep**이며 **C2 detector/classifier 구현이 아니다**.
- ✅ **C2-v0 report-only reconciliation detector/classifier 완료** — commit `7eefa2d feat(payment): add report-only reconciliation detector`. 새 모듈 `src/lib/payment/reconciliation/`, 새 테스트 `src/lib/payment/reconciliation/__tests__/reconcile.integration.test.ts`. verify baseline **17 files / 266 tests → 18 files / 274 tests**. `npm run verify` green. **Report-only detector/classifier이며 repair automation이 아니다.**
- ✅ **C2-v0 manual reconciliation report wrapper 완료** — commit `e90d822 feat(payment): add manual reconciliation report`. 새 스크립트 `scripts/payment-reconcile.ts`, 새 테스트 `src/lib/payment/reconciliation/__tests__/report-wrapper.test.ts`, package script `payment:reconcile`. verify baseline **18 files / 274 tests → 19 files / 276 tests**. `npm run verify` green. **Wrapper도 report-only이며 repair automation이 아니다.**
- ✅ **C2-v0 manual report smoke 확인 완료** — configured local DB가 C2-I1 migration 뒤처짐으로 최초 smoke가 `PaymentEvent.attemptCount` 없음(P2022)에서 실패했으나, `npx prisma migrate deploy`가 pending migration `20260706130000_c2_i1_webhook_ingress_contract`를 적용했고 DB schema는 최신 상태가 됐다. 이후 smoke는 `totalFindings: 0`. verify baseline은 그대로 **19 files / 276 tests**.
- ✅ **C2-v0 threshold/action policy review 완료** — 코드 변경 없이 taxonomy/severity/recommendedAction/default thresholds를 검토했고, 현 매핑은 **coherent v0 defaults**로 수용. thresholds는 option/default driven이며 final ops policy가 아니다. verify baseline은 그대로 **19 files / 276 tests**.
- ✅ **D0 D-stage prep recon 완료** — 실 PG 착수 전 read-only recon으로 현 경계를 고정. `PaymentProvider` enum에는 `MOCK`/`TOSS`/`PAYPAL`이 이미 있었고 routing은 KR/US/JP shape만 있었지만, runtime resolver는 아직 mock-bound였다. Toss/PayPal webhook route는 mock verifier/parser였고, void executor는 mock-only default, reconciliation은 local/report-only였다. D-stage는 provider를 켜는 단계가 아니라 **명시적 sandbox/safety guard 아래 mock boundary를 교체하는 단계**다.
- ✅ **D1-A provider selection contract 완료** — commit `a3f8a4a feat(payment): add provider selection contract`. 새 정적 provider registry/rules, market/method/currency/amount/mode 기반 candidate resolution, filtered reason, rule ID audit surface 추가. verify baseline **19 files / 276 tests → 20 files / 287 tests**. `npm run verify` green. **실 Toss/PayPal adapter, provider API call, schema/migration/package/env 변경 없음.**
- ✅ **D1-B adapter boundary design 완료** — commit `6c3dd02 docs(payment): add D1-B adapter boundary design`. 설계 문서 `docs/payment_policy/d1b_adapter_boundary_design_v1.md`. **Design lock only, not implementation**: 실 Toss/PayPal adapter·provider API call·schema/migration·env/package·live credential wiring·webhook/void/reconciliation production code 변경 없음. verify baseline은 그대로 **20 files / 287 tests**.
- ✅ **providerRef persistence decision 완료** — commit `695ca55 docs(payment): add providerRef persistence decision`. 결정 문서 `docs/payment_policy/d1b_provider_ref_persistence_decision_v1.md`. **Design decision only, not schema patch**: production code·schema/migration·env/package·provider API code·실 Toss/PayPal adapter·live credential wiring 변경 없음. docs-only라 verify 미실행, baseline은 그대로 **20 files / 287 tests**.
- ✅ **D1-B providerRef schema patch 완료** — commit `e80301c feat(payment): add providerRef persistence field`. `Payment.providerRef String?` + non-unique `@@index([provider, providerRef])` + migration `20260707090000_d1b_provider_ref` + focused integration test. verify baseline **20 files / 287 tests → 20 files / 288 tests**. `npm run verify` green. **production payment behavior 변경 없음, 실 Toss/PayPal adapter·provider API call·live credential wiring·webhook/void/reconciliation production code 변경 없음.**
- ✅ **D1-B provider adapter contract patch 완료** — commit `9fa74e6 feat(payment): add provider adapter contract types`. **v22 작성 전 이미 origin/main에 push된 상태였고, v22는 이를 기록하는 follow-up docs commit**이다. 새 contract vocabulary + fake adapter/contract tests only. verify baseline **20 files / 288 tests → 22 files / 299 tests**. `npm run verify` green. **production payment behavior 변경 없음, 실 Toss/PayPal adapter·provider API call·live credential wiring·schema/migration·env/package·webhook/void/reconciliation production code 변경 없음.**
- ✅ **D1-B providerRef write patch 완료** — commit `7a429d8 feat(payment): persist providerRef from initiate`. Existing initiate flow now persists provider-side pre-capture `Payment.providerRef` when a provider initiate result includes one. verify baseline **22 files / 299 tests → 23 files / 305 tests**. `npm run verify` green. **실 Toss/PayPal adapter·provider API call·live credential wiring·schema/migration·env/package·resolver/mock-provider behavior·webhook/void/outbox/reconciliation production code 변경 없음.**
- ✅ **D1-B confirm/capture outbound idempotency decision 완료** — commit `90102b2 docs(payment): add confirm idempotency decision`. 결정 문서 `docs/payment_policy/d1b_confirm_idempotency_decision_v1.md`. **Design decision only, not implementation**: production code·schema/migration·env/package·provider API code·실 Toss/PayPal adapter·live credential wiring 변경 없음. docs-only라 verify 미실행, baseline은 그대로 **23 files / 305 tests**.
- ✅ **정책 v6**(Stage B 확정/확립/소멸 반영, §1.1 FX 정합 패치까지) · 인양 문서 · A1 금액 감사(market 인수+보강) 완료·푸시.
- ⏳ **다음** = **D1-B confirm idempotency schema + fake-provider confirm flow patch** → D1-B/D2 PG 샌드박스(실 Toss/PayPal adapter body, webhook verifier/parser, void executor 등) → E MR 최소. 병행 = 심사 선행물(§6-2). founders 임박도가 순서 지배(§9). 수동 JSON wrapper는 완료됐고, scheduling/persistence/admin/runbook은 별도 확장이다.
- 🚫 founders: 토스 온보딩(선행물 대기)·피팅 Phase 0·법무·도메인 + **GOAL-0·목표 출시일·팀 정보 여전히 부재**(ARCH-0 괄호 값 대기).

---

## 3. v24 델타 (v23 이후 = D1-B confirm/capture outbound idempotency decision)

v23은 providerRef write patch snapshot으로 남긴다. v24는 그 위에 **D1-B confirm/capture outbound idempotency decision**을 얹은 현재 handoff다. 이 결정은 실 Toss/PayPal adapter를 시작하지 않고, real provider confirm/capture 전에 필요한 outbound idempotency key source와 persistence direction을 고정했다.

**D1-B confirm/capture outbound idempotency decision 완료 사실:**
- Decision doc: `docs/payment_policy/d1b_confirm_idempotency_decision_v1.md`.
- Commit: `90102b2 docs(payment): add confirm idempotency decision`.
- Current handoff: `docs/handoff/mira_handoff_v24.md`.
- Verify baseline: **23 files / 305 tests**.
- 성격: docs-only design decision, not implementation.

**Docs-only safety outcomes:**
- No production code changed.
- No schema or migration changed.
- No env/package changed.
- No provider API code added.
- No real Toss adapter added.
- No real PayPal adapter added.
- No live credential wiring added.
- No webhook implementation changed.
- No void implementation changed.
- No settlement, fees, or FX work.
- No execution-time cross-PG fallback.
- No verify run required for the docs-only commit.

**Decision locked by v24:**

```text
Future schema should add nullable unique Payment.providerConfirmIdempotencyKey.
Canonical local key: confirm:{provider}:{payment.id}
Persist the exact outbound confirm/capture idempotency key before or at first provider confirm/capture call.
Do not reuse Payment.idempotencyKey.
Do not use providerPaymentKey or capture:{provider}:{providerPaymentKey}.
Do not use providerRef as the primary idempotency source.
```

**Why this decision:**
- `Payment.idempotencyKey` is initiate-attempt oriented for initiated payments.
- `providerPaymentKey` exists only after final capture/approval.
- `capture:{provider}:{providerPaymentKey}` is local post-capture DB idempotency, not outbound provider request idempotency.
- `providerRef` is nullable, non-unique, and provider-object identity, not operation idempotency identity.
- `checkoutSessionId` is unsafe because one checkout session can have multiple payment attempts/providers.
- `payment.id` is stable before capture and unique per local payment attempt.

**Future field semantics:**

```prisma
providerConfirmIdempotencyKey String? @unique
```

- Model: `Payment`.
- Nullable.
- Unique when present.
- No backfill required.
- Server-side operation key, not user-facing.
- Written once before or at first outbound confirm/capture attempt.
- Read on every confirm/capture retry.
- Distinct from `Payment.idempotencyKey`.
- Distinct from `Payment.providerRef`.
- Distinct from `Payment.providerPaymentKey`.
- Distinct from local `capture:{provider}:{providerPaymentKey}`.

**Canonical key formula:**

```text
confirm:{provider}:{payment.id}
```

- Available before capture.
- Stable across retries and process restarts once persisted.
- Unique across multiple attempts in one checkout session.
- Provider-scoped.
- Independent of final `providerPaymentKey`.
- Usable even if `providerRef` is missing.
- Clearly separate from initiate, local capture, webhook, and void keys.

**Future confirm flow change required:**
- Load or claim the pending local `Payment` before provider call.
- Ensure there is a stable `payment.id`.
- Create or reuse `providerConfirmIdempotencyKey`.
- Pass `payment.id`, `providerRef`, and `providerConfirmIdempotencyKey` to provider boundary.
- Call provider confirm/capture.
- Map success into `CaptureFacts`.
- Never mint a different confirm idempotency key for the same local payment attempt.

**Provider header mapping direction:**
- Future real provider adapters should map the local key to provider-specific headers such as Toss `Idempotency-Key` and PayPal `PayPal-Request-Id`.
- Exact constraints must still be verified against official provider docs before implementation.
- Provider-specific length/charset transforms belong in adapters.
- If transformation is lossy, an additional provider request id/hash field may be needed later.
- Diagnostics must not print secrets, auth headers, signatures, raw secret-bearing payloads, or provider tokens.

**Failure / retry semantics to preserve:**
- Timeout / provider 5xx / retryable rate limit: retry with the same key.
- Provider already captured: idempotent success only if provider identity, amount, currency, and state match.
- Idempotency conflict: STOP or manual review, not retry with a new key.
- Local completion fails after provider capture succeeds: do not re-confirm with a new key.
- Process restart: reuse persisted `providerConfirmIdempotencyKey`.
- Webhook-first capture: use local capture path and do not misuse outbound confirm key.
- Multiple browser confirm submissions: converge on the same pending payment and same confirm key.

**Rejected options recorded:**
- Reusing `Payment.idempotencyKey`.
- Using `checkoutSessionId`.
- Using `providerRef` as the primary idempotency identity.
- Using `providerPaymentKey`.
- Using `capture:{provider}:{providerPaymentKey}`.
- Deriving a non-persisted key without storing the exact key used.
- Waiting until real Toss/PayPal adapter implementation.

**Remaining blockers before real providers:**
- `providerConfirmIdempotencyKey` schema/action patch is not implemented.
- Confirm still does not load local `Payment` before provider call.
- Provider-specific Toss/PayPal id/header constraints are not officially verified.
- ProviderRef requirement for real confirm is not documented.
- Webhook verifier/parser injection is not wired.
- Sandbox/live credential separation is not implemented.
- Real void taxonomy and `VOID-HOOK-DEBT` are unresolved.
- No live enablement yet.

**Recommended next step:**

```text
D1-B confirm idempotency schema + fake-provider confirm flow patch
```

The next patch should still exclude real Toss/PayPal API calls, live credential wiring, real webhook verification, real void/cancel execution, settlement/fees/FX, and execution-time cross-PG fallback.

## 4. v23 델타 (v22 이후 = D1-B providerRef write patch)

v22는 provider adapter contract patch snapshot으로 남긴다. v23은 그 위에 **D1-B providerRef write patch**를 얹은 현재 handoff다. 이 패치는 실 Toss/PayPal adapter를 시작하지 않고, existing initiate flow가 provider initiate result의 pre-capture provider reference를 durable `Payment.providerRef`에 쓰도록 고정했다.

**D1-B providerRef write patch 완료 사실:**
- Commit: `7a429d8 feat(payment): persist providerRef from initiate`.
- 상태: local commit complete, push 전.
- Previous verify baseline: **22 files / 299 tests**.
- Current verify baseline after patch: **23 files / 305 tests**.
- Test delta: **22 files / 299 tests → 23 files / 305 tests**.
- Changed files:
  - `src/lib/payment/providers/types.ts`
  - `src/lib/payment/attempt/initiate.ts`
  - `src/lib/payment/attempt/__tests__/initiate.integration.test.ts`
  - `src/app/actions/payment.ts`
  - `src/app/actions/__tests__/payment.test.ts`

**ProviderRef write behavior now locked:**
- `PaymentInitiateResult` now supports optional `providerRef` for both `ready` and `redirect`.
- `redirect.approveUrl` is required in the provider initiate type.
- `initiatePaymentAttempt` still creates local `Payment` first.
- Provider initiate still happens outside the DB transaction.
- If provider initiate returns `providerRef`, it is persisted to `Payment.providerRef`.
- Redirect updates `status: AWAITING` and `providerRef` together.
- Ready writes `providerRef` when present and keeps status `INITIATED`.
- Initiate never sets `providerPaymentKey`.
- Mock provider default behavior remains `{ kind: "ready" }`.
- Action result does not expose `providerRef`.

**Preserved invariant:**

```text
Payment.providerRef = provider-side pre-capture reference for the payment attempt.
Payment.providerPaymentKey = final captured/approved provider payment identity only.
```

**Explicit non-changes / safety outcomes:**
- No schema or migration changes in this patch.
- No env/package changes.
- No generated file changes.
- No real Toss adapter.
- No real PayPal adapter.
- No provider API calls.
- No live credential wiring.
- No provider resolver change.
- No production mock provider behavior change.
- No confirm/capture outbound idempotency implementation.
- No webhook providerRef correlation.
- No void/outbox providerRef usage.
- No reconciliation providerRef usage.
- No execution-time cross-PG fallback.

**Test coverage added/updated:**
- Ready initiate with fake providerRef persists `Payment.providerRef`.
- Ready initiate with fake providerRef keeps `providerPaymentKey` null.
- Redirect initiate with fake providerRef persists `Payment.providerRef`.
- Redirect initiate with fake providerRef marks payment `AWAITING`.
- Initiate without providerRef leaves providerRef null.
- Provider initiate failure does not write providerRef.
- Final capture can set `providerPaymentKey` while preserving providerRef.
- Server action result does not expose providerRef.
- Production mock provider default behavior remains `{ kind: "ready" }`.
- No real provider API calls.

**Verification recorded for v23:**
- Targeted tests passed:

```text
npx vitest run src/lib/payment/attempt/__tests__/initiate.integration.test.ts src/app/actions/__tests__/payment.test.ts src/lib/payment/complete/__tests__/complete.integration.test.ts src/lib/payment/providers/__tests__/fake-adapters.test.ts
4 files / 32 tests passed
```

- `npx prisma validate`: passed.
- `npm run verify`: passed.
- Current baseline: **23 files / 305 tests**.
- Existing `<img>` lint warnings remain warnings only.

**Remaining blockers before real providers:**
- Confirm/capture outbound idempotency is not implemented.
- Provider-specific Toss/PayPal id/header constraints are not verified.
- Sandbox/live credential separation is not implemented.
- Webhook verifier/parser injection is not wired into production.
- Provider-specific webhook verification is not implemented.
- Provider-specific webhook correlation rules are not documented.
- Real void taxonomy is not wired into production.
- `VOID-HOOK-DEBT` is unresolved before real void.
- No live enablement yet.

**Recommended next step:**
- v23 recommended **D1-B confirm/capture outbound idempotency recon**, and v24 records that the decision is now complete via `90102b2`.
- Current recommended next step is **D1-B confirm idempotency schema + fake-provider confirm flow patch**.
- Purpose: implement nullable unique `Payment.providerConfirmIdempotencyKey`, load local `Payment` before provider confirm, and keep the patch fake/mock-only.
- Do not start real Toss/PayPal adapters yet.

## 5. v22 델타 (v21 이후 = D1-B provider adapter contract patch)

v21은 providerRef schema patch snapshot으로 남긴다. v22는 그 위에 **D1-B provider adapter contract patch**를 얹은 현재 handoff다. 주의: 이 contract patch는 v22 handoff 작성 전에 이미 `origin/main`에 push되었다. v22는 그 사실을 사후 기록하는 follow-up docs commit이며, revert/amend/force-push/history rewrite가 아니다.

**D1-B provider adapter contract patch 완료 사실:**
- Commit: `9fa74e6 feat(payment): add provider adapter contract types`.
- 상태: pushed before this handoff.
- Previous verify baseline: **20 files / 288 tests**.
- Current verify baseline after patch: **22 files / 299 tests**.
- Test delta: **20 files / 288 tests → 22 files / 299 tests**.
- Changed files:
  - `src/lib/payment/providers/contract.ts`
  - `src/lib/payment/providers/__tests__/contract.test.ts`
  - `src/lib/payment/providers/__tests__/fake-adapters.test.ts`
- 성격: provider boundary vocabulary + fake adapter/contract tests only. Real provider implementation is still blocked.

**Contract vocabulary added:**
- Redacted provider diagnostics.
- Normalized initiate result.
- Optional `providerRef` before capture.
- Normalized confirm/capture success result.
- Confirm/capture failure taxonomy:
  - retryable;
  - terminal;
  - manual review;
  - stop;
  - programmer error.
- Provider webhook raw/metadata/verify/parser/event boundaries.
- Real-provider-ready void/cancel taxonomy.
- Adapter factory context with credential presence and live guard, without secrets.

**Contract patch safety outcomes:**
- No real Toss adapter was added.
- No real PayPal adapter was added.
- No provider API calls were added.
- No live credential wiring was added.
- No `process.env` credential reads were added.
- No schema or migration changes were made in this contract patch.
- No env/package changes were made.
- No production payment behavior changed.
- `resolveProvider` still returns mock providers.
- Mock provider behavior remains unchanged.
- Initiate still does not persist providerRef.
- Confirm still does not use providerRef.
- Webhook remains mock-wired.
- Void/outbox remain unchanged.
- Reconciliation remains unchanged.
- No execution-time cross-PG fallback was added.

**Verification recorded for v22:**
- Targeted provider contract tests passed:

```text
npx vitest run src/lib/payment/providers/__tests__/contract.test.ts src/lib/payment/providers/__tests__/fake-adapters.test.ts src/lib/payment/providers/__tests__/routing.test.ts
3 files / 22 tests passed
```

- `npx prisma validate`: passed.
- `npm run verify`: passed.
- New baseline: **22 files / 299 tests**.
- Delta: **20 files / 288 tests → 22 files / 299 tests**.
- Existing `<img>` lint warnings remain warnings only.

**Remaining blockers before real providers:**
- providerRef write logic is now implemented by `7a429d8`, and confirm/capture outbound idempotency decision is now locked by `90102b2`, but real adapters remain blocked until the schema/action patch and provider-specific constraints are resolved.
- Confirm/capture outbound idempotency schema/action implementation still needs implementation.
- Provider-specific Toss/PayPal id/header constraints still need official-doc-backed design.
- Webhook verifier/parser injection is not wired into production yet.
- Real provider webhook verification is not implemented.
- Real void taxonomy is not wired into production.
- `VOID-HOOK-DEBT` remains unresolved before real void.
- Sandbox/live credential separation remains to be implemented.
- No live enablement yet.

**Recommended next step:**
- v22 recommended **D1-B providerRef write + initiate fake-adapter integration recon**, and v23 records that it is now complete via `7a429d8`.
- v23 recommended **D1-B confirm/capture outbound idempotency recon**, and v24 records that the decision is now complete via `90102b2`.
- Current recommended next step is **D1-B confirm idempotency schema + fake-provider confirm flow patch**.
- The next implementation should still exclude real Toss/PayPal API calls, live credential wiring, real webhook verification, real void/cancel execution, settlement/fees/FX, and execution-time cross-PG fallback.

**v21에서 carry forward하는 providerRef schema patch 사실:**

v20은 providerRef persistence decision snapshot으로 남긴다. v21은 그 위에 **D1-B providerRef schema patch**를 얹은 현재 handoff다. 이 패치는 durable storage for pre-capture provider references를 추가했지만, 아직 실 Toss/PayPal adapter, provider API call, providerRef write path in real initiate, webhook verifier/parser 실장, void 실장, settlement/reconciliation 확장은 없다.

**D1-B providerRef schema patch 완료 사실:**
- Commit: `e80301c feat(payment): add providerRef persistence field`.
- Changed files:
  - `prisma/schema.prisma`
  - `prisma/migrations/20260707090000_d1b_provider_ref/migration.sql`
  - `src/lib/payment/complete/__tests__/complete.integration.test.ts`
- 성격: schema/migration/test patch only. Production payment behavior unchanged.
- No real Toss adapter was added.
- No real PayPal adapter was added.
- No provider API code was added.
- No provider API calls were made.
- No live credential wiring was added.
- No webhook/void/reconciliation production behavior changed.
- No package/env changes were made.

**Schema change:**

```prisma
providerRef String?
@@index([provider, providerRef])
```

**Migration:**
- Path: `prisma/migrations/20260707090000_d1b_provider_ref/migration.sql`.
- SQL summary:

```sql
ALTER TABLE "Payment" ADD COLUMN "providerRef" TEXT;
CREATE INDEX "Payment_provider_providerRef_idx" ON "Payment"("provider", "providerRef");
```

**providerRef invariant after patch:**

```text
Payment.providerRef = provider-side pre-capture reference for the payment attempt.
Payment.providerPaymentKey = final captured/approved provider payment identity only.
```

**Schema safety outcomes:**
- `providerRef` is nullable.
- Existing data requires no backfill.
- `(provider, providerRef)` index is non-unique.
- Uniqueness remains deferred until provider-specific docs prove the correct uniqueness scope across provider/mode/account.
- `providerPaymentKey` was not overloaded.
- Existing `@@unique([provider, providerPaymentKey])` remains unchanged.
- No `providerMode`, `paymentMethod`, `routingRuleId`, `routingVersion`, or `providerConfirmIdempotencyKey` was added in this patch.

**Test / verification:**
- `npx prisma validate`: passed.
- `npx prisma generate`: passed.
- No tracked generated Prisma client files changed. Generated output stayed under ignored `node_modules/@prisma/client`.
- `npm run verify`: passed.
- Verify baseline is now **20 files / 288 tests**.
- Test delta: **20 files / 287 tests → 20 files / 288 tests**.
- Existing 4 `<img>` lint warnings remain warnings only.
- Added/updated test purpose:

```text
Integration test proves a Payment can have providerRef while providerPaymentKey is null, and final capture can still set providerPaymentKey while providerRef remains intact.
```

**Production behavior safety outcomes:**
- No production payment behavior changed.
- Mock provider does not write providerRef.
- Payment action does not return providerRef.
- Initiate flow does not persist providerRef yet.
- Confirm does not use providerRef yet.
- Webhook does not use providerRef yet.
- Void/outbox does not use providerRef yet.
- Reconciliation does not use providerRef yet.
- No real provider API code was added.
- No real Toss adapter was added.
- No real PayPal adapter was added.
- No live credentials were wired.

**Remaining blockers before real adapters:**
- ProviderRef is now persisted as a nullable field, but future real initiate adapters still need to actually write it.
- Confirm/capture outbound idempotency decision is now designed by `docs/payment_policy/d1b_confirm_idempotency_decision_v1.md`, but schema/action implementation is not done.
- Provider-specific id/header constraints are not verified.
- Sandbox/live mode is not durably modeled if required.
- Webhook verifier/parser injection is not implemented.
- Provider-specific webhook correlation rules are not documented.
- Real void taxonomy is not expanded.
- `VOID-HOOK-DEBT` is unresolved before real void goes live.

**Recommended next step:**
- v21 recommended **D1-B contract patch: provider adapter boundary types/tests/fake adapters only**, and v22 records that it is now complete via `9fa74e6`.
- v22 recommended **D1-B providerRef write + initiate fake-adapter integration recon**, and v23 records that it is now complete via `7a429d8`.
- v23 recommended **D1-B confirm/capture outbound idempotency recon**, and v24 records that the decision is now complete via `90102b2`.
- Current recommended next step is **D1-B confirm idempotency schema + fake-provider confirm flow patch**.
- This next patch should still exclude real Toss/PayPal API calls, live credential wiring, real webhook verification, real void/cancel execution, settlement/fees/FX, and execution-time cross-PG fallback.

**v20에서 carry forward하는 providerRef persistence decision 사실:**

**providerRef persistence decision 완료 사실:**
- Commit: `695ca55 docs(payment): add providerRef persistence decision`.
- Decision doc: `docs/payment_policy/d1b_provider_ref_persistence_decision_v1.md`.
- 성격: design decision only, not schema patch, not implementation patch, not real provider adapter, not live enablement.
- verify baseline remains **20 files / 287 tests**.
- Docs-only라 `npm run verify`는 필요하지 않았고 실행하지 않았다.
- No production code changed.
- No schema or migration changes were made.
- No env/package changes were made.
- No provider API code was added.
- No provider API calls were made.
- No real Toss adapter was added.
- No real PayPal adapter was added.
- No live credential wiring was added.

**providerRef persistence decision:**

```text
Future schema should add nullable Payment.providerRef for provider-side pre-capture references.
Do not reuse Payment.providerPaymentKey.
Do not store providerRef on CheckoutSession.
Do not rely on client roundtrip only for real providers.
```

**providerRef invariant:**

```text
Payment.providerPaymentKey remains final captured/approved provider payment identity only.
Payment.providerRef is attempt-scoped pre-capture provider object identity.
```

**왜 `providerPaymentKey`를 오버로드하면 안 되는가:**
- Pending local attempt claim relies on `providerPaymentKey = null`.
- `(provider, providerPaymentKey)` is used for capture idempotency and lookup.
- Completion guards treat it as final provider payment identity.
- Webhook processed records use it as the final payment key.
- Void dedup and payload validation use it.
- Reconciliation confidence depends on final key semantics.
- PayPal order-id style flows and capture-id flows may differ.
- Toss order/payment key style flows may differ.
- Overloading would blur pre-capture object identity with final capture/payment identity.

**Recommended future schema direction:**
- Future field: `Payment.providerRef String?`.
- Model: `Payment`.
- Nullable.
- Server-side only.
- Written after provider initiate returns a pre-capture reference.
- Read during confirm retry, redirect recovery, webhook correlation, future provider status lookup, diagnostics, and reconciliation.
- Distinct from `providerPaymentKey`.
- Not exposed as a user-facing id.
- Conservative index direction: start with a non-unique index on `(provider, providerRef)`, or defer uniqueness until provider docs prove the correct uniqueness scope across provider/mode/account.
- Do **not** claim provider docs guarantee uniqueness until official Toss/PayPal docs or sandbox evidence proves the correct scope.

**Related unresolved/future fields:**
- `providerMode`: high-value before sandbox/live coexistence.
- `paymentMethod`: useful but may touch product/UI decisions.
- `routingRuleId` / `routingVersion`: useful for audit/debug.
- `providerConfirmIdempotencyKey`: may be required for durable outbound confirm/capture retries.
- Avoid bundling too much unless it directly gates D1 real provider safety.

**Confirm/capture idempotency decision:**
- Existing `Payment.idempotencyKey` is currently initiate-attempt oriented.
- Local `capture:{provider}:{providerPaymentKey}` is DB/local capture idempotency after capture, not outbound provider confirm idempotency.
- Real confirm/capture needs a separate deterministic outbound idempotency key.
- Candidate sources include `payment.id`, `providerRef`, or a persisted `providerConfirmIdempotencyKey`.
- Toss/PayPal header constraints still require provider-specific verification before implementation.

**Rejected options:**
- Reusing `Payment.providerPaymentKey`.
- JSON-only metadata as contract storage.
- Storing providerRef on `CheckoutSession`.
- Client-roundtrip-only providerRef.
- General field names that are too provider-shaped, such as `providerOrderId`.
- Proceeding with real initiate adapters before providerRef persistence migration. v22 note: the migration and contract vocabulary now exist, but real initiate adapters remain blocked until providerRef write logic, fake-adapter integration evidence, and provider-specific constraints are resolved.

**Remaining blockers before real adapters:**
- ProviderRef field/migration is implemented by `e80301c`, but future real initiate adapters still need a safe write path.
- Confirm/capture outbound idempotency decision is implemented by `90102b2`, but the schema/action patch is not implemented.
- Provider-specific id constraints are not verified.
- Sandbox/live mode is not durably modeled if required.
- Webhook verifier/parser injection does not yet exist for real providers.
- Provider-specific webhook correlation rules are not documented.
- Real void taxonomy and `VOID-HOOK-DEBT` are unresolved before real void.

**Recommended next step:**
- v20 recommended **D1-B providerRef schema patch** and v21 records that it is now complete.
- v21 recommended **D1-B contract patch: provider adapter boundary types/tests/fake adapters only** and v22 records that it is now complete.
- v22 recommended **D1-B providerRef write + initiate fake-adapter integration recon** and v23 records that it is now complete.
- v23 recommended **D1-B confirm/capture outbound idempotency recon**, and v24 records that the decision is now complete via `90102b2`.
- Current recommended next step is **D1-B confirm idempotency schema + fake-provider confirm flow patch**.
- That next patch must still exclude real provider API calls, real Toss/PayPal adapters, live credential wiring, real webhook verification, real void/cancel execution, settlement/fees/FX, and execution-time cross-PG fallback.

**v19에서 carry forward하는 D1-B adapter boundary design 사실:**

**D1-B adapter boundary design 완료 사실:**
- Commit: `6c3dd02 docs(payment): add D1-B adapter boundary design`.
- Design doc: `docs/payment_policy/d1b_adapter_boundary_design_v1.md`.
- 성격: design lock only, not implementation patch, not real provider adapter, not live enablement.
- verify baseline remains **20 files / 287 tests**.
- No real Toss adapter was added.
- No real PayPal adapter was added.
- No provider API calls were added.
- No schema or migration changes were made.
- No env/package changes were made.
- No live credential wiring was added.
- No webhook/void/reconciliation production code changed.

**D1-B locked design decisions:**
- Minimal D1 ports: `PaymentProvider`, `ProviderAdapterFactory`, `WebhookVerifier`, `WebhookParser`, `VoidExecutor`.
- D2/later surfaces remain deferred: `RefundProvider`, `SettlementProvider`, durable `ProviderStatusLookup` unless confirm timeout semantics force earlier lookup, provider health, fee/FX routing.
- Do **not** overload `Payment.providerPaymentKey` for pre-capture provider references.
- Recommended direction was a dedicated providerRef persistence field; v21 implemented the nullable field/migration.
- Real initiate adapters remain blocked until the providerRef write path, confirm/capture outbound idempotency, and provider-specific constraints are designed.
- `CaptureFacts` remains the inner completion-core input.
- Provider confirm/capture result normalization must happen before calling `completeFromCapture`.
- Outbound confirm/capture idempotency remains unresolved and must be designed before real adapters.
- Provider-specific webhook verifier/parser injection is required before real provider webhooks.
- Real void/cancel requires expanded `VoidExecutorResult` taxonomy, idempotent-success handling, retryable/terminal/manual-review distinction, auth/credential/programmer-stop distinction, and `VOID-HOOK-DEBT` resolution before real void goes live.

**D1-B stop conditions still active for real Toss/PayPal adapters:**
- Current `PaymentProvider` port is too narrow for safe real providers.
- Confirm/capture outbound idempotency is missing.
- Pre-capture provider reference field/migration now exists, but real initiate adapters still need a safe providerRef write path and provider-specific semantics.
- Webhook implementation is still mock-wired.
- Real void is unsafe until `VOID-HOOK-DEBT`, result taxonomy, and idempotency semantics are resolved.
- Sandbox/live env separation remains ambiguous.
- Implementing Toss/PayPal separately now risks incompatible adapter shapes.

**D1-B recommended next work:**
- Completed stage: **D1-B providerRef schema patch**.
- Completed stage: **D1-B contract patch: types/tests/fake adapters only** (`9fa74e6`).
- Completed stage: **D1-B providerRef write + initiate fake-adapter integration** (`7a429d8`).
- Completed stage: **D1-B confirm/capture outbound idempotency decision** (`90102b2`).
- Next stage: **D1-B confirm idempotency schema + fake-provider confirm flow patch**.
- Purpose: implement the persisted confirm idempotency key and confirm flow boundary without real provider calls.
- No real provider API calls should be part of normal `npm run verify`.

**v18에서 carry forward하는 D0/D1-A 사실:**

**D0 D-stage prep recon 완료 사실:**
- `PaymentProvider` enum은 이미 `MOCK` / `TOSS` / `PAYPAL`을 포함했다.
- 기존 routing shape는 KR/US/JP market mapping을 암시했지만, runtime `resolveProvider`는 여전히 mock provider를 반환했다.
- Toss/PayPal webhook route는 있었으나 verifier/parser는 mock seam이었다.
- void executor는 mock-only default였다.
- reconciliation은 local/report-only이며 provider status, settlement, fee, FX data를 읽지 않았다.
- D-stage는 "실 provider를 켠다"가 아니라, **공식 문서 + sandbox evidence + explicit safety guard 아래 mock boundary를 하나씩 교체하는 단계**다.

**D0 assumption ledger — D-stage에서 공식 문서/샌드박스로 확인할 것:**
- webhook response-code retry semantics.
- duplicate/replay semantics.
- signature/identity verification.
- raw-body requirements.
- provider event/transmission ID uniqueness.
- confirm/capture semantics.
- capture/approval timestamp mapping.
- amount/currency minimum-unit mapping.
- provider idempotency keys.
- void/cancel idempotency.
- already-canceled/already-refunded behavior.
- void duration vs outbox zombie margin.
- settlement/fees/FX data model.

**D0 official docs to consult before real provider code:**
- Toss Payments payment/widget, secret key auth, confirm, cancel, webhook, webhook security/signature, error taxonomy, idempotency/retry behavior, and sandbox/test-key docs.
- PayPal Orders v2 create/capture, Webhooks verification, webhook event model, captures/refunds/void or cancel semantics, idempotency/request ID behavior, sandbox credentials, currency/amount formatting, and relevant error taxonomy docs.

**D0 safety notes:**
- D0 시점 코드가 real provider credentials를 읽지 않았다.
- `.env.example`에 provider 이름이 있어도 code path는 mock-bound였다.
- `payment-reconcile`은 read-only지만 `DATABASE_URL`을 읽으므로 실행 대상 DB 주의가 필요하다.
- `outbox-dispatch`는 DB를 mutate하고, real void executor가 들어오면 provider side effect도 낼 수 있다.
- `docs/go-live-checklist.md`는 stale 가능성이 있으며 D-stage SSOT로 취급하지 않는다.
- `VOID-HOOK-DEBT`는 real void 전까지 정리/문서화해야 할 deferred item이다.

**D1-A provider selection contract 완료 사실:**
- Commit: `a3f8a4a feat(payment): add provider selection contract`.
- verify baseline: **19 files / 276 tests → 20 files / 287 tests**. Current D1-A verify summary: **20 files / 287 tests**.
- Files changed: `src/lib/payment/providers/routing.ts`, `src/lib/payment/providers/__tests__/routing.test.ts`, `src/app/actions/payment.ts`, `src/app/actions/__tests__/payment.test.ts`.
- 새 계약: static provider registry/rules, `PaymentMethod`, candidate selection/filtering, provider audit payload, stable rule IDs, market/method/currency/amount/mode validation.
- Server action은 sandbox-bounded provider resolution만 수행하며 provider API를 호출하지 않는다.

**D1-A safety outcomes:**
- `MOCK` is blocked in `LIVE`.
- Unknown market no longer silently falls back to `MOCK`.
- `LIVE` without explicit allowlist fails closed.
- payment action remains sandbox-bounded.
- No schema or migration files changed.
- No package/env files changed.
- No real Toss/PayPal adapter was added.
- No provider API calls were added.
- No webhook/void/reconciliation files changed.
- No execution-time cross-PG fallback was added.

**D1-A deferred decisions / next implementation boundary:**
- D1-A is provider selection contract only, not real Toss/PayPal integration.
- Actual Toss/PayPal adapter body, webhook verifier/parser body, void executor body, and provider response-code semantics remain D-stage work.
- `PaymentMethod` and routing rules are scaffolding for provider selection and audit; they are not final product/UI policy by themselves.
- Final allowlist policy, market rollout controls, and provider operational runbooks remain explicit D-stage/go-live decisions.

**v12에서 carry forward하는 C1 사실:**
- C1 추가 파일: `src/lib/payment/__tests__/c1-concurrency.integration.test.ts`.
- verify baseline: **16 files / 252 tests → 17 files / 260 tests**.
- C1 성격: bounded evidence/regression coverage, not formal proof.
- C1-3/C1-6/C1-7: 각각 **3 bounded natural-race rounds**로 unique fixture를 반복한다.
- C1-5: `capturedAt` decision-matrix + composition coverage다. live sweeper-race proof를 주장하지 않는다.
- pg concurrent-query warning: 조사 완료. `pg_stat_activity`에서 multiple backend PIDs와 lock waits가 관찰돼 C1 natural-race evidence를 무효화하지 않는다.
- process deviation: C1은 명시적 push 승인 전 push된 것으로 기록한다. 이는 **code correctness issue가 아니라 협업 절차 이탈**이다.

**C2-I1 완료 사실(v13에서 carry forward):**
- C2-I1 commit: `be5a7a3 feat(payment): add webhook ingress contract`.
- verify baseline: **17 files / 260 tests → 17 files / 266 tests**.
- `npm run verify` green.
- C2-I1은 **B4/C2-prep**이며 그 자체는 **C2 detector/classifier 구현이 아니었다**. 이후 C2-v0가 report-only detector/classifier를 추가했다.
- v13 작성 시점에 C2-I1은 **로컬 commit 완료, push 미수행** 상태였다.

**새 웹훅 인입 계약:**
- `PaymentEvent`는 이제 **authenticated provider event ledger only**다.
- verification failure와 metadata extraction failure는 더 이상 trusted `PaymentEvent` row를 만들지 않는다.
- rejected inbound attempt는 `WebhookIngressRejection`에 저장한다.
- `WebhookIngressRejection`은 full raw를 저장하지 않고 bounded summary만 저장한다: byte count, hash, bounded prefix, nullable/non-unique candidate transmission ID.
- rejected inbound ledger는 trusted dedup 또는 identity source가 아니다.
- `PaymentEventStatus`는 `RETRYABLE_FAILED`를 포함한다.
- `PaymentEvent.failureStage` / `failureCode`는 authenticated `PARSE` / `COMPLETE` failure에만 쓴다.
- `VERIFY`는 trusted `PaymentEvent.failureStage`가 아니다. verify 실패는 rejected inbound 영역이다.
- duplicate terminal event(`PROCESSED` / `IGNORED` / `FAILED`)는 200으로 short-circuit한다.
- duplicate non-terminal event(`RECEIVED` / `RETRYABLE_FAILED`)는 stored authenticated raw를 재처리한다.
- incoming-vs-stored raw mismatch는 rejected inbound를 쓰고 replay body를 처리하지 않는다. 이 raw mismatch tripwire는 dedicated test coverage가 있다.
- forged verify-fail with candidate transmission ID는 trusted `(provider, transmissionId)` namespace를 예약하지 못하며, later genuine authenticated webhook with same transmission ID가 정상 처리된다.
- `PROCESSING` `PaymentEvent` status는 추가하지 않았다.
- `processingStartedAt`은 추가하지 않았다.
- durable claim/lease semantics는 C2-I1에 없다.

**C2-v0 완료 사실:**
- C2-v0 commit: `7eefa2d feat(payment): add report-only reconciliation detector`.
- verify baseline: **17 files / 266 tests → 18 files / 274 tests**.
- `npm run verify` green.
- 새 모듈: `src/lib/payment/reconciliation/`.
- 새 테스트: `src/lib/payment/reconciliation/__tests__/reconcile.integration.test.ts`.
- schema/migration 변경 없음.
- 기존 payment/webhook/session/outbox production behavior 변경 없음.
- v14 작성 시점에 C2-v0는 **로컬 commit 완료, push 미수행** 상태였다.

**C2-v0 계약:**
- C2-v0는 structured findings + recommended actions만 반환한다.
- mutation/repair 없음. auto-reentry 실행 없음. void 실행 없음.
- retention cleanup 없음. settlement reconciliation 없음. admin UI 없음. cron/scheduler binding 없음.
- persistent reconciliation finding table, run history, ack state 없음.
- classifier는 uncontrolled `lastError`에 branch하지 않는다. `lastError`는 diagnostic detail로만 허용되는 성격이다.
- stale/spike thresholds는 option/default driven이며 final product policy로 고정된 것이 아니다.

**C2-v0 detector coverage:**
- Layer 1: `SUCCEEDED` payment without order, succeeded payment without order + void-path state, order/payment/session mismatch, amount/currency mismatch, partial local completion structural anomalies.
- Layer 2: `pg.void` max attempts, structural `pg.void` payload mismatch, trusted `FAILED(PARSE)`, trusted `RETRYABLE_FAILED(COMPLETE)`, stale `RECEIVED`, stale `RETRYABLE_FAILED`, rejected `VERIFY`, rejected `METADATA_EXTRACT`, raw mismatch rejection, rejected/trusted event failure spike thresholds.

**C2-v0 source-boundary notes:**
- `PaymentEvent` remains the trusted authenticated event ledger from C2-I1.
- `WebhookIngressRejection` remains the rejected inbound ledger.
- `WebhookIngressRejection` is not a trusted identity/dedup source.
- `lastError` is diagnostic only and not classifier input.

**C2-v0 limitations:**
- Cart/inventory historical reconstruction is omitted because cart can be re-added and no inventory ledger exists.
- Inventory/cart anomalies are not high-confidence C2-v0 findings.
- Existing DB invariant probe had earlier EPERM limitations; C2-v0 tests are fixture-based and do not claim production DB cleanliness.

**C2-v0 manual reconciliation report wrapper completed:**
- Manual wrapper commit: `e90d822 feat(payment): add manual reconciliation report`.
- verify baseline: **18 files / 274 tests → 19 files / 276 tests**. Current baseline: **19 files / 276 tests**. Test delta: **274 → 276**.
- Files added/changed: `scripts/payment-reconcile.ts`, `src/lib/payment/reconciliation/__tests__/report-wrapper.test.ts`, package script `payment:reconcile`.
- Command: `npm run payment:reconcile`.
- Pretty JSON example: `npm run payment:reconcile -- --pretty --now 2026-08-03T00:00:00.000Z`.
- Output is JSON by default and includes `generatedAt`, `now`, total finding count, counts by `kind`, counts by `severity`, counts by `recommendedAction`, and full structured `findings` array with source IDs preserved.
- Runtime uses script-local `dotenv/config` and `PrismaPg` + `PrismaClient`. It does not import `src/lib/db.ts` because that helper imports `server-only`. It requires `DATABASE_URL` and calls `prisma.$disconnect()` in `finally`.
- Safety: imports/calls `reconcilePaymentCore`; does not call `completeFromCapture`, `dispatchPending`, void executor/handler, session transition functions, or repair/reentry helpers; does not expose `--fix`, `--repair`, `--execute`, `--reentry`, or `--void`.
- Exit behavior: findings do **not** cause nonzero exit. Runtime/script failure exits nonzero. Successful stdout is machine-readable JSON; errors go to stderr.
- Test coverage: `src/lib/payment/reconciliation/__tests__/report-wrapper.test.ts` covers formatter/output shape, pretty JSON, option parsing, safety/import guard, and hits no real DB.
- Wrapper commit made no schema/migration changes, no persistent reconciliation findings/run history/ack state, no cron/scheduler binding, no admin UI, no repair automation, no auto-reentry execution, no void execution, and no state mutation.

**C2-v0 manual report smoke-run delta(v16):**
- Initial manual smoke failed before JSON output because the configured local DB schema was behind the code: Prisma P2022 reported missing column `PaymentEvent.attemptCount`.
- Root cause: committed C2-I1 migration `20260706130000_c2_i1_webhook_ingress_contract` had not been applied to the configured DB.
- Migration action: `npx prisma migrate deploy` applied pending migration `20260706130000_c2_i1_webhook_ingress_contract`. No seed, reset, drop, or new migration was performed.
- Post-migration status: DB schema is up to date.
- `npm run payment:reconcile` works for human use, but npm prints lifecycle prelude lines to stdout before the script JSON. Strict JSON consumers should use `npm --silent run payment:reconcile -- ...` or an equivalent direct node invocation.
- Pretty deterministic strict-JSON example: `npm --silent run payment:reconcile -- --pretty --now 2026-08-03T00:00:00.000Z`.
- Smoke output after migration: `totalFindings: 0`; counts by kind/severity/recommendedAction were empty.
- Threshold-heavy smoke with low verify/raw-mismatch thresholds also returned `totalFindings: 0`.
- CLI negative checks (`--now not-a-date`, invalid numeric threshold, unknown option) fail before DB access, leave stdout empty in `npm --silent` mode, and print the validation error to stderr.
- No files changed during smoke. verify baseline remains **19 files / 276 tests**.

**C2-v0 threshold/action policy review delta(v17):**
- No code changes were made. No production code, tests, schema, reconciliation thresholds, or recommended actions changed.
- Current verify baseline remains **19 files / 276 tests**.
- Manual report smoke output remains `totalFindings: 0` in the configured local DB. Zero findings is **not proof of safety**; it only means the current local DB had no live examples for the detectors.
- C2-v0 taxonomy, severity, recommendedAction, and default thresholds are accepted as **coherent v0 defaults**.
- Thresholds remain option/default driven, not final ops policy.
- `AUTO_REENTRY_CANDIDATE` remains recommendation only, not execution. It must not be read as permission to auto-run `completeFromCapture` before CaptureFacts reconstruction and repair policy are designed.
- No auto-reentry, repair, void execution, retention cleanup, settlement reconciliation, admin UI, cron, or persistent reconciliation findings are implemented.
- `lastError` remains diagnostic only and is not classifier input.
- Metadata rejection spike remains `ALERT_ONLY` for v0, but is security-adjacent and may be revisited once real ingress noise is observed.
- `TRUSTED_EVENT_PARSE_FAILED` remains `info` / `ALERT_ONLY` for single events; parse-failure spikes escalate via the spike detector.
- `TRUSTED_EVENT_RETRYABLE_COMPLETE_FAILED` remains `info` / `ALERT_ONLY` while non-stale and `warning` / `WATCH_STALE` when stale; the spike threshold may be tuned after real traffic.
- `VOID_FAILED_MAX_ATTEMPTS` and `VOID_MISMATCH_TERMINAL` remain urgent/manual/D-stage signals, not automated repair.
- Cart/inventory historical reconstruction remains omitted or low-confidence because cart can be re-added and no inventory ledger exists.
- Deferred items carried forward unchanged: auto-reentry execution and CaptureFacts reconstruction; durable findings/run history/ack; cron/admin/manual script evolution beyond thin wrapper; retention TTL; rate limiting; true streaming/memory-level body bound; real provider response-code validation; provider void idempotency and zombie-duration margin validation; settlement reconciliation; internal retry worker / `PROCESSING` / `nextAttemptAt`; `VOID-HOOK-DEBT`.

---

## 6. 핵심 아키텍처 결정 (Stage B — 코드론 안 보이는 것)

> 완료 코드의 *어떻게*는 설계 문서가 SSOT. 여기엔 새 세션이 **오해하기 쉬운** 구조적 성질만.

- **4-A2. 멱등의 물리 = 이중 방어.** Payment `(provider, providerPaymentKey)` 유니크 + Order `checkoutSessionId`/`paymentId` 유니크. 어느 것도 단독으로 충분치 않고 조합이 불변식을 강제(설계 a2 D1).
- **4-B2. 완료 = α/β/γ 3분해(가장 중요·오해 주의).** 단일 거대 tx가 **아니다**. α(캡처 사실 작은 tx)가 β(완료 tx) 롤백에도 살아남아 "PG는 받았는데 로컬 모름"을 방지 — write-ahead 문제의 구조적 해답(정책 v6 §2.3). α~β 크래시는 void가 아니라 **재진입 완료로 수렴**. 이 성질을 모르면 B2를 "그냥 트랜잭션"으로 오독한다.
- **4-idem-layers. 단일 executor 호출은 핸들러 단독 보장이 아니다.** enqueue dedup(`dedupKey @unique`) + A3 원자 클레임 2계층에 의존하고, 그마저 뚫는 **두 경로**(느린-executor+좀비 회수 / executor성공-후-DB전이실패)의 최후 방어는 executor 멱등(D-stage 요건). B5 설계 v3 DG2/DG3 + G5 하드 게이트가 이걸 검증. **C1은 이 중 느린-executor+forced zombie 노출을 Mock executor로 bounded 실증했다.**
- **4-seams. seam은 shape 완성·body 이연.** D1-A가 provider selection contract를 고정했고 D1-B가 adapter boundary design을 고정했다. 하지만 resolveProvider의 실 Toss/PayPal adapter body·verify(B4)·VoidExecutor+operationKey(B5)는 아직 비어 있음 — body를 채울 때도 공식 문서+샌드박스 검증이 기준이다. 인양 지식(레거시 shape)은 **공식 문서 재확인 후에만** 반영(§7 출처 규칙, no-op 재현 금지).
- **4-void-scope. void = Payment만.** γ는 터미널 실패(β 롤백→주문 없음, 세션 FAILED) 경로에서만 enqueue하므로 되돌릴 주문이 없다(B5 DG4). 정상 주문의 환불은 완전히 별개(§7.1, 미설계).

---

## 7. ★ Stage B가 만든 안전 성질 — 반드시 읽어라

v10에서 레거시 안전 전제는 소멸했고, Stage B가 **새 성질을 구조로 심었다**:
1. **멱등은 B2가 소유, 원장은 record-and-forward.** B4 웹훅은 dedup 게이트를 만들지 않고 항상 저장→항상 completeFromCapture, 멱등은 α유니크+β잠금+Order유니크가 담당(정책 v6 §7.5). **이래서 웹훅 dedup 공백이 correctness 문제에서 retention 문제로 소멸.** 새 세션은 "웹훅 중복 처리 어쩌지"를 다시 풀지 마라 — 이미 구조로 답됐다.
2. **terminal_failed는 A3의 일반 계약.** dispatcher가 resolved-value로 즉시 FAILED를 구분(재시도 안 함). B5 mismatch가 이걸 씀. 이제 다른 핸들러도 쓸 수 있는 표면(AGENTS/A3 문서에 기록 대상 — §10).
3. **불변식 SSOT = 정책 v6 §3.** 핸드오프가 아니라 정책을 읽어라.

### 5-C1. C1 완료 후 안전 증거의 한계

- C1은 **실 Postgres READ COMMITTED 위 bounded evidence/regression coverage**다. formal proof가 아니므로, 반복 수·고유 fixture·DB lock/unique/conditional update 조합으로 회귀를 잡는 하네스라고 읽어라.
- C1-3(STOCKED stock=1), C1-6(confirm×webhook), C1-7(two payments/one session)은 각각 **3 bounded natural-race rounds**다. winner identity는 안정 계약이 아니므로 고정하지 않는다.
- C1-5는 `capturedAt <= expiresAt`이면 이미 `EXPIRED`여도 완료, `capturedAt > expiresAt`이면 void/compensation이라는 **decision matrix**를 직접 고정한다. Sweeper/late-signal race safety는 C1-1(row lock serialization) + B1 sweeper(SUBMITTED만 expire) + C1-5(post-sweep EXPIRED valid capture completes)의 composition으로 읽어라. live sweeper-race proof가 아니다.
- pg concurrent-query warning은 조사됨: warning 자체는 같은 pg Client에 active query가 있을 때 queue되는 deprecation이지만, C1 관측 중 multiple backend PIDs와 lock waits가 확인돼 C1-3/C1-6/C1-7의 natural-race evidence를 약화하지 않는다.

### 5-C2I1. 웹훅 인입 계약의 안전 경계

- C2-I1은 기존 B2/C1의 re-entry/idempotency 전제를 사용한다. non-terminal duplicate replay는 durable claim 없이 stored authenticated raw를 다시 complete path로 보낸다. 동시 재처리는 낭비 가능성이지 correctness 방어의 주 수단이 아니다.
- `PROCESSING` / lease / `processingStartedAt` / stale-claim recovery는 의도적으로 넣지 않았다. 내부 retry worker, `PROCESSING`, `nextAttemptAt`가 필요하면 별도 설계에서 다룬다.
- C2-I1 이후 C2가 볼 stale 대상은 **stale `RECEIVED`**와 **stale `RETRYABLE_FAILED`**다. stale `PROCESSING` detector를 전제로 삼지 마라.
- `VERIFY` failure는 trusted `PaymentEvent` 실패가 아니므로 Layer 2 terminal-failed taxonomy에서 PaymentEvent failureStage로 읽으면 안 된다. `WebhookIngressRejection`의 rejected inbound signal로 소비해야 한다.

### 5-C2v0. report-only 대사의 안전 경계

- C2-v0는 `src/lib/payment/reconciliation/`의 구조화 finding collector다. 기존 ledger/state/outbox/rejection rows를 읽고 recommended action을 반환할 뿐, DB mutation·repair·provider call·outbox dispatch를 하지 않는다.
- `AUTO_REENTRY_CANDIDATE`는 권고일 뿐 실행이 아니다. CaptureFacts reconstruction policy와 실제 auto-reentry 실행은 deferred다.
- `lastError`는 classifier input이 아니다. 사람이 읽는 진단 세부정보로만 취급한다.
- Thresholds는 option/default driven이다. v17 시점의 값은 detector default이지 최종 제품/운영 정책이 아니다.
- v17 policy review 결과, taxonomy/severity/recommendedAction/default thresholds는 **coherent v0 defaults**로 수용한다. 단 metadata rejection spike는 v0에서 `ALERT_ONLY`를 유지하되 security-adjacent signal로 보고, real traffic 이후 재검토 가능성을 남긴다. `TRUSTED_EVENT_PARSE_FAILED` single event는 `info/ALERT_ONLY`, spike는 escalation; `TRUSTED_EVENT_RETRYABLE_COMPLETE_FAILED`는 non-stale `info/ALERT_ONLY`, stale `warning/WATCH_STALE` 유지.
- Cart/inventory historical reconstruction은 C2-v0에서 제외했다. Cart는 재추가될 수 있고 inventory ledger가 없으므로 high-confidence anomaly로 승격하지 않는다.

### 5-C2v0-report. manual wrapper의 안전 경계

- `scripts/payment-reconcile.ts`는 C2-v0 detector를 수동으로 실행해 JSON을 stdout에 출력하는 얇은 wrapper다. 새 reconciliation engine이 아니고 repair automation도 아니다.
- Script-local `PrismaPg` + `PrismaClient`로 `DATABASE_URL`에 연결하고 `reconcilePaymentCore`만 호출한다. App helper `src/lib/db.ts`는 `server-only` 때문에 plain Node script에서 import하지 않는다.
- Script 자체의 성공 출력은 machine-readable JSON이다. 다만 `npm run payment:reconcile`은 npm lifecycle prelude를 stdout에 붙이므로, 엄격한 JSON consumer는 `npm --silent run payment:reconcile -- ...`를 사용한다. `--pretty`는 사람이 읽기 쉬운 JSON formatting만 바꾸며 finding semantics를 바꾸지 않는다.
- Findings presence는 exit code를 바꾸지 않는다. DB/env/argument/runtime failure만 nonzero exit이다.
- 이 wrapper는 manual operator inspection의 시작점이다. Scheduling, persistent run history, ack workflow, admin UI, operational runbook은 아직 별도 설계 대상이다.

### 5-D1A. provider selection contract의 안전 경계

- D1-A는 static selection/audit contract다. 실 PG adapter·provider HTTP call·webhook verifier/parser·void executor는 추가하지 않았다.
- LIVE에서 `MOCK`은 차단되고, unknown market은 더 이상 조용히 `MOCK`으로 fallback하지 않으며, LIVE allowlist가 비어 있으면 fail closed한다.
- Selection failure는 감사 가능한 reason/rule ID를 남기는 계약이지, 실행 중 다른 PG로 cross-fallback하는 기능이 아니다.
- Payment action은 sandbox-bounded 상태로 남아 있다. 실 provider 호출은 D1-B/D2에서 별도 설계·검증 후 들어가야 한다.

### 5-D1B. adapter boundary design의 안전 경계

- D1-B는 design lock only다. real adapter implementation, provider API calls, live credential wiring, schema changes, and production code changes are not included.
- Provider boundary는 작은 port들로 분리한다: `PaymentProvider`, `ProviderAdapterFactory`, `WebhookVerifier`, `WebhookParser`, `VoidExecutor`.
- `Payment.providerPaymentKey`는 post-capture identity로 유지하고 pre-capture providerRef로 오버로드하지 않는다.
- providerRef persistence decision, `Payment.providerRef` field/migration patch, D1-B provider adapter contract patch, providerRef write patch, and confirm/capture outbound idempotency decision are complete. Real Toss/PayPal adapters remain blocked until the confirm idempotency schema/action patch and provider-specific constraints are resolved.
- accepted/current direction: nullable, attempt-scoped `Payment.providerRef`, not `CheckoutSession`, not client-roundtrip-only.
- `CaptureFacts`는 completion core 내부 입력으로 유지하고, provider confirm/capture normalization은 그 앞 boundary에서 수행한다.
- Real webhook before live requires provider-specific verifier/parser injection. Current webhook core is still mock-wired.
- Real void before live requires expanded void result taxonomy and `VOID-HOOK-DEBT` resolution.

---

## 8. 백로그 / 다음 — **무엇을 gate하는지로 분류**

### 6-1. 다음 작업 순서 (권장)

1. **D1-B confirm idempotency schema + fake-provider confirm flow patch** — nullable unique `Payment.providerConfirmIdempotencyKey`를 추가하고, confirm이 provider 호출 전에 local `Payment`를 load/claim하여 `confirm:{provider}:{payment.id}`를 write/reuse하도록 구현한다. fake/mock-only이며 normal `npm run verify`에 real provider API call 금지.
2. **C2-v0 운영 표면 후속 결정** — thin manual JSON wrapper와 configured DB smoke 확인은 완료됐다. 이 결과를 scheduling/persistent findings/ack/admin UI/operational runbook으로 확장할지는 별도 설계가 필요하다. 자동 repair로 바로 확장하지 마라.
3. **D1-B/D2 PG 샌드박스** — D1-A provider selection + D1-B boundary 위에 실 seam body 채우기 + **D-stage 백로그 전체 해소**(아래 6-지도).
4. **E MR 최소** — 제작 파이프라인 진입점.
5. **병행(비결제)**: §6-2 심사 선행물.

### 6-지도. 이연·열린 것의 단일 집결 (what it gates 순)

**[C1 완료 — 단, proof 아님] 동시성 bounded evidence:**
- C1은 β FOR UPDATE blocking, confirm×webhook, two payments/one session, slow executor+forced zombie, α-only re-entry, STOCKED stock=1 no oversell, bounded jitter same-session completion, capturedAt expiry decision matrix를 고정했다.
- 남은 성격: C1은 Mock/seam 기반 구조 실증이다. **D-stage가 real provider void idempotency와 zombie-duration margin validation을 소유**한다(실 op 지속시간 vs `OUTBOX_ZOMBIE_AFTER_MS`=5분).
- F1 방어 심화는 report-only/deferred: webhook `transmissionId` concurrent duplicate, outbox `dedupKey` concurrent enqueue는 현재 sequential/existing coverage 또는 권고 수준이며 C1에서 구현하지 않았다.
- **VOID-HOOK-DEBT**: `createVoidHandler` exposes optional `transitionPayment` injection that appears test-hook-like; C1 does not rely on it. Stage B/B5 cleanup or D-stage should decide whether to remove it, document it as a legitimate composition seam, or keep it temporarily.

**[C2-v0 완료 — 단, report-only] 관측·대사 설계:**
- C2-v0는 **Layer 1 consistency matrix + Layer 2 terminal-failed/rejected ingress taxonomy**를 report-only finding으로 소비한다. 실행·수정·보존은 구현하지 않았다.
- **Layer 1 coverage**: `SUCCEEDED` payment without order, succeeded payment without order and void-path state, order/payment/session mismatch, amount/currency mismatch, partial local completion structural anomalies.
- **Layer 2 coverage**: `pg.void` max attempts, structural `pg.void` payload mismatch, trusted `FAILED(PARSE)`, trusted `RETRYABLE_FAILED(COMPLETE)`, stale `RECEIVED`, stale `RETRYABLE_FAILED`, rejected `VERIFY`, rejected `METADATA_EXTRACT`, raw mismatch rejection, rejected/trusted event failure spike thresholds.
- **Source boundaries**: verify failure는 trusted `PaymentEvent.failureStage`가 아니며 `WebhookIngressRejection`에서 읽는다. authenticated `PARSE` / `COMPLETE` failure는 `PaymentEvent.failureStage` / `failureCode`, void-maxattempts와 void-mismatch는 outbox/void 경계에서 읽는다. `WebhookIngressRejection`은 trusted identity/dedup source가 아니다.
- **stale detector 구현 상태**: stale `RECEIVED`, stale `RETRYABLE_FAILED`, `VERIFY` rejection spike는 C2-v0에 들어갔다. C2-I1에는 `PROCESSING` PaymentEvent가 없으므로 stale `PROCESSING` detector를 만들지 않는다.
- **terminal-FAILED 택소노미**(정책 v6 §2.4) — C2는 이걸 **단일 버킷 아닌 구별 원인**으로: ⑴ void-mismatch(B5 DG6→outbox FAILED, 내부 결함) ⑵ verify-fail(C2-I1 이후 `WebhookIngressRejection`, 위조 스팸 벡터) ⑶ void-maxattempts(A3 재시도 소진). 진단·대응 상이.
- **부수 속성**: terminal-mismatch outbox 행 `attempts=1`(markFailed 재사용 산물, 개념상 0, 무해하나 C2 인지).
- **durable reconciliation findings / run history / ack state**는 deferred. 새 테이블·스키마 변경 없음.
- **manual script evolution / cron / admin UI**는 deferred. 현재 thin JSON wrapper는 완료됐지만, "manual script evolution"은 scheduling, persistence, admin UI, operational runbooks, ack workflow 같은 확장을 뜻한다.
- **retention TTL 정책**(정책 v6 §7.5, 미결) — 처리/무시/검증실패 이벤트 보존 기간·정리, 위조 검증실패 행 스팸 억제. correctness 아니라 관측·법률·저장 정책.
- **rate limiting**과 **VERIFY rejection spike 방어**는 열려 있다. C2는 spike를 탐지할 수 있어야 하고, rate limiting 자체는 별도 구현/운영 정책이다.
- **true streaming/memory-level body bound**는 열려 있다. C2-I1은 `Content-Length` gate + post-read size check + bounded DB storage만 제공한다.
- **internal retry worker / `PROCESSING` / `nextAttemptAt`**는 deferred. C2-I1은 durable claim/lease semantics를 만들지 않았다.
- **auto-reentry execution and CaptureFacts reconstruction policy**는 deferred. C2-v0는 `AUTO_REENTRY_CANDIDATE` 식별/권고만 한다.

**[D1-B/D2를 gate] 실 PG 사실 — 공식 문서+샌드박스로만:**
- **providerRef schema/contract/write gate(v23)**: providerRef field/migration exists as nullable `Payment.providerRef` with a non-unique `(provider, providerRef)` index, `src/lib/payment/providers/contract.ts` holds adapter boundary vocabulary, and `7a429d8` makes initiate persist providerRef when providers return it. `Payment.providerPaymentKey`는 pre-capture providerRef로 오버로드하지 않는다.
- **confirm/capture outbound idempotency gate(v24)**: decision doc `docs/payment_policy/d1b_confirm_idempotency_decision_v1.md` locks future nullable unique `Payment.providerConfirmIdempotencyKey`, canonical local key `confirm:{provider}:{payment.id}`, and exact-key persistence before/at first provider confirm/capture. `Payment.idempotencyKey`, `providerPaymentKey`, `capture:{provider}:{providerPaymentKey}`, and `providerRef` are not the primary outbound confirm idempotency source. Real confirm/capture still needs the schema/action patch and provider-specific header verification.
- **seam body 3종**: resolveProvider(실 Toss/PayPal 인스턴스)·verify(실 서명 검증 — **레거시 Toss sender-auth no-op을 옮기지 말고 공식 재확인**)·VoidExecutor(실 cancel/refund + operationKey로 멱등).
- **미검증 가정들**(Stage B가 남긴 플래그): "2xx=수신확인"이 Toss/PayPal 표준인가(B4 DF3 — 일부 PG가 상태 신호로 쓰면 재검토) / capturedAt 가용성(B2 DC2 — Toss approvedAt·PayPal create_time, 폴백=수신 시각) / eCheck·PENDING 지연완료 경로 재현(정책 open §8.2·§0-1 결정 입력) / PG "이미 취소됨/캡처 없음" 에러 택소노미(B5 DG3 — void 멱등의 실 근거).
- **real provider response-code semantics**는 D-stage 검증 대상이다. C2-I1의 400/500/200 mock-provider recovery intent를 Toss/PayPal 실 계약으로 일반화하지 마라.
- **real provider void idempotency and zombie-duration margin validation**은 D-stage 소유다. C1/C2-v0는 mock/seam 기반 증거이며 실 provider op 지속시간과 `OUTBOX_ZOMBIE_AFTER_MS` margin을 검증하지 않는다.
- **조건부 재설계 트리거**: D가 **반복 void가 안전 멱등이 아님**을 확인하면 → Payment enum에 VOID_IN_PROGRESS 즉시 추가가 아니라 **별도 보상/void-시도 상태 모델 검토**(B5 §5·사용자 결정 — 상태기계 드래그 회피).
- **settlement reconciliation**(정산 대사/수수료/FX/payout matching)은 D-stage/later다. C2는 결제 코어 로컬 정합성/terminal failure 소비가 우선이며, 실 PG 정산 데이터가 필요한 영역을 끌어오지 않는다.

**[별도 트랙 — 아직 설계 안 됨, 정책이 선취 안 함]:**
- **§7.1 환불 상태기계 전체** — 정상 주문의 부분환불·운영자 환불 상태 전제·멱등키. VOID-KEY(확정)는 *완료 실패 void*만 정함. **운영자 환불 상태 전제**가 잔존 진짜 공백(정책 v6 §7.1).
- **§1.3 PII 볼트** — 세션 스냅샷의 배송지 PII(CORE-2가 인지된 채 승인) vs 삭제권(CPRA·APPI). retention과 같은 층. `[법률]`
- **§1.1 세션 스냅샷 명세 최종** — v6에서 FX 필드는 PRICE-1로 종결, 나머지 명세는 미결.
- **§7.3 세금·관세 산정** — A2에 자리(administrativeArea)만, 산정 로직 미설계. `[세무·관세사]`

### 6-2. 심사 선행물 트랙 (토스 공식 요건 — 코드로 지금 가능, 비결제)

- **cart KRW 표시 버그 수정**(반려 리스크 — B1이 세션에선 오염 경로를 차단했으나 *cart 표시 자체*는 여전히 버그), **랜딩**(루트 아직 create-next 기본), **하단 필수 표기**(상호·대표·사업자번호·주소·유선·통판신고 — 값은 founders). 약관·개인정보처리방침은 법무.
- 결제경로 PPT(메인→상품→결제→결제창)는 B3 결제창 스텁+UI 재건 후 — founders 온보딩과 동기화. **주의: B3는 액션까지만, UI 재건은 아직**(체크아웃 화면은 여전히 스텁).

### 6-3. 기타 백로그

- 유지: 재고 복원(반품), 마진 엔진, 출시 하드닝(모니터링·보안·모바일), 마이페이지·리뷰·위시리스트·이메일, 피팅 mock 잔재, 미들웨어 deprecation, `<img>` lint 4, ADMIN 프로비저닝, `ci/add-github-actions` origin 잔존, **정책 v2 파일 내용 계보 확인**(head -5). NestJS 보류 유지(ARCH-0).

---

## 9. 라이브 전환 (사업 트랙) — v10 유지 + 갱신

- **토스 심사**(공식 문서, 2026-07-06): 토스 1~2일 + 카드사 최대 14일, 심사는 실판매 사이트에서 상품·필수 표기·**테스트 키 결제창 호출**까지(서버 연동 불요). 헤지: pre-cutover 태그 배포 또는 신 체크아웃 테스트키 결제창 스텁. 잔여 확인(온보딩 채널): 연동 방식 교체 재확인 절차·크로스보더 요건·입점 허용 업종.
- go-live-checklist: PG18 반영됨(:73). 추가 필요: "컷오버 drop이 migrate deploy 도는 모든 DB의 레거시 행 폐기 — 프로덕션류 배포 존재 시 인지".
- 웹훅 URL 등록 시점엔 B4/C2-I1이 이미 라우트 인수 상태다. D에서 실 provider verify/response semantics를 채워야 live 의미가 완성된다.

---

## 10. 막는 것 (founders)

토스 온보딩(선행물=§6-2 + 도메인·통판신고·약관) · 피팅 Phase 0 · 법무(철회권·PII·세무) · 도메인 · **GOAL-0/목표 출시일/팀 정보**(ARCH-0 만료조건 괄호 값 — 정책 v6에 미치환 잔존). 새 세션은 founders 진행도 확인부터.

---

## 11. 작업 방식 (요약 — 상세 protocol v3 + AGENTS v4)

- 루프·교차검토·verify≠작동·커밋 규율·정찰 위임·STRICT 변경 규율·고정 산출물 저장 시 원문 동봉: 유지.
- **process note**: C1은 명시적 push 승인 전 push되어 process deviation으로 기록한다(code correctness issue 아님). C2-I1은 `be5a7a3`로 로컬 commit됐고 v13 작성 시점에는 push 미수행이었다. C2-v0는 `7eefa2d`로 로컬 commit됐고 v14 작성 시점에는 push 미수행이었다. Manual report wrapper는 `e90d822`로 로컬 commit됐고 v15 작성 시점에는 push 미수행이었다. v16 작성 시점 baseline은 `4907636 docs(payment): add C2 report wrapper handoff v15` pushed/clean 상태였다. v17 작성 시점 baseline은 `cda3e2e docs(payment): add C2 report smoke handoff v16` pushed/clean 상태였다. D1-A provider selection contract는 `a3f8a4a feat(payment): add provider selection contract`로 로컬 commit 완료(작성 시점 push 전)이며 verify baseline은 **20 files / 287 tests**다. D1-B adapter boundary design은 `6c3dd02 docs(payment): add D1-B adapter boundary design`로 로컬 commit 완료(작성 시점 push 전)이며 docs-only라 verify baseline은 그대로 **20 files / 287 tests**다. ProviderRef persistence decision은 `695ca55 docs(payment): add providerRef persistence decision`으로 로컬 commit 완료(작성 시점 push 전)이며 docs-only라 verify baseline은 그대로 **20 files / 287 tests**다. ProviderRef schema patch는 `e80301c feat(payment): add providerRef persistence field`로 로컬 commit 완료(작성 시점 push 전)이며 verify baseline은 **20 files / 288 tests**다. Provider adapter contract patch는 `9fa74e6 feat(payment): add provider adapter contract types`로 v22 작성 전 이미 push되었고, v22는 이를 follow-up handoff로 기록한다. ProviderRef write patch는 `7a429d8 feat(payment): persist providerRef from initiate`로 로컬 commit 완료(작성 시점 push 전)이며 verify baseline은 **23 files / 305 tests**다. Current verify baseline is **23 files / 305 tests**.
- **문서 부채(다음에 문서 만질 때)**: ⑴ **terminal_failed가 A3의 새 일반 계약이 됨** → a3 설계 문서·AGENTS에 계약 확장 기록(현재 코드에만 있음). ⑵ B3 UI 재건이 아직 안 됨(액션만) — 체크아웃/주문 화면 스텁 상태를 다음 핸드오프가 계속 명시.
- **Stage B 교훈**: 정찰이 설계를 교정한 사례 다수(core.ts 흡수·Market.isActive·좀비 이중호출) → *설계 잠금 전 정찰*의 가치 재확인. 구현이 상위 계약 공백을 드러낸 사례(B5 mismatch→A3 확장) → *작은 핸들러도 코어 계약을 건드릴 수 있음*. 문서 간 참조도 원문 대조 대상(v6 편집 시 앵커 미스 다수 — verify로 포착).
- 협업 선호(Profile): 옵션 전개·전제 풀기·검토 경계·결과물은 입력 — 유지.
