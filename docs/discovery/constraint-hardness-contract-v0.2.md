# WIG-COM-DSC-R4-CONSTRAINT-HARDNESS-CONTRACT-v0.2

## Status

```text
DESIGN:                 FROZEN (v0.2 invariants)
SOURCE IMPLEMENTATION:  AUTHORIZED only where a current foundation contract and explicit task name the module
PRODUCTION ACTIVATION:  GATED by the evaluation, evidence, claim-authority, and commerce dependencies in this contract
CHANGE CONTROL:         supersedes: pre-integration draft v0.1 | superseded-by: none
```

This document specifies rules; it is not a standing work order. Changes require a new versioned file, decision-log entry, and README pointer update.

## Scope

This contract owns query-constraint interpretation, product-evidence adjudication, gating/scoring/presentation decisions, evidence partitions, relaxation, clarification, education, consultation, and unsupported states.

It does not own catalog truth, market claim approval, production activation, commerce eligibility, event privacy approval, or UI-copy approval.

This contract governs how a global wig-commerce discovery system interprets customer constraints and decides whether they may filter, rank, broaden, ask, educate, consult, or remain unsupported.

It does not choose a search engine, embedding model, recommendation model, or user-interface layout. It does not authorize catalog, cart, checkout, payment, or order writes.

---

## 1. Core ruling

Constraint “hardness” is not a single scalar attached to a query term.

A production decision requires four sequential questions:

1. **Authority universe:** Is the item allowed to participate at all for the active audience, market, destination, and durable legal/safety authority?
2. **Interpretation:** Did the customer actually ask for this concept?
3. **Substantiation:** Does each product have adequate evidence for the relevant fact?
4. **Presentation and relaxation:** How should satisfying, unknown, conflicting, and near-match items be shown or withheld?

A hard filter is therefore not merely confidence about a query. It is a customer-visible assertion about products.

---

## 2. Stage 0 — authority universe

The following are not search constraints and must never enter ranking or relaxation machinery:

- audience namespace;
- market publication;
- destination/shipping eligibility;
- any future durable legal or safety authority.

They define the eligible universe before query interpretation.

Rules:

- Query text must never switch the audience namespace.
- A humanoid query on a human surface may offer an explicit route to the humanoid surface, but must not inject humanoid candidates.
- Market or shipping failures may be disclosed only according to product policy; they may never appear as orderable.
- These rules are never relaxed by zero-result recovery.

---

## 3. Interpretation states

Every interpreted concept has one source state:

### `DECLARED`

The user explicitly selected or confirmed it:

- facet;
- confirmed chip;
- true SKU/product identifier;
- quoted or exact controlled value.

This settles customer intent only.

### `DERIVED`

The system inferred it from:

- deterministic extraction;
- typed lexicon expansion;
- calibrated semantic interpretation;
- visual interpretation.

Derived interpretation may be used only according to the attribute class and confidence/evidence rules below.

### `BRIDGED`

An outcome expression was mapped to candidate structural features:

- “less stuffy”;
- “comfortable for sensitive scalp”;
- “natural-looking part”;
- “easy to wear daily.”

A bridge never has direct filtering or claim authority. It may create visible structural chips, ranking preferences, education, clarification, or consultation.

### `UNRESOLVED`

The query is contradictory, segment ownership is ambiguous, or the concept cannot be instantiated in the active ontology.

It requires clarification or an explicit unsupported-state response.

---

## 4. Product evidence states

Each product value is evaluated separately from query interpretation.

### `VERIFIED_OR_MEASURED`

Internal verification, measurement, or another evidence source approved for the attribute and market.

May gate, rank, and display according to claim policy.

### `APPROVED_VENDOR_ATTESTED`

Supplier declaration from a vendor that satisfies the applicable QC/attestation policy.

May gate only where product/legal policy permits. Attribution may be mandatory, such as “material as declared by supplier.”

### `HUMAN_CURATED_FROM_EVIDENCE`

A human-reviewed value tied to evidence.

May gate, rank, and display according to the evidence and claim class.

### `MODEL_INFERRED`

- Never gates.
- Never becomes a customer-facing product fact.
- For claim-bearing attributes, it has **no production ranking authority**.
- For non-claim stylistic attributes, calibrated inference may provide a bounded ranking signal, but must remain non-authoritative.
- Its preferred use is catalog review and enrichment queues.

### `MISSING`

The system has no adequate product verdict.

It is not equivalent to satisfying or violating.

### `CONFLICTING`

Evidence sources disagree.

The item must not appear in an asserted match set for that attribute. It enters a withheld/escalation state until resolved. This discovery-level withholding does not itself define whether the product remains published or purchasable.

---

## 5. Attribute bands

The active ontology assigns every attribute to one band through governance, not runtime scoring.

### A. Authority

Audience, market, destination, durable legal/safety authority.

Handled only at Stage 0.

### B. Identity

True SKU/product identifiers.

Exact assertion; no automatic substitution. Similar alternatives may appear only below an explicit not-found state.

Vendor color codes and construction codes are not universal product IDs. They require namespace-aware interpretation.

### C. Claim-bearing

Examples:

- human/synthetic/blend material category;
- Remy, virgin, origin, authenticity or grade;
- certified medical status;
- safety, heat, hypoallergenic, or performance claims.

Rules:

- clear customer intent plus evidence-qualified product values are required;
- claim-bearing matches never soften into contradictory product classes merely to fill the page;
- model inference has no production authority;
- market-specific claim authority governs whether the concept is filterable, educational, consultative, or unsupported.

### D. Structural / functional

Examples:

- attachment method;
- cap construction;
- lace-front/full-lace structure;
- cap size;
- fit dimensions;
- fulfillment class;
- lead time.

Explicit or confirmed requirements may gate evidenced items. Derived requirements require adequate interpretation confidence and visible disclosure.

### E. Dimensional

Split into:

- **continuous:** hair length and other measurements that support a documented tolerance band;
- **categorical-looking numeric:** `13x4`, cap-size classes, construction dimensions that are discrete variants.

Continuous dimensions use disclosed tolerance. Categorical values do not receive numeric-neighbour relaxation automatically.

### F. Stylistic

Examples:

- bangs/fringe;
- bob/lob/long silhouette;
- texture/curl;
- color family;
- layer, volume, part, style shape.

Derived interpretations are normally preferences. User-selected facets may gate where product evidence and coverage are adequate.

### G. Outcome intent

Comfort, breathability, naturalness, ease, sensitive-scalp suitability, or similar experiential language.

Outcome intent is not a product attribute and never directly gates products.

---

## 6. Decision precedence

### Step 1 — resolve authority universe

Apply Stage 0 before retrieval/ranking.

### Step 2 — instantiate concepts

- Unsupported ontology concept → disclose limitation; do not silently approximate it.
- Query contradiction or ambiguous segment ownership → ask/confirm.
- Bridge output → maximum authority is visible preference/education; never assertion.

### Step 3 — open or close the interpretation gate

The interpretation gate opens when:

- the user declared the condition; or
- a deterministic or calibrated derived interpretation is sufficiently reliable for its band.

User confirmation closes only this gate.

### Step 4 — evaluate product evidence

Per item:

- evidence-qualified satisfying value;
- evidence-qualified violating value;
- missing;
- conflicting.

The evidence gate is independent of the interpretation gate.

### Step 5 — form result partitions

Logical partitions are mandatory:

- **ASSERTED:** the system can stand behind the match;
- **UNKNOWN:** adequate product evidence is missing;
- **VIOLATING:** known not to satisfy;
- **WITHHELD:** evidence is conflicting or policy requires escalation.

**Important UX ruling:** these logical partitions do not require that every page display a separate UNKNOWN shelf. Customer presentation of UNKNOWN is a surface/product decision and must be validated through comprehension testing. The primary asserted set must never mix unknown or violating items while claiming they satisfy the condition.

Possible presentation policies include:

- asserted set only;
- asserted primary set plus a clearly labelled unknown secondary section;
- asserted set plus a user-invoked “show unconfirmed items” action;
- an unsupported/consultation route when no asserted set exists.

### Step 6 — relax only eligible classes

- one class at a time;
- always disclosed;
- original constraints remain visible and restorable;
- no relaxation where disclosure cannot be rendered in the active customer language;
- confirmed constraints require renewed confirmation before relaxation.

---

## 7. Class-specific contract

### 7.1 Explicit human-hair/material query

- Interpretation: normally `DECLARED` or high-confidence lexical `DERIVED`.
- Primary result: evidence-qualified human-hair items only.
- Synthetic/blend items: never included as satisfying matches.
- Missing material: logically UNKNOWN; customer presentation is a product/UX decision, but never mixed into the asserted set.
- Vendor attestation: usable only after market-specific QC/legal policy approves it, with attribution where required.
- Empty asserted set: explicit unsupported state, optional separately labelled style alternatives, never material substitution.

### 7.2 Remy/virgin/authenticity grade

Stricter evidence than material category. Supplier QC standing or internal verification may be required. If evidence is insufficient, preserve the broader material category and remove the grade assertion.

### 7.3 Medical intent

Separate:

- customer use context;
- product certification or substantiated claim.

Where a market-specific claim authority and qualifying subset exist:

- asserted certified subset;
- certification/authority disclosure;
- education support.

Otherwise:

- no semantic or behavioural boost based on “medical”;
- neutral structural discovery;
- education and/or consultation;
- explicit statement of what cannot be confirmed.

### 7.4 Comfort or breathability outcome

- No direct filter or product claim.
- May create visible, editable structural preferences.
- Structural copy only: describe construction or exposed area, not guaranteed comfort/cooling/sensitivity benefit.
- Actual phrasing requires claims and UX review.

### 7.5 Explicit length

- Continuous dimension with measurement convention.
- Gate over a documented tolerance band.
- Rank by proximity inside the band.
- If expanded, disclose the widened band.
- Never expand to unrestricted length.
- Texture/measurement-method differences must be visible where material.

### 7.6 `13x4` and other categorical numeric structures

Treat as categorical variants, not a numeric tolerance. Relax only by user confirmation.

### 7.7 Attachment or cap construction

- Explicit customer requirement: evidenced assertion.
- Derived interpretation: visible chip and class-appropriate gate/preference based on confidence and evidence.
- Auto-relaxation is not allowed for functional requirements such as glueless/adhesive.

### 7.8 Style, bangs, texture, and color family

- Derived query interpretation: soft preference by default.
- User-selected facet: asserted over evidence-qualified values.
- Low viability may degrade to preference.
- Vendor color codes: exact within a known namespace; cross-vendor family expansion must be separately labelled as an alternative, not merged invisibly.

### 7.9 Audience, market, and shipping

Never query-derived. Never relaxed.

### 7.10 User confirmation

- upgrades `DERIVED` intent to `DECLARED` intent;
- does not change product evidence;
- does not create claim authority;
- makes future relaxation require explicit confirmation.

---

## 8. Zero-result and recovery policy

### Never relax

- audience;
- market publication;
- shipping/orderability authority;
- true identity lookup;
- human-hair/material category into contradictory classes;
- certified/medical claim into uncertified substitutes;
- durable legal/safety authority.

### Route instead

- medical/certification claims without authority;
- safety/performance claims without substantiation;
- exhausted claim-bearing matches.

### Confirmation required

- material grade such as Remy/virgin;
- attachment method;
- cap construction;
- categorical construction dimensions;
- fit/size;
- customer-confirmed price or lead-time limits.

### Disclosed automatic relaxation

- continuous length band;
- texture adjacency;
- stylistic bangs/silhouette;
- curated color-family adjacency;
- non-confirmed lead-time preference.

The ladder is generated only from constraints actually instantiated by the active ontology. Policy fixes the protection tiers; ordering within the permitted automatic tier may use measurable current-market recall gain, but must remain inspectable and testable.

---

## 9. Internationalization rules

- Query language and market are independent.
- Lexicon scope is at least language/locale plus market overlay.
- Claim authority is a function of attribute class and market.
- Mixed script is a routing/segmentation problem, not automatically low confidence.
- Every extracted constraint keeps its source span and lexicon/concept identity.
- Low segment ownership requires clarification.
- Machine translation may propose lexicon entries but cannot create claim authority.
- Constraints persist as canonical ontology IDs across language changes.
- Missing localized disclosure makes the system more conservative; it never silently removes required disclosure.

---

## 10. Evidence and coverage governance

There is no universal coverage percentage that determines hardness.

For every attribute × market, maintain:

- evidence distribution;
- verified/attested/curated/inferred/missing/conflicting counts;
- asserted-set size;
- unknown-set size;
- claim-authority status;
- customer-language disclosure readiness.

Class-specific behavior:

- claim-bearing: thin honest set; no softening into contradictory products;
- structural: evidence-qualified assertion, with optional unknown handling and customer-confirmed relaxation;
- stylistic: may degrade to preference;
- pathological coverage on normally universal facts, such as length, creates a catalog-data incident rather than a permanent search rule.

---

## 11. Evaluation gates before implementation

### 11.1 Independent query truth

Human-authored query constraints must be created without showing annotators the extractor output. Lexicon/bridge authors and relevance judges should be separated where practical.

### 11.2 Catalog truth sample

For claim-bearing facts, sample physical, certification, or internal-QC truth.

The critical measurement is:

`P(product actually satisfies constraint | catalog value is missing)`

This determines whether the logical UNKNOWN partition is necessary, excessive, or small.

### 11.3 Cost-stratified quality

Report separately:

- claim-bearing false positives;
- dimensional near misses;
- true gaps versus interpretation-caused zero results;
- reformulation;
- chip correction;
- medical/consultation routing correctness.

Do not collapse these into one score.

### 11.4 UX comparison

Compare:

- silent soft ranking;
- visible interpreted chips;
- hard filtering;
- clarification;
- education/consultation;
- asserted set with optional/visible unknown handling.

Mandatory measurements:

- interpretation error detection;
- partition/label comprehension;
- task completion;
- trust and willingness to continue;
- mobile and accessibility behavior.

### 11.5 Minimum support

Every market × locale × query-class cell reports uncertainty. Insufficient samples are `UNDETERMINED`, not pass or fail. Absolute should-not-surface tests remain conformance gates.

---

## 12. Product and legal decisions still open

1. Whether approved vendor attestation may support a customer-facing asserted set per market and attribute.
2. Vendor QC-standing criteria.
3. Medical/certification authority per market.
4. Whether Remy/virgin claims are filterable.
5. Publication/purchase handling for conflicting evidence.
6. Whether non-shippable products are visible in a secondary state.
7. Customer presentation of UNKNOWN items.
8. Commercial acceptance of no substitution on exhausted claim-bearing queries.
9. Measurement conventions and tolerance evidence for length.
10. Outcome-bridge wording and legal/claims review.

---

## 13. Implementation constraints

A later implementation must:

- use typed states and precedence, not a weighted policy score;
- keep Stage-0 authority outside ranking/relaxation;
- prevent user confirmation from modifying evidence state;
- prevent model-inferred claim facts from entering production retrieval authority;
- version the ontology band assignment and claim-authority register;
- keep the decision table small enough for human review;
- require a truth-table update whenever a new attribute class or output state is introduced;
- provide a deterministic conservative fallback when provenance or disclosure data is unavailable.

Fallback when the provenance programme is not yet viable:

- deterministic lexical/structured retrieval;
- class-based conservative gating for a very small approved set of attributes;
- soft preferences for stylistic interpretations;
- education/consultation for unsupported claim-bearing intent;
- no production use of inferred claim facts.

---

## 14. Explicit exclusions

This contract does not define:

- a search engine or vendor;
- semantic model activation;
- ranking weights;
- personalization;
- recommendation architecture;
- visual-search pipeline;
- catalog schema migration;
- UI layout;
- payment or sellability implementation;
- hard-stop authority;
- legal conclusions;
- numeric coverage/confidence/sample thresholds.

---

## 15. Next smallest artifacts

1. **Provenance and band register** for active catalog attributes per market.
2. **Catalog truth and missing-value sample plan**, starting with material/authenticity facts.
3. **18-case executable truth table v0.1**, adding the UI presentation variants for UNKNOWN.
4. **Constraint disclosure UX prototype**, including mobile/accessibility testing.
5. **Market claim-authority register** owned outside discovery.
