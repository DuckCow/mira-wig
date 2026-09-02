import {
  CheckoutSessionStatus,
  OrderStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentEventStatus,
  PaymentMode,
  PaymentProvider,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  classifySyntheticSaleStatusSnapshot,
  type SyntheticSaleStatusSnapshot,
} from "../status-readback";

describe("synthetic SALE exact status readback", () => {
  it("returns the exact bounded refund target for one durable success", () => {
    expect(classifySyntheticSaleStatusSnapshot(successfulSnapshot())).toEqual({
      state: "SUCCEEDED",
      sessionId: "session-1",
      exactReadback: {
        checkoutSession: {
          id: "session-1",
          status: CheckoutSessionStatus.COMPLETED,
          amount: 100,
          currency: "USD",
        },
        payment: {
          id: "payment-1",
          count: 1,
          provider: PaymentProvider.EXIMBAY,
          mode: PaymentMode.SANDBOX,
          status: PaymentAttemptStatus.SUCCEEDED,
          providerOrderId: "provider-order-1",
          providerPaymentKeyPresent: true,
          financialSucceededAtPresent: true,
        },
        order: {
          id: "order-1",
          count: 1,
          status: OrderStatus.PAID,
          amount: 100,
          currency: "USD",
        },
        audit: {
          eximbayStatusEventCount: 1,
          processedEximbayStatusEventCount: 1,
        },
        amountCurrencyCoherence: "EXACT",
        refundTargetReady: true,
        refundTargetReason: "READY",
      },
    });
  });

  it("fails closed on duplicate Payments", () => {
    const snapshot = successfulSnapshot();
    const result = classifySyntheticSaleStatusSnapshot({
      ...snapshot,
      paymentCount: 2,
      payments: Object.freeze([
        ...snapshot.payments,
        Object.freeze({ ...snapshot.payments[0], id: "payment-2" }),
      ]),
    });
    expect(result).toMatchObject({
      state: "AMBIGUOUS",
      exactReadback: {
        payment: { id: null, count: 2 },
        refundTargetReady: false,
        refundTargetReason: "PAYMENT_CARDINALITY",
      },
    });
  });

  it("fails closed on duplicate Orders", () => {
    const snapshot = successfulSnapshot();
    const result = classifySyntheticSaleStatusSnapshot({
      ...snapshot,
      orderCount: 2,
      orders: Object.freeze([
        ...snapshot.orders,
        Object.freeze({ ...snapshot.orders[0], id: "order-2" }),
      ]),
    });
    expect(result).toMatchObject({
      state: "AMBIGUOUS",
      exactReadback: {
        order: { id: null, count: 2 },
        refundTargetReady: false,
        refundTargetReason: "ORDER_CARDINALITY",
      },
    });
  });

  it("fails closed when durable success has no Order", () => {
    const result = classifySyntheticSaleStatusSnapshot({
      ...successfulSnapshot(),
      orderCount: 0,
      orders: Object.freeze([]),
    });
    expect(result).toMatchObject({
      state: "AMBIGUOUS",
      exactReadback: {
        order: { id: null, count: 0 },
        refundTargetReady: false,
        refundTargetReason: "ORDER_CARDINALITY",
      },
    });
  });

  it.each([
    ["payment amount", { payment: { amount: 101 } }],
    ["payment currency", { payment: { currency: "JPY" } }],
    ["order amount", { order: { totalAmount: 101 } }],
    ["order currency", { order: { currency: "JPY" } }],
  ] as const)("fails closed on %s mismatch", (_label, change) => {
    const snapshot = successfulSnapshot();
    const paymentChange = "payment" in change ? change.payment : {};
    const orderChange = "order" in change ? change.order : {};
    const result = classifySyntheticSaleStatusSnapshot({
      ...snapshot,
      payments: Object.freeze([
        Object.freeze({ ...snapshot.payments[0], ...paymentChange }),
      ]),
      orders: Object.freeze([
        Object.freeze({ ...snapshot.orders[0], ...orderChange }),
      ]),
    });
    expect(result).toMatchObject({
      state: "AMBIGUOUS",
      exactReadback: {
        amountCurrencyCoherence: "NOT_EXACT",
        refundTargetReady: false,
        refundTargetReason: "AMOUNT_CURRENCY_MISMATCH",
      },
    });
  });

  it.each([
    ["provider", { provider: PaymentProvider.TOSS }],
    ["mode", { mode: PaymentMode.LIVE }],
  ] as const)("fails closed on wrong %s", (_label, change) => {
    const snapshot = successfulSnapshot();
    const result = classifySyntheticSaleStatusSnapshot({
      ...snapshot,
      payments: Object.freeze([
        Object.freeze({ ...snapshot.payments[0], ...change }),
      ]),
    });
    expect(result).toMatchObject({
      state: "AMBIGUOUS",
      exactReadback: {
        refundTargetReady: false,
        refundTargetReason: "PAYMENT_IDENTITY_MISMATCH",
      },
    });
  });

  it("preserves pre-sale status without claiming refund readiness", () => {
    const snapshot = successfulSnapshot();
    expect(classifySyntheticSaleStatusSnapshot({
      ...snapshot,
      paymentCount: 0,
      payments: Object.freeze([]),
      orderCount: 0,
      orders: Object.freeze([]),
      eventCount: 0,
      processedEventCount: 0,
      events: Object.freeze([]),
      sessions: Object.freeze([
        Object.freeze({ ...snapshot.sessions[0], status: CheckoutSessionStatus.SUBMITTED }),
      ]),
    })).toMatchObject({
      state: "WAITING",
      sessionId: "session-1",
      exactReadback: {
        payment: { count: 0 },
        order: { count: 0 },
        refundTargetReady: false,
        refundTargetReason: "PAYMENT_CARDINALITY",
      },
    });
  });
});

function successfulSnapshot(): SyntheticSaleStatusSnapshot {
  return Object.freeze({
    sessionCount: 1,
    sessions: Object.freeze([Object.freeze({
      id: "session-1",
      status: CheckoutSessionStatus.COMPLETED,
      totalAmount: 100,
      currency: "USD",
    })]),
    paymentCount: 1,
    payments: Object.freeze([Object.freeze({
      id: "payment-1",
      checkoutSessionId: "session-1",
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
      amount: 100,
      currency: "USD",
      providerOrderId: "provider-order-1",
      providerPaymentKeyPresent: true,
      financialSucceededAtPresent: true,
    })]),
    orderCount: 1,
    orders: Object.freeze([Object.freeze({
      id: "order-1",
      checkoutSessionId: "session-1",
      paymentId: "payment-1",
      status: OrderStatus.PAID,
      totalAmount: 100,
      currency: "USD",
    })]),
    eventCount: 1,
    processedEventCount: 1,
    events: Object.freeze([Object.freeze({
      status: PaymentEventStatus.PROCESSED,
      verifiedMode: PaymentMode.SANDBOX,
      verifiedCredentialBindingPresent: true,
      providerPaymentKeyPresent: true,
    })]),
  });
}
