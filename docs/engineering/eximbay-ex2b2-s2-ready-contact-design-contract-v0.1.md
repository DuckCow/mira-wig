# Eximbay EX2B2-S2 — READY Contact Design Contract v0.1

## Status

```text
DOCUMENT CLASS:
  DESIGN CONTRACT

RISK CLASS:
  HIGH — PAYMENT / EXTERNAL PROVIDER CONTACT CAPABILITY

SCOPE:
  EX2B2-S2 only

TASK CLASSIFICATION:
  DOCUMENTATION_ONLY / DESIGN

CURRENT DOCUMENT STATUS:
  HUMAN-ADJUDICATED / FINAL INDEPENDENT DESIGN CLOSURE PASS
  READY FOR DOCUMENTATION INSTALLATION

SOURCE IMPLEMENTATION:
  NOT INSTALLED / NOT AUTHORIZED BY DOCUMENT EXISTENCE ALONE

PROVIDER CONTACT:
  NONE

ROUTING:
  DISABLED / UNCHANGED

SANDBOX/LIVE/CUSTOMER ACTIVATION:
  NONE

REPOSITORY BASELINE:
  main at 827ee34e461b0f90668f564239604ed10a59d282
```

## 1. Purpose, scope, and non-authority

This contract freezes the application-owned canonical-fact, configuration,
credential, pre-contact freshness, HTTP transport, contact-lifecycle, and
durable/transient READY rules for EX2B2-S2. S2 is the dormant server seam
between the installed deterministic S1 READY kernel and later, separately
authorized S3 and BF4 work.

This document installs no source behavior. It does not authorize:

- source, schema, migration, test, dependency, runtime-configuration-value, or
  CI changes;
- any Eximbay API request, credential use, SDK load or execution, or
  `EXIMBAY.request_pay` call;
- EXIMBAY registry, routing, factory, method, currency, mode, or live-allowlist
  activation;
- sandbox, live, merchant, customer, or payment-producing evidence activity;
- a status route, callback verification, acknowledgement, correlation,
  completion, Order, ManufacturingRequest, outbox, reconciliation, refund, or
  void behavior; or
- S2 source implementation merely because this document exists.

After an independently reviewed merge, this document becomes the governing S2
Design Contract for one separately issued, baseline-bound Implementation Task
Contract. That later task receives no standing authority beyond its exact
scope.

## 2. Precedence and change control

This contract:

1. is subordinate to the
   [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md);
2. specializes the installed
   [EX2B2 READY Transport + JavaScript SDK Browser Handoff Design Contract v0.1](./eximbay-ex2b2-ready-transport-sdk-handoff-design-contract-v0.1.md)
   for S2;
3. remains governed by the installed
   [EX2B2 Threat / Failure Model v0.1](./eximbay-ex2b2-ready-transport-sdk-handoff-threat-model-v0.1.md);
4. relies on the installed EX2A and EX2B1 design/source-status authorities,
   BF2 evidence/adjudication authority, and
   [EX2B2-S1 Source Status v0.1](./eximbay-ex2b2-s1-ready-kernel-source-status-v0.1.md);
5. does not rewrite, supersede, or broaden installed S1 source; and
6. freezes new S2 application-owned provenance, configuration, transport, and
   lifecycle policy only.

Repository schema and source remain the authority for current installed
behavior. This contract cannot be used to infer that S2 source, operation,
provider evidence, or activation exists. Semantic changes require a new
version and explicit change control; the parent v0.1 contract and closed S1
source must not be edited in place to accommodate them.

## 3. Closed design provenance

The human-adjudicated source for these rules was the exact review packet:

```text
packet:
  WIG_PAY_EXIM_EX2B2_S2_D0_REVIEW_v0_2.zip

bytes:
  30088

SHA-256:
  7c1c9d8e3eb42d0f048d1f57cf2e738e0c0a041eca3ddd09c5dbfd63d68fe6c5

entries:
  10 regular files

final independent closure:
  EX2B2-S2-D0 FINAL INDEPENDENT CLOSURE — PASS

BLOCKER:
  0

IMPORTANT:
  0

MINOR:
  0

D0R-I01:
  CLOSED

HUMAN POLICY ADJUDICATION:
  COMPLETE
```

The packet is review provenance, not a runtime dependency. Every normative
rule needed after merge is restated in this repository document; no
`/private/tmp` artifact is required to understand it.

## 4. Slice ownership

```text
S1:
  installed deterministic READY kernel
  strict response admission
  trusted exact-plan/exact-success provenance
  trusted SDK-wire materializer

S2:
  dormant server canonical facts
  config and credential custody
  pre-contact freshness and exact contact claim
  one HTTP transport attempt
  conservative lifecycle persistence
  same-continuation internal authority retention

S3:
  two-channel public initiation integration
  browser-safe ephemeral handoff
  trusted SDK-wire materialization at the browser-delivery boundary
  SDK loader and EXIMBAY.request_pay

BF4:
  status ingress and raw custody
  verification/authentication
  duplicates, ordering, correlation, and acknowledgement
  financial completion
```

S2 must not broaden S1 into a database or configuration owner, move S3 browser
behavior into S2, or implement any BF4 behavior.

## 5. Canonical purchaser identity

For an authenticated, owned CheckoutSession, purchaser facts are:

```text
buyerName:
  authenticated owned CheckoutSession -> canonical User.name

buyerEmail:
  authenticated owned CheckoutSession -> canonical User.email

shipping CheckoutSessionShipping.recipientName:
  NEVER a buyerName fallback
```

`User.name` is the account/display purchaser identity for this integration. It
is not legal-identity proof and is not cardholder-name proof.

Immediately before the contact claim, S2 reloads the canonical owner User. A
null, blank, whitespace-invalid, control-bearing, or otherwise invalid
canonical `User.name` rejects before `CONTACTED` with zero provider bytes. A
missing or invalid canonical `User.email` has the same result. S2 never repairs
either value by substituting the shipping recipient.

### 5.1 Account and activation boundary

The initial supported account-creation path is Google OAuth only. At the
baseline of this contract, normalized-nonblank `User.name` persistence for
every payment-eligible Google user is not proven: `User.name` is nullable and
the installed auth path has no reviewed normalization/nonblank admission
invariant.

A separate payment-time purchaser-name UI is not mandatory if a later reviewed
account-creation invariant proves normalized nonblank `User.name` persistence
for every payment-eligible user. Any future first-party/direct registration
path must require and persist a normalized nonblank purchaser name before
payment eligibility.

Customer activation remains blocked until the supported account path proves
that invariant or a reviewed purchaser-name correction/collection path exists.
S2 source implementation may proceed while customer activation remains
blocked, but S2's own canonical reload and fail-closed defense remains
mandatory even after the account invariant is proven.

## 6. Language and payment method

Initial payment-page language is a market-default policy:

```text
CheckoutSession.marketCode == "JP"
  -> payment.lang = "JP"

CheckoutSession.marketCode == "US"
  -> payment.lang = "EN"

other market
  -> reject before contact
```

This is not shopper/storefront-locale parity. Browser locale, storefront
locale, cookie, URL, `Accept-Language`, GeoIP, and current navigation context
cannot change it. A future durable payment-locale snapshot is deferred; S2
adds no schema field for it.

The only admitted method mapping is:

```text
server-validated generic CARD
  -> P000

PAYPAL_WALLET / MOCK / unknown / raw provider code /
omitted production CARD
  -> reject before contact
```

The mapping does not prove that a merchant/account is enabled for P000 or any
currency. Capability remains a separate evidence and activation gate.

## 7. Environment, configuration, and credential custody

The repository configuration names are frozen as:

```text
EXIMBAY_SANDBOX_API_KEY
EXIMBAY_SANDBOX_MID
EXIMBAY_LIVE_API_KEY
EXIMBAY_LIVE_MID
PAYMENT_PUBLIC_ORIGIN
```

Environment-variable presence must never activate routing or contact.

### 7.1 Single environment invariant

Before contact, S2 must prove:

```text
loaded persisted Payment.mode
  == S1 READY plan mode
  == READY endpoint-selection mode
  == mode selecting API key
  == mode selecting MID
```

For a new Eximbay Payment, configured `PAYMENT_MODE` seeds the candidate
environment. The matching atomic config pair must be valid. `Payment.mode` is
persisted before provider contact and then owns that attempt.

For an existing Eximbay Payment, persisted `Payment.mode` owns the attempt. A
configured or input mode mismatch must fail closed before generic compatibility
or supersession. The exact Payment row and exact `providerOrderId` are
preserved; `CONTACTED` is not entered and provider bytes remain zero. This
Eximbay-specific preservation rule must not be broadened to unrelated
provider/method incompatibilities.

Market, locale, URL, browser input, cookie, GeoIP, request header, or MID text
cannot select the environment.

### 7.2 Atomic mode-branded pair

MID and API key are resolved as one immutable, mode-branded pair. They cannot
be independently nominated, paired across modes, trimmed into different
credentials, or exposed through generic presence checks. Missing, blank,
leading/trailing-whitespace, or control-bearing values reject before contact.

Authorization is constructed exactly as:

```text
"Basic " + Base64(UTF-8(apiKey + ":"))
```

The raw API key and encoded Authorization are server-only, memory-only
transport material. They are never persisted, serialized to the browser,
placed in URLs, logged, traced, fingerprinted, copied into errors, or exposed
through generic credential metadata. The MID is provider request material and
is not generic telemetry.

## 8. Payment public origin and exact URLs

`PAYMENT_PUBLIC_ORIGIN` is dedicated payment-specific server-owned
configuration. It is parsed once with the platform URL parser and admitted
only when:

```text
scheme:
  https:

hostname:
  nonempty

port:
  optional explicit port allowed

userinfo:
  forbidden

pathname:
  exactly /

query:
  forbidden

fragment:
  forbidden

normalized base:
  URL.origin
```

There is no fallback to `NEXTAUTH_URL`, `Host`, `Forwarded`,
`X-Forwarded-Host`, request `Origin`, browser input, cookie, Market, Locale, or
GeoIP.

Exact derivation is:

```text
returnUrl =
  normalized PAYMENT_PUBLIC_ORIGIN
  + "/checkout/return/"
  + encodeURIComponent(authoritative CheckoutSession.id)

statusUrl =
  normalized PAYMENT_PUBLIC_ORIGIN
  + "/api/payments/eximbay/status"
```

The return route is navigation and local-status observation only. Return
parameters and browser events are never financial truth.

The status path is a reserved string in S2. S2 must not implement that route.
BF4 owns ingress/raw custody, verification/authentication, duplicate and order
handling, correlation, acknowledgement, and financial completion. No
payment-producing E2, live, or customer activation may occur before reviewed
BF4 source is installed.

## 9. Pre-contact preparation and exact contact claim

The lifecycle owner must preserve this sequence:

```text
authenticate purchaser
-> lock/load authoritative CheckoutSession ownership
-> authorize/reuse exact Payment
-> establish persisted Payment.mode
-> require persisted providerOrderId
-> derive canonical purchaser/market/method/amount/currency/URL facts
-> resolve same-mode config/credential pair
-> issue EX2B1 trusted provider-order binding
-> construct complete bounded trusted S1 READY plan
-> provider bytes = 0
-> re-lock/reload authoritative CheckoutSession + owner User
-> compare prepared purchaser/session snapshot
-> conditionally claim the exact same Payment
-> CONTACTED/contactStartedAt commits
-> only then exactly one HTTP transport attempt
```

The conditional claim includes at least exact:

```text
Payment.id
checkoutSessionId
provider
mode
providerOrderId
amount
currency
routingRuleId
uncontacted lifecycle/output fields
```

Prepared owner and session facts must also remain exact across the claim. Any
drift, missing fact, configuration mismatch, lost lock/claim, or changed
authority yields zero provider bytes, no `CONTACTED`, and full pre-contact
revalidation. The stale plan is never executed.

The initiation lifecycle remains the sole sequencing owner. S2 must not add a
generic two-phase provider abstraction unless a later versioned design change
authorizes it.

## 10. HTTP transport contract

The S2 HTTP adapter accepts only a trusted S1 contact plan:

```text
input:
  trusted S1 contact plan only

method:
  POST

endpoint/body/content-type:
  exact S1 plan

total deadline:
  15000 ms

automatic retries:
  0

redirect following:
  disabled / error

fetch:
  injectable in ordinary tests
```

Fifteen seconds is a Mira defensive design choice, not a provider protocol
guarantee. A generic fetch implementation must not claim a separate five-second
TCP/TLS connection timeout.

The adapter:

- creates a fresh internal `AbortController`;
- starts the deadline immediately before its single fetch attempt;
- clears the timer on every exit;
- attaches Authorization from the same-mode config pair;
- accepts no arbitrary caller endpoint, base URL, body, mode, redirect policy,
  retry count, or `AbortSignal`;
- streams raw status, raw content type, and response chunks directly to the
  installed S1 admission boundary;
- never calls `text()`, `json()`, clones, normalizes, or business-parses the
  response;
- cancels and releases the reader on early termination; and
- logs neither request bodies, purchaser data, secrets, raw responses,
  provider messages, nor trusted authority objects.

Ordinary tests inject fetch and must perform zero real Eximbay network access.

## 11. Post-contact result mapping

After durable `CONTACTED`, every observation below becomes
`OUTCOME_UNKNOWN` and prohibits same-attempt READY recontact:

```text
transport throw/reset/read/stream failure
timeout/abort
redirect / 3xx
4xx
429
5xx
body overflow
chunk-event overflow
invalid response chunk
invalid content type
invalid UTF-8
invalid JSON/root/trailing alternate data
duplicate protected key
invalid rescode/resmsg/fgkey
provider non-"0000"
```

No `resmsg`, guessed provider code, or HTTP status creates terminal failure in
S2. This is a conservative S2 specialization of the parent contract while no
exact terminal provider taxonomy is installed.

Only exact installed S1 admission of `rescode === "0000"` yields READY. READY
is preparation success only and is not authentication, authorization, capture,
financial completion, paid Order truth, or merchant-capability proof.

If durable READY persistence fails after admission, S2 must move the attempt to
`OUTCOME_UNKNOWN` where possible, never return success, and never recontact. If
even unknown persistence fails, the existing `CONTACTED` row with no output
remains blocking and non-recontactable.

## 12. Durable READY and fresh transient authority

### 12.1 Durable branch

The durable branch may contain only:

```text
Payment.attemptLifecycle:
  CONTACTED

Payment.initiationOutputKind:
  READY

Payment.initiationCompletedAt:
  governed contact-boundary-derived persisted time

providerRef:
  null unless independently defined and justified
```

It must never persist raw `readyFgkey`, an SDK package, Authorization, API key,
trusted S1 plan, `TrustedEximbayReadySuccess`, or an opaque transient wrapper.
Generic durable READY is non-actionable.

### 12.2 Fresh internal branch

The fresh internal authority is:

```text
exact trusted S1 plan object identity
+
exact TrustedEximbayReadySuccess object identity
```

An opaque server-only wrapper or closure may preserve both exact identities.
It is same-fresh-in-memory-continuation-only, server-only, non-serializable,
non-durable, not browser-exposed by S2, not a generic
`PaymentInitiateResult`, not `providerRef`, not `providerPaymentKey`, not
logged, and not reconstructible from copied structural data.

S2 does not own browser SDK-wire materialization. Future S3 owns the
two-channel initiation integration,
`materializeTrustedEximbaySdkWire(...)`, browser-safe ephemeral handoff, SDK
loader, and `EXIMBAY.request_pay`. S3 must be able to consume the same exact
fresh plan/success pair without a second READY contact, persisted fgkey,
success reconstruction, copied authority, or plan substitution.

An S2-only final public boundary may deliberately drop the transient authority.
After it is lost, durable READY remains non-actionable. No same-attempt READY
recontact is allowed merely to recover a browser handoff. This exact
two-channel rule closes D0R-I01.

## 13. Routing, runtime, and activation posture

The following remain unchanged:

```text
EXIMBAY registry/customer routing:
  disabled

allowed modes/methods/currencies:
  unchanged

live allowlist:
  unchanged

factory/customer reachability:
  unchanged / hard denied as currently installed

S2 capability after future implementation:
  dormant source only

real sandbox READY evidence:
  separate E1A authority

SDK:
  S3

status/completion:
  BF4

live/customer activation:
  separate future activation record
```

No S2 implementation task may enable routing merely to exercise its adapter.
Configuration presence, source installation, or a passing fake-transport test
does not activate Eximbay.

## 14. Threat, failure, and recovery linkage

The installed EX2B2 Threat / Failure Model remains the sole model for this
surface. S2's required mitigations are:

| Threat/failure | S2 mitigation |
| --- | --- |
| cross-payment or cross-mode authority substitution | exact Payment/mode/providerOrderId claim plus installed S1 object-identity provenance |
| TOCTOU between plan and `CONTACTED` | re-lock/reload owner and session; exact prepared-fact comparison and conditional claim |
| pre-contact versus post-contact ambiguity | zero bytes before committed claim; every unclassified post-contact result unknown |
| credential leakage | atomic server-only pair; no persistence/browser/log/error custody |
| request-body or buyer-data leakage | sensitive plan/body never logged or copied into diagnostics |
| URL/header authority injection | dedicated strict origin; no request/header-derived fallback |
| redirects or retries | redirect error; exactly zero automatic retries |
| malformed or unbounded response | installed S1 streamed bounds and strict admission |
| same-attempt recontact | `OUTCOME_UNKNOWN` and durable READY both block blind recontact |
| readyFgkey persistence or reconstruction | exact success stays fresh/internal only; no durable/public raw value |
| durable READY replay | generic durable READY is explicitly non-actionable |
| routing/source conflation | registry and customer reachability remain disabled |

Recovery is frozen as:

```text
pre-contact failure:
  no provider bytes
  uncontacted attempt may be revalidated under exact lifecycle rules

post-contact ambiguous failure:
  OUTCOME_UNKNOWN
  no blind recontact
  later reconciliation/evidence owner required

durable READY after transient loss:
  no recontact merely to recover handoff

source rollback:
  future S2 source may be removed/disabled while routing remains disabled
  contacted/unknown rows are never rewritten as uncontacted

customer activation rollback:
  separate activation/runbook authority
  not this Design Contract
```

## 15. Future implementation boundary

The following is a candidate touch set for one future bounded S2
Implementation Task Contract. It is not current source authority and is not
standing permission.

### 15.1 Expected required candidates

```text
src/lib/payment/eximbay/ready-facts.ts
src/lib/payment/eximbay/ready-config.ts
src/lib/payment/eximbay/ready-http.ts
src/lib/payment/eximbay/ready-contact.ts

focused Eximbay tests

src/lib/payment/attempt/initiate.ts
src/lib/payment/attempt/__tests__/initiate.integration.test.ts
src/lib/payment/attempt/__tests__/provider-initiation-ownership.test.ts

src/lib/payment/providers/credentials.ts
focused credential/resolve tests
src/lib/payment/providers/__tests__/eximbay-ex1-architecture.test.ts
src/lib/payment/eximbay/__tests__/s1-isolation.test.ts

.env.example
```

### 15.2 Conditional candidates

```text
src/app/actions/payment.ts and tests
src/lib/payment/providers/types.ts
src/app/actions/payment-provider-boundary.ts tests
src/lib/payment/eximbay/ready.ts only under separate EX2B1 provenance audit
```

### 15.3 Protected paths and responsibilities

```text
src/lib/payment/eximbay/ready-kernel.ts
src/lib/payment/providers/eximbay/**
prisma/schema.prisma
prisma/migrations/**
routing/registry/live allowlists
src/app/api/payments/**
checkout/return UI
completion/finalization/order/outbox/reconciliation/refund/void
package/dependency manifests
```

If S2 requires changing `src/lib/payment/eximbay/ready-kernel.ts`, stop:

```text
STOP — WOULD REOPEN CLOSED S1
```

The separately reviewed EX2B1 provenance audit condition applies before any
change to `src/lib/payment/eximbay/ready.ts`. The future task must not convert
this candidate set into a generic two-phase provider refactor or add S3/BF4
paths.

## 16. Future behavioral test contract

The future S2 source task must use behavioral tests with fake/injected
transport and zero external network. At minimum it must prove:

### 16.1 Purchaser and account facts

- canonical owned `User.name` and `User.email` are used;
- null, blank, invalid, or concurrently changed owner facts reject before
  contact;
- shipping recipient never becomes purchaser identity;
- browser-authored purchaser alternatives have no authority;
- supported Google OAuth name persistence is separately proven before customer
  activation, or activation remains blocked; and
- S2's defensive reload remains mandatory after any auth invariant proof.

### 16.2 Language, method, origin, and URLs

- JP maps to JP, US maps to EN, and other markets reject;
- storefront-locale divergence does not affect the market-default language;
- exact server CARD maps to P000 and every other/raw/omitted method rejects;
- strict HTTPS origin grammar and normalization are exact;
- host/forwarded/request-origin/browser injection cannot affect URLs; and
- exact return/status paths use only the authoritative CheckoutSession ID.

### 16.3 Mode, configuration, and credentials

- persisted mode, plan, endpoint, API key, and MID always agree;
- new SANDBOX/LIVE attempts resolve only the matching atomic pair;
- existing Eximbay mode mismatch preserves the same Payment and
  `providerOrderId` before supersession;
- absent, blank, trim-divergent, control-bearing, or cross-mode config rejects
  before contact; and
- secret values and Authorization are absent from results, persistence, logs,
  snapshots, errors, and telemetry.

### 16.4 Contact ordering and concurrency

- the complete trusted S1 plan exists while provider bytes remain zero;
- `CONTACTED/contactStartedAt` commits before the one fake transport call;
- the conditional claim covers exact Payment/session/owner facts;
- any drift produces zero contact and full revalidation;
- concurrent callers produce exactly one contact claim and one transport
  attempt; and
- no plan/body reconstruction occurs after the contact mark.

### 16.5 Transport and outcome

- the 15-second deadline aborts the internally owned signal and clears its
  timer;
- redirects error and automatic retry count remains zero;
- every throw, abort, HTTP class, stream/bound/admission error, and non-`0000`
  result becomes `OUTCOME_UNKNOWN`;
- exact `0000` becomes READY only, never financial truth; and
- every unknown or durable-READY re-entry performs zero contact.

### 16.6 Durable/transient custody

- durable READY contains only allowed generic metadata and is non-actionable;
- raw `readyFgkey` is absent from all database rows/results, generic/public
  results, refs/keys, logs, errors, and telemetry;
- exact fresh S1 plan/success identities remain internally available through
  the same continuation;
- copied plans, cross-plan successes, and cross-payment/mode substitutions are
  rejected;
- persistence failure never returns success or recontacts;
- deliberate transient loss leaves durable READY non-actionable and performs
  no recovery contact; and
- a future S3 seam can consume the same exact pair without reconstruction,
  persistence, substitution, or second contact.

### 16.7 Regression and side-effect exclusions

- MOCK, TOSS, and PAYPAL initiation/ownership behavior remains unchanged;
- no SDK, `request_pay`, BF4, Order, ManufacturingRequest, outbox, routing,
  refund, void, or completion side effect occurs;
- ordinary tests perform zero real Eximbay network; and
- the future source merge requires full `npm run verify` green plus
  proportionate dormant-boundary runtime/integration verification.

## 17. Observability and confidentiality

Permitted bounded diagnostic fields are Payment ID, provider, mode, phase,
monotonic duration, bounded outcome class, safe HTTP status, and response byte
count. All logs and errors must use allowlisted categories.

Prohibited content includes API key, Authorization, MID as generic telemetry,
raw request/response bodies, canonical buyer or URL facts, provider `resmsg`,
raw ready/status FGKeys, trusted S1 plan/success objects, transient wrappers,
cookies, session material, and SDK payloads.

## 18. Re-entry gates and stop conditions

A future task must stop and return to design if:

- current repository authority materially contradicts this contract;
- a parent EX2B2 semantic must be changed rather than specialized;
- closed S1 semantics or `ready-kernel.ts` must be rewritten;
- S2 would need schema, migration, status-route, S3, BF4, routing, or activation
  authority;
- raw secrets or fgkey would become durable, public, logged, or
  reconstructible;
- the exact plan/success identity pair cannot survive the current continuation
  without broadening public/generic contracts; or
- ordinary source tests would require real Eximbay contact.

Merchant capability, E1A provider evidence, S3 browser handoff, BF4 status and
completion, live routing, customer rollout, operations, observation, and
rollback activation remain separate future gates.

## 19. Final design disposition

```text
EX2B2-S2 DESIGN:
  HUMAN-ADJUDICATED
  FINAL INDEPENDENT DESIGN CLOSURE PASS
  READY FOR DOCUMENTATION INSTALLATION

SOURCE:
  NOT INSTALLED
  NOT AUTHORIZED BY DOCUMENT EXISTENCE ALONE

PROVIDER CONTACT / SDK / ROUTING / RUNTIME / ACTIVATION:
  NONE

NEXT GATE AFTER INDEPENDENTLY REVIEWED DOCUMENT MERGE:
  ONE SEPARATELY ISSUED BOUNDED S2 IMPLEMENTATION TASK CONTRACT
```
