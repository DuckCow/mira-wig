import type { PrismaClient } from "@prisma/client";
import { acquireRefundExecutionLease } from "./acquire-lease";
import { reclaimUncontactedRefundExecution } from "./reclaim-uncontacted-execution";
import type { RefundExecutionWorkerCandidate } from "./worker-allocation";
import {
  classifyAcquireWorkerFailure,
  classifyAuthorizationWorkerFailure,
  classifyContactWorkerFailure,
  classifyRecoveryWorkerFailure,
  classifyReclaimWorkerFailure,
  classifyWorkerSuccess,
  type RefundExecutionWorkerRouteOutcome,
} from "./worker-result-classification";
import { createTossRefundExecutionAuthorizer } from "./providers/toss/refund-authorization-orchestrator";
import type { TossRefundCancellationPort } from "./providers/toss/refund-cancellation-http";
import { createTossRefundContactExecutor } from "./providers/toss/refund-contact-orchestrator";
import type { TossRefundLookupPort } from "./providers/toss/refund-lookup-http";
import { createTossRefundRecoveryOperation } from "./providers/toss/refund-recovery-orchestrator";

type ActivationEnv = Readonly<Record<string, string | undefined>>;

export type RefundExecutionWorkerDependencies = Readonly<{
  lookup: TossRefundLookupPort;
  cancellation: TossRefundCancellationPort;
}>;

export type RefundExecutionWorkerRouter = (
  client: PrismaClient,
  candidate: RefundExecutionWorkerCandidate,
  workerOwner: string,
  env: ActivationEnv,
) => Promise<RefundExecutionWorkerRouteOutcome>;

export function createRefundExecutionWorkerRouter(
  dependencies: RefundExecutionWorkerDependencies,
): RefundExecutionWorkerRouter {
  const authorize = createTossRefundExecutionAuthorizer({ lookup: dependencies.lookup });
  const contact = createTossRefundContactExecutor(dependencies);
  const recover = createTossRefundRecoveryOperation(dependencies);

  return async (client, candidate, workerOwner, env) => {
    if (candidate.candidateClass === "CONTACTED") {
      const result = await recover(client, {
        commandId: candidate.commandId,
        recoveryOwner: workerOwner,
      }, env);
      return result.ok
        ? classifyWorkerSuccess(result.replayed)
        : classifyRecoveryWorkerFailure(result.code);
    }

    if (candidate.candidateClass === "READY") {
      const lease = await acquireRefundExecutionLease(client, {
        commandId: candidate.commandId,
        leaseOwner: workerOwner,
      }, env);
      if (!lease.ok) return classifyAcquireWorkerFailure(lease.code);
      return continueLeasedRefundExecution(client, lease.lease, authorize, contact, env);
    }

    const lease = await reclaimUncontactedRefundExecution(client, {
      commandId: candidate.commandId,
      recoveryOwner: workerOwner,
    }, env);
    if (!lease.ok) return classifyReclaimWorkerFailure(lease.code);
    return continueLeasedRefundExecution(client, lease.lease, authorize, contact, env);
  };
}

async function continueLeasedRefundExecution(
  client: PrismaClient,
  lease: Readonly<{ commandId: string; leaseGeneration: number; leaseToken: string }>,
  authorize: ReturnType<typeof createTossRefundExecutionAuthorizer>,
  contact: ReturnType<typeof createTossRefundContactExecutor>,
  env: ActivationEnv,
): Promise<RefundExecutionWorkerRouteOutcome> {
  const input = Object.freeze({
    commandId: lease.commandId,
    leaseGeneration: lease.leaseGeneration,
    leaseToken: lease.leaseToken,
  });
  const authorization = await authorize(client, input, env);
  if (!authorization.ok) return classifyAuthorizationWorkerFailure(authorization.code);
  const result = await contact(client, input, env);
  return result.ok
    ? classifyWorkerSuccess(result.replayed)
    : classifyContactWorkerFailure(result.code);
}
