# Eximbay EX2B2 — READY Transport + JavaScript SDK Browser Handoff Design Contract v0.2

## Status and supersession

```text
DOCUMENT CLASS:
  DESIGN CONTRACT

RISK CLASS:
  HIGH — EXTERNAL PAYMENT PROVIDER CONTACT + BROWSER SDK HANDOFF

VERSION:
  v0.2

HUMAN / TARGETED CORRECTNESS REVIEW:
  PASS

INSTALLATION STATUS:
  READY FOR DOCUMENTATION INSTALLATION

SUPERSEDES UPON REVIEWED INSTALLATION:
  eximbay-ex2b2-ready-transport-sdk-handoff-design-contract-v0.1.md

SOURCE / RUNTIME / PROVIDER AUTHORITY:
  NONE
```

This is a small prospective normative overlay. Upon reviewed
installation, it incorporates the
[EX2B2 Design Contract v0.1](./eximbay-ex2b2-ready-transport-sdk-handoff-design-contract-v0.1.md)
unchanged except for the exact evidence-sequencing dependency in this
document. Version v0.1 remains immutable current installed authority and
becomes the historical predecessor only upon v0.2 installation. This document
does not authorize source changes, provider contact, SDK loading, execution,
credentials, routing, or activation.

## 1. Scope and exact semantic delta

The previous parent evidence sequence is:

```text
OLD:
  S1 -> S2 -> S3 -> E1A -> E1B
```

After human-reviewed installation of v0.2, the prospective sequence is:

```text
NEW:
  S1 -> S2 -> S3
                |
                +-> E1A
                |
                +-> E1B
```

E1A and E1B are independent evidence branches after S3. This changes only the
prerequisite relationship between those evidence steps. It does not
retroactively rewrite any historical E1A or E1B contract, execution, or
evidence.

## 2. E1A branch

```text
purpose:
  account-bound / merchant-specific READY transport-capability evidence

current status:
  DEFERRED / NOT SATISFIED

relationship to E1B:
  not a prerequisite for the bounded credential-free E1B SDK-surface question
```

E1B does not satisfy, rename, complete, or replace E1A. The retired account-
bound exact-baseline track remains retired, and any future E1A re-entry keeps
its own authority and evidence requirements.

## 3. E1B branch

```text
purpose:
  real public TEST v2 SDK asset load/global/callable browser-surface evidence

exact bounded question:
  can the current installed Mira loadEximbaySdkV2("SANDBOX") loader load the
  real TEST v2 SDK in a disposable browser document and capture a callable
  request_pay function without invoking it?

credential requirement:
  none

READY / FGKey requirement:
  none

Payment state requirement:
  none

request_pay:
  PROHIBITED / 0

payment-producing behavior:
  PROHIBITED / 0
```

E1B is credential-free and non-completing. It consumes no E1A evidence, READY
authority, FGKey, MID/API key/Authorization, Payment database state, merchant
capability, or `request_pay` authority. It directly exercises only the current
production loader bytes in a disposable browser surface under a separate
bounded execution contract.

This evidence branch is distinct from the production EX2B2-B handoff path.
The production handoff continues to consume admitted READY output and trusted
canonical facts exactly as v0.1 specifies; E1B does not fabricate or exercise
that READY-dependent application path.

## 4. MIRA-PUBLIC-READY-1 relationship

```text
MIRA-PUBLIC-READY-1:
  CLOSED / ADMITTED
  separate admitted current-Mira public-shared READY evidence
  not an E1B prerequisite
  not consumed by E1B
```

MIRA-PUBLIC-READY-1 neither authorizes E1B nor substitutes for account-bound
E1A. It remains separate admitted evidence. E1A may remain
`DEFERRED / NOT SATISFIED` while one independently and separately authorized
E1B invocation occurs after this design and its execution contract are
human-reviewed and installed.

Neither branch creates source, provider-contact, financial, routing, LIVE,
checkout, customer, or production activation authority.

## 5. Downstream E2 and BF4 gate

E1B success proves only TEST v2 SDK load/global/callable surface availability
through the current Mira loader. It does not prove merchant capability, READY
capability, FGKey validity, payment-page behavior, transaction success, or
production readiness.

```text
BF4 readiness
+ separately adjudicated merchant/sandbox authority
        ->
E2 payment-producing end-to-end sandbox exercise
```

E2 remains blocked until both prerequisites are separately satisfied. Neither
E1A nor E1B bypasses BF4, and `request_pay` remains outside E1B.

## 6. Preserved v0.1 semantics

All unrelated EX2B2 Design Contract v0.1 semantics remain unchanged,
including:

- EX2B2-A server READY ownership and strict response admission;
- EX2B2-B browser-safe handoff semantics;
- persisted `Payment.mode` as environment owner;
- server-only credential custody;
- durable `CONTACTED` before provider contact;
- conservative `OUTCOME_UNKNOWN` handling and no blind retry;
- READY success as non-financial;
- browser serialization and browser behavior as non-authoritative;
- the `readyFgkey` versus `statusFgkey`/`callbackFgkey` distinction;
- BF4 ownership of callback/status verification, duplicate handling, and
  completion;
- routing, customer, sandbox/LIVE, and activation separation; and
- current installed source semantics unless separately reviewed and changed.

The existing
[Threat / Failure Model v0.1](./eximbay-ex2b2-ready-transport-sdk-handoff-threat-model-v0.1.md)
remains unchanged. This evidence-sequencing correction adds no runtime path,
provider contact, credential flow, state transition, or new threat surface.

## 7. Authority boundary and change control

Before this design is human-reviewed and installed, it grants no authority and
the installed v0.1 sequence remains governing. After installation, a separate
human authorization under an installed E1B execution contract is still
required for one E1B invocation. No standing or repeatable SDK-load authority
is created.

A new reviewed design authority/version is required for any later change that:

- makes E1B call `request_pay`;
- makes E1B depend on READY, FGKey, merchant credentials, or Payment state;
- treats E1B as proof of merchant, READY, payment, or production capability;
- lets E2 bypass BF4 readiness or merchant/sandbox adjudication; or
- materially changes E1A/E1B branch purpose, ownership, or dependency.

```text
POST-INSTALLATION EXECUTION GATE:
  separately human-authorized one E1B invocation
  under the installed E1B execution contract

STANDING EXECUTION AUTHORITY:
  NONE
```
