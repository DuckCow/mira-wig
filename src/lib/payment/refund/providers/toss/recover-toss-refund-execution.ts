import type { PrismaClient } from "@prisma/client";
import type { TossRecoveryEnv } from "./refund-recovery-config";
import type {
  RecoverTossRefundExecutionInput,
  RecoverTossRefundExecutionResult,
} from "./refund-recovery-contract";
import { createTossRefundRecoveryOperation } from "./refund-recovery-orchestrator";
import { createTossRefundLookupPort } from "./refund-lookup-http";

export async function recoverTossRefundExecution(
  client: PrismaClient,
  input: RecoverTossRefundExecutionInput,
  env: TossRecoveryEnv = process.env,
): Promise<RecoverTossRefundExecutionResult> {
  return createTossRefundRecoveryOperation({
    lookup: createTossRefundLookupPort({ fetchFn: fetch }),
  })(client, input, env);
}

export type {
  RecoverTossRefundExecutionInput,
  RecoverTossRefundExecutionResult,
  RecoverTossRefundExecutionSuccess,
  TossRefundRecoveryFailure,
  TossRefundRecoveryFailureCode,
} from "./refund-recovery-contract";
