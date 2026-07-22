# Refund worker SANDBOX canary platform and approval v1

Status: P3E-A non-authorizing evidence-readiness contract is implemented; execution remains blocked.

P3D provider-free rehearsal is implemented. P3E-A evidence-readiness contract is implemented.
P3E-A cannot issue executable approval. A structurally complete package means only that it is ready
for submission to a future trusted issuer.
At this point no P3E infrastructure exists, no credential has been provisioned, no canary target
exists, and no provider request has occurred. P3E-D remains unimplemented and unauthorized,
scheduled SANDBOX operation remains blocked, and LIVE remains unreachable. This document is a
repository design and approval contract. It is not deployment evidence or execution authority.

## Phase boundary and frozen platform

P3E is divided into separately authorized phases:

- **P3E-A**, this phase, freezes the detailed evidence schema, provenance envelope, cross-binding
  evaluator, gates, and blockers. It cannot issue final approval or consume authority.
- **P3E-B** may later provision provider-free infrastructure and implement/test the PostgreSQL
  job-wide distributed admission boundary. It may not provision a Toss credential or contact a
  provider.
- **P3E-C** may later implement trusted evidence production/verification, exact target and secret
  sealing, approval issuance, and durable atomic single-use consumption. Sealing makes no provider
  request; failure, cancellation, timeout, and ambiguity still consume authority.
- **P3E-D** may later authorize exactly one manual Cloud Run Job execution. It permits no scheduler,
  automatic retry, or second execution before complete resolution.
- **P3F** is the earliest phase that may consider a scheduled SANDBOX pilot. Neither P3E-D success
  nor this contract authorizes it.

The frozen platform is Google Cloud Platform in `asia-northeast3`, using Artifact Registry, Cloud
Run Jobs, Cloud SQL for PostgreSQL, Secret Manager, Cloud Logging, and Cloud Monitoring. The first
canary is manual and one-shot. Cloud Scheduler is excluded because duplicate delivery is possible.
No alternative platform may be substituted without a separate incompatibility finding and design
decision.

## Separate jobs

`refund-sandbox-preflight` is provider-free. It uses the same immutable container image digest as
the canary, a dedicated user-managed `preflight-runtime-sa`, Cloud SQL connectivity, and a distinct
read-only database role. It has no Toss secret binding. It runs readiness, migration, health,
manual, reconciliation, credential-metadata, and rehearsal checks. Provider adapters, provider
HTTP, financial mutation, scheduling, and canary execution are unreachable.

`refund-sandbox-canary` is the future provider-capable job. Its frozen configuration is one
container, one task, parallelism one, zero retries, 150-second Cloud Run task timeout, 120-second
cooperative worker budget, `MANUAL_ONLY`, zero scheduler targets, digest-pinned image, numeric
secret version, and exactly one sealed target. Entrypoint and arguments are fixed without shell
interpolation. Execution overrides are prohibited. The executor cannot override arguments,
environment, task count, parallelism, timeout, image, secret version, or target.

## Authority and identities

Logical human roles are intentionally separate from runtime service accounts:

- `P3E_DEPLOYER` may publish the approved immutable image and configure the two jobs and approved
  identities. It cannot read provider secrets, execute the canary, or mutate canary financial state.
- `P3E_EXECUTOR` may execute only the exact canary job and cancel its current execution. Its
  job-scoped authority is equivalent only to exact job execution and execution cancellation. It
  must not have `run.jobs.runWithOverrides`, Cloud Run Developer/Admin, Jobs Executor With
  Overrides, job update, secret access, Artifact Registry write, database access, IAM modification,
  deployment, or unnecessary service-account impersonation authority.
- `P3E_CREDENTIAL_OWNER` manages the exact SANDBOX secret resource and numeric version and its
  runtime grant. It cannot execute/deploy the job or modify the database.
- `P3E_OBSERVER` reads approved logs and incidents and records evidence. It cannot execute, deploy,
  read secrets, or access financial rows; cancellation requires separately assigned incident
  authority.
- `P3E_INCIDENT_COMMANDER` may cancel, order future invocation authority removal, declare possible
  contact, and require reconciliation. Local state alone never proves provider finality.
- `preflight-runtime-sa` can connect only to the exact sandbox Cloud SQL instance through the
  read-only role and, if required, access only its database connection secret. Toss credentials,
  provider network/adapters, deployment, and IAM APIs are forbidden.
- `canary-runtime-sa` can connect through the narrow canary database role, access only the exact
  Toss SANDBOX generation secret and required database secret, and execute the audited path. It
  cannot deploy, modify IAM, access unrelated/production resources, or use a service-account key.

Deployer, executor, preflight runtime, canary runtime, and credential owner identities must be
distinct. The deployer is not a runtime identity. A scheduler identity must not exist or have
canary authority during P3E.

## Single-operator exception

Operating mode is exactly `DISTINCT_HUMAN_OPERATORS` or `SINGLE_OPERATOR_EXCEPTION`. The exception
does not claim true human separation of duties. It requires separate authenticated GCP principals
for deploy and execute actions, no override permission, no scheduler or retry, exactly one target,
sealed release/job/secret/target bindings, written risk acceptance, a second deliberate approval
after preflight, validity no longer than 60 minutes, removal of invocation authority afterward,
and no second execution until reconciliation is complete. Public approval output states
`ABSENT_SINGLE_OPERATOR_EXCEPTION`, never an equivalent-to-distinct-human claim.

## Secret and database isolation

Each Toss credential generation uses a separate Secret Manager resource and a positive numeric
version. `latest`, LIVE credentials, shared provider secrets, shared LIVE/SANDBOX secrets,
service-account key files, and `GOOGLE_APPLICATION_CREDENTIALS` are forbidden. Approval evidence
records resource identity and version but never the value. Secret identities and generations are
excluded from public process results, metrics, and alert labels.

P3E requires a separate GCP project and separate Cloud SQL PostgreSQL sandbox in
`asia-northeast3`, with no production/development/acceptance data, customer PII, or local-test
identity. It contains the exact migration ledger, required synthetic Market rows, and one synthetic
payment/refund target. `preflight-runtime-sa` uses a distinct read-only role. The canary role is not
superuser, does not own the database, cannot create/drop schema or deploy migrations, and has only
the audited table/sequence privileges. Role reuse is forbidden.

## Immutable release and exact target

Approval binds Git commit SHA, image SHA-256 digest, Artifact Registry repository, source-build
digest, `package-lock.json` digest, and exact migration-inventory digest. The preflight and canary
jobs are separate identities: each has its own bounded UID, approved and observed generation,
approved and observed etag/configuration fingerprint, and job-binding digest. Each approved value
must equal its observation, the job UIDs and job bindings must remain distinct, and both jobs use
the same immutable image digest. Tags and `latest` are insufficient. Any preflight substitution,
image drift, generation/etag drift, secret generation drift, or approval binding drift blocks
evidence readiness.

The narrowest authoritative target is `RefundExecutionCommand.id`. The selector emits it as
`commandId`; lease, authorization, contact, and recovery accept that exact authority. The schema
uniquely binds each command to one `RefundAttempt`, whose payment, amount, currency, provider,
mode, operation key, and durable transitions provide the coherent financial binding.
`RefundAttempt.id` alone is not the worker-routing authority.

The future sealed record contains exactly one synthetic TOSS/SANDBOX command binding, expected
amount and currency, `READY` command/eligible financial state, provider SANDBOX payment evidence,
and one operation limit. Broad selector batches, “next eligible,” wildcard, provider-wide retry,
arbitrary runtime substitution, customer/production data, and LIVE are forbidden. The target is
restricted approval evidence and is never committed or emitted publicly.

## Concurrent admission and sequential duplicate safety

Cloud Run task count and parallelism do not prevent overlap between executions. Before secret read,
adapter construction, provider lookup, or cancellation, the provider-capable path requires a
PostgreSQL nonblocking advisory lock under a dedicated lock authority and connection held for the
entire execution. Failure maps to bounded `OVERLAP_SKIPPED`, with zero secret read, provider call,
or financial mutation beyond approved admission evidence. Local memory/filesystem locks and
list-then-run checks are insufficient. Concurrent proof counts are nonnegative safe integers and
must reconcile exactly: invocation count equals one winner plus at least one loser.

The repository already routes by exact command, takes ownership-row locks, uses lease generation
and token fences, permits one durable dispatch ordinal per command, CAS-advances dispatch state,
stores immutable provider-operation/request bindings, marks `CONTACT_MAY_HAVE_OCCURRED` before
cancellation, and routes unknown outcomes to evidence/recovery rather than blind retry. These are
the sequential financial protections that a P3E proof must exercise for the sealed target.
They are not a job-wide admission lock.

Approval independently requires proof that a concurrent duplicate loses admission before secret
or provider access and that a sequential duplicate cannot perform a second provider action. Unknown
prior outcome is possible contact and must be reconciled. Overlap proof alone never establishes
sequential safety.

## Observation, staffing, and incident control

Cloud Run execution logs, retained Cloud Logging evidence, Cloud Monitoring incident policy, and
alerts are required for every bounded failure, task timeout/failure, missing final result, possible
contact, manual review, overlap skip, and credential/configuration failure. At least two delivery
channels must be tested: email and an independent secondary channel. Case/payment/customer/provider
operation IDs, secret identity/generation, and database identity are forbidden labels.

Owners must be assigned and reachable. Execution is attended, with preflight within 30 minutes,
continuous execution observation, and at least 60 minutes afterward. No second canary, concurrent
refund maintenance/migration, or credential rotation occurs in that window. Canary response targets
are five minutes to acknowledge critical alert, ten minutes to start investigation, and thirty
minutes to form a possible-contact disposition plan; these are not general production SLAs.

Emergency authority must cancel the execution, remove future invocation authority, remove runtime
secret access only after the process is fully stopped, preserve logs/database evidence, and run
provider-free health/manual/reconciliation observations. Cancellation or timeout after possible
contact remains possible contact. Removing GCP access does not prove provider credential revocation;
revocation remains governed by generation/contact evidence.

After any outcome there is no automatic second execution. Invocation authority is removed, the
scheduler remains absent, job configuration is retained read-only, execution/release/secret version
evidence is recorded, runtime secret access is removed after safe termination, and logs plus local
manual/reconciliation snapshots are retained. Possible contact blocks another canary and requires
provider-assisted reconciliation under separate authority; local correction requires separate
reviewed authority.

## Success and kill conditions

Success requires one approved execution/task, exact release/job/secret/target binding, one lock
acquisition, exactly one provider operation attempt, bounded known Toss SANDBOX outcome, coherent
durable state, no ambiguity/manual/reconciliation residue/timeout/overlap/alert-delivery failure,
complete evidence, and invocation-authority removal. It does not approve scheduling, batching,
retry, LIVE, or credential revocation.

Any immutable-identity drift, tag-only image, `latest` secret, LIVE endpoint/credential, scheduler,
retry, wrong timeout/task/parallelism, override authority, shared/default identity, service-account
key, database/target mismatch, nonsynthetic or multiple target, unrelated backlog, missing admission
or sequential proof, untested alert channel, missing owner/window/emergency/reconciliation authority,
expired approval, or unresolved previous canary blocks approval. No generic waiver converts a failed
technical safety gate into approval.

## Machine-readable evidence readiness and present state

The pure format is `mira-refund-sandbox-canary-approval/v1`. Decisions are exactly
`SANDBOX_CANARY_APPROVAL_BLOCKED` or
`SANDBOX_CANARY_EVIDENCE_READY_FOR_TRUSTED_ISSUER`. Every result reports
`executionAuthorization: NOT_ISSUED`, `provenanceTrust: NOT_VERIFIED_BY_PURE_EVALUATOR`, scheduled
and LIVE operation `BLOCKED`, intended execution limit one, and trigger `MANUAL_ONLY`. An empty
blocker list means evidence readiness, never approval. The exact canonical gate identifiers are:

1. `RELEASE_IMMUTABILITY_VERIFIED`
2. `ISOLATED_GCP_ENVIRONMENT_VERIFIED`
3. `CLOUD_RUN_JOB_CONFIGURATION_VERIFIED`
4. `MANUAL_ONLY_NO_SCHEDULER_VERIFIED`
5. `NO_EXECUTION_OVERRIDES_VERIFIED`
6. `IAM_SEPARATION_VERIFIED`
7. `PINNED_SANDBOX_SECRET_VERIFIED`
8. `ISOLATED_DATABASE_AND_TARGET_VERIFIED`
9. `CONCURRENT_ADMISSION_VERIFIED`
10. `SEQUENTIAL_DUPLICATE_SAFETY_VERIFIED`
11. `OBSERVABILITY_VERIFIED`
12. `ALERT_DELIVERY_VERIFIED`
13. `STAFFED_WINDOW_VERIFIED`
14. `EMERGENCY_STOP_VERIFIED`
15. `PROVIDER_FREE_PREFLIGHT_VERIFIED`
16. `DURABLE_SINGLE_USE_APPROVAL_CONSUMPTION_VERIFIED`
17. `EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED`
18. `POST_EXECUTION_CONTAINMENT_VERIFIED`

All are required; there is no `WAIVED`. Structurally invalid evidence has only
`APPROVAL_EVIDENCE_INVALID`. The contract performs no I/O, environment, filesystem, database,
secret, cloud, network, or mutation operation. It validates exact descriptor-safe plain objects,
uses injected authoritative epoch time, limits validity to 60 minutes, and excludes target, secret,
principal, project, database, image-repository, provider-operation, and raw evidence from output.

No current production caller reaches the contract; tests are its only caller in P3E-A. A future
separately audited P3E component must durably consume an approval exactly once before execution and
atomically bind that consumption to the exact release/job/secret/target. The current schema has no
approval-consumption ledger, so it cannot enforce single use. P3E-B/P3E-C remain blocked on that
implementation decision; P3E-A adds no migration.

The repository-grounded current decision is `SANDBOX_CANARY_APPROVAL_BLOCKED` with all 18 gates:
there is no GCP project, Cloud Run job, Cloud SQL sandbox, runtime identity, pinned secret, cloud
preflight, distributed-admission proof, tested alert delivery, staffed assignment, sealed target, or
explicit execution approval. No evidence is fabricated.

## Evaluator, verifier, and issuer trust boundary

The P3E-A evaluator validates exact descriptor-safe structure, canonical unique source records,
SHA-256 references, internal consistency, cross-binding equality, required facts, injected-time
boundaries, and canonical gates/blockers. It cannot independently establish that GCP, IAM, secret,
alert, target, implementation, or consumption evidence is authentic. It cannot issue or consume
execution authority.

The restricted provenance envelope includes evidence format, producer/version, bundle identity and
digest, issued time, canonical source records, subject binding, and
`TRUSTED_ISSUER_MUST_REVERIFY`. Source records cover build, artifact, Cloud Run, IAM, Cloud SQL,
secret, admission, duplicate safety, alert delivery, staffing, preflight, emergency stop,
explicit single-execution approval, containment, and single-use consumption. Preflight evidence
binds the exact preflight UID, generation, etag, image, release, migration inventory, completion
time, and provenance record. Explicit approval binds that evidence and both job bindings, has its
own canonical provenance source, and must occur strictly after preflight completion. Restricted
identifiers never enter the public result.

A future trusted producer/verifier must gather authoritative records, authenticate provenance,
verify signatures, attestations, receipts, or equivalent records, and seal the exact bundle. A
future P3E-C issuer must independently reverify it, persist all release/job/image/secret/target
bindings, issue single-use authority, and atomically consume it before provider-capable execution
and secret read. Synthetic test fixtures are hypothetical schema examples, not operational evidence.

Detailed target evidence cross-binds command, refund attempt, payment, operation binding,
TOSS/SANDBOX, amount/currency, durable states, exact selector, synthetic/no-PII facts, and one
operation. Detailed admission evidence records the implemented/tested mechanism, lock authority and
key derivation, exact acquisition ordering, loser counters, and release/job/target bindings.
Sequential evidence records lease fences, ordinal/CAS, pre-contact marker, immutable operation and
idempotency bindings, recovery classification, possible-contact handling, and zero second action.
Summary proof booleans and caller-supplied gate arrays have no readiness authority.

Malformed evidence is inspected through a fail-closed reflection boundary. Proxies, including
revoked proxies, accessors, symbols, inherited fields, sparse arrays, holes, extra fields, and
noncanonical source arrays yield only `APPROVAL_EVIDENCE_INVALID`; accessors are not invoked and no
exception detail enters the result.

Durable consumption is its own gate. The future record requires PostgreSQL atomic CAS before
provider-capable start and secret read, exact approval/release/job/image/secret/target bindings,
rejection of second use, and persistence across success, failure, cancellation, timeout, and
ambiguity. Human approval and durable consumption are independent; neither substitutes for the
other.

## Canonical phase-status statement

P3D provider-free rehearsal is implemented. P3E-A evidence-readiness contract is implemented.
P3E-A cannot issue executable approval; no trusted evidence producer/verifier exists; no GCP
infrastructure exists; no distributed admission implementation exists; no durable single-use
consumption ledger exists. P3E-B remains unimplemented and unauthorized. P3E-C remains unimplemented
and unauthorized. P3E-D provider-contact execution remains unimplemented and unauthorized.
Scheduled SANDBOX remains blocked and LIVE remains unreachable.
The status remains exact: scheduled SANDBOX remains blocked; LIVE remains unreachable.
