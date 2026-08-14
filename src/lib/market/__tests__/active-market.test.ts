import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  marketFindMany: vi.fn(),
  marketCount: vi.fn(),
  styleFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    market: { findMany: dbMock.marketFindMany, count: dbMock.marketCount },
    wigStyle: { findFirst: dbMock.styleFindFirst },
  },
}));

import { getActiveMarketCodes, getActiveSiteVariants, getPublishedSiteVariants, isActiveMarket } from "../active-market";

describe("server-owned active Market adapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only configured active Market codes in deterministic order", async () => {
    dbMock.marketFindMany.mockResolvedValue([{ code: "JP" }, { code: "KR" }, { code: "UNKNOWN" }]);

    await expect(getActiveMarketCodes()).resolves.toEqual(["KR", "JP"]);
    await expect(getActiveSiteVariants()).resolves.toEqual([
      { marketCode: "KR", locale: "ko" },
      { marketCode: "KR", locale: "en" },
      { marketCode: "JP", locale: "ja" },
      { marketCode: "JP", locale: "en" },
    ]);
  });

  it("answers active admission from Market.isActive only", async () => {
    dbMock.marketCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await expect(isActiveMarket("US")).resolves.toBe(true);
    await expect(isActiveMarket("US")).resolves.toBe(false);
  });

  it("intersects product alternates with active published Markets", async () => {
    dbMock.styleFindFirst.mockResolvedValue({
      availableMarkets: [{ marketCode: "KR" }, { marketCode: "JP" }],
    });

    await expect(getPublishedSiteVariants("style-a")).resolves.toEqual([
      { marketCode: "KR", locale: "ko" },
      { marketCode: "KR", locale: "en" },
      { marketCode: "JP", locale: "ja" },
      { marketCode: "JP", locale: "en" },
    ]);
    expect(dbMock.styleFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "style-a", isActive: true },
    }));
  });
});
