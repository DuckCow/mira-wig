import "server-only";

import { db } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payment";
import type { WebhookResult } from "./types";
import type {
  NormalizedWebhookEvent,
  ValidationResult,
  WebhookParseResult,
  WebhookValidationInput,
  WebhookValidationStrategy,
} from "./webhook-handler";

type VerifiedWebhook = Extract<WebhookResult, { verified: true }>;
type RecoverableTossEvent = NormalizedWebhookEvent & {
  amount: number;
  currency: string;
  providerWebhookSecret: string;
};

const VALID: ValidationResult = { ok: true };

function hasIdentity(event: VerifiedWebhook): event is VerifiedWebhook & NormalizedWebhookEvent {
  return typeof event.eventId === "string" && event.eventId.length > 0
    && typeof event.orderId === "string"
    && typeof event.providerTransactionId === "string"
    && typeof event.status === "string";
}

function hasRecoveryFields(event: NormalizedWebhookEvent): event is RecoverableTossEvent {
  return typeof event.amount === "number"
    && typeof event.currency === "string"
    && typeof event.providerWebhookSecret === "string";
}

async function loadPaymentForVerification(event: NormalizedWebhookEvent) {
  return db.payment.findFirst({
    where: { orderId: event.orderId, providerTransactionId: event.providerTransactionId },
    orderBy: { createdAt: "desc" },
    select: { amount: true, currency: true, providerWebhookSecret: true },
  });
}

async function authorizeTossEvent(input: WebhookValidationInput): Promise<ValidationResult> {
  const { event } = input;
  const payment = await loadPaymentForVerification(event);
  if (!payment) return { ok: false, status: 401, error: "payment_not_found" };
  if (!payment.providerWebhookSecret) {
    console.error("TOSS_WEBHOOK_SECRET_MISSING", {
      orderId: event.orderId,
      providerTransactionId: event.providerTransactionId,
    });
    return { ok: false, status: 409, error: "missing_stored_secret" };
  }
  if (event.providerWebhookSecret !== payment.providerWebhookSecret) {
    return { ok: false, status: 401, error: "invalid_secret" };
  }
  if (!hasRecoveryFields(event)) return { ok: false, status: 400, error: "missing_recovery_fields" };
  if (event.amount !== payment.amount || event.currency !== payment.currency) {
    return { ok: false, status: 400, error: "amount_or_currency_mismatch" };
  }
  return VALID;
}

async function parseTossWebhook(input: {
  headers: Headers | Record<string, string>;
  rawBody: string;
}): Promise<WebhookParseResult> {
  const provider = getPaymentProvider("KR");
  if (!provider.handleWebhook) return { ok: false, status: 500, error: "toss_webhook_provider_unavailable" };
  const event = await provider.handleWebhook(input);
  if (!event.verified) return { ok: false, error: event.reason };
  if (!hasIdentity(event)) return { ok: false, error: "missing_webhook_identity" };
  return { ok: true, event };
}

export function tossWebhookStrategy(): WebhookValidationStrategy {
  return {
    provider: "toss",
    parse: parseTossWebhook,
    authenticateDelivery: () => Promise.resolve(VALID),
    authorizeEvent: authorizeTossEvent,
    toRecoveryInput(event) {
      if (event.status !== "DONE" || !hasRecoveryFields(event)) return null;
      return {
        orderId: event.orderId,
        paymentKey: event.providerTransactionId,
        amount: event.amount,
        currency: event.currency,
        status: event.status,
        provider: "toss",
        providerWebhookSecret: event.providerWebhookSecret,
      };
    },
  };
}
