import { describe, expect, it, vi } from "vitest";
import {
  EXIMBAY_BF4_MAX_RESPONSE_BYTES,
  EXIMBAY_BF4_MAX_RESPONSE_CHUNKS,
  EXIMBAY_BF4_TOTAL_DEADLINE_MS,
  resolveEximbayBf4Config,
  retrieveEximbayBf4Status,
  verifyEximbayBf4Status,
  type EximbayBf4Fetch,
  type EximbayBf4RetrieveRequest,
} from "../bf4-contact";

const API_KEY = "BF4_SYNTHETIC_API_KEY_DO_NOT_LOG";
const MID = "BF4_SYNTHETIC_MID";
const RAW = "transaction_type=PAYMENT&mid=BF4_SYNTHETIC_MID&order_id=order-1&currency=USD&amount=12.34&rescode=0000&resmsg=Success&fgkey=status-only&transaction_id=tx-1";

describe("Eximbay BF4 provider-free contact protocol", () => {
  it("preserves exact raw verify data and fixed HTTP controls without global fetch", async () => {
    const globalFetch = vi.spyOn(globalThis, "fetch");
    const transport = vi.fn<EximbayBf4Fetch>((input, init) => {
      expect(input).toBe("https://api-test.eximbay.com/v1/payments/verify");
      expect(init).toMatchObject({ method: "POST", redirect: "error" });
      expect(requestHeader(init, "Content-Type")).toBe("application/json");
      expect(requestHeader(init, "Authorization")).toBe(basic(API_KEY));
      expect(JSON.parse(requireBody(init))).toEqual({ data: RAW });
      expect(requireBody(init)).toBe(JSON.stringify({ data: RAW }));
      return Promise.resolve(jsonResponse({ rescode: "0000", resmsg: "verified" }));
    });

    const result = await verifyEximbayBf4Status(config(), RAW, transport);

    expect(result).toEqual({ kind: "admitted", rescode: "0000", resmsg: "verified" });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(globalFetch).not.toHaveBeenCalled();
    globalFetch.mockRestore();
  });

  it("constructs the fixed retrieve request from explicit server facts", async () => {
    const transport = vi.fn<EximbayBf4Fetch>((input, init) => {
      expect(input).toBe("https://api-test.eximbay.com/v1/payments/retrieve");
      expect(JSON.parse(requireBody(init))).toEqual({
        mid: MID,
        key_field: "transaction_id",
        payment: {
          order_id: "order-1",
          currency: "USD",
          amount: "12.34",
          transaction_id: "tx-1",
          lang: "EN",
        },
      });
      return Promise.resolve(retrieveResponse("SALE"));
    });

    const result = await retrieveEximbayBf4Status(config(), {
      providerOrderId: "order-1",
      transactionId: "tx-1",
      currency: "USD",
      amountWire: "12.34",
      language: "EN",
    }, transport);

    expect(result).toMatchObject({
      kind: "admitted",
      payment: {
        mid: MID,
        orderId: "order-1",
        transactionId: "tx-1",
        currency: "USD",
        amount: "12.34",
        status: "SALE",
        transactionDate: "20260817010203",
      },
    });
  });

  const statuses: readonly ("AUTH" | "REGISTERED" | "NONE")[] = ["AUTH", "REGISTERED", "NONE"];
  it.each(statuses)(
    "admits the closed non-SALE inquiry status %s without promoting it",
    async (status) => {
      const result = await retrieveEximbayBf4Status(
        config(),
        retrieveRequest(),
        () => Promise.resolve(retrieveResponse(status)),
      );
      expect(result).toMatchObject({ kind: "admitted", payment: { status } });
    },
  );

  it("keeps well-formed verify non-success outcome unknown", async () => {
    const result = await verifyEximbayBf4Status(
      config(),
      RAW,
      () => Promise.resolve(jsonResponse({ rescode: "9999", resmsg: "not admitted" })),
    );
    expect(result).toEqual({ kind: "outcomeUnknown", code: "PROVIDER_NON_SUCCESS" });
  });

  it.each([
    ["transport throw", () => Promise.reject(new Error("synthetic failure")), "TRANSPORT_FAILURE"],
    ["non-2xx", () => Promise.resolve(jsonResponse({}, 503)), "NON_2XX"],
    ["wrong media", () => Promise.resolve(new Response("{}", { status: 200, headers: { "Content-Type": "text/plain" } })), "INVALID_CONTENT_TYPE"],
    ["missing media", () => Promise.resolve(new Response("{}", { status: 200 })), "INVALID_CONTENT_TYPE"],
    ["oversized body", () => Promise.resolve(jsonTextResponse("x".repeat(EXIMBAY_BF4_MAX_RESPONSE_BYTES + 1))), "BODY_TOO_LARGE"],
    ["too many chunks", () => Promise.resolve(tooManyChunksResponse()), "TOO_MANY_RESPONSE_CHUNKS"],
    ["invalid UTF-8", () => Promise.resolve(new Response(Uint8Array.of(0xff), { status: 200, headers: jsonHeaders() })), "INVALID_UTF8"],
    ["malformed JSON", () => Promise.resolve(jsonTextResponse("{")), "INVALID_JSON"],
    ["invalid root", () => Promise.resolve(jsonTextResponse("[]")), "INVALID_ROOT"],
    ["unknown shape", () => Promise.resolve(jsonResponse({ rescode: "0000", resmsg: "ok", extra: true })), "UNKNOWN_SHAPE"],
    ["duplicate protected key", () => Promise.resolve(jsonTextResponse('{"rescode":"0000","rescode":"0000","resmsg":"ok"}')), "DUPLICATE_JSON_KEY"],
  ])("maps %s to outcome unknown", async (_label, transport, code) => {
    const result = await verifyEximbayBf4Status(config(), RAW, transport);
    expect(result).toEqual({ kind: "outcomeUnknown", code });
  });

  it("rejects duplicate nested retrieve keys and unknown inquiry status", async () => {
    const duplicate = await retrieveEximbayBf4Status(
      config(),
      retrieveRequest(),
      () => Promise.resolve(jsonTextResponse(
        `{"rescode":"0000","resmsg":"ok","mid":"${MID}","payment":{"order_id":"order-1","order_id":"order-1","currency":"USD","amount":"12.34","transaction_id":"tx-1","status":"SALE","transaction_date":"20260817010203"}}`,
      )),
    );
    const unknown = await retrieveEximbayBf4Status(
      config(),
      retrieveRequest(),
      () => Promise.resolve(retrieveResponseWithStatus("CAPTURED")),
    );

    expect(duplicate).toEqual({ kind: "outcomeUnknown", code: "DUPLICATE_JSON_KEY" });
    expect(unknown).toEqual({ kind: "outcomeUnknown", code: "UNKNOWN_SHAPE" });
  });

  it("enforces the 15 second deadline through the injected transport signal", async () => {
    vi.useFakeTimers();
    const transport = vi.fn<EximbayBf4Fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const pending = verifyEximbayBf4Status(config(), RAW, transport);

    await vi.advanceTimersByTimeAsync(EXIMBAY_BF4_TOTAL_DEADLINE_MS + 1);

    await expect(pending).resolves.toEqual({ kind: "outcomeUnknown", code: "TRANSPORT_FAILURE" });
    vi.useRealTimers();
  });
});

function config() {
  return resolveEximbayBf4Config("SANDBOX", {
    EXIMBAY_SANDBOX_API_KEY: API_KEY,
    EXIMBAY_SANDBOX_MID: MID,
  });
}

function retrieveRequest(): EximbayBf4RetrieveRequest {
  return {
    providerOrderId: "order-1",
    transactionId: "tx-1",
    currency: "USD",
    amountWire: "12.34",
    language: "EN",
  };
}

function retrieveResponse(status: "SALE" | "AUTH" | "REGISTERED" | "NONE"): Response {
  return retrieveResponseWithStatus(status);
}

function retrieveResponseWithStatus(status: string): Response {
  return jsonResponse({
    rescode: "0000",
    resmsg: "ok",
    mid: MID,
    payment: {
      order_id: "order-1",
      currency: "USD",
      amount: "12.34",
      transaction_id: "tx-1",
      status,
      transaction_date: "20260817010203",
    },
  });
}

function jsonResponse(value: unknown, status = 200): Response {
  return jsonTextResponse(JSON.stringify(value), status);
}

function jsonTextResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: jsonHeaders() });
}

function jsonHeaders(): HeadersInit {
  return { "Content-Type": "application/json; charset=utf-8" };
}

function tooManyChunksResponse(): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let index = 0; index <= EXIMBAY_BF4_MAX_RESPONSE_CHUNKS; index += 1) {
        controller.enqueue(Uint8Array.of(0x20));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: jsonHeaders() });
}

function requireBody(init: RequestInit | undefined): string {
  if (typeof init?.body !== "string") throw new Error("missing string body");
  return init.body;
}

function requestHeader(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

function basic(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`;
}
