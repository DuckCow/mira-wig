import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Client as PgClient } from "pg";
import type { H1ArtifactStore } from "./artifact-store";
import { AcceptanceBootstrap } from "./bootstrap";
import { ACCEPTANCE_DATABASE_NAME, verifyAcceptanceDatabase } from "./database-verifier";
import { acquireExclusiveRunLock } from "./exclusive-run-lock";
import { buildBaseLedgerIntegrity, type BaseLedgerIntegrity } from "./integrity";
import { RunLedgerStore } from "./run-ledger";
import { appendRuntimeLedger } from "./runtime-ledger";

type Env = Readonly<Record<string, string | undefined>>;

export type DatabaseContext = Readonly<{
  prisma: PrismaClient;
  bootstrap: AcceptanceBootstrap;
  ledger: RunLedgerStore;
  integrity: BaseLedgerIntegrity;
  staleLockRecovered: boolean;
  runProviderContact?: <T>(contact: () => Promise<T>) => Promise<T>;
}>;

export async function withAcceptanceDatabase<T>(
  env: Env,
  store: H1ArtifactStore,
  worktree: string,
  task: (context: DatabaseContext) => Promise<T>,
): Promise<T> {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL_REQUIRED");
  const pg = new PgClient({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  await pg.connect();
  try {
    const verified = await verifyAcceptanceDatabase(prisma, {
      configuredUrl: connectionString,
      migrationsDirectory: join(worktree, "prisma", "migrations"),
    });
    const lock = await acquireExclusiveRunLock(pg, store.path("locks", "run.lock"), store.runId);
    try {
      const integrity = await buildBaseLedgerIntegrity(worktree, verified.migrationFingerprint);
      const ledger = new RunLedgerStore(store.path("ledger"));
      const previous = await ledger.loadLatest();
      if (lock.staleLockRecovered && previous) {
        await appendRuntimeLedger(ledger, previous, previous.phase, {
          ...previous.payload,
          staleLockRecovered: true,
        });
      }
      return await task({
        prisma,
        bootstrap: new AcceptanceBootstrap(prisma, ACCEPTANCE_DATABASE_NAME),
        ledger,
        integrity,
        staleLockRecovered: lock.staleLockRecovered && !previous,
        runProviderContact: lock.runProviderContact,
      });
    } finally {
      await lock.release();
    }
  } finally {
    await prisma.$disconnect();
    await pg.end();
  }
}
