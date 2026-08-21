import { describe, expect, it, vi } from "vitest";
import { isRecord } from "@/lib/payment/providers/eximbay/validation";
import {
  EXIMBAY_REFUND_CANCEL_REASON,
  createEximbayCancelPlan,
  fingerprintEximbayCancelWire,
  type EximbayCancelWireAuthority,
} from "../cancel-wire";
import {
  EXIMBAY_REFUND_CANCEL_DEADLINE_MS,
  admitCancelResponse,
  executeEximbayCancel,
} from "../cancel-contact";
import { deriveEximbayMerchantRefundId } from "../refund-id";

const R1 = deriveEximbayMerchantRefundId("a".repeat(64), 1);
const R2 = deriveEximbayMerchantRefundId("a".repeat(64), 2);

const full: EximbayCancelWireAuthority = Object.freeze({
  mid: "mid-1",
  merchantAccountBindingId: "merchant-1",
  credentialGenerationBindingId: "credential-1",
  originalTransactionId: "transaction-1",
  providerOrderId: "order-1",
  currency: "USD",
  originalAmount: 1_234,
  refundableBalance: 1_234,
  requestedAmount: 1_234,
  refundType: "F",
  providerOperationKey: R1,
  language: "EN",
});

describe("Eximbay dormant cancel wire", () => {
  it("serializes the exact F body with explicit amount, balance, K1, and fixed safe reason", () => {
    const plan = createEximbayCancelPlan(full);
    expect(plan).toMatchObject({
      endpoint: "https://api-test.eximbay.com/v1/payments/transaction-1/cancel",
      method: "POST",
      contentType: "application/json",
    });
    expect(JSON.parse(plan.body)).toEqual({
      mid: "mid-1",
      refund: {
        refund_type: "F",
        refund_amount: "12.34",
        refund_id: R1,
        reason: EXIMBAY_REFUND_CANCEL_REASON,
      },
      payment: {
        order_id: "order-1",
        currency: "USD",
        amount: "12.34",
        balance: "12.34",
        lang: "EN",
      },
    });
    expect(plan.body).not.toMatch(/refund_account|tax|customer|email/iu);
  });

  it("serializes P with canonical JPY money and binds K1/K2 to distinct fixed vectors", () => {
    const partial: EximbayCancelWireAuthority = {
      ...full,
      currency: "JPY",
      originalAmount: 1_500,
      refundableBalance: 1_000,
      requestedAmount: 500,
      refundType: "P",
      language: "JP",
    };
    expect(JSON.parse(createEximbayCancelPlan(partial).body)).toMatchObject({
      refund: { refund_type: "P", refund_amount: "500", refund_id: R1 },
      payment: { currency: "JPY", amount: "1500", balance: "1000", lang: "JP" },
    });
    const k1 = fingerprintEximbayCancelWire(full);
    const k2 = fingerprintEximbayCancelWire({ ...full, providerOperationKey: R2 });
    expect(k1).toBe("d8dfb338367b43f280537964fbed0c3884a3589d7cc7031433dcc9d0b41a8384");
    expect(k2).toBe("aef7e9bba6098e1c6f112629e8a9d1805f7b6cc8599880fca848e21a00de846c");
    expect(k1).not.toBe(k2);
  });

  it("rejects an invalid merchant refund_id before a transport plan exists", () => {
    expect(() => createEximbayCancelPlan({ ...full, providerOperationKey: "synthetic-k1" }))
      .toThrow("INVALID_EXIMBAY_CANCEL_AUTHORITY");
    expect(() => createEximbayCancelPlan({ ...full, providerOperationKey: R1.toUpperCase() }))
      .toThrow("INVALID_EXIMBAY_CANCEL_AUTHORITY");
  });
});

describe("Eximbay cancel response trust boundary", () => {
  it("admits only exact coherent success and projects provider refund_transaction_id", () => {
    expect(admitCancelResponse(successResponse(), full)).toEqual({
      kind: "succeeded",
      success: {
        providerRefundTransactionId: "provider-refund-1",
        refundAmount: 1_234,
        resultingBalance: 0,
        refundDate: "20260821112233",
      },
    });
  });

  it.each([
    ["refund id", { refund: { refund_id: "wrong" } }],
    ["refund amount", { refund: { refund_amount: "12.33" } }],
    ["transaction", { payment: { transaction_id: "wrong" } }],
    ["currency", { payment: { currency: "JPY" } }],
    ["order", { payment: { order_id: "wrong" } }],
    ["mid", { mid: "wrong" }],
    ["missing provider refund id", { refund: { refund_transaction_id: undefined } }],
  ])("rejects %s mismatch as unknown", (_name, patch) => {
    const response = responseWithPatch(patch);
    expect(admitCancelResponse(response, full)).toMatchObject({ kind: "unknown" });
  });

  it("rejects malformed optional envelopes and non-0000 without inventing semantics", () => {
    expect(admitCancelResponse({ ...successResponse(), foreign: { unknown: "x" } }, full))
      .toEqual({ kind: "unknown", code: "UNKNOWN_SHAPE" });
    expect(admitCancelResponse({ ...successResponse(), rescode: "9999" }, full))
      .toEqual({ kind: "unknown", code: "PROVIDER_NON_SUCCESS" });
  });

  it("admits both exact documented foreign spellings without changing trusted projection", () => {
    const formal = admitCancelResponse({
      ...successResponse(),
      foreign: {
        foreign_currency: "USD",
        foreign_amount: "12.34",
        foreign_rate: "1.00",
      },
    }, full);
    const documentedExample = admitCancelResponse({
      ...successResponse(),
      foreign: {
        foregin_currency: "USD",
        foregin_amount: "12.34",
        foregin_rate: "1.00",
      },
    }, full);
    expect(formal).toEqual(documentedExample);
    expect(formal).toEqual({
      kind: "succeeded",
      success: {
        providerRefundTransactionId: "provider-refund-1",
        refundAmount: 1_234,
        resultingBalance: 0,
        refundDate: "20260821112233",
      },
    });
    expect(JSON.stringify(formal)).not.toMatch(/foreign|foregin/u);
  });

  it.each([
    ["mixed variants", {
      foreign_currency: "USD", foreign_amount: "12.34", foregin_rate: "1.00",
    }],
    ["both complete variants", {
      foreign_currency: "USD", foreign_amount: "12.34", foreign_rate: "1.00",
      foregin_currency: "USD", foregin_amount: "12.34", foregin_rate: "1.00",
    }],
    ["unknown alias", {
      foreignCurrency: "USD", foreign_amount: "12.34", foreign_rate: "1.00",
    }],
    ["incomplete formal variant", { foreign_currency: "USD", foreign_amount: "12.34" }],
    ["malformed value", {
      foreign_currency: "USD", foreign_amount: 12.34, foreign_rate: "1.00",
    }],
  ])("rejects %s in the optional foreign envelope", (_name, foreign) => {
    expect(admitCancelResponse({ ...successResponse(), foreign }, full))
      .toEqual({ kind: "unknown", code: "UNKNOWN_SHAPE" });
  });

  it("passes a real abort signal and maps the 25-second deadline to unknown", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const pending = executeEximbayCancel(createEximbayCancelPlan(full), full, (_url, init) => {
      signal = init?.signal ?? undefined;
      return rejectWhenAborted(signal);
    });
    await vi.advanceTimersByTimeAsync(EXIMBAY_REFUND_CANCEL_DEADLINE_MS + 1);
    await expect(pending).resolves.toEqual({ kind: "unknown", code: "TRANSPORT_FAILURE" });
    expect(signal?.aborted).toBe(true);
    vi.useRealTimers();
  });

  it("rejects duplicate keys and fatal invalid UTF-8", async () => {
    const plan = createEximbayCancelPlan(full);
    const duplicate = await executeEximbayCancel(plan, full, () => Promise.resolve(new Response(
      '{"rescode":"0000","rescode":"0000"}',
      { status: 200, headers: { "content-type": "application/json" } },
    )));
    expect(duplicate).toEqual({ kind: "unknown", code: "DUPLICATE_JSON_KEY" });
    const invalid = await executeEximbayCancel(createEximbayCancelPlan(full), full, () => (
      Promise.resolve(new Response(new Uint8Array([0xc3, 0x28]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
    ));
    expect(invalid).toEqual({ kind: "unknown", code: "INVALID_UTF8" });
  });

  it("rejects a duplicate nested foreign key before envelope admission", async () => {
    const plan = createEximbayCancelPlan(full);
    const raw = JSON.stringify({
      ...successResponse(),
      foreign: {
        foregin_currency: "USD",
        foregin_amount: "12.34",
        foregin_rate: "1.00",
      },
    }).replace(
      '"foregin_currency":"USD"',
      '"foregin_currency":"USD","foregin_currency":"JPY"',
    );
    const duplicate = await executeEximbayCancel(plan, full, () => Promise.resolve(new Response(
      raw,
      { status: 200, headers: { "content-type": "application/json" } },
    )));
    expect(duplicate).toEqual({ kind: "unknown", code: "DUPLICATE_JSON_KEY" });
  });
});

function successResponse() {
  return {
    rescode: "0000",
    resmsg: "Success.",
    mid: "mid-1",
    refund: {
      refund_amount: "12.34",
      refund_id: R1,
      refund_date: "20260821112233",
      refund_transaction_id: "provider-refund-1",
    },
    payment: {
      order_id: "order-1",
      currency: "USD",
      amount: "12.34",
      transaction_id: "transaction-1",
      balance: "0.00",
    },
  };
}

function responseWithPatch(patch: unknown) {
  const base = successResponse();
  if (!isRecord(patch)) return base;
  const refundPatch = isRecord(patch.refund) ? patch.refund : {};
  const paymentPatch = isRecord(patch.payment) ? patch.payment : {};
  const refund = { ...base.refund, ...refundPatch };
  const response = {
    ...base,
    ...patch,
    refund,
    payment: { ...base.payment, ...paymentPatch },
  };
  if (Object.hasOwn(refundPatch, "refund_transaction_id")
    && refundPatch.refund_transaction_id === undefined) {
    const { refund_transaction_id: _omitted, ...withoutProviderId } = refund;
    return { ...response, refund: withoutProviderId };
  }
  return response;
}

function rejectWhenAborted(signal: AbortSignal | undefined): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    if (!signal) return reject(new Error("missing signal"));
    signal.addEventListener("abort", rejectAbort.bind(null, reject), { once: true });
  });
}

function rejectAbort(reject: (reason?: unknown) => void): void {
  reject(new Error("aborted"));
}
