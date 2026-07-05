"use client";

import type { CountryFormConfig } from "@/lib/order/address-config";
import type { CheckoutShippingInput } from "@/lib/payment/session/types";
import type { AddressKey } from "./types";

// ── 단일 필드 ─────────────────────────────────────────────────

interface FieldProps {
  id: AddressKey;
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** DOM blur 시 호출 — 브라우저 자동완성 sync 용 */
  onBlur: (domValue: string) => void;
  required?: boolean;
  placeholder?: string;
  /** touched && 유효성 실패 시만 외부에서 주입 */
  error?: string;
}

function Field({ id, label, value, onChange, onBlur, required, placeholder, error }: FieldProps) {
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
      </label>
      <input
        id={id}
        name={id}
        type="text"
        value={value}
        required={required}
        placeholder={placeholder}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onBlur(e.target.value)}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 ${
          error ? "border-red-400" : "border-gray-300"
        }`}
      />
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}

// ── 주소 필드 패널 ────────────────────────────────────────────

export interface AddressFieldsProps {
  values: CheckoutShippingInput;
  onChange: (field: AddressKey, value: string) => void;
  onBlur: (field: AddressKey, domValue: string) => void;
  errors: Partial<Record<AddressKey, string>>;
  config: CountryFormConfig;
}

export function AddressFields({ values, onChange, onBlur, errors, config }: AddressFieldsProps) {
  return (
    <div className="space-y-4">
      <Field
        id="recipientName"
        label="받는 분 이름"
        value={values.recipientName}
        onChange={(v) => onChange("recipientName", v)}
        onBlur={(v) => onBlur("recipientName", v)}
        required
        error={errors.recipientName}
      />

      <Field
        id="phone"
        label={`전화번호 (${config.phonePrefix})`}
        value={values.phone}
        onChange={(v) => onChange("phone", v)}
        onBlur={(v) => onBlur("phone", v)}
        required
        placeholder={config.phonePlaceholder}
        error={errors.phone}
      />

      <Field
        id="postalCode"
        label={config.postalCodeLabel}
        value={values.postalCode}
        onChange={(v) => onChange("postalCode", v)}
        onBlur={(v) => onBlur("postalCode", v)}
        required
        placeholder={config.postalCodePlaceholder}
        error={errors.postalCode}
      />

      {config.administrativeAreaOptions ? (
        <div>
          <label htmlFor="administrativeArea" className="block text-sm font-medium text-gray-700 mb-1">
            {config.administrativeAreaLabel}
            {config.administrativeAreaRequired && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
          </label>
          <select
            id="administrativeArea"
            name="administrativeArea"
            value={values.administrativeArea}
            required={config.administrativeAreaRequired}
            aria-invalid={errors.administrativeArea ? true : undefined}
            onChange={(e) => {
              onChange("administrativeArea", e.target.value);
              onBlur("administrativeArea", e.target.value);
            }}
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 ${
              errors.administrativeArea ? "border-red-400" : "border-gray-300"
            }`}
          >
            <option value="">선택하세요</option>
            {config.administrativeAreaOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {errors.administrativeArea && (
            <p role="alert" className="mt-1 text-xs text-red-500">{errors.administrativeArea}</p>
          )}
        </div>
      ) : (
        <Field
          id="administrativeArea"
          label={config.administrativeAreaLabel}
          value={values.administrativeArea}
          onChange={(v) => onChange("administrativeArea", v)}
          onBlur={(v) => onBlur("administrativeArea", v)}
          required={config.administrativeAreaRequired}
          error={errors.administrativeArea}
        />
      )}

      <Field
        id="city"
        label={config.cityLabel}
        value={values.city}
        onChange={(v) => onChange("city", v)}
        onBlur={(v) => onBlur("city", v)}
        required
        error={errors.city}
      />

      <Field
        id="addressLine1"
        label="주소"
        value={values.addressLine1}
        onChange={(v) => onChange("addressLine1", v)}
        onBlur={(v) => onBlur("addressLine1", v)}
        required
        error={errors.addressLine1}
      />

      <Field
        id="addressLine2"
        label="상세주소 (선택)"
        value={values.addressLine2 ?? ""}
        onChange={(v) => onChange("addressLine2", v)}
        onBlur={(v) => onBlur("addressLine2", v)}
      />

      <Field
        id="memo"
        label="배송 메모 (선택)"
        value={values.memo ?? ""}
        onChange={(v) => onChange("memo", v)}
        onBlur={(v) => onBlur("memo", v)}
        placeholder="경비실 맡겨주세요 등"
      />
    </div>
  );
}
