# mira 프로젝트 인계 문서 v3 (Handoff)

새 세션의 Claude에게: 너는 mira 프로젝트를 이어서 작업한다. 아래 맥락을 읽고 바로 이어가라. **너의 역할은 설계 판단 + Claude Code 프롬프트 작성 + 결과 리뷰다 — 사용자가 Claude Code로 실제 코딩을 한다(너는 코드를 직접 쓰지 않고, 줄 프롬프트를 만들고 결과를 검토한다).** 이 v3는 "막히지 않은 코드"(스토리지→어드민)를 완주하고, **결제 Phase 0 결정이 확정된** 시점의 상태다. 새 세션의 첫 작업은 **결제 실 통합**이다(§7-2 확정, §11 참조).

---

## 0. 지금 어디까지 왔나 (v1 이후 이 세션에서 완료된 것)

v1의 §11 출시 로드맵 중 **"막히지 않은 코드"(Phase 1: 스토리지→어드민)를 전부 완료**했다. 구체적으로:

- ✅ **어드민 완성** — 가드(requireAdmin + 미들웨어) + 카탈로그 CRUD(스타일/variant/재고) + 마켓 가격/가용성/갭 진단 + 공통 UI 컴포넌트 5종 + 어드민 화면(UI-1/UI-2) + **카탈로그 이미지 업로드(실 S3)**. 어드민으로 실 카탈로그 운영 가능.
- ✅ **실 S3 (버킷 B = 카탈로그 이미지)** — AWS 버킷 생성, CORS, IAM 최소권한, 장기 access key, 실 presigned PUT/GET. mock에서 실물로 교체됨.
- ✅ **storage named provider 분리 (B')** — `catalogStorage`(env 따라 S3/mock) / `fittingStorage`(항상 mock). `STORAGE_PROVIDER=s3`에서 **카탈로그=S3, 피팅=mock 공존**. 런타임 검증됨(버킷에 카탈로그 이미지 올라가고 피팅 셀카는 안 올라감 = 분리 정확).
- ✅ **make-admin 스크립트** — 첫 ADMIN 부트스트랩(`npm run make-admin -- <email>`, 멱등).

**핵심 인식 (v1 §11에서 갱신):** user-facing 코어 3개(피팅·결제·스토리지) 중 **스토리지가 실물이 됐다.** 남은 건 피팅·결제이고, 둘 다 Phase 0(코드 밖 사업/법무 결정)에 막혀 있었다. **이 v3 시점에 결제 Phase 0가 확정됐다(§7-2): KR=국내 PG(토스 등) / US·JP=PayPal / EU=후속.** 따라서 새 세션의 첫 작업은 **결제 실 통합**이다. 피팅은 Phase 0(VTO 벤더·생체 컴플라이언스) 미정으로 여전히 막힘.

---

## 1. 프로젝트 (v1과 동일)

- mira = AI 커스텀 가발 e-커머스. 사용자가 자기 사진에 가발 스타일을 합성해 써보고(피팅), 마음에 들면 주문한다.
- 온라인 전용 → "안 맞으면 어쩌지"가 주 구매 장벽 → 피팅이 핵심 차별점.
- 글로벌 지향, 1차 한국·미국·일본 3개국.
- MVP 3대 플로우: 피팅 · 브라우즈 · 전환(주문).
- 레포: github.com/DuckCow/mira-wig (private, main).
- **출시 갈림길 결정됨:** 피팅을 v1에 **넣는다**(확실). 단 피팅은 주문→결제의 *경로상 필수가 아니다*(피팅 없이도 browse→cart→checkout→pay 완결). 즉 피팅과 커머스는 **병렬 출시 트랙** — 둘 다 v1이지만 서로의 임계경로가 아니다.

## 2. 기술 스택 (고정 — 변경 금지)

- Next.js 14 App Router + TypeScript (풀스택)
- Tailwind (v4, CSS-first, config 파일 없음 / `globals.css`에 `@import "tailwindcss"` + `--background`/`--foreground`), 모바일 우선
- PostgreSQL + Prisma 7: `prisma.config.ts` 관리, PrismaPg 어댑터
- NextAuth + Google OAuth (완료). JWT 전략, jwt 콜백이 `token.role` 채움 → 세션에 `session.user.role`.
- **AWS S3: 버킷 B(카탈로그) = 실물 연결됨.** `STORAGE_PROVIDER=s3` + `AWS_REGION`/`AWS_S3_BUCKET`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`. 자격증명은 SDK 기본 체인(장기 키). 버킷 A(생체=셀카/피팅결과)는 **미생성** — 피팅 실 VTO 때.
- **AI 피팅: 여전히 `AI_PROVIDER=mock`** → ⚠️ 실 VTO provider 미정(Phase 0 피팅, §7).
- **결제: 여전히 mock provider** → Phase 0 결제 정리됨(§7), 실 통합은 새 세션 작업.

⚠️ **`.env`는 git에 없음**(.gitignore). 새 환경/Vercel 배포엔 환경변수 별도 설정. `.env.example`에 키 이름만.

## 3. 아키텍처 원칙 (CLAUDE.md — 강제됨) (v1과 동일, 요약)

- 추상화 레이어: `src/lib` 아래 ai/storage/payment 각각 types→구현→index. 컴포넌트/API/페이지는 외부 SDK 직접 import 금지 — 추상화/server action 경유.
- 절대 규칙: 가격 = 주문 시점 스냅샷(재계산 금지). DB엔 S3 key만(URL 아님), storage가 presigned 생성(15분 만료, private 버킷).
- STRICT 존(payment/ai/storage, 스키마, order/payment/auth 로직): 엣지케이스 우선, 행동 테스트 필수.
- NORMAL 존(화면/컴포넌트): 빠르게, 강제 테스트 없음.
- 공통: 에러 삼키기 금지, `as any` 금지, 함수 ≤50줄, 파일 ≤300줄, 3중 중첩 금지, 순환 의존 금지.
- 매 기능 끝 `npm run verify`(typecheck + lint + test).
- 철학: 검사는 독립된 기계(lint/type/test)가 한다.

## 4. 데이터 모델 (v1 기반, 이 세션에서 확인/갱신된 사실)

- WigStyle(카탈로그) ──< WigVariant(SKU: 색×길이×컬). 주문/장바구니/재고는 Variant 단위.
  - **WigStyle 실제 필드:** id, name, description?, category(WigCategory: HAIR_LOSS|FASHION|COSPLAY|TOPPER|MEDICAL), tags[], **coverImageKey?**(S3 key, 단수), **imageKeys[]**(S3 key 배열), sortOrder, isActive, createdAt, updatedAt.
  - **WigVariant 실제 필드:** id, wigStyleId, color, colorHex?, length, curl, **price(Int, KRW 하위호환 — 잔재, 실 가격 아님)**, stock, sku(@unique), isActive. variant엔 이미지 필드 없음.
- **User.role enum = `CUSTOMER` | `ADMIN` 두 값뿐.** (v1의 MANUFACTURER는 오기 — 스키마에 없음, 필요 없음.)
- Order ──< OrderItem ──1:1── ManufacturingRequest. 주소(국제): country(KR/US/JP), recipientName, phone, postalCode, administrativeArea?, city, addressLine1, addressLine2?.
- **마켓:**
  - Market(code PK KR/US/JP, currency, shippableCountries, defaultLocale, isActive, **taxConfig? / paymentConfig? = nullable 확장 슬롯**). currency 메타는 `lib/market/types.ts`에 `MARKET_CONFIGS[code].currency.{symbol,code,decimals}` + `CURRENCY_META`(KRW/JPY decimals=0, USD=2) + `formatPrice`. 클라 안전.
  - VariantMarketPrice((variantId, marketCode) 복합 PK, amount Int, onDelete Cascade) — **실 가격. 통화는 마켓 파생.**
  - WigStyleMarket((wigStyleId, marketCode) 복합 PK, isActive) — 스타일×마켓 가용성.
  - ⚠️ 가용성=Style 단위, 가격=Variant 단위 → "스타일은 마켓에 있는데 variant 가격 없는" 갭 가능. **이 세션에서 어드민에 (C)갭 진단 뷰 + (A)노출 시 경고를 추가함.** 주문 시점 가드(`lib/order/core.ts`의 `validateAndBuildLines` → `VARIANT_PRICE_UNAVAILABLE`)는 안전망으로 유지.
- **결제 모델:** OrderStatus(PENDING_PAYMENT, PAID, PAYMENT_FAILED), PaymentAttemptStatus(PENDING, SUCCEEDED, FAILED), Payment(orderId N:1, idempotencyKey @unique, provider, providerTransactionId?, status, amount, currency).
- **피팅 모델:** Fitting(userId, variantId, status, sourceImageKey?, resultImageKey?, providerJobId?, failureReason?). FittingStatus(PENDING, SUCCEEDED, FAILED — 폴링 모델). Variant 단위.
- **금액 표현 (중요):** 최소단위 정수. zero-decimal 통화(JPY/KRW)는 ×100 **안 함**(₩85,000→85000, ¥9,800→9800), USD는 센트($77.99→7799). **저장/검증은 통화 무관 "정수·음수아님"만**(`assertValidAmount`), 소수 자릿수는 **display 계층에서만**(CURRENCY_META). 어드민 가격 입력도 이 규칙 — ×100 변환 로직 절대 넣지 마라(100배 버그).

## 5. 완료 사항 (v1 완료분 + 이 세션 추가분)

**v1까지 완료:** Setup, browse(카탈로그+필터), auth(Google OAuth), 국제 주소, 주문 1/3 장바구니, 마켓 기반(Market/VariantMarketPrice/WigStyleMarket), 주문 2/3 주문서(가격 스냅샷·재고 재검증), 주문 3/3 결제(mock provider, 재고 원자 차감·idempotency·카트 비우기 한 트랜잭션), 피팅 플로우(mock-first, AI seam, 업로드/폴링/비포애프터). 자세한 건 v1 문서 §5 참조.

**이 세션 추가 완료:**
- ✅ **어드민 가드** (`src/lib/admin.ts` + `src/lib/admin-role.ts`): `requireAdmin()` → `{success:false, errorCode:"UNAUTHENTICATED"|"FORBIDDEN"} | {success:true, session: Session}`. `isAdminRole(role)` 순수 함수(Edge 안전, `admin-role.ts`에 분리 — 미들웨어 재사용). 미들웨어(`src/middleware.ts`): `/admin/:path*`를 `getToken`(Edge, DB 무접근)으로 role 확인 → 미인증 `/login`, 비ADMIN `/`.
- ✅ **카탈로그 CRUD** (`src/app/actions/admin/catalog.ts` + `src/lib/catalog-admin/`): 스타일/variant 생성·수정, 재고 수정(updateStock), soft delete만(isActive=false — OrderItem/CartItem 참조 무결성). sku 직접 입력+중복 거부. price는 `?? 0` placeholder(잔재).
- ✅ **마켓 가격/가용성/갭** (`src/lib/catalog-admin/market-price.ts` + actions): `setVariantPricesAction`(variant×여러 마켓 일괄), `setStyleMarketAvailabilityAction`(토글 + 가격없는 variant warnings 반환, **차단X 경고만**), `findMarketPriceGapsAction`(갭 진단, 관계 쿼리+메모리 필터 — 카탈로그 대형화 시 raw SQL 최적화 여지, §8).
- ✅ **공통 UI 컴포넌트 5종** (`src/components/ui/`): Card/Badge/Table/Dialog(네이티브 `<dialog>`)/Toast(Context+useToast). shadcn 아님, from-scratch. NORMAL 존.
- ✅ **어드민 UI** (`src/app/admin/`): layout(ToastProvider 배치) + 홈 대시보드(스타일 관리·갭 진단 카드) + `/admin/styles`(목록) + `/admin/styles/[id]`(메타 편집 + variant 관리 + 마켓 가격 매트릭스 + 가용성 토글 + 커버 이미지 업로드) + `/admin/gaps`(갭 진단). **어드민 언어 = 한국어 단일**(사용자 i18n과 별개, errorCode→한국어는 `src/lib/admin-messages.ts` 중앙 맵). 시각 수준 = "운영 가능한 깔끔함"(Tailwind 기본, ❌브랜딩/애니메이션/다크모드).
- ✅ **storage named 분리** (`src/lib/storage/index.ts`): `catalogStorage`(env 따라) / `fittingStorage`(항상 MockStorageProvider). 호출처 전환 — 카탈로그(`(shop)/styles`, `/styles/[id]`, `/cart`)→catalogStorage, 피팅(`actions/fitting.ts`, `fitting/[id]/page.tsx`)→fittingStorage. `mockGuard`를 `STORAGE_PROVIDER` 조건에서 떼고 `NODE_ENV==="production"`만 보게 수정(이게 없으면 s3 모드에서 피팅 mock-storage 라우트가 404로 죽음).
- ✅ **카탈로그 이미지 업로드** (`getCoverImageUploadUrlAction` + StyleEditForm): MIME 검증(jpeg/png/webp) → catalogStorage presigned PUT → 클라 직접 S3 PUT → key를 `updateStyleAction`에 coverImageKey로 저장. UpdateStyleInput에 `coverImageKey?: string|null`(null=제거, undefined=무변경). 미리보기는 blob(업로드 직후) / presigned(새로고침 후). 실 S3 업로드·새로고침 유지·버킷 확인 검증됨.
- ✅ **make-admin** (`scripts/make-admin.ts`): 이메일로 ADMIN 승격, 멱등.

**테스트:** `npm run verify` 251개 통과(typecheck + lint 0 errors + test). lint 경고 4개는 의도된 `<img>`(next/image 호스트 미등록 회피, §8).

## 6. 남은 과제 (목표=출시)

- ⬜ **결제 실 통합** — **Phase 0 확정(§7-2): KR=국내 PG(토스 등) / US·JP=PayPal / EU 후속, SoR 모델.** 새 세션 첫 작업. mock provider → 실 provider(PayPal 라이브 + 토스), PG 콜백 라우트 채우기(`/orders/[id]/payment/callback` 자리만 있음). ⚠️ PayPal+토스 *공존*(교체 아님)이라 인터페이스 검증 선행(§7-2, §11).
- ⬜ **피팅 실 VTO 통합** — Phase 0 피팅 미정(VTO 벤더·면책·생체 컴플라이언스). 막혀 있음. 실 VTO 시 버킷 A(생체) 생성 + storage `fittingStorage`를 S3로 전환 + §8 피팅 mock 잔재 폐기.
- ⬜ **출시 하드닝** (코드로 지금 가능, 결정 무관): **에러 모니터링/로깅**(실 사용자엔 사실상 필수 — 지금 에러가 운영자에게 안 보임), **보안 점검**(mock 라우트 프로덕션 404 검증, env/비밀 노출, IAM 최소권한, 어드민 경계 전수), **사용자 화면 모바일 반응형**(§2 모바일 우선인데 미검증 — 사용자 화면 필수, 어드민은 후순위). auth 하드닝 일부.
- ⬜ **도메인** — 여전히 미정. Vercel 프로덕션 배포·프로덕션 CORS(현재 dev origin `localhost:3000`만)·OAuth 프로덕션 리다이렉트·결제 콜백 URL이 다 여기 걸림.

## 7. 핵심 의사결정 (v1 누적 + 이 세션 갱신)

1. **마켓 모델** (v1): 통화=마켓 통화=표시=주문 통화. 마켓별 고정 가격(구매력 기준, FX 아님). Market은 first-class.
2. **결제 provider — ✅ 확정 (이 v3):**
   - **모델: SoR(Seller of Record).** 우리가 판매주체 — 체크아웃·결제·고객데이터 직접 보유, 결제는 우리 PSP로 직접 수금. 풀MoR 아님(즉 글로벌 세금/법인을 외부에 위임하지 않음 → 세금/관세는 우리가 처리, §7-8 마진 엔진).
   - **법인: 한국 등록.** 이게 provider를 결정함 — KR 법인이 *지금 라이브로 켤 수 있는 글로벌 레일은 PayPal뿐*(Stripe·Airwallex acquiring은 현재 KR 법인 미가용. Airwallex KR acquiring은 2026 출시 예정 → 그때 "어댑터 추가만으로" 갈아끼울 수 있어야 함).
   - **마켓별 provider (우리 factory `getPaymentProvider(marketCode)`가 이미 전제):**
     - **US·JP = PayPal** (라이브 구현 대상). 고객 표시통화(presentment)로 청구.
     - **KR = 국내 PG (토스 등)** — 한국 소비자는 PayPal 침투율이 낮아(카드·카카오페이·네이버페이·토스 기대) PayPal로는 KR 전환이 안 난다. 그래서 KR은 국내 PG. (v1의 "한국=Toss" 방향과 일치.)
     - **EU = 후속** — 현재 Market 모델에 EU 없음(KR/US/JP만). EU는 다국가 VAT라 단일 "EU" Market이 맞는지도 별도 설계. Airwallex KR acquiring(2026)이나 EU 진입 시 어댑터 추가.
   - **⚠️ 핵심 주의 — PayPal과 토스는 "교체"가 아니라 "공존"이다:** provider *교체*(mock→PayPal, 토스→다른 PG)는 우리 추상화로 쉽다(어댑터 하나). 하지만 PayPal과 토스가 *동시에 라이브*라 마켓별로 갈리는 건 더 까다롭다 — 둘의 흐름이 근본적으로 다를 수 있다(PayPal: 리다이렉트/팝업·SDK 버튼 / 토스: 한국식 결제창·본인인증·계좌이체). **웹훅/콜백 형식도 완전히 다르다.** PaymentProvider 포트(createPayment/capture/refund/getStatus/verifyAndParseWebhook)가 *두 이질적 흐름의 공통분모*로 충분히 추상적인지는 **두 PG의 실제 API를 정찰한 뒤 확정**해야 한다(§9 가정 금지). "어댑터 끼우면 끝"으로 가볍게 보면 콜백/웹훅 형식 차이에서 막힌다. → §11 첫 작업이 *인터페이스 검증 선행*으로 구조화됨.
   - **PCI 최소화:** 원시 카드정보(PAN) 저장 금지. provider 호스티드/토큰화 사용 → PCI 범위 최소(우리 §11 "PCI는 PSP가 처리"와 일치).
   - **확장점만(미구현):** 멀티-PSP 라이브 라우팅/페일오버, B2B VAT번호/VIES/리버스차지는 *인터페이스 + TODO 주석*만. Stripe·Airwallex 어댑터는 *동일 인터페이스의 스텁*(NotImplemented + TODO)으로 "씸이 실재함"만 증명.
3. **결제 처리 설계** (v1, 완료): 재고 차감=조건부 업데이트(원자적, 오버셀 방지), idempotency=상태 가드+provider 키 2층, 카트 비우기=성공 트랜잭션 안. **이 코어는 mock 위에 이미 구현됨** — 실 provider는 `src/lib/payment/` PaymentProvider 추상화에 끼우는 것. ⚠️ **새 세션 주의: 포트(PaymentProvider)·어댑터(mock)·유스케이스(processPayment)·factory(getPaymentProvider)가 이미 다 있다.** 결제 통합 스펙이 "헥사고날 구조를 처음 만든다"는 식이면 — 그건 우리 기존 `lib/payment/`와 *이중화*다. **새 헥사고날 디렉터리(domain/ports/adapters) 만들지 말고, 기존 `lib/payment/` 추상화에 PayPal·토스 어댑터를 연결**하라. 결제 코어(원자 차감·idempotency·카트 비우기)는 한 줄도 안 바뀌어야 함(STRICT, 행동 테스트로 불변식 증명 — 이건 우리 §3 철학과 스펙 "교체 가능 불변식 테스트"가 정확히 일치).
4. **결제 UI 라우트 분리** (v1, 완료): `/orders/[id]/payment`(결제 진행) ↔ `/orders/[id]`(조회). PG 콜백 라우트는 **자리만 있음** — provider 결정 후 채움.
5. **피팅 provider 방향** (v1): 자체 AI 아님, 외부 VTO 추상화. 자체 세그멘테이션/인페인팅 금지(특허 노출: KR 미러로이드 KR102538783B1, 해외 Perfect Corp). 권장: (A) 외부 VTO SDK 라이선스(면책 — 단 특허는 KR/JP 커버 확인, 결합 카브아웃 주의) 또는 (B) MVP에서 뺀다. 진짜 해자는 try-on이 아니라 커스터마이징→주문→제작 파이프라인.
6. **피팅 레인** (v1): 레인1(온디바이스 라이브 AR, 프라이버시 우위, 인앱브라우저 카메라 취약) / 레인2(네이티브, MVP 배제) / 레인3(서버 GenAI 정지이미지, 포토리얼, 얼굴 서버 전송=컴플라이언스 비용). seam은 provider-agnostic. 생체 프라이버시(BIPA/PIPA/APPI/GDPR)가 레인 선택 좌우 — 레인3는 관할마다 노출 곱, 레인1은 사진이 기기 안 떠남. 데모엔 레인3, 출시·스케일 기본값은 레인1 경향. **미확정.**
7. **storage 분리 (B') — 이 세션 신규:** storage를 `catalogStorage`/`fittingStorage` named provider 둘로 분리. if 분기 아님(호출처가 직접 import). 이유: 도메인이 이미 셋(카탈로그=영구, 셀카=만료, AI결과=캐시)인데 single provider라 미스매치. 카탈로그=S3, 피팅=mock 공존 가능. 피팅 실 VTO 시 fittingStorage만 S3로 바꾸면 됨. **미래 다버킷(catalog/fitting-private/processed-result)은 구조상 확장 쉬우나 지금 범위 아님(YAGNI).**

8. **가격·마진 엔진 — 분리, 결제 *후* 별도 작업 (이 v3 결정):**
   - 사용자 결정: **결제 실 통합을 먼저** 한다. 마진 엔진은 *분리해서 후속*. 이유: 출시엔 "PayPal/토스로 실제 수금"이 급하고, 마진 분해는 정교하지만 *출시 차단은 아니다*(우리 §7-1 마켓별 고정가로 일단 팔 수 있음).
   - **나중에 만들 마진 엔진의 범위(결제 스펙에서 — 지금 구현 X, 후속):** MarketConfig(시장별 통화·세금표시방식 INCLUSIVE[EU·일본]/EXCLUSIVE[미국]·세율·넥서스·반올림), 가격 두 모드((A)시장별 고정가 / (B)목표 순가에서 그로스업), `getPricing(product, market)` → MarginBreakdown(표시가·세금[INCLUSIVE면 역산]·관세/수입세·FX·배송·**순마진=표시가−세금−관세−FX−배송**), DDP(랜디드코스트 전액 선표시), TaxService/LandedCostService 포트(설정 기반 기본구현 → Passport/Zonos/Avalara 어댑터 추후), B2B 리버스차지(플래그+확장점만).
   - ⚠️ **마진 엔진이 우리 기존 결정과 충돌하는 지점(후속 작업 시 주의):**
     - 우리 §7-1은 "마켓별 *고정* 가격(구매력 기준, **FX 환산 아님**)"으로 명시 결정. 스펙의 (A)고정가 모드는 일치하나, (B)그로스업+FX 비용은 *부분 충돌*(우리는 FX 환산 안 하기로 했음). 후속 설계 시 (A)/(B) 어느 쪽을 KR/US/JP에 쓸지 §7-1과 정합 필요.
     - 랜디드코스트/DDP/관세 분해는 **현재 데이터 모델에 전혀 없음**(Order에 세금·관세 분해 필드 없음). 넣으면 스키마 대확장 — 별도 큰 작업.
     - **Money 타입 주의:** 스펙이 "Money 타입(정수 최소단위+통화)"을 요구하나 — **우리는 이미 있다**(CURRENCY_META + Int 최소단위 + zero-decimal 규칙, §4). 새 Money 클래스 만들지 마라. 특히 zero-decimal(KRW/JPY ×100 안 함)을 모르고 일반 Money로 *모든 통화 ×100*하면 §4의 100배 버그. 기존 규칙 재사용 필수.
   - **즉 마진 엔진은:** 결제 통합 끝난 뒤, 별도 세션/단계에서 — 기존 금액 규칙·마켓 모델·§7-1 고정가 결정 위에 *증분*으로. 지금은 손대지 않는다.

## 8. 정리 항목 (당장 안 막지만 나중에)

- **§8 피팅 mock 잔재** (실 VTO/실 생체 S3 시 폐기): `api/mock-storage/route.ts` + MockStorageProvider, OPTIONS/corsHeaders/mockGuard, `public/demo-fitting/*` canned + jobVariantMap 키잉, 결과 이미지 `<img>`(S3 호스트 등록 시 `<Image>` 복귀), `AI_MOCK_FORCE_FAIL`/`AI_MOCK_DELAY_MS`. **단 mock-storage 라우트는 피팅이 여전히 쓰므로 지금 못 지움**(피팅 셀카·결과 둘 다 의존). 카탈로그 S3 전환으로는 폐기 안 됨 — 피팅도 실물일 때.
- **결제 mock 잔재** (실 provider 시): `shouldSucceed`가 결제 코어 시그니처에 박힘(optional, 제거 대상). **`src/lib/payment/toss.ts` — v1에선 "초기 커밋 잔재(미사용)"였으나, 이제 KR=토스로 결정됐으니 *자산일 수 있다*.** 지울 게 아니라 — 새 세션이 정찰에서 그 파일이 뭘 담는지(쓸만한 토스 API 코드 TOSS_API_BASE 등이 있는지) 보고 *살릴지 새로 짤지* 판단. 토스 어댑터의 출발점.
- **갭 진단 쿼리** — 현재 관계 쿼리+메모리 필터. 카탈로그 대형화 시 raw SQL NOT EXISTS로 최적화 여지(지금 무관).
- **VariantMarketPrice 삭제/비우기 동작 미확인** — 한번 채운 가격을 비우는 게 되는지 미검증. 운영 시 "이 마켓 가격 내림" 필요하면 재점검.
- **어드민 lib 분산** — 어드민 관련 lib가 `admin.ts`/`admin-role.ts`/`catalog-admin/`/`admin-catalog-data.ts`/`admin-catalog.types.ts`/`admin-messages.ts`로 흩어짐. 동작엔 무관, 거슬리면 `lib/admin/`로 모으는 사소한 정리(지금 X).
- **미들웨어 Next 16 deprecation 경고** — `middleware.ts`가 Next 16에서 proxy 컨벤션으로 변경 예정(현재 경고, 동작 정상). 출시 전 하드닝 즈음 마이그레이션. ⚠️ **맥북 재시작 중 Next 버전이 14에서 드리프트했을 가능성** — `npm ls next`로 §2 고정(14) 유지 확인 권장(verify 통과라 급하진 않음).
- **ADMIN 프로비저닝** — 현재 make-admin 스크립트(첫 부트스트랩). 출시 후 "기존 ADMIN이 타 유저 승격" 같은 사용자 관리 기능은 미구현(닭-달걀이라 부트스트랩 먼저). 출시 준비 때 결정.
- **테스트 DB** — 통합 테스트 `wig_platform_test` 분리. CI 붙일 때 `test:setup`(createdb+migrate) 필요.

## 9. 작업 방식 (v1과 동일 + 이 세션 교훈)

- 사용자가 Claude Code로 실제 코딩. 이 채팅 역할 = 설계 판단 + CC 프롬프트 작성 + 결과 리뷰.
- 큰 작업은 코어/UI로 쪼개서 프롬프트. **CC 프롬프트엔 항상 "commit/push/git add 하지 말 것" 명시**(사용자가 검토 후 직접 커밋).
- 매 기능 끝 `npm run verify` → 초록이면 **사용자가 즉시 직접 커밋해 복구지점 박기**(CC가 다음 작업에서 같은 파일 다시 만져 회귀 숨기는 사고 방지). 커밋 분할은 시간순 아니라 **파일/논리 경계**.
- ⚠️ **교훈 (이 세션):**
  - **verify 초록 ≠ 작동.** 특히 UI 상호작용(Dialog 재열림/backdrop, Toast 배선, 목록 갱신)과 런타임 분기(미들웨어 Edge 세션, mockGuard NODE_ENV)는 타입/테스트가 못 잡음 → 사용자가 `npm run dev`로 직접 클릭/확인하는 단계 필수.
  - **"코드상 있음 ≠ 런타임 작동"** 반복 확인됨: (1) 미들웨어가 server action과 다른 세션 읽기(getToken vs getSession), (2) storage named 분리는 됐는데 mock-storage 라우트 가드가 옛 결합이라 s3 모드에서 피팅 깨짐. → **라우트/HTTP/런타임 디버깅은 브라우저 Network 탭 + 실제 status(404 등)를 코드 인용보다 먼저.** 브라우저는 CORS/preflight 실패를 "Failed to fetch"로 뭉뚱그려 진짜 원인을 가린다.
  - **의심되면 read-only 진단부터** (`git status --short`, `git log --oneline`, 파일 내용 grep). 추측으로 고치면 이미 멀쩡한 걸 덮을 위험.
  - **이미지 업로드 미리보기는 blob** → "미리보기 떴다"가 "S3 저장됐다"를 증명 안 함. *새로고침 후에도 뜨나* + *실 버킷에 있나*가 진짜 검증.

## 10. 협업 규칙 (사용자 Profile Preferences — 자동 적용)

중대하거나 되돌리기 어려운 결정에서: 하나의 추천으로 곧장 수렴하지 말고 가능한 접근법 전체를 펼치고 채택/배제 이유를 밝힌다. 사용자가 제시한 선택지가 당연하게 고정한 전제를 찾아 풀어보고, 작업 범위가 허락하는 만큼 더 넓은 옵션을 점검한다. 검토한 범위의 경계를 명시한다. 단순 사실 확인은 간결히. **이 규칙을 적극 적용하라.**

(이 세션에서 실제로: 피팅 v1 갈림길(A/B 이분법→강도·마켓 두 축), ADMIN 가드 반환형(ok vs success), §4 갭 가드 강도(진단/경고/차단), 어드민 빌드 순서, storage 분리((A)전역/(B')named/(C)미룸/(D)임시방편), 자격증명(OIDC/장기키)에서 프레임을 넓혀 더 나은 설계에 도달했다.)

## 11. 다음 단계 — 새 세션이 시작할 곳

**사용자 목표: 출시(실 사용자 즉시 이용).**

**현 위치:** "막히지 않은 코드"(스토리지→어드민) 완료. user-facing 코어 3개 중 스토리지 실물화. **결제 Phase 0 확정**(§7-2: KR=토스 등 국내 PG / US·JP=PayPal / EU 후속, SoR 모델). 결제 실 통합이 다음 작업. 피팅은 Phase 0(VTO/생체) 미정으로 여전히 막힘.

**새 세션의 결제 통합 — 단계화 (§9 "쪼개라", §10 "옵션 펼치기" 적용):**

이 작업은 PayPal *하나*가 아니라 PayPal+토스 *둘 공존*이고, 둘의 흐름(리다이렉트/콜백/웹훅)이 달라서 — 인터페이스 검증이 선행이다. 한 프롬프트에 다 넣지 말고 단계로:

1. **정찰 (읽기 전용 — 먼저):** 기존 `src/lib/payment/`의 현재 형태 전부 확인 — PaymentProvider 포트 시그니처, mock 어댑터, 결제 코어(processPayment: 재고 원자 차감·idempotency·카트 비우기 트랜잭션), `getPaymentProvider(marketCode)` factory, PG 콜백 라우트 자리(`/orders/[id]/payment/callback` 등 — v1 §7-4 "자리만 있음"), mock 잔재(`shouldSucceed`, `toss.ts`가 뭘 담는지). **목적: 스펙이 "처음 만든다"고 쓴 것 중 *이미 있는 것*을 확인해 이중화 방지.** (대부분 이미 있다 — 포트·어댑터·유스케이스·factory.)

2. **인터페이스 검증 (PayPal+토스 공통분모 — STRICT):** 현 PaymentProvider 포트(createPayment/capture/refund/getStatus/verifyAndParseWebhook 또는 우리 실제 시그니처)가 PayPal과 토스 *둘 다*를 담는 공통분모인가. 두 PG의 실제 흐름(PayPal 리다이렉트/SDK·웹훅 서명 / 토스 결제창·본인인증·콜백·웹훅 서명)을 조사해 현 인터페이스로 표현되나 확인. 안 되면 포트 보강(추상화 변경 = STRICT, 행동 테스트). **이게 안 되면 어댑터를 못 끼운다 — 가장 먼저 풀 위험.** present-day API는 검색 + 공식 문서.

3. **PayPal 어댑터 (라이브, US·JP):** 멱등(idempotency key) + 웹훅 서명검증 + 중복처리 방지 + PAN 저장 금지(호스티드/토큰화). `verifyAndParseWebhook`이 PayPal 이벤트를 *정규화된* PaymentEvent로. MockProvider로 "주문/가격 로직 변경 없이 provider 교체"되는지 단위테스트(불변식 증명). 결제 코어는 안 바뀜.

4. **KR 토스 어댑터:** 한국식 흐름(결제창·간편결제·계좌이체, 필요시 본인인증). `toss.ts` 잔재가 출발점일 수 있음(정찰에서 확인). 동일 PaymentProvider 인터페이스 구현 → factory가 marketCode=KR이면 토스 선택. ⚠️ **토스 PG 온보딩(사업자등록·정산계좌·심사)은 리드타임 있음 → founders 트랙에서 병행** 진행돼야 코드가 라이브됨(코드 완성 ≠ 결제 라이브).

5. **콜백 라우트 채우기:** 두 provider의 리다이렉트→콜백→서명검증→상태 전이(PENDING_PAYMENT→PAID/FAILED)를 받게. v1 §7-4 자리만 있던 걸 PayPal·토스 둘 다 받게 구현.

6. **Stripe·Airwallex 스텁:** 동일 인터페이스의 NotImplemented+TODO 스텁만(씸 실재 증명). Airwallex KR acquiring(2026) 오면 어댑터 교체.

7. **mock 잔재 정리:** `shouldSucceed`(mock 전용 파라미터) 제거. tax 슬롯(Market.taxConfig/paymentConfig nullable) — SoR이라 세금은 우리가 처리하나, *마진 엔진은 후속*(§7-8)이므로 지금은 비워두거나 최소만.

**단계 권장:** PayPal(US·JP 매출 먼저 열기) → 토스(KR, 온보딩 리드타임 고려) 순으로 나눌 수 있다. 단 새 세션이 정찰·인터페이스 검증 후 정함. **각 단계 끝 `npm run verify` → 사용자 직접 커밋(복구지점, §9).**

**병행 가능한 코드 (결제와 독립, 결정 무관):** 출시 하드닝 — **에러 모니터링**(첫 후보, 인프라성: 지금 에러가 운영자에게 안 보임)·**보안 점검**(읽기 전용 정찰부터: mock 라우트 프로덕션 404, env/비밀 노출, IAM 최소권한, 어드민 경계 전수)·**사용자 모바일 반응형**(§2 모바일 우선인데 미검증, 사용자 화면 필수·어드민 후순위). 단 **하드닝을 통째로 미리 하지 마라** — 결제·피팅이 실물 된 뒤 그 화면도 하드닝해야 하므로, *지금 있는 코드*에 대한 필수분만.

**마진 엔진 (§7-8):** 결제 통합 *후* 별도. 지금 손대지 않음. 출시는 §7-1 마켓별 고정가로 가능.

**여전히 코드 밖(founders 트랙, 막는 것):**
- **토스 PG 온보딩** (사업자등록·정산·심사) — 결제 코드 라이브의 전제.
- **피팅 Phase 0** (VTO 벤더·면책 KR/JP·생체 컴플라이언스) — 실 피팅의 전제.
- **법무** (개인정보처리방침·약관·얼굴사진 삭제 흐름).
- **도메인 확정** (Vercel 배포·프로덕션 CORS[현재 dev origin만]·OAuth 프로덕션 리다이렉트·**결제 콜백 URL** — PayPal/토스 웹훅·리다이렉트가 실 도메인 필요).

**경계 (이 인계의 한계):** 위 순서는 일반적 임계경로다. 실제 순서는 — 토스 온보딩 진행도, PayPal 비즈니스 계정 상태, 도메인 확정 시점, 피팅 Phase 0 진행도, 예산·타임라인에 달렸고 그건 이 문서가 모른다. **새 세션은 먼저 §1 정찰로 기존 `lib/payment/` 현황을 확인하고(가정 금지), 인터페이스가 PayPal+토스 공존을 담는지 검증한 뒤, 거기 맞춰 설계부터(옵션 펼치기→추천→단계별 코어/UI 프롬프트) 시작하라.** 특히 "어댑터 끼우면 끝"으로 가볍게 보지 말 것 — 두 PG의 콜백/웹훅 형식 차이가 실제 난관이다.
