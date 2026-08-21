import { describe, expect, it, vi } from "vitest";
import { isRecord } from "@/lib/payment/providers/eximbay/validation";
import {
  EXIMBAY_REFUND_LOOKUP_DEADLINE_MS,
  EXIMBAY_REFUND_LOOKUP_MAX_CONTACTS,
  EXIMBAY_REFUND_LOOKUP_OFFSETS_MS,
  admitEximbayRefundLookupResponse,
  createEximbayRefundLookupPlan,
  executeEximbayRefundLookup,
  type EximbayRefundLookupAuthority,
} from "../refund-lookup";
import { deriveEximbayMerchantRefundId } from "../refund-id";

const R1 = deriveEximbayMerchantRefundId("a".repeat(64), 1);

const full: EximbayRefundLookupAuthority = Object.freeze({
  targetDispatchAttemptId: "dispatch-1",
  mid: "mid-1",
  providerOrderId: "order-1",
  originalTransactionId: "transaction-1",
  currency: "USD",
  originalAmount: 1_234,
  preContactRefundableBalance: 1_234,
  expectedRefundAmount: 1_234,
  expectedRefundType: "F",
  providerOperationKey: R1,
  language: "EN",
});

describe("Eximbay refund-id lookup", () => {
  it("serializes the exact persisted refund_id request including required transaction_id", () => {
    const plan = createEximbayRefundLookupPlan(full);
    expect(plan.targetDispatchAttemptId).toBe("dispatch-1");
    expect(JSON.parse(plan.body)).toEqual({
      mid: "mid-1",
      key_field: "refund_id",
      payment: {
        order_id: "order-1",
        currency: "USD",
        amount: "12.34",
        lang: "EN",
        transaction_id: "transaction-1",
        refund_id: R1,
      },
    });
  });

  it("rejects a noncanonical persisted refund_id before lookup transport", () => {
    expect(() => createEximbayRefundLookupPlan({
      ...full,
      providerOperationKey: R1.toUpperCase(),
    })).toThrow("INVALID_EXIMBAY_REFUND_LOOKUP_AUTHORITY");
  });

  it("admits exact REFUND and PARTIAL_REFUND with provider refund identity", () => {
    expect(admitEximbayRefundLookupResponse({
      ...foundResponse(),
      payment: { ...foundResponse().payment, balance: "0.00" },
    }, full)).toEqual({
      kind: "found",
      status: "REFUND",
      providerRefundTransactionId: "provider-refund-1",
      refundAmount: 1_234,
    });
    const partial = { ...full, expectedRefundAmount: 500, expectedRefundType: "P" as const };
    expect(admitEximbayRefundLookupResponse({
      ...foundResponse(),
      payment: {
        ...foundResponse().payment,
        status: "PARTIAL_REFUND",
        refund_amount: "5.00",
        balance: "7.34",
      },
    }, partial)).toMatchObject({ kind: "found", status: "PARTIAL_REFUND", refundAmount: 500 });
  });

  it("admits authoritative NONE only with exact original identity and no contradictory refund fields", () => {
    const none = { ...foundResponse(), payment: {
      status: "NONE",
      order_id: "order-1",
      currency: "USD",
      amount: "12.34",
      transaction_id: "transaction-1",
      transaction_date: "20260821112233",
    } };
    expect(admitEximbayRefundLookupResponse(none, full)).toEqual({ kind: "none" });
    expect(admitEximbayRefundLookupResponse({
      ...none,
      payment: { ...none.payment, balance: "12.34" },
    }, full)).toEqual({ kind: "none" });
    expect(admitEximbayRefundLookupResponse({
      ...none,
      payment: { ...none.payment, refund_id: R1 },
    }, full)).toEqual({ kind: "conflict", code: "CONTRADICTORY_NONE" });
  });

  it.each([
    ["amount", { refund_amount: "12.33" }],
    ["refund id", { refund_id: "wrong" }],
    ["missing refund transaction", { refund_transaction_id: undefined }],
  ])("parks %s conflict", (_name, patch) => {
    const response = foundResponseWithPatch(patch);
    expect(admitEximbayRefundLookupResponse(response, full)).toMatchObject({ kind: "conflict" });
  });

  it("keeps unknown shape and timeout unknown, never NONE", async () => {
    expect(admitEximbayRefundLookupResponse({ rescode: "0000" }, full))
      .toEqual({ kind: "unknown", code: "UNKNOWN_SHAPE" });
    vi.useFakeTimers();
    const pending = executeEximbayRefundLookup(
      createEximbayRefundLookupPlan(full),
      full,
      (_url, init) => rejectLookupWhenAborted(init?.signal),
    );
    await vi.advanceTimersByTimeAsync(EXIMBAY_REFUND_LOOKUP_DEADLINE_MS + 1);
    await expect(pending).resolves.toEqual({ kind: "unknown", code: "TRANSPORT_FAILURE" });
    vi.useRealTimers();
  });

  it("freezes the Mira-owned +5s/+30s/+2m schedule and max three", () => {
    expect(EXIMBAY_REFUND_LOOKUP_OFFSETS_MS).toEqual([5_000, 30_000, 120_000]);
    expect(EXIMBAY_REFUND_LOOKUP_MAX_CONTACTS).toBe(3);
  });

  it("parses optional balance as exact provider money and rejects malformed, excessive, or NONE drift", () => {
    const none = noneResponse("1.00");
    const oneDollar = { ...full, originalAmount: 100, preContactRefundableBalance: 100,
      expectedRefundAmount: 100 };
    expect(admitEximbayRefundLookupResponse(none, oneDollar)).toEqual({ kind: "none" });
    expect(admitEximbayRefundLookupResponse(noneResponse(), oneDollar)).toEqual({ kind: "none" });
    expect(admitEximbayRefundLookupResponse(noneResponse("NOT_MONEY"), oneDollar))
      .toEqual({ kind: "conflict", code: "BALANCE_MISMATCH" });
    expect(admitEximbayRefundLookupResponse(noneResponse("999999.99"), oneDollar))
      .toEqual({ kind: "conflict", code: "BALANCE_MISMATCH" });
    expect(admitEximbayRefundLookupResponse(noneResponse("0.50"), oneDollar))
      .toEqual({ kind: "conflict", code: "BALANCE_DRIFT" });
  });

  it("requires zero balance for a full found refund when balance is present", () => {
    expect(admitEximbayRefundLookupResponse(fullFoundResponse("0.00"), full))
      .toMatchObject({ kind: "found", status: "REFUND" });
    expect(admitEximbayRefundLookupResponse(fullFoundResponse("0.01"), full))
      .toEqual({ kind: "conflict", code: "BALANCE_MISMATCH" });
  });

  it("bounds partial found balance by pre-contact balance minus the target amount", () => {
    const partial: EximbayRefundLookupAuthority = {
      ...full,
      originalAmount: 100,
      preContactRefundableBalance: 100,
      expectedRefundAmount: 40,
      expectedRefundType: "P",
    };
    expect(admitEximbayRefundLookupResponse(partialFoundResponse("0.60"), partial))
      .toMatchObject({ kind: "found", status: "PARTIAL_REFUND" });
    expect(admitEximbayRefundLookupResponse(partialFoundResponse("0.40"), partial))
      .toMatchObject({ kind: "found", status: "PARTIAL_REFUND" });
    expect(admitEximbayRefundLookupResponse(partialFoundResponse("0.70"), partial))
      .toEqual({ kind: "conflict", code: "BALANCE_MISMATCH" });
  });

  it("uses the canonical currency-specific USD and JPY balance grammar including exact zero", () => {
    expect(admitEximbayRefundLookupResponse(fullFoundResponse("0"), full))
      .toEqual({ kind: "conflict", code: "BALANCE_MISMATCH" });
    const jpy: EximbayRefundLookupAuthority = {
      ...full,
      currency: "JPY",
      originalAmount: 100,
      preContactRefundableBalance: 100,
      expectedRefundAmount: 100,
      language: "JP",
    };
    const response = fullFoundResponse("0");
    expect(admitEximbayRefundLookupResponse({
      ...response,
      payment: { ...response.payment, currency: "JPY", amount: "100", refund_amount: "100" },
    }, jpy)).toMatchObject({ kind: "found", status: "REFUND" });
    expect(admitEximbayRefundLookupResponse({
      ...response,
      payment: {
        ...response.payment,
        currency: "JPY",
        amount: "100",
        refund_amount: "100",
        balance: "0.00",
      },
    }, jpy)).toEqual({ kind: "conflict", code: "BALANCE_MISMATCH" });
  });
});

function foundResponse() {
  return {
    rescode: "0000",
    resmsg: "Success.",
    mid: "mid-1",
    payment: {
      status: "REFUND",
      order_id: "order-1",
      currency: "USD",
      amount: "12.34",
      transaction_id: "transaction-1",
      transaction_date: "20260821112233",
      refund_id: R1,
      refund_transaction_id: "provider-refund-1",
      refund_amount: "12.34",
    },
  };
}

function foundResponseWithPatch(patch: unknown) {
  const base = foundResponse();
  if (!isRecord(patch)) return base;
  const payment = { ...base.payment, ...patch };
  if (Object.hasOwn(patch, "refund_transaction_id")
    && patch.refund_transaction_id === undefined) {
    const { refund_transaction_id: _omitted, ...withoutProviderId } = payment;
    return { ...base, payment: withoutProviderId };
  }
  return { ...base, payment };
}

function noneResponse(balance?: string) {
  return {
    rescode: "0000",
    resmsg: "Success.",
    mid: "mid-1",
    payment: {
      status: "NONE",
      order_id: "order-1",
      currency: "USD",
      amount: "1.00",
      transaction_id: "transaction-1",
      transaction_date: "20260821112233",
      ...(balance === undefined ? {} : { balance }),
    },
  };
}

function fullFoundResponse(balance: string) {
  const response = foundResponse();
  return { ...response, payment: { ...response.payment, balance } };
}

function partialFoundResponse(balance: string) {
  const response = foundResponse();
  return {
    ...response,
    payment: {
      ...response.payment,
      status: "PARTIAL_REFUND",
      amount: "1.00",
      refund_amount: "0.40",
      balance,
    },
  };
}

function rejectLookupWhenAborted(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    if (!signal) return reject(new Error("missing signal"));
    signal.addEventListener("abort", rejectLookupAbort.bind(null, reject), { once: true });
  });
}

function rejectLookupAbort(reject: (reason?: unknown) => void): void {
  reject(new Error("aborted"));
}
