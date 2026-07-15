import {
  CustomerRefundIntakeReasonCode,
  OrderStatus,
} from "@prisma/client";
import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminGuardResult } from "@/lib/admin";
import type {
  AdminCustomerRefundIntakeQueuePage as QueuePageResult,
} from "@/lib/payment/refund/admin/customer-intake-read";

const mocks = vi.hoisted(() => ({
  db: { kind: "queue-page-db" },
  requireAdmin: vi.fn<() => Promise<AdminGuardResult>>(),
  loadQueue: vi.fn<() => Promise<QueuePageResult>>(),
  redirect: vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`); }),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/payment/refund/admin/customer-intake-read", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payment/refund/admin/customer-intake-read")>();
  return { ...actual, loadAdminCustomerRefundIntakeQueue: mocks.loadQueue };
});

import {
  AdminCustomerRefundIntakeQueueValidationError,
} from "@/lib/payment/refund/admin/customer-intake-read";
import AdminCustomerRefundIntakeQueuePage, {
  AdminCustomerRefundIntakeQueuePageView,
  InvalidQueueQueryPage,
} from "./page";

const NOW = new Date("2026-07-15T08:00:00.000Z");

describe("administrator customer refund intake queue page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(adminGuard());
    mocks.loadQueue.mockResolvedValue(queueResult());
  });

  it.each(["UNAUTHENTICATED", "FORBIDDEN"] as const)(
    "redirects %s before consuming searchParams or loading",
    async (errorCode) => {
      const searchParams = new Promise<Record<string, string | string[] | undefined>>(() => undefined);
      mocks.requireAdmin.mockResolvedValue({ success: false, errorCode });

      await expect(AdminCustomerRefundIntakeQueuePage({ searchParams })).rejects.toThrow("REDIRECT:/");

      expect(mocks.redirect).toHaveBeenCalledWith("/");
      expect(mocks.loadQueue).not.toHaveBeenCalled();
    },
  );

  it("authorizes before searchParams and passes only cursor to one loader call", async () => {
    const order: string[] = [];
    mocks.requireAdmin.mockImplementation(() => {
      order.push("guard");
      return Promise.resolve(adminGuard());
    });
    mocks.loadQueue.mockImplementation(() => {
      order.push("loader");
      return Promise.resolve(queueResult());
    });
    const searchParams = new TrackedSearchParams(
      { cursor: "opaque_cursor", ignored: "value" },
      () => order.push("params"),
    );

    const element = await AdminCustomerRefundIntakeQueuePage({ searchParams });

    expect(order).toEqual(["guard", "params", "loader"]);
    expect(mocks.loadQueue).toHaveBeenCalledWith(mocks.db, { cursor: "opaque_cursor" });
    expect(mocks.loadQueue).toHaveBeenCalledOnce();
    expect(isValidElement(element) && element.type).toBe(AdminCustomerRefundIntakeQueuePageView);
  });

  it("renders only the safe invalid-query state for the committed validation error", async () => {
    mocks.loadQueue.mockRejectedValue(new AdminCustomerRefundIntakeQueueValidationError(
      "INVALID_CURSOR",
      "raw cursor must not render",
    ));

    const element = await AdminCustomerRefundIntakeQueuePage({
      searchParams: Promise.resolve({ cursor: "bad" }),
    });
    const text = collectText(InvalidQueueQueryPage());

    expect(isValidElement(element) && element.type).toBe(InvalidQueueQueryPage);
    expect(text).toContain("조회 조건이 올바르지 않습니다.");
    expect(text).not.toContain("raw cursor");
    expect(collectHrefs(InvalidQueueQueryPage())).toContain("/admin/refunds/intakes");
  });

  it("propagates unrelated loader failures", async () => {
    const error = new Error("database unavailable");
    mocks.loadQueue.mockRejectedValue(error);

    await expect(AdminCustomerRefundIntakeQueuePage({
      searchParams: Promise.resolve({}),
    })).rejects.toBe(error);
  });

  it("renders empty, next, first-page, ownership, and Order-anchor presentation", () => {
    const empty = AdminCustomerRefundIntakeQueuePageView({
      view: { rows: [], nextHref: null, firstPageHref: null },
    });
    const populated = AdminCustomerRefundIntakeQueuePageView({
      view: {
        rows: [{
          renderKey: "intake_1",
          reasonLabel: "기타",
          submittedAt: "2026. 7. 15. 오전 8:00",
          orderStatusLabel: "결제 완료",
          orderTotal: "₩10,000",
          ownershipWarning: "소유자 확인 필요 — 거절로 종결하세요.",
          orderHref: "/admin/orders/order_1#customer-refund-intakes",
        }],
        nextHref: "/admin/refunds/intakes?cursor=next",
        firstPageHref: "/admin/refunds/intakes",
      },
    });

    expect(collectText(empty)).toContain("검토 대기 중인 환불 요청이 없습니다.");
    expect(collectText(populated)).toContain("소유자 확인 필요");
    expect(collectHrefs(populated)).toEqual(expect.arrayContaining([
      "/admin/orders/order_1#customer-refund-intakes",
      "/admin/refunds/intakes?cursor=next",
      "/admin/refunds/intakes",
    ]));
  });
});

class TrackedSearchParams extends Promise<Record<string, string | string[] | undefined>> {
  private readonly onConsumed: () => void;

  static get [Symbol.species](): PromiseConstructor {
    return Promise;
  }

  constructor(
    value: Record<string, string | string[] | undefined>,
    onConsumed: () => void,
  ) {
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

function queueResult(): QueuePageResult {
  return {
    items: [{
      intakeId: "intake_1",
      orderId: "order_1",
      reasonCode: CustomerRefundIntakeReasonCode.OTHER,
      submittedAt: NOW,
      orderStatus: OrderStatus.PAID,
      totalAmount: 10_000,
      currency: "KRW",
      ownershipConsistent: true,
    }],
    nextCursor: null,
  };
}

function collectText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  if (!isValidElement<{ children?: ReactNode }>(node)) return "";
  return collectText(node.props.children);
}

function collectHrefs(node: ReactNode): string[] {
  if (Array.isArray(node)) return node.flatMap(collectHrefs);
  if (!isValidElement<{ href?: string; children?: ReactNode }>(node)) return [];
  return [
    ...(typeof node.props.href === "string" ? [node.props.href] : []),
    ...collectHrefs(node.props.children),
  ];
}
