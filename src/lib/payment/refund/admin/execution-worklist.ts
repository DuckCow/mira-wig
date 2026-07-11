import "server-only";

import {
  RefundExecutionCommandStatus,
  type OrderStatus,
  type PaymentMode,
  type PaymentProvider,
  type Prisma,
  type RefundAttemptStatus,
} from "@prisma/client";
import { db } from "@/lib/db";

export const REFUND_EXECUTION_WORKLIST_DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const INTERNAL_ID_MAX_CODE_POINTS = 128;
const MAX_ENCODED_CURSOR_LENGTH = 512;
const POSTGRES_SAFE_MINIMUM_MS = Date.parse("-004711-01-01T00:00:00.000Z");
const COMMAND_STATUSES = Object.values(RefundExecutionCommandStatus);
const LEASE_STATES = ["all", "active", "deadline-passed"] as const;

export type RefundExecutionLeaseState = (typeof LEASE_STATES)[number];

export type RefundExecutionWorklistInput = Readonly<{
  status?: unknown;
  leaseState?: unknown;
  orderId?: unknown;
  cursor?: unknown;
  pageSize?: unknown;
  readTime: unknown;
}>;

export type RefundExecutionWorklistRow = Readonly<{
  rowKey: string;
  orderId: string;
  refundAmount: number;
  currency: string;
  commandStatus: RefundExecutionCommandStatus;
  attemptStatus: RefundAttemptStatus;
  orderStatus: OrderStatus;
  provider: PaymentProvider;
  mode: PaymentMode;
  dispatchAttempt: number;
  availableAt: Date;
  leaseUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
  leaseDeadlinePassed: boolean;
  operationalDiagnosticCode: string | null;
  operationalDiagnosticMessage: string | null;
}>;

export type RefundExecutionWorklistFilters = Readonly<{
  status: RefundExecutionCommandStatus | null;
  leaseState: RefundExecutionLeaseState;
  orderId: string | null;
  pageSize: number;
}>;

export type RefundExecutionWorklistResult = Readonly<{
  rows: readonly RefundExecutionWorklistRow[];
  nextCursor: string | null;
  filters: RefundExecutionWorklistFilters;
}>;

export type RefundExecutionWorklistValidationCode =
  | "INVALID_STATUS"
  | "INVALID_LEASE_STATE"
  | "INCOMPATIBLE_FILTERS"
  | "INVALID_ORDER_ID"
  | "INVALID_PAGE_SIZE"
  | "INVALID_CURSOR"
  | "INVALID_READ_TIME";

export class RefundExecutionWorklistValidationError extends Error {
  constructor(readonly code: RefundExecutionWorklistValidationCode, message: string) {
    super(message);
    this.name = "RefundExecutionWorklistValidationError";
  }
}

type CursorValue = Readonly<{ v: 1; createdAt: Date; id: string }>;
type NormalizedInput = RefundExecutionWorklistFilters & Readonly<{
  cursor: CursorValue | null;
  readTime: Date;
}>;

const WORKLIST_SELECT = {
  id: true,
  status: true,
  availableAt: true,
  leaseUntil: true,
  dispatchAttempt: true,
  lastSafeErrorCode: true,
  lastSafeErrorMessage: true,
  createdAt: true,
  updatedAt: true,
  refundAttempt: {
    select: {
      amount: true,
      currency: true,
      status: true,
      provider: true,
      mode: true,
      order: { select: { id: true, status: true } },
    },
  },
} satisfies Prisma.RefundExecutionCommandSelect;

type WorklistRecord = Prisma.RefundExecutionCommandGetPayload<{ select: typeof WORKLIST_SELECT }>;

export async function loadRefundExecutionWorklist(
  input: RefundExecutionWorklistInput,
): Promise<RefundExecutionWorklistResult> {
  const normalized = normalizeInput(input);
  const records = await db.refundExecutionCommand.findMany({
    where: buildWhere(normalized),
    select: WORKLIST_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: normalized.pageSize + 1,
  });
  const hasNextPage = records.length > normalized.pageSize;
  const pageRecords = records.slice(0, normalized.pageSize);
  const rows = pageRecords.map((record) => toSafeRow(record, normalized.readTime));
  const finalRecord = pageRecords.at(-1);
  return Object.freeze({
    rows: Object.freeze(rows),
    nextCursor: hasNextPage && finalRecord ? encodeCursor(finalRecord) : null,
    filters: Object.freeze({
      status: normalized.status,
      leaseState: normalized.leaseState,
      orderId: normalized.orderId,
      pageSize: normalized.pageSize,
    }),
  });
}

function normalizeInput(input: RefundExecutionWorklistInput): NormalizedInput {
  const status = normalizeStatus(input.status);
  const leaseState = normalizeLeaseState(input.leaseState);
  if (leaseState !== "all" && status !== null && status !== RefundExecutionCommandStatus.LEASED) {
    throw validationError("INCOMPATIBLE_FILTERS", "Lease filters require the LEASED command status.");
  }
  return {
    status,
    leaseState,
    orderId: normalizeOrderId(input.orderId),
    pageSize: normalizePageSize(input.pageSize),
    cursor: normalizeCursor(input.cursor),
    readTime: normalizeReadTime(input.readTime),
  };
}

function normalizeStatus(value: unknown): RefundExecutionCommandStatus | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || !isCommandStatus(value)) {
    throw validationError("INVALID_STATUS", "Refund execution command status is invalid.");
  }
  return value;
}

function normalizeLeaseState(value: unknown): RefundExecutionLeaseState {
  if (value === undefined) return "all";
  if (typeof value !== "string" || !isLeaseState(value)) {
    throw validationError("INVALID_LEASE_STATE", "Refund execution lease filter is invalid.");
  }
  return value;
}

function normalizeOrderId(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string") throw validationError("INVALID_ORDER_ID", "Order id is invalid.");
  const normalized = value.trim();
  if (!normalized || Array.from(normalized).length > INTERNAL_ID_MAX_CODE_POINTS) {
    throw validationError("INVALID_ORDER_ID", "Order id is invalid.");
  }
  return normalized;
}

function normalizePageSize(value: unknown): number {
  if (value === undefined) return REFUND_EXECUTION_WORKLIST_DEFAULT_PAGE_SIZE;
  const normalized = typeof value === "string" && /^[1-9][0-9]*$/.test(value)
    ? Number(value)
    : value;
  if (!Number.isSafeInteger(normalized) || typeof normalized !== "number" || normalized < 1 || normalized > MAX_PAGE_SIZE) {
    throw validationError("INVALID_PAGE_SIZE", "Refund execution page size is invalid.");
  }
  return normalized;
}

function normalizeReadTime(value: unknown): Date {
  if (!(value instanceof Date) || !isPostgresSafeDate(value)) {
    throw validationError("INVALID_READ_TIME", "Refund execution read time is invalid.");
  }
  return new Date(value.getTime());
}

function normalizeCursor(value: unknown): CursorValue | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || !value || value.length > MAX_ENCODED_CURSOR_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw validationError("INVALID_CURSOR", "Refund execution cursor is invalid.");
  }
  try {
    const bytes = Buffer.from(value, "base64url");
    const json = bytes.toString("utf8");
    if (!Buffer.from(json, "utf8").equals(bytes)) throw new Error("Invalid UTF-8");
    return parseCursor(JSON.parse(json));
  } catch {
    throw validationError("INVALID_CURSOR", "Refund execution cursor is invalid.");
  }
}

function parseCursor(value: unknown): CursorValue {
  if (!isCursorShape(value)) {
    throw validationError("INVALID_CURSOR", "Refund execution cursor is invalid.");
  }
  const createdAt = new Date(value.createdAt);
  const id = value.id.trim();
  if (!isCanonicalCursorDate(createdAt, value.createdAt) || !isBoundedInternalId(id)) {
    throw validationError("INVALID_CURSOR", "Refund execution cursor is invalid.");
  }
  return Object.freeze({ v: 1, createdAt, id });
}

function isCursorShape(
  value: unknown,
): value is { v: 1; createdAt: string; id: string } {
  return isPlainObject(value)
    && hasExactKeys(value, ["v", "createdAt", "id"])
    && value.v === 1
    && typeof value.createdAt === "string"
    && typeof value.id === "string";
}

function isCanonicalCursorDate(date: Date, source: string): boolean {
  return isPostgresSafeDate(date) && date.toISOString() === source;
}

function isBoundedInternalId(value: string): boolean {
  return Boolean(value) && Array.from(value).length <= INTERNAL_ID_MAX_CODE_POINTS;
}

function buildWhere(input: NormalizedInput): Prisma.RefundExecutionCommandWhereInput {
  const conditions: Prisma.RefundExecutionCommandWhereInput[] = [];
  if (input.status) conditions.push({ status: input.status });
  else if (input.leaseState !== "all") conditions.push({ status: RefundExecutionCommandStatus.LEASED });
  else if (!input.orderId) conditions.push({ status: { not: RefundExecutionCommandStatus.DONE } });
  if (input.leaseState === "active") conditions.push({ leaseUntil: { gt: input.readTime } });
  if (input.leaseState === "deadline-passed") conditions.push({ leaseUntil: { lte: input.readTime } });
  if (input.orderId) conditions.push({ refundAttempt: { orderId: input.orderId } });
  if (input.cursor) {
    conditions.push({ OR: [
      { createdAt: { lt: input.cursor.createdAt } },
      { createdAt: input.cursor.createdAt, id: { lt: input.cursor.id } },
    ] });
  }
  return { AND: conditions };
}

function toSafeRow(record: WorklistRecord, readTime: Date): RefundExecutionWorklistRow {
  const attempt = record.refundAttempt;
  return Object.freeze({
    rowKey: record.id,
    orderId: attempt.order.id,
    refundAmount: attempt.amount,
    currency: attempt.currency,
    commandStatus: record.status,
    attemptStatus: attempt.status,
    orderStatus: attempt.order.status,
    provider: attempt.provider,
    mode: attempt.mode,
    dispatchAttempt: record.dispatchAttempt,
    availableAt: new Date(record.availableAt.getTime()),
    leaseUntil: record.leaseUntil ? new Date(record.leaseUntil.getTime()) : null,
    createdAt: new Date(record.createdAt.getTime()),
    updatedAt: new Date(record.updatedAt.getTime()),
    leaseDeadlinePassed: record.status === RefundExecutionCommandStatus.LEASED
      && record.leaseUntil !== null
      && record.leaseUntil.getTime() <= readTime.getTime(),
    operationalDiagnosticCode: record.lastSafeErrorCode,
    operationalDiagnosticMessage: record.lastSafeErrorMessage,
  });
}

function encodeCursor(record: Pick<WorklistRecord, "id" | "createdAt">): string {
  return Buffer.from(JSON.stringify({ v: 1, createdAt: record.createdAt.toISOString(), id: record.id }))
    .toString("base64url");
}

function isCommandStatus(value: string): value is RefundExecutionCommandStatus {
  return COMMAND_STATUSES.some((status) => status === value);
}

function isLeaseState(value: string): value is RefundExecutionLeaseState {
  return LEASE_STATES.some((state) => state === value);
}

function isPostgresSafeDate(value: Date): boolean {
  return Number.isFinite(value.getTime()) && value.getTime() >= POSTGRES_SAFE_MINIMUM_MS;
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
  code: RefundExecutionWorklistValidationCode,
  message: string,
): RefundExecutionWorklistValidationError {
  return new RefundExecutionWorklistValidationError(code, message);
}
