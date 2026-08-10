import type { EximbayPaymentMode } from "./types";

declare const providerVerifiedStatusBrand: unique symbol;

export interface ProviderVerifiedEximbayStatus {
  readonly authority: "PROVIDER_VERIFIED_STATUS";
  readonly transactionType: string;
  readonly rescode: string;
  readonly status?: string;
  readonly mid: string;
  readonly orderId: string;
  readonly currency: string;
  readonly amount: string;
  readonly transactionId?: string;
  readonly correlation: {
    readonly paymentIdentity: string;
    readonly provider: string;
    readonly mode: EximbayPaymentMode;
  };
  readonly [providerVerifiedStatusBrand]: true;
}
