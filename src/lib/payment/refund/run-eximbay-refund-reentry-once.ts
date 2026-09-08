import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  EXIMBAY_REFUND_REENTRY_TARGET,
  verifyExactConsumedEximbayRefundReentrySeal,
} from "./eximbay-refund-reentry-authority";
import {
  parseEximbayRefundCanaryEnvironment,
  type EximbayRefundCanaryEnvironment,
} from "./eximbay-refund-canary-environment";
import { readExactEximbayRefundCanarySecret } from "./eximbay-refund-canary-secret-reader";
import { createSingleShotEximbayCanaryTransport } from "./run-eximbay-refund-canary-once";
import { createEximbayRefundPreflightConfig } from "./providers/eximbay/preflight-contract";
import {
  createAuthenticatedEximbayRefundRestFetch,
  createEximbayRefundRestCredentials,
  type EximbayRefundRestFetch,
} from "./providers/eximbay/authenticated-transport";
import type { TossRefundCancellationPort } from "./providers/toss/refund-cancellation-http";
import type { TossRefundLookupPort } from "./providers/toss/refund-lookup-http";
import { createRefundExecutionWorkerRouter } from "./worker-router";
import type { RefundExecutionWorkerRouteOutcome } from "./worker-result-classification";
import {
  runWithRefundProviderContactAdmission,
  type RefundProviderContactAdmissionResult,
} from "./refund-provider-contact-admission";

const RESULT_SCHEMA = "mira-refund-eximbay-reentry-result/v1";
type RuntimeEnv = Readonly<Record<string, string | undefined>>;
type EffectCount = 0 | 1;
type ContactCounts = Readonly<{
  preflightRetrieveCount: number;
  reconciliationLookupCount: number;
  cancellationCount: number;
}>;

export type EximbayRefundReentryCleanupFailure =
  | "ADMISSION_CLEANUP_FAILED"
  | "DATABASE_DISCONNECT_FAILED";

export type EximbayRefundReentryResultCode =
  | "KNOWN_SUCCESS"
  | "NO_PROVIDER_CONTACT"
  | "RETRIEVE_CONTACTED"
  | "CANCEL_CONTACT_MAY_HAVE_OCCURRED"
  | "MANUAL_REVIEW"
  | "OVERLAP_SKIPPED"
  | "TARGET_MISMATCH"
  | "CONFIG_MISMATCH"
  | "CREDENTIAL_UNAVAILABLE"
  | "INTERNAL_FAILURE";

export type EximbayRefundReentryResult = Readonly<{
  schema: typeof RESULT_SCHEMA;
  ok: boolean;
  code: EximbayRefundReentryResultCode;
  terminalClass: "REFUND_SUCCEEDED" | "PROVIDER_EFFECT_POSSIBLE" | "SAFE_STOP";
  preflightRetrieveCount: EffectCount;
  reconciliationLookupCount: 0;
  cancellationCount: EffectCount;
  reentry: "FORBIDDEN";
  cleanupFailures: readonly EximbayRefundReentryCleanupFailure[];
}>;

export type EximbayRefundReentryDependencies = Readonly<{
  createDatabase: (env: RuntimeEnv) => PrismaClient;
  disconnectDatabase: (database: PrismaClient) => Promise<void>;
  verifyHistoricalSeal: typeof verifyExactConsumedEximbayRefundReentrySeal;
  readSecret: typeof readExactEximbayRefundCanarySecret;
  fetch: EximbayRefundRestFetch;
  runAdmission: (
    env: RuntimeEnv,
    operation: () => Promise<EximbayRefundReentryResult>,
  ) => Promise<RefundProviderContactAdmissionResult<EximbayRefundReentryResult>>;
}>;

export const defaultEximbayRefundReentryDependencies: EximbayRefundReentryDependencies =
  Object.freeze({
    createDatabase: (env) => {
      if (!env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
      return new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
    },
    disconnectDatabase: (database) => database.$disconnect(),
    verifyHistoricalSeal: verifyExactConsumedEximbayRefundReentrySeal,
    readSecret: readExactEximbayRefundCanarySecret,
    fetch: globalThis.fetch,
    runAdmission: (env, operation) => runWithRefundProviderContactAdmission(env, operation),
  });

export async function runEximbayRefundReentryOnce(
  env: RuntimeEnv,
  dependencies: EximbayRefundReentryDependencies = defaultEximbayRefundReentryDependencies,
): Promise<EximbayRefundReentryResult> {
  const authority = parseEximbayRefundCanaryEnvironment(env);
  if (!authority) return result(false, "CONFIG_MISMATCH", zeroCounts());
  let database: PrismaClient;
  try {
    database = dependencies.createDatabase(env);
  } catch {
    return result(false, "CONFIG_MISMATCH", zeroCounts());
  }
  let operation: EximbayRefundReentryResult;
  let disconnectFailed = false;
  try {
    operation = await runAdmitted(database, authority, env, dependencies);
  } catch {
    operation = result(false, "INTERNAL_FAILURE", zeroCounts());
  } finally {
    try {
      await dependencies.disconnectDatabase(database);
    } catch {
      disconnectFailed = true;
    }
  }
  return disconnectFailed
    ? withCleanupFailure(operation, "DATABASE_DISCONNECT_FAILED")
    : operation;
}

async function runAdmitted(
  database: PrismaClient,
  authority: EximbayRefundCanaryEnvironment,
  env: RuntimeEnv,
  dependencies: EximbayRefundReentryDependencies,
): Promise<EximbayRefundReentryResult> {
  const admitted = await dependencies.runAdmission(env, async () => {
    const seal = await dependencies.verifyHistoricalSeal(database, authority);
    if (!seal || seal.commandId !== EXIMBAY_REFUND_REENTRY_TARGET.commandId
      || seal.predecessorLeaseGeneration !== 1) {
      return result(false, "TARGET_MISMATCH", zeroCounts());
    }
    let transport: EximbayRefundRestFetch;
    try {
      const secret = await dependencies.readSecret({
        resource: authority.secretResource,
        version: authority.secretVersion,
      });
      transport = createAuthenticatedEximbayRefundRestFetch(
        createEximbayRefundRestCredentials(secret),
        dependencies.fetch,
      );
    } catch {
      return result(false, "CREDENTIAL_UNAVAILABLE", zeroCounts());
    }
    return executeExactTarget(database, authority, env, transport);
  });
  if (admitted.outcome === "BUSY") {
    return result(false, "OVERLAP_SKIPPED", zeroCounts());
  }
  if (admitted.outcome === "ADMISSION_UNAVAILABLE") {
    return result(false, "INTERNAL_FAILURE", zeroCounts());
  }
  return admitted.outcome === "ADMISSION_CLEANUP_FAILED"
    ? withCleanupFailure(admitted.result, "ADMISSION_CLEANUP_FAILED")
    : admitted.result;
}

async function executeExactTarget(
  database: PrismaClient,
  authority: EximbayRefundCanaryEnvironment,
  env: RuntimeEnv,
  transport: EximbayRefundRestFetch,
): Promise<EximbayRefundReentryResult> {
  const singleShot = createSingleShotEximbayCanaryTransport(transport);
  const route = createRefundExecutionWorkerRouter({
    lookup: unreachableTossLookup,
    cancellation: unreachableTossCancellation,
    eximbay: {
      config: createEximbayRefundPreflightConfig({
        mode: "SANDBOX",
        mid: authority.mid,
        merchantAccountBindingId: authority.merchantAccountBindingId,
        credentialGenerationBindingId: authority.credentialGenerationBindingId,
      }),
      retrieve: singleShot.retrieve,
      lookup: singleShot.lookup,
      cancellation: singleShot.cancellation,
    },
  });
  try {
    const outcome = await route(database, Object.freeze({
      commandId: EXIMBAY_REFUND_REENTRY_TARGET.commandId,
      candidateClass: "UNCONTACTED",
      provider: "EXIMBAY",
    }), authority.consumedExecutionId, env);
    return routeResult(outcome, singleShot.counts);
  } catch {
    return result(false, contactCode(singleShot.counts), singleShot.counts);
  }
}

function routeResult(
  outcome: RefundExecutionWorkerRouteOutcome,
  counts: ContactCounts,
): EximbayRefundReentryResult {
  if (outcome.kind === "SUCCEEDED") return result(true, "KNOWN_SUCCESS", counts);
  if (outcome.kind === "MANUAL" || outcome.kind === "INCONSISTENT") {
    return result(false, hasProviderEffect(counts) ? contactCode(counts) : "MANUAL_REVIEW", counts);
  }
  return result(false, contactCode(counts), counts);
}

function contactCode(counts: ContactCounts): EximbayRefundReentryResultCode {
  if (counts.cancellationCount > 0) return "CANCEL_CONTACT_MAY_HAVE_OCCURRED";
  if (counts.preflightRetrieveCount > 0) return "RETRIEVE_CONTACTED";
  return "NO_PROVIDER_CONTACT";
}

function result(
  ok: boolean,
  code: EximbayRefundReentryResultCode,
  counts: ContactCounts,
): EximbayRefundReentryResult {
  const bounded = boundedCounts(counts);
  return Object.freeze({
    schema: RESULT_SCHEMA,
    ok,
    code,
    terminalClass: ok
      ? "REFUND_SUCCEEDED"
      : hasProviderEffect(bounded) ? "PROVIDER_EFFECT_POSSIBLE" : "SAFE_STOP",
    ...bounded,
    reentry: "FORBIDDEN",
    cleanupFailures: Object.freeze([]),
  });
}

function boundedCounts(counts: ContactCounts): Readonly<{
  preflightRetrieveCount: EffectCount;
  reconciliationLookupCount: 0;
  cancellationCount: EffectCount;
}> {
  return Object.freeze({
    preflightRetrieveCount: counts.preflightRetrieveCount === 1 ? 1 : 0,
    reconciliationLookupCount: 0,
    cancellationCount: counts.cancellationCount === 1 ? 1 : 0,
  });
}

function zeroCounts(): ContactCounts {
  return Object.freeze({
    preflightRetrieveCount: 0,
    reconciliationLookupCount: 0,
    cancellationCount: 0,
  });
}

function hasProviderEffect(counts: ContactCounts): boolean {
  return counts.preflightRetrieveCount > 0
    || counts.reconciliationLookupCount > 0
    || counts.cancellationCount > 0;
}

function withCleanupFailure(
  operation: EximbayRefundReentryResult,
  failure: EximbayRefundReentryCleanupFailure,
): EximbayRefundReentryResult {
  return Object.freeze({
    ...operation,
    cleanupFailures: Object.freeze([...operation.cleanupFailures, failure]),
  });
}

const unreachableTossLookup: TossRefundLookupPort = () => Promise.reject(
  new Error("EXIMBAY_REFUND_REENTRY_TOSS_ROUTE_UNREACHABLE"),
);
const unreachableTossCancellation: TossRefundCancellationPort = () => Promise.reject(
  new Error("EXIMBAY_REFUND_REENTRY_TOSS_ROUTE_UNREACHABLE"),
);
