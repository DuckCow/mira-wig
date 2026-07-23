# Refund worker P3E-B provider-free infrastructure v1

Status: P3E-B1 repository implementation exists; no cloud provisioning or execution is authorized.

P3E-A is committed as a non-authorizing evidence-readiness contract. This P3E-B1 change adds only
repository IaC, a provider-free preflight capability, and a PostgreSQL distributed-admission
boundary. No GCP resource has been provisioned, no image has been built or pushed, no cloud
preflight has run, no provider secret exists, no exact target is sealed, and no executable approval
has been issued. P3E-B2, P3E-C, and P3E-D remain separately unauthorized. Scheduled SANDBOX remains
blocked and LIVE remains unreachable.

## B1/B2 boundary

P3E-B1 owns `infra/refund-sandbox/p3e-b/` and provider-free repository tests. It must not run gcloud,
inspect a project, configure a backend, plan against a real provider, apply/destroy infrastructure,
build/push an image, create a secret version, execute Cloud Run, or access Cloud SQL. Terraform may
only initialize the exact pinned registry provider for local validation when a Terraform binary and
registry access are available.

P3E-B2 may only be separately authorized to select/create the dedicated project, configure the
backend, apply provider-free resources, create the two database credentials and numeric secret
versions, publish one audited digest, and execute only the provider-free preflight. It still may not
create a Toss secret, seal a target, grant canary execution, or contact a provider.

## Frozen infrastructure

Terraform core is constrained to `>= 1.7.0, < 2.0.0`; the HashiCorp Google provider is exact-pinned
to `7.40.0`; the GCS backend is partial and has no bucket. The project, project number, resource
prefix, immutable `@sha256:` image URI, PostgreSQL major/tier, and two positive numeric database
secret versions are required inputs with no real defaults. Region is exactly `asia-northeast3`.

The local audited database is PostgreSQL 18.4. Cloud SQL PostgreSQL 18 is in regular support, so the
IaC accepts exactly major 18 rather than a floating newest default. The instance is explicitly
zonal, Enterprise, private-IP-only, deletion-protected at both Terraform and API layers, backed up
with PITR and seven days of transaction logs, and has Data API access disabled. There is no public
IPv4, authorized network, application superuser, runtime ownership, runtime migration authority, or
password in Terraform state.

The custom VPC uses a regional subnet, private service access, and Direct VPC egress. The two jobs
carry the `refund-provider-free` network tag. Egress permits only TCP 5432 to the private-service
range and denies all other IPv4 destinations. There is no Cloud NAT, default network, Serverless VPC
Access connector, or provider/public-internet path. Application blocking is not treated as a
substitute for this network isolation. P3E-C must separately design provider egress.

Artifact Registry has one regional Docker repository, immutable tags, `prevent_destroy`, no cleanup
policy, no public access, and no broad writer grant. The jobs consume only the supplied digest URI;
B1 builds or pushes nothing.

## Jobs, identities, secrets, and invocation

`refund-sandbox-preflight` and `refund-sandbox-canary` are distinct Cloud Run v2 Job definitions.
Both have one container, task count one, parallelism one, zero retries, a 150-second task timeout,
the same digest, Direct VPC `ALL_TRAFFIC`, and the private Cloud SQL attachment.

The preflight job uses its own service account and its own database URL secret container. Its fixed
entrypoint has no arguments. The canary job uses a different service account and database secret,
the existing run-once command, fixed inert labels, the repository's 120-second cooperative budget,
an empty master flag, and every route capability empty. It has no Toss/PayPal/provider secret,
target, approval, scheduler, override, or executor IAM binding; its only valid B1 worker result is
`FEATURE_DISABLED`. P3E-C must produce a new audited job generation before provider-capable use.

The service accounts are user-managed and keyless. Each receives only project-level Cloud SQL
Client and minimal log-writer roles plus accessor on its own database secret. Neither can read the
other database secret. There is no default Compute identity, service-account key,
`GOOGLE_APPLICATION_CREDENTIALS`, job executor/developer/admin grant, wildcard member, scheduler
identity, provider secret, or secret version resource.

`database_roles.sql` is an idempotent, non-executing reviewed manifest. The preflight role has only
CONNECT, schema USAGE, and SELECT on the migration ledger plus the exact health/manual/reconciliation
tables. The canary role's SELECT/UPDATE/INSERT list is derived table-by-table from selector, lease,
authorization, contact-marker, provider-observation application, result persistence, and recovery.
Neither role can delete/truncate, use sequences, create schema/database/roles, deploy migrations, or
own the database. B2 must re-review the manifest against the exact image before execution.

The manifest's table grants are justified by the current call graph as follows; an omitted access
mode is forbidden, and the manifest grants no table outside this inventory.

| Table | Preflight access and reason | Dormant-canary access and reason |
|---|---|---|
| `_prisma_migrations` | SELECT for exact migration-ledger readiness | SELECT for host migration readiness |
| `Payment` | none | SELECT for selector payment/provider/mode coherence |
| `Order` | SELECT for health/manual/reconciliation observations | SELECT and UPDATE for selection plus durable refund/order-state application |
| `RefundAttempt` | SELECT for all read-only backlog/operations observations | SELECT and UPDATE for selection, lease state, outcome, and recovery classification |
| `RefundAttemptTransition` | none | SELECT and INSERT for transition history and existing-state inspection |
| `RefundExecutionCommand` | SELECT for health/manual/reconciliation observations | SELECT and UPDATE for selector, lease, and durable command result |
| `RefundExecutionCommandEvent` | none | SELECT and INSERT for command-event evidence |
| `RefundExecutionDispatchAttempt` | SELECT for health/manual/reconciliation observations | SELECT, UPDATE, and INSERT for dispatch lease and attempt lifecycle |
| `RefundExecutionProviderOperationBinding` | SELECT for reconciliation observation | SELECT and INSERT for one provider-operation binding |
| `RefundExecutionProviderEligibilityProof` | SELECT for reconciliation observation | SELECT and INSERT for authorization eligibility proof |
| `RefundExecutionProviderContactEligibilityProof` | SELECT for reconciliation observation | SELECT and INSERT for immediate pre-contact proof |
| `RefundExecutionEvidence` | none | SELECT and INSERT for bounded durable execution evidence |

The session advisory lock needs no table grant. Neither runtime role receives sequence privileges,
so every permitted insert must continue to use application-supplied identifiers. Any call-graph or
identifier-generation change requires a new privilege audit before B2 applies this manifest.

## Distributed provider-contact admission

The authority is `mira-refund-provider-contact-admission/v1` with frozen signed-int32 tuple
`(1296646721, 1380336385)`. It uses PostgreSQL
`pg_try_advisory_lock(integer, integer)` on one dedicated `pg.Client`. The only other repository
advisory authority is the acceptance harness's single-bigint H1 lock; PostgreSQL's two-int key space
is distinct, and no other repository two-int authority exists. There is no pool, blocking lock,
transaction-level lock, `hashtext()`, target-derived key, or nested acquisition.

The enabled one-shot host parses bounded configuration, proves configured provider-capable
run-once, completes harmless database connectivity and exact migration comparison, then opens the
dedicated admission session. Only an acquired session may construct adapters or enter the cycle.
That placement precedes selector reads, leases, financial mutation, opaque secret read, lookup,
cancellation, and provider request. `check`, `health`, operations, P3D rehearsal, and P3E-A do not
acquire the production lock. The provider-free preflight alone uses the same module for a no-op
two-session probe.

A loser returns exact `OVERLAP_SKIPPED`, exit 0, and the external action
`OVERLAP_NO_PROCESSING`. It is neither `CYCLE_COMPLETE` nor `LIFECYCLE_DRAINED`, resets no processing
success, asks for no retry/backoff, and admits zero selector, lease, mutation, secret, adapter,
lookup, cancellation, or provider activity.

The winner holds the same session through the complete protected result and durable handling.
Unlock occurs once in finally-equivalent cleanup and client close is awaited. Pre-operation
connection or acquisition failure is provider-free `DATABASE_UNAVAILABLE`. Cleanup failure
preserves an existing primary cycle failure; a previously clean/drained cycle becomes bounded
`SYSTEMIC_FAILURE` with its performed counters, never false clean success. Session termination is
the final lock-release guarantee; real local tests prove abrupt disconnect allows immediate
acquisition without polling.

## Provider-free preflight

The only package command is `refund:sandbox:preflight`. Importing its direct-entry script performs
no environment, database, timer/listener, process, or output action. Direct execution accepts no
arguments. Its process format is `mira-refund-sandbox-provider-free-preflight/v1`; success is
`PROVIDER_FREE_SANDBOX_PREFLIGHT_COMPLETE`. Every normal result states activation blocked, provider
execution not performed, no provider credential, no executor/scheduler, and no runtime claim that
cloud provisioning was verified. The only systemic fallback is
`{"ok":false,"code":"SYSTEMIC_FAILURE"}` plus one LF.

The future-cloud guard requires exact `P3E_PROVIDER_FREE_PREFLIGHT` mode, a Cloud SQL Unix-socket
URL in `asia-northeast3`, a non-production/non-development/non-acceptance/non-test database, and
blank/absent activation, provider credential, provider base URL, Google credential, acceptance,
target, approval, and secret-generation inputs. It uses descriptor-safe inspection and does not
claim socket text authenticates a project or instance.

The runner checks connectivity, PostgreSQL major 18, migrations, disabled worker/route readiness,
four zero health backlogs, empty manual and reconciliation observations, credential metadata
`ABSENT`/`NOT_PERFORMED`, and one production-lock winner plus one loser using independent sessions.
The winning protected operation is a no-op. A pre-existing busy lock fails boundedly without wait or
interference. The runtime imports no provider adapter, opaque secret reader, worker cycle, selector,
financial mutation, web route, scheduler, queue, or daemon. Success is application/database evidence
only, never Cloud Run/IAM/image/alert/project authenticity evidence.

## Observability and remaining gates

`logging_monitoring.tf` records exact future low-cardinality ownership for execution failure, task
timeout, missing final result, overlap skip, preflight failure, and configuration failure. B1 creates
no policy or notification channel. `alert_policies_enabled` is fixed false and channel names are
fixed empty. P3E-A `OBSERVABILITY_VERIFIED` and `ALERT_DELIVERY_VERIFIED` remain blocked until B2/C
collect trusted configuration and tested delivery evidence without sensitive labels.

Repository tests freeze variable failures, resource inventory, no-NAT/public-IP/scheduler/provider
secret/executor rules, job shape, disabled activation, exact database grants, reachability, and the
real local admission behavior. Terraform `fmt`, `init -backend=false`, `validate`, and mock
`terraform test` remain required whenever Terraform is available. Unavailable tooling is a missing
validation gate, never an inferred pass.

## Handoff, rollback, and destruction

P3E-C still owns authenticated evidence, exact release/job/image/secret/target sealing, durable
single-use approval issuance/consumption, provider egress, and any provider credential. P3E-D still
owns one separately authorized attended provider-contact execution. P3F is the earliest scheduled
SANDBOX phase.

The IaC uses deletion protection and `prevent_destroy`. Removing either, destroying the project,
database, repository, jobs, secrets, or evidence, or changing admission granularity requires a
separate reviewed rollback/destruction authorization. Do not use `terraform destroy`, remote-state
mutation, console edits, broad IAM, or a second lock key as recovery. Disable/removal actions must
preserve possible-contact classification and evidence; no local cleanup proves provider finality.

Canonical status: P3E-A is committed and non-authorizing. P3E-B1 repository IaC/admission/preflight
implementation exists. No GCP resource, image, cloud preflight, provider secret, sealed target, or
approval exists. P3E-B2, P3E-C, and P3E-D remain unauthorized. Scheduled SANDBOX and LIVE remain
blocked.

## P3E-B2-R1A repository authority amendment

The P3E-B2 feasibility review found that this monolithic B1 root is not an empty-project apply
sequence. R1A defines only separate state-bucket and universal Job-execution-deny authorities under
`infra/refund-sandbox/p3e-b2/`; it does not alter or make this root applicable. No state bucket or
deny policy exists because of those definitions. R1B must split the actual foundation graph, and
later packages must resolve image, private database connectivity, database bootstrap, secret
versions, runtime definitions, and invocation authority. Scheduled SANDBOX remains blocked and LIVE
remains unreachable.
