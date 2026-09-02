export const SYNTHETIC_SALE_MARKET_PRECONDITION_COMPLETE =
  "SYNTHETIC_SALE_MARKET_PRECONDITION_COMPLETE" as const;
export const SYNTHETIC_SALE_ROLE_GRANTS_COMPLETE =
  "SYNTHETIC_SALE_ROLE_GRANTS_COMPLETE" as const;
export const CANARY_REFUND_ROLE_GRANTS_RESTORED =
  "CANARY_REFUND_ROLE_GRANTS_RESTORED" as const;
export const EXACT_EFFECTIVE_PRIVILEGES_VERIFIED =
  "EXACT_EFFECTIVE_PRIVILEGES_VERIFIED" as const;

const SYNTHETIC_SALE_SERVICE = "mira-p3e-sbx-synthetic-sale" as const;

type MarketPreconditionEvidence = Readonly<{
  code: typeof SYNTHETIC_SALE_MARKET_PRECONDITION_COMPLETE;
  postconditionRowCount: 1;
}>;

type DatabaseAuthorityEvidence = Readonly<{
  code: typeof SYNTHETIC_SALE_ROLE_GRANTS_COMPLETE;
  postcondition: typeof EXACT_EFFECTIVE_PRIVILEGES_VERIFIED;
}>;

type CloudRuntimeAuthorityEvidence = Readonly<{
  service: typeof SYNTHETIC_SALE_SERVICE;
  authority: "EXACT";
  ready: true;
}>;

type RuntimeRetirementEvidence = Readonly<{
  service: typeof SYNTHETIC_SALE_SERVICE;
  authority: "ABSENT";
  purposeIamResidue: 0;
}>;

type CanonicalAuthorityEvidence = Readonly<{
  code: typeof CANARY_REFUND_ROLE_GRANTS_RESTORED;
  postcondition: typeof EXACT_EFFECTIVE_PRIVILEGES_VERIFIED;
}>;

export type SyntheticSaleAuthorityOperation = Readonly<{
  operationId: string;
}>;

export type SyntheticSaleAuthorityLifecycleDependencies = Readonly<{
  materializeMarketPrecondition: () => Promise<unknown>;
  applySyntheticSaleRoleGrants: () => Promise<unknown>;
  materializeRuntime: (operation: SyntheticSaleAuthorityOperation) => Promise<void>;
  readCloudRuntimeAuthority: (
    operation: SyntheticSaleAuthorityOperation,
  ) => Promise<unknown>;
  retireRuntime: (operation: SyntheticSaleAuthorityOperation) => Promise<unknown>;
  restoreCanonicalRefundRoleGrants: () => Promise<unknown>;
}>;

export type SyntheticSaleLiveAuthority = Readonly<{
  operationId: string;
  status: "READY_FOR_HUMAN_PAY_CONFIRMATION";
  marketPrecondition: "EXACT";
  databaseRuntimeAuthority: "EXACT";
  cloudRuntimeAuthority: "EXACT";
  liveAuthority: "EXACT";
  payBoundary: "HUMAN_CONFIRMATION_REQUIRED";
  automaticPaymentActions: 0;
}>;

export type SyntheticSaleCanonicalSafeState = Readonly<{
  operationId: string;
  status: "CANONICAL_SAFE_STATE";
  cloudRuntimeAuthority: "ABSENT";
  databaseRuntimeAuthority: "REFUND_ONLY_EXACT";
  purposeIamResidue: 0;
}>;

export type SyntheticSaleAuthorityDerivation = Readonly<
  | { status: "EXACT" }
  | {
      status: "NOT_READY";
      reason: "DATABASE_RUNTIME_AUTHORITY_REQUIRED" | "CLOUD_RUNTIME_AUTHORITY_REQUIRED";
    }
>;

export type SyntheticSaleAuthorityLifecycleErrorCode =
  | "SYNTHETIC_SALE_OPERATION_ID_INVALID"
  | "SYNTHETIC_SALE_MARKET_PRECONDITION_REQUIRED"
  | "SYNTHETIC_SALE_DATABASE_AUTHORITY_REQUIRED"
  | "SYNTHETIC_SALE_CLOUD_AUTHORITY_REQUIRED"
  | "SYNTHETIC_SALE_RUNTIME_RETIREMENT_REQUIRED"
  | "CANONICAL_REFUND_AUTHORITY_RESTORE_REQUIRED"
  | "SYNTHETIC_SALE_PREPARATION_FAILED_CLEANED";

export class SyntheticSaleAuthorityLifecycleError extends Error {
  readonly code: SyntheticSaleAuthorityLifecycleErrorCode;

  constructor(code: SyntheticSaleAuthorityLifecycleErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.name = "SyntheticSaleAuthorityLifecycleError";
    this.code = code;
  }
}

export function deriveSyntheticSaleLiveAuthority(
  databaseEvidence: unknown,
  cloudEvidence: unknown,
): SyntheticSaleAuthorityDerivation {
  if (!isDatabaseAuthorityEvidence(databaseEvidence)) {
    return Object.freeze({
      status: "NOT_READY",
      reason: "DATABASE_RUNTIME_AUTHORITY_REQUIRED",
    });
  }
  if (!isCloudRuntimeAuthorityEvidence(cloudEvidence)) {
    return Object.freeze({
      status: "NOT_READY",
      reason: "CLOUD_RUNTIME_AUTHORITY_REQUIRED",
    });
  }
  return Object.freeze({ status: "EXACT" });
}

export async function prepareSyntheticSaleLiveAuthority(
  operationId: string,
  dependencies: SyntheticSaleAuthorityLifecycleDependencies,
): Promise<SyntheticSaleLiveAuthority> {
  const operation = exactOperation(operationId);
  const market = await dependencies.materializeMarketPrecondition();
  if (!isMarketPreconditionEvidence(market)) {
    throw lifecycleError("SYNTHETIC_SALE_MARKET_PRECONDITION_REQUIRED");
  }

  const database = await dependencies.applySyntheticSaleRoleGrants();
  if (!isDatabaseAuthorityEvidence(database)) {
    throw lifecycleError("SYNTHETIC_SALE_DATABASE_AUTHORITY_REQUIRED");
  }

  try {
    await dependencies.materializeRuntime(operation);
    const cloud = await dependencies.readCloudRuntimeAuthority(operation);
    const authority = deriveSyntheticSaleLiveAuthority(database, cloud);
    if (authority.status !== "EXACT") {
      throw lifecycleError("SYNTHETIC_SALE_CLOUD_AUTHORITY_REQUIRED");
    }
    return Object.freeze({
      operationId,
      status: "READY_FOR_HUMAN_PAY_CONFIRMATION",
      marketPrecondition: "EXACT",
      databaseRuntimeAuthority: "EXACT",
      cloudRuntimeAuthority: "EXACT",
      liveAuthority: "EXACT",
      payBoundary: "HUMAN_CONFIRMATION_REQUIRED",
      automaticPaymentActions: 0,
    });
  } catch (error) {
    await restoreCanonicalSafeState(operation, dependencies);
    throw lifecycleError("SYNTHETIC_SALE_PREPARATION_FAILED_CLEANED", error);
  }
}

export async function stopSyntheticSaleLiveAuthority(
  prepared: SyntheticSaleLiveAuthority,
  dependencies: SyntheticSaleAuthorityLifecycleDependencies,
): Promise<SyntheticSaleCanonicalSafeState> {
  if (prepared.status !== "READY_FOR_HUMAN_PAY_CONFIRMATION"
    || prepared.liveAuthority !== "EXACT"
    || prepared.payBoundary !== "HUMAN_CONFIRMATION_REQUIRED"
    || prepared.automaticPaymentActions !== 0) {
    throw lifecycleError("SYNTHETIC_SALE_CLOUD_AUTHORITY_REQUIRED");
  }
  return restoreCanonicalSafeState(exactOperation(prepared.operationId), dependencies);
}

async function restoreCanonicalSafeState(
  operation: SyntheticSaleAuthorityOperation,
  dependencies: SyntheticSaleAuthorityLifecycleDependencies,
): Promise<SyntheticSaleCanonicalSafeState> {
  let retired: unknown;
  try {
    retired = await dependencies.retireRuntime(operation);
  } catch (error) {
    throw lifecycleError("SYNTHETIC_SALE_RUNTIME_RETIREMENT_REQUIRED", error);
  }
  if (!isRuntimeRetirementEvidence(retired)) {
    throw lifecycleError("SYNTHETIC_SALE_RUNTIME_RETIREMENT_REQUIRED");
  }

  let restored: unknown;
  try {
    restored = await dependencies.restoreCanonicalRefundRoleGrants();
  } catch (error) {
    throw lifecycleError("CANONICAL_REFUND_AUTHORITY_RESTORE_REQUIRED", error);
  }
  if (!isCanonicalAuthorityEvidence(restored)) {
    throw lifecycleError("CANONICAL_REFUND_AUTHORITY_RESTORE_REQUIRED");
  }

  return Object.freeze({
    operationId: operation.operationId,
    status: "CANONICAL_SAFE_STATE",
    cloudRuntimeAuthority: "ABSENT",
    databaseRuntimeAuthority: "REFUND_ONLY_EXACT",
    purposeIamResidue: 0,
  });
}

function exactOperation(operationId: string): SyntheticSaleAuthorityOperation {
  if (!/^[0-9a-f]{32}$/u.test(operationId)) {
    throw lifecycleError("SYNTHETIC_SALE_OPERATION_ID_INVALID");
  }
  return Object.freeze({ operationId });
}

function isMarketPreconditionEvidence(value: unknown): value is MarketPreconditionEvidence {
  return isRecord(value)
    && value.code === SYNTHETIC_SALE_MARKET_PRECONDITION_COMPLETE
    && value.postconditionRowCount === 1;
}

function isDatabaseAuthorityEvidence(value: unknown): value is DatabaseAuthorityEvidence {
  return isRecord(value)
    && value.code === SYNTHETIC_SALE_ROLE_GRANTS_COMPLETE
    && value.postcondition === EXACT_EFFECTIVE_PRIVILEGES_VERIFIED;
}

function isCloudRuntimeAuthorityEvidence(value: unknown): value is CloudRuntimeAuthorityEvidence {
  return isRecord(value)
    && value.service === SYNTHETIC_SALE_SERVICE
    && value.authority === "EXACT"
    && value.ready === true;
}

function isRuntimeRetirementEvidence(value: unknown): value is RuntimeRetirementEvidence {
  return isRecord(value)
    && value.service === SYNTHETIC_SALE_SERVICE
    && value.authority === "ABSENT"
    && value.purposeIamResidue === 0;
}

function isCanonicalAuthorityEvidence(value: unknown): value is CanonicalAuthorityEvidence {
  return isRecord(value)
    && value.code === CANARY_REFUND_ROLE_GRANTS_RESTORED
    && value.postcondition === EXACT_EFFECTIVE_PRIVILEGES_VERIFIED;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lifecycleError(
  code: SyntheticSaleAuthorityLifecycleErrorCode,
  cause?: unknown,
): SyntheticSaleAuthorityLifecycleError {
  return new SyntheticSaleAuthorityLifecycleError(code, cause === undefined ? undefined : { cause });
}
