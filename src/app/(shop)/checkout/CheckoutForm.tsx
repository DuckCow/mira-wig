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
import { PaymentMethodSection } from "./PaymentMethodSection";
import type { CheckoutShippingInput, CreateCheckoutSessionResult } from "@/lib/payment/session/types";
import type { AddressKey } from "./types";
import type { Locale } from "@/lib/market/locale";
import { messagesFor } from "@/lib/market/messages";

interface CheckoutFormProps {
  marketCode: MarketCode;
  marketLabel: string;
  currency: CurrencyMeta;
  shippingCountry: CheckoutShippingInput["country"];
  cartItems: CheckoutCartItem[];
  productSubtotal: number;
  mockPaymentEnabled: boolean;
  locale: Locale;
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
  locale: Locale;
}

const COUNTRY_LABELS: Record<Locale, Record<CheckoutShippingInput["country"], string>> = {
  ko: { KR: "대한민국", US: "미국", JP: "일본" },
  en: { KR: "South Korea", US: "United States", JP: "Japan" },
  ja: { KR: "韓国", US: "アメリカ合衆国", JP: "日本" },
};

export function CheckoutForm({
  marketCode,
  marketLabel,
  currency,
  shippingCountry,
  cartItems,
  productSubtotal,
  mockPaymentEnabled,
  locale,
}: CheckoutFormProps) {
  const config = COUNTRY_FORM_CONFIGS[shippingCountry];
  const form = useCheckoutSessionForm(shippingCountry, config, marketCode, locale);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <ShippingForm
        marketCode={marketCode}
        marketLabel={marketLabel}
        countryLabel={COUNTRY_LABELS[locale][shippingCountry]}
        config={config}
        form={form}
        locale={locale}
      />

      <aside className="space-y-4">
        <CartSnapshot cartItems={cartItems} subtotal={productSubtotal} currency={currency} locale={locale} />
        {form.created && (
          <>
            <SessionSnapshot session={form.created} fallbackCurrency={currency} locale={locale} />
            <PaymentMethodSection
              key={form.created.sessionId}
              checkoutSessionId={form.created.sessionId}
              mockPaymentEnabled={mockPaymentEnabled}
              locale={locale}
              marketCode={marketCode}
            />
          </>
        )}
      </aside>
    </div>
  );
}

function ShippingForm({ marketCode, marketLabel, countryLabel, config, form, locale }: ShippingFormProps) {
  const messages = messagesFor(locale).checkout;
  const submitLabel = form.isPending
    ? messages.creating
    : form.created
      ? messages.recreate
      : messages.create;

  return (
    <form onSubmit={form.handleSubmit} className="space-y-6 rounded-lg border border-gray-200 bg-white p-5">
      <CheckoutMarketPanel marketLabel={marketLabel} marketCode={marketCode} countryLabel={countryLabel} locale={locale} />
      <AddressFields
        values={form.values}
        onChange={form.handleChange}
        onBlur={form.handleBlur}
        errors={form.errors}
        config={config}
        locale={locale}
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
  locale,
}: {
  marketLabel: string;
  marketCode: MarketCode;
  countryLabel: string;
  locale: Locale;
}) {
  const messages = messagesFor(locale).checkout;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-900">{messages.address}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <ReadOnlyInfo label={messages.selectedMarket} value={`${marketLabel} / ${marketCode}`} />
        <ReadOnlyInfo label={messages.shippingCountry} value={countryLabel} />
      </div>
      <p className="text-xs text-gray-500">
        {messages.marketCountryPremise}
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
  marketCode: MarketCode,
  locale: Locale,
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
    setErrors((current) => withFieldError(current, field, localizedFieldError(field, value, config, locale)));
  }

  function handleBlur(field: AddressKey, domValue: string) {
    if (values[field] !== domValue) setCreated(null);
    setValues((current) => ({ ...current, [field]: domValue }));
    setTouched((current) => ({ ...current, [field]: true }));
    setErrors((current) => withFieldError(current, field, localizedFieldError(field, domValue, config, locale)));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextValues = collectFromFormData(new FormData(event.currentTarget), shippingCountry);
    setValues(nextValues);
    setTouched(touchRequiredFields());
    setErrors(collectErrors(nextValues, config, locale));
    setFormError(null);
    setCreated(null);
    if (hasSubmitError(nextValues, config)) return;
    startTransition(async () => createSession(nextValues, marketCode, locale, setCreated, setFormError));
  }

  return { values, errors, formError, created, isPending, handleChange, handleBlur, handleSubmit };
}

function collectErrors(address: CheckoutShippingInput, config: CountryFormConfig, locale: Locale): FieldErrors {
  return REQUIRED_FIELDS.reduce<FieldErrors>((nextErrors, field) => {
    return withFieldError(nextErrors, field, localizedFieldError(field, address[field] ?? "", config, locale));
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

function actionErrorMessage(result: FailedCheckout, locale: Locale): string {
  const messages = messagesFor(locale).checkout;
  return messages.errors[result.errorCode] ?? messages.errors.SHIPPING_ADDRESS_INVALID;
}

async function createSession(
  address: CheckoutShippingInput,
  expectedMarketCode: MarketCode,
  locale: Locale,
  setCreated: (session: CreateCheckoutSessionResult | null) => void,
  setFormError: (error: string | null) => void,
) {
  const result = await createCheckoutSessionAction({ ...address, expectedMarketCode });
  if (result.success) {
    setCreated(result.session);
    return;
  }
  setFormError(actionErrorMessage(result, locale));
}

function localizedFieldError(
  field: AddressKey,
  value: string,
  config: CountryFormConfig,
  locale: Locale,
): string | null {
  if (getFieldError(field, value, config) === null) return null;
  return messagesFor(locale).checkout.errors.SHIPPING_ADDRESS_INVALID;
}
