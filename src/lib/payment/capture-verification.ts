import type { PaymentResult } from "./types";

type ExpectedCapture = { orderId: string; amount: number; currency: string };

export type CaptureVerification =
  | { ok: true }
  | { ok: false; amount: number; currency: string; referenceId?: string; error: string };

function mismatch(expected: ExpectedCapture, result: PaymentResult): string | null {
  if (result.capturedAmount !== expected.amount) return "captured_amount_mismatch";
  if (result.capturedCurrency !== expected.currency) return "captured_currency_mismatch";
  if (result.captureReferenceId !== expected.orderId) return "capture_reference_id_mismatch";
  return null;
}

export function verifyCapturedPayment(
  result: PaymentResult,
  expected: ExpectedCapture,
): CaptureVerification {
  if (result.capturedAmount === undefined) return { ok: true };
  const error = mismatch(expected, result);
  if (!error) return { ok: true };
  return {
    ok: false,
    amount: result.capturedAmount,
    currency: result.capturedCurrency ?? expected.currency,
    referenceId: result.captureReferenceId,
    error,
  };
}
