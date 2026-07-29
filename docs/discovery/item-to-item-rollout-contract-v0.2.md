# WIG-COM-DSC-R4 — Item-to-Item Rollout Contract v0.2

## Status

```text
DESIGN:                 FROZEN (v0.2 invariants and current purpose semantics)
SOURCE IMPLEMENTATION:  AUTHORIZED only by an explicit task for interfaces, fixtures, and test-only deterministic logic
PRODUCTION ACTIVATION:  GATED per relation purpose × product scope
CHANGE CONTROL:         supersedes: pre-integration draft v0.1 | superseded-by: none
```

Purpose labels are versioned and additive. Existing emitted labels are never renamed; deprecate and add.

## Scope

This contract owns item-to-item relation semantics, candidate-source admission, cold-start defaults, behavior-learning boundaries, exposure requirements, and activation gates.

It does not own catalog truth, commercial eligibility, privacy approval, image rights, variant/cart repair, manufacturing relations, or product merchandising decisions.

## 1. Core ruling

Behavior data is not required for the first item-to-item feature.

```text
governed same-style/manual/content sources
→ controlled exposure
→ exposure-aware outcomes
→ behavior reranking
→ later behavior candidate generation or personalization only if separately gated
```

The frozen safety property is not “behavior may only rerank forever.” It is the candidate-admission and assertion-basis contract in §3.

## 2. Relation purposes

One universal similarity score is rejected.

### `SAME_FAMILY_OPTION`

For v0.2 this means **variants/options under one canonical `WigStyle` parent only**.

It does not mean the broad `WigCategory`/merchandising product family. A broader cross-style family relation requires future catalog governance and a new purpose/version decision.

Assertion class: identity/family option.

### `SIMILAR_STYLE`

Visual/stylistic resemblance: silhouette, length, texture, color, fringe, part, fullness.

Assertion class: stylistic resemblance; may degrade to preference.

### `SIMILAR_CONSTRUCTION`

Physical/functional construction resemblance: cap/base, lace extent, attachment, size/fit, governed material facts.

Assertion class: product-fact/functional; governed attributes or evidence are required.

### `COMMERCIAL_ALTERNATIVE`

A currently eligible substitute under commerce authority: market, offer, price, fulfillment, shipping, and other live gates.

Assertion class: commercial substitutability; discovery cannot supply the basis.

### `COMPARE_WITH`

Editorial or behavior-supported relation saying the pair may be useful to compare. It does not assert physical equivalence or substitutability.

Assertion class: non-assertive comparison.

### Reserved name: `MANUFACTURING_NEARBY`

Reserved in prose and absent from the active code enum until a manufacturing contract defines evidence and semantics. Do not route it through construction or commercial-alternative purposes.

## 3. Candidate admission and assertion basis

Every candidate from every source passes one mandatory exclusion-and-evidence choke point before ranking or customer exposure.

Candidate sources may later include:

- same-style;
- manual/editorial;
- structured content;
- governed image;
- semantic;
- behavior;
- other versioned sources.

Each candidate records source and recipe version.

### 3.1 Never-bypass admission rules

No source or ranker may override:

- audience namespace;
- market/commercial eligibility;
- explicit material or certification requirements;
- functional incompatibility;
- conflicting evidence;
- legal/safety authority;
- exact variant identity and landing.

### 3.2 Assertion-basis rule

If a customer-facing relation asserts material, construction, functional compatibility, certification, or commercial substitutability, its positive basis must derive from governed product facts/evidence or the owning commerce authority.

Behavior may rank such a relation. Behavior alone may not establish its asserted product fact.

Behavior may generate explicitly non-assertive relations such as `COMPARE_WITH` after its own gate passes.

The current default is manual/content candidate generation plus behavior reranking. Changing source policy requires a decision record, but does not change the frozen admission/assertion invariants.

## 4. Rollout is a gate matrix, not a mandatory linear phase sequence

### Cold-start floor

- same-style options;
- manual relations;
- category navigation;
- recent-view comparison;
- guided finder;
- consultation.

Do not force-fill a module.

### Independent candidate arms

#### Deterministic content arm

Gate: representative products and governed structured attributes for the selected relation purpose.

#### Governed image arm

Gate: explicit image roles, ownership, rights, product/model/background confound tests, and device checks.

Image similarity and behavior reranking do not depend on each other. Either arm may be omitted.

### Behavior reranking

Gate:

- reliable exposure records;
- deterministic baseline retained as control;
- position/exposure treatment;
- adequate support by market × product scope × relation purpose;
- rollback.

### Later behavior candidate generation

May be considered only after §3 admission and assertion-basis rules are enforceable and versioned.

### Personalization

Requires traffic, privacy policy, evaluation support, and evidence that important alternatives are not hidden.

### Cross-cutting production blocker

Every production arm is blocked on variant-landing integrity and market/sellability gating before ranking.

## 5. Manual relations

Manual relations are first-class concepts, but persistence is not authorized by this contract.

A future persistence design must decide:

- style↔style or variant↔variant;
- directional or symmetric;
- global or market-specific;
- relation purpose and assertion class;
- evidence/author;
- versioning and expiry.

Provisional interface states may include `PIN`, `BLOCK`, `PREFER`, `EXPIRE_AT`, `REASON`, `AUTHOR`, and `VERSION`. Exact serialized labels freeze only after the first source-only slice and migration approval.

Manual relations never bypass candidate admission or commerce authority.

## 6. Production activation gate

Assess per relation purpose × product scope, not by one global catalog count.

A limited module may activate only when:

- real products exist;
- enough useful candidates exist for that purpose/scope;
- required attributes/evidence are populated;
- admission exclusions are enforceable;
- displayed option and PDP landing match;
- commerce gating occurs before ranking;
- reasons are stable and inspectable;
- operators can block/override within approved governance;
- insufficient sets hide rather than pad;
- exposure records are reliable and versioned;
- offline review finds no critical assertion or landing errors.

Product + Merchandising owns each activation decision and records it.

## 7. Behavior and exposure data

Log the exposure, not only the click.

Always attributable:

- source item and variant;
- relation purpose and assertion class;
- candidate-source/recipe and ranker versions;
- displayed set and positions;
- candidate-set fingerprint;
- market, locale, audience;
- eligibility summary/version;
- experiment and event-schema versions;
- bot/internal-traffic flag;
- privacy-approved join key.

A full pre-ranking set may be sampled rather than stored for every exposure. Deterministic reconstruction is acceptable only after catalog/exclusion inputs are versioned and historical reconstruction is tested exact.

Before limited launch also distinguish fulfillment/outcome class, including MTO versus stocked, because cancellation/return semantics differ.

## 8. Feedback-loop controls

Raw clicks are not similarity truth.

Separately measure or control:

- position and exposure;
- price and promotion;
- availability/shipping;
- image quality and model/mannequin identity;
- page context;
- market and product scope;
- relation purpose;
- bot/internal traffic;
- fulfillment class.

Maintain baseline, offline judged pairs, exposure-aware metrics, uncertainty, exploration where appropriate, and rollback.

## 9. Current Mira gate

The dated B0 population is seed/demo and lacks representative attributes, provenance, image roles, and variant landing.

Therefore interfaces, fixtures, event schemas, candidate-admission logic, and test-only deterministic scoring may be authorized by separate tasks. Production item-to-item remains disabled.
