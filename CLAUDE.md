# CLAUDE.md

- Repository 운영 context는 `AGENTS.md`를 읽는다.
- 이 파일은 구현 권한을 부여하지 않는다.
- Task prompt가 `DESIGN` 또는 `REVIEW`를 지정하면 read-only로 작업하고 source,
  schema, Git history, provider/runtime state를 변경하지 않는다.
- 구현·Git·provider effect는 사람의 명시적 task authority가 있을 때만 가능하다.
- Current handoff와 exact review packet은 task가 제공한다. 이 파일에 handoff version을
  고정하지 않는다.
- `AGENTS.md`, task authority, current source가 충돌하면 조용히 해결하지 말고
  conflict를 보고한다.
- Secret, credential, 고객 민감정보를 review evidence로 출력하지 않는다.
