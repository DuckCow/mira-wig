# Refund SANDBOX P3E-B2-R1A authority roots

Status: repository definitions only. No Google Cloud project, bucket, backend, deny policy, role,
resource, or execution authority has been created or inspected.

R1A defines three deliberately separate Terraform authority boundaries:

- `state-bootstrap-create` is a one-time local-state root that can create only the shared state
  bucket and its bucket-scoped IAM after separate authorization.
- `state-backend-authority` is the permanent remote-state authority for that same bucket and IAM.
  It uses the shared module and declarative import blocks.
- `authority-guardrails` is an independent remote-state root for one project-attached IAM deny
  policy. It cannot manage the bucket, foundation, runtime, identities, or allow grants.

The existing `../p3e-b` root remains definitions-only and unchanged. It is not made applicable by
R1A. R1B must split its actual foundation graph before any foundation deployment authority can be
derived.

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
| IAM authority guardrails | `p3e-b2/authority-guardrails` |
| Foundation resources | `p3e-b2/foundation` |
| Runtime definitions | `p3e-b2/runtime` |
| Database bootstrap | `p3e-b2/database-bootstrap` |
| Preflight invocation | `p3e-b2/preflight-invocation` |

Each authority owns one prefix. Workspaces must not multiplex environments, unrelated authorities
must not share a state file, and no root may use `terraform_remote_state`. Future root handoff must
use reviewed nonsecret manifests containing only identifiers such as approved project ID, region,
resource names, immutable image digest, or numeric resource generation. Passwords, connection URLs,
secret payloads, credentials, targets, and approvals are forbidden in outputs.

## Execution deny authority

`authority-guardrails` requires both the dedicated project's bounded alphanumeric project ID and a
separately evidenced canonical decimal project number. The Google provider uses the project ID;
the IAM v2 deny attachment uses only
`cloudresourcemanager.googleapis.com/projects/<project-number>`. The repository performs no
project-number lookup, and neither supplied value proves that a project exists. The policy denies
`principalSet://goog/public:all` exactly:

- `run.googleapis.com/jobs.run`
- `run.googleapis.com/jobs.runWithOverrides`

It has no wildcard, exception principal, exception permission, condition, allow grant, Job, service
account, custom role, secret, database, scheduler, or foundation resource. Terraform deletion
policy is `PREVENT`. Repository presence is not deployment evidence; no project was inspected and
no deny policy was applied.

Future deny mutation requires Deny Admin or a separately derived exact equivalent. That break-glass
authority must be contractually distinct from state administration, foundation deployment,
runtime-definition deployment, credential ownership, database bootstrap, preflight execution, and
observation. This root creates no binding. The foundation deployer and preflight executor must not
receive deny-policy update/deletion authority. Absence of inherited Owner, Editor, or other basic
roles remains an external evidence gate. The deny cannot protect against an authorized Deny Admin
who changes or removes it.

Deny propagation is eventually consistent. A future approved change must capture policy name, UID,
etag, update time, permissions, and principals; wait for observed propagation without treating a
fixed sleep as proof; and perform a negative probe with a non-excepted identity. A later separately
approved exception requires negative probes for canary and unrelated identities plus a positive
probe only for the exact preflight identity. No Job may execute until probes match. Afterward the
exception must be removed, negative probes repeated, and evidence frozen. R1A creates no exception
and runs no probe.

## Deferred authority

`FOUNDATION_DEPLOYER_ROLE: BLOCKED_PENDING_R1B_RESOURCE_GRAPH`

R1B must derive each permission from the split foundation graph. It must exclude Job execution and
override execution, deny-policy mutation, secret-payload and database-password access,
service-account key creation, Owner, and Editor. R1A invents no deployer role.

No Terraform command in R1A is cloud authorization. Credential-free validation is limited to
formatting, backend-disabled initialization, validation, and provider-mocked tests using Google
provider 7.40.0.
