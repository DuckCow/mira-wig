import { tossBasicAuthorization } from "../../src/lib/payment/providers/toss/auth";
import { createTossRefundLookupPort } from "../../src/lib/payment/refund/providers/toss/refund-lookup-http";
import { createTossRefundCancellationPort } from "../../src/lib/payment/refund/providers/toss/refund-cancellation-http";
import type { H1ArtifactStore } from "./artifact-store";
import {
  ProviderCallBudget,
  budgetRecordsFromPayload,
  createLedgerBudget,
  type S3HistoryExpectation,
} from "./call-budget";
import { durableS3State, type S3Continuation } from "./budget-ledger";
import {
  cleanupCommand,
  durableS3TerminalCode,
  hasS3ReplayObserved,
  isTerminalS3History,
  recoverS3ExecutionFailure,
  resolveS3ReturnCode,
  terminalizeS3History,
} from "./cleanup";
import {
  assertActiveAcceptanceLifecycle, commandCanContactProvider, requireRunAcknowledgement,
  type ParsedH1Command,
} from "./contracts";
import { requireSandboxCredential } from "./credential-guard";
import type { FixtureManifest, ProviderFixture } from "./fixture-manifest";
import {
  assertScenarioAuthorized,
  type EffectiveFixtureAuthority,
} from "./fixture-population";
import { scenarioInputHash } from "./integrity";
import type { H1Ledger } from "./run-ledger";
import { executeScenario } from "./scenario-orchestrator";
import { completeS3DurableProof } from "./scenario-probes";
import { sealScenarioEvidence } from "./sanitized-report";
import {
  acceptanceOperationEnv, appendRuntimeLedger, protectedOwnershipOrNull,
} from "./runtime-ledger";
import { executeExplicitResumePost } from "./resume-post";
import {
  classifyS3History, createS3HistoryExpectation, planResume, planS3Command,
  type S3CommandAuthority,
} from "./resume-planner";
import { executeResumeGet } from "./resume-get";
import { withAcceptanceDatabase, type DatabaseContext } from "./database-context";

export { cleanupCommand } from "./cleanup";

type Result = Readonly<{ code: string; runId: string }>;
type Env = Readonly<Record<string, string | undefined>>;
export type ProviderAdapterFactories = Readonly<{
  createLookup: typeof createTossRefundLookupPort;
  createCancellation: typeof createTossRefundCancellationPort;
}>;
type ProviderRuntime = Readonly<{
  authorization: string;
  lookup: ReturnType<typeof createTossRefundLookupPort>;
  cancellation: ReturnType<typeof createTossRefundCancellationPort>;
}>;
type S3ProviderPlan = Readonly<{
  authority: S3CommandAuthority;
  continuation: S3Continuation;
}>;

const DEFAULT_PROVIDER_ADAPTER_FACTORIES: ProviderAdapterFactories = Object.freeze({
  createLookup: createTossRefundLookupPort,
  createCancellation: createTossRefundCancellationPort,
});

export async function runDatabaseCommand(
  parsed: ParsedH1Command,
  env: Env,
  store: H1ArtifactStore,
  authority: EffectiveFixtureAuthority | null,
  worktree: string,
): Promise<Result> {
  if (!parsed.runId) throw new Error("RUN_ID_REQUIRED");
  assertActiveAcceptanceLifecycle(parsed);
  if (commandCanContactProvider(parsed.command)) requireRunAcknowledgement(env, parsed.runId);
  return withAcceptanceDatabase(env, store, worktree, (context) => handleLockedCommand(
    parsed, env, store, authority, context,
  ));
}

async function handleLockedCommand(
  parsed: ParsedH1Command,
  env: Env,
  store: H1ArtifactStore,
  authority: EffectiveFixtureAuthority | null,
  context: DatabaseContext,
): Promise<Result> {
  if (!parsed.runId) throw new Error("RUN_ID_REQUIRED");
  const local = await handleNonProviderDatabaseCommand(parsed, env, store, authority, context);
  if (local) return local;
  if (!parsed.scenarioId) throw new Error("SCENARIO_REQUIRED");
  if (!authority) throw new Error("FIXTURE_AUTHORITY_REQUIRED");
  assertScenarioAuthorized(authority, parsed.scenarioId);
  const fixture = authority.manifest.fixtures[parsed.scenarioId];
  if (!fixture) throw new Error("SCENARIO_FIXTURE_REQUIRED");
  return providerCommand(Object.freeze({
    command: parsed.command,
    runId: parsed.runId,
    scenarioId: parsed.scenarioId,
  }), env, store, authority.manifest, context, fixture);
}

async function handleNonProviderDatabaseCommand(
  parsed: ParsedH1Command,
  env: Env,
  store: H1ArtifactStore,
  authority: EffectiveFixtureAuthority | null,
  context: DatabaseContext,
): Promise<Result | null> {
  if (!parsed.runId) throw new Error("RUN_ID_REQUIRED");
  if (parsed.command === "validate-db") {
    return Object.freeze({ code: "DATABASE_VALID", runId: parsed.runId });
  }
  if (parsed.command === "cleanup-db") {
    return cleanupCommand(parsed.runId, env, context, authority?.authorizedScenario ?? null);
  }
  if (parsed.command !== "seal") return null;
  if (!authority) throw new Error("FIXTURE_AUTHORITY_REQUIRED");
  if (!parsed.scenarioId) throw new Error("SCENARIO_REQUIRED");
  assertScenarioAuthorized(authority, parsed.scenarioId);
  return sealScenarioEvidence(parsed, store, authority.manifest, context);
}

export async function providerCommand(
  parsed: Readonly<{
    command: ParsedH1Command["command"];
    runId: string;
    scenarioId: NonNullable<ParsedH1Command["scenarioId"]>;
  }>,
  env: Env,
  store: H1ArtifactStore,
  manifest: FixtureManifest,
  context: DatabaseContext,
  fixture: ProviderFixture,
  adapterFactories: ProviderAdapterFactories = DEFAULT_PROVIDER_ADAPTER_FACTORIES,
): Promise<Result> {
  assertActiveAcceptanceLifecycle(parsed);
  if (parsed.scenarioId === "S3") {
    const latest = await initialLedger(context, parsed.scenarioId, fixture);
    return s3ProviderCommand(parsed, env, store, manifest, context, fixture, latest, adapterFactories);
  }
  return nonS3ProviderCommand(
    parsed, env, store, manifest, context, fixture, adapterFactories,
  );
}

async function nonS3ProviderCommand(
  parsed: Parameters<typeof providerCommand>[0],
  env: Env,
  store: H1ArtifactStore,
  manifest: FixtureManifest,
  context: DatabaseContext,
  fixture: ProviderFixture,
  adapterFactories: ProviderAdapterFactories,
): Promise<Result> {
  const provider = createProviderRuntime(env, manifest, adapterFactories);
  const latest = await initialLedger(context, parsed.scenarioId, fixture);
  const budget = await createLedgerBudget(
    context.ledger, latest, store, context.runProviderContact,
  );
  if (parsed.command === "resume") {
    const action = planResume(latest.phase);
    if (action === "RESUME_SETUP") {
      return executeFresh(
        parsed, fixture, provider.authorization, provider.lookup, provider.cancellation,
        budget, context, store, env, latest,
      );
    }
    if (action === "REPORT_ONLY" || action === "HUMAN_POST_DECISION_REQUIRED") {
      return Object.freeze({ code: action, runId: parsed.runId });
    }
    if (action === "STOP_REVIEW_REQUIRED") throw new Error("RESUME_REVIEW_REQUIRED");
    return executeResumeGet({
      runId: parsed.runId, scenarioId: parsed.scenarioId, fixture,
      authorization: provider.authorization, lookup: provider.lookup, budget,
      prisma: context.prisma, ledgerStore: context.ledger, ledger: latest, env,
    });
  }
  if (parsed.command === "resume-post") {
    return resumePost(
      parsed, fixture, provider.authorization, provider.lookup, provider.cancellation,
      budget, context, latest, env,
    );
  }
  if (latest.phase !== "PLANNED" && latest.phase !== "BOOTSTRAPPED") {
    throw new Error("EXECUTE_PHASE_INVALID");
  }
  return executeFresh(
    parsed, fixture, provider.authorization, provider.lookup, provider.cancellation,
    budget, context, store, env, latest,
  );
}

async function s3ProviderCommand(
  parsed: Parameters<typeof providerCommand>[0],
  env: Env,
  store: H1ArtifactStore,
  manifest: FixtureManifest,
  context: DatabaseContext,
  fixture: ProviderFixture,
  latest: H1Ledger,
  adapterFactories: ProviderAdapterFactories,
): Promise<Result> {
  if (!isS3ProviderCommand(parsed.command)) throw new Error("EXECUTE_PHASE_INVALID");
  const expectation = createS3HistoryExpectation(parsed.runId, fixture);
  const decision = planS3Command(
    parsed.command,
    durableS3State(latest),
    expectation,
    hasS3ReplayObserved(latest.payload.resultCode),
  );
  const { history, plan } = decision;
  switch (plan.kind) {
    case "RETURN": {
      const code = resolveS3ReturnCode(plan.code, latest.payload.resultCode);
      return Object.freeze({ code, runId: parsed.runId });
    }
    case "REJECT": throw new Error(plan.code);
    case "TERMINALIZE": {
      if (!isTerminalS3History(history)) throw new Error("S3_TERMINAL_CLASSIFICATION_REQUIRED");
      const code = await terminalizeS3History(context.ledger, latest, history);
      return Object.freeze({ code, runId: parsed.runId });
    }
    case "MARK_HUMAN_POST_DECISION_REQUIRED": {
      await appendRuntimeLedger(context.ledger, latest, "HUMAN_POST_DECISION_REQUIRED", {
        ...latest.payload, scenarioId: "S3",
      });
      return Object.freeze({ code: "HUMAN_POST_DECISION_REQUIRED", runId: parsed.runId });
    }
    case "FINALIZE_COMPLETE_PROOF": {
      return finalizeS3CompleteProof(parsed, fixture, context, expectation);
    }
    case "CONTINUE_WITH_PROVIDER_CALLS": {
      const provider = createProviderRuntime(env, manifest, adapterFactories);
      const budget = await createLedgerBudget(
        context.ledger, latest, store, context.runProviderContact,
      );
      return executeFresh(
        parsed, fixture, provider.authorization, provider.lookup, provider.cancellation,
        budget, context, store, env, latest, expectation,
        Object.freeze({ authority: plan.authority, continuation: plan.continuation }),
      );
    }
  }
}

function createProviderRuntime(
  env: Env,
  manifest: FixtureManifest,
  factories: ProviderAdapterFactories,
): ProviderRuntime {
  const credential = requireSandboxCredential(env, {
    merchant: manifest.expectedMerchantAccountBinding,
    generation: manifest.expectedCredentialGenerationBinding,
  });
  const authorization = tossBasicAuthorization(credential.readSecretKey());
  return Object.freeze({
    authorization,
    lookup: factories.createLookup({ fetchFn: fetch }),
    cancellation: factories.createCancellation({ fetchFn: fetch }),
  });
}

async function finalizeS3CompleteProof(
  parsed: Parameters<typeof providerCommand>[0],
  fixture: ProviderFixture,
  context: DatabaseContext,
  expectation: S3HistoryExpectation,
): Promise<Result> {
  const current = await context.ledger.loadLatest();
  if (!current) throw new Error("S3_DURABLE_PROOF_REQUIRED");
  const history = classifyS3History(current.payload.callRecords ?? [], expectation);
  if (isTerminalS3History(history)) {
    const code = await terminalizeS3History(context.ledger, current, history);
    return Object.freeze({ code, runId: parsed.runId });
  }
  if (hasS3ReplayObserved(current.payload.resultCode) || reportOnlyS3Phase(current.phase)) {
    return Object.freeze({ code: "REPORT_ONLY", runId: parsed.runId });
  }
  const result = completeS3DurableProof(
    parsed.runId,
    fixture,
    current.payload.callRecords ?? [],
  );
  const records = budgetRecordsFromPayload(current.payload.callRecords);
  await appendRuntimeLedger(context.ledger, current, "LOCAL_COMMIT_COMPLETE", {
    ...current.payload,
    scenarioId: "S3",
    resultCode: result.staticCodes,
    operationKey: result.operationKey,
    wireFingerprint: result.wireFingerprint,
    budgets: countS3Intents(records),
  });
  return Object.freeze({ code: "SCENARIO_COMPLETE", runId: parsed.runId });
}

function countS3Intents(records: ReturnType<typeof budgetRecordsFromPayload>) {
  const intents = records.filter((entry) => entry.scenarioId === "S3" && entry.phase === "INTENT");
  return Object.freeze({
    GET: intents.filter((entry) => entry.kind === "GET").length,
    POST: intents.filter((entry) => entry.kind === "POST").length,
  });
}

function reportOnlyS3Phase(phase: H1Ledger["phase"]): boolean {
  return phase === "LOCAL_COMMIT_COMPLETE" || phase === "SEALED" || phase === "DB_CLEANED";
}

async function resumePost(
  parsed: Parameters<typeof providerCommand>[0],
  fixture: ProviderFixture,
  authorization: string,
  lookup: ReturnType<typeof createTossRefundLookupPort>,
  cancellation: ReturnType<typeof createTossRefundCancellationPort>,
  budget: ProviderCallBudget,
  context: DatabaseContext,
  latest: H1Ledger,
  env: Env,
): Promise<Result> {
  if (latest.phase !== "HUMAN_POST_DECISION_REQUIRED") throw new Error("RESUME_POST_NOT_AUTHORIZED");
  const code = await executeExplicitResumePost({
    prisma: context.prisma, scenarioId: parsed.scenarioId, runId: parsed.runId,
    fixture, authorization, lookup, cancellation, budget,
    env: acceptanceOperationEnv(env), ledger: latest,
  });
  await appendRuntimeLedger(context.ledger, await context.ledger.loadLatest(), "POST_RESPONSE_RECORDED", {
    ...latest.payload, scenarioId: parsed.scenarioId, resumePostCode: code,
  });
  return Object.freeze({ code, runId: parsed.runId });
}

async function executeFresh(
  parsed: Parameters<typeof providerCommand>[0],
  fixture: ProviderFixture,
  authorization: string,
  lookup: ReturnType<typeof createTossRefundLookupPort>,
  cancellation: ReturnType<typeof createTossRefundCancellationPort>,
  budget: ProviderCallBudget,
  context: DatabaseContext,
  store: H1ArtifactStore,
  env: Env,
  latest: H1Ledger,
  s3Expectation?: S3HistoryExpectation,
  s3Plan?: S3ProviderPlan,
): Promise<Result> {
  let result: Awaited<ReturnType<typeof executeScenario>>;
  try {
    result = await executeScenario(scenarioDependencies(
      parsed, authorization, lookup, cancellation, budget, context, store, env, latest, s3Plan,
    ), { runId: parsed.runId, scenarioId: parsed.scenarioId, fixture, ledgerPhase: latest.phase });
  } catch (error) {
    const code = await recoverS3ExecutionFailure(
      parsed.scenarioId, context.ledger, s3Expectation, classifyS3History, error,
    );
    return Object.freeze({ code, runId: parsed.runId });
  }
  const current = await context.ledger.loadLatest();
  const terminalCode = await durableS3TerminalCode(
    parsed.scenarioId, context.ledger, current, s3Expectation, classifyS3History,
  );
  if (terminalCode) return Object.freeze({ code: terminalCode, runId: parsed.runId });
  const postContacted = budget.counts(parsed.scenarioId).POST > 0;
  const phase = result.ok ? "LOCAL_COMMIT_COMPLETE"
    : postContacted ? "POST_RESPONSE_RECORDED" : "REVIEW_REQUIRED";
  await appendRuntimeLedger(context.ledger, current, phase, {
    ...current?.payload,
    scenarioId: parsed.scenarioId, resultCode: result.staticCodes,
    operationKey: result.operationKey, wireFingerprint: result.wireFingerprint,
    budgets: parsed.scenarioId === "S3"
      ? budget.intentCounts("S3") : budget.counts(parsed.scenarioId),
  });
  return Object.freeze({
    code: result.ok ? "SCENARIO_COMPLETE" : "SCENARIO_REVIEW_REQUIRED",
    runId: parsed.runId,
  });
}

function isS3ProviderCommand(
  command: ParsedH1Command["command"],
): command is "execute" | "resume" | "resume-post" {
  return command === "execute" || command === "resume" || command === "resume-post";
}

function scenarioDependencies(
  parsed: Parameters<typeof providerCommand>[0],
  authorization: string,
  lookup: ReturnType<typeof createTossRefundLookupPort>,
  cancellation: ReturnType<typeof createTossRefundCancellationPort>,
  budget: ProviderCallBudget,
  context: DatabaseContext,
  store: H1ArtifactStore,
  env: Env,
  latest: H1Ledger,
  s3Plan?: S3ProviderPlan,
) {
  return {
    client: context.prisma, bootstrap: context.bootstrap, lookup, cancellation, budget,
    env: acceptanceOperationEnv(env), probeAuthorization: authorization,
    ...(s3Plan ? {
      s3Authority: s3Plan.authority,
      s3Continuation: s3Plan.continuation,
    } : {}),
    priorBootstrapHandle: protectedOwnershipOrNull(latest)?.handle,
    recordDiscardedResponse: (response: unknown) => store.writeRaw(`${parsed.scenarioId}-discarded-response.json`, response).then(() => undefined),
    recordCrashAdjustment: (projection: unknown) => store.writeRaw(`${parsed.scenarioId}-crash-adjustment.json`, projection).then(() => undefined),
    recordLocalOwnership: async (ownership: Readonly<Record<string, unknown>>) => {
      const current = await context.ledger.loadLatest();
      await appendRuntimeLedger(context.ledger, current, "BOOTSTRAPPED", {
        ...current?.payload, scenarioId: parsed.scenarioId, ...ownership,
      });
    },
  };
}

async function initialLedger(
  context: DatabaseContext,
  scenarioId: Parameters<typeof providerCommand>[0]["scenarioId"],
  fixture: ProviderFixture,
) {
  return (await context.ledger.loadLatest()) ?? appendRuntimeLedger(
    context.ledger,
    null,
    "PLANNED",
    {
      scenarioId,
      startedAt: new Date().toISOString(),
      staleLockRecovered: context.staleLockRecovered,
    },
    { ...context.integrity, scenarioInputHash: scenarioInputHash(fixture) },
  );
}
