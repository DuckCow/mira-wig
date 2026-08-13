export type PaymentReturnStatus =
  | { kind: "SUCCEEDED"; orderId: string }
  | { kind: "FAILED" }
  | { kind: "PROCESSING" }
  | { kind: "UNAVAILABLE" };

export type PaymentReturnViewStatus = PaymentReturnStatus | { kind: "UNRESOLVED" };

export function isTerminalPaymentReturnStatus(status: PaymentReturnStatus): boolean {
  return status.kind !== "PROCESSING";
}

export function isPaymentReturnStatus(value: unknown): value is PaymentReturnStatus {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "SUCCEEDED") return typeof value.orderId === "string" && value.orderId.length > 0;
  return value.kind === "FAILED" || value.kind === "PROCESSING" || value.kind === "UNAVAILABLE";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
