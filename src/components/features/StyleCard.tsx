"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CATEGORY_LABELS, type WigCategory } from "@/lib/catalog.types";
import { MARKET_CONFIGS, formatPrice, type MarketCode } from "@/lib/market/types";

export interface StyleCardProps {
  id: string;
  name: string;
  category: WigCategory;
  tags: string[];
  imageUrl: string | null;
  /** 현재 마켓 최소단위 정수 금액 */
  basePrice: number;
  marketCode: MarketCode;
}

function ImageArea({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  const [broken, setBroken] = useState(false);

  if (!imageUrl || broken) {
    return (
      <div
        className="w-full aspect-square bg-gray-100 flex items-center justify-center"
        aria-hidden="true"
      >
        <span className="text-gray-400 text-sm">이미지 없음</span>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-square overflow-hidden bg-gray-100">
      <Image
        src={imageUrl}
        alt={`${name} 가발 썸네일`}
        fill
        className="object-cover"
        onError={() => setBroken(true)}
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
      />
    </div>
  );
}

export function StyleCard({
  id,
  name,
  category,
  imageUrl,
  basePrice,
  marketCode,
}: StyleCardProps) {
  const { currency } = MARKET_CONFIGS[marketCode];

  return (
    <article className="rounded-lg overflow-hidden border border-gray-200 bg-white hover:shadow-md transition-shadow">
      <Link href={`/styles/${id}`} aria-label={`${name} 상세 보기`}>
        <ImageArea imageUrl={imageUrl} name={name} />
        <div className="p-3">
          <span className="inline-block text-xs font-medium bg-gray-100 text-gray-600 rounded px-2 py-0.5 mb-1">
            {CATEGORY_LABELS[category]}
          </span>
          <h2 className="text-sm font-semibold text-gray-900 truncate">{name}</h2>
          <p className="text-sm text-gray-700 mt-1">
            {formatPrice(basePrice, currency)}~
          </p>
        </div>
      </Link>
    </article>
  );
}
