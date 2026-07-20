import {
  PaymentMode,
  PaymentProvider,
  RefundAttemptStatus,
  RefundExecutionCommandEventType,
  RefundExecutionDispatchAttemptState,
} from "@prisma/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  acquireRefundExecutionLease,
} from "../../../acquire-lease";
import {
  REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_LEASE_ENABLED,
  REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED,
  REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_TOSS_CONTACT_ENABLED,
  REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED,
  REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED,
  REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED,
} from "../../../execution-activation";
import {
  cleanupDispatchFixtures,
  createDispatchFixture,
  type DispatchFixture,
} from "../../../__tests__/refund-dispatch-fixture";
import { createTossRefundExecutionAuthorizer } from "../refund-authorization-orchestrator";
import { createTossRefundContactExecutor } from "../refund-contact-orchestrator";
import type {
  TossRefundCancellationPort,
} from "../refund-cancellation-http";
import type { TossRefundLookupPort } from "../refund-lookup-http";
import { createTossRefundRecoveryOperation } from "../refund-recovery-orchestrator";
import {
  TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS,
} from "../refund-recovery-policy";
import {
  deriveTossRefundCancellationWireRequest,
  type TossRefundCancellationWireRequest,
} from "../refund-wire-request";
import { fingerprintTossRefundWireRequest } from "../refund-wire-fingerprint";
import { eligibleBody, successBody } from "./refund-recovery-fixture";

const SYNTHETIC_ENV: Readonly<Record<string, string | undefined>> = Object.freeze({
  TOSS_SANDBOX_SECRET_KEY: "synthetic_provider_free_secret",
  TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: "merchant-provider-free",
  TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "generation-provider-free-1",
  [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_CONTACT_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: "ENABLED",
});

describe("S5 provider-free production recovery", () => {
  const fixtures: DispatchFixture[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || new URL(databaseUrl).pathname.replace(/^\//, "") !== "wig_platform_test") {
      throw new Error("Provider-free S5 tests require wig_platform_test.");
    }
    const rows = await db.$queryRaw<{ databaseName: string }[]>`
      SELECT current_database() AS "databaseName"
    `;
    expect(rows).toEqual([{ databaseName: "wig_platform_test" }]);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await cleanupDispatchFixtures(...fixtures.splice(0));
  });

  it("proves ordinal-2 recovery through production operations without provider contact", async () => {
    const network = vi.fn(() => {
      throw new Error("Provider-free S5 must not reach fetch.");
    });
    vi.stubGlobal("fetch", network);
    const fixture = await createDispatchFixture({
      totalAmount: 85_000,
      targetAmount: 85_000,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      requestThroughProduction: true,
    });
    fixtures.push(fixture);

    const initial = await loadState(fixture);
    expect(initial.attempt.status).toBe(RefundAttemptStatus.PROCESSING);
    expect(initial.command).toMatchObject({ status: "READY", dispatchAttempt: 0 });
    expect(initial.transitions.map((row) => row.toStatus)).toEqual([
      RefundAttemptStatus.REQUESTED,
      RefundAttemptStatus.PROCESSING,
    ]);

    const leased = await acquireRefundExecutionLease(db, {
      commandId: fixture.commandId,
      leaseOwner: "s5-provider-free-initial",
    }, SYNTHETIC_ENV);
    expect(leased.ok).toBe(true);
    if (!leased.ok) throw new Error("Expected provider-free S5 lease acquisition.");

    const lookupCounts = { authorization: 0, contact: 0, recovery: 0 };
    const authorization = await createTossRefundExecutionAuthorizer({
      lookup: eligibleLookup(fixture, () => { lookupCounts.authorization += 1; }),
    })(db, leaseInput(fixture, leased.lease), SYNTHETIC_ENV);
    expect(authorization.ok).toBe(true);

    const binding = await db.refundExecutionProviderOperationBinding.findUniqueOrThrow({
      where: { refundAttemptId: fixture.refundAttemptId },
    });
    const authorizedOrdinalOne = await db.refundExecutionDispatchAttempt.findFirstOrThrow({
      where: { commandId: fixture.commandId, ordinal: 1 },
    });
    expect(authorizedOrdinalOne.state).toBe(RefundExecutionDispatchAttemptState.AUTHORIZED);

    let ordinalOneInvocations = 0;
    const ordinalOneWires: TossRefundCancellationWireRequest[] = [];
    const noDial: TossRefundCancellationPort = (contact) => {
      ordinalOneInvocations += 1;
      ordinalOneWires.push(contact.wire);
      return Promise.resolve(Object.freeze({ kind: "unknown" }));
    };
    const contacted = await createTossRefundContactExecutor({
      lookup: eligibleLookup(fixture, () => { lookupCounts.contact += 1; }),
      cancellation: noDial,
    })(db, leaseInput(fixture, leased.lease), SYNTHETIC_ENV);
    expect(contacted).toMatchObject({ ok: false, code: "TOSS_CONTACT_OUTCOME_UNKNOWN" });
    expect(ordinalOneInvocations).toBe(1);
    expect(ordinalOneWires).toHaveLength(1);

    const afterOrdinalOne = await loadState(fixture);
    expect(afterOrdinalOne.dispatches).toHaveLength(1);
    expect(afterOrdinalOne.dispatches[0]).toMatchObject({
      ordinal: 1,
      state: RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
      providerOperationKey: binding.providerOperationKey,
    });
    expect(afterOrdinalOne.evidence).toHaveLength(0);
    expect(afterOrdinalOne.contactProofs).toHaveLength(1);

    await makeRecoveryEligible(fixture);
    let ordinalTwoInvocations = 0;
    const ordinalTwoWires: TossRefundCancellationWireRequest[] = [];
    const syntheticSuccess: TossRefundCancellationPort = (contact) => {
      ordinalTwoInvocations += 1;
      ordinalTwoWires.push(contact.wire);
      return Promise.resolve(Object.freeze({
        kind: "success",
        body: JSON.stringify(successBody(fixture)),
      }));
    };
    const recovered = await createTossRefundRecoveryOperation({
      lookup: eligibleLookup(fixture, () => { lookupCounts.recovery += 1; }),
      cancellation: syntheticSuccess,
    })(db, {
      commandId: fixture.commandId,
      recoveryOwner: "s5-provider-free-recovery",
    }, SYNTHETIC_ENV);
    expect(recovered).toMatchObject({ ok: true, replayed: false });
    expect(ordinalTwoInvocations).toBe(1);
    expect(ordinalTwoWires).toHaveLength(1);

    const ordinalOneWire = ordinalOneWires[0];
    const ordinalTwoWire = ordinalTwoWires[0];
    if (!ordinalOneWire || !ordinalTwoWire) {
      throw new Error("Expected both local S5 cancellation-port captures.");
    }
    const expectedWire = deriveTossRefundCancellationWireRequest({
      paymentKey: fixture.providerPaymentKey,
      providerOperationKey: binding.providerOperationKey,
      cancelAmount: fixture.targetAmount,
    });
    expect(ordinalTwoWire.method).toBe("POST");
    expect(ordinalTwoWire.path).toBe(expectedWire.path);
    expect(ordinalTwoWire.idempotencyKey).toBe(binding.providerOperationKey);
    expect(ordinalTwoWire.body.cancelAmount).toBe(fixture.targetAmount);
    expect(ordinalTwoWire.body.cancelReason).toBe("Mira merchant refund");
    expect(JSON.stringify(ordinalTwoWire.body)).toBe(JSON.stringify(ordinalOneWire.body));
    expect(JSON.stringify(ordinalTwoWire.body)).toBe(JSON.stringify(expectedWire.body));
    expect(binding.wireRequestFingerprint).toBe(fingerprintTossRefundWireRequest({
      paymentKey: fixture.providerPaymentKey,
      providerOperationKey: binding.providerOperationKey,
      cancelAmount: fixture.targetAmount,
    }));
    expect(binding).toMatchObject({
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      merchantAccountBindingId: "merchant-provider-free",
      credentialGenerationBindingId: "generation-provider-free-1",
    });

    const terminal = await loadRecoveryImmutabilitySnapshot(fixture);
    expect(terminal.order.status).toBe("REFUNDED");
    expect(terminal.payment).toMatchObject({
      status: "SUCCEEDED",
      amount: fixture.totalAmount,
      currency: "KRW",
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
    });
    expect(terminal.attempt).toMatchObject({
      status: RefundAttemptStatus.SUCCEEDED,
      amount: fixture.targetAmount,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
    });
    expect(terminal.attempt).toMatchObject({
      providerRefundId: "recovery-transaction-1",
      failedAt: null,
      failureCode: null,
      safeFailureMessage: null,
    });
    expect(terminal.attempt.processedAt).toBeInstanceOf(Date);
    expect(terminal.command).toMatchObject({
      status: "DONE",
      dispatchAttempt: 2,
      leaseGeneration: 2,
      leaseOwner: null,
      leaseUntil: null,
      leaseTokenHash: null,
      lastSafeErrorCode: null,
      lastSafeErrorMessage: null,
    });
    expect(terminal.dispatches.map((row) => ({
      ordinal: row.ordinal,
      state: row.state,
      providerOperationKey: row.providerOperationKey,
      requestFingerprint: row.requestFingerprint,
    }))).toEqual([
      {
        ordinal: 1,
        state: RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
        providerOperationKey: binding.providerOperationKey,
        requestFingerprint: authorizedOrdinalOne.requestFingerprint,
      },
      {
        ordinal: 2,
        state: RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
        providerOperationKey: binding.providerOperationKey,
        requestFingerprint: authorizedOrdinalOne.requestFingerprint,
      },
    ]);
    expect(terminal.contactProofs).toHaveLength(2);
    expect(terminal.evidence).toHaveLength(1);
    expect(terminal.evidence[0]).toMatchObject({
      source: "ADAPTER_RESPONSE",
      outcome: "SUCCEEDED",
      application: "APPLIED",
      dispatchAttemptId: terminal.dispatches[1].id,
      authorizingLeaseGeneration: 2,
    });
    expect(terminal.events.filter((row) => (
      row.eventType === RefundExecutionCommandEventType.LEASE_ACQUIRED
    ))).toHaveLength(1);
    expect(terminal.events.filter((row) => (
      row.eventType === RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED
    ))).toHaveLength(1);
    expect(terminal.transitions.map((row) => row.toStatus)).toEqual([
      RefundAttemptStatus.REQUESTED,
      RefundAttemptStatus.PROCESSING,
      RefundAttemptStatus.SUCCEEDED,
    ]);
    expect(terminal.paymentEvents).toEqual([]);
    expect(terminal.binding).toMatchObject({
      refundAttemptId: fixture.refundAttemptId,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      providerOperationKey: binding.providerOperationKey,
      wireRequestFingerprint: binding.wireRequestFingerprint,
      merchantAccountBindingId: "merchant-provider-free",
      credentialGenerationBindingId: "generation-provider-free-1",
    });
    expect(terminal.binding.eligibilityProof).not.toBeNull();

    let terminalLookupInvocations = 0;
    let terminalCancellationInvocations = 0;
    let terminalConfigurationReads = 0;
    const replayed = await createTossRefundRecoveryOperation({
      lookup: () => {
        terminalLookupInvocations += 1;
        throw new Error("Terminal S5 replay must not lookup.");
      },
      cancellation: () => {
        terminalCancellationInvocations += 1;
        throw new Error("Terminal S5 replay must not cancel.");
      },
    })(db, {
      commandId: fixture.commandId,
      recoveryOwner: "s5-provider-free-terminal-replay",
    }, terminalEnvPoison(() => { terminalConfigurationReads += 1; }));
    expect(replayed).toMatchObject({ ok: true, replayed: true });
    expect(terminalLookupInvocations).toBe(0);
    expect(terminalCancellationInvocations).toBe(0);
    expect(terminalConfigurationReads).toBe(0);

    const replayState = await loadRecoveryImmutabilitySnapshot(fixture);
    expect(replayState).toEqual(terminal);
    expect(lookupCounts).toEqual({ authorization: 1, contact: 1, recovery: 1 });
    expect(ordinalOneInvocations).toBe(1);
    expect(ordinalTwoInvocations).toBe(1);
    expect(network).not.toHaveBeenCalled();
  });
});

function eligibleLookup(fixture: DispatchFixture, onCall: () => void): TossRefundLookupPort {
  return () => {
    onCall();
    return Promise.resolve(Object.freeze({
      kind: "response",
      body: JSON.stringify(eligibleBody(fixture)),
    }));
  };
}

function leaseInput(
  fixture: DispatchFixture,
  lease: Readonly<{ leaseGeneration: number; leaseToken: string }>,
) {
  return {
    commandId: fixture.commandId,
    leaseGeneration: lease.leaseGeneration,
    leaseToken: lease.leaseToken,
  };
}

async function makeRecoveryEligible(fixture: DispatchFixture): Promise<void> {
  const rows = await db.$queryRaw<{ now: Date }[]>`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "now"
  `;
  const now = rows[0]?.now;
  if (!(now instanceof Date)) throw new Error("Unable to capture S5 test database time.");
  const contactedAt = new Date(
    now.getTime() - TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS - 1_000,
  );
  await db.$transaction([
    db.refundExecutionCommand.update({
      where: { id: fixture.commandId },
      data: { leaseUntil: new Date(now.getTime() - 1_000) },
    }),
    db.refundExecutionDispatchAttempt.updateMany({
      where: { commandId: fixture.commandId, ordinal: 1 },
      data: { authorizedAt: contactedAt, contactMarkedAt: contactedAt },
    }),
  ]);
}

async function loadState(fixture: DispatchFixture) {
  const [order, payment, attempt, command, dispatches, contactProofs, evidence, events, transitions] =
    await Promise.all([
      db.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
      db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }),
      db.refundAttempt.findUniqueOrThrow({ where: { id: fixture.refundAttemptId } }),
      db.refundExecutionCommand.findUniqueOrThrow({ where: { id: fixture.commandId } }),
      db.refundExecutionDispatchAttempt.findMany({
        where: { commandId: fixture.commandId }, orderBy: { ordinal: "asc" },
      }),
      db.refundExecutionProviderContactEligibilityProof.findMany({
        where: { dispatchAttempt: { commandId: fixture.commandId } },
        orderBy: { createdAt: "asc" },
      }),
      db.refundExecutionEvidence.findMany({ where: { commandId: fixture.commandId } }),
      db.refundExecutionCommandEvent.findMany({ where: { commandId: fixture.commandId } }),
      db.refundAttemptTransition.findMany({
        where: { refundAttemptId: fixture.refundAttemptId }, orderBy: { createdAt: "asc" },
      }),
    ]);
  return { order, payment, attempt, command, dispatches, contactProofs, evidence, events, transitions };
}

async function loadRecoveryImmutabilitySnapshot(fixture: DispatchFixture) {
  const [
    order,
    payment,
    attempt,
    command,
    transitions,
    paymentEvents,
    dispatches,
    contactProofs,
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
    contactProofs,
    evidence,
    events,
    binding,
  };
}

function terminalEnvPoison(onRead: () => void): Readonly<Record<string, string | undefined>> {
  return new Proxy(Object.freeze({}), {
    get: () => {
      onRead();
      throw new Error("Terminal S5 replay must not read credential or activation configuration.");
    },
  });
}
