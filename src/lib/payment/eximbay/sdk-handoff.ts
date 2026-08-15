import "server-only";

import {
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentInitiationOutputKind,
  PaymentProvider,
  PaymentRemediationStatus,
  Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { decodeEximbayAmount } from "@/lib/payment/providers/eximbay/amount";
import {
  consumeFreshEximbayReadyAuthority,
  EximbayReadyContactError,
  type FreshEximbayReadyAuthority,
} from "./ready-contact";
import {
  materializeTrustedEximbaySdkWire,
  type EximbayReadyContactPlanCore,
  type EximbayTrustedSdkWireFacts,
  type TrustedEximbayReadySuccess,
} from "./ready-kernel";
import type {
  EximbayReadyHandoffV1,
  EximbaySdkWireV1,
} from "./sdk-handoff-contract";

type EximbaySdkHandoffErrorCode =
  | "INVALID_PAYMENT_ID"
  | "FRESH_AUTHORITY_ALREADY_CONSUMED"
  | "UNTRUSTED_FRESH_AUTHORITY"
  | "DURABLE_READY_UNAVAILABLE"
  | "DURABLE_READY_LINEAGE_MISMATCH"
  | "TRUSTED_SDK_MATERIALIZATION_FAILED";

class EximbaySdkHandoffError extends Error {
  constructor(readonly code: EximbaySdkHandoffErrorCode) {
    super(code);
    this.name = "EximbaySdkHandoffError";
  }
}

const consumedFreshAuthorities = new WeakSet<object>();
const paymentSelect = {
  id: true,
  provider: true,
  mode: true,
  status: true,
  attemptLifecycle: true,
  remediationStatus: true,
  amount: true,
  currency: true,
  providerOrderId: true,
  providerRef: true,
  providerPaymentKey: true,
  contactIntentAt: true,
  contactStartedAt: true,
  initiationOutputKind: true,
  initiationApproveUrl: true,
  initiationCompletedAt: true,
  financialSucceededAt: true,
  errorCode: true,
  errorMessage: true,
  supersededAt: true,
  blockingEndedAt: true,
  suspendedByPaymentId: true,
} satisfies Prisma.PaymentSelect;

type DurableReadyPayment = Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>;

export async function materializeFreshEximbayReadyHandoff(
  paymentId: string,
  freshAuthority: FreshEximbayReadyAuthority,
): Promise<EximbayReadyHandoffV1> {
  requirePaymentId(paymentId);
  if (consumedFreshAuthorities.has(freshAuthority)) {
    throw new EximbaySdkHandoffError("FRESH_AUTHORITY_ALREADY_CONSUMED");
  }
  consumedFreshAuthorities.add(freshAuthority);

  try {
    return await consumeFreshEximbayReadyAuthority(
      freshAuthority,
      (plan, success) => materializeLockedHandoff(paymentId, plan, success),
    );
  } catch (error) {
    if (error instanceof EximbaySdkHandoffError) throw error;
    if (error instanceof EximbayReadyContactError
      && error.code === "UNTRUSTED_FRESH_AUTHORITY") {
      throw new EximbaySdkHandoffError("UNTRUSTED_FRESH_AUTHORITY");
    }
    throw new EximbaySdkHandoffError("DURABLE_READY_UNAVAILABLE");
  }
}

function requirePaymentId(paymentId: string): void {
  if (typeof paymentId !== "string" || paymentId.length === 0 || paymentId.trim() !== paymentId) {
    throw new EximbaySdkHandoffError("INVALID_PAYMENT_ID");
  }
}

async function materializeLockedHandoff(
  paymentId: string,
  plan: EximbayReadyContactPlanCore,
  success: TrustedEximbayReadySuccess,
): Promise<EximbayReadyHandoffV1> {
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`,
    );
    if (locked.length !== 1) {
      throw new EximbaySdkHandoffError("DURABLE_READY_UNAVAILABLE");
    }
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, select: paymentSelect });
    if (!payment) throw new EximbaySdkHandoffError("DURABLE_READY_UNAVAILABLE");
    requireDurableReadyLineage(payment, paymentId, plan);
    const wire = materializeTrustedWire(plan, success);
    requireWireLineage(payment, wire);
    return frozenHandoff(paymentId, plan.mode, wire);
  });
}

function requireDurableReadyLineage(
  payment: DurableReadyPayment,
  paymentId: string,
  plan: EximbayReadyContactPlanCore,
): void {
  const invalid = [
    payment.id !== paymentId,
    payment.provider !== PaymentProvider.EXIMBAY,
    payment.mode !== plan.mode,
    payment.mode !== "SANDBOX" && payment.mode !== "LIVE",
    payment.status !== PaymentAttemptStatus.INITIATED,
    payment.attemptLifecycle !== PaymentAttemptLifecycle.CONTACTED,
    payment.remediationStatus !== PaymentRemediationStatus.NONE,
    payment.initiationOutputKind !== PaymentInitiationOutputKind.READY,
    payment.initiationApproveUrl !== null,
    payment.providerOrderId === null,
    payment.contactIntentAt === null,
    payment.contactStartedAt === null,
    payment.initiationCompletedAt === null,
    payment.providerRef !== null,
    payment.providerPaymentKey !== null,
    payment.financialSucceededAt !== null,
    payment.supersededAt !== null,
    payment.blockingEndedAt !== null,
    payment.suspendedByPaymentId !== null,
    payment.errorCode !== null,
    payment.errorMessage !== null,
  ].some(Boolean);
  if (invalid || !sameContactBoundaryTime(payment)) {
    throw new EximbaySdkHandoffError("DURABLE_READY_LINEAGE_MISMATCH");
  }
}

function sameContactBoundaryTime(payment: DurableReadyPayment): boolean {
  if (!payment.contactStartedAt || !payment.initiationCompletedAt) return false;
  return payment.contactStartedAt.getTime() === payment.initiationCompletedAt.getTime();
}

function materializeTrustedWire(
  plan: EximbayReadyContactPlanCore,
  success: TrustedEximbayReadySuccess,
): EximbayTrustedSdkWireFacts {
  try {
    return materializeTrustedEximbaySdkWire(plan, success);
  } catch {
    throw new EximbaySdkHandoffError("TRUSTED_SDK_MATERIALIZATION_FAILED");
  }
}

function requireWireLineage(
  payment: DurableReadyPayment,
  wire: EximbayTrustedSdkWireFacts,
): void {
  let decodedAmount: number;
  try {
    decodedAmount = decodeEximbayAmount(wire.payment.currency, wire.payment.amount);
  } catch {
    throw new EximbaySdkHandoffError("DURABLE_READY_LINEAGE_MISMATCH");
  }
  const mismatch = payment.providerOrderId !== wire.payment.order_id
    || payment.currency !== wire.payment.currency
    || payment.amount !== decodedAmount
    || wire.payment.payment_method !== "P000";
  if (mismatch) throw new EximbaySdkHandoffError("DURABLE_READY_LINEAGE_MISMATCH");
}

function frozenHandoff(
  paymentId: string,
  mode: EximbayReadyContactPlanCore["mode"],
  wire: EximbayTrustedSdkWireFacts,
): EximbayReadyHandoffV1 {
  const payload: EximbaySdkWireV1 = {
    fgkey: wire.fgkey,
    payment: Object.freeze({
      transaction_type: wire.payment.transaction_type,
      order_id: wire.payment.order_id,
      currency: wire.payment.currency,
      amount: wire.payment.amount,
      lang: wire.payment.lang,
      payment_method: "P000",
    }),
    merchant: Object.freeze({ ...wire.merchant }),
    buyer: Object.freeze({ ...wire.buyer }),
    url: Object.freeze({ ...wire.url }),
  };
  return Object.freeze({
    kind: "EXIMBAY_READY_HANDOFF_V1",
    paymentId,
    mode,
    sdkGeneration: "v2",
    payload: Object.freeze(payload),
  });
}
