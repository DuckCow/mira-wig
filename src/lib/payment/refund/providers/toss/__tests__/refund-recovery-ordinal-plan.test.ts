import {
  PaymentMode,
  PaymentProvider,
  RefundExecutionCommandEventType,
  RefundExecutionDispatchAttemptState,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { TossRefundRecoveryEligibility } from "../refund-recovery-lookup";
import {
  planTossRefundRecoveryOrdinal,
  type TossRefundRecoveryOrdinalSnapshot,
} from "../refund-recovery-ordinal-plan";

const CONTACTED_AT = Date.parse("2026-07-17T00:00:00.000Z");
const CAPTURED_AT = CONTACTED_AT + 15 * 60 * 1000;

describe("pure Toss recovery ordinal admission", () => {
  it("returns one frozen contiguous ordinal candidate", () => {
    const result = planTossRefundRecoveryOrdinal(snapshot(), eligibility());
    expect(result.ok).toBe(true);
    expect(result.ok && result.plan.nextOrdinal === 2).toBe(true);
    expect(result.ok && result.plan.historicalOrdinal === 1).toBe(true);
    expect(result.ok && Object.isFrozen(result) && Object.isFrozen(result.plan)).toBe(true);
  });

  it.each([
    [0, true],
    [10_000, true],
    [10_001, false],
    [-1, false],
  ] as const)("reuses the exact contact freshness boundary at age %s", (age, accepted) => {
    const result = planTossRefundRecoveryOrdinal(
      snapshot(), eligibility({ localReceivedAt: CAPTURED_AT - age }),
    );
    expect(result.ok).toBe(accepted);
  });

  it.each([
    ["terminal", (value: TossRefundRecoveryOrdinalSnapshot) => ({ ...value, hasCoherentFinality: true })],
    ["wrong event", (value: TossRefundRecoveryOrdinalSnapshot) => ({
      ...value,
      recoveryEvent: { ...value.recoveryEvent, eventType: RefundExecutionCommandEventType.LEASE_ACQUIRED },
    })],
    ["wrong event ordinal", (value: TossRefundRecoveryOrdinalSnapshot) => ({
      ...value, recoveryEvent: { ...value.recoveryEvent, dispatchAttempt: 0 },
    })],
    ["wrong generation", (value: TossRefundRecoveryOrdinalSnapshot) => ({
      ...value, recoveryEvent: { ...value.recoveryEvent, leaseGeneration: 3 },
    })],
    ["resting authorization", (value: TossRefundRecoveryOrdinalSnapshot) => ({
      ...value,
      dispatches: [{
        ...value.dispatches[0],
        state: RefundExecutionDispatchAttemptState.AUTHORIZED,
        contactMarkedAt: null,
      }],
    })],
    ["credential drift", (value: TossRefundRecoveryOrdinalSnapshot) => ({
      ...value,
      expectedCredential: { ...value.expectedCredential, credentialGenerationBindingId: "other" },
    })],
  ] as const)("rejects %s", (_label, mutate) => {
    const result = planTossRefundRecoveryOrdinal(mutate(snapshot()), eligibility());
    expect(!result.ok && result.code === "REFUND_LEDGER_INCONSISTENT").toBe(true);
  });
});

function snapshot(): TossRefundRecoveryOrdinalSnapshot {
  return {
    hasCoherentFinality: false,
    phaseDCapturedAt: CAPTURED_AT,
    command: {
      id: "command-1", refundAttemptId: "attempt-1", dispatchAttempt: 1,
      leaseGeneration: 2, leaseTokenMatches: true, leaseUnexpired: true,
    },
    recoveryEvent: {
      commandId: "command-1",
      eventType: RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED,
      leaseGeneration: 2,
      dispatchAttempt: 1,
    },
    binding: {
      refundAttemptId: "attempt-1",
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      providerOperationFamilyKey: "operation-1",
      requestFingerprint: "a".repeat(64),
      merchantAccountBindingId: "merchant-1",
      credentialGenerationBindingId: "generation-1",
    },
    expectedCredential: {
      merchantAccountBindingId: "merchant-1",
      credentialGenerationBindingId: "generation-1",
    },
    expectedRequest: {
      paymentKey: "synthetic-payment",
      amount: 85_000,
      providerOperationKey: "operation-1",
      requestFingerprint: "a".repeat(64),
    },
    dispatches: [{
      id: "dispatch-1", commandId: "command-1", ordinal: 1, leaseGeneration: 1,
      provider: PaymentProvider.TOSS, mode: PaymentMode.SANDBOX,
      providerOperationKey: "operation-1", requestFingerprint: "a".repeat(64),
      state: RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
      contactMarkedAt: CONTACTED_AT, hasContactProof: true,
    }],
  };
}

function eligibility(
  override: Partial<TossRefundRecoveryEligibility> = {},
): TossRefundRecoveryEligibility {
  return {
    paymentKey: "synthetic-payment", method: "카드", easyPayPresent: false,
    currency: "KRW", providerStatus: "DONE", totalAmount: 85_000,
    balanceAmount: 85_000, taxFreeAmount: 0, taxExemptionAmount: 0,
    cancelsCount: 0, localReceivedAt: CAPTURED_AT,
    ...override,
  };
}
