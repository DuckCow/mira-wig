# Render Runtime Scaling Measurement Design Contract v0.3

## Status

```text
DOCUMENT CLASS:
  DESIGN / EXPERIMENT CONTRACT

FEATURE STANDARD CLASSIFICATION:
  MEDIUM

STATUS:
  FROZEN v0.3 — SOURCE IMPLEMENTATION NOT AUTHORIZED BY THIS DOCUMENT

TASK CLASSIFICATION:
  SOURCE_ONLY / EVIDENCE_COLLECTION

PARENT SOURCE STATUS:
  docs/engineering/strand-bundle-async-loader-source-status-v0.1.md

PARENT SOURCE-STATUS MERGE:
  PR #32
  3cb1d48e95000759ac8259d7dd931a5dd097c9c7

CUSTOMER / PRODUCT / FIT / COMMERCE / ORDER / MANUFACTURING ACTIVATION:
  NONE

CHANGE CONTROL:
  supersedes: render-runtime-scaling-measurement-design-contract-v0.2.md
  superseded-by: none
```

## 0. v0.3 scope reduction

v0.3 supersedes v0.2 because the decision-grade R2C-A framework became larger
than the question R2C-A actually needs to answer.

Independent source reviews and a fresh read-only scope audit showed that the
remaining implementation risk was increasingly dominated by:

- cross-run admission authority;
- installed-control evidence;
- lifecycle campaigns;
- confirmatory statistics;
- cross-result comparability;
- optional browser probes;
- provenance state machinery;

rather than by the core renderer-scaling measurement.

v0.3 therefore changes the role of R2C-A from a decision-grade benchmark
framework to a bounded exploratory characterization harness.

The result may justify a targeted R2C-B experiment. It does not by itself
select or authorize a durable renderer/asset architecture.

The network-ownership clarification from v0.2 remains inherited:

```text
R2C-A-owned external network contact:
  prohibited

R2C-A telemetry / upload / third-party benchmark asset fetch:
  prohibited

same-origin guarded run-start provenance action:
  allowed

pre-existing shared application-shell request outside R2C-A-owned paths:
  inherited environment evidence only when independently attributed

authority granted over that shared request:
  none
```

v0.1 and v0.2 remain historical and byte-stable.

## 1. Purpose

R2C-A answers one narrow question:

```text
As the current strand renderer scales through a bounded synthetic envelope,
which application-owned stage first becomes materially limiting, and at
approximately what strand count?
```

The purpose is to decide whether a separately contracted, narrowly targeted
R2C-B experiment is warranted.

R2C-A does not need to justify a permanent renderer or asset architecture.

It does not preselect or authorize:

- packed strand representation;
- direct GPU-buffer ingestion;
- LOD;
- worker/off-main-thread preparation;
- instancing;
- glTF/GLB;
- a new renderer;
- expanded canonical R2B bundle limits;
- learned generation;
- customer rendering;
- Product Media, fitting, commerce, order or manufacturing integration.

## 2. Scope and surface

R2C-A may install only the minimum internal characterization surface needed for
the purpose above.

Required surface:

```text
/admin/render-lab/performance
```

Required behavior:

- inherited `/admin/**` middleware;
- route-local server `requireAdmin()` before benchmark client code is rendered;
- dynamically loaded client benchmark module with `ssr: false`;
- no navigation link;
- explicit operator start;
- no automatic benchmark run on page load;
- no background continuation after route exit;
- no decision-bearing run while the page is hidden;
- no DB or persistent state;
- no telemetry or automatic upload;
- no local-storage result persistence;
- no R2C-A-owned external network request;
- one explicit local JSON download is allowed.

The page must visibly state:

```text
BENCHMARK_ONLY
VISUAL_ONLY
EXPLORATORY CHARACTERIZATION
NOT PRODUCT TRUTH
NOT FIT EVIDENCE
NOT A PRODUCTION BUDGET
NOT A MANUFACTURING SPECIFICATION
```

## 3. Benchmark input boundary

Use a distinct immutable validated benchmark input such as
`RendererBenchmarkInput`.

It must not widen or masquerade as canonical R2B `StrandAsset`.

Required identity:

```text
classification:
  BENCHMARK_ONLY

canonical R2B bundle:
  false

product / fit / order / manufacturing identity:
  prohibited
```

For v0.3 primary characterization:

```text
strandCount:
  exactly one of 72, 144, 288, 576, 1152

pointsPerStrand:
  exactly 6

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
  benchmark-local and unique

object identity:
  every strand and control-point tuple is unique
```

The validated graph must not remain mutable through an exported unchecked
constructor or writable nested reference.

The deterministic generator must be bound to:

- generator version;
- seed;
- strand count;
- points per strand;
- geometry recipe.

The synthetic input must never enter:

- the R2B route;
- the R2B manifest/binary compiler;
- `loadDiagnosticStrandBundle`;
- canonical `validateStrandAsset`;
- product or persisted asset storage.

## 4. Primary characterization workload

The mandatory v0.3 workload is only:

```text
points per strand:
  6

strand levels:
  72
  144
  288
  576
  1152

requested backend profiles:
  AUTO
  forced WEBGL2
```

Do not include in the mandatory v0.3 run:

- installed R2B transport control;
- 2304 / 4608;
- 3 / 8 point sensitivity;
- color mutation timing;
- rotation timing;
- density-rebuild timing;
- backend mode-replacement timing.

Those are separate follow-up questions.

### 4.1 Fixed visual state

Every sample uses one fixed measurement stimulus:

```text
preview color:
  #34251F

density:
  HIGH

rotation:
  yaw 0
  pitch 0
```

These values are fixed input conditions, not timing dimensions.

## 5. Session and backend policy

One explicit operator action starts one characterization session.

The session freezes its environment before the first measured cell.

At each strand level, run the still-active requested profiles. Profile order is
deterministic and alternates by level:

```text
72:
  AUTO → WEBGL2

144:
  WEBGL2 → AUTO

288:
  AUTO → WEBGL2

576:
  WEBGL2 → AUTO

1152:
  AUTO → WEBGL2
```

Progression is per profile:

- a profile may start level N only after that same profile completed its
  immediately prior level without a safety stop or environment invalidation;
- if one profile stops, the other profile may continue to higher levels if its
  own previous cell passed and the frozen session environment is still valid;
- no prior downloaded/imported result is admission authority.

Record requested and actual backend independently.

Forced WEBGL2 must resolve to WEBGL2 or that profile stops.

AUTO may resolve to WEBGPU or WEBGL2.

AUTO's actual backend must remain stable across higher cells in that session.
If it changes, stop AUTO before the higher cell begins geometry creation.

If AUTO never selects WEBGPU, no WebGPU-versus-WebGL2 conclusion is permitted.

## 6. Required measurement stages and metrics

R2C-A uses application-owned CPU/wall-clock measurement only.

Required aggregate renderer stages:

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

Required metrics:

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

Meaning restrictions:

- every `*CpuMs` is synchronous application-owned CPU duration;
- `rendererInitWallMs` is awaited `renderer.init()` wall duration;
- `firstRenderSubmitCpuMs` is synchronous render submission only;
- `candidateToLogicalReadyMs` begins immediately before candidate backend
  construction and ends immediately after the candidate is successfully
  committed/revealed as logically active;
- previous-backend disposal is not part of logical-ready time;
- `teardownCpuMs` is disposal-call CPU time, not proof of GC or GPU
  reclamation;
- `totalSampleWallMs` starts before input construction and ends after bounded
  teardown; inter-sample quiet time is excluded.

`GEOMETRY_FINALIZE` must truthfully own, where applicable:

- disposal of temporary/source geometries after merge;
- merged-geometry validation;
- commit of the new geometry to renderer state;
- disposal of the previous renderer geometry.

A failure before the commit point must leave prior authoritative renderer
state intact. A failure after commit is terminal for that sample and teardown
owns the committed replacement.

No per-strand marks or callbacks are allowed.

Instrumentation must remain benchmark-only and must not alter normal R2B
renderer behavior.

## 7. Sampling

Per requested-backend cell:

```text
warm-up:
  1

measured:
  5
```

A complete cell requires:

- one successful warm-up;
- exactly five valid measured samples;
- stable frozen environment;
- stable required actual backend;
- final zero R2C-A-owned resources after every sample.

Retain every raw measured sample.

For every metric summarize only valid measured samples using:

```text
count
median
minimum
maximum
raw values
```

No p90 is defined in v0.3.

Do not pool warm-ups and measured samples.

Do not pool stopped, failed, aborted or invalidated samples into summaries.

Inter-sample scheduling may use a small fixed quiet boundary sufficient to
avoid running samples in the same render turn. It is not a measured metric and
must not grow into a separate browser-idleness evidence system.

## 8. Hard safety and invalidation

The v0.3 safety model is deliberately simple.

Hard workload cap:

```text
1152 strands × 6 points
```

Hard ceilings:

```text
single synchronous owned stage:
  < 1000 ms

candidate-to-logical-ready:
  < 3000 ms

whole explicit session:
  < 15 minutes
```

After a hard ceiling is known:

1. do not start the next owned stage;
2. allow an already executing synchronous stage to return;
3. perform bounded cleanup;
4. retain the partial exploratory result;
5. do not advance that profile to the next strand level.

Stop or invalidate the affected session/profile on:

- explicit cancellation;
- backend/device loss;
- renderer initialization failure;
- render-submission failure;
- forced-backend mismatch;
- AUTO actual-backend drift before a higher cell;
- page becoming hidden;
- CSS viewport change;
- drawing-buffer change;
- DPR change;
- renderer-pixel-ratio change;
- synchronous-stage ceiling violation;
- candidate-to-logical-ready ceiling violation;
- host/canvas/backend ownership invariant failure;
- measurement instrumentation failure;
- disposal/cleanup failure;
- session-duration ceiling.

There is no predictive cross-run admission formula in v0.3.

There is no 64 MiB lower-bound admission gate in v0.3.

## 9. Cleanup and lifecycle policy

Every warm-up and measured sample already exercises:

```text
input
→ candidate construction
→ renderer initialization
→ geometry build
→ first render submission
→ logical commit
→ teardown
```

v0.3 therefore has no separate:

- 20-cycle 72-strand lifecycle campaign;
- 5-cycle highest-level campaign;
- 20-cycle high-level confirmation.

After every sample, the harness must prove its own final owned-resource counts
are zero for:

- candidate hosts;
- active benchmark hosts;
- canvases;
- benchmark-owned observers/timers/rAF handles;
- benchmark backends;
- benchmark geometry ownership tracked by the harness.

A nonzero final owned-resource count invalidates the sample and stops further
levels for that profile.

This proves harness ownership cleanup only. It does not prove GC or GPU
reclamation.

## 10. Environment and provenance

A decision-bearing characterization session must begin from clean merged source.

At explicit Start, one same-origin guarded server action records one
run-start provenance snapshot.

Required provenance:

```text
source commit
source branch
clean/dirty state
Next.js version
Three.js version
generator version
geometry recipe
seed
```

Required environment:

```text
raw user agent
operator-declared browser engine/major
operator-declared OS/architecture
operator device class
operator power mode
operator low-power state
requested backend
actual backend
CSS viewport
actual drawing-buffer width/height
DPR
actual renderer pixel ratio
startedAt
endedAt
```

The fixed viewport is:

```text
800 × 600 CSS pixels
```

The existing renderer DPR cap of 2 remains.

The session freezes viewport/DPR/drawing-buffer/renderer-pixel-ratio conditions.
A change invalidates the active profile/session as specified in §8.

Dirty source may run only a 72×6 non-decision-bearing verification smoke.

v0.3 does not require:

- page-load/source-start/source-end Git matching;
- imported-result environment fingerprints;
- cross-result comparability authority;
- persistent device identifiers;
- account/customer identity;
- IP addresses;
- photo/face data.

## 11. Verification smoke

Dirty-source development verification is limited to:

```text
strand count:
  72

points:
  6

requested profiles:
  AUTO
  forced WEBGL2

per profile:
  at most 1 warm-up + 1 measured

decision-bearing:
  false
```

Smoke must not:

- unlock higher levels;
- be pooled with characterization evidence;
- claim R2C-B justification.

## 12. Result artifact

Use one small versioned local JSON artifact.

```text
schema:
  mira.render-lab.r2ca-result

version:
  2

measurement contract:
  r2ca-v0.3
```

Required top-level groups:

```text
source
environment
sessionConfiguration
cells
outcome
stopReason
warnings
```

Each cell contains:

```text
strandCount
pointsPerStrand
requestedBackend
actualBackend
warmupStatus
rawMeasuredSamples
metricSummaries
cleanupOutcome
cellOutcome
cellStopReason
```

The validator must be strong enough to reject false measurement evidence but
must not become a general cross-result authority.

At minimum enforce:

- exact version/schema;
- bounded known enum vocabulary;
- no arbitrary identity fields;
- finite nonnegative timing values;
- `startedAt <= endedAt`;
- successful cell cardinality: exactly five valid measured samples;
- requested and actual backend consistency;
- required metric presence for valid synthetic samples;
- metric summaries exactly recompute from raw valid sample values;
- no failed/stopped sample included in summaries;
- cleanup outcome consistent with zero final owned resources;
- session/cell outcomes consistent with stop reasons.

There is no cross-result comparability engine.

Serialization must be deterministic enough for a stable local file, but v0.3
does not require clipboard/download byte-identity proof.

Only explicit local JSON download is required.

No DB, local storage, telemetry or upload is authorized.

## 13. Explicitly deferred measurements

The following are outside mandatory v0.3:

```text
installed R2B transport timing
2304 / 4608 scale extension
3 / 8 point sensitivity
density rebuild timing
color timing
rotation timing
backend replacement timing
Long Tasks API
UA-specific memory
GPU timestamp
GPU completion
GPU memory
presentation time
stable animation FPS
20-sample confirmation
p90
multi-device qualification
multi-engine qualification
cross-run admission
cross-result comparability
dedicated lifecycle stress
```

A deferred item requires a separately scoped follow-up when the primary result
shows why it is necessary.

## 14. Characterization interpretation

R2C-A review assigns one primary disposition per actual-backend profile:

```text
NO_SCALING_PROBLEM_OBSERVED_WITHIN_TESTED_ENVELOPE
DOMINANT_CPU_GEOMETRY_PREPARATION
DOMINANT_BACKEND_INITIALIZATION
DOMINANT_RENDER_SUBMISSION
MIXED_OR_AMBIGUOUS
STOPPED_BY_SAFETY_GATE
ENVELOPE_INSUFFICIENT
```

These are exploratory experiment dispositions, not production budgets.

### 14.1 Clear bottleneck trigger

A targeted R2C-B prototype experiment is justified when all of these are true:

1. one owned stage is the slowest stage in at least 4 of 5 measured samples at
   two consecutive strand levels;
2. that stage's median grows by at least 1.5× across that doubling;
3. at the higher of the two levels, that stage is either:
   - at least 100 ms median; or
   - at least 40% of median candidate-to-logical-ready.

This gate identifies a target for an experiment. It does not authorize a
durable architecture.

### 14.2 Other follow-up triggers

Open a targeted measurement follow-up rather than an architecture experiment
when:

- ranges overlap enough that dominant-stage classification is ambiguous;
- backend ordering reverses;
- upper-level median candidate-to-logical-ready is at least 500 ms but stage
  attribution remains mixed;
- 1152 is below the declared initial R3 renderer-input envelope;
- geometry preparation dominates and point-count sensitivity is needed before
  choosing a remedy.

A later 20-sample confirmation may be contracted only when a close/noisy cell
would materially affect a durable architecture choice.

## 15. Evidence needed before durable R2C-B design selection

R2C-A v0.3 itself may open a targeted prototype experiment from one clean,
representative device/browser.

Before a prototype result is promoted into a durable R2C-B Design Contract,
the evidence set must add:

- at least one materially lower-capability device;
- Chromium-family evidence;
- Safari/WebKit evidence;
- requested and actual backend recorded independently;
- raw samples;
- no unresolved cleanup invariant failure;
- targeted confirmation when a close/noisy threshold materially affects the
  choice.

This requirement belongs to durable architecture selection, not to completion
of the first R2C-A characterization.

## 16. R3 handoff

R2C-A must provide before learned-producer integration relies on the current
renderer envelope:

- one reviewed clean-source characterization artifact;
- highest completed strand level for each actual backend;
- raw samples and metric summaries;
- first dominant stage or an explicit
  `NO_SCALING_PROBLEM_OBSERVED_WITHIN_TESTED_ENVELOPE`;
- proof that no harness cleanup invariant failed;
- generator version, recipe, seed and six-point input semantics;
- explicit comparison between the proposed initial R3 output envelope and the
  tested R2C-A envelope.

R3 may proceed without a renderer-architecture change only when its initial
renderer input remains within the reviewed passed envelope and no R2C-B trigger
requiring a renderer remedy fired.

If R3 requires a larger envelope, R2C-A does not imply performance above
1152×6; contract a targeted extension first.

## 17. Source and implementation strategy

This contract does not authorize preserving the current uncommitted R2C-A
implementation merely because it exists.

The next implementation reconnaissance must compare the v0.3 contract against
the current v0.4 candidate and classify each R2C-A path as:

```text
KEEP
SIMPLIFY
DELETE
UNCHANGED_SUPPORT
```

Prefer a clean simplification/replacement of the R2C-A-specific orchestration
and result layer over preserving removed v0.2 state-machine complexity.

Normal R1/R2B renderer and bundle behavior remain protected.

Expected implementation invariants:

- no package/lockfile change;
- no Prisma/storage change;
- no R2B fixture/loader limit change;
- no refund-context change;
- no customer import/chunk edge;
- no navigation entry;
- no new browser-automation dependency.

## 18. Source verification requirements

A later v0.3 source task must verify at least:

- deterministic six-point benchmark generator;
- immutable validated benchmark boundary;
- exact 72/144/288/576/1152 cap;
- exact per-profile same-session progression;
- actual-backend capture and AUTO drift stop;
- truthful aggregate stage boundaries;
- initial/replacement logical-ready semantics used by the retained path;
- 1000 ms stop-before-next-owned-stage behavior;
- 3000 ms logical-ready stop;
- viewport/drawing-buffer/DPR/pixel-ratio invalidation;
- cancellation and route-exit cleanup;
- per-sample final zero owned resources;
- partial-result retention on failure/stop;
- summary recomputation from raw five-sample evidence;
- one guarded run-start provenance snapshot;
- dirty-source smoke isolation;
- no persistence/telemetry/upload;
- no benchmark-owned external request;
- inherited shared-network attribution preserved;
- admin fail-closed boundary;
- no customer imports/chunks;
- normal R2B regression tests;
- typecheck, lint, full test, production build and diff checks;
- refund-context invariance.

High-load decision-bearing characterization must not run in CI.

Dirty-source browser verification must remain at 72×6.

## 19. Network boundary

R2C-A network isolation is scoped to R2C-A-owned behavior.

A request already owned by the shared authenticated application shell does not
become R2C-A authority merely because the performance page renders inside that
shell.

A shared external request remains outside R2C-A scope only when reviewed
browser evidence establishes:

- it occurs before benchmark start or on an ordinary non-R2C-A page;
- benchmark start introduces no additional equivalent request;
- its initiator is outside R2C-A-owned source;
- R2C-A does not consume its response as benchmark input/evidence;
- no R2C-A path adds, modifies or suppresses it.

Record such a request as inherited environment evidence, not as an R2C-A
dependency or benchmark network success.

## 20. Known limits

R2C-A v0.3 cannot establish:

- product-realistic strand count or visual quality;
- production performance budgets;
- expanded bundle transport behavior;
- performance above 1152×6;
- universal cross-device behavior;
- cross-browser portability;
- true GPU memory;
- GPU completion or presentation time;
- sustained animation FPS;
- absence of leaks or GPU reclamation;
- whether an R2C-B remedy should become durable without separate review.

## 21. Rollback

Runtime stop:

1. do not start the next owned stage;
2. let a currently executing synchronous stage return;
3. perform bounded benchmark cleanup;
4. remove benchmark hosts/canvases/owned handles;
5. retain only the partial in-memory result until local download or route exit.

Source rollback removes the v0.3 benchmark surface/modules/tests and optional
instrumentation, restoring the reviewed R1/R2B renderer path.

No DB, storage, customer or benchmark-asset cleanup exists.

Historical Design Contracts are not rewritten.

## 22. Implementation gate

This contract authorizes documentation only.

After reviewed merge, the next gate is a fresh read-only v0.3 implementation
reconnaissance against:

- current `main`;
- the protected uncommitted v0.4 candidate;
- R1/R2B installed source;
- this v0.3 contract.

That reconnaissance must decide the exact delete/simplify/keep path set before
any source edits.

No C5 correction task under Design Contract v0.2 remains authorized after
v0.3 becomes effective.
