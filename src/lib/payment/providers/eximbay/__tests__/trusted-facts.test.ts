import { describe, expect, expectTypeOf, it } from "vitest";
import {
  EximbayProtocolError,
  createEximbayProviderOrderCandidate,
  parseUnverifiedEximbayStatus,
  validateTrustedEximbayFacts,
  type ExpectedEximbayPaymentFacts,
  type ProviderVerifiedEximbayStatus,
  type UnverifiedEximbayStatus,
} from "../index";
import {
  verifiedStatusFixture,
  verifiedStatusFixtureWithoutStatus,
  verifiedStatusFixtureWithoutTransactionId,
} from "./fixtures/verified-status";

function expectedFacts(
  paymentIdentity = "payment-1",
  amountMinor = 2_999,
): ExpectedEximbayPaymentFacts {
  return {
    paymentIdentity,
    provider: "EXIMBAY",
    mode: "SANDBOX",
    currency: "USD",
    amountMinor,
    providerOrderCandidate: createEximbayProviderOrderCandidate(paymentIdentity),
    providerOrderId: "established-provider-order-1",
    mid: "merchant-mid",
  };
}

function expectMismatch(
  verified: ProviderVerifiedEximbayStatus,
  expected: ExpectedEximbayPaymentFacts,
  code: string,
): void {
  expect(() => validateTrustedEximbayFacts(verified, expected)).toThrowError(code);
}

describe("Eximbay unverified/provider-verified authority boundary", () => {
  it("does not structurally promote parser output to provider-verified facts", () => {
    expectTypeOf<UnverifiedEximbayStatus>().not.toMatchTypeOf<ProviderVerifiedEximbayStatus>();
    const parsed = parseUnverifiedEximbayStatus(
      "transaction_type=PAYMENT&mid=m&order_id=o&currency=USD&amount=1.00"
      + "&rescode=0000&resmsg=Success&fgkey=f&transaction_id=t",
    );
    expect(parsed.authority).toBe("UNVERIFIED_STATUS");

  });
});

describe("Eximbay trusted-facts validator", () => {
  it("produces only an Eximbay-specific trusted intermediate when every predicate agrees", () => {
    const trusted = validateTrustedEximbayFacts(verifiedStatusFixture(), expectedFacts());

    expect(trusted).toEqual({
      authority: "TRUSTED_LOCAL_COMPLETION_CANDIDATE",
      transactionType: "PAYMENT",
      rescode: "0000",
      status: "SALE",
      mid: "merchant-mid",
      providerOrderId: "established-provider-order-1",
      paymentIdentity: "payment-1",
      provider: "EXIMBAY",
      mode: "SANDBOX",
      currency: "USD",
      amountMinor: 2_999,
      transactionId: "transaction-1",
    });
    expect(Object.isFrozen(trusted)).toBe(true);
    expect(Object.keys(trusted)).not.toContain("captureFacts");
    expect(Object.keys(trusted)).not.toContain("order");
  });

  it("fails each exact authority predicate independently", () => {
    const expected = expectedFacts();
    expectMismatch(verifiedStatusFixture({ transactionType: "AUTHORIZE" }), expected, "TRANSACTION_TYPE_MISMATCH");
    expectMismatch(verifiedStatusFixture({ rescode: "1001" }), expected, "RESPONSE_CODE_MISMATCH");
    expectMismatch(verifiedStatusFixture({ mid: "other-mid" }), expected, "MID_MISMATCH");
    expectMismatch(verifiedStatusFixture({ orderId: "other-order" }), expected, "PROVIDER_ORDER_ID_MISMATCH");
    expectMismatch(verifiedStatusFixture({ paymentIdentity: "other-payment" }), expected, "PAYMENT_IDENTITY_MISMATCH");
    expectMismatch(verifiedStatusFixture({ provider: "TOSS" }), expected, "PROVIDER_MISMATCH");
    expectMismatch(verifiedStatusFixture({ mode: "LIVE" }), expected, "MODE_MISMATCH");
    expectMismatch(verifiedStatusFixture({ currency: "JPY" }), expected, "CURRENCY_MISMATCH");
    expectMismatch(verifiedStatusFixture({ amount: "30.00" }), expected, "AMOUNT_MISMATCH");
    expectMismatch(verifiedStatusFixture({ amount: "29.990" }), expected, "AMOUNT_MISMATCH");
    expectMismatch(verifiedStatusFixture({ transactionId: "" }), expected, "TRANSACTION_ID_MISSING");
    expectMismatch(verifiedStatusFixtureWithoutTransactionId(), expected, "TRANSACTION_ID_MISSING");

    const mismatchedCandidate: ExpectedEximbayPaymentFacts = {
      ...expected,
      providerOrderCandidate: createEximbayProviderOrderCandidate("other-payment"),
      providerOrderId: "other-order",
    };
    expectMismatch(verifiedStatusFixture({ orderId: "other-order" }), mismatchedCandidate, "PAYMENT_IDENTITY_MISMATCH");
    expectMismatch(verifiedStatusFixture(), expectedFacts("payment-1", 3_000), "AMOUNT_MISMATCH");
  });

  it.each(["AUTH", "REGISTERED", "NONE", "UNKNOWN"])(
    "fails closed when status is %s",
    (status) => {
      expectMismatch(verifiedStatusFixture({ status }), expectedFacts(), "STATUS_NOT_SALE");
    },
  );

  it("fails closed when status is absent", () => {
    expectMismatch(verifiedStatusFixtureWithoutStatus(), expectedFacts(), "STATUS_NOT_SALE");
  });

  it("returns stable errors without leaking compared values", () => {
    try {
      validateTrustedEximbayFacts(
        verifiedStatusFixture({ mid: "sensitive-mid", transactionId: "sensitive-transaction" }),
        expectedFacts(),
      );
    } catch (error) {
      expect(error).toBeInstanceOf(EximbayProtocolError);
      expect(String(error)).toBe("EximbayProtocolError: MID_MISMATCH");
      expect(String(error)).not.toContain("sensitive-mid");
      expect(String(error)).not.toContain("sensitive-transaction");
      return;
    }
    throw new Error("Expected trusted-facts mismatch");
  });
});
