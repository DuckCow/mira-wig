# Private SANDBOX installation

Owner: `p3e-b2/application` in the existing
`mira-refund-sandbox-0001-tfstate-925882331349` backend. Project, region, service
identity and immutable application/proxy images are fixed in this root.

`auth_configuration = null` prepares identities and secret envelopes without
creating a service. Supply only actual OAuth client ID and numeric secret versions
once credential creation succeeds. Secret payloads never enter Terraform.

The application stays private with IAM enforced. Initial human browser access is
`gcloud run services proxy mira-p3e-sbx-application --project=mira-refund-sandbox-0001 --region=asia-northeast3 --port=8085`.
The dedicated OAuth client uses `http://localhost:8085` and callback
`http://localhost:8085/api/auth/callback/google`. No user or ADMIN binding is made
by this root. First login and promotion need their separate explicit task.

Supply `admission_url` only from actual service creation readback, including
`/api/payments/refunds/reentry/admission`. After the existing worker owner has
installed its exact dormant Job, `worker_installed` installs the two resource-scoped
IAM bindings. Supply release version/hash only after complete worker template and
identity readback. This root always sets issuance/admission DISABLED.

`credential_materialization` temporarily grants the existing bootstrap identity
metadata and version-add access on the application DB secret only. Return it to
false after attended credential provisioning or safe-stop cleanup. It provides
no secret payload read authority.

`acl-profile.json` expands the reviewed `MIRA_REFUND_APPLICATION_ACL_PROFILE_COMPLETE`
matrices against application source `3d66ca446876788df7e7e947d6b7ec52149afa38`.
Names are physical database columns, including the three Prisma `@map` fields.
Apply only through the attended existing database-bootstrap installation owner.
All ordinary privileges are column-scoped, except CartItem DELETE and the reviewed
RefundExecutionAuthorization SELECT/INSERT. This is no migration owner and grants
nothing automatically to future objects. Exact effective metadata readback, M and
canonical authorization ACL verification remain required before service installation.

No Terraform root executes a Job, migrates, promotes an ADMIN, issues a grant or
contacts a payment provider. Every actual live plan must be inspected before apply.
