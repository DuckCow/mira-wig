import {
  CustomerRefundIntakeReasonCode,
  CustomerRefundIntakeStatus,
  FulfillmentType,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
} from "@prisma/client";
import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerRefundIntakeReadModel } from "@/lib/payment/refund/customer-intake-read";
import type { CustomerOrderDetailRecord } from "./customer-order-detail-data";

interface OwnedOrderQuery {
  select: {
    payment: { select: Record<string, boolean> };
    refundAttempts: { select: Record<string, boolean> };
  };
}

const mocks = vi.hoisted(() => {
  const orderFindFirst = vi.fn<(query: OwnedOrderQuery) => Promise<unknown>>();
  const db = { order: { findFirst: orderFindFirst } };
  return {
    db,
    getAuthenticationLocale: vi.fn(),
    getSession: vi.fn(),
    getStorefrontContext: vi.fn(),
    orderFindFirst,
    loadIntake: vi.fn(),
    submitEnabled: vi.fn(),
    redirect: vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`); }),
    notFound: vi.fn((): never => { throw new Error("NOT_FOUND"); }),
  };
});

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/market", () => ({
  getAuthenticationLocale: mocks.getAuthenticationLocale,
  getStorefrontContext: mocks.getStorefrontContext,
}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/payment/refund/customer-intake-read", () => ({
  loadCustomerRefundIntakeReadModel: mocks.loadIntake,
}));
vi.mock("@/lib/payment/refund/customer-intake-activation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payment/refund/customer-intake-activation")>();
  return { ...actual, isCustomerRefundIntakeSubmitEnabled: mocks.submitEnabled };
});
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("./CustomerRefundIntakeSection", () => ({ CustomerRefundIntakeSection: () => null }));

import {
  CustomerRefundIntakeActivationConfigError,
} from "@/lib/payment/refund/customer-intake-activation";
import OrderPage, { CustomerOrderDetailView, generateMetadata } from "./page";

describe("customer Order-detail authorization and intake composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(customerSession("customer_1"));
    mocks.getAuthenticationLocale.mockResolvedValue("ko");
    mocks.getStorefrontContext.mockResolvedValue({ locale: "ko" });
    mocks.orderFindFirst.mockResolvedValue(rawOrderFixture());
    mocks.loadIntake.mockResolvedValue(intakeFixture());
    mocks.submitEnabled.mockReturnValue(true);
  });

  it("completes authentication before consuming params and redirects with the existing callback", async () => {
    const sequence: string[] = [];
    mocks.getSession.mockImplementation(() => {
      sequence.push("session");
      return Promise.resolve(null);
    });
    const params = new TrackedParams({ id: "order_1" }, () => sequence.push("params"));

    await expect(OrderPage({ params })).rejects.toThrow(
      "REDIRECT:/login?callbackUrl=%2Forders%2Forder_1",
    );

    expect(sequence).toEqual(["session", "params"]);
    expect(mocks.submitEnabled).not.toHaveBeenCalled();
    expect(mocks.orderFindFirst).not.toHaveBeenCalled();
    expect(mocks.loadIntake).not.toHaveBeenCalled();
  });

  it("fails a whitespace authenticated actor before params, gate, or loaders with static copy", async () => {
    const params = new TrackedParams({ id: "private_order" }, () => {
      throw new Error("params must not be consumed");
    });
    mocks.getSession.mockResolvedValue(customerSession(" \t\n "));

    await expect(OrderPage({ params })).rejects.toThrow(
      "Customer Order-detail boundary invariant failed.",
    );

    expect(mocks.submitEnabled).not.toHaveBeenCalled();
    expect(mocks.orderFindFirst).not.toHaveBeenCalled();
    expect(mocks.loadIntake).not.toHaveBeenCalled();
  });

  it("passes the trimmed authenticated actor to both independent owned reads", async () => {
    mocks.getSession.mockResolvedValue(customerSession("  customer_1  "));

    const element = await OrderPage({ params: Promise.resolve({ id: "order_1" }) });

    expect(mocks.orderFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "order_1", userId: "customer_1" },
    }));
    expect(mocks.loadIntake).toHaveBeenCalledWith(
      mocks.db,
      { orderId: "order_1", customerUserId: "customer_1", submitEnabled: true },
    );
    expect(viewProps(element)?.intake).toEqual(intakeFixture());
  });

  it("renders an owned historical Order with zero active current Markets", async () => {
    const { NoActiveMarketException } = await import("@/lib/market/active-market");
    mocks.getStorefrontContext.mockRejectedValue(new NoActiveMarketException());
    mocks.getAuthenticationLocale.mockResolvedValue("ja");

    const element = await OrderPage({ params: Promise.resolve({ id: "order_1" }) });

    expect(isValidElement(element) && element.type).toBe(CustomerOrderDetailView);
    expect(viewProps(element)?.locale).toBe("ja");
    expect(mocks.getAuthenticationLocale).toHaveBeenCalledOnce();
    expect(mocks.getStorefrontContext).not.toHaveBeenCalled();
  });

  it("keeps a foreign customer's Order behind the owned-order predicate", async () => {
    mocks.getSession.mockResolvedValue(customerSession("customer_foreign"));
    mocks.orderFindFirst.mockResolvedValue(null);

    await expect(OrderPage({ params: Promise.resolve({ id: "order_1" }) })).rejects.toThrow("NOT_FOUND");

    expect(mocks.orderFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "order_1", userId: "customer_foreign" },
    }));
  });

  it("starts both reads through Promise.all before either read settles", async () => {
    const orderDeferred = deferred<ReturnType<typeof rawOrderFixture>>();
    const intakeDeferred = deferred<CustomerRefundIntakeReadModel>();
    mocks.orderFindFirst.mockReturnValue(orderDeferred.promise);
    mocks.loadIntake.mockReturnValue(intakeDeferred.promise);

    const pending = OrderPage({ params: Promise.resolve({ id: "order_1" }) });
    await vi.waitFor(() => {
      expect(mocks.orderFindFirst).toHaveBeenCalledOnce();
      expect(mocks.loadIntake).toHaveBeenCalledOnce();
    });
    orderDeferred.resolve(rawOrderFixture());
    intakeDeferred.resolve(intakeFixture());

    const element = await pending;
    expect(isValidElement(element) && element.type).toBe(CustomerOrderDetailView);
  });

  it("degrades only typed activation configuration errors and retains the safe withdrawal model", async () => {
    const intake = intakeFixture({
      latestIntake: {
        status: CustomerRefundIntakeStatus.SUBMITTED,
        reasonCode: CustomerRefundIntakeReasonCode.PRODUCT_DEFECT,
        reasonDetail: "safe customer detail",
        submittedAt: new Date("2026-07-15T00:00:00.000Z"),
        withdrawnAt: null,
      },
      canSubmit: false,
      canWithdraw: true,
      submissionUnavailableReason: "FEATURE_DISABLED",
    });
    mocks.submitEnabled.mockImplementation(() => {
      throw new CustomerRefundIntakeActivationConfigError("CUSTOMER_REFUND_INTAKE_SUBMIT_ENABLED");
    });
    mocks.loadIntake.mockResolvedValue(intake);

    const element = await OrderPage({ params: Promise.resolve({ id: "order_1" }) });

    expect(mocks.loadIntake).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      submitEnabled: false,
    }));
    expect(viewProps(element)?.intake).toEqual(intake);
  });

  it("propagates unrelated activation errors before either loader", async () => {
    const error = new Error("activation subsystem unavailable");
    mocks.submitEnabled.mockImplementation(() => { throw error; });

    await expect(OrderPage({ params: Promise.resolve({ id: "order_1" }) })).rejects.toBe(error);

    expect(mocks.orderFindFirst).not.toHaveBeenCalled();
    expect(mocks.loadIntake).not.toHaveBeenCalled();
  });

  it.each([
    ["owned Order", null, intakeFixture()],
    ["intake projection", rawOrderFixture(), null],
  ])("returns notFound when the %s read is missing", async (_label, order, intake) => {
    mocks.orderFindFirst.mockResolvedValue(order);
    mocks.loadIntake.mockResolvedValue(intake);

    await expect(OrderPage({ params: Promise.resolve({ id: "order_1" }) })).rejects.toThrow("NOT_FOUND");

    expect(mocks.orderFindFirst).toHaveBeenCalledOnce();
    expect(mocks.loadIntake).toHaveBeenCalledOnce();
  });

  it("loads each owned projection exactly once and returns the server view", async () => {
    const element = await OrderPage({ params: Promise.resolve({ id: "order_1" }) });

    expect(mocks.orderFindFirst).toHaveBeenCalledOnce();
    expect(mocks.loadIntake).toHaveBeenCalledOnce();
    expect(isValidElement(element) && element.type).toBe(CustomerOrderDetailView);
    expect(Object.keys(viewProps(element)?.intake ?? {}).sort()).toEqual([
      "canSubmit",
      "canWithdraw",
      "latestIntake",
      "orderId",
      "orderStatus",
      "submissionUnavailableReason",
    ]);
    expect(viewProps(element)?.locale).toBe("ko");
    const query = mocks.orderFindFirst.mock.calls[0]?.[0];
    expect(query?.select.payment.select).toMatchObject({ id: true, provider: true, mode: true });
    expect(query?.select.refundAttempts.select).toMatchObject({
      orderId: true,
      paymentId: true,
      amount: true,
      currency: true,
      provider: true,
      mode: true,
      status: true,
      processedAt: true,
    });
    const browserProjection = JSON.stringify(viewProps(element));
    expect(browserProjection).not.toMatch(/providerPaymentKey|providerOrderId|payment_1|mock:order_1/u);
  });

  it.each([
    ["ko", "주문 상세"],
    ["en", "Order details"],
    ["ja", "注文詳細"],
  ] as const)("generates route-specific %s metadata", async (locale, title) => {
    mocks.getAuthenticationLocale.mockResolvedValue(locale);

    await expect(generateMetadata()).resolves.toEqual({ title });
  });

  it.each([
    ["ko", "주문 확인", "결제 내역"],
    ["en", "Order confirmation", "Payment details"],
    ["ja", "注文確認", "決済内容"],
  ] as const)("renders the order surface in current %s locale", (locale, heading, paymentHeading) => {
    const html = renderToStaticMarkup(CustomerOrderDetailView({
      order: orderFixture(), intake: intakeFixture(), locale,
    }));
    expect(html).toContain(heading);
    expect(html).toContain(paymentHeading);
    if (locale !== "ko") expect(html).not.toMatch(/[가-힣]/u);
  });

  it.each([
    ["ko", "Black / 미디 / 직모"],
    ["en", "Black / Medium / Straight"],
    ["ja", "Black / ミディアム / ストレート"],
  ] as const)("renders persisted item option codes through the %s presentation owner", (locale, label) => {
    const order = orderFixture();
    order.items = [orderItem(10_000, "KRW")];

    const html = renderToStaticMarkup(CustomerOrderDetailView({
      order,
      intake: intakeFixture(),
      locale,
    }));

    expect(html).toContain(label);
    if (locale !== "en") expect(html).not.toContain(">Black / medium / straight<");
  });

  it("preserves unknown historical option identity without a current-catalog lookup", () => {
    const order = orderFixture();
    const item = orderItem(10_000, "KRW");
    item.snapshotData = {
      styleName: "Historical item",
      color: "Black",
      colorHex: "#000000",
      length: "heritage-length",
      curl: "archive-curl",
      coverImageKey: null,
      currencyCode: "KRW",
    };
    order.items = [item];

    const html = renderToStaticMarkup(CustomerOrderDetailView({
      order,
      intake: intakeFixture(),
      locale: "ja",
    }));

    expect(html).toContain("Black / heritage-length / archive-curl");
  });

  it.each([
    [PaymentProvider.TOSS, "Domestic card payment"],
    [PaymentProvider.EXIMBAY, "International card payment"],
  ])("renders %s payment details without a provider-receipt surface", (provider, paymentLabel) => {
    const order = orderFixture();
    order.payment = {
      ...order.payment,
      provider,
    };
    const html = renderToStaticMarkup(CustomerOrderDetailView({ order, intake: intakeFixture(), locale: "en" }));
    expect(html).toContain(paymentLabel);
    expect(html).not.toMatch(/receipt|영수증|領収|\/orders\/order_1\/receipt|providerPaymentKey|providerOrderId|MID/iu);
    expect(html).not.toContain("<form");
  });

  it("shows completed and pending refund facts without exposing an attempt ledger", () => {
    const order = orderFixture();
    order.refundSummary = {
      completion: "PARTIAL",
      totalSucceededRefundAmount: 2_000,
      latestSucceededRefundAt: new Date("2026-08-22T00:00:00.000Z"),
      hasPendingRefund: true,
      invariantFailure: false,
    };
    const html = renderToStaticMarkup(CustomerOrderDetailView({ order, intake: intakeFixture(), locale: "en" }));
    expect(html).toContain("Partial refund complete");
    expect(html).toContain("Refund processing");
    expect(html).toContain("₩2,000");
    expect(html).not.toMatch(/providerRefundId|dispatch|lease|MANUAL_REVIEW/u);
  });

  it("uses Order.currency for item money even when snapshot currency differs", () => {
    const order = orderFixture();
    order.currency = "USD";
    order.subtotalAmount = 2_999;
    order.totalAmount = 2_999;
    order.payment = { ...order.payment, amount: 2_999, currency: "USD" };
    order.items = [orderItem(2_999, "JPY")];

    const html = renderToStaticMarkup(CustomerOrderDetailView({ order, intake: intakeFixture(), locale: "ko" }));

    expect(html).toContain("$29.99");
    expect(html).not.toContain("¥2,999");
  });

  it("keeps unknown Order and Payment currency identity without snapshot override", () => {
    const order = orderFixture();
    order.currency = "XYZ";
    order.subtotalAmount = 12_345;
    order.totalAmount = 12_345;
    order.payment = { ...order.payment, amount: 12_345, currency: "XYZ" };
    order.items = [orderItem(12_345, "KRW")];

    const html = renderToStaticMarkup(CustomerOrderDetailView({ order, intake: intakeFixture(), locale: "ko" }));

    expect(html).toContain("XYZ · 저장된 최소 단위 12345 · 소수 자릿수 확인 불가");
    expect(html).not.toMatch(/KRW|₩|123\.45/);
  });
});

class TrackedParams extends Promise<{ id: string }> {
  private readonly onConsumed: () => void;

  static get [Symbol.species](): PromiseConstructor {
    return Promise;
  }

  constructor(value: { id: string }, onConsumed: () => void) {
    super((resolve) => resolve(value));
    this.onConsumed = onConsumed;
  }

  override then<TResult1 = { id: string }, TResult2 = never>(
    onfulfilled?: ((value: { id: string }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    this.onConsumed();
    return super.then(onfulfilled, onrejected);
  }
}

function customerSession(id: string) {
  return {
    user: { id, role: "CUSTOMER", name: "Customer", email: "customer@example.test" },
    expires: "2099-01-01",
  };
}

function orderFixture(): CustomerOrderDetailRecord {
  return {
    id: "order_1",
    status: OrderStatus.PAID,
    paidAt: new Date("2026-07-15T00:00:00.000Z"),
    currency: "KRW",
    subtotalAmount: 10_000,
    shippingAmount: 0,
    totalAmount: 10_000,
    items: [],
    shipping: null,
    payment: {
      status: PaymentAttemptStatus.SUCCEEDED,
      amount: 10_000,
      currency: "KRW",
      provider: PaymentProvider.MOCK,
    },
    refundSummary: {
      completion: "NONE",
      totalSucceededRefundAmount: 0,
      latestSucceededRefundAt: null,
      hasPendingRefund: false,
      invariantFailure: false,
    },
  };
}

function rawOrderFixture() {
  const { refundSummary: _refundSummary, payment, ...order } = orderFixture();
  return {
    ...order,
    payment: {
      ...payment,
      id: "payment_1",
      mode: PaymentMode.SANDBOX,
    },
    refundAttempts: [],
  };
}

function orderItem(unitAmount: number, snapshotCurrency: string): CustomerOrderDetailRecord["items"][number] {
  return {
    id: "item_1",
    quantity: 1,
    unitAmount,
    fulfillmentType: FulfillmentType.MTO,
    snapshotData: {
      styleName: "Historical item",
      color: "Black",
      colorHex: "#000000",
      length: "medium",
      curl: "straight",
      coverImageKey: null,
      currencyCode: snapshotCurrency,
    },
  };
}

function intakeFixture(
  overrides: Partial<CustomerRefundIntakeReadModel> = {},
): CustomerRefundIntakeReadModel {
  return {
    orderId: "order_1",
    orderStatus: OrderStatus.PAID,
    latestIntake: null,
    canSubmit: true,
    canWithdraw: false,
    submissionUnavailableReason: null,
    ...overrides,
  };
}

function viewProps(element: unknown): {
  order: ReturnType<typeof orderFixture>;
  intake: CustomerRefundIntakeReadModel;
  locale: "ko" | "en" | "ja";
} | null {
  return isValidElement<{
    order: ReturnType<typeof orderFixture>;
    intake: CustomerRefundIntakeReadModel;
    locale: "ko" | "en" | "ja";
  }>(element) ? element.props : null;
}

function deferred<T>() {
  let resolvePromise: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => { resolvePromise = resolve; });
  return {
    promise,
    resolve(value: T) {
      if (!resolvePromise) throw new Error("Deferred promise was not initialized.");
      resolvePromise(value);
    },
  };
}
