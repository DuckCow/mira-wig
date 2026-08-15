# Eximbay EX2A Pure Protocol Kernel — Source Status / As-Built v0.2

## Status

```text
DOCUMENT CLASS: SOURCE STATUS / AS-BUILT
RISK CLASS: HIGH — PAYMENT-PROVIDER PROTOCOL
TASK CLASSIFICATION: SOURCE_ONLY / DOCUMENTATION_ONLY
VERSION: v0.2
SUPERSEDES: eximbay-ex2a-pure-protocol-kernel-source-status-v0.1.md
SUPERSEDED-BY: none
SOURCE: MERGED / INSTALLED / REVIEWED / UNCHANGED
INITIAL P8 INDEPENDENT DOCUMENTATION REVIEW: BLOCKER 0 / IMPORTANT 4 / MINOR 1
P8R CORRECTIONS: APPLIED
FINAL INDEPENDENT DOCUMENTATION CLOSURE: PASS — BLOCKER 0 / IMPORTANT 0 / MINOR 0
RUNTIME AUTHORITY: NONE
```

This is the current reviewed Source Status / As-Built record for the full
unchanged EX2A pure protocol kernel, not merely its amount module. The
predecessor v0.1 remains
byte-for-byte preserved, including its historical statement that independent
documentation review was pending. This v0.2 does not imply that v0.1 itself
was independently documentation-reviewed.

```text
FINAL REVIEWED P8 PACKET:
  WIG_PAY_EXIM_EX2B2_S3_P8_REVIEW_v0_2.zip
  39039 bytes
  SHA-256 ef4fb2b8111974733fd853e174cc9d0cc3568187a5a1ad64a6eca2ebaf275d61
```

## Governing chain and reviewed source

Precedence is:

1. [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md).
2. [EX2A Pure Protocol Kernel Design / Implementation Contract v0.1](./eximbay-ex2a-pure-protocol-kernel-design-contract-v0.1.md).
3. The historical [EX2A Source Status v0.1](./eximbay-ex2a-pure-protocol-kernel-source-status-v0.1.md).
4. The current downstream [S1 v0.3](./eximbay-ex2b2-s1-ready-kernel-source-status-v0.3.md), [S2 v0.2](./eximbay-ex2b2-s2-ready-contact-source-status-v0.2.md), and [S3 v0.1](./eximbay-ex2b2-s3-browser-handoff-source-status-v0.1.md) reachability records.
5. The reviewed source and merge evidence below.

The design was installed by PR #46 at
`bd95a2bb1364715923e4639f3e1a674a5191107d`. Source PR #47 reviewed head
`6c7d09d11f79c7d9baca21d52b18ea59c3145e42` merged at
`685fc048c8cb6fb834593e3b1f56756817c8e9ab`: 20 paths, 2268 additions, one
deletion. Six initial source findings were corrected and final source closure
accepted with no new blocker, important, or minor finding.

## Full installed production scope and responsibilities

The current production bytes are unchanged from the installed EX2A kernel:

| Production path | Bytes | SHA-256 |
|---|---:|---|
| `src/lib/payment/providers/eximbay/amount.ts` | 2642 | `c835d7b9b19fb251e8426f6052c1b0a3d01bd31ebdbe3ebda9308904b7b16fe7` |
| `src/lib/payment/providers/eximbay/duplicate.ts` | 917 | `079c56eecb26f6d9e08e0bb7a61af64ac0aea1fce0a93d83dcdbe6762f15199d` |
| `src/lib/payment/providers/eximbay/errors.ts` | 152 | `a3835794136eaf782b9123a3419efd1ee25806222273bfbd8da3200ac6853875` |
| `src/lib/payment/providers/eximbay/index.ts` | 1573 | `c95dc218fab5f7807e2fca37870eb9a93c38777dc45be314d2d7d516dfe07a5a` |
| `src/lib/payment/providers/eximbay/inquiry-status.ts` | 1226 | `715939c6f7efc21dbc0e731fa2c83226d52d417c42e4e42fbe051b41e590de22` |
| `src/lib/payment/providers/eximbay/preparation.ts` | 5526 | `9f2cf1c4131f2d7ca19be64489bbc0f150c42efc7ca6b372f43d3c7510649de7` |
| `src/lib/payment/providers/eximbay/redaction.ts` | 1284 | `8cf6965d8b5b7ab71e4baa98071d7e4be4a4227f5ce29c0ab83cba71429ad77d` |
| `src/lib/payment/providers/eximbay/status.ts` | 5199 | `edc6054b114853be88cae3be71a8731bf9e9099c87225a683d71b00cee801c5a` |
| `src/lib/payment/providers/eximbay/trusted-facts.ts` | 3996 | `12bb6cab9dc954ca7f6822a89b33d95b65de654b19d4512cbad02c008b4e334a` |
| `src/lib/payment/providers/eximbay/types.ts` | 2427 | `68a1048a632ec9731a1aff719b3c1922bfe8725efdf926d7bc80f5050abb17fa` |
| `src/lib/payment/providers/eximbay/validation.ts` | 2447 | `d6f9270538ba6363467a59424e6b7326e7b3d212af31d9c043c18dc41e1d42e3` |
| `src/lib/payment/providers/eximbay/verified-status.ts` | 634 | `e8859db4eaf08c1a19e6fe51afeae7c8a95674140c428455a238382969c10ed9` |

The installed responsibilities remain: strict USD/JPY amount encode/decode;
canonical preparation facts and READY/SDK semantic parity; an opaque
Payment-bound provider-order candidate; bounded exact raw status-query
carriage/parsing; safe aggregate redaction; nominal provider-verification
separation and trusted local completion-candidate validation; duplicate and
inquiry-state classification; exact protocol types/errors; and production
purity/isolation guards. These are deterministic pure semantics. They do not
perform provider HTTP, persistence, completion, refund, void, SDK loading, or
routing.

## Current reachability delta

EX2A production bytes and pure semantics did not change in S3. The only S3
delta is that `src/lib/payment/eximbay/sdk-handoff.ts` directly imports and
uses `decodeEximbayAmount(...)` to compare trusted SDK-wire currency/amount
with the locked durable Payment lineage. EX2A still owns no DB lock, S3 fresh
authority, concrete browser loader/invocation, routing, BF4, credentials, or
provider contact.

## Validation and known limitations

Historical EX2A evidence remains: focused 7 files / 122 tests PASS; isolated
`npm run verify` 244 files / 5697 tests PASS; PR #47 CI run `31433573045`
success; 20/20 reviewed candidate identities matched. No separate EX2A local
production-build success is claimed. Current S3 validation later passed 11
focused files / 388 tests and verify 274 files / 6172 tests; its clean
candidate/baseline builds both met the same Google Fonts network-resolution
failure.

Known limitations remain provider-order wire constraints, mutable official
provider facts, merchant P000/USD/JPY/3DS capability, status transport and
acknowledgement, SDK deployment/runtime evidence, refund/void and ambiguous
contact recovery. E1A/E1B/BF4 remain unexecuted or absent, routing remains
disabled, and no activation evidence exists.

## Rollback and recovery

Documentation rollback is a revert of the eventual P8 documentation merge.
The dormant EX2A source rollback unit is separately authorized reversion of PR
#47's pure subtree and its architecture-test adjustment; S3 source rollback is
separately authorized reversion of source merge
`7d619c893f05ccc163dafb7eb6f07c16c055b0d0`. There is no schema rollback in
this P8 candidate. No contacted/READY row may be rewritten as uncontacted
because source or documentation is reverted. Provider inquiry, reconciliation,
or recontact always requires separate authority.

## Re-entry and change control

A reviewed design/update and new Source Status version are required for any
amount encoding/decoding change, new or changed production consumer, protocol
responsibility/ownership change, status/trusted-facts semantics, provider-order
mapping, verification brand, routing, persistence/completion/refund authority,
or provider-contact/runtime activation. Historical v0.1 must not be rewritten.

After this reviewed P8 Source Status refresh is installed, the next D22 gate
is separately authorized E1A. This record does not authorize E1A.

**Non-authority:** no real credential is approved, read, or used; no provider
contact, SDK load/execution, `request_pay`, BF4, routing, sandbox/live runtime,
or customer activation is authorized.
