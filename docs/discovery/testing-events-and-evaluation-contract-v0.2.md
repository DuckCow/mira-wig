# WIG-COM-DSC-R4 — Testing, Events and Evaluation Contract v0.2

## Status

```text
DESIGN:                 FROZEN (v0.2 invariants)
SOURCE IMPLEMENTATION:  AUTHORIZED only by an explicit task for test harnesses, schemas, and default-off emit seams
PRODUCTION ACTIVATION:  Event collection and learning are GATED by privacy, retention, launch, and support decisions
CHANGE CONTROL:         supersedes: pre-integration draft v0.1 | superseded-by: none
```

Event names freeze on first emission and are additive/deprecating thereafter.

## Scope

This contract owns discovery test layers, event attribution, learning-loop closure, offline/online evaluation, support/uncertainty rules, and anti-feedback-loop requirements.

It does not grant permission to collect sensitive events, link user identities, retain raw queries, or use commerce outcomes.

## 1. Golden-case layers

Keep separate datasets for:

- query interpretation;
- constraint decisions;
- retrieval behavior;
- variant landing;
- item-to-item relations by purpose and assertion class.

Lexicon/bridge authors must not be the sole relevance judges.

## 2. Event schema

Minimum discovery event names are versioned and provisional until first emission:

- query submitted;
- constraint interpreted/confirmed/removed/unsupported;
- clarification shown/answered;
- results returned;
- zero result;
- constraint relaxed;
- unknown evidence requested;
- result clicked;
- variant landing resolved/mismatched;
- consultation route selected.

Item-to-item:

- candidates generated;
- items exposed;
- item clicked/compared/saved/carted;
- replacement selected;
- module hidden for insufficient candidates.

Exact serialized names freeze only on first emission.

## 3. Sensitivity and privacy

Canonicalization does not desensitize data.

A canonical concept ID inherits the sensitivity band of the concept it names. Medical-, chemotherapy-, oncology-, hair-loss-, consultation-, or other health-adjacent concepts remain health-adjacent when represented as IDs, reason codes, or route types.

Prefer canonical IDs to raw text for minimization and reproducibility, but do not treat that preference as collection permission.

### Default-off rule

Health-adjacent intent fields, consultation-route events, raw queries, account-linked sessions, and person-level cross-market pooling remain collection-default-off.

Enabling any requires named product/privacy/legal approval, purpose, identifier linkage, retention/deletion policy, and decision-log record.

Whether disabled health-adjacent fields may exist in the schema is a privacy/legal decision. Do not hide such concepts inside a generic array.

Never log private customer images, payment data, full addresses, or unnecessary account identifiers.

## 4. Learning-loop closure invariant

No customer-facing discovery or item-to-item surface may launch unless each exposure emits:

1. a stable exposure ID;
2. versions of every component that produced the result;
3. a candidate-set fingerprint;
4. a join key that approved later outcome events can carry.

Also include displayed IDs/positions, market, locale, audience, experiment, event version, and bot/internal-traffic flag.

The deterministic baseline remains runnable on demand as control.

The emit seam may be built default-off before the storage/retention pipeline is approved. Production collection is separately gated.

## 5. Candidate-set accountability

Always store the displayed set and ordered positions plus a candidate-set fingerprint.

Sample full pre-ranking sets for audit/exploration while historical reconstruction is not proven.

Fingerprint-only reconstruction is allowed only if recipe, catalog snapshot, evidence state, and sellability inputs are versioned/addressable and exact reconstruction is continuously tested.

## 6. Version fields

Attribute decisions and exposures to:

- request schema;
- parser;
- lexicon;
- ontology;
- constraint rules;
- candidate source/recipe;
- admission rule;
- ranker;
- relation purpose vocabulary;
- fixture/catalog snapshot;
- eligibility summary;
- experiment;
- event schema.

Before limited item-to-item launch include fulfillment/outcome class, including MTO versus stocked.

## 7. Offline evaluation

Report separately:

- interpretation precision/recall by concept and market×locale;
- contradiction and unsupported detection;
- hard-constraint and candidate-admission violations;
- claim-bearing false positives;
- false zero results;
- disclosure correctness;
- variant-landing fidelity;
- item-to-item pair correctness by purpose/assertion class;
- image/model confounding;
- operator correction burden.

Global averages are descriptive only. Unsupported cells are `UNDETERMINED`, not passing.

## 8. Online evaluation

Online engagement never replaces contract checks.

Measure as approved:

- exposure-normalized click;
- query reformulation and constraint correction;
- clarification completion;
- result-to-PDP and landing mismatch;
- comparison and alternative selection;
- cart/purchase;
- cancellation/return separated by fulfillment class;
- consultation routing;
- comprehension/trust studies for claims and UNKNOWN presentation.

Purchase/return joins, account linkage, consultation signals, and delayed attribution require product/privacy decisions.

## 9. Feedback-loop controls

Clicks may reflect position, price, promotion, image quality, model identity, availability, shipping, page context, market, purpose, and bot traffic.

Behavior may not directly redefine assertion-bearing similarity.

Behavior-based learning requires candidate/exposure accountability, deterministic control, judged pairs, position/exposure treatment or controlled experiments, per-cell support, rollback, and protected admission boundaries.

## 10. Release rule

Aggregate engagement improvement is insufficient.

Promotion requires:

- no authority/admission violation;
- no critical claim-bearing false positive;
- no variant-landing mismatch;
- acceptable worst-cell results or explicit `UNDETERMINED` approval;
- privacy/retention approval for collected fields;
- operator rollback;
- versioned evidence.
