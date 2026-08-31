# Refund worker P3E-B2 provider-free preflight runtime authority v1

This current contract admits exactly one bounded non-production runtime release in project
`mira-refund-sandbox-0001`: the provider-free `sandbox-preflight` Cloud Run Job and only the
minimum identity and IAM needed by that Job. The historical R2B1 deny-era contract path and
contract-version identifier remain stable for consumers; its unconditional apply barrier and
eight-resource graph are superseded by this reviewed four-resource release authority.

The machine authority is
`infra/refund-sandbox/p3e-b2/contracts/runtime-authority-v1.json`. The isolated Terraform root is
`infra/refund-sandbox/p3e-b2/runtime`, with state prefix exactly `p3e-b2/runtime`. Source admission
does not itself claim that the image or runtime resources have been published or applied.

## Exact graph and authority

The runtime root owns exactly four Terraform instances:

- `google_service_account.preflight`
- `google_project_iam_member.cloud_sql_client["preflight"]`
- `google_secret_manager_secret_iam_member.preflight_database_access`
- `google_cloud_run_v2_job.preflight`

Their sorted-address SHA-256 is
`2f4d2e2009f6a1e1b4fe0971bb40fcbe7a0a6d34e8a1c1e8994647f78b9e9d2d`.
There is no canary service account, canary IAM binding, or canary Job in this root. No caller
variable, environment key, workspace, command mode, handoff field, or test override can broaden
the four-resource release set.

The exact identity is
`mira-p3e-sbx-preflight@mira-refund-sandbox-0001.iam.gserviceaccount.com`. It receives:

- `roles/cloudsql.client` at project scope with the exact single-instance condition
  `resource.name == 'projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18' && resource.service == 'sqladmin.googleapis.com'`;
- `roles/secretmanager.secretAccessor` on only
  `projects/mira-refund-sandbox-0001/secrets/mira-p3e-sbx-preflight-database-url`.

The release does not grant `roles/cloudsql.instanceUser`, a basic/admin role, a service-account
key, impersonation, an invoker role, or cross-secret access. It creates no secret and no secret
version. The Job may reference only enabled preflight secret version `1`; aliases, `latest`, other
numeric versions, and the canary secret are rejected.

## Job and image boundary

The Job name is `mira-p3e-sbx-refund-preflight`. It runs exactly `sandbox-preflight` with:

- one task, parallelism one, and zero retries;
- Gen2 execution, one CPU, 512 MiB, and a 300-second timeout;
- the exact foundation VPC and subnet by Direct VPC egress;
- `ALL_TRAFFIC` and exactly the `refund-provider-free` network tag;
- `MIRA_REFUND_P3E_PREFLIGHT_MODE`, the exact Cloud SQL connection name, and secret-backed
  `DATABASE_URL` from preflight secret version `1`.

The image input must be the exact logical image `refund-worker` in the exact Artifact Registry
repository, referenced by a full lowercase `@sha256:` digest. The privileged
`refund-db-bootstrap` image, other image paths, tags, local proof digests, and mutable references
are not release authority.

The preflight retains the established private-IP Cloud SQL Auth Proxy and Unix-socket transport.
It performs only read-only database checks, including exact database identity:

```text
current_user = mira_refund_preflight
current_database() = refund_sandbox
```

It also checks PostgreSQL 18, the exact 41/41 migration corpus, and the existing provider-free
preflight assertions. It neither invokes a provider route nor holds a provider credential.

## Preserved boundaries

No scheduler, Eventarc trigger, Workflows resource, Pub/Sub subscription, invoker binding, public
principal, execution override, automatic trigger, or retry is admitted. The canary runtime is not
materialized. Provider credentials, provider targets, financial approvals, Eximbay calls, refunds,
sales, webhook mutation, and application state transitions remain unreachable.

The existing attended database-bootstrap runtime and its live resources are outside this release.
This contract neither retires nor modifies them and performs no bootstrap SQL, migration, grant,
password rotation, or secret payload write.

The historical runtime-image connection contract remains a frozen R2A snapshot, not current
runtime status. The historical deny-era ownership ledger remains frozen and superseded; the
project has no organization and IAM Deny remains inapplicable.

## Canonical source status

```text
RUNTIME_IDENTITY_AUTHORITY: PREFLIGHT_RELEASE_AUTHORIZED_NOT_YET_APPLIED
RUNTIME_SECRET_BINDINGS: PREFLIGHT_RELEASE_AUTHORIZED_NOT_YET_APPLIED
RUNTIME_JOB_DEFINITIONS: PREFLIGHT_RELEASE_AUTHORIZED_NOT_YET_APPLIED
DATABASE_SECRET_VERSION_REFERENCES: PREFLIGHT_VERSION_1_EXACT_INPUT
DB_SECRET_VERSIONS: PREFLIGHT_VERSION_1_ENABLED_CANARY_NOT_CONSUMED
RELEASE_IMAGE_DIGEST: EXACT_REVIEWED_REGISTRY_DIGEST_REQUIRED_NOT_YET_PUBLISHED
RUNTIME_DEPLOYABLE: PENDING_IMAGE_PUBLICATION_AND_APPLY
CANARY_EXECUTABLE: FALSE
PROVIDER_EXECUTION: BLOCKED
SCHEDULED_SANDBOX: BLOCKED
LIVE: UNREACHABLE
IAM_DENY_CURRENT_PROJECT: NOT_APPLICABLE_NO_ORGANIZATION
RUNTIME_APPLY_AUTHORIZED: TRUE_EXACT_PREFLIGHT_RELEASE_ONLY
CLOUD_RUN_API_ACTIVATION: ENABLED
RUNTIME_ROOT_APPLY_POLICY: EXPLICIT_PREFLIGHT_RELEASE_AUTHORIZED
```

The one attended execution authorized by the governing phase remains separate from persistent
invocation authority. After that bounded execution and readback, no canary, provider, bootstrap,
database mutation, or next runtime slice is implied.
