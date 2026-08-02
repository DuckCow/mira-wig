"use client";

import { useTransition } from "react";
import { removeFromCart, updateCartQuantity } from "@/app/actions/cart";

export function RemoveButton({ cartItemId }: { cartItemId: string }) {
  const [isPending, startTransition] = useTransition();
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
      {isPending ? "삭제 중…" : "삭제"}
    </button>
  );
}

export function QuantityControl({
  cartItemId,
  current,
  max,
  disabled = false,
}: {
  cartItemId: string;
  current: number;
  max: number;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function update(next: number) {
    if (next < 1 || next > max) return;
    startTransition(async () => {
      await updateCartQuantity(cartItemId, next);
    });
  }

  return (
    <div
      className="flex items-center border border-gray-300 rounded-lg overflow-hidden"
      aria-label="수량 조절"
    >
      <button
        type="button"
        onClick={() => { update(current - 1); }}
        disabled={disabled || current <= 1 || isPending}
        aria-label="수량 줄이기"
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
        aria-label="수량 늘리기"
        className="px-2.5 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-40 text-sm"
      >
        +
      </button>
    </div>
  );
}
