import { RefundAttemptStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  POSTGRES_INT_MAX,
  deriveRefundLineCapacity,
  normalizeRefundLines,
  sameCanonicalRefundLines,
} from "../lines";

describe("refund line normalization", () => {
  it("trims identifiers and sorts a non-empty selection canonically", () => {
    expect(normalizeRefundLines([
      { orderItemId: " item_b ", quantity: 2 },
      { orderItemId: "item_a", quantity: 1 },
    ])).toEqual({
      ok: true,
      lines: [
        { orderItemId: "item_a", quantity: 1 },
        { orderItemId: "item_b", quantity: 2 },
      ],
    });
  });

  it.each([
    { lines: [] },
    { lines: [{ orderItemId: "", quantity: 1 }] },
    { lines: [{ orderItemId: "item", quantity: 0 }] },
    { lines: [{ orderItemId: "item", quantity: -1 }] },
    { lines: [{ orderItemId: "item", quantity: 1.5 }] },
    { lines: [{ orderItemId: "item", quantity: POSTGRES_INT_MAX + 1 }] },
    { lines: [{ orderItemId: "item", quantity: 1 }, { orderItemId: " item ", quantity: 2 }] },
  ])("rejects invalid line input %#", ({ lines }) => {
    expect(normalizeRefundLines(lines)).toMatchObject({ ok: false, code: "INVALID_REFUND_LINES" });
  });

  it("rejects an object with extra keys at the runtime boundary", () => {
    expect(normalizeRefundLines([{ orderItemId: "item", quantity: 1, extra: true }]))
      .toMatchObject({ ok: false, code: "INVALID_REFUND_LINES" });
  });

  it("compares canonical identity independently of caller ordering and whitespace", () => {
    expect(sameCanonicalRefundLines(
      [{ orderItemId: "item_b", quantity: 2 }, { orderItemId: "item_a", quantity: 1 }],
      [{ orderItemId: " item_a ", quantity: 1 }, { orderItemId: "item_b", quantity: 2 }],
    )).toBe(true);
  });
});

describe("refund line capacity", () => {
  const guarded = [
    RefundAttemptStatus.SUCCEEDED,
    RefundAttemptStatus.REQUESTED,
    RefundAttemptStatus.PROCESSING,
    RefundAttemptStatus.MANUAL_REVIEW,
    RefundAttemptStatus.FAILED_RETRYABLE,
  ] as const;

  it.each(guarded)("reserves quantity in %s", (status) => {
    const result = deriveRefundLineCapacity("order", [{ id: "item", quantity: 3 }], [{
      status,
      lines: [{ orderId: "order", orderItemId: "item", quantity: 2 }],
    }]);
    expect(result.ok && result.remainingByOrderItemId.get("item")).toBe(1);
  });

  it.each([RefundAttemptStatus.CANCELLED, RefundAttemptStatus.FAILED_TERMINAL])(
    "does not reserve terminal quantity in %s",
    (status) => {
      const result = deriveRefundLineCapacity("order", [{ id: "item", quantity: 3 }], [{
        status,
        lines: [{ orderId: "order", orderItemId: "item", quantity: 3 }],
      }]);
      expect(result.ok && result.remainingByOrderItemId.get("item")).toBe(3);
    },
  );

  it("fails closed for a guarded historical line-less attempt", () => {
    expect(deriveRefundLineCapacity("order", [{ id: "item", quantity: 1 }], [{
      status: RefundAttemptStatus.SUCCEEDED,
      lines: [],
    }])).toEqual({ ok: false, code: "REFUND_LINE_HISTORY_UNATTRIBUTED" });
  });

  it("ignores a terminal historical line-less attempt", () => {
    const result = deriveRefundLineCapacity("order", [{ id: "item", quantity: 1 }], [{
      status: RefundAttemptStatus.FAILED_TERMINAL,
      lines: [],
    }]);
    expect(result.ok && result.remainingByOrderItemId.get("item")).toBe(1);
  });

  it("tracks independent capacity for separate Order items", () => {
    const result = deriveRefundLineCapacity("order", [
      { id: "item_a", quantity: 3 },
      { id: "item_b", quantity: 2 },
    ], [{
      status: RefundAttemptStatus.SUCCEEDED,
      lines: [{ orderId: "order", orderItemId: "item_a", quantity: 1 }],
    }]);
    expect(result.ok && [...result.remainingByOrderItemId]).toEqual([
      ["item_a", 2],
      ["item_b", 2],
    ]);
  });

  it.each([
    { lines: [{ orderId: "other", orderItemId: "item", quantity: 1 }] },
    { lines: [{ orderId: "order", orderItemId: "missing", quantity: 1 }] },
    { lines: [{ orderId: "order", orderItemId: "item", quantity: 4 }] },
  ])("fails closed for inconsistent ledger evidence %#", ({ lines }) => {
    expect(deriveRefundLineCapacity("order", [{ id: "item", quantity: 3 }], [{
      status: RefundAttemptStatus.SUCCEEDED,
      lines,
    }])).toEqual({ ok: false, code: "REFUND_LINE_LEDGER_INCONSISTENT" });
  });
});
