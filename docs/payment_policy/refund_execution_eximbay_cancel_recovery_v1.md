# Eximbay dormant cancel and refund-id recovery contract v1

Status: provider-free, dormant, sandbox-only implementation contract. It does
not authorize customer eligibility, production routing, credentials, or real
Eximbay contact.

## Assurance boundary

- **Guarantees:** an admitted preflight authorizes at most R1; transport is
  permitted only after `CONTACT_MAY_HAVE_OCCURRED` commits; an ambiguous
  cancel is reconciled by its persisted merchant `refund_id` whether one
  `UNKNOWN` adapter observation survived or no adapter observation survived;
  R2 is authorized only after an exact provider `NONE` for R1; automatic
  physical cancel count is at most two and automatic R3 is zero; every physical
  dispatch uses its exact canonical Mira-generated merchant `refund_id`.
- **Non-goals:** production worker routing, customer request activation,
  provider credentials, provider contact, and generalized
  HTTP/reconciliation infrastructure.
- **Trusted assumptions:** current REST-v1 first-party request/response fields,
  the installed preflight observation and binding, current Payment/Order/refund
  ledger, and the installed Eximbay-dispatch uniqueness index.
- **Safe stop:** unknown lookup remains `WAITING_EVIDENCE` until its bounded
  schedule is exhausted; identity or money conflict and every unresolved R2
  result park for manual review.
- **Bounded re-entry:** one recovery lease/event is one conservative lookup
  permit. Due offsets are +5 seconds, +30 seconds, and +2 minutes from the
  target dispatch contact marker; three permits are the maximum.

## Cancel request and identity

The exact request is `POST /v1/payments/{originalTransactionId}/cancel` with:

```json
{
  "mid": "<bound MID>",
  "refund": {
    "refund_type": "F|P",
    "refund_amount": "<canonical amount>",
    "refund_id": "<persisted dispatch providerOperationKey>",
    "reason": "MIRA_REFUND_V1"
  },
  "payment": {
    "order_id": "<original provider order id>",
    "currency": "<USD|JPY>",
    "amount": "<original canonical amount>",
    "balance": "<admitted preflight balance>",
    "lang": "<EN|JP>"
  }
}
```

The reason is a provider-local, versioned, deterministic, non-sensitive ASCII
constant. No customer/operator text or identity is serialized. Amounts use the
installed Eximbay minor-unit codec and `refund_amount` is always explicit.

Mira's merchant `refund_id` grammar is exactly
`^er[12]_[0-9a-z]{25}$`: 29 ASCII characters, lowercase only, and within the
provider-recommended letter/digit/underscore family. The allocator hashes the
compact JSON tuple `mira-eximbay-refund-id-v1`, the persisted lowercase
operation-family fingerprint, and physical ordinal 1 or 2; it projects the
first 128 digest bits as a zero-padded 25-character lowercase base-36 suffix.
The ordinal-bearing prefix makes R1 and R2 distinct without case semantics.
The dispatch row owns the allocated value before transport. Exact replay,
cancel response matching, lookup, and recovery reuse that persisted value.
The existing Eximbay-only unique dispatch index rejects a cross-family
projection collision as a persistence conflict; provider uniqueness is only
claimed for the confirmed `(mid, transaction_id, refund_id)` tuple.

The v1 SHA-256 wire fingerprint binds the wire/fingerprint versions, provider,
mode, MID, merchant/credential binding labels, original transaction ID, F/P,
refund amount, persisted `refund_id`, fixed reason, provider order ID, currency,
original amount, preflight balance, and language. It excludes leases, workers,
timestamps, retry counts, and customer data. K1 and K2 therefore have distinct
fingerprints.

## Contact and cancel result

The locked owner revalidates the canonical aggregate, binding, admitted
preflight observation, dispatch ordinal/key/fingerprint, lease generation/token,
and two-contact ceiling. It atomically changes the exact `AUTHORIZED` dispatch
to `CONTACT_MAY_HAVE_OCCURRED` with database time, commits, and returns one
in-memory continuation. No database lock spans transport and an existing marker
never returns a second continuation.

The injected fetch-like transport has a real 25-second `AbortController`
deadline, passes the signal, rejects redirects, requires 2xx JSON, limits the
body to 64 KiB and 256 chunks, uses fatal UTF-8, and rejects duplicate JSON
members. Production callers and credentials are zero.

Cancel success requires `rescode=0000` plus exact MID, merchant `refund_id`,
refund amount, bounded refund date, nonblank provider
`refund_transaction_id`, original order/currency/transaction/amount, and the
coherent resulting balance. The provider `refund_transaction_id` becomes
`observedProviderRefundId`; only generic result persistence projects it to
`RefundAttempt.providerRefundId`. Merchant K1/K2 never populate that field.
The optional `foreign` envelope admits exactly one complete documented spelling
set: `foreign_currency`/`foreign_amount`/`foreign_rate`, or the current example's
`foregin_currency`/`foregin_amount`/`foregin_rate`. They are envelope-only syntax
and do not enter trusted evidence, fingerprints, money, identity, or finality.
Every timeout, malformed/non-0000 response, or identity/money mismatch is
conservatively persisted as dispatch-bound `UNKNOWN` and moves the command to
`WAITING_EVIDENCE`; it never causes another cancel directly.

A process death after the durable contact marker but before adapter evidence
leaves a lawful unobserved-unknown variant with zero adapter observations. Once
the owning lease is recoverable, it uses the same +5s/+30s/+2m lookup schedule
anchored to `contactMarkedAt`; no synthetic `UNKNOWN` row or new timestamp is
created. Success, conflict, multiple adapter rows, malformed lookup history, or
evidence bound to another ledger dispatch fail closed instead of entering this
variant.

## Refund-id inquiry and NONE authority

The exact inquiry is `POST /v1/payments/retrieve`, `key_field=refund_id`, with
bound MID and an exact payment object containing original order ID, currency,
amount, language, original transaction ID, and the target dispatch's persisted
merchant `refund_id`. It creates no dispatch row.

The current first-party Korean API reference defines the selector/request
fields, defines `NONE` as no transaction, and marks response MID plus payment
status/order/currency/amount/transaction ID as mandatory. Accordingly, v1
admits `NONE` only from a successful response with every one of those exact
identity/money members, a bounded transaction date, and no contradictory
refund fields. This is authoritative `NOT_EXECUTED_RETRYABLE` for the exact
target dispatch. The authority is documented at the
[Eximbay Korean REST-v1 reference](https://developer.eximbay.com/eximbay/api_list/reference.html).

`REFUND` and `PARTIAL_REFUND` additionally require exact merchant `refund_id`,
nonblank provider `refund_transaction_id`, exact refund amount, and coherence
with the selected F/P type. A found refund is `SUCCEEDED` and forbids R2.
Malformed/transport/unknown status is `UNKNOWN`; identity, merchant-key, or
money mismatch is `CONFLICT`. Neither permits R2.

Optional lookup `balance` is parsed with the canonical currency-specific
Eximbay amount codec, including only canonical zero. It must be between zero
and the original amount. For `NONE`, a present balance must equal the target
dispatch's pre-contact refundable balance; absence remains permitted. For a
full found refund, a present balance must be zero. For a partial found refund,
a present balance must be no greater than pre-contact refundable balance minus
the exact target refund amount. Balance validates the selected refund envelope
only; it is not persisted as a new authority and cannot rebase R2.

Each lookup permit is durably identified by command, target dispatch, and
lookup ordinal through the existing recovery lease event; each observation is
deduplicated by command, target dispatch ID, and ordinal and is bound back to
that dispatch in `RefundExecutionEvidence`. A crash after permit acquisition
conservatively consumes the permit. No fourth permit is issued.

## R2 and finality

An exact R1 `PROVIDER_LOOKUP/NOT_EXECUTED_RETRYABLE` observation is persisted
before the same locked transaction allocates ordinal 2 with canonical K2. The
transaction requires no existing success, one exact contacted R1, physical
count below two, and `K2 != K1`. The recovery lease/fence serializes concurrent
admission, so exactly one R2 can win. R1, K1, and its evidence remain immutable.

R2 uses the same serializer, fingerprint, marker, and contact boundary. A
found R2 refund succeeds. R2 `NONE`, conflict, third unknown lookup, or any
exhausted lookup sequence parks for manual review. No code path creates ordinal
3.

## Durable/schema/effect delta

The implementation uses existing `RefundExecutionCommand`, command events,
dispatch attempts, provider binding, preflight observation, and execution
evidence. New tables, columns, enums, and migrations are zero. Customer Eximbay
refund requests remain blocked, generic execution/result routing remains
provider-specific, production callers/credentials/provider calls are zero, and
R2A remains unresealed.

## Provider-question register

- **A — RETIRED:** status-url retry count.
- **B — RETIRED:** order-ID retrieve transaction ID behavior.
- **C — RETIRED:** refund-id endpoint/selector and exact `NONE` authority. The
  current mandatory response identity/money fields are sufficient for the
  bounded parser; no shape question remains.
- **D — RETIRED:** direct merchant support confirmed a 30-character maximum,
  uniqueness by `(mid, transaction_id, refund_id)`, no currently known special
  character restriction, and a recommendation to use ASCII letters, digits,
  underscore, and hyphen. Mira deliberately uses the stricter lowercase
  canonical grammar above and does not depend on case sensitivity, provider
  normalization, Unicode, or behavior outside that recommended family.

`REMAINING_PROVIDER_QUESTION_COUNT = 0` for current refund implementation
closure. This does not retire Eximbay activation-provenance work.
