import { Prisma, type PrismaClient } from "@prisma/client";
import { EXIMBAY_REFUND_REENTRY_TARGET as target } from "../../eximbay-refund-reentry-authority";
import {
  persistContactedSuccessResolution, ResolutionRollbackError } from "../../execution-result-persistence";
import { buildResolutionPlan, hasRefundProviderIdentityConflict, validatePlanTransition } from "../../execution-result-plan";
import { contactedEvidenceSelect, recoverContactedEvidenceAuthority } from "./contacted-evidence-state";
import { matchContactedRefundSuccessProof, type ContactedRefundSuccessProof } from "./contacted-evidence-parser";
import { lockAndLoadEximbayLifecycleState, type LockedEximbayLifecycleState } from "./lifecycle-state";
import { hasConsistentRefundAttemptLedgerIdentity, remainingRefundableAmount } from "../../invariants";
import type { EximbayRefundPreflightConfig } from "./preflight-contract";

export type ContactedSuccessApplication = Readonly<{ outcome: "CLOSED" | "REJECTED" | "PERSISTENCE_FAILED" }>;

// No provider, credential, authorization, lease, generation transition or email
// delivery capability. The existing result persistence owns the success outbox.
export async function applyEximbayContactedRefundSuccess(
  db: PrismaClient, proof: ContactedRefundSuccessProof, config: EximbayRefundPreflightConfig,
): Promise<ContactedSuccessApplication> {
  try {
    return await db.$transaction(tx => applyLocked(tx, proof, config));
  } catch (error) {
    if (error instanceof ResolutionRollbackError || error instanceof Prisma.PrismaClientKnownRequestError
      || (error instanceof Error && error.name === "DriverAdapterError")) return { outcome: "PERSISTENCE_FAILED" };
    throw error;
  }
}

async function applyLocked(
  tx: Prisma.TransactionClient, proof: ContactedRefundSuccessProof, config: EximbayRefundPreflightConfig,
): Promise<ContactedSuccessApplication> {
  const state = await lockAndLoadEximbayLifecycleState(tx, target, target.commandId);
  if (!state) return { outcome: "REJECTED" };
  const row = await tx.refundExecutionCommand.findUnique({
    where: { id: target.commandId }, select: contactedEvidenceSelect,
  });
  if (!row) return { outcome: "REJECTED" };
  const authority = recoverContactedEvidenceAuthority(row, config);
  if (!authority) return { outcome: "REJECTED" };
  const providerRefundId = matchContactedRefundSuccessProof(proof, authority);
  if (!providerRefundId) return { outcome: "REJECTED" };
  return applyValidated(tx, state, providerRefundId, authority.targetDispatchAttemptId);
}

async function applyValidated(
  tx: Prisma.TransactionClient, state: LockedEximbayLifecycleState,
  providerRefundId: string, dispatchId: string,
): Promise<ContactedSuccessApplication> {
  const { aggregate, target: attempt } = state.context;
  if (!validLedger(state)) return { outcome: "REJECTED" };
  const capturedAt = state.capturedAt;
  const observation = { outcome: "SUCCEEDED" as const, observedProviderRefundId: providerRefundId,
    reportedAmount: 100, reportedCurrency: "USD", safeCode: null, safeMessage: null, observedAt: capturedAt };
  if (await hasRefundProviderIdentityConflict(tx, attempt, observation)) return { outcome: "REJECTED" };
  const plan = buildResolutionPlan(aggregate, attempt, observation, capturedAt, false);
  if (!isFullSuccessPlan(plan)) return { outcome: "REJECTED" };
  await persistContactedSuccessResolution(tx, state.context,
    observation, plan, capturedAt, dispatchId);
  return { outcome: "CLOSED" };
}

function isFullSuccessPlan(plan: ReturnType<typeof buildResolutionPlan>): plan is import("../../execution-result-plan").ResolutionPlan {
  return !("ok" in plan) && validatePlanTransition(plan) && plan.orderStatus === "REFUNDED";
}

function validLedger(state: LockedEximbayLifecycleState): boolean {
  const { aggregate, target: attempt } = state.context;
  if (!hasConsistentRefundAttemptLedgerIdentity(aggregate.payment, aggregate.refundAttempts)) return false;
  if (aggregate.refundAttempts.some(a => a.id !== attempt.id
    && !["FAILED_TERMINAL", "CANCELLED"].includes(a.status))) return false;
  if (state.evidence.some(e => e.outcome !== "UNKNOWN" || e.application !== "PARKED")) return false;
  return remainingRefundableAmount(aggregate.payment.amount, aggregate.refundAttempts) === 100;
}
