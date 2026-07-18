import {
  CheckoutSessionStatus, OrderStatus, PaymentAttemptStatus, PaymentMode, PaymentProvider,
  type Prisma,
} from "@prisma/client";
import type { AcceptanceBootstrapHandle, BootstrapProjection } from "./bootstrap";
import type { ProviderFixture } from "./fixture-manifest";

export async function requireBootstrapProjection(
  tx: Prisma.TransactionClient,
  handle: AcceptanceBootstrapHandle,
  fixture: ProviderFixture,
): Promise<BootstrapProjection> {
  const [order, payment, session, counts] = await Promise.all([
    tx.order.findUnique({ where: { id: handle.orderId }, include: { _count: { select: { items: true } }, shipping: true } }),
    tx.payment.findUnique({ where: { id: handle.paymentId } }),
    tx.checkoutSession.findUnique({ where: { id: handle.checkoutSessionId }, include: { _count: { select: { lines: true } } } }),
    refundDomainCounts(tx, handle.orderId),
  ]);
  const valid = matchesOrder(order, handle, fixture)
    && matchesPayment(payment, handle, fixture)
    && matchesSession(session, handle, fixture)
    && Object.values(counts).every((count) => count === 0);
  if (!valid) throw new Error("BOOTSTRAP_IMMUTABLE_MISMATCH");
  return Object.freeze({
    orderStatus: "PAID", paymentStatus: "SUCCEEDED", paymentProvider: "TOSS",
    paymentMode: "SANDBOX", checkoutStatus: "COMPLETED", currency: "KRW",
    amount: fixture.amount, ...counts, orderItems: 0, orderShipping: 0, checkoutLines: 0,
  });
}

function matchesOrder(
  order: Readonly<{ status: OrderStatus; totalAmount: number; userId: string; paymentId: string; _count: Readonly<{ items: number }>; shipping: unknown }> | null,
  handle: AcceptanceBootstrapHandle,
  fixture: ProviderFixture,
): boolean {
  return order?.status === OrderStatus.PAID && order.totalAmount === fixture.amount
    && order.userId === handle.userId && order.paymentId === handle.paymentId
    && order._count.items === 0 && order.shipping === null;
}

function matchesPayment(
  payment: Readonly<{ id: string; status: PaymentAttemptStatus; provider: PaymentProvider; mode: PaymentMode; currency: string; amount: number; providerPaymentKey: string | null }> | null,
  handle: AcceptanceBootstrapHandle,
  fixture: ProviderFixture,
): boolean {
  return payment?.id === handle.paymentId && payment.status === PaymentAttemptStatus.SUCCEEDED
    && payment.provider === PaymentProvider.TOSS && payment.mode === PaymentMode.SANDBOX
    && payment.currency === "KRW" && payment.amount === fixture.amount
    && payment.providerPaymentKey === fixture.paymentKey;
}

function matchesSession(
  session: Readonly<{ id: string; status: CheckoutSessionStatus; currency: string; totalAmount: number; _count: Readonly<{ lines: number }> }> | null,
  handle: AcceptanceBootstrapHandle,
  fixture: ProviderFixture,
): boolean {
  return session?.id === handle.checkoutSessionId
    && session.status === CheckoutSessionStatus.COMPLETED
    && session.currency === "KRW" && session.totalAmount === fixture.amount
    && session._count.lines === 0;
}

async function refundDomainCounts(tx: Prisma.TransactionClient, orderId: string) {
  const attempts = await tx.refundAttempt.findMany({ where: { orderId }, select: {
    id: true, executionCommand: { select: { id: true } },
    providerOperationBinding: { select: { id: true } },
  } });
  const attemptIds = attempts.map((row) => row.id);
  const commandIds = attempts.flatMap((row) => row.executionCommand ? [row.executionCommand.id] : []);
  const bindingIds = attempts.flatMap((row) => row.providerOperationBinding ? [row.providerOperationBinding.id] : []);
  const dispatches = commandIds.length ? await tx.refundExecutionDispatchAttempt.findMany({
    where: { commandId: { in: commandIds } }, select: { id: true },
  }) : [];
  const dispatchIds = dispatches.map((row) => row.id);
  const [refundTransitions, commandEvents, eligibilityProofs, contactProofs, evidence] = await Promise.all([
    tx.refundAttemptTransition.count({ where: { refundAttemptId: { in: attemptIds } } }),
    tx.refundExecutionCommandEvent.count({ where: { commandId: { in: commandIds } } }),
    tx.refundExecutionProviderEligibilityProof.count({ where: { bindingId: { in: bindingIds } } }),
    tx.refundExecutionProviderContactEligibilityProof.count({ where: { dispatchAttemptId: { in: dispatchIds } } }),
    tx.refundExecutionEvidence.count({ where: { commandId: { in: commandIds } } }),
  ]);
  return Object.freeze({
    refundAttempts: attempts.length, refundTransitions, commands: commandIds.length,
    commandEvents, dispatches: dispatches.length, bindings: bindingIds.length,
    eligibilityProofs, contactProofs, evidence,
  });
}

export async function marketReferenceCount(tx: Prisma.TransactionClient): Promise<number> {
  const market = await tx.market.findUnique({
    where: { code: "KR" },
    include: { _count: { select: { checkoutSessions: true, orders: true, variantPrices: true, availableStyles: true } } },
  });
  if (!market) return 0;
  return Object.values(market._count).reduce((sum, count) => sum + count, 0);
}
