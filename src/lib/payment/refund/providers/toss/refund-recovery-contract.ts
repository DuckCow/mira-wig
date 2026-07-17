const INPUT_FIELDS = ["commandId", "recoveryOwner"] as const;
const INPUT_FIELD_SET = new Set<string>(INPUT_FIELDS);
const COMMAND_ID_MAX_CODE_POINTS = 128;
const RECOVERY_OWNER_MAX_CODE_POINTS = 255;

export type TossRefundRecoveryFailureCode =
  | "INVALID_COMMAND_ID"
  | "INVALID_RECOVERY_OWNER"
  | "FEATURE_DISABLED"
  | "CONFIG_INVALID"
  | "COMMAND_NOT_FOUND_OR_INELIGIBLE"
  | "RECOVERY_LEASE_CONFLICT"
  | "RECOVERY_CREDENTIAL_UNAVAILABLE"
  | "RECOVERY_LOOKUP_UNAVAILABLE"
  | "RECOVERY_LOOKUP_REJECTED"
  | "RECOVERY_PROVIDER_PROCESSING"
  | "RECOVERY_RECONTACT_REQUIRED"
  | "RECOVERY_MANUAL_REVIEW_REQUIRED"
  | "RECOVERY_DEADLINE_EXPIRED"
  | "RECOVERY_ORDINAL_LIMIT_REACHED"
  | "RECOVERY_INTERVAL_NOT_ELAPSED"
  | "RECOVERY_CONTACT_OUTCOME_UNKNOWN"
  | "RECOVERY_CONTACT_RESPONSE_REJECTED"
  | "REFUND_LEDGER_INCONSISTENT"
  | "PERSISTENCE_CONFLICT";

export type TossRefundRecoveryFailure = Readonly<{
  ok: false;
  code: TossRefundRecoveryFailureCode;
  message: string;
}>;

export type NormalizedTossRefundRecoveryInput = Readonly<{
  commandId: string;
  recoveryOwner: string;
}>;

export type RecoverTossRefundExecutionInput = Readonly<{
  commandId: string;
  recoveryOwner: string;
}>;

export type RecoverTossRefundExecutionSuccess = Readonly<{
  ok: true;
  replayed: boolean;
  commandId: string;
  outcome: "REFUND_SUCCEEDED";
}>;

export type RecoverTossRefundExecutionResult =
  | RecoverTossRefundExecutionSuccess
  | TossRefundRecoveryFailure;

export type NormalizeTossRefundRecoveryInputResult =
  | Readonly<{ ok: true; input: NormalizedTossRefundRecoveryInput }>
  | TossRefundRecoveryFailure;

export function normalizeTossRefundRecoveryInput(
  value: unknown,
): NormalizeTossRefundRecoveryInputResult {
  if (!hasExactDataFields(value)) return invalidCommandId();
  const commandId = normalizeText(value.commandId, COMMAND_ID_MAX_CODE_POINTS);
  if (!commandId) return invalidCommandId();
  const recoveryOwner = normalizeText(value.recoveryOwner, RECOVERY_OWNER_MAX_CODE_POINTS);
  if (!recoveryOwner) return recoveryFailure(
    "INVALID_RECOVERY_OWNER", "Recovery owner is invalid.",
  );
  return Object.freeze({
    ok: true,
    input: Object.freeze({ commandId, recoveryOwner }),
  });
}

export function recoveryFailure(
  code: TossRefundRecoveryFailureCode,
  message: string,
): TossRefundRecoveryFailure {
  return Object.freeze({ ok: false, code, message });
}

export function recoverySuccess(
  commandId: string,
  replayed: boolean,
): RecoverTossRefundExecutionSuccess {
  return Object.freeze({
    ok: true,
    replayed,
    commandId,
    outcome: "REFUND_SUCCEEDED",
  });
}

function invalidCommandId(): TossRefundRecoveryFailure {
  return recoveryFailure("INVALID_COMMAND_ID", "Command id is invalid.");
}

function normalizeText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && Array.from(normalized).length <= maximum && !/\p{Cc}/u.test(normalized)
    ? normalized
    : null;
}

function hasExactDataFields(value: unknown): value is Record<(typeof INPUT_FIELDS)[number], unknown> {
  if (!isPlainRecord(value)) return false;
  const prototype = Reflect.getPrototypeOf(value);
  const names = Object.getOwnPropertyNames(value);
  return [
    prototype === Object.prototype || prototype === null,
    Object.getOwnPropertySymbols(value).length === 0,
    names.length === INPUT_FIELDS.length,
    names.every((name) => INPUT_FIELD_SET.has(name)),
    names.every((name) => isEnumerableDataField(value, name)),
  ].every(Boolean);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEnumerableDataField(value: object, name: string): boolean {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    return Boolean(descriptor?.enumerable && "value" in descriptor && !descriptor.get && !descriptor.set);
}
