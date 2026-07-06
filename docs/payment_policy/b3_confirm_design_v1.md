# B3 confirm 진입점 설계 v1 — 정책 v5 기준

> 성격: 설계 잠금 입력 + **결합 실행판**(정찰 게이트 통과 시 빌드 진행 — 토큰 절약을 위한 왕복 압축, 게이트 충돌 시 정지). 2026-07-06. 기준 = 정책 v5(§3-불변식·CORE-3/6·PG-1), B2 산출(F4·F5 계약), AGENTS v4 §7·§8.
> 범위: Provider 포트 + Mock 구현 + initiate/confirm 서버 액션. **실 Toss/PayPal 어댑터·콜백 라우트·UI·웹훅은 여기 없음**(D1/D2·B4·UI 후속) — 어댑터는 공식 문서 재검증(§7)과 샌드박스 실측이 본체라 D 스파이크가 곧 구현.

## 1. 결정

**DE1. 포트 = 2메서드 최소형.** `PaymentProvider { initiate(input) → { kind:"redirect", approveUrl?, providerRef? } | { kind:"ready" } ; confirm(input) → CaptureFacts용 사실({ providerPaymentKey, amount, currency, capturedAt? }) | 실패 }`. 인양 지식(레거시 포트)은 참고만 — 공식 재검증 전 필드 추측 금지, Mock이 유일 구현.
**DE2. initiate = Payment INITIATED 행 생성(F5 호환).** 세션 검증(isUsable) → Payment { checkoutSessionId, provider, status: INITIATED, amount=세션 total, currency, providerPaymentKey: null, idempotencyKey: `initiate:{sessionId}:{uuid}` } 생성 → port.initiate → redirect형이면 AWAITING 전이(+providerRef를 meta로? — **v0 배제**, 스키마 무변경: 레퍼런스 저장 필요성은 D에서 판정). 다중 시도 허용(α의 최신-클레임 규칙과 정합), 경쟁 패자는 B2 구조상 void 수렴.
**DE3. confirm 액션 = 번역기.** confirmPayment(sessionId, provider, confirmInput) → port.confirm → CaptureFacts(receivedAt=now, capturedAt=포트 제공 시) → completeFromCapture → 결과 번역: completed/already → 성공(orderId) / terminal(γ 완료) → 사용자 실패 안내형 / retryable·α throw → **재시도 가능 오류형**(F4 계약: 삼키지 않고 구분 응답). 라우팅: marketCode→provider 정적 맵(KR→TOSS, US·JP→PAYPAL, 그 외/테스트→MOCK — PG-1 표의 v0 물화, 코드 상수).
**DE4. Market.paymentConfig 불채택(v0).** 정찰로 내용 확인만 — 레거시 잔재 가능성, 검증 없이 라우팅 원천 승격 금지(PG-1 표 최종형은 완료 시맨틱 열 포함이라 어차피 재설계 대상).
**DE5. B5·B4 계약 기록(F3·F4).** void 핸들러는 이미-취소에 멱등(F3 — B5 요건). 진입점의 α-throw 번역 의무(F4)는 DE3에 이행, B4도 동일 계약(비-2xx 재전송 위임).

## 2. 행동 테스트 (Mock provider)

⑴ initiate: INITIATED 행 생성·세션 검증 거부(만료/타 유저) ⑵ confirm 성공: 기존 INITIATED 행이 α 클레임으로 SUCCEEDED 승격(신규 행 아님 — F5 실증) + 주문 생성 ⑶ initiate 없이 confirm(웹훅-선착 유사) → α 신규 생성 경로 ⑷ terminal(금액 불일치 Mock) → 실패 응답 + void 행 ⑸ retryable 주입 → 재시도 응답·void 없음 ⑹ 라우팅 맵: 시장별 provider 선택.

## 3. 정찰 게이트 (충돌 시 정지, 통과 시 빌드)

G1. `Market.paymentConfig`·`taxConfig` 실물 내용(레거시 잔재 판정 — 내용 무관 v0 불채택이나 기록) G2. actions/payment.ts 부재 확인(컷오버로 삭제됨 — 신설 충돌 0) G3. session isUsable·checkout 액션의 auth 관례(DE2가 따를 형태) G4. Mock provider 배치 관례(src/lib/payment/providers/ 신설 — 기존 관례와 충돌 여부).

## 4. 경계

포트 shape는 Toss confirm·PayPal capture의 공통 최소를 인양 지식으로 추정한 것 — D1/D2가 공식 문서·샌드박스로 검증하며 확장될 수 있음(포트 버전업은 그때 명시 개정). providerRef 미저장(DE2)은 PayPal 흐름(orderId 왕복)에서 뒤집힐 수 있는 판단 — D2 확인. UI·심사용 결제창 스텁은 심사 선행물 트랙과 동기화(별건).
