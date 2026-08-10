import type { TrustedEximbayCompletionCandidate } from "./trusted-facts";

export type EximbayDuplicateClassification = "EXACT_REPLAY" | "CONFLICT" | "DISTINCT";

export function compareTrustedEximbayFacts(
  left: TrustedEximbayCompletionCandidate,
  right: TrustedEximbayCompletionCandidate,
): EximbayDuplicateClassification {
  if (left.transactionId !== right.transactionId) return "DISTINCT";
  if (sameAuthorityFacts(left, right)) return "EXACT_REPLAY";
  return "CONFLICT";
}

function sameAuthorityFacts(
  left: TrustedEximbayCompletionCandidate,
  right: TrustedEximbayCompletionCandidate,
): boolean {
  return left.providerOrderId === right.providerOrderId
    && left.mid === right.mid
    && left.transactionType === right.transactionType
    && left.currency === right.currency
    && left.amountMinor === right.amountMinor
    && left.rescode === right.rescode
    && left.status === right.status;
}
