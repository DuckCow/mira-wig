import { createHash } from "node:crypto";
import {
  RefundExecutionCommandEventType,
  RefundExecutionCommandStatus,
} from "@prisma/client";
import {
  currentRecoveryCredential,
  isConfiguredRecoveryCredential,
  tossRecoveryRecontactGate,
  type TossRecoveryEnv,
} from "./refund-recovery-config";
import {
  recoveryFailure,
  type TossRefundRecoveryFailure,
} from "./refund-recovery-contract";
import {
  deriveDurableTossRefundRequest,
  sameBindingCredential,
  sameCredentialLabels,
} from "./refund-authorization-identity";
import type { ConfiguredTossRefundCredential } from "./refund-credential-config";
import { isTossRefundContactEligibilityFresh } from "./refund-contact-eligibility";
import type { LockedTossContactState } from "./refund-contact-state";
import type { TossRecoveryFenceHandle } from "./refund-recovery-fence";
import type { TossRefundRecoveryEligibility } from "./refund-recovery-lookup";
import { planTossRefundRecoveryOrdinal } from "./refund-recovery-ordinal-plan";
import { planTossRefundRecoveryWindow } from "./refund-recovery-policy";
import {
  coherentContactedRecoveryBase,
  latestRecoveryDispatch,
} from "./refund-recovery-state";

export function recoveryAdmissionBaseFailure(
  locked: LockedTossContactState,
  fence: TossRecoveryFenceHandle,
  credential: ConfiguredTossRefundCredential,
  eligibility: TossRefundRecoveryEligibility,
): TossRefundRecoveryFailure | null {
  if (!exactLiveFence(locked, fence)) return leaseConflict();
  return coherentContactedRecoveryBase(locked, credential)
    && strictEligibilityMatches(locked, fence, eligibility)
    ? null
    : ledgerFailure();
}

export function recoveryAdmissionWindow(
  locked: LockedTossContactState,
) {
  return planTossRefundRecoveryWindow(locked.history.dispatchAttempts.map((dispatch) => ({
    ordinal: dispatch.ordinal,
    contactMarkedAt: dispatch.contactMarkedAt?.getTime() ?? Number.NaN,
  })), locked.capturedAt.getTime());
}

export function currentAdmissionCredential(
  locked: LockedTossContactState,
  captured: ConfiguredTossRefundCredential,
  env: TossRecoveryEnv,
): ConfiguredTossRefundCredential | TossRefundRecoveryFailure {
  const gate = tossRecoveryRecontactGate(env);
  if (gate !== true) return gate;
  const current = currentRecoveryCredential(env);
  if (!isConfiguredRecoveryCredential(current)) return current;
  const exactCredential = sameCredentialLabels(current, captured)
    && locked.binding !== null
    && sameBindingCredential(locked.binding, current);
  return exactCredential ? current : credentialUnavailable();
}

export function isRecoveryAdmissionFresh(
  locked: LockedTossContactState,
  fence: TossRecoveryFenceHandle,
): boolean {
  return isTossRefundContactEligibilityFresh({
    localReceivedAt: fence.fenceCapturedAtEpochMs,
    phaseDCapturedAt: locked.capturedAt.getTime(),
  });
}

export function isOrdinalTwoPlanCoherent(
  locked: LockedTossContactState,
  fence: TossRecoveryFenceHandle,
  credential: ConfiguredTossRefundCredential,
  eligibility: TossRefundRecoveryEligibility,
): boolean {
  const request = deriveDurableTossRefundRequest(locked.context);
  const event = matchingRecoveryEvent(locked, fence);
  if (!request || !locked.binding || !event) return false;
  const planned = planTossRefundRecoveryOrdinal({
    hasCoherentFinality: false,
    phaseDCapturedAt: locked.capturedAt.getTime(),
    command: {
      id: locked.context.command.id,
      refundAttemptId: locked.context.target.id,
      dispatchAttempt: locked.context.command.dispatchAttempt,
      leaseGeneration: locked.context.command.leaseGeneration,
      leaseTokenMatches: true,
      leaseUnexpired: true,
    },
    recoveryEvent: event,
    binding: bindingSnapshot(locked, request.neutralFingerprint),
    expectedRequest: {
      paymentKey: fence.paymentKey,
      amount: fence.fullAmount,
      providerOperationKey: request.providerOperationKey,
      requestFingerprint: request.neutralFingerprint,
    },
    expectedCredential: {
      merchantAccountBindingId: credential.merchantAccountBinding,
      credentialGenerationBindingId: credential.credentialGenerationBinding,
    },
    dispatches: dispatchSnapshots(locked),
  }, eligibility);
  return planned.ok && planned.plan.nextOrdinal === 2;
}

function bindingSnapshot(locked: LockedTossContactState, requestFingerprint: string) {
  const binding = locked.binding;
  if (!binding) throw new Error("Toss recovery binding is unavailable.");
  return {
    refundAttemptId: binding.refundAttemptId,
    provider: binding.provider,
    mode: binding.mode,
    providerOperationFamilyKey: binding.providerOperationFamilyKey,
    requestFingerprint,
    merchantAccountBindingId: binding.merchantAccountBindingId,
    credentialGenerationBindingId: binding.credentialGenerationBindingId,
  };
}

function dispatchSnapshots(locked: LockedTossContactState) {
  return locked.history.dispatchAttempts.map((dispatch) => ({
    ...dispatch,
    contactMarkedAt: dispatch.contactMarkedAt?.getTime() ?? null,
    hasContactProof: locked.contactProofs.some(
      (proof) => proof.dispatchAttemptId === dispatch.id,
    ),
  }));
}

function exactLiveFence(
  locked: LockedTossContactState,
  fence: TossRecoveryFenceHandle,
): boolean {
  const command = locked.context.command;
  const dispatch = latestRecoveryDispatch(locked);
  return [
    command.status === RefundExecutionCommandStatus.LEASED,
    command.leaseGeneration === fence.recoveryGeneration,
    command.leaseTokenHash === tokenDigest(fence.recoveryToken),
    command.leaseUntil !== null,
    command.leaseUntil !== null && command.leaseUntil.getTime() > locked.capturedAt.getTime(),
    command.dispatchAttempt === fence.historicalOrdinal,
    dispatch?.id === fence.historicalDispatchId,
    dispatch?.ordinal === fence.historicalOrdinal,
    matchingRecoveryEvent(locked, fence) !== null,
  ].every(Boolean);
}

function strictEligibilityMatches(
  locked: LockedTossContactState,
  fence: TossRecoveryFenceHandle,
  eligibility: TossRefundRecoveryEligibility,
): boolean {
  return [
    eligibility.paymentKey === fence.paymentKey,
    eligibility.totalAmount === fence.fullAmount,
    eligibility.balanceAmount === fence.fullAmount,
    eligibility.localReceivedAt === fence.fenceCapturedAtEpochMs,
    locked.context.aggregate.payment.providerPaymentKey === fence.paymentKey,
    locked.context.target.amount === fence.fullAmount,
  ].every(Boolean);
}

function matchingRecoveryEvent(
  locked: LockedTossContactState,
  fence: TossRecoveryFenceHandle,
) {
  const events = locked.history.events.filter((event) => (
    event.commandId === fence.commandId
      && event.eventType === RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED
      && event.leaseGeneration === fence.recoveryGeneration
      && event.dispatchAttempt === fence.historicalOrdinal
  ));
  return events.length === 1 ? events[0] : null;
}

function tokenDigest(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

const leaseConflict = () => recoveryFailure("RECOVERY_LEASE_CONFLICT", "Refund recovery lease is no longer current and live.");
const credentialUnavailable = () => recoveryFailure("RECOVERY_CREDENTIAL_UNAVAILABLE", "Toss refund recovery credential is unavailable.");
const ledgerFailure = () => recoveryFailure("REFUND_LEDGER_INCONSISTENT", "Refund execution aggregate is inconsistent.");
