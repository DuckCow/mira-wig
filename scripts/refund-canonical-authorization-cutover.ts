import { requireCanonicalMigrationInventory } from "../src/lib/payment/refund/canonical-migration-inventory";
import type { Client } from "pg";
import {
  defaultEximbayP3eDatabaseBootstrapDependencies,
  EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
  restoreCanaryRefundRoleGrants,
  verifyExactEffectivePrivileges,
} from "./eximbay-p3e-database-bootstrap";
import {
  grantRefundAuthorizationApplicationAccess,
  verifyRefundAuthorizationEntryPoints,
} from "./refund-authorization-privileges";
import type { RefundWorkerMigrationInventory } from "../src/lib/payment/refund/worker-migration-inventory";

export const REFUND_AUTHORIZATION_CUTOVER_MODE = "apply-canonical-refund-authorization-cutover";
type CutoverState = "BEFORE_M" | "M_COMMITTED" | "AMBIGUOUS";
export class RefundAuthorizationCutoverFailure extends Error {
  constructor(readonly phase: "PRECONDITION" | "MIGRATION" | "ACL", readonly migrationState: CutoverState) {
    super("REFUND_AUTHORIZATION_CUTOVER_STOP");
  }
}

export function validCutoverApplicationRole(value: string | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.@-]{0,62}$/u.test(value)
    && !["mira_refund_canary", "mira_refund_preflight"].includes(value);
}

export function requireCutoverInventory(inventory: RefundWorkerMigrationInventory): void {
  try { requireCanonicalMigrationInventory(inventory); }
  catch { throw new RefundAuthorizationCutoverFailure("PRECONDITION", "AMBIGUOUS"); }
}

// The existing Prisma owner is supplied by the bootstrap entrypoint. No alternate SQL
// migration engine, ledger repair, initial role bootstrap or credential path lives here.
export async function applyRefundAuthorizationCutover(
  database: Client,
  input: Readonly<{ databaseName: "refund_sandbox" | "wig_platform_test"; applicationRole: string }>,
  inventory: RefundWorkerMigrationInventory,
  migrate: () => Promise<void>,
) {
  requireCutoverInventory(inventory);
  const target = await database.query<{ name: string }>("SELECT current_database() AS name");
  if (target.rows[0]?.name !== input.databaseName || !validCutoverApplicationRole(input.applicationRole)) {
    throw new RefundAuthorizationCutoverFailure("PRECONDITION", "AMBIGUOUS");
  }
  const before = await readCutoverMigrationState(database, inventory);
  if (before === "AMBIGUOUS") throw new RefundAuthorizationCutoverFailure("PRECONDITION", before);
  try { await requireExistingCutoverRoles(database, input.applicationRole); }
  catch { throw new RefundAuthorizationCutoverFailure("PRECONDITION", before); }
  if (before === "BEFORE_M") {
    try { await migrate(); }
    catch { throw new RefundAuthorizationCutoverFailure("MIGRATION", await readCutoverMigrationState(database, inventory)); }
  }
  if (await readCutoverMigrationState(database, inventory) !== "M_COMMITTED") {
    throw new RefundAuthorizationCutoverFailure("MIGRATION", "AMBIGUOUS");
  }
  try {
    await restoreCanaryRefundRoleGrants(database, {
      admission: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
      environment: "SANDBOX", targetDatabaseName: input.databaseName,
    }, {
      ...defaultEximbayP3eDatabaseBootstrapDependencies,
      verifyExactLedger: async (transaction) => {
        if (await readCutoverMigrationState(transaction, inventory) !== "M_COMMITTED") throw new Error("CUTOVER_LEDGER_CHANGED");
      },
      beforePostcondition: async (transaction) => {
        await grantRefundAuthorizationApplicationAccess(transaction, input.applicationRole);
        await verifyCutoverApplicationPrivileges(transaction, input.applicationRole);
      },
    });
    await verifyExactEffectivePrivileges(database);
    await verifyCutoverApplicationPrivileges(database, input.applicationRole);
  } catch { throw new RefundAuthorizationCutoverFailure("ACL", await readCutoverMigrationState(database, inventory)); }
  return Object.freeze({ code: "REFUND_AUTHORIZATION_CUTOVER_COMPLETE", mode: REFUND_AUTHORIZATION_CUTOVER_MODE,
    migrationState: "M_COMMITTED", migrationInvoked: before === "BEFORE_M", migrationCount: inventory.migrationCount,
    migrationSha256: inventory.migrationDigest, roleGrantPostcondition: "EXACT_EFFECTIVE_PRIVILEGES_VERIFIED",
    credentialMutation: false, businessRowMutation: false, providerEffects: 0 });
}

export async function readCutoverMigrationState(database: Pick<Client, "query">, inventory: RefundWorkerMigrationInventory): Promise<CutoverState> {
  try {
    requireCutoverInventory(inventory);
    const result = await database.query<{ name: string; checksum: string; complete: boolean }>(`
      SELECT migration_name AS name, checksum, (finished_at IS NOT NULL AND rolled_back_at IS NULL) AS complete
      FROM public."_prisma_migrations" ORDER BY migration_name, started_at
    `);
    if (![inventory.migrationCount - 1, inventory.migrationCount].includes(result.rows.length)) return "AMBIGUOUS";
    if (!result.rows.every((row, index) => row.complete && row.name === inventory.entries[index]?.name
      && row.checksum === inventory.entries[index]?.sha256)) return "AMBIGUOUS";
    const schema = await database.query<{ present: boolean }>("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='EximbayRefundSandboxCanaryApproval' AND column_name='approvalAuthorityDigestV2') AS present");
    if (result.rows.length === inventory.migrationCount - 1) return schema.rows[0]?.present === false ? "BEFORE_M" : "AMBIGUOUS";
    if (schema.rows[0]?.present !== true) return "AMBIGUOUS";
    await verifyRefundAuthorizationEntryPoints(database, "mira_refund_canary");
    return "M_COMMITTED";
  } catch { return "AMBIGUOUS"; }
}

async function requireExistingCutoverRoles(database: Pick<Client, "query">, applicationRole: string): Promise<void> {
  const result = await database.query<{ name: string; safe: boolean }>(`
    SELECT rolname AS name, (rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolreplication AND NOT rolbypassrls AND NOT EXISTS
      (SELECT 1 FROM pg_auth_members WHERE member = r.oid)) AS safe
    FROM pg_roles r WHERE rolname = ANY($1::text[])
  `, [["mira_refund_canary", "mira_refund_preflight", applicationRole]]);
  if (result.rows.length !== 3 || result.rows.some((row) => !row.safe)) {
    throw new RefundAuthorizationCutoverFailure("PRECONDITION", "AMBIGUOUS");
  }
  await verifyApplicationRoleOwnership(database, applicationRole);
}

async function verifyApplicationRoleOwnership(database: Pick<Client, "query">, role: string): Promise<void> {
  const result = await database.query<{ unsafe: boolean }>(`
    SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=$1))
      OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND
      (p.proowner=(SELECT oid FROM pg_roles WHERE rolname=$1) OR (p.prosecdef AND has_function_privilege($1,p.oid,'EXECUTE')))) AS unsafe
  `, [role]);
  if (result.rows[0]?.unsafe !== false) throw new Error("CUTOVER_APPLICATION_UNSAFE");
}

export async function verifyCutoverApplicationPrivileges(database: Pick<Client, "query">, role: string): Promise<void> {
  await requireExistingCutoverRoles(database, role);
  const table = await database.query<{ privilege: string; allowed: boolean }>(`
    SELECT privilege, has_table_privilege($1, 'public."RefundExecutionAuthorization"', privilege) AS allowed
    FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS privilege
  `, [role]);
  if (table.rows.some((row) => row.allowed !== ["SELECT", "INSERT"].includes(row.privilege))) throw new Error("CUTOVER_APPLICATION_TABLE_ACL");
  const columns = await database.query<{ name: string; update: boolean; references: boolean }>(`
    SELECT attname AS name, has_column_privilege($1,attrelid,attnum,'UPDATE') AS update,
      has_column_privilege($1,attrelid,attnum,'REFERENCES') AS references
    FROM pg_attribute WHERE attrelid='public."RefundExecutionAuthorization"'::regclass AND attnum>0 AND NOT attisdropped
  `, [role]);
  const updates = new Set(["revokedAt", "revokedByUserId", "consumedAt", "consumedByPrincipalId", "consumedExecutionId", "consumedExecutionUid", "consumedLeaseEventId"]);
  if (!columns.rows.length || columns.rows.some((row) => row.update !== updates.has(row.name) || row.references)) throw new Error("CUTOVER_APPLICATION_COLUMN_ACL");
  await verifyRefundAuthorizationEntryPoints(database, role);
}
