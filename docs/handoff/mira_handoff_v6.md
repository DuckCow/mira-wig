# mira 프로젝트 인계 문서 v6 (Handoff)

**새 세션의 Claude에게**: 너는 mira를 이어서 작업한다. 역할 = **설계 판단 + Codex 프롬프트 작성 + 결과 리뷰**(코드는 직접 안 쓴다 — 프롬프트를 만들고 결과를 검토). 사람이 오케스트레이터·최종 결정·커밋, Codex가 구현·정찰·런타임. **이 문서 = "어디까지 왔나 + 왜 + 다음"(누적 스냅샷).** 중복을 피하려 아래로 **위임**한다:

- 스택·아키텍처·STRICT 존·금액 규칙·결제 코어 구조·웹훅 strategy → **`AGENTS.md`**(Codex 자동 적용, 코드측 SSOT).
- 데이터 모델 필드 → **`prisma/schema.prisma` + migration**(SSOT — 산문 요약 신뢰 말고 스키마를 읽어라).
- 협업 방식("어떻게") → **`docs/collaboration-protocol.md`**.
- 라이브 전환 절차 → **`docs/go-live-checklist.md`**. (v6 세션에서 go-live 필수 2건 추가됨 — §7.)
- v5까지의 결정 상세(환불 3단계·환불 동시성 3층) → **v5 핸드오프 §4·§5 유지**(아래는 요약/참조).
- **새 `[dev]` 채팅 시작**: 이 문서 + `docs/collaboration-protocol.md`를 붙이고(필요 시 `AGENTS.md`도), "다음 작업"(§6)의 **read-only 정찰부터**. 코드 사실은 정찰로 갱신, 결정 근거는 이 문서가 보존. 작업 언어: 한국어. repo: `/Users/duckcow/Documents/mira` (github: DuckCow/mira-wig, private, main).

---

## 1. 프로젝트

- mira = **AI 커스텀 가발 e-커머스.** 사용자가 자기 사진에 가발 스타일을 합성해 써보고(피팅), 마음에 들면 주문 → 제작.
- 온라인 전용 → "안 맞으면 어쩌지"가 주 구매 장벽 → **피팅이 핵심 차별점**. 단 피팅은 주문 경로상 *필수가 아님*(피팅 없이 browse→cart→checkout→pay 완결). **피팅과 커머스는 병렬 출시 트랙**(서로 임계경로 아님).
- 글로벌 지향, 1차 **KR·US·JP** 3개국. MVP 3대 플로우: 피팅 · 브라우즈 · 전환(주문).
- **진짜 해자는 try-on이 아니라 커스터마이징→주문→제작 파이프라인.**
- **제품 바(v6 세션 확정)**: MVP 최소구현이 아니라 **고객이 바로 써도 문제없는 수준**. "고객이 밟는 경로를 정확히"지 "모든 걸 금도금"은 아님 — 이 바 때문에 실돈 경로의 조용한 유실/이중환불을 go-live 전 필수로 승격(§7). 단 §6-2 일반 규약 추출 같은 큰 리팩터는 여전히 라이브 후.

---

## 2. 지금 위치 (한눈에)

- ✅ **커머스 코어**(browse/auth/주소/장바구니/주문/마켓 가격) — 완료(v1~v2).
- ✅ **스토리지 실물화** — 카탈로그 실 S3(`catalogStorage`), 피팅 항상 mock(`fittingStorage`). 분리 런타임 검증됨.
- ✅ **어드민** — 가드 + 카탈로그 CRUD + 마켓 가격/가용성/갭 진단 + 주문 관리(조회·전진 전이).
- ✅ **결제 실 통합** — KR(토스) + US·JP(PayPal), 코드상 라이브 준비완료(v4).
- ✅ **관리자 환불 3단계** — 전액/부분 환불 코어 + UI + 동시성 가드 + 사유 필수. 완료(v5).
- ✅ **웹훅 종국-실패 대칭화** — 웹훅 복구 실패(재고 소진 등)를 confirm과 대칭으로: 보상 환불 + reconciliation marker. **완료(v6 — 이번 세션. 구현+검증+런타임 계약 증명. 미push.)**
- ⏳ **다음 = compensate 이중환불 창 닫기(go-live 필수) + 미확정 marker 가시화(go-live 필수)** → 재고↔결제 경계 정찰 → 4단계 취소 → 웹훅 일시-실패 트랙 → 피팅. (§6)
- 🚫 **막힌 것(founders 트랙)**: 토스 PG 온보딩(심사), 피팅 Phase 0, 법무, 도메인. (§9)

---

## 3. 완료된 것 (누적)

### 3-1. v5까지 (요약 — 상세는 v4·v5 핸드오프)

커머스 코어(가격 스냅샷·재고 원자 차감·idempotency·카트 비우기 한 트랜잭션), 스토리지 실 S3(catalog)/mock(fitting), 어드민(카탈로그 CRUD·마켓 가격·갭 진단·공통 UI·errorCode 중앙맵), 주문 관리(조회 + 전진 전이), 결제 실 통합(토스 통합결제창 + PayPal, 2-phase+멱등+unconfirmed 탐지+이중결제 가드, refund 포트 단일 `amount?`, 웹훅 helper+strategy 주입), 관리자 환불 3단계(refundable helper·REFUND_IN_PROGRESS 가드·사유 필수·환불 동시성 3층). **환불 결정 근거 = v5 §4, 환불 동시성 3층 = v5 §5 — 여전히 live invariant.**

### 3-2. 웹훅 종국-실패 대칭화 (v6 — 이번 세션, 완료. 1커밋 격리 + 런타임 검증)

구조·코어 불변식은 **AGENTS.md §2/§7** + 아래 §5. 코드로 복원 안 되는 **결정 근거**는 §4.

**변경 (webhook-recovery.ts 한 관심사, "push 완료(3커밋 격리: 웹훅 대칭화 / go-live / go-live §5-bis)" — 사람 검토 후 커밋):**
- `RecoverPaymentFromWebhookResult` union에 `unconfirmed` 추가(기존 `success|ignored|failed`에서 확장).
- order select에 `marketCode` 추가.
- `runSuccessTransaction` 실패 catch를 confirm catch와 대칭화: `paidOrderResult` 확인 → `getPaymentProvider(order.marketCode)`로 provider 객체 생성 → `compensateUnconfirmedPayment` + `reconciliationRequired`로 수렴.

**안 건드린 것 (diff 비어 있음으로 확인):** `process.ts`(성공 트랜잭션 순서) · `reconciliation.ts`(compensate 로직·순서·시그니처). provider 객체는 *호출부에서* 만들어 주입만.

**검증:** verify 초록(26 files / 353 tests, +3). 런타임(로컬 HTTP POST): refund 성공 → 200 / marker REFUNDED / adjustment SUCCEEDED / stock 불변. refund 실패 → 200 / marker PENDING / adjustment FAILED / stock 불변. 테스트 3종: 재고 소진→보상, 이중환불 가드 재진입, refund FAILED여도 200+processedAt.

---

## 4. 핵심 의사결정 (v6 웹훅 대칭화 — 코드론 안 보이는 것)

> v5까지의 결정(마켓 모델·SoR·결제 코어 보존·storage 분리·환불 3단계·환불 동시성 3층)은 v4·v5 핸드오프 유지. 아래는 v6에서 새로 굳은 것.

**4-1. ★ 대칭화는 "신설"이 아니라 "confirm의 기존 종결처리를 웹훅이 안 부르던 누락"이었다.** 정찰로 확인: confirm과 웹훅 복구는 **같은 `runSuccessTransaction`·같은 재고 `stock gte` 실패**를 만나는데 confirm catch만 `compensateUnconfirmedPayment`(보상+marker)를 부르고 웹훅 catch는 `failed`만 반환했다. 그래서 처방 = 웹훅 catch를 confirm과 미러(=compensate **재사용**). **v5 세션 "finalize helper 재사용" 함정과 반대 결론인 이유**: 거긴 시점이 달라서(인메모리 vs 트랜잭션 안 재조회) 재사용이 틀렸지만, 여긴 **같은 시점·같은 데이터**("provider 성공 확보 후 local finalize 실패")라 재사용이 맞다. 정의 공유가 아니라 *실행 맥락이 동일*하면 코드 공유가 맞다는 판정.

**4-2. ★★ 웹훅 종국-실패 200의 계약 = "보상 시도 + 미확정/조정 로컬 기록 완료 → PG 재전송 불필요". 환불 성공 보장 아님.** `compensateUnconfirmedPayment`는 provider refund 실패를 **throw 안 하고** `FAILED` adjustment로 기록 후 반환한다. 그래서 200을 "돈 반드시 돌아감"으로 정의하면 코드와 어긋난다. refund 실패 시 **PENDING marker + FAILED adjustment가 운영 위임 지점**(confirm과 동일 — confirm도 refund 실패를 marker로 운영에 넘김). 재고 소진(종국 실패)은 재시도 무의미라 200 종결이 맞다 — non-2xx를 주면 PG 재전송이 무한루프. 이 계약이 대칭화의 핵심이고 테스트로 고정됨(refund FAILED여도 200).

**4-3. provider 접근 = `order.marketCode` → `getPaymentProvider`.** 기존 호출부 전부 marketCode 축(`process`=`order.marketCode`, admin=`refund.marketCode`, factory=`"KR|US|JP"`). 웹훅 input의 `provider?: string`은 strategy가 넣는 `"toss"/"paypal"` **이름**이라 factory에 못 쓴다. `Order.marketCode`는 스키마에 있으나 웹훅 recovery가 select 안 하던 것 → select 한 줄 추가로 해결. **배포 정합 불변**: 실 PG 웹훅이 오는 market은 `PAYMENT_LIVE_MARKETS`에 있어야 함(아니면 factory가 mock provider 반환 → mock으로 refund 시도). go-live 게이트(§3-3)가 이걸 담당하나 "웹훅 복구도 이 게이트에 의존"을 명시.

---

## 5. ★ 웹훅 대칭화의 안전 전제 (반드시 이해 — 바꾸지 마라)

이중환불을 막는 구조가 **경로별로 다른 근거**에 기댄다. 대칭화가 이 전제들을 유지해야 안전하다.

- **confirm ↔ 웹훅 이중환불 — 공유 키가 막음.** 둘 다 같은 `compensateUnconfirmedPayment` → 같은 `auto-refund:${orderId}:${providerTransactionId}` idempotencyKey. 한쪽이 남긴 adjustment를 다른 쪽 가드가 본다. 테스트로 고정됨.
- **관리자 환불 ↔ 웹훅 이중환불 — 상태 전제가 막음.** admin은 키가 다르나(`admin_refund:...`) `Payment.status ∈ {SUCCEEDED, PARTIALLY_REFUNDED}`인 행만 대상. **stuck 시점엔 `Payment SUCCEEDED`가 성공 트랜잭션 안 마지막이라 미커밋 → admin이 그 주문에 도달 못 함.** 보상 후에도 marker는 PENDING/REFUNDED라 admin 대상 상태 아님. ⚠️ **이 안전은 "SUCCEEDED가 tx 마지막"이라는 순서에 의존** — 대칭화/후속이 이 순서 건드리면 전제 깨짐. `process.ts` 성공 트랜잭션 순서 불변 유지 필수.
- **★ compensate 자기 재시도 이중환불 창 — 열려 있음(분리 과제).** `compensate`는 `provider.refund` **먼저** → `auto-refund` adjustment 기록 **나중**. refund 성공 후 기록 전 크래시하면 다음 진입 시 키가 없어 **provider.refund가 재차 나감 = 실고객 이중환불.** confirm+웹훅 **공유 창**. 대칭화가 이 창을 **새로 만들지 않음**(compensate 공유라 진입점만 늘고 창은 하나 유지) → "상속" 결정. **닫기 = go-live 필수, 별도 STRICT 결제 코어 과제**(§7, go-live §5-bis). §6-2 일반 규약과 별개(실돈 이중환불이라 못 미룸).

---

## 6. 백로그 / 다음

### 6-1. 다음 작업 순서 (권장)

1. **★ compensate 자기 재시도 이중환불 창 닫기 (go-live 필수, STRICT 결제 코어):** provider.refund 호출 **전** provider transaction 단위로 기존 환불 여부를(조정기록 or provider 상태 조회로) 확인하는 가드 추가. 기능과 분리된 독립 과제. §5·go-live §5-bis. **compensate는 confirm도 쓰는 공유 코어라 이 변경은 confirm 동작에도 영향** — 행동 테스트로 confirm 회귀 고정 필수.
2. **★ 미확정 marker 능동 가시화 (go-live 필수, 어드민 UI/NORMAL — 강도는 #1보다 아래):** 현재 refund FAILED stuck은 어드민 **주문 상세를 열면** 보이나(PENDING marker·FAILED adjustment 렌더됨), **목록/대시보드에 능동적으로 안 뜸** → "결제 대기" 더미에 섞여 잠복(실돈 유실이 우연에 걸림). `unconfirmed:` Payment 또는 `auto-refund`/`FAILED` adjustment 있는 order를 목록 배지/조회로 드러냄. 새 대시보드 아니라 기존 목록 플래그 수준. (greppable 로그 `PAYMENT_AUTO_REFUND_FAILED`·`PAYMENT_RECONCILIATION_REQUIRED`는 있으나 능동 신호 아님.)
3. **재고 차감 ↔ 결제 finalize 경계 정찰 (read-only):** `provider.initiate`는 트랜잭션 밖인데, provider 성공 후 트랜잭션 실패 시 재고가 새나/롤백되나(결제 실패 방향 재고 구멍). v5 §6-1 #2 유지.
4. **4단계 취소:** 결제전(PENDING_PAYMENT)=단순 CANCELLED 전이 / 결제후(PAID+)=환불+CANCELLED(3단계 재사용, REFUND_IN_PROGRESS 가드 상속).
5. **웹훅 일시-실패 트랙 (급 낮음 — 도달성 인프라 한정):** dedup을 `processedAt` 기준으로 전환(미처리 재전송이 복구 재시도) + 실패 타입 분류(G: 재고-종국 vs DB-일시). ⚠️ 전제: 복구 재진입 안전(현재 order status guard + `Payment.idempotencyKey @unique` + tx 롤백에 의존 — dedup 완화 시 이 롤백 경로를 밟음). **분류(G)는 STRICT `process.ts`가 실패 타입 노출해야** — "필드/타입 하나 추가, 로직·순서 불변"으로 가둘 수 있는지 정찰.
6. **per-payment refund reservation (대사 트랙):** v5 §6 남은 구멍 셋(5xx 재시도 / stuck PENDING 수동해소 UI / 진짜 동시 race 완전차단)을 한 덩어리로. **실 데이터로 실패 패턴 굳은 뒤**(라이브 후).
7. **AI 피팅 실연동 / go-live** — 우선순위 사람 결정(§9 트랙 진행도).

### 6-2. ★ 근본 가설 — 미확정 처리 불균등 (웹훅에서 성립 확인됨)

**가설:** *"외부 부작용(돈·파일·외부 상태)과 로컬 상태 커밋 사이의 창에서, 애매한 실패를 일관되게 미확정으로 표현하는 공통 규약이 없다."* **v6 정찰로 웹훅 경로에서 성립 확인**: confirm은 `Payment(PENDING,"unconfirmed:")` marker + 보상/해소 규약이 있는데 웹훅은 원래 `processedAt=null` 행만 남기고 승격 안 했다. **v6 대칭화가 웹훅 종국-실패를 confirm 패턴으로 물려받아 부분 해소** — 단 (a) 웹훅 일시-실패 vs 종국-실패 구분(G) 미성숙, (b) compensate 자기 재시도 창(§5)이 공유 미해결로 남음.

**정찰 후보(코드 미확인 — 같은 병일 수 있는 곳):** 재고 차감 ↔ 결제 원자성 경계(6-1 #3), S3 업로드 성공 ↔ DB key 저장 실패(orphan / 깨진 presigned. **얼굴사진이면 컴플라이언스 민감 + 고객 직접 경로** — 제품 바 올라간 뒤 별도 정찰 후보로 플래그), PayPal OAuth 토큰 부분 실패(작음).

> 처방(먼) = 결제/웹훅의 미확정-처리 패턴을 공통 규약(marker + 대사 인터페이스)으로 뽑아 취소·업로드 공유. **큰 리팩터라 라이브 후 패턴 굳으면.** compensate 이중환불 창(§5)·가시화(6-1 #2)는 이 규약과 **다른 트랙**(실돈 운영 안전이라 go-live 전).

### 6-3. 기타 백로그 (v4~v5에서 이어짐)

- **재고 소진 사유 기록 미확인**: 웹훅 종국-실패가 남기는 marker/adjustment에 "재고 소진" 사유가 실려 운영이 종국(재시도 무의미) vs 일시(재시도 가능)를 구분할 수 있나 — v6에서 미확인. G(6-1 #5)와 묶어 확인.
- **재고 복원("반품 입고")**: 환불과 분리된 별개 운영 흐름(환불은 재고 안 늘림 — 행동 테스트로 고정됨).
- **마진 엔진**(v4 §4-7): 결제 후 별도. 지금 손대지 않음.
- **결제 작은 정리**: `payOrderAction` pending의 `error` 잔재, `shouldSucceed` mock 파라미터 제거, PayPal OAuth 토큰 캐싱, 외부취소 반영(토스 CANCEL 발송 조건 확인 후).
- **출시 하드닝**(코드로 지금 가능): 에러 모니터링/로깅(실사용자엔 사실상 필수 — 위 greppable 로그를 능동 신호로 승격하는 것도 여기), 보안 점검(mock 라우트 프로덕션 404·env 노출·IAM·어드민 경계), 모바일 반응형 미검증. ⚠️ 통째 미리 하드닝 마라 — 결제·피팅 실물 뒤 다시 해야 함.
- **사용자측 미구현**: 주문 목록/마이페이지, 리뷰·위시리스트(스키마 자리만), 이메일/알림. 단일 주문 상세만 있음.
- **루트 `/`가 create-next 기본 화면** — 랜딩 필요(라이브 첫인상).

---

## 7. 라이브 전환 (코드 아님 — 사업 트랙 + v6 추가 필수 2건)

상세는 **`docs/go-live-checklist.md`**. 요약: 토스(KR) 전자결제 계약+심사(카드사 최대 14일=임계경로) → `live_` 키+MID → 웹훅 등록 → 프로덕션 `.env` → 첫거래 검증(secret 흐름·웹훅 수신). PayPal(US·JP) 라이브 앱 → client id/secret + 웹훅 + `PAYPAL_WEBHOOK_ID` → 첫거래. 공통 차단: `prisma migrate deploy`, `NEXTAUTH_URL`/`SECRET`, 웹훅 URL 외부 접근, 시크릿 레포 노출 금지.

**★ v6 세션에서 go-live 필수로 승격된 코드 작업 2건** (go-live-checklist에 §5-bis로 등록 — §5의 "코드 옳고 확인만" 항목과 **다른 계열**: 이건 코드 수정 필요):
1. **compensate 자기 재시도 이중환불 창 닫기** (STRICT 결제 코어) — §5·6-1 #1. 실돈 *두 번 나감*.
2. **미확정 marker 능동 가시화** (어드민 UI) — 6-1 #2. 실돈 *잠복 유실*. 강도는 #1 아래.

둘 다 §6-2 일반 규약(라이브 후)과 다른 트랙 — 실돈 운영 안전이라 안 미룬다.

---

## 8. 정리 항목 (당장 안 막지만 나중)

- **브라우저 클릭 런타임 제약**: 인앱 브라우저 localhost 차단 가능 → 더블클릭/required 검증은 통합 테스트 + 표준 동작으로 대체·명시. (웹훅 종국-실패 런타임은 자동화 가능 — 카드사 키패드 같은 사람-수동 자리 아님.)
- **reason 정책**: 관리자 환불 사유 필수화 완료(v5). 다른 흐름에 환불 생기면 동일 검토.
- **피팅 mock 잔재**(실 VTO/생체 S3 시 폐기): `api/mock-storage`, MockStorageProvider, `public/demo-fitting/*`, 결과 `<img>`, `AI_MOCK_*` env.
- **미들웨어 Next 16 deprecation 경고**(동작 정상) — 하드닝 즈음 마이그레이션.
- **`<img>` lint warning 4개**(fitting 페이지·FittingModal) — 피팅 실물 때 `next/image`로. (v6 변경으로 안 늘어남 — 그대로 4개.)
- **VariantMarketPrice 비우기 동작 미확인**, **ADMIN 프로비저닝**(make-admin뿐), **테스트 DB**(CI 붙일 때).

---

## 9. 막는 것 (founders 트랙 — 코드 밖)

- **토스 PG 온보딩**(사업자등록·정산·심사) — 결제 코드 라이브의 전제.
- **피팅 Phase 0**(VTO 벤더·면책 KR/JP·생체 컴플라이언스) — 실 피팅의 전제.
- **법무**(개인정보처리방침·약관·얼굴사진 삭제 흐름).
- **도메인 확정**(Vercel 배포·프로덕션 CORS·OAuth 리다이렉트·결제 콜백/웹훅 URL).
- **경계**: 실제 작업 순서는 온보딩 진행도·도메인 시점·예산·타임라인에 달렸고 이 문서가 모른다. **v6 시점 go-live 임박 아님**(founders 트랙 진행 중). 그래서 §6-1의 코드 순서는 "임박도가 바뀌면 재배열" 전제.

---

## 10. 작업 방식 (요약 — 상세는 `docs/collaboration-protocol.md`)

- **루프**: 정찰(read-only) → 설계 잠금 → 격리 빌드(한 단계=한 관심사) → 검수 → 격리 커밋.
- **교차검토**: (a)되돌리기 비싸거나 STRICT + (b)틀렸는지 내 시야로 못 알 때 → 받는다. 좁혀 묻고(열린 "개선점?" 금지), 결과는 *입력*.
- **verify 초록 ≠ 작동**: STRICT·실거래·라우트/UI는 런타임 검증(DB·Network status).
- **STRICT 코어 보존**: 로직·순서 불변, 불가피하면 "필드 하나 추가" 최소화 + 원자성 행동 테스트. **diff 부재로 불변 증명**이 강력(v6 실제: process·reconciliation diff 비어 있음으로 코어 보존 확인).
- **커밋은 사람이 수동**, 논리 단위 분리(기능/문서/규칙 안 섞음). 의심되면 추측 수정 전 read-only 진단부터.
- **코드 못 보는 쪽(Claude)은 단정 대신 정찰 위임.** "이렇게 구현하라" 단정은 실행 맥락(트랜잭션 시점·데이터 신선도·격리)과 어긋나도 못 잡는다 → "정찰해 판단하고 근거 보고하라"로 열어 위임.
- **v6 세션에서 재확인된 교차검토 값**: Codex가 내 설계 사각을 코드로 메운 실제 2건 — (a) 웹훅 결과 union에 `unconfirmed` 부재(내 "confirm 미러" 설계가 타입 안 맞음), (b) compensate 자기 재시도 창(나는 "타 경로 교차"만 봤는데 Codex가 "같은 경로 재시도"를 잡음). 둘 다 **채택 아니라 입력**으로 받아 내가 격리·최소변경으로 거른 뒤 사람이 잠금 — 이 비대칭 합치기가 요점.
- **협업 선호(Profile)**: 중대·되돌리기 어려운 결정은 옵션 펼치고 채택/배제 이유 + 고정된 전제 풀기 + 검토 범위 경계 명시. 다른 도구/사람 결과물은 결론이 아니라 입력으로 검증. 단순 사실은 간결히.
