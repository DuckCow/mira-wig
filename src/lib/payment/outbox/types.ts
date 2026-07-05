import type { PaymentOutbox, Prisma } from "@prisma/client";

export const OUTBOX_BACKOFF_BASE_MS = 30_000;
export const OUTBOX_BACKOFF_CAP_MS = 15 * 60_000;
export const OUTBOX_MAX_ATTEMPTS = 5;
export const OUTBOX_ZOMBIE_AFTER_MS = 5 * 60_000;
export const OUTBOX_DEFAULT_LIMIT = 25;

// Conservative defaults: short enough for dev feedback, slow enough to avoid hot retry loops.
export interface EnqueueOutboxInput {
  topic: string;
  payload: Prisma.InputJsonValue;
  dedupKey?: string;
}

export interface OutboxHandlerContext {
  id: string;
  topic: string;
  dedupKey: string | null;
  attempt: number;
  now: Date;
}

export type OutboxHandler = (
  payload: Prisma.JsonValue,
  ctx: OutboxHandlerContext,
) => Promise<void>;

export type OutboxRegistry = Readonly<Record<string, OutboxHandler>>;

export type OutboxClient = Pick<Prisma.TransactionClient, "paymentOutbox">;

export type OutboxJob = Pick<
  PaymentOutbox,
  "id" | "topic" | "payload" | "attempts" | "dedupKey"
>;

export interface DispatchPendingInput {
  client: OutboxClient;
  registry: OutboxRegistry;
  limit?: number;
  now?: Date;
}

export interface DispatchPendingResult {
  zombiesRecovered: number;
  claimed: number;
  succeeded: number;
  retried: number;
  terminalFailed: number;
}
