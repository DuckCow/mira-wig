# Mira Backend / High-Risk Engineering Governance v0.1

## 0. Scope

This is an overlay on:

`docs/engineering/ai-engineering-governance-v0.1.md`

Apply it when Mira work materially touches one or more of:

- payment/financial state;
- authentication/authorization;
- credentials/secrets;
- privacy/sensitive customer data;
- database schema or durable customer/production state;
- destructive operations;
- concurrency/idempotency/contact ceilings;
- external provider calls with irreversible or ambiguous outcomes;
- durable jobs/automation;
- production activation;
- security-critical or legally material behavior.

A file being under a STRICT glob is a strong signal, but the actual risk and frozen task
contract remain the authority for how much process is required.

---

## 1. Freeze the assurance boundary before controls [INVARIANT]

Before a material/high-risk design or execution, make explicit the relevant:

```text
GUARANTEES:
NON-GOALS:
THREAT BOUNDARY:
TRUSTED ASSUMPTIONS:
RESIDUAL RISKS:
MACHINE-OWNED RESPONSIBILITIES:
HUMAN-OWNED RESPONSIBILITIES:
SAFE STOP:
BOUNDED RE-ENTRY:
```

Do not expand the assurance target merely because stronger controls are technically possible.

Do not silently narrow a frozen guarantee because it is expensive.

---

## 2. Existing safety/correctness requirements stay frozen [INVARIANT]

A simplification may remove ceremony, duplicate state, redundant evidence, unnecessary
automation, or an overbuilt validator.

It may not weaken an already-frozen invariant such as:

- server-authoritative amount/order/payment truth;
- authorization boundaries;
- at-most-once/exactly-once contact requirements;
- idempotency/concurrency guarantees;
- irreversible-state ordering;
- credential custody;
- fail-closed provider/environment selection;
- durable ambiguity handling;
- customer-data isolation;
- production/live activation gates.

If the frozen requirement itself should change, that is a separate human decision.

---

## 3. Contact and irreversible-effect discipline [INVARIANT]

For an external side effect whose outcome can become ambiguous:

- define the contact/commit boundary;
- persist the required pre-contact durable state before delegation when the design depends on
  that fact;
- count an attempt when contact may have begun;
- do not blind-retry after an ambiguous outcome;
- retain enough authoritative state to prevent unsafe automatic re-entry.

Do not build a general contact journal when an existing durable lifecycle already proves the
required facts.

Do not use absence of evidence as proof of zero contact when the system cannot positively
establish it.

---

## 4. Safe STOP and bounded human re-entry [ENGINEERING_DEFAULT]

Prefer:

```text
SAFE STOP
-> bounded human adjudication
-> separately authorized re-entry
```

when automated recovery would create more state, ambiguity, or irreversible risk than it
removes.

Do not manualize frequent, repetitive, timing-sensitive, security-critical, or irreversible
invariants when automation materially lowers expected error.

A proposed manual recovery should make clear:

- stopped state;
- trigger;
- owner;
- available evidence;
- permitted actions;
- prohibited actions;
- re-entry authority;
- expected frequency;
- consequences of operator error.

Do not create reusable recovery machinery for a one-off pre-service state unless the same
failure is realistically recurring and the automation adds net assurance.

---

## 5. Database and durable-state truth [INVARIANT]

For material state transitions:

- use the authoritative database/state owner;
- preserve transaction/lock ordering that the invariant depends on;
- verify important mutations by authoritative readback;
- do not infer success from client-visible output alone;
- distinguish transient handoff state from durable business truth;
- keep test/disposable data isolated from production/customer data.

Schema changes require the repository's migration discipline.

Do not use manual production DB edits to bypass a missing migration or invariant.

---

## 6. Credentials and sensitive data [INVARIANT]

Credentials and sensitive customer data are not evidence payloads.

Store, transmit, log, retain, and expose only what the task requires.

Publicly documented test credentials may still be treated as credential-shaped material when
doing so prevents accidental leakage patterns or copy-forward into production paths.

Never infer credential provenance from a value when provenance itself is a frozen requirement.

Production/live/customer activation must not be inferred from successful sandbox/shared-test
behavior.

---

## 7. External provider facts [INVARIANT]

Current external API protocol facts come from first-party/official authority.

If current official authority materially conflicts with the installed frozen task contract:

```text
STOP BEFORE THE NEW EXTERNAL EFFECT
-> report the conflict
-> human/contract adjudication
```

Historical provider evidence remains historical. It does not silently override current official
facts.

Do not broaden an exact tested observation into a general provider grammar/capability claim.

---

## 8. High-risk design sequence [ENGINEERING_DEFAULT]

For material/high-risk design, use the minimum sufficient form of:

```text
correctness
-> demolition
-> safety reconciliation
```

### Correctness

Find missing controls that could break a frozen guarantee.

### Demolition

Try to remove:

- duplicate authority;
- duplicate state;
- redundant evidence;
- unnecessary recovery;
- unnecessary generalization;
- one-shot machinery for cheap preflight;
- automation whose human STOP path is safer and simpler.

### Safety reconciliation

For every removal, ask:

```text
Which frozen guarantee depended on this?
What now satisfies that guarantee?
```

If no answer exists, the demolition is invalid.

---

## 9. Preflight before one-shot durable execution [ENGINEERING_DEFAULT]

Cheap contact-free feasibility checks should normally occur before creating one-shot durable
execution state.

Examples:

- required input presence;
- official provider fact drift;
- local runtime compatibility;
- exact source/baseline identity;
- disposable infrastructure readiness;
- obvious credential/provenance availability.

Do not let a trivial contact-free precondition consume an irreversible/one-shot execution
mechanism unless a frozen design specifically requires that ordering.

The preflight itself should stay cheap: no durable run/journal/evidence framework merely to
check whether inputs exist.

---

## 10. Evidence proportionality [ENGINEERING_DEFAULT]

Evidence exists to close a real failure mode.

Prefer the smallest artifact that proves the required facts:

```text
authoritative DB state
one sanitized result JSON
existing structured logs
a bounded runtime readback
```

Use heavier custody/journaling only when the failure mode requires it, such as:

- ambiguous provider contact where retry safety depends on durable proof;
- destructive/irreversible execution;
- compliance/audit requirements;
- multi-stage crash recovery whose state cannot be reconstructed safely.

Do not create original/archive/ZIP/manifest chains by default.

---

## 11. Review findings

For backend/high-risk findings always report:

```text
SEVERITY:
  BLOCKER / IMPORTANT / MINOR

GOAL RELEVANCE:
  DIRECT / INDIRECT / OUT_OF_SCOPE

DEFECT CLASS:
  SAME / NEW_STRUCTURAL
```

A DIRECT blocker is not ignored because a review budget is exhausted.

An INDIRECT issue should not be promoted into a DIRECT blocker merely because it is technically
interesting.

---

## 12. Completion verification [INVARIANT + ENGINEERING_DEFAULT]

A high-risk task is not complete merely because unit tests are green.

Use the minimum combination required by the changed behavior:

- focused behavior tests;
- concurrency/failure tests when the invariant depends on them;
- actual runtime/provider flow where authorized and practical;
- authoritative DB/state readback;
- repository-required final verification/CI.

Do not contact an external provider solely to repeat an already-proven fact.

Do not perform a second irreversible call merely to confirm the first.
