# Render Lab Prototype Decision v0.1

## Status

```text
DOCUMENT CLASS:
  BOUNDED PROTOTYPE DECISION
FEATURE STANDARD CLASSIFICATION:
  SMALL-CHANGE EXCEPTION — DOCUMENTED AND BOUNDED
SOURCE IMPLEMENTATION:
  AUTHORIZED ONLY BY THE CO-LOCATED R1 TASK CONTRACT
CUSTOMER ACTIVATION:
  NOT AUTHORIZED
PRODUCT / FIT / COMMERCE / MANUFACTURING AUTHORITY:
  NONE
CHANGE CONTROL:
  supersedes: none | superseded-by: none
```

## 1. Purpose

This record documents the technical and authority boundary of Mira's first
manufacturing-independent browser rendering experiment.

The experiment exists only to validate:

- browser GPU renderer lifecycle in the current Next.js/React application;
- WebGPU-preferred rendering with a WebGL2 fallback;
- a deterministic, in-memory single-strand diagnostic fixture;
- immediate visual colour and visual-density controls; and
- source boundaries that allow a later learned strand producer to replace the
  procedural fixture without coupling model output to React or Three.js scene
  objects.

It does not establish a production renderer, render-asset service, product
configuration system, fitting system, customer experience or manufacturing
representation.

## 2. Why the small-change exception applies

The first slice is not an administrator business workflow. It is a direct-path,
authenticated engineering diagnostic with:

```text
no database or durable state;
no server action or route handler;
no storage or external asset;
no provider or network contact;
no learned model or inference;
no customer route, PDP or fitting integration;
no WigStyle, WigVariant or TechnicalModel binding;
no order, payment, fulfilment or manufacturing behavior;
no customer activation.
```

The implementation PR contains this durable decision record, exact scope,
tests and non-authority statement. A separate documentation-only installation
PR would not materially reduce the risk of this bounded prototype.

## 3. Runtime decision

The prototype uses:

```text
Raw Three.js WebGPURenderer
WebGPU preferred
WebGL2 fallback
honest unsupported/error state
React Client Component lifecycle boundary
TSL/node-compatible material path where custom material logic is needed
```

R3F v10 alpha is excluded from R1. WebGPU-only customer support is not claimed.

## 4. Source architecture

Keep these meanings distinct:

```text
StrandSource
  produces renderer-neutral strand data

StrandAsset
  owns validated in-memory control points and per-strand attributes

RendererBackend
  owns Three.js/WebGPU/WebGL2 scene and GPU resources

VisualState
  owns ephemeral preview controls and camera/view state
```

The procedural fixture must not expose `THREE.Scene`, mesh, line, material or GPU
buffer objects as the `StrandSource` output contract.

## 5. Learned-model compatibility

A future learned system is expected to connect through:

```text
learned producer
→ Strand Asset Compiler
→ versioned Render Asset Bundle
→ StrandAsset loader
→ RendererBackend
```

R1 freezes no binary format, glTF extension, network schema, storage key or model
output format. It only proves the in-memory semantic seam.

R1 `StrandSource` is a synchronous in-memory prototype producer.
It is not the final network, storage, bundle or streaming loader API.
R2 must define the async loader and its binary/version/checksum/LOD contract
before learned assets are connected.
R1's 96-strand maximum and 3–8 control-point bounds are diagnostic fixture limits, not production learned-model limits.

## 6. Runtime parameter classes

The longer-term renderer distinguishes:

```text
SHADER_PARAMETER
STRAND_SELECTION
DEFORMATION_BASIS
ASSET_SWITCH
ASYNC_GENERATION
```

R1 implements only:

- preview colour as `SHADER_PARAMETER`;
- visual density tiers as deterministic `STRAND_SELECTION`.

Visual density is not a manufacturing density percentage. R1 does not implement
head/fit deformation, length/curl asset switching or generation jobs.

## 7. Explicit non-authority

The fixture and controls are:

```text
VISUAL_ONLY
NOT_ORDERABLE
NOT_FIT_EVIDENCE
NOT_PRODUCT_TRUTH
NOT_A_REAL_BASE_OR_CAP
NOT_AN_IMPLANTATION_MODEL
NOT_A_MANUFACTURING_SPECIFICATION
```

They must not use labels or claims that imply lace, TPU, PU, knotting, injection,
real density, real cap dimensions, fit accuracy or production feasibility.

## 8. Promotion gate

Before any later task adds persistence, external assets, learned inference,
customer rendering, fitting/PDP integration, product mapping, asset services,
telemetry, feature activation, commerce or manufacturing behavior, the work must
leave the prototype exception and install a reviewed full rendering Design
Contract under the repository Feature Documentation Standard.

## 9. R1 acceptance boundary

R1 is acceptable only if:

- the route is admin-authenticated and not customer-reachable;
- unrelated routes do not import or load the renderer;
- renderer lifecycle and resources are disposed on exit/re-entry;
- producer output is deterministic and renderer-neutral;
- visual density selection is stable;
- backend failure remains contained inside the diagnostic surface;
- no prohibited source or authority path changes; and
- tests, typecheck, lint, full suite, build and diff checks pass.
