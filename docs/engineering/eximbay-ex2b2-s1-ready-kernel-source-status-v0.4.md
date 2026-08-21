# Eximbay EX2B2-S1 READY Kernel — Source Status / As-Built v0.4

## Status

```text
DOCUMENT CLASS: SOURCE STATUS / AS-BUILT
RISK CLASS: HIGH — PAYMENT PROVIDER TRANSPORT / RESPONSE ADMISSION
TASK CLASSIFICATION: SOURCE_ONLY / DOCUMENTATION_ONLY
VERSION: v0.4
SUPERSEDES: eximbay-ex2b2-s1-ready-kernel-source-status-v0.3.md
SUPERSEDED-BY: none
SOURCE: MERGED / INSTALLED
REVIEW STATUS: TARGETED SOURCE STATUS REVIEW CLOSED / PASS
INITIAL TARGETED REVIEW: 2 SUBSTANTIVE FINDINGS — IMPORTANT 1 / MINOR 1
BOUNDED CORRECTIONS: APPLIED
BOUNDED CLOSURE REVIEW: PASS
OPEN FINDINGS AFTER CLOSURE: BLOCKER 0 / IMPORTANT 0 / MINOR 0
RUNTIME AUTHORITY: NONE
```

Historical v0.1, v0.2, and v0.3 remain byte-for-byte preserved. This candidate
refreshes the current installed S1 identities and the ownership guard after
PR #93.

## Artifact admission and baseline

The record is admitted under [Feature Documentation Standard v0.2](./feature-documentation-standard-v0.2.md):
the S1 ownership guard is durable source truth, and future re-entry must
distinguish an EX2A consumer inventory expansion from an S1 importer expansion.
The installed baseline is PR #93 merge commit
`7012aaf3dd39221337f3482ff8309b8ddb406c46`, tree
`8daba81f62672dba7d5fdee4a050be04235d78f1`, with parents
`c95b47a951e200b27998c2b970aa47d36e0609ad` and
`e62092a3d54dba193a829f752dd4a496ddb85c5d`.

Final custody is 69 refund paths with aggregate
`a299972ef4858d05ecd74e6fc634573242bb308407716f2575256e594f3da021`, plus
publication-only `.github/workflows/ci.yml` at SHA-256
`9bac010b320cee648cb06614cc7262721fbdcd80afb8e668ff263566555ef248`.
CI run #402 (`32463236830`) succeeded with 296/296 files and 6562/6562 tests
passing. Installed migrations count is 36. R2A is CURRENT and was not
resealed.

## Current S1 identities

| Installed path | Bytes | SHA-256 | Meaning |
|---|---:|---|---|
| `src/lib/payment/eximbay/ready-kernel.ts` | 17002 | `ca90ae98225676d56c5fd6822dfd908d4a409b0bb58e4a2f5d4238192b88244b` | unchanged pure/injected S1 kernel |
| `src/lib/payment/eximbay/__tests__/ready-kernel.integration.test.ts` | 29957 | `d75f61308f11c80f5c41f9d2dc1ae65b380fdbd04d594c07384be656e5f72ee9` | S1 behavior coverage |
| `src/lib/payment/eximbay/__tests__/s1-isolation.test.ts` | 11218 | `027e3d849adc30a7c8ee7af579b86d26e47ba3b6ca9feb2ac95f1b45f8bec84b` | current ownership/importer guard |

S1 owns deterministic READY plan construction from caller-supplied closed
mode, fixed endpoints, bounded serialized admission, strict response/content/
UTF-8/JSON/fgkey validation, exact plan-success provenance, and trusted
SDK-wire materialization. It owns no DB, credentials, lifecycle, concrete HTTP
client, SDK loading, browser invocation, routing, refund, or BF4 authority.

## Importer truth

The S1 production importer set is unchanged:

```text
ready-kernel.ts:
  src/lib/payment/eximbay/ready-contact.ts
  src/lib/payment/eximbay/ready-http.ts
  src/lib/payment/eximbay/sdk-handoff.ts

ready-contact.ts:
  src/lib/payment/attempt/initiate.ts
  src/lib/payment/eximbay/sdk-handoff.ts

ready-http.ts:
  src/lib/payment/eximbay/ready-config.ts
  src/lib/payment/eximbay/ready-contact.ts
```

The current `s1-isolation.test.ts` also carries the installed EX2A amount
consumer allowlist. It explicitly includes the four dormant refund amount
consumers—`cancel-contact.ts`, `cancel-wire.ts`, `preflight-retrieve.ts`, and
`refund-lookup.ts`—alongside the existing EX2A-internal and S3 consumers.
That guard change records EX2A consumer reachability; it does not add a
production importer of
`ready-kernel.ts`, and it does not expand S1 production ownership.

## Validation, limitations, and re-entry

The exact-head CI evidence is run #402 / `32463236830` SUCCESS. The corrected
Toss authorization integration file passed 28/28, and the complete repository
verification passed 296/296 files and 6562/6562 tests. These are validation
facts, not activation evidence.

Provider capability, merchant capability, live behavior, routing, credentials,
and customer activation remain unproven and separately authorized. The current
refund implementation's provider-question register is A/B/C/D RETIRED with
remaining count 0, but unresolved activation provenance outside that
implementation is not closed. No provider, cloud, or production effect
occurred: provider/cloud/production effects during source publication: **0**.
R2A remains unresealed.

Source installed != provider contact authorized != production activated.

A reviewed new S1 Source Status version is required for any S1 importer-set,
READY plan/endpoint/bound/parser/admission, SDK-wire, transport, ownership,
routing, provider-contact, or activation change. The historical versions must
not be edited. Documentation rollback is separate from dormant source rollback
and provider re-entry.

**Non-authority:** no credential is approved, read, or used; no provider
contact, SDK execution, `request_pay`, BF4, routing, sandbox/live runtime, or
customer activation is authorized.
