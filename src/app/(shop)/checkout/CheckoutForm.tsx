"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { COUNTRY_FORM_CONFIGS, type CountryFormConfig } from "@/lib/order/address-config";
import { MARKET_CONFIGS, formatPrice, type MarketCode } from "@/lib/market/types";
import { getLengthLabel, getCurlLabel } from "@/lib/wig-option-labels";
import { createOrderAction } from "@/app/actions/order";
import {
  REQUIRED_FIELDS as VALIDATION_REQUIRED_FIELDS,
  collectFromFormData,
  hasSubmitError,
  getFieldError,
  type AddressFieldKey,
} from "@/lib/order/validation";
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

// ── 필드별 에러 계산 ──────────────────────────────────────────
// touched 외부에서 걸러 주므로 여기서는 값 자체만 판단.

function computeErrors(
  address: CheckoutAddressInput,
  touched: ReadonlySet<AddressKey>,
  config: CountryFormConfig,
): Partial<Record<AddressFieldKey, string>> {
  const result: Partial<Record<AddressFieldKey, string>> = {};
  for (const field of VALIDATION_REQUIRED_FIELDS) {
    if (!touched.has(field)) continue;
    const err = getFieldError(field, address[field], config);
    if (err) result[field] = err;
  }
  return result;
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
  const [touched, setTouched] = useState<ReadonlySet<AddressKey>>(new Set());
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const config = COUNTRY_FORM_CONFIGS[address.country] ?? COUNTRY_FORM_CONFIGS.KR;
  const fieldErrors = computeErrors(address, touched, config);

  function handleChange(field: AddressKey, value: string) {
    setAddress((prev) => ({ ...prev, [field]: value }));
    setServerError(null);
  }

  // onBlur: touched 표시 + 브라우저 자동완성 sync
  // 자동완성은 React onChange를 트리거하지 않을 수 있으므로
  // blur 시 DOM 값을 읽어 상태와 동기화한다.
  function handleBlur(field: AddressKey, domValue: string) {
    setTouched((prev) => new Set([...prev, field]));
    if (address[field] !== domValue) {
      setAddress((prev) => ({ ...prev, [field]: domValue }));
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // 제출 시 DOM 실제 값을 기준으로 수집 — 브라우저 자동완성이 onChange를
    // 건너뛰어 React state가 비어 있어도 정확한 값을 얻는다.
    const formData = new FormData(e.currentTarget);
    const submitted = collectFromFormData(formData, address.country);

    // 수집한 값으로 화면 state를 동기화
    setAddress(submitted);
    // 제출 시 필수 필드 전체를 touched로 표시 → 모든 에러 노출
    setTouched(new Set(VALIDATION_REQUIRED_FIELDS));

    if (hasSubmitError(submitted, config)) return;

    startTransition(async () => {
      const result = await createOrderAction(submitted);
      if (result.success) {
        router.push(`/orders/${result.orderId}/payment`);
      } else {
        setServerError(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <OrderSummary items={items} marketCode={marketCode} />

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <section className="border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">배송지 정보</h2>
          <AddressFields
            values={address}
            onChange={handleChange}
            onBlur={handleBlur}
            errors={fieldErrors}
            config={config}
          />
        </section>

        {serverError && (
          <p role="alert" className="text-sm text-red-500 text-center">{serverError}</p>
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
