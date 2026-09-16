import { hasRefundAuthorizationMigration, verifyRefundAuthorizationEntryPoints } from "./refund-authorization-privileges";
import { verifyExactCanaryLockRoutines } from "./eximbay-canary-lock-routine-authority";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";

export const EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION =
  "EXPLICIT_EXIMBAY_P3E_SANDBOX_DATABASE_BOOTSTRAP" as const;
export const EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT = "SANDBOX" as const;
export const EXIMBAY_P3E_APPROVAL_MIGRATION =
  "20260825130000_eximbay_refund_sandbox_canary_approval" as const;

export type EximbayP3eBootstrapArtifactId = "EXIMBAY_CANARY_ROLE_AUTHORITY";
export type EximbayP3eBootstrapArtifact = Readonly<{
  id: EximbayP3eBootstrapArtifactId;
  repositoryPath: string;
  absolutePath: string;
  sha256: string;
}>;

const repositoryRoot = resolve(import.meta.dirname, "..");

export const EXIMBAY_P3E_DATABASE_BOOTSTRAP_ARTIFACTS = Object.freeze([
  Object.freeze({
    id: "EXIMBAY_CANARY_ROLE_AUTHORITY",
    repositoryPath: "infra/refund-sandbox/p3e-b2/eximbay-canary/database-role-grants.sql",
    absolutePath: resolve(
      repositoryRoot,
      "infra/refund-sandbox/p3e-b2/eximbay-canary/database-role-grants.sql",
    ),
    sha256: "4d73a201553c5016e9d7ab58933d8f03fb95b94fd9a83ac4e3a200bb7298ead0",
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

export type EximbayP3eDatabaseBootstrapResult = Readonly<{
  ok: true;
  code: "EXIMBAY_P3E_DATABASE_BOOTSTRAP_COMPLETE";
  migration: typeof EXIMBAY_P3E_APPROVAL_MIGRATION;
  artifacts: readonly Readonly<{
    id: EximbayP3eBootstrapArtifactId;
    repositoryPath: string;
    sha256: string;
  }>[];
  historicalAuthorityExecuted: false;
  postcondition: "EXACT_EFFECTIVE_PRIVILEGES_VERIFIED";
}>;

export type EximbayP3eDatabaseBootstrapErrorCode =
  | "BOOTSTRAP_NOT_EXPLICITLY_ADMITTED"
  | "BOOTSTRAP_TARGET_INVALID"
  | "REQUIRED_MIGRATION_ABSENT"
  | "EXIMBAY_AUTHORITY_INTEGRITY_FAILURE"
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
    database: Pick<Client, "query">,
    _artifact: EximbayP3eBootstrapArtifact,
    sql: string,
  ) => {
    await database.query(sql);
  },
  beforePostcondition: () => Promise.resolve(),
} satisfies EximbayP3eDatabaseBootstrapDependencies);

const PREFLIGHT_TABLE_SELECT = new Set([
  "_prisma_migrations",
  "Order",
  "RefundAttempt",
  "RefundExecutionCommand",
  "RefundExecutionDispatchAttempt",
  "RefundExecutionProviderOperationBinding",
  "RefundExecutionProviderEligibilityProof",
  "RefundExecutionProviderContactEligibilityProof",
  "RefundExecutionEximbayPreflightObservation",
  "EximbayRefundSandboxCanaryApproval",
]);

const CANARY_TABLE_SELECT = new Set([
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
  "RefundExecutionEximbayPreflightObservation",
  "RefundExecutionEvidence",
  "EximbayRefundSandboxCanaryApproval",
]);

const CANARY_TABLE_INSERT = new Set([
  "RefundAttemptTransition",
  "RefundExecutionCommandEvent",
  "RefundExecutionDispatchAttempt",
  "RefundExecutionEximbayPreflightObservation",
  "RefundExecutionEvidence",
  "PaymentOutbox",
]);

const CANARY_COLUMN_SELECT = new Map<string, ReadonlySet<string>>([
  ["CheckoutSession", new Set(["id", "communicationLocale"])],
]);

const CANARY_COLUMN_UPDATE = new Map<string, ReadonlySet<string>>([
  ["Order", new Set(["status", "updatedAt"])],
  ["RefundAttempt", new Set([
    "status", "providerRefundId", "processedAt", "failedAt", "failureCode",
    "safeFailureMessage", "updatedAt",
  ])],
  ["RefundExecutionCommand", new Set([
    "status", "availableAt", "leaseOwner", "leaseUntil", "leaseGeneration",
    "leaseTokenHash", "dispatchAttempt", "lastSafeErrorCode",
    "lastSafeErrorMessage", "updatedAt",
  ])],
  ["RefundExecutionDispatchAttempt", new Set(["state", "contactMarkedAt"])],
  ["EximbayRefundSandboxCanaryApproval", new Set([
    "consumedAt", "consumedExecutionId", "consumedExecutionBindingDigest",
  ])],
]);

const CANARY_LOCK_ROUTINE_NAMES = new Set([
  "mira_refund_canary_lock_payment",
  "mira_refund_canary_lock_provider_operation_binding",
  "mira_refund_canary_lock_command_events",
  "mira_refund_canary_lock_evidence",
]);
const BOOLEAN_LOCK_ROUTINE_NAMES = new Set([
  "mira_refund_canary_lock_payment",
  "mira_refund_canary_lock_provider_operation_binding",
]);

export async function bootstrapEximbayP3eDatabaseRoles(
  database: Client,
  input: EximbayP3eDatabaseBootstrapInput,
  dependencies: EximbayP3eDatabaseBootstrapDependencies =
    defaultEximbayP3eDatabaseBootstrapDependencies,
): Promise<EximbayP3eDatabaseBootstrapResult> {
  requireAdmittedInput(input);
  await requireExactDatabase(database, input.targetDatabaseName);
  await requireApprovalMigration(database);
  const artifact = EXIMBAY_P3E_DATABASE_BOOTSTRAP_ARTIFACTS[0];
  const source = await readAndVerifyArtifact(artifact, dependencies);
  let transactionOpen = false;
  try {
    await database.query("BEGIN");
    transactionOpen = true;
    await dependencies.executeArtifact(database, artifact, source);
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
    historicalAuthorityExecuted: false,
    postcondition: "EXACT_EFFECTIVE_PRIVILEGES_VERIFIED",
  });
}

function requireAdmittedInput(input: EximbayP3eDatabaseBootstrapInput): void {
  const databaseAdmitted = ["refund_sandbox", "wig_platform_test"]
    .includes(input.targetDatabaseName);
  if ([
    input.admission === EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
    input.environment === EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
    databaseAdmitted,
  ].some((accepted) => !accepted)) {
    throw new EximbayP3eDatabaseBootstrapError("BOOTSTRAP_NOT_EXPLICITLY_ADMITTED");
  }
}

async function requireExactDatabase(
  database: Pick<Client, "query">,
  expectedDatabaseName: AdmittedDatabaseName,
): Promise<void> {
  const result = await database.query<{ databaseName: string }>(
    'SELECT current_database() AS "databaseName"',
  );
  if (result.rows.length !== 1 || result.rows[0]?.databaseName !== expectedDatabaseName) {
    throw new EximbayP3eDatabaseBootstrapError("BOOTSTRAP_TARGET_INVALID");
  }
}

async function requireApprovalMigration(database: Pick<Client, "query">): Promise<void> {
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

async function readAndVerifyArtifact(
  artifact: EximbayP3eBootstrapArtifact,
  dependencies: EximbayP3eDatabaseBootstrapDependencies,
): Promise<string> {
  let source: string;
  try {
    source = await dependencies.readArtifact(artifact);
  } catch {
    throw new EximbayP3eDatabaseBootstrapError("EXIMBAY_AUTHORITY_INTEGRITY_FAILURE");
  }
  if (sha256(source) !== artifact.sha256) {
    throw new EximbayP3eDatabaseBootstrapError("EXIMBAY_AUTHORITY_INTEGRITY_FAILURE");
  }
  return source;
}

export async function verifyExactEffectivePrivileges(database: Pick<Client, "query">): Promise<void> {
  await verifyCanonicalRole(database, "mira_refund_preflight");
  await verifyCanonicalRole(database, "mira_refund_canary");
  if (await defaultPrivilegeViolationCount(database) !== 0) failPostcondition();
}

export async function verifyCanonicalRole(database: Pick<Client, "query">, role: RuntimeRole, temporary: ReadonlySet<string> = new Set()): Promise<void> {
  const safety = await roleSafety(database, role);
  const tables = await tablePrivileges(database, role);
  const columns = await columnPrivileges(database, role);
  const sequences = await sequencePrivileges(database, role);
  const routines = await routinePrivileges(database, role);
  requireRoleSafety(safety.rows);
  requireTablePrivileges(role, tables.rows);
  requireColumnPrivileges(role, columns.rows, temporary);
  requireNoSequencePrivileges(sequences.rows);
  requireRoutinePrivileges(role, routines.rows);
  await verifyExactCanaryLockRoutines(database);
  if (await hasRefundAuthorizationMigration(database)) await verifyRefundAuthorizationEntryPoints(database, role);
}

function roleSafety(database: Pick<Client, "query">, role: RuntimeRole) {
  return database.query<RoleSafetyRow>(`
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
      has_database_privilege(role.rolname, current_database(), 'TEMPORARY')
        AS "databaseTemporary",
      has_schema_privilege(role.rolname, 'public', 'USAGE') AS "schemaUsage",
      has_schema_privilege(role.rolname, 'public', 'CREATE') AS "schemaCreate",
      (SELECT count(*)::int FROM pg_auth_members WHERE member = role.oid)
        AS "inboundMembershipCount",
      (SELECT count(*)::int FROM pg_auth_members WHERE roleid = role.oid)
        AS "outboundMembershipCount",
      (SELECT count(*)::int FROM pg_database WHERE datdba = role.oid)
        + (SELECT count(*)::int FROM pg_namespace WHERE nspowner = role.oid)
        + (SELECT count(*)::int FROM pg_class WHERE relowner = role.oid)
        + (SELECT count(*)::int FROM pg_proc WHERE proowner = role.oid)
        AS "ownedObjectCount",
      ARRAY(
        SELECT privilege_type::text
        FROM pg_database target,
          aclexplode(COALESCE(target.datacl, acldefault('d', target.datdba))) acl
        WHERE target.datname = current_database() AND acl.grantee = role.oid
        ORDER BY privilege_type
      ) AS "directDatabasePrivileges",
      ARRAY(
        SELECT privilege_type::text
        FROM pg_namespace target,
          aclexplode(COALESCE(target.nspacl, acldefault('n', target.nspowner))) acl
        WHERE target.nspname = 'public' AND acl.grantee = role.oid
        ORDER BY privilege_type
      ) AS "directSchemaPrivileges"
    FROM pg_roles role WHERE role.rolname = $1
  `, [role]);
}

function tablePrivileges(database: Pick<Client, "query">, role: RuntimeRole) {
  return database.query<TablePrivilegeRow>(`
    SELECT relation.relname AS "tableName",
      has_table_privilege($1, relation.oid, 'SELECT') AS "select",
      has_table_privilege($1, relation.oid, 'INSERT') AS "insert",
      has_table_privilege($1, relation.oid, 'UPDATE') AS "update",
      has_table_privilege($1, relation.oid, 'DELETE') AS "delete",
      has_table_privilege($1, relation.oid, 'TRUNCATE') AS "truncate",
      has_table_privilege($1, relation.oid, 'REFERENCES') AS "references",
      has_table_privilege($1, relation.oid, 'TRIGGER') AS "trigger"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
    ORDER BY relation.relname
  `, [role]);
}

function columnPrivileges(database: Pick<Client, "query">, role: RuntimeRole) {
  return database.query<ColumnPrivilegeRow>(`
    SELECT relation.relname AS "tableName", attribute.attname AS "columnName",
      has_column_privilege($1, relation.oid, attribute.attnum, 'SELECT') AS "select",
      has_column_privilege($1, relation.oid, attribute.attnum, 'INSERT') AS "insert",
      has_column_privilege($1, relation.oid, attribute.attnum, 'UPDATE') AS "update",
      has_column_privilege($1, relation.oid, attribute.attnum, 'REFERENCES') AS "references"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
    WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND attribute.attnum > 0 AND NOT attribute.attisdropped
    ORDER BY relation.relname, attribute.attnum
  `, [role]);
}

function sequencePrivileges(database: Pick<Client, "query">, role: RuntimeRole) {
  return database.query<SequencePrivilegeRow>(`
    SELECT relation.relname AS "sequenceName",
      has_sequence_privilege($1, relation.oid, 'USAGE') AS "usage",
      has_sequence_privilege($1, relation.oid, 'SELECT') AS "select",
      has_sequence_privilege($1, relation.oid, 'UPDATE') AS "update"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind = 'S'
    ORDER BY relation.relname
  `, [role]);
}

function routinePrivileges(database: Pick<Client, "query">, role: RuntimeRole) {
  return database.query<RoutinePrivilegeRow>(`
    SELECT
      routine.proname AS "routineName",
      routine.oid IN (
        'public.mira_refund_canary_lock_payment(text)'::regprocedure,
        'public.mira_refund_canary_lock_provider_operation_binding(text)'::regprocedure,
        'public.mira_refund_canary_lock_command_events(text)'::regprocedure,
        'public.mira_refund_canary_lock_evidence(text)'::regprocedure
      ) AS "expectedLockRoutine",
      has_function_privilege($1, routine.oid, 'EXECUTE') AS "execute",
      routine.prosecdef AS "securityDefiner",
      routine.provolatile AS "volatility",
      language.lanname AS "languageName",
      pg_get_function_result(routine.oid) AS "resultType",
      owner.rolname = current_user AS "ownerIsBootstrap",
      owner.rolname IN ('mira_refund_preflight', 'mira_refund_canary')
        AS "ownerIsRuntime",
      routine.proconfig AS configuration
    FROM pg_proc routine
    JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
    JOIN pg_roles owner ON owner.oid = routine.proowner
    JOIN pg_language language ON language.oid = routine.prolang
    WHERE namespace.nspname = 'public'
    ORDER BY routine.proname, routine.oid
  `, [role]);
}

async function defaultPrivilegeViolationCount(database: Pick<Client, "query">): Promise<number> {
  const result = await database.query<{ count: number }>(`
    WITH runtime_roles AS (
      SELECT oid FROM pg_roles
      WHERE rolname IN ('mira_refund_preflight', 'mira_refund_canary')
    ), relevant_owners AS (
      SELECT role.oid FROM pg_roles role WHERE role.rolname = current_user
      UNION
      SELECT target.datdba FROM pg_database target
        WHERE target.datname = current_database()
      UNION
      SELECT relation.relowner
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
      UNION
      SELECT routine.proowner
      FROM pg_proc routine
      JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
      WHERE namespace.nspname = 'public'
      UNION
      SELECT defaults.defaclrole
      FROM pg_default_acl defaults,
        aclexplode(defaults.defaclacl) acl
      WHERE defaults.defaclobjtype IN ('r', 'S', 'f')
        AND (acl.grantee = 0 OR acl.grantee IN (SELECT oid FROM runtime_roles))
    ), explicit_violations AS (
      SELECT 1
      FROM pg_default_acl defaults,
        aclexplode(defaults.defaclacl) acl
      WHERE defaults.defaclobjtype IN ('r', 'S', 'f')
        AND (acl.grantee = 0 OR acl.grantee IN (SELECT oid FROM runtime_roles))
    ), global_defaults AS (
      SELECT owner.oid,
        object_type.value AS object_type,
        COALESCE(defaults.defaclacl, acldefault(object_type.value, owner.oid)) AS acl
      FROM relevant_owners owner
      CROSS JOIN (VALUES ('r'::"char"), ('S'::"char"), ('f'::"char")) object_type(value)
      LEFT JOIN pg_default_acl defaults
        ON defaults.defaclrole = owner.oid
        AND defaults.defaclnamespace = 0
        AND defaults.defaclobjtype = object_type.value
    ), implicit_public_violations AS (
      SELECT 1
      FROM global_defaults defaults,
        aclexplode(defaults.acl) acl
      WHERE acl.grantee = 0
    )
    SELECT (
      (SELECT count(*) FROM explicit_violations)
      + (SELECT count(*) FROM implicit_public_violations)
    )::int AS count
  `);
  return result.rows.length === 1 ? result.rows[0]?.count ?? -1 : -1;
}

function requireRoleSafety(rows: readonly RoleSafetyRow[]): void {
  const actual = rows[0];
  const expected: RoleSafetyRow = Object.freeze({
    canLogin: true,
    superuser: false,
    createDatabase: false,
    createRole: false,
    inherit: false,
    replication: false,
    bypassRls: false,
    connect: true,
    databaseCreate: false,
    databaseTemporary: false,
    schemaUsage: true,
    schemaCreate: false,
    inboundMembershipCount: 0,
    outboundMembershipCount: 0,
    ownedObjectCount: 0,
    directDatabasePrivileges: ["CONNECT"],
    directSchemaPrivileges: ["USAGE"],
  });
  if (!actual) failPostcondition();
  for (const key of ROLE_SAFETY_SCALAR_KEYS) {
    if (actual[key] !== expected[key]) failPostcondition();
  }
  if (JSON.stringify(actual.directDatabasePrivileges)
    !== JSON.stringify(expected.directDatabasePrivileges)) failPostcondition();
  if (JSON.stringify(actual.directSchemaPrivileges)
    !== JSON.stringify(expected.directSchemaPrivileges)) failPostcondition();
}

const ROLE_SAFETY_SCALAR_KEYS = Object.freeze([
  "canLogin", "superuser", "createDatabase", "createRole", "inherit",
  "replication", "bypassRls", "connect", "databaseCreate", "schemaUsage",
  "databaseTemporary", "schemaCreate", "inboundMembershipCount", "outboundMembershipCount",
  "ownedObjectCount",
] satisfies readonly (keyof RoleSafetyRow)[]);

function requireTablePrivileges(
  role: RuntimeRole,
  rows: readonly TablePrivilegeRow[],
): void {
  const selected = role === "mira_refund_preflight"
    ? PREFLIGHT_TABLE_SELECT : CANARY_TABLE_SELECT;
  for (const row of rows) {
    const canary = role === "mira_refund_canary";
    const expected = Object.freeze({
      select: selected.has(row.tableName),
      insert: canary && CANARY_TABLE_INSERT.has(row.tableName),
      update: false,
      delete: false,
      truncate: false,
      references: false,
      trigger: false,
    });
    for (const key of TABLE_PRIVILEGE_KEYS) {
      if (row[key] !== expected[key]) failPostcondition();
    }
  }
}

const TABLE_PRIVILEGE_KEYS = Object.freeze([
  "select", "insert", "update", "delete", "truncate", "references", "trigger",
] satisfies readonly (keyof Omit<TablePrivilegeRow, "tableName">)[]);

function requireColumnPrivileges(
  role: RuntimeRole,
  rows: readonly ColumnPrivilegeRow[],
  temporary: ReadonlySet<string>,
): void {
  for (const row of rows) {
    const expected = columnPrivilegeExpectation(role, row.tableName, row.columnName);
    for (const key of COLUMN_PRIVILEGE_KEYS) {
      if (row[key] !== (expected[key] || (role === "mira_refund_canary"
        && temporary.has(`${key}:${row.tableName}.${row.columnName}`)))) failPostcondition();
    }
  }
}

function columnPrivilegeExpectation(
  role: RuntimeRole,
  tableName: string,
  columnName: string,
): Omit<ColumnPrivilegeRow, "tableName" | "columnName"> {
  const canary = role === "mira_refund_canary";
  const fullSelect = role === "mira_refund_preflight"
    ? PREFLIGHT_TABLE_SELECT.has(tableName)
    : CANARY_TABLE_SELECT.has(tableName);
  const partialSelect = canary
    && CANARY_COLUMN_SELECT.get(tableName)?.has(columnName) === true;
  return Object.freeze({
    select: fullSelect || partialSelect,
    insert: canary && CANARY_TABLE_INSERT.has(tableName),
    update: canary && CANARY_COLUMN_UPDATE.get(tableName)?.has(columnName) === true,
    references: false,
  });
}

const COLUMN_PRIVILEGE_KEYS = Object.freeze([
  "select", "insert", "update", "references",
] satisfies readonly (keyof Omit<ColumnPrivilegeRow, "tableName" | "columnName">)[]);

function requireNoSequencePrivileges(rows: readonly SequencePrivilegeRow[]): void {
  if (rows.some((row) => row.usage || row.select || row.update)) failPostcondition();
}

function requireRoutinePrivileges(
  role: RuntimeRole,
  rows: readonly RoutinePrivilegeRow[],
): void {
  let lockRoutineCount = 0;
  for (const row of rows) {
    const expectedExecute = role === "mira_refund_canary" && row.expectedLockRoutine;
    if (row.execute !== expectedExecute) failPostcondition();
    if (!row.expectedLockRoutine) continue;
    lockRoutineCount += 1;
    requireExactLockRoutine(row);
  }
  if (lockRoutineCount !== CANARY_LOCK_ROUTINE_NAMES.size) failPostcondition();
}

function requireExactLockRoutine(row: RoutinePrivilegeRow): void {
  const expectedResult = BOOLEAN_LOCK_ROUTINE_NAMES.has(row.routineName)
    ? "boolean" : "void";
  const configuration = JSON.stringify(row.configuration);
  const expectedConfiguration = JSON.stringify(["search_path=pg_catalog, pg_temp"]);
  if ([
    CANARY_LOCK_ROUTINE_NAMES.has(row.routineName),
    row.securityDefiner,
    row.volatility === "v",
    row.languageName === "plpgsql",
    row.resultType === expectedResult,
    row.ownerIsBootstrap,
    !row.ownerIsRuntime,
    configuration === expectedConfiguration,
  ].some((valid) => !valid)) failPostcondition();
}

function failPostcondition(): never {
  throw new EximbayP3eDatabaseBootstrapError("ROLE_AUTHORITY_POSTCONDITION_FAILED");
}

type RoleSafetyRow = Readonly<{
  canLogin: boolean;
  superuser: boolean;
  createDatabase: boolean;
  createRole: boolean;
  inherit: boolean;
  replication: boolean;
  bypassRls: boolean;
  connect: boolean;
  databaseCreate: boolean;
  databaseTemporary: boolean;
  schemaUsage: boolean;
  schemaCreate: boolean;
  inboundMembershipCount: number;
  outboundMembershipCount: number;
  ownedObjectCount: number;
  directDatabasePrivileges: readonly string[];
  directSchemaPrivileges: readonly string[];
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
  select: boolean;
  insert: boolean;
  update: boolean;
  references: boolean;
}>;

type SequencePrivilegeRow = Readonly<{
  sequenceName: string;
  usage: boolean;
  select: boolean;
  update: boolean;
}>;

type RoutinePrivilegeRow = Readonly<{
  routineName: string;
  expectedLockRoutine: boolean;
  execute: boolean;
  securityDefiner: boolean;
  volatility: string;
  languageName: string;
  resultType: string;
  ownerIsBootstrap: boolean;
  ownerIsRuntime: boolean;
  configuration: readonly string[] | null;
}>;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
