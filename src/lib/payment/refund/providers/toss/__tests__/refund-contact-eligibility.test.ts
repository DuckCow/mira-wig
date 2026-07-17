import { createHash } from "crypto";
import { isDeepStrictEqual } from "util";
import { describe, expect, it } from "vitest";
import {
  fingerprintTossRefundEligibility,
  type NormalizedTossRefundEligibility,
} from "../refund-eligibility";
import {
  buildTossRefundContactEligibilityProofCandidate,
  fingerprintTossRefundContactEligibility,
  isTossRefundContactEligibilityFresh,
  serializeTossRefundContactEligibility,
  TOSS_REFUND_CONTACT_ELIGIBILITY_VERSION,
  TOSS_REFUND_CONTACT_MAX_LOOKUP_AGE_MS,
} from "../refund-contact-eligibility";

const FIXED_PREIMAGE =
  '["refund-toss-contact-eligibility/v1","TOSS","SANDBOX","toss-payment-1","카드",false,"KRW",85000,85000,0,0,0]';
const FIXED_DIGEST = "7fe015bd67ff0667fcf0d3ad3cd787910d61a8045eb2d15b84ed7c64cc317f58";

describe("Toss contact-time eligibility proof candidate", () => {
  it("copies only the exact normalized scalar facts into a frozen candidate", () => {
    const candidate = buildTossRefundContactEligibilityProofCandidate(eligibleFacts());

    expect(isDeepStrictEqual(Object.keys(candidate), [
      "paymentKey", "method", "easyPayPresent", "currency", "providerStatus",
      "totalAmount", "balanceAmount", "taxFreeAmount", "taxExemptionAmount",
      "cancelsCount", "localReceivedAt", "eligibilityFingerprint",
    ])).toBe(true);
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(candidate.localReceivedAt === eligibleFacts().localReceivedAt).toBe(true);
  });

  it("pins the contact-specific version, exact preimage, and independently recomputed digest", () => {
    const preimage = serializeTossRefundContactEligibility(eligibleFacts());
    const independentDigest = createHash("sha256").update(preimage, "utf8").digest("hex");

    expect(TOSS_REFUND_CONTACT_ELIGIBILITY_VERSION
      === "refund-toss-contact-eligibility/v1").toBe(true);
    expect(preimage === FIXED_PREIMAGE).toBe(true);
    expect(independentDigest === FIXED_DIGEST).toBe(true);
    expect(fingerprintTossRefundContactEligibility(eligibleFacts()) === FIXED_DIGEST).toBe(true);
  });

  it("differs from authorization-time authority solely through the versioned context", () => {
    const facts = eligibleFacts();
    const authorizationFingerprint = fingerprintTossRefundEligibility({
      ...facts,
      localReceivedAt: new Date(facts.localReceivedAt),
    });

    expect(fingerprintTossRefundContactEligibility(facts)
      === authorizationFingerprint).toBe(false);
  });

  it("excludes timestamp, dispatch identity, and credential labels from the fingerprint", () => {
    const first = eligibleFacts({ localReceivedAt: 1_000 });
    const second = eligibleFacts({ localReceivedAt: 9_000 });
    const firstSerialized = serializeTossRefundContactEligibility(first);
    const secondSerialized = serializeTossRefundContactEligibility(second);

    expect(firstSerialized === secondSerialized).toBe(true);
    expect(firstSerialized.includes("dispatchAttemptId")).toBe(false);
    expect(firstSerialized.includes("merchantAccountBindingId")).toBe(false);
    expect(firstSerialized.includes("credentialGenerationBindingId")).toBe(false);
  });
});

describe("Toss contact-time conservative no-later-than DB timestamp freshness", () => {
  it("treats negative zero exactly as zero", () => {
    expect(Object.is(-0, 0)).toBe(false);
    expect(isTossRefundContactEligibilityFresh({
      localReceivedAt: 50_000,
      phaseDCapturedAt: 50_000 + -0,
    })).toBe(true);
  });

  it.each([
    [0, true],
    [TOSS_REFUND_CONTACT_MAX_LOOKUP_AGE_MS, true],
    [TOSS_REFUND_CONTACT_MAX_LOOKUP_AGE_MS + 1, false],
  ])("classifies an age of %i ms", (age, expected) => {
    expect(isTossRefundContactEligibilityFresh({
      localReceivedAt: 50_000,
      phaseDCapturedAt: 50_000 + age,
    }) === expected).toBe(true);
  });

  it("rejects a future conservative no-later-than DB timestamp", () => {
    expect(isTossRefundContactEligibilityFresh({
      localReceivedAt: 50_001,
      phaseDCapturedAt: 50_000,
    })).toBe(false);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects unsafe or noninteger timestamp %s",
    (value) => {
      expect(isTossRefundContactEligibilityFresh({
        localReceivedAt: value,
        phaseDCapturedAt: 50_000,
      })).toBe(false);
      expect(isTossRefundContactEligibilityFresh({
        localReceivedAt: 50_000,
        phaseDCapturedAt: value,
      })).toBe(false);
    },
  );
});

function eligibleFacts(
  overrides: Partial<NormalizedTossRefundEligibility> = {},
): NormalizedTossRefundEligibility {
  return {
    paymentKey: "toss-payment-1",
    method: "카드" as const,
    easyPayPresent: false as const,
    currency: "KRW" as const,
    providerStatus: "DONE" as const,
    totalAmount: 85_000,
    balanceAmount: 85_000,
    taxFreeAmount: 0 as const,
    taxExemptionAmount: 0 as const,
    cancelsCount: 0 as const,
    localReceivedAt: Date.parse("2026-07-17T00:00:00.123Z"),
    ...overrides,
  };
}
