# Refund worker one-shot host v1

Status: implemented but dormant.

This contract adds a host-neutral, one-shot process boundary for the existing TOSS/SANDBOX refund
worker. The intended architecture is an external scheduler invoking one process for one bounded
cycle. This document creates no scheduler and grants no activation authority.

The cooperative lifecycle amendment is
`docs/payment_policy/refund_worker_lifecycle_v1.md`. Enabled `run-once` now supports SIGTERM/SIGINT
cooperative drain and one 120-second cooperative budget; that amendment does not change this
document's startup, migration-readiness, safe-output, or dormant-authority rules.
The additive process-observation and read-only health contract is
`docs/payment_policy/refund_worker_observability_v1.md`.
Provider-free privileged operations observations and their still-unsatisfied operating gates are
defined in `docs/payment_policy/refund_worker_operations_runbook_v1.md`.

## Commands

- `npm run refund:worker:check` performs read-only configuration, database-connectivity, and Prisma
  migration-ledger readiness checks. It never selects refund commands, constructs provider
  adapters, invokes the worker cycle, or deploys migrations.
- `npm run refund:worker:health` performs the same readiness checks and one aggregate, read-only
  business-table snapshot. It creates no lifecycle, adapters, selector reservation, cycle, lease,
  provider-port invocation, or network request and is permitted while the master flag is disabled.
- `npm run refund:worker:once -- --service <label> --revision <label> --slot <label>` constructs the
  internal owner `refund-sbx:<service>:<revision>:<slot>` and may run at most one existing bounded
  worker cycle after every readiness boundary passes.

The separate `refund:ops:manual`, `refund:ops:reconcile`, and `refund:ops:credential` commands use
their own exact process contract. They do not extend the worker command enum, grant activation,
perform provider reconciliation, resolve manual review, or rotate credentials. Their privileged
case reference is exactly the durable refund-attempt identifier and never enters worker health or
worker process metadata; a bounded reconciliation list retains a complete distinct `caseCount`.

The three labels use only `[A-Za-z0-9._-]` and are each 1–64 characters. The owner and its labels
never appear in output.

The script does not load `.env`, `.env.local`, or any test environment file. Its process environment
must be supplied explicitly by the deployment shell or a future authorized external scheduler.
Importing the script is inert; only direct main-module execution enters the process wrapper.

## Startup ordering

For `run-once`, the worker master flag is inspected before database construction, activation
inventory validation, credential parsing, migration reads, provider-adapter construction, selector
access, or business work. An absent/blank master returns the healthy `FEATURE_DISABLED` result. A
malformed master returns `CONFIG_INVALID`. The existing cycle-level master gate remains in place as
defense in depth.

After the early gate, the host validates all committed refund-execution activation flags and uses
the existing SANDBOX credential parser. It reports only `ABSENT`, `CONFIGURED`, or the static
`CONFIG_INVALID` failure. No secret, binding label, authorization value, database identity, worker
owner, financial identifier, provider identifier, or raw diagnostic may enter output.

The one-shot host owns a fresh Prisma client and disconnects it after success and failure. Its
migration check reads the ordered, module-relative `prisma/migrations/*/migration.sql` inventory, computes
Prisma-compatible SHA-256 checksums, reads `_prisma_migrations`, and requires an exact completed,
non-rolled-back match. It never runs `prisma migrate deploy`, mutates the migration ledger, or claims
to prove full target-schema drift, constraints, or representative query plans.
This is strict fixed deployed-tree authority: it does not invoke Git and does not independently prove
that the files are Git-tracked.

The checker requires exactly one completed ledger row per committed migration name. Duplicate
historical attempts—including a rolled-back attempt followed by a successful retry with the same
migration name—are conservatively `MIGRATIONS_NOT_READY`. This classification does not assert
database corruption; it requires protected human or release review before worker execution. The
checker never invokes `prisma migrate resolve`, `prisma migrate deploy`, or any schema or ledger
mutation. Database connectivity or ledger-read failures are `DATABASE_UNAVAILABLE`; a successfully
read but mismatched inventory and ledger are `MIGRATIONS_NOT_READY`; unexpected host/inventory or
comparison failures are `SYSTEMIC_FAILURE`.

The existing Toss lookup and cancellation adapters are constructed only after CLI validation,
master activation, full activation grammar, configured SANDBOX credentials, database connectivity,
and migration readiness. Adapter construction itself performs no network request.

## Safe process results

Under normal writers, the process writes one JSON line. It serializes a sanitized result completely
before making at most one output-write attempt. If serialization fails before writing, it attempts
one static `SYSTEMIC_FAILURE` line on stderr. If the selected writer throws before or after a partial
write, the process returns exit 1 without a fallback write, channel switch, raw error, or stack trace;
partial external writes cannot be undone.

| Code | Exit |
|---|---:|
| `CHECK_READY` | 0 |
| `HEALTH_SNAPSHOT` | 0 |
| `FEATURE_DISABLED` | 0 |
| `CYCLE_COMPLETE` | 0 |
| `LIFECYCLE_DRAINED` | 75 |
| `INVALID_HOST_INPUT` | 64 |
| `INVALID_WORKER_OWNER` | 64 |
| `CONFIG_INVALID` | 78 |
| `MIGRATIONS_NOT_READY` | 78 |
| `DATABASE_UNAVAILABLE` | 1 |
| `SYSTEMIC_FAILURE` | 1 |

Every safely observed normal result also contains the exact additive versioned `process`
observation defined by the observability contract. If observation construction, canonical
validation, or result serialization cannot be trusted, the process instead writes the original
exact P3B1 fallback `{"ok":false,"code":"SYSTEMIC_FAILURE"}` to stderr and exits 1. That static
fallback intentionally contains no process metadata. A writer failure after output begins causes no
second or fallback write. `CHECK_READY` contains only aggregate readiness classifications.
`HEALTH_SNAPSHOT` contains exact aggregate readiness, route readiness, and backlog fields.
`CYCLE_COMPLETE` contains exactly
the nonnegative safe-integer counters `selectedCount`, `attemptedCount`, `succeededCount`,
`replayedCount`, `temporaryCount`, `manualCount`, `conflictCount`, `inconsistentCount`,
`skippedCount`, `failedCount`, `readySelected`, `uncontactedSelected`, and `contactedSelected`.
The exact cycle set also includes `providerLookupCount` and `providerCancellationCount`.
Malformed counters become `SYSTEMIC_FAILURE`; extra or secret-like input properties never enter
output. `LIFECYCLE_DRAINED` uses the same exact counter validator and adds only a `SIGNAL` or
`BUDGET` reason. Failures contain no exception string or stack trace.

## Explicitly absent

No loop, scheduler, cron, queue, daemon, web timer, route handler, Server Action, serverless
schedule, external hard-deadline enforcement, overlap enforcement, jitter, backoff, health
endpoint, heartbeat, metrics, alerting, provider reconciliation, manual-resolution mutation, or
credential rotation exists. P3C2 adds only read-only operations commands and a runbook. P3D adds a
provider-free exact-command rehearsal, not an enabled provider-capable exact-command canary. The
lifecycle amendment adds only signal drain and the 120-second cooperative budget.

All worker and provider capability flags remain disabled by default. Code presence authorizes no
SANDBOX lookup or cancellation. LIVE selection and LIVE credentials remain unreachable. `check` and
`health` remain read-only. P3D capability is implemented, but local rehearsal success,
release/deployment evidence, and activation authorization remain distinct. Actual deployment
evidence is absent; activation remains blocked. No P3E provider canary exists, P3E remains
unauthorized, and LIVE remains unreachable.
