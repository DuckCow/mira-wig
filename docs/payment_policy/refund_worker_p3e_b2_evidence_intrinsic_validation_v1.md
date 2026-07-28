# Refund worker P3E-B2 evidence-v2 intrinsic validation v1

Status: dormant provider-free correctness composition only.

```text
TB2A_INTRINSIC_VALIDATION_TRUTH:
INTRINSIC_ONLY_NOT_FRESHNESS_NOT_PROVIDER_TRUTH

TB2A_INTRINSIC_VALIDATION_PACKAGE_ID: NONE
TB2A_INTRINSIC_VALIDATION_FRESHNESS: NOT_EVALUATED
TB2A_INTRINSIC_VALIDATION_PROVIDER_TRUTH: NOT_ATTESTED
TB2A_INTRINSIC_VALIDATION_SOURCE_COMMIT_APPROVAL: NONE
TB2A_INTRINSIC_VALIDATION_STORAGE: NONE
TB2A_INTRINSIC_VALIDATION_WRITER: NONE
TB2A_INTRINSIC_VALIDATION_REVIEW: NONE
TB2A_INTRINSIC_VALIDATION_READINESS: NONE
TB2A_INTRINSIC_VALIDATION_MUTATION_AUTHORITY: NONE
```

## Purpose and boundary

`validateTb2aIntrinsicEvidence` is a safe composition inside the existing
`scripts/refund-p3e-b2-bootstrap-readiness.mts` truth-source module. It is not a new package,
service, sandbox, or isolated security boundary. Callers can still import the existing full
evidence evaluators, so this bounded result is not an enforceable redaction sandbox around the
module.

An exact `{ "ok": true }` result proves only that the supplied evidence:

- is exact evidence v2 under the admitted UTF-8 and restricted JSON domain;
- has the exact v2 structure and internally coherent Method-A record;
- is already in the exact canonical representation;
- carries the exact digest of that representation; and
- has an internally coherent project-number and observation tuple.

The result does not return or preserve the evidence, canonical representation, digest,
disposition, identifier, nonce, timestamp, path, command, or source output.

## Truth limits

Intrinsic validation does not prove freshness. It does not prove that the project exists or that
the recorded lifecycle, billing classification, or API observations are true at the provider.
It does not prove effective caller identity, credential ownership, provider-side attribution,
nonrepudiation, or Cloud SDK binary provenance.

The repository commit field receives syntax validation only. Intrinsic validation does not prove
that the commit exists, identify it as approved, bind it to the running binary, or establish the
provenance of that binary.

The evidence nonce is evidence data. It is not proof of entropy, uniqueness, replay resistance,
single use, or custody identity.

No retention trust root, production-time trust root, or review trust root currently exists. This
surface has no storage, writer, filesystem-write, network, subprocess, signing, credential,
review, readiness, approval, or mutation authority.

## Version preservation

The TB1 v1 contract and schema and the TB2A evidence-v2 contract and schema remain unchanged. The
intrinsic validator requires the exact v2 version. It does not apply the v1 reviewer model, billing
precedence, `DISABLED` API state, or `BOOTSTRAP_API_ACTIVATION_REQUIRED` behavior to v2.

## Deferred architecture decisions

Future authority selection remains divided into three independent tracks:

- `P3E-B2-TIME-R0`: production and mutation-time time authority and failure semantics;
- `P3E-B2-REVIEW-R0`: review meaning, lawful consumer, reviewer trust root, and whether review is
  informational or authorizing;
- `P3E-B2-RETENTION-R0`: backend, administrator, deletion/recreation authority, retention,
  version-token semantics, audit, and backup.

The intrinsic validation composition remains reusable regardless of those future decisions.
