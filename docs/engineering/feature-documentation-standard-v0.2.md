# Feature Documentation Standard v0.2

## Status

```text
STANDARD:
  CURRENT v0.2
SUPERSEDES PROSPECTIVELY:
  feature-documentation-standard-v0.1.md
APPLIES TO:
  new Mira repository artifact decisions after installation
RETROACTIVE DELETION OR RECLASSIFICATION:
  none
```

## 1. Purpose

Artifacts exist to close a concrete failure mode, preserve durable authority, or support a
real operator/re-entry need.

They do not exist merely because a feature is called medium/high risk, touches several files,
or would benefit from more confidence.

The default is the smallest sufficient durable record.

## 2. Always-required completion record

Every source change needs only the repository workflow actually required for that change:

- a clear task/PR summary;
- proportionate tests or validation;
- exact scope and material residual risk;
- explicit Git/publication authority.

A routine reversible change does not need a design contract, threat model, source-status
document, runbook, decision-log entry, or independent audit by default.

## 3. Artifact admission test

Before creating a durable artifact, answer:

```text
FAILURE MODE:
WHAT FAILS WITHOUT THIS ARTIFACT:
WHY SOURCE / TESTS / PR DESCRIPTION ARE INSUFFICIENT:
WHO WILL USE IT AND WHEN:
ASSURANCE GAIN:
MAINTENANCE COST:
DISPOSITION:
  ADD / DEFER / REJECT
```

This test is reasoning, not itself a mandatory document.

If the answer is only “more completeness”, “more confidence”, “future-proofing”, or the risk
label of the feature, reject the artifact.

## 4. Artifact-specific triggers

### Design Contract

Create before implementation only when one or more are true:

- semantics, owners, state, or authority cross multiple phases/systems;
- an external/irreversible effect needs a frozen contract before execution;
- multiple implementations could satisfy the task but differ materially in correctness;
- a task prompt and current source cannot safely carry the durable decision.

Do not create one for a bounded read-only UI, ordinary bug fix, local refactor, or obvious
implementation slice.

### Implementation / Execution Contract

Create only for an exact high-risk, destructive, one-shot, provider-contact, migration, or
activation task whose baseline, contact/effect ceiling, inputs, and stop conditions must be
frozen.

Ordinary build prompts are not durable contracts.

### Threat / Failure Model

Create only when the task introduces or materially changes a threat surface whose controls
cannot be reviewed adequately in source, tests, and the governing design.

A generic security checklist is not a threat model.

### Source Status / As-Built

Create after merge only when installed truth must remain independently discoverable because:

- source is dormant or separately activated;
- future re-entry/recovery depends on exact installed ownership;
- external/provider or regulatory semantics are not obvious from source;
- a prior normative contract must be reconciled with installed source;
- source truth would otherwise exist only in transient PR history.

Do not create one for every administrator screen, ordinary endpoint, or local source change.

### Operations Runbook

Create before a human repeatedly operates, diagnoses, recovers, or rolls back a feature when
source/tests do not provide a safe bounded procedure.

Do not create a runbook for a feature with no operator action.

### Decision Log

Append only for a durable human adjudication that future work could plausibly misinterpret.
Routine implementation choices and review findings belong in source/tests/PR history.

### Activation Record

Create when customer/production enablement, market/data scope, credentials, or irreversible
external operation is separately authorized from source installation.

The following remain distinct:

```text
source installed != customer activated
row active != feature gate enabled
runbook exists != activation authorized
environment key documented != value approved
```

### Result / Evidence Adjudication

Create only when an external, destructive, ambiguous, or one-shot execution result must be
durably bound for retry safety, compliance, recovery, or later authority.

Do not create ZIP/manifest/custody chains for ordinary test output.

## 5. Risk does not imply a full artifact set

High-risk work applies the relevant high-risk engineering guarantees.
It does not automatically require every artifact in §4.

Use only the artifacts whose trigger is present.

A typical path may be:

```text
routine:
  build -> targeted verify -> completion gate

material design:
  bounded design decision -> build -> proportional review -> completion gate

one-shot external effect:
  execution contract -> preflight -> one authorized execution -> bounded result record

separate activation:
  reviewed source -> activation record -> observation/rollback
```

There is no mandatory P0–P11 lifecycle.

## 6. Review proportionality

Independent review is required only when:

```text
wrong result has material consequence
AND
the responsible implementer cannot establish correctness from authoritative evidence alone
```

Review should target the unresolved guarantee or exact candidate. Do not ask open-ended
“find more improvements” by default.

One review may lead to a bounded same-class correction and targeted closure.
If a new structural defect class appears, reconsider responsibility instead of recursively
stacking patches.

## 7. Versioning and history

- Preserve existing v0.1 contracts, source-status records, evidence, and historical semantics.
- This v0.2 standard changes future artifact admission only.
- Do not mass-delete or retroactively downgrade prior artifacts.
- New semantic artifact-policy changes require a new version and explicit human adjudication.
- Git history and the decision log preserve governance history; current operational files
  should contain current rules rather than long embedded changelogs.

## 8. PR expectations when an artifact is admitted

The PR should identify only what is material:

- why the artifact trigger is present;
- scope and non-authority;
- source/baseline or execution identity when relevant;
- tests/evidence actually used;
- residual risk and next gate.

Do not add fields or sections that have no consumer or failure mode.
