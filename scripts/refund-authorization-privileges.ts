import { verifyExactCanaryLockRoutines } from "./eximbay-canary-lock-routine-authority";
import type { Client } from "pg";

export const AUTHORIZATION_MIGRATION = "20260909090000_refund_execution_authorization";
export const AUTHORIZATION_COMMAND_UPDATE = Object.freeze({
  Order: ["status", "updatedAt"],
  RefundAttempt: ["status", "processedAt", "failedAt", "failureCode", "safeFailureMessage", "providerRefundId", "updatedAt"],
  RefundExecutionCommand: ["status", "availableAt", "leaseOwner", "leaseUntil", "leaseGeneration", "leaseTokenHash", "dispatchAttempt", "lastSafeErrorCode", "lastSafeErrorMessage", "updatedAt"],
  RefundExecutionDispatchAttempt: ["state", "contactMarkedAt"],
});
export const AUTHORIZATION_UPDATE_COLUMNS = new Set(Object.entries(AUTHORIZATION_COMMAND_UPDATE)
  .flatMap(([table, columns]) => columns.map((column) => `${table}.${column}`)));

export async function hasRefundAuthorizationMigration(database: Pick<Client, "query">): Promise<boolean> {
  const result = await database.query<{ installed: boolean }>(`
    SELECT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) AS installed
  `, [AUTHORIZATION_MIGRATION]);
  return result.rows[0]?.installed === true;
}

// Called inside the existing bootstrap transaction, after historical inputs and before
// postcondition verification. Frozen SQL stays frozen; no broad baseline can commit after M.
export async function applyRefundAuthorizationPrivilegeFloor(database: Pick<Client, "query">): Promise<void> {
  if (!(await hasRefundAuthorizationMigration(database))) return;
  for (const [table, columns] of Object.entries(AUTHORIZATION_COMMAND_UPDATE)) {
    const all = await columnsOf(database, table);
    await database.query(`REVOKE UPDATE ON TABLE ${quote(table)} FROM mira_refund_canary`);
    await database.query(`REVOKE UPDATE (${all}) ON TABLE ${quote(table)} FROM mira_refund_canary`);
    await database.query(`GRANT UPDATE (${columns.map(quote).join(", ")}) ON TABLE ${quote(table)} TO mira_refund_canary`);
  }
  const grantColumns = await columnsOf(database, "RefundExecutionAuthorization");
  await database.query(`REVOKE ALL ON TABLE "RefundExecutionAuthorization" FROM PUBLIC, mira_refund_canary, mira_refund_preflight`);
  await database.query(`REVOKE SELECT (${grantColumns}), INSERT (${grantColumns}), UPDATE (${grantColumns}), REFERENCES (${grantColumns})
    ON TABLE "RefundExecutionAuthorization" FROM PUBLIC, mira_refund_canary, mira_refund_preflight`);
}

export async function verifyRefundAuthorizationEntryPoints(database: Pick<Client, "query">, role: string): Promise<void> {
  await verifyExactCanaryLockRoutines(database);
  const result = await database.query<{ unsafe: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = $1)
    ) OR EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND (p.proowner = (SELECT oid FROM pg_roles WHERE rolname = $1)
          OR (p.prosecdef AND has_function_privilege($1, p.oid, 'EXECUTE')
            AND NOT ($1 = 'mira_refund_canary' AND n.nspname = 'public'
              AND p.proname = ANY(ARRAY['mira_refund_canary_lock_payment',
                'mira_refund_canary_lock_provider_operation_binding',
                'mira_refund_canary_lock_command_events', 'mira_refund_canary_lock_evidence'])
              AND p.proargtypes = '25'::oidvector)))
    ) AS unsafe
  `, [role]);
  if (result.rows[0]?.unsafe !== false) throw new Error("REFUND_AUTHORIZATION_UNSAFE_DB_ENTRYPOINT");
  const triggers = await database.query<{ count: number }>(`
    SELECT count(*)::int AS count FROM pg_trigger
    WHERE tgname IN ('RefundAuthorization_lifecycle', 'RefundAuthorization_retention',
      'RefundAuthorization_command_guard', 'RefundAuthorization_consumption_coupled',
      'RefundAuthorization_generation_coupled', 'RefundAuthorization_event_guard',
      'RefundAuthorization_origin_retention', 'RefundAuthorization_binding_immutable',
      'RefundAuthorization_attempt_identity', 'RefundAuthorization_payment_lock_id',
      'RefundAuthorization_evidence_lock_id', 'RefundAuthorization_contact_history', 'RefundAuthorization_order_identity')
      AND tgenabled = 'O'
  `);
  if (triggers.rows[0]?.count !== 13) throw new Error("REFUND_AUTHORIZATION_ENFORCEMENT_REQUIRED");
}

// The existing deployment/bootstrap owner supplies the actual application principal;
// this does not create a role or expose a runtime SQL admission API.
export async function grantRefundAuthorizationApplicationAccess(database: Pick<Client, "query">, applicationRole: string): Promise<void> {
  if (!(await hasRefundAuthorizationMigration(database))) throw new Error("REFUND_AUTHORIZATION_MIGRATION_REQUIRED");
  if (!/^[A-Za-z][A-Za-z0-9_.@-]{0,62}$/u.test(applicationRole)
    || ["mira_refund_canary", "mira_refund_preflight"].includes(applicationRole)) throw new Error("REFUND_AUTHORIZATION_APPLICATION_ROLE_REQUIRED");
  const exists = await database.query<{ exists: boolean }>("SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists", [applicationRole]);
  if (exists.rows[0]?.exists !== true) throw new Error("REFUND_AUTHORIZATION_APPLICATION_ROLE_REQUIRED");
  await database.query(`GRANT SELECT, INSERT ON TABLE "RefundExecutionAuthorization" TO ${quote(applicationRole)}`);
  await database.query(`GRANT UPDATE ("revokedAt", "revokedByUserId", "consumedAt", "consumedByPrincipalId",
    "consumedExecutionId", "consumedExecutionUid", "consumedLeaseEventId") ON TABLE "RefundExecutionAuthorization" TO ${quote(applicationRole)}`);
}

async function columnsOf(database: Pick<Client, "query">, table: string): Promise<string> {
  const result = await database.query<{ name: string }>(`
    SELECT a.attname AS name FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = $1 AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum
  `, [table]);
  if (result.rows.length === 0) throw new Error("REFUND_AUTHORIZATION_TABLE_REQUIRED");
  return result.rows.map((row) => quote(row.name)).join(", ");
}

function quote(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
