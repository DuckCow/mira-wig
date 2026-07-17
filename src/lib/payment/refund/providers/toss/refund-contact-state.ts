import { createHash } from "node:crypto";
import {
  RefundExecutionDispatchAttemptState,
  type Prisma,
  type RefundExecutionEvidence,
  type RefundExecutionProviderContactEligibilityProof,
} from "@prisma/client";
import type { NormalizedExecuteTossRefundContactInput } from "./refund-contact-contract";
import {
  discoverTossAuthorizationOwnership,
  lockAndLoadTossAuthorizationState,
  type AuthorizationTx,
  type LockedTossAuthorizationState,
  type Ownership,
} from "./refund-authorization-state";

export type LockedTossContactState = LockedTossAuthorizationState & Readonly<{
  contactProof: RefundExecutionProviderContactEligibilityProof | null;
  evidence: readonly RefundExecutionEvidence[];
}>;

export async function discoverTossContactOwnership(
  tx: AuthorizationTx,
  commandId: string,
): Promise<Ownership | null> {
  return discoverTossAuthorizationOwnership(tx, commandId);
}

export async function lockAndLoadTossContactState(
  tx: AuthorizationTx,
  ownership: Ownership,
  commandId: string,
): Promise<LockedTossContactState | null> {
  const locked = await lockAndLoadTossAuthorizationState(tx, ownership, commandId);
  if (!locked) return null;
  const dispatchId = locked.history.dispatchAttempts.length === 1
    ? locked.history.dispatchAttempts[0].id
    : null;
  const [contactProof, evidence] = await Promise.all([
    dispatchId ? tx.refundExecutionProviderContactEligibilityProof.findUnique({
      where: { dispatchAttemptId: dispatchId },
    }) : null,
    tx.refundExecutionEvidence.findMany({
      where: { commandId },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return { ...locked, contactProof, evidence };
}

export function exactCurrentContactFence(
  locked: LockedTossContactState,
  input: NormalizedExecuteTossRefundContactInput,
): "LEASE_FENCE_MISMATCH" | "LEASE_EXPIRED" | null {
  const digest = leaseTokenDigest(input.leaseToken);
  const command = locked.context.command;
  if (command.status !== "LEASED" || command.leaseGeneration !== input.leaseGeneration
    || command.leaseTokenHash !== digest) return "LEASE_FENCE_MISMATCH";
  return command.leaseUntil && command.leaseUntil.getTime() <= locked.capturedAt.getTime()
    ? "LEASE_EXPIRED"
    : null;
}

export function exactPostContactFence(
  locked: LockedTossContactState,
  input: NormalizedExecuteTossRefundContactInput,
): boolean {
  const command = locked.context.command;
  return command.status === "LEASED"
    && command.leaseGeneration === input.leaseGeneration
    && command.leaseTokenHash === leaseTokenDigest(input.leaseToken);
}

export function hasAtomicContactMarker(locked: LockedTossContactState): boolean {
  const dispatch = locked.history.dispatchAttempts[0];
  return locked.history.dispatchAttempts.length === 1
    && dispatch.state === RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED
    && dispatch.contactMarkedAt !== null
    && locked.contactProof?.dispatchAttemptId === dispatch.id;
}

export function contactProofData(
  candidate: Readonly<{
    paymentKey: string;
    method: string;
    easyPayPresent: boolean;
    currency: string;
    providerStatus: string;
    totalAmount: number;
    balanceAmount: number;
    taxFreeAmount: number;
    taxExemptionAmount: number;
    cancelsCount: number;
    localReceivedAt: number;
    eligibilityFingerprint: string;
  }>,
  dispatchAttemptId: string,
): Prisma.RefundExecutionProviderContactEligibilityProofUncheckedCreateInput {
  return {
    dispatchAttemptId,
    paymentKey: candidate.paymentKey,
    method: candidate.method,
    easyPayPresent: candidate.easyPayPresent,
    currency: candidate.currency,
    providerStatus: candidate.providerStatus,
    totalAmount: candidate.totalAmount,
    balanceAmount: candidate.balanceAmount,
    taxFreeAmount: candidate.taxFreeAmount,
    taxExemptionAmount: candidate.taxExemptionAmount,
    cancelsCount: candidate.cancelsCount,
    localReceivedAt: new Date(candidate.localReceivedAt),
    eligibilityFingerprint: candidate.eligibilityFingerprint,
  };
}

function leaseTokenDigest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
