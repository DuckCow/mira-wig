# Eximbay — Sales/Support Question List (v1, from doc gaps, 2026-07-08)

Each question maps to a gap labeled UNCLEAR_REQUIRES_SALES / CONTRADICTORY_DOCS / NOT_FOUND in eximbay_doc_snapshot_report_v1.md.

## Onboarding / eligibility
1. Merchant screening: expected review time and category eligibility for premium custom wigs (beauty/hair goods), for BOTH domestic KR methods and each cross-border method (CN wallets, eContext, PayPal, Apple Pay).
2. Is a single contract/MID structure sufficient for KR domestic + global cards + JP + CN methods, or are separate MIDs/contracts required per method group? What is enabled by default vs opt-in?

## API generation & contract surface
3. New contracts: are merchants onboarded exclusively onto the v1 REST + JS SDK integration, or is the legacy form-POST integration still assigned in any case?
4. Is duplicate-payment blocking by order_id available, and is it default or opt-in? What exactly does it block (same order_id retry after success? in-flight?)
5. Does the cancel API's `payment.balance` request field validate against server-side balance (rejecting stale values), or is it informational? Behavior under two concurrent partial refunds?

## Payment result notification (status_url)
6. Current retry policy for status_url delivery failure: attempt count, intervals/backoff, total window, and what counts as failure (non-200? timeout?). The legacy guide says 3 retransmissions — is that current?
7. Is there any signed/JSON alternative for payment-approval notifications, or is query-string status_url + verify the only mechanism?
8. Exact dedupe guidance: can the same transaction_id arrive on status_url with different statuses over time (e.g., konbini ready→paid), and how are refund events notified (if at all) server-to-server?

## Refunds
9. Is retrieve by refund_id live (API reference lists it; guide pages don't)? Is there a per-refund lookup or refund list API, or is balance on the original transaction the only refund state signal?
10. Per-method refund matrix: full/partial refund availability and time limits for (a) international cards, (b) Alipay, (c) WeChat Pay, (d) UnionPay, (e) Alipay+ partner wallets, (f) eContext konbini, (g) PayPal via Eximbay, (h) KR domestic cards/VA/wallets. For konbini specifically: refund mechanism for cash deposits.

## Japan
11. Confirm the current eContext/konbini flow on the v1 REST integration: notification sequence, statuses, expiry handling, and test-environment procedure.
12. PayPay: any current or roadmap path to ONLINE PayPay acceptance for a Korean merchant (directly or via Alipay+)? (Our finding: offline QR only today.)

## China
13. Per-wallet approval requirements and lead time for Alipay / WeChat Pay / UnionPay / Alipay+ (online), including any category or per-transaction/monthly limits for cross-border CN payments.
14. Settlement for CN-wallet transactions: settlement currency options, FX conversion point and rate source, and any CN-specific settlement delays or reserves.

## Settlement / fees / risk
15. Full fee schedule per method (MDR, fixed fees, refund fees, chargeback fees), FX spread policy, and settlement cycles per method; settlement currency options (KRW only? USD?).
16. Rolling reserve / holdback policy and risk-review triggers for a new cross-border merchant in the beauty/hair category.
17. Chargeback handling: is the CHARGEBACK JSON webhook the only programmatic channel? (Docs: email-registered, not available in test.) What does the chargeback ops workflow look like (evidence submission, deadlines, dashboard)?

## Sandbox
18. Which methods are exercisable end-to-end in api-test (cards, 3DS, Alipay, WeChat Pay, Apple Pay, eContext, PayPal)? Any behavioral differences vs production (timing, statuses, amounts)?
19. Webhook page lists source IPs including two private-range addresses (172.28.x.x) — please provide the correct public notification-source IPs for both status_url and JSON webhooks, for firewall allowlisting.
20. Reconciliation examples show the response field spelled `transacton_id` — is that the actual wire field name? Please provide a current reconciliation field spec.
