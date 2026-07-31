# Live Media-Adjacent Security and Catalog Defect Register v0.2

## Decision

```text
DISPOSITION:
  OPEN SEPARATE BOUNDED TRACK

RISK ACCEPTANCE:
  NONE

PRODUCT MEDIA SEMANTIC SOURCE AUTHORITY:
  NOT GRANTED
```

These defects exist at the audited baseline and are not silently absorbed into
Product Media Contract implementation.

| ID | Defect | Risk class | Interim owner | Next bounded task |
|---|---|---|---|---|
| LBD-01 | Arbitrary persisted cover key can reach public URL generation | Privacy / integrity | Platform Security | Validate typed catalog storage authority and persisted key boundary |
| LBD-02 | Fitting source key is prefix-checked but not bound to authenticated owner | Private-media authorization | Fitting Security | Owner-bound key verification and object-intent binding |
| LBD-03 | Development mock route accepts arbitrary keys without authentication | Development privacy / test honesty | Platform Security | Mock route auth/namespace/size behavior audit |
| LBD-04 | Catalog upload has no server byte/size/decode verification | Upload security | Catalog Platform | Verified upload boundary; may align later with Product Media foundation |
| LBD-05 | Public cover changes lack a complete invalidation map | Stale/public serving | Catalog Platform | Cache/revalidation authority map and deny-direction proof |
| LBD-06 | Cart accepts style and variant that need not share a parent | Commerce integrity | Commerce | Same-parent DB/service invariant and regression proof |
| LBD-07 | Public surfaces apply inconsistent style-market publication predicates; direct PDP does not require the same publication condition as listing | Catalog integrity / market scoping | Catalog Platform | Publication-predicate parity audit across listing, direct PDP, related-style cards, cart, and checkout |

## Guardrails

```text
No task may use this register to add Product Media schema, assignment semantics,
rights models, readiness, migration, or enforcement without a separate contract.

Any source fix must preserve existing customer/commerce behavior except for the
specific defect and must include rollback and regression evidence.
```

## Exact next planning task

```text
WIG-COM-SEC-R0-GPT-S0-LIVE-MEDIA-BOUNDARY-DEFECT-CONTRACT-v0.2
```

That task should decide whether to split the seven defects by owner or authorize
one coordinated security/catalog source sequence.
