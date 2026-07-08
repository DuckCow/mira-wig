# Market, Language, and Shipping Country Policy v1

> Status: design record, not implementation.
> Date: 2026-07-09.
> Scope: market/language/shipping-country separation, cart subtotal meaning, and staged future work.

## Status

Stage 0 records the current decision and adds cart clarification copy only. This document does not change market resolution, checkout behavior, payment routing, schema, locale infrastructure, storefront routing, or SEO metadata.

## Decision Summary

- Market is the commerce unit. It controls currency, price list, shippable countries, and future PSP routing key.
- One CheckoutSession, Order, and Payment belongs to one market. Market is snapshotted when CheckoutSession is created and must not be silently recomputed after that point.
- Language is presentation only. It must become an independent locale axis later, not a long-term proxy for market.
- Shipping country must belong to the selected market. Address input must not silently recalculate market, currency, or prices.
- IP/geo and Accept-Language are suggestions only. Do not use IP as final pricing authority, and do not let Accept-Language choose price or currency.
- Cart subtotal is display-only product subtotal. Do not treat cart subtotal as final payment total.

## Definitions

- **Market:** commerce unit that selects currency, VariantMarketPrice price list, shippableCountries, and future PSP routing key.
- **Locale/language:** presentation choice for UI strings. Future storage should be a locale cookie, with optional account preference later.
- **Shipping country:** checkout address country. It must be included in the selected market's shippableCountries.
- **Currency:** market currency. Current markets are KR/KRW, US/USD, and JP/JPY.
- **Cart subtotal:** display-only current-market product subtotal, computed as unit price times quantity for priced cart lines.
- **Checkout final total:** CheckoutSession snapshot amount after market, currency, cart lines, shipping, and payment context are confirmed.

## Current Implementation Facts

- `resolveMarketCode(cookie, geo)` resolves market by explicit `mira-market` cookie, then geo country, then fallback KR.
- Server resolution reads `x-vercel-ip-country` or `cf-ipcountry` as geo hints.
- Accept-Language is not used for market selection.
- There is no real locale/i18n axis yet. UI copy is mostly Korean.
- Fitting has a small market-derived locale seam through `MARKET_CONFIGS[marketCode].defaultLocale`.
- Market config currently fixes KR/KRW, US/USD, JP/JPY, shippable countries, and display currency metadata.
- Cart stores no prices. Cart display computes current prices from current-market VariantMarketPrice.
- Missing cart price is represented as null and remains fail-closed.
- CheckoutSession snapshots marketCode, currency, unitAmount, subtotal, shippingAmount, totalAmount, and shipping address.
- Checkout shipping country is validated against the selected market's shippableCountries.
- Checkout does not silently recalculate market from shipping country.
- Checkout page is still a stub.
- Shipping fee, tax/customs, free-item/no-payment order path, discount policy, and provider minAmountMinor are not implemented.
- PSP strategy is not finalized: Toss remains KR domestic baseline, Eximbay is a cross-border/Japan candidate, direct PayPal is frozen.
- Domain, sitemap, canonical, hreflang, country storefront routes, and SEO metadata are deferred.

## Policy Rules

- Market is selected before checkout session creation and is the source of commerce meaning.
- User-selected market cookie wins over geo. Geo may suggest an initial market only.
- Do not use IP as final pricing authority.
- Accept-Language may default language later, but must not set market, price list, currency, or PSP route.
- Do not couple language to market long-term.
- Do not silently recalculate market from shipping country.
- Out-of-market shipping should require an explicit user-confirmed market switch in a future checkout UI.
- If a market switch makes any cart line missing a current-market price, existing fail-closed behavior must block checkout before payment.
- Cart prices remain display-only computations and must not be persisted to Cart or CartLine rows.
- Cart subtotal is not final payment total. CheckoutSession snapshot is the sole final amount.
- Shipping, tax, customs, discounts, and no-payment order design belong to later checkout/payment work.
- Do not implement country storefront routes until domain/i18n/SEO prerequisites exist.

## Storage and Snapshot Map

| Layer | Current rule |
| --- | --- |
| Cookie | Market now via `mira-market`; locale cookie later. |
| User account | No market or locale preference fields now; optional later. |
| Cart | No market or price storage. Stores identity and quantity only. |
| Catalog/cart display | Prices computed from current-market VariantMarketPrice. |
| CheckoutSession | Snapshots marketCode, currency, line unitAmount, subtotal, shipping, and total. |
| Order/Payment | Belong to the session market/payment attempt snapshots. |

## UX Policy

### Cart Display

Cart shows selected-market unit price, quantity, line subtotal, and product subtotal. Missing price must show unavailable/price-check copy, not zero. Cart subtotal copy must state that shipping, tax, and final payment amount are resolved at checkout.

### Checkout Market/Shipping Mismatch

Shipping country must belong to the selected market. If a user enters an out-of-market destination in a future checkout UI, the UI should ask for explicit market switch confirmation before repricing. No silent market/currency repricing from address input.

### Future Language Selector

Language should become an independent locale selector and cookie. Accept-Language may preselect locale only. Until i18n exists, Korean remains the main UI language, with the existing fitting-locale seam as a temporary exception.

## Enforcement Points

- `resolveMarketCode`: explicit `mira-market` cookie, then geo header, then KR fallback.
- Current-market pricing: cart and checkout derive prices from VariantMarketPrice for the selected market.
- Null-price fail-closed: missing market price remains null in cart display and `VARIANT_PRICE_UNAVAILABLE` in session creation.
- `SHIPPING_COUNTRY_INVALID`: checkout session creation rejects shipping countries outside market.shippableCountries.
- CheckoutSession snapshot: market, currency, unitAmount, subtotal, shipping, and total are persisted at session creation.
- `totalAmount < 1` guard: session creation rejects totals below payable minimum until a no-payment/free-order path is explicitly designed.

## Staged Plan

- Stage 0 now: record this decision and add cart clarification copy.
- Stage 1 later: checkout shipping UI plus explicit market-switch confirmation.
- Stage 2 later: i18n, locale cookie, language selector, and string extraction.
- Stage 3 later: country/locale storefront routes after domain, i18n, and SEO prerequisites exist.
- Stage 4 later: multi-country markets, tax/customs/shipping model, PSP routing expansion, and provider amount bounds.

## Explicit Deferrals

- Checkout shipping UI and market-switch flow.
- Locale/i18n infrastructure, language selector, and account preference fields.
- Shipping fee, tax/customs, discounts, and free/no-payment order path.
- Multi-country markets and expanded PSP routing.
- Provider minAmountMinor policy.
- Domain strategy, metadataBase, canonical, sitemap, hreflang, OG/Twitter, JSON-LD, and country storefront routes.

## Non-Goals

- No behavior change.
- No payment/provider/auth/market-resolution/schema/package change.
- No Cart or CartLine price persistence.
- No silent shipping-country-based repricing.
- No country storefront routes until domain, i18n, and SEO prerequisites exist.
