# Product Decision Log

## Change-control rule

This log records adjudicated product-domain decisions and material review
corrections prospectively from its first entry. It does not retroactively
reclassify or replace older product documents that predate this log.

A frozen design contract changes only through a new version with explicit
supersession. A source-status/as-built record describes installed source truth
but does not replace the decision evidence recorded here.

## 2026-08-14 — Market × Locale Phase-1 source closure

### Scope and evidence

This entry closes the reviewed Phase-1 source installation for the Market ×
Locale storefront foundation.

```text
DESIGN AUTHORITY:
  market-locale-site-variant-design-contract-v0.1.md

REVIEWED SOURCE HEAD:
  d575537bb308cf8ba9f67ac55d7e41fc90d7d082

MAIN MERGE:
  b34ef9628319b7862fb75d1df6ea5926f284f95b

PULL REQUEST:
  #62

SOURCE STATUS:
  market-locale-site-variant-source-status-v0.1.md

PRODUCTION / CUSTOMER ACTIVATION:
  NOT AUTHORIZED BY THIS ENTRY
```

The frozen Design Contract remains historical and unchanged. Its
pre-implementation status and worktree provenance are not rewritten after
merge.

### Decisions retained in installed source

- Market, Locale, Delivery Country, and final Shipping Address remain distinct
  concepts with different authority.
- Locale is presentation authority and does not own price, currency,
  publication, cart commerce authority, CheckoutSession facts, Payment facts,
  or Order facts.
- The Phase-1 public SiteVariant allowlist is exactly:
  `KR×ko`, `KR×en`, `US×en`, `US×ko`, `JP×ja`, and `JP×en`.
- `Market.isActive` owns new storefront Market availability.
- Root GeoIP remains inference only and is accepted only through an explicitly
  configured trusted-ingress mode.
- Explicit public URL or transient handoff may own presentation without becoming
  remembered or confirmed commerce authority.
- A nonempty global cart cannot silently switch Market. A different target
  requires server-computed impact, fingerprint confirmation, and fresh
  revalidation; unavailable target lines are not silently deleted.
- Checkout requires an active confirmed Market and exact equality with the
  Market expected by the rendered checkout.
- Existing payment is governed by authenticated ownership plus persisted
  CheckoutSession/Payment identity and lifecycle facts, not current storefront
  Market or Locale.
- Public route, Locale shell, canonical/hreflang/sitemap, and safe
  public→private callback behavior are installed only for the reviewed Phase-1
  boundaries.

### Material review corrections

The implementation was corrected after independent review rather than accepted
from its first source candidate.

#### A1 / A1H

Corrections closed:

- spoofable internal Market/Locale request-header authority;
- untrusted GeoIP assumptions;
- loss of explicit public context on private handoff;
- inferred Market reaching checkout without confirmation;
- product alternates ignoring actual Market publication;
- missing runtime `Market.isActive` authority;
- incomplete activated ko/en/ja repository-owned UI; and
- redirect/query/hash/casing defects.

#### A2

Corrections closed:

- transient presentation silently reinterpreting a remembered nonempty cart;
- storefront resolver state influencing existing-payment admission/routing;
- stale Header and `html lang` after client navigation; and
- insufficient recursive callback decoding and control-character rejection.

#### D1 payment adjudication

The selected payment boundary is:

```text
P3 — IMMUTABLE CHECKOUTSESSION IDENTITY CONTROLS PAYMENT
```

Before first provider contact, existing C0 commerce revalidation still owns
stale-commerce rejection. After provider contact or persisted output,
historical Payment facts remain authoritative for the attempt and later
storefront state does not reroute it.

#### A3 / I4

The final remaining cart-impact presentation defect was corrected by separating:

```text
current confirmed/displayed commerce Market
proposed target Market
server-computed switch impact
```

The UI now presents truthful current→target currency, amount, subtotal, and
availability changes without reinterpreting the current cart as the target
Market.

#### A4

The final focused closure reported:

```text
MKT-CART-IMPACT-PRESENTATION-001: CLOSED
new BLOCKER: 0
new IMPORTANT: 0
READY FOR HUMAN DIFF REVIEW
```

The subsequent human review accepted the exact 85-path source candidate before
commit and merge.

### Validation and merge disposition

Historical validation at the reviewed feature head included 265 test files /
5,895 tests, passing typecheck, lint, production build, and PR CI.

Post-merge `main` CI run `31765301624` / CI #338 completed successfully on
exact merge SHA `b34ef9628319b7862fb75d1df6ea5926f284f95b`.

Disposition:

```text
PHASE-1 SOURCE:
  COMPLETE

P8 SOURCE-STATUS INSTALLATION:
  REQUIRED / SEPARATE DOCS MERGE

PRODUCTION DEPLOYMENT:
  NOT ESTABLISHED

CUSTOMER ACTIVATION:
  NOT ESTABLISHED

LIVE / EXTERNAL SANDBOX PROVIDER ACTIVATION:
  NONE
```

### Deferred re-entry

The following remain separate future authority:

- account-level and cross-device Market/Locale preference;
- historical-order fallback and persistent cart-Market anchor;
- governed ProductTranslation and localized product/media truth;
- real shipping quote, tax, duty, DDP/DAP, carrier, fulfillment-origin, and ETA
  authority;
- new payment-provider or external sandbox activation;
- runtime sitemap revalidation policy.

A future semantic change must use the applicable new design version and update
or supersede the Source Status under repository change control. A future
deployment or customer/provider activation requires its own evidence and
authorization; this decision-log entry does not grant it.
