import { CURRENCY_META, formatPrice, isCurrencyCode } from "./types";

export function formatPersistedMoney(
  amountMinor: number,
  persistedCurrencyCode: string,
): string {
  if (isCurrencyCode(persistedCurrencyCode)) {
    return formatPrice(amountMinor, CURRENCY_META[persistedCurrencyCode]);
  }

  const currencyLabel = persistedCurrencyCode.trim().length > 0
    ? persistedCurrencyCode
    : "통화 코드 없음";
  return `${currencyLabel} · 저장된 최소 단위 ${String(amountMinor)} · 소수 자릿수 확인 불가`;
}
