// ============================================================
// STRICT 존 — admin/catalog.ts 서버 액션 행동 검증
// 가드 거부(미인증/CUSTOMER) + ADMIN 성공 + lib 예외 매핑을 검증한다.
// ============================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
// CatalogAdminException은 types.ts에서 직접 import — @/lib/catalog-admin(모킹 대상)
// 에서 가져오면 vi.mock 호이스팅 충돌. FittingException 패턴과 동일.
import { CatalogAdminException } from "@/lib/catalog-admin/types";

// ── 모듈 모킹 (hoisted) ───────────────────────────────────────

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

const mockCreateWigStyle = vi.fn();
const mockUpdateWigStyle = vi.fn();
const mockDeactivateWigStyle = vi.fn();
const mockCreateWigVariant = vi.fn();
const mockUpdateVariantStock = vi.fn();
const mockDeactivateWigVariant = vi.fn();

vi.mock("@/lib/catalog-admin", () => ({
  createWigStyle: (...a: unknown[]): unknown => mockCreateWigStyle(...a),
  updateWigStyle: (...a: unknown[]): unknown => mockUpdateWigStyle(...a),
  deactivateWigStyle: (...a: unknown[]): unknown => mockDeactivateWigStyle(...a),
  createWigVariant: (...a: unknown[]): unknown => mockCreateWigVariant(...a),
  updateWigStyle2: vi.fn(),
  updateWigVariant: vi.fn(),
  updateVariantStock: (...a: unknown[]): unknown => mockUpdateVariantStock(...a),
  deactivateWigVariant: (...a: unknown[]): unknown => mockDeactivateWigVariant(...a),
  CatalogAdminException,
}));

import { getSession } from "@/lib/session";
import {
  createStyleAction,
  updateStyleAction,
  deactivateStyleAction,
  createVariantAction,
  updateStockAction,
  deactivateVariantAction,
} from "../admin/catalog";

const mockGetSession = vi.mocked(getSession);

// ── 픽스처 ───────────────────────────────────────────────────

function makeSession(role: string): Session {
  return { user: { id: "user-1", email: "admin@test.com", name: "Admin", role }, expires: "2099-01-01" };
}

const ADMIN_SESSION = makeSession("ADMIN");
const CUSTOMER_SESSION = makeSession("CUSTOMER");

// ── 가드: 미인증 ──────────────────────────────────────────────

describe("admin catalog 액션 — 미인증", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(null);
  });

  it("createStyleAction: 세션 없으면 UNAUTHENTICATED", async () => {
    const result = await createStyleAction({ name: "테스트", category: "FASHION" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("UNAUTHENTICATED");
  });

  it("createVariantAction: 세션 없으면 UNAUTHENTICATED", async () => {
    const result = await createVariantAction({ wigStyleId: "s1", color: "블랙", length: "long", curl: "straight", sku: "TST" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("UNAUTHENTICATED");
  });

  it("updateStockAction: 세션 없으면 UNAUTHENTICATED", async () => {
    const result = await updateStockAction("v1", 10);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("UNAUTHENTICATED");
  });
});

// ── 가드: CUSTOMER ────────────────────────────────────────────

describe("admin catalog 액션 — CUSTOMER role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(CUSTOMER_SESSION);
  });

  it("createStyleAction: CUSTOMER이면 FORBIDDEN", async () => {
    const result = await createStyleAction({ name: "테스트", category: "FASHION" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("FORBIDDEN");
  });

  it("deactivateStyleAction: CUSTOMER이면 FORBIDDEN", async () => {
    const result = await deactivateStyleAction("style-1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("FORBIDDEN");
  });

  it("deactivateVariantAction: CUSTOMER이면 FORBIDDEN", async () => {
    const result = await deactivateVariantAction("variant-1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("FORBIDDEN");
  });
});

// ── ADMIN 성공 경로 ───────────────────────────────────────────

describe("createStyleAction — ADMIN 성공", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
  });

  it("ADMIN이면 styleId를 반환한다", async () => {
    mockCreateWigStyle.mockResolvedValue({ id: "style-new" });
    const result = await createStyleAction({ name: "실크 스트레이트", category: "HAIR_LOSS" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.styleId).toBe("style-new");
  });

  it("lib이 CatalogAdminException을 던지면 errorCode로 매핑한다", async () => {
    mockCreateWigStyle.mockRejectedValue(new CatalogAdminException("INVALID_CATEGORY", "잘못된 카테고리"));
    // @ts-expect-error — 의도적으로 잘못된 카테고리 값
    const result = await createStyleAction({ name: "테스트", category: "BAD" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("INVALID_CATEGORY");
  });

  it("lib이 CatalogAdminException이 아닌 에러를 던지면 re-throw한다", async () => {
    mockCreateWigStyle.mockRejectedValue(new Error("DB 연결 오류"));
    await expect(createStyleAction({ name: "테스트", category: "FASHION" })).rejects.toThrow("DB 연결 오류");
  });
});

describe("createVariantAction — ADMIN 성공", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
  });

  it("ADMIN이면 variantId를 반환한다", async () => {
    mockCreateWigVariant.mockResolvedValue({ id: "variant-new" });
    const result = await createVariantAction({
      wigStyleId: "style-1", color: "블랙", length: "long", curl: "straight", sku: "TST-BLK-L-ST",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.variantId).toBe("variant-new");
  });

  it("SKU_DUPLICATE → errorCode로 매핑한다", async () => {
    mockCreateWigVariant.mockRejectedValue(new CatalogAdminException("SKU_DUPLICATE", "중복"));
    const result = await createVariantAction({
      wigStyleId: "style-1", color: "블랙", length: "long", curl: "straight", sku: "DUP-SKU",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("SKU_DUPLICATE");
  });
});

describe("updateStyleAction — ADMIN 성공", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
  });

  it("ADMIN이면 success: true를 반환한다", async () => {
    mockUpdateWigStyle.mockResolvedValue(undefined);
    const result = await updateStyleAction("style-1", { name: "새이름" });
    expect(result.success).toBe(true);
  });

  it("STYLE_NOT_FOUND → errorCode로 매핑한다", async () => {
    mockUpdateWigStyle.mockRejectedValue(new CatalogAdminException("STYLE_NOT_FOUND", "없음"));
    const result = await updateStyleAction("nonexistent", { name: "새이름" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("STYLE_NOT_FOUND");
  });
});
