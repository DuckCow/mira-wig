"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createCheckoutSessionAction, type CheckoutActionResult } from "@/app/actions/checkout";
import { type CurrencyMeta, type MarketCode } from "@/lib/market/types";
import { COUNTRY_FORM_CONFIGS, type CountryFormConfig } from "@/lib/order/address-config";
import {
  REQUIRED_FIELDS,
  collectFromFormData,
  getFieldError,
  hasSubmitError,
} from "@/lib/order/validation";
import { AddressFields } from "./AddressFields";
import { CartSnapshot, SessionSnapshot, type CheckoutCartItem } from "./checkout-summary";
import type { CheckoutShippingInput, CreateCheckoutSessionResult } from "@/lib/payment/session/types";
import type { AddressKey } from "./types";

interface CheckoutFormProps {
  marketCode: MarketCode;
  marketLabel: string;
  currency: CurrencyMeta;
  shippingCountry: CheckoutShippingInput["country"];
  cartItems: CheckoutCartItem[];
  productSubtotal: number;
}

type FieldErrors = Partial<Record<AddressKey, string>>;
type TouchedFields = Partial<Record<AddressKey, true>>;
type FailedCheckout = Extract<CheckoutActionResult, { success: false }>;

interface CheckoutSessionFormState {
  values: CheckoutShippingInput;
  errors: FieldErrors;
  formError: string | null;
  created: CreateCheckoutSessionResult | null;
  isPending: boolean;
  handleChange: (field: AddressKey, value: string) => void;
  handleBlur: (field: AddressKey, domValue: string) => void;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

interface ShippingFormProps {
  marketCode: MarketCode;
  marketLabel: string;
  countryLabel: string;
  config: CountryFormConfig;
  form: CheckoutSessionFormState;
}

const COUNTRY_LABELS: Record<CheckoutShippingInput["country"], string> = {
  KR: "대한민국",
  US: "United States",
  JP: "日本",
};

export function CheckoutForm({
  marketCode,
  marketLabel,
  currency,
  shippingCountry,
  cartItems,
  productSubtotal,
}: CheckoutFormProps) {
  const config = COUNTRY_FORM_CONFIGS[shippingCountry];
  const form = useCheckoutSessionForm(shippingCountry, config);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <ShippingForm
        marketCode={marketCode}
        marketLabel={marketLabel}
        countryLabel={COUNTRY_LABELS[shippingCountry]}
        config={config}
        form={form}
      />

      <aside className="space-y-4">
        <CartSnapshot cartItems={cartItems} subtotal={productSubtotal} currency={currency} />
        {form.created && <SessionSnapshot session={form.created} fallbackCurrency={currency} />}
      </aside>
    </div>
  );
}

function ShippingForm({ marketCode, marketLabel, countryLabel, config, form }: ShippingFormProps) {
  const submitLabel = form.isPending
    ? "주문서 생성 중..."
    : form.created
      ? "주문서 다시 생성"
      : "주문서 생성";

  return (
    <form onSubmit={form.handleSubmit} className="space-y-6 rounded-lg border border-gray-200 bg-white p-5">
      <CheckoutMarketPanel marketLabel={marketLabel} marketCode={marketCode} countryLabel={countryLabel} />
      <AddressFields
        values={form.values}
        onChange={form.handleChange}
        onBlur={form.handleBlur}
        errors={form.errors}
        config={config}
      />
      {form.formError && <p role="alert" className="text-sm text-red-600">{form.formError}</p>}
      <button
        type="submit"
        disabled={form.isPending}
        aria-busy={form.isPending}
        className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {submitLabel}
      </button>
    </form>
  );
}

function CheckoutMarketPanel({
  marketLabel,
  marketCode,
  countryLabel,
}: {
  marketLabel: string;
  marketCode: MarketCode;
  countryLabel: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-900">배송지</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <ReadOnlyInfo label="선택 마켓" value={`${marketLabel} / ${marketCode}`} />
        <ReadOnlyInfo label="배송 국가" value={countryLabel} />
      </div>
      <p className="text-xs text-gray-500">
        주문서는 선택한 마켓의 배송 국가로 생성됩니다.
      </p>
    </section>
  );
}

function ReadOnlyInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}

function emptyShipping(country: CheckoutShippingInput["country"]): CheckoutShippingInput {
  return {
    recipientName: "",
    phone: "",
    country,
    postalCode: "",
    administrativeArea: "",
    city: "",
    addressLine1: "",
    addressLine2: "",
    memo: "",
  };
}

function useCheckoutSessionForm(
  shippingCountry: CheckoutShippingInput["country"],
  config: CountryFormConfig,
): CheckoutSessionFormState {
  const [values, setValues] = useState(() => emptyShipping(shippingCountry));
  const [touched, setTouched] = useState<TouchedFields>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateCheckoutSessionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(field: AddressKey, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setCreated(null);
    if (!touched[field]) return;
    setErrors((current) => withFieldError(current, field, getFieldError(field, value, config)));
  }

  function handleBlur(field: AddressKey, domValue: string) {
    setValues((current) => ({ ...current, [field]: domValue }));
    setTouched((current) => ({ ...current, [field]: true }));
    setErrors((current) => withFieldError(current, field, getFieldError(field, domValue, config)));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextValues = collectFromFormData(new FormData(event.currentTarget), shippingCountry);
    setValues(nextValues);
    setTouched(touchRequiredFields());
    setErrors(collectErrors(nextValues, config));
    setFormError(null);
    setCreated(null);
    if (hasSubmitError(nextValues, config)) return;
    startTransition(async () => createSession(nextValues, setCreated, setFormError));
  }

  return { values, errors, formError, created, isPending, handleChange, handleBlur, handleSubmit };
}

function collectErrors(address: CheckoutShippingInput, config: CountryFormConfig): FieldErrors {
  return REQUIRED_FIELDS.reduce<FieldErrors>((nextErrors, field) => {
    return withFieldError(nextErrors, field, getFieldError(field, address[field] ?? "", config));
  }, {});
}

function withFieldError(errors: FieldErrors, field: AddressKey, error: string | null): FieldErrors {
  const nextErrors = { ...errors };
  if (error) {
    nextErrors[field] = error;
  } else {
    delete nextErrors[field];
  }
  return nextErrors;
}

function touchRequiredFields(): TouchedFields {
  return REQUIRED_FIELDS.reduce<TouchedFields>((nextTouched, field) => {
    nextTouched[field] = true;
    return nextTouched;
  }, {});
}

function actionErrorMessage(result: FailedCheckout): string {
  if (result.errorCode === "UNAUTHORIZED") return "로그인이 필요합니다. 다시 로그인해 주세요.";
  if (result.errorCode === "CART_EMPTY") return "장바구니가 비어 있습니다.";
  if (result.errorCode === "VARIANT_PRICE_UNAVAILABLE") return "현재 마켓 가격이 없는 상품이 있어 주문서를 만들 수 없습니다.";
  if (result.errorCode === "SHIPPING_COUNTRY_INVALID") return "선택한 마켓으로 배송할 수 없는 국가입니다.";
  if (result.errorCode === "SHIPPING_ADDRESS_INVALID") return "배송지 필수 항목을 확인해 주세요.";
  if (result.errorCode === "TOTAL_AMOUNT_TOO_LOW") return "결제 가능한 최소 금액에 미달합니다.";
  return result.error;
}

async function createSession(
  address: CheckoutShippingInput,
  setCreated: (session: CreateCheckoutSessionResult | null) => void,
  setFormError: (error: string | null) => void,
) {
  const result = await createCheckoutSessionAction(address);
  if (result.success) {
    setCreated(result.session);
    return;
  }
  setFormError(actionErrorMessage(result));
}
