import { PaymentProvider, type PrismaClient } from "@prisma/client";
import { acquireRefundExecutionLease } from "./acquire-lease";
import { reclaimUncontactedRefundExecution } from "./reclaim-uncontacted-execution";
import {
  isRefundExecutionEximbayRoutingEnabled,
  isRefundExecutionWorkerEnabled,
  RefundExecutionActivationConfigError,
} from "./execution-activation";
import type { RefundExecutionWorkerCandidate } from "./worker-allocation";
import {
  classifyAcquireWorkerFailure,
  classifyAuthorizationWorkerFailure,
  classifyContactWorkerFailure,
  classifyEximbayAuthorizationWorkerFailure,
  classifyEximbayContactWorkerResult,
  classifyEximbayReconciliationWorkerResult,
  classifyRecoveryWorkerFailure,
  classifyReclaimWorkerFailure,
  classifyUnavailableWorkerRoute,
  classifyUnsupportedWorkerProvider,
  classifyWorkerSuccess,
  type RefundExecutionWorkerRouteOutcome,
} from "./worker-result-classification";
import { createTossRefundExecutionAuthorizer } from "./providers/toss/refund-authorization-orchestrator";
import type { TossRefundCancellationPort } from "./providers/toss/refund-cancellation-http";
import { createTossRefundContactExecutor } from "./providers/toss/refund-contact-orchestrator";
import type { TossRefundLookupPort } from "./providers/toss/refund-lookup-http";
import { createTossRefundRecoveryOperation } from "./providers/toss/refund-recovery-orchestrator";
import {
  createEximbayFirstRefundDispatchAuthorizer,
  type EximbayFirstRefundAuthorizerDependencies,
} from "./providers/eximbay/authorize-first-dispatch";
import {
  createEximbayRefundContactExecutor,
  type EximbayRefundContactDependencies,
} from "./providers/eximbay/execute-contact";
import {
  createEximbayRefundReconciler,
  type EximbayRefundReconciliationDependencies,
} from "./providers/eximbay/reconcile-refund";

type ActivationEnv = Readonly<Record<string, string | undefined>>;

export type RefundExecutionWorkerDependencies = Readonly<{
  lookup: TossRefundLookupPort;
  cancellation: TossRefundCancellationPort;
  eximbay?: EximbayRefundWorkerDependencies;
}>;

export type EximbayRefundWorkerDependencies = Readonly<{
  config: EximbayFirstRefundAuthorizerDependencies["config"];
  retrieve: EximbayFirstRefundAuthorizerDependencies["retrieve"];
  cancellation: EximbayRefundContactDependencies["cancel"];
  lookup: EximbayRefundReconciliationDependencies["lookup"];
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
  const eximbay = dependencies.eximbay;
  const eximbayAuthorize = eximbay && createEximbayFirstRefundDispatchAuthorizer({
    config: eximbay.config,
    retrieve: eximbay.retrieve,
  });
  const eximbayContact = eximbay && createEximbayRefundContactExecutor({
    config: eximbay.config,
    cancel: eximbay.cancellation,
  });
  const eximbayReconcile = eximbay && createEximbayRefundReconciler({
    config: eximbay.config,
    lookup: eximbay.lookup,
  });

  return (client, candidate, workerOwner, env) => {
    if (candidate.provider === PaymentProvider.EXIMBAY) {
      return routeAdmittedEximbayCandidate(
        client,
        candidate,
        workerOwner,
        env,
        eximbayAuthorize,
        eximbayContact,
        eximbayReconcile,
      );
    }
    if (candidate.provider !== PaymentProvider.TOSS) {
      return Promise.resolve(classifyUnsupportedWorkerProvider());
    }
    return routeTossCandidate(
      client, candidate, workerOwner, env, authorize, contact, recover,
    );
  };
}

async function routeAdmittedEximbayCandidate(
  client: PrismaClient,
  candidate: RefundExecutionWorkerCandidate,
  workerOwner: string,
  env: ActivationEnv,
  authorize: ReturnType<typeof createEximbayFirstRefundDispatchAuthorizer> | undefined,
  contact: ReturnType<typeof createEximbayRefundContactExecutor> | undefined,
  reconcile: ReturnType<typeof createEximbayRefundReconciler> | undefined,
): Promise<RefundExecutionWorkerRouteOutcome> {
  const admission = eximbayRouteAdmission(env);
  if (admission) return admission;
  if (!authorize || !contact || !reconcile) return classifyUnavailableWorkerRoute();
  return routeEximbayCandidate(
    client, candidate, workerOwner, env, authorize, contact, reconcile,
  );
}

function eximbayRouteAdmission(
  env: ActivationEnv,
): RefundExecutionWorkerRouteOutcome | null {
  try {
    return isRefundExecutionWorkerEnabled(env) && isRefundExecutionEximbayRoutingEnabled(env)
      ? null
      : classifyUnavailableWorkerRoute();
  } catch (error) {
    if (error instanceof RefundExecutionActivationConfigError) {
      return classifyAcquireWorkerFailure("CONFIG_INVALID");
    }
    throw error;
  }
}

async function routeTossCandidate(
  client: PrismaClient,
  candidate: RefundExecutionWorkerCandidate,
  workerOwner: string,
  env: ActivationEnv,
  authorize: ReturnType<typeof createTossRefundExecutionAuthorizer>,
  contact: ReturnType<typeof createTossRefundContactExecutor>,
  recover: ReturnType<typeof createTossRefundRecoveryOperation>,
): Promise<RefundExecutionWorkerRouteOutcome> {
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
  if (lease.recoveredState !== "ORDINAL_ZERO") {
    return classifyUnsupportedWorkerProvider();
  }
  return continueLeasedRefundExecution(client, lease.lease, authorize, contact, env);
}

async function routeEximbayCandidate(
  client: PrismaClient,
  candidate: RefundExecutionWorkerCandidate,
  workerOwner: string,
  env: ActivationEnv,
  authorize: ReturnType<typeof createEximbayFirstRefundDispatchAuthorizer>,
  contact: ReturnType<typeof createEximbayRefundContactExecutor>,
  reconcile: ReturnType<typeof createEximbayRefundReconciler>,
): Promise<RefundExecutionWorkerRouteOutcome> {
  if (candidate.candidateClass === "CONTACTED") {
    const result = await reconcile(client, {
      commandId: candidate.commandId,
      recoveryOwner: workerOwner,
    });
    if (!result.ok) return classifyEximbayReconciliationWorkerResult(result);
    if (result.state !== "R2_AUTHORIZED") {
      return classifyEximbayReconciliationWorkerResult(result);
    }
    if (!result.authorization) return classifyUnsupportedWorkerProvider();
    const continued = await contact(client, result.authorization);
    return classifyEximbayContactWorkerResult(continued);
  }
  if (candidate.candidateClass === "READY") {
    const lease = await acquireRefundExecutionLease(client, {
      commandId: candidate.commandId,
      leaseOwner: workerOwner,
    }, env);
    if (!lease.ok) return classifyAcquireWorkerFailure(lease.code);
    return continueLeasedEximbayRefundExecution(client, lease.lease, authorize, contact);
  }
  const lease = await reclaimUncontactedRefundExecution(client, {
    commandId: candidate.commandId,
    recoveryOwner: workerOwner,
  }, env);
  if (!lease.ok) return classifyReclaimWorkerFailure(lease.code);
  return continueReclaimedEximbayRefundExecution(client, lease, authorize, contact);
}

async function continueReclaimedEximbayRefundExecution(
  client: PrismaClient,
  reclaimed: Extract<Awaited<ReturnType<typeof reclaimUncontactedRefundExecution>>, { ok: true }>,
  authorize: ReturnType<typeof createEximbayFirstRefundDispatchAuthorizer>,
  contact: ReturnType<typeof createEximbayRefundContactExecutor>,
): Promise<RefundExecutionWorkerRouteOutcome> {
  if (reclaimed.recoveredState === "AUTHORIZED_EXIMBAY_R1") {
    return classifyEximbayContactWorkerResult(await contact(client, {
      commandId: reclaimed.lease.commandId,
      dispatchAttempt: 1,
      leaseGeneration: reclaimed.lease.leaseGeneration,
      leaseToken: reclaimed.lease.leaseToken,
    }));
  }
  return continueLeasedEximbayRefundExecution(client, reclaimed.lease, authorize, contact);
}

export async function continueLeasedEximbayRefundExecution(
  client: PrismaClient,
  lease: Readonly<{ commandId: string; leaseGeneration: number; leaseToken: string }>,
  authorize: ReturnType<typeof createEximbayFirstRefundDispatchAuthorizer>,
  contact: ReturnType<typeof createEximbayRefundContactExecutor>,
): Promise<RefundExecutionWorkerRouteOutcome> {
  const input = Object.freeze({
    commandId: lease.commandId,
    leaseGeneration: lease.leaseGeneration,
    leaseToken: lease.leaseToken,
  });
  const authorization = await authorize(client, input);
  if (!authorization.ok) {
    return classifyEximbayAuthorizationWorkerFailure(authorization.code);
  }
  return classifyEximbayContactWorkerResult(await contact(client, {
    ...input,
    dispatchAttempt: 1,
  }));
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
