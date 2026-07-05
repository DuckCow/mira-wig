# B2 완료 처리 설계 초안 v1 — 정책 v5 기준 (Track 1의 심장)

> **성격**: 설계 잠금 *입력*. §6 정찰 확인 후 잠금 → 빌드. 작성 2026-07-06. 기준 = 정책 v5(§3 상위 불변식·CORE-3/4/5/6·§9·§2.2/2.3), A2/A2보완 스키마, A3 outbox, B1 세션.
> **범위**: 결제 성공 *신호*를 받아 완료를 확정하는 코어 — α(캡처 사실 기록)·β(완료 트랜잭션)·γ(보상 인텐트). **진입점(PG confirm·웹훅 파싱/검증)은 B3/B4, void 실행은 B5** — 여기 없음.
> **정정(B1 erratum)**: b1 문서 DB3의 "(우리 만료 < PG 만료 권장)"은 방향 오류. 올바름: **세션 TTL ≥ PG 결제창 유효시간 + 여유** — 우리 창이 먼저 닫히면 "유효 캡처·죽은 세션"을 양산한다. 값 정합은 D 스파이크 확인(플래그 유지).

---

## 1. 설계 결정

**DC1. 완료의 국소 구조 = 3분해: α 캡처 기록 → β 완료 트랜잭션 → (실패 시) γ 보상 인텐트.**
- **α (작은 tx):** PG가 캡처를 확정했다는 *외부 사실*을 로컬에 내구 기록 — Payment 행을 `(provider, providerPaymentKey)` 유니크로 upsert-식 처리(기존 INITIATED/AWAITING 행 있으면 조건부 전이 → SUCCEEDED + key 기록 / 없으면 생성 — 웹훅-선착 케이스). **이 유니크 소비가 동시 신호의 1차 중재점.** amount·currency는 PG 검증값으로 기록.
- **β (완료 tx — CORE-6의 "공유 단일 트랜잭션"):** 세션 행 잠금 → 가드 → 주문 생성 등 완료 효과 전부 원자(DC3). confirm·웹훅 어느 진입점이든 **같은 β를 호출**한다.
- **γ (작은 tx):** β가 "캡처는 유효한데 완료 불가"로 분류 실패하면 `pg.void` outbox enqueue(DC5) — 실패한 β 안에서 enqueue하면 롤백과 함께 증발하므로 **반드시 β 밖 별도 tx**.
- 배제한 대안 — **단일 거대 tx(α+β 합체, 레거시 방식):** β 실패 롤백이 α(캡처 사실)까지 지우면, "PG는 받았는데 로컬은 모름" 상태가 되어 보상의 출발점 자체가 유실된다 — v7 write-ahead 교훈의 구조적 일반화가 3분해다. crash가 α~β 사이에 나도 상태는 "SUCCEEDED payment + SUBMITTED 세션 + 주문 없음" = **재진입으로 β 재시도 가능한 양호 상태**(신호 재도착·대사가 잡음), void가 아니라 완료로 수렴한다.
- CORE-6 독해: "공유 단일 트랜잭션"은 완료 *효과*의 원자성(β)을 말하며, 외부 사실의 선기록(α)을 금하지 않는다 — 오히려 §2.3·v7 교훈과 정합.

**DC2. 만료-늦은 신호 규칙 = 캡처 시각 기준 판정.**
- 문제: 웹훅 복구(B4)는 본질적으로 *늦은* 신호 전달 장치 — 신호 도착이 expiresAt 이후일 수 있고, C1의 명시 시나리오("만료↔늦은 승인")다.
- **채택: 판정 기준 = PG 캡처 시각 vs 세션 유효창.** `capturedAt ≤ expiresAt`이면 거래는 창 안에서 성립한 것 — 신호가 늦게 와도 완료한다(세션이 이미 EXPIRED로 스윕됐다면 **EXPIRED→COMPLETED를 "늦은 유효 완료" 전이로 정의**해 전이 표에 추가 — B1 transitions 확장). `capturedAt > expiresAt`이면 완료 거부 → γ(void).
- 배제: (i) 도착 시각 기준 일괄 거부 — 정당하게 창 안에서 결제한 고객의 돈을 신호 지연 때문에 강제 환불(전환 손실 + 환불 지연 UX). (ii) 물리 상태(스윕 여부) 기준 — 스위퍼 타이밍이 돈의 향방을 결정하는 비결정성. (iii) 무제한 수용 — 스냅샷(가격) 유효성의 무한 연장.
- 폴백: PG가 캡처 시각을 안 주는 경로면 **신호 도착 시각으로 보수 판정**(늦으면 void 쪽). `[확인: D 스파이크 — Toss approvedAt·PayPal capture create_time 가용성]`

**DC3. β 내부 순서 (전부 한 tx).**
1. 세션 행 잠금 — `SELECT … FOR UPDATE`(§9. DC4).
2. 가드: 세션 상태(SUBMITTED, 또는 DC2 조건 하 EXPIRED) / DC2 시각 판정 / **금액·통화·참조 재검증**(불변식 3: payment의 PG 검증값 == 세션 totalAmount·currency — α를 거쳤어도 β가 자기 가드로 재확인, 진입점 신뢰 안 함).
3. Order 생성(checkoutSessionId·paymentId — **이중 유니크 최후방어 소비 지점**) + OrderItem 복사 + OrderShipping 복사(세션 위성에서).
4. STOCKED 라인: `stock ≥ qty` 조건부 차감(updateMany count 검증 — CORE-5. 현 카탈로그 전 라인 MTO라 실행 시 대상 0이 정상이나 메커니즘·테스트는 STOCKED 픽스처로).
5. MTO 라인: MR 생성(MFG-1 — tx 안).
6. 카트 정리(C2): **구매한 라인만** — `deleteMany(userId + variantId ∈ 세션 라인)`. 전체 비우기 배제(정책 문언 = "결제한 품목").
7. 세션 SUBMITTED→COMPLETED(또는 DC2의 EXPIRED→COMPLETED) 조건부 전이 — count=1 확인.
- 실패는 어느 단계든 전체 롤백 → DC5 분류.

**DC4. 잠금 = `$queryRaw` SELECT FOR UPDATE — 코드베이스 첫 raw 쿼리.**
- 근거: §9가 행 잠금을 명시 확정. Prisma는 FOR UPDATE의 선언적 표현이 없어 raw가 정당한 최소 사용(A3 DA2의 "raw 회피"는 *선택지가 있을 때*의 우선순위였음 — 여기는 선택지 없음). 경계: raw는 이 잠금 한 곳에 격리(전용 헬퍼), 문자열 조립 금지(Prisma.sql 태그).
- 배제: 잠금 없이 유니크만 — §9가 이중(잠금+유니크)을 확정한 이유는 잠금이 "패자의 부수효과 미실행"을 보장하기 때문(유니크만으론 패자가 재고 차감 후 롤백하는 낭비 경합).

**DC5. 실패 분류와 γ의 규약.**
- 분류: (a) **재시도 가능**(일시 — DB 순단·직렬화 충돌): 결과만 반환, void 없음(신호 재도착/대사가 재시도). (b) **완료 불가 확정**(만료·금액 불일치·재고 부족·세션 FAILED): γ 발행 + 세션 SUBMITTED→FAILED 전이(별도 작은 tx — 가능하면). (c) **이미 완료**(멱등 — DC6): 기존 주문 반환.
- γ 규약: topic `pg.void`, **dedupKey = `void:{provider}:{providerPaymentKey}`** — 같은 캡처에 void 인텐트는 1개(outbox 유니크가 멱등 보장). payload = { paymentId, provider, providerPaymentKey, reason }. **주의: 이 dedupKey 규약은 정책 v6 공백 "보상 공유키"의 사실상 선결정**이다 — v6가 이 규약을 승인·문서화하는 방향으로 이관(여기 기록이 근거 레코드).
- 미등록 토픽 성질(A3 AM1)의 활용: B5 전까지 `pg.void` 행은 클레임되지 않고 대기 — 유실이 아니라 **내구 큐잉**. B5 배포 즉시 소화. C2 대사가 그 전 구간의 최후 방어.

**DC6. 멱등·동시성 매트릭스.**
- 같은 신호 2회: α에서 유니크/조건부 전이가 1회만 성립 → 2회째는 기존 payment 로드 → 세션 COMPLETED면 기존 주문 반환(멱등 성공), SUBMITTED면 β 재시도(수렴).
- confirm×웹훅 동시: α 중재(한쪽만 전이 성공) 후 β는 세션 행 잠금이 직렬화, 패자는 잠금 해제 후 "이미 COMPLETED" 가드에 걸려 멱등 반환. 주문 이중 생성은 Order 유니크가 최후 차단.
- 서로 다른 payment 2개가 같은 세션 완료 시도(이론상): 행 잠금 + 세션 상태 전이 count=1로 한쪽만 승리, 패자 payment는 (b) 분류 → void. (실질 발생 경로는 B3 설계에서 차단되나 β는 자기 방어를 가짐.)

**DC7. 산출 형태.** `src/lib/payment/complete/{record-capture(α), transaction(β), classify+compensate(γ), types}.ts` — 진입점(B3/B4)이 소비할 단일 진입 함수 `completeFromCapture(client, captureFacts)` 제공(α→β→γ 오케스트레이션 포함). 전부 STRICT.

## 2. 행동 테스트 명세 (B2 완결 조건)

⑴ 정상 완료: 주문+아이템+배송 복사+MR(MTO만)+카트 구매 라인만 삭제+세션 COMPLETED+금액 일치 ⑵ STOCKED 픽스처: 조건부 차감 성공/부족 시 전체 롤백+void enqueue ⑶ 멱등: 같은 캡처 2회 → 주문 1개·효과 1회·2회째 멱등 성공 ⑷ 동시: 두 completeFromCapture 경쟁 → 주문 1개·패자 멱등 ⑸ 금액 불일치 → 미완료+세션 FAILED+`pg.void` 행(dedupKey 규약) 1개 ⑹ 만료-늦은 신호: capturedAt ≤ expiresAt(스윕 전/후 각각) → 완료 / capturedAt > expiresAt → void ⑺ α~β 크래시 재현(α만 수행 상태에서 재진입) → β 수렴 ⑻ void enqueue 멱등(같은 캡처 재실패 → outbox 행 1개) ⑼ 카트에 비구매 라인 잔존 확인(C2 문언).

## 3. v0에 없는 것

PG 실호출·서명 검증(B3/B4), void 실행(B5 — 여기선 인텐트만), 환불·부분취소(§7.1), 세금·배송비 실액, 예약 레이어(CORE-5 유보), 알림류 outbox 토픽(CORE-4 부작용 — 후속), EXPIRED 세션의 아카이브(§5.2).

## 4. 파라미터 (튜닝)

없음 — B2는 정책·시각 입력으로만 판정(TTL은 B1 소유, 백오프는 A3 소유).

## 5. 정책 접점 요약

불변식 1(γ+B5+C2 대사) · 2(α+Order 유니크) · 3(β 가드) · 5(진입점 B3/B4 + DC2) / CORE-3(2.2 이중 유니크 소비 지점 명시) / CORE-4·5(적용범위 주)·6 / MFG-1 / C2 / §9 이중 방어 / §2.3(γ=write-ahead의 outbox 구현).

## 6. 잠금 전 정찰 확인 (read-only)

1. **Market 모델 실물**: `prisma/schema.prisma`의 Market 필드 전수 — 특히 `shippableCountries` 존재 여부(B1 검수 잔여: MARKET_UNAVAILABLE 사유문의 미확인 사실. 존재하면 DB2/B2 가드의 원천 = DB, 부재면 B1 구현이 실제로 뭘 검증하는지 보고).
2. **B1 산출 실물**: session/transitions.ts의 전이 표 형태(EXPIRED→COMPLETED 추가 지점), create.ts가 기록하는 세션 필드(β 가드가 읽을 것 전부), Payment 생성 코드 존재 여부(없음 예상 — α가 첫 생성자).
3. **raw 쿼리 전례**: `$queryRaw` 사용처 유무(첫 도입 예상 — 확인만) + Prisma 7에서 interactive tx 내 `$queryRaw` 사용 관례.
4. **PaymentAttemptStatus 전이 현황**: enum 값과 A2 의도(INITIATED/AWAITING/SUCCEEDED/FAILED/VOIDED) 대비 B1까지의 사용처 0 확인.

## 7. 검토 경계

DC2(캡처 시각 기준)는 정책 불변식 안에서의 설계 재량이지만 **돈의 향방을 가르는 규칙**이라, 잠금 전 사용자 이의 창구를 명시한다 — 대안 (i)(도착 시각 일괄 거부)이 더 보수적이며 전환 손실을 감수하면 선택 가능. capturedAt 가용성은 D 스파이크 확인 전 가정(폴백 정의로 헤지). DC4의 raw 도입은 §9 확정의 최소 이행이라는 판단이며 성능·데드락 프로파일은 C1에서 실측. 다루지 않은 것: β의 트랜잭션 격리 수준 세부(ARCH-1의 READ COMMITTED 전제 — 조건부 update·유니크·행 잠금 조합이 그 격리에서 성립하도록 설계했으나 C1 동시성 하네스가 실증 지점), 진입점의 인증·파싱(B3/B4), 그리고 γ 후 사용자 노출 UX(실패 안내 — B3 UI).
