# Manual Item Relations Product and Operations Adjudication v0.1

## Status

```text
REVIEW INPUT:
  WIG-COM-REC-R2-FAB-M2M-S3-POSTMERGE-PRODUCT-OPS-AUDIT REPORT v1

ADJUDICATION:
  WIG-COM-REC-R3-HUM-M2M-S3-ADJUDICATION-v0.1

PRODUCT MODEL:
  KEEP

DORMANT FOUNDATION:
  SAFE TO RETAIN

CUSTOMER ACTIVATION:
  OFF

SOURCE PATCH REQUIRED NOW:
  NO

PATCH REQUIRED BEFORE ACTIVATION:
  F-09 read-only admin customer-gate indicator

COMPARE_WITH FIRST ACTIVATION:
  OFF

CHANGE CONTROL:
  supersedes: none | superseded-by: none
```

## 1. Scope and evidence boundary

This product/operations document adjudicates the post-merge Fable audit of the
installed manual item-relations foundation. It sharpens operator policy and
first-activation readiness without changing the frozen product model.

The governing authorities remain:

- [Item-to-Item Rollout Contract v0.2](../discovery/item-to-item-rollout-contract-v0.2.md)
  for parent purpose, admission, assertion, and production-activation rules;
- [Manual Item Relations Contract v0.1](../discovery/manual-item-relations-contract-v0.1.md)
  for frozen manual-relation design;
- [Manual Item Relations Source Status v0.1](../discovery/manual-item-relations-source-status-v0.1.md)
  for reviewed installed-source truth; and
- [Manual Item Relations Operations v0.1](../operations/manual-item-relations-operations-v0.1.md)
  for dormant operator procedure.

Source claims in §3 were verified directly on repository baseline
`73f040b7cb3ca5f6402a04b058762e3edc268742`. This document does not authorize
source, test, schema, migration, environment-value, relation-data, or customer
activation changes. It does not edit or supersede the design contract or
source-status/as-built record.

## 2. Adopted Fable findings

The whole product model is kept, and the dormant foundation is safe to retain.
The following installed choices remain appropriate:

- directional canonical `WigStyle -> WigStyle` relations;
- explicit market scope, beginning with `KR`;
- one row per directed source/target/market tuple;
- exactly `SIMILAR_STYLE` and `COMPARE_WITH`;
- mandatory bounded rationale for active rows;
- manual editorial priority; and
- separately inspectable, purpose-specific, default-off customer gates.

The administrator experience requires the F-09 patch before customer
activation. The customer surface is kept subject to the purpose-specific first
activation policy in §5. Operations guidance must be in place before real
launch relations are curated and activated.

## 3. Source-verified resolutions: F-10 and tie-break

### F-10 current-read eligibility

F-10 is resolved by the current public read. No read-path source patch is
required.

[`public.ts`](../../src/lib/manual-item-relations/public.ts) rechecks current
eligibility whenever it loads customer candidates. It requires:

```text
source exists
source is globally active
source is active in the exact market

target is globally active
target is active in the exact market

one same target variant:
  is active
  and carries an exact-market VariantMarketPrice
```

Separate active-variant and priced-variant witnesses do not satisfy the query.
An invalid source hides all groups, while an invalid target is omitted.

```text
F-10 DISPOSITION:
  KEEP

F-10 SOURCE PATCH:
  NOT REQUIRED
```

### Deterministic tie-break

The same public read sorts by:

```text
priority ascending
then target style ID by locale-independent UTF-16 code-unit comparison
```

It delegates the second comparison to the source-owned
[`compareUtf16CodeUnits`](../../src/lib/manual-item-relations/validation.ts)
comparator rather than locale-sensitive ordering. Fable's tie-break
uncertainty is therefore closed.

Priority values in steps of 10 are an optional operator convenience that can
leave room for later insertions. This is not an invariant, validation rule, or
activation requirement.

## 4. Rejected or revised recommendations

### Rationale is not history

Do not prepend dated activation or deactivation notes to
`internalRationale`.

```text
rationale owns:
  the current editorial justification

history owns:
  past state and change evidence
```

Until formal history exists, record activation and deactivation evidence in a
dated activation/operations record or in the normal repository or
administrative audit evidence available at that time.

### No ad hoc rejected-pair training log

Do not create an ungoverned rejected-pair spreadsheet as negative training
truth. Absence or rejection today does not establish a permanent `BLOCK`, a
cross-market or cross-purpose judgment, or a judgment that survives product or
image change.

Before automatic candidates, a separate versioned contract must govern
negative-relation meaning, market, purpose, review time, evidence,
expiry/supersession, export, and label use.

### Scale thresholds and implementation shape

Do not turn arbitrary monthly, 30-day, style-count, or row-count thresholds
into normative requirements. Operational-load thresholds remain planning
signals only.

Inbound-relation visibility, relation overviews and filters, broken-eligibility
queues, bulk ordering, formal review state, history/version, source provenance,
negative evidence, and a manual-plus-automatic combination layer are later
re-entry candidates. Inbound visibility and overview work may be read/UI work
over existing data; a database migration is not presumed.

## 5. First-activation product policy

The first separately approved customer activation must enable only:

```text
purpose:
  SIMILAR_STYLE

customer label:
  비슷한 스타일
```

Keep:

```text
COMPARE_WITH customer gate:
  OFF
```

until a separately approved product decision provides either:

- a real side-by-side comparison affordance; or
- customer copy that does not promise a comparison tool.

`함께 살펴보면 좋은 스타일` is candidate future navigation-only copy. It is
not activated or frozen for production by this document.

## 6. Rationale and independent-review standard

An active real-launch relation must use this bounded rationale structure:

```text
[공통] 두 스타일에서 관찰 가능한 공통점 2개 이상
[차이] 핵심 차이 1개 이상
[의도] 고객 탐색에서 이 연결이 하는 역할 1문장
```

Allowed evidence domains are silhouette, length impression, fringe/bangs,
part, texture/curl, fullness, and representative-image color family only when
that color family is consistent.

Forbidden domains are hair material, cap/base construction, attachment,
durability, comfort, breathability, medical suitability, fit,
stock/orderability, shipping, commercial substitutability, popularity, and
predicted conversion.

Purpose assignment follows:

```text
SIMILAR_STYLE:
  same overall visual direction with observable shared style attributes

COMPARE_WITH:
  deliberate editorial comparison where a meaningful contrast helps the
  customer's choice
```

Before row activation for a real launch relation:

1. the author creates or edits the relation and rationale; and
2. a named reviewer other than the author reviews the purpose, rationale,
   representative images, target diagnostics, and exact landing.

The reviewer and review date belong in the future activation record or another
approved operating record. No review-state database field is claimed or
required by this adjudication.

## 7. Maintenance and re-entry gates

The normative minimum is event-triggered review:

- before customer activation;
- when a source or target is retired or unpublished;
- when target pricing or publication eligibility changes;
- when representative imagery or the style changes materially;
- before enabling another purpose; and
- before automatic candidate generation.

A periodic editorial sweep may be recommended after launch, but no arbitrary
cadence or catalog-size threshold is frozen here.

Later source or product work requires separate authorization. Automatic
candidate generation additionally requires governed admission, assertion,
negative-evidence meaning, versioning, evaluation, and activation decisions
under the parent contract.

## 8. Required future activation-readiness source task

F-09 is accepted as an activation-blocking dependency and deferred to a
separately authorized source task. Before either customer gate is enabled, the
KR relation-manager administrator surface must show a read-only state for each
purpose:

```text
SIMILAR_STYLE customer gate:
  OFF / ON / INVALID CONFIGURATION

COMPARE_WITH customer gate:
  OFF / ON / INVALID CONFIGURATION
```

The indicator must use the installed activation semantics, must fail visibly
for invalid configuration, and must not allow gate mutation.

```text
PATCH_BEFORE_ACTIVATION:
  F-09 read-only customer-gate indicator
```

This document neither implements nor authorizes that patch. The future task
must receive its own source authorization, reconnaissance, behavior tests, and
review before customer activation proceeds.

## 9. Media-role planning clearance

Media-role architecture may proceed independently of the manual
item-relations product model. This is planning clearance only.

The dated
[B0 raw image-role evidence](../discovery/evidence/WIG-COM-DSC-R3-COD-B0-v0.1/08_IMAGE_ROLE_COVERAGE.csv)
records the demo cover images as `UNKNOWN_ROLE` and does not establish
image-role, rights, ownership, or visual-search readiness. Accordingly, this
clearance does not authorize media source changes, image similarity, automatic
candidates, customer-private image access, or production activation. Those
capabilities retain their own contracts and gates.

## 10. Change control

This document has no predecessor and supersedes none.

A later product/operations decision that changes first-activation purpose,
customer copy, rationale policy, review ownership, maintenance policy, or the
F-09 dependency must use a versioned successor and record explicit
supersession. Changes to the frozen design contract, source-status truth, or
installed source require their own governing change controls and separately
authorized tasks.
