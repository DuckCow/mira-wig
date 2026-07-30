# Measurement Governance Contract v0.1

## Status

```text
DESIGN:                 FROZEN (measurement-governance foundation v0.1)
SOURCE IMPLEMENTATION:  NOT AUTHORIZED
PHYSICAL METHOD:        PROVISIONAL; MGP1 REQUIRED
PRODUCTION ACTIVATION:  NOT AUTHORIZED
CHANGE CONTROL:         supersedes: none | superseded-by: none
SOURCE BASELINE:        main cb11341ca9ed9123c6a92c5eae3e25679da7fe6d
ADJUDICATION:            WIG-COM-DSC-R30-HUM-MG1-ADJUDICATION-v0.1
```

This contract governs the semantic and authority foundation required before
D5-S2 continuous query policy and D6-B2 numeric length fixture retrieval.

It does not certify, validate, or activate a finished-wig measurement method.
The exact physical method remains provisional until MGP1 provides physical
repeatability and customer-meaning evidence and a later versioned contract or
method addendum freezes the selected parameters.

## 1. Scope and non-authority

This contract governs:

- separation of measurement, evidence, uncertainty, tolerance, retrieval, and
  display concepts;
- ownership of those decisions;
- the first governed length measurand family;
- exact-variant product ownership and specimen context;
- the standardized straightening-method family;
- the canonical unit family, exact conversion relationships, and numeric
  representation;
- the evidence floor and uncertainty requirements for a numeric assertion;
- the first query relation and the three-way interval model;
- quarantine of current provisional continuous source;
- the gates that must precede MGP1, UR1, D5-S2, and D6-B2.

This contract does not authorize:

- a source or test change;
- an exact physical zone, root-reference realization, statistic, sample count,
  lot rule, repeat count, tension/force, conditioning procedure, instrument,
  resolution, or uncertainty-estimation procedure;
- final numeric retrieval deltas or a final physical upper bound;
- a production ontology assignment, catalog evidence adapter, schema,
  migration, backfill, route, UI, API, event, ranking, relaxation, commerce
  integration, or production activation;
- MGP1, UR1, D5-S2, D6-B2, or exact-plus-structured composition.

## 2. Normative glossary and prohibited conflations

### Normative glossary

**Measurand**

The specifically defined quantity intended to be measured. A numeric value has
no governed product meaning without its measurand identity.

**Measurement method**

The versioned procedure that realizes a measurand, including reference-point
semantics, specimen state, zone or scope, strand selection, straightening,
operational tension, sampling, repeats, instrument, and environmental or
conditioning requirements where applicable.

**Measurement result**

A measured quantity value together with its uncertainty information and basis,
measurement-method identity, specimen context, and evidence provenance.

**Measured quantity value**

The numerical result attributed to a measurand before its uncertainty is used
for decision-making. It is not, alone, a complete measurement result.

**Measurement uncertainty**

Governed information expressing doubt about the measured quantity value,
including how it was derived and any coverage or confidence semantics claimed.

**Decision interval**

A conservative closed canonical-unit interval derived from a measurement result
for product-decision use. Its derivation and uncertainty basis must be stated.
It is not a retrieval match interval.

**Canonical unit**

The measurement-governance-owned unit used for deterministic comparison. For
the first bounded length family it is the micrometre.

**Unit conversion**

The exact, measurement-governance-owned transformation from an accepted source
unit into the canonical unit. Conversion does not change the measurand or
measurement method.

**Manufacturing/specification tolerance**

A manufacturing-owned acceptance band around a production target or
specification. It does not establish retrieval matching.

**Retrieval match interval**

A D5 constraint-policy-owned interval around an interpreted query target. It is
separately versioned and does not describe measurement uncertainty or
manufacturing acceptance.

**Nominal label**

A vendor, merchandising, or catalog declaration such as `18 inch`. It is not a
method-bound measured observation and may later support only a separately
governed nominal-label relation.

**Display rounding**

Presentation-owned conversion and formatting for customer display. It is
one-way from canonical information and may not feed back into evidence or
matching.

**Product subject**

The exact catalog identity about which a product assertion is made. In the
first family the subject is the exact variant.

**Specimen context**

Evidence context for the measured physical specimen, including zone, selected
strands, sample, repeat, lot, operator, instrument, and related provenance. It
does not replace product-subject identity.

**Zone**

A method-defined physical area or scope from which strands are selected or to
which the measurement result applies. The exact first zone remains
provisional.

**Sample statistic**

The rule that reduces selected strand observations to the reported scalar or
profile, such as median, upper quantile, or maximum. The first statistic remains
provisional.

**Method compatibility**

The governed determination that query policy and product evidence refer to the
same measurand and an allowed measurement method/version relationship. Unit
conversion cannot repair method incompatibility.

### Prohibited conflations

The following non-equivalences are frozen:

```text
measurement uncertainty != retrieval match interval
measurement uncertainty != manufacturing tolerance
retrieval match interval != manufacturing tolerance
nominal label != measured observation
display value != canonical evidence
canonical storage precision != measurement accuracy
texture attribute != measurement state
```

Nominal-label tolerance and display rounding are also separate from
measurement uncertainty, manufacturing tolerance, and retrieval matching.
The word “tolerance” must not be used without naming its governed kind.

## 3. Authority ownership

**Measurement governance** owns:

- measurand families;
- measurement-method semantics;
- unit registry and exact conversion;
- measurement-result and uncertainty semantics;
- method compatibility;
- the semantic requirements for method-bound measurement evidence.

**Product/catalog governance** owns:

- evidence ingestion and provenance;
- product and variant ownership;
- later production storage, coverage, and backfill policy.

**Manufacturing** owns:

- production specifications;
- manufacturing acceptance and specification tolerances.

**D5 constraint-policy** owns:

- query relation;
- retrieval match interval;
- gates, scores, partitions, reasons, and disclosure semantics;
- relaxation authority.

**D6 structured retrieval** owns:

- candidate orchestration;
- preservation and aggregation of D5 decisions;
- its admission boundary.

D6 does not invent a measurement method, evidence authority, query relation,
match interval, or tolerance policy locally.

**Presentation/UI** owns:

- display unit;
- display rounding;
- final customer wording.

**Commerce** owns:

- eligibility and orderability.

No owner may silently take, default, reinterpret, or infer a decision assigned
to another owner.

## 4. First governed measurand family

The first governed measurand family is:

```text
variant-scoped
zone-identified
installed root-to-tip strand-path length
under one versioned standardized straightening method
```

The reference-point family is an installed emergence/root reference to the
physical strand tip along the strand path.

The following are separate measurands and are not interchangeable with this
family:

```text
nominal marketed length
natural-state strand path
standardized apparent vertical drop
multi-zone or distributional length profile
```

MG1 v0.1 does not freeze:

```text
exact zone
exact root-reference realization
exact scalar statistic
sample count
repeat count
lot-sampling rule
exact tension or force-selection rule
```

MGP1 must select and validate those parameters before D5-S2 implementation.

## 5. Product subject and specimen context

The product subject is the exact variant.

Evidence context may include:

```text
zone
selected strands
sample
repeat
lot
operator
instrument
```

These fields describe the specimen and observation. They do not replace,
broaden, or rewrite the exact variant identity.

Style-level measurement reuse is prohibited unless a later versioned contract
establishes physical equivalence between every affected variant.

## 6. Measurement-method family and method compatibility

The first method family is:

```text
dry and conditioned specimen
geometric slack or curl removed by a governed light-tension straightening method
no intentional material fiber elongation
method identity and version required
query and evidence method compatibility required
```

Natural-state and worn/apparent measurements remain different measurands.

MGP1 must select and validate the operational parameters. MG1 v0.1 does not
claim that an exact tension, conditioning procedure, statistic, zone, or
uncertainty procedure is known or physically validated.

Method compatibility requires compatible measurand and method identities.
Equal numbers or convertible units do not establish method compatibility.
Method incompatibility cannot produce an asserted numeric match in the first
slice.

## 7. Canonical unit and exact conversion

The canonical comparison unit for the first bounded length family is the
micrometre, represented as an integer count.

The exact relationships are:

```text
1 inch = 25.4 millimetres exactly
1 centimetre = 10 millimetres exactly
1 millimetre = 1000 micrometres exactly
```

Therefore:

```text
1 inch = 25400 micrometres exactly
1 centimetre = 10000 micrometres exactly
```

The initial accepted source and display unit families are:

```text
inch
centimetre
millimetre
```

Accepted decimal precision must be bounded so conversion to integer
micrometres is exact. Excess precision fails visibly rather than rounding into
canonical evidence. The exact accepted surface forms and precision bound belong
to UR1 source review.

## 8. Canonical numeric representation

Canonical quantities use bounded positive safe-integer micrometres.

Every governed canonical quantity must be:

```text
finite
integer
strictly positive
within a governed physical upper bound
```

The final product-domain upper bound remains provisional pending MGP1 and UR1.

The following inputs must fail visibly:

```text
negative
zero
non-finite
overflow
unsafe integer
excess precision
unsupported unit
implausible value outside the governed bound
```

Canonicalization occurs once at ingress through one measurement-owned
conversion registry. Matching occurs only in canonical integer space. Repeated
round-trip conversion is prohibited.

Display conversion and rounding are one-way and presentation-owned. Display
rounding never feeds evidence or matching. Integer micrometre representation
does not claim micrometre measurement accuracy.

## 9. Measurement result and uncertainty

A measurement result consists of:

```text
measured quantity value
uncertainty information
uncertainty basis
measurement method identity and version
specimen context
evidence provenance
```

A first source representation may expose a conservative closed decision
interval only when the derivation of that interval and any coverage or
confidence semantics are stated.

The exact uncertainty-estimation procedure, coverage semantics, repeated
measurement procedure, and interval derivation remain provisional pending
MGP1.

If uncertainty is unavailable or its basis is ungoverned, the observation
cannot produce an asserted numeric match in the first slice.

Measurement uncertainty never silently widens, supplies, or substitutes for a
retrieval match interval or manufacturing tolerance.

## 10. Evidence authority and nominal labels

No current `ProductEvidenceFixtureState` alone is sufficient to assert a
physical numeric length.

A future provisional method-bound measured-observation carrier must
semantically bind:

```text
exact variant subject
measurand identity
measurement-method identity and version
zone and specimen context
canonical measurement result
uncertainty statement and basis
evidence provenance or reference
```

`VERIFIED_OR_MEASURED` is too broad to establish that authority by itself.
Human curation does not create missing measurement evidence. Vendor
declarations and model inference cannot be converted into method-bound measured
truth.

Nominal labels are separate declaration evidence. They may later support a
separately governed `NOMINAL_LABEL_MATCH` relation, but they cannot be
transformed into measured observations.

## 11. Query relation and unsupported syntax

The first governed query relation is:

```text
APPROXIMATE_TARGET
```

A plain numeric customer query such as `18 inch` is neither exact physical
equality nor nominal-label matching.

The retrieval match interval is D5 policy-owned and versioned separately.
MG1 v0.1 freezes the relation choice, not final numeric lower or upper deltas.

The first D5-S2 slice does not support:

```text
MINIMUM
MAXIMUM
CLOSED_RANGE
OPEN_RANGE
unpreserved explicit comparator forms
unpreserved explicit ranges
explicit approximation forms whose semantics cannot be preserved
```

Unsupported syntax must reject visibly or route to clarification. D5-S2 must
not collapse it to a bare target. Later relation support requires separate
source, behavior, and vocabulary review.

## 12. Retrieval match policy

The first closed approximate interval uses inclusive boundaries and the
following three-way model:

```text
evidence decision interval wholly inside query match interval
  -> ASSERTED

evidence decision interval wholly disjoint from query match interval
  -> VIOLATING

partial overlap, boundary ambiguity, missing or ungoverned uncertainty,
or method incompatibility
  -> UNKNOWN
```

The final asymmetric lower and upper match deltas are provisional. They require
customer-intent evidence or an explicitly bounded provisional fixture policy
under later D5-S2 authorization.

Match interval values and product-decision semantics remain D5-owned and
separately versioned. This contract authorizes no ranking or automatic
relaxation. It does not amend the constraint-hardness contract's ownership of
future ranking or relaxation decisions.

## 13. Texture, construction, and disclosure

Texture is both:

- a product attribute; and
- a possible measurement-method condition.

Those roles must not be conflated. Straight, wavy, curly, coily, heat-set,
natural, wet/dry, stretched, and straightened states require explicit governed
meaning where they affect the method or customer interpretation.

Every assertion-capable customer-facing measurement must disclose
semantically:

```text
measurement-method identity and version
zone or scope
straightened and conditioned state
the fact that natural and worn apparent length varies with texture,
layering, construction, and placement
```

MG1 freezes the required information, not final UI copy.

## 14. Current continuous-source quarantine

The following current representations are provisional, non-authoritative, and
must not be inherited unchanged:

```text
ContinuousConstraint current scalar shape
QueryUnitEntry direct surface binding
MEASURED_QUANTITY current number plus unit shape
ContinuousTolerancePolicyFixture
lowerDelta and upperDelta
same-unit-only current evaluation
WigVariant.length strings
```

`WigVariant.length` remains presentation/demo-only and is not governed measured
evidence.

The following fixture compatibility vocabulary is not promoted:

```text
CONTINUOUS_WITHIN_SYNTHETIC_TOLERANCE
CONTINUOUS_OUTSIDE_SYNTHETIC_TOLERANCE
SYNTHETIC_TOLERANCE_REQUIRED
SYNTHETIC_TOLERANCE_APPLIED
```

It remains historical and provisional until a later D5 source-vocabulary
version replaces or removes it.

Current parser hazards include:

```text
negative sign loss
decimal-comma partial parse
range endpoint collapse
comparator loss
approximation loss
multiple unassociated quantities
unsafe large finite values
```

Current query-level continuous rejection remains in force. This contract does
not authorize a source correction or continuous query decision.

## 15. MGP1 physical method gate

MGP1 must select and provide physical evidence for:

```text
zone
root-reference realization
sample statistic
sample count
repeat count
lot-sampling rule where applicable
conditioning procedure and environment
operational tension or force-selection rule
instrument and resolution
repeatability
cross-texture applicability
uncertainty-estimation basis
```

MGP1 must compare at least:

```text
median
upper quantile
maximum
```

It must reject a statistic or method parameter that is not repeatable or
materially misrepresents the customer-visible length concept.

MGP1 requires a separate task and does not begin under this contract.

## 16. UR1 unit-registry source gate

UR1 must be a separately authorized bounded source-only unit-registry and
exact-conversion slice providing:

```text
recognized unit identities
exact conversion to canonical integer micrometres
decimal precision and physical-bound validation
deterministic serialization
visible failure for unsupported or invalid input
```

UR1 must preserve measurement-governance ownership and must not choose query
relations, retrieval deltas, evidence authority, or production storage.

UR1 requires a separate task and does not begin under this contract.

## 17. D5-S2 gate

D5-S2 implementation cannot begin until:

```text
MG1 v0.1 is merged
MGP1 has selected the exact method parameters and scalar statistic
UR1 source boundary and exact conversion are reviewed
a later MG1 version or method addendum freezes the selected method
```

The first D5-S2 implementation is limited to:

```text
one approved method-bound length dimension
APPROXIMATE_TARGET only
one governed unit registry
method-compatible measured observation
explicit uncertainty
three-way interval adjudication
visible rejection of unsupported relational syntax
no ranking
no automatic relaxation
```

D5-S2 requires separate reconnaissance, source authorization, tests, review,
and vocabulary freeze.

## 18. D6-B2 gate

The first D6-B2 slice remains:

```text
source-only
synthetic fixture only
one method-bound continuous length constraint
exact variant candidate unit
frozen D5-S2 decisions consumed without reinterpretation
one admission choke point
no ranking
no relaxation
no event
no Prisma or catalog adapter
no production activation
```

D6-B1 remains unchanged. D6-B2 requires separate reconnaissance and source
authorization after the D5-S2 dependency is frozen.

## 19. Production/storage deferrals

The following remain explicitly deferred and unauthorized:

```text
Prisma schema and migration
catalog migration or backfill
production ontology IDs
production measurement evidence adapters
production thresholds and catalog-wide coverage
commerce integration
routes, UI, and APIs
events and analytics
ranking and automatic relaxation
exact-plus-structured composition
production activation
```

`WigVariant.length` remains presentation/demo-only and non-authoritative.

## 20. Change control and sequence

The required fork/join sequence is:

```text
MG1 v0.1 documentation-only governance foundation
-> independent post-MG1 gates:
    |- MGP1 physical method-selection and repeatability pilot
    |  -> MG1 v0.2 or method addendum freezing the selected method parameters
    `- UR1 bounded unit-registry and exact-conversion source slice

MGP1 completed
+ reviewed UR1
+ later method freeze merged
-> D5-S2 representation reconnaissance
-> D5-S2 source implementation and vocabulary freeze
-> D6-B2 reconnaissance
-> D6-B2 fixture implementation and freeze
-> later production catalog and storage governance
```

MGP1 and UR1 may be prepared independently after MG1. Neither is a prerequisite
for beginning the other. D5-S2 implementation requires completed MGP1, reviewed
UR1, and the later method freeze.

The currently selected next project task is MGP1. That project-order choice does
not normatively gate UR1 behind MGP1.

Any change to frozen MG1 semantics requires:

1. a new versioned measurement-governance contract;
2. explicit `supersedes` and `superseded-by` metadata;
3. a decision-log entry naming the changed rules and evidence;
4. a README authority-pointer update;
5. separately authorized source compatibility or migration work where
   applicable.

This contract does not redefine frozen D5 or D6 vocabulary. If later
measurement governance requires changing the frozen constraint-hardness
semantics, that change must occur through the constraint-hardness contract's
own versioned change-control process.
