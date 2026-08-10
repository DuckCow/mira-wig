import { describe, expect, it } from "vitest";
import {
  EximbayProtocolError,
  createEximbayPreparationFacts,
  createEximbayProviderOrderCandidate,
  projectEximbayReady,
  projectEximbaySdk,
  sameEximbayProviderOrderCandidate,
} from "../index";

const PREPARATION_CONTROL_CASES: readonly (readonly [string, number])[] = [
  ["mid", 0x00],
  ["buyerName", 0x1f],
  ["buyerEmail", 0x7f],
  ["returnUrl", 0x80],
  ["statusUrl", 0x85],
  ["mid", 0x9f],
];

function validInput(): Record<string, unknown> {
  return {
    transactionType: "PAYMENT",
    providerOrderCandidate: createEximbayProviderOrderCandidate("payment-1"),
    currency: "USD",
    amountMinor: 2_999,
    language: "EN",
    paymentMethod: "P000",
    mid: "merchant-mid",
    buyerName: "Buyer Name",
    buyerEmail: "buyer@example.com",
    returnUrl: "https://shop.example/return",
    statusUrl: "https://shop.example/status",
  };
}

describe("Eximbay canonical preparation facts", () => {
  it("constructs one immutable validated source of shared merchant facts", () => {
    const facts = createEximbayPreparationFacts(validInput());

    expect(facts.transactionType).toBe("PAYMENT");
    expect(Object.keys(facts.providerOrderCandidate)).toEqual([]);
    expect(JSON.stringify(facts.providerOrderCandidate)).toBe("{}");
    expect(facts.currency).toBe("USD");
    expect(facts.amount).toEqual({ currency: "USD", minor: 2_999, wire: "29.99" });
    expect(facts.language).toBe("EN");
    expect(facts.paymentMethod).toBe("P000");
    expect(facts.mid).toBe("merchant-mid");
    expect(facts.buyerName).toBe("Buyer Name");
    expect(facts.buyerEmail).toBe("buyer@example.com");
    expect(facts.returnUrl).toBe("https://shop.example/return");
    expect(facts.statusUrl).toBe("https://shop.example/status");
    expect(Object.isFrozen(facts)).toBe(true);
    expect(Object.isFrozen(facts.amount)).toBe(true);
    expect(Object.isFrozen(facts.providerOrderCandidate)).toBe(true);
    expect(Reflect.set(facts, "mid", "changed")).toBe(false);
  });

  it("rejects unknown and missing input properties", () => {
    expect(() => createEximbayPreparationFacts({ ...validInput(), extra: "no" }))
      .toThrowError("UNKNOWN_PROPERTY");
    const input = validInput();
    delete input.mid;
    expect(() => createEximbayPreparationFacts(input)).toThrowError("MISSING_PROPERTY");
  });

  it("accepts an omitted payment method without projecting an undefined wire property", () => {
    const input = validInput();
    delete input.paymentMethod;
    const facts = createEximbayPreparationFacts(input);
    const ready = projectEximbayReady(facts);

    expect(facts.paymentMethod).toBeUndefined();
    expect(Object.hasOwn(ready.payment, "payment_method")).toBe(false);
  });

  it.each([
    ["transactionType", "AUTHORIZE"],
    ["currency", "KRW"],
    ["language", "KR"],
    ["paymentMethod", "P101"],
    ["paymentMethod", undefined],
    ["mid", ""],
    ["buyerName", " Buyer"],
    ["buyerEmail", "buyer@example.com "],
    ["returnUrl", "\u0000https://shop.example"],
    ["statusUrl", "   "],
  ])("rejects invalid %s", (key, value) => {
    expect(() => createEximbayPreparationFacts({ ...validInput(), [key]: value }))
      .toThrow(EximbayProtocolError);
  });

  it.each(PREPARATION_CONTROL_CASES)("rejects preparation control in %s at U+%s", (field, codePoint) => {
    const control = String.fromCodePoint(codePoint);
    expect(() => createEximbayPreparationFacts({
      ...validInput(),
      [field]: `valid${control}text`,
    })).toThrow(EximbayProtocolError);
  });

  it("projects deeply equal shared ready/SDK facts with SDK-only supplied FGKey", () => {
    const facts = createEximbayPreparationFacts(validInput());
    const ready = projectEximbayReady(facts);
    const sdk = projectEximbaySdk(facts, "ephemeral-fgkey");
    const { fgkey, ...sdkShared } = sdk;

    expect(fgkey).toBe("ephemeral-fgkey");
    expect(sdkShared).toEqual(ready);
    expect(ready).toEqual({
      payment: {
        transaction_type: "PAYMENT",
        order_id: facts.providerOrderCandidate,
        currency: "USD",
        amount: "29.99",
        lang: "EN",
        payment_method: "P000",
      },
      merchant: { mid: "merchant-mid" },
      buyer: { name: "Buyer Name", email: "buyer@example.com" },
      url: {
        return_url: "https://shop.example/return",
        status_url: "https://shop.example/status",
      },
    });
  });

  it("isolates caller input, canonical facts, and both mutable projections", () => {
    const input = validInput();
    const facts = createEximbayPreparationFacts(input);
    input.mid = "caller-mutated";
    const ready = projectEximbayReady(facts);
    const sdk = projectEximbaySdk(facts, "ephemeral-fgkey");

    ready.payment.amount = "999.99";
    ready.buyer.name = "changed";
    sdk.merchant.mid = "changed";

    expect(facts.mid).toBe("merchant-mid");
    expect(facts.amount.wire).toBe("29.99");
    expect(sdk.payment.amount).toBe("29.99");
    expect(sdk.buyer.name).toBe("Buyer Name");
    expect(ready.payment.order_id).toBe(facts.providerOrderCandidate);
    expect(sdk.payment.order_id).toBe(facts.providerOrderCandidate);
    expect(ready.merchant.mid).toBe("merchant-mid");
  });

  it("validates the already-supplied ephemeral FGKey without generating one", () => {
    const facts = createEximbayPreparationFacts(validInput());
    for (const invalid of ["", " key", "key\u0000"]) {
      expect(() => projectEximbaySdk(facts, invalid)).toThrowError("INVALID_FGKEY");
    }
  });
});

describe("Eximbay provider-order candidate semantics", () => {
  it("is stable per Payment identity and distinct across Payment identities", () => {
    const first = createEximbayProviderOrderCandidate("payment-1");
    const retry = createEximbayProviderOrderCandidate("payment-1");
    const other = createEximbayProviderOrderCandidate("payment-2");

    expect(sameEximbayProviderOrderCandidate(first, retry)).toBe(true);
    expect(sameEximbayProviderOrderCandidate(first, other)).toBe(false);
    expect(first).not.toBe(retry);
    expect(typeof first).toBe("object");
    expect(JSON.stringify(first)).not.toContain("payment-1");
    expect(Object.keys(first)).not.toContain("checkoutSessionId");
  });

  it.each(["", " payment-1", "payment-1 ", "payment\u0000-1"])(
    "rejects invalid repository Payment identity %s",
    (identity) => {
      expect(() => createEximbayProviderOrderCandidate(identity))
        .toThrowError("INVALID_PAYMENT_IDENTITY");
    },
  );

  it("rejects spread, overridden, extra, and hand-built candidate shapes", () => {
    const valid = createEximbayProviderOrderCandidate("payment-1");
    const attempts: readonly Record<string, unknown>[] = [
      { ...valid, paymentIdentity: "payment-2" },
      { ...valid, extra: "invented" },
      { paymentIdentity: "payment-1", opaqueCandidate: "payment-1" },
    ];

    for (const providerOrderCandidate of attempts) {
      expect(() => createEximbayPreparationFacts({
        ...validInput(),
        providerOrderCandidate,
      })).toThrowError("INVALID_PROVIDER_ORDER_CANDIDATE");
    }
  });

  it("keeps ready and SDK order identity semantic and non-wire", () => {
    const firstFacts = createEximbayPreparationFacts(validInput());
    const retryFacts = createEximbayPreparationFacts(validInput());
    const otherInput = validInput();
    otherInput.providerOrderCandidate = createEximbayProviderOrderCandidate("payment-2");
    const otherFacts = createEximbayPreparationFacts(otherInput);
    const ready = projectEximbayReady(firstFacts);
    const sdk = projectEximbaySdk(firstFacts, "ephemeral-fgkey");

    expect(sameEximbayProviderOrderCandidate(
      firstFacts.providerOrderCandidate,
      retryFacts.providerOrderCandidate,
    )).toBe(true);
    expect(sameEximbayProviderOrderCandidate(
      firstFacts.providerOrderCandidate,
      otherFacts.providerOrderCandidate,
    )).toBe(false);
    expect(ready.payment.order_id).toBe(firstFacts.providerOrderCandidate);
    expect(sdk.payment.order_id).toBe(firstFacts.providerOrderCandidate);
    expect(typeof ready.payment.order_id).not.toBe("string");
  });

  it("denies projector authority to hand-built canonical shapes and invented wire facts", () => {
    const facts = createEximbayPreparationFacts(validInput());
    const attempts: readonly Record<string, unknown>[] = [
      { ...facts },
      { ...facts, amount: { currency: "USD", minor: 2_999, wire: "999.99" } },
      { ...facts, mid: "" },
    ];

    for (const attempt of attempts) {
      expect(() => {
        Reflect.apply(projectEximbayReady, undefined, [attempt]);
      }).toThrowError("INVALID_CANONICAL_PREPARATION_FACTS");
      expect(() => {
        Reflect.apply(projectEximbaySdk, undefined, [attempt, "ephemeral-fgkey"]);
      }).toThrowError("INVALID_CANONICAL_PREPARATION_FACTS");
    }
  });

  it("isolates nested candidate authority from caller mutation after construction", () => {
    const input = validInput();
    const candidate = input.providerOrderCandidate;
    const facts = createEximbayPreparationFacts(input);
    input.providerOrderCandidate = { paymentIdentity: "payment-2" };

    expect(facts.providerOrderCandidate).toBe(candidate);
    expect(Object.isFrozen(facts.providerOrderCandidate)).toBe(true);
    expect(Reflect.set(facts.providerOrderCandidate, "paymentIdentity", "payment-2")).toBe(false);
    expect(projectEximbayReady(facts).payment.order_id).toBe(candidate);
  });
});
