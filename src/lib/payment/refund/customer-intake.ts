import {
  CustomerRefundIntakeStatus,
  OrderStatus,
  Prisma,
  type CustomerRefundIntake,
} from "@prisma/client";
import {
  normalizeSubmitCustomerRefundIntakeInput,
  normalizeWithdrawCustomerRefundIntakeInput,
  submitCustomerIntakeFailure as submitFailure,
  submitCustomerIntakeSuccess,
  withdrawCustomerIntakeFailure as withdrawFailure,
  withdrawCustomerIntakeSuccess,
  type NormalizedSubmitCustomerRefundIntakeInput,
  type NormalizedWithdrawCustomerRefundIntakeInput,
  type SubmitCustomerRefundIntakeInput,
  type SubmitCustomerRefundIntakeResult,
  type WithdrawCustomerRefundIntakeInput,
  type WithdrawCustomerRefundIntakeResult,
} from "./customer-intake-contract";

type CustomerIntakeTx = Prisma.TransactionClient;

interface CustomerIntakeClient {
  $transaction<Result>(callback: (tx: CustomerIntakeTx) => Promise<Result>): Promise<Result>;
}

interface LockedOwnedOrder {
  id: string;
  status: OrderStatus;
  userId: string;
}

interface LockedOpenIntake {
  id: string;
  customerUserId: string;
  status: CustomerRefundIntakeStatus;
}

const RETHROW_ORIGINAL_UNIQUE_ERROR = Symbol("RETHROW_ORIGINAL_UNIQUE_ERROR");

class CustomerIntakeInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomerIntakeInvariantError";
  }
}

export async function submitCustomerRefundIntake(
  client: CustomerIntakeClient,
  input: SubmitCustomerRefundIntakeInput,
): Promise<SubmitCustomerRefundIntakeResult> {
  const normalized = normalizeSubmitCustomerRefundIntakeInput(input);
  if (!normalized.ok) return normalized;

  try {
    return await client.$transaction((tx) => submitInTransaction(tx, normalized.input));
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    return classifySubmitUniqueConflict(client, normalized.input, error);
  }
}

export async function withdrawCustomerRefundIntake(
  client: CustomerIntakeClient,
  input: WithdrawCustomerRefundIntakeInput,
): Promise<WithdrawCustomerRefundIntakeResult> {
  const normalized = normalizeWithdrawCustomerRefundIntakeInput(input);
  if (!normalized.ok) return normalized;
  return client.$transaction((tx) => withdrawInTransaction(tx, normalized.input));
}

async function submitInTransaction(
  tx: CustomerIntakeTx,
  input: NormalizedSubmitCustomerRefundIntakeInput,
): Promise<SubmitCustomerRefundIntakeResult> {
  const order = await lockOwnedOrder(tx, input.orderId, input.customerUserId);
  if (!order) {
    return submitFailure("ORDER_NOT_FOUND_OR_NOT_OWNED", "Order was not found for the customer.");
  }

  const cancellation = await tx.orderCancellation.findUnique({
    where: { orderId: input.orderId },
    select: { id: true },
  });
  if (cancellation) {
    return submitFailure("ORDER_NOT_ELIGIBLE", "Cancelled Orders cannot create another refund intake.");
  }

  const open = await findOpenIntake(tx, input.orderId);
  if (open) return resolveSubmitReplay(open, input.customerUserId);
  if (!isSubmitEligible(order.status)) {
    return submitFailure("ORDER_NOT_ELIGIBLE", "Order status does not allow a customer refund intake.");
  }

  const created = await tx.customerRefundIntake.create({
    data: {
      orderId: input.orderId,
      customerUserId: input.customerUserId,
      status: CustomerRefundIntakeStatus.SUBMITTED,
      reasonCode: input.reasonCode,
      reasonDetail: input.reasonDetail,
      submittedAt: input.operationAt,
    },
  });
  return toSubmitSuccess(created, false);
}

async function classifySubmitUniqueConflict(
  client: CustomerIntakeClient,
  input: NormalizedSubmitCustomerRefundIntakeInput,
  originalError: unknown,
): Promise<SubmitCustomerRefundIntakeResult> {
  const classification = await client.$transaction(async (tx) => {
    const order = await lockOwnedOrder(tx, input.orderId, input.customerUserId);
    if (!order) {
      return submitFailure("ORDER_NOT_FOUND_OR_NOT_OWNED", "Order was not found for the customer.");
    }
    const open = await findOpenIntake(tx, input.orderId);
    if (!open) return RETHROW_ORIGINAL_UNIQUE_ERROR;
    return resolveSubmitReplay(open, input.customerUserId);
  });
  if (classification === RETHROW_ORIGINAL_UNIQUE_ERROR) throw originalError;
  return classification;
}

async function withdrawInTransaction(
  tx: CustomerIntakeTx,
  input: NormalizedWithdrawCustomerRefundIntakeInput,
): Promise<WithdrawCustomerRefundIntakeResult> {
  const order = await lockOwnedOrder(tx, input.orderId, input.customerUserId);
  if (!order) {
    return withdrawFailure("INTAKE_NOT_FOUND_OR_NOT_OWNED", "Customer refund intake was not found.");
  }

  const open = await lockOpenIntake(tx, input.orderId);
  if (!open) return classifyNoOpenWithdrawal(tx, input);
  if (open.customerUserId !== input.customerUserId) {
    return withdrawFailure("INTAKE_NOT_FOUND_OR_NOT_OWNED", "Customer refund intake was not found.");
  }

  const transition = await tx.customerRefundIntake.updateMany({
    where: {
      id: open.id,
      orderId: input.orderId,
      customerUserId: input.customerUserId,
      status: CustomerRefundIntakeStatus.SUBMITTED,
    },
    data: {
      status: CustomerRefundIntakeStatus.WITHDRAWN,
      withdrawnAt: input.operationAt,
    },
  });
  if (transition.count !== 1) await throwWithdrawalCasInvariant(tx, open, input);

  return withdrawCustomerIntakeSuccess({
    orderId: input.orderId,
    status: CustomerRefundIntakeStatus.WITHDRAWN,
    withdrawnAt: input.operationAt,
  }, false);
}

async function classifyNoOpenWithdrawal(
  tx: CustomerIntakeTx,
  input: NormalizedWithdrawCustomerRefundIntakeInput,
): Promise<WithdrawCustomerRefundIntakeResult> {
  const latest = await tx.customerRefundIntake.findFirst({
    where: { orderId: input.orderId, customerUserId: input.customerUserId },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { id: true, orderId: true, status: true, withdrawnAt: true },
  });
  if (!latest) {
    return withdrawFailure("INTAKE_NOT_FOUND_OR_NOT_OWNED", "Customer refund intake was not found.");
  }
  if (latest.status === CustomerRefundIntakeStatus.WITHDRAWN) {
    if (!latest.withdrawnAt) {
      throw new CustomerIntakeInvariantError(
        `WITHDRAWN customer intake lacks withdrawnAt: intakeId=${latest.id}, orderId=${latest.orderId}`,
      );
    }
    return withdrawCustomerIntakeSuccess({
      orderId: latest.orderId,
      status: CustomerRefundIntakeStatus.WITHDRAWN,
      withdrawnAt: latest.withdrawnAt,
    }, true);
  }
  if (
    latest.status === CustomerRefundIntakeStatus.APPROVED
    || latest.status === CustomerRefundIntakeStatus.REJECTED
  ) {
    return withdrawFailure("NOT_WITHDRAWABLE", "Customer refund intake is no longer withdrawable.");
  }
  throw new CustomerIntakeInvariantError(
    `SUBMITTED customer intake was not found by the locked-open query: intakeId=${latest.id}, orderId=${latest.orderId}`,
  );
}

async function throwWithdrawalCasInvariant(
  tx: CustomerIntakeTx,
  open: LockedOpenIntake,
  input: NormalizedWithdrawCustomerRefundIntakeInput,
): Promise<never> {
  const observed = await tx.customerRefundIntake.findUnique({
    where: { id: open.id },
    select: { id: true, orderId: true, customerUserId: true, status: true },
  });
  const observedState = observed
    ? `status=${observed.status},orderId=${observed.orderId},customerUserId=${observed.customerUserId}`
    : "missing";
  throw new CustomerIntakeInvariantError(
    `Customer intake withdrawal CAS affected zero rows: intakeId=${open.id}, orderId=${input.orderId}, observed=${observedState}`,
  );
}

async function lockOwnedOrder(
  tx: CustomerIntakeTx,
  orderId: string,
  customerUserId: string,
): Promise<LockedOwnedOrder | null> {
  const rows = await tx.$queryRaw<LockedOwnedOrder[]>(Prisma.sql`
    SELECT "id", "status", "userId"
    FROM "Order"
    WHERE "id" = ${orderId} AND "userId" = ${customerUserId}
    FOR UPDATE
  `);
  if (rows.length > 1) {
    throw new CustomerIntakeInvariantError(`Owned Order lock returned multiple rows: orderId=${orderId}`);
  }
  return rows[0] ?? null;
}

function findOpenIntake(tx: CustomerIntakeTx, orderId: string) {
  return tx.customerRefundIntake.findFirst({
    where: { orderId, status: CustomerRefundIntakeStatus.SUBMITTED },
  });
}

async function lockOpenIntake(
  tx: CustomerIntakeTx,
  orderId: string,
): Promise<LockedOpenIntake | null> {
  const rows = await tx.$queryRaw<LockedOpenIntake[]>(Prisma.sql`
    SELECT "id", "customerUserId", "status"
    FROM "CustomerRefundIntake"
    WHERE "orderId" = ${orderId}
      AND "status" = 'SUBMITTED'::"CustomerRefundIntakeStatus"
    FOR UPDATE
  `);
  if (rows.length > 1) {
    throw new CustomerIntakeInvariantError(`Open intake lock returned multiple rows: orderId=${orderId}`);
  }
  return rows[0] ?? null;
}

function resolveSubmitReplay(
  open: CustomerRefundIntake,
  customerUserId: string,
): SubmitCustomerRefundIntakeResult {
  if (open.customerUserId !== customerUserId) {
    return submitFailure("INTAKE_INCONSISTENT", "Customer refund intake ownership is inconsistent.");
  }
  return toSubmitSuccess(open, true);
}

function toSubmitSuccess(
  intake: CustomerRefundIntake,
  replayed: boolean,
): SubmitCustomerRefundIntakeResult {
  if (intake.status !== CustomerRefundIntakeStatus.SUBMITTED) {
    throw new CustomerIntakeInvariantError(
      `Submit projection requires SUBMITTED intake: intakeId=${intake.id}, orderId=${intake.orderId}, status=${intake.status}`,
    );
  }
  return submitCustomerIntakeSuccess({
    orderId: intake.orderId,
    status: CustomerRefundIntakeStatus.SUBMITTED,
    reasonCode: intake.reasonCode,
    reasonDetail: intake.reasonDetail,
    submittedAt: intake.submittedAt,
  }, replayed);
}

function isSubmitEligible(status: OrderStatus): boolean {
  return status === OrderStatus.PAID || status === OrderStatus.PARTIALLY_REFUNDED;
}

function isUniqueConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2002";
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return error.code === "P2002";
}

export type {
  SubmitCustomerRefundIntakeFailure,
  SubmitCustomerRefundIntakeFailureCode,
  SubmitCustomerRefundIntakeInput,
  SubmitCustomerRefundIntakeResult,
  WithdrawCustomerRefundIntakeFailure,
  WithdrawCustomerRefundIntakeFailureCode,
  WithdrawCustomerRefundIntakeInput,
  WithdrawCustomerRefundIntakeResult,
} from "./customer-intake-contract";
