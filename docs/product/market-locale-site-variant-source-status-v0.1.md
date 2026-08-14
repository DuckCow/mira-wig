# Market × Locale Storefront Source Status v0.1

## Status

```text
DOCUMENT CLASS:
  SOURCE STATUS / AS-BUILT
DESIGN AUTHORITY:
  docs/product/market-locale-site-variant-design-contract-v0.1.md
RELATED MARKET POLICY:
  docs/market_policy/market_language_shipping_policy_v1.md
PAYMENT BOUNDARY RECORD:
  docs/payment_policy/market-locale-payment-session-identity-boundary-v0.1.md
SOURCE IMPLEMENTATION:
  COMPLETE — PHASE 1
SOURCE REVIEW:
  COMPLETE
HUMAN DIFF REVIEW:
  COMPLETE
REVIEWED SOURCE HEAD:
  d575537bb308cf8ba9f67ac55d7e41fc90d7d082
MAIN MERGE:
  b34ef9628319b7862fb75d1df6ea5926f284f95b
PULL REQUEST:
  #62
PR CI:
  SUCCESS — run 31764275002 / CI #337
POST-MERGE MAIN CI:
  SUCCESS — run 31765301624 / CI #338
PRODUCTION DEPLOYMENT:
  NOT AUTHORIZED OR EVIDENCED BY THIS RECORD
CUSTOMER / PRODUCTION ACTIVATION:
  NOT ESTABLISHED BY THIS RECORD
LIVE OR EXTERNAL SANDBOX PAYMENT PROVIDER ACTIVATION:
  NONE
SCHEMA / MIGRATION CHANGE:
  NONE
CHANGE CONTROL:
  supersedes: none | superseded-by: none
```

## 1. Document role and non-authority

This document records the reviewed Market × Locale Phase-1 source truth
installed on `main` by merge commit
`b34ef9628319b7862fb75d1df6ea5926f284f95b`.

It is descriptive source authority for the installed source at that merge. It
is not a new design contract, deployment record, provider-activation record, or
customer-activation record.

- The frozen
  [Market × Locale Design Contract v0.1](./market-locale-site-variant-design-contract-v0.1.md)
  records the pre-implementation semantics, authority separation, safety
  boundaries, and deferred phases.
- The
  [Market, Language, and Shipping Country Policy v1](../market_policy/market_language_shipping_policy_v1.md)
  remains an earlier design record. Its historical “Current Implementation
  Facts” are not a substitute for this post-merge source-status record.
- The
  [Market × Locale payment session-identity boundary v0.1](../payment_policy/market-locale-payment-session-identity-boundary-v0.1.md)
  records the reviewed payment-boundary adjudication installed with Phase 1.
- This record does not retroactively rewrite the design contract's
  pre-implementation status or its historical worktree provenance.

Source installation does not itself authorize production deployment, customer
exposure, live providers, external sandbox providers, shipping carriers, tax
engines, workers, infrastructure, or any Phase 2–4 capability.

## 2. Reviewed source and merge chain

```text
6f33dcad60295f3ac0d3f1b9d100e4213633218f
  prior main baseline

d575537bb308cf8ba9f67ac55d7e41fc90d7d082
  feat(commerce): add market-locale storefront foundation

b34ef9628319b7862fb75d1df6ea5926f284f95b
  Merge pull request #62 from DuckCow/feat/market-locale-site-variant-s0a
```

PR #62 binds the final branch, human review, and pull-request CI conversation.
The merge commit, current source, tests, design contract, payment-boundary
record, and this source-status record are the durable repository evidence.

The reviewed feature commit changed 85 paths:

```text
46 modified
38 added
1 deleted

5,407 insertions
854 deletions
```

The one tracked deletion was the old `src/middleware.ts`; its admin boundary was
migrated into the installed Next.js `src/proxy.ts` boundary.

## 3. Installed Phase-1 capabilities

### 3.1 Independent Market and Locale axes

Installed Market codes remain `KR`, `US`, and `JP`; installed Locale codes are
`ko`, `en`, and `ja`.

The enabled public SiteVariant allowlist is exactly:

```text
KR × ko
KR × en
US × en
US × ko
JP × ja
JP × en
```

This is an allowlist, not a full Cartesian product.

Market remains commerce authority for market-scoped publication, price,
currency, shipping-country eligibility, and new-checkout admission. Locale is
presentation authority and does not change amount, currency, publication,
cart commerce authority, CheckoutSession facts, Payment facts, or Order facts.

### 3.2 Root and explicit-route resolution

For a root/non-explicit storefront request with at least one active Market,
Market resolution is:

```text
active explicit mira-market cookie
→ trusted Geo inference when explicitly enabled
→ deterministic active default Market
```

Locale resolution is:

```text
valid explicit mira-locale cookie for the resolved Market
→ Accept-Language preference among enabled Locales
→ Market fallback/default Locale
```

GeoIP is inference only. It does not confirm a Market.

A valid explicit public `/{market}/{locale}/...` route owns presentation for
that request. A transient public→private handoff preserves presentation context
without turning that context into remembered or confirmed commerce authority.

### 3.3 Active-Market authority

`Market.isActive` is the mutable runtime authority for whether a supported
Market is currently active for new storefront commerce.

Installed runtime behavior:

- active Market codes are read from the database;
- enabled SiteVariants are intersected with active Markets;
- product publication variants require both active product publication and an
  active Market;
- inactive Markets fail closed for new storefront/catalog/checkout authority;
- zero-active-Market storefront resolution has a bounded no-active state;
- authentication has a market-neutral Locale path so historical
  payment-return/login flow does not require fabricating an active Market.

Market deactivation does not erase historical CheckoutSession or Payment facts.

### 3.4 Request-context trust boundary

`src/proxy.ts` is the installed request-context boundary for storefront and
admin page requests.

It:

- preserves the existing administrator authentication/authorization boundary;
- excludes API, Next static/image, favicon, robots, and sitemap paths from
  storefront Proxy matching;
- strips all incoming `x-mira-*` headers before reconstructing internal
  request context;
- adds an internal attestation header/value;
- derives explicit public Market/Locale from the actual pathname;
- derives transient public→private context only from validated request data;
- forwards a trusted Geo country only through an explicitly configured GeoIP
  trust mode.

Supported Geo trust modes are `none`, `vercel`, and `cloudflare`; the
documented/default posture is `none`.

### 3.5 Global-cart Market confirmation and switching

Cart rows remain global identity/quantity rows; no persistent cart-Market or
cart-price field was added.

Phase 1 distinguishes:

```text
presentation/transient Market
confirmed commerce Market
proposed target Market
```

For a nonempty cart:

- transient context cannot silently reinterpret current cart commerce
  authority;
- a different target Market requires a server-derived impact preview;
- preview exposes current and target currency, price, and availability without
  deleting current lines;
- confirmation recomputes impact and checks its fingerprint;
- stale impact returns `IMPACT_CHANGED`;
- preference cookie is written only after successful confirmation;
- unavailable target lines remain visible and block checkout rather than being
  silently deleted.

When no active confirmed Market exists, target prices are projections only and
checkout remains blocked until explicit confirmation succeeds.

### 3.6 Checkout consistency

Checkout uses the active confirmed commerce Market rather than transient
presentation context.

The checkout action requires:

```text
active confirmed Market
+
valid expectedMarketCode
+
expectedMarketCode == confirmed Market
```

Failure states include `MARKET_CONFIRMATION_REQUIRED` and `MARKET_CHANGED`.
No CheckoutSession is created on either failed admission. Locale-only changes
do not invalidate confirmed commerce authority.

### 3.7 Existing-payment session identity

Payment action admission is decoupled from current browser/storefront Market.

For an existing payment action:

- caller authentication and CheckoutSession ownership are required;
- pre-attempt provider routing uses persisted CheckoutSession Market, currency,
  and amount;
- after an attempt exists, persisted Payment provider/mode/routing/idempotency
  facts remain authoritative.

Current URL Market, transient Market, Market preference cookie, GeoIP,
Accept-Language, and Locale do not admit, reject, or reroute an owned existing
CheckoutSession merely because presentation state changed.

Existing C0 commerce revalidation remains authoritative before first provider
contact. After provider contact or persisted provider output, later storefront
deactivation does not rewrite or reroute the historical attempt.

### 3.8 Locale presentation and navigation

Phase 1 installs typed Korean, English, and Japanese repository-owned customer
UI copy for the activated surfaces covered by the feature.

A navigation-reactive `StorefrontShell` updates Header visibility, current
Market/Locale presentation, generated links, Locale provider state, and
`document.documentElement.lang` on client navigation.

Cart and checkout use Locale-aware length and curl labels. Product
`WigStyle.name`, description, and tags remain source-owned product truth and
are not fabricated as translations.

### 3.9 Public routes and SEO

Installed public routes include:

```text
/{market}/{locale}
/{market}/{locale}/styles
/{market}/{locale}/styles/{styleId}
```

`/global` remains a market-neutral global entry.

Installed SEO/routing behavior includes canonical lower-case prefixes,
deterministic fallback for known unsupported pairs, 404 for unknown pairs,
query preservation, dynamic `html lang`, canonical/hreflang/x-default, and
publication-aware sitemap/product alternates.

The sitemap remains a build-time snapshot; Phase 1 defines no runtime
revalidation SLA.

### 3.10 Safe login and private-route context handoff

Public→private context handoff preserves safe Market/Locale presentation and
return identity without becoming commerce confirmation.

Login callback parsing accepts only safe same-origin relative application
targets, uses bounded decode-to-stable normalization, rejects authority changes,
traversal, backslashes, NUL/controls and over-depth recursive encoding, and
preserves safe path/query/fragment/UTF-8/opaque return values.

Login remains renderable when zero storefront Markets are active.

## 4. Source map

### Market / Locale core

- `src/lib/market/types.ts`
- `src/lib/market/locale.ts`
- `src/lib/market/site-variant.ts`
- `src/lib/market/resolution.ts`
- `src/lib/market/active-market.ts`
- `src/lib/market/resolve.ts`
- `src/lib/market/geo-trust.ts`
- `src/lib/market/request-context.ts`
- `src/lib/market/presentation.ts`
- `src/lib/market/catalog-presentation.ts`
- `src/lib/market/messages.ts`
- `src/lib/market/seo.ts`

### Request / routing / shell

- `src/proxy.ts`
- `src/app/[market]/[locale]/...`
- `src/app/global/page.tsx`
- `src/app/page.tsx`
- `src/app/sitemap.ts`
- `src/app/layout.tsx`
- `src/components/features/StorefrontShell.tsx`
- `src/components/features/storefront-shell-state.ts`
- `src/components/features/StorefrontLocaleProvider.tsx`
- `src/components/features/Header.tsx`
- `src/components/features/MarketSelector.tsx`
- `src/components/features/MarketConfirmation.tsx`

### Commerce actions and cart

- `src/app/actions/market.ts`
- `src/lib/cart.ts`
- `src/app/actions/cart.ts`
- `src/app/(shop)/cart/...`
- `src/app/actions/checkout.ts`
- `src/app/(shop)/checkout/...`
- `src/app/actions/payment.ts`
- `src/lib/commerce-integrity.ts`

### Authentication and fitting

- `src/app/(auth)/login/login-callback.ts`
- `src/app/(auth)/login/page.tsx`
- `src/components/features/FittingModal.tsx`
- `src/app/fitting/[id]/page.tsx`

## 5. Installed invariant ownership

| Invariant | Primary owner |
| --- | --- |
| Market and Locale are independent | `market/*`, SiteVariant routing |
| Only six Phase-1 SiteVariants are enabled | `site-variant.ts` |
| Only active Markets own new storefront commerce | `active-market.ts` |
| Explicit URL owns public-page presentation | `proxy.ts`, `site-variant.ts` |
| Incoming `x-mira-*` cannot self-attest | `proxy.ts`, `request-context.ts` |
| GeoIP is opt-in inference only | `geo-trust.ts`, `resolution.ts` |
| Transient handoff is not confirmation | `resolve.ts`, `request-context.ts` |
| Nonempty cart cannot silently switch Market | `cart.ts`, `actions/market.ts` |
| Preference write follows fresh impact confirmation | `actions/market.ts` |
| Checkout requires confirmed Market | `actions/checkout.ts` |
| Expected-Market mismatch fails closed | `actions/checkout.ts` |
| Existing payment is not governed by browser Market | `actions/payment.ts` |
| Locale does not change commerce facts | shell/messages/presentation |
| Client navigation updates Header and `html lang` | `StorefrontShell.tsx` |
| Product hreflang respects active publication | `active-market.ts`, `seo.ts` |
| Login callback stays same-origin/bounded | `request-context.ts` |
| Admin auth survives Middleware→Proxy migration | `proxy.ts` |

## 6. Review and correction history

The source was not accepted from the initial implementation without correction.

### A1 / A1H

Closed internal-header trust, GeoIP trust, public→private context loss,
inferred-Market checkout, publication-aware alternates, active-Market
authority, activated UI localization, and redirect/casing issues.

### A2

Found and drove correction of global-cart transient authority, payment resolver
coupling, client-navigation Header/`html lang` staleness, and callback
decode-depth hardening.

### D1 payment adjudication

Selected:

```text
P3 — IMMUTABLE CHECKOUTSESSION IDENTITY CONTROLS PAYMENT
```

The browser-Market equality check was adjudicated as a historical routing
shortcut rather than a payment invariant. Existing payment now uses persisted
CheckoutSession/Payment facts while preserving existing pre-contact C0
revalidation and post-contact lifecycle semantics.

### A3 / I4

The final broad closure review found one remaining cart-impact presentation
defect. I4 separated current confirmed/displayed Market, proposed target Market,
and server-computed impact and rendered truthful current→target currency,
amount, subtotal, and availability changes.

### A4

Final focused closure:

```text
MKT-CART-IMPACT-PRESENTATION-001: CLOSED
new BLOCKER: 0
new IMPORTANT: 0
READY FOR HUMAN DIFF REVIEW
```

The subsequent human diff review accepted the exact 85-path candidate.

## 7. Historical validation evidence

At reviewed source head `d575537bb308cf8ba9f67ac55d7e41fc90d7d082`:

- 265 test files / 5,895 tests passed;
- typecheck passed;
- lint passed;
- production build passed;
- final independent closure ended with Blocker 0 / Important 0;
- staged bytes matched the human-reviewed H1 packet;
- PR CI run `31764275002` / CI #337 succeeded.

At exact merge SHA `b34ef9628319b7862fb75d1df6ea5926f284f95b`:

- post-merge main CI run `31765301624` / CI #338 succeeded;
- the verify job completed through checkout, Node setup, dependency install,
  Prisma generation, DB migration, verify, and cleanup.

Frozen Design Contract identity used throughout review:

```text
SHA-256:
112d07e92430c5fbbf82c5bab822fa7d0f52ce3a40549ac7c617dc2b9f3ed2a8
```

Installed payment-boundary note identity at reviewed source:

```text
SHA-256:
8f25b782ccce2f3ce2f134b28a98b85af1047418e74ec0cf1ac2bbdce6e43786
```

## 8. Activation, environment, and data state

This record establishes source installation only. It does not establish a
production deployment, customer rollout, production localized content,
provider activation, carrier/tax integration, worker, infrastructure, or
deployment activation.

`MIRA_GEOIP_TRUST_MODE` supports `none`, `vercel`, and `cloudflare`; the
documented/default posture is `none`. Selecting a trusted ingress mode is a
deployment/operations decision and must prove that the selected ingress owns
the corresponding Geo header.

This record neither changes Market rows nor authorizes a production
Market-activation/deactivation operation.

## 9. Known limitations and deferred work

### Phase 2

Not implemented:

- account-level Market/Locale preference;
- cross-device preference synchronization;
- historical-order shipping-country fallback;
- persistent cart-Market anchor.

### Phase 3

Not implemented:

- authoritative ProductTranslation model;
- governed translated product name/description/tag truth;
- production Market×Locale media/content population;
- broad CMS/content workflow.

### Phase 4

Not implemented:

- address-derived shipping quotes;
- tax/customs/duty calculation;
- DDP/DAP execution policy;
- carrier integration;
- multi-country Market model;
- fulfillment-origin routing;
- shipping ETA authority.

### Provider activation

Not implemented or authorized:

- Eximbay activation;
- live provider activation;
- external sandbox provider activation;
- new callback/webhook authority.

### SEO operations

Sitemap is a build-time snapshot; no runtime revalidation SLA is installed.

### Validation UX follow-up

Some checkout validation detail is coarser than the older field-specific
Korean-only messages. This is a non-authority UX follow-up, not a Phase-1
commerce-safety blocker.

## 10. Re-entry gates

### SiteVariant expansion

Requires explicit product/commerce decision, Market and Locale support,
active/public catalog evidence, complete repository-owned Locale copy,
canonical/hreflang/sitemap review, cart/checkout transition review, and tests.

### Trusted GeoIP

Requires a named deployment environment, selected managed-ingress mode,
evidence that the ingress owns the header, no bypassable direct-origin path,
and rollback to `none`.

### Account/cross-device preferences

Requires explicit precedence among current-session choice, account preference,
browser preference, historical order, active cart, and inference, plus
shared-device/logout/privacy rules.

### Product translation/media

Requires governed translation/media authority, fallback policy, publication
rules, and source-language disclosure behavior.

### Shipping/tax/duty

Requires a separate authority contract covering destination, quote, tax,
duties, DDP/DAP, carrier/service, fulfillment origin, final total, and stale
quote behavior. Address/shipping may not silently switch commercial Market.

### Payment/provider activation

Requires provider-specific evidence, credentials, environment, callback,
webhook, reconciliation, rollback, and observation gates owned by the payment
program.

## 11. Rollback and recovery posture

No destructive migration or new durable schema was installed by Phase 1.

Source rollback should use a normal reviewed repository revert rather than
ad hoc deletion of Market, cart, checkout, or Payment data.

For environment containment:

- Geo trust can be returned to `MIRA_GEOIP_TRUST_MODE=none`;
- new storefront commerce may fail closed through existing reviewed Market
  activation authority when operationally authorized;
- Market deactivation must not erase or reinterpret historical CheckoutSession
  or Payment facts.

Existing payment/refund/order recovery remains owned by its existing contracts
and runbooks.

## 12. Change control

This record describes Phase-1 source at merge
`b34ef9628319b7862fb75d1df6ea5926f284f95b`.

Review/version this source-status record when material changes alter Market or
Locale authority, SiteVariants, active-Market ownership, context handoff, cart
switching, checkout Market admission, existing-payment session authority,
localized-content authority, durable preferences, shipping/tax/duty authority,
or deployment/provider activation state.

Do not rewrite the frozen Design Contract to impersonate later source truth.
Use a new design version for semantic changes and a new or explicitly updated
source-status version for changed installed source truth.
