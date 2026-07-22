# Refund worker one-shot lifecycle v1

Status: implemented but dormant.

This document amends, and does not replace,
`docs/payment_policy/refund_worker_host_v1.md`. It freezes the cooperative process lifecycle and
the contract a future external scheduler must satisfy. It creates no scheduler and grants no
activation or provider-execution authority.
Structured process observations and read-only health semantics are separately frozen in
`docs/payment_policy/refund_worker_observability_v1.md`.
Emergency-stop, restart, manual-review, reconciliation, credential, and activation gates are
defined without changing this lifecycle in
`docs/payment_policy/refund_worker_operations_runbook_v1.md`.
The operations commands remain provider-free one-shot observations and add no lifecycle timer,
monitor, recurring process, revocation calculation, or activation authority.

## One-shot lifecycle

Only a directly executed, valid, exactly master-enabled `run-once` invocation owns a lifecycle.
It registers handlers for `SIGTERM` and `SIGINT` and one 120-second cooperative-budget timer after
the early master gate and before the remaining readiness work. The first accepted reason wins:
`SIGNAL` or `BUDGET`. Repeated signals and a later timer are idempotent.

A drain request stops admission at safe host boundaries and between worker candidates. An in-flight
candidate may finish; it is not force-cancelled. Work already committed remains committed, and a
drain invents neither rollback nor provider finality. The timer and both signal listeners are
removed in `finally`, independently of the owned database client's `finally` disconnect.

The process result `LIFECYCLE_DRAINED` exits 75 and contains only `ok: true`, its code, the bounded
reason, and the exact whitelisted cycle counters. A pre-cycle drain uses the complete zero-counter
shape. Cycle configuration or systemic failure wins over concurrent drain. A cycle that completes
before observing drain remains `CYCLE_COMPLETE`.

`check`, invalid CLI, disabled-master, and malformed-master paths create no lifecycle timer or
signal listener. The handlers request drain only: they do not write output, set an exit status,
exit the process, touch the database, construct adapters, or call a provider.

## External scheduler contract

An external scheduler invokes one one-shot CLI process. There is no persistent worker loop. At
most one invocation may be active; an overlapping tick must be skipped, not queued. Core leases and
fences remain safety boundaries under accidental overlap, but operational overlap is unsupported.

The nominal schedule is one invocation every 60 seconds with scheduler-provided jitter from 0 to
15 seconds. Cadence and jitter are not implemented in repository code.

The cooperative host drain budget is 120 seconds. The external scheduler hard deadline is 150
seconds and must remain external; the host must not emulate it with an internal `Promise.race` that
returns while database or provider work continues. Hard termination may interrupt one in-flight
candidate. Operators must then inspect contact markers and recovery fencing. Hard termination
proves neither provider success nor provider failure.

## Exit handling

| Exit | Scheduler action |
|---:|---|
| 0 | Continue at the normal next cadence. |
| 75 / `LIFECYCLE_DRAINED` | Inspect `reason`; do not overlap an immediate replacement invocation; investigate repeated `BUDGET` drains. |
| 64 | Treat as an invocation or deployment defect and suspend scheduling until corrected. |
| 78 | Treat as a configuration or migration-readiness defect; suspend scheduling and alert. |
| 1 | Treat as systemic failure and apply scheduler-side backoff. |
| 124 or external timeout | Stop further admission, reconcile possible provider contact, and escalate operationally. |

For consecutive exit-1 failures, the scheduler-side backoff is 1, 2, 4, 8, then at most 15 minutes,
with scheduler-side jitter. A successful exit-0 invocation resets the sequence. The host implements
none of this cadence, jitter, retry, or backoff behavior.

## Authority and unresolved operations

The repository still contains no scheduler configuration, and no actual platform concurrency
guarantee is proven. Monitoring integration, staffed ownership, alert routing, and
provider-reconciliation authority remain absent. Lifecycle code grants no activation authority.
SANDBOX provider execution remains unauthorized, and LIVE remains unreachable. The P3D
provider-free rehearsal capability is implemented. Actual deployment evidence remains absent, and
it supplies no activation authorization. Activation remains blocked. P3E-A is implemented only as
a non-authorizing evidence-readiness contract; P3E-B, P3E-C, and P3E-D remain unimplemented and
unauthorized.

Hard-deadline enforcement, deployed overlap enforcement, external observability ingestion,
reconciliation, credential rotation, and provider canary operation remain outside P3B2 and are not
created by the P3D provider-free simulations.

## P3E authority-model status

P3D provider-free rehearsal is implemented. P3E-A evidence-readiness contract is implemented.
P3E-A cannot issue executable approval; no trusted evidence producer/verifier exists; no GCP
infrastructure exists; no distributed admission implementation exists; no durable single-use
consumption ledger exists. P3E-B remains unimplemented and unauthorized. P3E-C remains unimplemented
and unauthorized. P3E-D provider-contact execution remains unimplemented and unauthorized.
Scheduled SANDBOX remains blocked and LIVE remains unreachable.
The status remains exact: scheduled SANDBOX remains blocked; LIVE remains unreachable.
