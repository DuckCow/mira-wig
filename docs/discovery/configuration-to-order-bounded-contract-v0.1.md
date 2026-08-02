# WIG-COM-CONFIG-R2-GPT-C1 — Configuration-to-Order Bounded Contract v0.1

**Project:** Mira Wig Commerce
**Repository:** `DuckCow/mira-wig`
**Expected repository baseline:** `84d3afd832e905ad054c08f7bf1a84425a08b52d`
**Contract date:** 2026-08-01
**Status:** `READY_FOR_BOUNDED_IMPLEMENTATION`
**Authority class:** bounded design authority; source authority is granted only through an explicitly scoped implementation task.

---

## 0. Authority and precedence

This contract supersedes, for the bounded subject matter defined here:

- earlier statements that routine human review or quote issuance is the default fallback for configurable orders;
- the original four-to-five-character share-code proposal;
- any interpretation that a mutable cart row or raw parameter payload is sufficient commercial authority;
- any interpretation that checkout may silently repair a style/variant identity mismatch;
- any interpretation that a production-facing specification may be regenerated under later rules after the customer has committed.

This contract does **not** supersede:

- Product Media Contract v0.2;
- existing payment/refund security contracts outside the exact boundaries named here;
- legal, tax, customs, provider-contract, manufacturing, or material evidence requirements;
- current production data.

No live payment provider, customer-visible configurator, Standard MTO acceptance, public sharing, manufacturing activation, or migration is authorized merely by this document.

---

## 1. Fixed human decisions

The following are fixed for this contract.

### 1.1 No routine per-order feasibility review

A directly orderable configuration must not require routine operator or factory feasibility approval after the customer submits it.

```text
DIRECT_ORDERABLE requires:
  configuration validity resolved;
  manufacturing rule resolved;
  price resolved;
  lead-time promise resolved;
  market eligibility resolved;
  current acceptance policy resolved.
```

`UNKNOWN`, unsupported, stale, or rule-unresolved states fail closed out of checkout.

Periodic rule maintenance, capacity-policy maintenance, and exception handling are permitted. They are not allowed to become concealed per-order review.

### 1.2 Two customer spaces

```text
ORDERABLE SPACE:
  exposes only approved values and combinations;
  may produce an automatic commercial commitment.

RENDER SPACE:
  may be broader;
  may be rendered, saved, forked, shared, or interest-registered;
  creates no price, lead-time, availability, quote, or production promise.
```

A routine valid adjustment does not need a status banner. Normal truth is carried persistently by price, lead-time class, fulfilment wording, and the CTA. Crossing into a non-orderable state receives one local explanation plus the changed CTA/state.

### 1.3 Launch routes

The bounded launch route vocabulary is:

```text
DIRECT_ORDERABLE
CONCEPT_ONLY
```

A `DIRECT_ORDERABLE` line may be fulfilled as:

```text
STOCKED
STANDARD_MTO
```

A routine bespoke-quote lane is not a fallback. A premium human-reviewed service may be introduced later under a separate contract.

### 1.4 Rendering and fulfilment are independent

Rendering is a presentation capability. Fulfilment is a separate resolution.

A rendered configuration may be stocked, MTO, concept-only, or temporarily unavailable. A non-rendered product may also be stocked or MTO.

---

## 2. Bounded domain meanings

The following meanings are distinct even when some share a physical database carrier.

### 2.1 Merch Style

Customer-facing family used for merchandising, content, discovery, and canonical style relations.

It may own:

- customer-facing naming;
- descriptions and media relations;
- presentation grouping;
- style-level review aggregation.

It does not own the physical zone mapping or manufacturing compatibility truth for every base.

### 2.2 Technical Model

A base/cap-rooted parameter space.

It owns or references:

- physical zone identifiers;
- mesh/zone mapping;
- available parameters;
- allowed values and ranges;
- compatibility rules;
- projection-rule version;
- render-profile version;
- orderability-rule version.

One Merch Style may present several Technical Models.

Base/cap selection may look like a customer option, but it changes the model root rather than behaving as one flat peer parameter.

### 2.3 Configuration Draft

Mutable customer work.

It is not:

- an offer;
- a cart authority;
- an order authority;
- a production instruction.

### 2.4 Configuration Revision

Immutable customer intent produced from a Draft.

Minimum semantic contents:

```text
canonical merch-style reference;
technical-model reference and version;
parameter-schema/vocabulary version;
canonical parameter values;
projection-rule version;
orderability-rule version;
render-artifact reference and renderer version, when one exists;
lineage from preset/share/prior draft, when applicable;
created time and owner/public scope.
```

Editing a Revision creates a new Draft or Revision. It never mutates the original.

### 2.5 Checkout Commitment

The immutable commercial commitment created before external payment begins.

It is the first-slice physical carrier for the machine-issued Offer.

Minimum semantic contents:

```text
Configuration Revision reference, when configurable;
canonical style and variant/SKU identity, when finite-SKU;
market;
currency;
item totals and payable-total components;
lead-time promise and basis;
fulfilment resolution;
validity window;
price-book/rule/policy versions;
exact production projection payload or stable reference to it;
projection hash;
current sellability/publication decision;
allocation requirements;
customer-visible summary/render witness.
```

Checkout never binds to raw mutable parameters.

A change to configuration, price, currency, lead time, payable total, fulfilment, market, or production projection invalidates the Commitment and requires a new commitment plus customer re-consent.

### 2.6 Payment Attempt

An immutable-routing, append-updated execution record for one payment try.

It records at least:

```text
checkout-session/commitment identity;
attempt sequence;
selected provider;
mode: mock | sandbox | live;
market;
currency;
payment method;
amount;
routing policy version;
adapter version;
selection reason;
provider references and verified facts;
captured/authorized amount;
local lifecycle;
provider outcome;
failure class;
idempotency identities;
raw verified callback/webhook references as permitted by security contracts.
```

Browser redirect/query values are not success authority.

### 2.7 Allocation

A claim against a fulfilment substrate.

```text
STOCK allocation:
  exact finite inventory.

CAPACITY allocation:
  bounded Standard MTO acceptance capacity.
```

Stock and capacity are not one counter and do not silently share semantics.

Detailed component inventory, material-lot allocation, and labour scheduling are deferred.

### 2.8 Order-Line Snapshot

Immutable record of what the customer actually bought.

It copies or binds by immutable identity to:

- accepted customer intent;
- canonical style and SKU identity;
- accepted commercial terms;
- fulfilment resolution;
- exact render/customer summary shown;
- exact production projection accepted before payment.

Historical order truth is not reinterpreted using current catalog or rule data.

### 2.9 Build Spec / Manufacturing Request

The production-facing instruction.

For the first slice, it may be carried by an extended Manufacturing Request rather than a new top-level entity.

The exact Build Spec candidate must be computed and frozen **before external payment becomes irreversible**, as part of Checkout Commitment creation or final pre-payment commitment refresh.

Order finalization copies or references that exact frozen payload. It does not rerun current projection rules after capture.

Approved later substitutions or deviations are append-only records and do not mutate the original Build Spec.

---

## 3. UX contract

### 3.1 Quiet valid state

A valid orderable state shows, persistently but without repetitive alert banners:

```text
current authoritative or clearly estimated price;
current lead-time wording;
fulfilment wording when relevant;
appropriate CTA.
```

### 3.2 Active exception messaging

Active messages are reserved for:

- orderable → non-orderable boundary crossing;
- unavailable input;
- incompatible option;
- changed price/lead/fulfilment after revalidation;
- fast-shipping benefit;
- expired commercial commitment;
- another material exception.

### 3.3 Base/model switch

A base switch is not committed before the customer sees the consequences.

```text
attempt model switch
→ compute preserved, removed, reset, and changed values
→ display itemised diff
→ display price and lead-time delta
→ customer confirms
→ create the new Draft state
```

No silent coercion.

### 3.4 Concept forward path

A concept may provide:

```text
save;
fork;
share, when enabled;
register interest / notify if orderable.
```

Interest registration is signal-only:

- no operator task;
- no quote;
- no price;
- no SLA;
- no production promise.

---

## 4. Canonical catalog integrity predicates

One universal “sellable” boolean is too coarse. The first source slice must establish two canonical predicates.

### 4.1 `STYLE_PUBLISHED_IN_MARKET`

Equivalent semantic conditions:

```text
style exists;
style is globally active;
style has an active publication/market relation for the selected market.
```

All customer discovery and direct style-detail entry points must use the same publication meaning.

A direct URL must not bypass market publication.

### 4.2 `VARIANT_PURCHASABLE_IN_MARKET`

Equivalent semantic conditions:

```text
STYLE_PUBLISHED_IN_MARKET;
variant exists and is active;
variant belongs to the exact canonical style;
required market price exists;
current pre-existing availability/stock policy passes.
```

The C0 slice must not redesign MTO stock semantics, price calculation, shipping, tax, or fulfilment policy. It makes current policy consistent and fail-closed.

### 4.3 Same-parent invariant — LBD-06

A caller-supplied style identity and a variant identity must never be independently trusted.

```text
variant canonical parent != supplied style
→ explicit rejection
→ no cart/session/order write
```

Existing malformed cart rows:

- are not silently canonicalized;
- do not produce checkout commitments;
- do not produce orders;
- remain visible only as an actionable invalid/unavailable line or are removed through an explicit customer action.

Checkout-session creation and order finalization must independently reassert the invariant.

### 4.4 Publication parity — LBD-07

Listing, direct PDP, related cards, cart admission/read, checkout-session creation, and finalization must not invent different meanings of market publication.

They may apply stricter stage-specific conditions, but those conditions must build on the same canonical predicates rather than bypass them.

---

## 5. One checkout mechanism, multiple entries

There may be multiple customer entries:

```text
single accepted configurable commitment → direct checkout;
general cart → stocked items, accessories, or multiple lines.
```

There is one checkout-session/commitment mechanism.

Direct checkout may auto-create a single-line session. It must traverse the same:

- identity validation;
- market publication validation;
- price/payable-total freeze;
- projection freeze;
- attempt rules;
- allocation rules;
- finalization rules

as cart checkout.

An alternate “fast” implementation that skips canonical validation is prohibited.

---

## 6. Payment-attempt invariant

### 6.1 At most one active non-terminal attempt

For each Checkout Session or equivalent commitment:

```text
number of locally ACTIVE, non-terminal Payment Attempts <= 1
```

This must be concurrency-safe at the database/transaction boundary, not merely an application pre-check.

### 6.2 Reuse or supersession

A repeated start request:

- may reuse the active attempt only when the commitment, amount, currency, provider route, and provider state make reuse safe;
- otherwise atomically supersedes the prior local attempt before creating the next one.

A superseded attempt is not erased. Late callbacks are still verified and processed idempotently.

A superseded attempt that later becomes financially successful:

- must not create a second order;
- enters compensation/reconciliation handling;
- raises an operational signal.

### 6.3 Minimum conceptual outcomes

Physical schema may use one enum or two axes. The semantics must represent at least:

```text
INITIATED
PENDING
AUTHORIZED, where supported
SUCCEEDED/CAPTURED
FAILED/DECLINED
UNKNOWN
VOIDED/CANCELLED
SUPERSEDED
FINALIZED
```

`UNKNOWN` is never guessed into success or failure from timeout alone. It is resolved by provider verification or reconciliation.

---

## 7. Allocation and irreversible payment ordering

External payment and local database state cannot be one atomic transaction. A provider-specific profile must select one verified protocol before live activation.

### 7.1 Preferred protocol: separate authorization and capture

```text
1. create/freeze Checkout Commitment;
2. final local revalidation;
3. create or reuse the single active Payment Attempt;
4. external authorization — reversible;
5. conditional local STOCK or CAPACITY allocation;
6. if allocation fails, void authorization;
7. external capture — irreversible;
8. idempotent local finalization using the frozen commitment;
9. consume allocation and create Order/Order-Line/Manufacturing Request.
```

No price or lead-time change is allowed between authorization and capture.

### 7.2 Degraded protocol: immediate approval with verified same-window cancellation

This branch is allowed only after provider evidence demonstrates a safe automatic cancellation mechanism.

```text
1. freeze commitment and revalidate;
2. immediate provider approval;
3. conditional local allocation;
4. allocation failure → immediate automatic cancellation;
5. allocation success → idempotent finalization.
```

This is a degraded financial experience and must be measured separately.

### 7.3 Reservation-based provider profile

A short-lived pre-payment allocation/reservation profile may be introduced only under a provider-specific contract that defines:

- ownership by one active attempt;
- expiry semantics;
- payment success after expiry;
- abandoned attempt cleanup;
- callback delay;
- denial-of-inventory controls;
- compensation path.

It is not part of C0.

### 7.4 Lead-time changes

If capacity resolution changes the promised lead time:

```text
do not capture;
invalidate or revise the commitment;
show the changed promise;
obtain customer re-consent;
start a new or refreshed attempt.
```

An over-acceptance tolerance must never silently change an already accepted promise.

---

## 8. Production-projection freeze

The projection that becomes the Build Spec is calculated before payment becomes irreversible.

```text
Configuration Revision
→ create Checkout Commitment
→ calculate exact buildProjectionPayload
→ record projection versions and hash
→ show customer-facing summary
→ payment
→ finalization copies/references the frozen payload
```

Prohibited:

```text
capture payment
→ later run current projection rules
→ manufacture the newly derived result
```

Any projection or rule change before payment requires a new Commitment and explicit re-consent.

Production handoff records where/when the frozen spec was sent. It does not redefine it.

---

## 9. Configuration-code authority

### 9.1 Public Share

`PUBLIC_SHARE` is a bearer capability.

Requirements before activation:

- token contains no style authority or personal meaning;
- at least 64 bits of cryptographic randomness; 128 bits recommended;
- store a token hash rather than the raw token where practical;
- target is an immutable, sanitised Public Projection created at issuance;
- the Public Projection schema structurally excludes measurements, identity, order linkage, private notes, and payment facts;
- unauthenticated `not found`, `expired`, `revoked`, and `private` responses are indistinguishable;
- revocation and expiry are supported;
- resolution forks to a new Draft before editing;
- current orderability is re-evaluated and differences are shown before ordering.

### 9.2 Private Resume

`PRIVATE_RESUME` is an authenticated, owner-bound reference.

Possession of the identifier is not authorization.

Measurement-bearing resume is disabled until a separate retention, deletion, access, and legal policy is approved.

### 9.3 Order Reference

`ORDER_REFERENCE` is authenticated to the order owner or authorized staff.

It is not a public lookup capability.

### 9.4 Preset/Campaign code

A preset or campaign code is a public, non-secret identifier in a separate namespace and resolution path.

No code string is authoritative for style identity, configuration meaning, review aggregation, or access permission.

---

## 10. Exception and activation gates

Real Standard MTO money may not be accepted until:

```text
orderable range is evidenced and approved;
price and lead-time rules are versioned;
capacity acceptance policy is active;
same-parent and publication parity are enforced;
single-active-attempt semantics are enforced;
provider-specific payment protocol is qualified;
payable-total policy is fixed;
cancellation/refund execution works;
minimal lifecycle notification exists;
paid orders can enter an operable production path.
```

A post-payment production rejection is an exception and must have:

- named owner;
- customer notification;
- cancellation/refund or re-offer path;
- ledger reconciliation;
- reason capture;
- feedback into rule narrowing.

No silent substitution.

---

## 11. Deferred capabilities

Not authorized by this contract's first source slice:

- new configurable-product customer UI;
- Technical Model, parameter-schema, or Configuration Revision database schema;
- renderer implementation;
- Standard MTO activation;
- detailed material/component inventory;
- labour scheduling;
- public share endpoints;
- measurement storage;
- premium bespoke quote workflow;
- deposits or split payments;
- a second live payment provider;
- Eximbay/Toss/PayPal activation;
- live refund activation;
- shipping/carrier integration;
- Product Specification Authority/PIM/PLM/ERP.

These remain represented by explicit seams only.

---

## 12. Implementation sequence

### C0 — Commerce integrity foundation — authorized by the accompanying Codex task

```text
C0.1  LBD-06 exact parent integrity
C0.2  LBD-07 canonical publication/purchasability predicates
C0.3  one active non-terminal Payment Attempt
C0.4  deterministic reuse or explicit supersession
C0.5  late-callback and duplicate-order safety
C0.6  regression and concurrency evidence
C0.7  install this contract as repository documentation
```

C0 does not add the configurable-product schema.

### C1 — Configuration semantic foundation — not yet source-authorized

Potential later scope:

```text
Technical Model identity;
versioned orderable schema;
Configuration Revision;
render witness reference;
Checkout Commitment field group;
pre-payment build-projection freeze.
```

C1 requires an exact source mapping after C0.

### C2 — Allocation and provider protocol — not yet source-authorized

Requires:

- provider evidence;
- capacity policy;
- fulfilment branch decision;
- payable-total policy.

### C3 — Customer configurator and sharing — not yet source-authorized

Requires renderer, UX, privacy, and activation gates.

---

## 13. C0 acceptance criteria

### 13.1 Parent integrity

Tests must prove:

- forged `style A + variant belonging to style B` is rejected before write;
- no cart row, session snapshot, order item, or manufacturing request is created;
- an existing malformed cart row is not silently repaired;
- session creation and finalization independently fail closed;
- exact canonical style/variant identity is snapshotted on valid orders.

### 13.2 Publication parity

Tests must prove:

- market-unpublished style cannot be reached as a sellable direct PDP;
- listing and direct PDP use the same publication meaning;
- related cards never weaken publication;
- cart and checkout reject a variant whose style is not published in the market;
- market switching revalidates;
- inactive variants and missing market price fail closed;
- current stock/MTO behavior is not unintentionally redesigned.

### 13.3 Attempt singularity

Tests must prove under concurrency:

- two simultaneous initiation requests do not create two active attempts;
- safe repeated requests reuse the intended attempt or produce one explicit supersession;
- the old attempt remains auditable;
- a late success for a superseded attempt cannot create a second order;
- finalization remains idempotent on the provider financial reference;
- `UNKNOWN` remains unresolved until verification/reconciliation.

### 13.4 Quality gates

At minimum:

```text
focused integration tests;
database concurrency tests;
Prisma validation and generation, when schema changes;
typecheck;
lint;
full test verification;
production build;
git diff --check;
clean final worktree except intended files.
```

No production DB, customer, provider, storage, email, SMS, or external service may be contacted.

---

## 14. Human decisions and evidence gates

The bounded design contract can exist before these decisions, but activation cannot.

```text
H-01 first launch market;
H-02 first live provider;
H-03 payable-total composition and tax/shipping display;
H-04 cancellation/refund policy and legal review;
H-05 launch Technical Model and orderable range;
H-06 risk-based physical qualification plan;
H-07 price-book and lead-time rules;
H-08 capacity unit and acceptance limit;
H-09 whether any true STOCKED product exists at launch;
H-10 whether Studio launches;
H-11 whether PUBLIC_SHARE launches;
H-12 measurement retention/access policy;
H-13 merchant/legal-seller structure per provider;
H-14 exception owner and SLA.
```

---

## 15. Change control

A change requires a new contract revision when it changes:

- direct-orderability meaning;
- customer commitment point;
- production-projection freeze point;
- payment/allocation ordering;
- payment success authority;
- share-code capability class;
- same-parent or market-publication meaning;
- routine operator-review policy.

A mere implementation detail may vary without revision only if all invariants and acceptance tests remain satisfied.

---

## 16. Explicit non-authority statement

This document authorizes no live activation and no broad configurable-product implementation.

The accompanying Codex task authorizes only C0 on a temporary branch after a strict repository preflight.

No other source, schema, migration, provider, data, customer, production, or deployment change is authorized.
