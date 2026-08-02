import { PaymentProvider, Prisma } from "@prisma/client";
import type { TossPaymentCorrelationPort } from "./webhook";

const tossPaymentCorrelationSelect = {
  provider: true,
  checkoutSessionId: true,
} satisfies Prisma.PaymentSelect;

type TossPaymentCorrelationRecord = Prisma.PaymentGetPayload<{
  select: typeof tossPaymentCorrelationSelect;
}>;

type TossPaymentCorrelationFindUniqueArgs = {
  where: { id: string };
  select: typeof tossPaymentCorrelationSelect;
};

export interface TossPaymentCorrelationClient {
  payment: {
    findUnique(args: TossPaymentCorrelationFindUniqueArgs): Promise<TossPaymentCorrelationRecord | null>;
  };
}

export function createTossPaymentCorrelationPort(
  prisma: TossPaymentCorrelationClient,
): TossPaymentCorrelationPort {
  return async (paymentId) => {
    const normalized = paymentId.trim();
    if (!normalized) return null;

    const payment = await prisma.payment.findUnique({
      where: { id: normalized },
      select: tossPaymentCorrelationSelect,
    });
    if (!payment || payment.provider !== PaymentProvider.TOSS) return null;
    if (!payment.checkoutSessionId.trim()) return null;
    return { paymentId: normalized, checkoutSessionId: payment.checkoutSessionId };
  };
}
