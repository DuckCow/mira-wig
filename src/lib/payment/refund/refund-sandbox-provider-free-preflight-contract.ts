import {
  exactRefundRuntimeArray,
  exactRefundRuntimeRecord,
} from "./refund-runtime-exact";

export const REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_FORMAT_VERSION =
  "mira-refund-sandbox-provider-free-preflight/v1";

export type RefundSandboxProviderFreePreflightFailureCode =
  | "INVALID_HOST_INPUT"
  | "CONFIG_INVALID"
  | "MIGRATIONS_NOT_READY"
  | "DATABASE_UNAVAILABLE"
  | "PREFLIGHT_NOT_READY"
  | "SYSTEMIC_FAILURE";

type ProviderFreeSafetyState = Readonly<{
  activation: "BLOCKED";
  providerExecution: "NOT_PERFORMED";
  credentialProvisioned: false;
  executorAuthorityProvisioned: false;
  schedulerProvisioned: false;
  cloudProvisioningVerifiedByRuntime: false;
}>;

export type RefundSandboxProviderFreePreflightChecks = Readonly<{
  database: "READY";
  postgresqlMajor: 18;
  migrations: "READY";
  worker: "DISABLED_READY";
  health: "EMPTY";
  manualReview: "EMPTY";
  reconciliation: "EMPTY";
  credential: "ABSENT_NOT_VALIDATED";
  distributedAdmission: "ONE_WINNER_ONE_BUSY";
}>;

export type RefundSandboxProviderFreePreflightResult =
  | (ProviderFreeSafetyState & Readonly<{
    ok: true;
    code: "PROVIDER_FREE_SANDBOX_PREFLIGHT_COMPLETE";
    checks: RefundSandboxProviderFreePreflightChecks;
  }>)
  | (ProviderFreeSafetyState & Readonly<{
    ok: false;
    code: RefundSandboxProviderFreePreflightFailureCode;
  }>);

const SAFETY_STATE = Object.freeze({
  activation: "BLOCKED" as const,
  providerExecution: "NOT_PERFORMED" as const,
  credentialProvisioned: false as const,
  executorAuthorityProvisioned: false as const,
  schedulerProvisioned: false as const,
  cloudProvisioningVerifiedByRuntime: false as const,
});

const RESULT_KEYS = Object.freeze([
  "ok", "code", "activation", "providerExecution", "credentialProvisioned",
  "executorAuthorityProvisioned", "schedulerProvisioned",
  "cloudProvisioningVerifiedByRuntime",
] as const);
const CHECK_KEYS = Object.freeze([
  "database", "postgresqlMajor", "migrations", "worker", "health", "manualReview",
  "reconciliation", "credential", "distributedAdmission",
] as const);
const SUCCESS_CHECKS: RefundSandboxProviderFreePreflightChecks = Object.freeze({
  database: "READY",
  postgresqlMajor: 18,
  migrations: "READY",
  worker: "DISABLED_READY",
  health: "EMPTY",
  manualReview: "EMPTY",
  reconciliation: "EMPTY",
  credential: "ABSENT_NOT_VALIDATED",
  distributedAdmission: "ONE_WINNER_ONE_BUSY",
});

export function parseRefundSandboxProviderFreePreflightCliArgs(value: unknown): boolean {
  return exactRefundRuntimeArray(value, 0) !== null;
}

export function refundSandboxProviderFreePreflightComplete(): RefundSandboxProviderFreePreflightResult {
  return Object.freeze({
    ok: true,
    code: "PROVIDER_FREE_SANDBOX_PREFLIGHT_COMPLETE",
    ...SAFETY_STATE,
    checks: SUCCESS_CHECKS,
  });
}

export function refundSandboxProviderFreePreflightFailure(
  code: RefundSandboxProviderFreePreflightFailureCode,
): RefundSandboxProviderFreePreflightResult {
  return Object.freeze({ ok: false, code, ...SAFETY_STATE });
}

export function refundSandboxProviderFreePreflightExitCode(
  result: RefundSandboxProviderFreePreflightResult,
): number {
  if (result.ok) return 0;
  if (result.code === "INVALID_HOST_INPUT") return 64;
  if (result.code === "CONFIG_INVALID" || result.code === "MIGRATIONS_NOT_READY"
    || result.code === "PREFLIGHT_NOT_READY") return 78;
  return 1;
}

export function sanitizeRefundSandboxProviderFreePreflightResult(
  value: unknown,
): RefundSandboxProviderFreePreflightResult | null {
  const base = exactRefundRuntimeRecord(value);
  if (!base || !exactSafetyState(base)) return null;
  return base.ok === true
    ? sanitizedSuccess(base)
    : sanitizedFailure(base);
}

function exactChecks(value: unknown): RefundSandboxProviderFreePreflightChecks | null {
  const checks = exactRefundRuntimeRecord(value, CHECK_KEYS);
  if (!checks) return null;
  const exact = CHECK_KEYS.every((key) => checks[key] === SUCCESS_CHECKS[key]);
  return exact ? SUCCESS_CHECKS : null;
}

function sanitizedSuccess(
  base: Readonly<Record<string, unknown>>,
): RefundSandboxProviderFreePreflightResult | null {
  if (base.code !== "PROVIDER_FREE_SANDBOX_PREFLIGHT_COMPLETE"
    || !sameKeys(base, [...RESULT_KEYS, "checks"])) return null;
  const checks = exactChecks(base.checks);
  return checks ? refundSandboxProviderFreePreflightComplete() : null;
}

function sanitizedFailure(
  base: Readonly<Record<string, unknown>>,
): RefundSandboxProviderFreePreflightResult | null {
  if (base.ok !== false || !failureCode(base.code) || !sameKeys(base, RESULT_KEYS)) return null;
  return refundSandboxProviderFreePreflightFailure(base.code);
}

function exactSafetyState(value: Readonly<Record<string, unknown>>): boolean {
  return value.activation === "BLOCKED"
    && value.providerExecution === "NOT_PERFORMED"
    && value.credentialProvisioned === false
    && value.executorAuthorityProvisioned === false
    && value.schedulerProvisioned === false
    && value.cloudProvisioningVerifiedByRuntime === false;
}

function failureCode(value: unknown): value is RefundSandboxProviderFreePreflightFailureCode {
  return value === "INVALID_HOST_INPUT" || value === "CONFIG_INVALID"
    || value === "MIGRATIONS_NOT_READY" || value === "DATABASE_UNAVAILABLE"
    || value === "PREFLIGHT_NOT_READY" || value === "SYSTEMIC_FAILURE";
}

function sameKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length
    && keys.every((key) => typeof key === "string" && expected.includes(key));
}
