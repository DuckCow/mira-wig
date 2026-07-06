# B5 pg.void 핸들러 설계 v1 — 정책 v5 기준 (Stage B 종결)

> 성격: 설계 잠금 입력 + 결합 실행판(정찰 게이트 통과 시 빌드, 충돌 시 정지). 2026-07-06. 기준 = 정책 v5(불변식1·§7.1 취소·§2.3 outbox), A3(dispatcher·handler 계약), B2(γ가 enqueue하는 pg.void·F3 계약), AGENTS v4 §7·§8.
> 범위: pg.void outbox 핸들러 + VoidExecutor **seam**(Mock 유일 구현) + Payment VOIDED 전이. **실 Toss cancel·PayPal refund 실행은 여기 없음**(D1/D2 — 공식 문서 재검증+샌드박스가 본체). B3/B4와 동일 패턴: seam은 짓고 구현은 미룸.

## 1. 결정

**DG1. 구조 = A3 dispatcher에 등록되는 pg.void 핸들러 + 주입된 VoidExecutor.**
- 핸들러 `handleVoid(payload, ctx)`: payload({ paymentId, provider, providerPaymentKey, reason }) → 멱등 체크 → executor.void(...) → Payment SUCCEEDED→VOIDED 조건부 전이. A3 레지스트리에 `{ "pg.void": handleVoid }` 등록, dispatcher가 클레임·재시도·터미널을 이미 소유(B5는 핸들러 본체만).
- **VoidExecutor seam**: `void({ provider, providerPaymentKey }) → { ok } | { retryable, reason }`. Mock = 성공/재시도실패 토글. **실 구현(D1/D2)은 인양 §1의 Toss cancel·PayPal refund 지식을 공식 문서로 재확인 후** — B5는 자리만 비움, 레거시 shape를 코어에 심지 않는다(§7).

**DG2. 멱등 = enqueue dedup + 실행시 조건부 전이 이중(F3).**
- enqueue dedupKey(`void:{provider}:{key}` — B2 규약)가 중복 *큐잉* 차단. 핸들러 재진입(A3 재시도·좀비 환원·구별 이벤트 재트리거)에는 **Payment SUCCEEDED→VOIDED 조건부 updateMany(count 검증)**가 실행시 게이트: 이미 VOIDED면 executor 재호출 없이 멱등 성공. B2 α의 이중 방어 패턴과 동형.
- 순서: 멱등 선체크(이미 VOIDED → 즉시 성공 반환, executor 건너뜀) → executor.void → 성공 시 전이. executor 호출과 전이 사이 크래시는 A3 재시도가 재진입 → 선체크가 VOIDED 아직 아님 → executor 재호출(멱등해야 함 — DG3).

**DG3. executor 멱등 계약(실 구현이 지킬 것 — D 요건).** 같은 캡처에 void 2회는 PG 레벤에서도 안전해야(이미 취소된 것 재취소 = 성공 취급). B5 Mock은 이를 성립으로 가정. **PG "이미 취소됨/캡처 없음" 응답의 terminal 처리는 D-stage executor 확장** — B5는 성공/재시도 2경로만, PG 에러 택소노미를 발명하지 않는다.

**DG4. void 대상 = Payment만(order/session 무접촉 — 구성상 근거).**
- γ는 **터미널 실패 경로**에서만 pg.void를 enqueue한다(B2 DC5) — 그 경로는 β가 롤백되어 **주문이 생성된 적 없고** 세션은 이미 FAILED. 따라서 void는 되돌릴 주문이 없고 세션은 이미 종결 상태. void는 Payment SUCCEEDED→VOIDED만 건드린다. (주문을 취소하려 들면 없는 상태에 작용하는 버그 — 명시.)

**DG5. 실패 시 dispatcher 위임.** executor가 retryable 반환 또는 핸들러 예외 → 던져서 A3 dispatcher가 attempts++·백오프·maxAttempts 후 FAILED(터미널) 처리. FAILED 큐 행 = C2 대사 신호(§2.4). B5는 자체 재시도 로직 없음 — A3에 위임.

## 2. 행동 테스트 (Mock executor)

⑴ 정상 void: pg.void 행 → handleVoid → executor 성공 → Payment VOIDED + outbox DONE ⑵ 멱등: 이미 VOIDED payment에 재트리거 → executor 재호출 0·VOIDED 유지·성공 ⑶ executor retryable → 던짐 → dispatcher 재시도(outbox PENDING·attempts++) ⑷ maxAttempts 초과 → outbox FAILED 터미널 ⑸ executor 성공 후 전이 count=1 확인(SUCCEEDED 전제) ⑹ 통합: B2 terminal 실패 → γ enqueue → dispatcher → handleVoid → Payment VOIDED(end-to-end, Mock PG).

## 3. 정찰 게이트 (충돌 시 정지, 통과 시 빌드)

G1. A3 handler 등록 관례 실물 — dispatcher가 registry를 받는 형태(handleVoid 시그니처가 OutboxHandler에 맞는지), payload 타입 접근. G2. PaymentAttemptStatus.VOIDED 미사용 확인(B5가 첫 소비자) + Payment 전이 헬퍼 존재 여부(없으면 B5가 조건부 updateMany 직접). G3. B2 γ의 pg.void payload 실물 필드(handleVoid가 읽을 것과 일치 확인 — paymentId·provider·providerPaymentKey·reason). G4. providers/ 배치와 executor seam 위치 관례(webhook verify seam과 대칭 — src/lib/payment/void/ 신설?).

## 4. 경계

executor의 실 PG 동작(Toss cancel 전액/부분·PayPal refund-of-capture·멱등·"이미 취소" 응답)은 인양 지식 기반 미검증이라 D1/D2가 공식 문서+샌드박스로 확정 — B5는 seam·성공/재시도 2경로만, PG 에러 택소노미는 D 확장(DG3 플래그). DG4의 "order 무접촉"은 현재 γ가 터미널 경로에서만 enqueue한다는 B2 구조에 의존 — B2가 다른 경로에서도 void를 쓰게 바뀌면 재검토(현재는 성립). void가 부분 취소를 다뤄야 하는 경우(§7.1 환불과의 경계)는 B5 범위 밖 — B5는 완료 실패의 전액 무효화만, 정상 주문의 환불은 §7.1 별도 트랙. C2 대사가 pg.void FAILED·미소화 구간의 최후 방어라는 전제는 C2 미구현 상태에선 수동 관측 의존(핸드오프 기록).
