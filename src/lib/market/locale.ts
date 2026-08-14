export const Locale = {
  KO: "ko",
  EN: "en",
  JA: "ja",
} as const;

export type Locale = (typeof Locale)[keyof typeof Locale];

export const LOCALES: readonly Locale[] = [Locale.KO, Locale.EN, Locale.JA];
export const LOCALE_COOKIE = "mira-locale";

export const LOCALE_INTL: Record<Locale, string> = {
  ko: "ko-KR",
  en: "en-US",
  ja: "ja-JP",
};

export function isLocale(value: string): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

export function preferredEnabledLocale(
  acceptLanguage: string | undefined,
  enabled: readonly Locale[],
): Locale | undefined {
  if (!acceptLanguage) return undefined;
  const ranked = acceptLanguage
    .split(",")
    .map(parseLanguageRange)
    .filter((entry): entry is LanguageRange => entry !== null)
    .sort((left, right) => right.quality - left.quality || left.position - right.position);

  for (const entry of ranked) {
    const base = entry.language.split("-")[0]?.toLowerCase();
    if (base && isLocale(base) && enabled.includes(base)) return base;
  }
  return undefined;
}

interface LanguageRange {
  language: string;
  quality: number;
  position: number;
}

function parseLanguageRange(value: string, position: number): LanguageRange | null {
  const [rawLanguage, ...parameters] = value.trim().split(";");
  const language = rawLanguage?.trim();
  if (!language || language === "*") return null;
  let quality = 1;
  for (const parameter of parameters) {
    const match = /^q=(0(?:\.\d{1,3})?|1(?:\.0{1,3})?)$/iu.exec(parameter.trim());
    if (match) quality = Number(match[1]);
  }
  if (quality === 0) return null;
  return { language, quality, position };
}
