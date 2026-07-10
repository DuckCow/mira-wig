import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockFindUniqueArgs {
  where: { id: string };
  select: {
    refundAttempts: {
      select: {
        transitions: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }];
          select: Record<string, true>;
        };
      };
    };
  };
}

const mockFindUnique = vi.hoisted(() => vi.fn<(args: MockFindUniqueArgs) => Promise<null>>());

vi.mock("@/lib/db", () => ({
  db: { order: { findUnique: mockFindUnique } },
}));

import { loadAdminOrderDetail } from "./admin-order-detail-data";

describe("admin order detail transition query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue(null);
  });

  it("selects the minimal nested transition projection in deterministic chronological order", async () => {
    await loadAdminOrderDetail("order_123");

    expect(mockFindUnique).toHaveBeenCalledTimes(1);
    const [query] = mockFindUnique.mock.calls[0];
    expect(query.where).toEqual({ id: "order_123" });
    expect(query.select.refundAttempts.select.transitions).toEqual({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        orderStatusBefore: true,
        orderStatusAfter: true,
        actorType: true,
        reason: true,
        createdAt: true,
      },
    });
  });
});
