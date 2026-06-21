// ============================================================
// STRICT 존 — lib/catalog-admin 행동 검증
// 검증 실패·SKU 충돌·부모 미존재·성공 경로를 행동으로 검증한다.
// ============================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { CatalogAdminException } from "../types";

// ── DB 모킹 ──────────────────────────────────────────────────
// vi.mocked(db.x.y) 패턴은 unbound-method lint 오류 발생.
// 대신 vi.fn()을 먼저 선언하고 mock factory에서 wrapper로 위임한다.

const mockStyleCreate = vi.fn();
const mockStyleUpdate = vi.fn();
const mockStyleFindUnique = vi.fn();
const mockVariantCreate = vi.fn();
const mockVariantUpdate = vi.fn();
const mockVariantFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    wigStyle: {
      create: (...a: unknown[]): unknown => mockStyleCreate(...a),
      update: (...a: unknown[]): unknown => mockStyleUpdate(...a),
      findUnique: (...a: unknown[]): unknown => mockStyleFindUnique(...a),
    },
    wigVariant: {
      create: (...a: unknown[]): unknown => mockVariantCreate(...a),
      update: (...a: unknown[]): unknown => mockVariantUpdate(...a),
      findUnique: (...a: unknown[]): unknown => mockVariantFindUnique(...a),
    },
  },
}));

import {
  createWigStyle,
  updateWigStyle,
  deactivateWigStyle,
  createWigVariant,
  updateVariantStock,
  deactivateWigVariant,
} from "../index";

function makeP2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "5.0.0",
    meta: { target: ["sku"] },
  });
}

beforeEach(() => vi.clearAllMocks());

// ── createWigStyle ────────────────────────────────────────────

describe("createWigStyle — 필수 필드 검증", () => {
  it("name이 빈 문자열이면 INVALID_INPUT을 던진다", async () => {
    await expect(createWigStyle({ name: "", category: "FASHION" })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });

  it("name이 공백이면 INVALID_INPUT을 던진다", async () => {
    await expect(createWigStyle({ name: "   ", category: "FASHION" })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });

  it("잘못된 category이면 INVALID_CATEGORY를 던진다", async () => {
    // @ts-expect-error — 의도적으로 잘못된 카테고리 값
    await expect(createWigStyle({ name: "테스트", category: "INVALID" })).rejects.toMatchObject({
      code: "INVALID_CATEGORY",
    });
  });

  it("유효한 입력이면 id를 반환한다", async () => {
    mockStyleCreate.mockResolvedValue({ id: "style-1" });
    const result = await createWigStyle({ name: "실크 스트레이트", category: "FASHION" });
    expect(result.id).toBe("style-1");
  });
});

// ── updateWigStyle ────────────────────────────────────────────

describe("updateWigStyle — STYLE_NOT_FOUND", () => {
  it("존재하지 않는 styleId이면 STYLE_NOT_FOUND를 던진다", async () => {
    mockStyleFindUnique.mockResolvedValue(null);
    await expect(updateWigStyle("nonexistent", { name: "새이름" })).rejects.toMatchObject({
      code: "STYLE_NOT_FOUND",
    });
  });

  it("존재하면 update를 호출한다", async () => {
    mockStyleFindUnique.mockResolvedValue({ id: "style-1" });
    mockStyleUpdate.mockResolvedValue({});
    await updateWigStyle("style-1", { name: "새이름" });
    expect(mockStyleUpdate).toHaveBeenCalledOnce();
  });

  it("coverImageKey를 넘기면 data에 포함된다", async () => {
    mockStyleFindUnique.mockResolvedValue({ id: "style-1" });
    mockStyleUpdate.mockResolvedValue({});
    await updateWigStyle("style-1", { coverImageKey: "wig-style/abc.jpg" });
    expect(mockStyleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { coverImageKey: "wig-style/abc.jpg" } }),
    );
  });

  it("coverImageKey=null이면 이미지 제거가 data에 반영된다", async () => {
    mockStyleFindUnique.mockResolvedValue({ id: "style-1" });
    mockStyleUpdate.mockResolvedValue({});
    await updateWigStyle("style-1", { coverImageKey: null });
    expect(mockStyleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { coverImageKey: null } }),
    );
  });
});

// ── deactivateWigStyle ────────────────────────────────────────

describe("deactivateWigStyle", () => {
  it("존재하지 않으면 STYLE_NOT_FOUND를 던진다", async () => {
    mockStyleFindUnique.mockResolvedValue(null);
    await expect(deactivateWigStyle("nonexistent")).rejects.toMatchObject({
      code: "STYLE_NOT_FOUND",
    });
  });

  it("isActive=false로 update한다", async () => {
    mockStyleFindUnique.mockResolvedValue({ id: "style-1" });
    mockStyleUpdate.mockResolvedValue({});
    await deactivateWigStyle("style-1");
    expect(mockStyleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
  });
});

// ── createWigVariant ──────────────────────────────────────────

describe("createWigVariant — 부모 style 미존재", () => {
  it("wigStyleId의 Style이 없으면 STYLE_NOT_FOUND를 던진다", async () => {
    mockStyleFindUnique.mockResolvedValue(null);
    await expect(
      createWigVariant({ wigStyleId: "no-style", color: "블랙", length: "long", curl: "straight", sku: "TST-BLK-L-ST" }),
    ).rejects.toMatchObject({ code: "STYLE_NOT_FOUND" });
  });
});

describe("createWigVariant — SKU 중복", () => {
  it("sku @unique 충돌이면 SKU_DUPLICATE를 던진다", async () => {
    mockStyleFindUnique.mockResolvedValue({ id: "style-1" });
    mockVariantCreate.mockRejectedValue(makeP2002());
    await expect(
      createWigVariant({ wigStyleId: "style-1", color: "블랙", length: "long", curl: "straight", sku: "TST-BLK-L-ST" }),
    ).rejects.toMatchObject({ code: "SKU_DUPLICATE" });
  });

  it("P2002가 아닌 에러는 re-throw한다", async () => {
    mockStyleFindUnique.mockResolvedValue({ id: "style-1" });
    const unexpected = new Error("DB 연결 오류");
    mockVariantCreate.mockRejectedValue(unexpected);
    await expect(
      createWigVariant({ wigStyleId: "style-1", color: "블랙", length: "long", curl: "straight", sku: "TST-BLK-L-ST" }),
    ).rejects.toBe(unexpected);
  });
});

describe("createWigVariant — 필수 필드 검증", () => {
  it("sku가 빈 문자열이면 INVALID_INPUT을 던진다", async () => {
    await expect(
      createWigVariant({ wigStyleId: "style-1", color: "블랙", length: "long", curl: "straight", sku: "" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("색상이 없으면 INVALID_INPUT을 던진다", async () => {
    await expect(
      createWigVariant({ wigStyleId: "style-1", color: "", length: "long", curl: "straight", sku: "TST-BLK-L-ST" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("유효한 입력이면 id를 반환한다", async () => {
    mockStyleFindUnique.mockResolvedValue({ id: "style-1" });
    mockVariantCreate.mockResolvedValue({ id: "variant-1" });
    const result = await createWigVariant({
      wigStyleId: "style-1", color: "블랙", length: "long", curl: "straight", sku: "TST-BLK-L-ST",
    });
    expect(result.id).toBe("variant-1");
  });
});

// ── updateVariantStock ────────────────────────────────────────

describe("updateVariantStock", () => {
  it("음수 재고이면 INVALID_INPUT을 던진다", async () => {
    await expect(updateVariantStock("v-1", -1)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("존재하지 않는 variantId이면 VARIANT_NOT_FOUND를 던진다", async () => {
    mockVariantFindUnique.mockResolvedValue(null);
    await expect(updateVariantStock("nonexistent", 10)).rejects.toMatchObject({
      code: "VARIANT_NOT_FOUND",
    });
  });

  it("유효한 재고이면 update를 호출한다", async () => {
    mockVariantFindUnique.mockResolvedValue({ id: "v-1" });
    mockVariantUpdate.mockResolvedValue({});
    await updateVariantStock("v-1", 5);
    expect(mockVariantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: 5 } }),
    );
  });
});

// ── deactivateWigVariant ──────────────────────────────────────

describe("deactivateWigVariant", () => {
  it("존재하지 않으면 VARIANT_NOT_FOUND를 던진다", async () => {
    mockVariantFindUnique.mockResolvedValue(null);
    await expect(deactivateWigVariant("nonexistent")).rejects.toMatchObject({
      code: "VARIANT_NOT_FOUND",
    });
  });

  it("CatalogAdminException의 code를 정확히 반환한다", async () => {
    mockVariantFindUnique.mockResolvedValue(null);
    let caught: unknown;
    try { await deactivateWigVariant("x"); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(CatalogAdminException);
    if (caught instanceof CatalogAdminException) expect(caught.code).toBe("VARIANT_NOT_FOUND");
  });
});
