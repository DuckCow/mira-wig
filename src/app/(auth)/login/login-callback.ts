import "server-only";
import { decodeSafeRelativeApplicationPath } from "@/lib/market/request-context";

const LOGIN_CALLBACK_FALLBACK = "/styles";
const MAX_LOGIN_CALLBACK_URL_LENGTH = 512;
const RESERVED_LOGIN_TARGET = /^\/(?:login|api|_next)(?:[/?#]|$)/;

export function resolveLoginCallbackUrl(value: unknown, fallback = LOGIN_CALLBACK_FALLBACK): string {
  if (typeof value !== "string") {
    return fallback;
  }

  if (
    value.length < 1 ||
    value.length > MAX_LOGIN_CALLBACK_URL_LENGTH
  ) {
    return fallback;
  }

  if (value.trim() !== value) {
    return fallback;
  }

  const decoded = decodeSafeRelativeApplicationPath(value);
  if (decoded === null) return fallback;

  if (RESERVED_LOGIN_TARGET.test(decoded)) {
    return fallback;
  }

  return value;
}
