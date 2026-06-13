import Link from "next/link";

export default function StyleNotFound() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-20 flex flex-col items-center text-center">
      <p className="text-gray-900 font-semibold text-lg mb-2">
        스타일을 찾을 수 없습니다
      </p>
      <p className="text-gray-400 text-sm mb-6">
        삭제되었거나 존재하지 않는 스타일입니다.
      </p>
      <Link
        href="/styles"
        className="px-6 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700"
      >
        스타일 목록으로
      </Link>
    </main>
  );
}
