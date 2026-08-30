# Refund worker P3E-B2 state authority v1

P3E-B2-R1A is repository preparation only. The provisioning feasibility review found that the
committed P3E-B1 monolith cannot safely become an empty-project apply sequence: state authority,
resource-graph splitting, image preparation, private database connectivity, database bootstrap,
secret versions, runtime definitions, and invocation authority have distinct owners and unresolved
dependencies. R1A originally defined state authority and an attempted execution-deny authority.
The current no-organization project cannot admit that deny architecture; the executable deny root
is now retired. This document supplies no cloud evidence and authorizes no mutation.

## Package boundary

R1A owns:

1. one local-state, one-time bucket creation root;
2. one remote authority root that adopts and manages the same bucket;
3. one non-executable retirement marker for the infeasible IAM deny root;
4. state handoff/recovery and authority-separation contracts;
5. provider-mocked and repository policy tests.

R1B must split the existing P3E-B1 root into actual provider-free foundation authorities and derive
a non-executing deployer role from that graph. Later packages own image/container preparation, the
private-IP proxy/socket design, database bootstrap, database credential secret versions, runtime
Job definitions, and preflight invocation. R1A does not move or redesign any P3E-B1 resource and
does not conceal those blockers behind an early root migration.

R1B subsequently completed that repository-only split. The current 26-path R1A-owned
subinventory is exact, including the deny retirement marker; repository history preserves the
former executable root without leaving it runnable.

## State creation, authority, and handoff

The shared `modules/state-bucket` configuration is the single repository authority for both state
roots. It fixes the bucket to `asia-northeast3`, `STANDARD`, uniform bucket-level access, enforced
public-access prevention, versioning, `force_destroy = false`, and Terraform `prevent_destroy`.
There is no ACL/default ACL, website, requester pays, signed key, automatic deletion lifecycle, or
retention policy that could block ordinary backend lock-object deletion.

The local root has an explicit empty local backend, no remote backend, and reports
`ONE_TIME_LOCAL_BOOTSTRAP_ONLY`. Its local state is sensitive operational evidence even though
configuration outputs are nonsecret. Before the bucket exists it must be access-restricted, backed
up under two-person control, and never committed. The root cannot be rerun after remote ownership.

The remote authority root has an empty partial GCS backend and declarative imports for the bucket
and each bucket IAM member. It hardcodes neither backend bucket nor prefix. Future attended handoff
is exactly:

1. review the local creation plan;
2. separately authorize and create the bucket;
3. verify bucket security and recovery settings;
4. initialize the authority root against the new backend;
5. adopt/import the existing bucket and IAM;
6. prove exact configuration and state locking;
7. remove those resources from local bootstrap state without destroying them;
8. prove the local root owns zero resources;
9. archive and securely retire local state with two-person evidence;
10. prohibit future local-root execution.

R1A performs none of those steps. There is no automatic state deletion, state/import package
script, ordinary repeated `-target`, or intended permanent double ownership.

## Locking and recovery

The GCS backend's object authority is confined to its bucket. Lock acquisition and release must be
proven after future adoption before any other root uses the backend. Object versioning is the R1A
recovery authority. Recovery means inspecting and deliberately restoring an identified historical
generation under state-administrator/break-glass review; it never means blind rollback, deletion of
current state, or bypassing a live lock.

Provider 7.40.0 supports a bucket soft-delete configuration and its schema states that omission
allows the service default. Schema support is not proof that GCS backend lock objects can be deleted
normally or that retention cost and restoration behavior are acceptable. R1A therefore fixes the
soft-delete retention duration explicitly to zero. Future enablement is deferred until an operator
package proves lock acquire/release, explicit bounded retention, cost, and tested recovery.

## Bucket IAM and external creator

State runners receive bucket-scoped `roles/storage.objectAdmin` only. State administrators and
explicit break-glass administrators receive bucket-scoped `roles/storage.admin` only. The sets are
nonempty where required, syntactically exact, and pairwise distinct. Public/wildcard members,
default Compute identity, project-level Storage grants, basic roles, keys, and inferred principals
are forbidden.

The future bucket creator must already hold external `storage.buckets.create`,
`storage.buckets.get`, `storage.buckets.update`, `storage.buckets.getIamPolicy`, and
`storage.buckets.setIamPolicy` authority in the dedicated project. R1A grants none of it. Break-glass
use requires incident authorization and evidence; it is not an ordinary runner.

## State isolation and manifests

Exact future backend prefixes are:

- `p3e-b2/state-backend-authority`
- `p3e-b2/service-activation`
- `p3e-b2/foundation`
- `p3e-b2/foundation-deployer-authority`
- `p3e-b2/runtime`
- `p3e-b2/database-bootstrap`
- `p3e-b2/preflight-invocation`

Each is an independent authority state. Workspaces do not multiplex environments. No unrelated
authority shares a state file and no `terraform_remote_state` exposes complete state. Future
root-to-root exchange uses explicit reviewed nonsecret manifests. Passwords, database URLs, secret
payloads, credentials, provider targets, and approvals are never outputs.

The former `p3e-b2/authority-guardrails` prefix is retired and must never be reused.

## Retired Cloud Run Job execution deny

IAM Deny is not applicable to the current no-organization project. The project Owner does not hold
`iam.denypolicies.create`; the role containing it cannot be granted at this project hierarchy, and
no deny policy materialized. The former Terraform root has been removed and replaced by
`infra/refund-sandbox/p3e-b2/authority-guardrails/README.md`.

The failed saved plan SHA-256
`d26b446e26b41c1b88f52e530dadc2ef4ec82420b7acce87faf5e8ddd995e86b` is invalid and must never be
retried. Its malformed unencoded parent remains historical evidence, not a repair candidate.

The accepted threat model trusts the project Owner or an explicitly authorized human. A trusted
Owner may technically invoke a future Job; resistance to a malicious Owner is not required.
Execution safety instead requires no persistent automatic trigger, zero retries, no provider
credential or target, and no provider contact.

## R1B deployer authority amendment

`FOUNDATION_DEPLOYER_ROLE: DEFINED_NOT_CREATED`

R1B derived every permission from the split foundation graph and excludes
`run.jobs.run`/`run.jobs.runWithOverrides`, deny-policy mutation, secret-payload access, database
password access, service-account key creation, Owner, and Editor. The definition has no identity or
binding and supplies no cloud evidence.

## Rollback, cost, and evidence

No cost begins from repository definitions. Future bucket mutation begins storage/operation cost;
the retired deny root creates no cost. Rollback cannot use destroy,
backend/state bypass, public IAM, broad basic roles, or deletion-protection removal. Bucket recovery
and any future stronger organization-backed guardrail require separate authorization and evidence.
Repository files prove no cloud fact.

The distributed admission, provider-free preflight, Cloud SQL guard, worker host/process, P3E-A,
P3D, schema, and migrations remain unchanged. The definitions-only B1 monolith is retired without
state migration because no state or cloud resource existed. Later packages remain required.

Exact status:

```text
STATE_BACKEND_AUTHORITY: DEFINED_NOT_PROVISIONED
IAM_DENY_CURRENT_PROJECT: NOT_APPLICABLE_NO_ORGANIZATION
SERVICE_ACTIVATION_AUTHORITY: DEFINED_NOT_PROVISIONED
FOUNDATION_ROOT: DEFINED_NOT_PROVISIONED
FOUNDATION_DEPLOYER_ROLE: DEFINED_NOT_CREATED
FOUNDATION_DEPLOYER_BINDING: ABSENT
P3E_B2_FOUNDATION: NOT_PROVISIONED
P3E_B2_RUNTIME: NOT_DEPLOYABLE
PROVIDER_EXECUTION: BLOCKED
SCHEDULED_SANDBOX: BLOCKED
LIVE: UNREACHABLE
```
