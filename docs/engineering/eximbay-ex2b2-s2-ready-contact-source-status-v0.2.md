# Eximbay EX2B2-S2 READY Contact — Source Status / As-Built v0.2

## Status

```text
DOCUMENT CLASS: SOURCE STATUS / AS-BUILT
RISK CLASS: HIGH — PAYMENT / EXTERNAL PROVIDER CONTACT CAPABILITY
TASK CLASSIFICATION: SOURCE_ONLY / DOCUMENTATION_ONLY
VERSION: v0.2
SUPERSEDES: eximbay-ex2b2-s2-ready-contact-source-status-v0.1.md
SUPERSEDED-BY: none
SOURCE: MERGED / INSTALLED / REVIEWED / DORMANT
INITIAL P8 INDEPENDENT DOCUMENTATION REVIEW: BLOCKER 0 / IMPORTANT 4 / MINOR 1
P8R CORRECTIONS: APPLIED
FINAL INDEPENDENT DOCUMENTATION CLOSURE: PASS — BLOCKER 0 / IMPORTANT 0 / MINOR 0
RUNTIME AUTHORITY: NONE
```

This v0.2 is the current reviewed S2 reachability and custody record after the S3
merge. The immediate predecessor v0.1 remains byte-for-byte preserved.

```text
FINAL REVIEWED P8 PACKET:
  WIG_PAY_EXIM_EX2B2_S3_P8_REVIEW_v0_2.zip
  39039 bytes
  SHA-256 ef4fb2b8111974733fd853e174cc9d0cc3568187a5a1ad64a6eca2ebaf275d61
```

## Governing chain and reviewed source

Precedence is:

1. [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md).
2. [EX2B2 READY Transport + SDK Browser Handoff Design Contract v0.1](./eximbay-ex2b2-ready-transport-sdk-handoff-design-contract-v0.1.md) and [Threat / Failure Model v0.1](./eximbay-ex2b2-ready-transport-sdk-handoff-threat-model-v0.1.md).
3. [S2 READY Contact Design Contract v0.1](./eximbay-ex2b2-s2-ready-contact-design-contract-v0.1.md).
4. The historical [S2 Source Status v0.1](./eximbay-ex2b2-s2-ready-contact-source-status-v0.1.md), current [S1 v0.3](./eximbay-ex2b2-s1-ready-kernel-source-status-v0.3.md), and downstream [S3 v0.1](./eximbay-ex2b2-s3-browser-handoff-source-status-v0.1.md).
5. The reviewed source, packet, merge and CI evidence below.

S2 design PR #68 merged at
`ac55a21a3188cec71e0102807e6793b02323e9da`. Source PR #69 reviewed head
`002e1c778e650dc66767ef5dab5d1a7a3573b0ed` merged at
`bb2ab48176e9b6a5216e870616f4730fe9a85825`. Its final packet
`WIG_PAY_EXIM_EX2B2_S2_I1_SOURCE_REVIEW_v0_2.zip` was 34015 bytes, SHA-256
`fe79dc2b625c042705b3f49912965c8ec1770fd3c8308bd88fe0949ffe27e518`;
the 107664-byte reviewed diff SHA-256 was
`2933c3b0fb94d117536d39d1506be7c99c5a4130424d36fcda311646f1e68cfd`.
Final S2 closure passed 0/0/0. S3 source PR #71 merged at current main
`7d619c893f05ccc163dafb7eb6f07c16c055b0d0`.

## Unchanged S2 core and credential ownership

These S2 production modules are byte-unchanged by S3:

| Production path | Bytes | SHA-256 |
|---|---:|---|
| `src/lib/payment/eximbay/ready-contact.ts` | 10558 | `18a2108df1bc0ad4e38b7999db90b7d7c75ea0b01d48534e4bceb14bd270d270` |
| `src/lib/payment/eximbay/ready-config.ts` | 3923 | `58101577197106ba350b11c4d25decadeff68e5f9dac11e28d01893eb445c18c` |
| `src/lib/payment/eximbay/ready-http.ts` | 3985 | `13be506a6f6ea9bc9bb60022eaf667207ff83e3dae09e4ea8a90bafab8648ee8` |
| `src/lib/payment/eximbay/ready-facts.ts` | 4419 | `4117452695acd6af5f871b7f6e00d8fd023228e1eba0c2baccd6b3f4852acb4f` |
| `src/lib/payment/providers/credentials.ts` | 2473 | `e74f8381714d984d2462af7de1b454fbf844b0adc68ade172e52e8fceb6574a3` |

S2 owns atomic persisted-mode-bound MID/API-key configuration resolution,
opaque server-only credential custody, and Basic Authorization construction
and use inside the concrete injected-fetch transport boundary. P8 does not
approve, record, read, or use real credential values and authorizes no real
provider contact. Source capability and runtime authorization are separate.

S2 also owns canonical purchaser facts, JP/US language and CARD/P000 mapping,
strict public origin/URL derivation, exact pre-contact snapshot/CAS claim,
`CONTACTED` persistence before one 15-second zero-retry/no-redirect attempt,
conservative `OUTCOME_UNKNOWN`, and exact `0000` READY mapping. READY is not
financial completion.

## S3 integration delta and current custody

S3 changed production and tests, not only downstream allowlists:

| Current S3 integration path | Bytes | SHA-256 | Role |
|---|---:|---|---|
| `src/lib/payment/attempt/initiate.ts` | 33897 | `85126e6735e2f55b6466a920613c8f58ddea7e020f7a232298b19ef797b737c8` | preserves exact fresh authority only after durable READY and exposes adjacent server-only continuation |
| `src/lib/payment/attempt/__tests__/initiate.integration.test.ts` | 95836 | `11aa5ffd3964a89fb5b90364388ccaea567e8dd2283dfc08d9397f75e30381b0` | lifecycle/channel integration evidence |
| `src/lib/payment/attempt/__tests__/provider-initiation-ownership.test.ts` | 164601 | `9a10433f36589e7b956c5df05eb5c0acd036045fef2ab0e14e58e9e597774b4d` | ownership/re-entry evidence |
| `src/lib/payment/eximbay/__tests__/s1-isolation.test.ts` | 10930 | `44e20776aff9f72d5b018b19181812b2eb5df3cb3d4320ed709257fad4efa106` | exact S1/S2/S3 importer guard |
| `src/lib/payment/eximbay/sdk-handoff.ts` | 6981 | `7449b6e187eac95f5ef57cac8b46eb503e65293ce3af67b12f9bc68c235fedc6` | one-shot FreshEximbayReadyAuthority consumer |

The durable READY row remains generic and non-actionable. A durable-only API
may discard the fresh channel. Re-entry to READY never recontacts, reconstructs
authority, or creates a new handoff. S3 consumes the exact fresh plan/success
pair once and then checks locked durable Payment lineage before materializing
browser wire facts.

## Review, validation, and known limitations

Initial S2 source review found blocker 0, important 3, minor 1. I1R-I01-I03
and I1R-M01 were corrected and closed. Historical evidence passed 144/144
correction-focused tests, 10 files / 300 mandatory focused tests, and full
verify 271 files / 6076 tests; PR CI `31872599036` and post-merge CI
`31872952017` succeeded. S3 later passed 11 focused files / 388 tests, verify
274 files / 6172 tests, and CI `31888938288` / `31889295693`.

The local production build did not pass because candidate and exact baseline
both met the same Google Fonts network failure; no S2/S3-attributable build
regression was observed. Limitations include approved real MID/key/origin
values, canonical user-name eligibility, merchant P000/currency capability,
fgkey TTL/replay, E1A/E1B evidence, BF4 status/verification/duplicates/
completion, routing, and customer activation. Those gates remain absent or
unexecuted.

## Rollback and recovery

Documentation rollback is a revert of the eventual P8 documentation merge.
Dormant S2 or S3 source rollback requires a separately authorized revert of
the corresponding reviewed merge. This P8 has no schema rollback. A rollback
must never rewrite `CONTACTED`, `OUTCOME_UNKNOWN`, or `READY` as uncontacted,
and must not infer safe recontact from lost fresh authority. Provider inquiry,
reconciliation, credential response, or recontact requires separate authority.

## Re-entry and change control

A reviewed design/update and new Source Status version are required for changes
to purchaser provenance; market/language/method/currency facts; mode-bound
config, credential env names/pairing or Authorization custody; public origin;
contact claim/timeout/retry/redirect; outcome mapping; fresh-authority semantics;
attempt integration; a new authority consumer; READY re-entry/recontact;
schema/lifecycle; or provider-contact/routing/activation.

After this reviewed P8 Source Status refresh is installed, the next D22 gate
is separately authorized E1A. This record does not authorize E1A.

**Non-authority:** no real credential value was approved, recorded, read, or
used; no provider contact, real SDK load/execution, `request_pay`, BF4,
routing, sandbox/live runtime, or customer activation is authorized.
