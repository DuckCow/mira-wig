import {
  OrderStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  type PrismaClient,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
} from "@prisma/client";
import { isDeepStrictEqual } from "node:util";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { syntheticEximbayProviderOrderId } from "@/lib/payment/__tests__/eximbay-fixture";
import {
  CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1,
  refundSucceededEmailDedupKey,
} from "@/lib/payment/email";
import { acquireRefundExecutionLease } from "../acquire-lease";
import {
  REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_LEASE_ENABLED,
  REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED,
  REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED,
} from "../execution-activation";
import { authorizeRefundExecutionDispatch } from "../dispatch-authorization";
import { fingerprintRefundRequest } from "../refund-request-fingerprint";
import {
  persistFreshRefundExecutionObservation,
  replayRefundExecutionResult,
  type PersistFreshRefundExecutionObservationInput,
  type RefundExecutionResult,
} from "../resolve-execution";
import {
  cleanupDispatchFixtures,
  createDispatchFixture,
  dispatchState,
  markDispatchContactForTest,
  redactedDispatchAuthorizationState,
  type DispatchFixture,
} from "./refund-dispatch-fixture";
import {
  createNamedDbSession,
  disconnectSessions,
  queueBehindObservedOrderLock,
} from "./refund-order-lock-barrier";
import { createTossRefundExecutionAuthorizer } from "../providers/toss/refund-authorization-orchestrator";

const LEASE_ENV = { [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED" };
const AUTH_ENV = { [REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED]: "ENABLED" };
const RESULT_ENV = { [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: "ENABLED" };
const TOSS_AUTH_ENV = {
  [REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED]: "ENABLED",
  TOSS_SANDBOX_SECRET_KEY: "synthetic_e4_pin_secret",
  TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: "merchant-e4-pin",
  TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "generation-e4-pin",
};
const OBSERVED_AT = new Date("2026-07-15T02:00:00.000Z");

type Prepared = {
  fixture: DispatchFixture;
  leaseGeneration: number;
  leaseToken: string;
  dispatchAttempt: number;
};

describe("fenced refund execution observation persistence", () => {
  const fixtures: DispatchFixture[] = [];

  beforeAll(async () => {
    const rows = await db.$queryRaw<{ databaseName: string }[]>`SELECT current_database() AS "databaseName"`;
    if (rows.length !== 1 || rows[0].databaseName !== "wig_platform_test") {
      throw new Error("Refund result integration tests require independently isolated wig_platform_test.");
    }
  });

  afterEach(async () => {
    await cleanupDispatchFixtures(...fixtures);
    fixtures.length = 0;
  });

  it("applies a fresh exact fence, leaves dispatch immutable, and replays with the gate disabled", async () => {
    const prepared = await prepareContacted(fixtures, { communicationLocale: "en" });
    const dispatchBefore = await db.refundExecutionDispatchAttempt.findUniqueOrThrow({
      where: { commandId_ordinal: { commandId: prepared.fixture.commandId, ordinal: 1 } },
    });
    const input = freshInput(prepared);

    const fresh = await persistFreshRefundExecutionObservation(db, input, RESULT_ENV);
    expectSuccess(fresh, false, RefundExecutionEvidenceApplication.APPLIED);
    expect(Object.keys(fresh).sort()).toEqual([
      "application", "commandId", "evidenceId", "ok", "refundAttemptId", "replayed",
    ]);
    expect(Object.isFrozen(fresh)).toBe(true);
    const state = await dispatchState(prepared.fixture);
    expect(state.order.status).toBe(OrderStatus.PARTIALLY_REFUNDED);
    expect(state.attempt.status).toBe(RefundAttemptStatus.SUCCEEDED);
    expect(state.attempt.processedAt).not.toBeNull();
    expect(state.attempt.processedAt?.getTime()).not.toBe(OBSERVED_AT.getTime());
    expect(state.command.status).toBe(RefundExecutionCommandStatus.DONE);
    expect(state.command.leaseOwner).toBeNull();
    expect(state.command.leaseUntil).toBeNull();
    expect(state.command.leaseTokenHash).toBeNull();
    expect(state.command.dispatchAttempt).toBe(1);
    expect(state.command.leaseGeneration).toBe(prepared.leaseGeneration);
    expect(state.evidence).toHaveLength(1);
    expect(state.evidence[0].sourceDedupKey === `refund-result:${prepared.fixture.commandId}:1`).toBe(true);
    const dispatchAfter = await db.refundExecutionDispatchAttempt.findUniqueOrThrow({
      where: { commandId_ordinal: { commandId: prepared.fixture.commandId, ordinal: 1 } },
    });
    expect(isDeepStrictEqual(dispatchAfter, dispatchBefore)).toBe(true);
    await expect(refundEmailRow(prepared.fixture.refundAttemptId)).resolves.toMatchObject({
      topic: CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1,
      dedupKey: refundSucceededEmailDedupKey(prepared.fixture.refundAttemptId),
      payload: { refundAttemptId: prepared.fixture.refundAttemptId },
    });

    const replay = await replayRefundExecutionResult(db, replayInput(input));
    expectSuccess(replay, true, RefundExecutionEvidenceApplication.APPLIED);
    expect(replay.ok && replay.evidenceId === state.evidence[0].id).toBe(true);
    const freshShapedReplay = await persistFreshRefundExecutionObservation(
      db,
      { ...input, leaseToken: "f".repeat(64) },
      {},
    );
    expectSuccess(freshShapedReplay, true, RefundExecutionEvidenceApplication.APPLIED);
    await expect(refundEmailCount(prepared.fixture.refundAttemptId)).resolves.toBe(1);
  });

  it("uses the persisted physical dispatch key instead of RefundAttempt idempotency", async () => {
    const prepared = await prepareContacted(fixtures, { communicationLocale: "en" });
    const providerOperationKey = `physical-wire-${crypto.randomUUID()}`;
    const requestFingerprint = fingerprintRefundRequest({
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      providerPaymentReference: prepared.fixture.providerPaymentKey,
      amountMinor: prepared.fixture.targetAmount,
      currency: "KRW",
      providerOperationKey,
    });
    await db.refundExecutionDispatchAttempt.update({
      where: { commandId_ordinal: { commandId: prepared.fixture.commandId, ordinal: 1 } },
      data: { providerOperationKey, requestFingerprint },
    });

    const result = await persistFreshRefundExecutionObservation(
      db,
      freshInput(prepared),
      RESULT_ENV,
    );

    expectSuccess(result, false, RefundExecutionEvidenceApplication.APPLIED);
    const evidence = await db.refundExecutionEvidence.findUniqueOrThrow({
      where: { sourceDedupKey: `refund-result:${prepared.fixture.commandId}:1` },
    });
    const dispatch = await db.refundExecutionDispatchAttempt.findUniqueOrThrow({
      where: { commandId_ordinal: { commandId: prepared.fixture.commandId, ordinal: 1 } },
    });
    expect(evidence.dispatchAttemptId).toBe(dispatch.id);
    expect(evidence.authorizingLeaseGeneration).toBe(dispatch.leaseGeneration);
  });

  it("gates only absent-evidence fresh writes and fails invalid configuration closed", async () => {
    const prepared = await prepareContacted(fixtures, { communicationLocale: "en" });
    const before = await redactedDispatchAuthorizationState(prepared.fixture);

    expectFailure(await persistFreshRefundExecutionObservation(db, freshInput(prepared), {}), "FEATURE_DISABLED");
    expectFailure(await persistFreshRefundExecutionObservation(db, freshInput(prepared), {
      [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: "true",
    }), "CONFIG_INVALID");
    expect(await redactedDispatchAuthorizationState(prepared.fixture)).toEqual(before);
  });

  it("requires an exact lease generation, token, ordinal, and contacted dispatch row", async () => {
    const contacted = await prepareContacted(fixtures);
    const before = await redactedDispatchAuthorizationState(contacted.fixture);
    expectFailure(await persistFreshRefundExecutionObservation(db, {
      ...freshInput(contacted), leaseToken: "e".repeat(64),
    }, RESULT_ENV), "FRESH_LEASE_FENCE_MISMATCH");
    expectFailure(await persistFreshRefundExecutionObservation(db, {
      ...freshInput(contacted), leaseGeneration: contacted.leaseGeneration + 1,
    }, RESULT_ENV), "FRESH_LEASE_FENCE_MISMATCH");
    expectFailure(await persistFreshRefundExecutionObservation(db, {
      ...freshInput(contacted), dispatchAttempt: 2,
    }, RESULT_ENV), "DISPATCH_ATTEMPT_MISMATCH");
    expect(await redactedDispatchAuthorizationState(contacted.fixture)).toEqual(before);

    const authorized = await prepareAuthorized(fixtures);
    expectFailure(
      await persistFreshRefundExecutionObservation(db, freshInput(authorized), RESULT_ENV),
      "CONTACT_NOT_AUTHORIZED",
    );

    const missing = await prepareContacted(fixtures);
    await db.refundExecutionDispatchAttempt.delete({
      where: { commandId_ordinal: { commandId: missing.fixture.commandId, ordinal: 1 } },
    });
    expectFailure(
      await persistFreshRefundExecutionObservation(db, freshInput(missing), RESULT_ENV),
      "CONTACT_NOT_AUTHORIZED",
    );
  });

  it("explicitly rejects public generic fresh E4 for a realistic Toss AUTHORIZED ordinal 1", async () => {
    const authorized = await prepareTossAuthorized(fixtures);
    const before = await redactedDispatchAuthorizationState(authorized.fixture);

    expectFailure(
      await persistFreshRefundExecutionObservation(db, freshInput(authorized), RESULT_ENV),
      "REFUND_LEDGER_INCONSISTENT",
    );
    expect(await redactedDispatchAuthorizationState(authorized.fixture)).toEqual(before);
  });

  it("explicitly rejects public generic fresh E4 for contacted Toss with zero writes", async () => {
    const contacted = await prepareTossAuthorized(fixtures);
    await markDispatchContactForTest(contacted.fixture);
    const before = await redactedDispatchAuthorizationState(contacted.fixture);

    expectFailure(
      await persistFreshRefundExecutionObservation(db, freshInput(contacted), RESULT_ENV),
      "REFUND_LEDGER_INCONSISTENT",
    );
    expect(await redactedDispatchAuthorizationState(contacted.fixture)).toEqual(before);
  });

  it("rejects Eximbay E4 before evidence handling with no command or evidence mutation", async () => {
    const prepared = await prepareAuthorized(fixtures);
    await replaceWithValidEximbayPayment(prepared);
    const before = await redactedDispatchAuthorizationState(prepared.fixture);
    const evidenceBefore = await db.refundExecutionEvidence.count({
      where: { commandId: prepared.fixture.commandId },
    });

    expectFailure(
      await persistFreshRefundExecutionObservation(db, freshInput(prepared), RESULT_ENV),
      "REFUND_LEDGER_INCONSISTENT",
    );

    expect(await redactedDispatchAuthorizationState(prepared.fixture)).toEqual(before);
    await expect(db.refundExecutionEvidence.count({
      where: { commandId: prepared.fixture.commandId },
    })).resolves.toBe(evidenceBefore);
  });

  it("explicitly rejects public generic replay for durable Toss artifacts with zero writes", async () => {
    const contacted = await prepareTossAuthorized(fixtures);
    await markDispatchContactForTest(contacted.fixture);
    const input = freshInput(contacted);
    await db.refundExecutionEvidence.create({
      data: {
        commandId: contacted.fixture.commandId,
        source: RefundExecutionEvidenceSource.ADAPTER_RESPONSE,
        sourceDedupKey: `refund-result:${contacted.fixture.commandId}:1`,
        outcome: input.observation.outcome,
        application: RefundExecutionEvidenceApplication.APPLIED,
        observedProviderRefundId: input.observation.observedProviderRefundId,
        reportedAmount: input.observation.reportedAmount,
        reportedCurrency: input.observation.reportedCurrency,
        safeCode: input.observation.safeCode,
        safeMessage: input.observation.safeMessage,
        observedAt: input.observation.observedAt,
      },
    });
    const before = await redactedDispatchAuthorizationState(contacted.fixture);

    expectFailure(
      await replayRefundExecutionResult(db, replayInput(input)),
      "REFUND_LEDGER_INCONSISTENT",
    );
    expect(await redactedDispatchAuthorizationState(contacted.fixture)).toEqual(before);
  });

  it("classifies stale contacted generation and authorized-request drift as ledger inconsistency", async () => {
    const stale = await prepareContacted(fixtures);
    await db.refundExecutionDispatchAttempt.update({
      where: { commandId_ordinal: { commandId: stale.fixture.commandId, ordinal: 1 } },
      data: { leaseGeneration: stale.leaseGeneration + 1 },
    });
    expectFailure(
      await persistFreshRefundExecutionObservation(db, freshInput(stale), RESULT_ENV),
      "REFUND_LEDGER_INCONSISTENT",
    );

    for (const mutate of [
      async (prepared: Prepared) => db.refundExecutionDispatchAttempt.update({
        where: { commandId_ordinal: { commandId: prepared.fixture.commandId, ordinal: 1 } },
        data: { providerOperationKey: "drifted-operation-key" },
      }),
      async (prepared: Prepared) => db.refundExecutionDispatchAttempt.update({
        where: { commandId_ordinal: { commandId: prepared.fixture.commandId, ordinal: 1 } },
        data: { requestFingerprint: "d".repeat(64) },
      }),
      async (prepared: Prepared) => db.refundExecutionDispatchAttempt.update({
        where: { commandId_ordinal: { commandId: prepared.fixture.commandId, ordinal: 1 } },
        data: { provider: PaymentProvider.TOSS, mode: PaymentMode.LIVE },
      }),
      async (prepared: Prepared) => db.payment.update({
        where: { id: prepared.fixture.paymentId },
        data: { providerPaymentKey: `drifted-reference-${crypto.randomUUID()}` },
      }),
      async (prepared: Prepared) => db.payment.update({
        where: { id: prepared.fixture.paymentId },
        data: { amount: prepared.fixture.totalAmount + 1 },
      }),
    ]) {
      const prepared = await prepareContacted(fixtures);
      await mutate(prepared);
      const result = await persistFreshRefundExecutionObservation(db, freshInput(prepared), RESULT_ENV);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected request drift failure.");
      expect(result.code).toBe("REFUND_LEDGER_INCONSISTENT");
    }
  });

  it("accepts an expired but otherwise exact contacted fence", async () => {
    const prepared = await prepareContacted(fixtures, { communicationLocale: "en" });
    await db.refundExecutionCommand.update({
      where: { id: prepared.fixture.commandId },
      data: { leaseUntil: new Date("2000-01-01T00:00:00.000Z") },
    });

    expectSuccess(
      await persistFreshRefundExecutionObservation(db, freshInput(prepared), RESULT_ENV),
      false,
    );

    const wrongGeneration = await prepareContacted(fixtures);
    await expireLease(wrongGeneration.fixture);
    expectFailure(await persistFreshRefundExecutionObservation(db, {
      ...freshInput(wrongGeneration),
      leaseGeneration: wrongGeneration.leaseGeneration + 1,
    }, RESULT_ENV), "FRESH_LEASE_FENCE_MISMATCH");

    const wrongToken = await prepareContacted(fixtures);
    await expireLease(wrongToken.fixture);
    expectFailure(await persistFreshRefundExecutionObservation(db, {
      ...freshInput(wrongToken),
      leaseToken: "e".repeat(64),
    }, RESULT_ENV), "FRESH_LEASE_FENCE_MISMATCH");

    const wrongOrdinal = await prepareContacted(fixtures);
    await expireLease(wrongOrdinal.fixture);
    expectFailure(await persistFreshRefundExecutionObservation(db, {
      ...freshInput(wrongOrdinal),
      dispatchAttempt: 2,
    }, RESULT_ENV), "DISPATCH_ATTEMPT_MISMATCH");
  });

  it.each([
    {
      outcome: RefundExecutionEvidenceOutcome.ACCEPTED_PENDING,
      attempt: RefundAttemptStatus.PROCESSING,
      command: RefundExecutionCommandStatus.WAITING_EVIDENCE,
      order: OrderStatus.REFUND_PENDING,
    },
    {
      outcome: RefundExecutionEvidenceOutcome.NOT_EXECUTED_RETRYABLE,
      attempt: RefundAttemptStatus.FAILED_RETRYABLE,
      command: RefundExecutionCommandStatus.PARKED,
      order: OrderStatus.REFUND_PENDING,
    },
    {
      outcome: RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL,
      attempt: RefundAttemptStatus.FAILED_TERMINAL,
      command: RefundExecutionCommandStatus.DONE,
      order: OrderStatus.PAID,
    },
    {
      outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
      attempt: RefundAttemptStatus.MANUAL_REVIEW,
      command: RefundExecutionCommandStatus.PARKED,
      order: OrderStatus.REFUND_PENDING,
    },
  ])("preserves the $outcome result mapping", async ({ outcome, attempt, command, order }) => {
    const prepared = await prepareContacted(fixtures, { communicationLocale: "en" });
    const result = await persistFreshRefundExecutionObservation(db, freshInput(prepared, {
      outcome,
      observedProviderRefundId: null,
      reportedAmount: null,
      reportedCurrency: null,
    }), RESULT_ENV);
    expectSuccess(result, false, RefundExecutionEvidenceApplication.APPLIED);
    const state = await dispatchState(prepared.fixture);
    expect(state.attempt.status).toBe(attempt);
    expect(state.command.status).toBe(command);
    expect(state.order.status).toBe(order);
    await expect(refundEmailCount(prepared.fixture.refundAttemptId)).resolves.toBe(0);
  });

  it("parks incomplete success and conflicting money without changing the result mapping", async () => {
    const incomplete = await prepareContacted(fixtures);
    expectSuccess(await persistFreshRefundExecutionObservation(db, freshInput(incomplete, {
      reportedAmount: null, reportedCurrency: null,
    }), RESULT_ENV), false, RefundExecutionEvidenceApplication.PARKED);
    expect((await dispatchState(incomplete.fixture)).attempt.status).toBe(RefundAttemptStatus.MANUAL_REVIEW);

    const conflict = await prepareContacted(fixtures);
    expectSuccess(await persistFreshRefundExecutionObservation(db, freshInput(conflict, {
      reportedAmount: conflict.fixture.targetAmount + 1,
    }), RESULT_ENV), false, RefundExecutionEvidenceApplication.CONFLICT);
  });

  it("commits CONFLICT when a succeeded sibling owns the observed provider refund identity", async () => {
    const selfOwned = await prepareContacted(fixtures);
    const selfOwnedProviderRefundId = `self-provider-refund-${crypto.randomUUID()}`;
    await db.refundAttempt.update({
      where: { id: selfOwned.fixture.refundAttemptId },
      data: { providerRefundId: selfOwnedProviderRefundId },
    });
    expectSuccess(
      await persistFreshRefundExecutionObservation(
        db,
        freshInput(selfOwned, { observedProviderRefundId: selfOwnedProviderRefundId }),
        RESULT_ENV,
      ),
      false,
      RefundExecutionEvidenceApplication.APPLIED,
    );

    const otherProviderRefundId = `other-provider-refund-${crypto.randomUUID()}`;
    const otherProviderFixture = await trackedFixture(fixtures);
    await addSucceededSibling(
      otherProviderFixture,
      100,
      otherProviderRefundId,
      PaymentProvider.PAYPAL,
    );
    const providerScoped = await prepareContacted(fixtures);
    expectSuccess(
      await persistFreshRefundExecutionObservation(
        db,
        freshInput(providerScoped, { observedProviderRefundId: otherProviderRefundId }),
        RESULT_ENV,
      ),
      false,
      RefundExecutionEvidenceApplication.APPLIED,
    );

    const prepared = await prepareContacted(fixtures, { communicationLocale: "en" });
    const siblingProviderRefundId = `sibling-provider-refund-${crypto.randomUUID()}`;
    const siblingId = await addSucceededSibling(
      prepared.fixture,
      100,
      siblingProviderRefundId,
    );
    const input = freshInput(prepared, { observedProviderRefundId: siblingProviderRefundId });

    const result = await persistFreshRefundExecutionObservation(db, input, RESULT_ENV);
    expectSuccess(result, false, RefundExecutionEvidenceApplication.CONFLICT);
    const state = await dispatchState(prepared.fixture);
    const sibling = await db.refundAttempt.findUniqueOrThrow({
      where: { id: siblingId },
      select: { providerRefundId: true },
    });
    const siblingIdentityUnchanged = sibling.providerRefundId === siblingProviderRefundId;
    const targetIdentityWasNotOverwritten = state.attempt.providerRefundId !== siblingProviderRefundId;
    expect(siblingIdentityUnchanged).toBe(true);
    expect(targetIdentityWasNotOverwritten).toBe(true);
    expect(state.attempt.status).toBe(RefundAttemptStatus.MANUAL_REVIEW);
    expect(state.command.status).toBe(RefundExecutionCommandStatus.PARKED);
    expect(state.order.status).toBe(OrderStatus.REFUND_PENDING);
    expect(state.evidence).toHaveLength(1);
    expect(state.evidence[0].application).toBe(RefundExecutionEvidenceApplication.CONFLICT);
    expect(state.evidence[0].safeCode).toBe("REFUND_EVIDENCE_IDENTITY_CONFLICT");
    expect(state.transitions).toHaveLength(3);
    expect(state.transitions[2].fromStatus).toBe(RefundAttemptStatus.PROCESSING);
    expect(state.transitions[2].toStatus).toBe(RefundAttemptStatus.MANUAL_REVIEW);
  });

  it("applies a complete full-refund success end to end", async () => {
    const prepared = await prepareContacted(fixtures, { totalAmount: 1_000, targetAmount: 1_000 });
    const providerRefundId = `full-provider-refund-${crypto.randomUUID()}`;
    const input = freshInput(prepared, { observedProviderRefundId: providerRefundId });

    const result = await persistFreshRefundExecutionObservation(db, input, RESULT_ENV);
    expectSuccess(result, false, RefundExecutionEvidenceApplication.APPLIED);
    const state = await dispatchState(prepared.fixture);
    const targetIdentityMatches = state.attempt.providerRefundId === providerRefundId;
    const evidenceIdentityMatches = state.evidence[0].observedProviderRefundId === providerRefundId;
    const leaseWasCleared = state.command.leaseOwner === null
      && state.command.leaseUntil === null
      && state.command.leaseTokenHash === null;
    expect(targetIdentityMatches).toBe(true);
    expect(evidenceIdentityMatches).toBe(true);
    expect(leaseWasCleared).toBe(true);
    expect(state.attempt.status).toBe(RefundAttemptStatus.SUCCEEDED);
    expect(state.command.status).toBe(RefundExecutionCommandStatus.DONE);
    expect(state.order.status).toBe(OrderStatus.REFUNDED);
    expect(state.command.leaseGeneration).toBe(prepared.leaseGeneration);
    expect(state.command.dispatchAttempt).toBe(prepared.dispatchAttempt);
    expect(state.evidence).toHaveLength(1);
  });

  it("restores PARTIALLY_REFUNDED after terminal non-execution follows a succeeded sibling", async () => {
    const prepared = await prepareContacted(fixtures);
    await addSucceededSibling(
      prepared.fixture,
      300,
      `prior-provider-refund-${crypto.randomUUID()}`,
    );
    const input = freshInput(prepared, {
      outcome: RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL,
      observedProviderRefundId: null,
      reportedAmount: null,
      reportedCurrency: null,
    });

    expectSuccess(
      await persistFreshRefundExecutionObservation(db, input, RESULT_ENV),
      false,
      RefundExecutionEvidenceApplication.APPLIED,
    );
    const state = await dispatchState(prepared.fixture);
    expect(state.attempt.status).toBe(RefundAttemptStatus.FAILED_TERMINAL);
    expect(state.command.status).toBe(RefundExecutionCommandStatus.DONE);
    expect(state.order.status).toBe(OrderStatus.PARTIALLY_REFUNDED);
  });

  it("fails closed without writes when the contacted target is not PROCESSING", async () => {
    const prepared = await prepareContacted(fixtures);
    await db.refundAttempt.update({
      where: { id: prepared.fixture.refundAttemptId },
      data: { status: RefundAttemptStatus.CANCELLED },
    });
    const before = await redactedDispatchAuthorizationState(prepared.fixture);

    expectFailure(
      await persistFreshRefundExecutionObservation(db, freshInput(prepared), RESULT_ENV),
      "REFUND_LEDGER_INCONSISTENT",
    );
    const after = await redactedDispatchAuthorizationState(prepared.fixture);
    expect(isDeepStrictEqual(after, before)).toBe(true);
  });

  it("writes accepted-pending provider identity without an Attempt self-transition", async () => {
    const prepared = await prepareContacted(fixtures);
    const providerRefundId = `pending-provider-refund-${crypto.randomUUID()}`;
    const beforeTransitionCount = (await dispatchState(prepared.fixture)).transitions.length;
    const input = freshInput(prepared, {
      outcome: RefundExecutionEvidenceOutcome.ACCEPTED_PENDING,
      observedProviderRefundId: providerRefundId,
      reportedAmount: null,
      reportedCurrency: null,
    });

    expectSuccess(
      await persistFreshRefundExecutionObservation(db, input, RESULT_ENV),
      false,
      RefundExecutionEvidenceApplication.APPLIED,
    );
    const state = await dispatchState(prepared.fixture);
    const targetIdentityMatches = state.attempt.providerRefundId === providerRefundId;
    const evidenceIdentityMatches = state.evidence[0].observedProviderRefundId === providerRefundId;
    expect(targetIdentityMatches).toBe(true);
    expect(evidenceIdentityMatches).toBe(true);
    expect(state.attempt.status).toBe(RefundAttemptStatus.PROCESSING);
    expect(state.command.status).toBe(RefundExecutionCommandStatus.WAITING_EVIDENCE);
    expect(state.order.status).toBe(OrderStatus.REFUND_PENDING);
    expect(state.transitions.length).toBe(beforeTransitionCount);
    expect(state.evidence).toHaveLength(1);
  });

  it("gives replay precedence, rejects changed evidence, and detects damaged replay artifacts", async () => {
    const prepared = await prepareContacted(fixtures);
    const input = freshInput(prepared);
    expectSuccess(await persistFreshRefundExecutionObservation(db, input, RESULT_ENV), false);

    expectFailure(
      await replayRefundExecutionResult(db, replayInput(input, { safeMessage: "Changed safe message" })),
      "EVIDENCE_IDEMPOTENCY_CONFLICT",
    );
    await db.refundExecutionCommand.update({
      where: { id: prepared.fixture.commandId },
      data: { dispatchAttempt: 2 },
    });
    expectFailure(
      await replayRefundExecutionResult(db, replayInput(input)),
      "REFUND_LEDGER_INCONSISTENT",
    );
  });

  it.each(["attempt", "command", "order", "transition"] as const)(
    "rejects replay when the evidence-owned %s artifact is damaged",
    async (artifact) => {
      const prepared = await prepareContacted(fixtures);
      const input = freshInput(prepared);
      const fresh = await persistFreshRefundExecutionObservation(db, input, RESULT_ENV);
      expect(fresh.ok).toBe(true);
      if (artifact === "attempt") {
        await db.refundAttempt.update({
          where: { id: prepared.fixture.refundAttemptId },
          data: { processedAt: null },
        });
      } else if (artifact === "command") {
        await db.refundExecutionCommand.update({
          where: { id: prepared.fixture.commandId },
          data: { status: RefundExecutionCommandStatus.PARKED },
        });
      } else if (artifact === "order") {
        await db.order.update({
          where: { id: prepared.fixture.orderId },
          data: { status: OrderStatus.PAID },
        });
      } else {
        await db.refundAttemptTransition.deleteMany({
          where: {
            refundAttemptId: prepared.fixture.refundAttemptId,
            operationKey: { startsWith: "refund-exec-apply:" },
          },
        });
      }
      const replay = await replayRefundExecutionResult(db, replayInput(input));
      expect(replay.ok).toBe(false);
      if (replay.ok) throw new Error("Expected damaged replay failure.");
      expect(replay.code).toBe("REFUND_LEDGER_INCONSISTENT");
    },
  );

  it.each([
    { table: "RefundExecutionEvidence", constraint: "e4a_test_evidence_insert", kind: "evidence" },
    { table: "RefundAttemptTransition", constraint: "e4a_test_transition_insert", kind: "transition" },
    { table: "RefundExecutionCommand", constraint: "e4a_test_command_final_cas", kind: "command" },
  ])("rolls every projection back on $kind persistence failure", async ({ table, constraint, kind }) => {
    const prepared = await prepareContacted(fixtures, { communicationLocale: "en" });
    const before = await redactedDispatchAuthorizationState(prepared.fixture);
    const predicate = faultPredicate(kind, prepared.fixture);
    await addScopedCheck(table, constraint, predicate);
    try {
      const result = await persistFreshRefundExecutionObservation(db, freshInput(prepared), RESULT_ENV);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected persistence conflict.");
      expect(result.code).toBe("PERSISTENCE_CONFLICT");
      const after = await redactedDispatchAuthorizationState(prepared.fixture);
      expect(isDeepStrictEqual(after, before)).toBe(true);
      await expect(refundEmailCount(prepared.fixture.refundAttemptId)).resolves.toBe(0);
    } finally {
      await dropScopedCheck(table, constraint);
    }
  });

  it("returns FRESH_FENCE_REQUIRED for replay when no durable evidence exists", async () => {
    const fixture = await trackedFixture(fixtures);
    expectFailure(await replayRefundExecutionResult(db, {
      commandId: fixture.commandId,
      dispatchAttempt: 1,
      observation: observation(fixture.targetAmount),
    }), "FRESH_FENCE_REQUIRED");
  });

  it("serializes exact contenders into one fresh application and one replay", async () => {
    const prepared = await prepareContacted(fixtures);
    const input = freshInput(prepared);
    const firstSession = createNamedDbSession("e4a_result_first");
    const secondSession = createNamedDbSession("e4a_result_second");
    try {
      const queued = await queueBehindObservedOrderLock(
        prepared.fixture.orderId,
        firstSession,
        () => persistFreshRefundExecutionObservation(firstSession.client, input, RESULT_ENV),
        secondSession,
        () => persistFreshRefundExecutionObservation(secondSession.client, input, RESULT_ENV),
      );
      const results = await Promise.all([queued.first, queued.second]);
      expect(results.filter((result) => result.ok && !result.replayed)).toHaveLength(1);
      expect(results.filter((result) => result.ok && result.replayed)).toHaveLength(1);
      expect((await dispatchState(prepared.fixture)).evidence).toHaveLength(1);
    } finally {
      await disconnectSessions(firstSession, secondSession);
    }
  });

  it("serializes conflicting observations into one commit and one evidence conflict", async () => {
    const prepared = await prepareContacted(fixtures);
    const firstInput = freshInput(prepared);
    const secondInput = freshInput(prepared, { safeMessage: "Different safe observation" });
    const firstSession = createNamedDbSession("e4a_conflict_first");
    const secondSession = createNamedDbSession("e4a_conflict_second");
    try {
      const queued = await queueBehindObservedOrderLock(
        prepared.fixture.orderId,
        firstSession,
        () => persistFreshRefundExecutionObservation(firstSession.client, firstInput, RESULT_ENV),
        secondSession,
        () => persistFreshRefundExecutionObservation(secondSession.client, secondInput, RESULT_ENV),
      );
      const results = await Promise.all([queued.first, queued.second]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok && result.code === "EVIDENCE_IDEMPOTENCY_CONFLICT"))
        .toHaveLength(1);
      expect((await dispatchState(prepared.fixture)).evidence).toHaveLength(1);
    } finally {
      await disconnectSessions(firstSession, secondSession);
    }
  });

  it("serializes replay behind fresh commit without requiring lease authority", async () => {
    const prepared = await prepareContacted(fixtures);
    const input = freshInput(prepared);
    const freshSession = createNamedDbSession("e4a_fresh_before_replay");
    const replaySession = createNamedDbSession("e4a_replay_after_fresh");
    try {
      const queued = await queueBehindObservedOrderLock(
        prepared.fixture.orderId,
        freshSession,
        () => persistFreshRefundExecutionObservation(freshSession.client, input, RESULT_ENV),
        replaySession,
        () => replayRefundExecutionResult(replaySession.client, replayInput(input)),
      );
      expectSuccess(await queued.first, false);
      expectSuccess(await queued.second, true);
    } finally {
      await disconnectSessions(freshSession, replaySession);
    }
  });

  it("serializes a generation transfer before a stale fresh holder", async () => {
    const prepared = await prepareContacted(fixtures);
    const staleInput = freshInput(prepared);
    const mutationSession = createNamedDbSession("e4a_generation_change");
    const staleSession = createNamedDbSession("e4a_stale_holder");
    try {
      const queued = await queueBehindObservedOrderLock(
        prepared.fixture.orderId,
        mutationSession,
        () => mutateLeaseUnderCanonicalLocks(mutationSession.client, prepared, {
          leaseGeneration: prepared.leaseGeneration + 1,
          leaseTokenHash: "c".repeat(64),
        }),
        staleSession,
        () => persistFreshRefundExecutionObservation(staleSession.client, staleInput, RESULT_ENV),
      );
      await queued.first;
      const stale = await queued.second;
      expect(stale.ok).toBe(false);
      if (stale.ok) throw new Error("Expected stale fence failure.");
      expect(stale.code).toBe("FRESH_LEASE_FENCE_MISMATCH");
      expect((await dispatchState(prepared.fixture)).evidence).toHaveLength(0);
    } finally {
      await disconnectSessions(mutationSession, staleSession);
    }
  });
});

async function prepareAuthorized(
  fixtures: DispatchFixture[],
  options: Parameters<typeof createDispatchFixture>[0] = {},
): Promise<Prepared> {
  const fixture = await trackedFixture(fixtures, options);
  const lease = await acquireRefundExecutionLease(db, {
    commandId: fixture.commandId,
    leaseOwner: "e4a-result-worker",
  }, LEASE_ENV);
  if (!lease.ok) throw new Error(`Expected lease success, received ${lease.code}.`);
  const authorization = await authorizeRefundExecutionDispatch(db, {
    commandId: fixture.commandId,
    leaseGeneration: lease.lease.leaseGeneration,
    leaseToken: lease.lease.leaseToken,
  }, AUTH_ENV);
  if (!authorization.ok) throw new Error(`Expected authorization success, received ${authorization.code}.`);
  return {
    fixture,
    leaseGeneration: lease.lease.leaseGeneration,
    leaseToken: lease.lease.leaseToken,
    dispatchAttempt: authorization.authorization.dispatchAttempt,
  };
}

async function prepareContacted(
  fixtures: DispatchFixture[],
  options: Parameters<typeof createDispatchFixture>[0] = {},
): Promise<Prepared> {
  const prepared = await prepareAuthorized(fixtures, options);
  await markDispatchContactForTest(prepared.fixture, prepared.dispatchAttempt);
  const row = await db.refundExecutionDispatchAttempt.findUniqueOrThrow({
    where: {
      commandId_ordinal: {
        commandId: prepared.fixture.commandId,
        ordinal: prepared.dispatchAttempt,
      },
    },
  });
  expect(row.state).toBe(RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED);
  return prepared;
}

async function prepareTossAuthorized(fixtures: DispatchFixture[]): Promise<Prepared> {
  const fixture = await trackedFixture(fixtures, { totalAmount: 85_000, targetAmount: 85_000 });
  const lease = await acquireRefundExecutionLease(db, {
    commandId: fixture.commandId,
    leaseOwner: "e4-toss-pin-worker",
  }, LEASE_ENV);
  if (!lease.ok) throw new Error(`Expected lease success, received ${lease.code}.`);
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
  const authorize = createTossRefundExecutionAuthorizer({
    lookup: () => Promise.resolve({
      kind: "response",
      body: JSON.stringify({
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
      }),
    }),
  });
  const authorization = await authorize(db, {
    commandId: fixture.commandId,
    leaseGeneration: lease.lease.leaseGeneration,
    leaseToken: lease.lease.leaseToken,
  }, TOSS_AUTH_ENV);
  if (!authorization.ok) throw new Error(`Expected Toss authorization: ${authorization.code}.`);
  return {
    fixture,
    leaseGeneration: lease.lease.leaseGeneration,
    leaseToken: lease.lease.leaseToken,
    dispatchAttempt: authorization.authorization.dispatchAttempt,
  };
}

function freshInput(
  prepared: Prepared,
  observationOverride: Record<string, unknown> = {},
): PersistFreshRefundExecutionObservationInput {
  return {
    commandId: prepared.fixture.commandId,
    dispatchAttempt: prepared.dispatchAttempt,
    leaseGeneration: prepared.leaseGeneration,
    leaseToken: prepared.leaseToken,
    observation: observation(prepared.fixture.targetAmount, observationOverride),
  };
}

function replayInput(
  input: PersistFreshRefundExecutionObservationInput,
  observationOverride: Record<string, unknown> = {},
) {
  return {
    commandId: input.commandId,
    dispatchAttempt: input.dispatchAttempt,
    observation: { ...input.observation, ...observationOverride },
  };
}

function observation(amount: number, overrides: Record<string, unknown> = {}) {
  return {
    outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
    observedProviderRefundId: `provider-refund-${crypto.randomUUID()}`,
    reportedAmount: amount,
    reportedCurrency: "KRW",
    safeCode: null,
    safeMessage: null,
    observedAt: new Date(OBSERVED_AT.getTime()),
    ...overrides,
  };
}

async function trackedFixture(
  fixtures: DispatchFixture[],
  options: Parameters<typeof createDispatchFixture>[0] = {},
): Promise<DispatchFixture> {
  const fixture = await createDispatchFixture(options);
  fixtures.push(fixture);
  return fixture;
}

async function replaceWithValidEximbayPayment(prepared: Prepared): Promise<void> {
  const original = await db.payment.findUniqueOrThrow({
    where: { id: prepared.fixture.paymentId },
    select: { id: true, checkoutSessionId: true, mode: true, amount: true, currency: true },
  });
  const replacementId = await db.$transaction(async (tx) => {
    const replacement = await tx.payment.create({
      data: {
        checkoutSessionId: original.checkoutSessionId,
        provider: PaymentProvider.EXIMBAY,
        mode: original.mode,
        status: PaymentAttemptStatus.SUCCEEDED,
        attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
        amount: original.amount,
        currency: original.currency,
        providerOrderId: syntheticEximbayProviderOrderId(),
        providerRef: `provider_ref_eximbay_${crypto.randomUUID()}`,
        providerPaymentKey: `provider_payment_eximbay_${crypto.randomUUID()}`,
        idempotencyKey: `payment_eximbay_${crypto.randomUUID()}`,
        financialSucceededAt: OBSERVED_AT,
        blockingEndedAt: OBSERVED_AT,
      },
      select: { id: true },
    });
    await tx.order.update({
      where: { id: prepared.fixture.orderId },
      data: { paymentId: replacement.id },
    });
    await tx.refundAttempt.update({
      where: { id: prepared.fixture.refundAttemptId },
      data: { paymentId: replacement.id, provider: PaymentProvider.EXIMBAY },
    });
    await tx.refundExecutionDispatchAttempt.update({
      where: {
        commandId_ordinal: {
          commandId: prepared.fixture.commandId,
          ordinal: prepared.dispatchAttempt,
        },
      },
      data: { provider: PaymentProvider.EXIMBAY },
    });
    await tx.payment.delete({ where: { id: original.id } });
    return replacement.id;
  });
  prepared.fixture.paymentId = replacementId;
}

async function addSucceededSibling(
  fixture: DispatchFixture,
  amount: number,
  providerRefundId: string,
  provider: PaymentProvider = PaymentProvider.MOCK,
): Promise<string> {
  const id = `refund_sibling_${crypto.randomUUID()}`;
  await db.refundAttempt.create({
    data: {
      id,
      orderId: fixture.orderId,
      paymentId: fixture.paymentId,
      amount,
      currency: "KRW",
      status: RefundAttemptStatus.SUCCEEDED,
      reason: "Prior verified sibling refund",
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      provider,
      mode: PaymentMode.SANDBOX,
      providerRefundId,
      idempotencyKey: `refund:${fixture.paymentId}:${id}`,
      requestedAt: new Date(OBSERVED_AT.getTime() - 20_000),
      processedAt: new Date(OBSERVED_AT.getTime() - 10_000),
    },
  });
  return id;
}

async function expireLease(fixture: DispatchFixture): Promise<void> {
  await db.refundExecutionCommand.update({
    where: { id: fixture.commandId },
    data: { leaseUntil: new Date("2000-01-01T00:00:00.000Z") },
  });
}

function expectSuccess(
  result: RefundExecutionResult,
  replayed: boolean,
  application?: RefundExecutionEvidenceApplication,
): void {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Expected result success, received ${result.code}.`);
  expect(result.replayed).toBe(replayed);
  if (application) expect(result.application).toBe(application);
  expect(Object.isFrozen(result)).toBe(true);
}

function expectFailure(
  result: RefundExecutionResult,
  code: Extract<RefundExecutionResult, { ok: false }>["code"],
): void {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected result failure.");
  expect(result.code).toBe(code);
  expect(Object.isFrozen(result)).toBe(true);
}

async function refundEmailRow(refundAttemptId: string) {
  return db.paymentOutbox.findUnique({
    where: { dedupKey: refundSucceededEmailDedupKey(refundAttemptId) },
  });
}

async function refundEmailCount(refundAttemptId: string): Promise<number> {
  return db.paymentOutbox.count({
    where: { dedupKey: refundSucceededEmailDedupKey(refundAttemptId) },
  });
}

function faultPredicate(kind: string, fixture: DispatchFixture): string {
  if (kind === "evidence") return `"commandId" <> '${safeSqlId(fixture.commandId)}'`;
  if (kind === "transition") {
    return `"refundAttemptId" <> '${safeSqlId(fixture.refundAttemptId)}' OR "fromStatus" IS DISTINCT FROM 'PROCESSING'::"RefundAttemptStatus"`;
  }
  if (kind === "command") {
    return `"id" <> '${safeSqlId(fixture.commandId)}' OR "leaseTokenHash" IS NOT NULL`;
  }
  throw new Error("Unknown refund result fault fixture kind.");
}

function safeSqlId(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Fixture id is not SQL-safe.");
  return value;
}

async function addScopedCheck(table: string, constraint: string, predicate: string): Promise<void> {
  await proveTestDatabase();
  if (!/^[A-Za-z]+$/.test(table) || !/^[a-z0-9_]+$/.test(constraint)) {
    throw new Error("Unsafe test constraint identifier.");
  }
  await db.$executeRawUnsafe(
    `ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" CHECK (${predicate})`,
  );
}

async function dropScopedCheck(table: string, constraint: string): Promise<void> {
  await proveTestDatabase();
  if (!/^[A-Za-z]+$/.test(table) || !/^[a-z0-9_]+$/.test(constraint)) {
    throw new Error("Unsafe test constraint identifier.");
  }
  await db.$executeRawUnsafe(`ALTER TABLE "${table}" DROP CONSTRAINT "${constraint}"`);
}

async function proveTestDatabase(): Promise<void> {
  const rows = await db.$queryRaw<{ databaseName: string }[]>`SELECT current_database() AS "databaseName"`;
  if (rows.length !== 1 || rows[0].databaseName !== "wig_platform_test") {
    throw new Error("Refund result fault fixtures require wig_platform_test.");
  }
}

async function mutateLeaseUnderCanonicalLocks(
  client: PrismaClient,
  prepared: Prepared,
  data: Prisma.RefundExecutionCommandUpdateInput,
): Promise<void> {
  await client.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "Order" WHERE "id" = ${prepared.fixture.orderId} FOR UPDATE
    `);
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "RefundAttempt" WHERE "id" = ${prepared.fixture.refundAttemptId} FOR UPDATE
    `);
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "RefundExecutionCommand" WHERE "id" = ${prepared.fixture.commandId} FOR UPDATE
    `);
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "RefundExecutionDispatchAttempt"
      WHERE "commandId" = ${prepared.fixture.commandId} AND "ordinal" = ${prepared.dispatchAttempt}
      FOR UPDATE
    `);
    await tx.refundExecutionCommand.update({
      where: { id: prepared.fixture.commandId },
      data,
    });
  });
}
