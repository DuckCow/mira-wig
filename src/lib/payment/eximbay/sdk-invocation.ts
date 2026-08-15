"use client";

import type {
  EximbayReadyHandoffV1,
  EximbaySdkWireV1,
} from "./sdk-handoff-contract";
import { loadEximbaySdkV2 } from "./sdk-loader";

export type EximbayBrowserHandoffResult =
  | Readonly<{ kind: "BROWSER_HANDOFF_ATTEMPTED" }>
  | Readonly<{
      kind: "BROWSER_HANDOFF_FAILED";
      code: "SDK_LOAD_FAILED" | "CONTROLLER_DISPOSED" | "REQUEST_PAY_THROWN";
    }>;

export interface EximbayRequestPayController {
  invoke(): Promise<EximbayBrowserHandoffResult>;
  dispose(): void;
}

export function createEximbayRequestPayController(input: unknown):
  | Readonly<{ ok: true; controller: EximbayRequestPayController }>
  | Readonly<{ ok: false; code: "INVALID_HANDOFF" }> {
  const handoff = admitHandoff(input);
  if (!handoff) return Object.freeze({ ok: false, code: "INVALID_HANDOFF" });

  let disposed = false;
  let invocation: Promise<EximbayBrowserHandoffResult> | null = null;
  const controller: EximbayRequestPayController = Object.freeze({
    invoke(): Promise<EximbayBrowserHandoffResult> {
      invocation ??= invokeOnce(handoff, () => disposed);
      return invocation;
    },
    dispose(): void {
      disposed = true;
    },
  });
  return Object.freeze({ ok: true, controller });
}

async function invokeOnce(
  handoff: EximbayReadyHandoffV1,
  isDisposed: () => boolean,
): Promise<EximbayBrowserHandoffResult> {
  let requestPay;
  try {
    requestPay = await loadEximbaySdkV2(handoff.mode);
  } catch {
    return failed("SDK_LOAD_FAILED");
  }
  if (isDisposed()) return failed("CONTROLLER_DISPOSED");
  try {
    requestPay(handoff.payload);
  } catch {
    return failed("REQUEST_PAY_THROWN");
  }
  return Object.freeze({ kind: "BROWSER_HANDOFF_ATTEMPTED" });
}

function failed(
  code: Extract<EximbayBrowserHandoffResult, { kind: "BROWSER_HANDOFF_FAILED" }>["code"],
): EximbayBrowserHandoffResult {
  return Object.freeze({ kind: "BROWSER_HANDOFF_FAILED", code });
}

function admitHandoff(input: unknown): EximbayReadyHandoffV1 | null {
  const root = admitRecord(input, ["kind", "paymentId", "mode", "sdkGeneration", "payload"]);
  if (!root || root.kind !== "EXIMBAY_READY_HANDOFF_V1") return null;
  if (!admittedText(root.paymentId) || !admittedMode(root.mode) || root.sdkGeneration !== "v2") return null;
  const payload = admitPayload(root.payload);
  if (!payload) return null;
  return Object.freeze({
    kind: "EXIMBAY_READY_HANDOFF_V1",
    paymentId: root.paymentId,
    mode: root.mode,
    sdkGeneration: "v2",
    payload,
  });
}

function admitPayload(input: unknown): EximbaySdkWireV1 | null {
  const payload = admitRecord(input, ["fgkey", "payment", "merchant", "buyer", "url"]);
  if (!payload || !admittedText(payload.fgkey)) return null;
  const payment = admitPayment(payload.payment);
  const merchant = admitMerchant(payload.merchant);
  const buyer = admitBuyer(payload.buyer);
  const url = admitUrls(payload.url);
  if (!payment || !merchant || !buyer || !url) return null;
  return Object.freeze({ fgkey: payload.fgkey, payment, merchant, buyer, url });
}

function admitPayment(input: unknown): EximbaySdkWireV1["payment"] | null {
  const value = admitRecord(input, [
    "transaction_type", "order_id", "currency", "amount", "lang", "payment_method",
  ]);
  if (!value || value.transaction_type !== "PAYMENT" || value.payment_method !== "P000") return null;
  if (!admittedText(value.order_id) || !admittedCurrency(value.currency)) return null;
  if (!admittedText(value.amount) || !admittedLanguage(value.lang)) return null;
  return Object.freeze({
    transaction_type: "PAYMENT",
    order_id: value.order_id,
    currency: value.currency,
    amount: value.amount,
    lang: value.lang,
    payment_method: "P000",
  });
}

function admitMerchant(input: unknown): EximbaySdkWireV1["merchant"] | null {
  const value = admitRecord(input, ["mid"]);
  if (!value || !admittedText(value.mid)) return null;
  return Object.freeze({ mid: value.mid });
}

function admitBuyer(input: unknown): EximbaySdkWireV1["buyer"] | null {
  const value = admitRecord(input, ["name", "email"]);
  if (!value || !admittedText(value.name) || !admittedText(value.email)) return null;
  return Object.freeze({ name: value.name, email: value.email });
}

function admitUrls(input: unknown): EximbaySdkWireV1["url"] | null {
  const value = admitRecord(input, ["return_url", "status_url"]);
  if (!value || !admittedText(value.return_url) || !admittedText(value.status_url)) return null;
  return Object.freeze({ return_url: value.return_url, status_url: value.status_url });
}

function admitRecord(input: unknown, expectedKeys: string[]): Record<string, unknown> | null {
  if (!isAdmittedRecordShape(input, expectedKeys)) return null;
  return admittedDescriptorValues(input, expectedKeys);
}

function isAdmittedRecordShape(input: unknown, expectedKeys: string[]): input is object {
  if (typeof input !== "object" || input === null) return false;
  if (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) {
    return false;
  }
  const ownKeys = Reflect.ownKeys(input);
  if (ownKeys.some((key) => typeof key === "symbol")) return false;
  if (ownKeys.length !== expectedKeys.length) return false;
  return !expectedKeys.some((key) => !ownKeys.includes(key));
}

function admittedDescriptorValues(
  input: object,
  expectedKeys: string[],
): Record<string, unknown> | null {
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const values: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!isUnknownDataDescriptor(descriptor)) return null;
    values[key] = descriptor.value;
  }
  return values;
}

function admittedText(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 65_536
    && value.trim() === value
    && !hasProhibitedControl(value);
}

function hasProhibitedControl(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code !== undefined && (code <= 31 || (code >= 127 && code <= 159))) return true;
  }
  return false;
}

type UnknownDataDescriptor = Omit<PropertyDescriptor, "value"> & { value: unknown };

function isUnknownDataDescriptor(
  descriptor: PropertyDescriptor | undefined,
): descriptor is UnknownDataDescriptor {
  return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value");
}

function admittedMode(value: unknown): value is EximbayReadyHandoffV1["mode"] {
  return value === "SANDBOX" || value === "LIVE";
}

function admittedCurrency(value: unknown): value is EximbaySdkWireV1["payment"]["currency"] {
  return value === "USD" || value === "JPY";
}

function admittedLanguage(value: unknown): value is EximbaySdkWireV1["payment"]["lang"] {
  return value === "EN" || value === "JP";
}
