import {
  CustomerRefundIntakeStatus,
  FulfillmentType,
  MrStatus,
  OrderStatus,
  PaymentAttemptStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { isTerminalRefundAttemptStatus } from "@/lib/payment/refund/invariants";
import {
  normalizeProductionStartInput,
  type AuthenticatedStartMtoProductionInput,
  type ProductionStartResult,
} from "./contracts";

type ProductionStartTx = Prisma.TransactionClient;
type ProductionAggregate = NonNullable<Awaited<ReturnType<typeof loadProductionAggregate>>>;
type ProductionTarget = ProductionAggregate["items"][number] & {
  mr: NonNullable<ProductionAggregate["items"][number]["mr"]>;
};
type LockedProductionTarget =
  | { ok: true; aggregate: ProductionAggregate; target: ProductionTarget }
  | { ok: false; result: ProductionStartResult };

export async function startMtoProduction(
  client: PrismaClient,
  rawInput: AuthenticatedStartMtoProductionInput,
): Promise<ProductionStartResult> {
  const input = normalizeProductionStartInput(rawInput);
  if (!input) return failure("INVALID_INPUT", "Production-start input is invalid.");
  try {
    return await client.$transaction((tx) => startInTransaction(tx, input));
  } catch (error) {
    if (isUniqueConflict(error)) return classifyUniqueConflict(client, input);
    throw error;
  }
}

async function startInTransaction(
  tx: ProductionStartTx,
  input: AuthenticatedStartMtoProductionInput,
): Promise<ProductionStartResult> {
  const locked = await loadLockedProductionTarget(tx, input);
  if (!locked.ok) return locked.result;
  const { aggregate, target } = locked;

  if (aggregate.cancellation) {
    return failure("ORDER_CANCELLED", "Cancelled Orders cannot start production.");
  }
  const replay = resolveStartReplay(target.mr, aggregate.id, input);
  if (replay) return replay;
  const eligibilityFailure = validateStartEligibility(aggregate);
  if (eligibilityFailure) return eligibilityFailure;

  const reusedKey = await tx.manufacturingRequest.findUnique({
    where: { productionStartRequestKey: input.requestKey },
    select: { id: true },
  });
  if (reusedKey) return failure("REQUEST_KEY_CONFLICT", "Production-start request identity is unavailable.");
  if (!isCoherentPreProductionMr(target.mr)) {
    return failure("MANUFACTURING_STATE_CONFLICT", "Manufacturing request is not coherently pre-production.");
  }

  const startedAt = await captureOperationTime(tx);
  const update = await tx.manufacturingRequest.updateMany({
    where: {
      id: target.mr.id,
      orderItemId: target.id,
      status: MrStatus.RECEIVED,
      startedAt: null,
      productionStartRequestKey: null,
      startedByUserId: null,
    },
    data: {
      status: MrStatus.IN_PRODUCTION,
      startedAt,
      productionStartRequestKey: input.requestKey,
      startedByUserId: input.startedByUserId,
    },
  });
  if (update.count !== 1) {
    return failure("MANUFACTURING_STATE_CONFLICT", "Manufacturing state changed before production start.");
  }
  return {
    ok: true,
    replayed: false,
    orderId: aggregate.id,
    orderItemId: target.id,
    manufacturingRequestId: target.mr.id,
    startedAt,
  };
}

async function loadLockedProductionTarget(
  tx: ProductionStartTx,
  input: AuthenticatedStartMtoProductionInput,
): Promise<LockedProductionTarget> {
  if (!(await lockOrder(tx, input.orderId))) {
    return lockedFailure("ORDER_NOT_FOUND", "Order was not found.");
  }
  const aggregate = await loadProductionAggregate(tx, input.orderId);
  if (!aggregate) return lockedFailure("ORDER_NOT_FOUND", "Order was not found.");
  const advisory = resolveAdvisoryTarget(aggregate, input.orderItemId);
  if (!advisory.ok) return advisory;
  if (!(await lockManufacturingRequest(tx, advisory.target.mr.id, input.orderItemId))) {
    return lockedFailure("MANUFACTURING_REQUEST_MISSING", "MTO item has no manufacturing request.");
  }
  const freshAggregate = await loadProductionAggregate(tx, input.orderId);
  const target = freshAggregate ? findFreshMtoTarget(freshAggregate, input.orderItemId) : null;
  if (!freshAggregate || !target) {
    return lockedFailure(
      "MANUFACTURING_STATE_CONFLICT",
      "Manufacturing identity changed before production start.",
    );
  }
  return { ok: true, aggregate: freshAggregate, target };
}

function resolveAdvisoryTarget(
  aggregate: ProductionAggregate,
  orderItemId: string,
): { ok: true; target: ProductionTarget } | LockedProductionTarget {
  const target = aggregate.items.find((item) => item.id === orderItemId);
  if (!target) return lockedFailure("ITEM_NOT_FOUND", "Order item was not found for the Order.");
  if (target.fulfillmentType !== FulfillmentType.MTO) {
    return lockedFailure("NOT_MTO", "Only MTO items can start production.");
  }
  if (!target.mr) {
    return lockedFailure("MANUFACTURING_REQUEST_MISSING", "MTO item has no manufacturing request.");
  }
  return { ok: true, target: { ...target, mr: target.mr } };
}

function findFreshMtoTarget(
  aggregate: ProductionAggregate,
  orderItemId: string,
): ProductionTarget | null {
  const target = aggregate.items.find((item) => item.id === orderItemId);
  if (!target || target.fulfillmentType !== FulfillmentType.MTO || !target.mr) return null;
  return { ...target, mr: target.mr };
}

function lockedFailure(
  code: Exclude<ProductionStartResult, { ok: true }>["code"],
  message: string,
): LockedProductionTarget {
  return { ok: false, result: failure(code, message) };
}

function isCoherentPreProductionMr(mr: ProductionTarget["mr"]): boolean {
  return [
    mr.status === MrStatus.RECEIVED,
    mr.startedAt === null,
    mr.productionStartRequestKey === null,
    mr.startedByUserId === null,
  ].every(Boolean);
}

async function lockOrder(tx: ProductionStartTx, orderId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
  `);
  return rows.length === 1;
}

async function lockManufacturingRequest(
  tx: ProductionStartTx,
  manufacturingRequestId: string,
  orderItemId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "ManufacturingRequest"
    WHERE "id" = ${manufacturingRequestId} AND "orderItemId" = ${orderItemId}
    FOR UPDATE
  `);
  return rows.length === 1;
}

function loadProductionAggregate(reader: Pick<PrismaClient, "order">, orderId: string) {
  return reader.order.findUnique({
    where: { id: orderId },
    include: {
      payment: true,
      cancellation: true,
      items: { orderBy: { id: "asc" }, include: { mr: true } },
      refundAttempts: {
        orderBy: { createdAt: "asc" },
        include: { lines: true, transitions: true },
      },
      customerRefundIntakes: { orderBy: { submittedAt: "asc" } },
    },
  });
}

function validateStartEligibility(aggregate: ProductionAggregate): ProductionStartResult | null {
  if (
    aggregate.status !== OrderStatus.PAID
    || aggregate.payment.status !== PaymentAttemptStatus.SUCCEEDED
    || aggregate.paymentId !== aggregate.payment.id
    || aggregate.totalAmount !== aggregate.payment.amount
    || aggregate.currency !== aggregate.payment.currency
  ) {
    return failure("ORDER_NOT_ELIGIBLE", "Order is not eligible to start production.");
  }
  if (aggregate.disputeStatus !== null) {
    return failure("DISPUTE_REVIEW_REQUIRED", "Order dispute state blocks production start.");
  }
  if (aggregate.refundAttempts.some((attempt) => !isTerminalRefundAttemptStatus(attempt.status))) {
    return failure("REFUND_IN_PROGRESS", "An open refund blocks production start.");
  }
  if (aggregate.customerRefundIntakes.some((intake) => intake.status === CustomerRefundIntakeStatus.SUBMITTED)) {
    return failure("INTAKE_CONFLICT", "A submitted customer refund intake blocks production start.");
  }
  return null;
}

function resolveStartReplay(
  mr: ProductionAggregate["items"][number]["mr"] extends infer T ? NonNullable<T> : never,
  orderId: string,
  input: AuthenticatedStartMtoProductionInput,
): ProductionStartResult | null {
  const hasAnyAudit = [mr.startedAt, mr.productionStartRequestKey, mr.startedByUserId]
    .some((value) => value !== null);
  if (!hasAnyAudit && mr.status === MrStatus.RECEIVED) return null;
  if (isExactStartedReplay(mr, input)) {
    return {
      ok: true,
      replayed: true,
      orderId,
      orderItemId: input.orderItemId,
      manufacturingRequestId: mr.id,
      startedAt: mr.startedAt,
    };
  }
  if (isCoherentStartedMr(mr)) {
    return failure("ALREADY_STARTED", "Manufacturing has already started.");
  }
  return failure("MANUFACTURING_STATE_CONFLICT", "Manufacturing start evidence is inconsistent or terminal.");
}

function isExactStartedReplay(
  mr: ProductionTarget["mr"],
  input: AuthenticatedStartMtoProductionInput,
): mr is ProductionTarget["mr"] & { startedAt: Date } {
  return [
    mr.status === MrStatus.IN_PRODUCTION,
    mr.startedAt instanceof Date,
    mr.productionStartRequestKey === input.requestKey,
    mr.startedByUserId === input.startedByUserId,
  ].every(Boolean);
}

function isCoherentStartedMr(mr: ProductionTarget["mr"]): boolean {
  return [
    mr.status === MrStatus.IN_PRODUCTION || mr.status === MrStatus.COMPLETED,
    mr.startedAt instanceof Date,
    Boolean(mr.productionStartRequestKey),
    Boolean(mr.startedByUserId),
  ].every(Boolean);
}

async function captureOperationTime(tx: ProductionStartTx): Promise<Date> {
  const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  const capturedAt = rows[0]?.capturedAt;
  if (rows.length !== 1 || !(capturedAt instanceof Date)) {
    throw new Error("Unable to capture authoritative production-start time.");
  }
  return capturedAt;
}

async function classifyUniqueConflict(
  client: PrismaClient,
  input: AuthenticatedStartMtoProductionInput,
): Promise<ProductionStartResult> {
  const aggregate = await loadProductionAggregate(client, input.orderId);
  const target = aggregate?.items.find((item) => item.id === input.orderItemId);
  if (aggregate && target?.mr) {
    const replay = resolveStartReplay(target.mr, aggregate.id, input);
    if (replay?.ok) return replay;
  }
  return failure("REQUEST_KEY_CONFLICT", "Production-start request identity is unavailable.");
}

function isUniqueConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2002";
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function failure(
  code: Exclude<ProductionStartResult, { ok: true }>["code"],
  message: string,
): ProductionStartResult {
  return { ok: false, code, message };
}
