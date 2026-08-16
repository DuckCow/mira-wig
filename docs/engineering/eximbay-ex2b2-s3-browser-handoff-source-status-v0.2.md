# Eximbay EX2B2-S3 Browser Handoff — Source Status / As-Built v0.2

## Status

```text
DOCUMENT CLASS: SOURCE STATUS / AS-BUILT
RISK CLASS: HIGH — PAYMENT PROVIDER / BROWSER SDK AUTHORITY
TASK CLASSIFICATION: DOCUMENTATION_ONLY / SOURCE_STATUS / RE-ENTRY-GATE REFRESH
VERSION: v0.2
DOCUMENTATION REVIEW: PASS
INSTALLATION: READY FOR DOCUMENTATION INSTALLATION
CURRENT INSTALLED PREDECESSOR: eximbay-ex2b2-s3-browser-handoff-source-status-v0.1.md
SUPERSEDES ON REVIEWED INSTALLATION: eximbay-ex2b2-s3-browser-handoff-source-status-v0.1.md
SUPERSEDED-BY: none
SOURCE: MERGED / INSTALLED / REVIEWED / DORMANT
E1B EXECUTION: NOT AUTHORIZED BY THIS SOURCE STATUS
PROVIDER/API/SDK ASSET CONTACT BY THIS DOCUMENTATION UPDATE: NONE
```

This reviewed documentation update preserves the current installed predecessor
[S3 Source Status v0.1](./eximbay-ex2b2-s3-browser-handoff-source-status-v0.1.md)
unchanged. Upon human-reviewed installation, v0.2 becomes the current S3
record and v0.1 becomes historical. The production source itself has not
changed for this candidate.

## 1. Governing chain and candidate baseline

Precedence is:

1. [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md).
2. [Mira AI Engineering Governance v0.1](./ai-engineering-governance-v0.1.md)
   and [Mira Backend / High-Risk Engineering Governance v0.1](./mira-backend-high-risk-governance-v0.1.md).
3. The [EX2B2 Design Contract v0.2](./eximbay-ex2b2-ready-transport-sdk-handoff-design-contract-v0.2.md),
   which owns the E1A/E1B branch delta upon reviewed installation;
   the [v0.1 predecessor](./eximbay-ex2b2-ready-transport-sdk-handoff-design-contract-v0.1.md)
   and [Threat / Failure Model v0.1](./eximbay-ex2b2-ready-transport-sdk-handoff-threat-model-v0.1.md)
   remain unchanged.
4. Current upstream [S2 v0.2](./eximbay-ex2b2-s2-ready-contact-source-status-v0.2.md)
   and the historical S3 v0.1 predecessor.
5. The [E1B SDK Surface Execution Contract v0.1](./eximbay-ex2b2-e1b-sdk-surface-execution-contract-v0.1.md),
   which binds only one separately authorized execution under Design Contract
   v0.2 and cannot change the governing design.

Candidate preparation observed a clean tracked worktree/index at:

```text
main / origin/main / HEAD:
  6bb82709d277da135ac726a1fe7afe06b80a28cb

tree:
  50e5e9aba87c244881c28abe1ae808780e581a61

current repository governance:
  installed
```

## 2. Current unchanged source truth

S3 production source remains installed, reviewed, dormant, and unchanged by
this documentation candidate.

| Current path / boundary | Candidate-time source truth |
|---|---|
| `src/lib/payment/eximbay/sdk-loader.ts` | SHA-256 `bc189004713272e801aa1519c762d64035f52969a1e20614e97732064cbddf29`; closed SANDBOX mapping is `https://api-test.eximbay.com/v2/javascriptSDK.js`; a successful owned load captures a callable `EXIMBAY.request_pay` |
| `src/lib/payment/eximbay/sdk-invocation.ts` | SHA-256 `262060e8b627f65ac83457bb5702721d763a70efcfbd5b5658f7f9b5401a30c2`; remains the request-pay controller, but its production application/client consumer count is zero |
| `src/lib/payment/eximbay/sdk-handoff.ts` | SHA-256 `7449b6e187eac95f5ef57cac8b46eb503e65293ce3af67b12f9bc68c235fedc6`; server-only one-shot fresh authority materialization remains installed |
| `src/lib/payment/eximbay/sdk-handoff-contract.ts` | SHA-256 `69ec06ded2c4a2375adf572e51429a1c443acbd283a1d0dd5f73251e16d55ea4`; browser handoff schema remains unchanged |
| `src/app/actions/payment.ts` | returns the adjacent fresh Eximbay handoff channel when available; does not import or invoke `sdk-invocation.ts` or `request_pay` |
| provider registry/routing | EXIMBAY remains `enabled: false`, with empty modes, methods, currencies, and live enablement; canonical activation guard rejects it |
| `next.config.ts` and `src/proxy.ts` | no Eximbay CSP or security-header activation is installed |
| `package.json` | declares existing `esbuild` `0.28.1`; declares no Playwright, Puppeteer, or Selenium dependency |

Current production search finds `loadEximbaySdkV2` consumed only by
`sdk-invocation.ts`; no production application or checkout consumer invokes the
controller. Checkout and provider routing therefore remain disabled/dormant.

At candidate-creation time, the real Eximbay SDK and real
`EXIMBAY.request_pay` have still never been run by Mira's admitted evidence.
This candidate did not contact an Eximbay API origin, fetch/load an SDK asset,
use a credential, or change source/schema/config/dependencies/CSP/routing.

## 3. Current official-provider fact disposition

The current dedicated official
[JavaScript SDK reference](https://developer.eximbay.com/eximbay/api_sdk/javascript-sdk.html)
was re-observed read-only on 2026-08-16. It still presents the TEST v2 SDK as
`https://api-test.eximbay.com/v2/javascriptSDK.js`, exposes
`EXIMBAY.request_pay` after installation, and requires a Payment Preparation
FGKey plus matching request parameters before payment-page invocation.

That current authority does not materially contradict Mira's installed
canonical-v2 adjudication. The previously recorded official v1/v2 conflict
remains historical and explicit; it is not rewritten away by this candidate.
Only `developer.eximbay.com` documentation was read. No Eximbay API origin or
JavaScript SDK asset was contacted.

## 4. Authority changes installed on 2026-08-16

The 2026-08-16
[MIRA-PUBLIC-READY-1 closure entry](../discovery/decision-log.md#2026-08-16--eximbay-mira-public-ready-1-closure-and-e1a-track-retirement)
records, without changing historical contracts:

```text
MIRA-PUBLIC-READY-1:
  CLOSED / ADMITTED

old e19ed account-bound E1A exact-baseline execution track:
  RETIRED

account-bound E1A:
  DEFERRED

H1:
  no standing invocation authority

current repository governance:
  installed at main 6bb82709d277da135ac726a1fe7afe06b80a28cb
```

The admitted public-shared READY result used one READY provider contact with no
retry and no SDK, `request_pay`, BF4, or bounded financial/customer effect. It
does not mean the old account-bound E1A execution was completed.

## 5. Current authority truth and reviewed relationships

This Source Status records current truth only:

```text
account-bound E1A:
  DEFERRED / NOT SATISFIED

MIRA-PUBLIC-READY-1:
  actual current-Mira public-shared READY transport evidence admitted

E1B execution contract:
  is reviewed and ready for installation in this same five-path change
  is subordinate bounded execution authority under Design Contract v0.2

EX2B2 Design Contract v0.2:
  is reviewed and ready for installation in this five-path change
  is the sole normative owner of the E1A/E1B branch change upon installation

merchant/account-bound capability:
  remains UNRESOLVED
  cannot be inferred from E1B

E2/payment-producing browser exercise:
  remains BLOCKED pending BF4 and separately adjudicated merchant/sandbox
  readiness/authority.
```

MIRA-PUBLIC-READY-1 is separate admitted evidence and is not an E1B
prerequisite. This Source Status does not decide that E1B may bypass E1A,
alter or supersede the parent design, or create execution authority. Design
Contract v0.2 contains the reviewed independent-branch semantic change; the
E1B execution contract only bounds a later one-shot execution under it. Until
both are installed, the parent sequence remains governing
and E1B execution remains not authorized.

## 6. Relation to the execution contract and conditional next gate

Before human-reviewed installation:

```text
E1B EXECUTION:
  NOT AUTHORIZED
```

If EX2B2 Design Contract v0.2 and the E1B execution contract are
human-reviewed and installed, the governing normative authority may make only
this the next gate:

```text
NEXT GATE:
  SEPARATELY HUMAN-AUTHORIZED ONE E1B INVOCATION
```

This Source Status does not itself grant that authority. A documentation merge
does not execute E1B or create standing or repeatable SDK-load authority. The
installed design would own the branch semantics and the execution contract
would bound the separate one-shot human authorization to a SANDBOX TEST v2
asset load/global/callable observation and prohibit
`request_pay`, READY/API contact, credential/FGKey use, a payment page,
BF4/completion, LIVE, routing, checkout, source/config/dependency/CSP changes,
and customer/production state.

## 7. Non-authority, rollback, and re-entry

This descriptive Source Status grants no provider contact, SDK asset
load or execution, `request_pay`, credential use, READY, BF4/status/completion,
merchant/account capability inference, routing, CSP activation, sandbox/live
runtime, customer activation, source change, or dependency installation.

Documentation rollback is a revert of an eventual reviewed documentation
merge; S3 production rollback remains separately authorized and must preserve
durable payment/contact evidence. Any source, schema, package, loader,
invocation, consumer, CSP/header, routing, provider-contact, credential,
merchant capability, BF4/completion, LIVE, or customer-activation change
requires its own reviewed authority.

Any E1B result or failure must be recorded outside the repository as the one
small sanitized result defined by the execution contract. A consumed or
ambiguous attempt does not self-authorize a rerun.

```text
POST-INSTALLATION NEXT GATE:
  SEPARATELY HUMAN-AUTHORIZED ONE E1B INVOCATION

STANDING / REPEATABLE SDK-LOAD AUTHORITY:
  NONE
```
