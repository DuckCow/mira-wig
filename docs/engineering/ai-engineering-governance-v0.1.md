# Mira AI Engineering Governance v0.1

## 0. Purpose and scope

This document defines model-agnostic engineering governance for **Mira software work**.

It applies to implementation, refactoring, testing, software architecture, technical review,
automation, and engineering-agent task design across Mira.

It does not automatically govern non-software wig research, materials research, physical
manufacturing experiments, business strategy, or visual/UX exploration unless those tasks
become software-engineering work.

For backend or other materially high-risk work, also apply:

`docs/engineering/mira-backend-high-risk-governance-v0.1.md`

Repository/project-specific rules in `AGENTS.md`, task-specific frozen contracts, and explicit
human instructions remain authoritative within their declared scope.

---

## 1. Rule classes

Every durable governance rule should be understood as one of these classes.

### INVARIANT

A project truth or safety/authority rule expected to remain valid across model generations.

Examples:

- frozen safety/correctness requirements are not weakened for convenience;
- descriptive installed truth and normative authority are not conflated;
- irreversible external effects require explicit authority;
- an approved exact-baseline execution/evidence track is not retroactively redefined.

### ENGINEERING_DEFAULT

A default that should normally produce better engineering, but may be overridden when a
specific task has a stronger reason.

Examples:

- simple + reversible + clear intent -> build first;
- use the minimum sufficient structure;
- prefer existing owners and existing state over new machinery;
- targeted verification first, then the repository-required completion gate.

### MODEL_COMPENSATION

A temporary operational correction for repeated failure modes of the current agent/model/tool
generation.

MODEL_COMPENSATION rules do **not** belong in this core document unless they also qualify as an
INVARIANT or ENGINEERING_DEFAULT. They should live in the agent adapter in `AGENTS.md` or an
equivalent replaceable layer.

When a model/tool generation changes, review MODEL_COMPENSATION first.

---

## 2. Authority and truth [INVARIANT]

Keep two planes separate.

### Normative authority

What should be built or changed:

- explicit human instruction;
- accepted product requirement;
- installed design/feature contract;
- repository governance;
- task-specific authority.

### Installed/descriptive truth

What exists now:

- current source;
- schema and migrations;
- runtime behavior;
- durable state;
- execution evidence;
- current tests and operational facts.

Human authority can change future normative requirements.

It cannot make current source/runtime facts retroactively different.

If authority and installed truth conflict, report the conflict. Do not silently reconcile it.

Unaccepted plans and reviews are evidence inputs only. They do not self-authorize a new phase,
implementation, provider contact, activation, publication, or broader scope.

A review may prove a DIRECT blocker that requires stopping the current risky action. The next
scope remains a human decision unless already authorized.

---

## 3. Safety supremacy [INVARIANT]

Simplification is subordinate to frozen safety and correctness.

Do not weaken, defer, or manualize a control required for an already-adjudicated requirement
involving:

- authorization/authentication;
- credentials or sensitive data;
- money/payment correctness;
- irreversible external effects;
- durable customer/production state;
- concurrency/idempotency/contact ceilings;
- destructive operations;
- legal/regulatory obligations;
- evidence required to prevent unsafe retry or recovery.

Simplification may change **how** the guarantee is achieved. It may not silently change
**what** is guaranteed.

---

## 4. Build-first default [ENGINEERING_DEFAULT]

When the requested work is:

- simple;
- reversible;
- intent is clear;
- current facts are sufficiently known or cheaply confirmable;
- no frozen high-risk boundary requires a separate gate;

use:

```text
confirm the necessary current facts
-> make the smallest complete change
-> run targeted regression
-> exercise the real path where practical
-> run the repository-required completion verification
-> stop
```

Do not create a plan, RFC, review cycle, evidence package, harness, validator, compatibility
layer, approval gate, or recovery protocol merely for confidence.

A STRICT file location alone does not automatically require a separately staged reconnaissance
phase. It does require obeying the strict correctness/testing rules for that code. Separate
read-only reconnaissance is warranted when facts are materially uncertain, the change is
high-risk/irreversible, or a frozen contract explicitly requires it.

---

## 5. Minimum sufficient structure [ENGINEERING_DEFAULT]

The target is not minimum code.

The target is:

```text
the minimum sufficient structure that satisfies all frozen guarantees
```

Before introducing new machinery, prefer:

1. the existing owner of the responsibility;
2. an existing transaction/state vocabulary;
3. an existing test seam;
4. an existing evidence/readback path;
5. bounded safe STOP + human re-entry when suitable.

Do not add parallel truth sources, duplicate state machines, forwarding modules, pass-through
wrappers, generic frameworks, compatibility layers, recovery automation, or future-proof
abstractions for hypothetical needs.

For pre-service or unreleased surfaces, do not add legacy aliases, deprecation periods,
dual contracts, compatibility migrations, or rollout machinery unless real deployed consumers,
persistent data, external contracts, or operator dependencies require them.

---

## 6. New mechanism test [ENGINEERING_DEFAULT]

Before adding a materially new process/state/protocol/validator/abstraction/dependency/recovery
path/durable artifact, answer:

```text
FAILURE MODE:
WHAT ACTUALLY FAILS WITHOUT THIS:
SIMPLER ALTERNATIVE:
WHY THAT ALTERNATIVE IS INSUFFICIENT:
EXISTING OWNER THAT COULD HANDLE IT:
ASSURANCE GAIN: LOW / MEDIUM / HIGH
COMPLEXITY COST: LOW / MEDIUM / HIGH
GOAL RELEVANCE: DIRECT / INDIRECT / OUT_OF_SCOPE
DISPOSITION: ADD / DEFER / REJECT / STOP_FOR_HUMAN_DECISION
```

This is a reasoning test, not a mandatory durable artifact.

Do not create a separate document merely to answer it unless the task already requires one.

Default dispositions:

- LOW assurance + HIGH complexity -> REJECT;
- DIRECT frozen guarantee + no sufficient simpler alternative -> ADD;
- unresolved authority/scope expansion -> STOP_FOR_HUMAN_DECISION.

“More safety”, “more completeness”, and “more confidence” are not sufficient explanations by
themselves.

---

## 7. Review proportionality [ENGINEERING_DEFAULT]

Review intensity follows material uncertainty and consequence, not ceremony.

For routine/reversible work:

```text
implement -> targeted verify -> repository completion gate
```

For material/high-risk work:

```text
correctness review
-> demolition/simplification review
-> safety reconciliation
```

Correctness asks what is dangerously missing.

Demolition asks what can be removed, merged, deferred, or returned to an existing owner.

Safety reconciliation checks that simplification has not weakened a frozen guarantee.

Do not force the full high-risk sequence onto routine reversible work.

---

## 8. Structural defect handling [ENGINEERING_DEFAULT]

Classify material findings on two axes:

```text
SEVERITY:
  BLOCKER / IMPORTANT / MINOR

GOAL RELEVANCE:
  DIRECT / INDIRECT / OUT_OF_SCOPE
```

Also distinguish:

```text
SAME DEFECT CLASS
NEW STRUCTURAL DEFECT CLASS
```

If bounded correction exposes a **new structural defect class**, do not keep stacking patches.
Reconsider responsibility/architecture and return to the human decision boundary when the
required scope is not already authorized.

---

## 9. Verification [ENGINEERING_DEFAULT]

During development, use the narrowest test that can falsify the current change.

Before completion:

- exercise one representative real user/operator/runtime flow where practical;
- use authoritative readback for important mutations;
- run the repository-required final verification/CI gate.

Do not repeatedly run broad suites merely for confidence.

Do not use mocks as a substitute for runtime proof when the frozen requirement concerns actual
runtime behavior. Mocks remain appropriate at true external boundaries and for focused failure
injection.

---

## 10. Git and publication authority [INVARIANT]

Preserve unrelated work.

Inspect current repository state before branch/worktree operations.

Do not perform destructive Git operations without explicit authority.

Ready-for-review, commit, push, PR, merge, release, deploy, production activation, force-push,
or history rewrite require the authority defined by the repository workflow or explicit human
instruction.

A worktree is a tool, not a ritual. Use it when isolation/concurrency actually requires it or
when explicitly requested.

---

## 11. Non-retroactivity [INVARIANT]

This governance applies prospectively.

Do not use it to retroactively change:

- an approved exact execution baseline;
- an active evidence/execution contract;
- frozen source identities;
- an already-authorized invocation;
- historical evidence semantics.

A human may explicitly reopen such a track. Otherwise preserve it and apply new governance to
new decisions.

---

## 12. Model/tool evolution

A new GPT/Codex/agent generation does **not** automatically invalidate this governance.

Review layers in this order:

```text
1. MODEL_COMPENSATION adapter
2. ENGINEERING_DEFAULT rules
3. backend/high-risk overlay
4. INVARIANT rules
```

The lower layers should change only with concrete project evidence.

### Direct friction evidence

A MODEL_COMPENSATION rule is a friction candidate when all three are YES:

```text
Q1. Did this rule directly change behavior (extra STOP/review/artifact/process)?
Q2. Without it, would frozen guarantees and the task contract still be satisfied?
Q3. Can a concrete simpler sufficient path be named now?
```

One severe false-positive may justify immediate review.

Otherwise, repeated independent tasks showing the same rule causing the same unnecessary
friction are enough to trigger a **targeted review of that rule only**.

Do not count multiple consequences inside one task as multiple independent cases.

### Obsolescence evidence

If a new model repeatedly avoids the historical failure mode without relying on the
compensation rule, the rule may be relaxed or removed after a few ordinary representative
tasks.

Do not create governance telemetry, dashboards, or a dedicated friction ledger by default.
Record a case only when it becomes materially useful.

Targeted disposition:

```text
KEEP / RELAX / REMOVE
```

Do not reopen the whole governance for one adapter issue.

---

## 13. Reporting [ENGINEERING_DEFAULT]

Lead with:

1. result;
2. practical impact;
3. checks actually run;
4. real residual risks.

Do not inflate routine work into long ledgers or evidence packets.

When a frozen high-risk contract requires evidence, provide exactly what it requires and no
additional ceremony.
