# Eximbay EX2A Pure Protocol Kernel — Design / Implementation Contract v0.1

## 1. Document control

| Field | Value |
|---|---|
| Document class | Design / Implementation Contract |
| Risk class | High — payment-provider protocol |
| Status | **CANDIDATE v0.1 — independent contract review required** |
| Task classification | `SOURCE_ONLY` |
| Task-level authorization | Documentation only |
| Repository baseline | `main` at `57642a4aa4b9e26bdddcc35a2eaa3acdf77dbf77` |
| Prior Eximbay boundary | PR #27, merge `4073d82d`, source `8ae90829` |
| Evidence review date | 2026-08-11 |

This candidate becomes source authority only after independent review and
accepted merge. Its existence in a working tree grants no implementation or
activation authority.

## 2. Prominent non-authority

This contract authorizes **no** provider network call, browser SDK load or
invocation, payment initiation, payment verification, payment completion,
database write, schema or migration change, runtime provider adapter, provider
factory entry, credential loading, endpoint configuration, route or server
action, routing eligibility, fallback eligibility, sandbox activation, live
activation, return handling, status ingress, inquiry execution, void,
cancellation, refund, refund-worker authority, tokenization, recurring payment,
manual capture, order creation, manufacturing creation, or deployment.

All external/network/browser/payment/refund/database authority remains `NONE`.
The current Eximbay runtime remains `NONE`; routing remains disabled; ingress
remains unavailable; and refund-worker provider authority remains
`TOSS_ONLY_EXPLICIT`.

| EX2A authority dimension | Frozen value |
|---|---|
| Classification | `SOURCE_ONLY` |
| Network authority | `NONE` |
| Provider contact, including test/live API | `NONE` |
| Browser authority | `NONE` |
| Payment activation | `NONE` |
| Refund/void authority | `NONE` |
| Database authority | `NONE` |
| MID/API-key or environment authority | `NONE` |

## 3. Governing evidence and precedence

This contract is subordinate to, and must be read with:

1. [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md).
2. The latest confirmed/open payment-policy pair:
   [confirmed v6](../payment_policy/payment_policy_confirmed_v6.md) and
   [open v6](../payment_policy/payment_policy_open_v6.md).
3. [Multi-PG priority and fallback v1](../payment_policy/multi_pg_priority_fallback_v1.md).
4. [Refund worker P3E-B2 dormant runtime authority v1](../payment_policy/refund_worker_p3e_b2_dormant_runtime_authority_v1.md).
5. Current source and `prisma/schema.prisma` at the repository baseline above.
6. Current official Eximbay documentation in the source register below.

If these sources conflict, repository policy and schema govern repository
authority; current official Eximbay documentation governs external protocol
facts; this contract must be revised rather than silently choosing an answer.
Historical Eximbay research is discovery evidence only:
[source index v1](../payment_policy/provider_research/eximbay/eximbay_source_index_v1.md),
[snapshot report v1](../payment_policy/provider_research/eximbay/eximbay_doc_snapshot_report_v1.md),
and [sales questions v1](../payment_policy/provider_research/eximbay/eximbay_sales_questions_v1.md).
They do not override current official pages or grant runtime authority.

## 4. Preserved EX1 boundary and repository facts

The previously merged EX1 slice introduced only the persisted provider identity
`EXIMBAY`. The provider registry hard-denies it: enabled modes, methods, and
currencies are empty; selection and initiation cannot route to it; the provider
factory has no Eximbay adapter, environment variable, credential, or endpoint.

The current payment architecture creates a `Payment` before provider contact.
`Payment.id` is distinct from `CheckoutSession.id`, and the payment row pins its
provider, mode, amount, currency, and routing facts. Provider fallback is allowed
only before payment-row creation. After creation, provider identity is immutable;
a retry requiring another provider is a new payment attempt.

No Eximbay protocol subtree currently exists under `src/lib/payment/**`. This
contract must not be interpreted as filling that absence until separately
authorized implementation work begins.

## 5. Official Eximbay source register

The following official pages were inspected on 2026-08-11. They are mutable
external sources and must be rechecked at each later slice's source-freeze date.

| Protocol fact | Official source |
|---|---|
| Integrated payment sequence and parameters | [Integrated payment](https://developer.eximbay.com/eng/eximbay/payment_linkage/windows-consolidation.html) |
| JavaScript SDK load and request shape | [JavaScript SDK](https://developer.eximbay.com/eng/eximbay/api_sdk/javascript-sdk.html) |
| API catalog and request/response models | [API reference](https://developer.eximbay.com/eng/eximbay/api_list/reference.html) |
| Payment preparation | [Preparing payment](https://developer.eximbay.com/eng/eximbay/payment_linkage/preparing-payment.html) |
| `/ready` and FGKey preparation | [Preparing FGKey](https://developer.eximbay.com/eng/eximbay/payment_linkage/preparing-fgkey.html) |
| Payment verification, exact status data, and duplicates | [Integrated payment — payment verification](https://developer.eximbay.com/eng/eximbay/payment_linkage/windows-consolidation.html) |
| Payment inquiry statuses | [Retrieve payment](https://developer.eximbay.com/eng/eximbay/payment_linkage/api-retrieve-payment.html) |
| Payment refund/cancel fields | [Cancel payment](https://developer.eximbay.com/eng/eximbay/payment_linkage/api-cancel-payment.html) |
| Currency minor units | [Currency codes](https://developer.eximbay.com/eng/eximbay/api_sdk/code-etc.html) |
| Payment method codes | [Payment method codes](https://developer.eximbay.com/eng/eximbay/api_sdk/code-organization.html) |

Only the facts explicitly frozen in this contract are accepted. A link in this
register is not wholesale acceptance of every statement on that page.

## 6. Accepted transaction model

EX2A accepts exactly Eximbay `transaction_type=PAYMENT`. Under the official
integrated-page model, `PAYMENT` performs payment authentication, authorization,
and acquiring as one flow.

The following are rejected and outside this contract: `confirm`, `PAYER_AUTH`,
`PAYMENT_PA`, `AUTHORIZE`, `AUTHORIZE_PA`, manual capture/acquiring, tokenization,
and recurring payment. No later implementation may infer support for those
models from a structurally similar field or endpoint.

## 7. Pure-kernel capability boundary

The eventual EX2A source slice may contain only deterministic, side-effect-free
protocol logic for:

- minor-unit amount encoding for USD and JPY;
- construction and validation of canonical payment-preparation facts;
- projections from those facts to `/ready` and browser-SDK requests;
- opaque provider-order identity typing and correlation rules;
- exact raw status-query carriage and bounded parsing;
- separation of unverified from verified data;
- validation of already-verified payment facts;
- exact duplicate-event comparison;
- safe redaction and diagnostics;
- inquiry-status classification constants for a later inquiry slice.

The kernel may not import provider SDKs, HTTP clients, environment loaders,
Prisma, Next.js, application routes, provider factories, routing, order
finalization, refund execution, or log transports.

## 8. Amount codec contract

The input is a JavaScript `number` representing repository-standard minor units,
with currency exactly `USD` or `JPY`. The amount must be an integer, a safe
integer, positive, and no greater than PostgreSQL signed integer maximum
`2_147_483_647`. Boolean coercion, numeric strings, `NaN`, infinities, negative
zero, zero, negatives, fractional values, and unsafe integers are rejected.

The wire encoder is integer/string arithmetic only:

- USD has two minor digits. Divide by 100 using integer quotient and remainder,
  and left-pad the remainder to exactly two digits.
- JPY has zero minor digits and is emitted as the base-10 integer string.
- Leading `+`, grouping separators, whitespace, exponent notation, locale
  formatting, and leading zeroes other than the single zero before a USD
  decimal point are forbidden.

Frozen examples:

| Input | Output |
|---|---|
| USD `1` | `0.01` |
| USD `10` | `0.10` |
| USD `100` | `1.00` |
| USD `2_999` | `29.99` |
| JPY `1` | `1` |
| JPY `1_500` | `1500` |

The implementation must not convert to a floating-point major-unit value, use
`toFixed`, use locale formatting, parse exponent notation, or round. Existing
display helpers such as `formatPrice` are not wire codecs. Acceptance against
live Eximbay formatting behavior belongs to a later EX2F gate.

## 9. Canonical payment-preparation facts

One immutable canonical value must own all merchant-controlled facts shared by
the server `/ready` request and browser SDK invocation:

- `transactionType`: literal `PAYMENT`;
- `providerOrderId`: validated opaque provider-order identifier;
- `currency`: `USD | JPY`;
- `amount`: validated minor-unit integer plus its canonical wire string;
- `language`: `EN | JP`;
- optional `paymentMethod`: if present, literal `P000` only;
- merchant binding: expected non-secret `mid`;
- buyer name and buyer email;
- `returnUrl` and `statusUrl`.

Construction rejects unknown keys, blank strings, leading/trailing whitespace,
control characters, invalid amount/currency/language/method combinations, and
values outside a current official constraint accepted by the implementation
contract. It contains no credential, secret, endpoint, FGKey, response data,
payment result, or database authority. `mid` is a correlation binding, not a
credential.

## 10. Ready/SDK fact parity

The `/ready` projection and SDK projection must derive from the same validated
canonical value. Every shared fact—transaction type, order ID, currency, amount,
language, method choice, merchant ID, buyer identity, and callback URLs—must be
deeply equal after their explicit wire-name projection.

The SDK projection may add only the ephemeral FGKey produced by a successful
`/ready` response. It may not overwrite or recompute merchant-controlled facts.
Neither projection may mutate the canonical input, and mutating either output
must not contaminate the canonical value or the other output.

## 11. FGKey boundary

FGKey is ephemeral protocol material. It may exist only in memory between a
successful `/ready` response and the immediately associated SDK invocation.
Under this contract and by default, it must not be written to `Payment`,
`CheckoutSession`, provider metadata, outbox/event payloads, logs, traces,
analytics, error messages, snapshots, or fixtures intended to resemble
production persistence.

EX2A may define validation/redaction behavior for an already-supplied FGKey but
may not obtain one, retain one, refresh one, or invoke the SDK with one.

## 12. Provider order identity and correlation

Exactly one provider-order identity candidate is derived per `Payment.id`.
`CheckoutSession.id` is forbidden as its source because one checkout session may
have multiple immutable payment attempts. The candidate must remain stable for
retries of the same payment attempt and distinct across different payment IDs.

The final wire derivation is deliberately **blocked**. Current official material
reviewed for this contract states that `order_id` is a unique merchant order ID
and must not be reused for a failed order, but it does not establish a complete,
internally consistent length, character-set, prefix, and case-sensitivity
contract sufficient for this repository. Therefore EX2A freezes only an opaque
branded candidate and the one-per-`Payment.id` ownership rule. It authorizes no
prefix, hash, encoding, truncation, or database column.

A future `order-id.ts` implementation is conditional on a source-frozen EX2F
decision resolving those constraints and proving collision behavior. The
repository's `Payment.id` remains the internal authority; provider order ID is a
correlation projection, not a replacement primary key.

## 13. Exact raw status-query carrier

Eximbay's verification flow requires sending the status notification's exact
raw query data to the verify API. The ingress boundary must therefore create an
in-memory carrier containing:

1. the exact received raw query byte/string representation, unchanged; and
2. a separately parsed, decoded, untrusted view for local checks.

The exact carrier must never be reconstructed with `URLSearchParams`, object
serialization, key sorting, normalization, decoded/re-encoded values, or a
framework abstraction that loses ordering, separators, escaping, or duplicate
occurrences. The parser may inspect a copy but must preserve the original exact
carrier for the later EX2C verification adapter.

## 14. Bounded raw-query parsing

EX2A freezes defensive local bounds, pending EX2F confirmation:

- raw UTF-8 size: at most 16,384 bytes;
- pair count: at most 64;
- decoded key: at most 128 UTF-8 bytes;
- decoded value: at most 4,096 UTF-8 bytes.

These are repository denial-of-service limits, not claims about Eximbay's
official maximums. Later protocol evidence may narrow them; expansion requires
review.

Parsing rules are exact:

1. Split the raw query on `&`, retaining order.
2. Split each pair at its first `=` only.
3. Reject an empty pair, missing `=`, or empty key.
4. Percent-decode strictly; reject malformed percent escapes and invalid UTF-8.
5. Reject an unescaped raw `+` encountered in any field representation while
   preserving the exact raw carrier unchanged. This is an EX2A ambiguity guard,
   not a claim that literal `+` is universally invalid in Eximbay. Percent-decoded
   `%2B` and `%20` remain distinguishable under the explicit percent-decoding
   rules.
6. Reject decoded unpaired surrogates, NUL, C0 controls, and DEL.
7. Detect duplicates by the fully decoded key name and reject every duplicate,
   including differently encoded spellings of the same decoded key.
8. Unknown keys may remain in the in-memory untrusted view; they are not trusted
   facts and must not be logged or persisted.

For the selected `PAYMENT` projection, these decoded fields must occur exactly
once and be nonblank: `transaction_type`, `mid`, `order_id`, `currency`,
`amount`, `rescode`, `resmsg`, and `fgkey`. `transaction_id` is conditionally
required for a success candidate. Successful parsing yields only unverified
data; it never proves authenticity or payment success.

## 15. Sensitive-data and diagnostic boundary

The raw carrier and decoded view can contain sensitive data. Official examples
include buyer email, cardholder data, card fragments, transaction identifiers,
and FGKey. The durable raw/sensitive prohibitions are: never persist or log the
raw status query; never persist or log sensitive buyer/card decoded fields, API
secret material, or raw credential material; do not persist FGKey by default;
and never log FGKey. Provider transmission alone grants no persistence authority.

EX2A database and persistence authority is `NONE`: EX2A writes and persists
nothing. Its errors expose only stable, non-sensitive codes. Its permitted safe
diagnostics are parser error code, raw byte length, pair count, duplicate count,
required-field completeness boolean, and transaction-ID-present boolean. EX2A
diagnostics contain no field names, raw snippets, values, URL text, arbitrary
exception messages, identifiers, or hashes/fingerprints.

EX2A does not permanently decide whether EX2C or another separately reviewed
later contract may persist bounded normalized evidence. Possible later subjects
include verified `transaction_id`, operationally required provider order
identity, approved normalized status/error codes, redacted verified event facts,
and a safe body/evidence hash or fingerprint. This paragraph authorizes none of
those writes. A later verified and locally correlated Eximbay `transaction_id`
may still map to `Payment.providerPaymentKey` only under that separate authority.

## 16. Unverified and verified type boundary

Parsed status data must have a plainly named unverified type. Verified status
facts must use a nominal type whose private brand or constructor is inaccessible
to ordinary callers. The two types must not be structurally assignable.

The initial EX2A source exposes no production constructor that claims network
verification. Behavior tests may use a test-only fixture factory unavailable
from production exports. A later EX2C verification adapter will own the sole
production promotion path after successful provider verification.

This nominal boundary prevents accidental promotion; it is not cryptographic
proof and cannot substitute for Eximbay verification.

## 17. Trusted-facts validator

Given an already nominally verified status value plus repository-owned expected
facts, the pure validator must require exact agreement on:

- `transaction_type === PAYMENT`;
- `rescode === 0000`;
- affirmative `status === SALE`;
- expected MID from the selected credential/host binding;
- expected provider order ID;
- expected `Payment.id`, with provider exactly `EXIMBAY`;
- expected mode from credential/host selection, never from an untrusted callback;
- expected currency;
- expected amount after strict inverse decoding to a positive minor-unit integer;
- a nonblank transaction ID.

No normalization, case folding, whitespace trimming, rounding, tolerance, or
client-supplied expected value is allowed. The result is an Eximbay-specific
validated intermediate only. It is not `CaptureFacts`, does not finalize a
payment, and creates no Order, ManufacturingRequest, PaymentEvent, or outbox row.

The verified transaction ID is merely a candidate provider payment key until
the later persistence/finalization boundary correlates and accepts it.

Provider verification success plus `rescode === 0000` with absent `status` is
not a trusted completed sale. `status` absent, `AUTH`, `REGISTERED`, `NONE`, and
unknown status values all fail closed before producing a
`TRUSTED_LOCAL_COMPLETION_CANDIDATE`. This is a conservative EX2A trust gate,
not a claim that every future real `PAYMENT` callback necessarily contains
`status`; EX2F may establish a different equivalent sale-proof rule through
separate evidence and change control.

## 18. Duplicate comparison

Official documentation warns that status notifications can be duplicated and
identifies transaction ID as the duplicate discriminator. The pure duplicate
comparator therefore receives two already-validated Eximbay intermediates and
classifies them only as:

- exact replay: transaction ID, provider order ID, MID, transaction type,
  currency, minor-unit amount, result code, and accepted status all match; or
- conflict: transaction ID matches but any compared fact differs; or
- distinct: transaction IDs differ.

A conflict must fail closed. The comparator does not read or write the database,
claim idempotency ownership, acknowledge ingress, or complete payment.

## 19. Inquiry semantics reserved for EX2D

The official inquiry states recorded for later classification are:

- `SALE`: payment completed;
- `AUTH`: authorized but not acquired/sold, associated with manual acquisition;
- `REGISTERED`: deposit pending;
- `NONE`: no payment result.

Because EX2A supports only integrated `PAYMENT`, it may define exhaustive labels
but must not query Eximbay or treat `AUTH`, `REGISTERED`, or `NONE` as completed.
Inquiry transport, retry policy, reconciliation, and evidence persistence belong
to EX2D or a later explicitly authorized slice.

## 20. Official-document inconsistencies and unresolved transport

The integrated-payment page currently references both `/v2/javascriptSDK.js`
and `/v1/javascriptSDK.js`, while the dedicated JavaScript SDK page references
v2. EX2A must not select or load either URL. SDK deployment identity is an EX2B
test-evidence gate.

The current API reference describes `status` as mandatory with `SALE`, `AUTH`,
`REGISTERED`, and `NONE`, while a current integrated-payment status-query
example omits `status`. EX2A does not resolve that inconsistency as a provider
transport fact; Section 17 instead applies the conservative affirmative-`SALE`
trust gate pending later current official/test evidence.

`return_url` is browser navigation only and is never trusted payment evidence.
`status_url` is the backend-notification concept, but the reviewed pages do not
freeze a sufficient repository contract for every transport detail. Before any
ingress route is authored, EX2F/EX2C must resolve and test: HTTP method, exact
request-target/raw-query extraction, content type, character encoding, empty
body behavior, acknowledgement status/body, provider retry schedule, timeout,
ordering, duplicate delivery, and maximum payload sizes.

No route shape, framework API, or acknowledgement behavior is selected here.

## 21. Refund/cancel contradiction and exclusion

The official cancel page marks `refund_amount` mandatory while its explanatory
text says omission performs a full refund. It also states that `refund_id` must
be unique and not duplicated. This contradiction is recorded, not resolved.

Void, cancellation, full refund, partial refund, refund ID derivation, refund
lookup, and refund worker/provider ports are excluded. Existing refund-worker
authority remains `TOSS_ONLY_EXPLICIT`; no Eximbay refund capability may be
inferred from this contract. The first contemplated Eximbay refund scope remains
full refund only, but its design and authority belong to EX2E.

## 22. Threat and failure model

| Threat/failure | Required pure-kernel disposition |
|---|---|
| Forged browser return or status query | Remain unverified; never finalize |
| Valid-looking data without verify call | Type system blocks trusted promotion |
| Query reconstruction changes provider-verification input representation | Preserve exact raw carrier; forbid re-encoding |
| Duplicate or encoded-alias keys | Reject before semantic validation |
| Oversized input/pair explosion | Reject at frozen bounds |
| Malformed escaping/UTF-8/control input | Reject with safe code |
| Amount float/rounding drift | Integer/string codec only; exact inverse |
| USD/JPY minor-unit confusion | Currency-specific exhaustive codec |
| `/ready` and SDK fact drift | Project from one immutable canonical value |
| FGKey leakage | Memory-only; no logs/persistence |
| Payment/session identity confusion | Derive one candidate per `Payment.id` |
| Provider-order constraints guessed | Block final derivation pending EX2F |
| MID/mode supplied by attacker | Compare with credential/host-owned expected facts |
| Same transaction ID with changed facts | Classify conflict and fail closed |
| Unknown provider status | Exhaustive rejection; no success inference |
| Logs disclose provider material | Fixed safe codes and aggregate metadata only |

## 23. Expected future source and protected paths

When a later prompt explicitly authorizes EX2A implementation, the expected
cohesive source ownership is under a new strict subtree such as:

```text
src/lib/payment/providers/eximbay/
  types.ts
  amount.ts
  preparation.ts
  status.ts
  verified-status.ts
  trusted-facts.ts
  duplicate.ts
  inquiry-status.ts
  redaction.ts
  index.ts
  __tests__/
    amount.test.ts
    preparation.test.ts
    status.test.ts
    trusted-facts.test.ts
```

`order-id.ts` is conditional and remains blocked by Section 12. Exact file
grouping may change only for a concrete ownership or dependency reason, not as a
way to hide protocol flow.

Protected no-change paths for EX2A are:

- `prisma/schema.prisma` and `prisma/migrations/**`;
- provider registry, routing, resolution, initiation, factory, credentials, and
  mode-selection source;
- `src/app/**`, including payment routes and server actions;
- order finalization, completion transaction, outbox, reconciliation, and
  refund-worker source;
- environment/configuration files and dependency manifests.

## 24. Required behavior tests for a later source slice

The implementation prompt must require behavior tests, at minimum:

1. every frozen USD/JPY amount vector plus bounds, zero, negative, fraction,
   unsafe integer, `NaN`, infinities, and unsupported currency;
2. exact canonical preparation acceptance and rejection of unknown/blank/control
   fields;
3. ready/SDK deep parity, SDK-only FGKey, input immutability, and output isolation;
4. stable one-per-payment identity candidate and explicit rejection of session
   identity as authority, without claiming a final wire encoding;
5. raw carrier byte/string preservation across ordering, escaping, embedded `=`,
   and empty values; rejection of unescaped raw `+` without altering the raw
   carrier; and distinct decoded results for `%2B` and `%20`;
6. all query limits and malformed escape/UTF-8/control cases;
7. duplicate decoded-name rejection, including encoded aliases;
8. required-field and conditional transaction-ID rules;
9. proof that parsed data cannot be passed where verified data is required;
10. every trusted-fact mismatch independently failing closed, including focused
    status cases where `SALE` is required and absent, `AUTH`, `REGISTERED`,
    `NONE`, and unknown status are rejected;
11. exact replay, conflict, and distinct duplicate classifications;
12. exhaustive inquiry-state classification with no non-`SALE` completion;
13. redaction tests proving raw data, sensitive decoded values, credentials, and
    FGKey never appear in errors or safe diagnostics, and that EX2A diagnostics
    contain no identifiers or hashes/fingerprints;
14. import-boundary tests proving no network, SDK, environment, Prisma, Next.js,
    route, routing, finalization, or refund dependency enters the kernel.

String-presence tests are insufficient. Tests must assert inputs, outputs,
failures, mutation behavior, and prohibited side effects.

## 25. Verification and stop conditions

For this documentation-only candidate, verification is Markdown-link existence,
`git diff --check`, and proof that the diff is limited to the primary contract
and minimal documentation pointers. No provider API call, SDK invocation,
runtime route test, schema command, or application verification is authorized or
necessary.

For a later authorized source slice, the minimum gate is relevant focused tests,
the full repository `npm run verify`, import/dependency review, and an independent
contract audit. Work must stop and return to design if:

- official sources do not resolve a required wire fact;
- `order_id` constraints remain incomplete for the proposed derivation;
- raw query bytes cannot be retrieved exactly from the selected runtime;
- SDK version or status transport remains ambiguous for the proposed adapter;
- implementation would require a protected path, schema change, or runtime
  authority not named in that prompt;
- current repository policy conflicts with this contract.

## 26. Rollback and recovery

This candidate is documentation only, so rollback is deletion of this document
and its two documentation pointers before acceptance, or a reviewed superseding
contract afterward. It creates no data or external side effect to recover.

For a later pure-source EX2A implementation, rollback is removal of the isolated,
unused protocol subtree and tests while Eximbay remains registry-disabled. No
database rollback, provider cancellation, or customer recovery should exist
because activation is forbidden. If runtime coupling or persisted Eximbay data
appears, the slice has violated this contract: stop, preserve evidence, disable
the coupling, and require a new incident/design review rather than treating it
as ordinary rollback.

## 27. Slice map and activation separation

The intended sequence is descriptive, not automatic authority:

| Slice | Intended responsibility | Authority after EX2A |
|---|---|---|
| EX2A | Pure protocol kernel | Contract candidate only |
| EX2B | Sandbox preparation and browser handoff | `NONE` |
| EX2C | Verified status ingress and completion | `NONE` |
| EX2D | Inquiry/reconciliation adapter | `NONE` |
| EX2E | Full-refund integration | `NONE` |
| EX2F | Real Eximbay test-environment evidence | `NONE` |
| EX2G | Routing and live activation | `NONE` |

Each slice requires its own prompt, current evidence, protected-boundary review,
behavior tests, and acceptance. Completion of one does not authorize the next.

## 28. Open blockers carried forward

The following remain explicitly unresolved:

1. complete `order_id` length, character-set, case, prefix, reuse, and collision
   requirements, and therefore its concrete derivation;
2. JavaScript SDK v1 versus v2 selection and compatibility;
3. exact status notification HTTP method, raw-target extraction, encoding,
   acknowledgement, retry, timeout, ordering, and payload limits;
4. authoritative maximum field/query bounds to replace or confirm local limits;
5. sandbox merchant credentials, host/mode binding, and supported country/card
   acceptance matrix;
6. precise `/verify` request/response and error/retry behavior in the chosen
   adapter environment;
7. inquiry timing and reconciliation policy;
8. the cancel/refund `refund_amount` contradiction and all Eximbay refund design;
9. any routing priority, fallback eligibility, rollout, monitoring, rollback,
   sandbox activation, or live activation decision.

Until independently reviewed and superseded by explicit later contracts, every
item above remains non-authorized.
