import type { Prisma } from "@prisma/client";

type LineageReader = Pick<Prisma.TransactionClient, "promotionGrant">;

const MAX_RECOVERY_LINEAGE_DEPTH = 100;

export async function hasValidPromotionRecoveryLineage(
  reader: LineageReader,
  grantId: string,
): Promise<boolean> {
  if (!grantId.trim()) return false;
  const seen = new Set<string>();
  let currentId: string | null = grantId;
  let depth = 0;
  while (currentId !== null && depth < MAX_RECOVERY_LINEAGE_DEPTH) {
    if (seen.has(currentId)) return false;
    seen.add(currentId);
    const current = await loadLineageGrant(reader, currentId);
    if (!current) return false;
    if (current.recoveredFromGrantId === null) {
      return current.recoveryEligibleAt === null;
    }
    const predecessorId = await coherentPredecessorId(reader, current);
    if (predecessorId === null) return false;
    currentId = predecessorId;
    depth += 1;
  }
  return false;
}

async function coherentPredecessorId(
  reader: LineageReader,
  current: LineageGrant,
): Promise<string | null> {
  if (!hasCoherentRecoveryLink(current) || current.recoveredFromGrantId === null) return null;
  const predecessor = await loadLineageGrant(reader, current.recoveredFromGrantId);
  if (!predecessor) return null;
  return [
    inheritsRecoveryIdentity(current, predecessor),
    predecessor.redeemedAt !== null,
    predecessor.order !== null,
  ].every(Boolean) ? predecessor.id : null;
}

function loadLineageGrant(reader: LineageReader, id: string) {
  return reader.promotionGrant.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      policyVersionId: true,
      grantKey: true,
      benefitYear: true,
      originMarketCode: true,
      issuedAt: true,
      recoveredFromGrantId: true,
      recoveryEligibleAt: true,
      redeemedAt: true,
      order: { select: { id: true } },
    },
  });
}

type LineageGrant = NonNullable<Awaited<ReturnType<typeof loadLineageGrant>>>;

function hasCoherentRecoveryLink(grant: LineageGrant): boolean {
  return grant.recoveredFromGrantId !== null
    && grant.recoveryEligibleAt !== null
    && grant.grantKey === `recovery:${grant.recoveredFromGrantId}`
    && grant.id !== grant.recoveredFromGrantId
    && grant.issuedAt.getTime() >= grant.recoveryEligibleAt.getTime();
}

function inheritsRecoveryIdentity(current: LineageGrant, predecessor: LineageGrant): boolean {
  return current.userId === predecessor.userId
    && current.policyVersionId === predecessor.policyVersionId
    && current.benefitYear === predecessor.benefitYear
    && current.originMarketCode === predecessor.originMarketCode;
}
