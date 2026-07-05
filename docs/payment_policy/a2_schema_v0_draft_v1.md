# A2 스키마 v0 초안 (신 결제 코어) — 정책 v5 기준

> **성격**: 설계 잠금 *입력*(초안). 잠금 전 §5의 정찰 확인이 선행돼야 한다. 작성 2026-07-06, 기준 문서 = `payment_policy_confirmed_v5.md`·`payment_policy_open_v5.md`·`legacy_salvage_notes.md`·AGENTS v4 §8.
> **v0의 범위**: Track 1 A3~C2가 딛는 최소. 미확정 4영역(§1.1 스냅샷 명세·§1.3 PII 볼트·§7.1 환불 상태기계·§7.3 세금 산정)은 **격리된 자리**로만 반영 — 확정 시 해당 자리만 승격·이동한다.

---

## 1. 설계 결정 (D1~D12 — 옵션·채택/배제 이유)

**D1. 멱등·동시성의 물리 구현 = 이중 유니크 + 세션 행 잠금.**
- 채택: `Payment @@unique([provider, providerPaymentKey])`(같은 PG 결제의 중복 행 차단 — 출시 요건, open §2.2) + **`Order.checkoutSessionId @unique`**(세션 1 : 주문 ≤1 — 상위 불변식의 DB 최후방어) + `Order.paymentId @unique`(성공 결제 1:1). 동시 완료 중재는 §9대로 CheckoutSession **행 잠금(SELECT FOR UPDATE)** — 스키마 추가 불요, 잠금의 패자가 뚫어도 유니크가 막는 이중 구조.
- 배제: (i) `Payment.checkoutSessionId`에 부분 유니크(성공 상태만) — PostgreSQL 부분 인덱스는 Prisma 스키마로 표현 불가(raw SQL migration 필요)하고, Order 유니크가 같은 불변식을 더 단순하게 보장. (ii) 레거시 방식(idempotencyKey 단독) — 인양 함정 목록의 바로 그 구멍.
- 참고: `providerPaymentKey`는 confirm 전 NULL 가능 — PostgreSQL 유니크는 NULL 다중 허용이라 시도 행 복수 생성과 충돌 없음(이 성질에 의존함을 명시).

**D2. 세션 스냅샷의 물리형 = 라인 행 + 라인별 Json + 배송 위성.**
- 채택: `CheckoutSessionLine` 행(variantId FK·quantity·unitAmount — 집계·재고 차감·FK 무결) + 행마다 `snapshotData Json`(표시 스냅샷: 이름·색·이미지 key 등 — 레거시 검증된 패턴) + 배송지는 D3 위성. §1.1 명세 확정 시 Json 내 항목을 컬럼으로 승격하는 마이그레이션 경로가 열려 있음.
- 배제: 세션 단위 Json 블롭(집계·검증·부분 조회 불능), 전 항목 즉시 컬럼화(§1.1 미확정 상태에서 추측 고정).

**D3. PII 선격리 — 배송지는 위성 테이블.**
- 채택: `CheckoutSessionShipping`·`OrderShipping`(각 1:1). 근거: §1.3에서 (a)볼트가 권고 상태 — 채택되면 **이동 대상이 테이블 단위로 한정**되고, (b)로 결정돼도 비용은 조인 1개(비대칭이 선격리를 정당화 — Track 1 분해 시 명시했던 권고의 이행). 라인 snapshotData에는 PII 금지(주석으로 고정).
- 세션/주문 배송지를 한 테이블로 합치는 안 배제: 세션 쪽은 동결된 *입력*, 주문 쪽은 오버라이드 가능한 *이행 상태*(CORE-2) — 가변성이 달라 분리("정의는 공유, 접근은 분리").

**D4. `PaymentEvent`(원장 v0) — raw NOT NULL, dedup은 처리 상태 기준.**
- 채택: `raw Json`(필수 — 레거시 함정 "컬럼만 있고 미사용"을 타입으로 교정, v5 §7.5), `@@unique([provider, transmissionId])`(저장 dedup), `processedAt`·`status`로 **"수신됨 ≠ 처리됨" 구분**. 재전송 시 미처리 행이면 재처리하는 의미론은 코드 몫(v6 공백 4건 중 "dedup 기준" — 스키마는 자리만 제공).
- `source WEBHOOK|API` 열로 §7.5 최종형(전 PSP 교신 원장)으로의 확장 방향 예약. 이름을 레거시(`PaymentWebhookEvent`)와 다르게 둔 것은 의미론 차이(웹훅 한정 → 원장 지향)의 표시.

**D5. `OrderStatus = { PAID }` 단일 값 시작.**
- 근거: Full C에서 Order는 성공 시에만 태어나고(초기값 = 유일값), 취소·환불 상태공간은 §7.1 미확정 — 추측으로 enum을 채우면 §7.1 확정 때 의미 충돌 마이그레이션이 됨. 망취소(B5)는 Order 불성립 경로라 CANCELLED조차 불요. 확장은 §7.1 확정 시 명시적 마이그레이션.
- 배제: 레거시 상태 재사용(PENDING_PAYMENT 등 — 인양 대상에서 제외된 이유와 동일), 넉넉한 선제 enum.

**D6. 통화 보유 = 문서(세션·주문·결제) 레벨 단일, 라인은 금액만.**
- 근거: "문서 내 단일 통화"가 불변식 — 라인별 currency는 그 불변식을 흐리고 혼합 통화 버그 표면을 넓힘. A1 보강(혼합 통화 연산 방지)은 코드 가드가 맡음. 금액은 전부 `Int` 최소단위(§7.2·AGENTS §7).

**D7. raw SQL migration 불요 판정.**
- 부분 유니크 배제(D1)로 v0의 전 제약이 Prisma 표현 가능. 행 잠금은 쿼리 레벨(`$queryRaw`/`FOR UPDATE`)이지 DDL이 아님. 판정이 뒤집히는 유일 조건 = 정찰(§5)에서 표현 불가 제약 발견 시.

**D8. `disputeStatus String?` — §7.8의 "자리만".**
- enum 배제: §7.8 상태기계 미설계 — nullable String 자리가 마이그레이션 churn 없이 승격 대기. 위치는 Order(§7.8 문안의 Payment/Order 중 이행 중단 훅의 주체가 Order라서).

**D9. `PaymentOutbox` 범용형(§2.3).**
- topic+payload Json+상태+재시도 메타. 보상·망취소 명령도 이 위를 탈 예정이나 **보상 키 설계는 v6 공백** — payload 규약으로 이연하고 스키마는 `dedupKey @unique`(소비 멱등 보조)만 예약.

**D10. MR = MTO 라인에만, `startedAt` = point of no return 기록(MFG-1·2).**
- `OrderItem`↔`ManufacturingRequest` 1:1(@unique), MR 생성은 B2 완료 tx 안 + `isMadeToOrder` 라인만. **MTO 판별 원천이 현 스키마에 없을 가능성** — §5 정찰 항목(없으면 WigVariant에 필드 추가가 A2에 합류). 상태 enum은 최소 4값, 이력 테이블은 E1로.
- 레거시 필드(hairCadKey 등)는 이식하지 않음(부활 금지 — 필요 시 E단계에서 공식 요구로 재정의).

**D11. `ShippingCountry` enum 재정의(KR/US/JP).**
- String 배제: SCOPE-2가 시장을 명시 확정 — enum이 과세·환불 판정표(§6.0)의 타입 안전을 줌. EU 후속은 명시적 마이그레이션(§12 트리거와 정합).

**D12. Order의 금액 비정규화 복사 허용.**
- 세션이 SSOT(CORE-2)지만 스냅샷이 *불변*이므로 복사본에 drift가 없음 — 표시·환불 기준 조회가 조인 없이 성립. 규칙: "세션에서만 복사, 이후 불변"(코드 가드 + 검수).

---

## 2. Prisma 스키마 초안 (v0)

```prisma
// ===== 신 결제 코어 v0 — 정책 v5 =====
// 금액 규칙: 전부 최소단위 Int(KRW/JPY 비×100, USD 센트). 통화는 문서 레벨 단일(D6).

enum CheckoutSessionStatus {
  OPEN       // 편집 가능(카트→세션 생성 직후)
  SUBMITTED  // 스냅샷 동결·PG 진행 중(B1: 이 전이에서 라인·금액·배송 확정)
  COMPLETED  // 완료 tx 성공 — Order 존재
  FAILED     // 결제 실패/망취소로 종결(재시도 = 새 세션, B1 설계)
  EXPIRED    // expiresAt 경과 정리(§5.2 — 물리 삭제 아님, 아카이브 단계화는 후속)
}

enum PaymentProvider { MOCK TOSS PAYPAL }   // PG-1 라우팅 표와 정합, EU 후속은 명시적 마이그레이션

enum PaymentAttemptStatus {
  INITIATED  // 시도 행 생성
  AWAITING   // PG 승인 대기(결제창/승인 진행)
  SUCCEEDED  // capture/confirm 확정(완료 tx의 입력)
  FAILED
  VOIDED     // 망취소 완료(B5)
}

enum OrderStatus { PAID }                   // D5 — §7.1 확정 시 확장

enum MrStatus { RECEIVED IN_PRODUCTION COMPLETED CANCELLED }

enum OutboxStatus { PENDING PROCESSING DONE FAILED }

enum PaymentEventSource { WEBHOOK API }

enum PaymentEventStatus { RECEIVED PROCESSED IGNORED FAILED }

model CheckoutSession {
  id             String  @id @default(cuid())
  userId         String
  user           User    @relation(fields: [userId], references: [id])
  marketCode     String
  currency       String                    // 문서 레벨 단일 통화(D6)
  status         CheckoutSessionStatus @default(OPEN)
  subtotalAmount Int
  shippingAmount Int     @default(0)       // 배송비 정책 확정 전 0 — 필드는 확보
  totalAmount    Int                       // = subtotal + shipping (세금 자리는 §7.3 확정 시 컬럼 추가)
  expiresAt      DateTime                  // §5.2 만료(값은 B1 파라미터)
  submittedAt    DateTime?
  completedAt    DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  lines    CheckoutSessionLine[]
  shipping CheckoutSessionShipping?
  payments Payment[]
  order    Order?

  @@index([userId, status])
  @@index([status, expiresAt])             // 만료 스캐너용
}

model CheckoutSessionLine {
  id           String  @id @default(cuid())
  sessionId    String
  session      CheckoutSession @relation(fields: [sessionId], references: [id])
  variantId    String
  variant      WigVariant @relation(fields: [variantId], references: [id])
  quantity     Int
  unitAmount   Int                          // 세션 통화 기준 최소단위(VariantMarketPrice에서 스냅샷 — §0-8 현행 노선)
  isMadeToOrder Boolean                     // MFG-1 판별 스냅샷(원천은 정찰 — §5-2)
  snapshotData Json                         // 표시 스냅샷(이름·옵션·이미지 key). PII 금지(D3)
  createdAt    DateTime @default(now())

  @@unique([sessionId, variantId])
}

model CheckoutSessionShipping {              // PII 위성(D3) — §1.3 볼트 채택 시 이 테이블이 이동 단위
  sessionId          String @id
  session            CheckoutSession @relation(fields: [sessionId], references: [id])
  recipientName      String
  phone              String
  country            ShippingCountry
  postalCode         String
  administrativeArea String                  // 미국 주 — §7.3 판매세 집계의 도출 원천(스키마 추가 불요 조건)
  city               String
  addressLine1       String
  addressLine2       String?
  memo               String?
}

enum ShippingCountry { KR US JP }            // D11

model Payment {
  id                 String @id @default(cuid())
  checkoutSessionId  String
  session            CheckoutSession @relation(fields: [checkoutSessionId], references: [id])
  provider           PaymentProvider
  status             PaymentAttemptStatus @default(INITIATED)
  amount             Int
  currency           String
  providerPaymentKey String?                 // confirm 전 NULL — PG NULL 다중 허용에 의존(D1)
  idempotencyKey     String @unique          // 진입점 재시도 멱등(시도 행 차원)
  errorCode          String?
  errorMessage       String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  order              Order?

  @@unique([provider, providerPaymentKey])   // D1 — 출시 요건
  @@index([checkoutSessionId, status])
}

model Order {
  id                String @id @default(cuid())
  checkoutSessionId String @unique           // D1 — 세션 1:주문 ≤1 최후방어
  session           CheckoutSession @relation(fields: [checkoutSessionId], references: [id])
  paymentId         String @unique           // 성공 결제 1:1
  payment           Payment @relation(fields: [paymentId], references: [id])
  userId            String
  user              User   @relation(fields: [userId], references: [id])
  marketCode        String
  currency          String                   // D12 — 세션에서 복사, 이후 불변
  subtotalAmount    Int
  shippingAmount    Int
  totalAmount       Int
  status            OrderStatus @default(PAID)
  disputeStatus     String?                  // §7.8 자리만(D8)
  paidAt            DateTime
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  items    OrderItem[]
  shipping OrderShipping?

  @@index([userId, createdAt])
}

model OrderItem {
  id            String @id @default(cuid())
  orderId       String
  order         Order  @relation(fields: [orderId], references: [id])
  variantId     String
  variant       WigVariant @relation(fields: [variantId], references: [id])
  quantity      Int
  unitAmount    Int
  isMadeToOrder Boolean
  snapshotData  Json                          // 세션 라인에서 복사(불변)
  mr            ManufacturingRequest?

  @@unique([orderId, variantId])
}

model OrderShipping {                          // PII 위성 — CORE-2 오버라이드는 여기서만.
  orderId            String @id               // country·administrativeArea(과세구역)는 변경 불허 = 코드 가드
  order              Order  @relation(fields: [orderId], references: [id])
  recipientName      String
  phone              String
  country            ShippingCountry
  postalCode         String
  administrativeArea String
  city               String
  addressLine1       String
  addressLine2       String?
  memo               String?
  updatedAt          DateTime @updatedAt
}

model ManufacturingRequest {                   // MFG-1·2(D10). MTO 라인만, 생성은 B2 완료 tx 안
  id          String  @id @default(cuid())
  orderItemId String  @unique
  orderItem   OrderItem @relation(fields: [orderItemId], references: [id])
  status      MrStatus @default(RECEIVED)
  startedAt   DateTime?                        // 착수 = point of no return 기록
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model PaymentOutbox {                          // §2.3(D9)
  id            String @id @default(cuid())
  topic         String                         // 예: "mr.create"·"pg.void" — 규약은 A3/B5에서
  payload       Json
  status        OutboxStatus @default(PENDING)
  attempts      Int      @default(0)
  nextAttemptAt DateTime?
  lastError     String?
  dedupKey      String?  @unique               // 소비 멱등 보조(보상 키 설계는 정책 v6)
  createdAt     DateTime @default(now())
  processedAt   DateTime?

  @@index([status, nextAttemptAt])
}

model PaymentEvent {                           // 원장 v0(D4) — §7.5 최종형으로 확장 예약
  id                 String @id @default(cuid())
  provider           PaymentProvider
  source             PaymentEventSource
  transmissionId     String?
  eventType          String
  checkoutSessionId  String?
  providerPaymentKey String?
  raw                Json                       // NOT NULL — 레거시 함정 교정
  status             PaymentEventStatus @default(RECEIVED)
  receivedAt         DateTime @default(now())
  processedAt        DateTime?                  // dedup은 "존재"가 아니라 처리 상태 기준(코드 — v6 공백 자리)
  lastError          String?

  @@unique([provider, transmissionId])
  @@index([checkoutSessionId])
}

// 기존 모델 수정(정찰로 실물 확인 후):
//   User        += checkoutSessions CheckoutSession[] / orders Order[]
//   WigVariant  += sessionLines CheckoutSessionLine[] / orderItems OrderItem[]
//                (+ isMadeToOrder 원천 필드 — §5-2 정찰 결과에 따라)
```

---

## 3. 정책 조항 ↔ 스키마 대응 (추적표)

| 정책 | 구현 지점 |
|---|---|
| CORE-1 (Full C) | Order 생성 = B2 완료 tx에서만 — 스키마상 Order가 payment/session 필수 FK를 가져 결제 없는 Order가 타입상 불가 |
| CORE-2 (세션=입력, Order=이행) | 세션 스냅샷 불변(라인 Json+위성) / OrderShipping 오버라이드 / 과세구역 불허 = 코드 가드 |
| CORE-3·open §2.2 (멱등) | D1 이중 유니크 + idempotencyKey |
| CORE-5 (원자 차감) | 기존 WigVariant.stock — 스키마 무추가, B2 조건부 updateMany |
| CORE-6·§9 (공유 tx·중재) | 세션 행 잠금(쿼리 레벨) + D1 유니크 최후방어 |
| MFG-1·2 | OrderItem.isMadeToOrder → MR(1:1)·startedAt |
| §2.3 outbox | PaymentOutbox |
| §7.5 원장(v0) | PaymentEvent.raw 필수·source 열 |
| §7.8 최소분 | Order.disputeStatus 자리(설계는 후속) |
| §1.3 PII | 위성 테이블 2종(볼트 전환 단위) |
| §7.2·§7.3 | 전 금액 Int+문서 통화 / administrativeArea 확보(집계 도출) |
| §3-불변식5·v6 공백(dedup) | PaymentEvent 처리 상태 필드(의미론은 코드+v6) |

---

## 4. v0에 의도적으로 없는 것

세금·관세 컬럼(§7.3 산정 확정 후), 환불·조정 테이블(§7.1 + v6 공백 3건 확정 후 — 레거시 PaymentAdjustment는 부활 금지 대상, 재설계로), 예약 레이어 테이블(CORE-5 — 기본 비활성, §12 트리거), MR 이력 테이블(E1), 이벤트 원장 최종형(§7.5 — D 스파이크 후), 쿠폰/할인·환율 필드(§0-8 답 대기).

---

## 5. 설계 잠금 전 Codex 정찰 확인 항목 (read-only)

1. **생존 스키마 실물**: User·WigVariant·Market·VariantMarketPrice·CartItem의 id 타입(cuid 여부)·관계 명명 관례·@map 사용 여부 — 초안의 FK 타입·명명을 실물에 맞춰 조정.
2. **MTO 판별 원천**: WigVariant(또는 Style)에 주문제작 여부 필드가 있는가. 없으면 → 추가 필드가 A2에 합류(값 백필 규칙 포함해 보고).
3. **이름 충돌·잔존물**: 삭제된 모델명(Order 등)·enum명을 참조하는 코드/타입 잔존 0 확인(스텁 포함), migration 디렉토리에 drop 이후 상태 확인.
4. **Prisma 7 제약 표현**: 위 스키마의 복합 유니크·optional 유니크가 프로젝트의 Prisma 버전·어댑터(PrismaPg)에서 그대로 성립하는지(성립 안 하면 D7 재판정).
5. **seed 접점**: 신 모델은 seed 불요가 맞는지(스타일·마켓 seed와의 FK 접점 없음 확인).

---

## 6. 검토 경계

이 초안은 정책 v5·인양 문서·AGENTS v4와 이 세션의 정찰 보고(생존 스키마 서술)에 근거하며 **리포 실물 미대조**다(그래서 §5가 잠금 게이트). Prisma 7 문법·PostgreSQL NULL-유니크 의미론은 학습 지식 기준 단정(안정 동작이라 검색 안 함 — §5-4가 실측 지점). 커버하지 않은 것: 인덱스 튜닝(부하 데이터 없음 — GOAL-0·트래픽 미지), 파티셔닝·보존 기간(§1.1 법률 종속), 세션 정리 배치의 상세(B1), 그리고 §0 열린 질문들의 답(특히 §0-8 가격 원천 — 초안은 현행 VariantMarketPrice 노선을 *가정*했고, KRW 환산 노선으로 결정되면 unitAmount 스냅샷 의미가 바뀜). D1의 NULL-유니크 의존과 D5의 단일값 enum은 취향이 갈릴 수 있는 지점이라 명시적으로 표시해 둔다.
