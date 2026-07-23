# Refund SANDBOX P3E-B provider-free Terraform root

Status: repository definitions only. No project, backend bucket, resource, image, secret version,
executor, alert channel, or runtime evidence is created by P3E-B1.

This root assumes a separately created, billing-enabled, isolated project. The backend is a partial
GCS backend: the bucket and state prefix must be supplied only in separately authorized P3E-B2.
Google provider `7.40.0` is exact-pinned. The region is fixed to `asia-northeast3`; PostgreSQL 18 is
fixed to match the audited local 18.4 server and current Cloud SQL regular support.

The network is custom-mode with Direct VPC egress, private service access, private-only Cloud SQL,
an explicit private SQL egress allow, an all-other-egress deny, no NAT, no connector, no public
database address, and no authorized network. P3E-C must create a separately reviewed provider-egress
design; this root cannot contact Toss.

Two distinct Cloud Run v2 Jobs are definitions only. `refund-sandbox-preflight` runs the provider-free
preflight with one task, parallelism one, zero retries, and a 150-second task timeout.
`refund-sandbox-canary` uses the same immutable digest but calls the existing disabled run-once CLI;
the master and all route capabilities are empty, no target or provider secret is present, and the
repository cooperative budget remains 120 seconds. No job IAM binding grants execution or override
authority. The only secrets are separate database-URL containers; no versions or payloads exist in
Terraform.

`database_roles.sql` is an unexecuted reviewed manifest. The preflight role can read only the
migration ledger and tables required by health/manual/reconciliation. The canary table grants are
derived from selector, lease, authorization, contact, result-application, and recovery call graphs.
Neither role owns the database/schema, deploys migrations, administers roles, deletes rows, or uses
sequences. B2 must review the manifest against the exact image before applying it.

The event inventory in `logging_monitoring.tf` defines ownership for execution failure, timeout,
missing final result, overlap skip, preflight failure, and configuration failure. It creates no
policy or channel. Alert delivery and observability evidence remain blocked.

If Terraform is available, the only B1 validation commands are:

```text
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
terraform test
```

Do not run plan against a real project, apply, destroy, remote-state commands, gcloud, image build,
or either job. Registry download for the exact pinned provider is the only permitted network use.
