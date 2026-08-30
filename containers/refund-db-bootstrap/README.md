# Refund database-bootstrap image

This purpose-specific Linux AMD64 image owns only the attended P3E-B2 database bootstrap path.
Its Docker default is the read-only `check` mode. The mutating `apply` mode must be supplied
explicitly by a separately authorized manual Cloud Run Job execution.

The image contains the exact Prisma 7 CLI/schema/41-migration corpus, the existing hashed role
and grant runner, `pg`, and the pinned Cloud SQL Auth Proxy. The proxy always uses private IP,
automatic IAM database authentication, and a Unix socket. No database password, Secret Manager
reference, payment-provider credential or provider runtime is included.

Proxy stdout and stderr are consumed continuously but never emitted raw. The wrapper retains only
bounded byte-count metadata and emits a small, evidence-bounded failure-stage code for Proxy start,
early exit, local readiness, database connection, ledger read, ledger admission, or an otherwise
unclassified local runtime failure. This diagnostic custody does not add connection retries or
change the 120-second local Proxy-readiness deadline.

The current phase may build, verify and publish this image, but must not run either database mode.
