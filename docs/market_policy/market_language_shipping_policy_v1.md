# Market, Language, and Shipping Country Policy v1

> Status: policy record originating from the 2026-07-09 design decision, updated to distinguish currently installed behavior from remaining work.
> Original decision date: 2026-07-09.
> Scope: market/language/shipping-country separation, cart subtotal meaning, current implementation status, and remaining work.
> Authority: this document records policy and implementation status; current source, schema, and runtime remain the authority for installed facts.

## Status

The original 2026-07-09 Stage 0 recorded the policy decision and added cart clarification copy without changing market resolution, checkout, locale infrastructure, storefront routing, payment routing, schema, or SEO metadata. Subsequent implementation installed portions of the later plan, including independent Market/Locale resolution, explicit Market-switch impact confirmation, Market/Locale storefront routes, and DB-backed current Market facts in price-bearing and checkout surfaces. The sections below label current installed behavior separately from work that remains deferred.

## Decision Summary

- Market is the commerce unit. It controls currency, price list, shippable countries, and future PSP routing key.
- One CheckoutSession, Order, and Payment belongs to one market. Market is snapshotted when CheckoutSession is created and must not be silently recomputed after that point.
- Language is presentation only and is implemented as an independent locale axis, not a proxy for market.
- Shipping country must belong to the selected market. Address input must not silently recalculate market, currency, or prices.
- IP/geo and Accept-Language are suggestions only. Do not use IP as final pricing authority, and do not let Accept-Language choose price or currency.
- Cart subtotal is display-only product subtotal. Do not treat cart subtotal as final payment total.

## Definitions

- **Market:** commerce unit that selects currency, VariantMarketPrice price list, shippableCountries, and future PSP routing key.
- **Locale/language:** independent presentation choice for UI strings, resolved from its own route/cookie axis.
- **Shipping country:** checkout address country. It must be included in the selected market's shippableCountries.
- **Currency:** current DB Market currency, validated against the supported formatting vocabulary before current-commerce presentation.
- **Cart subtotal:** display-only current-market product subtotal, computed as unit price times quantity for priced cart lines.
- **Checkout final total:** CheckoutSession snapshot amount after market, currency, cart lines, shipping, and payment context are confirmed.

## Current Implementation Facts

- Request-owned resolution selects among active DB Market rows using explicit URL/transient context or the `mira-market` cookie, then an attested geo hint, then an active fallback.
- Accept-Language is not used for market selection.
- Locale has its own URL/cookie resolution and remains independent from Market commerce facts.
- Fitting retains a static presentation fallback through `MARKET_CONFIGS[marketCode].defaultLocale`.
- Current Market currency, shippable countries, and active state come from the DB Market row. `MARKET_CONFIGS` retains typed routing/presentation metadata only; currency formatting metadata does not select a Market currency.
- `VariantMarketPrice.amount` remains the variant × Market price authority.
- Cart stores no prices. Cart display computes current prices from current-market VariantMarketPrice.
- Missing cart price is represented as null and remains fail-closed.
- CheckoutSession snapshots marketCode, currency, unitAmount, subtotal, shippingAmount, totalAmount, and shipping address.
- Checkout shipping country is validated against the selected market's shippableCountries.
- Checkout does not silently recalculate market from shipping country.
- Checkout renders its currency and shipping-country policy from the current DB Market, then snapshots validated facts when the session is created.
- Shipping fee, tax/customs, free-item/no-payment order path, discount policy, and provider minAmountMinor are not implemented.
- PSP strategy is not finalized: Toss remains KR domestic baseline, Eximbay is a cross-border/Japan candidate, direct PayPal is frozen.
- Market/Locale storefront routes are installed; production domain strategy, sitemap, canonical, hreflang, and extended SEO metadata remain deferred.

## Policy Rules

- Market is selected before checkout session creation and is the source of commerce meaning.
- User-selected market cookie wins over geo. Geo may suggest an initial market only.
- Do not use IP as final pricing authority.
- Accept-Language may initialize the presentation locale when no explicit locale preference exists, but must not set market, price list, currency, or PSP route.
- Do not couple language to market commerce authority.
- Do not silently recalculate market from shipping country.
- Out-of-market shipping should require an explicit user-confirmed market switch in a future checkout UI.
- If a market switch makes any cart line missing a current-market price, existing fail-closed behavior must block checkout before payment.
- Cart prices remain display-only computations and must not be persisted to Cart or CartLine rows.
- Cart subtotal is not final payment total. CheckoutSession snapshot is the sole final amount.
- Shipping, tax, customs, discounts, and no-payment order design belong to later checkout/payment work.
- Do not treat installed Market/Locale storefront routes as completion of the still-deferred domain and SEO work.

## Storage and Snapshot Map

| Layer | Current rule |
| --- | --- |
| Cookie | Market via `mira-market`; locale independently via `mira-locale`. |
| User account | No market or locale preference fields now; optional later. |
| Cart | No market or price storage. Stores identity and quantity only. |
| Catalog/cart display | Prices computed from current-market VariantMarketPrice. |
| CheckoutSession | Snapshots marketCode, currency, line unitAmount, subtotal, shipping, and total. |
| Order/Payment | Belong to the session market/payment attempt snapshots. |

## UX Policy

### Cart Display

Cart shows selected-market unit price, quantity, line subtotal, and product subtotal. Missing price must show unavailable/price-check copy, not zero. Cart subtotal copy must state that shipping, tax, and final payment amount are resolved at checkout.

### Checkout Market/Shipping Mismatch

The installed one-Market/one-country checkout reads the eligible country from current DB `Market.shippableCountries`, and CheckoutSession creation independently rejects a country outside that DB-backed set. Address input does not silently change Market, currency, or prices. A richer workflow in which a user enters an out-of-market destination and receives checkout-local Market-switch confirmation before repricing remains future work.

### Locale Presentation

Locale routes, the locale selector, and the `mira-locale` cookie are installed as an independent presentation axis. Accept-Language may initialize presentation locale only and does not select Market commerce facts. Broader catalog/content translation and an account-level locale preference remain future work.

## Enforcement Points

- Current Market resolution: request-owned context/cookie and attested geo inference are intersected with active DB Market rows before fallback.
- Current Market commercial facts: DB Market supplies active state, currency, and shippableCountries; unsupported DB currency fails closed.
- Current-market pricing: cart and checkout derive prices from VariantMarketPrice for the selected market.
- Null-price fail-closed: missing market price remains null in cart display and `VARIANT_PRICE_UNAVAILABLE` in session creation.
- `SHIPPING_COUNTRY_INVALID`: checkout session creation rejects shipping countries outside market.shippableCountries.
- CheckoutSession snapshot: market, currency, unitAmount, subtotal, shipping, and total are persisted at session creation.
- `totalAmount < 1` guard: session creation rejects totals below payable minimum until a no-payment/free-order path is explicitly designed.

## Historical Stage Plan and Current Status

The original 2026-07-09 plan was Stage 0 policy recording and cart clarification; Stage 1 checkout shipping and explicit Market-switch confirmation; Stage 2 independent locale infrastructure, cookie, selector, and string extraction; Stage 3 Market/Locale storefront routes with domain and SEO prerequisites; and Stage 4 multi-country Markets, tax/customs/shipping, PSP routing expansion, and provider amount bounds.

Current status:

- Installed: Stage 0 policy/cart clarification; explicit cart/header Market-switch impact confirmation; independent Market/Locale route and cookie resolution; locale selection for enabled site variants; Market/Locale storefront routes; and the fixed-country checkout's DB-backed currency and shipping eligibility.
- Partially installed: checkout validates a DB-authorized fixed shipping country, but user-entered out-of-market destination handling and checkout-local Market-switch UX are not installed.
- Still deferred: broader catalog/content translation, account locale preference, production domain/SEO completion, multi-country Markets, shipping/tax/customs calculations, expanded PSP routing, and provider amount bounds.

## Explicit Deferrals

- User-entered out-of-market destination handling and checkout-local Market-switch confirmation UX.
- Broader catalog/content translation and account-level locale preference fields.
- Shipping fee, tax/customs, discounts, and free/no-payment order path.
- Multi-country markets and expanded PSP routing.
- Provider minAmountMinor policy.
- Production domain strategy, metadataBase, canonical, sitemap, hreflang, OG/Twitter, and JSON-LD completion.

## Current WRR-01A Non-Goals

- No schema or migration change.
- No recomputation or rewriting of historical CheckoutSession, Payment, or Order commerce snapshots.
- No promotion of Locale or `defaultLocale` into commerce authority.
- No payment-provider or payment-routing redesign.
- No Cart or CartLine price persistence.
- No silent shipping-country-based Market, currency, or price change.
- No unrelated multi-country shipping, shipping-fee, tax/customs, provider-bound, domain, or SEO expansion.
