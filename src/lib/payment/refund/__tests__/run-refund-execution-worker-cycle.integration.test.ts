import {
  PaymentMode,
  PaymentProvider,
  RefundExecutionCommandEventType,
  RefundExecutionDispatchAttemptState,
} from "@prisma/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { acquireRefundExecutionLease } from "../acquire-lease";
import {
  REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_LEASE_ENABLED,
  REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED,
  REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_TOSS_CONTACT_ENABLED,
  REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED,
  REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED,
  REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED,
  REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED,
  REFUND_EXECUTION_WORKER_ENABLED,
} from "../execution-activation";
import { createTossRefundExecutionAuthorizer } from "../providers/toss/refund-authorization-orchestrator";
import { createTossRefundContactExecutor } from "../providers/toss/refund-contact-orchestrator";
import type { TossRefundCancellationPort } from "../providers/toss/refund-cancellation-http";
import type { TossRefundLookupPort } from "../providers/toss/refund-lookup-http";
import { TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS } from "../providers/toss/refund-recovery-policy";
import {
  runRefundExecutionWorkerCycle,
  type RefundExecutionWorkerCycleCounters,
  type RefundExecutionWorkerCycleResult,
} from "../run-refund-execution-worker-cycle";
import { selectRefundExecutionWorkerCandidates } from "../worker-selector";
import {
  cleanupDispatchFixtures,
  createDispatchFixture,
  dispatchState,
  redactedDispatchAuthorizationState,
  type DispatchFixture,
} from "./refund-dispatch-fixture";
import {
  createNamedDbSession,
  disconnectSessions,
  queueBehindObservedOrderLock,
} from "./refund-order-lock-barrier";

const CREDENTIALS = {
  TOSS_SANDBOX_SECRET_KEY: "synthetic_test_secret",
  TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: "merchant-test",
  TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "generation-1",
};
const DOWNSTREAM_ENV = {
  ...CREDENTIALS,
  [REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_CONTACT_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: "ENABLED",
};
const READY_ENV = {
  ...DOWNSTREAM_ENV,
  [REFUND_EXECUTION_WORKER_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED",
};
const UNCONTACTED_ENV = {
  ...DOWNSTREAM_ENV,
  [REFUND_EXECUTION_WORKER_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED]: "ENABLED",
};
const CONTACTED_ENV = {
  ...CREDENTIALS,
  [REFUND_EXECUTION_WORKER_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: "ENABLED",
};
const CONTACTED_RECONTACT_ENV = {
  ...CONTACTED_ENV,
  [REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED]: "ENABLED",
};
const EXPIRED = new Date("2000-01-01T00:00:00.000Z");

describe("runRefundExecutionWorkerCycle integration", () => {
  const fixtures: DispatchFixture[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || new URL(databaseUrl).pathname.replace(/^\//, "") !== "wig_platform_test") {
      throw new Error("Refund worker integration tests require wig_platform_test.");
    }
    const rows = await db.$queryRaw<{ databaseName: string }[]>`
      SELECT current_database() AS "databaseName"
    `;
    expect(rows).toEqual([{ databaseName: "wig_platform_test" }]);
  });

  afterEach(async () => {
    await cleanupDispatchFixtures(...fixtures);
    fixtures.length = 0;
  });

  it("returns before selection or financial work when the worker gate is disabled or malformed", async () => {
    const fixture = await tossFixture(fixtures);
    const before = await dispatchState(fixture);
    const calls = { get: 0, post: 0 };
    const dependencies = ports(fixture, calls);

    expect(await runRefundExecutionWorkerCycle(db, { workerOwner: "worker" }, dependencies, {}))
      .toMatchObject({ ok: false, code: "FEATURE_DISABLED" });
    expect(await runRefundExecutionWorkerCycle(db, { workerOwner: "worker" }, dependencies, {
      [REFUND_EXECUTION_WORKER_ENABLED]: "enabled",
    })).toMatchObject({ ok: false, code: "CONFIG_INVALID" });
    expect(calls).toEqual({ get: 0, post: 0 });
    expect(await dispatchState(fixture)).toEqual(before);
  });

  it("routes zero candidates when cooperative stop is already requested before selection", async () => {
    const fixture = await tossFixture(fixtures);
    const before = await dispatchState(fixture);
    const calls = { get: 0, post: 0 };

    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "pre-stopped-worker" },
      ports(fixture, calls),
      READY_ENV,
      Object.freeze({ shouldStop: () => true }),
    );

    expect(result).toEqual(stoppedCounters({ selectedCount: 0, attemptedCount: 0 }));
    expect(calls).toEqual({ get: 0, post: 0 });
    expect(await dispatchState(fixture)).toEqual(before);
  });

  it("stops after selection and before candidate-class processing", async () => {
    const fixture = await tossFixture(fixtures);
    const before = await dispatchState(fixture);
    const calls = { get: 0, post: 0 };
    const control = stopOnObservation(2);

    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "post-selection-stop-worker" },
      ports(fixture, calls),
      READY_ENV,
      control,
    );

    expect(result).toEqual(stoppedCounters({ selectedCount: 0, attemptedCount: 0 }));
    expect(control.observationCount()).toBe(2);
    expect(calls).toEqual({ get: 0, post: 0 });
    expect(await dispatchState(fixture)).toEqual(before);
  });

  it("stops immediately before a candidate without selecting or routing it", async () => {
    const fixture = await tossFixture(fixtures);
    const before = await dispatchState(fixture);
    const calls = { get: 0, post: 0 };
    const control = stopOnObservation(5);

    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "pre-candidate-stop-worker" },
      ports(fixture, calls),
      READY_ENV,
      control,
    );

    expect(result).toEqual(stoppedCounters({ selectedCount: 0, attemptedCount: 0 }));
    expect(control.observationCount()).toBe(5);
    expect(calls).toEqual({ get: 0, post: 0 });
    expect(await dispatchState(fixture)).toEqual(before);
  });

  it("finishes one in-flight candidate and admits no later candidate after cooperative stop", async () => {
    const first = await tossFixture(fixtures, new Date("2020-01-01T00:00:00.000Z"));
    const second = await tossFixture(fixtures, new Date("2020-01-02T00:00:00.000Z"));
    const calls = { get: 0, post: 0 };
    const base = ports(first, calls);
    let stop = false;

    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "in-flight-stop-worker" },
      {
        lookup: base.lookup,
        cancellation: async (...args) => {
          const outcome = await base.cancellation(...args);
          stop = true;
          return outcome;
        },
      },
      READY_ENV,
      Object.freeze({ shouldStop: () => stop }),
    );

    expect(result).toEqual(stoppedCounters({
      readySelected: 1, succeededCount: 1, providerLookupCount: 2, providerCancellationCount: 1,
    }));
    expect(calls).toEqual({ get: 2, post: 1 });
    expect((await dispatchState(first)).command.status).toBe("DONE");
    expect((await dispatchState(second)).command.status).toBe("READY");
  });

  it("keeps cycle complete when the last candidate finishes before drain is observed", async () => {
    const fixture = await tossFixture(fixtures);
    const calls = { get: 0, post: 0 };
    const base = ports(fixture, calls);
    let stop = false;

    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "late-stop-worker" },
      {
        lookup: base.lookup,
        cancellation: async (...args) => {
          const outcome = await base.cancellation(...args);
          stop = true;
          return outcome;
        },
      },
      READY_ENV,
      Object.freeze({ shouldStop: () => stop }),
    );

    expect(result).toEqual(successCounters({
      readySelected: 1, succeededCount: 1, providerLookupCount: 2, providerCancellationCount: 1,
    }));
    expect(calls).toEqual({ get: 2, post: 1 });
  });

  it("stops between candidate classes without beginning the later class", async () => {
    const contacted = await tossFixture(fixtures, new Date("2020-01-01T00:00:00.000Z"));
    const ready = await tossFixture(fixtures, new Date("2020-01-02T00:00:00.000Z"));
    await createContactedUnknownOutcome(contacted);
    const calls = { get: 0, post: 0 };
    let stop = false;
    const lookup: TossRefundLookupPort = (paymentKey) => {
      calls.get += 1;
      if (paymentKey !== contacted.providerPaymentKey) {
        throw new Error("LATER_CLASS_ROUTED");
      }
      stop = true;
      return Promise.resolve({ kind: "response", body: JSON.stringify(successBody(contacted)) });
    };
    const cancellation: TossRefundCancellationPort = () => {
      calls.post += 1;
      throw new Error("LATER_CLASS_CONTACTED");
    };

    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "between-class-stop-worker" },
      { lookup, cancellation },
      { ...READY_ENV, ...CONTACTED_ENV },
      Object.freeze({ shouldStop: () => stop }),
    );

    expect(result).toEqual(stoppedCounters({
      contactedSelected: 1, succeededCount: 1, providerLookupCount: 1,
    }));
    expect(calls).toEqual({ get: 1, post: 0 });
    expect((await dispatchState(contacted)).command.status).toBe("DONE");
    expect((await dispatchState(ready)).command.status).toBe("READY");
  });

  it.each([
    ["throws", Object.freeze({ shouldStop: (): boolean => { throw new Error("STOP_SECRET"); } })],
    ["returns a non-boolean", new Proxy(Object.freeze({ shouldStop: () => false }), {
      get: (_target, property) => property === "shouldStop" ? () => "invalid" : undefined,
    })],
  ])("bounds a cooperative stop control that %s", async (_name, control) => {
    const fixture = await tossFixture(fixtures);
    const before = await dispatchState(fixture);
    const calls = { get: 0, post: 0 };

    const result = await runRefundExecutionWorkerCycle(
      db, { workerOwner: "invalid-control-worker" }, ports(fixture, calls), READY_ENV, control,
    );

    expect(result).toEqual({
      ok: false,
      code: "SYSTEMIC_FAILURE",
      message: "Refund execution worker cycle failed systemically.",
      cycle: successCounters({ selectedCount: 0, attemptedCount: 0 }).cycle,
    });
    expect(JSON.stringify(result)).not.toContain("STOP_SECRET");
    expect(calls).toEqual({ get: 0, post: 0 });
    expect(await dispatchState(fixture)).toEqual(before);
  });

  it("selects READY, acquires once, and runs the shared authorization/contact continuation", async () => {
    const fixture = await tossFixture(fixtures);
    const calls = { get: 0, post: 0 };
    const trace: string[] = [];
    const lookup: TossRefundLookupPort = async () => {
      calls.get += 1;
      const dispatch = await db.refundExecutionDispatchAttempt.findFirst({
        where: { commandId: fixture.commandId },
        orderBy: { ordinal: "desc" },
      });
      if (!dispatch) {
        trace.push("AUTHORIZATION_LOOKUP");
      } else {
        expect(dispatch).toMatchObject({
          ordinal: 1,
          state: RefundExecutionDispatchAttemptState.AUTHORIZED,
          contactMarkedAt: null,
        });
        expect(await db.refundExecutionProviderEligibilityProof.count({
          where: { binding: { refundAttemptId: fixture.refundAttemptId } },
        })).toBe(1);
        trace.push("CONTACT_REVALIDATION_LOOKUP");
      }
      return { kind: "response", body: JSON.stringify(eligibleBody(fixture)) };
    };
    const cancellation: TossRefundCancellationPort = async () => {
      calls.post += 1;
      const dispatch = await db.refundExecutionDispatchAttempt.findFirstOrThrow({
        where: { commandId: fixture.commandId, ordinal: 1 },
      });
      expect(dispatch.state).toBe(
        RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
      );
      expect(dispatch.contactMarkedAt).not.toBeNull();
      trace.push("CANCELLATION");
      return { kind: "success", body: JSON.stringify(successBody(fixture)) };
    };
    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "  ready-worker  " },
      { lookup, cancellation },
      READY_ENV,
    );

    expect(result).toEqual(successCounters({
      readySelected: 1, succeededCount: 1, providerLookupCount: 2, providerCancellationCount: 1,
    }));
    expectSuccessfulAggregate(result);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.ok && Object.isFrozen(result.cycle)).toBe(true);
    expect(calls).toEqual({ get: 2, post: 1 });
    expect(trace).toEqual([
      "AUTHORIZATION_LOOKUP",
      "CONTACT_REVALIDATION_LOOKUP",
      "CANCELLATION",
    ]);
    expect((await dispatchState(fixture)).command.status).toBe("DONE");
  });

  it("leaves READY unchanged when a valid selected-route gate is disabled", async () => {
    const fixture = await tossFixture(fixtures);
    const before = await dispatchState(fixture);
    const calls = { get: 0, post: 0 };
    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "skip-worker" },
      ports(fixture, calls),
      { ...READY_ENV, [REFUND_EXECUTION_TOSS_CONTACT_ENABLED]: "" },
    );

    expect(result).toEqual(successCounters({
      readySelected: 1,
      skippedCount: 1,
      attemptedCount: 0,
    }));
    expectSuccessfulAggregate(result);
    expect(calls).toEqual({ get: 0, post: 0 });
    expect(await dispatchState(fixture)).toEqual(before);
  });

  it("reclaims an expired ordinal-zero lease and uses the same continuation without the lease gate", async () => {
    const fixture = await tossFixture(fixtures);
    const acquired = await acquireRefundExecutionLease(db, {
      commandId: fixture.commandId,
      leaseOwner: "abandoned-worker",
    }, { [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED" });
    if (!acquired.ok) throw new Error(`Fixture lease failed: ${acquired.code}`);
    await db.refundExecutionCommand.update({
      where: { id: fixture.commandId },
      data: { leaseUntil: EXPIRED },
    });
    const calls = { get: 0, post: 0 };

    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "recovery-worker" },
      ports(fixture, calls),
      UNCONTACTED_ENV,
    );

    expect(result).toEqual(successCounters({
      uncontactedSelected: 1, succeededCount: 1,
      providerLookupCount: 2, providerCancellationCount: 1,
    }));
    expectSuccessfulAggregate(result);
    expect(calls).toEqual({ get: 2, post: 1 });
    expect((await dispatchState(fixture)).command.status).toBe("DONE");
  });

  it("routes contacted unknown-outcome state only through recovery", async () => {
    const fixture = await tossFixture(fixtures);
    await createContactedUnknownOutcome(fixture);
    const calls = { get: 0, post: 0 };
    const recoveryLookup: TossRefundLookupPort = () => {
      calls.get += 1;
      return Promise.resolve({ kind: "response", body: JSON.stringify(successBody(fixture)) });
    };

    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "contacted-worker" },
      { lookup: recoveryLookup, cancellation: countingCancellation(fixture, calls) },
      CONTACTED_ENV,
    );

    expect(result).toEqual(successCounters({
      contactedSelected: 1, succeededCount: 1, providerLookupCount: 1,
    }));
    expectSuccessfulAggregate(result);
    expect(calls).toEqual({ get: 1, post: 0 });
    expect((await dispatchState(fixture)).command.status).toBe("DONE");
  });

  it("lets concurrent cycles lose races without duplicate contact or same-row retry", async () => {
    const first = await tossFixture(fixtures, new Date("2020-01-01T00:00:00.000Z"));
    const second = await tossFixture(fixtures, new Date("2020-01-02T00:00:00.000Z"));
    const coordinated = coordinatedPorts([first, second]);

    const [left, right] = await Promise.all([
      runRefundExecutionWorkerCycle(
        db, { workerOwner: "concurrent-left" }, coordinated.dependencies, READY_ENV,
      ),
      runRefundExecutionWorkerCycle(
        db, { workerOwner: "concurrent-right" }, coordinated.dependencies, READY_ENV,
      ),
    ]);

    if (!left.ok || !right.ok) throw new Error("Expected both bounded race cycles to complete.");
    expectSuccessfulAggregate(left);
    expectSuccessfulAggregate(right);
    expect(left.cycle.selectedCount + right.cycle.selectedCount).toBe(4);
    expect(left.cycle.attemptedCount + right.cycle.attemptedCount).toBe(4);
    expect(left.cycle.succeededCount + right.cycle.succeededCount).toBe(2);
    expect(left.cycle.skippedCount + right.cycle.skippedCount
      + left.cycle.conflictCount + right.cycle.conflictCount).toBe(2);
    expect(coordinated.calls.post).toBe(2);
    expect((await dispatchState(first)).command.status).toBe("DONE");
    expect((await dispatchState(second)).command.status).toBe("DONE");
  });

  it("preserves an earlier committed candidate when a later provider dependency throws", async () => {
    const first = await tossFixture(fixtures, new Date("2020-02-01T00:00:00.000Z"));
    const second = await tossFixture(fixtures, new Date("2020-02-02T00:00:00.000Z"));
    const lookup: TossRefundLookupPort = (paymentKey) => {
      if (paymentKey === second.providerPaymentKey) throw new Error("synthetic invariant failure");
      return Promise.resolve({ kind: "response", body: JSON.stringify(eligibleBody(first)) });
    };
    const cancellation = countingCancellation(first, { get: 0, post: 0 });

    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "crash-isolation-worker" },
      { lookup, cancellation },
      READY_ENV,
    );

    expect(result).toEqual({
      ok: false,
      code: "SYSTEMIC_FAILURE",
      message: "Refund execution worker cycle failed systemically.",
      cycle: successCounters({
        selectedCount: 2,
        attemptedCount: 2,
        succeededCount: 1,
        failedCount: 1,
        providerLookupCount: 3,
        providerCancellationCount: 1,
        readySelected: 2,
      }).cycle,
    });
    expect((await dispatchState(first)).command.status).toBe("DONE");
    expect((await dispatchState(second)).command.status).toBe("LEASED");
    expect(JSON.stringify(result)).not.toContain("synthetic invariant failure");
  });

  it("counts one routed CONFIG_INVALID failure without provider invocation", async () => {
    const fixture = await tossFixture(fixtures);
    let leaseGateReads = 0;
    const env = { ...READY_ENV };
    Object.defineProperty(env, REFUND_EXECUTION_LEASE_ENABLED, {
      enumerable: true,
      get: () => {
        leaseGateReads += 1;
        return leaseGateReads === 1 ? "ENABLED" : "malformed-after-preflight";
      },
    });

    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "config-stop-worker" },
      ports(fixture, { get: 0, post: 0 }),
      env,
    );

    expect(result).toEqual({
      ok: false,
      code: "CONFIG_INVALID",
      message: "Refund execution worker configuration is invalid.",
      cycle: successCounters({ failedCount: 1, readySelected: 1 }).cycle,
    });
    expect(leaseGateReads).toBe(2);
  });

  it("counts a throwing cancellation port exactly once under temporary classification", async () => {
    const fixture = await tossFixture(fixtures);
    const lookup = eligibleLookup(fixture, { get: 0, post: 0 });
    const cancellation: TossRefundCancellationPort = () => {
      throw new Error("CANCELLATION_THROW_SECRET");
    };

    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "cancellation-throw-worker" },
      { lookup, cancellation },
      READY_ENV,
    );

    expect(result).toEqual({
      ok: true,
      cycle: successCounters({
        temporaryCount: 1,
        providerLookupCount: 2,
        providerCancellationCount: 1,
        readySelected: 1,
      }).cycle,
    });
    expect(JSON.stringify(result)).not.toContain("CANCELLATION_THROW_SECRET");
  });

  it("counts a rejected cancellation Promise exactly once under temporary classification", async () => {
    const fixture = await tossFixture(fixtures);
    const calls = { get: 0, post: 0 };
    const lookup = eligibleLookup(fixture, calls);
    const cancellation: TossRefundCancellationPort = () => {
      calls.post += 1;
      return Promise.reject(new Error("CANCELLATION_REJECTION_SECRET"));
    };

    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "cancellation-rejection-worker" },
      { lookup, cancellation },
      READY_ENV,
    );

    expect(result).toEqual(successCounters({
      temporaryCount: 1,
      providerLookupCount: 2,
      providerCancellationCount: 1,
      readySelected: 1,
    }));
    expect(calls).toEqual({ get: 2, post: 1 });
    expect(result.ok && result.cycle.failedCount).toBe(0);
    expect(JSON.stringify(result)).not.toContain("CANCELLATION_REJECTION_SECRET");
  });

  it("counts one lookup and one authorized cancellation through CONTACTED recontact", async () => {
    const fixture = await tossFixture(fixtures);
    await createContactedUnknownOutcome(fixture);
    const capturedAt = await workerDatabaseTime();
    const priorContact = new Date(
      capturedAt.getTime() - TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS - 1_000,
    );
    await db.refundExecutionDispatchAttempt.updateMany({
      where: { commandId: fixture.commandId, ordinal: 1 },
      data: { authorizedAt: priorContact, contactMarkedAt: priorContact },
    });
    const calls = { get: 0, post: 0 };

    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "contacted-recontact-worker" },
      {
        lookup: eligibleLookup(fixture, calls),
        cancellation: countingCancellation(fixture, calls),
      },
      CONTACTED_RECONTACT_ENV,
    );

    expect(result).toEqual(successCounters({
      contactedSelected: 1,
      succeededCount: 1,
      providerLookupCount: 1,
      providerCancellationCount: 1,
    }));
    expect(calls).toEqual({ get: 1, post: 1 });
    expect(result.ok && result.cycle.failedCount).toBe(0);
    expect((await dispatchState(fixture)).command.status).toBe("DONE");
  });

  it("bounds and orders READY hints by availableAt, then createdAt and id", async () => {
    const candidates: DispatchFixture[] = [];
    for (let index = 0; index < 7; index += 1) {
      candidates.push(await tossFixture(
        fixtures,
        new Date(Date.UTC(2020, 3, index + 1)),
      ));
    }

    const selected = await selectRefundExecutionWorkerCandidates(db);

    expect(selected.READY.map((candidate) => candidate.commandId))
      .toEqual(candidates.slice(0, 6).map((fixture) => fixture.commandId));
    expect(selected.READY).toHaveLength(6);
  });

  it("excludes Eximbay before the batch bound when its provider route is off", async () => {
    const eximbay = await createDispatchFixture();
    fixtures.push(eximbay);
    await Promise.all([
      db.refundAttempt.update({
        where: { id: eximbay.refundAttemptId },
        data: { provider: PaymentProvider.EXIMBAY, mode: PaymentMode.SANDBOX },
      }),
      db.refundExecutionCommand.update({
        where: { id: eximbay.commandId },
        data: { availableAt: new Date("2019-01-01T00:00:00.000Z") },
      }),
    ]);
    const toss: DispatchFixture[] = [];
    for (let index = 0; index < 6; index += 1) {
      toss.push(await tossFixture(fixtures, new Date(Date.UTC(2020, 4, index + 1))));
    }

    const dormant = await selectRefundExecutionWorkerCandidates(db);
    expect(dormant.READY).toHaveLength(6);
    expect(dormant.READY.map((candidate) => candidate.commandId))
      .toEqual(toss.map((fixture) => fixture.commandId));
    expect(dormant.READY.every((candidate) => candidate.provider === "TOSS")).toBe(true);

    const enabled = await selectRefundExecutionWorkerCandidates(db, { eximbayEnabled: true });
    expect(enabled.READY).toHaveLength(6);
    expect(enabled.READY[0]).toEqual({
      commandId: eximbay.commandId,
      candidateClass: "READY",
      provider: "EXIMBAY",
    });
    expect(enabled.READY.slice(1).every((candidate) => candidate.provider === "TOSS")).toBe(true);
  });

  it("excludes unsupported Q0 READY work before allocation and routing", async () => {
    const fixture = await tossFixture(fixtures);
    await setUnsupportedDomain(fixture, "mode");
    const calls = { get: 0, post: 0 };

    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "unsupported-q0-worker" },
      ports(fixture, calls),
      READY_ENV,
    );

    expect(result).toEqual(successCounters({
      selectedCount: 0,
      attemptedCount: 0,
      readySelected: 0,
    }));
    expectSuccessfulAggregate(result);
    const state = await dispatchState(fixture);
    expect(state.command.status).toBe("READY");
    expect(state.command.dispatchAttempt).toBe(0);
    expect(state.command.leaseOwner).toBeNull();
    expect(state.command.leaseUntil).toBeNull();
    expect(state.command.leaseTokenHash).toBeNull();
    expect(state.commandEvents.filter((event) => (
      event.eventType === RefundExecutionCommandEventType.LEASE_ACQUIRED
    ))).toHaveLength(0);
    expect(state.evidence).toHaveLength(0);
    expect(calls).toEqual({ get: 0, post: 0 });
  });

  it("excludes unsupported Q1 expired ordinal-zero work without reclaim mutation", async () => {
    const fixture = await tossFixture(fixtures);
    const acquired = await acquireRefundExecutionLease(db, {
      commandId: fixture.commandId,
      leaseOwner: "unsupported-q1-original-owner",
    }, { [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED" });
    if (!acquired.ok) throw new Error(`Fixture lease failed: ${acquired.code}`);
    await db.refundExecutionCommand.update({
      where: { id: fixture.commandId },
      data: { leaseUntil: EXPIRED },
    });
    await setUnsupportedDomain(fixture);
    const before = await db.refundExecutionCommand.findUniqueOrThrow({
      where: { id: fixture.commandId },
    });
    const beforeEventCount = await db.refundExecutionCommandEvent.count({
      where: { commandId: fixture.commandId },
    });
    const calls = { get: 0, post: 0 };

    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "unsupported-q1-worker" },
      ports(fixture, calls),
      UNCONTACTED_ENV,
    );

    expectSuccessfulEmptyAggregate(result);
    const after = await db.refundExecutionCommand.findUniqueOrThrow({
      where: { id: fixture.commandId },
    });
    expect(sameRedactedLeaseAuthority(before, after)).toBe(true);
    expect(after.leaseGeneration).toBe(acquired.lease.leaseGeneration);
    expect(await db.refundExecutionCommandEvent.count({
      where: { commandId: fixture.commandId },
    })).toBe(beforeEventCount);
    expect(calls).toEqual({ get: 0, post: 0 });
  });

  it("excludes unsupported Q3 contacted work without recovery mutation", async () => {
    const fixture = await tossFixture(fixtures);
    await createContactedUnknownOutcome(fixture);
    await setUnsupportedDomain(fixture);
    const before = await recoveryProjection(fixture);
    const calls = { get: 0, post: 0 };

    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "unsupported-q3-worker" },
      { lookup: eligibleLookup(fixture, calls), cancellation: countingCancellation(fixture, calls) },
      CONTACTED_ENV,
    );

    expectSuccessfulEmptyAggregate(result);
    expect(await recoveryProjection(fixture)).toEqual(before);
    expect(calls).toEqual({ get: 0, post: 0 });
  });

  it("applies the routed-domain fence before take six so unsupported rows cannot starve Q0", async () => {
    const unsupported: DispatchFixture[] = [];
    for (let index = 0; index < 6; index += 1) {
      const fixture = await tossFixture(fixtures, new Date(Date.UTC(2010, 0, index + 1)));
      await setUnsupportedDomain(fixture);
      unsupported.push(fixture);
    }
    const valid = await tossFixture(fixtures, new Date("2020-01-01T00:00:00.000Z"));
    const calls = { get: 0, post: 0 };

    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "pre-take-domain-worker" },
      ports(valid, calls),
      READY_ENV,
    );

    expect(result).toEqual(successCounters({
      readySelected: 1, succeededCount: 1, providerLookupCount: 2, providerCancellationCount: 1,
    }));
    expectSuccessfulAggregate(result);
    expect(calls).toEqual({ get: 2, post: 1 });
    expect((await dispatchState(valid)).command.status).toBe("DONE");
    for (const fixture of unsupported) {
      const state = await dispatchState(fixture);
      expect(state.command.status).toBe("READY");
      expect(state.command.dispatchAttempt).toBe(0);
      expect(state.commandEvents).toHaveLength(0);
    }
  });

  it("additionally excludes Eximbay Q0 READY work before allocation and routing", async () => {
    const fixture = await tossFixture(fixtures);
    await setEximbayDomain(fixture);
    const calls = { get: 0, post: 0 };

    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "eximbay-q0-worker" },
      ports(fixture, calls),
      READY_ENV,
    );

    expect(result).toEqual(successCounters({
      selectedCount: 0,
      attemptedCount: 0,
      readySelected: 0,
    }));
    expectSuccessfulAggregate(result);
    const state = await dispatchState(fixture);
    expect(state.command.status).toBe("READY");
    expect(state.command.dispatchAttempt).toBe(0);
    expect(state.command.leaseOwner).toBeNull();
    expect(state.command.leaseUntil).toBeNull();
    expect(state.command.leaseTokenHash).toBeNull();
    expect(state.commandEvents.filter((event) => (
      event.eventType === RefundExecutionCommandEventType.LEASE_ACQUIRED
    ))).toHaveLength(0);
    expect(state.evidence).toHaveLength(0);
    expect(calls).toEqual({ get: 0, post: 0 });
  });

  it("additionally excludes Eximbay Q1 expired ordinal-zero work without reclaim mutation", async () => {
    const fixture = await tossFixture(fixtures);
    const acquired = await acquireRefundExecutionLease(db, {
      commandId: fixture.commandId,
      leaseOwner: "eximbay-q1-original-owner",
    }, { [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED" });
    if (!acquired.ok) throw new Error(`Fixture lease failed: ${acquired.code}`);
    await db.refundExecutionCommand.update({
      where: { id: fixture.commandId },
      data: { leaseUntil: EXPIRED },
    });
    await setEximbayDomain(fixture);
    const before = await db.refundExecutionCommand.findUniqueOrThrow({
      where: { id: fixture.commandId },
    });
    const beforeEventCount = await db.refundExecutionCommandEvent.count({
      where: { commandId: fixture.commandId },
    });
    const calls = { get: 0, post: 0 };

    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "eximbay-q1-worker" },
      ports(fixture, calls),
      UNCONTACTED_ENV,
    );

    expectSuccessfulEmptyAggregate(result);
    const after = await db.refundExecutionCommand.findUniqueOrThrow({
      where: { id: fixture.commandId },
    });
    expect(sameRedactedLeaseAuthority(before, after)).toBe(true);
    expect(after.leaseGeneration).toBe(acquired.lease.leaseGeneration);
    expect(await db.refundExecutionCommandEvent.count({
      where: { commandId: fixture.commandId },
    })).toBe(beforeEventCount);
    expect(calls).toEqual({ get: 0, post: 0 });
  });

  it("additionally excludes Eximbay Q3 contacted work without recovery mutation", async () => {
    const fixture = await tossFixture(fixtures);
    await createContactedUnknownOutcome(fixture);
    await setEximbayDomain(fixture);
    const before = await recoveryProjection(fixture);
    const calls = { get: 0, post: 0 };

    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "eximbay-q3-worker" },
      { lookup: eligibleLookup(fixture, calls), cancellation: countingCancellation(fixture, calls) },
      CONTACTED_ENV,
    );

    expectSuccessfulEmptyAggregate(result);
    expect(await recoveryProjection(fixture)).toEqual(before);
    expect(calls).toEqual({ get: 0, post: 0 });
  });

  it("keeps Eximbay rows from starving eligible Toss Q0 work", async () => {
    const eximbay: DispatchFixture[] = [];
    for (let index = 0; index < 6; index += 1) {
      const fixture = await tossFixture(fixtures, new Date(Date.UTC(2011, 0, index + 1)));
      await setEximbayDomain(fixture);
      eximbay.push(fixture);
    }
    const valid = await tossFixture(fixtures, new Date("2021-01-01T00:00:00.000Z"));
    const calls = { get: 0, post: 0 };

    const result = await runRefundExecutionWorkerCycle(
      db,
      { workerOwner: "eximbay-pre-take-domain-worker" },
      ports(valid, calls),
      READY_ENV,
    );

    expect(result).toEqual(successCounters({
      readySelected: 1, succeededCount: 1, providerLookupCount: 2, providerCancellationCount: 1,
    }));
    expectSuccessfulAggregate(result);
    expect(calls).toEqual({ get: 2, post: 1 });
    expect((await dispatchState(valid)).command.status).toBe("DONE");
    for (const fixture of eximbay) {
      const state = await dispatchState(fixture);
      expect(state.command.status).toBe("READY");
      expect(state.command.dispatchAttempt).toBe(0);
      expect(state.commandEvents).toHaveLength(0);
    }
  });

  it("serializes overlapping Q1 worker cycles to one reclaim generation and continuation", async () => {
    const fixture = await tossFixture(fixtures);
    const acquired = await acquireRefundExecutionLease(db, {
      commandId: fixture.commandId,
      leaseOwner: "q1-overlap-original-owner",
    }, { [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED" });
    if (!acquired.ok) throw new Error(`Fixture lease failed: ${acquired.code}`);
    await db.refundExecutionCommand.update({
      where: { id: fixture.commandId },
      data: { leaseUntil: EXPIRED },
    });
    const beforeEvents = await acquisitionEventCount(fixture);
    const calls = { get: 0, post: 0 };
    const dependencies = ports(fixture, calls);
    const firstSession = createNamedDbSession("e2c_q1_cycle_first");
    const secondSession = createNamedDbSession("e2c_q1_cycle_second");
    try {
      const queued = await queueBehindObservedOrderLock(
        fixture.orderId,
        firstSession,
        () => runRefundExecutionWorkerCycle(
          firstSession.client, { workerOwner: "q1-cycle-first" }, dependencies, UNCONTACTED_ENV,
        ),
        secondSession,
        () => runRefundExecutionWorkerCycle(
          secondSession.client, { workerOwner: "q1-cycle-second" }, dependencies, UNCONTACTED_ENV,
        ),
      );
      const results = await Promise.all([queued.first, queued.second]);
      results.forEach(expectSuccessfulAggregate);
      expect(sumSuccessfulCounters(results, "selectedCount")).toBe(2);
      expect(sumSuccessfulCounters(results, "attemptedCount")).toBe(2);
      expect(sumSuccessfulCounters(results, "succeededCount")).toBe(1);
      expect(sumBoundedRaceOutcomes(results)).toBe(1);
      expect(calls.get).toBe(2);
      expect(calls.post).toBeLessThanOrEqual(1);
      const state = await redactedDispatchAuthorizationState(fixture);
      expect(state.commandLeaseGeneration).toBe(acquired.lease.leaseGeneration + 1);
      expect(await acquisitionEventCount(fixture)).toBe(beforeEvents + 1);
      expect(state.dispatchAttemptCount).toBe(1);
      expect(state.dispatchOrdinals).toEqual([1]);
      expect(await authorizationArtifactCounts(fixture)).toEqual({
        binding: 1,
        authorizationProof: 1,
        contactProof: 1,
      });
      expect(state.evidenceCount).toBe(1);
      expect(state.commandStatus).toBe("DONE");
    } finally {
      await disconnectSessions(firstSession, secondSession);
    }
  });

  it("serializes overlapping Q3 worker cycles to one recovery fence and lookup-only finality", async () => {
    const fixture = await tossFixture(fixtures);
    await createContactedUnknownOutcome(fixture);
    const before = await recoveryProjection(fixture);
    const calls = { get: 0, post: 0 };
    const lookup: TossRefundLookupPort = () => {
      calls.get += 1;
      return Promise.resolve({ kind: "response", body: JSON.stringify(successBody(fixture)) });
    };
    const cancellation = countingCancellation(fixture, calls);
    const firstSession = createNamedDbSession("e2c_q3_cycle_first");
    const secondSession = createNamedDbSession("e2c_q3_cycle_second");
    try {
      const queued = await queueBehindObservedOrderLock(
        fixture.orderId,
        firstSession,
        () => runRefundExecutionWorkerCycle(
          firstSession.client,
          { workerOwner: "q3-cycle-first" },
          { lookup, cancellation },
          CONTACTED_ENV,
        ),
        secondSession,
        () => runRefundExecutionWorkerCycle(
          secondSession.client,
          { workerOwner: "q3-cycle-second" },
          { lookup, cancellation },
          CONTACTED_ENV,
        ),
      );
      const results = await Promise.all([queued.first, queued.second]);
      results.forEach(expectSuccessfulAggregate);
      expect(sumSuccessfulCounters(results, "selectedCount")).toBe(2);
      expect(sumSuccessfulCounters(results, "attemptedCount")).toBe(2);
      expect(sumSuccessfulCounters(results, "succeededCount")).toBe(1);
      expect(sumBoundedRaceOutcomes(results)).toBe(1);
      expect(calls).toEqual({ get: 1, post: 0 });
      const after = await recoveryProjection(fixture);
      expect(after.leaseGeneration).toBe(before.leaseGeneration + 1);
      expect(after.recoveryEventCount).toBe(before.recoveryEventCount + 1);
      expect(after.evidenceCount).toBe(before.evidenceCount + 1);
      expect(after.dispatchCount).toBe(before.dispatchCount);
      expect(after.contactProofCount).toBe(before.contactProofCount);
      expect(after.commandStatus).toBe("DONE");
      expect(after.attemptStatus).toBe("SUCCEEDED");
    } finally {
      await disconnectSessions(firstSession, secondSession);
    }
  });

  it("excludes expired authorized-uncontacted Q2 and REQUESTED intake", async () => {
    const authorized = await tossFixture(fixtures);
    await createAuthorizedUncontacted(authorized);
    const requested = await tossFixture(fixtures);
    await db.refundAttempt.update({
      where: { id: requested.refundAttemptId },
      data: { status: "REQUESTED" },
    });

    const selected = await selectRefundExecutionWorkerCandidates(db);
    const selectedIds = Object.values(selected).flat().map((candidate) => candidate.commandId);

    expect(selectedIds).not.toContain(authorized.commandId);
    expect(selectedIds).not.toContain(requested.commandId);
  });
});

async function tossFixture(
  fixtures: DispatchFixture[],
  availableAt?: Date,
): Promise<DispatchFixture> {
  const fixture = await createDispatchFixture({
    totalAmount: 85_000,
    targetAmount: 85_000,
    availableAt,
  });
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

function coordinatedPorts(fixtures: readonly DispatchFixture[]) {
  const calls = { get: 0, post: 0 };
  let release: (() => void) | undefined;
  const bothAuthorized = new Promise<void>((resolve) => { release = resolve; });
  const lookup: TossRefundLookupPort = async (paymentKey) => {
    calls.get += 1;
    const fixture = fixtureForPaymentKey(fixtures, paymentKey);
    if (calls.get === 2) release?.();
    if (calls.get <= 2) await bothAuthorized;
    return { kind: "response", body: JSON.stringify(eligibleBody(fixture)) };
  };
  const cancellation: TossRefundCancellationPort = (contact) => {
    calls.post += 1;
    const fixture = fixtures.find((candidate) => contact.wire.path.includes(
      candidate.providerPaymentKey,
    ));
    if (!fixture) throw new Error("Unable to match coordinated cancellation fixture.");
    return Promise.resolve({ kind: "success", body: JSON.stringify(successBody(fixture)) });
  };
  return { calls, dependencies: { lookup, cancellation } };
}

function fixtureForPaymentKey(
  fixtures: readonly DispatchFixture[],
  paymentKey: string,
): DispatchFixture {
  const fixture = fixtures.find((candidate) => candidate.providerPaymentKey === paymentKey);
  if (!fixture) throw new Error("Unable to match coordinated lookup fixture.");
  return fixture;
}

function ports(fixture: DispatchFixture, calls: { get: number; post: number }) {
  return {
    lookup: eligibleLookup(fixture, calls),
    cancellation: countingCancellation(fixture, calls),
  };
}

function eligibleLookup(
  fixture: DispatchFixture,
  calls: { get: number; post: number },
): TossRefundLookupPort {
  return () => {
    calls.get += 1;
    return Promise.resolve({ kind: "response", body: JSON.stringify(eligibleBody(fixture)) });
  };
}

function countingCancellation(
  fixture: DispatchFixture,
  calls: { get: number; post: number },
): TossRefundCancellationPort {
  return () => {
    calls.post += 1;
    return Promise.resolve({ kind: "success", body: JSON.stringify(successBody(fixture)) });
  };
}

async function createContactedUnknownOutcome(fixture: DispatchFixture): Promise<void> {
  const lease = await acquireRefundExecutionLease(db, {
    commandId: fixture.commandId,
    leaseOwner: "contacting-worker",
  }, { [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED" });
  if (!lease.ok) throw new Error(`Fixture lease failed: ${lease.code}`);
  const authorize = createTossRefundExecutionAuthorizer({
    lookup: eligibleLookup(fixture, { get: 0, post: 0 }),
  });
  const authorization = await authorize(db, leaseInput(lease.lease), DOWNSTREAM_ENV);
  if (!authorization.ok) throw new Error(`Fixture authorization failed: ${authorization.code}`);
  const contact = createTossRefundContactExecutor({
    lookup: eligibleLookup(fixture, { get: 0, post: 0 }),
    cancellation: () => Promise.resolve({ kind: "unknown" }),
  });
  const contacted = await contact(db, leaseInput(lease.lease), DOWNSTREAM_ENV);
  if (contacted.ok || contacted.code !== "TOSS_CONTACT_OUTCOME_UNKNOWN") {
    throw new Error("Fixture contact did not produce an unknown outcome.");
  }
  await db.refundExecutionCommand.update({
    where: { id: fixture.commandId },
    data: { leaseUntil: EXPIRED },
  });
}

async function createAuthorizedUncontacted(fixture: DispatchFixture): Promise<void> {
  const lease = await acquireRefundExecutionLease(db, {
    commandId: fixture.commandId,
    leaseOwner: "authorized-uncontacted-worker",
  }, { [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED" });
  if (!lease.ok) throw new Error(`Fixture lease failed: ${lease.code}`);
  const authorize = createTossRefundExecutionAuthorizer({
    lookup: eligibleLookup(fixture, { get: 0, post: 0 }),
  });
  const authorization = await authorize(db, leaseInput(lease.lease), DOWNSTREAM_ENV);
  if (!authorization.ok) throw new Error(`Fixture authorization failed: ${authorization.code}`);
  await db.refundExecutionCommand.update({
    where: { id: fixture.commandId },
    data: { leaseUntil: EXPIRED },
  });
}

async function workerDatabaseTime(): Promise<Date> {
  const rows = await db.$queryRaw<{ capturedAt: Date }[]>`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `;
  const capturedAt = rows[0]?.capturedAt;
  if (rows.length !== 1 || !(capturedAt instanceof Date)) {
    throw new Error("Unable to capture worker database time.");
  }
  return capturedAt;
}

function leaseInput(lease: Readonly<{
  commandId: string;
  leaseGeneration: number;
  leaseToken: string;
}>) {
  return {
    commandId: lease.commandId,
    leaseGeneration: lease.leaseGeneration,
    leaseToken: lease.leaseToken,
  };
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
      transactionKey: `worker-transaction-${fixture.refundAttemptId}`,
      cancelStatus: "DONE",
      cancelAmount: fixture.targetAmount,
      cancelReason: "Mira merchant refund",
    }],
  };
}

function successCounters(overrides: Readonly<Record<string, number>>) {
  const cycle = {
    selectedCount: 1,
    attemptedCount: 1,
    succeededCount: 0,
    replayedCount: 0,
    temporaryCount: 0,
    manualCount: 0,
    conflictCount: 0,
    inconsistentCount: 0,
    skippedCount: 0,
    failedCount: 0,
    providerLookupCount: 0,
    providerCancellationCount: 0,
    readySelected: 0,
    uncontactedSelected: 0,
    contactedSelected: 0,
    ...overrides,
  };
  return { ok: true, cycle };
}

function stoppedCounters(overrides: Readonly<Record<string, number>>) {
  return { ...successCounters(overrides), stopped: true };
}

function stopOnObservation(stopAt: number) {
  let observations = 0;
  return Object.freeze({
    shouldStop: () => {
      observations += 1;
      return observations >= stopAt;
    },
    observationCount: () => observations,
  });
}

function expectSuccessfulEmptyAggregate(result: RefundExecutionWorkerCycleResult): void {
  expect(result).toEqual(successCounters({
    selectedCount: 0,
    attemptedCount: 0,
    readySelected: 0,
  }));
  expectSuccessfulAggregate(result);
}

function expectSuccessfulAggregate(result: RefundExecutionWorkerCycleResult): void {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Expected successful worker aggregate: ${result.code}`);
  // Completed aggregates reserve failedCount=0; fatal failures use the separate frozen failure union.
  expect(result.cycle.failedCount).toBe(0);
}

function sumSuccessfulCounters(
  results: readonly RefundExecutionWorkerCycleResult[],
  counter: keyof RefundExecutionWorkerCycleCounters,
): number {
  return results.reduce((sum, result) => {
    if (!result.ok) throw new Error(`Expected successful worker aggregate: ${result.code}`);
    return sum + result.cycle[counter];
  }, 0);
}

function sumBoundedRaceOutcomes(results: readonly RefundExecutionWorkerCycleResult[]): number {
  return ([
    "replayedCount",
    "temporaryCount",
    "manualCount",
    "conflictCount",
    "inconsistentCount",
    "skippedCount",
  ] as const).reduce((sum, counter) => (
    sum + sumSuccessfulCounters(results, counter)
  ), 0);
}

async function setUnsupportedDomain(
  fixture: DispatchFixture,
  kind: "provider" | "mode" = "provider",
): Promise<void> {
  await db.refundAttempt.update({
    where: { id: fixture.refundAttemptId },
    data: kind === "provider"
      ? { provider: PaymentProvider.MOCK }
      : { mode: PaymentMode.LIVE },
  });
}

async function setEximbayDomain(fixture: DispatchFixture): Promise<void> {
  await db.refundAttempt.update({
    where: { id: fixture.refundAttemptId },
    data: { provider: PaymentProvider.EXIMBAY },
  });
}

function sameRedactedLeaseAuthority(
  before: Readonly<{
    leaseGeneration: number;
    leaseOwner: string | null;
    leaseUntil: Date | null;
    leaseTokenHash: string | null;
  }>,
  after: Readonly<{
    leaseGeneration: number;
    leaseOwner: string | null;
    leaseUntil: Date | null;
    leaseTokenHash: string | null;
  }>,
): boolean {
  return before.leaseGeneration === after.leaseGeneration
    && before.leaseOwner === after.leaseOwner
    && before.leaseUntil?.getTime() === after.leaseUntil?.getTime()
    && before.leaseTokenHash === after.leaseTokenHash;
}

async function acquisitionEventCount(fixture: DispatchFixture): Promise<number> {
  return db.refundExecutionCommandEvent.count({
    where: {
      commandId: fixture.commandId,
      eventType: RefundExecutionCommandEventType.LEASE_ACQUIRED,
    },
  });
}

async function authorizationArtifactCounts(fixture: DispatchFixture) {
  const [binding, authorizationProof, contactProof] = await Promise.all([
    db.refundExecutionProviderOperationBinding.count({
      where: { refundAttemptId: fixture.refundAttemptId },
    }),
    db.refundExecutionProviderEligibilityProof.count({
      where: { binding: { refundAttemptId: fixture.refundAttemptId } },
    }),
    db.refundExecutionProviderContactEligibilityProof.count({
      where: { dispatchAttempt: { commandId: fixture.commandId } },
    }),
  ]);
  return { binding, authorizationProof, contactProof };
}

async function recoveryProjection(fixture: DispatchFixture) {
  const [command, attempt, recoveryEventCount, evidenceCount, dispatchCount, contactProofCount] =
    await Promise.all([
      db.refundExecutionCommand.findUniqueOrThrow({ where: { id: fixture.commandId } }),
      db.refundAttempt.findUniqueOrThrow({ where: { id: fixture.refundAttemptId } }),
      db.refundExecutionCommandEvent.count({
        where: {
          commandId: fixture.commandId,
          eventType: RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED,
        },
      }),
      db.refundExecutionEvidence.count({ where: { commandId: fixture.commandId } }),
      db.refundExecutionDispatchAttempt.count({ where: { commandId: fixture.commandId } }),
      db.refundExecutionProviderContactEligibilityProof.count({
        where: { dispatchAttempt: { commandId: fixture.commandId } },
      }),
    ]);
  return {
    commandStatus: command.status,
    attemptStatus: attempt.status,
    leaseGeneration: command.leaseGeneration,
    recoveryEventCount,
    evidenceCount,
    dispatchCount,
    contactProofCount,
  };
}
