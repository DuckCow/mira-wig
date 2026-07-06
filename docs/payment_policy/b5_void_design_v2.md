# B5 pg.void 핸들러 설계 v1 — 정책 v5 기준 (Stage B 종결)

> 성격: 설계 잠금 입력 + 결합 실행판(정찰 게이트 통과 시 빌드, 충돌 시 정지). 2026-07-06. 기준 = 정책 v5(불변식1·§7.1 취소·§2.3 outbox), A3(dispatcher·handler 계약), B2(γ가 enqueue하는 pg.void·F3 계약), AGENTS v4 §7·§8.
> 범위: pg.void outbox 핸들러 + VoidExecutor **seam**(Mock 유일 구현) + Payment VOIDED 전이. **실 Toss cancel·PayPal refund 실행은 여기 없음**(D1/D2 — 공식 문서 재검증+샌드박스가 본체). B3/B4와 동일 패턴: seam은 짓고 구현은 미룸.
> **v2 갱신(2026-07-06)**: 동시성 안전이 B5 핸들러 단독으로 보장되지 않고 상위 2계층(enqueue dedup + A3 원자 클레임)에 의존함을 명시(DG2 확장), 이를 검증하는 하드 정찰 게이트 G5 신설(좀비 경로 예외 포함), executor 멱등 실패 시의 장기 대응을 §5에 기록. 사용자 결정: VOID_IN_PROGRESS 상태는 B5에 넣지 않음(별도 보상 상태기계 문제라 미룸).

## 1. 결정

**DG1. 구조 = A3 dispatcher에 등록되는 pg.void 핸들러 + 주입된 VoidExecutor.**
- 핸들러 `handleVoid(payload, ctx)`: payload({ paymentId, provider, providerPaymentKey, reason }) → 멱등 체크 → executor.void(...) → Payment SUCCEEDED→VOIDED 조건부 전이. A3 레지스트리에 `{ "pg.void": handleVoid }` 등록, dispatcher가 클레임·재시도·터미널을 이미 소유(B5는 핸들러 본체만).
- **VoidExecutor seam**: `void({ provider, providerPaymentKey }) → { ok } | { retryable, reason }`. Mock = 성공/재시도실패 토글. **실 구현(D1/D2)은 인양 §1의 Toss cancel·PayPal refund 지식을 공식 문서로 재확인 후** — B5는 자리만 비움, 레거시 shape를 코어에 심지 않는다(§7).

**DG2. 멱등 = enqueue dedup + 실행시 조건부 전이 이중(F3).**
- enqueue dedupKey(`void:{provider}:{key}` — B2 규약)가 중복 *큐잉* 차단. 핸들러 재진입(A3 재시도·좀비 환원·구별 이벤트 재트리거)에는 **Payment SUCCEEDED→VOIDED 조건부 updateMany(count 검증)**가 실행시 게이트: 이미 VOIDED면 executor 재호출 없이 멱등 성공. B2 α의 이중 방어 패턴과 동형.
- 순서: 멱등 선체크(이미 VOIDED → 즉시 성공 반환, executor 건너뜀) → executor.void → 성공 시 전이. executor 호출과 전이 사이 크래시는 A3 재시도가 재진입 → 선체크가 VOIDED 아직 아님 → executor 재호출(멱등해야 함 — DG3).
- **단일 executor 호출은 이 핸들러 단독으로 보장되지 않는다(v2 명시).** 의존하는 상위 2계층: ⑴ outbox `dedupKey @unique`(같은 void 대상 행 1개 — enqueue 계층) ⑵ A3 원자 클레임(행당 워커 1명 — dispatch 계층). 조건부 SUCCEEDED→VOIDED 전이는 *상태*의 이중 적용은 막지만 *executor 호출*의 중복은 막지 못한다 — 그 최후 방어는 DG3(executor 멱등)뿐. **검증: 빌드 전 G5(하드 게이트).**
- **좀비 경로 예외(v2 — 핵심):** A3 좀비 회수는 stale한 PROCESSING 행을 PENDING으로 되돌린다. 원 워커가 크래시가 아니라 *느린* 것이고 아직 `executor.void` 안에 있는데 좀비 임계가 트립되면, 두 번째 워커가 되돌린 행을 재클레임해 `executor.void`를 다시 부른다 — 원자 클레임으로는 못 막는(시간차로 분리된 두 count=1) 이중 실 void. 이 인터리빙이 DG3(executor 멱등)이 이론이 아니라 필수가 되는 지점. G5가 이 경로를 명시 점검.

**DG3. executor 멱등 계약(실 구현이 지킬 것 — D 요건).** 같은 캡처에 void 2회는 PG 레벨에서도 안전해야(이미 취소된 것 재취소 = 성공 취급). B5 Mock은 이를 성립으로 가정. **PG "이미 취소됨/캡처 없음" 응답의 terminal 처리는 D-stage executor 확장** — B5는 성공/재시도 2경로만, PG 에러 택소노미를 발명하지 않는다.
- **이 멱등이 왜 최후 방어인가**: 좀비 경로(DG2)가 상위 2계층을 우회해 이중 executor 호출을 만들 수 있는 유일한 구조적 구멍이라, 그 구멍이 실제로 열렸을 때 돈을 지키는 건 executor 멱등뿐이다. G5가 상위 계층을 검증해도 느린-executor+좀비 인터리빙은 임계 튜닝으로 확률만 낮출 뿐 0이 아니다.

**DG4. void 대상 = Payment만(order/session 무접촉 — 구성상 근거).**
- γ는 **터미널 실패 경로**에서만 pg.void를 enqueue한다(B2 DC5) — 그 경로는 β가 롤백되어 **주문이 생성된 적 없고** 세션은 이미 FAILED. 따라서 void는 되돌릴 주문이 없고 세션은 이미 종결 상태. void는 Payment SUCCEEDED→VOIDED만 건드린다. (주문을 취소하려 들면 없는 상태에 작용하는 버그 — 명시.)

**DG5. 실패 시 dispatcher 위임.** executor가 retryable 반환 또는 핸들러 예외 → 던져서 A3 dispatcher가 attempts++·백오프·maxAttempts 후 FAILED(터미널) 처리. FAILED 큐 행 = C2 대사 신호(§2.4). B5는 자체 재시도 로직 없음 — A3에 위임.

## 2. 행동 테스트 (Mock executor)

⑴ 정상 void: pg.void 행 → handleVoid → executor 성공 → Payment VOIDED + outbox DONE ⑵ 멱등: 이미 VOIDED payment에 재트리거 → executor 재호출 0·VOIDED 유지·성공 ⑶ executor retryable → 던짐 → dispatcher 재시도(outbox PENDING·attempts++) ⑷ maxAttempts 초과 → outbox FAILED 터미널 ⑸ executor 성공 후 전이 count=1 확인(SUCCEEDED 전제) ⑹ 통합: B2 terminal 실패 → γ enqueue → dispatcher → handleVoid → Payment VOIDED(end-to-end, Mock PG).

## 3. 정찰 게이트 (충돌 시 정지, 통과 시 빌드)

G1. A3 handler 등록 관례 실물 — dispatcher가 registry를 받는 형태(handleVoid 시그니처가 OutboxHandler에 맞는지), payload 타입 접근. G2. PaymentAttemptStatus.VOIDED 미사용 확인(B5가 첫 소비자) + Payment 전이 헬퍼 존재 여부(없으면 B5가 조건부 updateMany 직접). G3. B2 γ의 pg.void payload 실물 필드(handleVoid가 읽을 것과 일치 확인 — paymentId·provider·providerPaymentKey·reason). G4. providers/ 배치와 executor seam 위치 관례(webhook verify seam과 대칭 — src/lib/payment/void/ 신설?).
G5. **동시성 안전 (하드 게이트 — 머니 경로, v2 신설).** as-built A3 dispatch 코드에서 확인:
   ⑴ 핸들러가 원자 클레임 *후에만* 호출되는가 — 조건부 updateMany PENDING→PROCESSING의 count===1이 소유권 게이트이고, 진 워커(count 0)는 핸들러를 호출하지 않는가(클레임 코드 인용).
   ⑵ outbox `dedupKey`가 스키마에서 `@unique`인가(같은 void 대상 다중 행 방지).
   ⑶ **좀비 경로**: 좀비 회수로 PENDING 복귀한 행이 재클레임 *없이* 핸들러로 재진입하는 경로가 있는가 — 있으면 원자 클레임 우회 구멍(정지). 없으면(재클레임 후에만 재진입) OK지만, 느린-executor+좀비 인터리빙이 이중 executor 호출을 낼 수 있음을 보고에 확인(DG3가 최후 방어임을 인지).
   ⑷ 수동/헬퍼 트리거(scripts/outbox-dispatch) 경로도 같은 클레임을 거치는가.
   **어느 하나라도 부재·약함 → 정지, 빌드 금지.**

## 4. 경계

executor의 실 PG 동작(Toss cancel 전액/부분·PayPal refund-of-capture·멱등·"이미 취소" 응답)은 인양 지식 기반 미검증이라 D1/D2가 공식 문서+샌드박스로 확정 — B5는 seam·성공/재시도 2경로만, PG 에러 택소노미는 D 확장(DG3 플래그). DG4의 "order 무접촉"은 현재 γ가 터미널 경로에서만 enqueue한다는 B2 구조에 의존 — B2가 다른 경로에서도 void를 쓰게 바뀌면 재검토(현재는 성립). void가 부분 취소를 다뤄야 하는 경우(§7.1 환불과의 경계)는 B5 범위 밖 — B5는 완료 실패의 전액 무효화만, 정상 주문의 환불은 §7.1 별도 트랙. C2 대사가 pg.void FAILED·미소화 구간의 최후 방어라는 전제는 C2 미구현 상태에선 수동 관측 의존(핸드오프 기록).

**§5 장기 설계 기록 (D-stage 조건부).** D1/D2가 실 PG void 동작을 확인했을 때 **반복 void 시도가 안전하게 멱등이 아니면**(예: 이미 취소된 캡처 재취소가 에러이거나 이중 환불 위험), 대응은 **Payment 메인 enum에 VOID_IN_PROGRESS를 즉시 추가하는 것이 아니라 별도 보상/void-시도 상태 모델을 검토**한다. 근거(사용자 결정 2026-07-06): 인-프로그레스 상태를 Payment에 직접 넣으면 크래시 복구·stale 처리·PG성공/DB실패 대사·사용자 노출 의미·환불/운영자환불 확장이 얽힌 상태기계 문제를 핸들러에 끌어들인다. 좀비 인터리빙(DG2·DG3)이 이 재검토의 트리거 시나리오. 그 전까지 B5는 DG3(executor 멱등)를 최후 방어로 삼고 G5로 상위 계층을 검증한 상태로 둔다.
