import { Prisma, type PrismaClient } from "@prisma/client";
import {
  normalizeReclaimUncontactedRefundExecutionInput,
  type ReclaimUncontactedRefundExecutionInput,
  type ReclaimUncontactedRefundExecutionResult,
} from "./uncontacted-recovery-contract";
import {
  performUncontactedRefundExecutionRecovery,
  rereadUncontactedRefundExecutionAfterConflict,
  UncontactedRecoveryCasConflictError,
} from "./uncontacted-recovery-persistence";

type ActivationEnv = Readonly<Record<string, string | undefined>>;

export async function reclaimUncontactedRefundExecution(
  client: PrismaClient,
  input: ReclaimUncontactedRefundExecutionInput,
  env: ActivationEnv = process.env,
): Promise<ReclaimUncontactedRefundExecutionResult> {
  const normalized = normalizeReclaimUncontactedRefundExecutionInput(input);
  if (!normalized.ok) return normalized;
  try {
    return await performUncontactedRefundExecutionRecovery(client, normalized.input, env);
  } catch (error) {
    if (error instanceof UncontactedRecoveryCasConflictError) {
      return rereadUncontactedRefundExecutionAfterConflict(
        client,
        normalized.input,
        "LEASE_CONFLICT",
      );
    }
    if (isDatabaseWriteError(error)) {
      return rereadUncontactedRefundExecutionAfterConflict(
        client,
        normalized.input,
        "PERSISTENCE_CONFLICT",
      );
    }
    throw error;
  }
}

function isDatabaseWriteError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError
    || (error instanceof Error && error.name === "DriverAdapterError");
}

export type {
  ReclaimUncontactedRefundExecutionFailure,
  ReclaimUncontactedRefundExecutionFailureCode,
  ReclaimUncontactedRefundExecutionInput,
  ReclaimUncontactedRefundExecutionResult,
} from "./uncontacted-recovery-contract";
