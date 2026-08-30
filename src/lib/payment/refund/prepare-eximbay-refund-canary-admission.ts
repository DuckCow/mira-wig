import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import {
  PaymentMode,
  PaymentProvider,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  EXIMBAY_LIVE_API_KEY,
  EXIMBAY_SANDBOX_API_KEY,
  TOSS_LIVE_SECRET_KEY,
  TOSS_SANDBOX_SECRET_KEY,
} from "@/lib/payment/providers/credentials";
import {
  EXIMBAY_REFUND_CANARY_FRESH_SALE_CUSTODY_MAX_BYTES,
  parseEximbayRefundCanaryFreshSaleCustodyBytes,
  type EximbayRefundCanaryFreshSaleCustody,
} from "./eximbay-refund-canary-fresh-sale-custody";
import { inspectEximbayRefundCanaryOneTargetInventory } from
  "./eximbay-refund-canary-inventory";
import {
  eximbayRefundCanaryDatabaseSessionIssuer,
  EXIMBAY_REFUND_SANDBOX_CANARY_APPROVAL_VERSION,
} from "./eximbay-refund-sandbox-canary-approval-contract";
import { sealEximbayRefundCanaryTargetInTransaction } from
  "./eximbay-refund-canary-target-binding";
import {
  loadRefundWorkerMigrationInventory,
  type RefundWorkerMigrationInventory,
} from "./worker-migration-inventory";

const PREPARATION_PREFIX = "MIRA_REFUND_EXIMBAY_PREPARATION_";
const ARTIFACT_PATH = `${PREPARATION_PREFIX}ARTIFACT_PATH`;
const EXPECTED_SHA256 = `${PREPARATION_PREFIX}EXPECTED_SHA256`;
const PREPARATION_KEYS = Object.freeze([ARTIFACT_PATH, EXPECTED_SHA256]);
const DIGEST = /^[0-9a-f]{64}$/u;
const APPROVAL_LIFETIME_MS = 15 * 60_000;

type PreparationEnv = Readonly<Record<string, string | undefined>>;
type PreparationOutput = Readonly<{
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
}>;

export type EximbayRefundCanaryPreparationResult =
  | Readonly<{
      ok: true;
      code: "EXIMBAY_REFUND_CANARY_APPROVAL_CREATED";
      commandId: string;
      approvalId: string;
      custodyArtifactSha256: string;
      targetBindingDigest: string;
      issuerAuthority: "AUTHENTICATED_POSTGRES_SESSION";
      externalAuthority: "NOT_AUTHENTICATED_BY_SOURCE";
    }>
  | Readonly<{
      ok: false;
      code: "APPROVAL_ALREADY_EXISTS" | "CONFIG_INVALID" | "ARTIFACT_INVALID"
        | "DATABASE_UNAVAILABLE" | "DATABASE_IDENTITY_MISMATCH"
        | "MIGRATION_IDENTITY_MISMATCH" | "TARGET_NOT_ADMISSIBLE"
        | "ISSUER_AUTHORITY_INVALID" | "PERSISTENCE_CONFLICT";
    }>;

export type EximbayRefundCanaryPreparationDependencies = Readonly<{
  readArtifact: (path: string) => Promise<Uint8Array>;
  loadMigrationInventory: () => Promise<RefundWorkerMigrationInventory>;
  createDatabase: (connectionString: string) => PrismaClient;
  disconnectDatabase: (database: PrismaClient) => Promise<void>;
}>;

export const defaultEximbayRefundCanaryPreparationDependencies:
EximbayRefundCanaryPreparationDependencies = Object.freeze({
  readArtifact: readExactArtifact,
  loadMigrationInventory: loadRefundWorkerMigrationInventory,
  createDatabase: (connectionString) => new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  }),
  disconnectDatabase: (database) => database.$disconnect(),
});

export async function runEximbayRefundCanaryPreparation(
  env: PreparationEnv,
  dependencies: EximbayRefundCanaryPreparationDependencies =
    defaultEximbayRefundCanaryPreparationDependencies,
): Promise<EximbayRefundCanaryPreparationResult> {
  const config = parsePreparationEnvironment(env);
  if (!config) return failure("CONFIG_INVALID");
  const loaded = await loadPreparationInputs(config, dependencies);
  if (!loaded) return failure("ARTIFACT_INVALID");
  const artifact = parseEximbayRefundCanaryFreshSaleCustodyBytes(
    loaded.bytes, config.expectedSha256,
  );
  if (!artifact) return failure("ARTIFACT_INVALID");
  const database = createPreparationDatabase(config.connectionString, dependencies);
  if (!database) return failure("DATABASE_UNAVAILABLE");
  return runPreparationWithDatabase(database, artifact, config.expectedSha256,
    loaded.migrations, dependencies);
}

async function loadPreparationInputs(
  config: Readonly<{ artifactPath: string }>,
  dependencies: EximbayRefundCanaryPreparationDependencies,
): Promise<Readonly<{
  bytes: Uint8Array;
  migrations: RefundWorkerMigrationInventory;
}> | null> {
  try {
    const [bytes, migrations] = await Promise.all([
      dependencies.readArtifact(config.artifactPath),
      dependencies.loadMigrationInventory(),
    ]);
    return Object.freeze({ bytes, migrations });
  } catch {
    return null;
  }
}

function createPreparationDatabase(
  connectionString: string,
  dependencies: EximbayRefundCanaryPreparationDependencies,
): PrismaClient | null {
  try {
    return dependencies.createDatabase(connectionString);
  } catch {
    return null;
  }
}

async function runPreparationWithDatabase(
  database: PrismaClient,
  artifact: EximbayRefundCanaryFreshSaleCustody,
  custodyArtifactSha256: string,
  migrations: RefundWorkerMigrationInventory,
  dependencies: EximbayRefundCanaryPreparationDependencies,
): Promise<EximbayRefundCanaryPreparationResult> {
  let result: EximbayRefundCanaryPreparationResult;
  try {
    result = await prepareEximbayRefundCanaryAdmission(
      database, artifact, custodyArtifactSha256, migrations,
    );
  } catch {
    result = failure("PERSISTENCE_CONFLICT");
  }
  try {
    await dependencies.disconnectDatabase(database);
  } catch {
    return failure("DATABASE_UNAVAILABLE");
  }
  return result;
}

export async function prepareEximbayRefundCanaryAdmission(
  client: PrismaClient,
  artifact: EximbayRefundCanaryFreshSaleCustody,
  custodyArtifactSha256: string,
  migrations: RefundWorkerMigrationInventory,
): Promise<EximbayRefundCanaryPreparationResult> {
  if (!DIGEST.test(custodyArtifactSha256)) return failure("ARTIFACT_INVALID");
  try {
    return await client.$transaction(
      (tx) => prepareInTransaction(tx, artifact, custodyArtifactSha256, migrations),
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  } catch (error) {
    return isUniqueConflict(error)
      ? classifyApprovalAfterConflict(client, artifact.commandId)
      : failure("PERSISTENCE_CONFLICT");
  }
}

async function prepareInTransaction(
  tx: Prisma.TransactionClient,
  artifact: EximbayRefundCanaryFreshSaleCustody,
  custodyArtifactSha256: string,
  migrations: RefundWorkerMigrationInventory,
): Promise<EximbayRefundCanaryPreparationResult> {
  const availability = await approvalAvailability(tx, artifact.commandId);
  if (availability) return failure(availability);
  const authority = await databaseAuthority(tx);
  if (!authority || authority.databaseName !== artifact.databaseName) {
    return failure("DATABASE_IDENTITY_MISMATCH");
  }
  if (!(await migrationAuthorityMatches(tx, artifact, migrations))) {
    return failure("MIGRATION_IDENTITY_MISMATCH");
  }
  if (!(await inspectEximbayRefundCanaryOneTargetInventory(tx, artifact))) {
    return failure("TARGET_NOT_ADMISSIBLE");
  }
  const issuer = authenticatedDatabaseIssuer(authority);
  if (!issuer) return failure("ISSUER_AUTHORITY_INVALID");
  const target = await sealEximbayRefundCanaryTargetInTransaction(tx, {
    commandId: artifact.commandId,
    merchantAccountBindingId: artifact.merchantAccountBindingId,
    credentialGenerationBindingId: artifact.credentialGenerationBindingId,
    custodyArtifactSha256,
  }).catch(() => null);
  if (!target) return failure("TARGET_NOT_ADMISSIBLE");
  const approval = await tx.eximbayRefundSandboxCanaryApproval.create({
    data: {
      formatVersion: EXIMBAY_REFUND_SANDBOX_CANARY_APPROVAL_VERSION,
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX,
      approvalEvidenceDigest: custodyArtifactSha256,
      releaseBindingDigest: artifact.releaseBindingDigest,
      canaryJobBindingDigest: artifact.canaryJobBindingDigest,
      preflightJobBindingDigest: artifact.preflightJobBindingDigest,
      imageBindingDigest: artifact.imageBindingDigest,
      secretGenerationBindingDigest: artifact.secretGenerationBindingDigest,
      targetBindingDigest: target.targetBindingDigest,
      commandId: artifact.commandId,
      approvedAt: authority.databaseTime,
      expiresAt: new Date(authority.databaseTime.getTime() + APPROVAL_LIFETIME_MS),
      issuedByPrincipalId: issuer,
    },
    select: { id: true },
  });
  return Object.freeze({
    ok: true,
    code: "EXIMBAY_REFUND_CANARY_APPROVAL_CREATED",
    commandId: artifact.commandId,
    approvalId: approval.id,
    custodyArtifactSha256,
    targetBindingDigest: target.targetBindingDigest,
    issuerAuthority: "AUTHENTICATED_POSTGRES_SESSION",
    externalAuthority: "NOT_AUTHENTICATED_BY_SOURCE",
  });
}

async function approvalAvailability(
  tx: Prisma.TransactionClient,
  commandId: string,
): Promise<"TARGET_NOT_ADMISSIBLE" | "APPROVAL_ALREADY_EXISTS" | null> {
  if (!(await lockExactCommand(tx, commandId))) return "TARGET_NOT_ADMISSIBLE";
  const existing = await tx.eximbayRefundSandboxCanaryApproval.findUnique({
    where: { commandId }, select: { id: true },
  });
  return existing ? "APPROVAL_ALREADY_EXISTS" : null;
}

async function migrationAuthorityMatches(
  tx: Prisma.TransactionClient,
  artifact: EximbayRefundCanaryFreshSaleCustody,
  migrations: RefundWorkerMigrationInventory,
): Promise<boolean> {
  if (!migrationIdentityMatches(artifact, migrations)) return false;
  return databaseMigrationsMatch(tx, migrations);
}

function authenticatedDatabaseIssuer(authority: Readonly<{
  currentUser: string;
  sessionUser: string;
}>): string | null {
  if (authority.currentUser !== authority.sessionUser) return null;
  if (["mira_refund_preflight", "mira_refund_canary"].includes(authority.sessionUser)) {
    return null;
  }
  return eximbayRefundCanaryDatabaseSessionIssuer(authority.sessionUser);
}

function parsePreparationEnvironment(env: PreparationEnv): Readonly<{
  connectionString: string;
  artifactPath: string;
  expectedSha256: string;
}> | null {
  if (rawProviderSecretPresent(env) || unknownPreparationKeyPresent(env)) return null;
  const connectionString = trimmed(env.DATABASE_URL);
  const artifactPath = trimmed(env[ARTIFACT_PATH]);
  const expectedSha256 = trimmed(env[EXPECTED_SHA256]);
  if (!connectionString || !exactArtifactPath(artifactPath) || !DIGEST.test(expectedSha256)) {
    return null;
  }
  return Object.freeze({ connectionString, artifactPath, expectedSha256 });
}

async function readExactArtifact(path: string): Promise<Uint8Array> {
  const canonical = await realpath(path);
  if (canonical !== path) throw new Error("ARTIFACT_PATH_NOT_CANONICAL");
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!validArtifactStat(before)) throw new Error("ARTIFACT_FILE_INVALID");
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (!artifactReadStable(before, after, bytes)) throw new Error("ARTIFACT_FILE_CHANGED");
    return bytes;
  } finally {
    await handle.close();
  }
}

function validArtifactStat(value: Readonly<{
  isFile: () => boolean;
  size: number;
}>): boolean {
  return [value.isFile(), value.size > 0,
    value.size <= EXIMBAY_REFUND_CANARY_FRESH_SALE_CUSTODY_MAX_BYTES].every(Boolean);
}

function artifactReadStable(
  before: Readonly<{ dev: number; ino: number; size: number; mtimeMs: number }>,
  after: Readonly<{ dev: number; ino: number; size: number; mtimeMs: number }>,
  bytes: Uint8Array,
): boolean {
  return [before.dev === after.dev, before.ino === after.ino,
    before.size === after.size, before.mtimeMs === after.mtimeMs,
    bytes.byteLength === before.size].every(Boolean);
}

async function lockExactCommand(
  tx: Prisma.TransactionClient,
  commandId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundExecutionCommand" WHERE "id" = ${commandId} FOR UPDATE
  `);
  return rows.length === 1;
}

async function databaseAuthority(tx: Prisma.TransactionClient): Promise<Readonly<{
  databaseName: string;
  currentUser: string;
  sessionUser: string;
  databaseTime: Date;
}> | null> {
  const rows = await tx.$queryRaw<{
    databaseName: string;
    currentUser: string;
    sessionUser: string;
    databaseTime: Date;
  }[]>(Prisma.sql`
    SELECT current_database() AS "databaseName",
      current_user AS "currentUser",
      session_user AS "sessionUser",
      date_trunc('milliseconds', clock_timestamp()) AS "databaseTime"
  `);
  const row = rows[0];
  return rows.length === 1 && row?.databaseTime instanceof Date ? Object.freeze(row) : null;
}

function migrationIdentityMatches(
  artifact: EximbayRefundCanaryFreshSaleCustody,
  migrations: RefundWorkerMigrationInventory,
): boolean {
  return artifact.migrationCount === migrations.migrationCount
    && artifact.migrationDigest === migrations.migrationDigest;
}

async function databaseMigrationsMatch(
  tx: Prisma.TransactionClient,
  migrations: RefundWorkerMigrationInventory,
): Promise<boolean> {
  const records = await tx.$queryRaw<{
    migrationName: string;
    checksum: string;
    finishedAt: Date | null;
    rolledBackAt: Date | null;
    appliedStepsCount: number;
  }[]>(Prisma.sql`
    SELECT migration_name AS "migrationName", checksum,
      finished_at AS "finishedAt", rolled_back_at AS "rolledBackAt",
      applied_steps_count AS "appliedStepsCount"
    FROM "_prisma_migrations" ORDER BY migration_name
  `);
  if (records.length !== migrations.entries.length) return false;
  return migrations.entries.every((migration, index) => {
    const record = records[index];
    return record?.migrationName === migration.name
      && record.checksum === migration.sha256
      && record.finishedAt instanceof Date
      && record.rolledBackAt === null
      && record.appliedStepsCount >= 1;
  });
}

async function classifyApprovalAfterConflict(
  client: PrismaClient,
  commandId: string,
): Promise<EximbayRefundCanaryPreparationResult> {
  const existing = await client.eximbayRefundSandboxCanaryApproval.findUnique({
    where: { commandId }, select: { id: true },
  }).catch(() => null);
  return existing ? failure("APPROVAL_ALREADY_EXISTS") : failure("PERSISTENCE_CONFLICT");
}

function rawProviderSecretPresent(env: PreparationEnv): boolean {
  return [EXIMBAY_SANDBOX_API_KEY, EXIMBAY_LIVE_API_KEY,
    TOSS_SANDBOX_SECRET_KEY, TOSS_LIVE_SECRET_KEY]
    .some((key) => Object.prototype.hasOwnProperty.call(env, key));
}

function unknownPreparationKeyPresent(env: PreparationEnv): boolean {
  return Object.keys(env).some((key) => key.startsWith(PREPARATION_PREFIX)
    && !PREPARATION_KEYS.includes(key));
}

function exactArtifactPath(value: string): boolean {
  return value.length > 0 && value.length <= 1_024 && isAbsolute(value)
    && resolve(value) === value && !value.includes("\0");
}

function trimmed(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function failure(
  code: Extract<EximbayRefundCanaryPreparationResult, { ok: false }>["code"],
): EximbayRefundCanaryPreparationResult {
  return Object.freeze({ ok: false, code });
}

export async function runEximbayRefundCanaryPreparationProcess(
  args: readonly string[],
  env: PreparationEnv,
  output: PreparationOutput,
  dependencies: EximbayRefundCanaryPreparationDependencies =
    defaultEximbayRefundCanaryPreparationDependencies,
): Promise<number> {
  if (args.length !== 0) return 64;
  const result = await runEximbayRefundCanaryPreparation(env, dependencies);
  const line = `${JSON.stringify(result)}\n`;
  (result.ok ? output.stdout : output.stderr).write(line);
  return result.ok ? 0 : 1;
}
