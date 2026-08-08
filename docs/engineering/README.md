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

- [Render Runtime Scaling Measurement Design Contract v0.2](./render-runtime-scaling-measurement-design-contract-v0.2.md)
  — current R2C-A design authority upon reviewed merge. It governs the
  admin-only benchmark surface, benchmark-only input, measurement semantics,
  safety/admission rules, provenance, result evidence, and network ownership.
  R2C-A-owned external traffic, telemetry, uploads, and third-party benchmark
  assets remain prohibited. Independently attributed pre-existing shared
  application-shell traffic receives no R2C-A authority or dependency.
- [Render Runtime Scaling Measurement Design Contract v0.1](./render-runtime-scaling-measurement-design-contract-v0.1.md)
  — historical predecessor. It is superseded by v0.2 upon reviewed merge.

## Authority and lifecycle

A Design Contract freezes semantics and boundaries but does not prove source is
installed or authorize production/customer activation.

After a reviewed source merge, install the applicable Source Status / As-Built
record required by the
[Feature Documentation Standard](./feature-documentation-standard-v0.1.md).

Rendering work remains separate from Product Specification, fitting, commerce,
orders, and manufacturing unless a later contract explicitly establishes such
an integration.
