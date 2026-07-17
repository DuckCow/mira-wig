import {
  RefundExecutionCommandEventType,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
} from "@prisma/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cleanupDispatchFixtures } from "../../../__tests__/refund-dispatch-fixture";
import {
  createNamedDbSession,
  disconnectSessions,
  queueBehindObservedOrderLock,
} from "../../../__tests__/refund-order-lock-barrier";
import {
  REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED,
  REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED,
} from "../../../execution-activation";
import { createTossRefundContactExecutor } from "../refund-contact-orchestrator";
import type { TossRefundCancellationPort } from "../refund-cancellation-http";
import { createTossRefundRecoveryOperation } from "../refund-recovery-orchestrator";
import {
  TOSS_RECOVERY_CONFLICT_SAFE_CODE,
  TOSS_RECOVERY_CONFLICT_SAFE_MESSAGE,
} from "../refund-recovery-state";
import type { TossRefundLookupPort } from "../refund-lookup-http";
import {
  createContactedRecoveryFixture,
  eligibleLookup,
  exactSuccessLookup,
  RECOVERY_CREDENTIALS,
  RECOVERY_ENV,
  type ContactedRecoveryFixture,
} from "./refund-recovery-fixture";

describe("recoverTossRefundExecution integration", () => {
  const fixtures: ContactedRecoveryFixture[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || new URL(databaseUrl).pathname.replace(/^\//, "") !== "wig_platform_test") {
      throw new Error("Toss recovery integration tests require wig_platform_test.");
    }
    const rows = await db.$queryRaw<{ databaseName: string }[]>`
      SELECT current_database() AS "databaseName"
    `;
    expect(rows).toEqual([{ databaseName: "wig_platform_test" }]);
  });

  afterEach(async () => {
    await cleanupDispatchFixtures(...fixtures.map((entry) => entry.fixture));
    fixtures.length = 0;
  });

  it("acquires one recovery fence, performs one GET, and atomically applies exact success", async () => {
    const contacted = await trackedFixture(fixtures);
    let gets = 0;
    const recover = createTossRefundRecoveryOperation({
      lookup: exactSuccessLookup(contacted.fixture, () => { gets += 1; }),
    });
    const result = await recover(db, recoveryInput(contacted), RECOVERY_ENV);

    expect(result).toEqual({
      ok: true,
      replayed: false,
      commandId: contacted.fixture.commandId,
      outcome: "REFUND_SUCCEEDED",
    });
    expect(Object.keys(result).sort()).toEqual(["commandId", "ok", "outcome", "replayed"]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(gets).toBe(1);
    const state = await recoveryState(contacted);
    expect(state.command).toMatchObject({
      status: "DONE",
      leaseGeneration: 2,
      dispatchAttempt: 1,
      leaseOwner: null,
      leaseUntil: null,
      leaseTokenHash: null,
    });
    expect(state.events.filter((row) => (
      row.eventType === RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED
    ))).toHaveLength(1);
    expect(state.evidence).toHaveLength(1);
    expect(state.evidence[0]).toMatchObject({
      source: RefundExecutionEvidenceSource.PROVIDER_LOOKUP,
      outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
      application: RefundExecutionEvidenceApplication.APPLIED,
      authorizingLeaseGeneration: 2,
      reportedAmount: 85_000,
      reportedCurrency: "KRW",
    });
    expect(state.evidence[0].dispatchAttemptId === state.dispatch.id).toBe(true);
    expect(state.attempt).toMatchObject({
      status: "SUCCEEDED",
      providerRefundId: "recovery-transaction-1",
    });
    expect(state.order.status).toBe("REFUNDED");
  });

  it("replays coherent finality before gates, credentials, fencing, or GET", async () => {
    const contacted = await trackedFixture(fixtures);
    await createTossRefundRecoveryOperation({
      lookup: exactSuccessLookup(contacted.fixture),
    })(db, recoveryInput(contacted), RECOVERY_ENV);
    let gets = 0;
    const replay = await createTossRefundRecoveryOperation({
      lookup: exactSuccessLookup(contacted.fixture, () => { gets += 1; }),
    })(db, recoveryInput(contacted), {});
    expect(replay).toMatchObject({ ok: true, replayed: true });
    expect(gets).toBe(0);
  });

  it("returns recontact-required after one GET and retains the recovery fence", async () => {
    const contacted = await trackedFixture(fixtures);
    let gets = 0;
    const recover = createTossRefundRecoveryOperation({
      lookup: async (...args) => {
        gets += 1;
        return eligibleLookup(contacted.fixture)(...args);
      },
    });
    const result = await recover(db, recoveryInput(contacted), RECOVERY_ENV);
    expect(failureCode(result)).toBe("RECOVERY_RECONTACT_REQUIRED");
    const second = await recover(db, recoveryInput(contacted), RECOVERY_ENV);
    expect(failureCode(second)).toBe("RECOVERY_LEASE_CONFLICT");
    expect(gets).toBe(1);
    const state = await recoveryState(contacted);
    expect(state.command).toMatchObject({ status: "LEASED", leaseGeneration: 2 });
    expect(state.command.leaseOwner).toBe("recovery-test-owner");
    expect(state.command.leaseTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(state.evidence).toHaveLength(0);
  });

  it.each([
    ["unavailable", "RECOVERY_LOOKUP_UNAVAILABLE"],
    ["rejected", "RECOVERY_LOOKUP_REJECTED"],
  ] as const)("maps %s lookup with no evidence and retains the fence", async (kind, code) => {
    const contacted = await trackedFixture(fixtures);
    const lookup: TossRefundLookupPort = () => Promise.resolve({ kind });
    const result = await createTossRefundRecoveryOperation({ lookup })(
      db,
      recoveryInput(contacted),
      RECOVERY_ENV,
    );
    expect(failureCode(result)).toBe(code);
    const state = await recoveryState(contacted);
    expect(state.command).toMatchObject({ status: "LEASED", leaseGeneration: 2 });
    expect(state.evidence).toHaveLength(0);
  });

  it("persists bounded provider conflict and replays manual state before gates", async () => {
    const contacted = await trackedFixture(fixtures);
    let gets = 0;
    const conflictLookup: TossRefundLookupPort = () => {
      gets += 1;
      return Promise.resolve({ kind: "response", body: JSON.stringify({
        paymentKey: contacted.fixture.providerPaymentKey,
        status: "CANCELED",
        cancels: [],
      }) });
    };
    const recover = createTossRefundRecoveryOperation({ lookup: conflictLookup });
    expect(failureCode(await recover(db, recoveryInput(contacted), RECOVERY_ENV)))
      .toBe("RECOVERY_MANUAL_REVIEW_REQUIRED");
    const state = await recoveryState(contacted);
    expect(state.order.status).toBe("REFUND_PENDING");
    expect(state.attempt).toMatchObject({
      status: "MANUAL_REVIEW",
      failureCode: TOSS_RECOVERY_CONFLICT_SAFE_CODE,
      safeFailureMessage: TOSS_RECOVERY_CONFLICT_SAFE_MESSAGE,
    });
    expect(state.command).toMatchObject({
      status: "PARKED",
      leaseOwner: null,
      leaseUntil: null,
      leaseTokenHash: null,
    });
    expect(state.evidence).toHaveLength(1);
    expect(state.evidence[0]).toMatchObject({
      source: "PROVIDER_LOOKUP",
      outcome: "UNKNOWN",
      application: "CONFLICT",
      observedProviderRefundId: null,
      reportedAmount: null,
      reportedCurrency: null,
      safeCode: TOSS_RECOVERY_CONFLICT_SAFE_CODE,
      safeMessage: TOSS_RECOVERY_CONFLICT_SAFE_MESSAGE,
      authorizingLeaseGeneration: 2,
    });
    expect(failureCode(await recover(db, recoveryInput(contacted), {})))
      .toBe("RECOVERY_MANUAL_REVIEW_REQUIRED");
    expect(gets).toBe(1);
  });

  it("keeps the E3B contact classifier fail-closed for coherent E3C1 manual state", async () => {
    const contacted = await trackedFixture(fixtures);
    const conflict: TossRefundLookupPort = () => Promise.resolve({
      kind: "response",
      body: JSON.stringify({ status: "unexpected" }),
    });
    await createTossRefundRecoveryOperation({ lookup: conflict })(
      db,
      recoveryInput(contacted),
      RECOVERY_ENV,
    );
    const cancellation: TossRefundCancellationPort = () => {
      throw new Error("Cancellation must remain unreachable.");
    };
    const contact = createTossRefundContactExecutor({
      lookup: eligibleLookup(contacted.fixture),
      cancellation,
    });
    const result = await contact(db, {
      commandId: contacted.fixture.commandId,
      leaseGeneration: contacted.initialLease.leaseGeneration,
      leaseToken: contacted.initialLease.leaseToken,
    }, {});
    expect(result.ok ? "<success>" : result.code).toBe("REFUND_LEDGER_INCONSISTENT");
  });

  it.each([
    [
      { [REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED]: "ENABLED" },
      "FEATURE_DISABLED",
    ],
    [
      {
        ...RECOVERY_CREDENTIALS,
        [REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED]: "INVALID",
        [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: "ENABLED",
      },
      "CONFIG_INVALID",
    ],
    [
      {
        [REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED]: "ENABLED",
        [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: "ENABLED",
      },
      "RECOVERY_CREDENTIAL_UNAVAILABLE",
    ],
  ] as const)("fails prerequisites before fence and GET: %s", async (env, code) => {
    const contacted = await trackedFixture(fixtures);
    const before = await recoveryState(contacted);
    let gets = 0;
    const result = await createTossRefundRecoveryOperation({
      lookup: exactSuccessLookup(contacted.fixture, () => { gets += 1; }),
    })(db, recoveryInput(contacted), env);
    expect(failureCode(result)).toBe(code);
    const after = await recoveryState(contacted);
    expect(gets).toBe(0);
    expect(after.command.leaseGeneration).toBe(before.command.leaseGeneration);
    expect(after.events.length).toBe(before.events.length);
  });

  it("treats durable credential-label mismatch as unavailable with no committed fence or GET", async () => {
    const contacted = await trackedFixture(fixtures);
    let gets = 0;
    const result = await createTossRefundRecoveryOperation({
      lookup: exactSuccessLookup(contacted.fixture, () => { gets += 1; }),
    })(db, recoveryInput(contacted), {
      ...RECOVERY_ENV,
      TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "generation-2",
    });
    expect(failureCode(result)).toBe("RECOVERY_CREDENTIAL_UNAVAILABLE");
    expect(gets).toBe(0);
    const state = await recoveryState(contacted);
    expect(state.command.leaseGeneration).toBe(1);
    expect(state.events.filter((row) => (
      row.eventType === RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED
    ))).toHaveLength(0);
  });

  it("applies a captured exact result after lease expiry without rereading credentials", async () => {
    const contacted = await trackedFixture(fixtures);
    const env = { ...RECOVERY_ENV };
    const lookup = exactSuccessLookup(contacted.fixture, async () => {
      env.TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING = "generation-rotated";
      await db.refundExecutionCommand.update({
        where: { id: contacted.fixture.commandId },
        data: { leaseUntil: new Date("2026-01-01T00:00:00.000Z") },
      });
    });
    const result = await createTossRefundRecoveryOperation({ lookup })(
      db,
      recoveryInput(contacted),
      env,
    );
    expect(result).toMatchObject({ ok: true, replayed: false });
  });

  it("rejects an old captured result after a newer generation supersedes it", async () => {
    const contacted = await trackedFixture(fixtures);
    const lookup = exactSuccessLookup(contacted.fixture, async () => {
      const command = await db.refundExecutionCommand.findUniqueOrThrow({
        where: { id: contacted.fixture.commandId },
      });
      await db.$transaction([
        db.refundExecutionCommand.update({
          where: { id: command.id },
          data: {
            leaseGeneration: command.leaseGeneration + 1,
            leaseOwner: "superseding-owner",
            leaseUntil: new Date(Date.now() + 300_000),
            leaseTokenHash: "c".repeat(64),
          },
        }),
        db.refundExecutionCommandEvent.create({
          data: {
            commandId: command.id,
            eventType: RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED,
            leaseGeneration: command.leaseGeneration + 1,
            dispatchAttempt: command.dispatchAttempt,
            occurredAt: new Date(),
          },
        }),
      ]);
    });
    const result = await createTossRefundRecoveryOperation({ lookup })(
      db,
      recoveryInput(contacted),
      RECOVERY_ENV,
    );
    expect(failureCode(result)).toBe("RECOVERY_LEASE_CONFLICT");
    expect((await recoveryState(contacted)).evidence).toHaveLength(0);
  });

  it("allows one GET winner while a concurrent invocation sees the active recovery fence", async () => {
    const contacted = await trackedFixture(fixtures);
    const firstSession = createNamedDbSession("e3c1_lookup_winner");
    const secondSession = createNamedDbSession("e3c1_lookup_loser");
    let notifyStarted: (() => void) | undefined;
    let releaseLookup: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
    const released = new Promise<void>((resolve) => { releaseLookup = resolve; });
    let gets = 0;
    const lookup: TossRefundLookupPort = async () => {
      gets += 1;
      notifyStarted?.();
      await released;
      return { kind: "unavailable" };
    };
    const recover = createTossRefundRecoveryOperation({ lookup });
    try {
      const winner = recover(firstSession.client, recoveryInput(contacted), RECOVERY_ENV);
      await started;
      const loser = await recover(secondSession.client, recoveryInput(contacted), RECOVERY_ENV);
      expect(failureCode(loser)).toBe("RECOVERY_LEASE_CONFLICT");
      expect(gets).toBe(1);
      releaseLookup?.();
      expect(failureCode(await winner)).toBe("RECOVERY_LOOKUP_UNAVAILABLE");
    } finally {
      releaseLookup?.();
      await disconnectSessions(firstSession, secondSession);
    }
  });

  it("serializes two fence acquirers through observed PostgreSQL Order locks", async () => {
    const contacted = await trackedFixture(fixtures);
    const firstSession = createNamedDbSession("e3c1_fence_first");
    const secondSession = createNamedDbSession("e3c1_fence_second");
    let gets = 0;
    const lookup: TossRefundLookupPort = () => {
      gets += 1;
      return Promise.resolve({ kind: "unavailable" });
    };
    const recover = createTossRefundRecoveryOperation({ lookup });
    try {
      const queued = await queueBehindObservedOrderLock(
        contacted.fixture.orderId,
        firstSession,
        () => recover(firstSession.client, recoveryInput(contacted), RECOVERY_ENV),
        secondSession,
        () => recover(secondSession.client, recoveryInput(contacted), RECOVERY_ENV),
      );
      const results = await Promise.all([queued.first, queued.second]);
      expect(results.map(failureCode).sort()).toEqual([
        "RECOVERY_LEASE_CONFLICT",
        "RECOVERY_LOOKUP_UNAVAILABLE",
      ]);
      expect(gets).toBe(1);
      const state = await recoveryState(contacted);
      expect(state.command.leaseGeneration).toBe(2);
      expect(state.events.filter((row) => (
        row.eventType === RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED
      ))).toHaveLength(1);
    } finally {
      await disconnectSessions(firstSession, secondSession);
    }
  });

  it("rolls back the command fence when recovery-event insertion fails", async () => {
    const contacted = await trackedFixture(fixtures);
    const constraint = "e3c1_recovery_event_rollback";
    await addScopedCheck(
      "RefundExecutionCommandEvent",
      constraint,
      `"commandId" <> '${safeSqlId(contacted.fixture.commandId)}' OR "eventType" <> 'RECOVERY_LEASE_ACQUIRED'`,
    );
    try {
      const result = await createTossRefundRecoveryOperation({
        lookup: exactSuccessLookup(contacted.fixture),
      })(db, recoveryInput(contacted), RECOVERY_ENV);
      expect(failureCode(result)).toBe("PERSISTENCE_CONFLICT");
      const state = await recoveryState(contacted);
      expect(state.command.leaseGeneration).toBe(1);
      expect(state.command.leaseOwner).toBe("recovery-fixture-initial-owner");
      expect(state.events.filter((row) => (
        row.eventType === RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED
      ))).toHaveLength(0);
    } finally {
      await dropCheck("RefundExecutionCommandEvent", constraint);
    }
  });

  it.each([
    ["RefundExecutionEvidence", "e3c1_success_evidence_rollback",
      (entry: ContactedRecoveryFixture) => `"commandId" <> '${safeSqlId(entry.fixture.commandId)}'`],
    ["RefundAttempt", "e3c1_success_attempt_rollback",
      (entry: ContactedRecoveryFixture) => `"id" <> '${safeSqlId(entry.fixture.refundAttemptId)}' OR "status" <> 'SUCCEEDED'`],
    ["RefundAttemptTransition", "e3c1_success_transition_rollback",
      (entry: ContactedRecoveryFixture) => `"refundAttemptId" <> '${safeSqlId(entry.fixture.refundAttemptId)}' OR "toStatus" <> 'SUCCEEDED'`],
    ["Order", "e3c1_success_order_rollback",
      (entry: ContactedRecoveryFixture) => `"id" <> '${safeSqlId(entry.fixture.orderId)}' OR "status" <> 'REFUNDED'`],
    ["RefundExecutionCommand", "e3c1_success_command_rollback",
      (entry: ContactedRecoveryFixture) => `"id" <> '${safeSqlId(entry.fixture.commandId)}' OR "status" <> 'DONE'`],
  ] as const)("retains the fence and rolls back success at %s", async (table, constraint, predicate) => {
    const contacted = await trackedFixture(fixtures);
    await addScopedCheck(table, constraint, predicate(contacted));
    try {
      const result = await createTossRefundRecoveryOperation({
        lookup: exactSuccessLookup(contacted.fixture),
      })(db, recoveryInput(contacted), RECOVERY_ENV);
      expect(failureCode(result)).toBe("PERSISTENCE_CONFLICT");
      const state = await recoveryState(contacted);
      expect(state.command).toMatchObject({ status: "LEASED", leaseGeneration: 2 });
      expect(state.attempt.status).toBe("PROCESSING");
      expect(state.order.status).toBe("REFUND_PENDING");
      expect(state.evidence).toHaveLength(0);
    } finally {
      await dropCheck(table, constraint);
    }
  });

  it.each([
    ["RefundExecutionEvidence", "e3c1_conflict_evidence_rollback",
      (entry: ContactedRecoveryFixture) => `"commandId" <> '${safeSqlId(entry.fixture.commandId)}'`],
    ["RefundAttempt", "e3c1_conflict_attempt_rollback",
      (entry: ContactedRecoveryFixture) => `"id" <> '${safeSqlId(entry.fixture.refundAttemptId)}' OR "status" <> 'MANUAL_REVIEW'`],
    ["RefundAttemptTransition", "e3c1_conflict_transition_rollback",
      (entry: ContactedRecoveryFixture) => `"refundAttemptId" <> '${safeSqlId(entry.fixture.refundAttemptId)}' OR "toStatus" <> 'MANUAL_REVIEW'`],
    ["RefundExecutionCommand", "e3c1_conflict_command_rollback",
      (entry: ContactedRecoveryFixture) => `"id" <> '${safeSqlId(entry.fixture.commandId)}' OR "status" <> 'PARKED'`],
  ] as const)("retains the fence and rolls back manual parking at %s", async (
    table,
    constraint,
    predicate,
  ) => {
    const contacted = await trackedFixture(fixtures);
    await addScopedCheck(table, constraint, predicate(contacted));
    try {
      const lookup: TossRefundLookupPort = () => Promise.resolve({
        kind: "response",
        body: JSON.stringify({ status: "conflicting" }),
      });
      const result = await createTossRefundRecoveryOperation({ lookup })(
        db,
        recoveryInput(contacted),
        RECOVERY_ENV,
      );
      expect(failureCode(result)).toBe("PERSISTENCE_CONFLICT");
      const state = await recoveryState(contacted);
      expect(state.command).toMatchObject({ status: "LEASED", leaseGeneration: 2 });
      expect(state.attempt.status).toBe("PROCESSING");
      expect(state.order.status).toBe("REFUND_PENDING");
      expect(state.evidence).toHaveLength(0);
    } finally {
      await dropCheck(table, constraint);
    }
  });

  it("rejects a PARKED provider-processing row before gates and GET", async () => {
    const contacted = await trackedFixture(fixtures);
    const state = await recoveryState(contacted);
    await db.refundExecutionEvidence.create({
      data: {
        commandId: contacted.fixture.commandId,
        source: RefundExecutionEvidenceSource.PROVIDER_LOOKUP,
        sourceDedupKey: `refund-provider-lookup:${contacted.fixture.commandId}:2`,
        outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
        application: RefundExecutionEvidenceApplication.PARKED,
        safeCode: "PROVIDER_PROCESSING",
        safeMessage: "Provider processing.",
        observedAt: new Date(),
        dispatchAttemptId: state.dispatch.id,
        authorizingLeaseGeneration: 2,
      },
    });
    let gets = 0;
    const result = await createTossRefundRecoveryOperation({
      lookup: exactSuccessLookup(contacted.fixture, () => { gets += 1; }),
    })(db, recoveryInput(contacted), {});
    expect(failureCode(result)).toBe("REFUND_LEDGER_INCONSISTENT");
    expect(gets).toBe(0);
  });
});

async function trackedFixture(fixtures: ContactedRecoveryFixture[]) {
  const fixture = await createContactedRecoveryFixture();
  fixtures.push(fixture);
  return fixture;
}

function recoveryInput(contacted: ContactedRecoveryFixture) {
  return { commandId: contacted.fixture.commandId, recoveryOwner: "recovery-test-owner" };
}

function failureCode(result: Awaited<ReturnType<ReturnType<typeof createTossRefundRecoveryOperation>>>) {
  return result.ok ? "<unexpected-success>" : result.code;
}

async function recoveryState(contacted: ContactedRecoveryFixture) {
  const commandId = contacted.fixture.commandId;
  const [order, attempt, command, dispatch, events, evidence] = await Promise.all([
    db.order.findUniqueOrThrow({ where: { id: contacted.fixture.orderId } }),
    db.refundAttempt.findUniqueOrThrow({ where: { id: contacted.fixture.refundAttemptId } }),
    db.refundExecutionCommand.findUniqueOrThrow({ where: { id: commandId } }),
    db.refundExecutionDispatchAttempt.findFirstOrThrow({ where: { commandId } }),
    db.refundExecutionCommandEvent.findMany({ where: { commandId } }),
    db.refundExecutionEvidence.findMany({ where: { commandId } }),
  ]);
  return { order, attempt, command, dispatch, events, evidence };
}

function safeSqlId(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Fixture id is not SQL-safe.");
  return value;
}

async function addScopedCheck(
  table: string,
  constraint: string,
  predicate: string,
): Promise<void> {
  if (!/^[A-Za-z]+$/.test(table) || !/^[a-z0-9_]+$/.test(constraint)) {
    throw new Error("Unsafe test constraint identifier.");
  }
  await db.$executeRawUnsafe(
    `ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" CHECK (${predicate})`,
  );
}

async function dropCheck(table: string, constraint: string): Promise<void> {
  if (!/^[A-Za-z]+$/.test(table) || !/^[a-z0-9_]+$/.test(constraint)) {
    throw new Error("Unsafe test constraint identifier.");
  }
  await db.$executeRawUnsafe(`ALTER TABLE "${table}" DROP CONSTRAINT "${constraint}"`);
}
