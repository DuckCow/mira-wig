# Claude/Fable ultracode review packet v1

Purpose: prepare a bounded, high-signal review for Mira code/design verification and improvement discovery. Claude/Fable must act as a reviewer only. Do not ask Claude to write code, produce diffs, or directly change implementation.

---

## 1. Scope and operating rules

Claude role:

- Reviewer only.
- Verify design-code consistency.
- Identify risks, missing tests, false confidence, and unclear assumptions.
- Suggest Codex recon prompts, not code changes.
- Findings must be discussed with the human/ChatGPT before Codex receives implementation prompts.

Hard boundaries:

- No implementation.
- No code diffs.
- No schema changes.
- No provider API calls.
- No credentials or `.env` inspection.
- No live provider enablement.
- No "just wire Toss" or "just wire PayPal" recommendation.
- No use of unverified provider docs or remembered provider behavior as fact.
- If provider facts are needed, ask for official-doc verification as a separate recon task.

Review intensity:

- Treat `src/lib/payment/**`, `src/app/api/payments/**`, `src/lib/storage/**`, `src/lib/fitting/**`, `src/lib/ai/**`, and `prisma/schema.prisma` as STRICT surfaces per `AGENTS.md`.
- Treat payment completion, confirm, webhook, void, outbox, and reconciliation as money-path or money-adjacent review targets.
- Prefer concrete file/path evidence over broad architectural opinions.

---

## 2. Current baseline

Current whole-project handoff:

- `docs/handoff/mira_handoff_v36.md`
- Commit: `3d23037 docs(project): add whole-project handoff v36`

Detailed payment-track handoff:

- `docs/handoff/mira_handoff_v35.md`
- Commit: `d067ab3 docs(payment): add C2 provider confirm handoff v35`

Current verification baseline:

```text
28 files / 407 tests
```

Last known full verify:

```text
npm run verify: passed
typecheck: passed
lint: 0 errors, existing <img> warnings only
vitest: 28 files / 407 tests passed
```

Current payment status:

- New payment core rebuild is active in `src/lib/payment/**`.
- `src/app/actions/payment.ts` is a thin-ish server action boundary around provider resolution, confirm key preparation, provider confirm, and `completeFromCapture`.
- `src/lib/payment/providers/resolve.ts` still returns mock providers only.
- Real Toss adapter wiring is blocked.
- Real PayPal adapter wiring is blocked.
- Toss success route persists `Payment.providerRef` only and does not complete local orders/payments.
- C2 reconciliation remains report-only.
- Real webhook verifier/parser and real void/provider lookup remain blocked/deferred.

Current repo caveats:

- `README.md` is still default create-next-app text.
- `docs/go-live-checklist.md` is stale relative to the current post-cutover payment rebuild and should not be treated as current live-readiness evidence.
- Public home, checkout, customer orders, and admin orders pages include scaffolds/stubs noted in v36.

---

## 3. SSOT map

Project rules:

- `AGENTS.md` is the code-side rules SSOT.
- `docs/collaboration-protocol.md` defines the human/Claude/Codex collaboration loop.

Current state:

- `docs/handoff/mira_handoff_v36.md` is the current whole-project handoff.
- `docs/handoff/mira_handoff_v35.md` remains the detailed C2 provider-confirm detector payment snapshot.

Payment policy:

- `docs/payment_policy/payment_policy_confirmed_v6.md` is the latest confirmed policy baseline.
- `docs/payment_policy/payment_policy_open_v6.md` is the latest open/deferred policy baseline.
- Code facts still win over handoff prose when they conflict.

Payment D1/C2 design locks:

- `docs/payment_policy/d1b_adapter_boundary_design_v1.md`
- `docs/payment_policy/d1b_provider_ref_persistence_decision_v1.md`
- `docs/payment_policy/d1b_confirm_idempotency_decision_v1.md`
- `docs/payment_policy/d1b_provider_confirm_capture_mapping_v1.md`
- `docs/payment_policy/d1b_toss_callback_orderid_decision_v1.md`
- `docs/payment_policy/d1b_toss_confirm_adapter_design_v1.md`
- `docs/payment_policy/d1b_provider_confirm_result_bridge_design_v1.md`
- `docs/payment_policy/c2_provider_confirm_detector_design_v1.md`

Schema/data model:

- `prisma/schema.prisma`
- `prisma/migrations/`

Primary review source paths:

- `src/app/actions/payment.ts`
- `src/lib/payment/providers/`
- `src/lib/payment/complete/`
- `src/lib/payment/webhook/`
- `src/lib/payment/void/`
- `src/lib/payment/outbox/`
- `src/lib/payment/reconciliation/`
- `scripts/payment-reconcile.ts`

---

## 4. Completed payment work summary

D1-A provider selection:

- Provider routing and registry exist in `src/lib/payment/providers/routing.ts`.
- KR card routes to Toss candidates, US/JP PayPal wallet routes to PayPal candidates, mock routes exist for KR/US/JP.
- Registry distinguishes mock-only and live enablement.
- `src/app/actions/payment.ts` currently calls routing with `PaymentMode.SANDBOX`.

D1-B adapter boundary:

- Provider contract types live under `src/lib/payment/providers/types.ts` and `contract.ts`.
- Provider confirm can return legacy `PaymentConfirmFacts` or `NormalizedProviderConfirmResult`.

ProviderRef persistence:

- `Payment.providerRef` exists in schema.
- Initiate/callback paths can persist provider-side pre-capture reference.
- Invariant: `Payment.providerPaymentKey` remains final post-capture identity.

Confirm idempotency:

- `Payment.providerConfirmIdempotencyKey` exists in schema and is unique.
- `src/app/actions/payment.ts` creates deterministic keys of form `confirm:{provider}:{paymentId}` if missing.
- Retryable provider confirm failures preserve the confirm key.

Toss callback/orderId:

- Toss orderId format is `mira_toss_{payment.id}`.
- Toss success route calls `persistTossCallbackProviderRef`.
- Success route does not call `provider.confirm`, Toss HTTP, or local completion.

Toss confirm mapper / fake adapter seam:

- Toss confirm request builder, response normalizer, error taxonomy, redaction helpers, and fake HTTP adapter seam exist.
- `createTossConfirmAdapter({ httpClient })` uses injected fake HTTP only.
- No production resolver wiring to the real Toss adapter exists.

Provider confirm bridge:

- `src/lib/payment/providers/confirm-bridge.ts` maps normalized success to `CaptureFacts`.
- `RETRYABLE` is action-only and preserves pending status/key.
- `TERMINAL` marks only the current pending Payment attempt failed with safe marker.
- `MANUAL_REVIEW` and `STOP` persist safe markers while keeping pending money state.
- `PROGRAMMER_ERROR` fails closed and has no durable C2 marker today.

C2 provider-confirm detector:

- `src/lib/payment/reconciliation/provider-confirm.ts` appends report-only findings.
- New finding kinds:
  - `STALE_PROVIDER_CONFIRM_ATTEMPT`
  - `PROVIDER_CONFIRM_TERMINAL_FAILED`
  - `PROVIDER_CONFIRM_MANUAL_REVIEW`
  - `PROVIDER_CONFIRM_STOP`
- No `PROVIDER_CONFIRM_PROGRAMMER_ERROR` finding exists because the bridge does not persist that marker today.
- `scripts/payment-reconcile.ts` supports `--stale-provider-confirm-ms`.

---

## 5. Non-payment project summary

Use v36 as the current whole-project summary. High-level current tracks:

- Auth/session/admin guard: present and used.
- Market/i18n: KR/US/JP market resolution and formatting exist.
- Catalog/product browsing: active, market-aware style list/detail pages exist.
- Admin catalog/market price: active style/variant/price/gap operations exist.
- Storage: catalog mock/S3 switch exists; fitting storage is mock-only.
- AI fitting: mock-provider fitting flow exists and is tested.
- Cart: active authenticated cart add/update/remove flow exists.
- Checkout: backend checkout session lifecycle exists, visible checkout page is currently a cutover stub.
- Orders/manufacturing: schema and completion logic exist, customer/admin order pages are currently stubs.
- Reconciliation/operations: report-only payment reconciliation exists.
- UI components: shared feature/UI components exist, but product home remains default starter.

Unknown or deferred items should be marked unknown by Claude rather than inferred.

---

## 6. Known blockers and deferred items

Payment blockers:

- Real Toss adapter wiring.
- Real PayPal adapter wiring.
- Sandbox/live guard and live enablement policy.
- Real webhook verifier/parser.
- Real void taxonomy.
- `VOID-HOOK-DEBT`.
- Provider lookup/manual-review runbook.
- C2 run history, ack, admin workflow, and retention policy if still deferred.
- Live credentials/env reads.
- Public Toss success route completion.
- Provider resolver wiring to real adapters.

Policy/open blockers from `payment_policy_open_v6.md`:

- Delayed-completion path decision, including PayPal eCheck/risk-hold style pending paths.
- PII vault vs immutable ledger/snapshot policy.
- Refund/cancel state machine beyond completion-failure void.
- Tax/customs/MoR subdecisions.
- PG contract/provider facts requiring official-doc/contract verification.
- Disputes/chargebacks.
- Jurisdiction-specific custom-order withdrawal/restockability.
- Event ledger retention, raw payload masking, rejection spam control.

Whole-project deferred items from v36:

- Product home page.
- Project README.
- Checkout UI reconnection.
- Customer order read model/pages.
- Admin order/refund/read model pages.
- Cart price display market-correctness recon.
- Real AI/VTO integration.
- Real fitting storage/privacy/retention plan.
- Updated go-live checklist.

---

## 7. Review questions for Claude

### A. Design-code consistency

1. Does current code match the latest policy/design locks, or are there silent drifts between docs and source?
2. Is `src/app/actions/payment.ts` still thin enough, or has payment logic leaked out of `src/lib/payment/**` in a way that weakens STRICT enforcement?
3. Do `Payment.providerRef`, `Payment.providerConfirmIdempotencyKey`, and `Payment.providerPaymentKey` preserve their intended separate meanings across initiate, callback, confirm, completion, webhook, void, and reconciliation?
4. Does v36 accurately summarize non-payment project state from source, or are there incorrect/stale anchors that would mislead a new session?

### B. Money-path safety

1. In `completeFromCapture` and `runCompletionTransaction`, do row locking, idempotency checks, amount/currency guards, session state guards, stock decrement, order/MR creation, cart deletion, and session transition compose safely?
2. Does terminal completion failure compensation enqueue void only when there is captured evidence that requires compensation?
3. Are there failure paths where local order/payment/session state can diverge without C2 detecting it?
4. Are there concurrency scenarios not covered by the current test suite, especially confirm/webhook races and duplicate provider keys?

### C. Provider readiness

1. What exact stop conditions remain before real Toss wiring?
2. What exact stop conditions remain before real PayPal wiring?
3. Is the current adapter seam sufficient for real-provider wiring, or are additional boundaries needed first for sandbox/live mode, credentials, provider lookup, and official webhook verification?
4. Does `PaymentMode.SANDBOX` in the action boundary create any false sense of readiness or future wiring trap?
5. Are normalized provider classifications (`RETRYABLE`, `TERMINAL`, `MANUAL_REVIEW`, `STOP`, `PROGRAMMER_ERROR`) mapped safely through action responses, persistence, and C2?

### D. Reconciliation observability

1. Does C2 currently see every state that would block real provider wiring?
2. Is `STALE_PROVIDER_CONFIRM_ATTEMPT` too noisy, too quiet, or missing necessary fields?
3. Does C2 need run history, acknowledgements, admin workflow, or retention policy before live money?
4. Are manual-review/stop/operator states visible enough without leaking provider secrets?

### E. Tests and false confidence

1. Which tests are high-confidence behavior tests, and which tests are source-string guards or scaffolding checks?
2. Are any tests overfitted to the fake provider path and likely to miss real Toss/PayPal failure modes?
3. Are there missing negative tests around stale providerRef/providerConfirmIdempotencyKey, ambiguous pending attempts, expired sessions, duplicate webhook raw mismatches, or void/outbox terminal states?
4. Does the `28 files / 407 tests` baseline hide important untested UI or runtime paths?

### F. Deferred item risk

1. Which deferred items are true blockers for real money, and which are acceptable post-live backlog?
2. Is `VOID-HOOK-DEBT` precisely defined enough to unblock a future implementation prompt, or does it need a design lock first?
3. Is provider lookup/manual-review operational handling sufficiently specified?
4. Does stale `docs/go-live-checklist.md` create process risk and need rewrite/archive before further launch planning?

### G. Whole-project gaps

1. Are checkout/order/admin stubs acceptable while payment core continues, or should a parallel read-model/UI recon happen first?
2. Is cart market-pricing behavior safe enough for current scope?
3. Does fitting mock storage/AI status create privacy or UX assumptions that need explicit docs before real VTO?
4. Are project docs and startup handoffs enough for a new session to avoid resurrecting stale live-readiness assumptions?

---

## 8. Required output format from Claude

Claude should return findings first, grouped by severity:

```text
P0 - must fix before any further real-money/provider wiring
P1 - should fix before the next implementation stage or design lock
P2 - useful improvement / documentation / test hardening
```

Each finding must include:

- Title.
- Severity (`P0`, `P1`, or `P2`).
- Evidence with file/path references.
- Why it matters.
- Whether it is code, design, docs, test, ops, or policy.
- Adopted assumptions.
- Rejected assumptions.
- Suggested Codex recon prompt(s), not code.
- Stop condition if the finding blocks further work.

Claude should also include:

- "No findings" statement for any category reviewed with no issues found.
- Uncertainty boundaries.
- Questions for the human if a product/legal/business decision is required.

Suggested Codex recon prompts must be read-only unless the human explicitly asks for implementation later. Example prompt shape:

```text
Read-only recon: inspect <paths>. Confirm whether <specific invariant> holds. Do not edit files, stage, commit, or push. Report evidence and gaps.
```

---

## 9. Things Claude must not do

- Do not implement.
- Do not provide code patches or diffs.
- Do not tell Codex to wire Toss/PayPal directly.
- Do not propose live credential/env reads.
- Do not assume provider API facts from memory.
- Do not cite unofficial provider docs as authoritative.
- Do not collapse design review into broad "improve architecture" advice.
- Do not recommend schema changes without first asking for a design lock and migration-specific recon.
- Do not ask Codex to modify money-path code without a narrow prompt and explicit test/verification expectations.

---

## 10. Suggested review target checklist

Claude should prioritize:

- `src/app/actions/payment.ts`
- `src/lib/payment/providers/confirm-bridge.ts`
- `src/lib/payment/providers/routing.ts`
- `src/lib/payment/providers/resolve.ts`
- `src/lib/payment/providers/toss/adapter.ts`
- `src/lib/payment/providers/toss/callback.ts`
- `src/lib/payment/providers/toss/confirm.ts`
- `src/lib/payment/providers/toss/errors.ts`
- `src/lib/payment/complete/transaction.ts`
- `src/lib/payment/complete/compensate.ts`
- `src/lib/payment/webhook/handle.ts`
- `src/lib/payment/webhook/verify.ts`
- `src/lib/payment/void/handler.ts`
- `src/lib/payment/outbox/dispatch.ts`
- `src/lib/payment/reconciliation/provider-confirm.ts`
- `src/lib/payment/reconciliation/reconcile.ts`
- `scripts/payment-reconcile.ts`
- `prisma/schema.prisma`

Then review broader project gaps from:

- `docs/handoff/mira_handoff_v36.md`
- `src/app/(shop)/checkout/page.tsx`
- `src/app/(shop)/orders/page.tsx`
- `src/app/admin/orders/page.tsx`
- `src/lib/cart.ts`
- `src/app/page.tsx`
- `docs/go-live-checklist.md`

Again: review only. No code.
