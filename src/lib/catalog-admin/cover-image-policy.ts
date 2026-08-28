import "server-only";

import {
  admitTechnicalImage,
  type TechnicalImageFormat,
  type TechnicalImagePolicy,
} from "@/lib/media/image-technical-admission";
import type { ObjectInspectionProvider } from "@/lib/storage/types";

const CATALOG_COVER_KEY_RE = /^wig-style\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.(jpg|png|webp)$/;

export const CATALOG_COVER_IMAGE_POLICY: TechnicalImagePolicy = Object.freeze({
  allowedFormats: Object.freeze([
    "jpeg",
    "png",
    "webp",
  ] satisfies readonly TechnicalImageFormat[]),
  maxBytes: 12 * 1024 * 1024,
  maxWidth: 8192,
  maxHeight: 8192,
  maxPixels: 40_000_000,
});

function declaredMimeTypeForCatalogKey(key: string): string | null {
  const match = CATALOG_COVER_KEY_RE.exec(key);
  if (!match) return null;
  if (match[1] === "jpg") return "image/jpeg";
  if (match[1] === "png") return "image/png";
  if (match[1] === "webp") return "image/webp";
  return null;
}

export async function admitCatalogCoverImage(
  key: string,
  objects: ObjectInspectionProvider,
): Promise<void> {
  const declaredMimeType = declaredMimeTypeForCatalogKey(key);
  if (!declaredMimeType) throw new Error("Catalog cover key is invalid.");
  await admitTechnicalImage({
    key,
    declaredMimeType,
    policy: CATALOG_COVER_IMAGE_POLICY,
    objects,
  });
}

export function isCatalogCoverKey(key: string): boolean {
  return declaredMimeTypeForCatalogKey(key) !== null;
}
