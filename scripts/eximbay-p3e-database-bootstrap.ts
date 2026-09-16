import { EximbayP3eDatabaseBootstrapError as CanonicalBootstrapError, bootstrapEximbayP3eDatabaseRoles as bootstrapCanonicalRoles, EXIMBAY_P3E_DATABASE_BOOTSTRAP_ARTIFACTS as CANONICAL_ARTIFACTS, verifyCanonicalRole, verifyExactEffectivePrivileges as verifyCanonicalPrivileges } from "./eximbay-p3e-canonical-role-authority";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import {
  applyRefundAuthorizationPrivilegeFloor, hasRefundAuthorizationMigration,
  AUTHORIZATION_UPDATE_COLUMNS, verifyRefundAuthorizationEntryPoints,
} from "./refund-authorization-privileges";

export const EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION =
  "EXPLICIT_EXIMBAY_P3E_SANDBOX_DATABASE_BOOTSTRAP" as const;
export const EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT = "SANDBOX" as const;
export const EXIMBAY_P3E_APPROVAL_MIGRATION =
  "20260825130000_eximbay_refund_sandbox_canary_approval" as const;

export type EximbayP3eBootstrapArtifactId =
  | "EXIMBAY_CANARY_ROLE_AUTHORITY"
  | "FROZEN_HISTORICAL_ROLE_AUTHORITY"
  | "EXIMBAY_CANARY_ROLE_GRANT_DELTA"
  | "SYNTHETIC_SALE_ROLE_GRANT_DELTA"
  | "CONTACTED_RECONCILIATION_ROLE_GRANT_DELTA"
  | "BUSINESS_STATE_READBACK_ROLE_GRANT_DELTA"
  | "BUSINESS_STATE_READBACK_ROLE_REVOKE_DELTA"
  | "REFUND_READINESS_READBACK_ROLE_GRANT_DELTA"
  | "REFUND_READINESS_READBACK_ROLE_REVOKE_DELTA";

export type EximbayP3eBootstrapArtifact = Readonly<{
  id: EximbayP3eBootstrapArtifactId;
  repositoryPath: string;
  absolutePath: string;
  sha256: string;
}>;

export const EXIMBAY_P3E_DATABASE_BOOTSTRAP_ARTIFACTS = CANONICAL_ARTIFACTS;

const repositoryRoot = resolve(import.meta.dirname, "..");

export const SYNTHETIC_SALE_ROLE_GRANT_ARTIFACT = Object.freeze({
  id: "SYNTHETIC_SALE_ROLE_GRANT_DELTA",
  repositoryPath: "infra/refund-sandbox/p3e-b2/synthetic-sale/database-role-grants.sql",
  absolutePath: resolve(
    repositoryRoot,
    "infra/refund-sandbox/p3e-b2/synthetic-sale/database-role-grants.sql",
  ),
  sha256: "a414e4d5ddf1565e1d27763885c407cffbdc48c03487db8205302cc3c5cab470",
} satisfies EximbayP3eBootstrapArtifact);

export const CONTACTED_RECONCILIATION_ROLE_GRANT_ARTIFACT = Object.freeze({
  id: "CONTACTED_RECONCILIATION_ROLE_GRANT_DELTA",
  repositoryPath:
    "infra/refund-sandbox/p3e-b2/contacted-reconciliation/database-role-grants.sql",
  absolutePath: resolve(
    repositoryRoot,
    "infra/refund-sandbox/p3e-b2/contacted-reconciliation/database-role-grants.sql",
  ),
  sha256: "fc90079bd22e6e44c7ed5a56891911aa789af6d582c73c330b143927be79834a",
} satisfies EximbayP3eBootstrapArtifact);

export const BUSINESS_STATE_READBACK_ROLE_GRANT_ARTIFACT = Object.freeze({
  id: "BUSINESS_STATE_READBACK_ROLE_GRANT_DELTA",
  repositoryPath:
    "infra/refund-sandbox/p3e-b2/business-state-readback/database-role-grants.sql",
  absolutePath: resolve(
    repositoryRoot,
    "infra/refund-sandbox/p3e-b2/business-state-readback/database-role-grants.sql",
  ),
  sha256: "a67dab48542dad2fd5f98efaff5264f8ee0cd481874612f070c53a80db3d85d1",
} satisfies EximbayP3eBootstrapArtifact);

export const BUSINESS_STATE_READBACK_ROLE_REVOKE_ARTIFACT = Object.freeze({
  id: "BUSINESS_STATE_READBACK_ROLE_REVOKE_DELTA",
  repositoryPath:
    "infra/refund-sandbox/p3e-b2/business-state-readback/database-role-revoke.sql",
  absolutePath: resolve(
    repositoryRoot,
    "infra/refund-sandbox/p3e-b2/business-state-readback/database-role-revoke.sql",
  ),
  sha256: "e88f8f693be752a31bb5b90a0ebebdbff06c760139f19066d39838b847a5a543",
} satisfies EximbayP3eBootstrapArtifact);

export const REFUND_READINESS_READBACK_ROLE_GRANT_ARTIFACT = Object.freeze({
  id: "REFUND_READINESS_READBACK_ROLE_GRANT_DELTA",
  repositoryPath:
    "containers/refund-db-bootstrap/refund-readiness-readback/database-role-grants.sql",
  absolutePath: resolve(
    repositoryRoot,
    "containers/refund-db-bootstrap/refund-readiness-readback/database-role-grants.sql",
  ),
  sha256: "4ce61daf8439b3b5cf6e4a1da649acb2bb65115dd0bec9170b7de66afa29ab87",
} satisfies EximbayP3eBootstrapArtifact);

export const REFUND_READINESS_READBACK_ROLE_REVOKE_ARTIFACT = Object.freeze({
  id: "REFUND_READINESS_READBACK_ROLE_REVOKE_DELTA",
  repositoryPath:
    "containers/refund-db-bootstrap/refund-readiness-readback/database-role-revoke.sql",
  absolutePath: resolve(
    repositoryRoot,
    "containers/refund-db-bootstrap/refund-readiness-readback/database-role-revoke.sql",
  ),
  sha256: "ac37292a4f8d854d78038f532a163953c7f967e018717255bec70f3041dd03ac",
} satisfies EximbayP3eBootstrapArtifact);

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

export type SyntheticSaleMarketPreconditionDependencies = Readonly<{
  verifyExactLedger: (database: Client) => Promise<void>;
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
    id: "EXIMBAY_CANARY_ROLE_AUTHORITY";
    repositoryPath: string;
    sha256: string;
  }>;
  postcondition: "EXACT_EFFECTIVE_PRIVILEGES_VERIFIED";
}>;

export type SyntheticSaleRoleGrantResult = Readonly<{
  ok: true;
  code:
    | "SYNTHETIC_SALE_ROLE_GRANTS_COMPLETE"
    | "CONTACTED_RECONCILIATION_ROLE_GRANTS_COMPLETE"
    | "BUSINESS_STATE_READBACK_ROLE_GRANTS_COMPLETE"
    | "BUSINESS_STATE_READBACK_ROLE_REVOKED"
    | "REFUND_READINESS_READBACK_ROLE_GRANTS_COMPLETE"
    | "REFUND_READINESS_READBACK_ROLE_REVOKED"
    | "PL09_DISPATCHER_ROLE_GRANTS_COMPLETE"
    | "PL09_DISPATCHER_ROLE_REVOKED"
    | "CANARY_REFUND_ROLE_GRANTS_RESTORED";
  artifacts: readonly Readonly<{
    id: EximbayP3eBootstrapArtifactId;
    repositoryPath: string;
    sha256: string;
  }>[];
  postcondition: "EXACT_EFFECTIVE_PRIVILEGES_VERIFIED";
}>;

export type SyntheticSaleMarketPreconditionResult = Readonly<{
  ok: true;
  code: "SYNTHETIC_SALE_MARKET_PRECONDITION_COMPLETE";
  disposition: "CREATED" | "ALREADY_EXACT";
  market: Readonly<{
    code: "US";
    currency: "USD";
    active: true;
    defaultLocale: "en";
    shippableCountries: readonly ["US"];
    taxConfigNull: true;
    paymentConfigNull: true;
  }>;
  postconditionRowCount: 1;
}>;

export type EximbayP3eDatabaseBootstrapErrorCode =
  | "BOOTSTRAP_NOT_EXPLICITLY_ADMITTED"
  | "BOOTSTRAP_TARGET_INVALID"
  | "REQUIRED_MIGRATION_ABSENT"
  | "HISTORICAL_AUTHORITY_INTEGRITY_FAILURE"
  | "EXIMBAY_AUTHORITY_INTEGRITY_FAILURE"
  | "EXIMBAY_DELTA_INTEGRITY_FAILURE"
  | "SYNTHETIC_SALE_DELTA_INTEGRITY_FAILURE"
  | "CONTACTED_RECONCILIATION_DELTA_INTEGRITY_FAILURE"
  | "BUSINESS_STATE_READBACK_DELTA_INTEGRITY_FAILURE"
  | "BUSINESS_STATE_READBACK_REVOKE_INTEGRITY_FAILURE"
  | "REFUND_READINESS_READBACK_DELTA_INTEGRITY_FAILURE"
  | "REFUND_READINESS_READBACK_REVOKE_INTEGRITY_FAILURE"
  | "SYNTHETIC_SALE_MARKET_PRECONDITION_CONFLICT"
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
  "RefundExecutionEvidence",
  "RefundExecutionEximbayPreflightObservation",
]);

const CANARY_APPROVAL_UPDATE_COLUMNS = new Set([
  "consumedAt",
  "consumedExecutionId",
  "consumedExecutionBindingDigest",
]);

const CANARY_ROW_LOCK_UPDATE_COLUMNS = new Set<string>();

const SYNTHETIC_SALE_SELECT = new Set([
  ...CANARY_SELECT, "CheckoutSession",
  "User", "Market", "WigStyle", "WigVariant", "WigStyleMarket",
  "VariantMarketPrice", "CartItem", "CheckoutSessionLine", "CheckoutSessionShipping",
  "PaymentEvent", "OrderItem", "OrderShipping",
]);

const SYNTHETIC_SALE_INSERT = new Set([
  ...CANARY_INSERT,
  "User", "WigStyle", "WigVariant", "WigStyleMarket", "VariantMarketPrice",
  "CartItem", "CheckoutSession", "CheckoutSessionLine", "CheckoutSessionShipping",
  "Payment", "PaymentEvent", "Order", "OrderItem", "OrderShipping",
]);

const SYNTHETIC_SALE_DELETE = new Set(["CartItem"]);
const SYNTHETIC_SALE_UPDATE_COLUMNS = new Set([
  ...CANARY_ROW_LOCK_UPDATE_COLUMNS,
  ...[...CANARY_TABLE_UPDATE].flatMap((table) => [`${table}.*`]),
  ...[...CANARY_APPROVAL_UPDATE_COLUMNS].map((column) => `EximbayRefundSandboxCanaryApproval.${column}`),
  "User.id", "WigStyle.id", "CheckoutSessionLine.id",
  "WigStyleMarket.wigStyleId", "VariantMarketPrice.variantId", "WigVariant.stock",
  "CartItem.quantity", "CheckoutSession.status", "CheckoutSession.completedAt",
  "CheckoutSession.updatedAt", "Payment.status", "Payment.attemptLifecycle",
  "Payment.remediationStatus", "Payment.amount", "Payment.currency",
  "Payment.providerPaymentKey", "Payment.contactStartedAt", "Payment.initiationOutputKind",
  "Payment.initiationApproveUrl", "Payment.initiationCompletedAt",
  "Payment.financialSucceededAt", "Payment.errorCode", "Payment.errorMessage",
  "Payment.supersededAt", "Payment.blockingEndedAt", "Payment.suspendedByPaymentId",
  "Payment.updatedAt", "PaymentEvent.transmissionId", "PaymentEvent.raw",
  "PaymentEvent.status", "PaymentEvent.processedAt", "PaymentEvent.failureStage",
  "PaymentEvent.failureCode", "PaymentEvent.lastError", "PaymentEvent.verifiedMode",
  "PaymentEvent.verifiedCredentialBinding", "PaymentEvent.providerPaymentKey",
]);

const CONTACTED_RECONCILIATION_SELECT = new Set([
  ...CANARY_SELECT,
  "PaymentEvent",
]);

const CONTACTED_RECONCILIATION_INSERT = new Set([
  ...CANARY_INSERT,
  "PaymentEvent",
]);

const CONTACTED_RECONCILIATION_UPDATE_COLUMNS = new Set([
  "CheckoutSession.id",
  "Payment.blockingEndedAt",
  "Payment.errorCode",
  "Payment.errorMessage",
  "Payment.updatedAt",
]);

export async function applyEximbayP3eCanaryRoleGrants(
  database: Client,
  input: EximbayP3eDatabaseBootstrapInput,
  dependencies: EximbayP3eCanaryRoleGrantDependencies,
): Promise<EximbayP3eCanaryRoleGrantResult> {
  requireAdmittedInput(input);
  const artifact = CANONICAL_ARTIFACTS[0];
  const sql = await readAndVerifyArtifact(artifact, dependencies.readArtifact);

  let transactionOpen = false;
  try {
    await database.query("BEGIN");
    transactionOpen = true;
    await requireExactDatabase(database, input.targetDatabaseName);
    await dependencies.verifyExactLedger(database);
    await requireApprovalMigration(database);
    await dependencies.executeArtifact(database, artifact, sql);
    await applyRefundAuthorizationPrivilegeFloor(database);
    await dependencies.beforePostcondition(database);
    await verifyExactEffectivePrivileges(database);
    await database.query("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) await database.query("ROLLBACK").catch(() => undefined);
    if (error instanceof EximbayP3eDatabaseBootstrapError) throw error;
    if (error instanceof CanonicalBootstrapError) throw new EximbayP3eDatabaseBootstrapError(error.code);
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

export async function applySyntheticSaleRoleGrants(
  database: Client,
  input: EximbayP3eDatabaseBootstrapInput,
  dependencies: EximbayP3eCanaryRoleGrantDependencies,
): Promise<SyntheticSaleRoleGrantResult> {
  requireAdmittedInput(input);
  const sql = await readAndVerifyArtifact(
    SYNTHETIC_SALE_ROLE_GRANT_ARTIFACT,
    dependencies.readArtifact,
  );
  return executeRoleGrantTransaction(database, input, dependencies, async () => {
    await dependencies.executeArtifact(database, SYNTHETIC_SALE_ROLE_GRANT_ARTIFACT, sql);
  }, verifyExactSyntheticSaleEffectivePrivileges, "SYNTHETIC_SALE_ROLE_GRANTS_COMPLETE", [
    SYNTHETIC_SALE_ROLE_GRANT_ARTIFACT,
  ]);
}

export async function applyContactedReconciliationRoleGrants(
  database: Client,
  input: EximbayP3eDatabaseBootstrapInput,
  dependencies: EximbayP3eCanaryRoleGrantDependencies,
): Promise<SyntheticSaleRoleGrantResult> {
  requireAdmittedInput(input);
  const sql = await readAndVerifyArtifact(
    CONTACTED_RECONCILIATION_ROLE_GRANT_ARTIFACT,
    dependencies.readArtifact,
  );
  return executeRoleGrantTransaction(database, input, dependencies, async () => {
    await dependencies.executeArtifact(
      database,
      CONTACTED_RECONCILIATION_ROLE_GRANT_ARTIFACT,
      sql,
    );
  }, verifyExactContactedReconciliationEffectivePrivileges,
  "CONTACTED_RECONCILIATION_ROLE_GRANTS_COMPLETE", [
    CONTACTED_RECONCILIATION_ROLE_GRANT_ARTIFACT,
  ]);
}

export async function applyBusinessStateReadbackRoleGrants(
  database: Client,
  input: EximbayP3eDatabaseBootstrapInput,
  dependencies: EximbayP3eCanaryRoleGrantDependencies,
): Promise<SyntheticSaleRoleGrantResult> {
  requireAdmittedInput(input);
  const sql = await readAndVerifyArtifact(
    BUSINESS_STATE_READBACK_ROLE_GRANT_ARTIFACT,
    dependencies.readArtifact,
  );
  return executeRoleGrantTransaction(database, input, dependencies, async () => {
    await dependencies.executeArtifact(
      database,
      BUSINESS_STATE_READBACK_ROLE_GRANT_ARTIFACT,
      sql,
    );
  }, verifyExactBusinessStateReadbackEffectivePrivileges,
  "BUSINESS_STATE_READBACK_ROLE_GRANTS_COMPLETE", [
    BUSINESS_STATE_READBACK_ROLE_GRANT_ARTIFACT,
  ]);
}

export async function revokeBusinessStateReadbackRoleGrants(
  database: Client,
  input: EximbayP3eDatabaseBootstrapInput,
  dependencies: EximbayP3eCanaryRoleGrantDependencies,
): Promise<SyntheticSaleRoleGrantResult> {
  requireAdmittedInput(input);
  const sql = await readAndVerifyArtifact(
    BUSINESS_STATE_READBACK_ROLE_REVOKE_ARTIFACT,
    dependencies.readArtifact,
  );
  return executeRoleGrantTransaction(database, input, dependencies, async () => {
    await dependencies.executeArtifact(
      database,
      BUSINESS_STATE_READBACK_ROLE_REVOKE_ARTIFACT,
      sql,
    );
  }, verifyRetiredBusinessStateReadbackEffectivePrivileges,
  "BUSINESS_STATE_READBACK_ROLE_REVOKED", [
    BUSINESS_STATE_READBACK_ROLE_REVOKE_ARTIFACT,
  ]);
}

// The deployed worker's existing password-backed principal. No role or schema creation.
const PL09_DISPATCHER_COLUMNS = Object.freeze({
  PaymentOutbox: ["id", "topic", "payload", "status", "attempts", "nextAttemptAt", "lastError", "dedupKey", "createdAt", "updatedAt", "processedAt"],
  User: ["id", "email"],
});
const PL09_DISPATCHER_OUTBOX_UPDATE = Object.freeze([
  "status", "attempts", "nextAttemptAt", "lastError", "updatedAt", "processedAt",
]);
const PL09_DISPATCHER_SELECT_COLUMNS = new Set(Object.entries(PL09_DISPATCHER_COLUMNS)
  .flatMap(([table, columns]) => columns.map((column) => `${table}.${column}`)));
const PL09_DISPATCHER_UPDATE_COLUMNS = new Set(PL09_DISPATCHER_OUTBOX_UPDATE
  .map((column) => `PaymentOutbox.${column}`));

export function pl09DispatcherPrivilegeSql(grant: boolean): string {
  const operation = grant ? "GRANT" : "REVOKE";
  const direction = grant ? "TO" : "FROM";
  const statement = (table: string, columns: readonly string[], privilege: string) =>
    `${operation} ${privilege} (${columns.map((column) => `"${column}"`).join(", ")}) ON TABLE public."${table}" ${direction} "mira_refund_canary";`;
  return [...Object.entries(PL09_DISPATCHER_COLUMNS).map(([table, columns]) =>
    statement(table, columns, "SELECT")),
  statement("PaymentOutbox", PL09_DISPATCHER_OUTBOX_UPDATE, "UPDATE")].join("\n");
}

export async function setPl09DispatcherRoleGrants(
  database: Client,
  input: EximbayP3eDatabaseBootstrapInput,
  dependencies: EximbayP3eCanaryRoleGrantDependencies,
  grant: boolean,
): Promise<SyntheticSaleRoleGrantResult> {
  requireAdmittedInput(input);
  return executeRoleGrantTransaction(database, input, dependencies, async () => {
    if (!await hasRefundAuthorizationMigration(database)) failPostcondition();
    // Serialize the attended grant/revoke lifecycle, without touching business rows.
    await database.query("SELECT pg_advisory_xact_lock(1909, 9)");
    if (grant) {
      await verifyExactEffectivePrivileges(database);
      await requireNoPl09DispatcherAclResidue(database);
    }
    await database.query(pl09DispatcherPrivilegeSql(grant));
  }, async (transaction) => {
    await verifyCanonicalRole(transaction, "mira_refund_preflight");
    const temporary = new Set(grant ? [
      ...[...PL09_DISPATCHER_SELECT_COLUMNS].map((key) => `select:${key}`),
      ...[...PL09_DISPATCHER_UPDATE_COLUMNS].map((key) => `update:${key}`),
    ] : []);
    await verifyCanonicalRole(transaction, "mira_refund_canary", temporary);
    if (!grant) await requireNoPl09DispatcherAclResidue(transaction);
  }, grant ? "PL09_DISPATCHER_ROLE_GRANTS_COMPLETE" : "PL09_DISPATCHER_ROLE_REVOKED", [], false);
}

async function requireNoPl09DispatcherAclResidue(database: Pick<Client, "query">): Promise<void> {
  const result = await database.query<{ count: number }>(`
    SELECT count(*)::int AS count
    FROM pg_attribute attribute
    JOIN pg_class relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
    WHERE namespace.nspname = 'public'
      AND acl.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'mira_refund_canary')
      AND ((relation.relname || '.' || attribute.attname = ANY($1::text[]) AND acl.privilege_type = 'SELECT')
        OR (relation.relname || '.' || attribute.attname = ANY($2::text[]) AND acl.privilege_type = 'UPDATE'))
  `, [[...PL09_DISPATCHER_SELECT_COLUMNS], [...PL09_DISPATCHER_UPDATE_COLUMNS]]);
  if (result.rows[0]?.count !== 0) failPostcondition();
}

export async function applyRefundReadinessReadbackRoleGrants(
  database: Client,
  input: EximbayP3eDatabaseBootstrapInput,
  dependencies: EximbayP3eCanaryRoleGrantDependencies,
): Promise<SyntheticSaleRoleGrantResult> {
  requireAdmittedInput(input);
  const sql = await readAndVerifyArtifact(
    REFUND_READINESS_READBACK_ROLE_GRANT_ARTIFACT,
    dependencies.readArtifact,
  );
  return executeRoleGrantTransaction(database, input, dependencies, async () => {
    await dependencies.executeArtifact(
      database,
      REFUND_READINESS_READBACK_ROLE_GRANT_ARTIFACT,
      renderReadbackAuthority(sql, input.targetDatabaseName),
    );
  }, verifyExactRefundReadinessReadbackEffectivePrivileges,
  "REFUND_READINESS_READBACK_ROLE_GRANTS_COMPLETE", [
    REFUND_READINESS_READBACK_ROLE_GRANT_ARTIFACT,
  ]);
}

export async function revokeRefundReadinessReadbackRoleGrants(
  database: Client,
  input: EximbayP3eDatabaseBootstrapInput,
  dependencies: EximbayP3eCanaryRoleGrantDependencies,
): Promise<SyntheticSaleRoleGrantResult> {
  requireAdmittedInput(input);
  const sql = await readAndVerifyArtifact(
    REFUND_READINESS_READBACK_ROLE_REVOKE_ARTIFACT,
    dependencies.readArtifact,
  );
  return executeRoleGrantTransaction(database, input, dependencies, async () => {
    await dependencies.executeArtifact(
      database,
      REFUND_READINESS_READBACK_ROLE_REVOKE_ARTIFACT,
      renderReadbackAuthority(sql, input.targetDatabaseName),
    );
  }, verifyRetiredBusinessStateReadbackEffectivePrivileges,
  "REFUND_READINESS_READBACK_ROLE_REVOKED", [
    REFUND_READINESS_READBACK_ROLE_REVOKE_ARTIFACT,
  ]);
}

export async function restoreCanaryRefundRoleGrants(
  database: Client,
  input: EximbayP3eDatabaseBootstrapInput,
  dependencies: EximbayP3eCanaryRoleGrantDependencies,
): Promise<SyntheticSaleRoleGrantResult> {
  requireAdmittedInput(input);
  const artifact = CANONICAL_ARTIFACTS[0];
  const source = await readAndVerifyArtifact(artifact, dependencies.readArtifact);
  return executeRoleGrantTransaction(database, input, dependencies, async () => {
    await dependencies.executeArtifact(database, artifact, source);
  }, verifyExactEffectivePrivileges, "CANARY_REFUND_ROLE_GRANTS_RESTORED", CANONICAL_ARTIFACTS);

}

export async function materializeSyntheticSaleMarketPrecondition(
  database: Client,
  input: EximbayP3eDatabaseBootstrapInput,
  dependencies: SyntheticSaleMarketPreconditionDependencies,
): Promise<SyntheticSaleMarketPreconditionResult> {
  requireAdmittedInput(input);
  let transactionOpen = false;
  try {
    await database.query("BEGIN");
    transactionOpen = true;
    await requireExactDatabase(database, input.targetDatabaseName);
    await dependencies.verifyExactLedger(database);
    const existing = await readSyntheticSaleMarket(database, true);
    let disposition: SyntheticSaleMarketPreconditionResult["disposition"];
    if (existing === null) {
      await database.query(`
        INSERT INTO "Market" (
          "code", "currency", "shippableCountries", "defaultLocale", "isActive",
          "taxConfig", "paymentConfig"
        ) VALUES ($1, $2, $3::text[], $4, $5, NULL, NULL)
      `, ["US", "USD", ["US"], "en", true]);
      disposition = "CREATED";
    } else {
      requireExactSyntheticSaleMarket(existing);
      disposition = "ALREADY_EXACT";
    }
    const postcondition = await readSyntheticSaleMarket(database, false);
    if (postcondition === null) throw new Error("SYNTHETIC_SALE_MARKET_POSTCONDITION_MISSING");
    requireExactSyntheticSaleMarket(postcondition);
    await database.query("COMMIT");
    transactionOpen = false;
    return marketPreconditionResult(disposition);
  } catch (error) {
    if (transactionOpen) await database.query("ROLLBACK").catch(() => undefined);
    if (error instanceof EximbayP3eDatabaseBootstrapError) throw error;
    if (error instanceof CanonicalBootstrapError) throw new EximbayP3eDatabaseBootstrapError(error.code);
    throw new EximbayP3eDatabaseBootstrapError("ROLE_AUTHORITY_EXECUTION_FAILED");
  }
}

type SyntheticSaleMarketRow = Readonly<{
  code: string;
  currency: string;
  shippableCountries: string[];
  defaultLocale: string;
  isActive: boolean;
  taxConfig: unknown;
  paymentConfig: unknown;
}>;

async function readSyntheticSaleMarket(
  database: Client,
  lock: boolean,
): Promise<SyntheticSaleMarketRow | null> {
  const result = await database.query<SyntheticSaleMarketRow>(`
    SELECT "code", "currency", "shippableCountries", "defaultLocale", "isActive",
      "taxConfig", "paymentConfig"
    FROM "Market"
    WHERE "code" = $1
    ${lock ? "FOR UPDATE" : ""}
  `, ["US"]);
  if (result.rows.length > 1) throw new Error("SYNTHETIC_SALE_MARKET_POSTCONDITION_AMBIGUOUS");
  return result.rows[0] ?? null;
}

function requireExactSyntheticSaleMarket(row: SyntheticSaleMarketRow): void {
  if (row.code === "US"
    && row.currency === "USD"
    && row.isActive
    && row.defaultLocale === "en"
    && row.shippableCountries.length === 1
    && row.shippableCountries[0] === "US"
    && row.taxConfig === null
    && row.paymentConfig === null) return;
  throw new EximbayP3eDatabaseBootstrapError("SYNTHETIC_SALE_MARKET_PRECONDITION_CONFLICT");
}

function marketPreconditionResult(
  disposition: SyntheticSaleMarketPreconditionResult["disposition"],
): SyntheticSaleMarketPreconditionResult {
  return Object.freeze({
    ok: true,
    code: "SYNTHETIC_SALE_MARKET_PRECONDITION_COMPLETE",
    disposition,
    market: Object.freeze({
      code: "US",
      currency: "USD",
      active: true,
      defaultLocale: "en",
      shippableCountries: Object.freeze(["US"] as const),
      taxConfigNull: true,
      paymentConfigNull: true,
    }),
    postconditionRowCount: 1,
  });
}

async function executeRoleGrantTransaction(
  database: Client,
  input: EximbayP3eDatabaseBootstrapInput,
  dependencies: EximbayP3eCanaryRoleGrantDependencies,
  execute: () => Promise<void>,
  verify: (database: Pick<Client, "query">) => Promise<void>,
  code: SyntheticSaleRoleGrantResult["code"],
  artifacts: readonly EximbayP3eBootstrapArtifact[],
  applyAuthorizationFloor = true,
): Promise<SyntheticSaleRoleGrantResult> {
  let transactionOpen = false;
  try {
    await database.query("BEGIN");
    transactionOpen = true;
    await requireExactDatabase(database, input.targetDatabaseName);
    await dependencies.verifyExactLedger(database);
    await requireApprovalMigration(database);
    await execute();
    if (applyAuthorizationFloor) await applyRefundAuthorizationPrivilegeFloor(database);
    await dependencies.beforePostcondition(database);
    await verify(database);
    await database.query("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) await database.query("ROLLBACK").catch(() => undefined);
    if (error instanceof EximbayP3eDatabaseBootstrapError) throw error;
    if (error instanceof CanonicalBootstrapError) throw new EximbayP3eDatabaseBootstrapError(error.code);
    throw new EximbayP3eDatabaseBootstrapError("ROLE_AUTHORITY_EXECUTION_FAILED");
  }
  return Object.freeze({
    ok: true,
    code,
    artifacts: Object.freeze(artifacts.map(
      ({ id, repositoryPath, sha256: digest }) => Object.freeze({ id, repositoryPath, sha256: digest }),
    )),
    postcondition: "EXACT_EFFECTIVE_PRIVILEGES_VERIFIED",
  });
}

export async function bootstrapEximbayP3eDatabaseRoles(
  database: Client,
  input: EximbayP3eDatabaseBootstrapInput,
  dependencies: EximbayP3eDatabaseBootstrapDependencies = defaultEximbayP3eDatabaseBootstrapDependencies,
) {
  return bootstrapCanonicalRoles(database, input, {
    readArtifact: (artifact) => dependencies.readArtifact(artifact),
    executeArtifact: (database, artifact, source) => dependencies.executeArtifact(database, artifact, source),
    beforePostcondition: dependencies.beforePostcondition,
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
      : artifactId === "SYNTHETIC_SALE_ROLE_GRANT_DELTA"
        ? "SYNTHETIC_SALE_DELTA_INTEGRITY_FAILURE"
      : artifactId === "CONTACTED_RECONCILIATION_ROLE_GRANT_DELTA"
        ? "CONTACTED_RECONCILIATION_DELTA_INTEGRITY_FAILURE"
        : artifactId === "BUSINESS_STATE_READBACK_ROLE_GRANT_DELTA"
          ? "BUSINESS_STATE_READBACK_DELTA_INTEGRITY_FAILURE"
          : artifactId === "BUSINESS_STATE_READBACK_ROLE_REVOKE_DELTA"
            ? "BUSINESS_STATE_READBACK_REVOKE_INTEGRITY_FAILURE"
            : artifactId === "REFUND_READINESS_READBACK_ROLE_GRANT_DELTA"
              ? "REFUND_READINESS_READBACK_DELTA_INTEGRITY_FAILURE"
              : artifactId === "REFUND_READINESS_READBACK_ROLE_REVOKE_DELTA"
                ? "REFUND_READINESS_READBACK_REVOKE_INTEGRITY_FAILURE"
                : "EXIMBAY_DELTA_INTEGRITY_FAILURE",
  );
}

function renderReadbackAuthority(source: string, databaseName: AdmittedDatabaseName): string {
  const token = "DATABASE refund_sandbox";
  if (source.split(token).length - 1 !== 1) {
    throw new EximbayP3eDatabaseBootstrapError("HISTORICAL_AUTHORITY_SHAPE_INVALID");
  }
  return source.replace(token, `DATABASE ${quoteIdentifier(databaseName)}`);
}

export async function verifyExactEffectivePrivileges(
  database: Pick<Client, "query">,
): Promise<void> {
  await verifyCanonicalPrivileges(database);
}

export async function verifyExactSyntheticSaleEffectivePrivileges(
  database: Pick<Client, "query">,
): Promise<void> {
  await verifyRole(database, "mira_refund_preflight", "REFUND_ONLY");
  await verifyRole(database, "mira_refund_canary", "SYNTHETIC_SALE");
}

export async function verifyExactContactedReconciliationEffectivePrivileges(
  database: Pick<Client, "query">,
): Promise<void> {
  await verifyRole(database, "mira_refund_preflight", "REFUND_ONLY");
  await verifyRole(database, "mira_refund_canary", "CONTACTED_RECONCILIATION");
}

export const BUSINESS_STATE_READBACK_DATABASE_ROLE =
  "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam" as const;
export const BUSINESS_STATE_READBACK_REQUIRED_SYSTEM_MEMBERSHIP =
  "cloudsqliamserviceaccount" as const;

const BUSINESS_STATE_READBACK_SELECT_COLUMNS = new Set([
  "CheckoutSession.id", "CheckoutSession.status", "CheckoutSession.expiresAt",
  "CheckoutSession.createdAt", "CheckoutSession.updatedAt",
  "Payment.id", "Payment.checkoutSessionId", "Payment.provider", "Payment.mode",
  "Payment.status", "Payment.attemptLifecycle", "Payment.remediationStatus",
  "Payment.amount", "Payment.currency", "Payment.providerOrderId",
  "Payment.providerPaymentKey", "Payment.contactStartedAt",
  "Payment.financialSucceededAt", "Payment.blockingEndedAt",
  "Payment.suspendedByPaymentId", "Payment.errorCode", "Payment.errorMessage",
  "Payment.createdAt", "Payment.updatedAt",
  "PaymentEvent.id", "PaymentEvent.provider", "PaymentEvent.source",
  "PaymentEvent.transmissionId", "PaymentEvent.eventType", "PaymentEvent.verifiedMode",
  "PaymentEvent.verifiedCredentialBinding", "PaymentEvent.checkoutSessionId",
  "PaymentEvent.raw", "PaymentEvent.status", "PaymentEvent.receivedAt",
  "PaymentEvent.processedAt",
  "Order.id", "Order.checkoutSessionId", "Order.paymentId", "Order.status",
  "Order.createdAt", "Order.updatedAt",
]);

export const REFUND_READINESS_READBACK_SELECT_COLUMNS = new Set([
  "CheckoutSession.id", "CheckoutSession.communicationLocale",
  "Payment.id", "Payment.checkoutSessionId", "Payment.provider", "Payment.mode",
  "Payment.adapterExecutionKind", "Payment.status", "Payment.attemptLifecycle",
  "Payment.amount", "Payment.currency", "Payment.providerOrderId",
  "Payment.providerPaymentKey", "Payment.financialSucceededAt",
  "Order.id", "Order.checkoutSessionId", "Order.paymentId", "Order.currency",
  "Order.totalAmount", "Order.status",
  "RefundAttempt.id", "RefundAttempt.orderId", "RefundAttempt.paymentId",
  "RefundAttempt.amount", "RefundAttempt.currency", "RefundAttempt.status",
  "RefundAttempt.reason",
  "RefundAttempt.actorType", "RefundAttempt.actorUserId", "RefundAttempt.provider",
  "RefundAttempt.mode", "RefundAttempt.providerRefundId", "RefundAttempt.idempotencyKey",
  "RefundAttempt.requestedAt", "RefundAttempt.processedAt", "RefundAttempt.failedAt",
  "RefundAttempt.failureCode", "RefundAttempt.safeFailureMessage",
  "RefundAttempt.createdAt",
  "RefundExecutionCommand.id", "RefundExecutionCommand.refundAttemptId",
  "RefundExecutionCommand.status", "RefundExecutionCommand.availableAt",
  "RefundExecutionCommand.leaseOwner", "RefundExecutionCommand.leaseUntil",
  "RefundExecutionCommand.leaseGeneration", "RefundExecutionCommand.leaseTokenHash",
  "RefundExecutionCommand.dispatchAttempt", "RefundExecutionCommand.lastSafeErrorCode",
  "RefundExecutionCommand.lastSafeErrorMessage",
  "EximbayRefundSandboxCanaryApproval.id", "EximbayRefundSandboxCanaryApproval.formatVersion",
  "EximbayRefundSandboxCanaryApproval.provider", "EximbayRefundSandboxCanaryApproval.mode",
  "EximbayRefundSandboxCanaryApproval.commandId",
  "EximbayRefundSandboxCanaryApproval.targetBindingDigest",
  "EximbayRefundSandboxCanaryApproval.consumedAt",
  "RefundExecutionProviderOperationBinding.id",
  "RefundExecutionProviderOperationBinding.refundAttemptId",
  "RefundExecutionProviderOperationBinding.provider",
  "RefundExecutionProviderOperationBinding.mode",
  "RefundExecutionProviderOperationBinding.providerOperationKey",
  "RefundExecutionProviderOperationBinding.operationKeyAlgorithmVersion",
  "RefundExecutionProviderOperationBinding.wireContractVersion",
  "RefundExecutionProviderOperationBinding.wireRequestFingerprint",
  "RefundExecutionProviderOperationBinding.merchantAccountBindingId",
  "RefundExecutionProviderOperationBinding.credentialGenerationBindingId",
  "RefundExecutionAuthorization.id", "RefundExecutionAuthorization.commandId",
  "RefundExecutionAuthorization.refundAttemptId",
  "RefundExecutionAuthorization.providerOperationBindingId",
  "RefundExecutionAuthorization.targetBindingDigest",
  "RefundExecutionAuthorization.expectedPredecessorGeneration",
  "RefundExecutionAuthorization.operationClass", "RefundExecutionAuthorization.releasePolicyDigest",
  "RefundExecutionAuthorization.issuedAt", "RefundExecutionAuthorization.expiresAt",
  "RefundExecutionAuthorization.revokedAt", "RefundExecutionAuthorization.consumedAt",
  "RefundExecutionAuthorization.consumedLeaseEventId",
  "RefundExecutionCommandEvent.id", "RefundExecutionCommandEvent.commandId",
  "RefundExecutionCommandEvent.eventType", "RefundExecutionCommandEvent.leaseGeneration",
  "RefundExecutionCommandEvent.dispatchAttempt", "RefundExecutionCommandEvent.occurredAt",
  "RefundExecutionCommandEvent.createdAt",
  "RefundExecutionDispatchAttempt.id", "RefundExecutionDispatchAttempt.commandId",
  "RefundExecutionDispatchAttempt.state", "RefundExecutionDispatchAttempt.contactMarkedAt",
  "RefundExecutionEximbayPreflightObservation.id",
  "RefundExecutionEximbayPreflightObservation.bindingId",
  "RefundExecutionProviderEligibilityProof.id", "RefundExecutionProviderEligibilityProof.bindingId",
  "RefundExecutionProviderContactEligibilityProof.id",
  "RefundExecutionProviderContactEligibilityProof.dispatchAttemptId",
  "RefundExecutionEvidence.id", "RefundExecutionEvidence.commandId",
  "RefundExecutionEvidence.outcome",
  "RefundAttemptTransition.id", "RefundAttemptTransition.refundAttemptId",
  "RefundAttemptTransition.fromStatus", "RefundAttemptTransition.toStatus",
  "RefundAttemptTransition.orderStatusBefore", "RefundAttemptTransition.orderStatusAfter",
  "RefundAttemptTransition.actorType", "RefundAttemptTransition.actorUserId",
  "RefundAttemptTransition.reason",
  "RefundAttemptTransition.operationKey", "RefundAttemptTransition.createdAt",
  "PaymentOutbox.id", "PaymentOutbox.topic", "PaymentOutbox.payload",
  "PaymentOutbox.status", "PaymentOutbox.attempts", "PaymentOutbox.dedupKey",
  "PaymentOutbox.processedAt",
]);

export async function verifyExactRefundReadinessReadbackEffectivePrivileges(
  database: Pick<Client, "query">,
): Promise<void> {
  const role = await readBusinessStateReadbackRoleSafety(database);
  const tables = await readBusinessStateReadbackTablePrivileges(database);
  const columns = await readBusinessStateReadbackColumnPrivileges(database);
  const sequences = await readBusinessStateReadbackSequencePrivileges(database);
  requireBusinessStateReadbackRoleSafety(role);
  requireNoBusinessStateReadbackTablePrivileges(tables);
  requireExactRefundReadinessReadbackColumnPrivileges(columns);
  requireNoSequencePrivileges(sequences);
}

export async function verifyExactBusinessStateReadbackEffectivePrivileges(
  database: Pick<Client, "query">,
): Promise<void> {
  const role = await readBusinessStateReadbackRoleSafety(database);
  const tables = await readBusinessStateReadbackTablePrivileges(database);
  const columns = await readBusinessStateReadbackColumnPrivileges(database);
  const sequences = await readBusinessStateReadbackSequencePrivileges(database);
  requireBusinessStateReadbackRoleSafety(role);
  requireNoBusinessStateReadbackTablePrivileges(tables);
  requireExactBusinessStateReadbackColumnPrivileges(columns);
  requireNoSequencePrivileges(sequences);
}

async function readBusinessStateReadbackRoleSafety(
  database: Pick<Client, "query">,
): Promise<readonly BusinessStateReadbackRoleSafetyRow[]> {
  const result = await database.query<BusinessStateReadbackRoleSafetyRow>(`
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
      ARRAY(
        SELECT granted_role.rolname::text
        FROM pg_auth_members membership
        JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
        WHERE membership.member = role.oid
        ORDER BY granted_role.rolname
      ) AS "membershipRoleNames"
    FROM pg_roles role
    WHERE role.rolname = $1
  `, [BUSINESS_STATE_READBACK_DATABASE_ROLE]);
  return result.rows;
}

async function readBusinessStateReadbackTablePrivileges(
  database: Pick<Client, "query">,
): Promise<readonly BusinessStateReadbackTablePrivilegeRow[]> {
  const result = await database.query<BusinessStateReadbackTablePrivilegeRow>(`
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
  `, [BUSINESS_STATE_READBACK_DATABASE_ROLE]);
  return result.rows;
}

async function readBusinessStateReadbackColumnPrivileges(
  database: Pick<Client, "query">,
): Promise<readonly BusinessStateReadbackColumnPrivilegeRow[]> {
  const result = await database.query<BusinessStateReadbackColumnPrivilegeRow>(`
    SELECT
      relation.relname AS "tableName",
      attribute.attname AS "columnName",
      has_column_privilege($1, relation.oid, attribute.attnum, 'SELECT') AS "select",
      has_column_privilege($1, relation.oid, attribute.attnum, 'INSERT') AS "insert",
      has_column_privilege($1, relation.oid, attribute.attnum, 'UPDATE') AS "update",
      has_column_privilege($1, relation.oid, attribute.attnum, 'REFERENCES') AS "references"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
    ORDER BY relation.relname, attribute.attnum
  `, [BUSINESS_STATE_READBACK_DATABASE_ROLE]);
  return result.rows;
}

async function readBusinessStateReadbackSequencePrivileges(
  database: Pick<Client, "query">,
): Promise<readonly SequencePrivilegeRow[]> {
  const result = await database.query<SequencePrivilegeRow>(`
    SELECT
      relation.relname AS "sequenceName",
      has_sequence_privilege($1, relation.oid, 'USAGE') AS "usage",
      has_sequence_privilege($1, relation.oid, 'SELECT') AS "select",
      has_sequence_privilege($1, relation.oid, 'UPDATE') AS "update"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind = 'S'
    ORDER BY relation.relname
  `, [BUSINESS_STATE_READBACK_DATABASE_ROLE]);

  return result.rows;
}

export async function verifyRetiredBusinessStateReadbackEffectivePrivileges(
  database: Pick<Client, "query">,
): Promise<void> {
  const role = await readBusinessStateReadbackRoleSafety(database);
  const tables = await readBusinessStateReadbackTablePrivileges(database);
  const columns = await readBusinessStateReadbackColumnPrivileges(database);
  const sequences = await readBusinessStateReadbackSequencePrivileges(database);
  requireBusinessStateReadbackRetiredRoleSafety(role);
  requireNoBusinessStateReadbackTablePrivileges(tables);
  requireNoBusinessStateReadbackColumnPrivileges(columns);
  requireNoSequencePrivileges(sequences);
}

export function requireBusinessStateReadbackRetiredRoleSafety(
  rows: readonly BusinessStateReadbackRoleSafetyRow[],
): void {
  const safety = rows[0];
  if (rows.length !== 1 || !safety || !safety.canLogin) failPostcondition();
  if ([
    safety.superuser,
    safety.createDatabase,
    safety.createRole,
    safety.replication,
    safety.bypassRls,
    safety.databaseCreate,
    safety.schemaCreate,
  ].some(Boolean)) failPostcondition();
  requireExactBusinessStateReadbackSystemMembership(safety.membershipRoleNames);
}

export function requireNoBusinessStateReadbackColumnPrivileges(
  rows: readonly BusinessStateReadbackColumnPrivilegeRow[],
): void {
  if (rows.some((row) => [
    row.select,
    row.insert,
    row.update,
    row.references,
  ].some(Boolean))) failPostcondition();
}

export function requireBusinessStateReadbackRoleSafety(
  rows: readonly BusinessStateReadbackRoleSafetyRow[],
): void {
  const safety = rows[0];
  if (rows.length !== 1 || !safety) failPostcondition();
  if (!safety.canLogin || safety.connect === false || safety.schemaUsage === false) {
    failPostcondition();
  }
  if ([
    safety.superuser,
    safety.createDatabase,
    safety.createRole,
    safety.replication,
    safety.bypassRls,
    safety.databaseCreate,
    safety.schemaCreate,
  ].some(Boolean)) failPostcondition();
  requireExactBusinessStateReadbackSystemMembership(safety.membershipRoleNames);
}

function requireExactBusinessStateReadbackSystemMembership(
  memberships: readonly string[],
): void {
  const normalized = [...memberships].sort();
  if (normalized.length !== 1
    || normalized[0] !== BUSINESS_STATE_READBACK_REQUIRED_SYSTEM_MEMBERSHIP) {
    failPostcondition();
  }
}

export function requireNoBusinessStateReadbackTablePrivileges(
  rows: readonly BusinessStateReadbackTablePrivilegeRow[],
): void {
  if (rows.some((row) => [
    row.select,
    row.insert,
    row.update,
    row.delete,
    row.truncate,
    row.references,
    row.trigger,
  ].some(Boolean))) failPostcondition();
}

export function requireExactBusinessStateReadbackColumnPrivileges(
  rows: readonly BusinessStateReadbackColumnPrivilegeRow[],
): void {
  for (const row of rows) {
    const exactColumn = `${row.tableName}.${row.columnName}`;
    if (row.select !== BUSINESS_STATE_READBACK_SELECT_COLUMNS.has(exactColumn)) failPostcondition();
    if ([row.insert, row.update, row.references].some(Boolean)) failPostcondition();
  }
  if (rows.filter((row) => row.select).length
    !== BUSINESS_STATE_READBACK_SELECT_COLUMNS.size) failPostcondition();
}

export function requireExactRefundReadinessReadbackColumnPrivileges(
  rows: readonly BusinessStateReadbackColumnPrivilegeRow[],
): void {
  for (const row of rows) {
    const exactColumn = `${row.tableName}.${row.columnName}`;
    if (row.select !== REFUND_READINESS_READBACK_SELECT_COLUMNS.has(exactColumn)) failPostcondition();
    if ([row.insert, row.update, row.references].some(Boolean)) failPostcondition();
  }
  if (rows.filter((row) => row.select).length
    !== REFUND_READINESS_READBACK_SELECT_COLUMNS.size) failPostcondition();
}

export type BusinessStateReadbackRoleSafetyRow = Readonly<{
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
  membershipRoleNames: readonly string[];
}>;

export type BusinessStateReadbackTablePrivilegeRow = Readonly<{
  tableName: string;
  select: boolean;
  insert: boolean;
  update: boolean;
  delete: boolean;
  truncate: boolean;
  references: boolean;
  trigger: boolean;
}>;

export type BusinessStateReadbackColumnPrivilegeRow = Readonly<{
  tableName: string;
  columnName: string;
  select: boolean;
  insert: boolean;
  update: boolean;
  references: boolean;
}>;

type PrivilegeProfile =
  | "REFUND_ONLY"
  | "PL09_DISPATCHER"
  | "SYNTHETIC_SALE"
  | "CONTACTED_RECONCILIATION";

async function verifyRole(
  database: Pick<Client, "query">,
  role: RuntimeRole,
  profile: PrivilegeProfile,
): Promise<void> {
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
        has_column_privilege($1, relation.oid, attribute.attnum, 'UPDATE') AS "update",
        has_column_privilege($1, relation.oid, attribute.attnum, 'SELECT') AS "select",
        has_column_privilege($1, relation.oid, attribute.attnum, 'INSERT') AS "insert",
        has_column_privilege($1, relation.oid, attribute.attnum, 'REFERENCES') AS "references"
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

  const postAuthorization = await hasRefundAuthorizationMigration(database);
  requireRoleSafety(safety.rows);
  requireTablePrivileges(role, profile, tables.rows, postAuthorization);
  requireColumnPrivileges(role, profile, columns.rows, postAuthorization);
  requireNoSequencePrivileges(sequences.rows);
  if (postAuthorization) await verifyRefundAuthorizationEntryPoints(database, role);
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
  profile: PrivilegeProfile,
  rows: readonly TablePrivilegeRow[],
  postAuthorization: boolean,
): void {
  for (const row of rows) {
    const expected = tablePrivilegeExpectation(role, profile, row.tableName, postAuthorization);
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
  profile: PrivilegeProfile,
  tableName: string,
  postAuthorization: boolean,
): Omit<TablePrivilegeRow, "tableName"> {
  const canary = role === "mira_refund_canary";
  const sale = canary && profile === "SYNTHETIC_SALE";
  const expectedSelect = selectPrivileges(role, profile);
  return Object.freeze({
    select: expectedSelect.has(tableName),
    insert: canary && insertPrivileges(profile).has(tableName),
    update: canary && !postAuthorization && CANARY_TABLE_UPDATE.has(tableName),
    delete: sale && SYNTHETIC_SALE_DELETE.has(tableName),
    truncate: false,
    references: false,
    trigger: false,
  });
}

function selectPrivileges(role: RuntimeRole, profile: PrivilegeProfile): ReadonlySet<string> {
  if (role === "mira_refund_preflight") return PRE_FLIGHT_SELECT;
  if (profile === "SYNTHETIC_SALE") return SYNTHETIC_SALE_SELECT;
  if (profile === "CONTACTED_RECONCILIATION") return CONTACTED_RECONCILIATION_SELECT;
  return CANARY_SELECT;
}

function insertPrivileges(profile: PrivilegeProfile): ReadonlySet<string> {
  if (profile === "SYNTHETIC_SALE") return SYNTHETIC_SALE_INSERT;
  if (profile === "CONTACTED_RECONCILIATION") return CONTACTED_RECONCILIATION_INSERT;
  return CANARY_INSERT;
}

function requireColumnPrivileges(
  role: RuntimeRole,
  profile: PrivilegeProfile,
  rows: readonly ColumnPrivilegeRow[],
  postAuthorization: boolean,
): void {
  for (const row of rows) {
    const expectedUpdate = expectedColumnUpdate(role, profile, row, postAuthorization);
    if (row.update !== expectedUpdate) failPostcondition();
    if (postAuthorization) requireOtherColumnPrivileges(role, profile, row);
  }
}

function expectedColumnUpdate(role: RuntimeRole, profile: PrivilegeProfile, row: ColumnPrivilegeRow, postAuthorization: boolean): boolean {
    const exactColumn = `${row.tableName}.${row.columnName}`;
    const narrowed = postAuthorization && CANARY_TABLE_UPDATE.has(row.tableName);
    const temporaryUpdate = !narrowed && hasTemporaryColumnUpdate(profile, row.tableName, exactColumn);
    const canonicalUpdate = (narrowed ? AUTHORIZATION_UPDATE_COLUMNS.has(exactColumn) : CANARY_TABLE_UPDATE.has(row.tableName))
      || CANARY_ROW_LOCK_UPDATE_COLUMNS.has(exactColumn)
      || (row.tableName === "EximbayRefundSandboxCanaryApproval"
        && CANARY_APPROVAL_UPDATE_COLUMNS.has(row.columnName));
    return role === "mira_refund_canary"
      && (canonicalUpdate || temporaryUpdate);
}

function requireOtherColumnPrivileges(role: RuntimeRole, profile: PrivilegeProfile, row: ColumnPrivilegeRow): void {
  const expected = tablePrivilegeExpectation(role, profile, row.tableName, true);
  const pl09Select = role === "mira_refund_canary" && profile === "PL09_DISPATCHER"
    && PL09_DISPATCHER_SELECT_COLUMNS.has(`${row.tableName}.${row.columnName}`);
  const baselineSelect = role === "mira_refund_canary" && row.tableName === "CheckoutSession"
    && ["id", "communicationLocale"].includes(row.columnName);
  if (row.select !== (expected.select || pl09Select || baselineSelect) || row.insert !== expected.insert || row.references) failPostcondition();
}

function hasTemporaryColumnUpdate(
  profile: PrivilegeProfile,
  tableName: string,
  exactColumn: string,
): boolean {
  if (profile === "PL09_DISPATCHER") return PL09_DISPATCHER_UPDATE_COLUMNS.has(exactColumn);
  if (profile === "CONTACTED_RECONCILIATION") {
    return CONTACTED_RECONCILIATION_UPDATE_COLUMNS.has(exactColumn);
  }
  return profile === "SYNTHETIC_SALE"
    && (SYNTHETIC_SALE_UPDATE_COLUMNS.has(exactColumn)
      || SYNTHETIC_SALE_UPDATE_COLUMNS.has(`${tableName}.*`));
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
  select: boolean;
  insert: boolean;
  references: boolean;
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
