"use client";

export default function StylesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="max-w-5xl mx-auto px-4 py-20 flex flex-col items-center text-center">
      <p className="text-red-500 font-medium mb-2">
        스타일 목록을 불러오는 중 오류가 발생했습니다.
      </p>
      <p className="text-gray-400 text-sm mb-6">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="px-6 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700"
      >
        다시 시도
      </button>
    </main>
  );
}
