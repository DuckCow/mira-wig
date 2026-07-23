# Retired P3E-B1 mixed Terraform root

`P3E_B1_MONOLITH: RETIRED_UNAPPLIED`

The committed P3E-B1 root mixed service activation, long-lived foundation resources, runtime
identities and IAM, database bootstrap material, observability ownership, and Cloud Run Job
definitions. It was definitions-only and was never authorized for a real provider plan or apply.
Repository history preserves that source.

P3E-B2-R1B replaces it with authority-clean roots and non-executable ownership contracts:

- `FOUNDATION_OWNER: P3E_B2_R1B_FOUNDATION`
- `RUNTIME_OWNER: DEFERRED_TO_LATER_PACKAGES`
- `STATE_MIGRATION: NOT_REQUIRED_NO_STATE_EXISTED`

This directory intentionally contains no Terraform, provider lockfile, test, tfvars example,
backend, executable script, or deployable resource. `legacy-resource-map-v1.json` is the complete
old-to-new ownership ledger.

No real B1 state or cloud resource is known or authorized. Discovery of any undisclosed real B1
state or resource is a kill condition: stop all new-root use, do not import or take over the
unknown resource, and require a new attended authority review.
