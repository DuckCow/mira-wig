import "dotenv/config";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertExternalArtifactRoot, ordinaryDelete, readPrivateText } from "./atomic-files";
import { H1_ARTIFACT_PARENT, H1ArtifactStore } from "./artifact-store";
import {
  generateRunId, parseH1Command, requirePurgeAcknowledgement,
} from "./contracts";
import { readFixtureManifest } from "./fixture-manifest";
import { runDatabaseCommand } from "./cli-runtime";
import { RunLedgerStore } from "./run-ledger";

const WORKTREE = resolve(import.meta.dirname, "../..");
const STATIC_FAILURE = "H1_COMMAND_FAILED";

export async function runCli(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<Readonly<{ code: string; runId?: string }>> {
  const parsed = parseH1Command(argv);
  const root = await assertExternalArtifactRoot(H1_ARTIFACT_PARENT, WORKTREE);
  if (parsed.command === "plan") return plan(root);
  if (!parsed.runId) throw new Error("INVALID_RUN_ID");
  const store = new H1ArtifactStore(root, parsed.runId);
  await store.assertModes();
  const local = await localCommand(parsed.command, parsed.runId, store, env);
  if (local) return local;
  const manifest = commandNeedsFixture(parsed.command)
    ? await readFixtureManifest(store.path("fixtures.json"), parsed.runId)
    : null;
  return runDatabaseCommand(parsed, env, store, manifest, WORKTREE);
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
): Promise<Readonly<{ code: string; runId: string }> | null> {
  if (command === "inspect" || command === "status") {
    return Object.freeze({ code: "RUN_INSPECTED", runId });
  }
  if (command === "validate-fixtures") {
    await readFixtureManifest(store.path("fixtures.json"), runId);
    return Object.freeze({ code: "FIXTURES_VALID", runId });
  }
  if (command === "report") {
    await assertReportAvailable(store);
    return Object.freeze({ code: "REPORT_AVAILABLE", runId });
  }
  if (command !== "purge-raw") return null;
  requirePurgeAcknowledgement(env, runId);
  await assertPurgeReady(store);
  await ordinaryDelete(store.path("raw"));
  return Object.freeze({ code: "RAW_PURGED", runId });
}

function commandNeedsFixture(command: ReturnType<typeof parseH1Command>["command"]): boolean {
  return command === "execute" || command === "resume" || command === "resume-post" || command === "seal";
}

async function assertReportAvailable(store: H1ArtifactStore): Promise<void> {
  const latest = await new RunLedgerStore(store.path("ledger")).loadLatest();
  if (!latest || (latest.phase !== "SEALED" && latest.phase !== "DB_CLEANED")) {
    throw new Error("SEALED_REPORT_REQUIRED");
  }
  await readPrivateText(store.path("sanitized", `${latest.scenarioId}.json`));
}

async function assertPurgeReady(store: H1ArtifactStore): Promise<void> {
  const latest = await new RunLedgerStore(store.path("ledger")).loadLatest();
  if (latest?.phase !== "DB_CLEANED") throw new Error("DATABASE_CLEANUP_REQUIRED");
  await Promise.all([
    readPrivateText(store.path("sealed", `${latest.scenarioId}.json`)),
    readPrivateText(store.path("sanitized", `${latest.scenarioId}.json`)),
  ]);
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && pathToFileURL(entry).href === import.meta.url);
}

if (isMainModule()) {
  runCli(process.argv.slice(2)).then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch(() => {
    process.stderr.write(`${STATIC_FAILURE}\n`);
    process.exitCode = 1;
  });
}
