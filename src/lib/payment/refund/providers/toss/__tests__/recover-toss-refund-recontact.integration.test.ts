import {
  RefundExecutionCommandEventType,
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
  REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED,
} from "../../../execution-activation";
import { createTossRefundContactExecutor } from "../refund-contact-orchestrator";
import { deriveTossRefundOperationKey } from "../refund-operation-key";
import type {
  TossRefundCancellationContact,
  TossRefundCancellationPort,
} from "../refund-cancellation-http";
import { createTossRefundRecoveryOperation } from "../refund-recovery-orchestrator";
import {
  TOSS_RECOVERY_EXHAUSTION,
} from "../refund-recovery-exhaustion-contract";
import {
  TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS,
  TOSS_REFUND_RECOVERY_RECONTACT_DEADLINE_MS,
} from "../refund-recovery-policy";
import type { TossRefundLookupPort } from "../refund-lookup-http";
import {
  createContactedRecoveryFixture,
  eligibleBody,
  eligibleLookup,
  exactSuccessLookup,
  RECOVERY_ENV,
  RECOVERY_RECONTACT_ENV,
  successBody,
  type ContactedRecoveryFixture,
} from "./refund-recovery-fixture";

describe("recoverTossRefundExecution ordinal-2 recontact", () => {
  const fixtures: ContactedRecoveryFixture[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || new URL(databaseUrl).pathname.replace(/^\//, "") !== "wig_platform_test") {
      throw new Error("Toss recovery recontact tests require wig_platform_test.");
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

  it("atomically admits ordinal 2 and starts one exact same-key POST", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS);
    let posts = 0;
    let requestChecks = false;
    const cancellation: TossRefundCancellationPort = (contact) => {
      posts += 1;
      requestChecks = exactWireChecks(contact, contacted);
      return Promise.resolve({ kind: "unknown" });
    };
    const result = await recover(contacted, RECOVERY_RECONTACT_ENV, cancellation);
    expect(code(result)).toBe("RECOVERY_CONTACT_OUTCOME_UNKNOWN");
    expect(posts).toBe(1);
    expect(requestChecks).toBe(true);
    const state = await loadState(contacted);
    expect(state.command).toMatchObject({
      status: "LEASED",
      dispatchAttempt: 2,
      leaseGeneration: 2,
    });
    expect(state.dispatches).toHaveLength(2);
    expect(state.proofs).toHaveLength(2);
    expect(state.dispatches[1]).toMatchObject({
      ordinal: 2,
      state: "CONTACT_MAY_HAVE_OCCURRED",
      leaseGeneration: 2,
    });
    expect(state.dispatches[1].authorizedAt.getTime()
      === state.dispatches[1].contactMarkedAt?.getTime()).toBe(true);
    expect(state.proofs[1].localReceivedAt.getTime()
      <= state.dispatches[1].contactMarkedAt!.getTime()).toBe(true);
    expect(state.dispatches[1].contactMarkedAt!.getTime()
      - state.proofs[1].localReceivedAt.getTime() <= 10_000).toBe(true);
    expect(state.evidence).toHaveLength(0);
  });

  it.each([
    ["payment target", "COMMAND_NOT_FOUND_OR_INELIGIBLE", async (entry: ContactedRecoveryFixture) => {
      await db.payment.update({
        where: { id: entry.fixture.paymentId },
        data: { providerPaymentKey: `${entry.fixture.providerPaymentKey}_drift` },
      });
    }],
    ["amount", "COMMAND_NOT_FOUND_OR_INELIGIBLE", async (entry: ContactedRecoveryFixture) => {
      await db.refundAttempt.update({
        where: { id: entry.fixture.refundAttemptId },
        data: { amount: entry.fixture.targetAmount - 1 },
      });
    }],
    ["operation key", "COMMAND_NOT_FOUND_OR_INELIGIBLE", async (entry: ContactedRecoveryFixture) => {
      await db.refundExecutionProviderOperationBinding.update({
        where: { refundAttemptId: entry.fixture.refundAttemptId },
        data: {
          providerOperationKey: deriveTossRefundOperationKey(`${entry.fixture.operationKey}:drift`),
        },
      });
    }],
    ["wire fingerprint", "COMMAND_NOT_FOUND_OR_INELIGIBLE", async (entry: ContactedRecoveryFixture) => {
      await db.refundExecutionProviderOperationBinding.update({
        where: { refundAttemptId: entry.fixture.refundAttemptId },
        data: { wireRequestFingerprint: "f".repeat(64) },
      });
    }],
    ["credential generation", "RECOVERY_CREDENTIAL_UNAVAILABLE", async (
      entry: ContactedRecoveryFixture,
    ) => {
      await db.refundExecutionProviderOperationBinding.update({
        where: { refundAttemptId: entry.fixture.refundAttemptId },
        data: { credentialGenerationBindingId: "generation-drifted" },
      });
    }],
    ["merchant binding", "RECOVERY_CREDENTIAL_UNAVAILABLE", async (
      entry: ContactedRecoveryFixture,
    ) => {
      await db.refundExecutionProviderOperationBinding.update({
        where: { refundAttemptId: entry.fixture.refundAttemptId },
        data: { merchantAccountBindingId: "merchant-drifted" },
      });
    }],
  ] as const)("rejects persisted %s drift before recovery lookup or contact", async (
    label,
    expectedCode,
    drift,
  ) => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS);
    await drift(contacted);
    const before = await loadRecoveryPreservationSnapshot(contacted);
    expectExpectedNonterminalRecoverySnapshot(before, contacted);
    expectIntentionalRecoveryDrift(before, contacted, label);
    let gets = 0;
    let cancellationInvocations = 0;
    const operation = createTossRefundRecoveryOperation({
      lookup: () => {
        gets += 1;
        throw new Error("Persisted recovery drift must not reach lookup.");
      },
      cancellation: () => {
        cancellationInvocations += 1;
        throw new Error("Persisted recovery drift must not reach cancellation.");
      },
    });

    expect(code(await operation(
      db,
      recoveryInput(contacted),
      RECOVERY_RECONTACT_ENV,
    ))).toBe(expectedCode);
    expect(gets).toBe(0);
    expect(cancellationInvocations).toBe(0);
    const after = await loadRecoveryPreservationSnapshot(contacted);
    expect(after).toEqual(before);
    expectIntentionalRecoveryDrift(after, contacted, label);
  });

  it("serializes two eligible continuations to one ordinal-2 winner and one POST", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS);
    const firstSession = createNamedDbSession("e3c2_recontact_first");
    const secondSession = createNamedDbSession("e3c2_recontact_second");
    let posts = 0;
    const operation = createTossRefundRecoveryOperation({
      lookup: eligibleLookup(contacted.fixture),
      cancellation: () => {
        posts += 1;
        return Promise.resolve({ kind: "unknown" });
      },
    });
    try {
      const queued = await queueBehindObservedOrderLock(
        contacted.fixture.orderId,
        firstSession,
        () => operation(firstSession.client, recoveryInput(contacted), RECOVERY_RECONTACT_ENV),
        secondSession,
        () => operation(secondSession.client, recoveryInput(contacted), RECOVERY_RECONTACT_ENV),
      );
      const results = await Promise.all([queued.first, queued.second]);
      expect(results.map(code).sort()).toEqual([
        "RECOVERY_CONTACT_OUTCOME_UNKNOWN",
        "RECOVERY_LEASE_CONFLICT",
      ]);
      expect(posts).toBe(1);
      expect((await loadState(contacted)).dispatches).toHaveLength(2);
    } finally {
      await disconnectSessions(firstSession, secondSession);
    }
  });

  it("permits no second POST while the ordinal-2 POST is in flight", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS);
    let notifyStarted: (() => void) | undefined;
    let releasePost: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
    const released = new Promise<void>((resolve) => { releasePost = resolve; });
    let posts = 0;
    const operation = createTossRefundRecoveryOperation({
      lookup: eligibleLookup(contacted.fixture),
      cancellation: async () => {
        posts += 1;
        notifyStarted?.();
        await released;
        return { kind: "unknown" };
      },
    });
    try {
      const winner = operation(db, recoveryInput(contacted), RECOVERY_RECONTACT_ENV);
      await started;
      const loser = await operation(db, recoveryInput(contacted), RECOVERY_RECONTACT_ENV);
      expect(code(loser)).toBe("RECOVERY_LEASE_CONFLICT");
      expect(posts).toBe(1);
      releasePost?.();
      expect(code(await winner)).toBe("RECOVERY_CONTACT_OUTCOME_UNKNOWN");
    } finally {
      releasePost?.();
    }
  });

  it("strictly applies a coherent ordinal-2 POST success with recovery provenance", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS);
    let posts = 0;
    const cancellation: TossRefundCancellationPort = () => {
      posts += 1;
      return Promise.resolve({
        kind: "success",
        body: JSON.stringify(successBody(contacted.fixture)),
      });
    };
    const result = await recover(contacted, RECOVERY_RECONTACT_ENV, cancellation);
    expect(result.ok && result.replayed === false).toBe(true);
    expect(posts).toBe(1);
    const state = await loadState(contacted);
    expect(state.command).toMatchObject({ status: "DONE", dispatchAttempt: 2 });
    expect(state.attempt).toMatchObject({ status: "SUCCEEDED" });
    expect(state.order.status).toBe("REFUNDED");
    expect(state.evidence).toHaveLength(1);
    expect(state.evidence[0]).toMatchObject({
      source: "ADAPTER_RESPONSE",
      outcome: "SUCCEEDED",
      application: "APPLIED",
      sourceDedupKey: `refund-result:${contacted.fixture.commandId}:2`,
      authorizingLeaseGeneration: 2,
    });
    expect(state.evidence[0].dispatchAttemptId === state.dispatches[1].id).toBe(true);
    const replay = await createTossRefundRecoveryOperation({
      lookup: () => {
        throw new Error("Terminal replay must not GET.");
      },
      cancellation: () => {
        throw new Error("Terminal replay must not POST.");
      },
    })(db, recoveryInput(contacted), {});
    expect(replay.ok && replay.replayed).toBe(true);
  });

  it("recovers ordinal-2 unknown through a later exact GET without a second POST", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS);
    expect(code(await recover(
      contacted,
      RECOVERY_RECONTACT_ENV,
      () => Promise.resolve({ kind: "unknown" }),
    ))).toBe("RECOVERY_CONTACT_OUTCOME_UNKNOWN");
    await expireCurrentFence(contacted);
    let gets = 0;
    const second = createTossRefundRecoveryOperation({
      lookup: exactSuccessLookup(contacted.fixture, () => { gets += 1; }),
      cancellation: () => {
        throw new Error("Ordinal-2 lookup recovery must not POST again.");
      },
    });
    const result = await second(db, recoveryInput(contacted), RECOVERY_ENV);
    expect(result.ok).toBe(true);
    expect(gets).toBe(1);
    const state = await loadState(contacted);
    expect(state.dispatches).toHaveLength(2);
    expect(state.evidence).toHaveLength(1);
    expect(state.evidence[0]).toMatchObject({
      source: "PROVIDER_LOOKUP",
      sourceDedupKey: `refund-result:${contacted.fixture.commandId}:2`,
      authorizingLeaseGeneration: 3,
    });
    expect(state.evidence[0].dispatchAttemptId === state.dispatches[1].id).toBe(true);
  });

  it("applies a captured ordinal-2 POST success after lease expiry", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS);
    const cancellation: TossRefundCancellationPort = async () => {
      await expireCurrentFence(contacted);
      return {
        kind: "success",
        body: JSON.stringify(successBody(contacted.fixture)),
      };
    };
    const result = await recover(contacted, RECOVERY_RECONTACT_ENV, cancellation);
    expect(result.ok).toBe(true);
    expect((await loadState(contacted)).command.status).toBe("DONE");
  });

  it("revokes a captured ordinal-2 POST success after generation supersession", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS);
    const cancellation: TossRefundCancellationPort = async () => {
      await supersedeCurrentFence(contacted);
      return {
        kind: "success",
        body: JSON.stringify(successBody(contacted.fixture)),
      };
    };
    expect(code(await recover(contacted, RECOVERY_RECONTACT_ENV, cancellation)))
      .toBe("RECOVERY_LEASE_CONFLICT");
    const state = await loadState(contacted);
    expect(state.command.status).toBe("LEASED");
    expect(state.command.dispatchAttempt).toBe(2);
    expect(state.evidence).toHaveLength(0);
  });

  it.each([
    ["rejected", "RECOVERY_CONTACT_RESPONSE_REJECTED"],
    ["unknown", "RECOVERY_CONTACT_OUTCOME_UNKNOWN"],
  ] as const)("maps %s POST without rolling back the marker", async (kind, expected) => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS);
    const cancellation: TossRefundCancellationPort = () => Promise.resolve({ kind });
    expect(code(await recover(contacted, RECOVERY_RECONTACT_ENV, cancellation))).toBe(expected);
    const state = await loadState(contacted);
    expect(state.command).toMatchObject({ status: "LEASED", dispatchAttempt: 2 });
    expect(state.dispatches).toHaveLength(2);
    expect(state.proofs).toHaveLength(2);
    expect(state.evidence).toHaveLength(0);
  });

  it("reads the disabled recontact gate only after GET and creates no ordinal", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS);
    let gets = 0;
    let posts = 0;
    const operation = createTossRefundRecoveryOperation({
      lookup: () => {
        gets += 1;
        return Promise.resolve({
          kind: "response",
          body: JSON.stringify(eligibleBody(contacted.fixture)),
        });
      },
      cancellation: () => {
        posts += 1;
        return Promise.resolve({ kind: "unknown" });
      },
    });
    expect(code(await operation(db, recoveryInput(contacted), RECOVERY_ENV)))
      .toBe("RECOVERY_RECONTACT_REQUIRED");
    expect(gets).toBe(1);
    expect(posts).toBe(0);
    expect((await loadState(contacted)).dispatches).toHaveLength(1);
  });

  it("authoritatively reads the disabled gate once under locks before marker admission", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS);
    let reads = 0;
    const env = { ...RECOVERY_RECONTACT_ENV };
    Object.defineProperty(env, REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED, {
      enumerable: true,
      get: () => {
        reads += 1;
        return undefined;
      },
    });
    let posts = 0;
    const result = await recover(contacted, env, () => {
      posts += 1;
      return Promise.resolve({ kind: "unknown" });
    });
    expect(code(result)).toBe("RECOVERY_RECONTACT_REQUIRED");
    expect(reads).toBe(1);
    expect(posts).toBe(0);
    const state = await loadState(contacted);
    expect(state.command.dispatchAttempt).toBe(1);
    expect(state.dispatches).toHaveLength(1);
    expect(state.proofs).toHaveLength(1);
  });

  it("parks deadline exhaustion before evaluating a disabled recontact gate", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_RECONTACT_DEADLINE_MS);
    let gets = 0;
    let posts = 0;
    const operation = createTossRefundRecoveryOperation({
      lookup: () => {
        gets += 1;
        return Promise.resolve({
          kind: "response",
          body: JSON.stringify(eligibleBody(contacted.fixture)),
        });
      },
      cancellation: () => {
        posts += 1;
        return Promise.resolve({ kind: "unknown" });
      },
    });
    expect(code(await operation(db, recoveryInput(contacted), RECOVERY_ENV)))
      .toBe("RECOVERY_DEADLINE_EXPIRED");
    expect(gets).toBe(1);
    expect(posts).toBe(0);
    const state = await loadState(contacted);
    expect(state.order.status).toBe("REFUND_PENDING");
    expect(state.attempt).toMatchObject({
      status: "MANUAL_REVIEW",
      failureCode: TOSS_RECOVERY_EXHAUSTION.DEADLINE.code,
    });
    expect(state.command).toMatchObject({
      status: "PARKED",
      dispatchAttempt: 1,
      leaseOwner: null,
      leaseUntil: null,
      leaseTokenHash: null,
    });
    expect(state.dispatches).toHaveLength(1);
    expect(state.proofs).toHaveLength(1);
    expect(state.evidence).toHaveLength(0);
  });

  it("parks cap exhaustion before evaluating a disabled recontact gate", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS);
    expect(code(await recover(
      contacted,
      RECOVERY_RECONTACT_ENV,
      () => Promise.resolve({ kind: "unknown" }),
    ))).toBe("RECOVERY_CONTACT_OUTCOME_UNKNOWN");
    await expireCurrentFence(contacted);
    let gets = 0;
    let posts = 0;
    const operation = createTossRefundRecoveryOperation({
      lookup: () => {
        gets += 1;
        return Promise.resolve({
          kind: "response",
          body: JSON.stringify(eligibleBody(contacted.fixture)),
        });
      },
      cancellation: () => {
        posts += 1;
        return Promise.resolve({ kind: "unknown" });
      },
    });
    expect(code(await operation(db, recoveryInput(contacted), RECOVERY_ENV)))
      .toBe("RECOVERY_ORDINAL_LIMIT_REACHED");
    expect(gets).toBe(1);
    expect(posts).toBe(0);
    const state = await loadState(contacted);
    expect(state.order.status).toBe("REFUND_PENDING");
    expect(state.attempt).toMatchObject({
      status: "MANUAL_REVIEW",
      failureCode: TOSS_RECOVERY_EXHAUSTION.ORDINAL_LIMIT.code,
    });
    expect(state.command).toMatchObject({ status: "PARKED", dispatchAttempt: 2 });
    expect(state.dispatches).toHaveLength(2);
    expect(state.proofs).toHaveLength(2);
    expect(state.dispatches.some((dispatch) => dispatch.ordinal === 3)).toBe(false);
    expect(state.evidence).toHaveLength(0);
  });

  it("returns interval failure before evaluating a disabled recontact gate", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS - 5_000);
    const transitionCountBefore = await db.refundAttemptTransition.count({
      where: { refundAttemptId: contacted.fixture.refundAttemptId },
    });
    let gets = 0;
    let posts = 0;
    const operation = createTossRefundRecoveryOperation({
      lookup: () => {
        gets += 1;
        return Promise.resolve({
          kind: "response",
          body: JSON.stringify(eligibleBody(contacted.fixture)),
        });
      },
      cancellation: () => {
        posts += 1;
        return Promise.resolve({ kind: "unknown" });
      },
    });
    expect(code(await operation(db, recoveryInput(contacted), RECOVERY_ENV)))
      .toBe("RECOVERY_INTERVAL_NOT_ELAPSED");
    expect(gets).toBe(1);
    expect(posts).toBe(0);
    const state = await loadState(contacted);
    expect(state.order.status).toBe("REFUND_PENDING");
    expect(state.attempt.status).toBe("PROCESSING");
    expect(state.command).toMatchObject({
      status: "LEASED",
      dispatchAttempt: 1,
      leaseOwner: "recontact-test-owner",
    });
    expect(state.command.leaseUntil).not.toBeNull();
    expect(state.command.leaseTokenHash).not.toBeNull();
    expect(state.dispatches).toHaveLength(1);
    expect(state.proofs).toHaveLength(1);
    expect(state.evidence).toHaveLength(0);
    expect(state.transitions).toHaveLength(transitionCountBefore);
  });

  it("parks deadline exhaustion before credential rotation is evaluated", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_RECONTACT_DEADLINE_MS);
    const env = { ...RECOVERY_RECONTACT_ENV };
    let gets = 0;
    let posts = 0;
    const operation = createTossRefundRecoveryOperation({
      lookup: () => {
        gets += 1;
        env.TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING = "generation-rotated";
        return Promise.resolve({
          kind: "response",
          body: JSON.stringify(eligibleBody(contacted.fixture)),
        });
      },
      cancellation: () => {
        posts += 1;
        return Promise.resolve({ kind: "unknown" });
      },
    });
    expect(code(await operation(db, recoveryInput(contacted), env)))
      .toBe("RECOVERY_DEADLINE_EXPIRED");
    expect(gets).toBe(1);
    expect(posts).toBe(0);
    const state = await loadState(contacted);
    expect(state.order.status).toBe("REFUND_PENDING");
    expect(state.attempt).toMatchObject({
      status: "MANUAL_REVIEW",
      failureCode: TOSS_RECOVERY_EXHAUSTION.DEADLINE.code,
    });
    expect(state.command).toMatchObject({ status: "PARKED", dispatchAttempt: 1 });
    expect(state.dispatches).toHaveLength(1);
    expect(state.proofs).toHaveLength(1);
    expect(state.evidence).toHaveLength(0);
  });

  it("rejects credential rotation before marker without parking or POST", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS);
    const env = { ...RECOVERY_RECONTACT_ENV };
    const lookup: TossRefundLookupPort = () => {
      env.TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING = "generation-rotated";
      return Promise.resolve({
        kind: "response",
        body: JSON.stringify(eligibleBody(contacted.fixture)),
      });
    };
    let posts = 0;
    const operation = createTossRefundRecoveryOperation({
      lookup,
      cancellation: () => {
        posts += 1;
        return Promise.resolve({ kind: "unknown" });
      },
    });
    expect(code(await operation(db, recoveryInput(contacted), env)))
      .toBe("RECOVERY_CREDENTIAL_UNAVAILABLE");
    expect(posts).toBe(0);
    const state = await loadState(contacted);
    expect(state.dispatches).toHaveLength(1);
    expect(state.command.status).toBe("LEASED");
  });

  it("does not reread gate or credential after marker commit", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS);
    const env = { ...RECOVERY_RECONTACT_ENV };
    let posts = 0;
    const cancellation: TossRefundCancellationPort = () => {
      posts += 1;
      env[REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED] = undefined;
      env.TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING = "generation-rotated";
      return Promise.resolve({ kind: "unknown" });
    };
    expect(code(await recover(contacted, env, cancellation)))
      .toBe("RECOVERY_CONTACT_OUTCOME_UNKNOWN");
    expect(posts).toBe(1);
    expect((await loadState(contacted)).dispatches).toHaveLength(2);
  });

  it("enforces the 15-minute interval with no ordinal, POST, or parking", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS - 5_000);
    let posts = 0;
    const result = await recover(contacted, RECOVERY_RECONTACT_ENV, () => {
      posts += 1;
      return Promise.resolve({ kind: "unknown" });
    });
    expect(code(result)).toBe("RECOVERY_INTERVAL_NOT_ELAPSED");
    expect(posts).toBe(0);
    const state = await loadState(contacted);
    expect(state.dispatches).toHaveLength(1);
    expect(state.attempt.status).toBe("PROCESSING");
    expect(state.command.status).toBe("LEASED");
  });

  it("parks deadline exhaustion without provider evidence and replays manual state", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_RECONTACT_DEADLINE_MS);
    let posts = 0;
    const operation = createTossRefundRecoveryOperation({
      lookup: eligibleLookup(contacted.fixture),
      cancellation: () => {
        posts += 1;
        return Promise.resolve({ kind: "unknown" });
      },
    });
    expect(code(await operation(db, recoveryInput(contacted), RECOVERY_RECONTACT_ENV)))
      .toBe("RECOVERY_DEADLINE_EXPIRED");
    const state = await loadState(contacted);
    expect(posts).toBe(0);
    expect(state.attempt).toMatchObject({
      status: "MANUAL_REVIEW",
      failureCode: TOSS_RECOVERY_EXHAUSTION.DEADLINE.code,
      safeFailureMessage: TOSS_RECOVERY_EXHAUSTION.DEADLINE.message,
    });
    expect(state.command).toMatchObject({ status: "PARKED", dispatchAttempt: 1 });
    expect(state.evidence).toHaveLength(0);
    expect(state.transitions.filter((row) => (
      row.reason === TOSS_RECOVERY_EXHAUSTION.DEADLINE.reason
    ))).toHaveLength(1);
    expect(code(await operation(db, recoveryInput(contacted), {})))
      .toBe("RECOVERY_MANUAL_REVIEW_REQUIRED");
  });

  it("parks cap exhaustion after ordinal-2 unknown and never creates ordinal 3", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS);
    expect(code(await recover(
      contacted,
      RECOVERY_RECONTACT_ENV,
      () => Promise.resolve({ kind: "unknown" }),
    ))).toBe("RECOVERY_CONTACT_OUTCOME_UNKNOWN");
    await expireCurrentFence(contacted);
    const operation = createTossRefundRecoveryOperation({
      lookup: eligibleLookup(contacted.fixture),
      cancellation: () => {
        throw new Error("Ordinal 3 POST must remain unreachable.");
      },
    });
    expect(code(await operation(db, recoveryInput(contacted), RECOVERY_RECONTACT_ENV)))
      .toBe("RECOVERY_ORDINAL_LIMIT_REACHED");
    const state = await loadState(contacted);
    expect(state.dispatches).toHaveLength(2);
    expect(state.attempt).toMatchObject({
      status: "MANUAL_REVIEW",
      failureCode: TOSS_RECOVERY_EXHAUSTION.ORDINAL_LIMIT.code,
    });
    expect(state.command).toMatchObject({ status: "PARKED", dispatchAttempt: 2 });
    expect(state.evidence).toHaveLength(0);
    expect(code(await operation(db, recoveryInput(contacted), {})))
      .toBe("RECOVERY_MANUAL_REVIEW_REQUIRED");
  });

  it("keeps the initial E3B classifier fail-closed for local exhaustion", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_RECONTACT_DEADLINE_MS);
    await recover(contacted, RECOVERY_RECONTACT_ENV, () => Promise.resolve({ kind: "unknown" }));
    let posts = 0;
    const contact = createTossRefundContactExecutor({
      lookup: eligibleLookup(contacted.fixture),
      cancellation: () => {
        posts += 1;
        return Promise.resolve({ kind: "unknown" });
      },
    });
    const result = await contact(db, {
      commandId: contacted.fixture.commandId,
      leaseGeneration: contacted.initialLease.leaseGeneration,
      leaseToken: contacted.initialLease.leaseToken,
    }, {});
    expect(result.ok ? "<success>" : result.code).toBe("REFUND_LEDGER_INCONSISTENT");
    expect(posts).toBe(0);
  });

  it("requires a live current fence at marker admission", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS);
    let posts = 0;
    const lookup: TossRefundLookupPort = async () => {
      await expireCurrentFence(contacted);
      return { kind: "response", body: JSON.stringify(eligibleBody(contacted.fixture)) };
    };
    const operation = createTossRefundRecoveryOperation({
      lookup,
      cancellation: () => {
        posts += 1;
        return Promise.resolve({ kind: "unknown" });
      },
    });
    expect(code(await operation(db, recoveryInput(contacted), RECOVERY_RECONTACT_ENV)))
      .toBe("RECOVERY_LEASE_CONFLICT");
    expect(posts).toBe(0);
    expect((await loadState(contacted)).dispatches).toHaveLength(1);
  });

  it.each([
    ["RefundExecutionCommand", "e3c2_admission_command_rollback",
      (entry: ContactedRecoveryFixture) => `"id" <> '${safeSqlId(entry.fixture.commandId)}' OR "dispatchAttempt" <> 2`],
  ] as const)("rolls back ordinal-2 admission at %s", async (table, constraint, predicate) => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS);
    await addScopedCheck(table, constraint, predicate(contacted));
    try {
      expect(code(await recover(
        contacted,
        RECOVERY_RECONTACT_ENV,
        () => Promise.resolve({ kind: "unknown" }),
      ))).toBe("PERSISTENCE_CONFLICT");
      const state = await loadState(contacted);
      expect(state.command.dispatchAttempt).toBe(1);
      expect(state.dispatches).toHaveLength(1);
      expect(state.proofs).toHaveLength(1);
      expect(state.evidence).toHaveLength(0);
    } finally {
      await dropCheck(table, constraint);
    }
  });

  it("rolls back deadline parking as one zero-evidence transaction", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_RECONTACT_DEADLINE_MS);
    const constraint = "e3c2_deadline_parking_rollback";
    await addScopedCheck(
      "RefundExecutionCommand",
      constraint,
      `"id" <> '${safeSqlId(contacted.fixture.commandId)}' OR "status" <> 'PARKED'`,
    );
    try {
      expect(code(await recover(
        contacted,
        RECOVERY_RECONTACT_ENV,
        () => Promise.resolve({ kind: "unknown" }),
      ))).toBe("PERSISTENCE_CONFLICT");
      const state = await loadState(contacted);
      expect(state.attempt.status).toBe("PROCESSING");
      expect(state.command.status).toBe("LEASED");
      expect(state.transitions.some((row) => (
        row.reason === TOSS_RECOVERY_EXHAUSTION.DEADLINE.reason
      ))).toBe(false);
      expect(state.evidence).toHaveLength(0);
    } finally {
      await dropCheck("RefundExecutionCommand", constraint);
    }
  });

  it("rolls back cap parking without creating ordinal 3 or evidence", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS);
    await recover(
      contacted,
      RECOVERY_RECONTACT_ENV,
      () => Promise.resolve({ kind: "unknown" }),
    );
    await expireCurrentFence(contacted);
    const constraint = "e3c2_cap_parking_rollback";
    await addScopedCheck(
      "RefundExecutionCommand",
      constraint,
      `"id" <> '${safeSqlId(contacted.fixture.commandId)}' OR "status" <> 'PARKED'`,
    );
    try {
      expect(code(await recover(
        contacted,
        RECOVERY_RECONTACT_ENV,
        () => Promise.resolve({ kind: "unknown" }),
      ))).toBe("PERSISTENCE_CONFLICT");
      const state = await loadState(contacted);
      expect(state.attempt.status).toBe("PROCESSING");
      expect(state.command).toMatchObject({ status: "LEASED", dispatchAttempt: 2 });
      expect(state.dispatches).toHaveLength(2);
      expect(state.evidence).toHaveLength(0);
      expect(state.transitions.some((row) => (
        row.reason === TOSS_RECOVERY_EXHAUSTION.ORDINAL_LIMIT.reason
      ))).toBe(false);
    } finally {
      await dropCheck("RefundExecutionCommand", constraint);
    }
  });

  it("retains ordinal 2 and rolls back a failed POST-success application", async () => {
    const contacted = await trackedFixture(fixtures);
    await backdateContact(contacted, TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS);
    const constraint = "e3c2_post_success_rollback";
    await addScopedCheck(
      "RefundExecutionEvidence",
      constraint,
      `"commandId" <> '${safeSqlId(contacted.fixture.commandId)}'`,
    );
    try {
      const result = await recover(contacted, RECOVERY_RECONTACT_ENV, () => Promise.resolve({
        kind: "success",
        body: JSON.stringify(successBody(contacted.fixture)),
      }));
      expect(code(result)).toBe("PERSISTENCE_CONFLICT");
      const state = await loadState(contacted);
      expect(state.command).toMatchObject({ status: "LEASED", dispatchAttempt: 2 });
      expect(state.attempt.status).toBe("PROCESSING");
      expect(state.order.status).toBe("REFUND_PENDING");
      expect(state.dispatches).toHaveLength(2);
      expect(state.proofs).toHaveLength(2);
      expect(state.evidence).toHaveLength(0);
    } finally {
      await dropCheck("RefundExecutionEvidence", constraint);
    }
  });
});

async function trackedFixture(fixtures: ContactedRecoveryFixture[]) {
  const fixture = await createContactedRecoveryFixture();
  fixtures.push(fixture);
  return fixture;
}

function recoveryInput(contacted: ContactedRecoveryFixture) {
  return { commandId: contacted.fixture.commandId, recoveryOwner: "recontact-test-owner" };
}

async function recover(
  contacted: ContactedRecoveryFixture,
  env: Record<string, string | undefined>,
  cancellation: TossRefundCancellationPort,
) {
  return createTossRefundRecoveryOperation({
    lookup: eligibleLookup(contacted.fixture),
    cancellation,
  })(db, recoveryInput(contacted), env);
}

function code(result: Awaited<ReturnType<ReturnType<typeof createTossRefundRecoveryOperation>>>) {
  return result.ok ? "<success>" : result.code;
}

function exactWireChecks(
  contact: TossRefundCancellationContact,
  contacted: ContactedRecoveryFixture,
): boolean {
  const body = contact.wire.body;
  return contact.wire.method === "POST"
    && contact.wire.path.endsWith("/cancel")
    && contact.wire.contentType === "application/json"
    && contact.wire.idempotencyKey.startsWith("toss-refund-v1-")
    && Object.keys(body).join(",") === "cancelReason,cancelAmount"
    && body.cancelReason === "Mira merchant refund"
    && body.cancelAmount === contacted.fixture.targetAmount
    && Object.keys(contact).sort().join(",") === "authorization,wire";
}

async function backdateContact(
  contacted: ContactedRecoveryFixture,
  ageMs: number,
): Promise<void> {
  const rows = await db.$queryRaw<{ now: Date }[]>`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "now"
  `;
  const markedAt = new Date(rows[0].now.getTime() - ageMs);
  await db.refundExecutionDispatchAttempt.updateMany({
    where: { commandId: contacted.fixture.commandId },
    data: { authorizedAt: markedAt, contactMarkedAt: markedAt },
  });
}

async function expireCurrentFence(contacted: ContactedRecoveryFixture): Promise<void> {
  await db.refundExecutionCommand.update({
    where: { id: contacted.fixture.commandId },
    data: { leaseUntil: new Date("2026-01-01T00:00:00.000Z") },
  });
}

async function supersedeCurrentFence(contacted: ContactedRecoveryFixture): Promise<void> {
  const command = await db.refundExecutionCommand.findUniqueOrThrow({
    where: { id: contacted.fixture.commandId },
  });
  await db.$transaction([
    db.refundExecutionCommand.update({
      where: { id: command.id },
      data: {
        leaseGeneration: command.leaseGeneration + 1,
        leaseOwner: "superseding-recovery-owner",
        leaseUntil: new Date(Date.now() + 300_000),
        leaseTokenHash: "d".repeat(64),
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
}

async function loadState(contacted: ContactedRecoveryFixture) {
  const commandId = contacted.fixture.commandId;
  const [order, attempt, command, dispatches, proofs, events, evidence, transitions] =
    await Promise.all([
      db.order.findUniqueOrThrow({ where: { id: contacted.fixture.orderId } }),
      db.refundAttempt.findUniqueOrThrow({ where: { id: contacted.fixture.refundAttemptId } }),
      db.refundExecutionCommand.findUniqueOrThrow({ where: { id: commandId } }),
      db.refundExecutionDispatchAttempt.findMany({
        where: { commandId }, orderBy: { ordinal: "asc" },
      }),
      db.refundExecutionProviderContactEligibilityProof.findMany({
        where: { dispatchAttempt: { commandId } }, orderBy: { createdAt: "asc" },
      }),
      db.refundExecutionCommandEvent.findMany({ where: { commandId } }),
      db.refundExecutionEvidence.findMany({ where: { commandId } }),
      db.refundAttemptTransition.findMany({
        where: { refundAttemptId: contacted.fixture.refundAttemptId },
      }),
    ]);
  expect(events.filter((event) => (
    event.eventType === RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED
  )).length >= 1).toBe(true);
  return { order, attempt, command, dispatches, proofs, events, evidence, transitions };
}

async function loadRecoveryPreservationSnapshot(contacted: ContactedRecoveryFixture) {
  const fixture = contacted.fixture;
  const [
    order,
    payment,
    attempt,
    command,
    transitions,
    paymentEvents,
    dispatches,
    proofs,
    evidence,
    events,
    binding,
  ] = await Promise.all([
    db.order.findUniqueOrThrow({
      where: { id: fixture.orderId },
      select: {
        id: true,
        checkoutSessionId: true,
        paymentId: true,
        currency: true,
        subtotalAmount: true,
        shippingAmount: true,
        totalAmount: true,
        status: true,
        disputeStatus: true,
        paidAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.payment.findUniqueOrThrow({
      where: { id: fixture.paymentId },
      select: {
        id: true,
        checkoutSessionId: true,
        provider: true,
        mode: true,
        status: true,
        amount: true,
        currency: true,
        providerRef: true,
        providerConfirmIdempotencyKey: true,
        providerPaymentKey: true,
        idempotencyKey: true,
        errorCode: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.refundAttempt.findUniqueOrThrow({
      where: { id: fixture.refundAttemptId },
      select: {
        id: true,
        orderId: true,
        paymentId: true,
        amount: true,
        currency: true,
        status: true,
        reason: true,
        actorType: true,
        actorUserId: true,
        provider: true,
        mode: true,
        providerRefundId: true,
        idempotencyKey: true,
        requestedAt: true,
        processedAt: true,
        failedAt: true,
        failureCode: true,
        safeFailureMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.refundExecutionCommand.findUniqueOrThrow({
      where: { id: fixture.commandId },
      select: {
        id: true,
        refundAttemptId: true,
        status: true,
        availableAt: true,
        leaseOwner: true,
        leaseUntil: true,
        leaseGeneration: true,
        leaseTokenHash: true,
        dispatchAttempt: true,
        lastSafeErrorCode: true,
        lastSafeErrorMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.refundAttemptTransition.findMany({
      where: { refundAttemptId: fixture.refundAttemptId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        refundAttemptId: true,
        fromStatus: true,
        toStatus: true,
        orderStatusBefore: true,
        orderStatusAfter: true,
        actorType: true,
        actorUserId: true,
        reason: true,
        operationKey: true,
        createdAt: true,
      },
    }),
    db.paymentEvent.findMany({
      where: { checkoutSessionId: fixture.sessionId },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        provider: true,
        source: true,
        transmissionId: true,
        eventType: true,
        verifiedMode: true,
        verifiedCredentialBinding: true,
        checkoutSessionId: true,
        providerPaymentKey: true,
        status: true,
        receivedAt: true,
        processedAt: true,
        attemptCount: true,
        lastAttemptAt: true,
        failureStage: true,
        failureCode: true,
        lastError: true,
      },
    }),
    db.refundExecutionDispatchAttempt.findMany({
      where: { commandId: fixture.commandId },
      orderBy: [{ ordinal: "asc" }, { id: "asc" }],
      select: {
        id: true,
        commandId: true,
        ordinal: true,
        leaseGeneration: true,
        provider: true,
        mode: true,
        providerOperationKey: true,
        requestFingerprint: true,
        state: true,
        authorizedAt: true,
        contactMarkedAt: true,
        createdAt: true,
      },
    }),
    db.refundExecutionProviderContactEligibilityProof.findMany({
      where: { dispatchAttempt: { commandId: fixture.commandId } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        dispatchAttemptId: true,
        paymentKey: true,
        method: true,
        easyPayPresent: true,
        currency: true,
        providerStatus: true,
        totalAmount: true,
        balanceAmount: true,
        taxFreeAmount: true,
        taxExemptionAmount: true,
        cancelsCount: true,
        localReceivedAt: true,
        eligibilityFingerprint: true,
        createdAt: true,
      },
    }),
    db.refundExecutionEvidence.findMany({
      where: { commandId: fixture.commandId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        commandId: true,
        source: true,
        sourceDedupKey: true,
        outcome: true,
        application: true,
        observedProviderRefundId: true,
        reportedAmount: true,
        reportedCurrency: true,
        safeCode: true,
        safeMessage: true,
        observedAt: true,
        createdAt: true,
        dispatchAttemptId: true,
        authorizingLeaseGeneration: true,
      },
    }),
    db.refundExecutionCommandEvent.findMany({
      where: { commandId: fixture.commandId },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        commandId: true,
        eventType: true,
        leaseGeneration: true,
        dispatchAttempt: true,
        occurredAt: true,
        createdAt: true,
      },
    }),
    db.refundExecutionProviderOperationBinding.findUniqueOrThrow({
      where: { refundAttemptId: fixture.refundAttemptId },
      select: {
        id: true,
        refundAttemptId: true,
        provider: true,
        mode: true,
        providerOperationKey: true,
        operationKeyAlgorithmVersion: true,
        wireContractVersion: true,
        wireRequestFingerprint: true,
        merchantAccountBindingId: true,
        credentialGenerationBindingId: true,
        createdAt: true,
        eligibilityProof: {
          select: {
            id: true,
            bindingId: true,
            paymentKey: true,
            method: true,
            easyPayPresent: true,
            currency: true,
            providerStatus: true,
            totalAmount: true,
            balanceAmount: true,
            taxFreeAmount: true,
            taxExemptionAmount: true,
            cancelsCount: true,
            localReceivedAt: true,
            eligibilityFingerprint: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);
  return {
    order,
    payment,
    attempt,
    command,
    transitions,
    paymentEvents,
    dispatches,
    proofs,
    evidence,
    events,
    binding,
  };
}

type RecoveryPreservationSnapshot = Awaited<ReturnType<typeof loadRecoveryPreservationSnapshot>>;
type RecoveryDriftLabel = "payment target" | "amount" | "operation key" | "wire fingerprint"
  | "credential generation" | "merchant binding";

function expectExpectedNonterminalRecoverySnapshot(
  snapshot: RecoveryPreservationSnapshot,
  contacted: ContactedRecoveryFixture,
): void {
  expect(snapshot.order).toMatchObject({
    status: "REFUND_PENDING",
    disputeStatus: null,
    totalAmount: contacted.fixture.totalAmount,
  });
  expect(snapshot.payment).toMatchObject({
    status: "SUCCEEDED",
    amount: contacted.fixture.totalAmount,
    currency: "KRW",
    provider: "TOSS",
    mode: "SANDBOX",
    errorCode: null,
    errorMessage: null,
  });
  expect(snapshot.attempt).toMatchObject({
    status: "PROCESSING",
    provider: "TOSS",
    mode: "SANDBOX",
    providerRefundId: null,
    processedAt: null,
    failedAt: null,
    failureCode: null,
    safeFailureMessage: null,
  });
  expect(snapshot.command).toMatchObject({
    status: "LEASED",
    dispatchAttempt: 1,
    leaseOwner: "recovery-fixture-initial-owner",
    leaseGeneration: 1,
    lastSafeErrorCode: null,
    lastSafeErrorMessage: null,
  });
  expect(snapshot.command.leaseUntil?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  expect(snapshot.command.leaseTokenHash).toMatch(/^[0-9a-f]{64}$/);
  expect(snapshot.transitions.map((row) => row.toStatus)).toEqual(["REQUESTED", "PROCESSING"]);
  expect(snapshot.paymentEvents).toEqual([]);
  expect(snapshot.dispatches).toHaveLength(1);
  expect(snapshot.dispatches[0]).toMatchObject({
    ordinal: 1,
    leaseGeneration: 1,
    state: "CONTACT_MAY_HAVE_OCCURRED",
  });
  expect(snapshot.proofs).toHaveLength(1);
  expect(snapshot.evidence).toEqual([]);
  expect(snapshot.events.map((row) => row.eventType)).toEqual([
    RefundExecutionCommandEventType.LEASE_ACQUIRED,
  ]);
  expect(snapshot.binding).toMatchObject({
    refundAttemptId: contacted.fixture.refundAttemptId,
    provider: "TOSS",
    mode: "SANDBOX",
  });
  expect(snapshot.binding.eligibilityProof).not.toBeNull();
}

function expectIntentionalRecoveryDrift(
  snapshot: RecoveryPreservationSnapshot,
  contacted: ContactedRecoveryFixture,
  label: RecoveryDriftLabel,
): void {
  if (label === "payment target") {
    expect(snapshot.payment.providerPaymentKey)
      .toBe(`${contacted.fixture.providerPaymentKey}_drift`);
    return;
  }
  if (label === "amount") {
    expect(snapshot.attempt.amount).toBe(contacted.fixture.targetAmount - 1);
    return;
  }
  if (label === "operation key") {
    expect(snapshot.binding.providerOperationKey)
      .toBe(deriveTossRefundOperationKey(`${contacted.fixture.operationKey}:drift`));
    return;
  }
  if (label === "wire fingerprint") {
    expect(snapshot.binding.wireRequestFingerprint).toBe("f".repeat(64));
    return;
  }
  if (label === "credential generation") {
    expect(snapshot.binding.credentialGenerationBindingId).toBe("generation-drifted");
    return;
  }
  expect(snapshot.binding.merchantAccountBindingId).toBe("merchant-drifted");
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
