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

`resource-ownership-v1.json` freezes every B1 runtime, IAM, image, secret-version, connectivity,
bootstrap, observability, and invocation owner. `database_roles.sql` was moved byte-identically
from the retired root; it remains an unexecuted later database-bootstrap input.

Repository history—not stale `.tf`, `.disabled`, `.bak`, or copied Job HCL—is the source for the
retired definitions. Later packages must re-derive runtime authority from current contracts.
