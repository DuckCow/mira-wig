# Eximbay BF3 Static JavaScript SDK Evidence / Execution Contract v0.1

## Status

```text
DOCUMENT CLASS:
  PROVIDER EVIDENCE / EXECUTION CONTRACT

RISK CLASS:
  HIGH — PAYMENT SDK SUPPLY-CHAIN AND BROWSER-HANDOFF EVIDENCE

TASK CLASSIFICATION:
  EVIDENCE_COLLECTION_CONTRACT

CORRECTION AUTHORITY:
  DOCUMENTATION_ONLY / BOUNDED_CANONICAL_BYTE_ENCODING_CORRECTION

CURRENT TASK-LEVEL AUTHORIZATION:
  DOCUMENTATION_ONLY

CURRENT PROVIDER-CONTACT AUTHORITY:
  NONE

BF3 CONTRACT:
  CANDIDATE

BF3 PROVIDER EXECUTION:
  NOT AUTHORIZED

BF3 RESULT:
  NONE

REVIEW FINDINGS:
  BF3-CLR-003: CLOSED
  BF3-CLR-002: CORRECTED — PENDING FINAL FOCUSED CLOSURE
  BF3-AUD-004: CORRECTED — PENDING FINAL FOCUSED CLOSURE

BF3 SDK CANONICAL VERSION:
  UNRESOLVED

EX2B2:
  NOT AUTHORIZED

EXIMBAY SDK RUNTIME:
  NOT INSTALLED / NOT LOADED

EXIMBAY RUNTIME ACTIVATION:
  NONE

CHANGE CONTROL:
  supersedes: none
  superseded-by: none
```

This candidate performs no Eximbay SDK-asset request. Its existence in a
working tree or branch grants no provider-contact authority. BF3-CLR-003 is
closed. The bounded canonical-byte correction below resolves the sole remaining
dependency of BF3-CLR-002 and BF3-AUD-004, subject to one final focused review
and reviewed merge. Only after that merge and one separately and explicitly
invoked BF3 execution task may the exact bounded static GET sequence in this
document be authorized. BF3-CLR-001 remains closed.

## 1. Purpose and governing question

BF3-A answers only:

```text
Which currently exposed Eximbay JavaScript SDK asset is sufficiently evidenced
to become the bounded SDK candidate for a later EX2B2 browser-handoff design?
```

The possible output is evidence for a later EX2B2 **design contract**. BF3
does not load or execute an SDK, design browser handoff, implement source, or
activate a payment runtime.

## 2. Governing repository authority and lifecycle

This contract is subordinate to:

1. [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md).
2. [EX2B1 Provider Order Identity + Provider-Free `/ready` Preparation Design Contract v0.1](./eximbay-ex2b1-provider-order-ready-preparation-design-contract-v0.1.md).
3. [EX2B1 Provider Order Identity + Provider-Free `/ready` Preparation Source Status / As-Built v0.1](./eximbay-ex2b1-provider-order-ready-preparation-source-status-v0.1.md).
4. [EX2A Pure Protocol Kernel Design / Implementation Contract v0.1](./eximbay-ex2a-pure-protocol-kernel-design-contract-v0.1.md).
5. [EX2A Pure Protocol Kernel Source Status / As-Built v0.1](./eximbay-ex2a-pure-protocol-kernel-source-status-v0.1.md).
6. [BF2 Shared-Test `/ready` Preflight Provider Evidence / Execution Contract v0.1](./eximbay-bf2-shared-test-ready-preflight-contract-v0.1.md).
7. [BF2 Shared-Test `/ready` Preflight Result Evidence / Independent Adjudication v0.1](./eximbay-bf2-ready-preflight-result-adjudication-v0.1.md).
8. Current official Eximbay documentation identified in Section 4.

The installed repository lifecycle entering BF3 is:

```text
EX2B1 DESIGN CONTRACT:
  INSTALLED

EX2B1 SOURCE:
  INSTALLED / REVIEWED / VERIFIED

EX2B1 SOURCE STATUS:
  INDEPENDENTLY REVIEWED / INSTALLED

EX2B1 LIFECYCLE:
  CLOSED

EXIMBAY RUNTIME AUTHORITY:
  NONE

NEXT SEPARATELY GATED WORK:
  BF3 — SDK EVIDENCE / RECONCILIATION
```

BF3 does not reopen or reinterpret EX2B1. Repository documents govern Mira
authority and installed source facts. Current official Eximbay pages govern
provider-documentation facts. Exact static bytes observed in a later conformant
execution govern only those exact asset responses.

## 3. Prominent non-authority

This candidate and the later bounded execution authorize no:

```text
MID or API key use
/ready request
EXIMBAY.request_pay() invocation
browser script load
payment-page opening
form submission, popup, or redirect
callback or status_url route
payment verification
payment authorization, capture, or settlement
refund, cancellation, or void
Mira source, schema, migration, test, route, dependency, or runtime change
provider registry, factory, routing, fallback, or activation change
customer or production activation
```

The later execution may perform only the two documented test static-resource
GETs in Section 7, once each and in order, with no credentials and no
JavaScript execution. No production SDK path is an authorized BF3 target.

## 4. Current official-provider evidence lock

Retrieval date: **2026-08-11**.

Only current official material under `developer.eximbay.com` was used. No
third-party guide, blog, search snippet, package registry, Stack Overflow
answer, GitHub example, or historical mirror is authority.

| Current provider-documentation fact | Current official source |
| --- | --- |
| The dedicated JavaScript SDK page installs the test v2 asset and documents `EXIMBAY.request_pay()` as the payment-page initiation method. | [JavaScript SDK](https://developer.eximbay.com/eng/eximbay/api_sdk/javascript-sdk.html) |
| The common preparation page installs the test v2 asset and separately publishes the production and test base origins. | [Payment page integration preparation](https://developer.eximbay.com/eng/eximbay/payment_linkage/preparing-payment.html) |
| The `PAYMENT` flow's SDK Preparation uses test v2, while its Payment Page Initiation example uses test v1. | [Integrated payment / PAYMENT](https://developer.eximbay.com/eng/eximbay/payment_linkage/windows-consolidation.html) |
| The `PAYER_AUTH` flow's SDK Preparation uses test v2, while its Payment Page Initiation example uses test v1. | [Authentication payment / PAYER_AUTH](https://developer.eximbay.com/eng/eximbay/payment_linkage/windows-authentication.html) |
| The `AUTHORIZE` flow's SDK Preparation uses test v2, while its Payment Page Initiation example uses test v1. | [Authorization payment / AUTHORIZE](https://developer.eximbay.com/eng/eximbay/payment_linkage/windows-authorization.html) |
| Payment verification is `POST /v1/payments/verify`; its request model requires a `version` described as the SDK-initiated payment-page version, and the relevant Payment API example shows `ver=230`. | [Payment API reference — Payment verification](https://developer.eximbay.com/eng/eximbay/api_list/reference.html) |
| The AUTHORIZE flow shows `version=230`. | [Authorization payment / AUTHORIZE](https://developer.eximbay.com/eng/eximbay/payment_linkage/windows-authorization.html) |

The Korean [JavaScript SDK page](https://developer.eximbay.com/eximbay/api_sdk/javascript-sdk.html)
was also inspected and agrees with the dedicated English page on the test v2
installation example. No explicit current-version or deprecation notice that
resolves v1 versus v2 was located in the inspected pages.

Historical official PDFs, if later retained, are conflict/history evidence
only and cannot override the current official web pages above.

## 5. Current v1/v2 documentation conflict

The current official evidence is internally inconsistent:

| Page/section | Exact SDK asset shown |
| --- | --- |
| Dedicated JavaScript SDK | `https://api-test.eximbay.com/v2/javascriptSDK.js` |
| Common payment-page preparation | `https://api-test.eximbay.com/v2/javascriptSDK.js` |
| PAYMENT — SDK Preparation | `https://api-test.eximbay.com/v2/javascriptSDK.js` |
| PAYMENT — Payment Page Initiation | `https://api-test.eximbay.com/v1/javascriptSDK.js` |
| PAYER_AUTH — SDK Preparation | `https://api-test.eximbay.com/v2/javascriptSDK.js` |
| PAYER_AUTH — Payment Page Initiation | `https://api-test.eximbay.com/v1/javascriptSDK.js` |
| AUTHORIZE — SDK Preparation | `https://api-test.eximbay.com/v2/javascriptSDK.js` |
| AUTHORIZE — Payment Page Initiation | `https://api-test.eximbay.com/v1/javascriptSDK.js` |

This contract does not choose v2 merely because `2 > 1`. It preserves the
conflict for static-asset evidence and later independent adjudication.

## 6. SDK-asset and REST-API version-axis separation

BF3 freezes two independent evidence dimensions:

```text
SDK ASSET VERSION:
  /v1/javascriptSDK.js
  /v2/javascriptSDK.js

REST API VERSION:
  /v1/payments/...
```

The following inferences are prohibited unless Eximbay explicitly documents
the mapping:

```text
v2 JavaScript SDK -> /v2/payments
/v1/payments -> JavaScript SDK v1
ver=230 or version=230 -> /v1/javascriptSDK.js
ver=230 or version=230 -> /v2/javascriptSDK.js
```

The Payment Verification `version` requirement is a later-interface dependency,
not a BF3 callback design and not a resolved asset-version mapping.

## 7. Exact candidate asset register

One later execution may contact exactly these two documented test assets in
this fixed order:

| Ordinal | Environment class | Version class | Exact candidate URL | Current exact-path documentation status |
| ---: | --- | --- | --- | --- |
| 1 | `TEST` | `V2` | `https://api-test.eximbay.com/v2/javascriptSDK.js` | Explicitly shown by current dedicated/common/flow preparation documentation. |
| 2 | `TEST` | `V1` | `https://api-test.eximbay.com/v1/javascriptSDK.js` | Explicitly shown by current PAYMENT/PAYER_AUTH/AUTHORIZE initiation examples. |

The inspected official documentation publishes a production base origin but
does not currently establish either exact production JavaScript SDK path.
Production v1/v2 SDK probes are therefore not authorized targets, optional or
fallback targets, discovery probes, substitute URLs, or Result-v1 slots.

No query, fragment, non-default port, alternative case, filename, host, third
candidate, or other target may be substituted. An unused request ordinal may
not be reassigned.

## 8. Provider-contact ceiling and accounting

The reviewed contract may authorize exactly one separately invoked BF3 static
execution with:

```text
maximum total provider HTTP requests:
  2

method:
  GET

one request per exact candidate:
  YES

credentials:
  NONE

cookies:
  NONE

request body:
  NONE

custom merchant headers:
  NONE

automatic retries:
  DISABLED

redirect following:
  DISABLED

JavaScript execution:
  PROHIBITED
```

An attempt is consumed when the first operation capable of network contact
may begin. A timeout, reset, TLS failure after contact begins, 3xx, 4xx, 5xx,
oversized body, incomplete body, or content-type failure consumes the ordinal.
No failed or successful request is repeated. `HEAD` before `GET` is prohibited.
The executor must maintain:

```text
actualProviderRequestCount
  == count(asset.contactMayHaveBegun == true)

asset.executed
  == asset.contactMayHaveBegun

0 <= actualProviderRequestCount <= 2

each exact candidate:
  at most one contact attempt
```

Requests are sequential: one GET to ordinal 1 (`TEST V2`), then one GET to
ordinal 2 (`TEST V1`). There is no `HEAD`, retry, redirect following,
confirmation repeat, target substitution, or third request. Section 22 freezes
which outcomes allow ordinal 2 and which stop the execution.

## 9. Static-resource network safety

Before Request 1, the executor must prove all of the following:

```text
scheme:
  HTTPS only

certificate verification:
  ENABLED

minimum TLS:
  TLS 1.2

proxy:
  NONE, unless an independently approved proxy is proven not to log browser
  state, cookies, headers, or response bodies

cookies / cookie jar:
  DISABLED

Authorization:
  ABSENT

automatic redirects:
  DISABLED

automatic retries:
  DISABLED

connect timeout:
  5 seconds

total request timeout:
  15 seconds

maximum response body:
  262,144 bytes

Accept-Encoding:
  identity
```

The client must not use browser state, a browser cookie store, a credential
store, or an ambient authenticated session. HTTP debug logging, verbose header
logging, packet capture, and proxy capture are outside BF3.

If `Content-Length` is present and exceeds 262,144, abort without reading the
body. Otherwise stream to a temporary file while enforcing the limit. Read no
more than 262,145 bytes: the extra byte is only an overflow sentinel. On
header-declared oversize, record `HEADER_DECLARED_OVERSIZE_ABORTED`; on
stream-observed overflow, stop the stream and record
`STREAM_OVERSIZE_ABORTED`. In both cases retain no partial SDK file and set the
full-body hash to null. Do not fully buffer an oversized response.

The executor requests identity encoding. A non-identity `Content-Encoding` is
recorded in its bounded header field, produces
`CONTENT_ENCODING_NOT_IDENTITY` source non-admission and the mandatory
`UNEXPECTED_CONTENT_ENCODING` warning; no decompression or static source
inspection is permitted. Its exact raw entity bytes may still receive complete
custody under the same 262,144-byte ceiling. This prevents decompression-bomb
behavior and keeps retained custody identical to the HTTP entity bytes being
adjudicated.

## 10. Critical JavaScript non-execution boundary

Downloaded JavaScript bytes may be retained and inspected only as inert data.
The following are prohibited:

```text
browser <script src=...> load
eval
vm.runInContext / vm.runInNewContext / any vm.runIn* API
new Function
Playwright or Puppeteer execution
jsdom script execution
import()
dynamic import
Node require of downloaded SDK
EXIMBAY.request_pay()
form submission
popup creation
redirect initiation
```

No downloaded file may receive execute permission. No tool may parse it by
running the JavaScript engine. Static byte comparison, strict text decoding,
token/AST parsing configured without execution, and bounded textual searches
are allowed only after complete response custody and SHA-256 binding.

Current documentation says `EXIMBAY.request_pay()` initiates the payment page.
BF3 does not need or grant invocation authority. Whether an exact downloaded
asset statically appears to perform HTTP, popup, or redirect behavior is a
later `OBSERVED_STATIC` source observation only; this contract does not claim
that implementation fact in advance.

## 11. Complete-response and custody admission

Body custody and SDK-source admission are separate dimensions. An HTTP
response entity is `COMPLETE_BODY_RETAINED` when:

1. an HTTP response was received;
2. no redirect was followed, while a bounded 3xx response body may still be
   retained as inert response evidence;
3. the body completes within 262,144 bytes;
4. `Content-Length`, when present and valid, equals the completed byte count;
5. the exact raw entity bytes are written without decompression or
   normalization to the candidate's fixed evidence filename; and
6. byte count and SHA-256 are computed from those exact retained bytes.

A safely bounded non-identity-encoded body may therefore be retained and
hashed as custody evidence, but it is not eligible for SDK-source inspection.
Redirect status, non-2xx status, media type, charset, encoding, and strict
UTF-8 validity do not alter complete-custody truth; they govern the later
source-admission dimension.

HTTP status and Content-Type remain observed facts rather than silently
normalized success. Static SDK-interface inspection is permitted only for a
complete 2xx body whose Content-Type media type is one of:

```text
application/javascript
text/javascript
application/x-javascript
```

For admission, trim optional whitespace around the media type and parameters,
compare the media type and parameter name ASCII-case-insensitively, and admit
only an absent charset or exactly `utf-8` ASCII-case-insensitively. Duplicate
charset parameters, malformed parameters, or any other charset fail admission.
For `Content-Encoding`, only an absent field or the single token `identity`
ASCII-case-insensitively is admitted; a list or any other token fails.
Other complete
responses may still be hashed and retained as bounded HTTP evidence, but they
are not interpreted as an SDK source merely because the requested path ends in
`.js`.

SDK-source inspection admission is the following ordered predicate, with no
executor discretion:

```text
complete HTTP body == true
AND HTTP status is 2xx
AND Content-Encoding is absent or identity
AND Content-Type media type is an allowed JavaScript media type
AND charset is absent or UTF-8
AND strict UTF-8 decoding of the exact retained bytes succeeds
```

Failure of strict UTF-8 decoding produces `STRICT_UTF8_DECODE_FAILED`; the
asset is not admitted for source inspection. Replacement decoding, byte
normalization before hashing, and inspection of normalized text are
prohibited. SHA-256 always binds the exact retained custody bytes.

## 12. Exact evidence record per candidate

Result-v1 always contains exactly two ordered asset records: `assets[0]` is
ordinal 1 `TEST_V2`, and `assets[1]` is ordinal 2 `TEST_V1`. Every field below
is required. `null` is permitted only where the table says nullable; no
additional asset field is allowed.

| Field | Type | Nullable | Exact constraint |
| --- | --- | --- | --- |
| `ordinal` | integer | no | `1` or `2`, bound to the ordered inventory below |
| `requestedEnvironmentClass` | string enum | no | `TEST` only |
| `requestedVersionClass` | string enum | no | `V2` for ordinal 1; `V1` for ordinal 2 |
| `requestedUrl` | string | no | exact Section 7 URL for the ordinal |
| `exactPathDocumented` | boolean | no | `true` |
| `attemptState` | string enum | no | exact attempt-state vocabulary below |
| `executed` | boolean | no | exactly equals `contactMayHaveBegun` |
| `contactMayHaveBegun` | boolean | no | contact-accounting fact |
| `startedAt` | RFC 3339 UTC string | yes | instant immediately before the first contact-capable operation |
| `completedAt` | RFC 3339 UTC string | yes | terminal per-asset processing instant under the timestamp rules below |
| `retrievedAtUtc` | RFC 3339 UTC string | yes | successful complete-custody instant; otherwise `null` |
| `tlsCertificateVerified` | boolean | yes | observed verification outcome; `null` if no determinative TLS outcome |
| `tlsMinimumSatisfied` | boolean | yes | observed TLS >= 1.2 outcome; `null` if no determinative TLS outcome |
| `httpStatus` | integer | yes | `100..599`; present only after an HTTP response is received |
| `redirectLocation` | string | yes | bounded sanitized Location evidence for 3xx only; never followed |
| `responseContentType` | string | yes | bounded sanitized field value as received |
| `responseContentEncoding` | string | yes | bounded sanitized field value as received; absent header is `null` |
| `responseContentLengthHeader` | string | yes | bounded sanitized raw field value as received |
| `bodyCustodyOutcome` | string enum | no | exact body/custody vocabulary below |
| `bodyComplete` | boolean | no | whether the entire HTTP entity body was retained exactly |
| `bodyBytesObserved` | integer | no | exact raw response-body bytes read from the network; `0..262145` |
| `retainedBodyByteCount` | integer | yes | `0..262144`; non-null exactly when `bodyComplete` is true |
| `sha256` | lowercase hex string | yes | exactly 64 characters; hash of exact retained custody bytes |
| `custodyFilename` | string | yes | exact basename below; non-null exactly when `bodyComplete` is true |
| `terminalTransportOutcome` | string enum | no | transport/contact/HTTP dimension only; exact vocabulary below |
| `staticInspectionAdmitted` | boolean | no | exact Section 11 predicate result |
| `staticInspectionAdmissionReason` | string enum | no | first matching ordered admission reason below |
| `strictUtf8DecodeSucceeded` | boolean | yes | `true` or `false` only if strict decode was attempted; otherwise `null` |
| `staticInspectionOutcome` | string enum | no | `NOT_ADMITTED`, `COMPLETED`, or `METHOD_FAILED` |
| `staticObservations` | array | no | exactly five ordered observation records from Section 13 |

The immutable asset identities and custody basenames are:

| Array position | Ordinal | Identity | Exact URL | Custody basename |
| ---: | ---: | --- | --- | --- |
| `0` | `1` | `TEST_V2` | `https://api-test.eximbay.com/v2/javascriptSDK.js` | `01-test-v2-javascriptSDK.js` |
| `1` | `2` | `TEST_V1` | `https://api-test.eximbay.com/v1/javascriptSDK.js` | `02-test-v1-javascriptSDK.js` |

This table is derived directly from Section 7. Any ordinal, environment,
version, URL byte, URL path byte, order, filename, extra slot, or missing slot
divergence makes Result-v1 invalid; unauthorized targets receive no record.

Attempt-state vocabulary is exact and non-overlapping:

```text
AUTHORIZED_NOT_ATTEMPTED
  Authorized ordinal was not reached; no contact began.

LOCAL_PREFLIGHT_FAILED_NO_CONTACT
  This ordinal's local preflight failed and no contact began.

CONTACT_MAY_HAVE_BEGUN
  The contact-capable operation began, no HTTP response was received, and a
  bounded non-ambiguous terminal transport outcome was recorded.

HTTP_RESPONSE_RECEIVED
  An HTTP status/headers response was received, whether or not the body was
  complete or admissible.

TRANSPORT_AMBIGUOUS
  Contact may have begun and exact bounded transport/contact behavior cannot
  be proven.
```

Every asset is classified once in this fixed dimension order:

```text
1. attempt/contact truth
2. terminal transport/HTTP truth
3. body streaming/custody truth
4. SDK-source admission truth
5. static-inspection outcome
6. mechanically derived warnings
```

Later dimensions never overwrite earlier facts. Compound anomalies occupy
their own dimensions. For example, HTTP 302 plus an oversized body is
`HTTP_RESPONSE_RECEIVED` in transport, the applicable oversize value in
body/custody, a failed source admission, and all mechanically required
warnings. The executor never selects whichever anomaly was noticed first.

`terminalTransportOutcome` uses exactly this transport/contact/HTTP vocabulary:

```text
NOT_ATTEMPTED
LOCAL_PREFLIGHT_FAILED_NO_CONTACT
HTTP_RESPONSE_RECEIVED
TRANSPORT_AMBIGUOUS
TLS_OR_CERTIFICATE_FAILURE
CONNECT_TIMEOUT
TOTAL_TIMEOUT
CONNECTION_FAILURE
LOCAL_SAFETY_BLOCK
```

It is chosen by the first matching rule in this order:

1. no contact and the ordinal was not reached -> `NOT_ATTEMPTED`;
2. no contact and this ordinal's preflight failed ->
   `LOCAL_PREFLIGHT_FAILED_NO_CONTACT`;
3. a valid HTTP status was received -> `HTTP_RESPONSE_RECEIVED`, regardless
   of later body status, reset, timeout, status class, or redirect status;
4. contact may have begun but exact one-attempt transport behavior cannot be
   proven -> `TRANSPORT_AMBIGUOUS`;
5. TLS >= 1.2 or certificate/hostname verification failed before an HTTP
   response -> `TLS_OR_CERTIFICATE_FAILURE`;
6. the five-second connection deadline expired before an HTTP response ->
   `CONNECT_TIMEOUT`;
7. the 15-second total deadline expired before an HTTP response ->
   `TOTAL_TIMEOUT`;
8. a DNS, socket, connect, or reset failure occurred before an HTTP response ->
   `CONNECTION_FAILURE`;
9. a local safety invariant blocked processing after contact began, with none
   of the earlier facts -> `LOCAL_SAFETY_BLOCK`.

These predicates are mutually exclusive by precedence. HTTP 3xx, 4xx, and 5xx
remain HTTP status facts and are never transport failures. `attemptState` is
derived: the first two transport values map to their same-named no-contact
states, `HTTP_RESPONSE_RECEIVED` maps to `HTTP_RESPONSE_RECEIVED`,
`TRANSPORT_AMBIGUOUS` maps to `TRANSPORT_AMBIGUOUS`, and every other contacted
transport value maps to `CONTACT_MAY_HAVE_BEGUN`.

`bodyCustodyOutcome` uses exactly:

```text
NOT_APPLICABLE_NO_HTTP_RESPONSE
COMPLETE_BODY_RETAINED
HEADER_DECLARED_OVERSIZE_ABORTED
STREAM_OVERSIZE_ABORTED
INCOMPLETE_BODY
CUSTODY_WRITE_FAILED
```

It is chosen by the first matching rule in this order:

1. no HTTP response -> `NOT_APPLICABLE_NO_HTTP_RESPONSE`;
2. a valid Content-Length above 262,144 stopped reading before the body ->
   `HEADER_DECLARED_OVERSIZE_ABORTED`;
3. the 262,145th raw overflow-sentinel byte was read ->
   `STREAM_OVERSIZE_ABORTED`;
4. exact-byte file creation, writing, finalization, hashing, or custody
   verification failed -> `CUSTODY_WRITE_FAILED`;
5. the entire raw entity body, including a zero-byte body, completed and was
   retained and hashed exactly -> `COMPLETE_BODY_RETAINED`;
6. otherwise -> `INCOMPLETE_BODY`.

No partial body or oversize prefix enters `original/` or `archive/`; those
states have no custody filename and no SDK-body SHA authority. A complete
non-identity-encoded or non-JavaScript body remains
`COMPLETE_BODY_RETAINED`; its source-admission dimension fails separately.
`INCOMPLETE_BODY` includes a valid non-oversize Content-Length that does not
equal the raw bytes observed at terminal body handling.
`bodyComplete` is true if and only if `bodyCustodyOutcome` is
`COMPLETE_BODY_RETAINED`.

Admission reasons are evaluated in this order and the first match is recorded:

```text
NOT_ATTEMPTED
BODY_NOT_COMPLETE
HTTP_STATUS_NOT_2XX
CONTENT_ENCODING_NOT_IDENTITY
CONTENT_TYPE_MISSING
CONTENT_TYPE_NOT_ALLOWED_JAVASCRIPT
CHARSET_NOT_UTF8
STRICT_UTF8_DECODE_FAILED
ADMITTED
```

The reason names refer directly to the ordered Section 11 predicate:
`NOT_ATTEMPTED` means no inspection-eligible response exists;
`BODY_NOT_COMPLETE` includes every incomplete/absent retained body;
`HTTP_STATUS_NOT_2XX` means the recorded status is outside 200..299;
`CONTENT_ENCODING_NOT_IDENTITY`, `CONTENT_TYPE_MISSING`,
`CONTENT_TYPE_NOT_ALLOWED_JAVASCRIPT`, and `CHARSET_NOT_UTF8` mean the
corresponding frozen header predicate failed; `STRICT_UTF8_DECODE_FAILED`
means exact-byte strict decoding failed; and `ADMITTED` means every predicate
succeeded.

`staticInspectionAdmitted` is true if and only if the reason is `ADMITTED`.
`strictUtf8DecodeSucceeded` is `null` when an earlier admission predicate
failed, `false` only for `STRICT_UTF8_DECODE_FAILED`, and `true` only for
`ADMITTED`.

`bodyBytesObserved` is the total count of raw response-body bytes actually
read from the network before terminal body handling. It is never nullable and
obeys exactly:

```text
no contact or no HTTP response:
  0

HTTP response with complete zero-byte body:
  0

COMPLETE_BODY_RETAINED:
  bodyBytesObserved == retainedBodyByteCount

HEADER_DECLARED_OVERSIZE_ABORTED:
  0

STREAM_OVERSIZE_ABORTED:
  262145

INCOMPLETE_BODY or CUSTODY_WRITE_FAILED:
  exact raw bytes read, 0..262144
```

For `COMPLETE_BODY_RETAINED`, `retainedBodyByteCount`, `sha256`, and
`custodyFilename` are non-null and bind the complete exact raw bytes. For every
other body/custody outcome, all three are null and any temporary or partial
file is excluded from evidence custody.

Per-asset timestamps obey exactly:

```text
AUTHORIZED_NOT_ATTEMPTED:
  startedAt == null
  completedAt == null

LOCAL_PREFLIGHT_FAILED_NO_CONTACT:
  startedAt == null
  completedAt == UTC instant the local failure became terminal

every contact-consuming terminal state:
  startedAt == UTC instant immediately before the contact-capable operation
  completedAt == UTC instant per-asset transport/body processing became terminal

COMPLETE_BODY_RETAINED:
  retrievedAtUtc == UTC instant complete exact custody succeeded

every other body/custody outcome:
  retrievedAtUtc == null
```

`HTTP_RESPONSE_RECEIVED` is reciprocal: it requires non-null `httpStatus`,
`contactMayHaveBegun == true`, and non-null `startedAt` and `completedAt`; any
non-null `httpStatus` requires `attemptState == HTTP_RESPONSE_RECEIVED` and
`terminalTransportOutcome == HTTP_RESPONSE_RECEIVED`.

No cookies, Set-Cookie value, arbitrary response headers, browser state,
exception stack, or unrelated response-body text enters Result-v1.
`redirectLocation` is evidence only. Before retention, CR, LF, NUL, C0/C1
control characters, and DEL are replaced with U+FFFD; the result is truncated
to 2,048 Unicode scalar values. The same sanitization applies to the three
retained response-header strings, each truncated to 256 Unicode scalar values.

## 13. Static source inspection semantics

The decision-bearing method identifier is
`STRICT_UTF8_EXACT_LITERAL_SUBSTRING_V1`. For every admitted asset it means:

```text
1. strictly decode the exact retained custody bytes as UTF-8;
2. for each frozen token, perform an exact case-sensitive literal substring
   search over that decoded text;
3. perform no JavaScript execution, expression evaluation, semantic runtime
   emulation, deobfuscation, source-map fetch, or network access.
```

Result-v1 records the method identifier plus the ordinary non-executing
tool/runtime name and version. Parser/AST tooling is unnecessary and is not
authorized by this v0.1 method. If the method cannot complete deterministically,
the executor does not improvise another parser or execution path.

`staticInspectionOutcome` is a required per-asset field with exactly these
mutually exclusive meanings:

```text
NOT_ADMITTED
  staticInspectionAdmitted == false
  the frozen literal method was not run

COMPLETED
  staticInspectionAdmitted == true
  all five frozen literal predicates completed deterministically

METHOD_FAILED
  staticInspectionAdmitted == true
  the frozen method began but did not complete deterministically
  no fallback parser, tool, method, or execution path was used
```

Each asset's `staticObservations` array has exactly these five records in this
order. Every record has exactly three required, non-null string fields:
`observationId`, `predicateTokenId`, and `status`.

| Position | `observationId` | `predicateTokenId` | Exact case-sensitive token |
| ---: | --- | --- | --- |
| `0` | `PUBLIC_EXIMBAY_LITERAL` | `TOKEN_EXIMBAY` | `EXIMBAY` |
| `1` | `REQUEST_PAY_LITERAL` | `TOKEN_REQUEST_PAY` | `request_pay` |
| `2` | `TEST_ORIGIN_LITERAL` | `TOKEN_TEST_ORIGIN` | `https://api-test.eximbay.com` |
| `3` | `PRODUCTION_ORIGIN_LITERAL` | `TOKEN_PRODUCTION_ORIGIN` | `https://api.eximbay.com` |
| `4` | `V1_PAYMENTS_PATH_LITERAL` | `TOKEN_V1_PAYMENTS_PATH` | `/v1/payments` |

`status` uses exactly one truth value:

```text
OBSERVED_STATIC
NOT_OBSERVED_STATIC
UNRESOLVED_BY_STATIC_INSPECTION
```

`OBSERVED_STATIC` means the exact literal predicate was positively satisfied.
`NOT_OBSERVED_STATIC` means the predicate completed and the literal was not
found; it does not establish runtime absence or impossibility.
`UNRESOLVED_BY_STATIC_INSPECTION` means admission failed, the frozen method
failed, or stronger semantic/runtime inference would be required. The fixed
five-record representation is mandatory in every outcome:

```text
NOT_ADMITTED
  -> all five statuses == UNRESOLVED_BY_STATIC_INSPECTION
  -> staticInspectionAdmissionReason records the admission failure
  -> no predicate is represented as evaluated

COMPLETED
  -> each status is exactly OBSERVED_STATIC or NOT_OBSERVED_STATIC

METHOD_FAILED
  -> all five statuses == UNRESOLVED_BY_STATIC_INSPECTION
  -> the predicates are represented as unresolved after admitted-method failure
```

Thus non-admission and post-admission method failure cannot collapse into the
same state even though both retain five unresolved observation records. No
evidence snippet or SDK source text is stored in Result-v1.

## 14. Byte comparison

Because exactly two assets exist, Result-v1 contains exactly one comparison
record: left is ordinal 1 `TEST_V2`; right is ordinal 2 `TEST_V1`. Its exact
schema is:

| Field | Type | Nullable | Exact constraint |
| --- | --- | --- | --- |
| `leftAssetOrdinal` | integer | no | `1` |
| `leftAssetIdentity` | string | no | `TEST_V2` |
| `rightAssetOrdinal` | integer | no | `2` |
| `rightAssetIdentity` | string | no | `TEST_V1` |
| `comparisonEligible` | boolean | no | true iff both complete retained custody bodies exist |
| `byteCountEqual` | boolean | yes | non-null iff `comparisonEligible` |
| `sha256Equal` | boolean | yes | non-null iff `comparisonEligible` |
| `byteIdentical` | boolean | yes | non-null iff `comparisonEligible`; direct byte-for-byte result |
| `publicEximbayObservationComparison` | string enum | no | exact observation-comparison vocabulary below |
| `requestPayObservationComparison` | string enum | no | exact observation-comparison vocabulary below |
| `providerOriginPathObservationComparison` | string enum | no | comparison of the ordered triple test-origin, production-origin, `/v1/payments` |

The three observation-comparison fields use exactly:

```text
BOTH_OBSERVED_STATIC
BOTH_NOT_OBSERVED_STATIC
DIFFERENT_STATIC_OBSERVATION
UNRESOLVED_BY_STATIC_INSPECTION
```

An observation comparison is unresolved unless both corresponding asset
observations were deterministically evaluated. The provider-origin/path field
is unresolved if any member of its ordered triple is unresolved; otherwise it
is `BOTH_OBSERVED_STATIC` or `BOTH_NOT_OBSERVED_STATIC` only when all three
pair results have that same status, and `DIFFERENT_STATIC_OBSERVATION`
otherwise. Hash/count equality never substitutes for direct byte comparison.
Byte identity establishes neither equal support nor canonicality.

## 15. SDK-canonicality adjudication rule

After Section 21's decision-grade package-admission gate succeeds, independent
adjudication applies this bounded rule, not a categorical numeric document
hierarchy:

1. A current, applicable, explicit Eximbay statement about current, supported,
   deprecated, legacy, migration, or replacement status has the strongest
   version-status authority for the scope to which it explicitly applies.
   Version numbering never implies such status.
2. Absent an explicit applicable status statement, evaluate current dedicated
   JavaScript SDK documentation and current common payment-page preparation
   documentation together. Their agreement is strong normative evidence.
3. Evaluate PAYMENT, PAYER_AUTH, and AUTHORIZE content by applicability,
   section specificity, and internal consistency. An internally contradictory
   transaction page cannot silently override consistent dedicated/common SDK
   instructions. A clear, internally consistent, applicable transaction
   requirement cannot be ignored merely because it appears in a
   transaction-specific document.
4. Static SDK evidence is observational only. It may corroborate, contradict,
   expose material implementation differences, or force `UNRESOLVED`. It
   cannot by itself establish provider recommendation, canonical version,
   deprecation, or support status.

If materially applicable current normative provider evidence remains tied or
contradictory after this analysis, the canonical version is `UNRESOLVED`. If
that ambiguity would affect EX2B2 correctness, vendor clarification becomes
the next evidence gate; Mira does not guess locally. Asset reachability alone
never establishes canonicality, and an HTTP failure in one run does not prove
formal deprecation.

## 16. Bounded result dispositions

For a decision-grade admitted BF3 package, independent adjudication must choose
exactly one:

```text
BF3_V2_SUPPORTED_FOR_EX2B2_DESIGN
BF3_V1_SUPPORTED_FOR_EX2B2_DESIGN
BF3_VERSION_UNRESOLVED_VENDOR_CLARIFICATION_REQUIRED
BF3_EVIDENCE_INVALID_OR_INCOMPLETE
```

`BF3_V2_SUPPORTED_FOR_EX2B2_DESIGN` requires the Section 15 adjudication rule
to support test v2, complete admitted test-v2 evidence whose frozen
`EXIMBAY` and `request_pay` literals are observed, and no unresolved material
normative or static contradiction.

`BF3_V1_SUPPORTED_FOR_EX2B2_DESIGN` requires the Section 15 adjudication rule
to support test v1, complete admitted test-v1 evidence whose frozen `EXIMBAY`
and `request_pay` literals are observed, and no unresolved material
contradiction. It cannot result merely from the lower numeral, continued
reachability, or the three internally conflicting flow examples.

`BF3_VERSION_UNRESOLVED_VENDOR_CLARIFICATION_REQUIRED` applies when valid
official/static evidence leaves a material canonical-version ambiguity that
would change EX2B2 correctness. `BF3_EVIDENCE_INVALID_OR_INCOMPLETE` applies
when the admitted semantic Result records insufficient SDK-asset custody,
execution conformance, required test-asset evidence, or safe static inspection.
A Result-v1 or PackageIntegrity-v1 failure that prevents decision-grade package
admission is reported as an admission failure outside Result-v1 and does not
rewrite Result semantic fields into this disposition.

A supported disposition authorizes only a later EX2B2 design contract to adopt
the selected exact test SDK candidate. It authorizes no Mira implementation,
SDK loading, provider request, or payment-page invocation. Production-path
evidence is outside this execution inventory and cannot be silently promoted
to production merchant readiness.

## 17. Vendor-clarification trigger

Neither this authoring task nor the later BF3 static execution may contact
Eximbay personnel. Vendor clarification becomes the next gate only after valid
official-document and static-asset adjudication leaves a material ambiguity,
such as:

```text
dedicated current SDK documentation and exact static evidence materially disagree
both versions appear equally current but differ incompatibly with no provider precedence
test/production version mapping cannot be bounded safely for the proposed design
an explicit deprecation or migration notice remains materially ambiguous
```

The mere reachability of both public versions is not a vendor-clarification
trigger.

## 18. Production boundary

The exact production JavaScript SDK paths are not established by the reviewed
official documentation and are not authorized BF3 targets, optional probes,
fallbacks, discovery requests, or Result-v1 records. No BF3 request is made to
`api.eximbay.com`. Even a separately authorized future static-resource
observation would not prove:

```text
live MID exists
live API key exists
merchant contract is complete
P000 is enabled
USD or JPY settlement is enabled
payment processing is enabled
Mira routing is enabled
customer-safe production activation
```

No production credential, merchant request, transaction, or payment-page load
exists in BF3.

## 19. Callback and version-field boundary

The current Payment API reference makes the SDK-version-related verification
field mandatory and its relevant example shows `ver=230`. Separately, the
current AUTHORIZE flow shows `version=230`. Neither source establishes a
mapping from `230` to JavaScript SDK v1 or v2.

BF3 records only:

```text
later interface dependency:
  PRESENT

mapping to /v1/javascriptSDK.js or /v2/javascriptSDK.js:
  UNRESOLVED BY CURRENT INSPECTED DOCUMENTATION
```

BF3 does not design BF4 callback processing, status transport, verification,
acknowledgement, retries, or completion.

## 20. Deterministic external evidence custody

Before Request 1, the later executor must predeclare and prove writable one
absolute evidence root outside the Mira repository. The recommended local
shape is:

```text
/Users/duckcow/mira-evidence/eximbay-bf3/<UTC_RUN_ID>/
  eximbay-bf3-static-sdk-package-integrity-v1-<UTC_RUN_ID>.json
  original/
    eximbay-bf3-static-sdk-result-v1-<UTC_RUN_ID>.json
    assets/
      01-test-v2-javascriptSDK.js
      02-test-v1-javascriptSDK.js
  archive/
    eximbay-bf3-static-sdk-result-v1-<UTC_RUN_ID>.json
    assets/
      01-test-v2-javascriptSDK.js
      02-test-v1-javascriptSDK.js
```

Only complete retained raw entity bodies receive asset files. A bounded 3xx or
non-identity response may receive a custody file only when its entire raw body
is safely retained; status and encoding still prevent source admission. A
missing file for an oversized, incomplete, failed-custody, or no-response state
is represented explicitly in Result-v1. Partial temporary files are not
evidence and must not enter `original/` or `archive/`.

The SDK bytes are provider-owned public static evidence. Their retention is
permitted only in this external local package because exact byte comparison and
offline inspection are useful to BF3. No SDK byte is copied into Git,
`.local-review/**`, application storage, a production bucket, a Markdown code
block, or chat output.

Result-v1 and PackageIntegrity-v1 are different artifacts with different
authorities:

```text
Result-v1:
  semantic BF3 execution/evidence truth fixed before packaging

PackageIntegrity-v1:
  Result-v1 byte creation, write, archive, verification, equality, and package
  custody truth fixed after the packaging attempt
```

### BF3 canonical JSON UTF-8 profile

`BF3_CANONICAL_JSON_UTF8_V1` is the single normative byte-serialization
profile for both Result-v1 and PackageIntegrity-v1. The profile, not a generic
runtime serializer or its defaults, is authoritative. No executor-selected
serializer behavior may choose the artifact bytes.

Before serialization, each artifact must be a fully schema-validated typed
value containing only:

```text
object
array
Unicode-scalar string
integer
boolean
null
```

Floating-point values, `NaN`, `Infinity`, `-Infinity`, `undefined`, functions,
symbols, binary objects, native runtime date objects, and arbitrary serializer
extensions are prohibited. Every current numeric Result-v1 and
PackageIntegrity-v1 schema field is an integer field. If any schema/value
mismatch would require a non-integer, canonicalization fails; the executor must
not silently serialize a floating-point value or change the semantic field
type. Every timestamp is already a validated string before canonicalization.

Every field defined by the applicable exact schema is serialized. A nullable
schema field whose semantic value is absent is serialized as `null`; omission
is not an equivalent representation. Unspecified and extension keys are
invalid. These rules apply to top-level and nested objects.

Object keys appear exactly in the field order defined by the applicable schema
in this contract. Nested objects use their own listed schema order. Keys are
never lexically sorted unless a particular schema explicitly defines lexical
order. Implementation insertion order is not authority. Every schema key is a
fixed contract string and uses the same canonical string-token algorithm as a
string value.

Arrays preserve their existing frozen semantic order and are never reordered
by canonicalization. This includes the TEST V2 asset before TEST V1, static
observations in frozen observation-ID order, warning records in frozen
deterministic warning order, the single comparison inventory, official
documentation URLs, and every other schema-ordered array.

#### Exact string-token algorithm

An input string must contain only Unicode scalar values. An unpaired surrogate
or any other non-scalar internal representation is a local canonicalization
failure. No NFC, NFD, or compatibility normalization is applied. The
semantic/sanitization layer owns the exact string value; canonicalization only
encodes that value.

Each token begins and ends with ASCII `"`. Inside the token, use exactly:

| Input scalar | Exact emitted ASCII bytes |
| --- | --- |
| U+0022 QUOTATION MARK | `\"` |
| U+005C REVERSE SOLIDUS | `\\` |
| U+0008 | `\b` |
| U+0009 | `\t` |
| U+000A | `\n` |
| U+000C | `\f` |
| U+000D | `\r` |

Every other scalar from U+0000 through U+001F is emitted as `\u00xx`, where
`xx` is exactly two lowercase hexadecimal digits. Thus U+0000 is `\u0000`,
U+0001 is `\u0001`, and U+001F is `\u001f`. No alternate valid JSON escape is
permitted.

Except for quote and reverse-solidus handling above, every Unicode scalar at
or above U+0020 is emitted directly as its UTF-8 bytes. `/` is `/`, never `\/`.
Printable non-ASCII scalars are not converted to `\uXXXX`. In particular,
U+FFFD is the literal UTF-8 sequence `EF BF BD` inside its quotes, never
`\ufffd` or `\uFFFD`. U+2028 and U+2029 are likewise emitted as literal UTF-8
scalars; these artifacts are JSON data, not executable JavaScript source.

The canonicalizer therefore has no discretion between literal Unicode and a
Unicode escape, `/` and `\/`, `\b` and `\u0008`, or `\n` and `\u000a`.

#### Scalar lexical forms

Each integer is base-10 ASCII. Zero is exactly `0`; a positive integer is
`[1-9][0-9]*`; and a negative integer is `-[1-9][0-9]*` only when the existing
schema field explicitly permits a negative value. The forms `+1`, `01`, `-0`,
`1.0`, `1.`, `1e0`, `1E0`, `1e+0`, hexadecimal, and octal are prohibited.
Fields defined as non-negative cannot contain a negative integer.

Boolean and null tokens are exactly the lowercase ASCII tokens `true`,
`false`, and `null`.

Every schema timestamp string must conform before serialization to exactly
`YYYY-MM-DDTHH:mm:ss.SSSZ`: Gregorian date/time, 24-hour clock, literal `T`,
UTC only, exactly three fractional-second digits, and literal uppercase `Z`.
An offset such as `+00:00`, missing milliseconds, six or nine fractional
digits, lowercase `z`, or a space instead of `T` is invalid. If a timestamp
source has finer-than-millisecond precision, the semantic timestamp conversion
truncates the sub-millisecond portion and never rounds. The canonicalizer does
not parse or reinterpret the validated timestamp string.

#### Exact layout and top-level bytes

Indentation is exactly two ASCII SPACE bytes per nesting level. Newlines are
LF (`0x0A`) only; tabs, CRLF, and trailing whitespace are prohibited.

At nesting depth `d`, a non-empty object is emitted as:

```text
{
<LF>
<indent d+1><key>: <value>,<LF>
...
<indent d+1><last key>: <last value><LF>
<indent d>}
```

The colon is followed by exactly one SPACE, each non-final member has a comma
immediately after its value, and a trailing comma is prohibited. An empty
object is exactly `{}` with no internal whitespace.

At nesting depth `d`, a non-empty array is emitted as:

```text
[
<LF>
<indent d+1><value>,<LF>
...
<indent d+1><last value><LF>
<indent d>]
```

A trailing comma is prohibited. An empty array is exactly `[]`. Nested objects
and arrays recursively follow these same rules.

Each deterministic artifact is the UTF-8 encoding of exactly one top-level
JSON object followed by exactly one final LF byte. A UTF-8 BOM, leading
whitespace, a blank line before the object, more than one final LF, trailing
spaces, and bytes after the final LF are prohibited. The first byte is `{`
(`0x7B`) and the last byte is LF (`0x0A`).

#### Result hashing and PackageIntegrity serialization boundary

Every Result-v1 byte count or SHA-256 recorded in PackageIntegrity-v1 covers
the complete immutable `BF3_CANONICAL_JSON_UTF8_V1` Result-v1 sequence,
including its single final LF. The executor must not hash a parsed object, a
decoded string representation, JSON without the final LF, filesystem-converted
newlines, or normalized Unicode. The original and archive Result files must
contain those same exact bytes.

PackageIntegrity-v1 itself uses `BF3_CANONICAL_JSON_UTF8_V1`. This creates no
self-reference: it contains no own byte count, own SHA-256, own write
verification, or own archive verification, and this correction adds none.

If Result-v1 construction, validation, canonicalization, or serialization
cannot produce conformant bytes, Result-v1 is `NONE` and a separately valid
PackageIntegrity-v1 records `RESULT_V1_NOT_CREATED` under the already-frozen
package separation. The executor must not fabricate alternate Result bytes,
switch serializers, or contact the provider again.

#### Mandatory local canonicalizer preflight

Before any BF3 provider HTTP contact, the later executor must prove locally
that its one selected canonicalizer conforms to this profile using all vectors
below. This is a local preflight and consumes no provider ordinal. Any failure
stops before provider contact under `LOCAL_PREFLIGHT_FAILED`; the executor may
not switch to another serializer after failure.

The exact scalar vectors are:

| Semantic value | Required JSON token or UTF-8 bytes |
| --- | --- |
| string `plain ASCII` | `"plain ASCII"` |
| string U+0022 | `"\""` |
| string U+005C | `"\\"` |
| string `/` | `"/"` |
| string U+000A | `"\n"` |
| string U+0001 | `"\u0001"` |
| string U+FFFD | literal `"�"`; bytes `22 EF BF BD 22` |
| string U+D55C (`한`) | literal `"한"`; bytes `22 ED 95 9C 22` |
| string U+2028 | quote, literal U+2028, quote; bytes `22 E2 80 A8 22` |
| integer zero | `0` |
| integer one | `1` |
| integer ten | `10` |

The timestamp validator must accept `2026-08-11T12:34:56.789Z` and reject at
least `2026-08-11T12:34:56Z`, `2026-08-11T12:34:56.789000Z`,
`2026-08-11T12:34:56.789+00:00`, `2026-08-11 12:34:56.789Z`, and
`2026-08-11T12:34:56.789z`.

The full-artifact vector schema defines its fields in the displayed order and
its nested `metadata` fields in displayed order. The following code block
shows the exact expected UTF-8 text: the displayed first `{` is byte zero, and
the displayed closing `}` is followed by exactly one LF and no other trailing
byte. Markdown fence delimiters and the line break after the opening delimiter
are not artifact bytes.

```json
{
  "schema": "bf3-canonical-profile-self-test",
  "version": 1,
  "startedAt": "2026-08-11T12:34:56.789Z",
  "metadata": {
    "nullable": null,
    "valid": true,
    "replacement": "�"
  },
  "items": [
    "plain",
    0,
    10
  ],
  "empty": []
}
```

Its exact byte count is `256` and its SHA-256 is
`ba513913f921e090d2827f0be9dc09ad05f2a39bfe25eda66fa93a162fd3eff0`.
The vector covers a nested object, non-empty array, empty array, nullable
field, boolean, integers, an exact timestamp, and literal U+FFFD. Before
execution, the expected bytes and digest must be independently verified rather
than accepted from the candidate canonicalizer under test.

The profile is normative and programming-language neutral. A later executor
may implement it in Node, Python, or another suitable local tool only if that
implementation passes the frozen local preflight. `JSON.stringify`,
`json.dumps`, or any other generic serializer is not canonical by definition.

For the decisive reviewer case, a semantic sanitized header value containing
U+FFFD previously allowed either literal UTF-8 U+FFFD or `\uFFFD`/`\ufffd`.
Under `BF3_CANONICAL_JSON_UTF8_V1`, only literal U+FFFD encoded as `EF BF BD`
is legal.

Accordingly:

```text
same schema-valid semantic Result-v1 values
+ same frozen field and array ordering
-> exactly one Result-v1 byte sequence

same schema-valid PackageIntegrity-v1 values
+ same frozen field and array ordering
-> exactly one PackageIntegrity-v1 byte sequence
```

No choice of legal JSON escapes, numeric lexical form, timestamp form,
whitespace, BOM, final newline, or Unicode representation remains.

After the semantic cutoff in Section 21, construct and validate the semantic
Result-v1 object, canonicalize it once, and serialize it once under
`BF3_CANONICAL_JSON_UTF8_V1`. That exact immutable byte sequence is the only
source for both Result files. Do not independently serialize the semantic
object for `original/` and `archive/`.

Write the immutable Result bytes to `original/`, then write/copy those same
bytes to `archive/`. Copy each retained SDK asset to `archive/`. For every
corresponding pair that exists, observe:

```text
separate regular files
byte count
SHA-256
byte-for-byte equality or mismatch
```

Package outcomes never cause Result-v1 reconstruction, mutation,
canonicalization, or reserialization. After the one Result-v1 serialization,
neither the semantic object nor its byte sequence may change. After a Result
original or archive is written, it is not rewritten before independent
adjudication.

PackageIntegrity-v1 is constructed only after the bounded Result packaging
attempt is terminal. It is canonicalized once, serialized once under
`BF3_CANONICAL_JSON_UTF8_V1`, and written once to its predeclared root basename.
It is not placed in `original/` or `archive/`, does not require a copy or archive
of itself, and does not report its own write or future survival.
Later adjudication may inspect whether the PackageIntegrity-v1 file still
exists and parses. There is no PackageIntegrity-about-PackageIntegrity.

Durable repository adjudication later binds only the run ID, canonical
basenames, byte counts, and SHA-256 values; it does not commit the SDK bytes,
Result-v1, or PackageIntegrity-v1.

## 21. Result-v1 exact schema and invariants

`RESULT_V1_SEMANTIC_CUTOFF` is the single semantic boundary for Result-v1.
It occurs only after all of the following are terminal and known:

```text
provider/static execution
per-asset attempt and contact classification
transport and HTTP classification
body and SDK-asset custody classification
source admission
static inspection
pairwise SDK comparison
semantic warnings
semantic terminalOutcome
semantic stopReason
semantic completedAt
```

It occurs before any of the following:

```text
Result-v1 canonicalization or serialization
Result-v1 filesystem write or write verification
Result-v1 archive creation or verification
Result-v1 original/archive comparison
PackageIntegrity-v1 finalization
```

No Result-v1 field may depend on a fact that first arises after
`RESULT_V1_SEMANTIC_CUTOFF`. SDK-asset custody, including
`CUSTODY_WRITE_FAILED`, remains a semantic execution/evidence fact because it
is terminal before this cutoff. Result-v1's own creation, filesystem custody,
archive, and later survival are package facts and are excluded.

Immediately before crossing the cutoff, freeze `completedAt` as the
semantic-finalization instant. After the cutoff, construct the complete
Result-v1 semantic object, validate every invariant in this section,
canonicalize the object once in the exact field/array order frozen by this
contract, and serialize once. If construction, validation,
canonicalization, or serialization fails, no valid Result-v1 exists. The
executor must not create a second failure-shaped Result-v1 describing that
failure; PackageIntegrity-v1 records `RESULT_V1_NOT_CREATED` instead.

The deterministic sanitized metadata artifact is a JSON object with exactly
the fields below. Every field is required; nullable fields explicitly say so.
No additional top-level or nested field is allowed.

| Field | Type | Nullable | Exact constraint |
| --- | --- | --- | --- |
| `schema` | string | no | `mira.eximbay.bf3-static-sdk-evidence-result` |
| `version` | integer | no | `1` |
| `experiment` | string | no | `EXIMBAY-BF3-STATIC-SDK-EVIDENCE` |
| `runId` | string | no | UTC-based identifier matching `^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$` |
| `contractIdentity` | string | no | `EXIMBAY-BF3-STATIC-JAVASCRIPT-SDK-EVIDENCE-CONTRACT-v0.1` |
| `startedAt` | RFC 3339 UTC string | no | instant immediately before local execution preflight begins |
| `completedAt` | RFC 3339 UTC string | no | semantic-finalization instant fixed immediately before `RESULT_V1_SEMANTIC_CUTOFF` |
| `repositoryAuthority` | object | no | exact object schema below |
| `officialDocumentation` | object | no | exact object schema below |
| `staticInspectionMethod` | object | no | exact object schema below |
| `requestCeiling` | integer | no | `2` |
| `actualProviderRequestCount` | integer | no | `0..2` |
| `terminalOutcome` | string enum | no | exact terminal vocabulary below |
| `stopReason` | string enum | no | exact stop-reason vocabulary below |
| `assets` | array | no | length 2; exact ordered Section 12 records |
| `comparisons` | array | no | length 1; exact Section 14 record |
| `warnings` | array | no | `0..32` exact warning records |

`repositoryAuthority` has exactly four required, non-null string fields:

| Field | Constraint |
| --- | --- |
| `contractPath` | `docs/engineering/eximbay-bf3-static-javascript-sdk-evidence-contract-v0.1.md` |
| `contractMergeCommit` | 40 lowercase hexadecimal characters |
| `contractFileSha256` | 64 lowercase hexadecimal characters |
| `ex2b1SourceStatusMergeCommit` | 40 lowercase hexadecimal characters |

`officialDocumentation` has exactly two required, non-null fields:
`retrievalDate`, the string `2026-08-11`, and `urls`, an array of strings equal
to this exact ordered inventory:

```text
https://developer.eximbay.com/eng/eximbay/api_sdk/javascript-sdk.html
https://developer.eximbay.com/eng/eximbay/payment_linkage/preparing-payment.html
https://developer.eximbay.com/eng/eximbay/payment_linkage/windows-consolidation.html
https://developer.eximbay.com/eng/eximbay/payment_linkage/windows-authentication.html
https://developer.eximbay.com/eng/eximbay/payment_linkage/windows-authorization.html
https://developer.eximbay.com/eng/eximbay/api_list/reference.html
https://developer.eximbay.com/eximbay/api_sdk/javascript-sdk.html
```

Page bodies, redirect targets, and later discovered URLs are not added at
execution time.

`staticInspectionMethod` has exactly three required, non-null string fields:

| Field | Constraint |
| --- | --- |
| `identifier` | `STRICT_UTF8_EXACT_LITERAL_SUBSTRING_V1` |
| `toolRuntimeName` | 1..64 printable ASCII characters; ordinary non-executing byte/string tool or runtime |
| `toolRuntimeVersion` | 1..64 printable ASCII characters |

Top-level `terminalOutcome` is exactly one of:

```text
EXECUTION_COMPLETED_AS_CONTRACTED
EXECUTION_STOPPED_BEFORE_ANY_PROVIDER_CONTACT
EXECUTION_INCOMPLETE_AFTER_CONTACT
EVIDENCE_INVALID_OR_INCOMPLETE
```

`stopReason` is exactly one of:

```text
NONE
LOCAL_PREFLIGHT_FAILED
LOCAL_SAFETY_INVARIANT_FAILED
EVIDENCE_ROOT_UNAVAILABLE
TRANSPORT_AMBIGUITY
CUSTODY_LOST
JAVASCRIPT_EXECUTION_RISK
REQUEST_CEILING_UNPROVABLE
STATIC_INSPECTION_METHOD_FAILED
REQUIRED_ASSET_EVIDENCE_MISSING
```

The exact stop-reason meanings are:

| Stop reason | Meaning |
| --- | --- |
| `NONE` | No global stop or evidence-invalidating failure occurred. |
| `LOCAL_PREFLIGHT_FAILED` | A required pre-contact proof failed without provider contact. |
| `LOCAL_SAFETY_INVARIANT_FAILED` | A frozen retry/redirect/TLS/timeout/body/no-execution control failed. |
| `EVIDENCE_ROOT_UNAVAILABLE` | The required external evidence root for SDK-asset exact-byte custody could not be initialized or proven writable before contact. |
| `TRANSPORT_AMBIGUITY` | Exact one-attempt contact/transport behavior could not be proven after contact may have begun. |
| `CUSTODY_LOST` | Per-asset SDK exact-byte custody creation or maintenance failed before `RESULT_V1_SEMANTIC_CUTOFF`. It never describes Result-v1 packaging or later Result custody. |
| `JAVASCRIPT_EXECUTION_RISK` | JavaScript executed or non-execution could no longer be proven. |
| `REQUEST_CEILING_UNPROVABLE` | The maximum of two provider contacts could no longer be proven. |
| `STATIC_INSPECTION_METHOD_FAILED` | The frozen strict-decode/literal method failed deterministically for required evidence. |
| `REQUIRED_ASSET_EVIDENCE_MISSING` | The bounded sequence ended without the complete admitted asset evidence required for adjudication. |

`warnings` records have exactly three required fields:

| Field | Type | Nullable | Exact constraint |
| --- | --- | --- | --- |
| `code` | string enum | no | vocabulary below |
| `assetOrdinal` | integer | yes | `1`, `2`, or `null` for a run-level warning |
| `detail` | string | yes | always `null` for every contract-defined warning |

Warning `code` uses exactly this contract order:

```text
REDIRECT_RESPONSE
REDIRECT_LOCATION_TRUNCATED
HEADER_VALUE_SANITIZED
CONTENT_LENGTH_INVALID
NON_2XX_RESPONSE
UNEXPECTED_CONTENT_TYPE
UNEXPECTED_CONTENT_ENCODING
BODY_OVERSIZE
BODY_INCOMPLETE
STATIC_INSPECTION_NOT_ADMITTED
STATIC_INSPECTION_METHOD_FAILED
TRANSPORT_AMBIGUITY
CUSTODY_FAILURE
EXECUTION_STOPPED
```

Warnings are mechanically derived, never discretionary. For each predicate
below, true requires exactly one matching warning and false prohibits it:

| Warning | Exact emission predicate |
| --- | --- |
| `REDIRECT_RESPONSE` | asset `httpStatus` is 300..399 |
| `REDIRECT_LOCATION_TRUNCATED` | a received 3xx Location exceeded 2,048 Unicode scalar values before deterministic truncation |
| `HEADER_VALUE_SANITIZED` | any retained Location/Content-Type/Content-Encoding/Content-Length value required at least one contract-defined control-character replacement or length truncation |
| `CONTENT_LENGTH_INVALID` | a Content-Length field was present but was not one valid non-negative base-10 integer |
| `NON_2XX_RESPONSE` | asset `httpStatus` is present and outside 200..299 |
| `UNEXPECTED_CONTENT_TYPE` | an HTTP response was received and Content-Type is missing, its media type is not allowed, its parameters are malformed, or charset admission fails |
| `UNEXPECTED_CONTENT_ENCODING` | an HTTP response was received and Content-Encoding is neither absent nor the single token `identity` |
| `BODY_OVERSIZE` | `bodyCustodyOutcome` is `HEADER_DECLARED_OVERSIZE_ABORTED` or `STREAM_OVERSIZE_ABORTED` |
| `BODY_INCOMPLETE` | `bodyCustodyOutcome == INCOMPLETE_BODY` |
| `STATIC_INSPECTION_NOT_ADMITTED` | an HTTP response was received and `staticInspectionOutcome == NOT_ADMITTED` |
| `STATIC_INSPECTION_METHOD_FAILED` | `staticInspectionOutcome == METHOD_FAILED` |
| `TRANSPORT_AMBIGUITY` | `terminalTransportOutcome == TRANSPORT_AMBIGUOUS` |
| `CUSTODY_FAILURE` | an asset has `bodyCustodyOutcome == CUSTODY_WRITE_FAILED`; `assetOrdinal` is that asset's ordinal and this warning is never emitted for Result-v1 packaging |
| `EXECUTION_STOPPED` | `terminalOutcome` is `EXECUTION_STOPPED_BEFORE_ANY_PROVIDER_CONTACT` or `EXECUTION_INCOMPLETE_AFTER_CONTACT`; this warning has `assetOrdinal: null` |

Every warning `detail` is exactly `null`; redirect Location remains only in its
dedicated bounded field. Warnings are sorted by `assetOrdinal` ascending with
`null` last, then by the code order above. Duplicate `(code, assetOrdinal)`
pairs are prohibited.

The following cross-field invariants are mandatory:

```text
assets.length == 2
assets[0] == exact ordinal-1 TEST_V2 target
assets[1] == exact ordinal-2 TEST_V1 target
comparisons.length == 1
requestCeiling == 2
actualProviderRequestCount
  == count(assets where contactMayHaveBegun == true)
0 <= actualProviderRequestCount <= 2

contactMayHaveBegun == false
  -> executed == false
     and startedAt == null
     and attemptState is AUTHORIZED_NOT_ATTEMPTED
       or LOCAL_PREFLIGHT_FAILED_NO_CONTACT

contactMayHaveBegun == true
  -> executed == true
     and startedAt != null
     and completedAt != null

attemptState == AUTHORIZED_NOT_ATTEMPTED
  -> completedAt == null

attemptState == LOCAL_PREFLIGHT_FAILED_NO_CONTACT
  -> completedAt != null

attemptState == TRANSPORT_AMBIGUOUS
  -> contactMayHaveBegun == true
     and terminalTransportOutcome == TRANSPORT_AMBIGUOUS

attemptState == HTTP_RESPONSE_RECEIVED
  <-> terminalTransportOutcome == HTTP_RESPONSE_RECEIVED
      and httpStatus != null
      and contactMayHaveBegun == true
      and startedAt != null
      and completedAt != null

bodyCustodyOutcome == COMPLETE_BODY_RETAINED
  if and only if bodyComplete == true
  and retrievedAtUtc != null
  and retainedBodyByteCount != null
  and sha256 != null
  and custodyFilename != null

bodyCustodyOutcome != COMPLETE_BODY_RETAINED
  if and only if bodyComplete == false
  and retrievedAtUtc == null
  and retainedBodyByteCount == null
  and sha256 == null
  and custodyFilename == null

staticInspectionAdmitted == true
  -> bodyComplete == true
     and httpStatus is 2xx
     and Content-Encoding is absent or identity
     and Content-Type/charset are admitted
     and strictUtf8DecodeSucceeded == true

staticInspectionAdmitted == false
  <-> staticInspectionOutcome == NOT_ADMITTED
      and every observation status == UNRESOLVED_BY_STATIC_INSPECTION

staticInspectionOutcome == COMPLETED
  -> staticInspectionAdmitted == true
     and every observation status is OBSERVED_STATIC or NOT_OBSERVED_STATIC

staticInspectionOutcome == METHOD_FAILED
  -> staticInspectionAdmitted == true
     and every observation status == UNRESOLVED_BY_STATIC_INSPECTION
     and no fallback inspection method was used

comparison.byteIdentical == true
  -> comparisonEligible == true
     and byteCountEqual == true
     and sha256Equal == true
     and both complete custody files were directly compared

comparisonEligible == false
  -> byteCountEqual == null
     and sha256Equal == null
     and byteIdentical == null
```

Comparison and observation fields never invent facts from one-sided evidence.
For terminal classification, `allAuthorizedProcessingTerminal` means both
ordered assets consumed their ordinals (`contactMayHaveBegun == true`), each
has non-null `completedAt`, and all required per-asset classification
dimensions were populated. A local failure that prevents an ordinal's contact
therefore does not count as completed authorized processing.
`semanticEvidenceValid` means:

```text
allAuthorizedProcessingTerminal == true
both bodyCustodyOutcome == COMPLETE_BODY_RETAINED
both staticInspectionOutcome == COMPLETED
comparisonEligible == true
all byte-comparison fields are non-null and coherent
all three observation-comparison fields are resolved
```

`semanticEvidenceValid` is deliberately independent of whether Result-v1 can
later be written, archived, verified, retained, or admitted as a package.

Top-level `terminalOutcome` is selected by the first matching mutually
exclusive predicate:

1. execution terminated with `actualProviderRequestCount == 0` before all
   authorized processing -> `EXECUTION_STOPPED_BEFORE_ANY_PROVIDER_CONTACT`;
2. execution terminated after one or more contacts but
   `allAuthorizedProcessingTerminal == false` ->
   `EXECUTION_INCOMPLETE_AFTER_CONTACT`;
3. `allAuthorizedProcessingTerminal == true` but
   `semanticEvidenceValid == false` ->
   `EVIDENCE_INVALID_OR_INCOMPLETE`;
4. `semanticEvidenceValid == true` ->
   `EXECUTION_COMPLETED_AS_CONTRACTED`.

Accordingly, two complete HTTP 404 responses classify as
`EVIDENCE_INVALID_OR_INCOMPLETE / REQUIRED_ASSET_EVIDENCE_MISSING`, never
`EXECUTION_COMPLETED_AS_CONTRACTED / NONE`.

After `terminalOutcome` is fixed, exactly one `stopReason` is selected by the
first matching fact in this order:

1. JavaScript executed or non-execution became unprovable ->
   `JAVASCRIPT_EXECUTION_RISK`;
2. the two-contact ceiling became unprovable ->
   `REQUEST_CEILING_UNPROVABLE`;
3. per-asset SDK custody creation or maintenance failed before the semantic
   cutoff -> `CUSTODY_LOST`;
4. transport/contact behavior is ambiguous -> `TRANSPORT_AMBIGUITY`;
5. another frozen local safety invariant failed ->
   `LOCAL_SAFETY_INVARIANT_FAILED`;
6. the evidence root was unavailable before contact ->
   `EVIDENCE_ROOT_UNAVAILABLE`;
7. another required preflight failed before contact ->
   `LOCAL_PREFLIGHT_FAILED`;
8. either asset has `staticInspectionOutcome == METHOD_FAILED` ->
   `STATIC_INSPECTION_METHOD_FAILED`;
9. required admitted/completed asset evidence or resolved comparison evidence
    is missing -> `REQUIRED_ASSET_EVIDENCE_MISSING`;
10. `semanticEvidenceValid == true` -> `NONE`.

Secondary anomalies remain mandatory warnings and never compete for the single
decisive stop reason. `NONE` is valid only with
`EXECUTION_COMPLETED_AS_CONTRACTED`.

The Result-v1 determinism criterion is:

```text
same authorized two-asset inventory
+ same transport / HTTP / body / SDK-asset custody / admission / static-method facts
-> same Result-v1 field structure
   same enum states
   same nullability
   same warnings and warning order
   same terminalOutcome
   same stopReason
```

Result-v1 packaging outcomes are not inputs to this criterion. Once the same
semantic facts have produced one Result-v1 byte sequence, every original and
archive write must derive from that exact sequence and no later fact may alter
it.

Provider bytes and evidence timestamps naturally remain observed run facts and
need not equal another run; their structural representation and classification
must follow the same rules above without executor judgment.

Result-v1 contains no credential, cookie, raw browser state, arbitrary header,
unbounded body text, evidence snippet, or executed-JavaScript output.

### PackageIntegrity-v1 exact schema and invariants

PackageIntegrity-v1 is the separate deterministic external evidence-package
record. It contains no provider response, SDK source observation, comparison
semantics, semantic warning, `terminalOutcome`, or `stopReason`. Its JSON object
has exactly the following fields in the listed serialization order. Every field
is required; no additional top-level or nested field is allowed.

| Field | Type | Nullable | Exact constraint |
| --- | --- | --- | --- |
| `schema` | string | no | `mira.eximbay.bf3-static-sdk-package-integrity` |
| `version` | integer | no | `1` |
| `runId` | string | no | predeclared attempted-run ID matching `^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$`; equals Result-v1 `runId` when Result-v1 exists |
| `contractIdentity` | string | no | `EXIMBAY-BF3-STATIC-JAVASCRIPT-SDK-EVIDENCE-CONTRACT-v0.1` |
| `resultV1BytesCreated` | boolean | no | whether one valid immutable Result-v1 byte sequence was created |
| `resultV1ByteCount` | integer | yes | `1..9007199254740991` for the immutable sequence; non-null exactly when `resultV1BytesCreated` is true |
| `resultV1Sha256` | lowercase hex string | yes | 64-character SHA-256 of the immutable sequence; non-null exactly when `resultV1BytesCreated` is true |
| `resultOriginalFilename` | string | no | `eximbay-bf3-static-sdk-result-v1-<runId>.json` |
| `resultOriginalWriteOutcome` | string enum | no | exact write vocabulary below |
| `resultOriginalVerificationOutcome` | string enum | no | exact verification vocabulary below |
| `resultOriginalObservedByteCount` | integer | yes | `0..9007199254740991` from the complete verification read, or `null` when no complete read succeeded |
| `resultOriginalSha256` | lowercase hex string | yes | 64-character hash from the same complete verification read, or `null` |
| `archiveFilename` | string | no | `eximbay-bf3-static-sdk-result-v1-<runId>.json` under `archive/` |
| `archiveWriteOutcome` | string enum | no | exact write vocabulary below |
| `archiveVerificationOutcome` | string enum | no | exact verification vocabulary below |
| `archiveObservedByteCount` | integer | yes | `0..9007199254740991` from the complete verification read, or `null` when no complete read succeeded |
| `archiveSha256` | lowercase hex string | yes | 64-character hash from the same complete verification read, or `null` |
| `originalArchiveEquality` | string enum | no | exact equality vocabulary below |
| `packageIntegrityOutcome` | string enum | no | exact total outcome vocabulary below |
| `packageIntegrityReason` | string enum | no | exact reason paired with the outcome below |
| `completedAt` | RFC 3339 UTC string | no | packaging-finalization instant, after every represented package fact is terminal and before PackageIntegrity-v1 canonicalization |

Write outcomes use exactly:

```text
NOT_ATTEMPTED
WRITE_SUCCEEDED
WRITE_FAILED
```

Verification outcomes use exactly:

```text
NOT_ATTEMPTED
VERIFIED_EQUAL_TO_RESULT_V1_BYTES
VERIFICATION_FAILED
```

`VERIFIED_EQUAL_TO_RESULT_V1_BYTES` requires a complete regular-file read whose
byte count, SHA-256, and direct byte comparison all equal the one immutable
Result-v1 byte sequence. `VERIFICATION_FAILED` means the required regular-file
read could not complete or at least one of those three comparisons failed. A
successful complete read always populates the corresponding observed count and
hash together, including when comparison fails; an incomplete or impossible
read leaves both null.

Original/archive equality uses exactly:

```text
NOT_APPLICABLE
EQUAL
MISMATCH
```

It is `EQUAL` or `MISMATCH` only when complete reads of both Result files are
available and direct byte comparison of those exact observed sequences was
performed. Otherwise it is `NOT_APPLICABLE`. Hash equality alone does not
replace direct comparison.

Package-integrity outcomes use exactly:

```text
PACKAGE_VALID
RESULT_V1_NOT_CREATED
RESULT_ORIGINAL_WRITE_FAILED
RESULT_ORIGINAL_VERIFICATION_FAILED
ARCHIVE_WRITE_FAILED
ARCHIVE_VERIFICATION_FAILED
ORIGINAL_ARCHIVE_MISMATCH
```

Package-integrity reasons use exactly:

```text
NONE
RESULT_V1_CONSTRUCTION_VALIDATION_CANONICALIZATION_OR_SERIALIZATION_FAILED
RESULT_ORIGINAL_WRITE_DID_NOT_SUCCEED
RESULT_ORIGINAL_DID_NOT_VERIFY_AGAINST_IMMUTABLE_BYTES
RESULT_ARCHIVE_WRITE_DID_NOT_SUCCEED
RESULT_ARCHIVE_DID_NOT_VERIFY_AGAINST_IMMUTABLE_BYTES
RESULT_ORIGINAL_AND_ARCHIVE_BYTES_DIFFER
```

The outcome/reason pairs are one-to-one in the same order as those two lists:
`PACKAGE_VALID / NONE`, then each failure outcome with its corresponding
failure reason. No other pairing is valid.

The following cross-field invariants are mandatory:

```text
resultV1BytesCreated == false
  -> resultV1ByteCount == null
     and resultV1Sha256 == null
     and both write outcomes == NOT_ATTEMPTED
     and both verification outcomes == NOT_ATTEMPTED
     and all four observed count/hash fields == null
     and originalArchiveEquality == NOT_APPLICABLE

resultV1BytesCreated == true
  -> resultV1ByteCount > 0
     and resultV1Sha256 != null
     and resultOriginalWriteOutcome != NOT_ATTEMPTED

either write outcome != WRITE_SUCCEEDED
  -> its verification outcome == NOT_ATTEMPTED
     and its observed count/hash fields == null

either write outcome == WRITE_SUCCEEDED
  -> its verification outcome is VERIFIED_EQUAL_TO_RESULT_V1_BYTES
     or VERIFICATION_FAILED

each observed count/hash pair is either both null or both non-null

either verification outcome == VERIFIED_EQUAL_TO_RESULT_V1_BYTES
  -> its observed count/hash equal resultV1ByteCount/resultV1Sha256
     and direct byte comparison to the immutable Result-v1 sequence succeeded

either verification outcome == VERIFICATION_FAILED
  -> its write outcome == WRITE_SUCCEEDED
     and a required complete read or count/hash/direct-byte comparison failed

resultOriginalWriteOutcome != WRITE_SUCCEEDED
  -> archiveWriteOutcome == NOT_ATTEMPTED

resultOriginalWriteOutcome == WRITE_SUCCEEDED
  -> archiveWriteOutcome is WRITE_SUCCEEDED or WRITE_FAILED

archiveWriteOutcome != WRITE_SUCCEEDED
  -> originalArchiveEquality == NOT_APPLICABLE

originalArchiveEquality == MISMATCH
  -> both writes == WRITE_SUCCEEDED
     and both complete verification reads produced observed count/hash values
     and at least one verification outcome == VERIFICATION_FAILED

originalArchiveEquality == EQUAL
  -> both writes == WRITE_SUCCEEDED
     and both complete verification reads produced observed count/hash values

both verification outcomes == VERIFIED_EQUAL_TO_RESULT_V1_BYTES
  -> originalArchiveEquality == EQUAL
```

Exactly one `packageIntegrityOutcome` is selected by the first matching
predicate in this precedence order:

1. `resultV1BytesCreated == false` -> `RESULT_V1_NOT_CREATED`;
2. `resultOriginalWriteOutcome != WRITE_SUCCEEDED` ->
   `RESULT_ORIGINAL_WRITE_FAILED`;
3. `archiveWriteOutcome != WRITE_SUCCEEDED` -> `ARCHIVE_WRITE_FAILED`;
4. `originalArchiveEquality == MISMATCH` -> `ORIGINAL_ARCHIVE_MISMATCH`;
5. `resultOriginalVerificationOutcome != VERIFIED_EQUAL_TO_RESULT_V1_BYTES` ->
   `RESULT_ORIGINAL_VERIFICATION_FAILED`;
6. `archiveVerificationOutcome != VERIFIED_EQUAL_TO_RESULT_V1_BYTES` ->
   `ARCHIVE_VERIFICATION_FAILED`;
7. both verifications succeeded and `originalArchiveEquality == EQUAL` ->
   `PACKAGE_VALID`.

These predicates are total under the cross-field invariants and mutually
exclusive by precedence. The selected reason is the one-to-one reason paired
with the selected outcome. Thus the same immutable Result-v1 bytes and the same
packaging facts always produce one field structure, one null pattern, and one
PackageIntegrity-v1 outcome.

Semantic/evidence validity and package validity are independent dimensions:

| Case | Result-v1 | PackageIntegrity-v1 |
| --- | --- | --- |
| Semantic evidence valid; all package writes and checks valid | unchanged `EXECUTION_COMPLETED_AS_CONTRACTED / NONE` | `PACKAGE_VALID` |
| Semantic evidence valid; archive write fails | unchanged semantic Result | `ARCHIVE_WRITE_FAILED` |
| Both SDK assets are complete 404 responses; package valid | `EVIDENCE_INVALID_OR_INCOMPLETE / REQUIRED_ASSET_EVIDENCE_MISSING` | `PACKAGE_VALID` |
| Result-v1 bytes cannot be created | no valid Result-v1 | `RESULT_V1_NOT_CREATED` |
| Result original write or verification fails | already-frozen semantic facts are not rewritten; trusted retained Result is not established | corresponding original failure outcome |
| Both Result files exist but differ | unchanged semantic byte sequence | `ORIGINAL_ARCHIVE_MISMATCH` |

Decision-grade later BF3 adjudication requires both a parseable Result-v1 that
satisfies its semantic schema/invariants and sufficient PackageIntegrity-v1
evidence: a parseable schema-valid record for the same run and contract with
`packageIntegrityOutcome == PACKAGE_VALID`, plus the bound Result files needed
to confirm its counts, hashes, and equality. A package failure makes the
package inadmissible but never changes Result-v1 warnings, `terminalOutcome`,
`stopReason`, `completedAt`, or bytes. A schema-valid semantic Result may itself
record invalid/incomplete SDK evidence, as in the two-404 case, while its
package remains valid.

PackageIntegrity-v1 does not archive, verify, hash, compare, or report on
itself. Its `completedAt` is the packaging-finalization time and is always later
than the Result-v1 semantic `completedAt` when Result-v1 bytes exist. After its
facts are terminal, construct the exact object above, canonicalize once,
serialize once, and write once. Its own write failure or later loss cannot be
encoded recursively; later adjudication observes absence, corruption, or
unparseability directly and denies decision-grade admission.

## 22. Execution state machine

```text
reviewed contract merge + separate explicit BF3 execution task
  -> resolve merged contract authority
  -> validate exact fixed URL allowlist
  -> prove retry/redirect/cookie/auth/execution prohibitions
  -> run and pass the local BF3_CANONICAL_JSON_UTF8_V1 preflight
  -> initialize external SDK-asset custody and predeclare package paths
  -> Request 1: TEST V2, at most once
  -> Request 2: TEST V1, at most once
  -> finalize exact SDK-asset byte custody and hashes
  -> perform bounded offline/static inspection only
  -> derive semantic warnings, terminalOutcome, stopReason, and completedAt
  -> RESULT_V1_SEMANTIC_CUTOFF
  -> construct and validate Result-v1 semantic object
  -> canonicalize once and serialize once to immutable Result-v1 bytes
  -> write original and archive from that one byte sequence
  -> verify package facts and finalize PackageIntegrity-v1 once
  -> independent package admission and semantic adjudication
  -> only then determine the next gate
```

If valid immutable Result-v1 bytes cannot be created, the Result branch ends
with no Result-v1; the executor finalizes PackageIntegrity-v1 as
`RESULT_V1_NOT_CREATED`. Original/archive write, verification, mismatch, or
later custody outcomes never loop back across `RESULT_V1_SEMANTIC_CUTOFF`.

No step invokes JavaScript, loads a browser, calls `/ready`, or fills unused
request authority with another URL.

Attempt accounting and continuation are deterministic:

```text
no contact proven:
  ordinal not consumed

contact may have begun, HTTP response received, or transport ambiguous:
  ordinal consumed

retry, confirmation repeat, HEAD, redirect following, target substitution:
  prohibited
```

A local preflight failure, evidence-root failure, local safety-invariant
failure, `TRANSPORT_AMBIGUOUS`, `CUSTODY_WRITE_FAILED`, SDK-asset custody loss,
JavaScript-execution risk, or inability to prove the two-request ceiling stops
the whole execution. Ordinal 2 remains `AUTHORIZED_NOT_ATTEMPTED` if it was
not reached.

The following bounded transport outcomes consume the current ordinal but allow
the next already-authorized ordinal while all safety and custody controls
remain proven: `HTTP_RESPONSE_RECEIVED`, `TLS_OR_CERTIFICATE_FAILURE`,
`CONNECT_TIMEOUT`, `TOTAL_TIMEOUT`, and `CONNECTION_FAILURE`. Within an HTTP
response, `HEADER_DECLARED_OVERSIZE_ABORTED`, `STREAM_OVERSIZE_ABORTED`, or
`INCOMPLETE_BODY` also permits the next ordinal when temporary bytes were
discarded and custody/safety remained proven.

Non-2xx status, redirect status, unexpected media type/charset, non-identity
encoding, strict UTF-8 failure, and `staticInspectionOutcome` of
`NOT_ADMITTED` do not trigger a retry and do not stop the next authorized
ordinal. A post-admission `METHOD_FAILED` uses no fallback and triggers no
provider retry; static inspection occurs after the fixed network sequence, so
it cannot create or suppress a provider contact. Either admission failure or
method failure on either asset leaves the required two-asset observation
comparison unresolved and therefore makes the final result
`EVIDENCE_INVALID_OR_INCOMPLETE`. No condition increases the ceiling or
creates a third ordinal.

## 23. Result/adjudication separation

The mandatory lifecycle is:

```text
Contract candidate
  -> focused canonical Result-v1 byte-determinism closure review
  -> reviewed contract merge
  -> separate explicit BF3 execution
  -> immutable semantic Result-v1 plus external PackageIntegrity-v1
  -> independent package admission and semantic adjudication
  -> only then a possible EX2B2 design contract
```

Contract authoring, provider execution, result adjudication, and EX2B2 design
must not be combined. BF3 is not complete merely because this candidate exists
or because a later download succeeds.

## 24. Threat and failure model

| Threat or failure | Required disposition |
| --- | --- |
| SDK asset is executed while collecting evidence | Prohibit every execution mechanism; inspect only inert custody-bound bytes. |
| Redirect escapes the exact candidate | Record bounded Location, never follow, consume the attempt. |
| Automatic retry exceeds contact ceiling | Use a client with retries disabled and count contact immediately before the contact-capable operation. |
| Oversized or compressed response exhausts resources | Request identity encoding; enforce Content-Length and streaming 262,144-byte ceilings; never decode non-identity content. |
| Reachable obsolete asset is called canonical | Apply the bounded Section 15 adjudication rule; reachability alone is insufficient. |
| v2 SDK is conflated with v2 REST | Keep SDK and REST axes independent. |
| An unestablished production path is probed | Production paths are absent from the allowlist, request ordinals, custody filenames, and Result-v1 inventory. |
| Static minification hides behavior | Use `UNRESOLVED_BY_STATIC_INSPECTION`; never infer absence from missing trivial strings. |
| SDK bytes enter the repository | External custody only; repository adjudication stores hashes/counts, not bytes. |
| Published production base origin implies live merchant ability | Preserve the production boundary in Section 18; no production SDK path is probed. |
| `request_pay()` crosses into payment-page behavior | Invocation remains prohibited regardless of static implementation detail. |
| Evidence exists only in terminal output | Freeze one semantic Result-v1 byte sequence and bind its package facts in separate non-recursive PackageIntegrity-v1 evidence. |

## 25. Stop conditions

Stop before the first asset request if:

- the reviewed merged contract cannot be identified byte-exactly;
- the exact URL allowlist differs from Section 7;
- retry, redirect, cookie, Authorization, TLS, timeout, body ceiling, or
  no-execution properties cannot be proven;
- the external evidence root is inside the repository or is not writable;
- a tool would log browser state, cookies, request headers, or full response
  bodies; or
- the task asks for an SDK load, `/ready`, `request_pay()`, payment page,
  credential, callback, source change, production SDK probe, or third provider
  request.

After contact begins, stop every later request if evidence custody is lost, a
client invariant is violated, JavaScript may have executed, or the ceiling can
no longer be proven. Preserve only allowed bounded evidence and do not perform
a cleanup, cancellation, verification, or compensating provider call.

## 26. Verification for this documentation candidate

This authoring task requires only:

```text
all local Markdown links resolve
git diff --check passes
changed paths are limited to this contract, engineering README, and decision log
no source/schema/migration/test/route/config/dependency change
no SDK asset request or execution
no /ready or request_pay invocation
no stage, commit, push, PR, or merge
```

`npm run verify`, Prisma commands, browser tests, application runtime tests,
and SDK-asset downloads are neither necessary nor authorized for this
documentation-only candidate.

## 27. Rollback, recovery, and change control

Before acceptance, rollback is removal of this candidate and its two minimal
documentation pointers. After reviewed merge, any semantic change to candidate
URLs, request ceiling, network limits, execution prohibition, custody, static
inspection, canonicality adjudication rule, dispositions, or next-gate authority
requires a new version, explicit supersession, independent review, and a
decision-log entry.

A later BF3 execution creates only external public-static evidence. Recovery is
to stop, retain allowed finalized evidence, and make no downstream provider
call. There is no payment, customer, database, credential, or merchant state to
cancel or repair under a conformant execution.

## 28. Unsupported-authority self-audit

Before this candidate is handed off, confirm all are false:

```text
accidental SDK execution authority
accidental request_pay authority
accidental /ready authority
credential usage
payment-page invocation
callback design leakage
production merchant claims
version-number inference
REST/SDK version conflation
asset-reachability-as-canonicality overclaim
unsupported production exact-path claim
production SDK probing
more than two later provider requests
automatic retry or redirect ambiguity
unbounded response reading or decompression
provider SDK bytes committed to repository
EX2B2 implementation leakage
```

## Verdict

```text
BF3 STATIC JAVASCRIPT SDK EVIDENCE CONTRACT v0.1
CANDIDATE — READY FOR ONE FINAL FOCUSED CANONICAL-BYTE CLOSURE REVIEW

BF3-CLR-003:
  CLOSED

BF3-CLR-002:
  CORRECTED — PENDING FINAL FOCUSED CLOSURE

BF3-AUD-004:
  CORRECTED — PENDING FINAL FOCUSED CLOSURE

BF3 PROVIDER EXECUTION:
  NOT AUTHORIZED

BF3 SDK CANONICAL VERSION:
  UNRESOLVED

EX2B2:
  NOT AUTHORIZED
```
