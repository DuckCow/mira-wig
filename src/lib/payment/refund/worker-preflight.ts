import { PaymentProvider } from "@prisma/client";
import {
  RefundExecutionActivationConfigError,
} from "./execution-activation";
import {
  parseEximbayRefundWorkerConfig,
  type EximbayRefundWorkerConfigState,
} from "./providers/eximbay/refund-worker-config";
import {
  parseTossRefundCredentialConfig,
  TOSS_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING,
  TOSS_REFUND_SANDBOX_MERCHANT_BINDING,
  TOSS_REFUND_SANDBOX_SECRET_KEY,
} from "./providers/toss/refund-credential-config";
import { workerFailure, type RefundExecutionWorkerCycleFailure } from "./worker-contract";
import type {
  RefundExecutionWorkerCandidateClass,
  RefundExecutionWorkerCandidateQueues,
  RefundExecutionWorkerProvider,
} from "./worker-allocation";
import {
  contactedEximbayRefundExecutionWorkerRouteIsReady,
  contactedRefundExecutionWorkerLookupRouteIsReady,
  readyEximbayRefundExecutionWorkerRouteIsReady,
  readyRefundExecutionWorkerRouteIsReady,
  uncontactedEximbayRefundExecutionWorkerRouteIsReady,
  uncontactedRefundExecutionWorkerRouteIsReady,
} from "./worker-route-readiness";

type ActivationEnv = Readonly<Record<string, string | undefined>>;

type ProviderReadiness = Readonly<Record<RefundExecutionWorkerProvider, boolean>>;

export type RefundExecutionWorkerPreflight = Readonly<Record<
  RefundExecutionWorkerCandidateClass,
  ProviderReadiness
>>;

export type RefundExecutionWorkerPreflightResult =
  | Readonly<{ ok: true; readiness: RefundExecutionWorkerPreflight }>
  | RefundExecutionWorkerCycleFailure;

export function preflightRefundExecutionWorkerRoutes(
  queues: RefundExecutionWorkerCandidateQueues,
  env: ActivationEnv,
  availability: Readonly<{ eximbay: boolean }> = Object.freeze({ eximbay: false }),
): RefundExecutionWorkerPreflightResult {
  try {
    const credential = selectedTossCredentialReadiness(queues, env);
    const eximbayConfig = selectedEximbayConfigReadiness(queues, env);
    if (credential === "CONFIG_INVALID" || eximbayConfig.status === "CONFIG_INVALID") {
      return workerFailure("CONFIG_INVALID");
    }
    if (hasProviderCandidates(queues, PaymentProvider.EXIMBAY)
      && eximbayConfig.status !== "CONFIGURED") {
      return workerFailure("CONFIG_INVALID");
    }
    return Object.freeze({
      ok: true,
      readiness: Object.freeze({
        CONTACTED: providerReadiness(
          queues,
          "CONTACTED",
          () => contactedRefundExecutionWorkerLookupRouteIsReady(env, credential),
          () => contactedEximbayRefundExecutionWorkerRouteIsReady(
            env, eximbayConfig.status, availability.eximbay,
          ),
        ),
        UNCONTACTED: providerReadiness(
          queues,
          "UNCONTACTED",
          () => uncontactedRefundExecutionWorkerRouteIsReady(env, credential),
          () => uncontactedEximbayRefundExecutionWorkerRouteIsReady(
            env, eximbayConfig.status, availability.eximbay,
          ),
        ),
        READY: providerReadiness(
          queues,
          "READY",
          () => readyRefundExecutionWorkerRouteIsReady(env, credential),
          () => readyEximbayRefundExecutionWorkerRouteIsReady(
            env, eximbayConfig.status, availability.eximbay,
          ),
        ),
      }),
    });
  } catch (error) {
    if (error instanceof RefundExecutionActivationConfigError) {
      return workerFailure("CONFIG_INVALID");
    }
    throw error;
  }
}

function selectedTossCredentialReadiness(
  queues: RefundExecutionWorkerCandidateQueues,
  env: ActivationEnv,
): "ABSENT" | "CONFIG_INVALID" | "CONFIGURED" {
  return hasProviderCandidates(queues, PaymentProvider.TOSS)
    ? credentialReadiness(env)
    : "ABSENT";
}

function selectedEximbayConfigReadiness(
  queues: RefundExecutionWorkerCandidateQueues,
  env: ActivationEnv,
): EximbayRefundWorkerConfigState {
  return hasProviderCandidates(queues, PaymentProvider.EXIMBAY)
    ? parseEximbayRefundWorkerConfig(env)
    : Object.freeze({ status: "ABSENT" });
}

function providerReadiness(
  queues: RefundExecutionWorkerCandidateQueues,
  candidateClass: RefundExecutionWorkerCandidateClass,
  toss: () => boolean,
  eximbay: () => boolean,
): ProviderReadiness {
  const queue = queues[candidateClass];
  return Object.freeze({
    TOSS: queue.some((candidate) => candidate.provider === PaymentProvider.TOSS) ? toss() : true,
    EXIMBAY: queue.some((candidate) => candidate.provider === PaymentProvider.EXIMBAY)
      ? eximbay()
      : true,
  });
}

function hasProviderCandidates(
  queues: RefundExecutionWorkerCandidateQueues,
  provider: RefundExecutionWorkerProvider,
): boolean {
  return Object.values(queues).some((queue) => (
    queue.some((candidate) => candidate.provider === provider)
  ));
}

function credentialReadiness(
  env: ActivationEnv,
): "ABSENT" | "CONFIG_INVALID" | "CONFIGURED" {
  return parseTossRefundCredentialConfig({
    secretKey: env[TOSS_REFUND_SANDBOX_SECRET_KEY],
    merchantAccountBinding: env[TOSS_REFUND_SANDBOX_MERCHANT_BINDING],
    credentialGenerationBinding: env[TOSS_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING],
  }).status;
}
