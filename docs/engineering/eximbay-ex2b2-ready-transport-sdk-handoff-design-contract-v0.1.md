# Eximbay EX2B2 — READY Transport + JavaScript SDK Browser Handoff Design Contract v0.1

## Status

```text
DOCUMENT CLASS:
  DESIGN CONTRACT

RISK CLASS:
  HIGH — EXTERNAL PAYMENT PROVIDER CONTACT + BROWSER SDK HANDOFF

TASK CLASSIFICATION:
  DOCUMENTATION_ONLY / DESIGN

CURRENT TASK-LEVEL AUTHORIZATION:
  DOCUMENTATION ONLY

STATUS:
  HUMAN CLOSURE REVIEWED / READY FOR DOCUMENTATION INSTALLATION

HUMAN CLOSURE REVIEW:
  PASS — 2026-08-14

REVIEWED SEMANTIC PACKET:
  WIG_PAY_EXIM_EX2B2_D1_REVIEW_v0_2.zip

REVIEWED PACKET SHA-256:
  d74574873370b79c2db955fd8cedc4332f23b8625a280e5e20885167980b46c0

REVIEW EFFECT:
  D1R semantics frozen; lifecycle metadata only changes after this review

REPOSITORY BASELINE:
  main at 624342ebcf8a0c8c54f10d016f8185cdf7d89de8

PARENT AUTHORITY:
  EX2B1 installed / CLOSED
  BF3 vendor clarification authority installed

PROVIDER CONTACT:
  NONE

SDK LOAD / EXECUTION:
  NONE

SANDBOX / LIVE ACTIVATION:
  NOT AUTHORIZED

SOURCE IMPLEMENTATION:
  NOT AUTHORIZED
```

## 1. Purpose, scope, and precedence

This candidate freezes a source design for two distinct future seams:

1. **EX2B2-A:** server-side Eximbay `POST /v1/payments/ready` transport and
   strict response admission; and
2. **EX2B2-B:** a browser-safe, SDK v2 handoff that consumes only the admitted
   READY result and the exact EX2A/EX2B1 facts used for that request.

This document is governed by the
[Feature Documentation Standard](./feature-documentation-standard-v0.1.md),
the installed [EX2B1 Source Status](./eximbay-ex2b1-provider-order-ready-preparation-source-status-v0.1.md),
and the installed [BF3 vendor authority adjudication](./eximbay-bf3-vendor-clarification-authority-adjudication-v0.1.md).
The companion [Threat / Failure Model](./eximbay-ex2b2-ready-transport-sdk-handoff-threat-model-v0.1.md)
is part of this candidate.

Repository schema/source govern current local behavior. Installed adjudications
govern admitted external authority. Current official Eximbay documentation is
used only for facts re-observed on 2026-08-14. Conflicts remain explicit.

This task made no API request, did not fetch an SDK asset, did not use a
credential, and did not activate source or runtime.

## 2. Non-goals and non-authority

This candidate does not authorize or implement:

- source, schema, migration, configuration, dependency, or test changes;
- any request to `api-test.eximbay.com` or `api.eximbay.com`;
- loading, parsing, compiling, evaluating, or invoking the JavaScript SDK;
- `EXIMBAY.request_pay`;
- credential acquisition or use;
- sandbox, live, routing, customer, or merchant activation;
- callback/status ingress, verification, deduplication, completion, capture,
  refund, cancel, void, inquiry, or reconciliation;
- Eximbay webhook-first `Payment` fabrication; or
- proof of merchant capability, production SDK asset availability, READY
  retry safety, readyFgkey TTL, or readyFgkey replay safety.

## 3. Authority ledger

Current official pages re-observed, read-only, on 2026-08-14 were the
[payment integration preparation page](https://developer.eximbay.com/eximbay/payment_linkage/preparing-payment.html),
[JavaScript SDK reference](https://developer.eximbay.com/eximbay/api_sdk/javascript-sdk.html),
[REST API reference](https://developer.eximbay.com/eximbay/api_list/reference.html),
[PAYMENT flow](https://developer.eximbay.com/eximbay/payment_linkage/windows-consolidation.html),
[PAYER_AUTH flow](https://developer.eximbay.com/eximbay/payment_linkage/windows-authentication.html),
and [AUTHORIZE flow](https://developer.eximbay.com/eximbay/payment_linkage/windows-authorization.html).
The dedicated
[FGKey preparation page](https://developer.eximbay.com/eng/eximbay/payment_linkage/preparing-fgkey.html)
was also re-observed for the READY-versus-status FGKey distinction.
Only documentation pages on `developer.eximbay.com` were read. No API or SDK
asset origin was contacted. Documentation examples containing credential-like
values were not copied into this repository or used.

| Provider-specific statement | Basis | Disposition |
|---|---|---|
| JavaScript SDK generation is v2 | `DIRECT_VENDOR_COMMUNICATION + CURRENT_OFFICIAL_DOC` | admitted by BF3-VCL |
| REST/payment API family is v1 | `DIRECT_VENDOR_COMMUNICATION + CURRENT_OFFICIAL_DOC` | admitted by BF3-VCL |
| Test READY endpoint is `https://api-test.eximbay.com/v1/payments/ready` | `CURRENT_OFFICIAL_DOC + INSTALLED_REPOSITORY_AUTHORITY` | source-design constant only |
| Production READY endpoint is `https://api.eximbay.com/v1/payments/ready` | `CURRENT_OFFICIAL_DOC + INSTALLED_REPOSITORY_AUTHORITY` | source-design constant only |
| Exact test SDK source is `https://api-test.eximbay.com/v2/javascriptSDK.js` | `CURRENT_OFFICIAL_DOC + INSTALLED_REPOSITORY_AUTHORITY` | source-design constant only |
| Production SDK source is `https://api.eximbay.com/v2/javascriptSDK.js` | `DESIGN_CHOICE` already bounded by installed adjudication | `OFFICIAL_DOC_COMPOSITION_FOR_SOURCE_DESIGN`, not a direct exact-asset claim |
| READY response fields are `rescode`, `resmsg`, `fgkey` | `CURRENT_OFFICIAL_DOC` | all documented as required strings |
| Example READY success uses `rescode = "0000"` | `CURRENT_OFFICIAL_DOC + INSTALLED_REPOSITORY_AUTHORITY` | only exact accepted success code |
| READY `fgkey` (`readyFgkey` in this design) is generated by READY and must be passed unchanged to the SDK | `CURRENT_OFFICIAL_DOC` | admitted; EX2B2-owned and non-financial |
| Later `status_url` result `fgkey` (`statusFgkey` / `callbackFgkey` in this design) is newly generated from authorization-result data and is not the READY FGKey | `CURRENT_OFFICIAL_DOC` | BF4-owned; never compare it to `readyFgkey` |
| Payment Validation uses `/v1/payments/verify` for later status-result verification | `CURRENT_OFFICIAL_DOC` | BF4 evidence only; no source/runtime authority |
| SDK payload must match the preceding READY request | `CURRENT_OFFICIAL_DOC` | admitted |
| `return_url` can be absent after browser closure | `CURRENT_OFFICIAL_DOC` | admitted UX limitation |
| `status_url` is backend, may duplicate, and is the processing path described by the provider | `CURRENT_OFFICIAL_DOC` | observation only; implementation is BF4 |
| READY retry/idempotency semantics | `UNRESOLVED` | fail closed; no blind recontact |
| readyFgkey TTL, single-use, and replay semantics | `UNRESOLVED` | conservative ephemeral design |
| Merchant account/method/currency capability | `UNRESOLVED` | separate evidence/activation gate |

The current official PAYMENT, PAYER_AUTH, and AUTHORIZE flow pages retain the
installed conflict: their SDK-preparation snippets use v2, while later payment
page initiation snippets use v1. The v1 snippets remain observed and are not
silently converted into REST examples. Direct vendor clarification plus the
dedicated SDK and top-level preparation pages make v2 canonical for this
design; a materially contradictory later authority reopens this decision.

## 4. Current repository facts

| Fact | Classification | Evidence / consequence |
|---|---|---|
| EXIMBAY exists in `PaymentProvider` but its registry entry is disabled, with no allowed modes or methods | `OBSERVED_CURRENT_SOURCE` | `prisma/schema.prisma`; `src/lib/payment/providers/routing.ts`; no selection authority |
| Provider factories require registry/mode/live guards and credential checks | `OBSERVED_CURRENT_SOURCE` | `src/lib/payment/providers/factory.ts`; future Eximbay wiring must not bypass them |
| `Payment.mode` is durable `SANDBOX` or `LIVE` | `OBSERVED_CURRENT_SOURCE` | `prisma/schema.prisma`; attempt-local environment exists |
| `configuredPaymentMode()` reads `PAYMENT_MODE`, defaults to sandbox, and rejects other values | `OBSERVED_CURRENT_SOURCE` | `src/lib/payment/mode.ts`; config is an interlock, not an attempt rewrite |
| Payment initiation enters through authenticated `initiatePayment` server action | `OBSERVED_CURRENT_SOURCE` | `src/app/actions/payment.ts`; checkout ownership is checked before initiation |
| Initiation first persists `CONTACT_AUTHORIZED`, then separately marks `CONTACTED` and `contactStartedAt`, then calls the provider | `OBSERVED_CURRENT_SOURCE` | `src/lib/payment/attempt/initiate.ts` |
| A thrown provider initiation currently transitions `CONTACTED` to `OUTCOME_UNKNOWN` | `OBSERVED_CURRENT_SOURCE` | `markOutcomeUnknown` in `src/lib/payment/attempt/initiate.ts` |
| Existing lifecycle states include `CONTACT_AUTHORIZED`, `CONTACTED`, `OUTCOME_UNKNOWN`, `SUPERSEDED`, and terminal states | `OBSERVED_CURRENT_SOURCE` | `prisma/schema.prisma`; no new EX2B2 state is necessary |
| EX2B1 persists an immutable, provider-scoped `Payment.providerOrderId` and materializes READY with it | `INSTALLED_DOC_AUTHORITY + OBSERVED_CURRENT_SOURCE` | EX2B1 Source Status; `src/lib/payment/eximbay/ready.ts` |
| `materializeEximbayReadyRequest` exports deeply frozen `payment`, `merchant`, `buyer`, and `url` facts | `OBSERVED_CURRENT_SOURCE` | `src/lib/payment/eximbay/ready.ts` |
| EX2A projects READY and SDK payloads from one branded canonical fact object | `INSTALLED_DOC_AUTHORITY + OBSERVED_CURRENT_SOURCE` | `src/lib/payment/providers/eximbay/preparation.ts` |
| EX2A's pure SDK projection retains an opaque `EximbayProviderOrderCandidate`; it is not final persisted-wire authority | `INSTALLED_DOC_AUTHORITY + OBSERVED_CURRENT_SOURCE` | `types.ts`, `preparation.ts`, and EX2A Source Status; EX2B2 needs a trusted SDK wire materializer |
| The generic initiation provider input lacks READY facts and currently returns only ready/redirect/in-progress | `OBSERVED_CURRENT_SOURCE` | `src/lib/payment/providers/types.ts`; future slicing must split local preparation from contact |
| Durable READY re-entry reconstructs only generic `{ kind: "ready" }` plus optional providerRef and carries no readyFgkey/handoff | `OBSERVED_CURRENT_SOURCE` | `src/lib/payment/attempt/initiate.ts`; it must remain non-actionable for EX2B2 browser handoff |
| Existing HTTP code injects `fetch`, uses an abort timeout, rejects redirects, and bounds response bytes | `OBSERVED_CURRENT_SOURCE` | Toss lookup/refund HTTP seams; pattern may be reused after provider-specific review |
| Existing strict JSON code scans protected duplicate keys before `JSON.parse` | `OBSERVED_CURRENT_SOURCE` | Toss refund response scanner; source convention exists |
| Provider credentials are represented as server-side named requirements and presence checks | `OBSERVED_CURRENT_SOURCE` | `src/lib/payment/providers/credentials.ts`; no Eximbay requirement currently exists |
| Generic return UI polls same-origin local status and recognizes success only from persisted finalized payment/order evidence | `OBSERVED_CURRENT_SOURCE` | `src/app/(shop)/checkout/return/[checkoutSessionId]/PaymentReturnStatus.tsx`; `src/lib/payment/return-status.ts` |
| Generic webhook handling verifies, records, deduplicates, and delegates to completion; only Toss has a route | `OBSERVED_CURRENT_SOURCE` | `src/lib/payment/webhook/handle.ts`; `src/app/api/payments/toss/webhook/route.ts`; Eximbay ingress remains absent/BF4 |
| `providerRef` is written from initiate output; `providerPaymentKey` is written by capture/completion owners | `OBSERVED_CURRENT_SOURCE` | `src/lib/payment/attempt/initiate.ts`; `src/lib/payment/complete/record-capture.ts` |
| No payment browser SDK loader or relevant third-party-script CSP/header policy was found in the inspected baseline | `OBSERVED_CURRENT_SOURCE` | bounded `rg` reconnaissance across `src` and Next config; S3 must add an explicit loader/security review |
| Current checkout only exposes mock execution; external payment methods are disabled in UI | `OBSERVED_CURRENT_SOURCE` | `PaymentMethodSection.tsx`; source installation must not activate Eximbay |

## 5. Architecture and ownership

```text
authenticated server action
  -> durable Payment + EX2B1 providerOrderId
  -> local canonical facts and READY contact plan (no I/O)
  -> durable markContactStarted / CONTACTED
  -> EX2B2-A one transport attempt
  -> strict transport + protocol + business admission
  -> durable channel: READY output marker, never readyFgkey
  -> fresh continuation only: ephemeral trusted EX2B2-B handoff
  -> fixed-source SDK v2 loader
  -> EXIMBAY.request_pay attempted
  -> return UX observes only local durable status

status_url / callback verification / financial completion
  -> BF4, separate
```

EX2B2-A and EX2B2-B are separate seams. Server contact can never be initiated
by a browser-supplied endpoint, mode, request body, SDK URL, or merchant fact.
The browser can never receive the API key or Authorization header. The browser
handoff cannot create financial truth.

## 6. Mandatory decisions

### D1 — environment owner: `ADOPT_WITH_BOUNDARY`

The persisted `Payment.mode` owns the environment of an existing attempt.
Server configuration is a fail-closed deployment/credential interlock and must
equal that mode before contact; it must never rewrite the attempt. Route input,
browser input, URL, cookie, GeoIP, current Market, and current Locale are
rejected as environment selectors.

```text
Market != Locale != Payment.mode
Payment.mode -> endpoint + credential binding + SDK source
configured mode mismatch -> no contact / no handoff
```

### D2 — exact READY endpoint: `ADOPT_WITH_BOUNDARY`

Future source may generate only these constants from trusted `Payment.mode`:

```text
SANDBOX -> https://api-test.eximbay.com/v1/payments/ready
LIVE    -> https://api.eximbay.com/v1/payments/ready
```

No arbitrary origin/path injection, redirect following, or browser override is
allowed. This freezes source design, not contact authority.

### D3 — credential ownership: `ADOPT_WITH_BOUNDARY`

Extend the existing server-only provider credential/config seam for Eximbay
ACTION_ADAPTER capability. It must resolve an environment-bound API key and
MID on the server, expose only presence/binding metadata to generic guards,
and give the secret only to the transport constructor. The key, Basic header,
and raw secret-bearing configuration never enter browser serialization,
errors, logs, analytics, return URLs, or the handoff package. Exact environment
variable names and all values are deferred to S2 review; no value is invented
here.

### D4 — contact lifecycle ordering: `ADOPT`

No new durable state is required. Future source must split local preparation
from contact so the exact order is:

1. authenticate and authorize checkout ownership;
2. persist/reuse `CONTACT_AUTHORIZED` Payment and its providerOrderId;
3. load canonical EX2A facts and EX2B1 trusted persisted binding;
4. materialize and fully validate the immutable READY request;
5. resolve mode-bound endpoint/credential and serialize a bounded contact plan,
   with no network I/O;
6. on any step 1–5 failure, leave the attempt uncontacted
   `CONTACT_AUTHORIZED` (or create no Payment when failure precedes it);
7. durably execute `markContactStarted`, producing `CONTACTED` and
   `contactStartedAt`;
8. only then execute exactly one transport call from the frozen plan;
9. admit only a fully parsed 2xx exact provider-defined non-success result as
   `FAILED + TERMINAL_FAILURE` with `blockingEndedAt`, and only when its final
   semantic is complete;
10. admit a valid READY success as durable `CONTACTED` plus
    `initiationOutputKind = READY`, while keeping `readyFgkey` out of durable
    generic initiation metadata;
11. only that fresh successful continuation may return the transient trusted
    browser handoff; and
12. classify timeout, reset, possible send, response loss, oversized/malformed
    response, unrecognized status, or persistence loss after contact as
    `OUTCOME_UNKNOWN`, without automatic recontact.

`CONTACTED` remains correct after a valid READY response because READY is not
financial completion. No new `Payment.attemptLifecycle` state is required:

```text
CONTACTED + initiationOutputKind is null:
  provider contact is in progress or no admitted READY is durably known

OUTCOME_UNKNOWN:
  READY outcome is ambiguous

CONTACTED + initiationOutputKind = READY on re-entry:
  READY metadata is durable, but no ephemeral handoff is assumed available
  -> explicit non-actionable HANDOFF_UNAVAILABLE semantic

fresh request continuation holding admitted readyFgkey:
  may return the transient handoff after the durable READY write succeeds
```

Ephemeral availability is not a durable lifecycle fact. Deterministic re-entry
comes from the durable READY marker plus the absence of a fresh trusted
handoff, so adding a state only for observability would be incorrect.

### D5 — READY request identity: `ADOPT`

The transport consumes the exact frozen output of
`materializeEximbayReadyRequest`. It may not reconstruct any field from the
browser, mutable cart, current price, current Market/Locale, or return route.

```text
payment.order_id = persisted Payment.providerOrderId
```

The request body is serialized once from the admitted object. Final SDK wire
materialization must reuse the same canonical facts and the same non-forgeable
persisted binding authority; the pure opaque-candidate projection alone is not
enough. No client recomputation is allowed.

### D6 — retry and ambiguity: `ADOPT_WITH_BOUNDARY`

| Failure boundary | Durable result | Recontact rule |
|---|---|---|
| provable local failure before step 7 | `CONTACT_AUTHORIZED`, no `contactStartedAt` | same Payment may re-enter after correction |
| fully admitted 2xx JSON with exact provider-defined non-success result | `FAILED / TERMINAL_FAILURE` only when that result semantic is exact and complete | no same-attempt recontact; later new attempt only under normal session rules |
| malformed but definitely received response | `OUTCOME_UNKNOWN` | no automatic recontact |
| timeout/reset/possible send/response loss | `OUTCOME_UNKNOWN` | no automatic recontact |
| HTTP 3xx, 4xx, 429, 5xx, or any status without admitted provider business finality | `OUTCOME_UNKNOWN` | no automatic recontact |

No READY idempotency primitive or retry guarantee is admitted. A generic
"retryable" provider label must not cause a second READY call.

### D7 — response byte/media/JSON admission: `ADOPT`

Future S1 source must freeze:

- maximum body: 64 KiB, enforced while streaming even without
  `Content-Length`;
- HTTP: only 2xx enters JSON admission; after durable contact begins, 3xx,
  4xx, 429, and 5xx all become `OUTCOME_UNKNOWN` by default because status
  alone does not prove provider-side no-effect finality;
- media type: `application/json`, optionally with UTF-8 charset only;
- encoding: fatal UTF-8 decode;
- JSON: exactly one root object, no trailing data, and
  duplicate root `rescode`, `resmsg`, or `fgkey` rejected before `JSON.parse`;
- unknown fields: allowed but ignored after the allowlisted projection;
- `rescode`, `resmsg`: required strings; `fgkey`: required string for success;
- missing/wrong primitive types: rejected;
- strings admitted to diagnostics or handoff: non-empty where required, no NUL
  or Unicode control category, no normalization, and bounded by the total body;
- readyFgkey-specific defense-in-depth bound: 1–4096 UTF-8 bytes; no unsupported
  hex/length semantic is invented.

The 64 KiB ceiling, exact root/object admission, required primitive checks,
and protected duplicate-key policy are the frozen parser protections. No
provider nesting requirement is invented; any parser implementation limit is
for the later source task to justify and test. Existing strict HTTP and
duplicate-key scanner conventions are reusable patterns, not blanket webhook
trust rules.

### D8 — provider result admission: `ADOPT_WITH_BOUNDARY`

The official READY reference directly documents required string fields
`rescode`, `resmsg`, and `fgkey`, and shows `0000` in its success response.
Admission layers remain separate:

```text
transport success: 2xx + admitted media/bytes
protocol success: exact JSON shape and safe primitives
provider business success: rescode === "0000"
readyFgkey admission: provider success + admitted nonempty fgkey
financial payment success: OUTSIDE EX2B2
```

Any non-`0000` result is not success. It may become a definite terminal
business rejection only when the 2xx response is fully admitted and exact
provider authority makes that result's final semantic complete. Otherwise it
is `OUTCOME_UNKNOWN`. Unknown or malformed codes do not become success. This
restrictive rule is sufficient for a future source candidate; broader
result-code taxonomy remains deferred.

### D9 — FGKey ownership: `ADOPT_WITH_BOUNDARY`

This design uses semantic names while preserving provider wire field `fgkey`:

```text
readyFgkey:
  fgkey returned by POST /v1/payments/ready
  EX2B2-owned, non-financial, passed unchanged to its SDK handoff

statusFgkey / callbackFgkey:
  fgkey in later status_url authorization-result data
  newly generated from that result data per current official documentation
  BF4-owned and not assumed equal to readyFgkey
```

`readyFgkey` is not the API key, `Payment.providerOrderId`, `providerRef`,
`providerPaymentKey`, a handoff identity, or financial evidence. It is held
ephemerally in the fresh server action continuation and returned once in the
browser-safe package. It is not persisted, logged, placed in URLs, errors,
analytics, cookies, local/session storage, or HTML metadata. It must not be
persisted for future BF4 comparison. BF4 must not compare `statusFgkey` to
`readyFgkey` as an authenticity test, and EX2B2 must not treat `statusFgkey`
as READY/SDK handoff material.

There is no automatic reissue or recontact after page loss. A page controller
may defensively prevent duplicate invocation, but malicious-client replay
cannot be claimed impossible. TTL, reuse, and replay remain unresolved.

### D10 — two-channel browser handoff: `ADOPT_WITH_BOUNDARY`

The semantic representation is **Option B: an adjacent transient handoff
wrapper around the durable generic `PaymentInitiateResult`**. Exact future type
and helper names remain provisional. Persistence maps only the durable branch;
the transient branch exists only in the fresh successful continuation:

```text
Initiation service result
  durable:
    generic READY marker and already-governed non-secret metadata
  transientHandoff?:
    EximbayReadyHandoffV1, present only in the fresh admitted continuation
```

The durable channel may store `initiationOutputKind = READY`,
`initiationCompletedAt`, and a real providerRef only if independently
justified. It must never store `readyFgkey`, an SDK package, API key, or
Authorization header. Generic durable `{ kind: "ready" }` is not an actionable
browser handoff.

The server-authoritative handoff is created only after valid READY admission
and a successful durable READY output update:

```text
EximbayReadyHandoffV1 {
  kind: "EXIMBAY_READY_HANDOFF_V1"
  paymentId: Payment.id
  mode: Payment.mode
  sdkGeneration: "v2"
  payload: final trusted SDK wire materialization
}
```

The SDK URL is not serialized as arbitrary data; the loader maps the package's
closed `mode` enum to compile-time constants. Before issuance, source rechecks
that the Payment is the same non-superseded EXIMBAY attempt, mode and
providerOrderId still match, lifecycle is `CONTACTED`, and READY output is
durable. Final SDK wire materialization consumes the same canonical EX2A facts,
the same non-forgeable `TrustedEximbayProviderOrderBinding` authority used by
READY, and the admitted `readyFgkey`. It emits the exact persisted
`Payment.providerOrderId` as `payment.order_id`.

The existing pure `projectEximbaySdk(facts, fgkey)` is historical installed
EX2A projection behavior. It retains the opaque provider-order candidate and
is not final persisted-wire SDK authority by itself. Future EX2B2 source must
add a trusted SDK wire materializer or a shared trusted persisted-wire
projection with provenance equivalent to the installed EX2B1 binding. An
ordinary structurally shaped READY object is not trusted input, and callers
cannot nominate persistence provenance.

Before serialization, the server may use frozen structures against accidental
mutation. After delivery, the browser copy is untrusted client-controlled data.
Browser `Object.freeze` or deep-freeze is optional defense in depth, not a
security authority or proof against malicious tampering. Correctness derives
from server-owned Payment/mode/facts, non-forgeable persisted binding, provider
READY/SDK parity, and later BF4 backend truth.

A separate token is `REJECT`: it cannot prevent a client from directly calling
an already loaded third-party SDK and would add unverifiable state. Payment ID
plus authenticated server ownership is sufficient for local correlation; no
handoff value is financial ingress.

If durable READY exists but the original transient handoff is absent, the
service returns an explicit non-actionable semantic such as
`CONTACTED_READY_WITHOUT_HANDOFF` / `HANDOFF_UNAVAILABLE`. It must not
reconstruct `readyFgkey`, contact READY again automatically, call
`request_pay`, expose generic READY as actionable, or replace the same
Payment's providerOrderId. Normal re-entry cannot recover the handoff. A future
recovery contract may consider bounded protected storage, provider-supported
inquiry/recovery, or a new attempt/remediation path; D1R chooses none.

### D11 — READY/SDK equality: `ADOPT_WITH_BOUNDARY`

```text
FINAL READY WIRE:
  canonical EX2A facts
  + non-forgeable TrustedEximbayProviderOrderBinding
  -> payment.order_id = persisted Payment.providerOrderId

FINAL SDK WIRE:
  same canonical EX2A facts
  + same non-forgeable persisted-binding authority
  + admitted readyFgkey
  -> payment.order_id = the identical persisted Payment.providerOrderId
```

The browser may not rebuild or merge fields. Future tests must compare actual
final READY and SDK wire payloads and prove exact equality for every
provider-required shared field, with SDK adding only `readyFgkey` and any
provider-documented SDK-only structure. At minimum, SDK wire
`payment.order_id` must equal both the READY wire string and persisted
`Payment.providerOrderId`; an opaque candidate or reconstructed client value
must fail.

### D12 — SDK source: `ADOPT_WITH_BOUNDARY`

```text
canonical generation: v2
SANDBOX exact source: https://api-test.eximbay.com/v2/javascriptSDK.js
LIVE source:          https://api.eximbay.com/v2/javascriptSDK.js
LIVE classification: OFFICIAL_DOC_COMPOSITION_FOR_SOURCE_DESIGN
```

The production string composes the official production origin with the
canonical v2 path; it is not a directly quoted/documented exact production
asset. Only a closed mapping from trusted Payment mode is allowed.

### D13 — SDK loader lifecycle: `ADOPT`

One document-global loader owns:

```text
NOT_LOADED -> LOADING -> AVAILABLE
                    \-> FAILED
```

- concurrent same-mode callers share one promise and one script element;
- an in-flight/available/failed opposite-mode loader, pre-existing unowned
  Eximbay script element, or pre-existing `EXIMBAY` global fails closed;
- no cross-environment replacement/removal is attempted; full document
  navigation is required;
- `load` becomes `AVAILABLE` only when the loader-owned exact source loaded and
  the expected callable global exists;
- timeout, error, missing global, unmount, or route transition cancels the
  component handoff and prevents invocation;
- one in-memory invocation latch prevents double click/concurrent
  `request_pay`; a synchronous throw consumes that handoff and is not retried;
- any browser freezing is defensive only; serialized package data and the
  global are untrusted after delivery;
- a load event or available global is browser readiness only, never payment
  readiness or financial success.

S3 must include a focused CSP/security-header decision before allowing the
third-party source; absence of a current CSP is not permission.

### D14 — `request_pay` authority: `ADOPT_WITH_BOUNDARY`

A non-throwing call proves at most `BROWSER_HANDOFF_ATTEMPTED`. A synchronous
throw proves only an attempted browser handoff failure. Neither event proves
authorization, capture, completion, paid order, callback authenticity, or
provider state. Browser callbacks may update UX only and never call completion
with browser-authored financial facts.

### D15 — `return_url`: `ADOPT`

`return_url` is navigation/UX evidence and can be absent. Its parameters are
untrusted. The existing generic return page remains provider-neutral and reads
only authenticated, same-origin, local durable status; it never starts a new
payment and recognizes success only from finalized Payment/Order evidence.

### D16 — `status_url` / BF4: `DEFER`

EX2B2 carries the already installed canonical `status_url` value only because
it is part of READY/SDK equality. Callback ingress, raw-body custody,
authentication/verification, replay, duplicate handling, correlation,
acknowledgement, ordering, completion, and callback-first behavior are BF4.
BF4 must preserve the EX2B1 ban on webhook-first Eximbay Payment fabrication.
The later `statusFgkey` / `callbackFgkey` and `/v1/payments/verify` belong to
that BF4 evidence boundary; they are not READY handoff inputs and create no
current verification or completion authority.

### D17 — identity separation: `ADOPT`

| Value | Owner / meaning | Persistence in EX2B2 |
|---|---|---|
| `Payment.id` | Mira payment attempt | existing durable |
| `Payment.providerOrderId` | merchant-created Eximbay order identity | existing durable, immutable |
| `Payment.idempotencyKey` | local/initiate operation identity | existing durable; not asserted as READY provider idempotency |
| `readyFgkey` (wire `fgkey`) | provider-issued READY-to-SDK validity value | ephemeral EX2B2 channel only |
| `statusFgkey` / `callbackFgkey` (wire `fgkey`) | newly generated later status-result value | BF4-owned; never compared with readyFgkey |
| handoff package | browser delivery envelope | ephemeral only |
| `Payment.providerRef` | generic provider pre-capture reference | not written by readyFgkey/handoff |
| `Payment.providerPaymentKey` | final provider payment identity | not written by EX2B2 |

### D18 — observability/redaction: `ADOPT`

Allowed structured fields are Payment ID, provider, mode, phase, monotonic
duration, bounded outcome class, safe HTTP status, safe provider result class,
response byte count, and redacted request/correlation ID if later documented.

Prohibited are API keys, Authorization, ready/status FGKeys, full buyer name/email/address,
raw request or response, canonical body, SDK payload, cookies, session tokens,
URLs containing user data, and provider messages before control/length
admission. `resmsg` is not logged by default; map it to a bounded internal
class. Error objects crossing the action boundary contain public categories
only.

### D19 — failure ownership: `ADOPT`

The normative failure matrix is in section 7 and the companion threat model.
Server failures never become browser financial truth; browser failures never
rewrite durable provider contact state; BF4 failures remain deferred.

### D20 — rollback/recovery: `ADOPT`

- installed source stays inert while registry/routing remains disabled;
- bad config fails before contact where provable, otherwise preserves
  `OUTCOME_UNKNOWN`;
- provider outage or ambiguous READY never triggers blind recontact;
- SDK outage/regression leaves durable contact evidence untouched;
- partial/lost handoff preserves durable READY/contact evidence, returns a
  non-actionable handoff-unavailable result, and does not persist, reconstruct,
  log, or mint another readyFgkey;
- source rollback never deletes Payment/contact evidence;
- operators may not mutate `providerOrderId`, clear `contactStartedAt`, bypass
  `OUTCOME_UNKNOWN`, or relabel browser evidence as payment success.

Recovery requiring provider inquiry, recontact, or new merchant facts needs a
separately reviewed design/evidence gate.

### D21 — routing and activation: `ADOPT`

EXIMBAY remains disabled in the provider registry after any future source-only
installation unless a separate authorization changes it. Sandbox contact,
live contact, merchant enablement, and customer availability are four separate
gates. No generic fallback may switch an already contacted Eximbay attempt to
another provider.

### D22 — implementation sequence: `ADOPT_WITH_BOUNDARY`

1. **EX2B2-S1:** deterministic contact-plan construction, strict READY response
   scanner/parser/admission, and trusted final SDK-wire materializer semantics
   using persisted-order binding authority; injected fake transport,
   behavioral tests, zero external network.
2. **EX2B2-S2:** install server HTTP/config/credential seams and split
   pre-contact plan construction from post-`markContactStarted` execution;
   EXIMBAY routing remains disabled and ordinary tests inject fetch.
3. **EX2B2-S3:** install two-channel initiation integration, the ephemeral
   browser-safe package, trusted persisted-order SDK materialization, fixed v2
   loader, one-shot invocation controller, CSP decision, and mocked loader/SDK
   tests; real SDK load remains absent.
4. **EX2B2-E1A:** separately authorized bounded READY transport evidence only;
   one/few test READY contacts, no SDK requirement, `request_pay`, BF4, or
   transaction completion.
5. **EX2B2-E1B:** separately authorized, independently justified,
   non-completing SDK load/global/browser-surface evidence only; it does not
   authorize a payment-producing `request_pay` exercise.
6. **BF4:** install/review status URL verification, correlation, duplicate
   handling, and completion prerequisites in its separate track.
7. **EX2B2-E2:** separately authorized end-to-end sandbox transaction only
   after BF4 prerequisites are reviewed and installed.

S1 may define the transport port and parser without altering the current
generic initiation contract. S2 must perform the actual lifecycle integration
because current `provider.initiate()` begins only after `markContactStarted`;
local plan construction must be hoisted ahead of that boundary. No slice is
authorized by this candidate.

## 7. Failure matrix

| Failure/event | Owner | Durable Payment state | User category | Retry/re-entry | Operator evidence | Provider contacted? |
|---|---|---|---|---|---|---|
| pre-contact validation | server | none or `CONTACT_AUTHORIZED` | unavailable / terms changed | same attempt only after correction | phase + safe code | no |
| credential unavailable | server config | none or `CONTACT_AUTHORIZED` | provider unavailable | after config correction, before contact | missing binding name, never value | no |
| transport construction/serialization | server | `CONTACT_AUTHORIZED` | provider unavailable | same attempt after source/config correction | phase + safe code | no |
| connection failure after contact mark | transport | `OUTCOME_UNKNOWN` | outcome unresolved | no automatic recontact | mode/status/duration | may have been |
| timeout | transport | `OUTCOME_UNKNOWN` | outcome unresolved | no automatic recontact | timeout class/duration | may have been |
| 3xx/4xx/429/5xx | transport | `OUTCOME_UNKNOWN` by default | outcome unresolved | no automatic recontact | HTTP class | yes |
| body too large/content type/UTF-8/JSON failure | parser | `OUTCOME_UNKNOWN` | outcome unresolved | no automatic recontact | failure class + byte count | yes |
| fully admitted 2xx exact provider business rejection | admission | `TERMINAL_FAILURE / FAILED` only with exact complete semantics | payment could not start | no same-attempt contact | safe result class | yes |
| readyFgkey missing/unsafe | admission | `OUTCOME_UNKNOWN` | outcome unresolved | no automatic recontact | `FGKEY_REJECTED`, no value | yes |
| durable READY write failure after admitted READY | server | `OUTCOME_UNKNOWN` | outcome unresolved | no recontact | phase/payment ID | yes |
| durable READY exists but transient handoff creation/delivery is lost | server/browser boundary | unchanged `CONTACTED + READY` | handoff unavailable / recovery required | non-actionable; no READY recontact or request_pay | Payment ID + durable READY, no readyFgkey | yes, READY |
| generic durable READY re-entry without original transient handoff | initiation service | unchanged `CONTACTED + READY` | handoff unavailable / recovery required | must not masquerade as actionable READY | durable Payment metadata only | yes, prior READY |
| SDK load timeout/error | browser loader | unchanged `CONTACTED + READY` | payment window unavailable | no automatic READY/SDK retry | safe browser phase | yes, READY only |
| SDK global missing/stale/cross-mode | browser loader | unchanged | payment window unavailable | full navigation; no recontact | loader provenance class | yes, READY only |
| `request_pay` synchronous failure | browser | unchanged | payment window unavailable | handoff consumed; no automatic retry | safe invocation class | yes, READY only |
| user closes/abandons | browser | unchanged | processing/unresolved | local-status observation only | none or safe UX event | yes, READY; payment-page state unknown |
| browser navigation/package lost | browser | unchanged `CONTACTED + READY` | handoff unavailable / processing | no readyFgkey recovery/recontact | durable Payment/contact only | yes, READY |
| `return_url` reached | browser UX | unchanged until backend truth | checking payment | poll local status | local authenticated read | provider flow occurred, financial unknown |
| `status_url` first/later/duplicate | BF4 | EX2B2 makes no transition | checking payment | BF4 only | BF4 evidence only | yes |

## 8. Threat/failure invariants

The companion model freezes these invariants:

1. secret material remains server-only;
2. Payment mode selects all environment-bound assets and credentials;
3. no provider bytes precede durable contact authority;
4. ambiguous READY contact is never blindly repeated;
5. final READY and SDK wire payloads share canonical facts and the same
   non-forgeable persisted-order binding authority;
6. durable initiation metadata and transient readyFgkey handoff are separate;
7. readyFgkey, statusFgkey, and all durable identities remain distinct;
8. browser events cannot create financial success;
9. callback/completion stays in BF4; and
10. source installation cannot activate Eximbay.

## 9. D1R review-correction closure table

| Finding | Severity | Corrected disposition |
| --- | --- | --- |
| EX2B2-D1R-B01 | BLOCKER | `CLOSED_BY_CORRECTED_DESIGN` — final SDK wire must consume the same non-forgeable persisted-order binding as READY and emit persisted `Payment.providerOrderId`; pure `projectEximbaySdk` alone is prohibited as final authority. |
| EX2B2-D1R-B02 | BLOCKER | `CLOSED_BY_CORRECTED_DESIGN` — durable READY metadata is separate from the fresh transient readyFgkey handoff; lost/re-entered handoff is explicitly non-actionable and cannot recontact READY or invoke the SDK. |
| EX2B2-D1R-I01 | IMPORTANT | `CLOSED_BY_CORRECTED_DESIGN` — readyFgkey is EX2B2-owned; newly generated statusFgkey is BF4-owned, never compared to readyFgkey, and `/v1/payments/verify` remains BF4 evidence only. |
| EX2B2-D1R-I02 | IMPORTANT | `CLOSED_BY_CORRECTED_DESIGN` — E1A is READY-only, E1B is non-completing SDK-surface evidence, and E2 end-to-end sandbox is gated after BF4 readiness. |
| EX2B2-D1R-I03 | IMPORTANT | `CLOSED_BY_CORRECTED_DESIGN` — every post-contact 3xx/4xx/429/5xx is `OUTCOME_UNKNOWN` unless later exact provider authority proves a narrower final semantic. |
| EX2B2-D1R-I04 | IMPORTANT | `CLOSED_BY_CORRECTED_DESIGN` — browser serialization is untrusted; freezing is accidental-mutation defense only, never authority. |
| EX2B2-D1R-M01 | MINOR | `CLOSED_BY_CORRECTED_DESIGN` — the unsupported nesting promise is removed; the exact byte/root/primitive/duplicate-key contract remains. |

## 10. Unresolved authority gaps and stop conditions

The following are not design blockers because the design fails closed, but
they block broader runtime/recovery claims:

- readyFgkey TTL, single-use, replay, and page-loss recovery;
- provider READY idempotency/retry semantics;
- full result-code taxonomy beyond exact `0000` acceptance;
- directly documented exact production SDK asset availability;
- merchant/account method and currency enablement;
- production CSP/connectivity requirements;
- status callback authentication, ordering, duplicates, and completion;
- operator inquiry/reconciliation semantics after ambiguous READY.

Stop source work if current official authority materially contradicts SDK v2,
REST v1, environment origins, READY fields, or READY/SDK parity. Stop runtime
work if any merchant capability, credential binding, asset availability, or
recovery claim is unproven.

## 11. Adversarial self-audit

| # | Question | Result | Closure |
|---|---|---|---|
| 1 | Can browser input change endpoint/environment/SDK URL/payment facts? | `CLOSED_BY_DESIGN` | closed mappings + server canonical facts and persisted binding |
| 2 | Can API credentials reach browser/log/error/analytics/URL? | `CLOSED_BY_DESIGN` | server-only seam + explicit exclusions |
| 3 | Can ambiguous READY cause blind second contact? | `CLOSED_BY_DESIGN` | `OUTCOME_UNKNOWN`, no automatic recontact |
| 4 | Can request_pay or return mark paid? | `CLOSED_BY_DESIGN` | local finalized evidence only |
| 5 | Can stale test/live SDK global cross environments? | `CLOSED_BY_DESIGN` | loader provenance/cross-mode failure |
| 6 | Can mutable cart/Market/Locale rewrite after READY? | `CLOSED_BY_DESIGN` | canonical facts and the same persisted binding are reused |
| 7 | Can readyFgkey/statusFgkey become providerRef/providerPaymentKey or each other? | `CLOSED_BY_DESIGN` | namespace and persistence rules forbid conflation |
| 8 | Can double click create two READY/handoffs? | `CLOSED_BY_DESIGN` | DB contact claim + shared loader + invocation latch |
| 9 | Can superseded Payment remain invokable? | `CLOSED_BY_DESIGN` | pre-issue durable recheck; contacted attempt cannot supersede |
| 10 | Can callback-first fabricate Eximbay Payment? | `DEFERRED_WITH_FAIL_CLOSED_BOUNDARY` | BF4 must retain EX2B1 prohibition; no EX2B2 ingress |
| 11 | Can fallback switch a contacted Eximbay attempt? | `CLOSED_BY_DESIGN` | Payment-bound provider; no rerouting after contact |
| 12 | Can raw response/buyer data leak logs? | `CLOSED_BY_DESIGN` | allowlisted observability only |
| 13 | Can installation activate Eximbay? | `CLOSED_BY_DESIGN` | registry remains disabled; gates separate |
| 14 | Does design depend on merchant capability? | `DEFERRED_WITH_FAIL_CLOSED_BOUNDARY` | capability required before E1/activation |
| 15 | Does any section silently solve BF4? | `CLOSED_BY_DESIGN` | D16 and matrix explicitly defer it |

```text
BLOCKER open:
  0

IMPORTANT open:
  0

MINOR open:
  0

DEFERRED_WITH_FAIL_CLOSED_BOUNDARY:
  2 self-audit boundaries
  + unresolved provider/product facts listed in section 10
```

## 12. Candidate verdict

```text
EX2B2 DESIGN HUMAN CLOSURE PASSED
— READY FOR DOCUMENTATION INSTALLATION
```

This verdict concerns documentation installation readiness only. It is not source,
provider-contact, SDK, sandbox, live, customer, or financial authority.
