# mira 프로젝트 인계 문서 v4 (Handoff)

**새 세션의 Claude에게**: 너는 mira를 이어서 작업한다. 역할 \= **설계 판단 \+ Codex 프롬프트 작성 \+ 결과 리뷰**(코드는 직접 안 쓴다 — 줄 프롬프트를 만들고 결과를 검토). 사람이 오케스트레이터·최종 결정·커밋, Codex가 구현·정찰·런타임. **이 문서 \= "어디까지 왔나 \+ 왜 \+ 다음"(누적 스냅샷).** 중복을 피하려 아래로 **위임**한다:

- 스택·아키텍처·STRICT 존·금액 규칙·결제 코어 구조·웹훅 strategy → **`AGENTS.md`**(Codex 자동 적용, 코드측 SSOT).  
- 데이터 모델 필드 → **`prisma/schema.prisma` \+ migration**(SSOT — 산문 요약 신뢰 말고 스키마를 읽어라).  
- 협업 방식("어떻게") → **`docs/collaboration-protocol.md`**.  
- 라이브 전환 절차 → **`docs/go-live-checklist.md`**. **새 `[dev]` 채팅 시작**: 이 문서 \+ `docs/collaboration-protocol.md`를 붙이고(필요 시 `AGENTS.md`도), "다음 작업"의 **read-only 정찰부터**. 코드 사실은 정찰로 갱신, 결정 근거는 이 문서가 보존. 작업 언어: 한국어. repo: `/Users/duckcow/Documents/mira` (github: DuckCow/mira-wig, private, main).

---

## 1\. 프로젝트

- mira \= **AI 커스텀 가발 e-커머스.** 사용자가 자기 사진에 가발 스타일을 합성해 써보고(피팅), 마음에 들면 주문 → 제작.  
- 온라인 전용 → "안 맞으면 어쩌지"가 주 구매 장벽 → **피팅이 핵심 차별점**. 단 피팅은 주문 경로상 *필수가 아님*(피팅 없이 browse→cart→checkout→pay 완결). **피팅과 커머스는 병렬 출시 트랙**(서로 임계경로 아님).  
- 글로벌 지향, 1차 **KR·US·JP** 3개국. MVP 3대 플로우: 피팅 · 브라우즈 · 전환(주문).  
- **진짜 해자는 try-on이 아니라 커스터마이징→주문→제작 파이프라인.**

---

## 2\. 지금 위치 (한눈에)

- ✅ **커머스 코어**(browse/auth/주소/장바구니/주문/마켓 가격) — 완료(v1\~v2).  
- ✅ **스토리지 실물화** — 카탈로그 이미지 실 S3(`catalogStorage`), 피팅은 항상 mock(`fittingStorage`). 분리 런타임 검증됨.  
- ✅ **어드민** — 가드 \+ 카탈로그 CRUD \+ 마켓 가격/가용성/갭 진단 \+ **주문 관리(조회·전진 전이)**.  
- ✅ **결제 실 통합** — **KR(토스) \+ US·JP(PayPal) 완성, 코드상 라이브 준비완료.** (이번 세션 핵심 산출.)  
- ✅ **협업 인프라 문서화** — AGENTS.md 보강 / collaboration-protocol / go-live-checklist / 이 핸드오프.  
- ⏳ **다음 \= 관리자 환불(3단계, 설계 잠금됨)** → 취소(4단계) → AI 피팅 실연동.  
- 🚫 **막힌 것(founders 트랙)**: 토스 PG 온보딩(심사), 피팅 Phase 0(VTO 벤더·생체 컴플라이언스), 법무, 도메인 확정. (§9)

---

## 3\. 완료된 것 (누적)

### 3-1. 커머스 코어 (v1\~v2)

browse(카탈로그+필터), auth(Google OAuth, JWT, `session.user.role`), 국제 주소(KR/US/JP), 장바구니, 주문(가격 스냅샷·재고 재검증·원자 차감·idempotency·카트 비우기 한 트랜잭션), 피팅 플로우(mock-first: 업로드→폴링→비포애프터), 마켓 기반(Market/VariantMarketPrice/WigStyleMarket).

### 3-2. 스토리지 (v2)

- 실 S3(카탈로그 버킷) — CORS·IAM 최소권한·presigned PUT/GET. `catalogStorage`(env로 S3/mock) / `fittingStorage`(항상 mock). 생체(셀카/피팅결과) 버킷은 **미생성**(피팅 실 VTO 때).  
- `make-admin` 스크립트(첫 ADMIN 부트스트랩, 멱등).

### 3-3. 어드민 (v2 \+ 이번 세션)

- **카탈로그**(v2): 가드(requireAdmin \+ 미들웨어), 스타일/variant CRUD(soft delete), 재고, 마켓 가격 매트릭스, 가용성 토글(가격없는 variant 경고만, 차단X), 갭 진단, 커버 이미지 실 S3 업로드. 공통 UI 5종(Card/Badge/Table/Dialog/Toast, from-scratch). 어드민 언어=한국어 단일, errorCode→한국어 중앙 맵.  
- **주문 관리(이번 세션)**: §5 참조.

### 3-4. 결제 실 통합 (이번 세션 — 완성, 매 단계 격리 커밋 \+ 런타임 검증)

구조·코어 불변식은 **AGENTS.md §2/§7**. 코드로 복원 안 되는 **결정 근거**:

- **토스 \= 통합결제창(위젯 아님)**: 위젯 테스트키는 사업자등록 필요, 통합결제창은 등록 전에도 테스트키로 선연동("온보딩 전에 빌드").  
- **포트 `refund` 단일**(cancel/refund 분리 안 함): 토스·PayPal 다 단일 취소 API로 전액/부분(`amount?`). 더 작은 공통분모.  
- **2-phase \+ 멱등 \+ 동시 confirm \+ PG확정-로컬실패(unconfirmed) 탐지 \+ 이중결제 가드**: redirect 결제의 일상적 경합을 fresh-read로 처리. unconfirmed에 durable 마커(+secret 저장)로 웹훅 복구 가능 \+ 이중결제 차단.  
- **refund 포트 \+ 토스 취소 API \+ unconfirmed 자동 보상**.  
- **웹훅 helper(`handlePaymentWebhook`) \+ strategy 주입**: 3번째 PG(JP) 확정이라 독립 라우트 대신 공통 helper. 검증 2축(authenticateDelivery=전송자 진위·멱등 기록 *전* / authorizeEvent=내용 대조·기록 *후*) → 위조가 멱등 앵커 오염 못함. **Mock strategy로 "제3 전략 무수술 삽입" 보증.**  
- **PayPal 금액 검증 \= capture 응답 실제 금액/통화/`custom_id` 대조**(클라 값 아님). 위변조 시 finalize 안 하고 unconfirmed.  
- **금액**: zero-decimal(KRW/JPY) ×100 안 함(AGENTS.md §7). 100배 버그 주의.  
- **못 닫고 라이브 첫거래로 미룬 것**(환경 제약, 코드 결함 아님 — go-live §5): 토스 라이브 confirm 응답 secret 흐름 / PayPal 유효서명 웹훅 실수신.

---

## 4\. 핵심 의사결정 (누적 — 코드론 안 보이는 것)

1. **마켓 모델**: 통화=마켓 통화=표시=주문 통화. **마켓별 고정 가격(구매력 기준, FX 환산 아님).** Market은 first-class.  
2. **결제 — SoR(Seller of Record)**: 우리가 판매주체(체크아웃·결제·고객데이터 직접 보유, 우리 PSP로 직접 수금). 풀MoR 아님 → 세금/관세는 우리가 처리(마진 엔진, §7-후속). **법인=한국 등록** → KR 법인이 지금 라이브로 켤 글로벌 레일은 **PayPal뿐**(Stripe·Airwallex acquiring은 현재 KR 미가용, Airwallex KR은 2026 예정 → 그때 어댑터 추가). **US·JP=PayPal, KR=국내 PG(토스)**(한국은 PayPal 침투율 낮음). EU=후속(Market에 없음). **PCI**: 원시 카드(PAN) 저장 금지, provider 호스티드/토큰화.  
3. **PayPal·토스는 "교체"가 아니라 "공존"** — 마켓별로 갈림. 둘의 흐름·웹훅 형식이 근본적으로 다름 → 인터페이스가 공통분모인지 정찰 선행이 필수였음(완료). 지금은 둘 다 라이브 준비됨.  
4. **결제 코어 보존**: 포트·어댑터·유스케이스·factory가 *이미 있었고*, 코어(원자 차감·idempotency·카트 비우기)는 한 줄도 안 바뀜(finalizer byte-identical, secret 필드 하나 예외). 새 헥사고날 디렉터리 만들지 않음.  
5. **storage named 분리**(catalogStorage/fittingStorage): if 분기 아님, 호출처 직접 import. 도메인이 셋(카탈로그=영구/셀카=만료/AI결과=캐시)이라. 피팅 실 VTO 시 fittingStorage만 S3로.  
6. **피팅 방향**(미확정): 자체 AI 아님, 외부 VTO 추상화. 자체 세그멘테이션/인페인팅 금지(특허 노출: KR 미러로이드 KR102538783B1, Perfect Corp). 레인1(온디바이스 AR, 프라이버시 우위) / 레인3(서버 GenAI, 포토리얼·얼굴 서버 전송=컴플라이언스 비용). 생체 프라이버시(BIPA/PIPA/APPI/GDPR)가 레인 선택 좌우. **Phase 0(VTO 벤더·면책 KR/JP·생체 컴플라이언스) 미정으로 막힘.**  
7. **마진 엔진 — 결제 *후* 별도(후속)**: 출시는 마켓별 고정가로 가능. 후속 범위 \= MarketConfig(세금 INCLUSIVE/EXCLUSIVE·세율·반올림), 가격 두 모드(고정가/그로스업), getPricing→MarginBreakdown, DDP/랜디드코스트, Tax/LandedCost 포트. ⚠️ (B)그로스업+FX는 우리 "고정가(FX 아님)" 결정과 부분 충돌 / 관세 분해는 현 스키마에 없음(대확장) / **새 Money 클래스 만들지 마라**(기존 CURRENCY\_META \+ zero-decimal 재사용, 100배 버그). 지금 손대지 않음.

---

## 5\. 관리자 주문 관리 (이번 세션 — 진행 중)

- **1단계 조회 ✅**: `/admin/orders` 목록(status/paymentStatus/market/date 필터+페이지네이션) \+ `/admin/orders/[id]` 상세(상품·ManufacturingRequest·Payments·PaymentAdjustments). read model `src/lib/admin-orders-data.ts`, ADMIN 가드. 런타임 확인.  
- **2단계 전진 전이 ✅**: 코어 `src/lib/order/status-transition.ts` — typed 허용 맵 `PAID→CONFIRMED→MANUFACTURING→SHIPPED→DELIVERED`, 코어에서 검증, 조건부 update(`updateMany`\+`count===0`→CONFLICT) 동시성, 멱등, 결과코드 INVALID\_TRANSITION/CONFLICT/NOT\_FOUND. admin 액션 `src/app/actions/admin/orders.ts`. 런타임 전구간 확인(DB \+ 사용자 `/orders/[id]` 반영). 결정: 전이 코어는 주문 도메인(결제 코어·read model과 분리). **`ManufacturingRequest.status` 연동 안 함**(아이템 1:1 \+ `String`이라 미성숙). 취소/환불은 전진 맵 밖이라 별도. 동시성 본보기는 *성공 트랜잭션*(실패 트랜잭션은 count 체크 없음).

### 5-1. ⏳ 다음 \= 3단계 관리자 환불 (정찰·설계 잠금 완료 — 빌드 프롬프트는 이 설계로 바로 작성)

- **새 코어 `src/lib/payment/admin-refund.ts`** — 기존 자동보상(`recordUnconfirmedPaymentAdjustment`)은 unconfirmed marker 전제라 재사용 불가(패턴만 차용).  
- **환불가능액 SSOT \= 우리 DB 합산** `Payment.amount - sum(SUCCEEDED adjustments)`. `refundableAmount`(PG 스냅샷)는 표시/감사용, 검증 기준 아님.  
- **흐름(한 transaction)**: 로드 → refundable 계산 → amount 없으면 전액/있으면 `0<amount≤refundable` 검증 → **PaymentAdjustment(PENDING, idempotencyKey) 선생성**(@unique로 재진입 차단=이중환불 방지) → `provider.refund()` → 결과로 adjustment 업데이트 → 성공 시 상태 갱신.  
- **상태 갱신(환불 코어가 직접 — REFUNDED/CANCELLED는 전진 맵 밖)**: 전액 도달→Order/paymentStatus/Payment 모두 REFUNDED. 부분→Order.status 유지 \+ paymentStatus/Payment PARTIALLY\_REFUNDED.  
- **★ 재고 복원 절대 안 함**: 부분/배송후 환불에 복원하면 유령재고·오버셀. 재고 복원은 "반품 입고"라는 별개 흐름(나중). 행동 테스트로 "어떤 환불에도 stock 불변" 못박기.  
- **취소(CANCELLED)는 4단계**: 3단계는 돈 되돌리기만. 결과코드 INSUFFICIENT\_REFUNDABLE/INVALID\_AMOUNT/NOT\_FOUND/ALREADY/PROVIDER\_FAILED.  
- **provider 성공 후 로컬 실패**: 자동복구 말고 큰 소리 로깅(저빈도·관리자 수동, adjustment PENDING으로 남아 보임).  
- 전액+부분 한 코어, UI는 전액 우선. admin 액션은 `orders.ts`에 `refundOrderPaymentAction` 추가.

---

## 6\. 백로그 / 미래

- **4단계 취소**: 결제전(PENDING\_PAYMENT)=단순 CANCELLED 전이 / 결제후(PAID+)=환불+CANCELLED(3단계 재사용).  
- **재고 복원("반품 입고")**: 환불과 분리된 별개 운영 흐름.  
- **AI 피팅 실연동**(제품 핵심 차별점, 큰 덩어리): 현재 mock(`AI_PROVIDER=real`은 throw, 인터페이스만). 흐름은 mock으로 동작. Phase 0(§6 결정) 미정으로 막힘. 정해지면 결제처럼 정찰→설계. 실 VTO 시 생체 버킷 생성 \+ `fittingStorage`를 S3로 \+ 피팅 mock 잔재 폐기(§8 아래).  
- **JP 현지 PG**(KG이니시스 일본 / Eximbay 중 **미정**): 가발 입점 심사 \+ PG 확정 후. 웹훅 strategy 슬롯 열림(strategy 추가로 끝). **공존**(JP에 PayPal \+ 현지 PG)이라 결제수단 선택 UI(앞단)도 필요 — 웹훅 helper와 별개 층. Eximbay 검증=헤더 HMAC \+ status\_url(transid 멱등) \+ FGKey(가설, 확정 시 공식문서 재확인), KG 미확인.  
- **마진 엔진**(§4-7): 결제 후 별도. 지금 손대지 않음.  
- **결제 작은 정리**(라이브 트랙에 흡수): `payOrderAction` pending의 `error` 잔재, `shouldSucceed` mock 파라미터 제거, PayPal OAuth 토큰 캐싱(라이브 후 측정 시), 외부취소 반영(토스 CANCEL 발송 조건 확인 후).  
- **출시 하드닝**(코드로 지금 가능): 에러 모니터링/로깅(실 사용자엔 사실상 필수 — 지금 에러가 운영자에 안 보임), 보안 점검(mock 라우트 프로덕션 404, env/비밀 노출, IAM 최소권한, 어드민 경계 전수), 사용자 화면 모바일 반응형(미검증). ⚠️ **통째로 미리 하드닝 마라** — 결제·피팅 실물 뒤 그 화면도 다시 해야 함, 지금 있는 코드의 필수분만.  
- **사용자측 미구현**: 주문 목록/마이페이지, 리뷰·위시리스트(스키마 자리만), 이메일/알림. 단일 주문 상세만 있음.  
- **루트 `/`가 create-next 기본 화면** — 랜딩 필요(라이브 첫인상).

---

## 7\. 라이브 전환 (코드 아님 — 사업 트랙)

상세 절차·체크리스트는 **`docs/go-live-checklist.md`**. 요약:

- **토스(KR)**: 전자결제 계약+심사(토스 1\~2일/카드사 최대 14일=임계경로) → `live_` 키+MID → 웹훅 등록(`PAYMENT_STATUS_CHANGED`) → 프로덕션 `.env`(`PAYMENT_LIVE_MARKETS`에 KR) → 첫거래 검증(secret 흐름·웹훅 수신).  
- **PayPal(US·JP)**: 라이브 앱 → client id/secret \+ 웹훅 등록(`PAYMENT.CAPTURE.COMPLETED`)+`PAYPAL_WEBHOOK_ID` → `.env`(US,JP) → 첫거래(DB PAID·유효서명 웹훅 복구).  
- **공통 라이브 차단**: `prisma migrate deploy`(안 하면 웹훅 조용히 실패), `NEXTAUTH_URL`/`SECRET`, 웹훅 URL 외부 접근 가능, 시크릿 레포 노출 금지.

---

## 8\. 정리 항목 (당장 안 막지만 나중)

- **피팅 mock 잔재**(실 VTO/생체 S3 시 폐기): `api/mock-storage/route.ts` \+ MockStorageProvider, `public/demo-fitting/*` canned \+ jobVariantMap, 결과 `<img>`, `AI_MOCK_FORCE_FAIL`/`AI_MOCK_DELAY_MS`. **지금 못 지움**(피팅이 의존).  
- **갭 진단 쿼리** 관계+메모리 필터 → 대형화 시 raw SQL 여지.  
- **어드민 lib 분산**(`admin.ts`/`admin-role.ts`/`catalog-admin/`/...) — 거슬리면 `lib/admin/`로(지금 X).  
- **미들웨어 Next 16 deprecation 경고**(proxy 컨벤션 변경 예정, 동작 정상) — 하드닝 즈음 마이그레이션.  
- **VariantMarketPrice 비우기 동작 미확인**, **ADMIN 프로비저닝**(현재 make-admin뿐), **테스트 DB**(CI 붙일 때 `test:setup`).

---

## 9\. 막는 것 (founders 트랙 — 코드 밖)

- **토스 PG 온보딩**(사업자등록·정산·심사) — 결제 코드 라이브의 전제.  
- **피팅 Phase 0**(VTO 벤더·면책 KR/JP·생체 컴플라이언스) — 실 피팅의 전제.  
- **법무**(개인정보처리방침·약관·얼굴사진 삭제 흐름).  
- **도메인 확정**(Vercel 배포·프로덕션 CORS·OAuth 프로덕션 리다이렉트·결제 콜백/웹훅 URL).  
- **경계**: 실제 작업 순서는 위 온보딩 진행도·도메인 시점·예산·타임라인에 달렸고 이 문서가 모른다.

---

## 10\. 작업 방식 (요약 — 상세는 `docs/collaboration-protocol.md`)

- **루프**: 정찰(read-only) → 설계 잠금 → 격리 빌드(한 단계=한 관심사) → 검수 → 격리 커밋.  
- **교차검토**: (a)되돌리기 비싸거나 STRICT \+ (b)틀렸는지 내 시야로 못 알 때 → 받는다. 좁혀 묻고(열린 "개선점?" 금지), 결과는 *입력*(MVP 규모·단계 규율로 거름).  
- **verify 초록 ≠ 작동**: STRICT·실거래·라우트/UI는 런타임 검증(DB·Network 탭 status). Codex가 dev 서버 `EPERM`이면 사람이 브라우저(이미 떠 있으면 Codex도 가능). "미리보기 떴다 ≠ 저장됐다".  
- **STRICT 코어 보존**: 결제 finalizer 등 로직·순서 불변, 불가피하면 "필드 하나 추가" 최소화 \+ 원자성 행동 테스트.  
- **규칙(헌법) 변경은 기능과 분리 \+ 사전 합의**. 외부 API 사실은 공식 문서만(2차 글 금지).  
- **커밋은 사람이 수동**, 논리 단위 분리. 의심되면 추측 수정 전 read-only 진단부터.  
- **협업 선호(Profile)**: 중대·되돌리기 어려운 결정은 옵션 펼치고 채택/배제 이유 \+ 고정된 전제 풀기 \+ 검토 범위 경계 명시. 단순 사실은 간결히.

