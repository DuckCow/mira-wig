# mira 프로젝트 인계 문서 v12 (Handoff) — C1 완료판

**새 세션의 Claude에게**: 너는 mira를 이어서 작업한다. 역할 = **설계 판단 + Codex 프롬프트 작성 + 결과 리뷰**(코드 직접 작성 안 함). 사람 = 오케스트레이터·최종 결정·커밋, Codex = 구현·정찰·런타임. **v12가 C1 완료 후 현재 handoff이며 v11을 supersede한다.** 단, **v11은 Stage B 완료 / policy v6 baseline snapshot으로 보존**한다(그 시점의 경계 통합판). v12의 고유 가치는 v11의 Stage B 기준을 carry forward하면서 **C1 동시성 하네스 완료와 남은 이연 작업**을 한곳에 고정하는 것이다. 완료된 코드가 *어떻게* 동작하는지의 SSOT는 각 설계 문서와 실제 소스이며 여기서 복제하지 않는다.

**SSOT 지도 (여기 말고 저기를 읽어라):**
- 결제 설계 확정 baseline → `docs/payment_policy/payment_policy_confirmed_v6.md` (미결 → `payment_policy_open_v6.md`). **v6가 Stage B 반영 후 정합 확인된 최신 baseline** — 이걸 신뢰 기준으로 삼아라.
- 각 구현의 설계·결정 근거 → `docs/payment_policy/`의 설계 문서: a2_schema_v0_draft_v2(스키마)·a3_outbox_design_v2(outbox)·b1_session_design_v2(세션)·b2_completion_design_v2(완료 α/β/γ)·b3_confirm_design_v1(진입점)·b4_webhook_design_v1(웹훅)·b5_void_design_v3(void). **코드 사실은 이 문서들 + 실제 소스**, 산문 요약 아님.
- 코드측 규칙 → `AGENTS.md`(v4). 협업 방식 → `docs/collaboration-protocol.md`(v3). 인양 지식 → `legacy_salvage_notes.md`.
- 데이터 모델 → `prisma/schema.prisma` + migration. 라이브 절차 → `docs/go-live-checklist.md`.
- handoff 계보 → **v12가 현재판**, v11은 Stage B 완료 / policy v6 baseline snapshot.
- 새 `[dev]` 채팅: 이 문서 + protocol(필요 시 AGENTS) 붙이고 §6-1부터. 언어 한국어. repo: `DuckCow/mira-wig`(private, main).

---

## 1. 프로젝트 (불변)

mira = AI 커스텀 가발 e-커머스(피팅=차별점, 해자=커스터마이징→주문→제작). 1차 KR·US·JP. 제품 바 = "고객이 바로 써도 문제없는 수준".

---

## 2. 지금 위치 (한눈에)

- ✅ **커머스 기반(불변)**: browse/카탈로그·cart(담기)·auth·피팅(mock)·어드민 카탈로그/마켓 가격·CI(PG18·Node24)·스토리지(S3/mock). `src/lib/order/`의 `snapshot.ts`·`types.ts` 생존(단 `core.ts`는 B1이 흡수·삭제 — 세션 모듈로 이관됨).
- ✅ **결제 코어 골격 완성(Stage B, A2~B5)** — seam/mock 기반, 실 PG 실행은 D 이연:
  - **A2** 스키마(CheckoutSession·Order(결제 후)·Payment 이중 유니크·MR·PaymentOutbox·PaymentEvent) + `updatedAt` 보완.
  - **A3** outbox(원자 클레임·지수 백오프·좀비 회수·**terminal_failed 결과 계약**).
  - **B1** 세션 수명주기(생성 시 검증·동결·lazy 만료·전이 가드).
  - **B2** 완료 처리 — **α(캡처 기록)/β(완료 tx: 행 잠금·가드·주문·MR·재고·카트)/γ(void 인텐트)** 3분해.
  - **B3** 진입점(Provider 포트 + Mock + `resolveProvider` seam + initiate/confirm 액션).
  - **B4** 웹훅(record→verify seam→parse→complete, 원장 record-and-forward, **503 스텁 재배선 완료**).
  - **B5** void 핸들러(outbox 소비·멱등·**VoidExecutor seam** + operationKey).
  - Stage B 테스트 204→252(+48). 실 PG 어댑터·서명 검증·void 실행은 전부 **seam으로 비어 있음**(D-stage).
- ✅ **C1 동시성 하네스 완료** — `src/lib/payment/__tests__/c1-concurrency.integration.test.ts` 추가. verify baseline **16 files / 252 tests → 17 files / 260 tests**. C1은 Postgres READ COMMITTED 위 bounded evidence/regression coverage이며 formal proof가 아니다.
- ✅ **정책 v6**(Stage B 확정/확립/소멸 반영, §1.1 FX 정합 패치까지) · 인양 문서 · A1 금액 감사(market 인수+보강) 완료·푸시.
- ⏳ **다음** = **C2 대사** → D1/D2 PG 샌드박스 → E MR 최소. 병행 = 심사 선행물(§6-2). founders 임박도가 순서 지배(§9).
- 🚫 founders: 토스 온보딩(선행물 대기)·피팅 Phase 0·법무·도메인 + **GOAL-0·목표 출시일·팀 정보 여전히 부재**(ARCH-0 괄호 값 대기).

---

## 3. v12 델타 (v11 이후 = C1 완료)

v11은 Track 1 A2~B5 구현 + 정책 v6의 Stage B 완료판으로 남긴다. v12는 그 위에 **C1 완료 델타**를 얹은 현재 handoff다.

- C1 추가 파일: `src/lib/payment/__tests__/c1-concurrency.integration.test.ts`.
- verify baseline: **16 files / 252 tests → 17 files / 260 tests**.
- C1 성격: bounded evidence/regression coverage, not formal proof.
- C1-3/C1-6/C1-7: 각각 **3 bounded natural-race rounds**로 unique fixture를 반복한다.
- C1-5: `capturedAt` decision-matrix + composition coverage다. live sweeper-race proof를 주장하지 않는다.
- pg concurrent-query warning: 조사 완료. `pg_stat_activity`에서 multiple backend PIDs와 lock waits가 관찰돼 C1 natural-race evidence를 무효화하지 않는다.
- process deviation: C1은 명시적 push 승인 전 push된 것으로 기록한다. 이는 **code correctness issue가 아니라 협업 절차 이탈**이다.

---

## 4. 핵심 아키텍처 결정 (Stage B — 코드론 안 보이는 것)

> 완료 코드의 *어떻게*는 설계 문서가 SSOT. 여기엔 새 세션이 **오해하기 쉬운** 구조적 성질만.

- **4-A2. 멱등의 물리 = 이중 방어.** Payment `(provider, providerPaymentKey)` 유니크 + Order `checkoutSessionId`/`paymentId` 유니크. 어느 것도 단독으로 충분치 않고 조합이 불변식을 강제(설계 a2 D1).
- **4-B2. 완료 = α/β/γ 3분해(가장 중요·오해 주의).** 단일 거대 tx가 **아니다**. α(캡처 사실 작은 tx)가 β(완료 tx) 롤백에도 살아남아 "PG는 받았는데 로컬 모름"을 방지 — write-ahead 문제의 구조적 해답(정책 v6 §2.3). α~β 크래시는 void가 아니라 **재진입 완료로 수렴**. 이 성질을 모르면 B2를 "그냥 트랜잭션"으로 오독한다.
- **4-idem-layers. 단일 executor 호출은 핸들러 단독 보장이 아니다.** enqueue dedup(`dedupKey @unique`) + A3 원자 클레임 2계층에 의존하고, 그마저 뚫는 **두 경로**(느린-executor+좀비 회수 / executor성공-후-DB전이실패)의 최후 방어는 executor 멱등(D-stage 요건). B5 설계 v3 DG2/DG3 + G5 하드 게이트가 이걸 검증. **C1은 이 중 느린-executor+forced zombie 노출을 Mock executor로 bounded 실증했다.**
- **4-seams. seam은 shape 완성·body 이연.** resolveProvider(B3)·verify(B4)·VoidExecutor+operationKey(B5) 셋 다 인터페이스는 완성, 실 Toss/PayPal 구현만 비어 있음 — D1/D2가 body만 채우면 핸들러 무변경. 인양 지식(레거시 shape)은 **공식 문서 재확인 후에만** 반영(§7 출처 규칙, no-op 재현 금지).
- **4-void-scope. void = Payment만.** γ는 터미널 실패(β 롤백→주문 없음, 세션 FAILED) 경로에서만 enqueue하므로 되돌릴 주문이 없다(B5 DG4). 정상 주문의 환불은 완전히 별개(§7.1, 미설계).

---

## 5. ★ Stage B가 만든 안전 성질 — 반드시 읽어라

v10에서 레거시 안전 전제는 소멸했고, Stage B가 **새 성질을 구조로 심었다**:
1. **멱등은 B2가 소유, 원장은 record-and-forward.** B4 웹훅은 dedup 게이트를 만들지 않고 항상 저장→항상 completeFromCapture, 멱등은 α유니크+β잠금+Order유니크가 담당(정책 v6 §7.5). **이래서 웹훅 dedup 공백이 correctness 문제에서 retention 문제로 소멸.** 새 세션은 "웹훅 중복 처리 어쩌지"를 다시 풀지 마라 — 이미 구조로 답됐다.
2. **terminal_failed는 A3의 일반 계약.** dispatcher가 resolved-value로 즉시 FAILED를 구분(재시도 안 함). B5 mismatch가 이걸 씀. 이제 다른 핸들러도 쓸 수 있는 표면(AGENTS/A3 문서에 기록 대상 — §10).
3. **불변식 SSOT = 정책 v6 §3.** 핸드오프가 아니라 정책을 읽어라.

### 5-C1. C1 완료 후 안전 증거의 한계

- C1은 **실 Postgres READ COMMITTED 위 bounded evidence/regression coverage**다. formal proof가 아니므로, 반복 수·고유 fixture·DB lock/unique/conditional update 조합으로 회귀를 잡는 하네스라고 읽어라.
- C1-3(STOCKED stock=1), C1-6(confirm×webhook), C1-7(two payments/one session)은 각각 **3 bounded natural-race rounds**다. winner identity는 안정 계약이 아니므로 고정하지 않는다.
- C1-5는 `capturedAt <= expiresAt`이면 이미 `EXPIRED`여도 완료, `capturedAt > expiresAt`이면 void/compensation이라는 **decision matrix**를 직접 고정한다. Sweeper/late-signal race safety는 C1-1(row lock serialization) + B1 sweeper(SUBMITTED만 expire) + C1-5(post-sweep EXPIRED valid capture completes)의 composition으로 읽어라. live sweeper-race proof가 아니다.
- pg concurrent-query warning은 조사됨: warning 자체는 같은 pg Client에 active query가 있을 때 queue되는 deprecation이지만, C1 관측 중 multiple backend PIDs와 lock waits가 확인돼 C1-3/C1-6/C1-7의 natural-race evidence를 약화하지 않는다.

---

## 6. 백로그 / 다음 — **무엇을 gate하는지로 분류**

### 6-1. 다음 작업 순서 (권장)

1. **C2 대사 v0** — **여기서 terminal-FAILED 택소노미를 소비**(아래 6-지도). FAILED 원장/outbox 행을 원인별로 읽는 첫 소비자.
2. **D1/D2 PG 샌드박스** — seam body 채우기 + **D-stage 백로그 전체 해소**(아래 6-지도).
3. **E MR 최소** — 제작 파이프라인 진입점.
4. **병행(비결제)**: §6-2 심사 선행물.

### 6-지도. 이연·열린 것의 단일 집결 (what it gates 순)

**[C1 완료 — 단, proof 아님] 동시성 bounded evidence:**
- C1은 β FOR UPDATE blocking, confirm×webhook, two payments/one session, slow executor+forced zombie, α-only re-entry, STOCKED stock=1 no oversell, bounded jitter same-session completion, capturedAt expiry decision matrix를 고정했다.
- 남은 성격: C1은 Mock/seam 기반 구조 실증이다. **D-stage가 real provider void idempotency와 zombie-duration margin validation을 소유**한다(실 op 지속시간 vs `OUTBOX_ZOMBIE_AFTER_MS`=5분).
- F1 방어 심화는 report-only/deferred: webhook `transmissionId` concurrent duplicate, outbox `dedupKey` concurrent enqueue는 현재 sequential/existing coverage 또는 권고 수준이며 C1에서 구현하지 않았다.
- **VOID-HOOK-DEBT**: `createVoidHandler` exposes optional `transitionPayment` injection that appears test-hook-like; C1 does not rely on it. Stage B/B5 cleanup or D-stage should decide whether to remove it, document it as a legitimate composition seam, or keep it temporarily.

**[C2를 gate] 관측·대사 설계:**
- **terminal-FAILED 택소노미**(정책 v6 §2.4) — C2는 이걸 **단일 버킷 아닌 구별 원인**으로: ⑴ void-mismatch(B5 DG6→outbox FAILED, 내부 결함) ⑵ verify-fail(B4→PaymentEvent FAILED, 위조 스팸 벡터) ⑶ void-maxattempts(A3 재시도 소진). 진단·대응 상이.
- **부수 속성**: terminal-mismatch outbox 행 `attempts=1`(markFailed 재사용 산물, 개념상 0, 무해하나 C2 인지).
- **retention 정책**(정책 v6 §7.5, 미결) — 처리/무시/검증실패 이벤트 보존 기간·정리, 위조 검증실패 행 스팸 억제. correctness 아니라 관측·법률·저장 정책.

**[D1/D2를 gate] 실 PG 사실 — 공식 문서+샌드박스로만:**
- **seam body 3종**: resolveProvider(실 Toss/PayPal 인스턴스)·verify(실 서명 검증 — **레거시 Toss sender-auth no-op을 옮기지 말고 공식 재확인**)·VoidExecutor(실 cancel/refund + operationKey로 멱등).
- **미검증 가정들**(Stage B가 남긴 플래그): "2xx=수신확인"이 Toss/PayPal 표준인가(B4 DF3 — 일부 PG가 상태 신호로 쓰면 재검토) / capturedAt 가용성(B2 DC2 — Toss approvedAt·PayPal create_time, 폴백=수신 시각) / eCheck·PENDING 지연완료 경로 재현(정책 open §8.2·§0-1 결정 입력) / PG "이미 취소됨/캡처 없음" 에러 택소노미(B5 DG3 — void 멱등의 실 근거).
- **조건부 재설계 트리거**: D가 **반복 void가 안전 멱등이 아님**을 확인하면 → Payment enum에 VOID_IN_PROGRESS 즉시 추가가 아니라 **별도 보상/void-시도 상태 모델 검토**(B5 §5·사용자 결정 — 상태기계 드래그 회피).

**[별도 트랙 — 아직 설계 안 됨, 정책이 선취 안 함]:**
- **§7.1 환불 상태기계 전체** — 정상 주문의 부분환불·운영자 환불 상태 전제·멱등키. VOID-KEY(확정)는 *완료 실패 void*만 정함. **운영자 환불 상태 전제**가 잔존 진짜 공백(정책 v6 §7.1).
- **§1.3 PII 볼트** — 세션 스냅샷의 배송지 PII(CORE-2가 인지된 채 승인) vs 삭제권(CPRA·APPI). retention과 같은 층. `[법률]`
- **§1.1 세션 스냅샷 명세 최종** — v6에서 FX 필드는 PRICE-1로 종결, 나머지 명세는 미결.
- **§7.3 세금·관세 산정** — A2에 자리(administrativeArea)만, 산정 로직 미설계. `[세무·관세사]`

### 6-2. 심사 선행물 트랙 (토스 공식 요건 — 코드로 지금 가능, 비결제)

- **cart KRW 표시 버그 수정**(반려 리스크 — B1이 세션에선 오염 경로를 차단했으나 *cart 표시 자체*는 여전히 버그), **랜딩**(루트 아직 create-next 기본), **하단 필수 표기**(상호·대표·사업자번호·주소·유선·통판신고 — 값은 founders). 약관·개인정보처리방침은 법무.
- 결제경로 PPT(메인→상품→결제→결제창)는 B3 결제창 스텁+UI 재건 후 — founders 온보딩과 동기화. **주의: B3는 액션까지만, UI 재건은 아직**(체크아웃 화면은 여전히 스텁).

### 6-3. 기타 백로그

- 유지: 재고 복원(반품), 마진 엔진, 출시 하드닝(모니터링·보안·모바일), 마이페이지·리뷰·위시리스트·이메일, 피팅 mock 잔재, 미들웨어 deprecation, `<img>` lint 4, ADMIN 프로비저닝, `ci/add-github-actions` origin 잔존, **정책 v2 파일 내용 계보 확인**(head -5). NestJS 보류 유지(ARCH-0).

---

## 7. 라이브 전환 (사업 트랙) — v10 유지 + 갱신

- **토스 심사**(공식 문서, 2026-07-06): 토스 1~2일 + 카드사 최대 14일, 심사는 실판매 사이트에서 상품·필수 표기·**테스트 키 결제창 호출**까지(서버 연동 불요). 헤지: pre-cutover 태그 배포 또는 신 체크아웃 테스트키 결제창 스텁. 잔여 확인(온보딩 채널): 연동 방식 교체 재확인 절차·크로스보더 요건·입점 허용 업종.
- go-live-checklist: PG18 반영됨(:73). 추가 필요: "컷오버 drop이 migrate deploy 도는 모든 DB의 레거시 행 폐기 — 프로덕션류 배포 존재 시 인지".
- 웹훅 URL 등록 시점엔 B4가 이미 라우트 인수 상태(현재 503 스텁 → D에서 실 검증 채워지면 live).

---

## 8. 막는 것 (founders)

토스 온보딩(선행물=§6-2 + 도메인·통판신고·약관) · 피팅 Phase 0 · 법무(철회권·PII·세무) · 도메인 · **GOAL-0/목표 출시일/팀 정보**(ARCH-0 만료조건 괄호 값 — 정책 v6에 미치환 잔존). 새 세션은 founders 진행도 확인부터.

---

## 9. 작업 방식 (요약 — 상세 protocol v3 + AGENTS v4)

- 루프·교차검토·verify≠작동·커밋 규율·정찰 위임·STRICT 변경 규율·고정 산출물 저장 시 원문 동봉: 유지.
- **문서 부채(다음에 문서 만질 때)**: ⑴ **terminal_failed가 A3의 새 일반 계약이 됨** → a3 설계 문서·AGENTS에 계약 확장 기록(현재 코드에만 있음). ⑵ B3 UI 재건이 아직 안 됨(액션만) — 체크아웃/주문 화면 스텁 상태를 다음 핸드오프가 계속 명시.
- **Stage B 교훈**: 정찰이 설계를 교정한 사례 다수(core.ts 흡수·Market.isActive·좀비 이중호출) → *설계 잠금 전 정찰*의 가치 재확인. 구현이 상위 계약 공백을 드러낸 사례(B5 mismatch→A3 확장) → *작은 핸들러도 코어 계약을 건드릴 수 있음*. 문서 간 참조도 원문 대조 대상(v6 편집 시 앵커 미스 다수 — verify로 포착).
- 협업 선호(Profile): 옵션 전개·전제 풀기·검토 경계·결과물은 입력 — 유지.
