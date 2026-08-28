import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type {
  ObjectInspectionProvider,
  StoredObjectMetadata,
} from "@/lib/storage/types";
import {
  admitTechnicalImage,
  type TechnicalImageFormat,
  type TechnicalImagePolicy,
} from "../image-technical-admission";

const POLICY: TechnicalImagePolicy = {
  allowedFormats: ["jpeg", "png", "webp"],
  maxBytes: 12 * 1024 * 1024,
  maxWidth: 8192,
  maxHeight: 8192,
  maxPixels: 40_000_000,
};

const MIME_BY_FORMAT: Readonly<Record<TechnicalImageFormat, string>> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const ANIMATED_WEBP = Buffer.from(
  "UklGRs4AAABXRUJQVlA4WAoAAAACAAAAAQAAAQAAQU5JTQYAAAD/////AABBTk1GTgAAAAAAAAAAAAEAAAEAAPQBAAJWUDggNgAAANABAJ0BKgIAAgABQCYlmAJ0AQ74p/YAAM4/z2p+aj9X9ubh8wEptcXNkRR/qv+IL+IJ9gAAAEFOTUZMAAAAAAAAAAAAAQAAAQAA9AEAAFZQOCA0AAAAtAEAnQEqAgACAAAAJiWQAnQBDv4C7AD+7Rlnz4o7GWY+w+wHmydVU9fjd/nb8QfqC5AAAA==",
  "base64",
);

const ANIMATED_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAABAAAAAQBPJcTWAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAACAAAAAgAAAAAAAAAAAAEAAgAA5keNuAAAABVJREFUeJxjZGBg+M/AwALEjP//AwATKAQDQlIAKwAAABpmY1RMAAAAAQAAAAIAAAABAAAAAAAAAAEAAQACAADKPgahAAAAE2ZkQVQAAAACeJxj/N/AwPj/PwALiAOA7NvXgAAAAABJRU5ErkJggg==",
  "base64",
);

async function imageBytes(
  format: TechnicalImageFormat,
  width = 3,
  height = 2,
): Promise<Uint8Array> {
  const source = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  });
  if (format === "jpeg") return source.jpeg().toBuffer();
  if (format === "png") return source.png({ compressionLevel: 9 }).toBuffer();
  return source.webp().toBuffer();
}

async function nonTruncationCorruptWebp(): Promise<Uint8Array> {
  const raw = Buffer.alloc(128 * 128 * 4);
  let state = 123_456_789;
  for (let index = 0; index < raw.byteLength; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    raw[index] = state & 0xff;
  }
  const valid = await sharp(raw, {
    raw: { width: 128, height: 128, channels: 4 },
  }).webp({ lossless: true }).toBuffer();
  const corrupt = Buffer.from(valid);
  corrupt.fill(0xff, 30, 100);
  expect(corrupt).toHaveLength(valid.byteLength);
  return corrupt;
}

function inspectionFor(bytes: Uint8Array, contentType: string) {
  const statObject = vi.fn(() => Promise.resolve({
    byteLength: bytes.byteLength,
    contentType,
  }));
  const readObjectBounded = vi.fn((_key: string, maxBytes: number) => Promise.resolve({
    bytes: bytes.slice(0, maxBytes),
    totalByteLength: bytes.byteLength,
    contentType,
  }));
  const objects: ObjectInspectionProvider = { statObject, readObjectBounded };
  return { objects, statObject, readObjectBounded };
}

async function admit(
  bytes: Uint8Array,
  format: TechnicalImageFormat,
  policy: TechnicalImagePolicy = POLICY,
) {
  const inspection = inspectionFor(bytes, MIME_BY_FORMAT[format]);
  const result = await admitTechnicalImage({
    key: "object-key",
    declaredMimeType: MIME_BY_FORMAT[format],
    policy,
    objects: inspection.objects,
  });
  return { result, inspection };
}

describe("technical image format and decode truth", () => {
  it.each<TechnicalImageFormat>(["jpeg", "png", "webp"])(
    "admits a valid static %s",
    async (format) => {
      const bytes = await imageBytes(format);
      const { result } = await admit(bytes, format);
      expect(result).toEqual({
        format,
        mimeType: MIME_BY_FORMAT[format],
        byteLength: bytes.byteLength,
        width: 3,
        height: 2,
        pixels: 6,
      });
    },
  );

  it("rejects structurally corrupted PNG data", async () => {
    const bytes = await imageBytes("png");
    const corrupted = bytes.slice();
    corrupted[0] = 0;
    const inspection = inspectionFor(corrupted, "image/png");
    await expect(admitTechnicalImage({
      key: "corrupt",
      declaredMimeType: "image/png",
      policy: POLICY,
      objects: inspection.objects,
    })).rejects.toMatchObject({ code: "DECODE_FAILED" });
  });

  it("rejects fake image bytes despite a permitted stored MIME", async () => {
    const inspection = inspectionFor(new TextEncoder().encode("not an image"), "image/png");
    await expect(admitTechnicalImage({
      key: "fake",
      declaredMimeType: "image/png",
      policy: POLICY,
      objects: inspection.objects,
    })).rejects.toMatchObject({ code: "DECODE_FAILED" });
  });

  it("detects WebP metadata but rejects non-truncated corrupt WebP on complete decode", async () => {
    const corrupt = await nonTruncationCorruptWebp();
    await expect(sharp(corrupt, { failOn: "warning" }).metadata()).resolves.toMatchObject({
      format: "webp",
      width: 128,
      height: 128,
    });
    await expect(sharp(corrupt, {
      failOn: "warning",
      limitInputPixels: POLICY.maxPixels,
    }).stats()).rejects.toThrow();

    const inspection = inspectionFor(corrupt, "image/webp");
    await expect(admitTechnicalImage({
      key: "corrupt.webp",
      declaredMimeType: "image/webp",
      policy: POLICY,
      objects: inspection.objects,
    })).rejects.toMatchObject({ code: "DECODE_FAILED" });
    expect(inspection.statObject).toHaveBeenCalledOnce();
    expect(inspection.readObjectBounded).toHaveBeenCalledOnce();
  });

  it("rejects a structurally valid GIF because its actual format is unsupported", async () => {
    const gif = await sharp({
      create: {
        width: 3,
        height: 2,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    }).gif().toBuffer();
    await expect(sharp(gif).stats()).resolves.toMatchObject({ isOpaque: true });
    await expect(sharp(gif).metadata()).resolves.toMatchObject({
      format: "gif",
      width: 3,
      height: 2,
    });
    const inspection = inspectionFor(gif, "image/gif");
    await expect(admitTechnicalImage({
      key: "valid.gif",
      declaredMimeType: "image/gif",
      policy: POLICY,
      objects: inspection.objects,
    })).rejects.toMatchObject({ code: "UNSUPPORTED_FORMAT" });
    expect(inspection.statObject).toHaveBeenCalledOnce();
    expect(inspection.readObjectBounded).toHaveBeenCalledOnce();
  });

  it("rejects actual PNG bytes declared and stored as JPEG", async () => {
    const bytes = await imageBytes("png");
    const inspection = inspectionFor(bytes, "image/jpeg");
    await expect(admitTechnicalImage({
      key: "wrong-type",
      declaredMimeType: "image/jpeg",
      policy: POLICY,
      objects: inspection.objects,
    })).rejects.toMatchObject({ code: "MIME_MISMATCH" });
  });

  it("rejects stored MIME that disagrees with the caller declaration before reading", async () => {
    const bytes = await imageBytes("png");
    const inspection = inspectionFor(bytes, "image/jpeg");
    await expect(admitTechnicalImage({
      key: "metadata-mismatch",
      declaredMimeType: "image/png",
      policy: POLICY,
      objects: inspection.objects,
    })).rejects.toMatchObject({ code: "MIME_MISMATCH" });
    expect(inspection.readObjectBounded).not.toHaveBeenCalled();
  });

  it.each<TechnicalImageFormat>(["jpeg", "png", "webp"])(
    "rejects truncated %s data",
    async (format) => {
      const bytes = await imageBytes(format);
      const truncated = bytes.slice(0, Math.floor(bytes.byteLength / 2));
      const inspection = inspectionFor(truncated, MIME_BY_FORMAT[format]);
      await expect(admitTechnicalImage({
        key: "truncated",
        declaredMimeType: MIME_BY_FORMAT[format],
        policy: POLICY,
        objects: inspection.objects,
      })).rejects.toMatchObject({ code: "DECODE_FAILED" });
    },
  );

  it("rejects animated/multipage WebP", async () => {
    const inspection = inspectionFor(ANIMATED_WEBP, "image/webp");
    await expect(admitTechnicalImage({
      key: "animated",
      declaredMimeType: "image/webp",
      policy: POLICY,
      objects: inspection.objects,
    })).rejects.toMatchObject({ code: "MULTIPAGE_IMAGE" });
  });

  it("rejects animated/multipage PNG even when sharp reports no page count", async () => {
    const inspection = inspectionFor(ANIMATED_PNG, "image/png");
    await expect(admitTechnicalImage({
      key: "animated-png",
      declaredMimeType: "image/png",
      policy: POLICY,
      objects: inspection.objects,
    })).rejects.toMatchObject({ code: "MULTIPAGE_IMAGE" });
  });
});

describe("technical image byte and object-inspection bounds", () => {
  it.each([0, -1, 1.5, Number.NaN, undefined])(
    "rejects invalid stat byte length %s before body read or decode",
    async (byteLength) => {
      const metadata: StoredObjectMetadata = {
        byteLength: 1,
        contentType: "image/png",
      };
      Reflect.set(metadata, "byteLength", byteLength);
      const statObject = vi.fn(() => Promise.resolve(metadata));
      const readObjectBounded = vi.fn();
      const objects: ObjectInspectionProvider = { statObject, readObjectBounded };
      await expect(admitTechnicalImage({
        key: "invalid-size",
        declaredMimeType: "image/png",
        policy: POLICY,
        objects,
      })).rejects.toMatchObject({ code: "INVALID_OBJECT_METADATA" });
      expect(readObjectBounded).not.toHaveBeenCalled();
    },
  );

  it("rejects an oversized stat before bounded read or decode", async () => {
    const statObject = vi.fn(() => Promise.resolve({
      byteLength: POLICY.maxBytes + 1,
      contentType: "image/png",
    }));
    const readObjectBounded = vi.fn();
    const objects: ObjectInspectionProvider = { statObject, readObjectBounded };
    await expect(admitTechnicalImage({
      key: "oversize",
      declaredMimeType: "image/png",
      policy: POLICY,
      objects,
    })).rejects.toMatchObject({ code: "OBJECT_TOO_LARGE" });
    expect(readObjectBounded).not.toHaveBeenCalled();
  });

  it("rejects incomplete or changed bounded reads", async () => {
    const bytes = await imageBytes("png");
    const inspection = inspectionFor(bytes, "image/png");
    inspection.readObjectBounded.mockResolvedValue({
      bytes: bytes.slice(0, bytes.byteLength - 1),
      totalByteLength: bytes.byteLength,
      contentType: "image/png",
    });
    await expect(admitTechnicalImage({
      key: "changed",
      declaredMimeType: "image/png",
      policy: POLICY,
      objects: inspection.objects,
    })).rejects.toMatchObject({ code: "OBJECT_CHANGED_DURING_INSPECTION" });
  });

  it("fails closed on metadata and read failures", async () => {
    const statFailure = new Error("stat failed");
    const statObject = vi.fn(() => Promise.reject(statFailure));
    const readObjectBounded = vi.fn();
    const statObjects: ObjectInspectionProvider = { statObject, readObjectBounded };
    await expect(admitTechnicalImage({
      key: "stat-failure",
      declaredMimeType: "image/png",
      policy: POLICY,
      objects: statObjects,
    })).rejects.toMatchObject({ code: "INVALID_OBJECT_METADATA", cause: statFailure });

    const bytes = await imageBytes("png");
    const readInspection = inspectionFor(bytes, "image/png");
    const readFailure = new Error("read failed");
    readInspection.readObjectBounded.mockRejectedValue(readFailure);
    await expect(admitTechnicalImage({
      key: "read-failure",
      declaredMimeType: "image/png",
      policy: POLICY,
      objects: readInspection.objects,
    })).rejects.toMatchObject({ code: "OBJECT_READ_FAILED", cause: readFailure });
  });
});

describe("catalog-sized dimension and pixel ceilings", () => {
  it.each([
    [8192, 1],
    [1, 8192],
  ])("admits the exact %i x %i dimension boundary", async (width, height) => {
    const bytes = await imageBytes("png", width, height);
    await expect(admit(bytes, "png")).resolves.toMatchObject({
      result: { width, height, pixels: width * height },
    });
  });

  it.each([
    [8193, 1],
    [1, 8193],
  ])("rejects %i x %i beyond a dimension boundary", async (width, height) => {
    const bytes = await imageBytes("png", width, height);
    const inspection = inspectionFor(bytes, "image/png");
    await expect(admitTechnicalImage({
      key: "dimension-limit",
      declaredMimeType: "image/png",
      policy: POLICY,
      objects: inspection.objects,
    })).rejects.toMatchObject({ code: "DIMENSION_LIMIT_EXCEEDED" });
  });

  it("admits exactly 40,000,000 pixels", async () => {
    const bytes = await imageBytes("png", 8000, 5000);
    await expect(admit(bytes, "png")).resolves.toMatchObject({
      result: { width: 8000, height: 5000, pixels: 40_000_000 },
    });
  });

  it("rejects 40,008,000 pixels", async () => {
    const bytes = await imageBytes("png", 8000, 5001);
    const inspection = inspectionFor(bytes, "image/png");
    await expect(admitTechnicalImage({
      key: "pixel-limit",
      declaredMimeType: "image/png",
      policy: POLICY,
      objects: inspection.objects,
    })).rejects.toMatchObject({ code: "PIXEL_LIMIT_EXCEEDED" });
  });
});
