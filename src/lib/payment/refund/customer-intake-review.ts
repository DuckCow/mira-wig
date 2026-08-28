import { randomUUID } from "crypto";
import {
  CustomerRefundIntakeStatus,
  Prisma,
  RefundAttemptActorType,
  type CustomerRefundIntake,
  type RefundAttempt,
  type RefundAttemptLine,
  type RefundAttemptTransition,
} from "@prisma/client";
import {
  approveCustomerIntakeReviewFailure as approveFailure,
  approveCustomerIntakeReviewSuccess,
  classifyApprovalRequestFailure,
  normalizeApproveCustomerRefundIntakeInput,
  normalizeRejectCustomerRefundIntakeInput,
  rejectCustomerIntakeReviewFailure as rejectFailure,
  rejectCustomerIntakeReviewSuccess,
  toApprovedRefundAttemptProjection,
  type ApproveCustomerRefundIntakeInput,
  type ApproveCustomerRefundIntakeResult,
  type NormalizedApproveCustomerRefundIntakeInput,
  type NormalizedRejectCustomerRefundIntakeInput,
  type RejectCustomerRefundIntakeInput,
  type RejectCustomerRefundIntakeResult,
} from "./customer-intake-review-contract";
import { buildRefundAttemptIdempotencyKey } from "./invariants";
import { sameCanonicalRefundLines, type CanonicalRefundLine } from "./lines";
import { requestRefundAttemptInTransaction } from "./request";
import {
  buildRefundRequestOperationKey,
  resolveRefundRequestCreationEvidence,
} from "./request-evidence";

type CustomerIntakeReviewTx = Prisma.TransactionClient;

export interface CustomerIntakeReviewClient {
  $transaction<Result>(callback: (tx: CustomerIntakeReviewTx) => Promise<Result>): Promise<Result>;
}

type LockedOrder = { id: string; userId: string };

type LockedIntake = Pick<CustomerRefundIntake,
  | "id" | "orderId" | "customerUserId" | "status"
  | "reviewedAt" | "reviewedByUserId" | "adminRejectionReason" | "approvedRefundAttemptId">;

type AuditedRefundAttempt = RefundAttempt & {
  transitions: RefundAttemptTransition[];
  lines: RefundAttemptLine[];
};

export class CustomerIntakeReviewInvariantError extends Error {}

export interface CustomerRefundIntakeApprovalCapabilities {
  readonly allowEximbaySandboxCustomerApproval: boolean;
}

const DEFAULT_APPROVAL_CAPABILITIES: CustomerRefundIntakeApprovalCapabilities = Object.freeze({
  allowEximbaySandboxCustomerApproval: false,
});

export async function rejectCustomerRefundIntake(
  client: CustomerIntakeReviewClient,
  input: RejectCustomerRefundIntakeInput,
): Promise<RejectCustomerRefundIntakeResult> {
  const normalized = normalizeRejectCustomerRefundIntakeInput(input);
  if (!normalized.ok) return normalized;
  return client.$transaction((tx) => rejectInTransaction(tx, normalized.input));
}

export async function approveCustomerRefundIntake(
  client: CustomerIntakeReviewClient,
  input: ApproveCustomerRefundIntakeInput,
  capabilities: CustomerRefundIntakeApprovalCapabilities = DEFAULT_APPROVAL_CAPABILITIES,
): Promise<ApproveCustomerRefundIntakeResult> {
  const normalized = normalizeApproveCustomerRefundIntakeInput(input);
  if (!normalized.ok) return normalized;
  const refundAttemptId = randomUUID();
  return client.$transaction((tx) => approveInTransaction(
    tx,
    normalized.input,
    refundAttemptId,
    capabilities,
  ));
}

async function rejectInTransaction(
  tx: CustomerIntakeReviewTx,
  input: NormalizedRejectCustomerRefundIntakeInput,
): Promise<RejectCustomerRefundIntakeResult> {
  const order = await lockOrder(tx, input.orderId);
  if (!order) return rejectFailure("ORDER_NOT_FOUND", "Order was not found.");
  const intake = await lockIntake(tx, input.orderId, input.intakeId);
  if (!intake) return rejectFailure("INTAKE_NOT_FOUND", "Customer refund intake was not found.");

  if (intake.status === CustomerRefundIntakeStatus.REJECTED) return resolveRejectReplay(intake);
  if (
    intake.status === CustomerRefundIntakeStatus.APPROVED
    || intake.status === CustomerRefundIntakeStatus.WITHDRAWN
  ) {
    return rejectFailure("NOT_REJECTABLE", "Customer refund intake is no longer rejectable.");
  }

  // Rejection deliberately resolves ownership-repair orphans and therefore does not compare
  // customerUserId with the current Order owner or include it in the guarded transition.
  const transition = await tx.customerRefundIntake.updateMany({
    where: {
      id: intake.id,
      orderId: input.orderId,
      status: CustomerRefundIntakeStatus.SUBMITTED,
    },
    data: {
      status: CustomerRefundIntakeStatus.REJECTED,
      reviewedAt: input.reviewedAt,
      reviewedByUserId: input.reviewedByUserId,
      adminRejectionReason: input.adminRejectionReason,
    },
  });
  if (transition.count !== 1) await throwCasInvariant(tx, intake, input.orderId, "rejection");

  return rejectCustomerIntakeReviewSuccess({
    id: intake.id,
    orderId: intake.orderId,
    status: CustomerRefundIntakeStatus.REJECTED,
    reviewedAt: input.reviewedAt,
    reviewedByUserId: input.reviewedByUserId,
    adminRejectionReason: input.adminRejectionReason,
  }, false);
}

async function approveInTransaction(
  tx: CustomerIntakeReviewTx,
  input: NormalizedApproveCustomerRefundIntakeInput,
  refundAttemptId: string,
  capabilities: CustomerRefundIntakeApprovalCapabilities,
): Promise<ApproveCustomerRefundIntakeResult> {
  const order = await lockOrder(tx, input.orderId);
  if (!order) return approveFailure("ORDER_NOT_FOUND", "Order was not found.");
  const intake = await lockIntake(tx, input.orderId, input.intakeId);
  if (!intake) return approveFailure("INTAKE_NOT_FOUND", "Customer refund intake was not found.");
  if (intake.customerUserId !== order.userId) {
    return approveFailure("INTAKE_INCONSISTENT", "Customer refund intake ownership is inconsistent.");
  }

  if (intake.status === CustomerRefundIntakeStatus.APPROVED) {
    return resolveApprovalReplay(tx, intake, input.lines);
  }
  if (
    intake.status === CustomerRefundIntakeStatus.REJECTED
    || intake.status === CustomerRefundIntakeStatus.WITHDRAWN
  ) {
    return approveFailure("NOT_APPROVABLE", "Customer refund intake is no longer approvable.");
  }
  return persistApproval(tx, intake, input, refundAttemptId, capabilities);
}

async function persistApproval(
  tx: CustomerIntakeReviewTx,
  intake: LockedIntake,
  input: NormalizedApproveCustomerRefundIntakeInput,
  refundAttemptId: string,
  capabilities: CustomerRefundIntakeApprovalCapabilities,
): Promise<ApproveCustomerRefundIntakeResult> {
  const request = await requestRefundAttemptInTransaction(tx, {
    refundAttemptId,
    orderId: input.orderId,
    amount: input.amount,
    reason: input.merchantRationale,
    actorType: RefundAttemptActorType.ADMIN,
    actorUserId: input.reviewedByUserId,
    now: input.reviewedAt,
    lines: input.lines,
  }, {
    allowEximbaySandboxCustomerApproval: capabilities.allowEximbaySandboxCustomerApproval,
  });
  if (!request.ok) {
    const resolution = classifyApprovalRequestFailure(request);
    if (resolution.kind === "expected") return resolution.failure;
    throw invariant(`Refund request primitive returned impossible approval result: code=${resolution.code}`);
  }
  if (request.replayed) {
    throw invariant(`Fresh intake approval unexpectedly replayed a request: intakeId=${intake.id}`);
  }

  const transition = await updateApprovedIntake(tx, intake, input, request.refundAttempt.id);
  if (transition.count !== 1) await throwCasInvariant(tx, intake, input.orderId, "approval");
  return approveCustomerIntakeReviewSuccess({
    id: intake.id,
    orderId: intake.orderId,
    status: CustomerRefundIntakeStatus.APPROVED,
    reviewedAt: input.reviewedAt,
    reviewedByUserId: input.reviewedByUserId,
    approvedRefundAttemptId: request.refundAttempt.id,
  }, toApprovedRefundAttemptProjection(request.refundAttempt), false);
}

function updateApprovedIntake(
  tx: CustomerIntakeReviewTx,
  intake: LockedIntake,
  input: NormalizedApproveCustomerRefundIntakeInput,
  approvedRefundAttemptId: string,
) {
  return tx.customerRefundIntake.updateMany({
    where: {
      id: intake.id,
      orderId: input.orderId,
      customerUserId: intake.customerUserId,
      status: CustomerRefundIntakeStatus.SUBMITTED,
    },
    data: {
      status: CustomerRefundIntakeStatus.APPROVED,
      reviewedAt: input.reviewedAt,
      reviewedByUserId: input.reviewedByUserId,
      approvedRefundAttemptId,
    },
  });
}

async function lockOrder(
  tx: CustomerIntakeReviewTx,
  orderId: string,
): Promise<LockedOrder | null> {
  const rows = await tx.$queryRaw<LockedOrder[]>(Prisma.sql`
    SELECT "id", "userId"
    FROM "Order"
    WHERE "id" = ${orderId}
    FOR UPDATE
  `);
  if (rows.length > 1) throw invariant(`Order lock returned multiple rows: orderId=${orderId}`);
  return rows[0] ?? null;
}

async function lockIntake(
  tx: CustomerIntakeReviewTx,
  orderId: string,
  intakeId: string,
): Promise<LockedIntake | null> {
  const rows = await tx.$queryRaw<LockedIntake[]>(Prisma.sql`
    SELECT
      "id",
      "orderId",
      "customerUserId",
      "status",
      "reviewedAt",
      "reviewedByUserId",
      "adminRejectionReason",
      "approvedRefundAttemptId"
    FROM "CustomerRefundIntake"
    WHERE "id" = ${intakeId} AND "orderId" = ${orderId}
    FOR UPDATE
  `);
  if (rows.length > 1) throw invariant(`Intake lock returned multiple rows: intakeId=${intakeId}, orderId=${orderId}`);
  return rows[0] ?? null;
}

function resolveRejectReplay(intake: LockedIntake): RejectCustomerRefundIntakeResult {
  if (!intake.reviewedAt || !intake.reviewedByUserId?.trim() || !intake.adminRejectionReason?.trim()) {
    throw invariant(`Rejected intake decision evidence is incomplete: intakeId=${intake.id}, orderId=${intake.orderId}`);
  }
  return rejectCustomerIntakeReviewSuccess({
    id: intake.id,
    orderId: intake.orderId,
    status: CustomerRefundIntakeStatus.REJECTED,
    reviewedAt: intake.reviewedAt,
    reviewedByUserId: intake.reviewedByUserId,
    adminRejectionReason: intake.adminRejectionReason,
  }, true);
}

async function resolveApprovalReplay(
  tx: CustomerIntakeReviewTx,
  intake: LockedIntake,
  requestedLines: readonly CanonicalRefundLine[],
): Promise<ApproveCustomerRefundIntakeResult> {
  if (!intake.reviewedAt || !intake.reviewedByUserId?.trim() || !intake.approvedRefundAttemptId) {
    throw invariant(`Approved intake decision evidence is incomplete: intakeId=${intake.id}, orderId=${intake.orderId}`);
  }
  const attempt = await tx.refundAttempt.findUnique({
    where: { id: intake.approvedRefundAttemptId },
    include: {
      transitions: { orderBy: { createdAt: "asc" } },
      lines: { orderBy: { orderItemId: "asc" } },
    },
  });
  if (!attempt) {
    throw invariant(`Approved intake linked Attempt is missing: intakeId=${intake.id}, orderId=${intake.orderId}`);
  }
  assertApprovalAttemptIdentity(intake, attempt);
  assertApprovalCreationEvidence(intake, attempt);
  if (attempt.lines.length > 0 && !sameCanonicalRefundLines(attempt.lines, requestedLines)) {
    throw invariant(`Approved intake line decision mismatch: intakeId=${intake.id}, orderId=${intake.orderId}`);
  }
  return approveCustomerIntakeReviewSuccess({
    id: intake.id,
    orderId: intake.orderId,
    status: CustomerRefundIntakeStatus.APPROVED,
    reviewedAt: intake.reviewedAt,
    reviewedByUserId: intake.reviewedByUserId,
    approvedRefundAttemptId: intake.approvedRefundAttemptId,
  }, toApprovedRefundAttemptProjection(attempt), true);
}

function assertApprovalAttemptIdentity(intake: LockedIntake, attempt: AuditedRefundAttempt): void {
  if (attempt.orderId !== intake.orderId) {
    throw invariant(`Approved intake Attempt Order mismatch: intakeId=${intake.id}, orderId=${intake.orderId}`);
  }
  if (
    attempt.actorType !== RefundAttemptActorType.ADMIN
    || attempt.actorUserId !== intake.reviewedByUserId
  ) {
    throw invariant(`Approved intake actor evidence mismatch: intakeId=${intake.id}, orderId=${intake.orderId}`);
  }
  const canonicalIdempotencyKey = buildRefundAttemptIdempotencyKey(attempt.paymentId, attempt.id);
  if (attempt.idempotencyKey !== canonicalIdempotencyKey) {
    throw invariant(`Approved intake Attempt identity mismatch: intakeId=${intake.id}, orderId=${intake.orderId}`);
  }
}

function assertApprovalCreationEvidence(intake: LockedIntake, attempt: AuditedRefundAttempt): void {
  const evidence = resolveRefundRequestCreationEvidence(attempt.transitions, attempt);
  const operationKey = buildRefundRequestOperationKey(attempt.id);
  const creation = attempt.transitions.find((transition) => transition.operationKey === operationKey);
  if (
    evidence.kind !== "matched"
    || !creation
    || creation.createdAt.getTime() !== attempt.requestedAt.getTime()
    || attempt.requestedAt.getTime() !== intake.reviewedAt?.getTime()
  ) {
    throw invariant(`Approved intake creation evidence mismatch: intakeId=${intake.id}, orderId=${intake.orderId}`);
  }
}

async function throwCasInvariant(
  tx: CustomerIntakeReviewTx,
  intake: LockedIntake,
  orderId: string,
  operation: "rejection" | "approval",
): Promise<never> {
  const observed = await tx.customerRefundIntake.findUnique({
    where: { id: intake.id },
    select: {
      id: true,
      orderId: true,
      customerUserId: true,
      status: true,
      approvedRefundAttemptId: true,
    },
  });
  const state = observed
    ? `status=${observed.status},orderId=${observed.orderId},customerUserId=${observed.customerUserId},approvedRefundAttemptId=${observed.approvedRefundAttemptId ?? "none"}`
    : "missing";
  throw invariant(`Customer intake ${operation} CAS affected zero rows: intakeId=${intake.id}, orderId=${orderId}, observed=${state}`);
}

function invariant(message: string): CustomerIntakeReviewInvariantError {
  return new CustomerIntakeReviewInvariantError(message);
}
