import {
  CheckoutSessionStatus,
  OrderStatus,
  PaymentAdapterExecutionKind,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentInitiationOutputKind,
  PaymentMode,
  PaymentProvider,
  PaymentRemediationStatus,
  Prisma,
  RefundAttemptActorType,
  RefundAttemptStatus,
  ShippingCountry,
} from "@prisma/client";
import type { NormalizedClaimInput } from "./claim-contract";
import type {
  RefundExecutionClaimAggregate,
  RefundExecutionClaimTarget,
} from "./claim-evaluation";
import {
  EXIMBAY_CANARY_EXACT_ROUTING_RULE,
  EXIMBAY_CANARY_EXACT_SYNTHETIC_ADDRESS,
  EXIMBAY_CANARY_EXACT_SYNTHETIC_AREA,
  EXIMBAY_CANARY_EXACT_SYNTHETIC_CITY,
  EXIMBAY_CANARY_EXACT_SYNTHETIC_NAME,
  EXIMBAY_CANARY_EXACT_SYNTHETIC_PHONE,
  EXIMBAY_CANARY_EXACT_SYNTHETIC_POSTAL_CODE,
  EXIMBAY_CANARY_FRESH_SALE_MAX_AGE_MS,
  EXIMBAY_CANARY_SYNTHETIC_EMAIL,
  EXIMBAY_CANARY_TARGET_REASON,
  deriveEximbayCanaryCredentialGenerationBindingId,
  deriveEximbayCanaryMerchantAccountBindingId,
  deriveEximbayCanaryRefundAttemptId,
  parseEximbayCanaryAttestation,
  type EximbayCanaryAttendedAttestation,
} from "./eximbay-refund-canary-producer-contract";
import { resolveRefundRequestCreationEvidence } from "./request-evidence";

type CanaryClaimAuthorityInput = Readonly<{
  attestation: EximbayCanaryAttendedAttestation;
}>;

type Shipping = Readonly<{
  recipientName: string;
  phone: string;
  country: ShippingCountry;
  postalCode: string;
  administrativeArea: string;
  city: string;
  addressLine1: string;
  addressLine2: string | null;
  memo: string | null;
}>;

export async function hasExactEximbayCanaryClaimAuthority(
  tx: Prisma.TransactionClient,
  aggregate: RefundExecutionClaimAggregate,
  target: RefundExecutionClaimTarget,
  input: NormalizedClaimInput,
  authority: CanaryClaimAuthorityInput,
): Promise<boolean> {
  if (!attestationIsExact(authority.attestation)) return false;
  if (!(await lockEvidence(tx, aggregate, target))) return false;
  const current = await loadCurrentAuthority(tx, aggregate.id);
  if (!hasCurrentOrder(current)) return false;
  const capturedAt = await captureDatabaseTime(tx);
  return currentSaleMatches(current, capturedAt)
    && syntheticIdentityMatches(current)
    && exactTargetMatches(current, target, input);
}

function attestationIsExact(attestation: EximbayCanaryAttendedAttestation): boolean {
  if (!parseEximbayCanaryAttestation(attestation)) return false;
  const merchantAccountBindingId = deriveEximbayCanaryMerchantAccountBindingId(attestation);
  deriveEximbayCanaryCredentialGenerationBindingId({ ...attestation, merchantAccountBindingId });
  return true;
}

async function lockEvidence(
  tx: Prisma.TransactionClient,
  aggregate: RefundExecutionClaimAggregate,
  target: RefundExecutionClaimTarget,
): Promise<boolean> {
  const payment = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Payment" WHERE "id" = ${target.paymentId} FOR UPDATE
  `);
  const session = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "CheckoutSession" WHERE "id" = ${aggregate.checkoutSessionId} FOR UPDATE
  `);
  const user = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "User" WHERE "id" = ${aggregate.userId} FOR UPDATE
  `);
  const sessionShipping = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "sessionId" AS "id" FROM "CheckoutSessionShipping"
    WHERE "sessionId" = ${aggregate.checkoutSessionId} FOR UPDATE
  `);
  const orderShipping = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "orderId" AS "id" FROM "OrderShipping"
    WHERE "orderId" = ${aggregate.id} FOR UPDATE
  `);
  return [payment, session, user, sessionShipping, orderShipping]
    .every((rows) => rows.length === 1);
}

function loadCurrentAuthority(tx: Prisma.TransactionClient, orderId: string) {
  return tx.payment.findFirst({
    where: { order: { id: orderId } },
    include: {
      session: { include: { user: true, shipping: true } },
      order: { include: {
        shipping: true,
        customerRefundIntakes: { select: { id: true } },
        refundAttempts: {
          include: {
            transitions: true,
            executionCommand: true,
            providerOperationBinding: true,
          },
        },
      } },
    },
  });
}

type LoadedCurrentAuthority = NonNullable<Awaited<ReturnType<typeof loadCurrentAuthority>>>;
type CurrentAuthority = Omit<LoadedCurrentAuthority, "order"> & Readonly<{
  order: NonNullable<LoadedCurrentAuthority["order"]>;
}>;

function hasCurrentOrder(
  value: Awaited<ReturnType<typeof loadCurrentAuthority>>,
): value is CurrentAuthority {
  return value !== null && value.order !== null;
}

function currentSaleMatches(current: CurrentAuthority, capturedAt: Date): boolean {
  const session = current.session;
  const order = current.order;
  const succeededAt = current.financialSucceededAt;
  const completedAt = session.completedAt;
  const fresh = succeededAt instanceof Date && completedAt instanceof Date
    && capturedAt.getTime() >= succeededAt.getTime()
    && capturedAt.getTime() - succeededAt.getTime() <= EXIMBAY_CANARY_FRESH_SALE_MAX_AGE_MS
    && completedAt.getTime() <= capturedAt.getTime()
    && order.paidAt.getTime() <= capturedAt.getTime();
  return [
    current.provider === PaymentProvider.EXIMBAY,
    current.mode === PaymentMode.SANDBOX,
    current.status === PaymentAttemptStatus.SUCCEEDED,
    current.attemptLifecycle === PaymentAttemptLifecycle.FINALIZED,
    current.adapterExecutionKind === PaymentAdapterExecutionKind.EXTERNAL,
    current.remediationStatus === PaymentRemediationStatus.NONE,
    current.routingRuleId === EXIMBAY_CANARY_EXACT_ROUTING_RULE,
    current.initiationOutputKind === PaymentInitiationOutputKind.READY,
    current.initiationCompletedAt instanceof Date,
    current.contactIntentAt instanceof Date,
    current.contactStartedAt instanceof Date,
    current.supersededAt === null,
    current.suspendedByPaymentId === null,
    current.errorCode === null,
    current.errorMessage === null,
    current.currency === "USD",
    Number.isSafeInteger(current.amount) && current.amount > 0,
    nonempty(current.providerOrderId),
    nonempty(current.providerPaymentKey),
    fresh,
    session.status === CheckoutSessionStatus.COMPLETED,
    session.marketCode === "US",
    session.communicationLocale === "en",
    session.currency === "USD",
    order.marketCode === "US",
    order.currency === "USD",
    order.paymentId === current.id,
    order.checkoutSessionId === session.id,
    order.userId === session.userId,
    order.totalAmount === current.amount,
    session.totalAmount === current.amount,
    order.status === OrderStatus.REFUND_PENDING,
    order.disputeStatus === null,
  ].every(Boolean);
}

function syntheticIdentityMatches(current: CurrentAuthority): boolean {
  const user = current.session.user;
  const sessionShipping = current.session.shipping;
  const orderShipping = current.order.shipping;
  if (!sessionShipping || !orderShipping) return false;
  return EXIMBAY_CANARY_SYNTHETIC_EMAIL.test(user.email)
    && user.name === EXIMBAY_CANARY_EXACT_SYNTHETIC_NAME
    && exactShipping(sessionShipping)
    && exactShipping(orderShipping)
    && sameShipping(sessionShipping, orderShipping);
}

function exactTargetMatches(
  current: CurrentAuthority,
  target: RefundExecutionClaimTarget,
  input: NormalizedClaimInput,
): boolean {
  const currentTarget = current.order.refundAttempts[0];
  if (!currentTarget) return false;
  return [
    current.order.refundAttempts.length === 1,
    current.order.customerRefundIntakes.length === 0,
    currentTarget.id === target.id,
    target.id === deriveEximbayCanaryRefundAttemptId(current.id),
    target.id === input.refundAttemptId,
    target.orderId === current.order.id,
    target.paymentId === current.id,
    target.amount === current.amount,
    target.currency === "USD",
    target.provider === PaymentProvider.EXIMBAY,
    target.mode === PaymentMode.SANDBOX,
    target.status === RefundAttemptStatus.REQUESTED,
    target.actorType === RefundAttemptActorType.SYSTEM,
    target.actorUserId === null,
    target.reason === EXIMBAY_CANARY_TARGET_REASON,
    target.providerRefundId === null,
    currentTarget.executionCommand === null,
    currentTarget.providerOperationBinding === null,
    resolveRefundRequestCreationEvidence(target.transitions, target).kind === "matched",
  ].every(Boolean);
}

function exactShipping(shipping: Shipping): boolean {
  return [
    shipping.recipientName === EXIMBAY_CANARY_EXACT_SYNTHETIC_NAME,
    shipping.phone === EXIMBAY_CANARY_EXACT_SYNTHETIC_PHONE,
    shipping.country === ShippingCountry.US,
    shipping.postalCode === EXIMBAY_CANARY_EXACT_SYNTHETIC_POSTAL_CODE,
    shipping.administrativeArea === EXIMBAY_CANARY_EXACT_SYNTHETIC_AREA,
    shipping.city === EXIMBAY_CANARY_EXACT_SYNTHETIC_CITY,
    shipping.addressLine1 === EXIMBAY_CANARY_EXACT_SYNTHETIC_ADDRESS,
    shipping.addressLine2 === null,
    shipping.memo === null,
  ].every(Boolean);
}

function sameShipping(left: Shipping, right: Shipping): boolean {
  return [
    left.recipientName === right.recipientName,
    left.phone === right.phone,
    left.country === right.country,
    left.postalCode === right.postalCode,
    left.administrativeArea === right.administrativeArea,
    left.city === right.city,
    left.addressLine1 === right.addressLine1,
    left.addressLine2 === right.addressLine2,
    left.memo === right.memo,
  ].every(Boolean);
}

async function captureDatabaseTime(tx: Prisma.TransactionClient): Promise<Date> {
  const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  const value = rows[0]?.capturedAt;
  return value instanceof Date ? value : new Date(Number.NaN);
}

function nonempty(value: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
