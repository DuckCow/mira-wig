"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  confirmMarketSwitch,
  previewMarketSwitch,
  setLocalePreference,
  type MarketSwitchResult,
} from "@/app/actions/market";
import { messagesFor } from "@/lib/market/messages";
import { enabledLocalesForMarket } from "@/lib/market/site-variant";
import {
  MARKET_CODES,
  MARKET_CONFIGS,
  currencyMetaForCode,
  formatPrice,
  type CurrencyCode,
  type MarketCode,
} from "@/lib/market/types";
import { isLocale, type Locale } from "@/lib/market/locale";
import { siteVariantNavigationTarget } from "@/lib/market/request-context";

const LANGUAGE_NAMES: Record<Locale, string> = { ko: "한국어", en: "English", ja: "日本語" };

export function MarketSelector({ currentMarket, currentLocale, activeMarketCodes }: { currentMarket: MarketCode; currentLocale: Locale; activeMarketCodes: readonly MarketCode[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<Extract<MarketSwitchResult, { kind: "PREVIEW" | "IMPACT_CHANGED" }> | null>(null);
  const messages = messagesFor(currentLocale);

  function navigate(marketCode: MarketCode, locale: Locale) {
    const target = siteVariantNavigationTarget(
      pathname,
      searchParams.toString(),
      window.location.hash,
      { marketCode, locale },
    );
    router.push(target);
  }

  function chooseMarket(value: string) {
    startTransition(async () => {
      const result = await previewMarketSwitch(value);
      if (result.kind === "SWITCHED") navigate(result.marketCode, result.locale);
      else if (result.kind === "PREVIEW" || result.kind === "IMPACT_CHANGED") setPreview(result);
    });
  }

  function confirmPreview() {
    if (!preview) return;
    startTransition(async () => {
      const result = await confirmMarketSwitch(preview.impact.targetMarket, preview.impact.fingerprint);
      if (result.kind === "SWITCHED") {
        setPreview(null);
        navigate(result.marketCode, result.locale);
      } else if (result.kind === "IMPACT_CHANGED") {
        setPreview(result);
      }
    });
  }

  function chooseLocale(value: string) {
    if (!isLocale(value)) return;
    startTransition(async () => {
      if (!await setLocalePreference(value)) return;
      navigate(currentMarket, value);
    });
  }

  return (
    <div className="relative">
      <div aria-label={messages.selector.label} className="flex items-center gap-1.5">
        <select value={currentMarket} disabled={isPending} aria-label={messages.selector.region} onChange={(event) => chooseMarket(event.target.value)} className="rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-600">
          {MARKET_CODES.filter((code) => activeMarketCodes.includes(code)).map((code) => <option key={code} value={code}>{MARKET_CONFIGS[code].label}</option>)}
        </select>
        <select value={currentLocale} disabled={isPending} aria-label={messages.selector.language} onChange={(event) => chooseLocale(event.target.value)} className="rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-600">
          {enabledLocalesForMarket(currentMarket).map((locale) => <option key={locale} value={locale}>{LANGUAGE_NAMES[locale]}</option>)}
        </select>
      </div>
      {preview ? (
        <div role="dialog" aria-label={messages.selector.preview} className="absolute right-0 top-10 z-30 w-80 rounded-lg border border-gray-200 bg-white p-4 shadow-xl">
          <p className="text-sm font-semibold text-gray-900">
            {preview.impact.currentCurrency
              ? `${preview.impact.currentCurrency} → ${preview.impact.targetCurrency}`
              : preview.impact.targetCurrency}
          </p>
          {preview.kind === "IMPACT_CHANGED" ? <p role="alert" className="mt-2 text-xs text-red-600">{messages.selector.impactChanged}</p> : null}
          <ul className="mt-3 max-h-48 space-y-2 overflow-auto text-xs">
            {preview.impact.lines.map((line) => (
              <li key={line.cartItemId} className="rounded bg-gray-50 p-2">
                <p className="font-medium text-gray-800">{line.styleName} × {line.quantity}</p>
                <p className={line.targetAvailable ? "text-gray-600" : "text-red-600"}>
                  {preview.impact.currentMarket
                    ? `${impactAmount(line.currentUnitAmount, preview.impact.currentCurrency, currentLocale)} → `
                    : ""}
                  {line.targetAvailable ? impactAmount(line.targetUnitAmount, preview.impact.targetCurrency, currentLocale) : messages.selector.unavailable}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setPreview(null)} className="rounded border border-gray-300 px-3 py-1.5 text-xs">{messages.selector.cancel}</button>
            <button type="button" disabled={isPending} onClick={confirmPreview} className="rounded bg-gray-900 px-3 py-1.5 text-xs text-white">{messages.selector.confirm}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function impactAmount(amount: number | null, currencyCode: CurrencyCode | null, locale: Locale): string {
  if (amount === null || currencyCode === null) return "—";
  return formatPrice(amount, currencyMetaForCode(currencyCode), locale);
}
