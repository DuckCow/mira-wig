import "server-only";

import { CheckoutSessionStatus } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { isCurrencyCode, isMarketCode } from "@/lib/market/types";
import { parseSnapshotData } from "@/lib/order/snapshot";
import type {
  CheckoutSessionResumeDisposition,
  CheckoutSessionResumeLine,
  CheckoutSessionResumeResult,
} from "./types";

interface ReadCheckoutSessionResumeInput {
  checkoutSessionId: string;
  authenticatedUserId: string;
  now?: Date;
}

export async function readCheckoutSessionResume(
  client: PrismaClient,
  input: ReadCheckoutSessionResumeInput,
): Promise<CheckoutSessionResumeResult | null> {
  const session = await client.checkoutSession.findFirst({
    where: { id: input.checkoutSessionId, userId: input.authenticatedUserId },
    select: {
      id: true,
      marketCode: true,
      currency: true,
      status: true,
      submittedAt: true,
      expiresAt: true,
      subtotalAmount: true,
      shippingAmount: true,
      totalAmount: true,
      market: { select: { code: true, currency: true, isActive: true } },
      lines: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          quantity: true,
          unitAmount: true,
          fulfillmentType: true,
          snapshotData: true,
        },
      },
      shipping: {
        select: {
          recipientName: true,
          phone: true,
          country: true,
          postalCode: true,
          administrativeArea: true,
          city: true,
          addressLine1: true,
          addressLine2: true,
          memo: true,
        },
      },
      payments: { take: 1, select: { id: true } },
      order: { select: { id: true } },
    },
  });
  if (!hasSupportedIdentity(session)) return null;
  const lines = projectLines(session.lines);
  if (!lines) return null;
  if (!hasRequiredShippingPresentation(session.shipping)) return null;
  if (!hasCoherentFrozenAmounts(session, lines)) return null;

  return {
    sessionId: session.id,
    marketCode: session.marketCode,
    currency: session.currency,
    status: session.status,
    submittedAt: session.submittedAt,
    expiresAt: session.expiresAt,
    subtotalAmount: session.subtotalAmount,
    shippingAmount: session.shippingAmount,
    totalAmount: session.totalAmount,
    lines,
    shipping: session.shipping,
    disposition: resumeDisposition(session, input.now ?? new Date()),
    orderId: session.order?.id ?? null,
  };
}

function projectLines(
  lines: readonly {
    id: string;
    quantity: number;
    unitAmount: number;
    fulfillmentType: CheckoutSessionResumeLine["fulfillmentType"];
    snapshotData: unknown;
  }[],
): readonly CheckoutSessionResumeLine[] | null {
  if (lines.length === 0) return null;
  try {
    return lines.map((line) => ({
      id: line.id,
      quantity: line.quantity,
      unitAmount: line.unitAmount,
      fulfillmentType: line.fulfillmentType,
      snapshot: parseSnapshotData(line.snapshotData),
    }));
  } catch {
    return null;
  }
}

function hasCoherentFrozenAmounts(
  session: { currency: string; subtotalAmount: number; shippingAmount: number; totalAmount: number },
  lines: readonly CheckoutSessionResumeLine[],
): boolean {
  if (![session.subtotalAmount, session.shippingAmount, session.totalAmount].every(isNonNegativeInteger)) return false;
  if (lines.some((line) => !isNonNegativeInteger(line.unitAmount) || !isPositiveInteger(line.quantity))) return false;
  if (lines.some((line) => !hasRequiredSnapshotPresentation(line))) return false;
  if (lines.some((line) => line.snapshot.currencyCode !== session.currency)) return false;
  const subtotal = lines.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0);
  return subtotal === session.subtotalAmount
    && subtotal + session.shippingAmount === session.totalAmount;
}

function hasRequiredSnapshotPresentation(line: CheckoutSessionResumeLine): boolean {
  return [line.snapshot.styleName, line.snapshot.color, line.snapshot.length, line.snapshot.curl]
    .every((value) => value.trim().length > 0);
}

function hasRequiredShippingPresentation(
  shipping: CheckoutSessionResumeResult["shipping"] | null,
): shipping is CheckoutSessionResumeResult["shipping"] {
  if (shipping === null) return false;
  return [
    shipping.recipientName,
    shipping.phone,
    shipping.postalCode,
    shipping.administrativeArea,
    shipping.city,
    shipping.addressLine1,
  ].every((value) => value.trim().length > 0);
}

function resumeDisposition(
  session: {
    status: CheckoutSessionStatus;
    submittedAt: Date | null;
    expiresAt: Date;
    currency: string;
    marketCode: string;
    market: { code: string; currency: string; isActive: boolean };
    payments: readonly { id: string }[];
    order: { id: string } | null;
  },
  now: Date,
): CheckoutSessionResumeDisposition {
  const completionDisposition = getCompletionDisposition(session);
  if (completionDisposition !== null) return completionDisposition;
  if (session.payments.length > 0) return "PAYMENT_EXISTS";
  if (isExpiredForPresentation(session, now)) return "EXPIRED";
  if (session.status !== CheckoutSessionStatus.SUBMITTED || session.submittedAt === null) return "TERMINAL";
  if (!hasAdmissibleMarketRelationship(session)) return "MARKET_UNAVAILABLE";
  return "PAYMENT_ELIGIBLE";
}

function hasSupportedIdentity<T extends { marketCode: string; currency: string }>(
  session: T | null,
): session is T & { marketCode: CheckoutSessionResumeResult["marketCode"]; currency: CheckoutSessionResumeResult["currency"] } {
  return session !== null && isMarketCode(session.marketCode) && isCurrencyCode(session.currency);
}

function getCompletionDisposition(
  session: { status: CheckoutSessionStatus; order: { id: string } | null },
): CheckoutSessionResumeDisposition | null {
  if (session.order === null && session.status !== CheckoutSessionStatus.COMPLETED) return null;
  return session.order !== null && session.status === CheckoutSessionStatus.COMPLETED
    ? "COMPLETED"
    : "TERMINAL";
}

function isExpiredForPresentation(
  session: { status: CheckoutSessionStatus; expiresAt: Date },
  now: Date,
): boolean {
  if (session.status === CheckoutSessionStatus.EXPIRED) return true;
  return session.status === CheckoutSessionStatus.SUBMITTED
    && session.expiresAt.getTime() <= now.getTime();
}

function hasAdmissibleMarketRelationship(session: {
  marketCode: string;
  currency: string;
  market: { code: string; currency: string; isActive: boolean };
}): boolean {
  return session.market.isActive
    && session.market.code === session.marketCode
    && session.market.currency === session.currency;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}
