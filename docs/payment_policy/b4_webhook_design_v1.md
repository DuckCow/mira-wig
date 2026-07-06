# B4 webhook 진입점 설계 v1 — 정책 v5 기준

> 성격: 설계 잠금 입력 + 결합 실행판(정찰 게이트 통과 시 빌드, 충돌 시 정지 — 토큰 절약 왕복 압축). 2026-07-06. 기준 = 정책 v5(§7.5 이벤트 원장·§3-불변식5·§2.4 대사), B2 산출(completeFromCapture·F3·F4), 인양 문서(레거시 웹훅 함정), AGENTS v4 §7·§8.
> 범위: provider-불가지 웹훅 코어 + Mock 검증기 + 두 503 스텁 라우트 재배선. **실 Toss/PayPal 서명 검증·파싱은 여기 없음**(D1/D2 — 공식 문서 재검증+샌드박스가 본체). 라우트는 얇은 위임, 실체는 코어.

## 1. 결정

**DF1. 코어 파이프라인 = record → verify(seam) → parse → complete → respond.**
- `handleWebhook(client, provider, rawRequest)`: ⑴ `recordEvent`(PaymentEvent 저장 — raw NOT NULL, transmissionId 유니크) ⑵ verify(주입된 검증기 — Mock이 유일 구현, 실 검증은 D) ⑶ parse → CaptureFacts|무시 ⑷ CaptureFacts면 `completeFromCapture`(B2) ⑸ 응답 번역(DF3). 라우트 핸들러는 이 함수 호출 + provider 식별만.

**DF2. dedup = B2에 위임, 원장은 record-and-forward (DF-dedup 채택안 c).**
- transmissionId 유니크는 *저장* 중복만 차단(같은 이벤트 PG 재전송 → 저장 P2002 흡수 → 2xx, 재처리 안 함). *구별되는* 이벤트는 항상 `completeFromCapture`로 흐르고, B2의 멱등(α 유니크 + β 세션 잠금 + Order 유니크)이 중복 완료를 막는다. `processedAt`은 **처리 후 관측·대사용**이지 게이트가 아니다.
- 근거: B2 설계가 이미 중복 완료를 안전하게 만들었으므로 B4가 2차 dedup 게이트를 만들면 두 게이트가 불일치할 위험. 원장은 "PG가 무엇을 언제 보냈고 우리가 언제 처리했나"를 기록(§7.5)하되 행동을 결정하지 않는다.
- **레거시 함정 교정 명시**: 레거시는 transmissionId *존재*로 처리 완료를 판단해 crash 후 유효 캡처를 유실시켰다(인양 §5). DF2는 존재≠처리를 구조로 회피(존재는 저장 중복만, 처리는 B2 수렴).
- **정책 v6 이관 레코드(2026-07-06)**: v6 공백 "웹훅 dedup 기준"은 correctness 게이트가 아니라 **처리/무시 이벤트의 보존·관측 정책**으로 좁혀짐 — 이 결정이 근거. (PRICE-1·STOCK-임시와 같은 이관 패턴.)

**DF3. 응답 번역 (F4 계약의 웹훅판).** completed/already/terminal(γ 완료) → **2xx**(PG에 "수신·처리 완료" — terminal이어도 우리가 처리했으므로 재전송 불요, void는 outbox가 처리). retryable·α throw → **비-2xx**(PG 재전송 위임 — §3-불변식5 "처리 불충분 시 재전송"). 무시(parse가 관련 없는 이벤트로 판정, 예: PENDING) → 2xx + `status=IGNORED`(재전송 불요). 검증 실패 → **비-2xx**(위조·미검증 — 처리 거부).
- **F3 상호작용**: terminal이 void를 enqueue했고 PG가 같은 이벤트를 재전송하면 → 저장 P2002(DF2)로 재처리 안 되므로 void 재발행 없음. 단 *구별되는* 재캡처 이벤트가 이미-void 대상에 오면 B5 void 핸들러의 멱등(F3)이 최종 방어.

**DF4. verify는 seam, 레거시 no-op 재현 금지.** 검증기 인터페이스 `verify(raw) → { ok, transmissionId, eventType, ... } | fail`. Mock은 통과/실패 토글. **실 Toss 검증기(D1)는 인양 §3의 no-op을 그대로 옮기지 않고 공식 문서로 sender-auth 방식을 재확인**(인양 플래그와 동일 건) — B4는 그 자리를 seam으로 비워둘 뿐 no-op을 코어에 심지 않는다.

**DF5. PaymentEvent 필드 매핑.** source=WEBHOOK, provider, transmissionId(검증기 산출), eventType, checkoutSessionId?·providerPaymentKey?(parse 산출 — 없을 수 있음), raw(원본 전체 — NOT NULL), status(RECEIVED→PROCESSED|IGNORED|FAILED), processedAt. capturedAt은 parse가 PG 페이로드에서 추출 시 CaptureFacts로(B2 DC2 입력).

## 2. 행동 테스트 (Mock 검증기·Mock parse)

⑴ 유효 웹훅 → 이벤트 PROCESSED + completeFromCapture 완료 + 2xx ⑵ 같은 transmissionId 재전송 → 저장 P2002 흡수, 재처리 0, 2xx ⑶ 구별 이벤트가 이미-완료 세션에 → B2 멱등 성공 + 2xx(주문 1개 유지) ⑷ 검증 실패 → 비-2xx + 이벤트 FAILED(또는 미저장 — 구현 판정, 보고) ⑸ 무시 이벤트(parse가 무관/PENDING 판정) → 2xx + IGNORED, 완료 부작용 0 ⑹ terminal(금액 불일치 parse) → 2xx + void 행(dedupKey 규약) ⑺ retryable 주입 → 비-2xx + void 없음(재전송 위임) ⑻ 웹훅-선착(initiate 없이 유효 캡처) → α 신규 생성 경로 완료.

## 3. 정찰 게이트 (충돌 시 정지, 통과 시 빌드)

G1. `completeFromCapture` 시그니처 실물 — 웹훅-선착 경로가 그대로 쓰는지, receivedAt·capturedAt 주입 형태(B2 index.ts 확인). G2. 두 스텁 라우트 현재 형태(503 반환부·export 시그니처 — 재배선 지점) + Next 16 route handler의 raw body 접근 관례(서명 검증은 D지만 raw 보존은 B4 — request.text() 등). G3. PaymentEvent 생성 코드 부재 확인(B4가 첫 생성자). G4. 라우트 테스트 관례(기존 웹훅 route.test 존재? 컷오버로 삭제됐으면 신규).

## 4. 경계

parse·verify가 provider별 실체를 안 갖는 v0라, "무시 이벤트 판정"·"capturedAt 추출"은 Mock 기준 계약일 뿐 실 PG 페이로드 형태는 D1/D2가 공식 문서로 확정(포트·parse 확장 가능 — 명시 개정). raw body 접근이 Next 16에서 미들웨어·body 파싱과 충돌하는지는 G2 확인 사항. DF3의 "terminal도 2xx" 판단은 "우리가 처리를 끝냈으니 재전송 불요"라는 해석에 기반 — PG가 2xx를 "결제 성공 인정"으로 오해하는 의미 충돌이 있다면(일부 PG가 웹훅 응답을 상태 신호로 씀) D에서 재검토(현재 근거로는 2xx=수신확인이 표준이나 미검증). 검증 실패 이벤트를 저장할지(FAILED로)·버릴지는 관측 가치 vs 위조 스팸 저장 트레이드오프 — 구현이 정하고 보고, v6 관측 정책과 함께 확정.
