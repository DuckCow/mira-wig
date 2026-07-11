import type { RefundProviderRequest } from "./provider-port";

const INPUT_FIELDS = ["commandId", "leaseOwner", "leaseUntil", "now"] as const;
const LEASE_OWNER_MAX_CODE_POINTS = 255;
const POSTGRES_SAFE_MINIMUM_MS = Date.parse("-004711-01-01T00:00:00.000Z");

export type AuthorizeRefundDispatchInput = Readonly<{
  commandId: string;
  leaseOwner: string;
  leaseUntil: Date;
  now: Date;
}>;

export type NormalizedAuthorizeRefundDispatchInput = AuthorizeRefundDispatchInput;

export type AuthorizedRefundDispatch = Readonly<{
  commandId: string;
  refundAttemptId: string;
  dispatchAttempt: number;
  leaseUntil: Date;
  providerRequest: RefundProviderRequest;
}>;

export type AuthorizeRefundDispatchFailureCode =
  | "INVALID_COMMAND_ID"
  | "INVALID_LEASE_OWNER"
  | "INVALID_LEASE_DEADLINE"
  | "COMMAND_NOT_FOUND"
  | "COMMAND_NOT_READY"
  | "COMMAND_NOT_YET_AVAILABLE"
  | "COMMAND_STATE_CONFLICT"
  | "DISPATCH_ATTEMPT_EXHAUSTED"
  | "REFUND_LEDGER_INCONSISTENT"
  | "PERSISTENCE_CONFLICT";

export type AuthorizeRefundDispatchFailure = Readonly<{
  ok: false;
  code: AuthorizeRefundDispatchFailureCode;
  message: string;
}>;

export type AuthorizeRefundDispatchResult =
  | Readonly<{ ok: true; dispatch: AuthorizedRefundDispatch }>
  | AuthorizeRefundDispatchFailure;

export function normalizeAuthorizeRefundDispatchInput(
  input: AuthorizeRefundDispatchInput,
): { ok: true; input: NormalizedAuthorizeRefundDispatchInput } | AuthorizeRefundDispatchFailure {
  if (!hasExactFields(input, INPUT_FIELDS)) return dispatchFailure("INVALID_COMMAND_ID", "Dispatch input is invalid.");
  const commandId = normalizeRequiredText(input.commandId);
  if (!commandId) return dispatchFailure("INVALID_COMMAND_ID", "Command id is required.");
  const leaseOwner = normalizeRequiredText(input.leaseOwner);
  if (!leaseOwner || Array.from(leaseOwner).length > LEASE_OWNER_MAX_CODE_POINTS) {
    return dispatchFailure("INVALID_LEASE_OWNER", "Lease owner is invalid.");
  }
  if (!isPostgresSafeDate(input.now) || !isPostgresSafeDate(input.leaseUntil)) {
    return dispatchFailure("INVALID_LEASE_DEADLINE", "Lease deadline is invalid.");
  }
  if (input.leaseUntil.getTime() <= input.now.getTime()) {
    return dispatchFailure("INVALID_LEASE_DEADLINE", "Lease deadline must be after authorization time.");
  }
  return {
    ok: true,
    input: Object.freeze({
      commandId,
      leaseOwner,
      leaseUntil: new Date(input.leaseUntil.getTime()),
      now: new Date(input.now.getTime()),
    }),
  };
}

export function dispatchSuccess(
  commandId: string,
  refundAttemptId: string,
  dispatchAttempt: number,
  leaseUntil: Date,
  providerRequest: RefundProviderRequest,
): Extract<AuthorizeRefundDispatchResult, { ok: true }> {
  return {
    ok: true,
    dispatch: Object.freeze({
      commandId,
      refundAttemptId,
      dispatchAttempt,
      leaseUntil: new Date(leaseUntil.getTime()),
      providerRequest,
    }),
  };
}

export function dispatchFailure(
  code: AuthorizeRefundDispatchFailureCode,
  message: string,
): AuthorizeRefundDispatchFailure {
  return Object.freeze({ ok: false, code, message });
}

function normalizeRequiredText(value: string): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function hasExactFields(value: object, fields: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === fields.length
    && keys.every((key) => typeof key === "string" && fields.includes(key));
}

function isPostgresSafeDate(value: Date): boolean {
  return value instanceof Date
    && Number.isFinite(value.getTime())
    && value.getTime() >= POSTGRES_SAFE_MINIMUM_MS;
}
