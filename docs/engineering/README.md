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
