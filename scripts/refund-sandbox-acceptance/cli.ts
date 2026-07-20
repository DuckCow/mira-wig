import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertExistingExternalArtifactRoot,
  assertExternalArtifactRoot,
  ordinaryDelete,
  readPrivateText,
} from "./atomic-files";
import { H1_ARTIFACT_PARENT, H1ArtifactStore } from "./artifact-store";
import {
  assertActiveAcceptanceLifecycle, generateRunId, H1ContractError, parseH1Command,
  requirePurgeAcknowledgement, S4_PROVIDER_PROBE_RETIRED,
  S5_ACCEPTANCE_SCENARIO_RETIRED, S6_ACCEPTANCE_SCENARIO_RETIRED,
} from "./contracts";
import {
  assertLedgerMatchesFixtureAuthority,
  assertScenarioAuthorized,
  FixturePopulationError,
  isFixturePopulationError,
  populateFixtures,
  readEffectiveFixtureAuthority,
  readPopulationFixtureAuthority,
  type EffectiveFixtureAuthority,
  type FixtureAuthorityDependencies,
  type FixturePopulationDependencies,
  type FixturePopulationResult,
} from "./fixture-population";
import { assertApprovalRegistryRootSafe } from "./fixture-population-approval";
import { acquireRunMutationLock } from "./exclusive-run-lock";
import { parseSanitizedEvidence } from "./redaction";
import { RunLedgerStore } from "./run-ledger";

const WORKTREE = resolve(import.meta.dirname, "../..");
const STATIC_FAILURE = "H1_COMMAND_FAILED";
type CliDependencies = Readonly<{
  fixtureAuthority?: FixtureAuthorityDependencies;
  fixturePopulation?: FixturePopulationDependencies;
}>;
type CliProcessDependencies = Readonly<{
  execute?: (
    argv: readonly string[],
    env: Readonly<Record<string, string | undefined>>,
  ) => ReturnType<typeof runCli>;
  writeStdout?: (value: string) => void;
  writeStderr?: (value: string) => void;
}>;

export async function runCli(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<Readonly<{ code: string; runId?: string }> | FixturePopulationResult> {
  const parsed = parseH1Command(argv);
  assertActiveAcceptanceLifecycle(parsed);
  if (parsed.command === "populate-fixtures") {
    let root: string;
    try {
      root = await assertExistingExternalArtifactRoot(H1_ARTIFACT_PARENT, WORKTREE);
    } catch {
      throw new FixturePopulationError("FIXTURE_POPULATION_TARGET_INVALID");
    }
    return runParsedCli(parsed, env, root, WORKTREE, Object.freeze({}));
  }
  const root = await assertExternalArtifactRoot(H1_ARTIFACT_PARENT, WORKTREE);
  return runParsedCli(parsed, env, root, WORKTREE, Object.freeze({}));
}

export async function runCliAtRoot(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  root: string,
  worktree = WORKTREE,
  dependencies: CliDependencies = Object.freeze({}),
): Promise<Readonly<{ code: string; runId?: string }> | FixturePopulationResult> {
  const parsed = parseH1Command(argv);
  assertActiveAcceptanceLifecycle(parsed);
  if (dependencies.fixturePopulation?.approvalRegistry) {
    await assertApprovalRegistryRootSafe(dependencies.fixturePopulation.approvalRegistry, root);
  }
  if (dependencies.fixtureAuthority?.approvalRegistry) {
    await assertApprovalRegistryRootSafe(dependencies.fixtureAuthority.approvalRegistry, root);
  }
  return runParsedCli(parsed, env, root, worktree, dependencies);
}

export async function runCliProcess(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
  dependencies: CliProcessDependencies = Object.freeze({}),
): Promise<0 | 1> {
  const execute = dependencies.execute ?? runCli;
  const writeStdout = dependencies.writeStdout ?? ((value: string) => process.stdout.write(value));
  const writeStderr = dependencies.writeStderr ?? ((value: string) => process.stderr.write(value));
  try {
    const result = await execute(argv, env);
    writeStdout(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    writeStderr(`${safeCliFailureCode(error)}\n`);
    return 1;
  }
}

async function runParsedCli(
  parsed: ReturnType<typeof parseH1Command>,
  env: Readonly<Record<string, string | undefined>>,
  root: string,
  worktree: string,
  dependencies: CliDependencies,
): Promise<Readonly<{ code: string; runId?: string }> | FixturePopulationResult> {
  assertActiveAcceptanceLifecycle(parsed);
  if (parsed.command === "populate-fixtures") {
    return populateFixtures(root, parsed, env, dependencies.fixturePopulation);
  }
  if (parsed.command === "plan") return plan(root);
  if (!parsed.runId) throw new Error("INVALID_RUN_ID");
  const store = new H1ArtifactStore(root, parsed.runId);
  await store.assertModes();
  const authority = await readCommandAuthority(
    parsed.command, store, parsed.runId, dependencies.fixtureAuthority,
  );
  if (authority && parsed.scenarioId) assertScenarioAuthorized(authority, parsed.scenarioId);
  const local = await localCommand(parsed.command, parsed.runId, store, env, authority);
  if (local) return local;
  const { runDatabaseCommand } = await import("./cli-runtime");
  return runDatabaseCommand(parsed, env, store, authority, worktree);
}

async function plan(root: string) {
  const runId = generateRunId();
  const store = new H1ArtifactStore(root, runId);
  await store.initialize();
  return Object.freeze({ code: "RUN_PLANNED", runId });
}

async function localCommand(
  command: ReturnType<typeof parseH1Command>["command"],
  runId: string,
  store: H1ArtifactStore,
  env: Readonly<Record<string, string | undefined>>,
  authority: EffectiveFixtureAuthority | null,
): Promise<Readonly<{ code: string; runId: string }> | null> {
  if (command === "inspect" || command === "status") {
    return Object.freeze({ code: "RUN_INSPECTED", runId });
  }
  if (command === "validate-fixtures") {
    if (!authority) throw new Error("FIXTURE_AUTHORITY_REQUIRED");
    return Object.freeze({ code: "FIXTURES_VALID", runId });
  }
  if (command === "report") {
    await assertReportAvailable(store, authority);
    return Object.freeze({ code: "REPORT_AVAILABLE", runId });
  }
  if (command !== "purge-raw") return null;
  requirePurgeAcknowledgement(env, runId);
  const lock = await acquireRunMutationLock(store.path("locks", "run.lock"), runId, "purge-raw");
  try {
    await assertPurgeReady(store, authority);
    await ordinaryDelete(store.path("raw"));
  } finally {
    await lock.release();
  }
  return Object.freeze({ code: "RAW_PURGED", runId });
}

async function readCommandAuthority(
  command: ReturnType<typeof parseH1Command>["command"],
  store: H1ArtifactStore,
  runId: string,
  dependencies: FixtureAuthorityDependencies | undefined,
): Promise<EffectiveFixtureAuthority | null> {
  if (command === "validate-fixtures" || command === "execute" || command === "resume"
    || command === "resume-post" || command === "seal") {
    return readEffectiveFixtureAuthority(store.runDirectory, runId, dependencies);
  }
  if (command === "report" || command === "cleanup-db" || command === "purge-raw") {
    return readPopulationFixtureAuthority(store.runDirectory, runId, dependencies);
  }
  return null;
}

async function assertReportAvailable(
  store: H1ArtifactStore,
  authority: EffectiveFixtureAuthority | null,
): Promise<void> {
  const latest = await new RunLedgerStore(store.path("ledger")).loadLatest();
  if (!latest || (latest.phase !== "SEALED" && latest.phase !== "DB_CLEANED")) {
    throw new Error("SEALED_REPORT_REQUIRED");
  }
  if (authority) assertLedgerMatchesFixtureAuthority(authority, latest.scenarioId);
  const report = parseSanitizedEvidence(JSON.parse(
    await readPrivateText(store.path("sanitized", `${latest.scenarioId}.json`)),
  ));
  if (report.runId !== latest.runId || report.scenarioId !== latest.scenarioId) {
    throw new Error("SEALED_REPORT_INVALID");
  }
}

async function assertPurgeReady(
  store: H1ArtifactStore,
  authority: EffectiveFixtureAuthority | null,
): Promise<void> {
  const latest = await new RunLedgerStore(store.path("ledger")).loadLatest();
  if (latest?.phase !== "DB_CLEANED") throw new Error("DATABASE_CLEANUP_REQUIRED");
  if (authority) assertLedgerMatchesFixtureAuthority(authority, latest.scenarioId);
  await Promise.all([
    readPrivateText(store.path("sealed", `${latest.scenarioId}.json`)),
    readPrivateText(store.path("sanitized", `${latest.scenarioId}.json`)),
  ]);
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && pathToFileURL(entry).href === import.meta.url);
}

function safeCliFailureCode(error: unknown): string {
  if (error instanceof Error && [
    S4_PROVIDER_PROBE_RETIRED,
    S5_ACCEPTANCE_SCENARIO_RETIRED,
    S6_ACCEPTANCE_SCENARIO_RETIRED,
  ].includes(error.message)) return error.message;
  return isFixturePopulationError(error)
    || (error instanceof H1ContractError && error.code.startsWith("FIXTURE_POPULATION_"))
    ? error.code
    : STATIC_FAILURE;
}

if (isMainModule()) {
  const argv = process.argv.slice(2);
  const loadEnvironment = argv[0] === "populate-fixtures"
    ? Promise.resolve()
    : import("dotenv/config").then(() => undefined);
  loadEnvironment.then(() => runCliProcess(argv)).then((exitCode) => {
    process.exitCode = exitCode;
  }).catch(() => {
    process.stderr.write(`${STATIC_FAILURE}\n`);
    process.exitCode = 1;
  });
}
