# Eximbay EX2A Pure Protocol Kernel — Source Status / As-Built v0.1

## Status

```text
DOCUMENT CLASS:
  SOURCE STATUS / AS-BUILT

FEATURE STANDARD CLASSIFICATION:
  HIGH — PAYMENT-PROVIDER PROTOCOL

TASK CLASSIFICATION:
  SOURCE_ONLY

TASK-LEVEL AUTHORIZATION:
  DOCUMENTATION ONLY

SOURCE STATUS VERSION:
  v0.1

DESIGN CONTRACT:
  HISTORICAL NORMATIVE ARTIFACT / REVIEWED AND MERGED

EX2A SOURCE:
  INSTALLED / REVIEWED

EX2A SOURCE STATUS RECORD:
  CANDIDATE — INDEPENDENT DOCUMENTATION REVIEW PENDING

EXIMBAY RUNTIME AUTHORITY:
  NONE

EXIMBAY SANDBOX / LIVE ACTIVATION:
  NOT AUTHORIZED

REFUND-WORKER PROVIDER AUTHORITY:
  TOSS_ONLY_EXPLICIT
```

## 1. Status and authority

This record documents the actual Eximbay EX2A pure protocol-kernel source
merged to `main` by PR #47. It binds the installed source identity, exact
merged scope, as-built responsibilities, source-review closure, verification
evidence, explicit non-authority, limitations, rollback semantics, and next
lifecycle gate at merge commit
`685fc048c8cb6fb834593e3b1f56756817c8e9ab`.

This is a Source Status / As-Built record under the
[Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md).
It is descriptive source authority linked to the governing design. It is not
a new Design Contract, provider protocol contract, implementation task
contract, operations runbook, activation record, or review of itself.

The lifecycle distinctions are explicit:

```text
designed:
  YES — historical normative Design Contract reviewed and merged

implemented:
  YES — pure protocol-kernel source reviewed and merged

source-reviewed:
  YES — six independent findings closed before merge

runtime-integrated:
  NO

provider-contacting:
  NO

activated:
  NO

this Source Status independently reviewed:
  NO — review pending
```

The historical Design Contract retains its original `CANDIDATE` status text.
That artifact froze the normative design at its lifecycle stage; this separate
record captures the later installed source truth without rewriting history.

## 2. Governing documentation and precedence

The governing repository artifacts are:

1. [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md),
   which requires the High-risk Design Contract → reviewed implementation →
   merge → Source Status / As-Built lifecycle and separates source installation
   from operation and activation.
2. [Eximbay EX2A Pure Protocol Kernel Design / Implementation Contract v0.1](./eximbay-ex2a-pure-protocol-kernel-design-contract-v0.1.md),
   the historical normative design authority for the implemented pure kernel.
3. The latest confirmed/open payment-policy pair and the provider-routing and
   refund-worker authorities incorporated by that Design Contract.
4. The reviewed source and tests at the source head and source merge identified
   below.

The governing Design Contract was byte-unchanged between its merge and the EX2A
source merge. Its bytes at the source merge have SHA-256:

```text
22bf3c8e7158510c4f75e857ad755ce100458f6de8d7681b5602c732443c4470
```

External Eximbay documentation is mutable. This Source Status records reviewed
repository source truth; it does not refreeze current provider documentation or
silently resolve provider facts left open by the Design Contract. Every later
network or browser slice must freshly verify the applicable current official
Eximbay documentation.

## 3. Exact reviewed chain

### 3.1 Design Contract

Repository history and GitHub PR evidence establish:

```text
Design Contract PR:
  #46

PR title:
  docs(payment): define Eximbay EX2A pure protocol kernel

contract feature head:
  54ac64276c243deb0929956b1bfc9bd073bbd93e

contract merge commit on main:
  bd95a2bb1364715923e4639f3e1a674a5191107d

contract merge parent 1:
  57642a4aa4b9e26bdddcc35a2eaa3acdf77dbf77

contract merge parent 2 / feature head:
  54ac64276c243deb0929956b1bfc9bd073bbd93e
```

PR #46 is closed and merged. The Design Contract's original status remains a
historical record of its pre-implementation lifecycle stage.

### 3.2 Source implementation

Repository history and GitHub PR evidence establish:

```text
source PR:
  #47

PR title:
  feat(payment): add Eximbay EX2A pure protocol kernel

reviewed source head:
  6c7d09d11f79c7d9baca21d52b18ea59c3145e42

source merge commit on main:
  685fc048c8cb6fb834593e3b1f56756817c8e9ab

source merge parent 1 / Design Contract merge:
  bd95a2bb1364715923e4639f3e1a674a5191107d

source merge parent 2 / reviewed source head:
  6c7d09d11f79c7d9baca21d52b18ea59c3145e42
```

PR #47 is closed and merged. This record is bound to the merge commit on
`main`, not merely to the feature-branch head. The exact PR source surface in
§4 is the identical 20-path diff from the Design Contract merge to the reviewed
source head and from source-merge parent 1 to the source merge.

## 4. Exact installed source scope

PR #47 changed exactly 20 paths: 1 existing path modified and 19 paths added.
The source diff contains exactly 2,268 insertions and 1 deletion.

### 4.1 Modified existing EX1 architecture-test path

```text
M  src/lib/payment/providers/__tests__/eximbay-ex1-architecture.test.ts
```

The only changed line replaces the obsolete expectation that the Eximbay
protocol subtree does not exist with the observed post-EX2A expectation that it
does exist. All EX1 runtime-exclusion assertions remain in the same test.

### 4.2 Added EX2A production-source paths

```text
A  src/lib/payment/providers/eximbay/amount.ts
A  src/lib/payment/providers/eximbay/duplicate.ts
A  src/lib/payment/providers/eximbay/errors.ts
A  src/lib/payment/providers/eximbay/index.ts
A  src/lib/payment/providers/eximbay/inquiry-status.ts
A  src/lib/payment/providers/eximbay/preparation.ts
A  src/lib/payment/providers/eximbay/redaction.ts
A  src/lib/payment/providers/eximbay/status.ts
A  src/lib/payment/providers/eximbay/trusted-facts.ts
A  src/lib/payment/providers/eximbay/types.ts
A  src/lib/payment/providers/eximbay/validation.ts
A  src/lib/payment/providers/eximbay/verified-status.ts
```

### 4.3 Added EX2A behavior-test and fixture paths

```text
A  src/lib/payment/providers/eximbay/__tests__/amount.test.ts
A  src/lib/payment/providers/eximbay/__tests__/duplicate-inquiry.test.ts
A  src/lib/payment/providers/eximbay/__tests__/fixtures/verified-status.ts
A  src/lib/payment/providers/eximbay/__tests__/isolation.test.ts
A  src/lib/payment/providers/eximbay/__tests__/preparation.test.ts
A  src/lib/payment/providers/eximbay/__tests__/status.test.ts
A  src/lib/payment/providers/eximbay/__tests__/trusted-facts.test.ts
```

No other source, test, Prisma, migration, provider-routing, credential,
environment, application-route, completion, reconciliation, refund, void,
order, manufacturing, dependency-manifest, or configuration path changed in
PR #47.

## 5. Installed source responsibilities

The merged subtree owns only deterministic, side-effect-free protocol logic.
The installed responsibilities below are source- and behavior-test-backed; no
capability is inferred merely from the Design Contract.

### 5.1 USD/JPY amount encoding and inverse decoding

`amount.ts` validates positive safe-integer repository minor units up to
`2_147_483_647`. It encodes USD by integer/string quotient-and-remainder
semantics and JPY as an integer decimal string, and strictly inverse-decodes
only canonical wire representations. It rejects zero, negative zero,
negatives, fractions, non-finite values, unsafe integers, unsupported
currencies, leading signs or zeroes, grouping, whitespace, exponent forms,
wrong decimal precision, and out-of-bound values. It does not convert to a
floating major-unit number or round.

### 5.2 Canonical preparation facts and ready/SDK semantic parity

`preparation.ts`, `types.ts`, and `validation.ts` construct an authorized,
immutable canonical value for the frozen merchant-controlled preparation
facts. Exact-key validation rejects unknown or missing properties; exact-text
validation rejects blank, trimmed, C0/C1-control, and unpaired-surrogate input.

`projectEximbayReady` and `projectEximbaySdk` are pure object projections. Both
derive their shared facts from the same authorized canonical value. The SDK
projection adds only an already-supplied, validated ephemeral FGKey. Mutating a
projection cannot mutate the canonical facts or the other projection.

The projection names describe protocol semantics only. They do not implement
an HTTP `/ready` endpoint, load or invoke an SDK, obtain an FGKey, or contact
Eximbay.

### 5.3 Opaque Payment-owned provider-order candidate

`types.ts` creates a non-enumerable, frozen, in-memory candidate branded by an
internal `WeakMap` association to a repository payment identity. Candidates
for the same `Payment` identity compare semantically equal; candidates for
different payment identities compare distinct.

The candidate contains and exposes no concrete Eximbay wire `order_id`,
prefix, hash, truncation, charset choice, length choice, or database field.
Ready/SDK projections retain the candidate as an opaque object rather than
turning it into a wire string.

### 5.4 Exact raw status-query carrier and bounded strict parsing

`status.ts` returns an immutable unverified carrier containing the caller's
exact raw query string unchanged, ordered decoded pairs, and an untrusted field
view. It preserves ordering, escaping, and embedded `=` semantics without
reconstruction.

The parser enforces these local bounds:

```text
raw UTF-8 bytes:
  16,384 maximum

pairs:
  64 maximum

decoded key UTF-8 bytes:
  128 maximum

decoded value UTF-8 bytes:
  4,096 maximum
```

It strictly rejects empty pairs, missing `=`, empty keys, malformed percent
escapes, invalid UTF-8, prohibited decoded controls, unpaired surrogates,
decoded duplicate names, and unescaped raw `+`. Percent-encoded `%2B` and
`%20` remain distinguishable. The selected `PAYMENT` minimum fields are
required once and nonblank, and a `rescode=0000` candidate requires a nonblank
`transaction_id`.

Successful parsing creates only `UNVERIFIED_STATUS`; it proves neither
authenticity nor payment success.

### 5.5 Safe aggregate diagnostics

`redaction.ts` exposes only a stable parser error code, raw byte length, pair
count, duplicate count, required-fields-complete boolean, and
transaction-ID-present boolean. Behavior tests establish that raw query text,
field names, values, card-like data, MID, provider order identity, transaction
ID, and FGKey do not enter the safe diagnostic or error string.

### 5.6 Unverified/nominally provider-verified separation and trusted validation

`verified-status.ts` declares `ProviderVerifiedEximbayStatus` with an
unexported unique-symbol brand. Production exports expose the type but no
constructor, factory, brand, fixture, promotion function, network verifier, or
other runtime value that can create verification authority. The sole unsafe
fixture cast is under `__tests__/fixtures/` and is not a production dependency.

`trusted-facts.ts` accepts only an already nominally provider-verified value
plus repository-owned expected facts. It requires exact:

```text
transaction_type:
  PAYMENT

rescode:
  0000

status:
  SALE
```

It also requires exact MID, established provider-order ID, Payment-owned
candidate binding, payment identity, provider `EXIMBAY`, mode, currency,
inverse-decoded minor-unit amount, and a nonblank transaction ID. Missing
status and `AUTH`, `REGISTERED`, `NONE`, or unknown status values fail closed.

The output is only a frozen
`TRUSTED_LOCAL_COMPLETION_CANDIDATE`. It is not `CaptureFacts`, does not
complete a payment, and does not create any database, Order,
ManufacturingRequest, PaymentEvent, or outbox state.

### 5.7 Duplicate and inquiry-state classification

`duplicate.ts` classifies two already trusted intermediates as:

```text
EXACT_REPLAY
CONFLICT
DISTINCT
```

A shared transaction ID is an exact replay only when every frozen compared
authority fact agrees; otherwise it is a conflict. Different transaction IDs
are distinct. The classifier owns no persistence, idempotency transaction,
acknowledgement, or completion behavior.

`inquiry-status.ts` exhaustively classifies `SALE`, `AUTH`, `REGISTERED`, and
`NONE`. Only `SALE` is marked as a potential completed sale; unknown values
fail closed. It performs no inquiry request and grants no completion authority.

### 5.8 Production import/runtime isolation regression checks

`isolation.test.ts` resolves every production EX2A module as an isolated pure
dependency graph and checks for prohibited static/dynamic imports, module
escape, test dependencies, verification-authority exports, network and SDK
packages, environment/host-state access, logging, timers, randomness, local
storage, Prisma, Next.js, routing, factory, credential, completion,
finalization, reconciliation, outbox, refund, and void dependencies.

The checker is itself behavior-tested against representative hostile fixtures.
A runtime probe replaces global `fetch`, exercises public kernel functions,
and observes zero calls. These are regression checks for the reviewed EX2A
subtree; they do not establish provider runtime integration elsewhere.

## 6. Prominent runtime and non-authority boundary

The installed pure kernel grants no provider/runtime activation. Its exact
post-merge authority boundary is:

| Dimension | Installed state |
|---|---|
| Eximbay network requests | `NONE` |
| Eximbay SDK load/invocation | `NONE` |
| MID/API-key credentials | `NONE` |
| Environment configuration | `NONE` |
| Provider factory resolution | `NONE` |
| Routing/fallback | `DISABLED` |
| Sandbox activation | `NOT AUTHORIZED` |
| Live activation | `NOT AUTHORIZED` |
| Return route | `NONE` |
| Status ingress route | `NONE` |
| `/ready` HTTP | `NONE` |
| `/verify` HTTP | `NONE` |
| `/retrieve` HTTP | `NONE` |
| Database persistence | `NONE` |
| Payment completion | `NONE` |
| Order creation | `NONE` |
| ManufacturingRequest creation | `NONE` |
| Refund | `EXCLUDED` |
| Void | `EXCLUDED` |
| Reconciliation runtime | `NONE` |
| Refund worker | `TOSS_ONLY_EXPLICIT` |

The existence of `src/lib/payment/providers/eximbay/**` must not be described
as an Eximbay provider integration, payment capability, sandbox integration,
live integration, status integration, or refund capability.

## 7. EX1 preservation

The sole modification to the pre-existing EX1 architecture test changes only
the obsolete subtree-absence assumption. Current source and behavior tests
continue to establish:

- `EXIMBAY` remains the fourth persisted `PaymentProvider` identity introduced
  by the unchanged EX1 migration;
- `PROVIDER_REGISTRY.EXIMBAY` remains disabled, with no allowed mode, payment
  method, currency, or live market;
- no routing rule includes Eximbay, and the canonical activation guard rejects
  it before consulting an injected registry entry;
- initiation and confirmation factory resolution reject Eximbay as
  `PROVIDER_NOT_ENABLED` before constructing any supplied adapter;
- Eximbay has no credential checks or sandbox deployment key, and probing its
  disabled capability reads no environment key;
- no Eximbay package/SDK dependency, endpoint, credential, deployment key, or
  network adapter is installed;
- no Eximbay return, status, ready, verify, retrieve, or refund route exists;
- public webhook/status ingress returns the existing
  `EXIMBAY.PUBLIC_WEBHOOK_UNAVAILABLE` boundary;
- refund claim and execution paths explicitly exclude Eximbay;
- void payload parsing explicitly rejects Eximbay; and
- the worker eligibility predicates and dormant authority contract remain
  Toss-only with classification `TOSS_ONLY_EXPLICIT`.

EX2A therefore preserves the EX1 boundary:

```text
EXIMBAY identity exists
routing unavailable
factory resolution unavailable
credentials absent
network adapter absent
SDK absent
status ingress absent
refund excluded
void excluded
TOSS_ONLY_EXPLICIT unchanged
```

## 8. Independent source-review history

The initial independent adversarial source review identified six findings:

| Finding | Severity | Durable finding |
|---|---|---|
| `EX2A-SR-001` | Blocker | production verification-brand bypass |
| `EX2A-SR-002` | Blocker | premature concrete provider `order_id` mapping |
| `EX2A-SR-003` | Important | structurally bypassable canonical/candidate authority |
| `EX2A-SR-004` | Important | forbidden floating major-unit arithmetic |
| `EX2A-SR-005` | Important | incomplete preparation control-character rejection |
| `EX2A-SR-006` | Important | insufficient isolation regression proof |

All six were bounded-corrected within the reviewed 20-path source surface and
independently closure-reviewed:

```text
EX2A-SR-001: CLOSED
EX2A-SR-002: CLOSED
EX2A-SR-003: CLOSED
EX2A-SR-004: CLOSED
EX2A-SR-005: CLOSED
EX2A-SR-006: CLOSED

NEW BLOCKER:
  0

NEW IMPORTANT:
  0

NEW MINOR:
  0

CONTRACT CLARIFICATION:
  NOT REQUIRED

FINAL SOURCE ARCHITECTURE:
  ACCEPTED
```

This is the durable review history and consequence, not a reproduction of the
review transcript. It records the merged source-review closure and does not
claim that this Source Status candidate has already received its required
independent documentation/evidence review.

## 9. Focused verification evidence

The final focused verification at the reviewed source head recorded:

```text
focused EX2A suite:
  7 test files / 122 tests PASS

npm run typecheck:
  PASS

focused strict ESLint:
  PASS
```

The seven test files comprise the six EX2A behavior suites plus the preserved
EX1 architecture suite. This focused ledger is not presented as broader
repository verification.

## 10. Independently isolated clean full verification

Before merge, the exact reviewed 20-file candidate was copied byte-for-byte
into a detached clean verification worktree. Candidate identity was checked at
four points:

```text
original pre-test
==
temporary pre-test
==
temporary post-test
==
original post-test
```

The result was:

```text
reviewed candidate SHA-256 identity:
  20 / 20 exact matches

mismatches:
  0
```

The clean CI-equivalent environment was:

```text
Node:
  24.18.0

npm:
  11.16.0

PostgreSQL:
  18.4

database:
  disposable wig_platform_test

migrations:
  32 / 32 applied
```

The literal command and final result were:

```text
command:
  npm run verify

result:
  PASS

test files:
  244

tests:
  5,697

overall exit code:
  0
```

This was an isolated verification event. It did not use an existing developer
database. After verification, the disposable PostgreSQL instance was stopped,
its temporary database data was removed, the temporary detached worktree and
temporary manifests were removed, and the original candidate remained
untouched.

This Source Status authoring task does not rerun or reinterpret that pre-merge
full-verification event.

## 11. GitHub CI evidence

GitHub records a separate successful PR #47 CI event:

```text
workflow:
  CI

run number:
  307

run id:
  31433573045

status:
  completed

conclusion:
  success
```

The GitHub Actions result is corroborating evidence separate from the earlier
clean local full-verification procedure in §10. They are not one event.

## 12. Installed limitations and re-entry gates

### 12.1 Provider order ID wire authority

EX2A owns only an opaque semantic candidate associated with `Payment.id`.
Actual Eximbay wire `order_id` derivation remains unresolved and unauthorized.
No later slice may import a maximum-length or charset rule from an unrelated
API or reference context without proving that it applies to payment
preparation. Prefix, encoding, hashing, truncation, collision policy, reuse,
case sensitivity, and persistence remain gated.

### 12.2 SDK deployment identity

EX2A installs no SDK loader. The exact test/live JavaScript SDK deployment
identity and compatibility must be freshly source-frozen from current official
and test evidence before any browser integration.

### 12.3 `status_url` transport

EX2A owns only exact raw-query protocol semantics in a pure parser. Public
ingress still lacks frozen evidence and authority for:

```text
HTTP method
Content-Type
request-target/body placement
character encoding
acknowledgement status/body/content-type
retry cadence/count
terminal retry behavior
```

Framework extraction behavior, payload limits, timeout, ordering, and
duplicate-delivery behavior also require the later transport contract and
runtime proof. No status ingress route may be inferred from the parser.

### 12.4 Merchant/test capability

Generic protocol documentation does not prove that the eventual Mira merchant
or test account has:

```text
P000 card enablement
USD acceptance
JPY acceptance
3DS configuration
refund capability
live merchant approval
```

Those capabilities require later provider, test-environment, merchant-account,
and activation evidence.

### 12.5 Refund and ambiguous-contact recovery

Refund wire semantics, full/partial refund policy, refund identity, provider
contact proof, lookup, retry, and ambiguous-contact recovery remain later-slice
gates. No Eximbay refund or void authority exists, and the refund worker remains
`TOSS_ONLY_EXPLICIT`.

### 12.6 Mutable provider documentation

Later network/browser work must freshly verify applicable official Eximbay
documentation. This Source Status does not become a new provider protocol
contract and does not resolve facts beyond the reviewed EX2A pure-kernel
source.

## 13. Next lifecycle gate

The next authorized analysis step is:

```text
EX2B / EX2F prerequisite provider-evidence reconnaissance
```

Its bounded purpose is to resolve or explicitly classify:

- provider-order wire constraints;
- SDK test/live deployment identity;
- `status_url` HTTP transport, acknowledgement, and retries;
- test-environment credential and MID semantics;
- P000, USD, and JPY merchant-capability evidence; and
- 3DS and browser-behavior prerequisites.

This Source Status grants analysis authority only for that next gate. It does
not authorize EX2B, EX2C, or EX2F implementation, Eximbay network calls,
credentials, application routes, SDK loading or invocation, provider routing,
sandbox activation, live activation, verification, retrieval, completion,
refund, void, reconciliation, order creation, or manufacturing creation.

## 14. Rollback and recovery

EX2A is:

```text
unused
network-free
registry-disabled
non-persistent
```

The technical rollback unit is therefore the isolated
`src/lib/payment/providers/eximbay/**` source/test subtree plus the one-line EX1
architecture-test adjustment that recognizes the subtree's existence.

No provider cancellation, database rollback, customer recovery, payment/order
recovery, manufacturing recovery, refund recovery, credential rotation, or
external reconciliation is expected because EX2A creates no such state or
side effect.

If runtime coupling, provider contact, credentials, environment activation, or
persisted Eximbay state is discovered, that is not ordinary EX2A rollback.
Stop, preserve evidence, disable the coupling under separately reviewed
authority, and open a distinct incident/design review.

## 15. Change control

This v0.1 record describes the source installed by PR #47 at the exact merge in
§3. Later material changes to schema or durable-state semantics, activation
boundaries, core path ownership, protocol authority, routing, completion,
refunds, or deprecation require review and a new Source Status version or an
explicit reviewed update under the Feature Documentation Standard.

The historical Design Contract is not amended by this record. Any semantic
design change requires its own versioned design authority and explicit
supersession rather than a retroactive status rewrite.

## Verdict

```text
EX2A SOURCE STATUS / AS-BUILT v0.1 COMPLETE
— READY FOR INDEPENDENT DOCUMENTATION REVIEW
```
