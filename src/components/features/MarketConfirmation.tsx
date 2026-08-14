"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmMarketSwitch,
  previewMarketSwitch,
  type MarketSwitchResult,
} from "@/app/actions/market";
import { MARKET_CONFIGS, formatPrice, type MarketCode } from "@/lib/market/types";
import { messagesFor } from "@/lib/market/messages";
import type { Locale } from "@/lib/market/locale";

type MarketImpactPreview = Extract<MarketSwitchResult, { kind: "PREVIEW" | "IMPACT_CHANGED" }>;

export interface MarketConfirmationProps {
  currentMarketCode: MarketCode | null;
  targetMarketCode: MarketCode;
  locale: Locale;
  onConfirmed?: () => void;
}

interface MarketConfirmationViewProps extends MarketConfirmationProps {
  preview: MarketImpactPreview | null;
  isPending: boolean;
  onReview: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function MarketConfirmation({
  currentMarketCode,
  targetMarketCode,
  locale,
  onConfirmed,
}: MarketConfirmationProps) {
  const [locallyConfirmedMarket, setLocallyConfirmedMarket] = useState<MarketCode | null>(null);
  const [preview, setPreview] = useState<MarketImpactPreview | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const effectiveCurrentMarket = locallyConfirmedMarket === targetMarketCode
    ? targetMarketCode
    : currentMarketCode;

  return (
    <MarketConfirmationView
      currentMarketCode={effectiveCurrentMarket}
      targetMarketCode={targetMarketCode}
      locale={locale}
      preview={preview}
      isPending={isPending}
      onReview={() => startTransition(async () => {
        const result = await previewMarketSwitch(targetMarketCode);
        if (result.kind === "SWITCHED") completeConfirmation();
        else if (result.kind === "PREVIEW" || result.kind === "IMPACT_CHANGED") setPreview(result);
      })}
      onCancel={() => setPreview(null)}
      onConfirm={() => startTransition(async () => {
        if (!preview) return;
        const result = await confirmMarketSwitch(preview.impact.targetMarket, preview.impact.fingerprint);
        if (result.kind === "SWITCHED") completeConfirmation();
        else if (result.kind === "IMPACT_CHANGED") setPreview(result);
      })}
    />
  );

  function completeConfirmation(): void {
    setPreview(null);
    setLocallyConfirmedMarket(targetMarketCode);
    onConfirmed?.();
    router.refresh();
  }
}

export function MarketConfirmationView({
  currentMarketCode,
  targetMarketCode,
  locale,
  preview,
  isPending,
  onReview,
  onCancel,
  onConfirm,
}: MarketConfirmationViewProps) {
  if (currentMarketCode === targetMarketCode && preview === null) return <CurrentMarketTruth marketCode={currentMarketCode} locale={locale} />;

  return (
    <MarketSwitchProposal
      currentMarketCode={currentMarketCode}
      targetMarketCode={targetMarketCode}
      locale={locale}
      preview={preview}
      isPending={isPending}
      onReview={onReview}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

function CurrentMarketTruth({ marketCode, locale }: { marketCode: MarketCode; locale: Locale }) {
  const messages = messagesFor(locale).marketConfirmation;
  return (
    <section aria-label={messages.currentCartMarketLabel} className="space-y-1 text-xs text-gray-500">
      <p><span className="font-medium">{messages.currentCartMarketLabel}:</span> {marketIdentity(marketCode)}</p>
      <p>{messages.currentPricePremise}</p>
    </section>
  );
}

function MarketSwitchProposal({
  currentMarketCode,
  targetMarketCode,
  locale,
  preview,
  isPending,
  onReview,
  onCancel,
  onConfirm,
}: MarketConfirmationViewProps) {
  const messages = messagesFor(locale).marketConfirmation;

  const displayedCurrentMarket = preview ? preview.impact.currentMarket : currentMarketCode;
  const displayedTargetMarket = preview ? preview.impact.targetMarket : targetMarketCode;
  const premiseId = "market-switch-proposal-premise";
  const staleId = "market-switch-stale-impact";

  return (
    <aside
      aria-label={messages.previewRegionLabel}
      aria-describedby={preview?.kind === "IMPACT_CHANGED" ? `${premiseId} ${staleId}` : premiseId}
      className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm"
    >
      {displayedCurrentMarket ? (
        <div className="space-y-1">
          <p><span className="font-medium">{messages.currentCartMarketLabel}:</span> <strong>{marketIdentity(displayedCurrentMarket)}</strong></p>
          <p className="text-xs text-gray-600">{messages.currentPricePremise}</p>
        </div>
      ) : (
        <p role="status" className="font-medium text-amber-900">{messages.noConfirmedMarketPremise}</p>
      )}
      <p><span className="font-medium">{messages.proposedTargetMarketLabel}:</span> <strong>{marketIdentity(displayedTargetMarket)}</strong></p>
      <p id={premiseId} className="text-xs text-gray-600">{messages.switchPreviewPremise}</p>

      {preview ? (
        <MarketImpactPreviewPanel
          preview={preview}
          locale={locale}
          premiseId={premiseId}
          staleId={staleId}
          isPending={isPending}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      ) : (
        <button
          type="button"
          disabled={isPending}
          aria-describedby={premiseId}
          onClick={onReview}
          className="rounded bg-gray-900 px-3 py-1.5 text-xs text-white"
        >
          {messages.reviewImpact}: {MARKET_CONFIGS[displayedTargetMarket].label}
        </button>
      )}
    </aside>
  );
}

function MarketImpactPreviewPanel({
  preview,
  locale,
  premiseId,
  staleId,
  isPending,
  onCancel,
  onConfirm,
}: {
  preview: MarketImpactPreview;
  locale: Locale;
  premiseId: string;
  staleId: string;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const messages = messagesFor(locale).marketConfirmation;
  const { impact } = preview;
  return (
    <section aria-label={messages.previewRegionLabel} className="rounded-lg border border-amber-200 bg-white p-3">
      {preview.kind === "IMPACT_CHANGED" ? (
        <p id={staleId} role="alert" className="mb-2 text-xs text-red-600">{messages.impactChanged}</p>
      ) : null}
      <dl className="text-xs text-gray-800">
        <dt className="font-semibold">{impact.currentCurrency ? messages.currencyTransitionLabel : messages.proposedCurrencyLabel}</dt>
        <dd className="mt-1 flex items-center gap-2">
          {impact.currentCurrency ? (
            <>
              <span><span className="sr-only">{messages.currentAmountLabel}: </span>{impact.currentCurrency}</span>
              <span aria-hidden="true">→</span>
            </>
          ) : null}
          <span><span className="sr-only">{messages.targetAmountLabel}: </span>{impact.targetCurrency}</span>
        </dd>
      </dl>
      <ul className="mt-3 space-y-2 text-xs">
        {impact.lines.map((line) => (
          <ImpactLine
            key={line.cartItemId}
            line={line}
            currentMarketCode={impact.currentMarket}
            targetMarketCode={impact.targetMarket}
            locale={locale}
          />
        ))}
      </ul>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded border border-gray-300 px-3 py-1.5 text-xs">{messages.cancel}</button>
        <button
          type="button"
          disabled={isPending}
          aria-describedby={preview.kind === "IMPACT_CHANGED" ? staleId : premiseId}
          onClick={onConfirm}
          className="rounded bg-gray-900 px-3 py-1.5 text-xs text-white"
        >
          {messages.confirmSwitch}: {MARKET_CONFIGS[impact.targetMarket].label}
        </button>
      </div>
    </section>
  );
}

function ImpactLine({
  line,
  currentMarketCode,
  targetMarketCode,
  locale,
}: {
  line: MarketImpactPreview["impact"]["lines"][number];
  currentMarketCode: MarketCode | null;
  targetMarketCode: MarketCode;
  locale: Locale;
}) {
  const messages = messagesFor(locale).marketConfirmation;
  const targetAmount = availableImpactAmount(line.targetAvailable, line.targetUnitAmount, targetMarketCode, locale);
  const currentSubtotal = currentMarketCode && line.currentUnitAmount !== null
    ? impactAmount(line.currentUnitAmount * line.quantity, currentMarketCode, locale)
    : null;
  const targetSubtotal = availableImpactAmount(
    line.targetAvailable,
    line.targetUnitAmount,
    targetMarketCode,
    locale,
    line.quantity,
  );
  return (
    <li className="rounded bg-gray-50 p-2">
      <p className="font-medium text-gray-800">{line.styleName} × {line.quantity}</p>
      <p className="mt-1 text-gray-500">{messages.unitPriceTransitionLabel}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-2">
        {currentMarketCode ? (
          <>
            <span>
              <span className="font-medium">{messages.currentAmountLabel}:</span>{" "}
              {impactAmount(line.currentUnitAmount, currentMarketCode, locale)}
            </span>
            <span aria-hidden="true">→</span>
          </>
        ) : null}
        {targetAmount ? (
          <span><span className="font-medium">{messages.targetAmountLabel}:</span> {targetAmount}</span>
        ) : (
          <span role="status" className="font-medium text-red-600">
            {messages.targetAmountLabel}: {messages.unavailableTargetState}
          </span>
        )}
      </div>
      <p className="mt-2 text-gray-500">{messages.lineSubtotalTransitionLabel}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-2">
        {currentSubtotal ? (
          <>
            <span><span className="font-medium">{messages.currentAmountLabel}:</span> {currentSubtotal}</span>
            <span aria-hidden="true">→</span>
          </>
        ) : null}
        {targetSubtotal ? (
          <span><span className="font-medium">{messages.targetAmountLabel}:</span> {targetSubtotal}</span>
        ) : (
          <span role="status" className="font-medium text-red-600">
            {messages.targetAmountLabel}: {messages.unavailableTargetState}
          </span>
        )}
      </div>
    </li>
  );
}

function marketIdentity(marketCode: MarketCode): string {
  const market = MARKET_CONFIGS[marketCode];
  return `${market.label} · ${market.currency.code}`;
}

function impactAmount(amount: number | null, marketCode: MarketCode, locale: Locale): string {
  if (amount === null) return "—";
  return formatPrice(amount, MARKET_CONFIGS[marketCode].currency, locale);
}

function availableImpactAmount(
  available: boolean,
  unitAmount: number | null,
  marketCode: MarketCode,
  locale: Locale,
  quantity = 1,
): string | null {
  if (!available || unitAmount === null) return null;
  return impactAmount(unitAmount * quantity, marketCode, locale);
}
