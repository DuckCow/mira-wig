"use server";

import { PaymentProvider } from "@prisma/client";
import type { CheckoutSession } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentMarketCode } from "@/lib/market/resolve";
import { getSession } from "@/lib/session";
import { completeFromCapture } from "@/lib/payment/complete";
import type { CaptureFacts, CompleteFromCaptureResult } from "@/lib/payment/complete";
import { initiatePaymentAttempt, PaymentInitiateException } from "@/lib/payment/attempt/initiate";
import { resolveProvider } from "@/lib/payment/providers/resolve";
import { providerForMarket } from "@/lib/payment/providers/routing";
import type { PaymentProvider as PaymentProviderPort } from "@/lib/payment/providers/types";

type ActionSession = Pick<CheckoutSession, "id" | "userId" | "marketCode" | "totalAmount" | "currency">;
type PaymentActionFailure = { success: false; errorCode: PaymentActionErrorCode; error: string; retryable: boolean };
type BoundaryResult =
  | { success: true; userId: string; session: ActionSession; provider: PaymentProvider }
  | PaymentActionFailure;
type ProviderConfirmResult = { success: true; captureFacts: CaptureFacts } | PaymentActionFailure;

export interface ConfirmPaymentInput {
  providerPaymentKey?: string;
}

export type PaymentActionResult =
  | { success: true; orderId?: string; paymentId: string; provider: PaymentProvider; redirectTo?: string }
  | PaymentActionFailure;

export type PaymentActionErrorCode =
  | "UNAUTHORIZED"
  | "SESSION_UNAVAILABLE"
  | "SESSION_NOT_USABLE"
  | "PROVIDER_INVALID"
  | "PROVIDER_MISMATCH"
  | "PROVIDER_RETRYABLE"
  | "COMPLETION_RETRYABLE"
  | "PAYMENT_FAILED";

export async function initiatePayment(checkoutSessionId: string): Promise<PaymentActionResult> {
  const boundary = await resolveBoundary(checkoutSessionId);
  if (!boundary.success) return boundary;

  const provider = resolveProvider(boundary.provider);
  try {
    const result = await initiatePaymentAttempt(db, {
      sessionId: checkoutSessionId,
      userId: boundary.userId,
      provider,
    });
    return initiateSuccess(result.paymentId, result.provider, result.initiateResult);
  } catch (e) {
    if (e instanceof PaymentInitiateException) return initiateError(e);
    throw e;
  }
}

export async function confirmPayment(
  checkoutSessionId: string,
  providerValue: string,
  input: ConfirmPaymentInput = {},
): Promise<PaymentActionResult> {
  const parsed = parseProvider(providerValue);
  if (!parsed) return actionError("PROVIDER_INVALID", "Payment provider is invalid.", false);
  const boundary = await resolveBoundary(checkoutSessionId);
  if (!boundary.success) return boundary;
  if (parsed !== boundary.provider) return actionError("PROVIDER_MISMATCH", "Payment provider does not match market.", false);

  const provider = resolveProvider(parsed);
  const facts = await confirmWithProvider(provider, boundary.session, input);
  if (!facts.success) return facts;
  return completeConfirmedPayment(facts.captureFacts);
}

async function resolveBoundary(checkoutSessionId: string): Promise<BoundaryResult> {
  const session = await getSession();
  if (!session?.user.id) return actionError("UNAUTHORIZED", "Login is required.", false);

  const marketCode = await getCurrentMarketCode();
  const checkoutSession = await loadActionSession(checkoutSessionId);
  if (!checkoutSession || checkoutSession.userId !== session.user.id) {
    return actionError("SESSION_UNAVAILABLE", "Checkout session is unavailable.", false);
  }
  if (checkoutSession.marketCode !== marketCode) {
    return actionError("SESSION_UNAVAILABLE", "Checkout session is unavailable.", false);
  }
  return { success: true as const, userId: session.user.id, session: checkoutSession, provider: providerForMarket(marketCode) };
}

async function loadActionSession(sessionId: string): Promise<ActionSession | null> {
  return db.checkoutSession.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true, marketCode: true, totalAmount: true, currency: true },
  });
}

async function confirmWithProvider(
  provider: PaymentProviderPort,
  session: ActionSession,
  input: ConfirmPaymentInput,
): Promise<ProviderConfirmResult> {
  try {
    const facts = await provider.confirm({
      checkoutSessionId: session.id,
      provider: provider.code,
      providerPaymentKey: input.providerPaymentKey,
      amount: session.totalAmount,
      currency: session.currency,
    });
    return { success: true, captureFacts: { ...facts, checkoutSessionId: session.id, provider: provider.code, receivedAt: new Date() } };
  } catch (e) {
    return actionError("PROVIDER_RETRYABLE", errorMessage(e), true);
  }
}

async function completeConfirmedPayment(facts: CaptureFacts): Promise<PaymentActionResult> {
  try {
    return translateCompletion(await completeFromCapture(db, facts), facts.provider);
  } catch (e) {
    return actionError("COMPLETION_RETRYABLE", errorMessage(e), true);
  }
}

function translateCompletion(result: CompleteFromCaptureResult, provider: PaymentProvider): PaymentActionResult {
  if (result.kind === "completed" || result.kind === "alreadyCompleted") {
    return { success: true, orderId: result.orderId, paymentId: result.paymentId, provider };
  }
  if (result.kind === "compensationEnqueued") {
    return actionError("PAYMENT_FAILED", result.failure.message, false);
  }
  return actionError("COMPLETION_RETRYABLE", result.message, true);
}

function initiateSuccess(
  paymentId: string,
  provider: PaymentProvider,
  result: { kind: "ready" } | { kind: "redirect"; approveUrl?: string },
): PaymentActionResult {
  if (result.kind === "redirect") return { success: true, paymentId, provider, redirectTo: result.approveUrl };
  return { success: true, paymentId, provider };
}

function initiateError(e: PaymentInitiateException): PaymentActionResult {
  return actionError(e.code, e.message, false);
}

function parseProvider(value: string): PaymentProvider | null {
  if (value === PaymentProvider.MOCK) return PaymentProvider.MOCK;
  if (value === PaymentProvider.TOSS) return PaymentProvider.TOSS;
  if (value === PaymentProvider.PAYPAL) return PaymentProvider.PAYPAL;
  return null;
}

function actionError(
  errorCode: PaymentActionErrorCode,
  error: string,
  retryable: boolean,
): PaymentActionFailure {
  return { success: false, errorCode, error, retryable };
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Payment operation failed.";
}
