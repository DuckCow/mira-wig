# Eximbay EX2B2-S1 — READY Kernel Source Status / As-Built v0.1

## Status

```text
DOCUMENT CLASS:
  SOURCE STATUS / AS-BUILT

RISK CLASS:
  HIGH — PAYMENT PROVIDER TRANSPORT / RESPONSE ADMISSION / SDK HANDOFF DATA

TASK CLASSIFICATION:
  SOURCE_ONLY

TASK-LEVEL AUTHORIZATION:
  DOCUMENTATION_ONLY

SOURCE STATUS VERSION:
  v0.1

EX2B2 DESIGN:
  MERGED / INSTALLED / HISTORICAL NORMATIVE AUTHORITY

EX2B2-S1 SOURCE:
  MERGED / INSTALLED / REVIEWED

FINAL INDEPENDENT SOURCE CLOSURE:
  PASS

OPEN S1 SOURCE BLOCKER:
  0

OPEN S1 SOURCE IMPORTANT:
  0

S2 PERSISTED Payment.mode PROVENANCE:
  DEFERRED / MANDATORY PRE-CONTACT GATE

REAL EXIMBAY PROVIDER CONTACT:
  NONE / NOT AUTHORIZED

SDK LOAD / request_pay:
  NONE / NOT AUTHORIZED

SANDBOX / LIVE RUNTIME ACTIVATION:
  NOT AUTHORIZED
```

## 1. Status and authority

This record describes the installed EX2B2-S1 source merged to `main` at
`2bc5ad6ece6c429c2ad1375a99cb5ccfacc3dadd`. It is a Source Status / As-Built
record under the [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md).
It records what the reviewed S1 source actually provides; it does not redesign
the EX2B2 contract and does not claim that all EX2B2 seams are implemented.

The source is installed but dormant. Source installed != runtime activated.
There is no provider-contact, credential, browser, SDK, routing, callback, or
financial authority in this record.

## 2. Governing documentation and precedence

The precedence for this record is:

1. [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md).
2. [EX2B2 READY Transport + JavaScript SDK Browser Handoff Design Contract v0.1](./eximbay-ex2b2-ready-transport-sdk-handoff-design-contract-v0.1.md), a historical normative artifact.
3. [EX2B2 READY Transport + JavaScript SDK Browser Handoff Threat / Failure Model v0.1](./eximbay-ex2b2-ready-transport-sdk-handoff-threat-model-v0.1.md), a historical failure boundary.
4. The installed EX2A and EX2B1 source-status records and the merged source,
   tests, and Git history identified below.
5. The independent S1 source-review and closure evidence summarized in this
   record.

The design and threat documents retain their original lifecycle text. This
Source Status adds installed source truth and does not rewrite either document.
Repository source and behavior tests govern the As-Built details; design prose
cannot be used to infer a source capability that is not installed.

## 3. Exact reviewed and installed chain

### 3.1 Design installation

```text
design PR:
  #65

design reviewed head:
  b7539525323d6d7d441b7f9a3352ad04a7d26707

design merge:
  82bb1589a7c221773104f5320beeab77dac6646a

design post-merge CI:
  #344 — success
```

The Design Contract and Threat / Failure Model are installed historical
normative artifacts. Their original candidate wording is preserved.

### 3.2 S1 source implementation

```text
source PR:
  #66

PR title:
  feat(payment): add Eximbay EX2B2 S1 ready kernel

reviewed source head:
  5dac5d92916cd539f15b7f2cda8f41f56cad4041

source merge:
  2bc5ad6ece6c429c2ad1375a99cb5ccfacc3dadd

source merge parent 1:
  82bb1589a7c221773104f5320beeab77dac6646a

commits in source candidate:
  1

changed paths:
  3

additions / deletions:
  1405 / 0
```

The exact source merge paths were:

```text
A  src/lib/payment/eximbay/ready-kernel.ts
A  src/lib/payment/eximbay/__tests__/ready-kernel.integration.test.ts
A  src/lib/payment/eximbay/__tests__/s1-isolation.test.ts
```

### 3.3 Installed S1 file identities

| Installed path | Bytes | SHA-256 |
| --- | ---: | --- |
| `src/lib/payment/eximbay/ready-kernel.ts` | 17002 | `ca90ae98225676d56c5fd6822dfd908d4a409b0bb58e4a2f5d4238192b88244b` |
| `src/lib/payment/eximbay/__tests__/ready-kernel.integration.test.ts` | 29957 | `d75f61308f11c80f5c41f9d2dc1ae65b380fdbd04d594c07384be656e5f72ee9` |
| `src/lib/payment/eximbay/__tests__/s1-isolation.test.ts` | 4897 | `9307f214c0066a8b0d2224e4f46d488a502ceca9a0b94a9bcd31d2e9a8b117b0` |

## 4. Deterministic READY contact-plan As-Built

S1 provides a credential-free deterministic contact-plan core. The caller
supplies one closed mode value, `SANDBOX` or `LIVE`; the mode selects the one
fixed endpoint and cannot be replaced by an independently supplied endpoint.

```text
method:
  POST

content type:
  application/json

SANDBOX:
  https://api-test.eximbay.com/v1/payments/ready

LIVE:
  https://api.eximbay.com/v1/payments/ready

outbound serialized body maximum:
  65,536 UTF-8 bytes
```

The request body is serialized once from the trusted EX2A/EX2B1 preparation
facts and persisted-order binding. An oversized body fails before usable plan
authority is created or transport is called. The body is credential-free but
is sensitive transport material: it contains buyer and payment facts and must
not be treated as safe general telemetry, logged, or copied into diagnostics.

S1 does not prove that the supplied mode came from the durable `Payment.mode`.
That provenance is the mandatory S2 pre-contact gate in section 11.

## 5. Transport ownership and no-network boundary

The installed production graph exports an injected transport port only:

```text
transport port interface:
  YES

concrete provider network adapter:
  NO

global fetch ownership:
  NO

credentials/config ownership:
  NO
```

The isolation test fixes the permitted dependency graph and rejects network,
browser, database-write, lifecycle, logging, credentials, SDK, callback, and
routing reachability. S1 source itself cannot contact Eximbay.

## 6. READY response admission As-Built

Only a response with an integer HTTP status in the 2xx range enters JSON and
provider-result admission. Every non-2xx response returns the non-authorizing
`NON_2XX` class; S1 creates no retry or terminal financial authority from it.

The response body is streamed into a 65,536-byte bound and a maximum of
65,536 chunk events. Invalid chunks, stream failure, or either bound failure
are rejected. UTF-8 decoding is fatal (replacement decoding is not accepted).

The accepted media type is exactly `application/json`, with at most one
optional `charset=utf-8` parameter. JSON must be exactly one root object with
no trailing non-whitespace data. Before ordinary JSON semantic admission, a
scanner rejects duplicate decoded root keys among `rescode`, `resmsg`, and
`fgkey`. Unknown fields are ignored after this protected projection.

The required primitive and business checks are:

```text
rescode:
  required string, exact success value "0000"

resmsg:
  required string

readyFgkey (wire field fgkey):
  required for success
  1..4096 UTF-8 bytes
  no NUL
  no Unicode Cc control code point
```

No normalization, provider error-code taxonomy, nested schema, or other
provider semantic is invented by S1. A non-`0000` result is not success;
whether an exact 2xx business rejection is a terminal provider outcome remains
outside this pure kernel and is governed by the later lifecycle owner.

## 7. Non-forgeable plan and success provenance

The source keeps module-private authority for each created contact plan. Only
the exact S1-created plan identity is accepted by execution. A successful
admission receives a non-forgeable success object whose private authority
records the exact originating plan authority.

Consequences fixed by installed behavior and tests:

```text
trusted plan:
  exact S1-created plan identity only

admitted success:
  bound to the exact originating trusted plan authority

Payment A success transplanted to Payment B:
  rejected

SANDBOX success transplanted to LIVE plan:
  rejected

copied/reconstructed structural plan:
  rejected

copied, proxied, or hand-built success shape:
  rejected
```

This binding is the source-level provenance boundary. It does not by itself
prove persisted `Payment.mode` provenance; S2 must bind that durable value
before any provider contact.

## 8. Final SDK-wire materialization within S1

S1 does not load, execute, or call the JavaScript SDK. It only materializes
the final data wire for a later, separately authorized browser handoff:

```text
originating trusted READY wire
  + admitted READY success from the same exact plan
  -> final SDK wire facts
```

Shared `payment`, `merchant`, `buyer`, and `url` fields come from the
originating trusted READY wire. In particular,
`payment.order_id` remains the exact persisted `Payment.providerOrderId` used
by the READY request. The S1 materializer is not the historical pure
`projectEximbaySdk(...)` authority; it requires the trusted plan and admitted
success pair.

Behavioral parity covers `P000 / USD`, `P000 / JPY`, and `no-method / USD`.
The no-method case is source behavior coverage, not additional merchant or
provider capability evidence. The S1 wire is data only and grants no browser
handoff, SDK source, or payment completion authority.

## 9. Confidentiality and observability boundary

Plan bodies and admitted response values are sensitive. S1 results expose only
bounded safe outcome classes; transport exceptions, provider messages,
readyFgkeys, and sentinel secrets are not copied into diagnostic output. The
future observability boundary may use only reviewed safe fields such as phase,
mode, bounded outcome class, safe HTTP status, and byte count. API keys,
Authorization, raw request/response bodies, buyer data, SDK payloads,
readyFgkeys, statusFgkeys, cookies, and session material remain prohibited.

## 10. S2 persisted-mode provenance mandatory re-entry gate

S1 proves a closed caller-supplied plan mode and exact fixed endpoint mapping.
It does **not** prove that the mode came from persisted `Payment.mode`, nor
that deployment configuration or a credential environment matches the attempt.

Before any future provider contact, S2 must require all four values to be
identical:

```text
loaded persisted Payment.mode
  == mode used to construct the S1 READY plan
  == mode used to select the READY endpoint
  == mode bound to the resolved credential/config interlock
```

S2 must reject before contact when persisted SANDBOX is paired with LIVE,
persisted LIVE is paired with SANDBOX, or configured mode mismatches the
persisted attempt. Browser, route, URL, cookie, GeoIP, current Market, and
current Locale are not environment-selection authority. S3 must derive its SDK
environment from the same persisted `Payment.mode` authority. This P8 record
does not authorize S2 or S3 implementation.

## 11. Independent source-review history

The initial independent S1 review found one blocker, three important findings,
and one minor finding:

```text
B01  admitted READY success was not bound to the exact READY authority
I01  outbound serialized READY request lacked an explicit byte bound
I02  response byte bound lacked chunk-event cardinality bound
I03  full-build failure attribution lacked direct clean-baseline reproduction
M01  credential-free plan body was still sensitive transport material
```

S1R bounded source corrections closed all five. S1R2 then identified
`S1R2-I01` as an IMPORTANT mode-provenance boundary: S1 does not establish
that a caller-supplied plan mode came from persisted `Payment.mode`.
`S1R2-I01` is **DEFERRED_BY_INSTALLED_BOUNDARY_TO_S2**, not closed by S1.

The final independent source closure is:

```text
status:
  PASS

open S1 source blocker:
  0

open S1 source important:
  0

source changes after final closure:
  none
```

The reviewed final closure packet was:

```text
WIG_PAY_EXIM_EX2B2_S1_REVIEW_v0_3.zip
bytes: 41813
SHA-256: 38ec4f46e1e5b15224fddae1b35f7f85dc69d676716045ca627951952dfc6ead
entries: 15

full reviewed source diff SHA-256:
  095d52cc1fe17d6f11cad72394ff82a8cec42f5741df2eb308c5f38127d12440

v0.1 -> v0.2 source correction delta SHA-256:
  373b2b36e5f7a0ea22b9c4476725a75fe7ba1260f5262de6dc1e4205ddf7573b

v0.2 -> v0.3 evidence-only mode-boundary delta SHA-256:
  14a546af28a84da3486e6f0352eff1cc9fd849b0f1cd974cfd2d4061a951acc5
```

## 12. Historical validation and CI evidence

The reviewed source chain records the following validation:

```text
focused S1:
  75 tests PASS

protected regression:
  383 tests PASS

npm run verify:
  267 test files
  5,970 tests PASS

PR CI:
  #345 / run ID 31846538344
  exact reviewed head 5dac5d92916cd539f15b7f2cda8f41f56cad4041
  completed / success

post-merge main CI:
  #346 / run ID 31847182344
  exact merge 2bc5ad6ece6c429c2ad1375a99cb5ccfacc3dadd
  completed / success
```

The green PR and post-merge CI results are historical evidence bound to their
exact heads. They do not erase the local full-build limitation in section 13.

## 13. Full-build limitation and clean-baseline reproduction

```text
FULL BUILD:
  NOT PASS

candidate offline Webpack application compilation:
  PASS before later Next export validation

clean exact baseline:
  identical unchanged page-export failure directly reproduced

unchanged failing path:
  src/app/(shop)/orders/[id]/page.tsx

named export:
  CustomerOrderDetailView

S1-attributable build regression:
  NOT OBSERVED

canonical npm run build under NETWORK:NONE:
  Google Fonts fetch limitation remains
```

This limitation is explicitly distinct from the green GitHub CI runs. It does
not authorize a source workaround or a claim of full-build success.

## 14. Activation, durable state, and merchant capability

S1 adds no schema, migration, durable READY state, importer, HTTP adapter,
credential seam, lifecycle integration, routing registration, merchant
capability, or runtime configuration. The generic initiation contract is not
changed. EXIMBAY remains disabled in routing. No sandbox/test or production/live
runtime is activated, and no customer use is available.

## 15. Known limitations and deferred work

Outside S1 and separately gated are persisted-mode/config/credential binding,
server HTTP and retry/ambiguity lifecycle, durable READY handling, the
two-channel browser handoff, fixed SDK loader and CSP/security review, BF4
callback/status verification and completion, merchant capability evidence,
provider retry/FGKey lifetime semantics, recovery after lost handoff, routing,
and any sandbox/live exercise. The exact production SDK asset, READY
idempotency, and readyFgkey TTL/replay semantics remain unresolved authority
gaps. No automatic recontact is authorized by this record.

## 16. Rollback and recovery

Because S1 has no schema, migration, durable state, production importer,
concrete network, or activation, a source rollback if needed is a revert of the
S1 source merge. Such a rollback would not roll back EX2B1 schema or persisted
identity state. Any recovery requiring provider inquiry, recontact, a new
merchant fact, or lifecycle mutation requires a separately reviewed authority.

## 17. Re-entry and change-control gates

A new Source Status version or reviewed update is required if any of the
following occurs: S1 is imported into production; concrete transport/network
is added; mode ownership changes; request/response bounds or parser/admission
semantics change; protected duplicate-key or fgkey admission changes; success
or plan provenance changes; SDK-wire or persisted-order binding ownership
changes; durable state or lifecycle integration appears; S2/S3 integration
changes the authority boundary; or routing/activation becomes authorized.

## 18. Explicit non-authority

The following are not installed or authorized by EX2B2-S1:

- real Eximbay READY HTTP contact or a concrete HTTP adapter;
- API credentials, runtime credential environment names, or merchant capability;
- SDK asset loading, SDK script execution, or `EXIMBAY.request_pay`;
- browser handoff integration or generic Payment initiation integration;
- durable transient `readyFgkey` persistence or a new Payment lifecycle state;
- callback/status verification, BF4, or financial completion truth;
- refund, cancel, void, routing, feature activation, or customer use;
- sandbox/test runtime activation or production/live runtime activation.

Source installed != runtime activated. The source candidate proves no financial
success, refund/cancel/void result, callback authenticity, merchant enablement,
or provider state.

## 19. Final source-status summary

EX2B2-S1 is merged, installed, and independently source-closure reviewed. It
provides deterministic credential-free READY plan construction, bounded strict
response admission, exact plan/success provenance, and final persisted-order
SDK-wire data materialization behind an injected transport seam. It does not
prove persisted `Payment.mode` provenance; S2 owns that mandatory pre-contact
gate. The record is documentation-only and grants no provider or runtime
authority.

```text
EX2B2-S1 SOURCE STATUS / AS-BUILT RECORDED
— DOCUMENTATION-ONLY / NO RUNTIME AUTHORITY
```
