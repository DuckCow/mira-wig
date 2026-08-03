import {
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentProvider,
  PaymentRemediationOperation,
  PaymentRemediationStatus,
} from "@prisma/client";
import type { Payment, Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import type { OutboxHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxTerminalFailed } from "@/lib/payment/outbox";
import { createMockVoidExecutor, type VoidExecutor } from "./executor";

export const VOID_TOPIC = "pg.void";

export type VoidTransitionPayment = Pick<
  Payment,
  | "id"
  | "provider"
  | "providerPaymentKey"
  | "status"
  | "attemptLifecycle"
  | "remediationStatus"
  | "remediationOperation"
  | "remediationResultRef"
  | "remediatedAt"
  | "suspendedByPaymentId"
  | "blockingEndedAt"
>;
type VoidPayment = VoidTransitionPayment;
type VoidTransition = (payment: VoidTransitionPayment, resultRef: string) => Promise<number>;

export interface VoidPayload {
  paymentId: string;
  provider: PaymentProvider;
  providerPaymentKey: string;
  reason: string;
}

export interface VoidHandlerOptions {
  executor?: VoidExecutor;
  transitionPayment?: VoidTransition;
}

export const handleVoid: OutboxHandler = createVoidHandler(db);

export function createVoidHandler(
  client: PrismaClient,
  options: VoidHandlerOptions = {},
): OutboxHandler {
  return (payload, ctx) => handleVoidWith(client, parsePayload(payload), ctx, options);
}

async function handleVoidWith(
  client: PrismaClient,
  payload: VoidPayload,
  ctx: OutboxHandlerContext,
  options: VoidHandlerOptions,
): Promise<OutboxHandlerResult> {
  const payment = await loadPayment(client, payload.paymentId);
  if (!payment) return;
  if (payment.status === PaymentAttemptStatus.VOIDED) return;
  if (payment.status !== PaymentAttemptStatus.SUCCEEDED) return;
  if (!matchesPayload(payment, payload)) return terminalMismatch(payload);

  const resultRef = operationKey(payload, ctx);
  await executeVoid(options.executor ?? createMockVoidExecutor(), payload, resultRef);
  await transitionVoided(payment, resultRef, options.transitionPayment ?? defaultTransition(client));
}

async function loadPayment(client: PrismaClient, paymentId: string): Promise<VoidPayment | null> {
  return client.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      provider: true,
      providerPaymentKey: true,
      status: true,
      attemptLifecycle: true,
      remediationStatus: true,
      remediationOperation: true,
      remediationResultRef: true,
      remediatedAt: true,
      suspendedByPaymentId: true,
      blockingEndedAt: true,
    },
  });
}

function matchesPayload(payment: VoidPayment, payload: VoidPayload): boolean {
  return payment.provider === payload.provider && payment.providerPaymentKey === payload.providerPaymentKey;
}

function terminalMismatch(payload: VoidPayload): OutboxTerminalFailed {
  return {
    outcome: "terminal_failed",
    reason: `pg.void payload provider key mismatch for payment ${payload.paymentId}`,
  };
}

async function executeVoid(
  executor: VoidExecutor,
  payload: VoidPayload,
  operationKeyValue: string,
): Promise<void> {
  const result = await executor.void({
    provider: payload.provider,
    providerPaymentKey: payload.providerPaymentKey,
    operationKey: operationKeyValue,
    reason: payload.reason,
  });
  if ("retryable" in result) throw new Error(result.reason);
}

async function transitionVoided(payment: VoidPayment, resultRef: string, transition: VoidTransition): Promise<void> {
  const count = await transition(payment, resultRef);
  if (count !== 1) throw new Error("Payment void transition conflict");
}

function defaultTransition(client: PrismaClient): VoidTransition {
  return async (payment, resultRef) => {
    const remediatedAt = new Date();
    const result = await client.payment.updateMany({
      where: {
        id: payment.id,
        provider: payment.provider,
        providerPaymentKey: payment.providerPaymentKey,
        status: PaymentAttemptStatus.SUCCEEDED,
        attemptLifecycle: payment.attemptLifecycle,
        remediationStatus: payment.remediationStatus,
        remediationOperation: payment.remediationOperation,
        remediationResultRef: payment.remediationResultRef,
        remediatedAt: payment.remediatedAt,
        suspendedByPaymentId: payment.suspendedByPaymentId,
        blockingEndedAt: payment.blockingEndedAt,
      },
      data: {
        status: PaymentAttemptStatus.VOIDED,
        attemptLifecycle: PaymentAttemptLifecycle.TERMINAL_REMEDIATED,
        remediationStatus: PaymentRemediationStatus.REMEDIATED,
        remediationOperation: PaymentRemediationOperation.VOID,
        remediationResultRef: resultRef,
        remediatedAt,
        suspendedByPaymentId: null,
        blockingEndedAt: remediatedAt,
      },
    });
    return result.count;
  };
}

function operationKey(payload: VoidPayload, ctx: OutboxHandlerContext): string {
  return ctx.dedupKey ?? `void:${payload.provider}:${payload.providerPaymentKey}`;
}

function parsePayload(payload: Prisma.JsonValue): VoidPayload {
  if (!isRecord(payload)) throw new Error("pg.void payload must be an object");
  return {
    paymentId: requiredString(payload, "paymentId"),
    provider: requiredProvider(payload, "provider"),
    providerPaymentKey: requiredString(payload, "providerPaymentKey"),
    reason: requiredString(payload, "reason"),
  };
}

function requiredString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(`pg.void payload missing ${key}`);
}

function requiredProvider(payload: Record<string, unknown>, key: string): PaymentProvider {
  const value = requiredString(payload, key);
  if (value === PaymentProvider.MOCK) return PaymentProvider.MOCK;
  if (value === PaymentProvider.TOSS) return PaymentProvider.TOSS;
  if (value === PaymentProvider.PAYPAL) return PaymentProvider.PAYPAL;
  if (value === PaymentProvider.EXIMBAY) {
    throw new Error("pg.void payload provider EXIMBAY is disabled");
  }
  throw new Error(`pg.void payload invalid ${key}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
