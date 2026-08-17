import type { EximbayPaymentMode } from "../../types";
import {
  createProviderVerifiedEximbayStatus,
  type ProviderVerifiedEximbayStatus,
} from "../../verified-status";

export interface VerifiedStatusFixtureInput {
  transactionType?: string;
  rescode?: string;
  status?: string;
  mid?: string;
  orderId?: string;
  currency?: string;
  amount?: string;
  transactionId?: string;
  paymentIdentity?: string;
  provider?: string;
  mode?: EximbayPaymentMode;
}

export function verifiedStatusFixture(
  input: VerifiedStatusFixtureInput = {},
): ProviderVerifiedEximbayStatus {
  return unsafeVerifiedStatusFixture({
    authority: "PROVIDER_VERIFIED_STATUS",
    transactionType: withDefault(input.transactionType, "PAYMENT"),
    rescode: withDefault(input.rescode, "0000"),
    status: withDefault(input.status, "SALE"),
    mid: withDefault(input.mid, "merchant-mid"),
    orderId: withDefault(input.orderId, "established-provider-order-1"),
    currency: withDefault(input.currency, "USD"),
    amount: withDefault(input.amount, "29.99"),
    transactionId: withDefault(input.transactionId, "transaction-1"),
    correlation: Object.freeze({
      paymentIdentity: withDefault(input.paymentIdentity, "payment-1"),
      provider: withDefault(input.provider, "EXIMBAY"),
      mode: withDefault(input.mode, "SANDBOX"),
    }),
  });
}

function withDefault<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

export function verifiedStatusFixtureWithoutStatus(): ProviderVerifiedEximbayStatus {
  return unsafeVerifiedStatusFixture({
    authority: "PROVIDER_VERIFIED_STATUS",
    transactionType: "PAYMENT",
    rescode: "0000",
    mid: "merchant-mid",
    orderId: "established-provider-order-1",
    currency: "USD",
    amount: "29.99",
    transactionId: "transaction-1",
    correlation: Object.freeze({
      paymentIdentity: "payment-1",
      provider: "EXIMBAY",
      mode: "SANDBOX",
    }),
  });
}

export function verifiedStatusFixtureWithoutTransactionId(): ProviderVerifiedEximbayStatus {
  return unsafeVerifiedStatusFixture({
    authority: "PROVIDER_VERIFIED_STATUS",
    transactionType: "PAYMENT",
    rescode: "0000",
    status: "SALE",
    mid: "merchant-mid",
    orderId: "established-provider-order-1",
    currency: "USD",
    amount: "29.99",
    correlation: Object.freeze({
      paymentIdentity: "payment-1",
      provider: "EXIMBAY",
      mode: "SANDBOX",
    }),
  });
}

interface VerifiedStatusFixtureShape {
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
}

function unsafeVerifiedStatusFixture(
  fixture: VerifiedStatusFixtureShape,
): ProviderVerifiedEximbayStatus {
  return createProviderVerifiedEximbayStatus({
    transactionType: fixture.transactionType,
    rescode: fixture.rescode,
    mid: fixture.mid,
    orderId: fixture.orderId,
    currency: fixture.currency,
    amount: fixture.amount,
    correlation: fixture.correlation,
    ...(fixture.status === undefined ? {} : { status: fixture.status }),
    ...(fixture.transactionId === undefined ? {} : { transactionId: fixture.transactionId }),
  });
}
