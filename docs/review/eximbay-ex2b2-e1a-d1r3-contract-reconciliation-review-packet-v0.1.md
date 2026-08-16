# Eximbay EX2B2-E1A D1R3 Contract Reconciliation — Focused Review Packet v0.1

## 1. Review request

Review the single proposed authority change in
[E1A Execution Contract v0.2 Candidate](../engineering/eximbay-ex2b2-e1a-ready-transport-evidence-execution-contract-v0.2.md):

```text
QUESTION:
  Does v0.2 correctly limit E1A H1 to reviewed invocation-workflow evidence
  under the trusted local operator/host boundary, while preserving exact
  reviewed artifact admission and every existing operational control?

REQUESTED DISPOSITION:
  APPROVE_FOR_INSTALLATION
  or
  RETURN_WITH_EXACT_CONFLICT / OVERBROAD_DELTA

THIS PACKET AUTHORIZES:
  review only

PROVIDER CONTACT:
  0

H1 SOURCE CORRECTION OR EXECUTION:
  not authorized
```

## 2. Exact review baseline

```text
repository HEAD:
  85b4196

repository tree:
  d8df00bf6b5ecf7ba1a8a6e5324d4f1d5258df0c

installed E1A v0.1:
  63440 bytes
  SHA-256 29be9cbb1d014223b267bab66504cce7638ae356830851cab98a7d819c35b389
  git blob 45fa67824d5a54ec6f09aecf622a783a23c84d19

E1A v0.2 candidate:
  11646 bytes
  SHA-256 14d19c6fe327b0bb38fc0dae04fcb04848117a0657ad978eee5279d90004b29f
```

The v0.2 candidate is a normative superseding overlay. It incorporates the
complete v0.1 authority unchanged except for its enumerated execution-identity
claim replacements and interpretive boundary. Version v0.1 remains untouched.

## 3. Higher-precedence reconciliation

| Authority | Exact reviewed identity | Material result |
| --- | --- | --- |
| EX2B2 Design Contract v0.1 | 43274 bytes; SHA-256 `aac171aa00425194069ebacb6e15dd7be014379bafaaea2793c1f7b32cb35347` | Requires source identity, server custody, contact ordering, one-contact/no-retry, and evidence gates; contains no malicious-same-user executable-attestation requirement. |
| EX2B2 Threat / Failure Model v0.1 | 17484 bytes; SHA-256 `69220301928a19ae9d1bf0a3cd388ee8a168b67726e3cfed27ad42806d4fc4f3` | Records `process compromise remains` and `compromised server code` as residual risks at lines 66–67. |
| EX2B2-S2 READY Contact Design Contract v0.1 | 26330 bytes; SHA-256 `83534428b696bb76cd56fc17af6ea3be479f319f49abe2e76a9c9783646ec164` | Section 14 says the installed EX2B2 Threat / Failure Model remains the sole model for the surface; adds no executable-attestation duty. |
| Feature Documentation Standard v0.1 | installed at the same baseline | Requires semantic changes to use a new version and explicit supersession; v0.2 follows that rule without rewriting v0.1. |

Conflict search disposition:

```text
HIGHER-PRECEDENCE TEXT REQUIRING MALICIOUS-SAME-USER ATTESTATION:
  none

MANDATORY STOP:
  not triggered

RECONCILED THREAT ALLOCATION:
  trusted operator/host workflow controls are in scope
  process compromise / compromised server code remain residual
  post-boundary malicious same-user execution is out of scope for E1A H1
```

## 4. Exact claim delta

| Installed v0.1 location | Overstatement risk | v0.2 correction |
| --- | --- | --- |
| Section 1, lines 101–104 | “verify the exact reviewed H1 bytes” can be read as verification of the running process rather than admitted artifact files. | Section 6.1 limits the claim to artifact admission and workflow evidence under the trusted operator/host boundary. |
| Section 6, lines 328–333 | “bind observed execution to reviewed orchestration bytes” can be read as proving exact running parent code identity. | Section 6.2 binds the recorded workflow to admitted artifacts and expressly disclaims cryptographic running-process identity. |
| Section 12, lines 971–974 | “emitted by the exact reviewed H1 runner” can be read as an attested-process claim. | Section 6.3 attributes classification to the workflow after exact artifact admission and disclaims malicious-same-user attestation. |
| Precontact/package/redaction booleans, including lines 737 and 1127–1128 | Identity booleans may be over-interpreted beyond their user-space admission point. | Section 6.4 defines them as artifact/metadata/workflow matches, not OS-level or cryptographic attestation. |

No other v0.1 claim is replaced.

## 5. Preserved controls audit

The reviewer should reject the candidate if any row is not preserved.

| Control family | Candidate disposition |
| --- | --- |
| Exact reviewed launcher/runner byte count and SHA-256 before credential admission | preserved and explicitly restated |
| Launcher/runner locks and single-invocation exclusion | preserved |
| PID and expected parent-child checks | preserved as workflow controls, not attestation |
| Private IPC and message/state validation | preserved as workflow controls, not attestation |
| Invocation capability custody, consumption, and non-reuse | preserved as workflow controls, not attestation |
| Exact argv and Node `execArgv` gates | preserved |
| Exact allowlisted environment and TLS/proxy/debug exclusions | preserved |
| Approved runtime, dependency, checkout, source/schema/migration identities | preserved |
| Persistent root ownership/symlink/mode/layout/fsync/archive custody | preserved |
| Forward-only crash-durable journal | preserved |
| `CONTACT_MAY_HAVE_OCCURRED` permanently consumes authority | preserved |
| Maximum one contact; exact endpoint/method; no probe/warm-up/retry/second scenario | preserved |
| Observer non-consumption and bounded safe metadata | preserved |
| stdout/stderr bounds, final-byte scan, redaction, quarantine, cleanup separation | preserved |
| SDK, `request_pay`, BF4, routing, LIVE, customer, and activation prohibitions | preserved |

## 6. Semantics and identity non-delta

The candidate makes no change to:

- exact SANDBOX READY endpoint, method, authentication construction, request,
  response, or result-classification semantics;
- `MAX_PROVIDER_CONTACTS = 1`, durable journal ordering, ambiguous-contact
  handling, or the no-retry rule;
- `ACCOUNT_BOUND_SANDBOX`, shared-test exclusion, credential/public-origin
  admission, or secret non-custody;
- any section 5 payment source, schema, migration, byte count, SHA-256, or
  migration-manifest identity from v0.1;
- the disposable synthetic fixture or E1A result package schema;
- READY evidence class or the deliberate absence of raw provider-response and
  raw fgkey custody; or
- EXIMBAY routing and activation posture.

The candidate does not add an attestation service, signature protocol, kernel
primitive, privileged daemon, external verifier, TPM/enclave, code-signing
scheme, or new capability mechanism.

## 7. Zero-contact and changed-path record

Actions performed for D1R3 were limited to repository metadata and document
reads plus creation of this candidate and review packet.

```text
Eximbay API contact:                         0
Eximbay SDK-origin contact:                  0
credential value read/use/hash/fingerprint: 0
E1A database open/query:                     0
SDK load/parse/compile/evaluate:              0
EXIMBAY.request_pay:                         0
EXIMBAY activation:                          0
payment source/schema/migration/routing edit:0
H1 source edit:                              0
```

Changed paths are exactly:

```text
docs/engineering/eximbay-ex2b2-e1a-ready-transport-evidence-execution-contract-v0.2.md
docs/review/eximbay-ex2b2-e1a-d1r3-contract-reconciliation-review-packet-v0.1.md
```

## 8. Reviewer checklist and stop rules

Approve only if every answer is `YES`:

```text
Does the candidate leave v0.1 immutable and supersede it only upon installation?
Does the higher-precedence threat model retain process compromise and compromised server code as residual risks?
Is malicious same-user execution after trust-boundary loss clearly out of E1A H1 scope?
Is H1 clearly not represented as OS-level or cryptographic executable attestation?
Are exact reviewed launcher and runner artifacts still byte/SHA verified before credentials?
Are lock, PID, IPC, capability, argv, execArgv, environment, runtime, custody,
journal, one-contact, redaction, and no-retry controls preserved?
Are provider-contact semantics and installed payment source identities unchanged?
Is external attestation neither designed nor authorized?
Is H1 source correction explicitly deferred?
Was the task zero-contact and credential-free?
```

Stop and return the exact text if any installed higher-precedence authority is
found to require malicious-same-user attestation. Otherwise review only the
bounded authority delta above; do not use this packet to correct or execute H1.
