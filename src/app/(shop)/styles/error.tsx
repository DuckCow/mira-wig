"use client";

import { useStorefrontLocale } from "@/components/features/StorefrontLocaleProvider";
import { messagesFor } from "@/lib/market/messages";

export default function StylesError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const messages = messagesFor(useStorefrontLocale());
  return (
    <main className="max-w-5xl mx-auto px-4 py-20 flex flex-col items-center text-center">
      <p className="text-red-500 font-medium mb-2">
        {messages.styles.loadError}
      </p>
      <button
        type="button"
        onClick={reset}
        className="px-6 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700"
      >
        {messages.common.retry}
      </button>
    </main>
  );
}
