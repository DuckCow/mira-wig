export type RefundAdjustmentAmount = {
  amount: number;
};

export type RefundAdjustmentStatusAmount = RefundAdjustmentAmount & {
  status: string;
};

export function sumAdjustmentAmounts(adjustments: readonly RefundAdjustmentAmount[]): number {
  return adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);
}

export function calculateRefundableAmount(
  paymentAmount: number,
  succeededAdjustments: readonly RefundAdjustmentAmount[],
): number {
  return paymentAmount - sumAdjustmentAmounts(succeededAdjustments);
}

export function calculateRefundableAmountFromAllAdjustments(
  paymentAmount: number,
  adjustments: readonly RefundAdjustmentStatusAmount[],
): number {
  return calculateRefundableAmount(
    paymentAmount,
    adjustments.filter((adjustment) => adjustment.status === "SUCCEEDED"),
  );
}
