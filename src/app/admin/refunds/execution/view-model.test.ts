import {
  OrderStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import type {
  RefundExecutionWorklistResult,
  RefundExecutionWorklistRow,
} from "@/lib/payment/refund/admin/execution-worklist";
import {
  buildRefundExecutionWorklistViewModel,
  commandStatusLabel,
  truncateCodePoints,
} from "./view-model";

const NOW = new Date("2026-07-11T08:00:00.000Z");

describe("refund execution worklist view model", () => {
  it.each([
    [RefundExecutionCommandStatus.READY, "실행 대기"],
    [RefundExecutionCommandStatus.LEASED, "처리 주체 할당됨"],
    [RefundExecutionCommandStatus.WAITING_EVIDENCE, "결과 확인 대기"],
    [RefundExecutionCommandStatus.WAITING_RETRY, "재시도 정책 확인 필요"],
    [RefundExecutionCommandStatus.PARKED, "운영 확인 필요"],
    [RefundExecutionCommandStatus.DONE, "처리 기록 완료"],
  ])("maps %s without implying execution outcomes", (status, label) => {
    expect(commandStatusLabel(status)).toBe(label);
  });

  it("renders the passed lease deadline and active lease with observational copy", () => {
    const passed = buildResult({ commandStatus: RefundExecutionCommandStatus.LEASED, leaseDeadlinePassed: true });
    const active = buildResult({
      commandStatus: RefundExecutionCommandStatus.LEASED,
      leaseUntil: new Date(NOW.getTime() + 60_000),
    });

    expect(buildRefundExecutionWorklistViewModel(passed).rows[0].leaseState)
      .toBe("리스 기한 경과 · 조사 필요");
    expect(buildRefundExecutionWorklistViewModel(active).rows[0].leaseState).toBe("리스 활성");
  });

  it("formats stored timestamps in ko-KR and links only to the owning Order", () => {
    const view = buildRefundExecutionWorklistViewModel(buildResult()).rows[0];
    const expected = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(NOW);

    expect(view.createdAt).toBe(expected);
    expect(view.availableAt).toBe(expected);
    expect(view.orderHref).toBe("/admin/orders/order_123");
  });

  it("omits null diagnostics and keeps code and message as separate fields", () => {
    const absent = buildRefundExecutionWorklistViewModel(buildResult()).rows[0];
    const present = buildRefundExecutionWorklistViewModel(buildResult({
      operationalDiagnosticCode: "SAFE_CODE",
      operationalDiagnosticMessage: "Safe operator message",
    })).rows[0];

    expect(absent.diagnostic).toBeNull();
    expect(present.diagnostic).toEqual({ code: "SAFE_CODE", message: "Safe operator message" });
  });

  it("truncates diagnostics at 120 Unicode code points with one ellipsis", () => {
    const exact = "😀".repeat(120);
    const over = `${exact}끝`;

    expect(truncateCodePoints(exact, 120)).toBe(exact);
    expect(truncateCodePoints(over, 120)).toBe(`${exact}…`);
    expect(Array.from(truncateCodePoints(over, 120))).toHaveLength(121);
  });

  it("preserves current filters in the opaque next-page link", () => {
    const result = buildResult();
    const view = buildRefundExecutionWorklistViewModel({
      ...result,
      nextCursor: "opaque_cursor",
      filters: {
        status: RefundExecutionCommandStatus.LEASED,
        leaseState: "deadline-passed",
        orderId: "order_123",
        pageSize: 30,
      },
    });

    expect(view.nextHref).toBe(
      "/admin/refunds/execution?status=LEASED&leaseState=deadline-passed&orderId=order_123&pageSize=30&cursor=opaque_cursor",
    );
  });

  it("returns a clean empty state model and excludes private execution identities", () => {
    const empty = buildRefundExecutionWorklistViewModel({
      rows: [],
      nextCursor: null,
      filters: { status: null, leaseState: "all", orderId: null, pageSize: 20 },
    });
    const serialized = JSON.stringify(buildRefundExecutionWorklistViewModel(buildResult()));

    expect(empty.rows).toEqual([]);
    expect(empty.nextHref).toBeNull();
    for (const forbidden of [
      "command_private_id",
      "providerPaymentKey",
      "sourceDedupKey",
      "operationKey",
      "authorizeRefundDispatch",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function buildResult(
  overrides: Partial<RefundExecutionWorklistRow> = {},
): RefundExecutionWorklistResult {
  return {
    rows: [{
      rowKey: "command_private_id",
      orderId: "order_123",
      refundAmount: 1_000,
      currency: "KRW",
      commandStatus: RefundExecutionCommandStatus.READY,
      attemptStatus: RefundAttemptStatus.PROCESSING,
      orderStatus: OrderStatus.REFUND_PENDING,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      dispatchAttempt: 0,
      availableAt: NOW,
      leaseUntil: null,
      createdAt: NOW,
      updatedAt: NOW,
      leaseDeadlinePassed: false,
      operationalDiagnosticCode: null,
      operationalDiagnosticMessage: null,
      ...overrides,
    }],
    nextCursor: null,
    filters: { status: null, leaseState: "all", orderId: null, pageSize: 20 },
  };
}
