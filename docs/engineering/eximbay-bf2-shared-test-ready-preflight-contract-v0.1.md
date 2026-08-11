# Eximbay BF2 Shared-Test `/ready` Preflight — Provider Evidence / Execution Contract v0.1

## Status

```text
DOCUMENT CLASS:
  PROVIDER EVIDENCE / EXECUTION CONTRACT

RISK CLASS:
  HIGH — EXTERNAL PAYMENT-PROVIDER CONTACT

TASK CLASSIFICATION:
  EVIDENCE_COLLECTION

CURRENT TASK-LEVEL AUTHORIZATION:
  DOCUMENTATION ONLY

CURRENT STATUS:
  CANDIDATE v0.1 — INDEPENDENT EVIDENCE/CONTRACT REVIEW REQUIRED

PRE-MERGE PROVIDER AUTHORITY:
  NONE

POST-REVIEWED-MERGE NEXT AUTHORITY:
  ONE SEPARATELY INVOKED BF2 EXECUTION TASK UNDER THIS EXACT CONTRACT

EXIMBAY PRODUCT/RUNTIME ACTIVATION:
  NONE
```

This candidate does not authorize an Eximbay request merely by existing in a
working tree or branch. Only its reviewed merge, followed by a separate
explicit BF2 execution task, may grant the bounded provider contact in this
contract.

## 1. Purpose and governing question

BF2 is the first bounded provider-contact experiment after EX2A. It may collect
shared-test evidence only for:

- validity of the currently published public test credential pair;
- reachability of the public test `/ready` endpoint;
- the documented baseline `/ready` request;
- acceptance or rejection of exact BF2 synthetic lowercase CUID1-like
  representative order IDs;
- `P000` plus canonical USD preparation;
- `P000` plus canonical JPY preparation when the adaptive gate permits it;
- FGKey generation; and
- actual HTTP, JSON, and provider-error behavior of the exact attempted
  requests.

BF2 does not establish a general or production Eximbay `order_id` grammar,
Mira merchant-account capability, SDK compatibility, payment-page availability,
payment success, authorization, capture, 3DS behavior, callback transport,
verification, completion, inquiry, refund, void, reconciliation, routing, or
live authority.

## 2. Governing repository authority and precedence

This contract is subordinate to:

1. [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md).
2. [EX2A Pure Protocol Kernel Design / Implementation Contract v0.1](./eximbay-ex2a-pure-protocol-kernel-design-contract-v0.1.md).
3. [EX2A Pure Protocol Kernel Source Status / As-Built v0.1](./eximbay-ex2a-pure-protocol-kernel-source-status-v0.1.md).
4. Current repository source, schema, and dependency lock at execution time.
5. Current official Eximbay documentation under `developer.eximbay.com` for
   provider protocol facts.

EX2A is installed, reviewed, network-free, runtime-disabled, and
routing-disabled. It has no credentials, HTTP adapter, SDK, public status
route, persistence, payment completion, refund, void, or reconciliation
runtime. BF2 changes none of those source facts.

If repository authority and current official provider evidence conflict, the
execution must stop before contact and return for adjudication. Historical
official PDFs may be retained only as conflict or history evidence and do not
override current official pages.

## 3. Baseline and prior reconnaissance disposition

The authoring baseline is:

```text
repository:
  /Users/duckcow/workspace/mira

main HEAD / origin/main:
  4739fcff225ccbed1764a8ea1a6551a81a487c04

authoring branch:
  docs/eximbay-bf2-ready-preflight-contract

authoring worktree at gate:
  clean
```

The immediately preceding BF0 provider-evidence reconnaissance is an evidence
input, not governing authority. Its disposition was:

```text
PROVIDER-EVIDENCE RECON COMPLETE —
BOUNDED PROVIDER TEST MUST PRECEDE EX2B

recommended first contact:
  PUBLIC TEST /ready PREFLIGHT
```

The official-source review in Section 4 independently supports that narrow
choice. No BF0 claim survives if later current official evidence contradicts
it.

## 4. Official-source evidence lock

Retrieval date: **2026-08-11**.

Only the following current official Eximbay pages are provider-protocol
authority for BF2:

| Frozen fact | Current official source and bounded reading |
| --- | --- |
| `/ready` endpoint and request/response | [API reference — Payment preparation](https://developer.eximbay.com/eng/eximbay/api_list/reference.html): `POST /v1/payments/ready`; `transaction_type=PAYMENT`; the documented request includes merchant, buyer, return/status URL facts; success example returns `rescode`, `resmsg`, and `fgkey`. |
| Test environment, published test MID/API key, authentication, and no real deduction | [Preparing payment](https://developer.eximbay.com/eng/eximbay/payment_linkage/preparing-payment.html): public test merchant information is published; test origin is `https://api-test.eximbay.com`; Basic is Base64 of `API-key:` with no password; test-key payments do not deduct funds. The raw API key is deliberately not reproduced here. |
| `order_id` semantics | [API reference — `/ready` request parameters](https://developer.eximbay.com/eng/eximbay/api_list/reference.html): mandatory merchant-order identifier, unique, and not reusable for failed orders. The current `/ready` field description publishes no complete length or character-set grammar. |
| P000 | [Institution codes — overseas payment methods](https://developer.eximbay.com/eng/eximbay/api_sdk/code-organization.html): `P000` is the overseas Credit Card protocol code. |
| Currency minor units | [Miscellaneous codes — currency code](https://developer.eximbay.com/eng/eximbay/api_sdk/code-etc.html): USD minor unit is 2 and JPY minor unit is 0. |
| SDK conflict | [Integrated payment](https://developer.eximbay.com/eng/eximbay/payment_linkage/windows-consolidation.html) currently shows a v2 SDK URL in preparation and a v1 URL in payment-page initiation, while [JavaScript SDK](https://developer.eximbay.com/eng/eximbay/api_sdk/javascript-sdk.html) shows v2. BF2 preserves the version conflict as unresolved and loads neither. |

The 30-character `order_id` maximum shown in reconciliation response models is
not imported into `/ready`: it is a different documented context. The absence
of a current `/ready` length or charset statement is recorded as an unresolved
evidence gap, not converted into permission or a guessed grammar.

The current `/ready` example's USD amount text `"1"` and bare
`eximbay.com` URL strings are example evidence only. BF2 does not adopt either
as its intended amount representation or inert-placeholder safety policy.

At execution time, all six pages above must be freshly retrieved. If the
endpoint, test origin, public credential availability, Basic construction,
no-fund statement, required fields, order-reuse rule, P000 meaning, or USD/JPY
minor units materially changed, stop before contact:

```text
STOP — BF2 OFFICIAL EVIDENCE DRIFT
```

## 5. Critical order-ID interpretation boundary

```text
BF2 acceptance of one or more representative order_id values
does NOT prove the complete Eximbay order_id grammar.
```

A successful result means only that the exact tested representation family was
observed accepted by the public shared-test `/ready` endpoint under the exact
tested facts. Rejection is likewise evidence only for the exact request.

BF2 cannot automatically authorize:

```text
Payment.id -> final Eximbay wire order_id
```

That mapping requires separate post-BF2 adjudication and a repository decision.
Formal grammar confirmation from Eximbay may still be required. No inference
about untested length, case, punctuation, prefix, whitespace, Unicode, or
collision behavior is allowed.

## 6. External authority ceiling

Only a separately invoked BF2 execution task after reviewed merge may use:

```text
environment:
  EXIMBAY PUBLIC SHARED TEST ONLY

host:
  https://api-test.eximbay.com

endpoint:
  POST /v1/payments/ready

transaction_type:
  PAYMENT

credential class:
  PUBLIC_SHARED_TEST

maximum provider requests:
  3

execution:
  STRICTLY SEQUENTIAL AND ADAPTIVE
```

No other host, endpoint, transaction type, credential class, or provider call
is authorized.

## 7. Explicit request and runtime prohibitions

BF2 must never call:

```text
/v1/payments/verify
/v1/payments/retrieve
/v1/payments/*/cancel
/v1/payments/*/capture
/v1/payments/confirm
any token endpoint
any recurring endpoint
any production endpoint
```

It must never load `javascriptSDK.js`, invoke `EXIMBAY.request_pay()`, open a
payment page, submit card details, complete a payment, create a return or
callback receiver, perform a refund/void, or contact a Mira/customer database.

## 8. Credential handling

At execution time, obtain the then-current public shared-test MID and API key
from [Preparing payment](https://developer.eximbay.com/eng/eximbay/payment_linkage/preparing-payment.html).
Do not use a value copied from this contract, a prior log, or an earlier task.

The raw API key, its `API-key:` form, and its Base64 Basic representation may
exist only in process memory for the bounded execution. They must not enter a
repository file, `.env` file, command transcript, shell history, process output,
request evidence, exception, Authorization-header log, clipboard artifact, or
final report. The Authorization header must never be printed. The public MID
may be used in the request but should be recorded only as credential class,
not copied into the durable evidence record.

Although publicly documented, both values are credential-shaped material. Any
tool or wrapper that would echo headers, verbose traffic, process arguments, or
environment contents is prohibited.

## 9. Network discipline and attempt accounting

The execution ceiling is three total provider-contact attempts, all to
`POST /v1/payments/ready`.

- Use HTTPS only with TLS certificate verification enabled and a minimum TLS
  version of 1.2. Insecure certificate or TLS modes are prohibited.
- Send exactly `POST` with `Content-Type: application/json`.
- Execute requests strictly sequentially.
- Disable all automatic HTTP retries.
- Disable automatic redirect following; any 3xx is recorded as the response
  and is not followed.
- Use a 5-second connection timeout and a 15-second total-request timeout.
- Enforce a maximum provider-response size of 65,536 bytes while reading, not
  after an unbounded body has already been buffered.
- Do not repeat a request to confirm a result.
- Do not reuse any order ID after success, provider rejection, HTTP error,
  timeout, connection reset, or any ambiguous transport outcome.
- Every attempt for which provider contact may have begun consumes one request
  ordinal and its order ID, even if no HTTP response arrives.
- A locally detected serialization or preflight failure consumes no provider
  request only when the executor can prove that no network contact began. It
  must be corrected before Request 1 or reported as a local block; it cannot be
  used to enlarge the three-request ceiling.

The selected client must expose or otherwise prove that retry middleware is
disabled. `curl -k`, insecure TLS flags, `set -x`, shell xtrace, `curl -v`,
`curl --trace`, and HTTP debug logging that can emit Authorization or raw
response material are prohibited. If these properties cannot be established,
stop before provider contact.

## 10. Common request facts

All requests use JSON and keep unrelated variables aligned with the current
official example:

```text
payment.transaction_type:
  PAYMENT

payment.lang:
  EN

merchant.mid:
  then-current public shared-test MID

buyer.name:
  eximbay

buyer.email:
  test@eximbay.com

url.return_url:
  https://mira-bf2.invalid/return

url.status_url:
  https://mira-bf2.invalid/status
```

The buyer value is a documented test/example identity. The URL values are
synthetic BF2-only placeholders: non-customer, non-production,
non-Mira-runtime, non-localhost, non-private-network, non-link-local,
non-cloud-metadata, and non-credential-bearing. No listener is deployed at
either target. BF2 does not assume that Eximbay never resolves, validates,
parses, or otherwise handles a submitted URL, and the placeholders must remain
safe if provider-side URL processing exists.

No real customer, catalog, order, checkout, or payment identity may appear.
BF2 must not infer callback behavior from `/ready` accepting either value. If
Request 1 explicitly rejects either placeholder, stop without substitution:

```text
STOP — BF2 BASELINE URL COMPATIBILITY UNRESOLVED
```

Do not substitute a Mira endpoint, localhost, tunnel, provider URL, or other
third-party domain during execution. A new evidence/design decision is
required.

Do not add product, tax, shipping, billing, settings, fast-payment, token,
recurring, DCC, or arbitrary `other_param` facts.

## 11. Fresh order-identity preflight

Every request uses a never-before-used ID. The executor must maintain an
in-memory set for the three planned identities and reject duplicates before
contact. The IDs are discarded from operational use after execution and must
never be retried.

Request 1 uses a fresh synthetic 14-digit UTC `YYYYMMDDHHmmss` value generated
immediately before its request body is finalized. It follows the numeric
example family visible in current official documentation but is not provider
grammar, a required/minimum/maximum length, or a production naming policy. It
must not equal a published example or any other BF2 planned/tested identity.

Requests 2 and 3 use fresh
`SYNTHETIC_LOWERCASE_CUID1_LIKE_REPRESENTATIVE` values. Current repository
evidence is the Payment declaration `id String @id @default(cuid())` in
`prisma/schema.prisma`, with Prisma 7.8.0 selected by the lockfile. Current
Prisma documentation states that `cuid()` is generated by Prisma ORM and its
output length is not a fixed general guarantee ([Prisma Schema API —
`cuid()`](https://www.prisma.io/docs/orm/reference/prisma-schema-reference#cuid)).
BF2 therefore deliberately does not describe its standalone values as
Prisma-generated, database Payment IDs, or proof of the complete Prisma CUID
grammar.

The synthetic policy identity is
`bf2-synthetic-lowercase-cuid1-like/v1`. Its exact construction is:

```text
selected length:
  25 ASCII characters

shape:
  literal lowercase c + 24 lowercase base-36 characters

allowed alphabet after c:
  0123456789abcdefghijklmnopqrstuvwxyz

validation:
  ^c[0-9a-z]{24}$

generation:
  process-memory cryptographically secure random bytes mapped without modulo
  bias to the frozen 36-character alphabet
```

Before Request 1, generate the Request-2 and Request-3 values in a
provider-free, customer-data-free process. Reject and regenerate locally until
both pass the exact shape, are distinct from each other and Request 1, and are
absent from the in-memory BF2 identity set. If a cryptographically secure
random source is unavailable, stop before provider contact. No database write,
Prisma internal API, new package, repository file, or seed may be used. Random
source bytes and rejected candidates remain process-memory only and are
discarded after construction. Record only the exact tested representation
properties:

```text
generator policy identity
exact string length
lowercase/uppercase/mixed observation
observed character classes
observed leading-prefix shape
absence/presence of punctuation
exact non-sensitive generated value
```

The two representatives must share the same observed representation family
and be distinct. They are synthetic provider-test identities, not secrets.
Never reuse Request 2's identity in Request 3. Do not claim those observations
are the complete Prisma CUID specification, that every future `Payment.id` is
acceptable, or that success freezes the production provider-order derivation.
If the exact synthetic policy cannot be executed without prohibited mutation,
stop before contact:

```text
STOP — BF2 REPRESENTATIVE ORDER FAMILY NOT ESTABLISHED
```

## 12. Request 1 — documented baseline

Purpose: separate endpoint, credential, and official baseline-request failure
from later experimental-variable failure.

```text
payment.transaction_type:
  PAYMENT

payment.order_id:
  fresh numeric official-example-family value

payment.currency:
  USD

payment.amount:
  "1.00"

payment.lang:
  EN

payment.payment_method:
  ABSENT
```

`"1.00"` is the installed EX2A canonical representation of 100 USD minor
units. The official example's `"1"` is not a BF2 experimental variable.

Request 1 succeeds only when a complete response is received within 65,536
bytes, its HTTP status is 2xx, its Content-Type is compatible with the frozen
UTF-8 JSON expectation, it parses as exactly one top-level JSON object with no
trailing alternate data, `rescode === "0000"`, `resmsg` is a string, and
`fgkey` is a nonblank string. A `rescode === "0000"` body with a non-2xx status
is a contradiction: record it and stop without inferring provider semantics.

If Request 1 does not satisfy every success condition, or its transport result
is ambiguous, stop without Request 2 or 3:

```text
STOP — BF2 BASELINE NOT ESTABLISHED
```

No provider retry is permitted even if the failure appears transient.

## 13. Request 2 — representative CUID family + P000/USD

Request 2 is permitted only after Request 1 success.

```text
payment.transaction_type:
  PAYMENT

payment.order_id:
  fresh synthetic lowercase CUID1-like representative

payment.currency:
  USD

payment.amount:
  "1.00"

payment.lang:
  EN

payment.payment_method:
  P000
```

`"1.00"` is selected from the installed EX2A canonical codec as the exact wire
representation of 100 USD minor units and is identical to Request 1.

Request 2 intentionally changes two coupled facts from the baseline:

1. numeric example-family order ID to the frozen synthetic CUID1-like family;
2. no forced method to `P000`.

Consequently, a rejection cannot by itself identify which changed fact caused
it. Branch B provides bounded discrimination, not proof of root cause.

Request 2 uses the same success predicate as Request 1. Its next action is:

```text
OBSERVED_ACCEPTED:
  select Branch A

TRANSPORT_AMBIGUOUS:
  consume ordinal and order ID, write sanitized terminal evidence, STOP

complete bounded explicit provider rejection:
  apply the Branch-B eligibility rule before any later contact

malformed, oversized, truncated, contradictory, or otherwise unclassifiable:
  STOP
```

Transport ambiguity includes a timeout or connection reset after contact may
have begun, truncated response, response ceiling overflow, malformed JSON after
a provider response, or an HTTP/body contradiction that cannot be safely
classified. Request 2 is never retried.

For Branch-B eligibility, an explicit provider rejection requires a complete
bounded JSON object with string `rescode` and string `resmsg`, where `rescode`
is not `"0000"`. A non-2xx response carrying `rescode === "0000"`, a response
with `rescode === "0000"` and missing or blank FGKey, or another response
contract contradiction is not Branch-B eligible and stops. This rule does not
assign undocumented meaning to a provider code.

## 14. Request 3 — adaptive branch

Request 3 is permitted only after Request 2 is conclusively accepted or after
a complete bounded explicit rejection is recorded as Branch-B eligible.
Transport ambiguity never permits Request 3.

### Branch A — Request 2 succeeds

```text
payment.transaction_type:
  PAYMENT

payment.order_id:
  fresh synthetic lowercase CUID1-like representative

payment.currency:
  JPY

payment.amount:
  "1"

payment.lang:
  EN

payment.payment_method:
  P000
```

`"1"` is the installed EX2A canonical representation of 1 JPY minor unit.
Branch A observes P000 + JPY preparation while repeating the intended observed
order-representation family.

### Branch B — Request 2 has an eligible explicit rejection

Do not test JPY. Use:

```text
payment.transaction_type:
  PAYMENT

payment.order_id:
  fresh synthetic lowercase CUID1-like representative

payment.currency:
  USD

payment.amount:
  "1.00"

payment.lang:
  EN

payment.payment_method:
  ABSENT
```

Branch B removes only forced `P000` while retaining the observed synthetic
CUID1-like family and canonical USD representation. If it succeeds, the exact
representative family plus `"1.00"` was observed accepted without forced P000,
while Request
2's P000/USD result remains rejected. A generic rejection does not prove P000
was the cause. If Branch B also fails, order representation, provider state,
and other causes remain ambiguous. No fourth request is allowed.

Branch B is eligible only when all are true:

1. Request 2 completed without transport ambiguity.
2. A complete response was obtained within every response bound.
3. The response is safely classifiable as an explicit provider rejection.
4. It does not explicitly diagnose a non-payment-method field or system
   precondition that makes P000 removal non-diagnostic.
5. `branchBEligible` and `branchDecisionReason` are recorded before Request 3
   can set `contactMayHaveBegun`.

An explicitly P000/payment-method-related rejection or a generic provider
rejection without a specific diagnosis may be eligible. An explicit diagnosis
of `order_id`, amount, currency, MID, authentication, `return_url`,
`status_url`, request JSON/schema, maintenance/outage, rate limiting, or another
clear non-payment-method cause is ineligible and stops. Malformed, oversized,
transport-ambiguous, or contradictory responses also stop. This is a bounded
fail-closed branch rule, not a comprehensive provider-error taxonomy.

## 15. No matrix expansion

BF2 is not a grammar search or fuzzing campaign. The execution must not add
hyphen, underscore, uppercase, Unicode, whitespace, length-boundary, random
grammar, or brute-force variants. It must not add retries, parallel requests,
an extra baseline, a fourth request, or post-result exploratory calls.

## 16. Deterministic sanitized Result-v1

BF2 produces one deterministic sanitized evidence artifact with this frozen
identity:

```text
schema:
  mira.eximbay.bf2-ready-preflight-result

version:
  1

experiment:
  EXIMBAY-BF2-READY-PREFLIGHT
```

The exact top-level fields are:

```text
schema
version
experiment
startedAt
completedAt

repositoryAuthority:
  contractMergeSha
  contractFileSha256
  ex2aSourceMergeSha
  ex2aSourceStatusMergeSha

providerEvidence:
  officialDocsRetrievedAt
  officialDocUrls
  environment
  credentialClass
  credentialRetrievedAt
  host
  endpoint

requestCeiling
actualProviderRequestCount
branchDecision
branchDecisionReason
terminalOutcome
stopReason
warnings
attempts
```

All timestamps are captured execution facts in UTC RFC 3339 form; serialization
creates no timestamps. `officialDocUrls` contains only the six current official
URLs named in Section 4. Provider-evidence constants are:

```text
environment:
  PUBLIC_SHARED_TEST

credentialClass:
  PUBLIC_SHARED_TEST

host:
  https://api-test.eximbay.com

endpoint:
  POST /v1/payments/ready

requestCeiling:
  3
```

The literal MID, API key, Authorization value, and Basic token are absent from
Result-v1. `credentialRetrievedAt` records only when the public credential pair
was freshly retrieved.

At execution time, `repositoryAuthority` binds the reviewed merged BF2 contract
actually authorizing the run. Resolve, do not pre-fill, its merge SHA and file
SHA-256 after merge. The installed historical values are:

```text
ex2aSourceMergeSha:
  685fc048c8cb6fb834593e3b1f56756817c8e9ab

ex2aSourceStatusMergeSha:
  4739fcff225ccbed1764a8ea1a6551a81a487c04
```

### 16.1 Exact attempt slots

`attempts` always contains exactly three ordered records corresponding to
Requests 1, 2, and 3. A request prohibited by an earlier gate remains present
with `classification: NOT_TESTED`; later slots are never omitted.

Every attempt record has exactly these fields:

```text
ordinal
plannedClass
executed
contactMayHaveBegun
startedAt
completedAt
orderId
orderIdClass
generatorPolicy
orderIdProperties
transactionType
currency
amount
paymentMethodPresent
paymentMethod
httpStatus
responseContentType
responseByteLength
rescode
resmsgSanitized
resmsgWasSanitized
fgkeyPresent
fgkeyLength
durationMs
classification
branchBEligible
diagnosticCategory
warningCodes
```

Inapplicable scalar/object fields are explicitly `null`, booleans remain
booleans, and warning collections remain arrays. The frozen planned classes are:

```text
NUMERIC_BASELINE
SYNTHETIC_CUID1_P000_USD
ADAPTIVE_REQUEST_3_NOT_SELECTED
SYNTHETIC_CUID1_P000_JPY
SYNTHETIC_CUID1_NO_METHOD_USD
```

Request 3 begins as `ADAPTIVE_REQUEST_3_NOT_SELECTED`. Its class and exact
request facts are replaced with the selected Branch-A or Branch-B values only
after `branchDecision` and `branchDecisionReason` have been recorded and before
its `contactMayHaveBegun` can change.

`orderId` records the exact non-sensitive ID only for a finalized request
attempt. `orderIdProperties` records the bounded representation observations
from Section 11. `generatorPolicy` is null for the numeric baseline and
`bf2-synthetic-lowercase-cuid1-like/v1` for the two synthetic values.
`orderIdClass` is `SYNTHETIC_UTC_14_DIGIT_NUMERIC` for Request 1 and
`SYNTHETIC_LOWERCASE_CUID1_LIKE_REPRESENTATIVE` for Requests 2 and 3.

### 16.2 Provider-request-count proof

`contactMayHaveBegun` flips to `true` immediately before the first operation
capable of contacting Eximbay. `executed` has the same boolean value. Once
true, the ordinal and order ID are permanently consumed even after timeout,
reset, overflow, malformed response, or ambiguous outcome.

The Result validator must enforce:

```text
actualProviderRequestCount
  == count(attempt.contactMayHaveBegun === true)

0 <= actualProviderRequestCount <= 3

contactMayHaveBegun values are prefix-monotone by ordinal

no NOT_TESTED attempt has contactMayHaveBegun === true
```

Automatic client retries, middleware retries, secondary telemetry requests,
SDK loads, and provider cleanup calls are prohibited, so each true value owns
exactly one authorized provider-contact attempt.

### 16.3 Response and parser custody

The raw response is ephemeral process-memory input. Read at most 65,536 bytes,
decode strict UTF-8 without replacement, and require a Content-Type media type
of `application/json`; an optional charset is allowed only when it is UTF-8.
Require exactly one JSON object—not null or an array—and reject malformed or
trailing alternate data.

Use one in-process pipeline:

```text
bounded read
  -> strict decode
  -> parse
  -> validate
  -> sanitize/project
  -> discard raw response and raw FGKey
```

Do not print `rawBody`, `response.text`, curl response stdout, or a successful
raw JSON response. Do not persist a full raw request or response, HTML,
cookies, Set-Cookie, unrelated headers, or arbitrary exception strings.

`resmsgSanitized` may retain at most 256 printable ASCII characters and must not
retain credential-shaped or control-rich content. If the input is non-string,
oversize, non-printable, credential-shaped, or otherwise requires replacement,
store a fixed safe diagnostic value and set `resmsgWasSanitized: true`.

Overflow, truncated input, incompatible Content-Type, invalid UTF-8, malformed
JSON, trailing alternate data, or an unclassifiable HTTP/body contradiction is
`TRANSPORT_AMBIGUOUS`, consumes the attempt, and stops every later BF2 request.
The oversized/raw body is never persisted.

### 16.4 Serialization and local custody

Before provider contact, the separate execution task must resolve and
predeclare one writable absolute evidence root outside the Mira repository.
Under it, use `original/` and `archive/` with the same canonical basename:

```text
eximbay-bf2-ready-preflight-result-v1-<UTC_RUN_ID>.json
```

The root may not be the Mira repository, `.local-review/**`, `node_modules`, an
application upload directory, or a production storage bucket. Print the two
sanitized resolved artifact paths before contact without printing credentials.
If path writability and custody initialization cannot be proven, stop:

```text
STOP — BF2 RESULT CUSTODY NOT READY
```

The artifact is initially `LOCAL / SANITIZED / UNTRACKED / NON-REPOSITORY`.
Serialize once as UTF-8 JSON with two-space indentation and one final LF. Write
those final bytes to `original/`, copy the exact bytes to `archive/`, then
compute both byte counts and SHA-256 values and require byte equality, equal
counts, and equal digests. The bytes must not subsequently be rewritten, and
neither copy may be deleted before adjudication completes.

If final writing fails after contact, make no later provider request, preserve
only available sanitized in-memory facts, report custody failure without raw or
credential-bearing output, and stop. Later BF2 adjudication must independently
read the actual artifact and bind its canonical filename, byte count, and
SHA-256; terminal scrollback or chat prose is not evidence custody. No Result
artifact is automatically added to Git.

## 17. FGKey custody

For every success, confirm that FGKey is nonblank, record only
`fgkeyPresent` and `fgkeyLength`, then discard the raw value. No FGKey digest or
other stable derivative is retained. FGKey is evidence of `/ready` preparation,
not authority to continue a payment. It remains memory-only and must never be
printed, logged, persisted, passed to an SDK, reused, or supplied to another
endpoint.

## 18. Side-effect ceiling

The only expected provider-side effects are at most three shared-test
preparation/FGKey records, each associated with one fresh test order ID.

BF2 grants no authority for a payment-page session, card input, authentication,
authorization, capture, settlement, callback, verification, inquiry, refund,
void, live transaction, or Mira database mutation.

If evidence suggests an effect beyond `/ready` preparation, stop immediately,
discard raw FGKeys, preserve only allowed evidence, and perform no recovery
call:

```text
STOP — BF2 SIDE-EFFECT BOUNDARY VIOLATED
```

## 19. Result vocabulary

Every attempt uses exactly one observational classification:

```text
OBSERVED_ACCEPTED
OBSERVED_REJECTED
TRANSPORT_AMBIGUOUS
NOT_TESTED
```

- `OBSERVED_ACCEPTED`: the exact request met the applicable success predicate.
- `OBSERVED_REJECTED`: a complete response was obtained within every bound and
  was safely classified as provider non-acceptance. This classification does
  not itself make Branch B eligible; the narrower explicit-rejection gate in
  Section 14 still applies.
- `TRANSPORT_AMBIGUOUS`: contact may have occurred but no complete trustworthy
  response could be safely classified. This includes timeout or reset after
  contact may have begun, truncation, overflow, incompatible Content-Type,
  invalid UTF-8, malformed or trailing JSON, and unclassifiable HTTP/body
  contradiction.
- `NOT_TESTED`: a request/branch was prohibited by an earlier gate or stop.

These are observations, not normative provider authority.

Result-v1 uses this bounded terminal-outcome vocabulary:

```text
BASELINE_NOT_CONTACTED
BASELINE_BLOCKED
BASELINE_ACCEPTED
REQUEST2_ACCEPTED
REQUEST2_REJECTED_BRANCH_B_ELIGIBLE
REQUEST2_REJECTED_TERMINAL
REQUEST2_TRANSPORT_AMBIGUOUS
P000_JPY_ACCEPTED
P000_JPY_REJECTED_OR_UNRESOLVED
REPRESENTATIVE_NO_METHOD_ACCEPTED
REPRESENTATIVE_NO_METHOD_REJECTED_OR_UNRESOLVED
READY_PREFLIGHT_EVIDENCE_COMPLETE
```

`READY_PREFLIGHT_EVIDENCE_COMPLETE` means only that Request 1 succeeded and the
authorized adaptive sequence reached its terminal result within the ceiling.
It may coexist with rejected or unresolved downstream observations. It does
not mean `EX2B READY`, `PRODUCTION READY`, `ORDER_ID GRAMMAR CONFIRMED`, or
`MIRA MID CONFIRMED`.

## 20. Threat and failure model

| Threat or failure | Required disposition |
| --- | --- |
| Public credential is stale or changed | Fresh official-page retrieval; baseline stops later requests on failure. |
| Secret-shaped material enters logs | No verbose/header output; credential and Basic form remain process-memory only. |
| Timeout followed by duplicate attempt | Consume the order ID and request ordinal; no retry. |
| Redirect crosses endpoint boundary | Redirect following disabled; never follow 3xx, and apply the bounded response classifier fail-closed. |
| Representative success overclaims grammar | Freeze exact tested properties only; require post-BF2 adjudication. |
| Reconciliation constraint is imported into `/ready` | Prohibited; treat `/ready` length/charset as unresolved. |
| Multiple changed facts obscure causality | Keep identical canonical USD amounts; use only eligible Branch B for bounded discrimination and report residual ambiguity. |
| FGKey enables unintended continuation | Record presence/length only, discard raw value, never invoke SDK. |
| Placeholder URL triggers customer/provider callback | Use exact `.invalid` HTTPS placeholders, deploy no endpoint, and stop on incompatibility or unexpected side effect. |
| Provider response contains sensitive/unbounded data | Enforce the streaming byte ceiling; in-memory parse and allowlisted Result-v1 projection only. |
| Evidence exists only in terminal/chat | Initialize non-repository original/archive custody before contact and bind final bytes by filename, count, and SHA-256. |
| Test success is treated as Mira/live capability | Preserve shared-test versus account boundary and require separate account evidence. |

## 21. SDK deferred boundary

Current official pages remain inconsistent between v1 and v2 SDK examples.
BF2 loads neither and cannot establish canonical test SDK, canonical production
SDK, version semantics, compatibility, or deprecation. Those remain a later
BF3/vendor-evidence gate.

## 22. `status_url` deferred boundary

BF2 supplies `status_url` only because it is mandatory for `/ready`. No payment
page is opened, so BF2 cannot establish callback method, target placement,
query versus body, Content-Type, encoding, acknowledgement semantics, retry
cadence/count/cutoff, or duplicate runtime behavior. No callback fact may be
inferred from BF2.

## 23. Shared-test versus Mira-account boundary

Public shared-test acceptance is not evidence that Mira has contracted or
enabled P000, USD, JPY, 3DS, refunds, live approval, or any other merchant
capability. It does not validate Mira production credentials, MID, routing, or
provider selection.

## 24. Post-BF2 adjudication gate

Do not implement EX2B immediately after execution. First perform a separately
authorized bounded result adjudication answering:

1. Was the baseline established?
2. Was the exact representative intended order format observed accepted?
3. Was P000 + USD observed accepted?
4. Was P000 + JPY observed accepted?
5. Which variables and transport facts remain ambiguous?
6. Does order-ID wire derivation still require vendor clarification?
7. Is the next step vendor clarification, BF3 SDK evidence, an EX2B1 contract,
   or stop?

Only that adjudication may interpret BF2 evidence into next-source readiness.

## 25. Source and activation non-authority

Even a perfect three-request result does not authorize provider-factory
registration, routing, fallback, repository/runtime credentials, environment
files, public routes, SDK browser loading, status ingress, payment completion,
database writes, order/manufacturing creation, inquiry, reconciliation, refund,
void, sandbox product activation, live activation, or deployment.

## 26. Rollback and recovery

Authoring this contract has no provider, runtime, database, or customer rollback
because it performs no execution.

After a later BF2 execution, recovery is limited to:

```text
never reuse any tested order ID
discard all raw FGKeys
perform no downstream provider call
retain only the finalized sanitized Result-v1 original/archive pair
```

Do not call cancellation or any other endpoint for a `/ready`-only evidence
record. If Eximbay explicitly indicates an unexpected transaction side effect,
stop and open a separate incident/recovery adjudication rather than improvising
a provider call.

## 27. Execution state machine

```text
reviewed merge + separate explicit BF2 task
  -> fresh official-source check
  -> credential-in-memory setup
  -> provider-free synthetic CUID1-like representative preflight
  -> initialize non-repository Result-v1 original/archive custody
  -> Request 1
       rejection/ambiguous -> BASELINE_BLOCKED -> finalize Result-v1 -> STOP
       success -> Request 2
         success -> Request 3 Branch A (P000 + JPY)
         eligible explicit rejection -> record eligibility
           -> Request 3 Branch B (synthetic representative + USD, no P000)
         ineligible explicit rejection -> finalize Result-v1 -> STOP
         transport ambiguity -> finalize Result-v1 -> STOP
  -> finalize sanitized Result-v1 once
  -> write byte-identical original/archive copies and verify count + SHA-256
  -> raw FGKey disposal
  -> separate post-BF2 adjudication
```

Any evidence drift, authority conflict, representative-family failure, request
ceiling risk, credential leakage risk, or unexpected side effect stops before
the next provider request.

## 28. Verification and review gate

For this documentation-only candidate:

- changed paths must be exactly this contract, `docs/engineering/README.md`,
  and `docs/discovery/decision-log.md`;
- all local Markdown links must resolve;
- external provider claims must trace only to current official Eximbay pages;
- `git diff --check` must pass; and
- no Eximbay API request, SDK invocation, runtime test, source/test change,
  database operation, credential file, stage, commit, push, or PR is permitted.

This candidate requires one independent evidence/contract review before merge.
The reviewed merge is necessary but not sufficient for provider contact; the
execution still requires a separate explicit task.

## 29. Change control

Semantic changes to request shape, endpoint, host, credential class, request
ceiling, branching, success predicate, evidence custody, side-effect ceiling,
or result interpretation require a new version and decision-log entry. Do not
silently edit a reviewed execution contract after evidence is collected.

## Verdict

```text
BF2 SHARED-TEST READY PREFLIGHT CONTRACT v0.1
CANDIDATE — READY FOR INDEPENDENT REVIEW AFTER AUTHORING VERIFICATION
```
