# Refund SANDBOX P3E-B2 authority roots

Status: repository definitions only. No Google Cloud project, bucket, backend, deny policy, role,
resource, or execution authority has been created or inspected.

TB1 adds a read-only trusted-project/bootstrap-readiness evidence definition:

- `contracts/trusted-project-bootstrap-readiness-v1.json` freezes the exact project, billing,
  three-API, freshness, independent-review, and absent-authority contract;
- `trusted-project-bootstrap-readiness/evidence.schema.json` defines the exact evidence shapes;
- `scripts/refund-p3e-b2-bootstrap-readiness.mts` provides a fail-closed parser, restricted
  canonicalizer, digest evaluator, and injected read-only command boundary with no real subprocess
  adapter.

TB1 implementation and tests make no cloud observation. Real evidence must stay outside the
repository, expires for readiness after 900 seconds, and cannot authorize API activation or any
other mutation. A future mutating package must independently re-observe the project, billing, and
API tuple immediately before mutation. Principal SHA-256 values are correlation fingerprints, not
anonymization or identity proof.

```text
TB1_JSON_SCHEMA_ROLE: STRUCTURAL_PREFILTER_ONLY_NOT_READINESS_AUTHORITY
TB1_EVIDENCE_WRITER: DEFERRED
TB1_OUTPUT_PATH_CHECK: ADVISORY_PREFLIGHT_ONLY_NOT_A_WRITE_SAFETY_BOUNDARY
TB1_INJECTED_DEPENDENCY_FAILURES: STATIC_BOUNDED_NO_RAW_CAUSE_PROPAGATION
TB1_CANONICAL_ARRAY_WORK_BOUND: LENGTH_REJECTED_BEFORE_LENGTH_PROPORTIONAL_WORK
```

The command boundary returns only command-specific sanitized records. Raw stdout, stderr, decoded
gcloud objects, billing-account identifiers, and raw principal identifiers are never public
results.

TB2A-R1 adds a separate evidence-v2 attended collector-core definition without changing the v1
contract or v1 schema. The exact six-command order is `EFFECTIVE_CONFIG_GET`, `GCLOUD_VERSION`,
`COLLECTOR_IDENTITY`, `PROJECT_GET`, `BILLING_INFO_GET`, and `BOOTSTRAP_SERVICES_LIST`. The first
three are local receipts; the final three remain the exact remote-source set.

Method A lists the complete enabled-service inventory without a name filter, sort, or result
limit. It parses the official Service Usage shape (`name` contains the service resource and
`parent` contains only the consumer project), ignores structurally valid non-target services, and
maps a missing target to `UNOBSERVABLE`. It never infers `DISABLED` from absence.
Complete all-enabled evidence with an absent reviewer remains
`INDEPENDENT_REVIEW_REQUIRED`; a missing target is `OBSERVATION_INCOMPLETE`.

```text
TB2A_R1_METHOD_A_DISABLED_INFERENCE: FORBIDDEN
TB2A_R1_METHOD_A_MISSING_TARGET_STATE: UNOBSERVABLE
TB2A_R1_BOOTSTRAP_API_ACTIVATION_DISPOSITION_REAL_REACHABILITY:
UNREACHABLE_WITH_METHOD_A
```

The collector permission contract contains only `resourcemanager.projects.get` and
`serviceusage.services.list`, scoped to the exact dedicated project. It excludes
`serviceusage.services.get`, `serviceusage.services.use`, `serviceusage.services.batchGet`,
quota-project overrides, activation, billing mutation, and consumer-policy mutation.

The provider-free subprocess tests spawn only the committed Node fixture through
`process.execPath`. The fixture self-check emits only a bounded result summary. No real gcloud,
Cloud SDK configuration, credential, cloud observation, evidence writer, provider, database, or
mutation is introduced by TB2A-R1.

Injected executor, retry-wait, and canonical-path failures are normalized to finite static results;
their original values, messages, stacks, causes, and objects are never public. Canonical array
length is rejected against remaining node capacity before own-key inspection or any
length-proportional allocation or traversal.

R1A defines three deliberately separate Terraform authority boundaries:

- `state-bootstrap-create` is a one-time local-state root that can create only the shared state
  bucket and its bucket-scoped IAM after separate authorization.
- `state-backend-authority` is the permanent remote-state authority for that same bucket and IAM.
  It uses the shared module and declarative import blocks.
- `authority-guardrails` is a non-executable retirement marker. The former IAM deny root is not
  applicable to the current no-organization project and must not be restored.

R1B adds three deliberately separate executable definition roots:

- `service-activation` owns only the exact eleven APIs required by the installed authorities and the
  provider-free foundation;
- `foundation` owns exactly fifteen long-lived provider-free resources;
- `foundation-deployer-authority` owns one unbound non-executing custom-role definition.

`runtime-deferred` is a non-executable ownership boundary. The old `../p3e-b` monolith is retired,
unapplied, and contains no Terraform. Repository history preserves it; any discovery of undisclosed
real B1 state or resources is a kill condition and must not be imported into the new roots.

R2B1 adds one isolated `runtime` definition root. It owns exactly two user-managed runtime service
accounts, two single-instance-conditioned Cloud SQL Client members, two exact secret-level
database accessors, and two deletion-protected dormant Cloud Run v2 Jobs. The root consumes only
bounded operator-attested handoffs and exact future references; it performs no lookup, creates no
secret version, publishes no image, grants no invocation authority, and cannot prove that the
foundation exists in cloud.

## State bucket contract

Both state roots instantiate `modules/state-bucket`. The module fixes `asia-northeast3`, `STANDARD`
storage, uniform bucket-level access, enforced public-access prevention, object versioning,
`force_destroy = false`, and Terraform `prevent_destroy`. It defines no ACL, website, requester
pays, signed-URL key, deletion lifecycle, bucket retention policy, or output containing a
credential, project number, connection value, target, or approval.

State runners receive only bucket-scoped `roles/storage.objectAdmin`, the object authority required
by the GCS backend. State administrators and explicitly supplied break-glass state administrators
receive only bucket-scoped `roles/storage.admin`. The three principal sets must be pairwise
distinct. No project Storage role, basic role, public member, wildcard, default Compute service
account, key, or inferred break-glass principal is defined.

A future bootstrap operator must already hold external authority including
`storage.buckets.create`, `storage.buckets.get`, `storage.buckets.update`,
`storage.buckets.getIamPolicy`, and `storage.buckets.setIamPolicy` in the dedicated project. This
package grants none of those project permissions and creates no operator binding.

Google provider 7.40.0 exposes a bucket soft-delete setting and records that omission allows the
service default, but R1A has no provider-free proof that enabling retention preserves normal GCS
backend lock-object deletion, bounded cost, and recovery behavior. The shared module therefore sets
the soft-delete retention duration explicitly to zero; future enablement is an operator decision
requiring new proof. Object versioning is the sole R1A recovery authority. Automatic
current/noncurrent object deletion and bucket retention are forbidden.

## One-way creation and adoption

`state-bootstrap-create` has an explicit empty local backend, no remote backend, and reports
`ONE_TIME_LOCAL_BOOTSTRAP_ONLY`. It must never be rerun after handoff. No script applies it or
performs a state operation.

The future handoff is frozen in this order:

1. Review the local creation plan.
2. Separately authorize and create the bucket.
3. Verify bucket security and recovery settings.
4. Initialize the authority root against the new backend.
5. Adopt/import the existing bucket and bucket IAM into remote authority state.
6. Prove exact configuration and backend state locking.
7. Remove the bucket resources from local bootstrap state without destroying them.
8. Verify the local root owns zero resources.
9. Archive and then securely retire local state under two-person evidence.
10. Prohibit every future execution of the local creation root.

None of these steps is executed by R1A. Handoff must not use ordinary repeated `-target`, package
scripts, automatic local-state deletion, or permanent double ownership. State removal/import and
backend migration remain attended operator actions under separate authorization.

## Backend authority boundaries

Future backend configuration must provide the bucket and exactly one of these prefixes outside the
repository:

| Authority | Exact prefix |
|---|---|
| State backend authority | `p3e-b2/state-backend-authority` |
| Retired IAM deny state; never reuse | `p3e-b2/authority-guardrails` |
| Service activation | `p3e-b2/service-activation` |
| Foundation resources | `p3e-b2/foundation` |
| Foundation deployer role definition | `p3e-b2/foundation-deployer-authority` |
| Runtime definitions | `p3e-b2/runtime` |
| Database bootstrap | `p3e-b2/database-bootstrap` |
| Preflight invocation | `p3e-b2/preflight-invocation` |

Each authority owns one prefix. Workspaces must not multiplex environments, unrelated authorities
must not share a state file, and no root may use `terraform_remote_state`. Future root handoff must
use reviewed nonsecret manifests containing only identifiers such as approved project ID, region,
resource names, immutable image digest, or numeric resource generation. Passwords, connection URLs,
secret payloads, credentials, targets, and approvals are forbidden in outputs.

## Retired execution deny authority

The current dedicated project is not attached to an organization. Organization-level IAM Deny
creation is therefore unavailable and is not required by the accepted trusted-operator model. The
former executable Terraform root has been removed. Its state prefix
`p3e-b2/authority-guardrails` must never be reused.

The failed plan SHA-256
`d26b446e26b41c1b88f52e530dadc2ef4ec82420b7acce87faf5e8ddd995e86b` must never be retried. The
malformed unencoded parent is historical evidence and was not “fixed” into another unusable
current-project architecture.

A project Owner or explicitly authorized human is trusted. Such an Owner can technically invoke a
future Job; malicious-Owner resistance is outside the required assurance boundary. Current safety
requires no automatic trigger, zero retries, no provider credential or target, and no provider
contact.

## R1B foundation authority

The service-activation root owns only `google_project_service` resources and cannot create a
project, billing link, IAM binding, or infrastructure. The foundation consumes a reviewed bounded
operator-attested handoff rather than remote state or the raw activation output. Its output is
another bounded nonsecret handoff manifest. Neither manifest proves cloud state.

An attended external actor must pre-enable and review exactly
`cloudresourcemanager.googleapis.com`, `serviceusage.googleapis.com`, and
`storage.googleapis.com` before the R1A state-bucket bootstrap and R1B activation root can operate.
Their sorted hash is
`2b5b1961dd67cc23e748d7b6a80df83aac85e475b74403469ac99ef3ac3f0bc7`.
This package creates no bootstrap identity, role, binding, script, credential, or automatic
command and makes no claim that those APIs were inspected or enabled.

The activation root then tracks the exact eleven-service set
(`artifactregistry`, `cloudresourcemanager`, `compute`, `dns`, `iam`, `run`, `secretmanager`,
`servicenetworking`, `serviceusage`, `sqladmin`, and `storage`) with hash
`a26c970477ca78a45b2561e21faf743ee8ad6d49e3ca400618dba9881b4a72f4`.
`run.googleapis.com` is defined as managed by this source authority but is not claimed cloud-applied
until a later reviewed apply and readback succeeds.
Pinned-provider adoption of an already enabled service is idempotent and needs no import solely
for prior enablement. Both deletion flags remain false, routine `-target` is forbidden, and
incompatible provider behavior is a kill condition. The other eight services are not bootstrap
prerequisites, without assuming they are disabled.

Its authority contract is pinned to `hashicorp/google` 7.40.0 and
`google_project_service`. The exact methods are
`cloudresourcemanager.projects.get`, `serviceusage.operations.get`,
`serviceusage.services.batchEnable`, `serviceusage.services.enable`, and
`serviceusage.services.list`; their canonical hash is
`ddc12bb0dae1cdbe0e9b7a8cd5838cc6cb8759b9323fb32171ad239963050120`.
The corresponding exact permissions are `resourcemanager.projects.get`,
`servicemanagement.services.bind`, `serviceusage.operations.get`,
`serviceusage.services.enable`, and `serviceusage.services.list`; their hash is
`3371ab566521c0c48800e932b2d11ab09382e9e249f061b395c5a45576fff7ef`.

Complete permission-set disjointness is intentionally rejected. The foundation deployer and future
activation operator share only read-only `resourcemanager.projects.get` (hash
`066987a0d6fc58a75ade7e31b099ea0c31bc101a829e7dc094c135b052587a61`).
The activation-exclusive permissions are `servicemanagement.services.bind`,
`serviceusage.operations.get`, `serviceusage.services.enable`, and
`serviceusage.services.list` (hash
`c9ca2657b673902e5f80ff6e8d2a091c5e9984f441d9176f17c0bc8e0358ce19`).
The foundation role contains none of those four and cannot complete the provider create/read/wait
lifecycle.

Project read is scoped to the exact dedicated project; list to that project's Service Usage
collection; enable to the project; bind to each admitted target public service; and operation get
to the returned Service Usage operation. `user_project_override` is false, billing/quota project
overrides are absent, and `serviceusage.services.use` remains excluded. Services get/disable,
operations list/cancel/delete, quota and consumer-policy mutation, project IAM, hierarchical
activation, service configuration mutation, and API-key operations are excluded. Changing the
provider, resource, activation tool, deletion behavior, or override configuration invalidates the
contract.

The earlier four-permission candidate was rejected because provider 7.40.0 actually validates the
project, reads with `services.list`, admits singleton and batch enable, and polls the operation.
Official/provider sources and retrieval date 2026-07-23 are frozen in the machine contract. No
project or service was inspected; no API was enabled. No activation identity, role, or binding
exists.

The deployer role is derived from the reviewed resource ledger and is intentionally create/read/
update-only. It excludes delete, Job execution, API activation, project IAM, deny mutation, secret
payload/version, SQL user, key, billing, and impersonation permissions. The authority root creates
no identity or binding. Replacement requiring deletion is a separate future break-glass operation.
The exact 60-permission role hash is
`7460121269bcfd3a129ae36c9b24c0e49d17ae67b70624d288cf5796ba3ce8b7`.
Its foundation-only `compute.networks.updatePolicy` permission is justified only by both firewall
allow resources, the deny firewall, and the subnetwork in the fifteen-address ledger; it is not
IAM policy authority. The ten Cloud DNS permissions are restricted to create/read/update of the
private zone and its exact record sets; zone and record deletion remain excluded.

## R2A image boundary

P3E-B2-R2A adds only the provider-free image definition and private Cloud SQL proxy/socket
contract in `contracts/runtime-image-connection-v1.json`. It publishes no image and creates no
runtime resource. The R1A and R1B inventories remain historical exact subinventories; the
complete package inventory is intentionally superseded by the separate exact R2A inventory.

After a future successful activation apply, the raw output remains
`operator_review_status = REVIEW_REQUIRED` and
`evidence_type = TERRAFORM_APPLY_OUTPUT_NOT_CLOUD_AUTHENTICATED`. Foundation accepts only an exact
handoff with `activation_apply_status = APPLIED`,
`operator_review_status = OPERATOR_REVIEWED`, and
`evidence_type = OPERATOR_ATTESTED_NOT_CLOUD_AUTHENTICATED`, plus the exact project, API sets,
hashes, provider, resource, and state prefix. An operator must review the state/output and
effective inventory; no script promotes it. A malicious operator can fabricate the attestation,
so effective IAM and API state remain later gates and this is not P3E-C evidence.

No Terraform command in R1A or R1B is cloud authorization. Credential-free validation is limited to
formatting, backend-disabled initialization, validation, and provider-mocked tests using Google
provider 7.40.0.

## R2B1 dormant runtime boundary

`runtime` uses the future state prefix `p3e-b2/runtime` and a partial GCS backend. Its exact
eight-address graph and sorted digest are frozen in
`contracts/runtime-authority-v1.json`. Both Jobs use the same exact future repository-qualified
`@sha256:` image input, but the real release digest remains absent. Each Job reads only its own
future exact numeric database-secret version and its own secret-level
`roles/secretmanager.secretAccessor` binding. R2B1 creates neither a payload nor a version.

Every production resource declaration has an unconditional lifecycle precondition backed by a
constant false local. No caller input, handoff, environment, workspace, command mode, or test
override can admit plan/apply. This constant-false release gate is independent of IAM Deny.

Cloud SQL proxy connection authority is `roles/cloudsql.client` for each dedicated runtime
identity, with an IAM condition for the exact admitted instance resource and SQL Admin API
service. The application does not call the Logging API, so no logging role is retained.

The preflight Job runs only `sandbox-preflight`. The dormant canary definition runs
`worker-once`, but has no provider credential, target, approval, invoker, scheduler, or automatic
trigger. Both definitions use Gen2 Direct VPC egress, the exact foundation network and subnet,
`ALL_TRAFFIC`, one task, parallelism one, zero retries, one CPU, 512 MiB, and 300 seconds.
Each interface has exactly the committed foundation firewall target tag
`refund-provider-free`; there is no additional tag or connector. The foundation admits proxy
TCP 3307 only to PSA and Google API HTTPS only to `199.36.153.4/30`, resolves `googleapis.com`
through a VPC-private restricted zone, and denies all other IPv4 egress.
The timeout is 120 seconds of proxy readiness plus the existing 150-second external worker
deadline, three seconds of proxy shutdown, and 27 seconds of result/process margin.

```text
RUNTIME_IDENTITY_AUTHORITY: DEFINED_NOT_PROVISIONED
RUNTIME_SECRET_BINDINGS: DEFINED_NOT_APPLIED
RUNTIME_JOB_DEFINITIONS: DEFINED_DORMANT_NOT_PROVISIONED
DATABASE_SECRET_VERSION_REFERENCES: DEFINED_EXACT_INPUTS_NOT_CREATED
RELEASE_IMAGE_DIGEST: ABSENT
RUNTIME_DEPLOYABLE: FALSE
CANARY_EXECUTABLE: FALSE
PROVIDER_EXECUTION: BLOCKED
SCHEDULED_SANDBOX: BLOCKED
LIVE: UNREACHABLE
IAM_DENY_CURRENT_PROJECT: NOT_APPLICABLE_NO_ORGANIZATION
RUNTIME_APPLY_AUTHORIZED: FALSE
RUNTIME_ROOT_APPLY_POLICY: UNCONDITIONALLY_BLOCKED_IN_R2B1
```

Runtime deployer authority remains deferred because the exact create/read/update provider method
and permission set has not been independently derived across Cloud Run Job, service-account,
project IAM, secret IAM, and Artifact Registry. R2B1 defines no
deployer identity, custom role, or binding.

Exact status:

```text
P3E_B1_MONOLITH: RETIRED_UNAPPLIED
STATE_BACKEND_AUTHORITY: DEFINED_NOT_PROVISIONED
IAM_DENY_CURRENT_PROJECT: NOT_APPLICABLE_NO_ORGANIZATION
SERVICE_ACTIVATION_AUTHORITY: DEFINED_NOT_PROVISIONED
SERVICE_ACTIVATION_BOOTSTRAP_PREREQUISITES: EXTERNAL_PRE_ENABLED_AND_REVIEWED_REQUIRED
SERVICE_ACTIVATION_BOOTSTRAP_API_SET: DEFINED_NOT_VERIFIED
SERVICE_ACTIVATION_ROOT: NOT_INITIALIZABLE_UNTIL_BOOTSTRAP_PREREQUISITES
SERVICE_ACTIVATION_HANDOFF: OPERATOR_ATTESTED_APPLIED_AND_REVIEWED_REQUIRED
SERVICE_ACTIVATION_OPERATOR: EXTERNAL_SEPARATE
SERVICE_ACTIVATION_PROVIDER: HASHICORP_GOOGLE_7_40_0
SERVICE_ACTIVATION_RESOURCE: GOOGLE_PROJECT_SERVICE
SERVICE_ACTIVATION_OPERATOR_PERMISSION_CONTRACT: DEFINED_NOT_GRANTED
SERVICE_ACTIVATION_OPERATOR_METHOD_CONTRACT: DEFINED
SERVICE_ACTIVATION_SHARED_READ_PERMISSION: RESOURCEMANAGER_PROJECTS_GET
SERVICE_ACTIVATION_EXCLUSIVE_PERMISSIONS: DEFINED_NOT_GRANTED
SERVICE_ACTIVATION_OPERATOR_IDENTITY: NOT_SELECTED
SERVICE_ACTIVATION_OPERATOR_ROLE: NOT_DEFINED
SERVICE_ACTIVATION_OPERATOR_BINDING: ABSENT
SERVICE_ACTIVATION_USER_PROJECT_OVERRIDE: DISABLED
FOUNDATION_ROOT: DEFINED_NOT_PROVISIONED
FOUNDATION_ACTIVATION_GATE: ENFORCED
FOUNDATION_CLOUD_AUTHENTICATION: NOT_PERFORMED
FOUNDATION_DEPLOYER_ROLE: DEFINED_NOT_CREATED
FOUNDATION_DEPLOYER_BINDING: ABSENT
RUNTIME_IDENTITY_AUTHORITY: DEFERRED
RUNTIME_JOB_DEFINITIONS: DEFERRED
P3E_B2_FOUNDATION: NOT_PROVISIONED
P3E_B2_RUNTIME: NOT_DEPLOYABLE
PROVIDER_EXECUTION: BLOCKED
SCHEDULED_SANDBOX: BLOCKED
LIVE: UNREACHABLE
```
