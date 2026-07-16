import { createHash } from "crypto";
import {
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptStatus,
  RefundExecutionCommandEventType,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  type RefundExecutionCommandEvent,
  type RefundExecutionDispatchAttempt,
} from "@prisma/client";
import {
  validateInitialRefundExecutionSuitability,
  type InitialExecutionAggregate,
  type InitialExecutionTarget,
} from "./execution-suitability";
import type { CanonicalRefundRequestFacts } from "./refund-request-fingerprint";

const INPUT_FIELDS = ["commandId", "leaseGeneration", "leaseToken"] as const;
const POSTGRES_INT_MAX = 2_147_483_647;

export type AuthorizeRefundExecutionDispatchInput = Readonly<{
  commandId: string;
  leaseGeneration: number;
  leaseToken: string;
}>;

export type NormalizedAuthorizeRefundExecutionDispatchInput =
  AuthorizeRefundExecutionDispatchInput;

export type RefundDispatchAuthorizationHandle = Readonly<{
  commandId: string;
  refundAttemptId: string;
  dispatchAttempt: 1;
  leaseGeneration: number;
  authorizedAt: string;
  provider: PaymentProvider;
  mode: PaymentMode;
  providerPaymentReference: string;
  amountMinor: number;
  currency: string;
  providerOperationKey: string;
  requestFingerprint: string;
}>;

export type RefundDispatchAuthorizationFailureCode =
  | "FEATURE_DISABLED"
  | "CONFIG_INVALID"
  | "INVALID_COMMAND_ID"
  | "INVALID_LEASE_GENERATION"
  | "INVALID_LEASE_TOKEN"
  | "COMMAND_NOT_FOUND_OR_INELIGIBLE"
  | "LEASE_FENCE_MISMATCH"
  | "LEASE_EXPIRED"
  | "NOT_AUTHORIZATION_READY"
  | "CONTACT_RECOVERY_REQUIRED"
  | "LEDGER_INCONSISTENT"
  | "PERSISTENCE_CONFLICT";

export type RefundDispatchAuthorizationFailure = Readonly<{
  ok: false;
  code: RefundDispatchAuthorizationFailureCode;
  message: string;
}>;

export type RefundDispatchAuthorizationSuccess = Readonly<{
  ok: true;
  replayed: boolean;
  authorization: RefundDispatchAuthorizationHandle;
}>;

export type AuthorizeRefundExecutionDispatchResult =
  | RefundDispatchAuthorizationSuccess
  | RefundDispatchAuthorizationFailure;

export type NormalizeAuthorizeRefundExecutionDispatchInputResult =
  | Readonly<{
      ok: true;
      input: NormalizedAuthorizeRefundExecutionDispatchInput;
    }>
  | RefundDispatchAuthorizationFailure;

export type DispatchAuthorizationContext = Readonly<{
  aggregate: InitialExecutionAggregate;
  target: InitialExecutionTarget;
  command: NonNullable<InitialExecutionTarget["executionCommand"]>;
}>;

export type DispatchAuthorizationHistory = Readonly<{
  events: readonly RefundExecutionCommandEvent[];
  dispatchAttempts: readonly RefundExecutionDispatchAttempt[];
  evidenceCount: number;
}>;

export type DispatchAuthorizationStructure =
  | Readonly<{ kind: "new" }>
  | Readonly<{ kind: "replay"; attempt: RefundExecutionDispatchAttempt }>
  | Readonly<{ kind: "contacted" }>
  | Readonly<{ kind: "malformed" }>;

export type AuthorizedRefundRequest = Readonly<{
  facts: CanonicalRefundRequestFacts;
  requestFingerprint: string;
}>;

export function normalizeAuthorizeRefundExecutionDispatchInput(
  input: unknown,
): NormalizeAuthorizeRefundExecutionDispatchInputResult {
  if (!hasExactEnumerableFields(input, INPUT_FIELDS)) {
    return dispatchAuthorizationFailure(
      "INVALID_COMMAND_ID",
      "Refund dispatch authorization input is invalid.",
    );
  }
  const commandId = normalizeRequiredText(input.commandId);
  if (!commandId) {
    return dispatchAuthorizationFailure("INVALID_COMMAND_ID", "Command id is invalid.");
  }
  if (!isValidLeaseGeneration(input.leaseGeneration)) {
    return dispatchAuthorizationFailure(
      "INVALID_LEASE_GENERATION",
      "Lease generation is invalid.",
    );
  }
  const leaseToken = normalizeRequiredText(input.leaseToken);
  if (!leaseToken || !/^[0-9a-f]{64}$/.test(leaseToken)) {
    return dispatchAuthorizationFailure("INVALID_LEASE_TOKEN", "Lease token is invalid.");
  }
  return Object.freeze({
    ok: true,
    input: Object.freeze({
      commandId,
      leaseGeneration: input.leaseGeneration,
      leaseToken,
    }),
  });
}

export function dispatchAuthorizationSuccess(
  authorization: RefundDispatchAuthorizationHandle,
  replayed: boolean,
): RefundDispatchAuthorizationSuccess {
  return Object.freeze({
    ok: true,
    replayed,
    authorization: Object.freeze({ ...authorization }),
  });
}

export function dispatchAuthorizationFailure(
  code: RefundDispatchAuthorizationFailureCode,
  message: string,
): RefundDispatchAuthorizationFailure {
  return Object.freeze({ ok: false, code, message });
}

export function identifyDispatchAuthorizationStructure(
  commandOrdinal: number,
  attempts: readonly RefundExecutionDispatchAttempt[],
): DispatchAuthorizationStructure {
  if (commandOrdinal === 0 && attempts.length === 0) return { kind: "new" };
  if (commandOrdinal !== 1 || attempts.length !== 1 || attempts[0].ordinal !== 1) {
    return { kind: "malformed" };
  }
  if (attempts[0].state === RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED) {
    return { kind: "contacted" };
  }
  return attempts[0].state === RefundExecutionDispatchAttemptState.AUTHORIZED
    ? { kind: "replay", attempt: attempts[0] }
    : { kind: "malformed" };
}

export function currentDispatchAuthorityFailure(
  command: DispatchAuthorizationContext["command"],
  input: NormalizedAuthorizeRefundExecutionDispatchInput,
  capturedAt: Date,
): "LEASE_FENCE_MISMATCH" | "LEASE_EXPIRED" | null {
  const digest = createHash("sha256").update(input.leaseToken, "utf8").digest("hex");
  if (command.status !== RefundExecutionCommandStatus.LEASED
    || command.leaseGeneration !== input.leaseGeneration
    || command.leaseTokenHash !== digest) return "LEASE_FENCE_MISMATCH";
  return command.leaseUntil && command.leaseUntil.getTime() <= capturedAt.getTime()
    ? "LEASE_EXPIRED"
    : null;
}

export function isMockSandboxAuthorization(context: DispatchAuthorizationContext): boolean {
  return context.target.provider === PaymentProvider.MOCK
    && context.target.mode === PaymentMode.SANDBOX;
}

export function isDispatchAuthorizationLedgerCoherent(
  context: DispatchAuthorizationContext,
  history: DispatchAuthorizationHistory,
  structure: DispatchAuthorizationStructure,
): boolean {
  return structure.kind !== "malformed"
    && hasCoherentAggregate(context)
    && hasCoherentLeaseProjection(context.command)
    && hasCoherentCurrentAcquisition(history.events, context.command)
    && history.evidenceCount === 0
    && context.target.providerRefundId === null;
}

export function matchesDispatchAuthorizationReplay(
  context: DispatchAuthorizationContext,
  attempt: RefundExecutionDispatchAttempt,
  request: AuthorizedRefundRequest,
): boolean {
  return [
    attempt.commandId === context.command.id,
    attempt.ordinal === 1,
    attempt.leaseGeneration === context.command.leaseGeneration,
    attempt.provider === request.facts.provider,
    attempt.mode === request.facts.mode,
    attempt.providerOperationKey === request.facts.providerOperationKey,
    attempt.requestFingerprint === request.requestFingerprint,
    attempt.state === RefundExecutionDispatchAttemptState.AUTHORIZED,
    attempt.contactMarkedAt === null,
  ].every(Boolean);
}

export function buildDispatchAuthorizationHandle(
  context: DispatchAuthorizationContext,
  authorizedAt: Date,
  request: AuthorizedRefundRequest,
): RefundDispatchAuthorizationHandle {
  return {
    commandId: context.command.id,
    refundAttemptId: context.target.id,
    dispatchAttempt: 1,
    leaseGeneration: context.command.leaseGeneration,
    authorizedAt: authorizedAt.toISOString(),
    provider: request.facts.provider,
    mode: request.facts.mode,
    providerPaymentReference: request.facts.providerPaymentReference,
    amountMinor: request.facts.amountMinor,
    currency: request.facts.currency,
    providerOperationKey: request.facts.providerOperationKey,
    requestFingerprint: request.requestFingerprint,
  };
}

function hasCoherentAggregate(context: DispatchAuthorizationContext): boolean {
  return context.aggregate.status === OrderStatus.REFUND_PENDING
    && context.target.status === RefundAttemptStatus.PROCESSING
    && context.aggregate.payment.status === PaymentAttemptStatus.SUCCEEDED
    && validateInitialRefundExecutionSuitability(
      context.aggregate,
      context.target,
      context.command,
    ).ok;
}

function hasCoherentLeaseProjection(
  command: DispatchAuthorizationContext["command"],
): boolean {
  return Boolean(command.leaseOwner?.trim())
    && command.leaseUntil instanceof Date
    && /^[0-9a-f]{64}$/.test(command.leaseTokenHash ?? "")
    && Number.isInteger(command.leaseGeneration)
    && command.leaseGeneration >= 1;
}

function hasCoherentCurrentAcquisition(
  events: readonly RefundExecutionCommandEvent[],
  command: DispatchAuthorizationContext["command"],
): boolean {
  const current = events.filter((event) => event.leaseGeneration === command.leaseGeneration);
  const acquired = current.filter((event) => (
    event.eventType === RefundExecutionCommandEventType.LEASE_ACQUIRED
  ));
  const released = current.filter((event) => (
    event.eventType === RefundExecutionCommandEventType.PRE_CONTACT_RELEASED
  ));
  return acquired.length === 1
    && released.length === 0
    && acquired[0].commandId === command.id
    && acquired[0].dispatchAttempt === 0
    && acquired[0].occurredAt instanceof Date;
}

function hasExactEnumerableFields(
  value: unknown,
  fields: readonly string[],
): value is Record<(typeof INPUT_FIELDS)[number], unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value).filter((key) => (
    Object.prototype.propertyIsEnumerable.call(value, key)
  ));
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
