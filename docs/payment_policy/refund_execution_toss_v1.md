# Toss KRW sandbox refund execution policy v1

Status: **DRAFT — independent Fable policy audit required before commit or implementation**

Provider: Toss Payments<br>
Initial mode: `SANDBOX`<br>
Market: `KR`<br>
Currency: `KRW`<br>
Governing neutral policy: `docs/payment_policy/refund_execution_v3.md`

## 1. Purpose, authority, and normative labels

This provider-specific policy is subordinate to `refund_execution_v3.md`, is narrower than that
policy, and MUST NOT weaken it. V3 continues to own the provider-neutral lease, physical dispatch,
contact-boundary, evidence, fencing, replay, and projection invariants. V3 also owns the generic
separation between operation-family and physical dispatch identity. This document freezes Toss as
`STABLE_PER_LOGICAL_REFUND`; same-key reuse is provider-specific Toss correctness, not a universal
generic invariant.

This document governs only Toss-specific:

- eligibility;
- immutable operation binding;
- wire-request identity;
- contact-result interpretation;
- same-key recovery authority; and
- activation requirements.

It does not authorize provider contact, Toss SANDBOX calls, production deployment, worker
execution, migration deployment, or LIVE activation. Actual implementation MAY begin only after
this draft is independently audited and committed. A later implementation act MUST retain a
disabled provider-specific gate and zero production callers until its own activation act.

The labels used below are normative:

| Label | Meaning |
| --- | --- |
| `CONFIRMED` | The cited official Toss documentation states the behavior. |
| `PARTIAL` | Official documentation supports only part of the proposition; local policy supplies a fail-closed boundary. |
| `UNDOCUMENTED` | The reviewed official Toss sources do not establish the proposition. It MUST NOT be treated as a provider guarantee. |
| Local fail-closed rule | A Mira restriction that is intentionally stricter than the documented Toss API. |
| Implementation requirement | A required property of a later act, not authority to contact Toss now. |
| SANDBOX acceptance blocker | Real Toss SANDBOX evidence is required before the SANDBOX contact gate may be activated. |
| LIVE activation blocker | SANDBOX evidence is insufficient; separate LIVE authority is required. |
| Deferred future scope | Not supported by this wire-contract version. |

## 2. Exact initial product scope

The only initially eligible operation is:

| Fact | Locked value |
| --- | --- |
| Provider | `TOSS` |
| Mode | `SANDBOX` |
| Market | `KR` |
| Currency | `KRW` |
| Payment method | Ordinary domestic card only |
| Cancellation | Full cancellation only |
| Tax | `taxFreeAmount == 0` and `taxExemptionAmount == 0` |
| Prior provider cancellation | None |
| Initial Toss payment status | `DONE` |
| Initial Toss balance | `balanceAmount == totalAmount` |
| Local refund amount | Full original payment amount |
| Successful cancel status | `DONE` only |

The following are explicitly excluded and MUST NOT reach Toss cancellation contact under v1:

- local `PaymentMethod.CARD` as sufficient eligibility proof;
- easy pay, wallets, virtual accounts, bank transfer, mobile payment, gift certificates, PayPal,
  billing, BrandPay, or escrow;
- partial or multiple cancellation;
- tax-free or tax-exempt payment;
- any prior Toss cancellation;
- concurrent or manual provider cancellation;
- foreign easy-pay asynchronous cancellation; and
- any `cancelRequestId`-based flow.

The current repository does not persist enough Toss-specific payment-method, easy-pay, tax, and
provider-side cancellation-history facts to prove this scope from local rows. Local payment enums
or checkout choices therefore MUST NOT substitute for an authoritative pre-contact Toss lookup.
All excluded cases are deferred future scope and require a new policy version or amendment.

## 3. Mandatory pre-contact eligibility proof

Every initial Toss cancellation contact MUST be preceded by an authoritative
`GET /v1/payments/{paymentKey}` lookup using the bound SANDBOX credential. Its normalized Payment
observation MUST prove all of the following simultaneously:

```text
paymentKey == locally stored providerPaymentKey
method == "카드"
easyPay is absent or null
currency == "KRW"
status == "DONE"
balanceAmount == totalAmount
balanceAmount == local full refund amount
taxFreeAmount == 0
taxExemptionAmount == 0
cancels is empty or null
```

The gate MUST also cross-check:

```text
Toss totalAmount == local Payment.amount
local Payment.amount == RefundAttempt.amount
Toss totalAmount == RefundAttempt.amount
```

A lookup failure, timeout, ambiguous or malformed result, unfamiliar field value, missing required
fact, or any scope mismatch SHALL prevent provider cancellation contact. The outcome SHALL be
parked for safe classification or manual review; the adapter MUST NOT guess from local data.

A future persisted eligibility snapshot MAY supplement screening and audit, but MUST NOT replace
the initial pre-contact provider lookup. The lookup is a point-in-time observation and cannot
eliminate a TOCTOU race with a concurrent provider-side cancellation. Section 4 therefore also
requires the validated full amount on the cancellation request. E3B1 owns the concrete lookup gate,
normalization, and storage mechanism; this policy does not choose its exact Prisma representation.

## 4. Full-cancellation wire request

The v1 endpoint is exactly:

```text
POST /v1/payments/{paymentKey}/cancel
Content-Type: application/json
Idempotency-Key: <persisted dispatch.providerOperationKey>
```

The JSON body is exactly these two members:

```json
{
  "cancelReason": "Mira merchant refund",
  "cancelAmount": "<validated full original amount as integer>"
}
```

In the actual JSON request, `cancelAmount` MUST be a base-10 JSON integer, not a quoted string. The
quotation above is specification notation only.

`cancelAmount` is explicitly supplied even though Toss documents full cancellation when
`cancelAmount` is omitted. Supplying the validated full original amount is a local fail-closed rule:
omission could cancel only a concurrently reduced balance, while an explicit full amount causes a
provider rejection if the refundable balance has drifted. This converts a potentially incorrect
smaller cancellation into bounded non-success. The semantic scope remains full cancellation only;
the presence of `cancelAmount` does not authorize partial cancellation.

The body MUST omit `taxFreeAmount`, `currency`, `refundableAmount`, and `refundReceiveAccount`.
Unknown or newly added optional request members MUST NOT be sent without a policy amendment.

## 5. Fixed cancellation reason

The cancellation reason is exactly:

```text
Mira merchant refund
```

It MUST remain ASCII, deterministic, non-sensitive, stable across all retries, reproducible after
process death, and included in the wire fingerprint. It MUST NOT contain customer or operator free
text, order or customer IDs, addresses, contact information, payment keys, internal diagnostics,
or provider error messages.

Changing this text or introducing categorical reasons requires a new Toss wire-contract version
and a policy amendment. Configuration or runtime input MUST NOT alter it.

## 6. Toss operation-family and physical wire key

The provider-visible idempotency key is derived exactly once as:

```text
providerOperationFamilyKey =
  "toss-refund-v1-" +
  lowercaseHex(SHA-256(UTF-8(RefundAttempt.idempotencyKey)))
```

`RefundAttempt.idempotencyKey` is the canonical provider-neutral logical identity input; it is not
the provider-visible key. The following invariants SHALL hold:

- one `RefundAttempt` maps to one Toss operation-family key;
- the Toss stable identity policy maps every physical dispatch ordinal to exactly that family key;
- different refund attempts map to different keys, subject to the cryptographic hash assumption;
- the operation-key generation version is `toss-refund-v1`;
- the generated value is persisted verbatim before contact;
- after binding, the persisted value is authoritative; and
- deterministic re-derivation is an integrity check only.

The implementation MUST NOT send the raw local idempotency key, generate a key per ordinal,
silently switch algorithm versions, change the key after ambiguous contact, or allocate a new key
to escape a replayed error.

Toss confirms a 300-character maximum but does not document an accepted character grammar in the
reviewed sources. Character acceptance beyond length is `UNDOCUMENTED`. Real SANDBOX acceptance of
the selected lowercase-hexadecimal and hyphen form is an activation blocker.

## 7. Credential and merchant binding

Toss documents idempotency scope using the combination of idempotency key, API key, API endpoint,
and HTTP method. Every logical operation binding therefore MUST immutably include both:

```text
merchant/account identity
credential-generation identity
```

SANDBOX and LIVE identities, different merchants/MIDs, and different credential generations are
never interchangeable. Implementations MAY use an operator-declared immutable binding ID, a
non-secret credential-registry identity, or a non-reversible public-material fingerprint. This
policy deliberately does not choose a secret-derived scheme.

The secret key, Basic Authorization header, and any reversible secret material MUST NOT be
persisted. Same-key automatic replay under a different credential generation is forbidden. If the
original binding is missing, recovery is lookup plus manual review. Rotation after initial contact
does not authorize automatic recovery contact with the new credential, even while two provider
keys coexist during a rotation window.

## 8. Immutable provider-operation binding authority

E3B1 SHALL introduce a dedicated, immutable, one-per-`RefundAttempt` provider-operation binding
entity. Conceptually it owns:

```text
provider
mode
providerOperationFamilyKey
operation-family-key algorithm version
wire-contract version
operation-family fingerprint
merchant/account binding
credential-generation binding
createdAt
```

The exact Prisma model, constraints, migration, and relation names are not created or finalized by
this policy act. E3B1 MUST reconstruct and audit the schema separately. Logical binding facts MUST
NOT be duplicated per physical dispatch, placed as Toss wire material directly on
`RefundAttempt`, or treated as safely recoverable from re-derivation alone. Every physical
dispatch persists the exact same Toss key in `RefundExecutionDispatchAttempt.providerOperationKey`.
This equality is required by the Toss stable regime and MUST NOT be generalized to every provider.

## 9. Toss wire fingerprint

The canonical preimage is exactly:

```json
[
  "refund-provider-toss-wire/v1",
  "TOSS",
  "<mode>",
  "<paymentKey>",
  "FULL",
  ["cancelAmount", "<integer amount>"],
  "Mira merchant refund",
  ["taxFreeAmount", "ABSENT"],
  ["currency", "ABSENT"],
  "<providerOperationKey>"
]
```

Serialization MUST use compact JSON, exact array order, UTF-8, the base-10 integer text without
leading zeros, explicit `ABSENT` markers, SHA-256, and a lowercase hexadecimal digest. The quoted
`<integer amount>` slot denotes the canonical decimal text in this fingerprint, while the actual
request body uses a JSON integer. E3B1 MUST lock fixed test vectors for both preimage and digest.

`refund-provider-toss-wire/v1` denotes `POST /v1/payments/{paymentKey}/cancel`,
`application/json`, and the exact two-member v1 body. It excludes dispatch ordinal, lease
generation, lease token, worker identity, clock time, retry count, and contact time.

Wire-request identity, eligibility proof, and credential/idempotency scope are distinct facts. They
MUST NOT be collapsed into one digest or used as substitutes for one another. The same operation
key paired with any changed wire fingerprint MUST fail locally before contact.

## 10. Initial provider success and cancellation identity

A Toss cancellation response MAY normalize to provider-neutral `SUCCEEDED` only when all of these
facts are coherent:

```text
response paymentKey == expected paymentKey
currency == "KRW"
status == "CANCELED"
balanceAmount == 0
exactly one cancels entry exists
```

The sole cancellation entry MUST have:

```text
cancelStatus == "DONE"
cancelAmount == expected full amount
cancelReason == "Mira merchant refund"
transactionKey is a nonblank valid provider identifier
no conflicting cancellation entry exists
```

The durable identity is:

```text
observedProviderRefundId = cancellation.transactionKey
```

The implementation MUST identify the cancellation without array-order assumptions.
`lastTransactionKey` MAY be used only as a consistency cross-check. `paymentKey`,
`lastTransactionKey`, or `cancelRequestId` MUST NOT be used as the sole cancellation identity, and
amount/reason/time heuristics MUST NOT choose among multiple entries. Missing, multiple,
ambiguous, unfamiliar, conflicting, or non-`DONE` cancellation results MUST NOT become success.

The reviewed official sources document `transactionKey` as the identifier distinguishing cancel
transactions. They do not guarantee its stability across the initial response, idempotent replay,
and later lookup; that cross-surface stability is `UNDOCUMENTED` and a SANDBOX activation blocker.

## 11. Result and error policy

HTTP status alone is never sufficient authority. The adapter MUST parse only an allowlisted shape,
match an allowlisted code, and apply this table. Raw Toss messages MUST NOT become `safeMessage`;
only static internal messages and allowlisted internal codes may cross the adapter boundary.

| Toss result or failure | Provider-policy meaning | Automatic contact/recovery authority | Required local handling |
| --- | --- | --- | --- |
| Coherent 2xx satisfying §10 | Confirmed completed cancellation | No further contact | Normalize `SUCCEEDED`; persist the sole cancel `transactionKey` |
| 2xx not satisfying §10 | Observed unknown or conflict; success proof incomplete | No initial success; exact replay only after adjudication | Park/manual review; retain normalized safe facts only |
| `ALREADY_CANCELED_PAYMENT` | Ambiguous provider state; never automatic success | No new key; lookup and conflict/manual classification | Do not infer ownership from “already” |
| `NOT_CANCELABLE_PAYMENT` | Provider rejected the current cancellation; likely eligibility drift | No automatic retry | Provider nonexecution intent; park/manual; exact neutral enum chosen in E3B2/E3B3 |
| `NOT_CANCELABLE_AMOUNT` | Explicit full amount rejected; balance/scope drift | No automatic retry | Provider nonexecution intent; lookup, conflict/manual |
| `NOT_MATCHES_REFUNDABLE_AMOUNT` | Refundable balance mismatch | No automatic retry | Provider nonexecution intent; lookup, conflict/manual |
| `INVALID_IDEMPOTENCY_KEY` | Request key rejected; local construction/config fault | No contact until corrected by a new audited wire version; never change key after contact | Terminal configuration fault; exact neutral enum chosen in E3B2/E3B3 |
| `IDEMPOTENT_REQUEST_PROCESSING` | Same-key first request is still processing; no proof of final result | Later exact same-key recovery only under §13 | Observed `UNKNOWN`; bounded wait, lookup, later replay |
| `UNAUTHORIZED_KEY` | Credential/authentication rejection or binding fault | No rotated-credential retry | Terminal configuration fault; lookup/manual if contact history exists |
| `FORBIDDEN_CONSECUTIVE_REQUEST` | Current repeated request rejected; provider says retry later | Later exact same-key recovery only after bounded wait | Retryable nonexecution intent; E3B2/E3B3 adjudicates exact neutral enum |
| `FORBIDDEN_REQUEST` | Request not allowed | No automatic retry | Terminal provider/merchant configuration fault; manual |
| `PROVIDER_ERROR` | Documented as temporary, but no documented proof of nonexecution | Exact same-key recovery only under §13 | Observed `UNKNOWN` |
| `REFUND_REJECTED` | Provider rejected refund | No automatic retry | Terminal non-success; manual review |
| `NOT_FOUND_PAYMENT` | Payment unavailable in credential/payment scope | No automatic retry | Terminal identity/credential fault; manual review |
| HTTP 429 or other undocumented throttling | Cancellation-specific semantics undocumented | Exact same-key recovery only under §13 | Observed `UNKNOWN` if normalized; otherwise unobserved unknown |
| Generic 5xx | No proof of nonexecution | Exact same-key recovery only under §13 | Observed `UNKNOWN` if normalized; otherwise unobserved unknown |
| Timeout | Contact may have occurred; no normalized response | Exact same-key recovery only under §13 | Unobserved unknown |
| `AbortSignal` cancellation | Contact may have occurred; no normalized response | Exact same-key recovery only under §13 | Unobserved unknown |
| Connection reset | Contact may have occurred; no normalized response | Exact same-key recovery only under §13 | Unobserved unknown |
| Response loss | Contact may have occurred; no normalized response | Exact same-key recovery only under §13 | Unobserved unknown |
| Malformed response | A wire response may exist but no trustworthy normalized observation exists | Exact same-key recovery only after safe adjudication | Unobserved unknown; never persist raw body |
| Process death after contact marking | Contact may have occurred; no observation | E3C exact same-key recovery only | Unobserved unknown |

“Observed `UNKNOWN`” means a normalized Toss response exists. “Unobserved unknown” means contact may
have occurred but no normalized response exists. Both preserve the V3 contact fence; neither proves
nonexecution. Where the current provider-neutral outcome vocabulary cannot express the provider
distinction exactly, the intent in this table is normative and E3B2/E3B3 SHALL adjudicate the exact
code mapping without weakening it. No error mapping authorizes a new provider operation key.

## 12. Pending and asynchronous behavior

Initial domestic-card/full-only success requires `cancelStatus == "DONE"`. The initial adapter
MUST NOT emit `ACCEPTED_PENDING` for this domestic-card scope.

A non-`DONE` cancel status, present `cancelRequestId`, asynchronous marker, foreign easy-pay
semantics, or unfamiliar status yields no success and SHALL become observed `UNKNOWN` or
conflict/manual review. Toss `CANCEL_STATUS_CHANGED` behavior for foreign easy-pay cancellation is
outside this ordinary domestic-card contract.

## 13. Same-key recovery authority

Same-key recovery is the Toss-specific exact response-loss mechanism. Each recovery contact MUST:

- allocate a new positive physical dispatch ordinal;
- reuse the identical persisted `providerOperationKey`;
- reuse the identical wire fingerprint and body;
- reuse the original credential and merchant binding;
- create its own `CONTACT_MAY_HAVE_OCCURRED` history entry; and
- apply any resulting observation to the same `RefundAttempt`.

An automatic loop inside the initial adapter, a silent retry on the same ordinal, a new operation
key, a changed body, or a different credential generation is forbidden. Contact marking and its
immediate single Toss invocation MUST remain inseparable: after the V3 contact transaction commits,
only that winner continuation may invoke Toss once for that physical ordinal.

Changed-body behavior under the same provider operation identity is undocumented and deliberately
not probed. Mira rejects any reason, amount, payment target, canonical body, or fingerprint drift
locally before transport; exact unchanged replay is the only permitted same-key provider retry.

For `IDEMPOTENT_REQUEST_PROCESSING`, E3C SHALL own a bounded wait, supplementary payment lookup,
and later exact same-key replay. It MUST NOT tight-loop. This policy grants recovery authority but
does not implement it.

## 14. Payment lookup role and attribution

Toss payment lookup is an authoritative payment-level observation, mandatory pre-contact
eligibility proof, post-contact conflict detector, reconciliation input, and manual-review
evidence. It is not generally exact local `RefundAttempt` ownership authority.

For the initial scope, post-success attribution is accepted only because the pre-contact lookup
proved an empty/null `cancels` collection and the post-contact observation contains exactly one
matching cancellation. Multiple cancels, manual or concurrent cancellation, unexpected reason,
unexpected amount, or unexpected transaction MUST route to conflict/manual review. Timestamp
proximity and array position MUST NOT establish ownership.

## 15. Recovery window

Toss officially documents idempotency keys as valid for 15 days from their first request. Mira's
automatic same-key replay deadline MUST be strictly earlier than that provider limit. This policy
does not choose a numerical safety margin.

| Owner | Responsibility |
| --- | --- |
| Policy | 15-day hard upper bound |
| Deployment/operations | Configured safety margin, alerting, and cadence |
| E3C runtime | Deadline enforcement |
| Runbook/manual owner | Near-deadline and post-deadline handling |

After the local deadline there SHALL be no automatic same-key contact and no new key. Only lookup
plus manual review is allowed. The margin, owner, alerting, and cadence MUST be decided before E3C
recovery activation.

## 16. Webhook role

Official Toss documentation exposes payment and cancellation webhooks, but the reviewed docs limit
the general signature header to payout/seller events and state that `CANCEL_STATUS_CHANGED` is not
sent for ordinary domestic payments. The initial policy therefore has no sufficiently documented,
applicable verification mechanism for terminal domestic-card refund authority.

Webhook input is a wake-up hint only. It MAY schedule later reconciliation lookup but MUST NOT
directly insert refund evidence, apply refund projections, declare exact-attempt success, or change
the provider refund identity. The existing payment webhook handler is not refund recovery.

A stronger future role requires official applicable verification semantics, a policy amendment,
authenticated ingestion, deduplication, and ordering analysis.

## 17. SANDBOX and LIVE boundary

| Surface | Status | Locked interpretation |
| --- | --- | --- |
| Cancel endpoint/body | `CONFIRMED` | Official reference documents the endpoint, reason, amount, and optional fields; Mira's exact two-member body is stricter. |
| Idempotency | `CONFIRMED` | Header, 300-character limit, 15-day validity, tuple scope, and same-response behavior are documented. |
| Same-key replay after response loss | `PARTIAL` | Toss recommends same-key retry for timeout/network issues; exact refund cross-surface behavior still requires SANDBOX evidence. |
| Error codes | `PARTIAL` | Listed cancellation/idempotency codes are official; completeness, side-effect semantics, 429, and future codes are not guaranteed. |
| Payment lookup | `CONFIRMED` | Official `GET` endpoint returns Payment; exact-attempt attribution is a local restricted construction. |
| `transactionKey` stability across response/replay/lookup | `UNDOCUMENTED` | SANDBOX evidence is mandatory before contact activation. |
| Payment-method availability | `PARTIAL` | Test cards are documented as virtual approvals; SANDBOX/LIVE method coverage differs for some methods. |
| Timing | `UNDOCUMENTED` | LIVE latency and processing timing are not proven by SANDBOX. |
| Webhook behavior | `PARTIAL` | Event types/retries are documented; ordinary domestic cancel event and applicable terminal verification are absent. |
| Credential scope | `CONFIRMED` | Idempotency tuple includes API key; API keys are tied to service/MID integration and test/live credentials differ. |

SANDBOX MAY validate the dormant adapter contract, SANDBOX contact capability, operation-key
acceptance, same-key behavior under test conditions, and response normalization. It does not prove
undocumented LIVE parity, LIVE timing, LIVE payment-method coverage, LIVE recovery behavior, or
LIVE activation safety.

SANDBOX and LIVE bindings MUST never share credential binding, provider operation identity scope,
or dispatch/contact history. LIVE requires a separate policy/activation act and canary authority.

## 18. SANDBOX acceptance matrix

| Scenario | Required setup | Expected provider behavior | Expected local interpretation | Required durable state | Activation consequence |
| --- | --- | --- | --- | --- | --- |
| Eligible domestic-card full cancel | Fresh SANDBOX card Payment matching §3 | One full cancel, coherent Payment | `SUCCEEDED` only under §10 | Binding, contact ordinal, normalized evidence, `transactionKey` | Required pass |
| Explicit full `cancelAmount` | Full untouched balance | Amount accepted as full cancel | Full-only, never partial policy | Exact fingerprint/body | Required pass |
| Same-key response-loss replay | Controlled response loss after contact | Same response for same scoped request | Same attempt, new ordinal, no duplicate money effect | Two contact histories, one binding/evidence identity | Required pass |
| Concurrent same-key processing | First request in flight | Documented 409 may occur | `UNKNOWN`, bounded later recovery | Safe code only, contact history | Required pass or reproducible provider evidence |
| Same key, changed body | Local attempt to change amount/reason | Provider behavior is `UNDOCUMENTED` and deliberately not probed | Reject locally before contact | No new contact row | Mandatory provider-free deterministic contract test |
| Lookup before cancel | Fresh eligible Payment | `DONE`, full balance, no cancels | Eligibility gate passes | Minimal normalized eligibility facts | Required pass |
| Lookup after cancel | Successfully canceled Payment | `CANCELED`, zero balance, one cancel | Conflict detector and attribution input | Normalized observation only | Required pass |
| Sole `transactionKey` stability | Compare initial response, same-key replay, lookup | Stability is `UNDOCUMENTED` | Values MUST agree for activation | Redacted evidence record; no raw bodies | SANDBOX activation blocker |
| Already-canceled ambiguity | Cancel outside owned path, then contact/lookup | `ALREADY_CANCELED_PAYMENT` or canceled Payment | Never automatic success; conflict/manual | Safe classification only | Required pass |
| Provider 5xx | Official test-code mechanism where applicable | Error response | `UNKNOWN`, no new key | Safe code/static message | Required pass |
| Timeout/reset/response loss | Fault injection at transport seam | Result unavailable | Unobserved unknown, exact recovery only | Contact history, no fabricated evidence | Required pass |
| Authentication/config failure | Wrong/missing bound SANDBOX credential without disclosure | Auth error/no contact as applicable | Config fault; no rotated replay | Non-secret binding and safe code | Required pass |
| Non-`DONE` cancel result | Provider fake plus any real SANDBOX-supported case | Nonterminal/unfamiliar result | No success; unknown/manual | Normalized safe facts | Provider-fake pass; real evidence if producible |
| Privacy/log inspection | Sentinel identifiers and forced failures | N/A | No secrets/raw objects/messages | Minimum allowlisted facts | Required pass |
| Webhook independence | Disable/drop webhook delivery | Synchronous response/lookup remain usable | No webhook authority | No webhook-created evidence | Required pass |

Testing layers SHALL remain distinct:

1. local deterministic tests prove derivation, fingerprints, fail-closed parsing, and no-contact
   rejection;
2. provider-fake contract tests prove local transport and normalization branches;
3. real Toss SANDBOX acceptance proves only observed SANDBOX behavior; and
4. a future LIVE canary requires separate authority.

Changed-payload behavior for one idempotency key is officially `UNDOCUMENTED`; local fingerprint
rejection is mandatory and MUST be tested without provider contact. `transactionKey`
stability across response, replay, and lookup is also `UNDOCUMENTED`; captured SANDBOX evidence is
required before contact activation.

## 19. Privacy and retained data

| Data | Classification | Durable/logging rule |
| --- | --- | --- |
| Secret key | Secret | Never persist or log |
| Authorization header | Secret credential material | Never persist or log |
| `paymentKey` | Sensitive provider identifier | Persist only where already authorized; redact in logs/UI/tests |
| `providerOperationFamilyKey` | Sensitive attempt-stable operation-family identifier | Persist in immutable binding; redact/hash outside restricted audit paths |
| dispatch `providerOperationKey` | Sensitive exact physical wire identifier | Persist per ordinal; for Toss it equals the family key |
| cancel `transactionKey` | Sensitive provider cancellation identifier | Persist only as authorized provider refund identity; redact elsewhere |
| `cancelRequestId` | Sensitive unsupported identifier | Do not use as identity; retain only minimal normalized conflict fact if required |
| `cancelReason` | Fixed non-sensitive protocol text | May persist as fingerprint input; no user text |
| Wire fingerprint | Non-secret integrity digest | Persist in immutable binding; safe only with bounded metadata |
| Credential-binding ID | Non-secret but security-relevant | Persist; do not expose in customer UI |
| Provider error code | Allowlisted operational metadata | Persist only allowlisted code |
| Provider error message | Untrusted/unbounded provider text | Never persist as `safeMessage`; do not log raw |
| Raw request body | Sensitive wire material | Never persist or log |
| Raw response body | Sensitive provider/payment data | Never persist or log |
| Payment object | Customer/payment object | Never persist wholesale or log; normalize minimum facts |

No secret or auth-header persistence, raw request/response persistence, customer/payment-object
logging, unbounded provider-message storage, or sensitive identifiers in UI, metrics, or assertion
failures is allowed. Durable storage MAY contain only minimum facts needed for logical identity,
credential scope, wire immutability, provider cancellation identity, safe error classification,
recovery, and audit. Tests MUST use safe booleans, redacted sentinels, and bounded assertions.

## 20. Blocker ladder

`Yes` means the gap blocks that stage; `No` means it does not. Later-stage blocks are cumulative.

| Known gap | Policy draft | E3B1 | E3B2/E3B3 | E3C | SANDBOX activation | LIVE activation |
| --- | --- | --- | --- | --- | --- | --- |
| Credential binding absent | No | Yes | Yes | Yes | Yes | Yes |
| Dedicated operation-binding entity absent | No | Yes | Yes | Yes | Yes | Yes |
| Eligibility evidence absent locally | No | Yes | Yes | Yes | Yes | Yes |
| Toss cancellation client absent | No | No | Yes | Yes | Yes | Yes |
| Contact writer/winner continuation absent | No | No | Yes | Yes | Yes | Yes |
| Response normalizer absent | No | No | Yes | Yes | Yes | Yes |
| Same-key recovery absent | No | No | No | Yes | Yes | Yes |
| Numerical recovery safety margin absent | No | No | No | Yes | Yes | Yes |
| `transactionKey` SANDBOX stability unverified | No | No | No | No | Yes | Yes |
| Changed-body provider behavior undocumented | No | No, local fence required | No, local fence required | No, local fence required | No, provider-free local rejection required | No, provider-free local rejection required |
| Production refund migrations undeployed | No | No for dormant design | No for dormant design | No for dormant design | Yes | Yes |

Undeployed production refund migrations block activation, but do not block this policy document or
dormant implementation design. No stage may reinterpret a later-stage blocker as permission to
weaken V3 or this policy.

## 21. Locked implementation act ordering

The implementation sequence is:

1. **E3TP** — this Toss policy draft and independent audit.
2. **E3B1** — immutable provider-operation binding, credential binding, eligibility proof,
   wire-request derivation; provider contact remains structurally absent.
3. **E3B2/E3B3 combined** — response/error normalization, E4 observation bridge, contact
   winner-continuation, exactly one Toss cancellation invocation, zero production callers, and a
   disabled provider-specific gate.
4. **E3C** — same-key recovery, payment-lookup reconciliation, deadline enforcement, and
   manual-review routing.
5. **E2B2** — uncontacted/expired recovery work.
6. **E2C** — worker/runtime.
7. **SANDBOX acceptance act**.
8. **Separate activation act**.
9. **Future LIVE canary**.

Normalization and the verified E4 handoff MUST exist before any provider call becomes reachable.
The V3 contact marking and its immediate, single winner invocation SHALL remain inseparable.

## 22. Remaining human decisions

Only these decisions remain open:

| Decision | Required timing |
| --- | --- |
| Exact S1 product-scope approval | At policy audit |
| Fixed `Mira merchant refund` reason approval | At policy audit |
| Manual-review owner | Before SANDBOX activation |
| Recovery margin and operational owner | Before E3C activation |
| SANDBOX acceptance owner | Before SANDBOX activation |
| LIVE canary authority | Before LIVE canary |

The already adjudicated V3 safety architecture is not an open product choice.

## 23. Official Toss evidence ledger

All sources are first-party Toss Payments documentation and were accessed on **2026-07-17**.
`UNDOCUMENTED` entries record the absence of a guarantee in the reviewed primary sources; they are
not inferred guarantees.

| # | Official page title and URL | Relevant section/object | Documented guarantee or bounded finding | Status | Policy dependency |
| --- | --- | --- | --- | --- | --- |
| 1 | [코어 API](https://docs.tosspayments.com/reference) | Payment object | `paymentKey`, currency, method, total/balance, payment statuses, tax fields, nullable cancels, easyPay, and transaction fields are defined. | `CONFIRMED` | §§2–4, 10, 14 |
| 2 | [코어 API](https://docs.tosspayments.com/reference) | 결제 취소 | `POST /v1/payments/{paymentKey}/cancel`; reason required; omitted amount means full cancel; success returns Payment cancels; each cancel has a `transactionKey`. | `CONFIRMED` | §§4, 9–10 |
| 3 | [인증 및 기타 헤더 설정](https://docs.tosspayments.com/reference/using-api/authorization) | 멱등키 헤더 | Maximum 300 characters, valid 15 days, same scoped request returns the first response; scope tuple includes key, API key, endpoint, and method. | `CONFIRMED` | §§6–7, 13, 15 |
| 4 | [인증 및 기타 헤더 설정](https://docs.tosspayments.com/reference/using-api/authorization) | 에러 처리하기 | `INVALID_IDEMPOTENCY_KEY` and `IDEMPOTENT_REQUEST_PROCESSING` are documented; retry is advised for the in-processing case. | `CONFIRMED` | §§11, 13 |
| 5 | [요청·응답 본문](https://docs.tosspayments.com/reference/using-api/req-res) | Request/response and Error object | JSON/request-response conventions and error-object handling are defined. | `CONFIRMED` | §§4, 11 |
| 6 | [결제 취소하기](https://docs.tosspayments.com/guides/v2/cancel-payment) | Full/partial cancellation and idempotency | Omitting cancel amount performs full cancellation; the idempotency header is recommended; cancellation timing varies by method. | `CONFIRMED` | §§2, 4, 13 |
| 7 | [API 에러 코드](https://docs.tosspayments.com/reference/error-codes) | 결제 취소 | The named cancellation status/code/message combinations in §11 are listed, including temporary and terminal-looking errors. The page does not guarantee complete side-effect semantics for every code. | `PARTIAL` | §11 |
| 8 | [웹훅 이벤트](https://docs.tosspayments.com/reference/using-api/webhook-events) | Webhook headers; `CANCEL_STATUS_CHANGED` | General signature is documented only for payout/seller; cancel-status events are for foreign easy pay and are not sent for ordinary domestic payments. | `CONFIRMED` | §§12, 16–17 |
| 9 | [웹훅(Webhook) 연결하기](https://docs.tosspayments.com/guides/v2/webhook) | Event registration and retransmission | Webhooks are JSON POSTs; failed delivery is retried up to seven times under the documented schedule. | `CONFIRMED` | §16–18 |
| 10 | [환경 설정하기](https://docs.tosspayments.com/guides/v2/get-started/environment) | 테스트 환경 | SANDBOX is similar, not identical, to LIVE; card approvals are virtual; method differences and test rate limits exist. | `CONFIRMED` | §§17–18 |
| 11 | [토스페이먼츠 결제제품](https://docs.tosspayments.com/guides/v2/get-started/payment-products) | Payment products and test integration | Card and easy-pay products are distinct integration choices; test integration does not establish LIVE contract coverage. | `PARTIAL` | §§2, 17 |
| 12 | [간편결제 응답 확인하기](https://docs.tosspayments.com/guides/v2/easypay-response) | Easy-pay payment-method types | Easy pay may combine cards, accounts, points, or discounts; a card amount alone is not proof of ordinary card scope. | `CONFIRMED` | §§2–3 |
| 13 | [API 키](https://docs.tosspayments.com/reference/using-api/api-keys) | Integration keys and reissuance | Keys are tied to payment service/MID integrations; secret keys can rotate and old/new keys may briefly coexist. | `CONFIRMED` | §7 |
| 14 | [API 버전 정책](https://docs.tosspayments.com/reference/versioning) | Compatible changes | New response fields, enums, error codes, and webhook fields may be added without a new API version; test and LIVE API versions may differ. | `CONFIRMED` | §§3, 11, 17 |
| 15 | [배포 체크리스트](https://docs.tosspayments.com/guides/v2/deploy-checklist) | Test-to-live deployment | LIVE deployment requires separate key/environment checks; SANDBOX completion alone is not LIVE authority. | `PARTIAL` | §17 |
| 16 | Reviewed sources 1–15 | Idempotency key character grammar | No accepted grammar beyond maximum length was found. | `UNDOCUMENTED` | §§6, 18 |
| 17 | Reviewed sources 1–15 | Same key with changed payload | No authoritative changed-payload outcome was found. | `UNDOCUMENTED` | §§9, 18 |
| 18 | Reviewed sources 1–15 | Cancel `transactionKey` across initial response, replay, lookup | Each cancel transaction has a key, but cross-surface stability was not guaranteed. | `UNDOCUMENTED` | §§10, 18 |
| 19 | Reviewed sources 8–9 | Applicable domestic-cancel terminal webhook verification | No applicable signature/verification guarantee for ordinary domestic cancel authority was found. | `UNDOCUMENTED` | §16 |

## 24. Activation summary

This draft defines a dormant, fail-closed SANDBOX contract. It creates no authority to call Toss.
SANDBOX contact remains blocked until the implementation acts, independent audits, migrations in
the target environment, owners, local/provider-fake verification, and every §18 SANDBOX blocker
are complete. LIVE remains blocked by a separate activation decision and canary authority even
after SANDBOX acceptance.
