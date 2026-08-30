# Refund database-bootstrap image

This purpose-specific Linux AMD64 image owns only the attended P3E-B2 database bootstrap path.
Its Docker default is the read-only `check` mode. The mutating `apply` mode must be supplied
explicitly by a separately authorized manual Cloud Run Job execution.

The image contains the exact Prisma 7 CLI/schema/41-migration corpus, the existing hashed role
and grant runner, `pg`, and the pinned Cloud SQL Auth Proxy. The proxy always uses private IP,
automatic IAM database authentication, and a Unix socket. No database password, Secret Manager
reference, payment-provider credential or provider runtime is included.

Proxy stdout and stderr are consumed continuously but never emitted raw. Proxy 2.22.0 runs with
`--structured-logs`; its exact `timestamp`/`severity`/`message` JSON records are parsed within the
existing 4096-byte bound. Only allowlisted startup classifications are retained and nested under
`PROXY_EARLY_EXIT`; the raw message is discarded. `--quiet` is intentionally absent because the
exact 2.22.0 command setup replaces the structured logger with plain stderr when both flags are
combined. Debug logging and connection testing remain disabled.

The safe nested classes cover exact credential initialization, SQL Admin 403/request, instance
name, and listener startup paths. Unknown or malformed output becomes
`PROXY_EARLY_EXIT_UNCLASSIFIED`. This diagnostic custody does not add connection retries or change
the 120-second local Proxy-readiness deadline, database connection behavior, migration execution,
or grant execution.

The current phase may build, verify and publish this image, but must not run either database mode.
