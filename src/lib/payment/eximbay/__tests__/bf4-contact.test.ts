import { describe, expect, it, vi } from "vitest";
import {
  EXIMBAY_BF4_DIAGNOSTIC_MAX_ROOT_KEY_BYTES,
  EXIMBAY_BF4_DIAGNOSTIC_MAX_ROOT_KEYS,
  EXIMBAY_BF4_MAX_RESPONSE_BYTES,
  EXIMBAY_BF4_MAX_RESPONSE_CHUNKS,
  EXIMBAY_BF4_TOTAL_DEADLINE_MS,
  resolveEximbayBf4Config,
  retrieveEximbayBf4Status,
  retrieveEximbayCheckoutRecoveryStatus,
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

    expect(result).toEqual({
      kind: "admitted",
      rescode: "0000",
      resmsg: "ok",
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

  it.each([
    ["card_info", () => ({ ...retrieveResponseValue("SALE"), card_info: "invalid" })],
    ["other_param", () => ({ ...retrieveResponseValue("SALE"), other_param: [] })],
    ["auth_code", () => invalidPaymentExtra("auth_code", 1)],
    ["balance", () => invalidPaymentExtra("balance", null)],
    ["payment_method", () => invalidPaymentExtra("payment_method", {})],
  ])("rejects a wrong coarse type for documented extra %s", async (_field, value) => {
    const result = await retrieveEximbayBf4Status(
      config(),
      retrieveRequest(),
      () => Promise.resolve(jsonResponse(value())),
    );

    expect(result).toEqual({ kind: "outcomeUnknown", code: "UNKNOWN_SHAPE" });
  });

  it.each([
    ["root", () => ({ ...retrieveResponseValue("SALE"), unknown_root: true })],
    ["payment", () => invalidPaymentExtra("unknown_payment", true)],
  ])("keeps a truly unknown successful retrieve %s key fail closed", async (_level, value) => {
    const result = await retrieveEximbayBf4Status(
      config(),
      retrieveRequest(),
      () => Promise.resolve(jsonResponse(value())),
    );

    expect(result).toEqual({ kind: "outcomeUnknown", code: "UNKNOWN_SHAPE" });
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

  it("provides real-canary-observed root envelope compatibility for Q004 without consuming nested values", async () => {
    const result = await retrieveEximbayCheckoutRecoveryStatus(
      config(),
      recoveryRequest(),
      () => Promise.resolve(jsonResponse(realCanaryObservedQ004Envelope())),
    );

    expect(result).toEqual({
      kind: "q004",
      rescode: "Q004",
      resmsg: "synthetic Q004 message",
    });
  });

  it("keeps a seventh Q004 root member fail closed with bounded diagnostics", async () => {
    const result = await retrieveEximbayCheckoutRecoveryStatus(
      config(),
      recoveryRequest(),
      () => Promise.resolve(jsonResponse({
        ...realCanaryObservedQ004Envelope(),
        unexpected_root_member: { arbitrary_provider_value: "MUST_NOT_ESCAPE" },
      })),
    );

    expect(result).toMatchObject({
      kind: "outcomeUnknown",
      code: "UNKNOWN_SHAPE",
      diagnostic: {
        failureCode: "UNKNOWN_SHAPE",
        deadlineAborted: false,
        httpStatus: 200,
        responseContentTypeClass: "JSON",
        observedRescode: "Q004",
        rootKeys: [
          "card_info",
          "mid",
          "other_param",
          "payment",
          "rescode",
          "resmsg",
          "unexpected_root_member",
        ],
        rootKeysTruncated: false,
      },
    });
    if (result.kind !== "outcomeUnknown") throw new Error("expected synthetic unknown shape");
    expect(result.diagnostic.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(result.diagnostic.responseByteCount).toBeGreaterThan(0);
    expect(JSON.stringify(result.diagnostic)).not.toContain("MUST_NOT_ESCAPE");
  });

  it.each([
    ["missing rescode", () => {
      const value = realCanaryObservedQ004Envelope();
      delete value.rescode;
      return value;
    }],
    ["missing resmsg", () => {
      const value = realCanaryObservedQ004Envelope();
      delete value.resmsg;
      return value;
    }],
    ["non-string rescode", () => ({ ...realCanaryObservedQ004Envelope(), rescode: 4 })],
    ["non-string resmsg", () => ({ ...realCanaryObservedQ004Envelope(), resmsg: null })],
  ])("rejects a recovery envelope with %s", async (_label, value) => {
    const result = await retrieveEximbayCheckoutRecoveryStatus(
      config(),
      recoveryRequest(),
      () => Promise.resolve(jsonResponse(value())),
    );

    expect(result).toMatchObject({
      kind: "outcomeUnknown",
      code: "UNKNOWN_SHAPE",
      diagnostic: { failureCode: "UNKNOWN_SHAPE" },
    });
  });

  it.each([
    ["rescode", '{"card_info":null,"mid":7,"other_param":["synthetic"],"payment":"synthetic","rescode":"Q004","rescode":"Q004","resmsg":"synthetic Q004 message"}'],
    ["resmsg", '{"card_info":null,"mid":7,"other_param":["synthetic"],"payment":"synthetic","rescode":"Q004","resmsg":"synthetic Q004 message","resmsg":"synthetic Q004 message"}'],
  ])("rejects a duplicate recovery %s key", async (_key, body) => {
    const result = await retrieveEximbayCheckoutRecoveryStatus(
      config(),
      recoveryRequest(),
      () => Promise.resolve(jsonTextResponse(body)),
    );

    expect(result).toMatchObject({
      kind: "outcomeUnknown",
      code: "DUPLICATE_JSON_KEY",
      diagnostic: { failureCode: "DUPLICATE_JSON_KEY" },
    });
  });

  it("does not widen the generic retrieve parser for the Q004 recovery envelope", async () => {
    const result = await retrieveEximbayBf4Status(
      config(),
      retrieveRequest(),
      () => Promise.resolve(jsonResponse(realCanaryObservedQ004Envelope())),
    );

    expect(result).toEqual({ kind: "outcomeUnknown", code: "UNKNOWN_SHAPE" });
  });

  it("bounds and sorts recovery root field names without retaining overlong names", async () => {
    const excess = Object.fromEntries(Array.from(
      { length: EXIMBAY_BF4_DIAGNOSTIC_MAX_ROOT_KEYS + 4 },
      (_, index) => [`field_${String(index).padStart(2, "0")}`, index],
    ));
    const result = await retrieveEximbayCheckoutRecoveryStatus(
      config(),
      recoveryRequest(),
      () => Promise.resolve(jsonResponse({
        rescode: "Q004",
        resmsg: "synthetic",
        ...excess,
        ["x".repeat(EXIMBAY_BF4_DIAGNOSTIC_MAX_ROOT_KEY_BYTES + 1)]: true,
      })),
    );

    if (result.kind !== "outcomeUnknown") throw new Error("expected bounded unknown shape");
    expect(result.diagnostic.rootKeys).toHaveLength(EXIMBAY_BF4_DIAGNOSTIC_MAX_ROOT_KEYS);
    expect(result.diagnostic.rootKeys).toEqual([...result.diagnostic.rootKeys].sort());
    expect(result.diagnostic.rootKeys.every(
      (key) => new TextEncoder().encode(key).byteLength <= EXIMBAY_BF4_DIAGNOSTIC_MAX_ROOT_KEY_BYTES,
    )).toBe(true);
    expect(result.diagnostic.rootKeysTruncated).toBe(true);
  });

  it("distinguishes deadline abort from prompt generic rejection without changing the failure code", async () => {
    vi.useFakeTimers();
    try {
      const pending = retrieveEximbayCheckoutRecoveryStatus(
        config(),
        recoveryRequest(),
        (_input, init) => new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("synthetic abort")), { once: true });
        }),
      );
      await vi.advanceTimersByTimeAsync(EXIMBAY_BF4_TOTAL_DEADLINE_MS + 1);
      const deadline = await pending;
      const prompt = await retrieveEximbayCheckoutRecoveryStatus(
        config(),
        recoveryRequest(),
        () => Promise.reject(new Error("synthetic prompt rejection")),
      );

      expect(deadline).toMatchObject({
        kind: "outcomeUnknown",
        code: "TRANSPORT_FAILURE",
        diagnostic: { failureCode: "TRANSPORT_FAILURE", deadlineAborted: true },
      });
      expect(prompt).toMatchObject({
        kind: "outcomeUnknown",
        code: "TRANSPORT_FAILURE",
        diagnostic: { failureCode: "TRANSPORT_FAILURE", deadlineAborted: false },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["non-2xx", new Response("RAW_NON_2XX_MUST_NOT_ESCAPE", {
      status: 503,
      headers: { "Content-Type": "application/json" },
    }), { failureCode: "NON_2XX", httpStatus: 503, responseContentTypeClass: "JSON" }],
    ["invalid content type", new Response("RAW_WRONG_MEDIA_MUST_NOT_ESCAPE", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    }), { failureCode: "INVALID_CONTENT_TYPE", httpStatus: 200, responseContentTypeClass: "NON_JSON" }],
  ] as const)("retains safe %s response facts without reading raw content", async (_label, response, expected) => {
    const result = await retrieveEximbayCheckoutRecoveryStatus(
      config(),
      recoveryRequest(),
      () => Promise.resolve(response),
    );

    expect(result).toMatchObject({ kind: "outcomeUnknown", diagnostic: expected });
    if (result.kind !== "outcomeUnknown") throw new Error("expected response rejection");
    expect(result.diagnostic.responseByteCount).toBeNull();
    expect(JSON.stringify(result.diagnostic)).not.toContain("MUST_NOT_ESCAPE");
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

function recoveryRequest() {
  return {
    providerOrderId: "order-1",
    currency: "USD",
    amountWire: "12.34",
    language: "EN",
  } as const;
}

function retrieveResponse(status: "SALE" | "AUTH" | "REGISTERED" | "NONE"): Response {
  return retrieveResponseWithStatus(status);
}

function retrieveResponseWithStatus(status: string): Response {
  return jsonResponse(retrieveResponseValue(status));
}

function retrieveResponseValue(status: string) {
  return {
    rescode: "0000",
    resmsg: "ok",
    mid: MID,
    payment: {
      order_id: "order-1",
      currency: "USD",
      amount: "12.34",
      transaction_id: "tx-1",
      status,
      auth_code: "SYNTHETIC_AUTH",
      transaction_date: "20260817010203",
      balance: "12.34",
      payment_method: "P000",
    },
    card_info: { brand: "SYNTHETIC_CARD" },
    other_param: { param1: "SYNTHETIC_PARAM" },
  };
}

function realCanaryObservedQ004Envelope(): Record<string, unknown> {
  // Root member names and Q004 are canary evidence; optional field values are synthetic and ignored.
  return {
    card_info: null,
    mid: 7,
    other_param: ["synthetic"],
    payment: "synthetic",
    rescode: "Q004",
    resmsg: "synthetic Q004 message",
  };
}

function invalidPaymentExtra(key: string, value: unknown) {
  const response = retrieveResponseValue("SALE");
  return {
    ...response,
    payment: { ...response.payment, [key]: value },
  };
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
