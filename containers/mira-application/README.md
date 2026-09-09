# Mira application artifact

This packages the actual Next.js application, including the existing NextAuth
admin boundary, refund authorization Server Actions and admission route. The
first intended integration environment is the existing GCP SANDBOX; the image
does not select the final production hosting platform.

The installed Next.js 16.2.7 standalone output supplies `server.js` and traced
dependencies. The final image additionally includes `.next/static`, `public`,
editorial content, the traced admin diagnostic fixture and the generated Prisma
client. It reuses the repository lockfile and the worker/bootstrap's pinned Node
22.23.1 base. No dependency upgrade, migration, bootstrap or financial command
runs at application startup. The entrypoint is `node server.js`, UID/GID 65532,
port 8080; only the Next cache needs writable storage.

## Build and retention

From a clean, committed checkout, invoke the context/build tool with an absolute
new artifact directory and an absolute synthetic build-configuration JSON file:

```sh
CHECKPOINT_DISABLE=1 node --import tsx scripts/prepare-mira-application-image.mts prepare /absolute/task/application /absolute/task/build-env.json
```

The tool admits only these build settings: `DATABASE_URL` is
`postgresql://unused@127.0.0.1:9/image_build_unused`, `NEXTAUTH_URL` is
`http://127.0.0.1:8080`, `STORAGE_PROVIDER=mock`, `PAYMENT_MODE=SANDBOX`, and
`MIRA_REFUND_AUTHORIZATION_ENABLED=DISABLED`. Each of `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET` and `NEXTAUTH_SECRET` must match
`mira-build-only-[32 lowercase hex characters]`. These are import-time dummy
values passed through an ephemeral BuildKit secret mount, never real credentials.
No host `.env` is copied. Existing `next/font` assets are fetched at build time.
Public `NEXT_PUBLIC_*` settings, if introduced later, require a rebuilt image;
runtime environment changes cannot replace public values already inlined by Next.
The existing robots and sitemap handlers explicitly run at request time so their
canonical origin, server-owned indexing gate and active-market data are not frozen
from synthetic build configuration. Their indexing and crawler rules are unchanged;
public indexing remains OFF unless separately configured and authorized.

An explicit tracked-file allowlist replaces the repository-root Docker context.
It excludes tests, hidden paths, task evidence, credentials, Git metadata,
infrastructure and migration/bootstrap inputs. `application-inputs.json` and
`context.tar` preserve the source input inventory outside the final image.
`source.json`, `build.json`, the OCI layout and reusable `image.oci.tar` preserve
source/tree, context, config, ordered layers, manifest and archive identities
before any publication. Failed builds/publications keep their records.

Actual artifact verification must produce `verified.json` only after checking
the retained archive, runtime dependency closure, network-isolated startup,
synthetic authenticated admin requests, default-OFF admission, runtime auth
configuration and absence of embedded secrets/evidence. Publication uses the
existing approved repository's distinct `mira-application` family and the exact
source tag `p3e-b2-<12-character commit>`. Inspect that exact remote reference
first; if it exists, verify it instead of pushing. The publisher accepts one
initial invocation, with a separately adjudicated same-bytes second invocation
after remote inspection and task-local authentication correction. It does not
create repositories, services or permissions. Task-specific build/publication
limits remain the authority; the command itself creates no additional authority.

## Deployment requirements (not yet live bindings)

Keep `MIRA_REFUND_AUTHORIZATION_ENABLED=DISABLED` during installation. No grant,
target payment, execution generation or live-qualified release manifest belongs
in image bytes. Unknown values below must be established in a later authorized
deployment/cutover task; this artifact does not fabricate them.

| Runtime requirement | Delivery and authority boundary |
| --- | --- |
| Application database principal and `DATABASE_URL` | Runtime secret delivery. Separate least-privilege application principal; neither migration owner nor worker role. Establish its ordinary app privileges and the exact additional authorization privileges under the installed M/ACL sequence, including effective inherited/PUBLIC access checks. No startup migration. |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Actual canonical HTTPS URL and existing OAuth callback configuration; secrets delivered at runtime. Real account creation/promotion and OAuth contact need separate authority. The three credential fields are required by current auth import/startup behavior. |
| Admission audience | Actual HTTPS app URL plus `/api/payments/refunds/reentry/admission`; must agree exactly with signed identity audience and reviewed release configuration. |
| Application service identity | Select and verify the actual application service account and only required execution-read access (`run.executions.get`) for admission. This is distinct from the worker's verified numeric service-account subject/email in the release. No cloud-key file in the image. |
| `MIRA_REFUND_REENTRY_RELEASE_FILE`, `MIRA_REFUND_REENTRY_RELEASE_SHA256` | Absolute read-only server-owned file mount, at most 64 KiB; exact bytes must match SHA-256. Deliver a reviewed manifest outside image bytes, not writable by a worker or caller. The manifest binds audience, worker subject/email, job, exact execution template/image/secret versions and account bindings. Actual execution-template readback and manifest hash remain pending. |
| Storage, mail, payment and storefront configuration | Existing server-side provider abstractions and site configuration apply. Establish the required runtime settings for enabled application features during deployment; do not infer provider/contact authority from a successful build. |

Current `DATABASE_URL` creates a Prisma adapter lazily; it does not cause a
startup DB query. The default-OFF admission handler returns before reading a
manifest, authenticating a worker or using the DB/control plane. Grant issuance
is also OFF; read/revoke keep their existing authenticated, current-DB-admin
checks. Packaging does not alter these financial or authentication semantics.

## Subsequent bounded integration

One later explicitly authorized SANDBOX task can install this exact application
digest, establish its URL/OAuth/service identity and application DB principal,
and combine the reviewed M migration and immediate worker/application ACL
sequence using the already completed bootstrap artifact. It must check effective
privileges and the exact existing worker execution template, then deliver the
reviewed server-owned release manifest. Preserve gates OFF until those bindings
and checks are complete and separate activation authority is present. That task
must name its permitted deployment, DB/IAM and any admission/grant effects; it
must reuse the completed artifacts and must not imply worker/provider execution,
payment/refund/recovery or production authority.
