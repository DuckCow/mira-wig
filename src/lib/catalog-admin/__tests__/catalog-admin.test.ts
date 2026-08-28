// ============================================================
// STRICT 존 — lib/catalog-admin 행동 검증
// 검증 실패·SKU 충돌·부모 미존재·성공 경로를 행동으로 검증한다.
// ============================================================

import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { CatalogAdminException, type UpdateStyleInput } from "../types";

// ── DB 모킹 ──────────────────────────────────────────────────
// vi.mocked(db.x.y) 패턴은 unbound-method lint 오류 발생.
// 대신 vi.fn()을 먼저 선언하고 mock factory에서 wrapper로 위임한다.

const mockStyleCreate = vi.fn();
const mockStyleUpdate = vi.fn();
const mockStyleFindUnique = vi.fn();
const mockStorageStat = vi.fn();
const mockStorageRead = vi.fn();
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

const validCoverBytes = new Map<string, Uint8Array>();
let corruptWebpBytes = new Uint8Array();
let validGifBytes = new Uint8Array();

function coverImageSource() {
  return sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  });
}

function contentTypeForKey(key: string): string {
  if (key.endsWith(".jpg")) return "image/jpeg";
  if (key.endsWith(".png")) return "image/png";
  return "image/webp";
}

function bytesForKey(key: string): Uint8Array {
  return validCoverBytes.get(contentTypeForKey(key)) ?? new Uint8Array();
}

const mockCoverStorage = {
  statObject: mockStorageStat,
  readObjectBounded: mockStorageRead,
};

function expectNoCoverStorageCalls(): void {
  expect(mockStorageStat).not.toHaveBeenCalled();
  expect(mockStorageRead).not.toHaveBeenCalled();
}

beforeAll(async () => {
  validCoverBytes.set("image/jpeg", await coverImageSource().jpeg().toBuffer());
  validCoverBytes.set("image/png", await coverImageSource().png().toBuffer());
  validCoverBytes.set("image/webp", await coverImageSource().webp().toBuffer());

  const raw = Buffer.alloc(128 * 128 * 4);
  let state = 123_456_789;
  for (let index = 0; index < raw.byteLength; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    raw[index] = state & 0xff;
  }
  const validLosslessWebp = await sharp(raw, {
    raw: { width: 128, height: 128, channels: 4 },
  }).webp({ lossless: true }).toBuffer();
  corruptWebpBytes = new Uint8Array(validLosslessWebp);
  corruptWebpBytes.fill(0xff, 30, 100);

  validGifBytes = new Uint8Array(
    await coverImageSource().gif().toBuffer(),
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  mockStorageStat.mockImplementation((key: string) => {
    const bytes = bytesForKey(key);
    return Promise.resolve({
      byteLength: bytes.byteLength,
      contentType: contentTypeForKey(key),
    });
  });
  mockStorageRead.mockImplementation((key: string) => {
    const bytes = bytesForKey(key);
    return Promise.resolve({
      bytes,
      totalByteLength: bytes.byteLength,
      contentType: contentTypeForKey(key),
    });
  });
});

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
    await expect(updateWigStyle("nonexistent", { name: "새이름" }, mockCoverStorage)).rejects.toMatchObject({
      code: "STYLE_NOT_FOUND",
    });
    expectNoCoverStorageCalls();
    expect(mockStyleUpdate).not.toHaveBeenCalled();
  });

  it("존재하면 update를 호출한다", async () => {
    mockStyleFindUnique.mockResolvedValue({ id: "style-1", coverImageKey: null });
    mockStyleUpdate.mockResolvedValue({});
    await updateWigStyle("style-1", { name: "새이름" }, mockCoverStorage);
    expect(mockStyleUpdate).toHaveBeenCalledOnce();
    expectNoCoverStorageCalls();
  });

  it.each([
    "wig-style/safe-id.jpg",
    "wig-style/safe_ID-2.png",
    "wig-style/A1.webp",
  ])("유효하고 존재하는 변경 키 %s를 정확히 저장한다", async (coverImageKey) => {
    mockStyleFindUnique.mockResolvedValue({ id: "style-1", coverImageKey: null });
    mockStyleUpdate.mockResolvedValue({});
    await updateWigStyle("style-1", { coverImageKey }, mockCoverStorage);
    expect(mockStorageStat).toHaveBeenCalledWith(coverImageKey);
    expect(mockStorageRead).toHaveBeenCalledWith(coverImageKey, 12 * 1024 * 1024);
    expect(mockStyleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { coverImageKey } }),
    );
  });

  it("coverImageKey=null이면 이미지 제거가 data에 반영된다", async () => {
    mockStyleFindUnique.mockResolvedValue({ id: "style-1", coverImageKey: "wig-style/existing.jpg" });
    mockStyleUpdate.mockResolvedValue({});
    await updateWigStyle("style-1", { coverImageKey: null }, mockCoverStorage);
    expect(mockStyleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { coverImageKey: null } }),
    );
    expectNoCoverStorageCalls();
  });

  it.each([
    "user-upload/owner/file.jpg",
    "tryon-result/owner/file.jpg",
    "review/owner/file.jpg",
    "hair-cad/file.pdf",
    "demo-catalog/file.png",
    "wig-style/",
    "/wig-style/file.jpg",
    "wig-style/a/b.jpg",
    "wig-style/../user-upload/file.jpg",
    "wig-style/%2e%2e%2fuser-upload%2ffile.jpg",
    "wig-style\\file.jpg",
    "https://host/wig-style/file.jpg",
    "wig-style/file.jpg?x=1",
    "wig-style/file.jpg#x",
    " wig-style/file.jpg",
    "wig-style/file.jpg ",
    "wig-style/file\n.jpg",
    "wig-style/file.gif",
    `wig-style/${"a".repeat(129)}.jpg`,
    "",
  ])("잘못된 변경 키 %j는 storage 접촉 전에 거부한다", async (coverImageKey) => {
    mockStyleFindUnique.mockResolvedValue({ id: "style-1", coverImageKey: null });
    await expect(
      updateWigStyle("style-1", { coverImageKey }, mockCoverStorage),
    ).rejects.toMatchObject({ code: "INVALID_COVER_IMAGE" });
    expectNoCoverStorageCalls();
    expect(mockStyleUpdate).not.toHaveBeenCalled();
  });

  it("유효한 변경 키의 객체가 없으면 DB를 수정하지 않는다", async () => {
    mockStyleFindUnique.mockResolvedValue({ id: "style-1", coverImageKey: null });
    mockStorageStat.mockResolvedValue(null);
    await expect(
      updateWigStyle("style-1", { coverImageKey: "wig-style/missing.jpg" }, mockCoverStorage),
    ).rejects.toMatchObject({ code: "INVALID_COVER_IMAGE" });
    expect(mockStorageStat).toHaveBeenCalledWith("wig-style/missing.jpg");
    expect(mockStorageRead).not.toHaveBeenCalled();
    expect(mockStyleUpdate).not.toHaveBeenCalled();
  });

  it("storage metadata 확인 실패를 INVALID_COVER_IMAGE로 닫고 DB를 수정하지 않는다", async () => {
    const storageFailure = new Error("storage unavailable");
    mockStyleFindUnique.mockResolvedValue({ id: "style-1", coverImageKey: null });
    mockStorageStat.mockRejectedValue(storageFailure);
    await expect(
      updateWigStyle("style-1", { coverImageKey: "wig-style/new.jpg" }, mockCoverStorage),
    ).rejects.toMatchObject({
      code: "INVALID_COVER_IMAGE",
      cause: { code: "INVALID_OBJECT_METADATA", cause: storageFailure },
    });
    expect(mockStorageRead).not.toHaveBeenCalled();
    expect(mockStyleUpdate).not.toHaveBeenCalled();
  });

  it("decode에 실패한 객체를 저장하지 않는다", async () => {
    const corruptBytes = new Uint8Array([1, 2, 3, 4]);
    mockStyleFindUnique.mockResolvedValue({ id: "style-1", coverImageKey: null });
    mockStorageStat.mockResolvedValue({
      byteLength: corruptBytes.byteLength,
      contentType: "image/png",
    });
    mockStorageRead.mockResolvedValue({
      bytes: corruptBytes,
      totalByteLength: corruptBytes.byteLength,
      contentType: "image/png",
    });
    await expect(
      updateWigStyle("style-1", { coverImageKey: "wig-style/corrupt.png" }, mockCoverStorage),
    ).rejects.toMatchObject({ code: "INVALID_COVER_IMAGE" });
    expect(mockStyleUpdate).not.toHaveBeenCalled();
  });

  it("전체 길이를 유지한 손상 WebP를 decode 거부하고 DB를 수정하지 않는다", async () => {
    mockStyleFindUnique.mockResolvedValue({ id: "style-1", coverImageKey: null });
    mockStorageStat.mockResolvedValue({
      byteLength: corruptWebpBytes.byteLength,
      contentType: "image/webp",
    });
    mockStorageRead.mockResolvedValue({
      bytes: corruptWebpBytes,
      totalByteLength: corruptWebpBytes.byteLength,
      contentType: "image/webp",
    });
    await expect(
      updateWigStyle("style-1", { coverImageKey: "wig-style/corrupt.webp" }, mockCoverStorage),
    ).rejects.toMatchObject({ code: "INVALID_COVER_IMAGE" });
    expect(mockStorageStat).toHaveBeenCalledOnce();
    expect(mockStorageRead).toHaveBeenCalledOnce();
    expect(mockStyleUpdate).not.toHaveBeenCalled();
  });

  it("유효한 GIF 실제 형식을 거부하고 DB를 수정하지 않는다", async () => {
    mockStyleFindUnique.mockResolvedValue({ id: "style-1", coverImageKey: null });
    mockStorageStat.mockResolvedValue({
      byteLength: validGifBytes.byteLength,
      contentType: "image/png",
    });
    mockStorageRead.mockResolvedValue({
      bytes: validGifBytes,
      totalByteLength: validGifBytes.byteLength,
      contentType: "image/png",
    });
    await expect(
      updateWigStyle("style-1", { coverImageKey: "wig-style/unsupported.png" }, mockCoverStorage),
    ).rejects.toMatchObject({ code: "INVALID_COVER_IMAGE" });
    expect(mockStorageStat).toHaveBeenCalledOnce();
    expect(mockStorageRead).toHaveBeenCalledOnce();
    expect(mockStyleUpdate).not.toHaveBeenCalled();
  });

  it("0-byte metadata를 body read 전에 거부하고 DB를 수정하지 않는다", async () => {
    mockStyleFindUnique.mockResolvedValue({ id: "style-1", coverImageKey: null });
    mockStorageStat.mockResolvedValue({
      byteLength: 0,
      contentType: "image/png",
    });
    await expect(
      updateWigStyle("style-1", { coverImageKey: "wig-style/empty.png" }, mockCoverStorage),
    ).rejects.toMatchObject({ code: "INVALID_COVER_IMAGE" });
    expect(mockStorageRead).not.toHaveBeenCalled();
    expect(mockStyleUpdate).not.toHaveBeenCalled();
  });

  it.each([
    "wig-style/existing.jpg",
    "demo-catalog/existing.png",
  ])("기존 키 %s의 정확한 재전송은 재승인 없이 메타데이터만 수정한다", async (coverImageKey) => {
    mockStyleFindUnique.mockResolvedValue({ id: "style-1", coverImageKey });
    mockStyleUpdate.mockResolvedValue({});
    await updateWigStyle(
      "style-1",
      { name: " 새 이름 ", coverImageKey },
      mockCoverStorage,
    );
    expectNoCoverStorageCalls();
    expect(mockStyleUpdate).toHaveBeenCalledWith({
      where: { id: "style-1" },
      data: { name: "새 이름" },
    });
  });

  it("기존 demo 키를 다른 demo 키로 바꾸면 거부한다", async () => {
    mockStyleFindUnique.mockResolvedValue({
      id: "style-1",
      coverImageKey: "demo-catalog/a.png",
    });
    await expect(
      updateWigStyle(
        "style-1",
        { coverImageKey: "demo-catalog/b.png" },
        mockCoverStorage,
      ),
    ).rejects.toMatchObject({ code: "INVALID_COVER_IMAGE" });
    expectNoCoverStorageCalls();
    expect(mockStyleUpdate).not.toHaveBeenCalled();
  });

  it("coverImageKey가 생략되면 이미지 변경 없이 메타데이터만 수정한다", async () => {
    mockStyleFindUnique.mockResolvedValue({
      id: "style-1",
      coverImageKey: "demo-catalog/existing.png",
    });
    mockStyleUpdate.mockResolvedValue({});
    await updateWigStyle("style-1", { name: "새이름" }, mockCoverStorage);
    expectNoCoverStorageCalls();
    expect(mockStyleUpdate).toHaveBeenCalledWith({
      where: { id: "style-1" },
      data: { name: "새이름" },
    });
  });

  it.each([123, { key: "wig-style/file.jpg" }, ["wig-style/file.jpg"]])(
    "런타임 non-string coverImageKey %j를 storage 접촉 전에 거부한다",
    async (coverImageKey) => {
      mockStyleFindUnique.mockResolvedValue({ id: "style-1", coverImageKey: null });
      const hostileInput: UpdateStyleInput = {};
      Reflect.set(hostileInput, "coverImageKey", coverImageKey);
      await expect(
        updateWigStyle("style-1", hostileInput, mockCoverStorage),
      ).rejects.toMatchObject({ code: "INVALID_COVER_IMAGE" });
      expectNoCoverStorageCalls();
      expect(mockStyleUpdate).not.toHaveBeenCalled();
    },
  );

  it.each([
    "wig-style/File.JPG",
    "WIG-STYLE/file.jpg",
    "wig-style/%66ile.jpg",
  ])("키 %s를 정규화하거나 디코딩해서 허용하지 않는다", async (coverImageKey) => {
    mockStyleFindUnique.mockResolvedValue({ id: "style-1", coverImageKey: null });
    await expect(
      updateWigStyle("style-1", { coverImageKey }, mockCoverStorage),
    ).rejects.toMatchObject({ code: "INVALID_COVER_IMAGE" });
    expectNoCoverStorageCalls();
    expect(mockStyleUpdate).not.toHaveBeenCalled();
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
