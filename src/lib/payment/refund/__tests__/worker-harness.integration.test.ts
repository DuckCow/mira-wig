import {
  OrderStatus,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
} from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { AuthorizedRefundDispatch } from "../authorize-dispatch";
import { RefundProviderContractError, type RefundProviderPort, type RefundProviderRequest } from "../provider-port";
import {
  DeterministicMockRefundProvider,
  type DeterministicMockRefundPlan,
} from "../providers/deterministic-mock-refund-provider";
import {
  authorizeWorkerDispatch,
  callRefundPort,
  resolveWorkerObservation,
  runRefundWorkerHarness,
} from "./refund-worker-harness";
import {
  DISPATCH_NOW,
  LEASE_UNTIL,
  cleanupDispatchFixtures,
  createDispatchFixture,
  dispatchState,
  type DispatchFixture,
} from "./refund-dispatch-fixture";

const RESOLVER_NOW = new Date("2026-07-11T07:01:00.000Z");
const OBSERVED_AT = new Date("2026-07-11T07:00:30.000Z");

describe("test-only refund worker harness", () => {
  const fixtures: DispatchFixture[] = [];

  afterEach(async () => {
    await cleanupDispatchFixtures(...fixtures);
    fixtures.length = 0;
  });

  it.each([
    {
      outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
      attempt: RefundAttemptStatus.SUCCEEDED,
      command: RefundExecutionCommandStatus.DONE,
      order: OrderStatus.PARTIALLY_REFUNDED,
      application: RefundExecutionEvidenceApplication.APPLIED,
      transitions: 3,
    },
    {
      outcome: RefundExecutionEvidenceOutcome.ACCEPTED_PENDING,
      attempt: RefundAttemptStatus.PROCESSING,
      command: RefundExecutionCommandStatus.WAITING_EVIDENCE,
      order: OrderStatus.REFUND_PENDING,
      application: RefundExecutionEvidenceApplication.APPLIED,
      transitions: 2,
    },
    {
      outcome: RefundExecutionEvidenceOutcome.NOT_EXECUTED_RETRYABLE,
      attempt: RefundAttemptStatus.FAILED_RETRYABLE,
      command: RefundExecutionCommandStatus.PARKED,
      order: OrderStatus.REFUND_PENDING,
      application: RefundExecutionEvidenceApplication.APPLIED,
      transitions: 3,
    },
    {
      outcome: RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL,
      attempt: RefundAttemptStatus.FAILED_TERMINAL,
      command: RefundExecutionCommandStatus.DONE,
      order: OrderStatus.PAID,
      application: RefundExecutionEvidenceApplication.APPLIED,
      transitions: 3,
    },
    {
      outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
      attempt: RefundAttemptStatus.MANUAL_REVIEW,
      command: RefundExecutionCommandStatus.PARKED,
      order: OrderStatus.REFUND_PENDING,
      application: RefundExecutionEvidenceApplication.APPLIED,
      transitions: 3,
    },
  ])("authorizes, invokes, and resolves $outcome", async (scenario) => {
    const fixture = await trackedFixture(fixtures);
    const beforePayment = (await dispatchState(fixture)).payment;
    const port = mockPort(fixture, observationFor(scenario.outcome, fixture));

    const result = await runRefundWorkerHarness(db, authorizationInput(fixture), port, RESOLVER_NOW);
    const state = await dispatchState(fixture);

    expect(result).toMatchObject({ ok: true, application: scenario.application, replayed: false });
    expect(state.order.status).toBe(scenario.order);
    expect(state.payment).toEqual(beforePayment);
    expect(state.attempt.status).toBe(scenario.attempt);
    expect(state.command).toMatchObject({ status: scenario.command, dispatchAttempt: 1, leaseOwner: null, leaseUntil: null });
    expect(state.evidence).toHaveLength(1);
    expect(state.evidence[0]).toMatchObject({ outcome: scenario.outcome, observedAt: OBSERVED_AT });
    expect(state.transitions).toHaveLength(scenario.transitions);
    expect(port.physicalInvocationCount).toBe(1);
  });

  it.each([
    {
      label: "success without money evidence",
      observation: (fixture: DispatchFixture) => observationFor(RefundExecutionEvidenceOutcome.SUCCEEDED, fixture, {
        reportedAmount: null,
        reportedCurrency: null,
      }),
      application: RefundExecutionEvidenceApplication.PARKED,
    },
    {
      label: "mismatched positive money evidence",
      observation: (fixture: DispatchFixture) => observationFor(RefundExecutionEvidenceOutcome.SUCCEEDED, fixture, {
        reportedAmount: fixture.targetAmount + 1,
      }),
      application: RefundExecutionEvidenceApplication.CONFLICT,
    },
  ])("returns resolver $application for $label", async (scenario) => {
    const fixture = await trackedFixture(fixtures);
    const result = await runRefundWorkerHarness(
      db,
      authorizationInput(fixture),
      mockPort(fixture, scenario.observation(fixture)),
      RESOLVER_NOW,
    );
    const state = await dispatchState(fixture);
    expect(result).toMatchObject({ ok: true, application: scenario.application });
    expect(state.attempt.status).toBe(RefundAttemptStatus.MANUAL_REVIEW);
    expect(state.command.status).toBe(RefundExecutionCommandStatus.PARKED);
    expect(state.evidence).toHaveLength(1);
  });

  it("returns CONFLICT when another attempt owns the provider refund identity", async () => {
    const fixture = await trackedFixture(fixtures);
    const owner = await trackedFixture(fixtures);
    await db.refundAttempt.update({
      where: { id: owner.refundAttemptId },
      data: { providerRefundId: "provider_refund_shared" },
    });
    const result = await runRefundWorkerHarness(
      db,
      authorizationInput(fixture),
      mockPort(fixture, observationFor(RefundExecutionEvidenceOutcome.SUCCEEDED, fixture, {
        observedProviderRefundId: "provider_refund_shared",
      })),
      RESOLVER_NOW,
    );
    expect(result).toMatchObject({ ok: true, application: RefundExecutionEvidenceApplication.CONFLICT });
    expect((await dispatchState(fixture)).attempt.status).toBe(RefundAttemptStatus.MANUAL_REVIEW);
  });

  it.each([
    ["missing plan", () => new DeterministicMockRefundProvider([])],
    ["identity conflict", (fixture: DispatchFixture) => new DeterministicMockRefundProvider([plan(
      fixture,
      observationFor(RefundExecutionEvidenceOutcome.SUCCEEDED, fixture),
      { amount: fixture.targetAmount + 1 },
    )])],
    ["provider contract", () => throwingPort(new RefundProviderContractError(
      "INVALID_REFUND_PROVIDER_REQUEST",
      "Refund provider request is invalid.",
    ))],
    ["unexpected", () => throwingPort(new Error("Unexpected test-local adapter failure."))],
  ] as const)("propagates %s and leaves the durable lease stranded", async (_label, buildPort) => {
    const fixture = await trackedFixture(fixtures);
    const beforePayment = (await dispatchState(fixture)).payment;
    const port = buildPort(fixture);

    await expect(runRefundWorkerHarness(db, authorizationInput(fixture), port, RESOLVER_NOW)).rejects.toBeDefined();

    const state = await dispatchState(fixture);
    expect(state.order.status).toBe(OrderStatus.REFUND_PENDING);
    expect(state.payment).toEqual(beforePayment);
    expect(state.attempt.status).toBe(RefundAttemptStatus.PROCESSING);
    expect(state.command).toMatchObject({ status: RefundExecutionCommandStatus.LEASED, dispatchAttempt: 1 });
    expect(state.evidence).toEqual([]);
    expect(state.transitions).toHaveLength(2);
  });

  it("exposes explicit crash boundaries without production fault injection", async () => {
    const fixture = await trackedFixture(fixtures);
    const port = mockPort(fixture, observationFor(RefundExecutionEvidenceOutcome.SUCCEEDED, fixture));
    const authorization = await authorizeWorkerDispatch(db, authorizationInput(fixture));
    if (!authorization.ok) throw new Error(`Authorization failed: ${authorization.code}`);

    let state = await dispatchState(fixture);
    expect(state.command.status).toBe(RefundExecutionCommandStatus.LEASED);
    expect(state.evidence).toEqual([]);

    const retainedObservation = await callRefundPort(port, authorization.dispatch);
    state = await dispatchState(fixture);
    expect(state.command.status).toBe(RefundExecutionCommandStatus.LEASED);
    expect(state.evidence).toEqual([]);

    await resolveWorkerObservation(db, authorization.dispatch, retainedObservation, RESOLVER_NOW);
    state = await dispatchState(fixture);
    expect(state.command.status).toBe(RefundExecutionCommandStatus.DONE);
    expect(state.evidence).toHaveLength(1);
  });

  it("reuses retained context for exact MOCK and resolver replay without another logical refund", async () => {
    const fixture = await trackedFixture(fixtures);
    const port = mockPort(fixture, observationFor(RefundExecutionEvidenceOutcome.SUCCEEDED, fixture));
    const authorization = await authorizeWorkerDispatch(db, authorizationInput(fixture));
    if (!authorization.ok) throw new Error(`Authorization failed: ${authorization.code}`);
    const firstObservation = await callRefundPort(port, authorization.dispatch);
    const first = await resolveWorkerObservation(db, authorization.dispatch, firstObservation, RESOLVER_NOW);
    const replayObservation = await callRefundPort(port, authorization.dispatch);
    const replay = await resolveWorkerObservation(db, authorization.dispatch, replayObservation, RESOLVER_NOW);

    expect(first).toMatchObject({ ok: true, replayed: false });
    expect(replay).toMatchObject({ ok: true, replayed: true });
    expect(replayObservation).toEqual(firstObservation);
    expect(port.configuredOperationCount).toBe(1);
    expect(port.physicalInvocationCount).toBe(2);
    const state = await dispatchState(fixture);
    expect(state.evidence).toHaveLength(1);
    expect(state.transitions).toHaveLength(3);
  });

  it("converges concurrent duplicate use of one authorized context", async () => {
    const fixture = await trackedFixture(fixtures);
    const port = mockPort(fixture, observationFor(RefundExecutionEvidenceOutcome.SUCCEEDED, fixture));
    const authorization = await authorizeWorkerDispatch(db, authorizationInput(fixture));
    if (!authorization.ok) throw new Error(`Authorization failed: ${authorization.code}`);
    const run = async () => {
      const observation = await callRefundPort(port, authorization.dispatch);
      return resolveWorkerObservation(db, authorization.dispatch, observation, RESOLVER_NOW);
    };
    const results = await Promise.all([run(), run()]);

    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ ok: true, replayed: false }),
      expect.objectContaining({ ok: true, replayed: true }),
    ]));
    expect((await dispatchState(fixture)).evidence).toHaveLength(1);
    expect(port.configuredOperationCount).toBe(1);
  });

  it("rejects a changed ordinal without evidence and accepts the retained exact ordinal", async () => {
    const fixture = await trackedFixture(fixtures);
    const port = mockPort(fixture, observationFor(RefundExecutionEvidenceOutcome.SUCCEEDED, fixture));
    const authorization = await authorizeWorkerDispatch(db, authorizationInput(fixture));
    if (!authorization.ok) throw new Error(`Authorization failed: ${authorization.code}`);
    const observation = await callRefundPort(port, authorization.dispatch);
    const staleContext: AuthorizedRefundDispatch = Object.freeze({
      ...authorization.dispatch,
      dispatchAttempt: authorization.dispatch.dispatchAttempt + 1,
    });

    await expect(resolveWorkerObservation(db, staleContext, observation, RESOLVER_NOW))
      .resolves.toMatchObject({ ok: false, code: "COMMAND_STATE_CONFLICT" });
    expect((await dispatchState(fixture)).evidence).toEqual([]);
    await expect(resolveWorkerObservation(db, authorization.dispatch, observation, RESOLVER_NOW))
      .resolves.toMatchObject({ ok: true, replayed: false });
  });
});

function authorizationInput(fixture: DispatchFixture) {
  return { commandId: fixture.commandId, leaseOwner: "worker-harness", leaseUntil: LEASE_UNTIL, now: DISPATCH_NOW };
}

function observationFor(
  outcome: RefundExecutionEvidenceOutcome,
  fixture: DispatchFixture,
  override: Partial<DeterministicMockRefundPlan["observation"]> = {},
): DeterministicMockRefundPlan["observation"] {
  return {
    outcome,
    observedProviderRefundId: null,
    reportedAmount: outcome === RefundExecutionEvidenceOutcome.SUCCEEDED ? fixture.targetAmount : null,
    reportedCurrency: outcome === RefundExecutionEvidenceOutcome.SUCCEEDED ? "KRW" : null,
    safeCode: outcome === RefundExecutionEvidenceOutcome.SUCCEEDED ? null : `MOCK.${outcome}`,
    safeMessage: outcome === RefundExecutionEvidenceOutcome.SUCCEEDED ? null : "Safe deterministic MOCK result.",
    observedAt: OBSERVED_AT,
    ...override,
  };
}

function mockPort(
  fixture: DispatchFixture,
  observation: DeterministicMockRefundPlan["observation"],
): DeterministicMockRefundProvider {
  return new DeterministicMockRefundProvider([plan(fixture, observation)]);
}

function plan(
  fixture: DispatchFixture,
  observation: DeterministicMockRefundPlan["observation"],
  requestOverride: Partial<RefundProviderRequest> = {},
): DeterministicMockRefundPlan {
  const expectedRequest = {
    providerPaymentReference: fixture.providerPaymentKey,
    amount: fixture.targetAmount,
    currency: "KRW",
    operationKey: fixture.operationKey,
    ...requestOverride,
  };
  return { operationKey: fixture.operationKey, expectedRequest, observation };
}

function throwingPort(error: Error): RefundProviderPort {
  return { refund: () => Promise.reject(error) };
}

async function trackedFixture(fixtures: DispatchFixture[]): Promise<DispatchFixture> {
  const fixture = await createDispatchFixture();
  fixtures.push(fixture);
  return fixture;
}
