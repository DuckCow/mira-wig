# P3E-B2-R1B runtime-deferred boundary

This directory is a non-executable ownership contract. It contains no Terraform root, active
resource, script, image digest, secret version, credential, target, or approval.

Canonical status:

```text
RUNTIME_IDENTITY_AUTHORITY: DEFERRED
RUNTIME_SECRET_BINDINGS: DEFERRED
RUNTIME_JOB_DEFINITIONS: DEFERRED
IMAGE_DIGEST: ABSENT

P3E-B2-R2A now owns an implemented-but-unpublished local image definition and private-socket
contract. This R1B file remains the historical runtime-deferred inventory authority: its
`IMAGE_DIGEST: ABSENT` fact is still true because no release image was published. The superseding
nonsecret R2A machine contract is
`../contracts/runtime-image-connection-v1.json`; runtime identity, IAM, secret version, Job
Terraform, Direct VPC attachment, publication, and execution remain deferred.
DB_SECRET_VERSIONS: ABSENT
PRIVATE_CONNECTION_PATH: UNRESOLVED
DB_BOOTSTRAP: UNIMPLEMENTED
RUNTIME_DEPLOYABLE: FALSE
CANARY_EXECUTABLE: FALSE
```

P3E-B2-R2B1 supersedes the dormant-definition subset through
`../contracts/runtime-authority-v1.json` and the isolated `../runtime` root. It defines, without
provisioning, the two runtime service accounts; the exact conditioned Cloud SQL Client members;
the two exact secret-level database accessors; the preflight and dormant-canary Jobs; and their
CPU, memory, task, retry, timeout, and Direct VPC settings. Every production resource remains
unconditionally plan/apply-blocked in R2B1, and both Job interfaces carry the exact foundation
firewall target tag `refund-provider-free`. It accepts only exact references to a
future release image digest and future existing database secret versions; it does not create
either. The historical statuses above remain the R1B snapshot.

Still deferred are image publication; database secret payloads and versions; database bootstrap,
migrations, and grants; monitoring and alert deployment; preflight invocation; future invocation
authority; and provider credential secret versions. The R2A private proxy
socket architecture remains owned by R2A. R2B1 adds no invoker, scheduler, execution, target,
approval, provider credential, or trusted cloud evidence.

The later database-bootstrap owner now exists at `../database-bootstrap`, with machine contract
`../contracts/database-bootstrap-runtime-v1.json` and a separate purpose-built image under
`containers/refund-db-bootstrap`. It supersedes only the historical `LATER_DB_BOOTSTRAP` slots in
this R1B inventory. Its Docker and Cloud Run defaults are non-mutating `check`; `apply` remains an
explicit separately attended mode. It adds no trigger, retry, provider credential, application
password or secret version. The current source definition does not itself prove image publication,
cloud materialization, Job execution or database access.

`resource-ownership-v1.json` freezes every B1 runtime, IAM, image, secret-version, connectivity,
bootstrap, observability, and invocation owner, plus the explicit R2B1 supersession subset.
`database_roles.sql` was moved byte-identically from the retired root at the R1B handoff. That
movement remains historical; the later database-bootstrap owner now owns reviewed corrections and
attended execution of this input.

Repository history—not stale `.tf`, `.disabled`, `.bak`, or copied Job HCL—is the source for the
retired definitions. Later packages must re-derive runtime authority from current contracts.
