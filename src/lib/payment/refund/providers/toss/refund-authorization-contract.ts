const INPUT_FIELDS = ["commandId", "leaseGeneration", "leaseToken"] as const;
const INTERNAL_ID_MAX_CODE_POINTS = 128;
const POSTGRES_INT_MAX = 2_147_483_647;

export type AuthorizeTossRefundExecutionDispatchInput = Readonly<{
  commandId: string;
  leaseGeneration: number;
  leaseToken: string;
}>;

export type NormalizedAuthorizeTossRefundExecutionDispatchInput =
  AuthorizeTossRefundExecutionDispatchInput;

export type TossRefundDispatchAuthorization = Readonly<{
  commandId: string;
  dispatchAttempt: 1;
  leaseGeneration: number;
  authorizedAt: string;
}>;

export type TossRefundAuthorizationFailureCode =
  | "FEATURE_DISABLED"
  | "CONFIG_INVALID"
  | "INVALID_COMMAND_ID"
  | "INVALID_LEASE_GENERATION"
  | "INVALID_LEASE_TOKEN"
  | "COMMAND_NOT_FOUND_OR_INELIGIBLE"
  | "LEASE_EXPIRED"
  | "LEASE_FENCE_MISMATCH"
  | "CONTACT_RECOVERY_REQUIRED"
  | "TOSS_LOOKUP_UNAVAILABLE"
  | "TOSS_LOOKUP_REJECTED"
  | "TOSS_PAYMENT_NOT_ELIGIBLE"
  | "CREDENTIAL_BINDING_MISMATCH"
  | "DISPATCH_AUTHORIZATION_CONFLICT"
  | "REFUND_LEDGER_INCONSISTENT"
  | "PERSISTENCE_CONFLICT";

export type TossRefundAuthorizationFailure = Readonly<{
  ok: false;
  code: TossRefundAuthorizationFailureCode;
  message: string;
}>;

export type TossRefundAuthorizationSuccess = Readonly<{
  ok: true;
  replayed: boolean;
  authorization: TossRefundDispatchAuthorization;
}>;

export type AuthorizeTossRefundExecutionDispatchResult =
  | TossRefundAuthorizationSuccess
  | TossRefundAuthorizationFailure;

export function normalizeAuthorizeTossRefundExecutionDispatchInput(
  input: unknown,
): Readonly<{ ok: true; input: NormalizedAuthorizeTossRefundExecutionDispatchInput }>
  | TossRefundAuthorizationFailure {
  if (!hasExactPlainDataFields(input)) {
    return tossRefundAuthorizationFailure(
      "INVALID_COMMAND_ID",
      "Toss refund authorization input is invalid.",
    );
  }
  const commandId = normalizeRequiredText(input.commandId);
  if (!commandId
    || Array.from(commandId).length > INTERNAL_ID_MAX_CODE_POINTS
    || /\p{Cc}/u.test(commandId)) {
    return tossRefundAuthorizationFailure("INVALID_COMMAND_ID", "Command id is invalid.");
  }
  if (!isPositivePostgresInteger(input.leaseGeneration)) {
    return tossRefundAuthorizationFailure(
      "INVALID_LEASE_GENERATION",
      "Lease generation is invalid.",
    );
  }
  const leaseToken = normalizeRequiredText(input.leaseToken);
  if (!leaseToken || !/^[0-9a-f]{64}$/.test(leaseToken)) {
    return tossRefundAuthorizationFailure("INVALID_LEASE_TOKEN", "Lease token is invalid.");
  }
  return Object.freeze({
    ok: true,
    input: Object.freeze({ commandId, leaseGeneration: input.leaseGeneration, leaseToken }),
  });
}

export function tossRefundAuthorizationSuccess(
  authorization: TossRefundDispatchAuthorization,
  replayed: boolean,
): TossRefundAuthorizationSuccess {
  return Object.freeze({
    ok: true,
    replayed,
    authorization: Object.freeze({ ...authorization }),
  });
}

export function tossRefundAuthorizationFailure(
  code: TossRefundAuthorizationFailureCode,
  message: string,
): TossRefundAuthorizationFailure {
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
  return keys.every((key) => {
    if (typeof key !== "string" || !INPUT_FIELDS.some((field) => field === key)) return false;
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined
      && descriptor.enumerable
      && Object.prototype.hasOwnProperty.call(descriptor, "value");
  });
}

function normalizeRequiredText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function isPositivePostgresInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 1
    && value <= POSTGRES_INT_MAX;
}
