# Eximbay Doc Snapshot — Source Index (v1, captured 2026-07-08 KST)

Retrieval mode: F = fetched live this session (full page), S = captured via search excerpt earlier in this review (official URL, partial content).

## Official Eximbay — developer documentation
1. F https://developer.eximbay.com/eximbay/payment_linkage/preparing-payment.html — SDK/API prep, hosts, test/live keys, Basic auth, TLS.
2. F https://developer.eximbay.com/eximbay/payment_linkage/webhook.html — JSON webhook product (CHARGEBACK/PAYOUT only), HMAC-SHA256 signature header, register/info APIs, IP list.
3. F https://developer.eximbay.com/eximbay/payment_linkage/api-recon.html — reconciliation APIs: transactions (5y / 7-day window), settlements, expected-settlements.
4. F https://developer.eximbay.com/eximbay/payment_linkage/api-cancel-payment.html — cancel/refund API, refund_type F/P, refund_id, refund_transaction_id, balance.
5. F https://developer.eximbay.com/eximbay/payment_linkage/api-retrieve-payment.html — retrieve by order_id / transaction_id; status AUTH/SALE; balance.
6. S https://developer.eximbay.com/eximbay/payment_linkage/preparing-fgkey.html (+ /eng/ variant) — fgkey ready/verify flow; status_url query-string; duplicate-delivery warning.
7. S https://developer.eximbay.com/eximbay/payment_linkage/api-capture-payment.html — manual capture (AUTHORIZE models); auto-capture next day; separate contract.
8. S https://developer.eximbay.com/eximbay/payment_linkage/api-token.html — token payment / deletion / card_identifier.
9. S https://developer.eximbay.com/eximbay/api_list/reference.html (+ /eng/ variant) — full API list; retrieve key_field incl. refund_id in one variant (inconsistency #2); confirm endpoint (3DS).
10. S https://developer.eximbay.com/eng/eximbay/pdf/Eximbay_Global_Payment_Integration_guide_en.pdf — legacy global guide: statusurl retransmit ×3, case-sensitive params, PayPal/Alipay/WeChat/Tenpay third-party payments, 3DS/DM/DCC, capture model.
11. S https://developer.eximbay.com/eximbay/pdf/Eximbay_Local_Payment_Integration_guide_kr.pdf — legacy local guide: SHA-256 fgkey scheme, refund-inquiry-not-supported / balance-based refund state, ref duplication allowed by default.

## Official Eximbay — corporate/support pages
12. S https://support.eximbay.com/hc/en-us/articles/4404120119065 — Korean business entity prerequisite; no overseas merchants.
13. S https://www.eximbay.com/homepage/new/en/dist/service/service-online.do — method catalog: KR cards/VA/wallets/payment links, China-targeting methods, Japan konbini/bank, risk tools.
14. S https://www.eximbay.com/homepage/new/en/dist/service/service-online-apm.do — APM catalog: Alipay+, partner wallets, Apple Pay.

## Non-Eximbay sources (used only for gaps)
15. S https://portone.gitbook.io/docs-en/payment-integration-by-pg/payment-gateways/eximbay — Eximbay method codes (wechat/alipay/unionpay/tenpay/econtext), konbini ready→paid webhook flow, eContext test procedure. (Reputable aggregator integration doc; not Eximbay-official.)
16. S https://about.paypay.ne.jp/en/pr/20250414/02/ and https://about.paypay.ne.jp/en/pr/20250916/01/ — official PayPay: Alipay+ acceptance is in-store QR; Overseas Payment Mode (Korea, late Sept 2025). Used as evidence PayPay online cross-border is NOT established.

## Not captured in this pass (known gaps)
- 웹훅 목록 detail page (api_list/webhook_api.html), 자동 결제 (api-recurring.html), 민감 정보 암호화 (encryption.html), 방화벽 (firewall.html), JavaScript SDK page, fee page (eximbay.com/info-online-fee.do), merchant-screening support articles. Recommend adding these in a v2 snapshot before any adapter spike.
