import {
  PaymentMode,
  PaymentProvider,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
} from "@prisma/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { syntheticEximbayProviderOrderId } from "@/lib/payment/__tests__/eximbay-fixture";
import { encodeEximbayAmount } from "@/lib/payment/providers/eximbay/amount";
import { isRecord } from "@/lib/payment/providers/eximbay/validation";
import { acquireRefundExecutionLease, type RefundExecutionLeaseHandle } from "../../../acquire-lease";
import { REFUND_EXECUTION_LEASE_ENABLED } from "../../../execution-activation";
import {
  cleanupDispatchFixtures,
  createDispatchFixture,
  type DispatchFixture,
} from "../../../__tests__/refund-dispatch-fixture";
import { createEximbayFirstRefundDispatchAuthorizer } from "../authorize-first-dispatch";
import { createEximbayRefundContactExecutor } from "../execute-contact";
import { createEximbayRefundReconciler } from "../reconcile-refund";

const LEASE_ENV = Object.freeze({ [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED" });
const CONFIG = Object.freeze({
  mode: PaymentMode.SANDBOX,
  mid: "synthetic-merchant-mid",
  merchantAccountBindingId: "merchant-test-1",
  credentialGenerationBindingId: "generation-test-1",
});

type LeasedFixture = Readonly<{
  fixture: DispatchFixture;
  lease: RefundExecutionLeaseHandle;
  providerOrderId: string;
  r1RefundId: string;
}>;

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
  const providerOrderId = payment.providerOrderId;
  const leased = await acquireRefundExecutionLease(db, {
    commandId: fixture.commandId,
    leaseOwner: "eximbay-cancel-test",
  }, LEASE_ENV);
  if (!leased.ok) throw new Error(leased.code);
  const authorizer = createEximbayFirstRefundDispatchAuthorizer({
    config: CONFIG,
    retrieve: () => Promise.resolve(preflightResponse(
      fixture,
      providerOrderId,
      totalAmount,
    )),
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
  return { fixture, lease: leased.lease, providerOrderId, r1RefundId: r1.providerOperationKey };
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
