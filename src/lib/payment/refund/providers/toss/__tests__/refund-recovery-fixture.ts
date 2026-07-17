import { PaymentMode, PaymentProvider } from "@prisma/client";
import { db } from "@/lib/db";
import {
  acquireRefundExecutionLease,
  type RefundExecutionLeaseHandle,
} from "../../../acquire-lease";
import {
  REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_LEASE_ENABLED,
  REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED,
  REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_TOSS_CONTACT_ENABLED,
  REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED,
  REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED,
  REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED,
} from "../../../execution-activation";
import {
  createDispatchFixture,
  type DispatchFixture,
} from "../../../__tests__/refund-dispatch-fixture";
import { createTossRefundExecutionAuthorizer } from "../refund-authorization-orchestrator";
import { createTossRefundContactExecutor } from "../refund-contact-orchestrator";
import type { TossRefundCancellationPort } from "../refund-cancellation-http";
import type { TossRefundLookupPort } from "../refund-lookup-http";

export const RECOVERY_CREDENTIALS = {
  TOSS_SANDBOX_SECRET_KEY: "synthetic_recovery_secret",
  TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: "merchant-test",
  TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "generation-1",
};

export const RECOVERY_ENV: Record<string, string | undefined> = {
  ...RECOVERY_CREDENTIALS,
  [REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: "ENABLED",
};

export const RECOVERY_RECONTACT_ENV: Record<string, string | undefined> = {
  ...RECOVERY_ENV,
  [REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED]: "ENABLED",
};

const LEASE_ENV = { [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED" };
const AUTH_ENV = {
  ...RECOVERY_CREDENTIALS,
  [REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED]: "ENABLED",
};
const CONTACT_ENV = {
  ...RECOVERY_CREDENTIALS,
  [REFUND_EXECUTION_TOSS_CONTACT_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: "ENABLED",
};

export type ContactedRecoveryFixture = Readonly<{
  fixture: DispatchFixture;
  initialLease: RefundExecutionLeaseHandle;
}>;

export async function createContactedRecoveryFixture(): Promise<ContactedRecoveryFixture> {
  const fixture = await createDispatchFixture({ totalAmount: 85_000, targetAmount: 85_000 });
  const lease = await acquireRefundExecutionLease(db, {
    commandId: fixture.commandId,
    leaseOwner: "recovery-fixture-initial-owner",
  }, LEASE_ENV);
  if (!lease.ok) throw new Error(`Expected lease success: ${lease.code}`);
  await Promise.all([
    db.payment.update({
      where: { id: fixture.paymentId },
      data: { provider: PaymentProvider.TOSS, mode: PaymentMode.SANDBOX },
    }),
    db.refundAttempt.update({
      where: { id: fixture.refundAttemptId },
      data: { provider: PaymentProvider.TOSS, mode: PaymentMode.SANDBOX },
    }),
  ]);
  const authorize = createTossRefundExecutionAuthorizer({ lookup: eligibleLookup(fixture) });
  const authorization = await authorize(db, {
    commandId: fixture.commandId,
    leaseGeneration: lease.lease.leaseGeneration,
    leaseToken: lease.lease.leaseToken,
  }, AUTH_ENV);
  if (!authorization.ok) throw new Error(`Expected authorization success: ${authorization.code}`);
  const contact = createTossRefundContactExecutor({
    lookup: eligibleLookup(fixture),
    cancellation: unknownCancellation(),
  });
  const contacted = await contact(db, {
    commandId: fixture.commandId,
    leaseGeneration: lease.lease.leaseGeneration,
    leaseToken: lease.lease.leaseToken,
  }, CONTACT_ENV);
  if (contacted.ok || contacted.code !== "TOSS_CONTACT_OUTCOME_UNKNOWN") {
    throw new Error("Expected contacted unknown recovery fixture.");
  }
  await db.refundExecutionCommand.update({
    where: { id: fixture.commandId },
    data: { leaseUntil: new Date("2026-01-01T00:00:00.000Z") },
  });
  return Object.freeze({ fixture, initialLease: lease.lease });
}

export function eligibleLookup(fixture: DispatchFixture): TossRefundLookupPort {
  return () => Promise.resolve({
    kind: "response",
    body: JSON.stringify(eligibleBody(fixture)),
  });
}

export function exactSuccessLookup(
  fixture: DispatchFixture,
  onCall?: () => void | Promise<void>,
): TossRefundLookupPort {
  return async () => {
    await onCall?.();
    return { kind: "response", body: JSON.stringify(successBody(fixture)) };
  };
}

export function eligibleBody(fixture: DispatchFixture) {
  return {
    paymentKey: fixture.providerPaymentKey,
    method: "카드",
    easyPay: null,
    currency: "KRW",
    status: "DONE",
    totalAmount: fixture.totalAmount,
    balanceAmount: fixture.targetAmount,
    taxFreeAmount: 0,
    taxExemptionAmount: 0,
    cancels: null,
  };
}

export function successBody(fixture: DispatchFixture) {
  return {
    paymentKey: fixture.providerPaymentKey,
    currency: "KRW",
    status: "CANCELED",
    totalAmount: fixture.totalAmount,
    balanceAmount: 0,
    cancels: [{
      transactionKey: "recovery-transaction-1",
      cancelStatus: "DONE",
      cancelAmount: fixture.targetAmount,
      cancelReason: "Mira merchant refund",
    }],
  };
}

function unknownCancellation(): TossRefundCancellationPort {
  return () => Promise.resolve({ kind: "unknown" });
}
