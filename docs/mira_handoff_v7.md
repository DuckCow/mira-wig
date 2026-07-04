# mira 프로젝트 인계 문서 v7 (Handoff)

**새 세션의 Claude에게**: 너는 mira를 이어서 작업한다. 역할 = **설계 판단 + Codex 프롬프트 작성 + 결과 리뷰**(코드는 직접 안 쓴다 — 프롬프트를 만들고 결과를 검토). 사람이 오케스트레이터·최종 결정·커밋, Codex가 구현·정찰·런타임. **이 문서 = "어디까지 왔나 + 왜 + 다음"(누적 스냅샷).** 중복을 피하려 아래로 **위임**한다:

- 스택·아키텍처·STRICT 존·금액 규칙·결제 코어 구조·웹훅 strategy → **`AGENTS.md`**(Codex 자동 적용, 코드측 SSOT).
- 데이터 모델 필드 → **`prisma/schema.prisma` + migration**(SSOT — 산문 요약 신뢰 말고 스키마를 읽어라).
- 협업 방식("어떻게") → **`docs/collaboration-protocol.md`**.
- 라이브 전환 절차 → **`docs/go-live-checklist.md`**. (v6에서 §5-bis 2건이 go-live 필수로 추가됐고, **v7 이번 세션에서 그 2건 코드측 닫힘** — §7.)
- v5까지의 결정 상세(환불 3단계·환불 동시성 3층) → **v5 핸드오프 §4·§5**. v6 상세(웹훅 종국-실패 대칭화) → **v6 핸드오프 §3-2·§4·§5**. 아래는 v6 대비 **델타**.
- **새 `[dev]` 채팅 시작**: 이 문서 + `docs/collaboration-protocol.md`를 붙이고(필요 시 `AGENTS.md`도), "다음 작업"(§6)의 **read-only 정찰부터**. 코드 사실은 정찰로 갱신, 결정 근거는 이 문서가 보존. 작업 언어: 한국어. repo: `DuckCow/mira-wig` (github, private, main). 로컬 체크아웃 경로는 환경별 — 이 문서가 repo 안에 있으면 그 루트 기준.

---

## 1. 프로젝트

- mira = **AI 커스텀 가발 e-커머스.** 사용자가 자기 사진에 가발 스타일을 합성해 써보고(피팅), 마음에 들면 주문 → 제작.
- 온라인 전용 → "안 맞으면 어쩌지"가 주 구매 장벽 → **피팅이 핵심 차별점**. 단 피팅은 주문 경로상 *필수 아님*(피팅 없이 browse→cart→checkout→pay 완결). 피팅과 커머스는 병렬 출시 트랙.
- 글로벌 지향, 1차 **KR·US·JP**. MVP 3대 플로우: 피팅 · 브라우즈 · 전환(주문).
- **진짜 해자는 try-on이 아니라 커스터마이징→주문→제작 파이프라인.**
- **제품 바(v6 확정)**: MVP 최소구현이 아니라 **고객이 바로 써도 문제없는 수준**. 이 바 때문에 실돈 경로의 조용한 유실/이중환불이 go-live 전 필수로 승격됐고 — **v7에서 그 2건(§5-bis) 코드측 닫힘.** 단 §6-2 일반 규약 추출 같은 큰 리팩터는 여전히 라이브 후.

---

## 2. 지금 위치 (한눈에)

- ✅ **커머스 코어**(browse/auth/주소/장바구니/주문/마켓 가격) — 완료(v1~v2).
- ✅ **스토리지 실물화** — 카탈로그 실 S3(`catalogStorage`), 피팅 항상 mock(`fittingStorage`).
- ✅ **어드민** — 가드 + 카탈로그 CRUD + 마켓 가격/가용성/갭 진단 + 주문 관리(조회·전진 전이).
- ✅ **결제 실 통합** — KR(토스) + US·JP(PayPal), 코드상 라이브 준비완료(v4).
- ✅ **관리자 환불 3단계** — 전액/부분 환불 코어 + UI + 동시성 가드 + 사유 필수(v5).
- ✅ **웹훅 종국-실패 대칭화** — 웹훅 복구 실패를 confirm과 대칭으로(보상 환불 + reconciliation marker)(v6).
- ✅ **compensate 자기재시도 이중환불 창 닫기** — write-ahead 선기록(**v7 이번 세션**. go-live §5-bis-1 코드측 닫힘).
- ✅ **미확정·환불실패 marker 능동 가시화** — marker-only 탐지 + 목록 배지/필터칩/카운트, surface-only(**v7 이번 세션**. go-live §5-bis-2 코드측 닫힘).
- ⏳ **다음** = 재고↔결제 경계 정찰 / existing-SUCCEEDED marker 로컬 해소 / 4단계 취소 — **순서는 founders 트랙 임박도가 지배**(§6·§9).
- 🚫 **막힌 것(founders 트랙)**: 토스 PG 온보딩(심사), 피팅 Phase 0, 법무, 도메인(§9).

> 이번 세션 변경은 **커밋 완료**(사람 수동). 이하 상태는 그 커밋 기준. **커밋/push 여부의 SoR은 git이다** — 문서에 push 상태를 흩뿌리지 않는다(v6에서 "미push/push완료" 상충은 그래서 났음).

---

## 3. 완료된 것 (누적)

### 3-1. v6까지 (요약 — 상세는 v4·v5·v6 핸드오프)

커머스 코어(가격 스냅샷·재고 원자 차감·idempotency·카트 비우기 한 트랜잭션), 스토리지 실 S3(catalog)/mock(fitting), 어드민(카탈로그 CRUD·마켓 가격·갭 진단·주문 관리), 결제 실 통합(토스 통합결제창 + PayPal, 2-phase+멱등+unconfirmed 탐지+이중결제 가드, refund 포트 단일 `amount?`, 웹훅 helper+strategy 주입), 관리자 환불 3단계(refundable helper·REFUND_IN_PROGRESS 가드·사유 필수·환불 동시성 3층), 웹훅 종국-실패 대칭화(confirm 미러=`compensateUnconfirmedPayment` 재사용). **환불 근거 = v5 §4·§5, 웹훅 대칭화 근거·안전전제 = v6 §4·§5 — 여전히 live invariant.**

### 3-2. #1 compensate 자기재시도 창 닫기 (v7 — 완료, 1커밋 격리 + 검증)

- **변경 (reconciliation.ts):** auto-refund adjustment 기록을 create-only에서 **write-ahead**로. `provider.refund` **전** 같은 키로 PENDING adjustment claim(`@unique`=락) → refund → 결과로 update. 재진입이면 P2002 → 기존 status 읽고 **재발사 없이** 반환(SUCCEEDED/FAILED/PENDING 전부).
- **helper 분리 (reconciliation-adjustment.ts, 신규):** `claimPendingAutoRefundAdjustment`(PENDING create) / `updateAutoRefundAdjustment`(결과 update). STRICT 파일 한도 유지용 extract, provider 호출은 감싸지 않음.
- **불변 (diff 부재로 증명):** `process.ts` 성공 tx 순서, `schema.prisma`(마이그레이션 없음 — `PaymentAdjustment.status`·default PENDING·`idempotencyKey @unique` 기존), `admin-refund.ts`.
- provider 호출은 tx 밖 유지, provider `idempotencyKey` 그대로 전달(**defense-in-depth**).
- **검증:** 크래시-후(refund 성공→update 실패 재진입) refund 총 1회 / 크래시-전(claim 후 refund 전 크래시) refund 0회. 행동 테스트 +2.

### 3-3. #2 미확정 marker 능동 가시화 (v7 — 완료, 1커밋 격리 + 검증)

- **변경:** `reconciliation.ts`에 `UNRECONCILED_PAYMENT_MARKER_WHERE` export(기존 `orderHasUnreconciledPayment`와 목록이 공유 = **SSOT fragment**). `admin-payment-review.ts`(신규: 필터값·marker count where·라벨 상태 계산). `admin-orders-data.ts`(`paymentReview` 필터 + `paymentReviewCount` + row별 상태, page order id batch 병합 1회). `page.tsx`(결제 배지 옆 문제 배지 + "미확정·환불실패만" 필터칩 + "확인 필요 N건" 카운트 링크).
- **탐지 = marker 기준**(근거 §5). adjustment status는 **배지 라벨**(미확정/환불 확인 필요/환불 실패) 세분화에만.
- **surface-only:** 해소 액션 없음(admin refund가 PENDING marker에 도달 못 함 — 별 트랙).
- **N+1 아님:** count·rows·reviewCount·reviewMarkers 4쿼리 상수, page size 무관.
- **검증:** 술어 행동 테스트 4(marker true / resolved(REFUNDED+SUCCEEDED) false / 정상 PENDING_PAYMENT false / adjustment 없는 marker true) + read model 테스트. +5.

**전체:** verify 초록(26 files / **360 tests, 353→360 +7**: #1 +2, #2 +5). `<img>` lint warning 4개 불변.

---

## 4. 핵심 의사결정 (v7 — 코드론 안 보이는 것)

> v6까지 결정(마켓 모델·SoR·결제 코어 보존·storage 분리·환불 3단계·동시성 3층·웹훅 대칭화)은 v4·v5·v6 핸드오프 유지. 아래는 v7에서 굳은 것.

**4-1. ★★ 선기록(write-ahead)이 provider-상태조회(A안) 제친 이유.** 창을 닫는 처방으로 (A) refund 전 provider 상태조회 / (B) provider 네이티브 멱등키 / (C) 선기록 검토. 정찰 확인: **포트에 상태/조회 메서드 없음**(`types.ts` refund만), PayPal `capture_id`로 기존 refund 역조회는 공식 문서 미확정. 목표어가 "**provider TTL/웹훅 dedup에 기대지 않는 로컬 내구 경계**"라 A(provider 의존)·B(TTL 의존)는 경계로 부적격. **C(선기록) 채택** — refund 전 PENDING adjustment로 시도 사실을 로컬에 박음(마이그레이션 없이 기존 adjustment status 재사용, `admin-refund`의 PENDING-create→update **shape 참조**하되 교차호출 아님 — 실행 맥락 다름). provider 멱등키는 제거 아니라 **defense-in-depth**로 유지.

**4-2. ★★ 크래시-전 트레이드 명시 수용 (이게 #2를 #1의 운영 전제로 격상).** 선기록이 재진입 재발사를 막으면 "크래시-후(이미 환불)"와 "크래시-전(환불 안 됨)"을 **로컬만으로 구분 불가**(mid-call 응답 유실 포함). 해소 = 둘 다 재발사 안 함 + PENDING을 ops로. **얻음: TTL 무관 이중환불 0. 잃음: 드문 크래시-전에서 고객이 자동환불 대신 ops 수동환불 대기.** status quo는 반대(크래시-전 자동완료하나 크래시-후 TTL 밖 이중환불). 우선순위(돈-안전 > 자동완료, TTL 비의존)가 트레이드 지지. **크래시-전이 ops 눈에 안 보이면 환불-owed가 잠복** → 그래서 **#2(가시화)가 #1의 운영 전제, 페어 필수**(#1 go-live 전 P1, #2 그 운영 전제라 동반 go-live 전).

**4-3. go-live 근거 정정.** #1은 "흔한 이중환불 P0"가 아니라 "**provider TTL/웹훅 dedup에 기대지 않는 로컬 내구 경계 확보**"다. 정찰이 밝힌 것: within-TTL 재진입은 provider 멱등키가 이미 self-heal(Toss `Idempotency-Key` 15일·PayPal `PayPal-Request-Id` 보존기간 공식 미명시), 웹훅은 `PaymentWebhookEvent` row 존재만으로 duplicate 200 → same-event 재전송이 recovery 전에 끊김(재발사 안 하나 로컬 장부/ops 신호가 빔), 외부 refund 시도가 로컬에 선기록 안 됨. 실돈 꼬리 + 로컬 장부 내구라 pre-live hardening으로 유지.

---

## 5. ★ 안전 전제 (반드시 이해 — 바꾸지 마라)

이중환불 방지가 **경로별 다른 근거**에 기댄다. v6 §5 세 전제 중 셋째가 v7에서 닫혔고, 넷째(marker-only)가 v7에서 신설됐다.

- **confirm ↔ 웹훅 이중환불 — 공유 키가 막음.** 둘 다 같은 `auto-refund:${orderId}:${providerTransactionId}`. (Toss는 둘 다 `paymentKey`, PayPal은 둘 다 capture id로 **수렴** — v7 정찰 확인. 체계적으로 다른 키 내는 케이스 없음.) 테스트 고정.
- **관리자 환불 ↔ 웹훅 — 상태 전제가 막음.** admin은 `Payment.status ∈ {SUCCEEDED, PARTIALLY_REFUNDED}`인 행만 대상. marker는 PENDING/REFUNDED라 admin 대상 아님. ⚠️ **"SUCCEEDED가 성공 tx 마지막"이라는 순서에 의존** — `process.ts` 성공 tx 순서 불변 필수(v7 diff 부재로 유지 확인).
- **★ compensate 자기재시도 창 — v7에서 닫힘(구 "열림/상속").** write-ahead 선기록으로 재진입이 PENDING 만나면 재발사 안 함. TTL·웹훅 dedup 비의존. `ensureUnreconciledMarker`가 락 가드 **앞**으로 이동(v7 reorder) — resolved(REFUNDED) marker에 status 안 바꿈을 코드로 확인(멱등). **claim(PENDING create=락) → provider.refund(tx 밖) → update** 순서·멱등 유지 필수. provider 호출을 `db.$transaction`에 넣지 마라.
- **★ 신규 전제 — marker-only 탐지의 불변식.** #2 탐지가 marker 기준인 근거 = **"auto-refund adjustment stuck(PENDING/FAILED) ⟹ marker PENDING"**. (adjustment를 PENDING에서 빼는 유일 쓰기가 compensate의 `result.status==="SUCCEEDED"` → `resolveUnreconciledMarker(REFUNDED)`라, stuck이면 resolve 안 됨 → marker PENDING 유지.) marker-only가 adjustment-only의 부분집합을 다 덮고, **adjustment 없는 marker**(`reconciliationRequired` 경로)와 **SUCCEEDED-adjustment+PENDING-marker 반쪽 상태**까지 잡음. ⚠️ **이건 현재 불변식** — 미래에 marker를 adjustment와 독립으로 resolve하는 흐름이 생기면 깨져 union 필요. 그 흐름 만들 땐 #2 탐지를 재검토.

---

## 6. 백로그 / 다음

### 6-1. 다음 작업 순서 (권장 — 임박도 바뀌면 재배열)

#1·#2 소진. 재배열:

1. **재고 차감 ↔ 결제 finalize 경계 정찰 (read-only):** `provider.initiate`는 트랜잭션 밖인데, provider 성공 후 트랜잭션 실패 시 재고가 새나/롤백되나(결제 실패 방향 재고 구멍). §6-2 가설검증 연속. v5 §6-1 #2 유지.
2. **existing-SUCCEEDED marker 로컬 해소 (#2 연속):** update↔resolve 사이 크래시로 `adjustment=SUCCEEDED`인데 `marker=PENDING`인 반쪽 상태. provider 재호출 0으로 로컬 정리 가능(v7 정찰: 그 정리 경로 현재 **없음**, 종결값 `REFUNDED`). **#2 ops 대사 절차 + 아래 #5 자동치유 트랙 일부.** 관심사 분리·끝상태 불변 위해 v7에서 의도적으로 뺌.
3. **4단계 취소:** 결제전(PENDING_PAYMENT)=단순 CANCELLED 전이 / 결제후(PAID+)=환불+CANCELLED(3단계 재사용, REFUND_IN_PROGRESS 가드 상속).
4. **웹훅 일시-실패 트랙 (급 낮음 — 도달성 인프라 한정):** dedup을 `processedAt` 기준으로 전환 + 실패 타입 분류(재고-종국 vs DB-일시). ⚠️ 복구 재진입 안전(order status guard + `Payment.idempotencyKey @unique` + tx 롤백)에 의존. 분류는 STRICT `process.ts`가 실패 타입 노출해야 — "필드/타입 하나 추가, 로직·순서 불변"으로 가둘 수 있는지 정찰.
5. **per-payment refund reservation (대사 트랙, 라이브 후):** v5 §6 구멍 셋(5xx 재시도 / stuck PENDING 수동해소 UI / 진짜 동시 race) + **existing-SUCCEEDED 자동치유**(provider 조회 후 REFUNDED 마킹 or 환불 실행)를 한 덩어리로. **실 데이터로 패턴 굳은 뒤.**
6. **AI 피팅 실연동 / go-live** — 우선순위 사람 결정(§9 트랙 진행도).

### 6-2. ★ 근본 가설 — 미확정 처리 불균등 (웹훅·compensate에서 성립)

**가설:** *"외부 부작용(돈·파일·외부 상태)과 로컬 상태 커밋 사이의 창에서, 애매한 실패를 일관되게 미확정으로 표현하는 공통 규약이 없다."* v6 정찰로 웹훅 경로에서 성립 확인, **v7 #1이 compensate 자기재시도 창을 로컬 내구(선기록)로 닫아 이 패턴을 결제 코어에 한 겹 더 적용.** 남은 미성숙: 웹훅 일시-실패 vs 종국-실패 구분(6-1 #4).

**정찰 후보(같은 병일 수 있는 곳):** 재고 차감 ↔ 결제 원자성 경계(6-1 #1), S3 업로드 성공 ↔ DB key 저장 실패(orphan / 깨진 presigned — **얼굴사진이면 컴플라이언스 민감 + 고객 직접 경로**), PayPal OAuth 토큰 부분 실패(작음).

> 처방(먼) = 미확정-처리 패턴을 공통 규약(marker + 대사 인터페이스)으로 뽑아 취소·업로드 공유. **큰 리팩터라 라이브 후 패턴 굳으면.**

### 6-3. ★ 백엔드 프레임워크 (NestJS 전환 검토 → 보류)

**v7에서 검토·보류.** 근거 미성립: Next 서버 레이어에 **이미 도메인 아키텍처**가 있음(server action 중심 mutation, `src/lib` 추상화 interface→impl→index, 결제 factory + webhook strategy, STRICT 존). NestJS 이점(프론트-분리 백엔드 · 팀 컨벤션 강제 · 비-Next 워크로드=큐/크론/gRPC/마이크로서비스)이 현 상태에 **해당 없음**(온라인 전용 단일 프론트, founders 트랙, MVP 바 갓 넘김). 전환 병목은 **토큰이 아니라** STRICT 코어 재작성의 회귀 리스크·재검증 노동 — **나중이 더 쉬움**(도메인 코어가 프레임워크-얇음, 굳을수록 껍데기 교체 안전). **전환도, 전환-대비 특화 작업(YAGNI)도 안 함 — 현 규율(도메인 코어를 `src/lib` 뒤에 얇게)을 유지하는 것 자체가 최선의 전환 대비.** **재검토 트리거 = 모바일 앱 · 다중 프론트 · 팀 확장 · 분리 백엔드 필요 중 실제 발생 시** 근거(Q3)부터 다시 연다. 트리거 안 오면 안 함.

### 6-4. 기타 백로그 (v4~v6에서 이어짐)

- **`admin-orders-data.ts` 한도 근접**(v7 시점 실효 272/300 한도, 여유 좁음 — 실제 수치는 정찰로 갱신) → 다음에 손대면 detail 타입 별 파일 추출 후보. (타입 한 줄 압축은 `max-lines`상 정당 — 원복 시 초과. 강제 아님.)
- **재고 소진 사유 기록 미확인**(종국 재시도무의미 vs 일시 재시도가능 구분) — 6-1 #4와 묶어.
- **재고 복원("반품 입고")**: 환불과 분리된 별 흐름(환불은 재고 안 늘림 — 테스트 고정).
- **마진 엔진**(v4 §4-7): 결제 후 별도. 지금 손대지 않음.
- **결제 작은 정리**: `payOrderAction` pending의 `error` 잔재, `shouldSucceed` mock 파라미터 제거, PayPal OAuth 토큰 캐싱, 외부취소 반영(토스 CANCEL 발송 조건 확인 후).
- **출시 하드닝**(코드로 지금 가능): 에러 모니터링/로깅(greppable 로그 `PAYMENT_AUTO_REFUND_FAILED`·`PAYMENT_RECONCILIATION_REQUIRED`를 능동 신호로 승격 — **#2가 인-프로덕트 어드민으로 반은 해소, 외부 알림은 별개 인프라 트랙**), 보안 점검(mock 라우트 프로덕션 404·env 노출·IAM·어드민 경계), 모바일 반응형 미검증. ⚠️ 통째 미리 하드닝 마라 — 결제·피팅 실물 뒤 다시.
- **사용자측 미구현**: 주문 목록/마이페이지, 리뷰·위시리스트(스키마 자리만), 이메일/알림. 단일 주문 상세만 있음.
- **루트 `/`가 create-next 기본 화면** — 랜딩 필요(라이브 첫인상).

---

## 7. 라이브 전환 (코드 아님 — 사업 트랙)

상세는 **`docs/go-live-checklist.md`**. **★ v6에서 go-live 필수로 승격된 §5-bis 2건이 v7에서 코드측 닫힘**(#1 자기재시도 창, #2 가시화) → **go-live-checklist §5-bis 체크 반영 필요.** 나머지 요약: 토스(KR) 전자결제 계약+심사(카드사 최대 14일=임계경로) → `live_` 키+MID → 웹훅 등록 → 프로덕션 `.env` → 첫거래 검증(secret 흐름·웹훅 수신). PayPal(US·JP) 라이브 앱 → client id/secret + 웹훅 + `PAYPAL_WEBHOOK_ID` → 첫거래. 공통 차단: `prisma migrate deploy`, `NEXTAUTH_URL`/`SECRET`, 웹훅 URL 외부 접근, 시크릿 레포 노출 금지.

---

## 8. 정리 항목 (당장 안 막지만 나중)

- **브라우저 클릭 런타임 제약**: 인앱 브라우저 localhost 차단 가능 → 더블클릭/required 검증은 통합 테스트 + 표준 동작으로 대체·명시. (웹훅 종국-실패·compensate 런타임은 자동화 가능 — 사람-수동 자리 아님.)
- **reason 정책**: 관리자 환불 사유 필수화 완료(v5). 다른 흐름에 환불 생기면 동일 검토.
- **피팅 mock 잔재**(실 VTO/생체 S3 시 폐기): `api/mock-storage`, `MockStorageProvider`, `public/demo-fitting/*`, 결과 `<img>`, `AI_MOCK_*` env.
- **미들웨어 Next 16 deprecation 경고**(동작 정상) — 하드닝 즈음 마이그레이션.
- **`<img>` lint warning 4개**(fitting 페이지·FittingModal) — 피팅 실물 때 `next/image`로. (v7에서 안 늘어남 — 그대로 4개.)
- **VariantMarketPrice 비우기 동작 미확인**, **ADMIN 프로비저닝**(make-admin뿐), **테스트 DB**(CI 붙일 때).

---

## 9. 막는 것 (founders 트랙 — 코드 밖)

- **토스 PG 온보딩**(사업자등록·정산·심사) — 결제 코드 라이브의 전제.
- **피팅 Phase 0**(VTO 벤더·면책 KR/JP·생체 컴플라이언스) — 실 피팅의 전제.
- **법무**(개인정보처리방침·약관·얼굴사진 삭제 흐름).
- **도메인 확정**(Vercel 배포·프로덕션 CORS·OAuth 리다이렉트·결제 콜백/웹훅 URL).
- **경계**: 실제 작업 순서는 온보딩 진행도·도메인 시점·예산·타임라인에 달렸고 이 문서가 모른다. **§6-1의 코드 순서는 "임박도가 바뀌면 재배열" 전제.** v7 시점 go-live 임박 여부는 이 문서 밖 — **다음 세션이 founders 트랙 진행도부터 확인**(임박이면 랜딩·보안점검·모바일 반응형이 §6-1 앞으로 당겨짐).

---

## 10. 작업 방식 (요약 — 상세는 `docs/collaboration-protocol.md`)

- **루프**: 정찰(read-only) → 설계 잠금 → 격리 빌드(한 단계=한 관심사) → 검수 → 격리 커밋.
- **교차검토**: (a)되돌리기 비싸거나 STRICT + (b)틀렸는지 내 시야로 못 알 때 → 받는다. 좁혀 묻고(열린 "개선점?" 금지), 결과는 *입력*.
- **verify 초록 ≠ 작동**: STRICT·실거래·라우트/UI는 런타임 검증(DB·Network status). **diff 부재로 코어 보존 증명**이 강력(v7 실제: `process.ts`·`schema.prisma`·`admin-refund.ts` diff 비어 있음으로 코어·스키마·admin 전제 보존 확인).
- **STRICT 코어 보존**: 로직·순서 불변, 불가피하면 "필드 하나 추가" 최소화 + 원자성 행동 테스트. (v7 #1: create-only→write-ahead는 **쓰기 시점 이동**이지 존재-가드 의미·끝상태 불변.) 한도 만나면 올리지 말고 **분리/압축**(v7: helper extract, 타입 압축은 `max-lines`상 정당).
- **커밋은 사람이 수동**, 논리 단위 분리(기능/문서/규칙 안 섞음). **git이 커밋 SoR**(문서에 push 상태 안 흩뿌림). 의심되면 추측 수정 전 read-only 진단부터.
- **코드 못 보는 쪽(Claude)은 단정 대신 정찰 위임.** "이렇게 구현하라" 단정은 실행 맥락(트랜잭션 시점·데이터 신선도·격리)과 어긋나도 못 잡는다 → "정찰해 판단하고 근거 보고하라"로 열어 위임.
- **v7 세션에서 재확인된 교차검토 값**:
  - (a) **코드 사실이 설계를 두 번 바꿈** — provider 멱등키를 이미 싣고 있어(정찰) "흔한 이중환불"이 within-TTL self-heal로 축소됐고, deduped 응답 처리도 self-heal이라 실제 위험이 "TTL 밖 꼬리 + 로컬 장부 공백"으로 좁혀짐. 내 초기 프레이밍(공통 이중환불 홀)을 정찰이 반증.
  - (b) **검수 중 diff 육안으로 reorder 부작용 포착** — `ensureUnreconciledMarker`가 가드 앞으로 이동한 것을 린터·Codex 자기보고가 못 잡았고 직접 diff 읽기로 발견, 멱등 확인으로 클리어. "STRICT 코어는 diff를 눈으로"의 실물.
  - (c) **reviewer 독립성** — 같은 모델(Opus)은 컨텍스트 리셋해도 **모델 맹점 공유**. 구조 감사엔 다른 모델(Codex) 교차가 값어치(이번 세션 Codex가 union 부재·자기재시도 창을 코드로 메운 실물). 결론은 **채택 아니라 입력**으로 걸러 사람이 잠금.
- **협업 선호(Profile)**: 중대·되돌리기 어려운 결정은 옵션 펼치고 채택/배제 이유 + 고정된 전제 풀기 + 검토 범위 경계 명시. 다른 도구/사람 결과물은 결론이 아니라 입력으로 검증("왜"부터). 단순 사실은 간결히.
