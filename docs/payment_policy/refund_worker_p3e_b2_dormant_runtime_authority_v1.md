# Refund worker P3E-B2-R2B1 dormant runtime authority v1

Status: repository definitions only. No Google Cloud project or resource was inspected, created,
modified, or deleted. No backend was initialized, real plan was run, image was published, secret
payload/version was created, or Job was executed.

The production runtime root is intentionally and unconditionally non-applyable in R2B1. Every
resource declaration carries the same lifecycle precondition backed by a constant local false
authority. There is no variable, environment key, workspace, command mode, handoff field, or
test-only override that can change it:

```text
RUNTIME_ROOT_APPLY_POLICY: UNCONDITIONALLY_BLOCKED_IN_R2B1
RUNTIME_APPLY_AUTHORIZED: FALSE
JOB_EXECUTION_DENY_EFFECTIVE: NOT_CLOUD_PROVEN
```

Syntactically valid operator-attested handoffs remain useful only for inspecting the dormant
definition contract. They are not cloud evidence and cannot admit a plan or apply. Removing the
barrier belongs to a separate independently reviewed package after cloud-authenticated deny
evidence exists.

The machine authority is
`infra/refund-sandbox/p3e-b2/contracts/runtime-authority-v1.json`. The isolated Terraform root is
`infra/refund-sandbox/p3e-b2/runtime`, with future state prefix exactly `p3e-b2/runtime`.

## Ownership and resource graph

R2B1 owns exactly eight Terraform instances:

- `google_service_account.preflight`
- `google_service_account.dormant_canary`
- `google_project_iam_member.cloud_sql_client["preflight"]`
- `google_project_iam_member.cloud_sql_client["dormant_canary"]`
- `google_secret_manager_secret_iam_member.preflight_database_access`
- `google_secret_manager_secret_iam_member.canary_database_access`
- `google_cloud_run_v2_job.preflight`
- `google_cloud_run_v2_job.dormant_canary`

The sorted-address SHA-256 is
`7d1fe521be626a73ecfc31f98f78cb6bc3e358bf82406e894b620a34e34779fa`.
No logging binding is included: the application writes stdout/stderr and does not directly call
the Logging API.

The two identities are distinct user-managed service accounts with deterministic bounded account
IDs. No key, default Compute identity, impersonation, Service Account User, invoker, deployer
selection, public principal, user, group, domain, wildcard, or basic role is defined.

## Cloud SQL and Secret Manager authority

Each identity receives `roles/cloudsql.client` through its own project IAM member. Each binding
has an exact condition:

```text
resource.name == '<exact foundation Cloud SQL instance resource name>'
&& resource.service == 'sqladmin.googleapis.com'
```

This is connection authority for the committed Cloud SQL Auth Proxy private-IP path. It is not SQL
Admin, SQL mutation, SQL-user/password management, IAM database authentication, public-IP
fallback, a credential file, or a service-account key.

Each identity receives `roles/secretmanager.secretAccessor` only on its corresponding exact
database secret. Cross-access and project-level Secret Manager roles are forbidden. R2B1 creates
no secret payload or version. The two Job inputs accept only the matching exact secret resource
and a positive canonical decimal version matching `^[1-9][0-9]{0,18}$`; `latest`, aliases, zero,
signs, padding, fractions, hexadecimal, payloads, DATABASE_URL values, usernames, passwords, and
provider credentials are rejected.

## Immutable image and reviewed handoffs

Both Jobs consume one future image URI of the form:

```text
asia-northeast3-docker.pkg.dev/<project>/<repository>/<image>@sha256:<64 lowercase hex>
```

Tag-only references, `latest`, uppercase or abbreviated hashes, implicit registries, local image
IDs, and the R2A local reproducibility digest are not release authority. The real release digest
remains absent.

The root accepts bounded exact-key operator-attested handoffs for:

- the applied and reviewed foundation manifest;
- the applied and reviewed universal execution deny with exactly
  `run.googleapis.com/jobs.run` and `run.googleapis.com/jobs.runWithOverrides`, no exceptions;
- a separately reviewed immutable release-image digest;
- one exact existing numeric database-secret version for each Job.

These handoffs are repository admission evidence, not trusted cloud evidence. They contain no
private IP, state, secret payload, password, database URL, credential, target, approval, or
execution token. The root uses no remote state or cloud data source.

The historical R1B activation set does not include `run.googleapis.com`. R2B1 does not mutate that
historical subinventory or enable the API elsewhere. Cloud Run API activation and its separately
authorized operator evidence therefore remain deferred:

```text
CLOUD_RUN_API_ACTIVATION: DEFERRED_NOT_VERIFIED
```

## Jobs and private network

The preflight Job runs `sandbox-preflight` and receives exactly
`MIRA_REFUND_P3E_PREFLIGHT_MODE`, `REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME`, and secret-backed
`DATABASE_URL`. It has no provider-contact command or provider credential.

The dormant canary definition runs `worker-once` and receives only the exact instance connection
name and its secret-backed database URL. Current runtime scope is `TOSS_ONLY_EXPLICIT`: the host,
preflight, and supervisor import the Toss credential grammar and the host constructs only Toss
lookup and cancellation ports. R2B1 binds no Toss, EXIMBAY, or other provider credential. A later
provider lane requires its own scoped secret, target, admission, and canary package.

Both Jobs use:

```text
execution environment: SECOND_GENERATION
task count: 1
parallelism: 1
max retries: 0
CPU: 1
memory: 512Mi
task timeout: 300 seconds
Direct VPC egress: PRIVATE_RANGES_ONLY
network/subnetwork: exact foundation handoff
network interface tags: exactly ["refund-provider-free"]
Serverless VPC Access connector: absent
```

That tag is the exact target tag used by both committed foundation egress firewall rules. It puts
each Job Direct VPC interface inside the reviewed allow-private-SQL and deny-other-egress target
set.

The exact timeout is 120 seconds of proxy readiness, the existing 150-second external worker hard
deadline, three seconds of orderly/forced proxy cleanup, and 27 seconds of result serialization
and process margin. It exceeds the enforced 120-second cooperative worker budget without changing
that budget. The proxy remains private-IP-only and the application continues to use its `/cloudsql`
Unix socket.

## Execution deny, lifecycle, cost, and evidence

R2B1 does not modify or except the R1A universal execution deny. It adds no Cloud Run Invoker or
Developer role, scheduler, Workflows, Pub/Sub trigger, public/authenticated invocation, target, or
approval. Repository definitions cannot prove that the deny is effective:

```text
JOB_EXECUTION_DENY_EFFECTIVE: NOT_CLOUD_PROVEN
RUNTIME_APPLY_AUTHORIZED: FALSE
```

Both service accounts use Terraform `prevent_destroy`; both Jobs use provider deletion protection
and Terraform `prevent_destroy`. Replacement or deletion that requires destruction is a distinct
attended break-glass package. Repository definitions have no cloud cost. Future Job execution
would incur compute and memory cost during execution. Direct VPC interfaces may remain allocated
and billable for up to seven minutes after container shutdown under the current platform contract,
but R2B1 executes nothing.

Runtime deployer authority remains deferred. The exact provider method/permission set has not been
independently derived across Job deployment, service-account and IAM mutation, Artifact Registry,
deny separation, and `actAs`; copying the foundation role would be unsafe. No deployer identity,
role, or binding exists. The contract records the required create/get/update operation families for
service accounts, project IAM, secret IAM, Cloud Run v2 Jobs, long-running-operation reads, and
service-account `actAs`, but does not promote those families into a permission set. Exact pinned
provider methods, method-to-permission mapping, IAM mutation scope, pull principal, API activation,
and delete-free replacement behavior remain unresolved.

Still deferred are image publication; database secret payload/version creation; database bootstrap,
migrations, and grants; provider credential secret versions; preflight invocation; future
invocation authority; any deny exception; and monitoring/alert deployment.

## Canonical status

```text
RUNTIME_IDENTITY_AUTHORITY: DEFINED_NOT_PROVISIONED
RUNTIME_SECRET_BINDINGS: DEFINED_NOT_APPLIED
RUNTIME_JOB_DEFINITIONS: DEFINED_DORMANT_NOT_PROVISIONED
DATABASE_SECRET_VERSION_REFERENCES: DEFINED_EXACT_INPUTS_NOT_CREATED
DB_SECRET_VERSIONS: ABSENT_IN_REAL_CLOUD
RELEASE_IMAGE_DIGEST: ABSENT
RUNTIME_DEPLOYABLE: FALSE
CANARY_EXECUTABLE: FALSE
PROVIDER_EXECUTION: BLOCKED
SCHEDULED_SANDBOX: BLOCKED
LIVE: UNREACHABLE
JOB_EXECUTION_DENY_EFFECTIVE: NOT_CLOUD_PROVEN
RUNTIME_APPLY_AUTHORIZED: FALSE
CLOUD_RUN_API_ACTIVATION: DEFERRED_NOT_VERIFIED
RUNTIME_ROOT_APPLY_POLICY: UNCONDITIONALLY_BLOCKED_IN_R2B1
```

## Primary authorities

- [Cloud Run jobs configuration](https://cloud.google.com/run/docs/create-jobs)
- [Cloud Run Direct VPC egress](https://cloud.google.com/run/docs/configuring/vpc-direct-vpc)
- [Cloud Run Secret Manager integration](https://cloud.google.com/run/docs/configuring/jobs/secrets)
- [Cloud SQL IAM Conditions](https://cloud.google.com/sql/docs/postgres/iam-conditions)
- [Secret Manager access control](https://cloud.google.com/secret-manager/docs/access-control)
- [Cloud Run execution overrides](https://cloud.google.com/run/docs/execute/jobs)
