# Manual Item Relations Activation Record Template v0.1

## Status

```text
TEMPLATE:
  DORMANT

ACTIVATION AUTHORITY:
  NONE UNTIL A COMPLETED, REVIEWED, DATED RECORD IS APPROVED

DEFAULT:
  NOT ACTIVATED
```

A blank, partial, copied, or merely merged template grants no activation
authority. Create a dated activation record from this template only under a
separately authorized review. Do not place secrets, credentials, or unrelated
live environment values in the completed record.

## 1. Record identity and exact scope

| Field | Required value |
| --- | --- |
| Record ID | `[REQUIRED]` |
| Record date | `[YYYY-MM-DD — REQUIRED]` |
| Market | `[REQUIRED; do not infer or globalize]` |
| Catalog/style scope | `[exact source and target style scope — REQUIRED]` |
| Reviewed main SHA | `[full SHA — REQUIRED]` |
| Reviewed source SHA | `[full SHA — REQUIRED]` |
| Deployment/environment | `[exact approved environment — REQUIRED]` |
| Author | `[named person — REQUIRED]` |
| Independent reviewer | `[named person other than author — REQUIRED]` |
| Reviewer date | `[YYYY-MM-DD — REQUIRED]` |

## 2. Purpose and customer-copy approval

Template defaults:

```text
SIMILAR_STYLE:
  candidate for first activation

COMPARE_WITH:
  OFF
```

| Purpose | Approval state | Customer copy | Relation count | Evidence |
| --- | --- | --- | ---: | --- |
| `SIMILAR_STYLE` | `CANDIDATE, NOT APPROVED` | `비슷한 스타일` | `[REQUIRED]` | `[link/reference — REQUIRED]` |
| `COMPARE_WITH` | `OFF` | `N/A unless separately approved` | `[REQUIRED]` | `[link/reference — REQUIRED]` |

Approved purposes:

```text
[REQUIRED — exact list; blank means none]
```

Any departure from `SIMILAR_STYLE`-only first activation requires a separately
approved product decision. The candidate copy for `COMPARE_WITH` is not
production-approved by this template.

## 3. Preactivation dependency evidence

### F-09 read-only customer-gate indicator

The administrator indicator must be deployed and verified before any customer
gate is enabled.

| Purpose | Observed indicator state | Read-only verified | Evidence |
| --- | --- | --- | --- |
| `SIMILAR_STYLE` | `OFF / ON / INVALID CONFIGURATION` | `[YES/NO — REQUIRED]` | `[link/reference — REQUIRED]` |
| `COMPARE_WITH` | `OFF / ON / INVALID CONFIGURATION` | `[YES/NO — REQUIRED]` | `[link/reference — REQUIRED]` |

```text
F-09 GATE INDICATOR DEPLOYED:
  [YES/NO — REQUIRED]

F-09 GATE INDICATOR VERIFIED:
  [YES/NO — REQUIRED]

F-09 GATE MUTATION CAPABILITY:
  ABSENT — indicator must remain read-only
```

### F-10 current-read eligibility

```text
F-10 CURRENT-READ ELIGIBILITY VERIFIED:
  [YES/NO — REQUIRED]

REVIEWED SOURCE SHA:
  [full SHA — REQUIRED]

BEHAVIORAL TEST OR READ EVIDENCE:
  [link/reference — REQUIRED]
```

Verify that the current public read checks source and target global activity,
exact-market publication, and one same active target variant with an
exact-market price. F-10 is not a request to add a new read-path patch.

## 4. Relation, publication, and landing review

### Source and target publication review

```text
SOURCE PUBLICATION REVIEW:
  [PASS/FAIL — REQUIRED]

TARGET PUBLICATION REVIEW:
  [PASS/FAIL — REQUIRED]

EVIDENCE:
  [exact style/market references — REQUIRED]
```

### Same-active-priced-variant review

```text
SAME ACTIVE PRICED TARGET VARIANT REVIEW:
  [PASS/FAIL — REQUIRED]

EVIDENCE:
  [exact target variant and market-price references — REQUIRED]
```

Separate active-variant and priced-variant witnesses do not pass.

### Exact landing checks

| Source style | Purpose | Target style | Expected landing | Observed landing | Result |
| --- | --- | --- | --- | --- | --- |
| `[REQUIRED]` | `[REQUIRED]` | `[REQUIRED]` | `/styles/{targetStyleId}` | `[REQUIRED]` | `[PASS/FAIL]` |

Attach or reference the complete reviewed set. A mismatch must fail the
activation review and must not be repaired by substitution or redirect.

## 5. Customer-render evidence

```text
MOBILE RENDER EVIDENCE:
  [device/viewport and link/reference — REQUIRED]

DESKTOP RENDER EVIDENCE:
  [device/viewport and link/reference — REQUIRED]

EMPTY-STATE EVIDENCE:
  [eligible page with no exposed relations — REQUIRED]

ONE-CARD-STATE EVIDENCE:
  [eligible page with one exposed relation — REQUIRED]

NON-KR ABSENCE EVIDENCE:
  [link/reference — REQUIRED]
```

Confirm that empty groups hide, an entirely empty module is absent, one-card
states render without padding, exact cards land correctly, and no non-KR
exposure appears.

## 6. Gate approval and activation ownership

```text
APPROVED GATE VALUE:
  [REQUIRED; blank means not approved]

APPROVED PURPOSE:
  [REQUIRED; must match §2]

ACTIVATION OWNER:
  [named person — REQUIRED]

ACTIVATION DATE/WINDOW:
  [REQUIRED]

APPROVAL RECORD:
  [link/reference — REQUIRED]
```

Once every required approval is recorded, the approved value authorizes only
the exact market, purpose, environment, catalog scope, deployment, and source
SHA in the completed record. It grants no authority to enable `COMPARE_WITH`
when that purpose remains `OFF`.

## 7. Rollback ownership and procedure

```text
ROLLBACK OWNER:
  [named person — REQUIRED]

ROLLBACK TRIGGER:
  [REQUIRED]

ROLLBACK PROCEDURE:
  1. [remove or blank only the separately approved purpose gate through the
     established deployment process]
  2. [verify the purpose/module is absent]
  3. [verify no non-KR exposure]
  4. [preserve relation rows and rationale]
  5. [record incident/outcome evidence]

ROLLBACK VERIFICATION OWNER:
  [named person — REQUIRED]
```

Do not hard-delete relation rows as rollback.

## 8. Post-activation verification

```text
POST-ACTIVATION VERIFICATION TIME:
  [REQUIRED]

ELIGIBLE PDP RESULT:
  [PASS/FAIL plus evidence — REQUIRED]

INELIGIBLE PDP RESULT:
  [PASS/FAIL plus evidence — REQUIRED]

EXACT LANDING RESULT:
  [PASS/FAIL plus evidence — REQUIRED]

NON-KR EXPOSURE RESULT:
  [PASS/FAIL plus evidence — REQUIRED]

ACTUAL ENABLED PURPOSES:
  [REQUIRED]

INCIDENT/ROLLBACK OUTCOME:
  [NONE or complete dated evidence — REQUIRED]
```

No event, experiment, automated monitor, or observation system is presumed to
exist. Record the actual evidence used.

## 9. Approval and change control

```text
PRODUCT APPROVER:
  [named person and date — REQUIRED]

MERCHANDISING APPROVER:
  [named person and date — REQUIRED]

RELEASE APPROVER:
  [named person and date — REQUIRED]

ACTIVATION DECISION:
  [APPROVED / REJECTED / ROLLED BACK — REQUIRED]

SUPERSEDES:
  [none or exact record ID]

SUPERSEDED-BY:
  [none or exact record ID]
```

Until every required field is completed, independently reviewed, dated, and
approved, the default remains `NOT ACTIVATED`.
