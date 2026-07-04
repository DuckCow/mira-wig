# mira 프로젝트 인계 문서 v5 (Handoff)

**새 세션의 Claude에게**: 너는 mira를 이어서 작업한다. 역할 = **설계 판단 + Codex 프롬프트 작성 + 결과 리뷰**(코드는 직접 안 쓴다 — 프롬프트를 만들고 결과를 검토). 사람이 오케스트레이터·최종 결정·커밋, Codex가 구현·정찰·런타임. **이 문서 = "어디까지 왔나 + 왜 + 다음"(누적 스냅샷).** 중복을 피하려 아래로 **위임**한다:

- 스택·아키텍처·STRICT 존·금액 규칙·결제 코어 구조·웹훅 strategy → **`AGENTS.md`**(Codex 자동 적용, 코드측 SSOT).
- 데이터 모델 필드 → **`prisma/schema.prisma` + migration**(SSOT — 산문 요약 신뢰 말고 스키마를 읽어라).
- 협업 방식("어떻게") → **`docs/collaboration-protocol.md`**. (v5 세션에서 개정됨 — 아래 §10.)
- 라이브 전환 절차 → **`docs/go-live-checklist.md`**.
- **새 `[dev]` 채팅 시작**: 이 문서 + `docs/collaboration-protocol.md`를 붙이고(필요 시 `AGENTS.md`도), "다음 작업"(§6)의 **read-only 정찰부터**. 코드 사실은 정찰로 갱신, 결정 근거는 이 문서가 보존. 작업 언어: 한국어. repo: `/Users/duckcow/Documents/mira` (github: DuckCow/mira-wig, private, main).

---

## 1. 프로젝트

- mira = **AI 커스텀 가발 e-커머스.** 사용자가 자기 사진에 가발 스타일을 합성해 써보고(피팅), 마음에 들면 주문 → 제작.
- 온라인 전용 → "안 맞으면 어쩌지"가 주 구매 장벽 → **피팅이 핵심 차별점**. 단 피팅은 주문 경로상 *필수가 아님*(피팅 없이 browse→cart→checkout→pay 완결). **피팅과 커머스는 병렬 출시 트랙**(서로 임계경로 아님).
- 글로벌 지향, 1차 **KR·US·JP** 3개국. MVP 3대 플로우: 피팅 · 브라우즈 · 전환(주문).
- **진짜 해자는 try-on이 아니라 커스터마이징→주문→제작 파이프라인.**

---

## 2. 지금 위치 (한눈에)

- ✅ **커머스 코어**(browse/auth/주소/장바구니/주문/마켓 가격) — 완료(v1~v2).
- ✅ **스토리지 실물화** — 카탈로그 이미지 실 S3(`catalogStorage`), 피팅은 항상 mock(`fittingStorage`). 분리 런타임 검증됨.
- ✅ **어드민** — 가드 + 카탈로그 CRUD + 마켓 가격/가용성/갭 진단 + 주문 관리(조회·전진 전이).
- ✅ **결제 실 통합** — KR(토스) + US·JP(PayPal), 코드상 라이브 준비완료(v4).
- ✅ **관리자 환불 3단계** — 전액/부분 환불 코어 + UI + 동시성 가드 + 사유 필수. **완료(v5 — 이번 세션 핵심 산출). 코드+런타임+테스트 3중 검증.**
- ⏳ **다음 = 웹훅 미확정 처리 정찰(1순위)** → 재고↔결제 경계 정찰 → 4단계 취소 → AI 피팅 실연동. (§6)
- 🚫 **막힌 것(founders 트랙)**: 토스 PG 온보딩(심사), 피팅 Phase 0(VTO 벤더·생체 컴플라이언스), 법무, 도메인 확정. (§9)

---

## 3. 완료된 것 (누적)

### 3-1. v4까지 (요약 — 상세는 v4 핸드오프)

커머스 코어(가격 스냅샷·재고 원자 차감·idempotency·카트 비우기 한 트랜잭션), 스토리지 실 S3(catalog)/mock(fitting), 어드민(카탈로그 CRUD·마켓 가격·갭 진단·공통 UI 5종 from-scratch·errorCode→한국어 중앙맵), 주문 관리 1·2단계(조회 + 전진 전이 `PAID→CONFIRMED→MANUFACTURING→SHIPPED→DELIVERED`), 결제 실 통합(토스 통합결제창 + PayPal, 2-phase+멱등+동시 confirm+unconfirmed 탐지+이중결제 가드, refund 포트 단일 `amount?`, 웹훅 helper+strategy 주입, PayPal 금액 검증=capture 실제 금액 대조).

### 3-2. 관리자 환불 3단계 (v5 — 이번 세션, 완료. 4커밋 격리 + 런타임 검증)

구조·코어 불변식은 **AGENTS.md §2/§7**. 코드로 복원 안 되는 **결정 근거**는 §4·§5.

**커밋 4개** (main, 미push — 사람이 검토 후 push):
- `b66e8fd` refactor(payment): refundable helper 추출
- `f160e8b` feat(payment): 동시 환불 가드(REFUND_IN_PROGRESS) + 사유 필수 — **STRICT 코어**
- `fc09935` feat(admin): 환불 UI(RefundPaymentForm)
- `510335f` refactor(admin): 전이 버튼 중앙 에러맵 배선

**구현 요약** (파일 위치는 정찰로 갱신 — 아래는 v5 시점):
- 환불 코어 `src/lib/payment/admin-refund.ts`: `refundOrderPayment(input)`, 입력 `{ orderId, paymentId, amount?, reason, idempotencyKey }`.
- 흐름: prepare 트랜잭션(payment 로드 → reason trim 검증 → **PENDING 가드** → 금액 검증 → PENDING adjustment 선생성) → 트랜잭션 밖 `provider.refund` → 성공 시 finalize 트랜잭션(재합산 초과 가드 → adjustment SUCCEEDED → 상태 갱신).
- 환불가능액 공식 helper `src/lib/payment/refundable.ts` (prepare 검증 + read model 표시 공유. finalize는 공유 안 함 — §4-3).
- admin 액션 `refundOrderPaymentAction` (`src/app/actions/admin/orders.ts`), UI `RefundPaymentForm.tsx`.
- 테스트 `src/app/actions/__tests__/admin-refund.integration.test.ts`. 전체 26 files / 350 tests 초록.

---

## 4. 핵심 의사결정 (v5 환불 — 코드론 안 보이는 것)

> v4까지의 결정(마켓 모델·SoR·PayPal/토스 공존·결제 코어 보존·storage named 분리·피팅 방향·마진 엔진 후속)은 **v4 핸드오프 §4 유지**. 아래는 v5 환불에서 새로 굳은 것.

**4-1. 환불가능액 SSOT = 우리 DB 합산.** `Payment.amount - sum(SUCCEEDED PaymentAdjustment.amount)`. `PaymentAdjustment.refundableAmount`(PG 스냅샷)는 표시/감사용이지 검증 기준 아님. SUCCEEDED-only 규칙이 **3곳**(prepare 로드 where / 표시 helper / finalize 재합산)에 있음 — **하나 고칠 때 셋 다** (드리프트 주의).

**4-2. 상태 갱신은 환불 코어가 직접.** REFUNDED/CANCELLED는 `transitionOrderStatus` 전진 맵 밖. 전액 도달 → Order/paymentStatus/Payment 모두 REFUNDED. 부분 → **Order.status 유지** + paymentStatus/Payment PARTIALLY_REFUNDED. (스키마 비대칭이 이걸 강제: `OrderStatus`엔 PARTIALLY_REFUNDED 없고 `PaymentStatus`엔 있음 — 누락 아니라 의도.)

**4-3. ★ finalize 재합산은 helper로 통합하지 "않는" 것이 의도.** prepare 검증은 인메모리 배열(입구 검사)이지만, finalize 재합산은 **트랜잭션 안 DB 재조회**(`succeededAdjustmentTotal`)여야 동시 환불에서 최신 sum을 봐 과대환불을 막는다. "같은 공식이니 재사용"으로 finalize에 인메모리 helper를 넣으면 과대환불이 뚫린다. **정의는 공유(refundable 개념), 접근은 분리(배열 vs 재조회).** SSOT는 "값 정의가 하나"지 "계산 코드가 한 줄"이 아니다. → 커밋 메시지 `b66e8fd`에도 박음.

**4-4. ★★ 재고 복원 절대 안 함.** 환불은 돈만 되돌린다. 부분/배송후 환불에 재고 늘리면 유령재고·오버셀. 재고 복원은 "반품 입고"라는 별개 흐름(§6 백로그). 행동 테스트로 "어떤 환불에도 stock 불변" 못박음(before/after 단언).

**4-5. provider 성공 후 로컬 실패 = 자동복구 안 함, 큰 소리 로깅.** `ADMIN_REFUND_POST_PROVIDER_FAILED`(greppable). PENDING adjustment로 남아 운영 인지. 결제 unconfirmed 수준 자동복구는 과함(관리자 수동·저빈도).

---

## 5. ★ 환불 동시성 — 3층 방어 구조 (v5에서 정밀화, 반드시 이해)

이중환불을 막는 세 층이 **각각 다른 케이스**를 담당한다. "REFUND_IN_PROGRESS 넣었으니 동시성 끝"은 오해 — 아래를 바꾸지 마라.

- **1층 — 같은 폼 더블클릭(같은 idempotencyKey):** `PaymentAdjustment.idempotencyKey @unique`가 최종 방어. 이미 커밋된 뒤면 사전 조회에서 ALREADY, 거의 동시면 unique 충돌 → ALREADY. idempotencyKey는 폼 렌더당 서버 생성(page.tsx 인라인, 클라 재생성 없음).
- **2층 — 새로고침/재방문 순차 재시도(다른 키):** **REFUND_IN_PROGRESS 가드**(v5 신규, 1″-a). prepare에서 같은 paymentId에 `status=PENDING AND idempotencyKey ≠ 이번 키`인 adjustment가 있으면 거부. **"≠ 이번 키" 조건 필수** — 없으면 자기 자신/같은키 재시도를 오거부. 조회는 **선생성 전**(내가 만든 PENDING이 나를 안 막게).
- **3층 — 서로 다른 키의 진짜 동시 요청:** 둘 다 조회 시점에 PENDING을 못 보면 둘 다 생성 가능 → **finalize 재합산 가드**(§4-3)가 과대환불을 막고 → PENDING 잔존 + `ADMIN_REFUND_POST_PROVIDER_FAILED` 운영 인지. 이 단계에서 **완전 차단 아님**(의도). 완전 봉쇄는 reservation/lock/serializable = §6 백로그.

**왜 1″-a(부분 가드)이고 완전판(대사)이 아닌가:** 새로고침 재시도(2층)가 흔한 구멍이라 값싸게 막되, 완전 봉쇄는 실 데이터로 실패 패턴 굳은 뒤. **키를 결정적으로 만들지 않음** — 그러면 정당한 2차 부분환불과 꼬이고, 새로고침까지 같은 키를 원하면 RefundIntent 모델(옵션 3, 대사급)이 필요.

**1″-a의 남은 구멍(수용 + 백로그):**
- **5xx 후 재시도**: adapter가 5xx를 `RefundResult{FAILED}`로 닫으면 PENDING이 안 남아 2층 가드를 통과 → 재시도 가능. (타임아웃/네트워크 예외는 throw → PENDING 남음 → 막힘. 애매한 실패가 throw/FAILED로 **비일관** — 이게 근본 문제, §6 근본 가설.)
- **stuck PENDING**: provider 호출 후 크래시로 PENDING 영구 잔존 시, 그 payment 환불이 2층 가드에 영구 차단 → **현재 DB 수동 개입 필요**(운영 해소 UI 없음).

---

## 6. 백로그 / 다음

### 6-1. 다음 작업 순서 (권장)

1. **웹훅 미확정 처리 정찰 (1순위, read-only):** 받음 vs 처리됨 구분, `PaymentWebhookEvent` 기록 시점, 웹훅 처리 중 로컬 쓰기 실패 시 PG 재전송으로 복구 가능한가. **결제 실돈 직결 + 라이브 직결.** go-live §5(secret 흐름)와 연관.
2. **재고 차감 ↔ 결제 finalize 경계 정찰:** `provider.initiate`는 트랜잭션 밖인데, provider 성공 후 트랜잭션 실패 시 재고가 새나/롤백되나(결제 실패 방향 재고 구멍).
3. **4단계 취소:** 결제전(PENDING_PAYMENT)=단순 CANCELLED 전이 / 결제후(PAID+)=환불+CANCELLED(3단계 재사용, **REFUND_IN_PROGRESS 가드 상속**).
4. **per-payment refund reservation (대사 트랙):** §5의 남은 구멍 셋(5xx 재시도 / stuck PENDING 수동해소 UI / 진짜 동시 race 완전차단)을 **한 덩어리**로. PENDING을 예약액으로 계산 + stuck 해소 정책·UI + 필요 시 lock. **실 데이터로 실패 패턴 굳은 뒤**(라이브 후) — 지금 추측 설계하면 재작업 위험.
5. **AI 피팅 실연동 / go-live** — 우선순위는 사람 결정(§9 트랙 진행도에 달림).

### 6-2. ★ 근본 가설 — 미확정 처리 불균등 (정찰 후보들)

**가설:** *"외부 부작용(돈·파일·외부 상태)과 로컬 상태 커밋 사이의 창에서, 애매한 실패를 일관되게 미확정으로 표현하는 공통 규약이 없다."* 결제 confirm은 unconfirmed marker + 웹훅 복구 + 마커 해소로 이걸 풀었지만(성숙), 그 패턴이 **재사용 가능한 일반형으로 승격 안 됨** → 환불이 못 물려받아 §5의 throw/FAILED 비일관이 생김. **결함이라기보다 "결제엔 있는 패턴이 다른 mutation엔 미성숙".**

**정찰 후보(코드 미확인 — 같은 병일 수 있는 곳):**
- 웹훅 수신 처리 실패(위 6-1 1순위).
- 재고 차감 ↔ 결제 원자성 경계(6-1 2번).
- S3 업로드 성공 ↔ DB key 저장 실패(orphan 객체 / 깨진 presigned). 얼굴사진이면 컴플라이언스 민감.
- PayPal OAuth 토큰 발급 ↔ API 호출 부분 실패(작음).

> 처방(먼) = 결제의 미확정-처리 패턴을 공통 규약(marker + 대사 인터페이스)으로 뽑아 환불·취소·업로드 공유. **큰 리팩터라 라이브 후 패턴 굳으면.** 지금은 후보 정찰만.

### 6-3. 기타 백로그 (v4에서 이어짐)

- **재고 복원("반품 입고")**: 환불과 분리된 별개 운영 흐름.
- **마진 엔진**(v4 §4-7): 결제 후 별도. 지금 손대지 않음.
- **결제 작은 정리**: `payOrderAction` pending의 `error` 잔재, `shouldSucceed` mock 파라미터 제거, PayPal OAuth 토큰 캐싱, 외부취소 반영(토스 CANCEL 발송 조건 확인 후).
- **출시 하드닝**(코드로 지금 가능): 에러 모니터링/로깅(실사용자엔 사실상 필수), 보안 점검(mock 라우트 프로덕션 404·env 노출·IAM·어드민 경계), 모바일 반응형 미검증. ⚠️ 통째 미리 하드닝 마라 — 결제·피팅 실물 뒤 다시 해야 함.
- **사용자측 미구현**: 주문 목록/마이페이지, 리뷰·위시리스트(스키마 자리만), 이메일/알림. 단일 주문 상세만 있음.
- **루트 `/`가 create-next 기본 화면** — 랜딩 필요(라이브 첫인상).

---

## 7. 라이브 전환 (코드 아님 — 사업 트랙)

상세는 **`docs/go-live-checklist.md`**. 요약: 토스(KR) 전자결제 계약+심사(카드사 최대 14일=임계경로) → `live_` 키+MID → 웹훅 등록 → 프로덕션 `.env`(`PAYMENT_LIVE_MARKETS`에 KR) → 첫거래 검증(secret 흐름·웹훅 수신). PayPal(US·JP) 라이브 앱 → client id/secret + 웹훅(`PAYMENT.CAPTURE.COMPLETED`)+`PAYPAL_WEBHOOK_ID` → 첫거래(DB PAID·유효서명 웹훅 복구). 공통 차단: `prisma migrate deploy`(안 하면 웹훅 조용히 실패), `NEXTAUTH_URL`/`SECRET`, 웹훅 URL 외부 접근, 시크릿 레포 노출 금지.

---

## 8. 정리 항목 (당장 안 막지만 나중)

- **브라우저 클릭 런타임 환경 제약**: 인앱 브라우저가 localhost 접근을 보안 정책으로 차단할 수 있음. 그때 더블클릭/required 같은 브라우저 클릭 검증은 **통합 테스트 + 표준 동작(HTML required 등)으로 대체**하고 명시. (go-live의 "카드사 보안 키패드는 사람 1회 수동"과 같은 계열 — 자동화 못 하는 자리.)
- **reason 정책**: v5에서 관리자 환불 사유 **필수화 완료**(UI required + 코어 trim 거부). 다른 흐름에 환불 생기면 동일 적용 검토.
- **피팅 mock 잔재**(실 VTO/생체 S3 시 폐기): `api/mock-storage`, MockStorageProvider, `public/demo-fitting/*`, 결과 `<img>`, `AI_MOCK_*` env.
- **미들웨어 Next 16 deprecation 경고**(동작 정상) — 하드닝 즈음 마이그레이션.
- **`<img>` lint warning 4개**(fitting 페이지·FittingModal) — 피팅 실물 때 `next/image`로.
- **VariantMarketPrice 비우기 동작 미확인**, **ADMIN 프로비저닝**(make-admin뿐), **테스트 DB**(CI 붙일 때).

---

## 9. 막는 것 (founders 트랙 — 코드 밖)

- **토스 PG 온보딩**(사업자등록·정산·심사) — 결제 코드 라이브의 전제.
- **피팅 Phase 0**(VTO 벤더·면책 KR/JP·생체 컴플라이언스) — 실 피팅의 전제.
- **법무**(개인정보처리방침·약관·얼굴사진 삭제 흐름).
- **도메인 확정**(Vercel 배포·프로덕션 CORS·OAuth 리다이렉트·결제 콜백/웹훅 URL).
- **경계**: 실제 작업 순서는 온보딩 진행도·도메인 시점·예산·타임라인에 달렸고 이 문서가 모른다.

---

## 10. 작업 방식 (요약 — 상세는 `docs/collaboration-protocol.md`)

- **루프**: 정찰(read-only) → 설계 잠금 → 격리 빌드(한 단계=한 관심사) → 검수 → 격리 커밋.
- **교차검토**: (a)되돌리기 비싸거나 STRICT + (b)틀렸는지 내 시야로 못 알 때 → 받는다. 좁혀 묻고, 결과는 *입력*.
- **verify 초록 ≠ 작동**: STRICT·실거래·라우트/UI는 런타임 검증(DB·Network status). "미리보기 떴다 ≠ 저장됐다".
- **STRICT 코어 보존**: finalizer 등 로직·순서 불변, 불가피하면 "필드 하나 추가" 최소화 + 원자성 행동 테스트.
- **커밋은 사람이 수동**, 논리 단위 분리. 의심되면 추측 수정 전 read-only 진단부터.
- **★ v5 개정(collaboration-protocol.md 반영됨)**:
  - **코드 못 보는 쪽(Claude)은 단정 대신 정찰 위임**. "이렇게 구현하라" 단정은 실행 맥락(트랜잭션 시점·데이터 신선도·격리)과 어긋나도 못 잡는다 → "정찰해 판단하고 근거 보고하라"로 열어 위임. "재사용하라"류도 같은 값이 같은 시점·같은 데이터로 쓰이는지 다르면 틀림(정의 공유, 접근 분리).
  - **스텝 강도는 이름이 아니라 건드리는 대상별로**. "UI 스텝이라 NORMAL"로 뭉뚱그리면 그 안의 STRICT 조각(멱등키 생성, 금액 계산 공유)을 놓친다.
  - 도출 근거(이 세션 실제): finalize helper "재사용" 지시가 트랜잭션 시점 무시 / idempotencyKey "렌더당 생성"이 새로고침 맥락 무시 — 검수가 잡았으나 프롬프트 단계에서 예방했어야.
- **협업 선호(Profile)**: 중대·되돌리기 어려운 결정은 옵션 펼치고 채택/배제 이유 + 고정된 전제 풀기 + 검토 범위 경계 명시. 다른 도구/사람 결과물은 결론이 아니라 입력으로 검증. 단순 사실은 간결히.
