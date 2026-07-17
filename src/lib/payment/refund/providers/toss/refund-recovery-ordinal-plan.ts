import {
  PaymentMode,
  PaymentProvider,
  RefundExecutionCommandEventType,
  RefundExecutionDispatchAttemptState,
} from "@prisma/client";
import { isTossRefundContactEligibilityFresh } from "./refund-contact-eligibility";
import type { TossRefundRecoveryEligibility } from "./refund-recovery-lookup";
import { planTossRefundRecoveryWindow } from "./refund-recovery-policy";

const POSTGRES_INT_MAX = 2_147_483_647;

type RecoveryDispatch = Readonly<{
  id: string;
  commandId: string;
  ordinal: number;
  leaseGeneration: number;
  provider: PaymentProvider;
  mode: PaymentMode;
  providerOperationKey: string;
  requestFingerprint: string;
  state: RefundExecutionDispatchAttemptState;
  contactMarkedAt: number | null;
  hasContactProof: boolean;
}>;

export type TossRefundRecoveryOrdinalSnapshot = Readonly<{
  hasCoherentFinality: boolean;
  phaseDCapturedAt: number;
  command: Readonly<{
    id: string;
    refundAttemptId: string;
    dispatchAttempt: number;
    leaseGeneration: number;
    leaseTokenMatches: boolean;
    leaseUnexpired: boolean;
  }>;
  recoveryEvent: Readonly<{
    commandId: string;
    eventType: RefundExecutionCommandEventType;
    leaseGeneration: number;
    dispatchAttempt: number;
  }>;
  binding: Readonly<{
    refundAttemptId: string;
    provider: PaymentProvider;
    mode: PaymentMode;
    providerOperationKey: string;
    requestFingerprint: string;
    merchantAccountBindingId: string;
    credentialGenerationBindingId: string;
  }>;
  expectedRequest: Readonly<{
    paymentKey: string;
    amount: number;
    providerOperationKey: string;
    requestFingerprint: string;
  }>;
  expectedCredential: Readonly<{
    merchantAccountBindingId: string;
    credentialGenerationBindingId: string;
  }>;
  dispatches: readonly RecoveryDispatch[];
}>;

export type TossRefundRecoveryOrdinalPlan = Readonly<{
  nextOrdinal: number;
  historicalOrdinal: number;
  authorizingLeaseGeneration: number;
  contactMarkedAt: number;
  eligibility: TossRefundRecoveryEligibility;
  providerOperationKey: string;
  requestFingerprint: string;
}>;

export type PlanTossRefundRecoveryOrdinal =
  | Readonly<{ ok: true; plan: TossRefundRecoveryOrdinalPlan }>
  | Readonly<{
    ok: false;
    code: "REFUND_LEDGER_INCONSISTENT" | "RECOVERY_DEADLINE_EXPIRED"
      | "RECOVERY_ORDINAL_LIMIT_REACHED" | "RECOVERY_INTERVAL_NOT_ELAPSED";
  }>;

export function planTossRefundRecoveryOrdinal(
  snapshot: TossRefundRecoveryOrdinalSnapshot,
  eligibility: TossRefundRecoveryEligibility,
): PlanTossRefundRecoveryOrdinal {
  if (!coreCoherent(snapshot) || !eligibilityCoherent(snapshot, eligibility)) {
    return failure("REFUND_LEDGER_INCONSISTENT");
  }
  const window = planTossRefundRecoveryWindow(snapshot.dispatches.map((dispatch) => ({
    ordinal: dispatch.ordinal,
    contactMarkedAt: dispatch.contactMarkedAt ?? Number.NaN,
  })), snapshot.phaseDCapturedAt);
  if (!window.ok) return window;
  const historicalOrdinal = snapshot.command.dispatchAttempt;
  const nextOrdinal = historicalOrdinal + 1;
  if (!Number.isSafeInteger(nextOrdinal) || nextOrdinal > POSTGRES_INT_MAX) {
    return failure("REFUND_LEDGER_INCONSISTENT");
  }
  return Object.freeze({
    ok: true,
    plan: Object.freeze({
      nextOrdinal,
      historicalOrdinal,
      authorizingLeaseGeneration: snapshot.command.leaseGeneration,
      contactMarkedAt: snapshot.phaseDCapturedAt,
      eligibility: Object.freeze({ ...eligibility }),
      providerOperationKey: snapshot.binding.providerOperationKey,
      requestFingerprint: snapshot.binding.requestFingerprint,
    }),
  });
}

function coreCoherent(snapshot: TossRefundRecoveryOrdinalSnapshot): boolean {
  const dispatches = [...snapshot.dispatches].sort((left, right) => left.ordinal - right.ordinal);
  if (!commandFenceCoherent(snapshot)) return false;
  if (!dispatchHistoryCoherent(snapshot, dispatches)) return false;
  const latest = dispatches[dispatches.length - 1];
  return bindingCoherent(snapshot)
    && recoveryEventCoherent(snapshot, latest.ordinal)
    && snapshot.command.dispatchAttempt === latest.ordinal;
}

function commandFenceCoherent(snapshot: TossRefundRecoveryOrdinalSnapshot): boolean {
  return [
    !snapshot.hasCoherentFinality,
    snapshot.command.leaseTokenMatches,
    snapshot.command.leaseUnexpired,
    validPositive(snapshot.command.leaseGeneration),
    Number.isSafeInteger(snapshot.phaseDCapturedAt),
  ].every(Boolean);
}

function dispatchHistoryCoherent(
  snapshot: TossRefundRecoveryOrdinalSnapshot,
  dispatches: readonly RecoveryDispatch[],
): boolean {
  if (dispatches.length === 0) return false;
  return dispatches.every((dispatch, index) => dispatchCoherent(snapshot, dispatch, index));
}

function dispatchCoherent(
  snapshot: TossRefundRecoveryOrdinalSnapshot,
  dispatch: RecoveryDispatch,
  index: number,
): boolean {
  return [
    dispatch.ordinal === index + 1,
    dispatch.commandId === snapshot.command.id,
    dispatch.state === RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
    dispatch.contactMarkedAt !== null,
    dispatch.hasContactProof,
    dispatch.provider === PaymentProvider.TOSS,
    dispatch.mode === PaymentMode.SANDBOX,
    dispatch.providerOperationKey === snapshot.binding.providerOperationKey,
    dispatch.requestFingerprint === snapshot.binding.requestFingerprint,
  ].every(Boolean);
}

function bindingCoherent(snapshot: TossRefundRecoveryOrdinalSnapshot): boolean {
  return [
    snapshot.command.refundAttemptId === snapshot.binding.refundAttemptId,
    snapshot.binding.provider === PaymentProvider.TOSS,
    snapshot.binding.mode === PaymentMode.SANDBOX,
    snapshot.binding.merchantAccountBindingId
      === snapshot.expectedCredential.merchantAccountBindingId,
    snapshot.binding.credentialGenerationBindingId
      === snapshot.expectedCredential.credentialGenerationBindingId,
    snapshot.binding.providerOperationKey === snapshot.expectedRequest.providerOperationKey,
    snapshot.binding.requestFingerprint === snapshot.expectedRequest.requestFingerprint,
    snapshot.binding.providerOperationKey.trim().length > 0,
    /^[0-9a-f]{64}$/.test(snapshot.binding.requestFingerprint),
  ].every(Boolean);
}

function recoveryEventCoherent(
  snapshot: TossRefundRecoveryOrdinalSnapshot,
  latestOrdinal: number,
): boolean {
  return [
    snapshot.recoveryEvent.commandId === snapshot.command.id,
    snapshot.recoveryEvent.eventType === RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED,
    snapshot.recoveryEvent.leaseGeneration === snapshot.command.leaseGeneration,
    snapshot.recoveryEvent.dispatchAttempt === latestOrdinal,
  ].every(Boolean);
}

function eligibilityCoherent(
  snapshot: TossRefundRecoveryOrdinalSnapshot,
  eligibility: TossRefundRecoveryEligibility,
): boolean {
  return [
    eligibility.providerStatus === "DONE",
    eligibility.currency === "KRW",
    eligibility.method === "카드",
    eligibility.easyPayPresent === false,
    eligibility.totalAmount === eligibility.balanceAmount,
    eligibility.taxFreeAmount === 0,
    eligibility.taxExemptionAmount === 0,
    eligibility.cancelsCount === 0,
    eligibility.paymentKey === snapshot.expectedRequest.paymentKey,
    eligibility.totalAmount === snapshot.expectedRequest.amount,
    isTossRefundContactEligibilityFresh({
      localReceivedAt: eligibility.localReceivedAt,
      phaseDCapturedAt: snapshot.phaseDCapturedAt,
    }),
  ].every(Boolean);
}

function validPositive(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= POSTGRES_INT_MAX;
}

function failure(
  code: Extract<PlanTossRefundRecoveryOrdinal, { ok: false }>["code"],
): PlanTossRefundRecoveryOrdinal {
  return Object.freeze({ ok: false, code });
}
