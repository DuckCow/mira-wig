# Eximbay BF4 `status_url` Verification / Retrieval / Completion — Source Status / As-Built v0.1

## Status

```text
DOCUMENT CLASS: SOURCE STATUS / AS-BUILT
RISK CLASS: HIGH — PAYMENT / PROVIDER CALLBACK / CHECKOUT RECOVERY
TASK CLASSIFICATION: DOCUMENTATION_ONLY
VERSION: v0.1
SOURCE: MERGED / INSTALLED
BF4 STATUS ROUTE: WIRED / FLAG-GATED / DEFAULT OFF
CHECKOUT RECOVERY: WIRED / FLAG-GATED / DEFAULT OFF / SANDBOX ONLY
LIVE / PRODUCTION AUTHORITY: NONE
```

This document records the BF4 callback, provider-contact, Q004 checkout
recovery, and late-result behavior installed at commit
`82d0aa10367d73c68f427522c6486caa259deb17`, tree
`7f8d7e51ebf5fee66a5f2764115311d0c1f5aa67`. It is a current source map, not
an activation record, provider communication, or claim that a provider request
has run.

## Artifact admission

```text
FAILURE MODE:
  A future callback, checkout-recovery, or activation task could read the
  design's historically correct pre-installation status or the provider
  ledger's stale response-header comparison and miss the installed behavior.
WHAT FAILS WITHOUT THIS ARTIFACT:
  Exact gates, one-contact ceilings, durable claim/event ownership, Q004
  release semantics, late-SALE branches, and the separation of financial,
  attempt-lifecycle, and remediation axes remain scattered across source,
  migrations, tests, and merge history.
WHY SOURCE / TESTS / PR HISTORY ARE INSUFFICIENT:
  The subsystem crosses route ingress, provider contact, completion, session
  resumption, retry identity, schema, and recovery. Its default-off state also
  makes reachability and activation authority easy to conflate.
WHO WILL USE IT AND WHEN:
  Future BF4 correctness, provider-evidence, checkout-recovery, sandbox
  activation, incident, and production-readiness work.
ASSURANCE GAIN:
  One current record distinguishes installed capability from runtime
  activation and provider evidence while preserving the normative v0.2
  design/threat boundary.
MAINTENANCE COST:
  A successor Source Status is required after a material ownership, schema,
  gate, provider-contact, recovery, or activation change.
DISPOSITION: ADD
```

This disposition applies the
[Feature Documentation Standard v0.2](./feature-documentation-standard-v0.2.md).

## Authority and historical custody

The authority planes remain separate:

| Record | Authority in its declared scope |
|---|---|
| [BF4 Design Contract v0.2](./eximbay-bf4-status-verification-completion-design-contract-v0.2.md) | Current normative BF4 responsibility and transition contract, including money-mismatch ownership |
| [BF4 Threat / Failure Model v0.2](./eximbay-bf4-status-verification-completion-threat-model-v0.2.md) | Current normative hostile-input, ambiguity, concurrency, replay, and re-entry model |
| This Source Status | Current installed source, schema, routing, gates, and tested behavior at the recorded baseline |
| [Provider communication ledger](./eximbay-provider-communication-evidence-v0.1.md) | Provider-supplied wording and unresolved provider facts, not Mira runtime truth |
| [Checkout-recovery support reply](../payment_policy/provider_research/eximbay/eximbay_checkout_recovery_support_reply_2026-08-25.md) | Recovered provider evidence for order-ID retrieval and Q004, not source authority |

The v0.2 Design/Threat files remain normative within their declared scopes and
remain unchanged. Their statements that BF4 source was then not installed are
historical installation-time facts; they do not override later merged source.
Conversely, this document does not revise their normative semantics.

The preserved v0.3 workset is not installed, copied into, or linked as current
authority by this record. No plan, review, fixture, or preserved candidate
grants runtime or provider-contact authority.

## Installed owner map

| Responsibility | Installed owner |
|---|---|
| App Router endpoint | `src/app/api/payments/eximbay/status/route.ts` |
| Route gate, ingress, response, and delegation | `src/lib/payment/eximbay/bf4-status-route.ts` |
| Raw form parsing and bounded diagnostics | `src/lib/payment/providers/eximbay/status.ts` and `redaction.ts` |
| Verify/retrieve HTTP contact | `src/lib/payment/eximbay/bf4-contact.ts` |
| Durable BF4 orchestration and ACK | `src/lib/payment/eximbay/bf4-engine.ts` |
| BF4 event envelope, stages, and replay | `src/lib/payment/eximbay/bf4-event.ts` and `bf4-envelope.ts` |
| Canonical financial completion | `src/lib/payment/complete/record-capture.ts` through `completeFromCapture` |
| Q004 checkout release | `src/lib/payment/eximbay/checkout-recovery.ts` |
| Authenticated recovery action | `src/app/actions/payment.ts` |
| Session blocker/resume decision | `src/lib/payment/session/resume.ts` |
| Fresh successor attempt and identity | `src/lib/payment/attempt/initiate.ts` and `provider-order-id.ts` |
| Durable model | `prisma/schema.prisma` and the BF4/recovery migrations |

The endpoint exports only `POST`, declares the Node.js runtime, and delegates to
the BF4 route owner with the database, request, process environment, and
injected global fetch implementation. The route/action boundaries do not own
payment-state transitions.

## Installation is not activation

Three independent exact-value gates are relevant:

| Gate | Disabled value | Enabled value | Every other value |
|---|---|---|---|
| `EXIMBAY_BF4_STATUS_ROUTE_ENABLED` | absent or exact empty string: route unavailable (`404`) | untrimmed exact `ENABLED`: BF4 route admitted | fail closed (`503`), including whitespace-only |
| `EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED` | absent, empty, or whitespace-only: recovery unavailable | untrimmed exact `ENABLED`: authenticated Q004 recovery admitted | configuration error / fail closed |
| `EXIMBAY_CHECKOUT_SANDBOX_ENABLED` | absent or exact empty string: customer sandbox checkout unavailable | untrimmed exact `ENABLED`: separately admits the installed sandbox checkout envelope | fail closed, including whitespace-only |

These keys are not aliases and enabling one does not enable another. Customer
checkout admission remains independently constrained to Eximbay `SANDBOX`, US
market, card payment, and USD. The BF4 route passes a `SANDBOX` caller ceiling;
persisted `LIVE` Payments are rejected before provider configuration or
contact. Nothing here authorizes credentials, provider contact, E2, LIVE, or
production activation.

## Callback ingress and parsing

The installed route admits only a query-free POST with:

- `Content-Type: application/x-www-form-urlencoded`, optionally with a UTF-8
  charset accepted case- and whitespace-insensitively;
- no content encoding, or `identity` after trimming and case normalization;
- a canonical content-length declaration, when available, preflight-checked
  against the byte limit; and
- a body no larger than 16,384 bytes and no more than 256 stream chunks.

The body is decoded as fatal UTF-8. Empty, unreadable, aborted, oversized,
over-chunked, or otherwise invalid input fails closed before orchestration.
The parser retains the exact raw body for provider verification and separately
decodes bounded form components. It permits at most 64 pairs, 128 UTF-8 bytes
per decoded key, and 4,096 UTF-8 bytes per decoded value. Form `+` decodes to a
space; an encoded `%2B` decodes to a literal plus.

Malformed percent escapes, invalid UTF-8, control characters, duplicate
decoded keys, missing or blank required fields, and a success callback without
`transaction_id` are rejected. Diagnostics expose only bounded codes and
aggregates, not raw values, decoded keys, credentials, or callback payloads.

## Provider contact and admission

The contact owner contains distinct Eximbay test and live verify/retrieve
URLs, but the BF4 engine's caller ceiling and persisted Payment mode must
agree. The currently wired route supplies `SANDBOX`; a live Payment cannot
reach configuration resolution or network contact through this path.

For an admitted existing Payment, the owner:

1. binds the persisted Eximbay MID and API credential;
2. sends the exact raw callback body to `/verify` as JSON `data`;
3. requires an exact admitted verify response; and
4. performs transaction-ID `/retrieve`, correlated to the persisted Payment,
   order identity, money, mode, and callback transaction identity.

The Q004 recovery path is separate: it performs one order-ID `/retrieve` and
omits `transaction_id`. A prepared contact object is executable once. The
client adds no built-in retry, follows no redirects, applies a 15-second
deadline, caps the response at 65,536 bytes and 256 chunks, and admits only a
JSON media type.

Verify responses admit only the exact bounded root `rescode`/`resmsg` shape.
Only `rescode=0000` establishes verify success. A well-formed provider
non-success is conservative `outcomeUnknown` with
`PROVIDER_NON_SUCCESS`; it is not terminal rejection. Generic retrieve admits
the bounded documented root/payment shape and rejects unknown keys. Transport,
timeout, body, media, JSON, redirect, and shape failures are also outcome
unknown and are not blindly retried.

## Durable claim, event, and authoritative completion

BF4 correlates only to a pre-existing Eximbay Payment by immutable
`providerOrderId`; callback-first Payment creation is not installed. Durable
claim/event stages and a contact-start marker are committed before external
verify/retrieve delegation. Compare-and-set stage transitions, exact replay,
and the one-shot contact object enforce at most one verify/retrieve sequence
per claimed transmission. Ambiguous contact does not reopen contact authority.

Financial success requires all of the following:

- admitted verify success;
- admitted retrieve success with transaction status exactly `SALE`;
- exact MID, provider order ID, provider transaction ID, and callback
  `transaction_type=PAYMENT` identity;
- exact persisted amount and currency; and
- a transition-safe Payment.

Only that trusted candidate delegates to `completeFromCapture`, the existing
commerce finalizer. BF4 does not independently construct an Order or mark a
Payment financially successful.

Non-`SALE` retrieval is retained for adjudication and does not complete. An
identity mismatch is event-owned and does not complete. A money mismatch is
handled according to Design v0.2: when the Payment can safely transition, the
event mismatch evidence and pre-success Payment `OUTCOME_UNKNOWN` lifecycle
commit atomically; remediation remains `NONE`, and no financial success,
provider key, blocking end, or Order is invented.

## ACK and provider-evidence boundary

The exact installed success acknowledgement body is:

```text
rescode=0000&resmsg=Success
```

A successful or terminally processed replay returns status `200` with
`Content-Type: text/html; charset=utf-8`, `Cache-Control: no-store`, and
`X-Content-Type-Options: nosniff`. Failure responses are empty and use
`text/plain; charset=utf-8`. A lost successful response can therefore be
replayed from durable terminal state without another provider contact.

Recovered provider wording is not rewritten to match source. Provider
authority for a trailing period after `Success` remains `UNRESOLVED`. The
exact total delivery count remains `PROVIDER_WORDING_CONFLICT` (three total
versus three retries/four total). Those provider facts are not required for
installed idempotence, and this document does not infer them.

## Q004 checkout recovery

The authenticated checkout action exposes recovery only when the independent
sandbox recovery gate is enabled and session ownership is established. The
session must have exactly one eligible Eximbay blocker and no unresolved
exposure, usable Order, or conflicting state. The blocker must be a sandbox
Payment in `INITIATED` or `AWAITING`, lifecycle `CONTACTED`, remediation
`NONE`, with contact-start and provider-order identity present and without a
provider payment key, financial success, blocking end, or suspension.

Before recovery, that exact blocker yields `PAYMENT_RECOVERY_AVAILABLE`. The
recovery owner performs one order-ID retrieve. Only the dedicated exact Q004
no-transaction observation releases the checkout slot. A transaction observed
or an unknown outcome does not release it.

The Q004 commit locks and re-reads the CheckoutSession and Payment, confirms no
claimed BF4 callback, creates a processed API PaymentEvent with transmission
identity `eximbay:checkout-recovery:q004:<paymentId>` and error/event code
`EXIMBAY_NO_TRANSACTION_OBSERVED`, then sets the Payment's
`blockingEndedAt` and diagnostic error. Replay of the exact committed event and
Payment state returns without another contact.

Release does not change financial or remediation truth. The Payment remains
`INITIATED` or `AWAITING`, lifecycle `CONTACTED`, remediation `NONE`, and
retains its provider order identity with no provider payment key or financial
success. `blockingEndedAt` is the checkout-slot axis; it is not a terminal
Payment status. With no other blocker, session resume becomes
`PAYMENT_ELIGIBLE`.

A new attempt after Q004 is a new Payment with a fresh immutable
`providerOrderId` and fresh `READY` contact authority. Reuse of the same FGKey
is not used as an attempt-identity guard and is covered by the installed
initiation tests.

## Late result after Q004 release

Late callbacks are admitted only with the exact durable Q004 release evidence.
The installed branches are:

| Successor state | Installed late-`SALE` result |
|---|---|
| No successor | reclaim the released slot and complete the old Payment through the canonical finalizer |
| Successor exists but is not contacted | supersede the successor, reclaim the old slot, and complete the old Payment |
| Successor contacted | record old financial success, suspend it, set remediation `PENDING`, link the successor, and enqueue cancellation-required remediation; do not create an old Order |
| Successor already owns the Order | preserve that Order and take the same suspension/remediation branch; do not create a second Order |

The cancellation-required diagnostic is
`EXIMBAY_LATE_SUCCESS_CANCELLATION_REQUIRED`. A late ambiguous result instead
leaves the old Payment `OUTCOME_UNKNOWN` with
`EXIMBAY_RELEASED_ATTEMPT_OUTCOME_UNKNOWN`; the prior blocking-end evidence
remains, but unresolved session exposure prevents another attempt. No branch
silently ignores provider-observed money, performs an unsafe recontact, or
creates two Orders.

## Durable model and migrations

The schema keeps financial `PaymentStatus`, `PaymentAttemptLifecycle`,
`PaymentRemediationStatus`, and `blockingEndedAt` as distinct axes. There is
no fabricated `NO_TRANSACTION` financial status. Provider payment key and
provider order identity are independently unique per provider; Order ownership
is unique by both checkout session and Payment.

The installed migration
`20260811120000_eximbay_ex2b1_provider_order_identity` adds the provider-order
identity, uniqueness, and immutability boundary. The migration
`20260825120000_eximbay_checkout_recovery` admits only the exact released
CONTACTED or released OUTCOME_UNKNOWN shapes with blocking-end and bounded
diagnostic evidence. Current schema and migrations, not this prose, remain the
database truth.

## Installed verification evidence

The narrow installed suites cover:

- contact request construction, exact raw-body custody, response admission,
  non-success ambiguity, limits, and Q004 diagnostics;
- engine correlation, sandbox ceiling, pre-contact markers, authoritative
  SALE, mismatch ownership, atomicity, concurrency, and replay;
- route gates, hostile ingress, form semantics, exact success response, and
  LIVE rejection;
- Q004 gate/admission, durable diagnostic, replay, late-result branches,
  ambiguity, races, and schema shapes; and
- fresh attempt identity after release, including a fresh provider order ID
  while accepting the same FGKey.

These tests are executable evidence of the baseline; they do not prove a live
Eximbay delivery or grant an environment activation.

## Residual boundary and next re-entry

The following remain outside this record:

- irreversible terminal-rejection authority for verify `rescode` values other
  than `0000`; the installed path keeps a well-formed non-success outcome
  unknown;
- resolving provider-owned ACK punctuation or exact retry-count wording;
- contacting Eximbay or using credentials;
- enabling any route, recovery, checkout, LIVE, or production setting;
- merchant production capability and provider credential readiness;
- future refund/cancel policy and financial closure, including any provider
  cancellation after a late success;
- changing the normative v0.2 design/threat contract;
- installing the preserved v0.3 candidate;
- changing source, tests, schema, migrations, dependencies, or runtime; and
- commit, push, PR, merge, release, or deployment.

Any future re-entry must start from the then-current source, schema,
migrations, tests, provider evidence, and applicable high-risk governance. It
must treat every gate and provider effect as separately authorized and must not
turn ambiguous prior contact into fresh contact authority.
