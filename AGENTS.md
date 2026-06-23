<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# 프로젝트 규칙

> 위 Next 관리 블록은 건드리지 않는다(Next 업데이트가 그 구역만 덮어씀). 아래는 그 바깥이라 안전하다.
> **에이전트 규칙의 단일 출처(SSOT)는 이 파일이다.** (CLAUDE.md는 `@AGENTS.md`로 이 파일을 불러온다.)
> Next API 정확성은 위 블록 + 번들 docs가 맡는다. 아래는 프로젝트 아키텍처·존·결제 규칙이다.

프로젝트: AI 맞춤 가발 e-커머스 — 사진에 가발을 합성해보고(피팅) 마음에 들면 주문(탐색·전환).

## 0. 너의 역할

- 너는 **구현 · 코드 탐색 · 런타임 테스트**를 한다. 제품/설계 결정은 작업 프롬프트에 담겨 온다 — 스스로 만들지 않는다.
- 불확실하면 추측해서 구현하지 말고 멈추고 **질문한다**.
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
| 결제 | **멀티 provider** (현재 구현=Mock·Toss, **PayPal 미구현**) | 라우팅은 §2. 목표: KR=토스, US·JP=PayPal, EU=후속. |

> mutation 진입점은 **server action(`src/app/actions`) 중심**이다. Route Handler(`src/app/api/**`)는 현재 auth 콜백·mock-storage 정도뿐 — "API Routes 중심"이 아니다.

## 2. 추상화 계층 (절대 규칙)

- `src/lib`의 외부 서비스(스토리지 / 결제 / AI 피팅)는 인터페이스(`types.ts`) → 구현 → `index.ts` 구조. **컴포넌트·페이지·Route Handler가 외부 SDK를 직접 import하지 않는다** — 추상화/server action 경유.
- **스토리지** = named provider(`catalogStorage` / `fittingStorage`, 호출처가 직접 import).
  - `catalogStorage`: env 분기로 mock/S3 선택 — `STORAGE_PROVIDER === "mock"`이면 mock, **그 외/미설정이면 S3**. (`.env.example` 기본값은 `"mock"`.)
  - `fittingStorage`: **env 무관 항상 mock**.
- **결제** = factory `getPaymentProvider(marketCode)` + `LIVE_PROVIDER_MARKETS` 맵(키: `KR`/`JP`/`US`, **현재 전부 `false` → 전부 mock**).
  - 구현체는 `MockPaymentProvider` · `TossPaymentProvider`뿐. **PayPal은 미구현** — `JP`/`US` 플래그를 켜면 안 됨.
  - `KR`만 실 provider(Toss) 연결 준비됨(플래그 `true` 시 Toss로 라우팅).
  - mock 성공/실패 제어는 `PAYMENT_MOCK_FORCE_FAIL` env.
  - 이 marketCode 맵 기반 선택을 단순 이진 삼항으로 바꾸지 마라(멀티 마켓·멀티 provider 구조).

## 3. 절대 규칙

- **가격 = 주문 시점 스냅샷.** 주문 내역을 그릴 때 현재 상품 가격을 다시 조회하지 않는다.
- **DB엔 S3 key만**(URL 아님). 조회 시 storage가 presigned 생성(짧은 만료, 비공개 버킷).
- **얼굴 사진은 민감정보.** presigned 만료 짧게, 버킷 비공개, 동의 없는 업로드 흐름 금지.
- **로직/UI 분리.** 데이터·비즈니스 로직은 **server action(`src/app/actions`)** 또는 Route Handler에, 컴포넌트는 표시에 집중.

## 4. 코드 엄격도 — 위험도 차등 (강도는 "파일 위치"로 판단)

**STRICT** (정확한 글롭의 출처는 `eslint.config.mjs` — 거기서 STRICT 룰 대상 경로를 확인하라) — 현재: `src/lib/payment/**`, `src/lib/storage/**`, `src/lib/fitting/**`, `src/lib/ai/**`, `prisma/schema.prisma`, 주문 생성/확정·인증·결제 금액 검증 로직:
- 엣지케이스(빈 입력·null·경계값·실패 경로·동시성)를 코드 전에 먼저 정의·처리.
- **행동 테스트 필수** — 함수명 존재 확인 같은 문자열 테스트 금지. 실제 입출력·side effect와 엣지케이스를 검증·고정.
- mock은 외부 경계에서만(토스/PayPal API는 mock 가능, 우리 주문 로직은 mock 금지).
- 변경 전 영향 범위를 먼저 요약.

**NORMAL** — `src/app/(shop)/**`, `src/components/**`, 단순 표시/조회: 빠르게 구현, 전수 테스트 강요 안 함. 단 공통 규칙은 지킨다.

**공통 (모든 존):**
- 에러 삼키기 금지(빈 `try/catch`·무의미 fallback·호출부 방어코드 금지 — 경계에서만 처리, 그 외 throw).
- `as any` / `as unknown as` 금지(타입가드로 드러냄).
- 함수 ≤50줄, 파일 ≤300줄, 3단계 이상 중첩 금지(early return으로 평탄화).
- **새 function/helper/shape 만들기 전 기존 것 먼저 찾는다(SSOT).** 죽은 코드·목적 없는 re-export 금지(barrel `index.ts`만 예외).
- 순환 의존 금지(import는 상위 레이어 → 하위 레이어만).
- 판단 애매하면 더 엄격한 쪽을 택하거나 질문.

## 5. 검증 게이트

- 매 변경 끝 **`npm run verify`** (typecheck + lint + **test**) — 반드시 초록. tsc+lint만이 아니라 **test 포함**.
- 스키마 변경은 **반드시 migration** 생성. 수동 DB 조작 금지.

## 6. 런타임 검증 — verify 초록 ≠ 작동

타입·테스트가 못 잡는 게 있다. **라우트/HTTP/UI/런타임 분기를 건드리면 실제로 돌려서 확인한다:**
- 브라우저 **Network 탭의 실제 status**(404 등)를 코드 인용보다 **먼저** 본다. 브라우저는 CORS/preflight 실패를 "Failed to fetch"로 뭉뚱그려 진짜 원인을 가린다. (Next 16.2는 dev에서 브라우저 에러를 터미널로 포워딩하니 클라 에러도 터미널에서 확인 가능.)
- 이미지 업로드 미리보기는 blob일 수 있다 — **"미리보기 떴다 ≠ 저장됐다."** 새로고침 후에도 뜨나 + 실 저장소에 있나로 검증.
- 어긋나면 **추측 수정 전 read-only 진단부터**(`git status --short`, `git log --oneline`, grep, 파일 읽기). 멀쩡한 걸 덮을 위험.

## 7. 데이터 모델 / 결제 코어 (출처 우선)

- **데이터 모델의 출처는 `prisma/schema.prisma` + migration이다.** 어떤 산문 요약도 신뢰하지 말고 스키마를 읽어라.
- **결제 코어(`src/lib/payment/process.ts`)의 구조·순서를 바꾸지 마라.** 실제 구조:
  - **트랜잭션 밖(선실행):** idempotency 가드(이미 `SUCCEEDED`면 즉시 반환) → 주문 소유권·상태 검증 → `provider.initiate()`.
  - **성공 트랜잭션(한 `db.$transaction`):** 재고 원자 차감(`updateMany` + `stock gte`) → 주문 `PENDING_PAYMENT → PAID` 전이 → 카트 비우기 → `Payment SUCCEEDED` 생성.
  - **실패 경로(별도 트랜잭션):** 주문 `PAYMENT_FAILED` 전이 → `Payment FAILED` 생성.
  - 이 경계(무엇이 트랜잭션 안/밖인지)와 순서를 "리팩터링"하지 마라.
- **금액 표현 (중요 — 100배 버그 주의):** 최소단위 정수. **zero-decimal 통화(KRW/JPY)는 ×100 하지 않는다**(₩85,000 → `85000`), USD만 센트(×100). 저장·검증은 통화 무관 "정수·음수아님"만, 소수 자릿수는 **display 계층(`CURRENCY_META`)에서만**. 일반 Money로 *모든 통화 ×100* 하지 마라.
