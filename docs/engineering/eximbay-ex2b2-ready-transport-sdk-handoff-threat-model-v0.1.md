# Eximbay EX2B2 — READY Transport + JavaScript SDK Browser Handoff Threat / Failure Model v0.1

## Status

```text
DOCUMENT CLASS:
  THREAT / FAILURE MODEL

RISK CLASS:
  HIGH

STATUS:
  HUMAN CLOSURE REVIEWED / READY FOR DOCUMENTATION INSTALLATION

HUMAN CLOSURE REVIEW:
  PASS — 2026-08-14

REVIEWED SEMANTIC PACKET:
  WIG_PAY_EXIM_EX2B2_D1_REVIEW_v0_2.zip

REVIEWED PACKET SHA-256:
  d74574873370b79c2db955fd8cedc4332f23b8625a280e5e20885167980b46c0

REVIEW EFFECT:
  Threat/failure semantics unchanged; lifecycle metadata synchronized only

SOURCE / RUNTIME AUTHORITY:
  NONE
```

## 1. Scope and protected invariants

This is the companion to the candidate
[EX2B2 Design Contract](./eximbay-ex2b2-ready-transport-sdk-handoff-design-contract-v0.1.md).
It models future server READY transport and browser SDK handoff without
authorizing either.

The current official
[FGKey preparation page](https://developer.eximbay.com/eng/eximbay/payment_linkage/preparing-fgkey.html)
distinguishes the READY FGKey passed to the SDK from the newly generated FGKey
in later `status_url` authorization-result data and points to
`/v1/payments/verify` for later validation. This model names them
`readyFgkey` and `statusFgkey`/`callbackFgkey`; the latter and verification are
BF4-only and create no EX2B2 authority.

Protected invariants:

- credentials never leave the server;
- persisted `Payment.mode` binds endpoint, credential, and SDK environment;
- durable contact authority precedes any provider bytes;
- ambiguous contact is not blindly repeated;
- final READY and SDK wire facts use the same canonical facts and the same
  non-forgeable persisted-order binding authority;
- durable READY metadata and transient readyFgkey handoff are separate;
- `providerOrderId`, readyFgkey, statusFgkey, `providerRef`, and
  `providerPaymentKey` are distinct;
- serialized browser data is untrusted; freezing is defense only;
- browser behavior is never financial truth;
- BF4 owns callback verification/completion; and
- source installation cannot activate Eximbay.

## 2. Threat and failure matrix

| Precondition | Failure / attack | Protected invariant | Detection | Prevention | Durable effect | Recovery | Residual risk | Future evidence gate |
|---|---|---|---|---|---|---|---|---|
| Eximbay config exists | API key exfiltrated through browser/error/log | secret server ownership | serialization/log tests; structured-field review | secret wrapper; allowlisted errors/logs; never include header/body in package | none; fail before contact if local | rotate outside EX2B2; audit | process compromise remains | S2 secret-boundary review |
| request endpoint is constructed | browser controls origin/path | fixed environment mapping | contract tests reject injected URL | closed `Payment.mode` mapping; redirect error | none or `CONTACT_AUTHORIZED` | correct source/config | compromised server code | S1/S2 review |
| attempt and config disagree | test/live credential, API, or SDK mixed | single attempt environment | explicit equality checks | Payment.mode owner + server interlock + closed maps | no contact; `CONTACT_AUTHORIZED` | correct deployment; same attempt re-entry | stale process config | S2 deployment evidence |
| old SDK/global exists | stale opposite-environment global reused | SDK provenance | loader-owned element/global checks | reject unowned/pre-existing/cross-mode state; full navigation | no Payment mutation | fresh document; no READY recontact | provider global is not self-identifying | S3 browser tests |
| user double clicks | concurrent READY or SDK handoff | one contact and one invocation | DB claim result; invocation latch | transaction lock; shared promise; one-shot controller | one `CONTACTED`; contenders get in-progress | observe local state | malicious client may invoke SDK directly | S2/S3 concurrency tests |
| `T-READY-SDK-ORDER-AUTHORITY`: pure EX2A SDK projection is available | opaque provider-order candidate is emitted as final SDK wire `order_id` | final READY/SDK wire order authority is the same persisted Payment.providerOrderId | final wire parity tests assert primitive string and DB equality | SDK wire materializer requires the same non-forgeable persisted binding as READY; structural objects and pure `projectEximbaySdk` alone rejected | no valid handoff issued; preserve Payment/contact evidence | correct source; do not invoke SDK | future helper implementation could regress provenance | S1 trusted-materializer source review/tests |
| `T-HANDOFF-CHANNEL-LOSS`: READY success returns readyFgkey but generic durable result has no transient channel | readyFgkey is lost or misstored in providerRef/persistence | durable metadata and transient handoff remain separate | result-shape and persistence negative tests | adjacent transient wrapper; persistence consumes durable branch only | durable `CONTACTED + READY`; no readyFgkey persisted | explicit non-actionable handoff unavailable; no recontact | fail-closed loss affects availability | S3 two-channel integration review/tests |
| `T-DURABLE-READY-WITHOUT-HANDOFF`: durable READY is re-entered later | generic `{kind:"ready"}` masquerades as actionable SDK handoff or causes recontact | only fresh continuation holding admitted readyFgkey can issue handoff | re-entry tests from durable READY without process-local handoff | return explicit non-actionable service condition; prohibit READY recontact/request_pay/providerOrderId replacement | unchanged `CONTACTED + READY` | future separately reviewed recovery only | no normal page-loss recovery | recovery contract + vendor evidence |
| `T-FGKEY-NAMESPACE-CONFLATION`: status_url contains wire field `fgkey` | statusFgkey is compared with or reused as readyFgkey | READY and callback FGKey namespaces are distinct | BF4/EX2B2 type and persistence tests | semantic ready/status labels; no persistence for comparison; statusFgkey never enters handoff | no EX2B2 transition | BF4 `/v1/payments/verify` design only | future BF4 misuse | BF4 contract/source review |
| `T-PRE-BF4-E2E`: SDK surface evidence is authorized | full sandbox request_pay transaction runs before status verification/completion authority | no payment-producing evidence crosses BF4 | evidence-contract scope review and network/browser assertions | E1A READY-only; E1B non-completing SDK surface; end-to-end E2 only after BF4 prerequisites | none in E1A/E1B | stop execution; obtain BF4 and separate E2 authority | SDK load itself may expose UI without completing | E1A/E1B contracts; BF4; later E2 |
| `T-NON2XX-OVERCONFIDENCE`: provider contact began and non-2xx arrives | HTTP status is treated as proof of no provider-side effect and attempt is retried | ambiguous post-contact outcomes never auto-recontact | state-transition tests for 3xx/4xx/429/5xx | all non-2xx -> `OUTCOME_UNKNOWN` by default; narrow only with exact later authority | `OUTCOME_UNKNOWN` | inquiry/recovery design only | provider effect remains unknown | provider evidence + recovery contract |
| `T-BROWSER-FREEZE-AUTHORITY`: server package is serialized | Object.freeze/deep-freeze is mistaken for malicious-client trust | browser data never becomes server authority | mutation/tamper tests and architecture review | freezing optional defense only; server facts/binding/parity and BF4 own correctness | no local financial success | local status/BF4 only | malicious client controls its runtime | S3 security review + BF4 |
| package reaches browser | client changes order/amount/currency/MID | server financial authority | mismatch/provider rejection; backend fact checks later | no client merge/recompute; readyFgkey parity; backend distrust | no local success | local status/BF4 only | provider mismatch behavior not proof | E1B + BF4 tests |
| readyFgkey/package retained | replay after first handoff | one bounded handoff; no financial inference | client latch; safe phase telemetry | no storage/logging; one in-memory issuance; no automatic replay | unchanged `CONTACTED + READY` | none automatically | malicious-client replay/TTL unknown | vendor/E1B evidence |
| observability enabled | API key, ready/status FGKey, raw buyer/body logged | confidentiality | log-capture negative tests | allowlist safe fields; redact/drop messages and bodies | none | remove evidence/rotate key as incident work | third-party logging hooks | S1–S3 review |
| `CONTACTED` committed | network timeout/reset or response lost | no blind READY recontact | transport outcome class | every post-mark uncertainty -> `OUTCOME_UNKNOWN` | `OUTCOME_UNKNOWN` | inquiry/manual design only | provider may hold usable readyFgkey | future inquiry/recovery contract |
| response arrives | oversized body exhausts memory | bounded admission | streaming byte counter | 64 KiB cap; cancel reader | `OUTCOME_UNKNOWN` | no recontact | partial provider processing | S1 parser tests |
| response arrives | wrong media, invalid UTF-8, malformed/trailing JSON | strict protocol admission | media/decoder/scanner/parser failures | exact media rule; fatal decode; root/trailing checks | `OUTCOME_UNKNOWN` | no recontact | schema drift can cause availability loss | S1 vectors + E1 |
| response JSON valid | duplicate protected keys exploit JS last-wins | unambiguous result/readyFgkey | pre-parse duplicate scanner | reject duplicate protected root keys | `OUTCOME_UNKNOWN` | no recontact | duplicate unknown keys ignored | S1 adversarial tests |
| provider evolves schema | required field removed/type changed/control injected | strict admitted projection | allowlist/type/control checks | reject missing/wrong/unsafe values; ignore unknown fields | `OUTCOME_UNKNOWN` | authority review | fail-closed outage | official-doc recheck/E1 |
| READY says non-success | business rejection treated as success | READY is not payment truth | exact `rescode === "0000"` check | only fully admitted 2xx exact provider non-success may be terminal; readyFgkey required for success | exact admitted rejection terminal, otherwise unknown | new attempt only when safely terminal | incomplete result taxonomy | official error-code evidence |
| READY succeeds | readyFgkey confused with durable identities | identity separation | persistence write tests | readyFgkey never written to providerOrderId/ref/paymentKey | no readyFgkey persistence | none | future developer misuse | source review |
| browser SDK loads | CDN outage/load timeout/global absent | loader availability only | timeout/error/global check | explicit loader state; no invocation on failure | unchanged | no automatic READY recontact | user cannot resume after page loss | S3 mocked tests; E1 later |
| script tag/global pre-exists | attacker/extension inserts same-looking SDK | trusted loader provenance | unowned node/global detection | reject rather than adopt | unchanged | fresh document | browser extensions can control page | S3 security review |
| request_pay called | synchronous throw or partial internal work | no duplicate invocation; no financial inference | try/catch + consumed latch | one invocation; no retry; safe UX only | unchanged | local-status observation | SDK internal side effect opaque | S3 mock; E1 observation |
| request_pay returns | app marks order paid | backend-only financial truth | return-status invariant tests | invocation result cannot call completion | unchanged | wait for BF4/local state | UI may miscommunicate if regressed | S3/BF4 review |
| user reaches return URL | return parameters forged/replayed | return is UX only | same-origin authenticated local read | ignore provider financial params; poll local DB | none unless backend already completed | local status | phishing/navigation confusion | existing + S3 tests |
| callback precedes return | UI assumes failure/success from order | ordering independence | local state projection | return UI reads finalized evidence only | BF4-owned | BF4/local polling | delayed callback | BF4 contract |
| return precedes callback | user retries payment while unresolved | one active exposure | local status and blocking attempt | no new payment from return page; unresolved remains blocking | existing attempt remains | BF4/reconciliation | abandonment | BF4 contract |
| callback duplicates | double completion | exactly-once local completion | BF4 event identity/idempotency | not implemented in EX2B2 | no EX2B2 effect | BF4 | provider semantics unknown | BF4 contract |
| callback has order_id only | webhook-first fabricates Eximbay Payment | EX2B1 identity provenance | missing persisted Payment/binding | fail closed; no fabrication | no new Payment | operator/BF4 | callback may remain unprocessed | BF4 contract |
| provider outage | generic routing falls back after Eximbay contact | provider bound per Payment | active blocking Payment | no re-resolution after contact | `OUTCOME_UNKNOWN` or unchanged | provider inquiry/manual | long outage | recovery design |
| SDK CDN outage | operator switches test/live URL | fixed canonical source | loader source equality | no arbitrary override; no cross-env coexistence | unchanged | rollback source only | production exact asset availability unproven | separately authorized E1B before activation |
| merchant lacks method/currency | request reaches unsupported capability | no unproven capability | pre-contact capability gate; provider response | keep routing disabled until evidence; validate canonical facts | pre-contact unchanged or post-contact rejection/unknown | capability review | provider configuration can drift | merchant evidence gate |
| handoff being built | Payment is superseded/mutated | package bound to live attempt | post-READY Payment re-read | require same Payment/mode/providerOrderId/lifecycle; contacted attempts cannot supersede normally | unknown on persistence race | manual/local status | crash after READY | S2/S3 integration tests |
| route/locale/market changes | new storefront context rewrites attempt | payment identity independent of UI | equality checks | ignore current context; use persisted facts/binding; browser copy stays untrusted | unchanged | continue fresh exact handoff or stop | confusing display locale | S3 UX review |
| browser crashes/navigates | ephemeral readyFgkey/package lost | no unsafe persistence/recontact | durable READY exists without transient wrapper | do not persist/log/reissue automatically; return non-actionable result | `CONTACTED + READY` | local status; future reviewed recovery only | unrecoverable normal handoff availability | vendor TTL/reuse + recovery contract |
| operator sees unresolved | operator edits providerOrderId or clears state and retries | durable evidence integrity | DB constraints/audit; reconciliation | immutable providerOrderId; runbook prohibition; no bypass API | preserved `OUTCOME_UNKNOWN` | reviewed recovery only | privileged DB misuse | operations/recovery contract |
| source merged | dormant adapter accidentally selected | activation separation | registry/routing tests | EXIMBAY remains disabled; no modes/methods; dual gates later | no contact | rollback code without erasing data | configuration drift | source-status + activation review |
| status_url is prepared | EX2B2 silently implements callback/completion | BF4 separation | changed-path/source review | no Eximbay route/parser/verifier/completion in S1–S3 | none | BF4 only | later scope creep | BF4 design contract |

## 3. Failure ownership summary

Server-owned pre-contact failures remain uncontacted and may re-enter only with
the same Payment identity after correction. Every uncertain failure after
durable `CONTACTED` becomes `OUTCOME_UNKNOWN`. A fully admitted non-`0000`
2xx business result may become terminal only when its exact final semantic is
complete. Every 3xx, 4xx, 429, and 5xx is `OUTCOME_UNKNOWN` by default;
malformed or incomplete responses are also unknown.

Browser-owned failures never mutate financial state. SDK load/invocation,
closure, navigation, and return URL can only affect UX. BF4 owns callback
arrival, verification, duplicates, ordering, and completion.

## 4. Residual risks and mandatory future gates

Fail-closed design trades availability for correctness where authority is
missing. The largest residual is a valid readyFgkey lost after READY: the design
neither persists it nor authorizes a second READY contact. This remains so
until direct authority establishes TTL/reuse/idempotency and a reviewed
recovery contract exists. Durable READY stays `CONTACTED + READY`, and normal
re-entry returns a non-actionable handoff-unavailable condition.

Required future gates are S1 parser/transport review, S2 lifecycle and secret
boundary review, S3 two-channel/loader/CSP review, separately authorized E1A
READY evidence, independently justified non-completing E1B SDK-surface
evidence, BF4 callback/completion design, and only then a separately authorized
E2 end-to-end sandbox exercise. Merchant capability evidence and a future
operations/recovery contract remain separate.

## 5. Candidate conclusion

`T-READY-SDK-ORDER-AUTHORITY` and the two handoff-channel threats are
`CLOSED_BY_CORRECTED_DESIGN`: final SDK wire requires non-forgeable persisted
binding authority, and durable READY cannot masquerade as an ephemeral handoff.
No modeled threat requires broadening authority or adding a new durable
lifecycle state. All unresolved external semantics have a fail-closed boundary.
This human-closure-reviewed candidate is ready for documentation installation
only and grants no source/runtime authority.
