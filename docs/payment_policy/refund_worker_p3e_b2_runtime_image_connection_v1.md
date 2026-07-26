# Refund worker P3E-B2-R2A runtime image and private socket contract v1

Retrieved and reconciled against primary authority on 2026-07-24.

## Scope and status

P3E-B2-R2A defines a provider-free, reproducible Linux AMD64 image and a fail-closed private
Cloud SQL socket architecture. It creates no cloud fact and publishes no image.

```text
P3E_B1_MONOLITH: RETIRED_UNAPPLIED
STATE_BACKEND_AUTHORITY: DEFINED_NOT_PROVISIONED
JOB_EXECUTION_DENY: DEFINED_NOT_APPLIED
SERVICE_ACTIVATION_AUTHORITY: DEFINED_NOT_PROVISIONED
FOUNDATION_ROOT: DEFINED_NOT_PROVISIONED
FOUNDATION_DEPLOYER_ROLE: DEFINED_NOT_CREATED
REFUND_WORKER_IMAGE_DEFINITION: IMPLEMENTED_NOT_PUBLISHED
REFUND_WORKER_IMAGE_PLATFORM: LINUX_AMD64
REFUND_WORKER_IMAGE_LOCAL_REPRODUCIBILITY: PROVIDER_FREE_PROOF_COMPLETE_NOT_RELEASE_AUTHORITY
REFUND_WORKER_RELEASE_IMAGE_DIGEST: ABSENT
CLOUD_SQL_PROXY_BINARY: PINNED_NOT_DEPLOYED
CLOUD_SQL_PRIVATE_SOCKET_ARCHITECTURE: DEFINED_NOT_PROVEN
DIRECT_VPC_EGRESS: REQUIRED_NOT_CONFIGURED
CLOUD_SQL_CLIENT_IAM: DEFERRED
DATABASE_SECRET_VERSION: ABSENT
RUNTIME_IDENTITY_AUTHORITY: DEFERRED
RUNTIME_JOB_DEFINITIONS: DEFERRED
P3E_B2_FOUNDATION: NOT_PROVISIONED
P3E_B2_RUNTIME: NOT_DEPLOYABLE
PROVIDER_EXECUTION: BLOCKED
SCHEDULED_SANDBOX: BLOCKED
LIVE: UNREACHABLE
```

The machine authority is
`infra/refund-sandbox/p3e-b2/contracts/runtime-image-connection-v1.json`.

## Selected image architecture

The first canary architecture is one application container with one Node supervisor. The
supervisor owns the existing worker/preflight process and a Cloud SQL Auth Proxy child. It keeps
the proxy alive while a worker drains, shuts the proxy down after the worker ends, awaits both
children, and returns one bounded result line.

This is not a universal rejection of Cloud Run sidecars. Multi-container ownership is deferred
because the first Job needs one completion owner and its complete lifecycle must be provable
locally before any Job exists.

The image has no default action. Missing, unknown, duplicated, or extra arguments fail closed.
The only commands are `worker-check`, `worker-health`, `worker-once`, `sandbox-preflight`, and
`image-self-check`.

## Immutable build inputs

- Node `22.23.1`, official `bookworm-slim`, Linux AMD64 manifest
  `sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27`.
- Cloud SQL Auth Proxy `2.22.0`, official default image, Linux AMD64 manifest
  `sha256:b239a84edd20cfcf1fef20a8d297ac578a73e5cb0ba0eaaf5498782de4f9f861`.
- Embedded proxy executable SHA-256
  `12f2c210ef4a60c4284888edbd34c4c9868a2cba5ce26a665ad875aaf980b6fb`.
- Independently downloaded official standalone Linux AMD64 release SHA-256
  `42e73a8775bc3300b6514816cc4893f01b109a50f65aa779a451d3e4ff4c3ead`.
- Root `package-lock.json`, exact esbuild `0.28.1`, and fixed
  `SOURCE_DATE_EPOCH=1784764800`.

The Docker build copies the proxy only from the pinned container manifest into a verification
stage and performs an exact SHA-256 check before the runtime stage can receive it. A mismatched
build argument fails the checksum stage. The two proxy executable hashes differ because the
official container and standalone release are separate official build artifacts. R2A copies
from and verifies the pinned container artifact; the standalone checksum is recorded as an
independent official-release observation, not as a substitute for the embedded-binary hash.

The final stage retains Node’s bundled OpenSSL implementation used by Node/pg plus Debian glibc,
zlib, and libgcc. Prisma 7 runs through the committed `@prisma/adapter-pg` driver adapter and its
generated JavaScript/WASM client; it does not invoke a native query engine or Prisma CLI at
runtime. Client generation happens without a database in the build stage.

## Exact build context, bundle, and migration boundary

The repository root is not an authoritative Docker context. The build orchestrator asks esbuild
for the actual three-entrypoint graph, rejects symlinks and path escape, and copies only the
reachable repository inputs plus the exact lockfile, package manifest, Prisma inputs, 29
migrations, build script, and Dockerfile into an empty temporary directory outside the
repository. It normalizes regular files to `0644`, directories to `0755`, and timestamps to
`SOURCE_DATE_EPOCH`, then emits a sorted path/size/mode/content-SHA-256 manifest and digest.
The context is removed in `finally`.

The corrected exact context contains 144 files and has canonical manifest SHA-256
`45897aed9870925bb5eea47879fbefba396637b90f14c56e7e6b85d69333defa`.

The 45 packaged graph inputs are not copied from local `node_modules`; the pinned root lockfile
recreates them inside the build stage. No Next route, webhook or admin route, reconciliation or
outbox script, acceptance script, test, Terraform file, environment file, Git data, or local
build output is admitted. The root `.dockerignore` is defense in depth and denies everything.
Direct ad hoc `docker build .` is intentionally not an authoritative R2A build path and lacks
the required inputs.

esbuild targets Node 22/Linux and emits deterministic ESM without source maps for:

- `scripts/refund-execution-worker.ts`;
- `scripts/refund-sandbox-provider-free-preflight.ts`;
- `containers/refund-worker/entrypoint.ts`.

Internal modules, adapter-pg, and pg are bundled. `@prisma/client` is externalized because its
generated runtime assets are dynamic; only its generated runtime closure is copied. All committed
`prisma/migrations/*/migration.sql` files are copied byte-identically. The mirrored output path
keeps `worker-migration-readiness.ts` resolving `/app/prisma/migrations` via its existing
module-relative contract. Schema readiness still requires the runtime ledger comparison; image
bundling alone does not prove it.

The exact application closure under `/app` is independently frozen by entry count, exact
image-native metadata manifest digest, and exact content manifest digest. Metadata includes path,
type, numeric UID/GID, mode, and symlink target as observed inside the Linux image. Content
hashing is likewise performed inside the image and does not depend on archive extraction,
invoking-host UID/GID, or umask. The closure contains only the three bundles, Prisma generated
runtime and required external runtime modules, 29 migration SQL files, and their required package
metadata. No unrelated repository source is present.

The corrected image-native application closure contains 156 entries. Its metadata-manifest
SHA-256 is `615d451c325b18d9f02ee95bc07c913b1a8229fe481cab71a867d203279515fb`;
its content-manifest SHA-256 is
`b41fe8913eda7eb3c38646c13f808f2fff26aaaea52ad742f6960f8443b02a63`.

The runtime contains no TypeScript compiler, tsx, esbuild, tests, source TypeScript, Next.js app,
web server, Prisma CLI, executable npm/npx/Corepack/pnpm/Yarn surface, executable apt/dpkg
mutation surface, interactive sh/bash/dash shell, build compiler/linker, Terraform, environment
file, credential, repository history, or acceptance evidence. The Corepack/npm/Yarn package
directories and `/opt/yarn` are removed, not merely hidden from `PATH`. Debian package database
metadata may remain for pinned system-library attribution, but executable package-management
authority does not.

The exact sorted forbidden executable key set is:

```json
["apt","apt-cache","apt-cdrom","apt-compat","apt-config","apt-daily-upgrade.timer","apt-daily.timer","apt-get","apt-helper","apt-key","apt-mark","aptitude","ar","as","bash","c++","c89","c99","cc","corepack","cpp","curl","dash","deb-systemd-helper","deb-systemd-invoke","dpkg","dpkg-db-backup","dpkg-db-backup.timer","dpkg-deb","dpkg-divert","dpkg-fsys-usrunmess","dpkg-maintscript-helper","dpkg-preconfigure","dpkg-query","dpkg-realpath","dpkg-reconfigure","dpkg-split","dpkg-statoverride","dpkg-trigger","esbuild","g++","gcc","ld","make","nm","npm","npx","objcopy","objdump","pnpm","pnpx","ranlib","rbash","sh","strip","tsc","tsx","update-alternatives","wget","yarn","yarnpkg"]
```

The separate exact forbidden content-prefix set is:

```json
["/app/node_modules/esbuild","/app/node_modules/tsx","/app/node_modules/typescript","/opt/yarn","/usr/local/lib/node_modules/corepack","/usr/local/lib/node_modules/npm"]
```

The image default user remains `65532:65532`, but ownership is not transferred to that user.
`/`, `/app`, `/etc`, `/usr`, `/usr/local`, `/usr/local/bin`, Node, the proxy, application
bundles, generated Prisma runtime, package metadata, and migration SQL remain root-owned and
worker-nonwritable. `/tmp`, `/var/tmp`, and `/run/lock` are root-owned `0755`. Only `/cloudsql`
and `/tmp/refund-worker` are owned by `65532:65532`, with exact mode `0700`.

## Complete-root filesystem authority

Image verification runs a bounded Node metadata inspector as root inside both the exact pinned
Node base and final runtime containers. Both inspectors use `--network=none` and a read-only
container filesystem. They traverse from `/` in deterministic sorted order and use in-container
`lstat` for path, type, numeric UID/GID, mode, symlink target, and regular-file SHA-256. Symlink
targets are recorded but never traversed. Host archive extraction is not an ownership,
application-manifest, system-closure, attestation, or success-output authority.

Exact Docker virtual mounts (`/.dockerenv`, `/dev`, `/proc`, `/sys`, `/etc/hostname`,
`/etc/hosts`, and `/etc/resolv.conf`) and the Docker Desktop AMD64 emulation injection root
(`/root/.cache`, whose synthetic child is `/root/.cache/rosetta`) are excluded explicitly. Every
other base/runtime path is
classified bidirectionally as unchanged, an exact reviewed removal, an exact reviewed
metadata/content change, or an exact runtime addition. There is no prefix-only addition
allowance. The complete sorted removal set, changed-entry before/after set, and addition
metadata/content set are each frozen by exact count and SHA-256 digest. An extra or missing path,
or an ownership, mode, type, link-target, or content change, fails closed.

Node's built-in TLS root-certificate inventory is exercised directly; this pinned slim base does
not provide a separate Debian `/etc/ssl` CA bundle. The complete image-native root scan—not an
`/app` sample—is also the authority for forbidden executable and forbidden content counts.
Separate default-user probes prove write denial for `/usr`, `/usr/local`, `/usr/local/bin`, Node,
the proxy, an application bundle, generated Prisma runtime, a migration, and `/etc`, while
proving bounded write/delete behavior only in `/cloudsql` and `/tmp/refund-worker`.

The exact `PINNED_NODE_BASE_DELTA_V1` authority is:

- 2,620 reviewed base removals; sorted path-manifest SHA-256
  `fcbac8b41543fafd754b035b3c8a3dc93e605f3f7cd1d050b31640b6d87a7bab`;
- 3 reviewed retained-base metadata changes; before/after metadata-content SHA-256
  `d9ea3c2e8982ba4189f03173dfeb4f914d1350d4715e77daede4f96d639f33da`;
- 159 exact runtime additions; metadata-content SHA-256
  `f6a701f3dd140701d920243ab90990e3966ffd1ed13e10767991abcc68f384bc`.

The removals are exactly 73 apt/dpkg executable, metadata, and scheduler entries; 2,542 Node
package-manager package/cache/shim entries; 4 interactive shell entries; and the one `gpgv`
package-signature verifier. The three retained-base changes are `/run/lock`, `/tmp`, and
`/var/tmp`, each changed from root-owned `01777` to root-owned `0755` to remove runtime-user
write. The additions are exactly the 156-entry application closure, two bounded runtime-user
writable directories, and the verified proxy executable.

## Private network and socket contract

The later Job must use the second-generation Cloud Run environment, Direct VPC egress, and
`private-ranges-only`. Database traffic uses Cloud SQL Auth Proxy v2 with `--private-ip`, then
PostgreSQL uses:

```text
/cloudsql/<project-id>:asia-northeast3:<instance-id>
```

The committed subnet is `10.74.0.0/24`, which is larger than the current documented `/26`
minimum. No Serverless VPC Access connector or NAT is introduced. Private database traffic
follows Direct VPC; SQL Admin API and payment-provider HTTPS remain ordinary external egress.
No private database IP is embedded in DATABASE_URL or exposed by foundation outputs.

`REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME` must exactly equal the instance segment admitted by
the existing canonical DATABASE_URL guard. That guard retains literal `host=`, the `/cloudsql`
root, region `asia-northeast3`, exact localhost/5432 URL authority, and its rejection of encoded
separators, duplicate parameters, PG overrides, remote addresses, and unsafe database identities.
Mismatch fails before proxy spawn. Neither value is emitted.

## Early gates and Cloud Run task identity

For `worker-once`, the order before proxy spawn is:

1. the existing worker master parser;
2. the complete existing activation inventory;
3. the existing Toss SANDBOX credential grammar;
4. exact Cloud Run command/task identity;
5. canonical DATABASE_URL/instance equality.

A disabled or malformed activation delegates to the existing worker process so its exact
`FEATURE_DISABLED` or `CONFIG_INVALID` schema remains authoritative and no proxy starts.

Owner labels are deterministic hashes derived only from `CLOUD_RUN_JOB`, `CLOUD_RUN_EXECUTION`,
`CLOUD_RUN_TASK_INDEX`, `CLOUD_RUN_TASK_ATTEMPT`, and `CLOUD_RUN_TASK_COUNT`. Raw Cloud Run values
are never emitted. Exactly one task, index zero, and attempt zero are required. Missing,
noncanonical, multiple-task, nonzero-index, retry-attempt, caller-label, and alias forms fail
closed. R2A adds no retry or scheduler.

## Proxy invocation, readiness, output, and shutdown

The exact proxy vector is:

```text
--private-ip
--unix-socket=/cloudsql
--health-check
--http-address=127.0.0.1
--http-port=9801
--exit-zero-on-sigterm
<exact-instance-connection-name>
```

Nonblank `CSQL_PROXY_*` variables are rejected. Credentials files, tokens, gcloud auth,
impersonation, IAM database authentication, configuration files, public-IP fallback, external
health binding, and multiple instances are forbidden.

Current Direct VPC authority warns that connection establishment during instance startup can
take one minute or more. The supervisor therefore polls the loopback `/readiness` endpoint every
250 ms under an exact 120-second engineering allowance. The allowance is bounded, is not
runtime-configurable, and is not a promise that every Direct VPC startup succeeds inside 120
seconds. Early proxy exit and timeout map to bounded database-unavailable output. Bodies and
proxy logs are never relayed.

Proxy readiness proves only the local proxy process/readiness boundary. The existing worker
database-connectivity query remains the subsequent database boundary. Neither local fake-proxy
readiness nor image smoke testing proves deployed private connectivity. All command, activation,
credential, task-identity, DATABASE_URL, socket-binding, PG override, and `CSQL_PROXY_*` gates
precede proxy spawn and the readiness allowance; disabled or invalid paths do not poll or wait.

The worker starts only after readiness. Its safe one-line result and exit are authoritative when
the proxy remains healthy and cleanup succeeds. Proxy failure during work or uncertain cleanup
cannot become success. Worker completion sends SIGTERM to the proxy, waits two seconds, then
allows a one-second SIGKILL/close bound. On external SIGTERM/SIGINT, the supervisor forwards one
SIGTERM to the worker, keeps the proxy available for the existing cooperative drain, and cleans
the proxy only after worker completion. It does not force-cancel provider or database work.

Cloud Run Job task timeout or cancellation can send SIGTERM and then platform SIGKILL after the
platform shutdown window. R2A does not claim that this window can accommodate the worker's full
cooperative budget, that an in-flight provider request cannot be interrupted, or that a final
safe JSON result is guaranteed. If the worker exits and proxy cleanup completes while the process
is alive, the supervisor preserves the worker result without proxy output. If platform SIGKILL
arrives first, no in-process fallback can be emitted and provider outcome cannot be classified
locally. Missing final output after possible provider contact is externally classified as:

```text
STOP_AND_RECONCILE_POSSIBLE_CONTACT
```

R2B must derive and behaviorally freeze a Job task timeout strictly greater than the proxy
startup allowance plus the admitted worker execution budget plus shutdown allowance. R2A does
not invent that exact timeout. A future Job definition without this combined-budget proof must
remain non-deployable.

## Reproducibility and local authority

The build fixes `linux/amd64`, both platform manifests, the root lockfile, file ownership/modes,
and `SOURCE_DATE_EPOCH`. Two independent `--no-cache` builds export OCI layouts with timestamp
rewriting and comparison-only provenance/SBOM disabled. Each build independently assembles the
exact temporary context and requires the context manifests to match.

Verification separately hashes the raw `index.json` bytes; validates its media type, annotations,
and exact ordered descriptors; selects the one Linux/AMD64 child descriptor; hashes and verifies
the raw child manifest; verifies the config descriptor and raw config bytes; and verifies every
ordered layer descriptor and raw layer digest. Additional manifest or attestation descriptors
fail closed. The loaded smoke-image identity may differ because its load/export path metadata is
not the OCI-layout comparison authority. Temporary contexts, exported root filesystems, stopped
containers, and OCI layouts are deleted after capture.

Each verifier invocation generates a collision-safe, unpredictable repository-bounded local proof
tag and proves that tag was absent before building. The explicit local image-store profile is
`DOCKER_DESKTOP_CONTAINERD_MANIFEST_ID`, established for the provider-free Docker
Desktop/containerd path rather than inferred from a version string. Under that profile the
iidfile equals `containerimage.config.digest`,
`containerimage.digest` equals `containerimage.descriptor.digest`, the local image-store ID equals
the manifest digest, and the config and manifest digests must differ. When local RepoDigests are
populated, they must contain the exact repository reference at that manifest digest. Zero or
multiple matching profiles fail closed as `LOCAL_IMAGE_STORE_IDENTITY_PROFILE_UNSUPPORTED`.

Docker inspection output is an untrusted local process boundary. The verifier measures the raw
stdout as UTF-8 before JSON parsing, then bounds repository inventory cardinality and every
retained reference before syntax validation. The machine contract freezes the operational
limits:

```json
{
  "inspectionJsonMaxBytes": 262144,
  "repoTagMaxCount": 64,
  "repoDigestMaxCount": 64,
  "repoTagMaxBytes": 512,
  "repoDigestMaxBytes": 512,
  "repositoryReferenceAggregateMaxBytes": 65536,
  "oversizedInputPolicy": "FAIL_CLOSED_WITH_BOUNDED_NON_DISCLOSING_ERROR",
  "truncationPolicy": "FORBIDDEN"
}
```

All sizes are UTF-8 bytes. These are R2A verifier operating limits rather than universal Docker
registry maxima. Oversized input fails closed with a stable non-disclosing reason; it is never
truncated, sampled, echoed, or included in an error.

Local tag ownership is the combination of the unique tag being absent before the successful
build, build-produced iidfile and metadata, and one exact profile match; no single ambiguous image
ID field is ownership authority. Orderly success and failure paths remove only the exact
per-invocation tag and verifier-owned container names before deleting temporary artifacts. A
pre-existing tag is never overwritten or removed, raw image ID deletion and broad Docker pruning
are forbidden, and cleanup failure prevents a successful verifier result. Uncatchable process
termination is outside this orderly-cleanup guarantee.

```text
LOCAL_REPRODUCIBILITY_PROOF: NOT_RELEASE_AUTHORITY
RELEASE_IMAGE_DIGEST: ABSENT
```

Publication provenance/SBOM and a registry release digest belong to a later release authority.

## Deferred authority and R2B1 supersession

R2A grants no Cloud SQL Client role, runtime identity, secret payload/version, database
user/password, Direct VPC Job attachment, Cloud Run Job, image publication, execution, target,
approval, provider contact, or trusted cloud evidence.

P3E-B2-R2B1 now defines, but does not provision, runtime identity, exact database secret-version
reference admission, and dormant Cloud Run Job Terraform. Its authority is
`infra/refund-sandbox/p3e-b2/contracts/runtime-authority-v1.json`. It consumes the unchanged R2A
image contract and does not publish the image, create a release digest, create a database secret
payload/version, apply Terraform, invoke a Job, or authorize provider contact. This R2A document
remains the immutable image and private-socket authority.

## Primary authorities

- [Cloud Run container runtime contract](https://cloud.google.com/run/docs/container-contract)
- [Cloud Run Jobs execution](https://cloud.google.com/run/docs/execute/jobs)
- [Cloud Run Direct VPC egress](https://cloud.google.com/run/docs/configuring/vpc-direct-vpc)
- [Cloud SQL Auth Proxy source and release instructions](https://github.com/GoogleCloudPlatform/cloud-sql-proxy)
- [Cloud SQL private IP connections](https://cloud.google.com/sql/docs/postgres/private-ip)
- [Node.js 22.23.1 release](https://nodejs.org/en/blog/release/v22.23.1)
- [Official Node container images](https://github.com/nodejs/docker-node)
- [Prisma system requirements](https://www.prisma.io/docs/orm/reference/system-requirements)
- [Docker reproducible builds](https://docs.docker.com/build/ci/github-actions/reproducible-builds/)
- [OCI image specification](https://github.com/opencontainers/image-spec)
