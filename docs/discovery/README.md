# Discovery, Search and Recommendation

## Status

This directory is the canonical entry point for Mira work involving:

- catalog discovery;
- multilingual search;
- query interpretation;
- structured constraints;
- guided discovery;
- item-to-item relations;
- recommendation;
- catalog image similarity and visual search;
- result-card and variant landing;
- discovery analytics and evaluation.

Read this index, the task-relevant contract, and the current evidence-status summary before changing related source, schema, events, UI, fixtures, or catalog behavior.

## Authority

Two different questions have different authorities.

### Descriptive authority — “What does the system do today?”

1. current repository schema and production source;
2. dated evidence snapshots under `evidence/`;
3. design reports, model reviews, prototypes, and exploratory notes.

### Normative authority — “What must a change satisfy?”

Each approved or frozen contract governs only the questions listed in its **Scope** section.

- Commerce/sellability contracts own publication, commercial eligibility, price, stock/capacity, shipping, checkout admission, payment, fulfillment, and durable suppression.
- Discovery contracts own query interpretation, discovery constraint policy, candidate retrieval, result presentation, item-to-item relations, and discovery events.
- Product, merchandising, privacy/legal, catalog-governance, fitting, rendering, and manufacturing decisions remain with their declared owners.

Where current source and a normative contract disagree, record a finding. The contract does not lose merely because code has not caught up.

Where two normative contracts claim the same question, stop and create or request a decision record. Do not choose by file age, model agreement, or apparent implementation convenience.

Model agreement is not evidence.

## Current contracts

1. [`discovery-foundation-contract-v0.2.md`](./discovery-foundation-contract-v0.2.md)
   Scope boundaries, work that may be proposed or implemented in source, staged gates, visual-track separation, and D4–D6 sequence.

2. [`d5-source-vocabulary-contract-v0.2.md`](./d5-source-vocabulary-contract-v0.2.md)
   Current D5 source-vocabulary authority. Supersedes v0.1 while inheriting its frozen foundation; freezes the D5-S1 governed categorical profile, query-only `REQUIRE_MATCH`, policy dispositions, final durable reasons, and `d5-constraint-decisions/v0.2`; keeps the categorical fixture carrier and request/golden schemas provisional.

3. [`d6-exact-vertical-slice-contract-v0.1.md`](./d6-exact-vertical-slice-contract-v0.1.md)
   Freezes the exact-SKU source-only D6 slice: variant result identity, injected fixture and eligibility boundaries, one admission choke point, exact landing integrity, and a default-off event seam.

4. [`d6-a1-source-vocabulary-contract-v0.1.md`](./d6-a1-source-vocabulary-contract-v0.1.md)
   Installs the normative D6-A1 exact-SKU source freeze for result, landing, escaping status/reason, component-version, and event-delivery boundaries while fixture inputs and the event name/payload schema remain provisional.

5. [`d6-structured-retrieval-contract-v0.1.md`](./d6-structured-retrieval-contract-v0.1.md)
   Freezes the D6-B governed structured-retrieval design boundary, its variant candidate and admission model, the D5-S1 blocking dependency, and the fixture-only unranked first-slice sequence.

6. [`d6-b1-source-vocabulary-contract-v0.1.md`](./d6-b1-source-vocabulary-contract-v0.1.md)
   Installs the normative D6-B1 governed categorical source freeze for the source-only unranked fixture slice: selective entrypoints, module responsibilities, five final component versions, reviewed output/status/reason vocabulary, UTF-16 technical ordering, one admission choke point, landing integrity, and accountability semantics while fixture inputs, snapshot values, compatibility sentinels, helper exports, and production integration remain provisional.

7. [`d5-s1-categorical-policy-contract-v0.1.md`](./d5-s1-categorical-policy-contract-v0.1.md)
   Freezes the categorical-only D5-S1 design: required query intent remains distinct from evidence-qualified product assertion, policy remains separate from interpretation, and D6-B1 may consume only governed required decisions.

8. [`constraint-hardness-contract-v0.2.md`](./constraint-hardness-contract-v0.2.md)
   Interpretation/evidence separation, authority constraints, filtering, ranking, partitions, relaxation, clarification, education, consultation, and unsupported states.

9. [`item-to-item-rollout-contract-v0.2.md`](./item-to-item-rollout-contract-v0.2.md)
   Purpose-specific relations, cold start, candidate admission, manual/content/image/behavior sources, learning gates, and activation rules.

10. [`testing-events-and-evaluation-contract-v0.2.md`](./testing-events-and-evaluation-contract-v0.2.md)
   Golden cases, event schemas, sensitive-concept handling, exposure attribution, offline/online evaluation, and feedback-loop controls.

11. [`catalog-evidence-status-v0.2.md`](./catalog-evidence-status-v0.2.md)
   Dated repository/catalog evidence baseline, invalidation rules, and current blockers.

12. [`decision-log.md`](./decision-log.md)
   Accepted invariants, pre-integration amendments, deferred decisions, supersession records, and dependencies.

## Required reading by task

Default:

```text
README
+ task-relevant contract
+ catalog-evidence-status summary
```

Read raw CSV/JSON evidence only when asserting current population, field coverage, schema capability, current code behavior, or a specific B0 finding.

## Work classification

Every task must declare one:

```text
SOURCE_ONLY
TEST_ONLY
EVIDENCE_COLLECTION
PRODUCTION_ACTIVATION
```

The lists below are scope boundaries, not standing work orders. A task still requires explicit task-level authorization.

### Source-only or test-only work that a task may authorize

- canonical discovery request/response types;
- market, locale, query-language, and extensible audience-axis types;
- Unicode, punctuation, numeric, code, and unit normalization;
- multilingual span-parser mechanics and provenance retention;
- lexicon format, not production lexicon content;
- ontology type framework, not final catalog-wide assignments;
- contradiction and unsupported-concept detection;
- pure constraint decision rules;
- deterministic fixture retrieval;
- exact and governed structured relational retrieval;
- reason and explanation contracts;
- engine-independent retriever and item-to-item interfaces;
- variant-landing contracts and source-only tests;
- golden/truth-table harnesses;
- discovery event schemas and default-off emit seams;
- guided-finder state that does not invent an offer;
- manual relation interfaces and fixtures, not persistence migrations;
- deterministic similarity interfaces and test-only recipes;
- offline evaluation tooling.

### Production activation remains gated

- claim-bearing filters backed by demo or unevidenced values;
- production multilingual lexical retrieval without local query evidence;
- production related-items modules;
- production content-similarity weights;
- image similarity or visual search without image roles, rights, ownership, and confound tests;
- learned candidate generation or reranking;
- collaborative filtering;
- account or sensitive-session personalization;
- market-specific learned rankers;
- production event collection before privacy/retention approval;
- direct catalog, cart, checkout, payment, or order writes from discovery;
- durable emergency authority invented inside discovery.

## External blockers

- representative catalog evidence;
- structured product provenance and evidence references;
- market-specific claim authority;
- governed ontology assignments and localized terminology;
- explicit image roles, rights, and product/variant ownership;
- exact result-card-to-variant landing;
- sellability/write-admission and cart identity integrity;
- privacy/product decisions for health-adjacent concepts and consultation events.

## Visual tracks

Five distinct tracks. Do not merge them.

```text
strand-level physically grounded rendering   separate deferred 3D track
generic product preview                      catalog/commerce presentation
customer-photo fitting                       private fitting feature; not catalog evidence
catalog image similarity                     discovery candidate-generation arm; gated
visual search                                discovery query-input arm; separately gated
```

No discovery visual capability may read customer-private fitting images.

No catalog image feature may imply material, fit, medical, comfort, safety, or manufacturing equivalence.

## Audience axis

Freeze the axis and its safety rules, not a permanent value enum.

- Audience is a Stage-0 namespace.
- It is never inferred from query text, relaxed, or switched by a failure path.
- Current allowed values are a product decision recorded in `decision-log.md`.

## Agent rule

Before search, discovery, recommendation, item-to-item, visual-search, query-parser, catalog-similarity, or related UI/schema work:

1. read this index;
2. read the relevant current contract;
3. read `catalog-evidence-status-v0.2.md`;
4. read raw evidence only when the task asserts current-state facts;
5. state the task classification;
6. state task-level authorization;
7. stop if the requested production behavior crosses an unresolved gate.
