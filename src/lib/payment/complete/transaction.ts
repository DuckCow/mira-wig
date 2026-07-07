import {
  CheckoutSessionStatus,
  FulfillmentType,
  PaymentAttemptStatus,
  Prisma,
} from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { parseSnapshotData, snapshotToJson } from "@/lib/order/snapshot";
import { transitionCheckoutSession } from "@/lib/payment/session";
import type { CheckoutSessionTransition } from "@/lib/payment/session";
import type {
  CaptureFacts,
  CapturedPayment,
  CompletionFailureCode,
  CompletionAlreadyCompleted,
  CompletionRetryableFailure,
  CompletionSucceeded,
  CompletionTerminalFailure,
  CompletionTransactionResult,
} from "./types";

type CompletionTx = Prisma.TransactionClient;
type CompletionSession = NonNullable<Awaited<ReturnType<typeof loadSession>>>;
type CompletionLine = CompletionSession["lines"][number];

class TerminalCompletionError extends Error {
  constructor(readonly failure: CompletionTerminalFailure) {
    super(failure.message);
    this.name = "TerminalCompletionError";
  }
}

export async function runCompletionTransaction(
  client: PrismaClient,
  facts: CaptureFacts,
  payment: CapturedPayment,
): Promise<CompletionTransactionResult> {
  try {
    return await client.$transaction((tx) => completeInTransaction(tx, facts, payment));
  } catch (e) {
    if (e instanceof TerminalCompletionError) return e.failure;
    return retryableFailure(facts, payment, e);
  }
}

async function completeInTransaction(
  tx: CompletionTx,
  facts: CaptureFacts,
  payment: CapturedPayment,
): Promise<CompletionSucceeded | CompletionAlreadyCompleted> {
  await lockCheckoutSession(tx, facts.checkoutSessionId);
  const session = await requireSession(tx, facts.checkoutSessionId, payment, facts);
  const already = alreadyCompleted(session, payment, facts);
  if (already) return already;

  guardCompletion(session, payment, facts);
  const order = await createOrder(tx, session, payment, effectiveCapturedAt(facts));
  await decrementStockedLines(tx, session.lines, payment, facts);
  await deletePurchasedCartLines(tx, session);
  await completeSession(tx, session, facts);
  return { kind: "completed", checkoutSessionId: session.id, paymentId: payment.id, orderId: order.id };
}

async function lockCheckoutSession(tx: CompletionTx, sessionId: string): Promise<void> {
  await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "CheckoutSession" WHERE "id" = ${sessionId} FOR UPDATE
  `);
}

async function requireSession(
  tx: CompletionTx,
  sessionId: string,
  payment: CapturedPayment,
  facts: CaptureFacts,
): Promise<CompletionSession> {
  const session = await loadSession(tx, sessionId);
  if (!session) fail("SESSION_NOT_FOUND", "Checkout session not found", facts, payment);
  return session;
}

async function loadSession(tx: CompletionTx, sessionId: string) {
  return tx.checkoutSession.findUnique({
    where: { id: sessionId },
    include: {
      lines: { orderBy: { createdAt: "asc" } },
      shipping: true,
      order: { select: { id: true, paymentId: true } },
    },
  });
}

function alreadyCompleted(
  session: CompletionSession,
  payment: CapturedPayment,
  facts: CaptureFacts,
) {
  if (session.status !== CheckoutSessionStatus.COMPLETED) return null;
  if (session.order?.paymentId === payment.id) {
    return { kind: "alreadyCompleted" as const, checkoutSessionId: session.id, paymentId: payment.id, orderId: session.order.id };
  }
  fail("SESSION_ALREADY_COMPLETED_BY_OTHER_PAYMENT", "Session already completed by another payment", facts, payment);
}

function guardCompletion(
  session: CompletionSession,
  payment: CapturedPayment,
  facts: CaptureFacts,
): void {
  guardPayment(payment, facts);
  guardSessionState(session, facts, payment);
  guardCaptureWindow(session, facts, payment);
  if (payment.amount !== session.totalAmount) fail("AMOUNT_MISMATCH", "Payment amount mismatch", facts, payment);
  if (payment.currency !== session.currency) fail("CURRENCY_MISMATCH", "Payment currency mismatch", facts, payment);
  if (!session.shipping) fail("SHIPPING_MISSING", "Checkout session shipping missing", facts, payment);
  if (session.lines.length === 0) fail("LINES_MISSING", "Checkout session lines missing", facts, payment);
}

function guardPayment(payment: CapturedPayment, facts: CaptureFacts): void {
  if (payment.status !== PaymentAttemptStatus.SUCCEEDED) fail("PAYMENT_NOT_SUCCEEDED", "Payment is not succeeded", facts, payment);
  if (payment.checkoutSessionId !== facts.checkoutSessionId) fail("PAYMENT_SESSION_MISMATCH", "Payment session mismatch", facts, payment);
  if (payment.mode !== facts.mode) fail("MODE_MISMATCH", "Payment mode mismatch", facts, payment);
  if (payment.providerPaymentKey !== facts.providerPaymentKey) fail("PAYMENT_KEY_MISMATCH", "Payment key mismatch", facts, payment);
}

function guardSessionState(
  session: CompletionSession,
  facts: CaptureFacts,
  payment: CapturedPayment,
): void {
  if (session.status === CheckoutSessionStatus.SUBMITTED) return;
  if (session.status === CheckoutSessionStatus.EXPIRED) return;
  fail("SESSION_STATE_INVALID", "Checkout session state cannot complete", facts, payment);
}

function guardCaptureWindow(
  session: CompletionSession,
  facts: CaptureFacts,
  payment: CapturedPayment,
): void {
  if (effectiveCapturedAt(facts).getTime() <= session.expiresAt.getTime()) return;
  fail("CAPTURE_AFTER_EXPIRY", "Capture happened after checkout session expiry", facts, payment);
}

async function createOrder(
  tx: CompletionTx,
  session: CompletionSession,
  payment: CapturedPayment,
  paidAt: Date,
) {
  return tx.order.create({
    data: {
      session: { connect: { id: session.id } },
      payment: { connect: { id: payment.id } },
      user: { connect: { id: session.userId } },
      market: { connect: { code: session.marketCode } },
      currency: session.currency,
      subtotalAmount: session.subtotalAmount,
      shippingAmount: session.shippingAmount,
      totalAmount: session.totalAmount,
      paidAt,
      items: { create: session.lines.map(orderItemCreate) },
      shipping: { create: orderShippingCreate(session) },
    },
    select: { id: true, paymentId: true, checkoutSessionId: true },
  });
}

function orderItemCreate(line: CompletionLine): Prisma.OrderItemCreateWithoutOrderInput {
  const item = {
    variant: { connect: { id: line.variantId } },
    quantity: line.quantity,
    unitAmount: line.unitAmount,
    fulfillmentType: line.fulfillmentType,
    snapshotData: snapshotToJson(parseSnapshotData(line.snapshotData)),
  };
  if (line.fulfillmentType === FulfillmentType.MTO) return { ...item, mr: { create: {} } };
  return item;
}

function orderShippingCreate(session: CompletionSession): Prisma.OrderShippingCreateWithoutOrderInput {
  if (!session.shipping) throw new Error("Missing guarded shipping");
  return {
    recipientName: session.shipping.recipientName,
    phone: session.shipping.phone,
    country: session.shipping.country,
    postalCode: session.shipping.postalCode,
    administrativeArea: session.shipping.administrativeArea,
    city: session.shipping.city,
    addressLine1: session.shipping.addressLine1,
    addressLine2: session.shipping.addressLine2,
    memo: session.shipping.memo,
  };
}

async function decrementStockedLines(
  tx: CompletionTx,
  lines: CompletionLine[],
  payment: CapturedPayment,
  facts: CaptureFacts,
): Promise<void> {
  for (const line of lines) {
    if (line.fulfillmentType === FulfillmentType.STOCKED) await decrementStockedLine(tx, line, payment, facts);
  }
}

async function decrementStockedLine(
  tx: CompletionTx,
  line: CompletionLine,
  payment: CapturedPayment,
  facts: CaptureFacts,
): Promise<void> {
  const result = await tx.wigVariant.updateMany({
    where: { id: line.variantId, stock: { gte: line.quantity } },
    data: { stock: { decrement: line.quantity } },
  });
  if (result.count !== 1) fail("STOCK_INSUFFICIENT", "Stock is insufficient at completion", facts, payment);
}

async function deletePurchasedCartLines(
  tx: CompletionTx,
  session: CompletionSession,
): Promise<void> {
  await tx.cartItem.deleteMany({
    where: { userId: session.userId, variantId: { in: session.lines.map((line) => line.variantId) } },
  });
}

async function completeSession(
  tx: CompletionTx,
  session: CompletionSession,
  facts: CaptureFacts,
): Promise<void> {
  const count = await transitionCheckoutSession(tx, {
    sessionId: session.id,
    transition: completionTransition(session.status),
    now: facts.receivedAt,
  });
  if (count !== 1) throw new Error("Checkout session completion transition conflict");
}

function completionTransition(status: CheckoutSessionStatus): CheckoutSessionTransition {
  if (status === CheckoutSessionStatus.SUBMITTED) return { from: "SUBMITTED", to: "COMPLETED" };
  if (status === CheckoutSessionStatus.EXPIRED) return { from: "EXPIRED", to: "COMPLETED" };
  throw new Error(`Cannot complete session state ${status}`);
}

function fail(
  code: CompletionFailureCode,
  message: string,
  facts: CaptureFacts,
  payment: CapturedPayment,
): never {
  throw new TerminalCompletionError({
    kind: "terminalFailure",
    code,
    message,
    checkoutSessionId: facts.checkoutSessionId,
    paymentId: payment.id,
    provider: facts.provider,
    providerPaymentKey: facts.providerPaymentKey,
    failedAt: facts.receivedAt,
  });
}

function effectiveCapturedAt(facts: CaptureFacts): Date {
  return facts.capturedAt ?? facts.receivedAt;
}

function retryableFailure(
  facts: CaptureFacts,
  payment: CapturedPayment,
  e: unknown,
): CompletionRetryableFailure {
  return {
    kind: "retryableFailure",
    code: "TRANSIENT_DB_ERROR",
    message: errorMessage(e),
    checkoutSessionId: facts.checkoutSessionId,
    paymentId: payment.id,
  };
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Unknown completion transaction error";
}
