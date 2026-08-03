# WIG-COM-CFG-C1-S0-GPT-AUTHORITY-CONTRACT-v0.1
## Catalog Product Specification & Configurable Product Foundation Contract v0.1

**Project:** Mira Wig Commerce
**Repository:** `DuckCow/mira-wig`
**Observed source baseline:** `main` at `4073d82d5d6309f535a0d4dcab8e7a38032fa712`
**Draft date:** 2026-08-04
**Document status:** `FROZEN v0.1 — EFFECTIVE UPON REVIEWED MERGE`
**Authority class after reviewed merge:** bounded design authority only
**Source / schema / migration authority:** `NOT GRANTED`
**Customer or production activation:** `NOT GRANTED`
**Canonical repository filename after reviewed merge:** `docs/product/catalog-product-specification-and-configurable-product-foundation-contract-v0.1.md`
**Change control:** `supersedes: none | superseded-by: none | bounded-amendment-of: docs/discovery/configuration-to-order-bounded-contract-v0.1.md (§0.4 only)`

---

## Scope

This contract governs only:

- bounded internal ownership, approval, effectivity and change control for Catalog Product Specification truth;
- the semantic identities required for a later configurable-product foundation;
- the minimum meaning, exclusions and immutability of `ConfigurationRevision`;
- the non-collapse boundaries among product intent, fit data, view state, rendering, production projection and commerce;
- current-source mappings and prohibited reinterpretations;
- the documentation, evidence and source-authorization gates that must close before Candidate A.

It does not govern or authorize:

- a customer configurator, Draft persistence, sharing/resume, rendering source, Fit persistence or checkout integration;
- the physical customer-fit measurement method;
- production-projection formulas, Build Spec payload, price, lead time, capacity, allocation, shipment or provider activation;
- Product Media source or deployment;
- D5/D6 vocabulary or activation;
- any Prisma, migration, source, environment or runtime change.

## 0. Purpose, authority and precedence

### 0.1 Purpose

This contract defines the bounded internal authority required before Mira may
implement a configurable-product source model.

It freezes only:

- who owns governed product truth;
- the semantic distinction between merchandising identity, technical model,
  hair-geometry profile, customer-adjustable product parameters, fit data and
  view state;
- the minimum meaning and non-authority of an immutable
  `ConfigurationRevision`;
- the relationship between configuration, rendering, production projection,
  commerce and manufacturing;
- the current-source mapping that prevents legacy or finite-SKU carriers from
  being silently reinterpreted as configuration authority;
- the gates that must close before a later source task may implement the first
  `TechnicalModelVersion + ConfigurationRevision` slice.

This contract does not choose database tables, JSON shapes, token formats,
renderer architecture, manufacturing formulas, prices, lead times, capacity,
sharing policies, or launch parameter values.

### 0.2 Precedence

Upon reviewed merge, this contract:

- supplements and narrowly amends the C1 semantics of
  `docs/discovery/configuration-to-order-bounded-contract-v0.1.md` only as listed in §0.4;
- supplies the bounded Catalog Product Specification dependency required by
  `docs/discovery/product-media-contract-v0.2.md`;
- implements the next documentation decision required by
  `docs/product/external-product-truth-authority-decision-v0.1.md`;
- depends on, but does not amend or narrow,
  `docs/discovery/measurement-governance-contract-v0.1.md`.

It does not supersede:

- current C0 commerce-integrity source authority;
- current payment/refund security and lifecycle authority;
- Product Media rights, provenance, readiness or deployment-qualification
  semantics;
- Measurement Governance ownership of physical measurands, methods, evidence
  and uncertainty;
- current finite-SKU order history;
- legal, tax, privacy, manufacturing-evidence or provider-contract
  requirements.

Where this contract and an earlier UX document use the same word differently,
this contract governs the backend/domain meaning. Customer-facing copy remains
a separate product-UX responsibility.

### 0.3 Effect of this draft

This draft does not itself authorize a repository change.

A later documentation installation task may change only reviewed documentation
paths. A later source task must cite the reviewed-and-merged contract and must
receive a separately bounded implementation authorization.

### 0.4 Exact bounded amendments to Configuration-to-Order v0.1

Upon reviewed merge, this contract revises only these earlier C1 semantics:

1. `Technical Model` remains the versioned technical interpretation root, but
   renderer profile, production-projection rules and commercial orderability
   rules are separate authorities. A Technical Model may bind compatibility or
   references; it does not silently own every downstream rule.
2. `ConfigurationRevision` is narrowed to immutable product intent. Authoritative
   body measurements, current orderability/price/lead time, ProductionProjection
   payload, and required render-asset identity are not minimum Revision contents.
   Mutable Studio state and runtime rendering may still compose product intent with
   fit input; that composition does not transfer fit-data ownership into the Revision.
3. Durable RenderWitness and ProductionProjection/BuildSpec are sibling later
   derivations. Their implementation is not part of the first C1 source slice.
4. The pre-payment Build Spec freeze remains mandatory, but moves from C1 to the
   separately authorized C2 projection/commitment slice.
5. Because authoritative fit data is excluded structurally from Configuration
   Revision, a future public entry does not need a measurement-removal projection
   solely for that purpose. Public capability, sanitisation, expiry, revocation
   and access policy remain deferred and independently governed.

All other C0, payment, commitment, order and Build Spec safety rules remain in
force.

---

## 1. Evidence and current-state findings

### 1.1 Governing evidence

This contract is derived from:

- current `main` source, Prisma schema and all 32 migrations;
- `docs/discovery/catalog-evidence-status-v0.2.md` as the current catalog-evidence baseline;
- Codex C1-R0 read-only repository reconnaissance;
- Fable B1 adversarial audit and B2 counter-audit of Studio, model axes,
  revisions and configuration codes;
- Opus 5 technical/domain audit of the v0.1 review candidate against current `main`;
- Fable product/UX adversarial review of the pre-Opus v0.1 review candidate;
- direct closure verification of the integrated r3 candidate against every accepted Opus and Fable finding;
- `docs/handoff/mira_handoff_v37.md` for Claude-review precedence only; that handoff is historical, explicitly yields current-state facts to source, and grants no Product Specification or configurable-product authority;
- the project owner's subsequent measurement/rendering clarification;
- Configuration-to-Order Bounded Contract v0.1;
- Product Media Contract v0.2;
- External Product Truth Authority Decision v0.1;
- Measurement Governance Contract v0.1.

Codex, Opus and Fable reports are local review evidence and are not repository artifacts or source authority.
Repository installation must remain independently supportable from installed contracts, current source and recorded decision-log entries.

### 1.2 Current source truth

The current source has strong finite-SKU and commerce carriers:

```text
WigStyle
WigVariant
WigStyleMarket
VariantMarketPrice
CartItem
CheckoutSession / CheckoutSessionLine
Payment
Order / OrderItem
ManufacturingRequest
Refund lifecycle carriers
```

The current source has no governed carrier for:

```text
TechnicalModel
TechnicalModelVersion
ConfigurationDraft
ConfigurationRevision
ParameterSchemaVersion
ProductTruthReference
ProductionProjection
BuildSpec
RenderWitness
FitProfileRevision
Shipment / tracking / delivery
```

### 1.3 Existing fields are not silently promoted

The following current fields remain in their existing authority only:

- `WigVariant.color`, `length`, `curl` are free-form presentation/demo fields on current finite SKUs; they are not governed product facts or measured evidence;
- `CheckoutSessionLine.snapshotData` and `OrderItem.snapshotData` are current finite-SKU display snapshots; typed columns separately carry commercial identity and money;
- `ManufacturingRequest` is a downstream work-status carrier;
- `Fitting` is an exact-variant fitting/mock-result carrier;
- legacy `coverImageKey` / `imageKeys` are display references, not semantic
  Product Media authority;
- generic market/payment/refund JSON is not configurable-product authority;
- dropped legacy `TryOn.appliedOptions` is not a revival source;
- D5/D6 fixtures remain source-only or fixture-only and are not production
  configuration carriers.

No current JSON field is reinterpreted as a Technical Model, Configuration
Revision, render projection or Build Spec.

---

## 2. Fixed project decisions

The following are fixed by this contract candidate.

### 2.1 Internal Product Specification authority is required

There is no known external PIM, supplier master, ERP, governed manufacturing
master or equivalent system with real product-truth approval authority.

Therefore Mira requires a bounded internal `Catalog Product Specification`
authority.

### 2.2 Decision owner and operational steward

```text
FINAL PRODUCT-TRUTH DECISION OWNER:
  PROJECT OWNER

OPERATIONAL STEWARD:
  PROJECT OWNER or an explicitly delegated Product Specification steward

PROPOSAL AUTHORS:
  authorised admin/operator roles may prepare proposals;
  proposal authorship does not make truth approved or effective.
```

Delegation must be explicit, attributable and revocable. Existing generic
`ADMIN` status alone does not silently grant Product Specification approval
authority. Candidate A must define an enforceable approval-authority representation distinct from generic `ADMIN`, together with attributable approval records and revocation semantics.

### 2.3 Configuration Revision is the canonical product-intent root

`ConfigurationRevision` owns immutable customer/product intent only.

It does not own:

- body measurements;
- view state;
- current price or lead time;
- capacity;
- fulfilment promise;
- production instructions;
- order or payment state;
- shipment state.

### 2.4 Fit data is separate from product intent but composable

Authoritative customer fit records are not product intent. Their owner identity,
access, retention, deletion, correction history, qualification status and order linkage
belong to a later Fit domain contract.

Measurement Governance retains ownership of measurand families, measurement-method
semantics, units, uncertainty and method compatibility, including any future customer-fit
measurement family unless that contract is amended through its own change control.
This contract creates no competing measurement-method authority.

The separation is an authority and lifecycle rule, not a restriction on Studio
interaction, rendering responsiveness or eventual ordering. It is required
because:

- the same product design may be reused by people with different fit facts;
- remeasurement or correction changes body/fit evidence without changing product
  intent;
- measurement values require method, provenance, completeness and qualification
  semantics that ordinary product options do not own;
- product configuration and fit data have different sharing, privacy, retention
  and deletion requirements;
- one screen or one mutable client state does not make all edited values one
  durable domain authority.

This separation does not prohibit rendering from using fit input immediately.

A rendering context may compose:

```text
ConfigurationRevision or configuration draft
+ Fit input / FitProfileRevision or preview defaults
+ ViewState
+ renderer/asset compatibility
```

The data may appear together and update together in one Studio UI. Authoritative
fit values remain outside Configuration Revision, and a later order may bind a
Revision and a qualified Fit Profile by separate immutable references.

### 2.5 Render and production are sibling derivations

Both may derive from one immutable Configuration Revision, but neither is the
authority for the other.

```text
ConfigurationRevision
├─ Render derivation / optional RenderWitness
└─ ProductionProjection / BuildSpec
```

C1 does not implement either derivation as durable source authority.

### 2.6 Current MVP product controls remain orderable-only

For the planned MVP Studio, product-modifying controls may expose only values
within the governed orderable parameter schema of the selected model/profile.

View state may exceed orderable space and remains non-product state.

A future concept/play space requires a separate contract and may not silently
reuse the commercial `ConfigurationRevision` authority.

---

## 3. Authority decomposition

### 3.1 Catalog Product Specification authority owns

- approved and effective product truth;
- stable Technical Model identity and version meaning;
- Technical Model compatibility with Merch Styles and, where later approved,
  finite variants;
- product-fact classification;
- canonical parameter vocabulary and version ownership;
- product-change versus specification-correction classification;
- durable product-truth references;
- effectivity and supersession;
- propagation of product changes to dependent model/profile/revision/media
  scopes;
- attributable change records.

### 3.2 Merchandising/catalog presentation owns

- customer-facing style names;
- descriptions;
- presentation grouping;
- current catalog labels;
- style-level navigation and editorial relations.

`WigStyle` is the current merchandising family. It is not, by itself, a
Technical Model or Product Specification release.

### 3.3 Measurement Governance and the future Fit domain own distinct questions

Measurement Governance owns measurand families, measurement-method semantics, units,
measurement-result and uncertainty semantics, evidence requirements and method compatibility.
This ownership is not limited or reassigned by this contract.

A later Fit domain contract may own customer-specific record identity, owner access,
qualification workflow, retention, deletion, correction history and binding to rendering,
checkout and production. It must consume Measurement-Governance-approved semantics rather
than inventing them locally. That source does not yet exist and is not authorized here.

No product-configuration source may invent, default, promote or reinterpret authoritative
measurement or fit facts locally. A later renderer, commitment or production boundary may
consume a qualified Fit reference, but Configuration Revision does not become the owner of
those values.

### 3.4 Rendering/presentation owns

- renderer versions;
- renderer-compatible asset versions;
- mesh, strand, shader, LOD, lighting and display behavior;
- view state;
- display fidelity and disclosure;
- optional RenderWitness semantics under a later contract.

Rendering does not grant orderability or manufacturing authority.

### 3.5 Manufacturing owns

- production projection rules;
- Build Spec semantics;
- production tolerances;
- BOM, process and QC facts;
- manufacturing deviations and substitutions;
- manufacturing workflow.

Manufacturing may not reinterpret immutable product intent under current rules
after a commercial commitment has been accepted.

### 3.6 Commerce owns

- market publication and sellability;
- price, currency and payable total;
- fulfilment and lead-time promises;
- capacity/allocation acceptance;
- checkout commitment validity;
- payment and order creation.

A Configuration Revision alone is not a commercial offer.

### 3.7 Product Media owns

- media assets, assignments, permissions, applicability and readiness;
- media requirement mappings and compatibility policy;
- binding media claims to durable Product Specification truth references.

Product Media does not own product facts.

---

## 4. Normative domain meanings

### 4.1 Merch Style

Customer-facing product family used for merchandising, content, discovery,
review aggregation and canonical navigation.

Current source carrier: `WigStyle`.

A Merch Style may later relate to one or more Technical Model Versions. The
relationship must be explicit and must not be inferred from labels.

### 4.2 Catalog Product Specification release

An approved-and-effective, attributable statement of governed product truth for
a stated subject and scope.

A release supplies or permits derivation of a durable `ProductTruthReference`.
Drafts and proposals do not advance the reference.

### 4.3 Product Truth Reference

A durable reference to one approved-and-effective Product Specification state.

It must permit later determination of whether governed product facts materially
changed after the recorded reference.

The exact physical mechanism may later be a monotonic version, a governed
content digest, a durable change-event position or another reviewed mechanism.
This contract does not select the mechanism.

Every reference must declare its governed subject scope. For Candidate A, product-truth
references are `GLOBAL` with respect to market. Market publication, price, availability,
lead time and fulfilment remain Commerce facts and do not enter Revision identity.
A later market-specific physical-product truth scope requires a new reviewed contract and
may not be inferred from current market catalog rows.

### 4.4 Technical Model Version

An independently versioned technical identity that interprets configurable
product intent.

Its semantics bind:

```text
base/cap architecture identity;
implantation regime identity;
compatible zone-map semantics;
compatible Hair Geometry Profile identities;
a versioned compatible Parameter Schema Version set;
compatibility rules;
product-truth reference;
status/effectivity/supersession.
```

A Parameter Schema Version change within the declared compatible set does not by itself
create a new Technical Model Version. A new Technical Model Version is required only when
the structural interpretation contract itself changes as defined in §4.5 and §4.6.

A Technical Model Version is not identical to `WigStyle`, `WigVariant`, a
renderer asset, a production Build Spec or a customer Configuration Revision.

Implementation note: semantic component identities do not require a separate
Prisma table each. Source structure remains a later decision.

### 4.5 Base/Cap Architecture identity

The physical support/cap architecture and related structural facts.

A user-visible cap card may be a Technical Model selector even when it looks
like an ordinary option.

The decisive rule is:

```text
if changing base/cap materially changes any of:
  implantation regime identity;
  production-projection interpretation contract;
  compatible zone semantics;
  structural parameter semantics or bounds inseparable from the base/regime;
  root-direction interpretation;
then the selected TechnicalModelVersion must change.
```

A Parameter Schema range revision that does not change this structural interpretation
creates a new Parameter Schema Version, not automatically a new Technical Model Version.

A base-conditioned limit remains a Parameter Schema cross-parameter rule when it can be
expressed within one governed schema and the implantation/projection interpretation remains
identical. The same apparent limit is a Technical Model boundary when it is the consequence
of a different implantation regime, projection interpretation, zone meaning or root-direction
interpretation. UI disablement grammar is not evidence that the underlying technical meaning
is shared.

Sharing one zone map does not prove that two base architectures are the same
Technical Model.

A base/cap variation may remain an ordinary parameter or finite variant only
when a dated, attributable determination shows that all five criteria use the same
technical interpretation. Absence of a documented determination is a blocker, not
permission to infer sameness. The fail-closed default is a distinct Technical Model Version.

### 4.6 Implantation Regime identity

The governed structural interpretation family for hair-root placement, direction,
density semantics, attachment/retention constraints and the inputs/outputs expected by
production projection.

A retraining, weight refresh, calibration correction or production-rule implementation
version does not by itself create a new regime when the governed interpretation contract,
compatible inputs, outputs and historical meaning remain unchanged. Those downstream
versions are recorded by their own authorities.

A change to the interpretation contract, required inputs/outputs or compatibility meaning
creates a different Implantation Regime and therefore a different Technical Model Version,
even when a zone map or customer-facing style is shared.

### 4.7 Zone Map identity

The governed physical/logical zone semantics used by a Technical Model.

A Zone Map may be reused by more than one Technical Model Version. Reuse does
not collapse their other identities.

### 4.8 Hair Geometry Profile

A discrete product-shape profile independent of the physical base axis, subject
to explicit compatibility with a Technical Model.

Candidate semantics include:

```text
overall-length family;
curl family;
base silhouette / strand-path family;
profile classification needed by rendering and production.
```

For the MVP foundation:

- overall length and curl family are `PROFILE_SELECTABLE`;
- they are not root-structural merely because real-time rendering is costly;
- they are not free customer parameters yet;
- their MVP discreteness is a product-classification decision, not evidence derived from a renderer bundle boundary;
- future promotion to parameters remains possible only after rendering,
  production and orderability evidence supports the full path.

The current `WigVariant.length` and `WigVariant.curl` values are not
silently declared Hair Geometry Profile authority.

A Hair Geometry Profile length family is a product-shape classification. It is not, and
may not be used as, the method-bound measured strand length governed by Measurement
Governance Contract v0.1. It may not satisfy, substitute for, widen or be converted into
a measured observation or numeric-length retrieval assertion.

### 4.8A Hair Material / Fiber Specification

A governed statement of fiber composition, human-hair/synthetic/blend identity,
authenticity grade and related provenance where claimed.

It is independent of Hair Geometry Profile. Its launch classification must be explicit:

- `ROOT_STRUCTURAL` only when it changes the structural technical interpretation;
- `PROFILE_SELECTABLE` when offered as a discrete governed product construction;
- `ORDERABLE_PARAMETER` only when the selected model/profile, evidence, rendering, production and commerce path support customer adjustment;
- otherwise not selectable.

Current source contains no governed material/authenticity authority. A label, supplier claim
or image may not be promoted without attributable evidence and approved Product Specification truth.

### 4.9 Parameter Schema Version

A versioned definition of customer-adjustable product parameters for an explicit
compatible Technical Model Version / Hair Geometry Profile scope. Technical Model Versions
bind a compatible set of these schema versions rather than co-versioning with every range change.

It owns at least:

- canonical parameter names;
- value types;
- allowed values or ranges;
- required/optional status;
- cross-parameter compatibility;
- default or recommended values where governed;
- canonicalization semantics;
- unknown-field behavior;
- bounds on payload size, members, collections and nesting.

Current candidates, not yet launch facts:

```text
colour;
base/zone-bounded density;
future bang length.
```

No launch parameter name, value or range is approved merely by this document.

### 4.10 Fit input / Fit Profile Revision

Owner-scoped body and fit facts, including measurement-method and evidence
semantics when authoritative.

It is not a product parameter and is not part of Configuration Revision. This
classification does not prevent the UI from presenting fit input beside product
controls, does not prevent immediate render updates, and does not prevent a later
Checkout Commitment from binding the exact Revision and qualified Fit Profile
together.

A mutable `fitInputDraft` may exist alongside a mutable configuration draft in
one Studio session. Persisted authority, revision identity, sharing scope and
retention remain separate.

This contract defines the separation only. It does not authorize a Fit Profile
schema or source implementation.

### 4.11 Preview default fit

A non-authoritative value used only to render a standard or partially adjusted
preview.

A preview default:

- may update rendering;
- must be visibly distinguished from user-entered or measured fit;
- may not enter a Checkout Commitment, Production Projection or Build Spec;
- may not be silently promoted to customer measurement truth.

The minimum semantic distinction required by this contract is:

```text
PREVIEW_DEFAULT
USER_SUPPLIED_OR_DERIVED
QUALIFIED_FOR_ORDER
```

These are semantic classes, not source-authorized enum labels. A later Fit contract may
distinguish measurement methods, evidence sources, scan-derived facts or optional operator
assistance without changing this minimum distinction.

For the self-service launch route, `QUALIFIED_FOR_ORDER` must be reachable through an
approved customer-completable measurement and reconfirmation path without routine operator
approval. Optional scan or operator-assisted routes may exist, but they may not become a
hidden mandatory review gate unless a separately approved human-reviewed service contract
explicitly creates that route.

### 4.12 View State

Non-product presentation state such as:

```text
camera;
zoom;
rotation;
lighting;
background;
pose;
animation;
viewport quality tier.
```

View State is excluded from Configuration Revision, public configuration
meaning, production projection and order authority.

### 4.13 Configuration Draft

Mutable working state.

It may later coordinate product-input draft, fit-input draft and view state in
one UX session while preserving their authority separation.

A Draft is not an offer, Revision, order or production instruction.

Draft persistence is deferred and not part of the first source candidate.

### 4.14 Configuration Revision

Immutable canonical product intent.

Minimum semantic contents:

```text
canonical Merch Style reference;
Technical Model Version reference;
canonical customer-facing base/cap option identity and display snapshot when applicable;
Hair Geometry Profile identity;
Parameter Schema Version;
canonical parameter values;
lineage / origin reference where applicable;
owner or scope classification;
created time;
product-truth reference or equivalent approved-model binding.
```

Authority rule:

```text
technicalModelVersionId is the interpretation authority;
a duplicated customer-facing cap option is an audit/display snapshot only;
agreement is validated at Revision creation under the exact Technical Model Version and
Parameter Schema Version recorded by the Revision and is never re-evaluated using a later current mapping.
```

The customer-facing cap label/display snapshot is audit-only. It does not participate in
semantic equality, canonical content identity or idempotency unless a later source contract
explicitly proves that a named field carries governed product meaning.

Editing creates a new Revision. The prior Revision remains unchanged and
historically interpretable.

### 4.15 Configuration Revision exclusions

A Configuration Revision does not contain authoritative:

```text
body measurements or measurement evidence;
View State;
current price, tax, shipping or payable total;
lead time or capacity;
fulfilment promise;
current orderability;
Payment or Order identity;
Build Spec or manufacturing workflow state;
shipment or tracking state.
```

A renderer asset version is not required product intent. It may later be
recorded in a separate RenderWitness, display witness or compatibility record
without changing the Revision's product identity.

### 4.16 Render Context

A runtime composition, not a durable product-truth object:

```text
ConfigurationRevision or validated Draft
+ Fit Profile / fit input or Preview Default
+ View State
+ compatible renderer/asset version
```

Changing fit input may immediately change the preview without changing the
Configuration Revision.

The preview may represent an estimated fit. It must not claim an exact digital
replica when its inputs cannot support that claim.

### 4.17 RenderWitness

A possible later record of what the customer saw, under a separately reviewed
contract.

It may include renderer/asset/version/display-mode identity. It is not part of
C1 source authority and is not required for the Configuration Revision identity.

### 4.18 Production Projection / Build Spec

A future immutable manufacturing instruction derived from:

```text
ConfigurationRevision
+ qualified Fit Profile Revision, when required
+ versioned production-projection rules
```

It becomes manufacturing authority only at a later bounded commitment stage.

C1 does not create or persist it. C2 must define its payload, version, hash,
freeze timing and relation to Checkout/Order/ManufacturingRequest.

---

## 5. Product fact classification

Every proposed configurable fact must be assigned exactly one primary class.

### 5.1 `ROOT_STRUCTURAL`

A fact whose change selects a different Technical Model interpretation.

Examples may include base architecture or implantation regime when the rule in
§4.5 is met.

### 5.2 `PROFILE_SELECTABLE`

A discrete Hair Geometry Profile choice that is independent of base/root
identity but compatibility-constrained.

MVP candidates:

```text
overall length family;
curl family.
```

### 5.3 `ORDERABLE_PARAMETER`

A customer-adjustable product fact that is allowed by the selected Technical
Model, profile and Parameter Schema, and is supportable through rendering,
production projection and commercial orderability.

No candidate becomes launch-authoritative without evidence and approval.

### 5.4 `FIT_INPUT`

A customer body or fit fact owned by Fit/Measurement authority.

It may be edited with product controls and may affect rendering and production,
but it is not product intent and does not participate in Configuration Revision
identity or equality.

### 5.5 `VIEW_STATE`

Non-product presentation state.

### 5.6 `PRESENTATION_LABEL_ONLY`

A current catalog/display label without governed product-specification
semantics.

Until mapped by an approved specification, current `color`, `length` and `curl`
fields may be a mixture of finite-SKU facts and presentation labels. They may
not be bulk-promoted by assumption.

### 5.7 Future reclassification

A fact may move from `PROFILE_SELECTABLE` to `ORDERABLE_PARAMETER`, or from
presentation-only to governed product fact, only through explicit change
control that records:

- evidence;
- affected model/profile/schema versions;
- compatibility;
- historical interpretation;
- rendering and production support;
- commerce activation dependency.

Reclassification never rewrites old Revision meaning.

---

## 6. Product Specification lifecycle

### 6.1 Proposed, approved/effective and superseded states

Product Specification truth must distinguish at least:

```text
PROPOSED
APPROVED_EFFECTIVE
SUPERSEDED
```

These are semantic requirements, not a source-authorized enum.

Only `APPROVED_EFFECTIVE` truth may:

- advance a Product Truth Reference;
- bind a new Technical Model Version for governed use;
- support later Configuration Revision creation;
- satisfy Product Media product-truth dependencies.

### 6.2 Required change record

Every approved Product Specification change governed by `SPECIFICATION_CORRECTION` or
`PRODUCT_CHANGE` must record at least:

```text
actor / approving authority;
effective time;
basis/evidence;
prior truth reference;
new truth reference;
change type;
affected subject and scope;
propagation decision.
```

### 6.3 Change types

#### `SPECIFICATION_CORRECTION`

Corrects an erroneous statement or encoding without changing the physical
product or approved customer/order meaning.

A correction must not be used to conceal a physical change.

#### `PRODUCT_CHANGE`

Changes governed product meaning, including one or more of:

- physical base/cap architecture;
- implantation regime;
- zone semantics;
- Hair Geometry Profile meaning;
- parameter vocabulary or allowed product range;
- compatibility;
- production-projection semantics;
- another fact that changes what the customer would receive.

Identity mapping is explicit:

- base/cap architecture, Implantation Regime, zone interpretation or root-direction meaning change → new Technical Model Version;
- Hair Geometry Profile meaning change → new Hair Geometry Profile identity/version;
- parameter name, type, canonical meaning, allowed range, defaults or cross-parameter rule change → new Parameter Schema Version;
- a Parameter Schema change that also changes the structural interpretation contract → new Parameter Schema Version and new Technical Model Version;
- production-rule implementation/version change with unchanged product interpretation → new production-projection rule version, not a new Technical Model Version;
- hair-material/fiber meaning change → new approved material specification identity and any additional model/profile/schema version required by its explicit classification.

A Product Change never mutates old Configuration Revisions.

#### `PRESENTATION_CHANGE`

Changes copy, rendering assets, UI or media without changing product truth.

A presentation change does not create a new Configuration Revision by itself.
Product Media may still require assignment/readiness review.

#### `COMMERCIAL_POLICY_CHANGE`

Changes price, lead time, publication, capacity or fulfilment without changing
product truth.

It is owned by Commerce. §6.2's Product Specification change record does not apply,
and no Product Truth Reference advances. It may invalidate a Checkout Commitment.
It does not reinterpret a Revision.

#### `MEASUREMENT_OR_FIT_CHANGE`

Changes customer fit facts or evidence. It is governed by Measurement Governance and
the future Fit domain for their respective questions. §6.2's Product Specification
change record does not apply, no Product Truth Reference advances, and product intent
does not change.

### 6.4 Propagation

Every approved change must explicitly determine effects on:

```text
Merch Style compatibility;
finite WigVariant bridge, if one exists;
Technical Model Versions;
Hair Geometry Profiles;
Parameter Schemas;
future Configuration creation eligibility;
existing Revision interpretation;
Product Media truth references;
D5/D6 governed attribute vocabulary and retrieval compatibility;
Product Truth Reference subject/market scope;
governed successor/predecessor designation, or an explicit decision that none exists;
future orderability;
render compatibility;
production projection compatibility.
```

A deprecated or superseded style/model/profile may be presented as having a current
successor only when a governed successor mapping exists. “Closest current model” must not be
inferred from labels, similarity or operator convenience.

Absence of a propagation decision is a blocker, not permission to infer one. For one-person
operation, one explicit batch declaration may state that all enumerated propagation domains
were evaluated and are unaffected; omission is not equivalent to that declaration.

---

## 7. Technical Model and compatibility rules

### 7.1 Identity independence

Technical Model Version is independently versioned even if a first source
implementation stores it under one Merch Style.

Source convenience must not collapse semantic identity.

### 7.2 Merch Style relationship

A Technical Model Version must have an explicit compatible Merch Style scope.

A later source implementation may initially restrict one Technical Model to one
WigStyle if that is the smallest safe consumer. It must not make multi-style
reuse or one-to-one cardinality a permanent domain truth without evidence.

### 7.3 Finite-SKU bridge

A `WigVariant` may later be explicitly mapped to:

```text
one approved Technical Model Version;
one Hair Geometry Profile identity;
one canonical parameter value set.
```

No mapping is inferred from current labels or SKU strings.

A WigVariant is never itself a Configuration Revision.

The first source authorization must decide:

- whether multiple Configuration Revisions may bridge to one finite variant;
- whether the bridge is commercial authority or compatibility evidence;
- how historical variant changes interact with the mapping.

### 7.4 Model/profile compatibility

Compatibility must be explicit and versioned.

A Hair Geometry Profile may be semantically reusable across Technical Models,
but an actual renderer/strand asset may remain model/bundle-specific.

No free cross-product compatibility matrix is required until the product offers
cross-combination selection. A launch addendum may enumerate only qualified
combinations.

### 7.5 Transition behavior

A customer-visible model/profile switch must never silently coerce values.

A later UX contract must classify prior values as:

```text
PRESERVED
REMOVED
RESET
CHANGED
```

An incompatibility must be expressed through the affected value's governed `REMOVED`,
`RESET` or `CHANGED` disposition and reason. Mapping must be governed. Silent clamping
or substitution is prohibited.

---

## 8. Configuration Revision rules

### 8.1 Immutability

A persisted Revision is immutable.

A later source implementation must provide an externally enforced immutable boundary,
such as a database trigger, revoked update privilege or append-only store. Review of
application code or a service-layer convention is not an equivalent boundary.

### 8.2 Lineage

A new Revision may record lineage from:

- a prior Revision;
- a governed preset;
- a public configuration entry;
- a Draft.

Lineage never permits mutation of the ancestor.

### 8.3 Canonicalization and equality

Before source authorization, the project must define deterministic semantics for:

- canonical key/value ordering;
- numeric and textual normalization;
- duplicate/unknown field rejection;
- exact version binding;
- semantic equality;
- idempotent creation;
- payload limits;
- content identity or deduplication, if used.

Candidate A must not deduplicate across owner or scope boundaries. A later design may
separate reusable content identity from owner/scope references, but may not infer that
normalization before it is explicitly authorized.

This contract does not choose JSON canonicalization or hashing algorithms.

### 8.4 Ownership and scope

A Revision must have an explicit scope such as:

```text
ADMIN_OR_SYSTEM
CUSTOMER_PRIVATE
PUBLIC_PRODUCT_INTENT
```

These labels are illustrative until a source contract freezes vocabulary.

The first source candidate should be admin/system-operated unless a real
customer Draft and privacy contract is separately authorized.

### 8.5 Retention and deletion

Old Revisions needed for historical orders, review provenance or material-change
comparison may require durable retention.

Customer-owned deletion, account deletion and legal retention must be designed
before customer Revision persistence is activated.

A Product Specification or order reference must not become uninterpretable
because an unrelated customer-share token was revoked.

### 8.6 Non-authority

A Revision alone creates no:

```text
price;
quote;
lead time;
market availability;
publication;
fulfilment;
capacity allocation;
order;
payment;
production instruction;
shipment promise.
```

---

## 9. Fit, rendering and Studio behavior

### 9.1 One UI may compose several authorities

Studio may present product configuration, fit input and View State together.

Internal conceptual state should remain separable:

```text
configurationDraft
fitInputDraft
viewState
```

One screen does not imply one persisted object.

### 9.2 Immediate measurement-driven rendering

User-entered fit values may update rendering immediately, including from the
same interaction surface used for product controls.

This does not make them product parameters or automatically qualified
measurements. The render state may change before a Fit Profile is complete or
order-eligible.

Rendering impact may include:

- base/cap surface dimensions;
- hairline and ear-relative placement;
- root coordinates;
- apparent fit and silhouette;
- other model-supported geometry adjustments.

A small set of linear measurements cannot support an unconditional claim of an
exact head replica. The UI must distinguish estimated fit from qualified fit.

### 9.3 Preview defaults

Preview defaults are allowed only for rendering.

If some inputs remain defaulted, the customer must be told that the preview is
partly standard/default-based.

A checkout or production boundary must reject any required fit value still
classified as preview default.

### 9.4 Product-control orderability

For the MVP Studio:

```text
product-modifying controls
⊆ current orderable parameter space for the selected model/profile
```

This is a UX exposure rule, not server authority.

Server-side validation remains required at the relevant durable and commercial
boundaries.

### 9.5 Server validation boundaries

#### Revision persistence

Validate:

- model/profile/schema version existence and compatibility;
- parameter type/range and cross-parameter rules;
- unknown/duplicate field rejection;
- payload bounds;
- ownership/scope;
- canonicalization and idempotency.

Do not create a price or orderability promise.

#### Checkout Commitment creation

A later C2 contract must validate and freeze:

- current orderability;
- market;
- price and currency;
- fulfilment and lead-time promise;
- fit requirements and qualified fit reference, bound separately from product intent;
- exact production projection / Build Spec;
- when a render or preview materially informed customer consent, a durable customer-display
  witness or stable reference sufficient to identify the renderer/asset or profile version,
  display mode/tier and customer-visible summary; otherwise an explicit `NO_RENDER` fact;
- validity window and relevant rule versions.

#### Payment contact boundary

Revalidate that current authoritative commerce facts still equal the frozen
Commitment.

If they differ:

```text
do not silently replace terms;
invalidate or refresh the commitment;
show the changes;
obtain new customer consent.
```

#### Finalization / manufacturing handoff

Use the frozen Commitment and exact frozen projection.

Do not regenerate the purchased production result under current rules.
Perform integrity and identity verification only.

---

## 10. Rendering and production projection boundaries

### 10.1 C1 boundary

C1 semantic foundation may define Configuration Revision and model identities.
It does not need a durable RenderProjection or ProductionProjection source.

### 10.2 Render derivation

A renderer may consume validated product intent plus fit/view context and
compatible assets.

Renderer implementation reuse is not domain authority.

Renderer-only fields must not enter product or manufacturing specifications.

### 10.3 Production derivation

Production projection is deferred to C2.

C2 must define:

- projection rule version;
- exact input identities;
- payload schema;
- deterministic generation;
- hash/integrity semantics;
- freeze timing;
- customer-visible summary linkage;
- the minimum durable customer-display witness when a render/preview informed consent,
  including renderer/asset or profile identity and display mode/tier without placing those
  fields in Configuration Revision identity;
- Order/OrderItem/ManufacturingRequest binding;
- substitution/deviation history.

### 10.4 Historical render availability

A future public configuration may outlive a renderer asset.

Code/configuration validity must not depend on 3D availability.

A later rendering/sharing contract must define an honest fallback rather than
showing a substitute render as the historical render.

---

## 11. Sharing, resume and code non-authority

Detailed sharing/resume source work is deferred.

The following boundaries are frozen now:

- a public configuration entry may reference product intent only;
- public configuration access may not expose fit data, order data, payment data
  or internal production specification;
- a public code/token may start a new configuration/order flow but is not the
  internal order authority;
- Order records must reference internal immutable identities directly;
- a private resume capability, if later added, points to mutable Draft state,
  not to an Order;
- code possession alone may not grant access to Order status or private fit
  data;
- token format, prefix, expiry, revocation, account requirements, QR and Tier-C
  image policy require a separate reviewed contract.

No public-share or resume endpoint is source-authorized by this contract.

---

## 12. Current source mapping and protected meanings

| Current carrier | Current authority | Future relationship | First C1 treatment |
|---|---|---|---|
| `WigStyle` | Merchandising/catalog parent | Explicit relation to Technical Model | No semantic mutation |
| `WigVariant` | Finite-SKU commercial identity | Optional explicit bridge | Preserve unchanged |
| `WigStyleMarket` | Market publication | Composes with future orderability | No change |
| `VariantMarketPrice` | Finite variant market price | Not configurable price engine | No change |
| `WigVariant.price` | Dormant legacy KRW field, still admin-writable | Never a configurable price basis | No promotion or reuse |
| `CartItem` | Mutable finite-SKU intent | Later configurable-line design | No change |
| `CheckoutSessionLine` | Frozen finite-SKU commitment line | Later may reference Revision/Build Spec | No dead optional field in C1 |
| `OrderItem` | Historical finite-SKU line snapshot | Later may reference frozen identities | No change in C1 |
| `CheckoutSessionShipping` / `OrderShipping` | Address/input snapshots | Not Shipment, tracking or delivery entities | Preserve unchanged |
| `ManufacturingRequest` | Per-MTO-line downstream status carrier | Later references frozen Build Spec | Never raw configuration owner |
| `Fitting` | Exact-variant fitting result | Later fit/render integration | No change in C1 |
| Product Media legacy keys | Display references only | Later semantic media source | No reuse as product truth |
| D5/D6 fixtures | Source/fixture-only | Later configuration-aware retrieval | Remain unaware |
| Manual item relations | Style-level editorial relations | Later style navigation | Remain unaware |
| Payment/refund | Financial authority | Consume frozen commitment only | Remain unaware in C1 |

### 12.1 Finite-SKU behavior remains authoritative

The following current finite-SKU behavior remains authoritative:

- every current purchasable line references a `WigVariant`;
- same-parent style/variant integrity is enforced at cart/session/payment-contact boundaries and independently reasserted at finalization;
- canonical market publication and purchasability are enforced at cart admission, checkout-session creation and the payment contact boundary; finalization currently reasserts same-parent identity rather than current publication/price;
- checkout money/currency snapshots;
- one blocking payment attempt;
- idempotent finalization;
- late callback/remediation safety;
- no Order or ManufacturingRequest on payment failure.

Current compatibility debts are recorded, not silently normalized:

- `WigVariant.stock` gates admission for both MTO and STOCKED lines but is consumed only for STOCKED lines; it is not a real capacity model;
- STOCKED allocation currently occurs in the completion transaction after irreversible capture; C2 must reconcile this with the selected provider/allocation protocol before claiming pre-capture allocation safety;
- the Product Media live-boundary defect register still lists LBD-06/LBD-07 as open although C0 source implemented their bounded closure; register reconciliation is a separate documentation task.

A later configurable-line contract must extend, not weaken, the verified invariants and must not treat these debts as already solved.

---

## 13. Product Media dependency

This contract satisfies the semantic foundation required by Product Media only
when a later approved/effective Product Specification source can supply:

```text
governed Product Truth Reference;
explicit subject scope and `GLOBAL` market scope for Candidate A;
material-difference declaration;
change-authority record;
propagation decision.
```

Product Media implementation and readiness activation remain independently
blocked by their own source and deployment-qualification gates.

No current media key or image is evidence of a Technical Model or parameter
fact merely because this contract exists.

---

## 14. Measurement-governance dependency

No physical measurement method, numeric product fact, customer fit evidence or
uncertainty semantics is approved by this contract.

Measurement Governance Contract v0.1 retains ownership of measurand families,
measurement-method semantics, units, measurement-result/uncertainty semantics and
method compatibility. This contract does not narrow that ownership. Its current MGP1
product-length gate does not qualify customer head/body fit by implication.

Before authoritative customer fit data is persisted or used for checkout or production:

- a Measurement-Governance-controlled addendum or later contract must define fit measurands, reference points, accepted methods, units, evidence, uncertainty and method compatibility;
- a separate Fit domain contract must define customer record identity, completeness/qualification workflow, owner access, retention, deletion, correction history and the boundary between preview input and order-eligible fit truth.

Other numeric product facts require the measurement/specification authority applicable
to their own stated scope; one gate may not silently authorize an unrelated measurand.

Configuration Revision itself does not own or require body-measurement values. A later
RenderContext, Checkout Commitment or ProductionProjection may reference only qualified
fit data and must preserve the qualification state of that input.

---

## 15. Source-authorization gate for Candidate A

The likely first source slice is:

```text
Technical Model identity/version
+ immutable Configuration Revision
+ one real admin/system creation and read consumer
```

It remains `NOT AUTHORIZED` until every gate below is closed.

### 15.1 Product-truth governance gate

Required:

- named Product Specification steward;
- enforceable approval authority distinct from generic `ADMIN`, with attributable approval and revocation;
- approval/effectivity workflow;
- correction versus Product Change semantics;
- durable truth-reference plan;
- change record and propagation rules.

### 15.2 Launch model qualification gate

A reviewed launch addendum must identify at least one real, evidenced:

- Merch Style scope;
- base/cap architecture;
- implantation regime;
- compatible zone-map semantics;
- Hair Geometry Profile;
- Parameter Schema Version;
- actual allowed values/ranges;
- compatibility constraints;
- evidence owner and evidence location;
- status as orderable, concept-only or not yet commercially classified.

Evidence for base/cap architecture and Implantation Regime must be physical measurement,
supplier attestation or an approved internal design record naming author, date and status.
A model evidenced only by a design record is `CONCEPT_ONLY`; it may not expose
`ORDERABLE_PARAMETER` values or bridge to a commercial `WigVariant`. Undefined placeholder
labels or values do not satisfy this gate.

### 15.3 Real-consumer gate

The first source slice must have a named, non-test consumer that depends on the new
authority for an outcome it could not produce without it. At minimum, bounded
ConfigurationRevision creation must validate exact approved Technical Model, Profile and
Parameter Schema compatibility and fail closed when truth, compatibility or propagation
is absent. A workflow whose only result is reading back the same data it authored does not
satisfy this gate.

Source created only for future callers is dead code and prohibited.

### 15.4 Revision-semantics gate

Required before implementation:

- exact minimum Revision fields;
- canonicalization and equality, including an explicit partition between
  equality-participating governed intent and audit/display-only snapshots;
- idempotency key/semantics;
- lineage;
- ownership/scope;
- payload bounds;
- immutability enforcement;
- retention and historical interpretation;
- error vocabulary;
- unknown/version-incompatible behavior.

### 15.5 Exact source-mapping gate

A source task must map:

- exact Prisma additions;
- exact migration;
- exact source modules;
- exact admin/system entrypoint;
- exact approval-authority representation, distinct from generic `ADMIN`;
- exact authorization;
- exact read path;
- exact transaction boundary;
- exact behavioral tests;
- exact prohibited paths.

### 15.6 Non-activation gate

Candidate A must not implement or activate:

- any customer-facing configurator or Studio route, component, action or API, even when default-off;
- public or private sharing/resume;
- customer Draft persistence;
- fit persistence;
- rendering engine;
- Production Projection / Build Spec;
- checkout or payment integration;
- ManufacturingRequest changes;
- Product Media source;
- D5/D6 production integration;
- shipment;
- live deployment;
- Product Specification approval through generic `ADMIN` status alone;
- changes to frozen D5/D6 vocabularies or Measurement Governance semantics.

### 15.7 Review gate

Required:

- product/UX review;
- independent technical/domain audit;
- documentation installation and reviewed merge;
- separately issued source authorization.

---

## 16. Rejected immediate source candidates

### 16.1 Draft + Revision together

Rejected for the first source slice because it prematurely freezes:

- customer persistence;
- resume and expiry;
- concurrent editing;
- privacy and deletion;
- customer UX;
- fit integration.

### 16.2 Finite-SKU configuration wrapper

Rejected because it would duplicate current checkout/order snapshots and create
a false configuration identity from mutable, unversioned catalog labels.

### 16.3 Raw configuration JSON on ManufacturingRequest

Rejected because ManufacturingRequest is a downstream work carrier, not product
intent or Build Spec authority.

### 16.4 Placeholder render/production/share seams

Rejected. No zero-caller abstraction may be added merely to reserve a future
shape.

---

## 17. Deferred capabilities

Not authorized by this contract:

- Prisma, migration or source implementation;
- customer configurator or Studio activation;
- Configuration Draft persistence;
- customer Configuration Revision persistence;
- public sharing or private resume;
- code/token/QR design;
- Fit Profile source;
- measurement capture;
- renderer implementation;
- RenderWitness persistence;
- Production Projection or Build Spec;
- configurable pricing or lead-time engine;
- capacity allocation;
- ManufacturingRequest workflow;
- shipment/tracking;
- Product Media technical source;
- D5/D6 production adapter;
- image similarity, embeddings or training;
- Eximbay implementation;
- live deployment;
- partial refund.

---

## 18. Recommended sequence

```text
S0  This authority/foundation contract
S0A Launch Technical Model + Parameter Vocabulary qualification addendum
C1  TechnicalModelVersion + immutable ConfigurationRevision
C2  ProductionProjection / BuildSpec + Checkout/Order binding
C3  ManufacturingRequest transition history and admin workflow
C4  Shipment and customer status
C5  Product Media technical source after independent target qualification
```

Parallel/deferred tracks:

```text
Eximbay Gate B research
rendering engine research and asset pipeline
Product Media deployment qualification
D5/D6 production activation
image similarity / embeddings
behaviour-trained item-to-item
live deployment
partial refund
```

C5 may begin before C3/C4 if Product Specification source and Product Media
deployment gates independently close. It does not supply Product Specification
truth to C1.

---

## 19. Documentation-only installation boundary

The canonical contract belongs under `docs/product/` because it establishes Product
Specification authority and descends from the External Product Truth Authority decision.
`docs/discovery/README.md` must link it as a required dependency for configurable-product,
Product Media and discovery vocabulary work.

A later installation PR may change only these reviewed documentation paths:

```text
docs/product/catalog-product-specification-and-configurable-product-foundation-contract-v0.1.md
docs/product/README.md
docs/discovery/README.md
docs/discovery/decision-log.md
docs/discovery/configuration-to-order-bounded-contract-v0.1.md
```

The Configuration-to-Order file change is limited to change-control metadata and a forward
pointer recording the bounded §0.4 amendment. The final reviewed package may narrow other
paths but may not omit that amendment record. No additional path may be added without a
new reviewed installation task.

Prohibited repository paths in the documentation installation task:

```text
prisma/**
src/**
.env*
AGENTS.md
CLAUDE.md
eslint.config.mjs
```

Separately prohibited semantic reinterpretations include treating checkout/order snapshots,
ManufacturingRequest, legacy media keys, current WigVariant labels/price/stock, or D5/D6
fixtures/adapters as configurable-product or Product Specification authority.

Documentation installation grants no source authority.

---

## 20. Closed, provisional and unresolved decisions

### 20.1 Closed by this contract candidate

```text
no known external product-truth authority;
internal Product Specification authority required;
project owner is final decision owner;
Technical Model identity is distinct from WigStyle and WigVariant;
base-specific implantation/projection regimes may require distinct models;
overall length and curl are independent profile-selectable axes for MVP;
ConfigurationRevision owns immutable product intent only;
authoritative fit/measurement data is separate from product-revision identity;
fit may be edited alongside product controls and may immediately influence
rendering through composed RenderContext;
preview defaults are rendering-only and never commercial/production authority;
render and production are sibling derivations;
current finite-SKU source remains unchanged;
sharing, Draft, projection and commerce integration are deferred;
Candidate A requires real governed data and a real consumer.
```

### 20.2 Provisional until launch addendum

```text
first launch Merch Style;
first base/cap architecture;
first implantation regime;
first Hair Geometry Profile;
first Parameter Schema and values;
actual orderable range;
style/model cardinality;
finite-variant bridge semantics;
first admin/system consumer;
truth-reference mechanism;
canonicalization and scope-bounded content identity mechanism.
```

### 20.3 Deferred to later contracts

```text
customer-fit Measurement Governance addendum and Fit-domain source contract;
renderer and asset retention;
public/resume token lifecycle;
optional operator-assisted or scan-derived Fit pathways beyond the required
customer-completable self-service order-qualification route;
price, lead time and capacity;
Build Spec payload;
ManufacturingRequest workflow;
shipment;
Product Media deployment;
customer activation;
reconciliation of the Product Media LBD register entries LBD-06/LBD-07 with C0 source closure.
```

---

## 21. Acceptance matrix

This matrix supplements the normative body. Omission from this matrix never makes a
body clause non-binding, and no matrix row weakens a body clause.

| Claim | Owner | Evidence required before source | Failure disposition |
|---|---|---|---|
| Technical Model identity is real | Product Specification authority | Approved launch model evidence | No source model |
| Base choice selects same/different model correctly | Product + Manufacturing | Implantation/projection comparison | Fail closed / separate model |
| Hair profile is compatible | Product + Render + Manufacturing | Qualified combination evidence | Not selectable |
| Parameter is orderable | Product + Render + Manufacturing + Commerce | Full-path support evidence | Not exposed as orderable |
| Revision is immutable | Source implementation | DB/enforcement and mutation tests | Source not accepted |
| Revision is historically interpretable | Product Specification + Source | Version/reference and retention tests | Activation blocked |
| Fit data is qualified | Measurement governance | Reviewed method/evidence | Preview-only / checkout blocked |
| Render is honest | Presentation/Render | Version/disclosure evidence | No exact-fit claim |
| Build Spec is frozen before irreversible payment | C2 commerce/manufacturing | Concurrency and integrity evidence | Standard MTO blocked |
| Product Media tracks product change | Product Specification + Media | Truth reference and propagation evidence | Media source/enforcement blocked |

---

## 22. Change control

### 22.1 Amendments

Any amendment must state:

- exact prior text;
- exact new text;
- reason and evidence;
- accepting authority;
- impact on source, existing Revisions, Product Media, commerce and
  manufacturing;
- whether the change is correction, Product Change, policy change or
  presentation change.

### 22.2 Source does not silently redefine this contract

A convenient schema or implementation pattern may not silently redefine domain
meaning.

If implementation evidence contradicts this contract, stop and adjudicate the
contract/source boundary before proceeding.

### 22.3 Historical preservation

Superseded Technical Model Versions, Parameter Schemas and Configuration
Revisions remain historically interpretable for as long as dependent orders,
media evidence, legal retention or customer records require them.

### 22.4 Reopen conditions

Reopen the external-authority decision when a real PIM, ERP, supplier master or
governed manufacturing master with approval/version authority is identified.

Reopen profile/parameter classification when rendering, production or commerce
evidence changes the supported product space.

---

## Appendix A — Candidate A source forecast, not authorization

The likely later source slice may add semantic equivalents of:

```text
TechnicalModel / TechnicalModelVersion
ConfigurationRevision
explicit relation to WigStyle
admin/system Product Specification service
ConfigurationRevision creation that consumes and enforces approved compatibility
immutability and canonicalization enforcement
```

It should not add in the same first slice:

```text
ConfigurationDraft
FitProfile
RenderProjection
ProductionProjection
BuildSpec
public code
resume code
cart/checkout configurable line
ManufacturingRequest changes
```

Exact schema is intentionally not frozen here.

---

## Appendix B — Reopen and future source-review questions

A later amendment or Candidate A source review should first try to falsify:

1. whether Technical Model identity delivers real value before implementation;
2. whether the Product Specification authority is sufficiently bounded and
   attributable;
3. whether base/cap model selection is still ambiguous;
4. whether Hair Geometry Profile and parameter classifications are evidence-led
   rather than renderer-led;
5. whether Configuration Revision can remain product-intent-only;
6. whether rendering can use fit input without merging authorities;
7. whether current finite-SKU source is preserved without a duplicate truth;
8. whether the Candidate A gate prevents dead code and placeholder models;
9. whether Product Media receives the truth-reference/change semantics it
   requires;
10. whether any clause accidentally authorizes source, customer behavior,
    commerce, manufacturing, sharing or deployment.

---

## Verdict

```text
CATALOG PRODUCT SPECIFICATION & CONFIGURABLE PRODUCT FOUNDATION:
  FROZEN v0.1 — EFFECTIVE UPON REVIEWED MERGE

CURRENT SOURCE AUTHORITY:
  UNCHANGED

CANDIDATE A SOURCE IMPLEMENTATION:
  BLOCKED ON REVIEWED CONTRACT + LAUNCH ADDENDUM + EXACT SOURCE AUTHORIZATION

CUSTOMER / COMMERCE / MANUFACTURING / SHARING ACTIVATION:
  NOT AUTHORIZED
```
