# Refund worker P3E-B2 time truth and authority boundary v1

## 1. Status, purpose and non-activation

Status: repository time-truth and authority-boundary document only.

This document discharges the chartered `P3E-B2-TIME-R0` track. It selects no clock source, admits no timestamp, creates no producer or consumer, defines no runtime state, and grants no storage, review, approval, mutation, or execution authority. No production TIME implementation currently exists.

This document records only truth distinctions, current reachability, two documentary defects, restrictions on `P3E-B2-REVIEW-R0`, kill conditions, and explicit exclusions. Existing versioned contracts, schemas, evaluators, and tests retain their own authority; this document does not amend or reconcile them.

The chartered track includes failure semantics. Because no production timestamp producer, admitted source, and time-dependent consumer currently coexist, no new public TIME failure vocabulary or internal cross-package TIME failure vocabulary can lawfully be frozen here. Existing `EVIDENCE_STALE_OR_UNTRUSTED` remains owned by v1 and is not general TIME vocabulary. Future failure semantics belong to the future component in which a producer, admitted source, and exact consumer coexist. The absence of new vocabulary is an affirmative fail-closed architecture decision, not an omission. This reasoned refusal is the TIME-R0 failure-semantics decision.

## 2. Truth domains and non-substitution

There are exactly three clock domains.

**Wall-time claim**

A wall-time claim is a host-side epoch or UTC claim. It does not prove correct UTC, elapsed duration, provider state, cross-host order, or mutation currency.

**Monotonic elapsed duration**

A monotonic elapsed duration is a difference between readings under one process and time origin. It does not prove UTC, provider time, cross-process order, restart continuity, or durable order.

**Durable-backend time**

Durable-backend time is a backend-side time reading for a named transaction or write decision. It does not prove provider observation time, universal UTC authority, safety outside that transaction, or collection occurrence time.

**Provider observation as a non-clock referent**

A provider observation is a provider response asserting state. It is a non-clock referent, not a fourth clock domain or time source. The v2 attended collector’s repository-defined command surfaces carry no provider timestamp. No clock reading substitutes for provider-state currency. Evidence age and elapsed duration do not prove that previously observed provider state remains current.

No value from one clock domain may silently substitute for another clock domain or for provider observation.

## 3. Provenance relations

`CLAIMED`, `PRODUCED_BY`, and `ADMITTED_FOR` are prose relations. They are not enums, runtime states, dispositions, public tokens, or failure vocabulary.

**CLAIMED**

A value is structurally present in a record. Structural presence proves no producer, authenticity, correctness, or authority.

**PRODUCED_BY**

A named code path generated a value in a named mode. Runtime is an attribute of this relation and is `UNKNOWN` for every current row unless committed source proves otherwise. Fixture production and production production are distinct facts.

**ADMITTED_FOR**

A named binding authority accepts a named producer’s output for a named purpose, consumer, and version. Structural validation, range checking, canonicalization, or successful pure evaluation do not constitute admission.

ADMITTED_FOR is currently the empty relation for P3E-B2 time values.

Populating `ADMITTED_FOR` requires all of the following:

- A committed binding authority
- A named producer
- An exact purpose
- An exact consumer
- An exact version
- Explicit truth limitations

Generic provenance states named OBSERVED or VERIFIED are not introduced.

## 4. Current reachability matrix

| Value or edge | CLAIMED | PRODUCED_BY | ADMITTED_FOR | Current reachability |
|---|---|---|---|---|
| v1 timestamp fields | The v1 shape can contain `collection.startedAt`, `collection.completedAt`, and present-reviewer `review.reviewedAt`. | Test helper `makeEvidence` constructs timestamp strings in TEST mode; runtime `UNKNOWN`. No production producer exists. | None; the relation is empty. | The parser and evaluator can validate caller-supplied records. READY is reachable in tests, but no committed caller reaches the contractual consumer. |
| v2 timestamp fields | The v2 shape can contain collection wall timestamps, per-command wall timestamps, per-command `durationMs`, and `totalDurationMs`. | Test helpers and the fixture self-check construct these values in TEST or FIXTURE_SELF_CHECK mode; runtime `UNKNOWN`. No production producer exists. | None; the relation is empty. | Assembly and evaluation are reachable through tests and fixture self-check only. |
| Fixture self-check wall timestamps | Wall start and completion values are structurally present in fixture receipts and the assembled collection. | `runFixtureCommand` and `runTb2aCollectorSelfCheck` use `Date.now()` in FIXTURE_SELF_CHECK mode; runtime `UNKNOWN`. | None; the relation is empty. | Values reach fixture evidence assembly only. They are not production authority. |
| Fixture self-check monotonic durations | Per-command `durationMs` and aggregate duration values are structurally present. | `runFixtureCommand` uses a `performance.now()` difference in FIXTURE_SELF_CHECK mode; runtime `UNKNOWN`. | None; the relation is empty. | Values reach fixture evidence assembly only. They do not prove UTC or provider currency. |
| Attended process-command result | `Tb2aCommandResult` contains command-specific result data and no `startedAt`, `completedAt`, or `durationMs`. | `executeTb2aProcessCommand` can produce the result in ATTENDED_GCLOUD mode; runtime `UNKNOWN`. | None; the relation is empty. | No committed non-test caller completes the attended collection flow, and the result cannot by itself satisfy the receipt input. |
| Attended timing receipt | `Tb2aCommandReceipt` structurally requires wall start, wall completion, and monotonic duration. | No committed attended wrapper produces it; runtime therefore has no current producer value. | None; the relation is empty. | The producer edge is absent. ATTENDED mode cannot currently assemble v2 evidence. |
| Assembler input | The assembler shape claims six ordered receipts and caller-supplied `authoritativeNowMs`. | Tests and `runTb2aCollectorSelfCheck` construct assembler requests in TEST or FIXTURE_SELF_CHECK mode; runtime `UNKNOWN`. | None; the relation is empty. | Fixture and test calls reach the assembler. No attended production wrapper does. |
| Caller-supplied `authoritativeNowMs` | The assembly and evaluation boundaries structurally accept an integer epoch value. | The fixture self-check supplies `Date.now()` and tests supply fixed values; modes FIXTURE_SELF_CHECK and TEST; runtime `UNKNOWN`. No production source exists. | None; the relation is empty. | No production caller or source supplies an admitted value. Integer and range validation do not make the caller value authoritative. |
| Intrinsic validator | No time value is claimed by its one-argument result contract. | It produces no time value; runtime is not applicable to a time producer. | None; the relation is empty. | Intrinsic validation is clock-free and deliberately does not evaluate stale or future status. |
| Evidence writer and custody | No production writer or custody timestamp is currently claimed. | No production writer or custody path exists. | None; the relation is empty. | Storage and custody remain absent and unauthorized. |

Current validation treats wall intervals and monotonic durations independently. It checks wall ordering and bounds, and separately checks monotonic duration bounds and their aggregate. No committed code reconciles the wall-time delta with the monotonic duration for a command. This is a current reachability fact, not permission to add a new check or change v2 semantics.

## 5. Separate v1 and v2 documentary facts

### V1

- The v1 contract fixes a 900-second maximum age.
- The v1 contract fixes a 60-second future allowance.
- The implementation applies that allowance to collection completion and to a present reviewer’s `reviewedAt`.
- Stale evidence may produce the version-owned disposition `EVIDENCE_STALE_OR_UNTRUSTED`.
- Future-dating beyond the allowance produces generic invalid evidence.
- `READY_FOR_STATE_BUCKET_PACKAGE` is reachable with the v1 reviewer model.
- Acceptance of a review timestamp exactly 60 seconds in the future is current tested behavior.
- That behavior is recorded, not endorsed.
- The contractual consumer of `READY_FOR_STATE_BUCKET_PACKAGE` is permission to begin a separately authorized state-bucket package.
- No committed caller reaches that contractual consumer.

### V2

- The v2 contract and schema fix a 900-second maximum age.
- The v2 contract and schema contain no future-clock allowance.
- The implementation applies the v1 60-second constant.
- The reviewer must remain absent.
- `READY_FOR_STATE_BUCKET_PACKAGE` is forbidden.
- Stale and future-dated records collapse to generic invalid evidence.
- No direct v2 maximum-age or future-skew boundary test exists.
- No current production consumer exists.

The common numeric value 900 does not create common semantics across versions. V1 and v2 remain separate documentary facts in their own vocabularies. This document does not reinterpret, reconcile, or amend either version.

## 6. Documentary defect register

`TIME-D1` and `TIME-D2` are document-local findings only. They are not runtime states, error codes, enum members, dispositions, package identifiers, test names, or public results. They must not appear in an evaluator, schema, machine-readable contract, or public result.

### TIME-D1 — attended timing-receipt producer absent

**Fact:** `executeTb2aProcessCommand` returns `Tb2aCommandResult`, which carries no `startedAt`, `completedAt`, or `durationMs`. The assembler requires six `Tb2aCommandReceipt` values carrying all three fields. Only the fixture self-check constructs such receipts.

**Why unresolved:** No committed authority assigns this edge.

**Owner:** The future package that owns attended timing-receipt production.

**Blocks:** Attended evidence assembly; production time-source admission; any claim that attended collection currently produces evidence.

**Does not block:** This document; intrinsic validation; `P3E-B2-REVIEW-R0` within its non-temporal scope.

**Closure evidence:** Committed authority naming the producer, mode, and truth limits; committed receipt production; explicit admission for a named consumer and version.

**Silent-closure prohibition:** The appearance of code alone does not close `TIME-D1`.

**Authority limit:** TIME-R0 does not design or implement the producer.

### TIME-D2 — evidence-v2 future-allowance unresolved semantic mismatch

**Fact:** The v2 contract has no future allowance; the v2 schema has no future allowance; the evaluator applies `TB1_FUTURE_CLOCK_ALLOWANCE_SECONDS`; and no direct v2 maximum-age or future-skew boundary test exists.

**Why unresolved:** The repository proves current behavior but not intent. Contract omission, evaluator overreach, and deliberate inheritance remain possible explanations. This document chooses none of them.

**Owner:** The future authority permitted to adjudicate the v2 contract and evaluator relationship.

**Blocks:** Reuse of 60 seconds as precedent; any claim that v2 time semantics are fully specified by v2 authority.

**Does not block:** This document; intrinsic validation; v1’s contracted and tested behavior; `P3E-B2-REVIEW-R0` within its non-temporal scope.

**Closure evidence:** An authorized v2 contract or schema amendment, or an authorized evaluator change; direct version-appropriate boundary tests; preserved version immutability and explicit change control.

**Silent-closure prohibition:** Adding a test that pins current behavior does not alone supply missing contract authority.

**Authority limit:** TIME-R0 does not modify or resolve v2.

## 7. REVIEW-R0 restrictions

`P3E-B2-REVIEW-R0` may proceed only on reviewer meaning, reviewer identity, trust root, lawful consumer, and documentary meaning.

It must characterize the existing `reviewedAt >= completedAt` constraint and the existing exact 60-second future acceptance only as intrinsic record-coherence behavior. It must not derive from either behavior:

- When a human actually reviewed
- Security ordering
- Expiry
- Authorization
- Mutation permission
- Provider currency
- Evidence-age reset
- Nonrepudiation
- Ownership of the reviewer identity

Documentary timestamps remain `CLAIMED`. `ADMITTED_FOR` remains empty.

REVIEW-R0 must not define an expiring review, an authorizing review, host-clock-based approval, promotion of v1 READY into a durable token, or custody or review that resets evidence age. It must not treat review or custody time as provider observation time.

## 8. Kill conditions

Any later interpretation, document, or implementation violates this boundary if it does any of the following:

- Treats caller-provided `authoritativeNowMs` as production authority
- Promotes fixture or test values into production
- Treats structural validation, range checking, canonicalization, or pure evaluation as admission
- Collapses `CLAIMED`, `PRODUCED_BY`, and `ADMITTED_FOR`
- Uses wall time as elapsed duration
- Uses monotonic duration as UTC
- Treats local receipt time as provider response-generation time
- Uses evidence age or elapsed delay as provider-state currency
- Treats retention, review, or custody time as observation time
- Resets evidence age through custody or review
- Silently merges or reinterprets v1 and v2
- Reuses the undocumented v2 60-second behavior as precedent
- Makes intrinsic validation freshness-dependent
- Introduces a public or internal cross-package TIME failure state without a coexisting producer, admitted source, and consumer
- Introduces a package identifier not already created by binding authority
- Records merely unstarted future research as a documentary defect
- Treats generation, etag, update time, a provider precondition, backend lock, recovery identity, configuration fingerprint, or database transactional CAS as interchangeable
- Claims that a production attended timing producer exists
- Introduces external signed-time or universal-clock abstraction without a new design lock
- Uses TIME-R0 to grant review, retention, custody, approval, mutation, or execution authority

Only `P3E-B2-TIME-R0`, `P3E-B2-REVIEW-R0`, and `P3E-B2-RETENTION-R0` may appear as committed track names. This document creates no additional package or phase identifier.

## 9. Explicit exclusions

This document does not determine:

- Producer implementation
- Producer runtime
- Wall and monotonic sampling order
- Clock-coherence tolerance
- Production clock admission
- Mutation-adjacency duration
- Provider preconditions
- Exact mutation-surface currency
- Post-mutation probe sufficiency
- Approval backend
- Approval expiry
- Rollback or high-water design
- Retention backend
- Audit timestamp semantics
- Public TIME state vocabulary

Mutation-currency mechanisms are exact-surface concerns. Provider
re-observation, provider-side conditional mutation, post-mutation observed
effect, Terraform state locking, recovery generation, configuration equality
and database transactional CAS are distinct mechanisms and must not be treated
as interchangeable. TIME-R0 selects none of them.

This document contains no phase-ownership table, external-research list, planning package identifier, implementation sequence, numeric adjacency value, or approval conclusion. It authorizes no source, runtime, producer, consumer, storage, review, retention, custody, approval, mutation, or execution implementation.
