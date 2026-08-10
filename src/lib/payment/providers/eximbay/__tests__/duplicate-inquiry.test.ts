import { describe, expect, it } from "vitest";
import {
  EXIMBAY_INQUIRY_STATUS_CLASSIFICATIONS,
  classifyEximbayInquiryStatus,
  compareTrustedEximbayFacts,
  createEximbayProviderOrderCandidate,
  validateTrustedEximbayFacts,
  type ExpectedEximbayPaymentFacts,
  type TrustedEximbayCompletionCandidate,
} from "../index";
import { verifiedStatusFixture } from "./fixtures/verified-status";

interface TrustedInput {
  paymentIdentity?: string;
  mid?: string;
  transactionId?: string;
  amountMinor?: number;
  providerOrderId?: string;
}

function trusted(input: TrustedInput = {}): TrustedEximbayCompletionCandidate {
  const paymentIdentity = input.paymentIdentity ?? "payment-1";
  const mid = input.mid ?? "merchant-mid";
  const amountMinor = input.amountMinor ?? 2_999;
  const providerOrderId = input.providerOrderId ?? "established-provider-order-1";
  const expected: ExpectedEximbayPaymentFacts = {
    paymentIdentity,
    provider: "EXIMBAY",
    mode: "SANDBOX",
    currency: "USD",
    amountMinor,
    providerOrderCandidate: createEximbayProviderOrderCandidate(paymentIdentity),
    providerOrderId,
    mid,
  };
  return validateTrustedEximbayFacts(verifiedStatusFixture({
    paymentIdentity,
    orderId: providerOrderId,
    mid,
    amount: amountMinor === 2_999 ? "29.99" : "30.00",
    transactionId: input.transactionId ?? "transaction-1",
  }), expected);
}

describe("Eximbay duplicate comparator", () => {
  it("classifies exact replay, same-ID conflict, and distinct transactions", () => {
    expect(compareTrustedEximbayFacts(trusted(), trusted())).toBe("EXACT_REPLAY");
    expect(compareTrustedEximbayFacts(trusted(), trusted({ mid: "other-mid" }))).toBe("CONFLICT");
    expect(compareTrustedEximbayFacts(
      trusted(),
      trusted({ transactionId: "transaction-2" }),
    )).toBe("DISTINCT");
  });

  it("compares every frozen authority fact for a shared transaction ID", () => {
    const original = trusted();
    expect(compareTrustedEximbayFacts(
      original,
      trusted({ paymentIdentity: "payment-2", providerOrderId: "established-provider-order-2" }),
    ))
      .toBe("CONFLICT");
    expect(compareTrustedEximbayFacts(original, trusted({ amountMinor: 3_000 }))).toBe("CONFLICT");
  });
});

describe("Eximbay inquiry status classifier", () => {
  it("publishes the exhaustive immutable four-state classification constants", () => {
    expect(Object.keys(EXIMBAY_INQUIRY_STATUS_CLASSIFICATIONS)).toEqual([
      "SALE",
      "AUTH",
      "REGISTERED",
      "NONE",
    ]);
    expect(Object.isFrozen(EXIMBAY_INQUIRY_STATUS_CLASSIFICATIONS)).toBe(true);
  });

  it.each([
    ["SALE", true],
    ["AUTH", false],
    ["REGISTERED", false],
    ["NONE", false],
  ])("classifies %s without promoting non-SALE states", (status, completed) => {
    expect(classifyEximbayInquiryStatus(status)).toEqual({
      status,
      potentialCompletedSale: completed,
    });
  });

  it("rejects unknown inquiry states", () => {
    expect(() => classifyEximbayInquiryStatus("PENDING"))
      .toThrowError("UNKNOWN_INQUIRY_STATUS");
  });
});
