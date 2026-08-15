import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EximbayReadyHandoffV1 } from "../sdk-handoff-contract";

const loadSdk = vi.hoisted(() => vi.fn());

vi.mock("../sdk-loader", () => ({ loadEximbaySdkV2: loadSdk }));

import { createEximbayRequestPayController } from "../sdk-invocation";

const HANDOFF: EximbayReadyHandoffV1 = {
  kind: "EXIMBAY_READY_HANDOFF_V1",
  paymentId: "synthetic-payment-id",
  mode: "SANDBOX",
  sdkGeneration: "v2",
  payload: {
    fgkey: "synthetic-ready-fgkey",
    payment: {
      transaction_type: "PAYMENT",
      order_id: "c000000000000000000000000",
      currency: "USD",
      amount: "1.00",
      lang: "EN",
      payment_method: "P000",
    },
    merchant: { mid: "synthetic-mid" },
    buyer: { name: "Synthetic Buyer", email: "buyer@example.test" },
    url: {
      return_url: "https://payments.example.test/return",
      status_url: "https://payments.example.test/status",
    },
  },
};

describe("EX2B2-S3 browser handoff admission and invocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("admits exact ordinary and null-prototype packages", () => {
    expect(createEximbayRequestPayController(HANDOFF).ok).toBe(true);
    expect(createEximbayRequestPayController(nullPrototypeCopy(HANDOFF)).ok).toBe(true);
  });

  it.each([
    ["custom class", customClassPackage()],
    ["inherited required field", inheritedPackage()],
    ["array root", []],
    ["Date payload", { ...HANDOFF, payload: new Date() }],
    ["Map payment", { ...HANDOFF, payload: { ...HANDOFF.payload, payment: new Map() } }],
    ["Set merchant", { ...HANDOFF, payload: { ...HANDOFF.payload, merchant: new Set() } }],
    ["function buyer", { ...HANDOFF, payload: { ...HANDOFF.payload, buyer: () => undefined } }],
    ["symbol extra", withSymbolExtra(HANDOFF)],
    ["missing key", missingKindPackage()],
    ["extra key", { ...HANDOFF, extra: "rejected" }],
    ["wrong kind", { ...HANDOFF, kind: "READY" }],
    ["wrong mode", { ...HANDOFF, mode: "OTHER" }],
    ["wrong generation", { ...HANDOFF, sdkGeneration: "v1" }],
    ["wrong transaction", nestedPayment({ transaction_type: "AUTH" })],
    ["wrong currency", nestedPayment({ currency: "KRW" })],
    ["wrong language", nestedPayment({ lang: "KO" })],
    ["wrong method", nestedPayment({ payment_method: "P101" })],
  ])("rejects %s", (_label, value) => {
    expect(createEximbayRequestPayController(value)).toEqual({
      ok: false,
      code: "INVALID_HANDOFF",
    });
  });

  it("rejects getters and setters without invoking either accessor", () => {
    let getterCalls = 0;
    let setterCalls = 0;
    const input = { ...HANDOFF };
    Object.defineProperty(input, "paymentId", {
      get: () => {
        getterCalls += 1;
        return "getter-value";
      },
      set: () => {
        setterCalls += 1;
      },
      enumerable: true,
    });

    expect(createEximbayRequestPayController(input).ok).toBe(false);
    expect(getterCalls).toBe(0);
    expect(setterCalls).toBe(0);
  });

  it("copies and deeply freezes an isolated ordinary payload snapshot", async () => {
    const mutable = mutableHandoff();
    let received: unknown;
    const requestPay = vi.fn((payload: unknown) => {
      received = payload;
      return "ignored-return";
    });
    loadSdk.mockResolvedValue(requestPay);
    const created = createEximbayRequestPayController(mutable);
    if (!created.ok) throw new Error("Expected admitted handoff");
    mutable.payload.payment.amount = "999.99";
    mutable.payload.buyer.name = "Mutated Buyer";

    await expect(created.controller.invoke()).resolves.toEqual({ kind: "BROWSER_HANDOFF_ATTEMPTED" });

    expect(received).toEqual(HANDOFF.payload);
    expect(Object.getPrototypeOf(received)).toBe(Object.prototype);
    expect(deeplyFrozen(received)).toBe(true);
  });

  it("latches double, concurrent, and later invocation to one exact promise and one request_pay", async () => {
    const requestPay = vi.fn<(payload: unknown) => unknown>(() => "ignored");
    loadSdk.mockResolvedValue(requestPay);
    const created = createEximbayRequestPayController(HANDOFF);
    if (!created.ok) throw new Error("Expected admitted handoff");

    const first = created.controller.invoke();
    const second = created.controller.invoke();
    expect(second).toBe(first);
    await expect(Promise.all([first, second])).resolves.toEqual([
      { kind: "BROWSER_HANDOFF_ATTEMPTED" },
      { kind: "BROWSER_HANDOFF_ATTEMPTED" },
    ]);
    expect(created.controller.invoke()).toBe(first);
    expect(loadSdk).toHaveBeenCalledTimes(1);
    expect(requestPay).toHaveBeenCalledTimes(1);
    expect(requestPay).toHaveBeenCalledWith(HANDOFF.payload);
    expect(Object.keys(requestPay.mock.calls[0]?.[0] ?? {})).not.toContain("callback");
  });

  it("disposal before loader resolution prevents request_pay", async () => {
    const deferred = promiseGate<(...input: unknown[]) => unknown>();
    const requestPay = vi.fn<(payload: unknown) => unknown>();
    loadSdk.mockReturnValue(deferred.promise);
    const created = createEximbayRequestPayController(HANDOFF);
    if (!created.ok) throw new Error("Expected admitted handoff");

    const pending = created.controller.invoke();
    created.controller.dispose();
    deferred.resolve(requestPay);

    await expect(pending).resolves.toEqual({
      kind: "BROWSER_HANDOFF_FAILED",
      code: "CONTROLLER_DISPOSED",
    });
    expect(requestPay).not.toHaveBeenCalled();
  });

  it("maps loader failure without invocation", async () => {
    loadSdk.mockRejectedValue(new Error("synthetic loader failure"));
    const created = createEximbayRequestPayController(HANDOFF);
    if (!created.ok) throw new Error("Expected admitted handoff");

    await expect(created.controller.invoke()).resolves.toEqual({
      kind: "BROWSER_HANDOFF_FAILED",
      code: "SDK_LOAD_FAILED",
    });
  });

  it("consumes a synchronous request_pay throw without retry", async () => {
    const requestPay = vi.fn<(payload: unknown) => unknown>(() => {
      throw new Error("synthetic request_pay failure");
    });
    loadSdk.mockResolvedValue(requestPay);
    const created = createEximbayRequestPayController(HANDOFF);
    if (!created.ok) throw new Error("Expected admitted handoff");

    const first = created.controller.invoke();
    await expect(first).resolves.toEqual({
      kind: "BROWSER_HANDOFF_FAILED",
      code: "REQUEST_PAY_THROWN",
    });
    expect(created.controller.invoke()).toBe(first);
    expect(requestPay).toHaveBeenCalledTimes(1);
  });

  it("keeps financial, status, navigation, storage, and server authority outside the client module", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/payment/eximbay/sdk-invocation.ts"), "utf8");
    expect(source).not.toMatch(/(?:complete|ManufacturingRequest|outbox|webhook|reconciliation|refund)/u);
    expect(source).not.toMatch(/(?:localStorage|sessionStorage|document\.cookie|location\.)/u);
    expect(source).not.toMatch(/(?:FreshEximbayReadyAuthority|PreparedEximbayReadyContact|providerPaymentKey)/u);
  });
});

function nullPrototypeCopy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(nullPrototypeCopy);
  if (value === null || typeof value !== "object") return value;
  const record: Record<string, unknown> = {};
  Object.setPrototypeOf(record, null);
  for (const [key, nested] of Object.entries(value)) record[key] = nullPrototypeCopy(nested);
  return record;
}

function customClassPackage(): unknown {
  class CustomPackage {
    readonly kind = HANDOFF.kind;
    readonly paymentId = HANDOFF.paymentId;
    readonly mode = HANDOFF.mode;
    readonly sdkGeneration = HANDOFF.sdkGeneration;
    readonly payload = HANDOFF.payload;
  }
  return new CustomPackage();
}

function inheritedPackage(): unknown {
  return Object.assign(Object.create({ kind: HANDOFF.kind }), {
    paymentId: HANDOFF.paymentId,
    mode: HANDOFF.mode,
    sdkGeneration: HANDOFF.sdkGeneration,
    payload: HANDOFF.payload,
  });
}

function withSymbolExtra(value: EximbayReadyHandoffV1): unknown {
  const copy = { ...value };
  Object.defineProperty(copy, Symbol("extra"), { value: "rejected", enumerable: true });
  return copy;
}

function missingKindPackage(): unknown {
  return {
    paymentId: HANDOFF.paymentId,
    mode: HANDOFF.mode,
    sdkGeneration: HANDOFF.sdkGeneration,
    payload: HANDOFF.payload,
  };
}

function nestedPayment(changes: Record<string, unknown>): unknown {
  return { ...HANDOFF, payload: { ...HANDOFF.payload, payment: { ...HANDOFF.payload.payment, ...changes } } };
}

function mutableHandoff() {
  return {
    kind: HANDOFF.kind,
    paymentId: HANDOFF.paymentId,
    mode: HANDOFF.mode,
    sdkGeneration: HANDOFF.sdkGeneration,
    payload: {
      fgkey: HANDOFF.payload.fgkey,
      payment: { ...HANDOFF.payload.payment },
      merchant: { ...HANDOFF.payload.merchant },
      buyer: { ...HANDOFF.payload.buyer },
      url: { ...HANDOFF.payload.url },
    },
  };
}

function deeplyFrozen(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every(deeplyFrozen);
}

function promiseGate<T>() {
  const gate: { resolve: ((value: T) => void) | null } = { resolve: null };
  const promise = new Promise<T>((resolve) => {
    gate.resolve = resolve;
  });
  return {
    promise,
    resolve(value: T): void {
      const resolve = gate.resolve;
      if (!resolve) throw new Error("Promise gate was not initialized");
      resolve(value);
    },
  };
}
