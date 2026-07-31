# Operations Documentation

Operations documents explain supported operator workflows, diagnostics,
readiness, recovery, and rollback. They are not design or activation
authorities unless a document explicitly says otherwise.

## Runbooks

- [Manual Item Relations Operations v0.1](./manual-item-relations-operations-v0.1.md)
  — dormant curation, future activation preparation, diagnostics, and rollback
  for M2M-S1.

## Activation templates

- [Manual Item Relations Activation Record Template v0.1](./manual-item-relations-activation-template-v0.1.md)
  — dormant, default-not-activated record template for a future separately
  approved, dated M2M activation.

## Product cross-references

- [Manual Item Relations Product and Operations Adjudication v0.1](../product/manual-item-relations-product-ops-adjudication-v0.1.md)
  — adjudicates the post-merge Fable audit, records F-10 as resolved by the
  current public read, and records F-09 as a separately authorized
  preactivation source dependency.

Every feature runbook must link its governing design authority and current
source-status/as-built record. It must identify the feature contract or status
authority required for activation and rollback, and must not silently broaden
either authority.

Never place secrets, private keys, access tokens, live credentials, or approved
live environment values in a runbook.
