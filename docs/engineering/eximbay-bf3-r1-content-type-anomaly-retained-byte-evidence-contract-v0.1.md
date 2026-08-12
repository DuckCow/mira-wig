# Eximbay BF3-R1 Content-Type Anomaly Retained-Byte Derived-Evidence Contract v0.1

## Status

```text
DOCUMENT CLASS:
  ZERO-PROVIDER-CONTACT DERIVED-EVIDENCE CONTRACT

RISK CLASS:
  HIGH — PAYMENT SDK SUPPLY-CHAIN AND BROWSER-HANDOFF EVIDENCE

TASK CLASSIFICATION:
  EVIDENCE_COLLECTION_CONTRACT

CURRENT TASK-LEVEL AUTHORIZATION:
  DOCUMENTATION_ONLY

BF3-R1 CONTRACT:
  CANDIDATE

PROVIDER CONTACT:
  NONE AUTHORIZED

DERIVED EVIDENCE EXECUTION:
  NOT YET AUTHORIZED

HISTORICAL BF3 RESULT:
  IMMUTABLE

BF3 RE-RUN:
  NOT AUTHORIZED

EXIMBAY SDK CANONICAL VERSION:
  UNRESOLVED

EX2B2:
  BLOCKED

EXIMBAY RUNTIME ACTIVATION:
  NONE

NEXT:
  FOCUSED CLOSURE — BF3R1-AUD-001 THROUGH BF3R1-AUD-007
```

This candidate performs no request to either Eximbay SDK asset, does not read
or interpret either retained SDK body, and does not execute JavaScript. Its
existence in a branch or working tree grants no derived-evidence execution
authority. The independent broad review is complete; its seven Important
findings are corrected in this candidate but remain pending focused closure.
Only after focused closure, reviewed merge, and one separate explicit
invocation may the installed contract authorize the local, zero-contact
derived-evidence run frozen below.

## 1. Purpose and governing architecture question

The completed historical BF3 run remains installed exactly as adjudicated.
BF3-R1 asks only:

```text
Should browser classic-script load admissibility
and
offline inert-byte textual characterization
remain the same evidence gate?
```

This is a prospective evidence-architecture question, not a claim that BF3
v0.1 executed incorrectly. BF3-R1 creates additive derived observations under
a new method and schema. It does not amend, reinterpret, or replace any
historical BF3 artifact or disposition.

## 2. Governing authority and historical lifecycle

This candidate is subordinate to:

1. [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md).
2. [BF3 Static JavaScript SDK Evidence / Execution Contract v0.1](./eximbay-bf3-static-javascript-sdk-evidence-contract-v0.1.md), the historical normative execution authority.
3. [BF3 Static JavaScript SDK Result Evidence / Independent Adjudication v0.1](./eximbay-bf3-static-sdk-result-adjudication-v0.1.md), the installed historical result authority.
4. The current primary sources in §4 and §5, within their separate authority domains.

The installed state is frozen:

```text
BF3 CONTRACT:
  INSTALLED / HISTORICAL NORMATIVE EXECUTION AUTHORITY

BF3 EXECUTION:
  COMPLETE / CONFORMANT

BF3 PACKAGE:
  VALID

BF3 SEMANTIC EVIDENCE:
  INVALID_OR_INCOMPLETE

BF3 DISPOSITION:
  BF3_EVIDENCE_INVALID_OR_INCOMPLETE

BF3 RE-RUN:
  NOT AUTHORIZED

EXIMBAY SDK CANONICAL VERSION:
  UNRESOLVED

EX2B2:
  BLOCKED

EXIMBAY RUNTIME ACTIVATION:
  NONE
```

BF3-R1 does not reopen BF3. A later provider-contact action, if ever approved,
would require a new contract, new run identity, new evidence purpose, and new
authority. It would not inherit authority from BF3 or BF3-R1.

## 3. Current-task non-authority

This documentation authoring task performs:

```text
official Eximbay documentation research:
  YES

web-platform standards research:
  YES

repository documentation changes:
  YES
```

It performs:

```text
SDK endpoint contact:
  NO

retained SDK body interpretation:
  NO

DerivedEvidence-v1 execution:
  NO

JavaScript execution:
  NO

browser load:
  NO

vendor contact:
  NO
```

No source, schema, migration, test, route, dependency, configuration, runtime,
credential, payment, refund, order, or manufacturing authority is created.

## 4. Fresh current Eximbay documentation evidence

Retrieval date: **2026-08-12**.

Only the five current official pages below were used. The prohibited SDK asset
endpoints were not requested.

| Current documentation question | Current observation |
| --- | --- |
| Dedicated JavaScript SDK page | Shows TEST V2 in SDK installation and documents `EXIMBAY.request_pay()` for payment-page initiation. |
| Common payment-page preparation | Shows TEST V2 and documents `EXIMBAY.request_pay()`. |
| PAYMENT SDK Preparation | Shows TEST V2. |
| PAYMENT Payment Page Initiation | Shows TEST V1 and `EXIMBAY.request_pay()`. |
| PAYER_AUTH SDK Preparation | Shows TEST V2. |
| PAYER_AUTH Payment Page Initiation | Shows TEST V1 and `EXIMBAY.request_pay()`. |
| AUTHORIZE SDK Preparation | Shows TEST V2. |
| AUTHORIZE Payment Page Initiation | Shows TEST V1 and `EXIMBAY.request_pay()`. |
| Explicit v1/v2 precedence | No explicit deprecation, migration, replacement, or current-version notice resolving v1 versus v2 was located in the inspected pages. |

The current documentation therefore preserves the same v1/v2 conflict. This
contract does not infer precedence from numerals and does not select an SDK.
Provider documentation can establish what Eximbay currently publishes; it
cannot override browser standards or establish the behavior of uninspected
bytes.

## 5. Current web-platform normative evidence

Retrieval date: **2026-08-12**.

### 5.1 Script type classification

The HTML Standard classifies a `script` element whose `type` is a JavaScript
MIME type essence match as a classic script. The MIME Sniffing Standard lists
`text/javascript` as a JavaScript MIME type. Therefore the documented form:

```html
<script type="text/javascript" src="..."></script>
```

is an external classic script. This classification alone establishes neither
successful fetch nor successful execution.

### 5.2 HTML classic-script algorithm

The current HTML `fetch a classic script` algorithm creates a request with
destination `script`. For historical reasons, that HTML algorithm does not
itself include the ordinary MIME-type check and intentionally ignores the MIME
type essence while deriving an encoding.

This does **not** mean `Content-Type` never matters. Fetch-layer generic MIME,
`nosniff`, CORP, CSP, mixed-content, and other checks remain separate, as do
successful decoding, JavaScript parsing, and execution.

### 5.3 Generic Fetch MIME blocking

The current Fetch algorithm “Should response to request be blocked due to its
MIME type?” blocks a `script-like` destination when the extracted MIME essence
starts with `audio/`, `image/`, or `video/`, or equals `text/csv`.

`application/json` matches none of those conditions. Therefore:

```text
Content-Type: application/json
generic Fetch MIME rule for script-like destination:
  ALLOWED
```

This is only the result of that generic rule. It does not pre-decide
`nosniff`, CORP, merchant policy, source syntax, or execution.

### 5.4 JSON and JavaScript MIME classes

The MIME Sniffing Standard defines `application/json` as a JSON MIME type. It
does not include `application/json` in the exhaustive JavaScript MIME type
list.

```text
application/json:
  JSON MIME type: YES
  JavaScript MIME type: NO
```

MIME classification does not establish the retained body's syntax or
provider intent.

### 5.5 `nosniff`

The Fetch `nosniff` algorithm first allows the response when
`X-Content-Type-Options: nosniff` is not determined. When `nosniff` is
determined and the destination is script-like, a missing or non-JavaScript
MIME type is blocked. Therefore `application/json` with `nosniff` is blocked
for the script-like destination.

The historical BF3 record did not establish `X-Content-Type-Options`; BF3-R1
does not invent a historical value.

### 5.6 Default classic-script CORS and credentials modes

For a missing `crossorigin` attribute, HTML's CORS settings attribute uses its
missing-value default, the `No CORS` state. `create a potential-CORS request`
then sets:

```text
request mode:
  no-cors

credentials mode:
  include
```

This describes the browser request model for the documented tag. It does not
claim that a particular cookie, credential, or authorization value exists or
was sent, and it does not describe the historical BF3 CLI request.

### 5.7 CORP

The Fetch Standard defines `Cross-Origin-Resource-Policy` as a response policy
that can require an origin comparison when request mode is `no-cors`.
`same-origin` and `same-site` can block where their predicates fail;
`cross-origin` or an applicable null policy can allow, subject to the
embedder-policy rules.

The historical BF3 record did not establish a CORP value. No current value is
claimed here.

## 6. Standards-derived browser decision matrix

| Dimension | Case A | Case B |
| --- | --- | --- |
| Content-Type | `application/json` | `application/json` |
| `X-Content-Type-Options` | `nosniff` | absent or not `nosniff` |
| Generic Fetch MIME rule | Allowed; JSON is not one of the generic blocked script-like classes. | Allowed for the same bounded reason. |
| Fetch `nosniff` rule | **Blocked**, because `application/json` is not a JavaScript MIME type. | Allowed by the `nosniff` algorithm because `nosniff` is not determined. |
| HTML classic-script MIME step | The HTML algorithm itself has no ordinary MIME essence check, but the prior Fetch block remains decisive. | The HTML algorithm itself has no ordinary MIME essence check. |
| Final browser outcome | Blocked by `nosniff`. | Not decided by MIME evidence alone; CORP, CSP/COEP, request context, response status/body, decoding, JavaScript syntax, and other conditions remain. |

MIME, `nosniff`, and CORP remain distinct inputs. They must not be collapsed
into a browser-compatible boolean until every necessary fact is established.

## 7. Merchant-context boundary

Provider-resource evidence is separate from merchant-controlled policy.
Potential merchant facts include:

```text
Content-Security-Policy
Cross-Origin-Embedder-Policy
crossorigin attribute choice
page origin and embedding context
```

BF3-R1 does not freeze Mira's final page policy and does not treat those facts
as Eximbay asset properties.

## 8. Historical BF3 coupling and non-retroactivity

The historical BF3 v0.1 source-admission predicate required an allowed
JavaScript media type before strict UTF-8 decoding and literal inspection:

```text
Content-Type outside allowed JavaScript media types
  -> source inspection not admitted
  -> no strict UTF-8 inspection
  -> all static observations unresolved
```

That chain was valid and correctly applied under the installed historical
contract. BF3-R1 does not call it an error. It selects a new architecture for
a new derived method: local inert-data characterization is separated from
browser classic-script load admissibility.

## 9. Four independent evidence dimensions

### A. Raw-byte custody

```text
Question:
  Are the exact historical bytes bound and intact?
```

### B. Inert textual characterization

```text
Question:
  Can exact retained bytes be strictly decoded and inspected as data without
  making any browser-execution claim?
```

### C. Browser classic-script fetch/load compatibility

```text
Question:
  Would the browser request/load path accept the resource under the relevant
  Content-Type, nosniff, CORP, request mode, request context, and merchant
  policy?
```

### D. Provider SDK canonicality

```text
Question:
  Which SDK version, if any, should a later EX2B2 design use?
```

No dimension may silently substitute for another. BF3-R1 DerivedEvidence-v1
answers only A and B for the historical bytes.

## 10. Historical result immutability

The future local run must not change:

```text
historical Result-v1
historical PackageIntegrity-v1
historical warnings
historical terminalOutcome
historical stopReason
historical BF3 disposition
```

The authority rule is:

```text
Historical BF3 semantic truth:
  IMMUTABLE

BF3-R1 derived observations:
  ADDITIVE / NON-RETROACTIVE
```

Useful future derived observations cannot retroactively change
`BF3_EVIDENCE_INVALID_OR_INCOMPLETE`.

## 11. Future execution authority after reviewed merge

Only after focused closure of `BF3R1-AUD-001` through `BF3R1-AUD-007`, reviewed
merge, and a separately explicit invocation may this contract authorize
exactly one:

```text
BF3-R1 LOCAL DERIVED EVIDENCE RUN
```

Its contact and execution ceilings are exact:

```text
provider HTTP requests:
  0

browser network requests:
  0

JavaScript execution:
  0

SDK import/require:
  0

source-map requests:
  0

vendor contact:
  0
```

This authoring task does not invoke that future run.

## 12. Exact historical authority and global custody gate

Future execution may inspect only the exact retained evidence for:

```text
historical BF3 run:
  20260811T220109Z-c4779de2

historical local custody root:
  /Users/duckcow/mira-evidence/eximbay-bf3/20260811T220109Z-c4779de2

historical adjudication repository authority:
  0e19a80b55a5a61d00a9f18bf2f01cafe7f7cc45
```

The complete upstream authority inventory is exact:

| Artifact | Required location | Expected bytes | Expected SHA-256 |
| --- | --- | ---: | --- |
| PackageIntegrity-v1 | root `eximbay-bf3-static-sdk-package-integrity-v1-20260811T220109Z-c4779de2.json` | 1199 | `3ffabb7bffa44e16edfb3958993d1487d9b7a42a6215d945ad6eb8b34405780c` |
| Result-v1 original | `original/eximbay-bf3-static-sdk-result-v1-20260811T220109Z-c4779de2.json` | 7200 | `daa413c8754969f4187079b45c722bb1a79a0da77a6725927814c8105269de5a` |
| Result-v1 archive | `archive/eximbay-bf3-static-sdk-result-v1-20260811T220109Z-c4779de2.json` | 7200 | `daa413c8754969f4187079b45c722bb1a79a0da77a6725927814c8105269de5a` |
| TEST V2 original | `original/assets/01-test-v2-javascriptSDK.js` | 4287 | `d324cb484f3c4c56f949329f5ddf4ca62e012c72ef530febe3ce77db35a396b7` |
| TEST V2 archive | `archive/assets/01-test-v2-javascriptSDK.js` | 4287 | `d324cb484f3c4c56f949329f5ddf4ca62e012c72ef530febe3ce77db35a396b7` |
| TEST V1 original | `original/assets/02-test-v1-javascriptSDK.js` | 3459 | `9b818e54c11267d85f9c57a0e2e10370abb850d1a20df4368cde4b4bd8a89ef2` |
| TEST V1 archive | `archive/assets/02-test-v1-javascriptSDK.js` | 3459 | `9b818e54c11267d85f9c57a0e2e10370abb850d1a20df4368cde4b4bd8a89ef2` |

The exact custody method identifier is:

```text
BF3R1_HISTORICAL_CUSTODY_NOFOLLOW_V1
```

For every inventory entry, inspect the filesystem entry with a no-follow
metadata operation equivalent to POSIX `lstat`, never a symlink-following
`stat`. The entry must exist, must itself not be a symbolic link, and must
itself be a regular file. A symlink fails even when its target is the expected
regular file. Complete-read count and SHA-256 must equal the table.

For Result-v1 and each asset original/archive pair, capture the no-follow
stable filesystem identity as `(device identifier, inode/file identifier)` or
the exact platform-equivalent tuple. The two identities must differ. A hard
link, two path strings resolving to the same identity, a non-regular entry, or
an environment unable to expose a stable no-follow identity fails custody.
After the identity check, completely read both entries and require direct byte
equality; path inequality or hash equality is not a substitute.

After the PackageIntegrity-v1 file itself passes its count/hash check, validate
it under the installed historical BF3 PackageIntegrity-v1 schema and require:

```text
packageIntegrityOutcome:
  PACKAGE_VALID

packageIntegrityReason:
  NONE

resultV1ByteCount:
  7200

resultV1Sha256:
  daa413c8754969f4187079b45c722bb1a79a0da77a6725927814c8105269de5a
```

The PackageIntegrity validation is authority verification, not SDK-body
interpretation. No historical artifact may be repaired, rewritten, replaced,
or normalized.

All checks above form one global pre-text gate. The gate passes only after the
PackageIntegrity file and claims, both Result files and their independence,
and both asset pairs and their independence all pass. If any check cannot be
established exactly:

```text
derivedEvidenceOutcome:
  HISTORICAL_CUSTODY_IDENTITY_FAILED

asset decode:
  NONE

literal search:
  NONE

JSON recognition:
  NONE

provider contact:
  NONE
```

No apparently valid asset continues alone. Archive bytes verify custody; they
are not a second semantic sample. Historical custody remains read-only.

The self-audit vectors are exact:

```text
two normal independent regular files with equal bytes:
  PASS

archive symlink to original:
  FAIL

archive hard link to original:
  FAIL

two different paths with one stable filesystem identity:
  FAIL

original or archive non-regular:
  FAIL
```

## 13. Exact UTF-8 decode-without-BOM method

The exact method identifier is:

```text
BF3R1_WHATWG_UTF8_DECODE_WITHOUT_BOM_OR_FAIL_V1
```

After the global gate passes, process each complete exact original asset byte
sequence using behavior equivalent to the WHATWG UTF-8 decoder in fatal/error
mode, without a BOM-removal wrapper. On success the result is the exact Unicode
scalar sequence. Replacement decoding and every Unicode normalization are
prohibited.

Reject invalid continuation structure, overlong/non-shortest forms, encodings
of surrogate code points U+D800..U+DFFF, values above U+10FFFF, truncated
multibyte sequences, invalid leading bytes, and stray continuation bytes. A
leading `EF BB BF` decodes to leading U+FEFF; it is not removed. The same byte
triple embedded later decodes to U+FEFF at that exact position.

`utf8DecodeOutcome` has exactly these non-null values after a valid global
gate:

```text
SUCCEEDED
INVALID_UTF8
METHOD_FAILED
```

`INVALID_UTF8` means the method completed normally and established malformed
input. It is negative input evidence, not operational failure. `METHOD_FAILED`
means the frozen method itself could not complete deterministically and says
nothing about byte validity. If the global gate fails, the field is `null`,
which means the method was ineligible and not attempted; `null` is not a fourth
method outcome.

Before historical decoding, the implementation must reproduce every vector:

| Exact input bytes | Required outcome and exact decoded scalars |
| --- | --- |
| empty | `SUCCEEDED` / empty sequence |
| `41` | `SUCCEEDED` / U+0041 |
| `EF BB BF 7B 7D` | `SUCCEEDED` / U+FEFF U+007B U+007D |
| `41 EF BB BF 42` | `SUCCEEDED` / U+0041 U+FEFF U+0042 |
| `C0 AF` | `INVALID_UTF8` |
| `ED A0 80` | `INVALID_UTF8` |
| `F4 90 80 80` | `INVALID_UTF8` |
| `E2 82` | `INVALID_UTF8` |
| `80` | `INVALID_UTF8` |

If any vector is not reproduced, local preflight fails, historical bytes are
not decoded, both asset `utf8DecodeOutcome` values are `METHOD_FAILED`, and no
alternate decoder is selected.

The historical `Content-Type: application/json` remains an observed historical
fact. It neither grants nor removes authority for this separately reviewed
offline decode of already-custodied bytes as inert data.

## 14. Exact atomic literal method

The exact identifier is:

```text
BF3R1_STRICT_UTF8_EXACT_LITERAL_SUBSTRING_V1
```

After UTF-8 succeeds, search the immutable decoded scalar sequence for these
exact case-sensitive literal substrings in order:

| Position | Observation ID | Token ID | Exact token |
| ---: | --- | --- | --- |
| 0 | `PUBLIC_EXIMBAY_LITERAL` | `TOKEN_EXIMBAY` | `EXIMBAY` |
| 1 | `REQUEST_PAY_LITERAL` | `TOKEN_REQUEST_PAY` | `request_pay` |
| 2 | `TEST_ORIGIN_LITERAL` | `TOKEN_TEST_ORIGIN` | `https://api-test.eximbay.com` |
| 3 | `PRODUCTION_ORIGIN_LITERAL` | `TOKEN_PRODUCTION_ORIGIN` | `https://api.eximbay.com` |
| 4 | `V1_PAYMENTS_PATH_LITERAL` | `TOKEN_V1_PAYMENTS_PATH` | `/v1/payments` |

`literalSearchOutcome` is exactly:

```text
NOT_ATTEMPTED
COMPLETED
METHOD_FAILED
```

The five predicates are one atomic method. `COMPLETED` requires all five
statuses to be `OBSERVED_IN_RETAINED_TEXT` or
`NOT_OBSERVED_IN_RETAINED_TEXT`. `NOT_ATTEMPTED` or `METHOD_FAILED` requires
all five statuses to be `UNRESOLVED`; partial internal results have no
authority. No fallback implementation is permitted.

`NOT_OBSERVED_IN_RETAINED_TEXT` establishes only failure of that exact static
substring predicate. It does not establish runtime absence. No source snippet,
matched context, body text, or offset enters DerivedEvidence-v1 or chat output.

## 15. Exact JSON grammar-recognition method

The exact identifier is:

```text
BF3R1_RFC8259_JSON_GRAMMAR_RECOGNIZER_V1
```

This is a programming-language-neutral grammar recognizer, not a value
deserializer. Runtime parser success, `JSON.parse`, `json.loads`, native
numeric range, and implementation extensions have no authority.

The complete decoded scalar sequence must match exactly one RFC 8259 Sections
2–7 JSON text under this frozen grammar:

```text
JSON-text = ws value ws
ws        = *(U+0020 / U+0009 / U+000A / U+000D)
value     = object / array / string / number / false / null / true

object    = "{" [ member *( "," member ) ] "}"
member    = string ":" value
array     = "[" [ value *( "," value ) ] "]"

number    = [ "-" ] int [ frac ] [ exp ]
int       = "0" / (DIGIT1-9 *DIGIT)
frac      = "." 1*DIGIT
exp       = ("e" / "E") [ "+" / "-" ] 1*DIGIT

string    = quotation-mark *char quotation-mark
char      = unescaped / escape
unescaped = any Unicode scalar U+0020..U+10FFFF except U+0022 and U+005C
escape    = "\\" (quotation-mark / "\\" / "/" / "b" / "f" / "n" /
             "r" / "t" / ("u" HEXDIG HEXDIG HEXDIG HEXDIG))
false     = "false"
null      = "null"
true      = "true"
```

Top-level scalar values are valid. No other leading or trailing whitespace is
accepted. Complete-input consumption is mandatory. Comments, trailing commas,
multiple concatenated values, extension syntax, `NaN`, `Infinity`,
`undefined`, single-quoted strings, and unquoted object keys fail.

Duplicate member names are syntactically permitted. The recognizer constructs
no map and chooses no first-, last-, or all-value semantics. Numbers are
recognized lexically only; no integer, BigInt, Decimal, IEEE-754, or other
numeric value is materialized, so syntactically valid length and exponent have
no implementation range limit within the bounded historical input size.

Unescaped U+0000..U+001F is invalid. The escapes `\"`, `\\`, `\/`, `\b`,
`\f`, `\n`, `\r`, and `\t` are valid, and `\u` must be followed by exactly
four hexadecimal digits. An escaped surrogate code-unit spelling such as
`"\uD800"` is structurally valid; the escape is not materialized, paired,
normalized, replaced, or interpreted.

The UTF-8 method preserves a leading BOM as U+FEFF. The JSON recognizer strips
no BOM, and U+FEFF is not JSON whitespace. Therefore leading U+FEFF followed by
an otherwise valid JSON value deterministically fails.

The only semantic outputs are:

```text
jsonParseOutcome:
  NOT_ATTEMPTED
  SUCCEEDED
  FAILED
  METHOD_FAILED

jsonTopLevelKind:
  OBJECT
  ARRAY
  STRING
  NUMBER
  BOOLEAN
  NULL
  NOT_APPLICABLE
```

`FAILED` means the recognizer completed and established non-match;
`METHOD_FAILED` means the recognizer itself did not complete deterministically.
They are never interchangeable. Only `SUCCEEDED` has a non-`NOT_APPLICABLE`
top-level kind. No parsed value, key, snippet, source, or parser excerpt is
retained.

The frozen conformance vectors are:

| Exact decoded scalar sequence | Required result |
| --- | --- |
| `{}` | `SUCCEEDED / OBJECT` |
| `[]` | `SUCCEEDED / ARRAY` |
| `"x"` | `SUCCEEDED / STRING` |
| `0` | `SUCCEEDED / NUMBER` |
| `-0` | `SUCCEEDED / NUMBER` |
| `true` | `SUCCEEDED / BOOLEAN` |
| `null` | `SUCCEEDED / NULL` |
| two U+0020, `[1]`, one U+0020, U+000A | `SUCCEEDED / ARRAY` |
| `{"a":1,"a":2}` | `SUCCEEDED / OBJECT` |
| `1e999999` | `SUCCEEDED / NUMBER` |
| `1` followed by exactly 399 ASCII `0` digits | `SUCCEEDED / NUMBER` |
| `"\uD800"` | `SUCCEEDED / STRING` |
| `01` | `FAILED / NOT_APPLICABLE` |
| `[1,]` | `FAILED / NOT_APPLICABLE` |
| `{"a":1,}` | `FAILED / NOT_APPLICABLE` |
| `//comment` then U+000A then `{}` | `FAILED / NOT_APPLICABLE` |
| `{}{}` | `FAILED / NOT_APPLICABLE` |
| `1.` | `FAILED / NOT_APPLICABLE` |
| `1e` | `FAILED / NOT_APPLICABLE` |
| leading U+FEFF followed by `{}` | `FAILED / NOT_APPLICABLE` |

The implementation must reproduce every vector before historical recognition.
Failure makes the JSON method `METHOD_FAILED`; no generic parser or alternate
recognizer may be selected.

## 16. JavaScript non-execution boundary

The following are prohibited:

```text
eval
new Function
vm.Script
vm.runInContext / vm.runInNewContext / any vm.runIn* API
Node import
Node require
browser <script>
Playwright execution
Puppeteer execution
jsdom execution
EXIMBAY.request_pay()
source-map request
```

The bytes must not be loaded into a JavaScript runtime. ECMAScript AST parsing
is also outside v0.1. Any future syntax-parser method requires a new reviewed
contract.

## 17. DerivedEvidence-v1 exact schema

DerivedEvidence-v1 is one JSON object with exactly these fields in this order.
Every field is required; nullable fields are explicit and no extension field
is allowed.

| Field | Type | Nullable | Exact constraint |
| --- | --- | --- | --- |
| `schema` | string | no | `mira.eximbay.bf3-r1-derived-evidence` |
| `version` | integer | no | `1` |
| `derivedRunId` | string | no | matches `^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$` |
| `historicalBf3RunId` | string | no | `20260811T220109Z-c4779de2` |
| `historicalAuthority` | object | no | exact object below |
| `contractIdentity` | string | no | `EXIMBAY-BF3-R1-CONTENT-TYPE-ANOMALY-RETAINED-BYTE-EVIDENCE-CONTRACT-v0.1` |
| `repositoryAuthority` | object | no | exact object below |
| `method` | object | no | exact object below |
| `historicalCustodyGate` | object | no | exact object below |
| `assets` | array | no | length 2; exact per-asset records below |
| `comparison` | object | no | exact bounded comparison below |
| `warnings` | array | no | `0..4` exact warning records below |
| `derivedEvidenceOutcome` | string enum | no | exact outcome vocabulary below |
| `completedAt` | string | no | canonical UTC timestamp fixed at `DERIVED_EVIDENCE_SEMANTIC_CUTOFF` |

### 17.1 Historical and contract authority

`historicalAuthority` has exactly these required non-null fields in order:

| Field | Exact value |
| --- | --- |
| `historicalAdjudicationMergeSha` | `0e19a80b55a5a61d00a9f18bf2f01cafe7f7cc45` |
| `historicalPackageIntegrityBasename` | `eximbay-bf3-static-sdk-package-integrity-v1-20260811T220109Z-c4779de2.json` |
| `historicalPackageIntegrityByteCount` | integer `1199` |
| `historicalPackageIntegritySha256` | `3ffabb7bffa44e16edfb3958993d1487d9b7a42a6215d945ad6eb8b34405780c` |
| `historicalResultBasename` | `eximbay-bf3-static-sdk-result-v1-20260811T220109Z-c4779de2.json` |
| `historicalResultByteCount` | integer `7200` |
| `historicalResultSha256` | `daa413c8754969f4187079b45c722bb1a79a0da77a6725927814c8105269de5a` |

`repositoryAuthority` has exactly these required non-null fields in order:

| Field | Type | Constraint |
| --- | --- | --- |
| `contractPath` | string | `docs/engineering/eximbay-bf3-r1-content-type-anomaly-retained-byte-evidence-contract-v0.1.md` |
| `bf3r1ContractMergeSha` | string | actual 40-character lowercase reviewed-merge SHA at execution time |
| `bf3r1ContractFileSha256` | string | actual 64-character lowercase SHA-256 of the installed contract bytes at that merge |

The historical adjudication SHA is not the future BF3-R1 merge SHA. The two
future values are intentionally unknown in this candidate. A candidate branch,
unmerged file, unestablished merge, or mismatched installed file hash grants no
execution authority and requires stop before custody inspection.

### 17.2 Method identity

`method` has exactly these required non-null fields in fixed order:

| Field | Exact value |
| --- | --- |
| `custodyVerificationMethodIdentifier` | `BF3R1_HISTORICAL_CUSTODY_NOFOLLOW_V1` |
| `utf8DecodeMethodIdentifier` | `BF3R1_WHATWG_UTF8_DECODE_WITHOUT_BOM_OR_FAIL_V1` |
| `literalSearchMethodIdentifier` | `BF3R1_STRICT_UTF8_EXACT_LITERAL_SUBSTRING_V1` |
| `jsonStructuralMethodIdentifier` | `BF3R1_RFC8259_JSON_GRAMMAR_RECOGNIZER_V1` |
| `canonicalSerializationMethodIdentifier` | `BF3_CANONICAL_JSON_UTF8_V1` |

No implementation-selected method identity is permitted.

### 17.3 Historical custody representation

`historicalCustodyGate` has exactly these required non-null fields in order:

| Field | Type | Constraint |
| --- | --- | --- |
| `packageIntegrityVerification` | object | exact single-file object below |
| `packageIntegrityClaimsOutcome` | string enum | `VERIFIED_REQUIRED_BINDINGS`, `MISMATCH`, or `NOT_VERIFIED` |
| `resultVerification` | object | exact original/archive pair object below |
| `globalCustodyOutcome` | string enum | `VERIFIED` or `FAILED` |

The single-file object fields, in order, are
`regularNonSymlinkFileStatus`, `observedByteCount`, `observedSha256`, and
`expectedIdentityOutcome`. Status is `VERIFIED_REGULAR_NON_SYMLINK`,
`MISSING_NONREGULAR_OR_SYMLINK`, or `NOT_VERIFIED`; count is a nullable
non-negative integer, SHA is a nullable 64-character lowercase hexadecimal
string, and the pair is both null or both non-null. Expected identity is
`MATCH`, `MISMATCH`, or `NOT_VERIFIED` and is `MATCH` exactly when the no-follow
file type, complete count, and hash all match §12.

The Result and asset original/archive pair objects all use exactly these fields
in order:

| Field | Type | Nullable | Constraint |
| --- | --- | --- | --- |
| `originalRegularNonSymlinkFileStatus` | string enum | no | same file-status vocabulary above |
| `originalDeviceIdentifier` | string | yes | stable no-follow device identifier, `1..128` printable ASCII |
| `originalFileIdentifier` | string | yes | stable no-follow inode/file identifier, `1..128` printable ASCII |
| `archiveRegularNonSymlinkFileStatus` | string enum | no | same vocabulary |
| `archiveDeviceIdentifier` | string | yes | same constraint |
| `archiveFileIdentifier` | string | yes | same constraint |
| `filesystemIdentityOutcome` | string enum | no | `DISTINCT`, `SAME`, or `NOT_VERIFIED` |
| `originalObservedByteCount` | integer | yes | non-negative complete-read count |
| `originalObservedSha256` | string | yes | complete-read SHA-256 |
| `archiveObservedByteCount` | integer | yes | non-negative complete-read count |
| `archiveObservedSha256` | string | yes | complete-read SHA-256 |
| `originalArchiveDirectByteEquality` | string enum | no | `EQUAL`, `MISMATCH`, or `NOT_VERIFIED` |
| `expectedIdentityOutcome` | string enum | no | `MATCH`, `MISMATCH`, or `NOT_VERIFIED` |

Each device/file pair and each count/hash pair is both null or both non-null.
`DISTINCT` requires two captured stable tuples that differ; `SAME` requires
equal tuples. Direct equality requires complete direct comparison and is never
inferred from hashes. `expectedIdentityOutcome == MATCH` exactly when both
entries are regular non-symlinks, both tuples exist and are `DISTINCT`, both
complete reads match the expected count/hash, and direct equality is `EQUAL`.

`globalCustodyOutcome == VERIFIED` exactly when PackageIntegrity file identity
is `MATCH`, its claims outcome is `VERIFIED_REQUIRED_BINDINGS`, Result identity
is `MATCH`, and both asset identities are `MATCH`. Otherwise it is `FAILED`.

### 17.4 Per-asset record

Each asset object has exactly these required fields in order:

| Field | Type | Nullable | Exact constraint |
| --- | --- | --- | --- |
| `ordinal` | integer | no | `1` for TEST V2; `2` for TEST V1 |
| `identity` | string enum | no | `TEST_V2` or `TEST_V1`, bound by ordinal |
| `basename` | string | no | exact §12 basename bound by ordinal |
| `expectedByteCount` | integer | no | `4287` or `3459`, bound by ordinal |
| `expectedSha256` | string | no | exact §12 SHA-256 bound by ordinal |
| `custodyVerification` | object | no | exact pair object in §17.3 |
| `utf8DecodeOutcome` | string enum | yes | `SUCCEEDED`, `INVALID_UTF8`, `METHOD_FAILED`, or `null` only on global gate failure |
| `literalSearchOutcome` | string enum | no | `NOT_ATTEMPTED`, `COMPLETED`, or `METHOD_FAILED` |
| `literalObservations` | array | no | exactly five records in §14 order |
| `jsonParseOutcome` | string enum | no | `NOT_ATTEMPTED`, `SUCCEEDED`, `FAILED`, or `METHOD_FAILED` |
| `jsonTopLevelKind` | string enum | no | exact §15 vocabulary |

Each literal observation has exactly `observationId`, `predicateTokenId`, and
`status` in that order. IDs are bound by §14 position and status is
`OBSERVED_IN_RETAINED_TEXT`, `NOT_OBSERVED_IN_RETAINED_TEXT`, or `UNRESOLVED`.

### 17.5 Bounded pairwise comparison

`comparison` has exactly these required non-null fields in order:

| Field | Exact constraint |
| --- | --- |
| `leftAssetOrdinal` | integer `1` |
| `leftAssetIdentity` | `TEST_V2` |
| `rightAssetOrdinal` | integer `2` |
| `rightAssetIdentity` | `TEST_V1` |
| `historicalRawByteInequalityEvidence` | `CARRIED_FORWARD_FROM_HISTORICAL_BF3` |
| `utf8DecodeOutcomeComparison` | vocabulary below |
| `literalComparisons` | exactly five records in §14 order |
| `jsonParseOutcomeComparison` | vocabulary below |
| `jsonTopLevelKindComparison` | vocabulary below |

UTF-8 comparison is `BOTH_SUCCEEDED`, `BOTH_INVALID_UTF8`,
`BOTH_METHOD_FAILED`, `DIFFERENT`, or `UNRESOLVED`; null produces
`UNRESOLVED`, equal non-null outcomes produce the corresponding `BOTH_*`, and
unequal non-null outcomes produce `DIFFERENT`.

Each literal comparison has `observationId` then `comparisonStatus`, with
status `BOTH_OBSERVED`, `BOTH_NOT_OBSERVED`, `DIFFERENT`, or `UNRESOLVED`.
Any unresolved operand produces `UNRESOLVED`; otherwise equality or difference
is mechanical.

JSON parse comparison is `BOTH_SUCCEEDED`, `BOTH_FAILED`,
`BOTH_METHOD_FAILED`, `DIFFERENT`, or `UNRESOLVED`. Any `NOT_ATTEMPTED`
produces `UNRESOLVED`; equal terminal outcomes produce the matching `BOTH_*`
and unequal terminal outcomes produce `DIFFERENT`. Top-level-kind comparison is
`SAME`, `DIFFERENT`, `NOT_APPLICABLE`, or `UNRESOLVED`: only two JSON successes
produce `SAME` or `DIFFERENT`; one or more deterministic JSON `FAILED` with no
unattempted/method-failed operand produces `NOT_APPLICABLE`; otherwise it is
`UNRESOLVED`.

### 17.6 Warning determinism

Each warning has exactly `code`, nullable `assetOrdinal`, and nullable `detail`
in that order. `detail` is always `null`. Codes and predicates are exact:

```text
HISTORICAL_CUSTODY_IDENTITY_FAILED
  <-> historicalCustodyGate.globalCustodyOutcome == FAILED
  assetOrdinal == null

INVALID_UTF8
  <-> asset utf8DecodeOutcome == INVALID_UTF8
  assetOrdinal == affected asset ordinal

UTF8_METHOD_FAILED
  <-> asset utf8DecodeOutcome == METHOD_FAILED
  assetOrdinal == affected asset ordinal

LITERAL_SEARCH_METHOD_FAILED
  <-> asset literalSearchOutcome == METHOD_FAILED
  assetOrdinal == affected asset ordinal

JSON_STRUCTURAL_METHOD_FAILED
  <-> asset jsonParseOutcome == METHOD_FAILED
  assetOrdinal == affected asset ordinal
```

Emit the custody warning first when present. Otherwise emit asset warnings by
asset ordinal ascending and then the code order shown above. Emit each true
predicate exactly once; duplicate `(code, assetOrdinal)` pairs are prohibited.
Deterministic JSON `FAILED` emits no operational-failure warning.

### 17.7 Derived outcome vocabulary

`derivedEvidenceOutcome` is exactly one of:

```text
HISTORICAL_CUSTODY_IDENTITY_FAILED
DERIVED_TEXT_EVIDENCE_INCOMPLETE
DERIVED_TEXT_EVIDENCE_COMPLETE
```

Select exactly one by first matching rule:

1. global custody is `FAILED` -> `HISTORICAL_CUSTODY_IDENTITY_FAILED`;
2. custody is valid and either asset has `INVALID_UTF8`, any UTF-8/literal/JSON
   `METHOD_FAILED`, any literal `UNRESOLVED`, or any JSON `NOT_ATTEMPTED` ->
   `DERIVED_TEXT_EVIDENCE_INCOMPLETE`;
3. custody is valid, both UTF-8 outcomes are `SUCCEEDED`, both literal methods
   are `COMPLETED`, and both JSON outcomes are `SUCCEEDED` or `FAILED` ->
   `DERIVED_TEXT_EVIDENCE_COMPLETE`.

JSON `FAILED` is complete negative structural evidence. Five
`NOT_OBSERVED_IN_RETAINED_TEXT` literal results can also be complete evidence.

## 18. Stage, cross-field, and outcome invariants

The global stage order is fixed:

```text
historical authority and custody
-> UTF-8
-> atomic literal method
-> JSON grammar method
-> DERIVED_EVIDENCE_SEMANTIC_CUTOFF
```

After UTF-8 succeeds, literal search and JSON recognition are independent inert
methods over the same immutable scalar sequence. Literal `METHOD_FAILED` does
not prohibit the JSON attempt, and JSON `METHOD_FAILED` does not erase a
completed literal result. Every already completed independent stage retains
authority. No fallback method is allowed.

The exact cross-field rules are:

```text
assets.length == 2 in TEST_V2, TEST_V1 order
each literalObservations.length == 5 in §14 order
comparison.literalComparisons.length == 5 in §14 order

globalCustodyOutcome == FAILED
  -> both utf8DecodeOutcome == null
     both literalSearchOutcome == NOT_ATTEMPTED
     all literals == UNRESOLVED
     both jsonParseOutcome == NOT_ATTEMPTED
     both jsonTopLevelKind == NOT_APPLICABLE

utf8DecodeOutcome == INVALID_UTF8 or METHOD_FAILED
  -> literalSearchOutcome == NOT_ATTEMPTED
     all literals == UNRESOLVED
     jsonParseOutcome == NOT_ATTEMPTED
     jsonTopLevelKind == NOT_APPLICABLE

utf8DecodeOutcome == SUCCEEDED
  -> literalSearchOutcome == COMPLETED or METHOD_FAILED
     jsonParseOutcome == SUCCEEDED or FAILED or METHOD_FAILED

literalSearchOutcome == COMPLETED
  -> all five literals are OBSERVED_IN_RETAINED_TEXT
     or NOT_OBSERVED_IN_RETAINED_TEXT

literalSearchOutcome != COMPLETED
  -> all five literals == UNRESOLVED

jsonParseOutcome == SUCCEEDED
  -> jsonTopLevelKind is OBJECT, ARRAY, STRING, NUMBER, BOOLEAN, or NULL

jsonParseOutcome != SUCCEEDED
  -> jsonTopLevelKind == NOT_APPLICABLE
```

The required total outcome matrix is:

| Case | Exact condition | One outcome |
| --- | --- | --- |
| A | both UTF-8 succeeded; literals completed; both JSON succeeded | `DERIVED_TEXT_EVIDENCE_COMPLETE` |
| B | both UTF-8 succeeded; literals completed; one JSON deterministically failed | `DERIVED_TEXT_EVIDENCE_COMPLETE` |
| C | custody valid; one `INVALID_UTF8` | `DERIVED_TEXT_EVIDENCE_INCOMPLETE` |
| D | any historical custody/authority mismatch or failure | `HISTORICAL_CUSTODY_IDENTITY_FAILED` |
| E | any UTF-8/literal/JSON operational `METHOD_FAILED` | `DERIVED_TEXT_EVIDENCE_INCOMPLETE`; completed independent stages remain authoritative |
| F | both UTF-8 succeeded; all literals not observed; both JSON terminal succeeded or failed | `DERIVED_TEXT_EVIDENCE_COMPLETE` |

No matrix case maps to two outcomes.

## 19. Semantic cutoff and canonical serialization

After all represented semantic observations are terminal, freeze:

```text
DERIVED_EVIDENCE_SEMANTIC_CUTOFF
```

Package-write facts cannot alter any semantic field after this cutoff.
DerivedEvidence-v1 reuses the normative `BF3_CANONICAL_JSON_UTF8_V1` profile
defined in §20 of the historical
[BF3 contract](./eximbay-bf3-static-javascript-sdk-evidence-contract-v0.1.md).
Its typed JSON restrictions, Unicode-scalar handling, exact escape algorithm,
integer forms, millisecond UTC timestamps, two-space indentation, LF-only
layout, schema field order, array order, BOM prohibition, and single final LF
apply unchanged.

Construct and validate the schema-valid semantic object once, canonicalize
once, and serialize once. The resulting immutable DerivedEvidence-v1 byte
sequence is the only sequence used for both package copies; independent
serialization for original and archive is prohibited.

## 20. Derived evidence package custody

The exact external layout is:

```text
/Users/duckcow/mira-evidence/eximbay-bf3-r1/<DERIVED_RUN_ID>/
  bf3-r1-derived-evidence-package-integrity-v1-<DERIVED_RUN_ID>.json
  original/
    bf3-r1-derived-evidence-v1-<DERIVED_RUN_ID>.json
  archive/
    bf3-r1-derived-evidence-v1-<DERIVED_RUN_ID>.json
```

Do not write into the historical BF3 root or copy any historical SDK byte or
historical BF3 artifact. Those inputs remain bound by immutable identities.

Write the one immutable DerivedEvidence-v1 sequence to original and archive.
For each, require successful write, no-follow regular non-symlink metadata,
complete read, observed count/hash, and direct equality to the immutable
sequence. Directly compare the two observed byte sequences. Capture each
device/file identifier tuple and require `DISTINCT`; symlinks and hard links
fail package custody.

### 20.1 DerivedEvidencePackageIntegrity-v1 schema

The minimal integrity record has exactly these required fields in this order;
no extension field is allowed:

| Field | Type | Nullable | Exact constraint |
| --- | --- | --- | --- |
| `schema` | string | no | `mira.eximbay.bf3-r1-derived-evidence-package-integrity` |
| `version` | integer | no | `1` |
| `derivedRunId` | string | no | same predeclared ID as DerivedEvidence-v1 |
| `contractIdentity` | string | no | exact §17 value |
| `derivedEvidenceBytesCreated` | boolean | no | whether one valid immutable sequence exists |
| `derivedEvidenceByteCount` | integer | yes | positive count exactly when bytes were created |
| `derivedEvidenceSha256` | string | yes | 64 lowercase hex exactly when bytes were created |
| `originalFilename` | string | no | `bf3-r1-derived-evidence-v1-<derivedRunId>.json` |
| `originalWriteOutcome` | string enum | no | write vocabulary below |
| `originalVerificationOutcome` | string enum | no | verification vocabulary below |
| `originalDeviceIdentifier` | string | yes | captured stable no-follow identifier; `1..128` printable ASCII |
| `originalFileIdentifier` | string | yes | captured stable no-follow identifier; `1..128` printable ASCII |
| `originalObservedByteCount` | integer | yes | non-negative complete-read count |
| `originalSha256` | string | yes | 64-character lowercase complete-read SHA-256 |
| `archiveFilename` | string | no | same basename under `archive/` |
| `archiveWriteOutcome` | string enum | no | write vocabulary below |
| `archiveVerificationOutcome` | string enum | no | verification vocabulary below |
| `archiveDeviceIdentifier` | string | yes | captured stable no-follow identifier; `1..128` printable ASCII |
| `archiveFileIdentifier` | string | yes | captured stable no-follow identifier; `1..128` printable ASCII |
| `archiveObservedByteCount` | integer | yes | non-negative complete-read count |
| `archiveSha256` | string | yes | 64-character lowercase complete-read SHA-256 |
| `originalArchiveFilesystemIdentity` | string enum | no | `DISTINCT`, `SAME`, or `NOT_VERIFIED` |
| `originalArchiveEquality` | string enum | no | `EQUAL`, `MISMATCH`, or `NOT_VERIFIED` |
| `packageIntegrityOutcome` | string enum | no | exact total vocabulary below |
| `packageIntegrityReason` | string enum | no | exact paired reason below |
| `completedAt` | string | no | canonical UTC packaging-finalization timestamp |

Write outcomes are `NOT_ATTEMPTED`, `WRITE_SUCCEEDED`, or `WRITE_FAILED`.
Verification outcomes are `NOT_ATTEMPTED`,
`VERIFIED_EQUAL_TO_IMMUTABLE_BYTES`, or `VERIFICATION_FAILED`. Verification
requires regular non-symlink status, complete read, count, hash, and direct
equality to the immutable sequence. Device/file and observed count/hash pairs
are each both null or both non-null. Original/archive equality requires a
direct complete-read comparison; hash equality is insufficient.

The exact outcome/reason pairs are:

| Outcome | One reason |
| --- | --- |
| `PACKAGE_VALID` | `NONE` |
| `DERIVED_EVIDENCE_NOT_CREATED` | `DERIVED_EVIDENCE_CONSTRUCTION_VALIDATION_CANONICALIZATION_OR_SERIALIZATION_FAILED` |
| `ORIGINAL_WRITE_FAILED` | `ORIGINAL_WRITE_DID_NOT_SUCCEED` |
| `ORIGINAL_VERIFICATION_FAILED` | `ORIGINAL_DID_NOT_VERIFY_AGAINST_IMMUTABLE_BYTES` |
| `ARCHIVE_WRITE_FAILED` | `ARCHIVE_WRITE_DID_NOT_SUCCEED` |
| `ARCHIVE_VERIFICATION_FAILED` | `ARCHIVE_DID_NOT_VERIFY_AGAINST_IMMUTABLE_BYTES` |
| `ORIGINAL_ARCHIVE_IDENTITY_NOT_DISTINCT` | `ORIGINAL_AND_ARCHIVE_FILESYSTEM_IDENTITIES_NOT_DISTINCT` |
| `ORIGINAL_ARCHIVE_MISMATCH` | `ORIGINAL_AND_ARCHIVE_BYTES_DIFFER` |

Cross-field invariants are exact:

```text
derivedEvidenceBytesCreated == false
  -> byte count/hash null
     all writes/verifications NOT_ATTEMPTED
     all observed identities/counts/hashes null
     filesystem identity and equality NOT_VERIFIED

derivedEvidenceBytesCreated == true
  -> byte count/hash non-null
     original write attempted

original write != WRITE_SUCCEEDED
  -> archive write == NOT_ATTEMPTED

original write == WRITE_SUCCEEDED
  -> archive write == WRITE_SUCCEEDED or WRITE_FAILED

write != WRITE_SUCCEEDED
  -> corresponding verification NOT_ATTEMPTED
     corresponding identity/count/hash null

write == WRITE_SUCCEEDED
  -> corresponding verification is VERIFIED_EQUAL_TO_IMMUTABLE_BYTES
     or VERIFICATION_FAILED

verification == VERIFIED_EQUAL_TO_IMMUTABLE_BYTES
  -> corresponding write succeeded
     regular non-symlink complete read succeeded
     observed count/hash and direct bytes equal immutable bytes

filesystem identity == DISTINCT or SAME
  -> both stable identity tuples non-null

originalArchiveEquality == EQUAL or MISMATCH
  -> both complete observed sequences exist and were directly compared

both verifications succeeded
  -> filesystem identity is DISTINCT or SAME
     and originalArchiveEquality == EQUAL
```

Select the first matching outcome in this precedence:

1. immutable bytes not created -> `DERIVED_EVIDENCE_NOT_CREATED`;
2. original write is not `WRITE_SUCCEEDED` -> `ORIGINAL_WRITE_FAILED`;
3. archive write is not `WRITE_SUCCEEDED` -> `ARCHIVE_WRITE_FAILED`;
4. filesystem identity is `SAME` or `NOT_VERIFIED` ->
   `ORIGINAL_ARCHIVE_IDENTITY_NOT_DISTINCT`;
5. direct original/archive equality is `MISMATCH` ->
   `ORIGINAL_ARCHIVE_MISMATCH`;
6. original verification is not `VERIFIED_EQUAL_TO_IMMUTABLE_BYTES` ->
   `ORIGINAL_VERIFICATION_FAILED`;
7. archive verification is not `VERIFIED_EQUAL_TO_IMMUTABLE_BYTES` ->
   `ARCHIVE_VERIFICATION_FAILED`;
8. both verifications succeeded, filesystem identity is `DISTINCT`, and direct equality
   is equal -> `PACKAGE_VALID`.

The invariants make this precedence total. Package facts never reconstruct or
alter DerivedEvidence semantic observations.

### 20.2 Non-recursive integrity and durable adjudication

After packaging facts are terminal, construct and schema-validate the integrity
record, canonicalize once under `BF3_CANONICAL_JSON_UTF8_V1`, serialize once,
and write once to its root basename. It contains no own hash, byte count, write
verification, archive verification, future survival state, or recursively
nested integrity record. Later independent adjudication observes its absence or
corruption.

The required lifecycle is:

```text
reviewed BF3-R1 contract merge
+ separate explicit zero-contact derived execution
-> DerivedEvidence-v1 immutable bytes
-> original/archive custody + DerivedEvidencePackageIntegrity-v1
-> independent package and semantic adjudication
-> durable repository result/adjudication record
```

That later repository record must install at minimum the derived run ID;
DerivedEvidence basename, byte count, and SHA-256; PackageIntegrity basename,
byte count, and SHA-256; package admission; derived semantic disposition; and
next gate. External JSON artifacts remain outside Git. Local derived execution
alone authorizes no provider, browser, JavaScript, vendor, or EX2B2 next gate.

## 21. Browser request-context representation gap

Freeze:

```text
BROWSER_REQUEST_CONTEXT_EQUIVALENCE:
  UNRESOLVED
```

The historical BF3 run observed one bounded non-browser HTTP request context.
The documented integration uses a browser classic-script request context. The
current record does not establish response representation or header invariance
across:

```text
User-Agent
Accept
Sec-Fetch-* request metadata
Referer
Origin
cache state
browser request mode
other request-context signals
```

This is a bounded inference from differing request contexts, not a claim that
Eximbay actually varies its response.

## 22. Missing browser-relevant response evidence

The historical BF3 result established `Content-Type: application/json` but did
not establish all facts necessary for browser classic-script compatibility.
At minimum these remain unresolved:

```text
X-Content-Type-Options
Cross-Origin-Resource-Policy
browser-shaped request-context representation identity
```

No current or historical value is invented for either missing response header.

## 23. Possible future header-context evidence boundary

BF3-R1 identifies but does not authorize a later provider-contact evidence
question. If still necessary after DerivedEvidence-v1 adjudication, a separate
contract could ask, under one explicitly frozen browser-relevant context:

```text
what HTTP status is returned?
what Content-Type is returned?
what X-Content-Type-Options value is returned?
what Cross-Origin-Resource-Policy value is returned?
what exact body count and hash are returned?
does representation identity match the historical BF3 bytes?
```

No network executor, method, request count, or target is authorized here.
`HEAD` is not preselected: its representation or metadata need not equal GET,
and a future contract must independently justify its method.

## 24. Possible later browser gate

BF3-R1 does not authorize loading retained or remote bytes as a script. A
separate higher-risk browser contract, only if later necessary, would have to
address at least:

```text
fresh isolated browser profile
no existing Eximbay cookies
no merchant/customer state
no credentials
network observation and containment
request_pay prohibited
payment-page initiation prohibited
popup/redirect prohibited unless separately authorized
unexpected SDK side-effect containment
```

No browser harness is designed here.

## 25. Derived evidence interpretation rules

If one or both assets statically contain `EXIMBAY` and `request_pay`, that
establishes only exact textual properties of the historical bytes. It does not
establish browser load success, provider recommendation, current representation
invariance, canonical SDK, or EX2B2 authority.

If frozen JSON grammar recognition succeeds, it establishes only that the exact
decoded scalar sequence matches the frozen JSON grammar. It does not establish
that SDK-related strings are
absent, that the provider intended an error, that no browser path can use the
response, or that the provider is misconfigured.

If frozen JSON grammar recognition deterministically fails, it establishes only
that the exact decoded scalar sequence does not match that grammar. It does not
prove valid JavaScript, SDK correctness, or browser compatibility. Operational
`METHOD_FAILED` is a separate state and makes no structural claim.

## 26. Post-derived decision tree

The later independent adjudicator, not the executor or this authoring task,
chooses the narrowest next gate:

```text
valid DerivedEvidence-v1 package and semantic evidence admitted
  -> evaluate bounded static facts without selecting V1 or V2
  -> select exactly one next-gate class:
       NO_PROVIDER_CONTACT_NEEDED_YET
       HEADER_REQUEST_CONTEXT_EVIDENCE_REQUIRED
       CONTROLLED_BROWSER_EVIDENCE_REQUIRED
       VENDOR_CLARIFICATION_REQUIRED
       EVIDENCE_PATH_STOP

custody identity failed
  -> EVIDENCE_PATH_STOP
  -> no provider repair

derived text evidence incomplete
  -> adjudicate the local failure only
  -> no automatic provider or browser escalation
```

Derived execution never selects V1 or V2. Canonical SDK selection remains a
later adjudication function under separate authority.

## 27. Vendor-clarification boundary

Do not trigger vendor clarification merely from:

```text
application/json Content-Type
V1/V2 raw-byte difference
historical source non-admission
```

Vendor clarification becomes a candidate only after lower-cost deterministic
evidence is exhausted and a material provider-authority ambiguity remains. No
vendor contact authority exists here.

## 28. BF3 no-rerun and EX2B2 boundaries

```text
BF3 RE-RUN:
  NOT AUTHORIZED

HISTORICAL BF3 DISPOSITION:
  BF3_EVIDENCE_INVALID_OR_INCOMPLETE

EX2B2:
  BLOCKED
```

Neither useful derived facts nor a complete DerivedEvidence-v1 changes these
historical/current boundaries. A future combined adjudication may create a new
BF3-R1 disposition or next gate, but it cannot rewrite BF3 v0.1.

## 29. Web-source provenance

| Source authority | Page/spec section | Retrieval date | Fact supported | Fact not supported |
| --- | --- | --- | --- | --- |
| Eximbay normative documentation | [JavaScript SDK](https://developer.eximbay.com/eng/eximbay/api_sdk/javascript-sdk.html) | 2026-08-12 | Dedicated page shows TEST V2 and documents `EXIMBAY.request_pay()`. | Browser conformance, response headers/body, canonical v1/v2 precedence. |
| Eximbay normative documentation | [Payment page integration preparation](https://developer.eximbay.com/eng/eximbay/payment_linkage/preparing-payment.html) | 2026-08-12 | Common preparation shows TEST V2 and `EXIMBAY.request_pay()`. | Browser conformance, response headers/body, canonical precedence. |
| Eximbay normative documentation | [Integrated PAYMENT](https://developer.eximbay.com/eng/eximbay/payment_linkage/windows-consolidation.html), SDK Preparation and Payment Page Initiation | 2026-08-12 | Preparation shows TEST V2; initiation shows TEST V1. | Numeral-based precedence or deprecation. |
| Eximbay normative documentation | [PAYER_AUTH](https://developer.eximbay.com/eng/eximbay/payment_linkage/windows-authentication.html), SDK Preparation and Payment Page Initiation | 2026-08-12 | Preparation shows TEST V2; initiation shows TEST V1. | Numeral-based precedence or deprecation. |
| Eximbay normative documentation | [AUTHORIZE](https://developer.eximbay.com/eng/eximbay/payment_linkage/windows-authorization.html), SDK Preparation and Payment Page Initiation | 2026-08-12 | Preparation shows TEST V2; initiation shows TEST V1. | Numeral-based precedence or deprecation. |
| WHATWG HTML | [`script` type](https://html.spec.whatwg.org/multipage/scripting.html#attr-script-type) | 2026-08-12 | `text/javascript` makes the element a classic script. | Fetch success or execution success. |
| WHATWG HTML | [`fetch a classic script`](https://html.spec.whatwg.org/multipage/webappapis.html#fetch-a-classic-script) | 2026-08-12 | HTML's classic-script algorithm historically omits its own ordinary MIME-type check. | `Content-Type` is irrelevant to all Fetch/browser layers. |
| WHATWG HTML | [`create a potential-CORS request`](https://html.spec.whatwg.org/multipage/urls-and-fetching.html#create-a-potential-cors-request) and [CORS settings attributes](https://html.spec.whatwg.org/multipage/urls-and-fetching.html#cors-settings-attributes) | 2026-08-12 | Missing `crossorigin` -> No CORS -> `no-cors` mode and `include` credentials mode. | Credentials actually existed or were sent in BF3. |
| WHATWG Fetch | [Generic MIME blocking](https://fetch.spec.whatwg.org/#should-response-to-request-be-blocked-due-to-its-mime-type) | 2026-08-12 | `application/json` is not blocked by the generic script-like MIME list. | Final browser load/execution success. |
| WHATWG Fetch | [`X-Content-Type-Options` and `nosniff`](https://fetch.spec.whatwg.org/#should-response-to-request-be-blocked-due-to-nosniff) | 2026-08-12 | `application/json` plus `nosniff` blocks a script-like request; absent/not-nosniff takes the allowed branch of this algorithm. | Historical header value or success under other checks. |
| WHATWG Fetch | [`Cross-Origin-Resource-Policy`](https://fetch.spec.whatwg.org/#cross-origin-resource-policy-header) | 2026-08-12 | CORP can block a cross-origin `no-cors` resource request depending on policy/origins/embedder policy. | Historical Eximbay CORP value. |
| WHATWG MIME Sniffing | [JavaScript and JSON MIME types](https://mimesniff.spec.whatwg.org/#javascript-mime-type) | 2026-08-12 | `application/json` is JSON MIME, not JavaScript MIME; `text/javascript` is JavaScript MIME. | Body syntax, provider intent, browser success. |

Web-platform standards do not establish Eximbay's recommended SDK version.
Eximbay documentation does not override web-platform algorithms.

## 30. Required author self-audit

### Q1. Does this contract reinterpret or mutate historical BF3 Result-v1?

```text
NO
```

It creates a new artifact under a new method, schema, run identity, and root.

### Q2. Does this contract authorize any provider request?

```text
NO
```

The future derived run has a zero-request ceiling.

### Q3. Does `application/json` alone establish browser script-load failure?

```text
NO, WITH QUALIFICATION
```

The generic Fetch MIME rule does not block `application/json`, and HTML's
classic-script algorithm does not add its own ordinary MIME essence check.
`application/json` plus `nosniff` is blocked. CORP, CSP/COEP, request context,
status/body, decoding, JavaScript syntax, and other checks remain separately
relevant, so MIME evidence alone does not establish success either.

### Q4. Can inert offline characterization be separate from browser load admissibility without executing JavaScript?

```text
YES
```

Exact no-follow custody verification followed by the frozen UTF-8
decode-without-BOM method, exact substring predicates, and frozen JSON grammar
recognition treats retained bytes only as data. It makes no browser or runtime
claim and invokes no JavaScript engine.

### Q5. Does BF3-R1 authorize canonical SDK selection or EX2B2?

```text
NO
```

Derived execution selects only a derived-evidence outcome. Canonical SDK
selection remains later adjudication, and EX2B2 remains blocked.

### Seven-finding correction audit

```text
BF3R1-AUD-001: CORRECTED
BF3R1-AUD-002: CORRECTED
BF3R1-AUD-003: CORRECTED
BF3R1-AUD-004: CORRECTED
BF3R1-AUD-005: CORRECTED
BF3R1-AUD-006: CORRECTED
BF3R1-AUD-007: CORRECTED
```

### Determinism audit

```text
same exact bytes can differ on UTF-8 because of BOM/decoder policy:
  NO

same scalar sequence can differ on JSON because of runtime parser, numeric
range, duplicate names, BOM handling, or extensions:
  NO

deterministic JSON grammar failure distinct from operational method failure:
  YES

global gate verifies historical PackageIntegrity-v1 and Result-v1 bytes as
well as both SDK asset pairs:
  YES

symlink or hard-linked original/archive pair can pass custody:
  NO

later adjudication can prove the immutable DerivedEvidence-v1 bytes finalized:
  YES

any correction authorizes provider/browser/JavaScript execution:
  NO
```

Outcome cases A–F are explicitly and exclusively mapped in §18.

## 31. Review, verification, and change control

The independent broad review is complete. Only focused closure of
`BF3R1-AUD-001` through `BF3R1-AUD-007` is authorized before installation;
there is no second broad BF3-R1 review. Author self-audit is not focused
closure.

For this documentation candidate verify only:

```text
all local Markdown links resolve
git diff --check passes
changed paths are exactly this contract, engineering README, and decision log
index remains empty
no source/schema/migration/test/route/config/dependency/runtime change
no SDK asset request or retained-body interpretation
no stage, commit, push, PR, or merge
```

After reviewed merge, any semantic change to input identity, custody gate,
decode/search/JSON method, non-execution boundary, schema, outcome, canonical
serialization, external root, browser boundary, or next-gate authority requires
a new version, explicit supersession, independent review, and decision-log
entry.

## Verdict

```text
BF3-R1 ZERO-CONTACT RETAINED-BYTE EVIDENCE CONTRACT:
  AUTHORED / CANDIDATE

HISTORICAL BF3 RESULT:
  IMMUTABLE

PROVIDER CONTACT:
  NOT AUTHORIZED

DERIVED EVIDENCE EXECUTION:
  NOT YET AUTHORIZED

JAVASCRIPT EXECUTION:
  NOT AUTHORIZED

BF3 RE-RUN:
  NOT AUTHORIZED

EX2B2:
  BLOCKED

NEXT:
  FOCUSED CLOSURE — BF3R1-AUD-001 THROUGH BF3R1-AUD-007
```
