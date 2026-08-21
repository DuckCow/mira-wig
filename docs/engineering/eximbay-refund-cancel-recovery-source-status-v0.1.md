# Eximbay Refund Preflight / Cancel Recovery — Source Status / As-Built v0.1

## Status

```text
DOCUMENT CLASS: SOURCE STATUS / AS-BUILT
RISK CLASS: HIGH — PAYMENT / PROVIDER REFUND RECOVERY
TASK CLASSIFICATION: SOURCE_ONLY / DOCUMENTATION_ONLY
VERSION: v0.1
SUPERSEDES: none
SUPERSEDED-BY: none
SOURCE: MERGED / INSTALLED
REVIEW STATUS: TARGETED SOURCE STATUS REVIEW CLOSED / PASS
INITIAL TARGETED REVIEW: 2 SUBSTANTIVE FINDINGS — IMPORTANT 1 / MINOR 1
BOUNDED CORRECTIONS: APPLIED
BOUNDED CLOSURE REVIEW: PASS
OPEN FINDINGS AFTER CLOSURE: BLOCKER 0 / IMPORTANT 0 / MINOR 0
RUNTIME AUTHORITY: NONE
```

This is the first durable installed record for the dormant Eximbay refund
preflight, cancel, refund-id, and recovery implementation introduced by PR
#93. It is not activation evidence.

## Artifact admission

```text
FAILURE MODE:
  Dormant refund ownership, provider semantics, and re-entry fences could be
  reconstructed only from a transient PR or scattered source.
WHAT FAILS WITHOUT THIS ARTIFACT:
  A future operator could allocate a second physical identity, treat a lookup
  as execution authority, or activate provider contact without the installed
  preflight/recovery fence.
WHY SOURCE / TESTS / PR DESCRIPTION ARE INSUFFICIENT:
  The authority spans source, schema, migrations, provider contracts, and
  dormant reachability rules.
WHO WILL USE IT AND WHEN:
  Future refund recovery, provider-contact, migration, or activation work.
ASSURANCE GAIN:
  One durable map of installed owners, exact identities, ceilings, and
  non-authority boundaries.
MAINTENANCE COST:
  A new reviewed version for a material ownership, provider-semantic, schema,
  recovery, or activation change.
DISPOSITION: ADD
```

## Installed custody

The source is the exact merge commit of [PR #93](https://github.com/DuckCow/mira-wig/pull/93):

| Identity | Value |
|---|---|
| Merge commit/tree | `7012aaf3dd39221337f3482ff8309b8ddb406c46` / `8daba81f62672dba7d5fdee4a050be04235d78f1` |
| Parents | `c95b47a951e200b27998c2b970aa47d36e0609ad` and `e62092a3d54dba193a829f752dd4a496ddb85c5d` |
| Refund feature path set | 69 paths |
| Refund aggregate | `a299972ef4858d05ecd74e6fc634573242bb308407716f2575256e594f3da021` |
| Publication-only CI path | `.github/workflows/ci.yml` |
| CI workflow SHA-256 | `9bac010b320cee648cb06614cc7262721fbdcd80afb8e668ff263566555ef248` |
| Final CI | run #402 / `32463236830` / SUCCESS |
| Verification | 296 / 296 files and 6562 / 6562 tests PASS |
| Installed migration count | 36 |
| R2A | CURRENT; no reseal |

The publication-only workflow path is verification custody, not refund runtime
ownership. The corrected test synchronization is likewise test-only: runtime
mutation was 0, the defect was corrected before merge, and the final Toss
authorization integration file passed 28/28.

## Responsibility boundary and durable owners

The implementation is dormant, provider-free at its installed callers, and
SANDBOX-only in its refund configuration. Customer Eximbay refund request
eligibility and worker routing remain blocked. The exact ownership map is:

| Durable authority | Installed owner |
|---|---|
| Logical operation family key/fingerprint | `src/lib/payment/refund/providers/eximbay/preflight-contract.ts` and `RefundExecutionProviderOperationBinding` |
| Physical Eximbay dispatch `refund_id` | `src/lib/payment/refund/providers/eximbay/refund-id.ts`; the persisted value is owned by `RefundExecutionDispatchAttempt.providerOperationKey` |
| Admitted provider payment state | `src/lib/payment/refund/providers/eximbay/authorize-first-dispatch.ts` and `RefundExecutionEximbayPreflightObservation` |
| Locked lifecycle and dispatch authority | `src/lib/payment/refund/providers/eximbay/lifecycle-state.ts` and `lifecycle-authority.ts` |
| Contact marker and cancel transport boundary | `src/lib/payment/refund/providers/eximbay/execute-contact.ts`, `cancel-wire.ts`, and `cancel-contact.ts` |
| Provider lookup/recovery evidence | `src/lib/payment/refund/providers/eximbay/reconcile-refund.ts`, `refund-lookup.ts`, and `RefundExecutionEvidence` |
| Provider result identity | `cancel-contact.ts` admits `refund_transaction_id`; generic result persistence projects it to `RefundAttempt.providerRefundId` while the merchant `refund_id` remains dispatch-owned |

Refund persistence, physical dispatch allocation, provider contact, preflight
observation, recovery scheduling, and result authority are not EX2A owners.

## Identity and physical-dispatch regime

The installed merchant `refund_id` grammar is exactly
`^er[12]_[0-9a-z]{25}$`: lowercase ASCII, 29 characters, within the provider's
30-character capacity. `refund-id.ts` hashes the compact tuple
`["mira-eximbay-refund-id-v1", operationFamilyFingerprint, ordinal]`, projects
the first 128 digest bits to a zero-padded 25-character base-36 suffix, and
prefixes it with `er1_` or `er2_`. The dispatch row owns the value before
transport; replay, response matching, and recovery reuse it.

Physical dispatch is bounded to R1 and R2. R1 is ordinal 1. R2 is ordinal 2,
requires an exact authoritatively not-executed R1 result, a contacted R1, no
successful refund, a distinct K2, and the locked recovery lease/fence. No code
path creates R3. R1/R2 dispatches use the provider-specific unique index and
the canonical operation-family/request fingerprints.

## Preflight and contact boundaries

`authorize-first-dispatch.ts` admits one immutable Eximbay payment-state
observation per binding and observing lease generation. The provider-free
retrieve seam uses `POST /v1/payments/retrieve` with `key_field=transaction_id`,
injected configuration/transport, a 15-second deadline, a 64 KiB/256-chunk
body limit, fatal UTF-8, exact JSON/content admission, and strict identity,
currency, amount, `SALE`, and refundable-balance checks. F/P classification is
local; the preflight owner performs no cancel transport.

The contact owner locks and revalidates the exact aggregate, binding,
observation, dispatch, lease, and fingerprint, then durably marks
`CONTACT_MAY_HAVE_OCCURRED` before transport. `cancel-wire.ts` builds the
exact sandbox cancel request and `cancel-contact.ts` uses an injected
fetch-like transport with a real 25-second abort deadline, bounded JSON, exact
identity/money matching, and conservative `UNKNOWN` on timeout, malformed,
non-success, or mismatch. No database lock spans provider transport.

## Response-loss recovery and NONE authority

`reconcile-refund.ts` and `refund-lookup.ts` use one bounded lookup permit per
recovery event at offsets +5 seconds, +30 seconds, and +2 minutes from the
contact marker; the maximum is three permits and no fourth permit is issued.
An exact `NONE` response for the target dispatch is the only
`NOT_EXECUTED_RETRYABLE` authority. A found refund is terminal success; conflict
parks immediately. `UNKNOWN`—including malformed, timeout, or otherwise
inconclusive lookup output—returns the command to `WAITING_EVIDENCE` while
another bounded permit remains and parks only when the third permit is
exhausted. Incoherent durable history fails closed. R2 is created only after the
exact R1 `NONE` evidence is durably recorded. R2 `NONE` or any unresolved R2
result is manual review, never R3.

## Schema and migration delta

The installed schema uses existing command, event, dispatch, binding, and
evidence models, plus the immutable Eximbay preflight observation model. The
two installed migration files are:

| Migration | Bytes | SHA-256 | Installed effect |
|---|---:|---|---|
| `20260820120000_refund_identity_regimes/migration.sql` | 2494 | `73036f4466ff8da3ccad48a4c23205b30979a6d3d1591bd919a6a984d9f8953a` | admits Eximbay binding tuples and adds the Eximbay dispatch-operation-key unique index |
| `20260820150000_eximbay_refund_preflight_observation/migration.sql` | 3326 | `5ddf625b2642b43f81b1d293ae29920665859406498b3de3732033576b78e979` | creates immutable preflight observations, generation/fingerprint uniqueness, FK, and mutation trigger |

The repository contains 36 migration directories. This record does not claim
that these migrations were deployed to production; migration deployment,
credentials, and activation remain separate authority boundaries.

## Validation, provider register, and R2A

Final CI run #402 passed Eximbay migration `5/5`, Eximbay preflight migration
`3/3`, the Toss authorization integration file `28/28`, and the complete
296/296-file, 6562/6562-test suite. Local `npm run verify` also passed before
publication. Provider-question register entries A, B, C, and D are RETIRED;
`REMAINING_PROVIDER_QUESTION_COUNT = 0` for the current refund implementation.
That count does not close production/provider activation provenance, including
the unresolved BF4 boundary.

R2A remains CURRENT and was not resealed during reconciliation, publication,
or merge.

## Rollback, re-entry, and residual non-authority

Documentation rollback is a revert of the eventual documentation merge. Source
rollback, migration rollback, provider inquiry/recontact, credential approval,
and production activation each require separate reviewed authority. No source
or documentation rollback may rewrite a contacted, unknown, or successful
durable row as uncontacted.

The installed source is not a customer activation record. It does not authorize
provider contact, provider credentials, production routing, cloud runtime,
live/sandbox refund execution, worker scheduling, or BF4 closure. Source
installed != provider contact authorized != production activated.

**Non-authority:** runtime authority is NONE; provider/cloud/production effects
for this source publication were 0.
