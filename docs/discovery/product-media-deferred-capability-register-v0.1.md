# Product Media Deferred Capability Register v0.1

## Purpose

This register prevents phased delivery from becoming undocumented scope loss or
disposable MVP architecture.

Allowed states:

```text
REQUIRED_IN_FOUNDATION
IMPLEMENTED_DORMANT
OPERATOR_ENABLED
CUSTOMER_VISIBLE
ENFORCED
DEFERRED_WITH_SEAM
OUT_OF_SCOPE
REJECTED
```

A state describes exposure or activation, not whether the required
foundation exists. Every foundation item required by Product Media Contract
v0.2 is required in production-grade form regardless of a capability's later
state.

Every `DEFERRED_WITH_SEAM` capability must preserve its required data/authority
seam, name the next gate, and state what the current system must not claim.

| Capability | State | Foundation required now | Deferred component | Re-entry gate / proof |
|---|---|---|---|---|
| Verified upload intent/finalize | REQUIRED_IN_FOUNDATION | Intent, staging, verification, identity, READY, replay prevention | Provider-specific backend | Qualified annex + lifecycle negative tests |
| Structural catalog/private isolation | REQUIRED_IN_FOUNDATION | Typed capability boundary and fail-closed attachment | Target mechanism | Annex privacy QUALIFIED |
| Asset/assignment immutable history | REQUIRED_IN_FOUNDATION | Immutable referents and current-state history | Physical table strategy | Technical source contract |
| Rights/consent evidence and approved use | REQUIRED_IN_FOUNDATION | Evidence-bearing permission, expiry/revocation, CATALOG/MARKETING approval | Automated expiry worker | Operations/source contract + dry run |
| Manual stale/re-review | OPERATOR_ENABLED in production operator stage | Attributable event and blocker | Automatic product-spec invalidation | Product Specification dependency + tests |
| Role-based customer gallery | CUSTOMER_VISIBLE after read migration | Eligible claim read model and disclosure | Full responsive presentation refinements | Customer-read migration evidence |
| Legacy fallback observability | REQUIRED_IN_FOUNDATION | Explicit fallback state/count | Legacy retirement | Zero-dependence + cutover/rollback evidence |
| Publication readiness enforcement | IMPLEMENTED_DORMANT only when separately authorized | Readiness result and off-state parity | Activation | Enforcement contract + activation record |
| Checkout readiness enforcement | IMPLEMENTED_DORMANT only when separately authorized | Multi-seam policy and snapshots | Activation | Checkout/enforcement contract + rollback |
| Consent/right expiry automation | DEFERRED_WITH_SEAM | Expiry, owner, disposition status, evaluation | Scheduler/alerts/retries | Operations runbook + clock/job tests |
| Broken-object monitoring | DEFERRED_WITH_SEAM | BROKEN state and manual recheck | Scheduled/object event monitor | Target evidence + failure tests |
| Manual crop/derivative editor | DEFERRED_WITH_SEAM | Capture identity and derivative parentage | UI/processor | Derivative contract + evidence-role tests |
| Video/animation | DEFERRED_WITH_SEAM | Media-kind extension seam; no IMAGE reinterpretation | Processing/player | Video contract and rights policy |
| Perceptual duplicate detection | DEFERRED_WITH_SEAM | Stable asset identity; manual exclude | Similarity service | Separate source/evaluation contract |
| AI-generated marketing workflow | DEFERRED_WITH_SEAM | Generated flag, marketing approval, disclosure authority | Workflow/labeling | Legal/product-copy review + source contract |
| Image embeddings/similarity | DEFERRED_WITH_SEAM | Scoped machine-use grants, exact truth, lineage, exclusion | Embedding/vector/ranking | Separate audited contract + deployment qualification |
| Private customer media transfer to catalog | OUT_OF_SCOPE | Explicit transfer authority is intentionally absent | Entire capability | Separate privacy/product contract only |

## Rule

A later task may advance a state but may not reinterpret prior truth, rights,
consent, approval, identity, or history. A deferred capability cannot be
represented as implemented, qualified, customer-visible, or enforced merely
because its schema seam exists.
