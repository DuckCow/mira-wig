import { PaymentProvider } from "@prisma/client";
import { MarketCode } from "@/lib/market/types";

export function providerForMarket(marketCode: string): PaymentProvider {
  if (marketCode === MarketCode.KR) return PaymentProvider.TOSS;
  if (marketCode === MarketCode.US) return PaymentProvider.PAYPAL;
  if (marketCode === MarketCode.JP) return PaymentProvider.PAYPAL;
  return PaymentProvider.MOCK;
}

