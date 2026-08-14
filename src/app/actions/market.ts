"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import {
  getCartItemCount,
  getMarketAdmissionImpact,
  getMarketSwitchImpact,
  type MarketSwitchImpact,
} from "@/lib/cart";
import { getStorefrontContext } from "@/lib/market/resolve";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/lib/market/locale";
import {
  fallbackLocaleForMarket,
  isEnabledSiteVariant,
} from "@/lib/market/site-variant";
import { isMarketCode, MARKET_COOKIE, type MarketCode } from "@/lib/market/types";
import { isActiveMarket } from "@/lib/market/active-market";

const COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  httpOnly: true,
  sameSite: "lax" as const,
};

export type MarketSwitchResult =
  | { kind: "SWITCHED"; marketCode: MarketCode; locale: Locale }
  | { kind: "PREVIEW"; impact: MarketSwitchImpact; locale: Locale }
  | { kind: "IMPACT_CHANGED"; impact: MarketSwitchImpact; locale: Locale }
  | { kind: "INVALID" };

export async function previewMarketSwitch(targetValue: string): Promise<MarketSwitchResult> {
  if (!isMarketCode(targetValue)) return { kind: "INVALID" };
  if (!await isActiveMarket(targetValue)) return { kind: "INVALID" };
  const [context, session] = await Promise.all([getStorefrontContext(), getSession()]);
  const locale = targetLocale(targetValue, context.locale);
  if (targetValue === context.confirmedMarketCode) {
    return { kind: "SWITCHED", marketCode: targetValue, locale };
  }
  if (!session?.user.id) {
    await writeMarketPreference(targetValue);
    return { kind: "SWITCHED", marketCode: targetValue, locale };
  }
  const impact = await marketImpactFor(
    session.user.id,
    context.confirmedMarketCode,
    targetValue,
  );
  if (impact.lines.length === 0) {
    await writeMarketPreference(targetValue);
    return { kind: "SWITCHED", marketCode: targetValue, locale };
  }
  return { kind: "PREVIEW", impact, locale };
}

export async function confirmMarketSwitch(
  targetValue: string,
  expectedFingerprint: string,
): Promise<MarketSwitchResult> {
  if (!isMarketCode(targetValue)) return { kind: "INVALID" };
  if (!await isActiveMarket(targetValue)) return { kind: "INVALID" };
  const [context, session] = await Promise.all([getStorefrontContext(), getSession()]);
  const locale = targetLocale(targetValue, context.locale);
  if (!session?.user.id) return { kind: "INVALID" };
  const impact = await marketImpactFor(
    session.user.id,
    context.confirmedMarketCode,
    targetValue,
  );
  if (impact.fingerprint !== expectedFingerprint) {
    return { kind: "IMPACT_CHANGED", impact, locale };
  }
  await writeMarketPreference(targetValue);
  return { kind: "SWITCHED", marketCode: targetValue, locale };
}

export async function setLocalePreference(localeValue: string): Promise<boolean> {
  if (!isLocale(localeValue)) return false;
  const context = await getStorefrontContext();
  if (!isEnabledSiteVariant(context.marketCode, localeValue)) return false;
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, localeValue, COOKIE_OPTIONS);
  revalidatePath("/", "layout");
  return true;
}

export async function confirmCurrentMarket(expectedValue: string): Promise<boolean> {
  if (!isMarketCode(expectedValue)) return false;
  if (!await isActiveMarket(expectedValue)) return false;
  const [context, session] = await Promise.all([getStorefrontContext(), getSession()]);
  if (context.confirmedMarketCode === expectedValue) return true;
  if (session?.user.id && await getCartItemCount(session.user.id) > 0) return false;
  await writeMarketPreference(expectedValue);
  return true;
}

function marketImpactFor(
  userId: string,
  confirmedMarketCode: MarketCode | null,
  targetMarketCode: MarketCode,
): Promise<MarketSwitchImpact> {
  if (confirmedMarketCode === null) {
    return getMarketAdmissionImpact(userId, targetMarketCode);
  }
  return getMarketSwitchImpact(userId, confirmedMarketCode, targetMarketCode);
}

function targetLocale(marketCode: MarketCode, currentLocale: Locale): Locale {
  return fallbackLocaleForMarket(marketCode, currentLocale);
}

async function writeMarketPreference(marketCode: MarketCode): Promise<void> {
  const jar = await cookies();
  jar.set(MARKET_COOKIE, marketCode, COOKIE_OPTIONS);
  revalidatePath("/", "layout");
}
