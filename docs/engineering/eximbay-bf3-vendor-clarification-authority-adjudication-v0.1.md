# Eximbay BF3 Vendor Clarification / Current Official Documentation Authority Adjudication v0.1

## Status

```text
DOCUMENT CLASS:
  EXTERNAL AUTHORITY / EVIDENCE ADJUDICATION

RISK CLASS:
  HIGH — PAYMENT / EXTERNAL PROVIDER AUTHORITY

TASK CLASSIFICATION:
  EXTERNAL_AUTHORITY_RECONCILIATION / DOCUMENTATION_ONLY

TASK-LEVEL AUTHORIZATION:
  DOCUMENTATION ONLY

ADJUDICATION RECORD:
  HUMAN AUTHORITY-DIFF REVIEWED / READY FOR INSTALLATION

HUMAN AUTHORITY-DIFF:
  PASS — 2026-08-14

REVIEWED CANDIDATE PACKET:
  WIG_PAY_EXIM_BF3_VCL_A1_REVIEW_v0_2.zip

REVIEWED PACKET SHA-256:
  cfbd7de0fedb522e4c2ea2deeb549d0908093f89248d0be1770c437ffe450009

PROVIDER CONTACT:
  NOT AUTHORIZED

SDK / BROWSER RUNTIME:
  NOT AUTHORIZED

SANDBOX / LIVE ACTIVATION:
  NOT AUTHORIZED

EX2B2:
  UNBLOCKED FOR DESIGN CONTRACT ONLY
```

The reviewed packet binds the pre-sync semantic candidate. A1I synchronizes
lifecycle labels only and does not alter any reviewed protocol, evidence, or
authority disposition.

## 1. Scope and authority boundary

This candidate reconciles a direct 2026-08-14 Eximbay vendor clarification
with current official Eximbay developer documentation for the narrow questions
of JavaScript SDK generation, REST API path generation, environment origins,
and the resulting EX2B2 design prerequisite.

It is documentation authority only. It does not contact Eximbay, load or
execute an SDK, invoke a browser, configure credentials, implement `/ready`,
create a callback, alter source or persistence, or activate a test or live
runtime. It does not convert general provider documentation or a vendor email
into Mira merchant-account capability.

## 2. Exact repository baseline

```text
repository:
  /Users/duckcow/workspace/mira

actual origin/main:
  17a13620dc296955c63c211e807397c03ce53285

isolated candidate worktree:
  /private/tmp/mira-eximbay-vendor-clarification-20260814

candidate branch:
  docs/eximbay-bf3-vendor-clarification-adjudication

baseline state before authoring:
  CLEAN
```

The actual `origin/main` equals the expected contract baseline. Its immediately
preceding changes concern market/locale storefront and documentation work and
do not materially alter Eximbay, BF3, EX2B1, or payment-provider authority.

## 3. Prior installed and historical lifecycle state

The repository authority entering this adjudication is preserved:

```text
EX2B1 lifecycle:
  CLOSED

EX2B1 installed capability:
  durable per-Payment Eximbay providerOrderId
  + provider-free READY request preparation

actual /ready HTTP:
  NOT INSTALLED

SDK/browser handoff:
  ABSENT

callback/status_url runtime:
  ABSENT

historical BF3 disposition:
  BF3_EVIDENCE_INVALID_OR_INCOMPLETE

historical BF3-R1 result:
  COMPLETE_ADMITTED / ADDITIVE / NON-RETROACTIVE

BF3-R2 contract state:
  FINAL CORRECTED CANDIDATE / UNINSTALLED

BF3-R2 execution:
  NOT AUTHORIZED / NOT EXECUTED

canonical SDK entering this adjudication:
  UNRESOLVED

EX2B2 entering this adjudication:
  BLOCKED BY THE CANONICAL-SDK PREREQUISITE
```

The current source inspection is consistent with those records: provider-free
Eximbay preparation exists, while Eximbay remains registry-disabled and has no
SDK dependency, SDK loader, Eximbay `/ready` transport route, public Eximbay
status ingress, credential/deployment mapping, or runtime activation.

## 4. New direct vendor communication

Evidence date: **2026-08-14**.

The user supplied the following first-party communication from Eximbay
representative Kim Ho-young:

```text
안녕하세요, 엑심베이 김호영입니다.

버전이 여러가지로 나와 있어서 혼란스러우신 것 같습니다.

정리하면,
JavaScript SDK 라이브러리는 v2를 사용하셔야 합니다 .

<!-- SDK --> <script type="text/javascript"
src="https://api-test.eximbay.com/v2/javascriptSDK.js"></script>

그리고, API 호출시에는 v1이 맞습니다.

호출 예제는 API 호출이니 v1을 사용하는 거구요.

연동 URL은 다음과 같습니다.
- 테스트 : https://api.eximbay.com
- 운영 : https://api-test.eximbay.com

감사합니다.
```

The communication directly states JavaScript SDK v2 and API v1 and supplies
the exact test v2 SDK asset. Its final two environment bullets are internally
contradictory with that same test SDK example. The user has asked the vendor
whether those two bullets were reversed; no reply has arrived. This record
does not claim that the representative acknowledged a typo or sent a
correction.

## 5. Current official-document evidence

Observation date: **2026-08-14**. These are mutable external sources and must
be rechecked under the change-control conditions below.

### E-OFF-01 — payment-page integration preparation

[Official payment-page integration preparation](https://developer.eximbay.com/eximbay/payment_linkage/preparing-payment.html)
currently shows:

```text
JavaScript SDK example:
  https://api-test.eximbay.com/v2/javascriptSDK.js

SDK environment mapping:
  production -> https://api.eximbay.com
  test       -> https://api-test.eximbay.com

API environment mapping:
  production -> https://api.eximbay.com
  test       -> https://api-test.eximbay.com
```

It separately warns that live API keys must not be exposed in publicly
accessible environments such as a browser and distinguishes `test_` from
`live_` keys. No credential value is reproduced in this record.

### E-OFF-02 — JavaScript SDK

[Official JavaScript SDK documentation](https://developer.eximbay.com/eximbay/api_sdk/javascript-sdk.html)
currently shows the exact test v2 installation asset and the browser interface
`EXIMBAY.request_pay(...)`. It requires FGKey from Payment Ready first and
requires SDK invocation facts to match the preceding READY request. This
supports the SDK generation and interface shape; it does not establish Mira
merchant readiness, browser success, or runtime authority.

### E-OFF-03 — API reference

[Official API reference](https://developer.eximbay.com/eximbay/api_list/reference.html)
identifies Payment Ready in the `/v1/payments/ready` API path family.

### E-OFF-04 — payment-flow examples

Current official
[PAYMENT](https://developer.eximbay.com/eximbay/payment_linkage/windows-consolidation.html),
[PAYER_AUTH](https://developer.eximbay.com/eximbay/payment_linkage/windows-authentication.html),
and
[AUTHORIZE](https://developer.eximbay.com/eximbay/payment_linkage/windows-authorization.html)
examples use the test URL
`https://api-test.eximbay.com/v1/payments/ready` for preparation.

The same current flow pages also contain an internal SDK-version
inconsistency:

```text
CURRENT OFFICIAL FLOW-PAGE INTERNAL INCONSISTENCY:

PAYMENT / PAYER_AUTH / AUTHORIZE pages:
  SDK Preparation section:
    https://api-test.eximbay.com/v2/javascriptSDK.js

  later Payment Page Initiation section:
    https://api-test.eximbay.com/v1/javascriptSDK.js
```

The residual v1 SDK snippets are retained as contradictory current
official-document evidence. They are SDK asset snippets and are not silently
reinterpreted as REST `/v1` examples. They are not admitted as canonical-SDK
authority after the direct vendor clarification explicitly selected JavaScript
SDK v2 and the dedicated SDK and top-level preparation pages also show v2.

The v2 disposition therefore rests on the combined direct vendor clarification
and the higher-specificity dedicated/current top-level v2 documentation, not
on a claim that every current official page is internally consistent. The
remaining conflict is only an observable documentation ambiguity; this record
does not assert a provider error beyond the conflicting snippets. A later
vendor correction that materially contradicts v2 requires re-adjudication.

## 6. Evidence hierarchy and reconciliation method

Claims are adjudicated individually:

1. Repository schema, source, and installed lifecycle records govern Mira's
   installed capability and authority.
2. Direct vendor communication and current official Eximbay documentation are
   first-party external evidence for provider protocol and version facts.
3. Agreement between first-party sources supports a narrow claim, while an
   explicit direct-vendor selection may resolve a specific version question
   when dedicated/top-level documentation supports it and residual conflicting
   snippets remain disclosed; neither source class automatically overrides the
   other for every claim.
4. Internally contradictory fragments and residual official-document snippets
   are retained and bounded rather than silently normalized into agreement.
5. An inferred path composition is labeled as composition and is not presented
   as a literal vendor statement or directly documented exact asset.

The email's final environment bullets conflict with its own exact test SDK URL,
the official SDK and API environment tables, and current official READY
examples. They are therefore not admitted as current environment-mapping
authority. The explicit current official tables and examples govern
source-design environment mapping pending the vendor's clarification reply.
Separately, the current flow pages are not unanimous on SDK asset version:
their SDK Preparation sections show v2 while later Payment Page Initiation
snippets show v1. That residual official-document conflict is retained under
E-OFF-04 and does not become REST-version evidence or canonical-SDK authority.

## 7. Claim-by-claim authority matrix

| Claim | Disposition | Admitted evidence | Boundary |
| --- | --- | --- | --- |
| C1 — canonical JavaScript SDK generation/version | `SUPPORTED` | Direct vendor clarification explicitly selects SDK v2; the dedicated SDK and top-level preparation pages show `/v2/javascriptSDK.js`; current PAYMENT/PAYER_AUTH/AUTHORIZE flow pages retain conflicting later `/v1/javascriptSDK.js` initiation snippets after their v2 preparation snippets. | Canonical v2 for the next EX2B2 design is selected from the explicit vendor clarification plus higher-specificity dedicated/top-level v2 documentation, not from unanimous official pages. The residual v1 snippets remain contradictory documentation evidence; no SDK load, source implementation, or browser authority. |
| C2 — REST/payment API path generation/version | `SUPPORTED` | Direct vendor statement says API v1; current API reference and payment-flow examples use `/v1/payments/ready`. | SDK v2 and REST API v1 are separate version axes; no API request authority. |
| C3 — test base origin | `CONFLICT_RECONCILED` | Current official SDK/API tables and READY examples identify `https://api-test.eximbay.com`; the same email's test SDK example agrees. | The swapped final email bullets are retained but not admitted; vendor correction reply remains pending. |
| C4 — production base origin | `CONFLICT_RECONCILED` | Current official SDK/API tables identify `https://api.eximbay.com`. | Source-design origin only; no production probing, credential use, or live activation. |
| C5 — exact test SDK asset | `SUPPORTED` | Vendor email and current official preparation/SDK pages both show `https://api-test.eximbay.com/v2/javascriptSDK.js`. | Exact design candidate only; network load and execution remain unauthorized. |
| C6 — production SDK asset/path semantics | `SUPPORTED_WITH_BOUNDARY` | Official preparation page says SDK call URIs vary by environment, maps the production/test base origins, and shows the v2 SDK path in the current installation example. | `https://api.eximbay.com/v2/javascriptSDK.js` is `OFFICIAL_DOC_COMPOSITION_FOR_SOURCE_DESIGN`, not a directly documented exact asset or literal vendor quote; production load remains unauthorized. |
| C7 — further BF3-R2 execution required for canonical-version question | `SUPPORTED_WITH_BOUNDARY` | Newly admitted vendor clarification explicitly selects v2 and the dedicated/top-level official pages support it; residual flow-page v1 SDK snippets are retained as a bounded conflict. | BF3-R2 is no longer a prerequisite for this narrow question, but remains unauthorized, unexecuted, uninvalidated, and historically preserved. |
| C8 — EX2B2 may enter Design Contract work | `SUPPORTED_WITH_BOUNDARY` | C1–C7 satisfy the canonical-SDK prerequisite for design. | `EX2B2: UNBLOCKED FOR DESIGN CONTRACT ONLY`; no source, transport, SDK, browser, credential, provider-contact, or activation authority. |
| C9 — runtime/provider/browser/sandbox/live authority created | `NOT_AUTHORIZED` | This record is documentation-only and all installed runtime exclusions remain present. | No provider API request, SDK load/execution, browser invocation, sandbox runtime, live runtime, or customer activation. |

## 8. Exact version and environment dispositions

```text
JavaScript SDK canonical generation/version:
  v2

REST/payment API path generation/version:
  v1

version relationship:
  SDK v2 + REST /v1/... IS NOT A CONTRADICTION

test base origin:
  https://api-test.eximbay.com

production base origin:
  https://api.eximbay.com

exact test SDK asset:
  https://api-test.eximbay.com/v2/javascriptSDK.js

production SDK source-design candidate:
  https://api.eximbay.com/v2/javascriptSDK.js

production SDK candidate classification:
  OFFICIAL_DOC_COMPOSITION_FOR_SOURCE_DESIGN

production SDK network load:
  NOT AUTHORIZED

live activation:
  NOT AUTHORIZED
```

The production candidate composes the explicit official production base origin
with the current official v2 SDK path. It is not classified as
`DIRECTLY_DOCUMENTED_EXACT_ASSET`.

## 9. Historical evidence preservation

```text
EX2B1:
  HISTORICALLY CLOSED FOR ITS BOUNDED LIFECYCLE

BF3 / BF3-R1 / BF3-R2 records:
  PRESERVED

historical BF3 result:
  UNCHANGED

historical BF3-R1 result:
  UNCHANGED

BF3-R2 execution state:
  UNAUTHORIZED / UNEXECUTED / UNCHANGED
```

New first-party authority can make an older unresolved prerequisite no longer
necessary without causing the older evidence to establish a fact it never
established. This adjudication does not delete, rewrite, invalidate, execute,
or reinterpret any BF3, BF3-R1, or BF3-R2 artifact.

## 10. EX2B2 unblock scope and next lifecycle gate

```text
EX2B2 canonical-SDK prerequisite:
  SATISFIED FOR DESIGN CONTRACT WORK

EX2B2:
  UNBLOCKED FOR DESIGN CONTRACT ONLY
```

The subsequent EX2B2 Design Contract must separately freeze at least:

- READY transport and its contact lifecycle ordering;
- credential/configuration ownership and server-only API-key handling;
- exact FGKey response admission;
- the SDK script-loading boundary;
- `request_pay` payload identity/equality with READY facts;
- browser failure and cleanup semantics;
- test versus live environment separation;
- observability and recovery; and
- explicit sandbox-contact authority, if any is later proposed.

No EX2B2 source work begins from this record. Implementation requires a later,
separately reviewed, baseline-bound task after the Design Contract is accepted.

## 11. Explicit non-authority

This adjudication authorizes none of the following:

```text
EX2B2 source implementation
Eximbay /ready HTTP implementation or request
MID or API-key configuration or use
SDK network loading or JavaScript execution
EXIMBAY.request_pay invocation
browser payment-page behavior
provider factory, registry, routing, or fallback change
test/sandbox runtime activation
production/live runtime activation
customer activation
callback/status_url implementation
payment verification or financial completion
refund, cancellation, or void
source, schema, migration, configuration, dependency, or test change
```

## 12. Unresolved merchant, runtime, BF4, and refund facts

This record does not establish:

- that Mira has a live MID or live API key;
- that any real payment method, including P000, is enabled for Mira;
- that USD, JPY, or KRW settlement is enabled for Mira;
- that merchant production review is complete;
- that SDK loading or browser invocation succeeds in Mira's page context;
- READY response/error/retry/recovery behavior for a Mira credential;
- return URL semantics beyond already recorded documentation;
- `status_url` method, transport, authentication or verification;
- duplicate `status_url` handling or callback correlation;
- financial completion verification;
- refund, cancel, or void enablement and semantics; or
- production SDK representation or runtime behavior.

General public test credentials in provider documentation are not Mira
production merchant capability and are not copied into this record.

```text
BF4:
  SEPARATE / OPEN / NOT CLOSED BY THIS ADJUDICATION
```

## 13. Vendor follow-up pending state

```text
clarification question:
  whether the vendor email's final test/production bullets were reversed

reply state:
  PENDING — NO REPLY RECEIVED

current treatment:
  contradictory bullets retained as evidence
  not admitted as environment mapping
```

A later vendor reply that materially contradicts the current official mapping
or the v2/v1 disposition requires re-adjudication. No acknowledgement or typo
correction is inferred before that reply exists.

## 14. Re-entry and change control

Re-enter external-authority adjudication before relying on this candidate if:

- current official Eximbay documentation materially changes the SDK version,
  API path family, environment tables, or SDK installation path;
- the pending vendor reply contradicts or qualifies this disposition;
- exact production asset identity must be treated as directly documented
  rather than as source-design composition;
- an EX2B2 proposal crosses from design into source, SDK/browser, provider
  contact, credentials, sandbox, live, or customer activation;
- BF4, refund/cancel/void, merchant capability, or financial completion is
  brought into scope; or
- repository source or authority materially changes the installed Eximbay
  runtime boundary.

Preserve this v0.1 candidate and append or supersede under the Feature
Documentation Standard. Do not rewrite it to impersonate later evidence.

## 15. Final verdict

```text
JavaScript SDK canonical generation/version:
  v2

REST/payment API path generation/version:
  v1

test origin:
  https://api-test.eximbay.com

production origin:
  https://api.eximbay.com

historical BF3/BF3-R1/BF3-R2 evidence:
  PRESERVED

BF3-R2 execution:
  NOT AUTHORIZED / NOT EXECUTED

EX2B2:
  UNBLOCKED FOR DESIGN CONTRACT ONLY

provider/browser/runtime/sandbox/live authority:
  NONE

BF4:
  SEPARATE

EX2B2 DESIGN GATE UNBLOCKED
— HUMAN AUTHORITY-DIFF PASSED / READY FOR INSTALLATION
```
