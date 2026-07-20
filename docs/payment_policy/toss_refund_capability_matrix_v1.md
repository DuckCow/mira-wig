# Toss refund capability matrix v1

As of: 2026-07-20

This non-sensitive matrix replaces the retired H1 S6 diagnostic. It is documentation only: it is
not an executable scenario, is not consumed by runtime code, and grants no provider-contact,
credential, fixture-population, SANDBOX activation, or LIVE authority.

Status vocabulary: `CONFIRMED` means supported by the cited first-party documentation or committed
application proof; `OBSERVED` means narrowly observed by completed first-party evidence;
`PARTIAL` means only part of the row is supported; `UNDOCUMENTED` means the reviewed sources do not
state the fact; `UNKNOWN` means no supported conclusion is available; and `NOT_AUTHORIZED` is an
operational prohibition rather than a provider-capability claim.

| Environment | Payment-method / product scope | Test-payment provisionability | Lookup visibility | Cancellation support | Evidence type | Evidence source / reference | Observed or reviewed | Confidence / status | Provider contact currently authorized | Operational consequence or blocker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SANDBOX | One completed domestic-card, full-refund fixture | Narrowly observed for the completed fixture only | Payment lookup was observed for that fixture | Full cancellation and same-key/same-body replay were observed for that fixture | Completed first-party S3 ledger and sanitized evidence; committed provider-fake contract tests | Completed S3 conclusion; `scripts/refund-sandbox-acceptance/README.md`; `src/__tests__/refund-sandbox-acceptance/scenario-probes.test.ts` | 2026-07-20 | OBSERVED | no | S3 is terminal and must not be rerun. One card fixture does not establish broader card, wallet, transfer, or other product support. |
| SANDBOX | Application ordinal-2 recovery after possible contact | Not a provider-capability question | Recovery lookup behavior is covered at the application boundary with fakes | Recontact authorization and ordinal behavior are proven provider-free; no unique provider claim remains | Committed production integration test | `src/lib/payment/refund/providers/toss/__tests__/s5-provider-free-recovery.integration.test.ts`; `docs/payment_policy/refund_execution_toss_recovery_v1.md` | 2026-07-20 | CONFIRMED | no | S5 has no active acceptance lifecycle and must receive no fixture authority or provider contact. S3 remains the provider replay evidence. |
| SANDBOX | Payment methods or products other than the single observed domestic-card fixture | UNKNOWN | UNKNOWN | Official endpoints exist, but method-specific eligibility and cancellation behavior are not established by repository evidence | Official-document snapshot plus explicit evidence gap | `docs/payment_policy/provider_docs_snapshot_v1.md` | 2026-07-20 | UNKNOWN | no | Do not infer support or SANDBOX provisionability. A separately reviewed evidence plan is required before any claim. |
| SANDBOX | Ordinary unavailable, ineligible, or unsupported cases | UNKNOWN | Error and response shapes are covered only by provider fakes for application behavior | No acceptance evidence is needed merely to manufacture an unavailable case | Committed provider-fake behavior tests | `src/lib/payment/refund/providers/toss/__tests__/`; `src/__tests__/refund-sandbox-acceptance/scenario-probes.test.ts` | 2026-07-20 | PARTIAL | no | Keep these cases in provider-fake tests. Do not create an acceptance run or restore S6. |
| LIVE | Any payment method or product | UNKNOWN | Official API documentation does not prove Mira LIVE readiness or SANDBOX/LIVE parity | Official cancellation endpoints do not establish account, method, rollout, or operational readiness | Official-document review only; no authorized LIVE observation | `docs/payment_policy/provider_docs_snapshot_v1.md`; `docs/payment_policy/refund_execution_toss_recovery_v1.md` | 2026-07-20 | NOT_AUTHORIZED | no | LIVE requires a separate activation decision, credential/account review, method-scoped readiness decision, and bounded canary. |

The official-document snapshot confirms that Toss documents payment lookup and full/partial
cancellation endpoints and idempotency-key behavior. It does not prove that every payment method is
provisionable or cancelable in either environment, nor does it establish SANDBOX/LIVE parity.
Unsupported capability cells therefore remain `UNKNOWN` or `UNDOCUMENTED`; absence of evidence is
not converted into a positive capability claim.

Historical H1 S1-S6 v1 manifests, ledgers, and sanitized reports remain compatibility data. Their
readability and valid cleanup/purge paths do not reactivate S5 or S6 and do not confer execution
authority.
