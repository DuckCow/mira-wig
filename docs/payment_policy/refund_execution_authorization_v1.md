# Refund execution authorization v1 — prospective B + minimal D

Status: source implementation; issuance/admission default OFF. This contract scopes
ordinal-zero Eximbay SANDBOX re-entry after migration M. It grants no live migration,
issuance, execution, provider access, image build or deployment authority. Existing
deployment/image/approval evidence continues to describe its original bytes and effects.

## Responsibility and lifecycle

`RefundExecutionAuthorization` is execution authority over one existing Command,
RefundAttempt and provider-operation binding. It creates none of those financial records.
The composite foreign keys preserve their correspondence; deletion/update is restricted.
The grant stores the original target-v1 digest, expected predecessor generation, fixed
`EXIMBAY_SANDBOX_BOUND_ORDINAL_ZERO_REENTRY` operation class and reviewed release-policy
SHA-256, plus issuer/request/time and consumption/revocation correlation. It contains no
provider credentials, raw lease token, customer snapshot or provider payload.

Issuance lives in `src/lib/payment/refund/authorization/admin.ts`, called by the existing
NextAuth-backed admin Server Actions and `/admin/refunds/execution` panel. Each operation
requires a session ADMIN and rechecks the current User role under a database share lock.
Forged actor fields are rejected. Inputs are closed:

- Issue: `issuanceRequestId` (UUID), `commandId`, `expectedPredecessorGeneration`,
  `confirmedTargetBindingDigest`, `releasePolicyDigest`.
- Read: `commandId`, optional command-scoped `cursor`, `pageSize` (1–50, default 20).
- Revoke: `grantId`. The current authenticated user is the revoker.

The issue request UUID is globally unique. Repeating identical content by the same issuer
returns the original grant, including its original expiry and current lifecycle. Different
content/issuer conflicts. A partial unique `(commandId, expectedPredecessorGeneration)`
where `revokedAt IS NULL` reserves expired and consumed slots too. Explicit revocation of
an unused grant frees its slot; a new issuance request is required for replacement.
Repeated revocation returns the original revocation. Expired unused grants can be revoked.
Consumed grants cannot be revoked/reset/deleted. History reads and unused revocation remain
available while issuance/admission are OFF. Reads return correlation, never raw lease tokens.

Issuance uses database time and a 30-minute admission deadline. Consumption must occur at
`issuedAt <= databaseTime < expiresAt`. Expiry does not undo a committed consumption.
Execution then obeys the existing five-minute lease and bounded contact owners.

## Admission, release and runtime trust

`POST /api/payments/refunds/reentry/admission` accepts only `grantId` and `executionName`,
plus a Google-signed bearer ID token. No browser session, actor string, image string or grant
ID alone authorizes execution. The server selects its configured reviewed policy digest;
this avoids putting a manifest's own digest inside its exact worker task template.

The application configuration is:

- `MIRA_REFUND_AUTHORIZATION_ENABLED=ENABLED` for explicitly authorized issuance/admission.
  Any other/missing value is OFF; it never disables database enforcement.
- `MIRA_REFUND_REENTRY_RELEASE_FILE`: absolute server-owned path to reviewed UTF-8 JSON,
  at most 64 KiB. `MIRA_REFUND_REENTRY_RELEASE_SHA256`: its exact byte digest.

The closed manifest fields are `formatVersion: mira-refund-reentry-release/v1`, `audience`,
`jobName`, `serviceAccountSubject`, `serviceAccountEmail`, `mid`,
`merchantAccountBindingId`, `credentialGenerationBindingId`, `secretResource`,
`secretVersion`, and `executionTemplate`. There is no real manifest/hash supplied by this
source task. The template is the complete reviewed Cloud Run v2 **Execution TaskTemplate**,
including defaults returned by the API, immutable image digest, command/args, environment,
database and secret references/versions, resources, networking and effect gates.
Only the `MIRA_REFUND_AUTHORIZATION_ID` environment value is `${GRANT_ID}` and substituted
with the selected grant ID. One container, zero retries, 180-second timeout, one task and
parallelism one are required. Review must include the exact complete effect/credential
configuration; manifest syntax validation is not an artifact review.

The worker needs its reviewed `MIRA_REFUND_REENTRY_ADMISSION_URL`,
`MIRA_REFUND_REENTRY_JOB_NAME`, selected `MIRA_REFUND_AUTHORIZATION_ID`, the enable flag,
restricted `DATABASE_URL`, and native `CLOUD_RUN_EXECUTION`. The existing canary effect
switches (`REFUND_EXECUTION_WORKER_ENABLED`, `REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED`,
`REFUND_EXECUTION_LEASE_ENABLED`, `REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED`,
`REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED`, `REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED`)
remain explicitly ENABLED; other execution switches, inline provider keys and LIVE/Toss
surfaces remain absent. Native task count/index/attempt must be 1/0/0. The admission URL is also the
ID-token audience. The application checks signed issuer/audience/expiry, immutable service
account subject and verified email, then GETs the named immutable Execution with its own
`run.executions.get` authority and lists its sole Task with `run.tasks.list`. Name is only a locator.
Exact job, UID, task/parallelism and every Execution-returned task-template field must match. Cloud Run may return the
`containers[].env` collection in an order different from the reviewed TaskTemplate. At that API boundary only, each
collection is first fail-closed validated as unique, supported entries: a valid nonempty name paired with exactly one
literal value or one `secretKeyRef` carrying exact secret and version identity. Duplicate names, missing or extra names,
malformed/ambiguous representations, literal/source substitutions, and any value or selector drift fail. Valid entries
are then compared by unique name and exact semantic value/source; their array position is not an authorization fact.
All other arrays, including command/args, remain position-sensitive. This is not generic JSON normalization: unknown
fields remain material, field-specific default rules remain limited to the documented Task fields, and reviewed release
bytes and historical bindings are never rewritten.
Exact Task parent identity comes from the output-only Task's fully-qualified `name`, whose
`projects/{project}/locations/{location}/jobs/{job}/executions/{execution}` parent must exactly
equal the already-verified Execution resource name; Task `execution` serialization is not an
identity authority. The Task's output-only `vpcAccess` must exactly match the reviewed VPC
configuration because Cloud Run v2 omits it from the Execution template; only an omitted Task
`egress` is normalized to its documented `PRIVATE_RANGES_ONLY` default. `Task.index` is an
ordinal identity field: only an absent raw `index` property is canonicalized to numeric `0`,
because ProtoJSON may omit that implicit numeric default for the sole ordinal-zero Task. A
present index must be a numeric integer and must still equal `0`; null, strings, booleans,
fractions and nonzero values fail closed. This API-boundary rule is field-specific: generic
missing-field or falsy-value normalization is forbidden. Completed/deleted executions are rejected. A unique execution
name and UUID cannot consume two grants. The worker makes one admission HTTP request and
validates the server's response over HTTPS. The release identity is never accepted from an
unverified worker image/environment claim.

This uses the existing Google identity mechanism (`google-auth-library`), not a new token
issuer. External identity/control-plane boundaries are replaceable in tests; PostgreSQL
locks, constraints and permissions remain real. SDK verification failures expose only a
bounded error, without bearer/credential data. Configuration is server-owned and must not
be writable by the worker/requester. Deployment review must establish the SA-to-job IAM
restriction and absence of impersonation/alternate-job authority. This is not attestation
of arbitrary malicious code with provider credentials or superuser-proof auditing.

### Admission diagnostic events

The application-owned admission handler writes two best-effort, non-authoritative structured
Cloud Run log events. `refund_reentry_admission_entered` is emitted on handler entry; a
rejected application request emits one `refund_reentry_admission_rejected` record for its
first failing stage and fixed safe reason. Events contain only the fixed route/method,
an already-provided valid Cloud Trace ID when present, and allowlisted stage/reason values.
`traceId` is an application field for correlation search, not a claim of automatic Cloud
Logging trace association. Verifier stages distinguish token verification, Execution lookup,
Execution identity/template verification, Task lookup, and Task VPC verification while retaining
the same public `EXECUTION_UNVERIFIED` result.
They never include bearer or serverless-authorization headers, token claims, request bodies,
cookies, grants, database URLs, secret values, or verifier payloads. Logging failure is
ignored and cannot change the HTTP response, authorization decision, grant consumption, or
financial progression. Public response status and body remain unchanged.

A Cloud Run platform-level rejection can occur before handler entry and consequently has no
application event. Conversely, absence of an application event is not alone proof of a
platform rejection until logging delivery is established.

`ListTasks` additionally emits one best-effort, non-authoritative
`refund_reentry_task_lookup` event for each completed lookup attempt. It contains only the
fixed operation name, Execution parent, `AUTH_CLIENT` or `API_REQUEST` phase, bounded elapsed
milliseconds, success result count, or an allowlisted failure class and numeric HTTP status.
The admission handler adds its existing trace ID when available. Credential material, headers,
response bodies, raw errors, and error messages are not emitted; logging cannot alter the
lookup result, verifier decision, public response, or durable admission path.

The immutable Execution/UUID facts follow the [Google Execution API](https://docs.cloud.google.com/run/docs/reference/rest/v2/projects.locations.jobs.executions);
ID tokens follow [Google service authentication](https://docs.cloud.google.com/run/docs/authenticating/service-to-service).

## Locked transition and historical correlation

`authorization/admission.ts` discovers ownership, then uses the existing Eximbay lifecycle
Order → refund attempts → Command → Payment → binding → dispatch/evidence/event locks,
then locks and rereads the grant. It captures fresh database time after locks and rechecks
current intent/identity/money suitability, original consumed seal, bound operation family,
release, state and expected generation. Initial scope is a SYSTEM full refund, USD positive
and at most 100 minor units, EXIMBAY/SANDBOX, expired LEASED, ordinal zero, preexisting binding,
no dispatch, preflight, contact proof or evidence. Possible-contact custody takes priority
and requires the separate recovery owner.

The transaction preassigns a fresh lease-event ID, consumes the grant, calls the existing
`persistRefundExecutionTakeover` full-CAS owner and inserts that exact lease event. It
commits all three before returning the winner's raw lease. There is no provider/control-plane
operation in this transaction. Same-grant consumers and revocation serialize; unique execution
correlation also rejects reuse across different grants. Any write/CAS/deferred-check failure
rolls all three back. A lost commit response/crash never rearms the grant or reissues its token.

M's immediate grant trigger requires consumption to observe the actual predecessor and a
not-yet-existing event ID. Its command guard requires that consumption before the actual
OLD/NEW generation transition. Deferred constraints require the exact matching Command,
consumed grant and fresh `LEASE_ACQUIRED` event at commit. A timestamp match or earlier
committed event alone cannot satisfy causality. Constraints fire on the newly consumed grant
and actual generation UPDATE, not on all historical grants whenever Command changes.
Consequently later lawful completion/clearing/another authorized generation retains the
prior event without requiring Command to remain forever LEASED at that generation.

The worker continues the **returned lease** through the existing Eximbay dispatch and contact
owners. It does not call generic reclaim again. One retrieve, at most one R1, zero automatic
retry/R2/refund lookup are retained. Contact marker commits before transport; UNKNOWN and
success persistence, raw-token/generation fencing and process terminal/diagnostic separation
retain their existing owners. This does not diagnose or claim to fix an earlier unknown
child failure.

## Exact lane, permissions and cutover

`S(C)` is the existence of a consumed `EximbayRefundSandboxCanaryApproval` for C with
format `mira-refund-eximbay-sandbox-canary-approval/v1`, provider EXIMBAY and mode SANDBOX.
It does not depend on a new grant, environment flag, current status, binding or expiry.
The mandatory lane is actual UPDATE with S, OLD generation ≥1, OLD ordinal zero and a
changed generation. Only expired LEASED g→g+1, 0→0 with the coupled grant is allowed.
Generation skip/decrease, same-generation fence replacement/extension, intermediate READY
or ordinal/status/event-type disguises cannot escape it. SQL expiry comparisons use UTC
explicitly. Immutable references/origin/event history preserve the selected relationship.

| Path / existing owner | Post-M behavior and writes |
| --- | --- |
| Initial acquisition / `acquire-lease.ts` | Existing authority; Command lease/fence/generation/updatedAt and Event `LEASE_ACQUIRED` 0→1 remain usable. |
| S expired ordinal-zero takeover / application admission | Moves to grant consumption + existing full CAS + exact Event INSERT, one transaction. Hardcoded/generic ungranted takeover is rejected. |
| S generation≥1 ordinal-zero release / `release-lease.ts` | READY release/reacquisition is retired; no grantless detour. Use approved expired-LEASED admission, or separately authorized inspection/manual disposition. |
| R1 / Eximbay first-dispatch and contact owners | Binding/proof/preflight/Dispatch INSERT, Command ordinal/updatedAt, Dispatch state/contactMarkedAt remain usable. |
| Financial result / `execution-result-persistence.ts` and Eximbay contact owner | Evidence and RefundAttemptTransition INSERT, Attempt result/status/error/updatedAt, Order status/updatedAt, Command status/availableAt/errors/updatedAt and lawful lease clearing remain usable. |
| Email intent / existing result owner | Deduplicated PaymentOutbox INSERT remains usable; SELECT remains forbidden. |
| Ordinal-one/contacted/outside-S recovery | Existing separately authorized owners retain their meaning. This grant does not authorize those paths. |

The existing shared worker `mira_refund_canary` retains generation UPDATE and Event INSERT.
After M, `scripts/eximbay-p3e-database-bootstrap.ts` always overlays
`scripts/refund-authorization-privileges.ts` before its postcondition/commit, including
canonical restore and temporary-profile paths. Frozen historical SQL is unchanged. Broad
UPDATE on four tables is replaced by exactly:

- Order: status, updatedAt.
- RefundAttempt: status, processedAt, failedAt, failureCode, safeFailureMessage,
  providerRefundId, updatedAt.
- Command: status, availableAt, leaseOwner, leaseUntil, leaseGeneration, leaseTokenHash,
  dispatchAttempt, lastSafeErrorCode, lastSafeErrorMessage, updatedAt.
- Dispatch: state, contactMarkedAt.

Existing lock-only columns and required SELECT/INSERT authorities remain. Workers/preflight
and PUBLIC have no grant-table privileges. The support owner's
`grantRefundAuthorizationApplicationAccess` accepts the actual existing application DB role;
it creates no production role. It grants grant SELECT/INSERT and only the seven lifecycle
UPDATE columns. Existing application financial/read/session privileges must be established
by that deployment's owner. No worker membership/SET ROLE path may reach that role.
Postconditions inspect effective table and column ACLs, PUBLIC, memberships, role safety,
ownership, callable SECURITY DEFINER entrypoints and enabled M triggers. Unexpected excess
privilege fails closed. No privileged runtime SQL admission function is exposed.
M uses the canonical `public` schema, with schema-qualified references and a fixed
`pg_catalog` function search path. Complete-history migration tests therefore use isolated
databases with `public`, rather than installing another copy into the same database's
alternate schema. Prisma relation maps preserve M's exact foreign-key names.

Rollout is: prepare compatible application/worker/bootstrap source → close admission and
drain every affected shared-role execution → apply **one** M
`20260909090000_refund_execution_authorization` → M commit immediately activates all guards
and deferred coupling → existing owner applies/verifies post-M ACL → open only compatible
reviewed admission. There is no inactive additive-trigger phase. Transaction deferral is not
deployment deferral. After M, rollback stops admission or selects a compatible release; it
cannot delete grants/history, disable enforcement, restore broad legacy ACLs or reset leases.

## Digest and validation boundary

`calculateEximbayCanaryTargetDigest` in `eximbay-refund-canary-target-binding.ts` is the single
unchanged target-v1 calculation owner, also used by the retained historical authority reader.
New grants reuse the original retained seal digest. Generation, operation class and release
are separate immutable authorization fields. Historical READY/ordinal literals remain facts
of original sealing, not current eligibility; current PII is never used to recreate synthetic
provenance. Current financial and provider-operation correspondence is checked independently.

Tests use synthetic fixtures and real restricted application/worker PostgreSQL connections.
Destructive fixture cleanup/fault injection requires `MIRA_REFUND_AUTHORIZATION_TEST_CLUSTER`
to equal the disposable cluster's actual data directory and a local `wig_platform_test` URL.
The migration regression uses installed `psql` (optional absolute override
`MIRA_REFUND_AUTHORIZATION_TEST_PSQL`) and a separate task-owned database. Retention bypass
exists only in explicitly scoped test teardown/fixture transactions; production roles cannot
set it. The normal completion gate can generate temporary **test** contexts/bundles; they are
not image builds, promotion evidence or financial invocation allowances.

Eventual application, refund-worker and DB-bootstrap artifacts include changed source/schema,
package metadata and migration inventory. They require separate reviewed build/promotion.
The bootstrap context allowlist and Dockerfile include the new ACL helper as a required
source dependency; no context assembly, image build or publication is implied by this change.
Existing runtime/image/approval identities remain unchanged. No pending intent has been read
from live state, migrated, reset, executed or used as an acceptance fixture.
