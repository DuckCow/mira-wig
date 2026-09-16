import {
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentEventSource,
  PaymentEventStatus,
  PaymentMode,
  PaymentProvider,
  PaymentRemediationStatus,
  type Payment,
  type Prisma,
} from "@prisma/client";

export const EXIMBAY_CHECKOUT_RECOVERY_EVENT_TYPE = "EXIMBAY_NO_TRANSACTION_OBSERVED";
export const EXIMBAY_NO_TRANSACTION_OBSERVED = "EXIMBAY_NO_TRANSACTION_OBSERVED";

export type EximbayCheckoutRecoveryPayment = Pick<
  Payment,
  | "id"
  | "checkoutSessionId"
  | "provider"
  | "mode"
  | "status"
  | "attemptLifecycle"
  | "remediationStatus"
  | "amount"
  | "currency"
  | "providerOrderId"
  | "providerPaymentKey"
  | "contactStartedAt"
  | "financialSucceededAt"
  | "blockingEndedAt"
  | "suspendedByPaymentId"
  | "errorCode"
>;

export function checkoutRecoveryTransmissionId(paymentId: string): string {
  return `eximbay:checkout-recovery:q004:${paymentId}`;
}

export function isExactRecoverableBlocker(
  payment: EximbayCheckoutRecoveryPayment,
): boolean {
  return ![
    payment.provider !== PaymentProvider.EXIMBAY,
    payment.mode !== PaymentMode.SANDBOX,
    payment.status !== PaymentAttemptStatus.INITIATED
      && payment.status !== PaymentAttemptStatus.AWAITING,
    payment.attemptLifecycle !== PaymentAttemptLifecycle.CONTACTED,
    payment.remediationStatus !== PaymentRemediationStatus.NONE,
    payment.contactStartedAt === null,
    payment.providerOrderId === null,
    payment.providerPaymentKey !== null,
    payment.financialSucceededAt !== null,
    payment.blockingEndedAt !== null,
    payment.suspendedByPaymentId !== null,
  ].some(Boolean);
}

export function isExactQ004ReleasedPayment(
  payment: EximbayCheckoutRecoveryPayment,
): boolean {
  return ![
    payment.provider !== PaymentProvider.EXIMBAY,
    payment.mode !== PaymentMode.SANDBOX,
    payment.status !== PaymentAttemptStatus.INITIATED
      && payment.status !== PaymentAttemptStatus.AWAITING,
    payment.attemptLifecycle !== PaymentAttemptLifecycle.CONTACTED,
    payment.remediationStatus !== PaymentRemediationStatus.NONE,
    payment.contactStartedAt === null,
    payment.providerOrderId === null,
    payment.providerPaymentKey !== null,
    payment.financialSucceededAt !== null,
    payment.blockingEndedAt === null,
    payment.suspendedByPaymentId !== null,
    payment.errorCode !== EXIMBAY_NO_TRANSACTION_OBSERVED,
  ].some(Boolean);
}

export function isExactQ004RecoveryEvent(
  event: {
    source: PaymentEventSource;
    eventType: string;
    verifiedMode: PaymentMode | null;
    verifiedCredentialBinding: string | null;
    checkoutSessionId: string | null;
    raw: Prisma.JsonValue;
    status: PaymentEventStatus;
    receivedAt: Date;
    processedAt: Date | null;
  },
  payment: Pick<
    EximbayCheckoutRecoveryPayment,
    "id" | "checkoutSessionId" | "providerOrderId" | "blockingEndedAt"
  >,
): boolean {
  const metadataMismatch = [
    event.source !== PaymentEventSource.API,
    event.eventType !== EXIMBAY_CHECKOUT_RECOVERY_EVENT_TYPE,
    event.verifiedMode !== PaymentMode.SANDBOX,
    event.verifiedCredentialBinding === null,
    event.checkoutSessionId !== payment.checkoutSessionId,
    event.status !== PaymentEventStatus.PROCESSED,
    event.processedAt === null,
    payment.blockingEndedAt === null,
    !isRecord(event.raw),
  ].some(Boolean);
  if (metadataMismatch || event.processedAt === null
    || payment.blockingEndedAt === null || !isRecord(event.raw)) return false;
  if (event.receivedAt.getTime() !== payment.blockingEndedAt.getTime()
    || event.processedAt.getTime() !== payment.blockingEndedAt.getTime()) return false;
  const providerResult = event.raw.providerResult;
  return ![
    event.raw.schema !== "eximbay.checkout-recovery.q004",
    event.raw.version !== 1,
    event.raw.paymentId !== payment.id,
    event.raw.checkoutSessionId !== payment.checkoutSessionId,
    event.raw.providerOrderId !== payment.providerOrderId,
    event.raw.mode !== PaymentMode.SANDBOX,
    event.raw.credentialBinding !== event.verifiedCredentialBinding,
    event.raw.providerCode !== "Q004",
    event.raw.observedAt !== payment.blockingEndedAt.toISOString(),
    !isRecord(providerResult),
    isRecord(providerResult) && providerResult.rescode !== "Q004",
  ].some(Boolean);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}
