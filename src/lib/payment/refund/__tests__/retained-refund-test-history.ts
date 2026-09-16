import { isAbsolute } from "node:path";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// Teardown only: require the explicitly supplied disposable cluster's actual data
// directory, then disable retention on this transaction/connection only. Production
// runtime roles cannot SET session_replication_role. Never import from application code.
export async function requireOwnedRefundTestCluster(tx: Prisma.TransactionClient = db): Promise<void> {
  const directory = process.env.MIRA_REFUND_AUTHORIZATION_TEST_CLUSTER;
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/");
  if (!directory || !isAbsolute(directory) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("TASK_OWNED_REFUND_TEST_CLUSTER_REQUIRED");
  }
  const rows = await tx.$queryRaw<{ directory: string; database: string }[]>`
    SELECT current_setting('data_directory') AS directory, current_database() AS database
  `;
  if (rows[0]?.directory !== directory || rows[0]?.database !== "wig_platform_test") {
    throw new Error("TASK_OWNED_REFUND_TEST_CLUSTER_MISMATCH");
  }
}

export async function deleteRetainedRefundTestHistory(commandIds: readonly string[]): Promise<void> {
  if (commandIds.length === 0) return;
  const where = { commandId: { in: [...commandIds] } };
  const retained = await db.eximbayRefundSandboxCanaryApproval.count({ where: { ...where, consumedAt: { not: null } } });
  const grants = await db.refundExecutionAuthorization.count({ where });
  if (retained === 0 && grants === 0) return;
  await db.$transaction(async (tx) => {
    await requireOwnedRefundTestCluster(tx);
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.refundExecutionAuthorization.deleteMany({ where });
    await tx.eximbayRefundSandboxCanaryApproval.deleteMany({ where });
  });
}
