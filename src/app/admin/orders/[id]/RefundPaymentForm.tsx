type Props = {
  orderId: string;
  paymentId: string;
  currency: string;
  refundableAmount: number;
  formattedRefundableAmount: string;
  idempotencyKey: string;
};

export function RefundPaymentForm(_props: Props) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
      컷오버 — 신 코어 대기
    </div>
  );
}
