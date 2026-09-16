import { createHash } from "node:crypto";

export const SYNTHETIC_SALE_PROVIDER = "EXIMBAY" as const;
export const SYNTHETIC_SALE_MODE = "SANDBOX" as const;
export const SYNTHETIC_SALE_MID = "1849705C64" as const;
export const SYNTHETIC_SALE_MARKET = "US" as const;
export const SYNTHETIC_SALE_CURRENCY = "USD" as const;
export const SYNTHETIC_SALE_LOCALE = "en" as const;
export const SYNTHETIC_SALE_AMOUNT_MINOR = 100 as const;
export const SYNTHETIC_SALE_ROUTING_RULE = "cfa.us.card.usd" as const;
export const SYNTHETIC_SALE_PUBLIC_ORIGIN =
  "https://mira-p3e-sbx-synthetic-sale-925882331349.asia-northeast3.run.app" as const;

export type SyntheticSaleRuntimeConfiguration = Readonly<{
  capability: string;
  publicOrigin: string;
  providerEnv: Readonly<Record<string, string | undefined>>;
}>;

export function parseSyntheticSaleRuntimeConfiguration(
  env: Readonly<Record<string, string | undefined>>,
): SyntheticSaleRuntimeConfiguration | null {
  const capability = env.MIRA_SYNTHETIC_SALE_RUN_CAPABILITY;
  const publicOrigin = env.MIRA_SYNTHETIC_SALE_PUBLIC_ORIGIN;
  if (!capability || !/^[0-9a-f]{64}$/u.test(capability)) return null;
  if (!publicOrigin || !admittedPublicOrigin(publicOrigin)) return null;
  if (!hasExactProviderConfiguration(env)) return null;
  return Object.freeze({ capability, publicOrigin, providerEnv: Object.freeze({ ...env }) });
}

function hasExactProviderConfiguration(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  const exactValues = Object.freeze({
    PAYMENT_MODE: SYNTHETIC_SALE_MODE,
    MIRA_SYNTHETIC_SALE_PROJECT_ID: "mira-refund-sandbox-0001",
    MIRA_SYNTHETIC_SALE_PROVIDER: SYNTHETIC_SALE_PROVIDER,
    MIRA_SYNTHETIC_SALE_MARKET: SYNTHETIC_SALE_MARKET,
    MIRA_SYNTHETIC_SALE_CURRENCY: SYNTHETIC_SALE_CURRENCY,
    EXIMBAY_CHECKOUT_SANDBOX_ENABLED: "ENABLED",
    EXIMBAY_SANDBOX_MID: SYNTHETIC_SALE_MID,
  });
  return Object.entries(exactValues).every(([name, value]) => env[name] === value)
    && Boolean(env.EXIMBAY_SANDBOX_API_KEY)
    && !env.EXIMBAY_LIVE_API_KEY
    && !env.EXIMBAY_LIVE_MID;
}

export function syntheticSaleRunIdentity(capability: string): string {
  if (!/^[0-9a-f]{64}$/u.test(capability)) throw new Error("SYNTHETIC_SALE_CAPABILITY_INVALID");
  return createHash("sha256").update(capability, "utf8").digest("hex").slice(0, 32);
}

function admittedPublicOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === value && url.href === `${SYNTHETIC_SALE_PUBLIC_ORIGIN}/`;
  } catch {
    return false;
  }
}
