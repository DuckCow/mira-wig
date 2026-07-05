# B1 세션 수명주기 설계 초안 v1 — 정책 v5 기준

> **성격**: **v2 = 설계 잠금판** — §5 정찰(2026-07-06) 반영. v1 대비: BM1(DB6 판정 확정 — core.ts 로직 흡수 후 소멸, snapshot 계열은 제자리 재사용), BM2(cart view 미경유 — CartItem 직접 select + 시장가 복합 PK findUnique), BM3(marketCode는 액션에서 해석해 lib에 명시 인자). 부수 발견: 레거시는 isActive 미검증(검증 공백 — DB2가 신규 행동으로 메움). 기준 = 정책 v5(CORE-1·2·5 적용범위 주·§5.2·§9), A2 스키마(+보완), A3 outbox, AGENTS v4 §8.
> **범위**: 세션 생성(카트→스냅샷 동결)·만료·상태 전이 규칙 + 행동 테스트. **PG 상호작용(initiate·confirm)은 B3, 완료 트랜잭션·행 잠금은 B2** — 여기 없음.

---

## 0. 이 문서가 기록하는 사용자 확정 2건 (2026-07-06 — 정책 v6 이관 예정)

- **PRICE-1(가칭). 가격 원천 = 시장별 독립 가격표(`VariantMarketPrice`) 유지** — open v5 §0-8의 답. 스냅샷 `unitAmount` = "그 시장의 정가" 복사, 환율 필드 불요(A2 가정 추인). 이 선택의 전제 = 3시장 정가의 수동 운영 프로세스 존속. **재검토 트리거**: 시장 확장(EU 등)·정가 운영 부담 임계.
- **STOCK-임시. 전 라인 MTO 카탈로그에서 `WigVariant.stock` = 임시 수량 쿼터 유지** — 세션 생성 시 *검증*(거부 게이트), 확정 차감은 B2 완료 tx의 조건부 차감(레거시 행동 명세 계승: "생성 전 검증만, 차감은 완료 tx"). **만료조건**: §5.2 제작 슬롯·리드타임 실측 확정 시 슬롯 모델로 대체 재검토.
- 두 레코드가 정책 문서(v6)에 반영되기 전까지 **본 절이 임시 SSOT**다 — open v5 §0-8과의 표면 불일치는 이 기록으로 해소(프롬프트-정책 충돌 정지 규칙 대응).

---

## 1. 설계 결정 (DB1~DB7)

**DB1. 세션의 정체성 = "결제 의사의 서버 스냅샷"이지 UI 상태 저장소가 아니다.**
- 채택: 세션은 **"결제하기" 액션 시점에 생성과 동시에 검증·동결(SUBMITTED)** — 한 트랜잭션에서 라인 스냅샷·배송 위성·금액 확정. 주소 입력 중간 저장 같은 UI 편의는 세션의 일이 아님(그건 마이페이지 주소록 백로그).
- 배제: (i) 체크아웃 진입 시 OPEN 세션 자동 생성 — 버려진 세션 대량 생산(§5.2가 Order 오염을 피하려던 문제를 세션에 재생산), UI 폼 상태는 클라이언트가 들면 됨. (ii) OPEN에서 다단계 편집 후 별도 동결 액션 — 현 단일 페이지 체크아웃에 불필요한 상태 기계.
- 귀결: **enum `OPEN`은 v0 흐름 미사용 예약값**(다단계 체크아웃 도입 시 활성 — 주석으로 명시). 생성은 status=SUBMITTED 명시.

**DB2. SUBMITTED 게이트(생성 시 검증 내용).**
- 카트 비어있지 않음 / 라인별 variant 존재·`isActive` / **해당 시장 `VariantMarketPrice` 존재(PRICE-1 — 없으면 거부, cart의 KRW 하위호환 price로 폴백 금지)** / stock 쿼터 검증(STOCK-임시: `stock < qty` 라인 있으면 거부 — 차감 아님) / 배송지 필수 필드(ShippingCountry는 세션 시장과 정합 — 교차 시장 배송은 v0 거부, 열면 §7.3 과세 축이 깨짐) / 금액 = Σ(unitAmount×qty) + shipping(0) = total, 전 라인 단일 통화(시장 통화).
- `fulfillmentType`·`snapshotData`(표시 필드, **PII 금지**)는 variant에서 복사.

**DB3. 만료 = lazy 판정이 1급, 물리 전이는 위생.**
- 채택: **정확성은 읽기 시점 판정이 담보** — B2·B3가 세션을 쓰기 전 `isUsable(session, now)`(status=SUBMITTED && expiresAt>now)로 가드. EXPIRED로의 물리 전이는 별도 스위퍼 함수(조건부 updateMany 배치)로 제공하되 **트리거는 운영 어댑터**(outbox 수동 스크립트와 같은 지위 — cron은 배포 타깃 확정 시).
- 배제: (i) 스위퍼만으로 만료 강제 — 스위퍼 지연 = 만료 세션 결제 허용 창. (ii) outbox 토픽으로 만료 처리 — outbox는 커밋된 사실의 부수효과 발행용이지 시간 기반 스캔용이 아님(의미 혼용).
- `expiresAt` 기본값 = 상수(30분 제안 — 튜닝). **플래그**: PG 결제창 자체 유효시간과의 정합은 D 스파이크 확인 항목(우리 만료 < PG 만료 권장).

**DB4. 상태 전이 = 조건부 updateMany로 물리 강제(§3-불변식5의 세션판).**
- 전이 표: SUBMITTED→COMPLETED(B2, 행 잠금 하) / SUBMITTED→FAILED(B3·B5 실패 확정) / SUBMITTED→EXPIRED(스위퍼). 그 외 전이 없음 — 전부 `updateMany({ id, status: <전제 상태> })` count=1 검증, 정의되지 않은/역행 전이는 count=0으로 거부. B1은 전이 헬퍼와 표를 제공, 잠금 결합은 B2.

**DB5. 동시 다중 세션 = 허용(막지 않는 근거를 기록).**
- 같은 유저가 세션을 여러 개 SUBMITTED로 가질 수 있음. 이는 이중 *청구*가 아니라 이중 *구매*(각 세션 = 독립 스냅샷·독립 결제·독립 주문)라 돈 정합성 불변식과 무관하고, 미결제 세션은 만료로 소멸. UX 가드(진행 중 세션 안내)는 후속. 유니크로 막는 안 배제: "유저당 활성 세션 1개" 제약은 탭 2개·이탈 후 재시도 같은 정상 흐름을 깨뜨림.

**DB6(v2 확정 — BM1). 흡수 + 소멸: core.ts 로직은 session 모듈이 새 어휘로 흡수하고, 흡수 시점에 원본을 지운다.**
- 근거: 정찰 ① — core.ts의 소비자(db.ts·actions/order.ts)는 컷오버로 전부 삭제되어 **core.ts는 현재 죽은 코드**이며, 어휘(unitPrice↔unitAmount)·검증(isActive·fulfillmentType 부재)이 세션 요구와 불일치. 흡수 대상 = stock 검증 의미론(검증만·차감 아님 — 레거시 행동 계승)·시장가 스냅샷 복사·금액 합산. 흡수 후 core.ts 삭제 + types.ts의 사문 타입(CheckoutAddressInput — `country: string`으로 A2 enum과도 불일치 — ·CartItemForValidation·OrderLine 등) 제거. 두 벌 공존(방치안)은 SSOT 드리프트 창이라 배제, 그대로 import 재사용안은 죽은-코드-경유 의존이라 배제.
- **예외: snapshot.ts·SnapshotData는 제자리 유지·재사용** — 세션이 쓰고(직렬화) 미래 주문 표시가 읽는(파싱) 진짜 공유 정의. payment로 이동 시 결합 방향 악화.
- 신규 행동 명시: **isActive 검증은 레거시에 없던 게이트**(정찰 ① 발견 — 검증 공백)로 DB2가 추가한다. A1 보강 중 세션이 딛는 최소(정수·양수 금액 검증)만 합류 — 전체 보강은 별도 스텝 유지.
- 배치: `src/lib/payment/session/{types,create,expiry,transitions}.ts`(STRICT) + `src/app/actions/checkout.ts`(얇은 위임 — 정찰 ⑤: 명명 충돌 없음 확인).
- 배치: `src/lib/payment/session/{types,create,expiry,transitions}.ts`(STRICT) + `src/app/actions/checkout.ts`(얇은 위임 — AGENTS §8).

**DB7(v2 확정 — BM2). cart 접점 = CartItem 직접 정밀 select, view 미경유.**
- 정찰 ②: cart view(`CartItemView`)는 오염된 `price`(KRW 하위호환)를 들고 있고, 정작 세션 검증이 요구하는 `isActive`·시장가를 제공하지 않음 → 세션 생성은 **CartItem을 직접 select**(variantId·quantity + variant의 isActive·stock·fulfillmentType join), **시장가는 `VariantMarketPrice` 복합 PK `(variantId, marketCode)` findUnique**. 카트 비우기는 B2 완료 tx 소속 — B1은 읽기만.

**BM3(v2). marketCode 입력 경로** — 정찰 ③: cookie → geo 헤더 → default(`getCurrentMarketCode`). 해석은 **액션 레벨**에서 하고 lib에는 명시 인자로 전달(lib 순수성·테스트 용이 — "정의는 공유, 접근은 분리"). 배송국-시장 정합 검증(DB2)의 시장 쪽 입력이 이 값.

## 2. 행동 테스트 명세 (B1 완결 조건)

⑴ 정상 생성: n라인 카트 → SUBMITTED 세션 + 라인(unitAmount=해당 시장 정가, fulfillmentType 복사) + shipping 위성 + 금액 합 정확 ⑵ 거부 게이트: 빈 카트 / 비활성 variant / 시장 가격 부재 / stock 쿼터 부족 — 각각 세션 미생성(부분 생성 잔재 0) ⑶ 스냅샷 불변: 생성 후 VariantMarketPrice 변경 → 세션 unitAmount 불변 ⑷ PII 격리: snapshotData에 배송 필드 부재 + shipping 위성에만 존재 ⑸ 만료: expiresAt 경과 → isUsable=false, 스위퍼가 SUBMITTED→EXPIRED(count 반환), COMPLETED 세션은 스위퍼 비대상 ⑹ 전이 가드: 미정의 전이 시도 → count=0·상태 불변 ⑺ 동일 유저 세션 2개 공존 가능.

## 3. v0에 없는 것

PG 상호작용(B3)·완료 트랜잭션과 행 잠금(B2)·세션 아카이브/삭제 단계화(§5.2 정리 규칙 — 물리 EXPIRED까지가 v0)·UX 가드(진행 중 세션 안내)·다단계 체크아웃(OPEN 활성화)·교차 시장 배송·쿠폰/할인.

## 4. 파라미터 (튜닝 — 잠금 대상 아님)

`SESSION_TTL_MS`(기본 30분 제안), 스위퍼 배치 limit. 사유 주석 의무는 A3와 동일.

## 5. 정찰 결과 (2026-07-06 — 잠금 근거)

① core.ts = `computeTotal(unitPrice·quantity, shippingFee)` + `validateAndBuildLines`(marketPrices[0] 복사·stock 검증·**isActive/fulfillmentType 부재**), 소비자 0(컷오버 귀결) → BM1 흡수+소멸. CheckoutAddressInput은 `country: string`이라 A2 enum 불일치 → 사문 처리. SnapshotData·snapshot.ts는 PII 없음 확인·재사용. ② cart view는 variantId·quantity 접근엔 족하나 price 오염 + isActive/시장가 부재 → BM2 직접 select. ③ marketCode = cookie→geo→default, `getCurrentMarketCode()` → BM3. ④ 어드민 stock 편집 경로 실재 — STOCK-임시 운영 전제 성립. ⑤ actions/checkout.ts 부재(충돌 없음), CheckoutForm 스텁은 B3 이후 UI 재건의 접점.

## 6. 검토 경계

이 문서는 정책 v5·A2/A3 산출물·이 세션의 정찰 기록에 근거하며 리포 실물 미대조(§5가 게이트). §0의 두 레코드는 사용자 확정의 전달이고, 각 선택의 숨은 전제(정가 운영 프로세스·stock 값의 주인)는 본문에 명시했다. 다루지 않은 것: 배송비 정책(0 유지 — 정책 확정 시 세션 금액식에 합류), 세금 표시(§7.3), 게스트 체크아웃(현 auth 필수 전제 — 바뀌면 세션 userId nullable 재설계), core.ts 흡수에서 예상 밖 소비자가 grep에 걸릴 가능성(빌드 프롬프트에 정지 가드), Toss 결제위젯이 요구하는 클라이언트 파라미터의 정확한 목록(B3·D1에서 공식 문서로), 그리고 expiresAt과 PG 결제창 만료의 정합(D 스파이크 플래그).
