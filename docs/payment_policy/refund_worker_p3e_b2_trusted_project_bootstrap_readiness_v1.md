# Refund worker P3E-B2 trusted project bootstrap readiness v1

Status: repository definition only. TB1 does not assert that a Google Cloud project exists or that
any billing relationship or API state has been observed.

```text
TB1_CLOUD_MUTATION: NONE
TB1_CLOUD_OBSERVATION_DURING_IMPLEMENTATION: NONE
TB1_RUNTIME_AUTHORITY: NONE
TB1_JOB_EXECUTION_AUTHORITY: NONE
TB1_PROVIDER_CONTACT_AUTHORITY: NONE
TB1_JSON_SCHEMA_ROLE: STRUCTURAL_PREFILTER_ONLY_NOT_READINESS_AUTHORITY
TB1_EVIDENCE_WRITER: DEFERRED
TB1_OUTPUT_PATH_CHECK: ADVISORY_PREFLIGHT_ONLY_NOT_A_WRITE_SAFETY_BOUNDARY
TB1_INJECTED_DEPENDENCY_FAILURES: STATIC_BOUNDED_NO_RAW_CAUSE_PROPAGATION
TB1_CANONICAL_ARRAY_WORK_BOUND: LENGTH_REJECTED_BEFORE_LENGTH_PROPORTIONAL_WORK
```

The contract version is
`mira-refund-p3e-b2-trusted-project-bootstrap-readiness/v1`.

## Purpose and truth boundary

TB1 defines a fail-closed parser, restricted canonicalization domain, evidence digest, disposition
rules, and an injected future read-only command boundary. Repository definitions and synthetic test
fixtures are not cloud evidence. Implementation and tests neither authenticate nor contact Google
Cloud and provide no real subprocess adapter.

A later attended operator may collect read-only evidence outside the repository. Missing bootstrap
APIs require a separately authorized activation package. Billing mutation is never owned by TB1.
State creation, API mutation, IAM deny, foundation apply, runtime apply, Job invocation, provider
contact, scheduling, acceptance, production, and LIVE authority remain absent.

Any later mutating package must independently re-observe the project ID/number binding, project
lifecycle, billing readiness, and exact bootstrap API tuple immediately before mutation. It cannot
consume TB1 evidence as a durable authorization token.

## Exact bootstrap API inventory

The only admitted APIs, in exact order, are:

1. `cloudresourcemanager.googleapis.com`
2. `serviceusage.googleapis.com`
3. `storage.googleapis.com`

The SHA-256 of their sorted UTF-8 names joined by LF with no trailing LF is:

```text
2b5b1961dd67cc23e748d7b6a80df83aac85e475b74403469ac99ef3ac3f0bc7
```

No fourth service, duplicate, missing observation, reordered inventory, or crossed consumer project
number is accepted.

## Collection and review

A coherent collection may be sealed without an independent reviewer. The reviewer then has the
exact shape:

```json
{ "status": "ABSENT" }
```

The review has the exact shape:

```json
{ "disposition": "INDEPENDENT_REVIEW_REQUIRED" }
```

Reviewer identity fields are forbidden in that state. One-person collection can preserve historical
evidence but cannot yield `READY_FOR_STATE_BUCKET_PACKAGE` and cannot authorize mutation.

A present reviewer has exactly `status`, `principalClass`, and
`principalIdentifierSha256`. The reviewer fingerprint must differ from the collector fingerprint,
and the review must include a UTC `reviewedAt` no earlier than collection completion.

The supported dispositions are exactly:

- `READY_FOR_STATE_BUCKET_PACKAGE`
- `BOOTSTRAP_API_ACTIVATION_REQUIRED`
- `BILLING_NOT_READY`
- `PROJECT_NOT_DEDICATED_OR_INVALID`
- `OBSERVATION_INCOMPLETE`
- `EVIDENCE_STALE_OR_UNTRUSTED`
- `INDEPENDENT_REVIEW_REQUIRED`

Structurally invalid project observations are not sealable evidence; the future collection boundary
maps them to `PROJECT_NOT_DEDICATED_OR_INVALID`. Missing or malformed observations similarly map to
`OBSERVATION_INCOMPLETE`. A valid archived record older than 900 seconds remains historical evidence
but evaluates only as `EVIDENCE_STALE_OR_UNTRUSTED`.

For valid evidence with a present distinct reviewer, billing disabled takes precedence over API
state, an unobservable billing/API state yields `OBSERVATION_INCOMPLETE`, a disabled API yields
`BOOTSTRAP_API_ACTIVATION_REQUIRED`, and only enabled billing plus all three enabled APIs yields
`READY_FOR_STATE_BUCKET_PACKAGE`.

## Principal fingerprint truth

```text
PRINCIPAL_IDENTIFIER_SHA256:
CORRELATION_FINGERPRINT_NOT_ANONYMIZATION
```

A raw SHA-256 of a principal identifier is a correlation fingerprint, not a secrecy or anonymity
mechanism. It does not prove identity ownership, prevent dictionary recovery, or provide
cryptographic nonrepudiation.

Raw principal identifiers must never be committed or printed in repository/public output. Tests use
synthetic hashes only. A real raw identifier may exist only in restricted external operational
evidence. Independent review is an organizational evidence claim. TB1 creates no HMAC key, signing
authority, secret, or durable evidence-custody authority.

The evidence digest is tamper evidence only; it does not prove that a collector was honest.

## Restricted canonicalization

TB1 implements `RFC8785_JCS_RESTRICTED_DOMAIN_V1`. It does not claim arbitrary RFC 8785 support.
The admitted domain is:

- exact-key ordinary data objects;
- arrays;
- well-formed Unicode strings without lone surrogate code points;
- booleans;
- schema-permitted null;
- schema-permitted safe nonnegative integers.

The canonicalizer admits at most 64 nested value edges and 10,000 value nodes, counting the root
and every array element or object property value while excluding object-key strings. It rejects
cycles, sparse or extended arrays, symbols, accessors, non-data properties, non-plain prototypes,
and hostile direct-call graphs before reading property values.

An array node consumes one node before its length is inspected. Its length must fit the exact
remaining node capacity before own-key inspection, descriptor inspection, expected-index
comparison, allocation, or traversal. The bounded validator compares canonical index keys in place
and does not materialize an attacker-length expected-key inventory.

It rejects floating point, `NaN`, infinities, negative zero, unsafe integers, negative values,
duplicate JSON keys, unsupported Unicode sequences, accessors, `undefined`, bigint, functions,
binary values, and arbitrary numeric normalization.

Canonical object keys use ECMAScript/JCS UTF-16 lexical ordering. Strings use ECMAScript JSON
serialization. The admitted subset therefore emits the same canonical bytes as RFC 8785/JCS.

`integrity.evidenceSha256` is lowercase SHA-256 over the exact UTF-8 canonical evidence with that
one property omitted. `integrity.canonicalization` and `integrity.algorithm` remain in the preimage.

## Evidence handling

Real evidence:

- must be written only outside the repository;
- is operationally restricted even though its sanitized fields are not credentials;
- must never retain a billing-account identifier;
- must never contain an access token, credential path, database URL, secret, provider target,
  payment data, or raw principal identifier;
- expires for readiness consumption 900 seconds after collection completion;
- allows at most 60 seconds of future clock skew;
- remains non-authoritative after expiry.

The JSON parser performs lexical duplicate-key detection before materializing the value. Every
object has an exact key set and data-only properties. Unknown keys at any level fail closed.

The JSON Schema is only a structural prefilter. It is not readiness authority because project/API
binding, non-production project classification, collector/reviewer distinction, disposition
coherence, timestamp ordering and freshness, and digest recomputation require the authoritative
duplicate-safe parser and semantic evaluator. Schema validity alone never yields a disposition.

## Future read-only command boundary

The implementation exports exact command vectors and a typed injected executor. It intentionally
contains no real subprocess adapter, network client, authentication flow, credential loader, or
evidence writer.

Approved command kinds are:

- authenticated project GET with explicit project ID;
- billing-info GET with explicit project ID;
- exact service-state list with explicit project ID;
- `gcloud` version;
- active collector identity classification.

The boundary requires an explicit bounded non-production project ID and an explicitly supplied
external Cloud SDK configuration path. Both the Cloud SDK path and any evidence output path must
resolve outside the repository. It never relies on the active gcloud project or Application Default
Credentials.

Login, credential activation, project/config selection, API enable/disable, IAM mutation, Terraform,
resource creation, Job execution, registry, database, and provider commands are not in the allowlist
and are rejected before the injected executor can run.

Captured stdout is limited to 65,536 bytes, stderr to 4,096 bytes, and a command attempt to 30
seconds. Bytes are decoded as fatal UTF-8, duplicate-safe parsed, recursively leakage-scanned,
validated with an exact command-specific shape, reconstructed into a sanitized result, and scanned
again. At most three read attempts are admitted. Only explicitly classified read-only 429 and 5xx
failures may retry, after bounded 250 ms and 1,000 ms waits. Authentication, authorization,
not-found, project mismatch, malformed output, oversized output, and other command failures never
retry. Raw stdout, stderr, decoded gcloud objects, billing-account identifiers, and principal
identifiers are never public results. Collector identity parsing retains only its class and
SHA-256 correlation fingerprint.

Synchronous throws, rejected promises, and hostile thenables from the injected executor,
retry-wait function, and path canonicalizer are normalized to static finite failure variants.
Original rejected values, messages, stacks, causes, raw strings, objects, and principals are not
retained, interpolated, logged, or returned. This module-boundary guarantee does not claim to
prevent arbitrary process crashes, JavaScript engine exhaustion, or malicious host compromise.

## Deferred evidence writer

TB1 contains no evidence writer. Its repository-containment helper is an advisory early rejection
only and is not permission or a safety boundary for a write. It does not prevent symlink or parent
replacement, TOCTOU, overwrite, partial writes, unsafe file descriptors, interrupted writes, or
post-check path changes.

A later separately authorized writer must define an externally anchored parent, no-follow
semantics, exclusive creation, restrictive permissions, temporary-file handling, fsync policy,
atomic rename, overwrite policy, and interruption recovery.

## Downstream authority

Every evidence record contains exact false values for:

- API mutation;
- state authority;
- deny authority;
- foundation authority;
- runtime authority;
- Job execution;
- provider contact.

No TB1 disposition changes those false values. `READY_FOR_STATE_BUCKET_PACKAGE` means only that an
independently reviewed, fresh read-only tuple is coherent enough to begin a separately authorized
state-bucket package.
