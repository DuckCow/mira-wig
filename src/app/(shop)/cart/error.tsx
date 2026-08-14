"use client";

import { useStorefrontLocale } from "@/components/features/StorefrontLocaleProvider";
import { messagesFor } from "@/lib/market/messages";

export default function CartError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const messages = messagesFor(useStorefrontLocale()).common;
  return (
    <main className="max-w-2xl mx-auto px-4 py-8 flex flex-col items-center gap-4">
      <p className="text-red-500 text-sm">{messages.cartLoadError}</p>
      <button
        type="button"
        onClick={reset}
        className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700"
      >
        {messages.retry}
      </button>
    </main>
  );
}
