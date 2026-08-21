# Eximbay EX2A Pure Protocol Kernel — Source Status / As-Built v0.3

## Status

```text
DOCUMENT CLASS: SOURCE STATUS / AS-BUILT
RISK CLASS: HIGH — PAYMENT-PROVIDER PROTOCOL
TASK CLASSIFICATION: SOURCE_ONLY / DOCUMENTATION_ONLY
VERSION: v0.3
SUPERSEDES: eximbay-ex2a-pure-protocol-kernel-source-status-v0.2.md
SUPERSEDED-BY: none
SOURCE: MERGED / INSTALLED
REVIEW STATUS: TARGETED SOURCE STATUS REVIEW CLOSED / PASS
INITIAL TARGETED REVIEW: 2 SUBSTANTIVE FINDINGS — IMPORTANT 1 / MINOR 1
BOUNDED CORRECTIONS: APPLIED
BOUNDED CLOSURE REVIEW: PASS
OPEN FINDINGS AFTER CLOSURE: BLOCKER 0 / IMPORTANT 0 / MINOR 0
RUNTIME AUTHORITY: NONE
```

This candidate refreshes the current installed EX2A reachability record after
PR #93. Historical v0.1 and v0.2 remain byte-for-byte historical records and
are not rewritten.

## Artifact admission

```text
FAILURE MODE:
  A downstream refund implementation could make the current EX2A ownership
  boundary and its exact installed consumers undiscoverable after the PR.
WHAT FAILS WITHOUT THIS ARTIFACT:
  Future re-entry could mistake refund persistence/contact authority for pure
  EX2A protocol authority, or rely only on transient PR history.
WHY SOURCE / TESTS / PR DESCRIPTION ARE INSUFFICIENT:
  They establish behavior but do not provide one durable ownership and
  reachability record for the unchanged kernel plus its new consumers.
WHO WILL USE IT AND WHEN:
  Future EX2A/refund maintainers before a protocol, importer, or activation
  change.
ASSURANCE GAIN:
  Exact current identities and a durable separation of kernel and refund
  ownership.
MAINTENANCE COST:
  A new Source Status version for a material EX2A/importer/ownership change.
DISPOSITION: ADD
```

## Baseline and custody

The installed source is the merge commit of [PR #93](https://github.com/DuckCow/mira-wig/pull/93):

| Identity | Value |
|---|---|
| Merge commit | `7012aaf3dd39221337f3482ff8309b8ddb406c46` |
| Merge tree | `8daba81f62672dba7d5fdee4a050be04235d78f1` |
| Parent 1 / parent 2 | `c95b47a951e200b27998c2b970aa47d36e0609ad` / `e62092a3d54dba193a829f752dd4a496ddb85c5d` |
| Refund candidate | 69 paths; aggregate `a299972ef4858d05ecd74e6fc634573242bb308407716f2575256e594f3da021` |
| Publication-only path | `.github/workflows/ci.yml` |
| Workflow SHA-256 | `9bac010b320cee648cb06614cc7262721fbdcd80afb8e668ff263566555ef248` |
| Final CI | run #402 / `32463236830` / SUCCESS |
| Final verification | 296 / 296 Vitest files and 6562 / 6562 tests PASS |
| Installed migrations | 36 |
| R2A | CURRENT; no reseal during reconciliation or publication |

The CI workflow is publication/verification evidence only; it is not an EX2A
runtime owner.

## Governing chain

The applicable current policy is [Feature Documentation Standard v0.2](./feature-documentation-standard-v0.2.md).
The predecessor record is [EX2A v0.2](./eximbay-ex2a-pure-protocol-kernel-source-status-v0.2.md),
and the adjacent installed reachability record is [S1 v0.3](./eximbay-ex2b2-s1-ready-kernel-source-status-v0.3.md).
The protocol contract remains [EX2A Pure Protocol Kernel Design Contract v0.1](./eximbay-ex2a-pure-protocol-kernel-design-contract-v0.1.md).
The refund-specific installed record is [Eximbay Refund Cancel Recovery v0.1](./eximbay-refund-cancel-recovery-source-status-v0.1.md).

## Current EX2A production kernel

The following are the exact current merged production files in
`src/lib/payment/providers/eximbay/`. They retain pure protocol, parsing,
normalization, and trusted-fact responsibilities; none performs refund
persistence, dispatch allocation, provider contact, recovery scheduling, or
activation.

| Path | Bytes | SHA-256 |
|---|---:|---|
| `src/lib/payment/providers/eximbay/amount.ts` | 2642 | `c835d7b9b19fb251e8426f6052c1b0a3d01bd31ebdbe3ebda9308904b7b16fe7` |
| `src/lib/payment/providers/eximbay/duplicate.ts` | 917 | `079c56eecb26f6d9e08e0bb7a61af64ac0aea1fce0a93d83dcdbe6762f15199d` |
| `src/lib/payment/providers/eximbay/errors.ts` | 152 | `a3835794136eaf782b9123a3419efd1ee25806222273bfbd8da3200ac6853875` |
| `src/lib/payment/providers/eximbay/index.ts` | 1616 | `69511bdbaa7e508934783be72ef5f512fdefe643bfec62fa7bfbc74bd5a6b089` |
| `src/lib/payment/providers/eximbay/inquiry-status.ts` | 1226 | `715939c6f7efc21dbc0e731fa2c83226d52d417c42e4e42fbe051b41e590de22` |
| `src/lib/payment/providers/eximbay/preparation.ts` | 5526 | `9f2cf1c4131f2d7ca19be64489bbc0f150c42efc7ca6b372f43d3c7510649de7` |
| `src/lib/payment/providers/eximbay/redaction.ts` | 1284 | `8cf6965d8b5b7ab71e4baa98071d7e4be4a4227f5ce29c0ab83cba71429ad77d` |
| `src/lib/payment/providers/eximbay/status.ts` | 5199 | `edc6054b114853be88cae3be71a8731bf9e9099c87225a683d71b00cee801c5a` |
| `src/lib/payment/providers/eximbay/trusted-facts.ts` | 4089 | `4ab60b0e18d599baefacbfb847fec0ad2e55a5e1a5b8946a75bb66cf88a065cb` |
| `src/lib/payment/providers/eximbay/types.ts` | 2427 | `68a1048a632ec9731a1aff719b3c1922bfe8725efdf926d7bc80f5050abb17fa` |
| `src/lib/payment/providers/eximbay/validation.ts` | 2447 | `d6f9270538ba6363467a59424e6b7326e7b3d212af31d9c043c18dc41e1d42e3` |
| `src/lib/payment/providers/eximbay/verified-status.ts` | 3561 | `044d4624dc50a77f0fd55ac19e5933d6104020c188a66b555b7d7dd7da44c5ab` |

## Current refund reachability delta

PR #93 adds dormant Eximbay refund consumers downstream of the kernel. The
complete current production consumer set of EX2A exports is seven files:

| Consumer | EX2A seam consumed | Bytes | SHA-256 |
|---|---|---:|---|
| `src/lib/payment/refund/providers/eximbay/cancel-contact.ts` | amount decode, bounded validation, currency type | 8696 | `219b8aba91a1534600945f4f98c989156aac30736ecbe63e84e4e65574fe4deb` |
| `src/lib/payment/refund/providers/eximbay/cancel-wire.ts` | amount encode, bounded validation, currency type | 6707 | `9c7311209253e4bff0abf9f9ec416ce1e2e063c942fd31a312f3ca84a30bd64f` |
| `src/lib/payment/refund/providers/eximbay/execute-contact.ts` | bounded validation | 15890 | `302f926b142af7d7f33f135a1e234aabb655c514a4f283e5dff9d6aaea9eef2b` |
| `src/lib/payment/refund/providers/eximbay/preflight-contract.ts` | currency type, bounded validation | 9994 | `ae5e719c7a818c4a1185d0a086bb8a36c98d632bbb77e6e81492e1abd4061c7c` |
| `src/lib/payment/refund/providers/eximbay/preflight-retrieve.ts` | amount encode/decode, bounded validation, currency type | 20456 | `da410af3b541e58ad7cf5569574f95fe31eb597a6416376fed7403d4d7441c98` |
| `src/lib/payment/refund/providers/eximbay/reconcile-refund.ts` | bounded validation | 31638 | `fec27e30e88187ec33e8516e5a01f88b7be16f32a30f3d0e3169753ccdd6e2d4` |
| `src/lib/payment/refund/providers/eximbay/refund-lookup.ts` | amount encode/decode, bounded validation, currency type | 14131 | `26317e6c13cdf0e5b71fc765943e0bd95b21b94728c9cfb4a9d641a56256c198` |

The four amount-codec additions are `cancel-contact.ts`, `cancel-wire.ts`,
`preflight-retrieve.ts`, and `refund-lookup.ts`. The other three files consume
only validation/type seams. Test imports are excluded from this production
reachability statement.

## Ownership boundary

EX2A continues to own deterministic USD/JPY amount encoding and decoding,
canonical preparation facts, provider-order/type validation, bounded status
carriage/parsing, safe redaction, inquiry classification, and trusted local
completion-candidate validation. Its downstream consumers may use those
semantics but do not move their owners into EX2A.

The refund modules retain ownership of refund intent and ledger decisions,
operation-family and physical-dispatch identity, immutable preflight
observation, persistence, contact markers, cancel transport, provider lookup,
recovery scheduling, result evidence, and activation fences. EX2A owns no DB
lock, schema row, refund persistence, physical dispatch, provider credential,
HTTP transport, recovery lease, routing, or production activation.

## Validation, limitations, and re-entry

The exact merged source passed CI run #402 and the local `npm run verify`
completion evidence recorded above. Refund source remains dormant and
provider-free at its installed boundary. No provider contact, credential use,
cloud effect, or production activation occurred. Provider/cloud/production
effects during source publication: **0**. Provider-question count for the
current refund implementation is zero, but activation provenance outside that
implementation remains open and is not retired here.

Source installed != provider contact authorized != production activated.

A reviewed new Source Status version is required for an EX2A production
semantic change, a new/changed EX2A production importer, or an ownership,
protocol, status, trusted-fact, persistence, refund, routing, or activation
boundary change. Downstream refund reachability alone does not broaden EX2A
responsibility. Documentation rollback is a revert of the eventual
documentation merge; source rollback and provider re-entry require separate
authority.

**Non-authority:** this record authorizes no credentials, provider contact,
SDK execution, refund execution, routing, BF4, sandbox/live runtime, or
customer activation.
