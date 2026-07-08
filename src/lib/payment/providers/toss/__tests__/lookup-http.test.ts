import { describe, expect, it, vi, afterEach } from "vitest";
import {
  DEFAULT_TOSS_LOOKUP_TIMEOUT_MS,
  createTossLookupHttpPort,
  type TossLookupFetch,
} from "../lookup-http";

const PAYMENT_KEY = "toss_payment:key+테스트";
const AUTHORIZATION = "Basic sentinel_authorization_header";
const NOW = new Date("2026-07-08T02:00:00.000Z");

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Toss lookup HTTP port", () => {
  it("fetches the URL-encoded payment lookup path with injected authorization", async () => {
    const fetch = recordingFetch(jsonResponse(tossPayment()));
    const port = createTossLookupHttpPort({
      fetchFn: fetch.fetchFn,
      authorization: AUTHORIZATION,
      baseUrl: "https://api.toss.example.test",
      now: () => NOW,
    });

    const result = await port(PAYMENT_KEY);
    const call = onlyFetchCall(fetch.calls);

    expect(result).toEqual({
      kind: "response",
      httpStatus: 200,
      body: tossPayment(),
      receivedAt: NOW,
    });
    expect(fetchInputUrl(call.input)).toBe(`https://api.toss.example.test/v1/payments/${encodeURIComponent(PAYMENT_KEY)}`);
    expect(call.init).toMatchObject({ method: "GET" });
    expect(new Headers(call.init?.headers).get("Authorization")).toBe(AUTHORIZATION);
    expect(new Headers(call.init?.headers).has("Idempotency-Key")).toBe(false);
    expect(JSON.stringify(result)).not.toContain(AUTHORIZATION);
  });

  it("uses the 3000ms default timeout and aborts a hung fetch", async () => {
    vi.useFakeTimers();
    const fetch = hangingFetch();
    const port = createTossLookupHttpPort({ fetchFn: fetch.fetchFn, authorization: AUTHORIZATION });
    let settled = false;

    const pending = port("payment_timeout_default").then((result) => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(DEFAULT_TOSS_LOOKUP_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({ kind: "network_timeout" });
    expect(signalFromInit(onlyFetchCall(fetch.calls).init).aborted).toBe(true);
  });

  it("allows tests to inject a short timeout", async () => {
    vi.useFakeTimers();
    const fetch = hangingFetch();
    const port = createTossLookupHttpPort({
      fetchFn: fetch.fetchFn,
      authorization: AUTHORIZATION,
      timeoutMs: 7,
    });

    const pending = port("payment_timeout_injected");
    await vi.advanceTimersByTimeAsync(7);

    await expect(pending).resolves.toEqual({ kind: "network_timeout" });
    expect(signalFromInit(onlyFetchCall(fetch.calls).init).aborted).toBe(true);
  });

  it("returns non-2xx responses without throwing", async () => {
    const body = { code: "FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING", message: "provider unavailable" };
    const fetch = recordingFetch(jsonResponse(body, { status: 502 }));
    const port = createTossLookupHttpPort({ fetchFn: fetch.fetchFn, authorization: AUTHORIZATION, now: () => NOW });

    await expect(port("payment_non_2xx")).resolves.toEqual({
      kind: "response",
      httpStatus: 502,
      body,
      receivedAt: NOW,
    });
  });

  it("drops malformed response text into a safe null body", async () => {
    const rawBody = "malformed provider body sentinel_should_not_leak";
    const fetch = recordingFetch(new Response(rawBody, { status: 200 }));
    const port = createTossLookupHttpPort({ fetchFn: fetch.fetchFn, authorization: AUTHORIZATION, now: () => NOW });

    const result = await port("payment_malformed");

    expect(result).toEqual({ kind: "response", httpStatus: 200, body: null, receivedAt: NOW });
    expect(JSON.stringify(result)).not.toContain(rawBody);
    expect(JSON.stringify(result)).not.toContain("sentinel_should_not_leak");
  });

  it.each(["", " ", "payment/key", "payment key", "payment\tkey", "payment\nkey", "payment\u0000key"])(
    "rejects invalid paymentKey %j before path interpolation",
    async (paymentKey) => {
      const fetch = recordingFetch(jsonResponse(tossPayment()));
      const port = createTossLookupHttpPort({ fetchFn: fetch.fetchFn, authorization: AUTHORIZATION, now: () => NOW });

      const result = await port(paymentKey);

      expect(result).toEqual({ kind: "response", httpStatus: 400, body: null, receivedAt: NOW });
      expect(fetch.calls).toEqual([]);
    },
  );

  it("normalizes thrown fetch failures without leaking authorization or error details", async () => {
    const sentinel = "sentinel_fetch_error_must_not_leak";
    const fetchFn: TossLookupFetch = () => Promise.reject(new TypeError(`socket closed ${sentinel} ${AUTHORIZATION}`));
    const port = createTossLookupHttpPort({ fetchFn, authorization: AUTHORIZATION });

    const result = await port("payment_fetch_throw");

    expect(result).toEqual({ kind: "network_timeout" });
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(JSON.stringify(result)).not.toContain(AUTHORIZATION);
    expect(JSON.stringify(result)).not.toContain("socket closed");
  });

  it("does not call global fetch", async () => {
    const globalFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}));
    const fetch = recordingFetch(jsonResponse(tossPayment()));
    const port = createTossLookupHttpPort({ fetchFn: fetch.fetchFn, authorization: AUTHORIZATION });

    await port("payment_no_global_fetch");

    expect(fetch.calls).toHaveLength(1);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("keeps authorization sentinel out of results and thrown diagnostics", async () => {
    const sentinelAuthorization = "Basic sentinel_secret_authorization_must_not_leak";
    const rejectedFetch: TossLookupFetch = () => Promise.reject(new Error(sentinelAuthorization));
    const port = createTossLookupHttpPort({ fetchFn: rejectedFetch, authorization: sentinelAuthorization });

    const result = await port("payment_auth_redaction");
    // Redaction requirement explicitly covers String(result), even though objects stringify as [object Object].
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    const rendered = JSON.stringify([result, String(result)]);

    expect(rendered).not.toContain(sentinelAuthorization);
    expect(rendered).not.toContain("Authorization");
    expect(rendered).not.toContain("Basic");
  });
});

interface FetchCall {
  input: Parameters<TossLookupFetch>[0];
  init: Parameters<TossLookupFetch>[1];
}

function recordingFetch(response: Response): { calls: FetchCall[]; fetchFn: TossLookupFetch } {
  const calls: FetchCall[] = [];
  return {
    calls,
    fetchFn: (input, init) => {
      calls.push({ input, init });
      return Promise.resolve(response.clone());
    },
  };
}

function hangingFetch(): { calls: FetchCall[]; fetchFn: TossLookupFetch } {
  const calls: FetchCall[] = [];
  return {
    calls,
    fetchFn: (input, init) => {
      calls.push({ input, init });
      return new Promise<Response>(() => undefined);
    },
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers: init.headers });
}

function tossPayment(): Record<string, unknown> {
  return {
    paymentKey: PAYMENT_KEY,
    orderId: "mira_toss_pay_123",
    status: "DONE",
    totalAmount: 12_000,
    currency: "KRW",
    approvedAt: "2026-07-08T01:59:59.000Z",
  };
}

function onlyFetchCall(calls: readonly FetchCall[]): FetchCall {
  expect(calls).toHaveLength(1);
  const call = calls[0];
  if (!call) throw new Error("Expected one fake fetch call.");
  return call;
}

function fetchInputUrl(input: Parameters<TossLookupFetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function signalFromInit(init: RequestInit | undefined): AbortSignal {
  const signal = init?.signal;
  expect(signal).toBeInstanceOf(AbortSignal);
  if (!(signal instanceof AbortSignal)) throw new Error("Expected AbortSignal.");
  return signal;
}
