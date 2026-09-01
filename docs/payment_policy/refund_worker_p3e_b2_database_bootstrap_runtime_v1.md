# Refund worker P3E-B2 dormant database-bootstrap runtime v1

## Assurance boundary

```text
GUARANTEES:
- one retained purpose-specific passwordless bootstrap identity with no standing GCP login grant;
- one canonical PostgreSQL IAM service-account user retaining cloudsqlsuperuser;
- one digest-bound, check-default, zero-retry, untriggered Cloud Run Job;
- no standing credential-secret Viewer, payload-read or Version Adder authority;
- exact temporary Cloud SQL IAM re-entry only through a separately authorized execution phase.

NON-GOALS:
- application runtime deployment;
- automatic migration or grant execution;
- application runtime activation or generic/automatic credential rotation and recovery;
- payment-provider contact.

THREAT BOUNDARY:
- the trusted project Owner retains technical manual Job invocation capability;
- this design does not resist a malicious project Owner.

TRUSTED ASSUMPTIONS:
- the exact applied 15-resource foundation remains authoritative;
- run.googleapis.com and cloudsql.iam_authentication remain enabled;
- the existing private VPC/DNS/firewall path remains unchanged.

RESIDUAL RISKS:
- the first later attended check can reveal database ledger drift;
- a failed Prisma migration requires human adjudication and is never blindly retried.
- the retained Job image still contains explicit mutating modes, but its service account cannot
  reach Cloud SQL or credential-secret metadata without separately restored IAM authority.

MACHINE-OWNED RESPONSIBILITIES:
- validate target/source/image/migration/task identities before Proxy spawn;
- use private automatic IAM authentication and an exact Unix socket;
- keep check read-only and require explicit apply, grant-only, or credential-materialization modes;
- enforce the initial `(0,0)` secret-version gate, the exact canary-only `(1,0)` recovery gate,
  at-most-once publication and safe ambiguity stop;
- verify migration prefix and exact postconditions.

HUMAN-OWNED RESPONSIBILITIES:
- separately authorize the default-false Terraform input and temporarily restore the exact
  conditioned Cloud SQL Client and Instance User grants for a future execution window;
- authorize each future Job execution;
- adjudicate failed or unknown migration state;
- decide whether a later check may proceed to apply;
- retire the two temporary Cloud SQL IAM grants after the attended execution window.

SAFE STOP:
- reject malformed input before Proxy spawn;
- stop after Proxy, ledger, Prisma or role-grant failure without retry.

BOUNDED RE-ENTRY:
- a new attended phase first enables the one default-false temporary IAM input, then uses the
  dormant Job and immutable image digest, and retires those two grants again.
```

## Installed source owners

- Terraform root: `infra/refund-sandbox/p3e-b2/database-bootstrap`.
- Backend prefix: `p3e-b2/database-bootstrap` in the existing refund state bucket.
- Machine contract: `infra/refund-sandbox/p3e-b2/contracts/database-bootstrap-runtime-v1.json`.
- Image: `containers/refund-db-bootstrap`.
- Deterministic context/build owners: `scripts/build-refund-db-bootstrap-context.mts` and
  `scripts/build-refund-db-bootstrap-image.mts`.
- Existing database grant owner reused unchanged:
  `scripts/eximbay-p3e-database-bootstrap.ts`.

## Identity and IAM

The GCP service account is
`mira-p3e-sbx-db-bootstrap@mira-refund-sandbox-0001.iam.gserviceaccount.com`.
PostgreSQL uses the canonical suffix-trimmed IAM database username
`mira-p3e-sbx-db-bootstrap@mira-refund-sandbox-0001.iam` and no password. Google provider 7.40.0
creates it as `CLOUD_IAM_SERVICE_ACCOUNT` with `database_roles = ["cloudsqlsuperuser"]`.

The desired root defaults to no Cloud SQL Client or Cloud SQL Instance User member. Its single
boolean `temporary_cloud_sql_access_authorized` input defaults false; only an explicit true value
materializes both predefined roles with the exact instance condition for
`projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18` and
`sqladmin.googleapis.com`. False returns to the exact three-resource retired graph. No Cloud SQL Admin,
service-account key, token-creator, invoker, or additional deployer binding is admitted. The
current deployer is the existing project Owner and the root does not restate that authority.

The desired root also has no `roles/secretmanager.secretVersionAdder` or
`roles/secretmanager.viewer` member for the bootstrap service account on either application
database-URL secret. Existing secret containers and version 1 on each secret are outside this
retirement mutation and remain unchanged. No replacement Secret Accessor, Version Manager or
project-level Secret Manager role is admitted.

## Image and modes

The retained Job is source-bound to the current published mode-capable image
`asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:42d84d38a0edd5bf4b0e5931521a250add24e17e72446e15799babaf8b35a0d2`,
config digest `sha256:9b3482a74b764b5ea0e56c23c53457a448091d9163466967831daf6334b52c8a`,
from source commit `81e785448f834f4176cd5153eb3cbdf6d79d936c`. The prior verifier-defective
digest `sha256:89bae2d93d3fc2594dff9eeddee25577223fd91524c1b0beed43ab84584fc2c3`
from source `d908d71b5de5dc4223db77268719ed9e97277253` is superseded historical evidence
only. The earlier historical predecessor is
`sha256:cc1d0e7e82cb8674b0b5da47e04a3a7b72b41aa9035ad4144e15747bcaa5f086`
from source `4a6f2967be6de4526fa7b47d414d1cbaec600783`; that identity is provenance only and
is no longer selectable as the current Job image. Terraform owns one exact bounded
`bootstrap_mode` selector whose default is `check`. Its allowlist is synchronized with the
current image's closed 14-mode entrypoint allowlist, while image identity remains independent of
mode. The Cloud Run Job's sole argument derives directly from that selector. Cloud Run execution
overrides are not the control surface, and Terraform mode selection does not authorize or execute
the Job.

The build context is a normalized temporary allowlist, never the repository root. It contains a
minimal pinned npm dependency set, Prisma configuration/schema, all 41 exact migrations, the
existing hashed SQL role/grant inputs and runner, the bootstrap entrypoint, `pg`, and Cloud SQL
Auth Proxy 2.22.0. It excludes application refund-worker bundles, Toss/provider SDKs and every
credential.

The Docker default and Terraform Job argument are `check`. Credential commands are the initial
`materialize-application-credentials` mode and the exact partial-state
`recover-canary-application-credential` mode; an absent or unknown direct process mode fails with
code 64. Exact Cloud Run one-task/index/attempt identity, source commit, image
digest, target, canonical IAM username and migration count/hash are required before the Proxy can
start. The Proxy vector includes `--private-ip`, `--auto-iam-authn`, and
`--unix-socket=/cloudsql`.

The additional `apply-canary-role-grants` mode is grant-only and migration-free. It requires the
exact 41/41 repository ledger before mutation, executes only the frozen Eximbay canary grant
artifact, reuses the exhaustive privilege verifier, and commits only when that postcondition
passes. It does not run Prisma, mutate schema or business rows, access Secret Manager, or enter
provider code. Every execution and temporary IAM re-entry remains separately human-authorized.

The same published image also admits the exact attended
`apply-contacted-reconciliation-role-grants` delta and
`restore-canary-refund-role-grants` canonical restore modes. The former applies only the frozen
CONTACTED reconciliation privilege artifact; the latter revokes temporary authority and
reconstructs the reviewed historical plus canary grant sources. Neither mode is a generic SQL or
command surface, and both retain the exact ledger and exhaustive privilege postconditions. Mode
selection remains independent from the separate default-false temporary Cloud SQL IAM gate.

Future `check` connects only after separate human authorization and reads the migration ledger. It
accepts an empty schema or an exact completed prefix with matching checksums, no unknown entry, no
unfinished migration and no rollback. Future explicit `apply` rechecks that state, runs exactly
`prisma migrate deploy`, requires all 41 migrations, then invokes the unchanged hashed role/grant
runner and accepts success only after its effective-privilege postcondition.

The separately authorized credential mode requires both exact secrets to have zero versions before
password generation. It commits both client-generated SCRAM verifiers in one transaction, verifies
one password login per application role through the same Proxy without automatic IAM database
authentication, then adds preflight version 1 followed by canary version 1. It never reads a secret
payload and never retries an ambiguous version-add operation.

The canary recovery mode accepts only preflight version 1 enabled with acknowledged client checksum
and canary with zero versions. It never reads or changes preflight credential material. It verifies
the exact ledger and both roles' privilege state, generates and commits only a replacement canary
SCRAM verifier, verifies one canary password login, and attempts canary version 1 publication once.
SecretVersion names are parsed as exact path components and accept only project ID
`mira-refund-sandbox-0001` or project number `925882331349`.

## Current source status

```text
BOOTSTRAP_AUTHORITY_SOURCE: RETIREMENT_TARGET_DEFINED
BOOTSTRAP_GRAPH: THREE_RETAINED_RESOURCES
BOOTSTRAP_GCP_SQL_LOGIN_GRANTS: ZERO_BY_DEFAULT_EXACT_TWO_WHEN_SEPARATELY_AUTHORIZED
BOOTSTRAP_CREDENTIAL_SECRET_IAM_GRANTS: ZERO_DESIRED
BOOTSTRAP_SQL_IAM_DB_IDENTITY: RETAINED
CLOUDSQLSUPERUSER_MEMBERSHIP: RETAINED
BOOTSTRAP_JOB: RETAINED_DORMANT_DEFAULT_CHECK
BOOTSTRAP_IMAGE: CURRENT_MODE_INDEPENDENT_89BAE2D_EXACT_DIGEST_BOUND
PREDECESSOR_BOOTSTRAP_IMAGE: HISTORICAL_CC1D0E7_PROVENANCE_ONLY
CONTACTED_RECONCILIATION_GRANT_MODE: AVAILABLE_SEPARATELY_AUTHORIZED
CANONICAL_REFUND_GRANT_RESTORE_MODE: AVAILABLE_SEPARATELY_AUTHORIZED
BOOTSTRAP_SERVICE_ACCOUNT: RETAINED_DORMANT
APPLICATION_SECRET_VERSIONS: EXISTING_1_1_UNCHANGED
FUTURE_EXECUTION_REENTRY: SEPARATELY_AUTHORIZED_DEFAULT_FALSE_INPUT_TRUE_REQUIRED
THIS_PHASE_JOB_EXECUTIONS: 0
SOURCE_VALIDATION_DATABASE_CONNECTIONS: 0
SOURCE_VALIDATION_DATABASE_READS_WRITES: 0/0
APPLICATION_PASSWORDS: EXISTING_UNCHANGED
SECRET_VERSION_MUTATIONS: 0
THIS_PHASE_PROVIDER_CONTACTS: 0
```

Cloud publication/materialization status is never inferred from this document; it requires the
attended control-plane and Terraform state readback of the authorized phase.

## Primary authority

- [Cloud SQL PostgreSQL IAM logins](https://docs.cloud.google.com/sql/docs/postgres/iam-logins)
- [Manage PostgreSQL IAM database users](https://docs.cloud.google.com/sql/docs/postgres/add-manage-iam-users)
- [Cloud SQL IAM Conditions](https://docs.cloud.google.com/sql/docs/postgres/iam-conditions)
- [Google provider 7.40.0 `google_sql_user`](https://raw.githubusercontent.com/hashicorp/terraform-provider-google/v7.40.0/website/docs/r/sql_user.html.markdown)
- [Create Cloud Run Jobs](https://cloud.google.com/run/docs/create-jobs)
