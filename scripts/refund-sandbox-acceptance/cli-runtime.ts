import { readFile } from "node:fs/promises";
import { tossBasicAuthorization } from "../../src/lib/payment/providers/toss/auth";
import { createTossRefundLookupPort } from "../../src/lib/payment/refund/providers/toss/refund-lookup-http";
import { createTossRefundCancellationPort } from "../../src/lib/payment/refund/providers/toss/refund-cancellation-http";
import { atomicCreateJson, atomicWriteJson } from "./atomic-files";
import type { H1ArtifactStore } from "./artifact-store";
import { ProviderCallBudget } from "./call-budget";
import { createLedgerBudget } from "./budget-ledger";
import { cleanupRunDatabase, assertRunResidueZero } from "./cleanup";
import {
  commandCanContactProvider, requireCleanupAcknowledgement, requireRunAcknowledgement,
  type ParsedH1Command,
} from "./contracts";
import { requireSandboxCredential } from "./credential-guard";
import type { FixtureManifest, ProviderFixture } from "./fixture-manifest";
import { scenarioInputHash } from "./integrity";
import type { H1Ledger } from "./run-ledger";
import { executeScenario } from "./scenario-orchestrator";
import { buildSanitizedReport } from "./sanitized-report";
import {
  acceptanceOperationEnv, appendRuntimeLedger, parseProtectedOwnership,
  protectedOwnershipOrNull,
} from "./runtime-ledger";
import { executeExplicitResumePost } from "./resume-post";
import { planResume } from "./resume-planner";
import { executeResumeGet } from "./resume-get";
import { withAcceptanceDatabase, type DatabaseContext } from "./database-context";

type Result = Readonly<{ code: string; runId: string }>;
type Env = Readonly<Record<string, string | undefined>>;

export async function runDatabaseCommand(
  parsed: ParsedH1Command,
  env: Env,
  store: H1ArtifactStore,
  manifest: FixtureManifest | null,
  worktree: string,
): Promise<Result> {
  if (!parsed.runId) throw new Error("RUN_ID_REQUIRED");
  if (commandCanContactProvider(parsed.command)) requireRunAcknowledgement(env, parsed.runId);
  return withAcceptanceDatabase(env, store, worktree, (context) => handleLockedCommand(
    parsed, env, store, manifest, context,
  ));
}

async function handleLockedCommand(
  parsed: ParsedH1Command,
  env: Env,
  store: H1ArtifactStore,
  manifest: FixtureManifest | null,
  context: DatabaseContext,
): Promise<Result> {
  if (!parsed.runId) throw new Error("RUN_ID_REQUIRED");
  if (parsed.command === "validate-db") return Object.freeze({ code: "DATABASE_VALID", runId: parsed.runId });
  if (parsed.command === "cleanup-db") return cleanupCommand(parsed.runId, env, context);
  if (parsed.command === "seal") {
    if (!manifest) throw new Error("FIXTURE_MANIFEST_REQUIRED");
    return sealCommand(parsed, store, manifest, context);
  }
  if (!parsed.scenarioId) throw new Error("SCENARIO_REQUIRED");
  if (!manifest) throw new Error("FIXTURE_MANIFEST_REQUIRED");
  const fixture = manifest.fixtures[parsed.scenarioId];
  if (!fixture) throw new Error("SCENARIO_FIXTURE_REQUIRED");
  return providerCommand(Object.freeze({
    command: parsed.command,
    runId: parsed.runId,
    scenarioId: parsed.scenarioId,
  }), env, store, manifest, context, fixture);
}

async function cleanupCommand(runId: string, env: Env, context: DatabaseContext): Promise<Result> {
  requireCleanupAcknowledgement(env, runId);
  const latest = await context.ledger.loadLatest();
  if (latest?.phase !== "SEALED" && latest?.phase !== "DB_CLEANED") {
    throw new Error("SEALED_EVIDENCE_REQUIRED");
  }
  const ownership = parseProtectedOwnership(latest);
  await cleanupRunDatabase(context.prisma, context.bootstrap, ownership.handle, ownership.refund);
  await assertRunResidueZero(context.prisma, ownership.handle, ownership.refund);
  await appendRuntimeLedger(context.ledger, latest, "DB_CLEANED", {
    ...latest.payload,
    cleanupComplete: true,
  });
  return Object.freeze({ code: "DATABASE_CLEANED", runId });
}

async function sealCommand(
  parsed: ParsedH1Command,
  store: H1ArtifactStore,
  manifest: FixtureManifest,
  context: DatabaseContext,
): Promise<Result> {
  if (!parsed.runId || !parsed.scenarioId) throw new Error("SEAL_INPUT_REQUIRED");
  const latest = await context.ledger.loadLatest();
  const fixture = manifest.fixtures[parsed.scenarioId];
  if (!latest || !fixture) throw new Error("SEAL_LEDGER_REQUIRED");
  if (latest.phase !== "LOCAL_COMMIT_COMPLETE" && latest.phase !== "REVIEW_REQUIRED") {
    throw new Error("SEAL_PHASE_INVALID");
  }
  const ownership = protectedOwnershipOrNull(latest);
  const hmacHex = (await readFile(store.path("raw", "hmac.key"), "utf8")).trim();
  const report = await buildSanitizedReport({
    client: context.prisma, ledger: latest, scenarioId: parsed.scenarioId, fixture,
    hmacKey: Buffer.from(hmacHex, "hex"), rawDirectory: store.path("raw"),
    refund: ownership?.refund ?? null,
  });
  await atomicCreateJson(store.path("sealed", `${parsed.scenarioId}.json`), report);
  await atomicWriteJson(store.path("sanitized", `${parsed.scenarioId}.json`), report);
  await appendRuntimeLedger(context.ledger, latest, "SEALED", {
    ...latest.payload, completionMarker: "SEALED",
  });
  return Object.freeze({ code: "SCENARIO_SEALED", runId: parsed.runId });
}

async function providerCommand(
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
): Promise<Result> {
  const credential = requireSandboxCredential(env, {
    merchant: manifest.expectedMerchantAccountBinding,
    generation: manifest.expectedCredentialGenerationBinding,
  });
  const authorization = tossBasicAuthorization(credential.readSecretKey());
  const lookup = createTossRefundLookupPort({ fetchFn: fetch });
  const cancellation = createTossRefundCancellationPort({ fetchFn: fetch });
  const latest = await initialLedger(context, parsed.scenarioId, fixture);
  const budget = createLedgerBudget(context.ledger, latest, store);
  if (parsed.command === "resume") {
    const action = planResume(latest.phase);
    if (action === "RESUME_SETUP") {
      return executeFresh(parsed, fixture, authorization, lookup, cancellation, budget, context, store, env, latest);
    }
    if (action === "REPORT_ONLY" || action === "HUMAN_POST_DECISION_REQUIRED") {
      return Object.freeze({ code: action, runId: parsed.runId });
    }
    if (action === "STOP_REVIEW_REQUIRED") throw new Error("RESUME_REVIEW_REQUIRED");
    return executeResumeGet({
      runId: parsed.runId, scenarioId: parsed.scenarioId,
      fixture,
      authorization,
      lookup,
      budget,
      prisma: context.prisma,
      ledgerStore: context.ledger,
      ledger: latest,
      env,
    });
  }
  if (parsed.command === "resume-post") {
    return resumePost(parsed, fixture, authorization, lookup, cancellation, budget, context, latest, env);
  }
  if (latest.phase !== "PLANNED" && latest.phase !== "BOOTSTRAPPED") {
    throw new Error("EXECUTE_PHASE_INVALID");
  }
  return executeFresh(parsed, fixture, authorization, lookup, cancellation, budget, context, store, env, latest);
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
    probePost: async (wire, canonicalBody) => {
      const port = createTossRefundCancellationPort({
        fetchFn: (request, init) => fetch(request, { ...init, body: canonicalBody }),
      });
      return port(Object.freeze({ authorization, wire }));
    },
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
): Promise<Result> {
  const result = await executeScenario(scenarioDependencies(
    parsed, authorization, lookup, cancellation, budget, context, store, env, latest,
  ), { runId: parsed.runId, scenarioId: parsed.scenarioId, fixture, ledgerPhase: latest.phase });
  const current = await context.ledger.loadLatest();
  const postContacted = budget.counts(parsed.scenarioId).POST > 0;
  const phase = result.ok ? "LOCAL_COMMIT_COMPLETE"
    : postContacted ? "POST_RESPONSE_RECORDED" : "REVIEW_REQUIRED";
  await appendRuntimeLedger(context.ledger, current, phase, {
    ...current?.payload,
    scenarioId: parsed.scenarioId, resultCode: result.staticCodes,
    operationKey: result.operationKey, wireFingerprint: result.wireFingerprint,
    budgets: budget.counts(parsed.scenarioId),
  });
  return Object.freeze({
    code: result.ok ? "SCENARIO_COMPLETE" : "SCENARIO_REVIEW_REQUIRED",
    runId: parsed.runId,
  });
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
) {
  return {
    client: context.prisma, bootstrap: context.bootstrap, lookup, cancellation, budget,
    env: acceptanceOperationEnv(env), probeAuthorization: authorization,
    priorBootstrapHandle: protectedOwnershipOrNull(latest)?.handle,
    probePost: async (wire: Parameters<ReturnType<typeof createTossRefundCancellationPort>>[0]["wire"], canonicalBody: string) => {
      const port = createTossRefundCancellationPort({ fetchFn: (input, init) => fetch(input, { ...init, body: canonicalBody }) });
      return port(Object.freeze({ authorization, wire }));
    },
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
