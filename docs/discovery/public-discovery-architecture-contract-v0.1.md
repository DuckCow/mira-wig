# Public Discovery Architecture Contract v0.1

## Status

```text
DESIGN:                 FROZEN v0.1 upon reviewed merge
SOURCE SLICE:           bounded foundation authorized only by WIG-MIRA-PDA-R0-S1-COD-BUILD-01
INDEXING ACTIVATION:    DEFAULT OFF / separately controlled
CONTENT APPROVAL:       NOT GRANTED
CATALOG APPROVAL:       NOT GRANTED
PRODUCTION ACTIVATION:  NOT GRANTED
CHANGE CONTROL:         supersedes: none | superseded-by: none
```

## 1. Purpose and failure mode

Mira has one Public Discovery Architecture for public Search–Answer–Citation
surfaces. SEO, AEO, and GEO are outcomes and readability concerns within that
architecture; they are not separate engines, databases, schemas, content stores,
or optimization frameworks.

This contract prevents public URL, indexing, content, commerce, product truth,
evidence, crawler permission, and later structured-data responsibilities from
collapsing into one ambiguous `Market.isActive` or catalog-publication signal.
Source and tests alone cannot durably assign these cross-phase authorities.

## 2. Scope and ownership

Public Discovery owns:

- public page-family classification;
- canonical URL and search-indexing policy;
- localized-page equivalence and explicit hreflang search targets;
- crawler and sitemap policy;
- answer-ready page composition;
- citation/evidence presentation requirements;
- future structured-data projection admission.

Public Discovery does not own or grant:

- product claims, product truth, media rights, or manufacturing truth;
- catalog commercial publication, price, stock, checkout, payment, shipping, or fulfillment;
- internal discovery query interpretation, candidate admission, retrieval,
  ranking, recommendation, result presentation, or discovery events;
- privacy, legal, seller-identity, or public-policy approval;
- customer-content publication or production activation.

The frozen Discovery Foundation remains the owner of internal product discovery
and recommendation. Public Discovery may link to commerce or internal discovery
surfaces but may not redefine their decisions.

## 3. Independent domain axes

### 3.1 CommerceMarket

The current repository symbols `Market` and `MarketCode` may remain. Their
official domain meaning is `CommerceMarket`:

> A CommerceMarket is the commercial-policy bundle that owns the customer
> offer, including the relevant combination of currency, price book,
> product/variant commercial availability, seller/contract context, payment
> routing capability, baseline shipping/return/remake/warranty policy, and
> checkout financial authority.

A CommerceMarket is not inherently one ISO country, language, culture,
audience, delivery country, tax jurisdiction, fulfillment zone, or hreflang
region. Current `KR`, `US`, and `JP` codes happen to coincide with country
codes; that coincidence is not an architectural rule.

### 3.2 Other axes

- `Locale` owns presentation and editorial language.
- `DeliveryCountry` is shipping eligibility and quote input.
- `ShippingAddress` is customer-provided delivery data.
- `AudienceSegment` owns customer need/style/content segmentation and never
  commercial authority.
- `FulfillmentZone` owns operational fulfillment grouping.
- `TaxJurisdiction` owns tax applicability.
- `HreflangTarget` is explicit search-target metadata on an enabled SiteVariant.
- `ContentPublication` means approved public availability of content.
- `CommerceActivation` means the applicable commercial capability is active.
- `EvidenceAuthority` owns the basis and approval for a material public claim.

These axes remain distinct. GeoIP may suggest presentation only. DeliveryCountry
does not enter the public canonical path.

## 4. URL and localized equivalence

The public URL family remains:

```text
/{market}/{locale}
```

Canonical Market path segments remain lowercase. `/global` is the `x-default`
destination. `HreflangTarget` is explicit SiteVariant metadata and must never be
constructed by concatenating Locale and CommerceMarket code.

The first explicit targets are:

| CommerceMarket / Locale | HreflangTarget |
|---|---|
| KR / ko | `ko-KR` |
| KR / en | `en-KR` |
| US / en | `en-US` |
| US / ko | `ko-US` |
| JP / ja | `ja-JP` |
| JP / en | `en-JP` |

An hreflang set is emitted only for an approved, indexable localized-equivalence
set. It is self-inclusive and reciprocal across active SiteVariants and includes
`x-default` at `/global`.

## 5. Conceptual content composition

Public pages may later compose:

```text
PublicContentIdentity
+ LocalizedEditorialVersion
+ optional MarketCommerceOverlay
+ Evidence/Source blocks
+ Media/Video assets
```

These names define responsibilities, not database tables. This contract creates
no content schema, CMS, MDX pipeline, author table, Evidence table, VideoAsset
table, translation workflow, or page builder.

Publication and search indexability are distinct from `Market.isActive`, catalog
commercial publication, checkout, payment routing, provider activation, and
evidence approval. This slice does not provide browse-only inactive
CommerceMarkets; active CommerceMarkets still bound current storefront routes.

## 6. Page families

The architecture supports these future public families:

- Product Page;
- Guide / Explainer;
- Comparison / Decision Page;
- Policy Page;
- Evidence / Methodology Page;
- Video Companion Page.

FAQ is a reusable visible content block. It is not a policy warehouse, a
replacement for material limitations, a universal content authority, or an
automatic entitlement to FAQ structured data.

## 7. Answer-ready composition

When applicable, a guide, comparison, or evidence page should expose:

- question or title;
- short direct answer;
- decision conditions and exceptions;
- evidence or source;
- limitations and uncertainty;
- last reviewed date;
- author or reviewer when relevant;
- related product, policy, or consultation path after the answer.

This is a visible page-composition contract. It does not create an AEO runtime
service.

## 8. Citation-ready claims

A material public claim must be able to state:

- the exact claim;
- applicability and conditions;
- source or observation;
- method;
- review date;
- uncertainty or limitation;
- content owner.

The existence of a database value, demo phrase, image, active row, or Market
publication is not evidence approval. This contract creates no GEO runtime
service.

## 9. Video companion pattern

A later video surface should compose:

```text
YouTube video
+ Mira companion web page
+ visible direct answer
+ edited transcript or steps
+ chapters or timestamps
+ limitations
+ related products or policies
```

No video route, video asset, `VideoObject`, `Clip`, or `SeekToAction` is
authorized or installed by this slice.

## 10. Structured-data admission

Structured data must mirror visible, approved content. Admission remains
deferred as follows:

- `Product`, `ProductGroup`, and `Offer` wait for approved production product
  identity, localized visible copy, purchase availability, and price truth.
- `OfferShippingDetails` and `MerchantReturnPolicy` wait for approved visible
  shipping and return policy truth.
- `VideoObject` waits for an actual public companion page and approved video.
- `Organization` waits for approved legal seller facts.
- `FAQPage` is not a first-slice requirement and requires an eligible visible FAQ.
- Reviews and ratings require separately approved, visible source truth.

No AI-specific schema, `llms.txt`, empty JSON-LD builder, Merchant Center feed,
or structured product/video data is installed.

## 11. Activation and canonical origin

The server-owned key is `PUBLIC_SEARCH_INDEXING_ENABLED`:

```text
absent or blank/whitespace -> OFF
trimmed exact ENABLED      -> ON
other nonblank value       -> invalid configuration / fail closed
```

The key authorizes indexing only for page classes already eligible in source.
It does not publish or approve content/catalog data, enable checkout/payment,
permit GPTBot, or grant provider/customer activation.

When the gate is ON, `NEXTAUTH_URL` is the canonical-origin authority and must
be an absolute external HTTPS root URL without credentials, query, or fragment.
Localhost, loopback, private/local development hosts, non-root paths, and
request-derived hosts are rejected. Request Host, forwarded host, GeoIP,
cookies, Locale, CommerceMarket, and database rows cannot establish canonical
origin or activate indexing. Payment public-origin and routing authorities
remain independent.

The separations are exact:

```text
source installed != indexing enabled
indexing enabled != content approved
content approved != catalog approved
catalog approved != checkout enabled
search inclusion != model-training permission
```

## 12. First-slice page-class policy

| Page class | Gate OFF | Gate ON | Hreflang | Sitemap |
|---|---|---|---|---|
| `GLOBAL_SELECTOR` | noindex/follow | index/follow only with at least one active SiteVariant | none | only when indexable |
| `STOREFRONT_HOME` | noindex/follow | index/follow | reciprocal active homes + `/global` x-default only while indexable | active homes only |
| `CATALOG_LIST` | noindex/follow | noindex/follow | none | excluded |
| `CATALOG_DETAIL` | noindex/follow | noindex/follow | none | excluded |
| `TRANSACTIONAL_OR_PRIVATE` | noindex/nofollow | noindex/nofollow | none | excluded |

Canonical self URLs may remain on crawlable noindex public pages. Robots
disallow is never the sole noindex mechanism.

Current style list/detail pages use DB-owned nonlocalized `style.name` and
`style.description`. They remain customer-accessible and commercially unchanged,
but are noindex, omitted from sitemap, and emit no false language alternates.
Their current product/Market publication intersection remains intact. A future
product equivalence set is the intersection of commercial publication, active
public SiteVariant, approved localized main content, and page indexability.

## 13. Sitemap and crawler policy

When indexing is OFF, the sitemap advertises no URLs. When ON, it contains only
fully qualified `/global` and active SiteVariant home URLs, in deterministic
source order, and only when at least one active SiteVariant exists. It contains
no query URLs, catalog pages, private/transactional routes, fabricated
`lastModified`, `changeFrequency`, or `priority`, and no duplicate sitemap
hreflang projection. HTML metadata owns hreflang.

Crawler policy is:

- ordinary search crawlers may crawl public pages and are not globally blocked;
- `OAI-SearchBot` receives the same public access and exact non-public path
  exclusions as ordinary crawlers;
- `GPTBot` is disallowed from the entire site;
- Google-Extended policy is deferred;
- authorization, not robots policy, remains the privacy boundary.

Current non-public route families include admin, API, cart, checkout/payment
return, orders, fitting result, and login surfaces. Transactional/private HTML
also receives `noindex, nofollow` response protection. Public `/global`, home,
and catalog routes are not classified as private; catalog noindex/follow is a
separate evidence policy.

## 14. Measurement design

No external account or analytics integration is authorized. A later measured
activation may evaluate:

- Search Console performance by CommerceMarket/Locale URL;
- index coverage and rich-result validity;
- organic query, click, and conversion;
- ChatGPT referral using `utm_source=chatgpt.com`;
- a fixed multilingual citation-query panel;
- answer accuracy and misquotation review.

## 15. Open capabilities and re-entry gates

The following remain open and require bounded later authority:

- localized product-content persistence;
- guide/evidence authoring storage, including MDX versus CMS;
- browse-only inactive CommerceMarkets;
- production content and claim approval workflow;
- Merchant Center feed;
- actual Product/Video structured data;
- Google-Extended policy;
- Search Console property ownership;
- AI citation-monitoring automation.

The exact next bounded phase is localized public-content authority and approval
design, beginning with product-content persistence versus guide/evidence
authoring storage. It must not infer production claims from current demo data.

## 16. Change control

Changes to the authority axes, page-class policy, crawler policy, structured-data
admission, or activation meaning require a new versioned contract and a human
decision record. Source, rows, environment configuration, or external crawler
behavior do not silently amend this contract.
