# Recovered SANDBOX SDK and form destination

The adjacent `.js.txt` is the unchanged public SDK body (4,287 bytes), SHA-256
`d324cb484f3c4c56f949329f5ddf4ca62e012c72ef530febe3ce77db35a396b7`.
It is test data, never included in the runtime bundle. The production loader still
loads the installed SANDBOX SDK URL.

Evidence class: **OBSERVED_SUCCESSFUL_FLOW** (payment-window handoff).
The finite observed form destination origin is `https://secureapi.test.eximbay.com`.
This is established by the same SDK, a retained literal Pay click, the immediately
following POST response cache, and the subsequent payment-window document. It is
not inferred from host naming and does not claim every historical SALE succeeded.

Local retained sources inspected on 2026-09-02, without provider contact:

- SDK copy: `/Users/duckcow/mira-evidence/eximbay-bf3/20260811T220109Z-c4779de2/original/assets/01-test-v2-javascriptSDK.js`.
- Codex browser cache root: `/Users/duckcow/Library/Caches/Codex/Default/Partitions/codex-browser-app/Cache/Cache_Data/`.
- `8c416d6323c4f053_0`: `https://api-test.eximbay.com/v2/javascriptSDK.js`,
  response Date 2026-08-23 07:07:59 GMT, body offset 184, 4,287 bytes,
  exact SDK SHA above, valid cache CRC32.
- `57ab70808682d625_0`: POST cache key upload ID `1787468879872394`,
  `https://secureapi.test.eximbay.com/Gateway/BasicProcessor.krp`,
  HTTP 200, Date 2026-08-23 07:08:00 GMT, body offset 151, 851 bytes,
  SHA-256 `34136806ef9d6506f25e4db5f6acfe4cc8ebeb1625eb81abc8a357e045909494`,
  valid CRC32. Its next POST form action is the same-origin
  `/Gateway/BasicProcessor/230/NewGlobalStep1.jsp`.
- `747eab63f74c21d9_0`: subsequent payment input document at that URL,
  body offset 167, 147,502 bytes,
  SHA-256 `a8c636172cb3986dbcb8ca64d0c8411ec09c97b7ec437b11a2a976a9bb91316a`,
  valid CRC32.
- `/Users/duckcow/.codex/sessions/2026/08/23/rollout-2026-08-23T15-06-55-01a02d3a-aca0-7cf1-a1e9-03a15d18db98.jsonl`:
  line 1229 identifies the payment button; line 1235 records exactly one literal
  click at 2026-08-23T07:07:59.076Z; line 1237 records its completion.
- `e0eded35b866a054_0`: live synthetic attempt SDK response Date
  2026-09-02 07:44:09 GMT, body offset 226, identical 4,287-byte SDK SHA.

Provider HTML bodies and hidden input values are not retained in the repository.
The browser regression supplies only fake data at the durable run/XHR boundary.
All browser URLs are intercepted; a loopback denying proxy and disabled external
DNS prevent fallback provider traffic. CSP and native popup blocking stay enabled.
Instrumentation observes native calls; it does not replace the recovered SDK's
XHR, form construction, window opening, target assignment, or form submission.

Run on a desktop with Chrome installed:

```sh
DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused MIRA_HEADED_CSP=1 npx vitest run --project parallel src/lib/payment/synthetic-sale/__tests__/browser-csp.test.ts
```

The exact policy assertion also rejects wildcard/scheme/provider-subdomain
widening and changes to unrelated directives. Negative browser cases remove only
the connect or form permission and require native CSP rejection at that boundary.
