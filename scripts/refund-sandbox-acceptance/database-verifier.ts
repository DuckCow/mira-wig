import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { canonicalJson } from "./canonical-json";
import {
  verifyDatabaseInvariants,
  type DatabaseInvariantQueryClient,
} from "./database-invariants";

export const ACCEPTANCE_DATABASE_NAME = "wig_platform_acceptance";
export const PRISMA_VERIFY_TIMEOUT_MS = 120_000;
const PRISMA_COMMAND = Object.freeze({
  executable: "npx",
  timeoutMs: PRISMA_VERIFY_TIMEOUT_MS,
  killSignal: "SIGKILL" as const,
  shell: false as const,
  stdio: "ignore" as const,
});

export type PrismaCommandSpec = typeof PRISMA_COMMAND & Readonly<{
  arguments: readonly string[];
  environment: NodeJS.ProcessEnv;
}>;
type PrismaCommandResult = Readonly<{
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
}>;
export type PrismaCommandRunner = (spec: PrismaCommandSpec) => Promise<PrismaCommandResult>;

export type MigrationRecord = Readonly<{
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  applied_steps_count: number;
}>;

export type RepositoryMigration = Readonly<{ name: string; checksum: string }>;

export type VerifiedAcceptanceDatabase = Readonly<{
  databaseName: typeof ACCEPTANCE_DATABASE_NAME;
  migrationFingerprint: string;
}>;

export function databaseNameFromUrl(raw: string | undefined): string {
  if (!raw) throw new Error("DATABASE_URL_REQUIRED");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL_INVALID");
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!name || name.includes("/")) throw new Error("DATABASE_URL_INVALID");
  return name;
}

export async function verifyAcceptanceDatabase(
  client: DatabaseInvariantQueryClient,
  options: Readonly<{
    configuredUrl: string | undefined;
    migrationsDirectory: string;
    prismaCommandRunner?: PrismaCommandRunner;
  }>,
): Promise<VerifiedAcceptanceDatabase> {
  const configuredUrl = options.configuredUrl;
  if (!configuredUrl) throw new Error("DATABASE_URL_REQUIRED");
  const configuredName = databaseNameFromUrl(configuredUrl);
  if (configuredName !== ACCEPTANCE_DATABASE_NAME) throw new Error("ACCEPTANCE_DATABASE_REQUIRED");
  const database = await client.$queryRaw<{ databaseName: string }[]>`
    SELECT current_database() AS "databaseName"
  `;
  if (database.length !== 1 || database[0].databaseName !== ACCEPTANCE_DATABASE_NAME) {
    throw new Error("ACCEPTANCE_DATABASE_IDENTITY_MISMATCH");
  }
  const repository = await repositoryMigrations(options.migrationsDirectory);
  const applied = await client.$queryRaw<MigrationRecord[]>`
    SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
    FROM "_prisma_migrations" ORDER BY migration_name ASC
  `;
  verifyMigrationRecords(repository, applied);
  await defaultDriftCheck(configuredUrl, options.prismaCommandRunner);
  await verifyDatabaseInvariants(client);
  return Object.freeze({
    databaseName: ACCEPTANCE_DATABASE_NAME,
    migrationFingerprint: migrationFingerprint(repository),
  });
}

export async function repositoryMigrations(directory: string): Promise<readonly RepositoryMigration[]> {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const migrations: RepositoryMigration[] = [];
  for (const name of entries) {
    const body = await readFile(join(directory, name, "migration.sql"));
    migrations.push(Object.freeze({ name, checksum: createHash("sha256").update(body).digest("hex") }));
  }
  return Object.freeze(migrations);
}

export function verifyMigrationRecords(
  repository: readonly RepositoryMigration[],
  applied: readonly MigrationRecord[],
): void {
  if (repository.length !== applied.length) throw new Error("MIGRATION_SET_MISMATCH");
  for (let index = 0; index < repository.length; index += 1) {
    const expected = repository[index];
    const actual = applied[index];
    if (!expected || !actual || actual.migration_name !== expected.name) {
      throw new Error("MIGRATION_SET_MISMATCH");
    }
    if (actual.checksum !== expected.checksum) throw new Error("MIGRATION_CHECKSUM_MISMATCH");
    if (!actual.finished_at || actual.rolled_back_at || actual.applied_steps_count < 1) {
      throw new Error("MIGRATION_STATE_INVALID");
    }
  }
}

export function migrationFingerprint(migrations: readonly RepositoryMigration[]): string {
  return createHash("sha256").update(canonicalJson(migrations)).digest("hex");
}

export async function defaultDriftCheck(
  configuredUrl: string,
  runner: PrismaCommandRunner = runPrismaCommand,
): Promise<void> {
  await runPrisma(["validate"], configuredUrl, runner);
  await runPrisma([
    "migrate", "diff", "--exit-code", "--from-config-datasource",
    "--to-schema", "prisma/schema.prisma",
  ], configuredUrl, runner);
}

async function runPrisma(
  args: readonly string[],
  configuredUrl: string,
  runner: PrismaCommandRunner,
): Promise<void> {
  let result: PrismaCommandResult;
  try {
    result = await runner(Object.freeze({
      ...PRISMA_COMMAND,
      arguments: Object.freeze(["prisma", ...args]),
      environment: Object.freeze({ ...process.env, DATABASE_URL: configuredUrl }),
    }));
  } catch {
    throw prismaVerificationFailure();
  }
  if (result.exitCode !== 0 || result.signal !== null || result.timedOut) {
    throw prismaVerificationFailure();
  }
}

function runPrismaCommand(spec: PrismaCommandSpec): Promise<PrismaCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(spec.executable, [...spec.arguments], {
      env: spec.environment,
      shell: spec.shell,
      detached: false,
      stdio: spec.stdio,
      windowsHide: true,
    });
    let timedOut = false;
    let spawnFailed = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill(spec.killSignal);
    }, spec.timeoutMs);
    child.once("error", () => { spawnFailed = true; });
    child.once("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve(Object.freeze({
        exitCode: spawnFailed ? null : exitCode,
        signal,
        timedOut,
      }));
    });
  });
}

function prismaVerificationFailure(): Error {
  return new Error("PRISMA_VERIFICATION_FAILED");
}
