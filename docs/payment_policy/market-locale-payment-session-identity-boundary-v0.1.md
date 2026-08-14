# Market × Locale payment session-identity boundary — v0.1

**Status:** current-state adjudication and source-boundary record  
**Decision:** P3 — immutable `CheckoutSession` identity controls payment  
**Provider activation:** none

This note records the bounded Market × Locale payment decision without rewriting
the versioned historical payment-policy contracts.

## Authority boundary

- Browser/storefront Market is presentation authority and authority for creating
  a new checkout. It is not admission authority for an existing payment action.
- An existing payment action authenticates the caller, loads the identified
  `CheckoutSession`, verifies ownership, and uses the persisted session Market,
  currency, amount, and lifecycle facts.
- Before a first provider contact, the existing C0 commerce revalidation remains
  authoritative. An inactive Market or changed commercial terms continue to
  produce the existing stale-terms result without provider contact.
- After provider contact or persisted provider output, the persisted `Payment`
  provider, mode, routing, and attempt facts remain historical authority. A later
  browser Market change or storefront deactivation does not rewrite or reroute
  that attempt.
- Provider-neutral return and resume remain identified by owned
  `CheckoutSession` identity, not by storefront Market state.

No normative historical payment contract was amended. No live provider,
external sandbox provider, credential, endpoint, callback, webhook, worker,
infrastructure, or deployment capability was activated by this decision.
