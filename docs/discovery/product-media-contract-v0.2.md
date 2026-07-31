# Product Media Contract v0.2

## Status and authority

```text
DOCUMENT STATUS:
  FROZEN v0.2 — EFFECTIVE UPON REVIEWED MERGE

PROPOSED SUPERSESSION:
  Product Media Contract v0.1

AUDITED REPOSITORY BASELINE:
  b93553a851f662e89274ab5eccef8976c230961d

SEMANTIC / PRODUCT-MEDIA PLANNING:
  FROZEN v0.2

DEPLOYMENT QUALIFICATION:
  UNPOPULATED — BLOCKED ON TARGET SELECTION

PRODUCT SPECIFICATION AUTHORITY:
  REQUIRED DEPENDENCY — NOT DESIGNED HERE

TECHNICAL SOURCE CONTRACT:
  NOT AUTHORIZED

PRISMA / MIGRATION / SOURCE IMPLEMENTATION:
  NOT AUTHORIZED

LEGACY BACKFILL OR CUTOVER:
  NOT AUTHORIZED

CUSTOMER PUBLICATION OR CHECKOUT ENFORCEMENT:
  NOT AUTHORIZED

IMAGE SIMILARITY / EMBEDDINGS / TRAINING:
  NOT AUTHORIZED

CHANGE CONTROL:
  proposed supersedes: product-media-contract-v0.1.md
  superseded-by: none
```

This contract consolidates Product Media Contract v0.1, the full Opus T1/T2/T3C/T5 audit chain, human adjudications, Codex repository reconnaissance, blocked deployment evidence, and the T5 install-blocking amendments.

It freezes properties, semantic invariants, authority boundaries, evidence
requirements, and qualification gates only. It does not select database tables,
storage providers, bucket topology, IAM policy, object-lock mechanism, checksum
mechanism, or migration volume.

Product Media Contract v0.1 remains the current merged authority until the
reviewed merge containing this exact v0.2 text. That reviewed merge is the
authority transition; no source or activation authority follows from it.

---

## 0. Definitions and changes from v0.1

### 0.1 Normative definitions

```text
MEDIA ASSET
  A durable record of file/object identity, provenance, permissions, consent,
  processing facts, edit/generation facts, and supersession.

ASSET IDENTITY WITNESS
  The provider-independent evidence that binds a Media Asset to exact canonical
  bytes or an exact immutable/versioned object identity.

ASSIGNMENT REVISION
  An immutable referent for one approved or reviewable catalog claim linking an
  asset to a catalog subject with role, view, presentation, truth,
  applicability, product-truth reference, and approval scope.

PRODUCT-TRUTH REFERENCE
  A durable reference supplied by Catalog Product Specification authority that
  permits material-change comparison for one stated subject and market scope.

MEDIA REQUIREMENT MAPPING VERSION
  The versioned Product Media policy mapping governed product facts or
  differences to required evidence claims.

COMPATIBILITY POLICY VERSION
  The versioned Product Media policy determining allowed role × view ×
  presentation × capture combinations.

MEDIA READINESS EVALUATION
  A derived result over exact product-truth, mapping, compatibility, asset,
  assignment, permission, applicability, market, use, and time inputs. It owns
  no product facts and grants no activation authority.

APPROVED USE
  The use scope for which an assignment revision has been editorially reviewed,
  such as CATALOG or MARKETING. Approved use is distinct from legal permission:
  legal rights permit a use; approved use records review for that use.

LEGACY COMPATIBILITY WINDOW
  The explicitly bounded period ending at the recorded
  `LEGACY_MEDIA_CUSTOMER_READ_CUTOVER` event. Legacy display is forbidden after
  that event except for separately governed historical snapshots.

DEPLOYMENT QUALIFICATION ANNEX
  The target-specific evidence artifact qualifying deployment mechanisms. It
  does not select product semantics or create source/activation authority.
```

Normative owners:

```text
Catalog Product Specification authority:
  product truth, material change, truth-reference scope and propagation

Product Media Mapping authority:
  media requirement mapping, compatibility policy, capture policy

Media Readiness evaluation semantics:
  fail-closed evaluation rules; implemented by source, with customer effects
  owned only by separate activation authority

Deployment qualification authority:
  target facts and evidence that chosen mechanisms satisfy frozen properties
```

### 0.2 Changes from Product Media Contract v0.1

#### Retained

```text
Media Asset + Media Assignment separation
Style and Variant as catalog subjects
independent role / view / presentation / truth axes
rights and consent default-deny
approved-use distinct from permission
immutable approved meaning and supersession history
hero as editorial selection rather than evidence role
explicit representative disclosure
mannequin-led/on-head evidence requirement
legacy fields as non-semantic compatibility storage
private fitting/consultation media outside catalog authority
machine-use exclude-only override direction
source installation separated from customer enforcement and activation
```

#### Revised

| v0.1 area | v0.2 amendment | Reason / accepting authority |
|---|---|---|
| One broad media contract | Product Specification, Product Media Mapping, readiness semantics, and Deployment Qualification are separated | T1/T2/recon/T3C human adjudication |
| Upload key stored directly | Upload intent → staged object → server verification → canonical READY asset | T1 and repository reconnaissance |
| Generic representative inheritance | Explicit variant assignment or explicit applicability only | T2 adversarial review and human adjudication |
| One lifecycle ladder | Processing, permission, assignment revision, operational current state, and transition history remain separate | v0.1 MED-D06 retained and technically clarified |
| Legacy fallback | Bounded compatibility window; never readiness evidence; zero dependence before enforcement | T1/T2/recon findings |
| Readiness and enforcement | Readiness is derived independently; activation controls customer-admission effects | T5 F-2 amendment |
| Mechanism-neutral claims | Listed claims require acceptance scenarios, owners, closure evidence, and named gates; body clauses remain binding even when absent from the matrix | T3C honesty test as corrected by T5 |

#### Restored after independent v0.2 audit
Baseline for this block: the v0.2 original draft, not v0.1.

| Restored protection | v0.1 / adjudicated source | Reason | Accepting authority |
|---|---|---|---|
| At least one on-head silhouette using `MANNEQUIN` or `HUMAN_MODEL` | v0.1 §8.1 / MED-D11 | T5 F-1; on-head shape is a primary purchased fact | PROJECT OWNER, recorded by Product Media human adjudication |
| `CATALOG` / `MARKETING` approved-use axis | v0.1 §5.5 / MED-D06 | T5 F-1; editorial approval scope is distinct from legal permission | PROJECT OWNER, recorded by Product Media human adjudication |
| Machine-use manual override may exclude but never include past mandatory deny predicates | v0.1 §13 and T1/T2 audit chain | T5 F-1; machine-use metadata must fail closed | PROJECT OWNER, recorded by Product Media human adjudication |
| Revoked/expired media becomes non-public-servable without an implicit override | T2 revocation adjudication | T5 F-1; serving eligibility must terminate immediately | PROJECT OWNER, recorded by Product Media human adjudication |
| Absence of a time-bounded disposition decision is itself an operator blocker | T2 human adjudication | T5 F-1; no silent indefinite retention | PROJECT OWNER, recorded by Product Media human adjudication |

The `Retained`, `Revised`, and `Removed` blocks are stated against Product Media
Contract v0.1. This `Restored` block records the delta from the v0.2 original
draft to this human-amended candidate.

#### Removed

```text
No adjudicated v0.1 protection is deliberately removed by this amendment.
Any later removal requires an explicit delta, rationale, and accepting authority.
```

## 1. Objective

The product-media system must provide durable, inspectable customer evidence
for `WigStyle` and `WigVariant` while preventing:

```text
unverified storage keys from becoming product truth;
private fitting/customer media from entering catalog surfaces;
style-level imagery from silently claiming exact variant truth;
rights or consent failures from passing customer eligibility;
cropped or resized images from manufacturing new evidence claims;
legacy cover images from satisfying readiness;
product changes from leaving stale approved media silently eligible;
source installation from activating publication or checkout enforcement;
future machine-use metadata from becoming present machine-use authority.
```

The contract must remain implementable against an eventual named deployment,
but it does not wait indefinitely for a deployment target in order to freeze
provider-independent properties.

---

## 2. Authority decomposition

### 2.1 Catalog Product Specification authority

Product Media does not own the facts of the product and does not prescribe the
persistence mechanism supplying them.

Before designing a new Product Specification authority, the business must first
answer whether an external authority already exists, including a PIM, supplier
feed, governed manufacturing master, or operational process with real change
authority.

The project owner has recorded:

```text
EXTERNAL PRODUCT-TRUTH AUTHORITY:
  NO KNOWN EXTERNAL AUTHORITY

DECISION EFFECT:
  a bounded internal Catalog Product Specification dependency must be designed
  after this contract completes documentation conformance and reviewed install
```

This decision may be reopened only if a real external authority is later
identified. Discovery of an external authority changes the next task from new
authority design to integration/gap-closure design; it does not silently replace
this record.

The Catalog Product Specification dependency interface must have these
capabilities:

```text
1. GOVERNED TRUTH REFERENCE
   For each catalog subject and market in scope, given a previously recorded
   reference, it is decidable whether governed product facts materially changed
   after that reference, and a media approval can be durably bound to it.

   The reference advances only on APPROVED AND EFFECTIVE product truth.
   Drafts and proposals do not advance it.

   The interface states whether references are style-scoped, variant-scoped, or
   both, and how style-wide changes propagate to variants.

2. MATERIAL-DIFFERENCE DECLARATION
   Per variant and market where applicable, a versioned and attributable
   declaration in product-neutral vocabulary, with a versioned vocabulary and
   explicit behavior for an unrecognized category.

3. CHANGE-AUTHORITY RECORD
   Actor, time, basis, superseded prior reference, and change type, at minimum:
     SPECIFICATION_CORRECTION
     PRODUCT_CHANGE

   A correction and a physical change have different media-staleness effects
   and must not be conflated.
```

A monotonic version, content digest over governed facts, or durable change-event
position may satisfy the interface. Product Media Contract v0.2 does not design
the general catalog schema or manufacturing specification that supplies it.

Repository absence is confirmed at the audited baseline. The external-authority
business check is an immediate parallel decision and must complete before any
new Product Specification design begins.

### 2.2 Product Media mapping authority

Product Media owns two distinct versioned policies:

```text
MEDIA REQUIREMENT MAPPING VERSION
  maps governed product facts/material differences to required evidence claims

COMPATIBILITY POLICY VERSION
  determines permitted role × view × presentation × capture combinations
```

It may answer:

```text
Given product-truth reference P, mapping version M, compatibility version C,
subject S, market K, and use U, which exact evidence claims are required and
which combinations may satisfy them?
```

It may not answer:

```text
What is the actual product?
Did the physical product change?
Which product difference is materially true?
```

`Media requirement mapping` is the single normative artifact name. The term
`profile` is not used as a separate authority. A generated per-variant view of a
mapping is derived output, not product truth or staleness authority.

### 2.3 Media readiness evaluation semantics

Media readiness is a derived computation, not an independent fact-owning
organization.

It evaluates one exact combination of:

```text
catalog subject
market and requested use
product-truth reference
media requirement mapping version
compatibility policy version
asset identity/state
assignment revision and approved use
rights/consent validity
variant applicability
capture identity/lineage
evaluation time
```

Missing required authority yields `ADVISORY_INCOMPLETE` before customer
enforcement activation and fails closed after the relevant gate is activated.
Readiness source alone may never change customer publication or checkout.

### 2.4 Deployment qualification authority

Deployment-specific facts are owned by a separate Deployment Qualification
Annex.

The annex determines whether the named deployment can satisfy this contract's
provider-independent properties. It does not redefine product truth, media
semantics, customer gates, or rights policy.

---

## 3. Canonical semantic architecture

The canonical architecture remains:

```text
MEDIA ASSET
  immutable file/object identity and file-level evidence

MEDIA ASSIGNMENT REVISION
  immutable catalog meaning for one subject and one evidence claim

CURRENT ASSIGNMENT POINTER / STATUS
  which revision is current for operational use

HERO SELECTION
  surface-specific preference over an eligible assignment revision

RIGHTS / CONSENT GRANT AND EVIDENCE
  permission authority distinct from product-truth verification

PRODUCT-TRUTH VERIFICATION
  evidence that a media claim is true for one subject and product reference

MEDIA REQUIREMENT MAPPING
  required claims for one governed product reference/policy version

ELIGIBILITY READ MODEL
  derived present-time decision over all authorities

TRANSITION / DECISION HISTORY
  recorded cause, actor, time, and evidence for material state transitions
```

The contract freezes the separation of these meanings, not a table layout.

One asset may support multiple assignment revisions. Each claim must be
independently attributable and reviewed.

---

## 4. Catalog subjects and referential integrity

Launch catalog subjects are:

```text
WigStyle
WigVariant
```

Each assignment revision targets exactly one canonical catalog subject.

The technical source contract must later compare and choose a referential
strategy that gives database-enforced subject integrity. This contract does not
choose among:

```text
nullable style/variant foreign keys with an XOR constraint;
separate style and variant assignment relations;
a catalog-media-subject supertype;
another demonstrably safer repository-compatible strategy.
```

No implementation may use an unconstrained `subjectType + subjectId` pair as
the sole referential authority.

Deletion and deactivation semantics must preserve historical evidence while
preventing orphaned current assignments.

---

## 5. Media Asset authority

### 5.1 Stable identity

A canonical asset must preserve:

```text
stable asset ID
storage authority / namespace identity
canonical object reference
verified byte or content identity witness
verified media kind
processing/verification state
generation and edit facts
provenance
supersession or purge evidence
```

A storage key string alone is not an asset.

### 5.2 Object immutability property

After an asset becomes canonical, an ordinary application operation must not be
able to replace its bytes while retaining the same canonical identity.

A mechanism may prevent replacement or independently detect an identity change.
When detection rather than prevention is selected, re-comparison must occur at
named triggers, at minimum:

```text
before the asset first becomes assignable;
on any explicit re-verification event;
before restoring an asset from a non-READY state;
at the qualified steady-state trigger recorded in the Deployment Qualification
Annex, such as a provider event, scheduled comparison, or serving-time
version/witness check.
```

If prevention is selected and independently qualified, the annex may record that
provider/credential immutability replaces periodic steady-state comparison. It
must still prove that an ordinary application operation cannot replace canonical
bytes under the same identity.

A detected identity mismatch immediately transitions the asset out of READY,
removes customer eligibility, and raises an operator blocker. A witness that is
recorded but never re-compared does not satisfy this property.

The application must bind reads and history to the selected identity witness.
Storage versioning that exists but is not captured by the application does not
satisfy the property.

### 5.3 Media kind

The first authorized media kind remains:

```text
IMAGE
```

Video, animation, and other kinds require a new versioned task.

A diagram stored in an image file is `IMAGE` with presentation subject
`DIAGRAM`; it does not create a separate first-launch media kind.

### 5.4 Provenance

Required provenance vocabulary:

```text
IN_HOUSE
SUPPLIER
LICENSED
GENERATED
UNKNOWN
```

Customer/fitting sources are not a launch catalog provenance option. A later
explicit transfer process would require separate privacy, consent, rights,
retention, and deletion authority.

`UNKNOWN` cannot satisfy customer eligibility.

### 5.5 Processing states

The semantic lifecycle must distinguish at least:

```text
UPLOAD_INTENT
STAGED
VERIFYING
READY
FAILED
QUARANTINED
BROKEN
PURGED
```

Equivalent technical representations are allowed only when they preserve the
same safety distinctions.

`READY` means, and means only, that server-side verification under §6 completed
successfully for an unexpired, unconsumed upload intent and bound a canonical
identity witness.

Issuing a URL, receiving browser PUT success, saving a key, observing a prefix,
or receiving an always-success mock result cannot establish READY.

## 6. Verified upload lifecycle

The minimum lifecycle is:

```text
1. UPLOAD INTENT
   expected owner/subject scope, purpose, declared type, byte/dimension bounds,
   expiry, and optional expected digest.

2. STAGED OBJECT
   client uploads only to the intent-authorized staging target.

3. FINALIZE REQUEST
   client or worker reports completion without granting trust.

4. SERVER VERIFICATION
   verify the intent is unexpired and unconsumed; object existence; authorized
   namespace; actual codec and decodability; byte size; decoded dimensions;
   decompression bounds; identity/checksum/version evidence; and required
   edit/generation declarations.

5. ATOMIC CONSUMPTION AND CANONICALIZATION
   successful verification consumes the intent exactly once and produces/binds
   one canonical object and identity witness.

6. REVIEW / ASSIGNMENT
   only a READY canonical asset may enter an approvable assignment revision.

7. EXPIRY / DISPOSITION
   abandoned intents and staged objects remain non-public and enter a named,
   time-bounded disposition process even when no canonical asset was created.
```

Frozen structural property:

```text
A client credential must never be able to write to the canonical namespace.
Canonical objects are produced only by server-side operations after successful
verification.
```

Object purge, quarantine, or cleanup requires a named authority and evidence;
this contract does not activate a cleanup worker.

### Mechanism-neutral acceptance scenario

```text
Given an absent, invalid, replaced, or unverified staged object, finalize cannot
consume the intent, cannot create READY, cannot create an eligible assignment,
and cannot produce a public Product Media URL.
```

### Qualification gate

The Deployment Qualification Annex must name the actual verification backend,
identity mechanism, staging/canonical boundary, target ceilings, and a test
backend that faithfully represents absence, failure, overwrite, deletion,
quarantine, and intent replay.

Until the test backend is qualified, the lifecycle property is frozen but
unproven and no claim of satisfaction may be made.

## 7. Structural catalog/private-media isolation

### 7.1 Frozen property

A catalog-purpose storage capability must be structurally incapable of using a
private-purpose reference for any provider/storage operation, including:

```text
view-URL generation
read / fetch
list or prefix enumeration
HEAD / existence / metadata or attribute lookup
copy
write / overwrite
move
retag or metadata mutation
delete
```

Failure must occur before provider operation or URL generation.

At least one control must survive an ordinary application-layer coding error.
Application validation and database constraints remain mandatory
 defense-in-depth but cannot be the sole structural control.

### 7.2 Mechanism neutrality

This contract does not select:

```text
separate buckets;
same bucket with separate credentials and enforced prefix conditions;
separate provider clients with externally enforced namespaces;
another equivalent physical or credential boundary.
```

The annex must identify and test the deployed mechanism.

### 7.3 Catalog-key attachment

A catalog asset record must not accept an arbitrary storage key string as its
storage authority.

The later source contract must bind the asset to a catalog-purpose namespace or
provider identity that cannot represent private fitting/customer objects.

### Mechanism-neutral acceptance scenario

A future failing test must demonstrate:

```text
Given a syntactically valid private-purpose object reference,
the catalog-purpose storage capability fails before a public URL, read, or
delete operation can occur.
```

### Qualification gate

The annex must show which externally enforced control closes the property and
provide sanitized evidence that catalog runtime read/delete capability is
denied for private-purpose classes.

---

## 8. Rights, consent, use, and product-truth verification

### 8.1 Permission is evidence-bearing

Unstated permission is denied.

Permission must not be represented solely as an asset-level scalar boolean.

The semantic authority must support:

```text
grant or consent identity
rights/consent category
permitted use
market or territorial scope
valid-from and expiry/review time
grantor/subject where applicable
evidence reference
revocation or withdrawal
decision actor and reviewer
supersession/history
```

Human-subject consent and copyright/license permission are distinct authorities.

One grant may cover multiple assets; one asset may depend on multiple grants.

### 8.2 Assignment-level product truth

Rights permission does not prove that an image depicts the assigned product.

Product-truth verification must bind:

```text
asset identity
assignment revision
catalog subject
claimed role/view/presentation
truth status
product-truth reference
verification actor/reviewer
verification evidence and time
```

Supplier media may be rights-cleared but unverified for a product. Such media
does not satisfy customer evidence.

### 8.3 Revocation and byte disposition

For catalog product surfaces, revocation, expiry, withdrawal, or invalidated
consent immediately removes current eligibility at read time and makes the
object non-public-servable.

A named authority must make a time-bounded, evidenced disposition decision:

```text
PURGE
QUARANTINE
RESTRICTED_LAWFUL_RETENTION
```

Absence of a recorded decision is itself an operator blocker and may not become
silent indefinite retention. The duty also applies to abandoned staged objects
that never became canonical.

Where lawful, non-sensitive decision metadata and history remain preserved.
`PURGE` requires verifiable deletion evidence.

Historical checkout/order snapshot behavior is governed separately under
§17.2 and may not be inferred from current catalog serving rules.

### 8.4 Market scope

Customer eligibility is evaluated for the requested market and use. A grant
valid in one market must not silently satisfy another market.

---

### 8.5 Approved use is distinct from permission

Rights/consent grants define what use is legally or contractually permitted.
Assignment approval scope defines what use has been editorially reviewed.

```text
initial approved-use vocabulary:
  CATALOG
  MARKETING
```

Customer eligibility requires both a valid permission grant and an assignment
revision approved for the requested use. Approval cannot expand permission.

## 9. Assignment revisions and semantic history

### 9.1 Immutable approved meaning

A material semantic change must not rewrite previously approved meaning in
place.

The frozen property is:

```text
Every approval, hero selection, readiness result, disclosure decision, and
historical audit reference must bind to an immutable semantic referent.
A later semantic change creates a new referent; it never mutates what the prior
approval meant.
```

Material meaning includes subject, asset identity witness, role, view,
presentation, truth status, approved use, product-truth reference, mapping and
compatibility versions, variant applicability, and claim-relevant capture or
derivative identity.

The technical source contract may realize the property using immutable
assignment revisions, approval snapshots, an append-only event model, or an
equivalent structure. This contract does not freeze a table mechanism.

### 9.2 Current state and transition history

Current eligibility is derived from current authoritative inputs.

Material transitions are recorded with:

```text
cause
trigger
actor
time
evidence
prior and resulting references
```

A generic mutable `stalenessReason` field is not mandatory if cause and history
remain deterministic and auditable.

Until product-spec change authority exists, manual stale/re-review decisions
must be representable and attributable. They cannot authorize automatic
checkout enforcement.

### 9.3 Duplicate and identity rules

This contract does not freeze a uniqueness key such as
`(asset, subject, role)`.

The source contract must nevertheless guarantee:

```text
no ambiguous current claim for one semantic scope;
no readiness double-counting across revisions;
deterministic assignment ordering;
no two active hero selections for one hero scope;
historical revisions remain referentially stable.
```

---

## 10. Role, view, presentation, and truth axes

### 10.1 Roles

Launch role vocabulary:

```text
SILHOUETTE
HAIRLINE
PARTING
TEXTURE
COLOR
BASE_INTERIOR
ATTACHMENT
SCALE
INCLUDED_ITEMS
PACKAGING
CARE
```

`HERO`, `FRONT`, `SIDE`, and `BACK` are not roles.

### 10.2 View / framing

```text
FRONT
LEFT
RIGHT
BACK
TOP
INTERIOR
MACRO
DETAIL
HEAD_AND_SHOULDERS
FULL_BODY
```

### 10.3 Presentation subject

```text
PRODUCT_ONLY
MANNEQUIN
HUMAN_MODEL
DIAGRAM
SWATCH
PACKAGING
```

Customer/private-person presentation is not authorized for launch catalog use.

### 10.4 Truth status

```text
EXACT_FOR_SUBJECT
REPRESENTATIVE
ILLUSTRATIVE
```

Truth is assignment-claim-specific. One asset can be exact for one claim and
ineligible for another.

### 10.5 Compatibility matrix

Independent axes do not permit every cross-product.

The Product Media Mapping authority owns a versioned
`COMPATIBILITY_POLICY_VERSION` classifying role × view × presentation × capture
combinations as:

```text
ALLOWED
ALLOWED_WITH_REVIEW
FORBIDDEN
```

Unknown combinations fail closed. Readiness binds to the exact compatibility
policy version. The source contract must later define deterministic write and
read validation plus versioned tests.

## 11. Explicit variant applicability

A style assignment must not automatically become customer-visible on every
variant.

Variant rendering requires an immutable explicit variant assignment revision
or an attributable, versioned applicability record. Bulk authoring may create
many explicit records but must preserve actor, review, and scope.

A style claim cannot satisfy an exact variant requirement unless explicit
subject/applicability and truth verification establish it.

Generic derived fallback is forbidden except during the
`LEGACY COMPATIBILITY WINDOW`, which ends at the recorded
`LEGACY_MEDIA_CUSTOMER_READ_CUTOVER` event. Legacy display never satisfies
readiness and is forbidden after the cutover event except for separately
governed historical snapshots.

## 12. Capture provenance, derivatives, and evidence diversity

### 12.1 Capture identity

Every evidence-bearing assignment must consume a capture-identity declaration:

```text
capture identity class:
  INDEPENDENT_PHYSICAL_CAPTURE
  DERIVATIVE_OF
  SURFACE_RENDITION_OF
  GENERATED
  UNKNOWN

required declaration facts where applicable:
  parent asset / capture reference
  physical capture session or independently attributable capture reference
  camera/view class
  physical product configuration class
  declared transformation/edit class
  declaring actor and evidence reference
```

`UNKNOWN`, `DERIVATIVE_OF`, or `SURFACE_RENDITION_OF` cannot satisfy a role
whose compatibility policy requires a distinct physical capture.

A presentation crop, resize, or upscaling cannot manufacture a new evidence
role.

### 12.2 Derivative lineage

When derivatives later exist, they must preserve:

```text
parent asset identity
transform/crop parameters
creation actor/process
truth-affecting edit flags
rights inheritance or restriction
review status
```

Manual crop tooling is not authorized in the first source slice.

### 12.3 Physical capture compatibility

The following minimum rules are frozen:

```text
SILHOUETTE FRONT, SIDE, BACK:
  require distinct camera positions.

TEXTURE MACRO:
  requires a genuine close-range capture;
  a crop or upscale from a wide silhouette frame cannot satisfy it.

BASE_INTERIOR:
  requires a distinct physical configuration exposing the interior.

HAIRLINE / PARTING:
  require sufficiently close original framing;
  a crop from a wide silhouette frame cannot satisfy them unless a future
  governed resolution/framing standard explicitly proves adequacy.

COLOR:
  cannot satisfy an exact gate until color-truth governance is separately
  defined.
```

One asset may support multiple claims only when the compatibility policy
permits the physical capture to establish each claim and each assignment is
independently reviewed.

No arbitrary minimum file count is frozen.

---

## 13. Hero selection

Hero is a surface-specific editorial preference over an eligible assignment
revision.

It is not a role and grants no truth.

Hero semantics must define:

```text
catalog subject
surface
selected assignment revision
uniqueness scope
concurrent update behavior
ineligibility fallback
operator blocker
```

Possible surfaces include:

```text
LISTING
PDP
future comparison
```

The first implementation may share listing/PDP selection only when the shared
scope is explicit and reversible.

An ineligible hero must never make an ineligible claim eligible. Customer reads
must resolve to another eligible candidate or an honest empty state.

---

## 14. Current eligibility

Eligibility and enforcement are separate computations.

### 14.1 Evidence-claim eligibility

An assignment revision is eligible for the requested market, use, and surface
only when:

```text
asset state is READY;
immutable asset identity witness is valid under required verification triggers;
assignment revision is approved, operationally current, and approved for use;
catalog subject is eligible for the requested surface;
product-truth reference is present and current where the claim requires it;
requirement mapping and compatibility versions are present and recognized;
assignment-level truth verification is current;
rights and consent cover market/use/time;
role/view/presentation/capture combination is allowed;
edit/generation policy permits the claim;
variant applicability is explicit for variant rendering;
legacy fallback is not counted as evidence or readiness.
```

Any transition out of READY immediately removes eligibility.

### 14.2 Readiness

Readiness evaluates whether the eligible claim set satisfies the exact mapping
for the exact product-truth, compatibility, market, use, and time references.
Missing required authority produces `ADVISORY_INCOMPLETE` before enforcement and
fails closed after enforcement activation.

### 14.3 Customer-admission effect

Activation is not an eligibility predicate. A separate activation authority
decides whether readiness affects listing, PDP, relation, cart, checkout,
payment, or completion admission. Installing eligibility/readiness source while
activation is off must preserve byte-identical customer admission behavior.

### 14.4 Cache safety

Caching may delay an allow becoming visible; it must never delay a deny.
Revocation, expiry, supersession, identity mismatch, transition out of READY, or
other deny-direction changes must be re-evaluated or invalidated before serving.
A cache cannot convert a current deny into an allow.

## 15. Media requirement mapping and coverage

### 15.1 Mapping inputs

A requirement mapping consumes:

```text
catalog subject
versioned product-truth reference
versioned product-neutral material differences
media-policy version
market/use where relevant
```

It produces required evidence claims in Product Media vocabulary.

### 15.2 Mapping is not product truth

Changing from base X to base Y may leave the same required role
`BASE_INTERIOR`. Therefore the mapping version alone cannot detect product
truth change.

Readiness binds to both the product-truth reference and the mapping version.

### 15.3 Missing authority behavior

Before customer enforcement activation:

```text
missing product-truth reference, mapping version, compatibility version, or
required explicit applicability:
  ADVISORY_INCOMPLETE
  no checkout/publication effect
```

After a relevant gate is explicitly activated, the same absence fails closed.

A governed material-difference category present in product truth but
unrecognized by the current mapping version is `UNMAPPED_REQUIREMENT`.
Before activation it is advisory/incomplete; after activation it fails closed.
It may never be interpreted as imposing no requirement.

### 15.4 Proposed future style publication floor

The following is proposed evidence policy, not activated behavior:

```text
one eligible hero
SILHOUETTE FRONT
SILHOUETTE LEFT or RIGHT
SILHOUETTE BACK
HAIRLINE close evidence
PARTING close evidence when governed product truth declares a visible/material
  parting; otherwise an explicit governed N/A decision
TEXTURE MACRO
BASE_INTERIOR
```

At least one silhouette claim must use `MANNEQUIN` or `HUMAN_MODEL` and show
on-head shape. Mannequin is the default evidence core; human-model imagery may
supplement it when rights/consent permit.

Each claim must satisfy capture compatibility. FRONT, SIDE, and BACK require
distinct camera positions; TEXTURE MACRO requires a genuine close capture;
BASE_INTERIOR requires an interior-exposing physical configuration.

### 15.5 Proposed future variant checkout floor

Every activated variant floor requires a governed mapping derived from product
truth.

Candidate mapping outcomes include exact claims for:

```text
COLOR
SILHOUETTE
TEXTURE
BASE_INTERIOR
ATTACHMENT
HAIRLINE
PARTING
DENSITY / FULLNESS where policy later introduces the role or maps it to an
existing evidence claim
```

`COLOR` remains a proposed universal policy. It is not enforceable until
governed color truth, calibration/correction, swatch, and disclosure rules are
defined.

Representative or illustrative media cannot satisfy an exact requirement.

---

## 16. Customer presentation and disclosure

Resolution is surface-specific.

### 16.1 Style surfaces

```text
1. eligible style assignment/hero for the exact surface;
2. eligible governed style evidence ordered by role;
3. legacy style cover only during the LEGACY COMPATIBILITY WINDOW, visibly
   unclassified and never readiness evidence;
4. honest empty/preparing state.
```

### 16.2 Variant surfaces

```text
1. eligible explicit variant assignment;
2. eligible explicit variant applicability claim;
3. eligible style-level non-exact contextual media only when explicitly
   applicable and disclosed;
4. legacy compatibility display only during the bounded window;
5. honest empty/preparing state.
```

Representative media requires generated disclosure near the media and variant
selection. Exact Korean wording remains a later product-copy/legal-review task.
No placeholder may masquerade as evidence.

## 17. Legacy compatibility and migration

Current legacy fields:

```text
WigStyle.coverImageKey
WigStyle.imageKeys[]
```

remain display storage, not semantic authority.

### 17.1 Legacy rules

```text
legacy order, filename, prefix, and cover status do not establish role, truth,
rights, subject applicability, approved use, or readiness;

legacy cover may remain customer-visible only during the bounded LEGACY
COMPATIBILITY WINDOW;

legacy fallback use must be separately observable;

legacy media never satisfies readiness;

affected customer paths must have zero legacy-fallback dependence before
publication or checkout enforcement activates;

legacy display ends at the recorded `LEGACY_MEDIA_CUSTOMER_READ_CUTOVER`
event;

the MIGRATION OWNER records that event with target/surface scope, author,
reviewer, time, zero-dependence evidence, rollback evidence, and the contract
and source versions in force;

legacy data/readers are not removed until rollback and behavioral evidence
exist.
```

### 17.2 Snapshot history

Checkout and order snapshots may retain historical legacy cover references.

A later product decision must define:

```text
whether historical snapshots preserve the original display reference;
what happens when rights or consent later revoke customer serving;
whether a historical snapshot resolves to a quarantined/removed asset;
session-time versus completion-time eligibility.
```

This contract does not authorize retroactive snapshot mutation.

### 17.3 Migration phase requirement

A later technical source contract must define reversible phases for:

```text
new foundation
legacy writer compatibility
legacy reference inventory
unclassified import
new read models
fallback observability
review/backfill
customer cutover
rollback
legacy retirement
orphan cleanup
```

Actual phase sizing remains blocked on the Deployment Qualification Annex and
real catalog inventory.

---

## 18. Enforcement boundaries

The repository has several distinct current eligibility/admission seams:

```text
listing and search
direct PDP
related-style cards
cart admission
checkout-session creation
payment initiation
order finalization
historical order/refund snapshot rendering
cache/revalidation
```

Product Media enforcement must not be represented as one universal insertion
point.

### 18.1 Source versus activation

The sequence remains:

```text
readiness computation
admin blockers/warnings
customer enforcement source
activation record
customer enforcement active
```

Readiness computation and admin display may not silently alter customer reads
or checkout.

### 18.2 Required later product decisions

Before enforcement design:

```text
which eligibility is frozen at checkout-session submission;
which conditions are revalidated at payment initiation;
which conditions are revalidated at order finalization;
which post-session changes cancel, pause, or preserve a submitted session;
how revocation affects historical snapshots;
which public surfaces require identical publication predicates.
```

### 18.3 Existing out-of-track defects

The single normative inventory is:

```text
Live Media-Adjacent Security and Catalog Defect Register v0.2
```

That register currently contains `LBD-01` through `LBD-07`, including the
inconsistent style-market publication predicates across public surfaces.

These defects are recorded but not silently absorbed into Product Media
implementation. Each requires separate bounded authority or explicit,
named-owner risk acceptance with review date. The Product Media contract must
cross-reference the register rather than maintain a second partial enumeration.


---

## 19. Generated, edited, and machine-use policy

### 19.1 Generated and simulated media

At launch:

```text
AI-generated media:
  not factual PDP evidence
  not media-readiness evidence
  not future similarity-eligible

virtual try-on:
  remains under fitting authority
  not catalog evidence

diagram:
  customer-visible only as ILLUSTRATIVE
```

Marketing use requires separate approval and legally reviewed disclosure.

### 19.2 Edit effects

Shape/beauty edits that alter the claimed fact disqualify the claim.

Background edits may be eligible only when product pixels and the claimed fact
are unchanged and the edit is recorded.

Color-adjusted media cannot satisfy exact COLOR truth until a governed
calibration process exists.

### 19.3 Machine-use grants

Machine-use permission is scoped and evidence-bearing:

```text
machineUseCategory
state:
  UNKNOWN
  DENIED
  GRANTED_WITH_EVIDENCE
evidence reference
scope / market / time where relevant
```

Absence fails closed.

A manual override may exclude an otherwise eligible asset from machine use. It
may never include an asset past denied/absent rights, invalid consent,
ineligible truth, generated/simulated exclusion, private-media boundary, or any
other mandatory deny predicate.

Recording permission creates no authority to embed, train, export, search, or
rank.

## 20. Production capability staging

The staged sequence is not an MVP simplification programme. Every source
capability introduced under this contract must be production-grade for its
declared scope, including integrity, privacy, auditability, failure handling,
observability, migration safety, and rollback.

Required in the production foundation:

```text
verified upload intent/finalize lifecycle
canonical asset identity and processing states
provenance, rights, consent, approved use, and revocation history
immutable assignment/applicability referents
review and transition history
structural private/catalog isolation
legacy compatibility observability
operator blockers and re-review
```

A capability may be deferred only when:

```text
its required extension seam is preserved;
its status and re-entry gate are documented;
the current implementation does not claim the deferred guarantee;
later activation does not require reinterpretation of existing truth, rights,
consent, approval, or history.
```

Deferred capabilities are governed by the companion Deferred Capability
Register and use these states:

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

## 21. Mechanism-neutral honesty matrix

This matrix applies to the listed mechanism-neutral properties. Omission from
this matrix never makes a normative body clause non-binding.

A listed property requires an observable failing scenario, a named owner, a
named closure gate, and closing evidence. If its gate never closes, the property
remains frozen-but-unproven and blocks the named later stage indefinitely; it
does not lapse.

| Property | Owner | Failing acceptance scenario | Deferred mechanism | Closing gate | Closure evidence |
|---|---|---|---|---|---|
| Structural catalog/private isolation | Platform/Security | Syntactically valid private reference fails before URL/read/list/head/copy/write/delete | Target credential/client/namespace | Annex privacy qualification | Sanitized capability evidence + negative integration test |
| Verified canonical asset | Media source owner | Invalid/unverified/replayed staged object cannot become READY | Verification backend, decoder, identity mechanism | Annex asset qualification + qualified test backend | Negative lifecycle suite; currently unobtainable with the baseline mock |
| Staging/canonical write separation | Platform/Security + media source owner | A client credential presented directly to the canonical namespace cannot create or replace a canonical object | Target credential/namespace boundary | Annex asset qualification | Credential/namespace denial proof + intent-replay tests |
| Object immutability | Platform/Security + media source | Replaced bytes cannot remain eligible under same witness | Prevention or triggered detection mechanism | Annex identity qualification | Overwrite/mismatch negative test and trigger evidence |
| Product-spec/media separation | Product owner | Missing governed truth reference yields advisory incomplete before activation and fail closed after | External/in-repo Product Specification interface | Audited Product Specification dependency | Versioned interface conformance evidence |
| Capture diversity | Media operations | DERIVATIVE_OF/UNKNOWN cannot satisfy distinct-capture role | Capture declaration/lineage | Technical source contract + policy tests | Reviewed capture identity plus behavioral tests |
| Explicit variant applicability | Catalog/media operations | New variant receives no claim without explicit assignment/applicability | Applicability persistence/workflow | Technical source contract | Wrong-variant/default-allow negative tests |
| Compatibility fail-closed | Product Media Mapping owner | Unknown combination is rejected and cannot count | Versioned compatibility policy | Mapping policy approval + source tests | Policy version and unknown-combination tests |
| Legacy fallback non-readiness | Migration owner | Legacy cover never raises readiness | Fallback observability/read model | Migration contract and zero-dependence gate | Counts and customer-path proof |
| Multi-seam enforcement | Enforcement source owner | Source installation while activation off changes no admission result | Exact read/admission seams | Separate enforcement source contract + activation record | Byte-identical/off-state tests per seam |
| Machine-use fail-closed | Rights/data-governance owner | Manual include cannot bypass denied rights/truth/private boundary | Scoped grant/deny evaluation | Machine-use contract | Negative inclusion tests + evidence-bearing grants |

## 22. Deployment Qualification Annex

The normative companion is:

```text
Product Media Deployment Qualification Annex v0.1
```

Initial status:

```text
UNPOPULATED — BLOCKED ON TARGET SELECTION
```

The annex is required to prevent mechanism-neutral properties from becoming
unclosed abstractions.

A missing deployment target does not block this semantic draft. It blocks:

```text
deployment mechanism selection
technical source contract
provider-specific implementation
legacy object migration sizing
enforcement activation
```

---

## 23. Package integrity and change control

Package integrity must validate both:

```text
REFERENCE COMPLETENESS:
  every document reference is declared, whether packed or absent

BYTE INTEGRITY:
  every present package member matches its recorded witness
```

Before packaging, the builder must derive or explicitly review every document
reference appearing in:

```text
the task prompt;
EVERY package member, present or absent, regardless of required-for-task status;
all declared authority/change-control chains;
all inputs named as necessary to adjudicate supersession or a blocking claim.
```

A reference appearing in a non-required member is still listed with
`required-for-task: NO` and an effect-of-absence statement. It is never silently
omitted.

The manifest must list every referenced document, whether packed or absent, and
state:

```text
document ID
expected version
canonical filename:
  the filename by which the document identifies itself or is canonically cited
archive filename:
  the package-local member name when PRESENT
known aliases:
  every other document ID or filename used by a package member, including
  historical aliases such as COD/CDX
referring loci:
  exact prompt/member and section or line context for every reference
PRESENT or ABSENT
provenance class:
  PRESERVED_TOOL_ARTIFACT / REPOSITORY_FILE / USER_UPLOAD / CHAT_PASTE /
  GENERATED_FOR_PACKAGE / OTHER
SHA-256 and byte length when present
required-for-task: YES / NO
effect of absence
```

The receiving agent must:

```text
compare reference closure with actual archive members;
resolve canonical names and aliases;
stop on an absent required input, undeclared archive member, undeclared
reference, or hash/length mismatch;
report non-required absences before substantive analysis.
```

The manifest itself must be covered by an integrity witness external to its own
content.

For this contract:

```text
the reference-closure manifest is the omission-control mechanism;
the detached digest is the substitution/corruption-control mechanism;
a digest does not prove completeness and a manifest does not independently
prove its own bytes.
```

A detached witness must be delivered as a separately named artifact and must
identify the package, manifest, package hash, manifest hash, creation time, and
witness provenance. Same-message delivery is sufficient only for accidental
corruption detection; it must not be represented as independent-party or
pre-existing-builder evidence.

No title, path, prior-session reference, filename, in-band hash, or archive
member list alone is proof that a document was supplied.


## 24. Re-entry sequence

Business-track state:

```text
A. EXTERNAL PRODUCT-TRUTH AUTHORITY CHECK
   CLOSED — NO KNOWN EXTERNAL AUTHORITY.
   A bounded internal Catalog Product Specification dependency is required
   after reviewed documentation install.

B. DEPLOYMENT TARGET DECISION
   Identify target existence/class, owner, private-media co-tenancy,
   pre-existing legacy objects, review trigger, and required qualification date.
```

Document sequence:

```text
1. Human-amend v0.2 and the unpopulated annex against the T5 audit.
2. Perform a new independent adversarial audit of the amended complete package.
3. Human-adjudicate that audit.
4. Perform documentation conformance review and a separately reviewed install.
5. Because no known external product-truth authority exists, design the
   bounded internal Catalog Product Specification dependency after reviewed
   documentation install. Reopen as integration/gap-closure design only if a
   real external authority is later identified.
6. When a target exists and evidence is available, populate and independently
   review the Deployment Qualification Annex.
7. Only after the Product Specification dependency and the relevant annex gates
   close may a technical source contract be considered.
8. Source implementation, migration, customer enforcement, activation, and
   machine use remain separate later authorities.
```

No later stage opens automatically.

## 25. Open-decision register

Unresolved items do not grant permission to infer defaults.

### Before Product Specification dependency design

```text
external product-truth/change authority: CLOSED — no known external authority;
truth-reference subject scope and style→variant propagation;
market-specific product facts;
unknown material-difference category handling beyond the fail-closed floor.
```

### Before Deployment Annex qualification

```text
named owner and dated review trigger for UNPOPULATED state;
private-media co-tenancy and pre-existing legacy objects;
data residency/region class and retention-policy owner;
conjunctive/per-section meaning of QUALIFIED;
independent reviewer/artifact and maximum evidence age.
```

### Before technical source contract

```text
assignment/applicability semantic identity and duplicate rules;
hero scope under variant selection, concurrency, and ineligible resolution;
per-person consent representation and disposition window authority;
compatibility-policy implementation and exact readiness binding;
assignment ordering semantics;
qualified object-lifecycle test backend;
staged-object retention/disposition ownership;
remaining deployment-independent source residue.
```

### Before legacy migration

```text
real inventory and reconciliation;
historical snapshot serving after revocation;
hero/legacy divergence rule;
derivative revocation propagation.
```

### Before customer enforcement

```text
legacy fallback customer marker;
session-time versus completion-time eligibility;
post-publication floor violation behavior;
Korean disclosure copy/legal review.
```

### Before machine use

```text
machine-use category vocabulary and grant language;
derivative lineage representation for machine use.
```

### Separate live-defect ownership required now

The single normative inventory is `Live Media-Adjacent Security and Catalog
Defect Register v0.2`, currently containing seven defects:

```text
LBD-01 arbitrary catalog cover key reaching public URL generation;
LBD-02 fitting source key not bound to authenticated owner;
LBD-03 unauthenticated arbitrary-key development mock route;
LBD-04 catalog upload lacking server size/decode/byte verification;
LBD-05 incomplete public cover cache invalidation;
LBD-06 cart style/variant same-parent integrity;
LBD-07 inconsistent style-market publication predicates across public surfaces.
```

Each defect requires a bounded separate security/catalog task or an explicit
named-owner risk acceptance with review date. Silence is forbidden. This list
must remain byte-consistent with the referenced register or be replaced by a
pure cross-reference in the next version.


## 26. Conformance and install record

The load-bearing architecture completed independent adversarial audit and human
amendment. This exact text may supersede v0.1 only through documentation
conformance review and a separately reviewed documentation-only merge.

The audit must specifically attempt to falsify:

```text
the Product Specification / Product Media interface;
the mechanism-neutral honesty matrix;
the split between this contract and the Deployment Annex;
the verified upload lifecycle;
the structural privacy property;
capture-diversity rules;
explicit variant applicability;
rights/consent and product-truth separation;
derived eligibility plus transition history;
legacy fallback and snapshot policy;
multi-seam enforcement;
package-integrity controls.
```
