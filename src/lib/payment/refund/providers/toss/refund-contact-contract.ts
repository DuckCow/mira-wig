const INPUT_FIELDS = ["commandId", "leaseGeneration", "leaseToken"] as const;
const INTERNAL_ID_MAX_CODE_POINTS = 128;
const POSTGRES_INT_MAX = 2_147_483_647;

export type ExecuteTossRefundContactInput = Readonly<{
  commandId: string;
  leaseGeneration: number;
  leaseToken: string;
}>;

export type NormalizedExecuteTossRefundContactInput = ExecuteTossRefundContactInput;

export type TossRefundContactFailureCode =
  | "FEATURE_DISABLED"
  | "CONFIG_INVALID"
  | "INVALID_COMMAND_ID"
  | "INVALID_LEASE_GENERATION"
  | "INVALID_LEASE_TOKEN"
  | "COMMAND_NOT_FOUND_OR_INELIGIBLE"
  | "LEASE_EXPIRED"
  | "LEASE_FENCE_MISMATCH"
  | "CONTACT_RECOVERY_REQUIRED"
  | "CONTACT_ELIGIBILITY_UNAVAILABLE"
  | "CONTACT_ELIGIBILITY_REJECTED"
  | "TOSS_PAYMENT_NOT_ELIGIBLE"
  | "CREDENTIAL_BINDING_MISMATCH"
  | "REFUND_LEDGER_INCONSISTENT"
  | "TOSS_CONTACT_OUTCOME_UNKNOWN"
  | "TOSS_CONTACT_RESPONSE_REJECTED"
  | "PERSISTENCE_CONFLICT";

export type TossRefundContactFailure = Readonly<{
  ok: false;
  code: TossRefundContactFailureCode;
  message: string;
}>;

export type TossRefundContactSuccess = Readonly<{
  ok: true;
  replayed: boolean;
  commandId: string;
  dispatchAttempt: 1;
  outcome: "REFUND_SUCCEEDED";
}>;

export type ExecuteTossRefundContactResult =
  | TossRefundContactSuccess
  | TossRefundContactFailure;

export function normalizeExecuteTossRefundContactInput(
  input: unknown,
): Readonly<{ ok: true; input: NormalizedExecuteTossRefundContactInput }>
  | TossRefundContactFailure {
  if (!hasExactPlainDataFields(input)) return invalidInput();
  const commandId = normalizeText(input.commandId);
  if (!commandId || Array.from(commandId).length > INTERNAL_ID_MAX_CODE_POINTS
    || /\p{Cc}/u.test(commandId)) return failure("INVALID_COMMAND_ID", "Command id is invalid.");
  if (!isPositivePostgresInteger(input.leaseGeneration)) {
    return failure("INVALID_LEASE_GENERATION", "Lease generation is invalid.");
  }
  const leaseToken = normalizeText(input.leaseToken);
  if (!leaseToken || !/^[0-9a-f]{64}$/.test(leaseToken)) {
    return failure("INVALID_LEASE_TOKEN", "Lease token is invalid.");
  }
  return Object.freeze({
    ok: true,
    input: Object.freeze({ commandId, leaseGeneration: input.leaseGeneration, leaseToken }),
  });
}

export function contactSuccess(commandId: string, replayed: boolean): TossRefundContactSuccess {
  return Object.freeze({
    ok: true,
    replayed,
    commandId,
    dispatchAttempt: 1,
    outcome: "REFUND_SUCCEEDED",
  });
}

export function contactFailure(
  code: TossRefundContactFailureCode,
  message: string,
): TossRefundContactFailure {
  return Object.freeze({ ok: false, code, message });
}

function hasExactPlainDataFields(
  value: unknown,
): value is Record<(typeof INPUT_FIELDS)[number], unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== INPUT_FIELDS.length) return false;
  return keys.every((key) => hasDataField(value, key));
}

function hasDataField(value: object, key: string | symbol): boolean {
  if (typeof key !== "string" || !INPUT_FIELDS.some((field) => field === key)) return false;
  const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && Boolean(descriptor.enumerable)
    && Object.prototype.hasOwnProperty.call(descriptor, "value");
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function isPositivePostgresInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= 1 && value <= POSTGRES_INT_MAX;
}

function invalidInput(): TossRefundContactFailure {
  return failure("INVALID_COMMAND_ID", "Toss refund contact input is invalid.");
}

const failure = contactFailure;
