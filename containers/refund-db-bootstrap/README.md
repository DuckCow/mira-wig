# Refund database-bootstrap image

This purpose-specific Linux AMD64 image owns only the attended P3E-B2 database bootstrap path.
Its Docker default is the read-only `check` mode. The mutating `apply`,
`materialize-application-credentials`, and exact `(1,0)` partial-state
`recover-canary-application-credential` modes must be supplied explicitly by separately
authorized manual Cloud Run Job executions.

The image contains the exact Prisma 7 CLI/schema/41-migration corpus, the existing hashed role
and grant runner, `pg`, and the pinned Cloud SQL Auth Proxy. The credential mode first uses private
automatic IAM database authentication for its exact two-role password transaction, then restarts
the same Proxy without automatic IAM authentication to verify each password once over the exact
Unix socket. It publishes version 1 to only the two existing database-URL secrets through direct
metadata/version REST calls. No password, URL, verifier, payload-read authority, payment-provider
credential or provider runtime is included in the image. The recovery mode accepts preflight
version 1 only when it is enabled with an acknowledged client checksum, requires canary to have
zero versions, and then rotates, verifies, and publishes canary only. SecretVersion response names
accept only the installed project ID or project number while independently requiring the exact
secret and positive decimal version path components.

The final runtime copies the standard `/etc/ssl/certs/ca-certificates.crt` bundle from the
already-pinned official Cloud SQL Auth Proxy stage. Offline image verification requires that exact
path to be a nonempty regular file readable as UID/GID 65532. Go discovers this standard Linux
trust location without `SSL_CERT_FILE`, `SSL_CERT_DIR`, or `NODE_EXTRA_CA_CERTS`; custom roots and
TLS verification bypasses remain prohibited.

Proxy stdout and stderr are consumed continuously but never emitted raw. Proxy 2.22.0 runs with
`--structured-logs`; its exact `timestamp`/`severity`/`message` JSON records are parsed within the
existing 4096-byte bound. Only allowlisted startup classifications are retained and nested under
`PROXY_EARLY_EXIT`; the raw message is discarded. `--quiet` is intentionally absent because the
exact 2.22.0 command setup replaces the structured logger with plain stderr when both flags are
combined. Debug logging and connection testing remain disabled.

The safe nested classes cover exact credential initialization, SQL Admin 403/request, instance
name, and listener startup paths. For the pinned connector's instance-metadata request only, a
request failure may additionally emit the static phase `INSTANCE_METADATA`, the static host
`sqladmin.googleapis.com`, an exact `googleapi.Error` HTTP status, or one of the bounded transport
classes `TOKEN`, `DNS`, `CONNECT`, `TLS`, `TIMEOUT`, `RESET`, and `OTHER`. The classifier is bound
to the connector's exact metadata `GET` path and Go `url.Error` envelope. It recognizes Cloud Auth
token prefixes, Go resolver and TCP dial forms, TLS/x509 prefixes, explicit timeout/deadline text,
and reset/broken-pipe forms from the pinned dependency versions. The raw URL, query, nested error,
and structured message are discarded. `temporary` is intentionally omitted because the Proxy log
has flattened the upstream typed error signal to text.

Unknown structured startup output becomes `PROXY_EARLY_EXIT_UNCLASSIFIED`; unknown transport text
within the exact request becomes `OTHER`. This diagnostic custody does not add connection retries
or change the 120-second local Proxy-readiness deadline, database connection behavior, migration
execution, or grant execution.

Pinned safe pattern authority:

- HTTP status: the leading Proxy-pinned Google API forms `googleapi: Error NNN` and
  `googleapi: got HTTP response code NNN with body:`;
- `TOKEN`: the leading Cloud Auth forms `credentials: cannot fetch token:`,
  `credentials: invalid token JSON from metadata:`, and
  `credentials: incomplete token received from metadata`;
- `DNS`: Go's resolver form `[dial tcp:] lookup sqladmin.googleapis.com [on resolver]: reason`;
- `CONNECT`: Go's TCP dial form `dial tcp[4|6] address: connect: reason`, restricted to refused or
  unreachable/no-route reasons;
- `TLS`: leading `remote error: tls:`, allowlisted `tls:` handshake/certificate forms, or `x509:`;
- `TIMEOUT`: explicit terminal `context deadline exceeded`, `i/o timeout`, TLS handshake timeout,
  waiting-for-connection cancellation, or client header timeout text;
- `RESET`: exact read/write TCP reset or broken-pipe forms;
- `OTHER`: the request envelope is exact but none of the preceding forms matches.

The parser does not scan arbitrary text for keywords or numbers. A nested transport match is
admitted only after validating method `GET`, HTTPS, the exact host, and the exact configured
project/instance `connectSettings` path. Query parameters may be present for the pinned client but
are never retained. If that exact request envelope cannot be validated, the broader installed
request-failure class remains available but all subtype fields are withheld. The Proxy binary
pinned by image digest was built with Go 1.26.3; that compiled toolchain, rather than the module's
Go declaration, owns the standard-library `url.Error` format used here.

Source definition, build, verification, and publication do not themselves authorize a database
mode; every execution requires separate explicit human authority.
