import { PaymentMode, PaymentProvider } from "@prisma/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_LEASE_ENABLED,
  REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED,
  REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_TOSS_CONTACT_ENABLED,
  REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED,
  REFUND_EXECUTION_WORKER_ENABLED,
} from "../execution-activation";
import type { TossRefundCancellationPort } from "../providers/toss/refund-cancellation-http";
import type { TossRefundLookupPort } from "../providers/toss/refund-lookup-http";
import {
  defaultRefundExecutionWorkerHostDependencies,
  runRefundExecutionWorkerHost,
} from "../run-refund-execution-worker-host";
import {
  cleanupDispatchFixtures,
  createDispatchFixture,
  type DispatchFixture,
} from "./refund-dispatch-fixture";

const fixtures: DispatchFixture[] = [];
const CHECK = Object.freeze({ kind: "CHECK" as const });
const RUN_ONCE = Object.freeze({
  kind: "RUN_ONCE" as const,
  workerOwner: "refund-sbx:integration:revision:slot",
});

beforeAll(() => {
  requireDisposableDatabaseUrl(process.env.DATABASE_URL);
});

afterEach(async () => {
  await cleanupDispatchFixtures(...fixtures);
  fixtures.length = 0;
  vi.unstubAllGlobals();
});

describe("refund execution one-shot host integration", () => {
  it("checks the real disposable database and migration ledger without business mutation or network", async () => {
    const before = await readRefundMutationSnapshot();
    const fetchPoison = vi.fn(() => {
      throw new Error("GLOBAL_NETWORK_FORBIDDEN");
    });
    vi.stubGlobal("fetch", fetchPoison);

    const result = await runRefundExecutionWorkerHost(
      CHECK,
      { DATABASE_URL: requireDisposableDatabaseUrl(process.env.DATABASE_URL) },
      defaultRefundExecutionWorkerHostDependencies,
    );

    expect(result).toEqual({
      ok: true,
      code: "CHECK_READY",
      readiness: {
        workerMasterEnabled: false,
        credentialStatus: "ABSENT",
        databaseReachable: true,
        migrationStatus: "READY",
      },
    });
    expect(await readRefundMutationSnapshot()).toEqual(before);
    expect(fetchPoison).not.toHaveBeenCalled();
  });

  it("owns and disconnects a database client for an enabled empty queue without network", async () => {
    expect(await db.refundExecutionCommand.count()).toBe(0);
    const fetchPoison = vi.fn(() => {
      throw new Error("GLOBAL_NETWORK_FORBIDDEN");
    });
    vi.stubGlobal("fetch", fetchPoison);
    let adapterConstructions = 0;
    let disconnects = 0;
    const result = await runRefundExecutionWorkerHost(RUN_ONCE, enabledEnv(), {
      ...defaultRefundExecutionWorkerHostDependencies,
      createWorkerDependencies: () => {
        adapterConstructions += 1;
        return fakePorts(null, { get: 0, post: 0 }).dependencies;
      },
      disconnectDatabase: async (database) => {
        disconnects += 1;
        await defaultRefundExecutionWorkerHostDependencies.disconnectDatabase(database);
      },
    });

    expect(result).toEqual({ ok: true, code: "CYCLE_COMPLETE", cycle: emptyCounters() });
    expect(adapterConstructions).toBe(1);
    expect(disconnects).toBe(1);
    expect(fetchPoison).not.toHaveBeenCalled();
  });

  it("runs one bounded READY cycle through typed fake ports and returns aggregate counters", async () => {
    const fixture = await createTossFixture();
    const calls = { get: 0, post: 0 };
    const ports = fakePorts(fixture, calls);
    const fetchPoison = vi.fn(() => {
      throw new Error("GLOBAL_NETWORK_FORBIDDEN");
    });
    vi.stubGlobal("fetch", fetchPoison);

    const result = await runRefundExecutionWorkerHost(RUN_ONCE, enabledEnv(), {
      ...defaultRefundExecutionWorkerHostDependencies,
      createWorkerDependencies: () => ports.dependencies,
    });

    expect(result).toEqual({
      ok: true,
      code: "CYCLE_COMPLETE",
      cycle: { ...emptyCounters(), selectedCount: 1, attemptedCount: 1, succeededCount: 1, readySelected: 1 },
    });
    expect(calls).toEqual({ get: 2, post: 1 });
    expect(fetchPoison).not.toHaveBeenCalled();
    expect(await db.refundExecutionCommand.findUniqueOrThrow({
      where: { id: fixture.commandId },
      select: { status: true },
    })).toEqual({ status: "DONE" });
  });
});

async function createTossFixture(): Promise<DispatchFixture> {
  const fixture = await createDispatchFixture({ totalAmount: 85_000, targetAmount: 85_000 });
  fixtures.push(fixture);
  await Promise.all([
    db.payment.update({
      where: { id: fixture.paymentId },
      data: { provider: PaymentProvider.TOSS, mode: PaymentMode.SANDBOX },
    }),
    db.refundAttempt.update({
      where: { id: fixture.refundAttemptId },
      data: { provider: PaymentProvider.TOSS, mode: PaymentMode.SANDBOX },
    }),
  ]);
  return fixture;
}

function fakePorts(fixture: DispatchFixture | null, calls: { get: number; post: number }) {
  const lookup: TossRefundLookupPort = () => {
    calls.get += 1;
    if (!fixture) return Promise.resolve({ kind: "unavailable" });
    return Promise.resolve({ kind: "response", body: JSON.stringify(eligibleBody(fixture)) });
  };
  const cancellation: TossRefundCancellationPort = () => {
    calls.post += 1;
    if (!fixture) return Promise.resolve({ kind: "unknown" });
    return Promise.resolve({ kind: "success", body: JSON.stringify(successBody(fixture)) });
  };
  return { dependencies: Object.freeze({ lookup, cancellation }) };
}

function enabledEnv(): Readonly<Record<string, string | undefined>> {
  return Object.freeze({
    DATABASE_URL: requireDisposableDatabaseUrl(process.env.DATABASE_URL),
    TOSS_SANDBOX_SECRET_KEY: "synthetic_host_test_secret",
    TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: "merchant-host-test",
    TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "generation-host-test",
    [REFUND_EXECUTION_WORKER_ENABLED]: "ENABLED",
    [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED",
    [REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED]: "ENABLED",
    [REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED]: "ENABLED",
    [REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED]: "ENABLED",
    [REFUND_EXECUTION_TOSS_CONTACT_ENABLED]: "ENABLED",
    [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: "ENABLED",
  });
}

function eligibleBody(fixture: DispatchFixture) {
  return {
    paymentKey: fixture.providerPaymentKey,
    method: "카드",
    easyPay: null,
    currency: "KRW",
    status: "DONE",
    totalAmount: fixture.totalAmount,
    balanceAmount: fixture.targetAmount,
    taxFreeAmount: 0,
    taxExemptionAmount: 0,
    cancels: null,
  };
}

function successBody(fixture: DispatchFixture) {
  return {
    paymentKey: fixture.providerPaymentKey,
    currency: "KRW",
    status: "CANCELED",
    totalAmount: fixture.totalAmount,
    balanceAmount: 0,
    cancels: [{
      transactionKey: `host-worker-transaction-${fixture.refundAttemptId}`,
      cancelStatus: "DONE",
      cancelAmount: fixture.targetAmount,
      cancelReason: "Mira merchant refund",
    }],
  };
}

function emptyCounters() {
  return {
    selectedCount: 0,
    attemptedCount: 0,
    succeededCount: 0,
    replayedCount: 0,
    temporaryCount: 0,
    manualCount: 0,
    conflictCount: 0,
    inconsistentCount: 0,
    skippedCount: 0,
    failedCount: 0,
    readySelected: 0,
    uncontactedSelected: 0,
    contactedSelected: 0,
  };
}

async function readRefundMutationSnapshot() {
  return Promise.all([
    db.refundAttempt.count(),
    db.refundAttemptTransition.count(),
    db.refundExecutionCommand.count(),
    db.refundExecutionCommandEvent.count(),
    db.refundExecutionDispatchAttempt.count(),
    db.refundExecutionProviderContactEligibilityProof.count(),
    db.refundExecutionProviderOperationBinding.count(),
    db.refundExecutionProviderEligibilityProof.count(),
    db.refundExecutionEvidence.count(),
  ]);
}

function requireDisposableDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("DATABASE_URL is required for worker host integration.");
  const parsed = new URL(value);
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!local || database !== "wig_platform_test") {
    throw new Error("Worker host integration is restricted to local wig_platform_test.");
  }
  return value;
}
