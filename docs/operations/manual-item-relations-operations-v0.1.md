# Manual Item Relations Operations v0.1

## Status

```text
FEATURE SOURCE:
  INSTALLED
CUSTOMER ACTIVATION:
  OFF
RUNBOOK MODE:
  DORMANT PRE-LAUNCH PREPARATION
ACTIVATION AUTHORITY:
  NOT GRANTED BY THIS DOCUMENT
PRODUCTION RELATION DATA:
  NONE / NOT SEEDED AT BASELINE
ROLLBACK:
  DOCUMENTED, NOT EXERCISED IN PRODUCTION
CHANGE CONTROL:
  supersedes: none | superseded-by: none
```

## 1. Audience, authority, and references

This runbook is for catalog administrators, product and merchandising
operators, reviewers, release operators, and incident responders.

It explains how the installed feature is prepared and diagnosed. It grants no
customer activation, unsupported product claim, automatic recommendation,
relation seed, deployment, or production authority.

- Design authority:
  [Manual Item Relations Contract v0.1](../discovery/manual-item-relations-contract-v0.1.md)
- Parent authority:
  [Item-to-Item Rollout Contract v0.2](../discovery/item-to-item-rollout-contract-v0.2.md)
- Installed source truth:
  [Manual Item Relations Source Status v0.1](../discovery/manual-item-relations-source-status-v0.1.md)

Any future customer exposure requires a separate dated activation record.

## 2. Purpose semantics

### `SIMILAR_STYLE`

A manually reviewed stylistic resemblance only. A rationale may discuss
silhouette, length impression, texture, fringe, part, fullness, color family,
or why the pair is stylistically useful.

It does not assert material, construction, durability, medical suitability,
comfort, breathability, fit, commercial substitutability, shipping, or
orderability.

### `COMPARE_WITH`

An editorially useful comparison without equivalence. A rationale may explain
the comparison value and the same stylistic dimensions, but must not imply
physical, functional, commercial, or medical equivalence.

Unsupported claims must not be entered as rationale or presented as customer
copy. Product truth remains with its owning catalog, evidence, commerce, or
policy authority.

## 3. Dormant administrator workflow

1. Review the source and target styles and their intended purpose.
2. Open `/admin/styles/{sourceStyleId}`.
3. In **수동 스타일 관계 (KR)**, create an inactive KR draft.
4. Select the exact target, purpose, priority, and internal rationale.
5. Review the target diagnostics for global activity, KR publication, and a
   same active variant with a KR market price.
6. Save any bounded purpose, priority, or rationale edits.
7. Activate the relation row only after its row-eligibility checks pass.
8. Keep both customer feature gates blank until a separately authorized
   activation decision.

`row.isActive` means the row is eligible for a future public read. The
environment purpose gate is separate customer-exposure authority. Both must be
true for a customer to see the relation.

## 4. Row activation checklist

Before activating a row, confirm:

- source and target canonical styles exist and differ;
- both styles are globally active;
- both styles are active/published in KR;
- one same target variant is active and has a KR `VariantMarketPrice`;
- the rationale is nonblank after Unicode trimming, contains no forbidden
  control character, and is at most 500 Unicode code points;
- purpose is exactly `SIMILAR_STYLE` or `COMPARE_WITH`;
- priority is a safe integer from 0 through 10000;
- there is no duplicate directed source/target/KR tuple;
- the customer card would land on the exact target style PDP.

Stock zero does not invalidate the stylistic/editorial relation. It also does
not establish availability, orderability, shipping, or commercial
substitutability.

## 5. Diagnostics and troubleshooting

Correct the owning input or catalog state and retry. Do not bypass validation,
edit the database manually, or coerce rejected values.

| Code | Operator action |
| --- | --- |
| `RELATION_DUPLICATE` | Open the existing directed tuple and edit it; do not create a second row for another purpose. |
| `SELF_RELATION` | Select a different canonical target style. |
| `INVALID_RELATION_PURPOSE` | Select exactly `SIMILAR_STYLE` or `COMPARE_WITH`. |
| `INVALID_PRIORITY` | Enter a whole number from 0 through 10000. |
| `INVALID_ACTIVE_STATE` | Use the supported Activate/Deactivate control; do not send text or numeric substitutes for a boolean. |
| `RATIONALE_REQUIRED` | Add an evidence-bounded internal rationale before activation. |
| `RATIONALE_TOO_LONG` | Shorten the normalized rationale to at most 500 Unicode code points. |
| `RATIONALE_INVALID` | Remove forbidden control characters and unsupported content. |
| `SOURCE_STYLE_NOT_FOUND` | Verify the canonical source ID and catalog ownership; do not substitute another style silently. |
| `TARGET_STYLE_NOT_FOUND` | Verify the canonical target ID and catalog ownership; do not substitute another style silently. |
| `MARKET_NOT_FOUND` | Use an existing governed market; this runbook's admin workflow is KR-first. |
| `SOURCE_NOT_PUBLISHED` | Repair or approve the source's global activity and KR publication through the catalog workflow before retrying. |
| `TARGET_NOT_PUBLISHED` | Repair or approve the target's global activity and KR publication through the catalog workflow before retrying. |
| `TARGET_NO_ACTIVE_PRICED_VARIANT` | Through the catalog workflow, confirm one same target variant is active and carries a KR market price. Separate witnesses do not qualify. |

If a catalog state is intentionally inactive or unpublished, leave the
relation inactive rather than manufacturing eligibility.

## 6. Dormant customer gates

The only keys are:

```text
MANUAL_ITEM_RELATIONS_KR_SIMILAR_STYLE_ENABLED
MANUAL_ITEM_RELATIONS_KR_COMPARE_WITH_ENABLED
```

For each key:

```text
unset/blank -> disabled
exact ENABLED -> enabled
other nonblank -> invalid configuration; customer page fails closed
```

These keys are KR- and purpose-specific. They do not create relation data or
activate a non-KR market. Do not set or recommend setting either key under
this runbook.

## 7. Future pre-activation checklist

A later, separately authorized activation review must confirm:

- at least three real launch styles;
- curated relations independently reviewed against their purpose;
- valid source/target publication and same-active-priced-variant evidence;
- purpose labels and customer copy reviewed for unsupported claims;
- exact target-style landing verified;
- empty groups hide and are not padded;
- staging or equivalent behavior reviewed for eligible and ineligible PDPs;
- a named rollback owner; and
- a separate activation record containing market, purpose, catalog scope,
  date, owner, and reviewed source SHA.

## 8. Future activation sequence

This sequence is documentation, not authorization:

1. Create a separate activation decision and PR.
2. Verify the reviewed source and migration are deployed.
3. Verify the real relation rows and their independent review evidence.
4. Prefer one approved purpose first when practical.
5. Deploy the separately approved gate value.
6. Verify eligible and ineligible PDP behavior and exact landings.
7. Verify no non-KR exposure.
8. Record the outcome and evidence.
9. Enable another purpose only through a separate recorded decision.

No event, experiment, canary, or observation system is claimed to exist for
this feature.

## 9. Rollback

- **Purpose-level:** blank or remove the corresponding environment gate through
  the established deployment process.
- **Relation-level:** deactivate the relation row in the admin surface.
- **Catalog-level:** repair or hide invalid publication or price evidence
  through the owning catalog workflow.

After rollback:

- verify the affected customer module or purpose is absent;
- verify there is no non-KR exposure;
- confirm admin records and rationale remain preserved; and
- record the incident or decision, owner, scope, date, and reviewed SHA.

Do not hard-delete relation rows as rollback. This rollback has not been
exercised in production.
