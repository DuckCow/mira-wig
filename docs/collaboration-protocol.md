# 협업 프로토콜 v5 — 책임 역할과 전달 경계

이 문서는 역할과 전달 경계만 정의한다. 저장소 운영은 `AGENTS.md`, 고위험 규칙은
관련 governance/contract가 소유한다.

## 1. 역할

- **Human owner**: 제품 의도·우선순위·권한·외부 effect·최종 결정.
- **Coordination agent**: 필요시 종합·설계 framing·task 분해·BUILD/REVIEW/PUBLISH
  prompt·handoff. source/external-effect 권한은 암묵적으로 생기지 않는다.
- **Responsible agent**: 할당된 repository/source reconnaissance, 허가된 구현,
  task-scoped test/runtime evidence 또는 diagnosis. 모델 또는 사람이 운용하는 tool이 맡을 수 있다.
- **Independent reviewer**: 정당화된 exact candidate/불확실성 검토. 별도 BUILD task 없이는
  source를 수정하지 않는다.
- **Publisher**: 검토된 bytes의 허가된 Git/publication action. 이 권한은 source 재설계 권한이 아니다.

plan/review는 Human owner 권한이나 installed contract를 대체하지 않는다.

## 2. 최소 task prompt

material authority/guarantee를 보존하는 가장 작은 prompt를 쓴다.

```text
MODE:
GOAL:
CONTEXT:
SCOPE:
DONE:
```

higher-risk/material task에는 실제 필요할 때만 `GUARANTEES`,
`AUTHORITY / ALLOWED EFFECTS`, `NON-GOALS`, `SAFE STOP / RE-ENTRY`를 추가한다.
repository 공통 규칙은 반복하지 않고 mode vocabulary는 `AGENTS.md`를 따른다.

## 3. 작업 경로

```text
Routine/reversible:
current facts -> build -> targeted verify -> completion gate

Material/high-risk:
current facts -> required decision/contract -> build
-> justified proportional independent review/runtime evidence -> gate
```

실제 consequence, 불확실성, frozen guarantee가 경로를 정한다. 위험한 이름이나
STRICT 위치만으로 절차를 늘리지 않는다.

## 4. 독립 검토

다음이 **모두** 참일 때만 독립 검토를 기본 채택한다.

```text
1. 오류가 물질적 결과를 낳을 수 있다.
2. Responsible agent가 authoritative evidence만으로 정확성을 충분히 확립할 수 없다.
```

검토는 exact uncertainty/candidate에 좁힌다. 열린 개선 요청이나 mandatory multi-agent
review는 기본 gate가 아니다. Routine UI, 명백한 hygiene, 닫힌 same-class correction은 생략할 수 있다.

## 5. Source·문안·handoff

- current source를 확인하지 않은 agent는 exact signature, transaction timing, ownership,
  runtime fact를 발명하지 않고 reconnaissance에 맡긴다.
- 승인된 exact 문안은 원문/파일로 전달하고 기억으로 재구성하지 않으며 설치 후
  exact text/semantic diff를 확인한다.
- 현재 상태·임시 next step·version identity는 source/contract와 task/handoff에 두며
  standing protocol에 고정하지 않는다.

## 6. Git·외부 effect

Git publication, provider contact, LIVE/production activation, 파괴적 작업 또는 durable-state
effect는 범위에 맞는 명시적 Human owner 권한이 있을 때만 수행한다.
