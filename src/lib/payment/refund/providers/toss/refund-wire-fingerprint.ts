import { createHash } from "crypto";
import {
  normalizeTossRefundWireInput,
  TOSS_REFUND_CANCEL_REASON,
} from "./refund-wire-request";

export const TOSS_REFUND_WIRE_VERSION = "refund-provider-toss-wire/v1";

export function serializeTossRefundWireFingerprint(input: unknown): string {
  const facts = normalizeTossRefundWireInput(input);
  // The HTTP body owns a JSON number; the fingerprint deliberately owns decimal text.
  const canonicalAmount = String(facts.cancelAmount);
  return JSON.stringify([
    TOSS_REFUND_WIRE_VERSION,
    "TOSS",
    "SANDBOX",
    facts.paymentKey,
    "FULL",
    ["cancelAmount", canonicalAmount],
    TOSS_REFUND_CANCEL_REASON,
    ["taxFreeAmount", "ABSENT"],
    ["currency", "ABSENT"],
    facts.providerOperationKey,
  ]);
}

export function fingerprintTossRefundWireRequest(input: unknown): string {
  return createHash("sha256")
    .update(serializeTossRefundWireFingerprint(input), "utf8")
    .digest("hex");
}
