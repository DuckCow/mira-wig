import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getWigStyleById, CATEGORY_LABELS } from "@/lib/catalog";
import { getCurrentMarketCode } from "@/lib/market";
import { catalogStorage } from "@/lib/storage";
import type { WigStyleDetail } from "@/lib/catalog.types";
import type { MarketCode } from "@/lib/market/types";
import { VariantSelector } from "./VariantSelector";

// ── 내부 헬퍼 ────────────────────────────────────────────────

async function resolveCoverUrl(key: string | null): Promise<string | null> {
  if (!key) return null;
  return catalogStorage.getViewUrl(key).catch(() => null);
}

// ── 서브컴포넌트 ─────────────────────────────────────────────

function CoverImage({ url, name }: { url: string | null; name: string }) {
  if (!url) {
    return (
      <div className="w-full aspect-square bg-gray-100 flex items-center justify-center rounded-xl">
        <span className="text-gray-400 text-sm">이미지 없음</span>
      </div>
    );
  }
  return (
    <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-gray-100">
      <Image
        src={url}
        alt={`${name} 가발 대표 이미지`}
        fill
        className="object-cover"
        sizes="(max-width: 768px) 100vw, 50vw"
        priority
      />
    </div>
  );
}

function StyleInfo({
  style,
  coverUrl,
  marketCode,
}: {
  style: WigStyleDetail;
  coverUrl: string | null;
  marketCode: MarketCode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <span className="inline-block text-xs font-medium bg-gray-100 text-gray-600 rounded px-2 py-0.5 mb-2">
          {CATEGORY_LABELS[style.category]}
        </span>
        <h1 className="text-2xl font-bold text-gray-900">{style.name}</h1>
      </div>

      {style.description && (
        <p className="text-sm text-gray-600 leading-relaxed">{style.description}</p>
      )}

      {/* 이미지 (모바일에서만 표시 — 데스크탑은 왼쪽 열 이미지 사용) */}
      <div className="md:hidden">
        <CoverImage url={coverUrl} name={style.name} />
      </div>

      <VariantSelector
        variants={style.variants}
        wigStyleId={style.id}
        marketCode={marketCode}
      />
    </div>
  );
}

// ── 페이지 ────────────────────────────────────────────────────

type PageParams = Promise<{ id: string }>;

export default async function StyleDetailPage({
  params,
}: {
  params: PageParams;
}) {
  const [{ id }, marketCode] = await Promise.all([params, getCurrentMarketCode()]);
  const style = await getWigStyleById(id, marketCode);
  if (!style) notFound();

  const coverUrl = await resolveCoverUrl(style.coverImageKey);

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <nav aria-label="뒤로가기" className="mb-6">
        <Link
          href="/styles"
          className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1"
        >
          ← 스타일 목록
        </Link>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="hidden md:block">
          <CoverImage url={coverUrl} name={style.name} />
        </div>
        <StyleInfo style={style} coverUrl={coverUrl} marketCode={marketCode} />
      </div>
    </main>
  );
}
