import { randomUUID } from "node:crypto";
import {
  OrderStatus,
  PaymentAttemptStatus,
  Prisma,
  PromotionKind,
  PromotionPolicyStatus,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  type PrismaClient,
} from "@prisma/client";
import { hasConsistentRefundAttemptLedgerIdentity } from "@/lib/payment/refund/invariants";
import { buildRefundExecutionApplyOperationKey } from "@/lib/payment/refund/execution-result-contract";
import { EXECUTION_SUCCEEDED_TRANSITION_REASON } from "@/lib/payment/refund/execution-result-plan";
import { validateRefundEconomicAllocation } from "@/lib/payment/refund/economic-validation";
import { isPromotionRecoveryIssuanceEnabled } from "./recovery-activation";
import { hasValidPromotionRecoveryLineage } from "./recovery-lineage";

const DAY_MS = 86_400_000;

export type PromotionRecoveryInconsistency =
  | "ORDER_PROMOTION_SNAPSHOT"
  | "SOURCE_GRANT_PROVENANCE"
  | "REFUND_LEDGER_IDENTITY"
  | "REFUND_SUCCESS_EVIDENCE"
  | "REFUND_ECONOMIC_HISTORY"
  | "RECOVERY_GRANT_IDENTITY"
  | "RECOVERY_EXPIRY";

export type PromotionRecoveryClassification =
  | { kind: "NOT_APPLICABLE" }
  | { kind: "NOT_YET_ELIGIBLE" }
  | { kind: "ELIGIBLE_NOT_ISSUED"; recoveryEligibleAt: Date }
  | { kind: "ISSUED"; recoveryEligibleAt: Date; recoveryGrantId: string }
  | { kind: "INCONSISTENT"; reason: PromotionRecoveryInconsistency };

export interface PromotionRecoverySnapshot {
  readonly orderId: string;
  readonly sourceGrantId: string | null;
  readonly classification: PromotionRecoveryClassification;
}

export type EnsurePromotionRecoveryResult =
  | { ok: true; snapshot: PromotionRecoverySnapshot; issuedNow: boolean }
  | { ok: false; code: "FEATURE_DISABLED" | "INVALID_ORDER_ID" | "ORDER_NOT_FOUND" };

type RecoveryTx = Prisma.TransactionClient;
type RecoveryReader = Pick<PrismaClient, "order" | "promotionGrant">;
type RecoveryAggregate = NonNullable<Awaited<ReturnType<typeof loadRecoveryAggregate>>>;
type RecoveryAttempt = RecoveryAggregate["refundAttempts"][number];

export async function readPromotionRecoverySnapshot(
  reader: RecoveryReader,
  orderId: string,
): Promise<PromotionRecoverySnapshot | null> {
  const normalizedOrderId = orderId.trim();
  if (!normalizedOrderId) return null;
  const aggregate = await loadRecoveryAggregate(reader, normalizedOrderId);
  if (!aggregate) return null;
  return classifyRecovery(reader, aggregate);
}

export async function ensurePromotionRecoveryForOrder(
  client: PrismaClient,
  orderId: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<EnsurePromotionRecoveryResult> {
  const normalizedOrderId = orderId.trim();
  if (!normalizedOrderId) return { ok: false, code: "INVALID_ORDER_ID" };
  if (!isPromotionRecoveryIssuanceEnabled(env)) return { ok: false, code: "FEATURE_DISABLED" };
  try {
    return await client.$transaction((tx) => ensureInTransaction(tx, normalizedOrderId));
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const snapshot = await readPromotionRecoverySnapshot(client, normalizedOrderId);
    if (!snapshot) return { ok: false, code: "ORDER_NOT_FOUND" };
    if (snapshot.classification.kind === "ISSUED") {
      return { ok: true, snapshot, issuedNow: false };
    }
    throw error;
  }
}

async function ensureInTransaction(
  tx: RecoveryTx,
  orderId: string,
): Promise<EnsurePromotionRecoveryResult> {
  if (!await lockOrder(tx, orderId)) return { ok: false, code: "ORDER_NOT_FOUND" };
  let aggregate = await loadRecoveryAggregate(tx, orderId);
  if (!aggregate) return { ok: false, code: "ORDER_NOT_FOUND" };
  let snapshot = await classifyRecovery(tx, aggregate);
  if (requiresRecoveryIdentityLocks(snapshot.classification.kind)) {
    const source = aggregate.promotionGrant;
    if (!source) {
      return { ok: true, snapshot: inconsistentSnapshot(aggregate, "SOURCE_GRANT_PROVENANCE"), issuedNow: false };
    }
    await lockPromotionGrant(tx, source.id);
    if (source.recoveryGrant !== null) await lockPromotionGrant(tx, source.recoveryGrant.id);
    const lockedAggregate = await loadRecoveryAggregate(tx, orderId);
    if (!lockedAggregate) return { ok: false, code: "ORDER_NOT_FOUND" };
    aggregate = lockedAggregate;
    snapshot = await classifyRecovery(tx, aggregate);
  }
  if (snapshot.classification.kind !== "ELIGIBLE_NOT_ISSUED") {
    return { ok: true, snapshot, issuedNow: false };
  }
  const source = aggregate.promotionGrant;
  if (!source) return { ok: true, snapshot: inconsistentSnapshot(aggregate, "SOURCE_GRANT_PROVENANCE"), issuedNow: false };
  const issuanceAt = await captureOperationTime(tx);
  const expiresAt = recoveryExpiry(source, issuanceAt, snapshot.classification.recoveryEligibleAt);
  if (expiresAt.kind === "invalid") {
    return { ok: true, snapshot: inconsistentSnapshot(aggregate, "RECOVERY_EXPIRY"), issuedNow: false };
  }
  const recoveryGrant = await tx.promotionGrant.create({
    data: {
      id: randomUUID(),
      userId: source.userId,
      policyVersionId: source.policyVersionId,
      grantKey: `recovery:${source.id}`,
      benefitYear: source.benefitYear,
      originMarketCode: source.originMarketCode,
      issuedAt: issuanceAt,
      validFrom: snapshot.classification.recoveryEligibleAt,
      expiresAt: expiresAt.value,
      recoveredFromGrantId: source.id,
      recoveryEligibleAt: snapshot.classification.recoveryEligibleAt,
    },
    select: { id: true },
  });
  return {
    ok: true,
    issuedNow: true,
    snapshot: {
      orderId: aggregate.id,
      sourceGrantId: source.id,
      classification: {
        kind: "ISSUED",
        recoveryEligibleAt: snapshot.classification.recoveryEligibleAt,
        recoveryGrantId: recoveryGrant.id,
      },
    },
  };
}

function requiresRecoveryIdentityLocks(
  kind: PromotionRecoveryClassification["kind"],
): boolean {
  return ["ELIGIBLE_NOT_ISSUED", "ISSUED"].includes(kind);
}

async function classifyRecovery(
  reader: RecoveryReader,
  aggregate: RecoveryAggregate,
): Promise<PromotionRecoverySnapshot> {
  if (aggregate.promotionGrantId === null) return snapshot(aggregate, { kind: "NOT_APPLICABLE" });
  const source = aggregate.promotionGrant;
  if (!hasCoherentOrderPromotion(aggregate, source)) {
    return inconsistentSnapshot(aggregate, "ORDER_PROMOTION_SNAPSHOT");
  }
  if (!await hasValidPromotionRecoveryLineage(reader, source.id)) {
    return inconsistentSnapshot(aggregate, "SOURCE_GRANT_PROVENANCE");
  }
  if (!hasConsistentRefundAttemptLedgerIdentity(aggregate.payment, aggregate.refundAttempts)) {
    return inconsistentSnapshot(aggregate, "REFUND_LEDGER_IDENTITY");
  }
  if (!hasCoherentRefundAmounts(aggregate)) {
    return inconsistentSnapshot(aggregate, "REFUND_LEDGER_IDENTITY");
  }
  const successes = aggregate.refundAttempts.filter(isSucceededAttempt).sort(compareSucceededAttempts);
  if (!successes.every((attempt) => hasCoherentSuccessEvidence(attempt, aggregate.currency))) {
    return inconsistentSnapshot(aggregate, "REFUND_SUCCESS_EVIDENCE");
  }
  const economics = validateRefundEconomicAllocation(aggregate, 0, []);
  if (!economics.ok) return inconsistentSnapshot(aggregate, "REFUND_ECONOMIC_HISTORY");
  const recoveryEligibleAt = firstRecoveryEligibleAt(aggregate, successes);
  if (recoveryEligibleAt === null) {
    return classifyBeforeEligibility(aggregate, source);
  }
  if (!hasCoherentRecoveryExpirySource(source)) {
    return inconsistentSnapshot(aggregate, "RECOVERY_EXPIRY");
  }
  return classifyEligibleRecovery(aggregate, source, recoveryEligibleAt);
}

function classifyBeforeEligibility(
  aggregate: RecoveryAggregate,
  source: NonNullable<RecoveryAggregate["promotionGrant"]>,
): PromotionRecoverySnapshot {
  return source.recoveryGrant === null
    ? snapshot(aggregate, { kind: "NOT_YET_ELIGIBLE" })
    : inconsistentSnapshot(aggregate, "RECOVERY_GRANT_IDENTITY");
}

function classifyEligibleRecovery(
  aggregate: RecoveryAggregate,
  source: NonNullable<RecoveryAggregate["promotionGrant"]>,
  recoveryEligibleAt: Date,
): PromotionRecoverySnapshot {
  if (source.recoveryGrant === null) {
    return snapshot(aggregate, { kind: "ELIGIBLE_NOT_ISSUED", recoveryEligibleAt });
  }
  if (!hasCoherentRecoveryGrant(source, source.recoveryGrant, recoveryEligibleAt)) {
    return inconsistentSnapshot(aggregate, "RECOVERY_GRANT_IDENTITY");
  }
  return snapshot(aggregate, {
    kind: "ISSUED",
    recoveryEligibleAt,
    recoveryGrantId: source.recoveryGrant.id,
  });
}

function loadRecoveryAggregate(reader: Pick<RecoveryReader, "order">, orderId: string) {
  return reader.order.findUnique({
    where: { id: orderId },
    include: {
      payment: true,
      items: { orderBy: { id: "asc" } },
      promotionGrant: {
        include: {
          policyVersion: true,
          recoveryGrant: true,
          order: { select: { id: true } },
        },
      },
      refundAttempts: {
        orderBy: [{ processedAt: "asc" }, { id: "asc" }],
        include: {
          lines: {
            orderBy: { orderItemId: "asc" },
            include: { economicAllocation: true },
          },
          transitions: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
          executionCommand: {
            include: { evidence: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
          },
        },
      },
    },
  });
}

function hasCoherentOrderPromotion(
  aggregate: RecoveryAggregate,
  source: RecoveryAggregate["promotionGrant"],
): source is NonNullable<RecoveryAggregate["promotionGrant"]> {
  if (!source
    || source.order === null
    || aggregate.items.length === 0
    || !hasCoherentFrozenOrderMoney(aggregate)) return false;
  const supportedKind = source.policyVersion.kind === PromotionKind.SIGNUP
    || source.policyVersion.kind === PromotionKind.BIRTHDAY;
  const supportedPolicyStatus = source.policyVersion.status === PromotionPolicyStatus.ACTIVE
    || source.policyVersion.status === PromotionPolicyStatus.RETIRED;
  return [
    source.order.id === aggregate.id,
    source.userId === aggregate.userId,
    source.redeemedAt !== null,
    source.revokedAt === null,
    source.reservedCheckoutSessionId === null,
    source.reservedAt === null,
    supportedKind,
    supportedPolicyStatus,
    aggregate.payment.id === aggregate.paymentId,
    aggregate.payment.status === PaymentAttemptStatus.SUCCEEDED,
    aggregate.payment.amount === aggregate.totalAmount,
    aggregate.payment.currency === aggregate.currency,
  ].every(Boolean);
}

function hasCoherentFrozenOrderMoney(aggregate: RecoveryAggregate): boolean {
  if (!hasCoherentOrderMoneyScalars(aggregate)) return false;
  let subtotal = BigInt(0);
  let discount = BigInt(0);
  for (const item of aggregate.items) {
    if (!hasCoherentRecoveryItem(item)) return false;
    const gross = BigInt(item.unitAmount) * BigInt(item.quantity);
    subtotal += gross;
    discount += BigInt(item.discountAmount);
  }
  return [
    subtotal === BigInt(aggregate.subtotalAmount),
    discount === BigInt(aggregate.discountAmount),
    subtotal - discount + BigInt(aggregate.shippingAmount) === BigInt(aggregate.totalAmount),
  ].every(Boolean);
}

function hasCoherentOrderMoneyScalars(aggregate: RecoveryAggregate): boolean {
  return [
    Number.isSafeInteger(aggregate.subtotalAmount),
    aggregate.subtotalAmount >= 0,
    Number.isSafeInteger(aggregate.discountAmount),
    aggregate.discountAmount > 0,
    Number.isSafeInteger(aggregate.shippingAmount),
    aggregate.shippingAmount >= 0,
    Number.isSafeInteger(aggregate.totalAmount),
    aggregate.totalAmount >= 0,
  ].every(Boolean);
}

function hasCoherentRecoveryItem(item: RecoveryAggregate["items"][number]): boolean {
  const scalarShape = [
    Number.isInteger(item.quantity),
    item.quantity > 0,
    Number.isInteger(item.unitAmount),
    item.unitAmount >= 0,
    Number.isInteger(item.discountAmount),
    item.discountAmount >= 0,
  ].every(Boolean);
  return scalarShape
    && BigInt(item.discountAmount) <= BigInt(item.unitAmount) * BigInt(item.quantity);
}

function hasCoherentSuccessEvidence(attempt: RecoveryAttempt, currency: string): boolean {
  const command = attempt.executionCommand;
  if (!command || !hasCoherentSucceededAttemptShape(attempt)) return false;
  const successes = command.evidence.filter((evidence) => (
    evidence.application === RefundExecutionEvidenceApplication.APPLIED
    && evidence.outcome === RefundExecutionEvidenceOutcome.SUCCEEDED
  ));
  if (!hasCoherentCompletedCommand(command, successes.length)) return false;
  const evidence = successes[0];
  if (!evidence || !hasCoherentSucceededEvidence(evidence, command.id, attempt, currency)) return false;
  const key = buildRefundExecutionApplyOperationKey(evidence.id);
  const transitions = attempt.transitions.filter((transition) => transition.operationKey === key);
  const succeededTransitions = attempt.transitions.filter(
    (transition) => transition.toStatus === RefundAttemptStatus.SUCCEEDED,
  );
  const transition = transitions[0];
  return transition !== undefined
    && transitions.length === 1
    && succeededTransitions.length === 1
    && hasCoherentSucceededTransition(transition, attempt);
}

function hasCoherentSucceededAttemptShape(attempt: RecoveryAttempt): boolean {
  return [
    attempt.processedAt !== null,
    attempt.failedAt === null,
    attempt.lines.length > 0,
  ].every(Boolean);
}

function hasCoherentCompletedCommand(
  command: NonNullable<RecoveryAttempt["executionCommand"]>,
  succeededEvidenceCount: number,
): boolean {
  return [
    succeededEvidenceCount === 1,
    command.status === RefundExecutionCommandStatus.DONE,
    command.leaseOwner === null,
    command.leaseUntil === null,
    command.leaseTokenHash === null,
  ].every(Boolean);
}

function hasCoherentSucceededEvidence(
  evidence: NonNullable<RecoveryAttempt["executionCommand"]>["evidence"][number],
  commandId: string,
  attempt: RecoveryAttempt,
  currency: string,
): boolean {
  return [
    evidence.commandId === commandId,
    evidence.observedProviderRefundId === attempt.providerRefundId,
    evidence.reportedAmount === attempt.amount,
    evidence.reportedCurrency === currency,
  ].every(Boolean);
}

function hasCoherentSucceededTransition(
  transition: RecoveryAttempt["transitions"][number],
  attempt: RecoveryAttempt,
): boolean {
  const validOrderStatus = new Set<OrderStatus>([
    OrderStatus.PARTIALLY_REFUNDED,
    OrderStatus.REFUNDED,
  ]).has(transition.orderStatusAfter);
  return [
    transition.refundAttemptId === attempt.id,
    transition.fromStatus === RefundAttemptStatus.PROCESSING,
    transition.toStatus === RefundAttemptStatus.SUCCEEDED,
    transition.orderStatusBefore === OrderStatus.REFUND_PENDING,
    validOrderStatus,
    transition.actorType === RefundAttemptActorType.SYSTEM,
    transition.actorUserId === null,
    transition.reason === EXECUTION_SUCCEEDED_TRANSITION_REASON,
    attempt.processedAt !== null
      && transition.createdAt.getTime() === attempt.processedAt.getTime(),
  ].every(Boolean);
}

function hasCoherentRefundAmounts(aggregate: RecoveryAggregate): boolean {
  let succeededAmount = 0;
  for (const attempt of aggregate.refundAttempts) {
    if (!Number.isSafeInteger(attempt.amount) || attempt.amount <= 0) return false;
    if (attempt.status !== RefundAttemptStatus.SUCCEEDED) continue;
    succeededAmount += attempt.amount;
    if (!Number.isSafeInteger(succeededAmount) || succeededAmount > aggregate.payment.amount) return false;
  }
  return true;
}

function firstRecoveryEligibleAt(
  aggregate: RecoveryAggregate,
  successes: readonly RecoveryAttempt[],
): Date | null {
  const quantities = new Map<string, number>();
  const amounts = new Map<string, number>();
  for (const attempt of successes) {
    for (const line of attempt.lines) {
      const allocation = line.economicAllocation;
      if (!allocation) return null;
      quantities.set(line.orderItemId, (quantities.get(line.orderItemId) ?? 0) + line.quantity);
      amounts.set(
        line.orderItemId,
        (amounts.get(line.orderItemId) ?? 0) + allocation.merchandiseRefundAmount,
      );
    }
    if (discountedItemsFullyReversed(aggregate, quantities, amounts)) return attempt.processedAt;
  }
  return null;
}

function discountedItemsFullyReversed(
  aggregate: RecoveryAggregate,
  quantities: ReadonlyMap<string, number>,
  amounts: ReadonlyMap<string, number>,
): boolean {
  return aggregate.items.filter((item) => item.discountAmount > 0).every((item) => (
    quantities.get(item.id) === item.quantity
    && amounts.get(item.id) === item.unitAmount * item.quantity - item.discountAmount
  ));
}

type ExpiryResult = { kind: "valid"; value: Date | null } | { kind: "invalid" };

function hasCoherentRecoveryExpirySource(
  source: NonNullable<RecoveryAggregate["promotionGrant"]>,
): boolean {
  if (source.expiresAt === null) return true;
  if (source.recoveredFromGrantId === null) {
    const grace = source.policyVersion.recoveryGraceDays;
    return grace !== null && Number.isInteger(grace) && grace > 0;
  }
  return source.redeemedAt !== null
    && source.redeemedAt.getTime() < source.expiresAt.getTime();
}

function recoveryExpiry(
  source: NonNullable<RecoveryAggregate["promotionGrant"]>,
  issuanceAt: Date,
  recoveryEligibleAt: Date,
): ExpiryResult {
  if (source.redeemedAt === null) return { kind: "invalid" };
  if (source.expiresAt === null) return { kind: "valid", value: null };
  let expiryMs: number;
  if (source.recoveredFromGrantId === null) {
    const recoveryGraceDays = source.policyVersion.recoveryGraceDays;
    if (recoveryGraceDays === null || recoveryGraceDays <= 0) return { kind: "invalid" };
    expiryMs = Math.max(
      source.expiresAt.getTime(),
      recoveryEligibleAt.getTime() + recoveryGraceDays * DAY_MS,
    );
  } else {
    expiryMs = recoveryEligibleAt.getTime() + source.expiresAt.getTime() - source.redeemedAt.getTime();
  }
  if (!Number.isSafeInteger(expiryMs) || expiryMs <= issuanceAt.getTime()) return { kind: "invalid" };
  const expiresAt = new Date(expiryMs);
  return Number.isFinite(expiresAt.getTime())
    ? { kind: "valid", value: expiresAt }
    : { kind: "invalid" };
}

function hasCoherentRecoveryGrant(
  source: NonNullable<RecoveryAggregate["promotionGrant"]>,
  recovery: NonNullable<NonNullable<RecoveryAggregate["promotionGrant"]>["recoveryGrant"]>,
  recoveryEligibleAt: Date,
): boolean {
  const expiry = recoveryExpiry(source, recovery.issuedAt, recoveryEligibleAt);
  if (expiry.kind === "invalid") return false;
  return [
    recovery.recoveredFromGrantId === source.id,
    recovery.recoveryEligibleAt?.getTime() === recoveryEligibleAt.getTime(),
    recovery.issuedAt.getTime() >= recoveryEligibleAt.getTime(),
    recovery.grantKey === `recovery:${source.id}`,
    recovery.userId === source.userId,
    recovery.policyVersionId === source.policyVersionId,
    recovery.benefitYear === source.benefitYear,
    recovery.originMarketCode === source.originMarketCode,
    recovery.validFrom.getTime() === recoveryEligibleAt.getTime(),
    sameNullableDate(recovery.expiresAt, expiry.value),
  ].every(Boolean);
}

function isSucceededAttempt(attempt: RecoveryAttempt): boolean {
  return attempt.status === RefundAttemptStatus.SUCCEEDED;
}

function compareSucceededAttempts(left: RecoveryAttempt, right: RecoveryAttempt): number {
  const time = (left.processedAt?.getTime() ?? 0) - (right.processedAt?.getTime() ?? 0);
  if (time !== 0) return time;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

async function lockOrder(tx: RecoveryTx, orderId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
  `);
  return rows.length === 1;
}

async function lockPromotionGrant(tx: RecoveryTx, grantId: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "PromotionGrant" WHERE "id" = ${grantId} FOR UPDATE
  `);
}

async function captureOperationTime(tx: RecoveryTx): Promise<Date> {
  const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  const capturedAt = rows[0]?.capturedAt;
  if (rows.length !== 1 || !(capturedAt instanceof Date)) throw new Error("PROMOTION_RECOVERY_CLOCK_UNAVAILABLE");
  return capturedAt;
}

function snapshot(
  aggregate: RecoveryAggregate,
  classification: PromotionRecoveryClassification,
): PromotionRecoverySnapshot {
  return { orderId: aggregate.id, sourceGrantId: aggregate.promotionGrantId, classification };
}

function inconsistentSnapshot(
  aggregate: RecoveryAggregate,
  reason: PromotionRecoveryInconsistency,
): PromotionRecoverySnapshot {
  return snapshot(aggregate, { kind: "INCONSISTENT", reason });
}

function sameNullableDate(left: Date | null, right: Date | null): boolean {
  return left === null ? right === null : right !== null && left.getTime() === right.getTime();
}

function isUniqueConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2002";
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
