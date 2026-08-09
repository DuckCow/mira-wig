# Render Runtime Point/Tessellation Sensitivity Design Contract v0.1

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
  R2C-A-S1

PARENT DESIGN:
  docs/engineering/render-runtime-scaling-measurement-design-contract-v0.3.md

PARENT SOURCE STATUS:
  docs/engineering/render-runtime-scaling-measurement-source-status-v0.1.md

SOURCE BASELINE:
  5c3a072f74dc4114138ca9cf28c447b193c55369

CUSTOMER / PRODUCT / FIT / COMMERCE / ORDER / MANUFACTURING ACTIVATION:
  NONE

CHANGE CONTROL:
  supersedes: none
  superseded-by: none
```

## 0. Authority and non-authority

This contract freezes one bounded follow-up measurement design. It does not
implement or execute R2C-A-S1.

It does not reinterpret, replace or amend R2C-A v0.3 or its first reviewed
clean-main characterization. In particular, it does not authorize changing:

```text
schema:
  mira.render-lab.r2ca-result

version:
  2

measurementContract:
  r2ca-v0.3

pointsPerStrand:
  6
```

It does not authorize widening the R2C-A v0.3 input or Result v2 validators
from `6` to `3 | 6 | 8`.

R2C-A-S1 may choose only the target of a later bounded R2C-B prototype. It
does not choose or authorize a durable renderer, asset or product architecture.

No R2C-B implementation, customer path, canonical R2B transport, database,
telemetry, upload, external service or production activation is authorized.

## 1. Parent evidence and trigger

The initiating task supplies the following independently reviewed parent A1
identity:

```text
source commit:
  5c3a072f74dc4114138ca9cf28c447b193c55369

artifact SHA-256:
  e794c33ff922f81fa195dfb1ce91eb61f3e79e1abe8f9075193e35cc2e20bc78

outcome:
  COMPLETE

stopReason:
  NONE

samples:
  10 cells × 5 measured = 50 valid measured samples

cleanup:
  zero final owned resources throughout
```

Its independent disposition is supplied as:

```text
WEBGPU:
  DOMINANT_CPU_GEOMETRY_PREPARATION

WEBGL2:
  DOMINANT_CPU_GEOMETRY_PREPARATION

primary limiting stage:
  GEOMETRY_CREATE
```

Representative supplied medians are:

| Actual backend | Strands | `geometryCreateCpuMs` | `candidateToLogicalReadyMs` |
| --- | ---: | ---: | ---: |
| WEBGPU | 576 | 106.8 ms | 148.8 ms |
| WEBGPU | 1152 | 245.2 ms | 291.9 ms |
| WEBGL2 | 576 | 102.2 ms | 176.5 ms |
| WEBGL2 | 1152 | 233.0 ms | 331.3 ms |

The parent v0.3 clear-bottleneck trigger fired. S1 accepts that reviewed
disposition as parent evidence and does not recalculate, pool with, overwrite
or otherwise reinterpret A1.

The parent Source Status records the installation-time truth that A1 had not
yet run. That historical statement is not a conflict: the supplied A1 evidence
post-dates source installation. The raw A1 JSON is not installed in this
repository, so this contract repeats only the identity and facts supplied by
the initiating task.

## 2. Sole experimental question

R2C-A-S1 answers only:

```text
At fixed high strand counts where GEOMETRY_CREATE already dominates,
how sensitive is geometry-creation CPU time to the current coupled
control-point / TubeGeometry longitudinal-tessellation complexity?
```

The answer either selects the next bounded R2C-B prototype target or defers
remedy selection under `MIXED_OR_NONLINEAR`. It is not a durable architecture
decision and it does not establish product-realistic visual fidelity.

## 3. Coupled interpretation boundary

Current source constructs benchmark strand geometry through:

```text
createBenchmarkTubeGeometry
→ CatmullRomCurve3
→ TubeGeometry
→ assembleRendererBenchmarkGeometry
```

Current source also computes:

```text
tubularSegments =
  (controlPointCount - 1) × TUBE_SEGMENTS_PER_CONTROL_SPAN

TUBE_SEGMENTS_PER_CONTROL_SPAN:
  3

TUBE_RADIAL_SEGMENTS:
  4
```

The S1 axis therefore has these exact coupled values:

| `pointsPerStrand` | `controlSpansPerStrand` | `tubularSegmentsPerStrand` | `radialSegments` |
| ---: | ---: | ---: | ---: |
| 3 | 2 | 6 | 4 |
| 6 | 5 | 15 | 4 |
| 8 | 7 | 21 | 4 |

S1 varies control-point count, Catmull-Rom interpolation work and longitudinal
`TubeGeometry` tessellation together. It does not independently vary any of
them. Radial segments remain fixed at 4 and are not a sensitivity axis.

Even a strong S1 response permits only this causal claim:

```text
GEOMETRY_CREATE is materially sensitive to the current coupled
control-point / longitudinal-tessellation complexity.
```

S1 must not claim to independently identify:

- control-point parsing or interpolation cost;
- Catmull-Rom fitting cost; or
- `TubeGeometry` tessellation cost.

It must not state or imply that tessellation is proven to be the bottleneck,
that control-point parsing is proven to be the bottleneck, or that reducing
point count is the correct production remedy.

Those variables remain coupled. Separating them requires a later, separately
contracted factorial experiment that independently varies control-point count
and `tubularSegments`.

## 4. Distinct S1 identity

S1 has independent input, execution and evidence authority:

```text
experiment:
  R2C-A-S1

input schema:
  mira.render-lab.r2ca-s1-benchmark-input

input version:
  1

result schema:
  mira.render-lab.r2ca-s1-result

result version:
  1

measurementContract:
  r2ca-s1-v0.1

generatorVersion:
  r2ca-s1-synthetic-generator/v1

classification:
  BENCHMARK_ONLY
```

S1 may reuse unchanged measurement types and renderer instrumentation. Shared
types do not permit an S1 result to validate as R2C-A Result v2, or the reverse.

The implementation must retain separate exact-shape validators and separate
serialization/file naming for the two experiment identities.

## 5. Primary workload

The complete primary S1 workload is exactly:

```text
strand counts:
  576
  1152

points per strand:
  3
  6
  8

requested backend:
  AUTO only

warm-up per cell:
  1

measured samples per cell:
  5

cells:
  6

valid measured samples in a complete result:
  30
```

The deterministic counterbalanced cell order is:

```text
576:
  P3 → P6 → P8

1152:
  P8 → P6 → P3
```

The following are outside the S1 primary execution:

```text
72 / 144 / 288 / 2304 / 4608 strands
forced WEBGL2
20-sample confirmation
additional devices
Safari / WebKit
R2B transport
density, color or rotation mutation
GPU timing
memory probes
```

No S1 verification-smoke workload is defined. Dirty or unmerged S1 source is
not decision-bearing and must not unlock or run the six-cell primary workload.
The existing R2C-A v0.3 72×6 verification smoke remains a v0.3 facility and
must not be relabelled as S1 evidence.

## 6. Input contract and six-point control

S1 input is an immutable, deeply validated, BENCHMARK_ONLY graph. It supports
only:

```text
strandCount:
  576 | 1152

pointsPerStrand:
  3 | 6 | 8

seed:
  20260808

generator version:
  r2ca-s1-synthetic-generator/v1

geometry recipe:
  RADIAL_CROWN_FALL_V1

default width:
  0.028

canonicalR2BBundle:
  false
```

Coordinate, width, rank, ID uniqueness, object-identity, bounds and immutability
rules are inherited from the parent benchmark input unless this section makes
them narrower.

The S1 input must not enter canonical `StrandAsset`, the R2B manifest/binary
compiler, `loadDiagnosticStrandBundle`, product storage or any customer path.

The distinct S1 generator must not masquerade as the frozen parent
`r2ca-synthetic-generator/v1`. It preserves the same geometry family and seed,
but its admitted point axis and generator identity are S1-specific.

For the same seed and strand count, S1 `pointsPerStrand = 6` must match the
parent v0.3 generator for every shared semantic field:

- every control-point tuple;
- every strand ID;
- width;
- density rank;
- importance rank;
- material group;
- coordinate system;
- default width; and
- derived bounds.

Whole-object or byte identity is neither required nor permitted as the
equivalence definition because S1 has a distinct schema, experiment and
generator identity. Only the shared semantic fields listed above are compared.

A behavior test must compare the generated S1 six-point graph with the parent
v0.3 six-point graph at both 576 and 1152. A copied fixture or separately
maintained expected table is insufficient; the test must compare both live
generators and fail on drift.

The later implementation reconnaissance must first seek a sibling S1 generator
that reproduces those shared fields without changing the frozen parent module.
If sharing requires a parent refactor, §18 controls that exception.

## 7. AUTO-only backend policy

The dependent metric is primarily `geometryCreateCpuMs`. Current source uses
the same benchmark geometry construction path for AUTO-resolved and forced
WebGL2 profiles, and parent A1 found the same GEOMETRY_CREATE dominance on
WEBGPU and WEBGL2. Duplicating all S1 cells across requested profiles would
repeat the same CPU mechanism without answering a new question.

Every cell records:

```text
requestedBackend:
  AUTO

actualBackend:
  WEBGPU | WEBGL2
```

The actual backend established by the first successful warm-up must remain
stable across the entire S1 session, including all warm-ups and measured
samples at both strand counts. Any change is `AUTO_BACKEND_DRIFT` and stops the
S1 session before geometry creation for the drifting sample. Cells from
different actual backends must never be pooled.

Because S1 has one requested backend profile, a profile-terminal failure is
also session-terminal. Retain the partial result and do not advance to another
cell.

## 8. Fixed visual and renderer conditions

Every sample inherits the fixed parent stimulus:

```text
preview color:
  #34251F

density:
  HIGH

rotation:
  yaw 0
  pitch 0

CSS viewport:
  800 × 600

renderer DPR cap:
  2

tube segments per control span:
  3

radial segments:
  4
```

No visual-state axis is varied or timed as an independent S1 factor.

P3 and P8 are perturbation probes, not visual-quality candidates. S1 provides
no authority to conclude that three points are visually sufficient, that eight
points improve quality, or that three points should replace six in R3. Any
production control-point or fidelity choice requires separate visual and asset
evidence.

The benchmark renderer must continue using the current coupled path. S1 must
not introduce a special geometry builder, prebuilt geometry, cache or alternate
merge path that would make its cells incomparable within the session.

## 9. Measurement semantics

S1 inherits these exact parent metrics:

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

The meanings and aggregate stage ownership in parent Design v0.3 §6 remain
normative. In particular:

- each `*CpuMs` is synchronous application-owned CPU duration;
- `rendererInitWallMs` is awaited initialization wall duration;
- `candidateToLogicalReadyMs` begins immediately before candidate backend
  construction and ends immediately after successful logical reveal/commit;
- prior-backend disposal is excluded from logical-ready time;
- `teardownCpuMs` is disposal-call CPU time, not GC/GPU reclamation proof; and
- no per-strand timing callback or mark is allowed.

The primary S1 dependent metric is `geometryCreateCpuMs`.
`candidateToLogicalReadyMs` and its geometry-create share are supporting
context, not alternative disposition axes.

`benchmark-measurement.ts` requires no S1 semantic change.

## 10. Sampling and summaries

Each cell runs one successful warm-up followed by exactly five valid measured
samples. Warm-ups are not retained in metric summaries and are not pooled with
measured evidence.

For every metric, retain and exactly recompute from valid measured samples:

```text
count
median
minimum
maximum
raw values in execution order
```

Stopped, failed, invalidated or cancelled samples are not included in metric
summaries. A complete cell requires five valid measured samples, a stable
actual backend and final zero owned resources after every warm-up and measured
sample.

One fixed abortable animation-frame quiet boundary may separate samples. It is
not a measured metric or a browser-idleness evidence system.

## 11. Safety, failure and cleanup

S1 inherits without weakening:

```text
single synchronous owned stage:
  < 1000 ms

candidate-to-logical-ready:
  < 3000 ms

whole explicit session:
  < 15 minutes

final harness-owned resources after every sample:
  exactly zero
```

At or above a hard ceiling:

1. do not start the next owned stage;
2. allow an executing synchronous stage to return;
3. perform bounded cleanup;
4. retain partial in-memory evidence; and
5. stop the S1 session.

The parent cancellation, route-exit, page-visibility, viewport, DPR,
drawing-buffer, renderer-pixel-ratio, renderer/device failure, instrumentation,
logical-ready, commit/rollback and cleanup semantics remain normative.

Final owned-resource counts must be exactly zero for candidate hosts, active
hosts, canvases, observers, timers, animation-frame handles, backends and
benchmark geometry ownership. Nonzero cleanup invalidates the sample and stops
the session. This proves harness ownership cleanup only, not GC or GPU
reclamation.

Partial results preserve raw valid samples already completed and terminal
sample evidence. They receive no S1 prototype-target disposition.

## 12. Environment and provenance admission

The primary S1 session runs on the same declared primary-reference Mac class
under this controlled state:

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

concurrent intentional heavy workloads:
  none
```

The operator declaration is an explicit admission input. A primary run must
reject a nonmatching browser engine, OS/architecture, device class, power mode
or low-power state before the first sample.

At explicit S1 Start, reuse the guarded same-origin run-start provenance
mechanism without reusing the parent generator identity.
The source checkout must be clean and HEAD must equal freshly fetched local
`origin/main`. Record source commit, branch, tree state, Next.js version,
Three.js version, the distinct S1 generator version, recipe and seed.

No source edit, branch change or dependency change may occur during the S1
session.

Parent A1 ran on `AC_POWER` with Low Power Mode `ON`; primary S1 runs on
`AC_POWER` with Low Power Mode `OFF`. Absolute S1 P6 latency must not be
compared with absolute A1 P6 latency as a performance improvement or
regression. S1 P6 cells are the same-session sensitivity baselines for P3 and
P8. A1 remains parent evidence only for selecting 576/1152 and
`GEOMETRY_CREATE` as the S1 focus.

## 13. Result v1 contract

The S1 local JSON identity is:

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
```

Required top-level groups are:

```text
source
environment
sessionConfiguration
cells
analysis
outcome
stopReason
warnings
```

For a complete valid result, `analysis` contains exactly one recomputed entry
for each strand count plus one of the three dispositions in §15. For a partial,
stopped, failed, invalidated or cancelled result, `analysis.disposition` is
`null`; any summaries emitted for already complete cells remain descriptive
only and must still recompute from their raw evidence.

The bounded warning vocabulary is:

```text
AUTO_DID_NOT_SELECT_WEBGPU
```

It is present exactly when a successfully established stable AUTO backend is
WEBGL2. An empty warning list is valid when AUTO established WEBGPU or no
actual backend was established before termination. Warnings are unique and do
not replace outcome or stop-reason evidence.

`sessionConfiguration` must freeze the exact axes, order, sampling counts,
visual state and ceilings in this contract.

Every cell must retain:

```text
strandCount
pointsPerStrand
controlSpansPerStrand
tubularSegmentsPerStrand
tubeSegmentsPerControlSpan
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

The validator must reject:

- an unknown schema, version, experiment, contract or classification;
- any non-S1 strand/point/backend axis or wrong cell order;
- a `controlSpansPerStrand` value inconsistent with `P - 1`;
- a `tubularSegmentsPerStrand` value inconsistent with `(P - 1) × 3`;
- a `tubeSegmentsPerControlSpan` value other than 3;
- a `radialSegments` value other than 4;
- duplicate or missing cells in a complete result;
- fewer or more than five valid measured samples in a complete cell;
- nonfinite or negative timing values;
- missing required metrics in valid samples;
- summary values that do not exactly recompute from raw valid values;
- actual-backend drift or requested/actual inconsistency;
- valid evidence with nonzero cleanup;
- terminal outcome/stop-reason contradictions;
- invalid environment/provenance admission; and
- analysis values or disposition that do not exactly recompute from complete
  raw cell evidence.

Serialization must be deterministic two-space JSON plus one final LF. Use an
S1-specific filename. Result v1 must never validate or serialize through the
R2C-A Result v2 validator.

## 14. Primary analysis

Analysis is performed separately for 576 and 1152 strands from the raw five
valid measured samples in each cell. Do not pool strand counts.

For each strand count compute:

```text
G3 = median geometryCreateCpuMs at P3
G6 = median geometryCreateCpuMs at P6
G8 = median geometryCreateCpuMs at P8

R3 = G3 / G6
R8 = G8 / G6
```

The validator requires `G6 > 0` before ratios or a disposition are emitted.
Use full finite values for all comparisons; presentation rounding must not
change a gate result.

Also report per strand count:

- whether strict median ordering `G3 < G6 < G8` holds;
- the inclusive `[minimum, maximum]` range of the five raw
  `geometryCreateCpuMs` values for P3, P6 and P8;
- median `candidateToLogicalReadyMs` for P3, P6 and P8; and
- geometry-create share for each cell, defined exactly as
  `median(geometryCreateCpuMs) / median(candidateToLogicalReadyMs)`.

The logical-ready median must be greater than zero before its share is emitted.

The `0.75` and `1.15` values are pre-registered exploratory engineering
decision gates. They are not statistical-significance thresholds, do not
estimate a physical coefficient and do not convert five samples per cell into
confirmatory evidence. Raw five-sample values, ranges and medians remain the
evidence.

For deterministic threshold-stability review, also compute:

```text
P3 ratio range =
  [minimum(P3) / G6, maximum(P3) / G6]

P8 ratio range =
  [minimum(P8) / G6, maximum(P8) / G6]
```

A gate is threshold-proximate/unstable when its threshold (`0.75` for P3 or
`1.15` for P8) lies inside the corresponding inclusive raw ratio range at
either strand count. Threshold proximity, nonmonotonic medians, unstable raw
ranges or disagreement between 576 and 1152 routes the complete result to
`MIXED_OR_NONLINEAR`, even if rounded medians appear to cross a sensitivity
gate.

S1 must not add p-values, confidence intervals, p90 or a larger sample
campaign. A need for those is a separately contracted follow-up, not an S1
extension.

An optional exploratory ordinary least-squares fit may use the three
`(tubularSegmentsPerStrand, G)` points independently at each strand count:

```text
x:
  6 / 15 / 21

y:
  G3 / G6 / G8
```

If reported, label the slope/intercept/fit as descriptive only. It is not a
physical decomposition of point parsing, curve fitting or tessellation cost
and does not participate in disposition gates.

## 15. Pre-registered prototype-target disposition

Exactly one disposition may be emitted only for a complete, valid six-cell
result.

Evaluate the §14 stability conditions first. Any threshold-proximate/unstable
raw range, nonmonotonic median order or disagreement between 576 and 1152 is
`MIXED_OR_NONLINEAR`; A or B cannot override it.

### 15.1 `COUPLED_POINT_TESSELLATION_SENSITIVE`

Use only when both 576 and 1152 independently satisfy all of:

```text
G3 <= 0.75 × G6
G8 >= 1.15 × G6
G3 < G6 < G8
```

Interpretation:

```text
GEOMETRY_CREATE is materially sensitive to the current coupled
control-point / longitudinal-tessellation complexity.
```

Next R2C-B prototype target:

```text
CONTROL_POINT_VS_TESSELLATION_DECOUPLING
```

That future prototype holds one factor fixed while varying the other:

```text
factor 1:
  control-point count

factor 2:
  tubularSegments
```

It determines whether the useful remedy target is control-point
representation, longitudinal TubeGeometry tessellation, both or another
interaction. S1 does not answer that decomposition and does not directly
select adaptive tessellation, fixed lower tubular segments or point reduction.
It does not authorize permanently reducing control-point fidelity.

### 15.2 `WEAK_COUPLED_COMPLEXITY_SENSITIVITY`

Use only when both 576 and 1152 independently satisfy:

```text
G3 > 0.75 × G6
G8 < 1.15 × G6
```

Interpretation:

```text
Large changes in the coupled point/tessellation complexity do not explain most
of the observed GEOMETRY_CREATE cost.
```

Next R2C-B prototype target:

```text
PER_STRAND_FIXED_CONSTRUCTION_OVERHEAD
```

That prototype may investigate per-strand TubeGeometry construction,
per-strand object/allocation overhead, batch/packed geometry construction and
assembly overhead. S1 has not proven which fixed-cost mechanism dominates, and
no durable architecture is selected.

### 15.3 `MIXED_OR_NONLINEAR`

Use for every other complete valid result, including:

- only one strand count crossing sensitivity gates;
- nonmonotonic P3/P6/P8 medians;
- P3 strongly reducing cost without P8 rising materially;
- P8 rising without P3 reducing materially; or
- threshold proximity or raw ranges/noise making the threshold interpretation
  unstable.

Next R2C-B prototype target:

```text
NONE — DO NOT SELECT A REMEDY
```

Instead contract the smallest `CONTROL_POINT_VS_TESSELLATION_DECOUPLING`
factorial experiment that independently varies control-point count and
`TubeGeometry.tubularSegments` before selecting a remedy target.

The three rules are evaluated in the order written. Their strict/non-strict
boundaries are exact and mutually exhaustive through the MIXED fallback.

## 16. Evidence and persistence boundary

S1 evidence is one explicit local JSON download only.

It must retain:

- all five raw measured samples per complete cell;
- summaries and analysis recomputable from raw values;
- strand count, point count, control spans, segments per control span, derived
  tubular segments and fixed radial segments;
- requested and actual backend;
- source provenance and controlled environment;
- per-sample and per-cell cleanup truth;
- outcome and stop reason; and
- warnings.

There is no database persistence, local-storage persistence, telemetry, upload,
clipboard requirement or external benchmark request.

No automatic download is allowed. The operator explicitly starts the session
and explicitly downloads the JSON.

## 17. Operator surface and lifecycle

Reuse the protected internal surface:

```text
/admin/render-lab/performance
```

The existing route-local `requireAdmin()` and dynamic client-only boundary
remain unchanged. Add an explicit S1 start control and separate S1 result label
and download filename. Do not add navigation.

The surface must make clear which experiment will run and must continue to
display:

```text
BENCHMARK_ONLY
VISUAL_ONLY
EXPLORATORY CHARACTERIZATION
NOT PRODUCT TRUTH
NOT FIT EVIDENCE
NOT A PRODUCTION BUDGET
NOT A MANUFACTURING SPECIFICATION
```

Page load must not start R2C-A or S1. Existing R2C-A v0.3 Start, smoke and
Result v2 behavior remain distinct and unchanged.

Cancellation and route exit abort the active experiment and own the same
bounded cleanup. Only one benchmark session may run at a time on the page.

## 18. Implementation reconnaissance and non-authorizing path candidates

Reconnaissance was performed at source baseline
`5c3a072f74dc4114138ca9cf28c447b193c55369`.

### 18.1 Current source findings

| Path/surface | Current truth | S1 consequence |
| --- | --- | --- |
| `src/lib/rendering/benchmark-input.ts` | v0.3 levels, parent generator identity and six points are exact validator authority; the deterministic recipe is embedded in the six-point constructor. | Do not assume a modification. Prefer a sibling S1 input/generator that proves shared-field P6 equivalence. Audit a shared-recipe refactor only if sibling construction cannot preserve one truth source. |
| `src/lib/rendering/benchmark-result.ts` | Result v2 hard-codes schema, contract, points, AUTO+WEBGL2 axes, schedule and sample cardinality. | Do not modify or widen it by default. Add a separate S1 Result v1 module and mutual-rejection tests. |
| `src/lib/rendering/benchmark-runner.ts` | One fixed v0.3/smoke orchestrator owns provenance admission, lifecycle, sampling, environment invalidation and cleanup. | Do not assume a modification. Prefer a sibling S1 runner that reuses unchanged lower-level measurement/provenance primitives; audit extraction only if necessary to avoid duplicated lifecycle truth. |
| `src/lib/rendering/benchmark-measurement.ts` | Owns the exact stages, clock semantics, quiet boundary and three ceilings needed by S1. | Reuse unchanged. |
| `src/lib/rendering/renderer-backend.ts` | Benchmark creation already derives tubular segments from point count, keeps radial segments at 4 and uses the same geometry seam for both actual backends. The benchmark interface is typed to the parent input. | Reconnoiter the smallest generic benchmark-only adapter/seam that can accept the sibling S1 input without changing normal R1/R2B or v0.3 runtime semantics. A source change is conditional, not pre-authorized here. |
| `src/components/rendering/RenderPerformanceLab.tsx` | Exposes only v0.3 characterization/smoke and Result v2. | A later task will need an explicit, separately labelled S1 start/result/download surface, but reconnaissance must first lock whether this is one shared component or an S1 sibling client component. |
| `src/app/admin/render-lab/performance/page.tsx` and `RenderPerformanceClient.tsx` | Already provide route-local admin authorization and `ssr:false` client loading. | No change required. |
| `src/app/admin/render-lab/performance/actions.ts` and `benchmark-provenance.server.ts` | Provide the guarded local Git/package provenance mechanism but expose the frozen parent generator identity. | Prefer unchanged Git/package provenance primitives plus an S1 sibling identity adapter. Do not report the parent generator identity as the S1 generator. |
| Current tests | Lock v0.3 input, Result v2, runner schedule/stops, renderer transaction, provenance, admin and isolation boundaries. | Keep them green; add independent S1 behavior tests and expand boundary coverage to the new S1 paths. |

### 18.2 Non-authorizing implementation-recon path set

The following paths are candidates for the later read-only implementation
reconnaissance. Listing them does not authorize edits and does not freeze an
implementation architecture.

```text
PREFERRED S1 SIBLINGS TO ASSESS
  src/lib/rendering/benchmark-point-sensitivity-input.ts
  src/lib/rendering/benchmark-point-sensitivity-result.ts
  src/lib/rendering/benchmark-point-sensitivity-runner.ts
  src/lib/rendering/__tests__/benchmark-point-sensitivity-input.test.ts
  src/lib/rendering/__tests__/benchmark-point-sensitivity-result.test.ts
  src/lib/rendering/__tests__/benchmark-point-sensitivity-runner.test.ts

UNCHANGED PRIMITIVES TO REUSE FIRST
  src/lib/rendering/benchmark-measurement.ts
  src/lib/rendering/benchmark-provenance.server.ts
  src/app/admin/render-lab/performance/actions.ts

GENERIC RENDERER / OPERATOR SEAMS TO ASSESS
  src/lib/rendering/renderer-backend.ts
  src/components/rendering/RenderPerformanceLab.tsx
  src/app/admin/render-lab/performance/RenderPerformanceClient.tsx
  src/lib/rendering/__tests__/renderer-benchmark-instrumentation.test.ts
  src/lib/rendering/__tests__/prototype-boundary.test.ts

FROZEN-v0.3 MODULES TO READ, NOT PRESUME MODIFICATION
  src/lib/rendering/benchmark-input.ts
  src/lib/rendering/benchmark-result.ts
  src/lib/rendering/benchmark-runner.ts
  src/lib/rendering/__tests__/benchmark-input.test.ts
  src/lib/rendering/__tests__/benchmark-result.test.ts
  src/lib/rendering/__tests__/benchmark-runner.test.ts
```

The later reconnaissance must prefer new S1 sibling input/result/runner modules,
reuse unchanged measurement/provenance primitives and identify only the
smallest generic renderer adapter/seam required. It then returns a separate,
exact implementation task scope for approval.

If an existing frozen-v0.3 module must be refactored for sharing, the later
task must separately justify that path and require:

- no semantic change to v0.3;
- byte or behavioral regression tests where applicable;
- unchanged A1 Result v2 meaning and validation;
- unchanged parent six-point generator identity and output; and
- full v0.3 regression verification.

No package, lockfile, config, Prisma, storage, canonical R2B or customer-path
change is anticipated. A need for one stops reconnaissance and requires a
revised design/task contract; this Design Contract does not grant it.

## 19. Later implementation verification gate

The later source task must behavior-test at least:

- exact S1 input axes and rejection of every other point/strand count;
- exact `r2ca-s1-synthetic-generator/v1` identity and rejection of the parent
  generator identity as S1 identity;
- deterministic generation and deep immutability;
- exact P6 shared-field equivalence from §6 to v0.3 at 576 and 1152, without
  requiring whole-object/byte identity;
- exact 3→6, 6→15 and 8→21 tubular-segment derivation used by the renderer;
- fixed `tubeSegmentsPerControlSpan = 3` and `radialSegments = 4` in input,
  construction and Result v1 evidence;
- exact six-cell counterbalanced order;
- AUTO-only requested backend and stable actual backend;
- one warm-up plus five measured samples per cell;
- unchanged stage meanings and hard ceilings;
- stop-before-geometry on AUTO drift;
- session stop on any profile-terminal failure;
- visibility/viewport/DPR/drawing-buffer/pixel-ratio invalidation;
- cancellation and route-exit cleanup;
- exactly zero final owned resources after every sample;
- partial-result retention without a disposition;
- Result v1 exact-shape and axis validation;
- summary, ratio, threshold-stability, share and disposition recomputation from
  raw evidence;
- Result v1 / Result v2 mutual rejection;
- explicit S1 start and no automatic run;
- no persistence, telemetry, upload, external request or navigation;
- no canonical R2B/customer import edge; and
- unchanged v0.3 source behavior, parent generator identity, Result v2 meaning
  and full existing regression suite.

Run `npm run verify` and the proportionate production build/static boundary
checks required by the parent source task. Do not run the six-cell primary S1
workload during implementation or in CI.

After reviewed implementation merge, install the distinct S1 Source Status /
As-Built record:

```text
docs/engineering/render-runtime-point-sensitivity-source-status-v0.1.md
```

S1 primary execution is not authorized until that record is reviewed and
merged. Then execute S1 only from a freshly fetched, clean, current-main
checkout under the controlled environment in §12. Preserve the local Result v1
artifact for independent review before opening an R2C-B prototype task.

## 20. Known limits

S1 cannot establish:

- independent control-point, curve-fit or tessellation cost;
- product-realistic point count or hair fidelity;
- whether P3 is visually sufficient, P8 improves quality or either should
  replace P6 in R3;
- a production performance budget;
- behavior above 1152 strands or outside P3/P6/P8;
- forced-WebGL2 sensitivity in this follow-up;
- cross-device or cross-browser portability;
- transport, GPU completion, presentation, memory or sustained-FPS behavior;
- absence of GC/GPU leaks; or
- whether a prototype remedy should become durable.

## 21. Rollback

Runtime rollback stops before the next owned stage, allows an executing
synchronous stage to return, performs bounded cleanup and retains only the
partial in-memory S1 result until explicit download or route exit.

Source rollback removes the S1 input/result/tests and S1 operator entry point,
and restores any shared benchmark refactor while preserving the installed
R2C-A v0.3 and normal R1/R2B renderer paths.

There is no S1 database, storage, telemetry, uploaded artifact or customer
state to migrate or purge.

## 22. Next gate

This first pass authorizes documentation only.

After independent review and merge of this contract, a fresh read-only
implementation reconnaissance must assess §18.2 and return a separate exact
implementation task scope. This contract does not itself authorize any source
path. The later workflow must not execute S1, select a durable R2C-B
architecture or activate any product path.

After reviewed S1 implementation merge, create the distinct S1 Source Status /
As-Built record:

```text
docs/engineering/render-runtime-point-sensitivity-source-status-v0.1.md
```

Do not rewrite
`docs/engineering/render-runtime-scaling-measurement-source-status-v0.1.md` to
impersonate later S1 source truth. The parent R2C-A Source Status remains
historical/source authority for its own reviewed merge; later S1 implementation
truth receives its own record. S1 primary execution is not authorized until
the S1 Source Status is reviewed and merged.

The S1 Result v1 then requires independent evidence review before one
pre-registered prototype-target disposition can authorize a separate bounded
R2C-B prototype task.
