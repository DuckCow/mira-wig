import { compensateUnconfirmedPayment, reconciliationRequired } from "./reconciliation";
import { verifyCapturedPayment, type CaptureVerification } from "./capture-verification";
import type { PaymentProvider, PaymentResult } from "./types";

type ConfirmCaptureInput = { orderId: string; paymentKey: string };
type CaptureOrder = { totalAmount: number; currency: string };
type CaptureFailureResult = Awaited<ReturnType<typeof reconciliationRequired>>;

async function handleCaptureVerificationFailure(
  input: ConfirmCaptureInput,
  providerTxId: string | null,
  order: CaptureOrder,
  provider: PaymentProvider,
  failure: Extract<CaptureVerification, { ok: false }>,
): Promise<CaptureFailureResult> {
  const confirmedProviderTxId = providerTxId ?? input.paymentKey;
  const error = new Error(failure.error);
  console.error("PAYMENT_CAPTURE_VERIFICATION_FAILED", {
    orderId: input.orderId, paymentKey: input.paymentKey, providerTransactionId: confirmedProviderTxId,
    provider: provider.name, expectedAmount: order.totalAmount, capturedAmount: failure.amount,
    expectedCurrency: order.currency, capturedCurrency: failure.currency, captureReferenceId: failure.referenceId,
  });
  await compensateUnconfirmedPayment({
    orderId: input.orderId, paymentKey: input.paymentKey, providerTransactionId: confirmedProviderTxId,
    provider, amount: failure.amount, currency: failure.currency, error,
  });
  return reconciliationRequired({
    orderId: input.orderId, paymentKey: input.paymentKey, providerTransactionId: confirmedProviderTxId,
    provider: provider.name, amount: failure.amount, currency: failure.currency, error,
  });
}

export async function capturedPaymentFailureResult(
  input: ConfirmCaptureInput,
  result: PaymentResult,
  order: CaptureOrder,
  provider: PaymentProvider,
): Promise<CaptureFailureResult | null> {
  const capture = verifyCapturedPayment(result, {
    orderId: input.orderId, amount: order.totalAmount, currency: order.currency,
  });
  if (capture.ok) return null;
  return handleCaptureVerificationFailure(input, result.providerTransactionId, order, provider, capture);
}
