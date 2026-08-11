# Eximbay BF3 Static JavaScript SDK — Result Evidence / Independent Adjudication v0.1

## Status

```text
DOCUMENT CLASS:
  RESULT EVIDENCE / INDEPENDENT ADJUDICATION

RISK CLASS:
  HIGH — EXTERNAL PAYMENT-PROVIDER SDK EVIDENCE

TASK CLASSIFICATION:
  EVIDENCE_ADJUDICATION

TASK-LEVEL AUTHORIZATION:
  DOCUMENTATION ONLY

BF3 CONTRACT:
  REVIEWED / MERGED / HISTORICAL NORMATIVE EXECUTION AUTHORITY

BF3 EXECUTION:
  COMPLETE — ONE AUTHORIZED RUN

PACKAGE ADMISSION:
  VALID

EXECUTION CONFORMANCE:
  CONFORMANT

SEMANTIC RESULT:
  INVALID_OR_INCOMPLETE

BF3 DISPOSITION:
  BF3_EVIDENCE_INVALID_OR_INCOMPLETE

BF3 RE-RUN:
  NOT AUTHORIZED

EX2B2:
  BLOCKED

EXIMBAY SDK CANONICAL VERSION:
  UNRESOLVED

EXIMBAY RUNTIME ACTIVATION:
  NONE
```

## 1. Purpose and authority boundary

This record installs the durable repository evidence and independent
adjudication for the completed Eximbay BF3 static JavaScript SDK run. It binds
the external evidence by run ID, canonical basenames, byte counts, SHA-256
values, and adjudicated relationships. It does not copy the evidence package
into Git.

This record is descriptive. It does not amend the historical
[BF3 execution contract](./eximbay-bf3-static-javascript-sdk-evidence-contract-v0.1.md),
contact Eximbay, reinterpret retained SDK bodies, authorize another request,
design a revised evidence method, select a canonical SDK, authorize EX2B2, or
activate an Eximbay runtime.

Package validity, execution conformance, and semantic evidence validity are
independent dimensions. Valid custody does not make the BF3 semantic result a
success, and invalid/incomplete semantic evidence does not make the execution
nonconformant.

## 2. Governing documentation and precedence

This record is governed by:

1. [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md).
2. [BF3 Static JavaScript SDK Evidence / Execution Contract v0.1](./eximbay-bf3-static-javascript-sdk-evidence-contract-v0.1.md).
3. [BF2 Result Evidence / Independent Adjudication v0.1](./eximbay-bf2-ready-preflight-result-adjudication-v0.1.md), as structural precedent only.
4. The actual PackageIntegrity-v1 and Result-v1 bytes identified below.
5. The retained asset byte counts, hashes, and direct original/archive
   comparisons identified below, without source interpretation.
6. Repository and Git history identified below.

The BF3 contract remains the historical normative execution authority. This
later record describes the actual package admission, execution conformance,
semantic result, evidence ceiling, and next lawful gate. It creates no product,
provider-contact, EX2B2, or runtime authority.

## 3. Contract installation binding

Repository history and an independent byte/hash recomputation establish:

```text
contract PR:
  #55

reviewed contract head:
  a54a785f3bfc89f96d4ccbdc3b8d8baf03d64997

contract merge:
  5a02801379e65c3adf44726d895ac810026a1976

contract bytes:
  86073

contract SHA-256:
  641150da077c67df53c8f3e7a1c91027fb02fea76fb6378c7cc678cf70c0e098
```

## 4. Run identity and external custody

```text
run ID:
  20260811T220109Z-c4779de2

historical local custody root:
  /Users/duckcow/mira-evidence/eximbay-bf3/20260811T220109Z-c4779de2
```

The absolute path is a historical local custody location, not a portable
repository dependency. Durable authority is the run ID, canonical basenames,
byte counts, hashes, and adjudicated relationships in this record.

## 5. PackageIntegrity-v1 binding and package admission

```text
canonical basename:
  eximbay-bf3-static-sdk-package-integrity-v1-20260811T220109Z-c4779de2.json

PackageIntegrity-v1 byte count:
  1199

PackageIntegrity-v1 SHA-256:
  3ffabb7bffa44e16edfb3958993d1487d9b7a42a6215d945ad6eb8b34405780c

packageIntegrityOutcome:
  PACKAGE_VALID

packageIntegrityReason:
  NONE

PACKAGE ADMISSION:
  VALID
```

PackageIntegrity-v1 remains external evidence and is not copied into Git.

## 6. Result-v1 binding

```text
canonical basename:
  eximbay-bf3-static-sdk-result-v1-20260811T220109Z-c4779de2.json

Result-v1 byte count:
  7200

Result-v1 SHA-256:
  daa413c8754969f4187079b45c722bb1a79a0da77a6725927814c8105269de5a

original:
  valid canonical bytes

archive:
  valid canonical bytes

direct byte equality:
  true
```

The original and archive counts, hashes, and direct byte equality were
independently recomputed. Result-v1 remains external evidence and is not copied
into Git.

## 7. TEST V2 asset binding

```text
identity:
  TEST_V2

canonical basename:
  01-test-v2-javascriptSDK.js

URL:
  https://api-test.eximbay.com/v2/javascriptSDK.js

HTTP:
  200

Content-Type:
  application/json

Content-Encoding:
  absent

body custody:
  COMPLETE_BODY_RETAINED

bytes:
  4287

SHA-256:
  d324cb484f3c4c56f949329f5ddf4ca62e012c72ef530febe3ce77db35a396b7

original/archive:
  directly byte-identical
```

Only local byte count, hash, and equality were recomputed. The retained body
was not source-inspected, interpreted, or executed during this adjudication.

## 8. TEST V1 asset binding

```text
identity:
  TEST_V1

canonical basename:
  02-test-v1-javascriptSDK.js

URL:
  https://api-test.eximbay.com/v1/javascriptSDK.js

HTTP:
  200

Content-Type:
  application/json

Content-Encoding:
  absent

body custody:
  COMPLETE_BODY_RETAINED

bytes:
  3459

SHA-256:
  9b818e54c11267d85f9c57a0e2e10370abb850d1a20df4368cde4b4bd8a89ef2

original/archive:
  directly byte-identical
```

Only local byte count, hash, and equality were recomputed. The retained body
was not source-inspected, interpreted, or executed during this adjudication.

## 9. Provider-contact execution conformance

The independently adjudicated execution result is:

```text
authorized maximum requests:
  2

actualProviderRequestCount:
  2

ordinal 1:
  exact TEST V2 URL
  consumed once

ordinal 2:
  exact TEST V1 URL
  consumed once

retry:
  none

redirect follow:
  none

third request:
  none

production request:
  none

credentials:
  none

payment API:
  none

JavaScript execution:
  none

EXIMBAY.request_pay():
  not invoked

EXECUTION CONFORMANCE:
  CONFORMANT
```

This is the bounded independently adjudicated conformance result; it is not a
broader claim about activity outside the admitted BF3 evidence.

## 10. Source-admission result

For both TEST V2 and TEST V1:

```text
staticInspectionAdmitted:
  false

staticInspectionAdmissionReason:
  CONTENT_TYPE_NOT_ALLOWED_JAVASCRIPT

strictUtf8DecodeSucceeded:
  null

staticInspectionOutcome:
  NOT_ADMITTED
```

The observed response Content-Type for each asset was `application/json`. The
installed BF3 source-admission media-type allowlist did not include
`application/json`. This record does not reinterpret either retained body.

## 11. Static observations

For both assets, all five contract observations remain:

```text
PUBLIC_EXIMBAY_LITERAL:
  UNRESOLVED_BY_STATIC_INSPECTION

REQUEST_PAY_LITERAL:
  UNRESOLVED_BY_STATIC_INSPECTION

TEST_ORIGIN_LITERAL:
  UNRESOLVED_BY_STATIC_INSPECTION

PRODUCTION_ORIGIN_LITERAL:
  UNRESOLVED_BY_STATIC_INSPECTION

V1_PAYMENTS_PATH_LITERAL:
  UNRESOLVED_BY_STATIC_INSPECTION
```

`UNRESOLVED_BY_STATIC_INSPECTION` is not `NOT_OBSERVED_STATIC`.
`UNRESOLVED != NOT_OBSERVED`. No later offline search was used to convert any
observation.

## 12. Raw V2/V1 comparison

```text
comparisonEligible:
  true

byteCountEqual:
  false

sha256Equal:
  false

byteIdentical:
  false

raw byte difference:
  OBSERVED

semantic SDK difference:
  NOT ESTABLISHED

canonical-version implication:
  NONE
```

## 13. Static comparison

```text
publicEximbayObservationComparison:
  UNRESOLVED_BY_STATIC_INSPECTION

requestPayObservationComparison:
  UNRESOLVED_BY_STATIC_INSPECTION

providerOriginPathObservationComparison:
  UNRESOLVED_BY_STATIC_INSPECTION
```

## 14. Mandatory warning set

The exact warning order is:

```text
1. UNEXPECTED_CONTENT_TYPE — asset 1 — detail null
2. STATIC_INSPECTION_NOT_ADMITTED — asset 1 — detail null
3. UNEXPECTED_CONTENT_TYPE — asset 2 — detail null
4. STATIC_INSPECTION_NOT_ADMITTED — asset 2 — detail null
```

## 15. Semantic terminal result

```text
allAuthorizedProcessingTerminal:
  true

semanticEvidenceValid:
  false

terminalOutcome:
  EVIDENCE_INVALID_OR_INCOMPLETE

stopReason:
  REQUIRED_ASSET_EVIDENCE_MISSING

SEMANTIC RESULT:
  INVALID_OR_INCOMPLETE
```

All authorized processing reached a terminal classification, but the required
admitted static evidence was not obtained. That is a semantic evidence result,
not an execution-conformance failure.

## 16. Exact BF3 disposition

```text
BF3 DISPOSITION:
  BF3_EVIDENCE_INVALID_OR_INCOMPLETE
```

Neither supported-version disposition is available because the required
admitted static evidence was not obtained. This run does not select:

```text
BF3_V2_SUPPORTED_FOR_EX2B2_DESIGN
BF3_V1_SUPPORTED_FOR_EX2B2_DESIGN
BF3_VERSION_UNRESOLVED_VENDOR_CLARIFICATION_REQUIRED
```

as its adjudicated disposition.

## 17. Package/semantic separation

```text
package custody and admission:
  VALID

execution conformance:
  CONFORMANT

semantic evidence:
  INVALID_OR_INCOMPLETE
```

The package proves valid custody of the immutable Result-v1 and its archive.
It does not make the retained SDK bodies admissible for source inspection or
make the semantic evidence sufficient. Conversely, the invalid/incomplete
semantic result does not invalidate the package or make the execution
nonconformant.

## 18. Evidence ceiling

### Established

- both exact test URLs were contacted once;
- both returned HTTP 200;
- both complete raw bodies were retained;
- both declared Content-Type `application/json`;
- TEST V2 has the exact byte count and hash in §7;
- TEST V1 has the exact byte count and hash in §8;
- the V2 and V1 raw bodies differ;
- package custody is valid; and
- execution was conformant.

### Not established

- either SDK is canonical;
- either SDK is currently supported or recommended over the other;
- presence of `EXIMBAY`;
- presence of `request_pay`;
- provider origin or path literals;
- browser compatibility;
- payment-page behavior;
- production SDK path;
- merchant readiness;
- payment success;
- callback behavior; or
- EX2B2 readiness.

## 19. Re-run boundary

```text
BF3 RE-RUN:
  NOT AUTHORIZED
```

The completed run consumed both request ordinals. This record grants no new
provider contact. It does not recommend a confirmation GET, another HTTP
client, or any other repeat.

## 20. EX2B2 boundary

```text
EX2B2:
  BLOCKED
```

No EX2B2 design-contract or implementation authority follows from this BF3
disposition. Eximbay SDK canonical version remains unresolved, and Eximbay
runtime activation remains none.

## 21. Next lawful gate

```text
STOP PENDING NEW AUTHORITY

possible next separately reviewed work:
  BF3 evidence-plan / contract revision addressing the observed
  Content-Type anomaly
```

That future planning work does not reinterpret this retained run, authorize
provider contact, authorize a BF3 rerun, or trigger vendor contact by itself.
This record does not design that revision.

## 22. Content-Type anomaly

The observation is limited to:

```text
TEST V2 declared:
  application/json

TEST V1 declared:
  application/json
```

This record does not claim that the provider is misconfigured, that either
payload is JSON or JavaScript, that the header is harmless, or that a browser
will execute either body. Those questions belong to later separately
authorized evidence planning.

## 23. External evidence retention

The SDK bytes, Result-v1, and PackageIntegrity-v1 remain external evidence and
are not copied into Git. This repository record binds them only by:

```text
run ID
canonical basenames
byte counts
SHA-256 values
adjudicated relationships
```

## 24. Change control

This v0.1 record describes only run `20260811T220109Z-c4779de2`. A later
semantic reinterpretation, revised evidence method, new provider run, changed
evidence identity, supported-version decision, or changed next-gate authority
requires separate explicit review and a new version or supersession record.

The historical BF3 contract and every external evidence artifact remain
unchanged.

## Verdict

```text
BF3 RESULT EVIDENCE / INDEPENDENT ADJUDICATION RECORD:
  AUTHORED

PACKAGE ADMISSION:
  VALID

EXECUTION CONFORMANCE:
  CONFORMANT

SEMANTIC RESULT:
  INVALID_OR_INCOMPLETE

BF3 DISPOSITION:
  BF3_EVIDENCE_INVALID_OR_INCOMPLETE

BF3 RE-RUN:
  NOT AUTHORIZED

EX2B2:
  BLOCKED

NEXT:
  INDEPENDENT DOCUMENTATION REVIEW BEFORE INSTALLATION
```
