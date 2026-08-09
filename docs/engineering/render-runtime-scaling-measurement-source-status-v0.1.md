# R2C-A Minimal Renderer Characterization Source Status v0.1

## Status

```text
DOCUMENT CLASS:
  SOURCE STATUS / AS-BUILT

FEATURE STANDARD CLASSIFICATION:
  MEDIUM

SOURCE STATE:
  INSTALLED ON MAIN

SOURCE ACTIVATION:
  INTERNAL ADMIN DIAGNOSTIC SOURCE ONLY

DECISION-BEARING CHARACTERIZATION:
  NOT YET EXECUTED

CUSTOMER / PRODUCT / FIT / COMMERCE / ORDER / MANUFACTURING ACTIVATION:
  NOT AUTHORIZED

GOVERNING DESIGN:
  docs/engineering/render-runtime-scaling-measurement-design-contract-v0.3.md

DESIGN PR:
  #35

DESIGN MERGE:
  4929f03fc5813b307021cb2f7887f38ae01a27ed

IMPLEMENTATION PR:
  #36

REVIEWED IMPLEMENTATION HEAD:
  845eecf1a27250e2e281cf32769ecce9a09f2e59

MAIN MERGE:
  9ccef3917fe22ddaa4e11f9e33e0a0b48f82af0d

CHANGE CONTROL:
  supersedes: none | superseded-by: none
```

## 1. Purpose

This record describes the reviewed R2C-A v0.3 source installed on `main`.

It records:

- the installed source paths and their ownership;
- the governing v0.3 measurement semantics;
- the reviewed source and merge chain;
- the static, test, build and bounded browser evidence produced before merge;
- the exact current non-authority;
- known limitations;
- rollback scope; and
- the gates that must be satisfied before decision-bearing characterization.

This document does not redesign R2C-A and does not itself authorize or claim
that the 72 → 1,152 decision-bearing characterization has run.

## 2. Parent and review chain

```text
R1 internal browser Render Lab
  PR #29
  merge 424f0dffd270d79f54f97bb9a4715fb27e9ef2b7

R2B bundle + async loader
  Design PR #30
  implementation PR #31
  source-status PR #32

R2C-A network-boundary clarification
  Design Contract v0.2
  PR #34
  merge 077bee194ed088ab86def1e4b3ff1f9439788611

R2C-A scope reduction
  Design Contract v0.3
  PR #35
  merge 4929f03fc5813b307021cb2f7887f38ae01a27ed

R2C-A minimal source implementation
  PR #36
  reviewed head 845eecf1a27250e2e281cf32769ecce9a09f2e59
  merge 9ccef3917fe22ddaa4e11f9e33e0a0b48f82af0d
```

The v0.3 implementation was built from a clean worktree based on the v0.3
design merge rather than by preserving the superseded v0.2 benchmark framework.

## 3. Installed runtime architecture

```text
/admin/render-lab/performance
→ route-local requireAdmin()
→ dynamic client-only benchmark surface
→ explicit operator Start
→ one guarded local run-start provenance read
→ deterministic BENCHMARK_ONLY six-point synthetic input
→ AUTO / forced WEBGL2 benchmark backend
→ application-owned stage timing
→ hard safety / invalidation gates
→ per-sample bounded teardown and zero-owned-resource check
→ in-memory Result v2
→ explicit local JSON download
```

No automatic start, persistence, telemetry, upload, benchmark-owned external
request, installed-R2B control, cross-run admission, comparability engine,
lifecycle campaign, p90, Long Tasks, UA-specific memory, GPU timing, or
customer/product/order/manufacturing integration is installed.

## 4. Installed source inventory

### 4.1 Admin route and client boundary

```text
src/app/admin/render-lab/performance/page.tsx
src/app/admin/render-lab/performance/page.test.ts
src/app/admin/render-lab/performance/RenderPerformanceClient.tsx
src/app/admin/render-lab/performance/actions.ts
```

Owns route-local authorization, dynamic `ssr:false` loading, no page-load
provenance I/O, one guarded run-start provenance action, no navigation, and no
automatic execution.

### 4.2 Operator surface

```text
src/components/rendering/RenderPerformanceLab.tsx
```

Controls only browser/OS/device/power declarations, Start Characterization,
Run Verification Smoke, Cancel, and Download JSON.

Required disclosures include `BENCHMARK_ONLY`, `VISUAL_ONLY`,
`EXPLORATORY CHARACTERIZATION`, and explicit non-product/non-fit/non-production
language. The renderer host is fixed at 800 × 600 CSS pixels.

### 4.3 BENCHMARK_ONLY synthetic input

```text
src/lib/rendering/benchmark-input.ts
```

```text
generator:
  r2ca-synthetic-generator/v1
recipe:
  RADIAL_CROWN_FALL_V1
seed:
  20260808
points:
  exactly 6
levels:
  72 / 144 / 288 / 576 / 1152
```

The validated graph is bounded, uniquely identified, deeply immutable, and
kept outside canonical R2B `StrandAsset`, loader, compiler, codec and bundle
transport.

### 4.4 Measurement layer

```text
src/lib/rendering/benchmark-measurement.ts
```

Owns monotonic application timing, aggregate stage observation, one abortable
rAF boundary, and the frozen hard ceilings:

```text
single synchronous owned stage < 1000 ms
candidate-to-logical-ready       < 3000 ms
whole explicit session           < 15 minutes
```

### 4.5 Renderer benchmark seam

```text
src/lib/rendering/renderer-backend.ts
```

Normal R1/R2B initialization remains observer-free.

Benchmark aggregate stages are:

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

Actual backend and actual drawing-buffer / renderer-pixel-ratio state are
observed after `renderer.init()` and before geometry selection. Forced-WebGL2
mismatch or AUTO drift can therefore stop before higher-cell geometry.

`GEOMETRY_FINALIZE` owns the benchmark geometry transaction. The final C3
correction preserves truthful zero-resource evidence when a successful
`DISPOSE` itself reaches the 1,000 ms ceiling.

### 4.6 Runner

```text
src/lib/rendering/benchmark-runner.ts
```

Installed characterization schedule:

```text
72:   AUTO → WEBGL2
144:  WEBGL2 → AUTO
288:  AUTO → WEBGL2
576:  WEBGL2 → AUTO
1152: AUTO → WEBGL2
```

Per-profile progression is independent and requires the immediately previous
level to complete.

Characterization requires a CLEAN tree and local HEAD equal to local
`refs/remotes/origin/main`. The run-start action does not fetch.

Dirty or unmerged source may run only non-decision-bearing 72×6 smoke.

Sampling:

```text
characterization:
  1 warm-up + 5 measured per cell

verification smoke:
  72×6 only
  at most 1 warm-up + 1 measured per profile
```

Required sample timing fields:

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

`candidateToLogicalReadyMs` starts immediately before backend construction and
ends immediately after successful reveal/commit.

### 4.7 Result v2

```text
src/lib/rendering/benchmark-result.ts
```

```text
schema:
  mira.render-lab.r2ca-result
version:
  2
measurementContract:
  r2ca-v0.3
classification:
  BENCHMARK_ONLY
```

Result validation enforces exact shapes/vocabularies, actual backend authority,
fixed viewport/backing-buffer relationships, immediate profile progression,
terminal reason consistency, raw-sample summary recomputation, hard-ceiling
truth for valid samples, and zero cleanup for valid evidence.

Serialization is deterministic two-space JSON plus one LF. Persistence is local
download only.

### 4.8 Provenance

```text
src/lib/rendering/benchmark-provenance.server.ts
src/app/admin/render-lab/performance/actions.ts
```

One guarded run-start snapshot records commit, branch, tree state,
HEAD==local-origin/main admission, observation time, Next/Three versions,
generator/recipe and seed.

### 4.9 Tests

```text
src/lib/rendering/__tests__/benchmark-input.test.ts
src/lib/rendering/__tests__/benchmark-measurement.test.ts
src/lib/rendering/__tests__/benchmark-provenance.test.ts
src/lib/rendering/__tests__/benchmark-result.test.ts
src/lib/rendering/__tests__/benchmark-runner.test.ts
src/lib/rendering/__tests__/renderer-benchmark-instrumentation.test.ts
src/lib/rendering/__tests__/prototype-boundary.test.ts
src/app/admin/render-lab/performance/page.test.ts
```

These cover the v0.3 synthetic boundary, timing semantics, provenance,
Result v2, schedule/progression, hard stops, backend drift, cleanup,
renderer-stage ownership, admin boundary, and R2B/customer isolation.

## 5. Reviewed source chain

```text
initial minimal candidate:
  a5aa9c7c4f9bd5f4fff10800e3c9aab0d54beb306d695b85c20fa087ce076de2

after C1:
  b4f66dbbcf79b7ec853e3fb6b96adaf192328f6e1e10349b19443d92d6200f04

after C2:
  220733897609fca349c431e5cda44a11ceeddbc805082a7373af9d07894e0839

final reviewed C3 candidate:
  dcfde3da2cd06a6f90e1877a9f569e9a0d2fac4ea4842c22a18fbb258abe3117

implementation commit:
  845eecf1a27250e2e281cf32769ecce9a09f2e59

main merge:
  9ccef3917fe22ddaa4e11f9e33e0a0b48f82af0d
```

## 6. Historical verification evidence

```text
focused R2C-A:
  79 tests passed

full repository verification:
  223 files / 5,402 tests passed

production build:
  PASS

R2B compiler --check:
  PASS

refund-context:
  PASS

customer chunk isolation:
  PASS

package / lock / config / Prisma / visual-state invariance:
  PASS

git diff --check:
  PASS
```

Bounded browser verification used only 72×6 and observed:

```text
AUTO:
  WEBGPU

forced WEBGL2:
  WEBGL2
```

No 144+ decision-bearing browser run was performed before merge.

### 6.1 CI publication evidence

PR #36 head:

```text
845eecf1a27250e2e281cf32769ecce9a09f2e59
```

GitHub Actions run:

```text
31289917088
```

Final conclusion after failed-job rerun:

```text
SUCCESS
```

The first attempt failed in the existing payment concurrency integration test
`C1-7`. The same failed job on the same rendering commit passed when rerun.
PR #36 changed no payment path.

This record does not interpret that rerun as proof of the payment concurrency
invariant. The payment C1-7 nondeterminism is a separate high-risk follow-up,
outside R2C-A source authority.

## 7. Installed invariant ownership

```text
synthetic benchmark data != canonical R2B/product data
explicit start != automatic operation
verification smoke != decision-bearing characterization
requested backend != actual backend
clean source != current-main source
profile stop != session stop
CPU stage timing != GPU completion/presentation
zero harness ownership != proof of GC/GPU reclamation
installed source != characterization evidence
characterization evidence != production budget
characterization evidence != durable R2C-B architecture authority
```

## 8. Activation and seed/data state

```text
source installed on main:
  yes

internal admin surface installed:
  yes

decision-bearing 72→1152 characterization:
  NOT YET EXECUTED

database state:
  none

persistent benchmark rows:
  none

telemetry/upload:
  none

customer exposure:
  none

product / fit / commerce / order / manufacturing authority:
  none
```

## 9. Known limitations

This source cannot establish performance above 1,152×6, product-realistic hair
count/visual fidelity, R2B transport scaling, sustained FPS, GPU completion,
true GPU memory, absence of GC/GPU leaks, cross-device/browser portability, or
production performance budgets.

It installs a means of collecting exploratory evidence; it does not contain
that full evidence yet.

## 10. Re-entry gate for decision-bearing characterization

Before running the full characterization:

1. this Source Status / As-Built must be reviewed and merged;
2. `origin/main` must be freshly fetched locally;
3. the run checkout must be clean and HEAD must equal local `origin/main`;
4. use the admin-only surface;
5. deliberately record operator environment fields;
6. keep the page visible and 800 × 600 owned viewport stable;
7. make no source edits or branch changes during the run;
8. start only through `Start Characterization`;
9. preserve the resulting local JSON artifact;
10. independently review the result before opening/selecting an R2C-B task.

A separate bounded execution card may freeze the exact operational browser and
machine procedure before the first decision-bearing run.

## 11. R2C-B / R3 boundary

R2C-A may justify a targeted R2C-B experiment only after reviewed
characterization evidence exists.

R3 may rely on the current renderer envelope only after R2C-A evidence states
what that envelope actually is. A proposed R3 envelope above reviewed R2C-A
evidence requires a targeted extension or R2C-B experiment.

## 12. Rollback

Rollback removes/reverts the R2C-A implementation while preserving normal
R1/R2B behavior.

There is no R2C-A DB, storage, telemetry, uploaded asset, or customer state to
migrate or purge.

## 13. Change control

This Source Status describes PR #36 / merge
`9ccef3917fe22ddaa4e11f9e33e0a0b48f82af0d`.

Version/review it when material R2C-A source truth changes, including core
measurement boundaries, stage ownership, safety ceilings, schedule, Result v2,
provenance admission, persistence/network ownership, or activation boundary.

Do not rewrite Design Contract v0.3 to impersonate later source truth.
