"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { type WigCategory } from "@/lib/catalog.types";
import { formatPrice, type CurrencyMeta, type MarketCode } from "@/lib/market/types";
import type { Locale } from "@/lib/market/locale";
import { localizedCategoryLabel } from "@/lib/market/catalog-presentation";
import { messagesFor } from "@/lib/market/messages";
import { siteVariantPath } from "@/lib/market/site-variant";

export interface StyleCardProps {
  id: string;
  name: string;
  category: WigCategory;
  tags: string[];
  imageUrl: string | null;
  /** 현재 마켓 최소단위 정수 금액. null이면 해당 마켓 가격 미제공. */
  basePrice: number | null;
  marketCode: MarketCode;
  currency: CurrencyMeta;
  locale: Locale;
}

function ImageArea({ imageUrl, name, locale }: { imageUrl: string | null; name: string; locale: Locale }) {
  const [broken, setBroken] = useState(false);
  const messages = messagesFor(locale).styles;

  if (!imageUrl || broken) {
    return (
      <div
        className="w-full aspect-square bg-gray-100 flex items-center justify-center"
        aria-hidden="true"
      >
        <span className="text-gray-400 text-sm">{messages.imageUnavailable}</span>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-square overflow-hidden bg-gray-100">
      <Image
        src={imageUrl}
        alt={`${name} ${messages.thumbnail}`}
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
  currency,
  locale,
}: StyleCardProps) {
  const messages = messagesFor(locale);

  return (
    <article className="rounded-lg overflow-hidden border border-gray-200 bg-white hover:shadow-md transition-shadow">
      <Link href={siteVariantPath({ marketCode, locale }, `/styles/${id}`)} aria-label={name}>
        <ImageArea imageUrl={imageUrl} name={name} locale={locale} />
        <div className="p-3">
          <span className="inline-block text-xs font-medium bg-gray-100 text-gray-600 rounded px-2 py-0.5 mb-1">
            {localizedCategoryLabel(category, locale)}
          </span>
          <h2 className="text-sm font-semibold text-gray-900 truncate">{name}</h2>
          {basePrice === null ? (
            <p className="text-sm text-gray-400 mt-1">{messages.styles.priceUnavailable}</p>
          ) : (
            <p className="text-sm text-gray-700 mt-1">{formatPrice(basePrice, currency, locale)}~</p>
          )}
        </div>
      </Link>
    </article>
  );
}
