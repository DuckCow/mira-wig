# 결제 라이브 전환 체크리스트 (Go-Live)

> KR(토스) + US·JP(PayPal) 결제를 **실제 돈**으로 켜기 전 점검 목록.
> 코드는 라이브 준비 완료 상태이며, 아래는 대부분 **계약·등록·배포·키 교체**(사업/운영 트랙)다.
> 작업 순서는 의존성 기준으로 배열했고, **임계경로는 토스 카드사 심사(최대 14일)**다.

---

## 0. 임계경로 — 지금 즉시 걸어라

코드와 무관하게 *지금* 신청해야 전체 일정이 안 막힌다. 승인 대기 동안 다른 작업 병행.

- [ ] **토스 전자결제 계약 신청** — 심사: 토스 1~2일 + **카드사 최대 14일** → 라이브 키(`live_ck`/`live_sk`) + 상점아이디(MID) 발급. (가발 판매 업종 제약 없는지 확인.)
- [ ] **PayPal 비즈니스 계정 + 라이브 앱 생성** → `live` client id/secret. **US·JP 통화(특히 JPY) 활성화** 여부 확인(계정 심사에 걸릴 수 있음).
- [ ] **심사용 사이트 정보 준비**(토스/PayPal 심사 요구 항목) — 사업자 정보, **통신판매업 신고**, 고객센터 연락처, **배송/교환/환불 정책**, **개인정보처리방침**, **이용약관**. 미리 준비하면 심사 기간 안 늘어난다.

---

## 1. 토스 (KR) — 라이브 전환

### 1-1. 계약·키
- [ ] 전자결제 계약 + 심사 통과 → `live_` 키 + MID 수령.

### 1-2. 웹훅 등록
- [ ] 개발자센터 → 웹훅 등록 → 이벤트 **`PAYMENT_STATUS_CHANGED`** → URL **`POST https://<도메인>/api/payments/toss/webhook`**.
- [ ] 웹훅 URL **외부 온라인 접근 가능** + **리다이렉트 없음**(301이면 전송 실패) + **10초 내 200 응답**(코드상 충족, 인프라 확인). trailing-slash 주의.
- [ ] 방화벽 **인바운드 허용** + **TLS 1.2+**.

### 1-3. 프로덕션 `.env` (커밋 금지 — `.env`만)
- [ ] `NEXT_PUBLIC_TOSS_CLIENT_KEY` = `live_ck_...`
- [ ] `TOSS_SECRET_KEY` = `live_sk_...` (**클라이언트/시크릿은 동일 MID 세트** — 섞으면 `INVALID_API_KEY`)
- [ ] `PAYMENT_LIVE_MARKETS` 에 `KR` 포함 (→ §3 합본 예시)

### 1-4. 첫 실거래 검증 (라이브에서 1회)
- [ ] 소액 1건: 결제창 → **PAID** (DB 확인)
- [ ] ⚠️ **confirm 응답의 `secret`이 실제 저장되는지** — 라이브 응답에도 secret이 흐르는지 확인. **웹훅 검증 전체가 여기 달림**(아래 §5-1).
- [ ] 웹훅 1건 실수신 — 개발자센터 웹훅 전송 기록에서 확인.

> ❓ **확인 필요(출처 미확정)**: "국내 카드결제는 `CANCEL_STATUS_CHANGED` 미발송"이라고 들었으나 **토스 공식 문서엔 해당 이벤트가 등록 가능으로 표기**되고 "국내 카드 미발송"은 문서에서 직접 확인되지 않음. **토스 영업/지원에 확인** 후 외부취소 반영 정책(§6) 확정할 것. ([토스 웹훅 이벤트](https://docs.tosspayments.com/guides/v2/webhook))

---

## 2. PayPal (US·JP) — 라이브 전환

### 2-1. 계정·키
- [ ] 비즈니스 계정 + 라이브 앱 → `live` client id/secret. US·JP(JPY) 통화 활성 확인.

### 2-2. 웹훅 등록
- [ ] 대시보드 → 웹훅 등록 → 이벤트 **`PAYMENT.CAPTURE.COMPLETED`** → URL **`POST https://<도메인>/api/payments/paypal/webhook`**.
- [ ] 발급된 **`PAYPAL_WEBHOOK_ID`** 확보 → `.env`에(서명 검증에 **필수**).
- [ ] ⚠️ **그 Webhook ID가 sandbox가 아니라 *라이브* 앱의 것인지 확인** (sandbox/live가 다름 — 섞으면 서명 검증 실패).

### 2-3. 프로덕션 `.env` (커밋 금지 — `.env`만)
- [ ] `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` = 라이브값
- [ ] `NEXT_PUBLIC_PAYPAL_CLIENT_ID` = 라이브 client id
- [ ] `PAYPAL_WEBHOOK_ID` = §2-2에서 발급된 **라이브** 값
- [ ] `PAYPAL_ENV` = `live`
- [ ] `PAYMENT_LIVE_MARKETS` 에 `US,JP` 포함 (→ §3 합본 예시)

### 2-4. 첫 실거래 검증 (라이브에서 1회)
- [ ] ⚠️ **반드시 *새 배포 이후 생성한 주문*으로 테스트** — PayPal 웹훅 복구는 `resource.custom_id === orderId`로 주문을 찾는데, `custom_id`는 **이번 배포부터** create order에 들어간다. 배포 *전* 생성된 PayPal order는 웹훅 복구에서 빗나간다.
- [ ] **US 1건**: 버튼 → 승인 → capture → **DB로 PAID** (샌드박스에선 됐지만 라이브 키로 1회)
- [ ] **JP 1건**: 동일 + 금액이 **¥ 정수**(×100 오류 없이)
- [ ] ⚠️ **유효 서명 웹훅 실수신이 401이 아니라 *복구*로 도는지** — 샌드박스/localhost에선 PayPal 실발신을 못 받아 못 닫은 경로(아래 §5-2).

---

## 3. 배포 & 환경변수 — 라이브 차단 항목 포함

### 3-1. ⚠️ 배포 (빠지면 결제는 되는데 웹훅/복구가 죽는다)
웹훅·복구는 `Payment.providerWebhookSecret`, `PaymentWebhookEvent` 스키마에 의존한다. 프로덕션 DB에 migration이 안 올라가면 **결제 화면은 정상인데 웹훅/복구만 조용히 실패**한다(부분 실패라 안 보임).

- [ ] 프로덕션 배포 전 **`prisma migrate deploy`** 완료 (DB 스키마 최신).
- [ ] **배포된 커밋 기준 `npm run verify` 초록**.

### 3-2. 공통 env (결제 전용 아님 — 실거래 필수)
- [ ] `NEXTAUTH_URL` = `https://<프로덕션 도메인>` (**콜백 세션 작동에 필수** — 결제 콜백이 cross-site 세션 쿠키에 의존).
- [ ] `NEXTAUTH_SECRET` = 프로덕션 시크릿.
- [ ] 웹훅/콜백 URL이 **실제 외부에서 접근 가능**한지.

### 3-3. 게이트 동작 — `PAYMENT_LIVE_MARKETS` (실수 방지)
콤마 구분 문자열. 코드 동작: `KR → Toss`, `US/JP → PayPal`.

| 값 | 동작 |
|----|------|
| (비어있음/미설정) | **전 마켓 mock** — 커밋되는 기본값. 실수 라이브화 방지. |
| `KR` 포함 | KR → 토스(live) |
| `US` 포함 | US → PayPal(live) |
| `JP` 포함 | JP → PayPal(live) |

- [ ] **전체 라이브면**: `PAYMENT_LIVE_MARKETS="KR,US,JP"`
- [ ] **커밋되는 `.env.example`/기본값은 항상 mock** — 라이브 값은 **프로덕션 `.env`에만**.
- [ ] 라이브 키는 `live_`(토스) / `PAYPAL_ENV=live`(PayPal)인지 재확인.

---

## 4. 보안 — 항상

- [ ] **시크릿 키가 repo/버전관리에 절대 노출 안 됨** — 프로덕션 `.env`만. (`TOSS_SECRET_KEY`, `PAYPAL_CLIENT_SECRET`, `NEXTAUTH_SECRET` 등)
- [ ] `.env`가 `.gitignore`에 있는지 (`git status`에 `.env` 안 뜨는지).

---

## 5. ⚠️ 코드로 못 닫고 라이브 첫거래로 미룬 것 (반드시 확인)

환경 제약으로 런타임에서 못 닫은 2개. **코드 결함이 아니라** 라이브에서만 확인 가능한 자리.

### 5-1. 토스 라이브 `secret` 흐름
- 샌드박스에선 확인됨. **라이브 confirm 응답에도 `secret`이 와서 `Payment.providerWebhookSecret`에 저장되는지**는 첫 실거래로만 확인 가능.
- 안 오면 → 토스 웹훅 검증(본문 secret 대조)이 막힌다 → 토스에 문의/대응.
- [ ] §1-4에서 확인.

### 5-2. PayPal 유효 서명 웹훅 수신
- localhost로 PayPal 실발신이 안 와서 **서명 *실패* 분기만** 직접 POST로 닫음. 유효 서명 → 복구는 행동 테스트(verify mock)로만 검증됨.
- 라이브/터널에서 PayPal 실발신이 **복구로 도는지**(401 아님) 확인 필요. (+ §2-4: 새 배포 후 주문이라야 `custom_id` 매핑됨.)
- [ ] §2-4에서 확인.

---

## 5-bis. 코드로 닫아야 하는 것 (라이브 전 필수 — §5와 다른 계열)

§5는 "코드는 옳고 라이브에서 확인만" 하는 자리였다. 아래는 반대 —
코드에 실재하는 결함/공백이라 라이브 전 수정이 필요하다. (§6-2 일반 규약
추출과도 별개: 이건 실돈 운영 안전이라 못 미룬다.)

### 5-bis-1. compensate 자기 재시도 이중환불 창 (STRICT 결제 코어)
- 증상: `compensateUnconfirmedPayment`가 `provider.refund` 성공 후 auto-refund
  adjustment 기록 전 크래시하면, 다음 진입 시 `auto-refund:${orderId}:${providerTransactionId}`
  키가 없어 `provider.refund`가 재차 나감 → 실고객 이중환불. confirm·웹훅 복구가
  공유하는 창(웹훅 종국-실패 대칭화가 진입점을 늘렸으나 창 자체는 하나).
- 현 가드: 기록된 auto-refund adjustment 존재 확인뿐. provider transaction 단위
  기존 환불 조회나 provider 상태 조회는 없음.
- 필요: `provider.refund` 호출 **전**, provider transaction 단위로 기존 환불 여부를
  (조정기록 or provider 상태 조회로) 확인하는 가드 추가. STRICT 결제 코어라 기능과
  분리된 독립 과제. compensate는 confirm도 쓰는 공유 코어 — 변경 시 confirm 회귀를
  행동 테스트로 고정.
- [ ] 별도 STRICT 과제 착수 → 행동 테스트(refund 성공 후 기록 전 크래시 시뮬 →
  재진입 시 provider.refund 재호출 안 됨)로 고정.

### 5-bis-2. 미확정 marker 능동 가시화 (어드민 UI — 강도는 5-bis-1 아래)
- 증상: 웹훅 종국-실패가 200으로 종결될 때 남기는 PENDING reconciliation marker +
  FAILED auto-refund adjustment(=고객 돈 PG에 묶임)를 어드민 **주문 상세를 열면**
  볼 수 있으나(Payment/adjustment 전부 렌더됨), **목록/대시보드에 능동적으로 안 뜬다.**
  목록은 "결제 대기"까지만 → 정상 이탈 주문 더미에 섞여 잠복, 인지가 우연에 의존.
- 필요: `unconfirmed:` Payment 또는 `auto-refund`/`FAILED` adjustment가 있는 order를
  목록 배지/조회 신호 하나로 드러냄. 새 대시보드 아니라 기존 주문 목록 플래그 수준.
  (greppable 로그 `PAYMENT_AUTO_REFUND_FAILED`·`PAYMENT_RECONCILIATION_REQUIRED`는
  있으나 능동 신호 아님 — 모니터링 붙기 전엔 사실상 안 보임.)
- [ ] 어드민 주문 목록/상세에 미확정·환불실패 플래그 추가.

## 6. 알려진 후속 (라이브 차단 아님 — 백로그)

- **외부 취소 반영**: 토스 `CANCEL_STATUS_CHANGED` 발송 조건을 §1-4 확인 결과에 따라 확정. 자동 반영이 안 되는 범위는 폴링/대사로 보강.
- **OAuth 토큰 캐싱**(PayPal): 현재 호출마다 토큰 발급 가능 — 레이턴시 보이면 만료 전 재사용으로 하드닝.
- **`payOrderAction` pending 반환의 `error` 필드 잔재** 정리.

---

## 7. JP 현지 PG — 미래 확장 슬롯 (별도 트랙)

**확정이지만 나중.** 가발 입점 심사 + 일본 준비(특상법·일본어·엔화) 통과 후, 그리고 **KG이니시스 일본 / Eximbay 중 확정** 후 진행.

코드 토대는 이미 열려 있음:
- 웹훅: `WebhookValidationStrategy` 인터페이스 + 공통 helper(`handlePaymentWebhook`). **Mock strategy로 "제3 전략 무수술 삽입" 단위테스트 보증됨** → JP PG는 strategy 하나 추가로 끝.
  - **Eximbay 검증 (후보 — 공식 문서 기반 *가설*, 확정 시 재확인)**: 헤더 `eximbay-webhook-signature` HMAC-SHA256(로컬) + `status_url` 백엔드 통지(transid 멱등) + FGKey API(`/v1/payments/verify`). → `authenticateDelivery`(HMAC) / `authorizeEvent`(FGKey)에 매핑될 것으로 예상.
  - **KG이니시스 일본 검증**: 미확인 — **확정 시 공식 문서로 확인 후 strategy 작성**.
- 결제 진입(**공존** — JP에 PayPal + 현지 PG 동시): factory를 `(marketCode)` → `(marketCode, 선택수단)`으로 확장 + **결제수단 선택 UI** + JP PG adapter(initiate/confirm/refund). 이건 웹훅 helper와 별개 층(앞단)이라 PG 확정 시점에 설계.
- 비동기 완료(콘비니류 pending→paid via webhook) 라이프사이클: `recoverPaymentFromWebhook` + `PENDING_PAYMENT`/unconfirmed 경로가 이미 그릇 제공. 콘비니 특유 디테일(바코드·만료)은 PG 도입 시.

---

## 부록: 빠른 참조

| 항목 | 토스 (KR) | PayPal (US·JP) |
|------|-----------|----------------|
| 웹훅 이벤트 | `PAYMENT_STATUS_CHANGED` | `PAYMENT.CAPTURE.COMPLETED` |
| 웹훅 라우트 | `/api/payments/toss/webhook` | `/api/payments/paypal/webhook` |
| 검증 방식 | 본문 `secret` ↔ 저장 secret 대조 | 헤더 서명 → verify API |
| 라이브 키 표식 | `live_` 접두사 | `PAYPAL_ENV=live` |
| 첫거래 핵심 확인 | secret 저장 + 웹훅 수신 | (새 배포 후 주문) DB PAID + 유효서명 웹훅 복구 |

**라이브 차단 항목 요약**: ① 토스 카드사 심사(§0) ② `prisma migrate deploy`(§3-1) ③ `NEXTAUTH_URL`/`SECRET`(§3-2) ④ 웹훅 URL 외부 접근 가능(§1-2/§2-2) ⑤ PayPal 라이브 Webhook ID(§2-2).
