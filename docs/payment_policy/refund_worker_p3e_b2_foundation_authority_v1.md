# Refund worker P3E-B2-R1B foundation authority v1

P3E-B2-R1B is repository preparation only. It retires the definitions-only, unapplied P3E-B1
monolith and divides its ownership into service activation, provider-free foundation, one unbound
custom-role definition, and a non-executable runtime-deferred boundary. It creates no cloud fact,
authority, identity, binding, credential, backend, image, database role, secret version, Job,
target, or approval.

## B1 retirement and ownership

The committed B1 root had no known state and was never authorized for apply. It is retained in
repository history and replaced in the working tree by a retirement README and the exact
`legacy-resource-map-v1.json`. Discovery of any undisclosed B1 state or cloud resource is a kill
condition: the R1B roots must not import, adopt, or take over that unknown resource.

The old resource ownership is exact:

| Old address | R1B owner | Disposition |
|---|---|---|
| `google_project_service.required` | service activation | corrected to the exact non-runtime API set |
| `google_artifact_registry_repository.refund_images` | foundation | preserved |
| `google_cloud_run_v2_job.preflight` | runtime deferred | intentionally deferred |
| `google_cloud_run_v2_job.canary` | runtime deferred | intentionally deferred |
| `google_sql_database_instance.refund` | foundation | cost/deletion inputs corrected |
| `google_sql_database.refund` | foundation | preserved |
| `google_service_account.preflight` | runtime deferred | intentionally deferred |
| `google_service_account.canary` | runtime deferred | intentionally deferred |
| `google_project_iam_member.runtime` | runtime deferred | intentionally deferred |
| `google_compute_network.refund` | foundation | preserved |
| `google_compute_subnetwork.refund` | foundation | preserved |
| `google_compute_global_address.private_service_access` | foundation | preserved |
| `google_service_networking_connection.private_service_access` | foundation | deletion semantics corrected |
| `google_compute_firewall.allow_private_sql` | foundation | preserved |
| `google_compute_firewall.deny_other_egress` | foundation | preserved |
| `google_secret_manager_secret.preflight_database_url` | foundation | preserved without a version |
| `google_secret_manager_secret.canary_database_url` | foundation | preserved without a version |
| `google_secret_manager_secret_iam_member.preflight_database_access` | runtime deferred | intentionally deferred |
| `google_secret_manager_secret_iam_member.canary_database_access` | runtime deferred | intentionally deferred |

`database_roles.sql` is moved byte-identically to the later database-bootstrap boundary.
Observability definitions are deferred rather than retained as executable Terraform.

## Service activation

`service-activation` owns only `google_project_service.required` for these exact sorted APIs:

- `artifactregistry.googleapis.com`
- `cloudresourcemanager.googleapis.com`
- `compute.googleapis.com`
- `iam.googleapis.com`
- `secretmanager.googleapis.com`
- `servicenetworking.googleapis.com`
- `serviceusage.googleapis.com`
- `sqladmin.googleapis.com`
- `storage.googleapis.com`

The API-set SHA-256 is
`61c64454752499de36658856988c5f93f402e35cc003ff2ceb59c56e45b923d3`.
Runtime-only Logging, Monitoring, and Cloud Run APIs are deferred. Every service uses
`disable_on_destroy = false` and `disable_dependent_services = false`. The root creates no project,
billing link, service identity, IAM, foundation, or runtime resource.

Before the R1A state-bucket bootstrap or this activation root can operate in an otherwise empty
project, an attended external bootstrap actor must pre-enable and review exactly
`cloudresourcemanager.googleapis.com`, `serviceusage.googleapis.com`, and
`storage.googleapis.com`. The sorted bootstrap set hash is
`2b5b1961dd67cc23e748d7b6a80df83aac85e475b74403469ac99ef3ac3f0bc7`.
Storage is required by the R1A bucket and later GCS backend, Service Usage must be available before
it enables the remaining services, and the pinned provider validates the project through Cloud
Resource Manager reads. R1B defines no bootstrap identity, role, binding, script, project,
credential, or automatic command and makes no claim that a service is enabled or inspected.

After that attended prerequisite, the pinned `google_project_service` family tracks all nine
services. Adoption of an already enabled service is idempotent under the pinned provider contract
and requires no import solely because the service is enabled. Discovery of incompatible provider
behavior is a kill condition, and routine `-target` is forbidden. The other six services are not
bootstrap prerequisites, without assuming that they are currently disabled.

The earlier four-permission candidate was rejected because it described generic singleton
enablement rather than the pinned provider's actual resource lifecycle. HashiCorp Google provider
7.40.0 validates the project, reads enabled state through `services.list`, may select either
singleton `services.enable` or `services.batchEnable`, and polls the returned Service Usage
operation. This contract is specific to `hashicorp/google` 7.40.0 and
`google_project_service`; changing the provider, resource, activation tool, deletion behavior,
user-project override, quota project, or billing-project behavior invalidates it and requires
re-derivation.

The exact sorted admitted methods and canonical SHA-256 are:

```text
cloudresourcemanager.projects.get
serviceusage.operations.get
serviceusage.services.batchEnable
serviceusage.services.enable
serviceusage.services.list

ddc12bb0dae1cdbe0e9b7a8cd5838cc6cb8759b9323fb32171ad239963050120
```

The exact sorted future activation-operator permissions and canonical SHA-256 are:

```text
resourcemanager.projects.get
servicemanagement.services.bind
serviceusage.operations.get
serviceusage.services.enable
serviceusage.services.list

3371ab566521c0c48800e932b2d11ab09382e9e249f061b395c5a45576fff7ef
```

Set hashes use SHA-256 over UTF-8 sorted values joined by LF with no trailing LF. Authority
separation is capability-based, not complete permission-set disjointness. The exact shared
read-only dependency with the preserved foundation deployer is
`resourcemanager.projects.get`, with hash
`066987a0d6fc58a75ade7e31b099ea0c31bc101a829e7dc094c135b052587a61`.
It permits reading the exact project and is not API-activation authority.

The exact activation-exclusive set, relative to the foundation deployer, is:

```text
servicemanagement.services.bind
serviceusage.operations.get
serviceusage.services.enable
serviceusage.services.list

c9ca2657b673902e5f80ff6e8d2a091c5e9984f441d9176f17c0bc8e0358ce19
```

The foundation deployer contains none of those four permissions, so it cannot enumerate enabled
services, enable a singleton or batch, bind the project to a target service, or poll activation
operations. The full activation/foundation intersection is exactly the shared project read.

Permission scope is exact:

| Permission | Required resource authority |
|---|---|
| `resourcemanager.projects.get` | exact dedicated consumer project; shared read |
| `serviceusage.services.list` | exact dedicated consumer project's Service Usage collection |
| `serviceusage.services.enable` | exact dedicated consumer project |
| `servicemanagement.services.bind` | every admitted target public service |
| `serviceusage.operations.get` | returned Service Usage long-running operation |

The provider explicitly has `user_project_override = false`; no billing-project or quota-project
override exists. `serviceusage.services.use` is excluded. Introducing any such override invalidates
the contract.

Excluded methods are `serviceusage.services.get`, `serviceusage.services.batchGet`,
`serviceusage.services.disable`, `serviceusage.operations.list`,
`serviceusage.operations.cancel`, and `serviceusage.operations.delete`. Excluded permissions
include `serviceusage.services.get`, `serviceusage.services.disable`,
`serviceusage.services.use`, `resourcemanager.projects.list`, and
`resourcemanager.projects.setIamPolicy`; every `serviceusage.quotas.*`,
`serviceusage.consumerpolicy.*`, and `serviceusage.mcppolicy.*` permission is also excluded.
Quota, consumer-policy, hierarchical activation, project-IAM, service-configuration, and API-key
mutation are outside this contract. No broad predefined activation role is substituted.

Source evidence was retrieved on 2026-07-23 from the provider 7.40.0
`resource_google_project_service.go`, `serviceusage_batching.go`,
`resource_google_project.go`, and `service_usage_operation.go` implementations; Google Service
Usage `services.list`, `services.enable`, `services.batchEnable`, `operations.get`, and Access
control with IAM documentation; and Cloud Resource Manager `projects.get`. Exact URLs are frozen
in `foundation-authority-v1.json`.

The future activation actor is external and separate. R1B grants none of its exclusive authority
and defines no operator identity, role, or binding. The same provider-specific method and
permission contract applies where the attended bootstrap actor establishes the prerequisites:

```text
SERVICE_ACTIVATION_BOOTSTRAP_PREREQUISITES: EXTERNAL_PRE_ENABLED_AND_REVIEWED_REQUIRED
SERVICE_ACTIVATION_BOOTSTRAP_API_SET: DEFINED_NOT_VERIFIED
SERVICE_ACTIVATION_ROOT: NOT_INITIALIZABLE_UNTIL_BOOTSTRAP_PREREQUISITES
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
```

Repository definitions do not prove project existence, permission grantability, service
accessibility, operation-resource access, propagation, or effective IAM. No project, API, service,
or operation was inspected, and no API was enabled.

## Foundation graph

The foundation root owns exactly eleven addresses:

- `google_artifact_registry_repository.refund_images`
- `google_compute_firewall.allow_private_sql`
- `google_compute_firewall.deny_other_egress`
- `google_compute_global_address.private_service_access`
- `google_compute_network.refund`
- `google_compute_subnetwork.refund`
- `google_secret_manager_secret.canary_database_url`
- `google_secret_manager_secret.preflight_database_url`
- `google_service_networking_connection.private_service_access`
- `google_sql_database.refund`
- `google_sql_database_instance.refund`

The exact sorted graph SHA-256 is
`f15f2716c0524ccd5ca3b86757076b433cce9a5c4c468aa808eae645c028c0ec`.
`foundation-resource-graph-v1.json` records every address, resource type, create/read/update
operation, long-running-operation read, API, permission, official source, retrieval date, support
classification, deletion consequence, and future break-glass owner. The ledger and actual HCL must
match exactly.

The region is `asia-northeast3`. The VPC remains custom-mode, its subnet is regional with Private
Google Access, the private service allocation precedes the Service Networking connection, and
Cloud SQL explicitly depends on that connection. Cloud SQL PostgreSQL 18 has no public IPv4 or
authorized network, has Data API disabled, backups and PITR enabled, explicit maintenance and
retention inputs, finite positive disk-autoresize capacity, provider deletion protection, and
Terraform `prevent_destroy`. The database depends on the instance. The repository is immutable.
The two secrets are containers only.

Cloud SQL tier, availability, disk size, disk-autoresize cap, backup/PITR retention, maintenance
window, and deletion/final-backup decision are explicit synthetic inputs. The Service Networking
connection uses provider deletion policy `ABANDON` plus `prevent_destroy`; ordinary replacement or
deletion is not admitted. No NAT, Serverless VPC Access connector, runtime identity, IAM binding,
secret version, SQL user, Job, scheduler, or provider credential is present.

The admitted create/update methods for `google_compute_firewall.allow_private_sql` and
`google_compute_firewall.deny_other_egress`, plus the creation of
`google_compute_subnetwork.refund`, require the custom-role-supported
`compute.networks.updatePolicy` permission on the exact foundation VPC network-policy scope.
Subnetwork patch/update instead uses the admitted `compute.subnetworks.get` and
`compute.subnetworks.update` permissions; it does not independently require
`compute.networks.updatePolicy`. The official Compute Engine firewall/subnetwork method mapping
and permission source was retrieved on 2026-07-23 and is frozen in the graph ledger. This is a
network-policy write permission, not an IAM allow-policy or deny-policy mutation. No delete
operation is admitted.

## Foundation deployer derivation

The exact 50-permission set, with SHA-256
`13f34b23381d8cc4303a33a4aa7d10e1f203b3ea9e8be56da80a6c0dde49b944`,
is the union of the reviewed create/read/update needs of the eleven foundation resources:

```text
artifactregistry.locations.get
artifactregistry.locations.list
artifactregistry.repositories.create
artifactregistry.repositories.get
artifactregistry.repositories.list
artifactregistry.repositories.update
cloudsql.databases.create
cloudsql.databases.get
cloudsql.databases.list
cloudsql.databases.update
cloudsql.instances.create
cloudsql.instances.get
cloudsql.instances.list
cloudsql.instances.update
compute.firewalls.create
compute.firewalls.get
compute.firewalls.list
compute.firewalls.update
compute.globalAddresses.create
compute.globalAddresses.createInternal
compute.globalAddresses.get
compute.globalAddresses.list
compute.globalAddresses.use
compute.globalOperations.get
compute.networks.create
compute.networks.get
compute.networks.list
compute.networks.updatePolicy
compute.networks.use
compute.projects.get
compute.regionOperations.get
compute.regions.get
compute.subnetworks.create
compute.subnetworks.get
compute.subnetworks.list
compute.subnetworks.setPrivateIpGoogleAccess
compute.subnetworks.update
compute.subnetworks.use
resourcemanager.projects.get
secretmanager.locations.get
secretmanager.locations.list
secretmanager.secrets.create
secretmanager.secrets.get
secretmanager.secrets.list
secretmanager.secrets.update
servicenetworking.operations.get
servicenetworking.services.addPeering
servicenetworking.services.get
servicenetworking.services.updateConsumerConfig
serviceusage.services.use
```

Official Google permission and product references were refreshed on 2026-07-23 and are frozen
per ledger entry. Each permission is classified `SUPPORTED`. This includes permissions for which
the current custom-role support authority omits an explicit support level: Google states that a
missing support-level marker means the permission is supported. No `TESTING` or `NOT_SUPPORTED`
permission is included. Public documentation is repository design authority only; it is not proof
that the role is valid, created, propagated, or usable in any real project.

The sources are the official Google IAM custom-role support guide; Compute Engine, Cloud SQL,
Artifact Registry, Secret Manager, Service Networking, Service Usage, and Resource Manager
permission references; private-services-access documentation; and official HashiCorp Google
provider 7.40.0 Registry schemas. Exact titles and URLs are recorded in the resource-graph ledger.

Delete permissions are excluded. Delete or replacement is an attended, separately authorized
future break-glass operation. No break-glass role is defined here.

## Forbidden authority

The deployer excludes every Cloud Run Job create/update/delete/run/override/set-IAM or execution
cancel permission; project set-IAM; custom-role mutation; service-account act-as, set-IAM, or key
mutation; secret-version add/access/enable/disable/destroy; secret set-IAM; SQL user mutation; API
enable/disable; Service Management bind; billing wildcard; project create/delete; deny-policy
mutation; GCS backend authority; wildcard or any `*.setIamPolicy` permission. It grants neither
Owner, Editor, predefined broad roles, impersonation, target authority, nor provider execution.

## Custom-role authority

`foundation-deployer-authority` defines exactly one
`google_project_iam_custom_role.foundation_deployer`, with fixed role ID
`refundP3eB2FoundationDeployer`, stage `GA`, and deletion policy `PREVENT`. It defines no service
account, member, binding, state resource, deny policy, API service, foundation resource, runtime
resource, or execution permission.

```text
FOUNDATION_ROLE_ADMIN: EXTERNAL_SEPARATE
FOUNDATION_IAM_BINDING_ADMIN: FUTURE_SEPARATE
FOUNDATION_DEPLOYER: ROLE_ONLY_NOT_BOUND
FOUNDATION_DEPLOYER_ROLE: DEFINED_NOT_CREATED
FOUNDATION_DEPLOYER_BINDING: ABSENT
FOUNDATION_DEPLOYER_IDENTITY: NOT_SELECTED
```

A future package must independently select an identity, prove absence of basic or inherited broad
roles, bind the custom role, separately grant backend object access, prove the principal cannot
mutate the execution deny or execute Jobs, and remove the binding when required. R1B does none of
this.

## Runtime deferred

`runtime-deferred` contains no `.tf`, Terraform test, executable script, or active resource. Its
manifest assigns later ownership for both runtime identities; project and secret IAM; both Jobs;
image digest; database secret versions; Job CPU/memory; private-IP proxy/socket architecture;
database bootstrap, migrations, and grants; observability/alerts; preflight invocation; future
invocation authority; and any later deny exception.

```text
RUNTIME_IDENTITY_AUTHORITY: DEFERRED
RUNTIME_SECRET_BINDINGS: DEFERRED
RUNTIME_JOB_DEFINITIONS: DEFERRED
IMAGE_DIGEST: ABSENT

R2A supersession note (2026-07-23): a local reproducible image definition and private-socket
contract now exist, but no image is published and the release digest remains absent. See
`refund_worker_p3e_b2_runtime_image_connection_v1.md`. Runtime identity, Cloud SQL Client IAM,
secret version, Job Terraform, Direct VPC attachment, and execution remain deferred.
DB_SECRET_VERSIONS: ABSENT
PRIVATE_CONNECTION_PATH: UNRESOLVED
DB_BOOTSTRAP: UNIMPLEMENTED
RUNTIME_DEPLOYABLE: FALSE
CANARY_EXECUTABLE: FALSE
```

## Manifests, state, cost, and evidence

All executable R1B roots use partial GCS backends without a hardcoded bucket, prefix, or credential.
Their future prefixes are:

- `p3e-b2/service-activation`
- `p3e-b2/foundation`
- `p3e-b2/foundation-deployer-authority`

The service-activation output is available only after a successful future apply. Its bounded raw
post-apply manifest contains the exact contract and project, nine managed APIs and hash, three
bootstrap APIs and hash, pinned provider/resource identity, source state prefix,
`activation_apply_status = APPLIED`, `operator_review_status = REVIEW_REQUIRED`, and
`evidence_type = TERRAFORM_APPLY_OUTPUT_NOT_CLOUD_AUTHENTICATED`. It contains no credential,
principal, token, operation name, IAM policy, or backend value.

That raw output is not directly accepted by foundation. An operator must review the resulting
state/output and effective API inventory, then supply a bounded handoff changing only the review
and evidence fields to `OPERATOR_REVIEWED` and
`OPERATOR_ATTESTED_NOT_CLOUD_AUTHENTICATED`. The repository rejects missing, definition-only,
failed, stale, or inconsistent acknowledgments before foundation admission. No automatic script
performs this promotion.

This handoff is honest operator attestation, not trusted or cryptographic cloud evidence. A
malicious operator can fabricate it; effective IAM and real API state remain later evidence
gates, and the handoff must not be reused as P3E-C evidence. Sequencing is fail-closed at the
repository-contract level only. Foundation outputs a bounded nonsecret manifest for later
packages. No root reads another complete state or uses `terraform_remote_state`.

Repository definitions begin no cloud cost. Future service activation, repository storage, network
allocation, secrets, and especially Cloud SQL would begin cost only under separately authorized
cloud mutation. Destroy, replacement, deletion-protection removal, backend manipulation, or
unknown-resource adoption are never routine rollback.

No cloud was inspected. Backend-disabled initialization, static validation, and provider-mocked
Terraform tests are not cloud evidence.

## Canonical status and next package

```text
P3E_B1_MONOLITH: RETIRED_UNAPPLIED
STATE_BACKEND_AUTHORITY: DEFINED_NOT_PROVISIONED
JOB_EXECUTION_DENY: DEFINED_NOT_APPLIED
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

The smallest candidate next package after committed R2A is P3E-B2-R2B: runtime identity, database
secret-version authority, and dormant Cloud Run Job definitions. This document does not authorize
R2B.
