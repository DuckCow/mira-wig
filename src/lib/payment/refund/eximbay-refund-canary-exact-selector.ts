import { PaymentProvider, Prisma, type PrismaClient } from "@prisma/client";
import type { RefundExecutionWorkerCandidate } from "./worker-allocation";
import {
  readyRefundExecutionWorkerWhere,
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
    const found = await tx.refundExecutionCommand.findFirst({
      where: { AND: [{ id: commandId }, readyRefundExecutionWorkerWhere(capturedAt, providers)] },
      select: { id: true },
    });
    return found
      ? Object.freeze({ commandId: found.id, candidateClass: "READY", provider: "EXIMBAY" })
      : null;
  });
}
