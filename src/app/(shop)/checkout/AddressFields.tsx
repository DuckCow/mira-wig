"use client";

import type { CountryFormConfig } from "@/lib/order/address-config";
import type { AddressKey } from "./types";

interface FieldProps {
  id: AddressKey;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}

function Field({ id, label, value, onChange, required, placeholder }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
      />
    </div>
  );
}

import type { CheckoutAddressInput } from "@/lib/order/types";

interface AddressFieldsProps {
  values: CheckoutAddressInput;
  onChange: (field: AddressKey, value: string) => void;
  config: CountryFormConfig;
}

export function AddressFields({ values, onChange, config }: AddressFieldsProps) {
  return (
    <div className="space-y-4">
      <Field
        id="recipientName"
        label="받는 분 이름"
        value={values.recipientName}
        onChange={(v) => onChange("recipientName", v)}
        required
      />

      <Field
        id="phone"
        label={`전화번호 (${config.phonePrefix})`}
        value={values.phone}
        onChange={(v) => onChange("phone", v)}
        required
        placeholder={config.phonePlaceholder}
      />

      <Field
        id="postalCode"
        label={config.postalCodeLabel}
        value={values.postalCode}
        onChange={(v) => onChange("postalCode", v)}
        required
        placeholder={config.postalCodePlaceholder}
      />

      {config.administrativeAreaOptions ? (
        <div>
          <label htmlFor="administrativeArea" className="block text-sm font-medium text-gray-700 mb-1">
            {config.administrativeAreaLabel}
            {config.administrativeAreaRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <select
            id="administrativeArea"
            value={values.administrativeArea}
            required={config.administrativeAreaRequired}
            onChange={(e) => onChange("administrativeArea", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            <option value="">선택하세요</option>
            {config.administrativeAreaOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      ) : (
        <Field
          id="administrativeArea"
          label={config.administrativeAreaLabel}
          value={values.administrativeArea}
          onChange={(v) => onChange("administrativeArea", v)}
          required={config.administrativeAreaRequired}
        />
      )}

      <Field
        id="city"
        label={config.cityLabel}
        value={values.city}
        onChange={(v) => onChange("city", v)}
        required
      />

      <Field
        id="addressLine1"
        label="주소"
        value={values.addressLine1}
        onChange={(v) => onChange("addressLine1", v)}
        required
      />

      <Field
        id="addressLine2"
        label="상세주소 (선택)"
        value={values.addressLine2}
        onChange={(v) => onChange("addressLine2", v)}
      />

      <Field
        id="memo"
        label="배송 메모 (선택)"
        value={values.memo}
        onChange={(v) => onChange("memo", v)}
        placeholder="경비실 맡겨주세요 등"
      />
    </div>
  );
}
