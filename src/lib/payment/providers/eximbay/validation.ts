import { EximbayProtocolError } from "./errors";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string" || !allowed.has(key))) {
    throw new EximbayProtocolError("UNKNOWN_PROPERTY");
  }
  if (required.some((key) => !Object.hasOwn(value, key))) {
    throw new EximbayProtocolError("MISSING_PROPERTY");
  }
}

export function requireExactText(value: unknown, code = "INVALID_TEXT"): string {
  if (typeof value !== "string") throw new EximbayProtocolError(code);
  if (value.length === 0 || value.trim().length === 0) throw new EximbayProtocolError(code);
  if (value !== value.trim()) throw new EximbayProtocolError(code);
  if (hasPreparationControlCharacter(value) || hasUnpairedSurrogate(value)) {
    throw new EximbayProtocolError(code);
  }
  return value;
}

export function hasProhibitedDecodedCharacter(value: string): boolean {
  return hasStatusControlCharacter(value) || hasUnpairedSurrogate(value);
}

export function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (isHighSurrogate(code)) {
      if (index + 1 >= value.length) return true;
      const next = value.charCodeAt(index + 1);
      if (!isLowSurrogate(next)) return true;
      index += 1;
      continue;
    }
    if (isLowSurrogate(code)) return true;
  }
  return false;
}

function hasPreparationControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

function hasStatusControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}
