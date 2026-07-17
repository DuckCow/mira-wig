import { afterEach, describe, expect, it, vi } from "vitest";
import { tossBasicAuthorization } from "@/lib/payment/providers/toss/auth";
import {
  createTossRefundLookupPort,
  TOSS_REFUND_LOOKUP_MAX_RESPONSE_BYTES,
  TOSS_REFUND_LOOKUP_TIMEOUT_MS,
} from "../refund-lookup-http";

const ORIGIN = "https://sandbox.example.test";
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

afterEach(() => {
  vi.useRealTimers();
});

describe("refund-specific Toss payment lookup transport", () => {
  it("performs one encoded GET with existing Basic auth and no cancel/body/idempotency", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchFn = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
      calls.push({ url, init });
      return Promise.resolve(new Response("{}", { status: 200, headers: JSON_HEADERS }));
    };
    const lookup = createTossRefundLookupPort({ fetchFn, origin: ORIGIN });
    const authorization = tossBasicAuthorization(" test_secret ");

    expect(await lookup("payment/key ?한글", authorization)).toEqual({ kind: "response", body: "{}" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${ORIGIN}/v1/payments/payment%2Fkey%20%3F%ED%95%9C%EA%B8%80`);
    expect(calls[0].url.includes("/cancel")).toBe(false);
    expect(calls[0].init?.method).toBe("GET");
    expect(calls[0].init?.body).toBeUndefined();
    expect(calls[0].init?.redirect).toBe("error");
    expect(new Headers(calls[0].init?.headers).get("authorization")).toBe(authorization);
    expect(new Headers(calls[0].init?.headers).has("idempotency-key")).toBe(false);
  });

  it.each([
    [200, "response"], [204, "response"],
    [400, "rejected"], [401, "rejected"], [403, "rejected"], [404, "rejected"],
    [429, "unavailable"], [500, "unavailable"], [503, "unavailable"],
  ] as const)("maps status %i to %s without retry", async (status, kind) => {
    let calls = 0;
    const lookup = createTossRefundLookupPort({
      origin: ORIGIN,
      fetchFn: () => {
        calls += 1;
        return Promise.resolve(new Response(status === 204 ? null : "{}", { status, headers: JSON_HEADERS }));
      },
    });
    expect((await lookup("payment_key", "Basic redacted")).kind).toBe(kind);
    expect(calls).toBe(1);
  });

  it.each([
    null,
    "text/plain",
    "application/problem+json",
    "application/jsonx",
    "application/json; charset=utf-16",
    "application/json; boundary=value",
  ])("rejects content type %j", async (contentType) => {
    const headers = new Headers();
    if (contentType) headers.set("content-type", contentType);
    const lookup = createTossRefundLookupPort({
      origin: ORIGIN,
      fetchFn: () => Promise.resolve(new Response("{}", { status: 200, headers })),
    });
    expect((await lookup("payment_key", "Basic redacted")).kind).toBe("rejected");
  });

  it("rejects invalid/declared oversize and streamed oversize bodies", async () => {
    const invalidLength = createTossRefundLookupPort({
      origin: ORIGIN,
      fetchFn: () => Promise.resolve(new Response("{}", {
        headers: { ...JSON_HEADERS, "content-length": "not-a-number" },
      })),
    });
    const declaredOversize = createTossRefundLookupPort({
      origin: ORIGIN,
      fetchFn: () => Promise.resolve(new Response("{}", {
        headers: {
          ...JSON_HEADERS,
          "content-length": String(TOSS_REFUND_LOOKUP_MAX_RESPONSE_BYTES + 1),
        },
      })),
    });
    const streamedOversize = createTossRefundLookupPort({
      origin: ORIGIN,
      fetchFn: () => Promise.resolve(new Response(new Uint8Array(TOSS_REFUND_LOOKUP_MAX_RESPONSE_BYTES + 1), {
        headers: JSON_HEADERS,
      })),
    });
    expect((await invalidLength("key", "auth")).kind).toBe("rejected");
    expect((await declaredOversize("key", "auth")).kind).toBe("rejected");
    expect((await streamedOversize("key", "auth")).kind).toBe("rejected");
  });

  it.each(["redirect", "abort", "reset", "connect"])("maps %s fetch failure to unavailable", async () => {
    let calls = 0;
    const lookup = createTossRefundLookupPort({
      origin: ORIGIN,
      fetchFn: () => {
        calls += 1;
        return Promise.reject(new TypeError("synthetic transport failure"));
      },
    });
    expect((await lookup("payment_key", "Basic redacted")).kind).toBe("unavailable");
    expect(calls).toBe(1);
  });

  it("aborts at exactly 3,000 ms and does not retry", async () => {
    vi.useFakeTimers();
    let calls = 0;
    let observedSignal: AbortSignal | undefined;
    const lookup = createTossRefundLookupPort({
      origin: ORIGIN,
      fetchFn: (_input, init) => {
        calls += 1;
        observedSignal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      },
    });
    const pending = lookup("payment_key", "Basic redacted");
    await vi.advanceTimersByTimeAsync(TOSS_REFUND_LOOKUP_TIMEOUT_MS - 1);
    expect(observedSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ kind: "unavailable" });
    expect(observedSignal?.aborted).toBe(true);
    expect(calls).toBe(1);
  });
});
