import { EximbayProtocolError } from "./errors";
import { requireEximbayCurrency, type EximbayCurrency } from "./types";

export const EXIMBAY_MAX_AMOUNT_MINOR = 2_147_483_647;

export interface EximbayCanonicalAmount {
  readonly currency: EximbayCurrency;
  readonly minor: number;
  readonly wire: string;
}

export function encodeEximbayAmount(currencyInput: unknown, minorInput: unknown): string {
  const currency = requireEximbayCurrency(currencyInput);
  const minor = requireMinorAmount(minorInput);
  if (currency === "JPY") return String(minor);
  const digits = String(minor).padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export function decodeEximbayAmount(currencyInput: unknown, wireInput: unknown): number {
  const currency = requireEximbayCurrency(currencyInput);
  if (typeof wireInput !== "string") throw new EximbayProtocolError("INVALID_WIRE_AMOUNT");
  if (currency === "JPY") return decodeJpy(wireInput);
  return decodeUsd(wireInput);
}

export function createEximbayCanonicalAmount(
  currencyInput: unknown,
  minorInput: unknown,
): EximbayCanonicalAmount {
  const currency = requireEximbayCurrency(currencyInput);
  const minor = requireMinorAmount(minorInput);
  return Object.freeze({
    currency,
    minor,
    wire: encodeEximbayAmount(currency, minor),
  });
}

function requireMinorAmount(value: unknown): number {
  if (typeof value !== "number") throw new EximbayProtocolError("INVALID_MINOR_AMOUNT");
  if (!Number.isFinite(value)) throw new EximbayProtocolError("INVALID_MINOR_AMOUNT");
  if (!Number.isSafeInteger(value)) throw new EximbayProtocolError("INVALID_MINOR_AMOUNT");
  if (Object.is(value, -0) || value <= 0) throw new EximbayProtocolError("INVALID_MINOR_AMOUNT");
  if (value > EXIMBAY_MAX_AMOUNT_MINOR) throw new EximbayProtocolError("AMOUNT_LIMIT_EXCEEDED");
  return value;
}

function decodeJpy(wire: string): number {
  if (!/^[1-9]\d*$/u.test(wire)) throw new EximbayProtocolError("INVALID_WIRE_AMOUNT");
  return boundedDigitsToMinor(wire);
}

function decodeUsd(wire: string): number {
  if (!/^(?:0|[1-9]\d*)\.\d{2}$/u.test(wire)) {
    throw new EximbayProtocolError("INVALID_WIRE_AMOUNT");
  }
  const digits = wire.replace(".", "");
  return boundedDigitsToMinor(digits);
}

function boundedDigitsToMinor(digits: string): number {
  let amount = 0;
  for (const digit of digits) {
    amount = amount * 10 + digit.charCodeAt(0) - 48;
    if (amount > EXIMBAY_MAX_AMOUNT_MINOR) {
      throw new EximbayProtocolError("AMOUNT_LIMIT_EXCEEDED");
    }
  }
  if (amount <= 0) throw new EximbayProtocolError("INVALID_WIRE_AMOUNT");
  return amount;
}
