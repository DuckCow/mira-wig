import { Prisma } from "@prisma/client";
import { UNRECONCILED_PAYMENT_MARKER_WHERE } from "@/lib/payment/reconciliation";

export const ADMIN_PAYMENT_REVIEW_FILTERS = ["unreconciled"] as const;

export type AdminPaymentReviewFilter = typeof ADMIN_PAYMENT_REVIEW_FILTERS[number];
export type AdminPaymentReviewState = "UNCONFIRMED" | "AUTO_REFUND_PENDING" | "AUTO_REFUND_FAILED";

type PaymentReviewMarker = {
  adjustments: Array<{ status: string }>;
};

export const PAYMENT_REVIEW_MARKER_SELECT = {
  id: true,
  adjustments: {
    where: { idempotencyKey: { startsWith: "auto-refund:" } },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { status: true },
  },
} satisfies Prisma.PaymentSelect;

export function isAdminPaymentReviewFilter(value: string): value is AdminPaymentReviewFilter {
  return ADMIN_PAYMENT_REVIEW_FILTERS.some((filter) => filter === value);
}

export function paymentReviewWhere(): Prisma.OrderWhereInput {
  return { payments: { some: UNRECONCILED_PAYMENT_MARKER_WHERE } };
}

export function paymentReviewState(marker: PaymentReviewMarker | null): AdminPaymentReviewState | null {
  if (!marker) return null;
  const status = marker.adjustments[0]?.status;
  if (status === "FAILED") return "AUTO_REFUND_FAILED";
  if (status === "PENDING") return "AUTO_REFUND_PENDING";
  return "UNCONFIRMED";
}
