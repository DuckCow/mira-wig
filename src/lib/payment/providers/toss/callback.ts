import { PaymentAttemptStatus, PaymentProvider, Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { MarketCode } from "@/lib/market/types";
import { deriveTossOrderId, parseTossOrderId } from "./order-id";

const PENDING_STATUSES: PaymentAttemptStatus[] = [
  PaymentAttemptStatus.INITIATED,
  PaymentAttemptStatus.AWAITING,
];

const tossCallbackPaymentSelect = {
  id: true,
  checkoutSessionId: true,
  provider: true,
  status: true,
  amount: true,
  currency: true,
  providerRef: true,
  providerPaymentKey: true,
  session: { select: { id: true, marketCode: true, currency: true, totalAmount: true } },
} satisfies Prisma.PaymentSelect;

type TossCallbackPayment = Prisma.PaymentGetPayload<{ select: typeof tossCallbackPaymentSelect }>;

export interface PersistTossCallbackInput {
  paymentKey: string | null | undefined;
  orderId: string | null | undefined;
  amount: string | null | undefined;
}

export type TossCallbackResult =
  | TossCallbackSuccess
  | TossCallbackFailure;

export interface TossCallbackSuccess {
  ok: true;
  status: "ACCEPTED_PROVIDER_REF" | "IDEMPOTENT_PROVIDER_REF" | "ALREADY_COMPLETED";
  paymentId: string;
  checkoutSessionId: string;
}

export interface TossCallbackFailure {
  ok: false;
  status: TossCallbackFailureStatus;
  reason: string;
  paymentId?: string;
}

export type TossCallbackFailureStatus =
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "AMOUNT_MISMATCH"
  | "WRONG_PROVIDER"
  | "NOT_PENDING"
  | "CONFLICTING_PROVIDER_REF"
  | "CONFLICTING_PROVIDER_PAYMENT_KEY"
  | "STOP";

export async function persistTossCallbackProviderRef(
  client: PrismaClient,
  input: PersistTossCallbackInput,
): Promise<TossCallbackResult> {
  const parsed = parseInput(input);
  if (!parsed.ok) return parsed;
  return client.$transaction((tx) => persistValidated(tx, parsed));
}

async function persistValidated(
  tx: Prisma.TransactionClient,
  input: ParsedTossCallbackInput,
): Promise<TossCallbackResult> {
  const payment = await loadPayment(tx, input.paymentId);
  if (!payment) return failure("NOT_FOUND", "Toss orderId does not map to a local payment.", input.paymentId);
  const invalid = validatePayment(payment, input);
  if (invalid) return invalid;
  if (isAlreadyCompleted(payment, input.paymentKey)) return success("ALREADY_COMPLETED", payment);
  if (payment.providerRef === input.paymentKey) return success("IDEMPOTENT_PROVIDER_REF", payment);
  if (payment.providerRef) return failure("CONFLICTING_PROVIDER_REF", "Payment has a different providerRef.", payment.id);

  const result = await tx.payment.updateMany({
    where: pendingProviderRefWriteWhere(payment.id),
    data: { providerRef: input.paymentKey },
  });
  if (result.count === 1) return success("ACCEPTED_PROVIDER_REF", payment);
  return classifyConcurrentChange(tx, payment.id, input.paymentKey);
}

function parseInput(input: PersistTossCallbackInput): ParsedTossCallbackInput | TossCallbackFailure {
  const paymentKey = required(input.paymentKey);
  const orderId = required(input.orderId);
  const amount = parseAmount(input.amount);
  if (!paymentKey || !orderId || amount === null) return failure("INVALID_REQUEST", "Toss callback is missing required fields.");

  const parsed = parseTossOrderId(orderId);
  if (!parsed.ok) return failure("INVALID_REQUEST", `Invalid Toss orderId: ${parsed.reason}.`);
  const expectedOrderId = deriveTossOrderId(parsed.paymentId);
  if (expectedOrderId !== orderId) return failure("INVALID_REQUEST", "Toss orderId is not canonical.", parsed.paymentId);
  return { ok: true, paymentKey, orderId, paymentId: parsed.paymentId, amount };
}

function validatePayment(
  payment: TossCallbackPayment,
  input: ParsedTossCallbackInput,
): TossCallbackFailure | null {
  if (payment.provider !== PaymentProvider.TOSS) return failure("WRONG_PROVIDER", "Payment provider is not Toss.", payment.id);
  if (deriveTossOrderId(payment.id) !== input.orderId) return failure("INVALID_REQUEST", "Toss orderId mismatch.", payment.id);
  if (payment.amount !== input.amount) return failure("AMOUNT_MISMATCH", "Toss amount does not match local payment.", payment.id);
  if (!isTossKrPayment(payment)) return failure("STOP", "Payment is not compatible with D1 Toss KRW route.", payment.id);
  if (payment.providerPaymentKey) return validateCompletedPayment(payment, input.paymentKey);
  if (!isPendingStatus(payment.status)) return failure("NOT_PENDING", "Payment is not pending.", payment.id);
  return null;
}

function validateCompletedPayment(
  payment: TossCallbackPayment,
  paymentKey: string,
): TossCallbackFailure | null {
  if (payment.providerPaymentKey !== paymentKey) {
    return failure("CONFLICTING_PROVIDER_PAYMENT_KEY", "Payment has a different final provider key.", payment.id);
  }
  if (payment.status === PaymentAttemptStatus.SUCCEEDED) return null;
  return failure("NOT_PENDING", "Payment has a provider key but is not succeeded.", payment.id);
}

function isAlreadyCompleted(payment: TossCallbackPayment, paymentKey: string): boolean {
  return payment.status === PaymentAttemptStatus.SUCCEEDED && payment.providerPaymentKey === paymentKey;
}

function isPendingStatus(status: PaymentAttemptStatus): boolean {
  return status === PaymentAttemptStatus.INITIATED || status === PaymentAttemptStatus.AWAITING;
}

async function classifyConcurrentChange(
  tx: Prisma.TransactionClient,
  paymentId: string,
  paymentKey: string,
): Promise<TossCallbackResult> {
  const payment = await loadPayment(tx, paymentId);
  if (!payment) return failure("NOT_FOUND", "Payment disappeared during providerRef write.", paymentId);
  if (payment.providerRef === paymentKey) return success("IDEMPOTENT_PROVIDER_REF", payment);
  if (payment.providerRef) return failure("CONFLICTING_PROVIDER_REF", "Payment providerRef changed during callback.", paymentId);
  const invalid = validatePayment(payment, { ok: true, paymentKey, orderId: deriveTossOrderId(payment.id), paymentId, amount: payment.amount });
  return invalid ?? failure("STOP", "Payment providerRef write conflicted.", paymentId);
}

function pendingProviderRefWriteWhere(paymentId: string): Prisma.PaymentWhereInput {
  return {
    id: paymentId,
    provider: PaymentProvider.TOSS,
    providerRef: null,
    providerPaymentKey: null,
    status: { in: [...PENDING_STATUSES] },
  };
}

function isTossKrPayment(payment: TossCallbackPayment): boolean {
  return payment.currency === "KRW"
    && payment.session.currency === "KRW"
    && payment.session.marketCode === MarketCode.KR
    && payment.amount === payment.session.totalAmount;
}

async function loadPayment(
  client: Pick<Prisma.TransactionClient, "payment">,
  paymentId: string,
): Promise<TossCallbackPayment | null> {
  return client.payment.findUnique({ where: { id: paymentId }, select: tossCallbackPaymentSelect });
}

function required(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseAmount(value: string | null | undefined): number | null {
  const normalized = required(value);
  if (!normalized || !/^\d+$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) ? amount : null;
}

function success(status: TossCallbackSuccess["status"], payment: TossCallbackPayment): TossCallbackSuccess {
  return { ok: true, status, paymentId: payment.id, checkoutSessionId: payment.checkoutSessionId };
}

function failure(status: TossCallbackFailureStatus, reason: string, paymentId?: string): TossCallbackFailure {
  return { ok: false, status, reason, paymentId };
}

interface ParsedTossCallbackInput {
  ok: true;
  paymentKey: string;
  orderId: string;
  paymentId: string;
  amount: number;
}
