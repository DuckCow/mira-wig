# Eximbay Documentation Snapshot — Mira Payment-Provider Strategy Review

Snapshot date: 2026-07-08 (KST)
Scope: official Eximbay documentation and official Eximbay pages; PortOne integration docs and official PayPay/Alipay+ press material used only where Eximbay docs are silent.
Method: live fetch of developer.eximbay.com guide pages (webhook, reconciliation, cancel, retrieve, preparing-payment) on 2026-07-08, plus officially-sourced captures from the same review (support center, service pages, API reference, legacy PDF guides).

Labels: VERIFIED_OFFICIAL / INFERRED / UNCLEAR_REQUIRES_SALES / CONTRADICTORY_DOCS / NOT_FOUND

---

## 1. Merchant eligibility (Korean companies)

- Eximbay serves Korean business entities ONLY; registration as a Korean business entity is a prerequisite, and payment services are not offered to businesses operating outside Korea. — VERIFIED_OFFICIAL (support.eximbay.com article 4404120119065)
- Mira (Korean entity) is therefore squarely inside Eximbay's target merchant profile. — INFERRED
- Merchant screening ("merchant screening / 심사") exists as a distinct onboarding step (support-center topic). Criteria, timelines, and category eligibility for premium custom wigs: UNCLEAR_REQUIRES_SALES.
- API Key + MID are issued to the registered contact email only after a PG contract is signed. — VERIFIED_OFFICIAL (preparing-payment.html)

## 2. Supported payment methods

### Korea (domestic product)
- All domestic Korean credit cards online; bank virtual accounts with real-time deposit status; domestic digital wallets; payment links (no-integration, admin-generated). — VERIFIED_OFFICIAL (eximbay.com service-online.do, marketing-level)
- Which specific wallets (Kakao/Naver/Toss/Payco), installment options, and cash-receipt (현금영수증) issuance support: NOT_FOUND in developer docs reviewed → UNCLEAR_REQUIRES_SALES.
- A separate "Local Payment Integration Guide" PDF exists for the domestic product. — VERIFIED_OFFICIAL (developer.eximbay.com PDF)

### Global cards
- International cards VISA / MasterCard / AMEX / JCB / UnionPay; 3DS (Payer Authentication) available; DCC (dynamic currency conversion) available with a DCC currency list; CyberSource Decision Manager fraud screening (ACCEPT/REVIEW/REJECT rule codes) available per merchant settings. — VERIFIED_OFFICIAL (Global Payment Integration Guide PDF; API reference)
- Apple Pay listed as a supported method. — VERIFIED_OFFICIAL (service-online-apm.do, marketing-level; technical doc coverage NOT_FOUND → confirm)
- Google Pay: NOT_FOUND in reviewed material.
- PayPal available as an online third-party payment through Eximbay (item_* / shipTo_* parameters forwarded to PayPal). — VERIFIED_OFFICIAL (Global guide PDF)

### Japan
- eContext (Japanese convenience-store / konbini and bank payments) supported; positioned for merchants targeting Japanese customers. — VERIFIED_OFFICIAL (service-online.do; PortOne Eximbay integration doc lists `econtext` method code)
- Konbini flow is asynchronous: payment request creates a "ready"-like state; deposit confirmation at the store triggers a later paid notification (documented in PortOne's Eximbay guide with an eContext test-site flow, ~10-minute delay in test). — VERIFIED via PortOne docs; Eximbay-native doc detail NOT_FOUND → confirm current-flow specifics with Eximbay.
- PayPay: NOT_FOUND as an Eximbay online method. Official PayPay material shows overseas acceptance via Alipay+ is in-store QR (merchant-presented), launched in Korea late Sept 2025; no official evidence of PayPay as an online cross-border e-commerce method → treat as likely unavailable; UNCLEAR_REQUIRES_SALES for roadmap.
- Refund/cancel constraints per Japanese method (esp. konbini refunds, which typically cannot reverse a cash deposit): NOT_FOUND → UNCLEAR_REQUIRES_SALES.

### China
- Alipay, WeChat Pay, Tenpay, UnionPay supported (online third-party payments per Global guide; method codes wechat/alipay/unionpay/tenpay in PortOne's Eximbay guide). — VERIFIED_OFFICIAL
- Alipay+ supported, including partner wallets (AlipayHK, Touch 'n Go, GCash, Dana, Toss Pay etc. listed on Eximbay's APM page). — VERIFIED_OFFICIAL (service-online-apm.do, marketing-level)
- Per-method merchant approval, category restrictions for CN wallets, settlement/currency limits, and whether Alipay+ enablement is online (not only offline QR): UNCLEAR_REQUIRES_SALES.

## 3. API model (current REST v1)

- Base URLs: production https://api.eximbay.com, test https://api-test.eximbay.com. TLS 1.2+ required. — VERIFIED_OFFICIAL
- Auth: HTTP Basic; API key as username with trailing ':' Base64-encoded; no password. — VERIFIED_OFFICIAL
- Payment ready: POST /v1/payments/ready → returns `fgkey` required to open the payment window via JavaScript SDK (EXIMBAY.request_pay). transaction_type ∈ {PAYMENT, PAYER_AUTH/AUTHORIZE variants, REBILL}. — VERIFIED_OFFICIAL
- Verify: POST /v1/payments/verify — merchant must forward the full query-string received on status_url; Eximbay validates the fgkey over it. This is the integrity check for the payment result. — VERIFIED_OFFICIAL
- Confirm (3DS path): POST /v1/payments/confirm after payer authentication, for PAYMENT_PA / AUTHORIZE_PA models. — VERIFIED_OFFICIAL (EN API reference)
- Retrieve/inquiry: POST /v1/payments/retrieve with key_field = transaction_id or order_id; response includes status (values seen: AUTH, SALE), auth_code, transaction_date, balance, payment_method, masked card info. — VERIFIED_OFFICIAL (guide page). refund_id as a key_field: CONTRADICTORY_DOCS (see §10).
- Cancel/refund: POST /v1/payments/{transaction_id}/cancel with refund_type F (full) / P (partial), merchant-generated refund_id, refund_amount, reason; request also carries payment.order_id/currency/amount/balance. Response returns refund_transaction_id, refund_date, and updated balance. Partial refund explicitly documented. — VERIFIED_OFFICIAL
  - Note: the request includes the caller-supplied current `balance`; semantics (validation vs. informational) NOT_FOUND → confirm (matters for concurrent-refund races).
- Manual capture: POST /v1/payments/{transaction_id}/capture for AUTHORIZE / AUTHORIZE_PA models; default models auto-capture next day; manual capture requires a separate contract. — VERIFIED_OFFICIAL
- Tokens / recurring: token issuance from an initial payment (token_id), token payment, token deletion, card-identifier lookup (card_identifier for same-card detection); REBILL/recurring documented. — VERIFIED_OFFICIAL
- Idempotency: no Idempotency-Key header found. Duplicate-payment prevention by order_id/ref is NOT default — legacy guide states ref duplication is allowed and duplicate-blocking by ref must be separately requested from Eximbay. refund_id must be unique per refund request. — VERIFIED_OFFICIAL (legacy guide) / current-REST enforcement UNCLEAR_REQUIRES_SALES.

## 4. Webhook / status_url (two distinct mechanisms — do not conflate)

### A. Payment result notification = status_url (server-to-server callback)
- Payment authorization results are delivered to the merchant's status_url as QUERY-STRING parameters (not JSON), from Eximbay's notification server. — VERIFIED_OFFICIAL
- Integrity model: fgkey included in the payload; merchant must call /v1/payments/verify with the full received query string. There is no detached HTTP-signature header on status_url deliveries in the reviewed docs. — VERIFIED_OFFICIAL
- Duplicate delivery: explicitly documented — status_url output may be duplicated; merchants must prevent double-processing; dedupe key = transaction ID. — VERIFIED_OFFICIAL
- Retry policy: legacy Global guide states unreceived status notifications are retransmitted 3 times and retransmission rules may vary; current REST docs do not state a retry policy. — CONTRADICTORY_DOCS / UNCLEAR_REQUIRES_SALES (see §10)
- Event identity: transaction_id (Eximbay-issued, per transaction) + order_id (merchant-issued). Refunds get refund_transaction_id. — VERIFIED_OFFICIAL
- Merchant must respond with rescode=0000&resmsg=Success on the final page / receiver. — VERIFIED_OFFICIAL

### B. "웹훅" product (JSON webhooks) — LIMITED EVENT SET
- The current webhook product covers ONLY: CHARGEBACK, PAYOUT_SUBMALL_REVIEW_COMPLETE, PAYOUT_REMITTANCE_COMPLETE. It does NOT carry payment-approval events. — VERIFIED_OFFICIAL (webhook.html)
- JSON body {rescode, resmsg, type, data}; signed with HMAC-SHA256 over the raw body, Base64, delivered in header `eximbay-webhook-signature`, verified with the merchant secretkey; `eximbay-webhook-transmission-time` header carries send time. — VERIFIED_OFFICIAL
- CHARGEBACK webhook registration is by email to onlinesupport@eximbay.com and is NOT supported on the test server. — VERIFIED_OFFICIAL
- Payout webhooks registered via POST /v1/api/webhook/register on pgonline(-test).eximbay.com; GET /v1/api/webhook/info to inspect. — VERIFIED_OFFICIAL
- Retry policy for JSON webhooks: NOT_FOUND on the page reviewed.
- Doc-quality note: the webhook page lists the header name `eximbay-webhook-transmission-time` twice (the second entry describes the signature — evidently meant to be `eximbay-webhook-signature`, which the sample code uses); sample code contains typos (IOtException; a variable named sha512_HMAC using HmacSHA256). — VERIFIED_OFFICIAL (as observed on page)

## 5. Reconciliation / reporting APIs

- Transaction reconciliation: POST /v1/reconciliation/transactions — per-MID transaction data; up to 5 years of history; max 7-day window per request. — VERIFIED_OFFICIAL
- Settlement reconciliation: POST /v1/reconciliation/settlements — deposit data by remittance date; queryable from the day after deposit; response includes per-transaction fees, VAT, exchange rate, and header totals (deposit_amount, deposit_currency, settle_currency, remittance_amount…). Example shows USD transactions settled with KRW deposit at a stated FX rate. — VERIFIED_OFFICIAL
- Expected settlements: POST /v1/reconciliation/expected-settlements — T+2 expected settlement amounts by trade date. — VERIFIED_OFFICIAL
- Doc-quality note: reconciliation response examples spell the field `transacton_id` (missing "i") — whether the live API returns the misspelled key must be checked in sandbox. — VERIFIED_OFFICIAL (as printed) / actual wire format UNCLEAR.

## 6. Sandbox / test environment

- Separate hosts: api-test.eximbay.com (SDK + API) vs api.eximbay.com; pgonline-test vs pgonline for payout/webhook admin APIs. — VERIFIED_OFFICIAL
- Credential separation: test keys prefixed `test_`, live keys `live_`; test key ⇒ no real charge. A public shared test MID/API key is published for pre-contract testing (mid 1849705C64 / test_1849705C642C217E0B2D). — VERIFIED_OFFICIAL
- Which payment methods are actually exercisable in test (cards vs Alipay/WeChat/eContext/Apple Pay): NOT_FOUND in reviewed pages → UNCLEAR_REQUIRES_SALES. Known gap: CHARGEBACK webhook not available in test. eContext konbini has a test flow (per PortOne guide, via eContext's own test site) — Eximbay-native confirmation needed.

## 7. Security

- fgkey: SHA-256–based integrity value generated via /v1/payments/ready before opening the payment window, and validated after payment via /v1/payments/verify over the status_url query string; legacy scheme documents merchant-side SHA-256 hashing with an Eximbay-issued secretkey (secretkey + params joined with '?'). — VERIFIED_OFFICIAL
- JSON webhook signature: HMAC-SHA256(raw body, secretkey), Base64, header-delivered (payout/chargeback events only). — VERIFIED_OFFICIAL
- Secret handling: live API key delivered by email to the contract contact; docs instruct keeping it out of client-exposed surfaces; Basic-auth scheme means the API key itself is the credential on every call. — VERIFIED_OFFICIAL
- Sensitive-field encryption guide exists (민감 정보 암호화 page, not fetched in this pass). — VERIFIED_OFFICIAL (existence only)
- Idempotency/duplicate-order prevention: see §3 — no header-based idempotency; ref/order_id duplicate blocking is opt-in via Eximbay; status_url dedupe is the merchant's responsibility. — VERIFIED_OFFICIAL (legacy) / current defaults UNCLEAR_REQUIRES_SALES.
- IP allowlist published for JSON webhooks (three IPs incl. one public 15.165.144.33; two are RFC1918 addresses 172.28.x.x, which cannot be Internet-source IPs — likely a doc error). — VERIFIED_OFFICIAL (as printed; correctness questionable → confirm)

## 8. Japan-specific summary

- eContext/konbini: supported method; asynchronous ready→paid flow with deposit confirmation at the store; virtual-account-like semantics. — VERIFIED (Eximbay marketing + PortOne integration doc); Eximbay-native current-API detail: UNCLEAR_REQUIRES_SALES.
- PayPay online: NOT_FOUND anywhere in Eximbay material; official PayPay/Alipay+ material covers offline QR acceptance only. Treat as unavailable pending sales confirmation.
- JP cards: JCB covered under global cards (incl. via 3DS). — VERIFIED_OFFICIAL.
- Refund constraints for konbini (cash-deposit refunds), partial-refund availability per JP method: NOT_FOUND → UNCLEAR_REQUIRES_SALES.

## 9. China-specific summary

- Alipay, WeChat Pay, UnionPay, Tenpay, Alipay+: supported per official pages/guides (see §2). — VERIFIED_OFFICIAL (catalog level)
- Merchant approval per wallet, prohibited/restricted categories, settlement currency and limits for CN methods, cross-border compliance paperwork: NOT_FOUND in developer docs → UNCLEAR_REQUIRES_SALES.
- Partial-refund support per CN wallet: NOT_FOUND → UNCLEAR_REQUIRES_SALES.

## 10. Known doc inconsistencies (tracked)

1. **Old form-post PDF vs current REST docs.** Two integration generations coexist: legacy form-POST guides (case-sensitive parameters, statusurl, merchant-side SHA-256 fgkey) and the current v1 REST + JS SDK (ready/verify/retrieve/cancel/capture). Which generation a given MID is contracted onto is a contract detail. — CONTRADICTORY_DOCS / UNCLEAR_REQUIRES_SALES.
2. **Refund inquiry.** Legacy KR guide: refund-transaction inquiry is not supported; refund state derived from `balance` of the original authorization (balance=0 ⇒ fully refunded). API reference (one variant): retrieve key_field may be order_id, transaction_id, or refund_id. Current KR guide page (fetched today): only transaction_id and order_id documented. — CONTRADICTORY_DOCS. Resolution needed: is refund_id retrieval live, and does retrieve expose a refund list or only balance?
3. **Webhook retry.** Legacy guide: status_url retransmitted 3 times on failure, rules may vary; current REST docs: no stated retry policy for status_url; JSON-webhook page: no retry policy either. — CONTRADICTORY_DOCS / UNCLEAR_REQUIRES_SALES.
4. **"Webhook" terminology.** The current 웹훅 product does not include payment-approval events; payment results ride status_url. Third-party docs (e.g., PortOne) use "webhook" loosely for the payment notification. Any Mira design doc must name the mechanism precisely. — VERIFIED_OFFICIAL (as a distinction).
5. **Doc quality defects observed (affects trust in examples):** misspelled response field `transacton_id` in reconciliation examples; `oreder_id` in several cancel samples; invalid JSON in a retrieve response example (missing comma); malformed URLs in C#/Kotlin samples ("https/…", "https://api.eximbay//v1"); duplicated header name on the webhook page; private-range IPs in the webhook allowlist. Verify actual wire behavior in sandbox rather than trusting examples. — VERIFIED_OFFICIAL (as printed).

---

## Technical implications for Mira's existing architecture (no code, no repo changes proposed)

1. **Query-verified model ports cleanly — and is mandatory here.** Eximbay's own docs declare status_url duplicable and unsigned-except-fgkey; the authoritative surface is /v1/payments/retrieve. Mira's "webhook is a hint, provider query is truth" contract is not just compatible but required. PaymentEvent provenance would record status_url receipt + verify + retrieve as the verified path.
2. **verifiedMode / credential binding map 1:1.** test_/live_ key prefixes and separate hosts give a clean provider/mode binding signal; mode-divergence detection can key off host+key-prefix consistency, mirroring the Toss design.
3. **Payment-approval events are NOT on the signed JSON webhook channel.** Any wiring plan must treat status_url (query-string) as the payment notification transport and the HMAC-signed 웹훅 product as a separate, payout/chargeback-only channel. Two parsers, two verifiers.
4. **Weak/unknown retry ⇒ reconciliation is load-bearing.** With retry possibly limited to 3 attempts and no documented backoff, the /v1/reconciliation/transactions (7-day window) sweep becomes the safety net for missed notifications — an operational job, not an optional report.
5. **Idempotency is merchant-owned.** No idempotency header; duplicate-order blocking by order_id is opt-in with Eximbay; refund_id uniqueness is merchant-enforced. Mira's persisted-binding replay re-lookup covers inbound dedupe; outbound (cancel) calls need a merchant-side refund_id registry semantics equivalent to what exists for Toss.
6. **Refund-state ambiguity.** Until inconsistency #2 is resolved, refund verification must tolerate balance-derived state (original-transaction retrieve) rather than per-refund lookup — relevant to the cancel/deposit "acked unsupported rejection" policy and to partial-refund reconciliation.
7. **Async methods (konbini, VA) introduce ready→paid lifecycles** analogous to Korean virtual accounts; status models per method need truth tables before enabling those methods.
8. **Sandbox fidelity is limited** (no CHARGEBACK webhook in test; method coverage unknown) — smoke tests can cover card happy-path + cancel + retrieve + reconciliation, but chargeback and some APM paths will be live-only risks.

## Recommendation

**Gap-filler provider, not primary; adapter work deferred until two gates clear.**
- Primary is unwarranted: payment notification transport (query-string status_url, fgkey-only integrity, unclear retry) and merchant-owned idempotency are strictly weaker than the hardened Toss contract; KR-domestic depth (wallets, cash receipts) is unverified; doc-quality defects raise integration-risk.
- Gap-filler is well-supported: verified, differentiated coverage a Korean entity can contract directly — CN wallets (Alipay/WeChat/UnionPay/Alipay+) and JP konbini (eContext) — with a workable retrieve + reconciliation API set that fits Mira's fail-closed, query-verified architecture.
- Defer until: (Gate A) Toss confirms/denies scope and API parity of its own overseas methods (cards multi-currency, PayPal, Alipay status); (Gate B) Eximbay sales answers the question list (see eximbay_sales_questions_v1.md), especially merchant screening for the wig category, CN-wallet approvals, konbini refund semantics, current retry policy, and refund_id retrieval.
- PayPay online should be removed from near-term requirements for any provider choice; no official path exists today.
