import { PaymentAttemptStatus, Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { CaptureFacts, CapturedPayment } from "./types";

type CaptureTx = Prisma.TransactionClient;

export async function recordCapture(
  client: PrismaClient,
  facts: CaptureFacts,
): Promise<CapturedPayment> {
  try {
    return await client.$transaction((tx) => recordCaptureTx(tx, facts));
  } catch (e) {
    if (isUniqueConflict(e)) return requirePaymentByProviderKey(client, facts);
    throw e;
  }
}

async function recordCaptureTx(
  tx: CaptureTx,
  facts: CaptureFacts,
): Promise<CapturedPayment> {
  const existing = await findPaymentByProviderKey(tx, facts);
  if (existing) return updateExistingIfPending(tx, existing.id, facts);

  const claimed = await claimPendingAttempt(tx, facts);
  if (claimed) return claimed;

  return tx.payment.create({
    data: {
      checkoutSessionId: facts.checkoutSessionId,
      provider: facts.provider,
      status: PaymentAttemptStatus.SUCCEEDED,
      amount: facts.amount,
      currency: facts.currency,
      providerPaymentKey: facts.providerPaymentKey,
      idempotencyKey: captureIdempotencyKey(facts),
    },
    select: paymentSelect(),
  });
}

async function updateExistingIfPending(
  tx: CaptureTx,
  id: string,
  facts: CaptureFacts,
): Promise<CapturedPayment> {
  await tx.payment.updateMany({
    where: { id, status: { in: [PaymentAttemptStatus.INITIATED, PaymentAttemptStatus.AWAITING] } },
    data: captureUpdateData(facts),
  });
  return requirePaymentById(tx, id);
}

async function claimPendingAttempt(
  tx: CaptureTx,
  facts: CaptureFacts,
): Promise<CapturedPayment | null> {
  const pending = await tx.payment.findFirst({
    where: pendingAttemptWhere(facts),
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!pending) return null;

  const result = await tx.payment.updateMany({
    where: { id: pending.id, ...pendingAttemptWhere(facts) },
    data: captureUpdateData(facts),
  });
  if (result.count !== 1) return null;
  return requirePaymentById(tx, pending.id);
}

function pendingAttemptWhere(facts: CaptureFacts): Prisma.PaymentWhereInput {
  return {
    checkoutSessionId: facts.checkoutSessionId,
    provider: facts.provider,
    providerPaymentKey: null,
    status: { in: [PaymentAttemptStatus.INITIATED, PaymentAttemptStatus.AWAITING] },
  };
}

function captureUpdateData(facts: CaptureFacts): Prisma.PaymentUpdateManyMutationInput {
  return {
    status: PaymentAttemptStatus.SUCCEEDED,
    amount: facts.amount,
    currency: facts.currency,
    providerPaymentKey: facts.providerPaymentKey,
  };
}

async function findPaymentByProviderKey(
  client: Pick<CaptureTx, "payment">,
  facts: CaptureFacts,
): Promise<CapturedPayment | null> {
  return client.payment.findUnique({
    where: { provider_providerPaymentKey: { provider: facts.provider, providerPaymentKey: facts.providerPaymentKey } },
    select: paymentSelect(),
  });
}

async function requirePaymentByProviderKey(
  client: Pick<CaptureTx, "payment">,
  facts: CaptureFacts,
): Promise<CapturedPayment> {
  const payment = await findPaymentByProviderKey(client, facts);
  if (!payment) throw new Error("Captured payment unique conflict without row");
  return payment;
}

async function requirePaymentById(
  client: Pick<CaptureTx, "payment">,
  id: string,
): Promise<CapturedPayment> {
  const payment = await client.payment.findUnique({ where: { id }, select: paymentSelect() });
  if (!payment) throw new Error(`Missing captured payment ${id}`);
  return payment;
}

function paymentSelect(): Prisma.PaymentSelect {
  return {
    id: true,
    checkoutSessionId: true,
    provider: true,
    status: true,
    amount: true,
    currency: true,
    providerPaymentKey: true,
  };
}

function captureIdempotencyKey(facts: CaptureFacts): string {
  return `capture:${facts.provider}:${facts.providerPaymentKey}`;
}

function isUniqueConflict(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}
