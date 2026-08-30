# Refund worker P3E-B2 dormant database-bootstrap runtime v1

## Assurance boundary

```text
GUARANTEES:
- one purpose-specific passwordless bootstrap identity;
- exact instance-conditioned Cloud SQL Client and Instance User grants;
- one canonical PostgreSQL IAM service-account user with cloudsqlsuperuser;
- one digest-bound, check-default, zero-retry, untriggered Cloud Run Job;
- exact-secret metadata/version-add authority without payload-read authority;
- an explicit one-shot application-credential mode while the Job default remains `check`.

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

MACHINE-OWNED RESPONSIBILITIES:
- validate target/source/image/migration/task identities before Proxy spawn;
- use private automatic IAM authentication and an exact Unix socket;
- keep check read-only and require explicit apply or credential-materialization modes;
- enforce the initial `(0,0)` secret-version gate, the exact canary-only `(1,0)` recovery gate,
  at-most-once publication and safe ambiguity stop;
- verify migration prefix and exact postconditions.

HUMAN-OWNED RESPONSIBILITIES:
- authorize each future Job execution;
- adjudicate failed or unknown migration state;
- decide whether a later check may proceed to apply.

SAFE STOP:
- reject malformed input before Proxy spawn;
- stop after Proxy, ledger, Prisma or role-grant failure without retry.

BOUNDED RE-ENTRY:
- a new attended phase begins from the dormant Job and immutable image digest.
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

Cloud SQL Client and Cloud SQL Instance User are predefined project-level roles. Each project IAM
member carries the same condition for only
`projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18` and
`sqladmin.googleapis.com`. No Cloud SQL Admin, service-account key, token-creator, invoker, or
additional deployer binding is admitted. The current deployer is the existing project Owner and
therefore already has effective `iam.serviceAccounts.actAs`; the root does not restate it.

For the credential mode only, the same service account receives
`roles/secretmanager.secretVersionAdder` and `roles/secretmanager.viewer` on each of the two exact
existing database-URL secrets. It receives no Secret Accessor, Version Manager or project-level
Secret Manager role.

## Image and modes

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
BOOTSTRAP_CREDENTIAL_SOURCE: DEFINED_NOT_CLOUD_APPLIED
BOOTSTRAP_CREDENTIAL_IMAGE: DEFINED_NOT_PUBLISHED
BOOTSTRAP_JOB: EXISTING_DORMANT_DEFAULT_CHECK
THIS_PHASE_JOB_EXECUTIONS: 0
SOURCE_VALIDATION_DATABASE_CONNECTIONS: 0
SOURCE_VALIDATION_DATABASE_READS_WRITES: 0/0
APPLICATION_PASSWORDS: 0
SECRET_VERSIONS: 0
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
