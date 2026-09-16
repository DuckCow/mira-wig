import type { EximbayCheckoutRecoveryPayment } from
  "../eximbay/checkout-recovery-state";
import {
  isExactQ004ReleasedPayment,
  isExactRecoverableBlocker,
} from "../eximbay/checkout-recovery-state";

export type EximbayContactedReconciliationPaymentCandidate = Readonly<{
  paymentId: string;
  kind: "ACTIVE" | "REPLAY";
}>;

export function contactedReconciliationPaymentCandidate(
  payment: EximbayCheckoutRecoveryPayment,
): EximbayContactedReconciliationPaymentCandidate | null {
  if (isExactRecoverableBlocker(payment)) {
    return Object.freeze({ paymentId: payment.id, kind: "ACTIVE" });
  }
  return isExactQ004ReleasedPayment(payment)
    ? Object.freeze({ paymentId: payment.id, kind: "REPLAY" })
    : null;
}
