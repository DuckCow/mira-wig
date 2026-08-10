# R2C-A-S1 Point/Tessellation Sensitivity Result Evidence / Adjudication v0.1

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
  R2C-A-S1

S1 PRIMARY EXECUTION:
  COMPLETE

RESULT-v1 CUSTODY:
  ESTABLISHED

CANONICAL VALIDATION:
  PASS

INDEPENDENT RESULT ADJUDICATION:
  COMPLETE

EVIDENCE VALIDITY:
  VALID WITH BOUNDED EVIDENCE LIMITATION

FROZEN DISPOSITION:
  MIXED_OR_NONLINEAR

DURABLE REMEDY:
  NOT SELECTED

R2C-B AUTHORITY:
  NOT ACTIVATED

CHANGE CONTROL:
  supersedes: none
  superseded-by: none
```

## 1. Purpose and authority boundary

This record installs the durable repository evidence and independent
adjudication for the completed R2C-A-S1 primary Result v1. It binds the local
artifact by canonical filename, byte count and SHA-256 rather than copying the
73 KB raw artifact into the repository.

This is an evidence-lifecycle record. It does not amend the frozen Design
Contract or the Result-v1 artifact, alter source or tests, select a durable
renderer remedy, design the next experiment, or activate R2C-B, customer,
product, fitting, commerce, order or manufacturing behavior.

The earlier Source Status remains the historical record of source truth at its
installation time. Its statement that characterization had not yet executed
is not rewritten to impersonate this later result truth.

## 2. Governing and source identity

```text
frozen Design Contract:
  docs/engineering/render-runtime-point-sensitivity-design-contract-v0.1.md

frozen Design Contract SHA-256:
  ff8cb0720310ed77e85f47a6373a741da7d434e7f04ea7c4a0437f75c57aff54

Source Status / As-Built:
  docs/engineering/render-runtime-point-sensitivity-source-status-v0.1.md

source commit:
  7ec020fd74d29c044e3ff8c57a53d8a495ae035f

source branch:
  main

source tree:
  CLEAN
```

The Result-v1 identity is exactly:

```text
schema:
  mira.render-lab.r2ca-s1-result

version:
  1

experiment:
  R2C-A-S1

measurementContract:
  r2ca-s1-v0.1

generatorVersion:
  r2ca-s1-synthetic-generator/v1

classification:
  BENCHMARK_ONLY

outcome:
  COMPLETE

stopReason:
  NONE

warnings:
  []
```

## 3. Artifact custody and durable identity

```text
canonical filename:
  mira-r2ca-s1-v01-2026-08-10T05-05-41.133Z.json

bytes:
  73091

SHA-256:
  84b2d4cabded90d942ce27b933e0252fecc6f5ab32825ae85bc1b0ede82df737

original/archive:
  byte-identical
```

At evidence-record drafting time, the operator-designated original and
archival copy both existed, each had the recorded byte count and digest, and
`cmp` established byte identity. Their local absolute paths are execution-time
custody observations only; they are not portable repository authority. The
canonical filename and SHA-256 above are the durable artifact identity.

The raw Result-v1 artifact is intentionally not copied into the repository.

## 4. Canonical validation and raw-evidence integrity

The artifact passed the merged Result-v1 exact-shape validator. Validation and
deterministic serialization produced the same canonical filename, 73,091
bytes, and bytes identical to the reviewed artifact.

Independent raw-evidence audit established:

- exactly 6 cells in the frozen order `576×P3`, `576×P6`, `576×P8`,
  `1152×P8`, `1152×P6`, `1152×P3`;
- one valid warm-up per cell;
- 5 valid measured samples per cell and 30 measured samples total;
- requested backend `AUTO` for every cell;
- actual backend `WEBGPU` for every cell;
- status `VALID` and stop reason `NONE` for every measured sample;
- zero cleanup outcomes and zero final owned-resource counts for every sample
  and cell;
- 78/78 metric summaries independently recomputed from raw evidence and
  matched; and
- every serialized analysis field independently recomputed and matched.

These findings validate the frozen evidence shape and internal recomputation.
They do not extend the experiment's causal or environmental authority.

## 5. Decision-bearing numerical record

Full finite values are retained because presentation rounding must not change
the preregistered threshold outcomes.

### 5.1 576 strands

```text
G3:
  33.799999952316284

G6:
  40.299999952316284

G8:
  47

R3:
  0.8387096772285131

R8:
  1.1662531031169052

strictMedianMonotonicity:
  true

P3 raw ratio range:
  [0.7741935504863559, 0.9205955322215877]

P8 raw ratio range:
  [1.111662531149491, 1.2084367271788206]

thresholdProximate:
  true

levelDisposition:
  MIXED_OR_NONLINEAR
```

### 5.2 1152 strands

```text
G3:
  67.30000019073486

G6:
  89.70000004768372

G8:
  100.70000004768372

R3:
  0.7502787085279686

R8:
  1.12263099213102

strictMedianMonotonicity:
  true

P3 raw ratio range:
  [0.7491638797320045, 1.1772575233946103]

P8 raw ratio range:
  [1.010033445873902, 1.440356744470481]

thresholdProximate:
  true

levelDisposition:
  MIXED_OR_NONLINEAR
```

### 5.3 Overall

```text
disposition:
  MIXED_OR_NONLINEAR

prototypeTarget:
  NONE
```

## 6. Independent adjudication and browser limitation

The independently reviewed evidence disposition is:

```text
VALID WITH BOUNDED EVIDENCE LIMITATION

limitation:
  IMPORTANT NON-BLOCKING METADATA DEFECT
```

The retained browser evidence disagrees:

```text
actual raw user-agent browser:
  Chrome/151.0.0.0

operator-declared browser major:
  140
```

Exact browser-major equality was not a frozen admission gate. The actual raw
user agent was separately retained, and all six cells ran within one stable
session and one stable `WEBGPU` backend. The discrepancy therefore does not
invalidate the within-session P3/P6/P8 comparison.

The run must be treated as Chrome 151 evidence. Declared browser major 140 is
not reliable version provenance and must not be cited as the browser version
for this run. The Result-v1 artifact remains immutable and must not be edited
retroactively.

Before the next decision-bearing renderer experiment, the operator declaration
must be checked against the browser's actual version evidence so a stale
`browserMajor` default is not silently retained. This bounded forward control
does not require an S1 rerun and does not redesign browser provenance.

## 7. Evidence interpretation boundary

The evidence establishes:

- `GEOMETRY_CREATE` medians are strictly ordered P3 < P6 < P8 at both strand
  counts;
- the observed magnitude of coupled sensitivity differs between 576 and 1152;
- raw evidence is threshold-proximate/unstable under the preregistered rules;
  and
- the coupled S1 axis cannot identify the constituent remedy mechanism.

The evidence does not establish:

- independent control-point processing cost;
- independent Catmull-Rom cost;
- independent `TubeGeometry` longitudinal-tessellation cost;
- visual sufficiency of P3 or visual superiority of P8;
- a production architecture, performance budget or durable remedy;
- statistical significance or cross-browser/device results; or
- GPU completion, memory, garbage-collection or presentation behavior.

## 8. Frozen disposition

The frozen evidence disposition is `MIXED_OR_NONLINEAR`, with
`prototypeTarget: NONE`. Neither point reduction nor tessellation reduction is
selected as the remedy.

The frozen Design Contract requires the next investigation class:

```text
CONTROL_POINT_VS_TESSELLATION_DECOUPLING
```

That is a next experiment class, not an activated R2C-B remedy or durable
architecture decision.

## 9. Lifecycle decision and next gate

```text
S1 primary execution:
  COMPLETE

Result-v1 custody:
  ESTABLISHED

Canonical validation:
  PASS

Independent result adjudication:
  COMPLETE

Evidence validity:
  VALID WITH BOUNDED EVIDENCE LIMITATION

Frozen disposition:
  MIXED_OR_NONLINEAR

Durable remedy:
  NOT SELECTED

R2C-B authority:
  NOT ACTIVATED
```

After reviewed merge of this evidence record, the next allowable work is to
prepare a separately reviewed Design / Experiment Contract for the smallest
`CONTROL_POINT_VS_TESSELLATION_DECOUPLING` factorial experiment. This document
does not design or authorize that experiment.

## 10. Verdict

```text
R2C-A-S1 RESULT EVIDENCE / ADJUDICATION RECORD COMPLETE
— READY FOR INDEPENDENT DOCUMENTATION REVIEW
```
