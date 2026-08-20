<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Mira repository agent rules

> 이 파일은 저장소 작업 에이전트의 **짧은 운영 SSOT**다.
> 현재 규칙만 두며 변경 이력은 Git과 decision log가 소유한다.

프로젝트: AI 맞춤 가발 e-커머스. Next.js 16 App Router, TypeScript strict,
PostgreSQL, Prisma 7, NextAuth, Tailwind v4.

## 1. 권위와 현재 사실

- 사람의 명시적 task 권한과 installed governing contract가 앞으로 허용할 mutation/effect를 정한다.
  source, schema, migration, runtime, durable state는 현재 설치된 사실을 정한다.
- 둘이 충돌하면 보고하며 조용히 맞춰 쓰거나 기억으로 덮지 않는다.
- plan, review, fixture, test, historical material은 새 구현·접촉·활성화 권한을 만들지 않는다.
  새 governance도 기존 exact-baseline/evidence track, frozen identity, 허가된 invocation,
  historical semantics를 소급 재해석하지 않는다.
- task 범위와 권한을 스스로 넓히지 않는다.

## 2. 작업 mode

Task prompt가 지정하지 않으면 기본 mode는 `BUILD`다.

- `BUILD`: 승인된 의도를 최소 충분 변경으로 구현·검증하며 범위 밖을 재설계하지 않는다.
- `DIAGNOSE`: 증상과 원인을 확립하며 별도 수정 권한 없이는 source를 바꾸지 않는다.
- `DESIGN`: 현재 사실과 책임 경계를 설계하며 source를 바꾸지 않는다.
- `REVIEW`: exact candidate를 검토하고 finding만 보고하며 source를 바꾸지 않는다.
- `PUBLISH`: 검토된 bytes를 보존해 허가된 Git/PR 작업만 하며 source 의미를 바꾸지 않는다.

보안 검토는 별도 전역 mode가 아니라 필요한 task의 `REVIEW` focus/high-risk overlay다.

## 3. 기본 경로와 위험 routing

```text
필요한 현재 사실 확인
-> build
-> 가장 좁은 falsifying test
-> 저장소 completion gate
-> stop
```

confidence만을 위해 요청되지 않은 plan/RFC/review/evidence package, harness/validator,
compatibility layer, approval machinery를 만들지 않는다.

결제/재무, 인증·권한, secret, 개인정보, schema·내구 상태, 파괴적 작업,
동시성·멱등, 외부 effect/durable job, production activation을 물질적으로 건드리면 mutation 전에 현재 사실을 읽고
[`mira-backend-high-risk-governance-v0.1.md`](docs/engineering/mira-backend-high-risk-governance-v0.1.md)를 적용한다.

전문 계약은 관련 task에서만 읽는다.

- payment: `docs/payment_policy/`의 task-relevant current contract와 current provider/feature
  contract를 읽는다. installed design이 바꾸지 않는 한 payment logic owner는
  `src/lib/payment/**`이고 action/API/webhook은 thin delegation boundary다.
- discovery/search/recommendation: `docs/discovery/README.md`, task-relevant current contract,
  `docs/discovery/catalog-evidence-status-v0.2.md`
- 그 외: task prompt/current installed authority

거버넌스 변경·검토에는 모델 독립 reference인
[`ai-engineering-governance-v0.1.md`](docs/engineering/ai-engineering-governance-v0.1.md)를 사용한다.
Durable artifact 필요 여부는
[`Feature Documentation Standard v0.2`](docs/engineering/feature-documentation-standard-v0.2.md)로 판정하며,
위험 이름만으로 artifact 세트를 만들지 않는다.

## 4. Git·외부 effect·범위

- 기본값은 승인된 source 변경, 검증, stop이다. 명시적 권한 없이 `git add`, commit,
  push, PR, merge, release, deploy를 하지 않는다.
- provider/API 접촉, LIVE/production 활성화, credential 사용, 파괴적 DB/Git 작업에는
  exact task authority가 필요하다.
- unrelated work와 사용자 소유 파일을 보존한다.
- correctness에 물질적인 불확실성을 source/문서로 해소할 수 없으면 추측 구현을 멈추고
  구체적인 blocker를 보고한다.

## 5. Mira 고유 불변식

- Next.js API는 맨 위 관리 블록과 `node_modules/next/dist/docs/`를 우선한다.
- 데이터 모델의 current truth는 `prisma/schema.prisma`와 migrations다. schema 변경은
  migration으로 하며 수동 DB 우회를 하지 않는다.
- historical checkout/order/payment의 가격·상품 표시는 당시 snapshot을 보존하고
  current catalog로 재계산하지 않는다.
- 금액은 통화의 최소 단위인 음이 아닌 정수다. KRW/JPY에 임의로 ×100 하지 않는다.
  통화 소수 자릿수는 표시와 provider wire 경계에서만 다룬다.
- DB에는 S3 key를 저장하고 private object는 짧은 presigned URL로 조회한다.
- 얼굴·fit 사진은 민감정보다. 동의·접근·보관 경계를 우회하지 않는다.
- 외부 SDK/service는 기존 provider abstraction을 경유하며 page/component/route가 직접 소유하지 않는다.
- `catalogStorage`는 현재 provider 설정을 따르고, `fittingStorage`는 current source가 정한 mock 경계를 보존한다.
- 외부 API 사실은 current first-party official documentation을 사용한다.
- payment source는 current installed contract/source를 따르며 `pre-cutover` 레거시를 복사·이식하지 않는다.

## 6. 코드와 구조

- STRICT 경로와 실행 규칙의 exact SSOT는 `eslint.config.mjs`다.
- STRICT/high-risk 변경은 성공·실패·경계·동시성 등 실제 행동을 테스트하고 mock은 진짜 외부 경계에서만 쓴다.
- 에러를 삼키거나 의미 없는 fallback으로 숨기지 않는다.
- `as any`와 `as unknown as`로 불확실성을 지우지 않는다.
- 새 owner/shape/helper 전에 기존 책임 owner를 찾고 순환 의존이나 경쟁하는 진실 원천을 만들지 않는다.
- LOC가 아니라 독립적으로 변하는 책임, 권위, 수명주기, transaction/failure 가시성,
  fixture/cleanup ownership이 실제로 다를 때 분해한다.

## 7. 검증

- 변경 중에는 현재 가설을 깨뜨릴 수 있는 가장 좁은 test를 먼저 쓴다.
- route/HTTP/UI/runtime 분기를 바꾸면 가능한 범위에서 실제 경로를 실행하며 preview/mock
  output만으로 durable success를 주장하지 않는다.
- source/runtime 변경은 기본적으로 `npm run verify`까지 실행한다. unrelated 환경 obstruction은
  숨기거나 규칙을 바꾸지 말고 candidate 검증과 분리해 보고한다.
- documentation-only이고 application source/runtime이 불변이면 task-relevant document/link/diff
  check로 끝내며 confidence만을 위한 broad application test를 하지 않는다.
- correction 중 새 structural defect class가 드러나면 patch를 쌓지 말고 responsibility/architecture를 재검토한다.
