"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { WigVariantDetail } from "@/lib/catalog.types";
import { addToCart } from "@/app/actions/cart";
import { formatPrice, type CurrencyMeta, type MarketCode } from "@/lib/market/types";
import type { Locale } from "@/lib/market/locale";
import { localizedCurlLabel, localizedLengthLabel } from "@/lib/market/catalog-presentation";
import { messagesFor } from "@/lib/market/messages";
import { MarketConfirmation } from "@/components/features/MarketConfirmation";
import { getFittingLocale } from "@/lib/fitting/locale";
import { FittingModal } from "@/components/features/FittingModal";
import { loginHref, withStorefrontHandoff } from "@/lib/market/request-context";
import {
  getAvailableColors,
  getAvailableLengths,
  getAvailableCurls,
  findSelectedVariant,
  type Selection,
} from "./variantUtils";

// ── 옵션 버튼 ────────────────────────────────────────────────

function ColorButton({
  variant,
  selected,
  onSelect,
}: {
  variant: WigVariantDetail;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-colors ${
        selected
          ? "border-gray-900 bg-gray-900 text-white"
          : "border-gray-300 text-gray-700 hover:border-gray-500"
      }`}
    >
      <span
        className="w-4 h-4 rounded-full border border-white/30 shrink-0"
        style={{ backgroundColor: variant.colorHex ?? "#ccc" }}
        aria-hidden="true"
      />
      {variant.color}
    </button>
  );
}

function OptionButton({
  label,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
        selected ? "border-gray-900 bg-gray-900 text-white"
        : disabled ? "border-gray-200 text-gray-300 cursor-not-allowed"
        : "border-gray-300 text-gray-700 hover:border-gray-500"
      }`}
    >
      {label}
    </button>
  );
}

// ── 옵션 패널 (색상/길이/컬) ──────────────────────────────────

function OptionPanels({
  variants,
  sel,
  onColor,
  onLength,
  onCurl,
  locale,
}: {
  variants: WigVariantDetail[];
  sel: Selection;
  onColor: (c: string) => void;
  onLength: (l: string) => void;
  onCurl: (c: string) => void;
  locale: Locale;
}) {
  const messages = messagesFor(locale).product;
  const colors = getAvailableColors(variants);
  const lengths = getAvailableLengths(variants, sel.color);
  const curls = getAvailableCurls(variants, sel.color, sel.length);

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="text-sm font-medium text-gray-700 mb-2">{messages.color}</legend>
        <div className="flex flex-wrap gap-2">
          {colors.map((v) => (
            <ColorButton key={v.color} variant={v} selected={sel.color === v.color} onSelect={() => onColor(v.color)} />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-gray-700 mb-2">{messages.length}</legend>
        <div className="flex flex-wrap gap-2">
          {["short", "medium", "long"].map((len) => (
            <OptionButton key={len} label={localizedLengthLabel(len, locale)} selected={sel.length === len} disabled={!lengths.includes(len)} onSelect={() => onLength(len)} />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-gray-700 mb-2">{messages.curl}</legend>
        <div className="flex flex-wrap gap-2">
          {["straight", "wavy", "curly"].map((curl) => (
            <OptionButton key={curl} label={localizedCurlLabel(curl, locale)} selected={sel.curl === curl} disabled={!curls.includes(curl)} onSelect={() => onCurl(curl)} />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

// ── 수량 조절 ────────────────────────────────────────────────

function QuantityStepper({
  quantity,
  maxStock,
  onChange,
  locale,
}: {
  quantity: number;
  maxStock: number;
  onChange: (n: number) => void;
  locale: Locale;
}) {
  const messages = messagesFor(locale).product;
  return (
    <div className="flex items-center gap-3">
      <label htmlFor="quantity" className="text-sm font-medium text-gray-700">{messages.quantity}</label>
      <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
        <button type="button" onClick={() => onChange(quantity - 1)} disabled={quantity <= 1} aria-label={messages.decreaseQuantity} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40">−</button>
        <input id="quantity" type="number" min={1} max={maxStock} value={quantity} onChange={(e) => onChange(Math.max(1, Number(e.target.value)))} className="w-12 text-center text-sm py-1.5 border-x border-gray-300 focus:outline-none" />
        <button type="button" onClick={() => onChange(quantity + 1)} disabled={quantity >= maxStock} aria-label={messages.increaseQuantity} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40">+</button>
      </div>
    </div>
  );
}

// ── 피드백 메시지 ────────────────────────────────────────────

function FeedbackMessage({ feedback, marketCode, locale }: { feedback: { ok: boolean; msg: string } | null; marketCode: MarketCode; locale: Locale }) {
  if (!feedback) return null;
  const messages = messagesFor(locale).product;
  return (
    <p role="status" aria-live="polite" className={`text-sm text-center ${feedback.ok ? "text-green-600" : "text-red-500"}`}>
      {feedback.msg}
      {feedback.ok && <Link href={withStorefrontHandoff("/cart", { marketCode, locale })} className="ml-2 underline">{messages.viewCart}</Link>}
    </p>
  );
}

// ── 담기 패널 ─────────────────────────────────────────────────

function AddToCartPanel({
  variant,
  quantity,
  isPending,
  feedback,
  marketCode,
  currency,
  onQuantityChange,
  onAddToCart,
  locale,
  marketConfirmed,
}: {
  variant: WigVariantDetail | null;
  quantity: number;
  isPending: boolean;
  feedback: { ok: boolean; msg: string } | null;
  marketCode: MarketCode;
  currency: CurrencyMeta;
  onQuantityChange: (n: number) => void;
  onAddToCart: () => void;
  locale: Locale;
  marketConfirmed: boolean;
}) {
  const messages = messagesFor(locale);
  const canAdd = purchasableVariant(variant) && !isPending;
  return (
    <div className="space-y-4">
      {variant && (
        <p className="text-lg font-semibold text-gray-900">
          {displayVariantPrice(variant, currency, locale)}
          {variant.stock === 0 ? <span className="ml-2 text-sm font-normal text-red-500">{messages.product.soldOut}</span> : null}
        </p>
      )}

      <QuantityStepper quantity={quantity} maxStock={variant?.stock ?? 99} onChange={onQuantityChange} locale={locale} />

      {!marketConfirmed ? <p className="text-sm text-amber-700">{messages.marketConfirmation.required}</p> : null}

      <button type="button" onClick={onAddToCart} disabled={!canAdd || !marketConfirmed} aria-busy={isPending}
        className="w-full py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        {isPending ? messages.product.adding : messages.product.addToCart}
      </button>

      <FeedbackMessage feedback={feedback} marketCode={marketCode} locale={locale} />
    </div>
  );
}

function purchasableVariant(variant: WigVariantDetail | null): variant is WigVariantDetail {
  return variant !== null && variant.stock > 0 && variant.price !== null;
}

function displayVariantPrice(variant: WigVariantDetail, currency: CurrencyMeta, locale: Locale): string {
  if (variant.price === null) return messagesFor(locale).styles.priceUnavailable;
  return formatPrice(variant.price, currency, locale);
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────

export function VariantSelector({
  variants,
  wigStyleId,
  marketCode,
  currency,
  locale,
  currentMarketCode,
}: {
  variants: WigVariantDetail[];
  wigStyleId: string;
  marketCode: MarketCode;
  currency: CurrencyMeta;
  locale: Locale;
  currentMarketCode: MarketCode | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sel, setSel] = useState<Selection>({ color: null, length: null, curl: null });
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isFittingOpen, setIsFittingOpen] = useState(false);
  const [isMarketConfirmed, setMarketConfirmed] = useState(currentMarketCode === marketCode);

  const selected = findSelectedVariant(variants, sel);
  const t = getFittingLocale(locale);

  function handleAddToCart() {
    if (!selected) return;
    startTransition(async () => {
      const result = await addToCart(marketCode, selected.id, wigStyleId, quantity);
      if (result.success) {
        setFeedback({ ok: true, msg: messagesFor(locale).product.added });
      } else if (result.errorCode === "UNAUTHORIZED") {
        const returnTarget = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        router.push(loginHref(returnTarget, { marketCode, locale }));
      } else {
        setFeedback({ ok: false, msg: cartActionErrorMessage(result.errorCode, locale) });
      }
    });
  }

  return (
    <div className="space-y-5">
      <OptionPanels
        variants={variants}
        sel={sel}
        onColor={(c) => { setSel({ color: c, length: null, curl: null }); setFeedback(null); }}
        onLength={(l) => { setSel((s) => ({ ...s, length: l, curl: null })); setFeedback(null); }}
        onCurl={(c) => { setSel((s) => ({ ...s, curl: c })); setFeedback(null); }}
        locale={locale}
      />

      {selected && (
        <button
          type="button"
          onClick={() => setIsFittingOpen(true)}
          className="w-full py-2.5 border border-gray-900 text-gray-900 font-medium rounded-xl hover:bg-gray-50 transition-colors text-sm"
        >
          {t.cta}
        </button>
      )}

      <AddToCartPanel
        variant={selected}
        quantity={quantity}
        isPending={isPending}
        feedback={feedback}
        marketCode={marketCode}
        currency={currency}
        onQuantityChange={setQuantity}
        onAddToCart={() => { void handleAddToCart(); }}
        locale={locale}
        marketConfirmed={isMarketConfirmed}
      />

      {!isMarketConfirmed ? (
        <MarketConfirmation
          currentMarketCode={currentMarketCode}
          targetMarketCode={marketCode}
          locale={locale}
          onConfirmed={() => setMarketConfirmed(true)}
        />
      ) : null}

      {isFittingOpen && selected && (
        <FittingModal
          variantId={selected.id}
          wigStyleId={wigStyleId}
          marketCode={marketCode}
          locale={locale}
          t={t}
          onClose={() => setIsFittingOpen(false)}
        />
      )}
    </div>
  );
}

function cartActionErrorMessage(errorCode: string, locale: Locale): string {
  const messages = messagesFor(locale);
  if (errorCode === "MARKET_CONFIRMATION_REQUIRED") return messages.marketConfirmation.required;
  if (errorCode === "MARKET_CHANGED") return messages.selector.impactChanged;
  if (errorCode === "UNAUTHORIZED") return messages.login.title;
  return messages.cart.unavailableNotice;
}
