# Refund database-bootstrap image

This purpose-specific Linux AMD64 image owns only the attended P3E-B2 database bootstrap path.
Its Docker default is the read-only `check` mode. The mutating `apply` mode must be supplied
explicitly by a separately authorized manual Cloud Run Job execution.

The image contains the exact Prisma 7 CLI/schema/41-migration corpus, the existing hashed role
and grant runner, `pg`, and the pinned Cloud SQL Auth Proxy. The proxy always uses private IP,
automatic IAM database authentication, and a Unix socket. No database password, Secret Manager
reference, payment-provider credential or provider runtime is included.

The current phase may build, verify and publish this image, but must not run either database mode.
