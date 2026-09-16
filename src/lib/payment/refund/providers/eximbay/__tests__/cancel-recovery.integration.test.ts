import {
  PaymentMode,
  PaymentProvider,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
} from "@prisma/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { syntheticEximbayProviderOrderId } from "@/lib/payment/__tests__/eximbay-fixture";
import {
  EXIMBAY_SANDBOX_API_KEY,
  EXIMBAY_SANDBOX_MID,
} from "@/lib/payment/providers/credentials";
import { encodeEximbayAmount } from "@/lib/payment/providers/eximbay/amount";
import { isRecord } from "@/lib/payment/providers/eximbay/validation";
import { acquireRefundExecutionLease, type RefundExecutionLeaseHandle } from "../../../acquire-lease";
import { reclaimUncontactedRefundExecution } from "../../../reclaim-uncontacted-execution";
import {
  REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED,
  REFUND_EXECUTION_LEASE_ENABLED,
  REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED,
  REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED,
  REFUND_EXECUTION_WORKER_ENABLED,
} from "../../../execution-activation";
import {
  runRefundExecutionWorkerCycle,
  type RefundExecutionWorkerDependencies,
} from "../../../run-refund-execution-worker-cycle";
import { selectRefundExecutionWorkerCandidates } from "../../../worker-selector";
import {
  cleanupDispatchFixtures,
  createDispatchFixture,
  type DispatchFixture,
} from "../../../__tests__/refund-dispatch-fixture";
import { runEximbayRefundReentryOnce } from "../../../run-eximbay-refund-reentry-once";
import { createEximbayFirstRefundDispatchAuthorizer } from "../authorize-first-dispatch";
import { createEximbayRefundContactExecutor } from "../execute-contact";
import { createEximbayRefundReconciler } from "../reconcile-refund";
import {
  EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING,
  EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING,
} from "../refund-worker-config";

const LEASE_ENV = Object.freeze({ [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED" });
const CONFIG = Object.freeze({
  mode: PaymentMode.SANDBOX,
  mid: "synthetic-merchant-mid",
  merchantAccountBindingId: "merchant-test-1",
  credentialGenerationBindingId: "generation-test-1",
});
const WORKER_EXIMBAY_ENV = Object.freeze({
  [REFUND_EXECUTION_WORKER_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: "ENABLED",
  [EXIMBAY_SANDBOX_API_KEY]: "synthetic-api-key-never-log",
  [EXIMBAY_SANDBOX_MID]: CONFIG.mid,
  [EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING]: CONFIG.merchantAccountBindingId,
  [EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING]:
    CONFIG.credentialGenerationBindingId,
});

type LeasedFixture = Readonly<{
  fixture: DispatchFixture;
  lease: RefundExecutionLeaseHandle;
  providerOrderId: string;
  r1RefundId: string;
  initialRetrieveCount: number;
}>;
type ReadyWorkerCandidate = Readonly<{
  fixture: DispatchFixture;
  providerOrderId: string;
}>;
type WorkerCallCounts = { toss: number; retrieve: number; cancel: number; lookup: number };

describe("dormant Eximbay cancel and refund-id recovery", () => {
  const fixtures: DispatchFixture[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || new URL(databaseUrl).pathname.replace(/^\//u, "") !== "wig_platform_test") {
      throw new Error("Eximbay recovery integration tests require wig_platform_test.");
    }
    expect(await db.$queryRaw<{ databaseName: string }[]>`
      SELECT current_database() AS "databaseName"
    `).toEqual([{ databaseName: "wig_platform_test" }]);
  });

  afterEach(async () => {
    await cleanupObservations(fixtures);
    await cleanupDispatchFixtures(...fixtures);
    fixtures.length = 0;
  });

  it("routes a synthetic READY candidate through generic lease, preflight, R1, and contact", async () => {
    const candidate = await readyEximbayCandidate(fixtures, 1_234, 1_234);
    const calls = { toss: 0, retrieve: 0, cancel: 0, lookup: 0 };
    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "eximbay-ready-worker" },
      workerDependencies(candidate, calls, {
        cancel: async () => {
          calls.cancel += 1;
          const dispatch = await db.refundExecutionDispatchAttempt.findUniqueOrThrow({
            where: { commandId_ordinal: { commandId: candidate.fixture.commandId, ordinal: 1 } },
          });
          expect(dispatch.state).toBe("CONTACT_MAY_HAVE_OCCURRED");
          return cancelSuccessForCandidate(candidate, dispatch.providerOperationKey, "worker-r1", 0);
        },
      }),
      { ...WORKER_EXIMBAY_ENV, [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED" },
    );

    expect(result).toMatchObject({
      ok: true,
      cycle: {
        readySelected: 1,
        succeededCount: 1,
        providerLookupCount: 1,
        providerCancellationCount: 1,
      },
    });
    expect(calls).toEqual({ toss: 0, retrieve: 1, cancel: 1, lookup: 0 });
    expect((await db.refundExecutionCommand.findUniqueOrThrow({
      where: { id: candidate.fixture.commandId },
    })).status).toBe("DONE");
  });

  it("classifies uncertain R1 contact as temporary and cannot blindly contact it again", async () => {
    const candidate = await readyEximbayCandidate(fixtures, 1_234, 1_234);
    const calls = { toss: 0, retrieve: 0, cancel: 0, lookup: 0 };
    const dependencies = workerDependencies(candidate, calls, {
      cancel: () => {
        calls.cancel += 1;
        return Promise.reject(new Error("synthetic response loss"));
      },
    });
    const env = { ...WORKER_EXIMBAY_ENV, [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED" };

    const first = await runRefundExecutionWorkerCycle(
      db, { workerOwner: "eximbay-uncertain-worker" }, dependencies, env,
    );
    const immediateReplay = await runRefundExecutionWorkerCycle(
      db, { workerOwner: "eximbay-immediate-replay" }, dependencies, env,
    );

    expect(first).toMatchObject({
      ok: true,
      cycle: { readySelected: 1, temporaryCount: 1, providerCancellationCount: 1 },
    });
    expect(immediateReplay).toMatchObject({
      ok: true,
      cycle: { selectedCount: 0, providerCancellationCount: 0 },
    });
    expect(calls.cancel).toBe(1);
    expect((await db.refundExecutionCommand.findUniqueOrThrow({
      where: { id: candidate.fixture.commandId },
    })).status).toBe("WAITING_EVIDENCE");
  });

  it("reclaims Eximbay ordinal-zero UNCONTACTED work without changing its logical identity", async () => {
    const candidate = await readyEximbayCandidate(fixtures, 1_234, 1_234);
    const abandoned = await acquireRefundExecutionLease(db, {
      commandId: candidate.fixture.commandId,
      leaseOwner: "eximbay-abandoned-worker",
    }, LEASE_ENV);
    if (!abandoned.ok) throw new Error(abandoned.code);
    await db.refundExecutionCommand.update({
      where: { id: candidate.fixture.commandId },
      data: { leaseUntil: new Date("2000-01-01T00:00:00.000Z") },
    });
    const calls = { toss: 0, retrieve: 0, cancel: 0, lookup: 0 };
    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "eximbay-uncontacted-worker" },
      workerDependencies(candidate, calls, {
        cancel: async () => {
          calls.cancel += 1;
          const dispatch = await db.refundExecutionDispatchAttempt.findUniqueOrThrow({
            where: { commandId_ordinal: { commandId: candidate.fixture.commandId, ordinal: 1 } },
          });
          return cancelSuccessForCandidate(candidate, dispatch.providerOperationKey, "worker-u1", 0);
        },
      }),
      { ...WORKER_EXIMBAY_ENV, [REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED]: "ENABLED" },
    );

    expect(result).toMatchObject({
      ok: true,
      cycle: { uncontactedSelected: 1, succeededCount: 1 },
    });
    const dispatches = await db.refundExecutionDispatchAttempt.findMany({
      where: { commandId: candidate.fixture.commandId },
    });
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0].leaseGeneration).toBe(abandoned.lease.leaseGeneration + 1);
    expect(calls).toEqual({ toss: 0, retrieve: 1, cancel: 1, lookup: 0 });
  });

  it("re-enters an expired authorized Eximbay R1 after process loss without new preflight or dispatch", async () => {
    const leased = await readyR1(fixtures, 1_234, 1_234);
    const before = await db.refundExecutionDispatchAttempt.findMany({
      where: { commandId: leased.fixture.commandId },
    });
    expect(leased.initialRetrieveCount).toBe(1);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({
      ordinal: 1,
      provider: "EXIMBAY",
      mode: "SANDBOX",
      state: "AUTHORIZED",
      contactMarkedAt: null,
    });
    expect((await selectRefundExecutionWorkerCandidates(
      db,
      { eximbayEnabled: true },
    )).UNCONTACTED).toEqual([]);

    await expireCommandLease(leased.fixture.commandId);
    expect(Object.values(await selectRefundExecutionWorkerCandidates(db)).flat()
      .some((candidate) => candidate.commandId === leased.fixture.commandId)).toBe(false);
    expect((await selectRefundExecutionWorkerCandidates(
      db,
      { eximbayEnabled: true },
    )).UNCONTACTED).toContainEqual({
      commandId: leased.fixture.commandId,
      candidateClass: "UNCONTACTED",
      provider: "EXIMBAY",
    });

    const candidate = { fixture: leased.fixture, providerOrderId: leased.providerOrderId };
    const calls = { toss: 0, retrieve: 0, cancel: 0, lookup: 0 };
    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "eximbay-authorized-r1-reentry" },
      workerDependencies(candidate, calls, {
        cancel: async () => {
          calls.cancel += 1;
          const [command, dispatch] = await Promise.all([
            db.refundExecutionCommand.findUniqueOrThrow({
              where: { id: leased.fixture.commandId },
            }),
            db.refundExecutionDispatchAttempt.findUniqueOrThrow({
              where: { commandId_ordinal: { commandId: leased.fixture.commandId, ordinal: 1 } },
            }),
          ]);
          expect(command.leaseGeneration).toBe(leased.lease.leaseGeneration + 1);
          expect(dispatch).toMatchObject({
            id: before[0].id,
            providerOperationKey: before[0].providerOperationKey,
            requestFingerprint: before[0].requestFingerprint,
            state: "CONTACT_MAY_HAVE_OCCURRED",
          });
          return cancelSuccessForCandidate(candidate, dispatch.providerOperationKey, "recovered-r1", 0);
        },
      }),
      { ...WORKER_EXIMBAY_ENV, [REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED]: "ENABLED" },
    );

    expect(result).toMatchObject({
      ok: true,
      cycle: {
        uncontactedSelected: 1,
        succeededCount: 1,
        providerLookupCount: 0,
        providerCancellationCount: 1,
      },
    });
    expect(calls).toEqual({ toss: 0, retrieve: 0, cancel: 1, lookup: 0 });
    const after = await db.refundExecutionDispatchAttempt.findMany({
      where: { commandId: leased.fixture.commandId },
    });
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({
      id: before[0].id,
      ordinal: 1,
      providerOperationKey: before[0].providerOperationKey,
      requestFingerprint: before[0].requestFingerprint,
    });
  });

  it("blocks the stale R1 lease token after authorized re-entry and accepts only the fresh fence", async () => {
    const leased = await readyR1(fixtures, 1_234, 1_234);
    await expireCommandLease(leased.fixture.commandId);
    const recovered = await reclaimUncontactedRefundExecution(db, {
      commandId: leased.fixture.commandId,
      recoveryOwner: "eximbay-authorized-r1-fence",
    }, { [REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED]: "ENABLED" });
    if (!recovered.ok) throw new Error(recovered.code);
    expect(recovered.recoveredState).toBe("AUTHORIZED_EXIMBAY_R1");
    expect(recovered.lease.leaseGeneration).toBe(leased.lease.leaseGeneration + 1);

    const candidate = { fixture: leased.fixture, providerOrderId: leased.providerOrderId };
    let cancelCalls = 0;
    const contact = createEximbayRefundContactExecutor({
      config: CONFIG,
      cancel: () => {
        cancelCalls += 1;
        return Promise.resolve(cancelSuccessForCandidate(
          candidate,
          leased.r1RefundId,
          "fresh-fence-r1",
          0,
        ));
      },
    });
    expect(await contact(db, contactInput(leased.lease, 1))).toMatchObject({
      ok: false,
      code: "REFUND_LEDGER_INCONSISTENT",
    });
    expect(cancelCalls).toBe(0);
    expect(await contact(db, contactInput(recovered.lease, 1))).toMatchObject({
      ok: true,
      state: "SUCCEEDED",
    });
    expect(cancelCalls).toBe(1);
  });

  it("keeps an uncertain recovered R1 in CONTACTED ownership with no same-cycle recancel", async () => {
    const leased = await readyR1(fixtures, 1_234, 1_234);
    await expireCommandLease(leased.fixture.commandId);
    const candidate = { fixture: leased.fixture, providerOrderId: leased.providerOrderId };
    const calls = { toss: 0, retrieve: 0, cancel: 0, lookup: 0 };
    const dependencies = workerDependencies(candidate, calls, {
      cancel: () => {
        calls.cancel += 1;
        return Promise.reject(new Error("synthetic recovered R1 response loss"));
      },
    });
    const env = {
      ...WORKER_EXIMBAY_ENV,
      [REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED]: "ENABLED",
    };
    const first = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "eximbay-recovered-r1-uncertain" },
      dependencies,
      env,
    );
    const immediate = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "eximbay-recovered-r1-immediate" },
      dependencies,
      env,
    );
    expect(first).toMatchObject({
      ok: true,
      cycle: { uncontactedSelected: 1, temporaryCount: 1, providerCancellationCount: 1 },
    });
    expect(immediate).toMatchObject({
      ok: true,
      cycle: { selectedCount: 0, providerCancellationCount: 0 },
    });
    expect(calls).toEqual({ toss: 0, retrieve: 0, cancel: 1, lookup: 0 });
    await makeLookupDue(leased.fixture, 1);
    const due = await selectRefundExecutionWorkerCandidates(db, { eximbayEnabled: true });
    expect(due.UNCONTACTED.some((row) => row.commandId === leased.fixture.commandId)).toBe(false);
    expect(due.CONTACTED).toContainEqual({
      commandId: leased.fixture.commandId,
      candidateClass: "CONTACTED",
      provider: "EXIMBAY",
    });
  });

  it("continues only exact reconciler-issued R2 authority and never creates R3", async () => {
    const leased = await readyR1(fixtures, 1_234, 1_234);
    await createEximbayRefundContactExecutor({
      config: CONFIG,
      cancel: () => Promise.reject(new Error("synthetic R1 response loss")),
    })(db, contactInput(leased.lease, 1));
    await makeLookupDue(leased.fixture, 1);
    const candidate = {
      fixture: leased.fixture,
      providerOrderId: leased.providerOrderId,
    };
    const calls = { toss: 0, retrieve: 0, cancel: 0, lookup: 0 };
    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "eximbay-r2-worker" },
      workerDependencies(candidate, calls, {
        lookup: () => {
          calls.lookup += 1;
          return Promise.resolve(refundLookupNone(leased));
        },
        cancel: async () => {
          calls.cancel += 1;
          const dispatch = await db.refundExecutionDispatchAttempt.findUniqueOrThrow({
            where: { commandId_ordinal: { commandId: leased.fixture.commandId, ordinal: 2 } },
          });
          expect(dispatch.state).toBe("CONTACT_MAY_HAVE_OCCURRED");
          return cancelSuccessForCandidate(candidate, dispatch.providerOperationKey, "worker-r2", 0);
        },
      }),
      WORKER_EXIMBAY_ENV,
    );

    expect(result).toMatchObject({
      ok: true,
      cycle: {
        contactedSelected: 1,
        succeededCount: 1,
        providerLookupCount: 1,
        providerCancellationCount: 1,
      },
    });
    const dispatches = await db.refundExecutionDispatchAttempt.findMany({
      where: { commandId: leased.fixture.commandId },
      orderBy: { ordinal: "asc" },
    });
    expect(dispatches).toHaveLength(2);
    expect(dispatches[1].providerOperationKey).not.toBe(dispatches[0].providerOperationKey);
    expect(calls).toEqual({ toss: 0, retrieve: 0, cancel: 1, lookup: 1 });
  });

  it("commits one contact marker before transport and applies exact cancel success", async () => {
    const leased = await readyR1(fixtures, 1_234, 1_234);
    let calls = 0;
    const execute = createEximbayRefundContactExecutor({
      config: CONFIG,
      cancel: async (_url, init) => {
        calls += 1;
        const dispatch = await db.refundExecutionDispatchAttempt.findFirstOrThrow({
          where: { commandId: leased.fixture.commandId, ordinal: 1 },
        });
        expect(dispatch.state).toBe("CONTACT_MAY_HAVE_OCCURRED");
        expect(dispatch.contactMarkedAt).not.toBeNull();
        expect((await db.refundExecutionCommand.findUniqueOrThrow({
          where: { id: leased.fixture.commandId },
        })).status).toBe("LEASED");
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return cancelSuccess(
          leased,
          leased.r1RefundId,
          "provider-refund-r1",
          0,
        );
      },
    });
    const result = await execute(db, contactInput(leased.lease, 1));
    expect(result).toEqual({ ok: true, state: "SUCCEEDED", replayed: false });
    const attempt = await db.refundAttempt.findUniqueOrThrow({
      where: { id: leased.fixture.refundAttemptId },
    });
    expect(attempt).toMatchObject({ status: "SUCCEEDED", providerRefundId: "provider-refund-r1" });
    const evidence = await db.refundExecutionEvidence.findMany({
      where: { commandId: leased.fixture.commandId },
    });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      source: "ADAPTER_RESPONSE",
      outcome: "SUCCEEDED",
      observedProviderRefundId: "provider-refund-r1",
    });
    const replay = await execute(db, contactInput(leased.lease, 1));
    expect(replay).toEqual({ ok: true, state: "SUCCEEDED", replayed: true });
    expect(calls).toBe(1);
  });

  it("returns parked for a committed direct cancel identity conflict without success effects", async () => {
    const owner = await readyR1(fixtures, 1_234, 1_234);
    await createEximbayRefundContactExecutor({
      config: CONFIG,
      cancel: () => Promise.resolve(cancelSuccess(owner, owner.r1RefundId, "shared-provider-refund", 0)),
    })(db, contactInput(owner.lease, 1));
    const leased = await readyR1(fixtures, 1_234, 1_234);
    let calls = 0;
    const execute = createEximbayRefundContactExecutor({
      config: CONFIG,
      cancel: () => {
        calls += 1;
        return Promise.resolve(cancelSuccess(leased, leased.r1RefundId, "shared-provider-refund", 0));
      },
    });
    const result = await execute(db, contactInput(leased.lease, 1));
    expect(result).toEqual({ ok: true, state: "PARKED", replayed: false });
    expect(await db.refundAttempt.findUniqueOrThrow({ where: { id: leased.fixture.refundAttemptId } }))
      .toMatchObject({ status: "MANUAL_REVIEW", providerRefundId: null });
    expect(await db.refundExecutionCommand.findUniqueOrThrow({ where: { id: leased.fixture.commandId } }))
      .toMatchObject({ status: "PARKED", leaseOwner: null, leaseUntil: null, leaseTokenHash: null });
    expect(await db.order.findUniqueOrThrow({ where: { id: leased.fixture.orderId } }))
      .toMatchObject({ status: "REFUND_PENDING" });
    expect(await db.refundExecutionEvidence.findMany({ where: { commandId: leased.fixture.commandId } }))
      .toMatchObject([{ outcome: "SUCCEEDED", application: "CONFLICT" }]);
    expect(await db.refundAttemptTransition.findMany({ where: {
      refundAttemptId: leased.fixture.refundAttemptId, fromStatus: "PROCESSING",
    } })).toMatchObject([{ toStatus: "MANUAL_REVIEW" }]);
    expect(await db.paymentOutbox.count({ where: { dedupKey: { contains: leased.fixture.refundAttemptId } } })).toBe(0);
    await execute(db, contactInput(leased.lease, 1));
    expect(calls).toBe(1);
  });

  it.each(["success", "conflict", "unknown", "persistence-failure"] as const)(
    "preserves %s disposition through the actual one-shot runner without retry", async (scenario) => {
      if (scenario === "conflict") {
        const owner = await readyR1(fixtures, 1_234, 1_234);
        await createEximbayRefundContactExecutor({
          config: CONFIG,
          cancel: () => Promise.resolve(cancelSuccess(owner, owner.r1RefundId, "runner-refund", 0)),
        })(db, contactInput(owner.lease, 1));
      }
      const candidate = await readyEximbayCandidate(fixtures, 1_234, 1_234);
      await db.checkoutSession.update({ where: { id: candidate.fixture.sessionId }, data: { communicationLocale: "en" } });
      const acquired = await acquireRefundExecutionLease(db, {
        commandId: candidate.fixture.commandId, leaseOwner: "runner-test",
      }, LEASE_ENV);
      if (!acquired.ok) throw new Error(acquired.code);
      const leased = { ...candidate, lease: acquired.lease, r1RefundId: "", initialRetrieveCount: 0 };
      if (scenario === "persistence-failure") {
        await db.$executeRawUnsafe(`CREATE FUNCTION disposition_test_fail() RETURNS trigger
          LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic deferred result failure'; END $$`);
        await db.$executeRawUnsafe(`CREATE CONSTRAINT TRIGGER disposition_test_fail
          AFTER INSERT ON "RefundAttemptTransition" DEFERRABLE INITIALLY DEFERRED
          FOR EACH ROW WHEN (NEW."toStatus" = 'SUCCEEDED') EXECUTE FUNCTION disposition_test_fail()`);
      }
      let calls = 0;
      try {
        const result = await runEximbayRefundReentryOnce({
          REFUND_EXECUTION_WORKER_ENABLED: "ENABLED",
          REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED: "ENABLED",
          REFUND_EXECUTION_LEASE_ENABLED: "ENABLED",
          REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED: "ENABLED",
          REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED: "ENABLED",
          REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED: "ENABLED",
          MIRA_REFUND_AUTHORIZATION_ENABLED: "ENABLED",
          CLOUD_RUN_TASK_COUNT: "1", CLOUD_RUN_TASK_INDEX: "0", CLOUD_RUN_TASK_ATTEMPT: "0",
        }, {
          createDatabase: () => db,
          disconnectDatabase: () => Promise.resolve(),
          admit: () => Promise.resolve({
            grantId: "synthetic-grant", releasePolicyDigest: "a".repeat(64), lease: leased.lease,
            account: { ...CONFIG, secretResource: "synthetic-secret", secretVersion: "1" },
          }),
          readSecret: () => Promise.resolve("synthetic-secret"),
          fetch: async () => {
            calls += 1;
            if (calls === 1) return preflightResponse(leased.fixture, leased.providerOrderId, 1_234);
            const dispatch = await db.refundExecutionDispatchAttempt.findFirstOrThrow({
              where: { commandId: leased.fixture.commandId },
            });
            leased.r1RefundId = dispatch.providerOperationKey;
            return scenario === "unknown" ? Promise.reject(new Error("synthetic timeout"))
              : Promise.resolve(cancelSuccess(leased, leased.r1RefundId, "runner-refund", 0));
          },
          runAdmission: async (_env, operation) => ({ outcome: "ACQUIRED", result: await operation() }),
        });
        expect(calls, JSON.stringify(result)).toBe(2);
        expect(result).toMatchObject({
          ok: scenario === "success",
          code: scenario === "success" ? "KNOWN_SUCCESS" : "CANCEL_CONTACT_MAY_HAVE_OCCURRED",
          terminalClass: scenario === "success" ? "REFUND_SUCCEEDED" : "PROVIDER_EFFECT_POSSIBLE",
          preflightRetrieveCount: 1, cancellationCount: 1, reconciliationLookupCount: 0,
          reentry: "FORBIDDEN",
        });
        const command = await db.refundExecutionCommand.findUniqueOrThrow({ where: { id: leased.fixture.commandId } });
        const statuses = { success: "DONE", conflict: "PARKED", unknown: "WAITING_EVIDENCE", "persistence-failure": "LEASED" };
        expect(command.status).toBe(statuses[scenario]);
        const dispatch = await db.refundExecutionDispatchAttempt.findFirstOrThrow({ where: { commandId: command.id } });
        expect(dispatch.state).toBe("CONTACT_MAY_HAVE_OCCURRED");
        expect(dispatch.contactMarkedAt).toBeInstanceOf(Date);
        expect(await db.paymentOutbox.count({ where: { dedupKey: { contains: leased.fixture.refundAttemptId } } }))
          .toBe(Number(scenario === "success"));
        if (scenario === "persistence-failure") {
          expect(await db.refundExecutionEvidence.count({ where: { commandId: command.id } })).toBe(0);
          expect(await db.refundAttempt.findUniqueOrThrow({ where: { id: leased.fixture.refundAttemptId } }))
            .toMatchObject({ status: "PROCESSING", providerRefundId: null });
          expect(await db.order.findUniqueOrThrow({ where: { id: leased.fixture.orderId } }))
            .toMatchObject({ status: "REFUND_PENDING" });
          expect(await db.refundAttemptTransition.count({ where: { refundAttemptId: leased.fixture.refundAttemptId, fromStatus: "PROCESSING" } })).toBe(0);
          expect(await db.paymentOutbox.count({ where: { dedupKey: { contains: leased.fixture.refundAttemptId } } })).toBe(0);
        }
      } finally {
        if (scenario === "persistence-failure") {
          await db.$executeRawUnsafe('DROP TRIGGER disposition_test_fail ON "RefundAttemptTransition"');
          await db.$executeRawUnsafe('DROP FUNCTION disposition_test_fail()');
        }
      }
    },
  );

  it("rejects a persisted refund_id outside its exact allocator before cancel transport", async () => {
    const leased = await readyR1(fixtures, 1_234, 1_234);
    await db.refundExecutionDispatchAttempt.update({
      where: { commandId_ordinal: { commandId: leased.fixture.commandId, ordinal: 1 } },
      data: { providerOperationKey: leased.r1RefundId.toUpperCase() },
    });
    let calls = 0;
    const execute = createEximbayRefundContactExecutor({
      config: CONFIG,
      cancel: () => {
        calls += 1;
        return Promise.reject(new Error("invalid refund_id must not contact Eximbay"));
      },
    });
    expect(await execute(db, contactInput(leased.lease, 1))).toEqual({
      ok: false,
      code: "REFUND_LEDGER_INCONSISTENT",
      message: "Eximbay refund aggregate is inconsistent.",
    });
    expect(calls).toBe(0);
    expect(await db.refundExecutionDispatchAttempt.findUniqueOrThrow({
      where: { commandId_ordinal: { commandId: leased.fixture.commandId, ordinal: 1 } },
    })).toMatchObject({ state: "AUTHORIZED", contactMarkedAt: null });
  });

  it("authorizes K2 only after exact R1 NONE, then parks R2 NONE with no R3", async () => {
    const leased = await readyR1(fixtures, 1_234, 1_234);
    const firstContact = createEximbayRefundContactExecutor({
      config: CONFIG,
      cancel: () => Promise.reject(new Error("ambiguous cancel")),
    });
    expect(await firstContact(db, contactInput(leased.lease, 1)))
      .toMatchObject({ ok: true, state: "WAITING_EVIDENCE" });
    await makeLookupDue(leased.fixture, 1);

    const lookupBodies: unknown[] = [];
    const reconcile = createEximbayRefundReconciler({
      config: CONFIG,
      lookup: (_url, init) => {
        lookupBodies.push(parseRequestBody(init?.body));
        return Promise.resolve(refundLookupNone(leased));
      },
    });
    const r2 = await reconcile(db, {
      commandId: leased.fixture.commandId,
      recoveryOwner: "eximbay-r1-lookup",
    });
    expect(r2).toMatchObject({ ok: true, state: "R2_AUTHORIZED", replayed: false });
    if (!r2.ok || !r2.authorization) throw new Error("Missing R2 authorization.");
    expect(refundIdFromBody(lookupBodies[0]))
      .toBe(leased.r1RefundId);
    const afterR2 = await db.refundExecutionDispatchAttempt.findMany({
      where: { commandId: leased.fixture.commandId }, orderBy: { ordinal: "asc" },
    });
    expect(afterR2.map((row) => [row.ordinal, row.state])).toEqual([
      [1, "CONTACT_MAY_HAVE_OCCURRED"],
      [2, "AUTHORIZED"],
    ]);
    expect(afterR2[0].providerOperationKey).toBe(leased.r1RefundId);
    expect(afterR2[1].providerOperationKey).not.toBe(leased.r1RefundId);
    expect(afterR2[0].requestFingerprint).not.toBe(afterR2[1].requestFingerprint);
    expect(await db.refundExecutionEvidence.findFirst({
      where: {
        commandId: leased.fixture.commandId,
        source: "PROVIDER_LOOKUP",
        outcome: "NOT_EXECUTED_RETRYABLE",
        dispatchAttemptId: afterR2[0].id,
      },
    })).not.toBeNull();

    const secondContact = createEximbayRefundContactExecutor({
      config: CONFIG,
      cancel: () => Promise.reject(new Error("ambiguous R2 cancel")),
    });
    expect(await secondContact(db, {
      commandId: r2.authorization.commandId,
      dispatchAttempt: 2,
      leaseGeneration: r2.authorization.leaseGeneration,
      leaseToken: r2.authorization.leaseToken,
    })).toMatchObject({ ok: true, state: "WAITING_EVIDENCE" });
    await makeLookupDue(leased.fixture, 2);
    const parked = await reconcile(db, {
      commandId: leased.fixture.commandId,
      recoveryOwner: "eximbay-r2-lookup",
    });
    expect(parked).toEqual({ ok: true, state: "PARKED", replayed: false });
    expect(refundIdFromBody(lookupBodies[1]))
      .toBe(afterR2[1].providerOperationKey);
    expect(await db.refundExecutionDispatchAttempt.count({
      where: { commandId: leased.fixture.commandId },
    })).toBe(2);
    expect(await db.refundAttempt.findUniqueOrThrow({
      where: { id: leased.fixture.refundAttemptId },
    })).toMatchObject({ status: "MANUAL_REVIEW", providerRefundId: null });
  });

  it("gives concurrent R2 admission exactly one winner", async () => {
    const leased = await readyR1(fixtures, 1_234, 1_234);
    await createEximbayRefundContactExecutor({
      config: CONFIG,
      cancel: () => Promise.reject(new Error("ambiguous cancel")),
    })(db, contactInput(leased.lease, 1));
    await makeLookupDue(leased.fixture, 1);
    let lookupCalls = 0;
    const reconcile = createEximbayRefundReconciler({
      config: CONFIG,
      lookup: () => {
        lookupCalls += 1;
        return Promise.resolve(refundLookupNone(leased));
      },
    });
    const results = await Promise.all([
      reconcile(db, { commandId: leased.fixture.commandId, recoveryOwner: "winner-a" }),
      reconcile(db, { commandId: leased.fixture.commandId, recoveryOwner: "winner-b" }),
    ]);
    expect(results.filter((row) => row.ok && row.state === "R2_AUTHORIZED")).toHaveLength(1);
    expect(lookupCalls).toBe(1);
    expect(await db.refundExecutionDispatchAttempt.count({
      where: { commandId: leased.fixture.commandId, ordinal: 2 },
    })).toBe(1);
  });

  it.each([
    ["missing", async (commandId: string) => {
      await db.refundExecutionEvidence.deleteMany({ where: {
        commandId,
        source: "PROVIDER_LOOKUP",
        outcome: "NOT_EXECUTED_RETRYABLE",
      } });
    }],
    ["wrong outcome", async (commandId: string) => {
      await db.refundExecutionEvidence.updateMany({
        where: {
          commandId,
          source: "PROVIDER_LOOKUP",
          outcome: "NOT_EXECUTED_RETRYABLE",
        },
        data: { outcome: "UNKNOWN" },
      });
    }],
  ])("rejects AUTHORIZED R2 contact when its R1 origin evidence is %s", async (_name, corrupt) => {
    const leased = await readyR1(fixtures, 1_234, 1_234);
    const r2 = await authorizeR2AfterNone(leased);
    expect(r2).toMatchObject({ ok: true, state: "R2_AUTHORIZED" });
    if (!r2.ok || !r2.authorization) throw new Error("Missing R2 authorization.");
    const before = await db.refundExecutionDispatchAttempt.findUniqueOrThrow({
      where: { commandId_ordinal: { commandId: leased.fixture.commandId, ordinal: 2 } },
    });
    expect(before).toMatchObject({ state: "AUTHORIZED", contactMarkedAt: null });

    await corrupt(leased.fixture.commandId);
    let cancelCalls = 0;
    const result = await createEximbayRefundContactExecutor({
      config: CONFIG,
      cancel: () => {
        cancelCalls += 1;
        return Promise.reject(new Error("invalid R2 origin must not contact Eximbay"));
      },
    })(db, {
      commandId: r2.authorization.commandId,
      dispatchAttempt: 2,
      leaseGeneration: r2.authorization.leaseGeneration,
      leaseToken: r2.authorization.leaseToken,
    });

    expect(result).toMatchObject({ ok: false, code: "REFUND_LEDGER_INCONSISTENT" });
    expect(cancelCalls).toBe(0);
    expect(await db.refundExecutionDispatchAttempt.findUniqueOrThrow({
      where: { commandId_ordinal: { commandId: leased.fixture.commandId, ordinal: 2 } },
    })).toMatchObject({
      providerOperationKey: before.providerOperationKey,
      state: "AUTHORIZED",
      contactMarkedAt: null,
    });
  });

  it("recovers a marker-only process death at +5s with one concurrent lookup permit", async () => {
    const leased = await readyR1(fixtures, 1_234, 1_234);
    await simulateMarkerOnlyCrash(leased.fixture, 1, 4_000);
    expect(await db.refundExecutionEvidence.count({
      where: { commandId: leased.fixture.commandId, source: "ADAPTER_RESPONSE" },
    })).toBe(0);
    let lookupCalls = 0;
    const reconcile = createEximbayRefundReconciler({
      config: CONFIG,
      lookup: () => {
        lookupCalls += 1;
        return Promise.reject(new Error("marker-only lookup unknown"));
      },
    });
    expect(await reconcile(db, {
      commandId: leased.fixture.commandId,
      recoveryOwner: "marker-only-too-early",
    })).toMatchObject({ ok: false, code: "LOOKUP_NOT_YET_DUE" });
    expect(lookupCalls).toBe(0);

    await setMarkerElapsed(leased.fixture, 1, 5_000);
    const results = await Promise.all([
      reconcile(db, {
        commandId: leased.fixture.commandId,
        recoveryOwner: "marker-only-winner-a",
      }),
      reconcile(db, {
        commandId: leased.fixture.commandId,
        recoveryOwner: "marker-only-winner-b",
      }),
    ]);
    expect(results.filter((row) => row.ok && row.state === "WAITING_EVIDENCE"))
      .toHaveLength(1);
    expect(lookupCalls).toBe(1);
    expect(await db.refundExecutionCommandEvent.count({ where: {
      commandId: leased.fixture.commandId,
      eventType: "RECOVERY_LEASE_ACQUIRED",
      dispatchAttempt: 1,
    } })).toBe(1);
    expect(await db.refundExecutionDispatchAttempt.count({
      where: { commandId: leased.fixture.commandId, ordinal: 2 },
    })).toBe(0);
  });

  it("rejects command ordinal 1 when an extra R2 row makes R1 non-tip", async () => {
    const leased = await readyR1(fixtures, 1_234, 1_234);
    await simulateMarkerOnlyCrash(leased.fixture, 1, 5_000);
    await db.refundExecutionDispatchAttempt.create({ data: {
      commandId: leased.fixture.commandId,
      ordinal: 2,
      leaseGeneration: leased.lease.leaseGeneration,
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX,
      providerOperationKey: `corrupt-tip-k2-${leased.fixture.refundAttemptId}`,
      requestFingerprint: "0".repeat(64),
      state: "AUTHORIZED",
      authorizedAt: await databaseNow(),
      contactMarkedAt: null,
    } });
    let lookupCalls = 0;
    const reconcile = createEximbayRefundReconciler({
      config: CONFIG,
      lookup: () => {
        lookupCalls += 1;
        return Promise.reject(new Error("must not contact lookup"));
      },
    });
    expect(await reconcile(db, {
      commandId: leased.fixture.commandId,
      recoveryOwner: "corrupt-sequence-tip",
    })).toEqual({
      ok: false,
      code: "REFUND_LEDGER_INCONSISTENT",
      message: "Eximbay refund reconciliation aggregate is inconsistent.",
    });
    expect(lookupCalls).toBe(0);
    expect(await db.refundExecutionEvidence.count({
      where: { commandId: leased.fixture.commandId },
    })).toBe(0);
    expect(await db.refundAttempt.findUniqueOrThrow({
      where: { id: leased.fixture.refundAttemptId },
    })).toMatchObject({ status: "PROCESSING", providerRefundId: null });
  });

  it("rejects R2 marker recovery after its exact R1 NONE evidence is removed", async () => {
    const leased = await readyR1(fixtures, 1_234, 1_234);
    const r2 = await authorizeR2AfterNone(leased);
    await db.refundExecutionEvidence.deleteMany({ where: {
      commandId: leased.fixture.commandId,
      source: "PROVIDER_LOOKUP",
      outcome: "NOT_EXECUTED_RETRYABLE",
    } });
    await simulateMarkerOnlyCrash(leased.fixture, 2, 5_000);
    let lookupCalls = 0;
    const reconcile = createEximbayRefundReconciler({
      config: CONFIG,
      lookup: () => {
        lookupCalls += 1;
        return Promise.reject(new Error("must not contact lookup"));
      },
    });
    expect(r2).toMatchObject({ ok: true, state: "R2_AUTHORIZED" });
    expect(await reconcile(db, {
      commandId: leased.fixture.commandId,
      recoveryOwner: "corrupt-r2-origin",
    })).toMatchObject({ ok: false, code: "REFUND_LEDGER_INCONSISTENT" });
    expect(lookupCalls).toBe(0);
    expect(await db.refundExecutionEvidence.count({ where: {
      commandId: leased.fixture.commandId,
      source: "PROVIDER_LOOKUP",
    } })).toBe(0);
    expect(await db.refundAttempt.findUniqueOrThrow({
      where: { id: leased.fixture.refundAttemptId },
    })).toMatchObject({ status: "PROCESSING", providerRefundId: null });
  });

  it("recovers a lawful marker-only R2 with one concurrent lookup permit", async () => {
    const leased = await readyR1(fixtures, 1_234, 1_234);
    expect(await authorizeR2AfterNone(leased))
      .toMatchObject({ ok: true, state: "R2_AUTHORIZED" });
    await simulateMarkerOnlyCrash(leased.fixture, 2, 5_000);
    expect(await db.refundExecutionEvidence.count({ where: {
      commandId: leased.fixture.commandId,
      source: "ADAPTER_RESPONSE",
      dispatchAttempt: { ordinal: 2 },
    } })).toBe(0);
    let lookupCalls = 0;
    const reconcile = createEximbayRefundReconciler({
      config: CONFIG,
      lookup: () => {
        lookupCalls += 1;
        return Promise.reject(new Error("marker-only R2 lookup unknown"));
      },
    });
    const results = await Promise.all([
      reconcile(db, {
        commandId: leased.fixture.commandId,
        recoveryOwner: "marker-only-r2-winner-a",
      }),
      reconcile(db, {
        commandId: leased.fixture.commandId,
        recoveryOwner: "marker-only-r2-winner-b",
      }),
    ]);
    expect(results.filter((row) => row.ok && row.state === "WAITING_EVIDENCE"))
      .toHaveLength(1);
    expect(lookupCalls).toBe(1);
    expect(await db.refundExecutionCommandEvent.count({ where: {
      commandId: leased.fixture.commandId,
      eventType: "RECOVERY_LEASE_ACQUIRED",
      dispatchAttempt: 2,
    } })).toBe(1);
    expect(await db.refundExecutionDispatchAttempt.count({
      where: { commandId: leased.fixture.commandId },
    })).toBe(2);
  });

  it("authorizes R2 after marker-only R1 and exact NONE", async () => {
    const leased = await readyR1(fixtures, 1_234, 1_234);
    await simulateMarkerOnlyCrash(leased.fixture, 1, 5_000);
    const reconcile = createEximbayRefundReconciler({
      config: CONFIG,
      lookup: () => Promise.resolve(refundLookupNone(leased, "12.34")),
    });
    const result = await reconcile(db, {
      commandId: leased.fixture.commandId,
      recoveryOwner: "marker-only-none",
    });
    expect(result).toMatchObject({ ok: true, state: "R2_AUTHORIZED", replayed: false });
    expect(await db.refundExecutionEvidence.findFirstOrThrow({
      where: { commandId: leased.fixture.commandId, source: "PROVIDER_LOOKUP" },
    })).toMatchObject({ outcome: "NOT_EXECUTED_RETRYABLE", application: "PARKED" });
    expect(await db.refundExecutionDispatchAttempt.count({
      where: { commandId: leased.fixture.commandId, ordinal: 2 },
    })).toBe(1);
  });

  it("finalizes marker-only R1 from exact FOUND and forbids R2", async () => {
    const leased = await readyR1(fixtures, 1_234, 1_234);
    await simulateMarkerOnlyCrash(leased.fixture, 1, 5_000);
    const reconcile = createEximbayRefundReconciler({
      config: CONFIG,
      lookup: () => Promise.resolve(refundLookupFound(
        leased,
        leased.r1RefundId,
        "provider-refund-marker-only",
        "0.00",
      )),
    });
    expect(await reconcile(db, {
      commandId: leased.fixture.commandId,
      recoveryOwner: "marker-only-found",
    })).toEqual({ ok: true, state: "SUCCEEDED", replayed: false });
    expect(await db.refundExecutionDispatchAttempt.count({
      where: { commandId: leased.fixture.commandId },
    })).toBe(1);
  });

  it.each([
    ["malformed", "NOT_MONEY"],
    ["drifted", "0.50"],
  ])("parks marker-only NONE with %s balance and never authorizes R2", async (_name, balance) => {
    const leased = await readyR1(fixtures, 100, 100);
    await simulateMarkerOnlyCrash(leased.fixture, 1, 5_000);
    const reconcile = createEximbayRefundReconciler({
      config: CONFIG,
      lookup: () => Promise.resolve(refundLookupNone(leased, balance)),
    });
    expect(await reconcile(db, {
      commandId: leased.fixture.commandId,
      recoveryOwner: `marker-only-${_name}-balance`,
    })).toEqual({ ok: true, state: "PARKED", replayed: false });
    expect(await db.refundExecutionDispatchAttempt.count({
      where: { commandId: leased.fixture.commandId },
    })).toBe(1);
  });

  it("applies exact lookup FOUND once and forbids R2", async () => {
    const leased = await readyR1(fixtures, 1_234, 1_234);
    await createEximbayRefundContactExecutor({
      config: CONFIG,
      cancel: () => Promise.reject(new Error("ambiguous cancel")),
    })(db, contactInput(leased.lease, 1));
    await makeLookupDue(leased.fixture, 1);
    let calls = 0;
    const reconcile = createEximbayRefundReconciler({
      config: CONFIG,
      lookup: () => {
        calls += 1;
        return Promise.resolve(refundLookupFound(
          leased,
          leased.r1RefundId,
          "provider-refund-from-lookup",
        ));
      },
    });
    expect(await reconcile(db, {
      commandId: leased.fixture.commandId,
      recoveryOwner: "found-lookup",
    })).toEqual({ ok: true, state: "SUCCEEDED", replayed: false });
    expect(await reconcile(db, {
      commandId: leased.fixture.commandId,
      recoveryOwner: "found-replay",
    })).toEqual({ ok: true, state: "SUCCEEDED", replayed: true });
    expect(calls).toBe(1);
    expect(await db.refundExecutionDispatchAttempt.count({
      where: { commandId: leased.fixture.commandId },
    })).toBe(1);
    expect(await db.refundAttempt.findUniqueOrThrow({
      where: { id: leased.fixture.refundAttemptId },
    })).toMatchObject({
      status: "SUCCEEDED",
      providerRefundId: "provider-refund-from-lookup",
    });
    const evidence = await db.refundExecutionEvidence.findMany({
      where: { commandId: leased.fixture.commandId }, orderBy: { createdAt: "asc" },
    });
    expect(evidence.filter((row) => row.source === "PROVIDER_LOOKUP")).toHaveLength(1);
    const lookupEvidence = evidence.at(-1);
    expect(lookupEvidence).toMatchObject({
      source: "PROVIDER_LOOKUP",
      outcome: "SUCCEEDED",
      observedProviderRefundId: "provider-refund-from-lookup",
    });
    expect(lookupEvidence?.dispatchAttemptId).toBeTruthy();
  });

  it("parks an exact lookup identity conflict and never authorizes R2", async () => {
    const leased = await readyR1(fixtures, 1_234, 1_234);
    await createEximbayRefundContactExecutor({
      config: CONFIG,
      cancel: () => Promise.reject(new Error("ambiguous cancel")),
    })(db, contactInput(leased.lease, 1));
    await makeLookupDue(leased.fixture, 1);
    const reconcile = createEximbayRefundReconciler({
      config: CONFIG,
      lookup: () => Promise.resolve(refundLookupFound(
        leased,
        "wrong-merchant-refund-id",
        "provider-refund-conflict",
      )),
    });
    expect(await reconcile(db, {
      commandId: leased.fixture.commandId,
      recoveryOwner: "conflict-lookup",
    })).toEqual({ ok: true, state: "PARKED", replayed: false });
    expect(await db.refundExecutionDispatchAttempt.count({
      where: { commandId: leased.fixture.commandId },
    })).toBe(1);
    expect(await db.refundExecutionEvidence.findFirstOrThrow({
      where: { commandId: leased.fixture.commandId, source: "PROVIDER_LOOKUP" },
    })).toMatchObject({
      outcome: "UNKNOWN",
      application: "CONFLICT",
      observedProviderRefundId: null,
    });
  });

  it("enforces due time, three lookup permits, fourth contact zero, and parks unknown", async () => {
    const leased = await readyR1(fixtures, 1_234, 1_234);
    await createEximbayRefundContactExecutor({
      config: CONFIG,
      cancel: () => Promise.reject(new Error("ambiguous cancel")),
    })(db, contactInput(leased.lease, 1));
    let calls = 0;
    const reconcile = createEximbayRefundReconciler({
      config: CONFIG,
      lookup: () => {
        calls += 1;
        return Promise.reject(new Error("ambiguous lookup"));
      },
    });
    expect(await reconcile(db, {
      commandId: leased.fixture.commandId,
      recoveryOwner: "too-early",
    })).toMatchObject({ ok: false, code: "LOOKUP_NOT_YET_DUE" });
    expect(calls).toBe(0);
    for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
      await makeLookupDue(leased.fixture, 1);
      const result = await reconcile(db, {
        commandId: leased.fixture.commandId,
        recoveryOwner: `lookup-${ordinal}`,
      });
      expect(result).toMatchObject({
        ok: true,
        state: ordinal === 3 ? "PARKED" : "WAITING_EVIDENCE",
      });
    }
    expect(calls).toBe(3);
    expect(await reconcile(db, {
      commandId: leased.fixture.commandId,
      recoveryOwner: "lookup-4",
    })).toEqual({ ok: true, state: "PARKED", replayed: true });
    expect(calls).toBe(3);
    expect(await db.refundExecutionCommandEvent.count({ where: {
      commandId: leased.fixture.commandId,
      eventType: "RECOVERY_LEASE_ACQUIRED",
      dispatchAttempt: 1,
    } })).toBe(3);
    expect(await db.refundExecutionDispatchAttempt.count({
      where: { commandId: leased.fixture.commandId },
    })).toBe(1);
  });

  it("exhausts marker-only lookup at three contacts and never creates R2", async () => {
    const leased = await readyR1(fixtures, 1_234, 1_234);
    await simulateMarkerOnlyCrash(leased.fixture, 1, 5_000);
    let calls = 0;
    const reconcile = createEximbayRefundReconciler({
      config: CONFIG,
      lookup: () => {
        calls += 1;
        return Promise.reject(new Error("marker-only lookup unknown"));
      },
    });
    for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
      await makeLookupDue(leased.fixture, 1);
      expect(await reconcile(db, {
        commandId: leased.fixture.commandId,
        recoveryOwner: `marker-only-lookup-${ordinal}`,
      })).toMatchObject({
        ok: true,
        state: ordinal === 3 ? "PARKED" : "WAITING_EVIDENCE",
      });
    }
    expect(calls).toBe(3);
    expect(await db.refundExecutionDispatchAttempt.count({
      where: { commandId: leased.fixture.commandId },
    })).toBe(1);
  });

  it.each([
    ["succeeded", RefundExecutionEvidenceOutcome.SUCCEEDED,
      RefundExecutionEvidenceApplication.PARKED, 1],
    ["conflicting", RefundExecutionEvidenceOutcome.UNKNOWN,
      RefundExecutionEvidenceApplication.CONFLICT, 1],
    ["multiple", RefundExecutionEvidenceOutcome.UNKNOWN,
      RefundExecutionEvidenceApplication.PARKED, 2],
    ["wrong-dispatch provenance", RefundExecutionEvidenceOutcome.UNKNOWN,
      RefundExecutionEvidenceApplication.PARKED, 1],
  ])("does not reinterpret %s adapter evidence as marker-only", async (
    _name,
    outcome,
    application,
    count,
  ) => {
    const leased = await readyR1(fixtures, 1_234, 1_234);
    await simulateMarkerOnlyCrash(leased.fixture, 1, 5_000);
    const dispatch = await db.refundExecutionDispatchAttempt.findUniqueOrThrow({
      where: { commandId_ordinal: { commandId: leased.fixture.commandId, ordinal: 1 } },
    });
    for (let index = 0; index < count; index += 1) {
      await db.refundExecutionEvidence.create({ data: {
        commandId: leased.fixture.commandId,
        source: "ADAPTER_RESPONSE",
        sourceDedupKey: `tampered-adapter:${leased.fixture.commandId}:${index}`,
        outcome,
        application,
        observedProviderRefundId: outcome === RefundExecutionEvidenceOutcome.SUCCEEDED
          ? `provider-refund-tampered-${index}`
          : null,
        reportedAmount: outcome === RefundExecutionEvidenceOutcome.SUCCEEDED ? 1_234 : null,
        reportedCurrency: outcome === RefundExecutionEvidenceOutcome.SUCCEEDED ? "USD" : null,
        safeCode: outcome === RefundExecutionEvidenceOutcome.UNKNOWN ? "TAMPERED" : null,
        safeMessage: null,
        observedAt: await databaseNow(),
        dispatchAttemptId: dispatch.id,
        authorizingLeaseGeneration: dispatch.leaseGeneration,
      } });
    }
    let lookupCalls = 0;
    const reconcile = createEximbayRefundReconciler({
      config: CONFIG,
      lookup: () => {
        lookupCalls += 1;
        return Promise.reject(new Error("must not contact lookup"));
      },
    });
    expect(await reconcile(db, {
      commandId: leased.fixture.commandId,
      recoveryOwner: `tampered-${_name}`,
    })).toMatchObject({ ok: false, code: "REFUND_LEDGER_INCONSISTENT" });
    expect(lookupCalls).toBe(0);
  });
});

async function readyR1(
  fixtures: DispatchFixture[],
  totalAmount: number,
  targetAmount: number,
): Promise<LeasedFixture> {
  const candidate = await readyEximbayCandidate(fixtures, totalAmount, targetAmount);
  const { fixture, providerOrderId } = candidate;
  const leased = await acquireRefundExecutionLease(db, {
    commandId: fixture.commandId,
    leaseOwner: "eximbay-cancel-test",
  }, LEASE_ENV);
  if (!leased.ok) throw new Error(leased.code);
  let initialRetrieveCount = 0;
  const authorizer = createEximbayFirstRefundDispatchAuthorizer({
    config: CONFIG,
    retrieve: () => {
      initialRetrieveCount += 1;
      return Promise.resolve(preflightResponse(fixture, providerOrderId, totalAmount));
    },
  });
  const authorized = await authorizer(db, {
    commandId: leased.lease.commandId,
    leaseGeneration: leased.lease.leaseGeneration,
    leaseToken: leased.lease.leaseToken,
  });
  if (!authorized.ok) throw new Error(authorized.code);
  const r1 = await db.refundExecutionDispatchAttempt.findUniqueOrThrow({
    where: { commandId_ordinal: { commandId: fixture.commandId, ordinal: 1 } },
  });
  return {
    fixture,
    lease: leased.lease,
    providerOrderId,
    r1RefundId: r1.providerOperationKey,
    initialRetrieveCount,
  };
}

async function readyEximbayCandidate(
  fixtures: DispatchFixture[],
  totalAmount: number,
  targetAmount: number,
): Promise<ReadyWorkerCandidate> {
  const fixture = await createDispatchFixture({ totalAmount, targetAmount });
  fixtures.push(fixture);
  await seedEximbayPayment(fixture);
  await Promise.all([
    db.order.update({ where: { id: fixture.orderId }, data: { currency: "USD" } }),
    db.refundAttempt.update({
      where: { id: fixture.refundAttemptId },
      data: { currency: "USD", provider: PaymentProvider.EXIMBAY, mode: PaymentMode.SANDBOX },
    }),
  ]);
  const payment = await db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } });
  if (!payment.providerOrderId) throw new Error("Missing provider order id.");
  return Object.freeze({ fixture, providerOrderId: payment.providerOrderId });
}

function workerDependencies(
  candidate: ReadyWorkerCandidate,
  calls: WorkerCallCounts,
  overrides: Readonly<{
    cancel?: NonNullable<RefundExecutionWorkerDependencies["eximbay"]>["cancellation"];
    lookup?: NonNullable<RefundExecutionWorkerDependencies["eximbay"]>["lookup"];
  }> = Object.freeze({}),
): RefundExecutionWorkerDependencies {
  return Object.freeze({
    lookup: () => {
      calls.toss += 1;
      return Promise.reject(new Error("Toss lookup must remain unreachable"));
    },
    cancellation: () => {
      calls.toss += 1;
      return Promise.reject(new Error("Toss cancellation must remain unreachable"));
    },
    eximbay: Object.freeze({
      config: CONFIG,
      retrieve: () => {
        calls.retrieve += 1;
        return Promise.resolve(preflightResponse(
          candidate.fixture,
          candidate.providerOrderId,
          candidate.fixture.totalAmount,
        ));
      },
      cancellation: overrides.cancel ?? (() => {
        calls.cancel += 1;
        return Promise.reject(new Error("Unexpected Eximbay cancellation"));
      }),
      lookup: overrides.lookup ?? (() => {
        calls.lookup += 1;
        return Promise.reject(new Error("Unexpected Eximbay lookup"));
      }),
    }),
  });
}

async function authorizeR2AfterNone(leased: LeasedFixture) {
  await createEximbayRefundContactExecutor({
    config: CONFIG,
    cancel: () => Promise.reject(new Error("ambiguous R1 cancel")),
  })(db, contactInput(leased.lease, 1));
  await makeLookupDue(leased.fixture, 1);
  return createEximbayRefundReconciler({
    config: CONFIG,
    lookup: () => Promise.resolve(refundLookupNone(leased)),
  })(db, {
    commandId: leased.fixture.commandId,
    recoveryOwner: "authorize-r2-after-none",
  });
}

function parseRequestBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string") throw new Error("Expected JSON string request body.");
  const value: unknown = JSON.parse(body);
  return value;
}

function refundIdFromBody(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.payment)) return null;
  return typeof value.payment.refund_id === "string" ? value.payment.refund_id : null;
}

async function seedEximbayPayment(fixture: DispatchFixture): Promise<void> {
  await requireDisposableDatabase();
  await db.$executeRawUnsafe(
    `ALTER TABLE "Payment" DISABLE TRIGGER "Payment_provider_order_id_immutable"`,
  );
  try {
    await db.payment.update({
      where: { id: fixture.paymentId },
      data: {
        currency: "USD",
        provider: PaymentProvider.EXIMBAY,
        mode: PaymentMode.SANDBOX,
        providerOrderId: syntheticEximbayProviderOrderId(),
      },
    });
  } finally {
    await db.$executeRawUnsafe(
      `ALTER TABLE "Payment" ENABLE TRIGGER "Payment_provider_order_id_immutable"`,
    );
  }
}

function preflightResponse(
  fixture: DispatchFixture,
  providerOrderId: string,
  balance: number,
): Response {
  return jsonResponse({
    rescode: "0000",
    resmsg: "Success.",
    mid: CONFIG.mid,
    payment: {
      order_id: providerOrderId,
      currency: "USD",
      amount: encodeEximbayAmount("USD", fixture.totalAmount),
      transaction_id: fixture.providerPaymentKey,
      status: "SALE",
      transaction_date: "20260821112233",
      balance: encodeEximbayAmount("USD", balance),
    },
  });
}

function cancelSuccess(
  leased: LeasedFixture,
  refundId: string,
  providerRefundId: string,
  resultingBalance: number,
): Response {
  return jsonResponse({
    rescode: "0000",
    resmsg: "Success.",
    mid: CONFIG.mid,
    refund: {
      refund_amount: encodeEximbayAmount("USD", leased.fixture.targetAmount),
      refund_id: refundId,
      refund_date: "20260821112233",
      refund_transaction_id: providerRefundId,
    },
    payment: {
      order_id: leased.providerOrderId,
      currency: "USD",
      amount: encodeEximbayAmount("USD", leased.fixture.totalAmount),
      transaction_id: leased.fixture.providerPaymentKey,
      balance: resultingBalance === 0
        ? "0.00"
        : encodeEximbayAmount("USD", resultingBalance),
    },
  });
}

function cancelSuccessForCandidate(
  candidate: ReadyWorkerCandidate,
  refundId: string,
  providerRefundId: string,
  resultingBalance: number,
): Response {
  return jsonResponse({
    rescode: "0000",
    resmsg: "Success.",
    mid: CONFIG.mid,
    refund: {
      refund_amount: encodeEximbayAmount("USD", candidate.fixture.targetAmount),
      refund_id: refundId,
      refund_date: "20260821112233",
      refund_transaction_id: providerRefundId,
    },
    payment: {
      order_id: candidate.providerOrderId,
      currency: "USD",
      amount: encodeEximbayAmount("USD", candidate.fixture.totalAmount),
      transaction_id: candidate.fixture.providerPaymentKey,
      balance: resultingBalance === 0
        ? "0.00"
        : encodeEximbayAmount("USD", resultingBalance),
    },
  });
}

function refundLookupNone(leased: LeasedFixture, balance?: string): Response {
  return jsonResponse({
    rescode: "0000",
    resmsg: "Success.",
    mid: CONFIG.mid,
    payment: {
      status: "NONE",
      order_id: leased.providerOrderId,
      currency: "USD",
      amount: encodeEximbayAmount("USD", leased.fixture.totalAmount),
      transaction_id: leased.fixture.providerPaymentKey,
      transaction_date: "20260821112233",
      ...(balance === undefined ? {} : { balance }),
    },
  });
}

function refundLookupFound(
  leased: LeasedFixture,
  refundId: string,
  providerRefundId: string,
  balance?: string,
): Response {
  return jsonResponse({
    rescode: "0000",
    resmsg: "Success.",
    mid: CONFIG.mid,
    payment: {
      status: "REFUND",
      order_id: leased.providerOrderId,
      currency: "USD",
      amount: encodeEximbayAmount("USD", leased.fixture.totalAmount),
      transaction_id: leased.fixture.providerPaymentKey,
      transaction_date: "20260821112233",
      refund_id: refundId,
      refund_transaction_id: providerRefundId,
      refund_amount: encodeEximbayAmount("USD", leased.fixture.targetAmount),
      ...(balance === undefined ? {} : { balance }),
    },
  });
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function contactInput(lease: RefundExecutionLeaseHandle, dispatchAttempt: 1 | 2) {
  return {
    commandId: lease.commandId,
    dispatchAttempt,
    leaseGeneration: lease.leaseGeneration,
    leaseToken: lease.leaseToken,
  };
}

async function expireCommandLease(commandId: string): Promise<void> {
  await db.refundExecutionCommand.update({
    where: { id: commandId },
    data: { leaseUntil: new Date("2000-01-01T00:00:00.000Z") },
  });
}

async function makeLookupDue(fixture: DispatchFixture, ordinal: 1 | 2): Promise<void> {
  const past = new Date(Date.now() - 5 * 60_000);
  await db.refundExecutionDispatchAttempt.updateMany({
    where: { commandId: fixture.commandId, ordinal },
    data: { authorizedAt: past, contactMarkedAt: past },
  });
  await db.refundExecutionCommand.updateMany({
    where: { id: fixture.commandId, status: "WAITING_EVIDENCE" },
    data: { availableAt: past },
  });
}

async function simulateMarkerOnlyCrash(
  fixture: DispatchFixture,
  ordinal: 1 | 2,
  elapsedMs: number,
): Promise<void> {
  const now = await databaseNow();
  const contactMarkedAt = new Date(now.getTime() - elapsedMs);
  await db.refundExecutionDispatchAttempt.updateMany({
    where: { commandId: fixture.commandId, ordinal, state: "AUTHORIZED" },
    data: { state: "CONTACT_MAY_HAVE_OCCURRED", authorizedAt: contactMarkedAt, contactMarkedAt },
  });
  await db.refundExecutionCommand.update({
    where: { id: fixture.commandId },
    data: { leaseUntil: new Date(contactMarkedAt.getTime() - 1) },
  });
}

async function setMarkerElapsed(
  fixture: DispatchFixture,
  ordinal: 1 | 2,
  elapsedMs: number,
): Promise<void> {
  const now = await databaseNow();
  await db.refundExecutionDispatchAttempt.updateMany({
    where: { commandId: fixture.commandId, ordinal },
    data: {
      authorizedAt: new Date(now.getTime() - elapsedMs),
      contactMarkedAt: new Date(now.getTime() - elapsedMs),
    },
  });
}

async function databaseNow(): Promise<Date> {
  const rows = await db.$queryRaw<{ capturedAt: Date }[]>`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `;
  if (rows.length !== 1) throw new Error("Unable to capture test database time.");
  return rows[0].capturedAt;
}

async function cleanupObservations(fixtures: readonly DispatchFixture[]): Promise<void> {
  if (fixtures.length === 0) return;
  await requireDisposableDatabase();
  const bindings = await db.refundExecutionProviderOperationBinding.findMany({
    where: { refundAttemptId: { in: fixtures.map((fixture) => fixture.refundAttemptId) } },
    select: { id: true },
  });
  await db.$executeRawUnsafe(
    `ALTER TABLE "RefundExecutionEximbayPreflightObservation" DISABLE TRIGGER "EximbayPreflight_immutable"`,
  );
  try {
    await db.refundExecutionEximbayPreflightObservation.deleteMany({
      where: { bindingId: { in: bindings.map((binding) => binding.id) } },
    });
  } finally {
    await db.$executeRawUnsafe(
      `ALTER TABLE "RefundExecutionEximbayPreflightObservation" ENABLE TRIGGER "EximbayPreflight_immutable"`,
    );
  }
}

async function requireDisposableDatabase(): Promise<void> {
  const rows = await db.$queryRaw<{ databaseName: string }[]>`
    SELECT current_database() AS "databaseName"
  `;
  if (rows.length !== 1 || rows[0].databaseName !== "wig_platform_test") {
    throw new Error("Eximbay recovery tests require wig_platform_test.");
  }
}
