import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

export const EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION =
  "EXPLICIT_EXIMBAY_P3E_SANDBOX_DATABASE_BOOTSTRAP" as const;
export const EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT = "SANDBOX" as const;
export const EXIMBAY_P3E_APPROVAL_MIGRATION =
  "20260825130000_eximbay_refund_sandbox_canary_approval" as const;

export type EximbayP3eBootstrapArtifactId =
  | "FROZEN_HISTORICAL_ROLE_AUTHORITY"
  | "EXIMBAY_CANARY_ROLE_GRANT_DELTA";

export type EximbayP3eBootstrapArtifact = Readonly<{
  id: EximbayP3eBootstrapArtifactId;
  repositoryPath: string;
  absolutePath: string;
  sha256: string;
}>;

const repositoryRoot = resolve(import.meta.dirname, "..");

export const EXIMBAY_P3E_DATABASE_BOOTSTRAP_ARTIFACTS = Object.freeze([
  Object.freeze({
    id: "FROZEN_HISTORICAL_ROLE_AUTHORITY",
    repositoryPath: "infra/refund-sandbox/p3e-b2/runtime-deferred/database_roles.sql",
    absolutePath: resolve(
      repositoryRoot,
      "infra/refund-sandbox/p3e-b2/runtime-deferred/database_roles.sql",
    ),
    sha256: "a8ddd82fc14f09db4caee476377d15b6584e3c7e9cf4828ad8aed977d924d614",
  }),
  Object.freeze({
    id: "EXIMBAY_CANARY_ROLE_GRANT_DELTA",
    repositoryPath: "infra/refund-sandbox/p3e-b2/eximbay-canary/database-role-grants.sql",
    absolutePath: resolve(
      repositoryRoot,
      "infra/refund-sandbox/p3e-b2/eximbay-canary/database-role-grants.sql",
    ),
    sha256: "f25de97819786dfc6dc2d4ce462268ab60a3ef82fb583701823f33762f92b790",
  }),
] satisfies readonly EximbayP3eBootstrapArtifact[]);

type RuntimeRole = "mira_refund_preflight" | "mira_refund_canary";
type AdmittedDatabaseName = "refund_sandbox" | "wig_platform_test";

export type EximbayP3eDatabaseBootstrapInput = Readonly<{
  admission: typeof EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION;
  environment: typeof EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT;
  targetDatabaseName: AdmittedDatabaseName;
}>;

export type EximbayP3eDatabaseBootstrapDependencies = Readonly<{
  readArtifact: (artifact: EximbayP3eBootstrapArtifact) => Promise<string>;
  executeArtifact: (
    database: Client,
    artifact: EximbayP3eBootstrapArtifact,
    sql: string,
  ) => Promise<void>;
  beforePostcondition: (database: Client) => Promise<void>;
}>;

export type EximbayP3eCanaryRoleGrantDependencies = Readonly<{
  readArtifact: (artifact: EximbayP3eBootstrapArtifact) => Promise<string>;
  executeArtifact: (
    database: Client,
    artifact: EximbayP3eBootstrapArtifact,
    sql: string,
  ) => Promise<void>;
  verifyExactLedger: (database: Client) => Promise<void>;
  beforePostcondition: (database: Client) => Promise<void>;
}>;

export type EximbayP3eDatabaseBootstrapResult = Readonly<{
  ok: true;
  code: "EXIMBAY_P3E_DATABASE_BOOTSTRAP_COMPLETE";
  migration: typeof EXIMBAY_P3E_APPROVAL_MIGRATION;
  artifacts: readonly Readonly<{
    id: EximbayP3eBootstrapArtifactId;
    repositoryPath: string;
    sha256: string;
  }>[];
  postcondition: "EXACT_EFFECTIVE_PRIVILEGES_VERIFIED";
}>;

export type EximbayP3eCanaryRoleGrantResult = Readonly<{
  ok: true;
  code: "EXIMBAY_P3E_CANARY_ROLE_GRANTS_COMPLETE";
  migration: typeof EXIMBAY_P3E_APPROVAL_MIGRATION;
  artifact: Readonly<{
    id: "EXIMBAY_CANARY_ROLE_GRANT_DELTA";
    repositoryPath: string;
    sha256: string;
  }>;
  postcondition: "EXACT_EFFECTIVE_PRIVILEGES_VERIFIED";
}>;

export type EximbayP3eDatabaseBootstrapErrorCode =
  | "BOOTSTRAP_NOT_EXPLICITLY_ADMITTED"
  | "BOOTSTRAP_TARGET_INVALID"
  | "REQUIRED_MIGRATION_ABSENT"
  | "HISTORICAL_AUTHORITY_INTEGRITY_FAILURE"
  | "EXIMBAY_DELTA_INTEGRITY_FAILURE"
  | "HISTORICAL_AUTHORITY_SHAPE_INVALID"
  | "ROLE_AUTHORITY_EXECUTION_FAILED"
  | "ROLE_AUTHORITY_POSTCONDITION_FAILED";

export class EximbayP3eDatabaseBootstrapError extends Error {
  readonly code: EximbayP3eDatabaseBootstrapErrorCode;

  constructor(code: EximbayP3eDatabaseBootstrapErrorCode) {
    super(code);
    this.name = "EximbayP3eDatabaseBootstrapError";
    this.code = code;
  }
}

export const defaultEximbayP3eDatabaseBootstrapDependencies = Object.freeze({
  readArtifact: async (artifact: EximbayP3eBootstrapArtifact) =>
    readFile(artifact.absolutePath, "utf8"),
  executeArtifact: async (
    database: Client,
    _artifact: EximbayP3eBootstrapArtifact,
    sql: string,
  ) => {
    await database.query(sql);
  },
  beforePostcondition: () => Promise.resolve(),
} satisfies EximbayP3eDatabaseBootstrapDependencies);

const PRE_FLIGHT_SELECT = new Set([
  "_prisma_migrations",
  "Order",
  "RefundAttempt",
  "RefundExecutionCommand",
  "RefundExecutionDispatchAttempt",
  "RefundExecutionProviderOperationBinding",
  "RefundExecutionProviderEligibilityProof",
  "RefundExecutionProviderContactEligibilityProof",
  "EximbayRefundSandboxCanaryApproval",
]);

const CANARY_SELECT = new Set([
  "_prisma_migrations",
  "CheckoutSession",
  "Payment",
  "Order",
  "RefundAttempt",
  "RefundAttemptTransition",
  "RefundExecutionCommand",
  "RefundExecutionCommandEvent",
  "RefundExecutionDispatchAttempt",
  "RefundExecutionProviderOperationBinding",
  "RefundExecutionProviderEligibilityProof",
  "RefundExecutionProviderContactEligibilityProof",
  "RefundExecutionEvidence",
  "RefundExecutionEximbayPreflightObservation",
  "EximbayRefundSandboxCanaryApproval",
]);

const CANARY_TABLE_UPDATE = new Set([
  "Order",
  "RefundAttempt",
  "RefundExecutionCommand",
  "RefundExecutionDispatchAttempt",
]);

const CANARY_INSERT = new Set([
  "PaymentOutbox",
  "RefundAttemptTransition",
  "RefundExecutionCommandEvent",
  "RefundExecutionDispatchAttempt",
  "RefundExecutionProviderOperationBinding",
  "RefundExecutionProviderEligibilityProof",
  "RefundExecutionProviderContactEligibilityProof",
  "RefundExecutionEvidence",
  "RefundExecutionEximbayPreflightObservation",
]);

const CANARY_APPROVAL_UPDATE_COLUMNS = new Set([
  "consumedAt",
  "consumedExecutionId",
  "consumedExecutionBindingDigest",
]);

const CANARY_ROW_LOCK_UPDATE_COLUMNS = new Set([
  "Payment.id",
  "RefundExecutionCommandEvent.id",
  "RefundExecutionEvidence.id",
  "RefundExecutionProviderOperationBinding.id",
]);

export async function applyEximbayP3eCanaryRoleGrants(
  database: Client,
  input: EximbayP3eDatabaseBootstrapInput,
  dependencies: EximbayP3eCanaryRoleGrantDependencies,
): Promise<EximbayP3eCanaryRoleGrantResult> {
  requireAdmittedInput(input);
  const artifact = EXIMBAY_P3E_DATABASE_BOOTSTRAP_ARTIFACTS.find(
    (candidate) => candidate.id === "EXIMBAY_CANARY_ROLE_GRANT_DELTA",
  );
  if (!artifact) {
    throw new EximbayP3eDatabaseBootstrapError("EXIMBAY_DELTA_INTEGRITY_FAILURE");
  }
  const sql = await readAndVerifyArtifact(artifact, dependencies.readArtifact);

  let transactionOpen = false;
  try {
    await database.query("BEGIN");
    transactionOpen = true;
    await requireExactDatabase(database, input.targetDatabaseName);
    await dependencies.verifyExactLedger(database);
    await requireApprovalMigration(database);
    await dependencies.executeArtifact(database, artifact, sql);
    await dependencies.beforePostcondition(database);
    await verifyExactEffectivePrivileges(database);
    await database.query("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) await database.query("ROLLBACK").catch(() => undefined);
    if (error instanceof EximbayP3eDatabaseBootstrapError) throw error;
    throw new EximbayP3eDatabaseBootstrapError("ROLE_AUTHORITY_EXECUTION_FAILED");
  }

  return Object.freeze({
    ok: true,
    code: "EXIMBAY_P3E_CANARY_ROLE_GRANTS_COMPLETE",
    migration: EXIMBAY_P3E_APPROVAL_MIGRATION,
    artifact: Object.freeze({
      id: artifact.id,
      repositoryPath: artifact.repositoryPath,
      sha256: artifact.sha256,
    }),
    postcondition: "EXACT_EFFECTIVE_PRIVILEGES_VERIFIED",
  });
}

export async function bootstrapEximbayP3eDatabaseRoles(
  database: Client,
  input: EximbayP3eDatabaseBootstrapInput,
  dependencies: EximbayP3eDatabaseBootstrapDependencies =
    defaultEximbayP3eDatabaseBootstrapDependencies,
): Promise<EximbayP3eDatabaseBootstrapResult> {
  requireAdmittedInput(input);
  await requireExactDatabase(database, input.targetDatabaseName);
  await requireApprovalMigration(database);

  const sqlByArtifact = await readAndVerifyArtifacts(dependencies);
  let transactionOpen = false;
  try {
    await database.query("BEGIN");
    transactionOpen = true;
    for (const artifact of EXIMBAY_P3E_DATABASE_BOOTSTRAP_ARTIFACTS) {
      const source = sqlByArtifact.get(artifact.id);
      if (source === undefined) {
        throw new EximbayP3eDatabaseBootstrapError(
          "ROLE_AUTHORITY_EXECUTION_FAILED",
        );
      }
      const executableSql = artifact.id === "FROZEN_HISTORICAL_ROLE_AUTHORITY"
        ? renderHistoricalAuthority(source, input.targetDatabaseName)
        : source;
      await dependencies.executeArtifact(database, artifact, executableSql);
    }
    await dependencies.beforePostcondition(database);
    await verifyExactEffectivePrivileges(database);
    await database.query("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) await database.query("ROLLBACK").catch(() => undefined);
    if (error instanceof EximbayP3eDatabaseBootstrapError) throw error;
    throw new EximbayP3eDatabaseBootstrapError("ROLE_AUTHORITY_EXECUTION_FAILED");
  }

  return Object.freeze({
    ok: true,
    code: "EXIMBAY_P3E_DATABASE_BOOTSTRAP_COMPLETE",
    migration: EXIMBAY_P3E_APPROVAL_MIGRATION,
    artifacts: Object.freeze(EXIMBAY_P3E_DATABASE_BOOTSTRAP_ARTIFACTS.map(
      ({ id, repositoryPath, sha256 }) => Object.freeze({ id, repositoryPath, sha256 }),
    )),
    postcondition: "EXACT_EFFECTIVE_PRIVILEGES_VERIFIED",
  });
}

function requireAdmittedInput(input: EximbayP3eDatabaseBootstrapInput): void {
  if (input.admission !== EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION
    || input.environment !== EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT
    || (input.targetDatabaseName !== "refund_sandbox"
      && input.targetDatabaseName !== "wig_platform_test")) {
    throw new EximbayP3eDatabaseBootstrapError("BOOTSTRAP_NOT_EXPLICITLY_ADMITTED");
  }
}

async function requireExactDatabase(
  database: Client,
  expectedDatabaseName: AdmittedDatabaseName,
): Promise<void> {
  const result = await database.query<{ databaseName: string }>(
    'SELECT current_database() AS "databaseName"',
  );
  if (result.rows.length !== 1 || result.rows[0]?.databaseName !== expectedDatabaseName) {
    throw new EximbayP3eDatabaseBootstrapError("BOOTSTRAP_TARGET_INVALID");
  }
}

async function requireApprovalMigration(database: Client): Promise<void> {
  let result;
  try {
    result = await database.query<{ count: number }>(`
      SELECT count(*)::int AS count
      FROM "_prisma_migrations"
      WHERE migration_name = $1
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    `, [EXIMBAY_P3E_APPROVAL_MIGRATION]);
  } catch {
    throw new EximbayP3eDatabaseBootstrapError("REQUIRED_MIGRATION_ABSENT");
  }
  if (result.rows.length !== 1 || result.rows[0]?.count !== 1) {
    throw new EximbayP3eDatabaseBootstrapError("REQUIRED_MIGRATION_ABSENT");
  }
}

async function readAndVerifyArtifacts(
  dependencies: EximbayP3eDatabaseBootstrapDependencies,
): Promise<ReadonlyMap<EximbayP3eBootstrapArtifactId, string>> {
  const sources = new Map<EximbayP3eBootstrapArtifactId, string>();
  for (const artifact of EXIMBAY_P3E_DATABASE_BOOTSTRAP_ARTIFACTS) {
    let source: string;
    try {
      source = await dependencies.readArtifact(artifact);
    } catch {
      throw integrityError(artifact.id);
    }
    if (sha256(source) !== artifact.sha256) throw integrityError(artifact.id);
    sources.set(artifact.id, source);
  }
  return sources;
}

async function readAndVerifyArtifact(
  artifact: EximbayP3eBootstrapArtifact,
  readArtifact: EximbayP3eCanaryRoleGrantDependencies["readArtifact"],
): Promise<string> {
  let source: string;
  try {
    source = await readArtifact(artifact);
  } catch {
    throw integrityError(artifact.id);
  }
  if (sha256(source) !== artifact.sha256) throw integrityError(artifact.id);
  return source;
}

function integrityError(
  artifactId: EximbayP3eBootstrapArtifactId,
): EximbayP3eDatabaseBootstrapError {
  return new EximbayP3eDatabaseBootstrapError(
    artifactId === "FROZEN_HISTORICAL_ROLE_AUTHORITY"
      ? "HISTORICAL_AUTHORITY_INTEGRITY_FAILURE"
      : "EXIMBAY_DELTA_INTEGRITY_FAILURE",
  );
}

function renderHistoricalAuthority(source: string, databaseName: AdmittedDatabaseName): string {
  const token = "DATABASE refund_sandbox";
  if (source.split(token).length - 1 !== 2) {
    throw new EximbayP3eDatabaseBootstrapError("HISTORICAL_AUTHORITY_SHAPE_INVALID");
  }
  return source.replaceAll(token, `DATABASE ${quoteIdentifier(databaseName)}`);
}

export async function verifyExactEffectivePrivileges(
  database: Pick<Client, "query">,
): Promise<void> {
  await verifyRole(database, "mira_refund_preflight");
  await verifyRole(database, "mira_refund_canary");
}

async function verifyRole(database: Pick<Client, "query">, role: RuntimeRole): Promise<void> {
  const safety = await database.query<RoleSafetyRow>(`
      SELECT
        role.rolcanlogin AS "canLogin",
        role.rolsuper AS "superuser",
        role.rolcreatedb AS "createDatabase",
        role.rolcreaterole AS "createRole",
        role.rolinherit AS "inherit",
        role.rolreplication AS "replication",
        role.rolbypassrls AS "bypassRls",
        has_database_privilege(role.rolname, current_database(), 'CONNECT') AS "connect",
        has_database_privilege(role.rolname, current_database(), 'CREATE') AS "databaseCreate",
        has_schema_privilege(role.rolname, 'public', 'USAGE') AS "schemaUsage",
        has_schema_privilege(role.rolname, 'public', 'CREATE') AS "schemaCreate",
        (
          SELECT count(*)::int FROM pg_auth_members membership
          WHERE membership.member = role.oid
        ) AS "membershipCount"
      FROM pg_roles role
      WHERE role.rolname = $1
    `, [role]);
  const tables = await database.query<TablePrivilegeRow>(`
      SELECT
        relation.relname AS "tableName",
        has_table_privilege($1, relation.oid, 'SELECT') AS "select",
        has_table_privilege($1, relation.oid, 'INSERT') AS "insert",
        has_table_privilege($1, relation.oid, 'UPDATE') AS "update",
        has_table_privilege($1, relation.oid, 'DELETE') AS "delete",
        has_table_privilege($1, relation.oid, 'TRUNCATE') AS "truncate",
        has_table_privilege($1, relation.oid, 'REFERENCES') AS "references",
        has_table_privilege($1, relation.oid, 'TRIGGER') AS "trigger"
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
      ORDER BY relation.relname
    `, [role]);
  const columns = await database.query<ColumnPrivilegeRow>(`
      SELECT
        relation.relname AS "tableName",
        attribute.attname AS "columnName",
        has_column_privilege($1, relation.oid, attribute.attnum, 'UPDATE') AS "update"
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
      WHERE namespace.nspname = 'public'
        AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
      ORDER BY relation.relname, attribute.attnum
    `, [role]);
  const sequences = await database.query<SequencePrivilegeRow>(`
      SELECT
        relation.relname AS "sequenceName",
        has_sequence_privilege($1, relation.oid, 'USAGE') AS "usage",
        has_sequence_privilege($1, relation.oid, 'SELECT') AS "select",
        has_sequence_privilege($1, relation.oid, 'UPDATE') AS "update"
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relkind = 'S'
      ORDER BY relation.relname
    `, [role]);

  requireRoleSafety(safety.rows);
  requireTablePrivileges(role, tables.rows);
  requireColumnPrivileges(role, columns.rows);
  requireNoSequencePrivileges(sequences.rows);
}

export function requireRoleSafety(rows: readonly RoleSafetyRow[]): void {
  const safetyRow = rows[0];
  const expected = Object.freeze<RoleSafetyRow>({
    canLogin: true,
    superuser: false,
    createDatabase: false,
    createRole: false,
    inherit: false,
    replication: false,
    bypassRls: false,
    connect: true,
    databaseCreate: false,
    schemaUsage: true,
    schemaCreate: false,
    membershipCount: 0,
  });
  if (rows.length !== 1 || !safetyRow) failPostcondition();
  for (const key of ROLE_SAFETY_KEYS) {
    if (safetyRow[key] !== expected[key]) failPostcondition();
  }
}

const ROLE_SAFETY_KEYS = Object.freeze([
  "canLogin",
  "superuser",
  "createDatabase",
  "createRole",
  "inherit",
  "replication",
  "bypassRls",
  "connect",
  "databaseCreate",
  "schemaUsage",
  "schemaCreate",
  "membershipCount",
] satisfies readonly (keyof RoleSafetyRow)[]);

function requireTablePrivileges(
  role: RuntimeRole,
  rows: readonly TablePrivilegeRow[],
): void {
  const expectedSelect = role === "mira_refund_preflight" ? PRE_FLIGHT_SELECT : CANARY_SELECT;
  for (const row of rows) {
    const expected = tablePrivilegeExpectation(role, row.tableName, expectedSelect);
    for (const key of TABLE_PRIVILEGE_KEYS) {
      if (row[key] !== expected[key]) failPostcondition();
    }
  }
}

const TABLE_PRIVILEGE_KEYS = Object.freeze([
  "select",
  "insert",
  "update",
  "delete",
  "truncate",
  "references",
  "trigger",
] satisfies readonly (keyof Omit<TablePrivilegeRow, "tableName">)[]);

function tablePrivilegeExpectation(
  role: RuntimeRole,
  tableName: string,
  expectedSelect: ReadonlySet<string>,
): Omit<TablePrivilegeRow, "tableName"> {
  const canary = role === "mira_refund_canary";
  return Object.freeze({
    select: expectedSelect.has(tableName),
    insert: canary && CANARY_INSERT.has(tableName),
    update: canary && CANARY_TABLE_UPDATE.has(tableName),
    delete: false,
    truncate: false,
    references: false,
    trigger: false,
  });
}

function requireColumnPrivileges(
  role: RuntimeRole,
  rows: readonly ColumnPrivilegeRow[],
): void {
  for (const row of rows) {
    const expectedUpdate = role === "mira_refund_canary"
      && (CANARY_TABLE_UPDATE.has(row.tableName)
        || CANARY_ROW_LOCK_UPDATE_COLUMNS.has(`${row.tableName}.${row.columnName}`)
        || (row.tableName === "EximbayRefundSandboxCanaryApproval"
          && CANARY_APPROVAL_UPDATE_COLUMNS.has(row.columnName)));
    if (row.update !== expectedUpdate) failPostcondition();
  }
}

function requireNoSequencePrivileges(rows: readonly SequencePrivilegeRow[]): void {
  if (rows.some((row) => row.usage || row.select || row.update)) {
    failPostcondition();
  }
}

function failPostcondition(): never {
  throw new EximbayP3eDatabaseBootstrapError("ROLE_AUTHORITY_POSTCONDITION_FAILED");
}

export type RoleSafetyRow = Readonly<{
  canLogin: boolean;
  superuser: boolean;
  createDatabase: boolean;
  createRole: boolean;
  inherit: boolean;
  replication: boolean;
  bypassRls: boolean;
  connect: boolean;
  databaseCreate: boolean;
  schemaUsage: boolean;
  schemaCreate: boolean;
  membershipCount: number;
}>;

type TablePrivilegeRow = Readonly<{
  tableName: string;
  select: boolean;
  insert: boolean;
  update: boolean;
  delete: boolean;
  truncate: boolean;
  references: boolean;
  trigger: boolean;
}>;

type ColumnPrivilegeRow = Readonly<{
  tableName: string;
  columnName: string;
  update: boolean;
}>;

type SequencePrivilegeRow = Readonly<{
  sequenceName: string;
  usage: boolean;
  select: boolean;
  update: boolean;
}>;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function quoteIdentifier(value: AdmittedDatabaseName): string {
  return `"${value.replaceAll('"', '""')}"`;
}

type BootstrapEnvironment = Readonly<Record<string, string | undefined>>;
type BootstrapOutput = Readonly<{
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
}>;

export async function main(
  args: readonly string[] = process.argv.slice(2),
  env: BootstrapEnvironment = process.env,
  output: BootstrapOutput = Object.freeze({
    stdout: process.stdout,
    stderr: process.stderr,
  }),
): Promise<number> {
  if (args.length !== 0) return 64;
  const configuration = parseOperatorEnvironment(env);
  if (!configuration) {
    output.stderr.write('{"ok":false,"code":"BOOTSTRAP_NOT_EXPLICITLY_ADMITTED"}\n');
    return 1;
  }

  const database = new Client({ connectionString: configuration.databaseUrl });
  try {
    await database.connect();
    const result = await bootstrapEximbayP3eDatabaseRoles(database, {
      admission: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
      environment: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
      targetDatabaseName: "refund_sandbox",
    });
    output.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch {
    output.stderr.write('{"ok":false,"code":"EXIMBAY_P3E_DATABASE_BOOTSTRAP_FAILED"}\n');
    return 1;
  } finally {
    await database.end().catch(() => undefined);
  }
}

function parseOperatorEnvironment(
  env: BootstrapEnvironment,
): Readonly<{ databaseUrl: string }> | null {
  if (env.EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION
      !== EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION
    || env.EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT
      !== EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT
    || typeof env.DATABASE_URL !== "string") {
    return null;
  }
  try {
    const url = new URL(env.DATABASE_URL);
    const protocol = url.protocol === "postgresql:" || url.protocol === "postgres:";
    const databaseName = decodeURIComponent(url.pathname.replace(/^\//u, ""));
    if (!protocol || databaseName !== "refund_sandbox" || url.username.length === 0) return null;
    return Object.freeze({ databaseUrl: env.DATABASE_URL });
  } catch {
    return null;
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  process.exitCode = await main();
}
