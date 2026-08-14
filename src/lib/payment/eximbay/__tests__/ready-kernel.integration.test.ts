import {
  CheckoutSessionStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { syntheticEximbayProviderOrderId } from "@/lib/payment/__tests__/eximbay-fixture";
import {
  createEximbayPreparationFacts,
  createEximbayProviderOrderCandidate,
} from "@/lib/payment/providers/eximbay";
import type { EximbayCanonicalPreparationFacts } from "@/lib/payment/providers/eximbay/preparation";
import type { EximbayProviderOrderCandidate } from "@/lib/payment/providers/eximbay/types";
import {
  EXIMBAY_READY_MAX_REQUEST_BYTES,
  EXIMBAY_READY_MAX_RESPONSE_BYTES,
  EXIMBAY_READY_MAX_RESPONSE_CHUNKS,
  EximbayReadyKernelError,
  createEximbayReadyContactPlanCore,
  executeEximbayReadyContactPlanCore,
  materializeTrustedEximbaySdkWire,
  type EximbayReadyAdmissionResult,
  type EximbayReadyTransportPort,
  type EximbayReadyTransportResponse,
  type TrustedEximbayReadySuccess,
} from "../ready-kernel";
import {
  createTrustedEximbayProviderOrderBinding,
  type TrustedEximbayProviderOrderBinding,
} from "../ready";

const UTF8 = new TextEncoder();
const JSON_CONTENT_TYPE = "application/json";
const SDK_PARITY_CASES: readonly Readonly<[
  string,
  "USD" | "JPY",
  number,
  "P000" | undefined,
]>[] = [
  ["P000/USD", "USD", 100, "P000"],
  ["P000/JPY", "JPY", 1, "P000"],
  ["no-method USD", "USD", 100, undefined],
];

interface TestContext {
  readonly userId: string;
  readonly marketCode: string;
  readonly sessionIds: string[];
}

interface TestAuthority {
  readonly payment: Awaited<ReturnType<typeof createPayment>>;
  readonly candidate: EximbayProviderOrderCandidate;
  readonly facts: EximbayCanonicalPreparationFacts;
  readonly binding: TrustedEximbayProviderOrderBinding;
}

describe("EX2B2-S1 deterministic READY kernel", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    const identity = randomUUID().replaceAll("-", "");
    ctx = {
      userId: `ex2b2_s1_user_${identity}`,
      marketCode: `S1${identity.slice(0, 5)}`,
      sessionIds: [],
    };
    await db.market.create({
      data: {
        code: ctx.marketCode,
        currency: "USD",
        shippableCountries: ["US"],
        defaultLocale: "en",
      },
    });
    await db.user.create({ data: { id: ctx.userId, email: `${ctx.userId}@example.test` } });
  });

  afterEach(async () => {
    await db.payment.deleteMany({ where: { checkoutSessionId: { in: ctx.sessionIds } } });
    await db.checkoutSession.deleteMany({ where: { id: { in: ctx.sessionIds } } });
    await db.user.deleteMany({ where: { id: ctx.userId } });
    await db.market.deleteMany({ where: { code: ctx.marketCode } });
  });

  it("constructs only the two closed credential-free READY contact-plan cores", async () => {
    const authority = await createAuthority(ctx, "USD", 100, "P000");
    const sandbox = createEximbayReadyContactPlanCore("SANDBOX", authority.facts, authority.binding);
    const live = createEximbayReadyContactPlanCore("LIVE", authority.facts, authority.binding);

    expect(sandbox).toMatchObject({
      mode: "SANDBOX",
      endpoint: "https://api-test.eximbay.com/v1/payments/ready",
      method: "POST",
      contentType: JSON_CONTENT_TYPE,
    });
    expect(live.endpoint).toBe("https://api.eximbay.com/v1/payments/ready");
    expect(JSON.parse(sandbox.body)).toMatchObject({
      payment: { order_id: authority.payment.providerOrderId },
    });
    expect(Object.isFrozen(sandbox)).toBe(true);
    expect(Reflect.set(sandbox, "endpoint", "https://attacker.invalid/ready")).toBe(false);
    expect(sandbox).not.toHaveProperty("authorization");
    expect(sandbox).not.toHaveProperty("credentials");
    expect(sandbox).not.toHaveProperty("apiKey");
    expect(sandbox.body).toContain("Synthetic Buyer");
    expect(sandbox.body).toContain("buyer@example.test");
    expect(Object.getOwnPropertyDescriptor(sandbox, "body")?.enumerable).toBe(false);
    expect(JSON.stringify(sandbox)).not.toContain("Synthetic Buyer");
    expect(JSON.stringify(sandbox)).not.toContain("buyer@example.test");
    expect(sandbox.body).toBe(createEximbayReadyContactPlanCore(
      "SANDBOX",
      authority.facts,
      authority.binding,
    ).body);

    expect((): void => {
      Reflect.apply(createEximbayReadyContactPlanCore, undefined, [
        "STAGING",
        authority.facts,
        authority.binding,
      ]);
    }).toThrow(expect.objectContaining({ code: "INVALID_PAYMENT_MODE" }));

    const transport = vi.fn<EximbayReadyTransportPort>();
    await expect(Reflect.apply(executeEximbayReadyContactPlanCore, undefined, [
      {
        mode: "SANDBOX",
        endpoint: "https://attacker.invalid/ready",
        method: "POST",
        contentType: JSON_CONTENT_TYPE,
        body: sandbox.body,
      },
      transport,
    ])).rejects.toMatchObject({ code: "UNTRUSTED_READY_CONTACT_PLAN" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("bounds sensitive outbound READY serialization before plan authority or transport", async () => {
    const authority = await createAuthority(ctx, "USD", 100, "P000");
    const sentinel = "SENTINEL_SENSITIVE_READY_BODY";
    const exactFacts = factsForReadyBodyByteLength(
      authority,
      EXIMBAY_READY_MAX_REQUEST_BYTES,
      sentinel,
    );
    const exactPlan = createEximbayReadyContactPlanCore(
      "SANDBOX",
      exactFacts,
      authority.binding,
    );
    expect(UTF8.encode(exactPlan.body)).toHaveLength(EXIMBAY_READY_MAX_REQUEST_BYTES);

    const oversizedFacts = factsForReadyBodyByteLength(
      authority,
      EXIMBAY_READY_MAX_REQUEST_BYTES + 1,
      sentinel,
    );
    const transport = vi.fn<EximbayReadyTransportPort>();
    let rejection: unknown;
    try {
      createEximbayReadyContactPlanCore("SANDBOX", oversizedFacts, authority.binding);
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toMatchObject({ code: "READY_REQUEST_TOO_LARGE" });
    expect(String(rejection)).not.toContain(sentinel);
    expect(transport).not.toHaveBeenCalled();
  });

  it("calls exactly one injected fake transport, supports chunks, and never calls global fetch", async () => {
    const authority = await createAuthority(ctx, "USD", 100, "P000");
    const plan = createEximbayReadyContactPlanCore("SANDBOX", authority.facts, authority.binding);
    const responseBody = successJson("admitted-fgkey");
    const transport = vi.fn<EximbayReadyTransportPort>(() => Promise.resolve(response(
      responseBody,
      { status: 201, chunkSizes: [1, 2, 3, 5, 8] },
    )));
    const originalFetch = globalThis.fetch;
    const fetchCalls: unknown[] = [];
    globalThis.fetch = (...args) => {
      fetchCalls.push(args);
      return Promise.reject(new Error("GLOBAL_FETCH_MUST_NOT_RUN"));
    };
    try {
      const result = await executeEximbayReadyContactPlanCore(plan, transport);
      expect(result.kind).toBe("admittedSuccess");
      expect(transport).toHaveBeenCalledTimes(1);
      expect(transport).toHaveBeenCalledWith(plan);
      expect(fetchCalls).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it.each([199, 300, 302, 400, 429, 500, 599])(
    "keeps HTTP %i non-admitted and ambiguous",
    async (status) => {
      const execution = await executeWithBody(ctx, successJson("unused"), { status });
      expect(execution.result).toEqual({ kind: "notAdmitted", code: "NON_2XX" });
      expect(execution.transport).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["application/json", true],
    ["application/json; charset=utf-8", true],
    ["Application/JSON ; Charset = UTF-8", true],
    [null, false],
    ["text/json", false],
    ["text/plain", false],
    ["application/json; charset=iso-8859-1", false],
    ["application/json; profile=x", false],
    ["application/json; charset=utf-8; charset=utf-8", false],
    ["application/json charset=utf-8", false],
    ["application/json; charset=\"utf-8\"", false],
  ])("applies the exact bounded Content-Type grammar to %s", async (contentType, admitted) => {
    const execution = await executeWithBody(ctx, successJson("media-fgkey"), { contentType });
    expect(execution.result.kind === "admittedSuccess").toBe(admitted);
    if (!admitted) {
      expect(execution.result).toEqual({ kind: "notAdmitted", code: "INVALID_CONTENT_TYPE" });
    }
  });

  it("enforces 65,536 bytes incrementally for exact, overrun, and chunk-boundary cases", async () => {
    const below = await executeWithBody(ctx, jsonAtByteLength(EXIMBAY_READY_MAX_RESPONSE_BYTES - 1));
    const exact = await executeWithBody(ctx, jsonAtByteLength(EXIMBAY_READY_MAX_RESPONSE_BYTES), {
      chunkSizes: [1, 7, 31, 1_024],
    });
    const over = await executeWithBody(ctx, jsonAtByteLength(EXIMBAY_READY_MAX_RESPONSE_BYTES + 1));
    const manyChunksOver = await executeWithBody(
      ctx,
      jsonAtByteLength(EXIMBAY_READY_MAX_RESPONSE_BYTES + 1),
      { chunkSizes: new Array(66).fill(1_000) },
    );

    expect(below.result.kind).toBe("admittedSuccess");
    expect(exact.result.kind).toBe("admittedSuccess");
    expect(over.result).toEqual({ kind: "notAdmitted", code: "BODY_TOO_LARGE" });
    expect(manyChunksOver.result).toEqual({ kind: "notAdmitted", code: "BODY_TOO_LARGE" });
  });

  it("admits a valid 65,536-byte body delivered in exactly 65,536 one-byte chunks", async () => {
    const authority = await createAuthority(ctx, "USD", 100, "P000");
    const bytes = UTF8.encode(jsonAtByteLength(EXIMBAY_READY_MAX_RESPONSE_BYTES));
    const execution = await executeWithStream(authority, oneByteStream(bytes));

    expect(bytes).toHaveLength(EXIMBAY_READY_MAX_RESPONSE_CHUNKS);
    expect(execution.result.kind).toBe("admittedSuccess");
    expect(execution.transport).toHaveBeenCalledTimes(1);
  }, 20_000);

  it("rejects 65,537 zero-length chunk events without READY or SDK authority", async () => {
    const authority = await createAuthority(ctx, "USD", 100, "P000");
    const execution = await executeWithStream(
      authority,
      emptyChunkStream(EXIMBAY_READY_MAX_RESPONSE_CHUNKS + 1),
    );

    expect(execution.result).toEqual({
      kind: "notAdmitted",
      code: "TOO_MANY_RESPONSE_CHUNKS",
    });
    expect((): void => {
      Reflect.apply(materializeTrustedEximbaySdkWire, undefined, [
        execution.plan,
        execution.result,
      ]);
    }).toThrow(expect.objectContaining({ code: "UNTRUSTED_READY_SUCCESS" }));
  }, 20_000);

  it("rejects invalid UTF-8 without replacement decoding", async () => {
    const execution = await executeWithBytes(ctx, new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x7d]));
    expect(execution.result).toEqual({ kind: "notAdmitted", code: "INVALID_UTF8" });
  });

  it.each([
    ["empty", "", "INVALID_JSON"],
    ["null", "null", "INVALID_ROOT"],
    ["array", "[]", "INVALID_ROOT"],
    ["string", "\"value\"", "INVALID_ROOT"],
    ["number", "1", "INVALID_ROOT"],
    ["boolean", "true", "INVALID_ROOT"],
    ["trailing JSON", `${successJson("fgkey")} {}`, "INVALID_JSON"],
    ["trailing text", `${successJson("fgkey")} x`, "INVALID_JSON"],
    ["truncated", "{\"rescode\":\"0000\"", "INVALID_JSON"],
  ])("rejects invalid JSON root case: %s", async (_name, body, code) => {
    const execution = await executeWithBody(ctx, body);
    expect(execution.result).toEqual({ kind: "notAdmitted", code });
  });

  it.each([
    ["literal rescode", "{\"rescode\":\"0000\",\"rescode\":\"9999\",\"resmsg\":\"x\",\"fgkey\":\"f\"}"],
    ["escaped rescode", "{\"rescode\":\"0000\",\"res\\u0063ode\":\"9999\",\"resmsg\":\"x\",\"fgkey\":\"f\"}"],
    ["escaped resmsg", "{\"rescode\":\"0000\",\"resmsg\":\"x\",\"res\\u006dsg\":\"y\",\"fgkey\":\"f\"}"],
    ["escaped fgkey", "{\"rescode\":\"0000\",\"resmsg\":\"x\",\"fgkey\":\"f\",\"fg\\u006bey\":\"g\"}"],
  ])("rejects decoded duplicate protected root keys: %s", async (_name, body) => {
    const execution = await executeWithBody(ctx, body);
    expect(execution.result).toEqual({ kind: "notAdmitted", code: "DUPLICATE_PROTECTED_KEY" });
  });

  it.each([
    ["key-looking string value", "{\"rescode\":\"0000\",\"resmsg\":\"\\\"rescode\\\":\\\"9999\\\"\",\"fgkey\":\"f\"}"],
    ["nested protected keys", "{\"rescode\":\"0000\",\"resmsg\":\"x\",\"fgkey\":\"f\",\"nested\":{\"rescode\":\"x\",\"rescode\":\"y\"}}"],
    ["duplicate unknown root keys", "{\"unknown\":1,\"unknown\":2,\"rescode\":\"0000\",\"resmsg\":\"x\",\"fgkey\":\"f\"}"],
    ["escaped neighboring value", "{\"neighbor\":\"quote \\\" slash \\\\\",\"rescode\":\"0000\",\"resmsg\":\"x\",\"fgkey\":\"f\"}"],
  ])("does not confuse non-root or non-key text: %s", async (_name, body) => {
    const execution = await executeWithBody(ctx, body);
    expect(execution.result.kind).toBe("admittedSuccess");
  });

  it.each([
    ["malformed escape", "{\"neighbor\":\"\\q\",\"rescode\":\"0000\",\"resmsg\":\"x\",\"fgkey\":\"f\"}"],
    ["truncated string", "{\"neighbor\":\"unterminated,\"rescode\":\"0000\"}"],
  ])("fails closed before a later protected key after %s", async (_name, body) => {
    const execution = await executeWithBody(ctx, body);
    expect(execution.result).toEqual({ kind: "notAdmitted", code: "INVALID_JSON" });
  });

  it.each([
    ["missing rescode", "{\"resmsg\":\"x\",\"fgkey\":\"f\"}", "INVALID_RESCODE"],
    ["numeric rescode", "{\"rescode\":0,\"resmsg\":\"x\",\"fgkey\":\"f\"}", "INVALID_RESCODE"],
    ["missing resmsg", "{\"rescode\":\"0000\",\"fgkey\":\"f\"}", "INVALID_RESMSG"],
    ["numeric resmsg", "{\"rescode\":\"0000\",\"resmsg\":1,\"fgkey\":\"f\"}", "INVALID_RESMSG"],
  ])("rejects missing or wrong required primitive: %s", async (_name, body, code) => {
    const execution = await executeWithBody(ctx, body);
    expect(execution.result).toEqual({ kind: "notAdmitted", code });
  });

  it.each(["0", "000", "00000", " 0000", "0000 ", "ZERO"])(
    "does not normalize provider result code %s into success",
    async (rescode) => {
      const execution = await executeWithBody(ctx, JSON.stringify({
        rescode,
        resmsg: "provider sentinel message",
        fgkey: "must-not-authorize",
        unknown: { admitted: false },
      }));
      expect(execution.result).toEqual({ kind: "notAdmitted", code: "PROVIDER_NON_SUCCESS" });
    },
  );

  it.each([
    ["one byte", "a", true],
    ["4096 UTF-8 bytes", "é".repeat(2_048), true],
    ["4097 UTF-8 bytes", `${"é".repeat(2_048)}a`, false],
    ["empty", "", false],
    ["NUL", "a\u0000b", false],
    ["Unicode control", "a\u0085b", false],
  ])("applies readyFgkey bounds: %s", async (_name, fgkey, admitted) => {
    const execution = await executeWithBody(ctx, successJson(fgkey));
    expect(execution.result.kind === "admittedSuccess").toBe(admitted);
    if (!admitted) expect(execution.result).toEqual({ kind: "notAdmitted", code: "INVALID_FGKEY" });
  });

  it.each([
    ["missing", "{\"rescode\":\"0000\",\"resmsg\":\"x\"}"],
    ["number", "{\"rescode\":\"0000\",\"resmsg\":\"x\",\"fgkey\":1}"],
    ["object", "{\"rescode\":\"0000\",\"resmsg\":\"x\",\"fgkey\":{}}"],
  ])("rejects success with %s fgkey", async (_name, body) => {
    const execution = await executeWithBody(ctx, body);
    expect(execution.result).toEqual({ kind: "notAdmitted", code: "INVALID_FGKEY" });
  });

  it("requires non-forgeable admitted success and rejects hand-built, copied, and proxied shapes", async () => {
    const authority = await createAuthority(ctx, "USD", 100, "P000");
    const execution = await executeWithAuthority(authority, successJson("trusted-fgkey"));
    const success = requireSuccess(execution.result);
    const copied = { ...success };
    const proxy = new Proxy(success, {});
    const spoofs = [
      "trusted-fgkey",
      { readyFgkey: "trusted-fgkey" },
      { fgkey: "trusted-fgkey" },
      copied,
      proxy,
      execution.result,
    ];

    for (const spoof of spoofs) {
      expect((): void => {
        Reflect.apply(materializeTrustedEximbaySdkWire, undefined, [
          execution.plan,
          spoof,
        ]);
      }).toThrow(expect.objectContaining({ code: "UNTRUSTED_READY_SUCCESS" }));
    }
    expect(JSON.stringify(success)).not.toContain("trusted-fgkey");
    expect(Object.isFrozen(success)).toBe(true);
  });

  it("does not let a provider non-success or malformed response authorize SDK wire", async () => {
    const authority = await createAuthority(ctx, "USD", 100, "P000");
    const results = [
      await executeWithAuthority(authority, JSON.stringify({
        rescode: "9999",
        resmsg: "rejected",
        fgkey: "not-authority",
      })),
      await executeWithAuthority(authority, "{malformed"),
      await executeWithAuthority(authority, jsonAtByteLength(EXIMBAY_READY_MAX_RESPONSE_BYTES + 1)),
    ];

    for (const execution of results) {
      expect(execution.result.kind).toBe("notAdmitted");
      expect((): void => {
        Reflect.apply(materializeTrustedEximbaySdkWire, undefined, [
          execution.plan,
          execution.result,
        ]);
      }).toThrow(expect.objectContaining({ code: "UNTRUSTED_READY_SUCCESS" }));
    }
  });

  it.each(SDK_PARITY_CASES)("materializes exact persisted READY/SDK parity for %s", async (
    _name,
    currency,
    amountMinor,
    paymentMethod,
  ) => {
    const authority = await createAuthority(ctx, currency, amountMinor, paymentMethod);
    const plan = createEximbayReadyContactPlanCore("SANDBOX", authority.facts, authority.binding);
    const transport = vi.fn<EximbayReadyTransportPort>(() => Promise.resolve(response(
      successJson("sdk-parity-fgkey"),
    )));
    const result = await executeEximbayReadyContactPlanCore(plan, transport);
    const sdk = materializeTrustedEximbaySdkWire(plan, requireSuccess(result));
    const ready: unknown = JSON.parse(plan.body);

    expect({
      payment: sdk.payment,
      merchant: sdk.merchant,
      buyer: sdk.buyer,
      url: sdk.url,
    }).toEqual(ready);
    expect(sdk.fgkey).toBe("sdk-parity-fgkey");
    expect(sdk.payment.order_id).toBe(authority.payment.providerOrderId);
    expect(typeof sdk.payment.order_id).toBe("string");
    expect(sdk.payment.order_id).not.toBe(authority.payment.id);
    expect(sdk.payment.order_id).not.toBe(authority.payment.idempotencyKey);
    expect(sdk.payment.order_id).not.toBe(authority.payment.providerRef);
    expect(sdk.payment.order_id).not.toBe(authority.payment.providerPaymentKey);
    expect(sdk.payment.order_id).not.toBe(authority.candidate);
    expect(Object.isFrozen(sdk)).toBe(true);
    expect(Object.isFrozen(sdk.payment)).toBe(true);
  });

  it("preserves installed binding authority for spoof and candidate mismatch rejection", async () => {
    const authorityA = await createAuthority(ctx, "USD", 100, "P000");
    const authorityB = await createAuthority(ctx, "USD", 200, "P000");

    expect((): void => {
      Reflect.apply(createEximbayReadyContactPlanCore, undefined, [
        "SANDBOX",
        authorityA.facts,
        { providerOrderId: authorityA.payment.providerOrderId },
      ]);
    }).toThrow("UNTRUSTED_PROVIDER_ORDER_BINDING");
    expect(() => createEximbayReadyContactPlanCore(
      "SANDBOX",
      authorityB.facts,
      authorityA.binding,
    )).toThrow("PROVIDER_ORDER_BINDING_PAYMENT_MISMATCH");
  });

  it("rejects a genuine Payment A success transplanted onto valid Payment B authority", async () => {
    const authorityA = await createAuthority(ctx, "USD", 100, "P000");
    const authorityB = await createAuthority(ctx, "USD", 200, "P000");
    const executionA = await executeWithAuthority(authorityA, successJson("payment-a-fgkey"));
    const planB = createEximbayReadyContactPlanCore(
      "SANDBOX",
      authorityB.facts,
      authorityB.binding,
    );

    expect(() => materializeTrustedEximbaySdkWire(
      planB,
      requireSuccess(executionA.result),
    )).toThrow(expect.objectContaining({ code: "READY_SUCCESS_PLAN_MISMATCH" }));
  });

  it("rejects SANDBOX success as LIVE authority and rejects a copied originating plan", async () => {
    const authority = await createAuthority(ctx, "USD", 100, "P000");
    const sandboxPlan = createEximbayReadyContactPlanCore(
      "SANDBOX",
      authority.facts,
      authority.binding,
    );
    const livePlan = createEximbayReadyContactPlanCore(
      "LIVE",
      authority.facts,
      authority.binding,
    );
    const transport = vi.fn<EximbayReadyTransportPort>(() => Promise.resolve(response(
      successJson("sandbox-only-fgkey"),
    )));
    const result = await executeEximbayReadyContactPlanCore(sandboxPlan, transport);
    const success = requireSuccess(result);

    expect(() => materializeTrustedEximbaySdkWire(livePlan, success)).toThrow(
      expect.objectContaining({ code: "READY_SUCCESS_PLAN_MISMATCH" }),
    );
    expect((): void => {
      Reflect.apply(materializeTrustedEximbaySdkWire, undefined, [{ ...sandboxPlan }, success]);
    }).toThrow(expect.objectContaining({ code: "UNTRUSTED_READY_CONTACT_PLAN" }));
    expect(materializeTrustedEximbaySdkWire(sandboxPlan, success).fgkey).toBe(
      "sandbox-only-fgkey",
    );
  });

  it("keeps transport errors, provider messages, fgkeys, and sentinel secrets out of diagnostics", async () => {
    const authority = await createAuthority(ctx, "USD", 100, "P000");
    const plan = createEximbayReadyContactPlanCore("SANDBOX", authority.facts, authority.binding);
    const sentinelApiKey = "SENTINEL_EXIMBAY_API_KEY";
    const sentinelResmsg = "SENTINEL_PROVIDER_MESSAGE";
    const sentinelFgkey = "SENTINEL_READY_FGKEY";
    const throwingTransport = vi.fn<EximbayReadyTransportPort>(() => Promise.reject(
      new Error(sentinelApiKey),
    ));
    const transportFailure = await executeEximbayReadyContactPlanCore(plan, throwingTransport);
    const providerFailure = await executeWithAuthority(authority, JSON.stringify({
      rescode: "9999",
      resmsg: sentinelResmsg,
      fgkey: sentinelFgkey,
    }));

    const serializedEvidence = JSON.stringify({
      plan: {
        mode: plan.mode,
        endpoint: plan.endpoint,
        method: plan.method,
        contentType: plan.contentType,
      },
      transportFailure,
      providerFailure: providerFailure.result,
    });
    expect(serializedEvidence).not.toContain(sentinelApiKey);
    expect(serializedEvidence).not.toContain(sentinelResmsg);
    expect(serializedEvidence).not.toContain(sentinelFgkey);
    expect(transportFailure).toEqual({ kind: "notAdmitted", code: "TRANSPORT_FAILURE" });
    expect(providerFailure.result).toEqual({ kind: "notAdmitted", code: "PROVIDER_NON_SUCCESS" });
    expect(() => {
      throw new EximbayReadyKernelError("UNTRUSTED_READY_SUCCESS");
    }).toThrow("UNTRUSTED_READY_SUCCESS");
  });
});

async function createAuthority(
  ctx: TestContext,
  currency: "USD" | "JPY",
  amountMinor: number,
  paymentMethod?: "P000",
): Promise<TestAuthority> {
  const payment = await createPayment(ctx);
  const candidate = createEximbayProviderOrderCandidate(payment.id);
  const facts = createTestFacts(candidate, currency, amountMinor, paymentMethod);
  const binding = await createTrustedEximbayProviderOrderBinding(candidate, payment.id);
  return { payment, candidate, facts, binding };
}

function createTestFacts(
  candidate: EximbayProviderOrderCandidate,
  currency: "USD" | "JPY",
  amountMinor: number,
  paymentMethod?: "P000",
  buyerName = "Synthetic Buyer",
): EximbayCanonicalPreparationFacts {
  return createEximbayPreparationFacts({
    transactionType: "PAYMENT",
    providerOrderCandidate: candidate,
    currency,
    amountMinor,
    language: currency === "JPY" ? "JP" : "EN",
    ...(paymentMethod ? { paymentMethod } : {}),
    mid: "synthetic-mid",
    buyerName,
    buyerEmail: "buyer@example.test",
    returnUrl: "https://mira-ex2b2.invalid/return",
    statusUrl: "https://mira-ex2b2.invalid/status",
  });
}

function factsForReadyBodyByteLength(
  authority: TestAuthority,
  targetByteLength: number,
  buyerNamePrefix: string,
): EximbayCanonicalPreparationFacts {
  const baselineFacts = createTestFacts(
    authority.candidate,
    "USD",
    100,
    "P000",
    buyerNamePrefix,
  );
  const baselinePlan = createEximbayReadyContactPlanCore(
    "SANDBOX",
    baselineFacts,
    authority.binding,
  );
  const paddingLength = targetByteLength - UTF8.encode(baselinePlan.body).byteLength;
  if (paddingLength < 0) throw new Error("Requested READY body boundary is too small");
  return createTestFacts(
    authority.candidate,
    "USD",
    100,
    "P000",
    `${buyerNamePrefix}${"x".repeat(paddingLength)}`,
  );
}

async function createPayment(ctx: TestContext) {
  const session = await db.checkoutSession.create({
    data: {
      userId: ctx.userId,
      marketCode: ctx.marketCode,
      currency: "USD",
      status: CheckoutSessionStatus.COMPLETED,
      subtotalAmount: 100,
      shippingAmount: 0,
      totalAmount: 100,
      expiresAt: new Date(Date.now() + 60_000),
      completedAt: new Date(),
    },
    select: { id: true },
  });
  ctx.sessionIds.push(session.id);
  const identity = randomUUID();
  return db.payment.create({
    data: {
      checkoutSessionId: session.id,
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
      amount: 100,
      currency: "USD",
      providerOrderId: syntheticEximbayProviderOrderId(),
      providerRef: `provider_ref_${identity}`,
      providerConfirmIdempotencyKey: `confirm:EXIMBAY:${identity}`,
      providerPaymentKey: `provider_payment_${identity}`,
      idempotencyKey: `payment_idempotency_${identity}`,
      financialSucceededAt: new Date(),
      blockingEndedAt: new Date(),
    },
  });
}

async function executeWithBody(
  ctx: TestContext,
  body: string,
  options: ResponseOptions = {},
) {
  const authority = await createAuthority(ctx, "USD", 100, "P000");
  return executeWithAuthority(authority, body, options);
}

async function executeWithBytes(ctx: TestContext, bytes: Uint8Array) {
  const authority = await createAuthority(ctx, "USD", 100, "P000");
  const plan = createEximbayReadyContactPlanCore("SANDBOX", authority.facts, authority.binding);
  const transport = vi.fn<EximbayReadyTransportPort>(() => Promise.resolve({
    status: 200,
    contentType: JSON_CONTENT_TYPE,
    body: byteStream(bytes),
  }));
  return {
    result: await executeEximbayReadyContactPlanCore(plan, transport),
    transport,
  };
}

async function executeWithAuthority(
  authority: TestAuthority,
  body: string,
  options: ResponseOptions = {},
) {
  const plan = createEximbayReadyContactPlanCore("SANDBOX", authority.facts, authority.binding);
  const transport = vi.fn<EximbayReadyTransportPort>(() => Promise.resolve(response(body, options)));
  return {
    result: await executeEximbayReadyContactPlanCore(plan, transport),
    transport,
    plan,
  };
}

async function executeWithStream(
  authority: TestAuthority,
  body: AsyncIterable<Uint8Array>,
) {
  const plan = createEximbayReadyContactPlanCore("SANDBOX", authority.facts, authority.binding);
  const transport = vi.fn<EximbayReadyTransportPort>(() => Promise.resolve({
    status: 200,
    contentType: JSON_CONTENT_TYPE,
    body,
  }));
  return {
    result: await executeEximbayReadyContactPlanCore(plan, transport),
    transport,
    plan,
  };
}

interface ResponseOptions {
  readonly status?: number;
  readonly contentType?: string | null;
  readonly chunkSizes?: readonly number[];
}

function response(body: string, options: ResponseOptions = {}): EximbayReadyTransportResponse {
  return {
    status: options.status ?? 200,
    contentType: options.contentType === undefined ? JSON_CONTENT_TYPE : options.contentType,
    body: byteStream(UTF8.encode(body), options.chunkSizes),
  };
}

async function* byteStream(
  bytes: Uint8Array,
  chunkSizes: readonly number[] = [bytes.byteLength],
): AsyncIterable<Uint8Array> {
  await Promise.resolve();
  let offset = 0;
  for (const requestedSize of chunkSizes) {
    if (offset >= bytes.byteLength) return;
    const size = Math.max(1, Math.min(requestedSize, bytes.byteLength - offset));
    yield bytes.slice(offset, offset + size);
    offset += size;
  }
  if (offset < bytes.byteLength) yield bytes.slice(offset);
}

async function* oneByteStream(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  await Promise.resolve();
  for (let index = 0; index < bytes.byteLength; index += 1) {
    yield bytes.subarray(index, index + 1);
  }
}

async function* emptyChunkStream(chunkCount: number): AsyncIterable<Uint8Array> {
  await Promise.resolve();
  const empty = new Uint8Array(0);
  for (let index = 0; index < chunkCount; index += 1) yield empty;
}

function successJson(fgkey: unknown): string {
  return JSON.stringify({ rescode: "0000", resmsg: "accepted", fgkey, unknown: { ignored: true } });
}

function jsonAtByteLength(byteLength: number): string {
  const base = successJson("boundary-fgkey");
  const withoutClosingBrace = base.slice(0, -1);
  const prefix = `${withoutClosingBrace},"padding":"`;
  const suffix = '"}';
  const paddingLength = byteLength - UTF8.encode(prefix).byteLength - UTF8.encode(suffix).byteLength;
  if (paddingLength < 0) throw new Error("Requested JSON boundary is too small");
  const body = `${prefix}${"x".repeat(paddingLength)}${suffix}`;
  if (UTF8.encode(body).byteLength !== byteLength) throw new Error("JSON boundary construction failed");
  return body;
}

function requireSuccess(result: EximbayReadyAdmissionResult): TrustedEximbayReadySuccess {
  if (result.kind === "admittedSuccess") return result.success;
  throw new Error(`Expected admitted success, received ${result.code}`);
}
