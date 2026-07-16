const INPUT_FIELDS = ["commandId", "leaseGeneration", "leaseToken"] as const;
const POSTGRES_INT_MAX = 2_147_483_647;

export type ReleaseRefundExecutionLeaseInput = Readonly<{
  commandId: string;
  leaseGeneration: number;
  leaseToken: string;
}>;

export type NormalizedReleaseRefundExecutionLeaseInput = ReleaseRefundExecutionLeaseInput;

export type RefundExecutionLeaseRelease = Readonly<{
  commandId: string;
  refundAttemptId: string;
  orderId: string;
  leaseGeneration: number;
}>;

export type ReleaseRefundExecutionLeaseFailureCode =
  | "FEATURE_DISABLED"
  | "CONFIG_INVALID"
  | "INVALID_COMMAND_ID"
  | "INVALID_LEASE_GENERATION"
  | "INVALID_LEASE_TOKEN"
  | "COMMAND_NOT_FOUND_OR_INELIGIBLE"
  | "ALREADY_RELEASED"
  | "LEASE_FENCE_MISMATCH"
  | "NOT_PRE_CONTACT"
  | "LEDGER_INCONSISTENT";

export type ReleaseRefundExecutionLeaseFailure = Readonly<{
  ok: false;
  code: ReleaseRefundExecutionLeaseFailureCode;
  message: string;
}>;

export type ReleaseRefundExecutionLeaseResult =
  | Readonly<{ ok: true; release: RefundExecutionLeaseRelease }>
  | ReleaseRefundExecutionLeaseFailure;

export type NormalizeReleaseRefundExecutionLeaseInputResult =
  | Readonly<{ ok: true; input: NormalizedReleaseRefundExecutionLeaseInput }>
  | ReleaseRefundExecutionLeaseFailure;

export function normalizeReleaseRefundExecutionLeaseInput(
  input: unknown,
): NormalizeReleaseRefundExecutionLeaseInputResult {
  if (!hasExactEnumerableFields(input, INPUT_FIELDS)) {
    return releaseFailure("INVALID_COMMAND_ID", "Refund execution lease release input is invalid.");
  }
  const commandId = normalizeRequiredText(input.commandId);
  if (!commandId) return releaseFailure("INVALID_COMMAND_ID", "Command id is invalid.");
  if (!isValidLeaseGeneration(input.leaseGeneration)) {
    return releaseFailure("INVALID_LEASE_GENERATION", "Lease generation is invalid.");
  }
  const leaseToken = normalizeRequiredText(input.leaseToken);
  if (!leaseToken || !/^[0-9a-f]{64}$/.test(leaseToken)) {
    return releaseFailure("INVALID_LEASE_TOKEN", "Lease token is invalid.");
  }
  return Object.freeze({
    ok: true,
    input: Object.freeze({ commandId, leaseGeneration: input.leaseGeneration, leaseToken }),
  });
}

export function releaseSuccess(
  commandId: string,
  refundAttemptId: string,
  orderId: string,
  leaseGeneration: number,
): Extract<ReleaseRefundExecutionLeaseResult, { ok: true }> {
  return Object.freeze({
    ok: true,
    release: Object.freeze({ commandId, refundAttemptId, orderId, leaseGeneration }),
  });
}

export function releaseFailure(
  code: ReleaseRefundExecutionLeaseFailureCode,
  message: string,
): ReleaseRefundExecutionLeaseFailure {
  return Object.freeze({ ok: false, code, message });
}

function hasExactEnumerableFields(
  value: unknown,
  fields: readonly string[],
): value is Record<(typeof INPUT_FIELDS)[number], unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value).filter((key) => Object.prototype.propertyIsEnumerable.call(value, key));
  return keys.length === fields.length
    && keys.every((key) => typeof key === "string" && fields.includes(key));
}

function normalizeRequiredText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function isValidLeaseGeneration(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 1
    && value <= POSTGRES_INT_MAX;
}
