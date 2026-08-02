import {
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentRemediationStatus,
  Prisma,
} from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { enqueuePaymentRemediationRequired } from "@/lib/payment/remediation";
import type { CaptureFacts, CapturedPayment, CompletionTerminalFailure } from "./types";

type CaptureTx = Prisma.TransactionClient;
type ModeGuardPayment = Pick<CapturedPayment, "id" | "mode" | "status">;
type BlockingPayment = Pick<CapturedPayment, "id" | "contactStartedAt">;

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
  } catch (error) {
    if (isUniqueConflict(error) || error instanceof PaymentCaptureClaimConflictError) {
      return requireRecoverablePaymentByProviderKey(client, facts);
    }
    throw error;
  }
}

async function recordCaptureTx(
  tx: CaptureTx,
  facts: CaptureFacts,
): Promise<CapturedPayment> {
  await lockCheckoutSession(tx, facts.checkoutSessionId);
  const existing = await findPaymentByProviderKey(tx, facts);
  if (existing) {
    guardExactPaymentIdentity(existing, facts);
    guardPendingCaptureMode(existing, facts);
    return updateExistingIfPending(tx, existing.id, facts);
  }

  if (facts.paymentId) return captureExactAttempt(tx, facts, facts.paymentId);

  const pending = await findPendingAttempt(tx, facts);
  if (pending) {
    guardPendingCaptureMode(pending, facts);
    const claimed = await claimPendingAttempt(tx, facts, pending.id);
    if (claimed) return claimed;
    throw new PaymentCaptureClaimConflictError();
  }

  return createWebhookFirstCapture(tx, facts);
}

async function createWebhookFirstCapture(
  tx: CaptureTx,
  facts: CaptureFacts,
): Promise<CapturedPayment> {
  const blocking = await tx.payment.findFirst({
    where: { checkoutSessionId: facts.checkoutSessionId, blockingEndedAt: null },
    select: { id: true },
  });
  if (blocking) return createBlockedWebhookFirstCapture(tx, facts, blocking.id);
  const succeededAt = effectiveSucceededAt(facts);
  return tx.payment.create({
    data: {
      checkoutSessionId: facts.checkoutSessionId,
      provider: facts.provider,
      mode: facts.mode,
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      amount: facts.amount,
      currency: facts.currency,
      providerPaymentKey: facts.providerPaymentKey,
      idempotencyKey: captureIdempotencyKey(facts),
      contactIntentAt: facts.receivedAt,
      contactStartedAt: facts.receivedAt,
      financialSucceededAt: succeededAt,
    },
    select: paymentSelect(),
  });
}

async function createBlockedWebhookFirstCapture(
  tx: CaptureTx,
  facts: CaptureFacts,
  blockingPaymentId: string,
): Promise<CapturedPayment> {
  const succeededAt = effectiveSucceededAt(facts);
  const payment = await tx.payment.create({
    data: {
      checkoutSessionId: facts.checkoutSessionId,
      provider: facts.provider,
      mode: facts.mode,
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.SUSPENDED,
      remediationStatus: PaymentRemediationStatus.PENDING,
      amount: facts.amount,
      currency: facts.currency,
      providerPaymentKey: facts.providerPaymentKey,
      idempotencyKey: captureIdempotencyKey(facts),
      contactIntentAt: facts.receivedAt,
      contactStartedAt: facts.receivedAt,
      financialSucceededAt: succeededAt,
      blockingEndedAt: facts.receivedAt,
      suspendedByPaymentId: blockingPaymentId,
      errorCode: "CONCURRENT_FINANCIAL_SUCCESS_REQUIRES_REMEDIATION",
      errorMessage: "Another payment already owns this checkout session's blocking slot.",
    },
    select: paymentSelect(),
  });
  await enqueuePaymentRemediationRequired(tx, {
    paymentId: payment.id,
    provider: facts.provider,
    mode: facts.mode,
    providerPaymentKey: facts.providerPaymentKey,
    reason: "CONCURRENT_FINANCIAL_SUCCESS_REQUIRES_REMEDIATION",
  });
  return payment;
}

async function captureExactAttempt(
  tx: CaptureTx,
  facts: CaptureFacts,
  paymentId: string,
): Promise<CapturedPayment> {
  await lockPayment(tx, paymentId);
  const payment = await requirePaymentById(tx, paymentId);
  guardExactPaymentIdentity(payment, facts);
  guardPendingCaptureMode(payment, facts);
  if (payment.providerPaymentKey === facts.providerPaymentKey) return payment;
  if (payment.providerPaymentKey !== null) throw new Error("Correlated payment attempt already has another payment key");
  if (!isCaptureRecordableStatus(payment.status)) {
    throw new Error("Correlated payment attempt is not capture-recordable");
  }
  if (payment.attemptLifecycle === PaymentAttemptLifecycle.SUPERSEDED) {
    return recordLateSupersededSuccess(tx, payment, facts);
  }
  return recordOrdinaryExactSuccess(tx, payment, facts);
}

async function recordOrdinaryExactSuccess(
  tx: CaptureTx,
  payment: CapturedPayment,
  facts: CaptureFacts,
): Promise<CapturedPayment> {
  const lifecycle = payment.attemptLifecycle === PaymentAttemptLifecycle.SUSPENDED
    ? PaymentAttemptLifecycle.SUSPENDED
    : PaymentAttemptLifecycle.CONTACTED;
  const result = await tx.payment.updateMany({
    where: {
      id: payment.id,
      providerPaymentKey: null,
      status: { in: [PaymentAttemptStatus.INITIATED, PaymentAttemptStatus.AWAITING] },
    },
    data: captureUpdateData(facts, lifecycle),
  });
  if (result.count !== 1) throw new PaymentCaptureClaimConflictError();
  return requirePaymentById(tx, payment.id);
}

async function recordLateSupersededSuccess(
  tx: CaptureTx,
  payment: CapturedPayment,
  facts: CaptureFacts,
): Promise<CapturedPayment> {
  const current = await loadCurrentBlockingPayment(tx, payment);
  if (current?.contactStartedAt === null) {
    await suspendUncontactedBlockingPayment(tx, current, payment.id, facts.receivedAt);
  }
  const currentKeepsSlot = current !== null && current.contactStartedAt !== null;
  const result = await tx.payment.updateMany({
    where: {
      id: payment.id,
      providerPaymentKey: null,
      attemptLifecycle: PaymentAttemptLifecycle.SUPERSEDED,
    },
    data: {
      ...captureUpdateData(
        facts,
        currentKeepsSlot ? PaymentAttemptLifecycle.SUSPENDED : PaymentAttemptLifecycle.SUPERSEDED,
      ),
      remediationStatus: PaymentRemediationStatus.PENDING,
      blockingEndedAt: currentKeepsSlot ? facts.receivedAt : null,
      suspendedByPaymentId: currentKeepsSlot ? current.id : null,
      errorCode: "SUPERSEDED_ATTEMPT_CAPTURED",
      errorMessage: "A superseded payment attempt reported financial success and requires remediation.",
    },
  });
  if (result.count !== 1) throw new PaymentCaptureClaimConflictError();
  await enqueuePaymentRemediationRequired(tx, {
    paymentId: payment.id,
    provider: facts.provider,
    mode: facts.mode,
    providerPaymentKey: facts.providerPaymentKey,
    reason: "SUPERSEDED_ATTEMPT_CAPTURED",
  });
  return requirePaymentById(tx, payment.id);
}

async function loadCurrentBlockingPayment(
  tx: CaptureTx,
  remediatingPayment: CapturedPayment,
): Promise<BlockingPayment | null> {
  return tx.payment.findFirst({
    where: {
      checkoutSessionId: remediatingPayment.checkoutSessionId,
      id: { not: remediatingPayment.id },
      blockingEndedAt: null,
    },
    select: { id: true, contactStartedAt: true },
  });
}

async function suspendUncontactedBlockingPayment(
  tx: CaptureTx,
  current: BlockingPayment,
  remediatingPaymentId: string,
  now: Date,
): Promise<void> {
  const result = await tx.payment.updateMany({
    where: { id: current.id, blockingEndedAt: null, contactStartedAt: null },
    data: {
      attemptLifecycle: PaymentAttemptLifecycle.SUSPENDED,
      suspendedByPaymentId: remediatingPaymentId,
      blockingEndedAt: now,
      errorCode: "PAYMENT_LINEAGE_REMEDIATION_BLOCK",
      errorMessage: "A superseded payment in this checkout lineage requires terminal remediation.",
    },
  });
  if (result.count !== 1) throw new PaymentCaptureClaimConflictError();
}

function isCaptureRecordableStatus(status: PaymentAttemptStatus): boolean {
  return status === PaymentAttemptStatus.INITIATED || status === PaymentAttemptStatus.AWAITING;
}

async function updateExistingIfPending(
  tx: CaptureTx,
  id: string,
  facts: CaptureFacts,
): Promise<CapturedPayment> {
  const payment = await requirePaymentById(tx, id);
  if (!isCaptureRecordableStatus(payment.status)) return payment;
  return recordOrdinaryExactSuccess(tx, payment, facts);
}

async function claimPendingAttempt(
  tx: CaptureTx,
  facts: CaptureFacts,
  paymentId: string,
): Promise<CapturedPayment | null> {
  const lifecycle = PaymentAttemptLifecycle.CONTACTED;
  const result = await tx.payment.updateMany({
    where: { id: paymentId, ...pendingAttemptWhere(facts) },
    data: captureUpdateData(facts, lifecycle),
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
    blockingEndedAt: null,
    attemptLifecycle: {
      in: [
        PaymentAttemptLifecycle.CONTACTED,
        PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
      ],
    },
    status: { in: [PaymentAttemptStatus.INITIATED, PaymentAttemptStatus.AWAITING] },
  };
}

function pendingAttemptWhere(facts: CaptureFacts): Prisma.PaymentWhereInput {
  return { ...pendingAttemptLookupWhere(facts), mode: facts.mode };
}

function captureUpdateData(
  facts: CaptureFacts,
  lifecycle: PaymentAttemptLifecycle,
): Prisma.PaymentUpdateManyMutationInput {
  return {
    status: PaymentAttemptStatus.SUCCEEDED,
    attemptLifecycle: lifecycle,
    amount: facts.amount,
    currency: facts.currency,
    providerPaymentKey: facts.providerPaymentKey,
    financialSucceededAt: effectiveSucceededAt(facts),
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
  guardExactPaymentIdentity(payment, facts);
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
    attemptLifecycle: true,
    remediationStatus: true,
    amount: true,
    currency: true,
    providerPaymentKey: true,
    contactStartedAt: true,
    supersededAt: true,
    blockingEndedAt: true,
    suspendedByPaymentId: true,
  };
}

function guardExactPaymentIdentity(payment: CapturedPayment, facts: CaptureFacts): void {
  if (facts.paymentId && payment.id !== facts.paymentId) {
    throw new Error("Capture payment identity mismatch");
  }
  if (payment.checkoutSessionId !== facts.checkoutSessionId || payment.provider !== facts.provider) {
    throw new Error("Capture payment correlation mismatch");
  }
}

function captureIdempotencyKey(facts: CaptureFacts): string {
  return `capture:${facts.provider}:${facts.providerPaymentKey}`;
}

function guardPendingCaptureMode(payment: ModeGuardPayment, facts: CaptureFacts): void {
  if (!isCaptureRecordableStatus(payment.status)) return;
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

async function lockCheckoutSession(tx: CaptureTx, sessionId: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "CheckoutSession" WHERE "id" = ${sessionId} FOR UPDATE
  `);
}

async function lockPayment(tx: CaptureTx, paymentId: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`);
}

function effectiveSucceededAt(facts: CaptureFacts): Date {
  return facts.capturedAt ?? facts.receivedAt;
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code === "P2002"
    : hasErrorCode(error, "P2002");
}

function hasErrorCode(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return error.code === code;
}
