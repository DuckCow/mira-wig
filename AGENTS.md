<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# 프로젝트 규칙

> 위 Next 관리 블록은 건드리지 않는다(Next 업데이트가 그 구역만 덮어씀). 아래는 그 바깥이라 안전하다.
> **에이전트 규칙의 단일 출처(SSOT)는 이 파일이다.** (CLAUDE.md는 `@AGENTS.md`로 이 파일을 불러온다.)
> Next API 정확성은 위 블록 + 번들 docs가 맡는다. 아래는 프로젝트 아키텍처·존·결제 규칙이다.
> **사람-에이전트 협업 루프**(정찰 → 설계 잠금 → 격리 빌드 → 검수 → 격리 커밋)와 **교차검토 판정**은 `docs/collaboration-protocol.md` 참조.
> **개정 이력**: v2 (2026-07-06) — 결제 코어 재작성 반영: FROZEN(동결) 존 신설(§4.5), STRICT 글롭에 신 결제 코어 추가(§4 — eslint.config.mjs 동기 갱신 필요), 신 결제 코어 규칙 신설(§8). 이 개정 자체가 헌법 변경이므로 기능 커밋과 분리해 커밋한다. **v3 (2026-07-06)** — 경로 해소 확정: v2의 이동안 철회, **B′(제자리 동결 + 컷오버 게이트)** 채택으로 §4.5 재작성(FROZEN 글롭 고정, 클린 컷 근거 기록 — 실사용자·실결제 배포 이력 없음·기존 행 폐기 승인, 사용자 확정). §4에 `src/app/api/payments/**` 반영(정찰 결과 eslint에 기존재 — **eslint 변경 불필요**). §8 정책 문서 경로를 실제 위치(`docs/payment_policy/`)로 수정, A1 성격 교정(신축→감사 후 인수 판정).

프로젝트: AI 맞춤 가발 e-커머스 — 사진에 가발을 합성해보고(피팅) 마음에 들면 주문(탐색·전환).

## 0. 너의 역할

- 너는 **구현 · 코드 탐색 · 런타임 테스트**를 한다. 제품/설계 결정은 작업 프롬프트에 담겨 온다 — 스스로 만들지 않는다.
- 불확실하면 추측해서 구현하지 말고 멈추고 **질문한다**.
- **STRICT(§4)·되돌리기 비싼 변경은 빌드 전 read-only 정찰부터** — 코드 변경 없이 현 사실·시그니처·기존 패턴·무엇이 비었는지 먼저 보고한다. 가정하고 빌드하지 않는다.
- **기본 동작: 변경 후 `npm run verify`(§5) 초록을 확인하면 거기서 멈춘다. `git add`/`commit`/`push` 하지 마라** — 사람이 검토하고 직접 커밋한다. 프롬프트가 명시적으로 커밋을 지시할 때만 예외.

## 1. 기술 스택 (현행)

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | **Next.js 16** (App Router) + TypeScript strict | params/searchParams는 Promise(`await`). 상세 API는 위 블록 + 번들 docs. |
| 스타일 | Tailwind v4 (CSS-first, config 파일 없음) | `globals.css`에 `@import "tailwindcss"`. 모바일 우선. |
| DB | PostgreSQL + Prisma 7 | `prisma.config.ts`, PrismaPg 어댑터 |
| 인증 | NextAuth + Google OAuth | JWT 전략, `session.user.role` |
| 스토리지 | AWS S3 (카탈로그) | 선택 메커니즘은 §2. `fittingStorage`는 항상 mock. |
| AI 피팅 | 외부 VTO 추상화, 현재 mock | `AI_PROVIDER` |
| 결제 | **멀티 provider** — 구 구현(Mock·Toss·PayPal)은 **제자리 동결·컷오버 대기(§4.5)** | 신 코어는 컷오버 후 결제 정책 확정 문서 기준 재작성(§8). 라우팅은 §2. KR=토스, US·JP=PayPal, EU=후속. |

> mutation 진입점은 **server action(`src/app/actions`) 중심**이다. Route Handler(`src/app/api/**`)는 현재 auth 콜백·mock-storage·결제 웹훅 정도뿐 — "API Routes 중심"이 아니다.

## 2. 추상화 계층 (절대 규칙)

- `src/lib`의 외부 서비스(스토리지 / 결제 / AI 피팅)는 인터페이스(`types.ts`) → 구현 → `index.ts` 구조. **컴포넌트·페이지·Route Handler가 외부 SDK를 직접 import하지 않는다** — 추상화/server action 경유.
- **스토리지** = named provider(`catalogStorage` / `fittingStorage`, 호출처가 직접 import).
  - `catalogStorage`: env 분기로 mock/S3 선택 — `STORAGE_PROVIDER === "mock"`이면 mock, **그 외/미설정이면 S3**. (`.env.example` 기본값은 `"mock"`.)
  - `fittingStorage`: **env 무관 항상 mock**.


## 3. 절대 규칙

- **가격 = 주문 시점 스냅샷.** 주문 내역을 그릴 때 현재 상품 가격을 다시 조회하지 않는다.
- **DB엔 S3 key만**(URL 아님). 조회 시 storage가 presigned 생성(짧은 만료, 비공개 버킷).
- **얼굴 사진은 민감정보.** presigned 만료 짧게, 버킷 비공개, 동의 없는 업로드 흐름 금지.
- **로직/UI 분리.** 데이터·비즈니스 로직은 **server action(`src/app/actions`)** 또는 Route Handler에, 컴포넌트는 표시에 집중.

## 4. 코드 엄격도 — 위험도 차등 (강도는 "파일 위치"로 판단)

**STRICT** (정확한 글롭의 출처는 `eslint.config.mjs` — 거기서 STRICT 룰 대상 경로를 확인하라) — 현재: `src/lib/payment/**`, `src/app/api/payments/**`(둘 다 eslint에 기적용 — 2026-07-06 정찰 확인, eslint.config.mjs:89), `src/lib/storage/**`, `src/lib/fitting/**`, `src/lib/ai/**`, `prisma/schema.prisma`:
- 엣지케이스(빈 입력·null·경계값·실패 경로·동시성)를 코드 전에 먼저 정의·처리.
- **행동 테스트 필수** — 함수명 존재 확인 같은 문자열 테스트 금지. 실제 입출력·side effect와 엣지케이스를 검증·고정.
- mock은 외부 경계에서만(토스/PayPal API는 mock 가능, 우리 주문 로직은 mock 금지).
- 변경 전 영향 범위를 먼저 요약.

> **글롭 동기화 상태(v3)**: 정찰 결과 결제 글롭 두 개는 eslint에 **이미 존재**하므로 이 개정에 eslint.config.mjs 변경은 없다. FROZEN 존(§4.5)은 lint가 아니라 **이 문서 + 검수 규칙("동결 글롭에 diff가 있으면 검수 실패")**으로 강제한다 — B′ 채택으로 컷오버 전 신 결제 코드가 존재하지 않아, 신→구 import를 lint로 막을 공존 구간 자체가 없기 때문.

**NORMAL** — `src/app/(shop)/**`, `src/components/**`, 단순 표시/조회: 빠르게 구현, 전수 테스트 강요 안 함. 단 공통 규칙은 지킨다.

**공통 (모든 존):**
- 에러 삼키기 금지(빈 `try/catch`·무의미 fallback·호출부 방어코드 금지 — 경계에서만 처리, 그 외 throw).
- `as any` / `as unknown as` 금지(타입가드로 드러냄).
- 함수 ≤50줄, 파일 ≤300줄, 3단계 이상 중첩 금지(early return으로 평탄화).
- **STRICT 프로덕션 코드**는 함수 ≤40줄, 파일 ≤300줄, 복잡도 ≤8을 기본 상한으로 본다(공통 함수 50줄의 더 엄격한 override).
- **테스트 파일**은 줄 한도(파일·함수)를 적용하지 않는다 — 테스트는 명시성 우선(DAMP > DRY), setup→act→assert가 길어지는 게 자연스럽다. 단 행동 검증·타입 안전·외부 경계 mock 원칙은 그대로 지킨다.
- **새 function/helper/shape 만들기 전 기존 것 먼저 찾는다(SSOT).** 죽은 코드·목적 없는 re-export 금지(barrel `index.ts`만 예외). (단, 동결 존(§4.5)의 코드는 "기존 것" 후보에서 제외 — 신 코드가 구 코드를 import하지 않는다.)
- 순환 의존 금지(import는 상위 레이어 → 하위 레이어만).
- 판단 애매하면 더 엄격한 쪽을 택하거나 질문.

> **이 강도 규칙·줄 한도 자체를 바꾸려면** 기능 변경과 **분리**하고 먼저 합의/질문한다(헌법 변경은 기능 커밋에 묻지 않는다). 한도를 넘으면 **한도를 올리지 말고 분리(extract)하거나 압축**한다 — 한도는 "쪼갤 때냐?"를 묻는 트리거지 초과 시 푸는 값이 아니다. 카테고리 차원의 근거가 논증된 경우만 예외(예: 테스트는 명시성 우선이라 줄 한도 면제).

## 4.5 FROZEN(동결) 존 — 구 결제·주문생성 코드 (v3 확정: 제자리 동결 + 컷오버 게이트)

배경: 결제 코어는 결제 정책 확정 문서(§8) 기준으로 재작성한다. **클린 컷 확정 근거(사람 확정, 2026-07-06):** 실사용자·실결제로 배포된 적 없음, 기존 Order/Payment 행 폐기 승인. 따라서 레거시는 옮기지 않고 **제자리에서 동결**했다가 컷오버 커밋에서 일괄 교체한다 — 신·구 스키마는 같은 모델명(Order 등)·상반된 의미론이라 어차피 공존 불가하며, 이동·병행이 사려던 가치는 컷오버가 대체하므로(v2의 경로 해소 옵션 2안은 이 결정으로 소멸).

**동결 대상 (글롭 고정 — read-only):**
- `src/lib/payment/**` — 결제 코어 전체(테스트 포함, 18파일 ~2.4k LOC)
- `src/app/api/payments/**` — 웹훅 라우트. **주의: 이 URL은 PG에 등록된 자산**이라 컷오버 시 삭제가 아니라 신 코어로 재배선한다.
- `src/app/actions/payment.ts` · `src/app/actions/admin/orders.ts`(환불 액션) — 결제 진입 액션
- `src/app/(shop)/orders/[id]/payment/**` — 결제 화면·패널·callback 라우트
- `src/lib/order/db.ts` — 결제 전 `PENDING_PAYMENT` Order 생성 지점(레거시 의미론의 진입점)
- `prisma/schema.prisma`의 구 결제·주문 모델 **형상**: `Order`·`OrderItem`·`ManufacturingRequest`·`Payment`·`PaymentAdjustment`·`PaymentWebhookEvent` — 형상 변경 금지, 신규 테이블 추가 마이그레이션만 허용.

**동결 아님 — 컷오버 영향권(참고 목록):** 체크아웃 UI, 사용자 주문 조회/목록, 어드민 목록·상세·환불 폼, `src/lib/admin-orders-data.ts`·`src/lib/admin-payment-review.ts`. 레거시를 *읽는* 쪽이라 일반 규칙으로 수정 가능하되, **레거시 결제 의미론에 새 의존을 추가하지 않는다**(추가한 만큼 컷오버 때 스텁/재배선 대상이 늘어난다).

**규칙:**
1. **수정·삭제 금지(read-only).** 예외는 단 하나 — 사람의 명시 지시(운영 장애 대응 한정) + 단독 격리 커밋. 검수 규칙: 동결 글롭에 diff가 있으면 그 자체가 검수 실패 신호다.
2. **신 코드 → 구 코드 import 금지.** (B′에서는 컷오버 전 신 결제 코드가 없어 공존 구간이 없으므로 lint 강제는 두지 않는다 — 문서 + 검수로 충분.)
3. **지식 인양은 코드가 아니라 문서로:** `docs/payment_policy/legacy_salvage_notes.md`(외부 API 사실·웹훅 검증 절차·행동 테스트 명세·반복 금지 함정 목록). 인양 항목은 **공식 문서 재확인 후에만** 신 코어에 반영한다(§7 출처 규칙).

**컷오버 게이트 (동결 해제 = 일괄 교체, Track 1 A2 직전):**
- 선행조건: ① 인양 보고 완료·검수 ② A1 금액 코어 감사 판정(§8) ③ 사람 승인.
- 컷오버 커밋(단독 격리, 사람 승인 후 실행): 동결 존 코드 삭제 + 영향권 UI 스텁화 + 구 테이블 drop 마이그레이션(행 폐기 승인이 근거) + 웹훅 라우트 재배선 자리 확보. 직후 A2가 `src/lib/payment/**`와 canonical 모델명을 백지에서 인수한다.
- **수용된 비용:** 컷오버~Stage B 완료 사이 클릭 가능한 결제 플로우는 없다(실사용자 없음 — 사람 확정). 그 구간의 검증 루프는 테스트 하네스(C1)와 PG 샌드박스(D)다.

## 5. 검증 게이트

- 매 변경 끝 **`npm run verify`** (typecheck + lint + **test**) — 반드시 초록. tsc+lint만이 아니라 **test 포함**.
- 스키마 변경은 **반드시 migration** 생성. 수동 DB 조작 금지. 프로덕션 배포 시 `prisma migrate deploy`로 스키마를 올린다(안 올리면 새 컬럼/테이블에 의존하는 기능 — 예: 웹훅 — 이 조용히 실패).

## 6. 런타임 검증 — verify 초록 ≠ 작동

타입·테스트가 못 잡는 게 있다. **라우트/HTTP/UI/런타임 분기를 건드리면 실제로 돌려서 확인한다:**
- 브라우저 **Network 탭의 실제 status**(404 등)를 코드 인용보다 **먼저** 본다. 브라우저는 CORS/preflight 실패를 "Failed to fetch"로 뭉뚱그려 진짜 원인을 가린다. (Next 16.2는 dev에서 브라우저 에러를 터미널로 포워딩하니 클라 에러도 터미널에서 확인 가능.)
- 이미지 업로드 미리보기는 blob일 수 있다 — **"미리보기 떴다 ≠ 저장됐다."** 새로고침 후에도 뜨나 + 실 저장소에 있나로 검증.
- 어긋나면 **추측 수정 전 read-only 진단부터**(`git status --short`, `git log --oneline`, grep, 파일 읽기). 멀쩡한 걸 덮을 위험.

## 7. 데이터 모델 / 결제 코어 / 외부 API (출처 우선)

- **데이터 모델의 출처는 `prisma/schema.prisma` + migration이다.** 어떤 산문 요약도 신뢰하지 말고 스키마를 읽어라.
- **외부 서드파티 API(토스·PayPal 등) 사실은 공식 문서만** 출처로 삼는다 — 2차 블로그(Velog 등) 금지. API 필드·엔드포인트·웹훅 스펙·서명 검증 방식을 인용할 땐 출처를 밝히고, 불확실하면 추측하지 말고 공식 문서를 확인한다.
- **금액 표현 (중요 — 100배 버그 주의):** 최소단위 정수. **zero-decimal 통화(KRW/JPY)는 ×100 하지 않는다**(₩85,000 → `85000`), USD만 센트(×100). 저장·검증은 통화 무관 "정수·음수아님"만, 소수 자릿수는 **display 계층(`CURRENCY_META`)에서만**. 일반 Money로 *모든 통화 ×100* 하지 마라.

## 8. 신 결제 코어 (v2 신설 · v3 갱신 — 컷오버 후 재작성)

- **설계의 출처(SSOT)**: `docs/payment_policy/payment_policy_confirmed_v4.md` (미결 사항은 `docs/payment_policy/payment_policy_open_v4.md`). 산문 요약·기억이 아니라 이 문서가 기준이며, 작업 프롬프트가 이 문서와 어긋나 보이면 멈추고 질문한다. 구현 순서는 작업 프롬프트로 온다(Track 1 의존 순서: 금액 코어 → 스키마 v0 → outbox 골격 → 세션 수명주기 → 완료 트랜잭션 → confirm/웹훅 진입점 → 망취소 → 동시성 하네스).
- **착수 시점**: 신 결제 코드는 **컷오버(§4.5) 이후에만** 쓴다. 컷오버 전에 허용되는 것은 read-only 작업(인양·감사·정찰)뿐이다.
- **A1(금액 코어)의 성격(v3 교정):** 신축이 아니라 **기존 `src/lib/market` 금액 코어(`CURRENCY_META` 등 — 동결 대상 아님)를 정책 §7.2 코어 기준으로 감사한 뒤 인수/보강/신축을 판정**한다. 감사 전에 새 Money 타입을 만들지 않는다.
- **경로**: `src/lib/payment/**` — STRICT(§4), 컷오버 후 백지 인수. 완료 트랜잭션·멱등·행 잠금·망취소·대사 등 결제 로직은 **전부 이 안에** 두고, server action·웹훅 라우트는 얇은 위임만 한다(§3 로직/UI 분리의 결제판). 이유: STRICT 강제가 경로 기반이므로, 로직이 라우트/액션으로 새면 강제가 무력화된다.
- **신 finalizer(완료 트랜잭션)의 변경 규율**: "불변"이 아니라 **"STRICT 루프(정찰 → 설계 잠금 → 행동 테스트 → 런타임 검증) 없이는 변경 금지"**다. 변경은 최소 단위로, 원자성·불변식(결제 1건당 주문 최대 1개, 금액의 진실은 서버 스냅샷 등)은 행동 테스트로 고정한다.
- 구 결제 코드와의 관계는 §4.5(동결 존). 레거시 지식은 `docs/payment_policy/legacy_salvage_notes.md`를 경유해서만 반영하며, 각 항목은 §7 출처 규칙대로 공식 문서 재확인을 거친다.
