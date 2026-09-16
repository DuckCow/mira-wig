import { OutboxStatus, type Prisma } from "@prisma/client";
import {
  OUTBOX_BACKOFF_BASE_MS,
  OUTBOX_BACKOFF_CAP_MS,
  type OutboxHandler,
} from "@/lib/payment/outbox";
import { createTransactionalEmailHandlers } from "./handlers";
import type { TransactionalEmailPort } from "./port";
import type {
  EmailProjectionResult,
  RefundSucceededEmailProjection,
  TransactionalEmailProjectionSource,
} from "./projection";
import { isValidEmailAddress } from "./providers/ses/config";
import {
  CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1,
  parseRefundSucceededEmailPayload,
  refundSucceededEmailDedupKey,
} from "./topics";

export const PL09_REFUND_ATTEMPT_ID =
  "eximbay-canary-7f9188b209f5f8504df28fe300e53aba980859e8" as const;
export const PL09_RECIPIENT_MODE = "SANDBOX_PRELAUNCH" as const;

const PL09_PAYLOAD = Object.freeze({ refundAttemptId: PL09_REFUND_ATTEMPT_ID });
const PL09_DEDUP_KEY = refundSucceededEmailDedupKey(PL09_REFUND_ATTEMPT_ID);

export interface Pl09RecipientEnvironment {
  TRANSACTIONAL_EMAIL_RECIPIENT_MODE?: string;
  TRANSACTIONAL_EMAIL_SANDBOX_RECIPIENT?: string;
}

export interface Pl09OutboxIntent {
  id: string;
  topic: string;
  payload: Prisma.JsonValue;
  status: OutboxStatus;
  attempts: number;
  dedupKey: string | null;
}

export interface Pl09OutboxStore {
  findTargetCandidates(): Promise<readonly Pl09OutboxIntent[]>;
  claimPending(id: string): Promise<boolean>;
  markDone(id: string, now: Date): Promise<void>;
  markTerminalFailed(id: string, attempts: number, reason: string): Promise<void>;
  markRetry(id: string, attempts: number, nextAttemptAt: Date, reason: string): Promise<void>;
}

export type Pl09DispatchResult = Readonly<{
  outcome: "sent" | "already_delivered" | "not_claimed" | "terminal_failed";
  intentCount: 1;
  topicMatches: true;
  dedupMatches: true;
  attemptCount: number;
  terminalMarker: boolean;
  sentMarker: boolean;
}>;

export interface RunPl09TargetedRefundDispatchInput {
  store: Pl09OutboxStore;
  source: TransactionalEmailProjectionSource;
  environment: Pl09RecipientEnvironment;
  publicOrigin: string;
  createPort: () => TransactionalEmailPort;
  now?: Date;
}

type PrismaOutboxClient = Pick<Prisma.TransactionClient, "paymentOutbox">;

export function createPrismaPl09OutboxStore(client: PrismaOutboxClient): Pl09OutboxStore {
  const store: Pl09OutboxStore = {
    findTargetCandidates: () => client.paymentOutbox.findMany({
      where: {
        OR: [
          { dedupKey: PL09_DEDUP_KEY },
          { payload: { equals: PL09_PAYLOAD } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 2,
      select: {
        id: true,
        topic: true,
        payload: true,
        status: true,
        attempts: true,
        dedupKey: true,
      },
    }),
    claimPending: async (id: string) => {
      const claimed = await client.paymentOutbox.updateMany({
        where: { id, status: OutboxStatus.PENDING },
        data: { status: OutboxStatus.PROCESSING },
      });
      return claimed.count === 1;
    },
    markDone: (id: string, now: Date) => client.paymentOutbox.update({
      where: { id },
      data: {
        status: OutboxStatus.DONE,
        processedAt: now,
        nextAttemptAt: null,
        lastError: null,
      },
    }).then(() => undefined),
    markTerminalFailed: (id: string, attempts: number, reason: string) =>
      client.paymentOutbox.update({
        where: { id },
        data: {
          status: OutboxStatus.FAILED,
          attempts,
          nextAttemptAt: null,
          lastError: reason,
        },
      }).then(() => undefined),
    markRetry: (id: string, attempts: number, nextAttemptAt: Date, reason: string) =>
      client.paymentOutbox.update({
        where: { id },
        data: {
          status: OutboxStatus.PENDING,
          attempts,
          nextAttemptAt,
          lastError: reason,
        },
      }).then(() => undefined),
  };
  return Object.freeze(store);
}

export function requirePl09SandboxRecipient(environment: Pl09RecipientEnvironment): string {
  if (environment.TRANSACTIONAL_EMAIL_RECIPIENT_MODE !== PL09_RECIPIENT_MODE) {
    throw new Error("PL09_SANDBOX_RECIPIENT_MODE_REQUIRED");
  }
  const recipient = environment.TRANSACTIONAL_EMAIL_SANDBOX_RECIPIENT;
  if (recipient === undefined || recipient !== recipient.trim() || !isValidEmailAddress(recipient)) {
    throw new Error("PL09_SANDBOX_RECIPIENT_INVALID");
  }
  return recipient;
}

export async function runPl09TargetedRefundDispatchOnce(
  input: RunPl09TargetedRefundDispatchInput,
): Promise<Pl09DispatchResult> {
  const sandboxRecipient = requirePl09SandboxRecipient(input.environment);
  const candidates = await input.store.findTargetCandidates();
  if (candidates.length !== 1) throw new Error("PL09_EXACTLY_ONE_EXISTING_INTENT_REQUIRED");
  const intent = candidates[0];
  requireExactIntent(intent);
  if (intent.status === OutboxStatus.DONE) return result("already_delivered", intent.attempts);
  if (intent.status !== OutboxStatus.PENDING) throw new Error("PL09_INTENT_NOT_DISPATCHABLE");

  const port = input.createPort();
  const handler = refundHandler(input.source, port, input.publicOrigin, sandboxRecipient);
  const claimed = await input.store.claimPending(intent.id);
  if (!claimed) return result("not_claimed", intent.attempts);
  return invokeOnce(input.store, intent, handler, input.now ?? new Date());
}

function requireExactIntent(intent: Pl09OutboxIntent): void {
  const payload = parseRefundSucceededEmailPayload(intent.payload);
  if (intent.topic !== CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1
    || intent.dedupKey !== PL09_DEDUP_KEY
    || payload?.refundAttemptId !== PL09_REFUND_ATTEMPT_ID) {
    throw new Error("PL09_INTENT_CONTRACT_MISMATCH");
  }
}

function refundHandler(
  source: TransactionalEmailProjectionSource,
  port: TransactionalEmailPort,
  publicOrigin: string,
  sandboxRecipient: string,
): OutboxHandler {
  const handlers = createTransactionalEmailHandlers({
    source: sandboxProjectionSource(source, sandboxRecipient),
    port,
    publicOrigin,
  });
  return handlers[CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1];
}

function sandboxProjectionSource(
  source: TransactionalEmailProjectionSource,
  sandboxRecipient: string,
): TransactionalEmailProjectionSource {
  const routed: TransactionalEmailProjectionSource = {
    loadOrderPaid: (orderId: string) => source.loadOrderPaid(orderId),
    loadRefundSucceeded: async (refundAttemptId: string) => {
      const projection = await source.loadRefundSucceeded(refundAttemptId);
      return routeRefundProjection(projection, sandboxRecipient);
    },
  };
  return Object.freeze(routed);
}

function routeRefundProjection(
  projection: EmailProjectionResult<RefundSucceededEmailProjection>,
  sandboxRecipient: string,
): EmailProjectionResult<RefundSucceededEmailProjection> {
  if (!projection.ok) return projection;
  return Object.freeze({
    ok: true,
    value: Object.freeze({ ...projection.value, to: sandboxRecipient }),
  });
}

async function invokeOnce(
  store: Pl09OutboxStore,
  intent: Pl09OutboxIntent,
  handler: OutboxHandler,
  now: Date,
): Promise<Pl09DispatchResult> {
  const attempts = intent.attempts + 1;
  try {
    const outcome = await handler(intent.payload, {
      id: intent.id,
      topic: intent.topic,
      dedupKey: intent.dedupKey,
      attempt: attempts,
      now,
    });
    if (outcome?.outcome === "terminal_failed") {
      await store.markTerminalFailed(intent.id, attempts, outcome.reason);
      return result("terminal_failed", attempts);
    }
    await store.markDone(intent.id, now);
    return result("sent", attempts);
  } catch (error) {
    await store.markRetry(intent.id, attempts, nextRetryAt(now, attempts), safeError(error));
    throw error;
  }
}

function nextRetryAt(now: Date, attempts: number): Date {
  const delay = Math.min(OUTBOX_BACKOFF_CAP_MS, OUTBOX_BACKOFF_BASE_MS * 2 ** attempts);
  return new Date(now.getTime() + delay);
}

function safeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown outbox handler error";
}

function result(
  outcome: Pl09DispatchResult["outcome"],
  attemptCount: number,
): Pl09DispatchResult {
  return Object.freeze({
    outcome,
    intentCount: 1,
    topicMatches: true,
    dedupMatches: true,
    attemptCount,
    terminalMarker: outcome === "terminal_failed",
    sentMarker: outcome === "sent" || outcome === "already_delivered",
  });
}
