# Feature Documentation Standard v0.1

## Status

```text
STANDARD:
  FROZEN v0.1
APPLIES TO:
  medium and high-risk repository features
SMALL-CHANGE EXCEPTION:
  bounded and documented
CHANGE CONTROL:
  supersedes: none | superseded-by: none
```

## 1. Purpose

This standard prevents:

- stale contracts that are rewritten to impersonate later source truth;
- implementation history that exists only in a pull request;
- undocumented drift between designed and installed behavior; and
- conflation of source installation, operation, and customer activation.

It defines the durable artifacts and default human/model collaboration
lifecycle for medium and high-risk features. It does not grant implementation
or activation authority for any feature.

## 2. Feature classification

Classification is based on authority, state, risk, and reversibility, not the
number of changed lines.

### Small

Examples include copy, styling, accessibility fixes, and bounded refactors
with no authority, schema, durable-state, activation, or customer-policy
change.

Minimum documentation:

- a clear PR description;
- proportionate tests or validation; and
- a decision-log entry only when an authority decision changes.

Small changes do not require the medium/high-risk artifact set merely because
they touch several files. The exception and its boundaries must remain clear
in the PR.

### Medium

Examples include a new administrator workflow, public read, feature gate,
persistent model, or bounded state transition.

Required artifacts:

- a design contract before implementation;
- a source-status/as-built record after the reviewed merge;
- an operations runbook before operation or activation when applicable;
- decision-log entries for frozen decisions and material review corrections;
  and
- a separate activation record before customer or production enablement.

### High-risk

Examples include payment or refund behavior, authentication, privacy-sensitive
uploads, health-adjacent data, automatic recommendation or learning,
order/fulfillment/manufacturing state, external-provider contact, workers or
schedulers, and destructive migrations.

High-risk features require the medium set plus:

- a threat/failure model;
- an explicit state and authority contract;
- a rollback/recovery contract;
- selective independent technical audit; and
- an activation and observation record.

## 3. Artifact taxonomy

| Artifact | Purpose and timing | Normative status | Non-authority and supersession |
| --- | --- | --- | --- |
| **Product / Operations Plan** | Frames customer, operator, UX, rollout, and business intent before repository design. | Product planning authority only when explicitly adjudicated. | Does not authorize source changes. Revise or supersede when product intent changes. |
| **Design Contract** | Freezes semantics, invariants, boundaries, owners, and gates before implementation. | Normative for its declared scope. | Does not prove source exists or activate it. Semantic changes require a new version and explicit supersession. |
| **Implementation Task Contract** | Binds one implementation slice to a baseline, paths, authorization, checks, and stop conditions. | Normative for that task only. | Does not broaden the design or create standing authority. A later task receives a new bounded contract. |
| **Source Status / As-Built** | Installed after merge to record reviewed source truth, paths, invariants, evidence, limitations, and re-entry gates. | Descriptive source authority linked to the governing design. | Is not a new design or activation contract. New source truth requires review and a new version or explicit update under change control. |
| **Operations Runbook** | Prepared before operators use, activate, diagnose, recover, or roll back a feature. | Procedural authority within its declared operating state. | Does not invent design, activation, credentials, or unsupported bypasses. Version when procedure or owned state changes. |
| **Decision Log** | Records adjudicated decisions, corrections, dependencies, and supersession. | Durable decision evidence. | Is not a substitute for detailed contracts or source status. Append; do not silently rewrite earlier decisions. |
| **Threat / Failure Model** | Identifies abuse, privacy, security, concurrency, partial-failure, external-contact, and recovery risks before high-risk implementation or activation. | Normative for declared risks and mitigations. | Does not itself implement controls. Version when threat surface or failure ownership changes. |
| **Activation Record** | Separately authorizes a dated market, purpose, environment, catalog/data scope, owner, reviewed SHA, observation, and rollback. | Activation authority only for its exact recorded scope. | Does not authorize unrelated purposes, markets, data, or later source. Supersede or roll back by a new dated record. |
| **Deprecation / Supersession Record** | Retires or replaces contracts, source paths, data, operations, or activation without erasing history. | Normative for the declared retirement or replacement. | Must name predecessors, successors, compatibility, data handling, and rollback. |

A frozen design contract is not retroactively rewritten merely to say that
implementation later completed. A source-status/as-built record links the
contract and records later source truth.

## 4. Required metadata

Include as applicable:

- title, version, document class, and status;
- scope and explicit non-authority;
- design and parent authority;
- source baseline, reviewed chain, and merge evidence;
- activation and seed/data state;
- dependencies and invariant ownership;
- tests and historical evidence;
- known limitations and re-entry gates;
- rollback or recovery;
- change control and supersession.

Claims must be tied to repository or external-authority evidence. A PR
description may bind review history but must not be the sole durable source.

## 5. Naming and versioning

Use lower-kebab-case names:

```text
<feature>-contract-v0.1.md
<feature>-source-status-v0.1.md
<feature>-operations-v0.1.md
<feature>-activation-YYYY-MM-DD-v0.1.md
<feature>-threat-model-v0.1.md
```

Use a new version for semantic changes. Preserve prior versions and record
`supersedes` and `superseded-by` explicitly. Do not silently rewrite history.

## 6. Default lifecycle

```text
P0  product/operations planning
P1  human adjudication and design contract
P2  repository reconnaissance
P3  implementation task contract
P4  Codex implementation and draft PR
P5  independent adversarial source review
P6  bounded corrections
P7  merge
P8  source-status/as-built installation
P9  operations/runbook readiness
P10 separately authorized activation
P11 observation, rollback, or supersession
```

P8 and P9 may share one documentation PR after a reviewed merge. Small changes
use the bounded exception in §2 and do not require heavyweight artifacts by
default.

## 7. Default model and tool roles

### Fable

Primary product planning, customer journey, UX, information architecture,
operator workflow, policy presentation, and product/operations critique.

### ChatGPT

Project coordination, evidence synthesis, human-decision framing,
adjudication, contract drafting, bounded authorization, and independent review
coordination.

### Codex

Repository reconnaissance, source implementation, migrations, tests,
validation, branch/commit/push, and draft PR preparation.

### Opus

Selective independent technical architecture/source audit for high-risk,
irreversible, cross-system, privacy-sensitive, concurrency-heavy, or
automatic-learning work. Opus is not the default source implementer when Codex
owns implementation.

These are defaults, not evidence or independent authority:

- model agreement is not evidence;
- one model does not self-confirm its own plan;
- a human retains final product and activation authority;
- Codex does not invent unresolved product policy;
- Fable does not authorize repository source changes; and
- Opus is selective, not mandatory for every feature.

## 8. Pull request and post-merge requirements

A medium or high-risk implementation PR must identify:

- classification and exact scope;
- governing design and task authority;
- source baseline;
- changed paths;
- schema and migration impact;
- activation and seed/data state;
- tests and CI evidence;
- explicit non-authority;
- review status; and
- the next gate.

After merge, the source-status/as-built record must identify:

- merge SHA and reviewed source chain;
- core source and test paths;
- installed invariant ownership;
- historical validation and CI evidence;
- activation and seed/data state;
- known limitations; and
- re-entry gates.

## 9. Drift and activation separation

Review and version source status when any of these materially change:

- schema or durable-state semantics;
- activation boundaries;
- core path ownership;
- purpose or state vocabulary;
- automatic recommendation, event, ranking, or learning behavior; or
- deprecation and retirement.

The following distinctions are frozen:

```text
source installed != customer activated
row active != feature gate enabled
runbook exists != activation authorized
environment key documented != value approved
```

Every customer or production activation requires a separate dated record
unless an existing governing contract explicitly grants that exact activation.
