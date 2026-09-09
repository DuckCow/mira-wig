import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { applyRefundAuthorizationCutover, readCutoverMigrationState } from "../../../../../scripts/refund-authorization-cutover";
import { bootstrapEximbayP3eDatabaseRoles, EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION } from "../../../../../scripts/eximbay-p3e-database-bootstrap";
import { loadRefundWorkerMigrationInventory } from "../worker-migration-inventory";
import { requireOwnedRefundTestCluster } from "./retained-refund-test-history";

const execute = promisify(execFile);
const role = "mira_cutover_test_app";
const password = "synthetic-disposable-cutover-password";
const input = { databaseName: "refund_sandbox", applicationRole: role } as const;
let directory: string;
let admin: Client;
let inventory: Awaited<ReturnType<typeof loadRefundWorkerMigrationInventory>>;
let candidateUrl: string;

beforeAll(async () => {
  await requireOwnedRefundTestCluster();
  inventory = await loadRefundWorkerMigrationInventory();
  directory = await mkdtemp(join(tmpdir(), "mira-cutover-existing-db-"));
  admin = new Client({ connectionString: process.env.DATABASE_URL }); await admin.connect();
  const url = new URL(process.env.DATABASE_URL ?? ""); url.pathname = "/refund_sandbox";
  candidateUrl = url.toString();
  await admin.query("CREATE DATABASE refund_sandbox");
  for (const entry of inventory.entries.slice(0, -1)) {
    const destination = join(directory, "migrations", entry.name);
    await mkdir(destination, { recursive: true });
    await copyFile(entry.path, join(destination, "migration.sql"));
  }
  await copyFile("prisma/migrations/migration_lock.toml", join(directory, "migrations/migration_lock.toml"));
  await writeFile(join(directory, "prisma.config.ts"), `import { defineConfig } from ${JSON.stringify(resolve("node_modules/prisma/config.js"))}; export default defineConfig({schema:${JSON.stringify(resolve("prisma/schema.prisma"))},migrations:{path:${JSON.stringify(join(directory,"migrations"))}},datasource:{url:process.env.DATABASE_URL}});`);
  await migrate(join(directory, "prisma.config.ts"));
  await withCandidate(async (database) => {
    await bootstrapEximbayP3eDatabaseRoles(database, { admission: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION, environment: "SANDBOX", targetDatabaseName: "refund_sandbox" });
    await database.query(`CREATE ROLE ${role} LOGIN NOINHERIT PASSWORD '${password}'`);
    await database.query(`ALTER ROLE mira_refund_canary PASSWORD '${password}'; ALTER ROLE mira_refund_preflight PASSWORD '${password}'`);
    await database.query(`GRANT CONNECT ON DATABASE refund_sandbox TO ${role}; GRANT USAGE ON SCHEMA public TO ${role}`);
  });
}, 60_000);

afterAll(async () => {
  if (admin) {
    await admin.query("DROP DATABASE IF EXISTS refund_sandbox");
    await admin.query(`DROP ROLE IF EXISTS ${role}`);
    await admin.end();
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

  it("rejects an inexact prefix before invoking migrations", async () => withCandidate(async (database) => {
    const first = inventory.entries[0];
    await database.query('UPDATE "_prisma_migrations" SET checksum=$1 WHERE migration_name=$2', ["bad", first?.name]);
    const migration = vi.fn();
    try {
      await expect(applyRefundAuthorizationCutover(database, input, inventory, migration)).rejects.toMatchObject({ phase: "PRECONDITION", migrationState: "AMBIGUOUS" });
      expect(migration).not.toHaveBeenCalled();
    } finally { await database.query('UPDATE "_prisma_migrations" SET checksum=$1 WHERE migration_name=$2', [first?.sha256, first?.name]); }
    expect(await readCutoverMigrationState(database, inventory)).toBe("BEFORE_M");
  }));

  it("preserves BEFORE_M after a migration process failure without resetting the ledger", async () => withCandidate(async (database) => {
    await expect(applyRefundAuthorizationCutover(database, input, inventory, () => Promise.reject(new Error("synthetic child failure"))))
      .rejects.toMatchObject({ phase: "MIGRATION", migrationState: "BEFORE_M" });
  }));

  it("retains committed M after ACL failure, then resumes ACL only and preserves all passwords", async () => withCandidate(async (database) => {
    const before = await passwordVerifiers(database);
    const migration = vi.fn(async () => {
      await migrate(resolve("prisma.config.ts"));
      await database.query(`GRANT DELETE ON "RefundExecutionAuthorization" TO ${role}`);
    });
    await expect(applyRefundAuthorizationCutover(database, input, inventory, migration))
      .rejects.toMatchObject({ phase: "ACL", migrationState: "M_COMMITTED" });
    expect(migration).toHaveBeenCalledOnce();
    expect(await passwordVerifiers(database)).toEqual(before);
    expect(await readCutoverMigrationState(database, inventory)).toBe("M_COMMITTED");
    expect((await database.query('SELECT count(*)::int AS count FROM "RefundExecutionAuthorization"')).rows).toEqual([{ count: 0 }]);
    await database.query(`REVOKE DELETE ON "RefundExecutionAuthorization" FROM ${role}`);
    const neverMigrate = vi.fn(() => Promise.reject(new Error("must not migrate twice")));
    const result = await applyRefundAuthorizationCutover(database, input, inventory, neverMigrate);
    expect(result).toMatchObject({ code: "REFUND_AUTHORIZATION_CUTOVER_COMPLETE", migrationInvoked: false, credentialMutation: false });
    expect(neverMigrate).not.toHaveBeenCalled();
    expect(await passwordVerifiers(database)).toEqual(before);
    const worker = new URL(candidateUrl); worker.username = "mira_refund_canary"; worker.password = password;
    const restricted = new Client({ connectionString: worker.toString() }); await restricted.connect();
    try {
      await expect(restricted.query('SELECT * FROM "RefundExecutionAuthorization"')).rejects.toMatchObject({ code: "42501" });
      await expect(restricted.query('UPDATE "RefundExecutionCommand" SET id=id WHERE false')).rejects.toMatchObject({ code: "42501" });
      await expect(restricted.query('UPDATE "RefundExecutionCommand" SET "leaseGeneration"="leaseGeneration" WHERE false')).resolves.toBeDefined();
    } finally { await restricted.end(); }
  }), 60_000);

  it("refuses post-M schema drift without reapplying M", async () => withCandidate(async (database) => {
    await database.query('ALTER TABLE "RefundExecutionCommand" DISABLE TRIGGER "RefundAuthorization_command_guard"');
    const migration = vi.fn();
    try {
      await expect(applyRefundAuthorizationCutover(database, input, inventory, migration)).rejects.toMatchObject({ migrationState: "AMBIGUOUS" });
      expect(migration).not.toHaveBeenCalled();
    } finally { await database.query('ALTER TABLE "RefundExecutionCommand" ENABLE TRIGGER "RefundAuthorization_command_guard"'); }
  }));

async function migrate(config: string) {
  const result = await execute(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy", "--config", config], {
    env: { ...process.env, DATABASE_URL: candidateUrl }, maxBuffer: 1024 * 1024,
  });
  await writeFile(join(directory, config.includes(directory) ? "prefix.log" : "M.log"), result.stdout + result.stderr);
}
async function withCandidate(work: (database: Client) => Promise<void>) {
  const database = new Client({ connectionString: candidateUrl }); await database.connect();
  try { await work(database); } finally { await database.end(); }
}
async function passwordVerifiers(database: Client) {
  // Synthetic credentials only, in the proven task-owned cluster; never emitted.
  return (await database.query<{ rolname: string; rolpassword: string }>("SELECT rolname, rolpassword FROM pg_authid WHERE rolname=ANY($1::text[]) ORDER BY rolname", [[role,"mira_refund_canary","mira_refund_preflight"]])).rows;
}
