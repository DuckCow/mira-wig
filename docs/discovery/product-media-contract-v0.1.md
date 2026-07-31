# Product Media Contract v0.1

## Status

```text
DESIGN:
  FROZEN v0.1

PRODUCT ADJUDICATION:
  product-media-architecture-adjudication-v0.1.md

SOURCE IMPLEMENTATION:
  NOT AUTHORIZED

LEGACY MEDIA MIGRATION:
  NOT AUTHORIZED

CUSTOMER MEDIA PUBLICATION ENFORCEMENT:
  NOT AUTHORIZED

CHECKOUT MEDIA ENFORCEMENT:
  NOT AUTHORIZED

IMAGE SIMILARITY / EMBEDDINGS / TRAINING:
  NOT AUTHORIZED

CONSULTATION / FITTING / PRIVATE-CUSTOMER MEDIA:
  OUT OF SCOPE

CHANGE CONTROL:
  supersedes: none | superseded-by: none
```

This contract freezes the smallest durable catalog product-media architecture
for human-wig commerce.

It replaces no source and changes no current customer behavior. A later source
task must receive separate bounded authorization after independent technical
audit and exact repository reconnaissance.

## 1. Problem and objectives

The current catalog stores a style-level `coverImageKey` and an untyped,
ordered `imageKeys[]`. That representation cannot durably own:

```text
what customer question an image answers
which style or variant it represents
whether it is exact, representative, or illustrative
whether catalog or marketing rights exist
whether a human subject consent applies
whether the media remains current after product change
whether it may be used for future embeddings
```

The architecture must:

```text
preserve customer truth
support style and variant media honestly
support launch evidence coverage
keep rights and consent inspectable
preserve source history and supersession
avoid destructive migration
remain usable while physical products change
preserve future image-similarity prerequisites without authorizing similarity
```

## 2. Scope and non-authority

This contract owns only catalog product media for:

```text
WigStyle
WigVariant
```

It does not own:

```text
customer fitting source/result images
consultation uploads
order-specific customer media
medical records
user-generated reviews
marketing campaign orchestration
video production
image embeddings
similarity or recommendation algorithms
customer-publication activation
checkout enforcement activation
```

Catalog media must never read from or silently attach private customer fitting
or consultation media.

## 3. Architecture

The canonical semantic structure is:

```text
MEDIA ASSET
  owns immutable file-level truth

MEDIA ASSIGNMENT
  owns catalog meaning for one style or variant
```

One asset may have multiple assignments. Each assignment carries exactly one
role while using independent view and presentation axes.

No catalog meaning may be inferred solely from:

```text
array order
file name
storage path
upload order
legacy cover status
```

## 4. Media Asset authority

A media asset owns at least these semantic facts.

### 4.1 Identity and object truth

```text
stable asset identity
storage-object reference
content hash or equivalent exact-identity witness
media kind
processing state
created and supersession evidence
```

The first implementation is IMAGE-only. Later media kinds require a new
versioned task. An image containing a diagram remains IMAGE with presentation
subject DIAGRAM.

The immutable master must not be replaced in place in a way that changes its
content while preserving the same identity.

### 4.2 Provenance

Required provenance vocabulary:

```text
IN_HOUSE
SUPPLIER
LICENSED
CUSTOMER
GENERATED
UNKNOWN
```

`CUSTOMER` is reserved and not authorized for launch catalog use. Consultation
or fitting media remains outside this contract even if technically stored in
the same infrastructure.

`UNKNOWN` provenance is internal-only and cannot satisfy customer coverage.

### 4.3 Rights and consent

The asset must preserve a minimal rights record sufficient to answer:

```text
who or what grants use
catalog use allowed?
marketing use allowed?
transform/crop allowed?
embedding/training use allowed?
expiry or review date?
evidence/terms reference?
```

Unstated permission is denied.

When a human subject is depicted, the asset must additionally preserve the
applicable consent or release scope and expiry/review evidence.

An assignment cannot grant a use the asset rights or consent deny.

Rights and consent records may be updated when new evidence arrives, but the
prior decision and source evidence must remain auditable.

### 4.4 Processing and edit facts

The asset must distinguish:

```text
UPLOADED
READY
FAILED
BROKEN
```

or semantically equivalent processing outcomes.

It must also preserve immutable or audited facts about:

```text
AI generation
background editing
shape/beauty retouching
color adjustment
calibrated color correction
other truth-affecting edits
```

No edit flag automatically grants evidence eligibility.

### 4.5 Supersession

A replacement creates a new asset identity and a supersession link. Old assets
and their historical assignments remain inspectable even when no longer
customer-available.

## 5. Media Assignment authority

A media assignment links one asset to exactly one catalog subject:

```text
subject type:
  STYLE or VARIANT

subject identity:
  canonical WigStyle or WigVariant ID
```

The implementation must preserve referential integrity without requiring this
contract to select a polymorphic-table technique.

### 5.1 Role

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

### 5.2 View and framing

Launch view/framing vocabulary:

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

A later contract may add values. Implementation must reject unknown values
rather than silently reinterpret them.

### 5.3 Presentation subject

Launch presentation vocabulary:

```text
PRODUCT_ONLY
MANNEQUIN
HUMAN_MODEL
DIAGRAM
SWATCH
PACKAGING
```

`CUSTOMER` presentation is reserved and not authorized for catalog use.

### 5.4 Truth status

```text
EXACT_FOR_SUBJECT
REPRESENTATIVE
ILLUSTRATIVE
```

Definitions:

```text
EXACT_FOR_SUBJECT:
  the depicted product truth applies to the exact assignment subject for the
  claimed role

REPRESENTATIVE:
  useful visual reference, but not exact for one or more subject attributes;
  customer disclosure is mandatory whenever rendered on that subject

ILLUSTRATIVE:
  explanatory or inspirational only; it cannot satisfy factual product-media
  gates
```

An assignment's truth status is role-specific. One asset may be exact for
silhouette and representative or ineligible for color.

### 5.5 Review, availability, staleness, and approved use

The following meanings remain separate:

```text
review:
  DRAFT / IN_REVIEW / APPROVED / REJECTED

availability:
  ACTIVE / SUPERSEDED / RETIRED

staleness:
  CURRENT / NEEDS_RE_REVIEW

approved use:
  CATALOG / MARKETING
```

The technical design may choose a minimal representation but must not conflate
these questions.

Only an assignment that is:

```text
review APPROVED
availability ACTIVE
staleness CURRENT
approved for the requested use
bounded by valid asset rights/consent
asset processing READY
```

may satisfy customer coverage.

A material semantic edit to an approved assignment must not silently rewrite
historical approved meaning. The later technical contract must preserve change
evidence through versioning, audit history, supersession, or an equivalent
mechanism.

### 5.6 Editorial order and hero selection

Editorial order controls presentation only.

Hero is a surface-level selection of an eligible assignment. It is not a role
and grants no evidence truth.

The semantic architecture permits:

```text
LISTING hero
PDP hero
future comparison hero
```

to differ. The first implementation may share one hero selection if this is
explicit and reversible.

## 6. Style and variant ownership

### 6.1 Governing rule

Whatever distinguishes a variant must be variant-owned or explicitly
representative with customer disclosure. It may never be silently inherited as
exact truth.

### 6.2 Required ownership behavior

```text
same cut, different color:
  style silhouette/hairline/parting may resolve as REPRESENTATIVE;
  exact COLOR truth is required per purchasable variant

different length:
  variant SILHOUETTE truth is required for sellability;
  style silhouette may appear only as REPRESENTATIVE with disclosure

different curl or texture:
  variant TEXTURE truth is required

different cap/base:
  variant BASE_INTERIOR truth is required

different attachment:
  variant ATTACHMENT truth is required when the difference affects the
  customer product
```

One exact asset may be assigned to multiple variants only when it truly applies
to each assignment subject for that role.

### 6.3 Display resolution

For a variant surface and requested role:

```text
1. use an eligible variant-owned assignment when available;
2. otherwise a style-owned assignment may resolve only as REPRESENTATIVE;
3. do not use representative media to satisfy the exact gate for the variant's
   distinguishing attribute;
4. show generated customer disclosure from truth status;
5. if no eligible media exists, show an honest missing/preparing state rather
   than an unrelated placeholder.
```

## 7. Rights and truth policy

### 7.1 Default deny

Unknown provenance, rights, consent, or use permission cannot satisfy customer
coverage.

### 7.2 Supplier media

Supplier media is customer-visible only when:

```text
catalog rights are evidenced
depicted product truth has been verified for the assignment subject and role
required human-subject rights are sufficient
processing and review are eligible
```

### 7.3 Generated and simulated media

At launch:

```text
AI-generated media:
  not permitted on product factual PDP surfaces
  never product evidence
  never image-similarity eligible

virtual try-on:
  not catalog evidence
  remains under fitting authority

diagram:
  may be customer-visible as ILLUSTRATIVE
  never satisfies exact visual product truth
```

Marketing use of generated media requires separate approval and legally
reviewed disclosure copy.

### 7.4 Retouching and correction

Shape/beauty retouching that changes the claimed fact disqualifies the media
from that evidence role.

Background-edited media may be eligible only when the product pixels and
claimed fact are unchanged and the edit is recorded.

Color-adjusted media satisfies COLOR truth only under a governed calibration
process with recorded evidence. That process is not defined or activated here.

## 8. Strict future coverage floor

This section freezes the media evidence floor. It does not activate current
publication or checkout enforcement.

### 8.1 Style customer-publication floor

Before a style may pass a future enforced media-publication gate:

```text
one eligible hero
SILHOUETTE FRONT
SILHOUETTE LEFT or RIGHT
SILHOUETTE BACK
HAIRLINE or combined HAIRLINE + PARTING detail
TEXTURE MACRO
BASE_INTERIOR
```

At least one silhouette image must use a mannequin or human-model presentation
that shows on-head shape. Mannequin is the default evidence core.

All gate evidence must be rights-clear, reviewed, current, and approved for
catalog use.

### 8.2 Variant checkout floor

Before a variant may pass a future enforced media-checkout gate:

```text
exact COLOR truth
plus exact truth for every variant-differentiating axis:
  length -> SILHOUETTE
  curl/texture -> TEXTURE
  base/cap -> BASE_INTERIOR
  attachment -> ATTACHMENT
```

A swatch may satisfy exact COLOR truth when the swatch truth is governed for
that exact variant. It does not satisfy silhouette or texture.

### 8.3 Optional and later roles

The following do not independently satisfy or replace the strict floor:

```text
human-model marketing image
SCALE when numeric length is governed
INCLUDED_ITEMS when governed text is sufficient
PACKAGING
CARE
video
```

## 9. Customer presentation policy

### 9.1 Gallery structure

The future PDP may resolve approved assignments into an ordered scaffold:

```text
hero
silhouette front
side
back
hairline / parting
texture
selected-variant color
trust/construction link
```

The exact UI is not frozen by this contract.

### 9.2 Trust section

Base interior, attachment, included items, and care/diagram content should be
available in a trust/construction section and discoverable from the main
gallery.

### 9.3 Representative disclosure

Representative media requires a generated disclosure near the media and
variant selector.

Candidate Korean meaning:

```text
대표 이미지
선택한 색상과 세부 사양은 해당 견본과 상품 정보를 확인해 주세요
```

Exact copy requires a later product-copy and legal review and is not frozen.

## 10. Operator MVP

The smallest future operator surface may provide:

```text
batch-capable asset intake with required provenance/rights
style/variant assignment editor with guided presets
review queue
hero and editorial ordering
coverage checklist by style and variant
computed blockers and warnings
```

It must not treat unknown-rights or unreviewed media as filled customer
coverage.

The first source task may provide coverage computation and default-off
enforcement seams. It may not enable current customer-publication or checkout
blocking.

## 11. Legacy migration

Current `coverImageKey` and `imageKeys[]` are legacy display storage, not media
semantics.

Migration requirements:

```text
do not infer role, view, presentation, truth, rights, or subject from array
position, filename, or upload order

do not delete legacy fields or data until all readers are migrated and
behavioral equivalence/rollback are demonstrated

legacy cover may remain a temporary display fallback

imported legacy files begin unclassified and cannot become factual gate
evidence until reviewed and assigned

migration must be additive and reversible in its early stages
```

A later technical contract must define exact dual-read, dual-write, backfill,
cutover, and retirement phases.

## 12. Failure and maintenance semantics

A product-spec or representative-image change must make affected approved
assignments re-enter review.

A failed or broken asset cannot satisfy coverage. Automatic broken-object
monitoring and scheduled expiry workers are not authorized in the first source
slice; operator-visible states and later re-entry seams are sufficient.

Hard deletion is not the default method for replacement or rollback.

## 13. Future image-similarity preservation

From the first source implementation, preserve:

```text
stable asset IDs and immutable masters
exact duplicate identity witness
role/view/presentation labels
style and variant subject identity
truth status
generation and edit flags
rights for embedding/training
derivative lineage where derivatives later exist
supersession and staleness
```

Future similarity eligibility must be derivable from governed evidence. A
manual override may exclude but cannot include an asset past denied rights or
ineligible truth.

This contract does not authorize:

```text
embeddings
model training
vector storage
image search
automatic candidates
ranking
evaluation export
manual relation use as labels
```

## 14. Privacy boundary

Catalog product media is public-product evidence.

Customer fitting and consultation media is private user data and remains under
separate retention, access, consent, and deletion authority. No catalog asset
or assignment may be created from private customer media without a separate,
explicitly authorized transfer and rights process.

## 15. Re-entry gates

Separate contracts or tasks are required for:

```text
technical architecture audit amendments
Prisma/schema and migration design
source implementation
legacy backfill and cutover
customer-publication enforcement activation
checkout enforcement activation
video
manual crops/derivatives
rights or consent expiry automation
broken-object monitoring
customer or consultation media
generated-media marketing policy
image similarity and embeddings
training/evaluation export
```

## 16. Expected source sequence

This design contract recommends, but does not authorize:

```text
M1:
  independent technical architecture audit

M2:
  read-only repository reconnaissance and technical source contract

M3:
  additive asset/assignment foundation + admin intake/review/coverage

M4:
  legacy compatibility and customer gallery resolution

M5:
  operations/readiness evidence

M6:
  separately authorized publication/checkout enforcement activation
```

No later stage is opened merely because this contract is merged.
