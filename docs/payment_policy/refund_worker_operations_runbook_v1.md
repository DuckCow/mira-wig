# Refund worker operations runbook v1

P3E-B1 leaves all operations commands provider-free and outside the production distributed-
admission lock. `OVERLAP_SKIPPED` means no provider-capable work began; operators must not treat it
as `CYCLE_COMPLETE`, provider success, a retry request, or authority to execute another canary.

Status: implemented but dormant.

This runbook amends, and does not replace, `refund_worker_host_v1.md`,
`refund_worker_lifecycle_v1.md`, and `refund_worker_observability_v1.md`. It defines privileged,
provider-free observations and external operating requirements. It creates no scheduler, monitor,
alert destination, staffed team, provider authority, manual-resolution mutation, credential-rotation
capability, or activation approval. LIVE remains unreachable. The P3D provider-free rehearsal
capability is implemented; actual deployment evidence is absent and activation remains blocked.
P3E SANDBOX canary is unimplemented and unauthorized.

## Privileged operator commands

- `npm run refund:ops:manual` reads the coherent TOSS/SANDBOX manual-review queue.
- `npm run refund:ops:reconcile` reads a provider-free local reconciliation snapshot.
- `npm run refund:ops:credential` validates activation and credential grammar and reports only
  non-secret lifecycle capability.

The commands accept no additional arguments and do not load dotenv files. MANUAL and RECONCILE own
one database client, require connectivity and exact migration readiness, and use repeatable-read,
read-only transactions with PostgreSQL time. They do not require the worker master to be enabled and
do not inspect a provider secret. CREDENTIAL is configuration-only and uses no database.

Normal output uses `mira-refund-operations-process/v1`, one JSON line, and stdout for exit zero or
stderr for nonzero results. The only serialization/observation fallback is
`{"ok":false,"code":"SYSTEMIC_FAILURE"}` on stderr with exit 1.

Manual and reconciliation output contains a high-cardinality operator case reference. It is for
local privileged operator use only. Do not forward it to metrics, use it as an alert label, paste it
into public tickets, or retain it beyond operational need. The references are not monitoring
dimensions. `caseRef` is the exact durable `RefundAttempt.id`; it is not a generated substitute,
hash, public identifier, or provider identifier. The reconciliation `summary.caseCount` is the
complete distinct qualifying-case count even when the bounded case list is truncated.
Reconciliation cases are ordered by severity, age descending, then `caseRef` ascending with a
deterministic Unicode code-point comparison; exact output validation enforces the same tie-break.
`caseRef` is untrusted privileged operator data with no stronger character or length claim than the
persisted identifier. Consumers must parse the JSON record and treat the reference only as data. It
must never be interpreted as terminal markup, a command, SQL, a filesystem path, or a URL, and it
remains prohibited from public tickets, metrics, alert labels, and other public output.

## Capability and mutation decision

P3C2 implements observations only. Manual resolution, provider-assisted reconciliation, and local
state correction remain non-executable because the repository has no single authorized write path
that simultaneously proves durable operator identity, immutable operator audit, explicit action
reason, expected-version concurrency control, ordinary financial-state preconditions, idempotent
retry, process-interruption recovery, safe possible-contact handling, access control, and tests over
the complete state machine. Operators must never edit the database directly.

The existing `payment:reconcile` command concerns payment settlement, webhook ingress, and payment
core diagnostics. It is not the refund-execution reconciliation command and is unchanged.

## Roles

The repository defines roles, not people. Activation requires external evidence of named assignees
and reachable contact methods.

- `REFUND_OPERATIONS_OWNER` watches manual and reconciliation observations, acknowledges cases, and
  gathers operator evidence. The role does not alter provider or database state without an
  authorized procedure.
- `PAYMENT_ENGINEERING_OWNER` investigates state-machine, query, worker, and migration failures and
  approves code or data repair plans. Provider contact is never treated as finality.
- `INCIDENT_COMMANDER` controls emergency stop and restart decisions, coordinates provider-side and
  local reconciliation, and owns the decision to keep admission disabled.
- `CREDENTIAL_OWNER` controls external secret-manager actions and stages, switches, or revokes only
  under the credential lifecycle gate. Secrets never enter repository output or tickets.

No person, staffed window, alert destination, or contact method is configured here.

## Manual-review operating contract

Any nonzero manual-review backlog is externally alertable. For a future externally established and
staffed operating window, the planning targets are acknowledgement within 15 minutes,
investigation start within 30 minutes, and a disposition plan within 4 hours. These are targets,
not guarantees or current SLAs. No timer, staffed window, alert destination, owner, acknowledgement
workflow, escalation workflow, or automated customer communication implements them.

Operator sequence:

1. Disable new worker admission when possible contact or inconsistency is suspected.
2. Capture worker health, manual, and reconciliation outputs.
3. Preserve the case reference and local evidence under restricted access.
4. Inspect provider state only under a separately authorized provider procedure.
5. Classify the result without equating contact with success.
6. Prepare a reviewed mutation plan.
7. Require a separate authorized write mechanism.
8. Verify post-state and retain the audit record.

P3C2 provides no manual-resolution mutation.

## Provider-free reconciliation and deadlines

The reconciliation snapshot uses local durable states only. It cannot determine or prove provider
success or failure. `POSSIBLE_CONTACT` means unknown. Automatic recontact is forbidden outside the
existing explicitly gated worker behavior. Provider-console or provider-API inspection requires
separate authorization. Provider evidence must be correlated with durable local contact and
authorization evidence. Any local correction requires a reviewed, idempotent write path.

Exact contacted/recovery thresholds are warning at 10 days (864,000 seconds), critical at 12 days
(1,036,800 seconds), and the hard recovery deadline at 13 days (1,123,200 seconds).

At warning, admission may remain disabled for the affected route and the owner must begin
reconciliation planning. At critical, incident-commander involvement is required, blind retry is
forbidden, and provider escalation must be prepared. At or after 13 days, do not claim automatic
recoverability; escalate as an unresolved financial incident. No alert integration implements
these thresholds.

## Emergency stop and restart

Emergency stop:

1. Disable the worker master in the deployment environment.
2. Prevent future scheduler admission.
3. Permit an in-flight one-shot process to drain when safe.
4. Use hard termination only when continued execution is riskier.
5. Treat hard termination as possible contact.
6. Run health, manual, and reconciliation observations.
7. Keep provider activity unauthorized until reviewed.

Restart requires configuration and migration checks green, a health snapshot, no unresolved
critical contacted case, active manual-review and reconciliation ownership, scheduler no-overlap
proof, satisfaction of the credential lifecycle gate, and explicit activation or canary
authorization. Code presence is not restart authority.

## Credential lifecycle and rotation

The current runtime is `SINGLE_ACTIVE_ONLY`. Commands and attempts persist a credential-generation
binding, but the runtime has only one configured secret and cannot resolve an older generation while
a newer generation is active. `historicalGenerationResolution` is therefore false and revocation
readiness is `NOT_PROVABLE`. No P3C2 command calculates revocation eligibility, authorizes
revocation, or executes revocation.

Safe online rotation is unsupported. Rotation is operationally unsafe while any nonterminal,
possible-contact, contacted-recovery, or manual-review case might require the previous credential.
This remains an activation blocker until generation-aware historical credential resolution and a
separately authorized revocation procedure exist. A zero queue, a zero current backlog, or a newly
configured credential does not prove old-generation revocation safety.

Before staging, require a credential owner, authorized provider-side credential creation, an
identified secret manager, known runtime rotation capability, evaluated affected backlog, and a
calculated old-generation revocation deadline. Create the new credential externally, store it only
in the approved secret manager, validate metadata grammar without printing or calling the secret
reader, keep the worker disabled, and do not revoke the old credential.

Switching remains outside P3C2. A future authorized switch must bind new work to the new generation,
retain historical-generation resolution, run a provider-free rehearsal, use a separately authorized
SANDBOX canary, and retain rollback ability.

Old-credential revocation may be considered only when separately authorized durable external
evidence identifies all four parts of the revocation evidence binding: the old credential
generation, the exact latest possible-contact case reference, the authoritative timestamp for that
case's latest possible contact, and the evidence source establishing the generation/case/time
relationship. The case reference must correspond to durable local financial state, and the
generation-bound case evidence is retained as privileged operational material for credential-owner
review. If several cases exist, use the latest qualifying possible-contact case. The 13-day recovery
window plus the 24-hour safety buffer starts only from that generation-bound case timestamp.

A timestamp without a durable case binding is insufficient. A case without credential-generation
binding is insufficient. Failure to establish the generation/case/time evidence binding or to
identify the latest qualifying possible-contact case forbids revocation. Zero current manual or
reconciliation backlog does not substitute for this evidence. The current reconciliation `caseRef`
is not automatically generation-aware, and P3C2 output does not calculate the case or timestamp.
P3C2 does not approve or execute revocation. The same authorized procedure must prove no
nonterminal or manual-review case still requires the generation, complete provider evidence and
local reconciliation, and obtain credential-owner approval. The privileged commands cannot
calculate or prove these facts; their revocation readiness remains `NOT_PROVABLE`. P3C2 creates,
reads, switches, revokes, or deletes no secret.

Generation-bound case evidence must not be emitted as a metric label, sent to public tickets, or
embedded in ordinary monitoring dimensions. It must not be treated as provider truth without
separately authorized provider evidence.

## Unsatisfied activation checklist

Every item below is an activation-evidence requirement and is currently unsatisfied. Repository
capability, one successful local rehearsal, evidence for the exact release candidate in the intended
deployment-like environment, and activation authorization are distinct. Code presence alone does
not check an item, and no deployed-platform evidence exists.

- [ ] scheduler deployment;
- [ ] one-active-invocation and skip-overlap proof;
- [ ] 150-second external hard deadline;
- [ ] monitoring ingestion;
- [ ] alert destination;
- [ ] named refund operations owner;
- [ ] named payment engineering owner;
- [ ] named incident commander;
- [ ] named credential owner;
- [ ] declared staffed window;
- [ ] manual-review acknowledgement procedure;
- [ ] provider-assisted reconciliation authorization;
- [ ] reviewed state-correction mechanism;
- [ ] credential rotation capability;
- [ ] old-generation recovery capability;
- [ ] emergency-stop access;
- [ ] successful P3D rehearsal evidence for the exact release candidate and intended deployment-like environment (the provider-free capability is implemented);
- [ ] separately authorized P3E SANDBOX canary.

This checklist grants no activation authority.

## P3E-A canary design status

P3D provider-free rehearsal and P3E-A non-authorizing evidence readiness are implemented. P3E-B1
repository IaC, provider-free preflight, and distributed admission exist, but no GCP resource,
image, cloud preflight run, provider credential, target, executor, or approval exists. P3E-B2,
P3E-C, and P3E-D remain unauthorized; scheduled SANDBOX and LIVE remain blocked.

`refund_worker_sandbox_canary_platform_v1.md` defines the future manual-only Cloud Run canary,
separate preflight/canary identities, exact `RefundExecutionCommand.id` authority, distributed
admission and sequential-duplicate gates, staffed window, emergency containment, and pure approval
format. It does not create an operator command or deployment. The current state is blocked on all
18 evidence-readiness gates. Gate 16 is durable single-use consumption evidence, independent of
deliberate human approval. These are not executable approval gates, and P3E-A cannot authorize
execution. P3E-B2/P3E-C/P3E-D remain unimplemented and unauthorized until separately reviewed future
phases can verify evidence, issue authority, and durably
consume the bound approval exactly once; the current schema has no approval-consumption ledger.

## P3E authority-model status

P3D and P3E-A are implemented; P3E-A cannot issue executable approval. P3E-B1 repository IaC,
preflight, and admission exist without GCP resources or execution. No trusted evidence issuer,
provider secret, sealed target, executor, or durable single-use consumption ledger exists. P3E-B2,
P3E-C, and P3E-D remain unauthorized.
Scheduled SANDBOX remains blocked and LIVE remains unreachable.
The status remains exact: scheduled SANDBOX remains blocked; LIVE remains unreachable.

## P3E-B1 canonical status

P3D provider-free rehearsal is implemented. P3E-A evidence-readiness contract is implemented.
P3E-A cannot issue executable approval. P3E-B1 repository IaC/admission implementation exists.
No GCP resource has been provisioned. No image has been built or pushed. No cloud preflight has run.
No provider secret exists. No exact target is sealed. No approval is issued. No trusted evidence
producer/verifier exists. No durable single-use consumption ledger exists. P3E-B2 remains
unimplemented and unauthorized. P3E-C remains unimplemented and unauthorized. P3E-D
provider-contact execution remains unimplemented and unauthorized. Scheduled SANDBOX remains blocked and
LIVE remains unreachable.
