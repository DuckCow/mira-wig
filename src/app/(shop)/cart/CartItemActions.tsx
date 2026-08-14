"use client";

import { useTransition } from "react";
import { removeFromCart, updateCartQuantity } from "@/app/actions/cart";
import { messagesFor } from "@/lib/market/messages";
import type { Locale } from "@/lib/market/locale";

export function RemoveButton({ cartItemId, locale }: { cartItemId: string; locale: Locale }) {
  const [isPending, startTransition] = useTransition();
  const messages = messagesFor(locale).cart;
  return (
    <button
      type="button"
      disabled={isPending}
      aria-busy={isPending}
      onClick={() => {
        startTransition(async () => {
          await removeFromCart(cartItemId);
        });
      }}
      className="text-sm text-red-500 hover:text-red-700 disabled:opacity-40"
    >
      {isPending ? messages.removing : messages.remove}
    </button>
  );
}

export function QuantityControl({
  cartItemId,
  current,
  max,
  marketCode,
  locale,
  disabled = false,
}: {
  cartItemId: string;
  current: number;
  max: number;
  marketCode: string;
  locale: Locale;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const messages = messagesFor(locale).cart;

  function update(next: number) {
    if (next < 1 || next > max) return;
    startTransition(async () => {
      await updateCartQuantity(cartItemId, next, marketCode);
    });
  }

  return (
    <div
      className="flex items-center border border-gray-300 rounded-lg overflow-hidden"
      aria-label={messages.quantityControl}
    >
      <button
        type="button"
        onClick={() => { update(current - 1); }}
        disabled={disabled || current <= 1 || isPending}
        aria-label={messages.decreaseQuantity}
        className="px-2.5 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-40 text-sm"
      >
        −
      </button>
      <span className="w-8 text-center text-sm py-1" aria-live="polite">
        {isPending ? "…" : current}
      </span>
      <button
        type="button"
        onClick={() => { update(current + 1); }}
        disabled={disabled || current >= max || isPending}
        aria-label={messages.increaseQuantity}
        className="px-2.5 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-40 text-sm"
      >
        +
      </button>
    </div>
  );
}
