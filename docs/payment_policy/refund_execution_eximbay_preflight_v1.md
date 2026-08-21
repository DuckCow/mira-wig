# Eximbay refund preflight observation contract v1

Status: prospective, provider-free, dormant. This contract does not authorize
production Eximbay refund traffic.

## Responsibility

`RefundExecutionEximbayPreflightObservation` is the append-only authority for
the authenticated Eximbay payment state Mira admits before deciding whether
the first physical cancel dispatch may be authorized. It is distinct from
refund business intent, physical dispatch/result evidence, and both Toss proof
owners. Raw responses, API keys, Authorization values, and free-form provider
payloads are not persisted.

Each row belongs to one immutable
`RefundExecutionProviderOperationBinding` and one observing lease generation.
The binding supplies provider, mode, merchant-account binding,
credential-generation binding, cancel wire-contract version, and operation
family authority. A unique `(bindingId, observingLeaseGeneration)` pair allows
one admitted observation per generation without a mutable current-proof
pointer. The row and its fingerprint are immutable.

## Width authority

The durable storage capacities are `VARCHAR(512)` for MID, provider order ID,
and original provider transaction ID. These capacities preserve the installed
Eximbay trust-boundary capacity; they do not assert a REST-v1 provider maximum.
Admission remains exact, bounded, nonblank, control-character-free, and
fail-closed. Truncation, whitespace normalization, and case normalization are
forbidden.

## Retrieve and admission

The dormant provider-free seam prepares `POST /v1/payments/retrieve` with
`key_field=transaction_id`. MID, mode, provider order ID, original transaction
ID, currency, original amount, and language come from bound configuration and
durable Payment authority. Injected configuration and transport are the only
call boundary; production callers are zero.

The response boundary passes an abort signal to the actual request and enforces
a 15-second deadline. It reads at most 64 KiB and 256 chunks from the raw byte
stream before fatal UTF-8 decoding, then requires JSON content type, valid JSON,
and duplicate-member rejection at every object level. The closed documented
envelope also permits bounded `card_info`, `other_param`, `auth_code`, and
`payment_method` fields, but none contributes to the trusted projection,
fingerprint, persistence, or logging.
`card_info` accepts exactly one mutually exclusive documented number pair:
formal `card_number1`/`card_number4` or English-example `cardno1`/`cardno4`.
Mixed, simultaneous, or unknown card-number spellings are rejected, and neither
spelling is trusted refund authority. An admitted response must be provider
success with exact MID, order ID, transaction ID, currency and original amount;
`SALE` status; and a nonnegative refundable balance no greater than the
original amount. Ambiguous, malformed, mismatching, unsupported, or unavailable
responses produce no usable proof and no R1.

No database transaction or lock spans transport. After a successful response,
the admission transaction discovers only row identities, then locks Order,
every RefundAttempt in the order, RefundExecutionCommand, Payment, operation
binding, and dispatch attempts in canonical order. Only after all locks are held
does it reload Order, every RefundAttempt, command, Payment, binding, dispatch
and evidence history, observation, exact lease generation/token/expiry, and
database millisecond time. Validation uses only those post-lock facts. Drift or
an existing incompatible dispatch produces no row.

Two identical same-generation responses converge on the immutable winner.
Different facts never overwrite or merge; they produce a preflight conflict
and no R1 for the conflicting invocation.

## Fingerprint

The lowercase SHA-256 fingerprint uses compact JSON serialization and UTF-8.
Its exact v1 preimage contains the contract tag, RefundAttempt ID, command ID,
binding ID, observing generation, provider, mode, merchant and credential
binding labels, cancel wire version, inquiry and parser versions, MID, provider
order and transaction IDs, status, currency, original amount, refundable
balance, and database-millisecond `observedAt`. It is integrity and replay
evidence, not authentication and not ordinary log material.

## F/P and R1 handoff

`F` is selected only when the requested amount and local Payment amount equal
the provider original amount, currencies match, no prior successful refund
exists, and provider balance equals the full original amount. `P` is selected
only for an otherwise coherent ledger when the positive requested amount is no
greater than the admitted balance and the `F` conditions are false. Zero or
insufficient balance, local/provider mismatch, or incoherent history blocks R1.

R1 reloads the observation through the exact binding and current lease
generation, verifies its fingerprint and current local compatibility, then
persists ordinal 1 with the canonical Mira merchant `refund_id` derived from
the binding's operation-family fingerprint and physical ordinal. This
preflight owner itself performs no cancel transport; the separately contracted
dormant continuation owns the contact boundary.

## Crash, reentry, and effects

A crash before response or before persistence leaves no proof. A persisted
proof may be reused only under the same unexpired generation and raw token,
unchanged binding/account/credential/payment ledger, and zero dispatches. A new
generation performs a new retrieve and appends a new observation. Once R1
exists, the observation remains immutable for historical F/P replay.

The inquiry is read-only, so this version adds no contact journal, retry queue,
cadence state, or automatic retry loop. Each invocation performs at most one
retrieve. Eximbay request eligibility and worker routing remain blocked; real
provider/credential effects are zero. Toss semantics and historical rows are
unchanged. R2A remains unresealed.

## Provider-question register

- `RESOLVED`: status-url behavior is initial delivery plus up to three
  retransmissions at five-second intervals. Correctness remains independent of
  callback count.
- `RESOLVED`: an order-ID retrieve may omit `payment.transaction_id` when
  `key_field=order_id`.
- `RESOLVED`: the refund-ID lookup endpoint/selector and exact successful
  `NONE` authority are closed by the current first-party mandatory response
  identity/money fields and the dormant implementation contract.
- `RESOLVED`: direct merchant support confirmed the 30-character maximum,
  `(mid, transaction_id, refund_id)` uniqueness scope, and recommended ASCII
  character family. Mira's stricter canonical grammar avoids unresolved
  case/normalization and Unicode semantics.
- `MIRA_OWNED_DECISION`: the three 512-character storage capacities above.
  Vendor-question delta is zero.

The separately authorized dormant continuation is now specified by
`refund_execution_eximbay_cancel_recovery_v1.md`. It does not activate routing
or production provider contact.
