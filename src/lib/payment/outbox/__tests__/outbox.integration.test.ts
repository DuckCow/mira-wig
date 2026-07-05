import { randomUUID } from "crypto";
import { OutboxStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  OUTBOX_BACKOFF_BASE_MS,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_ZOMBIE_AFTER_MS,
  dispatchPending,
  enqueue,
  type OutboxRegistry,
} from "@/lib/payment/outbox";

describe("payment outbox skeleton", () => {
  let topics: string[];

  beforeEach(() => {
    topics = [];
  });

  afterEach(async () => {
    if (topics.length === 0) return;
    await db.paymentOutbox.deleteMany({ where: { topic: { in: topics } } });
  });

  it("도메인 tx 롤백 시 outbox 행이 남지 않는다", async () => {
    const topic = makeTopic("rollback", topics);

    await expect(
      db.$transaction(async (tx) => {
        await enqueue(tx, { topic, payload: { topic } });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");

    await expect(db.paymentOutbox.count({ where: { topic } })).resolves.toBe(0);
  });

  it("성공 소비는 PENDING을 DONE으로 만들고 핸들러를 1회 실행한다", async () => {
    const topic = makeTopic("success", topics);
    const now = new Date("2026-07-06T00:00:00.000Z");
    let effects = 0;
    await enqueueCommitted(topic);

    const registry: OutboxRegistry = {
      [topic]: () => {
        effects += 1;
        return Promise.resolve();
      },
    };

    const result = await dispatchPending({ client: db, registry, now });
    const row = await findOutbox(topic);

    expect(result).toMatchObject({ claimed: 1, succeeded: 1, retried: 0 });
    expect(effects).toBe(1);
    expect(row.status).toBe(OutboxStatus.DONE);
    expect(row.processedAt?.getTime()).toBe(now.getTime());
  });

  it("실패는 백오프 재시도 후 maxAttempts에서 FAILED로 종료한다", async () => {
    const topic = makeTopic("failure", topics);
    const registry: OutboxRegistry = {
      [topic]: () => Promise.reject(new Error("planned failure")),
    };
    const firstNow = new Date("2026-07-06T00:01:00.000Z");
    await enqueueCommitted(topic);

    await dispatchPending({ client: db, registry, now: firstNow });
    let row = await findOutbox(topic);

    expect(row.status).toBe(OutboxStatus.PENDING);
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt?.getTime()).toBe(firstNow.getTime() + OUTBOX_BACKOFF_BASE_MS * 2);
    expect(row.lastError).toContain("planned failure");

    for (let attempt = 2; attempt <= OUTBOX_MAX_ATTEMPTS; attempt += 1) {
      await dispatchPending({ client: db, registry, now: requireDate(row.nextAttemptAt) });
      row = await findOutbox(topic);
    }

    expect(row.status).toBe(OutboxStatus.FAILED);
    expect(row.attempts).toBe(OUTBOX_MAX_ATTEMPTS);
    expect(row.nextAttemptAt).toBeNull();
    expect(row.lastError).toContain("planned failure");
  });

  it("동시 디스패처 경쟁에서 같은 행을 이중 처리하지 않는다", async () => {
    const topic = makeTopic("race", topics);
    let effects = 0;
    await enqueueCommitted(topic);

    const registry: OutboxRegistry = {
      [topic]: async () => {
        effects += 1;
        await delay(20);
      },
    };

    const results = await Promise.all([
      dispatchPending({ client: db, registry }),
      dispatchPending({ client: db, registry }),
    ]);
    const row = await findOutbox(topic);

    expect(results[0].succeeded + results[1].succeeded).toBe(1);
    expect(results[0].claimed + results[1].claimed).toBe(1);
    expect(effects).toBe(1);
    expect(row.status).toBe(OutboxStatus.DONE);
  });

  it("같은 dedupKey enqueue 2회는 행 1개로 수렴한다", async () => {
    const topic = makeTopic("dedup", topics);
    const dedupKey = `dedup-${randomUUID()}`;

    await enqueueCommitted(topic, dedupKey);
    await enqueueCommitted(topic, dedupKey);

    await expect(db.paymentOutbox.count({ where: { dedupKey } })).resolves.toBe(1);
  });

  it("미등록 topic 행은 클레임하지 않는다", async () => {
    const topic = makeTopic("unregistered", topics);
    const registeredTopic = makeTopic("registered", topics);
    await enqueueCommitted(topic);

    const registry: OutboxRegistry = {
      [registeredTopic]: () => Promise.reject(new Error("should not run")),
    };

    const result = await dispatchPending({ client: db, registry });
    const row = await findOutbox(topic);

    expect(result.claimed).toBe(0);
    expect(row.status).toBe(OutboxStatus.PENDING);
    expect(row.attempts).toBe(0);
  });

  it("좀비 PROCESSING 행은 PENDING 환원 후 정상 처리되고 attempts를 보존한다", async () => {
    const topic = makeTopic("zombie", topics);
    const attempts = 2;
    const now = new Date("2026-07-06T00:02:00.000Z");
    const staleUpdatedAt = new Date(now.getTime() - OUTBOX_ZOMBIE_AFTER_MS - 1_000);
    let handlerAttempt = 0;

    await db.paymentOutbox.create({
      data: { topic, payload: { topic }, status: OutboxStatus.PROCESSING, attempts, updatedAt: staleUpdatedAt },
    });

    const registry: OutboxRegistry = {
      [topic]: (_payload, ctx) => {
        handlerAttempt = ctx.attempt;
        return Promise.resolve();
      },
    };

    const result = await dispatchPending({ client: db, registry, now });
    const row = await findOutbox(topic);

    expect(result).toMatchObject({ zombiesRecovered: 1, claimed: 1, succeeded: 1 });
    expect(handlerAttempt).toBe(attempts + 1);
    expect(row.status).toBe(OutboxStatus.DONE);
    expect(row.attempts).toBe(attempts);
    expect(row.processedAt?.getTime()).toBe(now.getTime());
  });
});

function makeTopic(label: string, topics: string[]): string {
  const topic = `outbox-${label}-${randomUUID()}`;
  topics.push(topic);
  return topic;
}

async function enqueueCommitted(topic: string, dedupKey?: string): Promise<void> {
  await db.$transaction((tx) => enqueue(tx, { topic, payload: { topic }, dedupKey }));
}

async function findOutbox(topic: string) {
  const row = await db.paymentOutbox.findFirst({ where: { topic } });
  if (!row) throw new Error(`Missing outbox row for topic ${topic}`);
  return row;
}

function requireDate(value: Date | null): Date {
  if (!value) throw new Error("Expected retry date");
  return value;
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
