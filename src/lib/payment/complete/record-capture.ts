import { PaymentAttemptStatus, Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { CaptureFacts, CapturedPayment, CompletionTerminalFailure } from "./types";

type CaptureTx = Prisma.TransactionClient;
type ModeGuardPayment = Pick<CapturedPayment, "id" | "mode" | "status">;

export class PaymentCaptureModeMismatchError extends Error {
  constructor(readonly failure: CompletionTerminalFailure) {
    super(failure.message);
    this.name = "PaymentCaptureModeMismatchError";
  }
}

export class PaymentCaptureClaimConflictError extends Error {
  constructor() {
    super("Pending payment capture claim conflict");
    this.name = "PaymentCaptureClaimConflictError";
  }
}

export async function recordCapture(
  client: PrismaClient,
  facts: CaptureFacts,
): Promise<CapturedPayment> {
  try {
    return await client.$transaction((tx) => recordCaptureTx(tx, facts));
  } catch (e) {
    if (isUniqueConflict(e) || e instanceof PaymentCaptureClaimConflictError) {
      return requireRecoverablePaymentByProviderKey(client, facts);
    }
    throw e;
  }
}

async function recordCaptureTx(
  tx: CaptureTx,
  facts: CaptureFacts,
): Promise<CapturedPayment> {
  const existing = await findPaymentByProviderKey(tx, facts);
  if (existing) {
    guardPendingCaptureMode(existing, facts);
    return updateExistingIfPending(tx, existing.id, facts);
  }

  const pending = await findPendingAttempt(tx, facts);
  if (pending) {
    guardPendingCaptureMode(pending, facts);
    const claimed = await claimPendingAttempt(tx, facts, pending.id);
    if (claimed) return claimed;
    throw new PaymentCaptureClaimConflictError();
  }

  return tx.payment.create({
    data: {
      checkoutSessionId: facts.checkoutSessionId,
      provider: facts.provider,
      mode: facts.mode,
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
    where: { id, mode: facts.mode, status: { in: [PaymentAttemptStatus.INITIATED, PaymentAttemptStatus.AWAITING] } },
    data: captureUpdateData(facts),
  });
  return requirePaymentById(tx, id);
}

async function claimPendingAttempt(
  tx: CaptureTx,
  facts: CaptureFacts,
  paymentId: string,
): Promise<CapturedPayment | null> {
  const result = await tx.payment.updateMany({
    where: { id: paymentId, ...pendingAttemptWhere(facts) },
    data: captureUpdateData(facts),
  });
  if (result.count !== 1) return null;
  return requirePaymentById(tx, paymentId);
}

async function findPendingAttempt(
  tx: CaptureTx,
  facts: CaptureFacts,
): Promise<ModeGuardPayment | null> {
  return tx.payment.findFirst({
    where: pendingAttemptLookupWhere(facts),
    orderBy: { createdAt: "desc" },
    select: { id: true, mode: true, status: true },
  });
}

function pendingAttemptLookupWhere(facts: CaptureFacts): Prisma.PaymentWhereInput {
  return {
    checkoutSessionId: facts.checkoutSessionId,
    provider: facts.provider,
    providerPaymentKey: null,
    status: { in: [PaymentAttemptStatus.INITIATED, PaymentAttemptStatus.AWAITING] },
  };
}

function pendingAttemptWhere(facts: CaptureFacts): Prisma.PaymentWhereInput {
  return { ...pendingAttemptLookupWhere(facts), mode: facts.mode };
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

async function requireRecoverablePaymentByProviderKey(
  client: Pick<CaptureTx, "payment">,
  facts: CaptureFacts,
): Promise<CapturedPayment> {
  const payment = await requirePaymentByProviderKey(client, facts);
  guardPendingCaptureMode(payment, facts);
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
    mode: true,
    status: true,
    amount: true,
    currency: true,
    providerPaymentKey: true,
  };
}

function captureIdempotencyKey(facts: CaptureFacts): string {
  return `capture:${facts.provider}:${facts.providerPaymentKey}`;
}

function guardPendingCaptureMode(payment: ModeGuardPayment, facts: CaptureFacts): void {
  if (!isPendingStatus(payment.status)) return;
  if (payment.mode === facts.mode) return;
  throw new PaymentCaptureModeMismatchError({
    kind: "terminalFailure",
    code: "MODE_MISMATCH",
    message: "Payment mode mismatch",
    checkoutSessionId: facts.checkoutSessionId,
    paymentId: payment.id,
    provider: facts.provider,
    providerPaymentKey: facts.providerPaymentKey,
    failedAt: facts.receivedAt,
  });
}

function isPendingStatus(status: PaymentAttemptStatus): boolean {
  return status === PaymentAttemptStatus.INITIATED || status === PaymentAttemptStatus.AWAITING;
}

function isUniqueConflict(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError
    ? e.code === "P2002"
    : hasErrorCode(e, "P2002");
}

function hasErrorCode(e: unknown, code: string): boolean {
  if (typeof e !== "object" || e === null || !("code" in e)) return false;
  return e.code === code;
}
