import { PaymentProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { PaymentMethod } from "@/lib/payment/providers/routing";
import { projectEximbayReady } from "@/lib/payment/providers/eximbay/preparation";
import { createCanonicalEximbayReadyFacts } from "../ready-facts";

const BUYER_NAME = "SYNTHETIC_BUYER_NAME_DO_NOT_LOG";
const BUYER_EMAIL = "SYNTHETIC_BUYER_EMAIL_DO_NOT_LOG@example.test";

describe("EX2B2-S2 canonical Mira READY facts", () => {
  it.each([
    ["US", "USD", 2_999, "EN", "29.99"],
    ["JP", "JPY", 1_500, "JP", "1500"],
  ])("maps exact market/method/amount facts for %s", (market, currency, amount, language, wireAmount) => {
    const facts = createCanonicalEximbayReadyFacts(input({ market, currency, amount }));
    const ready = projectEximbayReady(facts);

    expect(ready).toMatchObject({
      payment: {
        transaction_type: "PAYMENT",
        currency,
        amount: wireAmount,
        lang: language,
        payment_method: "P000",
      },
      merchant: { mid: "synthetic-mid" },
      buyer: { name: BUYER_NAME, email: BUYER_EMAIL },
      url: {
        return_url: "https://payments.example.test/checkout/return/session%2Fwith%20space",
        status_url: "https://payments.example.test/api/payments/eximbay/status",
      },
    });
  });

  it("never accepts shipping recipient as purchaser fallback", () => {
    const sourceWithoutBuyer = input({ buyerName: null });
    const unrelatedShipping = { recipientName: "Shipping Recipient Must Not Be Used" };

    expect(() => createCanonicalEximbayReadyFacts(sourceWithoutBuyer)).toThrowError("INVALID_BUYER_NAME");
    expect(JSON.stringify(sourceWithoutBuyer)).not.toContain(unrelatedShipping.recipientName);
  });

  it.each([null, "", " ", " leading", "trailing ", "control\u0000", "\ud800"])(
    "rejects invalid canonical User.name before contact: %s",
    (buyerName) => {
      expect(() => createCanonicalEximbayReadyFacts(input({ buyerName })))
        .toThrowError("INVALID_BUYER_NAME");
    },
  );

  it.each(["", " ", " leading@example.test", "trailing@example.test ", "control\u007f@example.test", "\ud800"])(
    "rejects invalid canonical User.email before contact: %s",
    (buyerEmail) => {
      expect(() => createCanonicalEximbayReadyFacts(input({ buyerEmail })))
        .toThrowError("INVALID_BUYER_EMAIL");
    },
  );

  it.each(["KR", "CA"])("rejects unsupported market %s", (market) => {
    expect(() => createCanonicalEximbayReadyFacts(input({ market }))).toThrowError("UNSUPPORTED_MARKET");
  });

  it.each([PaymentMethod.PAYPAL_WALLET, PaymentMethod.MOCK])("rejects non-CARD method %s", (method) => {
    expect(() => createCanonicalEximbayReadyFacts(input({ method }))).toThrowError("UNSUPPORTED_METHOD");
  });

  it("rejects unsupported currency and exact durable Payment/session mismatches", () => {
    expect(() => createCanonicalEximbayReadyFacts(input({ currency: "KRW" })))
      .toThrowError("UNSUPPORTED_CURRENCY");
    expect(() => createCanonicalEximbayReadyFacts(input({ paymentAmount: 101, amount: 100 })))
      .toThrowError("PAYMENT_AMOUNT_MISMATCH");
    expect(() => createCanonicalEximbayReadyFacts(input({ paymentCurrency: "JPY", currency: "USD" })))
      .toThrowError("PAYMENT_CURRENCY_MISMATCH");
  });
});

interface InputOverrides {
  market?: string;
  currency?: string;
  paymentCurrency?: string;
  amount?: number;
  paymentAmount?: number;
  buyerName?: string | null;
  buyerEmail?: string;
  method?: PaymentMethod;
}

function input(overrides: InputOverrides = {}) {
  const currency = overrides.currency ?? "USD";
  const amount = overrides.amount ?? 100;
  return {
    payment: {
      id: "payment-ex2b2-s2",
      checkoutSessionId: "session/with space",
      provider: PaymentProvider.EXIMBAY,
      mode: "SANDBOX",
      providerOrderId: `c${"a".repeat(24)}`,
      amount: overrides.paymentAmount ?? amount,
      currency: overrides.paymentCurrency ?? currency,
      routingRuleId: "synthetic.eximbay.rule",
    },
    session: {
      id: "session/with space",
      userId: "synthetic-buyer-id",
      marketCode: overrides.market ?? "US",
      currency,
      totalAmount: amount,
    },
    buyer: {
      id: "synthetic-buyer-id",
      name: overrides.buyerName === undefined ? BUYER_NAME : overrides.buyerName,
      email: overrides.buyerEmail ?? BUYER_EMAIL,
    },
    method: overrides.method ?? PaymentMethod.CARD,
    mid: "synthetic-mid",
    paymentPublicOrigin: "https://payments.example.test",
  };
}
