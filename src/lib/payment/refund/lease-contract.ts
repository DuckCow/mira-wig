const INPUT_FIELDS = ["commandId", "leaseOwner"] as const;
const LEASE_OWNER_MAX_CODE_POINTS = 255;

export type AcquireRefundExecutionLeaseInput = Readonly<{
  commandId: string;
  leaseOwner: string;
}>;

export type NormalizedAcquireRefundExecutionLeaseInput = AcquireRefundExecutionLeaseInput;

export type RefundExecutionLeaseHandle = Readonly<{
  commandId: string;
  refundAttemptId: string;
  orderId: string;
  leaseGeneration: number;
  leaseToken: string;
  leaseUntil: Date;
}>;

export type AcquireRefundExecutionLeaseFailureCode =
  | "FEATURE_DISABLED"
  | "CONFIG_INVALID"
  | "INVALID_COMMAND_ID"
  | "INVALID_LEASE_OWNER"
  | "COMMAND_NOT_FOUND_OR_INELIGIBLE"
  | "COMMAND_NOT_READY"
  | "NOT_YET_AVAILABLE"
  | "LEASE_CONFLICT"
  | "PAYMENT_NOT_EXECUTABLE"
  | "LEDGER_INCONSISTENT";

export type AcquireRefundExecutionLeaseFailure = Readonly<{
  ok: false;
  code: AcquireRefundExecutionLeaseFailureCode;
  message: string;
}>;

export type AcquireRefundExecutionLeaseResult =
  | Readonly<{ ok: true; lease: RefundExecutionLeaseHandle }>
  | AcquireRefundExecutionLeaseFailure;

export type NormalizeAcquireRefundExecutionLeaseInputResult =
  | Readonly<{ ok: true; input: NormalizedAcquireRefundExecutionLeaseInput }>
  | AcquireRefundExecutionLeaseFailure;

export function normalizeAcquireRefundExecutionLeaseInput(
  input: unknown,
): NormalizeAcquireRefundExecutionLeaseInputResult {
  if (!hasExactEnumerableFields(input, INPUT_FIELDS)) {
    return leaseFailure("INVALID_COMMAND_ID", "Refund execution lease input is invalid.");
  }
  const commandId = normalizeRequiredText(input.commandId);
  if (!commandId) return leaseFailure("INVALID_COMMAND_ID", "Command id is invalid.");
  const leaseOwner = normalizeRequiredText(input.leaseOwner);
  if (!leaseOwner || Array.from(leaseOwner).length > LEASE_OWNER_MAX_CODE_POINTS || /\p{Cc}/u.test(leaseOwner)) {
    return leaseFailure("INVALID_LEASE_OWNER", "Lease owner is invalid.");
  }
  return Object.freeze({ ok: true, input: Object.freeze({ commandId, leaseOwner }) });
}

export function leaseSuccess(
  commandId: string,
  refundAttemptId: string,
  orderId: string,
  leaseGeneration: number,
  leaseToken: string,
  leaseUntil: Date,
): Extract<AcquireRefundExecutionLeaseResult, { ok: true }> {
  return Object.freeze({
    ok: true,
    lease: Object.freeze({
      commandId,
      refundAttemptId,
      orderId,
      leaseGeneration,
      leaseToken,
      leaseUntil: new Date(leaseUntil.getTime()),
    }),
  });
}

export function leaseFailure(
  code: AcquireRefundExecutionLeaseFailureCode,
  message: string,
): AcquireRefundExecutionLeaseFailure {
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
