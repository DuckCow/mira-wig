# mira project handoff v37 - Claude/Fable review packet snapshot

**New session role note:** continue the mira project with the human as orchestration/final decisions/commits and Codex as recon/implementation/runtime checks. **v37 is the current whole-project handoff and supersedes v36 for session startup context.** v36 restored the whole-project current handoff after the payment-heavy v35 snapshot. v35 remains the detailed payment-track C2 provider-confirm detector implementation snapshot; do not treat it as missing or obsolete.

**Why v37 exists:** this handoff carries v36 forward and records the new Claude/Fable ultracode review packet. The packet is for external read-only design/code audit and improvement discovery only.

---

## 1. Current baseline

Current whole-project handoff:

- `docs/handoff/mira_handoff_v37.md`
- v37 remains the whole-project handoff.

Prior handoff anchors:

- `docs/handoff/mira_handoff_v36.md` restored the whole-project current handoff.
- `docs/handoff/mira_handoff_v35.md` remains the payment-track detailed C2 provider-confirm detector snapshot.

Claude/Fable review packet:

- Path: `docs/review/claude_ultracode_review_packet_v1.md`
- Commit: `95402c139c048f008d1191f1229ae45f6a7451ae`
- Commit subject: `docs(project): add Claude ultracode review packet`

Verification baseline from v36 / latest handoff chain:

```text
28 files / 407 tests
```

Last known full verify evidence remains the v36 baseline:

```text
npm run verify: passed
typecheck: passed
lint: 0 errors, existing <img> warnings only
vitest: 28 files / 407 tests passed
```

No fresh verify has been rerun after the docs-only review packet commit or this v37 draft. No verify run was required because these changes are docs-only.

This v37 docs delta made no changes to:

- production code;
- tests;
- schema or migrations;
- env/package files;
- generated files;
- provider API code;
- provider resolver wiring;
- webhook/void/outbox/reconciliation behavior.

---

## 2. SSOT map

Project rules:

- `AGENTS.md` is the code-side rules SSOT.
- `docs/collaboration-protocol.md` defines the human/Claude/Codex collaboration loop.

Current state:

- `docs/handoff/mira_handoff_v37.md` is current.
- `docs/handoff/mira_handoff_v36.md` is the prior whole-project restoration snapshot.
- `docs/handoff/mira_handoff_v35.md` is the detailed payment-track C2 provider-confirm detector snapshot.

Payment policy/design:

- `docs/payment_policy/payment_policy_confirmed_v6.md`
- `docs/payment_policy/payment_policy_open_v6.md`
- D1/C2 design locks under `docs/payment_policy/`, especially:
  - `d1b_adapter_boundary_design_v1.md`
  - `d1b_provider_ref_persistence_decision_v1.md`
  - `d1b_confirm_idempotency_decision_v1.md`
  - `d1b_provider_confirm_capture_mapping_v1.md`
  - `d1b_toss_callback_orderid_decision_v1.md`
  - `d1b_toss_confirm_adapter_design_v1.md`
  - `d1b_provider_confirm_result_bridge_design_v1.md`
  - `c2_provider_confirm_detector_design_v1.md`

Claude/Fable review packet:

- `docs/review/claude_ultracode_review_packet_v1.md`
- This packet is an audit prompt, not an implementation prompt.
- Findings from Claude/Fable must be discussed with the human/ChatGPT before Codex receives any implementation prompts.

Code/data facts:

- Code facts win over handoff prose when they conflict.
- Data model source is `prisma/schema.prisma` plus `prisma/migrations/`.
- Do not inspect or print real `.env` secrets.

---

## 3. Payment status carried from v36/v35

Current payment state:

- New payment core rebuild is active under `src/lib/payment/**`.
- D1-A provider selection contract is complete.
- D1-B provider adapter contract types are complete.
- ProviderRef persistence is complete.
- Confirm idempotency persistence is complete.
- Toss callback/orderId fake-flow scaffold is complete.
- Toss confirm mapper/contract is complete.
- Toss confirm fake HTTP adapter seam is complete.
- Provider confirm bridge/action taxonomy is complete.
- C2 provider-confirm detector extension is complete.
- `resolveProvider` still returns mock providers.
- Real Toss adapter wiring remains blocked.
- Real PayPal adapter wiring remains blocked.
- Toss success route persists providerRef only and does not complete local orders/payments.
- C2 reconciliation remains report-only.
- No live provider credentials or env reads should be added without a new explicit prompt and design lock.

Important invariants:

- Toss orderId remains `mira_toss_{payment.id}`.
- `Payment.providerRef` is provider-side pre-capture reference.
- `Payment.providerConfirmIdempotencyKey` is the outbound confirm idempotency key.
- `Payment.providerPaymentKey` is final post-capture provider identity.
- Retryable provider confirm failure does not enqueue void and preserves the confirm key.
- Terminal provider confirm failure marks only the current Payment attempt failed.
- Manual review and stop markers are visible to C2 without local completion or void.
- No `PROVIDER_CONFIRM_PROGRAMMER_ERROR` C2 finding exists yet because that marker is not durable today.

---

## 4. Non-payment project status carried from v36

Use v36 for detailed whole-project anchors. Current high-level status:

- Auth/session/admin guard are present and used.
- Market/i18n supports KR/US/JP market resolution and formatting.
- Catalog/product browsing is active with market-aware style list/detail pages.
- Admin catalog/market price management is active.
- Catalog storage switches mock/S3 by `STORAGE_PROVIDER`; fitting storage is mock-only.
- AI fitting is scaffolded and tested with mock provider/storage.
- Authenticated cart add/update/remove flow exists.
- Backend checkout session lifecycle exists, but visible checkout page is a cutover stub.
- Order/manufacturing schema and completion logic exist, but customer/admin order pages are stubs.
- Reconciliation/operations are report-only.
- Public home page and README remain default/stale and need future refresh.
- `docs/go-live-checklist.md` is stale relative to the current post-cutover payment rebuild.

If a future reviewer is uncertain about a non-payment area, mark it unknown rather than inventing a status.

---

## 5. v37 delta: Claude/Fable review packet

The Claude/Fable ultracode review packet was created to support an external read-only design/code audit.

Claude/Fable role:

- reviewer only;
- not implementer;
- no code changes;
- no schema changes;
- no env/package changes;
- no provider API calls;
- no production provider wiring.

The packet asks Claude/Fable to:

- verify design-code consistency;
- audit money-path safety;
- review real provider readiness;
- review reconciliation observability;
- identify test false-confidence risks;
- identify deferred-item risk;
- review whole-project gaps.

The packet requires Claude/Fable output to include:

- P0/P1/P2 findings;
- file/path evidence;
- adopted assumptions;
- rejected assumptions;
- suggested Codex recon prompts, not direct code patches;
- stop conditions;
- uncertainty boundaries.

Guardrails recorded in the packet:

- Claude/Fable must not implement code.
- Claude/Fable must not propose direct diffs.
- Claude/Fable must not call providers.
- Claude/Fable must not suggest live wiring without gates.
- Claude/Fable must not use unverified provider docs as fact.
- Claude/Fable must not collapse already deferred items into accidental omissions.

---

## 6. Known blockers / deferred items

Payment blockers:

- Real Toss adapter.
- Real PayPal adapter.
- Sandbox/live guard.
- Real webhook verifier/parser.
- Real void taxonomy.
- `VOID-HOOK-DEBT`.
- Provider lookup/manual-review runbook.
- C2 run history, acknowledgement, admin workflow, and retention policy if still deferred.
- Live enablement.

Policy/open blockers:

- Delayed-completion path decisions, including provider pending/risk-hold paths.
- PII vault versus immutable ledger/snapshot policy.
- Refund/cancel state machine beyond completion-failure void.
- Tax/customs/MoR decisions.
- PG contract/provider facts requiring official-doc or contract verification.
- Disputes/chargebacks.
- Jurisdiction-specific custom-order withdrawal/restockability.
- Event ledger retention, raw payload masking, and rejection spam controls.

Whole-project gaps:

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

## 7. Recommended next step

Send `docs/review/claude_ultracode_review_packet_v1.md` to Claude/Fable ultracode mode for read-only review.

After Claude/Fable returns findings:

- discuss findings with the human/ChatGPT first;
- split accepted work into narrow recon/design/implementation prompts;
- do not let Claude/Fable output become a direct Codex implementation patch;
- keep real provider wiring gated behind explicit design locks and official provider-doc verification.

---

## 8. Verification / status of this handoff

This v37 handoff is docs-only.

It does not change:

- production code;
- tests;
- schema or migrations;
- env/package files;
- generated files;
- provider API code;
- provider resolver wiring;
- webhook/void/outbox/reconciliation behavior.

No verify run is required for this handoff unless a reviewer explicitly asks for one. The latest known verify baseline remains:

```text
28 files / 407 tests
```
