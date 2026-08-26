"use server";

import { ShippingCountry } from "@prisma/client";
import { getStorefrontContext } from "@/lib/market/resolve";
import { isMarketCode } from "@/lib/market/types";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  SessionException,
  createCheckoutSession,
  type CheckoutShippingInput,
  type CreateCheckoutSessionResult,
  type SessionErrorCode,
} from "@/lib/payment/session";

export type CheckoutActionErrorCode = SessionErrorCode | "UNAUTHORIZED" | "MARKET_CHANGED" | "MARKET_CONFIRMATION_REQUIRED";

export interface CheckoutActionInput {
  expectedMarketCode: string;
  recipientName: string;
  phone: string;
  country: string;
  postalCode: string;
  administrativeArea: string;
  city: string;
  addressLine1: string;
  addressLine2?: string;
  memo?: string;
}

export type CheckoutActionResult =
  | { success: true; session: CreateCheckoutSessionResult }
  | { success: false; errorCode: CheckoutActionErrorCode; error: string };

export async function createCheckoutSessionAction(
  input: CheckoutActionInput,
): Promise<CheckoutActionResult> {
  const session = await getSession();
  if (!session?.user.id) return unauthorized();

  const context = await getStorefrontContext();
  if (context.confirmedMarketCode === null) return marketConfirmationRequired();
  if (!isMarketCode(input.expectedMarketCode)) return marketChanged();
  const marketCode = context.confirmedMarketCode;
  if (marketCode !== input.expectedMarketCode) return marketChanged();

  const shipping = toShippingInput(input);
  if (!shipping) return invalidCountry();

  try {
    const created = await createCheckoutSession(db, {
      userId: session.user.id,
      marketCode,
      communicationLocale: context.locale,
      shipping,
    });
    return { success: true, session: created };
  } catch (e) {
    if (e instanceof SessionException) return sessionError(e);
    throw e;
  }
}

function marketConfirmationRequired(): CheckoutActionResult {
  return {
    success: false,
    errorCode: "MARKET_CONFIRMATION_REQUIRED",
    error: "Delivery region confirmation is required.",
  };
}

function marketChanged(): CheckoutActionResult {
  return {
    success: false,
    errorCode: "MARKET_CHANGED",
    error: "배송 지역이 변경되었습니다. 현재 장바구니와 주문서를 다시 확인해 주세요.",
  };
}

function toShippingInput(input: CheckoutActionInput): CheckoutShippingInput | null {
  const country = parseShippingCountry(input.country);
  if (!country) return null;
  return { ...input, country };
}

function parseShippingCountry(value: string): ShippingCountry | null {
  if (value === ShippingCountry.KR) return ShippingCountry.KR;
  if (value === ShippingCountry.US) return ShippingCountry.US;
  if (value === ShippingCountry.JP) return ShippingCountry.JP;
  return null;
}

function unauthorized(): CheckoutActionResult {
  return { success: false, errorCode: "UNAUTHORIZED", error: "로그인이 필요합니다." };
}

function invalidCountry(): CheckoutActionResult {
  return {
    success: false,
    errorCode: "SHIPPING_COUNTRY_INVALID",
    error: "배송 국가가 올바르지 않습니다.",
  };
}

function sessionError(e: SessionException): CheckoutActionResult {
  return { success: false, errorCode: e.code, error: e.message };
}
