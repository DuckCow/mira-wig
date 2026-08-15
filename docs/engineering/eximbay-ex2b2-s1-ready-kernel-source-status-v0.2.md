# Eximbay EX2B2-S1 — READY Kernel Source Status / As-Built v0.2

## Status

```text
DOCUMENT CLASS:
  SOURCE STATUS / AS-BUILT

RISK CLASS:
  HIGH — PAYMENT PROVIDER TRANSPORT / RESPONSE ADMISSION / SDK HANDOFF DATA

TASK CLASSIFICATION:
  SOURCE_ONLY

TASK-LEVEL AUTHORIZATION:
  DOCUMENTATION_ONLY

SOURCE STATUS VERSION:
  v0.2

SUPERSEDES:
  eximbay-ex2b2-s1-ready-kernel-source-status-v0.1.md

SUPERSEDED-BY:
  none

EX2B2-S1 SOURCE:
  MERGED / INSTALLED / REVIEWED / UNCHANGED

CURRENT S1 PRODUCTION REACHABILITY:
  REVIEWED S2 DOWNSTREAM IMPORTERS INSTALLED

REAL EXIMBAY PROVIDER CONTACT:
  NONE / NOT AUTHORIZED

SDK LOAD / request_pay:
  NONE / NOT AUTHORIZED

ROUTING / BF4 / CUSTOMER ACTIVATION:
  DISABLED / NOT INSTALLED / NOT AUTHORIZED
```

## 1. Why v0.2 is required

The S1 production source bytes did not change. The current production
reachability and core ownership did change: the reviewed S2 source now imports
the unchanged S1 READY kernel through the exact reviewed allowlist. Therefore
the S1 v0.1 statement that there were no production importers is historical,
not current. This v0.2 record is the current S1 As-Built; the historical v0.1
file remains preserved byte-for-byte and is not rewritten.

This is a reachability/source-status refresh, not a redesign of S1 and not a
grant of provider-contact, SDK, BF4, routing, or activation authority.

## 2. Governing chain and installed source

The precedence for this record is:

1. [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md).
2. The installed EX2B2 parent Design Contract and Threat / Failure Model.
3. Installed EX2A / EX2B1 source-status authority.
4. This record's historical predecessor, S1 v0.1, preserved unchanged.
5. The exact merged S1 source, current isolation test, reviewed S2 source,
   and the PR/CI evidence below.

S1 was installed by PR #66 at merge
`2bc5ad6ece6c429c2ad1375a99cb5ccfacc3dadd`, from reviewed head
`5dac5d92916cd539f15b7f2cda8f41f56cad4041`; its source merge had three paths.
The later S2 source was reviewed at head
`002e1c778e650dc66767ef5dab5d1a7a3573b0ed` and merged at
`bb2ab48176e9b6a5216e870616f4730fe9a85825` by PR #69. S2's final reviewed
packet was `WIG_PAY_EXIM_EX2B2_S2_I1_SOURCE_REVIEW_v0_2.zip`, 34,015 bytes,
SHA-256 `fe79dc2b625c042705b3f49912965c8ec1770fd3c8308bd88fe0949ffe27e518`.

## 3. Preserved S1 source identities

The exact merged-main identities are:

| Installed path | Bytes | SHA-256 | As-Built |
| --- | ---: | --- | --- |
| `src/lib/payment/eximbay/ready-kernel.ts` | 17002 | `ca90ae98225676d56c5fd6822dfd908d4a409b0bb58e4a2f5d4238192b88244b` | unchanged S1 production kernel |
| `src/lib/payment/eximbay/__tests__/ready-kernel.integration.test.ts` | 29957 | `d75f61308f11c80f5c41f9d2dc1ae65b380fdbd04d594c07384be656e5f72ee9` | unchanged S1 behavior coverage |
| `src/lib/payment/eximbay/__tests__/s1-isolation.test.ts` | 9327 | `f9de1b3f636809e323d15bcf169a5daaf786e593d5bbdd58102126dffcbabaa3` | current S2-reviewed ownership guard |

`ready-kernel.ts` and its integration test are byte-identical to the installed
S1 source. `s1-isolation.test.ts` changed under the S2 merge only to replace a
weakened importer-string check with syntax-aware TypeScript AST/module-identity
detection and exact allowlists. No S1 production implementation byte changed.

## 4. Preserved S1 behavior

S1 remains a pure/injected kernel. Its installed truth is unchanged:

```text
deterministic READY plan construction:
  exact caller-supplied closed mode selects the fixed endpoint

fixed endpoints:
  SANDBOX https://api-test.eximbay.com/v1/payments/ready
  LIVE    https://api.eximbay.com/v1/payments/ready

request:
  POST, application/json, bounded serialized body

response:
  strict 2xx / content-type / UTF-8 / JSON-root / duplicate-key / fgkey admission

provenance:
  exact non-forgeable S1 plan and exact originating success identity

SDK-wire materializer:
  final data wire only; no SDK load, execution, or request_pay
```

S1 source owns no database/config/credentials/lifecycle/fetch authority:

```text
DB/config/credentials/lifecycle/fetch ownership:
  NO

network adapter:
  NO

transport:
  injected port only
```

S2 invokes this kernel but does not make S1 own provider networking. Concrete
HTTP, credentials/config, persisted claim, and lifecycle ownership remain in
the reviewed S2 modules.

## 5. Current reachability and isolation As-Built

The exact current production importer set for the S1 kernel is:

```text
src/lib/payment/eximbay/ready-contact.ts
src/lib/payment/eximbay/ready-http.ts
```

The exact reviewed S2 ownership sets are:

```text
ready-contact.ts production importer:
  src/lib/payment/attempt/initiate.ts

ready-http.ts production importers:
  src/lib/payment/eximbay/ready-config.ts
  src/lib/payment/eximbay/ready-contact.ts
```

The current `s1-isolation.test.ts` enforces these sets with TypeScript AST and
module identity. It recognizes static imports, exports, dynamic imports,
`require`, alias/relative resolution, and exact repository identities. It
rejects unexpected production importers and retains the S1 prohibition on
network, browser, database-write, credentials, lifecycle, logging, SDK,
callback, and routing authority.

This is a reviewed exact allowlist, not a promise that a later S3 slice may not
require a new reviewed reachability update.

## 6. S2 provenance gate disposition

S1 v0.1 deferred persisted `Payment.mode` provenance to S2. S1 itself still
does not establish that provenance. The reviewed S2 source now implements the
mandatory pre-contact gate: it reloads the persisted attempt and owner facts,
resolves the mode-bound atomic credential pair and strict public origin,
constructs the S1 plan, revalidates the exact facts, and claims the same
uncontacted Eximbay Payment before transport. Mode mismatch preserves the same
Payment and performs zero provider I/O.

Therefore the historical S1 limitation “S2 not implemented” is closed at the
S2 source-installation level, while S1's own ownership remains pure/injected.
This does not authorize provider contact, routing, S3, BF4, SDK execution, or
activation. S3 must still derive its environment/handoff from the same
authoritative attempt boundary under its future contract.

## 7. Historical validation and change history

The S1 source review and closure remain historical evidence bound to PR #66,
merge `2bc5ad6ece6c429c2ad1375a99cb5ccfacc3dadd`, and the installed source
identities above. The S2 source review corrected the reachability guard and
closed `I1R-I02`; the S2 packet and CI evidence are recorded in the current S2
Source Status v0.1. No S1 production source change occurred during that
correction or installation.

The current installed main is `bb2ab48176e9b6a5216e870616f4730fe9a85825`.
S2 PR CI `31872599036` and post-merge main CI `31872952017` completed
successfully at their exact reviewed identities.

## 8. Durable state and explicit non-authority

S1 still adds no schema, migration, durable READY state, credential seam,
concrete network adapter, routing registration, merchant capability, or runtime
configuration. The S2 source uses existing Payment fields but adds no lifecycle
state or schema. The following remain absent or unauthorized:

- real Eximbay HTTP contact or real credentials;
- SDK asset loading, SDK script execution, or `EXIMBAY.request_pay`;
- browser handoff, S3, status/BF4 verification, acknowledgement, or completion;
- refund/cancel/void, routing, feature activation, sandbox/live runtime, or
  customer use.

## 9. Re-entry and change-control gates

A new S1 Source Status version or reviewed update is required for:

```text
new or changed S1 production importer
S1 parser/admission change
S1 plan/success provenance change
S1 endpoint/request bounds change
S2/S3 ownership change
SDK-wire materializer ownership change
routing/provider-contact activation that changes S1's effective boundary
```

Any material S2 change remains governed by the S2 Source Status v0.1 and its
own change-control gates. The historical v0.1 S1 record must not be rewritten.

## 10. Final source-status summary

EX2B2-S1's production kernel and behavior remain installed and unchanged. This
v0.2 record supersedes v0.1 only as current reachability truth: reviewed S2 is
now the exact downstream production importer of the pure/injected S1 kernel.
The S2 pre-contact provenance gate is implemented in S2, not retroactively in
S1. No runtime authority is granted.

```text
EX2B2-S1 SOURCE STATUS / AS-BUILT v0.2 RECORDED
— HISTORICAL v0.1 PRESERVED / CURRENT REACHABILITY REFRESHED
```
