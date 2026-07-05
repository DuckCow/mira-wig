# mira 프로젝트 인계 문서 v8 (Handoff)

**새 세션의 Claude에게**: 너는 mira를 이어서 작업한다. 역할 = **설계 판단 + Codex 프롬프트 작성 + 결과 리뷰**(코드는 직접 안 쓴다 — 프롬프트를 만들고 결과를 검토). 사람이 오케스트레이터·최종 결정·커밋, Codex가 구현·정찰·런타임. **이 문서 = "어디까지 왔나 + 왜 + 다음"(누적 스냅샷).** 중복을 피하려 아래로 **위임**한다:

- 스택·아키텍처·STRICT 존·금액 규칙·결제 코어 구조·웹훅 strategy → **`AGENTS.md`**(Codex 자동 적용, 코드측 SSOT).
- 데이터 모델 필드 → **`prisma/schema.prisma` + migration**(SSOT — 산문 요약 신뢰 말고 스키마를 읽어라).
- 협업 방식("어떻게") → **`docs/collaboration-protocol.md`**.
- 라이브 전환 절차 → **`docs/go-live-checklist.md`**. (§5-bis 2건은 v7에서 코드측 닫힘 + **go-live-checklist에 이미 반영돼 있음 확인** — §7. v8에서 프로덕션 PG major=18 항목 추가.)
- v5까지의 결정 상세(환불 3단계·환불 동시성 3층) → **v5 핸드오프 §4·§5**. v6 상세(웹훅 종국-실패 대칭화) → **v6 핸드오프 §3-2·§4·§5**. v7 상세(#1 compensate 자기재시도 창·#2 marker 가시화) → **v7 핸드오프 §3-2·§3-3·§4·§5**. 아래는 v7 대비 **델타**.
- **새 `[dev]` 채팅 시작**: 이 문서 + `docs/collaboration-protocol.md`를 붙이고(필요 시 `AGENTS.md`도), "다음 작업"(§6)의 **read-only 정찰부터**. 코드 사실은 정찰로 갱신, 결정 근거는 이 문서가 보존. 작업 언어: 한국어. repo: `DuckCow/mira-wig` (github, private, main). 로컬 체크아웃 경로는 환경별 — 이 문서가 repo 안에 있으면 그 루트 기준.

---

## 1. 프로젝트

- mira = **AI 커스텀 가발 e-커머스.** 사용자가 자기 사진에 가발 스타일을 합성해 써보고(피팅), 마음에 들면 주문 → 제작.
- 온라인 전용 → "안 맞으면 어쩌지"가 주 구매 장벽 → **피팅이 핵심 차별점**. 단 피팅은 주문 경로상 *필수 아님*(피팅 없이 browse→cart→checkout→pay 완결). 피팅과 커머스는 병렬 출시 트랙.
- 글로벌 지향, 1차 **KR·US·JP**. MVP 3대 플로우: 피팅 · 브라우즈 · 전환(주문).
- **진짜 해자는 try-on이 아니라 커스터마이징→주문→제작 파이프라인.**
- **제품 바(v6 확정)**: MVP 최소구현이 아니라 **고객이 바로 써도 문제없는 수준**. 이 바 때문에 실돈 경로의 조용한 유실/이중환불이 go-live 전 필수로 승격됐고 — v7에서 그 2건(§5-bis) 코드측 닫힘. 단 §6-2 일반 규약 추출 같은 큰 리팩터는 여전히 라이브 후.

---

## 2. 지금 위치 (한눈에)

- ✅ **커머스 코어**(browse/auth/주소/장바구니/주문/마켓 가격) — 완료(v1~v2).
- ✅ **스토리지 실물화** — 카탈로그 실 S3(`catalogStorage`), 피팅 항상 mock(`fittingStorage`).
- ✅ **어드민** — 가드 + 카탈로그 CRUD + 마켓 가격/가용성/갭 진단 + 주문 관리(조회·전진 전이).
- ✅ **결제 실 통합** — KR(토스) + US·JP(PayPal), 코드상 라이브 준비완료(v4).
- ✅ **관리자 환불 3단계** — 전액/부분 환불 코어 + UI + 동시성 가드 + 사유 필수(v5).
- ✅ **웹훅 종국-실패 대칭화** — 웹훅 복구 실패를 confirm과 대칭으로(보상 환불 + reconciliation marker)(v6).
- ✅ **compensate 자기재시도 이중환불 창 닫기** — write-ahead 선기록(v7. go-live §5-bis-1 코드측 닫힘).
- ✅ **미확정·환불실패 marker 능동 가시화** — marker-only 탐지 + 목록 배지/필터칩/카운트, surface-only(v7. go-live §5-bis-2 코드측 닫힘).
- ✅ **CI 파이프라인** — GitHub Actions(push main + PR, Postgres 18 service + Node 24, `npm run verify`), PR #1 병합(**v8 이번 세션**. §3-2).
- ✅ **로컬·CI 버전 정렬** — Postgres 14→18(구 14는 2026-11 EOL), Node 25(비-LTS)→24 LTS + `.nvmrc` 신설(**v8 이번 세션**. §3-3).
- ✅ **사용자 주문 목록 페이지** — `/orders`(자기 주문 세로 카드 리스트·대표 품목 썸네일·"외 N건"·상태·총액), Header 진입점, `getUserOrders` read model(**v8 이번 세션**. §3-4). 사용자측 "단일 주문 상세만" 공백의 일부 해소.
- ⏳ **다음** = 재고↔결제 경계 정찰 / existing-SUCCEEDED marker 로컬 해소 / 4단계 취소 / **결제 후 처리 재설계(§6-5 — 주문 생성·재고·카트를 결제 후로; 방향 확정, 정찰·설계 미완)** — **순서는 founders 트랙 임박도가 지배**(§6·§9).
- 🚫 **막힌 것(founders 트랙)**: 토스 PG 온보딩(심사), 피팅 Phase 0, 법무, 도메인(§9).

> 이번 세션 변경은 **커밋 완료**(사람 수동). 이하 상태는 그 커밋 기준. **커밋/push 여부의 SoR은 git이다** — 문서에 push 상태를 흩뿌리지 않는다.

---

## 3. 완료된 것 (누적)

### 3-1. v7까지 (요약 — 상세는 v4·v5·v6·v7 핸드오프)

커머스 코어(가격 스냅샷·재고 원자 차감·idempotency·카트 비우기 한 트랜잭션), 스토리지 실 S3(catalog)/mock(fitting), 어드민(카탈로그 CRUD·마켓 가격·갭 진단·주문 관리), 결제 실 통합(토스 통합결제창 + PayPal, 2-phase+멱등+unconfirmed 탐지+이중결제 가드, refund 포트 단일 `amount?`, 웹훅 helper+strategy 주입), 관리자 환불 3단계(refundable helper·REFUND_IN_PROGRESS 가드·사유 필수·환불 동시성 3층), 웹훅 종국-실패 대칭화(confirm 미러=`compensateUnconfirmedPayment` 재사용), **#1 compensate 자기재시도 창 닫기(write-ahead 선기록)·#2 미확정 marker 가시화(v7)**. **환불 근거 = v5 §4·§5, 웹훅 대칭화·안전전제 = v6 §4·§5, #1/#2 근거 = v7 §4·§5 — 여전히 live invariant.**

### 3-2. CI 파이프라인 도입 (v8 — 완료, PR #1 병합)

- **정찰 확인:** `.github/` 없음, 로컬 테스트 하네스(vitest·`.env.test`·`test:setup` 스크립트·randomID+deleteMany 격리) 존재. 없던 것 = 워크플로 + Postgres service + CI DATABASE_URL + migrate 단계.
- **빌드 (`.github/workflows/ci.yml`):** push(main)+PR 트리거, Postgres 18 service container, `npm ci` → `npx prisma generate` → `npx prisma migrate deploy` → `npm run verify`. `.nvmrc`(24) 신설.
- **병합:** 브랜치 `ci/add-github-actions`, 두 커밋(ci.yml / .nvmrc) 분리, PR #1로 병합. Actions 초록(verify job ~1m43s).
- **PAT `workflow` 스코프** 이슈 해결(워크플로 파일 push 권한).

### 3-3. 로컬·CI 버전 정렬 saga (v8 — 완료)

- **Postgres 14→18:** 로컬 14.20이었고 14 EOL = **2026-11-12**(postgresql.org 확인, ~4개월). 최신 stable = 18. 로컬·CI·프로덕션 전부 18로 정렬(원칙: 우연히 로컬에 깔린 버전이 아니라 **최신 stable + 장기 지원**에 맞춤). 로컬 = Homebrew `postgresql@18` link 전환(`psql -V` 18.4). 테스트 DB 재생성(`wig_platform_test` + migrate, 10 migration).
- **Node 25→24 LTS:** 로컬 v25.2.1(**홀수 major = 비-LTS 개발라인, 곧 EOL**)이었음. 24 = Active LTS. 로컬 = Homebrew `node@24` 설치 + `node`(무버전, 25→26 대기중) 제거(무버전 formula는 자동 major 상승 → LTS 고정 위해 제거). `node -v` v24.18.0. CI·`.nvmrc`도 24.
- **⚠️ 로컬 툴체인 주의(Homebrew):** mira는 **nvm 아님, Homebrew로 Node 관리.** 버전 전환은 `brew install node@24 && brew unlink node && brew link --overwrite --force node@24`. `.nvmrc`는 있으나 자동 인식 도구(nvm/fnm) 미사용 — 참조값일 뿐. 무버전 `node` formula를 다시 깔면 major 자동 상승 위험.
- **docker-compose = 출시 막바지로 보류**(YAGNI — 단일 개발자, 멀티프로젝트 현실 없음. 재현성/멀티환경 이점이 그때까지 불필요, 나중에도 저렴). 로컬 검증용 컨테이너(`mira-pg18-ci`, 55432)는 host 18 검증(360/360×3) 후 정리 완료.
- **개발 DB(`wig_platform`) = 18 서버에 재생성**(`createdb` + `migrate deploy` + `db seed`). seed는 스타일 10개·마켓·가격만 생성(주문 안 만듦, 오히려 전 테이블 deleteMany 선행 — **주문 만든 뒤 seed 재실행 금지**). seed 스타일은 `imageKeys:[]`(이미지 없음).

### 3-4. 사용자 주문 목록 페이지 "A" (v8 — 완료, 2커밋 분리 + 런타임 검증)

- **정찰 확인:** 사용자 스코프 목록 read model **없음**(`getOrderById` 단건 전용). admin 목록 read model(`admin-orders-data.ts`, 302줄=한도 초과)은 재사용 불가(requireAdmin + admin 필드 + userId 스코프 없음 = 정의 공유 아닌 **스코프 불일치**). snapshot에 `styleName`+`coverImageKey` 있음. 단건 상세조차 썸네일 placeholder(사용자 주문 UI에 이미지 해소 아직 없음). Header에 주문목록 진입점 없음.
- **설계 잠금:** 바깥 = 내 주문들 세로 리스트(전체 렌더, 페이지네이션 없음 — 개인 주문 소량, styles/cart 패턴). 각 주문 카드 = **대표 품목(첫 항목) 썸네일+이름 + "외 N건"**(품목 2개 이상) + 주문번호/날짜/상태/총액. 클릭 → 기존 `/orders/[id]`.
- **빌드 (커밋 ii — 기능):** `src/lib/order/list.ts`(신규 — `getUserOrders(userId)`: `where userId`, 주문 최신순, `items: { orderBy: { id: "asc" }, take: 1 }`로 **대표 결정적**, `_count.items`, 대표 coverImageKey → `catalogStorage.getViewUrl` 주문당 1회). `src/app/(shop)/orders/page.tsx`(신규). `src/components/features/Header.tsx`("내 주문" 링크).
- **빌드 (커밋 i — refactor):** `src/lib/order/snapshot.ts`(신규 — snapshot parser/serializer 공용화). **raw diff 육안 확인 = 순수 이동**(export 키워드만 추가, 로직 0 변경). STRICT 생성 tx(`runCreateOrderTx`)가 `snapshotToJson`을 쓰나 **함수 불변이라 동작 보존** — 불변 행동 테스트 추가는 기존 `buildSnapshotData` 테스트로 커버돼 과함. db.ts(247줄→분리)/types.ts/index.ts 관련 정리.
- **런타임 검증(사람, dev 서버):** 로그인→/orders 렌더 ✅, 카드·"외 N건"(3품목→"외 2건", 1품목→없음) ✅, placeholder(seed 이미지 없어 기본) ✅, 최신순 ✅, 클릭→상세 ✅. `_count`·nullable 우려 런타임 해소. **실제 이미지 썸네일은 미검증**(seed `imageKeys:[]` — 카탈로그 이미지 생길 때. 목록 해소 코드는 cart `getViewUrl`과 동일 패턴이라 간접 신뢰).
- **커밋 분리:** (i) snapshot refactor / (ii) 목록 기능. verify 초록, 360 tests.

**전체:** verify 초록(26 files / 360 tests). `<img>` lint warning 4개 불변.

---

## 4. 핵심 의사결정 (v8 — 코드론 안 보이는 것)

> v7까지 결정(마켓 모델·SoR·결제 코어 보존·storage 분리·환불 3단계·동시성 3층·웹훅 대칭화·write-ahead 선기록·marker-only 탐지)은 v4~v7 핸드오프 유지. 아래는 v8에서 굳은 것.

**4-1. 버전 정렬 원칙 = "우연히 로컬에 깔린 값이 아니라 최신 stable + 장기 지원에 맞춘다".** PG는 로컬(14)이 너무 낮아(EOL 임박) 최신 stable(18)로 **올렸고**, Node는 로컬(25)이 stable이 아니라(비-LTS 개발라인) LTS(24)로 **내렸다** — 방향 반대, 같은 목표(로컬·CI·프로덕션 3곳 정렬 + 오래 지원받는 값). `.nvmrc` 신설도 드리프트 방지(단, mira는 Homebrew라 자동 인식 도구 없음 → 참조값).

**4-2. CI = 월간 순서 "CI → A(주문목록) → B"의 첫 항목.** founders 트랙 ~1개월(토스 PG 온보딩 심사 최대 14일 = 임계경로) 기준, X축(go-live 인에이블러)·Y축(마감 무관 + 지금 최저비용)·Z축(라이브 후 대사)으로 나눠 **CI(반복 검증 인프라, deadline 무관·저비용) → A(사용자측 MVP 공백) → B(백로그)** 순서 확정. CI가 이후 모든 작업의 회귀 안전망.

**4-3. A read model = 신규 파일 분리 (admin 재사용 배제).** `admin-orders-data.ts`가 302줄(한도 초과) + admin 스코프(requireAdmin·admin 필드·userId 없음)라 **정의 공유가 아니라 스코프 불일치** → 재사용 시 안 맞거나 한도 초과. 프로토콜 "정의 공유·접근 분리"에 걸림. `order/db.ts`(247줄)에 얹으면 300 근접 → 새 파일 `order/list.ts`로 분리(한도 만나면 올리지 말고 분리).

**4-4. A 썸네일 = 시각적 목록 채택하되 실제 해소는 미룸.** 대표 품목 썸네일을 넣기로(사용자 결정, UX). 단 seed 스타일이 `imageKeys:[]`라 **실제 이미지 해소는 지금 데이터로 검증 불가** → placeholder+nullable 처리만 검증. 실제 이미지 스타일 만들려면 S3 업로드가 필요해 A 스코프를 넘음(YAGNI) → 카탈로그에 이미지 생길 때 자연 검증(목록 해소 코드는 cart와 동일 패턴이라 간접 신뢰).

**4-5. snapshot 공용화 = 순수 이동으로 판정 (raw diff 육안).** Codex 자기보고("동일합니다")가 아니라 **raw git diff를 직접 읽어** export 키워드만 추가된 순수 이동임을 확인(v7 §10 "STRICT는 diff 눈으로" + reorder 부작용 전례 계승). STRICT 생성 tx가 쓰는 함수지만 로직 불변이라 안전 — 불변 행동 테스트 추가는 기존 테스트로 커버돼 과함(YAGNI). 단 "STRICT 함수 순수 이동"은 커밋 메시지에 명시(추적용).

---

## 5. ★ 안전 전제 (반드시 이해 — 바꾸지 마라)

이중환불 방지가 **경로별 다른 근거**에 기댄다. v7 §5 네 전제(공유 키 / 상태 전제 / compensate 자기재시도 창 / marker-only)는 **여전히 live invariant — v7 §5 그대로 유지**. v8에서 다섯째(initiate-즉시성공=Mock 전용)가 신설됐다. 아래는 v8 추가분만 — 나머지 넷은 **v7 §5를 읽어라**.

### 5-5. ★ 신규 불변식 — processPayment의 initiate-즉시성공 경로는 Mock/테스트 전용 (v8)

**불변식:** `processPayment`에서 `provider.initiate()`가 `SUCCEEDED`를 반환한 뒤 `handleSuccess`가 실패하는 두 경로 — (a) 사전 재고조회 실패→`runFailureTransaction`, (b) `runSuccessTransaction` throw로 롤백 — 에는 **compensate/marker 보상이 없다.** 확인된 사실(v8 정찰): 이 경로는 **실 provider로 도달 불가**다. Toss `initiate`는 항상 `PENDING`(결제창=클라), PayPal `initiate`도 order 생성 후 `PENDING`+approveURL이고, **실 캡처는 둘 다 `confirm`에서**(Toss `/payments/confirm`, PayPal `/capture`) 일어난다. 실 결제 배선도 `callback/route`·`PayPalPanel → confirmPayment`(보상 있음)이고, `payOrderAction → processPayment`의 initiate-즉시성공은 **Mock provider(또는 테스트 주입 provider)만** 탄다. → 현재 실돈 유실 홀 아님.

⚠️ **이 불변식이 깨지는 조건:** 동기 캡처 provider(initiate 시점에 실제 캡처=SUCCEEDED)를 붙이면 — 특히 **EU 후속 provider**(AGENTS §1·§2 "EU=후속") 중 그런 게 있으면 — 이 보상 공백이 **실돈 경로로 부활**한다. 그 provider를 실 라이브하기 전: (1) 두 실패 경로에 confirm/webhook과 대칭인 보상(`compensateUnconfirmedPayment`+marker) 추가, 또는 (2) initiate-즉시성공을 Mock 전용으로 강제하는 런타임 가드/tripwire(예: live 마켓인데 initiate가 SUCCEEDED면 throw)를 넣는다. **YAGNI라 지금 코드/가드는 안 만들고 이 기록만 남김** — 없는 provider용 강제를 선제 작성 안 함(§6-3 정신). 재검토 트리거 = 동기캡처 provider 실착수. 관련: §6-1 #1(재고↔결제 경계 정찰이 이 경로를 확인함), §6-1 #5(reservation), §6-4(EU).

---

## 6. 백로그 / 다음

### 6-1. 다음 작업 순서 (권장 — 임박도 바뀌면 재배열)

CI·A(주문목록) 소진. 재배열:

1. **재고 차감 ↔ 결제 finalize 경계 정찰 (read-only):** `provider.initiate`는 트랜잭션 밖인데, provider 성공 후 트랜잭션 실패 시 재고가 새나/롤백되나(결제 실패 방향 재고 구멍). §6-2 가설검증 연속. **§6-5(결제 후 처리 재설계)와 겹침 — 특히 "재고 차감이 주문 레코드에 의존하는지"가 §6-5의 B/C1 순서를 가르므로 함께 확인.**
2. **existing-SUCCEEDED marker 로컬 해소 (#2 연속):** update↔resolve 사이 크래시로 `adjustment=SUCCEEDED`인데 `marker=PENDING`인 반쪽 상태. provider 재호출 0으로 로컬 정리 가능(v7 정찰: 그 정리 경로 현재 **없음**, 종결값 `REFUNDED`). #2 ops 대사 절차 + #5 자동치유 트랙 일부.
3. **4단계 취소:** 결제전(PENDING_PAYMENT)=단순 CANCELLED 전이 / 결제후(PAID+)=환불+CANCELLED(3단계 재사용, REFUND_IN_PROGRESS 가드 상속). **§6-5(결제 후 처리 재설계)의 B(결제 후 주문 생성) 채택 시 "결제전 PENDING_PAYMENT 주문" 자체가 없어져 이 취소의 결제전 케이스가 사라질 수 있음 — 상호작용 주의.**
4. **웹훅 일시-실패 트랙 (급 낮음 — 도달성 인프라 한정):** dedup을 `processedAt` 기준으로 전환 + 실패 타입 분류(재고-종국 vs DB-일시). ⚠️ 복구 재진입 안전(order status guard + `Payment.idempotencyKey @unique` + tx 롤백)에 의존.
5. **per-payment refund reservation (대사 트랙, 라이브 후):** v5 §6 구멍 셋 + existing-SUCCEEDED 자동치유를 한 덩어리로. **실 데이터로 패턴 굳은 뒤. ⚠️ §6-5(결제 후 처리 재설계)의 C1(재고 후치)이 요구하는 "재고 예약"과 정확히 겹침** — 재고를 결제 후 확정하면 결제 중 경쟁 방지에 이 reservation이 필요.
6. **AI 피팅 실연동 / go-live** — 우선순위 사람 결정(§9 트랙 진행도).

### 6-2. ★ 근본 가설 — 미확정 처리 불균등 (웹훅·compensate에서 성립)

**가설:** *"외부 부작용(돈·파일·외부 상태)과 로컬 상태 커밋 사이의 창에서, 애매한 실패를 일관되게 미확정으로 표현하는 공통 규약이 없다."* v6 정찰로 웹훅 경로 확인, v7 #1이 compensate 자기재시도 창을 로컬 내구(선기록)로 닫아 이 패턴을 결제 코어에 한 겹 더 적용. 남은 미성숙: 웹훅 일시-실패 vs 종국-실패 구분(6-1 #4).

**정찰 후보(같은 병일 수 있는 곳):** 재고 차감 ↔ 결제 원자성 경계(6-1 #1), S3 업로드 성공 ↔ DB key 저장 실패(orphan / 깨진 presigned — **얼굴사진이면 컴플라이언스 민감 + 고객 직접 경로**), PayPal OAuth 토큰 부분 실패(작음).

> 처방(먼) = 미확정-처리 패턴을 공통 규약(marker + 대사 인터페이스)으로 뽑아 취소·업로드 공유. **큰 리팩터라 라이브 후 패턴 굳으면.**

### 6-3. ★ 백엔드 프레임워크 (NestJS 전환 검토 → 보류)

**v7에서 검토·보류, v8 유지.** 근거 미성립: Next 서버 레이어에 **이미 도메인 아키텍처**(server action 중심 mutation, `src/lib` 추상화 interface→impl→index, 결제 factory + webhook strategy, STRICT 존). NestJS 이점(프론트-분리 백엔드·팀 컨벤션 강제·비-Next 워크로드)이 현 상태에 해당 없음. 전환 병목은 토큰이 아니라 STRICT 코어 재작성의 회귀 리스크 — 나중이 더 쉬움(도메인 코어가 프레임워크-얇음). **재검토 트리거 = 모바일 앱·다중 프론트·팀 확장·분리 백엔드 필요 중 실제 발생 시.**

### 6-4. 기타 백로그 (v4~v7에서 이어짐)

- **`admin-orders-data.ts` 한도 초과**(v8 정찰 실측 **302줄/300 한도** — 이미 초과 상태) → 손대면 detail 타입 별 파일 추출 필수.
- **재고 소진 사유 기록 미확인**(종국 재시도무의미 vs 일시 재시도가능 구분) — 6-1 #4와 묶어.
- **재고 복원("반품 입고")**: 환불과 분리된 별 흐름(환불은 재고 안 늘림 — 테스트 고정).
- **마진 엔진**(v4 §4-7): 결제 후 별도. 지금 손대지 않음.
- **결제 작은 정리**: `payOrderAction` pending의 `error` 잔재, `shouldSucceed` mock 파라미터 제거, PayPal OAuth 토큰 캐싱, 외부취소 반영(토스 CANCEL 발송 조건 확인 후).
- **출시 하드닝**(코드로 지금 가능): 에러 모니터링/로깅(greppable 로그를 능동 신호로 승격 — #2가 인-프로덕트 어드민으로 반은 해소, 외부 알림은 별개 인프라 트랙), 보안 점검(mock 라우트 프로덕션 404·env 노출·IAM·어드민 경계), 모바일 반응형 미검증. ⚠️ 통째 미리 하드닝 마라.
- **사용자측 미구현(v8에서 주문 목록 완료 — 나머지)**: 마이페이지(프로필·주소 허브 등 — A는 주문 목록만), 리뷰·위시리스트(스키마 자리만), 이메일/알림.
- **루트 `/`가 create-next 기본 화면** — 랜딩 필요(라이브 첫인상).

### 6-5. ★ 결제-완료-후 처리 재설계 — 주문 생성·재고 확정·카트 비우기를 결제 후로 (v8 방향 확정, 정찰·설계 미완)

**무엇을 바꾸나 (세 가지 변경 — 이하 이 문서에서 B·C1·C2로 표기):** 현재 mira는 2-phase다 — 체크아웃 시 주문을 `PENDING_PAYMENT`로 생성하고, **재고 차감·카트 비우기도 결제 *전*** 그 주문 생성 트랜잭션에서 하며, 결제가 그걸 `PAID`로 확정한다. 이걸 뒤집어 **셋 다 결제 완료 후로** 옮긴다:
- **B = 결제 완료 후에만 주문(Order) 레코드 생성** (현재는 결제 전 PENDING 생성).
- **C1 = 재고 차감/확정을 결제 완료 시점으로** (현재는 결제 전 주문 tx에서 차감).
- **C2 = 결제한 품목을 장바구니에서 제거하는 것을 결제 완료 시점으로** (현재는 결제 전 카트 비우기).

(라벨 유래: 사용자가 원래 "B, C"로 불렀고 — B=주문 생성, C=재고+카트 — 그 C가 위험·작업량이 달라 C1[재고]·C2[카트]로 갈림. 이 문서 내부 표기이니 위 정의로 읽어라.)

**동기(사용자):** "결제해야 진짜 주문이고, 그때 재고·카트가 움직여야 자연스럽다" + "미결제 주문으로 DB 안 어지럽힘".

**★ 방향 = 세 가지 전부 채택 확정(사용자 결정).** 단 이건 **결제 코어 재설계**라, 아래 조사·논의 결과는 **입력**이고 실제 구현은 **정찰 → 설계 잠금 → 격리 빌드**가 남았다. "방향 확정"이지 "설계·구현 완료"가 아니다.

**웹 조사 결과 (다음 세션이 재조사 안 하게 보존):**
- **결제 후 처리(B/C1/C2)는 정당한 표준 패턴이다.** Stripe 공식 fulfillment 가이드가 **결제 완료 웹훅(`checkout.session.completed`)에서 주문 생성·재고 차감·처리**를 권장. WooCommerce/Magento는 결제 전 PENDING 생성(현재 mira 방식) — **양쪽 다 표준, 단일 정답 없음**(비즈니스 규칙에 달림). Shopify는 결제 후 재고 차감이 기본이나 draft order는 B2B/수동 맥락(셀프서비스와 구분).
- **oversell은 타이밍이 아니라 원자성·예약(reservation)이 막는다.** (v8 세션 초기 "결제 후면 oversell" 프레이밍은 **틀렸음** — 사용자 반박이 옳았고 조사가 확증. §10 교훈 b.) 현재 mira의 재고 원자 차감(`stock >= n`)이 막는 것이지 "결제 전이라서"가 아님. Shopify도 결제 전 주문이면 명시적 "예약"(Unavailable 상태 + 만료)으로 경쟁 관리 → C1(재고 후치)으로 가도 결제 완료 시 원자 차감하면 oversell 안 나고, 결제 중 경쟁이 걱정되면 예약 레이어 추가(= §6-1 #5).
- **위험 처리 = 멱등 + 웹훅 신뢰 + metadata 매칭.** Stripe: 리다이렉트 URL만 믿지 말고 웹훅으로(사용자 이탈해도 옴), event ID unique 제약으로 멱등(중복 웹훅 방지), 세션 metadata로 "누가 뭘 사는지" 실어 매칭(주문 미리 안 만드니까). 웹훅+리다이렉트 하이브리드(신뢰+즉시성).

**★ 세 변경은 위험·작업량이 극단적으로 다름:**
- **B (결제 후 주문 생성):** **가장 큰 조각.** 현재 §5 이중환불 방지 공유 키가 `auto-refund:${orderId}:${providerTransactionId}` = **orderId 기반**인데, 결제 시점에 주문이 없으면 이 키가 성립 안 됨 → **orderId 기반을 metadata 매칭으로 재설계** 필요. + "결제 성공 → 주문 생성 실패" 창을 새로 멱등 처리(세션 데이터로 주문 만들다 실패 = 돈 받고 주문 없음). 이게 §5 안전 전제를 실제로 건드림.
- **C1 (재고 결제 후 확정):** 원자 차감을 결제 완료 tx로 이동 + 결제 중 경쟁 시 예약 레이어(§6-1 #5, 라이브 후로 미룬 트랙과 겹침).
- **C2 (카트 비우기 결제 후):** **저위험.** oversell·고아결제 리스크 없어 파장 작음.

**★ 구현 순서·분리 (원칙 — 위험도 아니라 의존 관계):** 셋을 한 커밋에 몰지 말고 분리한다(프로토콜: 한 관심사=한 커밋 + 되돌리기 어려운 것 신중). **단 분리 순서를 위험도로 정하지 마라** — "저위험 C2부터"가 아니다. 순서는 **의존 관계**가 정한다: 무엇이 무엇을 딛는지(딛히는 기반이 먼저, 그 위가 나중). **현재 추정**: C1·C2가 "결제 완료를 감지한 시점의 처리 골격"을 딛고, 그 골격을 B가 세우므로 **B가 기반일 가능성이 높다**(가장 위험한 B가 동시에 가장 기반 → 위험해도 먼저). **단 이 의존은 정찰 미확정** — C1(재고)이 주문 레코드에 매여 B에 의존하는지, 아니면 결제 성공 신호+metadata만으로 주문 없이 독립적으로 되는지는 **mira의 결제 완료 감지·재고 차감 구조를 정찰해야** 확정된다. 정찰 결과에 따라 순서 확정(추정을 단정으로 굳히지 마라).

**★ mira는 이 재설계가 요구하는 도구를 이미 가짐** — 멱등(idempotencyKey @unique)·웹훅 strategy·reconciliation marker. 차이는 그 도구를 "PENDING 주문 앵커" 위에서 쓰냐 "metadata 매칭" 위에서 쓰냐. 즉 재설계지 신축은 아님.

**다음 세션 정찰 대상(코드 확인 필수 — 조사는 목표를 줬지 mira 코드가 어떤지는 미확인):**
- 현재 웹훅이 orderId를 어떻게 매칭하는지, §5 공유 키 정확한 구조(B의 metadata 재설계 범위).
- 재고가 어느 tx에서 차감되는지, **재고 차감이 주문 레코드에 의존하는지 독립인지**(B/C1 의존 관계 = 위 순서 확정의 핵심).
- 카트 비우기가 현재 어느 tx에 묶였는지(C2 분리 범위).
- 토스/PayPal이 metadata 매칭을 지원하는지(Stripe와 다를 수 있음 — 조사는 Stripe 일반론이라 provider별 확인 필요).
- **"결제 후"가 정확히 어느 시점인지** — confirm 응답 시점 vs 웹훅 수신 시점(의존 관계·멱등 설계가 이에 따라 달라짐).

**★ 착수 시점 ≠ 방향 확정 (founders 타이밍).** 세 가지 전부 하기로 방향은 정해졌지만, 이 대형 재설계를 **언제 착수할지**는 founders 트랙 임박도상 §6-1 순서·§9 문제다. "방향 확정 = 지금 당장 착수"가 아니다. **이 재설계를 언제 시작할지 자체가 사람 판단**(founders 타이밍·MVP 바 = 사람만 앎). 착수하면 정찰부터.

---

## 7. 라이브 전환 (코드 아님 — 사업 트랙)

상세는 **`docs/go-live-checklist.md`**. **§5-bis 2건(#1 자기재시도 창·#2 가시화)은 v7 코드측 닫힘 + go-live-checklist에 이미 반영돼 있음 확인**(v7 §7이 "반영 필요"라 했으나 실제 파일 확인 시 이미 §5-bis-1 write-ahead·§5-bis-2 marker 가시화 둘 다 `[x]` + 근거까지 기재됨 — v8 정정, 추가 불필요). **단 §5-bis-2에 `[ ] 어드민 목록 렌더 1회 런타임 확인`이 미체크로 남음**(선택·NORMAL, 라이브 전 사람-수동).

**★ v8 추가 — go-live-checklist §3-1(배포)에 프로덕션 PG major=18 항목 추가 필요:**
```
- [ ] 프로덕션 Postgres major = 18 (로컬·CI와 정렬). 로컬 개발/CI는 PG18 기준
      (구 14는 2026-11 EOL이라 이관). 관리형 DB(RDS/Cloud SQL/Supabase 등) 프로비저닝 시
      제공 기본 major가 18인지 확인 — 다르면 CI(18) 초록이 프로덕션을 보장 못 함
      (major 간 거동 드리프트). 관리형이 18 미제공이면 그 major로 로컬·CI를 재정렬하거나
      제공처 변경 검토. (근거: v8 세션 PG14→18 정렬.)
```
(이 항목은 go-live-checklist 파일에 실제 반영 필요 — v8 세션에선 초안만, 파일 편집 미완.)

나머지 요약: 토스(KR) 전자결제 계약+심사(카드사 최대 14일=임계경로) → `live_` 키+MID → 웹훅 등록 → 프로덕션 `.env` → 첫거래 검증. PayPal(US·JP) 라이브 앱 → client id/secret + 웹훅 + `PAYPAL_WEBHOOK_ID` → 첫거래. 공통 차단: `prisma migrate deploy`, `NEXTAUTH_URL`/`SECRET`, 웹훅 URL 외부 접근, 시크릿 레포 노출 금지.

---

## 8. 정리 항목 (당장 안 막지만 나중)

- **★ flaky integration test — 공유 test DB 데이터 경합 (v8 발견, 미수정·큐잉):**
  - **[사실] 증상:** 로컬 `npm run verify` 간헐 실패, 실행마다 **다른 test 집합**(Node25=4실패 `market.upsert` unique(`code`) / Node24 첫 실행=3실패 timeout·mock 미호출·confirm 대기실패 / 이후 3회 연속 360/360). 실행마다 다름 = flaky 확정. **CI(fresh 컨테이너)에선 미발생** — 로컬 공유 DB에서만.
  - **[사실] 트리거:** 빈 test DB 리셋(major 전환/migrate reset 후) + vitest 병렬. 기존 로컬 DB에 데이터 있으면 가려졌음.
  - **[사실] 통과 실행에도 잔존:** 360/360 통과에도 `prisma:error paymentAdjustment.create/update Unique constraint (idempotencyKey)/(paymentId,providerRefundId)` 계속 찍힘 → 근본 원인 미해결, 우연히 초록. "3회 통과 = 해결"이 아니라 "flaky 확정 + 지금 초록".
  - **[추정 — 정찰 필요]** 원인 = 공유 test DB 데이터 경합: 고정 `market.upsert(code:"KR")` 병렬 create 충돌 / 고정 adjustment idempotencyKey 경합. cleanup이 공유 리소스 정리 안 하거나 test별 키 안 고유. **단 cleanup 코드·`vitest.config.ts` 병렬 설정 미확인 — 착수 시 정찰로 확정.**
  - **[추정] 수정 방향:** cleanup에 공유 리소스 정리 / test별 고유 key / 격리 강화. ⚠️ 대부분 **STRICT 존**(`src/lib/payment/**/__tests__`) → 정찰 선행 + 별 커밋. 급하지 않음(CI 안 막음).
- **★ PAYMENT_LIVE_MARKETS 정리 (v8 발견, 큐잉):** `.env`에 같은 키 **두 줄 중복**(토스 섹션 `="KR"` / PayPal 섹션 `="KR,US"`). dotenv 표준상 뒤가 덮어 **실효값 `KR,US`**(KR·US=live, JP=mock — 로컬 주문 생성은 JP로). 사용자 의도 = "토스=KR, PayPal=US"인데 **이 변수 하나로는 provider별 마켓 표현 불가**(그건 코드의 마켓→provider 매핑 담당) → `PAYMENT_LIVE_MARKETS`는 "어느 마켓 live"만 정하는 별 축. **정리 = 한 줄 `="KR,US"`로 통합**(동작 불변, 중복 오해 제거). ⚠️ 단 **코드가 이 변수 하나만 읽는지 + 마켓→provider 매핑 존재를 정찰 확인 후** 편집. 결제 설정이라 A와 별 트랙.
- **브라우저 클릭 런타임 제약**: 인앱 브라우저 localhost 차단 가능 → 더블클릭/required 검증은 통합 테스트 + 표준 동작으로 대체·명시.
- **reason 정책**: 관리자 환불 사유 필수화 완료(v5). 다른 흐름에 환불 생기면 동일 검토.
- **피팅 mock 잔재**(실 VTO/생체 S3 시 폐기): `api/mock-storage`, `MockStorageProvider`, `public/demo-fitting/*`, 결과 `<img>`, `AI_MOCK_*` env.
- **미들웨어 Next 16 deprecation 경고**(동작 정상) — 하드닝 즈음 마이그레이션.
- **`<img>` lint warning 4개**(fitting 페이지·FittingModal) — 피팅 실물 때 `next/image`로. (v8에서 안 늘어남.)
- **VariantMarketPrice 비우기 동작 미확인**, **ADMIN 프로비저닝**(make-admin뿐).
- **실제 이미지 썸네일 미검증**(A 주문 목록 — seed `imageKeys:[]`): 카탈로그에 이미지 있는 스타일 생기면 /orders 대표 썸네일 실제 해소 확인.

---

## 9. 막는 것 (founders 트랙 — 코드 밖)

- **토스 PG 온보딩**(사업자등록·정산·심사) — 결제 코드 라이브의 전제. **~1개월, 심사 최대 14일 = 임계경로**(v8 시점 사용자 확인).
- **피팅 Phase 0**(VTO 벤더·면책 KR/JP·생체 컴플라이언스) — 실 피팅의 전제.
- **법무**(개인정보처리방침·약관·얼굴사진 삭제 흐름).
- **도메인 확정**(Vercel 배포·프로덕션 CORS·OAuth 리다이렉트·결제 콜백/웹훅 URL).
- **경계**: 실제 작업 순서는 온보딩 진행도·도메인 시점·예산·타임라인에 달렸고 이 문서가 모른다. **§6-1의 코드 순서는 "임박도가 바뀌면 재배열" 전제.** **다음 세션이 founders 트랙 진행도부터 확인**(임박이면 랜딩·보안점검·모바일 반응형이 §6-1 앞으로 당겨짐).

---

## 10. 작업 방식 (요약 — 상세는 `docs/collaboration-protocol.md`)

- **루프**: 정찰(read-only) → 설계 잠금 → 격리 빌드(한 단계=한 관심사) → 검수 → 격리 커밋.
- **교차검토**: (a)되돌리기 비싸거나 STRICT + (b)틀렸는지 내 시야로 못 알 때 → 받는다. 좁혀 묻고(열린 "개선점?" 금지), 결과는 *입력*. (v8: §6-5 결제 후 처리 재설계를 백지-설계 관점에서 다른 모델에 교차검토 물을지 논의됨 — 보류. 물을 거면 mira 구조 정찰을 먼저 입력해야 "이 구조에서"의 답이 나옴. 단 founders 타이밍·MVP 바는 다른 모델도 모름 = 사람만 앎.)
- **verify 초록 ≠ 작동**: STRICT·실거래·라우트/UI는 런타임 검증(DB·Network status). **diff 부재로 코어 보존 증명**이 강력. **(v8 실물: raw diff 육안으로 snapshot 공용화가 순수 이동임을 확인 — Codex 자기보고 아니라 직접 diff. + A 주문 목록은 런타임(dev 서버)으로 렌더·클릭 검증, verify 초록만으로 안 끝냄.)**
- **STRICT 코어 보존**: 로직·순서 불변, 불가피하면 "필드 하나 추가" 최소화 + 원자성 행동 테스트. 한도 만나면 올리지 말고 **분리/압축**(v8: order/db.ts 247줄 → 목록 read model을 order/list.ts로 분리; snapshot parser를 공용 모듈로 extract).
- **커밋은 사람이 수동**, 논리 단위 분리(기능/문서/규칙 안 섞음). **git이 커밋 SoR**. 의심되면 추측 수정 전 read-only 진단부터.
- **코드 못 보는 쪽(Claude)은 단정 대신 정찰 위임.** "이렇게 구현하라" 단정은 실행 맥락과 어긋나도 못 잡는다 → "정찰해 판단하고 근거 보고하라"로 열어 위임.
- **★ v8 세션 교훈:**
  - (a) **환경/툴체인 정렬도 "우연히 깔린 값 아니라 원칙(최신 stable + 장기지원)에 맞춘다"** — 로컬(PG14·Node25)이 앵커가 아니라, 정렬 대상이 원칙. 로컬을 그 원칙으로 올리거나(PG) 내리거나(Node). `.nvmrc` 신설해도 도구(nvm/fnm) 없으면 참조값 — 실제 정렬은 Homebrew link.
  - (b) **사용자 반박이 내 프레이밍을 두 번 정정** — ① "결제 후면 oversell"은 틀렸고(원자성이 막지 타이밍 아님, 조사가 확증), ② "리팩터 비용 때문에 더 나은 구조 포기"는 선후 전도(더 나은 방향이면 비용 들여도 감). **내가 유지할 정당한 부분은 "비용"이 아니라 "스코프/순서(한 관심사씩)·안전 재설계(§5 잃지 않게)"뿐.** 고위험 결정에서 내 초기 프레이밍을 사실(웹 조사)로 검증해 정정한 실물.
  - (c) **"대부분 2-phase"를 근거 없이 단언 → 검색으로 확인 → 부분 철회.** 결제 전/후 생성 둘 다 표준, 단일 정답 없음. **단언한 쪽이 근거를 대야 한다**(안 대고 인상으로 말한 것 = 오류) — 웹 조사로 교정.
  - (d) **raw diff 육안 > 자기보고** (v7 reorder 전례 계승): snapshot 공용화가 순수 이동인지, Codex "동일합니다" 판정이 아니라 raw git diff를 읽어 export 키워드만 추가됨을 확인. STRICT 함수를 건드린 커밋이라 특히.
- **협업 선호(Profile)**: 중대·되돌리기 어려운 결정은 옵션 펼치고 채택/배제 이유 + 고정된 전제 풀기 + 검토 범위 경계 명시. 다른 도구/사람 결과물은 결론이 아니라 입력으로 검증("왜"부터). 단순 사실은 간결히.
