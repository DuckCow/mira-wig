# Retired IAM deny root

This directory is a non-executable retirement marker. The current dedicated Google Cloud project is
not attached to an organization, so organization-level IAM deny policy creation is unavailable and
is not required by the accepted trusted-operator threat model.

The former Terraform root must not be restored, initialized, planned, or applied. Its previous
failed plan SHA-256 was
`d26b446e26b41c1b88f52e530dadc2ef4ec82420b7acce87faf5e8ddd995e86b`; that plan is invalid and must
never be retried. The retired state prefix `p3e-b2/authority-guardrails` must never be reused.

Current execution safety is defined by the dormant runtime contract: no automatic trigger, zero
retries, no provider credential or target, and no provider contact. A trusted project Owner or an
explicitly authorized human may technically invoke a future Job; resistance to a malicious Owner is
outside the required assurance boundary.
