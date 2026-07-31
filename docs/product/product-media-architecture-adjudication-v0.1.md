# Product Media Architecture Adjudication v0.1

## Status

```text
INPUT:
  WIG-COM-MEDIA-R0-FAB-M1 PRODUCT MEDIA ARCHITECTURE REPORT v1

ADJUDICATION:
  WIG-COM-MEDIA-R0-GPT-M2-DOCKET-ADJUDICATION-v0.1

PRODUCT PLANNING:
  COMPLETE

CORE ARCHITECTURE:
  ACCEPT WITH AMENDMENTS

RECOMMENDED MODEL:
  MEDIA ASSET + MEDIA ASSIGNMENT

DESIGN CONTRACT:
  READY TO FREEZE

SOURCE IMPLEMENTATION:
  NOT AUTHORIZED

CUSTOMER PUBLICATION / CHECKOUT ENFORCEMENT:
  NOT AUTHORIZED

IMAGE SIMILARITY:
  NOT AUTHORIZED

CHANGE CONTROL:
  supersedes: none | superseded-by: none
```

## 1. Scope

This document adjudicates the 15-item decision docket from Fable's clean-sheet
product-media architecture report.

It records the accepted product and operations decisions used by the separate
Product Media Contract v0.1. It is not source authority, schema, migration,
operations authorization, customer-publication authorization, checkout
enforcement, or image-similarity authority.

## 2. Human business defaults

The following defaults are accepted for Product Media v0.1:

```text
launch image rights:
  mixed or unverified unless evidence says otherwise;
  unknown use permission defaults to denied

launch variant differentiation:
  not assumed to be color-only;
  architecture must support color, length, curl/texture, base/cap, and
  attachment differences

launch evidence presentation:
  mannequin-led evidence core

human-model media:
  optional marketing/trust layer when rights and consent are sufficient

launch evidence policy:
  strict evidence floor, with customer-publication and checkout enforcement
  remaining separately activated

base-interior evidence:
  required before a style/variant becomes sellable under the future enforced
  media gate
```

These defaults do not claim that real launch assets, rights, products, or
variant differences already exist.

## 3. Docket adjudication

### MED-D01 — Asset and assignment separation

```text
DISPOSITION:
  ACCEPT
```

File-level truth, provenance, rights, processing, edit history, and content
identity belong to a durable media asset. Catalog meaning belongs to one or
more assignments linking the asset to a style or variant.

### MED-D02 — Style and variant subjects

```text
DISPOSITION:
  ACCEPT
```

Both `WigStyle` and `WigVariant` must be valid assignment subjects. Customer
fitting, consultation, order, and private-user media remain outside catalog
media authority.

### MED-D03 — Independent semantic axes

```text
DISPOSITION:
  ACCEPT WITH UI QUALIFICATION
```

Role, view/framing, and presentation subject are independent semantic axes.
Operator UI should use guided presets such as mannequin front, texture macro,
color swatch, and base interior to reduce classification error. UI presets do
not collapse the stored meaning.

### MED-D04 — First media kind

```text
DISPOSITION:
  ACCEPT
```

The first implementation is image-only. The semantic architecture must not
prevent later video or animation, but no video source work is authorized.
A diagram stored as an image remains media kind IMAGE and presentation DIAGRAM.

### MED-D05 — Hero semantics

```text
DISPOSITION:
  ACCEPT
```

Hero is a surface-level editorial selection over an approved assignment, not a
role and not evidence by itself. The semantic contract allows listing and PDP
hero selections to diverge later; the first implementation may share one.

### MED-D06 — Lifecycle and usage state

```text
DISPOSITION:
  AMEND
```

Do not collapse review, availability, staleness, and approved use into one
state enum.

The contract separates:

```text
review:
  DRAFT / IN_REVIEW / APPROVED / REJECTED

availability:
  ACTIVE / SUPERSEDED / RETIRED

staleness:
  CURRENT / NEEDS_RE_REVIEW

approved use:
  CATALOG / MARKETING, bounded by asset rights
```

Implementation may choose a minimal representation after technical audit, but
must preserve these distinct meanings.

### MED-D07 — Rights capture

```text
DISPOSITION:
  ACCEPT
```

Minimal rights and provenance are required at intake. Unstated or unknown use
is denied. Batch presets may reduce operator burden but cannot imply rights
that are not held.

### MED-D08 — Representative disclosure

```text
DISPOSITION:
  ACCEPT
```

Style media may resolve onto a variant only as explicitly
`REPRESENTATIVE`. Silent inheritance is forbidden. Representative media cannot
serve as exact truth for the attribute that distinguishes the variant.

### MED-D09 — Coverage and gates

```text
DISPOSITION:
  AMEND TO STRICT EVIDENCE FLOOR
```

The future enforced customer-publication floor for a style is:

```text
approved and rights-clear hero
SILHOUETTE FRONT
SILHOUETTE SIDE
SILHOUETTE BACK
HAIRLINE or HAIRLINE+PARTING detail
TEXTURE MACRO
BASE_INTERIOR
```

The future enforced checkout floor for a variant additionally requires:

```text
exact COLOR truth
exact truth for every variant-differentiating visual/structural axis:
  length difference -> variant silhouette evidence
  curl/texture difference -> variant texture evidence
  base/cap difference -> variant base-interior evidence
```

The design contract defines the floor. No current publication or checkout
behavior is changed or activated by the documentation task.

### MED-D10 — Base-interior evidence

```text
DISPOSITION:
  AMEND
```

Customer presentation should place base/interior evidence in a trust or
construction section, linked from the gallery. Under the strict future media
gate, base-interior evidence is required before sellability rather than merely
a launch warning.

### MED-D11 — Presentation mode

```text
DISPOSITION:
  ACCEPT AS DEFAULT
```

Use a standardized mannequin-led evidence core. Human-model imagery is
optional and does not replace product/mannequin evidence. Product-only imagery
remains appropriate for interior, attachment, included-item, and detail roles.

### MED-D12 — Supersession

```text
DISPOSITION:
  ACCEPT
```

Do not overwrite file identity or silently erase old meaning. New media
supersedes old media, and product changes mark affected assignments for
re-review. Historical evidence remains inspectable.

### MED-D13 — Generated and edited media

```text
DISPOSITION:
  ACCEPT
```

At launch, AI-generated media is not PDP product evidence and is not
image-similarity eligible. It may enter separately approved marketing use only
with legally reviewed disclosure.

Shape/beauty retouching disqualifies an asset from factual color, texture,
hairline, silhouette, or base evidence where the edit affects the claimed
fact. Background edits and calibrated color correction require explicit flags
and bounded evidence rules.

### MED-D14 — Future similarity prerequisites

```text
DISPOSITION:
  ACCEPT WITH NON-AUTHORITY
```

Capture stable identity, semantic labels, subject, truth, edit/generation
flags, supersession lineage, and per-asset embedding/training permission from
the beginning.

This does not authorize embeddings, model training, similarity search,
automatic recommendation, export, or label use.

### MED-D15 — Gate enforcement

```text
DISPOSITION:
  AMEND TO DEFAULT-OFF ENFORCEMENT SEAM
```

The first source implementation may compute readiness, show blockers/warnings,
and provide tested enforcement seams. It must not silently change current
style publication or checkout admission.

Actual customer-publication and checkout enforcement require later operations
readiness, real media data, rollback evidence, and a separate activation
record.

## 4. Rejected architecture shortcuts

The following are rejected:

```text
meaning encoded by image order or file names
style-only ownership
silent style-to-variant inheritance
HERO as an evidence role
all supplier imagery presumed publishable
generated imagery used as product evidence
current imageKeys[] treated as durable media semantics
automatic role inference from legacy array position
one lifecycle enum that conflates approval, retirement, and staleness
current source installation treated as gate activation
```

## 5. First implementation boundary

A future bounded source task may include:

```text
asset foundation
assignment foundation
style and variant ownership
fixed semantic axes
minimal provenance and rights
review and approved catalog-use state
hero selection and ordering
admin intake, assignment, review, and coverage views
legacy cover/gallery compatibility
representative disclosure seam
computed readiness with default-off enforcement
```

It must exclude unless separately authorized:

```text
video
manual crop editor
perceptual near-duplicate detection
scheduled rights/consent expiry worker
automatic broken-object monitor
marketing DAM
consultation/private-customer media
embeddings or similarity
automatic recommendation
training/evaluation export
behavior analytics
customer-publication or checkout enforcement activation
```

## 6. Technical-audit requirement

Before source implementation, an independent technical architecture audit must
challenge:

```text
asset immutability and supersession
assignment identity and approved-meaning changes
style/variant ownership implementation
rights and consent authority
lifecycle-axis separation
query and index needs
legacy migration safety
customer fitting-media isolation
readiness and enforcement seams
future similarity eligibility without present activation
```

Opus is the preferred independent technical auditor for this high-risk,
cross-system, migration-bearing foundation.
