# Strand Bundle and Async Loader Design Contract v0.1

## Status

```text
DOCUMENT CLASS:
  DESIGN CONTRACT
FEATURE STANDARD CLASSIFICATION:
  MEDIUM
STATUS:
  FROZEN v0.1 — SOURCE IMPLEMENTATION NOT AUTHORIZED
PARENT SOURCE:
  R1 internal Render Lab merged by PR #29
PARENT MERGE SHA:
  424f0dffd270d79f54f97bb9a4715fb27e9ef2b7
ACTIVATION:
  NONE
CUSTOMER / PRODUCT / FIT / COMMERCE / MANUFACTURING AUTHORITY:
  NONE
CHANGE CONTROL:
  supersedes: none | superseded-by: none
```

## 1. Purpose

This contract freezes Mira’s first bounded, asynchronous, versioned strand-bundle
boundary.

The purpose is to prove that a renderer-neutral strand artifact can be:

1. deterministically compiled from the accepted R1 procedural fixture;
2. transported as a protected, same-origin technical asset;
3. bounded and cancelled during browser loading;
4. checked for accidental or stale byte corruption;
5. decoded into the existing validated `StrandAsset`; and
6. committed to the existing renderer without coupling bundle meaning to
   React, Three.js scene objects, product identity, fitting, commerce or
   manufacturing.

This contract does not authorize source implementation. A separate
Implementation Task Contract must cite this document and the synchronized
merged baseline.

## 2. Human adjudication of reconnaissance

The read-only R2 reconnaissance is accepted with the following dispositions.

```text
SELECT:
  admin-protected route-handler delivery

SELECT:
  one fixed little-endian binary payload

SELECT:
  direct decode into the existing StrandAsset object model

SELECT:
  SHA-256 mismatch detection through Web Crypto

REJECT:
  public/ fixture delivery

REJECT:
  bundler-inlined or bundler-emitted fixture delivery

REJECT:
  async wrapper with no byte transport

REJECT:
  generic bufferView/accessor indirection in schema v1

REJECT:
  a new PackedStrandAsset in R2B

REJECT:
  direct packed-data renderer conversion in R2B

DEFER:
  glTF/GLB or a project-specific glTF extension

DEFER:
  runtime importance-rank/LOD behavior

DEFER:
  external storage, CDN, upload or asset-registry architecture

DEFER:
  learned-model output and production-scale limits
```

The format is a diagnostic contract, not a declaration that the selected custom
binary is Mira’s permanent learned-output format.

## 3. Explicit scope

R2B governs only:

- a committed synthetic visual-only fixture;
- one exact JSON manifest schema;
- one exact raw-binary layout;
- deterministic packing and read-only verification;
- protected same-origin byte delivery;
- bounded streaming reads;
- real `AbortSignal` cancellation;
- lowercase SHA-256 payload verification;
- strict manifest and decoded-data validation;
- decode into the existing `StrandAsset`;
- stale-load suppression;
- atomic replacement of an active render;
- R1 WebGPU and WebGL2 compatibility;
- route, lifecycle, integrity and authority-boundary evidence.

R2B does not govern or authorize:

- customer routes, navigation, PDP or fitting;
- `WigStyle`, `WigVariant`, `TechnicalModelVersion`,
  `ConfigurationRevision`, order or manufacturing identity;
- Product Media assignment, rights, applicability or readiness;
- catalog storage, mock storage, object storage, CDN or presigned URLs;
- database state, Prisma models or migrations;
- external network/provider contact;
- learned inference, training, generation jobs or model hosting;
- production asset upload, registration, signing or activation;
- compression, encryption, signatures, range requests or progressive streaming;
- production strand-count or learned-model limits;
- customer analytics, telemetry or experimentation.

## 4. Authority separation

The meanings remain:

```text
procedural or future learned producer
  owns source-generation output

Strand Asset Compiler
  validates, Float32-canonicalizes and emits one technical bundle

Strand Bundle
  owns versioned visual-only transport bytes

Strand Bundle Loader
  owns transport, caps, cancellation, digest and decode

StrandAsset
  remains the canonical validated in-memory semantic object

RendererBackend
  owns Three.js objects, GPU resources and render lifecycle

VisualState
  owns ephemeral preview colour, density and view controls
```

A bundle, its `assetId`, its `assetVersion`, its strand IDs and its digest are
technical rendering identities only. They are not product, variant, fit, order,
customer, media-assignment or manufacturing identities.

## 5. Selected delivery boundary

The first bundle is served from a Node route under:

```text
/admin/render-lab/strand-bundle/[file]
```

Only these exact path parameters are admitted:

```text
manifest.json
strands.bin
```

The route must:

- be covered by the existing `/admin/**` middleware;
- independently call `requireAdmin()`;
- return `401` for `UNAUTHENTICATED`;
- return `403` for `FORBIDDEN`;
- return `404` for every non-allowlisted filename;
- never concatenate an untrusted path into a filesystem path;
- read only the two committed fixture files selected by an in-code allowlist;
- reject or ignore no alternate storage key;
- perform no provider, database or catalog-media access;
- emit `Cache-Control: private, no-store`;
- emit `X-Content-Type-Options: nosniff`;
- emit the exact content types frozen below; and
- expose no directory listing, range protocol or upload behavior.

Exact content types:

```text
manifest.json:
  application/json; charset=utf-8

strands.bin:
  application/octet-stream
```

The browser loader must use a same-origin relative route, same-origin
credentials and redirect rejection. A login-page redirect or other redirect is
a bounded load failure, not a manifest response.

## 6. Exact manifest schema v1

The canonical manifest has exactly this normative object shape and property
order:

```json
{
  "schema": "mira.rendering.strand-bundle",
  "schemaVersion": 1,
  "assetId": "render-lab.r2-diagnostic",
  "assetVersion": "1",
  "classification": "VISUAL_ONLY",
  "coordinateSystem": {
    "handedness": "RIGHT_HANDED",
    "upAxis": "Y",
    "unit": "SCENE_UNIT"
  },
  "binaryEndianness": "LITTLE_ENDIAN",
  "strandCount": 72,
  "controlPointCount": 432,
  "materialGroup": "PREVIEW",
  "defaultWidth": 0.01,
  "strandIds": ["strand-000"],
  "buffer": {
    "uri": "strands.bin",
    "byteLength": 6340,
    "sha256": "lowercase-64-hex"
  }
}
```

The numeric values and ID array above are illustrative except where this
contract states an exact literal or limit. The committed fixture’s generated
values are owned by the deterministic compiler and reviewed source.

### 6.1 Frozen literals

```text
schema:
  mira.rendering.strand-bundle

schemaVersion:
  1

classification:
  VISUAL_ONLY

coordinateSystem.handedness:
  RIGHT_HANDED

coordinateSystem.upAxis:
  Y

coordinateSystem.unit:
  SCENE_UNIT

binaryEndianness:
  LITTLE_ENDIAN

materialGroup:
  PREVIEW

buffer.uri:
  strands.bin
```

### 6.2 Identity constraints

`assetId` and `assetVersion` must:

- be strings;
- be non-empty after no normalization;
- contain only ASCII letters, digits, `.`, `_` and `-`;
- be at most 64 bytes in UTF-8 each; and
- carry no product, variant, fit, order or manufacturing meaning.

For the first committed R2B fixture they are exactly:

```text
assetId:
  render-lab.r2-diagnostic

assetVersion:
  1
```

Changing payload bytes or any schema-v1 semantic value requires a reviewed
asset-version change. This is review/change-control evidence, not cryptographic
authenticity.

### 6.3 Strand-ID constraints

`strandIds` is R2B object-model compatibility metadata.

It must:

- be an array of exactly `strandCount` strings;
- preserve the accepted procedural fixture’s exact IDs;
- contain unique values by exact string comparison;
- contain no empty or whitespace-only value;
- contain no control character;
- limit each encoded UTF-8 value to 64 bytes.

R2B does not declare strand IDs a permanent learned-output field.

### 6.4 Exact-shape and canonical-JSON rule

Unknown fields are rejected at the top level and in every nested object.

The runtime loader must:

1. read UTF-8 bytes with no BOM;
2. reject malformed UTF-8;
3. parse JSON;
4. validate exact keys, types, literals and limits;
5. construct a new normalized manifest object in the property order frozen in
   this section;
6. serialize it with `JSON.stringify(normalizedManifest)` with no indentation;
7. append exactly one LF byte; and
8. require byte-for-byte equality with the received manifest.

The deterministic compiler emits that exact compact JSON plus one LF.

This comparison rejects:

- unknown members;
- duplicate members;
- alternate key order;
- alternate whitespace;
- a BOM;
- alternate numeric spelling;
- trailing non-LF bytes; and
- noncanonical but parseable manifests,

without adding a JSON-parser dependency.

The manifest itself is not an authenticity envelope. SHA-256 below detects
payload mismatch against the manifest served by the same trusted application
origin.

## 7. Exact binary layout v1

R2B uses exactly one non-interleaved little-endian buffer with five regions and
no generic buffer-view or accessor records.

```text
Region 1 — POSITIONS
  Float32
  length = controlPointCount × 3
  xyz order

Region 2 — STRAND_OFFSETS
  Uint32
  length = strandCount + 1

Region 3 — WIDTHS
  Float32
  length = strandCount

Region 4 — DENSITY_RANKS
  Float32
  length = strandCount

Region 5 — IMPORTANCE_RANKS
  Float32
  length = strandCount
```

Derived byte offsets:

```text
positionsByteOffset:
  0

strandOffsetsByteOffset:
  12 × controlPointCount

widthsByteOffset:
  strandOffsetsByteOffset + 4 × (strandCount + 1)

densityRanksByteOffset:
  widthsByteOffset + 4 × strandCount

importanceRanksByteOffset:
  densityRanksByteOffset + 4 × strandCount
```

Exact total length:

```text
12 × controlPointCount + 16 × strandCount + 4
```

Trailing bytes, padding, alternate ordering and multiple buffers are rejected.

The R1 72-strand, 432-point fixture therefore has an expected binary size of:

```text
6,340 bytes
```

The maximum R2B diagnostic shape, 96 strands and 768 points, has an expected
binary size of:

```text
10,756 bytes
```

## 8. Diagnostic limits

These are loader and diagnostic-fixture limits only.

```text
manifest bytes:
  1..8192

buffers:
  exactly 1

binary bytes:
  1..16384 and exact formula match

strandCount:
  1..96

controlPointCount:
  3..768

points per strand:
  3..8

coordinate component:
  finite and absolute value <= 10

width:
  finite, > 0 and <= 0.08

defaultWidth:
  finite, > 0 and <= 0.08

densityRank:
  finite and in [0, 1)

importanceRank:
  finite and in [0, 1)

sha256:
  lowercase 64 hexadecimal characters
```

`importanceRank` must round-trip independently, but R2B adds no LOD tier,
importance selection, UI control or runtime behavior.

## 9. Offset and decoded-data invariants

The decoder must reject unless:

- the first offset equals `0`;
- offsets are strictly increasing;
- every adjacent offset difference is in `3..8`;
- the last offset equals `controlPointCount`;
- array lengths match the manifest and exact byte formula;
- every numeric value is finite and in the declared range;
- strand ID count and uniqueness are valid;
- no trailing byte exists; and
- the reconstructed object passes the existing `validateStrandAsset`.

Bounds are derived from decoded Float32 positions. They are not supplied by the
manifest.

The adapter reconstructs each accepted `StrandRecord` with:

```text
id:
  corresponding strandIds entry

points:
  positions selected by consecutive strand offsets

width:
  corresponding widths entry

densityRank:
  corresponding densityRanks entry

importanceRank:
  corresponding importanceRanks entry

materialGroup:
  PREVIEW
```

The existing `StrandAsset`, `StrandRecord`, `validateStrandAsset`,
`VisualState`, `RendererBackend` and synchronous procedural `StrandSource`
remain canonical and are not retired.

## 10. Float32 canonicalization

The deterministic compiler must not claim equality to arbitrary JavaScript
double values.

It must:

1. validate the source procedural asset;
2. convert every encoded numeric payload value through explicit Float32
   canonicalization;
3. reconstruct the canonical object-form asset from those Float32 values;
4. derive bounds from the canonical positions;
5. run existing object validation against that canonical asset;
6. emit the binary and canonical manifest; and
7. in `--check` mode, reproduce and compare both tracked files byte-for-byte.

Round-trip tests compare decoded values to the Float32-canonical asset.

The accepted R1 density subsets must remain exactly:

```text
LOW:
  24

MEDIUM:
  54

HIGH:
  72
```

The first fixture’s importance values must remain unique and strictly ordered
after Float32 conversion, but this does not activate LOD behavior.

## 11. Async loader contract

The loader owns transport and validation but no rendering objects.

It must:

- accept an `AbortSignal`;
- request only the protected canonical manifest route;
- require HTTP `200`;
- reject redirects;
- require the canonical manifest content type;
- enforce a canonical `Content-Length` cap when present;
- still stream and enforce the actual-byte cap;
- cancel the reader on abort, overflow or terminal failure;
- decode manifest UTF-8 strictly;
- apply the canonical-manifest rule;
- derive and request only the allowlisted `strands.bin` route;
- require HTTP `200` and binary content type;
- enforce canonical declared and actual size caps;
- require actual bytes to equal both manifest `byteLength` and the formula;
- calculate SHA-256 through Web Crypto;
- compare the lowercase digest in constant semantic form;
- decode through explicit little-endian `DataView` reads;
- construct a fresh object-form `StrandAsset`;
- validate it; and
- return only the validated asset and technical bundle identity.

The loader must not return:

- raw unvalidated manifest objects;
- Three.js objects;
- a `PackedStrandAsset`;
- response or reader objects;
- URLs or storage keys as asset meaning;
- product, fit, order or manufacturing identity.

No new runtime or development dependency is authorized.

## 12. Load, replacement and lifecycle semantics

Asset loading and renderer construction have separate generation ownership.

### 12.1 Initial load

For an initial page entry:

1. create one asset-load generation and one `AbortController`;
2. fetch, verify, decode and validate the bundle;
3. construct and initialize a backend only after validation;
4. require backend initialization and first render to succeed;
5. then commit the bundle and backend as active.

Before that commit, the surface is not `READY`.

A terminal initial failure produces one bounded diagnostic `FAILED` state and
must leave no observer, reader, frame, backend or pointer resource active.

### 12.2 Replacement load

R2B may expose one admin-only diagnostic control:

```text
Reload diagnostic bundle
```

Starting replacement:

- aborts any older pending asset load;
- increments the asset-load generation;
- leaves the currently active asset, canvas and backend visible;
- does not dispose the active backend; and
- may show a non-authoritative loading indicator.

A replacement commits only after:

1. both responses complete;
2. digest, decode and object validation pass;
3. a replacement backend initializes; and
4. its first render succeeds.

Only then may the implementation atomically:

- replace the active asset/backend reference; and
- dispose the previous backend.

A failed or corrupted replacement:

- reports a bounded replacement error;
- leaves the previous active render in `READY`;
- does not clear or dispose that active backend; and
- creates no partial bundle authority.

An aborted or stale completion is not a user-visible terminal failure and
cannot commit state.

### 12.3 Unmount and mode changes

Unmount must:

- abort the active load controller;
- cancel active readers;
- invalidate pending generations;
- disconnect observers;
- clear pointer state; and
- dispose every owned backend once or idempotently.

A WebGPU/WebGL2 mode change may rebuild a backend from the active validated
asset without refetching bytes unless an explicit diagnostic reload is
requested.

## 13. Source forecast and ownership

A later reviewed implementation task may authorize only the minimum paths below.

### New source

```text
src/lib/rendering/strand-bundle.ts
src/lib/rendering/strand-bundle-loader.ts
src/app/admin/render-lab/strand-bundle/[file]/route.ts
```

### Modified source

```text
src/components/rendering/RenderLabViewport.tsx
src/app/admin/render-lab/page.tsx
next.config.ts
```

### Committed fixture

```text
src/lib/rendering/fixtures/r2-diagnostic-v1/manifest.json
src/lib/rendering/fixtures/r2-diagnostic-v1/strands.bin
```

### Deterministic compiler

```text
scripts/pack-render-lab-strand-bundle.mts
```

The compiler requires write mode and read-only `--check` mode. It must not
require a `package.json` script or a dependency change.

### New focused tests

```text
src/lib/rendering/__tests__/strand-bundle.test.ts
src/lib/rendering/__tests__/strand-bundle-loader.test.ts
src/app/admin/render-lab/strand-bundle/[file]/route.test.ts
```

### Modified tests

```text
src/lib/rendering/__tests__/renderer-lifecycle.test.ts
src/lib/rendering/__tests__/prototype-boundary.test.ts
```

`next.config.ts` may add only the narrow output-file tracing inclusion necessary
for the protected route’s two fixture files. The production build must prove
both files appear in the route trace.

Exact implementation paths remain subject to the later task’s baseline
reconnaissance. Material expansion requires stop and re-adjudication.

## 14. Prohibited paths and effects

The R2B implementation task must not change:

```text
public/**
package.json
package-lock.json
prisma/**
src/lib/storage/**
src/app/api/mock-storage/**
src/lib/payment/**
infra/refund-sandbox/**
containers/refund-worker/**
customer navigation
shop, fitting, cart, checkout or order source
manufacturing source
Product Media contracts
Product Specification contracts
the frozen R1 decision
environment or provider configuration
```

No refund seal file is expected to change.

Any dependency change, lockfile change, refund-context semantic change,
production storage contact, customer exposure or identity/authority leakage is
a stop condition.

## 15. Required evidence for implementation review

### Compiler and schema

- pack twice and compare manifest and binary byte-for-byte;
- `--check` passes against tracked fixture;
- canonical manifest round-trip passes;
- duplicate and unknown fields fail;
- malformed UTF-8, BOM, noncanonical order/whitespace and trailing bytes fail;
- exact count, size and formula rules pass and fail at boundaries.

### Binary and object model

- valid fixture decodes to the Float32-canonical `StrandAsset`;
- all IDs, points, widths, density and importance ranks round-trip;
- derived bounds agree with canonical decoded positions;
- malformed offsets, truncation, trailing bytes, NaN, Infinity and range
  violations fail;
- one-byte corruption causes SHA mismatch;
- LOW/MEDIUM/HIGH remain 24/54/72;
- importance ordering survives while no LOD behavior is claimed.

### Loading and lifecycle

- abort before manifest, during manifest, during binary and before commit;
- streamed caps cancel readers;
- stale completion cannot commit;
- initial failure leaves no resources;
- failed replacement preserves the previous active asset/backend;
- replacement commit occurs only after replacement first-render success;
- unmount and route re-entry leak no reader, observer, frame, canvas or backend.

### Route and authority

- unauthenticated route result is `401`;
- non-admin result is `403`;
- admin obtains exact two resources;
- unknown filename is `404`;
- traversal and encoded traversal cannot escape the allowlist;
- content types, no-store and nosniff are exact;
- no storage/provider/product/fit/order/manufacturing import or identity enters
  the feature;
- no customer route or navigation link exists.

### Browser

- actual manifest and binary requests return `200` for an admin;
- default WebGPU and forced WebGL2 render the decoded fixture;
- colour and 24/54/72 density behavior remain;
- throttled reload, route exit and re-entry prove cancellation and cleanup;
- an induced initial corruption reaches bounded `FAILED`;
- an induced replacement corruption preserves the prior `READY` render;
- the induction is removed before review.

### Global

```text
node --import tsx scripts/pack-render-lab-strand-bundle.mts --check
focused Vitest suites
npm run typecheck
npm run lint
npm run test
npm run build
npm run verify
git diff --check
node --import tsx scripts/build-refund-worker-bundles.mts --verify-context
```

Also inspect the route’s emitted `.nft.json` trace and run the exact refund
runtime-policy suites. `package.json`, `package-lock.json`, accepted lock digest,
refund context digest and context counts must remain unchanged.

## 16. Rollback

Before activation, rollback is source removal:

- remove the protected bundle route;
- remove the loader, bundle codec, compiler and committed fixture;
- remove the narrow output trace inclusion;
- restore the viewport to the synchronous R1 producer;
- remove R2B-only tests and controls.

No database, storage, customer or production data cleanup is permitted or
expected because R2B owns none.

A source rollback does not rewrite this contract or the historical decision
log. A later record documents retirement or supersession.

## 17. Known limitations and re-entry gates

R2B proves only a small protected technical fixture.

It does not prove:

- custom binary is superior to glTF/GLB at production scale;
- production memory or GPU performance;
- direct packed rendering;
- LOD selection;
- external storage delivery;
- signatures or origin authenticity;
- learned output stability or quality;
- customer authorization or caching;
- product assignment or commercial readiness.

A new reviewed contract or contract version is required before:

- increasing beyond R1 diagnostic limits;
- adding multiple buffers, compression or progressive loading;
- adding a packed canonical object model;
- changing the renderer to direct packed consumption;
- activating importance-based LOD;
- adding external assets or storage;
- connecting learned output;
- adding product, fit, customer or manufacturing mapping;
- exposing any customer surface.

## 18. Implementation gate

This frozen Design Contract alone authorizes no source change.

The next gate is a separate bounded Implementation Task Contract that must:

- verify synchronized `main` and a clean tree;
- cite this exact contract and parent merge;
- bind an exact branch and exact path set;
- preserve the prohibited paths and stop conditions;
- define test and browser evidence;
- require independent diff review before commit/merge; and
- require a post-merge source-status/as-built record.

