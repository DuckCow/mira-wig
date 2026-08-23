import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  compareRefundWorkerMigrations,
  loadRefundWorkerRepositoryMigrations,
  readRefundWorkerMigrationLedger,
} from "../worker-migration-readiness";

let client: PrismaClient | null = null;

beforeAll(() => {
  const connectionString = requireDisposableDatabaseUrl(process.env.DATABASE_URL);
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
});

afterAll(async () => {
  await client?.$disconnect();
  client = null;
});

describe("refund worker migration readiness integration", () => {
  it("matches the authoritative committed migration inventory without changing selected ledger content", async () => {
    const database = currentClient();
    const before = await migrationLedgerSnapshot(database);
    const repository = await loadRefundWorkerRepositoryMigrations();
    const ledger = await readRefundWorkerMigrationLedger(database);
    const after = await migrationLedgerSnapshot(database);

    expect(compareRefundWorkerMigrations(repository, ledger))
      .toEqual({ ok: true, status: "READY" });
    expect(repository).toHaveLength(37);
    expect(before).toHaveLength(37);
    expect(after).toEqual(before);
  });
});

interface MigrationLedgerSnapshotRow {
  migration_name: string;
  checksum: string;
  started_at: Date;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  applied_steps_count: number;
}

function migrationLedgerSnapshot(
  database: PrismaClient,
): Promise<MigrationLedgerSnapshotRow[]> {
  return database.$queryRaw<MigrationLedgerSnapshotRow[]>`
    SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count
    FROM "_prisma_migrations"
    ORDER BY migration_name ASC
  `;
}

function currentClient(): PrismaClient {
  if (!client) throw new Error("Disposable test database client is unavailable.");
  return client;
}

function requireDisposableDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("DATABASE_URL is required for migration readiness integration.");
  const parsed = new URL(value);
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!local || database !== "wig_platform_test") {
    throw new Error("Migration readiness integration is restricted to local wig_platform_test.");
  }
  return value;
}
