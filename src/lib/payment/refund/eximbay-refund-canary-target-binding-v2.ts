import { createHash } from "node:crypto";
import {
  OrderStatus,
  PaymentAdapterExecutionKind,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  type PrismaClient,
} from "@prisma/client";
import { sumSucceededRefundAmount } from "./invariants";
import {
  deriveEximbayRefundOperationFamily,
  EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
  EXIMBAY_REFUND_OPERATION_FAMILY_VERSION,
} from "./providers/eximbay/preflight-contract";

const DIGEST = /^[0-9a-f]{64}$/u;
const BINDING = /^[A-Za-z0-9._-]{1,64}$/u;

export type EximbayRefundCanaryTargetSealV2Input = Readonly<{
  commandId: string;
  merchantAccountBindingId: string;
  credentialGenerationBindingId: string;
  custodyArtifactSha256: string;
  syntheticProvenanceDigest: string;
  noCustomerPiiAttested: true;
}>;

export type EximbayRefundCanaryTargetSealV2 = Readonly<{
  commandId: string;
  refundAttemptId: string;
  paymentId: string;
  providerOperationBindingId: string;
  targetBindingDigest: string;
}>;

export async function sealEximbayRefundCanaryTargetV2(
  client: PrismaClient,
  input: EximbayRefundCanaryTargetSealV2Input,
): Promise<EximbayRefundCanaryTargetSealV2> {
  return client.$transaction((tx) => sealEximbayRefundCanaryTargetV2InTransaction(tx, input));
}

export function sealEximbayRefundCanaryTargetV2InTransaction(
  tx: Prisma.TransactionClient,
  input: EximbayRefundCanaryTargetSealV2Input,
): Promise<EximbayRefundCanaryTargetSealV2> {
  return inspectTarget(tx, input, true);
}

export async function verifyEximbayRefundCanaryTargetV2(
  tx: Prisma.TransactionClient,
  input: EximbayRefundCanaryTargetSealV2Input & Readonly<{ expectedTargetBindingDigest: string }>,
): Promise<EximbayRefundCanaryTargetSealV2 | null> {
  if (!DIGEST.test(input.expectedTargetBindingDigest) || !validInput(input)) return null;
  const ownership = await discoverTargetOwnership(tx, input.commandId);
  if (!ownership) return null;
  const locked = await lockConsumptionTargetRows(tx, ownership, input.commandId);
  if (!locked) return null;
  const sealed = await inspectTarget(tx, input, false, locked).catch(() => null);
  return sealed?.targetBindingDigest === input.expectedTargetBindingDigest ? sealed : null;
}

type TargetOwnership = Readonly<{ orderId: string; refundAttemptId: string }>;
type LockedTargetIdentity = TargetOwnership & Readonly<{
  paymentId: string;
  bindingId: string;
}>;

async function discoverTargetOwnership(
  tx: Prisma.TransactionClient,
  commandId: string,
): Promise<TargetOwnership | null> {
  const command = await tx.refundExecutionCommand.findUnique({
    where: { id: commandId },
    select: { refundAttemptId: true, refundAttempt: { select: { orderId: true } } },
  });
  return command ? Object.freeze({
    orderId: command.refundAttempt.orderId,
    refundAttemptId: command.refundAttemptId,
  }) : null;
}

/**
 * The caller already holds the approval. The remaining order mirrors the installed
 * refund lifecycle: Order -> every ordered RefundAttempt -> Command -> Payment -> binding.
 */
async function lockConsumptionTargetRows(
  tx: Prisma.TransactionClient,
  ownership: TargetOwnership,
  commandId: string,
): Promise<LockedTargetIdentity | null> {
  const orders = await tx.$queryRaw<{ id: string; paymentId: string }[]>(Prisma.sql`
    SELECT "id", "paymentId" FROM "Order" WHERE "id" = ${ownership.orderId} FOR UPDATE
  `);
  const order = orders[0];
  if (orders.length !== 1 || !order) return null;
  const attempts = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundAttempt"
    WHERE "orderId" = ${ownership.orderId} ORDER BY "id" FOR UPDATE
  `);
  if (!attempts.some((row) => row.id === ownership.refundAttemptId)) return null;
  const commands = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundExecutionCommand"
    WHERE "id" = ${commandId} AND "refundAttemptId" = ${ownership.refundAttemptId}
    FOR UPDATE
  `);
  if (commands.length !== 1) return null;
  const binding = await tx.refundExecutionProviderOperationBinding.findUnique({
    where: { refundAttemptId: ownership.refundAttemptId }, select: { id: true },
  });
  if (!binding) return null;
  const restrictedCanary = await isRestrictedCanarySession(tx);
  if (!(await lockPayment(tx, order.paymentId, restrictedCanary))
    || !(await lockBinding(tx, binding.id, restrictedCanary))) return null;
  return Object.freeze({ ...ownership, paymentId: order.paymentId, bindingId: binding.id });
}

async function lockPayment(
  tx: Prisma.TransactionClient,
  paymentId: string,
  restrictedCanary: boolean,
): Promise<boolean> {
  if (!restrictedCanary) {
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE
    `);
    return rows.length === 1;
  }
  const rows = await tx.$queryRaw<{ locked: boolean }[]>(Prisma.sql`
    SELECT public.mira_refund_canary_lock_payment(${paymentId}) AS "locked"
  `);
  return rows.length === 1 && rows[0]?.locked === true;
}

async function lockBinding(
  tx: Prisma.TransactionClient,
  bindingId: string,
  restrictedCanary: boolean,
): Promise<boolean> {
  if (!restrictedCanary) {
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "RefundExecutionProviderOperationBinding"
      WHERE "id" = ${bindingId} FOR UPDATE
    `);
    return rows.length === 1;
  }
  const rows = await tx.$queryRaw<{ locked: boolean }[]>(Prisma.sql`
    SELECT public.mira_refund_canary_lock_provider_operation_binding(${bindingId}) AS "locked"
  `);
  return rows.length === 1 && rows[0]?.locked === true;
}

async function isRestrictedCanarySession(tx: Prisma.TransactionClient): Promise<boolean> {
  const rows = await tx.$queryRaw<{ restrictedCanary: boolean }[]>(Prisma.sql`
    SELECT current_user = 'mira_refund_canary' AS "restrictedCanary"
  `);
  return rows.length === 1 && rows[0]?.restrictedCanary === true;
}

async function inspectTarget(
  tx: Prisma.TransactionClient,
  input: EximbayRefundCanaryTargetSealV2Input,
  allowBindingCreate: boolean,
  locked?: LockedTargetIdentity,
): Promise<EximbayRefundCanaryTargetSealV2> {
  if (!validInput(input)) throw new Error("EXIMBAY_CANARY_TARGET_INPUT_INVALID");
  const command = await loadAdmissibleTargetAfterLock(tx, input.commandId, locked);
  const attempt = command.refundAttempt;
  const paymentKey = requirePaymentKey(attempt.payment.providerPaymentKey);
  const family = deriveEximbayRefundOperationFamily(
    attempt.idempotencyKey, paymentKey, attempt.amount, attempt.currency,
  );
  const binding = await requireMatchingBinding(
    tx, attempt, family, input, allowBindingCreate,
  );
  return buildTargetSeal(command, binding, family, input, paymentKey);
}

async function loadAdmissibleTargetAfterLock(
  tx: Prisma.TransactionClient,
  commandId: string,
  locked?: LockedTargetIdentity,
): Promise<Target> {
  if (!locked) {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "RefundExecutionCommand" WHERE "id" = ${commandId} FOR UPDATE
    `);
  }
  const command = await loadTarget(tx, commandId);
  if (!command || !targetStateIsAdmissible(command)) {
    throw new Error("EXIMBAY_CANARY_TARGET_NOT_ADMISSIBLE");
  }
  if (locked && !lockedIdentityMatches(command, locked)) {
    throw new Error("EXIMBAY_CANARY_TARGET_IDENTITY_CHANGED");
  }
  return command;
}

function requirePaymentKey(paymentKey: string | null): string {
  if (!paymentKey) throw new Error("EXIMBAY_CANARY_PAYMENT_IDENTITY_INVALID");
  return paymentKey;
}

async function requireMatchingBinding(
  tx: Prisma.TransactionClient,
  attempt: Target["refundAttempt"],
  family: Readonly<{ key: string; fingerprint: string }>,
  input: EximbayRefundCanaryTargetSealV2Input,
  allowBindingCreate: boolean,
): Promise<TargetBinding> {
  const binding = await loadOrCreateBinding(
    tx, attempt, family, input, allowBindingCreate,
  );
  if (!binding || !bindingMatches(binding, attempt.id, family, input)) {
    throw new Error("EXIMBAY_CANARY_OPERATION_BINDING_MISMATCH");
  }
  return binding;
}

function buildTargetSeal(
  command: Target,
  binding: TargetBinding,
  family: Readonly<{ key: string; fingerprint: string }>,
  input: EximbayRefundCanaryTargetSealV2Input,
  paymentKey: string,
): EximbayRefundCanaryTargetSealV2 {
  const attempt = command.refundAttempt;
  const targetBindingDigest = createHash("sha256").update(JSON.stringify([
    "mira-refund-eximbay-sandbox-canary-target/v2",
    command.id, attempt.id, attempt.order.id, attempt.payment.id, binding.id,
    "EXIMBAY", "SANDBOX",
    attempt.amount, attempt.currency,
    attempt.payment.amount, attempt.payment.currency,
    attempt.order.totalAmount, attempt.order.currency,
    attempt.idempotencyKey, attempt.payment.providerOrderId, paymentKey,
    attempt.payment.financialSucceededAt?.toISOString(),
    family.key, family.fingerprint,
    "READY", "PROCESSING", "REFUND_PENDING", "SUCCEEDED", "EXTERNAL", "FINALIZED",
    0, null, input.merchantAccountBindingId, input.credentialGenerationBindingId,
    input.custodyArtifactSha256, input.syntheticProvenanceDigest, true, 1, false,
    EXIMBAY_REFUND_OPERATION_FAMILY_VERSION, EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
  ]), "utf8").digest("hex");
  return Object.freeze({
    commandId: command.id,
    refundAttemptId: attempt.id,
    paymentId: attempt.payment.id,
    providerOperationBindingId: binding.id,
    targetBindingDigest,
  });
}

function lockedIdentityMatches(command: Target, locked: LockedTargetIdentity): boolean {
  const attempt = command.refundAttempt;
  return attempt.id === locked.refundAttemptId
    && attempt.order.id === locked.orderId
    && attempt.payment.id === locked.paymentId
    && attempt.providerOperationBinding?.id === locked.bindingId;
}

function loadTarget(tx: Prisma.TransactionClient, commandId: string) {
  return tx.refundExecutionCommand.findUnique({
    where: { id: commandId },
    include: {
      refundAttempt: {
        include: {
          payment: true,
          order: { include: { refundAttempts: true } },
          providerOperationBinding: { include: { eligibilityProof: true } },
        },
      },
    },
  });
}

type Target = NonNullable<Awaited<ReturnType<typeof loadTarget>>>;
type TargetBinding = NonNullable<Target["refundAttempt"]["providerOperationBinding"]>;

async function loadOrCreateBinding(
  tx: Prisma.TransactionClient,
  attempt: Target["refundAttempt"],
  family: Readonly<{ key: string; fingerprint: string }>,
  input: EximbayRefundCanaryTargetSealV2Input,
  allowBindingCreate: boolean,
): Promise<TargetBinding | null> {
  if (attempt.providerOperationBinding || !allowBindingCreate) {
    return attempt.providerOperationBinding;
  }
  return tx.refundExecutionProviderOperationBinding.create({
    data: {
      refundAttemptId: attempt.id,
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX,
      providerOperationFamilyKey: family.key,
      operationFamilyKeyAlgorithmVersion: EXIMBAY_REFUND_OPERATION_FAMILY_VERSION,
      wireContractVersion: EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
      operationFamilyFingerprint: family.fingerprint,
      merchantAccountBindingId: input.merchantAccountBindingId,
      credentialGenerationBindingId: input.credentialGenerationBindingId,
    },
    include: { eligibilityProof: true },
  });
}

function targetStateIsAdmissible(command: Target): boolean {
  const attempt = command.refundAttempt;
  const payment = attempt.payment;
  const order = attempt.order;
  const priorSucceeded = sumSucceededRefundAmount(order.refundAttempts);
  return [
    command.status === RefundExecutionCommandStatus.READY,
    command.dispatchAttempt === 0,
    [command.leaseOwner, command.leaseUntil, command.leaseTokenHash].every((value) => value === null),
    attempt.status === RefundAttemptStatus.PROCESSING,
    attempt.provider === PaymentProvider.EXIMBAY,
    attempt.mode === PaymentMode.SANDBOX,
    attempt.providerRefundId === null,
    attempt.actorType === RefundAttemptActorType.SYSTEM,
    attempt.actorUserId === null,
    order.status === OrderStatus.REFUND_PENDING,
    order.id === attempt.orderId,
    order.paymentId === payment.id,
    order.refundAttempts.length === 1,
    payment.status === PaymentAttemptStatus.SUCCEEDED,
    payment.attemptLifecycle === PaymentAttemptLifecycle.FINALIZED,
    payment.adapterExecutionKind === PaymentAdapterExecutionKind.EXTERNAL,
    payment.provider === PaymentProvider.EXIMBAY,
    payment.mode === PaymentMode.SANDBOX,
    nonempty(payment.providerOrderId),
    nonempty(payment.providerPaymentKey),
    payment.financialSucceededAt instanceof Date,
    attempt.paymentId === payment.id,
    attempt.amount === payment.amount,
    attempt.amount === order.totalAmount,
    attempt.currency === payment.currency,
    order.currency === attempt.currency,
    order.promotionGrantId === null,
    order.discountAmount === 0,
    priorSucceeded === 0,
    ["USD", "JPY"].includes(attempt.currency),
  ].every(Boolean);
}

function bindingMatches(
  binding: TargetBinding,
  attemptId: string,
  family: Readonly<{ key: string; fingerprint: string }>,
  input: EximbayRefundCanaryTargetSealV2Input,
): boolean {
  return [
    binding.refundAttemptId === attemptId,
    binding.provider === PaymentProvider.EXIMBAY,
    binding.mode === PaymentMode.SANDBOX,
    binding.providerOperationFamilyKey === family.key,
    binding.operationFamilyKeyAlgorithmVersion === EXIMBAY_REFUND_OPERATION_FAMILY_VERSION,
    binding.wireContractVersion === EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
    binding.operationFamilyFingerprint === family.fingerprint,
    binding.merchantAccountBindingId === input.merchantAccountBindingId,
    binding.credentialGenerationBindingId === input.credentialGenerationBindingId,
    binding.eligibilityProof === null,
  ].every(Boolean);
}

function validInput(input: EximbayRefundCanaryTargetSealV2Input): boolean {
  return typeof input.commandId === "string" && input.commandId.length > 0
    && BINDING.test(input.merchantAccountBindingId)
    && BINDING.test(input.credentialGenerationBindingId)
    && DIGEST.test(input.custodyArtifactSha256)
    && DIGEST.test(input.syntheticProvenanceDigest)
    && input.noCustomerPiiAttested === true;
}

function nonempty(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}
