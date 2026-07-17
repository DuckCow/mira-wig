import { isDeepStrictEqual } from "util";
import { describe, expect, it } from "vitest";
import {
  fingerprintTossRefundEligibility,
  normalizeTossRefundEligibility,
  serializeTossRefundEligibility,
} from "../refund-eligibility";

const RECEIVED_AT = new Date("2026-07-17T00:00:00.123Z");
const FIXED_PREIMAGE =
  '["refund-toss-eligibility/v1","TOSS","SANDBOX","toss-payment-1","카드",false,"KRW",85000,85000,0,0,0]';
const FIXED_DIGEST = "76bfeba35b96792b0c167b0874157ab620e5df66be122cf4e7a78e37ce3069c3";

describe("Toss refund eligibility normalization", () => {
  it("normalizes only the exact eligible scalar field set with an epoch-millisecond local time", () => {
    const input = eligibleInput();
    const result = normalizeTossRefundEligibility(input);
    if (!result.ok) throw new Error("Expected eligible Toss refund facts.");

    expect(isDeepStrictEqual(Object.keys(result.facts), [
      "paymentKey", "method", "easyPayPresent", "currency", "providerStatus",
      "totalAmount", "balanceAmount", "taxFreeAmount", "taxExemptionAmount",
      "cancelsCount", "localReceivedAt",
    ])).toBe(true);
    expect(typeof result.facts.localReceivedAt).toBe("number");
    expect(Number.isSafeInteger(result.facts.localReceivedAt)).toBe(true);
    expect(result.facts.localReceivedAt === input.localReceivedAt.getTime()).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.facts)).toBe(true);
  });

  it("exposes no Date mutator surface in normalized local receive time", () => {
    const result = normalizeTossRefundEligibility(eligibleInput());
    if (!result.ok) throw new Error("Expected eligible Toss refund facts.");
    const localReceivedAt: unknown = result.facts.localReceivedAt;

    expect(localReceivedAt instanceof Date).toBe(false);
  });

  it("resists assignment through the frozen normalized owner object", () => {
    const result = normalizeTossRefundEligibility(eligibleInput());
    if (!result.ok) throw new Error("Expected eligible Toss refund facts.");
    const originalTime = result.facts.localReceivedAt;
    const assignmentSucceeded = Reflect.set(result.facts, "localReceivedAt", 0);

    expect(assignmentSucceeded).toBe(false);
    expect(result.facts.localReceivedAt === originalTime).toBe(true);
  });

  it.each([
    null,
    [],
    { ...eligibleInput(), extra: "field" },
    withoutField("method"),
    Object.assign(Object.create(eligibleInput()), { paymentKey: "own-key" }),
  ])("rejects null, arrays, extra, missing, and inherited-only field shapes", (input) => {
    expect(normalizeTossRefundEligibility(input).ok).toBe(false);
  });

  it("rejects extra enumerable symbol fields", () => {
    const input = eligibleInput();
    Object.defineProperty(input, Symbol("extra"), { enumerable: true, value: "value" });

    expect(normalizeTossRefundEligibility(input).ok).toBe(false);
  });

  it("accepts 200 payment-key code points and rejects 201 without truncation", () => {
    const accepted = normalizeTossRefundEligibility(eligibleInput({ paymentKey: "가".repeat(200) }));
    const rejected = normalizeTossRefundEligibility(eligibleInput({ paymentKey: "가".repeat(201) }));

    expect(accepted.ok).toBe(true);
    expect(rejected.ok).toBe(false);
  });

  it.each(["", "   ", "key\nvalue", "key\u0000value"])(
    "rejects blank or control-bearing payment keys",
    (paymentKey) => {
      expect(normalizeTossRefundEligibility(eligibleInput({ paymentKey })).ok).toBe(false);
    },
  );

  it.each([
    ["method", "CARD"],
    ["easyPayPresent", true],
    ["currency", "USD"],
    ["providerStatus", "CANCELED"],
    ["taxFreeAmount", 1],
    ["taxExemptionAmount", 1],
    ["cancelsCount", 1],
  ])("rejects ineligible %s", (field, value) => {
    expect(normalizeTossRefundEligibility(eligibleInput({ [field]: value })).ok).toBe(false);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER, 2_147_483_648])(
    "rejects invalid total amounts",
    (totalAmount) => {
      expect(normalizeTossRefundEligibility(eligibleInput({ totalAmount })).ok).toBe(false);
    },
  );

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY, 2_147_483_648])(
    "rejects invalid balance amounts",
    (balanceAmount) => {
      expect(normalizeTossRefundEligibility(eligibleInput({ balanceAmount })).ok).toBe(false);
    },
  );

  it("accepts the positive PostgreSQL integer boundaries", () => {
    const lower = normalizeTossRefundEligibility(eligibleInput({ totalAmount: 1, balanceAmount: 1 }));
    const upper = normalizeTossRefundEligibility(eligibleInput({
      totalAmount: 2_147_483_647,
      balanceAmount: 2_147_483_647,
    }));

    expect(lower.ok && upper.ok).toBe(true);
  });

  it.each([
    new Date("invalid"),
    new Date("-004712-12-31T23:59:59.999Z"),
    "2026-07-17T00:00:00.123Z",
    {},
  ])("rejects invalid or PostgreSQL-unsafe local receive times", (localReceivedAt) => {
    expect(normalizeTossRefundEligibility(eligibleInput({ localReceivedAt })).ok).toBe(false);
  });

  it("keeps the normalized millisecond value isolated from source mutation", () => {
    const localReceivedAt = new Date("2026-07-17T00:00:00.987Z");
    const originalTime = localReceivedAt.getTime();
    const result = normalizeTossRefundEligibility(eligibleInput({ localReceivedAt }));
    if (!result.ok) throw new Error("Expected eligible Toss refund facts.");
    localReceivedAt.setTime(0);

    expect(result.facts.localReceivedAt === originalTime).toBe(true);
  });

  it("rejects object-shaped mutable authority in scalar positions", () => {
    expect(normalizeTossRefundEligibility(eligibleInput({ paymentKey: { value: "key" } })).ok)
      .toBe(false);
  });
});

describe("Toss refund eligibility fingerprint", () => {
  it("pins the exact compact preimage and independently computed digest", () => {
    const input = eligibleInput();

    expect(serializeTossRefundEligibility(input) === FIXED_PREIMAGE).toBe(true);
    expect(fingerprintTossRefundEligibility(input) === FIXED_DIGEST).toBe(true);
  });

  it("uses JSON numbers and boolean, with no timestamp or credential positions", () => {
    const parsed: unknown = JSON.parse(serializeTossRefundEligibility(eligibleInput()));
    if (!Array.isArray(parsed)) throw new Error("Expected canonical eligibility array.");

    expect(parsed.length).toBe(12);
    expect(typeof parsed[5] === "boolean").toBe(true);
    expect(parsed.slice(7).every((value) => typeof value === "number")).toBe(true);
  });

  it("excludes local receive time from fingerprint identity", () => {
    const firstInput = eligibleInput({
      localReceivedAt: new Date("2026-07-17T00:00:00.000Z"),
    });
    const secondInput = eligibleInput({
      localReceivedAt: new Date("2026-07-17T00:00:01.000Z"),
    });

    expect(serializeTossRefundEligibility(firstInput)
      === serializeTossRefundEligibility(secondInput)).toBe(true);
    expect(fingerprintTossRefundEligibility(firstInput)
      === fingerprintTossRefundEligibility(secondInput)).toBe(true);
  });

  it("rejects credential-like extra fields instead of fingerprinting them", () => {
    const input = { ...eligibleInput(), merchantAccountBinding: "synthetic-label" };

    expect(() => serializeTossRefundEligibility(input)).toThrowError(
      "Toss refund eligibility input is invalid.",
    );
  });
});

function eligibleInput(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    paymentKey: "toss-payment-1",
    method: "카드",
    easyPayPresent: false,
    currency: "KRW",
    providerStatus: "DONE",
    totalAmount: 85_000,
    balanceAmount: 85_000,
    taxFreeAmount: 0,
    taxExemptionAmount: 0,
    cancelsCount: 0,
    localReceivedAt: new Date(RECEIVED_AT.getTime()),
    ...overrides,
  };
}

function withoutField(field: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(eligibleInput()).filter(([key]) => key !== field));
}
