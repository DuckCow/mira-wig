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
- Product and operations adjudication:
  [Manual Item Relations Product and Operations Adjudication v0.1](../product/manual-item-relations-product-ops-adjudication-v0.1.md)
- Dormant activation-record template:
  [Manual Item Relations Activation Record Template v0.1](./manual-item-relations-activation-template-v0.1.md)

Any future customer exposure requires a separate dated activation record.

## 2. Purpose semantics

### Purpose assignment rule

```text
SIMILAR_STYLE:
  same overall visual direction with observable shared style attributes

COMPARE_WITH:
  deliberate editorial comparison where a meaningful contrast helps the
  customer's choice
```

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

### Rationale standard

Before an active real-launch relation is curated, its rationale must use:

```text
[공통] 두 스타일에서 관찰 가능한 공통점 2개 이상
[차이] 핵심 차이 1개 이상
[의도] 고객 탐색에서 이 연결이 하는 역할 1문장
```

Allowed evidence domains:

- silhouette;
- length impression;
- fringe or bangs;
- part;
- texture or curl;
- fullness; and
- representative-image color family, only when the color family is
  consistent.

Forbidden rationale domains:

- hair material;
- cap or base construction;
- attachment;
- durability;
- comfort or breathability;
- medical suitability;
- fit;
- stock, orderability, or shipping;
- commercial substitutability;
- popularity; and
- predicted conversion.

Acceptable Korean examples:

1. `[공통] 두 스타일 모두 턱선 아래 단발 실루엣과 가벼운 C컬 질감이 보인다. [차이] 원본은 시스루 앞머리가 있고 대상은 앞머리가 없다. [의도] 비슷한 단발 방향에서 앞머리 유무를 탐색하도록 연결한다.`
2. `[공통] 두 스타일 모두 어깨에 닿는 길이감과 가운데 가르마가 보인다. [차이] 대상은 옆선의 볼륨이 더 풍성하다. [의도] 같은 길이와 가르마에서 볼륨 차이를 살펴보도록 연결한다.`
3. `[공통] 두 스타일 모두 긴 실루엣과 느슨한 웨이브가 관찰된다. [차이] 원본은 옆 가르마이고 대상은 가운데 가르마다. [의도] 비슷한 긴 웨이브에서 가르마 차이를 탐색하도록 연결한다.`
4. `[공통] 두 스타일 모두 짧은 픽시 실루엣과 정수리의 볼륨감이 보인다. [차이] 앞머리가 흐르는 방향이 서로 다르다. [의도] 짧고 풍성한 방향 안에서 앞머리 연출 차이를 살펴보도록 연결한다.`
5. `[공통] 두 스타일 모두 곧은 질감과 눈썹 부근의 앞머리가 관찰된다. [차이] 원본은 턱선 길이이고 대상은 어깨 길이다. [의도] 앞머리와 직모 느낌을 유지하며 길이 차이를 비교하도록 연결한다.`
6. `[공통] 두 스타일 모두 어깨 아래 실루엣과 굵은 컬이 보인다. [차이] 대상은 하단으로 갈수록 컬이 더 모여 보인다. [의도] 같은 긴 컬 방향에서 컬의 집중도 차이를 비교하도록 연결한다.`

Unacceptable Korean examples:

1. `인모라서 열에 강하고 오래 사용할 수 있는 비슷한 제품이다.` — hair
   material and durability are unsupported rationale domains.
2. `캡이 통기성이 좋고 착용감이 편안해서 서로 대체할 수 있다.` — base
   construction, breathability, comfort, and commercial substitutability are
   outside this relation's authority.
3. `항암 치료 중인 고객에게 잘 맞는 안전한 스타일이다.` — medical
   suitability and fit are forbidden.
4. `재고가 많고 바로 주문할 수 있으며 배송도 빠른 대안이다.` — stock,
   orderability, shipping, and commercial-alternative claims are forbidden.
5. `요즘 가장 인기 있고 전환율이 높을 것으로 예상되어 연결한다.` —
   popularity and predicted conversion are not editorial style evidence.
6. `2026-08-01 비활성화: 가격이 없어 잠시 내림.` — rationale is not an
   activation/deactivation history field and does not satisfy the current
   editorial-justification template.

## 3. Dormant administrator workflow

1. Review the source and target styles and their intended purpose.
2. Open `/admin/styles/{sourceStyleId}`.
3. In **수동 스타일 관계 (KR)**, create an inactive KR draft.
4. Select the exact target, purpose, priority, and internal rationale.
5. Review the target diagnostics for global activity, KR publication, and a
   same active variant with a KR market price.
6. Save any bounded purpose, priority, or rationale edits.
7. Have a named reviewer other than the author review the purpose, rationale,
   representative images, target diagnostics, and exact target landing.
8. Record the reviewer and review date in the future activation record or
   another approved operating record.
9. Activate the relation row only after its row-eligibility and independent
   review checks pass.
10. Keep both customer feature gates blank until a separately authorized
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
- the customer card would land on the exact target style PDP;
- the rationale uses the bounded `[공통]` / `[차이]` / `[의도]` structure and
  only observable allowed evidence domains; and
- a named reviewer other than the author has reviewed the purpose, rationale,
  representative images, target diagnostics, and exact landing.

Stock zero does not invalidate the stylistic/editorial relation. It also does
not establish availability, orderability, shipping, or commercial
substitutability.

Priority values in steps of 10 may be convenient when operators want room for
later insertion. This is not an invariant, validation rule, or activation
requirement.

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

### F-10 source-verified public-read behavior

F-10 requires no source patch. The current public read rechecks eligibility
whenever customer candidates load:

- the source exists, is globally active, and is active in the exact market;
- the target is globally active and active in the exact market; and
- one same target variant is active and carries an exact-market
  `VariantMarketPrice`.

Separate active-variant and priced-variant witnesses do not qualify. An invalid
source hides the whole module, and an invalid target is omitted. This current
read behavior must be reverified against the reviewed source SHA in the future
activation record.

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

### F-09 preactivation dependency

F-09 is not implemented by this documentation task. Before either customer
gate is enabled, a separately authorized source task must add a read-only
indicator to the KR relation-manager administrator surface for each purpose:

```text
SIMILAR_STYLE customer gate:
  OFF / ON / INVALID CONFIGURATION

COMPARE_WITH customer gate:
  OFF / ON / INVALID CONFIGURATION
```

The indicator must not allow gate mutation. Until it is deployed and verified,
customer activation remains blocked.

## 7. Future pre-activation checklist

A later, separately authorized activation review must confirm:

- at least three real launch styles;
- curated relations independently reviewed against their purpose;
- the named reviewer differs from the author and the reviewer/date are
  recorded;
- valid source/target publication and same-active-priced-variant evidence;
- purpose labels and customer copy reviewed for unsupported claims;
- F-09's read-only gate indicator is deployed and verified for both purposes;
- F-10's current-read eligibility is reverified at the reviewed source SHA;
- exact target-style landing verified;
- empty groups hide and are not padded;
- empty and one-card states are reviewed on mobile and desktop;
- staging or equivalent behavior reviewed for eligible and ineligible PDPs;
- a named rollback owner; and
- a separate activation record containing market, purpose, catalog scope,
  date, owner, and reviewed source SHA.

For the first customer activation, only `SIMILAR_STYLE` with the customer label
`비슷한 스타일` may be proposed. The `COMPARE_WITH` gate remains off until a
separate product decision approves a real comparison affordance or
navigation-only copy that does not promise one.

## 8. Future activation sequence

This sequence is documentation, not authorization:

1. Create a separate activation decision and PR.
2. Verify the reviewed source and migration are deployed.
3. Verify F-09's read-only administrator indicator is deployed and correctly
   reports both purpose states.
4. Reverify F-10 current-read eligibility at the reviewed source SHA.
5. Verify the real relation rows and their independent review evidence.
6. For first activation, deploy only the separately approved
   `SIMILAR_STYLE` gate value and keep `COMPARE_WITH` off.
7. Verify eligible and ineligible PDP behavior, empty and one-card states,
   mobile and desktop rendering, and exact landings.
8. Verify no non-KR exposure.
9. Record the outcome and evidence in the completed activation record.
10. Enable another purpose only through a separate recorded decision.

No event, experiment, canary, or observation system is claimed to exist for
this feature.

## 9. Event-triggered maintenance

Review active real-launch relations:

- before customer activation;
- when a source or target is retired or unpublished;
- when target pricing or publication eligibility changes;
- when representative imagery or the style changes materially;
- before enabling another purpose; and
- before automatic candidate generation.

A periodic editorial sweep may be recommended after launch, but this runbook
does not freeze a 30-day, monthly, quarterly, style-count, or row-count
threshold. Operational-load thresholds are planning signals only.

Keep `internalRationale` limited to the current editorial justification. Record
dated activation/deactivation history in the activation/operations record or
the normal repository or administrative audit evidence available at the time.
Do not prepend dated history to the rationale.

Do not create an ungoverned rejected-pair spreadsheet as negative training
truth. Automatic candidates require a later versioned contract covering
negative meaning, market, purpose, review time, evidence,
expiry/supersession, export, and label use.

## 10. Rollback

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
