"use server";

import {
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentProvider,
  PaymentRemediationStatus,
  Prisma,
} from "@prisma/client";
import type { CheckoutSession, Payment } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { completeFromCapture } from "@/lib/payment/complete";
import type { CaptureFacts, CompleteFromCaptureResult } from "@/lib/payment/complete";
import {
  type InitiatePaymentAttemptExecution,
  initiatePaymentAttemptWithTransientAuthority,
  PaymentInitiateException,
} from "@/lib/payment/attempt/initiate";
import { materializeFreshEximbayReadyHandoff } from "@/lib/payment/eximbay/sdk-handoff";
import type { EximbayReadyHandoffV1 } from "@/lib/payment/eximbay/sdk-handoff-contract";
import {
  hasSessionSuspensionCycle,
  hasUnresolvedSessionExposure,
} from "@/lib/payment/remediation";
import { bridgeProviderConfirmResult, type ProviderConfirmActionErrorCode } from "@/lib/payment/providers/confirm-bridge";
import type { PaymentMethod } from "@/lib/payment/providers/routing";
import type { PaymentConfirmationProvider, PaymentInitiateResult } from "@/lib/payment/providers/types";
import {
  resolveActionConfirmAdapter,
  resolveActionMode,
  resolveActionProvider,
} from "./payment-provider-boundary";

type ActionSession = Pick<CheckoutSession, "id" | "userId" | "marketCode" | "totalAmount" | "currency">;
type PaymentActionFailure = {
  kind: "FAILED";
  success: false;
  errorCode: PaymentActionErrorCode;
  error: string;
  retryable: boolean;
};
type PaymentActionBoundedKind = "IN_PROGRESS" | "OUTCOME_UNKNOWN" | "REMEDIATION_REQUIRED";
type PaymentActionBoundedState = {
  [Kind in PaymentActionBoundedKind]: {
  kind: Kind;
  success: false;
  errorCode: PaymentActionErrorCode;
  error: string;
  retryable: boolean;
  paymentId?: string;
  }
}[PaymentActionBoundedKind];
type PaymentActionNonSuccess = PaymentActionFailure | PaymentActionBoundedState;
type BoundaryResult =
  | { success: true; userId: string; session: ActionSession }
  | PaymentActionFailure;
type ActionProviderConfirmResult = { success: true; captureFacts: CaptureFacts } | PaymentActionNonSuccess;
type PendingConfirmPayment = Pick<
  Payment,
  | "id"
  | "provider"
  | "providerRef"
  | "providerConfirmIdempotencyKey"
  | "mode"
  | "adapterExecutionKind"
  | "routingRuleId"
>;
type PendingConfirmPaymentWithKey = PendingConfirmPayment & { providerConfirmIdempotencyKey: string };
type ConfirmAttemptResult = { success: true; payment: PendingConfirmPaymentWithKey } | PaymentActionNonSuccess;

export interface ConfirmPaymentInput {
  providerPaymentKey?: string;
  method?: PaymentMethod;
}

export interface InitiatePaymentInput {
  method?: PaymentMethod;
}

export type PaymentActionResult =
  | { kind: "READY"; success: true; orderId?: string; paymentId: string; provider: PaymentProvider }
  | { kind: "REDIRECT"; success: true; orderId?: string; paymentId: string; provider: PaymentProvider; redirectTo: string }
  | PaymentActionNonSuccess;

type FreshEximbayReadyActionResult =
  Extract<PaymentActionResult, { kind: "READY"; success: true }> & {
    readonly provider: typeof PaymentProvider.EXIMBAY;
  };

export type InitiatePaymentActionResult =
  | Readonly<{
      channel: "DURABLE_ONLY";
      durable: PaymentActionResult;
    }>
  | Readonly<{
      channel: "FRESH_EXIMBAY_READY";
      durable: FreshEximbayReadyActionResult;
      transientHandoff: EximbayReadyHandoffV1;
    }>;

export type PaymentActionErrorCode =
  | "UNAUTHORIZED"
  | "SESSION_UNAVAILABLE"
  | "SESSION_NOT_USABLE"
  | "SESSION_TERMS_STALE"
  | "SESSION_REMEDIATION_REQUIRED"
  | "ATTEMPT_IN_PROGRESS"
  | "ATTEMPT_SUPERSEDED"
  | "ATTEMPT_OUTCOME_UNKNOWN"
  | "ATTEMPT_STATE_CONFLICT"
  | "PROVIDER_INVALID"
  | "PROVIDER_MISMATCH"
  | "PROVIDER_UNAVAILABLE"
  | "PAYMENT_UNAVAILABLE"
  | ProviderConfirmActionErrorCode
  | "COMPLETION_RETRYABLE"
  | "PAYMENT_FAILED";

const PUBLIC_PAYMENT_ERROR_MESSAGES: Record<PaymentActionErrorCode, string> = {
  UNAUTHORIZED: "Login is required.",
  SESSION_UNAVAILABLE: "Checkout session is unavailable.",
  SESSION_NOT_USABLE: "Checkout session is not usable.",
  SESSION_TERMS_STALE: "Checkout terms changed. Please create a new checkout session.",
  SESSION_REMEDIATION_REQUIRED: "This checkout session has a payment issue that requires review.",
  ATTEMPT_IN_PROGRESS: "Payment initiation is still being processed.",
  ATTEMPT_SUPERSEDED: "The previous payment attempt is no longer available.",
  ATTEMPT_OUTCOME_UNKNOWN: "The payment outcome is unresolved and requires review.",
  ATTEMPT_STATE_CONFLICT: "Another payment attempt is already in progress.",
  PROVIDER_INVALID: "Payment provider is invalid.",
  PROVIDER_MISMATCH: "Payment provider does not match this checkout.",
  PROVIDER_UNAVAILABLE: "No payment provider is available.",
  PAYMENT_UNAVAILABLE: "Pending payment attempt is unavailable.",
  PROVIDER_RETRYABLE: "Payment provider is temporarily unavailable.",
  PROVIDER_TERMINAL: "Payment could not be approved.",
  PROVIDER_MANUAL_REVIEW: "Payment requires manual review.",
  PROVIDER_STOP: "Payment provider is temporarily unavailable.",
  PROVIDER_PROGRAMMER_ERROR: "Payment operation failed.",
  COMPLETION_RETRYABLE: "Payment completion is still being processed.",
  PAYMENT_FAILED: "Payment could not be completed.",
};

export async function initiatePayment(
  checkoutSessionId: string,
  input: InitiatePaymentInput = {},
): Promise<InitiatePaymentActionResult> {
  try {
    const prepared = await prepareInitiationAction(checkoutSessionId, input);
    if (!prepared.success) return durableAction(prepared.durable);
    return await translateInitiationExecution(prepared.execution);
  } catch (e) {
    if (e instanceof PaymentInitiateException) return durableAction(initiateError(e));
    return durableAction(actionError("PAYMENT_FAILED", false));
  }
}

async function prepareInitiationAction(
  checkoutSessionId: string,
  input: InitiatePaymentInput,
): Promise<
  | Readonly<{ success: true; execution: InitiatePaymentAttemptExecution }>
  | Readonly<{ success: false; durable: PaymentActionResult }>
> {
  const boundary = await resolveBoundary(checkoutSessionId);
  if (!boundary.success) return { success: false, durable: boundary };
  const provider = resolveActionProvider(boundary.session, boundary.session.marketCode, input.method);
  if (!provider.success) {
    return { success: false, durable: actionError(provider.errorCode, provider.retryable) };
  }
  const execution = await initiatePaymentAttemptWithTransientAuthority(db, {
    sessionId: checkoutSessionId,
    userId: boundary.userId,
    adapterContext: provider.adapterContext,
  });
  return { success: true, execution };
}

async function translateInitiationExecution(
  execution: InitiatePaymentAttemptExecution,
): Promise<InitiatePaymentActionResult> {
  const durable = initiateSuccess(
    execution.durable.paymentId,
    execution.durable.provider,
    execution.durable.initiateResult,
  );
  if (execution.channel === "DURABLE_ONLY") return durableAction(durable);
  if (durable.kind !== "READY" || durable.provider !== PaymentProvider.EXIMBAY) {
    return durableAction(durable);
  }
  try {
    const transientHandoff = await materializeFreshEximbayReadyHandoff(
      execution.durable.paymentId,
      execution.freshAuthority,
    );
    if (transientHandoff.paymentId !== durable.paymentId) return durableAction(durable);
    const freshDurable: FreshEximbayReadyActionResult = Object.freeze({
      ...durable,
      provider: PaymentProvider.EXIMBAY,
    });
    return Object.freeze({
      channel: "FRESH_EXIMBAY_READY",
      durable: freshDurable,
      transientHandoff,
    });
  } catch {
    return durableAction(durable);
  }
}

export async function confirmPayment(
  checkoutSessionId: string,
  input: ConfirmPaymentInput = {},
): Promise<PaymentActionResult> {
  try {
    const boundary = await resolveBoundary(checkoutSessionId);
    if (!boundary.success) return boundary;
    const mode = resolveActionMode();
    if (!mode.success) return actionError(mode.errorCode, mode.retryable);
    const payment = await prepareConfirmPayment(boundary.session.id, mode.mode);
    if (!payment.success) return payment;
    const provider = resolveActionConfirmAdapter({
      session: boundary.session,
      marketCode: boundary.session.marketCode,
      method: input.method,
      payment: payment.payment,
    });
    if (!provider.success) return actionError(provider.errorCode, provider.retryable);
    const facts = await confirmWithProvider(provider.provider, boundary.session, payment.payment, input);
    if (!facts.success) return facts;
    return completeConfirmedPayment(facts.captureFacts);
  } catch {
    return actionError("PAYMENT_FAILED", false);
  }
}

async function resolveBoundary(
  checkoutSessionId: string,
): Promise<BoundaryResult> {
  const session = await getSession();
  if (!session?.user.id) return actionError("UNAUTHORIZED", false);

  const checkoutSession = await loadActionSession(checkoutSessionId);
  if (!checkoutSession || checkoutSession.userId !== session.user.id) {
    return actionError("SESSION_UNAVAILABLE", false);
  }
  return {
    success: true as const,
    userId: session.user.id,
    session: checkoutSession,
  };
}

async function loadActionSession(sessionId: string): Promise<ActionSession | null> {
  return db.checkoutSession.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true, marketCode: true, totalAmount: true, currency: true },
  });
}

async function confirmWithProvider(
  provider: PaymentConfirmationProvider,
  session: ActionSession,
  payment: PendingConfirmPaymentWithKey,
  input: ConfirmPaymentInput,
): Promise<ActionProviderConfirmResult> {
  try {
    const result = await provider.confirm({
      checkoutSessionId: session.id,
      paymentId: payment.id,
      provider: provider.code,
      providerPaymentKey: input.providerPaymentKey,
      providerRef: payment.providerRef ?? undefined,
      providerConfirmIdempotencyKey: payment.providerConfirmIdempotencyKey,
      amount: session.totalAmount,
      currency: session.currency,
    });
    const bridged = await bridgeProviderConfirmResult({
      client: db,
      checkoutSessionId: session.id,
      paymentId: payment.id,
      provider: provider.code,
      mode: payment.mode,
      result,
      receivedAt: new Date(),
    });
    if (bridged.success) return bridged;
    if (bridged.errorCode === "PROVIDER_TERMINAL" || bridged.errorCode === "PROVIDER_PROGRAMMER_ERROR") {
      return actionError(bridged.errorCode, bridged.retryable);
    }
    return boundedState("OUTCOME_UNKNOWN", bridged.errorCode, bridged.retryable, payment.id);
  } catch {
    await markConfirmOutcomeUnknown(payment.id);
    return boundedState(
      "OUTCOME_UNKNOWN",
      "PROVIDER_RETRYABLE",
      true,
      payment.id,
    );
  }
}

async function markConfirmOutcomeUnknown(paymentId: string): Promise<void> {
  await db.payment.updateMany({
    where: {
      id: paymentId,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      blockingEndedAt: null,
      providerPaymentKey: null,
    },
    data: {
      attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
      errorCode: "PROVIDER_CONFIRM_OUTCOME_UNKNOWN",
      errorMessage: "Provider confirm outcome is unresolved.",
    },
  });
}

async function prepareConfirmPayment(
  checkoutSessionId: string,
  mode: PendingConfirmPayment["mode"],
): Promise<ConfirmAttemptResult> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "CheckoutSession"
      WHERE "id" = ${checkoutSessionId}
      FOR UPDATE
    `);
    if (await hasUnresolvedSessionExposure(tx, checkoutSessionId)
      || await hasSessionSuspensionCycle(tx, checkoutSessionId)) {
      return boundedState(
        "REMEDIATION_REQUIRED",
        "SESSION_REMEDIATION_REQUIRED",
        false,
      );
    }
    const payments = await tx.payment.findMany({
      where: pendingConfirmWhere(checkoutSessionId),
      orderBy: { createdAt: "desc" },
      take: 2,
      select: pendingConfirmSelect(),
    });
    if (payments.length === 0) {
      return classifyUnavailableConfirm(tx, checkoutSessionId);
    }
    if (payments.length > 1) {
      return actionError("PAYMENT_UNAVAILABLE", false);
    }
    if (payments[0].mode !== mode) return actionError("PAYMENT_UNAVAILABLE", false);
    if (payments[0].adapterExecutionKind === null) return actionError("PAYMENT_UNAVAILABLE", false);
    return ensureConfirmIdempotencyKey(tx, checkoutSessionId, payments[0]);
  });
}

async function classifyUnavailableConfirm(
  tx: Prisma.TransactionClient,
  checkoutSessionId: string,
): Promise<PaymentActionNonSuccess> {
  const payment = await tx.payment.findFirst({
    where: {
      checkoutSessionId,
      providerPaymentKey: null,
      remediationStatus: PaymentRemediationStatus.NONE,
      blockingEndedAt: null,
      status: { in: [PaymentAttemptStatus.INITIATED, PaymentAttemptStatus.AWAITING] },
      attemptLifecycle: {
        in: [PaymentAttemptLifecycle.CONTACTED, PaymentAttemptLifecycle.OUTCOME_UNKNOWN],
      },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, attemptLifecycle: true, initiationOutputKind: true },
  });
  if (payment?.attemptLifecycle === PaymentAttemptLifecycle.OUTCOME_UNKNOWN) {
    return boundedState(
      "OUTCOME_UNKNOWN",
      "ATTEMPT_OUTCOME_UNKNOWN",
      false,
      payment.id,
    );
  }
  if (payment?.attemptLifecycle === PaymentAttemptLifecycle.CONTACTED
    && payment.initiationOutputKind === null) {
    return boundedState(
      "IN_PROGRESS",
      "ATTEMPT_IN_PROGRESS",
      false,
      payment.id,
    );
  }
  return actionError("PAYMENT_UNAVAILABLE", false);
}

async function ensureConfirmIdempotencyKey(
  tx: Prisma.TransactionClient,
  checkoutSessionId: string,
  payment: PendingConfirmPayment,
): Promise<ConfirmAttemptResult> {
  if (payment.providerConfirmIdempotencyKey) {
    return { success: true, payment: withConfirmKey(payment, payment.providerConfirmIdempotencyKey) };
  }

  const key = confirmIdempotencyKey(payment.provider, payment.id);
  const result = await tx.payment.updateMany({
    where: {
      id: payment.id,
      ...pendingConfirmWhere(checkoutSessionId),
      providerConfirmIdempotencyKey: null,
    },
    data: { providerConfirmIdempotencyKey: key },
  });
  if (result.count === 1) return { success: true, payment: withConfirmKey(payment, key) };
  return reuseConcurrentConfirmKey(tx, checkoutSessionId, payment.id);
}

async function reuseConcurrentConfirmKey(
  tx: Prisma.TransactionClient,
  checkoutSessionId: string,
  paymentId: string,
): Promise<ConfirmAttemptResult> {
  const payment = await tx.payment.findFirst({
    where: { id: paymentId, ...pendingConfirmWhere(checkoutSessionId) },
    select: pendingConfirmSelect(),
  });
  if (payment?.providerConfirmIdempotencyKey) {
    return { success: true, payment: withConfirmKey(payment, payment.providerConfirmIdempotencyKey) };
  }
  return actionError("PAYMENT_UNAVAILABLE", false);
}

function withConfirmKey(payment: PendingConfirmPayment, providerConfirmIdempotencyKey: string): PendingConfirmPaymentWithKey {
  return { ...payment, providerConfirmIdempotencyKey };
}

function pendingConfirmWhere(checkoutSessionId: string) {
  return {
    checkoutSessionId,
    providerPaymentKey: null,
    attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
    remediationStatus: PaymentRemediationStatus.NONE,
    blockingEndedAt: null,
    initiationOutputKind: { not: null },
    status: { in: [PaymentAttemptStatus.INITIATED, PaymentAttemptStatus.AWAITING] },
  };
}

function pendingConfirmSelect() {
  return {
    id: true,
    provider: true,
    providerRef: true,
    providerConfirmIdempotencyKey: true,
    mode: true,
    adapterExecutionKind: true,
    routingRuleId: true,
  };
}

function confirmIdempotencyKey(provider: PaymentProvider, paymentId: string): string {
  return `confirm:${provider}:${paymentId}`;
}

async function completeConfirmedPayment(facts: CaptureFacts): Promise<PaymentActionResult> {
  try {
    return translateCompletion(await completeFromCapture(db, facts), facts.provider);
  } catch {
    return actionError("COMPLETION_RETRYABLE", true);
  }
}

function translateCompletion(result: CompleteFromCaptureResult, provider: PaymentProvider): PaymentActionResult {
  if (result.kind === "completed" || result.kind === "alreadyCompleted") {
    return { kind: "READY", success: true, orderId: result.orderId, paymentId: result.paymentId, provider };
  }
  if (result.kind === "compensationEnqueued" || result.kind === "compensationSkipped") {
    return actionError("PAYMENT_FAILED", false);
  }
  return actionError("COMPLETION_RETRYABLE", true);
}

function initiateSuccess(
  paymentId: string,
  provider: PaymentProvider,
  result: PaymentInitiateResult,
): PaymentActionResult {
  if (result.kind === "redirect") {
    return { kind: "REDIRECT", success: true, paymentId, provider, redirectTo: result.approveUrl };
  }
  if (result.kind === "inProgress") {
    return boundedState(
      "IN_PROGRESS",
      "ATTEMPT_IN_PROGRESS",
      false,
      paymentId,
    );
  }
  return { kind: "READY", success: true, paymentId, provider };
}

function initiateError(e: PaymentInitiateException): PaymentActionResult {
  if (e.code === "ATTEMPT_OUTCOME_UNKNOWN") {
    return boundedState("OUTCOME_UNKNOWN", e.code, false);
  }
  if (e.code === "SESSION_REMEDIATION_REQUIRED") {
    return boundedState("REMEDIATION_REQUIRED", e.code, false);
  }
  return actionError(e.code, false);
}

function durableAction(durable: PaymentActionResult): InitiatePaymentActionResult {
  return Object.freeze({ channel: "DURABLE_ONLY", durable });
}

function actionError(errorCode: PaymentActionErrorCode, retryable: boolean): PaymentActionFailure {
  return { kind: "FAILED", success: false, errorCode, error: PUBLIC_PAYMENT_ERROR_MESSAGES[errorCode], retryable };
}

function boundedState(
  kind: PaymentActionBoundedKind,
  errorCode: PaymentActionErrorCode,
  retryable: boolean,
  paymentId?: string,
): PaymentActionBoundedState {
  return {
    kind,
    success: false,
    errorCode,
    error: PUBLIC_PAYMENT_ERROR_MESSAGES[errorCode],
    retryable,
    paymentId,
  };
}
