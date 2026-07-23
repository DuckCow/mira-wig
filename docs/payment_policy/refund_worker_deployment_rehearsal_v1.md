# Refund worker deployment rehearsal v1

P3D capability is implemented provider-free. P3E-B1 does not change this local-only boundary.
P3D never acquires the production provider-
contact admission lock and cannot invoke the cloud-capable provider-free preflight. The preflight is
a separate exact command and still cannot authorize provider execution.
Actual deployment evidence remains absent, and activation remains `BLOCKED`.

Status: implemented provider-free rehearsal; activation blocked.

This contract amends, and does not replace, `refund_worker_host_v1.md`,
`refund_worker_lifecycle_v1.md`, `refund_worker_observability_v1.md`, and
`refund_worker_operations_runbook_v1.md`. It defines a local disposable rehearsal. It deploys no
scheduler or infrastructure and grants no provider-execution or activation authority.

## Command and environment

The exact no-argument command is:

```text
npm run refund:worker:rehearse
```

It accepts only a PostgreSQL `DATABASE_URL` whose host is `localhost`, `127.0.0.1`, or `::1` and
whose database name is exactly `wig_platform_test`. It rejects missing, malformed, remote,
development, production, and acceptance database URLs before child spawn or database access. Every
nonblank variable under `REFUND_EXECUTION_`, `CUSTOMER_REFUND_`, `TOSS_`,
`NEXT_PUBLIC_TOSS_`, `PAYPAL_`, `NEXT_PUBLIC_PAYPAL_`, `PAYMENT_`, or
`MIRA_TOSS_SANDBOX_ACCEPTANCE_` is forbidden, including unknown keys in those families. Absent and
blank or whitespace-only values are treated as inactive/absent, consistently with the activation
and credential grammar. The command does not load `.env`, `.env.local`, or `.env.test`.

Each child receives a new explicit environment containing only the proven disposable
`DATABASE_URL` and the fixed `NODE_ENV=test`. The parent environment is never forwarded wholesale.
No secret is read, validated, emitted, or passed to a child.

## Finite command matrix

The rehearsal sequentially invokes the exact committed entrypoints without a shell, retry, or
recurrence:

1. worker `check` → `CHECK_READY`;
2. worker `health` → `HEALTH_SNAPSHOT` with every route false and every backlog zero;
3. operations `manual` → empty `MANUAL_REVIEW_QUEUE`;
4. operations `reconcile` → empty `RECONCILIATION_SNAPSHOT`;
5. operations `credential` → `CREDENTIAL_LIFECYCLE_CHECK`, `ABSENT`, `NOT_PERFORMED`,
   `SINGLE_ACTIVE_ONLY`, no historical resolution, and `NOT_PROVABLE`;
6. worker `run-once` with fixed low-cardinality rehearsal labels → `FEATURE_DISABLED`.

Any nonzero health backlog stops the matrix immediately after check and health. Manual, reconcile,
credential, and disabled run-once are skipped. The bounded result is `HEALTH/UNSAFE_BACKLOG`; no
`caseRef` or raw child output enters it.
The disabled run-once proves invocation wiring only. It creates no lifecycle, database, adapter,
selector, provider port, or fetch and does not execute an enabled cycle.

## Child supervision and output

One child runs at a time. Standard output and standard error are independently bounded to 32 KiB.
The supervisor requires exactly one UTF-8 JSON line on the expected channel, an empty opposite
channel, the exact exit, process format, command, and result code. Extra lines, NUL, malformed UTF-8
or JSON, overflow, wrong channel, spawn failure, signal exit, unexpected exit, and missing output
become a static stage/reason failure. Raw child output, paths, arguments, signals, PIDs, database
identity, provider data, exceptions, and case references never enter the rehearsal result.

Read-only children have a 30-second rehearsal deadline. The disabled one-shot child uses the frozen
150,000 ms contract value. A deadline kills and awaits the child. This protects only the local
rehearsal; it does not prove that a deployment platform enforces the production deadline.

## Result and evidence

Normal output is one `mira-refund-deployment-rehearsal/v1` JSON line. Successful rehearsal returns
`PROVIDER_FREE_DEPLOYMENT_REHEARSAL_COMPLETE`, exit zero, `activation: BLOCKED`,
`providerExecution: NOT_PERFORMED`, nine bounded checks, and the exact ten-item unresolved blocker list.
Exit zero proves only that one local provider-free rehearsal invocation completed. Repository
capability, a successful local result, release-specific/deployment-specific evidence, and activation
authorization are four distinct states. Neither code presence nor a local success supplies immutable
release packaging, deployed-platform evidence, provider-execution authority, or activation authority.
Observation, canonicalization, clock, or serialization failure emits only
`{"ok":false,"code":"SYSTEMIC_FAILURE"}` on stderr with exit 1. Writer failure causes no second
write or fallback attempt.

Proven locally:

- committed entrypoints can be invoked with a stripped environment;
- disposable database and migration readiness can be checked;
- zero-backlog health, manual, and reconciliation readers remain provider-free and read-only;
- credential observation is metadata-only;
- run-once is disabled;
- bounded output parsing and external exit classification work;
- overlap and timeout policies have local simulations.

The emitted ten-item list is the exact low-cardinality activation-blocker contract. It does not
claim to encode every deployment-evidence limitation. Its ten blockers are:

- `SCHEDULER_DEPLOYMENT_NOT_PROVEN`;
- `OVERLAP_SKIP_NOT_PROVEN`;
- `EXTERNAL_HARD_DEADLINE_NOT_PROVEN`;
- `MONITORING_INGESTION_NOT_PROVEN`;
- `ALERT_DESTINATION_NOT_PROVEN`;
- `OPERATIONS_OWNERSHIP_NOT_PROVEN`;
- `MANUAL_RESOLUTION_AUTHORITY_NOT_PROVEN`;
- `PROVIDER_RECONCILIATION_AUTHORITY_NOT_PROVEN`;
- `HISTORICAL_CREDENTIAL_RESOLUTION_UNSUPPORTED`;
- `P3E_SANDBOX_CANARY_NOT_AUTHORIZED`.

Separately, immutable release packaging, production working-directory/module resolution, and the
actual platform launch environment are not proven and are intentionally not blocker-enum values.
Omission from the ten-item result does not mean those facts are proven.

## External exit and backoff policy

`CYCLE_COMPLETE/0` advances to the next cadence and resets the systemic sequence.
`OVERLAP_SKIPPED/0` is a nonprocessing skip and never resets processing success or requests backoff.
`FEATURE_DISABLED/0` means disabled with no processing success. `LIFECYCLE_DRAINED/75` prevents
overlap. Invocation defects suspend on 64; readiness defects suspend on 78; database or systemic
exit 1 uses external jittered backoff of 1, 2, 4, 8, then at most 15 minutes. External timeout/124
stops admission and requires possible-contact reconciliation. Signal termination or missing or
malformed output requires investigation. P3D implements no sleeping, retry, cadence, or persisted
scheduler state.

## Overlap and hard-deadline simulations

The pure overlap simulation admits exactly one injected invocation for `ACQUIRED`. `BUSY` returns
`OVERLAP_SKIPPED` with no invocation, queue, delayed retry, database action, or provider action. It
returns `INVALID_ADMISSION_STATE` without invocation for every other value. It
implements no platform, cross-process, filesystem, or database lock. Therefore
`OVERLAP_SKIP_NOT_PROVEN` remains a blocker.

P3E-B1 separately adds and locally proves the real PostgreSQL session admission used by the dormant
host. P3D itself still does not acquire it, and no deployed-project evidence exists, so P3D's
release-specific `OVERLAP_SKIP_NOT_PROVEN` blocker remains honest.

The test-only timeout simulation starts a provider-free child, fires a shortened injected deadline,
kills it, awaits close, and maps external timeout to `STOP_AND_RECONCILE_POSSIBLE_CONTACT`. It is not
a deployed hard deadline, so `EXTERNAL_HARD_DEADLINE_NOT_PROVEN` remains a blocker.

## Emergency-stop rehearsal

The provider-free sequence is: keep the worker master disabled; conceptually stop future scheduler
admission; start no enabled worker; run check, health, manual, reconcile, and credential; confirm no
backlog or provider environment; and preserve activation as blocked. Repository code does not
disable an external scheduler and this rehearsal does not manipulate a deployment environment.

## Rollback rehearsal

A future operator identifies the previous audited commit externally, stops scheduler admission,
ensures no worker child remains, preserves schema compatibility, and never rolls migrations back
automatically. After an externally executed code rollback, readiness and health are rerun. Durable
local contact and evidence state is retained. Any terminated provider-capable process is treated as
possible contact, and provider actions remain disabled until reconciliation. P3D performs no Git,
deployment, migration, database-state, credential, or provider rollback.

## P3E gate

P3D capability and P3E-A non-authorizing evidence readiness are implemented. P3E-B1 repository IaC,
provider-free preflight, and distributed admission exist, but no GCP resource, image, cloud preflight
run, provider credential, target, executor, or approval exists. P3E-B2, P3E-C, and P3E-D remain
unauthorized. Scheduled SANDBOX and LIVE remain blocked; activation remains `BLOCKED`.

The frozen P3E-A design is documented in `refund_worker_sandbox_canary_platform_v1.md`. It selects a
manual-only Cloud Run Job contract and deliberately excludes Cloud Scheduler from the first canary.
P3E-B2, P3E-C, and P3E-D each require separate authorization. P3D success or a pure P3E-A
approval evaluation does not create platform evidence or authorize a provider request.
P3D success alone does not authorize P3E.

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

## P3E-B2-R1B foundation status

R1B retires the unapplied mixed B1 Terraform root and defines separate repository-only
service-activation, provider-free foundation, and unbound non-executing deployer-role authorities.
Runtime identities, IAM, Jobs, images, database secrets/bootstrap, observability, and invocation
remain deferred. This changes no P3D rehearsal behavior and supplies no cloud or provider evidence.
Scheduled SANDBOX remains blocked and LIVE remains unreachable.
