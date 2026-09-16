import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  OrderStatus,
  PaymentAdapterExecutionKind,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandEventType,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../eximbay-refund-canary-target-binding", async () => {
  const actual = await vi.importActual<typeof import("../eximbay-refund-canary-target-binding")>(
    "../eximbay-refund-canary-target-binding",
  );
  return {
    ...actual,
    calculateEximbayCanaryTargetDigest: vi.fn(() =>
      "e9fc5296fa962cefbcfe17fd57f23c637ede5ed02408450146425ce2dbc1953c"),
  };
});

import {
  REFUND_READINESS_BUSINESS_STATE_READBACK_CODE,
  REFUND_READINESS_BUSINESS_STATE_READBACK_JOB,
  REFUND_READINESS_BUSINESS_STATE_READBACK_MODE,
  REFUND_READINESS_BUSINESS_STATE_READBACK_ROLE,
  REFUND_READINESS_FIXED_TARGET,
  REFUND_READINESS_SQL,
  readRefundReadinessBusinessState,
  type RefundReadinessQuery,
} from "../../../../../containers/refund-db-bootstrap/refund-readiness-business-state-readback";
import {
  runDatabaseBootstrapEntrypoint,
  type RuntimeDependencies,
} from "../../../../../containers/refund-db-bootstrap/entrypoint";

const SNAPSHOT = new Date("2026-09-13T03:00:00.000Z");
const REQUESTED = new Date("2026-09-08T07:50:00.000Z");
const CLAIMED = new Date("2026-09-08T08:00:00.000Z");
const LEASE_ONE = new Date("2026-09-08T08:07:50.494Z");
const LEASE_TWO = new Date("2026-09-08T08:20:00.000Z");
const TARGET = REFUND_READINESS_FIXED_TARGET;
const HISTORICAL_RELEASE_DIGESTS = Object.freeze([
  "48eabfff63ec506721913f9f7566cbd4ee12474ba629460560a9b6bbb4a2312a",
  "c94117d2813c480941e3c28c516b1ad9d72c5219e247e655fcb508e92b0c6fa3",
]);

describe("fixed Eximbay refund-readiness business-state readback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a coherent READY snapshot with bounded exact future effects", async () => {
    const { query, calls } = queryFixture(readyFixture());
    const result = await readRefundReadinessBusinessState(query);

    expect(result).toMatchObject({
      ok: true,
      code: REFUND_READINESS_BUSINESS_STATE_READBACK_CODE,
      terminalResult: "READY",
      dbSnapshotTime: SNAPSHOT.toISOString(),
      databaseUser: REFUND_READINESS_BUSINESS_STATE_READBACK_ROLE,
      transactionIsolation: "repeatable read",
      transactionReadOnly: true,
      currentGeneration: 2,
      leaseState: {
        state: "EXPIRED",
        blocksNextExecution: false,
        generationTransitionRequired: "YES",
      },
      dispatch: { providerContactState: "PROVEN_NONE" },
      successfulRefundTotal: {
        capturedAmountMinor: 100,
        totalSuccessfulRefundMinor: 0,
        remainingRefundableAmountMinor: 100,
        targetRefundMinor: 100,
      },
      exactTargetAlreadyRefunded: "NO",
      duplicateRefundRisk: "NONE",
      durableHistoryCoherent: "YES",
      currentStateMatchesExactRefundTarget: true,
      currentProviderStateSafeForOneShot: true,
      exactFutureEffectBudgetEstablished: true,
      readyForOneShotLiveRefundAuthorityDecision: true,
      providerEffects: 0,
      durableWrites: 0,
    });
    expect(result.authorizationInventory).toMatchObject({
      currentGenerationUnusedExpired: 1,
      nextRequirement: "REVOKE_EXPIRED_THEN_ISSUE_ONE_FRESH_AUTHORIZATION",
      preExecutionRevocationRequired: true,
    });
    expect(result.proposedOneShotEffectUpperBounds).toMatchObject({
      AUTHORIZATION_ISSUANCES_MAX: { max: 1, phase: "NORMAL_SUCCESS" },
      AUTHORIZATION_REVOCATIONS_MAX: { max: 1, phase: "NORMAL_SUCCESS" },
      AUTHORIZATION_CONSUMPTIONS_MAX: { max: 1, phase: "NORMAL_SUCCESS" },
      GENERATION_TRANSITIONS_MAX: { max: 1, phase: "NORMAL_SUCCESS" },
      WORKER_EXECUTIONS_MAX: { max: 1, phase: "NORMAL_SUCCESS" },
      WORKER_RETRIES_MAX: { max: 0 },
      PRE_REFUND_PROVIDER_RETRIEVES_MAX: { max: 1, phase: "NORMAL_SUCCESS" },
      REFUND_TRANSPORT_INVOCATIONS_MAX: { max: 1, phase: "NORMAL_SUCCESS" },
      REFUND_TRANSPORT_RETRIES_MAX: { max: 0 },
      OUTBOX_INSERTS_MAX: { max: 1, phase: "NORMAL_SUCCESS" },
      EXTERNAL_EMAIL_SENDS_MAX: { max: 0 },
    });
    expect(result.autonomousDownstreamEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effect: "RefundAttemptTransition", durableWrite: true }),
      expect.objectContaining({
        effect: "PaymentOutbox refund-success email intent",
        expectedForThisTarget: true,
      }),
      expect.objectContaining({ effect: "external refund-success email", externalEffect: true,
        automaticAfterRefundSuccess: false }),
    ]));
    expect(calls[0]?.sql).toBe(REFUND_READINESS_SQL.begin);
    expect(calls.at(-1)?.sql).toBe(REFUND_READINESS_SQL.commit);
  });

  it("exposes exact refund-email metadata without payload or recipient PII", async () => {
    const fixture = readyFixture();
    const privateRecipient = "customer-private@example.test";
    const privateBody = "private rendered email body";
    const result = await readRefundReadinessBusinessState(queryFixture({
      ...fixture,
      outbox: [
        Object.freeze({
          id: "outbox-primary",
          topic: "customer.refund-succeeded.email.v1",
          payload: {
            refundAttemptId: TARGET.refundAttemptId,
            email: privateRecipient,
            body: privateBody,
          },
          status: "DONE",
          attempts: 1,
          dedupKey: `customer-refund-succeeded:v1:${TARGET.refundAttemptId}`,
          processedAt: SNAPSHOT,
        }),
        Object.freeze({
          id: "outbox-duplicate",
          topic: "customer.refund-succeeded.email.v1",
          payload: { refundAttemptId: TARGET.refundAttemptId },
          status: "PENDING",
          attempts: 0,
          dedupKey: "unexpected-duplicate-key",
          processedAt: null,
        }),
      ],
    }).query);

    expect(result.refundSuccessEmailIntent).toEqual({
      intentCount: 2,
      duplicateIntentCount: 1,
      topic: "customer.refund-succeeded.email.v1",
      template: "refund-succeeded-v1",
      topicMatches: true,
      dedupKeyMatches: true,
      locale: "en",
      deliveryState: "DONE",
      attemptCount: 1,
      terminalMarker: false,
      sentMarker: true,
    });
    const output = JSON.stringify(result);
    expect(output).not.toContain(privateRecipient);
    expect(output).not.toContain(privateBody);
    expect(output).not.toContain("payload");
  });

  it("preserves revoked historical releases while bounding one expired-slot replacement", async () => {
    const fixture = readyFixture();
    const expired = fixture.authorizations[0];
    const revokedAt = new Date(SNAPSHOT.getTime() - 30_000);
    const historical = HISTORICAL_RELEASE_DIGESTS.map((releasePolicyDigest, index) => (
      historicalAuthorization(expired, `authorization-historical-${index + 1}`, {
        releasePolicyDigest,
        revokedAt,
      })
    ));
    const current = Array.from({ length: 9 }, (_, index) => historicalAuthorization(
      expired,
      `authorization-current-revoked-${index + 1}`,
      { revokedAt },
    ));
    const result = await readRefundReadinessBusinessState(queryFixture({
      ...fixture,
      authorizations: [expired, ...historical, ...current],
    }).query);

    expect(result).toMatchObject({
      terminalResult: "READY",
      readyForOneShotLiveRefundAuthorityDecision: true,
      authorizationInventory: {
        rowsTotal: 12,
        currentGenerationUnusedUnexpired: 0,
        currentGenerationUnusedExpired: 1,
        currentGenerationRevoked: 11,
        currentGenerationConsumed: 0,
        nextRequirement: "REVOKE_EXPIRED_THEN_ISSUE_ONE_FRESH_AUTHORIZATION",
        preExecutionRevocationRequired: true,
      },
      proposedOneShotEffectUpperBounds: {
        AUTHORIZATION_ISSUANCES_MAX: { max: 1 },
        AUTHORIZATION_REVOCATIONS_MAX: { max: 1 },
      },
    });
    expect(result.terminalResult).not.toBe("AUTHORIZATION_STATE_AMBIGUOUS");
    expect(result.authorizationInventory.rows.slice(1, 3)).toEqual([
      expect.objectContaining({
        releasePolicyDigest: HISTORICAL_RELEASE_DIGESTS[0],
        state: "REVOKED",
        exact: true,
        usableUnderCurrentInstalledSource: false,
      }),
      expect.objectContaining({
        releasePolicyDigest: HISTORICAL_RELEASE_DIGESTS[1],
        state: "REVOKED",
        exact: true,
        usableUnderCurrentInstalledSource: false,
      }),
    ]);
  });

  it("keeps corrupted revoked authorization identities fail closed", async () => {
    const cases = [
      { targetBindingDigest: "b".repeat(64) },
      { expectedPredecessorGeneration: "2" },
      { expectedPredecessorGeneration: 0 },
      { expectedPredecessorGeneration: 3 },
      { operationClass: "UNSUPPORTED_OPERATION" },
      { releasePolicyDigest: "invalid-historical-release-digest" },
    ];
    for (const corruption of cases) {
      const fixture = readyFixture();
      const expired = fixture.authorizations[0];
      const corrupted = historicalAuthorization(expired, "authorization-corrupted", {
        releasePolicyDigest: HISTORICAL_RELEASE_DIGESTS[0],
        revokedAt: new Date(SNAPSHOT.getTime() - 30_000),
        ...corruption,
      });
      const result = await readRefundReadinessBusinessState(queryFixture({
        ...fixture,
        authorizations: [expired, corrupted],
      }).query);
      expect(result.terminalResult).toBe("AUTHORIZATION_STATE_AMBIGUOUS");
      expect(result.readyForOneShotLiveRefundAuthorityDecision).toBe(false);
    }
  });

  it("keeps a non-revoked obsolete-release authorization fail closed", async () => {
    const fixture = readyFixture();
    const obsolete = historicalAuthorization(
      fixture.authorizations[0],
      "authorization-obsolete-active",
      {
        releasePolicyDigest: HISTORICAL_RELEASE_DIGESTS[0],
        expiresAt: new Date(SNAPSHOT.getTime() + 60_000),
      },
    );
    const result = await readRefundReadinessBusinessState(queryFixture({
      ...fixture,
      authorizations: [obsolete],
    }).query);

    expect(result).toMatchObject({
      terminalResult: "AUTHORIZATION_STATE_AMBIGUOUS",
      readyForOneShotLiveRefundAuthorityDecision: false,
      authorizationInventory: {
        currentGenerationUnusedUnexpired: 0,
        nextRequirement: "BLOCKED",
      },
    });
    expect(result.authorizationInventory.rows[0]).toMatchObject({
      exact: false,
      usableUnderCurrentInstalledSource: false,
    });
  });

  it("uses database snapshot time for authorization and lease expiry", async () => {
    const fixture = readyFixture();
    const atExpiry = new Date(SNAPSHOT);
    const { query } = queryFixture({
      ...fixture,
      identity: [{ ...fixture.identity[0], capturedAt: atExpiry }],
      command: [{ ...fixture.command[0], leaseUntil: atExpiry }],
      authorizations: [{ ...fixture.authorizations[0], expiresAt: atExpiry }],
    });
    const result = await readRefundReadinessBusinessState(query);
    expect(result.leaseState.state).toBe("EXPIRED");
    expect(result.authorizationInventory.currentGenerationUnusedExpired).toBe(1);
  });

  it("blocks an active lease", async () => {
    const fixture = readyFixture();
    const { query } = queryFixture({
      ...fixture,
      command: [{ ...fixture.command[0], leaseUntil: new Date(SNAPSHOT.getTime() + 60_000) }],
    });
    const result = await readRefundReadinessBusinessState(query);
    expect(result).toMatchObject({
      terminalResult: "ACTIVE_LEASE_BLOCKER",
      leaseState: { state: "ACTIVE", blocksNextExecution: true },
      readyForOneShotLiveRefundAuthorityDecision: false,
    });
  });

  it.each([
    ["dispatch custody", (fixture: Fixture) => ({
      ...fixture,
      dispatchAttempts: [{
        id: "dispatch-1", commandId: TARGET.commandId, ordinal: 1, leaseGeneration: 2,
        provider: PaymentProvider.EXIMBAY, mode: PaymentMode.SANDBOX,
        providerOperationKey: "physical-r1", requestFingerprint: "a".repeat(64),
        state: RefundExecutionDispatchAttemptState.AUTHORIZED, authorizedAt: LEASE_TWO,
        contactMarkedAt: null, createdAt: LEASE_TWO,
      }],
    }), "AMBIGUOUS"],
    ["preflight provider retrieve", (fixture: Fixture) => ({
      ...fixture,
      preflightObservations: [{
        id: "observation-1", bindingId: TARGET.providerOperationBindingId,
        observingLeaseGeneration: 2, mid: "bound-mid", providerOrderId: "order-ref",
        providerTransactionId: "transaction-ref", providerStatus: "SALE", currency: "USD",
        originalAmount: 100, refundableBalance: 100, observedAt: LEASE_TWO,
        inquiryContractVersion: "refund-provider-eximbay-inquiry/v1",
        parserVersion: "refund-provider-eximbay-inquiry-parser/v1",
        observationFingerprint: "b".repeat(64), createdAt: LEASE_TWO,
      }],
    }), "PROVEN_CONTACTED"],
  ] satisfies ReadonlyArray<readonly [
    string,
    (fixture: Fixture) => Fixture,
    "AMBIGUOUS" | "PROVEN_CONTACTED",
  ]>)("fails closed on existing %s", async (_label, mutate, expectedContactState) => {
    const result = await readRefundReadinessBusinessState(queryFixture(mutate(readyFixture())).query);
    expect(result.dispatch.providerContactState).toBe(expectedContactState);
    expect(result.terminalResult).toBe("PROVIDER_CONTACT_AMBIGUOUS");
    expect(result.readyForOneShotLiveRefundAuthorityDecision).toBe(false);
  });

  it("detects an already-refunded exact target and duplicate risk", async () => {
    const fixture = readyFixture();
    const { query } = queryFixture({
      ...fixture,
      attempts: [{ ...fixture.attempts[0], status: RefundAttemptStatus.SUCCEEDED,
        providerRefundId: "provider-refund-1", processedAt: SNAPSHOT }],
      evidence: [{
        id: "evidence-1", commandId: TARGET.commandId,
        source: RefundExecutionEvidenceSource.ADAPTER_RESPONSE,
        sourceDedupKey: "provider-result-1", outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
        application: RefundExecutionEvidenceApplication.APPLIED,
        observedProviderRefundId: "provider-refund-1", reportedAmount: 100,
        reportedCurrency: "USD", safeCode: null, observedAt: SNAPSHOT, createdAt: SNAPSHOT,
        dispatchAttemptId: "dispatch-1", authorizingLeaseGeneration: 3,
      }],
    });
    const result = await readRefundReadinessBusinessState(query);
    expect(result.exactTargetAlreadyRefunded).toBe("YES");
    expect(result.duplicateRefundRisk).toBe("MATERIAL");
    expect(result.terminalResult).toBe("ALREADY_REFUNDED_OR_AMBIGUOUS");
    expect(result.readyForOneShotLiveRefundAuthorityDecision).toBe(false);
  });

  it.each([
    [RefundAttemptStatus.MANUAL_REVIEW, RefundExecutionCommandStatus.LEASED,
      "manualReview", "ACTIVE_MANUAL_REVIEW"],
    [RefundAttemptStatus.PROCESSING, RefundExecutionCommandStatus.PARKED,
      "parked", "ACTIVE_PARKED"],
    [RefundAttemptStatus.PROCESSING, RefundExecutionCommandStatus.WAITING_EVIDENCE,
      "waitingEvidence", "ACTIVE_WAITING_EVIDENCE"],
  ] satisfies ReadonlyArray<readonly [
    RefundAttemptStatus,
    RefundExecutionCommandStatus,
    "manualReview" | "parked" | "waitingEvidence",
    "ACTIVE_MANUAL_REVIEW" | "ACTIVE_PARKED" | "ACTIVE_WAITING_EVIDENCE",
  ]>)("reports active blockers for %s / %s", async (
    attemptStatus, commandStatus, field, terminalResult,
  ) => {
    const fixture = readyFixture();
    const result = await readRefundReadinessBusinessState(queryFixture({
      ...fixture,
      attempts: [{ ...fixture.attempts[0], status: attemptStatus }],
      command: [{ ...fixture.command[0], status: commandStatus }],
    }).query);
    expect(result.activeBlockers[field]).toBe("ACTIVE_BLOCKER");
    expect(result.terminalResult).toBe(terminalResult);
    expect(result.readyForOneShotLiveRefundAuthorityDecision).toBe(false);
  });

  it("fails closed on incoherent durable lease history", async () => {
    const fixture = readyFixture();
    const result = await readRefundReadinessBusinessState(queryFixture({
      ...fixture,
      commandEvents: [fixture.commandEvents[0]],
    }).query);
    expect(result.durableHistoryCoherent).toBe("NO");
    expect(result.terminalResult).toBe("DURABLE_HISTORY_AMBIGUOUS");
  });

  it("rolls back on a query failure", async () => {
    const { query, calls } = queryFixture(readyFixture(), REFUND_READINESS_SQL.command);
    await expect(readRefundReadinessBusinessState(query)).rejects.toThrow("SYNTHETIC_QUERY_FAILURE");
    expect(calls.at(-1)?.sql).toBe(REFUND_READINESS_SQL.rollback);
  });

  it("admits only the exact named Job and exposes no target input", async () => {
    const seen: Parameters<RuntimeDependencies["execute"]>[0][] = [];
    const execute: RuntimeDependencies["execute"] = (configuration) => {
      seen.push(configuration);
      return Promise.resolve(Object.freeze({ code: REFUND_READINESS_BUSINESS_STATE_READBACK_CODE }));
    };
    expect(await runDatabaseBootstrapEntrypoint(
      [REFUND_READINESS_BUSINESS_STATE_READBACK_MODE],
      readbackEnvironment(), outputSink(), runtimeDependencies(execute),
    )).toBe(0);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.databaseUrl).toContain(encodeURIComponent(
      REFUND_READINESS_BUSINESS_STATE_READBACK_ROLE,
    ));

    for (const mutation of [
      { CLOUD_RUN_JOB: "mira-p3e-sbx-refund-db-bootstrap" },
      { CLOUD_RUN_TASK_INDEX: "1" },
      { CLOUD_RUN_TASK_ATTEMPT: "1" },
      { MIRA_REFUND_READBACK_PAYMENT_ID: TARGET.paymentId },
    ]) {
      let executed = 0;
      expect(await runDatabaseBootstrapEntrypoint(
        [REFUND_READINESS_BUSINESS_STATE_READBACK_MODE],
        { ...readbackEnvironment(), ...mutation }, outputSink(), runtimeDependencies(() => {
          executed += 1;
          return Promise.resolve(Object.freeze({}));
        }),
      )).toBe(64);
      expect(executed).toBe(0);
    }
  });

  it("contains only fixed SELECT queries in one read-only repeatable-read transaction", () => {
    const source = readFileSync(join(
      process.cwd(),
      "containers/refund-db-bootstrap/refund-readiness-business-state-readback.ts",
    ), "utf8");
    const sql = Object.values(REFUND_READINESS_SQL).join("\n");
    expect(REFUND_READINESS_SQL.begin).toBe(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    expect(source).not.toMatch(/\bfetch\s*\(|SecretManager|process\.argv|process\.env/u);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|UPSERT|ALTER|CREATE|DROP|TRUNCATE)\b/u);
    expect(sql).not.toMatch(/\bFOR\s+(?:UPDATE|NO\s+KEY\s+UPDATE|SHARE|KEY\s+SHARE)\b/u);
    expect(sql).not.toMatch(/pg_advisory|nextval|setval/u);
  });
});

type Fixture = Readonly<Record<keyof typeof REFUND_READINESS_SQL,
readonly Readonly<Record<string, unknown>>[]>>;

function readyFixture(): Fixture {
  const payment = Object.freeze({
    id: TARGET.paymentId, checkoutSessionId: "checkout-fixed", provider: PaymentProvider.EXIMBAY,
    mode: PaymentMode.SANDBOX, adapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL,
    status: PaymentAttemptStatus.SUCCEEDED, attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
    amount: 100, currency: "USD", providerOrderId: "private-order-ref",
    providerPaymentKey: "private-payment-ref", financialSucceededAt: REQUESTED,
  });
  const attempt = Object.freeze({
    id: TARGET.refundAttemptId, orderId: TARGET.orderId, paymentId: TARGET.paymentId,
    amount: 100, currency: "USD", status: RefundAttemptStatus.PROCESSING,
    reason: "Attended fresh synthetic Eximbay SANDBOX canary full refund.",
    actorType: RefundAttemptActorType.SYSTEM, actorUserId: null, provider: PaymentProvider.EXIMBAY,
    mode: PaymentMode.SANDBOX, providerRefundId: null,
    idempotencyKey: `refund:${TARGET.paymentId}:${TARGET.refundAttemptId}`,
    requestedAt: REQUESTED, processedAt: null, failedAt: null, failureCode: null,
    safeFailureMessage: null, createdAt: REQUESTED, updatedAt: CLAIMED,
  });
  const command = Object.freeze({
    id: TARGET.commandId, refundAttemptId: TARGET.refundAttemptId,
    status: RefundExecutionCommandStatus.LEASED, availableAt: CLAIMED,
    leaseOwner: "historical-execution", leaseUntil: new Date(LEASE_TWO.getTime() + 300_000),
    leaseGeneration: 2, leaseTokenHash: "a".repeat(64), dispatchAttempt: 0,
    lastSafeErrorCode: null, lastSafeErrorMessage: null, createdAt: CLAIMED, updatedAt: LEASE_TWO,
  });
  return Object.freeze({
    begin: [], commit: [], rollback: [],
    identity: [Object.freeze({ currentUser: REFUND_READINESS_BUSINESS_STATE_READBACK_ROLE,
      currentDatabase: "refund_sandbox", transactionReadOnly: "on",
      transactionIsolation: "repeatable read", capturedAt: SNAPSHOT })],
    payment: [payment],
    order: [Object.freeze({ id: TARGET.orderId, checkoutSessionId: "checkout-fixed",
      paymentId: TARGET.paymentId, currency: "USD", totalAmount: 100,
      status: OrderStatus.REFUND_PENDING })],
    session: [Object.freeze({ id: "checkout-fixed", communicationLocale: "en" })],
    attempts: [attempt], command: [command],
    approval: [Object.freeze({ id: TARGET.historicalApprovalId,
      formatVersion: "mira-refund-eximbay-sandbox-canary-approval/v1",
      provider: PaymentProvider.EXIMBAY, mode: PaymentMode.SANDBOX,
      commandId: TARGET.commandId, targetBindingDigest: TARGET.targetBindingDigest,
      consumedAt: LEASE_ONE })],
    binding: [Object.freeze({ id: TARGET.providerOperationBindingId,
      refundAttemptId: TARGET.refundAttemptId, provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX, providerOperationKey: TARGET.providerOperationFamilyKey,
      operationKeyAlgorithmVersion: "eximbay-refund-family-v1",
      wireContractVersion: "refund-provider-eximbay-cancel-wire/v1",
      wireRequestFingerprint: TARGET.operationFamilyFingerprint,
      merchantAccountBindingId: TARGET.merchantAccountBindingId,
      credentialGenerationBindingId: TARGET.credentialGenerationBindingId,
      createdAt: REQUESTED })],
    authorizations: [Object.freeze({ id: "authorization-expired", commandId: TARGET.commandId,
      refundAttemptId: TARGET.refundAttemptId,
      providerOperationBindingId: TARGET.providerOperationBindingId,
      targetBindingDigest: TARGET.targetBindingDigest, expectedPredecessorGeneration: 2,
      operationClass: "EXIMBAY_SANDBOX_BOUND_ORDINAL_ZERO_REENTRY",
      releasePolicyDigest: TARGET.executionReleasePolicyDigest,
      issuedAt: new Date(SNAPSHOT.getTime() - 120_000),
      expiresAt: new Date(SNAPSHOT.getTime() - 60_000), revokedAt: null, consumedAt: null,
      consumedLeaseEventId: null })],
    commandEvents: [
      Object.freeze({ id: "event-generation-1", commandId: TARGET.commandId,
        eventType: RefundExecutionCommandEventType.LEASE_ACQUIRED, leaseGeneration: 1,
        dispatchAttempt: 0, occurredAt: LEASE_ONE, createdAt: LEASE_ONE }),
      Object.freeze({ id: "event-generation-2", commandId: TARGET.commandId,
        eventType: RefundExecutionCommandEventType.LEASE_ACQUIRED, leaseGeneration: 2,
        dispatchAttempt: 0, occurredAt: LEASE_TWO, createdAt: LEASE_TWO }),
    ],
    dispatchAttempts: [], preflightObservations: [], eligibilityProofs: [], contactProofs: [],
    evidence: [],
    transitions: [
      Object.freeze({ id: "transition-request", refundAttemptId: TARGET.refundAttemptId,
        fromStatus: null, toStatus: RefundAttemptStatus.REQUESTED,
        orderStatusBefore: OrderStatus.PAID, orderStatusAfter: OrderStatus.REFUND_PENDING,
        actorType: RefundAttemptActorType.SYSTEM, actorUserId: null,
        reason: attempt.reason, operationKey: `refund-request:${TARGET.refundAttemptId}`,
        createdAt: REQUESTED }),
      Object.freeze({ id: "transition-claim", refundAttemptId: TARGET.refundAttemptId,
        fromStatus: RefundAttemptStatus.REQUESTED, toStatus: RefundAttemptStatus.PROCESSING,
        orderStatusBefore: OrderStatus.REFUND_PENDING,
        orderStatusAfter: OrderStatus.REFUND_PENDING,
        actorType: RefundAttemptActorType.SYSTEM, actorUserId: null,
        reason: "Refund execution claimed.", operationKey: `refund-exec-claim:${TARGET.commandId}`,
        createdAt: CLAIMED }),
    ],
    outbox: [],
  });
}

function historicalAuthorization(
  source: Readonly<Record<string, unknown>>,
  id: string,
  changes: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...source, id, ...changes });
}

function queryFixture(fixture: Fixture, failureSql?: string): Readonly<{
  query: RefundReadinessQuery;
  calls: readonly Readonly<{ sql: string; parameters: readonly unknown[] }>[];
}> {
  const calls: Readonly<{ sql: string; parameters: readonly unknown[] }>[] = [];
  const rows: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>> = {
    [REFUND_READINESS_SQL.begin]: fixture.begin,
    [REFUND_READINESS_SQL.identity]: fixture.identity,
    [REFUND_READINESS_SQL.payment]: fixture.payment,
    [REFUND_READINESS_SQL.order]: fixture.order,
    [REFUND_READINESS_SQL.session]: fixture.session,
    [REFUND_READINESS_SQL.attempts]: fixture.attempts,
    [REFUND_READINESS_SQL.command]: fixture.command,
    [REFUND_READINESS_SQL.approval]: fixture.approval,
    [REFUND_READINESS_SQL.binding]: fixture.binding,
    [REFUND_READINESS_SQL.authorizations]: fixture.authorizations,
    [REFUND_READINESS_SQL.commandEvents]: fixture.commandEvents,
    [REFUND_READINESS_SQL.dispatchAttempts]: fixture.dispatchAttempts,
    [REFUND_READINESS_SQL.preflightObservations]: fixture.preflightObservations,
    [REFUND_READINESS_SQL.eligibilityProofs]: fixture.eligibilityProofs,
    [REFUND_READINESS_SQL.contactProofs]: fixture.contactProofs,
    [REFUND_READINESS_SQL.evidence]: fixture.evidence,
    [REFUND_READINESS_SQL.transitions]: fixture.transitions,
    [REFUND_READINESS_SQL.outbox]: fixture.outbox,
    [REFUND_READINESS_SQL.commit]: fixture.commit,
    [REFUND_READINESS_SQL.rollback]: fixture.rollback,
  };
  const query: RefundReadinessQuery = (sql, parameters = []) => {
    calls.push(Object.freeze({ sql, parameters }));
    if (sql === failureSql) return Promise.reject(new Error("SYNTHETIC_QUERY_FAILURE"));
    const result = rows[sql];
    return result ? Promise.resolve(result) : Promise.reject(new Error("UNEXPECTED_FIXED_QUERY"));
  };
  return Object.freeze({ query, calls });
}

function readbackEnvironment(): Readonly<Record<string, string>> {
  return Object.freeze({
    MIRA_DB_BOOTSTRAP_PROJECT_ID: "mira-refund-sandbox-0001",
    MIRA_DB_BOOTSTRAP_REGION: "asia-northeast3",
    MIRA_DB_BOOTSTRAP_INSTANCE_CONNECTION_NAME:
      "mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18",
    MIRA_DB_BOOTSTRAP_DATABASE_NAME: "refund_sandbox",
    MIRA_DB_BOOTSTRAP_IAM_DATABASE_USERNAME: REFUND_READINESS_BUSINESS_STATE_READBACK_ROLE,
    MIRA_DB_BOOTSTRAP_SOURCE_COMMIT: "a".repeat(40),
    MIRA_DB_BOOTSTRAP_IMAGE_DIGEST_URI:
      `asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:${"b".repeat(64)}`,
    MIRA_DB_BOOTSTRAP_MIGRATION_COUNT: "41",
    MIRA_DB_BOOTSTRAP_MIGRATION_SHA256:
      "4af152869389ea6ceab2108100b3b2effe772e64784f29e9d62ceb98e0be173c",
    CLOUD_RUN_JOB: REFUND_READINESS_BUSINESS_STATE_READBACK_JOB,
    CLOUD_RUN_EXECUTION: "readback-execution",
    CLOUD_RUN_TASK_COUNT: "1", CLOUD_RUN_TASK_INDEX: "0", CLOUD_RUN_TASK_ATTEMPT: "0",
  });
}

function runtimeDependencies(execute: RuntimeDependencies["execute"]): RuntimeDependencies {
  return Object.freeze({
    readSourceCommit: () => Promise.resolve(`${"a".repeat(40)}\n`),
    loadMigrationInventory: () => Promise.resolve(Object.freeze({
      entries: Object.freeze([]), migrationCount: 41,
      migrationDigest: "4af152869389ea6ceab2108100b3b2effe772e64784f29e9d62ceb98e0be173c",
    })),
    execute,
  });
}

function outputSink() {
  return {
    stdout: { write: () => true },
    stderr: { write: () => true },
  };
}
