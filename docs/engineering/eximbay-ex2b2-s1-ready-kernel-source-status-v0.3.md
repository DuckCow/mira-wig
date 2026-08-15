# Eximbay EX2B2-S1 READY Kernel — Source Status / As-Built v0.3

## Status

```text
DOCUMENT CLASS: SOURCE STATUS / AS-BUILT
RISK CLASS: HIGH — PAYMENT PROVIDER TRANSPORT / RESPONSE ADMISSION
TASK CLASSIFICATION: SOURCE_ONLY / DOCUMENTATION_ONLY
VERSION: v0.3
SUPERSEDES: eximbay-ex2b2-s1-ready-kernel-source-status-v0.2.md
SUPERSEDED-BY: none
SOURCE: MERGED / INSTALLED / REVIEWED / UNCHANGED
INITIAL P8 INDEPENDENT DOCUMENTATION REVIEW: BLOCKER 0 / IMPORTANT 4 / MINOR 1
P8R CORRECTIONS: APPLIED
FINAL INDEPENDENT DOCUMENTATION CLOSURE: PASS — BLOCKER 0 / IMPORTANT 0 / MINOR 0
RUNTIME AUTHORITY: NONE
```

S1 production bytes remain unchanged. This v0.3 supersedes v0.2 only as the
current reachability record after the reviewed S3 merge. Historical v0.1 and
v0.2 remain byte-for-byte preserved.

## Governing chain and reviewed source

Precedence is:

1. [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md).
2. [EX2B2 READY Transport + SDK Browser Handoff Design Contract v0.1](./eximbay-ex2b2-ready-transport-sdk-handoff-design-contract-v0.1.md) and its [Threat / Failure Model v0.1](./eximbay-ex2b2-ready-transport-sdk-handoff-threat-model-v0.1.md).
3. Historical [S1 v0.1](./eximbay-ex2b2-s1-ready-kernel-source-status-v0.1.md) and immediate predecessor [S1 v0.2](./eximbay-ex2b2-s1-ready-kernel-source-status-v0.2.md).
4. Current upstream/downstream [EX2A v0.2](./eximbay-ex2a-pure-protocol-kernel-source-status-v0.2.md), [S2 v0.2](./eximbay-ex2b2-s2-ready-contact-source-status-v0.2.md), and [S3 v0.1](./eximbay-ex2b2-s3-browser-handoff-source-status-v0.1.md).
5. The exact reviewed S1/S2/S3 source and merge evidence below.

S1 source PR #66 reviewed head
`5dac5d92916cd539f15b7f2cda8f41f56cad4041` merged at
`2bc5ad6ece6c429c2ad1375a99cb5ccfacc3dadd`. Its final packet
`WIG_PAY_EXIM_EX2B2_S1_REVIEW_v0_3.zip` was 41813 bytes, SHA-256
`38ec4f46e1e5b15224fddae1b35f7f85dc69d676716045ca627951952dfc6ead`;
final independent source closure passed with open blocker/important zero. S2
source PR #69 merged at `bb2ab48176e9b6a5216e870616f4730fe9a85825`.
S3 source PR #71 reviewed head
`d66b34a001e4868e887912eb8c1a1fe1b523688b` merged at current main
`7d619c893f05ccc163dafb7eb6f07c16c055b0d0`.

```text
FINAL REVIEWED P8 PACKET:
  WIG_PAY_EXIM_EX2B2_S3_P8_REVIEW_v0_2.zip
  39039 bytes
  SHA-256 ef4fb2b8111974733fd853e174cc9d0cc3568187a5a1ad64a6eca2ebaf275d61
```

## Installed source responsibilities and identities

| Installed path | Bytes | SHA-256 | Current meaning |
|---|---:|---|---|
| `src/lib/payment/eximbay/ready-kernel.ts` | 17002 | `ca90ae98225676d56c5fd6822dfd908d4a409b0bb58e4a2f5d4238192b88244b` | unchanged pure/injected S1 kernel |
| `src/lib/payment/eximbay/__tests__/ready-kernel.integration.test.ts` | 29957 | `d75f61308f11c80f5c41f9d2dc1ae65b380fdbd04d594c07384be656e5f72ee9` | unchanged S1 behavior coverage |
| `src/lib/payment/eximbay/__tests__/s1-isolation.test.ts` | 10930 | `44e20776aff9f72d5b018b19181812b2eb5df3cb3d4320ed709257fad4efa106` | S3-reviewed current ownership guard |

S1 owns deterministic READY plan construction from a caller-supplied closed
mode, fixed READY endpoints, bounded serialized request admission, strict
response/content/UTF-8/JSON/fgkey admission, exact plan-success provenance,
and trusted SDK-wire data materialization. Transport remains an injected port.
S1 owns no DB, configuration, credential, lifecycle, concrete HTTP, SDK load,
browser invocation, routing, or BF4 authority.

## Current exact reachability

The installed AST/module-identity guard enforces:

```text
ready-kernel.ts importers:
  src/lib/payment/eximbay/ready-contact.ts
  src/lib/payment/eximbay/ready-http.ts
  src/lib/payment/eximbay/sdk-handoff.ts

ready-contact.ts importers:
  src/lib/payment/attempt/initiate.ts
  src/lib/payment/eximbay/sdk-handoff.ts

ready-http.ts importers:
  src/lib/payment/eximbay/ready-config.ts
  src/lib/payment/eximbay/ready-contact.ts
```

S2 owns persisted-mode/configuration, canonical purchaser facts, contact claim,
concrete one-shot HTTP and conservative outcome. S3 consumes the fresh
authority once and calls `materializeTrustedEximbaySdkWire(...)` only after its
durable READY/Payment-lineage checks. S1's pure ownership does not expand when
S2 or S3 imports it.

## Review, validation, and known limitations

Initial S1 source review found B01, I01-I03 and M01; bounded S1R corrections
closed them. S1R2-I01 deferred persisted `Payment.mode` provenance to S2, where
the reviewed pre-contact gate now owns it. Historical S1 validation recorded
75 focused tests, 383 protected regression tests, and `npm run verify` 267
files / 5970 tests PASS. PR CI `31846538344` and post-merge CI `31847182344`
passed. S2 CI `31872599036` / `31872952017` and S3 CI `31888938288` /
`31889295693` also passed at their exact heads.

The clean local production build did not pass because the exact baseline and
candidate met the same Google Fonts network failure; no S1- or S3-attributable
build regression was observed. Merchant capability and live provider behavior
remain unproven. E1A/E1B are unexecuted, BF4 is absent, routing is disabled,
and there is no provider-contact or activation evidence.

## Rollback and recovery

Documentation rollback is a revert of the eventual P8 documentation merge.
Dormant S1 source rollback is a separately authorized revert of its reviewed
source merge; dormant S3 source rollback is a separately authorized revert of
`7d619c893f05ccc163dafb7eb6f07c16c055b0d0`. This P8 adds no schema rollback.
Neither rollback may rewrite a `CONTACTED`, `OUTCOME_UNKNOWN`, or `READY` row
as uncontacted. Provider inquiry, reconciliation, or recontact requires
separate reviewed authority.

## Re-entry and change control

A reviewed update/new version is mandatory for any importer-set change;
READY plan, endpoint, bound, parser/admission or plan/success provenance
change; SDK-wire materializer change; S2/S3 ownership shift; concrete
transport acquisition; or routing/provider-contact/activation change. The
historical v0.1/v0.2 records must not be rewritten.

After this reviewed P8 Source Status refresh is installed, the next D22 gate
is separately authorized E1A. This record does not authorize E1A.

**Non-authority:** no real credential is approved, read, or used; no provider
contact, real SDK load/execution, `request_pay`, BF4, routing, sandbox/live
runtime, or customer activation is authorized.
