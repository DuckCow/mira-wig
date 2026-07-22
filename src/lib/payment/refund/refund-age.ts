export function refundExecutionOldestAgeSeconds(
  capturedAt: Date,
  oldest: Date,
): number {
  if (!isFiniteDate(capturedAt) || !isFiniteDate(oldest)) {
    throw new Error("INVALID_REFUND_AGE_SOURCE");
  }
  const age = Math.max(
    0,
    Math.floor((capturedAt.getTime() - oldest.getTime()) / 1_000),
  );
  if (!isNonnegativeSafeInteger(age)) throw new Error("INVALID_REFUND_AGE");
  return age;
}

function isFiniteDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isNonnegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
