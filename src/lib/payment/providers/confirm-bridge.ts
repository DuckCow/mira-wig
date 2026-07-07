import { PaymentAttemptStatus, Prisma } from "@prisma/client";
import type { PaymentProvider, PrismaClient } from "@prisma/client";
import type { CaptureFacts } from "@/lib/payment/complete";
import type {
  NormalizedProviderConfirmResult,
  ProviderConfirmFailed,
  ProviderConfirmSucceeded,
} from "./contract";
import type { PaymentConfirmFacts, PaymentConfirmResult } from "./types";

export type ProviderConfirmActionErrorCode =
  | "PROVIDER_RETRYABLE"
  | "PROVIDER_TERMINAL"
  | "PROVIDER_MANUAL_REVIEW"
  | "PROVIDER_STOP"
  | "PROVIDER_PROGRAMMER_ERROR";

export type ProviderConfirmMarkerCode =
  | "PROVIDER_CONFIRM_TERMINAL"
  | "PROVIDER_CONFIRM_MANUAL_REVIEW"
  | "PROVIDER_CONFIRM_STOP";

export type ProviderConfirmBridgeFailure = {
  success: false;
  errorCode: ProviderConfirmActionErrorCode;
  error: string;
  retryable: boolean;
};

export type ProviderConfirmBridgeResult =
  | { success: true; captureFacts: CaptureFacts }
  | ProviderConfirmBridgeFailure;

interface ProviderConfirmBridgeInput {
  client: PrismaClient;
  checkoutSessionId: string;
  paymentId: string;
  provider: PaymentProvider;
  result: PaymentConfirmResult;
  receivedAt: Date;
}

const PENDING_STATUSES = [PaymentAttemptStatus.INITIATED, PaymentAttemptStatus.AWAITING] as const;

export async function bridgeProviderConfirmResult(
  input: ProviderConfirmBridgeInput,
): Promise<ProviderConfirmBridgeResult> {
  const result = input.result;
  if (isPaymentConfirmFacts(result)) return legacySuccess(input, result);
  if (result.kind === "succeeded") return normalizedSuccess(input, result);
  return normalizedFailure(input.client, input.paymentId, result);
}

export function isNormalizedProviderConfirmResult(
  result: PaymentConfirmResult,
): result is NormalizedProviderConfirmResult {
  return "kind" in result && (result.kind === "succeeded" || result.kind === "failed");
}

function isPaymentConfirmFacts(result: PaymentConfirmResult): result is PaymentConfirmFacts {
  return !isNormalizedProviderConfirmResult(result);
}

function legacySuccess(
  input: ProviderConfirmBridgeInput,
  facts: PaymentConfirmFacts,
): ProviderConfirmBridgeResult {
  return {
    success: true,
    captureFacts: {
      ...facts,
      checkoutSessionId: input.checkoutSessionId,
      provider: input.provider,
      receivedAt: input.receivedAt,
    },
  };
}

function normalizedSuccess(
  input: ProviderConfirmBridgeInput,
  result: ProviderConfirmSucceeded,
): ProviderConfirmBridgeResult {
  return {
    success: true,
    captureFacts: {
      checkoutSessionId: input.checkoutSessionId,
      provider: input.provider,
      providerPaymentKey: result.providerPaymentKey,
      amount: result.amountMinor,
      currency: result.currency,
      capturedAt: result.capturedAt,
      receivedAt: input.receivedAt,
    },
  };
}

async function normalizedFailure(
  client: PrismaClient,
  paymentId: string,
  failure: ProviderConfirmFailed,
): Promise<ProviderConfirmBridgeFailure> {
  if (failure.classification === "RETRYABLE") return actionFailure("PROVIDER_RETRYABLE", true);
  if (failure.classification === "TERMINAL") {
    return markerOrInternal(await markTerminal(client, paymentId));
  }
  if (failure.classification === "MANUAL_REVIEW") {
    return markerOrInternal(await markPending(client, paymentId, "PROVIDER_CONFIRM_MANUAL_REVIEW"));
  }
  if (failure.classification === "STOP") {
    return markerOrInternal(await markPending(client, paymentId, "PROVIDER_CONFIRM_STOP"));
  }
  return actionFailure("PROVIDER_PROGRAMMER_ERROR", false);
}

async function markTerminal(client: PrismaClient, paymentId: string): Promise<ProviderConfirmBridgeFailure | null> {
  const result = await client.payment.updateMany({
    where: pendingPaymentWhere(paymentId),
    data: markerData("PROVIDER_CONFIRM_TERMINAL", PaymentAttemptStatus.FAILED),
  });
  if (result.count !== 1) return actionFailure("PROVIDER_PROGRAMMER_ERROR", false);
  return actionFailure("PROVIDER_TERMINAL", false);
}

async function markPending(
  client: PrismaClient,
  paymentId: string,
  code: Exclude<ProviderConfirmMarkerCode, "PROVIDER_CONFIRM_TERMINAL">,
): Promise<ProviderConfirmBridgeFailure | null> {
  const result = await client.payment.updateMany({
    where: pendingPaymentWhere(paymentId),
    data: markerData(code),
  });
  if (result.count !== 1) return actionFailure("PROVIDER_PROGRAMMER_ERROR", false);
  if (code === "PROVIDER_CONFIRM_MANUAL_REVIEW") return actionFailure("PROVIDER_MANUAL_REVIEW", false);
  return actionFailure("PROVIDER_STOP", false);
}

function markerOrInternal(result: ProviderConfirmBridgeFailure | null): ProviderConfirmBridgeFailure {
  return result ?? actionFailure("PROVIDER_PROGRAMMER_ERROR", false);
}

function pendingPaymentWhere(paymentId: string): Prisma.PaymentWhereInput {
  return {
    id: paymentId,
    providerPaymentKey: null,
    status: { in: [...PENDING_STATUSES] },
  };
}

function markerData(
  code: ProviderConfirmMarkerCode,
  status?: PaymentAttemptStatus,
): Prisma.PaymentUpdateManyMutationInput {
  const data: Prisma.PaymentUpdateManyMutationInput = {
    errorCode: code,
    errorMessage: markerMessage(code),
  };
  if (status) data.status = status;
  return data;
}

function actionFailure(
  errorCode: ProviderConfirmActionErrorCode,
  retryable: boolean,
): ProviderConfirmBridgeFailure {
  return { success: false, errorCode, error: actionMessage(errorCode), retryable };
}

function actionMessage(code: ProviderConfirmActionErrorCode): string {
  if (code === "PROVIDER_RETRYABLE") return "Payment provider is temporarily unavailable.";
  if (code === "PROVIDER_TERMINAL") return "Payment could not be approved.";
  if (code === "PROVIDER_MANUAL_REVIEW") return "Payment requires manual review.";
  if (code === "PROVIDER_STOP") return "Payment provider is temporarily unavailable.";
  return "Payment operation failed.";
}

function markerMessage(code: ProviderConfirmMarkerCode): string {
  if (code === "PROVIDER_CONFIRM_TERMINAL") return "Provider confirm ended with a terminal non-capture state.";
  if (code === "PROVIDER_CONFIRM_MANUAL_REVIEW") return "Provider confirm requires manual review.";
  return "Provider confirm stopped for operator configuration review.";
}
