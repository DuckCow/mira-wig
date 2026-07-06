import { PaymentAttemptStatus, PaymentProvider } from "@prisma/client";
import type { Payment, Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import type { OutboxHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxTerminalFailed } from "@/lib/payment/outbox";
import { createMockVoidExecutor, type VoidExecutor } from "./executor";

export const VOID_TOPIC = "pg.void";

type VoidPayment = Pick<Payment, "id" | "provider" | "providerPaymentKey" | "status">;
type VoidTransition = (paymentId: string) => Promise<number>;

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

  await executeVoid(options.executor ?? createMockVoidExecutor(), payload, operationKey(payload, ctx));
  await transitionVoided(payload.paymentId, options.transitionPayment ?? defaultTransition(client));
}

async function loadPayment(client: PrismaClient, paymentId: string): Promise<VoidPayment | null> {
  return client.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, provider: true, providerPaymentKey: true, status: true },
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

async function transitionVoided(paymentId: string, transition: VoidTransition): Promise<void> {
  const count = await transition(paymentId);
  if (count !== 1) throw new Error("Payment void transition conflict");
}

function defaultTransition(client: PrismaClient): VoidTransition {
  return async (paymentId) => {
    const result = await client.payment.updateMany({
      where: { id: paymentId, status: PaymentAttemptStatus.SUCCEEDED },
      data: { status: PaymentAttemptStatus.VOIDED },
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
  throw new Error(`pg.void payload invalid ${key}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
