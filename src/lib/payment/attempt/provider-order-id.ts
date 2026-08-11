import "server-only";
import { randomBytes } from "node:crypto";

const EXIMBAY_PROVIDER_ORDER_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const EXIMBAY_PROVIDER_ORDER_PAYLOAD_LENGTH = 24;
const EXIMBAY_PROVIDER_ORDER_ACCEPTED_BYTE_LIMIT = 252;
const EXIMBAY_PROVIDER_ORDER_PATTERN = /^c[0-9a-z]{24}$/u;

export function generateEximbayProviderOrderId(): string {
  let payload = "";
  while (payload.length < EXIMBAY_PROVIDER_ORDER_PAYLOAD_LENGTH) {
    const entropy = randomBytes(EXIMBAY_PROVIDER_ORDER_PAYLOAD_LENGTH * 2);
    for (const byte of entropy) {
      if (byte >= EXIMBAY_PROVIDER_ORDER_ACCEPTED_BYTE_LIMIT) continue;
      payload += EXIMBAY_PROVIDER_ORDER_ALPHABET.charAt(
        byte % EXIMBAY_PROVIDER_ORDER_ALPHABET.length,
      );
      if (payload.length === EXIMBAY_PROVIDER_ORDER_PAYLOAD_LENGTH) break;
    }
  }
  return `c${payload}`;
}

export function isValidEximbayProviderOrderId(value: unknown): value is string {
  return typeof value === "string" && EXIMBAY_PROVIDER_ORDER_PATTERN.test(value);
}
