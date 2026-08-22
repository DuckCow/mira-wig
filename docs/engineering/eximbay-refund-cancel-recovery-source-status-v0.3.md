# Eximbay Customer Refund Approval and Worker Routing — Source Status / As-Built v0.3

## Status

```text
DOCUMENT CLASS: SOURCE STATUS / AS-BUILT
RISK CLASS: HIGH — PAYMENT / PROVIDER REFUND RECOVERY
TASK CLASSIFICATION: DOCUMENTATION_ONLY
VERSION: v0.3
SUPERSEDES AS CURRENT STATUS: v0.2
SOURCE: MERGED / INSTALLED
RUNTIME AUTHORITY: NONE
```

This is the current installed-status record after PR #98. It records the
dormant provider-specific customer approval capability added by B3 and
reconciles it with the already-installed B2 worker route. It is not an
activation record and does not authorize provider contact.

## Artifact admission

```text
FAILURE MODE:
  A future refund, recovery, or activation task could read v0.2 as the current
  truth and either duplicate the B3 customer-approval capability or confuse
  customer approval admission with worker routing and provider contact.
WHAT FAILS WITHOUT THIS ARTIFACT:
  The installed B3 gate, its exact SANDBOX/USD/JPY admission boundary, replay
  behavior, and its separation from the B2 worker gate would be discoverable
  only from source, tests, and transient PR history.
WHY SOURCE / TESTS / PR DESCRIPTION ARE INSUFFICIENT:
  v0.2 is a durable Source Status for the same subsystem but says customer
  Eximbay refund eligibility is BLOCKED. That was correct for its PR #96/B2
  baseline; after PR #98 it is stale as the current-status record while still
  valid historical evidence. The source spans customer intake, refund
  admission, worker routing, provider semantics, and non-authority fences.
WHO WILL USE IT AND WHEN:
  Future customer-refund, Eximbay sandbox, worker activation, recovery,
  provider-contact, and production-readiness work.
ASSURANCE GAIN:
  One current map distinguishes installed B3 source capability, default gate
  state, durable refund creation, B2 worker ownership, worker activation, and
  actual provider or production effects.
MAINTENANCE COST:
  A later Source Status version is required for material ownership, provider,
  schema, recovery, or activation changes.
DISPOSITION: ADD
```

## Historical custody and current baseline

v0.1 remains the historical installed record for PR #93's dormant Eximbay
preflight/cancel/recovery source. v0.2 remains the historical installed record
for PR #96/B2's dormant worker route and runtime-image graph custody. Neither
document is retroactively wrong at the time it described; v0.3 is the current
record after PR #98.

The exact installed baseline for this record is the merged `main` commit of
[PR #98](https://github.com/DuckCow/mira-wig/pull/98):

| Identity | Value |
|---|---|
| Merge commit | `4d21213614ba2cf96e7c4bc870aad017d4c9922b` |
| Tree | `e93ea0a0afe0b7e85d5f2cc77b5ebc79ebc6ad5a` |
| Parents | `2e069804f7ec3089468eddf357107a2ec45449e9` and `8cf281e4f110394a903c8b24360b90158c2b3d83` |
| PR head | `8cf281e4f110394a903c8b24360b90158c2b3d83` |
| PR delta | 1 commit, 10 files, +455 / -26 |
| Reviewed diff SHA-256 | `2bb3ad738cc2a0f05a4467a3ba37aeb8ba69ad254c0c393eca8b245fde38f6a2` |
| CI | workflow `CI`, run #413 / `32541700039`, exact PR head, SUCCESS |
| Recorded local verification | `npm run verify`, exit 0; 301 / 301 files and 6643 / 6643 tests |
| Independent review closure | BLOCKER 0 / IMPORTANT 0 / MINOR 0 / NEW_STRUCTURAL 0 |

These identities are custody evidence for the installed source. They do not
claim a live Eximbay request, refund, lookup, credential use, or provider
response.

The preceding B2 custody is PR #96 merge commit
`34239ec5061b43f0e311b2316e5a6842df762ef9`, tree
`49c6a16b0429643752a3b2744378495f8c917824`, with parents
`0c7ae7def0a621c3e26ae66fe62aa378dcb342df` and
`0f03fdc34cc1073f1aaab794f43f2124200c08d5`. The preceding v0.1 custody is
PR #93 merge commit `7012aaf3dd39221337f3482ff8309b8ddb406c46` and remains
historical evidence for the original dormant provider implementation.

## Current responsibility reconciliation

| Boundary | v0.2 historical state | v0.3 current installed state |
|---|---|---|
| Customer intake submission | Provider-agnostic | Provider-agnostic |
| Customer Eximbay approval source capability | BLOCKED | INSTALLED |
| Provider-specific customer approval gate | Absent | INSTALLED; default OFF |
| Default generic refund-request gate | Eximbay denied | Eximbay denied |
| Direct admin Eximbay request | BLOCKED | STILL BLOCKED; does not inherit B3 |
| Eximbay refund worker source | INSTALLED | INSTALLED |
| Eximbay worker route | OFF | OFF by default |
| Canonical payment routing | BLOCKED | BLOCKED |
| Actual provider execution | NOT ACTIVATED | NOT ACTIVATED |
| LIVE / production | NO | NO |

The B3 source capability is a narrow customer-approval admission seam. It does
not convert the generic request primitive, direct admin action, worker route,
canonical payment routing, or provider registry into an active path.

## B3 source chain and activation semantics

The installed customer-approval chain is:

```text
admin customer approval action
  -> server-owned B3 activation parsing
  -> approveCustomerRefundIntake(..., { allowEximbaySandboxCustomerApproval })
  -> requestRefundAttemptInTransaction(..., provider admission)
  -> durable Payment/provider/mode/currency admission
  -> RefundAttempt REQUESTED
```

The owners are:

| Responsibility | Installed owner |
|---|---|
| Customer submission | `src/lib/payment/refund/customer-intake.ts` |
| Admin approval boundary and server-only capability construction | `src/app/actions/admin/customer-refund-intake.ts` |
| Transactional approval/replay and capability propagation | `src/lib/payment/refund/customer-intake-review.ts` |
| Refund eligibility, idempotency, ledger and durable request write | `src/lib/payment/refund/request.ts` and `prepare.ts` |
| B3 activation parser | `src/lib/payment/refund/customer-intake-activation.ts` |
| Direct generic admin request | `src/app/actions/admin/refund.ts` |

The B3 key is `CUSTOMER_REFUND_INTAKE_EXIMBAY_APPROVE_ENABLED`:

| Value | Installed meaning |
|---|---|
| absent, empty, or whitespace | OFF |
| trimmed exact `ENABLED` | ON for the server-owned B3 capability |
| other nonblank value | fail closed with `CustomerRefundIntakeActivationConfigError` |

This parser is independent from `CUSTOMER_REFUND_INTAKE_APPROVE_ENABLED`,
`REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED`, `PAYMENT_MODE`, and canonical
payment routing. Client input cannot supply or spoof the capability; the
server action reads the environment and passes an immutable capability object
only to the approval core.

## Fresh Eximbay approval admission

When the B3 capability is absent, a fresh Eximbay approval is denied. When it
is present, the durable Payment must still satisfy every provider-specific
condition:

- `Payment.provider = EXIMBAY`;
- `Payment.mode = SANDBOX`;
- `Payment.currency` is exactly `USD` or `JPY`;
- `Payment.status = SUCCEEDED`; and
- `Payment.providerPaymentKey` is present and usable after trimming.

The existing generic request invariants remain required: refundable Order
status (`PAID` or `PARTIALLY_REFUNDED`), Order/payment amount and currency
identity, coherent historical refund ledger, no dispute/manual-review state,
no concurrent nonterminal refund attempt, valid amount and no over-refund,
valid actor/reason input, idempotency identity, and coherent creation evidence.
No LIVE mode, arbitrary currency, or provider-key-less payment is admitted.

The generic `requestRefundAttempt` and its in-transaction default admission
remain Eximbay-denying. The direct admin action in `src/app/actions/admin/refund.ts`
does not pass the B3 capability and therefore does not inherit customer
approval eligibility. Customer submission remains provider-agnostic; it creates
only a durable `CustomerRefundIntake` in `SUBMITTED` state and does not select
Eximbay or contact a provider.

## Durable B3 success and replay

A fresh successful B3 approval atomically produces the existing canonical
request transition:

```text
CustomerRefundIntake APPROVED
Order REFUND_PENDING
RefundAttempt REQUESTED
```

The attempt stores `provider = EXIMBAY`, `mode = SANDBOX`, the durable Payment
currency, the durable Payment id, a generated idempotency identity, and
`providerRefundId = null`. No physical worker dispatch, provider operation
key, Eximbay `refund_id`, provider response evidence, or provider contact is
created by B3 approval.

Approval replay is resolved before a new write. If an intake is already
`APPROVED` and linked to a coherent durable attempt, a replay returns that
existing outcome even if the B3 gate is subsequently disabled. It creates no
fresh admission, attempt, transition, dispatch, or provider execution. A fresh
Eximbay approval still requires the B3 gate and all admission invariants.

## B2 worker route remains dormant

PR #98 does not replace or activate the B2 worker ownership. Worker dispatch
continues to use durable `RefundAttempt.provider`; installed supported worker
providers are `TOSS` and `EXIMBAY`. The worker cycle reads
`REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED`, the selector admits Eximbay only
when that route gate is enabled, and the router independently requires both
the master worker gate and the Eximbay route gate. The default route is OFF;
with it OFF, selector, class-allocation, service-outcome, and provider-contact
capacities for Eximbay are all zero.

If a later separately authorized activation enables the route, the installed
worker owners remain `worker-selector.ts`, `worker-router.ts`,
`run-refund-execution-worker-cycle.ts`, `run-refund-execution-worker-host.ts`,
the Eximbay worker configuration/preflight owners, and the provider-specific
authorize/contact/reconcile owners. B3 does not create a worker command or
schedule a customer approval for execution.

The B2 recovery semantics remain current:

- `READY` acquires the generic lease, performs Eximbay first-dispatch
  authorization/preflight, then uses the R1 contact owner;
- ordinal-zero `UNCONTACTED` reclaim rotates lease custody and follows the
  same installed first-dispatch path; reclaim itself does not contact;
- an authorized-R1 crash re-entry preserves the exact R1 dispatch identity,
  provider operation key, request fingerprint, and dispatch ordinal, does not
  rerun first-dispatch authorization, performs zero additional preflight
  retrieves and zero additional dispatch allocations, and allows at most one
  lawful recovered R1 contact after a fresh lease;
- `CONTACTED` uses bounded reconciliation and proceeds only on exact lawful
  R2 authorization; and
- exact lawful R1 `NONE` evidence is required before R2, R2 uses a distinct
  physical identity, `UNKNOWN` or conflict never authorizes R2, R2 `NONE` or
  unresolved R2 is manual review, and no R3 exists.

These are installed source invariants, not observations of a live worker or
provider account.

## Canonical payment routing remains blocked

`src/lib/payment/providers/routing.ts` still registers Eximbay as disabled,
with no allowed modes, supported methods, supported currencies, or routing
rule candidates. B3 does not enable payment creation, customer provider
selection, `request_pay`, browser SDK use, payment callbacks, BF4, provider
credentials, or canonical payment routing. A successful B3 admission can
consume only an already-durable qualifying Payment; it cannot create one.

## Schema, migrations, and runtime-image custody

PR #98 changed no Prisma schema and no migration. The current repository
inventory was checked directly at this baseline and contains 36 migration
directories. This document makes no production database migration or deploy
claim.

PR #98 also made no runtime-image graph or manifest mutation. The B2 runtime
image contract remains the installed source record; image publication is 0,
runtime-resource creation is 0, production activation is 0, and no OCI/R2A
image reseal was performed for B3.

## Non-authority matrix

| Authority or effect | Current status |
|---|---|
| Source capability installed | YES |
| B3 customer Eximbay approval capability installed | YES |
| B3 customer approval gate default enabled | NO |
| Customer intake submission provider selection | NO; provider-agnostic |
| Generic/direct-admin Eximbay request admission | NO / BLOCKED |
| Eximbay worker route source | YES |
| Eximbay worker route default enabled | NO |
| Canonical payment routing | NO / BLOCKED |
| Actual provider retrieve/cancel/lookup evidence | NO |
| Account-bound SANDBOX refund execution evidence | NO |
| Credential approval or deployment | NO CLAIM |
| LIVE operation | NO |
| Production/cloud activation | NO |
| BF4 activation or closure | NO |

This Source Status authorizes no environment change, credential use, provider
contact, worker scheduling, cloud apply, LIVE operation, production release,
or customer activation.

## Validation basis, uncertainty, and next gate

The material statements above are established from the exact merged PR #98
bytes, the PR #98 identity and CI #413 result, the recorded local `npm run
verify` result, the closed independent review, the current Feature
Documentation Standard v0.2, the preserved v0.1/v0.2 records, the current
source paths, and the directly checked 36-directory migration inventory.
This documentation-only candidate does not rerun the full application suite
or provider tests and does not claim real provider execution. External account
state, credentials, deployment, cloud state, and production activation remain
intentionally unknown and unauthorized.

The next gate is publication review of this exact one-file documentation
candidate. Publication, commit, push, PR, merge, activation, provider
re-contact, and production work are outside this task.
