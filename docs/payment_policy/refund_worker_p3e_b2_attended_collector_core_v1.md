# Refund worker P3E-B2 TB2A-R1 attended collector core v1

Status: dormant, provider-free repository definition only.

This package defines a read-only attended collector core, evidence v2, a bounded subprocess
adapter, provider-free Node fixture tests, and a fixture-only self-check. It performs no real
collection, grants no cloud authority, reads no credential, writes no evidence, and does not
authorize TB2B custody or any later mutation.

## Version boundary

The committed TB1 v1 contract and schema remain immutable historical authority:

- `infra/refund-sandbox/p3e-b2/contracts/trusted-project-bootstrap-readiness-v1.json`
- `infra/refund-sandbox/p3e-b2/trusted-project-bootstrap-readiness/evidence.schema.json`

TB2A-R1 introduces the exact version
`mira-refund-p3e-b2-trusted-project-bootstrap-readiness/v2`. V1 and v2 parsers require their exact
versions. Neither version is silently upgraded or interpreted as the other.

## Collector permission boundary

The exact dedicated-project collector permission set is:

```text
resourcemanager.projects.get
serviceusage.services.list
```

The collector excludes `serviceusage.services.get`, `serviceusage.services.use`,
`serviceusage.services.batchGet`, quota-project overrides, consumer-policy mutation, API
activation, and billing mutation. Method B (`services.batchGet`) remains a separately reviewed
future option and would require a new permission decision.

## Frozen command order

The command order is exactly:

1. `EFFECTIVE_CONFIG_GET`
2. `GCLOUD_VERSION`
3. `COLLECTOR_IDENTITY`
4. `PROJECT_GET`
5. `BILLING_INFO_GET`
6. `BOOTSTRAP_SERVICES_LIST`

The first three are local receipts. Only the final three are remote sources. Adding the local
configuration observation does not change the remote-source count from three.

`EFFECTIVE_CONFIG_GET` uses `gcloud config list --all` under an explicit configuration and rejects
set endpoint overrides, custom CA, impersonation, token-file, credential-file override, proxy, and
quota-project properties. `core/account` must be present. Public output contains only exact
cleanliness booleans and SHA-256 over sorted admitted property names; no property value crosses the
parser boundary.

The remote command surfaces are frozen as:

```text
gcloud.projects.describe:json(projectId,projectNumber,lifecycleState)
gcloud.billing.projects.describe:json(projectId,billingEnabled)
gcloud.services.list.enabled:json(name,config.name,state,parent)
```

`--billing-project`, quota overrides, beta billing, `--available`, and services-list `--filter`,
`--sort-by`, or `--limit` are forbidden.

## Service Usage Method A

The Service Usage resource shape is taken from the official Service resource:

- `name`: `projects/<PROJECT_NUMBER>/services/<SERVICE_NAME>`
- `parent`: `projects/<PROJECT_NUMBER>`
- `config.name`: `<SERVICE_NAME>`

Source: <https://cloud.google.com/service-usage/docs/reference/rest/v1/services>

The gcloud surface uses `services list --enabled --page-size=200`. Source:
<https://cloud.google.com/sdk/gcloud/reference/services/list>. The underlying list method permits
`serviceusage.services.list`, caps a page at 200, and supports only state filters. Source:
<https://cloud.google.com/service-usage/docs/reference/rest/v1/services/list>.

A structurally valid non-target service is expected and ignored. A malformed entry anywhere,
target duplicate, field disagreement, or project-number mismatch fails closed. A target present
exactly once with explicit `ENABLED` becomes `ENABLED`. A missing target becomes `UNOBSERVABLE`,
which produces `OBSERVATION_INCOMPLETE`. Method A never infers `DISABLED`
from absence and cannot produce real `BOOTSTRAP_API_ACTIVATION_REQUIRED`.

```text
TB2A_R1_METHOD_A_DISABLED_INFERENCE: FORBIDDEN
TB2A_R1_METHOD_A_MISSING_TARGET_STATE: UNOBSERVABLE
TB2A_R1_BOOTSTRAP_API_ACTIVATION_DISPOSITION_REAL_REACHABILITY:
UNREACHABLE_WITH_METHOD_A
```

## Attempts and result boundary

The real adapter performs exactly one attempt per command:

```text
maxAttempts: 1
maxRetries: 0
automaticRetries: NONE
```

It never derives 429, 5xx, authentication, authorization, or not-found classifications from
stderr. The historical v1 synthetic retry vocabulary remains available only at the v1 injected
boundary.

## Executable, process, and environment boundary

The attended launcher and Python interpreter are separately supplied absolute paths. Each is
`lstat`-checked before `realpath`, must be a regular executable file, must not be a symlink or
group/world-writable, and must canonicalize outside the repository. The pinned Cloud SDK version
is `577.0.0`. The contract does not assume every SDK archive bundles Python and does not claim to
protect against an attacker already controlling the executing UID.

The subprocess uses `shell: false`, immutable arguments, ignored stdin, drained stdout/stderr
pipes, no TTY or extra descriptors, an external mode-0700 cwd, `detached: true`, and never
`unref`. It has one terminal-reason latch, a 30-second command deadline, SIGTERM to the owned
process group, a two-second grace, SIGKILL, and a five-second close deadline. Undefined PIDs and
already-exited children are never signalled. Signal uncertainty becomes
`PROCESS_TERMINATION_UNCONFIRMED` and blocks assembly.

The environment is constructed, not inherited. `CLOUDSDK_CORE_USER_OUTPUT_ENABLED` is exactly
`true`; setting it false suppresses the output required by the parser. Credential, project,
account, ADC, quota-project, proxy, custom-CA, Node, Python, and arbitrary inherited PATH
variables are not admitted. Locale and supplied-interpreter availability remain E1 runtime
admission checks.

## Evidence v2 and identity truth

Evidence v2 records six command receipts with UTC start/completion and monotonic duration, a
120-second total bound, a nonce, three remote sources with argv and selected-output digests,
configuration cleanliness and property-name fingerprint, repository commit, and adapter contract
version. `project.bindingResponseSha256` is absent because the project source already carries that
selected-output digest.

The collector fingerprint attests only the local credential store's single active account under a
configuration observed free of prohibited redirection and override properties. It does not attest
the effective provider-side caller, credential ownership, provider-side audit attribution,
nonrepudiation, or anonymity.

The assembler requires reviewer status `ABSENT`. A complete all-enabled Method-A observation
produces `INDEPENDENT_REVIEW_REQUIRED`; a missing target produces
`OBSERVATION_INCOMPLETE`. It keeps every downstream-authority field false, recomputes the
restricted canonical digest, reconstructs and deep-freezes the result, and reparses the final
canonical bytes. It never returns `READY_FOR_STATE_BUCKET_PACKAGE` or fabricates
`BOOTSTRAP_API_ACTIVATION_REQUIRED`.

## Fixture-only self-check

`scripts/refund-p3e-b2-collector-selfcheck.mts` may spawn only `process.execPath` with the committed
Node fixture. It refuses credential-bearing environments and any other fixture path. It emits one
bounded summary containing only contract/evidence versions, disposition, evidence SHA-256,
command count, duration, and `mode: FIXTURE_SELF_CHECK`. It is not a real collector entry point and
never emits the evidence body.

The durable writer, custody, reviewer attachment, real gcloud execution, credentials, cloud
observation, and every mutation remain outside TB2A-R1.
