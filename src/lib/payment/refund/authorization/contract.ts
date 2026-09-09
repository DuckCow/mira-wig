export const REFUND_AUTHORIZATION_MIGRATION = "20260909090000_refund_execution_authorization";
export const REFUND_REENTRY_OPERATION = "EXIMBAY_SANDBOX_BOUND_ORDINAL_ZERO_REENTRY";
export const REFUND_AUTHORIZATION_TTL_MS = 30 * 60 * 1000;
export const REFUND_AUTHORIZATION_GATE = "MIRA_REFUND_AUTHORIZATION_ENABLED";
export type AuthorizationEnv = Readonly<Record<string, string | undefined>>;
export type AuthorizationErrorCode =
  | "FEATURE_DISABLED" | "CONFIG_INVALID" | "UNAUTHORIZED" | "INVALID_INPUT"
  | "NOT_FOUND" | "TARGET_INELIGIBLE" | "TARGET_MISMATCH" | "GENERATION_MISMATCH"
  | "CONTACTED_RECOVERY_REQUIRED" | "RELEASE_MISMATCH" | "EXECUTION_UNVERIFIED"
  | "IDEMPOTENCY_CONFLICT" | "AUTHORIZATION_CONFLICT" | "ALREADY_CONSUMED"
  | "REVOKED" | "EXPIRED" | "PERSISTENCE_CONFLICT";

export class RefundAuthorizationError extends Error {
  constructor(readonly code: AuthorizationErrorCode) {
    super(code);
    this.name = "RefundAuthorizationError";
  }
}

export function requireAuthorizationEnabled(env: AuthorizationEnv): void {
  if (env[REFUND_AUTHORIZATION_GATE] !== "ENABLED") {
    throw new RefundAuthorizationError("FEATURE_DISABLED");
  }
}

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function exactFields(value: unknown, required: readonly string[], optional: readonly string[] = []): value is Record<string, unknown> {
  if (!record(value)) return false;
  return required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}

export function identifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,255}$/u.test(value);
}

export function digest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

export function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value);
}

export type IssueRefundAuthorizationInput = Readonly<{
  issuanceRequestId: string;
  commandId: string;
  expectedPredecessorGeneration: number;
  confirmedTargetBindingDigest: string;
  releasePolicyDigest: string;
}>;

export function parseIssueInput(value: unknown): IssueRefundAuthorizationInput {
  const fields = ["issuanceRequestId", "commandId", "expectedPredecessorGeneration", "confirmedTargetBindingDigest", "releasePolicyDigest"];
  if (!exactFields(value, fields)) throw new RefundAuthorizationError("INVALID_INPUT");
  if (!uuid(value.issuanceRequestId) || !identifier(value.commandId)) throw new RefundAuthorizationError("INVALID_INPUT");
  if (!digest(value.confirmedTargetBindingDigest) || !digest(value.releasePolicyDigest)) throw new RefundAuthorizationError("INVALID_INPUT");
  if (!generation(value.expectedPredecessorGeneration)) throw new RefundAuthorizationError("INVALID_INPUT");
  return {
    issuanceRequestId: value.issuanceRequestId, commandId: value.commandId,
    expectedPredecessorGeneration: value.expectedPredecessorGeneration,
    confirmedTargetBindingDigest: value.confirmedTargetBindingDigest,
    releasePolicyDigest: value.releasePolicyDigest,
  };
}

export function generation(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 2_147_483_646;
}

export function parseGrantInput(value: unknown): string {
  if (!exactFields(value, ["grantId"]) || !identifier(value.grantId)) throw new RefundAuthorizationError("INVALID_INPUT");
  return value.grantId;
}

export function parseReadInput(value: unknown): Readonly<{ commandId: string; pageSize: number; cursor?: string }> {
  if (!exactFields(value, ["commandId"], ["cursor", "pageSize"])) throw new RefundAuthorizationError("INVALID_INPUT");
  if (!identifier(value.commandId)) throw new RefundAuthorizationError("INVALID_INPUT");
  const pageSize = value.pageSize ?? 20;
  if (!validPageSize(pageSize)) throw new RefundAuthorizationError("INVALID_INPUT");
  if (value.cursor !== undefined && !identifier(value.cursor)) throw new RefundAuthorizationError("INVALID_INPUT");
  return { commandId: value.commandId, pageSize, cursor: value.cursor };
}

function validPageSize(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 50;
}
