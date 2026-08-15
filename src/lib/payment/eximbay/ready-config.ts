import "server-only";
import {
  EXIMBAY_LIVE_API_KEY,
  EXIMBAY_LIVE_MID,
  EXIMBAY_SANDBOX_API_KEY,
  EXIMBAY_SANDBOX_MID,
  PAYMENT_PUBLIC_ORIGIN,
  type ProviderEnv,
} from "@/lib/payment/providers/credentials";
import { requireEximbayMode, type EximbayPaymentMode } from "@/lib/payment/providers/eximbay/types";
import { requireExactText } from "@/lib/payment/providers/eximbay/validation";
import {
  createEximbayReadyCredentialAuthority,
  type EximbayReadyCredentialAuthority,
} from "./ready-http";

const readyConfigBrand: unique symbol = Symbol("EximbayReadyConfig");
const readyConfigAuthorities = new WeakMap<object, ReadyConfigAuthority>();

interface ReadyConfigAuthority {
  readonly mode: EximbayPaymentMode;
  readonly mid: string;
  readonly paymentPublicOrigin: string;
  readonly credentials: EximbayReadyCredentialAuthority;
}

export interface EximbayReadyConfig {
  readonly [readyConfigBrand]: true;
}

export interface EximbayReadyConfigFacts {
  readonly mode: EximbayPaymentMode;
  readonly mid: string;
  readonly paymentPublicOrigin: string;
  readonly credentials: EximbayReadyCredentialAuthority;
}

export type EximbayReadyConfigErrorCode =
  | "INVALID_MODE"
  | "INVALID_API_KEY"
  | "INVALID_MID"
  | "INVALID_PAYMENT_PUBLIC_ORIGIN"
  | "UNTRUSTED_READY_CONFIG";

export class EximbayReadyConfigError extends Error {
  constructor(readonly code: EximbayReadyConfigErrorCode) {
    super(code);
    this.name = "EximbayReadyConfigError";
  }
}

export function resolveEximbayReadyConfig(
  modeInput: unknown,
  env: ProviderEnv = process.env,
): EximbayReadyConfig {
  const mode = resolveMode(modeInput);
  const names = mode === "SANDBOX"
    ? { apiKey: EXIMBAY_SANDBOX_API_KEY, mid: EXIMBAY_SANDBOX_MID }
    : { apiKey: EXIMBAY_LIVE_API_KEY, mid: EXIMBAY_LIVE_MID };
  const apiKey = resolveExactConfigText(env[names.apiKey], "INVALID_API_KEY");
  const mid = resolveExactConfigText(env[names.mid], "INVALID_MID");
  const paymentPublicOrigin = resolvePaymentPublicOrigin(env[PAYMENT_PUBLIC_ORIGIN]);
  const config: EximbayReadyConfig = { [readyConfigBrand]: true };
  Object.defineProperty(config, readyConfigBrand, { enumerable: false });
  readyConfigAuthorities.set(config, Object.freeze({
    mode,
    mid,
    paymentPublicOrigin,
    credentials: createEximbayReadyCredentialAuthority(mode, apiKey),
  }));
  return Object.freeze(config);
}

export function requireEximbayReadyConfigFacts(config: EximbayReadyConfig): EximbayReadyConfigFacts {
  const authority = readyConfigAuthorities.get(config);
  if (!authority) throw new EximbayReadyConfigError("UNTRUSTED_READY_CONFIG");
  return authority;
}

function resolveMode(value: unknown): EximbayPaymentMode {
  try {
    return requireEximbayMode(value);
  } catch {
    throw new EximbayReadyConfigError("INVALID_MODE");
  }
}

function resolveExactConfigText(
  value: unknown,
  code: "INVALID_API_KEY" | "INVALID_MID",
): string {
  try {
    return requireExactText(value, code);
  } catch {
    throw new EximbayReadyConfigError(code);
  }
}

function resolvePaymentPublicOrigin(value: unknown): string {
  const raw = resolveOriginText(value);
  try {
    const parsed = new URL(raw);
    if (!isAdmittedPaymentOrigin(parsed, raw)) return invalidOrigin();
    return parsed.origin;
  } catch {
    return invalidOrigin();
  }
}

function isAdmittedPaymentOrigin(parsed: URL, raw: string): boolean {
  return parsed.protocol === "https:"
    && parsed.hostname.length > 0
    && parsed.username.length === 0
    && parsed.password.length === 0
    && parsed.pathname === "/"
    && !raw.includes("?")
    && !raw.includes("#");
}

function resolveOriginText(value: unknown): string {
  try {
    return requireExactText(value, "INVALID_PAYMENT_PUBLIC_ORIGIN");
  } catch {
    return invalidOrigin();
  }
}

function invalidOrigin(): never {
  throw new EximbayReadyConfigError("INVALID_PAYMENT_PUBLIC_ORIGIN");
}
