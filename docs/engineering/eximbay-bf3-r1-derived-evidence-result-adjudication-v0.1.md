# Eximbay BF3-R1 E1 Derived-Evidence — Result Evidence / Independent Adjudication v0.1

## Status

```text
DOCUMENT CLASS:
  RESULT EVIDENCE / INDEPENDENT ADJUDICATION

RISK CLASS:
  HIGH — PAYMENT SDK SUPPLY-CHAIN / STATIC EVIDENCE

TASK CLASSIFICATION:
  EVIDENCE_ADJUDICATION_RECORD

TASK-LEVEL AUTHORIZATION:
  DOCUMENTATION ONLY

BF3-R1 RESULT / ADJUDICATION RECORD:
  CANDIDATE — PENDING ONE INDEPENDENT RESULT-RECORD REVIEW

BF3-R1 E1 PACKAGE:
  VALID

BF3-R1 E1 EXECUTION:
  CONFORMANT

DERIVED SEMANTIC EVIDENCE:
  COMPLETE_ADMITTED

HISTORICAL BF3 RESULT:
  IMMUTABLE

BF3-R1 E1 RE-EXECUTION:
  NOT AUTHORIZED

PROVIDER CONTACT:
  NOT AUTHORIZED

JAVASCRIPT EXECUTION:
  NONE

BROWSER EXECUTION:
  NONE

EX2B2:
  BLOCKED

NEXT LAWFUL GATE:
  NO_PROVIDER_CONTACT_NEEDED_YET
```

## 1. Purpose and authority boundary

This candidate authors the proposed durable repository binding and independent
adjudication of the completed BF3-R1 E1 zero-provider-contact derived-evidence
run. Subject to the required independent review and later installation, it
binds external evidence by run ID, canonical basename, byte count, SHA-256,
and adjudicated relationship. It does not copy external evidence into Git or
make a historical local custody path a portable dependency.

This record is descriptive. It grants no provider request, BF3 or BF3-R1
re-execution, retained SDK source inspection, ECMAScript analysis, JavaScript
execution, browser execution, revised evidence-method design, EX2B2 design or
implementation, payment behavior, or runtime activation authority.

## 2. Governing documentation

This record is governed by:

1. [BF3-R1 Content-Type Anomaly Retained-Byte Derived-Evidence Contract v0.1](./eximbay-bf3-r1-content-type-anomaly-retained-byte-evidence-contract-v0.1.md), the installed BF3-R1 normative execution authority.
2. [BF3 Static JavaScript SDK Evidence / Execution Contract v0.1](./eximbay-bf3-static-javascript-sdk-evidence-contract-v0.1.md), the historical BF3 normative execution authority.
3. [BF3 Static JavaScript SDK Result Evidence / Independent Adjudication v0.1](./eximbay-bf3-static-sdk-result-adjudication-v0.1.md), the installed historical BF3 result authority.
4. The exact DerivedEvidencePackageIntegrity-v1 and DerivedEvidence-v1 bytes
   identified below.
5. Repository and Git history identified below.

Package admission, execution conformance, and semantic evidence disposition
remain separate dimensions.

## 3. BF3-R1 contract installation binding

Independent repository-history and installed-byte verification establishes:

```text
contract PR:
  #57

reviewed head:
  08419e699a79e60a5b60d235cba33123b04005a0

contract merge:
  dc253973ee5e20c1e7710cf722589e2f58d70ed4

installed contract bytes:
  59686

installed contract SHA-256:
  6e8fa1eb29575a03c9cc8e39a9874facf2c64079bdfaba996ab9c00b3c7868c9
```

## 4. Derived run identity

```text
derivedRunId:
  20260812T003616Z-88533a1e

historicalBf3RunId:
  20260811T220109Z-c4779de2

historical local derived-evidence root:
  /Users/duckcow/mira-evidence/eximbay-bf3-r1/20260812T003616Z-88533a1e
```

The absolute path records historical local custody context only. Durable
repository authority is the run identity and exact artifact bindings below.

## 5. External package inventory

The independently verified durable inventory contains exactly three files:

| Artifact | Package location | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| DerivedEvidencePackageIntegrity-v1 | `bf3-r1-derived-evidence-package-integrity-v1-20260812T003616Z-88533a1e.json` | 1423 | `f5ce567de7ecfb1aa6a729c624417f1d02243f7e8258835d8880af2f65e52f1e` |
| DerivedEvidence-v1 original | `original/bf3-r1-derived-evidence-v1-20260812T003616Z-88533a1e.json` | 8233 | `76ae11e1e5c2de3d09ef0ac016274279f9738d825be4ebe9c38c6efe33f55a55` |
| DerivedEvidence-v1 archive | `archive/bf3-r1-derived-evidence-v1-20260812T003616Z-88533a1e.json` | 8233 | `76ae11e1e5c2de3d09ef0ac016274279f9738d825be4ebe9c38c6efe33f55a55` |

All three are regular non-symlink files. The original and archive have
distinct stable filesystem identities and are directly byte-equal.

## 6. Canonical evidence verification

All three admitted JSON artifacts were independently verified under
`BF3_CANONICAL_JSON_UTF8_V1`:

```text
strict UTF-8:
  VERIFIED

BOM:
  ABSENT

line endings:
  LF ONLY

schema field order:
  EXACT

canonical scalar forms:
  VERIFIED

final LF:
  EXACTLY ONE

read-only recanonicalization:
  DIRECT BYTE IDENTITY VERIFIED
```

This verification inspected only the derived JSON artifacts. It did not
reinterpret or source-inspect retained SDK bodies.

## 7. PackageIntegrity binding and package admission

```text
canonical basename:
  bf3-r1-derived-evidence-package-integrity-v1-20260812T003616Z-88533a1e.json

byte count:
  1423

SHA-256:
  f5ce567de7ecfb1aa6a729c624417f1d02243f7e8258835d8880af2f65e52f1e

packageIntegrityOutcome:
  PACKAGE_VALID

packageIntegrityReason:
  NONE

PACKAGE ADMISSION:
  VALID
```

## 8. DerivedEvidence original/archive binding

```text
canonical basename:
  bf3-r1-derived-evidence-v1-20260812T003616Z-88533a1e.json

original bytes:
  8233

original SHA-256:
  76ae11e1e5c2de3d09ef0ac016274279f9738d825be4ebe9c38c6efe33f55a55

archive bytes:
  8233

archive SHA-256:
  76ae11e1e5c2de3d09ef0ac016274279f9738d825be4ebe9c38c6efe33f55a55

original/archive filesystem identity:
  DISTINCT

direct byte equality:
  EQUAL
```

## 9. Execution conformance

The independently adjudicated execution result is:

```text
BF3-R1 E1 execution count:
  ONE ADMITTED RUN

provider requests:
  0

browser requests:
  0

JavaScript execution:
  0

ECMAScript AST/syntax parsing:
  0

vendor contact:
  0

repository mutation:
  NONE

historical evidence mutation:
  NONE

EXECUTION CONFORMANCE:
  CONFORMANT
```

The initial macOS system Python launcher was unavailable because of host
Xcode-license state. The frozen implementation subsequently executed once
using an already-installed bundled Python runtime. This was not a method
preflight failure, had no adjudicated execution effect, and is not a semantic
evidence defect.

## 10. Historical upstream custody

```text
historical adjudication merge:
  0e19a80b55a5a61d00a9f18bf2f01cafe7f7cc45

HISTORICAL UPSTREAM CUSTODY:
  VALID / VERIFIED
```

The BF3-R1 adjudicator revalidated the upstream historical custody chain:

| Historical artifact | Bytes | SHA-256 | Binding |
| --- | ---: | --- | --- |
| PackageIntegrity-v1 | 1199 | `3ffabb7bffa44e16edfb3958993d1487d9b7a42a6215d945ad6eb8b34405780c` | `PACKAGE_VALID / NONE` |
| Result-v1 | 7200 | `daa413c8754969f4187079b45c722bb1a79a0da77a6725927814c8105269de5a` | original/archive directly equal |
| TEST V2 | 4287 | `d324cb484f3c4c56f949329f5ddf4ca62e012c72ef530febe3ce77db35a396b7` | distinct original/archive, directly equal |
| TEST V1 | 3459 | `9b818e54c11267d85f9c57a0e2e10370abb850d1a20df4368cde4b4bd8a89ef2` | distinct original/archive, directly equal |

The retained TEST V2 and TEST V1 bodies were treated as opaque custody-bound
bytes during adjudication. Only the observations admitted through
DerivedEvidence-v1 are described below.

## 11. TEST V2 admitted facts

```text
UTF-8:
  SUCCEEDED

literalSearchOutcome:
  COMPLETED

PUBLIC_EXIMBAY_LITERAL:
  OBSERVED_IN_RETAINED_TEXT

REQUEST_PAY_LITERAL:
  OBSERVED_IN_RETAINED_TEXT

TEST_ORIGIN_LITERAL:
  OBSERVED_IN_RETAINED_TEXT

PRODUCTION_ORIGIN_LITERAL:
  NOT_OBSERVED_IN_RETAINED_TEXT

V1_PAYMENTS_PATH_LITERAL:
  OBSERVED_IN_RETAINED_TEXT

jsonParseOutcome:
  FAILED

jsonTopLevelKind:
  NOT_APPLICABLE
```

No source snippet, matched context, offset, full retained text, or parsed
source structure is admitted by this record.

## 12. TEST V1 admitted facts

```text
UTF-8:
  SUCCEEDED

literalSearchOutcome:
  COMPLETED

PUBLIC_EXIMBAY_LITERAL:
  OBSERVED_IN_RETAINED_TEXT

REQUEST_PAY_LITERAL:
  OBSERVED_IN_RETAINED_TEXT

TEST_ORIGIN_LITERAL:
  OBSERVED_IN_RETAINED_TEXT

PRODUCTION_ORIGIN_LITERAL:
  NOT_OBSERVED_IN_RETAINED_TEXT

V1_PAYMENTS_PATH_LITERAL:
  OBSERVED_IN_RETAINED_TEXT

jsonParseOutcome:
  FAILED

jsonTopLevelKind:
  NOT_APPLICABLE
```

## 13. Bounded V2/V1 comparison

```text
UTF-8:
  BOTH_SUCCEEDED

PUBLIC_EXIMBAY_LITERAL:
  BOTH_OBSERVED

REQUEST_PAY_LITERAL:
  BOTH_OBSERVED

TEST_ORIGIN_LITERAL:
  BOTH_OBSERVED

PRODUCTION_ORIGIN_LITERAL:
  BOTH_NOT_OBSERVED

V1_PAYMENTS_PATH_LITERAL:
  BOTH_OBSERVED

JSON:
  BOTH_FAILED

JSON top-level kind:
  NOT_APPLICABLE

historical raw-byte inequality:
  CARRIED_FORWARD_FROM_HISTORICAL_BF3
```

The retained bodies are historically known to differ at raw-byte level. This
record does not call them semantically identical.

## 14. Warning set

```text
warnings:
  []
```

There was no custody failure, UTF-8 invalidity, or operational method failure.
A deterministic frozen-JSON-grammar `FAILED` result is complete negative
structural evidence, not an execution warning.

## 15. Derived semantic outcome

```text
DERIVED SEMANTIC EVIDENCE:
  COMPLETE_ADMITTED

DerivedEvidence outcome:
  DERIVED_TEXT_EVIDENCE_COMPLETE
```

`COMPLETE_ADMITTED` does not mean browser compatibility, valid JavaScript,
canonical SDK selection, resolved provider documentation, or EX2B2 readiness.

## 16. Captured Content-Type/body-grammar mismatch

The historical BF3 transport evidence established, for both exact captured
responses:

```text
declared Content-Type:
  application/json
```

The admitted BF3-R1 derived evidence established, for both retained exact
bodies:

```text
frozen RFC 8259 JSON grammar:
  FAILED
```

Therefore, and only for those exact historical captured responses under the
frozen BF3-R1 grammar recognizer:

```text
captured header/body-grammar mismatch:
  OBSERVED
```

This is not a universal statement about current Eximbay responses.

## 17. Evidence ceiling and prohibited overclaims

The admitted evidence does **not** establish:

- that either retained body is valid ECMAScript or parses as JavaScript;
- that either body creates `EXIMBAY` at runtime;
- that `request_pay` is callable or any observed literal belongs to executable
  code;
- that either SDK loads successfully in a browser;
- that response headers are invariant under browser request context;
- that current provider responses match the historical bytes;
- that either V1 or V2 is canonical, deprecated, or preferred;
- that Eximbay is misconfigured;
- that `/v1/payments` implies SDK asset V1 or that the V2 asset is actually V1;
- that EX2B2 is ready.

## 18. SDK asset version and REST API version

```text
SDK asset-version axis
and
REST API path-version axis:
  DISTINCT / NOT COLLAPSED
```

Observing `/v1/payments` in both retained bodies proves no SDK version
equivalence, precedence, canonicality, or mapping.

## 19. Historical BF3 immutability

```text
BF3 PACKAGE:
  VALID

BF3 EXECUTION:
  CONFORMANT

BF3 SEMANTIC EVIDENCE:
  INVALID_OR_INCOMPLETE

historical BF3 disposition:
  BF3_EVIDENCE_INVALID_OR_INCOMPLETE

HISTORICAL BF3 RESULT:
  IMMUTABLE

BF3 RE-RUN:
  NOT AUTHORIZED
```

BF3-R1 adds independently governed evidence. It does not rewrite, repair, or
retroactively reinterpret BF3 v0.1.

## 20. Re-execution and contact boundaries

```text
BF3-R1 E1 RE-EXECUTION:
  NOT AUTHORIZED

PROVIDER CONTACT:
  NOT AUTHORIZED BY BF3-R1 E1 OR THIS ADJUDICATION

JAVASCRIPT EXECUTION:
  NONE

BROWSER EXECUTION:
  NONE
```

There is no confirmation run, second DerivedEvidence run, SDK endpoint
request, vendor contact, ECMAScript analysis, or automatic transition to
JavaScript/browser execution. Any later provider evidence action requires a
new reviewed contract, explicit authority, run identity, and evidence purpose.

## 21. EX2B2 boundary

```text
EX2B2:
  BLOCKED
```

The admitted evidence authorizes neither EX2B2 design nor implementation.

## 22. Next lawful gate

```text
NEXT LAWFUL GATE:
  NO_PROVIDER_CONTACT_NEEDED_YET
```

This is an adjudicated next-gate class. It is neither provider-contact
authority nor execution authority for any new method.

## 23. Meaning of `NO_PROVIDER_CONTACT_NEEDED_YET`

A further separately reviewed local, zero-provider-contact, non-executing
static evidence method may still materially reduce uncertainty before any new
provider request is justified. The independently identified candidate class is
offline ECMAScript grammar and/or bounded source-shape evidence over the exact
retained bytes.

This record does not design or authorize that method. A later contract would
have to freeze its grammar, bounded questions, custody inputs, non-execution
properties, schema, outcomes, and lifecycle authority.

## 24. Broader-gate deferral

```text
HEADER_REQUEST_CONTEXT_EVIDENCE_REQUIRED:
  NOT SELECTED YET — DETERMINISTIC OFFLINE EVIDENCE REMAINS UNEXHAUSTED

CONTROLLED_BROWSER_EVIDENCE_REQUIRED:
  NOT SELECTED YET — BROADER AND HIGHER RISK THAN THE REMAINING OFFLINE AVENUE

VENDOR_CLARIFICATION_REQUIRED:
  NOT SELECTED YET — LOWER-COST DETERMINISTIC EVIDENCE REMAINS

EVIDENCE_PATH_STOP:
  NOT SELECTED — VALID ADMITTED EVIDENCE EXISTS AND USEFUL UNCERTAINTY REMAINS LOCALLY REDUCIBLE
```

These gates are deferred, not permanently excluded.

## 25. External evidence retention

DerivedEvidence-v1, DerivedEvidencePackageIntegrity-v1, historical Result-v1,
historical PackageIntegrity-v1, and historical SDK assets remain outside Git.
This record binds them only by run ID, canonical basename, byte count,
SHA-256, and adjudicated relationship.

## 26. Change control

This v0.1 record describes only derived run
`20260812T003616Z-88533a1e` and historical BF3 run
`20260811T220109Z-c4779de2`. Any changed evidence identity, semantic
reinterpretation, method, authority, next gate, or lifecycle boundary requires
explicit review and a new version or supersession record. External artifacts
and the historical BF3 result remain immutable.

## 27. Required self-audit

```text
Q1. Does the record rewrite historical BF3 semantic truth?
NO

Q2. Does the record claim either retained body is valid JavaScript?
NO

Q3. Does observing /v1/payments in both bodies select SDK V1?
NO

Q4. Does DERIVED_TEXT_EVIDENCE_COMPLETE mean browser compatibility?
NO

Q5. Does NO_PROVIDER_CONTACT_NEEDED_YET automatically authorize the next
offline ECMAScript method?
NO

Q6. Does this record authorize any provider request?
NO

Q7. Does this record authorize EX2B2?
NO
```

## 28. Independent review requirement

```text
BF3-R1 RESULT / ADJUDICATION RECORD:
  CANDIDATE

NEXT:
  ONE INDEPENDENT RESULT-RECORD REVIEW
```

That review is limited to repository/evidence identity, record fidelity,
package/adjudication facts, evidence ceiling, lifecycle authority, and
next-gate representation. It must not reopen BF3-R1 execution or perform
another broad technical review.

## Verdict

```text
BF3-R1 E1 PACKAGE:
  VALID

BF3-R1 E1 EXECUTION:
  CONFORMANT

DERIVED SEMANTIC EVIDENCE:
  COMPLETE_ADMITTED

HISTORICAL BF3 RESULT:
  IMMUTABLE

BF3-R1 E1 RE-EXECUTION:
  NOT AUTHORIZED

PROVIDER CONTACT:
  NOT AUTHORIZED

JAVASCRIPT / BROWSER EXECUTION:
  NONE

EX2B2:
  BLOCKED

NEXT LAWFUL GATE:
  NO_PROVIDER_CONTACT_NEEDED_YET

BF3-R1 RESULT / ADJUDICATION RECORD:
  AUTHORED / CANDIDATE

NEXT:
  INDEPENDENT RESULT-RECORD REVIEW
```
