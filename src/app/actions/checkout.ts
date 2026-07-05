"use server";

import { ShippingCountry } from "@prisma/client";
import { getCurrentMarketCode } from "@/lib/market/resolve";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  SessionException,
  createCheckoutSession,
  type CheckoutShippingInput,
  type CreateCheckoutSessionResult,
  type SessionErrorCode,
} from "@/lib/payment/session";

export type CheckoutActionErrorCode = SessionErrorCode | "UNAUTHORIZED";

export interface CheckoutActionInput {
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

  const shipping = toShippingInput(input);
  if (!shipping) return invalidCountry();

  try {
    const marketCode = await getCurrentMarketCode();
    const created = await createCheckoutSession(db, { userId: session.user.id, marketCode, shipping });
    return { success: true, session: created };
  } catch (e) {
    if (e instanceof SessionException) return sessionError(e);
    throw e;
  }
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
