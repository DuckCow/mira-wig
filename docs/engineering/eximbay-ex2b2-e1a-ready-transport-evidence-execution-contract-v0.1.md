# Eximbay EX2B2-E1A — Bounded Sandbox READY Transport Evidence Execution Contract v0.1

## Status

```text
DOCUMENT CLASS:
  PROVIDER EVIDENCE / EXECUTION CONTRACT

RISK CLASS:
  HIGH — EXTERNAL PAYMENT PROVIDER CONTACT / CREDENTIAL CUSTODY

TASK CLASSIFICATION:
  EVIDENCE_COLLECTION / DOCUMENTATION_ONLY

CURRENT CONTRACT STATUS:
  FINAL INDEPENDENT REVIEW PASSED
  READY FOR DOCUMENTATION INSTALLATION

CANDIDATE BASELINE:
  b1d5582ecc0b9e00bba97cc8a4b14aaab5362961

FINAL INDEPENDENT CONTRACT REVIEW:
  PASS — 2026-08-16
  BLOCKER 0 / IMPORTANT 0 / MINOR 0

FINAL REVIEWED CONTRACT PACKET:
  WIG_PAY_EXIM_EX2B2_E1A_D1_REVIEW_v0_3.zip

FINAL REVIEWED PACKET BYTES:
  29446

FINAL REVIEWED PACKET SHA-256:
  17a04ededfe12415f5269e339a9b2f196935f8cef37bcb49a6d7cbda22822a33

PROVIDER CONTACT DURING CONTRACT AUTHORING / REVIEW:
  0

REAL CREDENTIAL VALUE READ / USED DURING CONTRACT AUTHORING / REVIEW:
  0

PROVIDER CONTACT AUTHORIZED BY DOCUMENTATION INSTALLATION:
  0

POST-INSTALLATION NEXT GATE:
  E1A-H1 ZERO-CONTACT HARNESS / LAUNCHER CANDIDATE
  + INDEPENDENT H1 BYTE/SOURCE REVIEW

RUNTIME AUTHORITY:
  NONE

SUPERSEDES:
  none

SUPERSEDED-BY:
  none
```

## 1. Purpose, scope, and precedence

This contract governs one later, separately authorized EX2B2-E1A invocation:
one bounded SANDBOX `POST /v1/payments/ready` transport/admission evidence run.
It also requires a separate zero-contact E1A-H1 harness/launcher review before
that invocation. It does not execute H1 or E1A, approve a credential value,
activate Eximbay, or make READY a customer payment path.

Precedence for this exact scope is:

1. [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md).
2. [EX2B2 READY Transport + SDK Browser Handoff Design Contract v0.1](./eximbay-ex2b2-ready-transport-sdk-handoff-design-contract-v0.1.md) and its [Threat / Failure Model v0.1](./eximbay-ex2b2-ready-transport-sdk-handoff-threat-model-v0.1.md).
3. [EX2B2-S2 READY Contact Design Contract v0.1](./eximbay-ex2b2-s2-ready-contact-design-contract-v0.1.md).
4. Current reviewed [EX2A v0.2](./eximbay-ex2a-pure-protocol-kernel-source-status-v0.2.md), [S1 v0.3](./eximbay-ex2b2-s1-ready-kernel-source-status-v0.3.md), [S2 v0.2](./eximbay-ex2b2-s2-ready-contact-source-status-v0.2.md), and [S3 v0.1](./eximbay-ex2b2-s3-browser-handoff-source-status-v0.1.md) Source Status records.
5. The exact installed source identities in section 5.
6. A zero-contact independently reviewed E1A-H1 packet binding exact runner
   and launcher bytes under section 6.
7. A later invocation prompt that names the reviewed installed contract SHA,
   exact approved execution baseline, exact closed H1 identities, and the
   single-contact authority required by section 6. That prompt may narrow this
   contract but may not broaden it.

Repository schema and source govern installed behavior. Current official
provider documentation governs external facts. A conflict with higher
authority or materially changed official documentation stops the future run
before contact.

This candidate was prepared at exact remote `main`
`b1d5582ecc0b9e00bba97cc8a4b14aaab5362961`, the reviewed EX2B2-S3 P8 merge.
The candidate task performed no Eximbay API or SDK-origin contact and read no
credential value.

The durable result has this evidence class:

```text
E1A evidence class:
  REVIEWED-HARNESS / INSTALLED-SOURCE OBSERVED CLASSIFICATION EVIDENCE

not:
  RAW PROVIDER-RESPONSE CUSTODY
  independently recomputable response-semantic evidence
```

Independent adjudication may verify the exact reviewed H1 bytes, installed
source identities, crash-durable contact journal, safe transport metadata,
bounded S1 result, no-retry posture, redaction, and cleanup chain. Because raw
provider response bytes and raw fgkey are deliberately excluded, it cannot
reconstruct or independently recompute the provider response or S1 admission.
Raw-byte custody would require a new contract with a separately reviewed
encrypted/sealed custody design; it must not be added to E1A v0.1.

## 2. Frozen D22 position and non-authority

The sequence remains:

```text
S1 -> S2 -> S3 -> E1A -> E1B
                  ^
                  this contract governs only one later invocation
```

E1A may establish only that, for one approved sandbox merchant/environment
pair and one exact synthetic `PAYMENT` / `CARD` (`P000`) / `USD` scenario:

1. the installed SANDBOX READY endpoint was or was not reachable for one
   governed contact;
2. the operator-approved `ACCOUNT_BOUND_SANDBOX` API-key/MID pair was or was
   not accepted for that exact request;
3. the current sandbox merchant/provider configuration accepted or rejected
   the exact installed request semantics;
4. installed S1/S2 HTTP and strict response admission produced either
   `admittedSuccess` or one bounded admission failure code; and
5. on `admittedSuccess`, installed source created a process-local
   `TrustedEximbayReadySuccess` authority whose raw READY `fgkey` was neither
   persisted nor exposed and was discarded on process exit.

E1A does not establish universal merchant capability, READY idempotency or
retry safety, readyFgkey TTL/replay behavior, SDK availability, SDK provenance,
`request_pay` behavior, payment authorization/capture/completion, `return_url`
truth, `status_url`/BF4 correctness, refund/cancel/void behavior, LIVE
capability, routing support, or customer readiness.

The future E1A run must not materialize an S3 browser handoff or call
`materializeTrustedEximbaySdkWire(...)`. It must not load an SDK asset, inspect
an SDK global, call `EXIMBAY.request_pay`, interact with a payment page, or
perform a payment-producing exercise. E1B and BF4 remain separate later gates;
E2 remains gated until BF4 prerequisites are reviewed and installed.

## 3. Provider facts frozen for the later run

The task issuer re-observed the following current official Eximbay facts on
2026-08-16. This candidate records them without contacting an Eximbay API or
SDK origin and without copying provider-example values:

```text
test API base:
  https://api-test.eximbay.com

READY:
  POST /v1/payments/ready

exact test READY endpoint:
  https://api-test.eximbay.com/v1/payments/ready

authentication:
  Authorization: Basic Base64(UTF-8(apiKey + ":"))

request content type:
  application/json

documented READY response fields:
  rescode
  resmsg
  fgkey

documented READY success example:
  rescode == "0000"

READY fgkey:
  generated by READY
  used later for SDK payment-page invocation
```

Provider documentation authorities are the official
[payment integration preparation page](https://developer.eximbay.com/eximbay/payment_linkage/preparing-payment.html),
[REST API reference](https://developer.eximbay.com/eximbay/api_list/reference.html),
and [FGKey preparation page](https://developer.eximbay.com/eng/eximbay/payment_linkage/preparing-fgkey.html).
Current official documentation publishes public “Test merchant information,”
including a shared-test API-key/MID pair. The installed
[BF2 shared-test contract](./eximbay-bf2-shared-test-ready-preflight-contract-v0.1.md)
classified it as `PUBLIC_SHARED_TEST`, and the installed
[BF2 result adjudication](./eximbay-bf2-ready-preflight-result-adjudication-v0.1.md)
records three exact shared-test READY requests as observed accepted. Those are
real official public shared-test credentials, but E1A v0.1 excludes that
credential class by policy and never copies its values.

The later operator must recheck the relevant official pages without copying or
using documentation order IDs, buyer values, fgkeys, or the public shared-test
pair. A material contradiction with the frozen facts produces
`E1A_PRECONTACT_BLOCKED_PROVIDER_AUTHORITY_DRIFT` and zero provider contacts.

## 4. Candidate baseline and reviewed installation chain

The candidate baseline is exactly:

```text
repository:
  DuckCow/mira-wig

S3 source PR:
  #71

S3 source merge:
  7d619c893f05ccc163dafb7eb6f07c16c055b0d0

S3 P8 PR:
  #72

S3 P8 reviewed documentation head:
  ffc6ddaee90b6d5fd3f8b034f8f38c1e1d625665

S3 P8 merge / candidate baseline:
  b1d5582ecc0b9e00bba97cc8a4b14aaab5362961

S3 P8 PR CI:
  31894248677 — success

S3 P8 post-merge CI:
  31894617464 — success

candidate baseline tree:
  67a04dc7464595b9934b77b3b228d669e0794843
```

Contract installation will necessarily create a later merge SHA. A future E1A
invocation therefore must name one exact reviewed installed-contract merge as
its approved execution baseline. It must prove both:

- `HEAD` equals that separately approved execution baseline; and
- all section 5 relevant source/schema/migration hashes equal the frozen
  identities below.

If either proof fails, the disposition is `PRECONTACT_BLOCKED`, the bounded
code is `E1A_PRECONTACT_BLOCKED_BASELINE_OR_SOURCE_DRIFT`, and provider contact
count remains zero. No operator may silently update the table or substitute a
newer `main`; source drift returns to contract review.

## 5. Exact installed source identity and posture

These identities were re-observed at the candidate baseline. Bytes are regular
file bytes and hashes are SHA-256.

| Path | Bytes | SHA-256 | E1A role |
| --- | ---: | --- | --- |
| `src/lib/payment/eximbay/ready-config.ts` | 3923 | `58101577197106ba350b11c4d25decadeff68e5f9dac11e28d01893eb445c18c` | explicit mode-bound config and origin admission |
| `src/lib/payment/eximbay/ready-facts.ts` | 4419 | `4117452695acd6af5f871b7f6e00d8fd023228e1eba0c2baccd6b3f4852acb4f` | canonical installed PAYMENT/market/method facts |
| `src/lib/payment/eximbay/ready.ts` | 4353 | `406a9c0374e89510b13e1bbb2b2f363df8ec0172567a45ca7bb7635f6c90da53` | persisted provider-order binding and final READY wire |
| `src/lib/payment/eximbay/ready-kernel.ts` | 17002 | `ca90ae98225676d56c5fd6822dfd908d4a409b0bb58e4a2f5d4238192b88244b` | fixed endpoint, request bound, response admission, trusted success |
| `src/lib/payment/eximbay/ready-http.ts` | 3985 | `13be506a6f6ea9bc9bb60022eaf667207ff83e3dae09e4ea8a90bafab8648ee8` | Basic auth, one fetch, 15-second deadline, redirect error, streamed response |
| `src/lib/payment/eximbay/ready-contact.ts` | 10558 | `18a2108df1bc0ad4e38b7999db90b7d7c75ea0b01d48534e4bceb14bd270d270` | reviewed S2 ownership/reference; not the E1A routing path |
| `src/lib/payment/attempt/provider-order-id.ts` | 1038 | `488f2e58024f1edebb84e5545b4f44a7d050850602066395bb5eb286f3de4087` | installed synthetic provider-order ID generator |
| `src/lib/payment/providers/credentials.ts` | 2473 | `e74f8381714d984d2462af7de1b454fbf844b0adc68ade172e52e8fceb6574a3` | exact environment-variable names |
| `src/lib/payment/providers/routing.ts` | 11069 | `c401d2c505f8b2fd942ac10e8dca20c6b32d4eda41f15001466726fedb415f1b` | proves EXIMBAY registry/routing remains disabled |
| `src/lib/db.ts` | 648 | `04bf1f26e4c1c0e746b9bdc375adc88ea2ee2eb997285d57d278147188d0a3b6` | installed Prisma client used by persisted binding |
| `src/lib/payment/providers/eximbay/preparation.ts` | 5526 | `9f2cf1c4131f2d7ca19be64489bbc0f150c42efc7ca6b372f43d3c7510649de7` | canonical projection and exact text admission |
| `src/lib/payment/providers/eximbay/amount.ts` | 2642 | `c835d7b9b19fb251e8426f6052c1b0a3d01bd31ebdbe3ebda9308904b7b16fe7` | USD minor-unit `100` to wire `1.00` |
| `src/lib/payment/providers/eximbay/validation.ts` | 2447 | `d6f9270538ba6363467a59424e6b7326e7b3d212af31d9c043c18dc41e1d42e3` | strict text/control validation |
| `src/lib/payment/providers/eximbay/types.ts` | 2427 | `68a1048a632ec9731a1aff719b3c1922bfe8725efdf926d7bc80f5050abb17fa` | closed SANDBOX/USD/P000 types and candidate provenance |
| `prisma/schema.prisma` | 32129 | `05393bc34466a42bef8d03e5cc5d83081954b24ec1f554c10f515c2ae6f9e450` | exact disposable fixture schema |
| `prisma/migrations/20260801120000_c0_commerce_integrity_foundation/migration.sql` | 8636 | `76aced83959b5bdfb09628121a0e6b2d7901680c19c50ff1e474f28593178373` | Payment lifecycle/evidence constraints |
| `prisma/migrations/20260811120000_eximbay_ex2b1_provider_order_identity/migration.sql` | 1308 | `90c7767da3ddef345fc1f942ca5a8263b97cc38e385c9850f5bb40d9ee3ca8a5` | EXIMBAY provider-order shape/immutability |

The exact `git ls-tree -r HEAD prisma/migrations` manifest hash is:

```text
68169211a8356a193dc737f032bcf283e1f7b8c2bc3ca358db133fe27710c057
```

At this identity, `PROVIDER_REGISTRY.EXIMBAY` has `enabled: false`, empty
`allowedModes`, empty `supportedMethods`, empty `supportedCurrencies`, and an
empty live allowlist. The E1A harness must not change or bypass those facts.

## 6. Contract, H1 review, installation, and invocation separation

The following are distinct acts and gates:

```text
D1 contract candidate/review and installation:
  provider contact count = 0

E1A-H1 harness + launcher candidate:
  exact e1a-runner.ts and e1a-launcher.mjs generated outside the repository
  provider contact count = 0

independent H1 byte/source review:
  binds H1 packet bytes/SHA and each exact file bytes/SHA
  provider contact count = 0

later E1A invocation:
  explicitly names the closed H1 identities
  separately authorized SANDBOX READY contact maximum = 1
```

Installing this document does not create H1 or invoke E1A. Contract
installation must be followed by a separate zero-contact H1 task that creates
exactly `e1a-runner.ts` and `e1a-launcher.mjs` in a unique external workspace.
Those files must contain no credential value. Their exact final bytes and
SHA-256 values are frozen before any credential value is read, independently
source-reviewed, and bound by a named H1 review packet with its own byte count,
SHA-256, and zero-contact proof. H1 review must verify the runner, launcher,
child-environment allowlist, durable journal, contact observer, result
classification, redaction, finalization, and cleanup behavior.

The later invocation prompt must name all of:

- the reviewed installed contract path and its exact blob/SHA-256 identity;
- the installed contract merge SHA and exact approved execution baseline;
- the H1 review packet canonical path/basename, bytes, SHA-256, and independent
  closure disposition;
- exact bytes and SHA-256 for reviewed `e1a-runner.ts` and
  `e1a-launcher.mjs`;
- `MAX_PROVIDER_CONTACTS = 1`;
- `credential_class = ACCOUNT_BOUND_SANDBOX` and the section 7 provenance
  gate;
- the disposable database authority from section 8;
- the unique unused run ID and run workspace;
- the crash-durable journal contract from section 11; and
- the exact result package path
  `<E1A_CUSTODY_ROOT>/<RUN_ID>/original/WIG_PAY_EXIM_EX2B2_E1A_READY_EVIDENCE_<RUN_ID>.zip`.

Before credential admission, the launcher must hash both execution files and
refuse any byte/count/hash mismatch. There is no code generation, transpiled
source substitution, self-modification, or source mutation after credential
admission. The result package includes byte-identical copies of both reviewed
files and the H1 packet identity so an adjudicator can bind observed execution
to reviewed orchestration bytes.

Absence or ambiguity in any item yields
`E1A_PRECONTACT_BLOCKED_INVOCATION_AUTHORITY` and zero contacts. No standing
authority survives a completed, blocked, failed, or ambiguous invocation. A
second READY contact always requires a new explicit execution authorization.

## 7. Credential and public-origin gate

The human-approved credential provenance class is frozen as:

```text
credential_class:
  ACCOUNT_BOUND_SANDBOX

meaning:
  a SANDBOX API-key/MID pair issued or assigned by Eximbay for the operator's
  merchant/account integration and received through an operator-approved channel

PUBLIC_SHARED_TEST:
  real current official test credential class
  historical BF2 authority already exercised it
  explicitly excluded from E1A v0.1
  no fallback
```

The invocation authority must attest the class without recording an account
identifier, issuance email, credential value, MID, prefix, length, hash, or
fingerprint. Evidence records only:

```text
credential_class: ACCOUNT_BOUND_SANDBOX
credential_provenance_admitted: true | false
```

If an account-bound sandbox pair is unavailable or provenance cannot be
approved, stop with
`E1A_PRECONTACT_BLOCKED_ACCOUNT_BOUND_CREDENTIAL_UNAVAILABLE` and zero
contacts. Never substitute the public shared-test pair.

The only provider/public-origin values the later run may read are:

```text
EXIMBAY_SANDBOX_API_KEY
EXIMBAY_SANDBOX_MID
PAYMENT_PUBLIC_ORIGIN
```

They must be injected explicitly by the operator into the one E1A process. The
launcher and runner must not load `.env`, use dotenv auto-loading, inherit
arbitrary `process.env`, read `EXIMBAY_LIVE_API_KEY` or `EXIMBAY_LIVE_MID`,
derive a fallback, or use repository fixtures/provider public shared-test
values as E1A credentials. The reviewed launcher may read only the exact
section 9 parent inputs and must create the exact allowlisted child environment
there. The runner then constructs an allowlisted `ProviderEnv` containing only
the three provider/public-origin names and passes it explicitly to
`resolveEximbayReadyConfig("SANDBOX", env)`; it must not use that function's
default `process.env` argument.

Before importing or constructing contact-capable source, the harness reports
only:

```text
EXIMBAY_SANDBOX_API_KEY: PRESENT | MISSING
EXIMBAY_SANDBOX_MID: PRESENT | MISSING
PAYMENT_PUBLIC_ORIGIN: PRESENT | MISSING
```

It must never print, persist, hash, fingerprint, measure, or reveal a value,
prefix, suffix, length, derived Basic Authorization, or comparison residue.
If any input is missing, the disposition is `PRECONTACT_BLOCKED`, the code is
`E1A_PRECONTACT_BLOCKED_MISSING_OPERATOR_INPUT`, and provider contact count is
zero.

`PAYMENT_PUBLIC_ORIGIN` must pass the installed S2 validation exactly. There is
no fallback to `NEXTAUTH_URL`, request host/forwarded headers, localhost,
provider docs, or a browser value. Evidence may record only
`public_origin_admitted: true` and `urls_match_approved_origin: true`; it must
not record the origin value or derived URLs.

The disposable database connection required by section 8 is a separate local
infrastructure authority, not an additional provider credential. Because
installed `src/lib/db.ts` consumes `DATABASE_URL`, the later process may bind
only the operator-selected disposable database connection to that name. Its
value must not appear in evidence or logs. No `.env` file may supply it.

## 8. Disposable database and exact synthetic fixture

The future run requires a dedicated disposable PostgreSQL database. Production,
staging, customer, shared-development, shared-test, cloned production, or
customer-derived data is forbidden.

Before any provider contact, the harness must prove:

```text
host:
  localhost | 127.0.0.1 | ::1
  OR an explicitly documented operator-owned disposable test host

database name:
  uniquely contains or maps one-to-one to the E1A run ID

schema:
  all exact approved-baseline migrations deployed

contents:
  application/domain tables empty before the synthetic E1A fixture
  migration-history rows are permitted and must match the approved baseline
  synthetic E1A fixture only afterward
```

Connection-string userinfo, passwords, query parameters, full URLs, and hashes
must never be recorded. Evidence may retain only an admitted host category,
the non-secret unique database name, migration count/identity booleans, empty
database proof, and cleanup outcome. If disposable authority cannot be proven,
the disposition is `PRECONTACT_BLOCKED`, the code is
`E1A_PRECONTACT_BLOCKED_DATABASE_AUTHORITY`, and contact count is zero.

Use one run-scoped synthetic identity family. Exact IDs other than the provider
order ID may be deterministic strings containing `<RUN_ID>` and must not match
any real account. The fixture is:

```text
Market:
  code = US
  currency = USD
  defaultLocale = en
  shippableCountries = [US]
  isActive = true

User:
  id = e1a-user-<RUN_ID>
  name = Mira E1A Synthetic
  email = mira-e1a-synthetic@example.com
  role = CUSTOMER

CheckoutSession:
  id = e1a-session-<RUN_ID>
  userId = e1a-user-<RUN_ID>
  marketCode = US
  currency = USD
  status = OPEN
  subtotalAmount = 100
  shippingAmount = 0
  totalAmount = 100
  expiresAt = a bounded future test timestamp

Payment:
  id = e1a-payment-<RUN_ID>
  checkoutSessionId = e1a-session-<RUN_ID>
  provider = EXIMBAY
  mode = SANDBOX
  routingRuleId = e1a.transport.evidence.v0.1
  status = INITIATED
  attemptLifecycle = CONTACTED
  remediationStatus = NONE
  amount = 100
  currency = USD
  providerOrderId = generateEximbayProviderOrderId()
  idempotencyKey = e1a-idempotency-<RUN_ID>
  contactIntentAt = a persisted precontact timestamp
  contactStartedAt = a persisted later precontact timestamp
  every output/ref/payment-key/financial/error/supersession/remediation field = null
```

The Payment is inserted as `CONTACTED` before plan construction so durable
contact authority exists before any provider byte while the routing/action path
remains disabled. Its timestamps must satisfy
`contactIntentAt <= contactStartedAt <= request_delegation_started_at`, using
wall-clock UTC values at millisecond precision only. The pre-seeded
`CONTACTED` row is a disposable lower-seam fixture, not the provider-contact
attempt ledger and not crash-durable contact-budget evidence. The runner must
not compare either DB `DateTime` to a monotonic value, rewrite
`markContactStarted`, claim routing support, or infer production lifecycle/CAS
evidence from this fixture. E1A measures only the installed lower READY
configuration/canonicalization/binding/HTTP/admission seams.

No CheckoutSessionLine, cart, Order, ManufacturingRequest, outbox, callback,
completion, refund, or customer record is required or permitted. Before
contact, query the disposable database to prove the exact fixture cardinality
and that no non-synthetic row exists.

The exact scenario is:

```text
provider = EXIMBAY
mode = SANDBOX
transaction_type = PAYMENT
market = US
language = EN
generic method = CARD
wire payment_method = P000
currency = USD
repository amount = 100 minor units
canonical wire amount = 1.00
buyer name = Mira E1A Synthetic
buyer email = mira-e1a-synthetic@example.com
providerOrderId = installed generator output, persisted before binding
```

One accepted request demonstrates only this one merchant, environment,
method, currency, amount, and time observation. It is not universal capability.

## 8A. Persistent invocation-bound custody boundary

The run has one invocation-bound persistent operator evidence root. The
contractual variable is `E1A_CUSTODY_ROOT`; the recommended operator path is:

```text
/Users/duckcow/mira-evidence/eximbay-e1a
```

The operator must create and verify this root before credential admission. It
must be an exact absolute path outside the repository, `/private/tmp`, browser
downloads, build output, and any cleanup target; owned by the invoking operator;
a regular directory, not a symlink or symlinked ancestor; mode `0700`; on a
durable local filesystem; and free of customer data. `lstat` must verify every
path component, and the launcher must refuse a root with any symlink, broader
permissions, or unexpected owner. The launcher sets `umask 077` and never
falls back to a repository or temporary path. The review packet for this
documentation task may itself be staged under `/private/tmp`, but that packet
is not an execution, journal, evidence, result, or recovery authority.

Each invocation creates one new, cryptographically random, non-reusable
`RUN_ID` and the following exact layout under the persistent root:

```text
<E1A_CUSTODY_ROOT>/<RUN_ID>/
  reviewed-h1/     # exact reviewed H1 packet, runner, and launcher bytes
  journal/         # authoritative contact-budget journal
  logs/            # bounded stdout/stderr custody
  working/         # transient construction only
  original/       # first final result ZIP copy
  archive/        # separate second final result ZIP copy
  quarantine/     # unsafe/transient artifacts, never evidence authority
```

Every directory is mode `0700` and every file is mode `0600`. Each directory
creation and final file installation is followed by a parent-directory fsync.
The run directory must be newly created with exclusive semantics and may never
be reused, including after a blocked or interrupted attempt. Existing content,
unexpected links, or an unknown run ID blocks before credential admission.

The exact H1 review packet, `e1a-runner.ts`, and `e1a-launcher.mjs` are copied
into `reviewed-h1/` and byte/SHA verified before any credential value is read
or any contact-capable module is imported. Their persistent copies are the
custody originals used by the invocation; a later package may include only
byte-identical copies. H1 custody failure is a precontact block and cannot be
repaired by contacting the provider.

The authoritative journal is exactly:

```text
<E1A_CUSTODY_ROOT>/<RUN_ID>/journal/contact-budget-journal.json
```

It is written with create-exclusive temporary files, file flush/fsync, atomic
rename, and parent-directory fsync for every forward transition. It is never
deleted, moved to quarantine, replaced by a ZIP entry, or removed by database
cleanup. The `FINALIZED` snapshot remains in persistent custody after final
packaging, and the ZIP contains a byte-identical copy of that final journal.
Missing, unreadable, corrupt, truncated, or lost journal custody never proves
zero contact. It yields
`E1A_RECOVERY_BLOCKED_CONTACT_LEDGER_UNAVAILABLE`, permanently blocks contact,
and requires human recovery review; a new run ID may not be used to bypass the
unknown prior state.

Final result custody is also persistent. After the final bytes pass redaction
and hash validation, create the canonical result ZIP with exclusive create in
`original/` and fsync its file and parent directory. Then create a separate
regular-file copy in `archive/`, fsync that file and its parent directory, and
verify equal bytes and SHA-256. The two copies must have distinct inodes where
the filesystem exposes inode identity; a symlink, hardlink, or reflink-only
claim is not sufficient. Archive failure leaves the original and journal
intact, reports `E1A_ARCHIVE_CUSTODY_INCOMPLETE`, and permits no second provider
contact. Cleanup may remove only verified transient `working/` material after
both copies are closed and verified. `quarantine/` is separate from journal
and evidence custody. Database/Prisma cleanup may delete only the disposable
synthetic database and never the journal, H1 custody, original, or archive.

No execution, journal, authoritative evidence, or result path in this
repository contract may be under `/private/tmp`.

## 9. Reviewed H1 execution bytes, child environment, and installed-source path

The unique run workspace and all working files live under the persistent root,
outside the repository and outside temporary paths:

```text
<E1A_CUSTODY_ROOT>/<RUN_ID>/working/

reviewed execution source:
  e1a-runner.ts
  e1a-launcher.mjs
```

The invocation must copy the exact independently reviewed H1 bytes into the
new persistent `reviewed-h1/` directory and use `working/` only for transient
construction. It verifies byte counts/SHA-256 before credential admission and
refuses any pre-existing non-empty run directory or reused run ID. The files
may not be generated, rewritten, or replaced during invocation. Persistent
journal, H1, original, and archive custody are never treated as working files.

The reviewed launcher sets `umask 077` and creates a fresh child process with
an exact environment object built in memory. It never spreads or inherits
arbitrary `process.env`. The only permitted child keys are:

```text
PATH:
  exact reviewed runtime PATH required to locate the approved Node/tsx tools

HOME:
  controlled run-scoped HOME

TMPDIR:
  exact run workspace temporary directory

TZ:
  UTC

NODE_ENV:
  production

DATABASE_URL:
  explicitly approved disposable database only

EXIMBAY_SANDBOX_API_KEY:
  approved ACCOUNT_BOUND_SANDBOX value

EXIMBAY_SANDBOX_MID:
  approved ACCOUNT_BOUND_SANDBOX value

PAYMENT_PUBLIC_ORIGIN:
  explicitly approved origin

TSX_TSCONFIG_PATH:
  exact approved-baseline repository tsconfig path
```

Node's `react-server` condition and the exact installed `tsx` loader path are
fixed non-secret launcher arguments reviewed in H1; no secret value appears in
argv, generated shell text, command echo, or process title. `NODE_OPTIONS` is
not inherited or set. The child environment excludes
`NODE_TLS_REJECT_UNAUTHORIZED`, `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`,
`NO_PROXY`, custom CA/agent/dispatcher variables, debug/trace variables, and
every unlisted key. The launcher rejects a parent
`NODE_TLS_REJECT_UNAUTHORIZED=0` and any attempt to add proxy, TLS-weakening,
preload, inspector, or Node-option state. The runner installs no custom
Undici/global dispatcher or insecure agent. Default Node TLS certificate and
hostname verification remains enabled.

The launcher captures stdout and stderr separately through pipes into
run-scoped mode `0600` custody, with a hard maximum of 65,536 bytes per stream.
It enables no verbose fetch/TLS/Prisma output; `NODE_ENV=production` is fixed
before `src/lib/db.ts` is imported, preventing development query logging.
Overflow is a bounded failure: after a possible contact it becomes
`CONTACT_OUTCOME_UNKNOWN`, never a retry. Complete bounded stdout/stderr bytes
are redaction-scanned with the evidence set, but only a fixed safe transcript
classification and byte counts may enter the package. No environment dump,
query/body/header, or unbounded error text is retained.

The child performs presence/provenance, H1 hash, environment, TLS-policy,
workspace, and journal gates before dynamically importing any DB/contact-
capable repository module. It runs against the exact approved checkout and
already installed Node/tsx dependencies; it may not install/fetch a dependency
or create/modify a repository file, build output, cache, generated client,
test snapshot, config, route, or log.

The primary path is exactly the installed module path, not manual `curl` and
not a reimplementation:

```text
resolveEximbayReadyConfig("SANDBOX", explicitAllowlistedEnv)
-> requireEximbayReadyConfigFacts(config)
-> load exact synthetic Payment / CheckoutSession / User from disposable DB
-> createCanonicalEximbayReadyFacts(..., method = PaymentMethod.CARD,
                                     mid = in-memory config MID,
                                     paymentPublicOrigin = admitted origin)
-> createTrustedEximbayProviderOrderBinding(
     facts.providerOrderCandidate,
     synthetic Payment.id
   )
-> createEximbayReadyContactPlanCore(configFacts.mode, facts, binding)
-> safe local precontact plan audit
-> executeEximbayReadyHttp(plan, configFacts.credentials, observedFetch)
-> installed S1 strict response admission
-> classify and package only redacted evidence
```

The harness must use the installed generator for `providerOrderId`, installed
USD encoding, installed READY serialization, installed Basic-auth
construction, installed endpoint mapping, installed fetch transport, and
installed response parsing/admission. It must not duplicate or independently
implement those semantics.

Manual `curl` is prohibited as the primary or fallback evidence path. No tool
may make a probe, DNS/TLS warm-up, health check, HEAD/OPTIONS request, retry,
or independent provider-document request through an Eximbay API/SDK origin.

## 10. Precontact gate and request-plan audit

All gates complete before the only possible network call. Required results are:

```text
invocation authority exact:
  true

closed H1 packet bytes/SHA and independent zero-contact review exact:
  true

e1a-runner.ts and e1a-launcher.mjs bytes/SHA exact:
  true

approved execution HEAD exact:
  true

section 5 source/schema/migration identities exact:
  true

repository pre-status empty:
  true

EXIMBAY routing disabled exactly as section 5:
  true

child environment exact allowlist, NODE_ENV=production, TLS/proxy policy exact:
  true

ACCOUNT_BOUND_SANDBOX provenance admitted and public shared-test excluded:
  true

three named provider/public-origin inputs present:
  true

resolved config mode:
  SANDBOX

public origin admitted by installed S2 source:
  true

disposable DB authority and migrations exact:
  true

exact synthetic fixture only:
  true

contact journal PRECONTACT_PREPARED atomically persisted and fsynced:
  true

wall-clock CONTACTED fixture evidence does not postdate request delegation:
  true
```

The harness may parse `plan.body` only because it is the locally constructed,
precontact installed-source output. It must not write the body. The exact plan
audit is:

```text
plan.mode == SANDBOX
plan.endpoint == https://api-test.eximbay.com/v1/payments/ready
plan.method == POST
plan.contentType == application/json
UTF-8 byte count(plan.body) <= EXIMBAY_READY_MAX_REQUEST_BYTES (65536)

payment.transaction_type == PAYMENT
payment.currency == USD
payment.amount == 1.00
payment.lang == EN
payment.payment_method == P000
payment.order_id == persisted synthetic Payment.providerOrderId

merchant.mid exists
merchant.mid == in-memory approved config MID
buyer.name == Mira E1A Synthetic
buyer.email == mira-e1a-synthetic@example.com
return_url/status_url derive from the admitted PAYMENT_PUBLIC_ORIGIN
```

Evidence may retain only the fixed non-secret semantics and booleans:

```text
provider_order_id_generated_by_installed_source: true
provider_order_id_matches_persisted: true
mid_match: true
mid_redacted: true
buyer_is_synthetic: true
urls_match_approved_origin: true
```

It must not retain the plan body, Authorization, actual MID/API key, actual
origin/derived URLs, or raw provider order ID. Any audit failure produces
`PRECONTACT_BLOCKED` with a bounded local code and zero contacts.

## 11. Crash-durable contact journal, clocks, observer, and one-contact budget

The invocation authorizes:

```text
MAX_PROVIDER_CONTACTS = 1

only permitted target:
  https://api-test.eximbay.com/v1/payments/ready

permitted method:
  POST

redirect mode:
  error

automatic retries:
  0
```

The external workspace owns one secret-free
`contact-budget-journal.json`. Its closed states are:

```text
PRECONTACT_PREPARED
CONTACT_MAY_HAVE_OCCURRED
CONTACT_RESULT_CLASSIFIED
FINALIZED
```

The reviewed runner writes every state transition as canonical bounded JSON to
a same-directory unique temporary file opened with create-exclusive mode and
permissions `0600`, flushes and `fsync`s that file, closes it, atomically
renames it over `contact-budget-journal.json`, then opens and `fsync`s the
parent run directory before continuing. A transition must fail closed if any
write, flush, file fsync, rename, or directory fsync fails. States move forward
only; neither code nor recovery may rewrite a journal to a zero-contact state.

The unique run workspace is created before credential admission and
`PRECONTACT_PREPARED` is atomically persisted/fsynced after all zero-contact
identity gates but before any contact-capable import. A pre-existing non-empty
workspace or journal makes a normal invocation refuse the run ID. Only a
separately reviewed recovery disposition that proves zero delegation may
permit disposal of a `PRECONTACT_PREPARED` workspace; it never permits reuse
after `CONTACT_MAY_HAVE_OCCURRED`.

`observedFetch` synchronously rejects if endpoint, method, redirect mode, mode,
or in-memory count is not exact. Immediately before its only delegation it
must, in this order:

1. capture safe wall-clock UTC and monotonic start values;
2. atomically persist/fsync `CONTACT_MAY_HAVE_OCCURRED` with
   `contact_ordinal = 1`, the exact permitted endpoint/method, and those safe
   timestamps;
3. fsync the parent directory successfully;
4. set the in-memory `call_count` to one; and
5. delegate once to `globalThis.fetch`.

The safe journal contains only schema version, run ID, forward state,
`contact_ordinal`, fixed endpoint/method, safe clock metadata, bounded
disposition/code, and cleanup/finalization state. It never contains an API key,
MID, Authorization, body, provider order ID, approved origin, connection
string, response content, fgkey, or credential-derived value.

Any crash, signal, kill, power loss, launcher loss, output overflow, or
uncertainty after the durable `CONTACT_MAY_HAVE_OCCURRED` transition
permanently consumes the invocation even if no network byte was actually sent.
A later process must read the journal before credentials/contact and refuse a
second delegation. After installed-source result classification, the runner
atomically persists/fsyncs `CONTACT_RESULT_CLASSIFIED`. After DB handles are
closed and cleanup has completed or failed, it persists/fsyncs `FINALIZED` as
the terminal contact-budget state before the final journal evidence entry is
rendered. `FINALIZED` means provider/DB actions and contact authority are
closed; ZIP construction/verification follows and cannot reopen contact.

The pre-seeded synthetic `CONTACTED` Payment remains only a disposable
lower-seam fixture. It is not the durable provider-contact-attempt ledger and
cannot authorize or distinguish recontact.

Two clock domains are recorded separately with their source and millisecond
precision:

```text
wall clock UTC (Node Date.now/new Date system clock; ISO 8601 millisecond precision):
  run_started_at
  contactIntentAt
  contactStartedAt
  request_delegation_started_at
  response_observed_at
  run_ended_at

monotonic (Node node:perf_hooks performance.now(), millisecond precision):
  request_delegation_start_monotonic_ms
  request_end_monotonic_ms
  elapsed_ms
```

The only durable ordering predicate is wall-clock UTC:

```text
contactIntentAt <= contactStartedAt <= request_delegation_started_at
```

The non-strict final comparison permits equal millisecond timestamps.
Monotonic values are used only to compute/validate nonnegative elapsed
duration within the same process. They are never compared to DB `DateTime`,
wall-clock UTC, another process, or a recovered run.

The observer may record only:

- call count;
- exact permitted endpoint;
- method and redirect mode;
- the separated wall-clock and monotonic fields above;
- HTTP status when a `Response` was received;
- received `Content-Type`; and
- a bounded abort/timeout/DNS/TLS/connect/reset/other transport-exception
  category when safely classifiable.

It must never record headers, Authorization, API key, MID, request body,
provider order ID, raw response body, raw `resmsg`, raw fgkey, cookies, or
customer data. It must return the original `Response` object unchanged to
installed source. It must not call `clone()`, `arrayBuffer()`, `blob()`,
`bytes()`, `formData()`, `text()`, `json()`, `body.getReader()`, or otherwise
buffer, tee, inspect, or consume the response stream. Installed S1/S2 source is
the sole response consumer.

There is no retry after timeout, abort, DNS/TLS/reset, HTTP non-2xx, 429, 5xx,
invalid content type, malformed/oversized body, provider non-success,
admission failure, persistence/evidence failure, or ambiguous process failure.
If contact may have occurred, the run stops. No second scenario follows
success or failure.

## 12. Result classification

The evidence package uses exactly one top-level disposition:

```text
PRECONTACT_BLOCKED
CONTACT_OUTCOME_UNKNOWN
READY_NOT_ADMITTED
READY_ADMITTED
```

These are installed-source observed classifications emitted by the exact
reviewed H1 runner. The package deliberately has no raw-response custody and
does not permit an adjudicator to recompute response semantics independently.
The bounded classification is reviewable through H1/source identity, journal,
safe transport metadata, and redaction/finalization evidence only.

### 12.1 `PRECONTACT_BLOCKED`

`provider_contact_count == 0`. Examples are missing invocation authority,
baseline/source drift, missing approved input, invalid public origin,
disposable database failure, migration/fixture failure, routing drift, or local
canonical/request-plan failure. Record only a bounded local failure code.

### 12.2 `CONTACT_OUTCOME_UNKNOWN`

`provider_contact_count == 1` or contact may have occurred, but no safely
admitted complete provider response exists. This includes an observed fetch
throw, timeout/abort, response loss, process uncertainty after delegation, and
installed S1 `TRANSPORT_FAILURE`. No retry is authorized.

### 12.3 `READY_NOT_ADMITTED`

Exactly one response was observed and installed S1 returned `notAdmitted` with
one bounded code:

```text
NON_2XX
BODY_TOO_LARGE
TOO_MANY_RESPONSE_CHUNKS
INVALID_CONTENT_TYPE
INVALID_RESPONSE_CHUNK
INVALID_UTF8
INVALID_JSON
INVALID_ROOT
DUPLICATE_PROTECTED_KEY
INVALID_RESCODE
INVALID_RESMSG
INVALID_FGKEY
PROVIDER_NON_SUCCESS
```

Persist only the code and safe HTTP metadata. This evidence disposition does
not mean a terminal business failure and does not prove the provider performed
no side effect; it retains the governing ambiguous-contact/no-retry posture.
No raw body, `resmsg`, or fgkey is retained.

### 12.4 `READY_ADMITTED`

Installed S1 returned `admittedSuccess`. Under the frozen installed source this
means a 2xx response, admitted JSON content type, bounded chunks/bytes, valid
UTF-8 and root JSON, unique protected root keys, valid required strings, exact
`rescode == "0000"`, and an admitted readyFgkey held only by the in-memory
`TrustedEximbayReadySuccess` authority.

Record only:

```text
admitted_success: true
trusted_success_existed_only_in_memory: true
fgkey_persisted: false
fgkey_logged: false
fgkey_exposed: false
sdk_wire_materialized: false
```

Do not inspect, materialize, compare, serialize, log, hash, or otherwise access
the raw fgkey. Do not construct `FreshEximbayReadyAuthority` or an S3 browser
package. Process exit discards the authority. `READY_ADMITTED` means READY
transport/admission success only, never authentication of a financial result,
authorization, capture, completion, paid Order truth, or universal merchant
capability.

## 13. Durable evidence package

The later run creates exactly one redacted durable package:

```text
<E1A_CUSTODY_ROOT>/<RUN_ID>/original/WIG_PAY_EXIM_EX2B2_E1A_READY_EVIDENCE_<RUN_ID>.zip
```

The archive is not authoritative until the persistent-custody procedure in
section 8A has produced and verified both the `original/` and `archive/`
copies. The package contains the exact final `FINALIZED` journal snapshot;
retaining only the ZIP or only a temporary copy is insufficient. A missing
journal or incomplete archive is a custody failure, not evidence of zero
contact and not a reason to contact the provider again.

It contains exactly these 14 regular-file entries and no directory entries:

```text
00_README.md
01_run_manifest.json
02_precontact_gate.json
03_source_identity.json
04_execution_harness.ts
05_execution_launcher.mjs
06_request_plan_observation.json
07_contact_budget_journal.json
08_transport_observation.json
09_admission_result.json
10_database_fixture_and_cleanup.json
11_security_redaction_audit.txt
12_self_audit.md
13_hashes.sha256
```

Required safe content is:

| Entry | Required content |
| --- | --- |
| `00_README.md` | evidence class, scope, disposition, explicit non-conclusions, H1 identity, one-contact rule, raw-response non-custody, and sensitive-artifact exclusions |
| `01_run_manifest.json` | schema/contract/H1 versions, run ID, approved baseline, installed contract and reviewed H1 packet identities, start/end wall times, disposition, contact ordinal/count, entry count |
| `02_precontact_gate.json` | H1 byte match, credential class/provenance boolean, named-variable presence, child-environment/TLS/log gates, baseline/source/routing/database/fixture/plan booleans, bounded blocked code |
| `03_source_identity.json` | exact approved HEAD/tree, section 5 byte/hash table, migration-manifest hash, all-match boolean |
| `04_execution_harness.ts` | byte-identical independently reviewed H1 `e1a-runner.ts`; no reconstruction or generated variant |
| `05_execution_launcher.mjs` | byte-identical independently reviewed H1 `e1a-launcher.mjs`; no identity-only substitute |
| `06_request_plan_observation.json` | fixed safe request semantics, request bytes, provider-order/MID/origin equality booleans, synthetic-buyer boolean; no body/raw identifiers |
| `07_contact_budget_journal.json` | exact final safe `FINALIZED` journal snapshot, prior-state sequence/ordinals, atomic-fsync booleans, and no secret/request/response material |
| `08_transport_observation.json` | call ordinal/count, endpoint/method/redirect, separated wall-clock/monotonic timing, safe HTTP status/content type, bounded exception/log classification |
| `09_admission_result.json` | top-level installed-source observed classification, bounded S1 code or admitted booleans, non-financial/non-SDK and non-recomputable evidence statements |
| `10_database_fixture_and_cleanup.json` | admitted DB category, unique database proof, migration/empty/fixture booleans, synthetic row counts, final cleanup/drop outcome or bounded failure; no secret |
| `11_security_redaction_audit.txt` | fixed safe redaction results from section 14 after final-byte scanning |
| `12_self_audit.md` | section 18 answers, H1/journal/environment/clock/finalization and no-retry proof |
| `13_hashes.sha256` | SHA-256 of exact final entries `00` through `12`, using entry names only |

The H1 packet identity in entries `00`–`02` includes its canonical
path/basename, bytes, SHA-256, independent closure disposition, and the reviewed
bytes/SHA for entries `04` and `05`; it includes no credential value. The
package must not contain a raw request/response/body/header file, raw credential
or connection file, fgkey file, SDK file, environment dump, database dump,
cookie/session file, or unbounded error/log file.

## 14. Secret, H1-byte, output, and redaction audit

After cleanup and after exact final entries `00` through `10` and `12` have
been rendered, scan those complete final bytes plus the complete bounded
stdout/stderr custody bytes. The scanner also verifies entries `04` and `05`
are byte-identical to the invocation-authorized H1 hashes. It may compare
artifact/output bytes with the in-memory API key, MID, database connection,
approved origin, and derived Authorization but must never print, persist,
hash, fingerprint, or measure those values. The runner must never create a
file containing raw fgkey or provider response body; absence is proved by
reviewed construction and allowlisted final-artifact review, not by extracting
either value for scanning.

`11_security_redaction_audit.txt` contains only fixed safe booleans and no
matched text:

```text
api_key_found_in_artifacts: false
authorization_found_in_artifacts: false
mid_found_in_artifacts: false
fgkey_raw_found_in_artifacts: false
provider_response_body_found_in_artifacts: false
process_environment_dump_found_in_artifacts: false
database_connection_secret_found_in_artifacts: false
raw_request_body_found_in_artifacts: false
h1_harness_bytes_match_reviewed: true
h1_launcher_bytes_match_reviewed: true
stdout_redaction_passed: true
stderr_redaction_passed: true
stdout_within_bound: true
stderr_within_bound: true
```

Packaging is rejected if any `*_found_*` value is true or any required
match/pass/bound value is false. A redaction failure after contact does not
authorize another request. Quarantine unsafe workspace bytes under the
restrictive run permissions without copying matched content into a report,
preserve only minimum safe bounded failure metadata for human incident
handling, and stop.

## 15. Cleanup and repository invariance

Finalization uses this exact two-phase order:

1. render provisional safe observations only in memory or the restricted run
   workspace;
2. complete installed-source result classification and atomically fsync
   `CONTACT_RESULT_CLASSIFIED`;
3. close all Prisma/client handles;
4. delete the synthetic fixture in referentially safe order and preferably drop
   the entire uniquely named disposable database;
5. atomically fsync the terminal journal `FINALIZED` state with a bounded
   cleanup-complete or cleanup-failed code;
6. render final `07_contact_budget_journal.json` and
   `10_database_fixture_and_cleanup.json`, then render/finalize every other
   entry `00` through `10` and `12`;
7. run the section 14 redaction/H1/output scan over the complete final bytes of
   entries `00` through `10` and `12` plus complete bounded stdout/stderr;
8. write `11_security_redaction_audit.txt` from fixed safe booleans only;
9. validate entry `11` contains only the fixed schema and admitted values;
10. write `13_hashes.sha256` over exact entries `00` through `12`;
11. create the ZIP from those exact 14 final regular files with no directory
    entries in persistent `original/`, fsync the ZIP and its parent directory;
12. create a separate persistent `archive/` copy, fsync the copy and its
    parent directory, and verify equal bytes/SHA-256 and distinct regular-file
    custody; and
13. verify ZIP entry names/count, CRC/integrity, bytes, SHA-256, equality of
    the packaged H1 files to the reviewed hashes, and byte identity with the
    authoritative `FINALIZED` journal.

No entry `00`–`10` or `12` may change after step 7. After that scan, only the
fixed audit entry `11` and deterministic hash entry `13` may be created in the
prescribed sequence; neither may contain variable error text or secret-derived
data.

Cleanup removes only disposable synthetic data and must never touch a shared
database or customer row. If cleanup/drop fails, record a bounded code, set
`cleanup_complete: false`, require explicit manual cleanup, retain the
disposable database, and issue no further provider request. A safe evidence
package may still be finalized only if the complete final-byte redaction scan
passes; it must not claim cleanup complete.

The authoritative journal, reviewed H1 files, and both final ZIP copies remain
after `FINALIZED`; cleanup must never delete them. Quarantine and disposable
database cleanup are separate operations. If archive custody is incomplete,
retain the original and journal, record a bounded custody failure, and stop
without another provider contact.

The repository must be byte-identical before and after the future execution.
Capture before and after:

```text
git rev-parse HEAD
git status --short
```

Expected results are the exact approved execution baseline both times and an
empty status both times. Any caused change is a failed invariance audit and
does not authorize a retry. The persistent custody root, journal, H1 files,
and result ZIP copies stay outside the repository and outside `/private/tmp`.

## 16. Mandatory stop conditions

Stop before contact if the run would require any of:

- LIVE credentials, `EXIMBAY_LIVE_API_KEY`, `EXIMBAY_LIVE_MID`, or a LIVE
  endpoint;
- `PUBLIC_SHARED_TEST`, provider documentation's public shared-test pair, or
  any credential class other than approved `ACCOUNT_BOUND_SANDBOX`;
- missing/unclosed H1 review, H1 packet/file identity drift, code generation,
  or launcher/runner mutation after credential admission;
- missing/non-persistent/symlinked/non-0700 custody root, reused/non-empty run
  directory, missing H1 custody, missing journal, forward-journal violation,
  failed atomic write/rename/fsync, incomplete original/archive custody, or a
  prior `CONTACT_MAY_HAVE_OCCURRED` state;
- a missing, corrupt, or lost journal (which never proves zero contact), or
  any execution/journal/authoritative-evidence/result path under
  `/private/tmp`;
- arbitrary inherited environment, non-production `NODE_ENV`, inherited
  `NODE_OPTIONS`, proxy state, custom dispatcher/agent, insecure TLS, disabled
  certificate verification, unbounded stdout/stderr, or failed output scan;
- customer data or a production/staging/shared/cloned database;
- a routing, registry, factory, allowed-mode/method/currency, or live-allowlist
  change;
- source, test, schema, migration, dependency, config, route, CSP/header, CI,
  or tracked/untracked repository change;
- a new durable Payment lifecycle state or production Payment mutation;
- SDK asset fetch/load/parse/compile/evaluate/execute;
- `EXIMBAY.request_pay`, payment-page interaction, or S3 browser
  materialization;
- `status_url`, BF4 route/verification, payment completion, Order,
  ManufacturingRequest, or outbox behavior;
- a second READY request, automatic retry, warm-up/probe request, or another
  Eximbay API/SDK-origin request;
- raw request/response/fgkey persistence;
- credential logging, hashing, fingerprinting, length/prefix/suffix reporting,
  or environment dumping; or
- a new source seam or reimplementation of installed protocol/transport.

If a new seam is necessary, return to source review. Do not solve it in the
E1A harness.

## 17. Failure, recovery, and change control

Precontact failures before `CONTACT_MAY_HAVE_OCCURRED` keep contact count zero,
but a run ID/workspace is never casually reused. A new invocation uses a new
run ID; disposal or recovery of an existing `PRECONTACT_PREPARED` workspace
requires reviewed proof of zero delegation and persistent journal custody.
Missing, corrupt, truncated, or lost journal custody never proves zero contact;
it is `E1A_RECOVERY_BLOCKED_CONTACT_LEDGER_UNAVAILABLE`, blocks all provider
contact, and cannot be bypassed by creating a new run ID. Once the journal durably reaches
`CONTACT_MAY_HAVE_OCCURRED`, the one-contact authority is permanently consumed
regardless of whether `globalThis.fetch` returned, threw, or was reached before
a crash. Every subsequent process must refuse contact. Every ambiguous or
not-admitted result stops without retry. Provider inquiry, reconciliation,
READY recontact, journal recovery, or any attempt to establish that no network
byte left the process requires separate reviewed authority.

This candidate may be withdrawn by deleting its uninstalled one-path addition.
After installation, documentation rollback is a separately reviewed revert of
the contract merge. Neither rollback authorizes E1A or changes installed source.

A new reviewed contract version is required for any change to the execution
baseline rule, H1 files/review gate, child environment/TLS/log custody,
credential class, contact count/journal/durability, clock domains,
endpoint/mode, credential custody, origin gate, synthetic scenario, database
boundary, installed source path/hash, observer, classification/evidence class,
package schema, redaction/finalization/cleanup, routing posture, SDK/BF4
boundary, or later activation meaning. Do not edit v0.1 in place after closure.

## 18. Mandatory invocation self-audit

The later package must answer explicitly:

```text
Is the invocation baseline exactly the separately approved installed-contract baseline?
Do all section 5 source/schema/migration identities match?
Was repository status empty before and after?

Was an exact zero-contact-reviewed H1 packet closed before invocation?
Did invocation authority name H1 packet bytes/SHA and both file bytes/SHA?
Are packaged execution entries byte-identical to reviewed e1a-runner.ts and e1a-launcher.mjs?
Was all code generation/source mutation complete before credential admission?

Is credential_class exactly ACCOUNT_BOUND_SANDBOX?
Was credential provenance admitted without recording identifying material?
Were official PUBLIC_SHARED_TEST credentials acknowledged but excluded with no fallback?
If an account-bound pair was unavailable, did execution block with zero contact?

Was EXIMBAY_SANDBOX_API_KEY present?
Was EXIMBAY_SANDBOX_MID present?
Was PAYMENT_PUBLIC_ORIGIN present and admitted by installed S2 validation?
Were LIVE values, .env files, public shared-test values, and customer data excluded?

Was the child environment exactly allowlisted and NODE_ENV exactly production?
Were NODE_OPTIONS, insecure TLS, proxy/custom dispatcher state, and unlisted env excluded?
Were default TLS verification, umask 077, bounded stdout/stderr, and output scans proven?

Was the database uniquely disposable, exactly migrated, initially empty, and synthetic-only?
Were DB DateTimes compared only to wall-clock UTC at millisecond precision?
Were monotonic timestamps used only for same-process elapsed duration?
Is the CONTACTED fixture explicitly only a lower-seam fixture, not the contact ledger?

Did the run use installed config/facts/binding/plan/HTTP/admission modules?
Was manual curl excluded as primary and fallback evidence?
Did the observer leave the provider Response stream untouched?

Was PRECONTACT_PREPARED atomically written, renamed, file-fsynced, and directory-fsynced?
Was CONTACT_MAY_HAVE_OCCURRED durable before global fetch delegation?
Can a crash/signal after that state ever permit a silent second contact? (required: NO)
Was provider_contact_count 0 or 1 and never greater than 1?
Was the only possible target the exact SANDBOX READY endpoint?
Did every post-contact failure stop without retry?

Were DB handles closed and cleanup completed or failed before final entries 07/10 were rendered?
Did the redaction scan cover final entries 00-10 and 12 plus bounded stdout/stderr?
Were only fixed audit entry 11 and hash entry 13 created after that scan?
If cleanup failed, does the package say cleanup_complete false and retain the DB for manual cleanup?

Does the package omit raw request, response, fgkey, credential, MID, origin URL,
providerOrderId, connection secret, environment dump, and customer material?
Does it identify evidence as REVIEWED-HARNESS / INSTALLED-SOURCE OBSERVED CLASSIFICATION?
Does it state raw response semantics are not independently recomputable?

Does READY_ADMITTED mean only READY transport/admission success?
Was trusted success retained only in memory and discarded on exit?
Were S3 browser materialization, SDK load, and request_pay all absent?

Did EXIMBAY routing remain disabled?
Did installation remain distinct from invocation?
Is E1B still separate and later?
Is BF4 still separate?
Is E2 still gated after BF4 readiness?

Was `E1A_CUSTODY_ROOT` an exact persistent non-symlink `0700` root outside
the repository and `/private/tmp`?
Was a unique non-reusable run directory created with restrictive modes?
Were the reviewed H1 packet, runner, and launcher persistently custodied before
credential admission and contact-capable import?
Was the authoritative journal retained after `FINALIZED`, including through
database cleanup and ZIP construction?
If the journal was missing or corrupt, did execution block rather than infer
zero contact or create a bypass run ID?
Were the original and archive ZIP copies separate regular files with equal
bytes/SHA-256 and file/parent-directory fsyncs?
If archive custody was incomplete, did the original and journal remain intact
and did execution stop without a second provider contact?
Were quarantine and disposable DB cleanup kept separate from journal/H1/result
custody?
Were there zero `/private/tmp` execution, journal, authoritative evidence, or
result paths in the installed repository contract?
```

Any answer inconsistent with this contract invalidates the E1A package and
does not authorize a second contact.

## 19. D1R2 persistent-custody correction closure and next gate

| Finding | Corrected disposition |
| --- | --- |
| `E1A-D1R-B01` | `CLOSED_BY_CORRECTED_CONTRACT` — mandatory zero-contact H1 review binds exact `e1a-runner.ts` / `e1a-launcher.mjs` bytes and package identities before invocation; byte-identical sources enter the 14-entry evidence package. |
| `E1A-D1R-B02` | `CLOSED_BY_CORRECTED_CONTRACT` — atomic rename plus file/directory-fsynced forward-only journal reaches `CONTACT_MAY_HAVE_OCCURRED` before fetch delegation; crash/uncertainty permanently consumes authority. |
| `E1A-D1R-I01` | `CLOSED_BY_HUMAN_APPROVED_POLICY` — credential class is exactly `ACCOUNT_BOUND_SANDBOX`; official `PUBLIC_SHARED_TEST` credentials and BF2 history are acknowledged but excluded without fallback. |
| `E1A-D1R-I02` | `CLOSED_BY_CORRECTED_CONTRACT` — wall-clock UTC ordering and `node:perf_hooks` monotonic elapsed timing are separate and never cross-compared. |
| `E1A-D1R-I03` | `CLOSED_BY_CORRECTED_CONTRACT` — reviewed launcher owns an exact production child environment, default TLS/no-proxy posture, restrictive permissions, bounded stdout/stderr, and output redaction. |
| `E1A-D1R-I04` | `CLOSED_BY_CORRECTED_CONTRACT` — cleanup and terminal journal precede final entry rendering; complete final bytes are scanned before fixed audit/hash creation and ZIP verification. |
| `E1A-D1R-M01` | `CLOSED_BY_CORRECTED_CONTRACT` — evidence is explicitly reviewed-harness / installed-source observed classification, not raw-response custody or independently recomputable semantics. |
| `E1A-D1R2-B01` | `CLOSED_BY_CORRECTED_CONTRACT` — invocation-bound persistent non-symlink `0700` custody root, unique run directory, precontact H1 custody, retained authoritative journal, separate fsynced original/archive ZIP copies, and no `/private/tmp` execution/journal/result authority prevent silent loss or cleanup of contact evidence; archive failure stops without recontact. |

FINAL INDEPENDENT E1A CONTRACT CLOSURE:
  PASS — BLOCKER 0 / IMPORTANT 0 / MINOR 0

FINAL REVIEWED CONTRACT PACKET:
  WIG_PAY_EXIM_EX2B2_E1A_D1_REVIEW_v0_3.zip
  29446 bytes
  SHA-256 17a04ededfe12415f5269e339a9b2f196935f8cef37bcb49a6d7cbda22822a33

FINAL REVIEWED CONTRACT:
  61929 bytes
  SHA-256 9c88187137f3b7d2a2b17d31ded51dd4967266fb7e4ce400e171a4cfe4eeec7a

FINAL REVIEWED ONE-PATH DIFF:
  63659 bytes
  SHA-256 e2696aa31fc99b60a2b91bcdba98e723a4dbef79e9df04bd7891db0674ec6856

PROVIDER CONTACT DURING D1/D1R/D1R2 AUTHORING AND REVIEW:
  0

REAL CREDENTIAL VALUE READ / USED:
  0

INSTALLATION EFFECT:
  installs normative future evidence-execution limits only
  grants no standing provider-contact authority

NEXT GATE AFTER INSTALLATION:
  zero-contact E1A-H1 runner/launcher candidate
  independent H1 source/byte review

This reviewed contract grants no standing provider-contact authority. After
reviewed installation, the next gate is zero-contact E1A-H1 runner/launcher
candidate generation and independent source/byte review. The preserved
sequence remains D1 reviewed installation -> H1 zero-contact candidate -> H1
independent review -> separately explicit invocation authority -> maximum one
SANDBOX READY contact. E1B remains later and independent.

```text
EX2B2-E1A D1 LIFECYCLE SYNC CANDIDATE COMPLETE
— READY FOR FINAL BYTE-DELTA REVIEW AND CONTRACT INSTALLATION
```

No substantive E1A execution, credential, H1, journal, persistent-custody,
clock, environment, TLS, evidence, cleanup, redaction, retry, routing, SDK,
BF4, or runtime-authority decision was changed after final independent
contract closure. No repository source, test, schema, migration, dependency,
runtime-config, routing, SDK, BF4, CSP/header, or CI file was modified. No
Eximbay API origin was contacted. No real Eximbay JavaScript SDK asset was
fetched, loaded, parsed, compiled, evaluated, or executed. No
`EXIMBAY.request_pay` call was made. No real credential value was read, used,
fingerprinted, or revealed. EXIMBAY routing remained disabled. No
sandbox/live/customer runtime was activated. The lifecycle-synced contract
grants no standing provider-contact authority; the next gate is zero-contact
E1A-H1 review after contract installation.
