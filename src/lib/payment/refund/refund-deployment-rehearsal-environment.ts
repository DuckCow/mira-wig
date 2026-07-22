import { exactRehearsalRecord } from "./refund-deployment-rehearsal-exact";

const LOOPBACK_HOSTS = Object.freeze(["localhost", "127.0.0.1", "[::1]", "::1"] as const);
const PROVIDER_SENSITIVE_PREFIXES = Object.freeze([
  "REFUND_EXECUTION_",
  "CUSTOMER_REFUND_",
  "TOSS_",
  "NEXT_PUBLIC_TOSS_",
  "PAYPAL_",
  "NEXT_PUBLIC_PAYPAL_",
  "PAYMENT_",
  "MIRA_TOSS_SANDBOX_ACCEPTANCE_",
] as const);

export type RefundDeploymentRehearsalEnvironment = Readonly<{
  DATABASE_URL: string;
  NODE_ENV: "test";
}>;

export function safeRefundDeploymentRehearsalEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): RefundDeploymentRehearsalEnvironment | null {
  const inspected = exactRehearsalRecord(env, undefined, true);
  if (!inspected || !Object.values(inspected).every((value) => (
    value === undefined || typeof value === "string"
  ))) return null;
  const connectionString = inspected.DATABASE_URL;
  if (typeof connectionString !== "string"
    || !localDisposableDatabaseUrl(connectionString)) return null;
  if (hasSensitiveValue(Object.entries(inspected))) return null;
  return Object.freeze({ DATABASE_URL: connectionString, NODE_ENV: "test" });
}

function hasSensitiveValue(entries: ReadonlyArray<readonly [string, unknown]>): boolean {
  return entries.some(([key, value]) => providerSensitiveKey(key)
    && typeof value === "string" && value.trim().length > 0);
}

function localDisposableDatabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") return false;
    if (!LOOPBACK_HOSTS.some((host) => host === url.hostname)) return false;
    return decodeURIComponent(url.pathname) === "/wig_platform_test";
  } catch {
    return false;
  }
}

function providerSensitiveKey(key: string): boolean {
  return PROVIDER_SENSITIVE_PREFIXES.some((prefix) => key.startsWith(prefix));
}
