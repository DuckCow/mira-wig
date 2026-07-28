# Refund worker P3E-B2 review authority boundary v1

## 1. Status and scope

Status: architecture and truth-boundary document only.

This document discharges the chartered `P3E-B2-REVIEW-R0` track. It freezes prose truth limits and documentary defects only.

No reviewer trust root exists. No review artifact, review producer, review consumer, or current process gate exists. This document creates no review act and grants no review, approval, retention, storage, mutation, provider-contact, execution, or other implementation authority.

The v1 and v2 contracts, schemas, evaluators, tests, and dispositions remain byte-for-byte unchanged. This document does not amend, reconcile, convert, downgrade, or reinterpret either version.

REVIEW-R0 creates no runtime vocabulary, package identifier, state machine, evaluator, schema, producer, consumer, writer, trust root, signature, approval, or implementation authority.

## 2. Current v1 truth

Reviewer-present v1 records contain caller-supplied values in fields whose contract-defined names and `status: "PRESENT"` token represent reviewer presence and a review time. The record represents that assertion. It contains no human review content and establishes no fact about a review act.

The record contains no checklist, concern, reservation, disagreement, narrative, or other human review content. Its disposition is caller-supplied syntactically but machine-forced semantically for fresh evidence. A fresh record is rejected unless its supplied disposition equals the machine-derived billing and API disposition.

`READY_FOR_STATE_BUCKET_PACKAGE` depends on both the evidence bytes and caller-supplied `authoritativeNowMs`. Every reviewer field, both fingerprint values, `reviewedAt`, disposition, digest, and evaluation time can be caller-constructed.

Two unequal valid-format fingerprint strings establish no actual principals, identity ownership, identifier control, human distinction, reviewer attribution, independence, organizational separation, or self-review prevention.

Current v1 READY establishes internal machine coherence only. It proves no human review act, attribution, independence, authorization, or mutation permission. This document does not call v1 READY independently reviewed and does not reinterpret or rename the frozen disposition.

No review timestamp is required or admitted by REVIEW-R0. Existing documentary timestamps remain `CLAIMED`. Retention time and backend write time are not review time, and review or custody cannot reset evidence age.

V1 READY should not be relied upon as a review result. Reproducing a time-sensitive v1 evaluation would require the evaluator version and the caller-supplied evaluation time. That requirement supports machine-result reproducibility only; it does not admit the clock or make the caller-supplied value authoritative.

## 3. Current v2 truth and discharge boundary

Reviewer absence is mandatory in exact v2. Exact v2 cannot represent completed review or `READY_FOR_STATE_BUCKET_PACKAGE`. Its dispositions remain exactly:

- `INDEPENDENT_REVIEW_REQUIRED`
- `OBSERVATION_INCOMPLETE`

No committed attended evidence producer exists. No committed detached review producer exists. No reciprocal consumer currently recognizes detached review. Exact v2 therefore has no committed review-discharge path.

This current absence does not mean that every future detached path is impossible. Future detached discharge is not foreclosed, and a future v3 with embedded review is not foreclosed. This document designs no v3, countersignature, or two-stage review model.

Review associated with exact v1 or v2 must remain detached because those versions remain unchanged. `INDEPENDENT_REVIEW_REQUIRED` is not silently reinterpreted as discharged.

A reference to exact canonical v2 evidence or its intrinsic disposition needs no review-time input. Machine-result reproducibility is distinct from clock admission. Review, retention, custody, or backend write time cannot reset v2 evidence age.

## 4. Review subject and digest semantics

The current logical review subject is the exact canonical logical v2 evidence object. Arbitrary external filename, path, formatting, whitespace, trailing bytes, or other noncanonical file representation is not the review subject.

`integrity.evidenceSha256` directly hashes the canonical preimage with its own digest property omitted while retaining the contract version, canonicalization, and algorithm.

After successful intrinsic validation, under SHA-256 collision-resistance assumptions and the exact omission/reinsertion convention, the existing digest provides conditional logical-object binding. It does not directly hash external file bytes containing the digest itself.

The digest does not establish provider truth, collector honesty, review content, reviewer attribution, reviewer identity, independence, or authorization. Evidence bytes are required to recompute the digest and verify the subject binding.

The raw response-digest preimages are not verifiable from v2 evidence alone. The committed collector boundary does not return those raw bytes. This current boundary does not prove permanent unverifiability under every future authority.

No new full-byte digest is required or selected here. Any future authority introducing a new review artifact type must address digest-domain separation before selecting that artifact’s subject binding. This document defines no artifact schema, descriptor fields, field types, or new digest.

## 5. Informational-review checklist boundary

Human-specific informational review means applying judgment to the exact evidence subject, not restating machine-validated facts.

The minimum human-specific subject matter is exactly:

1. whether the recorded observations are adequate for the intended candidate use, given what the evidence cannot establish;
2. whether any unresolved or unobservable item is material to that use;
3. concerns, exceptions, and reservations;
4. facts not independently verified and not vouched for by the reviewer.

Checklist completion and concerns may be recorded by a future authority. Machine disposition is context only and is not a human conclusion. Provider facts cannot be independently verified from v2 evidence alone.

Fixed truth-limit disclaimers, consumer non-reciprocity, and authority limitations belong in this document. They are not substitutes for evidence-specific human judgment.

This document defines no final field names, field types, schema, pass/fail vocabulary, approval result, readiness result, suitability token, or authorization result.

The bounded sequence is: evidence bytes are presented, the checklist is completed, and concerns are recorded. That sequence does not establish that provider facts were independently verified, that review passed, that review was approved, or that mutation was authorized.

## 6. Consumer reciprocity

No instantiated review consumer exists. No reciprocal contractual consumer exists. State-bucket package intake is only a producer-side named candidate consumer.

No current transition depends on review. Review currently unlocks no action.

A genuine future process gate requires consumer-side binding authority that names:

- the exact subject;
- prerequisites;
- the exact action admitted;
- failure behavior when review is absent, unbound, or adverse;
- explicitly prohibited effects;
- explicit non-authority semantics.

Any future gate may admit preparation only. It creates no durable token and grants no state creation, API mutation, IAM mutation, storage, provider contact, execution, approval, or other capability.

Producer-side naming, review production, record existence, or an import cannot establish consumer reciprocity or instantiation.

## 7. Independence truth and limits

The v1 contract asserts an independent reviewer and forbids self-review. Its evaluator establishes only that two caller-provided valid-format fingerprint strings differ.

No reviewer authentication, identifier-control proof, identity trust root, organizational-separation authority, or enforceable self-review prevention exists.

This is a contract overclaim plus a documentary semantic mismatch. It is specifically not merely an implementation gap. Adding implementation code within current v1 cannot make its historical evidence establish facts that the version does not authenticate or bind.

Later identity code, workflow, tests, or trust infrastructure cannot retroactively upgrade historical v1 evidence.

Attributable or independent review requires future authority. It cannot be inferred from current v1 READY, fingerprint inequality, reviewer field names, `reviewedAt`, or machine coherence.

## 8. Documentary defect register

`REVIEW-D1`, `REVIEW-D2`, and `REVIEW-D3` are document-local findings only. They are not runtime states, error codes, schema fields, enum members, dispositions, package identifiers, test names, or public results. They must not appear in an evaluator, schema, contract, public result, or runtime state machine.

### REVIEW-D1 — no committed v2 review-discharge path

**Fact:** Exact v2 requires reviewer absence and cannot represent completed review. No committed detached producer and reciprocal consumer currently discharge review associated with v2.

**Why unresolved:** No authority defines the producer, subject binding, and reciprocal consuming transition.

**Blocks:** Claiming that current review discharges v2; claiming that v2 becomes READY; claiming that detached review currently unlocks intake.

**Does not block:** Intrinsic validation; transient informational consideration; future detached discharge; future v3.

**Owner:** The future authority responsible for review production and the consuming transition.

**Closure evidence:**

- At the documentary level: a bound informational-review producer; reciprocal consumer authority naming the exact subject and transition; explicit non-authority semantics; and committed behavior proof appropriate to that component. No trust root is required merely to establish documentary review.
- At the independent-review level: all documentary-level requirements plus closure of `REVIEW-D3`.

**Silent-closure prohibition:** A file, import, manual practice, unconsumed record, or producer without reciprocal authority does not close `REVIEW-D1`. Documentary-level closure does not establish independent review.

**Authority limit:** REVIEW-R0 records the absence and designs no discharge path.

### REVIEW-D2 — candidate consumer not reciprocally defined

**Fact:** Producer-side authority names state-bucket preparation. Consumer-side authority does not accept the evidence or review, and no transition currently depends on review.

**Why unresolved:** Reciprocity and instantiation both remain absent.

**Blocks:** Calling the consumer instantiated, reciprocal, contractual, or currently gated.

**Does not block:** Future consumer design; non-authorizing human consideration.

**Owner:** The future authority that owns state-bucket intake.

**Closure evidence:**

- Reciprocity closure: consumer-side binding authority naming the exact subject, prerequisites, action, failure behavior, prohibited effects, and non-authority semantics.
- Instantiation closure: committed consumer implementation demonstrating that transition.

**Silent-closure prohibition:** Producer-side prose, naming, imports, record existence, or review production alone do not establish reciprocity or instantiation.

**Authority limit:** REVIEW-R0 cannot appoint or instantiate the consumer.

### REVIEW-D3 — contracted independence not established by v1

**Fact:** V1 asserts an independent reviewer and forbids self-review. Its evaluator establishes only unequal caller-provided fingerprint strings.

**Why unresolved:** No authentication, identity-control proof, trust root, or organizational-separation authority exists.

**Blocks:** Treating v1 READY as proof of review, attribution, independence, or enforced self-review prohibition.

**Does not block:** Historical parsing; current-truth documentation; future successor review authority.

**Owner:** The future successor-contract and reviewer-trust authority.

**Closure evidence:** A successor authority with authenticated attribution and enforceable separation; reciprocal consumer authority if the result gates a process; and preservation of existing v1 as historically unupgraded.

**Silent-closure prohibition:** Later identity code, workflows, or tests do not retroactively repair v1.

**Authority limit:** REVIEW-R0 cannot amend or upgrade v1.

## 9. RETENTION-R0 inheritance

`P3E-B2-RETENTION-R0` may proceed only within these limits:

- no production evidence producer;
- no review producer;
- no reviewer trust root;
- no instantiated review consumer;
- no review artifact producer;
- exact canonical evidence bytes and existing bindings only;
- custody cannot establish provider truth, reviewer attribution, independence, or review occurrence;
- retention time and write time cannot become review time;
- evidence age is not reset;
- retention creates no approval or authorization;
- review artifact shape remains out of scope until `REVIEW-D1` closes at the documentary level.

Within that boundary, RETENTION-R0 may address custody, versioning, durability, recovery, deletion, audit, and backup without claiming authenticity, provider truth, reviewer identity, or review truth.

## 10. Kill conditions

Any later interpretation, document, or implementation violates this boundary if it:

- treats v1 READY as independent human review;
- treats unequal fingerprint strings as principals, humans, or controlled identities;
- treats reviewer field names as proof that a review act occurred;
- treats machine disposition as human judgment;
- treats structural validation or digest verification as review;
- treats `reviewedAt` or another documentary timestamp as admitted human-action time;
- resets evidence age through review, custody, retention, or backend write time;
- treats v2 `INDEPENDENT_REVIEW_REQUIRED` as discharged;
- converts, downgrades, or silently interprets v2 as v1;
- treats detached review as a current gate, approval, or authorization;
- consumes a review artifact for mutation or provider-contact execution without new authority;
- calls the candidate consumer reciprocal, contractual, or instantiated before the corresponding closure;
- introduces pass/fail review vocabulary without a consumer;
- substitutes fixed machine facts for human judgment in the checklist;
- binds the review subject only to a mutable filename or path;
- treats the existing digest as provider truth, reviewer attribution, or identity evidence;
- introduces a new digest or artifact schema before future subject-domain and consumer authority;
- reuses `canonicalizeTb1Restricted` plus SHA-256 for a new artifact type without a domain-separation tag;
- trusts a signature without a trust root;
- treats retention as identity proof;
- treats review time, backend write time, or custody time as provider observation time;
- treats later identity code as retroactive repair of v1;
- uses a documentary defect identifier as runtime vocabulary;
- introduces an ALL_CAPS_SNAKE documentary defect label;
- declares a defect closed at one level while a required bundled level remains open;
- uses REVIEW-R0 to select an identity provider, signing mechanism, retention implementation, approval implementation, or provider operation;
- silently changes v1, v2, TIME-R0, intrinsic-validation authority, attended-collector authority, state authority, or canary authority.

## 11. Explicit exclusions

REVIEW-R0 does not determine:

- reviewer identity provider;
- signing mechanism;
- key custody;
- organizational role authority;
- trust anchor;
- revocation;
- review artifact schema;
- artifact field names or types;
- review producer implementation;
- consumer implementation;
- review timestamp source;
- pass/fail vocabulary;
- approval;
- expiry;
- single-use consumption;
- mutation or execution authority;
- retention backend;
- raw source-response retention;
- future v3 design;
- countersignature;
- two-stage embedded review;
- legal-signature meaning;
- reachability test.

No test is created or planned by this document. No package identifier is minted. No new public or internal runtime vocabulary is introduced. No review state machine is introduced.

Review associated with exact v1 or v2 must remain detached because those versions remain unchanged. Future versions with embedded review are not foreclosed.

This document makes no external identity, provider, storage, retention, cryptographic-signature, organizational, or legal guarantee.
