# Eximbay EX2B2-E1A — Bounded Sandbox READY Transport Evidence Execution Contract v0.2 Candidate

## Status

```text
DOCUMENT CLASS:
  PROVIDER EVIDENCE / EXECUTION CONTRACT

RISK CLASS:
  HIGH — EXTERNAL PAYMENT PROVIDER CONTACT / CREDENTIAL CUSTODY

TASK CLASSIFICATION:
  DOCUMENTATION_ONLY / ZERO_CONTACT / CONTRACT_RECONCILIATION

CURRENT CONTRACT STATUS:
  D1R3 CANDIDATE FOR FOCUSED REVIEW
  NOT INSTALLED

RECONCILIATION BASELINE:
  85b4196

PROVIDER CONTACT DURING D1R3 RECONCILIATION:
  0

REAL CREDENTIAL VALUE READ / USED:
  0

E1A DATABASE OPENED:
  no

SDK LOAD / REQUEST_PAY / ACTIVATION:
  none

SUPERSEDES UPON REVIEWED INSTALLATION:
  eximbay-ex2b2-e1a-ready-transport-evidence-execution-contract-v0.1.md

SUPERSEDED-BY:
  none

RUNTIME AUTHORITY:
  NONE
```

## 1. Purpose and bounded effect

This v0.2 candidate reconciles the E1A H1 execution guarantee with the
higher-precedence installed EX2B2 Design Contract and Threat / Failure Model.
It corrects only language that could be read to claim that user-space
launcher/runner process identity, PID, IPC, or capability controls prove the
exact code identity of a running parent against a malicious same-user process.

E1A H1 establishes the reviewed invocation workflow under the trusted local
operator and host boundary defined in section 3. It is not an OS-level,
hardware-backed, or cryptographic executable-attestation system.

This candidate does not design or authorize external attestation. It does not
change provider-contact semantics, credential class, payment source identity,
schema, migrations, routing, SDK, BF4, evidence classification, redaction,
cleanup, or activation authority.

## 2. Precedence reconciliation and conflict result

Precedence remains the order frozen by v0.1 section 1. For this correction the
material higher-precedence authorities are:

1. [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md);
2. [EX2B2 READY Transport + JavaScript SDK Browser Handoff Design Contract v0.1](./eximbay-ex2b2-ready-transport-sdk-handoff-design-contract-v0.1.md);
3. [EX2B2 Threat / Failure Model v0.1](./eximbay-ex2b2-ready-transport-sdk-handoff-threat-model-v0.1.md); and
4. [EX2B2-S2 READY Contact Design Contract v0.1](./eximbay-ex2b2-s2-ready-contact-design-contract-v0.1.md).

The reconciliation result is:

```text
HIGHER-PRECEDENCE MALICIOUS-SAME-USER ATTESTATION REQUIREMENT:
  none found

CONFLICT STOP CONDITION:
  not triggered
```

The companion Threat / Failure Model already records `process compromise
remains` and `compromised server code` as residual risks. It does not assign
E1A H1 responsibility for proving the running code identity of a same-user
process after the trusted host/operator boundary has been lost. The parent
EX2B2 Design Contract and S2 specialization likewise require source identity,
credential custody, lifecycle ordering, one-contact, no-retry, and redaction
controls without requiring executable attestation.

Accordingly, interpreting v0.1 as malicious-same-user attestation would
overstate E1A and conflict with the installed threat allocation. This v0.2
candidate narrows that interpretation; it does not weaken any in-scope
workflow control.

## 3. Trusted local boundary and residual risk

For E1A H1, human threat-model authority explicitly accepts:

- the local operator account is trusted;
- the local host is trusted;
- the persistent E1A custody root is trusted subject to the existing
  ownership, symlink, and mode gates;
- the explicit invocation command is trusted;
- malicious same-user execution after loss of that operator/host trust
  boundary is out of scope for E1A H1; and
- H1 is not an OS-level or cryptographic executable-attestation system.

Within that boundary, the reviewed invocation workflow remains evidence of a
bounded, explicitly authorized execution. If the trusted local operator,
host, command, or custody boundary is compromised, E1A makes no claim that its
user-space controls distinguish the reviewed launcher/runner from malicious
same-user code. That condition remains residual `process compromise` or
`compromised server code` under the installed Threat / Failure Model.

This boundary does not convert an observed result into raw-provider-response
custody or independently recomputable response-semantic evidence. The v0.1
evidence class remains unchanged.

## 4. Exact reviewed artifact admission remains mandatory

The exact reviewed launcher and runner artifacts must still be verified by
byte count and SHA-256 before credential admission. Any mismatch, replacement,
mutation, generation, transpilation, or ambiguous identity blocks before
credentials and contact exactly as v0.1 requires.

Those gates prove that the invocation workflow admitted the exact reviewed
artifact files under the trusted local boundary. They do not cryptographically
prove the in-memory code identity of a running process against a malicious
same-user actor who already controls or has defeated that boundary.

The package must still contain byte-identical copies of the admitted reviewed
launcher and runner. Package equality proves artifact custody and admission;
it is not a cryptographic statement about the identity of every instruction
executed by the parent or child process.

## 5. Preserved launcher/runner workflow controls

This reconciliation removes, relaxes, substitutes, or redesigns none of the
reviewed H1 workflow controls. The following remain mandatory under their
existing exact H1 packet and invocation authority:

- launcher and runner lock ownership and single-invocation exclusion;
- launcher/runner PID binding and expected parent-child relationship checks;
- private IPC channel ownership and message-shape/state validation;
- invocation capability creation, custody, validation, consumption, and
  non-reuse;
- exact launcher argv and child argv admission;
- exact Node `execArgv` admission, including the existing preload, inspector,
  loader, and Node-option exclusions;
- exact allowlisted child environment and the existing TLS/proxy/debug
  exclusions;
- exact approved runtime, dependency, checkout, and installed-source identity
  gates;
- persistent custody-root ownership, symlink, mode, layout, file-installation,
  fsync, and archive gates;
- crash-durable forward-only contact journal and the rule that uncertainty
  after `CONTACT_MAY_HAVE_OCCURRED` permanently consumes the invocation;
- one-contact maximum, exact endpoint/method, no probe or warm-up, no automatic
  retry, and no second scenario;
- bounded stdout/stderr custody, safe observer behavior, final-byte scanning,
  secret/identifier redaction, quarantine, and cleanup separation; and
- no SDK load, no `request_pay`, no BF4 completion, no routing activation, and
  no LIVE or customer activation.

PID, IPC, capability, lock, argv, `execArgv`, environment, and runtime checks
establish and constrain the reviewed invocation workflow within the trusted
local boundary. They prevent or detect the in-scope conditions assigned to
them, including stale, accidental, concurrent, malformed, substituted, or
unreviewed ordinary invocation paths. They are not cryptographic same-user
code attestation and must not be described as such.

## 6. Normative claim replacements

Upon reviewed installation, this section replaces only the following v0.1
claims and interpretations.

### 6.1 Independent adjudication

Replace any reading of v0.1 section 1 that independent adjudication can verify
the exact identity of the running H1 parent or child process with:

> Independent adjudication may verify the reviewed launcher/runner artifact
> identities admitted before credentials, the recorded trusted-boundary
> workflow controls, installed source identities, crash-durable contact
> journal, safe transport metadata, bounded S1 result, no-retry posture,
> redaction, and cleanup chain. This is workflow and artifact evidence under
> the trusted local operator/host boundary, not malicious-same-user executable
> attestation.

### 6.2 Binding observed execution

Replace the final sentence of v0.1 section 6 with:

> The result package includes byte-identical copies of both reviewed files and
> the H1 packet identity so an adjudicator can bind the recorded invocation
> workflow to the artifacts admitted under the trusted local operator/host
> boundary. This binding does not cryptographically prove the exact running
> parent or child code identity against a malicious same-user process.

### 6.3 Result-classification attribution

Replace the v0.1 section 12 statement that dispositions are emitted by “the
exact reviewed H1 runner” with:

> These are installed-source observed classifications reported by the H1
> invocation workflow after byte/SHA admission of the exact reviewed runner
> and launcher artifacts under the trusted local operator/host boundary. The
> evidence does not cryptographically attest the code identity of the running
> processes against a malicious same-user actor.

### 6.4 Interpretive rule for identity booleans

Every v0.1 precontact, package, redaction, finalization, and self-audit field
such as `h1_harness_bytes_match_reviewed`,
`h1_launcher_bytes_match_reviewed`, “H1 identity exact,” or “invocation
authority exact” means that the reviewed files, metadata, arguments, and
workflow gates matched at their defined user-space admission points under the
trusted boundary. No such boolean means OS-level or cryptographic attestation
of running same-user code.

## 7. Incorporated v0.1 authority and supersession

Except for the claim replacements and interpretive boundary in sections 1–6,
the complete normative content of
[E1A Execution Contract v0.1](./eximbay-ex2b2-e1a-ready-transport-evidence-execution-contract-v0.1.md)
is incorporated unchanged into this v0.2 candidate.

In particular, the following v0.1 authorities remain exact and unchanged:

- D22 position, evidence class, result classes, provider facts, and all
  provider-contact semantics;
- candidate/approved baseline rules and every installed payment source,
  schema, migration, byte-count, SHA-256, and migration-manifest identity;
- `ACCOUNT_BOUND_SANDBOX`, public-shared-test exclusion, credential and public
  origin gates, and the prohibition on recording credential-derived facts;
- disposable DB and exact synthetic-fixture rules;
- persistent custody, environment, runtime, logging, precontact plan audit,
  contact journal, clocks, observer, one-contact, no-retry, redaction,
  evidence-package, cleanup, recovery, and stop-condition rules; and
- SDK, `request_pay`, BF4, routing, LIVE, customer, and activation
  non-authority.

Upon reviewed installation, v0.2 supersedes v0.1 for future E1A H1 and
invocation authority. Version v0.1 remains immutable historical review
evidence and must not be edited in place. Any future prompt or H1 review must
name the installed v0.2 identity; naming v0.1 alone is insufficient after
supersession.

## 8. D1R3 disposition and next gate

```text
D1R3 FINDING:
  v0.1 can overstate user-space workflow evidence as exact running-parent
  code identity against malicious same-user execution

D1R3 DISPOSITION:
  CLOSED_BY_V0_2_CANDIDATE

MECHANISM CHANGE:
  none

PROVIDER-CONTACT SEMANTIC CHANGE:
  none

INSTALLED PAYMENT SOURCE IDENTITY CHANGE:
  none

EXTERNAL ATTESTATION DESIGN:
  none

NEXT GATE:
  focused independent byte-delta and authority review of this v0.2 candidate
```

No H1 source correction, H1 execution, E1A invocation, credential admission,
provider contact, database access, SDK activity, `request_pay`, routing change,
or EXIMBAY activation is authorized by this candidate.
