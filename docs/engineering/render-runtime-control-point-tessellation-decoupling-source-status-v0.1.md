# R2C-A-S2 Control-Point × Longitudinal-Tessellation Decoupling Source Status / As-Built v0.1

## Status

```text
DOCUMENT CLASS:
  SOURCE STATUS / AS-BUILT

FEATURE STANDARD CLASSIFICATION:
  MEDIUM

TASK CLASSIFICATION:
  SOURCE_ONLY / EVIDENCE_COLLECTION

EXPERIMENT CLASSIFICATION:
  BENCHMARK_ONLY

EXPERIMENT:
  R2C-A-S2

SOURCE STATUS VERSION:
  v0.1

S2 DESIGN CONTRACT:
  INSTALLED

S2 SOURCE:
  MERGED / REVIEW-CLOSED

S2 SOURCE STATUS:
  CANDIDATE — INDEPENDENT REVIEW PENDING

PRIMARY S2 EXECUTION:
  NOT YET PERFORMED

DECISION-BEARING RESULT ARTIFACT:
  NONE

S2 DISPOSITION:
  NOT YET AVAILABLE

R2C-B:
  NOT ACTIVATED

CUSTOMER / PRODUCT / FIT / COMMERCE / ORDER / MANUFACTURING ACTIVATION:
  NONE
```

## 1. Status and authority

This record documents the actual R2C-A-S2 source merged to `main` by PR #43.
It freezes the installed source identity, exact merged scope, as-built behavior,
source-review closure, verification evidence, limitations, and next lifecycle
gate at merge commit `d5807dd554ba34783246851e3870634c0021e64d`.

This is a Source Status / As-Built record, not a new Design Contract, benchmark
Result, Result adjudication, production decision, or review of itself. It does
not redesign the experiment, execute the eight-cell workload, create or modify
a Result artifact, select a performance remedy, or activate R2C-B.

The lifecycle distinctions are explicit:

```text
designed:
  YES — frozen S2 Design Contract installed

implemented:
  YES — source merged to main

source-reviewed:
  YES — four independent findings closed before merge

executed:
  NO — primary S2 workload not yet performed

adjudicated:
  NO — no decision-bearing S2 Result exists
```

## 2. Governing Design Contract

The governing authority is:

```text
docs/engineering/render-runtime-control-point-tessellation-decoupling-design-contract-v0.1.md
```

Its exact installed bytes at the source merge commit have SHA-256:

```text
4c6eab787c1c559f375b6c44b00e3af5130f4ef3b159a71307d179a5fab51db2
```

The S1 Design Contract, S1 Source Status, and S1 Result Adjudication remain
historical authority for their own lifecycle stages. The reviewed S1 evidence
froze `MIXED_OR_NONLINEAR`, selected no remedy, and allowed only the bounded
`CONTROL_POINT_VS_TESSELLATION_DECOUPLING` follow-up that S2 implements. S2
does not amend or recalculate that evidence.

## 3. Installed source identity

Git history establishes:

```text
source PR:
  #43

source PR title:
  feat(rendering): add R2C-A-S2 decoupling benchmark

PR head commit:
  9e6cd0b267ac1c4865aef1ab22fb82a59f3ae3ca

source merge commit on main:
  d5807dd554ba34783246851e3870634c0021e64d

merge parent 1:
  f09d37608a657a82263743156232def1c3125b0a

merge parent 2 / PR head:
  9e6cd0b267ac1c4865aef1ab22fb82a59f3ae3ca
```

This Source Status is bound to the merge commit on `main`, not merely to the
feature-branch head. The exact PR surface in §4 is the diff from merge parent 1
to the merge commit.

## 4. Exact merged implementation scope

PR #43 changed exactly 19 paths: 15 added and 4 modified.

### 4.1 Added source paths

```text
A  src/lib/rendering/benchmark-control-point-tessellation-input.ts
A  src/lib/rendering/benchmark-control-point-tessellation-browser-admission.ts
A  src/lib/rendering/benchmark-control-point-tessellation-analysis.ts
A  src/lib/rendering/benchmark-control-point-tessellation-result.ts
A  src/lib/rendering/benchmark-control-point-tessellation-runner.ts
A  src/lib/rendering/benchmark-control-point-tessellation-provenance.server.ts
A  src/app/admin/render-lab/performance/control-point-tessellation-actions.ts
```

### 4.2 Added behavior-test paths

```text
A  src/app/admin/render-lab/performance/control-point-tessellation-actions.test.ts
A  src/lib/rendering/__tests__/benchmark-control-point-tessellation-analysis.test.ts
A  src/lib/rendering/__tests__/benchmark-control-point-tessellation-browser-admission.test.ts
A  src/lib/rendering/__tests__/benchmark-control-point-tessellation-input.test.ts
A  src/lib/rendering/__tests__/benchmark-control-point-tessellation-provenance.test.ts
A  src/lib/rendering/__tests__/benchmark-control-point-tessellation-result.test.ts
A  src/lib/rendering/__tests__/benchmark-control-point-tessellation-runner.test.ts
A  src/lib/rendering/__tests__/renderer-benchmark-control-point-tessellation.test.ts
```

### 4.3 Modified shared paths

```text
M  src/lib/rendering/renderer-backend.ts
M  src/components/rendering/RenderPerformanceLab.tsx
M  src/components/rendering/RenderPerformanceLab.test.ts
M  src/lib/rendering/__tests__/prototype-boundary.test.ts
```

The merge contains 3,830 insertions and 5 deletions. No source, test,
configuration, package, Prisma, storage, customer, product, fitting, commerce,
order, or manufacturing path outside this exact inventory changed in PR #43.

## 5. Experiment / Result identity

The installed source fixes these distinct S2 identities:

```text
experiment:
  R2C-A-S2

classification:
  BENCHMARK_ONLY

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
```

S2 Result v1, parent R2C-A Result v2, and S1 Result v1 mutually reject one
another under their installed validators and behavior tests.

## 6. Frozen workload as built

The installed runtime-immutable order is exactly:

| Position | Strand count | Control points | `tubularSegments` |
| ---: | ---: | ---: | ---: |
| 1 | 576 | 3 | 6 |
| 2 | 1152 | 8 | 21 |
| 3 | 1152 | 3 | 21 |
| 4 | 576 | 8 | 6 |
| 5 | 1152 | 8 | 6 |
| 6 | 576 | 3 | 21 |
| 7 | 576 | 8 | 21 |
| 8 | 1152 | 3 | 6 |

```text
strand levels:
  576 / 1152

control-point levels:
  3 / 8

tubularSegments levels:
  6 / 21

radialSegments:
  4

requested backend:
  AUTO only

sampling:
  1 warm-up + 5 measured per cell

complete-run measured samples:
  40

complete-run renderer samples:
  48
```

The canonical cell array, every cell object, and the session configuration are
frozen. The runner emits frozen progress snapshots. Behavior tests establish
that attempted mutation of the exported schedule, cell entries,
configuration, or progress payload cannot alter later runtime order. This is
the reviewed correction that makes schedule authority runtime-immutable.

No P6/T15 cell exists in S2, and no workload execution is claimed by this
record.

## 7. Geometry seam as built

The shared renderer introduces one optional benchmark-only field:

```text
RendererBenchmarkGeometryInput
  tubularSegments?: number
```

The resulting benchmark geometry path is:

```text
RendererBenchmarkGeometryInput
→ createBenchmarkTubeGeometry
→ CatmullRomCurve3(points, false, "centripetal")
→ explicit tubularSegments when present
   or historical derived value when absent
→ TubeGeometry(curve, tubularSegments, width / 2, 4, false)
→ existing merge / finalize / cleanup path
```

As built:

- absence preserves the historical `(pointCount - 1) × 3` benchmark
  derivation;
- presence supplies one cell-wide value to every selected strand in that
  sample;
- the renderer rejects an explicit value unless it is a positive safe
  integer, before constructing `TubeGeometry`;
- S2 input construction and validation narrow the admitted explicit values to
  T6 or T21;
- radial segments remain 4;
- Catmull-Rom remains open and `centripetal`;
- `TubeGeometry` remains open;
- width/radius semantics remain `width / 2`; and
- the normal `createRendererBackend` interface and customer path do not
  receive or observe the benchmark override.

The historical absent-field compatibility mapping remains:

```text
P3 → T6
P6 → T15
P8 → T21
```

`src/lib/rendering/renderer-backend.ts` is intentionally not byte-identical to
its parent revision. The correct compatibility claim is preserved behavior
for absent-field benchmark callers and for the normal renderer path.

## 8. Parent/S1/normal-renderer preservation

Object identity across the merge confirms these paths remained byte-unchanged:

```text
src/lib/rendering/benchmark-runner-core.ts

src/lib/rendering/benchmark-point-sensitivity-input.ts
src/lib/rendering/benchmark-point-sensitivity-result.ts
src/lib/rendering/benchmark-point-sensitivity-runner.ts
src/lib/rendering/benchmark-point-sensitivity-provenance.server.ts

src/app/admin/render-lab/performance/point-sensitivity-actions.ts
```

The parent R2C-A source and canonical R2B source did not change. No package or
configuration file, Prisma schema or migration, storage path, customer/product
renderer boundary, fitting path, commerce path, order path, or manufacturing
path changed in the 19-path merge.

The protected-boundary behavior tests additionally reject S2 persistence,
network, canonical-R2B, customer-renderer, storage, payment, fitting, AI, and
Prisma import edges. These are source/import-boundary findings; they are not a
claim about behavior outside the inspected merge and tests.

The governing S2 Design Contract and the S1 Design Contract, Source Status,
and Result Adjudication were also byte-unchanged by PR #43.

## 9. Input/generator as built

S2 has a distinct exact-shape input schema and generator identity, but it does
not duplicate S1 graph generation. `constructControlPointTessellationCandidate`
directly calls the public, pure S1 `constructPointSensitivityCandidate`, then
replaces the schema/generator identity and adds the independent
`tubularSegments` field. S2 validation directly reuses the S1 deep graph
validator through an S1-shaped projection before returning the frozen S2
shape.

Consequently:

- T does not participate in candidate graph generation;
- at fixed seed, strand count, and P, T6 and T21 produce value-identical strand
  graphs;
- S1 generation remains inside S2 input-construction timing ownership;
- S1 deep graph validation remains inside S2 input-validation timing
  ownership;
- S2 retains its distinct schema and generator identity; and
- historical S1 source remains byte-unchanged.

Behavior tests compare the live S2 and S1 generators and verify deep graph
identity across the T change. The independent source review accepted this
reuse as behaviorally clean.

## 10. Browser admission as built

The frozen engine and product vocabulary are:

```text
browser engine:
  CHROMIUM_FAMILY

browser products:
  CHROME
  EDGE
  OPERA
  CHROMIUM
```

The runner independently captures raw user-agent and available UAData brand
evidence, derives actual browser product and major, and requires exact equality
with the declared product and major. Product selection is wrapper first, then
Chrome, then Chromium. Edge and Opera wrapper evidence therefore takes
precedence over embedded Chrome/Chromium engine tokens.

The parser deterministically ignores recognized grease brands. It fails closed
for meaningful unsupported UAData brands or wrappers, malformed recognized
tokens, missing recognized product evidence, conflicting wrapper products,
conflicting majors for the selected product, UAData/UA product or major
disagreement, and declared/actual mismatch.

Browser admission completes before provenance reading, core-session creation,
and the first warm-up. Rejection throws before a core session exists, performs
no S2 workload, and produces no S2 Result artifact. The browser detection shown
on page mount is informational only; authoritative evidence is captured again
at explicit run admission.

## 11. Analysis/disposition as built

S2 analysis is recomputed independently at 576 and 1,152 strands from the raw
measured `geometryCreateCpuMs` samples. For each strand level it retains:

```text
Y36, Y321, Y86, Y821

DP6, DP21, DT3, DT8

MP, MT, I, G

MP/G, MT/G, I/G
```

It computes conservative simple-effect ranges as `min(A) - max(B)` through
`max(A) - min(B)` and the conservative interaction range as:

```text
min(P8,T21) - max(P8,T6) - max(P3,T21) + min(P3,T6)
through
max(P8,T21) - min(P8,T6) - min(P3,T21) + max(P3,T6)
```

The installed direction vocabulary is:

```text
ROBUST_POSITIVE
ROBUST_NEGATIVE
DIRECTION_UNSTABLE
```

A zero endpoint remains `DIRECTION_UNSTABLE`. The normalized values and robust
interaction direction are descriptive only. The implementation introduces no
p-values, confidence intervals, ordinal pairing, new percentage thresholds,
or new millisecond thresholds.

The final disposition vocabulary is exactly:

```text
CONTROL_POINT_SIDE
TESSELLATION_SIDE
BOTH_FACTORS
INTERACTION_OR_NONADDITIVE
UNRESOLVED
```

`FIXED_OVERHEAD` is not an S2 disposition. The ordered as-built decision logic
is:

1. the same qualitative point-side or tessellation-side crossover orientation
   at both strand levels → `INTERACTION_OR_NONADDITIVE`;
2. all point contexts and all tessellation contexts robust-positive across
   both strand levels → `BOTH_FACTORS`;
3. all point contexts robust-positive and all tessellation contexts unstable
   → `CONTROL_POINT_SIDE`;
4. all tessellation contexts robust-positive and all point contexts unstable
   → `TESSELLATION_SIDE`; and
5. every other complete valid result → `UNRESOLVED`.

Robust interaction direction alone is retained as descriptive evidence and
does not promote a result to `INTERACTION_OR_NONADDITIVE`.

## 12. Result causal validator / serializer

The S2 Result validator is exact-shape, causal, and recomputing rather than
shape-only. It reuses the unchanged S1 finite causal validator through bounded
S1-equivalent cell projections for shared lifecycle semantics, then enforces
the distinct S2 identity, browser evidence, frozen schedule, independent T
axis, analysis, and terminal outcome.

For a complete valid result it verifies or recomputes from raw evidence:

- exact eight-cell order and axes;
- one successful warm-up and five valid measured samples per cell;
- timing summaries and raw cardinality;
- factorial medians, ranges, simple effects, main effects, interaction, grand
  mean, normalized values, and direction classes;
- crossover predicates, disposition, and next-investigation mapping;
- declared, actual, and raw browser product/major evidence;
- reported versus accepted backend authority;
- cleanup evidence and final resource ownership; and
- outcome and stop reason.

Serialized analysis is never accepted as truth merely because it has the right
shape. A complete eight-cell record with `G <= 0` at either strand level must
be:

```text
outcome:
  FAILED

stopReason:
  INSTRUMENTATION_FAILURE

disposition:
  null

nextInvestigationClass:
  null
```

Parent Result v2 and S1 Result v1 mutually reject S2 Result v1, and S2 rejects
their identities.

Serialization is deterministic two-space JSON plus exactly one final LF. The
canonical filename is:

```text
mira-r2ca-s2-v01-<startedAt with colons replaced by hyphens>.json
```

Download is explicit and local only.

## 13. Runner / terminal lifecycle

The S2 runner delegates sample execution to the byte-unchanged shared runner
core and retains its cancellation, route-exit, page-hidden, viewport, DPR,
drawing-buffer, renderer-pixel-ratio, renderer/device failure, synchronous
stage ceiling, candidate-to-logical-ready ceiling, session ceiling, cleanup
final-cause precedence, final resource accounting, backend drift, and partial
evidence semantics.

The installed ceilings remain:

```text
single synchronous owned stage:
  < 1000 ms

candidate to logical ready:
  < 3000 ms

whole explicit session:
  < 900000 ms
```

Any terminal cell prevents later-cell execution. Lawful evidence already
collected is retained. Every non-complete outcome has:

```text
disposition:
  null

nextInvestigationClass:
  null
```

Cleanup failure has the narrow final-cause precedence defined by the shared
core; successful cleanup preserves the earlier terminal cause. Resource
accounting covers benchmark-owned resources and does not prove browser,
driver, GPU, or garbage-collector reclamation.

## 14. Backend causal authority

The merged source distinguishes:

```text
accepted backend authority
```

from:

```text
rejected pre-accept backend report retained as raw evidence
```

The first accepted AUTO backend remains session authority. On a lawful
`AUTO_BACKEND_DRIFT`, the rejected report is retained in the terminal warm-up
or measured-sample evidence, while the previously accepted authority continues
to determine session truth and the AUTO warning. The pre-geometry guard stops
the drifting sample after renderer initialization and before geometry
selection or creation; the session then terminates, retains the lawful partial
Result, and leaves disposition and target null.

The initially proposed flat backend-set post-check was removed before merge.
The as-built runner and Result validator preserve causal report/acceptance
ordering instead.

## 15. Provenance / admin action / UI

The protected route remains:

```text
/admin/render-lab/performance
```

The route calls `requireAdmin()` before rendering its client boundary. The S2
provenance action independently calls `requireAdmin()` before seed validation
or source provenance I/O. Provenance reuses the guarded parent mechanism while
replacing the generator identity with the distinct S2 identity.

As built:

- page mount performs no S2 provenance I/O and starts no benchmark;
- parent R2C-A, S1, and S2 share one page-level execution owner;
- only one family may run at a time;
- S2 begins only from the explicit `Start R2C-A-S2` control;
- cancellation and route exit abort the active owner;
- stale completion after unmount or owner replacement is suppressed;
- download occurs only from the explicit `Download S2 JSON` control;
- browser detection displayed before Start is informational;
- browser evidence is recaptured authoritatively at run admission;
- factor levels, order, and sample count are displayed but not user-editable;
- no P6/T15 S2 cell exists; and
- no R2C-B control, auto-run, auto-download, persistence, telemetry, or upload
  is installed.

This is an internal `BENCHMARK_ONLY` admin diagnostic surface, not product
functionality.

## 16. Source review and corrections

The initial independent source review identified four bounded findings:

```text
R2CA-S2-001
  mutable schedule authority

R2CA-S2-002
  browser parser fail-open behavior

R2CA-S2-003
  accepted/reported backend authority conflation

R2CA-S2-004
  insufficient S2 causal/adversarial coverage
```

All four were corrected within the frozen 19-path architecture and independently
closure-reviewed:

```text
R2CA-S2-001  CLOSED
R2CA-S2-002  CLOSED
R2CA-S2-003  CLOSED
R2CA-S2-004  CLOSED
```

The final independent source disposition was:

```text
S2 SOURCE ARCHITECTURE REMAINS ACCEPTED

PASS WITH MINOR NOTES — READY FOR HUMAN FINAL DIFF REVIEW
```

The minor note concerned a mock-storage correction build. A subsequent
independent default-provider/S3 production build passed. This section records
the merged source-review closure; it does not claim that this Source Status
candidate has already been independently reviewed.

## 17. Verification evidence

The final reviewed source verification ledger records:

```text
focused correction:
  3 files / 52 tests PASS

focused source suite:
  11 files / 108 tests PASS

expanded rendering:
  28 files / 315 tests PASS

repository verify:
  238 files / 5,579 tests PASS

typecheck:
  PASS

lint:
  PASS

production build:
  PASS

default-provider/S3 production build:
  PASS

strand-bundle --check:
  PASS

git diff --check:
  PASS

protected S1/shared-core audit:
  PASS
```

The reviewed local full verification used a legitimate isolated PostgreSQL
test database. The first isolated-worktree difficulty was environmental: the
ignored `.env.test` and local dependency context did not follow the worktree.
No repository environment or configuration file was changed. Build-only inert
auth/storage prerequisites did not change candidate source, and the
default-provider/S3 production build was ultimately confirmed.

This record makes no separate PR CI count claim.

## 18. Known limitations

- S2 has not run on real primary hardware/browser yet.
- Browser admission is intentionally bounded to Chrome, Edge, Opera, and
  Chromium in the frozen Chromium-family model and fails closed otherwise.
- S2 measures synchronous/application-owned timing under the contract, not GPU
  completion, presentation, garbage collection, or memory behavior.
- Zero benchmark-owned resources after cleanup is not proof of browser,
  driver, GPU, or garbage-collector reclamation.
- S2 factor results do not establish visual fidelity or production suitability
  for any P or T level.
- Source installation alone selects no production remedy.

No unobserved performance limitation or conclusion is inferred before primary
execution.

## 19. Execution status

```text
primary S2 execution:
  NOT YET PERFORMED

decision-bearing Result artifact:
  NONE

S2 disposition:
  NOT YET AVAILABLE

performance conclusion:
  NONE
```

No synthetic or unit-test fixture is promoted to execution evidence. This
Source Status task did not run the S2 benchmark workload or create, alter, or
adjudicate a Result artifact.

## 20. Authority boundary

```text
S2 Design Contract:
  INSTALLED

S2 source:
  MERGED / REVIEW-CLOSED

S2 Source Status:
  CANDIDATE — INDEPENDENT REVIEW PENDING

primary S2 execution:
  BLOCKED pending reviewed Source Status merge

R2C-B:
  NOT ACTIVATED
```

The installed source enables collection of bounded S2 evidence only. It does
not authorize production point reduction, T6 as a production setting, adaptive
tessellation, batching, workers, packing, caching, instancing, customer
renderer changes, or any other production remedy.

## 21. Next gate

After independent review and reviewed merge of this Source Status, the next
lifecycle gate is:

```text
primary S2 execution
```

Source Status merge does not validate a future Result. The future execution
must still use clean current-main source, pass source-provenance admission, run
under the controlled environment, pass exact browser product/major admission,
retain the exact eight-cell workload, begin only from explicit operator Start,
and preserve the Result artifact for custody and independent adjudication.

R2C-B remains inactive until a future valid Result and separate authority say
otherwise.

## Verdict

```text
R2C-A-S2 SOURCE STATUS / AS-BUILT v0.1 COMPLETE
— READY FOR INDEPENDENT REVIEW
```
