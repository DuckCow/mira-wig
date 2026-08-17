# 협업 프로토콜 v5 — 사람 × ChatGPT/Claude × Codex

이 문서는 역할과 전달 경계만 정의한다.
저장소 운영 규칙은 `AGENTS.md`, 고위험 규칙은 관련 governance/contract가 소유한다.

## 1. 역할

- **사람**: 제품·우선순위·권한·최종 결정.
- **ChatGPT / Claude**: 설계, 검토, 근거 종합, task prompt 작성.
- **Codex**: repository 사실 확인, 구현, 테스트, 런타임 검증, 명시적으로 허가된 Git 작업.

어떤 model의 plan/review도 사람 권한이나 installed contract를 대체하지 않는다.

## 2. Task prompt의 최소 형태

가능하면 다음만 명확히 한다.

```text
MODE:
GOAL:
GUARANTEES:
SCOPE:
AUTHORITY:
DONE:
```

일반 개발 절차, repository 공통 규칙, 관련 없는 non-goal을 매번 장문으로 복사하지
않는다.

Mode vocabulary는 `AGENTS.md`를 따른다.

## 3. 작업 경로

### Routine / reversible

```text
현재 사실 확인 -> build -> targeted verify -> completion gate
```

### Material / high-risk

```text
현재 사실 확인 -> 필요한 결정/계약 -> build -> proportional review/runtime -> gate
```

위험한 이름이나 STRICT 위치만으로 절차를 늘리지 않는다. 실제 consequence,
불확실성, frozen guarantee가 경로를 정한다.

## 4. 교차검토

다음 두 조건이 모두 참일 때만 독립 검토를 기본 채택한다.

```text
1. 잘못되면 물질적 결과가 있다.
2. 책임 에이전트가 authoritative evidence만으로 정확성을 확립하기 어렵다.
```

검토는 exact uncertainty나 candidate에 좁힌다.
열린 “개선점 찾아라”는 기본 gate로 쓰지 않는다.

Routine UI, 명백한 hygiene, 이미 닫힌 same-class correction은 독립 검토를 생략할 수
있다.

## 5. 현재 source를 보지 못한 설계

설계·검토 에이전트가 current source 사실을 직접 확인하지 못했다면 구체적인
signature·transaction timing·owner를 발명하지 않는다.

그 부분은 Codex에게 read-only reconnaissance로 열어 두고, 확인된 사실 위에서
결정한다.

## 6. 승인된 문안 전달

검토·승인된 exact 문안을 repository에 저장시킬 때는:

- 원문을 task에 포함하거나 파일로 전달한다.
- context 속 “직전 답변”을 기억으로 복원하게 하지 않는다.
- 설치 후 exact text/semantic diff를 확인한다.

## 7. Git·외부 effect

Commit, push, PR, merge, provider contact, LIVE/production activation은 task에 명시된
사람 권한이 있을 때만 수행한다.

## 8. 현재 상태 전달

“어떻게 일하나”는 이 문서와 `AGENTS.md`가 소유한다.
“지금 어디까지 왔나”는 current source, current contracts, latest task/handoff가
소유한다. 이 문서에 특정 handoff 버전이나 임시 다음 단계를 고정하지 않는다.
