import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PaymentProvider } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InitiatePaymentActionResult } from "@/app/actions/payment";
import type { EximbayReadyHandoffV1 } from "@/lib/payment/eximbay/sdk-handoff-contract";

const loadSdk = vi.hoisted(() => vi.fn());

vi.mock("@/lib/payment/eximbay/sdk-loader", () => ({ loadEximbaySdkV2: loadSdk }));

import { createCheckoutEximbayBrowserConsumer } from "./eximbay-browser-consumer";

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

describe("dormant checkout-owned Eximbay browser consumer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is inert until an admitted fresh handoff is explicitly invoked", async () => {
    const requestPay = vi.fn<(payload: unknown) => unknown>();
    loadSdk.mockResolvedValue(requestPay);
    const created = createCheckoutEximbayBrowserConsumer(freshExecution());
    if (!created.ok) throw new Error("Expected a fresh synthetic handoff to be admitted");

    expect(loadSdk).not.toHaveBeenCalled();
    expect(requestPay).not.toHaveBeenCalled();

    const first = created.consumer.invokeFromUserAction();
    const second = created.consumer.invokeFromUserAction();

    expect(second).toBe(first);
    await expect(first).resolves.toEqual({ kind: "BROWSER_HANDOFF_ATTEMPTED" });
    expect(loadSdk).toHaveBeenCalledTimes(1);
    expect(loadSdk).toHaveBeenCalledWith("SANDBOX");
    expect(requestPay).toHaveBeenCalledTimes(1);
    expect(requestPay).toHaveBeenCalledWith(HANDOFF.payload);
  });

  it.each([
    ["absent execution", undefined],
    ["durable-only execution", durableOnlyExecution()],
    ["malformed transient handoff", freshExecution(accessorHandoff())],
    ["mismatched payment identity", freshExecution({ ...HANDOFF, paymentId: "other-payment-id" })],
  ])("fails closed for %s without touching the SDK seam", (_label, execution) => {
    expect(createCheckoutEximbayBrowserConsumer(execution)).toEqual({
      ok: false,
      code: "FRESH_EXIMBAY_HANDOFF_REQUIRED",
    });
    expect(loadSdk).not.toHaveBeenCalled();
  });

  it("delegates disposal so a pending load cannot reach request_pay", async () => {
    const deferred = promiseGate<(...input: unknown[]) => unknown>();
    const requestPay = vi.fn<(payload: unknown) => unknown>();
    loadSdk.mockReturnValue(deferred.promise);
    const created = createCheckoutEximbayBrowserConsumer(freshExecution());
    if (!created.ok) throw new Error("Expected a fresh synthetic handoff to be admitted");

    const pending = created.consumer.invokeFromUserAction();
    created.consumer.dispose();
    deferred.resolve(requestPay);

    await expect(pending).resolves.toEqual({
      kind: "BROWSER_HANDOFF_FAILED",
      code: "CONTROLLER_DISPOSED",
    });
    expect(requestPay).not.toHaveBeenCalled();
  });

  it("does not own credentials, provider contact, navigation, or financial state", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/(shop)/checkout/eximbay-browser-consumer.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/(?:process\.env|EXIMBAY_(?:SECRET|API|KEY|MID)|fetch\(|XMLHttpRequest)/u);
    expect(source).not.toMatch(/(?:request_pay|javascriptSDK|document\.|window\.|location\.)/u);
    expect(source).not.toMatch(/(?:complete|capture|refund|webhook|reconciliation|ManufacturingRequest|outbox)/u);
  });
});

function freshExecution(
  transientHandoff: EximbayReadyHandoffV1 = HANDOFF,
): InitiatePaymentActionResult {
  return {
    channel: "FRESH_EXIMBAY_READY",
    durable: {
      kind: "READY",
      success: true,
      paymentId: HANDOFF.paymentId,
      provider: PaymentProvider.EXIMBAY,
    },
    transientHandoff,
  };
}

function durableOnlyExecution(): InitiatePaymentActionResult {
  return {
    channel: "DURABLE_ONLY",
    durable: {
      kind: "FAILED",
      success: false,
      errorCode: "PROVIDER_UNAVAILABLE",
      error: "Synthetic provider unavailable",
      retryable: false,
    },
  };
}

function accessorHandoff(): EximbayReadyHandoffV1 {
  return {
    ...HANDOFF,
    get paymentId() {
      return HANDOFF.paymentId;
    },
  };
}

function promiseGate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
