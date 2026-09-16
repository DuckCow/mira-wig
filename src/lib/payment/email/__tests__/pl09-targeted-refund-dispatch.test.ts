import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OutboxStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { TransactionalEmailDeliveryError } from "@/lib/payment/email/delivery-error";
import {
  CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1,
  PL09_REFUND_ATTEMPT_ID,
  createTransactionalEmailHandlers,
  refundSucceededEmailDedupKey,
  runPl09TargetedRefundDispatchOnce,
  type Pl09OutboxIntent,
  type Pl09OutboxStore,
  type TransactionalEmailPort,
  type TransactionalEmailProjectionSource,
  type TransactionalEmailSendInput,
} from "@/lib/payment/email";

const NOW = new Date("2026-09-16T00:00:00.000Z");
const SANDBOX_RECIPIENT = "controlled@example.test";
const REAL_RECIPIENT = "customer@example.test";
const DEDUP_KEY = refundSucceededEmailDedupKey(PL09_REFUND_ATTEMPT_ID);
const ENVIRONMENT = Object.freeze({
  TRANSACTIONAL_EMAIL_RECIPIENT_MODE: "SANDBOX_PRELAUNCH",
  TRANSACTIONAL_EMAIL_SANDBOX_RECIPIENT: SANDBOX_RECIPIENT,
});

describe("PL-09 targeted refund-success dispatch", () => {
  it("keeps the general dispatcher limited to the installed pg.void registry", async () => {
    const source = await readFile(join(process.cwd(), "scripts/outbox-dispatch.ts"), "utf8");

    expect(source).toContain("[VOID_TOPIC]: createVoidHandler(db)");
    expect(source).not.toContain(CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1);
    expect(source).not.toContain("customer.refund-succeeded.email.v1");
    expect(source).not.toContain("createTransactionalEmailHandlers");
  });

  it("dispatches the exact existing intent once and routes only to the sandbox recipient", async () => {
    const store = new FakeStore([intent()]);
    const sends: TransactionalEmailSendInput[] = [];
    const createPort = vi.fn((): TransactionalEmailPort => ({
      send: (input) => {
        sends.push(input);
        return Promise.resolve();
      },
    }));

    const result = await runPl09TargetedRefundDispatchOnce({
      store,
      source: projectionSource(),
      environment: ENVIRONMENT,
      publicOrigin: "https://mira.test",
      createPort,
      now: NOW,
    });

    expect(result).toEqual({
      outcome: "sent",
      intentCount: 1,
      topicMatches: true,
      dedupMatches: true,
      attemptCount: 1,
      terminalMarker: false,
      sentMarker: true,
    });
    expect(createPort).toHaveBeenCalledOnce();
    expect(sends).toHaveLength(1);
    expect(sends[0]?.to).toBe(SANDBOX_RECIPIENT);
    expect(sends[0]?.to).not.toBe(REAL_RECIPIENT);
    expect(store.calls).toEqual(["find", "claim", "done"]);
  });

  it.each([
    { candidates: [], label: "zero" },
    {
      candidates: [intent(), intent({ id: "outbox_2", dedupKey: "wrong" })],
      label: "multiple",
    },
  ])("fails closed for $label matching existing intents", async ({ candidates }) => {
    const createPort = vi.fn((): TransactionalEmailPort => ({ send: () => Promise.resolve() }));

    await expect(runPl09TargetedRefundDispatchOnce({
      store: new FakeStore([...candidates]),
      source: projectionSource(),
      environment: ENVIRONMENT,
      publicOrigin: "https://mira.test",
      createPort,
    })).rejects.toThrow("PL09_EXACTLY_ONE_EXISTING_INTENT_REQUIRED");
    expect(createPort).not.toHaveBeenCalled();
  });

  it.each([
    { topic: "wrong.topic" },
    { dedupKey: "wrong-dedup" },
    { payload: { refundAttemptId: "wrong-refund" } },
    { payload: { refundAttemptId: PL09_REFUND_ATTEMPT_ID, extra: true } },
  ])("rejects an intent contract mismatch before port construction: %#", async (change) => {
    const createPort = vi.fn((): TransactionalEmailPort => ({ send: () => Promise.resolve() }));

    await expect(runPl09TargetedRefundDispatchOnce({
      store: new FakeStore([intent(change)]),
      source: projectionSource(),
      environment: ENVIRONMENT,
      publicOrigin: "https://mira.test",
      createPort,
    })).rejects.toThrow("PL09_INTENT_CONTRACT_MISMATCH");
    expect(createPort).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { TRANSACTIONAL_EMAIL_RECIPIENT_MODE: "PRODUCTION" },
    { TRANSACTIONAL_EMAIL_RECIPIENT_MODE: "SANDBOX_PRELAUNCH" },
    {
      TRANSACTIONAL_EMAIL_RECIPIENT_MODE: "SANDBOX_PRELAUNCH",
      TRANSACTIONAL_EMAIL_SANDBOX_RECIPIENT: " invalid@example.test",
    },
    {
      TRANSACTIONAL_EMAIL_RECIPIENT_MODE: "SANDBOX_PRELAUNCH",
      TRANSACTIONAL_EMAIL_SANDBOX_RECIPIENT: "not-an-address",
    },
  ])("validates sandbox routing before selection and port construction: %#", async (environment) => {
    const store = new FakeStore([intent()]);
    const createPort = vi.fn((): TransactionalEmailPort => ({ send: () => Promise.resolve() }));

    await expect(runPl09TargetedRefundDispatchOnce({
      store,
      source: projectionSource(),
      environment,
      publicOrigin: "https://mira.test",
      createPort,
    })).rejects.toThrow(/PL09_SANDBOX_RECIPIENT_/u);
    expect(store.calls).toEqual([]);
    expect(createPort).not.toHaveBeenCalled();
  });

  it("does not resend an already delivered intent", async () => {
    const store = new FakeStore([intent({ status: OutboxStatus.DONE, attempts: 1 })]);
    const send = vi.fn<TransactionalEmailPort["send"]>();
    const createPort = vi.fn((): TransactionalEmailPort => ({ send }));

    await expect(runPl09TargetedRefundDispatchOnce({
      store,
      source: projectionSource(),
      environment: ENVIRONMENT,
      publicOrigin: "https://mira.test",
      createPort,
    })).resolves.toMatchObject({ outcome: "already_delivered", sentMarker: true });
    expect(createPort).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(store.calls).toEqual(["find"]);
  });

  it.each([OutboxStatus.PROCESSING, OutboxStatus.FAILED])(
    "refuses a non-pending terminal or in-flight intent: %s",
    async (status) => {
      const store = new FakeStore([intent({ status })]);
      const createPort = vi.fn((): TransactionalEmailPort => ({ send: () => Promise.resolve() }));

      await expect(runPl09TargetedRefundDispatchOnce({
        store,
        source: projectionSource(),
        environment: ENVIRONMENT,
        publicOrigin: "https://mira.test",
        createPort,
      })).rejects.toThrow("PL09_INTENT_NOT_DISPATCHABLE");
      expect(createPort).not.toHaveBeenCalled();
      expect(store.calls).toEqual(["find"]);
    },
  );

  it("persists provider failure for later durable handling and does not retry in the invocation", async () => {
    const store = new FakeStore([intent()]);
    const failure = new TransactionalEmailDeliveryError("TRANSIENT", "SES_NETWORK_AMBIGUOUS");
    const send = vi.fn<TransactionalEmailPort["send"]>(() => Promise.reject(failure));

    await expect(runPl09TargetedRefundDispatchOnce({
      store,
      source: projectionSource(),
      environment: ENVIRONMENT,
      publicOrigin: "https://mira.test",
      createPort: () => ({ send }),
      now: NOW,
    })).rejects.toBe(failure);
    expect(send).toHaveBeenCalledOnce();
    expect(store.calls).toEqual(["find", "claim", "retry:SES_NETWORK_AMBIGUOUS"]);
  });

  it("leaves the general handler's production recipient projection unchanged", async () => {
    const sends: TransactionalEmailSendInput[] = [];
    const handlers = createTransactionalEmailHandlers({
      source: projectionSource(),
      port: { send: (input) => { sends.push(input); return Promise.resolve(); } },
      publicOrigin: "https://mira.test",
    });

    await handlers[CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1](
      { refundAttemptId: PL09_REFUND_ATTEMPT_ID },
      {
        id: "outbox_1",
        topic: CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1,
        dedupKey: DEDUP_KEY,
        attempt: 1,
        now: NOW,
      },
    );

    expect(sends).toHaveLength(1);
    expect(sends[0]?.to).toBe(REAL_RECIPIENT);
  });

  it("contains no intent creation, refund mutation, or Eximbay call owner", async () => {
    const source = await readFile(
      join(process.cwd(), "src/lib/payment/email/pl09-targeted-refund-dispatch.ts"),
      "utf8",
    );

    expect(source).not.toContain("enqueueRefundSucceededEmailIntent");
    expect(source).not.toContain("paymentOutbox.create");
    expect(source).not.toContain("refundAttempt.update");
    expect(source).not.toContain("executeEximbay");
    expect(source).not.toContain("EximbayRefund");
  });

  it("configures the CLI SES adapter with the same required sandbox recipient", async () => {
    const source = await readFile(
      join(process.cwd(), "scripts/pl09-targeted-refund-email-dispatch.ts"),
      "utf8",
    );

    expect(source).toContain('mode: "SANDBOX_PRELAUNCH"');
    expect(source).toContain("safeRecipient: sandboxRecipient");
    expect(source).not.toContain('mode: "PRODUCTION"');
  });
});

class FakeStore implements Pl09OutboxStore {
  readonly calls: string[] = [];

  constructor(private readonly candidates: readonly Pl09OutboxIntent[]) {}

  findTargetCandidates(): Promise<readonly Pl09OutboxIntent[]> {
    this.calls.push("find");
    return Promise.resolve(this.candidates);
  }

  claimPending(): Promise<boolean> {
    this.calls.push("claim");
    return Promise.resolve(true);
  }

  markDone(): Promise<void> {
    this.calls.push("done");
    return Promise.resolve();
  }

  markTerminalFailed(_id: string, _attempts: number, reason: string): Promise<void> {
    this.calls.push(`terminal:${reason}`);
    return Promise.resolve();
  }

  markRetry(_id: string, _attempts: number, _nextAttemptAt: Date, reason: string): Promise<void> {
    this.calls.push(`retry:${reason}`);
    return Promise.resolve();
  }
}

function intent(change: Partial<Pl09OutboxIntent> = {}): Pl09OutboxIntent {
  return {
    id: "outbox_1",
    topic: CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1,
    payload: { refundAttemptId: PL09_REFUND_ATTEMPT_ID },
    status: OutboxStatus.PENDING,
    attempts: 0,
    dedupKey: DEDUP_KEY,
    ...change,
  };
}

function projectionSource(): TransactionalEmailProjectionSource {
  return {
    loadOrderPaid: () => Promise.resolve({ ok: false, reason: "NOT_USED" }),
    loadRefundSucceeded: () => Promise.resolve({
      ok: true,
      value: {
        to: REAL_RECIPIENT,
        locale: "ko",
        orderId: "order_public",
        succeededAt: NOW,
        refundAmount: 100,
        currency: "USD",
        completion: "FULL",
        remainingPaidAmount: 0,
      },
    }),
  };
}
