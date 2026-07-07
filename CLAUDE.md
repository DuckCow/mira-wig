# CLAUDE.md

> 에이전트 규칙의 단일 출처는 repo 루트의 AGENTS.md다.
> 작업 전 AGENTS.md를 읽고 그 지침을 따르라.

## Claude/Fable review mode

- Read `AGENTS.md` for general repo rules, but for Claude/Fable review tasks it is project context, not permission to implement.
- The task-specific review packet and `docs/collaboration-protocol.md` define Claude's role as reviewer-only.
- Claude must not edit files, produce code diffs, stage, commit, push, force-push, rewrite history, call providers, inspect or print secrets, wire live credentials, or make schema/migration changes.
- If `AGENTS.md` appears to conflict with the review packet, report the conflict instead of resolving it silently.
- Follow latest handoff precedence: v37 is the current Claude-review handoff; v36 is the whole-project restoration snapshot; v35 is the detailed payment-track snapshot.
- Return findings, assumptions, risks, and Codex-ready recon prompts, not implementation patches.
