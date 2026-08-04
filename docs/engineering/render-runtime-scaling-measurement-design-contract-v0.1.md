# Render Runtime Scaling Measurement Design Contract v0.1

## Status

```text
DOCUMENT CLASS:
  DESIGN / EXPERIMENT CONTRACT

FEATURE STANDARD CLASSIFICATION:
  MEDIUM

STATUS:
  FROZEN v0.1 — SOURCE IMPLEMENTATION NOT AUTHORIZED

TASK CLASSIFICATION:
  SOURCE_ONLY / EVIDENCE_COLLECTION

PARENT SOURCE STATUS:
  docs/engineering/strand-bundle-async-loader-source-status-v0.1.md

PARENT SOURCE-STATUS MERGE:
  PR #32
  3cb1d48e95000759ac8259d7dd931a5dd097c9c7

CUSTOMER / PRODUCT / FIT / COMMERCE / MANUFACTURING ACTIVATION:
  NONE

CHANGE CONTROL:
  supersedes: none | superseded-by: none
```

## 1. Purpose

R2C-A characterizes the installed browser renderer and R2B control path before
Mira selects a scaling remedy.

The experiment must answer:

```text
At what admitted synthetic scale does the installed renderer become materially
limited on each tested environment/backend profile, and which owned stage is
the first material bottleneck?
```

R2C-A gathers evidence. It does not pre-authorize or preselect:

- a packed canonical asset;
- direct GPU-buffer ingestion;
- importance-based LOD;
- a worker;
- instancing;
- glTF/GLB;
- a new renderer;
- an expanded canonical bundle;
- a learned producer;
- product, fit, customer or manufacturing integration.

A measured bottleneck can justify a later design task. It does not itself
authorize the remedy.

## 2. Human adjudication of reconnaissance

The read-only reconnaissance
`WIG-REN-WEB-R2CA-COD-R0-SCALING-RECON-v0.1` is accepted with these decisions.

### 2.1 Benchmark surface

```text
SELECT:
  dedicated /admin/render-lab/performance surface

REQUIRE:
  route-local server admin guard before client benchmark code

REQUIRE:
  dynamic client-only benchmark module

REQUIRE:
  no navigation link

REQUIRE:
  explicit operator start

REJECT:
  ordinary Render Lab benchmark mode

REJECT:
  console/snippet evidence

REJECT:
  high-load CI benchmarks
```

### 2.2 Scale-input boundary

```text
SELECT:
  distinct validated RendererBenchmarkInput

REQUIRE:
  BENCHMARK_ONLY identity

REQUIRE:
  unique strand and control-point objects

REQUIRE:
  separate benchmark validator and hard cap

REQUIRE:
  benchmark-only renderer factory/entry

REJECT:
  increasing R2B bundle or StrandAsset limits

REJECT:
  casting or structurally lying that benchmark input is StrandAsset

REJECT:
  unchecked input

REJECT:
  repeated shared strand-object references

REJECT:
  hiding primary input generation inside the renderer
```

### 2.3 Measurement policy

```text
PRIMARY TIMING:
  application-owned CPU/wall-clock stages through User Timing

GPU TIMESTAMP:
  excluded from R2C-A v0.1

GPU MEMORY:
  excluded; no true-GPU-memory claim permitted

UA-SPECIFIC MEMORY:
  optional only when already available and cross-origin isolated

CROSS-ORIGIN ISOLATION CHANGE:
  not authorized merely to obtain memory evidence

LONG TASK:
  optional capability-detected corroboration

RESULT PERSISTENCE:
  none

RESULT EXPORT:
  explicit local copy/download JSON only
```

### 2.4 Scale and safety

```text
AUTOMATIC STRAND CAP:
  1,152

MANUAL EXTENSION:
  2,304 and 4,608 only after 1,152 passes in the same environment/backend

HARD TYPED-ARRAY LOWER-BOUND CAP:
  64 MiB

SINGLE SYNCHRONOUS STAGE SAFETY CEILING:
  1,000 ms

CANDIDATE-TO-LOGICAL-READY SAFETY CEILING:
  3,000 ms

SEVERE LONG-TASK WARNING/STOP:
  1,000 ms when supported

WHOLE USER-STARTED RUN CEILING:
  15 minutes
```

These are browser-safety ceilings, not customer performance targets or
production budgets.

### 2.5 Sampling

```text
WARM-UP:
  2 per admitted cell

INITIAL MEASURED SAMPLES:
  7 per admitted cell

INITIAL SUMMARY:
  count, median, minimum, maximum and raw samples

INITIAL P90:
  prohibited; serialize null with reason INSUFFICIENT_SAMPLE_COUNT
```

When an R2C-B decision would depend on one cell, threshold, ranking reversal or
backend comparison, the operator may start a separate confirmatory run with:

```text
CONFIRMATORY MEASURED SAMPLES:
  20

CONFIRMATORY P90:
  nearest-rank method
  sorted value at rank ceil(0.90 × N)
```

Initial and confirmatory samples may not be pooled.

### 2.6 Lifecycle cycles

```text
72-strand lifecycle run:
  20 cycles

highest admitted level:
  5 cycles initially

optional high-level confirmation:
  20 cycles only by a separate explicit operator action
```

Lifecycle cycles are cleanup evidence, not timing samples and not proof of
leak absence.

### 2.7 Minimum evidence matrix before R2C-B

A later architecture decision requires at least:

- two operator-declared device classes;
- one materially lower-capability device than the primary device;
- Chromium-family and Safari/WebKit browser engines;
- requested and actual backend recorded independently;
- an AUTO-versus-forced-WebGL2 comparison only where AUTO actually selects
  WebGPU;
- equal workload, CSS viewport and actual drawing-buffer dimensions for pooled
  comparison.

One high-end MacBook run is exploratory only.

### 2.8 Viewport

```text
CSS viewport:
  fixed 800 × 600

device-pixel-ratio policy:
  retain current renderer cap of 2

comparability:
  actual drawing-buffer width/height must match
```

A viewport, drawing-buffer or DPR change during a run invalidates the active
sample/run.

## 3. Scope

R2C-A may install:

- one admin-only benchmark page;
- one code-split client benchmark surface;
- one distinct in-memory benchmark-input model and validator;
- one deterministic synthetic benchmark generator;
- one benchmark orchestration and safety state machine;
- one versioned in-memory/downloadable result schema;
- aggregate optional renderer instrumentation;
- focused tests;
- manual browser measurement evidence.

R2C-A must not add:

- database or persistent state;
- telemetry or automatic upload;
- local-storage result persistence;
- external network contact;
- new production assets;
- expanded R2B manifest/binary limits;
- new R2B fixture files;
- output-tracing changes for larger assets;
- customer routes or navigation;
- Product Media, product, variant, fit, order or manufacturing identity;
- LOD behavior;
- learned inference or generation;
- source activation beyond the existing admin diagnostic.

## 4. Installed R2B control versus synthetic renderer scale

R2C-A owns two distinct measurement families.

### 4.1 Installed R2B control

The installed 72-strand bundle is the only transport control.

It may measure:

```text
installedControlLoadToLogicalReadyMs
```

with environment, cache/resource state, requested mode and actual backend
recorded.

R2C-A must not claim separately measured manifest read, SHA-256, decode or
large-bundle transport scaling unless a later contract changes R2B
instrumentation.

R2C-A must not alter the control fixture, route, loader limits or source-status
facts.

### 4.2 Synthetic renderer workload

A synthetic benchmark workload is:

```text
classification:
  BENCHMARK_ONLY

canonical R2B bundle:
  false

product / fit / order / manufacturing meaning:
  none
```

It exists only in the benchmark route.

It may exceed 96 strands only through the separately validated benchmark input.
It must never enter:

- the R2B route;
- the R2B manifest/binary compiler;
- `loadDiagnosticStrandBundle`;
- `validateStrandAsset`;
- a product or persisted asset registry.

## 5. Benchmark input contract

The source implementation must define a distinct branded input such as
`RendererBenchmarkInput`.

The exact name may vary, but the type and validator must enforce:

```text
classification:
  BENCHMARK_ONLY

strandCount:
  one admitted ladder value, hard maximum 4,608

pointsPerStrand:
  exactly 3, 6 or 8 according to workload cell

coordinate components:
  finite
  absolute value <= 10

width:
  finite
  > 0 and <= 0.08

densityRank:
  finite and in [0, 1)

importanceRank:
  finite and in [0, 1)

strand IDs:
  benchmark-local, unique and bounded

object identity:
  every strand and control-point tuple is a unique object
```

The generator must be deterministic for:

- generator version;
- seed;
- strand count;
- points per strand;
- geometry recipe.

The benchmark validator must reject:

- canonical R2B schema/version/asset identity masquerading;
- unsupported strand counts;
- shared strand or control-point object references;
- malformed numerics;
- product, fit, order or manufacturing identity fields.

## 6. Harness and authorization

The surface is:

```text
/admin/render-lab/performance
```

Required behavior:

- inherited `/admin/**` middleware;
- server-side `requireAdmin()` before benchmark client code is rendered;
- fail closed under existing admin-page conventions;
- client module loaded dynamically with `ssr: false`;
- no customer or admin navigation link in R2C-A;
- no automatic run on page load;
- no run while the page is hidden;
- no background continuation after route exit;
- no DB, telemetry or third-party request;
- no result persistence after page lifecycle except an explicit downloaded or
  copied JSON artifact.

The page must visibly state:

```text
BENCHMARK_ONLY
VISUAL_ONLY
NOT PRODUCT TRUTH
NOT FIT EVIDENCE
NOT A PRODUCTION BUDGET
NOT A MANUFACTURING SPECIFICATION
```

## 7. Renderer instrumentation boundary

R2C-A may add one benchmark-only renderer factory/entry and one optional
aggregate observer.

Normal R2B renderer creation must remain observer-free unless the caller
explicitly selects the benchmark entry.

Required aggregate stages:

```text
SCENE_SETUP
RENDERER_INIT
GEOMETRY_SELECT
GEOMETRY_CREATE
GEOMETRY_MERGE
GEOMETRY_FINALIZE
RENDER_SUBMIT
DISPOSE
```

Rules:

- no per-strand callback or mark;
- no global client instrumentation;
- no direct access to Three.js backend/device/query-pool internals;
- no semantic reordering of renderer work;
- normal R2B behavior and tests must remain unchanged;
- instrumentation exceptions must fail the benchmark sample, not normal R2B.

The implementation may extract pure helpers only when required to time an
honest aggregate stage. It must not duplicate a second renderer architecture.

## 8. Metric vocabulary

### 8.1 Required metrics

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
colorMutationCpuMs
colorToRenderSubmitMs
rotationMutationCpuMs
rotationToRenderSubmitMs
densityLowSelectCpuMs
densityLowCreateCpuMs
densityLowMergeCpuMs
densityLowFinalizeCpuMs
densityLowToRenderSubmitMs
densityMediumSelectCpuMs
densityMediumCreateCpuMs
densityMediumMergeCpuMs
densityMediumFinalizeCpuMs
densityMediumToRenderSubmitMs
densityHighSelectCpuMs
densityHighCreateCpuMs
densityHighMergeCpuMs
densityHighFinalizeCpuMs
densityHighToRenderSubmitMs
modeReplacementToLogicalReadyMs
teardownCpuMs
totalSampleWallMs
typedArrayLowerBoundBytes
drawCalls
triangles
activeGeometries
```

Meaning restrictions:

- `*CpuMs` records synchronous CPU-owned duration only;
- `rendererInitWallMs` is the awaited `renderer.init()` duration;
- `firstRenderSubmitCpuMs` is synchronous renderer submission only;
- `candidateToLogicalReadyMs` is not paint, presentation or GPU completion;
- `teardownCpuMs` is disposal-call time, not proof of GC or GPU reclamation;
- typed-array bytes are a deterministic lower-bound estimate, not JS heap or
  GPU memory.

### 8.2 Optional metrics

When supported:

```text
longTaskCount
longTaskTotalMs
longTaskMaxMs
uaSpecificMemoryBeforeBytes
uaSpecificMemoryAfterBytes
deviceMemoryGiB
```

Optional values must carry one of:

```text
AVAILABLE
UNSUPPORTED_METRIC
NOT_ADMITTED
FAILED_OPTIONAL_PROBE
```

`measureUserAgentSpecificMemory()` may be called only when the existing page is
already secure and cross-origin isolated. R2C-A must not add isolation headers
to make it available.

### 8.3 Rejected metrics

R2C-A v0.1 must not emit:

```text
gpuTimeMs
gpuMemoryBytes
presentationTimeMs
stableFps
```

It must not use deprecated `performance.memory`.

It may record actual renderer backend and public renderer counters, but must
not reach through version-coupled Three.js internals.

## 9. User Timing ownership

Owned stages must use one versioned measurement helper based on:

```text
performance.mark()
performance.measure()
```

`performance.now()` may be used only inside that helper or where an async
duration cannot be represented without changing current behavior.

Every mark and measure name must include:

- benchmark schema/version;
- run ID;
- sample ordinal;
- workload cell;
- stage name.

The helper must clear owned marks and measures after the sample is serialized.

A measurement instrumentation failure invalidates the sample and must not
silently fall back to an unlabelled duration.

## 10. Workload matrix

### 10.1 Installed control

```text
strand count:
  72

points per strand:
  6

requested modes:
  AUTO
  forced WEBGL2

samples:
  2 warm-up + 7 measured
```

### 10.2 Synthetic primary ladder

At six points per strand:

```text
AUTOMATIC:
  72
  144
  288
  576
  1,152

MANUAL-ONLY:
  2,304
  4,608
```

A higher level is admitted only after all prior automatic levels pass in the
same environment and actual backend profile.

Manual extension is locked until 1,152 passes.

### 10.3 Point-count secondary axis

Use:

```text
3
6
8 points per strand
```

at the highest strand level:

- passed by both compared actual backend profiles;
- not greater than 576.

### 10.4 Visual operations

Every synthetic timing cell begins from:

```text
preview color:
  #34251F

density:
  HIGH

rotation:
  yaw 0
  pitch 0
```

The implementation contract must freeze one alternate color and one alternate
rotation before source work. Those values are measurement stimuli only.

Each measured sample includes:

1. initial build and logical READY;
2. alternate color mutation and render submit;
3. alternate rotation mutation and render submit;
4. `LOW` density rebuild and render submit;
5. `MEDIUM` rebuild and render submit;
6. `HIGH` rebuild and render submit;
7. teardown.

## 11. Geometry lower-bound estimate

For the installed TubeGeometry parameters at six control points:

```text
tubular segments:
  15

radial segments:
  4

vertices per strand:
  80

indices per strand:
  360

position + normal + UV:
  32 typed-array bytes per vertex
```

Merged indices use 16-bit storage through 819 strands and 32-bit storage from
820 strands.

The benchmark must calculate and serialize:

- source typed-array lower bound;
- merged typed-array lower bound;
- peak source-plus-merged lower bound;
- index width.

The 64 MiB cap applies to the calculated peak lower bound.

The estimate explicitly excludes:

- JavaScript object overhead;
- temporary JavaScript index arrays;
- curve and frame objects;
- renderer state;
- GPU copies;
- browser and driver overhead.

## 12. Sampling and ordering

Per admitted cell:

```text
warm-up:
  2

measured:
  7
```

Rules:

- retain raw samples;
- do not combine warm-up and measured samples;
- do not include failed, aborted or safety-stop samples in summaries;
- summarize valid count, median, minimum and maximum;
- set p90 to `null`;
- set `p90UnavailableReason` to `INSUFFICIENT_SAMPLE_COUNT`;
- wait two animation frames plus 250 ms quiet time between samples;
- run strand levels in ascending order;
- stop on environment invalidation.

For a later confirmatory cell:

```text
measured:
  20

p90:
  nearest-rank ceil(0.90 × N)
```

A confirmatory run requires a separate operator start and must retain a
separate result set.

### 12.1 Backend-order counterbalancing

A decision-bearing environment requires two paired sessions:

```text
session A:
  AUTO then forced WEBGL2

session B:
  forced WEBGL2 then AUTO
```

If AUTO does not select WebGPU, no WebGPU-versus-WebGL2 conclusion is allowed
for that environment.

## 13. Safety and progressive admission

### 13.1 Hard ceilings

```text
automatic strand cap:
  1,152

hard peak typed-array lower-bound cap:
  64 MiB

single synchronous owned stage:
  1,000 ms

candidate-to-logical-READY:
  3,000 ms

severe long task:
  1,000 ms when observed

whole user-started run:
  15 minutes
```

### 13.2 Next-level prediction

Using only the immediately prior valid level, the next level is admitted only
when the deterministic/provisional estimate predicts:

```text
next slowest owned stage:
  <= 750 ms

next candidate-to-logical-READY:
  <= 2,250 ms

next peak typed-array lower bound:
  <= 64 MiB
```

The prediction method must be frozen in the implementation task and tested. It
may be conservative but must not extrapolate from failed samples.

### 13.3 Immediate stop/invalidation

Stop or invalidate on:

- explicit operator cancellation;
- backend/device loss;
- renderer initialization or submission failure;
- forced backend mismatch;
- page visibility becoming hidden;
- CSS viewport change;
- drawing-buffer change;
- DPR change;
- owned stage ceiling violation;
- READY ceiling violation;
- hard estimate cap violation;
- candidate/active host invariant failure;
- observer or disposal invariant failure;
- run-duration ceiling;
- benchmark instrumentation failure.

A currently executing synchronous geometry stage cannot be interrupted.
Cancellation means:

1. do not begin the next owned stage;
2. clean up immediately after the synchronous stage returns;
3. record `ABORTED_BY_USER` or the appropriate stop class.

## 14. Lifecycle measurement

### 14.1 Baseline lifecycle

At 72 strands:

```text
cycles:
  20
```

### 14.2 Highest admitted lifecycle

At the highest admitted level:

```text
initial cycles:
  5
```

A further 20-cycle high-level run requires a separate explicit operator start.

Each cycle verifies:

- one candidate at a time;
- active/candidate host counts;
- canvas count;
- observer ownership;
- backend-disposal count;
- final zero-owned-resource state.

Lifecycle evidence does not prove absence of leaks or GPU reclamation.

## 15. Environment record

Each exported result must contain:

```text
benchmark schema and version
measurement contract version
source commit
branch
clean/dirty state
R2B source-status version
Next.js version
Three.js version
browser/engine/version available to the app
OS/platform/architecture available to the app
operator device class
operator-declared power mode
operator-declared low-power state
hardwareConcurrency
deviceMemoryGiB or null
crossOriginIsolated
long-task capability
UA-specific memory capability
requested backend
actual backend
CSS viewport
drawing-buffer width/height
device pixel ratio
renderer pixel ratio
generator version
seed
strand count
points per strand
density sequence
warm-up and measured counts
stop reason
warnings and unsupported metrics
```

No result may contain:

- account or customer ID;
- IP address;
- persistent hardware identifier;
- face/photo data;
- product, fit, order or manufacturing identity.

A dirty source tree produces `ENVIRONMENT_CONTAMINATED` and is not
decision-bearing.

## 16. Result schema

```text
schema:
  mira.render-lab.r2ca-result

version:
  1

run.outcome:
  COMPLETE
  SAFETY_STOP
  ABORTED
  FAILED
  ENVIRONMENT_CONTAMINATED

sample.status:
  VALID
  FAILED
  ABORTED
  SAFETY_STOP
  INVALIDATED

workload.kind:
  INSTALLED_R2B_CONTROL
  SYNTHETIC_RENDERER

metric status:
  AVAILABLE
  UNSUPPORTED_METRIC
  NOT_ADMITTED
  FAILED_OPTIONAL_PROBE
```

The implementation contract must freeze the exact serialized field shape.

Results remain in memory until:

- copied to clipboard by an explicit operator action; or
- downloaded as a local JSON file by an explicit operator action.

No upload, DB write, local-storage persistence or automatic commit is
authorized.

## 17. Comparability rules

Results are directly comparable only when these match:

- result and measurement-contract versions;
- generator version and recipe;
- compatible source and Three.js versions;
- workload kind and cell;
- actual backend;
- browser engine and major version;
- OS/architecture;
- operator device class;
- CSS viewport;
- drawing-buffer dimensions;
- DPR and renderer pixel ratio;
- declared power/low-power state;
- sample class.

Do not pool:

- WebGPU and WebGL2;
- browser engines;
- different drawing buffers;
- warm-ups and measured samples;
- initial and confirmatory samples;
- failed/aborted samples;
- cached and uncached installed-control runs;
- memory values across browsers or browser versions.

## 18. Minimum evidence before an R2C-B decision

Source installation and one-device smoke testing are not sufficient.

Before `JUSTIFIED_FOR_DESIGN_CONTRACT` may be assigned to a scaling remedy,
the reviewed evidence set must include:

- at least two device classes;
- at least one lower-capability device;
- Chromium-family results;
- Safari/WebKit results;
- actual backend recorded;
- paired backend-order sessions where WebGPU-versus-WebGL2 is claimed;
- all raw valid samples;
- a complete stop/invalidation record;
- no unresolved lifecycle invariant failure.

A decision-critical cell must receive the 20-sample confirmatory run.

## 19. Decision dispositions

R2C-A result review assigns each possible next step one of:

```text
NOT_JUSTIFIED
MEASURE_MORE
JUSTIFIED_FOR_PROTOTYPE
JUSTIFIED_FOR_DESIGN_CONTRACT
```

Candidate next steps:

- optimize existing object/geometry path;
- lower TubeGeometry tessellation;
- add importance-based LOD;
- add precompiled asset tiers;
- add a packed intermediate;
- direct packed renderer ingestion;
- worker/off-main-thread preparation;
- custom binary evolution;
- glTF/GLB evaluation;
- no architecture change.

R2C-A does not implement any of these remedies.

## 20. Source forecast

The later implementation task is expected to remain within rendering/admin
paths and may include:

```text
src/app/admin/render-lab/performance/page.tsx
a route-local dynamically loaded client component
src/components/rendering/RenderPerformanceLab.tsx
a benchmark-only input/generator/validator module
a measurement/result/safety module
renderer-backend.ts minimal optional aggregate instrumentation
focused rendering/admin tests
```

Exact paths require a new implementation-task reconnaissance against the
installed contract.

Expected invariants:

- no package or lockfile change;
- no Prisma or storage;
- no R2B fixture or limit change;
- no refund-context change;
- no customer chunk/import edge;
- no navigation entry;
- no browser automation dependency.

## 21. Verification requirements for the later source task

Required source verification:

- deterministic benchmark generator;
- unique object identity;
- benchmark validator and escape prevention;
- geometry estimate and 820-strand index transition;
- exact stage ordering;
- optional instrumentation no-op on normal R2B;
- sampling and nearest-rank formulas;
- progressive admission and safety stops;
- hidden-tab/viewport/DPR invalidation;
- cancellation semantics;
- lifecycle ownership;
- result serialization and comparability;
- no persistence or telemetry;
- admin fail-closed boundary;
- no customer imports;
- R2B regression tests;
- typecheck, lint, full test, build and diff checks;
- refund-context invariance.

High-load measurement values are manual evidence and must not run in CI.

## 22. Rollback

Runtime stop:

1. do not start the next stage;
2. let a current synchronous stage return;
3. dispose candidate and active benchmark backends;
4. cancel timers, rAF and observers;
5. remove benchmark hosts and canvases;
6. retain only the in-memory aborted result until copy/download or route exit.

Source rollback removes the benchmark page, client surface, benchmark-only
modules, tests and optional instrumentation, restoring the exact R2B renderer
path.

No DB, storage, customer or benchmark-asset cleanup exists.

The Design Contract and historical result reports are not silently rewritten.

## 23. Known limits

R2C-A cannot establish:

- product-realistic strand count or visual quality;
- production performance budgets;
- expanded bundle transport behavior;
- true GPU memory;
- reliable GPU completion or presentation time;
- sustained animation FPS;
- universal cross-device behavior;
- performance above the highest admitted level;
- leak absence from bounded lifecycle cycles;
- whether any later remedy should be activated without a separate review.

## 24. Implementation gate

This contract does not authorize source implementation.

The next gate is a separate bounded Implementation Task Contract that must:

- verify synchronized `main`;
- map exact current source stages;
- freeze alternate color/rotation stimuli;
- freeze the next-level prediction formula;
- freeze the exact result JSON shape;
- bind the exact path set;
- preserve R2B limits and fixture bytes;
- require independent source/measurement review;
- prohibit commit/push in its first pass;
- require post-merge source-status;
- require a separate reviewed measurement-result report before R2C-B.
