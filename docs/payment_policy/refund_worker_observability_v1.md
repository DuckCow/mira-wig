# Refund worker observability v1

Status: implemented but dormant.

This contract adds provider-free, repository-native observations to the one-shot refund worker. It
creates no scheduler, monitoring platform, alert integration, heartbeat, HTTP endpoint, activation
authority, or provider-execution authority. The host remains dormant and LIVE remains unreachable.

## Liveness, readiness, and health

There is no HTTP liveness endpoint. For the one-shot architecture, an external scheduler observes
liveness by successfully starting a process, receiving a bounded exit, and detecting the absence of
an external hard-timeout or hang. The repository persists no heartbeat.

`npm run refund:worker:check` is startup readiness. It validates activation grammar, classifies the
credential configuration without reading a secret, checks database connectivity, and compares the
committed migration inventory with the migration ledger. It performs no business-table health query.
It does not prove provider reachability, target-scale query performance, manual-review ownership,
reconciliation readiness, scheduler correctness, or activation authority.

`npm run refund:worker:health` is a read-only aggregate health snapshot. It is valid while the master
flag is disabled. It performs the same activation, credential, connectivity, and migration checks as
`check`, followed by one read-only transaction. It reports route-configuration readiness, complete
eligible backlog counts and oldest ages, and coherent manual-review backlog. It does not select for
execution, reserve, lease, mutate, construct provider adapters, invoke a provider port, or make a
network request.

## Structured process observation

Every safely observed and normally serialized invocation writes exactly one JSON line containing
the existing top-level `ok`, `code`, and result-specific fields plus:

```json
{
  "process": {
    "formatVersion": "mira-refund-worker-process-observation/v1",
    "command": "CHECK | HEALTH | RUN_ONCE | INVALID",
    "operationDurationMs": 0
  }
}
```

`operationDurationMs` is a finite, nonnegative safe integer derived from an injected monotonic clock.
It begins at process-wrapper entry and ends after the sanitized host result is ready but before the
single output-write attempt, so writer latency is excluded. It contains no wall-clock timestamp.
Invalid, throwing, backward, or unsafe clock readings fail closed to one static `SYSTEMIC_FAILURE`
line without raw diagnostics. A failure of process-observation construction, canonical validation,
or result serialization uses the same original P3B1 static fallback on stderr with exit 1:

```json
{"ok":false,"code":"SYSTEMIC_FAILURE"}
```

The static fallback intentionally contains no `process`, command, or duration metadata. The
observation layer does not reconstruct or fabricate metadata after it has failed. If the selected
writer throws or rejects, including after a partial write, the process returns exit 1 without a
second or fallback write and without switching channels.

Cycle observations use the exact counter keys documented by the host contract, including
`providerLookupCount` and `providerCancellationCount`. These count typed provider-port invocations,
including calls that fail or throw; they do not prove network transmission or provider success.
`failedCount` is the number of routed candidates that stop the cycle with `CONFIG_INVALID` or
`SYSTEMIC_FAILURE`. Pre-cycle failures have zero activity. A stopping failure preserves the complete
partial counter snapshot, and no candidate increments `failedCount` more than once.

The health result is exactly `HEALTH_SNAPSHOT` with readiness, route booleans, and `READY`,
`UNCONTACTED`, `CONTACTED`, and `MANUAL_REVIEW` backlog observations. Each observation contains only
a nonnegative safe-integer `count` and `oldestAgeSeconds`, which is null exactly when count is zero.
Counts are not limited by the worker batch size.

Safe externally attached low-cardinality dimensions are command, static result code, lifecycle drain
reason, deployment environment, and deployment revision. The host itself does not emit environment
or revision.

Prohibited fields and metric labels include worker owner; CLI service, revision, and slot; instance
or process ID; command, order, payment, refund, or customer IDs; payment or provider operation keys;
amount or currency; lease authority; credentials or merchant bindings; authorization headers;
database host, name, or user; timestamps; raw exceptions; provider requests or responses; and
high-cardinality diagnostics.

## External metrics and alerts

No metrics backend is implemented. An external ingestion system may derive:

- invocation count by command and result code;
- invocation duration;
- lifecycle drain count by reason;
- selected, attempted, outcome, and failed counters;
- provider lookup and cancellation port-invocation counts;
- backlog count and oldest age by class;
- manual-review backlog.

An external system should immediately alert on `CONFIG_INVALID`, `MIGRATIONS_NOT_READY`, or
`DATABASE_UNAVAILABLE`. Exit 1 follows the existing scheduler-side backoff contract; the escalation
threshold for consecutive failures remains an operations decision.

Once a scheduler is actually deployed and processing is authorized and enabled, the externally
documented five-minute lease-window condition is satisfied only when one observation has all three
facts:

```text
process.command == "RUN_ONCE"
code == "CYCLE_COMPLETE"
exit == 0
```

A zero-candidate `CYCLE_COMPLETE` still proves that the processing invocation completed normally.
`CHECK_READY`, `HEALTH_SNAPSHOT`, `FEATURE_DISABLED`, `LIFECYCLE_DRAINED`, `CONFIG_INVALID`,
migration or database failure, and `SYSTEMIC_FAILURE` do not satisfy the condition. Five minutes is
an external missing-processing alert window, not an in-process timer. No scheduler, alert,
destination, owner, SLA, acknowledgement, or escalation workflow currently implements this rule.

Any nonzero `MANUAL_REVIEW` backlog must be externally visible. Alert routing, owner, staffed
window, acknowledgement, and resolution remain unsatisfied external requirements. The fixed local
classification thresholds are warning at 10 days and critical at 12 days; the hard recovery
deadline is 13 days and is derived from the Toss recovery-policy authority. At or after 13 days the
case remains `CONTACTED_DEADLINE_CRITICAL` and requires external escalation; there is no separate
hard-deadline classification. These local observations do not prove provider truth, and no metrics
consumer, timer, monitor, alert destination, owner, or workflow implements the thresholds. Repeated
`BUDGET` drains require investigation under the lifecycle contract.

There is no monitoring platform, alert integration, heartbeat persistence, scheduler, or operational
readiness claim. Privileged provider-free manual, reconciliation, and credential observations plus
their thresholds are defined by `refund_worker_operations_runbook_v1.md`. Their case references are
strictly prohibited as metric dimensions or alert labels. This documentation grants no activation
authority. The P3D provider-free rehearsal capability is implemented, but repository capability, a
successful local rehearsal result, release-specific/deployment-specific evidence, and activation
authorization are distinct. Actual deployment evidence is absent and activation remains blocked.
P3E is unimplemented and unauthorized; LIVE remains unreachable.
