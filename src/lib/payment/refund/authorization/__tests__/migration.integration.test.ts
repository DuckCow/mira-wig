import historicalInventory from "../../__tests__/fixtures/historical-pl-migration-inventory.json";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";
import { afterEach, expect, it } from "vitest";
import { targetFixture, cleanupTargets, pgFor, roleUrl, type Target } from "./fixture";
import { requireOwnedRefundTestCluster } from "../../__tests__/retained-refund-test-history";

afterEach(cleanupTargets);
it("M preserves a synthetic pre-M consumed origin/generation and immediately rejects the old ungranted takeover", async () => {
  await requireOwnedRefundTestCluster();
  const target = await targetFixture(2);
  const admin = await pgFor();
  const name = `mira_refund_migration_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(roleUrl()); url.pathname = `/${name}`; url.searchParams.delete("schema");
  const candidate = new Client({ connectionString: url.toString() });
  try {
    await candidate.connect();
    const migrations = historicalInventory.entries.map((entry) => entry.name);
    const m = migrations.pop();
    expect(m).toBe("20260909090000_refund_execution_authorization");
    // psql preserves each migration's own statement/transaction boundaries, including
    // historical enum ADD VALUE followed by use in a separate autocommit statement.
    for (const migration of migrations) await promisify(execFile)(process.env.MIRA_REFUND_AUTHORIZATION_TEST_PSQL ?? "psql", [
      "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--dbname", url.toString(), "--file", join("prisma/migrations", migration, "migration.sql"),
    ]);
    const snapshot = await copySyntheticHistory(admin, candidate, target);
    await candidate.query(await readFile(join("prisma/migrations", m ?? "missing", "migration.sql"), "utf8"));
    for (const [table, expected] of snapshot) {
      expect((await candidate.query(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows).toEqual(expected);
    }
    expect((await candidate.query('SELECT count(*)::int AS count FROM "RefundExecutionAuthorization"')).rows).toEqual([{ count: 0 }]);
    await expect(candidate.query(`UPDATE "RefundExecutionCommand" SET "leaseGeneration"=3,
      "leaseUntil"=(clock_timestamp() AT TIME ZONE 'UTC')+interval '5 minutes', "leaseOwner"='old-ungranted-worker',
      "leaseTokenHash"=repeat('e',64) WHERE id=$1`, [target.commandId])).rejects.toThrow(/REFUND_AUTHORIZATION_REQUIRED/u);
    expect((await candidate.query('SELECT "leaseGeneration" FROM "RefundExecutionCommand" WHERE id=$1', [target.commandId])).rows).toEqual([{ leaseGeneration: 2 }]);
  } finally {
    await candidate.end();
    await admin.query(`DROP DATABASE ${name}`);
    await admin.end();
  }
}, 30_000);

async function copySyntheticHistory(source: Client, destination: Client, target: Target) {
  const selected = [
    ["Market", '"code"', "KR"], ["User", "id", target.fixture.userId],
    ["CheckoutSession", "id", target.fixture.sessionId], ["Payment", "id", target.paymentId],
    ["Order", "id", target.fixture.orderId], ["RefundAttempt", "id", target.refundAttemptId],
    ["RefundAttemptTransition", '"refundAttemptId"', target.refundAttemptId],
    ["RefundExecutionCommand", "id", target.commandId], ["RefundExecutionCommandEvent", '"commandId"', target.commandId],
    ["RefundExecutionProviderOperationBinding", "id", target.providerOperationBindingId],
    ["EximbayRefundSandboxCanaryApproval", '"commandId"', target.commandId],
  ];
  const snapshot = new Map<string, unknown[]>();
  for (const [table, column, id] of selected) {
    const result = await source.query<{ row: unknown }>(`SELECT to_jsonb(t) AS row FROM "${table}" t WHERE ${column}=$1 ORDER BY to_jsonb(t)::text`, [id]);
    for (const row of result.rows) await destination.query(`INSERT INTO "${table}" SELECT * FROM json_populate_record(NULL::"${table}", $1::json)`, [JSON.stringify(row.row)]);
    snapshot.set(table, (await destination.query(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows);
  }
  return snapshot;
}
