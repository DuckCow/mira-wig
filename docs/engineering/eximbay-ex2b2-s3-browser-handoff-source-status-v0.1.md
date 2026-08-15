# Eximbay EX2B2-S3 Browser Handoff — Source Status / As-Built v0.1

## Status

```text
DOCUMENT CLASS: SOURCE STATUS / AS-BUILT
RISK CLASS: HIGH — PAYMENT PROVIDER / BROWSER SDK AUTHORITY
TASK CLASSIFICATION: SOURCE_ONLY / DOCUMENTATION_ONLY
VERSION: v0.1
SUPERSEDES: none
SUPERSEDED-BY: none
SOURCE: MERGED / INSTALLED / REVIEWED / DORMANT
INITIAL P8 INDEPENDENT DOCUMENTATION REVIEW: BLOCKER 0 / IMPORTANT 4 / MINOR 1
P8R CORRECTIONS: APPLIED
FINAL INDEPENDENT DOCUMENTATION CLOSURE: PASS — BLOCKER 0 / IMPORTANT 0 / MINOR 0
RUNTIME AUTHORITY: NONE
```

```text
FINAL REVIEWED P8 PACKET:
  WIG_PAY_EXIM_EX2B2_S3_P8_REVIEW_v0_2.zip
  39039 bytes
  SHA-256 ef4fb2b8111974733fd853e174cc9d0cc3568187a5a1ad64a6eca2ebaf275d61
```

The production loader is concrete SDK-load-capable browser source. It is
dormant because the current production application consumer of
`sdk-invocation.ts` is exactly zero and routing/activation remain disabled.
Ordinary tests use a synthetic fake DOM/global and perform zero real SDK fetch.
No real SDK load or `request_pay` call was performed or authorized.

## Governing chain and exact source installation

Precedence is:

1. [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md).
2. [EX2B2 READY Transport + SDK Browser Handoff Design Contract v0.1](./eximbay-ex2b2-ready-transport-sdk-handoff-design-contract-v0.1.md) and [Threat / Failure Model v0.1](./eximbay-ex2b2-ready-transport-sdk-handoff-threat-model-v0.1.md).
3. [S2 READY Contact Design Contract v0.1](./eximbay-ex2b2-s2-ready-contact-design-contract-v0.1.md).
4. Current upstream [EX2A v0.2](./eximbay-ex2a-pure-protocol-kernel-source-status-v0.2.md), [S1 v0.3](./eximbay-ex2b2-s1-ready-kernel-source-status-v0.3.md), and [S2 v0.2](./eximbay-ex2b2-s2-ready-contact-source-status-v0.2.md).
5. The exact reviewed S3 source packet, merge and CI evidence below.

The source packet `WIG_PAY_EXIM_EX2B2_S3_I1_SOURCE_REVIEW_v0_2.zip` is 44290
bytes, SHA-256
`c717b8be4a18052995a82c004d6113f93c9e2a60b5315e04be88f9d5e4aac42a`.
The reviewed full diff is 138121 bytes, SHA-256
`e9f9922aa4a77604dea45b472fe6aee2b41473b55d0585badfd305cbb3899ad9`.
Source PR #71 reviewed head
`d66b34a001e4868e887912eb8c1a1fe1b523688b` merged at current main
`7d619c893f05ccc163dafb7eb6f07c16c055b0d0`. Source scope is exactly 16
paths, 7 ADD / 9 MODIFY, +3067 / -42. PR CI `31888938288` and post-merge CI
`31889295693` completed successfully.

## Installed 16-path identity

| Path | Bytes | SHA-256 |
|---|---:|---|
| `src/app/(shop)/checkout/PaymentMethodSection.test.ts` | 7581 | `e024beff1af6fa81f8b16e3333c920cfe86be67446ab2793a43b5c0332c79016` |
| `src/app/(shop)/checkout/PaymentMethodSection.tsx` | 9464 | `11b035613d256b9b2060b5209629d819f748579ae05eedb47c876ca21542b4cf` |
| `src/app/actions/__tests__/payment.test.ts` | 77747 | `799f974c1cdb1702ca814b56596b12faf0b8cd19a75095fe0705c02efdcff46d` |
| `src/app/actions/payment.ts` | 18266 | `b16ecd9bd7947cd52817d71d909b0e7381f4d6aa1f4694d3f14108dac3a0fce4` |
| `src/lib/payment/attempt/__tests__/initiate.integration.test.ts` | 95836 | `11aa5ffd3964a89fb5b90364388ccaea567e8dd2283dfc08d9397f75e30381b0` |
| `src/lib/payment/attempt/__tests__/provider-initiation-ownership.test.ts` | 164601 | `9a10433f36589e7b956c5df05eb5c0acd036045fef2ab0e14e58e9e597774b4d` |
| `src/lib/payment/attempt/initiate.ts` | 33897 | `85126e6735e2f55b6466a920613c8f58ddea7e020f7a232298b19ef797b737c8` |
| `src/lib/payment/eximbay/__tests__/s1-isolation.test.ts` | 10930 | `44e20776aff9f72d5b018b19181812b2eb5df3cb3d4320ed709257fad4efa106` |
| `src/lib/payment/eximbay/__tests__/sdk-handoff.integration.test.ts` | 21581 | `ac46a5fbff39581bf8dd2bdf442c9cd8ae24499a85ba649bd8076140bddedad8` |
| `src/lib/payment/eximbay/__tests__/sdk-invocation.test.ts` | 9709 | `84edcf709165e49440cc55aa363d24e434dbd9c3bfd20b4b203b5c4964e3b6a6` |
| `src/lib/payment/eximbay/__tests__/sdk-loader.test.ts` | 21226 | `4e8c3109ab31be68fdb263281cff5b24dd669487534defb1de73becee63fe7f4` |
| `src/lib/payment/eximbay/sdk-handoff-contract.ts` | 711 | `69ec06ded2c4a2375adf572e51429a1c443acbd283a1d0dd5f73251e16d55ea4` |
| `src/lib/payment/eximbay/sdk-handoff.ts` | 6981 | `7449b6e187eac95f5ef57cac8b46eb503e65293ce3af67b12f9bc68c235fedc6` |
| `src/lib/payment/eximbay/sdk-invocation.ts` | 6883 | `262060e8b627f65ac83457bb5702721d763a70efcfbd5b5658f7f9b5401a30c2` |
| `src/lib/payment/eximbay/sdk-loader.ts` | 20204 | `bc189004713272e801aa1519c762d64035f52969a1e20614e97732064cbddf29` |
| `src/lib/payment/providers/__tests__/eximbay-ex1-architecture.test.ts` | 7020 | `f7a36e6c7619dab63df7f03b413456c417ec6069821b3bbdf5c67fdf09847f20` |

## Server handoff and browser package As-Built

S2 preserves the exact fresh plan/success authority only after durable READY
persistence. S3 consumes it once, locks the Payment, and verifies provider,
mode, lifecycle, remediation, order ID, currency, EX2A-decoded amount, P000,
contact timestamps and absence of completion/error/supersession facts.
`INVALID_PAYMENT_ID` is pre-consumption validation. Durable READY alone cannot
reconstruct or reissue the handoff and cannot authorize recontact.

The neutral package has exactly `kind`, `paymentId`, `mode`,
`sdkGeneration:"v2"`, and `payload`; payload has exactly `fgkey`, `payment`,
`merchant`, `buyer`, and `url`. Plain-record admission accepts only input with
`Object.prototype` or null prototype. It rejects custom prototypes, accessors,
inherited data, symbol extras, arrays, missing/extra keys, invalid controls and
invalid protocol literals. Admission produces a fresh ordinary frozen
snapshot. It does not trust caller object identity or getters.

The request-pay controller has a one-shot promise latch. A nonthrowing call
proves only `BROWSER_HANDOFF_ATTEMPTED`; SDK-load failure, disposal, or a
synchronous call throw is a bounded local failure. No result marks financial
success, writes Payment/Order state, or grants retry.

## Concrete loader As-Built

When lawfully invoked, `sdk-loader.ts` creates a script element, sets the exact
source, appends it to `document.head`, and captures a callable
`EXIMBAY.request_pay`. Its fixed mappings are:

```text
SANDBOX: https://api-test.eximbay.com/v2/javascriptSDK.js
LIVE:    https://api.eximbay.com/v2/javascriptSDK.js
LIVE exact asset classification: OFFICIAL_DOC_COMPOSITION_FOR_SOURCE_DESIGN
```

The document-global state contains an exact shared state record, owner token,
owned script and shared promise. Common identity fields are non-writable and
non-configurable; only the controlled phase transition is writable while
loading. Preexisting globals/scripts, spoofed ownership, cross-mode reuse,
unexpected descriptors and corrupted state fail closed.

`BLOCKED` is permanent same-document poison. Later owned mutation of an
AVAILABLE state makes future calls BLOCKED, although a callable already
returned before mutation cannot be revoked. FAILED is stable and permits no
silent same-document retry. Loader production importers are exactly
`sdk-invocation.ts`; the current production application/client consumer of
`sdk-invocation.ts` is zero. Checkout remains MOCK-only and free of loader or
invocation imports.

## Source-review correction history

```text
initial independent source review:
  BLOCKER 0 / IMPORTANT 2 / MINOR 1

I1A:
  stale EX1 global string ban narrowed to exact dormant-S3 path ownership

I1R-I01:
  AVAILABLE-state owned mutation now fails closed for future calls

I1R-I02:
  exact immutable shared-state descriptors and transition-sabotage correction

I1R-M01:
  INVALID_PAYMENT_ID corrected to pre-consumption validation wording

final independent source closure:
  PASS / BLOCKER 0 / IMPORTANT 0 / MINOR 0
```

## Validation and known limitations

The final source candidate passed 11 focused files / 388 tests, `npm run
verify` 274 files / 6172 tests, typecheck, lint and `git diff --check`. PR and
post-merge CI passed at the identities above. The local production build did
not pass: candidate and exact baseline met the same Google Fonts network
resolution failure, so no S3-attributable build regression was observed.

All browser/loader tests used controlled fake DOM/global/SDK seams. E1A and E1B
were not run. The real SDK was not fetched, loaded or executed; real
`EXIMBAY.request_pay` was not called; real credentials were not read or used;
provider contact was absent. CSP/header activation, routing, BF4/status
verification/completion, merchant capability and customer activation remain
absent, disabled, unproven, or unauthorized.

## Rollback and recovery

Documentation rollback is a revert of the eventual P8 documentation merge.
Dormant S3 source rollback is a separately authorized revert of merge
`7d619c893f05ccc163dafb7eb6f07c16c055b0d0`; S1/S2 source rollback remains
separate. There is no schema rollback in S3/P8. Rollback must not rewrite a
`CONTACTED`, `OUTCOME_UNKNOWN`, or `READY` row as uncontacted and must not
infer safe recontact from a lost handoff. Provider inquiry, reconciliation,
recontact, credential response, or browser recovery requires separate reviewed
authority.

## Re-entry and change control

A reviewed design/update and new Source Status version are mandatory for any
package schema or admission change; durable-lineage predicate or authority-
consumption change; SDK source/classification or loader-state/ownership change;
invocation/latch/result change; new application/client consumer; checkout
consumer; CSP/header change; E1A/E1B execution authority or evidence; routing,
BF4/status/completion, real credential/provider contact, or activation change.

D22 remains `S1 -> S2 -> S3 -> E1A -> E1B`. After this reviewed P8 Source
Status refresh is installed, the next D22 gate is separately authorized E1A.
This record does not authorize E1A.

**Non-authority:** installed load-capable source is not runtime enablement. No
provider contact, real SDK load/execution, real `request_pay`, real credential
use, BF4, routing, CSP activation, sandbox/live runtime, or customer activation
is authorized.
