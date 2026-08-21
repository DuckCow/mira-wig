# Eximbay Refund Worker Routing — Source Status / As-Built v0.2

## Status

```text
DOCUMENT CLASS: SOURCE STATUS / AS-BUILT
RISK CLASS: HIGH — PAYMENT / PROVIDER REFUND RECOVERY
TASK CLASSIFICATION: DOCUMENTATION_ONLY
VERSION: v0.2
SUPERSEDES AS CURRENT STATUS: v0.1
SOURCE: MERGED / INSTALLED
RUNTIME AUTHORITY: NONE
```

This is the current installed-status record for the dormant Eximbay refund
worker route. Version v0.1 is preserved as the historical installed record
for the PR #93 source state and is not retroactively rewritten or treated as
wrong at the time it was merged.

## Artifact admission

```text
FAILURE MODE:
  A future refund worker, recovery, or activation task reading v0.1 could
  believe Eximbay worker routing is still absent/blocked and reconstruct a
  duplicate route or misunderstand the current activation fences.
WHAT FAILS WITHOUT THIS ARTIFACT:
  Current dormant worker ownership, provider-selection boundaries,
  authorized-R1 crash re-entry, and activation/non-authority state would be
  discoverable only across source and PR history while v0.1 states an obsolete
  routing condition.
WHY SOURCE / TESTS / PR DESCRIPTION ARE INSUFFICIENT:
  A durable Source Status already exists for this refund subsystem, and future
  recovery/activation work needs one current discoverable ownership map.
WHO WILL USE IT AND WHEN:
  Future Eximbay refund eligibility, worker activation, sandbox provider
  execution, recovery, and production-readiness work.
ASSURANCE GAIN:
  One current map separates source installed, worker route installed, worker
  route enabled, customer eligibility, provider contact authority, and LIVE /
  production activation.
MAINTENANCE COST:
  A later version is required for material ownership, recovery, or activation
  changes.
DISPOSITION: ADD
```

## Installed custody and baseline

The authoritative current baseline is the exact merged `main` commit of
[PR #96](https://github.com/DuckCow/mira-wig/pull/96):

| Identity | Value |
|---|---|
| Current `main` commit | `34239ec5061b43f0e311b2316e5a6842df762ef9` |
| Current `main` tree | `49c6a16b0429643752a3b2744378495f8c917824` |
| Merge parents | `0c7ae7def0a621c3e26ae66fe62aa378dcb342df` and `0f03fdc34cc1073f1aaab794f43f2124200c08d5` |
| PR delta | exactly 29 paths |
| Final PR aggregate | `124b90c06dd0239c530f513166454669e72ee29a8e19441f24707bd48e1c6b8e` |
| CI | workflow `CI`, run #409 / `32534351443`, job `96932337640`, SUCCESS |
| Final CI counts | 301 / 301 files and 6611 / 6611 tests PASS |
| Reader integration | `refund-operations-readers`: 15 / 15 PASS |
| Eximbay integration | cancel-recovery: 29 / 29 PASS |
| Installed migrations | 36 |

The original Eximbay refund source remains historical custody from
[PR #93](https://github.com/DuckCow/mira-wig/pull/93): merge commit
`7012aaf3dd39221337f3482ff8309b8ddb406c46`, tree
`8daba81f62672dba7d5fdee4a050be04235d78f1`, refund aggregate
`a299972ef4858d05ecd74e6fc634573242bb308407716f2575256e594f3da021`.

The v0.1 record remains byte-identical historical evidence for that PR #93
state. PR #96's test-time boundary correction is not a production semantic
change.

## Reconciliation of current responsibility

| Boundary | v0.1 state at its merge | Current v0.2 installed state |
|---|---|---|
| Customer Eximbay refund request eligibility | BLOCKED | STILL BLOCKED |
| Eximbay refund worker routing source | BLOCKED | INSTALLED |
| Production worker ownership | BLOCKED | INSTALLED |
| Eximbay provider-specific worker gate | absent | INSTALLED |
| Default Eximbay worker route | OFF | OFF |
| Actual provider execution | not authorized | NOT ACTIVATED |

These are separate authorities. Source installation and worker ownership do
not enable customer intake, provider contact, or production execution.

## Current worker ownership map

| Authority | Current installed owner |
|---|---|
| Durable provider identity | `RefundAttempt.provider` |
| Worker candidate provider | `RefundExecutionWorkerCandidate.provider` |
| Supported worker dispatch providers | `TOSS`, `EXIMBAY` |
| Early dormant-selection boundary | `worker-selector.ts` / worker eligibility and selector owners |
| Provider-specific activation fence | `REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED` in `execution-activation.ts` |
| Eximbay worker configuration | `src/lib/payment/refund/providers/eximbay/refund-worker-config.ts` |
| Provider-aware preflight/readiness | `worker-preflight.ts` and `worker-route-readiness.ts` |
| Provider-aware router | `src/lib/payment/refund/worker-router.ts` |
| Production worker cycle | `src/lib/payment/refund/run-refund-execution-worker-cycle.ts` |
| Production worker host | `src/lib/payment/refund/run-refund-execution-worker-host.ts` |

The durable dispatch row retains provider, mode, physical
`providerOperationKey`, `requestFingerprint`, ordinal, authorization state,
and `contactMarkedAt`. The attempt-stable provider operation binding remains
separate from physical dispatch identity.

## Activation fences

`REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED` is parsed by the installed refund
execution activation owner:

| Environment value | Installed meaning |
|---|---|
| absent | OFF |
| empty / whitespace | OFF |
| exact `ENABLED` | ON |
| malformed non-empty | fail closed as `CONFIG_INVALID` |

`REFUND_EXECUTION_WORKER_ENABLED` alone does **not** activate Eximbay. Toss
activation does **not** activate Eximbay. Source installation does **not**
activate Eximbay. The worker cycle checks the master worker gate, then passes
the Eximbay gate into provider selection; the router independently rechecks
both worker and Eximbay gates before an admitted Eximbay candidate can run.

## Eximbay sandbox worker configuration

The installed configuration names are:

- `EXIMBAY_SANDBOX_MID`
- `EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING`
- `EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING`

The configuration owner constructs a `SANDBOX` config with `mid`,
`merchantAccountBindingId`, and `credentialGenerationBindingId`. Missing or
partial values are invalid; no values are recorded here. B2 introduced no new
Eximbay refund API-key requirement. These names do not claim that environment
values are deployed.

## Dormant selector and capacity semantics

When Eximbay routing is OFF, the selector requests only the `TOSS` provider.
Eximbay commands are excluded before worker batch allocation. Consequently,
for Eximbay candidates:

| Capacity | Installed value while route is OFF |
|---|---:|
| Selector capacity | 0 |
| Class allocation capacity | 0 |
| Service-outcome capacity | 0 |
| Provider-contact capacity | 0 |

This is an installed source invariant, not production observation or
activation evidence.

## Worker state ownership

### READY

Generic lease acquisition leads to the installed Eximbay first-dispatch
authorization/preflight owner and then the exact R1 contact owner. Preflight
retrieves and admits one immutable payment-state observation before contact;
the preflight owner does not perform cancel transport.

### Ordinal-zero UNCONTACTED

Existing reclaim rotates the expired command lease, then the route performs
the installed first-dispatch authorization/preflight and R1 contact. No
provider operation is contacted by the reclaim itself.

### Authorized-R1 crash re-entry

The recovered state is the coherent case:

```text
R1 authorization committed
dispatchAttempt = 1
exact R1 dispatch = AUTHORIZED
contactMarkedAt = null
process loss before contact marker
lease expiry
```

The installed recovery:

- identifies only the coherent expired authorized Eximbay R1 state;
- rotates command lease custody only, using a fresh lease generation/token;
- preserves the exact R1 dispatch identity, `providerOperationKey`, and
  `requestFingerprint`;
- does not rerun the first-dispatch authorizer;
- performs 0 additional preflight retrieves and 0 additional dispatch
  allocations;
- rejects a stale old lease from contacting;
- uses the existing contact owner, which marks contact before transport;
- permits at most 1 recovered R1 cancel contact under lawful handling;
- classifies an uncertain result for `WAITING_EVIDENCE` / `CONTACTED`
  reconciliation ownership;
- creates 0 R2 and 0 R3 dispatches from this re-entry path.

Validation used fake/injected transports. It did not perform an actual
provider cancel.

### CONTACTED

The Eximbay contacted route goes through installed reconciliation/lookup,
persists the result, and continues to contact only when the exact lawful R2
authorization is returned. This route does not treat an inconclusive lookup as
R2 authority.

## Preserved R2 / response-loss semantics

The provider semantics recorded in v0.1 remain current and were not changed by
B2:

- response-loss lookup is bounded to the installed offsets and maximum permit;
- `FOUND` is terminal success;
- conflict parks;
- `UNKNOWN` does not authorize R2;
- exact lawful R1 `NONE` evidence is required before R2;
- R2 uses a distinct physical identity;
- no R3 exists.

The installed Eximbay lookup owner retains bounded lookup permits at +5
seconds, +30 seconds, and +2 minutes from the contact marker, with a maximum
of three permits. R2 `NONE` or unresolved R2 is manual review, never R3.

## Customer and payment non-scope

### Customer refund intake

Normal customer Eximbay refund request eligibility remains **BLOCKED**. The
customer intake submit/approve controls have separate activation keys and B2
does not change them. This remaining zero-contact gap is outside this
document; no B3 design or authorization is implied.

### Canonical payment routing

Canonical Eximbay payment routing remains **BLOCKED**. The installed provider
registry keeps Eximbay disabled with no allowed modes, methods, currencies, or
routing-rule candidates. Refund worker ownership does not become payment
creation, `request_pay`, customer provider selection, or payment activation.

B2 does not activate or redefine canonical payment routing, payment creation,
customer payment selection, BF4 callback activation, provider credentials,
LIVE mode, or production/cloud deployment.

## Schema and migration custody

```text
B2 repository schema mutation: 0
B2 migration mutation: 0
```

The existing 36 installed migrations and Eximbay refund durable models remain
the persistence basis. This record does not claim migration deployment or
production database mutation.

## Runtime-image graph custody

B2 updated the installed provider-free runtime-image graph contract to track
the dormant worker graph:

| Contract field | Current value |
|---|---:|
| `expectedFileCount` | 177 |
| `repositoryGraphInputCount` | 133 |
| `packagedGraphInputCount` | 45 |
| `entrypointCount` | 3 |
| `expectedManifestSha256` | `40bcd95ed69ca5854147e8519d6c9dc7c04189d20e638cebca7ea0206b887070` |

This is installed runtime-image graph custody only. Image publication is 0;
production activation is 0; no OCI/R2A image reseal is claimed.

## Test-time publication custody

PR #96 included one integration-test-only stabilization in
`src/lib/payment/refund/__tests__/refund-operations-readers.integration.test.ts`:

```text
cause: TEST_FIXTURE_TIME_DRIFT
correction: one-second pre-threshold fixture margin -> 60-second guard
production reader semantics: unchanged
expected reconciliation summary: unchanged
```

This correction is publication/test custody, not refund-worker runtime
ownership.

## R2A disposition

R2A remains **CURRENT** and was not resealed. The B2 runtime-image contract
change is graph custody for the already-dormant provider-free image definition;
it did not publish an image, create a runtime resource, or produce cloud
evidence. The existing private Cloud SQL proxy/socket architecture remains
R2A-owned. No R2A conflict is established.

## Current non-authority matrix

| Authority or effect | Current status |
|---|---|
| Source installed | YES |
| Worker route installed | YES |
| Worker route default enabled | NO |
| Customer Eximbay refund eligibility | NO / BLOCKED |
| Actual provider retrieve/cancel/lookup evidence | NO |
| Actual account-bound sandbox refund execution | NO |
| Credential approval or deployment | NO CLAIM |
| LIVE | NO |
| Production/cloud activation | NO |
| BF4 activation | NO |
| Payment routing activation | NO |

This Source Status is not an activation record. It authorizes no provider
contact, credential use, customer-worker scheduling, LIVE operation, cloud
apply, or production execution.

## Validation basis and residual boundary

The material statements above are established from the exact current source,
the current Feature Documentation Standard, the preserved v0.1 record, PR #96
merged bytes, and CI #409. No unsupported material claim is intentionally
introduced. An independent semantic review is not required by default because
this is a derivative current-status record of already reviewed and
CI-verified installed source.

Material future ownership, recovery, provider-semantic, schema, or activation
changes require a later Source Status version. Documentation rollback is a
revert of the eventual documentation publication; source rollback, credential
approval, provider re-entry, and production activation remain separate
authorities.
