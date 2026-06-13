"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { COUNTRY_FORM_CONFIGS } from "@/lib/order/address-config";
import { MARKET_CONFIGS, formatPrice, type MarketCode } from "@/lib/market/types";
import { getLengthLabel, getCurlLabel } from "@/lib/wig-option-labels";
import { createOrderAction } from "@/app/actions/order";
import { AddressFields } from "./AddressFields";
import type { CheckoutItem, CheckoutAddressInput } from "@/lib/order/types";
import type { AddressKey } from "./types";

// ── 주문 요약 ─────────────────────────────────────────────────

function SummaryRow({ item, marketCode }: { item: CheckoutItem; marketCode: MarketCode }) {
  const { currency } = MARKET_CONFIGS[marketCode];
  const label = `${item.color} / ${getLengthLabel(item.length)} / ${getCurlLabel(item.curl)}`;
  return (
    <li className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="w-14 h-14 bg-gray-100 rounded-lg shrink-0 flex items-center justify-center">
        <span className="text-xs text-gray-400">이미지</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{item.styleName}</p>
        <p className="text-xs text-gray-500">{label} · 수량 {item.quantity}</p>
      </div>
      <p className="text-sm font-semibold text-gray-900 shrink-0">
        {formatPrice(item.unitPrice * item.quantity, currency)}
      </p>
    </li>
  );
}

function OrderSummary({ items, marketCode }: { items: CheckoutItem[]; marketCode: MarketCode }) {
  const { currency } = MARKET_CONFIGS[marketCode];
  const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  return (
    <section className="border border-gray-200 rounded-xl p-5 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">주문 상품</h2>
      <ul>{items.map((item) => <SummaryRow key={item.cartItemId} item={item} marketCode={marketCode} />)}</ul>
      <div className="flex justify-between text-sm pt-3 border-t border-gray-200 mt-1">
        <span className="text-gray-500">배송비</span>
        <span className="text-gray-900">무료</span>
      </div>
      <div className="flex justify-between text-base font-semibold text-gray-900 pt-2">
        <span>합계</span>
        <span>{formatPrice(total, currency)}</span>
      </div>
    </section>
  );
}

// ── 초기 주소값 ───────────────────────────────────────────────

function buildInitialAddress(shippingCountry: string): CheckoutAddressInput {
  return {
    recipientName: "", phone: "", country: shippingCountry,
    postalCode: "", administrativeArea: "", city: "",
    addressLine1: "", addressLine2: "", memo: "",
  };
}

// ── 메인 폼 ───────────────────────────────────────────────────

export function CheckoutForm({
  items,
  marketCode,
}: {
  items: CheckoutItem[];
  marketCode: MarketCode;
}) {
  const market = MARKET_CONFIGS[marketCode];
  const defaultCountry = market.shippableCountries[0] ?? "KR";
  const [address, setAddress] = useState<CheckoutAddressInput>(
    () => buildInitialAddress(defaultCountry),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleChange(field: AddressKey, value: string) {
    setAddress((prev) => ({ ...prev, [field]: value }));
    setFormError(null);
  }

  const config = COUNTRY_FORM_CONFIGS[address.country] ?? COUNTRY_FORM_CONFIGS.KR;

  function validateClient(): string | null {
    if (!address.recipientName.trim()) return "받는 분 이름을 입력해주세요.";
    if (!config.phonePattern.test(address.phone)) return `전화번호 형식이 올바르지 않습니다. 예: ${config.phonePlaceholder}`;
    if (!config.postalCodePattern.test(address.postalCode)) return `우편번호 형식이 올바르지 않습니다. 예: ${config.postalCodePlaceholder}`;
    if (config.administrativeAreaRequired && !address.administrativeArea.trim()) {
      return `${config.administrativeAreaLabel}을(를) 선택해주세요.`;
    }
    if (!address.city.trim()) return `${config.cityLabel}을(를) 입력해주세요.`;
    if (!address.addressLine1.trim()) return "주소를 입력해주세요.";
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clientError = validateClient();
    if (clientError) { setFormError(clientError); return; }
    startTransition(async () => {
      const result = await createOrderAction(address);
      if (result.success) {
        router.push(`/orders/${result.orderId}`);
      } else {
        setFormError(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <OrderSummary items={items} marketCode={marketCode} />

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <section className="border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">배송지 정보</h2>
          <AddressFields values={address} onChange={handleChange} config={config} />
        </section>

        {formError && (
          <p role="alert" className="text-sm text-red-500 text-center">{formError}</p>
        )}

        <button
          type="submit"
          disabled={isPending || items.length === 0}
          aria-busy={isPending}
          className="w-full py-3.5 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "주문 처리 중…" : "주문하기"}
        </button>
      </form>
    </div>
  );
}
