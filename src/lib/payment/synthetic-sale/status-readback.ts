import "server-only";

import {
  CheckoutSessionStatus,
  OrderStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentEventSource,
  PaymentEventStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { EXIMBAY_BF4_EVENT_TYPE } from "@/lib/payment/eximbay/bf4-envelope";

export type SyntheticSaleStatus = "WAITING" | "CONTACTED" | "SUCCEEDED" | "FAILED" | "AMBIGUOUS";

export type SyntheticSaleRefundTargetReason =
  | "READY"
  | "PAYMENT_CARDINALITY"
  | "PAYMENT_IDENTITY_MISMATCH"
  | "PAYMENT_FAILED"
  | "OUTCOME_UNKNOWN"
  | "ORDER_CARDINALITY"
  | "ORDER_IDENTITY_MISMATCH"
  | "AUDIT_CARDINALITY"
  | "AMOUNT_CURRENCY_MISMATCH"
  | "DURABLE_SUCCESS_INCOMPLETE";

export type SyntheticSaleExactReadback = Readonly<{
  checkoutSession: Readonly<{
    id: string;
    status: CheckoutSessionStatus;
    amount: number;
    currency: string;
  }>;
  payment: Readonly<{
    id: string | null;
    count: number;
    provider: PaymentProvider | null;
    mode: PaymentMode | null;
    status: PaymentAttemptStatus | null;
    providerOrderId: string | null;
    providerPaymentKeyPresent: boolean;
    financialSucceededAtPresent: boolean;
  }>;
  order: Readonly<{
    id: string | null;
    count: number;
    status: OrderStatus | null;
    amount: number | null;
    currency: string | null;
  }>;
  audit: Readonly<{
    eximbayStatusEventCount: number;
    processedEximbayStatusEventCount: number;
  }>;
  amountCurrencyCoherence: "EXACT" | "NOT_EXACT";
  refundTargetReady: boolean;
  refundTargetReason: SyntheticSaleRefundTargetReason;
}>;

export type SyntheticSaleStatusResult = Readonly<{
  state: SyntheticSaleStatus;
  sessionId?: string;
  exactReadback?: SyntheticSaleExactReadback;
}>;

export type SyntheticSaleStatusSnapshot = Readonly<{
  sessionCount: number;
  sessions: readonly Readonly<{
    id: string;
    status: CheckoutSessionStatus;
    totalAmount: number;
    currency: string;
  }>[];
  paymentCount: number;
  payments: readonly Readonly<{
    id: string;
    checkoutSessionId: string;
    provider: PaymentProvider;
    mode: PaymentMode;
    status: PaymentAttemptStatus;
    attemptLifecycle: PaymentAttemptLifecycle;
    amount: number;
    currency: string;
    providerOrderId: string | null;
    providerPaymentKeyPresent: boolean;
    financialSucceededAtPresent: boolean;
  }>[];
  orderCount: number;
  orders: readonly Readonly<{
    id: string;
    checkoutSessionId: string;
    paymentId: string;
    status: OrderStatus;
    totalAmount: number;
    currency: string;
  }>[];
  eventCount: number;
  processedEventCount: number;
  events: readonly Readonly<{
    status: PaymentEventStatus;
    verifiedMode: PaymentMode | null;
    verifiedCredentialBindingPresent: boolean;
    providerPaymentKeyPresent: boolean;
  }>[];
}>;

export async function readSyntheticSaleStatus(
  client: PrismaClient,
  runIdentity: string,
  knownSessionId?: string,
  requestedSessionId?: string,
): Promise<SyntheticSaleStatusResult> {
  return client.$transaction(async (tx) => {
    const userId = `exsale_user_${runIdentity}`;
    const [sessionCount, sessions] = await Promise.all([
      tx.checkoutSession.count({ where: { userId } }),
      tx.checkoutSession.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        take: 2,
        select: { id: true, status: true, totalAmount: true, currency: true },
      }),
    ]);
    const session = exactOne(sessionCount, sessions);
    if (!session) return noExactSessionStatus(sessionCount);
    if (!ownedSession(session.id, knownSessionId, requestedSessionId)) return status("AMBIGUOUS");
    return classifySyntheticSaleStatusSnapshot(await readSnapshot(tx, session, sessionCount));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

async function readSnapshot(
  tx: Prisma.TransactionClient,
  session: SyntheticSaleStatusSnapshot["sessions"][number],
  sessionCount: number,
): Promise<SyntheticSaleStatusSnapshot> {
  const eventWhere = {
    checkoutSessionId: session.id,
    provider: PaymentProvider.EXIMBAY,
    source: PaymentEventSource.WEBHOOK,
    eventType: EXIMBAY_BF4_EVENT_TYPE,
  } as const;
  const [
    paymentCount,
    payments,
    orderCount,
    orders,
    eventCount,
    processedEventCount,
    events,
  ] = await Promise.all([
    tx.payment.count({ where: { checkoutSessionId: session.id } }),
    tx.payment.findMany({
      where: { checkoutSessionId: session.id },
      orderBy: { createdAt: "asc" },
      take: 2,
      select: {
        id: true,
        checkoutSessionId: true,
        provider: true,
        mode: true,
        status: true,
        attemptLifecycle: true,
        amount: true,
        currency: true,
        providerOrderId: true,
        providerPaymentKey: true,
        financialSucceededAt: true,
      },
    }),
    tx.order.count({ where: { checkoutSessionId: session.id } }),
    tx.order.findMany({
      where: { checkoutSessionId: session.id },
      orderBy: { createdAt: "asc" },
      take: 2,
      select: {
        id: true,
        checkoutSessionId: true,
        paymentId: true,
        status: true,
        totalAmount: true,
        currency: true,
      },
    }),
    tx.paymentEvent.count({ where: eventWhere }),
    tx.paymentEvent.count({ where: { ...eventWhere, status: PaymentEventStatus.PROCESSED } }),
    tx.paymentEvent.findMany({
      where: eventWhere,
      orderBy: { receivedAt: "asc" },
      take: 2,
      select: {
        status: true,
        verifiedMode: true,
        verifiedCredentialBinding: true,
        providerPaymentKey: true,
      },
    }),
  ]);
  return Object.freeze({
    sessionCount,
    sessions: Object.freeze([session]),
    paymentCount,
    payments: Object.freeze(payments.map((payment) => {
      const { providerPaymentKey, financialSucceededAt, ...bounded } = payment;
      return Object.freeze({
        ...bounded,
        providerPaymentKeyPresent: providerPaymentKey !== null,
        financialSucceededAtPresent: financialSucceededAt !== null,
      });
    })),
    orderCount,
    orders: Object.freeze(orders),
    eventCount,
    processedEventCount,
    events: Object.freeze(events.map((event) => Object.freeze({
      status: event.status,
      verifiedMode: event.verifiedMode,
      verifiedCredentialBindingPresent: event.verifiedCredentialBinding !== null,
      providerPaymentKeyPresent: event.providerPaymentKey !== null,
    }))),
  });
}

export function classifySyntheticSaleStatusSnapshot(
  snapshot: SyntheticSaleStatusSnapshot,
): SyntheticSaleStatusResult {
  const session = exactOne(snapshot.sessionCount, snapshot.sessions);
  if (!session) return noExactSessionStatus(snapshot.sessionCount);
  const payment = exactOne(snapshot.paymentCount, snapshot.payments);
  const order = exactOne(snapshot.orderCount, snapshot.orders);
  const exactAudit = isExactAudit(snapshot);
  const coherence = isMoneyCoherent(session, payment, order);
  const reason = refundTargetReason(snapshot, session, payment, order, exactAudit, coherence);
  const refundTargetReady = reason === "READY";
  return status(
    statusState(snapshot, session, payment, refundTargetReady),
    session.id,
    exactReadback(snapshot, session, payment, order, coherence, refundTargetReady, reason),
  );
}

function refundTargetReason(
  snapshot: SyntheticSaleStatusSnapshot,
  session: SyntheticSaleStatusSnapshot["sessions"][number],
  payment: SyntheticSaleStatusSnapshot["payments"][number] | null,
  order: SyntheticSaleStatusSnapshot["orders"][number] | null,
  exactAudit: boolean,
  coherence: boolean,
): SyntheticSaleRefundTargetReason {
  const paymentReason = paymentFailureReason(snapshot.paymentCount, payment, session.id);
  if (paymentReason) return paymentReason;
  if (!payment) return "PAYMENT_CARDINALITY";
  const outcomeReason = paymentOutcomeReason(payment);
  if (outcomeReason) return outcomeReason;
  const orderReason = orderFailureReason(snapshot.orderCount, order, session.id, payment.id);
  if (orderReason) return orderReason;
  if (!order) return "ORDER_CARDINALITY";
  return completedResultReason(session, payment, order, exactAudit, coherence);
}

function statusState(
  snapshot: SyntheticSaleStatusSnapshot,
  session: SyntheticSaleStatusSnapshot["sessions"][number],
  payment: SyntheticSaleStatusSnapshot["payments"][number] | null,
  ready: boolean,
): SyntheticSaleStatus {
  if (ready) return "SUCCEEDED";
  if (snapshot.paymentCount === 0) return "WAITING";
  if (snapshot.paymentCount !== 1 || !payment) return "AMBIGUOUS";
  if (payment.attemptLifecycle === PaymentAttemptLifecycle.OUTCOME_UNKNOWN) return "AMBIGUOUS";
  if (payment.status === PaymentAttemptStatus.FAILED) return "FAILED";
  if (hasDurableSuccessSignal(session, payment)) return "AMBIGUOUS";
  return "CONTACTED";
}

function exactReadback(
  snapshot: SyntheticSaleStatusSnapshot,
  session: SyntheticSaleStatusSnapshot["sessions"][number],
  payment: SyntheticSaleStatusSnapshot["payments"][number] | null,
  order: SyntheticSaleStatusSnapshot["orders"][number] | null,
  coherence: boolean,
  refundTargetReady: boolean,
  refundTargetReason: SyntheticSaleRefundTargetReason,
): SyntheticSaleExactReadback {
  return Object.freeze({
    checkoutSession: Object.freeze({
      id: session.id,
      status: session.status,
      amount: session.totalAmount,
      currency: session.currency,
    }),
    payment: paymentReadback(snapshot.paymentCount, payment),
    order: orderReadback(snapshot.orderCount, order),
    audit: Object.freeze({
      eximbayStatusEventCount: snapshot.eventCount,
      processedEximbayStatusEventCount: snapshot.processedEventCount,
    }),
    amountCurrencyCoherence: coherence ? "EXACT" : "NOT_EXACT",
    refundTargetReady,
    refundTargetReason,
  });
}

function noExactSessionStatus(sessionCount: number): SyntheticSaleStatusResult {
  return status(sessionCount === 0 ? "WAITING" : "AMBIGUOUS");
}

function ownedSession(
  sessionId: string,
  knownSessionId: string | undefined,
  requestedSessionId: string | undefined,
): boolean {
  if (knownSessionId !== undefined && knownSessionId !== sessionId) return false;
  return requestedSessionId === undefined || requestedSessionId === sessionId;
}

function isExactAudit(snapshot: SyntheticSaleStatusSnapshot): boolean {
  const event = exactOne(snapshot.eventCount, snapshot.events);
  return snapshot.processedEventCount === 1
    && event !== null
    && event.status === PaymentEventStatus.PROCESSED
    && event.verifiedMode === PaymentMode.SANDBOX
    && event.verifiedCredentialBindingPresent
    && event.providerPaymentKeyPresent;
}

function isMoneyCoherent(
  session: SyntheticSaleStatusSnapshot["sessions"][number],
  payment: SyntheticSaleStatusSnapshot["payments"][number] | null,
  order: SyntheticSaleStatusSnapshot["orders"][number] | null,
): boolean {
  if (!payment || !order) return false;
  return session.totalAmount === payment.amount
    && session.totalAmount === order.totalAmount
    && session.currency === payment.currency
    && session.currency === order.currency;
}

function paymentFailureReason(
  paymentCount: number,
  payment: SyntheticSaleStatusSnapshot["payments"][number] | null,
  sessionId: string,
): SyntheticSaleRefundTargetReason | null {
  if (paymentCount !== 1 || !payment) return "PAYMENT_CARDINALITY";
  if (payment.provider !== PaymentProvider.EXIMBAY || payment.mode !== PaymentMode.SANDBOX) {
    return "PAYMENT_IDENTITY_MISMATCH";
  }
  if (payment.checkoutSessionId !== sessionId || !payment.providerOrderId) {
    return "PAYMENT_IDENTITY_MISMATCH";
  }
  return null;
}

function orderFailureReason(
  orderCount: number,
  order: SyntheticSaleStatusSnapshot["orders"][number] | null,
  sessionId: string,
  paymentId: string,
): SyntheticSaleRefundTargetReason | null {
  if (orderCount !== 1 || !order) return "ORDER_CARDINALITY";
  if (order.checkoutSessionId !== sessionId || order.paymentId !== paymentId) {
    return "ORDER_IDENTITY_MISMATCH";
  }
  return null;
}

function paymentOutcomeReason(
  payment: SyntheticSaleStatusSnapshot["payments"][number],
): SyntheticSaleRefundTargetReason | null {
  if (payment.attemptLifecycle === PaymentAttemptLifecycle.OUTCOME_UNKNOWN) return "OUTCOME_UNKNOWN";
  return payment.status === PaymentAttemptStatus.FAILED ? "PAYMENT_FAILED" : null;
}

function completedResultReason(
  session: SyntheticSaleStatusSnapshot["sessions"][number],
  payment: SyntheticSaleStatusSnapshot["payments"][number],
  order: SyntheticSaleStatusSnapshot["orders"][number],
  exactAudit: boolean,
  coherence: boolean,
): SyntheticSaleRefundTargetReason {
  if (!coherence) return "AMOUNT_CURRENCY_MISMATCH";
  if (!exactAudit) return "AUDIT_CARDINALITY";
  return isDurableSuccess(session, payment, order) ? "READY" : "DURABLE_SUCCESS_INCOMPLETE";
}

function isDurableSuccess(
  session: SyntheticSaleStatusSnapshot["sessions"][number],
  payment: SyntheticSaleStatusSnapshot["payments"][number],
  order: SyntheticSaleStatusSnapshot["orders"][number],
): boolean {
  return session.status === CheckoutSessionStatus.COMPLETED
    && payment.status === PaymentAttemptStatus.SUCCEEDED
    && payment.attemptLifecycle === PaymentAttemptLifecycle.FINALIZED
    && payment.providerPaymentKeyPresent
    && payment.financialSucceededAtPresent
    && order.status === OrderStatus.PAID;
}

function hasDurableSuccessSignal(
  session: SyntheticSaleStatusSnapshot["sessions"][number],
  payment: SyntheticSaleStatusSnapshot["payments"][number],
): boolean {
  return payment.status === PaymentAttemptStatus.SUCCEEDED
    || payment.attemptLifecycle === PaymentAttemptLifecycle.FINALIZED
    || session.status === CheckoutSessionStatus.COMPLETED;
}

function paymentReadback(
  count: number,
  payment: SyntheticSaleStatusSnapshot["payments"][number] | null,
): SyntheticSaleExactReadback["payment"] {
  if (!payment) return Object.freeze({
    id: null,
    count,
    provider: null,
    mode: null,
    status: null,
    providerOrderId: null,
    providerPaymentKeyPresent: false,
    financialSucceededAtPresent: false,
  });
  return Object.freeze({
    id: payment.id,
    count,
    provider: payment.provider,
    mode: payment.mode,
    status: payment.status,
    providerOrderId: payment.providerOrderId,
    providerPaymentKeyPresent: payment.providerPaymentKeyPresent,
    financialSucceededAtPresent: payment.financialSucceededAtPresent,
  });
}

function orderReadback(
  count: number,
  order: SyntheticSaleStatusSnapshot["orders"][number] | null,
): SyntheticSaleExactReadback["order"] {
  if (!order) return Object.freeze({
    id: null,
    count,
    status: null,
    amount: null,
    currency: null,
  });
  return Object.freeze({
    id: order.id,
    count,
    status: order.status,
    amount: order.totalAmount,
    currency: order.currency,
  });
}

function exactOne<T>(count: number, values: readonly T[]): T | null {
  return count === 1 && values.length === 1 ? values[0] ?? null : null;
}

function status(
  state: SyntheticSaleStatus,
  sessionId?: string,
  exactReadbackValue?: SyntheticSaleExactReadback,
): SyntheticSaleStatusResult {
  return Object.freeze({
    state,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(exactReadbackValue === undefined ? {} : { exactReadback: exactReadbackValue }),
  });
}
