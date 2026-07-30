# Baseline, scope, and authority

## Classification

```text
TASK CLASSIFICATION:    SOURCE_ONLY DOCUMENTATION + READ_ONLY SOURCE EVIDENCE
TASK-LEVEL AUTHORIZATION:
  D5-S1-A0 RECONNAISSANCE AND CONTRACT ONLY
PRODUCTION ACTIVATION:  NOT AUTHORIZED
```

## Observed baseline

```text
repository:       mira
branch:           main
HEAD:             32b8cd7aef2c6f6302ee835e154ec3b6a3b559cb
origin/main:      32b8cd7aef2c6f6302ee835e154ec3b6a3b559cb
observed date:    2026-07-30
initial status:   clean
GitHub auth:      authenticated
```

The package baseline and current local/remote main matched exactly before
reconnaissance.

## Read authority

The reconnaissance read:

- `AGENTS.md`, `CLAUDE.md`, and the collaboration protocol;
- the discovery README and current evidence-status contract;
- the discovery foundation, constraint-hardness, D5 vocabulary, D6 structured
  retrieval, and testing/events contracts;
- the complete D5 production source and test tree;
- the complete frozen D6-A retrieval source and tests;
- the D6-B0 contract, evidence, README pointer, and decision-log entry;
- every supplied D5-S1-A0 package file.

Current source and normative contracts outrank the supplied draft. The human
rulings were tested against both and were not accepted by default.

## Write boundary

The authorized repository change set is exactly:

```text
docs/discovery/d5-s1-categorical-policy-contract-v0.1.md
docs/discovery/evidence/WIG-COM-DSC-R14-COD-D5-S1-A0-v0.1/**
docs/discovery/README.md
docs/discovery/decision-log.md
```

No source, test, existing versioned contract, schema, migration, seed, route,
UI, D6-A, D6-B, adapter, event, or production behavior is authorized.

## Adjudication result

All sixteen supplied rulings were confirmed or refined; none was rejected or
left unresolved. The lead `REQUIRE_MATCH` representation survived adversarial
comparison because it preserves the existing decision shape and keeps query
intent distinct from product evidence. Refinements fixed the exact route
fallback, unsupported partition, policy-fixture validation obligations, and
provisional reason semantics.

No material contradiction or unresolved blocker remained before repository
editing began.
