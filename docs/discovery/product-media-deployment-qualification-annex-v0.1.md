# Product Media Deployment Qualification Annex v0.1

## Status

```text
ANNEX STATUS:
  UNPOPULATED — GOVERNED PLACEHOLDER; BLOCKED ON TARGET SELECTION

COMPANION CONTRACT:
  Product Media Contract v0.2 — Amended Draft for Independent Audit

TARGET ENVIRONMENT:
  NOT SELECTED

DEPLOYMENT EVIDENCE:
  NOT QUALIFIED

TECHNICAL SOURCE CONTRACT:
  BLOCKED

PROVIDER-SPECIFIC IMPLEMENTATION:
  BLOCKED

LEGACY OBJECT MIGRATION:
  BLOCKED

CUSTOMER ENFORCEMENT ACTIVATION:
  BLOCKED
```

This annex is the forcing function that keeps Product Media Contract v0.2's
mechanism-neutral properties honest.

It records deployment facts, selected mechanisms, acceptance evidence, and
residual risks for one named target environment. It does not own product truth,
media semantics, customer evidence policy, source schema, or activation.

An empty annex is not a qualified annex.

---

## 1. Target selection

The annex may remain unpopulated before a real target exists, but the
unpopulated state itself has governance.

```text
unpopulated-state owner:
  PLATFORM OWNER

mandatory review date:
  2026-08-31

additional review trigger:
  immediately before any technical source-contract authorization,
  whichever occurs first
```

Required target fields:

```text
target ID:
  non-secret stable project label

environment class:
  DEV / STAGING / PRODUCTION-LIKE / PRODUCTION

target owner:
  named role

target decision date:
  required

storage provider / boundary class:
  unknown until selected

database environment:
  non-secret class only

intended first customer use:
  internal / preview / public / checkout-capable

private-media co-tenancy:
  same target / separate target / not present / unknown

pre-existing legacy catalog objects:
  yes / no / unknown

data-residency / region class:
  non-secret class

retention-policy owner:
  named role

evidence review date and expiry:
  required
```

Current record:

```text
target ID:
  ABSENT

environment class:
  ABSENT

target owner:
  ABSENT

private-media co-tenancy:
  UNKNOWN

pre-existing legacy objects:
  UNKNOWN

status:
  UNPOPULATED — BLOCKED ON TARGET SELECTION
```

A local mock environment is not a deployable target. Failure to select a target
by the review date does not relax any property; it leaves target-specific source
and activation blocked and requires an explicit renewed review record.

## 2. Evidence-access gate

The annex may be populated only from read-only evidence that respects:

```text
no private-prefix enumeration;
no private object-body retrieval;
no private URL generation;
no storage mutation;
no database write;
no secret, key, principal, account, or customer identifier disclosure.
```

Required evidence capabilities are recorded as:

```text
AVAILABLE
PARTIAL
DENIED
NOT CONFIGURED
NOT APPLICABLE
```

| Evidence capability | Current status | Closing evidence |
|---|---|---|
| Bucket/storage versioning state | DENIED / target absent | Read-only target configuration evidence |
| Object immutability/lock state | DENIED / target absent | Read-only target configuration evidence |
| Default encryption | DENIED / target absent | Read-only target configuration evidence |
| CORS | DENIED / target absent | Read-only target configuration evidence |
| Public-access block/exposure | DENIED / target absent | Read-only target configuration evidence |
| Catalog-prefix-only inventory | DENIED / target absent | Prefix-scoped list/attribute evidence |
| Object identity attributes | DENIED / target absent | Version/checksum/attribute evidence |
| Effective catalog/private capability | DENIED / target absent | Sanitized ALLOWED/DENIED attestation |
| Target DB aggregate counts | NOT AVAILABLE | Explicit read-only target DB evidence |

Do not broaden permissions to turn a denial into evidence.

---

## 3. Structural privacy qualification

### 3.1 Required property

```text
The catalog-purpose storage capability must be structurally incapable of
reading, generating a view URL for, or deleting private-purpose objects.

At least one control must survive an ordinary application-layer coding error.
```

### 3.2 Candidate mechanism classes

Record each as:

```text
SUPPORTED
POSSIBLE BUT UNPROVEN
CONTRADICTED
NOT SELECTED
```

| Mechanism class | Status | Evidence |
|---|---|---|
| Separate physical storage boundary | NOT SELECTED | None |
| Separate credentials/principal with deny boundary | NOT SELECTED | None |
| Same storage with externally enforced namespace conditions | NOT SELECTED | None |
| Provider-enforced typed namespace/client | NOT SELECTED | None |
| Application service validation only | CONTRADICTED | Does not survive coding error |
| Database constraint only | CONTRADICTED | Cannot constrain arbitrary provider read/delete call |

### 3.3 Sanitized capability matrix

| Runtime capability | Catalog object | Private user-upload | Fitting result |
|---|---|---|---|
| Generate view URL / read | UNKNOWN | UNKNOWN | UNKNOWN |
| List / prefix enumerate | UNKNOWN | UNKNOWN | UNKNOWN |
| HEAD / metadata / attributes | UNKNOWN | UNKNOWN | UNKNOWN |
| Copy / move | UNKNOWN | UNKNOWN | UNKNOWN |
| Write / overwrite | UNKNOWN | UNKNOWN | UNKNOWN |
| Delete | UNKNOWN | UNKNOWN | UNKNOWN |

A capability marked `DENIED` must be externally enforced rather than merely
absent from current call sites.

### 3.4 Acceptance evidence

Required future evidence:

```text
- one externally enforced mechanism is named;
- sanitized capability evidence shows catalog capability DENIED for private
  read/view/delete;
- negative integration test demonstrates failure before provider operation or
  URL generation;
- application and DB defenses are documented as additional layers;
- mock/test backend represents the same denial semantics.
```

Current qualification:

```text
NOT QUALIFIED
```

---

## 4. Canonical object identity qualification

### 4.1 Required property

```text
After canonicalization, changing object bytes without changing the asset's
captured identity/version must be impossible or independently detectable.
```

When detection rather than prevention is selected, the annex must name the
initial, restoration, explicit, and steady-state re-verification triggers and
prove that identity mismatch:

```text
transitions the asset out of READY;
removes customer eligibility before serving;
raises an operator blocker;
is represented faithfully by the qualified test backend.
```

A captured witness that is never compared again does not qualify.

### 4.2 Candidate mechanisms

| Mechanism class | Status | Evidence |
|---|---|---|
| Captured object version ID | UNKNOWN | Target configuration unavailable |
| Conditional write + captured identity | UNKNOWN | Application does not capture identity today |
| Content-addressed canonical object | NOT SELECTED | No mechanism selected |
| Immutable copy from staging | NOT SELECTED | No mechanism selected |
| Object Lock | UNKNOWN | Configuration denied |
| Stored checksum/content digest | UNKNOWN | Inventory/attributes denied |
| UUID key alone | CONTRADICTED | Does not prevent or detect overwrite |
| Conditional write alone without durable capture | CONTRADICTED | Does not bind reads/history |

### 4.3 Acceptance evidence

```text
- canonical identity witness selected;
- application can capture and persist the witness;
- staged object cannot be mistaken for canonical READY asset;
- replacement produces a new asset/version identity;
- negative test detects overwrite or identity mismatch;
- provider/test double represents missing, replaced, and version-mismatched
  objects honestly.
```

Current qualification:

```text
NOT QUALIFIED
```

---

## 5. Upload verification backend qualification

The companion contract and later technical source contract own policy:

```text
allowed codecs
maximum accepted bytes and decoded pixels
finalize authority
quarantine semantics
intent expiry and staged-object disposition authority
```

The target supplies enforceable ceilings and capabilities against which that
policy is qualified:

```text
maximum provider/request object size
available decoder/processing runtime
staging namespace capability
canonical namespace write boundary
checksum/version/attribute capabilities
quarantine storage capability
job/timeout/retry capability
provider error and denial semantics
```

Policy must be no weaker than the target ceiling. A target ceiling does not
create policy.

### Acceptance scenario

```text
A browser PUT whose declared MIME is image/jpeg but whose bytes are not a valid
permitted image must never produce a READY canonical asset.
```

### Mock/test qualification

The test backend must represent:

```text
object absent
upload incomplete
intent expired or replayed
verification failure
identity mismatch
overwrite/version change
provider denial
delete failure
quarantine
orphan expiry
```

A mock whose `exists()` always returns true, `delete()` is a no-op, or missing
GET returns a successful placeholder is not qualified for lifecycle proof.

The annex must name the verification timeout/retry behavior supported by the
target. Until populated, this section is `NOT QUALIFIED`.

## 6. Catalog inventory and legacy-migration qualification

### 6.1 Required catalog-only aggregates

For the selected target:

```text
catalog object count
total bytes
size/time distribution
versioned object count
objects with identity/checksum evidence
current DB catalog references
historical checkout/order references
DB references absent from storage
objects unreferenced by current catalog
historical-only references
unexpected metadata/extension counts where body-free evidence exists
duplicate ETag candidates, never represented as guaranteed hashes
```

No object keys appear in the annex.

### 6.2 Current evidence

```text
LOCAL demo DB:
  10 current cover references
  0 imageKeys elements
  5 checkout snapshot cover references
  5 order snapshot cover references

DEPLOYMENT OBJECT INVENTORY:
  BLOCKED

PRODUCTION MIGRATION VOLUME:
  UNKNOWN
```

Local demo counts do not qualify deployment migration.

### 6.3 Closure conditions

```text
- target selected;
- catalog-prefix-only inventory available;
- DB/object aggregate reconciliation complete;
- legacy fallback blast radius quantified;
- missing/orphan/historical-only classes quantified;
- rollback and cutover proof can be sized from evidence.
```

Current qualification:

```text
NOT QUALIFIED
```

---

## 7. Encryption, CORS, and exposure qualification

Record:

```text
default encryption:
  UNKNOWN

public access block / equivalent:
  UNKNOWN

CORS:
  UNKNOWN

direct upload origin/method/header conditions:
  UNKNOWN

signed URL expiry policy:
  UNKNOWN FOR TARGET

read URL expiry policy:
  UNKNOWN FOR TARGET
```

Qualification must show that configuration does not contradict:

```text
private media isolation;
catalog upload intent scope;
no public bucket/object exposure;
bounded upload methods and headers;
no cross-purpose URL generation.
```

Current qualification:

```text
NOT QUALIFIED
```

---

## 8. Database and deployment ownership

The annex records target/deployment ownership only; it does not pre-select
source schema.

| Invariant | Provider/deployment requirement | Service/read-model expectation | Evidence |
|---|---|---|---|
| Catalog/private isolation | Structural deny for all private operations | Defense-in-depth; fail closed | Sanitized capabilities + negative test |
| Canonical object identity | Prevention or triggered detectable identity | Verification/finalize and version-bound read | Target identity evidence |
| Staging/canonical separation | Client cannot write canonical namespace | Atomic finalize/consume | Credential/namespace proof + replay tests |
| Rights current validity | N/A except access isolation | Time/market/use evaluation | Rights authority/source contract later |
| Legacy fallback non-readiness | No provider claim | Read model never counts fallback | Migration evidence |
| No enforcement before activation | N/A | Off-state admission parity | Activation evidence |

Exact subject identity, assignment FK, and semantic uniqueness remain technical
source-contract properties and are intentionally not qualified by this annex.

## 9. Deployment qualification status

Allowed progression:

```text
UNPOPULATED
TARGET_SELECTED
EVIDENCE_PARTIAL
MECHANISMS_PROPOSED
INDEPENDENTLY_REVIEWED
QUALIFIED
EXPIRED / NEEDS_REVIEW
```

`QUALIFIED` is conjunctive: §§3, 4, 5, 6, 7, the target-owned portions of §8,
and entry into `INDEPENDENTLY_REVIEWED` must all be satisfied for the exact
target and contract version. A per-section qualification may be recorded, but
it does not make the annex globally `QUALIFIED`.

Required qualification artifact:

```text
named target owner
independent SECURITY REVIEWER, distinct from the evidence collector

Where the same person must perform both roles, the qualification artifact must
record that fact, the reason, the approving role, and a review date. The annex
is then recorded as `QUALIFIED — SINGLE-REVIEWER` and must be re-reviewed at the
next change trigger.
contract version and annex version
sanitized evidence references
acceptance-test references
residual-risk decisions
review time and expiry
```

Initial maximum evidence age:

```text
30 calendar days from evidence collection to QUALIFIED decision
```

Any change trigger immediately sets `NEEDS_REVIEW` regardless of evidence age.
No technical source contract may claim deployment readiness until global status
is QUALIFIED.

Re-entry triggers include provider/bucket, principal/IAM/namespace, identity,
verification backend, encryption/CORS/public-access, catalog prefix,
canonicalization, or material inventory-assumption changes.

## 10. Target-decision record

Decision owner:

```text
PLATFORM OWNER
```

Decision due for review:

```text
2026-08-31, and before any technical source-contract authorization,
whichever occurs first
```

Required decisions:

```text
1. Does a real target deployment exist now?
2. Which environment is the first Product Media target?
3. Which storage boundary/provider class is intended?
4. Is the first target internal-only or customer-facing?
5. Will private/fitting media share the target?
6. Does the target already contain legacy catalog objects?
7. What data-residency/region class applies?
8. Who owns access qualification and retention policy?
9. What date must qualification complete?
```

Until answered:

```text
ANNEX:
  UNPOPULATED
SEMANTIC CONTRACT WORK:
  MAY CONTINUE
PRODUCT SPECIFICATION DESIGN:
  BLOCKED UNTIL EXTERNAL-AUTHORITY CHECK
TECHNICAL SOURCE CONTRACT:
  BLOCKED
IMPLEMENTATION / MIGRATION / CUSTOMER ENFORCEMENT:
  BLOCKED
```
