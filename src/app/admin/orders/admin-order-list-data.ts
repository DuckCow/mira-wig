import "server-only";

import {
  type FulfillmentType,
  type MrStatus,
  type OrderStatus,
  type PaymentAttemptStatus,
  type PaymentMode,
  type PaymentProvider,
  Prisma,
} from "@prisma/client";

export const ADMIN_ORDER_LIST_PAGE_SIZE = 20;

const INTERNAL_ID_MAX_CODE_POINTS = 128;
const MAX_ENCODED_CURSOR_LENGTH = 512;
const POSTGRES_SAFE_MINIMUM_MS = Date.parse("-004711-01-01T00:00:00.000Z");

export interface AdminOrderListSourceItem {
  id: string;
  status: OrderStatus;
  cancellationAccepted?: boolean;
  paidAt: Date;
  createdAt: Date;
  marketCode: string;
  currency: string;
  totalAmount: number;
  customer: {
    name: string | null;
    email: string;
  };
  payment: {
    status: PaymentAttemptStatus;
    provider: PaymentProvider;
    mode: PaymentMode;
  };
  items: Array<{
    quantity: number;
    fulfillmentType: FulfillmentType;
    snapshotData: unknown;
    mr: null | { status: MrStatus };
  }>;
}

export interface AdminOrderListPage {
  items: readonly AdminOrderListSourceItem[];
  nextCursor: string | null;
}

export class AdminOrderListValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminOrderListValidationError";
  }
}

type CursorValue = Readonly<{ v: 1; createdAt: Date; id: string }>;

const ADMIN_ORDER_LIST_SELECT = {
  id: true,
  status: true,
  cancellation: { select: { id: true } },
  paidAt: true,
  createdAt: true,
  marketCode: true,
  currency: true,
  totalAmount: true,
  user: { select: { name: true, email: true } },
  payment: { select: { status: true, provider: true, mode: true } },
  items: {
    orderBy: { id: "asc" },
    select: {
      quantity: true,
      fulfillmentType: true,
      snapshotData: true,
      mr: { select: { status: true } },
    },
  },
} satisfies Prisma.OrderSelect;

type AdminOrderListRecord = Prisma.OrderGetPayload<{
  select: typeof ADMIN_ORDER_LIST_SELECT;
}>;

interface AdminOrderListQuery {
  where: Prisma.OrderWhereInput;
  select: typeof ADMIN_ORDER_LIST_SELECT;
  orderBy: Array<{ createdAt: "desc" } | { id: "desc" }>;
  take: number;
}

export interface AdminOrderListReadCapability {
  order: {
    findMany(query: AdminOrderListQuery): Promise<readonly AdminOrderListRecord[]>;
  };
}

export async function loadAdminOrderList(
  client: AdminOrderListReadCapability,
  input: Readonly<{ cursor?: unknown }> = {},
): Promise<AdminOrderListPage> {
  const cursor = normalizeCursor(input.cursor);
  const records = await client.order.findMany({
    where: buildWhere(cursor),
    select: ADMIN_ORDER_LIST_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ADMIN_ORDER_LIST_PAGE_SIZE + 1,
  });
  const hasNextPage = records.length > ADMIN_ORDER_LIST_PAGE_SIZE;
  const pageRecords = records.slice(0, ADMIN_ORDER_LIST_PAGE_SIZE);
  const finalRecord = pageRecords.at(-1);
  return {
    items: pageRecords.map(toSourceItem),
    nextCursor: hasNextPage && finalRecord ? encodeCursor(finalRecord) : null,
  };
}

function normalizeCursor(value: unknown): CursorValue | null {
  if (value === undefined) return null;
  if (
    typeof value !== "string"
    || !value
    || value.length > MAX_ENCODED_CURSOR_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw invalidCursor();
  }
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) throw new Error("Non-canonical base64url");
    const json = bytes.toString("utf8");
    if (!Buffer.from(json, "utf8").equals(bytes)) throw new Error("Invalid UTF-8");
    return parseCursor(JSON.parse(json));
  } catch (error) {
    if (error instanceof AdminOrderListValidationError) throw error;
    throw invalidCursor();
  }
}

function parseCursor(value: unknown): CursorValue {
  if (!isCursorShape(value)) throw invalidCursor();
  const createdAt = new Date(value.createdAt);
  const id = value.id;
  if (
    id.trim() !== id
    || !isCanonicalCursorDate(createdAt, value.createdAt)
    || !isBoundedInternalId(id)
  ) {
    throw invalidCursor();
  }
  return { v: 1, createdAt, id };
}

function isCursorShape(value: unknown): value is { v: 1; createdAt: string; id: string } {
  return isPlainObject(value)
    && hasExactKeys(value, ["v", "createdAt", "id"])
    && value.v === 1
    && typeof value.createdAt === "string"
    && typeof value.id === "string";
}

function buildWhere(cursor: CursorValue | null): Prisma.OrderWhereInput {
  if (!cursor) return {};
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

function toSourceItem(record: AdminOrderListRecord): AdminOrderListSourceItem {
  return {
    id: record.id,
    status: record.status,
    cancellationAccepted: record.cancellation !== null,
    paidAt: new Date(record.paidAt.getTime()),
    createdAt: new Date(record.createdAt.getTime()),
    marketCode: record.marketCode,
    currency: record.currency,
    totalAmount: record.totalAmount,
    customer: {
      name: record.user.name,
      email: record.user.email,
    },
    payment: {
      status: record.payment.status,
      provider: record.payment.provider,
      mode: record.payment.mode,
    },
    items: record.items.map((item) => ({
      quantity: item.quantity,
      fulfillmentType: item.fulfillmentType,
      snapshotData: item.snapshotData,
      mr: item.mr ? { status: item.mr.status } : null,
    })),
  };
}

function encodeCursor(record: Pick<AdminOrderListRecord, "id" | "createdAt">): string {
  return Buffer.from(JSON.stringify({
    v: 1,
    createdAt: record.createdAt.toISOString(),
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

function invalidCursor(): AdminOrderListValidationError {
  return new AdminOrderListValidationError("Admin order list cursor is invalid.");
}
