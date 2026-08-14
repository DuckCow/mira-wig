"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { MarketCode } from "@/lib/market/types";
import type { SiteVariant } from "@/lib/market/site-variant";
import type { Locale } from "@/lib/market/locale";
import { Header, type HeaderUser } from "./Header";
import { StorefrontLocaleProvider } from "./StorefrontLocaleProvider";
import { storefrontShellPresentation, syncDocumentLocale } from "./storefront-shell-state";

interface StorefrontShellProps {
  children: ReactNode;
  initialVariant: SiteVariant | null;
  initialLocale: Locale;
  user: HeaderUser | null;
  cartItemCount: number;
  activeMarketCodes: readonly MarketCode[];
}

export function StorefrontShell({
  children,
  initialVariant,
  initialLocale,
  user,
  cartItemCount,
  activeMarketCodes,
}: StorefrontShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const presentation = storefrontShellPresentation(pathname, search, initialVariant, initialLocale);
  const requestTarget = search.length === 0 ? pathname : `${pathname}?${search}`;

  useEffect(() => {
    syncDocumentLocale(document.documentElement, presentation.locale);
  }, [presentation.locale]);

  return (
    <StorefrontLocaleProvider locale={presentation.locale}>
      {presentation.headerVisible && presentation.variant ? (
        <Header
          user={user}
          cartItemCount={cartItemCount}
          variant={presentation.variant}
          requestTarget={requestTarget}
          activeMarketCodes={activeMarketCodes}
        />
      ) : null}
      <div className="flex-1">{children}</div>
    </StorefrontLocaleProvider>
  );
}
