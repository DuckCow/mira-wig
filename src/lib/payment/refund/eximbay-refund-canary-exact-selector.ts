import { PaymentProvider, Prisma, type PrismaClient } from "@prisma/client";
import type { RefundExecutionWorkerCandidate } from "./worker-allocation";
import {
  contactedRefundExecutionWorkerWhere,
  readyRefundExecutionWorkerWhere,
  uncontactedRefundExecutionWorkerWhere,
} from "./worker-eligibility";

export async function selectExactEximbayRefundCanaryCandidate(
  client: PrismaClient,
  commandId: string,
): Promise<RefundExecutionWorkerCandidate | null> {
  if (typeof commandId !== "string" || commandId.length === 0) return null;
  return client.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
      SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
    `);
    const capturedAt = rows[0]?.capturedAt;
    if (!(capturedAt instanceof Date) || rows.length !== 1) return null;
    const providers = [PaymentProvider.EXIMBAY] as const;
    for (const [candidateClass, where] of [
      ["CONTACTED", contactedRefundExecutionWorkerWhere(capturedAt, providers)],
      ["UNCONTACTED", uncontactedRefundExecutionWorkerWhere(capturedAt, providers)],
      ["READY", readyRefundExecutionWorkerWhere(capturedAt, providers)],
    ] as const) {
      const found = await tx.refundExecutionCommand.findFirst({
        where: { AND: [{ id: commandId }, where] }, select: { id: true },
      });
      if (found) return Object.freeze({ commandId: found.id, candidateClass, provider: "EXIMBAY" });
    }
    return null;
  });
}
