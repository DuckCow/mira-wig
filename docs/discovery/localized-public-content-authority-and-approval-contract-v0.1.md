# Localized Public Content Authority & Approval Contract v0.1

**Project:** Mira Wig Commerce  
**Repository:** `DuckCow/mira-wig`  
**Observed source baseline:** `main` at `fcca9a96e1b4c468b02a8d3afb12729a43a985e4`  
**Observed tree:** `6cd1814cf14189a4b296870808d26570f261da72`  
**Draft date:** 2026-08-24  
**Canonical candidate path:** `docs/discovery/localized-public-content-authority-and-approval-contract-v0.1.md`

## Status

```text
DOCUMENT STATUS:
  DESIGN CONTRACT CANDIDATE — NOT EFFECTIVE UNTIL REVIEWED MERGE

DESIGN AUTHORITY:
  THIS DOCUMENT DEFINES THE PROPOSED LPC v0.1 BOUNDARY ONLY

SOURCE / SCHEMA / MIGRATION AUTHORITY:
  NOT GRANTED

CONTENT PUBLICATION:
  NOT GRANTED

CATALOG APPROVAL:
  NOT GRANTED

SEARCH INDEXING ACTIVATION:
  NOT GRANTED

PRODUCTION ACTIVATION:
  NOT GRANTED

EXTERNAL CMS / PROVIDER CONTACT:
  NOT GRANTED

CHANGE CONTROL:
  supersedes: none
  superseded-by: none
```

---

## 0. Purpose, failure mode, and scope

### 0.1 Purpose

Mira needs a durable authority model for localized public content before product
pages, guides, comparison pages, evidence/methodology pages, policies, or video
companions can become production-approved and indexable across locales.

The purpose of this contract is to prevent the following responsibilities from
collapsing into one ambiguous "content is present" or "row is active" signal:

```text
product truth
commerce/policy truth
evidence truth
media rights/applicability
localized editorial expression
translation review
claim review
publication
search indexability
commerce activation
```

The governing principle is:

> Localized Public Content does not own product, commerce, policy, evidence, or
> media truth. It consumes exact references to those authorities, creates a
> locale-scoped expression, binds approval to an exact revision, and separately
> controls whether that approved revision is the current public revision.

### 0.2 Concrete failure modes

Without this contract, future implementation could incorrectly:

- treat current `WigStyle.name` / `description` as production-localized truth;
- treat a translated phrase as proof that the underlying product claim is true;
- let generic `ADMIN` status imply content, claim, policy, or publication authority;
- silently fall back from a missing locale to another language and expose that
  fallback as an equivalent localized page;
- treat CMS "published", Git merge, database row presence, or catalog activation
  as Mira publication approval;
- place price, shipping, return, product, and evidence facts inside editable copy
  without binding them to their governing authority;
- emit hreflang for pages whose localized main content is not actually approved;
- make a content edit invalidate no prior approval because the approval was not
  bound to exact bytes/revision identity;
- allow withdrawn evidence, policy, media rights, or product truth to remain
  silently represented by previously approved content;
- build a generic CMS/workflow framework before an actual operational need exists.

### 0.3 Scope

This contract governs:

- the authority boundary for localized public editorial content;
- the storage-class decision for localized product merchandising copy versus
  long-form editorial content;
- content identity, localized revision, approval, publication, withdrawal, and
  supersession semantics;
- locale and translation lineage;
- market-neutral content versus CommerceMarket-specific overlays;
- material-claim binding to external truth/evidence authorities;
- the minimum relationship to Product Media;
- page-family approval requirements;
- the relationship among publication, indexability, hreflang, and structured-data
  admission;
- bounded re-entry gates for future CMS and organizational delegation.

This contract does **not** select or authorize:

- Prisma table names or exact schema;
- migrations;
- production localized content;
- a rich-text editor or page builder;
- an external CMS;
- runtime machine translation;
- remote/untrusted MDX execution;
- Search Console, Merchant Center, or crawler submission;
- Product / Offer / VideoObject / FAQPage structured data;
- production indexing activation;
- product-truth source implementation;
- legal, medical, privacy, or regulatory approval policy;
- future organizational structure or detailed separation-of-duties implementation.

---

## 1. Installed authority and precedence

### 1.1 Descriptive authority

For what Mira currently does, installed truth is:

1. current source;
2. current Prisma schema and migrations;
3. runtime-relevant configuration;
4. current tests.

At the observed baseline, current product presentation still uses one
non-localized `WigStyle.name`, `WigStyle.description`, and tags set across
locale routes. The existing storefront explicitly warns that localized product
content authority is not yet installed.

### 1.2 Normative authority consumed by this contract

This contract is designed to coexist with, not replace:

- `docs/discovery/public-discovery-architecture-contract-v0.1.md`;
- `docs/product/catalog-product-specification-and-configurable-product-foundation-contract-v0.1.md`;
- `docs/discovery/product-media-contract-v0.2.md`;
- `docs/product/market-locale-site-variant-design-contract-v0.1.md`;
- task-relevant Commerce, policy, privacy/legal, measurement, fitting,
  manufacturing, and payment/refund authorities.

### 1.3 Precedence and non-redefinition

This contract does not redefine:

```text
Catalog Product Specification:
  governed product truth and ProductTruthReference

CommerceMarket:
  commercial offer, publication, price, currency, availability,
  checkout/payment eligibility and commercial-policy ownership

Product Media:
  media asset identity, rights/consent, assignment meaning,
  applicability, approved use, readiness

Public Discovery:
  public page classes, canonical/indexing policy, hreflang,
  crawler/sitemap policy, answer/citation composition,
  structured-data admission

Locale:
  presentation/editorial language

DeliveryCountry / ShippingAddress:
  delivery intent and fulfillment inputs

Internal Discovery:
  query interpretation, candidate retrieval, ranking/recommendation
```

If a future implementation or contract conflicts with one of these installed
owners, the conflict must be reported rather than silently reconciled.

---

## 2. Fixed human design decisions

### 2.1 One public-content authority model, not one storage engine

Mira uses one conceptual authority model for revision, approval, publication,
withdrawal, and provenance, but does **not** require every public-content family
to use one physical storage engine.

### 2.2 Localized product merchandising copy is database-backed

Localized merchandising copy tied to `WigStyle` should use a Mira-owned
database-backed immutable revision authority.

This decision exists because product merchandising copy:

- is strongly joined to current catalog identity;
- is expected to be edited through product operations/admin workflows;
- must be independently publishable by locale;
- should not require a source deployment for ordinary localized copy revision;
- must not be stored as a second loosely joined repository file tree.

The exact Prisma representation is deferred.

### 2.3 Long-form public editorial content is repository-reviewed first

The initial authoring store for:

```text
Guide / Explainer
Comparison / Decision
Evidence / Methodology
Video Companion
```

is repository-reviewed content.

The first implementation may use structured Markdown or restricted local MDX.
The exact loader, extension, schema, and allowed component set are deferred to
the first source slice.

External or untrusted runtime MDX execution is not part of this decision.

### 2.4 Policy pages do not become policy authority

A localized policy page may express an approved policy, but does not create or
own the policy itself.

Market-specific shipping, return, remake, warranty, cancellation, or equivalent
material policy statements must consume a durable reference to the governing
policy authority.

### 2.5 Storage location does not create authority

The following are explicitly false:

```text
stored in DB           == product truth
stored in Git          == claim approved
merged to main         == content published
CMS status PUBLISHED   == Mira publication authority
row is active          == localized content approved
content approved       == indexable
indexable              == commerce activated
```

### 2.6 Generic ADMIN is not content approval authority

Current generic `ADMIN` access may authorize entry to administrative tooling.
It does not by itself establish authority to approve product claims, evidence,
market policy, localized content, or publication.

The exact technical grant mechanism is deferred.

### 2.7 Solo-owner operation is valid

During the current small-team phase, the Project Owner may perform authoring,
review, approval, publication, and withdrawal actions.

These are still logically distinct decisions and must not be collapsed into
"the same person did it, therefore no approval record is needed."

### 2.8 Translation never manufactures truth

Translation, localization, rewriting, search optimization, or AI assistance
changes expression only. It cannot create product truth, commerce policy,
evidence, legal authority, medical authority, or media rights.

---

## 3. Alternatives considered and disposition

This section preserves the reasoning behind the selected architecture without
creating separate rationale artifacts.

### 3.1 External headless CMS for all content

**Potential advantages**

- non-developer editing;
- locale workflows;
- preview;
- scheduled publication;
- workflow and role features.

**Material costs / failure modes**

- new external durable state and provider dependency;
- provider content identity versus Mira identity mapping;
- provider roles may be mistaken for Mira authority;
- credentials, preview tokens, webhooks, cache invalidation, backup/export,
  plan-specific features, and provider availability become operational concerns;
- product truth and public-content truth can silently split across systems.

**Disposition**

```text
DEFER
```

Reconsider only when a real authoring/translation/operations workflow makes
repository or Mira-admin authoring materially insufficient.

### 3.2 One generic `PublicContent` database/CMS model for everything

**Potential advantages**

- unified runtime querying;
- unified workflow and locale handling.

**Material costs / failure modes**

- creates a home-grown CMS prematurely;
- encourages false equivalence among product copy, guides, evidence, policies,
  and video companions;
- pulls editor, rich-text, preview, slug, media, revision, workflow, and page
  builder requirements into the first slice.

**Disposition**

```text
REJECT FOR FIRST IMPLEMENTATION
```

### 3.3 Git/MDX for every content family, including product copy

**Potential advantages**

- strong review/diff/rollback;
- no product-content migration;
- convenient long-form composition.

**Material costs / failure modes**

- ordinary product-copy revision requires deploy/Git workflow;
- product catalog identity and content identity can drift;
- duplicate product operations authority appears outside the database/admin
  workflow.

**Disposition**

```text
REJECT FOR PRODUCT LOCALIZATION
ACCEPT FOR INITIAL LONG-FORM EDITORIAL CONTENT
```

### 3.4 Database Markdown for every content family

**Potential advantages**

- one runtime content store;
- locale revisions without Git deployment.

**Material costs / failure modes**

- still requires a substantial editor/preview/media/revision system for
  long-form content;
- moves authoring machinery into the database before a real workflow requires it.

**Disposition**

```text
DEFER
```

### 3.5 Hybrid storage + shared authority semantics

**Disposition**

```text
ACCEPT
```

Selected form:

```text
localized product merchandising copy
  -> Mira DB-backed immutable revision authority

guide / comparison / evidence / video companion
  -> repository-reviewed content initially

product truth
  -> Catalog Product Specification reference

commerce / policy truth
  -> Commerce or governing policy reference/projection

media
  -> Product Media reference

approval
  -> exact revision + attributable scoped decision

publication
  -> approved revision selected as current public revision

indexability
  -> separate Public Discovery admission
```

---

## 4. Canonical conceptual architecture

The following names define responsibilities and semantic identities. They do
not require same-named database tables.

```text
PublicContentIdentity
+ LocalizedEditorialRevision
+ optional MarketCommerceOverlayRevision
+ AuthorityReference / ClaimBinding
+ MediaReference
+ ApprovalDecision(s)
+ PublicationPointer
```

### 4.1 PublicContentIdentity

Stable identity for one public-content subject across revisions and locales.

Examples:

```text
one guide
one comparison page
one evidence/methodology page
one video companion
one WigStyle merchandising-content subject
```

URL slugs are not the identity.

### 4.2 LocalizedEditorialRevision

An immutable submitted expression for one `PublicContentIdentity` and one
Locale.

It conceptually carries:

```text
content identity
locale
exact revision identity
exact content digest or equivalent byte identity
source locale / source revision lineage when applicable
editorial payload
claim / authority references
media references
author identity
created time
submission time
```

Draft working state may be mutable before submission. Once submitted for
approval, the reviewed revision identity is immutable.

### 4.3 MarketCommerceOverlayRevision

Optional localized copy that is specific to a CommerceMarket.

It may express or summarize market-specific commercial/policy information but
does not own the underlying commercial fact.

### 4.4 ApprovalDecision

An attributable decision over an **exact revision**.

An approval is not a floating statement such as:

```text
"the Japanese guide is approved"
```

It must bind to an exact review target, conceptually equivalent to:

```text
content identity
locale
revision identity
content digest
approval class
authority basis
actor
decision time
```

### 4.5 PublicationPointer

The currently public approved revision for one public scope.

Publication selection is distinct from the approval itself.

### 4.6 ClaimBinding

A material claim may bind the localized expression to:

- ProductTruthReference;
- approved Commerce/policy reference;
- internal evidence release/reference;
- external source/reference;
- Product Media assignment/reference;
- another contractually valid authority.

---

## 5. Product localized merchandising content

### 5.1 Subject

The first product-localization subject is the existing merchandising family
carrier `WigStyle`.

This does not promote `WigStyle` into Product Specification authority.

### 5.2 Database-backed revision semantics

The future source should provide an immutable locale-scoped merchandising
revision associated with a `WigStyle`.

Conceptual fields may include:

```text
display name
short summary
long description
suitability summary
important limitations
care summary
SEO title
SEO description
source-locale lineage
claim/authority references
```

The exact field set is **not frozen** by v0.1 and must be chosen from actual
public-page requirements.

### 5.3 Legacy content migration rule

Current `WigStyle.name`, `description`, and tags must not be automatically
treated as approved localized production content.

A safe transition is conceptually:

```text
existing legacy copy
  -> explicit legacy-import draft
  -> human review
  -> new localized revision
  -> required approval
  -> publication
```

No automatic backfill may imply approval.

### 5.4 Existing customer behavior before localization

Until a page receives approved localized main content, the existing
Public Discovery noindex policy for current catalog list/detail pages remains
the controlling search boundary.

This contract does not require immediate removal of the existing customer
catalog surface.

---

## 6. Repository-authored editorial content

### 6.1 Initial page families

Repository-reviewed authoring is the initial store for:

- Guide / Explainer;
- Comparison / Decision;
- Evidence / Methodology;
- Video Companion.

### 6.2 Storage constraints

The first source slice should prefer a local build-time content source.

If MDX is selected:

```text
local trusted repository source only
no remote/untrusted runtime MDX execution
no arbitrary external code imports
bounded component mapping
validated required metadata
```

The contract does not require MDX specifically. Structured Markdown with an
explicit rendering schema is also acceptable if it satisfies the same authority
and revision requirements.

### 6.3 Git merge is not sufficient approval by itself

Repository review gives source custody and review evidence. It does not
automatically replace every domain approval required by the content.

For example, a merged evidence guide containing a product claim still requires
the relevant claim/evidence authority before it becomes publication-eligible.

### 6.4 External CMS transition

A future external CMS may become an authoring store only after a reviewed
integration decision proves how its identities, revisions, roles, preview
states, and publication actions map to Mira authority.

A CMS role or "publish" button must not silently redefine Mira semantics.

---

## 7. Truth and authority decomposition

| Information or decision | Governing owner |
|---|---|
| Physical / technical product truth | Catalog Product Specification |
| Customer-facing localized product expression | Localized Public Content |
| Product commercial availability | CommerceMarket |
| Price and currency | CommerceMarket |
| Shipping / return / remake / warranty policy truth | Governing Commerce / Legal / Operations policy authority |
| Experimental method and observation | Evidence / Methodology authority |
| Media rights, applicability, approved use | Product Media |
| Translation / locale expression quality | Localized-content locale review |
| Exact public-revision selection | Public Content publication authority |
| Search indexability and hreflang admission | Public Discovery |
| Internal retrieval / recommendation | Discovery Foundation |

The core non-equivalences are:

```text
translated        != true
true              != allowed in every market
approved          != published
published         != indexable
indexable         != sellable
sellable          != checkout/payment activated
```

---

## 8. Revision lifecycle

Revision workflow, approval, and publication must remain separate axes.

### 8.1 Authoring workflow

At minimum:

```text
DRAFT
SUBMITTED
REJECTED
```

A later implementation may add additional workflow states only when an actual
operator need exists.

### 8.2 Approval eligibility

Conceptually:

```text
PENDING
APPROVED
INVALIDATED
```

`APPROVED` means all approval decisions required for the exact revision and
scope are satisfied.

It is derived from authoritative decisions; it should not become a mutable
boolean that can drift independently.

### 8.3 Publication state

Conceptually:

```text
UNPUBLISHED
PUBLISHED
WITHDRAWN
SUPERSEDED
```

The exact physical representation may instead use immutable events plus a
current pointer.

### 8.4 Exact change rule

If approval-bearing editorial bytes or structured semantic fields change
materially, the result is a new revision and prior approval does not silently
transfer.

---

## 9. Approval model

### 9.1 Logical approval classes

The design distinguishes at least:

```text
LOCALE / EDITORIAL
PRODUCT / CLAIM
EVIDENCE / METHODOLOGY
MARKET POLICY / LEGAL-OPS
MEDIA / RIGHTS-APPLICABILITY
PUBLICATION
```

Not every page requires every approval class.

### 9.2 Actors

A future implementation must make material approval attributable to an actual
actor identity and authority basis.

Generic `ADMIN` is not sufficient authority evidence.

### 9.3 Current solo-owner operation

The current Project Owner may perform multiple logical roles.

The system or workflow must still preserve the distinction between:

```text
authored by
reviewed / approved by
published by
withdrawn by
```

Self-approval by the Project Owner is permitted in v0.1 operation.

This rule avoids inventing a mandatory multi-person organization before one
exists.

### 9.4 Detailed delegation is deferred

This contract deliberately does **not** define a full role/capability schema,
team hierarchy, approval matrix, or separation-of-duties system.

See §20.1 for the organizational re-entry marker.

---

## 10. Localization and translation

### 10.1 Source locale is content-specific

Mira does not freeze one global source language.

A content identity may originate in Korean, English, Japanese, or another
later-approved Locale.

Each translated/localized revision may record:

```text
sourceLocale
sourceRevisionReference
translation/localization provenance
```

### 10.2 Locale revisions publish independently

It is valid for one content identity to have:

```text
ko -> published
en -> approved but unpublished
ja -> draft or absent
```

One incomplete locale must not block another locale by default.

### 10.3 Silent cross-language fallback is forbidden for approved main content

A missing Japanese product, policy, claim-bearing guide, or equivalent main
content must not silently use English or Korean while presenting itself as a
Japanese equivalent.

Page-family source policy may instead choose among:

```text
not published
explicit original-language presentation with disclosure and noindex
404 / unavailable
```

The choice must be explicit.

### 10.4 Machine translation

Machine- or model-generated translation is draft material only.

It may never become publication-authoritative solely because generation
succeeded.

Human review appropriate to the content risk is required before publication.

### 10.5 Source-revision staleness

A localized revision binds to its source lineage where translation is derived
from another locale.

Source changes should be classified no more finely than the actual workflow
needs. The initial semantic distinction is:

```text
NON_SEMANTIC_EDITORIAL
SEMANTIC
CLAIM_OR_POLICY
```

Expected effect:

```text
NON_SEMANTIC_EDITORIAL
  -> prior translation may remain eligible only through an explicit
     equivalence/review disposition

SEMANTIC
  -> dependent localized revision requires review

CLAIM_OR_POLICY
  -> dependent publication loses eligibility until the relevant new review/
     authority binding is satisfied
```

No automatic "close enough" carry-forward is authorized.

---

## 11. CommerceMarket overlays

### 11.1 Core versus overlay

Localized content should prefer a market-neutral core where the information is
genuinely independent of commercial market.

```text
LocalizedEditorialRevision
  -> language/editorial core

MarketCommerceOverlayRevision
  -> CommerceMarket-specific explanatory copy
```

### 11.2 Overlay non-authority

A Market overlay does not own:

- price;
- currency;
- sellability;
- stock/capacity;
- shipping quote;
- payment routing;
- physical product truth.

These should be projected from their governing runtime or policy authority
where appropriate rather than copied into editable text.

### 11.3 Fallback

Market-neutral content may be reused across CommerceMarkets when explicitly
declared compatible with that use.

Market-specific policy content must not fall back across markets.

---

## 12. Material claims and evidence

### 12.1 Not every sentence becomes a claim object

The system should not atomize every piece of prose.

Structured claim binding is required when a statement materially influences
customer judgment or carries an external truth/authority dependency.

Examples include:

- physical or technical product assertions;
- comparative performance claims;
- test/experimental claims;
- health-adjacent or safety-relevant claims;
- material commercial-policy statements;
- legal or eligibility claims.

### 12.2 Claim classes

The initial conceptual classes may include:

```text
PRODUCT_FACT
COMPARATIVE
EXPERIMENTAL
HEALTH_ADJACENT
COMMERCE_POLICY
LEGAL
CUSTOMER_EXPERIENCE
```

The exact enum is not frozen until source implementation requires it.

### 12.3 Required claim information

A material public claim should be capable of exposing or resolving:

```text
exact localized claim
subject / applicability
conditions and exceptions
authority reference
evidence/source reference where applicable
method where applicable
limitations / uncertainty
review date
content owner
```

### 12.4 Content approval does not approve evidence

A content reviewer may approve wording only after the required underlying
authority is valid.

Evidence and product/policy truth remain separately governed.

### 12.5 Dependency honesty

If required ProductTruthReference, evidence release, policy reference, or media
authority is not implemented or not available, content may remain a draft or
non-claim-bearing test fixture.

The system must not fabricate an authority reference to unblock publication.

---

## 13. Product Media and video

### 13.1 Media remains externally owned

Localized Public Content may reference approved Media Assets / Assignment
Revisions.

It does not own:

- canonical media byte identity;
- rights/consent;
- provenance;
- product applicability;
- approved use;
- readiness.

### 13.2 Text-bearing media

Text-bearing product or marketing media must be compatible with the requested
locale and, when materially market-specific, the relevant CommerceMarket.

A different-language asset must not be silently substituted as a localized
equivalent.

### 13.3 Video Companion

A future video companion may compose:

```text
approved video reference
localized title / direct answer
edited transcript or steps
chapters / timestamps
limitations
related products / policies
claim/evidence references
review metadata
```

The YouTube or video-host publication state does not itself establish Mira
companion-page approval.

Video structured data remains deferred until an actual public approved
companion page and approved video exist.

---

## 14. Page-family approval requirements

| Page family | Minimum content requirement |
|---|---|
| Product Page localized main copy | Locale/editorial approval + publication; additional claim/product approval for material product assertions |
| Guide / Explainer | Locale/editorial approval + publication; claim/evidence approval where material claims occur |
| Comparison / Decision | Locale/editorial + comparison/evidence authority for material comparison + publication |
| Policy Page | Locale/editorial + governing Market/Legal/Ops policy authority + publication |
| Evidence / Methodology | Locale/editorial + method/evidence authority + publication |
| Video Companion | Locale/editorial + valid media/video authority + required claim approvals + publication |
| FAQ block | Inherits the authority requirements of the claims/policies it contains; FAQ is not an approval bypass |

---

## 15. Product page, guides, policies, and FAQ boundaries

### 15.1 Product page

The product page should contain customer decision-critical summary content rather
than forcing customers to reconstruct the product from separate articles.

Expected categories may include:

- product name and concise identity;
- intended use / suitable conditions;
- material limitations;
- major construction/specification information approved for public expression;
- configuration/customization scope;
- care summary;
- relevant lead-time / policy summary projected from authority;
- important exclusions.

The exact first-launch field set remains a later UX/content decision.

### 15.2 Guide

Use a separate Guide for procedural or educational depth such as:

- wearing;
- cleaning;
- storage;
- detangling;
- measurement education;
- lace handling;
- adhesive/clip procedures.

### 15.3 Policy

Use a dedicated policy page for authoritative full terms such as:

- shipping;
- return;
- remake eligibility;
- warranty;
- customer-photo/privacy handling where applicable.

The page expresses its owner authority; it does not manufacture policy.

### 15.4 FAQ

FAQ is supplemental content.

It must not become:

- a policy warehouse;
- a substitute for material limitations;
- a hidden claim authority;
- an automatic entitlement to FAQ structured data.

---

## 16. Public identity, slugs, and equivalence

### 16.1 Stable identity

`PublicContentIdentity` is stable across locale revisions.

### 16.2 Slug is presentation/routing metadata

Different locales may use different slugs without becoming different content
identities.

Exact slug representation and redirect history are deferred.

### 16.3 Product route stability

The current `WigStyle`-ID product route need not be converted to localized slugs
as part of localized-content implementation.

Slug architecture is not a prerequisite for localized product authority.

---

## 17. Publication, indexability, hreflang, and structured data

### 17.1 Required separation

```text
source exists
  != revision approved

revision approved
  != revision published

revision published
  != page indexable

page indexable
  != hreflang-equivalent to every locale

page indexable
  != structured data admitted

public content
  != catalog commercially active

catalog active
  != checkout/payment active
```

### 17.2 Indexability admission

An indexable public localized page must satisfy, at minimum:

```text
approved exact localized revision
+ current publication pointer
+ required authority references still valid
+ page-family indexability eligibility
+ Public Discovery indexing gate ON
+ valid canonical public origin
```

### 17.3 Product page

A future indexable product page additionally requires the installed Public
Discovery intersection of:

- commercial publication / applicable catalog eligibility;
- active public SiteVariant;
- approved localized main content;
- page indexability;
- required product/claim/media authority for the visible content.

### 17.4 Hreflang

Hreflang is emitted only among actually approved, published, indexable
localized-equivalent pages.

A draft, missing, withdrawn, or noindex locale must not be emitted merely
because a SiteVariant exists.

### 17.5 Structured data

Structured data may only project visible, approved, authoritative page content.

This contract does not authorize:

- `Product`;
- `ProductGroup`;
- `Offer`;
- `OfferShippingDetails`;
- `MerchantReturnPolicy`;
- `VideoObject`;
- `FAQPage`;
- review/rating schema.

---

## 18. Withdrawal, invalidation, rollback, and history

### 18.1 Withdrawal

A public revision must be withdrawable when, for example:

- product truth is found incorrect or materially changed;
- policy changes;
- evidence is withdrawn or invalidated;
- media permission/readiness ends;
- a translation error changes material meaning;
- a safety, health-adjacent, legal, or material commercial issue appears.

Withdrawal does not delete history.

### 18.2 Authority invalidation

An approval may lose current eligibility if a required upstream authority
reference becomes invalid, superseded, revoked, expired, or materially changed.

The exact invalidation propagation mechanism is deferred to the source design.

### 18.3 Rollback

A prior approved revision may be selected again only if its current authority
dependencies remain valid.

Historical approval alone does not guarantee current eligibility.

### 18.4 Deletion

Approved or published revisions should preserve historical decision evidence.

Deletion policy for abandoned drafts is deferred to an actual retention/operator
need.

---

## 19. Initial implementation sequence

This is a re-entry sequence, not standing source authority.

### LPC-A0 — contract installation

```text
docs-only
reviewed installation of this contract
README pointer / bounded decision-log entry if required
no source/schema/migration/runtime effect
```

### LPC-A1 — repository editorial pilot

Smallest useful source slice:

```text
one non-production Guide/Explainer fixture
one Locale
repository-reviewed structured Markdown or restricted local MDX
default noindex
exact content identity / revision metadata
bounded renderer / route
no production material claim
no external CMS
```

### LPC-B1 — product localized-content authority

A separately authorized schema/source slice may implement:

```text
WigStyle-linked localized immutable revision
approval/publication semantics
legacy content import as draft only
locale-aware product read projection
```

This slice requires fresh schema/source design and migration review.

### LPC-C1 — Market overlay / policy

Implement only when real market-specific policy/content truth exists and the
governing authority is available.

### LPC-D1 — material claim / evidence / video bindings

Implement only when the required Product Truth, Evidence, and Product Media
references exist as usable source authority.

### LPC-E1 — indexability / structured-data activation

Only after actual approved public content exists.

---

## 20. Deferred capabilities and re-entry markers

### 20.1 Organizational scaling and delegated authority — DEFERRED

Current v0.1 operation assumes the Project Owner may perform multiple content
roles.

This contract intentionally does **not** pre-design a future organization,
detailed role hierarchy, team permissions, or separation-of-duties system.

Reopen this area when one or more of the following actually occurs:

- someone other than the Project Owner regularly authors production public content;
- a dedicated Locale translator/reviewer appears;
- Product/R&D, Commerce/Operations, Legal, or equivalent responsibility becomes
  separately staffed;
- an external translator, agency, or CMS operator participates in the workflow;
- approval or publication authority must be delegated;
- an operational, legal, quality, or security reason appears to separate author
  and approver.

At re-entry, review at least:

```text
generic ADMIN versus approval authority
delegated scope
grant/revocation semantics
self-approval rules
historical approval provenance
team role versus individual decision actor
external CMS role mapping
minimum necessary separation of duties
```

Do not implement these merely because this marker exists.

### 20.2 External CMS — DEFERRED

Reconsider when actual operations demonstrate needs such as:

- multiple non-developer editors;
- external translation vendors;
- frequent publishing independent of source deploys;
- scheduled coordinated launches;
- persistent editorial preview/workflow requirements;
- locale workflow dashboards.

At re-entry, compare external CMS, Mira DB authoring, and repository authoring
against:

```text
revision identity
locale independence
fallback control
approval provenance
role mapping
preview
publication mapping
export/backup
provider dependency
operational cost
truth-authority separation
```

### 20.3 Scheduled publishing — DEFERRED

No scheduler or publication calendar is required until a real timed-release
workflow exists.

### 20.4 Rich-text/page-builder CMS — DEFERRED

Do not build a generic block editor or page builder before a concrete content
family cannot be represented safely by the first repository/DB mechanisms.

### 20.5 Runtime machine translation — DEFERRED

No runtime translation fallback or auto-publish pipeline is authorized.

### 20.6 Public author profile system — DEFERRED

Public byline/reviewer presentation may later require a `PublicAuthorProfile`
or equivalent, but internal approval actor identity and public byline are
different concepts.

Do not create an author database until public author presentation actually
requires one.

### 20.7 Slug history / redirect authority — DEFERRED

Add only when localized slugs become an actual public route requirement.

### 20.8 Analytics / citation monitoring — DEFERRED

Search Console, ChatGPT referral measurement, AI citation panels, and similar
monitoring remain separate measurement/activation work.

---

## 21. Non-goals and prohibited shortcuts

The following are not authorized by v0.1:

```text
external CMS connection
generic PublicContent Prisma table for every page family
generic workflow engine
runtime AI translation
silent locale fallback for approved main content
remote/untrusted MDX execution
rich-text page builder
automatic legacy WigStyle localization approval
generic ADMIN as claim/policy/publication authority
content writer inventing product/commerce/evidence truth
Git merge as automatic domain approval
CMS publish status as automatic Mira publication
publication as automatic indexing
indexing as automatic commerce activation
structured ecommerce/video data
Search Console or Merchant Center mutation
crawler submission
production indexing activation
```

---

## 22. Acceptance criteria for this design contract

The contract is adequate for reviewed installation only if it preserves all of
the following:

1. Localized Public Content is expression/publication authority, not Product
   Truth, Commerce, Evidence, or Media authority.
2. Product localized merchandising content and long-form editorial content may
   use different storage classes without acquiring different approval meanings.
3. Localized product copy is DB-backed in the planned production authority;
   long-form editorial content starts repository-reviewed.
4. Exact revision identity is required for approval.
5. Generic `ADMIN` does not itself establish approval authority.
6. Solo Project Owner operation remains possible without fabricating a future
   organization.
7. Silent locale fallback for approved main content is not permitted.
8. Machine translation remains draft until appropriate human review.
9. Market-specific policy does not fall back across CommerceMarkets.
10. Material public claims depend on their governing truth/evidence authority.
11. Media rights/applicability remain under Product Media.
12. Publication, indexability, hreflang, structured-data admission, catalog
    activation, and checkout/payment activation remain distinct.
13. Withdrawal and rollback preserve historical revision/approval evidence.
14. Future organizational delegation and CMS adoption have explicit re-entry
    markers but no premature implementation.
15. This document alone grants no source/schema/migration/publication/indexing
    or production authority.

---

## 23. Change control

After reviewed merge, changes to any of the following require a new versioned
contract or a clearly bounded reviewed amendment:

- authority decomposition;
- selected storage-class split;
- meaning of exact revision approval;
- publication semantics;
- silent locale-fallback rule;
- product/claim/evidence authority relationship;
- Market overlay authority;
- Product Media relationship;
- indexability/hreflang admission relationship;
- organizational re-entry meaning if it begins granting present authority;
- external CMS authority mapping.

Routine implementation details that satisfy this contract do not require a new
contract version.

Source, schema, environment configuration, CMS state, team structure, or
external crawler behavior cannot silently amend this contract.

---

## 24. Design summary

```text
Product / Policy / Evidence / Media Truth
                  |
                  v
         Authority References
                  |
                  v
       Localized Expression
                  |
                  v
          Exact Revision
                  |
                  v
         Scoped Approval
                  |
                  v
        Public Publication
                  |
                  v
   Public Discovery Admission
       (index / hreflang / schema)
```

Physical storage is intentionally split:

```text
Localized product merchandising copy
  -> Mira DB-backed revisions

Guide / Comparison / Evidence / Video Companion
  -> repository-reviewed content initially
```

The stable rule is:

> Storage may differ by content family, but truth ownership, exact revision
> binding, approval, publication, withdrawal, and search-admission boundaries
> must remain explicit and non-collapsed.
