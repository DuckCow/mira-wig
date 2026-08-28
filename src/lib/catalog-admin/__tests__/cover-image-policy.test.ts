import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { ObjectInspectionProvider } from "@/lib/storage/types";
import {
  admitCatalogCoverImage,
  CATALOG_COVER_IMAGE_POLICY,
  isCatalogCoverKey,
} from "../cover-image-policy";

function objectsFor(bytes: Uint8Array, contentType: string): ObjectInspectionProvider {
  return {
    statObject: vi.fn(() => Promise.resolve({
      byteLength: bytes.byteLength,
      contentType,
    })),
    readObjectBounded: vi.fn((_key: string, maxBytes: number) => Promise.resolve({
      bytes: bytes.slice(0, maxBytes),
      totalByteLength: bytes.byteLength,
      contentType,
    })),
  };
}

describe("CatalogCoverPolicy", () => {
  it("freezes the exact catalog technical ceilings", () => {
    expect(CATALOG_COVER_IMAGE_POLICY).toEqual({
      allowedFormats: ["jpeg", "png", "webp"],
      maxBytes: 12 * 1024 * 1024,
      maxWidth: 8192,
      maxHeight: 8192,
      maxPixels: 40_000_000,
    });
  });

  it.each([
    "wig-style/safe.jpg",
    "wig-style/safe_name-2.png",
    "wig-style/A1.webp",
  ])("preserves the current catalog key grammar for %s", (key) => {
    expect(isCatalogCoverKey(key)).toBe(true);
  });

  it("rejects a valid PNG whose catalog key declares JPEG", async () => {
    const bytes = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    }).png().toBuffer();
    await expect(admitCatalogCoverImage(
      "wig-style/wrong-extension.jpg",
      objectsFor(bytes, "image/jpeg"),
    )).rejects.toMatchObject({ code: "MIME_MISMATCH" });
  });
});
