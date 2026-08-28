import "server-only";

import sharp from "sharp";
import type {
  BoundedObjectRead,
  ObjectInspectionProvider,
  StoredObjectMetadata,
} from "@/lib/storage/types";

export type TechnicalImageFormat = "jpeg" | "png" | "webp";

export interface TechnicalImagePolicy {
  allowedFormats: readonly TechnicalImageFormat[];
  maxBytes: number;
  maxWidth: number;
  maxHeight: number;
  maxPixels: number;
}

export interface TechnicalImageAdmission {
  format: TechnicalImageFormat;
  mimeType: string;
  byteLength: number;
  width: number;
  height: number;
  pixels: number;
}

export type TechnicalImageFailureCode =
  | "OBJECT_NOT_FOUND"
  | "INVALID_OBJECT_METADATA"
  | "OBJECT_TOO_LARGE"
  | "OBJECT_READ_FAILED"
  | "OBJECT_CHANGED_DURING_INSPECTION"
  | "MIME_MISMATCH"
  | "UNSUPPORTED_FORMAT"
  | "DECODE_FAILED"
  | "MULTIPAGE_IMAGE"
  | "DIMENSION_LIMIT_EXCEEDED"
  | "PIXEL_LIMIT_EXCEEDED";

export class TechnicalImageAdmissionError extends Error {
  constructor(
    public readonly code: TechnicalImageFailureCode,
    options?: ErrorOptions,
  ) {
    super(`Technical image admission failed: ${code}`, options);
    this.name = "TechnicalImageAdmissionError";
  }
}

const MIME_BY_FORMAT: Readonly<Record<TechnicalImageFormat, string>> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function hasPngSignature(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function isAnimationControlChunk(bytes: Uint8Array, offset: number): boolean {
  return bytes[offset] === 97
    && bytes[offset + 1] === 99
    && bytes[offset + 2] === 84
    && bytes[offset + 3] === 76;
}

function containsPngAnimationControl(bytes: Uint8Array): boolean {
  if (!hasPngSignature(bytes)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = PNG_SIGNATURE.byteLength;
  while (offset + 12 <= bytes.byteLength) {
    const dataLength = view.getUint32(offset);
    const nextOffset = offset + 12 + dataLength;
    if (!Number.isSafeInteger(nextOffset) || nextOffset > bytes.byteLength) return false;
    if (isAnimationControlChunk(bytes, offset + 4)) return true;
    offset = nextOffset;
  }
  return false;
}

function fail(code: TechnicalImageFailureCode, cause?: unknown): never {
  throw new TechnicalImageAdmissionError(code, cause === undefined ? undefined : { cause });
}

function validPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function technicalFormat(value: string | undefined): TechnicalImageFormat {
  if (value === "jpeg" || value === "png" || value === "webp") return value;
  return fail("UNSUPPORTED_FORMAT");
}

function requireSinglePage(pages: number | undefined): void {
  if ((pages ?? 1) !== 1) fail("MULTIPAGE_IMAGE");
}

function requireDimensions(
  width: number | undefined,
  height: number | undefined,
  policy: TechnicalImagePolicy,
): { width: number; height: number; pixels: number } {
  if (!width || !height || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    return fail("DECODE_FAILED");
  }
  if (width > policy.maxWidth || height > policy.maxHeight) {
    return fail("DIMENSION_LIMIT_EXCEEDED");
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > policy.maxPixels) {
    return fail("PIXEL_LIMIT_EXCEEDED");
  }
  return { width, height, pixels };
}

async function decodeImage(
  bytes: Uint8Array,
  declaredMimeType: string,
  policy: TechnicalImagePolicy,
): Promise<Omit<TechnicalImageAdmission, "byteLength">> {
  try {
    const metadataDecoder = sharp(bytes, {
      animated: true,
      failOn: "warning",
      // Header inspection does not decode pixels. The limits below are checked before
      // the separately bounded full decode.
      limitInputPixels: false,
    });
    const metadata = await metadataDecoder.metadata();
    const format = technicalFormat(metadata.format);
    if (!policy.allowedFormats.includes(format)) fail("UNSUPPORTED_FORMAT");
    const mimeType = MIME_BY_FORMAT[format];
    if (mimeType !== declaredMimeType) fail("MIME_MISMATCH");
    // libvips exposes WebP page counts but not APNG frames in this installed build.
    // A bounded chunk walk detects only APNG's required acTL marker; sharp remains
    // responsible for the PNG structure, CRCs, metadata, and complete pixel decode.
    if (format === "png" && containsPngAnimationControl(bytes)) fail("MULTIPAGE_IMAGE");
    requireSinglePage(metadata.pages);
    const dimensions = requireDimensions(metadata.width, metadata.height, policy);

    // metadata() alone only parses headers. stats() forces a complete pixel decode so
    // truncated/corrupt payloads cannot pass on plausible headers.
    await sharp(bytes, {
      animated: true,
      failOn: "warning",
      limitInputPixels: policy.maxPixels,
    }).stats();
    return { format, mimeType, ...dimensions };
  } catch (error) {
    if (error instanceof TechnicalImageAdmissionError) throw error;
    return fail("DECODE_FAILED", error);
  }
}

async function inspectObjectMetadata(
  objects: ObjectInspectionProvider,
  key: string,
): Promise<StoredObjectMetadata> {
  try {
    const metadata = await objects.statObject(key);
    if (!metadata) return fail("OBJECT_NOT_FOUND");
    return metadata;
  } catch (error) {
    if (error instanceof TechnicalImageAdmissionError) throw error;
    return fail("INVALID_OBJECT_METADATA", error);
  }
}

function validateObjectMetadata(
  metadata: StoredObjectMetadata,
  declaredMimeType: string,
  maxBytes: number,
): void {
  if (!validPositiveInteger(metadata.byteLength) || !metadata.contentType) {
    fail("INVALID_OBJECT_METADATA");
  }
  if (metadata.byteLength > maxBytes) fail("OBJECT_TOO_LARGE");
  if (metadata.contentType !== declaredMimeType) fail("MIME_MISMATCH");
}

async function readObject(
  objects: ObjectInspectionProvider,
  key: string,
  maxBytes: number,
): Promise<BoundedObjectRead> {
  try {
    return await objects.readObjectBounded(key, maxBytes);
  } catch (error) {
    return fail("OBJECT_READ_FAILED", error);
  }
}

function validateObjectRead(
  read: BoundedObjectRead,
  metadata: StoredObjectMetadata,
  declaredMimeType: string,
  maxBytes: number,
): void {
  if (!validPositiveInteger(read.totalByteLength) || read.bytes.byteLength > maxBytes) {
    fail("OBJECT_READ_FAILED");
  }
  if (
    read.totalByteLength !== metadata.byteLength
    || read.bytes.byteLength !== read.totalByteLength
    || read.contentType !== metadata.contentType
  ) {
    fail("OBJECT_CHANGED_DURING_INSPECTION");
  }
  if (read.contentType !== declaredMimeType) fail("MIME_MISMATCH");
}

export async function admitTechnicalImage(input: {
  key: string;
  declaredMimeType: string;
  policy: TechnicalImagePolicy;
  objects: ObjectInspectionProvider;
}): Promise<TechnicalImageAdmission> {
  const metadata = await inspectObjectMetadata(input.objects, input.key);
  validateObjectMetadata(metadata, input.declaredMimeType, input.policy.maxBytes);
  const read = await readObject(input.objects, input.key, input.policy.maxBytes);
  validateObjectRead(read, metadata, input.declaredMimeType, input.policy.maxBytes);

  const decoded = await decodeImage(read.bytes, input.declaredMimeType, input.policy);
  return { ...decoded, byteLength: read.totalByteLength };
}
