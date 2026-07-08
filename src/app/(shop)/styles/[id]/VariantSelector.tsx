"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WigVariantDetail } from "@/lib/catalog.types";
import { getLengthLabel, getCurlLabel } from "@/lib/wig-option-labels";
import { addToCart } from "@/app/actions/cart";
import { MARKET_CONFIGS, formatPrice, type MarketCode } from "@/lib/market/types";
import { getFittingLocale } from "@/lib/fitting/locale";
import { FittingModal } from "@/components/features/FittingModal";
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
}: {
  variants: WigVariantDetail[];
  sel: Selection;
  onColor: (c: string) => void;
  onLength: (l: string) => void;
  onCurl: (c: string) => void;
}) {
  const colors = getAvailableColors(variants);
  const lengths = getAvailableLengths(variants, sel.color);
  const curls = getAvailableCurls(variants, sel.color, sel.length);

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="text-sm font-medium text-gray-700 mb-2">색상</legend>
        <div className="flex flex-wrap gap-2">
          {colors.map((v) => (
            <ColorButton key={v.color} variant={v} selected={sel.color === v.color} onSelect={() => onColor(v.color)} />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-gray-700 mb-2">길이</legend>
        <div className="flex flex-wrap gap-2">
          {["short", "medium", "long"].map((len) => (
            <OptionButton key={len} label={getLengthLabel(len)} selected={sel.length === len} disabled={!lengths.includes(len)} onSelect={() => onLength(len)} />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-gray-700 mb-2">컬</legend>
        <div className="flex flex-wrap gap-2">
          {["straight", "wavy", "curly"].map((curl) => (
            <OptionButton key={curl} label={getCurlLabel(curl)} selected={sel.curl === curl} disabled={!curls.includes(curl)} onSelect={() => onCurl(curl)} />
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
}: {
  quantity: number;
  maxStock: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor="quantity" className="text-sm font-medium text-gray-700">수량</label>
      <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
        <button type="button" onClick={() => onChange(quantity - 1)} disabled={quantity <= 1} aria-label="수량 줄이기" className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40">−</button>
        <input id="quantity" type="number" min={1} max={maxStock} value={quantity} onChange={(e) => onChange(Math.max(1, Number(e.target.value)))} className="w-12 text-center text-sm py-1.5 border-x border-gray-300 focus:outline-none" />
        <button type="button" onClick={() => onChange(quantity + 1)} disabled={quantity >= maxStock} aria-label="수량 늘리기" className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40">+</button>
      </div>
    </div>
  );
}

// ── 피드백 메시지 ────────────────────────────────────────────

function FeedbackMessage({ feedback }: { feedback: { ok: boolean; msg: string } | null }) {
  if (!feedback) return null;
  return (
    <p role="status" aria-live="polite" className={`text-sm text-center ${feedback.ok ? "text-green-600" : "text-red-500"}`}>
      {feedback.msg}
      {feedback.ok && <a href="/cart" className="ml-2 underline">장바구니 보기</a>}
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
  onQuantityChange,
  onAddToCart,
}: {
  variant: WigVariantDetail | null;
  quantity: number;
  isPending: boolean;
  feedback: { ok: boolean; msg: string } | null;
  marketCode: MarketCode;
  onQuantityChange: (n: number) => void;
  onAddToCart: () => void;
}) {
  const { currency } = MARKET_CONFIGS[marketCode];
  const canAdd = variant !== null && variant.stock > 0 && variant.price !== null && !isPending;
  return (
    <div className="space-y-4">
      {variant && (
        <p className="text-lg font-semibold text-gray-900">
          {variant.price === null ? "이 마켓에서 가격 미제공" : formatPrice(variant.price, currency)}
          {variant.stock === 0 && <span className="ml-2 text-sm font-normal text-red-500">품절</span>}
        </p>
      )}

      <QuantityStepper quantity={quantity} maxStock={variant?.stock ?? 99} onChange={onQuantityChange} />

      <button type="button" onClick={onAddToCart} disabled={!canAdd} aria-busy={isPending}
        className="w-full py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        {isPending ? "담는 중…" : "장바구니 담기"}
      </button>

      <FeedbackMessage feedback={feedback} />
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────

export function VariantSelector({
  variants,
  wigStyleId,
  marketCode,
}: {
  variants: WigVariantDetail[];
  wigStyleId: string;
  marketCode: MarketCode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sel, setSel] = useState<Selection>({ color: null, length: null, curl: null });
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isFittingOpen, setIsFittingOpen] = useState(false);

  const selected = findSelectedVariant(variants, sel);
  const t = getFittingLocale(MARKET_CONFIGS[marketCode].defaultLocale);

  function handleAddToCart() {
    if (!selected) return;
    startTransition(async () => {
      const result = await addToCart(selected.id, wigStyleId, quantity);
      if (result.success) {
        setFeedback({ ok: true, msg: "장바구니에 담았습니다." });
      } else if (result.error === "로그인이 필요합니다.") {
        router.push("/login");
      } else {
        setFeedback({ ok: false, msg: result.error });
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
        onQuantityChange={setQuantity}
        onAddToCart={() => { void handleAddToCart(); }}
      />

      {isFittingOpen && selected && (
        <FittingModal
          variantId={selected.id}
          wigStyleId={wigStyleId}
          t={t}
          onClose={() => setIsFittingOpen(false)}
        />
      )}
    </div>
  );
}
