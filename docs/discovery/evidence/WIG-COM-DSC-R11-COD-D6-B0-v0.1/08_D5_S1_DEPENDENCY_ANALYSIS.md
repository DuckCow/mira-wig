# D5-S1 dependency analysis

## Falsification question

Could a useful D6-B1 fixture slice safely proceed without a separate D5
structured-constraint policy extension?

## Attempts

### Use current `CATEGORICAL` and `CONTINUOUS` shapes directly

Rejected. The shapes exist, but `validateQueryConstraint` explicitly rejects
both at query level (`src/lib/discovery/decide-constraint.ts:632-650`).
Retrieval cannot know whether a parsed categorical constraint is required,
preference-only, route-only, clarification-required, or unsupported.

### Decide only at fixture-product level

Rejected. `validateFixtureProductConstraint` routes every categorical
constraint through `validateClaimBearingMaterialConstraint`, requiring
`CLAIM_BEARING` plus `CLAIM_BEARING_MATERIAL`
(`src/lib/discovery/decide-constraint.ts:665-678,715-735`). The desired
non-claim `STYLISTIC` color/texture decision is deliberately tested as invalid
(`src/lib/discovery/__tests__/decide-constraint.test.ts:445-514`).

### Treat every declared categorical as hard

Rejected. That would invent hardness from interpretation state and attribute
name inside D6, violating the constraint-policy ownership contract. It also
pre-decides clarification, unknown evidence, relaxation, and zero-result
behavior.

### Treat every structured constraint as a preference

Rejected. That can return violating candidates as asserted results and cannot
honor user-required constraints. It collapses gate and partition semantics.

### Retrieve without `decideConstraint`, exposing only raw partitions

Rejected. This is a test harness for source enumeration, not the governed
vertical slice: it omits the mandatory policy decision needed before an
asserted result. It is less useful than D5-S1 because no D6-B1 acceptance
behavior can be reviewed or frozen.

### Narrower safe source experiment

A fixture-only candidate enumerator could be built without policy, but it
would have no admission/assertion contract and would duplicate work that D6-B1
must discard or reinterpret. The present task does not authorize it, and it is
not more valuable than installing D5-S1 first.

## Conclusion

The D5-S1 dependency is confirmed and material. Bypassing it requires D6 to
become a competing policy owner or to emit results with no governed assertion
meaning. The smallest safe sequence is:

1. D5-S1 query policy disposition and non-claim stylistic product evidence;
2. D5-S1 versioned vocabulary/change-control review;
3. D6-B1 fixture retrieval consuming those decisions.

No current D5 claim-bearing or sensitive-use rule should be weakened.

## Supplied ruling dispositions

| ID | Disposition | Precision note |
| --- | --- | --- |
| B0-R01 | CONFIRMED | D6-B remains governed structured relational retrieval only. |
| B0-R02 | CONFIRMED | Variant plus explicit canonical style is required; no default variant exists. |
| B0-R03 | REFINED | Audience is a frozen caller context; publication/shipping/sellability/orderability are external universe or eligibility authorities, but current read paths do not yet consolidate them into one source. |
| B0-R04 | CONFIRMED | Populated schema fields are repository facts, not governed attribute/commerce authority. |
| B0-R05 | CONFIRMED | One mandatory admission choke point is consistent with foundation and D6-A boundaries. |
| B0-R06 | CONFIRMED | Retrieval cannot infer hardness or policy effect. |
| B0-R07 | CONFIRMED | Current D5 decisions already preserve independent dimensions and partitions. |
| B0-R08 | CONFIRMED | D6-A rejects additional constraints; mixed composition is a separate change. |
| B0-R09 | CONFIRMED | Fixture-only deterministic isolation is the smallest safe first slice. |
| B0-R10 | REFINED | Color/texture families are useful provisional first concepts only after governed fixture mappings; they are not current DB aliases or final ontology labels. |
| B0-R11 | CONFIRMED | Current length strings are not numeric measurement evidence. |
| B0-R12 | CONFIRMED | These claims/outcomes lack current evidence and authority. |
| B0-R13 | CONFIRMED | Category/tags are overloaded and cannot substantiate assertions. |
| B0-R14 | CONFIRMED | D6-B1 has no ranker or automatic relaxation. |

All six supplied current-repository findings B0-F01 through B0-F06 are
`CONFIRMED`. F02 is limited to the committed seed rather than the database
population. F03 is confirmed from current schema/seed/source, not by assuming
the older database census is current. No ruling or finding is `REJECTED` or
`UNRESOLVED`.
