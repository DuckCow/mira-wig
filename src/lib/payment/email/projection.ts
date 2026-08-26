import {
  OrderStatus,
  RefundAttemptStatus,
  type Prisma,
} from "@prisma/client";
import { isLocale, type Locale } from "@/lib/market/locale";
import { parseSnapshotData } from "@/lib/order/snapshot";
import type { SnapshotData } from "@/lib/order/types";
import { deriveCustomerRefundSummary } from "@/lib/payment/refund/customer-summary";

export interface OrderEmailItem {
  quantity: number;
  unitAmount: number;
  snapshot: SnapshotData;
}

export interface OrderPaidEmailProjection {
  to: string;
  locale: Locale;
  orderId: string;
  paidAt: Date;
  status: OrderStatus;
  currency: string;
  totalPaidAmount: number;
  items: readonly OrderEmailItem[];
}

export interface RefundSucceededEmailProjection {
  to: string;
  locale: Locale;
  orderId: string;
  succeededAt: Date;
  refundAmount: number;
  currency: string;
  completion: "PARTIAL" | "FULL";
  remainingPaidAmount: number;
}

export type EmailProjectionResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; reason: string }>;

export interface TransactionalEmailProjectionSource {
  loadOrderPaid(orderId: string): Promise<EmailProjectionResult<OrderPaidEmailProjection>>;
  loadRefundSucceeded(
    refundAttemptId: string,
  ): Promise<EmailProjectionResult<RefundSucceededEmailProjection>>;
}

type ProjectionClient = Pick<Prisma.TransactionClient, "order" | "refundAttempt">;

export function createPrismaTransactionalEmailProjectionSource(
  client: ProjectionClient,
): TransactionalEmailProjectionSource {
  return {
    loadOrderPaid: (orderId) => loadOrderPaid(client, orderId),
    loadRefundSucceeded: (refundAttemptId) => loadRefundSucceeded(client, refundAttemptId),
  };
}

async function loadOrderPaid(
  client: ProjectionClient,
  orderId: string,
): Promise<EmailProjectionResult<OrderPaidEmailProjection>> {
  const order = await client.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      paidAt: true,
      status: true,
      currency: true,
      totalAmount: true,
      user: { select: { email: true } },
      session: { select: { communicationLocale: true } },
      items: {
        orderBy: { id: "asc" },
        select: { quantity: true, unitAmount: true, snapshotData: true },
      },
    },
  });
  if (!order) return failure("ORDER_NOT_FOUND");
  const authority = recipientAndLocale(order.user.email, order.session.communicationLocale);
  if (!authority.ok) return authority;
  if (!validMoney(order.totalAmount, order.currency) || order.items.length === 0) {
    return failure("ORDER_EMAIL_PROJECTION_INVALID");
  }
  const items = projectItems(order.items, order.currency);
  if (!items) return failure("ORDER_EMAIL_SNAPSHOT_INVALID");
  return success({
    to: authority.value.to,
    locale: authority.value.locale,
    orderId: order.id,
    paidAt: order.paidAt,
    status: order.status,
    currency: order.currency,
    totalPaidAmount: order.totalAmount,
    items,
  });
}

async function loadRefundSucceeded(
  client: ProjectionClient,
  refundAttemptId: string,
): Promise<EmailProjectionResult<RefundSucceededEmailProjection>> {
  const attempt = await findRefundAttempt(client, refundAttemptId);
  if (!attempt) return failure("REFUND_ATTEMPT_NOT_FOUND");
  return projectRefundSucceeded(attempt);
}

function findRefundAttempt(client: ProjectionClient, refundAttemptId: string) {
  return client.refundAttempt.findUnique({
    where: { id: refundAttemptId },
    select: {
      id: true,
      orderId: true,
      paymentId: true,
      amount: true,
      currency: true,
      provider: true,
      mode: true,
      status: true,
      processedAt: true,
      order: {
        select: {
          id: true,
          status: true,
          currency: true,
          user: { select: { email: true } },
          session: { select: { communicationLocale: true } },
          payment: {
            select: { id: true, amount: true, currency: true, provider: true, mode: true },
          },
          refundAttempts: {
            select: {
              orderId: true,
              paymentId: true,
              amount: true,
              currency: true,
              provider: true,
              mode: true,
              status: true,
              processedAt: true,
            },
          },
        },
      },
    },
  });
}

type RefundProjectionRow = NonNullable<Awaited<ReturnType<typeof findRefundAttempt>>>;

function projectRefundSucceeded(
  attempt: RefundProjectionRow,
): EmailProjectionResult<RefundSucceededEmailProjection> {
  const authority = recipientAndLocale(
    attempt.order.user.email,
    attempt.order.session.communicationLocale,
  );
  if (!authority.ok) return authority;
  if (attempt.status !== RefundAttemptStatus.SUCCEEDED) return failure("REFUND_NOT_SUCCEEDED");
  const succeededAt = attempt.processedAt;
  if (!validDate(succeededAt)) return failure("REFUND_NOT_SUCCEEDED");
  const summary = deriveCustomerRefundSummary(
    { id: attempt.order.id, currency: attempt.order.currency },
    attempt.order.payment,
    attempt.order.refundAttempts,
  );
  if (summary.invariantFailure) return failure("REFUND_LEDGER_INCOHERENT");
  if (summary.completion === "NONE") return failure("REFUND_LEDGER_INCOHERENT");
  if (!matchesRefundState(attempt.order.status, summary.completion)) {
    return failure("REFUND_ORDER_STATE_INCOHERENT");
  }
  const remainingPaidAmount = attempt.order.payment.amount - summary.totalSucceededRefundAmount;
  if (!validRefundMoney(attempt.amount, attempt.currency, remainingPaidAmount)) {
    return failure("REFUND_MONEY_INCOHERENT");
  }
  return success({
    to: authority.value.to,
    locale: authority.value.locale,
    orderId: attempt.order.id,
    succeededAt,
    refundAmount: attempt.amount,
    currency: attempt.currency,
    completion: summary.completion,
    remainingPaidAmount,
  });
}

function validRefundMoney(amount: number, currency: string, remainingPaidAmount: number): boolean {
  return [validMoney(amount, currency), remainingPaidAmount >= 0].every(Boolean);
}

function projectItems(
  items: readonly Readonly<{ quantity: number; unitAmount: number; snapshotData: Prisma.JsonValue }>[],
  currency: string,
): readonly OrderEmailItem[] | null {
  const projected: OrderEmailItem[] = [];
  try {
    for (const item of items) {
      const snapshot = parseSnapshotData(item.snapshotData);
      if (!Number.isSafeInteger(item.quantity) || item.quantity < 1
        || !validMoney(item.unitAmount, currency) || snapshot.currencyCode !== currency) return null;
      projected.push({ quantity: item.quantity, unitAmount: item.unitAmount, snapshot });
    }
  } catch {
    return null;
  }
  return projected;
}

function recipientAndLocale(
  rawEmail: string,
  rawLocale: string | null,
): EmailProjectionResult<Readonly<{ to: string; locale: Locale }>> {
  const to = rawEmail.trim();
  if (!/^[^\s@]+@[^\s@]+$/u.test(to)) return failure("RECIPIENT_UNAVAILABLE");
  const locale = rawLocale ?? "";
  if (!isLocale(locale)) return failure("COMMUNICATION_LOCALE_UNAVAILABLE");
  return success({ to, locale });
}

function matchesRefundState(status: OrderStatus, completion: "PARTIAL" | "FULL"): boolean {
  return completion === "FULL"
    ? status === OrderStatus.REFUNDED
    : status === OrderStatus.PARTIALLY_REFUNDED;
}

function validMoney(amount: number, currency: string): boolean {
  return Number.isSafeInteger(amount) && amount >= 0 && currency.trim().length > 0;
}

function validDate(value: Date | null): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function success<T>(value: T): EmailProjectionResult<T> {
  return Object.freeze({ ok: true, value });
}

function failure<T>(reason: string): EmailProjectionResult<T> {
  return Object.freeze({ ok: false, reason });
}
