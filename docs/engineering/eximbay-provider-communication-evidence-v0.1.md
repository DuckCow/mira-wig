# Eximbay Provider Communication Evidence Ledger v0.1

## Status

```text
DOCUMENT CLASS:
  PROVIDER COMMUNICATION EVIDENCE

SOURCE STATUS:
  NOT A SOURCE STATUS DOCUMENT

RUNTIME AUTHORITY:
  NONE

ACTIVATION AUTHORITY:
  NONE

PROVIDER CONTACT AUTHORITY:
  NONE

LIVE AUTHORITY:
  NONE
```

This document preserves historical Eximbay technical communications already
received or sent by Mira/project owners. It records what was asked, what was
recovered as a provider answer, and what remains unresolved. It does not
change payment or refund behavior, authorize provider contact or TEST
execution, consume the separate Eximbay TEST evidence sweep, activate
Eximbay, or establish LIVE readiness.

It does not supersede Eximbay Source Status / As-Built records,
payment/refund contracts, current official Eximbay documentation, or current
installed source/tests. Mira source is authoritative for what Mira currently
does; this ledger is not evidence that Mira currently does what Eximbay
described.

## Admission rationale

```text
FAILURE MODE:
  Future payment/refund work may forget prior direct Eximbay answers, duplicate
  vendor questions, or replace provider evidence with model inference.

WHAT FAILS WITHOUT THIS ARTIFACT:
  The communication history and its unresolved wording boundary remain spread
  across project history and transient planning context.

WHY SOURCE / TESTS / PR DESCRIPTION ARE INSUFFICIENT:
  Source records installed Mira behavior, not why an Eximbay-specific
  assumption was accepted or what Eximbay directly answered.

WHY OFFICIAL DOCS ALONE ARE INSUFFICIENT:
  Some transport, recovery, and refund answers were obtained directly because
  public documentation did not fully settle them at the time.

WHO WILL USE IT AND WHEN:
  Future Eximbay payment, callback, verification, retrieve, cancel, refund,
  and provider-contact planning.

ASSURANCE GAIN:
  One canonical pre-contact check distinguishes direct provider evidence,
  official documentation, TEST observation, and unresolved wording.

MAINTENANCE COST:
  Revisit this ledger only when contradictory provider evidence, materially
  changed official documentation, actual TEST evidence, or a materially
  necessary unresolved fact requires a bounded update.

DISPOSITION:
  ADD
```

## Build baseline

This candidate was initially authored from the exact verified baseline:

```text
initial commit:
  52e97898e79ee57ba9aae35758bc22b47b1a23e0

initial tree:
  8c94386a5d13e9aa2c5a4e1b0d4ec726077c0d89

```

During authoring, `origin/main` advanced through the already-reviewed WRR-10
docs-only publication. The advancement was limited to the permitted files
below, so this candidate was bound to the new current main:

```text
bound commit:
  dbea3ac78ab30d0e202ca1f2af064b171490573a

bound tree:
  8eb375c6771ce579dae5e24fed5a9cd918f00f0c

WRR-10 docs-only advancement:
  PRESENT

advancement delta:
  docs/discovery/README.md
  docs/discovery/product-media-live-boundary-defect-register-v0.3.md

application source/test/schema/migration/payment/runtime delta:
  NONE
```

The existing [BF3 vendor clarification authority adjudication](./eximbay-bf3-vendor-clarification-authority-adjudication-v0.1.md)
remains the repository record for the earlier SDK/API and environment-origin
reconciliation. This ledger adds the later communication history without
rewriting that record.

## Evidence discipline

No raw provider-message or raw sent-email bytes are installed in this
worktree. The entries below therefore do not claim raw-message verification
and do not reconstruct guessed exact prose.

Evidence classes used here:

- `OUTBOUND_SENT_CONFIRMED`: project history reliably establishes that Mira
  sent the communication.
- `OUTBOUND_CONTENT_RECONSTRUCTED`: the topic/content is recoverable, but the
  exact sent bytes are not preserved here.
- `DIRECT_PROVIDER_REPLY_RECONSTRUCTED`: a direct Eximbay answer and its
  substantive facts are recoverable from project communication/history, but
  raw provider-message bytes are not installed here.
- `PROVIDER_WORDING_CONFLICT`: direct replies use wording that cannot safely
  be collapsed into one exact operational rule.
- `NOT_ESTABLISHED`: this communication record does not establish the fact.

Reconstructed evidence is not upgraded to raw-message-verified evidence.
Model reasoning is not recorded as something Eximbay said.

## Authority and precedence

| Evidence or authority | Governs | Does not silently establish |
| --- | --- | --- |
| Current installed Mira source/tests | What Mira currently does | What Eximbay promises; a provider contract; LIVE readiness |
| Current official Eximbay documentation | Currently published provider contract and endpoint selection | Mira merchant capability, account allowlisting, or source activation |
| Direct Eximbay written replies | The question and context actually answered by Eximbay | A later official-document rule outside the reply's scope |
| Actual TEST observations | Behavior observed in TEST | A normative production contract or provider promise |
| Model reasoning | Interpretation of the evidence | A direct provider statement |

If current official documentation conflicts with an older direct reply, report
the conflict and do not silently choose the older reply. If installed source
differs from a provider fact, preserve both distinctions: source is Mira
runtime truth, while the reply remains provider-supplied evidence.

## Communication timeline

### EXCOMM-20260814-IN-01

```text
DATE:
  2026-08-14

DIRECTION:
  Eximbay -> Mira/project owner

EVIDENCE CLASS:
  DIRECT_PROVIDER_REPLY_RECONSTRUCTED
```

Recovered provider statements:

- JavaScript SDK integration uses v2.
- Server API calls use v1.

The final TEST/production host lines in the recovered communication appeared
reversed relative to the official developer documentation examined at the
time. Those reversed lines are not current endpoint authority. Current
official Eximbay documentation governs TEST/production endpoint selection
unless later direct evidence establishes otherwise.

### EXCOMM-20260814-OUT-01

```text
DATE:
  2026-08-14

DIRECTION:
  Mira/project owner -> Eximbay

EVIDENCE CLASS:
  OUTBOUND_SENT_CONFIRMED
  OUTBOUND_CONTENT_RECONSTRUCTED
```

Mira sent a short clarification asking whether the TEST and production URLs in
the preceding reply had been reversed or mistyped. No exact later answer to
that specific clarification is established here. Current official
documentation, not this unresolved thread, governs endpoint selection.

### EXCOMM-20260817-OUT-01

```text
DATE:
  2026-08-17

DIRECTION:
  Mira/project owner -> Eximbay

EVIDENCE CLASS:
  OUTBOUND_SENT_CONFIRMED
  OUTBOUND_CONTENT_RECONSTRUCTED

RECOVERED SUBJECT:
  [기술문의] Open API 결제 연동 규격 종합 확인 요청
  (SDK / status_url / verify·retrieve / cancel·refund)
```

This was a consolidated eight-question technical inquiry. The recovered
question families were:

1. SDK/API version and linkage facts where still relevant;
2. `status_url` HTTP transport;
3. `status_url` encoding and body semantics;
4. successful acknowledgement behavior;
5. verification semantics;
6. retrieve/recovery semantics;
7. cancel/refund/`refund_id` semantics; and
8. TEST environment capability.

The significance is that these topics were already escalated to Eximbay and
must not be re-sent merely because a future agent does not remember them.

### EXCOMM-20260818-IN-01

```text
DATE:
  2026-08-18

DIRECTION:
  Eximbay -> Mira/project owner

EVIDENCE CLASS:
  DIRECT_PROVIDER_REPLY_RECONSTRUCTED
```

Recovered answers:

#### `status_url` transport and form encoding

- HTTP method: `POST`.
- Data carrier: POST request body.
- Request media type: `application/x-www-form-urlencoded`.
- Encoding: UTF-8.
- Form semantics: space maps to `+`; a literal plus maps to `%2B`.

#### Success acknowledgement

- HTTP status: `200`.
- Response media type: `text/html`.
- Encoding: UTF-8.
- Success response family: `rescode=0000&resmsg=Success`.

Punctuation in one reconstructed representation is historically ambiguous.
No trailing period is treated as canonical without exact provider bytes. The
current installed source and current official documentation govern the exact
literal used by Mira.

#### Verification

- A `status_url` payload that does not produce successful provider validation
  (`rescode=0000`) must not be treated as valid successful provider evidence.
- Such data may not be a valid Eximbay-originated result.

This is not expanded into a broader security theorem.

#### Retrieve and provider timestamps

- Repeated retrieve/query is permitted.
- Retrieve may be used when `status_url` was not received or verification did
  not successfully establish the transaction.
- Payment states discussed included `AUTH`, `SALE`, and `NONE`.
- `AUTH` may later become `SALE` after capture.
- `transaction_date` is KST.
- `refund_date` is KST.

#### Cancel/refund

- Full and partial cancel/refund requests should include `refund_amount`.
- Every actual cancel/refund request should use a new unique `refund_id`.
- A new provider cancel contact must not reuse an earlier `refund_id`.
- `RC11` represents rejection caused by duplicate `refund_id`.
- `RC11` is not proof that the prior refund succeeded.

#### TEST capability

Eximbay stated that TEST MID/API credentials and sandbox payment information
can be used to exercise TEST integration. No credential or merchant value is
stored here.

#### Retry wording recovered from this reply

The first-reply wording described the first delivery and a maximum total
delivery count of 3. This wording is retained as historical provider wording
and is not reconciled with the later reply below.

### EXCOMM-20260818-FOLLOWUP-OUT-01

```text
DATE:
  After 2026-08-18 and before 2026-08-20

DIRECTION:
  Mira/project owner -> Eximbay

EVIDENCE CLASS:
  OUTBOUND_SENT_CONFIRMED
  OUTBOUND_CONTENT_RECONSTRUCTED

EXACT OUTBOUND BYTES:
  NOT RECOVERED
```

The subsequent provider reply matches these recovered question families:

- `status_url` redelivery/retry timing;
- verify timeout and recovery behavior;
- retrieve recovery/polling expectations; and
- cancel timeout and safe retry/re-entry behavior.

No exact subject or body is claimed.

### EXCOMM-20260820-IN-01

```text
DATE:
  2026-08-20

DIRECTION:
  Eximbay -> Mira/project owner

EVIDENCE CLASS:
  DIRECT_PROVIDER_REPLY_RECONSTRUCTED
```

Recovered answers:

#### `status_url` redelivery

- If delivery is unsuccessful, retry at 5-second intervals.
- The recovered wording says “3 retries” / three redelivery attempts.

This conflicts with the 2026-08-18 wording if that wording means a maximum
of three deliveries including the first attempt. It is therefore retained as
`PROVIDER_WORDING_CONFLICT`; this ledger does not claim an exact total of 3 or
4 deliveries.

#### Verify timeout

- Invalid `status_url` data must not be accepted as valid.
- If verify times out or no result is obtained, call verify again to check
  validity.

#### Retrieve operation

- The merchant decides when to begin retrieve/query.
- Retrieve returns the current state at request time.
- No fixed polling interval was prescribed.
- No fixed maximum polling horizon was prescribed.
- Excessively frequent polling should be avoided.

#### Cancel timeout

- Use a cancel timeout of up to approximately 25 seconds.
- After an ambiguous cancel timeout, query/retrieve the cancellation.
- If the cancellation transaction is not found, send cancel again and obtain a
  provider response.

A new actual cancel contact uses a new `refund_id`, per the separately
recovered 2026-08-18 rule. No additional retry or re-entry rule is inferred.

## Provider fact status matrix

| Fact | Status | Recovered answer / disposition | Evidence |
| --- | --- | --- | --- |
| JavaScript SDK generation | `ANSWERED` | v2 | 2026-08-14 direct reply |
| Server API generation | `ANSWERED` | v1 | 2026-08-14 direct reply |
| `status_url` method | `ANSWERED` | POST | 2026-08-18 direct reply |
| `status_url` carrier | `ANSWERED` | Form-encoded POST body | 2026-08-18 direct reply |
| Request media type / encoding | `ANSWERED` | `application/x-www-form-urlencoded` / UTF-8 | 2026-08-18 direct reply |
| Space / literal-plus form semantics | `ANSWERED` | space => `+`; literal plus => `%2B` | 2026-08-18 direct reply |
| Basic success acknowledgement | `ANSWERED` | HTTP 200 / `text/html` / UTF-8 / `rescode=0000&resmsg=Success` family; punctuation not fixed | 2026-08-18 direct reply |
| Verify after ambiguous transport result | `ANSWERED` | A non-`0000` validation result is not valid successful provider evidence | 2026-08-18 direct reply |
| Verify timeout retry | `ANSWERED` | Call verify again when verify times out or yields no result | 2026-08-20 direct reply |
| Retrieve as recovery | `ANSWERED` | Permitted after missing `status_url` or unsuccessful verification | 2026-08-18 direct reply |
| Retrieve fixed polling cadence | `ANSWERED AS NOT PROVIDER-PRESCRIBED` | No fixed interval or maximum horizon; avoid excessive frequency | 2026-08-20 direct reply |
| Transaction/refund timestamp timezone | `ANSWERED` | `transaction_date` and `refund_date` are KST | 2026-08-18 direct reply |
| Full/partial refund amount | `ANSWERED` | Include `refund_amount` | 2026-08-18 direct reply |
| `refund_id` reuse | `ANSWERED` | New unique `refund_id` per actual cancel/refund contact | 2026-08-18 direct reply |
| `RC11` meaning | `ANSWERED` | Duplicate `refund_id` rejection; not proof of prior success | 2026-08-18 direct reply |
| Cancel timeout window | `ANSWERED` | Up to approximately 25 seconds | 2026-08-20 direct reply |
| Ambiguous cancel recovery | `ANSWERED` | Query first; if cancellation is absent, issue a new cancel request | 2026-08-20 direct reply plus 2026-08-18 ID rule |
| Public TEST exercise availability | `ANSWERED` | TEST MID/API credentials and sandbox payment information may exercise TEST integration | 2026-08-18 direct reply |
| Exact `status_url` maximum total delivery count | `PROVIDER_WORDING_CONFLICT / NON-BLOCKING` | 2026-08-18 says maximum total 3; 2026-08-20 says 3 retries at 5-second intervals; exact total is unresolved | 2026-08-18 and 2026-08-20 direct replies |
| Exact REST-v1 `refund_id` maximum length / character vocabulary | `NOT ESTABLISHED BY THIS COMMUNICATION LEDGER` | First use current official docs and actual TEST evidence; do not automatically contact Eximbay | Not answered in recovered communications |
| Production merchant/account capability and allowlisting | `NOT ESTABLISHED / DEFERRED` | Production onboarding/readiness concern, not a generic development blocker | Not answered in recovered communications |

## Questions that should not be re-sent without new contradictory evidence

Future agents should not contact Eximbay merely because these facts are not
remembered:

- SDK v2 and server API v1;
- `status_url` POST form-body transport;
- `application/x-www-form-urlencoded` and UTF-8;
- space => `+` and literal plus => `%2B`;
- the basic success acknowledgement envelope;
- verify after an ambiguous transport result;
- verify retry after timeout/no result;
- retrieve as a recovery mechanism;
- the absence of a provider-prescribed fixed retrieve-polling policy;
- KST transaction/refund timestamps;
- `refund_amount` for full and partial cancel/refund;
- a new unique `refund_id` for every actual provider cancel/refund contact;
- `RC11` as duplicate-ID rejection, not prior-success proof;
- the approximately 25-second cancel timeout;
- query-before-recancel after an ambiguous cancel outcome; and
- TEST integration availability.

A question may be reopened only when current official Eximbay documentation
materially contradicts the recorded reply, actual TEST behavior contradicts
it, production/account-specific behavior requires separate confirmation, the
provider API/version changes, or an exact unresolved fact becomes materially
necessary.

## Known provider wording conflict

The retry wording remains deliberately unresolved:

```text
2026-08-18 recovered wording:
  first delivery included / maximum total described as 3

2026-08-20 recovered wording:
  failed delivery -> 3 retries at 5-second intervals

DISPOSITION:
  UNRESOLVED EXACT COUNT
  NON-BLOCKING FOR CURRENT MIRA CORRECTNESS
```

Mira must tolerate duplicate status notifications regardless of whether the
provider's total delivery envelope is 3 or 4. This ledger does not create a
new provider inquiry merely to make the record complete. If the exact retry
envelope later becomes operationally material, ask one narrow clarification at
that time.

## Relation to installed Mira source

The current installed BF4 source is a separate Mira runtime record. It was
installed as dormant/default-off source before the later provider replies and
retains its own evidence-gated behavior. In particular, the route source
currently admits POST form-body input but uses a `text/plain; charset=utf-8`
response header, while the recovered provider reply describes a `text/html`
success response. This is not silently normalized here:

- the provider reply remains provider-supplied evidence;
- installed source remains authority for what Mira currently does; and
- the source/provider difference is a future BF4 implementation-reconciliation
  concern, not a reason to rewrite provider history or grant activation.

The related current records are the [BF4 design contract](./eximbay-bf4-status-verification-completion-design-contract-v0.2.md),
the [BF4 threat/failure model](./eximbay-bf4-status-verification-completion-threat-model-v0.2.md),
and the [Eximbay refund/cancel/recovery Source Status](./eximbay-refund-cancel-recovery-source-status-v0.3.md).
They remain authoritative within their own declared scopes and are not
rewritten by this ledger.

## Relation to the separate Eximbay TEST evidence sweep

A separate task is currently exercising the official Eximbay TEST environment.
That task may establish observational evidence such as:

- actual callback method/body;
- actual TEST payment behavior;
- verify/retrieve behavior; and
- cancel/refund behavior.

Those observations are not provider communication evidence. This ledger does
not wait for, add, or edit that sweep. After the sweep, compare its findings
with this ledger first. Only facts that remain provider-owned, materially
unresolved, unanswered here, not closed by current official documentation,
and not closed by TEST evidence should become a new Eximbay support inquiry.

## Privacy and secret handling

This ledger stores no API keys, private production MID values, passwords, card
data, customer information, provider staff personal contact details, or
unnecessary mail signatures/headers. Public TEST capability is described only
generically; credentials are not copied into the repository.

## Non-authority and publication boundary

This document grants none of the following:

```text
payment/refund behavior change
provider contact
TEST execution
provider credential use
database or durable-state change
source, test, schema, migration, dependency, or runtime configuration change
Eximbay activation
LIVE readiness
publication, commit, push, PR, merge, or release authority
```

The candidate is intentionally limited to this ledger and its concise index
pointer in `docs/engineering/README.md`.
