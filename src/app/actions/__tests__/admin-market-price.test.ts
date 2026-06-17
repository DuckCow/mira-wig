// ============================================================
// STRICT 존 — app/actions/admin/market-price 서버 액션 검증
// 가드 거부(미인증/CUSTOMER) + ADMIN 성공 + 경고 반환 + 예외 매핑.
// ============================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import { CatalogAdminException } from "@/lib/catalog-admin/types";

// ── 모듈 모킹 (hoisted) ───────────────────────────────────────

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

const mockSetVariantPrices = vi.fn();
const mockSetStyleMarketAvailability = vi.fn();
const mockFindMarketPriceGaps = vi.fn();

vi.mock("@/lib/catalog-admin/market-price", () => ({
  setVariantPrices: (...a: unknown[]): unknown => mockSetVariantPrices(...a),
  setStyleMarketAvailability: (...a: unknown[]): unknown => mockSetStyleMarketAvailability(...a),
  findMarketPriceGaps: (...a: unknown[]): unknown => mockFindMarketPriceGaps(...a),
}));

import { getSession } from "@/lib/session";
import {
  setVariantPricesAction,
  setStyleMarketAvailabilityAction,
  findMarketPriceGapsAction,
} from "../admin/market-price";

const mockGetSession = vi.mocked(getSession);

// ── 픽스처 ───────────────────────────────────────────────────

function makeSession(role: string): Session {
  return { user: { id: "u-1", email: "test@test.com", name: "Test", role }, expires: "2099-01-01" };
}

const ADMIN_SESSION = makeSession("ADMIN");
const CUSTOMER_SESSION = makeSession("CUSTOMER");

// ── 가드: 미인증 ──────────────────────────────────────────────

describe("admin market-price 액션 — 미인증", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(null);
  });

  it("setVariantPricesAction: 세션 없으면 UNAUTHENTICATED", async () => {
    const result = await setVariantPricesAction("v-1", [{ marketCode: "KR", amount: 85000 }]);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("UNAUTHENTICATED");
  });

  it("setStyleMarketAvailabilityAction: 세션 없으면 UNAUTHENTICATED", async () => {
    const result = await setStyleMarketAvailabilityAction("s-1", "KR", true);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("UNAUTHENTICATED");
  });

  it("findMarketPriceGapsAction: 세션 없으면 UNAUTHENTICATED", async () => {
    const result = await findMarketPriceGapsAction();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("UNAUTHENTICATED");
  });
});

// ── 가드: CUSTOMER ────────────────────────────────────────────

describe("admin market-price 액션 — CUSTOMER role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(CUSTOMER_SESSION);
  });

  it("setVariantPricesAction: CUSTOMER이면 FORBIDDEN", async () => {
    const result = await setVariantPricesAction("v-1", [{ marketCode: "KR", amount: 85000 }]);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("FORBIDDEN");
  });

  it("setStyleMarketAvailabilityAction: CUSTOMER이면 FORBIDDEN", async () => {
    const result = await setStyleMarketAvailabilityAction("s-1", "KR", true);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("FORBIDDEN");
  });

  it("findMarketPriceGapsAction: CUSTOMER이면 FORBIDDEN", async () => {
    const result = await findMarketPriceGapsAction();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("FORBIDDEN");
  });
});

// ── ADMIN: setVariantPricesAction ────────────────────────────

describe("setVariantPricesAction — ADMIN", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
  });

  it("성공 시 success: true", async () => {
    mockSetVariantPrices.mockResolvedValue(undefined);
    const result = await setVariantPricesAction("v-1", [{ marketCode: "KR", amount: 85000 }]);
    expect(result.success).toBe(true);
  });

  it("VARIANT_NOT_FOUND → errorCode로 매핑", async () => {
    mockSetVariantPrices.mockRejectedValue(new CatalogAdminException("VARIANT_NOT_FOUND", "없음"));
    const result = await setVariantPricesAction("no-v", [{ marketCode: "KR", amount: 85000 }]);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("VARIANT_NOT_FOUND");
  });

  it("INVALID_AMOUNT → errorCode로 매핑", async () => {
    mockSetVariantPrices.mockRejectedValue(new CatalogAdminException("INVALID_AMOUNT", "음수"));
    const result = await setVariantPricesAction("v-1", [{ marketCode: "KR", amount: -1 }]);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("INVALID_AMOUNT");
  });

  it("CatalogAdminException이 아닌 에러는 re-throw한다", async () => {
    mockSetVariantPrices.mockRejectedValue(new Error("DB 연결 오류"));
    await expect(
      setVariantPricesAction("v-1", [{ marketCode: "KR", amount: 85000 }]),
    ).rejects.toThrow("DB 연결 오류");
  });
});

// ── ADMIN: setStyleMarketAvailabilityAction ───────────────────

describe("setStyleMarketAvailabilityAction — ADMIN", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
  });

  it("갭 없으면 warnings 빈 배열로 success", async () => {
    mockSetStyleMarketAvailability.mockResolvedValue([]);
    const result = await setStyleMarketAvailabilityAction("s-1", "KR", true);
    expect(result.success).toBe(true);
    if (result.success) expect(result.warnings).toHaveLength(0);
  });

  it("갭 있어도 토글 성공 + warnings에 포함", async () => {
    mockSetStyleMarketAvailability.mockResolvedValue([
      { variantId: "v-1", sku: "TST-BLK-L-ST", marketCode: "KR" },
    ]);
    const result = await setStyleMarketAvailabilityAction("s-1", "KR", true);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({ variantId: "v-1", marketCode: "KR" });
    }
  });

  it("STYLE_NOT_FOUND → errorCode로 매핑", async () => {
    mockSetStyleMarketAvailability.mockRejectedValue(
      new CatalogAdminException("STYLE_NOT_FOUND", "없음"),
    );
    const result = await setStyleMarketAvailabilityAction("no-s", "KR", true);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("STYLE_NOT_FOUND");
  });
});

// ── ADMIN: findMarketPriceGapsAction ─────────────────────────

describe("findMarketPriceGapsAction — ADMIN", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
  });

  it("갭 없으면 빈 gaps 배열로 success", async () => {
    mockFindMarketPriceGaps.mockResolvedValue([]);
    const result = await findMarketPriceGapsAction();
    expect(result.success).toBe(true);
    if (result.success) expect(result.gaps).toHaveLength(0);
  });

  it("갭 있으면 gaps에 포함된다", async () => {
    mockFindMarketPriceGaps.mockResolvedValue([
      { wigStyleId: "s-1", styleName: "스타일", marketCode: "KR", variantId: "v-1", sku: "TST" },
    ]);
    const result = await findMarketPriceGapsAction();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0]).toMatchObject({ variantId: "v-1", marketCode: "KR" });
    }
  });
});
