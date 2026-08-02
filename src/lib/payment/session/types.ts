import type { ShippingCountry } from "@prisma/client";
import type { MarketCode } from "@/lib/market/types";

// 30 minutes keeps stale payment intents short-lived while leaving room for address/payment entry.
export const SESSION_TTL_MS = 30 * 60 * 1_000;

// Conservative batch size: enough for cleanup drift without making a cron tick heavy.
export const SESSION_SWEEP_LIMIT_DEFAULT = 100;

export type SessionErrorCode =
  | "CART_EMPTY"
  | "VARIANT_PARENT_MISMATCH"
  | "STYLE_UNPUBLISHED"
  | "VARIANT_UNAVAILABLE"
  | "VARIANT_PRICE_UNAVAILABLE"
  | "STOCK_INSUFFICIENT"
  | "MARKET_UNAVAILABLE"
  | "SHIPPING_COUNTRY_INVALID"
  | "SHIPPING_ADDRESS_INVALID"
  | "TOTAL_AMOUNT_TOO_LOW"
  | "INVALID_AMOUNT";

export class SessionException extends Error {
  constructor(
    public readonly code: SessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SessionException";
  }
}

export interface CheckoutShippingInput {
  recipientName: string;
  phone: string;
  country: ShippingCountry;
  postalCode: string;
  administrativeArea: string;
  city: string;
  addressLine1: string;
  addressLine2?: string;
  memo?: string;
}

export interface CreateCheckoutSessionInput {
  userId: string;
  marketCode: MarketCode;
  shipping: CheckoutShippingInput;
  now?: Date;
}

export interface CreateCheckoutSessionResult {
  sessionId: string;
  expiresAt: Date;
  subtotalAmount: number;
  shippingAmount: number;
  totalAmount: number;
  currency: string;
}

export interface ExpireStaleInput {
  now: Date;
  limit?: number;
}

export type CheckoutSessionTransition =
  | { from: "SUBMITTED"; to: "COMPLETED" }
  | { from: "SUBMITTED"; to: "FAILED" }
  | { from: "SUBMITTED"; to: "EXPIRED" }
  | { from: "EXPIRED"; to: "COMPLETED" };

export interface TransitionCheckoutSessionInput {
  sessionId: string;
  transition: CheckoutSessionTransition;
  now: Date;
}
