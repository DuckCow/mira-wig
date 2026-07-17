import { createHash } from "crypto";
import {
  normalizeTossRefundEligibility,
  type NormalizedTossRefundEligibility,
} from "./refund-eligibility";

export const TOSS_REFUND_CONTACT_ELIGIBILITY_VERSION =
  "refund-toss-contact-eligibility/v1";
export const TOSS_REFUND_CONTACT_MAX_LOOKUP_AGE_MS = 10_000;

export type TossRefundContactEligibilityProofCandidate = Readonly<{
  paymentKey: string;
  method: "카드";
  easyPayPresent: false;
  currency: "KRW";
  providerStatus: "DONE";
  totalAmount: number;
  balanceAmount: number;
  taxFreeAmount: 0;
  taxExemptionAmount: 0;
  cancelsCount: 0;
  localReceivedAt: number;
  eligibilityFingerprint: string;
}>;

export type TossRefundContactFreshnessInput = Readonly<{
  localReceivedAt: number;
  phaseDCapturedAt: number;
}>;

/**
 * Builds candidate scalar data only. Durable provider provenance is established
 * later by the proof + contact-marker transaction, never by this value itself.
 */
export function buildTossRefundContactEligibilityProofCandidate(
  input: NormalizedTossRefundEligibility,
): TossRefundContactEligibilityProofCandidate {
  const normalized = normalizeTossRefundEligibility({
    ...input,
    localReceivedAt: new Date(input.localReceivedAt),
  });
  if (!normalized.ok) throw new Error("Toss contact eligibility input is invalid.");
  const facts = normalized.facts;
  return Object.freeze({
    ...facts,
    eligibilityFingerprint: fingerprintTossRefundContactEligibility(facts),
  });
}

export function serializeTossRefundContactEligibility(
  input: NormalizedTossRefundEligibility,
): string {
  const normalized = normalizeTossRefundEligibility({
    ...input,
    localReceivedAt: new Date(input.localReceivedAt),
  });
  if (!normalized.ok) throw new Error("Toss contact eligibility input is invalid.");
  const facts = normalized.facts;
  return JSON.stringify([
    TOSS_REFUND_CONTACT_ELIGIBILITY_VERSION,
    "TOSS",
    "SANDBOX",
    facts.paymentKey,
    facts.method,
    facts.easyPayPresent,
    facts.currency,
    facts.totalAmount,
    facts.balanceAmount,
    facts.taxFreeAmount,
    facts.taxExemptionAmount,
    facts.cancelsCount,
  ]);
}

export function fingerprintTossRefundContactEligibility(
  input: NormalizedTossRefundEligibility,
): string {
  return createHash("sha256")
    .update(serializeTossRefundContactEligibility(input), "utf8")
    .digest("hex");
}

/**
 * Validates age entirely in the database timestamp domain. localReceivedAt is
 * the conservative no-later-than DB timestamp captured before the lookup.
 */
export function isTossRefundContactEligibilityFresh(
  input: TossRefundContactFreshnessInput,
): boolean {
  if (!isSafeTimestamp(input.localReceivedAt) || !isSafeTimestamp(input.phaseDCapturedAt)) {
    return false;
  }
  if (input.localReceivedAt > input.phaseDCapturedAt) return false;
  return input.phaseDCapturedAt - input.localReceivedAt
    <= TOSS_REFUND_CONTACT_MAX_LOOKUP_AGE_MS;
}

function isSafeTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && Number.isFinite(value);
}
