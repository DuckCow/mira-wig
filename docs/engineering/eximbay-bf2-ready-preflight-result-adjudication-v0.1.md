# Eximbay BF2 Shared-Test `/ready` Preflight — Result Evidence / Independent Adjudication v0.1

## Status

```text
DOCUMENT CLASS:
  RESULT EVIDENCE / INDEPENDENT ADJUDICATION

RISK CLASS:
  HIGH — EXTERNAL PAYMENT-PROVIDER EVIDENCE

TASK CLASSIFICATION:
  EVIDENCE_COLLECTION

TASK-LEVEL AUTHORIZATION:
  DOCUMENTATION ONLY

BF2 EXECUTION:
  COMPLETE — ONE AUTHORIZED RUN

RESULT CUSTODY:
  VALID_CUSTODY

EXECUTION CONFORMANCE:
  EXECUTION_CONFORMANT

EVIDENCE VALIDITY:
  BF2_EVIDENCE_VALID_WITH_LIMITATIONS

CURRENT STATUS:
  ADJUDICATED / VALID WITH LIMITATIONS

EXIMBAY PRODUCT/RUNTIME ACTIVATION:
  NONE

BF2 REPEAT:
  NOT AUTHORIZED

CHANGE CONTROL:
  supersedes: none
  superseded-by: none
```

## 1. Purpose and authority boundary

This record installs the durable repository evidence and independent
adjudication for the completed Eximbay BF2 shared-test `/ready` preflight. It
binds the external sanitized Result-v1 evidence by run ID, canonical basename,
byte count, and SHA-256 rather than copying either evidence JSON file into the
repository.

This record is descriptive. It does not supersede or amend the historical
[BF2 Provider Evidence / Execution Contract](./eximbay-bf2-shared-test-ready-preflight-contract-v0.1.md),
rerun BF2, create provider-contact authority, implement EX2B1, freeze a
persistence schema, load an SDK, create a callback, or activate Eximbay in any
Mira runtime or merchant environment.

The lifecycle distinctions are explicit:

```text
BF2 contract:
  REVIEWED / MERGED / HISTORICAL NORMATIVE EXECUTION AUTHORITY

BF2 execution:
  COMPLETE — ONE RUN

BF2 Result custody:
  VALID_CUSTODY

BF2 evidence:
  BF2_EVIDENCE_VALID_WITH_LIMITATIONS

provider preparation observations:
  THREE EXACT SHARED-TEST REQUESTS OBSERVED_ACCEPTED

payment success or activation:
  NOT ESTABLISHED / NOT AUTHORIZED
```

## 2. Governing documentation and precedence

This record is governed by:

1. [Feature Documentation Standard v0.1](./feature-documentation-standard-v0.1.md).
2. [BF2 Shared-Test `/ready` Preflight Provider Evidence / Execution Contract v0.1](./eximbay-bf2-shared-test-ready-preflight-contract-v0.1.md).
3. [EX2A Pure Protocol Kernel Source Status / As-Built v0.1](./eximbay-ex2a-pure-protocol-kernel-source-status-v0.1.md).
4. The actual sanitized Result-v1 original/archive bytes identified in §4.
5. Repository and Git history identified in §3.

The BF2 contract remains the normative execution authority and history. This
later record describes the actual evidence, custody validation, execution
conformance, supported observations, unsupported conclusions, and next design
gate. It creates no product or runtime activation authority.

## 3. BF2 contract and reviewed chain

Repository history independently establishes:

```text
contract PR:
  #49

reviewed feature head:
  98f8126f545cfb3faeb2330c06347da641cb406d

contract merge:
  0216042c970c285f934237b42c863045729d3420

contract merge parent 1:
  4739fcff225ccbed1764a8ea1a6551a81a487c04

contract merge parent 2 / reviewed feature head:
  98f8126f545cfb3faeb2330c06347da641cb406d
```

The independently computed SHA-256 of the merged contract bytes is:

```text
57e350f7cbf44cb0fe278eb9b5e05c3fc6d26ed42a7600c993c106e6ad091f8b
```

## 4. Result identity and external custody binding

The actual evidence identity is:

```text
UTC run ID:
  20260811T020910297Z

canonical basename:
  eximbay-bf2-ready-preflight-result-v1-20260811T020910297Z.json

bytes:
  5522

SHA-256:
  e2efba46224b00c7d591e2875b1f7aa0fc5ff86d86a9d18f2e62802b273b95e7
```

At adjudication authoring time, the historical local custody locations were:

```text
original:
  /Users/duckcow/mira-evidence/eximbay-bf2/20260811T020910297Z/original/eximbay-bf2-ready-preflight-result-v1-20260811T020910297Z.json

archive:
  /Users/duckcow/mira-evidence/eximbay-bf2/20260811T020910297Z/archive/eximbay-bf2-ready-preflight-result-v1-20260811T020910297Z.json
```

Those absolute paths are historical local custody observations, not portable
repository paths or operational dependencies. The durable repository binding
is the run ID, basename, byte count, and SHA-256. Neither Result JSON is copied
into this repository.

## 5. Result schema and authority binding

The Result-v1 bytes record:

```text
schema:
  mira.eximbay.bf2-ready-preflight-result

version:
  1

experiment:
  EXIMBAY-BF2-READY-PREFLIGHT
```

Their repository-authority binding is exactly:

```text
contractMergeSha:
  0216042c970c285f934237b42c863045729d3420

contractFileSha256:
  57e350f7cbf44cb0fe278eb9b5e05c3fc6d26ed42a7600c993c106e6ad091f8b

ex2aSourceMergeSha:
  685fc048c8cb6fb834593e3b1f56756817c8e9ab

ex2aSourceStatusMergeSha:
  4739fcff225ccbed1764a8ea1a6551a81a487c04
```

Each value was read from the actual Result bytes and checked against the
installed repository and Git history.

## 6. Custody adjudication

The independently established custody disposition is:

```text
VALID_CUSTODY
```

Supporting facts:

```text
original regular file:
  YES

archive regular file:
  YES

separate files:
  YES — distinct inode identities

original bytes:
  5522

archive bytes:
  5522

original SHA-256:
  e2efba46224b00c7d591e2875b1f7aa0fc5ff86d86a9d18f2e62802b273b95e7

archive SHA-256:
  e2efba46224b00c7d591e2875b1f7aa0fc5ff86d86a9d18f2e62802b273b95e7

byte-for-byte equality:
  PASS

strict UTF-8 decode:
  PASS

JSON parse:
  PASS

canonical two-space JSON with one final LF:
  PASS
```

## 7. Execution conformance

The execution disposition is:

```text
EXECUTION_CONFORMANT
```

The Result records:

```text
requestCeiling:
  3

actualProviderRequestCount:
  3

contactMayHaveBegun count:
  3

attempt order:
  prefix-complete 1 / 2 / 3

automatic repeat or fourth request:
  NONE RECORDED
```

Result-v1 establishes its recorded contact-accounting state; it is not
packet-level proof of absence of invisible network traffic.

## 8. Evidence-validity disposition and limitations

The independent disposition is:

```text
BF2_EVIDENCE_VALID_WITH_LIMITATIONS
```

The limitations are material to interpretation:

1. The environment was public shared-test only.
2. Result-v1 is a sanitized projection; raw response bodies were not retained.
3. No packet capture exists.
4. Only two exact values were tested in the synthetic provider-order family.
5. No SDK was loaded.
6. No payment page was opened.
7. No card transaction occurred.
8. No callback was observed.
9. No authorization, capture, or settlement occurred.
10. No Mira-specific merchant-account evidence was collected.

These limitations bound the valid evidence; they do not invalidate the three
exact preparation observations in §§9–12.

## 9. Attempt 1 — numeric baseline

```text
ordinal:
  1

class:
  NUMERIC_BASELINE

order ID:
  20260811020910

currency / amount:
  USD / "1.00"

forced payment method:
  none

HTTP / Content-Type / response bytes:
  200 / application/json / 112

rescode / sanitized resmsg:
  0000 / Success

FGKey:
  present; length 64

classification:
  OBSERVED_ACCEPTED

duration:
  221 ms
```

No raw FGKey, raw provider response, or credential is recorded here.

## 10. Attempt 2 — synthetic representative + P000/USD

```text
ordinal:
  2

class:
  SYNTHETIC_CUID1_P000_USD

order ID:
  cxzwoirgyn01t92gdyq301wdz

shape / length:
  ^c[0-9a-z]{24}$ / 25

currency / amount:
  USD / "1.00"

payment method:
  P000

HTTP / Content-Type / response bytes:
  200 / application/json / 112

rescode / sanitized resmsg:
  0000 / Success

FGKey:
  present; length 64

classification:
  OBSERVED_ACCEPTED

duration:
  54 ms
```

This value is a **synthetic representative**. It is not Prisma-generated, not
a database `Payment.id`, and not proof of a provider grammar.

## 11. Adaptive branch

The Request-2 classification and recorded adaptive decision are:

```text
R2 classification:
  OBSERVED_ACCEPTED

branchDecision:
  R3_A_P000_JPY

branchDecisionReason:
  REQUEST_2_OBSERVED_ACCEPTED

Branch B:
  NOT EXECUTED
```

## 12. Attempt 3 — distinct synthetic representative + P000/JPY

```text
ordinal:
  3

class:
  SYNTHETIC_CUID1_P000_JPY

order ID:
  cff0bapu3rjz8h21f66ck90y0

shape / length:
  ^c[0-9a-z]{24}$ / 25

currency / amount:
  JPY / "1"

payment method:
  P000

HTTP / Content-Type / response bytes:
  200 / application/json / 112

rescode / sanitized resmsg:
  0000 / Success

FGKey:
  present; length 64

classification:
  OBSERVED_ACCEPTED

duration:
  54 ms
```

The Request-2 and Request-3 identities are distinct. Attempt 3 is likewise a
synthetic representative, not a Prisma-generated or database identity.

## 13. Terminal Result state

```text
branchDecision:
  R3_A_P000_JPY

terminalOutcome:
  READY_PREFLIGHT_EVIDENCE_COMPLETE

stopReason:
  null

warnings:
  []

fourth provider request:
  NONE

repeat authority:
  NONE
```

`READY_PREFLIGHT_EVIDENCE_COMPLETE` is the contract's bounded evidence
terminal state. It is not payment success, production readiness, general
provider compatibility, or activation.

## 14. Independent observation dispositions

### O1 — baseline

```text
OBSERVED_SUPPORTED
```

> The exact shared-test `PAYMENT`, USD `"1.00"`, no-forced-payment-method
> `/ready` request received an accepted preparation response under the BF2
> predicate.

### O2 — P000/USD

```text
OBSERVED_SUPPORTED
```

> The exact tested synthetic provider-order ID with `P000` and USD `"1.00"`
> received an accepted shared-test `/ready` preparation response.

### O3 — P000/JPY

```text
OBSERVED_SUPPORTED
```

> A different tested synthetic provider-order ID with `P000` and JPY `"1"`
> received an accepted shared-test `/ready` preparation response.

These are preparation observations. They are not successful payments.

## 15. Explicit non-conclusions

BF2 does **not** establish:

- the complete Eximbay `order_id` grammar;
- acceptance of all `c` + 24-lowercase-base36 strings;
- acceptance of all Prisma `Payment.id` values;
- safety of raw `Payment.id` as Eximbay `order_id`;
- `order_id` minimum or maximum length;
- production `order_id` behavior;
- Mira merchant-account P000 capability;
- Mira merchant-account USD or JPY capability;
- P000 appearance on a payment page;
- actual card-payment behavior;
- 3DS behavior;
- authorization, capture, or settlement;
- SDK version or canonical URL;
- `status_url` transport;
- callback acknowledgement or retry behavior;
- refunds; or
- live routing.

## 16. Order-ID adjudication

The narrow accepted evidence is:

```text
observed accepted synthetic family:
  c + 24 lowercase base36

actual accepted representatives:
  2

general provider grammar:
  UNKNOWN

all-family acceptance:
  NOT PROVEN

actual Prisma-created Payment.id acceptance:
  NOT TESTED
```

The synthetic family is an evidence-backed candidate for a future
Mira-controlled provider-order identity design. It is not a claim about Prisma
or a complete provider grammar.

## 17. Primary next path

The independent next-path adjudication is:

```text
EX2B1_CONTRACT_CAN_PROCEED_WITH_SELECTED_SYNTHETIC_PROVIDER_ORDER_ID_FAMILY
```

This is narrow planning authority. EX2B1 may design a Mira-controlled
provider-order identity with these required properties:

```text
one per Payment attempt
generated before provider contact
selected family: c + 24 lowercase base36
immutable after assignment
never reused after provider contact may have begun
collision-safe
persisted before /ready
used independently of raw Payment.id
```

No behavior is implemented or authorized by BF2. Design authority exists only
after the future EX2B1 contract is itself reviewed and merged.

## 18. Persistence and schema remain unresolved

This adjudication does **not** freeze the repository schema. EX2B1 must decide,
after fresh repository reconnaissance:

```text
new field/table ownership
provider-specific versus generic semantics
nullable lifecycle
uniqueness scope
database uniqueness constraint
generation timing
transaction/concurrency semantics
collision handling
immutability enforcement
relation to Payment.id
relation to providerRef
relation to providerPaymentKey
rollback/migration behavior
```

Current adjudication determines that `providerRef` must not be silently
overloaded unless a future repository audit proves semantic compatibility.
This record does not select a field, table, constraint, or migration.

## 19. P000/USD source consequence

```text
YES_FOR_PROVIDER_FREE_SOURCE_CONTRACT
```

EX2B1 may design a server-side preparation request contract for the exact
observed `P000` plus canonical USD wire representation while provider/runtime
activation remains disabled. This does not authorize an actual payment,
provider contact, or live merchant use.

## 20. P000/JPY source consequence

```text
YES_FOR_PROVIDER_FREE_SOURCE_CONTRACT
```

EX2B1 may likewise design for the exact observed shared-test `P000` plus JPY
`"1"` preparation. This does not generalize beyond the exact tested request or
authorize an actual payment, provider contact, or live merchant use.

## 21. SDK gate

```text
KEEP_BF3_SEPARATE_BEFORE_EX2B2
```

BF2 loaded no SDK, did not resolve v1 versus v2, opened no payment page, and
observed no browser behavior. SDK authority is unchanged.

## 22. Callback gate

```text
BF4_CALLBACK_EVIDENCE_STILL_REQUIRED
```

The `/ready` endpoint's acceptance of a `.invalid` `status_url` does not
establish HTTP method, query/body placement, Content-Type, encoding,
acknowledgement, retry, or duplicate-delivery runtime behavior.

## 23. Merchant-account boundary

BF2 public shared-test evidence provides no Mira-specific authority for:

```text
P000 enablement
USD
JPY
3DS
refund
card networks
production credentials
live approval
routing
activation
```

Shared-test acceptance must not be represented as Mira merchant-account or
production capability.

## 24. Final BF2 disposition

```text
BF2 RESULT VALID WITH LIMITATIONS —
NEXT DESIGN GATE MAY PROCEED

BF2 repeat:
  NOT AUTHORIZED
```

A new provider run requires separate explicit future authority.

## 25. Next lifecycle gate

The next repository planning step is:

```text
EX2B1 — Provider Order Identity + Server-Side /ready Preparation
Design Contract
```

Its first task must perform fresh repository reconnaissance for:

```text
Payment.providerRef semantics
Payment.providerPaymentKey semantics
Payment.idempotencyKey semantics
Payment lifecycle / contact ownership
provider-specific storage precedent
migration/index/check-constraint precedent
provider factory/routing exclusion boundary
```

The BF2 Result record does not itself choose those answers. BF3 remains a
separate SDK evidence gate, BF4 remains a required callback evidence gate, and
Mira merchant-account/live authority remains separate.

## 26. Change control and evidence preservation

This v0.1 record describes the exact BF2 Result identified in §4. The
historical BF2 execution contract and both external evidence JSON files remain
unchanged. A later semantic reinterpretation, new provider run, different
evidence identity, or changed next-gate authority requires separate explicit
review and a new version or supersession record under the Feature
Documentation Standard.

Evidence preservation remains:

```text
tested order IDs:
  never reuse

raw FGKeys:
  not retained / never reconstruct

provider follow-up or cleanup call:
  not authorized

sanitized original/archive Result-v1:
  preserve byte identity through adjudication review
```

## Verdict

```text
BF2 RESULT ADJUDICATION RECORD v0.1 COMPLETE
— READY FOR INDEPENDENT DOCUMENTATION REVIEW
```
