import "server-only";

import {
  CustomerRefundIntakeStatus,
  type CustomerRefundIntakeReasonCode,
  type OrderStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

export const ADMIN_CUSTOMER_REFUND_INTAKE_DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const INTERNAL_ID_MAX_CODE_POINTS = 128;
const MAX_ENCODED_CURSOR_LENGTH = 512;
const POSTGRES_SAFE_MINIMUM_MS = Date.parse("-004711-01-01T00:00:00.000Z");

export type AdminCustomerRefundIntakeQueueInput = Readonly<{
  cursor?: unknown;
  pageSize?: unknown;
}>;

export type AdminCustomerRefundIntakeQueuePage = Readonly<{
  items: readonly Readonly<{
    intakeId: string;
    orderId: string;
    reasonCode: CustomerRefundIntakeReasonCode;
    submittedAt: Date;
    orderStatus: OrderStatus;
    totalAmount: number;
    currency: string;
    ownershipConsistent: boolean;
  }>[];
  nextCursor: string | null;
}>;

export type AdminCustomerRefundIntakeQueueValidationCode =
  | "INVALID_PAGE_SIZE"
  | "INVALID_CURSOR";

export class AdminCustomerRefundIntakeQueueValidationError extends Error {
  constructor(readonly code: AdminCustomerRefundIntakeQueueValidationCode, message: string) {
    super(message);
    this.name = "AdminCustomerRefundIntakeQueueValidationError";
  }
}

type CursorValue = Readonly<{ v: 1; submittedAt: Date; id: string }>;
type NormalizedInput = Readonly<{ cursor: CursorValue | null; pageSize: number }>;
type QueueClient = Pick<PrismaClient, "customerRefundIntake">;

const QUEUE_SELECT = {
  id: true,
  orderId: true,
  customerUserId: true,
  reasonCode: true,
  submittedAt: true,
  order: {
    select: {
      status: true,
      totalAmount: true,
      currency: true,
      userId: true,
    },
  },
} satisfies Prisma.CustomerRefundIntakeSelect;

type QueueRecord = Prisma.CustomerRefundIntakeGetPayload<{ select: typeof QUEUE_SELECT }>;

export async function loadAdminCustomerRefundIntakeQueue(
  client: QueueClient,
  input: AdminCustomerRefundIntakeQueueInput = {},
): Promise<AdminCustomerRefundIntakeQueuePage> {
  const normalized = normalizeInput(input);
  const records = await client.customerRefundIntake.findMany({
    where: buildWhere(normalized.cursor),
    select: QUEUE_SELECT,
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
    take: normalized.pageSize + 1,
  });
  const hasNextPage = records.length > normalized.pageSize;
  const pageRecords = records.slice(0, normalized.pageSize);
  const finalRecord = pageRecords.at(-1);
  return Object.freeze({
    items: Object.freeze(pageRecords.map(toQueueItem)),
    nextCursor: hasNextPage && finalRecord ? encodeCursor(finalRecord) : null,
  });
}

function normalizeInput(input: AdminCustomerRefundIntakeQueueInput): NormalizedInput {
  return {
    cursor: normalizeCursor(input.cursor),
    pageSize: normalizePageSize(input.pageSize),
  };
}

function normalizePageSize(value: unknown): number {
  if (value === undefined) return ADMIN_CUSTOMER_REFUND_INTAKE_DEFAULT_PAGE_SIZE;
  const normalized = typeof value === "string" && /^[1-9][0-9]*$/.test(value)
    ? Number(value)
    : value;
  if (
    typeof normalized !== "number"
    || !Number.isSafeInteger(normalized)
    || normalized < 1
    || normalized > MAX_PAGE_SIZE
  ) {
    throw validationError("INVALID_PAGE_SIZE", "Customer refund intake queue page size is invalid.");
  }
  return normalized;
}

function normalizeCursor(value: unknown): CursorValue | null {
  if (value === undefined) return null;
  if (
    typeof value !== "string"
    || !value
    || value.length > MAX_ENCODED_CURSOR_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw validationError("INVALID_CURSOR", "Customer refund intake queue cursor is invalid.");
  }
  try {
    const bytes = Buffer.from(value, "base64url");
    const json = bytes.toString("utf8");
    if (!Buffer.from(json, "utf8").equals(bytes)) throw new Error("Invalid UTF-8");
    return parseCursor(JSON.parse(json));
  } catch {
    throw validationError("INVALID_CURSOR", "Customer refund intake queue cursor is invalid.");
  }
}

function parseCursor(value: unknown): CursorValue {
  if (!isCursorShape(value)) {
    throw validationError("INVALID_CURSOR", "Customer refund intake queue cursor is invalid.");
  }
  const submittedAt = new Date(value.submittedAt);
  const id = value.id.trim();
  if (!isCanonicalCursorDate(submittedAt, value.submittedAt) || !isBoundedInternalId(id)) {
    throw validationError("INVALID_CURSOR", "Customer refund intake queue cursor is invalid.");
  }
  return Object.freeze({ v: 1, submittedAt, id });
}

function isCursorShape(value: unknown): value is { v: 1; submittedAt: string; id: string } {
  return isPlainObject(value)
    && hasExactKeys(value, ["v", "submittedAt", "id"])
    && value.v === 1
    && typeof value.submittedAt === "string"
    && typeof value.id === "string";
}

function buildWhere(cursor: CursorValue | null): Prisma.CustomerRefundIntakeWhereInput {
  return {
    status: CustomerRefundIntakeStatus.SUBMITTED,
    ...(cursor ? {
      OR: [
        { submittedAt: { gt: cursor.submittedAt } },
        { submittedAt: cursor.submittedAt, id: { gt: cursor.id } },
      ],
    } : {}),
  };
}

function toQueueItem(record: QueueRecord): AdminCustomerRefundIntakeQueuePage["items"][number] {
  return Object.freeze({
    intakeId: record.id,
    orderId: record.orderId,
    reasonCode: record.reasonCode,
    submittedAt: new Date(record.submittedAt.getTime()),
    orderStatus: record.order.status,
    totalAmount: record.order.totalAmount,
    currency: record.order.currency,
    ownershipConsistent: record.customerUserId === record.order.userId,
  });
}

function encodeCursor(record: Pick<QueueRecord, "id" | "submittedAt">): string {
  return Buffer.from(JSON.stringify({
    v: 1,
    submittedAt: record.submittedAt.toISOString(),
    id: record.id,
  })).toString("base64url");
}

function isCanonicalCursorDate(date: Date, source: string): boolean {
  return Number.isFinite(date.getTime())
    && date.getTime() >= POSTGRES_SAFE_MINIMUM_MS
    && date.toISOString() === source;
}

function isBoundedInternalId(value: string): boolean {
  return Boolean(value) && Array.from(value).length <= INTERNAL_ID_MAX_CODE_POINTS;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length
    && actual.every((key) => typeof key === "string" && keys.includes(key));
}

function validationError(
  code: AdminCustomerRefundIntakeQueueValidationCode,
  message: string,
): AdminCustomerRefundIntakeQueueValidationError {
  return new AdminCustomerRefundIntakeQueueValidationError(code, message);
}
