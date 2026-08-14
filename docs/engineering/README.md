# Engineering Documentation

Engineering documents define repository-wide technical standards, internal
diagnostic design authority, reviewed source status, and implementation
boundaries. They do not by themselves activate customer, product, fitting,
commerce, order, or manufacturing behavior.

## Repository-wide standard

- [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md)
  — defines the Medium/High-risk artifact lifecycle, change control,
  source-status requirements, and activation separation used by the documents
  below.

## Payment provider protocol design

- [Eximbay EX2A Pure Protocol Kernel Design / Implementation Contract v0.1](./eximbay-ex2a-pure-protocol-kernel-design-contract-v0.1.md)
  — historical normative high-risk contract that froze the deterministic
  Eximbay `PAYMENT` pure-kernel design before implementation. Its original
  candidate status remains historical and is not rewritten by later source
  installation.
- [Eximbay EX2A Pure Protocol Kernel Source Status / As-Built v0.1](./eximbay-ex2a-pure-protocol-kernel-source-status-v0.1.md)
  — records the current installed and reviewed EX2A pure-kernel source from PR
  #47, its exact evidence, limitations, and re-entry gates. It grants no
  Eximbay network, SDK, routing, ingress, persistence, completion, refund,
  sandbox, live, or other runtime authority.
- [Eximbay BF2 Shared-Test `/ready` Preflight Provider Evidence / Execution Contract v0.1](./eximbay-bf2-shared-test-ready-preflight-contract-v0.1.md)
  — historical normative execution authority and history for one separately
  invoked, sequential, at-most-three-request public shared-test `/ready`
  evidence action. It is not product/runtime activation.
- [Eximbay BF2 Shared-Test `/ready` Preflight Result Evidence / Independent Adjudication v0.1](./eximbay-bf2-ready-preflight-result-adjudication-v0.1.md)
  — binds the actual first shared-test Result by run ID, basename, byte count,
  and SHA-256; records valid custody, conformant execution, three exact
  accepted preparation observations, evidence limitations, explicit
  non-conclusions, and the EX2B1 design-contract gate. It grants no production
  or runtime activation.
- [Eximbay EX2B1 Provider Order Identity + Provider-Free `/ready` Preparation Design Contract v0.1](./eximbay-ex2b1-provider-order-ready-preparation-design-contract-v0.1.md)
  — historical normative high-risk contract for a Payment-owned persisted
  provider-order identity and provider-free server-side `/ready` request
  materialization. Its bounded audit corrections make collisions fail closed
  without automatic regeneration and prohibit Eximbay webhook-first row
  fabrication.
- [Eximbay EX2B1 Provider Order Identity + Provider-Free `/ready` Preparation Source Status / As-Built v0.1](./eximbay-ex2b1-provider-order-ready-preparation-source-status-v0.1.md)
  — records the reviewed EX2B1 source installed by PR #52, including durable
  per-Payment identity, database invariants, trusted persisted binding,
  provider-free READY preparation, review closure, verification evidence, and
  deferred gates. It grants no provider contact, credential, SDK, routing,
  callback, completion, refund, void, test/live runtime activation, or merchant
  capability.
- [Eximbay BF3 Static JavaScript SDK Evidence / Execution Contract v0.1](./eximbay-bf3-static-javascript-sdk-evidence-contract-v0.1.md)
  — candidate high-risk contract for two sequential credential-free static
  GETs, TEST V2 then TEST V1, only after reviewed merge and separate explicit
  invocation. It preserves the current official v1/v2 conflict, keeps the
  canonical SDK unresolved, separates SDK-asset and REST-API version axes,
  separates immutable semantic Result-v1 from non-recursive
  PackageIntegrity-v1 custody evidence, prohibits JavaScript execution, and
  grants no current provider contact, SDK load, payment page, EX2B2 source, or
  runtime activation authority.
- [Eximbay BF3 Static JavaScript SDK Result Evidence / Independent Adjudication v0.1](./eximbay-bf3-static-sdk-result-adjudication-v0.1.md)
  — records one completed conformant BF3 execution, valid package admission,
  invalid/incomplete semantic evidence, disposition
  `BF3_EVIDENCE_INVALID_OR_INCOMPLETE`, no rerun authority, and blocked EX2B2.
- [Eximbay BF3-R1 Content-Type Anomaly Retained-Byte Derived-Evidence Contract v0.1](./eximbay-bf3-r1-content-type-anomaly-retained-byte-evidence-contract-v0.1.md)
  — installed, review-closed zero-provider-contact retained-byte
  derived-evidence contract. It authorizes no current provider contact,
  preserves the historical BF3 run as immutable, and keeps EX2B2 blocked.
- [Eximbay BF3-R1 E1 Derived-Evidence Result Evidence / Independent Adjudication v0.1](./eximbay-bf3-r1-derived-evidence-result-adjudication-v0.1.md)
  — installed, review-closed durable result record for the completed BF3-R1 E1
  run: package valid, execution conformant, derived semantic evidence
  complete/admitted, re-execution not authorized, next lawful gate
  `NO_PROVIDER_CONTACT_NEEDED_YET`, and EX2B2 blocked.
- [Eximbay BF3-R1 Lifecycle Closure / Authority Reconciliation v0.1](./eximbay-bf3-r1-lifecycle-closure-v0.1.md)
  — installed lifecycle authority through PR #59 merge
  `dc0c90b66ea4e1d901e152714e4c9b8959bb6bb7` for the independently
  installed and review-closed BF3-R1 contract and result/adjudication record.
  Its exact merge-time file identity is `10013` bytes and SHA-256
  `53ab1638326a6e377aa92eec25257afde50fd3a7b5b79fdf4fed30c2db392880`.
- [Eximbay BF3-R2 Offline ECMAScript Syntax / Bounded Source-Shape Evidence Contract v0.1](./eximbay-bf3-r2-offline-ecmascript-source-shape-evidence-contract-v0.1.md)
  — final corrected candidate after the installed PR #59 BF3-R1 lifecycle
  closure. BF3R2-AUD-001 and BF3R2-AUD-003..010 are closed. The AUD-002 exact
  Harness V4 count/SHA correction is complete and awaits one final focused
  closure review. Harness V4, Launcher V3, and Process Matrix V2 are frozen;
  the 10-vector production-schema regression rejected wrong positive count and
  alternate valid SHA while accepting the exact derived harness identity, and
  the 31-vector process matrix passed. Synthetic authority cannot create
  production evidence, PackageIntegrity, or `PACKAGE_VALID`. BF3-R2 is not
  installed or authorized for execution; retained SDK parsing/compile/evaluation
  and provider/browser activity remain none, the canonical SDK is unresolved,
  and EX2B2 remains blocked.
- [Eximbay BF3 Vendor Clarification / Current Official Documentation Authority Adjudication v0.1](./eximbay-bf3-vendor-clarification-authority-adjudication-v0.1.md)
  — human-reviewed documentation-only adjudication that preserves all BF3/BF3-R1/BF3-R2
  history, reconciles direct vendor clarification with current official
  documentation as JavaScript SDK v2 plus REST API v1, records the swapped
  vendor-email environment bullets as a pending conflict, and unblocks EX2B2
  for Design Contract work only. It grants no source, provider-contact,
  SDK/browser, credential, sandbox, live, or BF4 authority.
- [Eximbay EX2B2 READY Transport + JavaScript SDK Browser Handoff Design Contract v0.1](./eximbay-ex2b2-ready-transport-sdk-handoff-design-contract-v0.1.md)
  — human-reviewed documentation-only high-risk Design Contract, installed by
  PR #65 / merge `82bb1589a7c221773104f5320beeab77dac6646a`, separating
  server-side READY transport from the browser SDK v2 handoff, with no source
  or runtime authority.
- [Eximbay EX2B2 READY Transport + JavaScript SDK Browser Handoff Threat / Failure Model v0.1](./eximbay-ex2b2-ready-transport-sdk-handoff-threat-model-v0.1.md)
  — human-reviewed documentation-only Threat / Failure Model installed with
  the same design authority; it grants no provider contact, SDK load/execution,
  or activation authority.
- [Eximbay EX2B2-S1 READY Kernel Source Status / As-Built v0.1](./eximbay-ex2b2-s1-ready-kernel-source-status-v0.1.md)
  — records the reviewed S1 source merged by PR #66 / merge
  `2bc5ad6ece6c429c2ad1375a99cb5ccfacc3dadd`: deterministic READY plan
  construction, bounded strict response admission, exact plan/success
  provenance, and final persisted-order SDK-wire materialization. It does not
  install provider networking, credentials, SDK loading/execution, generic
  initiation integration, BF4, routing, or sandbox/live activation; persisted
  `Payment.mode` provenance remains the mandatory S2 pre-contact gate.

## Render Lab foundation

- [Render Lab Prototype Decision v0.1](./render-lab-prototype-decision-v0.1.md)
  — records the internal browser-renderer prototype boundary and its explicit
  non-authority.
- [Strand Bundle + Async Loader Design Contract v0.1](./strand-bundle-async-loader-design-contract-v0.1.md)
  — governs the protected diagnostic strand bundle, loader, and replacement
  lifecycle.
- [Strand Bundle + Async Loader Source Status v0.1](./strand-bundle-async-loader-source-status-v0.1.md)
  — records the reviewed installed R2B source, evidence, limitations, and
  re-entry gates.

## Browser/runtime scaling characterization

- [Render Runtime Scaling Measurement Design Contract v0.3](./render-runtime-scaling-measurement-design-contract-v0.3.md)
  — current R2C-A design authority upon reviewed merge. It narrows R2C-A to a
  bounded exploratory renderer-scaling characterization: 72–1,152 synthetic
  strands at six points, AUTO and forced WebGL2, truthful application-owned
  stage timing, simple hard safety stops, per-sample cleanup truth, one
  clean-source run-start provenance snapshot, and a small local result
  artifact. It may justify a targeted R2C-B experiment but does not select a
  durable renderer or asset architecture.
- [Render Runtime Point/Tessellation Sensitivity Design Contract v0.1](./render-runtime-point-sensitivity-design-contract-v0.1.md)
  — bounded R2C-A-S1 follow-up contract. It isolates the coupled three/six/eight
  point and longitudinal-tessellation sensitivity of `GEOMETRY_CREATE` at 576
  and 1,152 strands on AUTO, preserves the frozen R2C-A v0.3 identity, and may
  choose only the target of a later bounded R2C-B prototype.
- [R2C-A-S1 Point/Tessellation Sensitivity Source Status / As-Built v0.1](./render-runtime-point-sensitivity-source-status-v0.1.md)
  — records the exact source merged by PR #39 / merge `f2a3db9`, its mapping to
  the frozen S1 contract, Result-v1 causal-validator and cleanup behavior,
  verification history, and the historical installation-time boundary that
  the primary six-cell characterization had not yet executed and granted no
  R2C-B authority.
- [R2C-A-S1 Point/Tessellation Sensitivity Result Evidence / Adjudication v0.1](./render-runtime-point-sensitivity-result-adjudication-v0.1.md)
  — binds the reviewed primary Result v1 by filename and SHA-256, records
  canonical validation and independent raw-evidence recomputation, preserves
  the Chrome 151 versus declared-major 140 metadata limitation, freezes
  `MIXED_OR_NONLINEAR` with no remedy selected, and leaves R2C-B inactive.
- [R2C-A-S2 Control-Point × Longitudinal-Tessellation Decoupling Design / Experiment Contract v0.1](./render-runtime-control-point-tessellation-decoupling-design-contract-v0.1.md)
  — freezes the eight-cell P3/P8 × T6/T21 factorial characterization at 576
  and 1,152 strands, freezes pre-sample browser product/major admission, keeps
  robust interaction direction descriptive unless a compatible qualitative
  crossover occurs, and leaves R2C-B inactive.
- [R2C-A-S2 Control-Point × Longitudinal-Tessellation Decoupling Source Status / As-Built v0.1](./render-runtime-control-point-tessellation-decoupling-source-status-v0.1.md)
  — records the exact source merged by PR #43 / merge `d5807dd`, its frozen
  eight-cell workload, benchmark-only renderer seam, causal Result validator,
  source-review closure, verification evidence, and the historical
  installation-time boundary before primary execution. It grants no R2C-B
  authority.
- [R2C-A-S2 Control-Point × Longitudinal-Tessellation Decoupling Result Evidence / Independent Adjudication v0.1](./render-runtime-control-point-tessellation-decoupling-result-adjudication-v0.1.md)
  — binds the completed primary Result by canonical filename, 98,778-byte
  count, and SHA-256; records canonical validation and independent raw-evidence
  recomputation; confirms evidence validity `VALID` and disposition
  `UNRESOLVED`; and freezes next target `NONE`, no renderer remedy, and no
  R2C-B activation.
- [R2C-A Minimal Renderer Characterization Source Status v0.1](./render-runtime-scaling-measurement-source-status-v0.1.md)
  — records the reviewed R2C-A v0.3 source installed by PR #36 / merge
  `9ccef3917fe22ddaa4e11f9e33e0a0b48f82af0d`, its installed invariant
  ownership, verification evidence, limitations, and the re-entry gate for the
  first decision-bearing characterization. The 72→1,152 characterization is
  not claimed to have run merely because the source is installed.
- [Render Runtime Scaling Measurement Design Contract v0.2](./render-runtime-scaling-measurement-design-contract-v0.2.md)
  — historical decision-grade predecessor. It is superseded by v0.3 upon
  reviewed merge; its network-ownership clarification is inherited by v0.3.
- [Render Runtime Scaling Measurement Design Contract v0.1](./render-runtime-scaling-measurement-design-contract-v0.1.md)
  — historical predecessor superseded by v0.2 and subsequently v0.3.

## Authority and lifecycle

A Design Contract freezes semantics and boundaries but does not prove source is
installed or authorize production/customer activation.

After a reviewed source merge, install the applicable Source Status / As-Built
record required by the
[Feature Documentation Standard](./feature-documentation-standard-v0.1.md).

Rendering work remains separate from Product Specification, fitting, commerce,
orders, and manufacturing unless a later contract explicitly establishes such
an integration.
