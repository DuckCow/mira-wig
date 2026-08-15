# Eximbay EX2B2-S2 — READY Contact Source Status / As-Built v0.1

## Status

```text
DOCUMENT CLASS:
  SOURCE STATUS / AS-BUILT

RISK CLASS:
  HIGH — PAYMENT / EXTERNAL PROVIDER CONTACT CAPABILITY

TASK CLASSIFICATION:
  SOURCE_ONLY

TASK-LEVEL AUTHORIZATION:
  DOCUMENTATION_ONLY

SOURCE STATUS VERSION:
  v0.1

EX2B2-S2 DESIGN:
  INSTALLED / GOVERNING

EX2B2-S2 SOURCE:
  MERGED / INSTALLED / REVIEWED / DORMANT

FINAL INDEPENDENT SOURCE CLOSURE:
  PASS

OPEN S2 SOURCE BLOCKER:
  0

OPEN S2 SOURCE IMPORTANT:
  0

OPEN S2 SOURCE MINOR:
  0

REAL EXIMBAY PROVIDER CONTACT:
  NONE / NOT AUTHORIZED BY THIS RECORD

REAL CREDENTIAL VALUES:
  NONE / NOT AUTHORIZED OR RECORDED

EXIMBAY ROUTING:
  DISABLED / UNCHANGED

SDK / request_pay:
  NOT INSTALLED / NOT AUTHORIZED

BF4 / STATUS COMPLETION:
  NOT INSTALLED

SANDBOX / LIVE / CUSTOMER ACTIVATION:
  NOT AUTHORIZED
```

This is the installed S2 source truth. It is descriptive authority linked to
the governing design; it is not a new design, operations runbook, activation
record, or provider-contact authorization.

```text
source installed != provider-contact authorized
source installed != routing enabled
source installed != customer activated
```

## 1. Governing chain and installation identity

The precedence for this record is:

1. [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md).
2. The installed EX2B2 parent Design Contract and Threat / Failure Model.
3. The installed [EX2B2-S2 READY Contact Design Contract v0.1](./eximbay-ex2b2-s2-ready-contact-design-contract-v0.1.md).
4. Installed EX2A / EX2B1 source-status authority.
5. The current [S1 READY Kernel Source Status / As-Built v0.2](./eximbay-ex2b2-s1-ready-kernel-source-status-v0.2.md).
6. The exact merged source, tests, review packets, PR, and CI evidence below.

The S2 design was installed by PR #68:

```text
design reviewed head:
  9dc5c538d160048b735ecc2ee1986b17de525c06

design merge:
  ac55a21a3188cec71e0102807e6793b02323e9da

design scope:
  docs/engineering/eximbay-ex2b2-s2-ready-contact-design-contract-v0.1.md
```

The exact reviewed S2 source packet and closure were:

```text
packet:
  WIG_PAY_EXIM_EX2B2_S2_I1_SOURCE_REVIEW_v0_2.zip
  bytes: 34015
  SHA-256: fe79dc2b625c042705b3f49912965c8ec1770fd3c8308bd88fe0949ffe27e518
  entries: 12

reviewed full diff:
  bytes: 107664
  SHA-256: 2933c3b0fb94d117536d39d1506be7c99c5a4130424d36fcda311646f1e68cfd

final independent source closure:
  PASS
  BLOCKER 0
  IMPORTANT 0
  MINOR 0
  I1R-I01 CLOSED
  I1R-I02 CLOSED
  I1R-I03 CLOSED
  I1R-M01 CLOSED
```

The source was installed by PR #69:

```text
PR title:
  feat(payment): add Eximbay EX2B2 S2 ready contact

reviewed source head:
  002e1c778e650dc66767ef5dab5d1a7a3573b0ed

source merge:
  bb2ab48176e9b6a5216e870616f4730fe9a85825

merge parent 1:
  ac55a21a3188cec71e0102807e6793b02323e9da

commits:
  1

changed paths:
  14

ADD / MODIFY:
  8 / 6

additions / deletions:
  2324 / 29

PR CI:
  run 31872599036 — completed / success

post-merge main CI:
  run 31872952017 — completed / success
```

## 2. Installed S2 file identities

These are the exact byte counts and SHA-256 values observed on merged `main`
at `bb2ab48176e9b6a5216e870616f4730fe9a85825`.

| Installed path | Bytes | SHA-256 |
| --- | ---: | --- |
| `.env.example` | 7587 | `afa2900dc55f741124b21450e39366ac1caa5e41030329b3c614a8899ff91ae1` |
| `src/lib/payment/attempt/__tests__/initiate.integration.test.ts` | 87678 | `7c0e0ebb62a77c7dbb9f63c7ceaf5aec7a7ff4c6ac9911a7f95f3da636955f14` |
| `src/lib/payment/attempt/initiate.ts` | 32150 | `e3852a4cfaaf38593aa72fdeff98925113aa5a5d00e93fd909935d8deb4821e7` |
| `src/lib/payment/eximbay/__tests__/s1-isolation.test.ts` | 9327 | `f9de1b3f636809e323d15bcf169a5daaf786e593d5bbdd58102126dffcbabaa3` |
| `src/lib/payment/providers/__tests__/eximbay-ex1-architecture.test.ts` | 5426 | `7589c2b7b02ce420b719d5bb167ba970b5db477488a0d89bb7ff9dd31c531281` |
| `src/lib/payment/providers/credentials.ts` | 2473 | `e74f8381714d984d2462af7de1b454fbf844b0adc68ade172e52e8fceb6574a3` |
| `src/lib/payment/eximbay/__tests__/ready-config.test.ts` | 4556 | `2d3e16b8a43ca0a5bcb22e8bf50a70f6b075ba39eec3d6f81696a398feab0963` |
| `src/lib/payment/eximbay/__tests__/ready-contact.integration.test.ts` | 23044 | `411f7cc00cbf881aa2147d656988f4ffb53ce2b13fbee7e099840d806e4077fb` |
| `src/lib/payment/eximbay/__tests__/ready-facts.test.ts` | 4549 | `d4d5d78bf7e24b48c18a55fd6a313668ea5c8c2a269979bd019f85e5ead34131` |
| `src/lib/payment/eximbay/__tests__/ready-http.test.ts` | 12534 | `6f5e7157e04df770441fde608a59608f82a448804218782798c795f091c605bd` |
| `src/lib/payment/eximbay/ready-config.ts` | 3923 | `58101577197106ba350b11c4d25decadeff68e5f9dac11e28d01893eb445c18c` |
| `src/lib/payment/eximbay/ready-contact.ts` | 10558 | `18a2108df1bc0ad4e38b7999db90b7d7c75ea0b01d48534e4bceb14bd270d270` |
| `src/lib/payment/eximbay/ready-facts.ts` | 4419 | `4117452695acd6af5f871b7f6e00d8fd023228e1eba0c2baccd6b3f4852acb4f` |
| `src/lib/payment/eximbay/ready-http.ts` | 3985 | `13be506a6f6ea9bc9bb60022eaf667207ff83e3dae09e4ea8a90bafab8648ee8` |

No source identity differs from the independently reviewed candidate.

## 3. Canonical purchaser and READY facts

The installed S2 path reloads the CheckoutSession owner and uses the canonical
`User` row:

```text
buyerName:
  CheckoutSession owner User.name

buyerEmail:
  CheckoutSession owner User.email

shipping recipientName fallback:
  impossible / forbidden
```

The exact-text boundary rejects invalid canonical purchaser facts before
provider contact. This is validation of the application-owned input boundary,
not legal or cardholder identity proof. The reviewed tests include invalid
canonical `User.email` cases and verify zero provider fetches.

Market-default payment-page language and method mapping are:

```text
JP market -> JP
US market -> EN
other market -> pre-contact reject

trusted generic CARD -> P000
other method -> pre-contact reject
```

The supported exact minor-unit currencies are `USD` and `JPY`; no floating-
point amount conversion is installed. URLs derive from the validated,
server-owned `PAYMENT_PUBLIC_ORIGIN`:

```text
/checkout/return/{encoded CheckoutSession.id}
/api/payments/eximbay/status
```

The status path is only a string in the READY request facts. No BF4/status
route exists or is authorized by this record.

## 4. Configuration, credentials, and environment ownership

The exact environment names are:

```text
EXIMBAY_SANDBOX_API_KEY
EXIMBAY_SANDBOX_MID
EXIMBAY_LIVE_API_KEY
EXIMBAY_LIVE_MID
PAYMENT_PUBLIC_ORIGIN
```

`.env.example` documents names only. Name presence does not enable Eximbay.

Installed ownership and fail-closed behavior are:

```text
SANDBOX key + MID:
  atomic mode-bound pair

LIVE key + MID:
  atomic mode-bound pair

Payment.mode:
  owner of an existing persisted attempt

config mismatch:
  fail closed before contact

API key / Authorization:
  opaque server transport material; not durable, browser-visible, or logged

Authorization:
  Basic Base64(UTF-8(apiKey + ":"))
```

`PAYMENT_PUBLIC_ORIGIN` is a strict HTTPS root origin. There is no fallback to
request headers, browser values, or `NEXTAUTH_URL`.

## 5. Contact lifecycle and cross-provider boundary

The installed Eximbay ordering is:

```text
authorize/reuse Payment
-> prepare complete canonical facts/config/binding/S1 plan
-> zero provider I/O
-> re-lock/reload CheckoutSession + owner User
-> compare prepared authority
-> strict exact Eximbay contact claim
-> durable CONTACTED/contactStartedAt
-> only then execute S2 HTTP transport
```

The strict final CAS binds at least:

```text
Payment.id
checkoutSessionId
provider
mode
providerOrderId
amount
currency
routingRuleId
uncontacted output/lifecycle fields
```

For an existing uncontacted Eximbay Payment, an incoming/configured mode
mismatch preserves the same Payment and `providerOrderId`, performs no generic
supersession, does not mark `CONTACTED`, and performs zero provider I/O.

The generic MOCK/TOSS/PAYPAL lifecycle predicates retain baseline semantics;
the stricter claim and `OUTCOME_UNKNOWN` predicates are Eximbay-specific.

## 6. HTTP transport As-Built

S2 now owns concrete provider-contact-capable server HTTP source. It is still
dormant and has not contacted Eximbay. The transport is:

```text
method:
  exact S1 POST

endpoint/body/content type:
  exact trusted S1 plan

Authorization:
  same-mode Basic auth

total deadline:
  15000 ms

automatic retry:
  0

redirect:
  error

response:
  streamed to installed S1 admission
```

Ordinary tests use injected/fake fetch. The one-shot transport port refuses a
second transport invocation. A concrete contact-capable source is not the
same authority as provider-contact execution:

```text
concrete contact-capable source installed != provider-contact execution authorized
```

## 7. Outcome and READY mapping

Transport failure, timeout, non-2xx, malformed/admission failure, and provider
non-`"0000"` all map to `OUTCOME_UNKNOWN`, with no same-attempt READY
recontact. Exact S1-admitted `"0000"` yields only:

```text
CONTACTED
+ initiationOutputKind = READY
+ initiationCompletedAt
```

That is not financial success, a paid Order, capture, completion, or merchant
capability evidence. `providerRef` remains null unless separately justified.
No new lifecycle state or schema/migration was added.

The public/generic initiation boundary deliberately drops the fresh transient
authority. Durable READY re-entry is non-actionable; a lost transient handoff
does not authorize recontact merely to recover it.

## 8. One-shot prepared authority and custody

`PreparedEximbayReadyContact` is a non-forgeable exact authority. It is marked
consumed synchronously before transport, so a second execution is rejected
before another fetch. The first transport failure or non-admission leaves that
authority consumed. A fresh admitted READY authority preserves:

```text
exact trusted S1 plan object identity
+ exact TrustedEximbayReadySuccess object identity
```

inside opaque server-only in-memory custody. It is never durable, a generic
`PaymentInitiateResult`, `providerRef`, `providerPaymentKey`, browser output,
or log/error telemetry. It is not reconstructable from a copied structural
shape. Future S3 must receive separate authority to consume the same fresh
pair.

## 9. Production ownership and isolation

The current exact production importer sets are enforced by the TypeScript
AST/module-identity guard in `s1-isolation.test.ts`:

```text
S1 ready-kernel production importers:
  src/lib/payment/eximbay/ready-contact.ts
  src/lib/payment/eximbay/ready-http.ts

ready-contact.ts production importer:
  src/lib/payment/attempt/initiate.ts

ready-http.ts production importers:
  src/lib/payment/eximbay/ready-config.ts
  src/lib/payment/eximbay/ready-contact.ts
```

The guard covers reviewed static, dynamic, `require`, and module-identity
resolution forms and rejects any unexpected production importer. The allowlist
is exact as-built evidence, not a promise that a future reviewed S3 change can
never alter it.

## 10. Correction and validation history

The first adversarial S2 review found:

```text
BLOCKER 0
IMPORTANT 3
MINOR 1
```

The bounded findings were:

```text
I1R-I01:
  generic provider lifecycle predicates were unintentionally strengthened

I1R-I02:
  importer guard was too weak / syntax-form bypassable

I1R-I03:
  prepared contact authority itself was not one-shot

I1R-M01:
  redaction evidence overclaim + canonical email negative-test gap
```

The corrected reviewed candidate restored generic baseline predicates,
installed syntax-aware exact importer detection, consumed the prepared
authority before transport, and corrected redaction evidence plus invalid
canonical-email pre-contact/zero-fetch coverage. All findings are closed.
No source changes occurred after final closure before merge.

Historical evidence bound to the reviewed source chain:

```text
correction-focused:
  144 / 144 PASS

mandatory focused:
  10 files; 300 / 300 PASS

full npm run verify:
  271 test files; 6076 / 6076 PASS
  typecheck PASS
  lint PASS
  git diff --check PASS

local production build:
  Google Fonts Geist / Geist Mono network fetch failure
  exact authorized baseline reproduced the same failure
  S2-attributable build regression not observed
```

The build limitation is not rewritten as a successful local full build.

## 11. Durable state, activation, and known limitations

```text
schema/migration:
  unchanged

new lifecycle state:
  none

routing/factory:
  unchanged / EXIMBAY disabled

real credentials:
  none installed, approved, or used by this record

real provider contact:
  none performed or authorized

SDK/S3:
  absent

BF4/status route:
  absent

sandbox/live/customer activation:
  none
```

Known limitations and separately gated next slices include: Google OAuth
`User.name` normalization for every payment-eligible user; merchant/account
P000 and currency capability; approved real key/MID values; an approved
`PAYMENT_PUBLIC_ORIGIN` runtime value; real sandbox READY evidence (E1A);
S3/browser two-channel handoff and SDK loader / `request_pay`; BF4 status,
verification, duplicates, and financial completion; provider `readyFgkey`
TTL/replay semantics; and any routing or activation. These do not make the
closed S2 source slice incomplete; they keep the larger flow dormant.

## 12. Rollback and recovery

While dormant, source rollback is a revert of the reviewed S2 source merge.
There is no schema or routing rollback. If a later authority ever performs
provider contact, rollback must never rewrite a `CONTACTED`,
`OUTCOME_UNKNOWN`, or `READY` row as uncontacted merely because S2 source is
reverted. Provider inquiry, reconciliation, or recontact requires a separate
reviewed authority.

## 13. Re-entry and change-control gates

Create a new Source Status version or reviewed update for material changes to
the purchaser provenance; market/language or CARD/P000 mapping; supported
currencies; `Payment.mode` ownership; credential env names or pairing;
`PAYMENT_PUBLIC_ORIGIN`; URL derivation; pre-contact snapshot/CAS semantics;
mode-mismatch preservation; timeout, retry, or redirect policy; S1 admission
ownership; `OUTCOME_UNKNOWN` mapping; one-shot prepared authority; exact plan
and success custody; production importer allowlists; generic lifecycle
preservation; schema/durable state; routing/factory reachability; S3; BF4;
or provider-contact/runtime activation.

## 14. Final source-status summary

EX2B2-S2 is merged, installed, independently source-closure reviewed, and
dormant. It adds the application-owned canonical purchaser/configuration
gate, strict persisted-attempt claim, concrete injected-fetch HTTP transport,
conservative outcome mapping, and one-shot transient READY custody around the
unchanged S1 kernel. It does not authorize provider contact, routing, SDK,
BF4, sandbox/live execution, or customer activation.

```text
EX2B2-S2 SOURCE STATUS / AS-BUILT RECORDED
— INSTALLED / DORMANT / NO RUNTIME AUTHORITY
```
