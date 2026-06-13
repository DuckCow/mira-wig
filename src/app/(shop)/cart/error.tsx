"use client";

export default function CartError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="max-w-2xl mx-auto px-4 py-8 flex flex-col items-center gap-4">
      <p className="text-red-500 text-sm">장바구니를 불러오지 못했습니다.</p>
      <p className="text-xs text-gray-400">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700"
      >
        다시 시도
      </button>
    </main>
  );
}
