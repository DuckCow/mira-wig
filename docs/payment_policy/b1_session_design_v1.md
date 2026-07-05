# B1 세션 수명주기 설계 초안 v1 — 정책 v5 기준

> **성격**: 설계 잠금 *입력*. §5 정찰 확인 후 잠금 → 빌드. 작성 2026-07-06. 기준 = 정책 v5(CORE-1·2·5 적용범위 주·§5.2·§9), A2 스키마(+보완), A3 outbox, AGENTS v4 §8.
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

**DB6. 기존 생존 코드와의 관계 — 감사 후 재사용(§5 정찰이 판정 입력).**
- `src/lib/order/`의 생존물(core.ts의 computeTotal·stock 검증, types.ts의 CheckoutAddressInput·SnapshotData, snapshot.ts)은 세션 생성이 요구하는 것과 겹침. 원칙: **기존 것 먼저(SSOT)** — 단 레거시 문맥이 박힌 시그니처면 이식(세션 모듈로 이동+개명) 또는 재정의. 판정은 §5-① 실물 기준. A1 보강 목록 중 세션 생성이 딛는 최소(정수·양수 금액 검증)만 B1에 합류 — 라운딩 SSOT·속성 테스트 등 전체 보강은 별도 스텝 유지.
- 배치: `src/lib/payment/session/{types,create,expiry,transitions}.ts`(STRICT) + `src/app/actions/checkout.ts`(얇은 위임 — AGENTS §8).

**DB7. cart와의 접점 경계.**
- 세션 생성은 cart *행*(variantId·quantity)만 입력으로 읽고 **가격은 반드시 VariantMarketPrice에서 직접**(cart 조회가 반환하는 KRW 하위호환 price는 불신 — 알려진 표시 버그의 오염 경로 차단). 카트 비우기는 B2 완료 tx 소속(C2 확정) — B1은 카트를 읽기만 한다.

## 2. 행동 테스트 명세 (B1 완결 조건)

⑴ 정상 생성: n라인 카트 → SUBMITTED 세션 + 라인(unitAmount=해당 시장 정가, fulfillmentType 복사) + shipping 위성 + 금액 합 정확 ⑵ 거부 게이트: 빈 카트 / 비활성 variant / 시장 가격 부재 / stock 쿼터 부족 — 각각 세션 미생성(부분 생성 잔재 0) ⑶ 스냅샷 불변: 생성 후 VariantMarketPrice 변경 → 세션 unitAmount 불변 ⑷ PII 격리: snapshotData에 배송 필드 부재 + shipping 위성에만 존재 ⑸ 만료: expiresAt 경과 → isUsable=false, 스위퍼가 SUBMITTED→EXPIRED(count 반환), COMPLETED 세션은 스위퍼 비대상 ⑹ 전이 가드: 미정의 전이 시도 → count=0·상태 불변 ⑺ 동일 유저 세션 2개 공존 가능.

## 3. v0에 없는 것

PG 상호작용(B3)·완료 트랜잭션과 행 잠금(B2)·세션 아카이브/삭제 단계화(§5.2 정리 규칙 — 물리 EXPIRED까지가 v0)·UX 가드(진행 중 세션 안내)·다단계 체크아웃(OPEN 활성화)·교차 시장 배송·쿠폰/할인.

## 4. 파라미터 (튜닝 — 잠금 대상 아님)

`SESSION_TTL_MS`(기본 30분 제안), 스위퍼 배치 limit. 사유 주석 의무는 A3와 동일.

## 5. 잠금 전 정찰 확인 (read-only)

1. **생존 order lib 실물**: core.ts(computeTotal 시그니처·stock 검증 함수 형태), types.ts(CheckoutAddressInput·SnapshotData shape), snapshot.ts export — DB6 재사용/이식/재정의 판정 근거.
2. **cart 조회 실물**: cart.ts가 반환하는 shape(variantId·quantity 접근 경로)와 KRW price 필드의 위치 — DB7 경계 확인.
3. **시장 컨텍스트**: 현재 요청의 marketCode가 어디서 결정되는지(MARKET_CONFIGS·쿠키/세그먼트?) — 세션 marketCode의 입력 경로.
4. **어드민 stock 관리 존재 여부**: 어드민 카탈로그에서 WigVariant.stock 편집 가능한지 — STOCK-임시의 운영 전제 확인(불가면 플래그만, B1 범위 밖).
5. **checkout 스텁 현황**: 스텁 페이지·액션의 현재 형태 — B1 액션과의 접점(UI 재건은 B3 이후지만 액션 명명 충돌 확인).

## 6. 검토 경계

이 문서는 정책 v5·A2/A3 산출물·이 세션의 정찰 기록에 근거하며 리포 실물 미대조(§5가 게이트). §0의 두 레코드는 사용자 확정의 전달이고, 각 선택의 숨은 전제(정가 운영 프로세스·stock 값의 주인)는 본문에 명시했다. 다루지 않은 것: 배송비 정책(0 유지 — 정책 확정 시 세션 금액식에 합류), 세금 표시(§7.3), 게스트 체크아웃(현 auth 필수 전제 — 바뀌면 세션 userId nullable 재설계), Toss 결제위젯이 요구하는 클라이언트 파라미터의 정확한 목록(B3·D1에서 공식 문서로), 그리고 expiresAt과 PG 결제창 만료의 정합(D 스파이크 플래그).
