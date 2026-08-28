import {
  BirthdayLeapDayObservation,
  PromotionKind,
  PromotionPolicyStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { ActivationPolicy } from "../policy";
import { validatePromotionPolicyActivation } from "../policy";

describe("promotion policy activation validation", () => {
  it("accepts valid signup and birthday policies", () => {
    expect(() => validatePromotionPolicyActivation(signupPolicy())).not.toThrow();
    expect(() => validatePromotionPolicyActivation(birthdayPolicy())).not.toThrow();
  });

  it.each([
    ["no rules", { marketRules: [] }],
    ["not draft", { status: PromotionPolicyStatus.ACTIVE }],
    ["invalid interval", { endsAt: new Date("2026-01-01T00:00:00.000Z") }],
  ])("rejects %s", (_name, change) => {
    expect(() => validatePromotionPolicyActivation({ ...signupPolicy(), ...change })).toThrow();
  });

  it.each([
    ["unknown Market", { market: null }],
    ["currency mismatch", { currency: "JPY" }],
    ["rate zero", { rateBps: 0 }],
    ["rate over 10000", { rateBps: 10_001 }],
    ["missing/non-positive cap", { maximumDiscountMinor: BigInt(0) }],
    ["negative minimum", { minimumEligibleSubtotalMinor: BigInt(-1) }],
  ])("rejects %s", (_name, ruleChange) => {
    const base = signupPolicy();
    const marketRules = [{ ...base.marketRules[0], ...ruleChange }];
    expect(() => validatePromotionPolicyActivation({ ...base, marketRules })).toThrow();
  });

  it("rejects signup without firstOrderOnly", () => {
    expect(() => validatePromotionPolicyActivation({
      ...signupPolicy(),
      firstOrderOnly: false,
    })).toThrow();
  });

  it.each([
    ["qualifying-purchase requirement", { requiresQualifyingPurchase: false }],
    ["window before", { birthdayWindowBeforeDays: null }],
    ["window after", { birthdayWindowAfterDays: null }],
    ["leap rule", { birthdayLeapDayObservation: null }],
  ])("rejects birthday policy missing %s", (_name, change) => {
    expect(() => validatePromotionPolicyActivation({ ...birthdayPolicy(), ...change })).toThrow();
  });

  it.each([null, "invalid/timezone"])("rejects birthday timezone %s", (eligibilityTimeZone) => {
    const base = birthdayPolicy();
    expect(() => validatePromotionPolicyActivation({
      ...base,
      marketRules: [{ ...base.marketRules[0], eligibilityTimeZone }],
    })).toThrow();
  });
});

function signupPolicy(): ActivationPolicy {
  return {
    status: PromotionPolicyStatus.DRAFT,
    kind: PromotionKind.SIGNUP,
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: new Date("2027-01-01T00:00:00.000Z"),
    firstOrderOnly: true,
    requiresQualifyingPurchase: false,
    birthdayWindowBeforeDays: null,
    birthdayWindowAfterDays: null,
    birthdayLeapDayObservation: null,
    marketRules: [{
      marketCode: "US",
      currency: "USD",
      rateBps: 500,
      maximumDiscountMinor: BigInt(3_000),
      minimumEligibleSubtotalMinor: null,
      eligibilityTimeZone: null,
      market: { currency: "USD" },
    }],
  };
}

function birthdayPolicy(): ActivationPolicy {
  const base = signupPolicy();
  return {
    ...base,
    kind: PromotionKind.BIRTHDAY,
    firstOrderOnly: false,
    requiresQualifyingPurchase: true,
    birthdayWindowBeforeDays: 7,
    birthdayWindowAfterDays: 7,
    birthdayLeapDayObservation: BirthdayLeapDayObservation.FEB_28,
    marketRules: [{ ...base.marketRules[0], eligibilityTimeZone: "America/New_York" }],
  };
}
