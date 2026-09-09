import {
  OrderStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
} from "@prisma/client";
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminGuardResult } from "@/lib/admin";
import type {
  RefundExecutionWorklistInput,
  RefundExecutionWorklistResult,
} from "@/lib/payment/refund/admin/execution-worklist";
import type { RefundExecutionWorklistViewModel } from "./view-model";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn<() => Promise<AdminGuardResult>>(),
  loadWorklist: vi.fn<(input: RefundExecutionWorklistInput) => Promise<RefundExecutionWorklistResult>>(),
  redirect: vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`); }),
  authorizationAction: vi.fn((): never => { throw new Error("UNEXPECTED_AUTHORIZATION_ACTION"); }),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
// Next compiles these Client Component imports into RPC references. The page
// unit test must not evaluate the server session/configuration behind that boundary.
vi.mock("@/app/actions/admin/refund-execution-authorization", () => ({
  issueRefundExecutionAuthorizationAction: mocks.authorizationAction,
  readRefundExecutionAuthorizationsAction: mocks.authorizationAction,
  revokeRefundExecutionAuthorizationAction: mocks.authorizationAction,
}));
vi.mock("@/lib/payment/refund/admin/execution-worklist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payment/refund/admin/execution-worklist")>();
  return { ...actual, loadRefundExecutionWorklist: mocks.loadWorklist };
});

import AdminRefundExecutionPage, { omitEmptyFormValue } from "./page";

const TRANSPORT_CASES: readonly [string, string | string[], string | string[] | undefined][] = [
  ["status", " ", " "],
  ["orderId", " ", " "],
  ["status", ["READY", "DONE"], ["READY", "DONE"]],
  ["orderId", [""], [""]],
  ["pageSize", "", undefined],
];

describe("admin refund execution page authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects guard failures before resolving params or reading refund data", async () => {
    const searchParams = new Promise<Record<string, string | string[] | undefined>>(() => undefined);
    mocks.requireAdmin.mockResolvedValue({ success: false, errorCode: "UNAUTHENTICATED" });

    await expect(AdminRefundExecutionPage({ searchParams })).rejects.toThrow("REDIRECT:/");

    expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith("/");
    expect(mocks.loadWorklist).not.toHaveBeenCalled();
    expect(mocks.authorizationAction).not.toHaveBeenCalled();
  });

  it("authorizes before one loader call and supplies one server-owned read time", async () => {
    const invocationOrder: string[] = [];
    mocks.requireAdmin.mockImplementation(() => {
      invocationOrder.push("guard");
      return Promise.resolve(adminGuard());
    });
    mocks.loadWorklist.mockImplementation(() => {
      invocationOrder.push("loader");
      return Promise.resolve(worklistResult());
    });

    const element = await AdminRefundExecutionPage({
      searchParams: Promise.resolve({ status: "READY", pageSize: "20" }),
    });

    expect(invocationOrder).toEqual(["guard", "loader"]);
    expect(mocks.authorizationAction).not.toHaveBeenCalled();
    expect(mocks.loadWorklist).toHaveBeenCalledTimes(1);
    const [input] = mocks.loadWorklist.mock.calls[0];
    expect(input).toMatchObject({ status: "READY", pageSize: "20" });
    expect(input.readTime).toBeInstanceOf(Date);
    expect(isValidElement<{ view: RefundExecutionWorklistViewModel }>(element)).toBe(true);
    if (!isValidElement<{ view: RefundExecutionWorklistViewModel }>(element)) throw new Error("Expected page element");
    expect(element.props.view.rows[0].orderId).toBe("order_page_guard");
  });

  it("maps the default GET form empty strings to omitted loader fields after authorization", async () => {
    const invocationOrder: string[] = [];
    mocks.requireAdmin.mockImplementation(() => {
      return Promise.resolve(adminGuard()).then((result) => {
        invocationOrder.push("guard");
        return result;
      });
    });
    mocks.loadWorklist.mockImplementation(() => {
      invocationOrder.push("loader");
      return Promise.resolve(worklistResult());
    });
    const searchParams = new TrackedSearchParams({
      status: "",
      leaseState: "all",
      orderId: "",
      pageSize: "20",
    }, () => invocationOrder.push("params"));

    const element = await AdminRefundExecutionPage({ searchParams });

    expect(invocationOrder).toEqual(["guard", "params", "loader"]);
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.loadWorklist).toHaveBeenCalledTimes(1);
    const [loaderInput] = mocks.loadWorklist.mock.calls[0];
    expect(loaderInput).toEqual(expect.objectContaining({
      status: undefined,
      leaseState: "all",
      orderId: undefined,
      pageSize: "20",
    }));
    expect(loaderInput.readTime).toBeInstanceOf(Date);
    expect(isValidElement<{ view: RefundExecutionWorklistViewModel }>(element)).toBe(true);
    if (!isValidElement<{ view: RefundExecutionWorklistViewModel }>(element)) throw new Error("Expected worklist page");
    expect(element.props.view.rows[0].orderId).toBe("order_page_guard");
  });

  it.each(TRANSPORT_CASES)("preserves the %s transport shape unless it is exactly empty", async (field, value, expected) => {
    mocks.requireAdmin.mockResolvedValue(adminGuard());
    mocks.loadWorklist.mockResolvedValue(worklistResult());

    await AdminRefundExecutionPage({ searchParams: Promise.resolve({ [field]: value }) });

    expect(mocks.loadWorklist).toHaveBeenCalledTimes(1);
    expect(mocks.loadWorklist.mock.calls[0][0]).toEqual(expect.objectContaining({ [field]: expected }));
  });

  it("does not omit unsupported non-string runtime shapes", () => {
    const objectValue = { value: "" };

    expect(omitEmptyFormValue(objectValue)).toBe(objectValue);
    expect(omitEmptyFormValue(0)).toBe(0);
  });
});

class TrackedSearchParams extends Promise<Record<string, string | string[] | undefined>> {
  private readonly onConsumed: () => void;

  static get [Symbol.species](): PromiseConstructor {
    return Promise;
  }

  constructor(value: Record<string, string | string[] | undefined>, onConsumed: () => void) {
    super((resolve) => resolve(value));
    this.onConsumed = onConsumed;
  }

  override then<TResult1 = Record<string, string | string[] | undefined>, TResult2 = never>(
    onfulfilled?: ((value: Record<string, string | string[] | undefined>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    this.onConsumed();
    return super.then(onfulfilled, onrejected);
  }
}

function adminGuard() {
  return {
    success: true as const,
    session: {
      user: { id: "admin_123", role: "ADMIN", name: "Admin", email: "admin@example.test" },
      expires: "2099-01-01",
    },
  };
}

function worklistResult(): RefundExecutionWorklistResult {
  const now = new Date("2026-07-11T08:00:00.000Z");
  return {
    rows: [{
      rowKey: "command_page_guard",
      orderId: "order_page_guard",
      refundAmount: 1_000,
      currency: "KRW",
      commandStatus: RefundExecutionCommandStatus.READY,
      attemptStatus: RefundAttemptStatus.PROCESSING,
      orderStatus: OrderStatus.REFUND_PENDING,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      dispatchAttempt: 0,
      availableAt: now,
      leaseUntil: null,
      createdAt: now,
      updatedAt: now,
      leaseDeadlinePassed: false,
      operationalDiagnosticCode: null,
      operationalDiagnosticMessage: null,
    }],
    nextCursor: null,
    filters: { status: RefundExecutionCommandStatus.READY, leaseState: "all", orderId: null, pageSize: 20 },
  };
}
