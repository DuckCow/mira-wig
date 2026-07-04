# 프로젝트 인계 문서 — AI 맞춤형 가발 플랫폼 (mira)

새 Claude chat에게: 아래는 진행 중인 프로젝트의 전체 맥락이야. 이걸 읽고 이어서 도와줘.
나는 Claude Code로 코드를 작성하고, 너(이 chat)에게는 **설계 판단 / 프롬프트 작성 / 막힐 때 디버깅 방향**을 물어볼 거야. 코드를 직접 다 짜달라는 게 아니라, Claude Code에게 줄 프롬프트를 만들어주고 내가 가져온 결과를 같이 검토하는 역할이야.

---

## 1. 프로젝트 개요

**AI 기반 맞춤형 가발 플랫폼.** 사용자가 자기 사진에 가발 스타일을 가상으로 적용해보고, 마음에 드는 걸 주문하는 웹 서비스.

**MVP 핵심 3흐름 (이것 외엔 미루거나 단순화):**
1. 피팅 — 자기 얼굴에 가발 적용해보기
2. 탐색 — 마음에 드는 스타일 쉽게 찾기
3. 전환 — 실제 주문까지 이어지기

**KPI:** 피팅 사용률, 찜 비율, 주문 전환율, 재구매율, 반품률.

**중요한 사업 맥락:**
- **오프라인 매장 없는 온라인 전용** 서비스. 그래서 "안 맞으면 어쩌지" 공포가 주문의 가장 큰 장벽.
- **글로벌 지향이지만 1차로 한국·미국·일본 3개국**을 제대로 지원해야 함. (전 세계는 무리지만 이 3국은 필수)
- **정확한 사이징이 핵심 차별점**이 될 수 있음 (온라인 전용이라 더더욱). 사진 기반 두상 측정 엔진(별도 Python 서비스)을 나중에 붙일지 고민 중 — 아직 미결정, 지금 범위 아님.

---

## 2. 기술 스택 (확정)

| 영역 | 선택 |
|---|---|
| 프론트+백 | Next.js 14 App Router + TypeScript (풀스택 유지 — 갈아타지 않기로 결정됨) |
| 스타일링 | Tailwind CSS, 모바일 우선 |
| DB | PostgreSQL + Prisma (Prisma 7 — schema.prisma에 url 없고 prisma.config.ts가 관리, PrismaPg 어댑터) |
| 인증 | NextAuth + 구글 OAuth (완성됨) |
| 스토리지 | AWS S3 (단, 지금은 Mock 스토리지로 로컬 동작 — STORAGE_PROVIDER=mock) |
| AI 피팅 | 외부 API 추상화, 현재 mock (AI_PROVIDER=mock) |
| 결제 | 미정 — 원래 토스페이먼츠였으나, 한·미·일 지원 때문에 Stripe가 다시 후보. 결제 단계에서 재결정 |
| CV 측정 엔진(미래) | 만들기로 하면 별도 Python/FastAPI 마이크로서비스. 메인 앱은 Next.js 유지하고 HTTP로 호출 |

---

## 3. 아키텍처 원칙 (CLAUDE.md에 명문화돼 있음)

프로젝트 루트에 `CLAUDE.md`가 있고 Claude Code가 매 세션 읽음. 핵심:

**추상화 계층 (src/lib 아래, types.ts→구현체→index.ts 패턴):**
- `lib/ai/` — FittingProvider (mock/real 전환)
- `lib/storage/` — StorageProvider (mock/s3 전환)
- `lib/payment/` — PaymentProvider (toss 구현, 교체 가능)
- 규칙: 컴포넌트/API는 외부 SDK 직접 import 금지. 반드시 이 추상화 통해서만. 인터페이스(types.ts)는 안 건드리고 구현체만 교체.

**절대 규칙:**
- 가격은 주문 시점 스냅샷 (OrderItem.unitPrice, snapshotData). 과거 주문 그릴 때 현재 가격 재조회 금지.
- DB엔 S3 key만 저장 (URL 아님). 조회 시 storage 계층이 presigned URL 생성.
- 얼굴 사진은 민감정보. presigned URL 만료 짧게(15분), 버킷 비공개.
- API와 UI 분리. 데이터 로직은 lib/이나 server action, 컴포넌트는 표시만.

**코드 엄격도 — 위험도 차등 (CLAUDE.md 10번 섹션):**
- STRICT 존 (payment/ai/storage, 스키마, 주문/결제/인증 로직): 엣지케이스 먼저, 행동 검증 테스트, mock은 외부 경계만.
- NORMAL 존 (화면/컴포넌트): 빠르게, 테스트 강요 안 함.
- 공통 (전부): 에러 삼키기 금지, `as any` 금지, 함수 50줄·파일 300줄, 3단계 중첩 금지, 순환 의존성 금지.

**eslint로 위 규칙 기계적 강제:** eslint.config.mjs에 complexity/max-depth/max-lines-per-function/import/no-cycle/no-explicit-any 등. `npm run verify` (typecheck + lint)로 검증. 매 기능 끝에 돌림.
- 중요 철학: 검사는 코드 짠 주체(AI)가 아니라 독립된 기계(lint/타입/테스트)에 맡긴다. AI가 자기 코드 자기가 검토하면 같은 맹점 때문에 못 잡으므로.

---

## 4. 데이터 모델 (Prisma)

핵심 관계:
```
User ──< TryOn >── WigStyle
User ──< Order ──< OrderItem >── WigVariant >── WigStyle
                       └──1:1── ManufacturingRequest
WigStyle ──< WigVariant   (스타일 → 색상·길이·컬 조합 SKU)
User ──< Review / WishlistItem / CartItem
```
- WigStyle = 카탈로그 원형, WigVariant = 실제 판매 SKU (색상×길이×컬). 주문/장바구니/재고는 Variant 단위.
- ManufacturingRequest = 제조 지시서 (Hair CAD, 공정 추적 슬롯). MVP엔 비어도 되지만 주문 시 레코드는 생성해 향후 확장 대비.
- User에 role(USER/ADMIN/MANUFACTURER), 두상 측정 필드(headCircumference 등) 있음.

**Order 주소 = 국제 구조 (한·미·일 대응, 완료됨):**
country(KR/US/JP), recipientName, phone, postalCode, administrativeArea(미국 state/일본 都道府県, nullable), city, addressLine1, addressLine2(nullable). administrativeArea를 nullable로 둬서 전 세계 대부분 담을 수 있는 그릇. 지금은 3국만 폼·자동완성 지원 예정.

---

## 5. 완료된 것 / 남은 것

```
✅ 1단계 세팅 (Next.js, Prisma, 추상화 계층, eslint 강제, seed)
✅ 2단계 탐색 (카탈로그 목록 + 필터/검색/빈상태 + 상세 페이지)
✅ 인증 (구글 OAuth 로그인/로그아웃, Prisma Adapter로 User 저장, 헤더에 로그인 상태)
✅ 국제 주소 스키마 (한·미·일)
✅ GitHub 백업 (github.com/DuckCow/mira-wig, Private, main 브랜치)
✅ 주문 1/3: 장바구니 (옵션 선택→variant 매칭, 담기/삭제/수량, 재고 초과 방지 서버 검증 작동, DB CartItem 기반)
⬜ 주문 2/3: 주문서 (배송지=국제주소 입력, 주문 생성, 결제 직전까지)  ← 다음 할 차례
⬜ 주문 3/3: 결제 (토스 or Stripe 재결정 + 주문 확정)
⬜ 3단계 피팅 (사진 업로드 mock → AI 적용 → TryOn 저장)
⬜ 관리자 (스타일 등록 — MVP 포함)
```

**seed 현황:** 10개 스타일 / 108개 variant / 재고 각 50개. 색상·길이·컬 조합 풍부. 이미지는 가짜 S3 key라 placeholder로 뜨는 게 정상.

---

## 6. 작업 방식 (지켜온 것)

- **흐름 단위 세로 개발.** 인증 전부→카탈로그 전부 식(가로) 말고, 한 흐름을 끝까지. 각 단계 끝나면 실제로 클릭해서 작동 확인.
- **큰 작업은 쪼개서 Claude Code에 전달.** 한 번에 다 시키면 어디서 막혔는지 못 찾음. (예: 주문을 1/3, 2/3, 3/3으로)
- **매 기능 끝에 npm run verify + git commit/push.**
- **결제는 키 필요해서 mock으로 먼저, 실제 연동은 나중.** 외부 키 필요한 건(S3, 결제) 추상화 덕에 mock→실제 전환 쉬움.
- 나는 종종 설계 방향을 되물음(예: "이거 지금 만드는 게 맞아?"). 매몰비용/우선순위/검증가능성을 따져서 솔직하게 답해주길 바람. 동의 안 하면 근거로 반박해줘.

---

## 7. 지금 필요한 것

**주문 2/3 (주문서)** 프롬프트를 Claude Code용으로 만들어줘. 요구사항:
- 장바구니의 "주문하기" → 주문서 페이지로 연결
- 배송지 입력: **국가 선택(한/미/일)에 따라 폼이 바뀌는** 국제 주소 입력. (자동완성은 나중에 Google Places로, 지금은 일단 수동 입력 폼부터 — 또는 네 판단)
- 주문 생성: 장바구니 → Order + OrderItem 생성. **가격은 주문 시점 스냅샷** (절대 규칙). 재고 차감 여부도 판단.
- 결제는 아직. 주문 생성(PENDING_PAYMENT 상태)까지만. 결제는 3/3에서.
- STRICT 존(주문 로직)이라 신중하게. verify 통과, 끝나면 커밋.

이 프롬프트를 만들기 전에, 주문서에서 결정해야 할 설계 포인트(예: 재고를 주문 시점에 차감할지 결제 시점에 할지, 비로그인 처리 등)가 있으면 먼저 짚어주고 나한테 물어봐줘.
