# A3 outbox 골격 설계 초안 v1 — 정책 v5 §2.3 기준

> **성격**: 설계 잠금 *입력*. §4 정찰 확인 후 잠금 → 빌드 프롬프트. 작성 2026-07-06. 기준 = 정책 v5 §2.3(부수효과 outbox)·§3-불변식5·CORE-4, A2 스키마(`PaymentOutbox`).
> **범위(골격의 정의)**: enqueue API + 디스패처 + 재시도/터미널 전이 + 행동 테스트. **실 토픽 0개** — 실 소비자는 B5(망취소)·CORE-4 부작용(제작 후속 통지)에서 등록된다.
> **정정(A2 문서 erratum)**: A2 초안의 topic 예시 `"mr.create"`는 오기 — MR *생성*은 MFG-1에 의해 완료 tx 안이며 outbox 대상이 아니다. outbox 대상은 CORE-4의 "PAID 이후 제작 부작용"(예: `mr.notify`)과 `pg.void`(B5)다.

---

## 1. 설계 결정 (DA1~DA6)

**DA1. 코어 = 트리거-불가지론, 트리거 = 얇은 어댑터.**
- 채택: `dispatchPending(limit)`을 순수 진입 함수로(핸들러 레지스트리 주입), 트리거는 어댑터 2종 — ⑴ 수동/스크립트(dev·테스트) ⑵ 주기 호출 라우트(cron — 배포 타깃 확정 시 연결). 근거: 배포 타깃(Vercel 추정)이 founders 도메인 결정에 종속·미확정 — 그 미지수를 코어에 새기지 않는다.
- 배제: (i) 상주 워커 전제 — serverless와 충돌, 타깃 미확정 상태에서 고정. (ii) PostgreSQL LISTEN/NOTIFY — 현 규모 과설계 + serverless 부적합. (iii) 완료 tx 직후 inline 즉시 발행(스위퍼 없이) — 프로세스 사망 시 유실, outbox의 존재 이유 부정. 단 "커밋 후 best-effort 즉시 시도 + 주기 스위퍼가 안전망" 하이브리드는 지연 단축용으로 **후속 옵션**(골격에는 스위퍼만).

**DA2. 클레임 의미론 = 조건부 updateMany(원자 소유권).**
- 채택: 후보 select 후 행별 `updateMany({ id, status: PENDING } → PROCESSING)` — count=1이면 소유. Prisma-순수(raw 쿼리 불요), 중복 트리거(cron 중첩 실행)에도 안전.
- 배제(지금): `FOR UPDATE SKIP LOCKED` 배치 클레임 — 처리량에서 우세하나 raw 쿼리 도입 비용이 현 물량 근거 없이 선불. **전환 트리거**: 디스패치 지연이 운영 임계를 넘으면(§12류 — 값은 운영 튜닝).
- 좀비 회수: PROCESSING인 채 `updatedAt`이 임계 초과한 행은 스위퍼가 PENDING으로 환원(attempts는 유지) — 프로세스 사망 대비.

**DA3. at-least-once + 소비자 멱등(§2.3 원문).**
- 핸들러 계약: **재실행 안전 의무**(효과에 자연 멱등키가 없으면 `dedupKey` 사용). 처리 완료 표시(`DONE`·`processedAt`)는 **핸들러 성공 후** — 순서를 뒤집으면 at-most-once로 전락(유실 허용)함을 계약에 명문화.

**DA4. 재시도 = 지수 백오프 + 터미널 FAILED.**
- 실패 시 `attempts++`, `nextAttemptAt = now + base·2^attempts`(상한 캡), `lastError` 기록. `maxAttempts` 초과 → `FAILED`(터미널) — 자동 재시도 종료, **대사(C2)·운영 노출 대상**(§2.4 접점: FAILED 행 존재 = 대사 배치의 1급 신호). 파라미터(base·cap·maxAttempts)는 상수 모듈로 — 값 자체는 운영 튜닝이라 잠금 대상 아님.

**DA5. enqueue는 도메인 트랜잭션에 참여(원자성 = 존재 이유).**
- 시그니처가 tx 클라이언트를 **필수 인자**로 받는다: `enqueue(tx, { topic, payload, dedupKey? })`. 전역 db로의 편의 오버로드는 두지 않음 — 커밋과 발행의 원자성이 깨지는 사용을 타입이 막게.
- `dedupKey` 충돌(P2002)은 "이미 예약됨"으로 흡수(멱등 enqueue).

**DA6. 골격의 완결 조건 = 행동 테스트 4종.**
- ⑴ 도메인 tx 롤백 시 outbox 행 부재(원자성) ⑵ 성공 소비: PENDING→PROCESSING→DONE + 핸들러 1회 효과 ⑶ 실패→백오프 재시도→maxAttempts 후 FAILED 터미널 ⑷ 동시 디스패처 2개가 같은 행을 이중 처리하지 않음(클레임 원자성). 테스트 토픽은 골격 내 no-op/카운터 토픽.

## 2. 인터페이스 스케치 (구현 아님 — 설계 명세)

- `src/lib/payment/outbox/types.ts`: `OutboxHandler = (payload, ctx) => Promise<void>`, 레지스트리 `Record<topic, OutboxHandler>`.
- `src/lib/payment/outbox/enqueue.ts`: DA5 시그니처.
- `src/lib/payment/outbox/dispatch.ts`: `dispatchPending({ limit, now? })` — 후보 조회(PENDING & nextAttemptAt≤now, 오래된 순) → 클레임 → 핸들러 → DONE/재시도 전이. 좀비 환원 포함.
- 트리거 어댑터: `scripts/outbox-dispatch.ts`(수동) — cron 라우트는 배포 타깃 확정 시(자리만 주석).
- 전부 `src/lib/payment/**`(STRICT — AGENTS §8 경로 규칙, 라우트/스크립트는 얇은 위임).

## 3. v0에 없는 것

실 토픽·우선순위 큐·토픽별 동시성 제어·DLQ 별도 테이블(FAILED 상태가 v0의 DLQ)·관측 대시보드(어드민 노출은 C2/운영 트랙)·SKIP LOCKED(DA2 트리거 시).

## 4. 잠금 전 정찰 확인 (read-only)

1. **테스트 하네스 현황**: vitest 통합 테스트가 `.env.test` DB로 도는 현행 방식·격리 관례(randomID? deleteMany?) — DA6 테스트가 따를 관례 확정. (참고: 인양 문서의 flaky 교훈 — 공유 리소스 정리·test별 고유 키.)
2. **scripts 관례**: package.json의 스크립트 실행 방식(tsx? ts-node?) — 수동 트리거 어댑터의 형태 결정.
3. **트랜잭션 클라이언트 타입 관례**: 생존 코드(seed·기존 lib)에서 `Prisma.TransactionClient`류를 어떻게 받는지 — DA5 시그니처의 타입 확정.
4. **cron/route 전례**: 주기 실행 라우트의 기존 전례 유무(없음 예상 — 확인만).

## 5. 검토 경계

배포 타깃 미확정(founders)이 가장 큰 외생 변수라 DA1이 그걸 격리하는 구조이며, 파라미터 값(백오프·maxAttempts·좀비 임계·limit)은 설계가 아니라 튜닝으로 분류해 잠그지 않았다. 이 문서는 정책 v5·A2 스키마·업계 표준 outbox 패턴(학습 지식)에 근거하며 리포 실물 미대조(§4가 게이트). 다루지 않은 것: B2 완료 tx가 enqueue를 호출하는 구체 지점(B2 설계), 알림·이메일 등 비결제 부작용의 outbox 합류 여부(범용화 유혹 — 결제 코어 STRICT 경계 안에서만 시작하고 확장은 별도 결정), FAILED의 운영 알림 채널(출시 하드닝 트랙).
