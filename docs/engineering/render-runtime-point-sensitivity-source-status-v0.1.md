# R2C-A-S1 Point/Tessellation Sensitivity Source Status / As-Built v0.1

## Status

```text
DOCUMENT CLASS:
  SOURCE STATUS / AS-BUILT

FEATURE STANDARD CLASSIFICATION:
  MEDIUM

EXPERIMENT:
  R2C-A-S1

SOURCE STATUS VERSION:
  v0.1

SOURCE AUTHORITY:
  MERGED AND REVIEW-CLOSED

SOURCE ACTIVATION:
  INTERNAL ADMIN DIAGNOSTIC SOURCE ONLY

CHARACTERIZATION EVIDENCE:
  NOT YET COLLECTED

RESULT-v1 PRIMARY SIX-CELL:
  NOT YET PRODUCED

PRIMARY R2C-A-S1 SIX-CELL CHARACTERIZATION:
  NOT EXECUTED

R2C-B:
  NOT AUTHORIZED BY SOURCE MERGE ALONE

CUSTOMER / PRODUCT / FIT / COMMERCE / ORDER / MANUFACTURING ACTIVATION:
  INACTIVE / NOT AUTHORIZED
```

## 1. Purpose and authority boundary

This record describes the R2C-A-S1 source merged to `main` by PR #39. It
answers what was merged, how the as-built implementation maps to the frozen
Design Contract, what source verification is recorded, and what remains
unexecuted or unresolved before physical characterization evidence exists.

This is a source-lifecycle record, not a new Design Contract. It does not add
requirements retroactively, amend the frozen experiment, report a P3/P6/P8
performance conclusion, select an R2C-B outcome, or authorize customer or
product activation.

The merged source may support a future R2C-A-S1 run after this Source Status is
independently reviewed and merged. Source closure is not experimental-result
closure.

## 2. Merge and governing identity

```text
experiment:
  R2C-A-S1

source status version:
  v0.1

merged PR:
  #39

PR head:
  560b06e81474aa5d3f88a205596fa109e2943fc9

merge commit:
  f2a3db971705114baff498993bd838fdb2807043

merged branch:
  main

PR base:
  3ffe8640624c352c5ae0f1d9f0ea7728610aca2f

frozen Design Contract:
  docs/engineering/render-runtime-point-sensitivity-design-contract-v0.1.md

frozen Design Contract SHA-256:
  ff8cb0720310ed77e85f47a6373a741da7d434e7f04ea7c4a0437f75c57aff54
```

The merge commit has parents `3ffe8640624c352c5ae0f1d9f0ea7728610aca2f`
and `560b06e81474aa5d3f88a205596fa109e2943fc9`. The exact PR surface in §3 was
therefore reconstructed by diffing merge parent 1 to the merge commit. This
isolates PR #39 and does not attribute unrelated earlier commits to S1.

The Result identity read directly from merged source is:

```text
schema:
  mira.render-lab.r2ca-s1-result

version:
  1

experiment:
  R2C-A-S1

measurementContract:
  r2ca-s1-v0.1
```

The merged source also fixes the distinct generator identity to
`r2ca-s1-synthetic-generator/v1` and the classification to `BENCHMARK_ONLY`.

## 3. Exact PR #39 source surface

PR #39 merged exactly 17 paths: 13 added and 4 modified.

### 3.1 Shared benchmark and renderer implementation

```text
A  src/lib/rendering/benchmark-runner-core.ts
M  src/lib/rendering/benchmark-runner.ts
M  src/lib/rendering/renderer-backend.ts
```

The new shared core owns the parent/S1 sample lifecycle, timing guards,
renderer observation, logical-ready commit, teardown, resource accounting and
terminal-cause propagation. The parent runner now delegates those unchanged
semantics to the core. The renderer benchmark seam was generalized to a
benchmark-only geometry-input interface while the normal R1/R2B initialization
path remained separate and observer-free.

### 3.2 S1-specific implementation

```text
A  src/lib/rendering/benchmark-point-sensitivity-input.ts
A  src/lib/rendering/benchmark-point-sensitivity-provenance.server.ts
A  src/lib/rendering/benchmark-point-sensitivity-result.ts
A  src/lib/rendering/benchmark-point-sensitivity-runner.ts
```

These modules own the distinct S1 input/generator identity, provenance adapter,
Result v1 validation/serialization/analysis, and the six-cell runner.

### 3.3 Admin and UI boundary

```text
A  src/app/admin/render-lab/performance/point-sensitivity-actions.ts
M  src/components/rendering/RenderPerformanceLab.tsx
```

The action preserves the route-local admin guard before S1 provenance I/O. The
existing internal performance surface gained separate explicit S1 start,
result and download controls plus one page-level execution coordinator shared
with the parent benchmark.

### 3.4 Tests and boundary evidence

```text
A  src/app/admin/render-lab/performance/point-sensitivity-actions.test.ts
A  src/components/rendering/RenderPerformanceLab.test.ts
A  src/lib/rendering/__tests__/benchmark-point-sensitivity-input.test.ts
A  src/lib/rendering/__tests__/benchmark-point-sensitivity-provenance.test.ts
A  src/lib/rendering/__tests__/benchmark-point-sensitivity-result.test.ts
A  src/lib/rendering/__tests__/benchmark-point-sensitivity-runner.test.ts
M  src/lib/rendering/__tests__/prototype-boundary.test.ts
A  src/lib/rendering/__tests__/renderer-benchmark-point-sensitivity.test.ts
```

The tests exercise input identity and P6 equivalence, provenance, the exact
schedule, renderer geometry construction, runner stops and cleanup, Result-v1
causal validation, admin authorization, page ownership/cancellation, stale
completion suppression, and product/R2B/persistence isolation.

## 4. Frozen workload as built

| Strand count | Execution order | Requested backend | Warm-up | Measured samples per cell |
| ---: | --- | --- | ---: | ---: |
| 576 | P3 → P6 → P8 | AUTO | 1 | 5 |
| 1152 | P8 → P6 → P3 | AUTO | 1 | 5 |

The resulting six-cell order is exactly:

```text
576 × P3
576 × P6
576 × P8
1152 × P8
1152 × P6
1152 × P3
```

| Regime | Control points | Control spans | Tubular segments | Radial segments |
| --- | ---: | ---: | ---: | ---: |
| P3 | 3 | 2 | 6 | 4 |
| P6 | 6 | 5 | 15 | 4 |
| P8 | 8 | 7 | 21 | 4 |

The runner requests only `AUTO`. The first accepted AUTO backend becomes
session authority; a later different report is `AUTO_BACKEND_DRIFT` and stops
before geometry selection/creation. Any non-complete S1 cell stops the session
and retains partial evidence without a disposition.

The input module admits only 576/1152 strands, P3/P6/P8, seed `20260808`,
recipe `RADIAL_CROWN_FALL_V1`, default width `0.028`, and noncanonical
`BENCHMARK_ONLY` data. Behavior tests compare both live generators and establish
S1 P6 shared-field equivalence with the parent v0.3 generator at both strand
counts while preserving distinct schema and generator identities.

**Contract mapping:** exact match; no workload deviation was found.

## 5. Geometry construction as built

S1 uses the existing renderer benchmark construction path rather than an
S1-only geometry builder:

```text
createBenchmarkTubeGeometry
→ THREE.CatmullRomCurve3(points, false, "centripetal")
→ rendererBenchmarkTubularSegments(points.length)
→ THREE.TubeGeometry(curve, tubularSegments, width / 2, 4, false)
→ mergeGeometries
→ benchmark geometry finalize/commit transaction
```

The curve is open, uses `centripetal` Catmull-Rom parameterization, and feeds an
open `TubeGeometry`. Longitudinal segments are `(pointCount - 1) × 3`; radial
segments remain fixed at 4. All per-strand tube geometries are created under
`GEOMETRY_CREATE`, combined by `mergeGeometries` under `GEOMETRY_MERGE`, and
validated/committed under `GEOMETRY_FINALIZE` with bounded disposal of sources
and prior geometry.

Renderer behavior tests observe the exact P3/P6/P8 constructor arguments,
curve type, open states, merge call and stage order.

**Contract mapping:** exact match; no geometry deviation was found.

## 6. Runner and measurement as built

The architecture is:

```text
S1 runner
→ shared benchmark runner core
→ unchanged benchmark measurement primitives
→ benchmark renderer/backend observation
→ hidden candidate construction and geometry transaction
→ explicit reveal / logical-ready commit
→ bounded teardown and zero-owned-resource observation
→ S1 Result-v1 validation
```

S1 does not redefine the parent measurement metrics. It reuses the parent
`benchmark-measurement.ts` stage observer, synchronous CPU clock semantics,
awaited renderer-initialization wall timing, abortable animation-frame quiet
boundary, and the same ceilings:

```text
single synchronous owned stage:  < 1000 ms
candidate to logical ready:       < 3000 ms
whole explicit session:           < 900000 ms
```

The shared core preserves the parent stage order:

```text
input construction
input validation
backend construction
SCENE_SETUP
RENDERER_INIT
backend report and pre-geometry acceptance
GEOMETRY_SELECT
GEOMETRY_CREATE
GEOMETRY_MERGE
GEOMETRY_FINALIZE
RENDER_SUBMIT
candidate reveal / logical-ready commit
DISPOSE and teardown
```

`candidateToLogicalReadyMs` begins immediately before candidate backend
construction and ends immediately after successful reveal/commit. Prior
backend disposal is not inserted into that interval. Every warm-up or measured
sample that enters the executed renderer-sample path performs the applicable
sample teardown, snapshots candidate hosts, active hosts, canvases, observers,
timers, animation-frame handles, backends and geometries, and records final
harness ownership under the shared runner-core contract. A terminal record
produced when the quiet boundary itself is interrupted does not enter the
normal executed `runSample` / `teardownSample` path. It releases the
boundary-owned animation-frame/resource state and records the terminal cleanup
and resource snapshot without claiming executed-sample teardown timings.

The parent v0.3 runner delegates to the same core but retains its own input,
schedule, profile progression, smoke/characterization distinction and Result
v2 validator. S1 owns only its separate schedule, controlled-environment gate,
analysis and Result v1 identity.

**Contract mapping:** the frozen parent measurement semantics are reused, not
duplicated or silently widened.

## 7. Result-v1 causal validator as built

`benchmark-point-sensitivity-result.ts` is a distinct exact-shape Result-v1
validator and deterministic two-space serializer with one final LF and an
S1-specific filename. Parent Result v2 and S1 Result v1 mutually reject each
other.

The validator uses a private finite causal/reachability model. The phases are
validator-only and are not serialized. The appropriate authority claim is
**bounded source validation against the frozen Result-v1 evidence contract**;
the artifacts do not claim formal mathematical proof.

The merged validator and tests establish:

- **Causal phase reachability:** a terminal sample must be compatible with at
  least one lawful phase and execution prefix.
- **Stop-reason classification:** the full parent stop vocabulary is classified
  as S1-reachable, S1-unreachable or context-dependent; forced-backend mismatch,
  dirty-source and provenance-unavailable terminal evidence cannot masquerade
  as an AUTO-only executed S1 result.
- **Quiet versus executed terminals:** a quiet-boundary interruption is distinct
  from the first executed guard and from later owned work.
- **Backend report versus observation acceptance:** reported-pre-accept and
  accepted backend authority are separate causal states, including drift and
  environment-change cases.
- **Warning and environment authority:** `AUTO_DID_NOT_SELECT_WEBGPU`, drawing
  buffer dimensions and renderer pixel ratio must agree with the backend state
  that could lawfully have been accepted.
- **Owned timing-prefix validation:** recorded owned stages must form a
  contiguous execution prefix; teardown and total-wall evidence must be
  mutually present for an executed terminal.
- **Recorded timing containment:** candidate time must contain recorded logical
  owned work, while total sample wall time must contain input, candidate/lower
  bound and teardown work without double-counting nested intervals.
- **Synchronous-ceiling precedence:** an observed owned-stage value at or above
  1000 ms must remain the earlier terminal cause except for the authorized
  cleanup final-cause override; a teardown-only synchronous ceiling requires a
  completed logical-ready history.
- **Logical-ready-ceiling precedence:** direct or safely inferred evidence that
  the 3000 ms guard was already reached prevents a later lower-priority cause
  from replacing it.
- **Intra-phase guard ordering:** session/environment/backend guards, logical
  clock validation, logical-ready ceiling checks, observation acceptance and
  cleanup are ordered according to the merged runner call sites.
- **Direct versus inferred ceiling evidence:** direct
  `candidateToLogicalReadyMs` uses the exact source threshold; only a ceiling
  inferred from independently measured stage-duration sums receives a
  directional conservative floating-point tolerance.
- **Cleanup final-cause semantics:** `CLEANUP_INVARIANT_FAILURE` requires
  executed teardown and nonzero cleanup evidence and may override the earlier
  base cause only through the narrow cleanup rule.
- **Propagation:** terminal status/cause, cleanup and backend authority must be
  coherent across sample, cell, session and top-level result.
- **Warm-up existential compatibility:** because raw warm-up timing is not
  serialized, the validator requires the warm-up terminal summary to be
  compatible with at least one lawful executed causal state and the session's
  backend/environment authority.
- **Six-complete analysis instrumentation exception:** six complete cells
  normally require recomputed analysis and `COMPLETE/NONE`; the only bounded
  exception is impossible analysis instrumentation (for example a nonpositive
  required denominator), which must serialize empty analysis as
  `FAILED/INSTRUMENTATION_FAILURE`.

The validator also recomputes metric summaries, medians, raw ranges, ratios,
threshold proximity, geometry-create shares, per-level disposition and final
disposition from raw valid samples. Partial or terminal evidence receives no
prototype-target disposition.

## 8. D5-R1 final bounded corrections

### 8.1 Render-submit guard priority

The final validator distinguishes two render-submit causal states.
`RENDER_SUBMIT_FAILURE` may survive where recorded render-submit work itself can
fail before the next logical-ready guard. Where submit has not been recorded
and the preceding logical-ready prefix already proves the 3000 ms ceiling, the
earlier ceiling must win. Behavior tests accept the former and reject the
latter.

### 8.2 Direct versus inferred floating-point ceiling evidence

Direct `candidateToLogicalReadyMs` retains exact source semantics: a direct
value below 3000 ms does not prove the ceiling, while 3000 ms does. For evidence
inferred only by summing independently measured sequential stage durations,
the validator subtracts a small directional comparison tolerance before
deciding that the threshold was safely reached. Equality or microscopic
rounding proximity therefore does not strengthen inferred evidence.

This tolerance does not alter, relax or reinterpret the frozen 3000 ms runtime
guard.

## 9. Cleanup final-cause correction

The shared core initially records the first ordinary interruption. Teardown
then attempts backend, host and environment cleanup independently and records
teardown duration and final resource ownership.

`CLEANUP_INVARIANT_FAILURE` is the narrowly authorized final-cause override:
non-ceiling cleanup exceptions or nonzero final ownership replace an earlier
sample cause and, unlike ordinary later session causes, replace the session
stop so the sample, cell and result all report the cleanup failure. A
cleanup-stage `BenchmarkSynchronousStageCeilingError` is handled separately;
like a successful-cleanup or teardown-ceiling observation after an earlier
interruption, it does not generally overwrite that earlier cause.

Runner and Result-v1 behavior tests cover both the override and preservation of
the earlier ordinary cause.

## 10. UI and activation boundary

The S1 control is installed only beneath:

```text
/admin/render-lab/performance
```

The existing page calls `requireAdmin()` before returning the dynamic
client-only performance surface. The S1 provenance action independently calls
`requireAdmin()` before seed validation or Git/package provenance I/O.

As built:

- no customer, fitting, cart, product-order or manufacturing route imports the
  S1 modules or shared benchmark core;
- no navigation entry was added;
- render/import/mount performs no parent or S1 execution and no provenance I/O;
- S1 starts only from the explicit `Start R2C-A-S1` control;
- a single page coordinator grants execution ownership to either parent or S1,
  never both;
- Cancel aborts only the active owner; unmount aborts it with `ROUTE_EXIT`;
- completion and error callbacks are accepted only from the still-mounted,
  still-current owner, suppressing stale completion after remount or replacement;
- JSON download is explicit and separate; there is no automatic download,
  database/local-storage persistence, telemetry, upload or external benchmark
  request.

**Customer activation:** INACTIVE.

## 11. Verification history

The final pre-merge D5-R1 verification ledger records:

```text
focused causal validator / runner:
  2 files / 69 tests passed

expanded parent / S1 / I-2 / prototype / UI / action:
  17 files / 207 tests passed

worker-limited repository verification:
  230 files / 5,492 tests passed

production build:
  PASS

R2B compiler --check:
  PASS

refund-context:
  unchanged — 148 / 108 / 45 / 3

customer-chunk isolation:
  PASS

protected boundary:
  11 / 11

bounded self-audit:
  Blocker 0
  Important 0
  Minor 0
  No issue 19
```

The PR #39 publication record independently preserves the focused, expanded,
repository, build, compiler, refund-context, customer-isolation, protected
boundary and zero-severity headline results. The exact refund-context tuple and
`No issue 19` count above are retained from the final D5-R1 task ledger; they
are not reinterpreted as new evidence by this Source Status.

No primary six-cell execution is part of this verification history.

### 11.1 CI observation

GitHub Actions CI run `31351163955` (`CI` run number 291) is bound to PR head
`560b06e81474aa5d3f88a205596fa109e2943fc9`.

Attempt 1 failed in the unrelated test:

```text
src/lib/payment/refund/__tests__/
refund-deployment-rehearsal.integration.test.ts
```

Its final database-activity snapshot assertion observed
`{ sessions: 9, openTransactions: 0 }` rather than the earlier
`{ sessions: 10, openTransactions: 1 }`. The failed job recorded 229/230 test
files and 5,491/5,492 tests passing. This is evidence of a refund rehearsal
database-activity snapshot change during that run; it is not evidence of an S1
source failure, and this record does not claim a formal root cause.

The failed job was rerun without a source change. Attempt 2 completed
successfully at the same PR head with 230/230 files and 5,492/5,492 tests
passing. No payment or refund path was changed by PR #39.

## 12. Installed invariant ownership

```text
S1 input identity != parent v0.3 input identity
S1 Result v1 != parent Result v2
reported backend != accepted backend authority
source merge != characterization evidence
explicit Start != automatic execution
zero harness ownership != proof of GC/GPU reclamation
CPU stage timing != GPU completion or presentation
P3/P8 perturbation != visual-fidelity evidence
S1 disposition != durable renderer architecture
source closure != R2C-B authorization
```

## 13. Contract deviations

**None found.** The merged source identity, workload, geometry construction,
measurement semantics, safety ceilings, Result-v1 identity and evidence rules,
admin boundary, local-only persistence boundary and non-authority statements
conform to the frozen Design Contract whose hash is recorded in §2.

This statement is bounded to the merged source and behavior tests inspected for
this record. It is not a performance-result claim.

## 14. Residual source risks

- The causal validator is deliberately finite and source-bounded. Its tests
  provide strong compatibility checks, not a formal proof of all JavaScript,
  browser, driver or GPU histories.
- Parent R2C-A and S1 now share lifecycle code. The merge regression suite is
  green, but future changes to the shared core must preserve both independent
  result contracts and their runner behavior.
- Source provenance compares the checkout with the locally recorded
  `origin/main`; it does not fetch. The later execution procedure must freshly
  fetch before establishing current-main authority.
- Browser engine, OS, architecture, power and low-power state are explicit
  operator declarations plus observed viewport/backend facts. The source does
  not independently prove the absence of concurrent external workloads.
- Harness-owned zero-resource cleanup does not prove garbage collection, GPU
  reclamation or absence of driver-level leaks.

These are bounded source/lifecycle risks and limitations, not observed S1
performance defects.

## 15. Known CI and test-infrastructure observations

- The initial PR CI attempt observed the refund deployment-rehearsal
  database-activity snapshot mismatch described in §11.1.
- The same failed job passed when rerun without source changes, and final CI is
  successful.
- The available evidence does not establish a formal root cause for the first
  attempt. It must not be described as a proven S1 defect.
- The PR verification record also notes that the default highly parallel local
  path exposed an unrelated payment structural-analysis timeout under load;
  that test passed independently and the worker-limited full suite passed.

## 16. Evidence limitations

- No R2C-A-S1 Result-v1 primary artifact exists yet.
- No P3/P6/P8 physical performance values, medians, ratios, ranges, shares or
  disposition are available.
- No browser experiment was opened or executed for this Source Status task.
- This documentation task did not rerun the expensive repository verification,
  production build or primary workload. It records merged source, committed
  tests, the PR publication record, and the bound CI run.
- The supplied pre-merge audit ledger is not a substitute for future independent
  review of the first Result-v1 artifact.
- No conclusion is available about independent control-point, Catmull-Rom or
  tessellation cost, visual sufficiency, product-realistic fidelity, production
  budgets, cross-device behavior, GPU completion, presentation, memory, GC or
  sustained FPS.

Most importantly, ordinary uncertainty about the future characterization is
not a merged-source defect. A real performance conclusion requires execution
of the frozen six-cell workload and independent result adjudication.

## 17. R2C-B boundary

The pre-registered future branch logic remains only a lifecycle boundary. This
record selects no disposition and no prototype target. A later R2C-B task
depends on an actual valid Result-v1 artifact and independent adjudication.

No R2C-B implementation or durable renderer/asset decision is authorized by PR
#39 or by this Source Status task.

## 18. Source lifecycle decision

| Gate | Status |
| --- | --- |
| Frozen Design Contract | **PRESERVED** |
| Merged source identity | **ESTABLISHED** |
| Source-to-contract mapping | **COMPLETE** |
| Result-v1 source implementation | **AS-BUILT RECORDED** |
| Customer activation | **INACTIVE** |
| Primary six-cell | **NOT EXECUTED** |
| Characterization result | **NOT YET AVAILABLE** |
| Independent Source Status review | **BOUNDED CORRECTION APPLIED — HUMAN FINAL DIFF REVIEW PENDING** |

```text
SOURCE AUTHORITY:
  merged and review-closed

CHARACTERIZATION EVIDENCE:
  not yet collected

RESULT-v1 PRIMARY SIX-CELL:
  not yet produced

R2C-B:
  not authorized by source merge alone
```

## 19. Primary six-cell status

```text
PRIMARY R2C-A-S1 SIX-CELL CHARACTERIZATION:
  NOT EXECUTED
```

The workload remains blocked until this Source Status / As-Built record is
independently reviewed and merged according to the lifecycle gate. This record
does not itself declare the workload ready for execution.

## 20. Verdict

```text
R2C-A-S1 SOURCE STATUS / AS-BUILT v0.1 COMPLETE
— READY FOR INDEPENDENT SOURCE-STATUS REVIEW
```
