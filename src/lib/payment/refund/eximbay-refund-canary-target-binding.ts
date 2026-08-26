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
import {
  deriveEximbayRefundOperationFamily,
  EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
  EXIMBAY_REFUND_OPERATION_FAMILY_VERSION,
} from "./providers/eximbay/preflight-contract";

const DIGEST = /^[0-9a-f]{64}$/u;
const BINDING = /^[A-Za-z0-9._-]{1,64}$/u;

export type EximbayRefundCanaryTargetSealInput = Readonly<{
  commandId: string;
  merchantAccountBindingId: string;
  credentialGenerationBindingId: string;
  syntheticProvenanceDigest: string;
  noCustomerPiiAttested: true;
}>;

export type EximbayRefundCanaryTargetSeal = Readonly<{
  commandId: string;
  refundAttemptId: string;
  paymentId: string;
  providerOperationBindingId: string;
  targetBindingDigest: string;
}>;

export async function sealEximbayRefundCanaryTarget(
  client: PrismaClient,
  input: EximbayRefundCanaryTargetSealInput,
): Promise<EximbayRefundCanaryTargetSeal> {
  return client.$transaction((tx) => inspectTarget(tx, input, true));
}

export async function verifyEximbayRefundCanaryTarget(
  tx: Prisma.TransactionClient,
  input: EximbayRefundCanaryTargetSealInput & Readonly<{ expectedTargetBindingDigest: string }>,
): Promise<EximbayRefundCanaryTargetSeal | null> {
  if (!DIGEST.test(input.expectedTargetBindingDigest)) return null;
  const sealed = await inspectTarget(tx, input, false).catch(() => null);
  return sealed?.targetBindingDigest === input.expectedTargetBindingDigest ? sealed : null;
}

async function inspectTarget(
  tx: Prisma.TransactionClient,
  input: EximbayRefundCanaryTargetSealInput,
  allowBindingCreate: boolean,
): Promise<EximbayRefundCanaryTargetSeal> {
  if (!validInput(input)) throw new Error("EXIMBAY_CANARY_TARGET_INPUT_INVALID");
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "RefundExecutionCommand" WHERE "id" = ${input.commandId} FOR UPDATE
  `);
  const command = await loadTarget(tx, input.commandId);
  if (!command || !targetStateIsAdmissible(command)) {
    throw new Error("EXIMBAY_CANARY_TARGET_NOT_ADMISSIBLE");
  }
  const attempt = command.refundAttempt;
  const paymentKey = attempt.payment.providerPaymentKey;
  if (!paymentKey) throw new Error("EXIMBAY_CANARY_PAYMENT_IDENTITY_INVALID");
  const family = deriveEximbayRefundOperationFamily(
    attempt.idempotencyKey, paymentKey, attempt.amount, attempt.currency,
  );
  const binding = await loadOrCreateBinding(
    tx, attempt, family, input, allowBindingCreate,
  );
  if (!binding || !bindingMatches(binding, attempt.id, family, input)) {
    throw new Error("EXIMBAY_CANARY_OPERATION_BINDING_MISMATCH");
  }
  const targetBindingDigest = createHash("sha256").update(JSON.stringify([
    "mira-refund-eximbay-sandbox-canary-target/v1",
    command.id, attempt.id, attempt.payment.id, binding.id,
    "EXIMBAY", "SANDBOX", attempt.amount, attempt.currency,
    attempt.idempotencyKey, attempt.payment.providerOrderId, paymentKey,
    attempt.payment.financialSucceededAt?.toISOString(),
    family.key, family.fingerprint,
    "READY", "PROCESSING", "REFUND_PENDING", "SUCCEEDED", "EXTERNAL", "FINALIZED",
    0, null, input.merchantAccountBindingId, input.credentialGenerationBindingId,
    input.syntheticProvenanceDigest, true, 1, false,
  ]), "utf8").digest("hex");
  return Object.freeze({
    commandId: command.id,
    refundAttemptId: attempt.id,
    paymentId: attempt.payment.id,
    providerOperationBindingId: binding.id,
    targetBindingDigest,
  });
}

function loadTarget(tx: Prisma.TransactionClient, commandId: string) {
  return tx.refundExecutionCommand.findUnique({
    where: { id: commandId },
    include: {
      refundAttempt: {
        include: { payment: true, order: true, providerOperationBinding: {
          include: { eligibilityProof: true },
        } },
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
  input: EximbayRefundCanaryTargetSealInput,
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
    attempt.order.status === OrderStatus.REFUND_PENDING,
    payment.status === PaymentAttemptStatus.SUCCEEDED,
    payment.attemptLifecycle === PaymentAttemptLifecycle.FINALIZED,
    payment.adapterExecutionKind === PaymentAdapterExecutionKind.EXTERNAL,
    payment.provider === PaymentProvider.EXIMBAY,
    payment.mode === PaymentMode.SANDBOX,
    nonempty(payment.providerOrderId),
    nonempty(payment.providerPaymentKey),
    payment.financialSucceededAt instanceof Date,
    attempt.amount === payment.amount,
    attempt.currency === payment.currency,
    attempt.order.currency === attempt.currency,
    ["USD", "JPY"].includes(attempt.currency),
  ].every(Boolean);
}

function bindingMatches(
  binding: TargetBinding,
  attemptId: string,
  family: Readonly<{ key: string; fingerprint: string }>,
  input: EximbayRefundCanaryTargetSealInput,
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

function validInput(input: EximbayRefundCanaryTargetSealInput): boolean {
  return typeof input.commandId === "string" && input.commandId.length > 0
    && BINDING.test(input.merchantAccountBindingId)
    && BINDING.test(input.credentialGenerationBindingId)
    && DIGEST.test(input.syntheticProvenanceDigest)
    && input.noCustomerPiiAttested === true;
}

function nonempty(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}
