import "server-only";

const LOGIN_CALLBACK_FALLBACK = "/styles";
const MAX_LOGIN_CALLBACK_URL_LENGTH = 512;
const RESERVED_LOGIN_TARGET = /^\/(?:login|api|_next)(?:[/?#]|$)/;

export function resolveLoginCallbackUrl(value: unknown): string {
  if (typeof value !== "string") {
    return LOGIN_CALLBACK_FALLBACK;
  }

  if (
    value.length < 1 ||
    value.length > MAX_LOGIN_CALLBACK_URL_LENGTH
  ) {
    return LOGIN_CALLBACK_FALLBACK;
  }

  if (value.trim() !== value) {
    return LOGIN_CALLBACK_FALLBACK;
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return LOGIN_CALLBACK_FALLBACK;
  }

  if (
    value.includes("\\") ||
    includesAsciiControlOrDel(value)
  ) {
    return LOGIN_CALLBACK_FALLBACK;
  }

  if (RESERVED_LOGIN_TARGET.test(value)) {
    return LOGIN_CALLBACK_FALLBACK;
  }

  return value;
}

function includesAsciiControlOrDel(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1F || codePoint === 0x7F)) {
      return true;
    }
  }
  return false;
}
