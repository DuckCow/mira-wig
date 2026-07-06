import { randomUUID } from "crypto";
import { PaymentAttemptStatus } from "@prisma/client";
import type { CheckoutSession, Payment, Prisma, PrismaClient } from "@prisma/client";
import { isUsable } from "@/lib/payment/session";
import type {
  PaymentInitiateRedirect,
  PaymentInitiateResult,
  PaymentProvider,
} from "@/lib/payment/providers/types";

type InitiateTx = Prisma.TransactionClient;
type InitiateSession = Pick<CheckoutSession, "id" | "userId" | "status" | "expiresAt" | "totalAmount" | "currency">;
type InitiatedPayment = Pick<Payment, "id" | "provider" | "status" | "amount" | "currency" | "idempotencyKey">;

export type PaymentInitiateErrorCode = "SESSION_UNAVAILABLE" | "SESSION_NOT_USABLE";

export class PaymentInitiateException extends Error {
  constructor(
    public readonly code: PaymentInitiateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PaymentInitiateException";
  }
}

export interface InitiatePaymentAttemptInput {
  sessionId: string;
  userId: string;
  provider: PaymentProvider;
  now?: Date;
}

export interface InitiatePaymentAttemptResult {
  paymentId: string;
  provider: InitiatedPayment["provider"];
  status: InitiatedPayment["status"];
  initiateResult: PaymentInitiateResult;
}

export async function initiatePaymentAttempt(
  client: PrismaClient,
  input: InitiatePaymentAttemptInput,
): Promise<InitiatePaymentAttemptResult> {
  const now = input.now ?? new Date();
  const payment = await client.$transaction((tx) => createInitiatedPayment(tx, input, now));
  const initiateResult = await input.provider.initiate(toProviderInput(payment, input.sessionId));
  if (initiateResult.kind === "redirect") {
    return markAwaiting(client, payment, initiateResult);
  }
  if (hasProviderRef(initiateResult)) {
    await persistProviderRef(client, payment, initiateResult.providerRef);
  }
  return toResult(payment, initiateResult);
}

async function createInitiatedPayment(
  tx: InitiateTx,
  input: InitiatePaymentAttemptInput,
  now: Date,
): Promise<InitiatedPayment> {
  const session = await requireUsableSession(tx, input, now);
  return tx.payment.create({
    data: {
      checkoutSessionId: session.id,
      provider: input.provider.code,
      status: PaymentAttemptStatus.INITIATED,
      amount: session.totalAmount,
      currency: session.currency,
      idempotencyKey: initiateIdempotencyKey(session.id),
    },
    select: paymentSelect(),
  });
}

async function requireUsableSession(
  tx: InitiateTx,
  input: InitiatePaymentAttemptInput,
  now: Date,
): Promise<InitiateSession> {
  const session = await tx.checkoutSession.findUnique({ where: { id: input.sessionId }, select: sessionSelect() });
  if (!session || session.userId !== input.userId) {
    throw new PaymentInitiateException("SESSION_UNAVAILABLE", "Checkout session is unavailable.");
  }
  if (!isUsable(session, now)) {
    throw new PaymentInitiateException("SESSION_NOT_USABLE", "Checkout session is not usable.");
  }
  return session;
}

async function markAwaiting(
  client: PrismaClient,
  payment: InitiatedPayment,
  initiateResult: PaymentInitiateRedirect,
): Promise<InitiatePaymentAttemptResult> {
  const result = await client.payment.updateMany({
    where: { id: payment.id, status: PaymentAttemptStatus.INITIATED, providerPaymentKey: null },
    data: awaitingUpdateData(initiateResult),
  });
  if (result.count !== 1) throw new Error("Payment awaiting transition conflict");
  return { paymentId: payment.id, provider: payment.provider, status: PaymentAttemptStatus.AWAITING, initiateResult };
}

async function persistProviderRef(
  client: PrismaClient,
  payment: InitiatedPayment,
  providerRef: string,
): Promise<void> {
  const result = await client.payment.updateMany({
    where: { id: payment.id, status: PaymentAttemptStatus.INITIATED, providerPaymentKey: null },
    data: { providerRef },
  });
  if (result.count !== 1) throw new Error("Payment providerRef persistence conflict");
}

function awaitingUpdateData(
  initiateResult: PaymentInitiateRedirect,
): Prisma.PaymentUpdateManyMutationInput {
  if (hasProviderRef(initiateResult)) {
    return { status: PaymentAttemptStatus.AWAITING, providerRef: initiateResult.providerRef };
  }
  return { status: PaymentAttemptStatus.AWAITING };
}

function hasProviderRef(
  initiateResult: PaymentInitiateResult,
): initiateResult is PaymentInitiateResult & { providerRef: string } {
  return initiateResult.providerRef !== undefined;
}

function toProviderInput(payment: InitiatedPayment, sessionId: string) {
  return {
    checkoutSessionId: sessionId,
    paymentId: payment.id,
    provider: payment.provider,
    amount: payment.amount,
    currency: payment.currency,
    idempotencyKey: payment.idempotencyKey,
  };
}

function toResult(
  payment: InitiatedPayment,
  initiateResult: PaymentInitiateResult,
): InitiatePaymentAttemptResult {
  return { paymentId: payment.id, provider: payment.provider, status: payment.status, initiateResult };
}

function initiateIdempotencyKey(sessionId: string): string {
  return `initiate:${sessionId}:${randomUUID()}`;
}

function sessionSelect(): Prisma.CheckoutSessionSelect {
  return { id: true, userId: true, status: true, expiresAt: true, totalAmount: true, currency: true };
}

function paymentSelect(): Prisma.PaymentSelect {
  return { id: true, provider: true, status: true, amount: true, currency: true, idempotencyKey: true };
}
