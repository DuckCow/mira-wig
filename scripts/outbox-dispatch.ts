import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  OUTBOX_DEFAULT_LIMIT,
  dispatchPending,
  type OutboxRegistry,
} from "../src/lib/payment/outbox";

const registry: OutboxRegistry = {};

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");

  const adapter = new PrismaPg({ connectionString });
  const db = new PrismaClient({ adapter });

  try {
    const result = await dispatchPending({ client: db, registry, limit: OUTBOX_DEFAULT_LIMIT });
    console.log(JSON.stringify(result));
  } finally {
    await db.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
