"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "@/lib/market/locale";

const StorefrontLocaleContext = createContext<Locale>("en");

export function StorefrontLocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <StorefrontLocaleContext.Provider value={locale}>{children}</StorefrontLocaleContext.Provider>;
}

export function useStorefrontLocale(): Locale {
  return useContext(StorefrontLocaleContext);
}
