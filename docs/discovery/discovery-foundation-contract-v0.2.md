# WIG-COM-DSC-R4 — Discovery Foundation Contract v0.2

## Status

```text
DESIGN:                 FROZEN (v0.2 invariants and scope)
SOURCE IMPLEMENTATION:  AUTHORIZED only when a task explicitly authorizes a module named in §3
PRODUCTION ACTIVATION:  GATED by §7 and the relevant downstream owner
CHANGE CONTROL:         supersedes: pre-integration draft v0.1 | superseded-by: none
```

Being named in §3 is a scope boundary, not a standing work order.

Changes require a new versioned file, a decision-log entry, and a README pointer update. Frozen files are not edited in place after repository integration.

## Scope

This contract owns:

- discovery request and response foundations;
- normalization and parser mechanics;
- discovery constraint-policy integration;
- retriever and item-to-item interfaces;
- discovery result/explanation contracts;
- test-only baseline sequencing;
- discovery event-schema boundaries;
- visual-track separation inside discovery.

It does not own product claims, catalog truth, commerce eligibility, cart/checkout/payment, fitting, rendering, manufacturing, legal/privacy approval, or production-launch approval.

## 1. Objective

Build durable discovery foundations before representative catalog data and user behavior exist, without allowing demo fixtures or unverified product claims to become production authority.

Separate:

```text
query understanding
constraint policy
catalog truth
candidate sources
candidate admission
purpose-specific ranking
result presentation
behavior learning
commerce eligibility
```

## 2. Fixed boundaries

### 2.1 Context axes are distinct

- `market` controls commercial/publication context.
- `locale` controls presentation.
- `queryLanguage` selects interpretation resources.
- `audience` is an extensible Stage-0 namespace whose current values are product-governed.
- Query text never switches audience.

### 2.2 Discovery is not commerce authority

Discovery may consume versioned eligibility summaries but does not own publication, shipping, price, stock/capacity, checkout admission, payment, finalization, fulfillment, or durable suppression.

### 2.3 Product/style and variant are distinct

An option-specific discovery result must preserve:

```text
matched variant
displayed attributes
displayed price basis
result-card state
PDP landing state
fallback reason
```

A card may not display one variant and silently land on another.

Contract and tests may be built now. Route/cart implementation waits for the owning sellability/write-admission decision unless a read-only route is proven unable to feed an incoherent cart pair.

### 2.4 Demo data is test-only

The dated B0 evidence found a 10-style/108-variant seed/demo population. It may test determinism, types, reasons, boundary enforcement, UI states, and replay. It may not establish claim truth, catalog coverage, relevance, vendor quality, visual readiness, market demand, or production recommendation quality.

## 3. Source modules a task may explicitly authorize

### 3.1 Buildable foundations

- canonical request/response types;
- Unicode, punctuation, code, numeric, and unit normalization;
- multilingual span ownership and provenance mechanics;
- versioned lexicon file format;
- ontology type framework;
- contradiction and unsupported-concept detection;
- pure, inspectable constraint decision rules;
- deterministic fixture retriever isolated from production routes;
- exact and governed structured relational retrieval;
- guided-finder state limited to intent, product category, measurement, consultation, and navigation;
- variant-landing contracts and failing/passing source tests;
- item-to-item and deterministic-similarity interfaces;
- exposure-event schema and default-off emit seam;
- offline evaluation harnesses.

### 3.2 Design now, build later

- production lexicon content and confidence calibration;
- final ontology assignments for missing/unverified attributes;
- free-text multilingual lexical production retrieval;
- manual-relation persistence schema;
- behavior-reranker interface after candidate-admission invariants are represented;
- semantic and visual retriever details;
- production related-items UI.

### 3.3 Constraint decision engine

May be implemented only as pure, versioned logic under an explicitly authorized task and the current constraint-hardness contract.

Query interpretation and product evidence remain independent inputs. No weighted policy score may trade claim risk against recall.

### 3.4 Retriever abstraction

Candidate sources are replaceable. A future source may be manual, same-style, structured content, image, semantic, behavior, or editorial.

The frozen invariant is not the source. Every source must enter one mandatory candidate-admission choke point before ranking or exposure.

### 3.5 Guided finder

May operate without representative catalog data only when it returns intent state, product category, required measurement, required consultation, next route, or explicitly test-only results. It may not invent an offer.

## 4. Result and explanation contract

Every result, relation, or empty state must be able to expose stable reasons for:

- identity match/miss;
- matched concepts;
- asserted constraints and soft preferences;
- unsupported concepts and contradictions;
- disclosed relaxation;
- evidence-unknown and evidence-conflict states;
- education/consultation route;
- candidate source and admission decision;
- relation purpose and assertion class;
- variant landing or fallback.

## 5. Versioning and freeze point

Version at minimum:

- request schema;
- parser;
- lexicon;
- ontology;
- constraint rules;
- candidate source/recipe;
- candidate-admission rules;
- ranker;
- item-to-item purpose vocabulary;
- event schema;
- fixture/catalog snapshot;
- evaluation set.

D4 produces provisional types, reasons, and module boundaries.

Freeze v0.1 serialized types/reasons/module boundaries at the end of the first source-only D5 slice, after the truth table and golden cases run at least once.

Event names freeze on first emission and are additive/deprecating thereafter, never renamed in place.

## 6. Failure rules

No failure may silently:

- switch audience;
- widen a never-relax constraint;
- treat unknown evidence as confirmed;
- use inferred claim facts as truth;
- bypass candidate admission;
- expose a relation whose assertion lacks a governed basis;
- show or cart a different variant as though selected;
- invent commerce facts;
- expose a demo asset as a sellable product;
- preserve stale async results after a newer request wins.

## 7. Sequence and gates

### D4 — provisional owner/module contract

- integrate current docs and agent pointers;
- inspect current source ownership;
- propose types, reasons, scopes, and tests;
- do not freeze serialized vocabulary yet;
- no production behavior change.

### D5 — source-only parser/decision slice

- normalization and span mechanics;
- typed parser;
- contradictions/unsupported concepts;
- pure decision rules;
- golden/truth-table tests;
- freeze first serialized v0.1 types/reasons at slice end if tests pass.

### D6 — deterministic retrieval vertical slice

- fixture retriever plus exact/governed structured paths;
- result reasons and disclosures;
- variant-landing contract tests;
- default-off event emit seam;
- no learned ranking or production recommendation.

### Later independent gates

- representative catalog and governed structured attributes for content similarity;
- image roles, ownership, rights, and confound tests for image arms;
- reliable exposure records, retained baseline, and rollback for behavior reranking;
- privacy/product approval for health-adjacent event collection;
- sellability/variant integrity for any production item-to-item surface.

## 8. Explicit exclusions

- strand-level rendering;
- generic product preview and customer-photo fitting;
- manufacturing resolver;
- product/legal claim decisions;
- production catalog redesign;
- sellability implementation;
- model/vendor selection;
- production recommendation activation.
