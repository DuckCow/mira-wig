# Payment/refund canonical source convergence

Authority: `MIRA-PAYMENT-REFUND-CANONICAL-CONVERGENCE-COMPLETE-01`.
This source convergence does not authorize deployment, credentials, provider contact,
email delivery, financial effects, or historical reentry.

## Version ownership

| Track | Owners | Interpretation |
| --- | --- | --- |
| Historical main | Original target binding, custody, preparation and consumption modules; `run-eximbay-refund-canary-once-main-v1.ts` | target/v1, custody/v2 and approval/v1 retain their algorithms. The old synthetic-named environment input is custody byte identity on this track only. |
| Historical PL | `*-pl-v1.ts`, producer contract and historical issue module | PL target/v1, job/v1, approval/v1 and synthetic provenance remain distinct from main. Retained PL evidence is not new invocation authority. |
| Prospective | `eximbay-refund-canary-job-v2.ts`, `eximbay-refund-canary-fresh-sale-custody-v3.ts`, `eximbay-refund-canary-target-binding-v2.ts`, `eximbay-refund-canary-approval-v2.ts` | `job/v2 → custody/v3 → target/v2 → approval/v2`. Job identity has no target or custody input. |

The canonical canary runtime selects `eximbay-refund-canary-environment-v2.ts`
and `consume-eximbay-refund-canary-approval-v2.ts`. It does not try a historical
interpretation on failure. Custody SHA-256 and synthetic provenance use separate
`MIRA_REFUND_EXIMBAY_CANARY_CUSTODY_ARTIFACT_SHA256` and
`MIRA_REFUND_EXIMBAY_CANARY_SYNTHETIC_PROVENANCE_DIGEST` inputs.
The lane is `EXIMBAY_SANDBOX_V2`; `NO_CUSTOMER_PII_ATTESTED` must be `true`.

`prepare-eximbay-refund-canary-admission.ts` (the script) selects the prospective
preparer. It reads exact custody/v3 bytes, checks their SHA-256, inventory and
synthetic sale facts, then seals target/v2 and inserts approval/v2 in one
transaction. Approval evidence remains the exact custody hash. The separate
approval authority digest binds target, synthetic, job, account, issuer and
validity facts. The issuer must be the authenticated PostgreSQL session, not a
caller-supplied identity. Consumption rechecks authority under locks and uses
final database time in its one-use CAS.

The target producer script accepts `materialize-target-v2` with payment and
attestation arguments, or argument-free `issue-approval-v2` with the preparation
environment. Materialization creates the request and command; it does not seal a
target before custody exists. Historical producer argument parsers and result
transport remain available for regression verification, but the old CLI commands
do not select prospective issuance.

## Deployment and migration selection

`infra/refund-sandbox/p3e-b2/contracts/eximbay-canonical-deployment-v1.json`
selects exact canonical source inputs. `eximbay-canonical-v2/` contains the
prospective Terraform input interpretation. Its apply gate remains false.
Image identities retained by the source contract do not attest that newly built
bytes have been deployed. Publication and activation remain separate effects.

Historical PL deployment/image bytes are in the immutable fixture bundle with
per-file hashes and the retained PL commit. Historical main and PL image
verifiers have separate entrypoints. No verifier accepts whichever historical
hash happens to match a current path.

`canonical-migration-inventory-v1.json` records the complete prospective exact
inventory. The original accepted 48 migration files remain byte-identical; one
approval/v2 migration adds nullable version-specific facts and enforces their
immutability and issuer boundary. It extends the existing authorization lane to
consumed v2 approvals without changing v1 semantics.

`refund-authorization-cutover.ts` retains the historical 41→42 inventory.
`refund-canonical-authorization-cutover.ts` selects the exact canonical inventory
and its exact pre-v2 prefix. Neither treats a count alone as migration identity.

## Database privileges

The bootstrap owner installs the canonical refund baseline. F1–F4 are the only
callable SECURITY DEFINER exceptions: exact body, signature, language, volatility,
owner, search path and ACL are checked. The canary may read contact-proof history
for retained lifecycle checks but cannot directly INSERT into operation binding,
provider eligibility proof or contact eligibility proof tables. Toss's existing
writers retain responsibility for their facts.

PL09 SELECT/UPDATE grants are temporary deltas. Revocation preserves the main
CheckoutSession column baseline and restores the exact prior ACL. Synthetic-sale,
contacted reconciliation and readback source dependencies remain packaged without
activating any deployment gate.
