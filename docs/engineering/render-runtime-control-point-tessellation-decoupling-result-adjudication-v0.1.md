# R2C-A-S2 Control-Point × Longitudinal-Tessellation Decoupling Result Evidence / Independent Adjudication v0.1

## Status

```text
DOCUMENT CLASS:
  RESULT EVIDENCE / INDEPENDENT ADJUDICATION

FEATURE STANDARD CLASSIFICATION:
  MEDIUM

TASK CLASSIFICATION:
  EVIDENCE_COLLECTION

EXPERIMENT CLASSIFICATION:
  BENCHMARK_ONLY

EXPERIMENT:
  R2C-A-S2

PRIMARY S2 EXECUTION:
  COMPLETE

RESULT CUSTODY:
  COMPLETE

CANONICAL VALIDATION:
  PASS

INDEPENDENT RESULT ADJUDICATION:
  COMPLETE

EVIDENCE VALIDITY:
  VALID

FROZEN DISPOSITION:
  UNRESOLVED

NEXT INVESTIGATION CLASS:
  NONE

RENDERER REMEDY:
  NONE

R2C-B AUTHORITY:
  NOT ACTIVATED

CHANGE CONTROL:
  supersedes: none
  superseded-by: none
```

## 1. Purpose and authority boundary

This record installs the durable repository evidence and independent
adjudication for the completed R2C-A-S2 primary Result v1. It binds the local
artifact by canonical filename, byte count and SHA-256 rather than copying the
98,778-byte raw artifact into the repository.

This is an evidence-lifecycle record. It does not amend or reopen the frozen
Design Contract, Source Status / As-Built record, or Result artifact; rerun the
S2 workload; modify source or tests; select a renderer remedy; design or
authorize another renderer experiment; or activate R2C-B, customer, product,
fitting, commerce, order or manufacturing behavior.

The Source Status remains the historical record of source truth at its
installation time. Its statement that primary execution had not yet occurred
is not rewritten to impersonate this later Result truth.

## 2. Governing authority and Result identity

```text
frozen Design Contract:
  docs/engineering/render-runtime-control-point-tessellation-decoupling-design-contract-v0.1.md

Source Status / As-Built:
  docs/engineering/render-runtime-control-point-tessellation-decoupling-source-status-v0.1.md

S1 Result Evidence precedent:
  docs/engineering/render-runtime-point-sensitivity-result-adjudication-v0.1.md
```

The Result identity is exactly:

```text
schema:
  mira.render-lab.r2ca-s2-result

version:
  1

experiment:
  R2C-A-S2

measurementContract:
  r2ca-s2-v0.1

generatorVersion:
  r2ca-s2-synthetic-generator/v1

classification:
  BENCHMARK_ONLY

outcome:
  COMPLETE

stopReason:
  NONE

warnings:
  []
```

## 3. Artifact identity and custody

```text
canonical filename:
  mira-r2ca-s2-v01-2026-08-10T13-36-27.790Z.json

bytes:
  98,778

SHA-256:
  6fb828d1b552cda9713435e7b3d7fcaf8d6abc5d00355b581df25ed7cb2a17a9

original/archive:
  byte-identical

cmp:
  0
```

At evidence-record drafting time, the operator-designated original and
archival copy both existed, each had the recorded byte count and digest, and
`cmp` established byte identity. Their local absolute paths are custody-time
observations only; they are not portable repository authority. The canonical
filename, byte count and SHA-256 above are the durable artifact identity.

The raw Result artifact is intentionally not copied into the repository.

## 4. Canonical artifact validation

Independent custody and canonical-path checks established:

```text
JSON parse:
  PASS

installed Result validator:
  PASS

canonical serializer:
  PASS

canonical bytes:
  98,778

canonical output equals downloaded bytes:
  YES

canonical filename:
  exact match
```

Installed-validator acceptance is one validation layer. It is not the
independent adjudication: the decision-bearing arithmetic was separately
recomputed from raw JSON without importing or invoking the installed S2
analysis or disposition helpers.

## 5. Execution source and environment

### 5.1 Source identity

```text
kind:
  LOCAL_GIT

commit:
  900de0cd8ea0ab0b621bb0142201fbf05b6bd451

branch:
  main

tree:
  CLEAN

Next.js:
  16.2.7

Three.js:
  0.185.1

generator:
  r2ca-s2-synthetic-generator/v1

recipe:
  RADIAL_CROWN_FALL_V1

seed:
  20260808
```

### 5.2 Environment and browser admission

```text
browserEngine:
  CHROMIUM_FAMILY

declared browser product / major:
  CHROME / 151

actual browser product / major:
  CHROME / 151

OS / architecture:
  MACOS / ARM64

device:
  PRIMARY_REFERENCE

power:
  AC_POWER

Low Power Mode:
  OFF

viewport:
  800 × 600

drawing buffer:
  1600 × 1200

device / renderer DPR:
  2 / 2
```

The historical S1 stale-browser-major issue did not recur. S2 admission
matched the declared and actual `CHROME 151` product and major before the
workload began.

## 6. Primary-run uniqueness and workload integrity

```text
primary Start:
  exactly one

primary workload execution:
  exactly one

rerun:
  none
```

The post-`COMPLETE` manual Download click serialized the retained in-memory
Result. It did not rerun the workload, and download retries are not workload
executions.

The frozen execution order was exactly:

```text
1.   576 × P3 × T6
2.  1152 × P8 × T21
3.  1152 × P3 × T21
4.   576 × P8 × T6
5.  1152 × P8 × T6
6.   576 × P3 × T21
7.   576 × P8 × T21
8.  1152 × P3 × T6
```

The completed workload ledger is:

```text
cells:
  8 / 8

warm-ups:
  8 / 8 VALID

measured samples:
  40 / 40 VALID

renderer sample executions:
  48

requested backend:
  AUTO

accepted backend:
  WEBGPU

backend drift:
  none

every cell outcome / stop reason:
  COMPLETE / NONE

every final benchmark-owned resource count:
  0
```

## 7. Independent adjudication method

A standalone standard-library oracle read the raw JSON and independently
recomputed the decision-bearing arithmetic. It did not import or invoke the
installed S2 analysis helper or disposition helper.

The exact verification ledger is:

```text
cells:
  8 / 8

warm-ups:
  8 / 8 valid

measured samples:
  40 / 40 valid

metric summaries:
  104 / 104 independently recomputed and matched

cell median/min/max:
  8 / 8 matched

serialized analysis fields:
  89 / 89 matched

analysis mismatches:
  0
```

No pooling, majority rule, presentation rounding, installed-helper output, or
visually inferred trend replaced the frozen arithmetic.

## 8. Raw `geometryCreateCpuMs` evidence

All five retained values for every cell, in measured execution order, are:

```text
576 × P3 × T6:
  [33, 30.09999990463257, 29.40000009536743,
   29.299999952316284, 32.200000047683716]

1152 × P8 × T21:
  [88.20000004768372, 86, 84.80000019073486,
   86.30000019073486, 120.90000009536743]

1152 × P3 × T21:
  [87.59999990463257, 87.29999995231628, 85.79999995231628,
   86.79999995231628, 87.59999990463257]

576 × P8 × T6:
  [27.899999856948853, 28, 27.200000047683716,
   28.299999952316284, 27.299999952316284]

1152 × P8 × T6:
  [54.69999980926514, 55, 56.200000047683716,
   56.200000047683716, 55.700000047683716]

576 × P3 × T21:
  [44.299999952316284, 81, 43.700000047683716,
   43.59999990463257, 44.59999990463257]

576 × P8 × T21:
  [44.40000009536743, 44.799999952316284, 43.90000009536743,
   43.59999990463257, 42.90000009536743]

1152 × P3 × T6:
  [57.200000047683716, 95, 57.69999980926514,
   55.89999985694885, 56.299999952316284]
```

The retained high observations `81`, `95`, and `120.90000009536743` are not
omitted or characterized as measurement errors.

## 9. Independent 576-strand factorial ledger

```text
Y36  = 30.09999990463257
Y321 = 44.299999952316284
Y86  = 27.899999856948853
Y821 = 43.90000009536743

Point @ T6:
  -2.200000047683716
  range [-5.799999952316284, -1]
  ROBUST_NEGATIVE

Point @ T21:
  -0.39999985694885254
  range [-38.09999990463257, 1.2000000476837158]
  DIRECTION_UNSTABLE

Tess @ P3:
  14.200000047683716
  range [10.599999904632568, 51.700000047683716]
  ROBUST_POSITIVE

Tess @ P8:
  16.00000023841858
  range [14.600000143051147, 17.59999990463257]
  ROBUST_POSITIVE

MP:
  -1.2999999523162842

MT:
  15.100000143051147

I:
  1.8000001907348633

interaction range:
  [-37.09999990463257, 7]

interaction direction:
  DIRECTION_UNSTABLE

G:
  36.549999952316284

MP/G:
  -0.035567714200062515

MT/G:
  0.4131326993912681

I/G:
  0.04924761130186518

point crossover:
  none

tessellation crossover:
  none
```

## 10. Independent 1152-strand factorial ledger

```text
Y36  = 57.200000047683716
Y321 = 87.29999995231628
Y86  = 55.700000047683716
Y821 = 86.30000019073486

Point @ T6:
  -1.5
  range [-40.30000019073486, 0.3000001907348633]
  DIRECTION_UNSTABLE

Point @ T21:
  -0.9999997615814209
  range [-2.799999713897705, 35.10000014305115]
  DIRECTION_UNSTABLE

Tess @ P3:
  30.09999990463257
  range [-9.200000047683716, 31.700000047683716]
  DIRECTION_UNSTABLE

Tess @ P8:
  30.600000143051147
  range [28.600000143051147, 66.2000002861023]
  ROBUST_POSITIVE

MP:
  -1.2499998807907104

MT:
  30.350000023841858

I:
  0.5000002384185791

interaction range:
  [-3.0999999046325684, 75.40000033378601]

interaction direction:
  DIRECTION_UNSTABLE

G:
  71.62500005960464

MP/G:
  -0.01745200530192656

MT/G:
  0.4237347294741403

I/G:
  0.006980806115218019

point crossover:
  none

tessellation crossover:
  none
```

## 11. Across-scale predicates and frozen disposition

The independently recomputed across-scale predicates are:

```text
POINT_POSITIVE_ACROSS:
  false

TESS_POSITIVE_ACROSS:
  false

POINT_CROSSOVER_ACROSS:
  false

TESS_CROSSOVER_ACROSS:
  false

QUALITATIVE_INTERACTION_ACROSS:
  false
```

The independently recomputed final values exactly match the serialized Result:

```text
independent disposition:
  UNRESOLVED

independent nextInvestigationClass:
  NONE

evidence validity:
  VALID
```

No Blocker or Important adjudication finding exists. The sole Minor is an
operational/tooling note and is not a material evidence limitation. Therefore
the evidence classification is `VALID`, not
`VALID WITH BOUNDED EVIDENCE LIMITATION`.

## 12. Interpretation and high-value observations

S2 found substantial descriptive positive longitudinal-tessellation main
effects:

```text
576 MT/G:
  0.4131326993912681

1152 MT/G:
  0.4237347294741403
```

These normalized values are descriptive and are not a separate authority
gate. The frozen conservative rule did not produce
`TESS_POSITIVE_ACROSS` because `1152 Tess @ P3` was
`DIRECTION_UNSTABLE`. No other affirmative disposition predicate fired.
`UNRESOLVED` therefore cannot be overridden by the visually or descriptively
large tessellation main effect, and no tessellation remedy is selected.

The observations `81`, `95`, and `120.90000009536743` are lawful retained
primary evidence. Each is finite, below the frozen ceilings, part of a `VALID`
sample, accompanied by lawful logical-ready/wall behavior, and followed by
zero harness-owned resources. No evidence supports excluding them as
measurement errors. They widen the conservative ranges and materially
contribute to the legitimate `UNRESOLVED` disposition.

## 13. Collateral-stage context

At a bounded descriptive level, increased T also moved geometry merge,
candidate-to-logical-ready, and total sample wall time in a direction
compatible with larger generated geometry across the paired contexts. No
collateral contradiction invalidated the `geometryCreateCpuMs`
characterization.

These collateral metrics are not promoted into a new disposition axis.

## 14. Operational incidents

The adjudicated operational ledger is:

```text
system Git unavailable / Homebrew Git fallback:
  non-blocking operational limitation

pre-workload sandbox server EPERM:
  no evidence impact

stale browser default corrected before admission:
  no evidence impact

post-COMPLETE automated download issue:
  non-blocking operational limitation

manual same-Result download:
  no evidence impact

middleware deprecation warning:
  no evidence impact
```

None is promoted into a material evidence limitation.

## 15. Final Result adjudication

```text
R2C-A-S2 RESULT VALID — DISPOSITION CONFIRMED

Evidence validity:
  VALID

Disposition:
  UNRESOLVED

nextInvestigationClass:
  NONE
```

## 16. Anti-sprawl and renderer lifecycle consequence

The decision-bearing consequence is:

```text
NO RENDERER REMEDY SELECTED
```

There is no automatic authority for:

- a P6/T15 center;
- a 3×3 experiment;
- a larger sample campaign;
- S3;
- R2C-C;
- R2C-B;
- T reduction;
- adaptive tessellation;
- a control-point remedy; or
- batching, workers, packing, caching or instancing.

The frozen default next state is:

```text
RETURN TO COMMERCE / PRODUCT ROADMAP
```

Renderer investigation may reopen only through a separate human-reviewed
decision. This record does not create or authorize another renderer
experiment.

## 17. R2C-B and lifecycle boundary

```text
R2C-B:
  NOT ACTIVATED
```

`UNRESOLVED` does not activate R2C-B, and no renderer remedy has been selected.

After this Result record is independently reviewed and merged, the lifecycle
status will be:

```text
S2 Design Contract:
  INSTALLED

S2 source:
  MERGED / REVIEW-CLOSED

S2 Source Status:
  INSTALLED

primary S2 execution:
  COMPLETE

Result custody:
  COMPLETE

independent Result adjudication:
  COMPLETE

S2 disposition:
  UNRESOLVED

renderer remedy:
  NONE

R2C-B:
  NOT ACTIVATED

R2C-A-S2 lifecycle:
  CLOSED after reviewed Result-record merge
```

This candidate does not claim lifecycle closure before its own independent
review and merge.

## 18. Verdict

```text
R2C-A-S2 RESULT EVIDENCE / ADJUDICATION v0.1 COMPLETE
— READY FOR INDEPENDENT DOCUMENTATION REVIEW
```
