# Eximbay Checkout-Recovery Support Reply — 2026-08-25

## A. Source metadata

- Provider: Eximbay
- Source type: direct support reply
- Received date: 2026-08-25
- Scope: checkout-window session expiry, retry, Q004, late success, and invalidation
- Preservation note: the Salesforce signature-image URL was omitted because it is not technically relevant.

## B. Verbatim provider reply

안녕하세요, 엑심베이 입니다.

1/ W998 - Expired payment request 가 발생하는 경우는, 결제창의 step 간에
이동을 할 때 세션의 경과 시간을 카운트해서 10분이 초과되면 발생합니다.
보통 결제창이 열린 이후에 세션값이 부여되면 카운트 한다고 보시면 됩니다.

2/ 세션이 만료될 뿐 새로운 결제창 요청을 해 주시면 세션값이 새로
부여됩니다.
파라미터가 동일하면 fgkey 값도 동일해서 동일한 요청을 보낼 수가 있는데
이때에는 동일한 order_id로 인해 중복에러가 날 수 있습니다.
가능하면 새로운 order_id 값으로 요청을 권고합니다.

3/ 조회 API를 통해서 Q004를 받았으면 그 당시에 거래가 없음을 말하는
것이고, 이후 비동기로 결제사의 결제성공 노티가 오게되면 정상으로 바뀔
수도 있습니다.
결제요청을 무효화하는 API는 별도로 제공되지 않습니다.
결제 과정에서 결제사로 리다이렉트 되면, 저희도 결제 진행상황을 노티
이외에 확인할 수 있는 방법이 없습니다. 그럴 경우, 결제가 발생하지
않는다는 확신을 할 수는 없으니 가맹점에서는 실패한 것으로 판단하시면
실패로 반영해 두시고, 이후 성공 노티가 나갈 경우 취소를 올려주시면
됩니다.

감사합니다.

## C. Provider-stated facts

- **PF-1 — W998 10-minute meaning.** The ten-minute behavior concerns elapsed payment-window session time while moving between steps after the window/session begins. The reply does not establish a ten-minute FGKey lifetime.
- **PF-2 — New payment-window request.** A new payment-window request is assigned a new session.
- **PF-3 — FGKey identity.** Identical parameters may produce the same FGKey. FGKey uniqueness across retry attempts is therefore not provider-stated.
- **PF-4 — `order_id` retry.** Reusing the same `order_id` may produce a duplicate error. Eximbay recommends using a new `order_id`; the reply does not guarantee that every same-`order_id` retry fails.
- **PF-5 — Q004.** Q004 means that no transaction was observed at the time of that retrieve/query. A later asynchronous success notification may still change the observed result to normal/success.
- **PF-6 — Invalidation.** Eximbay does not provide a separate API that invalidates or revokes the outstanding payment request.
- **PF-7 — Redirect uncertainty.** After redirect to a downstream payment company, Eximbay may have no way other than notification to establish the payment's progress or to guarantee that payment will not later occur.
- **PF-8 — Operational guidance.** Eximbay advises the merchant to reflect the attempt as failed in the merchant flow and, if a later success notification arrives, submit a cancellation.

## D. Mira design implications

The following are Mira inferences and design conclusions, not provider quotations.

- Q004 can support releasing a customer-facing checkout handoff blocker, but it must not set financial success/failure finality or erase late-result eligibility.
- The durable observation should be named as a point-in-time fact, such as `EXIMBAY_NO_TRANSACTION_OBSERVED`, rather than a permanent conclusion such as `EXIMBAY_NO_TRANSACTION_CONFIRMED`.
- A customer retry should create a new Mira `Payment`, a new immutable `providerOrderId`/`order_id`, and a new READY/payment-window request. Correctness must not require the returned FGKey bytes to differ.
- The old contacted payment must retain its immutable provider correlation identity and remain eligible for later BF4 verification, retrieval, and financial-success recording.
- `blockingEndedAt` may represent release of Mira's customer handoff slot; it must not represent financial impossibility, provider-request revocation, or the end of late-notification custody.
- A late success after a retry creates a possible duplicate/concurrent financial exposure. Mira should record it durably and require remediation while preventing a second Order.
- Eximbay's cancellation guidance supports a durable cancellation-needed remediation reason. It does not by itself authorize an automatic provider cancellation call.

## E. Not established

- No provider-stated maximum bound on how late a success notification may arrive.
- No statement that every payment method has identical late-success timing.
- No guarantee that retrying the same `order_id` always fails; only that a duplicate error may occur and a new `order_id` is recommended.
- No guarantee that a new request yields a different FGKey.
- No server-side API for invalidating or revoking the outstanding payment request.
- No authorization in this evidence to perform automatic Eximbay cancellation.
- No provider statement that Q004 is financial finality or that a later success is impossible.
