import {
  PaymentMode,
  PaymentProvider,
  RefundExecutionDispatchAttemptState,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
} from "@prisma/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { tossBasicAuthorization } from "@/lib/payment/providers/toss/auth";
import { acquireRefundExecutionLease, type RefundExecutionLeaseHandle } from "../../../acquire-lease";
import {
  REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_LEASE_ENABLED,
  REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED,
  REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_TOSS_CONTACT_ENABLED,
  REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED,
} from "../../../execution-activation";
import {
  cleanupDispatchFixtures,
  createDispatchFixture,
  type DispatchFixture,
} from "../../../__tests__/refund-dispatch-fixture";
import {
  createNamedDbSession,
  disconnectSessions,
  queueBehindObservedOrderLock,
} from "../../../__tests__/refund-order-lock-barrier";
import { createTossRefundExecutionAuthorizer } from "../refund-authorization-orchestrator";
import { createTossRefundContactExecutor } from "../refund-contact-orchestrator";
import type { TossRefundCancellationPort } from "../refund-cancellation-http";
import type { TossRefundLookupPort } from "../refund-lookup-http";
import { deriveTossRefundOperationKey } from "../refund-operation-key";
import { fingerprintTossRefundWireRequest } from "../refund-wire-fingerprint";

const LEASE_ENV = { [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED" };
const CREDENTIALS = {
  TOSS_SANDBOX_SECRET_KEY: "synthetic_test_secret",
  TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: "merchant-test",
  TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "generation-1",
};
const AUTH_ENV = {
  ...CREDENTIALS,
  [REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED]: "ENABLED",
};
const CONTACT_ENV: Record<string, string | undefined> = {
  ...CREDENTIALS,
  [REFUND_EXECUTION_TOSS_CONTACT_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: "ENABLED",
};

type AuthorizedFixture = Readonly<{
  fixture: DispatchFixture;
  lease: RefundExecutionLeaseHandle;
}>;

describe("executeTossRefundContact integration", () => {
  const fixtures: DispatchFixture[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || new URL(databaseUrl).pathname.replace(/^\//, "") !== "wig_platform_test") {
      throw new Error("Toss contact integration tests require wig_platform_test.");
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

  it("atomically marks contact, performs one POST, and applies coherent success", async () => {
    const authorized = await trackedAuthorizedFixture(fixtures);
    const calls = { get: 0, post: 0 };
    const contacts: Parameters<TossRefundCancellationPort>[0][] = [];
    const cancellation: TossRefundCancellationPort = (contact) => {
      calls.post += 1;
      contacts.push(contact);
      return Promise.resolve({
        kind: "success",
        body: JSON.stringify(successBody(authorized.fixture)),
      });
    };
    const execute = executor(
      eligibleLookup(authorized.fixture, calls),
      cancellation,
    );
    const result = await execute(db, contactInput(authorized), CONTACT_ENV);

    expect(result).toEqual({
      ok: true,
      replayed: false,
      commandId: authorized.fixture.commandId,
      dispatchAttempt: 1,
      outcome: "REFUND_SUCCEEDED",
    });
    expect(calls).toEqual({ get: 1, post: 1 });
    const binding = await db.refundExecutionProviderOperationBinding.findUniqueOrThrow({
      where: { refundAttemptId: authorized.fixture.refundAttemptId },
    });
    const operationKey = deriveTossRefundOperationKey(authorized.fixture.operationKey);
    const expectedWire = {
      method: "POST",
      path: `/v1/payments/${encodeURIComponent(authorized.fixture.providerPaymentKey)}/cancel`,
      contentType: "application/json",
      idempotencyKey: operationKey,
      body: {
        cancelReason: "Mira merchant refund",
        cancelAmount: authorized.fixture.targetAmount,
      },
    };
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.authorization).toBe(tossBasicAuthorization(
      CREDENTIALS.TOSS_SANDBOX_SECRET_KEY,
    ));
    expect(contacts[0]?.wire).toEqual(expectedWire);
    expect(binding.providerOperationFamilyKey).toBe(operationKey);
    expect(binding.operationFamilyFingerprint).toBe(fingerprintTossRefundWireRequest({
      paymentKey: authorized.fixture.providerPaymentKey,
      providerOperationKey: operationKey,
      cancelAmount: authorized.fixture.targetAmount,
    }));
    expect(JSON.stringify(contacts[0]?.wire.body)).toBe(JSON.stringify(expectedWire.body));
    const state = await contactState(authorized.fixture);
    expect(state.proofs).toHaveLength(1);
    expect(state.dispatch.state).toBe(RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED);
    expect(state.dispatch.contactMarkedAt).not.toBeNull();
    expect(state.evidence).toHaveLength(1);
    expect(state.evidence[0].dispatchAttemptId === state.dispatch.id).toBe(true);
    expect(state.evidence[0].authorizingLeaseGeneration === authorized.lease.leaseGeneration)
      .toBe(true);
    expect(state.attempt).toMatchObject({ status: "SUCCEEDED", providerRefundId: "transaction-1" });
    expect(state.order.status).toBe("REFUNDED");
    expect(state.command).toMatchObject({
      status: "DONE", leaseOwner: null, leaseUntil: null, leaseTokenHash: null,
    });
  });

  it.each([
    ["payment target", async (fixture: DispatchFixture) => {
      await db.payment.update({
        where: { id: fixture.paymentId },
        data: { providerPaymentKey: `${fixture.providerPaymentKey}_drift` },
      });
    }],
    ["amount", async (fixture: DispatchFixture) => {
      await db.refundAttempt.update({
        where: { id: fixture.refundAttemptId },
        data: { amount: fixture.targetAmount - 1 },
      });
    }],
    ["operation key", async (fixture: DispatchFixture) => {
      await db.refundExecutionProviderOperationBinding.update({
        where: { refundAttemptId: fixture.refundAttemptId },
        data: {
          providerOperationFamilyKey: deriveTossRefundOperationKey(`${fixture.operationKey}:drift`),
        },
      });
    }],
    ["wire fingerprint", async (fixture: DispatchFixture) => {
      await db.refundExecutionProviderOperationBinding.update({
        where: { refundAttemptId: fixture.refundAttemptId },
        data: { operationFamilyFingerprint: "f".repeat(64) },
      });
    }],
  ] as const)("rejects persisted %s drift before GET or POST", async (_label, drift) => {
    const authorized = await trackedAuthorizedFixture(fixtures);
    await drift(authorized.fixture);
    const lookup = vi.fn<TossRefundLookupPort>(() => {
      throw new Error("Persisted binding drift must not reach GET.");
    });
    const cancellation = vi.fn<TossRefundCancellationPort>(() => {
      throw new Error("Persisted binding drift must not reach POST.");
    });

    const result = await executor(lookup, cancellation)(
      db, contactInput(authorized), CONTACT_ENV,
    );

    expect(failureCode(result)).toBe("REFUND_LEDGER_INCONSISTENT");
    expect(lookup).not.toHaveBeenCalled();
    expect(cancellation).not.toHaveBeenCalled();
  });

  it("replays coherent finality before disabled gates, credentials, fences, GET, or POST", async () => {
    const authorized = await trackedAuthorizedFixture(fixtures);
    await executor(
      eligibleLookup(authorized.fixture, { get: 0, post: 0 }),
      successfulCancellation(authorized.fixture, { get: 0, post: 0 }),
    )(db, contactInput(authorized), CONTACT_ENV);
    const calls = { get: 0, post: 0 };
    const replay = await executor(
      eligibleLookup(authorized.fixture, calls),
      successfulCancellation(authorized.fixture, calls),
    )(db, {
      commandId: authorized.fixture.commandId,
      leaseGeneration: 2_147_483_647,
      leaseToken: "f".repeat(64),
    }, {});
    expect(replay).toMatchObject({ ok: true, replayed: true, outcome: "REFUND_SUCCEEDED" });
    expect(calls).toEqual({ get: 0, post: 0 });
  });

  it.each([
    RefundExecutionEvidenceApplication.PARKED,
    RefundExecutionEvidenceApplication.CONFLICT,
  ])("allows an earlier nonterminal lookup observation with one terminal success: %s", async (application) => {
    const authorized = await trackedAuthorizedFixture(fixtures);
    await executor(
      eligibleLookup(authorized.fixture, { get: 0, post: 0 }),
      successfulCancellation(authorized.fixture, { get: 0, post: 0 }),
    )(db, contactInput(authorized), CONTACT_ENV);
    const state = await contactState(authorized.fixture);
    await db.refundExecutionEvidence.create({
      data: {
        commandId: authorized.fixture.commandId,
        source: RefundExecutionEvidenceSource.PROVIDER_LOOKUP,
        sourceDedupKey: `refund-provider-lookup:${authorized.fixture.commandId}:2`,
        outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
        application,
        safeCode: "PROVIDER_OUTCOME_UNKNOWN",
        safeMessage: "Provider lookup did not establish a terminal result.",
        observedAt: state.evidence[0].observedAt,
        dispatchAttemptId: state.dispatch.id,
        authorizingLeaseGeneration: 2,
      },
    });
    const calls = { get: 0, post: 0 };
    const replay = await executor(
      eligibleLookup(authorized.fixture, calls),
      successfulCancellation(authorized.fixture, calls),
    )(db, contactInput(authorized), {});
    expect(replay).toMatchObject({ ok: true, replayed: true });
    expect(calls).toEqual({ get: 0, post: 0 });
  });

  it("rejects two applied success authorities", async () => {
    const authorized = await trackedAuthorizedFixture(fixtures);
    await executor(
      eligibleLookup(authorized.fixture, { get: 0, post: 0 }),
      successfulCancellation(authorized.fixture, { get: 0, post: 0 }),
    )(db, contactInput(authorized), CONTACT_ENV);
    const state = await contactState(authorized.fixture);
    await db.refundExecutionEvidence.create({
      data: {
        commandId: authorized.fixture.commandId,
        source: RefundExecutionEvidenceSource.PROVIDER_LOOKUP,
        sourceDedupKey: `synthetic-second-success-${authorized.fixture.commandId}`,
        outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
        application: RefundExecutionEvidenceApplication.APPLIED,
        observedProviderRefundId: "transaction-1",
        reportedAmount: authorized.fixture.targetAmount,
        reportedCurrency: "KRW",
        observedAt: state.evidence[0].observedAt,
        dispatchAttemptId: state.dispatch.id,
        authorizingLeaseGeneration: 2,
      },
    });
    const result = await executor(
      eligibleLookup(authorized.fixture, { get: 0, post: 0 }),
      successfulCancellation(authorized.fixture, { get: 0, post: 0 }),
    )(db, contactInput(authorized), {});
    expect(failureCode(result)).toBe("REFUND_LEDGER_INCONSISTENT");
  });

  it.each(["missing-dispatch", "missing-generation", "wrong-generation"] as const)(
    "rejects terminal Toss evidence provenance: %s",
    async (variant) => {
      const authorized = await trackedAuthorizedFixture(fixtures);
      await executor(
        eligibleLookup(authorized.fixture, { get: 0, post: 0 }),
        successfulCancellation(authorized.fixture, { get: 0, post: 0 }),
      )(db, contactInput(authorized), CONTACT_ENV);
      const evidence = await db.refundExecutionEvidence.findFirstOrThrow({
        where: { commandId: authorized.fixture.commandId },
      });
      await db.refundExecutionEvidence.update({
        where: { id: evidence.id },
        data: variant === "missing-dispatch"
          ? { dispatchAttemptId: null }
          : variant === "missing-generation"
            ? { authorizingLeaseGeneration: null }
            : { authorizingLeaseGeneration: authorized.lease.leaseGeneration + 1 },
      });
      const result = await executor(
        eligibleLookup(authorized.fixture, { get: 0, post: 0 }),
        successfulCancellation(authorized.fixture, { get: 0, post: 0 }),
      )(db, contactInput(authorized), {});
      expect(failureCode(result)).toBe("REFUND_LEDGER_INCONSISTENT");
    },
  );

  it.each([
    ["unknown", "TOSS_CONTACT_OUTCOME_UNKNOWN"],
    ["rejected", "TOSS_CONTACT_RESPONSE_REJECTED"],
  ] as const)("leaves durable recovery state after a %s POST outcome", async (kind, code) => {
    const authorized = await trackedAuthorizedFixture(fixtures);
    const calls = { get: 0, post: 0 };
    const cancellation: TossRefundCancellationPort = () => {
      calls.post += 1;
      return Promise.resolve({ kind });
    };
    const execute = executor(eligibleLookup(authorized.fixture, calls), cancellation);
    expect(failureCode(await execute(db, contactInput(authorized), CONTACT_ENV))).toBe(code);
    expect(failureCode(await execute(db, contactInput(authorized), {})))
      .toBe("CONTACT_RECOVERY_REQUIRED");
    expect(calls).toEqual({ get: 1, post: 1 });
    const state = await contactState(authorized.fixture);
    expect(state.proofs).toHaveLength(1);
    expect(state.evidence).toHaveLength(0);
    expect(state.command.status).toBe("LEASED");
  });

  it.each([
    ["unavailable", "CONTACT_ELIGIBILITY_UNAVAILABLE"],
    ["rejected", "CONTACT_ELIGIBILITY_REJECTED"],
  ] as const)("maps %s GET with zero marker and POST", async (kind, code) => {
    const authorized = await trackedAuthorizedFixture(fixtures);
    let post = 0;
    const lookup: TossRefundLookupPort = () => Promise.resolve({ kind });
    const cancellation: TossRefundCancellationPort = () => {
      post += 1;
      return Promise.resolve({ kind: "unknown" });
    };
    const result = await executor(lookup, cancellation)(db, contactInput(authorized), CONTACT_ENV);
    expect(failureCode(result)).toBe(code);
    expect(post).toBe(0);
    expect((await contactState(authorized.fixture)).proofs).toHaveLength(0);
  });

  it("revalidates gate and credential labels before marker with zero POST", async () => {
    const authorized = await trackedAuthorizedFixture(fixtures);
    const env = { ...CONTACT_ENV };
    let post = 0;
    const lookup: TossRefundLookupPort = () => {
      env.TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING = "generation-2";
      return Promise.resolve({ kind: "response", body: JSON.stringify(eligibleBody(authorized.fixture)) });
    };
    const cancellation: TossRefundCancellationPort = () => {
      post += 1;
      return Promise.resolve({ kind: "unknown" });
    };
    const result = await executor(lookup, cancellation)(db, contactInput(authorized), env);
    expect(failureCode(result)).toBe("CREDENTIAL_BINDING_MISMATCH");
    expect(post).toBe(0);
    expect((await contactState(authorized.fixture)).proofs).toHaveLength(0);
  });

  it("does not reread gates after marker and still starts the single POST", async () => {
    const authorized = await trackedAuthorizedFixture(fixtures);
    const env = { ...CONTACT_ENV };
    let posts = 0;
    const cancellation: TossRefundCancellationPort = () => {
      posts += 1;
      env[REFUND_EXECUTION_TOSS_CONTACT_ENABLED] = "";
      return Promise.resolve({ kind: "success", body: JSON.stringify(successBody(authorized.fixture)) });
    };
    const result = await executor(
      eligibleLookup(authorized.fixture, { get: 0, post: 0 }), cancellation,
    )(db, contactInput(authorized), env);
    expect(result).toMatchObject({ ok: true, replayed: false });
    expect(posts).toBe(1);
  });

  it("performs zero additional POST while the marker winner POST is in flight", async () => {
    const authorized = await trackedAuthorizedFixture(fixtures);
    let postStarted: (() => void) | undefined;
    let releasePost: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { postStarted = resolve; });
    const released = new Promise<void>((resolve) => { releasePost = resolve; });
    let posts = 0;
    const cancellation: TossRefundCancellationPort = async () => {
      posts += 1;
      postStarted?.();
      await released;
      return { kind: "unknown" };
    };
    const calls = { get: 0, post: 0 };
    const execute = executor(eligibleLookup(authorized.fixture, calls), cancellation);
    const winner = execute(db, contactInput(authorized), CONTACT_ENV);
    await started;
    const concurrent = await execute(db, contactInput(authorized), CONTACT_ENV);
    expect(failureCode(concurrent)).toBe("CONTACT_RECOVERY_REQUIRED");
    expect(posts).toBe(1);
    expect(calls.get).toBe(1);
    releasePost?.();
    expect(failureCode(await winner)).toBe("TOSS_CONTACT_OUTCOME_UNKNOWN");
  });

  it("allows exactly one marker winner and one POST when two callers complete GET", async () => {
    const authorized = await trackedAuthorizedFixture(fixtures);
    const firstSession = createNamedDbSession("e3b2b_contact_first");
    const secondSession = createNamedDbSession("e3b2b_contact_second");
    const paired = pairedEligibleLookup(authorized.fixture);
    let posts = 0;
    const cancellation: TossRefundCancellationPort = () => {
      posts += 1;
      return Promise.resolve({ kind: "unknown" });
    };
    const execute = executor(paired.port, cancellation);
    try {
      const queued = await queueBehindObservedOrderLock(
        authorized.fixture.orderId,
        firstSession,
        () => execute(firstSession.client, contactInput(authorized), CONTACT_ENV),
        secondSession,
        () => execute(secondSession.client, contactInput(authorized), CONTACT_ENV),
      );
      const results = await Promise.all([queued.first, queued.second]);
      expect(paired.calls()).toBe(2);
      expect(posts).toBe(1);
      expect(results.map(failureCode).sort()).toEqual([
        "CONTACT_RECOVERY_REQUIRED", "TOSS_CONTACT_OUTCOME_UNKNOWN",
      ]);
      expect((await contactState(authorized.fixture)).proofs).toHaveLength(1);
    } finally {
      await disconnectSessions(firstSession, secondSession);
    }
  });

  it.each([
    ["proof insert", "RefundExecutionProviderContactEligibilityProof", "e3b2b_proof_rollback",
      (fixture: DispatchFixture) => `"paymentKey" <> '${safeSqlId(fixture.providerPaymentKey)}'`],
    ["marker CAS", "RefundExecutionDispatchAttempt", "e3b2b_marker_rollback",
      (fixture: DispatchFixture) => `"commandId" <> '${safeSqlId(fixture.commandId)}' OR "state" = 'AUTHORIZED'`],
  ] as const)("rolls back both proof and marker on %s failure", async (
    _label, table, constraint, predicate,
  ) => {
    const authorized = await trackedAuthorizedFixture(fixtures);
    await addScopedCheck(table, constraint, predicate(authorized.fixture));
    try {
      const result = await executor(
        eligibleLookup(authorized.fixture, { get: 0, post: 0 }),
        successfulCancellation(authorized.fixture, { get: 0, post: 0 }),
      )(db, contactInput(authorized), CONTACT_ENV);
      expect(failureCode(result)).toBe("PERSISTENCE_CONFLICT");
      const state = await contactState(authorized.fixture);
      expect(state.proofs).toHaveLength(0);
      expect(state.dispatch.state).toBe(RefundExecutionDispatchAttemptState.AUTHORIZED);
      expect(state.dispatch.contactMarkedAt).toBeNull();
    } finally {
      await dropCheck(table, constraint);
    }
  });

  it.each([
    ["evidence insert", "RefundExecutionEvidence", "e3b3_evidence_rollback",
      (fixture: DispatchFixture) => `"commandId" <> '${safeSqlId(fixture.commandId)}'`],
    ["attempt projection", "RefundAttempt", "e3b3_attempt_rollback",
      (fixture: DispatchFixture) => `"id" <> '${safeSqlId(fixture.refundAttemptId)}' OR "status" <> 'SUCCEEDED'`],
    ["order projection", "Order", "e3b3_order_rollback",
      (fixture: DispatchFixture) => `"id" <> '${safeSqlId(fixture.orderId)}' OR "status" <> 'REFUNDED'`],
    ["command final CAS", "RefundExecutionCommand", "e3b3_command_rollback",
      (fixture: DispatchFixture) => `"id" <> '${safeSqlId(fixture.commandId)}' OR "status" <> 'DONE'`],
  ] as const)("keeps marker but rolls back all E4 projections on %s failure", async (
    _label, table, constraint, predicate,
  ) => {
    const authorized = await trackedAuthorizedFixture(fixtures);
    await addScopedCheck(table, constraint, predicate(authorized.fixture));
    try {
      const result = await executor(
        eligibleLookup(authorized.fixture, { get: 0, post: 0 }),
        successfulCancellation(authorized.fixture, { get: 0, post: 0 }),
      )(db, contactInput(authorized), CONTACT_ENV);
      expect(failureCode(result)).toBe("PERSISTENCE_CONFLICT");
      const state = await contactState(authorized.fixture);
      expect(state.proofs).toHaveLength(1);
      expect(state.dispatch.state).toBe(RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED);
      expect(state.evidence).toHaveLength(0);
      expect(state.attempt).toMatchObject({ status: "PROCESSING", providerRefundId: null });
      expect(state.order.status).toBe("REFUND_PENDING");
      expect(state.command.status).toBe("LEASED");
    } finally {
      await dropCheck(table, constraint);
    }
  });
});

function executor(lookup: TossRefundLookupPort, cancellation: TossRefundCancellationPort) {
  return createTossRefundContactExecutor({ lookup, cancellation });
}

async function trackedAuthorizedFixture(fixtures: DispatchFixture[]): Promise<AuthorizedFixture> {
  const fixture = await createDispatchFixture({ totalAmount: 85_000, targetAmount: 85_000 });
  fixtures.push(fixture);
  const leaseResult = await acquireRefundExecutionLease(db, {
    commandId: fixture.commandId,
    leaseOwner: "e3b2b-contact-test-worker",
  }, LEASE_ENV);
  if (!leaseResult.ok) throw new Error(`Expected lease success: ${leaseResult.code}`);
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
  const authorize = createTossRefundExecutionAuthorizer({ lookup: eligibleLookup(fixture, {
    get: 0, post: 0,
  }) });
  const authorization = await authorize(db, {
    commandId: fixture.commandId,
    leaseGeneration: leaseResult.lease.leaseGeneration,
    leaseToken: leaseResult.lease.leaseToken,
  }, AUTH_ENV);
  if (!authorization.ok) throw new Error(`Expected Toss authorization: ${authorization.code}`);
  return { fixture, lease: leaseResult.lease };
}

function contactInput(authorized: AuthorizedFixture) {
  return {
    commandId: authorized.fixture.commandId,
    leaseGeneration: authorized.lease.leaseGeneration,
    leaseToken: authorized.lease.leaseToken,
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

function successfulCancellation(
  fixture: DispatchFixture,
  calls: { get: number; post: number },
): TossRefundCancellationPort {
  return () => {
    calls.post += 1;
    return Promise.resolve({ kind: "success", body: JSON.stringify(successBody(fixture)) });
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
      transactionKey: "transaction-1",
      cancelStatus: "DONE",
      cancelAmount: fixture.targetAmount,
      cancelReason: "Mira merchant refund",
    }],
  };
}

async function contactState(fixture: DispatchFixture) {
  const [order, attempt, command, dispatch, proofs, evidence] = await Promise.all([
    db.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
    db.refundAttempt.findUniqueOrThrow({ where: { id: fixture.refundAttemptId } }),
    db.refundExecutionCommand.findUniqueOrThrow({ where: { id: fixture.commandId } }),
    db.refundExecutionDispatchAttempt.findFirstOrThrow({ where: { commandId: fixture.commandId } }),
    db.refundExecutionProviderContactEligibilityProof.findMany({
      where: { dispatchAttempt: { commandId: fixture.commandId } },
    }),
    db.refundExecutionEvidence.findMany({ where: { commandId: fixture.commandId } }),
  ]);
  return { order, attempt, command, dispatch, proofs, evidence };
}

function pairedEligibleLookup(fixture: DispatchFixture) {
  let count = 0;
  let release: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  const port: TossRefundLookupPort = async () => {
    count += 1;
    if (count === 2) release?.();
    await ready;
    return { kind: "response", body: JSON.stringify(eligibleBody(fixture)) };
  };
  return { port, calls: () => count };
}

function failureCode(result: Awaited<ReturnType<ReturnType<typeof executor>>>): string {
  return result.ok ? "<unexpected-success>" : result.code;
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
