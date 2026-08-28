import "server-only";

import {
  CheckoutSessionStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentEventSource,
  PaymentEventStatus,
  PaymentMode,
  PaymentProvider,
  PaymentRemediationStatus,
} from "@prisma/client";
import type { Prisma, PrismaClient } from "@prisma/client";
import { isCurrencyCode, isMarketCode } from "@/lib/market/types";
import { parseSnapshotData } from "@/lib/order/snapshot";
import type {
  CheckoutSessionResumeDisposition,
  CheckoutSessionResumeLine,
  CheckoutSessionResumeResult,
} from "./types";
import {
  checkoutRecoveryTransmissionId,
  EXIMBAY_CHECKOUT_RECOVERY_EVENT_TYPE,
  EXIMBAY_NO_TRANSACTION_OBSERVED,
  isExactQ004RecoveryEvent,
} from "@/lib/payment/eximbay/checkout-recovery";

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
      promotionGrantId: true,
      subtotalAmount: true,
      discountAmount: true,
      shippingAmount: true,
      totalAmount: true,
      market: { select: { code: true, currency: true, isActive: true } },
      lines: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          quantity: true,
          unitAmount: true,
          discountAmount: true,
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
      payments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          checkoutSessionId: true,
          provider: true,
          mode: true,
          status: true,
          attemptLifecycle: true,
          remediationStatus: true,
          providerOrderId: true,
          providerPaymentKey: true,
          contactStartedAt: true,
          financialSucceededAt: true,
          blockingEndedAt: true,
          suspendedByPaymentId: true,
          errorCode: true,
        },
      },
      order: { select: { id: true } },
    },
  });
  if (!hasSupportedIdentity(session)) return null;
  const lines = projectLines(session.lines);
  if (!lines) return null;
  if (!hasRequiredShippingPresentation(session.shipping)) return null;
  if (!hasCoherentFrozenAmounts(session, lines)) return null;
  const recoveryEvents = await client.paymentEvent.findMany({
    where: {
      provider: PaymentProvider.EXIMBAY,
      source: PaymentEventSource.API,
      eventType: EXIMBAY_CHECKOUT_RECOVERY_EVENT_TYPE,
      status: PaymentEventStatus.PROCESSED,
      checkoutSessionId: session.id,
    },
    select: {
      transmissionId: true,
      source: true,
      eventType: true,
      verifiedMode: true,
      verifiedCredentialBinding: true,
      checkoutSessionId: true,
      raw: true,
      status: true,
      receivedAt: true,
      processedAt: true,
    },
  });
  const resume = resumeDisposition(session, recoveryEvents, input.now ?? new Date());

  return {
    sessionId: session.id,
    marketCode: session.marketCode,
    currency: session.currency,
    status: session.status,
    submittedAt: session.submittedAt,
    expiresAt: session.expiresAt,
    subtotalAmount: session.subtotalAmount,
    discountAmount: session.discountAmount,
    shippingAmount: session.shippingAmount,
    totalAmount: session.totalAmount,
    lines,
    shipping: session.shipping,
    disposition: resume.disposition,
    recoveryPaymentId: resume.recoveryPaymentId,
    orderId: session.order?.id ?? null,
  };
}

function projectLines(
  lines: readonly {
    id: string;
    quantity: number;
    unitAmount: number;
    discountAmount: number;
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
      discountAmount: line.discountAmount,
      fulfillmentType: line.fulfillmentType,
      snapshot: parseSnapshotData(line.snapshotData),
    }));
  } catch {
    return null;
  }
}

function hasCoherentFrozenAmounts(
  session: {
    currency: string;
    promotionGrantId: string | null;
    subtotalAmount: number;
    discountAmount: number;
    shippingAmount: number;
    totalAmount: number;
  },
  lines: readonly CheckoutSessionResumeLine[],
): boolean {
  const subtotal = lines.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0);
  const discount = lines.reduce((sum, line) => sum + line.discountAmount, 0);
  return [
    [session.subtotalAmount, session.discountAmount, session.shippingAmount, session.totalAmount]
      .every(isNonNegativeInteger),
    lines.every(hasCoherentLineMoney),
    lines.every(hasRequiredSnapshotPresentation),
    lines.every((line) => line.snapshot.currencyCode === session.currency),
    subtotal === session.subtotalAmount,
    discount === session.discountAmount,
    hasCoherentPromotionShape(session, discount),
    subtotal + session.shippingAmount - discount === session.totalAmount,
  ].every(Boolean);
}

function hasCoherentLineMoney(line: CheckoutSessionResumeLine): boolean {
  return [
    isNonNegativeInteger(line.unitAmount),
    isPositiveInteger(line.quantity),
    isNonNegativeInteger(line.discountAmount),
    line.discountAmount <= line.unitAmount * line.quantity,
  ].every(Boolean);
}

function hasCoherentPromotionShape(
  session: { promotionGrantId: string | null; discountAmount: number },
  lineDiscountAmount: number,
): boolean {
  if (session.promotionGrantId !== null) return session.discountAmount > 0;
  return session.discountAmount === 0 && lineDiscountAmount === 0;
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
    payments: readonly ResumePayment[];
    order: { id: string } | null;
  },
  recoveryEvents: readonly RecoveryResumeEvent[],
  now: Date,
): Readonly<{ disposition: CheckoutSessionResumeDisposition; recoveryPaymentId: string | null }> {
  const baseDisposition = getBaseResumeDisposition(session, now);
  if (baseDisposition !== null) return disposition(baseDisposition);
  if (session.payments.some(isUnsafeSessionExposure)) return disposition("PAYMENT_EXISTS");
  const blockers = session.payments.filter((payment) => payment.blockingEndedAt === null);
  if (blockers.length === 1 && isRecoverableResumePayment(blockers[0])) {
    return Object.freeze({ disposition: "PAYMENT_RECOVERY_AVAILABLE", recoveryPaymentId: blockers[0].id });
  }
  if (blockers.length > 0) return disposition("PAYMENT_EXISTS");
  if (session.payments.every((payment) => isSafelyReleasedHistory(payment, recoveryEvents))) {
    return disposition("PAYMENT_ELIGIBLE");
  }
  return disposition("PAYMENT_EXISTS");
}

function getBaseResumeDisposition(
  session: Parameters<typeof resumeDisposition>[0],
  now: Date,
): CheckoutSessionResumeDisposition | null {
  const completionDisposition = getCompletionDisposition(session);
  if (completionDisposition !== null) return completionDisposition;
  if (isExpiredForPresentation(session, now)) return "EXPIRED";
  if (session.status !== CheckoutSessionStatus.SUBMITTED || session.submittedAt === null) return "TERMINAL";
  if (!hasAdmissibleMarketRelationship(session)) return "MARKET_UNAVAILABLE";
  return null;
}

function isUnsafeSessionExposure(payment: ResumePayment): boolean {
  if (!SAFE_REMEDIATION_STATUSES
    .includes(payment.remediationStatus)) return true;
  return ![
    payment.provider !== PaymentProvider.EXIMBAY,
    payment.mode !== PaymentMode.SANDBOX,
    !FINANCIALLY_UNRESOLVED_STATUSES.includes(payment.status),
    payment.attemptLifecycle !== PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
    payment.remediationStatus !== PaymentRemediationStatus.NONE,
    payment.providerOrderId === null,
    payment.providerPaymentKey !== null,
    payment.contactStartedAt === null,
    payment.financialSucceededAt !== null,
    payment.blockingEndedAt === null,
    payment.suspendedByPaymentId !== null,
    payment.errorCode !== "EXIMBAY_RELEASED_ATTEMPT_OUTCOME_UNKNOWN",
  ].some(Boolean);
}

type ResumePayment = Readonly<{
  id: string;
  checkoutSessionId: string;
  provider: PaymentProvider;
  mode: PaymentMode;
  status: PaymentAttemptStatus;
  attemptLifecycle: PaymentAttemptLifecycle;
  remediationStatus: PaymentRemediationStatus;
  providerOrderId: string | null;
  providerPaymentKey: string | null;
  contactStartedAt: Date | null;
  financialSucceededAt: Date | null;
  blockingEndedAt: Date | null;
  suspendedByPaymentId: string | null;
  errorCode: string | null;
}>;

const SAFE_REMEDIATION_STATUSES: readonly PaymentRemediationStatus[] = Object.freeze([
  PaymentRemediationStatus.NONE,
  PaymentRemediationStatus.REMEDIATED,
]);

const FINANCIALLY_UNRESOLVED_STATUSES: readonly PaymentAttemptStatus[] = Object.freeze([
  PaymentAttemptStatus.INITIATED,
  PaymentAttemptStatus.AWAITING,
]);

function isRecoverableResumePayment(payment: ResumePayment): boolean {
  return ![
    payment.provider !== PaymentProvider.EXIMBAY,
    payment.mode !== PaymentMode.SANDBOX,
    !FINANCIALLY_UNRESOLVED_STATUSES.includes(payment.status),
    payment.attemptLifecycle !== PaymentAttemptLifecycle.CONTACTED,
    payment.remediationStatus !== PaymentRemediationStatus.NONE,
    payment.providerOrderId === null,
    payment.providerPaymentKey !== null,
    payment.contactStartedAt === null,
    payment.financialSucceededAt !== null,
    payment.blockingEndedAt !== null,
    payment.suspendedByPaymentId !== null,
  ].some(Boolean);
}

function isSafelyReleasedHistory(
  payment: ResumePayment,
  events: readonly RecoveryResumeEvent[],
): boolean {
  const unsafe = [
    payment.provider !== PaymentProvider.EXIMBAY,
    payment.mode !== PaymentMode.SANDBOX,
    !FINANCIALLY_UNRESOLVED_STATUSES.includes(payment.status),
    payment.attemptLifecycle !== PaymentAttemptLifecycle.CONTACTED,
    payment.remediationStatus !== PaymentRemediationStatus.NONE,
    payment.providerOrderId === null,
    payment.providerPaymentKey !== null,
    payment.contactStartedAt === null,
    payment.financialSucceededAt !== null,
    payment.blockingEndedAt === null,
    payment.suspendedByPaymentId !== null,
    payment.errorCode !== EXIMBAY_NO_TRANSACTION_OBSERVED,
  ].some(Boolean);
  if (unsafe) return false;
  const event = events.find((candidate) => (
    candidate.transmissionId === checkoutRecoveryTransmissionId(payment.id)
  ));
  return event !== undefined && isExactQ004RecoveryEvent(event, payment);
}

type RecoveryResumeEvent = Readonly<{
  transmissionId: string | null;
  source: PaymentEventSource;
  eventType: string;
  verifiedMode: PaymentMode | null;
  verifiedCredentialBinding: string | null;
  checkoutSessionId: string | null;
  raw: Prisma.JsonValue;
  status: PaymentEventStatus;
  receivedAt: Date;
  processedAt: Date | null;
}>;

function disposition(
  value: CheckoutSessionResumeDisposition,
): Readonly<{ disposition: CheckoutSessionResumeDisposition; recoveryPaymentId: null }> {
  return Object.freeze({ disposition: value, recoveryPaymentId: null });
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
