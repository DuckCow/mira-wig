import {
  CustomerRefundIntakeReasonCode,
  CustomerRefundIntakeStatus,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
} from "@prisma/client";
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerRefundIntakeReadModel } from "@/lib/payment/refund/customer-intake-read";

const mocks = vi.hoisted(() => {
  const orderFindFirst = vi.fn();
  const db = { order: { findFirst: orderFindFirst } };
  return {
    db,
    getSession: vi.fn(),
    orderFindFirst,
    loadIntake: vi.fn(),
    submitEnabled: vi.fn(),
    redirect: vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`); }),
    notFound: vi.fn((): never => { throw new Error("NOT_FOUND"); }),
  };
});

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
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
import OrderPage, { CustomerOrderDetailView } from "./page";

describe("customer Order-detail authorization and intake composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(customerSession("customer_1"));
    mocks.orderFindFirst.mockResolvedValue(orderFixture());
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

  it("starts both reads through Promise.all before either read settles", async () => {
    const orderDeferred = deferred<ReturnType<typeof orderFixture>>();
    const intakeDeferred = deferred<CustomerRefundIntakeReadModel>();
    mocks.orderFindFirst.mockReturnValue(orderDeferred.promise);
    mocks.loadIntake.mockReturnValue(intakeDeferred.promise);

    const pending = OrderPage({ params: Promise.resolve({ id: "order_1" }) });
    await vi.waitFor(() => {
      expect(mocks.orderFindFirst).toHaveBeenCalledOnce();
      expect(mocks.loadIntake).toHaveBeenCalledOnce();
    });
    orderDeferred.resolve(orderFixture());
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
    ["intake projection", orderFixture(), null],
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

function orderFixture() {
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
      mode: PaymentMode.SANDBOX,
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
} | null {
  return isValidElement<{
    order: ReturnType<typeof orderFixture>;
    intake: CustomerRefundIntakeReadModel;
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
