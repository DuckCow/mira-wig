import { OutboxStatus } from "@prisma/client";
import {
  OUTBOX_BACKOFF_BASE_MS,
  OUTBOX_BACKOFF_CAP_MS,
  OUTBOX_DEFAULT_LIMIT,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_ZOMBIE_AFTER_MS,
  type DispatchPendingInput,
  type DispatchPendingResult,
  type OutboxClient,
  type OutboxHandler,
  type OutboxHandlerResult,
  type OutboxJob,
  type OutboxTerminalFailed,
} from "./types";

type ProcessOutcome = "skipped" | "succeeded" | "retried" | "terminalFailed";

export async function dispatchPending(
  input: DispatchPendingInput,
): Promise<DispatchPendingResult> {
  const now = input.now ?? new Date();
  const topics = Object.keys(input.registry);
  if (topics.length === 0) return emptyResult();

  const zombiesRecovered = await recoverZombies(input.client, topics, now);
  const limit = normalizeLimit(input.limit);
  const jobs = await findCandidates(input.client, topics, now, limit);
  return processJobs(input.client, input.registry, jobs, now, zombiesRecovered);
}

function emptyResult(zombiesRecovered = 0): DispatchPendingResult {
  return { zombiesRecovered, claimed: 0, succeeded: 0, retried: 0, terminalFailed: 0 };
}

async function recoverZombies(
  client: OutboxClient,
  topics: string[],
  now: Date,
): Promise<number> {
  const staleBefore = new Date(now.getTime() - OUTBOX_ZOMBIE_AFTER_MS);
  const result = await client.paymentOutbox.updateMany({
    where: { topic: { in: topics }, status: OutboxStatus.PROCESSING, updatedAt: { lte: staleBefore } },
    data: { status: OutboxStatus.PENDING },
  });
  return result.count;
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return OUTBOX_DEFAULT_LIMIT;
  return Math.max(0, Math.floor(limit));
}

async function findCandidates(
  client: OutboxClient,
  topics: string[],
  now: Date,
  limit: number,
): Promise<OutboxJob[]> {
  if (limit < 1) return [];
  return client.paymentOutbox.findMany({
    where: {
      topic: { in: topics },
      status: OutboxStatus.PENDING,
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: [{ createdAt: "asc" }],
    take: limit,
    select: { id: true, topic: true, payload: true, attempts: true, dedupKey: true },
  });
}

async function processJobs(
  client: OutboxClient,
  registry: DispatchPendingInput["registry"],
  jobs: OutboxJob[],
  now: Date,
  zombiesRecovered: number,
): Promise<DispatchPendingResult> {
  const result = emptyResult(zombiesRecovered);
  for (const job of jobs) {
    applyOutcome(result, await processJob(client, job, registry[job.topic], now));
  }
  return result;
}

function applyOutcome(result: DispatchPendingResult, outcome: ProcessOutcome): void {
  if (outcome === "skipped") return;
  result.claimed += 1;
  if (outcome === "succeeded") result.succeeded += 1;
  if (outcome === "retried") result.retried += 1;
  if (outcome === "terminalFailed") result.terminalFailed += 1;
}

async function processJob(
  client: OutboxClient,
  job: OutboxJob,
  handler: OutboxHandler,
  now: Date,
): Promise<ProcessOutcome> {
  const claimed = await claimJob(client, job.id);
  if (!claimed) return "skipped";

  try {
    const outcome = await handler(job.payload, {
      id: job.id,
      topic: job.topic,
      dedupKey: job.dedupKey,
      attempt: job.attempts + 1,
      now,
    });
    if (isTerminalFailed(outcome)) {
      await markTerminalFailed(client, job, outcome.reason);
      return "terminalFailed";
    }
    await markDone(client, job.id, now);
    return "succeeded";
  } catch (e) {
    return markFailed(client, job, now, errorToMessage(e));
  }
}

function isTerminalFailed(outcome: OutboxHandlerResult): outcome is OutboxTerminalFailed {
  if (!isRecord(outcome)) return false;
  return outcome.outcome === "terminal_failed" && typeof outcome.reason === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function claimJob(client: OutboxClient, id: string): Promise<boolean> {
  const result = await client.paymentOutbox.updateMany({
    where: { id, status: OutboxStatus.PENDING },
    data: { status: OutboxStatus.PROCESSING },
  });
  return result.count === 1;
}

async function markDone(client: OutboxClient, id: string, now: Date): Promise<void> {
  await client.paymentOutbox.update({
    where: { id },
    data: { status: OutboxStatus.DONE, processedAt: now, nextAttemptAt: null, lastError: null },
  });
}

async function markTerminalFailed(
  client: OutboxClient,
  job: OutboxJob,
  lastError: string,
): Promise<void> {
  await client.paymentOutbox.update({
    where: { id: job.id },
    data: { status: OutboxStatus.FAILED, attempts: job.attempts + 1, nextAttemptAt: null, lastError },
  });
}

async function markFailed(
  client: OutboxClient,
  job: OutboxJob,
  now: Date,
  lastError: string,
): Promise<ProcessOutcome> {
  const attempts = job.attempts + 1;
  if (attempts >= OUTBOX_MAX_ATTEMPTS) {
    await client.paymentOutbox.update({
      where: { id: job.id },
      data: { status: OutboxStatus.FAILED, attempts, nextAttemptAt: null, lastError },
    });
    return "terminalFailed";
  }
  await client.paymentOutbox.update({
    where: { id: job.id },
    data: { status: OutboxStatus.PENDING, attempts, nextAttemptAt: nextRetryAt(now, attempts), lastError },
  });
  return "retried";
}

function nextRetryAt(now: Date, attempts: number): Date {
  const backoff = Math.min(OUTBOX_BACKOFF_CAP_MS, OUTBOX_BACKOFF_BASE_MS * 2 ** attempts);
  return new Date(now.getTime() + backoff);
}

function errorToMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Unknown outbox handler error";
}
