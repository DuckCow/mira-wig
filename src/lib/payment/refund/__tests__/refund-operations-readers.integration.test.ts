import { randomUUID } from "node:crypto";
import {
  OrderStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
} from "@prisma/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { sanitizeRefundOperationsResult } from "../refund-operations-contract";
import { readRefundOperationsManualReviewQueue } from "../refund-operations-manual";
import { readRefundOperationsReconciliationSnapshot } from "../refund-operations-reconciliation";
import {
  cleanupDispatchFixtures,
  createDispatchFixture,
  DISPATCH_NOW,
  DispatchFixtureCleanupStep,
  DispatchFixtureConstructionStep,
  type DispatchFixture,
} from "./refund-dispatch-fixture";

const PRE_BOUNDARY_GUARD_SECONDS = 60;

describe("refund operations read-only snapshots", () => {
  const fixtures: DispatchFixture[] = [];

  beforeAll(async () => {
    const configured = process.env.DATABASE_URL;
    if (!configured) throw new Error("DATABASE_URL is required.");
    const url = new URL(configured);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (!local || url.pathname !== "/wig_platform_test") {
      throw new Error("Refund operations integration is restricted to local wig_platform_test.");
    }
    expect(await db.$queryRaw<{ databaseName: string }[]>`
      SELECT current_database() AS "databaseName"
    `).toEqual([{ databaseName: "wig_platform_test" }]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupDispatchFixtures(...fixtures);
    fixtures.length = 0;
  });

  it("returns exact empty snapshots without provider or mutation activity", async () => {
    const fetchPoison = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("OPERATIONS_FETCH_MUST_NOT_RUN"),
    );

    expect(await readRefundOperationsManualReviewQueue(db)).toEqual({
      ok: true,
      code: "MANUAL_REVIEW_QUEUE",
      summary: { count: 0, oldestAgeSeconds: null },
      cases: [],
      truncated: false,
    });
    expect(await readRefundOperationsReconciliationSnapshot(db)).toEqual({
      ok: true,
      code: "RECONCILIATION_SNAPSHOT",
      summary: {
        caseCount: 0,
        possibleContactCount: 0,
        manualReviewCount: 0,
        contactedWarningCount: 0,
        contactedCriticalCount: 0,
      },
      cases: [],
      truncated: false,
    });
    expect(fetchPoison).not.toHaveBeenCalled();
  });

  it.each([
    ["user creation", DispatchFixtureConstructionStep.USER_CREATED],
    ["payment and order authority", DispatchFixtureConstructionStep.ORDER_CREATED],
    ["refund attempt creation", DispatchFixtureConstructionStep.REFUND_ATTEMPT_CREATED],
    ["request transition creation", DispatchFixtureConstructionStep.REQUEST_TRANSITION_CREATED],
    ["final claim construction", DispatchFixtureConstructionStep.CLAIM_CREATED],
  ])("cleans exact partial fixture authority after failure at %s", async (_label, failedStep) => {
    const baseline = await tossFixture(fixtures, DISPATCH_NOW);
    const baselineBefore = await businessRows([baseline]);
    const identity = randomUUID();
    const refundAttemptId = `partial_refund_${identity}`;
    const constructionError = new Error(`INJECTED_${failedStep}`);

    await expect(createDispatchFixture({
      fixtureIdentity: identity,
      refundAttemptId,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      afterConstructionStep(step) {
        if (step === failedStep) throw constructionError;
      },
    })).rejects.toBe(constructionError);

    expect(await failedFixtureResidue(identity, refundAttemptId)).toEqual(zeroFixtureResidue());
    expect(await idleTransactionCount()).toBe(0);
    expect(await businessRows([baseline])).toEqual(baselineBefore);
  });

  it("surfaces construction and cleanup failures while completing exact emergency cleanup", async () => {
    const baseline = await tossFixture(fixtures, DISPATCH_NOW);
    const baselineBefore = await businessRows([baseline]);
    const identity = randomUUID();
    const refundAttemptId = `partial_refund_${identity}`;
    const constructionError = new Error("INJECTED_CONSTRUCTION_FAILURE");
    const cleanupError = new Error("INJECTED_CLEANUP_FAILURE");
    let observed: unknown;

    try {
      await createDispatchFixture({
        fixtureIdentity: identity,
        refundAttemptId,
        provider: PaymentProvider.TOSS,
        mode: PaymentMode.SANDBOX,
        afterConstructionStep(step) {
          if (step === DispatchFixtureConstructionStep.CLAIM_CREATED) throw constructionError;
        },
        beforeCleanupStep(step) {
          if (step === DispatchFixtureCleanupStep.BEFORE_DEPENDENT_ROWS) throw cleanupError;
        },
      });
    } catch (error) {
      observed = error;
    }

    expect(observed).toBeInstanceOf(AggregateError);
    expect(observed).toMatchObject({ errors: [constructionError, cleanupError] });
    expect(await failedFixtureResidue(identity, refundAttemptId)).toEqual(zeroFixtureResidue());
    expect(await idleTransactionCount()).toBe(0);
    expect(await businessRows([baseline])).toEqual(baselineBefore);
  });

  it("reports one coherent manual case with bounded proof indicators and exact row equality", async () => {
    const now = await databaseTime();
    const fixture = await tossFixture(fixtures, secondsBefore(now, 90));
    await makeManual(fixture, secondsBefore(now, 60));
    await addContact(fixture, secondsBefore(now, 50), true);
    await addAuthorizationProof(fixture);
    const before = await businessRows([fixture]);

    const result = await readRefundOperationsManualReviewQueue(db);

    expect(fixture.refundAttemptId).toMatch(/^c[a-z0-9]{20,}$/u);
    expect(result).toEqual({
      ok: true,
      code: "MANUAL_REVIEW_QUEUE",
      summary: { count: 1, oldestAgeSeconds: expectAge(60) },
      cases: [{
        caseRef: fixture.refundAttemptId,
        ageSeconds: expectAge(60),
        contactMarkerPresent: true,
        authorizationEvidenceCount: 1,
        contactEvidenceCount: 1,
      }],
      truncated: false,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /userId|orderId|paymentId|amount|currency|providerOperationKey|paymentKey|credential|lease|owner/iu,
    );
    expect(await businessRows([fixture])).toEqual(before);
  });

  it("preserves one explicit non-UUID durable attempt ID across both privileged readers", async () => {
    const now = await databaseTime();
    const fixture = await tossFixture(fixtures, secondsBefore(now, 90), {
      requestThroughProduction: true,
      refundAttemptId: "legacy_internal_refund_attempt",
    });
    await makeManual(fixture, secondsBefore(now, 60));
    await addContact(fixture, secondsBefore(now, 50), false);

    expect(fixture.refundAttemptId).toBe("legacy_internal_refund_attempt");
    expect((await readRefundOperationsManualReviewQueue(db)).cases[0]?.caseRef)
      .toBe(fixture.refundAttemptId);
    expect((await readRefundOperationsReconciliationSnapshot(db)).cases[0]?.caseRef)
      .toBe(fixture.refundAttemptId);
  });

  it("returns every representative production-created durable reference exactly", async () => {
    const now = await databaseTime();
    const references = [
      ["00000000-0000-4000-8000-000000000004", "00000000-0000-4000-8000-000000000004"],
      ["x".repeat(129), "x".repeat(129)],
      [`long_${"y".repeat(1_024)}`, `long_${"y".repeat(1_024)}`],
      ["operator_\"quoted\"\\path\nnext\tvalue", "operator_\"quoted\"\\path\nnext\tvalue"],
      ["  production_trimmed_reference  ", "production_trimmed_reference"],
    ] as const;
    const created: DispatchFixture[] = [];
    for (const [inputReference, persistedReference] of references) {
      const fixture = await tossFixture(fixtures, secondsBefore(now, 90), {
        requestThroughProduction: true,
        refundAttemptId: inputReference,
      });
      expect(fixture.refundAttemptId).toBe(persistedReference);
      expect((await db.refundAttempt.findUniqueOrThrow({
        where: { id: persistedReference }, select: { id: true },
      })).id).toBe(persistedReference);
      await makeManual(fixture, secondsBefore(now, 60));
      await addContact(fixture, secondsBefore(now, 50), false);
      created.push(fixture);
    }
    const before = await businessRows(created);

    const manual = await readRefundOperationsManualReviewQueue(db);
    const reconcile = await readRefundOperationsReconciliationSnapshot(db);
    const expected = new Set(references.map((entry) => entry[1]));

    expect(new Set(manual.cases.map((item) => item.caseRef))).toEqual(expected);
    expect(new Set(reconcile.cases.map((item) => item.caseRef))).toEqual(expected);
    expect(sanitizeRefundOperationsResult(manual)).toEqual(manual);
    expect(sanitizeRefundOperationsResult(reconcile)).toEqual(reconcile);
    expect(await businessRows(created)).toEqual(before);
  });

  it("excludes incoherent provider, mode, attempt, command, and order neighbors and clamps future age", async () => {
    const now = await databaseTime();
    const future = await tossFixture(fixtures, secondsBefore(now, 60));
    await makeManual(future, secondsAfter(now, 60));
    const wrongProvider = await manualFixture(fixtures, now);
    const live = await manualFixture(fixtures, now);
    const wrongAttempt = await manualFixture(fixtures, now);
    const wrongCommand = await manualFixture(fixtures, now);
    const wrongOrder = await manualFixture(fixtures, now);
    await db.refundAttempt.update({ where: { id: wrongProvider.refundAttemptId }, data: { provider: PaymentProvider.MOCK } });
    await db.refundAttempt.update({ where: { id: live.refundAttemptId }, data: { mode: PaymentMode.LIVE } });
    await db.refundAttempt.update({ where: { id: wrongAttempt.refundAttemptId }, data: { status: RefundAttemptStatus.PROCESSING } });
    await db.refundExecutionCommand.update({ where: { id: wrongCommand.commandId }, data: { status: RefundExecutionCommandStatus.READY } });
    await db.order.update({ where: { id: wrongOrder.orderId }, data: { status: OrderStatus.REFUNDED } });
    const all = [future, wrongProvider, live, wrongAttempt, wrongCommand, wrongOrder];
    const before = await businessRows(all);

    const manual = await readRefundOperationsManualReviewQueue(db);
    const reconcile = await readRefundOperationsReconciliationSnapshot(db);

    expect(manual.summary).toEqual({ count: 1, oldestAgeSeconds: 0 });
    expect(manual.cases).toEqual([expect.objectContaining({
      caseRef: future.refundAttemptId,
      ageSeconds: 0,
    })]);
    expect(reconcile.summary.manualReviewCount).toBe(1);
    expect(reconcile.cases).toEqual([{
      caseRef: future.refundAttemptId,
      classifications: ["MANUAL_REVIEW"],
      oldestRelevantAgeSeconds: 0,
    }]);
    expect(await businessRows(all)).toEqual(before);
  });

  it("classifies possible contact, overlap, warning, critical, hard-deadline, and future cases", async () => {
    const now = await databaseTime();
    const possible = await contactedFixture(fixtures, secondsBefore(now, 60));
    await addContact(possible, secondsBefore(now, 30), false, 2);
    const overlap = await contactedFixture(fixtures, secondsBefore(now, 11 * 24 * 60 * 60));
    await makeManual(overlap, secondsBefore(now, 30));
    const beforeWarning = await contactedFixture(
      fixtures,
      secondsBefore(now, 10 * 24 * 60 * 60 - PRE_BOUNDARY_GUARD_SECONDS),
    );
    const warning = await contactedFixture(fixtures, secondsBefore(now, 10 * 24 * 60 * 60));
    const beforeCritical = await contactedFixture(
      fixtures,
      secondsBefore(now, 12 * 24 * 60 * 60 - PRE_BOUNDARY_GUARD_SECONDS),
    );
    const critical = await contactedFixture(fixtures, secondsBefore(now, 12 * 24 * 60 * 60));
    const beforeHard = await contactedFixture(fixtures, secondsBefore(now, 13 * 24 * 60 * 60 - 1));
    const hard = await contactedFixture(fixtures, secondsBefore(now, 13 * 24 * 60 * 60));
    const future = await contactedFixture(fixtures, secondsAfter(now, 60));
    const all = [possible, overlap, beforeWarning, warning, beforeCritical, critical, beforeHard, hard, future];
    const before = await businessRows(all);

    const result = await readRefundOperationsReconciliationSnapshot(db);
    const byRef = new Map(result.cases.map((row) => [row.caseRef, row]));

    expect(result.summary).toEqual({
      caseCount: 9,
      possibleContactCount: 9,
      manualReviewCount: 1,
      contactedWarningCount: 3,
      contactedCriticalCount: 3,
    });
    expect(byRef.get(possible.refundAttemptId)?.classifications).toEqual(["POSSIBLE_CONTACT"]);
    expect(byRef.get(overlap.refundAttemptId)?.classifications).toEqual([
      "POSSIBLE_CONTACT", "MANUAL_REVIEW", "CONTACTED_DEADLINE_WARNING",
    ]);
    expect(byRef.get(beforeWarning.refundAttemptId)?.classifications).toEqual(["POSSIBLE_CONTACT"]);
    expect(byRef.get(warning.refundAttemptId)?.classifications).toContain("CONTACTED_DEADLINE_WARNING");
    expect(byRef.get(beforeCritical.refundAttemptId)?.classifications).toContain("CONTACTED_DEADLINE_WARNING");
    expect(byRef.get(beforeCritical.refundAttemptId)?.classifications)
      .not.toContain("CONTACTED_DEADLINE_CRITICAL");
    expect(byRef.get(critical.refundAttemptId)?.classifications).toContain("CONTACTED_DEADLINE_CRITICAL");
    expect(byRef.get(beforeHard.refundAttemptId)?.classifications).toContain("CONTACTED_DEADLINE_CRITICAL");
    expect(byRef.get(hard.refundAttemptId)?.classifications).toContain("CONTACTED_DEADLINE_CRITICAL");
    expect(byRef.get(future.refundAttemptId)).toEqual({
      caseRef: future.refundAttemptId,
      classifications: ["POSSIBLE_CONTACT"],
      oldestRelevantAgeSeconds: 0,
    });
    expect(result.cases.slice(0, 3).every((row) => (
      row.classifications.includes("CONTACTED_DEADLINE_CRITICAL")
    ))).toBe(true);
    expect(await businessRows(all)).toEqual(before);
  });

  it("uses the opaque case reference as the stable tie-breaker after age and severity", async () => {
    const now = await databaseTime();
    const first = await tossFixture(fixtures, secondsBefore(now, 120));
    const second = await tossFixture(fixtures, secondsBefore(now, 120));
    const sharedTime = secondsBefore(now, 60);
    await Promise.all([
      makeManual(first, sharedTime),
      makeManual(second, sharedTime),
    ]);
    await Promise.all([
      addContact(first, sharedTime, false),
      addContact(second, sharedTime, false),
    ]);
    const expected = [first.refundAttemptId, second.refundAttemptId].sort();

    const manual = await readRefundOperationsManualReviewQueue(db);
    const reconcile = await readRefundOperationsReconciliationSnapshot(db);

    expect(manual.cases.map((row) => row.caseRef)).toEqual(expected);
    expect(reconcile.cases.map((row) => row.caseRef)).toEqual(expected);
  });

  it("matches C collation to explicit Unicode code-point order at equal emitted age", async () => {
    const now = await databaseTime();
    const expectedCodePointOrder = [
      "-",
      "0",
      "A",
      "_",
      "a",
      "cmrefordinarycuid000000001",
      "e\u0301",
      "é",
      "Ω",
      "\uE000",
      "\u{10000}",
      "😀",
    ] as const;
    const futureBase = secondsAfter(now, 3_600);
    for (const [index, caseRef] of expectedCodePointOrder.entries()) {
      const fixture = await tossFixture(fixtures, secondsBefore(now, 90), {
        requestThroughProduction: true,
        refundAttemptId: caseRef,
      });
      const reverseRawTimestamp = new Date(
        futureBase.getTime() + (expectedCodePointOrder.length - index) * 10,
      );
      await makeManual(fixture, reverseRawTimestamp);
    }

    const result = await readRefundOperationsReconciliationSnapshot(db);

    expect(result.cases.map((item) => item.caseRef)).toEqual(expectedCodePointOrder);
    expect(result.cases.map((item) => item.oldestRelevantAgeSeconds))
      .toEqual(expectedCodePointOrder.map(() => 0));
    expect(sanitizeRefundOperationsResult(result)).toEqual(result);
    expect(expectedCodePointOrder).toContain("e\u0301");
    expect(expectedCodePointOrder).toContain("é");
    expect(expectedCodePointOrder.indexOf("\uE000"))
      .toBeLessThan(expectedCodePointOrder.indexOf("\u{10000}"));
  });

  it("returns complete counts with deterministic oldest bounded case lists", async () => {
    const now = await databaseTime();
    const created: DispatchFixture[] = [];
    for (let index = 0; index < 101; index += 1) {
      const fixture = await tossFixture(fixtures, secondsBefore(now, 500 + index));
      await makeManual(fixture, secondsBefore(now, 500 + index));
      await addContact(fixture, secondsBefore(now, 500 + index), false);
      created.push(fixture);
    }
    const before = await businessRows(created);

    const manual = await readRefundOperationsManualReviewQueue(db);
    const reconcile = await readRefundOperationsReconciliationSnapshot(db);

    expect(manual.summary.count).toBe(101);
    expect(manual.cases).toHaveLength(50);
    expect(manual.truncated).toBe(true);
    expect(manual.cases.map((row) => row.ageSeconds)).toEqual(
      [...manual.cases.map((row) => row.ageSeconds)].sort((left, right) => right - left),
    );
    expect(reconcile.summary).toEqual({
      caseCount: 101,
      possibleContactCount: 101,
      manualReviewCount: 101,
      contactedWarningCount: 0,
      contactedCriticalCount: 0,
    });
    expect(reconcile.cases).toHaveLength(100);
    expect(reconcile.truncated).toBe(true);
    expect(reconcile.cases.map((row) => row.oldestRelevantAgeSeconds)).toEqual(
      [...reconcile.cases.map((row) => row.oldestRelevantAgeSeconds)]
        .sort((left, right) => right - left),
    );
    expect(await businessRows(created)).toEqual(before);
  }, 120_000);
});

async function tossFixture(
  fixtures: DispatchFixture[],
  availableAt: Date,
  options: Readonly<{
    requestThroughProduction?: boolean;
    useSchemaGeneratedRefundAttemptId?: boolean;
    refundAttemptId?: string;
  }> = {},
): Promise<DispatchFixture> {
  const useSchemaGeneratedRefundAttemptId = options.useSchemaGeneratedRefundAttemptId
    ?? (!options.requestThroughProduction && options.refundAttemptId === undefined);
  const fixture = await createDispatchFixture({
    availableAt,
    provider: PaymentProvider.TOSS,
    mode: PaymentMode.SANDBOX,
    requestThroughProduction: options.requestThroughProduction,
    refundAttemptId: options.refundAttemptId,
    useSchemaGeneratedRefundAttemptId,
  });
  fixtures.push(fixture);
  return fixture;
}

async function manualFixture(fixtures: DispatchFixture[], now: Date): Promise<DispatchFixture> {
  const fixture = await tossFixture(fixtures, secondsBefore(now, 60));
  await makeManual(fixture, secondsBefore(now, 30));
  return fixture;
}

async function contactedFixture(
  fixtures: DispatchFixture[],
  contactMarkedAt: Date,
): Promise<DispatchFixture> {
  const fixture = await tossFixture(fixtures, secondsBefore(contactMarkedAt, 60));
  await addContact(fixture, contactMarkedAt, false);
  return fixture;
}

async function makeManual(fixture: DispatchFixture, updatedAt: Date): Promise<void> {
  await db.refundAttempt.update({
    where: { id: fixture.refundAttemptId },
    data: { status: RefundAttemptStatus.MANUAL_REVIEW },
  });
  await db.refundExecutionCommand.update({
    where: { id: fixture.commandId },
    data: { status: RefundExecutionCommandStatus.PARKED, updatedAt },
  });
}

async function addContact(
  fixture: DispatchFixture,
  contactMarkedAt: Date,
  withProof: boolean,
  ordinal = 1,
): Promise<void> {
  const dispatch = await db.refundExecutionDispatchAttempt.create({
    data: {
      commandId: fixture.commandId,
      ordinal,
      leaseGeneration: 1,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      providerOperationKey: `ops:${fixture.commandId}:${ordinal}`,
      requestFingerprint: "a".repeat(64),
      state: RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
      authorizedAt: contactMarkedAt,
      contactMarkedAt,
    },
  });
  if (withProof) {
    await db.refundExecutionProviderContactEligibilityProof.create({
      data: {
        dispatchAttemptId: dispatch.id,
        paymentKey: fixture.providerPaymentKey,
        method: "카드",
        easyPayPresent: false,
        currency: "KRW",
        providerStatus: "DONE",
        totalAmount: fixture.totalAmount,
        balanceAmount: fixture.totalAmount,
        taxFreeAmount: 0,
        taxExemptionAmount: 0,
        cancelsCount: 0,
        localReceivedAt: contactMarkedAt,
        eligibilityFingerprint: "b".repeat(64),
      },
    });
  }
}

async function addAuthorizationProof(fixture: DispatchFixture): Promise<void> {
  const binding = await db.refundExecutionProviderOperationBinding.create({
    data: {
      refundAttemptId: fixture.refundAttemptId,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      providerOperationFamilyKey: `toss-refund-v1-${"e".repeat(64)}`,
      operationFamilyKeyAlgorithmVersion: "toss-refund-v1",
      wireContractVersion: "refund-provider-toss-wire/v1",
      operationFamilyFingerprint: "c".repeat(64),
      merchantAccountBindingId: "merchant-test",
      credentialGenerationBindingId: "generation-test",
    },
  });
  await db.refundExecutionProviderEligibilityProof.create({
    data: {
      bindingId: binding.id,
      paymentKey: fixture.providerPaymentKey,
      method: "카드",
      easyPayPresent: false,
      currency: "KRW",
      providerStatus: "DONE",
      totalAmount: fixture.totalAmount,
      balanceAmount: fixture.totalAmount,
      taxFreeAmount: 0,
      taxExemptionAmount: 0,
      cancelsCount: 0,
      localReceivedAt: new Date(),
      eligibilityFingerprint: "d".repeat(64),
    },
  });
}

async function businessRows(fixtures: readonly DispatchFixture[]) {
  const attemptIds = fixtures.map((fixture) => fixture.refundAttemptId).sort();
  const commandIds = fixtures.map((fixture) => fixture.commandId).sort();
  return {
    orders: await db.order.findMany({
      where: { id: { in: fixtures.map((fixture) => fixture.orderId) } },
      orderBy: { id: "asc" },
    }),
    attempts: await db.refundAttempt.findMany({
      where: { id: { in: attemptIds } }, orderBy: { id: "asc" },
    }),
    commands: await db.refundExecutionCommand.findMany({
      where: { id: { in: commandIds } }, orderBy: { id: "asc" },
    }),
    dispatches: await db.refundExecutionDispatchAttempt.findMany({
      where: { commandId: { in: commandIds } }, orderBy: [{ commandId: "asc" }, { ordinal: "asc" }],
    }),
    evidence: await db.refundExecutionEvidence.findMany({
      where: { commandId: { in: commandIds } }, orderBy: { id: "asc" },
    }),
  };
}

async function databaseTime(): Promise<Date> {
  const rows = await db.$queryRaw<{ capturedAt: Date }[]>`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `;
  if (rows.length !== 1 || !(rows[0].capturedAt instanceof Date)) {
    throw new Error("Unable to capture operations fixture database time.");
  }
  return rows[0].capturedAt;
}

function secondsBefore(value: Date, seconds: number): Date {
  return new Date(value.getTime() - seconds * 1_000);
}

function secondsAfter(value: Date, seconds: number): Date {
  return new Date(value.getTime() + seconds * 1_000);
}

function expectAge(expected: number): unknown {
  return expect.toSatisfy((value: unknown) => (
    typeof value === "number" && value >= expected && value <= expected + 2
  ));
}

interface FailedFixtureResidue {
  users: number;
  sessions: number;
  payments: number;
  orders: number;
  attempts: number;
  transitions: number;
  commands: number;
  commandEvents: number;
  dispatchAttempts: number;
  contactProofs: number;
  bindings: number;
  eligibilityProofs: number;
  evidence: number;
}

async function failedFixtureResidue(
  identity: string,
  refundAttemptId: string,
): Promise<FailedFixtureResidue> {
  const userId = `dispatch_user_${identity}`;
  const rows = await db.$queryRaw<FailedFixtureResidue[]>(Prisma.sql`
    SELECT
      (SELECT count(*)::int FROM "User" WHERE "id" = ${userId}) AS "users",
      (SELECT count(*)::int FROM "CheckoutSession" WHERE "userId" = ${userId}) AS "sessions",
      (SELECT count(*)::int FROM "Payment" p
        JOIN "CheckoutSession" s ON s."id" = p."checkoutSessionId"
        WHERE s."userId" = ${userId}) AS "payments",
      (SELECT count(*)::int FROM "Order" WHERE "userId" = ${userId}) AS "orders",
      (SELECT count(*)::int FROM "RefundAttempt" WHERE "id" = ${refundAttemptId}) AS "attempts",
      (SELECT count(*)::int FROM "RefundAttemptTransition"
        WHERE "refundAttemptId" = ${refundAttemptId}) AS "transitions",
      (SELECT count(*)::int FROM "RefundExecutionCommand"
        WHERE "refundAttemptId" = ${refundAttemptId}) AS "commands",
      (SELECT count(*)::int FROM "RefundExecutionCommandEvent" e
        JOIN "RefundExecutionCommand" c ON c."id" = e."commandId"
        WHERE c."refundAttemptId" = ${refundAttemptId}) AS "commandEvents",
      (SELECT count(*)::int FROM "RefundExecutionDispatchAttempt" d
        JOIN "RefundExecutionCommand" c ON c."id" = d."commandId"
        WHERE c."refundAttemptId" = ${refundAttemptId}) AS "dispatchAttempts",
      (SELECT count(*)::int FROM "RefundExecutionProviderContactEligibilityProof" p
        JOIN "RefundExecutionDispatchAttempt" d ON d."id" = p."dispatchAttemptId"
        JOIN "RefundExecutionCommand" c ON c."id" = d."commandId"
        WHERE c."refundAttemptId" = ${refundAttemptId}) AS "contactProofs",
      (SELECT count(*)::int FROM "RefundExecutionProviderOperationBinding"
        WHERE "refundAttemptId" = ${refundAttemptId}) AS "bindings",
      (SELECT count(*)::int FROM "RefundExecutionProviderEligibilityProof" p
        JOIN "RefundExecutionProviderOperationBinding" b ON b."id" = p."bindingId"
        WHERE b."refundAttemptId" = ${refundAttemptId}) AS "eligibilityProofs",
      (SELECT count(*)::int FROM "RefundExecutionEvidence" e
        JOIN "RefundExecutionCommand" c ON c."id" = e."commandId"
        WHERE c."refundAttemptId" = ${refundAttemptId}) AS "evidence"
  `);
  if (rows.length !== 1) throw new Error("Expected one partial-fixture residue row.");
  return rows[0];
}

function zeroFixtureResidue(): FailedFixtureResidue {
  return {
    users: 0,
    sessions: 0,
    payments: 0,
    orders: 0,
    attempts: 0,
    transitions: 0,
    commands: 0,
    commandEvents: 0,
    dispatchAttempts: 0,
    contactProofs: 0,
    bindings: 0,
    eligibilityProofs: 0,
    evidence: 0,
  };
}

async function idleTransactionCount(): Promise<number> {
  const rows = await db.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS "count"
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND state = 'idle in transaction'
      AND pid <> pg_backend_pid()
  `;
  if (rows.length !== 1) throw new Error("Expected one idle-transaction count row.");
  return rows[0].count;
}
