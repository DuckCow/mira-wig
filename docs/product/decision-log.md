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

## 2026-08-26 — R13A v1 customer post-purchase document and payment-evidence policy

### Decision identity and source boundary

```text
SCOPE:
  R13A v1 customer post-purchase document / payment-evidence experience

DECISION OWNER:
  PROJECT OWNER

STATE:
  ACCEPTED

SOURCE STATUS:
  THE CURRENT R13A CANDIDATE IS IMPLEMENTING THIS DECISION
  REVIEW / MERGE / DEPLOYMENT / CUSTOMER ACTIVATION NOT ESTABLISHED
```

This human product decision supersedes the earlier R13A v1 candidate assumption
that contemplated customer access to provider-hosted receipts. It does not
rewrite that candidate history or claim that the aligned source is already
installed.

### Universal R13A v1 customer experience

Mira will provide a provider-independent, merchant-owned post-purchase
experience containing:

- order details / order confirmation;
- payment details; and
- customer-safe refund details.

This is the primary customer post-purchase experience. For the current active
card-provider families, the R13A v1 customer-facing provider receipt disposition
is:

```text
TOSS PROVIDER RECEIPT CTA:
  OFF

EXIMBAY PROVIDER RECEIPT CTA:
  OFF

CUSTOMER-FACING PROVIDER-HOSTED RECEIPT SURFACE:
  NOT INSTALLED BY R13A v1
```

### Rationale

Toss provider receipt support was technically implementable. Eximbay publicly
documents a customer receipt capability, but the successful response contract
and permission needed for a strict Mira adapter remain unestablished. One
authorized Eximbay SANDBOX receipt probe returned HTTP 403 with JSON content and
no `Location`; it established no receipt URL, redirect contract, successful
envelope, or receipt host.

That bounded result is not evidence that Eximbay payments, refunds, or the
general Eximbay integration are defective. The project owner chose not to ship
an asymmetric Toss-only provider-document experience in R13A v1. R13A v1
instead closes the common Mira-owned order, payment, and refund experience
independently of provider receipt capability.

### Long-term optional provider-evidence policy

This v1 parity decision does not mean that every future payment provider must
support the same receipt artifact or none may ever be shown. Provider-hosted
payment evidence is an optional secondary capability.

A provider-specific document may be exposed later only after its actual
provider capability, semantics, customer-access contract, and safety boundary
are authoritatively established. Different providers' documents do not have to
be legally or semantically identical. Mira must not describe unlike provider
artifacts as one identical legal document without authority.

Descriptively, Toss authority may characterize its artifact as a card sales
slip or provider-owned evidence. Eximbay authority may characterize its artifact
as a payment receipt if and when its customer-access capability is established.
These examples do not activate either provider document in R13A v1.

### Mira document non-goals

R13A v1 does not claim that Mira's ordinary order-detail page is:

- a card sales slip;
- a tax invoice;
- a cash receipt;
- a statutory invoice; or
- a provider receipt.

This decision does not authorize Mira to generate a new statutory financial or
tax document.

### Change control and authority boundary

A future customer-facing provider-document policy change requires an explicit
human product decision. Technical availability of a provider API alone does not
automatically change customer-facing product policy.

This entry records product authority only. It does not authorize provider
contact, SANDBOX execution, LIVE activation, deployment, email activation, or
refund execution.

## 2026-08-28 — Launch-v1 coupon and birthday-benefit foundation

Launch v1 separates promotional Coupons from future earned Mira Credit; Global
Points are not part of v1. The signup benefit is an account-bound percentage
coupon for a verified user's first qualifying order. The birthday benefit is an
account-bound percentage coupon for qualifying existing customers. Birthday
month/day is optional, stores no birth year, and is never required during signup
or checkout.

Every percentage-coupon rule requires a Market-specific maximum discount in the
Market's exact currency. Coupon caps are not converted through live FX. Actual
rates, caps, minimums, birthday windows, and expiration periods remain
undecided, and installing this foundation activates no promotion. Future
checkout v1 permits at most one coupon per order and does not stack coupons.

Checkout redemption, refund/regrant behavior, customer or admin UI, Mira
Credit, purchase rewards, and review rewards remain future slices requiring
separate authority.

## 2026-08-28 — Launch-v1 coupon checkout-to-order financial semantics

Coupon application is explicit and optional, with at most one account-bound
PromotionGrant selected per CheckoutSession and Order. All frozen merchandise
lines are eligible; shipping, tax, and duty are not. The exact policy version
that issued the grant owns the rate, cap, and minimum. Redemption uses that
version's rule for the current CheckoutSession Market and requires the rule,
CheckoutSession, and Market currencies to match. `originMarketCode` remains
issuance provenance and does not select redemption economics.

An issued grant may redeem from an ACTIVE or RETIRED issuing policy, but not a
DRAFT policy. Grant validity, ownership, revocation, redemption, supported kind,
and signup first-order-only eligibility are revalidated immediately before the
first provider contact. A durable one-grant-to-one-checkout reservation is
claimed in that contact-boundary transaction. For `firstOrderOnly` promotions,
contact authority is additionally user-global while `programKey` remains part
of grant identity: the CheckoutSession durably claims the user's first-order
promotion opportunity before provider contact. Safe uncontacted expiry releases
that claim; contacted, ambiguous, captured, compensated, and completed exposure
retains it. Successful completion retains the claim permanently, and full
refund does not regrant it. Refund/compensation regrant policy remains deferred.
After contact authorization,
frozen promoted payment terms are not reinterpreted from later policy, grant,
or storefront state.

CheckoutSession and Order persist gross subtotal, coupon discount, shipping,
and net total. Each CheckoutSessionLine and OrderItem persists its allocated
whole-line discount, and completion copies the frozen allocation without
recalculation while atomically creating the Order and redeeming the grant. A
selected coupon that yields no monetary benefit or a payable total below one
minor unit is rejected; no free-order path is introduced. Coupon-aware refunds
and refund/void regrant policy remain deferred.

## 2026-08-28 — Durable refund merchandise attribution R0

`RefundAttempt.amount` remains the aggregate cash-refund authority. Every newly
created refund request also records a non-empty canonical set of historical
Order items and positive quantities in `RefundAttemptLine`; this merchandise
attribution does not price the refund or reinterpret item price or discount
facts. Succeeded and non-terminal guarded attempts reserve item quantity, while
cancelled and terminal-failed attempts retain their attribution without
consuming current capacity. A guarded historical attempt with no line evidence
fails closed to manual review; terminal historical line-less attempts remain
eligible for replay and do not consume quantity.

Customer refund intake submission remains order plus reason only. The admin
approval decision assigns exact item quantities while approving cash amount
independently. Coupon-aware partial-refund valuation and coupon regrant/loss
policy remain deferred to PROMO-C5. This entry activates no provider contact,
refund execution, deployment, promotion capability, or historical backfill.

## 2026-08-28 — Launch-v1 pre-production MTO whole-Order cancellation

Launch v1 automatic customer cancellation applies only to a whole Order whose
historical merchandise lines are all MTO and whose every ManufacturingRequest
is authoritatively still before production. The cutoff is the first actual
production start; no arbitrary elapsed-time window owns eligibility. Customer
cancellation and production start serialize on the same Order row, so exactly
one decision can win.

An accepted cancellation is durable commerce truth in its one-to-one
`OrderCancellation` record and remains accepted independently of refund
execution or terminal non-execution. `Order.status` continues to own the
financial refund lifecycle, and `OrderStatus.CANCELLED` is not new C0
authority. Customer and administrator commerce presentation gives a coherent
`OrderCancellation` precedence over that financial label.

Acceptance creates an atomic obligation to reverse the full captured
`Payment.amount`, attributed to every historical OrderItem at its full original
quantity. Any prior succeeded refund, open or guarded refund, ambiguous money
or provider identity, inconsistent refund ledger, or submitted customer intake
makes the automatic path fail closed. A bounded administrator re-entry may
create only the exact positive outstanding cancellation obligation with exact
remaining R0 quantity capacity; generic refund/intake creation cannot compete
with an accepted cancellation.

STOCKED and mixed Orders are excluded. Coupon recovery, first-order promotion
regrant, selected-line cancellation, Mira Credit, and Points remain deferred.
Installing this source authorizes no customer activation, provider contact,
LIVE authority, deployment, or production manufacturing activation; both
customer cancellation and production start remain separately fail-closed by
configuration.

## 2026-08-29 — Coupon economic reversal and recovery entitlement C5

Coupon recovery is determined from durable successful refund economics, not
production state, refund reason, `Order.status` alone, or the existence of an
`OrderCancellation`. The three refund authorities remain distinct:

```text
RefundAttempt.amount
  = aggregate cash-refund authority

RefundAttemptLine
  = historical item and quantity authority

RefundAttemptLineEconomicAllocation
  = immutable merchandise-cash attribution used for coupon recovery
```

For an ordinary administrator refund, the administrator supplies each selected
line's merchandise amount. Source validates it within the exact frozen quantity
tranche using cumulative `floor(lineDiscount * quantity / orderedQuantity)`;
it never invents a proportional split from the aggregate refund amount. A new
whole-Order C0 cancellation and its bounded replacement may derive the exact
allocation because that installed policy already determines full remaining
quantities and frozen line economics. Historical refund lines are not
backfilled or guessed.

Only coherent `SUCCEEDED` refund attempts contribute. Recovery becomes eligible
at the first `(processedAt, id)`-ordered success prefix that fully reverses the
quantity, derived discount, and merchandise cash of every historically
discount-bearing OrderItem. Shipping and other non-merchandise residual cash do
not count toward that predicate and need not be fully refunded.

The consumed grant remains redeemed. Recovery creates at most one immutable
successor with immediate-predecessor provenance and the exact historical policy
version; recursive `A -> B -> C` recovery is permitted without branching. A
recovered `firstOrderOnly` grant may pass checkout only through validated
recovery lineage. The original user-global first-order claim remains historical
and is neither cleared, reacquired, nor rewritten.

`PromotionPolicyVersion.recoveryGraceDays` is nullable, has no default, and is
not seeded here. An unlimited source remains unlimited. The first expiring
recovery uses the later of the source expiry and eligibility plus its configured
grace; later recoveries carry only the predecessor's remaining usable window.

Successor creation is post-commit and provider-free. An immediate attempt,
bounded worker reconciliation, and authenticated single-Order administrator
retry recover a crash or insertion failure without rolling back refund success
or repeating provider execution. Read paths only classify durable state and do
not issue grants.

Both issuance and reconciliation are disabled by default and require their
separate exact `ENABLED` gates. This entry installs no commercial grace value,
promotion seed, customer activation, provider contact, refund execution,
deployment, or LIVE authority.

Bounded reconciliation uses one lazily created
`PromotionRecoveryReconciliationCheckpoint` singleton as scheduler traversal
metadata only. Its nullable `lastOrderId` is an immutable-ID ordering cursor,
not entitlement, refund evidence, economic evidence, per-Order completion, or
successor authority. A short row-locked transaction claims at most 25 broad
candidates and advances the cursor before processing; the existing Order-locked
classifier remains the only issuance authority. Scanning is cyclic, so a crash
after claim may delay work until wrap but cannot permanently discard durable
eligibility. Cursor loss, reset, or backward movement causes safe rescanning and
does not alter classification, amounts, `recoveryEligibleAt`, expiry, first-order
rules, or provider identity.
