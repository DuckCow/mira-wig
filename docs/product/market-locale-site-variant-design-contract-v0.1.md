# WIG-COM-MKT-S0A-D1-v0.1
## Market × Locale Storefront Context, Resolution, Presentation, and Transaction-Safety Design Contract

**Date:** 2026-08-13  
**Repository:** `DuckCow/mira-wig`  
**Authoritative source baseline:** `6f33dcad60295f3ac0d3f1b9d100e4213633218f`  
**Document state:** `DESIGN CONTRACT CANDIDATE — REQUIRES FRESH SOURCE REVIEW BEFORE FREEZE`  
**Primary worktree for review/implementation:** `/private/tmp/mira-market-locale-recon-20260813`

---

## 0. Purpose

Mira must serve global customers without conflating:

- the commercial market that controls catalog, price, currency, payment eligibility, and selling policy;
- the locale that controls language and presentation;
- the intended delivery country used to select or confirm the commercial market;
- the full shipping address that finally determines delivery eligibility, shipping quote, tax/duty treatment, and delivery estimate.

This contract preserves the existing commerce-market foundation while adding an explicit `Market × Locale` storefront model, deterministic first-visit and returning-user resolution, localized presentation and media selection, safe market switching, and checkout consistency.

This contract does **not** authorize live payment-provider activation, production shipping quotes, tax engines, account-preference migrations, product-translation database schema, or launch-catalog publication.

---

## 1. Current-main facts that constrain the design

At baseline `6f33dcad...`:

1. `MarketCode` already supports `KR`, `US`, and `JP`.
2. Each market already owns a currency, `shippableCountries`, and a `defaultLocale`.
3. Server resolution is currently `mira-market cookie > GeoIP country > KR fallback`.
4. The existing `mira-market` cookie is written only by the explicit market selector; GeoIP inference is not persisted.
5. The market selector directly changes the cookie and revalidates the layout; it does not inspect cart impact.
6. Cart rows do not persist market or price. The same global cart is reinterpreted against the current market at read and checkout time.
7. `CheckoutSession` snapshots market, currency, product line prices, shipping address, and totals.
8. Checkout currently derives a single fixed shipping country from the selected market, and shipping amount is currently `0`.
9. Checkout submission rereads the current market cookie but does not receive or verify the market under which the form was rendered.
10. Root layout is fixed to `<html lang="ko">`; customer copy is predominantly hard-coded Korean.
11. `User` has no market or locale preference fields.
12. `WigStyle` has one `name`, `description`, and `tags` set; product translation authority is not yet modeled.

The implementation must reuse these facts where safe and must not silently introduce a second commercial-market authority.

---

## 2. Domain definitions and authority

### 2.1 Commercial Market

`CommercialMarket` answers:

> What can this customer buy, under which commercial terms?

It owns:

- catalog publication;
- variant price amounts;
- currency;
- market-level payment-method eligibility;
- market-level shipping eligibility policy;
- selling, cancellation, return, and market-specific commercial policy;
- market-specific campaigns or claims.

It does **not** own the final shipping amount, final tax/duty quote, or UI language.

### 2.2 Locale

`Locale` answers:

> In which language and formatting convention is the experience presented?

It owns:

- UI messages;
- navigation and help copy;
- accessibility text;
- localized metadata;
- display formatting conventions for numbers and dates;
- localized presentation and language-bearing asset selection.

It does **not** change product price amounts, currency, publication, shipping eligibility, or payment authority.

### 2.3 Delivery Country

`DeliveryCountry` answers:

> To which country does the customer currently intend to have the order delivered?

It can select or confirm a commercial market through an explicit mapping. It has evidence states:

- `INFERRED`: system hint, normally GeoIP;
- `HISTORIC_VERIFIED`: prior completed/submitted order shipping country;
- `REMEMBERED_EXPLICIT`: prior explicit selector choice;
- `CURRENT_CONFIRMED`: explicit choice in the current flow;
- `CURRENT_VERIFIED`: current checkout address.

Passive page visits must never be promoted into an explicit delivery-country preference.

### 2.4 Shipping Address and Fulfillment Quote

The full shipping address owns final delivery validation inputs. A future fulfillment quote owns:

- actual shipping amount;
- carrier/service;
- origin and destination;
- estimated delivery;
- quote expiry;
- tax/duty quote or disclosure.

The initial implementation keeps the existing fixed market-country relationship and zero shipping amount; it must not pretend those are final production shipping semantics.

### 2.5 Site Variant

A `SiteVariant` is one enabled pair:

```text
CommercialMarket × Locale
```

It is a presentation and routing projection, not a new pricing or product identity.

---

## 3. Supported codes and initial enabled variants

### 3.1 Market codes

```text
KR
US
JP
```

Internal market codes remain uppercase. Public URL segments are lowercase:

```text
kr
us
jp
```

### 3.2 Locale codes

```text
ko
en
ja
```

Locale codes must be a closed typed vocabulary.

### 3.3 Initial enabled `SiteVariant` allowlist

```text
KR × ko   default for KR
KR × en

US × en   default for US
US × ko

JP × ja   default for JP
JP × en
```

The architecture supports a subset of the Cartesian product. It must not automatically expose every market-locale pair.

An unsupported pair preserves the market and falls back deterministically:

1. requested locale if enabled for the requested market;
2. the market's typed default locale;
3. `en` only if explicitly enabled for that market;
4. otherwise fail closed as a configuration error.

---

## 4. Public URL architecture

### 4.1 Crawlable storefront URLs

Public, indexable storefront pages use explicit market and locale segments:

```text
/{market}/{locale}
/{market}/{locale}/styles
/{market}/{locale}/styles/{styleId}
```

Examples:

```text
/kr/ko/styles
/us/ko/styles
/jp/en/styles
```

The URL controls the current page's market and locale. Cookies, account history, order history, GeoIP, and `Accept-Language` must not silently override an explicit valid URL.

Opening an explicit URL does not by itself persist a preference. Shared links and comparative browsing must not become remembered delivery intent.

### 4.2 Non-prefixed authority and private routes

The following remain outside market-locale URL prefixes unless a later contract explicitly changes them:

```text
/api/**
/admin/**
/login
/cart
/checkout/**
/orders/**
/fitting/**
/checkout/return/**
```

Reasons:

- API and provider ingress must not acquire presentation routing semantics.
- Payment return/resume identity is the checkout session, not market or locale URL state.
- Private customer routes do not need separate indexed URLs and can resolve locale from explicit preference/session context.

### 4.3 Resolver entry and x-default

Use two distinct entry concepts:

```text
/
  temporary storefront resolver for ordinary direct visits

/global
  explicit country-language selector and x-default target
```

`/` may issue only a temporary redirect to the resolved `SiteVariant`. It must not persist an inferred market or locale.

`/global` must be a stable, language-light selector page with links to every enabled `SiteVariant`. `hreflang="x-default"` points to `/global`, not to a market-specific page.

Legacy public routes such as `/styles` and `/styles/{id}` may temporarily redirect to the resolved site variant. Context-dependent redirects must not be permanent.

---

## 5. Resolution rules

### 5.1 Explicit URL rule

For an explicit valid `/{market}/{locale}/...` request:

```text
URL market and locale win for this page.
```

Saved preferences and IP may produce a nonblocking suggestion but never a forced redirect.

### 5.2 Root market resolution

For `/` or a legacy unprefixed public route, resolve market in this order:

```text
1. active immutable checkout context, when the request is genuinely resuming it;
2. current-session explicit delivery-country/market choice;
3. account explicit market preference — implementation phase 2;
4. browser explicit market cookie (`mira-market`);
5. recent verified order shipping country — implementation phase 2;
6. GeoIP country mapped to an active market;
7. configured default market.
```

Passive prior visits are never a resolver input.

The existing `mira-market` cookie remains an **explicit-preference cookie**. IP inference, URL visits, and ordinary page rendering must never write it.

### 5.3 Root locale resolution

Resolve locale independently:

```text
1. current-session explicit locale choice;
2. account explicit locale preference — implementation phase 2;
3. browser explicit locale cookie (`mira-locale`);
4. parsed `Accept-Language` preference among locales enabled for the resolved market;
5. the resolved market's default locale.
```

Order country, IP country, and shipping address must not infer language.

### 5.4 Current page versus remembered preference

A current explicit URL can differ from remembered preference. The page uses the URL. Preference changes only through an explicit selector confirmation.

### 5.5 First-price confirmation

If market is inferred rather than explicitly remembered or confirmed:

- the inferred market price may be shown immediately;
- every price-bearing page must clearly show the active delivery country/market;
- a nonblocking prompt asks whether the customer will receive delivery in that country;
- Add to Cart must require explicit confirmation before creating or changing cart state.

Confirming writes `mira-market`. Merely dismissing or viewing does not.

---

## 6. Persistence and provenance

### 6.1 Browser preference cookies

Reuse:

```text
mira-market
```

Add:

```text
mira-locale
```

Both cookies:

- represent explicit choices only;
- are first-party;
- use `path=/`, `httpOnly`, `sameSite=lax`, and a bounded long-lived expiry;
- are never written from GeoIP or `Accept-Language` inference;
- are not analytics history.

### 6.2 Account preferences — phase 2

Cross-device persistence is required, but not in implementation phase 1.

A later reviewed migration may introduce one explicit account preference record. It must store market and locale independently with explicit-selection timestamps. It must not store passive visit history as preference.

### 6.3 Prior order fallback — phase 2

A recent order shipping country is `HISTORIC_VERIFIED`, not a current instruction. It may initialize root resolution only when no current or remembered explicit preference exists. The first price-bearing page should still offer confirmation.

Order country must never infer locale.

---

## 7. Market and locale switching

### 7.1 Locale switch

A locale switch:

- keeps the commercial market;
- keeps cart contents;
- keeps price amounts and currency;
- keeps checkout/session financial facts;
- navigates to the equivalent public route when on a prefixed storefront page;
- writes the explicit locale cookie;
- falls back only to a locale enabled for the current market.

No commerce-impact confirmation is required.

### 7.2 Market switch with empty cart

When no cart item exists:

- resolve the target market;
- preserve the current locale if enabled there, otherwise use target default;
- write the explicit market cookie only after the user's action;
- navigate/revalidate.

### 7.3 Market switch with nonempty cart

A market switch must never silently reinterpret the cart.

The server computes a `MarketSwitchImpact` using current and target market facts:

```text
currentMarket
targetMarket
currentCurrency
targetCurrency
line identities
current unit amount
target unit amount
availability in target market
price-change classification
```

The UI shows:

- currency change;
- each repriced line;
- each unavailable line;
- a statement that unavailable lines will remain visible but block checkout.

No item is silently deleted.

Confirmation triggers a fresh server recomputation. If the cart or market facts changed since preview, return `IMPACT_CHANGED` and require a new confirmation.

A market switch does not rewrite historical checkout sessions or orders.

### 7.4 Global cart decision

Phase 1 preserves the existing global cart rather than introducing separate carts per market.

This is accepted only with explicit switch preview/confirmation and checkout-time revalidation. Cross-device cart-market anchoring remains an explicit phase-2 question; it must not be silently assumed solved.

---

## 8. Checkout consistency

### 8.1 Rendered-market binding

Checkout form rendering supplies:

```text
expectedMarketCode
```

Submission sends it to the server. The server:

1. parses and validates the expected market;
2. resolves the current market from server authority;
3. requires exact equality;
4. rejects with `MARKET_CHANGED` before session creation if they differ.

This closes the cross-tab race where a form rendered in market A is submitted after another tab changes the market cookie to B.

### 8.2 Shipping-country validation

Phase 1 preserves the current one-market/one-country checkout form. The server still validates that shipping country belongs to `market.shippableCountries`.

A later shipping contract will allow full-address verification, market mismatch impact preview, shipping quotes, tax/duty facts, and delivery estimates. Phase 1 must not simulate those capabilities.

### 8.3 Locale in checkout

Locale is nonfinancial. Changing locale must not alter an existing checkout commitment.

A future migration may snapshot locale on checkout/order for customer communications. It is excluded from phase 1.

### 8.4 Existing session after a later market change

A previously created checkout session remains an immutable historical commitment. Changing the browser market does not mutate it.

The UI must not present a stale session as if it belonged to a newly selected market. Existing provider-neutral return/resume remains session-identity based and unprefixed.

---

## 9. Price formatting

Price authority and display formatting must be separated:

```text
amount + currency:
  CommercialMarket authority

digit/group/date language convention:
  Locale presentation authority
```

Current `CurrencyMeta.locale` must not force US market prices to use English formatting when locale is Korean.

The implementation should expose a typed formatter equivalent to:

```text
formatPrice(amount, currency, locale)
```

Changing locale can change formatting, never amount or currency.

---

## 10. UI messages and content

### 10.1 Initial localization mechanism

Phase 1 uses a typed repository-owned dictionary and does not add a third-party i18n dependency unless a fresh implementation reconnaissance proves that doing so materially reduces risk.

Required locale dictionaries:

```text
ko
en
ja
```

Message keys must be typed or validated at build/test time. Missing required messages fail closed in development/tests; production must not silently fall back to another language for critical commercial copy.

### 10.2 Product content

Current `WigStyle.name`, `description`, and `tags` are single-language fields. Phase 1 must not invent production translations or silently machine-translate product truth.

Public global launch remains blocked until product-localization authority is separately installed. Phase 1 may use explicit demo/test fixtures to exercise localized UI, clearly separated from production catalog truth.

---

## 11. Market × Locale presentation and media

Define a typed `SiteVariantPresentation` projection for slots such as:

```text
home.hero
home.primaryCta
home.featuredSection
home.trustMessage
home.deliveryMessage
home.campaignBanner
```

### 11.1 Text-bearing image rules

If an image contains language, price, shipping, legal, or promotion text, it is a `Market × Locale` asset.

Selection order:

```text
1. exact Market × Locale asset;
2. same-locale global/market-neutral asset when semantically valid;
3. language-free global asset;
4. omit or block the required slot.
```

Never fall back to a different-language asset.

### 11.2 Preferred creative rule

Prefer language-free photography/illustration with HTML text overlays. Use text-bearing image variants only when the text is integral to the artwork.

### 11.3 No fabricated assets

Phase 1 installs the selection contract and test fixtures. It does not fabricate launch media or claim that localized production assets exist.

---

## 12. SEO and metadata

Every crawlable `SiteVariant` page must provide:

- dynamic `<html lang>`;
- locale-specific title and description;
- canonical URL for the exact market-locale page;
- alternates for every enabled equivalent `SiteVariant`;
- `x-default` pointing to `/global`;
- sitemap entries for enabled public variants;
- stable server-rendered content for the explicit URL.

A public market-locale URL must not serve different language or market content merely because the IP changed.

Private, cart, checkout, order, fitting, admin, API, and payment-return routes remain excluded from indexing as appropriate.

---

## 13. Privacy and data minimization

Do not store browsing history merely to resolve market or locale.

Phase 1 needs only:

- explicit market cookie;
- explicit locale cookie;
- request-time GeoIP country hint;
- request-time `Accept-Language` hint.

Do not retain raw IP for preference resolution. Do not mix preference cookies with advertising or analytics identity.

Account preference and prior-order fallback require a separate data-retention and migration review in phase 2.

---

## 14. Error and fail-closed behavior

Fail closed when:

- route market is unknown;
- route locale is unknown;
- the market-locale pair is not enabled and no deterministic market-local fallback exists;
- a market has no price for a cart line;
- a style is unpublished in the selected market;
- checkout expected market differs from current server market;
- market-switch impact changed before confirmation;
- a required commercial message or language-bearing asset is missing.

Do not silently:

- change currency;
- delete cart items;
- translate product truth;
- switch an explicit URL based on IP;
- persist an inferred market or locale;
- treat a passive visit as a preference.

---

## 15. Implementation phases

### Phase 1 — Storefront context, public routing, presentation, and transaction safety

One bounded implementation lifecycle may include:

1. typed locale and site-variant vocabulary;
2. enabled pair allowlist and validation;
3. independent market/locale resolver primitives;
4. explicit locale cookie/action;
5. `/`, `/global`, and prefixed public storefront routes;
6. context-aware navigation and combined region/language selector;
7. dynamic `html lang`, metadata, canonical, alternates, and sitemap;
8. typed UI dictionaries for the implemented customer surfaces;
9. typed home presentation/media slots with safe fallback;
10. inferred-market confirmation before Add to Cart;
11. market-switch impact preview and confirmation;
12. checkout `expectedMarketCode` gate;
13. parent commerce, payment, refund, API, admin, and return/resume invariance tests.

Implementation may be split into ordered commits or PRs if no intermediate state exposes an unsafe selector or silently reinterprets carts. Customer activation must not occur in an intermediate unsafe state.

### Phase 2 — Cross-device preferences and historical verified fallback

Requires a separate reviewed migration and contract for:

- explicit account market preference;
- explicit account locale preference;
- recent order country fallback;
- login/shared-browser precedence;
- possible persistent cart-market context.

### Phase 3 — Product translations and production media

Requires separate authority for:

- localized product name/description/tag content;
- market-specific same-language adaptations;
- production media asset assignment and rights;
- launch content completeness gates.

### Phase 4 — Shipping, tax, duty, and fulfillment quote

Requires separate authority for:

- full-address destination verification;
- origin selection;
- shipping zones or carrier quotes;
- tax/duty quote or disclosure;
- quote expiry and checkout snapshot;
- explicit market transition when address country differs.

---

## 16. Required phase-1 tests

### 16.1 Pure resolution

- explicit route beats cookies and IP;
- explicit market cookie beats GeoIP on root;
- GeoIP selects market only when no explicit preference exists;
- inferred values are not persisted;
- explicit locale cookie beats `Accept-Language`;
- `Accept-Language` chooses only a locale enabled for the resolved market;
- unsupported pair falls back deterministically without changing market;
- passive visit does not create preference.

### 16.2 Site variants and navigation

- all six enabled variants validate;
- disabled combinations reject or fallback as contracted;
- market switch preserves locale when supported;
- market switch uses target default locale otherwise;
- locale switch never changes market;
- explicit URL is not redirected because of IP or stored preference;
- legacy public route uses temporary context-aware redirect.

### 16.3 Content and media

- exact `Market × Locale` content selected;
- same-locale neutral fallback works only when allowed;
- language-free fallback works;
- wrong-language asset never appears;
- missing required commercial slot fails closed;
- `html lang`, metadata, canonical, and alternates match the route.

### 16.4 Cart switch

- empty-cart switch is immediate;
- nonempty-cart switch returns exact price/currency/availability impact;
- no cart item is deleted;
- repriced and unavailable lines are identified;
- stale impact confirmation returns `IMPACT_CHANGED`;
- locale switch leaves cart interpretation unchanged.

### 16.5 Checkout

- rendered market A + submitted current market A succeeds subject to existing guards;
- rendered market A + cookie changed to B returns `MARKET_CHANGED` before session creation;
- shipping country outside market remains rejected;
- locale change alone does not invalidate checkout;
- existing CheckoutSession market/currency/line snapshots remain unchanged;
- payment return/resume routes and status authority remain unmodified.

### 16.6 Protected boundaries

- no provider activation;
- no payment/refund semantic change;
- no Prisma migration in phase 1 unless separately authorized;
- no API/admin prefixing;
- no customer route imports server-only resolver code into client bundles;
- no localized diagnostic/admin code in customer chunks.

---

## 17. Acceptance criteria

Phase 1 is complete only when:

```text
1. Market and Locale are independent typed authorities.
2. Every crawlable public storefront page has an explicit enabled SiteVariant URL.
3. First-visit inference never becomes remembered preference without explicit confirmation.
4. Explicit URL intent is never overridden by cookie/IP.
5. Text-bearing localized assets cannot fall back to the wrong language.
6. Market switching cannot silently delete or reprice a nonempty cart.
7. Checkout rejects rendered-market/current-market mismatch before creating a session.
8. Existing commerce/payment/refund/return-resume authority remains preserved.
9. Focused tests, full verify, and production build pass.
10. No production launch content, product translations, shipping quote, or provider capability is falsely claimed.
```

---

## 18. Explicit exclusions

Phase 1 excludes:

- live payment-provider activation;
- Eximbay runtime work;
- shipping carrier integration;
- tax or duty engine;
- DDP/DAP automation;
- account preference migration;
- prior order fallback source;
- persistent cart aggregate redesign;
- product translation database;
- full CMS/page builder;
- production launch catalog or media population;
- semantic search/recommendation;
- renderer work;
- manufacturing and shipment lifecycle.

---

## 19. Review and change control

Before source implementation:

1. perform a fresh source-grounded review of this contract against current main;
2. classify every requirement as `SUPPORTED`, `REQUIRES_SOURCE_CHANGE`, `DEFERRED`, or `CONFLICT`;
3. resolve any conflict with existing checkout/payment authority before editing;
4. freeze the reviewed contract with its byte count and SHA-256;
5. perform implementation in a dedicated branch/worktree;
6. conduct independent source review before staging or running any customer activation.

A requirement that forces modification of payment finalization, refund authority, provider callback, order finalization, or a frozen C0 invariant must be escalated rather than absorbed into this phase.

---

## 20. Final design disposition

```text
Market and Locale:
  SEPARATE AUTHORITIES

SiteVariant:
  ENABLED SUBSET OF MARKET × LOCALE

Public storefront URL:
  /{market}/{locale}/...

Explicit URL precedence:
  PRESERVE

GeoIP / Accept-Language:
  INFERENCE ONLY / NEVER AUTO-PERSIST

Remembered browser preference:
  EXPLICIT CHOICES ONLY

Passive visit history:
  NOT A PREFERENCE

Cart model in phase 1:
  GLOBAL CART PRESERVED WITH IMPACT CONFIRMATION

Checkout:
  EXPECTED-MARKET CONSISTENCY GATE REQUIRED

Localized text-bearing media:
  EXACT SITE-VARIANT OR SAFE SAME-LOCALE/LANGUAGE-FREE FALLBACK

Account/order history:
  PHASE 2

Shipping/tax quote:
  PHASE 4
```
