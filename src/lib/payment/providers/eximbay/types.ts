import { EximbayProtocolError } from "./errors";
import { requireExactText } from "./validation";

const providerOrderCandidateBrand: unique symbol = Symbol("EximbayProviderOrderCandidate");
const providerOrderCandidateIdentities = new WeakMap<object, string>();

export type EximbayCurrency = "USD" | "JPY";
export type EximbayLanguage = "EN" | "JP";
export type EximbayPaymentMethod = "P000";
export type EximbayPaymentMode = "SANDBOX" | "LIVE";

export interface EximbayProviderOrderCandidate {
  readonly [providerOrderCandidateBrand]: true;
}

export function createEximbayProviderOrderCandidate(
  repositoryPaymentIdentity: unknown,
): EximbayProviderOrderCandidate {
  const paymentIdentity = requireExactText(repositoryPaymentIdentity, "INVALID_PAYMENT_IDENTITY");
  const candidate: EximbayProviderOrderCandidate = {
    [providerOrderCandidateBrand]: true,
  };
  Object.defineProperty(candidate, providerOrderCandidateBrand, { enumerable: false });
  providerOrderCandidateIdentities.set(candidate, paymentIdentity);
  return Object.freeze(candidate);
}

export function isEximbayProviderOrderCandidate(
  value: unknown,
): value is EximbayProviderOrderCandidate {
  if (typeof value !== "object" || value === null) return false;
  return providerOrderCandidateIdentities.has(value);
}

export function isEximbayProviderOrderCandidateForPayment(
  value: unknown,
  repositoryPaymentIdentity: unknown,
): value is EximbayProviderOrderCandidate {
  if (!isEximbayProviderOrderCandidate(value)) return false;
  if (typeof repositoryPaymentIdentity !== "string") return false;
  return providerOrderCandidateIdentities.get(value) === repositoryPaymentIdentity;
}

export function sameEximbayProviderOrderCandidate(
  left: EximbayProviderOrderCandidate,
  right: EximbayProviderOrderCandidate,
): boolean {
  if (!isEximbayProviderOrderCandidate(left)) return false;
  if (!isEximbayProviderOrderCandidate(right)) return false;
  return providerOrderCandidateIdentities.get(left) === providerOrderCandidateIdentities.get(right);
}

export function requireEximbayCurrency(value: unknown): EximbayCurrency {
  if (value === "USD" || value === "JPY") return value;
  throw new EximbayProtocolError("UNSUPPORTED_CURRENCY");
}

export function requireEximbayMode(value: unknown): EximbayPaymentMode {
  if (value === "SANDBOX" || value === "LIVE") return value;
  throw new EximbayProtocolError("INVALID_PAYMENT_MODE");
}
