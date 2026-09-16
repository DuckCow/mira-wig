import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { consumeEximbayRefundCanaryApproval } from "./consume-eximbay-refund-canary-approval-v2";
import {
  parseEximbayRefundCanaryEnvironment,
  type EximbayRefundCanaryEnvironment,
} from "./eximbay-refund-canary-environment-v2";
import { readExactEximbayRefundCanarySecret } from "./eximbay-refund-canary-secret-reader";
import { selectExactEximbayRefundCanaryCandidate } from "./eximbay-refund-canary-exact-selector";
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

type RuntimeEnv = Readonly<Record<string, string | undefined>>;
type ContactCounts = { preflightRetrieveCount: number; reconciliationLookupCount: number; cancellationCount: number };
export type EximbayRefundCanaryCleanupFailure =
  | "ADMISSION_CLEANUP_FAILED"
  | "DATABASE_DISCONNECT_FAILED";

export type EximbayRefundCanaryResult = Readonly<{
  ok: boolean;
  code: "NO_PROVIDER_CONTACT" | "RETRIEVE_CONTACTED" | "RETRIEVE_CONTACT_POSSIBLE"
    | "CANCEL_CONTACT_MAY_HAVE_OCCURRED" | "KNOWN_SUCCESS" | "MANUAL_REVIEW"
    | "CANARY_TIMEOUT" | "OVERLAP_SKIPPED" | "APPROVAL_ALREADY_CONSUMED"
    | "TARGET_MISMATCH" | "CONFIG_MISMATCH" | "CREDENTIAL_UNAVAILABLE";
  preflightRetrieveCount: number;
  reconciliationLookupCount: number;
  cancellationCount: number;
  reentry?: "SEPARATE_RECONCILIATION_AUTHORITY_REQUIRED";
  cleanupFailures?: readonly EximbayRefundCanaryCleanupFailure[];
}>;

export type EximbayRefundCanaryDependencies = Readonly<{
  createDatabase: (env: RuntimeEnv) => PrismaClient;
  disconnectDatabase: (database: PrismaClient) => Promise<void>;
  readSecret: typeof readExactEximbayRefundCanarySecret;
  fetch: EximbayRefundRestFetch;
  runAdmission: (
    env: RuntimeEnv,
    operation: () => Promise<EximbayRefundCanaryResult>,
  ) => Promise<RefundProviderContactAdmissionResult<EximbayRefundCanaryResult>>;
}>;

export const defaultEximbayRefundCanaryDependencies: EximbayRefundCanaryDependencies =
  Object.freeze({
    createDatabase: (env) => {
      if (!env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
      return new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
    },
    disconnectDatabase: (database) => database.$disconnect(),
    readSecret: readExactEximbayRefundCanarySecret,
    fetch: globalThis.fetch,
    runAdmission: (env, operation) => runWithRefundProviderContactAdmission(env, operation),
  });

export async function runEximbayRefundCanaryOnce(
  env: RuntimeEnv,
  dependencies: EximbayRefundCanaryDependencies = defaultEximbayRefundCanaryDependencies,
): Promise<EximbayRefundCanaryResult> {
  const authority = parseEximbayRefundCanaryEnvironment(env);
  if (!authority) return result(false, "CONFIG_MISMATCH");
  let database: PrismaClient;
  try {
    database = dependencies.createDatabase(env);
  } catch {
    return result(false, "CONFIG_MISMATCH");
  }
  let final: EximbayRefundCanaryResult;
  let cleanupFailed = false;
  try {
    final = await runAdmitted(database, authority, env, dependencies);
  } catch {
    final = result(false, "NO_PROVIDER_CONTACT");
  } finally {
    try { await dependencies.disconnectDatabase(database); } catch { cleanupFailed = true; }
  }
  return cleanupFailed ? withCleanupFailure(final, "DATABASE_DISCONNECT_FAILED") : final;
}

async function runAdmitted(
  database: PrismaClient,
  authority: EximbayRefundCanaryEnvironment,
  env: RuntimeEnv,
  dependencies: EximbayRefundCanaryDependencies,
): Promise<EximbayRefundCanaryResult> {
  const admitted = await dependencies.runAdmission(env, async () => {
    const consumed = await consumeEximbayRefundCanaryApproval(database, authority);
    if (consumed.outcome !== "ADMITTED") {
      return result(false, consumed.outcome);
    }
    let secret: string;
    try {
      secret = await dependencies.readSecret({
        resource: authority.secretResource, version: authority.secretVersion,
      });
    } catch {
      return result(false, "CREDENTIAL_UNAVAILABLE");
    }
    let transport: EximbayRefundRestFetch;
    try {
      const credentials = createEximbayRefundRestCredentials(secret);
      transport = createAuthenticatedEximbayRefundRestFetch(credentials, dependencies.fetch);
    } catch {
      return result(false, "CREDENTIAL_UNAVAILABLE");
    }
    return executeExactTarget(database, consumed.commandId, authority, env, transport);
  });
  if (admitted.outcome === "BUSY") return result(false, "OVERLAP_SKIPPED");
  if (admitted.outcome === "ADMISSION_UNAVAILABLE") return result(false, "NO_PROVIDER_CONTACT");
  return admitted.outcome === "ADMISSION_CLEANUP_FAILED"
    ? withCleanupFailure(admitted.result, "ADMISSION_CLEANUP_FAILED")
    : admitted.result;
}

async function executeExactTarget(
  database: PrismaClient,
  commandId: string,
  authority: EximbayRefundCanaryEnvironment,
  env: RuntimeEnv,
  transport: EximbayRefundRestFetch,
): Promise<EximbayRefundCanaryResult> {
  const { counts, retrieve, cancellation, lookup } = createSingleShotEximbayCanaryTransport(transport);
  const config = createEximbayRefundPreflightConfig({
    mode: "SANDBOX",
    mid: authority.mid,
    merchantAccountBindingId: authority.merchantAccountBindingId,
    credentialGenerationBindingId: authority.credentialGenerationBindingId,
  });
  const route = createRefundExecutionWorkerRouter({
    lookup: unreachableTossLookup,
    cancellation: unreachableTossCancellation,
    eximbay: {
      config,
      retrieve,
      lookup,
      cancellation,
    },
  });
  // One READY dispatch only. A temporary/unknown result is terminal for this approval.
  return runExactTargetIteration(database, commandId, authority, env, route, counts);
}

// Cap at the transport boundary before contact, including rejection/throw/concurrency.
// The shared worker's recovery capability is deliberately unavailable to this canary.
export function createSingleShotEximbayCanaryTransport(transport: EximbayRefundRestFetch) {
  const counts: ContactCounts = {
    preflightRetrieveCount: 0, reconciliationLookupCount: 0, cancellationCount: 0,
  };
  const retrieve: EximbayRefundRestFetch = async (...args) => {
    if (counts.preflightRetrieveCount !== 0 || counts.cancellationCount !== 0) {
      throw new Error("EXIMBAY_CANARY_RETRIEVE_LIMIT");
    }
    counts.preflightRetrieveCount += 1;
    return transport(...args);
  };
  const cancellation: EximbayRefundRestFetch = async (...args) => {
    if (counts.preflightRetrieveCount !== 1 || counts.cancellationCount !== 0) {
      throw new Error("EXIMBAY_CANARY_CANCEL_LIMIT");
    }
    counts.cancellationCount += 1;
    return transport(...args);
  };
  const lookup: EximbayRefundRestFetch = () => Promise.reject(
    new Error("EXIMBAY_CANARY_RECOVERY_FORBIDDEN"),
  );
  return Object.freeze({ counts, retrieve, cancellation, lookup });
}

async function runExactTargetIteration(
  database: PrismaClient,
  commandId: string,
  authority: EximbayRefundCanaryEnvironment,
  env: RuntimeEnv,
  route: ReturnType<typeof createRefundExecutionWorkerRouter>,
  counts: ContactCounts,
): Promise<EximbayRefundCanaryResult> {
  try {
    const candidate = await selectExactEximbayRefundCanaryCandidate(database, commandId);
    if (!candidate) return exactTargetTerminalResult(database, commandId, counts);
    if (candidate.candidateClass !== "READY") return possible(contactCode(counts), counts);
    const outcome = await route(database, candidate, authority.consumedExecutionId, env);
    return canaryRouteResult(outcome, counts);
  } catch {
    return possible(contactCode(counts), counts);
  }
}

async function exactTargetTerminalResult(
  database: PrismaClient,
  commandId: string,
  counts: ContactCounts,
): Promise<EximbayRefundCanaryResult> {
  const state = await database.refundExecutionCommand.findUnique({
    where: { id: commandId }, select: { status: true },
  });
  if (state?.status === "DONE") return withCounts(true, "KNOWN_SUCCESS", counts);
  return possible(state?.status === "PARKED" ? "MANUAL_REVIEW" : contactCode(counts), counts);
}

function canaryRouteResult(
  outcome: RefundExecutionWorkerRouteOutcome,
  counts: ContactCounts,
): EximbayRefundCanaryResult {
  if (["SUCCEEDED", "REPLAYED"].includes(outcome.kind)) {
    return withCounts(true, "KNOWN_SUCCESS", counts);
  }
  if (["MANUAL", "INCONSISTENT"].includes(outcome.kind)) {
    return possible("MANUAL_REVIEW", counts);
  }
  return possible(contactCode(counts), counts);
}

const unreachableTossLookup: TossRefundLookupPort = () => Promise.reject(
  new Error("EXIMBAY_CANARY_TOSS_ROUTE_UNREACHABLE"),
);
const unreachableTossCancellation: TossRefundCancellationPort = () => Promise.reject(
  new Error("EXIMBAY_CANARY_TOSS_ROUTE_UNREACHABLE"),
);

function contactCode(counts: ContactCounts): EximbayRefundCanaryResult["code"] {
  if (counts.cancellationCount > 0) return "CANCEL_CONTACT_MAY_HAVE_OCCURRED";
  if (counts.reconciliationLookupCount > 0) return "RETRIEVE_CONTACT_POSSIBLE";
  if (counts.preflightRetrieveCount > 0) return "RETRIEVE_CONTACTED";
  return "NO_PROVIDER_CONTACT";
}

function possible(code: EximbayRefundCanaryResult["code"], counts: ContactCounts) {
  return Object.freeze({ ...withCounts(false, code, counts),
    reentry: "SEPARATE_RECONCILIATION_AUTHORITY_REQUIRED" as const });
}

function withCounts(ok: boolean, code: EximbayRefundCanaryResult["code"], counts: ContactCounts) {
  return Object.freeze({ ok, code, ...counts });
}

function result(ok: boolean, code: EximbayRefundCanaryResult["code"]): EximbayRefundCanaryResult {
  return Object.freeze({ ok, code, preflightRetrieveCount: 0, reconciliationLookupCount: 0, cancellationCount: 0 });
}

function withCleanupFailure(
  operation: EximbayRefundCanaryResult,
  failure: EximbayRefundCanaryCleanupFailure,
): EximbayRefundCanaryResult {
  return Object.freeze({
    ...operation,
    cleanupFailures: Object.freeze([...(operation.cleanupFailures ?? []), failure]),
  });
}
