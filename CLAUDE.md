# CLAUDE.md

> 이 파일은 Claude Code가 매 세션 자동으로 읽는 프로젝트 헌법입니다.
> 코드를 작성하기 전에 항상 이 문서의 규칙을 따르세요.

---

## 1. 프로젝트 개요

**AI 기반 맞춤형 가발 플랫폼** — 사용자가 자기 사진에 다양한 가발 스타일을
가상으로 적용해보고, 마음에 드는 스타일을 주문하는 웹 서비스.

### MVP의 핵심은 딱 3가지 흐름이다. 이것 외의 기능은 미루거나 단순화한다.

1. **피팅** — 사용자가 자기 얼굴에 가발을 적용해볼 수 있는가
2. **탐색** — 마음에 드는 스타일을 쉽게 찾을 수 있는가
3. **전환** — 실제로 주문까지 이어지는가

> 가상 피팅이 100% 정확할 필요 없다. UX와 풍부한 카탈로그가 정확도보다 중요하다.
> 추적할 KPI: 피팅 사용률, 찜 비율, 주문 전환율, 재구매율, 반품률.

---

## 2. 기술 스택 (확정)

| 영역 | 선택 | 비고 |
|---|---|---|
| 프론트엔드 | Next.js 14 (App Router) + TypeScript | strict mode 필수 |
| 스타일링 | Tailwind CSS | 모바일 우선 |
| 백엔드 | Next.js API Routes | |
| DB | PostgreSQL + Prisma ORM | |
| 인증 | NextAuth.js | OAuth 확장 가능 구조 |
| 스토리지 | **AWS S3** | (Supabase 아님 — S3로 확정) |
| AI 피팅 | 외부 API 추상화, 초기엔 mock | `AI_PROVIDER` env로 전환 |
| 결제 | **토스페이먼츠** | (Stripe 아님 — 국내 PG) |

---

## 3. 폴더 구조 (이 구조를 지킬 것)

```
src/
  app/
    (auth)/              # 로그인/회원가입 라우트 그룹
    (shop)/              # 카탈로그, 상세, 장바구니
    (account)/           # 마이페이지, 주문내역
    admin/               # 관리자 (스타일 등록 — MVP 포함)
    api/                 # API Routes
  components/
    ui/                  # 버튼, 인풋 등 원자 단위 (재사용)
    features/            # 도메인 컴포넌트 (StyleCard, TryOnViewer 등)
  lib/
    ai/                  # ★ AI 피팅 추상화 계층
    storage/             # ★ S3 추상화 계층
    payment/             # ★ 토스 추상화 계층
    db.ts                # Prisma client 싱글톤
    auth.ts              # NextAuth 설정
  types/                 # 공유 타입
  hooks/                 # 커스텀 훅
prisma/
  schema.prisma
  seed.ts                # 스타일 시드 데이터
```

★ 표시된 3개 디렉토리는 **추상화 계층**이다. 절대 규칙은 4번 참조.

---

## 4. 절대 규칙 (이걸 어기면 안 됨)

### 4-1. 외부 서비스는 반드시 추상화 계층 뒤에 둔다
AI 피팅 / S3 / 결제는 **인터페이스를 먼저 정의**하고 그 뒤에 구현한다.
컴포넌트나 API Route가 외부 SDK를 직접 import하면 안 된다.

```typescript
// lib/ai/types.ts
export interface FittingProvider {
  applyStyle(input: FittingInput): Promise<FittingResult>;
}

// lib/ai/index.ts — 환경변수로 구현체 선택
const provider: FittingProvider =
  process.env.AI_PROVIDER === "real"
    ? new RealFittingProvider()
    : new MockFittingProvider();

export { provider as fittingProvider };
```
→ 나중에 AI 공급자/결제사를 바꿔도 **구현체 1파일만 교체**되게 한다.

### 4-2. 가격은 항상 주문 시점에 스냅샷한다
`OrderItem.unitPrice`와 `snapshotData`에 주문 당시 가격/옵션을 복사한다.
나중에 `WigVariant` 가격이 바뀌어도 과거 주문이 깨지면 안 된다.
**절대 주문 내역을 그릴 때 현재 상품 가격을 다시 조회하지 않는다.**

### 4-3. API와 UI를 분리한다
데이터 페칭/비즈니스 로직은 API Route 또는 server action에 둔다.
컴포넌트는 받은 데이터를 그리는 데 집중한다.

### 4-4. 이미지 키만 저장한다 (URL 아님)
DB에는 S3 **key**만 저장한다 (`originalImageKey`). 전체 URL을 저장하지 않는다.
조회 시 storage 계층에서 presigned URL을 생성한다 → CDN/버킷 변경에 유연.

### 4-5. 사용자 업로드 이미지는 보안 처리
얼굴 사진은 민감 정보다. presigned URL은 만료 시간을 짧게(예: 15분),
버킷은 비공개로 둔다. 개인정보 처리방침 동의 없이 업로드 흐름을 만들지 않는다.

---

## 5. 코드 품질 규칙

- **TypeScript strict mode.** `any` 금지. 불가피하면 `unknown` + 타입가드.
- **에러/로딩 상태를 항상 구현한다.** 데이터를 부르는 모든 곳에 loading·error UI.
- **컴포넌트는 재사용을 전제로.** `components/ui`는 도메인 지식 없이 동작해야 함.
- **접근성**: 시맨틱 태그, 이미지 alt, 폼 label, 키보드 접근.
- **환경변수는 `.env`로 관리**하고 `.env.example`을 항상 최신으로 유지.
- 커밋 전 `tsc --noEmit`과 lint 통과.

---

## 6. 데이터 모델 요약

Prisma 스키마는 `prisma/schema.prisma` 참조. 핵심 관계:

```
User ──< TryOn >── WigStyle
User ──< Order ──< OrderItem >── WigVariant >── WigStyle
                       └──1:1── ManufacturingRequest   (제작 지시서)
WigStyle ──< WigVariant   (스타일 → 색상·길이·컬 조합 SKU)
User ──< Review / WishlistItem / CartItem
```

- **WigStyle** = 카탈로그 원형, **WigVariant** = 실제 판매 SKU. 주문은 Variant 단위.
- **ManufacturingRequest**는 MVP에선 비어 있어도 됨. 단, 주문 생성 시 레코드는
  만들어둬서 향후 제조 공정/Hair CAD 확장 시 마이그레이션이 필요 없게 한다.

---

## 7. 개발 순서 (세로로 자른다)

기능을 가로(인증 전부 → 카탈로그 전부)로 자르지 말고, **흐름 단위 세로**로 자른다.
각 단계가 끝나면 실제로 클릭해서 작동하는 상태를 유지한다.

1. **세팅** — Next.js + Prisma + NextAuth + S3/토스 추상화 인터페이스 정의 + seed
2. **탐색** — 카탈로그 목록 → 필터/검색 → 상세 페이지  *(KPI: 탐색)*
3. **피팅** — 사진 업로드 → mock provider로 결과 표시 → 저장  *(KPI: 피팅)*
4. **전환** — 옵션 선택 → 장바구니 → 주문 → 토스 결제 → 주문조회  *(KPI: 전환)*
5. **관리자** — 스타일 등록/수정 (MVP에 포함 — 없으면 DB 직접 INSERT해야 함)

### 2차로 미루는 것 (지금 만들지 말 것)
AI 스타일 추천, 스타일 비교, 리뷰 노출, 관리자 대시보드, 실시간 제작 추적,
크로스 디바이스 장바구니 동기화. → 데이터 모델에는 자리만 있고 UI는 나중에.

---

## 8. 초기 세팅 명령 (빈 폴더에서 시작 시)

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir
npm i prisma @prisma/client next-auth @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
npm i -D tsx
npx prisma init
# prisma/schema.prisma를 제공된 스키마로 교체 후:
npx prisma migrate dev --name init
npx prisma db seed
```

`.env.example`에는 다음 키가 있어야 한다:
`DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`,
`AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AI_PROVIDER`(mock|real), `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`.

---

## 9. 작업 시 행동 지침

- 새 기능은 7번 순서를 따른다. 한 번에 여러 흐름을 건드리지 않는다.
- 외부 SDK를 쓸 땐 먼저 `lib/`에 추상화 계층이 있는지 확인한다.
- 큰 변경 전엔 무엇을 바꿀지 먼저 요약하고 진행한다.
- 스키마를 바꿀 땐 반드시 migration을 생성한다. 수동으로 DB를 건드리지 않는다.
- 불확실하면 추측해서 구현하지 말고 질문한다.

---

## 10. 코드 엄격도 — 위험도 차등 적용

> 모든 코드에 같은 엄격도를 쓰지 않는다. 재작업 비용이 큰 곳일수록 엄격하게,
> 갈아엎기 쉬운 곳은 적당히. 강도는 "파일 위치"로 판단한다.

### 10-1. 엄격 존 (STRICT) — 절대 타협 금지

대상 (오래 살고, 결합 위험이 크고, 망가지면 재작업 비용 최악):
- `src/lib/payment/**` — 결제
- `src/lib/ai/**` — AI 피팅 추상화
- `src/lib/storage/**` — 스토리지 추상화
- `prisma/schema.prisma` — DB 스키마
- 주문 생성/확정, 인증, 결제 금액 검증 로직 (`app/api/orders/**`, `app/api/payments/**`, `lib/auth.ts`)

이 존에서는 아래를 전부 강제한다:
- **엣지케이스 먼저.** 코드 작성 전에 빈 입력·null·경계값·실패 경로·동시성을 먼저 정의하고 처리한다.
- **테스트는 행동 검증.** 함수명 존재 확인 같은 문자열 테스트 금지. 실제 입출력·side effect를 검증한다. 엣지케이스(빈 입력/경계값/null/실패 경로)를 테스트로 고정한다.
- **mock은 외부 경계에서만.** 내부 구현 세부를 mocking하지 않는다. (예: 토스 API는 mock 가능, 우리 주문 로직은 mock 금지)
- 변경 시 영향 범위를 먼저 요약하고 진행한다.

### 10-2. 일반 존 (NORMAL) — 적당히

대상 (고립적이고 갈아엎기 쉬움, 디자인 바뀌면 통째로 재작성):
- `src/app/(shop)/**`, `src/app/(account)/**` 등 화면/페이지
- `src/components/**` UI 컴포넌트
- 단순 표시·조회 로직

이 존에서는 엣지케이스 전수 테스트·내부 로직 테스트를 강요하지 않는다.
대신 아래 "공통 강제 규칙"은 모든 존에 동일하게 적용한다.

### 10-3. 공통 강제 규칙 (모든 존에 적용)

코드 작성 강도와 무관하게 아래는 어디서든 지킨다:

- **에러를 삼키지 않는다.** 빈 `try/catch`, 무의미한 fallback, 호출부마다 방어코드 금지.
  에러는 경계(API Route 핸들러, error boundary)에서만 처리한다. 그 외에는 던진다.
- **`as any` / `as unknown as` 금지.** 타입을 우회하지 말고 드러낸다.
  불가피하면 타입가드를 쓴다. 암묵 계약은 타입으로 표현한다.
- **함수는 50줄, 파일은 300줄을 넘기지 않는다.** 넘으면 분리한다. (갓펑션/갓파일 금지)
- **3단계 이상 중첩 금지.** early return / guard clause로 평탄화한다.
- **새 function/helper/shape를 만들기 전에 기존 것을 먼저 찾는다.**
  공용 유틸·타입은 단일 출처(SSOT)에 둔다. 세션마다 비슷한 걸 재구현하지 않는다.
- **순환 의존성 금지.** import는 위계 방향(상위 레이어 → 하위 레이어)으로만.
  컴포넌트가 외부 SDK를 직접 import하지 않는다 (4-1 규칙과 동일).
- **죽은 코드·주석 처리된 코드를 남기지 않는다.** re-export는 의도된 공개 API
  경계(`index.ts` barrel)만 허용하고, 목적 없는 re-export는 만들지 않는다.

### 10-4. 작업 흐름

- STRICT 존 작업 시: "이건 엄격 존이라 엣지케이스/테스트부터 작성한다"고 밝히고 진행한다.
- NORMAL 존 작업 시: 빠르게 구현하되 공통 강제 규칙(10-3)은 지킨다.
- 판단이 애매하면 더 엄격한 쪽을 택하거나 질문한다.
- 첫 작성에서 시간·토큰이 더 들더라도, STRICT 존은 재작업 비용이 더 크므로 제대로 짜는 것이 옳다.
