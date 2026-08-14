import type { WigCategory } from "@/lib/catalog.types";
import type { Locale } from "./locale";

const CATEGORY_LABELS: Record<Locale, Record<WigCategory, string>> = {
  ko: { HAIR_LOSS: "탈모", FASHION: "패션", COSPLAY: "코스플레이", TOPPER: "토퍼", MEDICAL: "의료용" },
  en: { HAIR_LOSS: "Hair loss", FASHION: "Fashion", COSPLAY: "Cosplay", TOPPER: "Topper", MEDICAL: "Medical" },
  ja: { HAIR_LOSS: "薄毛ケア", FASHION: "ファッション", COSPLAY: "コスプレ", TOPPER: "トップピース", MEDICAL: "医療用" },
};

const LENGTH_LABELS: Record<Locale, Record<string, string>> = {
  ko: { short: "숏", medium: "미디", long: "롱" },
  en: { short: "Short", medium: "Medium", long: "Long" },
  ja: { short: "ショート", medium: "ミディアム", long: "ロング" },
};

const CURL_LABELS: Record<Locale, Record<string, string>> = {
  ko: { straight: "직모", wavy: "웨이브", curly: "컬리" },
  en: { straight: "Straight", wavy: "Wavy", curly: "Curly" },
  ja: { straight: "ストレート", wavy: "ウェーブ", curly: "カール" },
};

export function localizedCategoryLabel(category: WigCategory, locale: Locale): string {
  return CATEGORY_LABELS[locale][category];
}

export function localizedLengthLabel(length: string, locale: Locale): string {
  return LENGTH_LABELS[locale][length] ?? length;
}

export function localizedCurlLabel(curl: string, locale: Locale): string {
  return CURL_LABELS[locale][curl] ?? curl;
}

export function localizedVariantOptionLabel(
  color: string,
  length: string,
  curl: string,
  locale: Locale,
): string {
  return [
    color,
    localizedLengthLabel(length, locale),
    localizedCurlLabel(curl, locale),
  ].join(" / ");
}
