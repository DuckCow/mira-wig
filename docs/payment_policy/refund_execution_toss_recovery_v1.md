# Toss refund contacted-recovery contract v1

## 1. Authority and scope

This contract is subordinate to `refund_execution_v3.md` and
`refund_execution_toss_v1.md`. It narrows E3C recovery for the existing SANDBOX,
domestic-card, full-refund Toss scope. It authorizes no runtime recovery operation.

E3C implementation order is E3C-A3 pure/schema authority, E3C1 authoritative GET
reconciliation, then E3C2 same-key recontact. Gates remain disabled through
SANDBOX acceptance. Webhooks remain wake-up hints only.

## 2. Recovery fence

A contacted command never returns to `READY`. Recovery uses a new command lease
generation and raw token acquired under the canonical aggregate locks. The five-minute
`REFUND_EXECUTION_LEASE_DURATION_MS` is reused; no recovery TTL is introduced.
Fence expiry therefore bounds authoritative GET acquisition to at most one new recovery
generation per five minutes.

`RECOVERY_LEASE_ACQUIRED` records the current command, new recovery generation,
historical contacted ordinal in `dispatchAttempt`, and database acquisition time. The
original dispatch generation and history are immutable. E3C-A3 adds no event writer or
token generator.

## 3. Provenance

Evidence `dispatchAttemptId` identifies the physical contacted ordinal concerned by an
observation. `authorizingLeaseGeneration` identifies the lease generation that authorized
application. Neither enters provider operation identity, wire identity, or terminal dedup.

Initial POST success links ordinal 1 to its `LEASE_ACQUIRED` generation. Recovery GET
success links the latest contacted ordinal to a `RECOVERY_LEASE_ACQUIRED` generation.
Recovery POST success links the new contacted ordinal to the recovery generation whose
event points at the prior contacted ordinal.

Terminal identity is `refund-result:{commandId}:{dispatchOrdinal}`. Nonterminal lookup
identity is `refund-provider-lookup:{commandId}:{recoveryGeneration}`. GET attribution
always selects the greatest coherent contacted ordinal and creates no dispatch.

## 4. Fixed recovery policy

The strict recontact deadline is 13 days after the earliest `contactMarkedAt`; equality is
expired and later ordinals never reset it. At most two total
`CONTACT_MAY_HAVE_OCCURRED` dispatches are permitted. A recovery contact must be at least
15 minutes after the latest contact marker. Contact markers consume a slot even when the
process dies before POST.

Each recontact decision uses database millisecond time and reuses the existing 10-second
contact-lookup freshness authority. A strict still-eligible GET is followed by one atomic
transaction that inserts ordinal N+1 already contacted, inserts its proof, and advances the
command projection. There is no resting recovery `AUTHORIZED` state. E3C-A3 adds no such
writer or POST continuation.

## 5. Lookup and manual boundary

Authoritative GET facts are exact success, still eligible and uncancelled, provider
processing only when an already-authorized status exists, conflicting provider state,
unavailable, or rejected. Raw responses remain transient. Processing creates no ordinal or
POST. Because the committed policy contains no exact allowlisted nonterminal cancellation
status, unfamiliar nonterminal shapes remain conflict until a later adjudication.

Future exact GET success uses `PROVIDER_LOOKUP/SUCCEEDED/APPLIED`. Future processing and
conflict use `PROVIDER_LOOKUP/UNKNOWN` with `PARKED` or `CONFLICT`. Manual review is a policy
disposition, not a parser fact. E3C-A3 adds no lookup, evidence, processing, or manual writer.

## 6. Activation boundary

Same-key response-loss behavior, changed-body protection, transaction-key stability across
POST/replay/GET, and provider processing behavior remain SANDBOX activation blockers. LIVE
requires separate authority. No recovery gate, caller, worker, scheduler, route, action,
admin control, webhook authority, migration deployment, or provider request is introduced
by this contract.
