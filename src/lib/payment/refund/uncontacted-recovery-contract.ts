import type { RefundExecutionLeaseHandle } from "./lease-contract";

const INPUT_FIELDS = ["commandId", "recoveryOwner"] as const;
const COMMAND_ID_MAX_CODE_POINTS = 128;
const RECOVERY_OWNER_MAX_CODE_POINTS = 255;

export type ReclaimUncontactedRefundExecutionInput = Readonly<{
  commandId: string;
  recoveryOwner: string;
}>;

export type NormalizedReclaimUncontactedRefundExecutionInput =
  ReclaimUncontactedRefundExecutionInput;

export type ReclaimUncontactedRefundExecutionFailureCode =
  | "FEATURE_DISABLED"
  | "CONFIG_INVALID"
  | "INVALID_COMMAND_ID"
  | "INVALID_RECOVERY_OWNER"
  | "COMMAND_NOT_FOUND_OR_INELIGIBLE"
  | "LEASE_NOT_EXPIRED"
  | "LEASE_CONFLICT"
  | "AUTHORIZED_RECOVERY_UNSUPPORTED"
  | "CONTACTED_RECOVERY_REQUIRED"
  | "LEDGER_INCONSISTENT"
  | "PERSISTENCE_CONFLICT";

export type ReclaimUncontactedRefundExecutionFailure = Readonly<{
  ok: false;
  code: ReclaimUncontactedRefundExecutionFailureCode;
  message: string;
}>;

export type ReclaimUncontactedRefundExecutionResult =
  | Readonly<{
      ok: true;
      lease: RefundExecutionLeaseHandle;
      recoveredState: "ORDINAL_ZERO" | "AUTHORIZED_EXIMBAY_R1";
    }>
  | ReclaimUncontactedRefundExecutionFailure;

export type NormalizeReclaimUncontactedRefundExecutionInputResult =
  | Readonly<{
    ok: true;
    input: NormalizedReclaimUncontactedRefundExecutionInput;
  }>
  | ReclaimUncontactedRefundExecutionFailure;

const FAILURE_MESSAGES: Readonly<
  Record<ReclaimUncontactedRefundExecutionFailureCode, string>
> = Object.freeze({
  FEATURE_DISABLED: "Uncontacted refund execution recovery is disabled.",
  CONFIG_INVALID: "Uncontacted refund execution recovery configuration is invalid.",
  INVALID_COMMAND_ID: "Command id is invalid.",
  INVALID_RECOVERY_OWNER: "Recovery owner is invalid.",
  COMMAND_NOT_FOUND_OR_INELIGIBLE: "Refund execution command is not eligible for uncontacted recovery.",
  LEASE_NOT_EXPIRED: "Refund execution lease has not expired.",
  LEASE_CONFLICT: "Refund execution lease recovery conflicted.",
  AUTHORIZED_RECOVERY_UNSUPPORTED: "Authorized uncontacted refund recovery is not supported.",
  CONTACTED_RECOVERY_REQUIRED: "Contacted refund recovery is required.",
  LEDGER_INCONSISTENT: "Refund execution aggregate is inconsistent.",
  PERSISTENCE_CONFLICT: "Refund execution recovery persistence conflicted.",
});

export function normalizeReclaimUncontactedRefundExecutionInput(
  input: unknown,
): NormalizeReclaimUncontactedRefundExecutionInputResult {
  if (!hasExactDataFields(input)) return reclaimFailure("INVALID_COMMAND_ID");
  const commandId = normalizeAuthorityText(input.commandId, COMMAND_ID_MAX_CODE_POINTS);
  if (!commandId) return reclaimFailure("INVALID_COMMAND_ID");
  const recoveryOwner = normalizeAuthorityText(
    input.recoveryOwner,
    RECOVERY_OWNER_MAX_CODE_POINTS,
  );
  if (!recoveryOwner) return reclaimFailure("INVALID_RECOVERY_OWNER");
  return Object.freeze({
    ok: true,
    input: Object.freeze({ commandId, recoveryOwner }),
  });
}

export function reclaimFailure(
  code: ReclaimUncontactedRefundExecutionFailureCode,
): ReclaimUncontactedRefundExecutionFailure {
  return Object.freeze({ ok: false, code, message: FAILURE_MESSAGES[code] });
}

function hasExactDataFields(
  value: unknown,
): value is Record<(typeof INPUT_FIELDS)[number], unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== INPUT_FIELDS.length) return false;
  return INPUT_FIELDS.every((field) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    return descriptor !== undefined
      && descriptor.enumerable
      && "value" in descriptor;
  });
}

function normalizeAuthorityText(value: unknown, maxCodePoints: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || Array.from(normalized).length > maxCodePoints || /\p{Cc}/u.test(normalized)) {
    return null;
  }
  return normalized;
}
