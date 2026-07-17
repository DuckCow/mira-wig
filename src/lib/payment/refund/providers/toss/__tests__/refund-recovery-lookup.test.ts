import { describe, expect, it } from "vitest";
import { normalizeTossRefundRecoveryLookup } from "../refund-recovery-lookup";

const EXPECTED = Object.freeze({
  paymentKey: "synthetic-payment-key",
  fullAmount: 85_000,
  localReceivedAt: Date.parse("2026-07-17T00:00:00.000Z"),
});

describe("pure bounded Toss recovery lookup normalization", () => {
  it("normalizes one exact terminal cancellation", () => {
    const result = normalizeTossRefundRecoveryLookup(response({
      paymentKey: EXPECTED.paymentKey,
      currency: "KRW",
      status: "CANCELED",
      totalAmount: 85_000,
      balanceAmount: 0,
      cancels: [{
        transactionKey: "synthetic-transaction",
        cancelStatus: "DONE",
        cancelAmount: 85_000,
        cancelReason: "Mira merchant refund",
      }],
    }), EXPECTED);

    expect(result.kind).toBe("EXACT_SUCCESS");
    expect(result.kind === "EXACT_SUCCESS" && Object.isFrozen(result.success)).toBe(true);
  });

  it.each([null, []])("normalizes exact untouched eligibility with cancels %s", (cancels) => {
    const result = normalizeTossRefundRecoveryLookup(response({
      paymentKey: EXPECTED.paymentKey,
      method: "카드",
      easyPay: null,
      currency: "KRW",
      status: "DONE",
      totalAmount: 85_000,
      balanceAmount: 85_000,
      taxFreeAmount: 0,
      taxExemptionAmount: 0,
      cancels,
    }), EXPECTED);
    expect(result.kind).toBe("STILL_ELIGIBLE_AND_UNCANCELLED");
  });

  it.each([
    { balanceAmount: 1 },
    { currency: "USD" },
    { status: "CANCELED", cancels: [] },
    { method: "간편결제", easyPay: {} },
    { cancels: [{ cancelStatus: "IN_PROGRESS" }] },
  ])("classifies conflicting provider facts without widening processing", (override) => {
    const result = normalizeTossRefundRecoveryLookup(response({
      paymentKey: EXPECTED.paymentKey,
      method: "카드",
      easyPay: null,
      currency: "KRW",
      status: "DONE",
      totalAmount: 85_000,
      balanceAmount: 85_000,
      taxFreeAmount: 0,
      taxExemptionAmount: 0,
      cancels: null,
      ...override,
    }), EXPECTED);
    expect(result.kind).toBe("CONFLICTING_PROVIDER_STATE");
  });

  it.each([
    '{"paymentKey":"synthetic-payment-key","paymentKey":"other"}',
    '{"paymentKey":"synthetic-payment-key","cancels":[{"transactionKey":"a","transaction\\u004bey":"b"}]}',
    "{",
  ])("rejects malformed or duplicate protected JSON", (json) => {
    const result = normalizeTossRefundRecoveryLookup({
      kind: "response", body: new TextEncoder().encode(json),
    }, EXPECTED);
    expect(result.kind).toBe("LOOKUP_REJECTED");
  });

  it("rejects invalid UTF-8 and a body over 64 KiB", () => {
    const invalid = normalizeTossRefundRecoveryLookup({
      kind: "response", body: new Uint8Array([0xc3, 0x28]),
    }, EXPECTED);
    const oversize = normalizeTossRefundRecoveryLookup({
      kind: "response", body: new Uint8Array(64 * 1024 + 1),
    }, EXPECTED);
    expect(invalid.kind === "LOOKUP_REJECTED" && oversize.kind === "LOOKUP_REJECTED").toBe(true);
  });

  it("maps private transport facts without a network client", () => {
    expect(normalizeTossRefundRecoveryLookup({ kind: "unavailable" }, EXPECTED).kind)
      .toBe("LOOKUP_UNAVAILABLE");
    expect(normalizeTossRefundRecoveryLookup({ kind: "rejected" }, EXPECTED).kind)
      .toBe("LOOKUP_REJECTED");
  });

  it("never emits the reserved provider-processing kind for committed vectors", () => {
    const vectors = [
      { kind: "unavailable" as const },
      { kind: "rejected" as const },
      response({ status: "IN_PROGRESS" }),
      response({ status: "WAITING_FOR_DEPOSIT" }),
      response({ cancels: [{ cancelStatus: "IN_PROGRESS" }] }),
      response({}),
    ];
    const kinds = vectors.map((vector) => (
      normalizeTossRefundRecoveryLookup(vector, EXPECTED).kind
    ));
    expect(kinds).not.toContain("PROVIDER_PROCESSING");
  });
});

function response(value: unknown) {
  return Object.freeze({
    kind: "response" as const,
    body: new TextEncoder().encode(JSON.stringify(value)),
  });
}
