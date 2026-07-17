import { describe, expect, it, vi } from "vitest";
import {
  createTossRefundCancellationPort,
  TOSS_REFUND_CANCELLATION_MAX_RESPONSE_BYTES,
} from "../refund-cancellation-http";
import { deriveTossRefundCancellationWireRequest } from "../refund-wire-request";

const ORIGIN = "https://toss.invalid";
const AUTHORIZATION = "Basic synthetic";
const WIRE = deriveTossRefundCancellationWireRequest({
  paymentKey: "payment-key",
  providerOperationKey: `toss-refund-v1-${"a".repeat(64)}`,
  cancelAmount: 85_000,
});

describe("Toss refund cancellation transport", () => {
  it("sends the exact one-shot request and returns only a bounded body", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse('{"ok":true}'));
    const result = await port(fetchFn)({ authorization: AUTHORIZATION, wire: WIRE });
    expect(result).toEqual({ kind: "success", body: '{"ok":true}' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBeInstanceOf(URL);
    if (!(url instanceof URL)) throw new Error("Expected cancellation URL.");
    expect(url.toString()).toBe(`${ORIGIN}/v1/payments/payment-key/cancel`);
    expect(init).toMatchObject({
      method: "POST", redirect: "error",
      headers: {
        Authorization: AUTHORIZATION,
        "Idempotency-Key": WIRE.idempotencyKey,
        "Content-Type": "application/json",
      },
      body: '{"cancelReason":"Mira merchant refund","cancelAmount":85000}',
    });
  });

  it.each([400, 401, 403, 404, 409, 429, 499])("maps HTTP %s to rejected", async (status) => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status }));
    expect(await port(fetchFn)({ authorization: AUTHORIZATION, wire: WIRE }))
      .toEqual({ kind: "rejected" });
  });

  it.each([500, 503, 301])("maps HTTP %s to unknown", async (status) => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status }));
    expect(await port(fetchFn)({ authorization: AUTHORIZATION, wire: WIRE }))
      .toEqual({ kind: "unknown" });
  });

  it("rejects wrong content type, invalid UTF-8, declared oversize, and streamed oversize", async () => {
    const cases = [
      new Response("{}", { headers: { "content-type": "text/plain" } }),
      new Response(new Uint8Array([0xff]), { headers: { "content-type": "application/json" } }),
      new Response("{}", { headers: {
        "content-type": "application/json",
        "content-length": String(TOSS_REFUND_CANCELLATION_MAX_RESPONSE_BYTES + 1),
      } }),
      new Response(new Uint8Array(TOSS_REFUND_CANCELLATION_MAX_RESPONSE_BYTES + 1), {
        headers: { "content-type": "application/json" },
      }),
    ];
    for (const response of cases) {
      const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response);
      expect(await port(fetchFn)({ authorization: AUTHORIZATION, wire: WIRE }))
        .toEqual({ kind: "unknown" });
    }
  });

  it("maps a thrown network failure to unknown without retry", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new Error("synthetic reset"));
    expect(await port(fetchFn)({ authorization: AUTHORIZATION, wire: WIRE }))
      .toEqual({ kind: "unknown" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

function port(fetchFn: typeof fetch) {
  return createTossRefundCancellationPort({ fetchFn, origin: ORIGIN });
}

function jsonResponse(body: string): Response {
  return new Response(body, { headers: { "content-type": "application/json; charset=utf-8" } });
}
