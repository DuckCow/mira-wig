import { PaymentMode, PaymentProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  fingerprintRefundRequest,
  normalizeRefundRequestFingerprintInput,
  RefundRequestFingerprintInputError,
  serializeRefundRequestFingerprintInput,
  type RefundRequestFingerprintInput,
} from "../refund-request-fingerprint";

const REPRESENTATIVE_CANONICAL =
  '["refund-provider-request/v1","MOCK","SANDBOX","mock:payment_1",400,"KRW","refund:payment_1:attempt_1"]';
const REPRESENTATIVE_DIGEST = "5b3860a1dc707486242cf3c9e994313898939400a77813500fc0818426b8a545";
const BOUNDARY_CANONICAL =
  '["refund-provider-request/v1","MOCK","SANDBOX","mock:boundary-payment",1,"USD","refund:boundary-payment:attempt"]';
const BOUNDARY_DIGEST = "cc24be8b8da2fb42cdc3ff451f03c7a4b502555bb3889bdf874b5ab825cd1de6";

describe("refund request fingerprint", () => {
  it("serializes exact compact canonical JSON and matches the independent representative vector", () => {
    const input = representative();
    const serialized = serializeRefundRequestFingerprintInput(input);
    const digest = fingerprintRefundRequest(input);

    expect(serialized === REPRESENTATIVE_CANONICAL).toBe(true);
    expect(digest === REPRESENTATIVE_DIGEST).toBe(true);
    expect(/^[0-9a-f]{64}$/.test(digest)).toBe(true);
  });

  it("matches the independently computed amountMinor=1 boundary vector", () => {
    const input: RefundRequestFingerprintInput = {
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      providerPaymentReference: "mock:boundary-payment",
      amountMinor: 1,
      currency: "USD",
      providerOperationKey: "refund:boundary-payment:attempt",
    };

    expect(serializeRefundRequestFingerprintInput(input) === BOUNDARY_CANONICAL).toBe(true);
    expect(fingerprintRefundRequest(input) === BOUNDARY_DIGEST).toBe(true);
  });

  it("is stable and excludes ordinal, generation, ids, and clock by accepting no such facts", () => {
    const input = representative();
    const first = fingerprintRefundRequest(input);
    const second = fingerprintRefundRequest({ ...input });
    const canonicalKeys = Object.keys(normalizeRefundRequestFingerprintInput(input)).sort();

    expect(first === second).toBe(true);
    expect(canonicalKeys).toEqual([
      "amountMinor",
      "currency",
      "mode",
      "provider",
      "providerOperationKey",
      "providerPaymentReference",
    ]);
  });

  it("trims opaque references without case folding and uppercases currency", () => {
    const facts = normalizeRefundRequestFingerprintInput({
      ...representative(),
      providerPaymentReference: "  Mock:Case-Sensitive  ",
      providerOperationKey: "  Refund:Case-Sensitive  ",
      currency: " krw ",
    });

    expect(facts.providerPaymentReference === "Mock:Case-Sensitive").toBe(true);
    expect(facts.providerOperationKey === "Refund:Case-Sensitive").toBe(true);
    expect(facts.currency).toBe("KRW");
  });

  it.each(Object.values(PaymentProvider))(
    "accepts canonical Prisma provider identity %s",
    (provider) => {
      expect(normalizeRefundRequestFingerprintInput({
        ...representative(),
        provider,
      }).provider).toBe(provider);
    },
  );

  it.each([
    ["near-match", "EXIM"],
    ["prototype name", "__proto__"],
    ["constructor name", "constructor"],
    ["null", null],
    ["number", 7],
    ["plain object", {}],
  ] satisfies readonly [string, unknown][])(
    "rejects noncanonical runtime provider $label",
    (_label, provider) => {
      expect(() => normalizeRefundProviderAtRuntime(provider))
        .toThrow(RefundRequestFingerprintInputError);
    },
  );

  it.each([
    { label: "money", change: { amountMinor: 401 } },
    { label: "provider reference", change: { providerPaymentReference: "mock:payment_2" } },
    { label: "operation key", change: { providerOperationKey: "refund:payment_1:attempt_2" } },
  ])("changes when $label changes", ({ change }) => {
    const baseline = fingerprintRefundRequest(representative());
    const changed = fingerprintRefundRequest({ ...representative(), ...change });

    expect(changed === baseline).toBe(false);
  });

  it.each([0, -1, 2_147_483_648, Number.NaN])("rejects invalid amount %j", (amountMinor) => {
    expect(() => fingerprintRefundRequest({ ...representative(), amountMinor }))
      .toThrow(RefundRequestFingerprintInputError);
  });

  it.each(["", "KR", "KRW1", "원화"])("rejects invalid currency %j", (currency) => {
    expect(() => fingerprintRefundRequest({ ...representative(), currency }))
      .toThrow(RefundRequestFingerprintInputError);
  });
});

function representative(): RefundRequestFingerprintInput {
  return {
    provider: PaymentProvider.MOCK,
    mode: PaymentMode.SANDBOX,
    providerPaymentReference: "mock:payment_1",
    amountMinor: 400,
    currency: "KRW",
    providerOperationKey: "refund:payment_1:attempt_1",
  };
}

function normalizeRefundProviderAtRuntime(provider: unknown): unknown {
  return Reflect.apply(normalizeRefundRequestFingerprintInput, undefined, [{
    ...representative(),
    provider,
  }]);
}
