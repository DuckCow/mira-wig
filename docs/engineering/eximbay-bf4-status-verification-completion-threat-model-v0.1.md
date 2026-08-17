# Eximbay BF4 — `status_url` Verification / Retrieval / Completion Threat / Failure Model v0.1

## Status

```text
DOCUMENT CLASS:
  THREAT / FAILURE MODEL

RISK CLASS:
  HIGH — PUBLIC PAYMENT CALLBACK + EFFECTFUL VERIFICATION + FINANCIAL COMPLETION

VERSION:
  v0.1

TARGETED CORRECTNESS REVIEW:
  PASS

INSTALLATION STATUS:
  READY FOR DOCUMENTATION INSTALLATION

CURRENT AUTHORITY:
  DOCUMENTATION ONLY

SOURCE / PROVIDER / ACTIVATION AUTHORITY:
  NONE

E1B:
  CLOSED / ADMITTED / NOT REOPENED

E2:
  BLOCKED

SUPERSEDES:
  none

SUPERSEDED-BY:
  none
```

This is the reviewed companion to the
[BF4 Design Contract](./eximbay-bf4-status-verification-completion-design-contract-v0.1.md).
It models only the public Eximbay `status_url` ingress, one verification, one
retrieval, exact sale admission, existing generic completion, durable replay,
and acknowledgement boundary. It does not authorize implementation or
operation and does not broaden to refunds, disputes, or production activation.

## 1. Protected guarantees and evidence basis

Protected guarantees are:

- exact raw callback representation is preserved and bounded;
- callback facts remain untrusted until provider verification;
- READY FGKey and status FGKey remain separate namespaces;
- only one pre-existing, exact EXIMBAY Payment can be correlated;
- each durable callback claim causes at most one automatic `/verify` and one
  automatic `/retrieve` contact, with zero blind retry;
- exact raw with a durable definitive rejection never automatically triggers
  `/verify` again;
- provider contact begins only after claim admission commits with an absent
  post-claim exact-raw tombstone recheck;
- only authoritative `SALE` plus exact MID/order/transaction/money matches can
  assign the provider transaction key and enter `completeFromCapture`;
- generic completion remains the sole commerce finalizer;
- success acknowledgement follows an eligible durable terminal local state;
- exact raw and provider responses are minimized and never logged; and
- EXIMBAY routing remains disabled.

Current first-party facts were re-observed on 2026-08-17 from Eximbay's
[post-SDK preparation and validation page](https://developer.eximbay.com/eng/eximbay/payment_linkage/preparing-fgkey.html),
[REST API reference](https://developer.eximbay.com/eng/eximbay/api_list/reference.html),
and [JavaScript SDK/payment flow reference](https://developer.eximbay.com/eng/eximbay/api_sdk/javascript-sdk.html).
The provider documentation does not close callback method/carrier/content-type,
failure-ack values, verify/retrieve retry semantics, `transaction_date`
timezone, or literal-`+` behavior.

## 2. Threat and failure cases

### T-BF4-01 — Raw normalization or decoding drift

```text
PRECONDITION:
  callback bytes reach BF4
FAILURE / ATTACK:
  framework decoding, key sorting, re-encoding, or form normalization changes the query submitted to /verify
PROTECTED GUARANTEE:
  /verify receives the exact status query representation
DETECTION:
  exact raw/hash vectors and parser tests compare byte-for-byte custody
PREVENTION:
  capture one raw carrier before decoding; never reconstruct from parsed fields
DURABLE EFFECT:
  claim stores exact raw plus SHA-256 while unresolved
RECOVERY:
  safe stop; no provider contact if exact raw cannot be established
RESIDUAL RISK:
  framework request-target access may differ by runtime
EVIDENCE GATE:
  dormant ingress review plus sandbox callback-carrier evidence before E2
```

### T-BF4-02 — Oversized, duplicate-key, pair-count, and prohibited-character input

```text
PRECONDITION:
  public attacker controls callback-shaped input
FAILURE / ATTACK:
  memory/CPU abuse or ambiguous last-wins fields bypass identity and money checks
PROTECTED GUARANTEE:
  bounded, unambiguous, fail-closed ingress
DETECTION:
  raw-byte, pair, key/value, duplicate-decoded-name, UTF-8, and control-character tests
PREVENTION:
  retain current 16,384-byte/64-pair bounds and strict percent/character grammar
DURABLE EFFECT:
  at most safe bounded rejection diagnostics; no Payment financial mutation
RECOVERY:
  reject without provider contact; operator diagnosis uses only safe code/hash
RESIDUAL RISK:
  request infrastructure may impose different upstream limits
EVIDENCE GATE:
  route/runtime ingress tests under the separately authorized source task
```

### T-BF4-03 — Literal `+` ambiguity

```text
PRECONDITION:
  callback contains an unescaped plus in a field value
FAILURE / ATTACK:
  one layer treats + literally while another treats it as space, changing verified bytes or facts
PROTECTED GUARANTEE:
  no silent raw/decoded semantic drift
DETECTION:
  current status-parser test rejects UNESCAPED_PLUS without mutating caller input
PREVENTION:
  preserve literal-plus rejection; do not add form-style decoding
DURABLE EFFECT:
  safe terminal ingress rejection or retained bounded evidence; no financial success
RECOVERY:
  only a reviewed parser change after provider callback evidence
RESIDUAL RISK:
  a legitimate callback may fail closed
EVIDENCE GATE:
  observed sandbox callback bytes or direct first-party clarification
```

### T-BF4-04 — Forged order or transaction identity

```text
PRECONDITION:
  attacker submits a plausible providerOrderId or transaction_id
FAILURE / ATTACK:
  forged data claims another Payment or drives verification/retrieval spend
PROTECTED GUARANTEE:
  callback fields are not financial authority and cannot fabricate a Payment
DETECTION:
  unique existing EXIMBAY providerOrderId lookup, provider verification, and retrieved exact identity checks
PREVENTION:
  pre-existing Payment only; hashed namespaced claim; no completion before exact SALE admission
DURABLE EFFECT:
  bounded event claim/rejection only; no callback-created Payment
RECOVERY:
  definitive verify rejection atomically rotates the active transaction claim into an exact-raw rejection tombstone
RESIDUAL RISK:
  forged callbacks can consume bounded verification resources before rejection
EVIDENCE GATE:
  source concurrency/contact-ceiling tests and public-route abuse controls before activation
```

### T-BF4-05 — Definitive-reject replay and tombstone/claim TOCTOU amplification

```text
PRECONDITION:
  the same raw H races with definitive-reject rotation of active transaction claim tx:T
FAILURE / ATTACK:
  contender prechecks no tombstone, then acquires newly released tx:T after reject:H commits and causes a second /verify
PROTECTED GUARANTEE:
  durable definitive rejection of exact raw H prevents every later automatic verification of H while releasing tx:T for different legitimate raw
DETECTION:
  provider-free race test blocks the contender on unique tx:T while the first transaction rotates tx:T to reject:H
PREVENTION:
  re-read reject:H after successful claim insertion in a fresh READ COMMITTED statement inside claim admission, then roll back before contact if present
DURABLE EFFECT:
  contender claim rolls back; original reject:H remains the sole negative replay evidence and no second terminal event is created
RECOVERY:
  replay the local terminal-reject disposition with zero provider contact
RESIDUAL RISK:
  distinct forged raw values remain separate abuse inputs; BF4 does not invent a rate limiter
EVIDENCE GATE:
  deterministic concurrent database integration test for the unique-conflict, rotation, post-claim recheck, and rollback sequence
```

### T-BF4-06 — Concurrent duplicates before and after provider contacts

```text
PRECONDITION:
  provider or attacker delivers concurrent duplicate callbacks
FAILURE / ATTACK:
  multiple workers call verify/retrieve or complete twice
PROTECTED GUARANTEE:
  one verify, one retrieve, and idempotent local completion per durable claim
DETECTION:
  unique (provider, transmissionId), compare-and-set stage results, and concurrent behavior tests
PREVENTION:
  precheck and post-claim exact-reject tombstone reads; commit claim and *_OUTCOME_UNKNOWN before fetch; stage-gated local replay
DURABLE EFFECT:
  one owner advances; active contenders or tombstoned exact-raw replays render the stored disposition
RECOVERY:
  duplicates may resume local completion only from durable sale facts
RESIDUAL RISK:
  database outage can deny availability but must not relax the fence
EVIDENCE GATE:
  database-backed concurrency suite for every transition-table row
```

### T-BF4-07 — Crash before/after verify and verify-success persistence loss

```text
PRECONDITION:
  process fails around the verification contact boundary
FAILURE / ATTACK:
  restart repeats a contact because response/attempt existed only in memory
PROTECTED GUARANTEE:
  no automatic verify retry after contact may have begun
DETECTION:
  durable VERIFY_OUTCOME_UNKNOWN marker precedes fetch; missing VERIFIED stage is treated as unknown
PREVENTION:
  consume contact authority before delegation; never infer no contact from response absence
DURABLE EFFECT:
  retained claim, raw query, and blocking Payment attempt OUTCOME_UNKNOWN when transition-safe
RECOVERY:
  separately authorized human inquiry/adjudication only
RESIDUAL RISK:
  crash before actual network send can conservatively strand a no-contact event
EVIDENCE GATE:
  injected crash-window tests before/after marker, fetch, response, and persistence
```

### T-BF4-08 — Retrieve ambiguity, stale status, non-SALE, or exact-fact mismatch

```text
PRECONDITION:
  verification is admitted and one retrieval is attempted
FAILURE / ATTACK:
  timeout/stale AUTH/REGISTERED/NONE/malformed SALE/mismatched MID-order-transaction-money is promoted
PROTECTED GUARANTEE:
  only exact authoritative SALE reaches financial completion
DETECTION:
  bounded response parser plus exhaustive exact predicate checks
PREVENTION:
  RETRIEVE_OUTCOME_UNKNOWN before contact; zero retry; closed status vocabulary; fail-closed mismatch
DURABLE EFFECT:
  ambiguity/non-SALE retains claim and OUTCOME_UNKNOWN; SALE mismatch stops for reconciliation
RECOVERY:
  separately authorized provider inquiry/human adjudication; non-SALE does not foreclose a later admitted SALE; no automatic recontact
RESIDUAL RISK:
  fail-closed stale response can delay a legitimate sale
EVIDENCE GATE:
  provider-response vectors, crash tests, and future sandbox inquiry evidence
```

### T-BF4-09 — Provider response, body, or credential leakage

```text
PRECONDITION:
  verify/retrieve transport or error instrumentation observes headers/bodies
FAILURE / ATTACK:
  Authorization, provider body, buyer data, or identifiers enter logs/errors/analytics
PROTECTED GUARANTEE:
  server credential custody and minimum payment-data exposure
DETECTION:
  log/error capture tests and allowlisted-envelope inspection
PREVENTION:
  opaque credential boundary; safe error codes; no header/body interpolation or general body persistence
DURABLE EFFECT:
  only allowlisted sale facts, exact required callback raw, hashes, and safe diagnostics
RECOVERY:
  incident response/credential rotation outside BF4 if leakage occurs
RESIDUAL RISK:
  infrastructure or third-party instrumentation can observe process data
EVIDENCE GATE:
  source review plus negative observability tests before provider authority
```

### T-BF4-10 — READY FGKey and status FGKey conflation

```text
PRECONDITION:
  both READY handoff and status callback contain a field named fgkey
FAILURE / ATTACK:
  code compares, reuses, persists, or promotes the wrong FGKey
PROTECTED GUARANTEE:
  readyFgkey and statusFgkey are distinct and neither is completion authority
DETECTION:
  type/export/isolation tests and negative persistence/log assertions
PREVENTION:
  BF4 submits exact raw to /verify; no FGKey extraction/comparison or envelope field
DURABLE EFFECT:
  neither FGKey is stored as providerRef/providerPaymentKey or normalized fact
RECOVERY:
  reject any source design that introduces READY/status FGKey comparison
RESIDUAL RISK:
  future provider field naming can invite regression
EVIDENCE GATE:
  BF4 source review and EX2B2/BF4 isolation tests
```

### T-BF4-11 — Raw callback PII retention or excessive access

```text
PRECONDITION:
  exact callback query includes buyer/payment metadata
FAILURE / ATTACK:
  raw data is retained indefinitely, broadly queried, or copied into diagnostics
PROTECTED GUARANTEE:
  minimum necessary restricted custody
DETECTION:
  terminal raw-minimization tests and database-access/serialization review
PREVENTION:
  exact raw only while unresolved; terminal replacement by SHA-256 and allowlisted facts
DURABLE EFFECT:
  unresolved events may retain exact raw; resolved events retain hashes/safe facts only
RECOVERY:
  human resolution triggers minimization; incident handling uses existing payment-data controls
RESIDUAL RISK:
  repository lacks a proven time-based policy for unresolved raw
EVIDENCE GATE:
  human privacy/operations retention policy before activation
```

### T-BF4-12 — `providerPaymentKey` assigned before exact sale admission

```text
PRECONDITION:
  unverified callback or partial retrieval exposes transaction_id
FAILURE / ATTACK:
  attacker/stale data occupies the unique provider transaction identity
PROTECTED GUARANTEE:
  providerPaymentKey is authoritative verified/retrieved exact SALE identity
DETECTION:
  stage-to-write tests assert null through claim, verification, ambiguity, non-SALE, and mismatch
PREVENTION:
  write only with durable VERIFIED_SALE_PENDING_COMPLETION transition after all exact predicates
DURABLE EFFECT:
  no Payment/Event payment key before admitted sale
RECOVERY:
  source task stops on any earlier writer; no clearing workaround
RESIDUAL RISK:
  privileged manual database mutation remains possible
EVIDENCE GATE:
  transaction integration tests and schema/source review
```

### T-BF4-13 — Completion from unverified callback facts

```text
PRECONDITION:
  callback contains rescode 0000, money, order ID, and transaction ID
FAILURE / ATTACK:
  callback fields are mapped directly to CaptureFacts or order creation
PROTECTED GUARANTEE:
  verify integrity plus retrieve exact SALE precede generic completion
DETECTION:
  authority-type tests prevent UnverifiedEximbayStatus promotion
PREVENTION:
  only TrustedEximbayCompletionCandidate maps to exact-payment CaptureFacts
DURABLE EFFECT:
  no financial status/order mutation from callback alone
RECOVERY:
  fail closed and retain event evidence; do not fabricate verified state
RESIDUAL RISK:
  future unsafe casts or parallel paths could bypass types
EVIDENCE GATE:
  source isolation tests and adversarial architecture review
```

### T-BF4-14 — Callback-first Eximbay Payment creation

```text
PRECONDITION:
  valid or forged callback arrives without a matching existing Payment
FAILURE / ATTACK:
  webhook fabricates a Payment/providerOrderId and becomes commerce authority
PROTECTED GUARANTEE:
  server-created immutable Payment identity precedes callback
DETECTION:
  zero/exact-one correlation tests and existing EximbayWebhookFirstCaptureError coverage
PREVENTION:
  require existing EXIMBAY providerOrderId; always pass exact paymentId to recordCapture
DURABLE EFFECT:
  event may reject; Payment row count remains unchanged
RECOVERY:
  human investigation only; no callback-driven row creation
RESIDUAL RISK:
  legitimate orphan notification remains unavailable to automatic completion
EVIDENCE GATE:
  BF4 integration tests preserving current completion behavior
```

### T-BF4-15 — Accidental reuse/generalization of generic webhook pipeline

```text
PRECONDITION:
  implementer routes EXIMBAY through handleWebhook/pipeline for convenience
FAILURE / ATTACK:
  generic verify-before-record/replay semantics violate BF4 pre-contact claim ceiling
PROTECTED GUARANTEE:
  dedicated BF4 orchestration owns exact contact/crash protocol
DETECTION:
  import/reachability tests and unchanged generic EXIMBAY-unavailable behavior
PREVENTION:
  dedicated route/orchestrator; generic pipeline remains unchanged and rejects EXIMBAY
DURABLE EFFECT:
  no generic PaymentEvent raw-string protocol is used for BF4
RECOVERY:
  reject source candidate; do not patch the generic pipeline incrementally
RESIDUAL RISK:
  shared utility extraction can obscure ownership if not reviewed
EVIDENCE GATE:
  changed-path and dependency-direction source review
```

### T-BF4-16 — Local completion retry causes provider recontact

```text
PRECONDITION:
  sale evidence is durable but recordCapture/completion transaction returns retryable failure
FAILURE / ATTACK:
  retry restarts verify/retrieve and exceeds contact ceiling
PROTECTED GUARANTEE:
  provider contact and local completion replay are separate
DETECTION:
  COMPLETION_RETRYABLE tests assert zero fetch and exact stored sale-fact reuse
PREVENTION:
  stage-gated local replay calls only completeFromCapture with exact paymentId
DURABLE EFFECT:
  Payment capture may already be persisted; event remains locally retryable
RECOVERY:
  bounded local replay or human DB diagnosis, never provider recontact
RESIDUAL RISK:
  persistent local failure delays acknowledgement
EVIDENCE GATE:
  failure-injection tests across recordCapture and completion transaction
```

### T-BF4-17 — Compensation/remediation without Eximbay execution support

```text
PRECONDITION:
  verified financial success cannot complete commerce safely
FAILURE / ATTACK:
  outbox signal is mistaken for completed Eximbay cancel/refund or pre-sale ambiguity is remediated prematurely
PROTECTED GUARANTEE:
  remediation truth is explicit and does not block later valid capture incorrectly
DETECTION:
  result classification and Payment remediation-state tests
PREVENTION:
  pre-sale ambiguity uses OUTCOME_UNKNOWN only; exact correlated SALE money mismatch may use existing RECONCILIATION_REQUIRED without assigning a provider key; compensationEnqueued means local ownership, not provider execution
DURABLE EFFECT:
  existing remediation/outbox state only where generic completion or post-success adjudication owns it
RECOVERY:
  separate authorized Eximbay remediation design/operator action
RESIDUAL RISK:
  provider financial success may await manual resolution
EVIDENCE GATE:
  remediation design and provider capability authority outside BF4
```

### T-BF4-18 — Acknowledgement before durable terminal state

```text
PRECONDITION:
  handler has observed provider/local success in memory
FAILURE / ATTACK:
  success body is returned before sale facts, completion, compensation ownership, or terminal rejection is durable
PROTECTED GUARANTEE:
  provider success acknowledgement follows eligible durable local ownership
DETECTION:
  crash tests between each write and renderer; renderer accepts only closed terminal stages
PREVENTION:
  minimize/persist terminal envelope before rendering success bytes
DURABLE EFFECT:
  no success acknowledgement without terminal PaymentEvent evidence
RECOVERY:
  duplicate reads stored state and renders the same eligible response
RESIDUAL RISK:
  response write can still be lost after local commit
EVIDENCE GATE:
  route-level crash/response ordering tests
```

### T-BF4-19 — Acknowledgement response loss and duplicate callback

```text
PRECONDITION:
  terminal state commits but provider does not receive the response
FAILURE / ATTACK:
  duplicate notification repeats provider contacts or commerce effects
PROTECTED GUARANTEE:
  terminal duplicate is response replay only
DETECTION:
  unique claim and terminal envelope lookup
PREVENTION:
  never contact verify/retrieve or rerun terminal completion from a terminal stage
DURABLE EFFECT:
  unchanged terminal event/payment/order/remediation state
RECOVERY:
  render the same acknowledgement semantic from durable state
RESIDUAL RISK:
  provider may continue retries if transport constants are wrong
EVIDENCE GATE:
  sandbox acknowledgement behavior before E2/activation
```

### T-BF4-20 — Callback method/carrier/content-type uncertainty

```text
PRECONDITION:
  provider delivers query-string-form data using an undocumented transport variant
FAILURE / ATTACK:
  handler reads the wrong carrier, merges query/body, or activates an overly broad public parser
PROTECTED GUARANTEE:
  exact-one-source raw custody without invented provider facts
DETECTION:
  method/source/content-type matrix tests and sandbox observation
PREVENTION:
  dormant exact-one-source ingress; evidence-gated method/status/media constants; routing disabled
DURABLE EFFECT:
  unsupported transport rejects without provider contact or financial mutation
RECOVERY:
  reviewed design/source correction after observed evidence
RESIDUAL RISK:
  legitimate callbacks may fail closed before evidence
EVIDENCE GATE:
  actual sandbox callback or direct first-party clarification
```

### T-BF4-21 — `transaction_date` timezone uncertainty

```text
PRECONDITION:
  retrieval returns YYYYMMDDHHMMSS without timezone authority
FAILURE / ATTACK:
  guessed timezone changes capturedAt and expiry admission
PROTECTED GUARANTEE:
  no invented financial timestamp authority
DETECTION:
  mapping tests assert capturedAt is omitted and receivedAt is used
PREVENTION:
  retain bounded string only; never parse to authoritative instant
DURABLE EFFECT:
  callback receivedAt becomes conservative completion time
RECOVERY:
  new contract/version after timezone authority
RESIDUAL RISK:
  delayed legitimate callbacks can be rejected after session expiry
EVIDENCE GATE:
  direct official timezone clarification or observed authoritative evidence
```

### T-BF4-22 — Dormant route merged while routing remains disabled

```text
PRECONDITION:
  future BF4 source is reviewed and merged dormant
FAILURE / ATTACK:
  merge is mistaken for runtime/provider/SDK/E2 authority or a registry change selects EXIMBAY
PROTECTED GUARANTEE:
  source installation is separate from routing and activation
DETECTION:
  registry/routing/factory/webhook reachability tests and configuration review
PREVENTION:
  EXIMBAY stays enabled=false with empty modes/methods/currencies and generic webhook rejection
DURABLE EFFECT:
  no provider contact or customer traffic from source installation alone
RECOVERY:
  revert dormant source without rewriting durable payment evidence
RESIDUAL RISK:
  later configuration drift outside the reviewed change
EVIDENCE GATE:
  Source Status, operations readiness, and separate dated activation authority
```

### T-BF4-23 — Unsafe operator claim clearing or provider retry

```text
PRECONDITION:
  operator sees VERIFY_OUTCOME_UNKNOWN, RETRIEVE_OUTCOME_UNKNOWN, or unresolved SALE mismatch
FAILURE / ATTACK:
  operator clears claim/lifecycle, edits providerOrderId, or repeats contact without authority
PROTECTED GUARANTEE:
  durable ambiguity and immutable correlation remain trustworthy
DETECTION:
  database constraints, audit access, envelope/state readback, and runbook review
PREVENTION:
  no bypass API; no BF4 runbook/operation authority in this contract; bounded human re-entry only
DURABLE EFFECT:
  claim and blocking Payment exposure remain until separately adjudicated
RECOVERY:
  authorized inquiry using stored evidence; install safe sale facts or terminal resolution atomically
RESIDUAL RISK:
  privileged manual database misuse cannot be eliminated by application design
EVIDENCE GATE:
  separately reviewed operations/recovery contract before operator use
```

## 3. Failure ownership summary

Pre-claim/local validation failure owns no provider effect. Once a verify or
retrieve contact marker is durable, any missing response is ambiguous and the
same claim cannot automatically contact that endpoint again. Definitive verify
rejection is the only automatic transaction-claim namespace release, and it
occurs only by atomically rotating the active claim into an exact-raw rejection
tombstone. A contender cannot turn that release into new contact authority for
the same raw because claim admission rechecks the tombstone after unique claim
acquisition and rolls back before contact. Verification success permits one
retrieval but is not financial success. Only stored exact SALE facts permit
local completion replay.

Pre-sale ambiguity belongs to `Payment.attemptLifecycle=OUTCOME_UNKNOWN`, not
automatic remediation. Verified financial success that cannot be exactly
admitted/completed may require existing reconciliation/remediation semantics
and human adjudication. `compensationEnqueued` proves durable merchant-owned
follow-up, not completed Eximbay remediation.

Browser return state owns no financial truth. The generic webhook pipeline
owns no BF4 transition. `completeFromCapture` remains the only commerce
finalizer. Acknowledgement rendering owns response bytes only after reading the
durable event disposition.

## 4. Residual risks and mandatory future gates

The design deliberately trades availability for contact safety and financial
correctness. Main residuals are transport/failure-ack uncertainty, false
positive unknown outcomes caused by pre-contact durable markers, unresolved
raw-data retention, missing provider retry/idempotency semantics, missing
transaction timezone, abuse cost from infinitely many distinct forged raw
inputs, and privileged operator misuse. Replaying one exact definitively
rejected raw is not a provider-contact residual.

Mandatory future gates are:

1. reviewed documentation installation of this contract;
2. a separately authorized dormant BF4 source implementation task with behavior, concurrency,
   crash-window, redaction, and routing-isolation tests;
3. independent high-risk source review and bounded correction;
4. current Source Status / As-Built installation;
5. separately adjudicated callback transport, acknowledgement, merchant,
   credential, and sandbox evidence authority;
6. operations/privacy retention and recovery authority; and
7. only then a separate one-shot E2 execution authority.

```text
POST-INSTALLATION NEXT GATE:
  separately authorized dormant BF4 source implementation task

PROVIDER CONTACT / SDK / request_pay / E2 / ACTIVATION:
  NONE / BLOCKED
```
