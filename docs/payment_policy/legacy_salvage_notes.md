# 레거시 인양 기록 (salvage notes)
> 성격: 2026-07-06 read-only 정찰의 사실 스냅샷(검수 완료 — 갱신하지 않음).
> 각 항목은 "레거시 구현 기준"이며 신 코어 반영 전 공식 문서 재확인 필수(AGENTS §4.5-3·§7).
> "정책 공백 후보" 플래그의 재판정: v5가 커버한 2건(PENDING 처리·완료 시맨틱)과
> 잔여 4건(보상 키·환불 상태 전제·선기록·dedup 기준 → 정책 §7.1/§3-불변식5 확정 시 입력)의
> 배정은 핸드오프·정책 문서가 보유.

## 0. 상태 검증

- git status: 정찰 시작 시 `git status --short` 출력 없음. 파일 생성 전 워크트리는 clean.
- `AGENTS.md`의 `nextjs-agent-rules` 관리 블록: `BEGIN`/`END` 주석과 블록 내용 존재. 근거: `AGENTS.md:1-5`.
- `CLAUDE.md`의 `@AGENTS.md` import: 리터럴 `@AGENTS.md` import는 없음. `AGENTS.md`를 읽으라는 산문 참조만 있음. 근거: `CLAUDE.md:1-4`.
- 리포 내 `*_v2.md`·`*_v3.md` 잔여: 있음. `docs/handoff/mira_handoff_v3.md`, `docs/payment_policy/payment_policy_confirmed_v2.md`, `docs/payment_policy/payment_policy_confirmed_v3.md`, `docs/payment_policy/payment_policy_open_v2.md`, `docs/payment_policy/payment_policy_open_v3.md`.
- `docs/go-live-checklist.md`의 "프로덕션 Postgres major = 18" 항목: 존재. 근거: `docs/go-live-checklist.md:73`, 요약에도 포함 `docs/go-live-checklist.md:189`.

## 1. Toss 어댑터 외부 API 사실

모든 항목은 레거시 구현 기준 — 공식 문서 재확인 필요.

- 엔드포인트: base는 `https://api.tosspayments.com/v1`. confirm은 `POST /payments/confirm`, refund는 `POST /payments/{paymentKey}/cancel`. 근거: `src/lib/payment/toss.ts:23`, `src/lib/payment/toss.ts:149-157`, `src/lib/payment/toss.ts:173-184`. 재확인 주제: 토스 결제 승인 API, 결제 취소 API.
- 인증: 서버 secret을 `Basic base64(secretKey + ":")`로 만든다. 근거: `src/lib/payment/toss.ts:130-133`; refund 테스트가 Authorization 값을 고정한다. 근거: `src/lib/payment/__tests__/toss.test.ts:93-96`. 재확인 주제: 토스 API 인증 방식.
- confirm 요청 shape: `{ paymentKey, orderId, amount }`, `Content-Type: application/json`, `Authorization` 포함. confirm idempotency header는 없음. 근거: `src/lib/payment/toss.ts:149-157`. 재확인 주제: 결제 승인 요청 파라미터, 멱등 지원 여부.
- confirm 응답 매핑: HTTP 실패면 `FAILED`와 `data.message` 우선 errorMessage, 성공이면 `paymentKey`와 `secret`을 `providerWebhookSecret`으로 저장할 수 있게 반환. 근거: `src/lib/payment/toss.ts:158-170`; 테스트: `src/lib/payment/__tests__/toss.test.ts:68-80`. 재확인 주제: 결제 승인 응답 필드, `secret` 의미.
- refund 요청 shape: `{ cancelReason, currency }` 기본, 부분 취소일 때만 `cancelAmount` 포함. `Idempotency-Key` header를 넣는다. 근거: `src/lib/payment/toss.ts:65-71`, `src/lib/payment/toss.ts:173-184`; 테스트: 전액 취소는 `cancelAmount` 없음 `src/lib/payment/__tests__/toss.test.ts:83-99`, 부분 취소는 최소단위 정수 그대로 `src/lib/payment/__tests__/toss.test.ts:102-112`. 재확인 주제: 취소 API 전액/부분 취소 규칙, 멱등 키 헤더.
- refund 응답 매핑: `cancels` 배열의 마지막 취소를 보고 `transactionKey`, `cancelAmount`, `refundableAmount`, `cancelStatus`를 매핑한다. `cancelStatus !== "DONE"`이면 `PENDING`, 아니면 `SUCCEEDED`. 근거: `src/lib/payment/toss.ts:43-57`, `src/lib/payment/toss.ts:85-95`. 재확인 주제: 취소 응답의 `cancels`, `cancelStatus`, 잔액 필드.
- 에러 처리: Toss API 응답이 객체가 아니면 throw, HTTP 실패 refund는 `FAILED`와 `data.message` 우선. 근거: `src/lib/payment/toss.ts:59-62`, `src/lib/payment/toss.ts:74-82`; 테스트: `src/lib/payment/__tests__/toss.test.ts:115-126`. 재확인 주제: 오류 응답 shape.
- 웹훅 파싱: `PAYMENT_STATUS_CHANGED`만 지원하고 `data.orderId/paymentKey/status/totalAmount/currency/secret` 및 `tosspayments-webhook-transmission-id`를 추출한다. 근거: `src/lib/payment/toss.ts:98-123`, `src/lib/payment/toss.ts:191-207`; 테스트: `src/lib/payment/__tests__/toss.test.ts:129-164`. 재확인 주제: 토스 웹훅 이벤트 payload와 재전송 식별자.

재사용 가치: 실제 HTTP 경계 shape, Basic 인증 조립, 취소 전액/부분 body 차이, `secret` 저장 후 웹훅 검증에 쓰는 흐름은 외부와 맞닿은 지식이다. 단 전부 공식 문서 재확인 후 신 코어에 반영.

## 2. PayPal 어댑터 외부 API 사실

모든 항목은 레거시 구현 기준 — 공식 문서 재확인 필요.

- API base: sandbox `https://api-m.sandbox.paypal.com`, live `https://api-m.paypal.com`; `PAYPAL_ENV === "live"`일 때만 live. 근거: `src/lib/payment/paypal.ts:22-47`. 재확인 주제: PayPal Orders/Payments API base URL.
- OAuth: `POST /v1/oauth2/token`, Basic client id/secret, `grant_type=client_credentials`, `access_token` 필수, `expires_in`으로 메모리 캐시. 근거: `src/lib/payment/paypal.ts:260-276`; 테스트: OAuth URL `src/lib/payment/__tests__/paypal.test.ts:109-119`. 재확인 주제: OAuth 2.0 client credentials.
- Orders v2 create: `POST /v2/checkout/orders`, body `intent: "CAPTURE"`, `purchase_units[0].reference_id/custom_id = orderId`, `amount.currency_code/value`. Header는 `Authorization`, `Content-Type`, `PayPal-Request-Id`, `Prefer: return=representation`. 근거: `src/lib/payment/paypal.ts:130-141`, `src/lib/payment/paypal.ts:172-179`, `src/lib/payment/paypal.ts:228-238`; 테스트: `src/lib/payment/__tests__/paypal.test.ts:109-131`. 재확인 주제: Orders v2 create order, idempotency header, amount object.
- Orders v2 capture: `POST /v2/checkout/orders/{paypalOrderId}/capture`, empty JSON body, `PayPal-Request-Id`; 응답 최상위 `status === "COMPLETED"`이고 purchase unit 안의 첫 `COMPLETED` capture가 있어야 성공. 근거: `src/lib/payment/paypal.ts:182-203`; 테스트: `src/lib/payment/__tests__/paypal.test.ts:134-159`. 재확인 주제: Orders v2 capture response structure.
- Payments refund: `POST /v2/payments/captures/{captureId}/refund`, 부분 환불은 `amount.currency_code/value`, 전액 환불은 빈 JSON body. 근거: `src/lib/payment/paypal.ts:144-151`, `src/lib/payment/paypal.ts:206-225`; 테스트: 부분 `src/lib/payment/__tests__/paypal.test.ts:172-183`, 전액 JPY `src/lib/payment/__tests__/paypal.test.ts:186-199`. 재확인 주제: Captures refund full/partial semantics.
- 에러 매핑: HTTP 실패 또는 capture 미완료는 `FAILED`, `message` 우선, 없으면 `name`, 없으면 fallback. 근거: `src/lib/payment/paypal.ts:73-75`, `src/lib/payment/paypal.ts:191-196`, `src/lib/payment/paypal.ts:245-257`; 테스트: `src/lib/payment/__tests__/paypal.test.ts:162-169`, `src/lib/payment/__tests__/paypal.test.ts:202-210`. 재확인 주제: 오류 응답 shape.
- 금액 변환: `CURRENCY_META` decimals 기반. zero-decimal이면 그대로 문자열화, USD 등 decimals > 0이면 divisor로 나누어 `toFixed(decimals)`. 역파싱은 숫자/소수 형식만 받고 통화 decimals 초과 소수부를 거부한 뒤 최소단위 정수로 복원. 근거: `src/lib/payment/paypal.ts:49-64`; 테스트: USD/Jpy 왕복 `src/lib/payment/__tests__/paypal.test.ts:85-106`. 재확인 주제: PayPal currency amount decimal rules, zero-decimal currency handling.
- 라우팅 지식: US/JP live 마켓이면 PayPal, KR live는 Toss, live 목록 밖은 mock. 근거: `src/lib/payment/__tests__/paypal.test.ts:214-231`. 재확인 주제: 내부 라우팅은 신 코어 설계 입력이며 PayPal 공식 문서 대상은 아님.

재사용 가치: OAuth, Orders create/capture, Payments refund, `PayPal-Request-Id`, amount decimal 왕복은 외부 API와 맞닿은 지식이다. 공식 문서 재확인 후에만 반영.

## 3. 웹훅 검증 지식

### PayPal

- PayPal 웹훅은 헤더 5종을 요구한다: `PAYPAL-AUTH-ALGO`, `PAYPAL-CERT-URL`, `PAYPAL-TRANSMISSION-ID`, `PAYPAL-TRANSMISSION-SIG`, `PAYPAL-TRANSMISSION-TIME`. 누락 시 401. 근거: `src/lib/payment/paypal-webhook-strategy.ts:104-112`, `src/lib/payment/paypal-webhook-strategy.ts:131-135`.
- 검증 절차는 OAuth token 발급 후 `POST /v1/notifications/verify-webhook-signature` 호출. body는 위 헤더 5종, `PAYPAL_WEBHOOK_ID`, 원본 webhook event JSON. `verification_status === "SUCCESS"`만 통과. 근거: `src/lib/payment/paypal-webhook-strategy.ts:114-157`; 테스트가 verify body를 확인한다 `src/app/api/payments/paypal/webhook/route.test.ts:190-209`.
- 파싱은 `event_type`, `resource.id/status/custom_id/amount.currency_code/value`, transmission id를 정규화한다. 근거: `src/lib/payment/paypal-webhook-strategy.ts:58-101`, `src/lib/payment/paypal-webhook-strategy.ts:167-179`.
- recovery 입력으로 바꾸는 상태는 단 하나: `eventType === "PAYMENT.CAPTURE.COMPLETED"` 이고 `event.status === "COMPLETED"`일 때만 `status: "DONE"`으로 정규화한다. 근거: `src/lib/payment/paypal-webhook-strategy.ts:182-199`.
- PayPal `PENDING` capture status는 recovery input이 `null`이 되어 handler가 `ignored: true`로 200 응답하고 `processedAt`을 채운다. 근거: `src/lib/payment/webhook-handler.ts:93-105`, `src/app/api/payments/paypal/webhook/route.test.ts:253-260`. 정책 공백 후보였으나 사용자 헤더 기준 v5가 PENDING 처리 재판정을 보유.

### Toss

- Toss provider의 `handleWebhook`은 JSON 파싱과 필드 추출만 수행한다. 전송자 인증 자체는 strategy의 `authenticateDelivery: () => VALID`로 no-op이다. 근거: `src/lib/payment/toss.ts:191-207`, `src/lib/payment/toss-webhook-strategy.ts:77-82`.
- Toss 이벤트 권한 확인은 저장된 Payment row 조회 후 `providerWebhookSecret` 비교, amount/currency 비교로 한다. 근거: `src/lib/payment/toss-webhook-strategy.ts:36-62`; 테스트: 유효 secret 복구 `src/app/api/payments/toss/webhook/route.test.ts:122-133`, 무효 secret 거부 `src/app/api/payments/toss/webhook/route.test.ts:162-170`, 저장 secret 없음 409 `src/app/api/payments/toss/webhook/route.test.ts:172-183`.
- Toss recovery 입력은 `event.status === "DONE"`이고 amount/currency/secret이 있을 때만 생성한다. 근거: `src/lib/payment/toss-webhook-strategy.ts:83-94`. DONE이 아닌 상태는 200으로 수신 인정하고 주문 변경 없이 processed 처리한다. 근거: `src/app/api/payments/toss/webhook/route.test.ts:192-200`.
- 의문 플래그: 전송자 인증 no-op + 저장 secret 비교가 토스 공식 권고와 일치하는지는 단정하지 않는다. 공식 문서 재확인 주제: 토스 웹훅 보안 모델, 결제 `secret` 검증 용도, 이벤트별 서명/인증 제공 범위.

### 공통 handler

- 멱등 기록 위치와 키: `PaymentWebhookEvent.transmissionId @unique`. 근거: `prisma/schema.prisma:430-441`; 생성은 provider/transmissionId/eventType/orderId/providerTransactionId/status만 저장한다. 근거: `src/lib/payment/webhook-handler.ts:64-84`.
- 원본 payload 저장 공백: schema와 migration에는 `raw` 컬럼이 있으나, create path가 `raw`를 쓰지 않는다. 근거: schema `prisma/schema.prisma:441`, migration `prisma/migrations/20260624044648_add_payment_webhook_events/migration.sql:15`, create path `src/lib/payment/webhook-handler.ts:69-77`.
- dedup 기준: 처리 여부가 아니라 `transmissionId` row 존재만으로 duplicate 200을 반환한다. 근거: `src/lib/payment/webhook-handler.ts:56-62`, `src/lib/payment/webhook-handler.ts:121-124`; PayPal/Toss 테스트가 같은 transmission id 재전송 200을 고정한다 `src/app/api/payments/paypal/webhook/route.test.ts:222-231`, `src/app/api/payments/toss/webhook/route.test.ts:151-160`.

## 4. 행동 명세 번역

구현 용어 없는 명세 문장과 출처, 신 코어 대응.

- 결제 완료 신호가 유효하면 주문은 결제완료 상태가 되고, 결제 기록이 남으며, 재고는 주문 수량만큼 한 번 차감되고, 구매자의 장바구니는 비워진다. 출처: `src/lib/payment/process.ts:79-100`, `src/lib/payment/__tests__/process.integration.test.ts:101-127`. 대응: confirmed v4 CORE-5 `payment_policy_confirmed_v4.md:89-95`, CORE-6 `payment_policy_confirmed_v4.md:96-102`. 단 레거시는 결제 전 Order를 만들기 때문에 CORE-1과 구조 충돌.
- 같은 결제 처리 요청이 같은 멱등 키로 반복되면 부수효과는 한 번만 발생하고 같은 성공 결과로 수렴한다. 출처: `src/lib/payment/process.ts:132-136`, `src/lib/payment/__tests__/process.integration.test.ts:177-212`. 대응: confirmed v4 CORE-3(b) `payment_policy_confirmed_v4.md:76-81`, open v4 §2.2 `payment_policy_open_v4.md:72-75`.
- 같은 주문에 결제 완료 시도가 동시에 들어와도 성공 결제는 하나만 남고 재고는 한 번만 차감된다. 출처: `src/lib/payment/__tests__/process.integration.test.ts:243-257`, `src/lib/payment/__tests__/process-reconciliation.integration.test.ts:229-247`. 대응: confirmed v4 CORE-6 `payment_policy_confirmed_v4.md:96-102`, open v4 §9 `payment_policy_open_v4.md:220-226`.
- 결제 개시가 외부 승인 대기 상태를 반환하면 주문, 재고, 장바구니, 결제 기록은 변하지 않는다. 출처: `src/lib/payment/__tests__/process-2phase.integration.test.ts:183-208`. 대응: 세션 생명주기/결제 실패 UX는 open v4 §7.4 입력 `payment_policy_open_v4.md:182-183`; 레거시 PENDING_PAYMENT Order 구조는 CORE-1과 충돌.
- PG capture가 서버 기대 금액, 통화, 주문 참조와 다르면 주문을 확정하지 않고 보상 환불/미확정 기록으로 전환한다. 출처: `src/lib/payment/capture-verification.ts:9-30`, `src/lib/payment/capture-reconciliation.ts:9-30`, `src/lib/payment/__tests__/process-2phase.integration.test.ts:259-293`. 대응: open v4 §3 불변식 3 `payment_policy_open_v4.md:93-96`, §2.3 `payment_policy_open_v4.md:77-80`.
- 웹훅은 인증/권한 확인을 통과한 뒤에만 이벤트를 기록하고 완료 복구를 실행한다. 출처: `src/lib/payment/webhook-handler.ts:108-129`, `src/lib/payment/__tests__/webhook-handler.test.ts:163-209`. 대응: open v4 §3-불변식5 `payment_policy_open_v4.md:99-103`.
- confirm 경로와 웹훅 복구 경로는 같은 성공 트랜잭션 효과로 수렴한다. 출처: confirm `src/lib/payment/process.ts:219-249`, webhook `src/lib/payment/webhook-recovery.ts:85-105`, 공유 `runSuccessTransaction` `src/lib/payment/process.ts:79-100`. 대응: confirmed v4 CORE-6 `payment_policy_confirmed_v4.md:96-102`.
- 로컬 완료 실패 후 자동 보상은 보상 시도 기록을 먼저 만들고, 같은 보상 키 재진입에서는 provider refund를 다시 호출하지 않는다. 출처: `src/lib/payment/reconciliation.ts:212-250`, `src/lib/payment/reconciliation-adjustment.ts:26-56`, `src/lib/payment/__tests__/process-reconciliation.integration.test.ts:357-385`. 대응: 헤더 기준 잔여 정책 공백 후보 중 "보상 키·선기록"으로 핸드오프/정책 문서가 보유.
- confirm과 웹훅의 보상은 같은 주문+PG거래 식별자에서 같은 자동환불 키로 수렴해야 한다. 출처: v7 §5 `docs/handoff/mira_handoff_v7.md:83`. 대응: 헤더 기준 잔여 정책 공백 후보 "보상 키".
- 관리자 환불은 성공 또는 부분환불된 결제만 대상으로 하며, 미확정 marker 결제는 관리자 환불 대상이 아니다. 출처: `src/lib/payment/admin-refund.ts:61-72`, v7 §5 `docs/handoff/mira_handoff_v7.md:84`. 대응: 헤더 기준 잔여 정책 공백 후보 "환불 상태 전제".
- 자동 보상 stuck 탐지는 marker PENDING을 신호로 삼는다. 출처: `src/lib/payment/reconciliation.ts:70-74`, `src/lib/payment/reconciliation.ts:134-149`, v7 §5 `docs/handoff/mira_handoff_v7.md:86`. 대응: 헤더 기준 잔여 정책 공백 후보 "dedup 기준"과 §7.1/§3-불변식5 확정 입력.
- `provider.initiate()`가 즉시 성공하고 그 뒤 로컬 성공 처리 실패가 나는 경로에는 보상/marker가 없으며, 현재 실 provider에서는 그 경로가 도달하지 않는다. 출처: v8 §5-5 `docs/handoff/mira_handoff_v8.md:98-102`; Toss initiate PENDING `src/lib/payment/toss.ts:136-139`, PayPal initiate PENDING `src/lib/payment/paypal.ts:172-180`. 대응: 사용자 헤더 기준 v5가 "완료 시맨틱" 재판정을 보유.

## 5. 반복 금지 함정

- PayPal capture `PENDING`을 조용히 처리 완료로 표시하고 복구하지 않는 흐름. 근거: `src/lib/payment/paypal-webhook-strategy.ts:188-190`, `src/lib/payment/webhook-handler.ts:97-105`, `src/app/api/payments/paypal/webhook/route.test.ts:253-260`. 정책 매핑: 헤더 기준 v5가 PENDING 처리 재판정 보유.
- 웹훅 원본 payload 미저장. `raw` 컬럼은 있으나 create path가 쓰지 않는다. 근거: `prisma/schema.prisma:441`, `src/lib/payment/webhook-handler.ts:69-77`. 정책 매핑: open v4 §7.5는 원본 페이로드 append-only 원장을 요구 `payment_policy_open_v4.md:185-186`.
- Toss 전송자 인증 no-op. 근거: `src/lib/payment/toss-webhook-strategy.ts:77-82`. 정책 매핑: open v4 §3-불변식5는 인증된 데이터/조회 API 원칙을 둔다 `payment_policy_open_v4.md:99-103`; 공식 토스 문서 확인 전 단정 금지.
- PENDING_PAYMENT Order 오염. 레거시는 주문 생성 시점에 `PENDING_PAYMENT` Order를 만든다. 근거: `src/lib/order/db.ts:78-104`, `src/lib/order/db.ts:136-141`. 정책 매핑: confirmed v4 CORE-1은 결제 성공 후 Order 생성 `payment_policy_confirmed_v4.md:59-65`.
- 웹훅 dedup이 `processedAt`이 아니라 transmission row 존재 기준이다. 실패/미처리 row가 생긴 뒤 동일 transmission 재전송이 오면 recovery 전에 duplicate 200이 될 수 있다. 근거: `src/lib/payment/webhook-handler.ts:56-62`, `src/lib/payment/webhook-handler.ts:121-124`, authorize 실패시 row는 남고 processedAt null `src/lib/payment/__tests__/webhook-handler.test.ts:195-209`. 정책 매핑: 헤더 기준 잔여 정책 공백 후보 "dedup 기준".
- Payment provider 거래 식별자 단독 유니크가 없다. `Payment.idempotencyKey @unique`만 있고 `(provider, providerTransactionId)` 유니크는 없다. 근거: `prisma/schema.prisma:373-394`; open v4는 `(provider, paymentKey)` 복합 유니크를 권고 `payment_policy_open_v4.md:72-75`.
- 자동 보상 선기록은 이중환불을 막지만, 선기록 후 refund 전 크래시에서는 재진입이 provider refund를 다시 호출하지 않아 운영 처리가 필요하다. 근거: `src/lib/payment/__tests__/process-reconciliation.integration.test.ts:373-385`, v7 설명 `docs/handoff/mira_handoff_v7.md:71-75`. 정책 매핑: 헤더 기준 잔여 정책 공백 후보 "선기록".
- initiate 즉시성공 provider를 실결제에 추가하면 레거시 보상 공백이 실돈 경로로 부활한다. 근거: `docs/handoff/mira_handoff_v8.md:98-102`. 정책 매핑: 헤더 기준 v5가 완료 시맨틱 재판정 보유.

## 6. 사실 확정 2건

### 6-a. 주문 생성 tx의 재고 차감 여부

- `src/lib/order/db.ts`의 주문 생성 트랜잭션에는 재고 차감이 없다. 이 트랜잭션은 Order 생성, OrderItem 생성, ManufacturingRequest 생성만 수행한다. 근거: `src/lib/order/db.ts:65-105`.
- 주문 생성 호출 체인: `createOrderAction` → `createOrder` → `db.$transaction(runCreateOrderTx)`. 근거: `src/app/actions/order.ts:14-28`, `src/lib/order/db.ts:109-141`.
- 재고 차감과 카트 비우기는 결제 성공 트랜잭션에서 실행된다. `runSuccessTransaction`이 각 item에 대해 `decrementStock`, Order `PAID` 전이, `cartItem.deleteMany`, `payment.create`를 같은 DB transaction 안에서 수행한다. 근거: `src/lib/payment/process.ts:58-68`, `src/lib/payment/process.ts:79-100`.
- 결제 성공 tx 호출 체인 1: `confirmPayment` → `handleConfirmedSuccess` → `runSuccessTransaction`. 근거: `src/lib/payment/process.ts:283-299`, `src/lib/payment/process.ts:219-249`.
- 결제 성공 tx 호출 체인 2: `recoverPaymentFromWebhook` → `recoverDonePayment` → `runSuccessTransaction`. 근거: `src/lib/payment/webhook-recovery.ts:85-112`.
- 결제 성공 tx 호출 체인 3: `processPayment`의 provider 즉시 `SUCCEEDED` 경로 → `handleSuccess` → `runSuccessTransaction`. 실 provider에서는 v8 기준 도달 불가로 기록됨. 근거: `src/lib/payment/process.ts:257-280`, `src/lib/payment/process.ts:162-191`, `docs/handoff/mira_handoff_v8.md:98-102`.

### 6-b. `src/lib/order/snapshot.ts` import 전수와 동결 존 판정

- `src/lib/order/snapshot.ts` 자체 import는 `@prisma/client`의 `Prisma` 타입과 `./types`의 `SnapshotData` 타입뿐이다. 근거: `src/lib/order/snapshot.ts:1-2`.
- export는 `parseSnapshotData(raw)`와 `snapshotToJson(data)` 두 개. 근거: `src/lib/order/snapshot.ts:16-39`.
- import하는 곳: `src/lib/order/db.ts`가 `parseSnapshotData`, `snapshotToJson` 둘 다 사용한다. 근거: `src/lib/order/db.ts:12`, `src/lib/order/db.ts:97`, `src/lib/order/db.ts:205`.
- import하는 곳: `src/lib/order/list.ts`가 사용자 주문 목록의 대표 snapshot 파싱에 `parseSnapshotData`를 쓴다. 근거: `src/lib/order/list.ts:5`, `src/lib/order/list.ts:30-33`.
- 별도 어드민 read model에는 같은 이름의 로컬 parser가 있고 `src/lib/order/snapshot.ts`를 import하지 않는다. 근거: `src/lib/admin-orders-data.ts:145-155`, `src/lib/admin-orders-data.ts:269`.
- FROZEN 판정: AGENTS §4.5의 동결 글롭은 `src/lib/order/db.ts`를 포함하지만 `src/lib/order/snapshot.ts`는 명시하지 않는다. 근거: `AGENTS.md:83-89`. 따라서 `snapshot.ts`는 동결 존 밖이다.
- 컷오버 생존 판정: `db.ts` 경유 쓰기 용도는 컷오버에서 죽거나 재배선될 가능성이 높다. `list.ts` 경유 읽기 용도는 현 Order snapshot shape를 계속 읽는 동안 살아남는다. 단 신 스키마 snapshot shape가 바뀌면 재판정 필요.

## 7. 스키마 현황 요약

- `Order`: `status` 기본 `PENDING_PAYMENT`, `marketCode`, `currency`, `totalAmount`, `shippingFee`, 주소 필드, `items`, `payments`. 근거: `prisma/schema.prisma:251-295`.
- `OrderItem`: `quantity`, `unitPrice`, `snapshotData`, `ManufacturingRequest?`. 근거: `prisma/schema.prisma:337-349`.
- `ManufacturingRequest`: `orderItemId @unique`, `status`, `hairCadKey`, `notes`, timestamps. 근거: `prisma/schema.prisma:355-364`.
- `Payment`: 한 주문에 여러 payment 가능(`Order.payments Payment[]`), `idempotencyKey @unique`, amount/currency, provider fields. 근거: `prisma/schema.prisma:371-394`.
- `PaymentAdjustment`: amount/currency/reason/status/idempotencyKey/refundableAmount, `@@unique([paymentId, providerRefundId])`. 근거: `prisma/schema.prisma:401-423`.
- `PaymentWebhookEvent`: `transmissionId @unique`, provider/event/order/transaction/status/receivedAt/processedAt/raw. 근거: `prisma/schema.prisma:430-441`.
- 마이그레이션 이력: Payment 생성 `prisma/migrations/20260614103019_add_payment/migration.sql:15-35`, PaymentAdjustment 생성 `prisma/migrations/20260624030522_add_payment_adjustments/migration.sql:27-54`, WebhookEvent 생성 `prisma/migrations/20260624044648_add_payment_webhook_events/migration.sql:1-21`.

## 8. 부검 기록용: 정책 v4와 갈라지는 지점

- v4 CORE-1은 결제 성공 후 Order 생성이지만 레거시는 체크아웃에서 `PENDING_PAYMENT` Order를 먼저 만든다. 근거: 정책 `payment_policy_confirmed_v4.md:59-65`, 코드 `src/lib/order/db.ts:78-104`.
- v4 CORE-6은 confirm/웹훅이 같은 완료 트랜잭션을 공유하는 방향이나, 레거시는 `runSuccessTransaction`은 공유하지만 세션 행 잠금/세션 유니크 기반 설계는 없다. 근거: 정책 `payment_policy_confirmed_v4.md:96-102`, open v4 §9 `payment_policy_open_v4.md:220-226`, 코드 `src/lib/payment/process.ts:79-100`.
- v4 CORE-3(b)/open v4 §2.2는 paymentKey와 session id 유니크를 요구하나 레거시는 `Payment.idempotencyKey @unique`와 webhook `transmissionId @unique` 중심이다. 근거: 정책 `payment_policy_confirmed_v4.md:76-81`, open `payment_policy_open_v4.md:72-75`, schema `prisma/schema.prisma:373-394`, `prisma/schema.prisma:430-441`.
- open v4 §7.5는 원본 페이로드 포함 원장을 요구하나 레거시는 raw 컬럼을 쓰지 않는다. 근거: 정책 `payment_policy_open_v4.md:185-186`, 코드 `src/lib/payment/webhook-handler.ts:69-77`.
- MFG-1은 PAID 트랜잭션 안 MR 생성을 확정하지만 레거시는 결제 전 OrderItem 생성 시 MR도 생성한다. 근거: 정책 `payment_policy_confirmed_v4.md:108-120`, 코드 `src/lib/order/db.ts:92-99`.
