# Render Runtime Control-Point × Longitudinal-Tessellation Decoupling Design / Experiment Contract v0.1

## Status

```text
DOCUMENT CLASS:
  DESIGN / EXPERIMENT CONTRACT

FEATURE STANDARD CLASSIFICATION:
  MEDIUM

STATUS:
  FROZEN v0.1 — SOURCE IMPLEMENTATION NOT AUTHORIZED BY THIS DOCUMENT

TASK CLASSIFICATION:
  SOURCE_ONLY / EVIDENCE_COLLECTION

EXPERIMENT CLASSIFICATION:
  BENCHMARK_ONLY

EXPERIMENT:
  R2C-A-S2

PARENT DESIGN:
  docs/engineering/render-runtime-scaling-measurement-design-contract-v0.3.md

PARENT SOURCE STATUS:
  docs/engineering/render-runtime-scaling-measurement-source-status-v0.1.md

S1 DESIGN:
  docs/engineering/render-runtime-point-sensitivity-design-contract-v0.1.md

S1 SOURCE STATUS:
  docs/engineering/render-runtime-point-sensitivity-source-status-v0.1.md

S1 RESULT ADJUDICATION:
  docs/engineering/render-runtime-point-sensitivity-result-adjudication-v0.1.md

SOURCE BASELINE:
  124e57ee93082984630ccdbd3d778cb4dc86dae0

CUSTOMER / PRODUCT / FIT / COMMERCE / ORDER / MANUFACTURING ACTIVATION:
  NONE

R2C-B:
  NOT ACTIVATED

CHANGE CONTROL:
  supersedes: none
  superseded-by: none
```

## 0. Authority and non-authority

This contract freezes one bounded follow-up measurement design. It does not
implement or execute R2C-A-S2.

It does not reopen, reinterpret, replace or amend the accepted R2C-A-S1
evidence. The governing parent disposition remains:

```text
R2C-A-S1 evidence validity:
  VALID WITH BOUNDED EVIDENCE LIMITATION

R2C-A-S1 disposition:
  MIXED_OR_NONLINEAR

prototypeTarget:
  NONE

next allowable investigation:
  CONTROL_POINT_VS_TESSELLATION_DECOUPLING

R2C-B:
  NOT ACTIVATED
```

S2 is a `BENCHMARK_ONLY` attribution experiment. It may select only the class
of one later bounded investigation or prototype. It does not authorize a
production setting, production optimization, durable renderer remedy, R2C-B
implementation, customer path, canonical R2B transport, database, telemetry,
upload, external service or product activation.

No source, test, configuration or benchmark execution is authorized by this
documentation task.

## 1. Governing evidence and trigger

The R2C-A v0.3 characterization identified `GEOMETRY_CREATE` as the primary
limiting application-owned stage at the selected high strand levels. S1 then
varied the current coupled control-point/longitudinal-tessellation axis at 576
and 1,152 strands.

The reviewed S1 artifact was complete and internally valid, but its evidence
was threshold-proximate under the frozen S1 rules and retained a bounded
browser-major metadata defect. Independent adjudication therefore froze
`MIXED_OR_NONLINEAR`, selected no remedy and permitted only the smallest
factorial experiment that independently varies control-point count and
`TubeGeometry.tubularSegments`.

S2 accepts those facts as governing evidence. It does not recalculate S1,
compare new absolute latency against S1 as a regression or improvement, mutate
the historical S1 artifact, or require S1 to be rerun.

## 2. Sole experimental question

R2C-A-S2 answers only:

> When control-point count and longitudinal `TubeGeometry` tessellation are
> varied independently over the S1-tested extremes, which factor family—or
> their interaction—provides a decision-stable explanation of the observed
> `GEOMETRY_CREATE` sensitivity across both 576 and 1,152 strands?

The answer may select only one later bounded investigation/prototype class. It
does not establish a production setting, a production performance budget,
visual sufficiency or a durable renderer architecture.

## 3. Distinct S2 identity

Repository convention uses an experiment-specific input schema, generator,
result schema and measurement contract for a follow-up experiment. S2 freezes:

```text
experiment:
  R2C-A-S2

name:
  Control-Point × Longitudinal-Tessellation Decoupling

input schema:
  mira.render-lab.r2ca-s2-benchmark-input

input version:
  1

generator:
  r2ca-s2-synthetic-generator/v1

result schema:
  mira.render-lab.r2ca-s2-result

result version:
  1

measurement contract:
  r2ca-s2-v0.1

classification:
  BENCHMARK_ONLY
```

The later implementation must use separate exact-shape input and Result
validators and separate deterministic serialization/file naming.

Mutual rejection is mandatory among all three evidence identities:

```text
R2C-A Result v2
R2C-A-S1 Result v1
R2C-A-S2 Result v1
```

Shared measurement types or runner primitives must not allow any result to
validate or serialize as either of the other two.

## 4. Frozen factors and interpretation boundary

### 4.1 Factor A — control-point representation/curve factor

```text
control points per strand:
  3
  8
```

Changing control-point count changes the admitted strand representation and
the control input supplied to `CatmullRomCurve3`. It is explicitly a composite
representation/curve factor.

It must not be described as pure parsing cost, pure Catmull-Rom cost or an
independent measure of one internal sub-operation.

### 4.2 Factor B — longitudinal-tessellation factor

```text
TubeGeometry.tubularSegments:
  6
  21
```

This is the independently supplied longitudinal-tessellation factor. In S2,
it is not derived from point count or control spans.

### 4.3 Strand levels

```text
strand count:
  576
  1152
```

Strand count is a frozen crossed level used to require agreement across the
same two high-count regimes tested by S1. It is not pooled away and is not a
third remedy factor.

### 4.4 Fixed curve and geometry conditions

```text
radialSegments:
  4

Catmull-Rom curve type:
  centripetal

Catmull-Rom closed:
  false

TubeGeometry closed:
  false
```

No `tubeSegmentsPerControlSpan` invariant exists in S2. Such a field would
silently recouple the factors and is not part of S2 input, cell or analysis
authority.

## 5. Frozen eight-cell design and execution order

The complete design is exactly the eight cells of the `2 × 2 × 2` crossing.
The deterministic order is:

| Position | Strand count | Points | `tubularSegments` |
| ---: | ---: | ---: | ---: |
| 1 | 576 | 3 | 6 |
| 2 | 1152 | 8 | 21 |
| 3 | 1152 | 3 | 21 |
| 4 | 576 | 8 | 6 |
| 5 | 1152 | 8 | 6 |
| 6 | 576 | 3 | 21 |
| 7 | 576 | 8 | 21 |
| 8 | 1152 | 3 | 6 |

In compact form:

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

Manual reordering, randomization and operator-selected order are prohibited.

## 6. Ordering proof

The order balances linear position without randomization infrastructure.

```text
strand-level position sums:
  576  = 1 + 4 + 6 + 7 = 18
  1152 = 2 + 3 + 5 + 8 = 18

point-level position sums:
  P3 = 1 + 3 + 6 + 8 = 18
  P8 = 2 + 4 + 5 + 7 = 18

tessellation-level position sums:
  T6  = 1 + 4 + 5 + 8 = 18
  T21 = 2 + 3 + 6 + 7 = 18

P×T aggregate position sums across strand levels:
  P3 × T6  = 1 + 8 = 9
  P3 × T21 = 3 + 6 = 9
  P8 × T6  = 4 + 5 = 9
  P8 × T21 = 2 + 7 = 9
```

Thus both strand levels, both point levels, both tessellation levels and every
P×T combination have equal aggregate linear position. This is the frozen
counterbalance rationale; it is not a claim that all temporal or external
interference is absent.

## 7. Why P6/T15 is intentionally absent

```text
P6/T15 is not a same-session S2 cell.
```

The four factorial corners at each strand count already identify point simple
effects, tessellation simple effects, averaged main effects and their
interaction. A single joint center cannot attribute factor-specific curvature.
S2 selects an investigation target rather than a production setting, and the
center would add workload without answering the attribution question.

Consequently, S2 cannot establish:

- an exact same-session delta from the existing coupled P6/T15 renderer
  benchmark reference;
- within-point-factor curvature;
- within-tessellation-factor curvature; or
- any exact P3/P8/T6/T21 production setting.

No center cell may be appended after seeing S2 evidence.

## 8. Input and generator contract

S2 input is a distinct immutable, deeply validated `BENCHMARK_ONLY` graph. It
admits only:

```text
strandCount:
  576 | 1152

pointsPerStrand:
  3 | 8

tubularSegments:
  6 | 21

seed:
  20260808

generator version:
  r2ca-s2-synthetic-generator/v1

geometry recipe:
  RADIAL_CROWN_FALL_V1

default width:
  0.028

canonicalR2BBundle:
  false
```

Coordinate, width, rank, ID uniqueness, object-identity, bounds and deep
immutability rules are inherited from the parent/S1 benchmark input contracts.

For the same seed, strand count and point level, S2 P3 and P8 generated data
must match the live S1 generator for every shared semantic field:

- every control-point tuple;
- every strand ID;
- width;
- density rank;
- importance rank;
- material group;
- coordinate system;
- default width; and
- derived bounds.

Whole-object or byte identity is not the equivalence definition because S2
has a distinct schema, generator identity and independent tessellation field.
A later behavior test must compare both live generators rather than a copied
fixture or independently maintained expected table.

S2 input must not enter canonical `StrandAsset`, the R2B manifest/binary
compiler, `loadDiagnosticStrandBundle`, product storage or a customer path.

## 9. Sampling

Freeze exactly:

```text
warm-up per cell:
  1

measured samples per cell:
  5

cells:
  8

valid measured samples in a complete result:
  40
```

Warm-ups are not retained in metric summaries and are not pooled with measured
evidence. A complete cell requires one successful warm-up, exactly five valid
measured samples, a stable accepted actual backend and final zero owned
resources after every warm-up and measured sample.

For every metric retain and exactly recompute from valid measured samples:

```text
count
median
minimum
maximum
raw values in execution order
```

S2 does not add p-values, confidence intervals, p90, a 20-sample confirmation
or adaptive sample extension. Raw samples, medians, minima and maxima are the
evidence.

## 10. Backend policy

```text
requested backend:
  AUTO only
```

Every cell records requested and actual backend separately:

```text
requestedBackend:
  AUTO

actualBackend:
  WEBGPU | WEBGL2
```

The first accepted actual AUTO backend becomes authority for the entire S2
session, including every warm-up and measured sample. Any later different
backend report is `AUTO_BACKEND_DRIFT` and terminates the session before the
drifting sample's geometry selection/creation under the existing shared causal
ordering.

Cells from different actual backends must never be pooled. Because S2 has one
requested backend profile, a profile-terminal failure is session-terminal.
Retain partial evidence and do not advance to another cell.

`AUTO_DID_NOT_SELECT_WEBGPU` remains the sole S2 warning and is present exactly
when the accepted stable AUTO backend is WEBGL2. A warning does not replace
outcome or stop-reason evidence.

## 11. Controlled environment

The primary S2 session uses the same primary-reference class and controlled
state:

```text
browser engine:
  CHROMIUM_FAMILY

OS / architecture:
  MACOS / ARM64

device class:
  PRIMARY_REFERENCE

power:
  AC_POWER

low-power state:
  OFF

page visibility:
  visible

intentional concurrent heavy workloads:
  none

CSS benchmark viewport:
  800 × 600

renderer DPR cap:
  2
```

The operator declaration remains an explicit admission input. S2 does not
claim that all external interference is absent.

At explicit S2 Start, reuse the guarded same-origin run-start provenance
mechanism with the distinct S2 generator identity. The checkout must be clean,
freshly fetched and current-main. Record source commit, branch, tree state,
Next.js version, Three.js version, generator version, recipe and seed. No source
edit, branch change or dependency change may occur during the session.

## 12. Browser product/major admission correction

S1 retained actual `Chrome/151.0.0.0` user-agent evidence while the operator
declaration said browser major `140`. S2 prevents recurrence without modifying
historical S1 evidence or requiring an S1 rerun.

S2 separates these fields:

```text
browserEngine:
  CHROMIUM_FAMILY

browserProduct:
  CHROME | EDGE | OPERA | CHROMIUM

browserMajor:
  the major of browserProduct

rawBrowserVersionEvidence:
  the retained evidence from which product and major are derived
```

The admitted major refers to the selected browser product, never to an
unspecified mixture of wrapper-product and embedded Chrome/Chromium engine
tokens. Product selection and conflict handling are frozen as follows:

1. a recognized wrapper product token takes precedence over an embedded
   Chrome or Chromium engine token;
2. `EDGE` uses Edge product/version evidence, not its embedded Chrome token;
3. `OPERA` uses Opera product/version evidence, not its embedded Chrome token;
4. when no recognized wrapper is present, explicit Chrome product evidence
   takes precedence over generic Chromium engine evidence;
5. when only unambiguous Chromium product evidence is available, the admitted
   product is `CHROMIUM`;
6. grease or deliberately meaningless client-hint brand entries are ignored;
   and
7. multiple conflicting wrapper products, conflicting majors for the selected
   product, disagreement between authoritative retained evidence sources,
   missing product evidence, or ambiguous or unparseable evidence fail
   admission.

Before the first warm-up or measured sample, the operator declaration must
include or confirm:

```text
browserEngine
browserProduct
browserMajor
```

The later S2 runner must independently derive:

```text
actualBrowserProduct
actualBrowserMajor
```

The actual product and major must exactly match the declared product and
major. Any mismatch is `FAIL ADMISSION`; do not begin the first warm-up. Every
admitted Result retains:

```text
browserEngine
declaredBrowserProduct
declaredBrowserMajor
actualBrowserProduct
actualBrowserMajor
rawBrowserVersionEvidence
```

The validator rejects every internal product/major contradiction under these
frozen semantics.

UI autofill or a visible default is not enforcement. Admission must occur in
the execution boundary before session workload begins. An admission rejection
does not create a complete S2 Result and cannot receive an S2 disposition.

This contract freezes semantic product selection, conflict behavior, evidence
retention and validation, not one browser parser or one Web API. Later
implementation reconnaissance must choose the smallest deterministic
mechanism and exact raw-evidence representation. That choice must remain
testable with Chrome, Edge, Opera and Chromium evidence, grease entries,
missing evidence, conflicting evidence, ambiguous evidence and product or
major mismatch.

## 13. Measurement semantics

S2 reuses these exact parent/S1 metrics:

```text
inputConstructionCpuMs
inputValidationCpuMs
backendConstructionCpuMs
sceneSetupCpuMs
rendererInitWallMs
geometrySelectCpuMs
geometryCreateCpuMs
geometryMergeCpuMs
geometryFinalizeCpuMs
firstRenderSubmitCpuMs
candidateToLogicalReadyMs
teardownCpuMs
totalSampleWallMs
```

The primary dependent metric is `geometryCreateCpuMs`.

Parent v0.3 §6 and S1 §9 meanings remain normative:

- every `*CpuMs` is synchronous application-owned CPU duration;
- `rendererInitWallMs` is awaited initialization wall duration;
- `candidateToLogicalReadyMs` begins immediately before candidate backend
  construction and ends after successful reveal/commit;
- prior-backend disposal is excluded from logical-ready time;
- `teardownCpuMs` measures disposal-call CPU time rather than GC/GPU
  reclamation; and
- no per-strand timing mark or callback is allowed.

The other timing metrics remain evidence for collateral movement in input,
renderer initialization, geometry merge/finalize, logical-ready, teardown and
total wall. They are not alternative S2 disposition axes.

`geometryCreateCpuMs` is not GPU completion, presentation, memory, garbage
collection or sustained-frame evidence.

## 14. Safety, lifecycle and cleanup

S2 inherits without weakening:

```text
single synchronous owned stage:
  < 1000 ms

candidate-to-logical-ready:
  < 3000 ms

whole explicit session:
  < 15 minutes

final benchmark-owned resources after every sample:
  exactly zero
```

At or above a hard ceiling:

1. do not start the next owned stage;
2. allow an executing synchronous stage to return;
3. perform bounded cleanup;
4. retain partial in-memory evidence; and
5. stop the S2 session.

The parent/S1 cancellation, route-exit, page-hidden, viewport, DPR,
drawing-buffer, renderer-pixel-ratio, renderer/device failure,
instrumentation, logical-ready, commit/rollback, cleanup-final-cause and
partial-evidence semantics remain normative.

Final owned-resource counts must be exactly zero for candidate hosts, active
hosts, canvases, observers, timers, animation-frame handles, backends and
benchmark geometry ownership. This proves harness ownership cleanup only, not
GC, browser, driver or GPU reclamation.

Partial, stopped, failed, invalidated or cancelled sessions retain lawful raw
evidence already completed but receive no disposition or future-target class.

## 15. Per-strand factorial analysis

Analysis is performed independently at each strand count. Do not pool 576 and
1,152.

For each strand count define the medians:

```text
Y36  = median geometryCreateCpuMs(P3, T6)
Y321 = median geometryCreateCpuMs(P3, T21)
Y86  = median geometryCreateCpuMs(P8, T6)
Y821 = median geometryCreateCpuMs(P8, T21)
```

Simple effects:

```text
Point @ T6:
  DP6 = Y86 - Y36

Point @ T21:
  DP21 = Y821 - Y321

Tessellation @ P3:
  DT3 = Y321 - Y36

Tessellation @ P8:
  DT8 = Y821 - Y86
```

Averaged main effects:

```text
Point main:
  MP = ((Y86 + Y821) - (Y36 + Y321)) / 2

Tessellation main:
  MT = ((Y321 + Y821) - (Y36 + Y86)) / 2
```

Interaction and grand mean:

```text
I = Y821 - Y86 - Y321 + Y36

G = (Y36 + Y321 + Y86 + Y821) / 4
```

When `G > 0`, also retain:

```text
MP / G
MT / G
I / G
```

These normalized values are descriptive only and do not participate in S2
disposition logic. S1's `0.75` and `1.15` thresholds are not reused.

A complete result eligible for a disposition requires `G > 0` at both strand
levels. If either grand mean is nonpositive, normalized analysis is impossible:
the Result must terminate as `FAILED / INSTRUMENTATION_FAILURE`, retain lawful
raw evidence, set disposition and target to `null`, and must not masquerade as
a complete S2 result.

All computations use full finite values. Presentation rounding must not change
a classification.

## 16. Conservative raw simple-effect ranges

For every simple contrast `A - B`, derive a deterministic conservative range
from the five raw `geometryCreateCpuMs` values in each cell:

```text
minimum contrast:
  min(A) - max(B)

maximum contrast:
  max(A) - min(B)
```

For example:

```text
Point @ T6 range:
  [
    min(P8, T6) - max(P3, T6),
    max(P8, T6) - min(P3, T6)
  ]
```

Classify each simple-effect range exactly:

```text
ROBUST_POSITIVE:
  minimum contrast > 0

ROBUST_NEGATIVE:
  maximum contrast < 0

DIRECTION_UNSTABLE:
  every other finite range, including either endpoint equal to 0
```

The range is a deterministic raw-evidence stability check. It is not a
confidence interval, sampling distribution or statistical-significance claim.

## 17. Conservative interaction range

For the interaction:

```text
I = A - B - C + D

A = (P8, T21)
B = (P8, T6)
C = (P3, T21)
D = (P3, T6)
```

freeze the exact conservative raw range:

```text
minimum interaction:
  min(A) - max(B) - max(C) + min(D)

maximum interaction:
  max(A) - min(B) - min(C) + max(D)
```

Classify the interaction range with the same exact vocabulary:

```text
ROBUST_POSITIVE:
  minimum interaction > 0

ROBUST_NEGATIVE:
  maximum interaction < 0

DIRECTION_UNSTABLE:
  every other finite range, including either endpoint equal to 0
```

For each strand level retain the median interaction contrast, conservative
interaction range and interaction direction as first-class descriptive
analysis evidence. A median interaction that is merely nonzero does not change
its direction class; the conservative raw range determines that class.

A robust nonzero interaction direction is evidence of nonadditivity. It does
not by itself determine the final disposition or preempt stable factor-side
evidence. No interaction-magnitude threshold is justified or introduced by
this contract. Only the preregistered qualitative crossover predicates in
§19 select `INTERACTION_OR_NONADDITIVE`.

## 18. S2 disposition vocabulary

Exactly one of these may be emitted for a complete valid eight-cell result:

```text
CONTROL_POINT_SIDE
TESSELLATION_SIDE
BOTH_FACTORS
INTERACTION_OR_NONADDITIVE
UNRESOLVED
```

`FIXED_OVERHEAD` is intentionally absent. Failure to obtain decision-stable
positive point or tessellation evidence is not proof of fixed overhead.

## 19. Exact mutually exclusive disposition logic

For each strand level `s`, use these explicit simple-effect predicates:

```text
POINT_AT_T6(s)  = direction class of DP6
POINT_AT_T21(s) = direction class of DP21
TESS_AT_P3(s)   = direction class of DT3
TESS_AT_P8(s)   = direction class of DT8
```

Each predicate has exactly one value: `ROBUST_POSITIVE`, `ROBUST_NEGATIVE` or
`DIRECTION_UNSTABLE`. Strand levels are never pooled.

Define the across-scale positive predicates exactly:

```text
POINT_POSITIVE_ACROSS =
  POINT_AT_T6(576)   == ROBUST_POSITIVE
  and POINT_AT_T21(576)  == ROBUST_POSITIVE
  and POINT_AT_T6(1152)  == ROBUST_POSITIVE
  and POINT_AT_T21(1152) == ROBUST_POSITIVE

TESS_POSITIVE_ACROSS =
  TESS_AT_P3(576)   == ROBUST_POSITIVE
  and TESS_AT_P8(576)   == ROBUST_POSITIVE
  and TESS_AT_P3(1152)  == ROBUST_POSITIVE
  and TESS_AT_P8(1152)  == ROBUST_POSITIVE
```

Define the exact point crossover signatures:

```text
POINT_CROSSOVER_POS_TO_NEG(s) =
  POINT_AT_T6(s)  == ROBUST_POSITIVE
  and POINT_AT_T21(s) == ROBUST_NEGATIVE

POINT_CROSSOVER_NEG_TO_POS(s) =
  POINT_AT_T6(s)  == ROBUST_NEGATIVE
  and POINT_AT_T21(s) == ROBUST_POSITIVE
```

Define the exact tessellation crossover signatures:

```text
TESS_CROSSOVER_POS_TO_NEG(s) =
  TESS_AT_P3(s) == ROBUST_POSITIVE
  and TESS_AT_P8(s) == ROBUST_NEGATIVE

TESS_CROSSOVER_NEG_TO_POS(s) =
  TESS_AT_P3(s) == ROBUST_NEGATIVE
  and TESS_AT_P8(s) == ROBUST_POSITIVE
```

A point-side qualitative crossover is decision-stable only when the same
non-null crossover orientation occurs at both 576 and 1,152. A
tessellation-side qualitative crossover is decision-stable under the same
rule. Therefore:

```text
POINT_CROSSOVER_ACROSS =
  (POINT_CROSSOVER_POS_TO_NEG(576)
   and POINT_CROSSOVER_POS_TO_NEG(1152))
  or
  (POINT_CROSSOVER_NEG_TO_POS(576)
   and POINT_CROSSOVER_NEG_TO_POS(1152))

TESS_CROSSOVER_ACROSS =
  (TESS_CROSSOVER_POS_TO_NEG(576)
   and TESS_CROSSOVER_POS_TO_NEG(1152))
  or
  (TESS_CROSSOVER_NEG_TO_POS(576)
   and TESS_CROSSOVER_NEG_TO_POS(1152))

QUALITATIVE_INTERACTION_ACROSS =
  POINT_CROSSOVER_ACROSS or TESS_CROSSOVER_ACROSS
```

If only one strand crosses over or the strand levels have incompatible
crossover orientations, `QUALITATIVE_INTERACTION_ACROSS` is false. A robust
interaction direction remains recorded even when no qualitative crossover is
present; it cannot independently upgrade the disposition.

Evaluate this ordered decision table exactly:

| Priority | Exact predicate | Disposition |
| ---: | --- | --- |
| 1 | `QUALITATIVE_INTERACTION_ACROSS` | `INTERACTION_OR_NONADDITIVE` |
| 2 | not priority 1 and `POINT_POSITIVE_ACROSS` and `TESS_POSITIVE_ACROSS` | `BOTH_FACTORS` |
| 3 | not priorities 1–2, `POINT_POSITIVE_ACROSS`, and every `TESS_AT_P3(s)` and `TESS_AT_P8(s)` context across both strand levels is `DIRECTION_UNSTABLE` | `CONTROL_POINT_SIDE` |
| 4 | not priorities 1–3, `TESS_POSITIVE_ACROSS`, and every `POINT_AT_T6(s)` and `POINT_AT_T21(s)` context across both strand levels is `DIRECTION_UNSTABLE` | `TESSELLATION_SIDE` |
| 5 | every remaining complete valid result | `UNRESOLVED` |

This hierarchy is mutually exclusive and exhaustive. A robust negative
non-target effect does not qualify as absence of evidence and routes away from
the one-sided disposition. Three-of-four positive contexts, one unstable
context, cross-strand disagreement, robust negative factor effects without the
compatible crossover pattern, contradictory simple-effect structures,
one-strand-only crossover, incompatible crossover orientations, interaction
evidence without qualitative crossover and every other nonmatching factor
story fall through to `UNRESOLVED`.

`INTERACTION_OR_NONADDITIVE` is a qualitative interaction classification. It
does not prove that interaction magnitude dominates all main effects. Robust
interaction direction is retained descriptively for every disposition.

### 19.1 Frozen disposition examples

| Example | Simple-effect structure | Interaction evidence | Result |
| --- | --- | --- | --- |
| A | All point and tessellation contexts are `ROBUST_POSITIVE` | `ROBUST_POSITIVE` at both strands; no qualitative crossover | `BOTH_FACTORS`, with robust-positive interaction retained descriptively |
| B | `POINT_AT_T6(s)` is `ROBUST_POSITIVE` and `POINT_AT_T21(s)` is `ROBUST_NEGATIVE` at both 576 and 1,152 | Same point crossover orientation at both strands | `INTERACTION_OR_NONADDITIVE` |
| C | All point contexts are `ROBUST_POSITIVE`; all tessellation contexts are `DIRECTION_UNSTABLE` | Any retained direction that does not produce a qualitative crossover | `CONTROL_POINT_SIDE` |
| D | All point contexts are `ROBUST_POSITIVE`; all tessellation contexts are `ROBUST_NEGATIVE` | No compatible qualitative crossover | `UNRESOLVED`, not `CONTROL_POINT_SIDE` |
| E | No affirmative point/tessellation rule and no qualitative crossover | Matching `ROBUST_POSITIVE` interaction direction at both strands | `UNRESOLVED`; interaction remains recorded as evidence |

No percentage, absolute-millisecond, p-value or normalized-effect threshold is
used to force a disposition.

## 20. Result authority and future target classes

The disposition maps to exactly one bounded next-investigation class:

| S2 disposition | `nextInvestigationClass` | Maximum authority |
| --- | --- | --- |
| `CONTROL_POINT_SIDE` | `CONTROL_POINT_REPRESENTATION_CURVE_SIDE` | A bounded control-point representation/curve-side prototype investigation. |
| `TESSELLATION_SIDE` | `LONGITUDINAL_TESSELLATION_STRATEGY` | A bounded longitudinal-tessellation strategy prototype investigation. |
| `BOTH_FACTORS` | `BOTH_FACTOR_SIDES` | A bounded comparison of remedies on both factor sides. |
| `INTERACTION_OR_NONADDITIVE` | `CONTROL_POINT_TESSELLATION_INTERACTION` | A bounded interaction/construction investigation. |
| `UNRESOLVED` | `NONE` | No remedy or prototype selected. |

The mapping is deterministic and must be recomputed by Result validation.
Even a valid non-`UNRESOLVED` disposition authorizes only a separately reviewed
investigation/prototype task. It does not authorize a production change.

S2 does not freeze or preselect adaptive tessellation, point reduction,
workers, batching, packing, caching, instancing or any other algorithm.

## 21. Result v1 and evidence contract

The S2 Result identity is exactly:

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
```

Required top-level groups are:

```text
schema
version
experiment
measurementContract
generatorVersion
classification
source
environment
sessionConfiguration
cells
analysis
outcome
stopReason
warnings
```

`environment` retains the inherited environment evidence plus:

```text
browserEngine
declaredBrowserProduct
declaredBrowserMajor
actualBrowserProduct
actualBrowserMajor
rawBrowserVersionEvidence
```

`sessionConfiguration` freezes the exact axes, eight-cell order, sample counts,
visual state, requested backend, fixed geometry conditions and ceilings in this
contract.

Every cell retains:

```text
strandCount
pointsPerStrand
tubularSegmentsPerStrand
controlSpansPerStrand
radialSegments
requestedBackend
actualBackend
warmupStatus
rawMeasuredSamples
metricSummaries
cleanupOutcome
cellOutcome
cellStopReason
```

`controlSpansPerStrand` must equal `pointsPerStrand - 1`.
`tubularSegmentsPerStrand` is the independently supplied factor and must equal
the cell's frozen T6/T21 value, not a formula derived from control spans.

For each strand level, `analysis` retains:

```text
four geometryCreateCpuMs cell medians
four raw geometryCreateCpuMs cell ranges
four median simple effects
four conservative simple-effect ranges
POINT_AT_T6(s), POINT_AT_T21(s), TESS_AT_P3(s) and TESS_AT_P8(s)
point main effect
tessellation main effect
interaction
conservative interaction range
interaction direction class
factor-side crossover signatures
grand mean
descriptive MP/G, MT/G and I/G
```

Top-level analysis retains:

```text
POINT_POSITIVE_ACROSS
TESS_POSITIVE_ACROSS
POINT_CROSSOVER_ACROSS
TESS_CROSSOVER_ACROSS
QUALITATIVE_INTERACTION_ACROSS
disposition
nextInvestigationClass
```

For a complete valid result, all 40 measured samples, summaries, contrasts,
ranges, direction classes, disposition and target mapping must exactly
recompute from raw evidence.

For a partial, stopped, failed, invalidated or cancelled result,
`analysis.disposition` and `analysis.nextInvestigationClass` are `null`.
Descriptive analysis for already complete cells may be retained only when it
still exactly recomputes from raw evidence.

The exact-shape validator must reject at least:

- an unknown schema, version, experiment, measurement contract, generator or
  classification;
- a parent Result v2 or S1 Result v1 presented as S2, and the reverse;
- a missing, extra, duplicate or reordered cell in a complete result;
- any strand, point, tessellation, backend, curve or geometry value outside
  this contract;
- a derived tubular-segment value substituted for the independent S2 factor;
- a complete cell without one successful warm-up and exactly five valid
  measured samples;
- nonfinite or negative timing values;
- missing required metrics in a valid measured sample;
- a summary, contrast, range, class, disposition or target that does not
  exactly recompute;
- a complete/disposition-bearing result with a nonpositive grand mean at either
  strand level;
- backend drift or requested/actual backend inconsistency;
- valid evidence with nonzero cleanup;
- terminal outcome/stop-reason contradictions;
- invalid environment or provenance admission;
- missing, ambiguous, mismatched or internally contradictory browser product
  or major evidence under the frozen selection/conflict semantics in an
  admitted result; and
- a non-null disposition or target on a non-complete result.

The validator must preserve the bounded causal/reachability guarantees already
established by S1 rather than reducing Result validation to shape checks.

Serialization is deterministic two-space JSON plus one final LF. Use an
S2-specific canonical filename with the repository convention:

```text
mira-r2ca-s2-v01-<startedAt with colons replaced by hyphens>.json
```

Download is explicit and local. No automatic download is allowed.

## 22. Evidence custody and persistence boundary

The raw Result is not automatically stored in Git.

Future evidence adjudication must bind:

```text
canonical filename
byte count
SHA-256
byte-identical archival copy
```

The artifact retains all raw samples, recomputable summaries and analysis,
source provenance, controlled environment, browser product/major admission
evidence, backend authority, cleanup truth, outcome, stop reason and warnings.

There is no database persistence, local-storage persistence, telemetry, upload,
clipboard requirement or external benchmark request.

## 23. Geometry and fidelity boundary

Every S2 cell is a `BENCHMARK_ONLY` performance probe.

Constructor validity, finite geometry and nonempty valid merged geometry are
execution floors only. They do not establish:

- P3 visual sufficiency;
- P8 visual superiority;
- T6 visual sufficiency;
- T21 visual superiority;
- any production point count;
- any production segment count; or
- product-realistic hair or asset fidelity.

No screenshot ranking, visual-quality gate or fidelity disposition belongs in
S2.

## 24. Operator surface and lifecycle

Reuse the protected internal surface:

```text
/admin/render-lab/performance
```

The route-local `requireAdmin()` and dynamic client-only boundary remain.
A later implementation may add only an explicit, separately labelled S2
start/result/download surface. Page load, render, import or mount must not start
S2 or perform S2 provenance I/O.

The surface must retain:

```text
BENCHMARK_ONLY
VISUAL_ONLY
EXPLORATORY CHARACTERIZATION
NOT PRODUCT TRUTH
NOT FIT EVIDENCE
NOT A PRODUCTION BUDGET
NOT A MANUFACTURING SPECIFICATION
```

Only one parent/S1/S2 benchmark session may own execution on the page at a
time. Cancellation and route exit abort the active owner and perform bounded
cleanup. Stale completion after unmount, remount or owner replacement must not
be accepted.

## 25. Later source architecture boundary

No implementation is authorized by this contract. A later separately reviewed
implementation may introduce only the narrow benchmark seam required to supply
independent `tubularSegments`:

```text
new S2 input/result/runner/provenance/action/UI ownership
        ↓
existing shared runner core
        ↓
existing benchmark renderer path
        ↓
CatmullRomCurve3
        ↓
TubeGeometry with explicit BENCHMARK_ONLY tubularSegments
        ↓
existing merge/finalize/cleanup path
```

Parent v0.3 and S1 coupled behavior must remain byte- or behavior-compatible as
applicable. Their validators, generator identities, schedules, coupled segment
derivation, serialization and results must not be widened or reinterpreted.

Normal R1, R2B and customer rendering must remain unchanged. The benchmark
seam must not become a general production `tubularSegments` control.

No package, lockfile, config, Prisma, storage, canonical R2B or customer-path
change is anticipated. A need for one stops later reconnaissance and requires a
revised design/task contract.

## 26. Later implementation reconnaissance and behavior gates

After independent review and merge of this document, a fresh read-only
reconnaissance must determine the exact S2 sibling paths and the smallest
renderer adapter. It must inspect the installed S1 sibling architecture and
shared runner core rather than assume filenames from this design.

The later source task must behavior-test at least:

- exact S2 identities and mutual rejection with parent Result v2 and S1 Result
  v1;
- exact P3/P8, T6/T21 and 576/1152 input axes and rejection of every other
  level;
- deterministic, deeply immutable S2 input;
- live-generator shared-field equivalence with S1 at P3/P8 and both strand
  counts;
- all four independent P×T combinations reaching the exact
  `TubeGeometry` constructor arguments with radial segments 4 and both closed
  flags false;
- exact eight-cell order and its immutability;
- AUTO-only backend, first-accepted backend authority and stop-before-geometry
  drift behavior;
- one warm-up plus five measured samples per cell;
- browser evidence capture, frozen branded-wrapper/Chrome/Chromium precedence,
  grease handling, fail-closed evidence conflicts, exact declared-versus-actual
  product/major matching, pre-sample rejection and contradictory-Result
  rejection;
- unchanged measurement stages and three hard ceilings;
- visibility, viewport, DPR, drawing-buffer and renderer-pixel-ratio
  invalidation;
- cancellation, route exit, cleanup final cause and exactly zero final owned
  resources;
- partial-result retention without disposition or target;
- all medians, cell ranges, simple effects, conservative ranges, direction
  classes, main effects, interaction, normalized descriptive values,
  disposition and target mapping recomputed from raw evidence;
- the complete decision-table truth table, including both compatible point and
  tessellation crossover orientations, one-level crossover, incompatible
  cross-strand orientations, robust interaction direction without qualitative
  crossover, each factor-side result, both factors, robust-negative non-target
  effects and every fallback;
- explicit S2 Start and no automatic execution/download;
- no persistence, telemetry, upload, external request or navigation;
- no canonical R2B/customer import edge; and
- unchanged parent v0.3 and S1 behavior and their full regression suites.

The later source task runs `npm run verify` and the proportionate production
build/static boundary checks required by the installed parent/S1 architecture.
It must not execute the eight-cell S2 workload during implementation or CI.

After reviewed implementation merge, install a distinct S2 Source Status /
As-Built record. S2 primary execution remains blocked until that record is
independently reviewed and merged.

## 27. Anti-sprawl lifecycle boundary

If a complete valid S2 result is `UNRESOLVED`, the default next state is:

```text
NO RENDERER REMEDY SELECTED
```

There is no automatic:

- P6/T15 center add-on;
- 3×3 campaign;
- larger-sample campaign;
- S3;
- R2C-C; or
- activation of R2C-B.

Return to the commerce/product roadmap unless a separate human-reviewed
decision explicitly reopens renderer investigation. An S2 artifact or its
operator UI must not auto-schedule, recommend or unlock an expanded campaign.

## 28. Known limits

S2 cannot establish:

- pure parsing cost or pure Catmull-Rom cost;
- an exact coupled P6/T15 renderer-benchmark-reference delta;
- within-factor curvature;
- visual sufficiency or superiority of any tested level;
- a production setting, performance budget or durable renderer remedy;
- behavior outside 576/1152, P3/P8 or T6/T21;
- forced-WebGL2 sensitivity in this follow-up;
- cross-device or cross-browser portability;
- GPU completion, presentation, memory, GC or sustained-FPS behavior;
- absence of browser/driver/GPU leaks; or
- absence of all external interference.

The conservative ranges establish only raw observed direction stability under
the frozen five-sample cells. They are not confidence intervals.

## 29. Documentation change control

Repository rendering precedent for R2C-A v0.3 and S1 installs a new versioned
engineering contract, appends its link/summary to
`docs/engineering/README.md`, and records the bounded rendering design freeze
in `docs/discovery/decision-log.md`.

This S2 documentation change owns exactly:

```text
docs/discovery/decision-log.md
docs/engineering/render-runtime-control-point-tessellation-decoupling-design-contract-v0.1.md
docs/engineering/README.md
```

The completed S1 Design Contract, Source Status and Result Adjudication remain
byte-unchanged.

Semantic changes to S2 require a new reviewed version with explicit
supersession. Later source truth belongs in a separate Source Status / As-Built
record; neither this contract nor historical S1 records may be rewritten to
impersonate it.

## 30. Rollback and next gate

Documentation rollback removes this unmerged S2 contract and its README entry.
There is no source, database, storage, telemetry, artifact or customer state to
roll back.

This document authorizes documentation only. After independent adversarial
review and reviewed merge, the next allowable task is fresh read-only S2
implementation reconnaissance. That reconnaissance must return a separate
exact implementation task contract before any source or test edit.

No S2 benchmark may run until separately reviewed source is merged, an S2
Source Status / As-Built is reviewed and merged, the checkout is freshly
fetched/clean/current-main, and the controlled admission in this contract
passes.

No R2C-B implementation or durable renderer decision is authorized.

## 31. Verdict

```text
R2C-A-S2 DESIGN / EXPERIMENT CONTRACT v0.1 COMPLETE
— READY FOR INDEPENDENT ADVERSARIAL REVIEW
```
