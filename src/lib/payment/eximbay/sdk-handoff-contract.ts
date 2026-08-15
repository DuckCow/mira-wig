export type EximbaySdkModeV1 = "SANDBOX" | "LIVE";

export interface EximbaySdkWireV1 {
  readonly fgkey: string;
  readonly payment: Readonly<{
    transaction_type: "PAYMENT";
    order_id: string;
    currency: "USD" | "JPY";
    amount: string;
    lang: "EN" | "JP";
    payment_method: "P000";
  }>;
  readonly merchant: Readonly<{ mid: string }>;
  readonly buyer: Readonly<{ name: string; email: string }>;
  readonly url: Readonly<{ return_url: string; status_url: string }>;
}

export interface EximbayReadyHandoffV1 {
  readonly kind: "EXIMBAY_READY_HANDOFF_V1";
  readonly paymentId: string;
  readonly mode: EximbaySdkModeV1;
  readonly sdkGeneration: "v2";
  readonly payload: EximbaySdkWireV1;
}
