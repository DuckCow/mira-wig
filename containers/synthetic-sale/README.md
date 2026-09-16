# Temporary synthetic SALE runtime

This image contains only the native HTTP host, the installed browser handoff
controller closure, Prisma runtime, Cloud SQL Proxy 2.22.0, CA bundle, and the
exact temporary-service contract. It never enables IAM database authentication.

It is SANDBOX-only and must be retired, with its IAM and temporary database ACL,
before Phase B. Building or reviewing the image does not authorize publication,
deployment, provider contact, or a financial effect.
