# Eximbay BF4 — `status_url` Verification / Retrieval / Completion Design Contract v0.1

## Status

```text
DOCUMENT CLASS:
  DESIGN CONTRACT

RISK CLASS:
  HIGH — PUBLIC PAYMENT CALLBACK + EFFECTFUL VERIFICATION + FINANCIAL COMPLETION

VERSION:
  v0.1

HUMAN / TARGETED CORRECTNESS REVIEW:
  PASS

INSTALLATION STATUS:
  READY FOR DOCUMENTATION INSTALLATION

CURRENT AUTHORITY:
  DOCUMENTATION ONLY

SOURCE / SCHEMA / PROVIDER / CREDENTIAL / ACTIVATION AUTHORITY:
  NONE

E1B:
  CLOSED / ADMITTED / NOT REOPENED

E1A:
  DEFERRED / NOT SATISFIED

E2:
  BLOCKED

SUPERSEDES:
  none

SUPERSEDED-BY:
  none
```

This reviewed contract freezes the minimum-sufficient BF4 design. It does
not prove BF4 source exists and does not authorize source, schema, provider
contact, credential use, SDK loading, `request_pay`, routing, sandbox/LIVE,
customer use, or activation. After reviewed installation, the next gate is a
separately authorized dormant BF4 source implementation task, not BF4
execution or E2.

```text
POST-INSTALLATION NEXT GATE:
  separately authorized dormant BF4 source implementation task

BF4 PROVIDER EXECUTION AUTHORITY:
  NONE

E2 AUTHORITY:
  NONE / BLOCKED
```

## 1. Governing authority and observed truth

Precedence for this reviewed contract is:

1. [`AGENTS.md`](../../AGENTS.md), the
   [Mira AI Engineering Governance](./ai-engineering-governance-v0.1.md), the
   [Mira Backend / High-Risk Engineering Governance](./mira-backend-high-risk-governance-v0.1.md),
   and the [Feature Documentation Standard](./feature-documentation-standard-v0.1.md).
2. The human BF4 architecture adjudication recorded by this reviewed contract and the
   2026-08-17 [decision-log entry](../discovery/decision-log.md).
3. The installed [EX2B2 Design Contract v0.2](./eximbay-ex2b2-ready-transport-sdk-handoff-design-contract-v0.2.md),
   [EX2B2 Threat / Failure Model](./eximbay-ex2b2-ready-transport-sdk-handoff-threat-model-v0.1.md),
   current S2/S3 Source Status records, and the closed E1B evidence branch.
4. Current source, schema, migrations, and tests as descriptive installed truth.
5. Current first-party Eximbay documentation for provider protocol facts.

Preparation observed the required clean tracked baseline:

```text
HEAD / main / origin/main:
  7cce841b551b0b37f83a2913df4d3e554c5799eb

tree:
  f16567af694d19288613b4991f5cddecccc1d6cb
```

Current installed truth relevant to this design is:

- `Payment` already owns immutable `(provider, providerOrderId)` correlation,
  the financial-status axis, `attemptLifecycle`, remediation, and the eventual
  `providerPaymentKey`;
- `PaymentEvent` already owns a unique nullable `(provider, transmissionId)`
  claim, verified provenance, correlation, raw JSON custody, coarse processing
  status, attempts, and safe failure fields;
- `recordCapture` prohibits EXIMBAY callback-first `Payment` creation, accepts
  exact-attempt capture through `CaptureFacts.paymentId`, and includes
  `OUTCOME_UNKNOWN` in the exact pending-attempt recovery path;
- `completeFromCapture` is the only existing capture-to-commerce finalizer;
- the generic webhook pipeline explicitly rejects EXIMBAY and remains unchanged;
- EXIMBAY registry/routing is hard-disabled and unselectable; and
- the existing Eximbay parser preserves exact raw query text, applies bounded
  fail-closed grammar, and rejects literal unescaped `+`.

## 2. Current official-provider facts and explicit gaps

The following first-party pages were re-observed read-only on 2026-08-17:

- [Preparation steps following the SDK response](https://developer.eximbay.com/eng/eximbay/payment_linkage/preparing-fgkey.html);
- [Eximbay REST API reference](https://developer.eximbay.com/eng/eximbay/api_list/reference.html); and
- [JavaScript SDK / payment flow reference](https://developer.eximbay.com/eng/eximbay/api_sdk/javascript-sdk.html).

Only these supported facts are frozen:

- `status_url` is the merchant server-side payment-result processing path;
- browser `return_url` can be absent and is not sufficient financial authority;
- status result data is delivered in query-string form;
- status notifications may be duplicated and `transaction_id` is the
  documented duplicate/payment identity;
- the exact received query-string data is submitted as JSON field `data` to
  `POST /v1/payments/verify`;
- the status-result FGKey is newly generated from the result data and is not
  the READY FGKey;
- a successful `/verify` response establishes integrity of the submitted
  result data but returns only verification response semantics; it does not
  return the authoritative `SALE` fact set required by Mira;
- `POST /v1/payments/retrieve` supports inquiry by `transaction_id` or
  `order_id` and returns MID, order identity, transaction identity, amount,
  currency, status, and `transaction_date`;
- retrieval `SALE` means sale confirmed; `AUTH`, `REGISTERED`, and `NONE` are
  not admitted sale completion;
- the documented success acknowledgement body is exactly
  `rescode=0000&resmsg=Success`; and
- the documented failure acknowledgement is only the template
  `rescode=[Error code]&resmsg=[Error message]`.

The following remain explicit documentation gaps and are not provider facts:

```text
EVIDENCE_GATED_TRANSPORT_CONSTANTS:
  callback HTTP method
  whether the exact query-string-form bytes arrive in URL query, request body,
    or both in every environment
  callback request content type
  acknowledgement HTTP status and content type
  merchant-selected failure acknowledgement code and message
  /verify retry semantics
  /retrieve retry semantics
  transaction_date timezone
  literal + encoding behavior
```

No current official fact materially contradicts installed EX2B2 authority.
No Eximbay API, SDK asset, credential, READY FGKey, or status FGKey was used.

## 3. Assurance boundary

```text
GUARANTEES:
  preserve the exact received status query required by /verify
  never compare or reuse READY FGKey and status FGKey
  treat callback fields as untrusted until /verify
  correlate only a pre-existing EXIMBAY Payment by immutable providerOrderId
  never create a callback-first EXIMBAY Payment
  do not assign Payment.providerPaymentKey before verified, retrieved, exact SALE admission
  at most one automatic /verify per committed contact-capable claim
  at most one automatic /retrieve contact per durable callback claim
  once exact raw has a durable definitive-reject tombstone, automatic /verify for it is forever zero
  no provider contact before claim admission commits after a post-claim tombstone recheck
  no automatic provider retry after ambiguous contact
  require authoritative SALE plus exact server-fact matches before completeFromCapture
  use completeFromCapture as the only commerce finalizer
  emit success acknowledgement only from an eligible durable terminal local disposition
  keep EXIMBAY routing disabled

NON-GOALS:
  refunds, disputes, chargebacks, void/cancel execution, or Eximbay remediation automation
  generic webhook-pipeline generalization
  an Eximbay-specific order or commerce finalizer
  callback transport activation or E2
  merchant/account capability adjudication
  retention-system construction
  schema evolution

THREAT BOUNDARY:
  public untrusted callback bytes through durable claim, one verify, one retrieve,
  exact sale admission, existing generic completion, and acknowledgement rendering

TRUSTED ASSUMPTIONS:
  current database constraints and transaction isolation remain installed
  persisted Payment facts and mode-bound server configuration are authoritative
  completeFromCapture preserves its reviewed exact-attempt and commerce invariants
  server credential custody and fixed provider origins remain outside browser control

RESIDUAL RISKS:
  unresolved callback transport and failure-ack semantics
  provider retry/idempotency semantics for verify/retrieve are undocumented
  fail-closed contact markers can require human review even if no provider bytes left the host
  unresolved events can retain sensitive exact raw query until adjudication
  transaction_date timezone absence can reject a legitimate delayed completion

MACHINE-OWNED RESPONSIBILITIES:
  bounded exact ingress, durable claim/stage transitions, contact ceilings,
  strict response admission, exact correlation/money checks, generic completion delegation,
  raw minimization, redacted diagnostics, and routing dormancy

HUMAN-OWNED RESPONSIBILITIES:
  correctness review, transport evidence adjudication, credentials and merchant authority,
  ambiguous-contact inquiry, mismatch/remediation decisions, retention policy,
  source authorization, E2 authorization, and activation

SAFE STOP:
  retain durable claim and evidence; preserve blocking Payment exposure;
  make no further provider contact and emit no success acknowledgement unless eligible

BOUNDED RE-ENTRY:
  separately authorized operator inquiry or local-only completion replay from admitted stored facts;
  never infer provider non-effect from a missing response or cleared process memory
```

## 4. Chosen architecture and ownership

The adopted architecture is a dedicated dormant BF4 orchestrator under
Eximbay ownership:

```text
dedicated /api/payments/eximbay/status route
  ->
BF4 exact ingress
  ->
BF4 durable event claim
  ->
one verify contact
  ->
persist verified-integrity stage
  ->
one retrieve contact
  ->
strict SALE + identity/money admission
  ->
persist verified-sale facts
  ->
CaptureFacts(paymentId exact)
  ->
completeFromCapture
  ->
exact acknowledgement renderer
```

The generic webhook handler/pipeline stays unchanged and continues rejecting
EXIMBAY. BF4 does not add an Eximbay commerce finalizer and does not route
through the generic pending-attempt fallback.

### 4.1 No-schema-change decision

```text
NO_SCHEMA_CHANGE_REQUIRED
```

This decision is conditional on the closed event envelope and transition table
in this contract being implemented exactly. A source review that proves the
existing owners cannot meet a frozen transition or contact ceiling must stop
for human adjudication; it must not silently add schema.

The existing `@@unique([provider, transmissionId])` constraint can own all
three non-null, provider-scoped claim classes below because their deterministic
prefixes are disjoint: active transaction claims, raw fallback claims, and
exact rejected-raw tombstones. `PaymentEvent.raw` owns the exact-raw hash and
closed stage evidence. Under PostgreSQL `READ COMMITTED`, a unique insert for
an active key waits for a concurrent owner of that key to resolve; if that
owner rotates to a tombstone and releases the active key, the waiting insert
can succeed only after the rotation can be observed by the required fresh
post-insert tombstone-read statement in the same claim-admission transaction.
That transaction rolls back the new event if the tombstone is then present.

Definitive rejection mutates the same `PaymentEvent.transmissionId` from its
active namespace to its tombstone namespace in the same database transaction
as terminal evidence. Claim admission uses the same unique constraint,
envelope, transaction behavior, and rollback; it neither needs a second owner
nor stores a plaintext transaction ID in the unique key. Therefore the
corrected admission and reject transitions remain atomic with the existing
schema and do not require an advisory-lock subsystem, table, column, enum,
lease, worker, or generic claim service.

### 4.2 Durable owner map

`Payment` owns:

- `providerOrderId`: immutable server-owned callback correlation;
- `attemptLifecycle=OUTCOME_UNKNOWN`: provider-payment ambiguity before an
  admitted financial success;
- `providerPaymentKey`: assigned only from authoritative verified/retrieved
  exact SALE admission; and
- existing status, remediation, completion, blocking, and suspension fields:
  owned only by generic completion/remediation semantics.

`PaymentEvent` owns one callback contact/replay protocol:

- `provider=EXIMBAY`;
- `source=WEBHOOK`;
- `transmissionId`: unique namespaced active claim or exact rejected-raw
  tombstone;
- `eventType`: closed BF4 event type and envelope version;
- `verifiedMode` and `verifiedCredentialBinding`: null until verification
  authority is admitted, then populated from mode-bound server authority;
- `checkoutSessionId`: exact persisted correlation loaded from the existing
  Payment;
- `providerPaymentKey`: null until exact SALE admission, then the admitted
  transaction identity;
- `raw`: the closed versioned BF4 envelope below; and
- existing coarse status/failure fields: outer processing disposition only,
  never the BF4 crash/contact state machine.

The closed event type is `EXIMBAY_STATUS_V1`. Outer status maps only as:

```text
RECEIVED:
  every active, pending, ambiguous, non-SALE-adjudication, or mismatch-adjudication stage
RETRYABLE_FAILED:
  COMPLETION_RETRYABLE
PROCESSED:
  TERMINAL_PROCESSED
FAILED:
  TERMINAL_REJECTED
IGNORED:
  unused by automatic BF4 processing
```

## 5. Closed BF4 event envelope

`PaymentEvent.raw` must validate as this single closed schema before any
automatic re-entry:

```text
schema:
  mira.eximbay.bf4-event

version:
  1

stage:
  CLAIMED_PRE_VERIFY
  VERIFY_OUTCOME_UNKNOWN
  VERIFIED_PENDING_RETRIEVE
  RETRIEVE_OUTCOME_UNKNOWN
  VERIFIED_SALE_PENDING_COMPLETION
  VERIFIED_NON_SALE_REQUIRES_ADJUDICATION
  VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION
  COMPLETION_RETRYABLE
  TERMINAL_PROCESSED
  TERMINAL_REJECTED

exactRawQuery:
  bounded string, present only while verify/ambiguity/completion recovery needs it

exactRawSha256:
  lowercase 64-hex SHA-256, always retained

candidate:
  allowlisted optional orderId and transactionId while unresolved
  callback result code only when needed for safe disposition

verification:
  NOT_ATTEMPTED | OUTCOME_UNKNOWN | ADMITTED | DEFINITIVELY_REJECTED

retrieval:
  NOT_ATTEMPTED | OUTCOME_UNKNOWN | ADMITTED_NON_SALE |
  ADMITTED_SALE | ADMITTED_SALE_MISMATCH

saleFacts:
  only after admitted retrieval; allowlisted MID, providerOrderId,
  transactionId, currency, amount wire string, decoded amount minor,
  status, and bounded transactionDate evidence

timestamps:
  receivedAt, stageChangedAt, verifyContactMarkedAt,
  retrieveContactMarkedAt, terminalAt as applicable

diagnostic:
  one closed safe code; no interpolated provider/customer value
```

Unknown envelope keys, versions, stages, dispositions, types, or over-bound
values fail closed to human review. The envelope never contains a credential,
Authorization value, READY FGKey, normalized/reconstructed raw query, general
provider response body, stack trace, or analytics payload. The exact raw query
is the only permitted raw provider payload, and only while required.

After definitive verification rejection, terminal completion, or terminal
rejection that needs no human resolution, exact raw and plaintext candidate IDs
are replaced by hashes plus allowlisted normalized facts/diagnostics. An
unresolved ambiguous, non-SALE-adjudication, or sale-mismatch event may retain
exact raw until human resolution.

### 5.1 New-mechanism justification

```text
FAILURE WITHOUT IT:
  crash/duplicate cannot determine whether verify/retrieve may be repeated

SIMPLER ALTERNATIVE:
  new database state/table

WHY INSUFFICIENT:
  existing Json event custody plus closed validators is sufficient and avoids a
  migration/parallel truth owner

ASSURANCE GAIN:
  HIGH

COMPLEXITY COST:
  MEDIUM and localized
```

## 6. Exact ingress, claim, replay, and rotation

Ingress must preserve the exact raw query representation before decoding or
normalization and compute SHA-256 over its exact UTF-8 bytes. Existing limits
and fail-closed grammar remain authoritative: 16,384 raw bytes, 64 pairs,
bounded keys/values, unique decoded names, strict percent decoding, prohibited
character rejection, and literal unescaped `+` rejection.

The three collision-free, provider-scoped `transmissionId` namespaces are:

```text
ACTIVE TRANSACTION CLAIM:
  eximbay:status:tx:v1:<sha256(UTF-8 exact candidate transaction_id)>

RAW FALLBACK CLAIM:
  eximbay:status:raw:v1:<exactRawSha256>

DEFINITIVE-REJECT TOMBSTONE:
  eximbay:status:reject:v1:<exactRawSha256>
```

The active transaction namespace is used for a success-shaped callback with a
bounded candidate `transaction_id`. If a no-transaction-ID callback is
supported, it may use only the raw fallback namespace. Absent IDs never
collapse into a null/common claim. The transaction candidate is untrusted at
claim time; the active claim is only a concurrency/contact fence. Namespace
keys contain hashes, not plaintext transaction IDs.

Acquire the bounded exact raw query, compute `exactRawSha256` over its exact
UTF-8 bytes before database mutation, then perform bounded parsing and the
read-only exact Payment correlation in §7. A callback with no exact
pre-existing Payment fails closed without a new PaymentEvent claim, Payment
mutation, or provider contact.

Provider-contact admission is this closed database protocol:

```text
CLAIM ADMISSION TX — PostgreSQL READ COMMITTED:
  1. begin after exactRawSha256 and exact Payment correlation are established
  2. read eximbay:status:reject:v1:<exactRawSha256>
  3. if present, return its durable terminal rejection without a new claim
  4. otherwise insert the contact-capable active transaction claim, or the raw
     fallback claim when supported, together with correlated checkoutSessionId
     and the initial CLAIMED_PRE_VERIFY envelope
  5. after that new claim insert succeeds, re-read the same reject tombstone in
     a fresh READ COMMITTED statement inside this transaction
  6. if now present, roll back the entire claim-admission transaction and replay
     the existing tombstone disposition locally
  7. only if still absent, commit the contact-capable claim
  8. only after that commit may the existing precontact marker transition and
     then /verify contact begin
```

The initial tombstone read is not sufficient by itself. A concurrent request
already owning the same active transaction key prevents a contending unique
insert from succeeding until the owner resolves. If the owner atomically
rotates `tx:T` to `reject:H`, the contender can acquire `tx:T` only after that
conflict resolves; its required fresh post-claim statement then observes the
committed `reject:H` and rolls back before contact. If the unique operation
instead resolves to an existing active or ambiguous claim, the request is a
duplicate and cannot acquire new contact authority. It first proves the stored
correlation/raw hash matches and renders the response from the durable stage.
Any same-claim correlation or raw-hash conflict fails closed without contact.

The raw fallback namespace follows the identical precheck, unique acquisition,
fresh post-claim tombstone recheck, rollback, and after-commit contact rule.
Thus the same exact raw cannot obtain a provider-contact-capable raw claim if
its tombstone is durable or becomes durable during claim acquisition.

When either tombstone check succeeds, `/verify`, `/retrieve`, completion,
Payment financial mutation, and new durable contact claims are all zero. A
post-claim detection rolls back the newly inserted event; the existing
tombstone remains the sole negative replay evidence. No second terminal event
is created solely for the replay.

If `/verify` definitively rejects the exact raw query after a fully admitted
response, the same database transaction must rotate the claim and write the
terminal evidence:

1. set verification disposition `DEFINITIVELY_REJECTED`;
2. remove exact raw when no longer needed;
3. retain only hashed/redacted candidate evidence; and
4. mutate `PaymentEvent.transmissionId` from the active transaction claim to
   `eximbay:status:reject:v1:<exactRawSha256>`.

For a raw fallback claim, the same transaction rotates that claim to the
definitive-reject namespace. The rotation releases the active transaction
namespace for a later different legitimate raw while reserving the rejected
exact-raw namespace as durable negative replay evidence. It never clears the
claim to null. The unique constraint and compare-and-set transition ensure
that only one row can own the tombstone.

If verify is ambiguous, the claim remains. After verify succeeds, the claim is
never released merely because retrieval, completion, or acknowledgement fails.
A forged callback therefore cannot permanently poison a legitimate later,
different notification solely through a definitive verification rejection,
and replay of the identical rejected raw cannot trigger verification again.

## 7. Payment correlation and server authority

After bounded exact ingress and before claim/provider contact, untrusted
`order_id` may locate only:

```text
Payment.provider = EXIMBAY
Payment.providerOrderId = exact candidate order_id
```

The lookup must resolve exactly one pre-existing Payment. Database uniqueness
enforces at most one; zero rows fail closed without Payment creation. The
orchestrator loads and thereafter uses only server-owned:

- payment ID;
- checkout session ID;
- persisted mode;
- amount minor;
- currency;
- immutable provider order ID;
- lifecycle, financial status, remediation, and blocking state; and
- expected MID from the mode-bound server configuration.

Callback order, amount, currency, MID, transaction status, and browser/current
route state are never final authority. BF4 always supplies exact `paymentId`
to `CaptureFacts`; it never invokes the generic pending-attempt fallback.

## 8. Provider contact sequence and ceilings

### 8.1 Common transport discipline

Both contacts use a fixed mode-bound HTTPS origin and literal path, server-only
credential, `redirect: error`, no URL/header injection, a 15-second deadline,
at most 64 KiB response bytes, at most 256 chunks, fatal UTF-8 decoding, exact
JSON media admission, one root JSON object, duplicate protected-key rejection,
closed required types, safe error codes, and no body/header logging. These are
Mira design controls, not claims about undocumented provider response behavior.

An attempt is consumed before delegation: the event stage is atomically moved
to the applicable `*_OUTCOME_UNKNOWN` marker before fetch can begin. This may
produce a conservative false-positive unknown if the process crashes before
network bytes leave the host; it is required to preserve the contact ceiling.
The claim-admission transaction and the contact-marker transaction both commit
before delegation. No database transaction remains open during `/verify`.

### 8.2 Verify

After the durable claim and exact Payment correlation:

1. atomically move `CLAIMED_PRE_VERIFY` to `VERIFY_OUTCOME_UNKNOWN` and set
   `verifyContactMarkedAt`;
2. make at most one POST to mode-bound `/v1/payments/verify`;
3. send the exact status query unchanged as JSON `data`; and
4. admit only a fully bounded response with exact `rescode=0000`.

`rescode=0000` admits integrity of the submitted result only. It does not
admit `SALE`, money, identity, or completion. Timeout, abort/reset, response
loss, redirect, non-2xx, malformed/oversized response, wrong media, decoding
failure, or uncertain send leaves `VERIFY_OUTCOME_UNKNOWN`. Automatic verify
retry is zero.

A fully admitted definitive verification rejection writes terminal rejection
and atomically rotates the untrusted active claim into the exact-raw rejection
tombstone exactly as §6 specifies. Current official documentation does not
classify a particular non-`0000` response as that definitive rejection.
Therefore a well-formed non-success that lacks separately admitted rejection
semantics remains `VERIFY_OUTCOME_UNKNOWN`; it does not release the active
claim. A definitive classification requires reviewed first-party or sandbox
evidence. Neither case mutates Payment financial state.

The source-level contact obligation is:

```text
CONTACT ADMISSION INVARIANT:
  1. at most one automatic /verify per committed contact-capable claim
  2. once exact raw H has a durable definitive-reject tombstone, automatic
     /verify for H is forever zero
  3. no provider contact may begin until the contact-capable claim transaction
     commits after its post-claim reject-tombstone recheck
```

A reject tombstone therefore consumes zero provider contacts on replay.
Verification ambiguity still permits zero automatic retry. The one-retrieve
ceiling and its zero-retry policy are unchanged.

### 8.3 Retrieve

Only durable `VERIFIED_PENDING_RETRIEVE` may begin retrieve:

1. atomically move to `RETRIEVE_OUTCOME_UNKNOWN` and set
   `retrieveContactMarkedAt`;
2. make at most one POST to mode-bound `/v1/payments/retrieve`;
3. use verified candidate `transaction_id` as primary retrieval identity; and
4. compose request MID/order/currency/amount/language only from verified
   candidate identity plus persisted server facts, never browser/current-route
   state.

The same fixed-origin, redirect, timeout, byte/chunk, UTF-8, media, JSON,
credential, and redaction controls apply. Automatic retrieval retry is zero.

Exact sale admission requires all of:

```text
rescode = 0000
status = SALE
MID = expected mode-bound MID
providerOrderId = persisted Payment.providerOrderId
transactionId = verified candidate transaction_id
currency = persisted Payment.currency
amount minor = persisted Payment.amount
```

`AUTH`, `REGISTERED`, `NONE`, unknown/absent status, malformed responses,
identity or money mismatch, and ambiguous retrieval do not enter generic
completion. An admitted `AUTH`, `REGISTERED`, or `NONE` observation moves to
`VERIFIED_NON_SALE_REQUIRES_ADJUDICATION`, retains the claim, uses
`OUTCOME_UNKNOWN` for the blocking attempt when transition-safe, and permits no
automatic retrieval retry; it is not treated as proof that the same provider
transaction can never later become `SALE`. Only after exact sale admission may
`Payment.providerPaymentKey` and `PaymentEvent.providerPaymentKey` receive the
authoritative transaction ID.

## 9. Durable ordering and crash/replay table

`yes-once` means the owner may first persist the conservative contact marker
and then make its single automatic contact. `human only` always requires new,
separate authority.

| Crash/replay point | Durable evidence | Verify may run | Retrieve may run | Local completion may resume | Duplicate response | Human re-entry |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Before event claim | none | no; first create claim | no | no | no event-owned response | resend may create first claim |
| 2. After claim, before verify marker | `CLAIMED_PRE_VERIFY`, exact raw/hash, correlation | yes-once via atomic unknown marker | no | no | stored non-success transport disposition | no, unless state/correlation invalid |
| 3. Verify contact may have begun | `VERIFY_OUTCOME_UNKNOWN`, claim retained | no | no | no | stored ambiguous disposition; never recontact | required for inquiry/adjudication |
| 4. Verify success observed, not persisted | still `VERIFY_OUTCOME_UNKNOWN` | no | no | no | stored ambiguous disposition | required; absence of persisted success proves no zero effect |
| 5. Verified stage durable, before retrieve marker | `VERIFIED_PENDING_RETRIEVE`, admitted verification provenance | no | yes-once via atomic unknown marker | no | stored pending disposition | no unless local state invalid |
| 6. Retrieve contact may have begun | `RETRIEVE_OUTCOME_UNKNOWN` | no | no | no | stored ambiguous disposition | required for inquiry/adjudication |
| 7. Retrieve SALE observed, not persisted | still `RETRIEVE_OUTCOME_UNKNOWN` | no | no | no | stored ambiguous disposition | required; never reconstruct from process memory |
| 8. Sale evidence durable, before completion | `VERIFIED_SALE_PENDING_COMPLETION`, exact safe sale facts and provider key | no | no | yes | retryable local disposition | not for ordinary local replay |
| 9. Capture persisted, completion transaction retryable | `COMPLETION_RETRYABLE`; Payment is exact captured attempt | no | no | yes from stored sale facts and exact payment ID | retryable local disposition | only after bounded local retries/task authority is exhausted |
| 10. Terminal local completion/remediation, before ack | `TERMINAL_PROCESSED` or `TERMINAL_REJECTED`, raw minimized | no | no | no | render exact stored terminal disposition | only for terminal reject/reconciliation policy |
| 11. Ack response lost | same terminal stage | no | no | no | duplicate renders same acknowledgement without provider contact | none for processed; human only for unresolved reject |
| A. Tombstoned exact rejected raw is replayed | `TERMINAL_REJECTED`, exact-raw hash, and reject tombstone | no | no | no | render durable terminal rejection; zero provider contact | none for identical raw |
| B. Duplicate arrives while verify may be in flight | active transaction/raw claim plus `VERIFY_OUTCOME_UNKNOWN` | no second verify | no | no | render active/ambiguous stored disposition | required only for ambiguity adjudication |
| C. Different legitimate raw arrives for the same transaction after reject rotation | old exact raw remains tombstoned; active transaction namespace is free | yes-once for the new durable claim | only after its admitted verification | only after its own admitted sale facts | old raw replays terminal rejection; new raw follows its own claim | ordinary gates for the new claim |
| D. Crash between definitive rejection and claim rotation | atomically either the pre-rotation active claim remains, or `TERMINAL_REJECTED` plus reject tombstone is durable | no retry for retained active claim; no verify for tombstone | no | no | conservative active disposition or durable terminal rejection | human adjudication only if pre-rotation; never release without durable exact-raw negative replay evidence |
| TOCTOU-A. Tombstone commits after precheck but before transaction claim succeeds | concurrent owner commits `tx:T` to `reject:H`; contender's unique insert proceeds only after that conflict resolves | no; fresh post-claim recheck observes `reject:H` and the contender transaction rolls back | no | no | replay existing tombstone; no new durable claim | none for identical raw |
| TOCTOU-B. Tombstone absent at both claim-admission checks | committed `CLAIMED_PRE_VERIFY` contact-capable claim with exact raw/hash and correlation | yes-once through the existing precontact marker | no | no | stored precontact disposition | no unless state/correlation invalid |
| TOCTOU-C. Crash after active claim commit but before `/verify` | committed `CLAIMED_PRE_VERIFY`; no provider-contact marker or proof | yes-once only through existing precontact re-entry; no same-request retry, second claim, or second contact path | no | no | reuse the committed claim; never infer contact occurred | no unless state/correlation invalid |

No row infers zero provider effect from absence of a response. Envelope writes
must use compare-and-set on the expected prior stage so concurrent duplicates
cannot cross the same contact boundary. `TERMINAL_REJECTED`, raw minimization,
and active-claim-to-tombstone rotation commit together; a crash cannot expose a
released transaction namespace without durable recognition of the exact
rejected raw. Claim admission likewise cannot commit after a concurrent
same-raw tombstone becomes visible: the mandatory post-claim recheck rolls it
back before any provider contact.

## 10. Ambiguous Payment policy

For verify/retrieve ambiguity before exact sale admission:

- retain the PaymentEvent claim and unresolved envelope;
- transition the exact correlated Payment to
  `attemptLifecycle=OUTCOME_UNKNOWN` only when a compare-and-set proves it is
  the same blocking EXIMBAY attempt, has no financial success/payment key, has
  `remediationStatus=NONE`, and is in a transition-safe contacted state;
- treat an already exact `OUTCOME_UNKNOWN` state as idempotent;
- preserve `blockingEndedAt=null` and the active exposure;
- do not set financial success;
- do not automatically set remediation before capture; and
- do not automatically recontact either endpoint.

If the Payment is finalized, superseded, suspended, terminal, remediating,
identity-divergent, or otherwise cannot safely transition, the event stops for
human adjudication. BF4 does not invent a second lifecycle.

An authoritative `SALE` response that exactly matches transaction, order, and
MID but fails money equality is post-success reconciliation exposure, not
pre-sale contact ambiguity. It moves to
`VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION`, sets the exact Payment to
`OUTCOME_UNKNOWN` plus existing `RECONCILIATION_REQUIRED` when transition-safe,
and retains the event claim/evidence. It does not set financial `SUCCEEDED`,
assign `providerPaymentKey`, enqueue unsupported Eximbay remediation, or enter
completion. An identity/MID mismatch cannot establish that the SALE belongs to
the Payment and therefore does not automatically set Payment remediation; it
stops with the event evidence for human adjudication. Any human clearing or
promotion is separate authority.

A separately authorized operator inquiry may retrieve authoritative status.
If exact SALE is later admitted from durable provider authority, the operator
may install the safe sale facts and resume the existing exact-attempt
`recordCapture` path. Operator inquiry or re-entry is not authorized by this
contract.

## 11. Verified sale and generic completion

Only after verification plus exact retrieval admission:

1. persist `VERIFIED_SALE_PENDING_COMPLETION` with safe sale facts;
2. persist admitted mode/credential provenance, checkout session ID, and
   provider transaction identity on `PaymentEvent`;
3. construct the existing `TrustedEximbayCompletionCandidate`;
4. map it to existing `CaptureFacts` with exact `paymentId`, server-owned
   checkout session/mode/amount/currency, `provider=EXIMBAY`, admitted
   transaction ID, and callback `receivedAt`;
5. omit `capturedAt` until provider timezone authority exists; and
6. call `completeFromCapture`.

No Eximbay-specific order finalizer is permitted.

### 11.1 Completion and acknowledgement dispositions

| Local/provider disposition | Durable BF4 stage | Provider recontact | Acknowledgement semantic |
| --- | --- | --- | --- |
| `completed` | `TERMINAL_PROCESSED` after raw minimization | none | exact documented success body |
| `alreadyCompleted` for same exact Payment | `TERMINAL_PROCESSED` | none | exact documented success body |
| `compensationEnqueued` | `TERMINAL_PROCESSED`; merchant-owned durable handling | none | exact documented success body permitted |
| local `retryableFailure` | `COMPLETION_RETRYABLE` | none | non-success/retry transport; no success body |
| `compensationSkipped` or terminal local failure | `TERMINAL_REJECTED` with human stop | none | no success body until human terminal adjudication |
| verified `AUTH` / `REGISTERED` / `NONE` | `VERIFIED_NON_SALE_REQUIRES_ADJUDICATION`; claim retained | none | no success body before human terminal adjudication |
| authoritative `SALE` with identity/money mismatch | `VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION`; Payment may use existing post-success reconciliation semantics | none | no success body before human adjudication |
| ambiguous verify/retrieve | corresponding `*_OUTCOME_UNKNOWN` | none | non-success/retry transport; no success body |
| definitive verify rejection | `TERMINAL_REJECTED` plus atomic active-claim-to-exact-raw-tombstone rotation | none; identical raw is answered locally from the tombstone | evidence-gated failure acknowledgement, not invented success |

`compensationEnqueued` means only that Mira durably owns the local follow-up.
Actual Eximbay cancellation/refund/remediation execution and automation remain
separate and unauthorized. Pre-sale ambiguity never sets remediation merely
to reuse this disposition.

## 12. Raw-data minimization and retention

The exact status query may contain buyer and payment metadata. BF4 freezes:

- never log exact raw or interpolate it into errors, analytics, traces, or
  metrics;
- restrict database access under existing payment-data controls;
- retain exact raw only for verify, ambiguity adjudication, or local completion
  recovery;
- after terminal processed/rejected disposition, replace exact raw with
  SHA-256 plus allowlisted normalized facts/diagnostics;
- allow unresolved ambiguous, non-SALE-adjudication, or sale-mismatch events to
  retain exact raw until human resolution;
- never retain a credential, Authorization value, READY FGKey, or a general
  `/verify`/`/retrieve` response body; and
- create no new general retention service in BF4.

The repository does not currently prove a time-based policy for unresolved
payment callback raw data. That is an explicit human operations/privacy gate
before activation; it is not solved by this source design.

## 13. Acknowledgement boundary and evidence-gated transport

The only frozen provider acknowledgement bytes are:

```text
rescode=0000&resmsg=Success
```

The callback method, raw carrier, request content type, acknowledgement HTTP
status/content type, and merchant-selected failure code/message remain
`EVIDENCE_GATED_TRANSPORT_CONSTANTS`. A later dormant source task may install
one exact raw carrier with no query/body merge, but must label its method,
status, content-type, and failure response as
`DESIGN_CHOICE / REQUIRES SANDBOX EVIDENCE`. It must remain unrouted and may
not use that choice as provider authority.

E2 remains blocked until actual callback transport and acknowledgement
behavior are observed in separately authorized sandbox evidence or directly
clarified by first-party authority.

## 14. Timestamp and literal-plus policy

The documented `transaction_date` format is `YYYYMMDDHHMMSS`; its timezone is
not documented. Until exact timezone authority exists, BF4 may preserve the
bounded string as provider evidence but must not convert it into authoritative
`capturedAt`. Callback `receivedAt` is the conservative completion timestamp.
This can reject a legitimate delayed callback whose session expired between
provider sale and callback receipt; that false-negative availability risk is
accepted pending evidence.

The current `status.ts` literal-unescaped-`+` rejection remains fail-closed.
BF4 does not broaden form-style plus interpretation. Any change requires
sandbox callback evidence and a new reviewed design/version.

## 15. Dormancy, rollback, and downstream gates

BF4 source must be installable dormant:

- EXIMBAY routing remains disabled;
- no production SDK consumer is created;
- `request_pay` is not invoked;
- no customer, sandbox/LIVE, or account-bound credential activation occurs;
- no generic webhook registration selects EXIMBAY; and
- no source merge is treated as provider-contact authority.

Documentation rollback is a revert of an eventual reviewed documentation
merge. A future source rollback must preserve every durable claim, unknown
outcome, verified sale, captured Payment, completion, and remediation record;
it must never rewrite an ambiguous contact as uncontacted.

```text
E1B:
  CLOSED / ADMITTED / NOT REOPENED

E2 REQUIRES:
  BF4 source/review/evidence readiness
  + separately adjudicated merchant/sandbox authority
  + separate one-shot E2 execution authority

POST-INSTALLATION NEXT GATE:
  separately authorized dormant BF4 source implementation task

BF4 PROVIDER EXECUTION AUTHORITY:
  NONE

E2 AUTHORITY:
  NONE / BLOCKED
```

## 16. Change control

A new reviewed contract version is required for any change to the ingress raw
carrier, stage vocabulary, transmission namespace/rotation, contact marker or
ceiling, retry policy, correlation authority, provider response admission,
sale predicates, Payment/PaymentEvent ownership, completion owner,
acknowledgement semantics, raw retention, timestamp/plus policy, schema,
routing, provider contact, or activation. Source/status/runbook/activation
artifacts remain separate lifecycle records under the Feature Documentation
Standard.
