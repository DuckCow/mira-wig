// lib/admin-orders-data.ts — 어드민 주문 read model (서버 전용)
import "server-only";

import { Prisma, type OrderStatus, type PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import {
  type AdminPaymentReviewFilter,
  type AdminPaymentReviewState,
  PAYMENT_REVIEW_MARKER_SELECT,
  paymentReviewState,
  paymentReviewWhere,
} from "@/lib/admin-payment-review";
import { MARKET_CODES, type MarketCode } from "@/lib/market/types";
import { calculateRefundableAmountFromAllAdjustments } from "@/lib/payment/refundable";
import { UNRECONCILED_PAYMENT_MARKER_WHERE } from "@/lib/payment/reconciliation";
import { requireAdmin } from "./admin";

export const ADMIN_ORDER_STATUSES = [
  "PENDING_PAYMENT", "PAID", "PAYMENT_FAILED", "PENDING", "CONFIRMED",
  "MANUFACTURING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED",
] as const satisfies readonly OrderStatus[];

export const ADMIN_PAYMENT_STATUSES = [
  "PENDING", "PAID", "FAILED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED",
] as const satisfies readonly PaymentStatus[];

const DEFAULT_PAGE_SIZE = 25, MAX_PAGE_SIZE = 100;

type AdminDataResult<T> =
  | { success: false; errorCode: "UNAUTHENTICATED" | "FORBIDDEN" }
  | { success: true; data: T };

export type AdminOrderFilters = {
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  marketCode?: MarketCode;
  paymentReview?: AdminPaymentReviewFilter;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
};

export type AdminOrderSnapshot = {
  styleName: string;
  color: string;
  colorHex: string | null;
  length: string;
  curl: string;
  coverImageKey: string | null;
  currencyCode: string;
};

export type AdminOrderListItem = {
  id: string; user: { email: string; name: string | null };
  status: OrderStatus; paymentStatus: PaymentStatus; marketCode: string; currency: string;
  totalAmount: number; createdAt: Date; itemCount: number; paymentCount: number;
  latestPayment: { provider: string; status: string; providerTransactionId: string | null } | null;
  paymentReview: AdminPaymentReviewState | null;
};

export type AdminOrderDetail = AdminOrderListItem & {
  paymentMethod: string | null; recipientName: string; phone: string; country: string; postalCode: string;
  administrativeArea: string | null; city: string; addressLine1: string; addressLine2: string | null; memo: string | null;
  items: Array<{
    id: string; variantId: string; quantity: number; unitPrice: number;
    snapshotData: AdminOrderSnapshot;
    manufacturingRequest: {
      id: string; status: string; hairCadKey: string | null; notes: string | null; createdAt: Date; updatedAt: Date;
    } | null;
  }>;
  payments: Array<{
    id: string; provider: string; providerTransactionId: string | null; status: string;
    amount: number; currency: string; refundableAmount: number; errorMessage: string | null; idempotencyKey: string; createdAt: Date;
    adjustments: Array<{
      id: string; providerRefundId: string | null; amount: number; currency: string; reason: string;
      status: string; idempotencyKey: string; refundableAmount: number | null; createdAt: Date;
    }>;
  }>;
};

export type AdminOrderListData = {
  orders: AdminOrderListItem[];
  total: number;
  paymentReviewCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function isAdminOrderStatus(value: string): value is OrderStatus {
  return ADMIN_ORDER_STATUSES.some((status) => status === value);
}

export function isAdminPaymentStatus(value: string): value is PaymentStatus {
  return ADMIN_PAYMENT_STATUSES.some((status) => status === value);
}

export function isAdminMarketCode(value: string): value is MarketCode {
  return MARKET_CODES.some((code) => code === value);
}

function clampPageSize(value: number | undefined): number {
  if (!Number.isInteger(value) || value === undefined) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(value, 1), MAX_PAGE_SIZE);
}

function normalizePage(value: number | undefined): number {
  if (!Number.isInteger(value) || value === undefined || value < 1) return 1;
  return value;
}

function buildWhere(filters: AdminOrderFilters): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.paymentStatus) where.paymentStatus = filters.paymentStatus;
  if (filters.marketCode) where.marketCode = filters.marketCode;
  if (filters.paymentReview === "unreconciled") Object.assign(where, paymentReviewWhere());
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom && { gte: filters.dateFrom }),
      ...(filters.dateTo && { lt: filters.dateTo }),
    };
  }
  return where;
}

function stringField(data: Prisma.JsonObject, field: string): string {
  const value = data[field];
  if (typeof value !== "string") throw new Error(`Invalid snapshotData.${field}`);
  return value;
}

function nullableStringField(data: Prisma.JsonObject, field: string): string | null {
  const value = data[field];
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  throw new Error(`Invalid snapshotData.${field}`);
}

function isRecord(raw: Prisma.JsonValue): raw is Prisma.JsonObject {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

function parseSnapshotData(raw: Prisma.JsonValue): AdminOrderSnapshot {
  if (!isRecord(raw)) throw new Error("Invalid snapshotData");
  return {
    styleName: stringField(raw, "styleName"),
    color: stringField(raw, "color"),
    colorHex: nullableStringField(raw, "colorHex"),
    length: stringField(raw, "length"),
    curl: stringField(raw, "curl"),
    coverImageKey: nullableStringField(raw, "coverImageKey"),
    currencyCode: stringField(raw, "currencyCode"),
  };
}

type OrderListRow = Awaited<ReturnType<typeof fetchOrderRows>>[number];
type OrderDetailRow = NonNullable<Awaited<ReturnType<typeof fetchOrderDetailRow>>>;
type PaymentReviewRow = Awaited<ReturnType<typeof fetchPaymentReviewRows>>[number];

async function fetchPaymentReviewRows(orderIds: string[]) {
  if (orderIds.length === 0) return [];
  return db.payment.findMany({
    where: { orderId: { in: orderIds }, ...UNRECONCILED_PAYMENT_MARKER_WHERE },
    orderBy: { createdAt: "desc" },
    select: { orderId: true, ...PAYMENT_REVIEW_MARKER_SELECT },
  });
}

function paymentReviewMap(rows: PaymentReviewRow[]): Map<string, AdminPaymentReviewState> {
  const result = new Map<string, AdminPaymentReviewState>();
  for (const row of rows) {
    if (!result.has(row.orderId)) {
      const state = paymentReviewState(row);
      if (state) result.set(row.orderId, state);
    }
  }
  return result;
}

async function fetchOrderRows(where: Prisma.OrderWhereInput, skip: number, take: number) {
  return db.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip,
    take,
    select: {
      id: true, status: true, paymentStatus: true, marketCode: true,
      currency: true, totalAmount: true, createdAt: true,
      user: { select: { email: true, name: true } },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { provider: true, status: true, providerTransactionId: true },
      },
      _count: { select: { items: true, payments: true } },
    },
  });
}

function toListItem(row: OrderListRow, reviews: Map<string, AdminPaymentReviewState>): AdminOrderListItem {
  return {
    id: row.id,
    user: row.user,
    status: row.status,
    paymentStatus: row.paymentStatus,
    marketCode: row.marketCode,
    currency: row.currency,
    totalAmount: row.totalAmount,
    createdAt: row.createdAt,
    itemCount: row._count.items,
    paymentCount: row._count.payments,
    latestPayment: row.payments[0] ?? null,
    paymentReview: reviews.get(row.id) ?? null,
  };
}

async function fetchOrderDetailRow(orderId: string) {
  return db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true, status: true, paymentStatus: true, marketCode: true,
      currency: true, totalAmount: true, paymentMethod: true, createdAt: true,
      recipientName: true, phone: true, country: true, postalCode: true,
      administrativeArea: true, city: true, addressLine1: true,
      addressLine2: true, memo: true,
      user: { select: { email: true, name: true } },
      items: {
        select: {
          id: true, variantId: true, quantity: true, unitPrice: true, snapshotData: true,
          manufacturingRequest: {
            select: { id: true, status: true, hairCadKey: true, notes: true, createdAt: true, updatedAt: true },
          },
        },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, provider: true, providerTransactionId: true, status: true,
          amount: true, currency: true, errorMessage: true, idempotencyKey: true, createdAt: true,
          adjustments: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true, providerRefundId: true, amount: true, currency: true,
              reason: true, status: true, idempotencyKey: true, refundableAmount: true, createdAt: true,
            },
          },
        },
      },
      _count: { select: { items: true, payments: true } },
    },
  });
}

function toDetail(row: OrderDetailRow): AdminOrderDetail {
  return {
    ...toListItem({ ...row, payments: row.payments.slice(0, 1) }, new Map()),
    paymentMethod: row.paymentMethod,
    recipientName: row.recipientName,
    phone: row.phone,
    country: row.country,
    postalCode: row.postalCode,
    administrativeArea: row.administrativeArea,
    city: row.city,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    memo: row.memo,
    items: row.items.map((item) => ({ ...item, snapshotData: parseSnapshotData(item.snapshotData) })),
    payments: row.payments.map((payment) => ({
      ...payment,
      refundableAmount: calculateRefundableAmountFromAllAdjustments(payment.amount, payment.adjustments),
    })),
  };
}

export async function listAdminOrders(
  filters: AdminOrderFilters = {},
): Promise<AdminDataResult<AdminOrderListData>> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  const page = normalizePage(filters.page);
  const pageSize = clampPageSize(filters.pageSize);
  const where = buildWhere(filters);
  const [total, rows, paymentReviewCount] = await Promise.all([
    db.order.count({ where }),
    fetchOrderRows(where, (page - 1) * pageSize, pageSize),
    db.order.count({ where: paymentReviewWhere() }),
  ]);
  const reviews = paymentReviewMap(await fetchPaymentReviewRows(rows.map((row) => row.id)));
  return {
    success: true,
    data: { orders: rows.map((row) => toListItem(row, reviews)), total, paymentReviewCount, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export async function getAdminOrderDetail(orderId: string): Promise<AdminDataResult<AdminOrderDetail | null>> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  const row = await fetchOrderDetailRow(orderId);
  return { success: true, data: row ? toDetail(row) : null };
}
