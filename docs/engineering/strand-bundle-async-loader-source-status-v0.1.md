# R2B Strand Bundle and Async Loader Source Status v0.1

## Status

```text
DOCUMENT CLASS:
  SOURCE STATUS / AS-BUILT

FEATURE STANDARD CLASSIFICATION:
  MEDIUM

SOURCE STATE:
  INSTALLED ON MAIN

SOURCE ACTIVATION:
  INTERNAL ADMIN DIAGNOSTIC ONLY

CUSTOMER ACTIVATION:
  NOT AUTHORIZED

EXTERNAL ASSET / LEARNED MODEL / PRODUCT / FIT / COMMERCE / MANUFACTURING AUTHORITY:
  NONE

GOVERNING DESIGN:
  docs/engineering/strand-bundle-async-loader-design-contract-v0.1.md

DESIGN MERGE:
  PR #30
  972097cc8f6176c33ace69c5468a04aadf120fab

IMPLEMENTATION PR:
  #31

REVIEWED SOURCE HEAD:
  084cb0b230fa7bdc9d6c35fb8eca1db72b13d16f

MAIN MERGE:
  e63b7de793c765acd9c4ed9d6238389989660738

CHANGE CONTROL:
  supersedes: none | superseded-by: none
```

## 1. Purpose

This record describes the reviewed R2B source installed on `main`.

It records:

- what source exists;
- which component owns each installed invariant;
- what was verified before merge;
- what remains intentionally absent;
- the exact current activation boundary;
- rollback scope; and
- the re-entry gates for later rendering work.

This document does not redesign R2B and does not authorize a later phase. The
governing Design Contract remains normative for R2B semantics. This record is
descriptive source authority for the reviewed merge identified above.

## 2. Parent chain

The installed rendering chain is:

```text
Catalog Product Specification / rendering authority separation
  PR #28

R1 internal browser Render Lab
  PR #29
  merge 424f0dffd270d79f54f97bb9a4715fb27e9ef2b7

R2B Design Contract
  PR #30
  merge 972097cc8f6176c33ace69c5468a04aadf120fab

R2B source implementation
  PR #31
  reviewed head 084cb0b230fa7bdc9d6c35fb8eca1db72b13d16f
  merge e63b7de793c765acd9c4ed9d6238389989660738
```

R2B extends R1 without retiring these R1 meanings:

```text
StrandSource
  synchronous renderer-neutral producer seam

StrandAsset
  canonical validated in-memory strand semantics

RendererBackend
  Three.js, WebGPU/WebGL2 and GPU-resource ownership

VisualState
  ephemeral colour, density and view controls
```

R2B adds a reviewed byte-transport and async-loading layer before
`StrandAsset`.

## 3. Installed runtime architecture

The installed source path is:

```text
deterministic procedural fixture source
→ Strand Bundle compiler
→ canonical manifest.json + little-endian strands.bin
→ admin-protected same-origin route
→ bounded async browser loader
→ canonical JSON, length and SHA-256 verification
→ decode into existing validated StrandAsset
→ hidden candidate RendererBackend
→ candidate initialization and first render
→ atomic active-backend promotion
```

No browser procedural fallback is used after a bundle failure.

The procedural producer remains installed as:

- deterministic compiler input;
- test fixture;
- R1 semantic reference.

## 4. Installed source inventory

### 4.1 Bundle schema and codec

```text
src/lib/rendering/strand-bundle.ts
```

Installed ownership:

- schema-v1 literals and exact property order;
- canonical compact JSON plus one LF;
- exact-shape validation;
- byte-for-byte normalized manifest comparison;
- 1–8,192-byte manifest limit on encode and decode;
- Unicode General Category `Cc` rejection for strand IDs;
- one fixed little-endian binary layout;
- explicit `DataView` reads and writes;
- exact binary-length formula;
- no-padding and no-trailing-byte enforcement;
- Float32 canonicalization;
- reconstruction into the existing object-form `StrandAsset`;
- final semantic validation through `validateStrandAsset`.

The module is renderer-neutral and browser-safe. It owns no React, Three.js,
admin, storage, product, fitting, order or manufacturing object.

### 4.2 Async loader

```text
src/lib/rendering/strand-bundle-loader.ts
```

Installed ownership:

- one caller-owned `AbortSignal` across manifest and binary requests;
- same-origin credentials;
- redirect rejection;
- no-cache request behavior;
- status and exact content-type admission;
- canonical `Content-Length` validation when present;
- streamed actual-byte limits when absent or incorrect;
- reader cancellation on abort, overflow and terminal failure;
- containment of a rejecting stream-cancellation algorithm;
- strict UTF-8 decoding;
- canonical-manifest admission;
- SHA-256 verification through Web Crypto;
- binary decode and `StrandAsset` validation;
- abort identity distinct from terminal load failure.

Only validated asset and technical bundle identity escape the loader.

### 4.3 Protected route

```text
src/app/admin/render-lab/strand-bundle/[file]/route.ts
```

Installed ownership:

- Node runtime;
- route-local `requireAdmin()` in addition to `/admin/**` middleware;
- exact allowlist:
  - `manifest.json`;
  - `strands.bin`;
- fixed repository paths that do not derive from the route parameter;
- exact `401`, `403`, `404` and `200` behavior;
- empty denial and not-found bodies;
- exact success `Content-Type` and `Content-Length`;
- `Cache-Control: private, no-store` on all constructed responses;
- `X-Content-Type-Options: nosniff` on all constructed responses.

The route owns no upload, storage provider, directory listing, range protocol,
database access or external network contact.

Unexpected session or filesystem failures remain framework-owned `5xx`
behavior.

### 4.4 Deterministic compiler and fixture

```text
scripts/pack-render-lab-strand-bundle.mts

src/lib/rendering/fixtures/r2-diagnostic-v1/manifest.json
src/lib/rendering/fixtures/r2-diagnostic-v1/strands.bin
```

The compiler:

- instantiates the accepted R1 procedural fixture;
- validates and Float32-canonicalizes it;
- generates the manifest and binary twice;
- requires byte-identical outputs;
- supports write mode;
- supports read-only `--check`;
- compares tracked bytes without rewriting in check mode;
- requires density counts `24/54/72`;
- requires Float32 importance ranks to remain unique and strictly ordered.

Installed fixture evidence:

```text
assetId:
  render-lab.r2-diagnostic

assetVersion:
  1

classification:
  VISUAL_ONLY

strandCount:
  72

controlPointCount:
  432

manifest bytes:
  2,017

manifest SHA-256:
  933e73305159a53a889cb65e9577df9465aea244bdc3262edfbff1fcb64f68ec

binary bytes:
  6,340

binary SHA-256:
  15d308949b1cbfc3f4896b5d7ebd72b53df2ed45ec16f3ac141d8ff009676572

visual density subsets:
  LOW 24
  MEDIUM 54
  HIGH 72
```

These are diagnostic fixture facts, not product or manufacturing facts.

### 4.5 Viewport lifecycle and atomic replacement

```text
src/components/rendering/RenderLabViewport.tsx
```

Installed ownership includes:

- contained async setup through `initializeViewportRuntime`;
- dynamic-import and observer-setup failure containment;
- one shared latest-user-intent ordering across reload and mode operations;
- load generation, renderer generation and start-time active-entry identity;
- committed active backend mode;
- provisional candidate backend mode;
- hidden but measurable candidate host;
- first-render promotion gate;
- prior READY-render preservation during replacement;
- stale load and candidate suppression;
- atomic active-entry promotion;
- ordinary replacement warning without terminal teardown;
- one terminal coordinator teardown;
- pending load abort;
- candidate and active disposal;
- observer, host, pointer and frame cleanup;
- idempotent deactivation and stale-completion cleanup.

A stale reload or mode operation cannot:

- commit an asset;
- commit a mode;
- publish READY;
- publish a misleading replacement warning;
- replace a newer active entry; or
- dispose a newer active backend or host.

### 4.6 Page disclosure

```text
src/app/admin/render-lab/page.tsx
```

The page now states that the Render Lab consumes a committed synthetic
`VISUAL_ONLY` diagnostic bundle.

It does not present the result as:

- a real wig or base;
- product truth;
- fitting evidence;
- orderable configuration;
- production feasibility; or
- manufacturing specification.

### 4.7 Output tracing

```text
next.config.ts
```

The installed route-specific trace includes exactly the two committed fixture
paths required by the Node route.

The reviewed production build trace contained both fixture files and did not
widen the R2B application-input scope beyond the reviewed route dependencies.

## 5. Installed test inventory

```text
src/lib/rendering/__tests__/strand-bundle.test.ts
src/lib/rendering/__tests__/strand-bundle-loader.test.ts
src/app/admin/render-lab/strand-bundle/[file]/route.test.ts
src/lib/rendering/__tests__/renderer-lifecycle.test.ts
src/lib/rendering/__tests__/prototype-boundary.test.ts
```

The installed tests cover:

- canonical JSON and malformed-manifest rejection;
- duplicate and unknown members;
- alternate key order, whitespace and numeric spelling;
- malformed UTF-8 and BOM rejection;
- Unicode C0, DEL and C1 control rejection;
- accepted bounded non-control non-ASCII strand IDs;
- encoder and decoder byte limits;
- little-endian binary round-trip;
- malformed offsets, truncation and trailing data;
- NaN, Infinity and numeric limits;
- streamed response caps;
- declared and actual byte lengths;
- redirect and content-type rejection;
- SHA mismatch;
- abort identity and listener cleanup;
- rejecting `reader.cancel()` containment;
- route-local authorization and exact response headers;
- raw, encoded and double-encoded non-allowlisted route inputs;
- async setup failures;
- initial load and first-render commit;
- replacement preservation;
- provisional and committed backend mode;
- reload/mode cross-operation ordering;
- terminal teardown and resurrection prevention;
- route/output-trace and authority boundaries.

## 6. Review and verification evidence

### 6.1 Independent review

The final independent diff review disposition was:

```text
PASS — READY TO COMMIT
```

The reviewed implementation diff contained exactly 14 paths:

```text
5 tracked modifications
9 newly added files
```

No package, lockfile, Prisma, storage, payment/refund, fitting, shop, cart,
checkout, order, manufacturing, Product Media or Product Specification path
was changed.

### 6.2 Source verification

At the reviewed source head:

```text
C2 corrected suites:
  3 files / 54 tests passed

lifecycle and loader suites:
  2 files / 34 tests passed

focused R2B suites:
  5 files / 72 tests passed

literal npm run verify:
  216 files / 5,332 tests passed

typecheck:
  passed

repository-wide lint:
  passed

production build:
  passed

compiler --check:
  passed

git diff --check:
  passed
```

### 6.3 CI

GitHub Actions CI run `#275` completed successfully for reviewed source head:

```text
084cb0b230fa7bdc9d6c35fb8eca1db72b13d16f
```

The source was then merged by PR #31.

### 6.4 Browser evidence

Reviewed manual checks included:

- initial WebGPU READY;
- forced WebGL2 READY;
- colour changes;
- `24/54/72` density behavior;
- ordinary bundle reload;
- failed mode change preserving the active backend and mode;
- direct same-mode retry;
- older reload unable to revert a newer mode commit;
- older mode candidate unable to overwrite a newer reload;
- corrupted replacement preserving the prior READY render;
- active terminal failure preventing stale revival;
- authenticated resource delivery;
- route exit and re-entry;
- no uncaught browser error or Promise rejection;
- removal of every induced delay and fault before final review.

### 6.5 Cross-domain invariance

Reviewed values remained:

```text
package.json SHA-256:
  6aef9445c909d54808a350706f78a46075937c65064e39e2d3bfa68926e6be87

package-lock.json SHA-256:
  594ab37544f7c782fb66b246675022bfe803d63c9148dace3aa7f447926d3013

refund build-context digest:
  3c1b89b864e12719ed9f1841a6786404fc8b333e1e8c541d03df23e15342790b

refund context counts:
  148 files
  108 repository inputs
  45 packaged inputs
  3 entrypoints
```

No refund seal update was required.

## 7. Current activation and operational state

Current state:

```text
SOURCE:
  installed

ROUTE:
  admin-protected and callable

NAVIGATION:
  absent

CUSTOMER EXPOSURE:
  none

PERSISTENCE:
  none

EXTERNAL STORAGE:
  none

EXTERNAL PROVIDER:
  none

LEARNED MODEL:
  none

PRODUCT / VARIANT BINDING:
  none

FIT INTEGRATION:
  none

ORDERABILITY / COMMERCE:
  none

BUILD SPEC / MANUFACTURING:
  none

TELEMETRY:
  none
```

The route and Render Lab are an internal engineering diagnostic. Source
installation does not equal production or customer activation.

No separate operations runbook is required for this current nonpersistent,
provider-free, noncustomer diagnostic. A runbook becomes required before an
external asset service, operator workflow, production asset registry or
customer activation is introduced.

## 8. Known limitations

R2B does not prove:

- that the custom binary format is the permanent learned-output format;
- glTF/GLB inferiority or superiority;
- production strand counts;
- production memory, CPU, GPU or download budgets;
- direct packed-data rendering;
- importance-based LOD;
- compression, range requests or progressive loading;
- signatures or authenticity against a compromised origin;
- external storage or CDN delivery;
- asset registry, assignment, rights or readiness;
- learned-generator output quality or stability;
- head/fit deformation;
- product or variant compatibility;
- customer presentation;
- manufacturing feasibility.

The current implementation decodes into the existing object-form
`StrandAsset` and the current renderer continues to construct Three.js strand
geometry from that object model.

The existing Next.js middleware-convention deprecation warning is outside R2B.

## 9. Rollback

Before any later activation, rollback is source-only.

A rollback may revert PR #31 or equivalently:

- restore the five modified source/configuration paths;
- remove the new compiler, route, codec, loader, fixture and tests;
- return the browser Render Lab to the R1 synchronous procedural source.

No database, customer, storage, order or manufacturing cleanup exists or is
authorized because R2B owns none.

Rollback does not rewrite the Design Contract, this source-status record or the
decision-log history. A later deprecation or supersession record documents the
change.

## 10. Re-entry gates

A new reviewed Design Contract or contract version is required before any of
the following.

### 10.1 R2C scaling, LOD or packed rendering

Required before:

- increasing beyond R1/R2B diagnostic limits;
- defining production CPU, GPU, memory or network budgets;
- activating `importanceRank` as LOD;
- adding multiple assets or LOD tiers;
- adding a packed canonical in-memory model;
- changing `RendererBackend` to direct packed consumption;
- selecting or rejecting glTF/GLB as a durable format.

The first R2C task should gather measured scaling evidence before redesigning
the asset model or renderer.

### 10.2 Learned producer integration

Required before:

- consuming model-generated strand output;
- defining model-output schema;
- registering model/compiler versions;
- adding inference or generation jobs;
- storing learned assets;
- claiming learned asset quality, stability or reproducibility.

A learned producer must connect through a reviewed compiler and versioned
artifact boundary. It must not write React or Three.js scene objects directly.

### 10.3 External asset delivery

Required before:

- object storage, CDN or presigned URLs;
- upload or asset registration;
- persistent asset metadata;
- production caching;
- signatures, access revocation or asset retirement.

This requires separate authorization, threat/failure analysis and an
operations/rollback runbook.

### 10.4 Product, fitting and customer use

Required before:

- mapping a bundle to `WigStyle`, `WigVariant`,
  `TechnicalModelVersion` or `ConfigurationRevision`;
- composing customer fit/body input;
- showing a render on PDP or fitting routes;
- using rendering as product, fit or order evidence;
- customer analytics or experimentation;
- commerce or manufacturing use.

Product mapping, fit composition and customer activation remain separate
authorities and must not be inferred from R2B source installation.

## 11. Next recommended sequence

The recommended rendering sequence after this source-status installation is:

```text
R2C-A:
  measured browser/runtime scaling characterization

R2C-B:
  LOD and durable asset-format adjudication only if evidence requires it

R3:
  offline learned-producer and Strand Asset Compiler contract

R4:
  persistent/external render-asset service and registry, if needed

R5:
  fit/deformation composition under separate fit authority

R6:
  customer-surface and product activation under a dated activation record
```

R2C-A should not preselect packed rendering, glTF or a new asset model. It
should first measure the installed renderer and loader across controlled
diagnostic asset sizes and supported devices.

## 12. Change control

Review and version this source-status record when any of these materially
change:

- manifest or binary semantics;
- route or authorization boundary;
- loader transport, limits or integrity behavior;
- active/candidate lifecycle ownership;
- core source paths;
- renderer input model;
- external storage;
- LOD behavior;
- learned generation;
- product/fit/customer authority;
- activation state.

A source-status update describes reviewed source truth. It does not silently
rewrite the frozen R2B Design Contract.
