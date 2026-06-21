import {
  getWigStyles,
  isWigCategory,
  WIG_CATEGORIES,
  CATEGORY_LABELS,
  type WigStyleSummary,
} from "@/lib/catalog";
import { getCurrentMarketCode } from "@/lib/market";
import { catalogStorage } from "@/lib/storage";
import { StyleCard } from "@/components/features/StyleCard";
import type { MarketCode } from "@/lib/market/types";

// ── URL 파라미터 파싱 ─────────────────────────────────────────

type PageSearchParams = Promise<{ category?: string; q?: string }>;

function parseParams(raw: { category?: string; q?: string }) {
  const category =
    typeof raw.category === "string" && isWigCategory(raw.category)
      ? raw.category
      : undefined;
  const query =
    typeof raw.q === "string" && raw.q.trim() ? raw.q.trim() : undefined;
  return { category, query };
}

// ── 이미지 URL 생성 ───────────────────────────────────────────

async function resolveImageUrl(key: string | null): Promise<string | null> {
  if (!key) return null;
  return catalogStorage.getViewUrl(key).catch(() => null);
}

// ── 필터 UI 헬퍼 ─────────────────────────────────────────────

function buildCategoryHref(cat: string, currentQuery?: string) {
  const params = new URLSearchParams();
  params.set("category", cat);
  if (currentQuery) params.set("q", currentQuery);
  return `?${params.toString()}`;
}

function buildAllHref(currentQuery?: string) {
  return currentQuery ? `?q=${currentQuery}` : "/styles";
}

// ── 서브컴포넌트 ─────────────────────────────────────────────

interface StyleGridProps {
  styles: (WigStyleSummary & { imageUrl: string | null })[];
  marketCode: MarketCode;
}

function StyleGrid({ styles, marketCode }: StyleGridProps) {
  if (styles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <p className="text-lg font-medium">검색 결과가 없습니다</p>
        <p className="text-sm mt-1">다른 키워드나 카테고리를 시도해 보세요.</p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {styles.map((style) => (
        <li key={style.id}>
          <StyleCard
            id={style.id}
            name={style.name}
            category={style.category}
            tags={style.tags}
            imageUrl={style.imageUrl}
            basePrice={style.basePrice}
            marketCode={marketCode}
          />
        </li>
      ))}
    </ul>
  );
}

// ── 페이지 ────────────────────────────────────────────────────

export default async function StylesPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const [raw, marketCode] = await Promise.all([
    searchParams,
    getCurrentMarketCode(),
  ]);
  const { category, query } = parseParams(raw);

  const styles = await getWigStyles({ category, query }, marketCode);

  const stylesWithUrls = await Promise.all(
    styles.map(async (s) => ({
      ...s,
      imageUrl: await resolveImageUrl(s.coverImageKey),
    })),
  );

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">가발 스타일</h1>

      {/* 검색 */}
      <form method="GET" action="/styles" className="mb-6" role="search">
        {category && <input type="hidden" name="category" value={category} />}
        <label htmlFor="search-input" className="sr-only">
          스타일 검색
        </label>
        <div className="flex gap-2">
          <input
            id="search-input"
            name="q"
            type="search"
            defaultValue={query ?? ""}
            placeholder="이름 또는 태그 검색"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700"
          >
            검색
          </button>
        </div>
      </form>

      {/* 카테고리 필터 */}
      <nav aria-label="카테고리 필터" className="flex flex-wrap gap-2 mb-8">
        <a
          href={buildAllHref(query)}
          className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${
            !category
              ? "bg-gray-900 text-white border-gray-900"
              : "border-gray-300 text-gray-600 hover:border-gray-500"
          }`}
        >
          전체
        </a>
        {WIG_CATEGORIES.map((cat) => (
          <a
            key={cat}
            href={buildCategoryHref(cat, query)}
            className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${
              category === cat
                ? "bg-gray-900 text-white border-gray-900"
                : "border-gray-300 text-gray-600 hover:border-gray-500"
            }`}
          >
            {CATEGORY_LABELS[cat]}
          </a>
        ))}
      </nav>

      <StyleGrid styles={stylesWithUrls} marketCode={marketCode} />
    </main>
  );
}
