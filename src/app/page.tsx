import Link from "next/link";

const FEATURES = [
  {
    title: "스타일 탐색",
    body: "프리미엄 맞춤 가발과 헤어시스템 스타일을 한곳에서 살펴봅니다.",
  },
  {
    title: "가상 피팅 흐름",
    body: "관심 있는 디자인을 비교한 뒤 피팅 단계로 자연스럽게 이어갈 수 있습니다.",
  },
  {
    title: "맞춤 제작 준비",
    body: "색상, 길이, 컬 옵션을 확인하며 나에게 맞는 선택을 준비합니다.",
  },
];

export default function Home() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-14 sm:py-20">
      <section className="max-w-2xl space-y-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Premium custom wig platform
        </p>
        <div className="space-y-4">
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight text-gray-900">
            맞춤 가발을 더 쉽게 비교하고 선택하세요
          </h1>
          <p className="text-base leading-7 text-gray-600">
            Mira는 맞춤 가발과 헤어시스템 스타일을 둘러보고, 어울리는 디자인을 비교한 뒤 가상 피팅 흐름으로 이어갈 수 있도록 돕습니다.
          </p>
        </div>
        <Link
          href="/styles"
          className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-700"
        >
          스타일 둘러보기
        </Link>
      </section>

      <section aria-labelledby="home-features" className="mt-14">
        <h2 id="home-features" className="sr-only">
          Mira 이용 흐름
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="rounded-lg border border-gray-200 bg-white p-5"
            >
              <h3 className="text-sm font-semibold text-gray-900">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-gray-200 pt-8">
        <p className="max-w-2xl text-sm leading-6 text-gray-600">
          먼저 제공 중인 스타일을 살펴보세요. 원하는 분위기와 옵션을 확인한 뒤 상세 페이지에서 다음 단계를 이어갈 수 있습니다.
        </p>
        <Link
          href="/styles"
          className="mt-4 inline-flex text-sm font-medium text-gray-900 underline hover:text-gray-600"
        >
          가발 스타일 보러가기
        </Link>
      </section>
    </main>
  );
}
