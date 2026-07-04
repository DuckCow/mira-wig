import type { Prisma } from "@prisma/client";
import type { SnapshotData } from "./types";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toStrOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function parseSnapshotData(raw: unknown): SnapshotData {
  if (!isPlainObject(raw)) throw new Error("Invalid snapshotData");
  return {
    styleName: toStr(raw.styleName),
    color: toStr(raw.color),
    colorHex: toStrOrNull(raw.colorHex),
    length: toStr(raw.length),
    curl: toStr(raw.curl),
    coverImageKey: toStrOrNull(raw.coverImageKey),
    currencyCode: toStr(raw.currencyCode),
  };
}

export function snapshotToJson(data: SnapshotData): Prisma.InputJsonValue {
  return {
    styleName: data.styleName,
    color: data.color,
    colorHex: data.colorHex,
    length: data.length,
    curl: data.curl,
    coverImageKey: data.coverImageKey,
    currencyCode: data.currencyCode,
  };
}
