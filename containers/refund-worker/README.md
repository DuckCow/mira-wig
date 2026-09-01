# Refund worker runtime image

This directory owns only the P3E-B2-R2A local image definition and its thin TypeScript
entrypoint. The image is Linux AMD64, uses one Node supervisor, and copies one pinned Cloud SQL
Auth Proxy executable into the final Node 22.23.1 Debian slim stage.

The image has no default worker action. Its exact commands are:

- `image-self-check`
- `eximbay-canary-once`
- `eximbay-contacted-reconciliation-once`
- `sandbox-preflight`
- `worker-check`
- `worker-health`
- `worker-once`

`worker-once` preserves the existing activation and credential gates before validating Cloud Run
task identity, DATABASE_URL/socket binding, or starting the proxy. A disabled worker therefore
returns the existing `FEATURE_DISABLED` process result without starting the proxy.

The build consumes the root `package-lock.json`; TypeScript and esbuild exist only in the build
stage. The final stage contains the five ESM bundles, generated Prisma runtime, migration SQL,
Node, and the proxy binary. It has no shell, npm, TypeScript source, Terraform, credentials, or
repository history and runs as numeric user/group `65532:65532`. System roots, application code,
Prisma runtime, migrations, Node, and the proxy remain root-owned and worker-nonwritable. Only
`/cloudsql` and `/tmp/refund-worker` are owned by the runtime identity and writable.

The final runtime copies the standard `/etc/ssl/certs/ca-certificates.crt` bundle from the
already-pinned official Cloud SQL Auth Proxy stage. Offline verification requires that exact path
to be a nonempty root-owned regular file readable by `65532:65532`. Go discovers this standard
Linux trust location without `SSL_CERT_FILE` or `SSL_CERT_DIR`; custom roots and TLS verification
bypasses remain prohibited.

The normative nonsecret values are in
`infra/refund-sandbox/p3e-b2/contracts/runtime-image-connection-v1.json`. Local builds and OCI
digest comparisons are provider-free evidence only:

```text
LOCAL_REPRODUCIBILITY_PROOF: NOT_RELEASE_AUTHORITY
RELEASE_IMAGE_DIGEST: ABSENT
```

The local verifier uses one collision-safe tag per invocation, proves it was absent before the
build, and applies the explicit `DOCKER_DESKTOP_CONTAINERD_MANIFEST_ID` profile. That profile
requires the iidfile to equal the config digest, the manifest digest to equal its descriptor
digest and the local image-store ID, and the config and manifest digests to differ. Populated
RepoDigests must include the exact repository reference at the manifest digest. Unknown or
multiply matching profiles fail closed.

Docker inspection stdout is bounded as untrusted UTF-8 input before JSON parsing. The normative
R2A verifier limits are:

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

Sizes are UTF-8 bytes. These are local verifier operational limits, not universal registry
limits. Oversized inspection JSON, inventories, or references fail closed with bounded
non-disclosing errors and are never truncated.

The verifier removes only that exact invocation tag plus verifier-owned containers on orderly
success or failure. It never removes by raw image ID, overwrites a pre-existing tag, or runs a
broad Docker prune. Cleanup failure prevents verifier success.

Image publication and Cloud Run Job ownership remain outside this directory. The provider-free
preflight release uses the exact `sandbox-preflight` entrypoint; publication does not authorize
the `eximbay-canary-once` route.

`eximbay-contacted-reconciliation-once` is a private, fixed-target process entrypoint for the
single deployment-bound synthetic CONTACTED attempt. It has no positional target input, HTTP
listener, scan, retry loop, or financial-success meaning. Exit 0 means only that the installed
checkout recovery owner returned one bounded disposition; it does not mean payment success.
