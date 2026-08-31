import { createHash } from "node:crypto";
import {
  CheckoutSessionStatus,
  OrderStatus,
  PaymentAdapterExecutionKind,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentInitiationOutputKind,
  PaymentMode,
  PaymentProvider,
  PaymentRemediationStatus,
  Prisma,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  ShippingCountry,
  type PrismaClient,
} from "@prisma/client";
import { buildRefundAttemptIdempotencyKey } from "./invariants";
import { claimRefundAttemptForEximbayCanarySystemExecution } from "./claim";
import {
  CLAIM_TRANSITION_REASON,
  buildRefundExecutionClaimOperationKey,
} from "./claim-contract";
import {
  EXIMBAY_CANARY_FRESH_SALE_MAX_AGE_MS,
  EXIMBAY_CANARY_EXACT_ROUTING_RULE,
  EXIMBAY_CANARY_EXACT_SYNTHETIC_ADDRESS,
  EXIMBAY_CANARY_EXACT_SYNTHETIC_AREA,
  EXIMBAY_CANARY_EXACT_SYNTHETIC_CITY,
  EXIMBAY_CANARY_EXACT_SYNTHETIC_NAME,
  EXIMBAY_CANARY_EXACT_SYNTHETIC_PHONE,
  EXIMBAY_CANARY_EXACT_SYNTHETIC_POSTAL_CODE,
  EXIMBAY_CANARY_SYNTHETIC_EMAIL,
  EXIMBAY_CANARY_TARGET_REASON,
  EximbayCanaryProducerError,
  deriveEximbayCanaryCredentialGenerationBindingId,
  deriveEximbayCanaryMerchantAccountBindingId,
  deriveEximbayCanaryRuntimeBindings,
  deriveEximbayCanaryRefundAttemptId,
  parseEximbayCanaryAttestation,
  requireEximbayCanaryExactContractDigests,
  type EximbayCanaryAttendedAttestation,
  type EximbayCanaryContractDigests,
  type EximbayCanaryRuntimeBindings,
} from "./eximbay-refund-canary-producer-contract";
import {
  sealEximbayRefundCanaryTarget,
  verifyEximbayRefundCanaryTarget,
} from "./eximbay-refund-canary-target-binding";
import { requestRefundAttemptInTransaction } from "./request";
import {
  buildRefundRequestOperationKey,
  resolveRefundRequestCreationEvidence,
} from "./request-evidence";

export const EXIMBAY_CANARY_SYNTHETIC_PROVENANCE_VERSION =
  "mira-refund-eximbay-canary-synthetic-provenance/v1";

const PAYMENT_ID = /^[A-Za-z0-9_-]{1,128}$/u;

type LoadedAggregate = NonNullable<Awaited<ReturnType<typeof loadPaymentAggregate>>>;
type Aggregate = Omit<LoadedAggregate, "order"> & Readonly<{
  order: NonNullable<LoadedAggregate["order"]>;
}>;
type TargetAttempt = Aggregate["order"]["refundAttempts"][number];
type InspectionPhase = "MATERIALIZE" | "SEALED" | "APPROVAL";

export type MaterializeEximbayCanaryTargetInput = Readonly<{
  paymentId: string;
  attestation: EximbayCanaryAttendedAttestation;
  contractDigests: EximbayCanaryContractDigests;
}>;

export type MaterializeEximbayCanaryTargetResult = Readonly<{
  ok: true;
  code: "EXIMBAY_CANARY_TARGET_MATERIALIZED";
  paymentId: string;
  checkoutSessionId: string;
  orderId: string;
  refundAttemptId: string;
  commandId: string;
  providerOperationBindingId: string;
  targetBindingDigest: string;
  syntheticProvenanceDigest: string;
  runtimeBindings: EximbayCanaryRuntimeBindings;
}>;

export async function materializeEximbayRefundCanaryTarget(
  client: PrismaClient,
  input: MaterializeEximbayCanaryTargetInput,
): Promise<MaterializeEximbayCanaryTargetResult> {
  requireEximbayCanaryExactContractDigests(input.contractDigests);
  const normalized = normalizeMaterializeInput(input);
  const requested = await createOrReplayRequest(client, normalized);
  const commandId = requested.commandId ?? await claimRequestedTarget(client, requested);
  await requireClaimPostcondition(client, requested, commandId);

  let sealed;
  try {
    sealed = await sealEximbayRefundCanaryTarget(client, {
      commandId,
      merchantAccountBindingId: requested.merchantAccountBindingId,
      credentialGenerationBindingId: requested.credentialGenerationBindingId,
      syntheticProvenanceDigest: requested.syntheticProvenanceDigest,
      noCustomerPiiAttested: true,
    });
  } catch {
    throw new EximbayCanaryProducerError("TARGET_SEAL_FAILED");
  }
  await requireSealedPostcondition(client, normalized, requested, sealed.targetBindingDigest);
  const runtimeBindings = deriveEximbayCanaryRuntimeBindings(input.contractDigests, {
    targetBindingDigest: sealed.targetBindingDigest,
    syntheticProvenanceDigest: requested.syntheticProvenanceDigest,
    merchantAccountBindingId: requested.merchantAccountBindingId,
    credentialGenerationBindingId: requested.credentialGenerationBindingId,
  });
  return Object.freeze({
    ok: true,
    code: "EXIMBAY_CANARY_TARGET_MATERIALIZED",
    paymentId: normalized.paymentId,
    checkoutSessionId: requested.checkoutSessionId,
    orderId: requested.orderId,
    refundAttemptId: requested.refundAttemptId,
    commandId,
    providerOperationBindingId: sealed.providerOperationBindingId,
    targetBindingDigest: sealed.targetBindingDigest,
    syntheticProvenanceDigest: requested.syntheticProvenanceDigest,
    runtimeBindings,
  });
}

export async function inspectSealedEximbayCanaryTarget(
  tx: Prisma.TransactionClient,
  paymentId: string,
  attestation: EximbayCanaryAttendedAttestation,
  expectedTargetBindingDigest: string,
): Promise<Readonly<{
  aggregate: Aggregate;
  target: TargetAttempt;
  syntheticProvenanceDigest: string;
  merchantAccountBindingId: string;
  credentialGenerationBindingId: string;
}>> {
  const normalizedPaymentId = normalizePaymentId(paymentId);
  requireExactAttestation(attestation);
  const capturedAt = await captureDatabaseTime(tx);
  await lockAggregate(tx, normalizedPaymentId);
  const initial = requireLoadedAggregate(
    await loadPaymentAggregate(tx, normalizedPaymentId), "PAYMENT_NOT_ELIGIBLE",
  );
  const commandId = requireApprovalCommandId(initial);
  if (!(await lockCommand(tx, commandId))) {
    throw new EximbayCanaryProducerError("TARGET_POSTCONDITION_FAILED");
  }
  const aggregate = requireLoadedAggregate(
    await loadPaymentAggregate(tx, normalizedPaymentId), "TARGET_POSTCONDITION_FAILED",
  );
  const inspection = inspectAggregate(aggregate, attestation, capturedAt, "APPROVAL");
  const target = inspection.target;
  if (!target?.executionCommand) {
    throw new EximbayCanaryProducerError("TARGET_POSTCONDITION_FAILED");
  }
  const verified = await verifyEximbayRefundCanaryTarget(tx, {
    commandId: target.executionCommand.id,
    merchantAccountBindingId: inspection.merchantAccountBindingId,
    credentialGenerationBindingId: inspection.credentialGenerationBindingId,
    syntheticProvenanceDigest: inspection.syntheticProvenanceDigest,
    noCustomerPiiAttested: true,
    expectedTargetBindingDigest,
  });
  if (!verified) throw new EximbayCanaryProducerError("TARGET_POSTCONDITION_FAILED");
  return Object.freeze({ aggregate, target,
    syntheticProvenanceDigest: inspection.syntheticProvenanceDigest,
    merchantAccountBindingId: inspection.merchantAccountBindingId,
    credentialGenerationBindingId: inspection.credentialGenerationBindingId });
}

function requireApprovalCommandId(aggregate: Aggregate): string {
  const commandId = aggregate.order.refundAttempts[0]?.executionCommand?.id;
  if (!commandId) throw new EximbayCanaryProducerError("TARGET_POSTCONDITION_FAILED");
  return commandId;
}

type NormalizedMaterializeInput = Readonly<{
  paymentId: string;
  attestation: EximbayCanaryAttendedAttestation;
  refundAttemptId: string;
}>;

type RequestedTarget = Readonly<{
  checkoutSessionId: string;
  orderId: string;
  refundAttemptId: string;
  capturedAt: Date;
  syntheticProvenanceDigest: string;
  merchantAccountBindingId: string;
  credentialGenerationBindingId: string;
  commandId: string | null;
  attestation: EximbayCanaryAttendedAttestation;
}>;

function normalizeMaterializeInput(input: MaterializeEximbayCanaryTargetInput): NormalizedMaterializeInput {
  const paymentId = normalizePaymentId(input.paymentId);
  requireExactAttestation(input.attestation);
  return Object.freeze({
    paymentId,
    attestation: input.attestation,
    refundAttemptId: deriveEximbayCanaryRefundAttemptId(paymentId),
  });
}

function normalizePaymentId(value: string): string {
  const normalized = value.trim();
  if (!PAYMENT_ID.test(normalized)) throw new EximbayCanaryProducerError("PAYMENT_ID_INVALID");
  return normalized;
}

function requireExactAttestation(value: EximbayCanaryAttendedAttestation): void {
  if (!parseEximbayCanaryAttestation(value)) {
    throw new EximbayCanaryProducerError("ATTESTATION_INVALID");
  }
}

async function createOrReplayRequest(
  client: PrismaClient,
  input: NormalizedMaterializeInput,
): Promise<RequestedTarget> {
  return client.$transaction(async (tx) => {
    const capturedAt = await captureDatabaseTime(tx);
    await lockAggregate(tx, input.paymentId);
    const loaded = await loadPaymentAggregate(tx, input.paymentId);
    if (!hasOrder(loaded)) throw new EximbayCanaryProducerError("PAYMENT_NOT_ELIGIBLE");
    const aggregate = loaded;
    const inspection = inspectAggregate(aggregate, input.attestation, capturedAt, "MATERIALIZE");
    const result = await requestRefundAttemptInTransaction(tx, {
      refundAttemptId: input.refundAttemptId,
      orderId: aggregate.order.id,
      amount: aggregate.amount,
      reason: EXIMBAY_CANARY_TARGET_REASON,
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      now: capturedAt,
    }, { allowEximbaySandboxCustomerApproval: true });
    if (!requestedResultMatches(result, input.refundAttemptId, aggregate.amount)) {
      throw new EximbayCanaryProducerError("TARGET_REQUEST_FAILED");
    }
    return Object.freeze({
      checkoutSessionId: aggregate.checkoutSessionId,
      orderId: aggregate.order.id,
      refundAttemptId: result.refundAttempt.id,
      capturedAt,
      syntheticProvenanceDigest: inspection.syntheticProvenanceDigest,
      merchantAccountBindingId: inspection.merchantAccountBindingId,
      credentialGenerationBindingId: inspection.credentialGenerationBindingId,
      commandId: inspection.target?.executionCommand?.id ?? null,
      attestation: input.attestation,
    });
  });
}

function requestedResultMatches(
  result: Awaited<ReturnType<typeof requestRefundAttemptInTransaction>>,
  refundAttemptId: string,
  amount: number,
): result is Extract<Awaited<ReturnType<typeof requestRefundAttemptInTransaction>>, { ok: true }> {
  if (!result.ok) return false;
  return [result.refundAttempt.id === refundAttemptId,
    result.refundAttempt.amount === amount, result.refundAttempt.currency === "USD"].every(Boolean);
}

async function claimRequestedTarget(
  client: PrismaClient,
  requested: RequestedTarget,
): Promise<string> {
  const claimed = await claimRefundAttemptForEximbayCanarySystemExecution(client, {
    orderId: requested.orderId,
    refundAttemptId: requested.refundAttemptId,
    now: requested.capturedAt,
    attestation: requested.attestation,
  });
  if (!claimed.ok) throw new EximbayCanaryProducerError("TARGET_CLAIM_FAILED");
  return claimed.commandId;
}

async function requireClaimPostcondition(
  client: PrismaClient,
  requested: RequestedTarget,
  commandId: string,
): Promise<void> {
  const target = await client.refundAttempt.findUnique({
    where: { id: requested.refundAttemptId },
    include: { executionCommand: true },
  });
  const command = target?.executionCommand;
  if (!target || !command) {
    throw new EximbayCanaryProducerError("TARGET_POSTCONDITION_FAILED");
  }
  const valid = [
    target.status === RefundAttemptStatus.PROCESSING,
    target.actorType === RefundAttemptActorType.SYSTEM,
    target.actorUserId === null,
    target.amount > 0,
    target.currency === "USD",
    command.id === commandId,
    command.status === RefundExecutionCommandStatus.READY,
    command.dispatchAttempt === 0,
    command.leaseGeneration === 0,
    command.leaseOwner === null,
    command.leaseUntil === null,
    command.leaseTokenHash === null,
    command.lastSafeErrorCode === null,
    command.lastSafeErrorMessage === null,
  ].every(Boolean);
  if (!valid) throw new EximbayCanaryProducerError("TARGET_POSTCONDITION_FAILED");
}

async function requireSealedPostcondition(
  client: PrismaClient,
  input: NormalizedMaterializeInput,
  requested: RequestedTarget,
  targetBindingDigest: string,
): Promise<void> {
  await client.$transaction(async (tx) => {
    const capturedAt = await captureDatabaseTime(tx);
    await lockAggregate(tx, input.paymentId);
    const loaded = await loadPaymentAggregate(tx, input.paymentId);
    if (!hasOrder(loaded)) throw new EximbayCanaryProducerError("TARGET_POSTCONDITION_FAILED");
    const aggregate = loaded;
    const inspection = inspectAggregate(aggregate, input.attestation, capturedAt, "SEALED");
    const command = inspection.target?.executionCommand;
    if (!command || inspection.syntheticProvenanceDigest !== requested.syntheticProvenanceDigest) {
      throw new EximbayCanaryProducerError("TARGET_POSTCONDITION_FAILED");
    }
    const verified = await verifyEximbayRefundCanaryTarget(tx, {
      commandId: command.id,
      merchantAccountBindingId: requested.merchantAccountBindingId,
      credentialGenerationBindingId: requested.credentialGenerationBindingId,
      syntheticProvenanceDigest: requested.syntheticProvenanceDigest,
      noCustomerPiiAttested: true,
      expectedTargetBindingDigest: targetBindingDigest,
    });
    if (!verified) throw new EximbayCanaryProducerError("TARGET_POSTCONDITION_FAILED");
  });
}

function inspectAggregate(
  aggregate: Aggregate,
  attestation: EximbayCanaryAttendedAttestation,
  capturedAt: Date,
  phase: InspectionPhase,
) {
  requireSaleIdentity(aggregate);
  requireFreshness(aggregate, capturedAt);
  requireSyntheticContact(aggregate);
  const target = requireRefundState(aggregate, phase);
  const merchantAccountBindingId = deriveEximbayCanaryMerchantAccountBindingId(attestation);
  const credentialGenerationBindingId = deriveEximbayCanaryCredentialGenerationBindingId({
    ...attestation,
    merchantAccountBindingId,
  });
  const syntheticProvenanceDigest = syntheticDigest(
    aggregate, attestation, merchantAccountBindingId, credentialGenerationBindingId,
  );
  return Object.freeze({ target, syntheticProvenanceDigest,
    merchantAccountBindingId, credentialGenerationBindingId });
}

function requireSaleIdentity(aggregate: Aggregate): void {
  const session = aggregate.session;
  const order = aggregate.order;
  const valid = [
    aggregate.provider === PaymentProvider.EXIMBAY,
    aggregate.mode === PaymentMode.SANDBOX,
    aggregate.status === PaymentAttemptStatus.SUCCEEDED,
    aggregate.attemptLifecycle === PaymentAttemptLifecycle.FINALIZED,
    aggregate.adapterExecutionKind === PaymentAdapterExecutionKind.EXTERNAL,
    aggregate.remediationStatus === PaymentRemediationStatus.NONE,
    aggregate.routingRuleId === EXIMBAY_CANARY_EXACT_ROUTING_RULE,
    aggregate.initiationOutputKind === PaymentInitiationOutputKind.READY,
    aggregate.initiationCompletedAt instanceof Date,
    aggregate.contactIntentAt instanceof Date,
    aggregate.contactStartedAt instanceof Date,
    aggregate.supersededAt === null,
    aggregate.suspendedByPaymentId === null,
    aggregate.errorCode === null,
    aggregate.errorMessage === null,
    aggregate.currency === "USD",
    Number.isSafeInteger(aggregate.amount) && aggregate.amount > 0,
    nonempty(aggregate.providerOrderId),
    nonempty(aggregate.providerPaymentKey),
    aggregate.financialSucceededAt instanceof Date,
    session.status === CheckoutSessionStatus.COMPLETED,
    session.marketCode === "US",
    session.communicationLocale === "en",
    session.currency === "USD",
    session.completedAt instanceof Date,
    order.marketCode === "US",
    order.currency === "USD",
    order.paymentId === aggregate.id,
    order.checkoutSessionId === session.id,
    order.userId === session.userId,
    order.totalAmount === aggregate.amount,
    session.totalAmount === aggregate.amount,
    order.disputeStatus === null,
    order.paidAt instanceof Date,
  ].every(Boolean);
  if (!valid) throw new EximbayCanaryProducerError("PAYMENT_NOT_ELIGIBLE");
}

function requireFreshness(aggregate: Aggregate, capturedAt: Date): void {
  const succeededAt = aggregate.financialSucceededAt;
  const completedAt = aggregate.session.completedAt;
  if (!(succeededAt instanceof Date) || !(completedAt instanceof Date)) {
    throw new EximbayCanaryProducerError("SALE_NOT_FRESH");
  }
  const age = capturedAt.getTime() - succeededAt.getTime();
  if (age < 0 || age > EXIMBAY_CANARY_FRESH_SALE_MAX_AGE_MS
    || completedAt.getTime() > capturedAt.getTime()
    || aggregate.order.paidAt.getTime() > capturedAt.getTime()) {
    throw new EximbayCanaryProducerError("SALE_NOT_FRESH");
  }
}

function requireSyntheticContact(aggregate: Aggregate): void {
  const user = aggregate.session.user;
  const sessionShipping = aggregate.session.shipping;
  const orderShipping = aggregate.order.shipping;
  if (!EXIMBAY_CANARY_SYNTHETIC_EMAIL.test(user.email)
    || user.name !== EXIMBAY_CANARY_EXACT_SYNTHETIC_NAME
    || !sessionShipping || !orderShipping
    || !exactSyntheticShipping(sessionShipping) || !exactSyntheticShipping(orderShipping)
    || !sameShipping(sessionShipping, orderShipping)) {
    throw new EximbayCanaryProducerError("SYNTHETIC_IDENTITY_INVALID");
  }
}

function requireRefundState(aggregate: Aggregate, phase: InspectionPhase): TargetAttempt | null {
  if (![aggregate.order.customerRefundIntakes.length === 0,
    aggregate.order.refundAttempts.length <= 1].every(Boolean)) {
    throw new EximbayCanaryProducerError("REFUND_CONTAMINATION");
  }
  const target = aggregate.order.refundAttempts[0] ?? null;
  if (!target) {
    return requireNoTargetState(aggregate, phase);
  }
  requireExactCanaryAttempt(aggregate, target);
  if (phase === "MATERIALIZE") {
    requireMaterializeReentryState(target);
    return target;
  }
  requireExactSealedState(target);
  if (approvalAlreadyExists(target, phase)) {
    throw new EximbayCanaryProducerError("APPROVAL_ALREADY_EXISTS");
  }
  return target;
}

function requireNoTargetState(aggregate: Aggregate, phase: InspectionPhase): null {
  if (![phase === "MATERIALIZE", aggregate.order.status === OrderStatus.PAID].every(Boolean)) {
    throw new EximbayCanaryProducerError("REFUND_CONTAMINATION");
  }
  return null;
}

function approvalAlreadyExists(target: TargetAttempt, phase: InspectionPhase): boolean {
  return phase === "APPROVAL"
    && target.executionCommand?.eximbaySandboxCanaryApproval !== null;
}

function requireMaterializeReentryState(target: TargetAttempt): void {
  if (target.providerOperationBinding || target.executionCommand?.eximbaySandboxCanaryApproval) {
    throw new EximbayCanaryProducerError("TARGET_ALREADY_MATERIALIZED");
  }
  const valid = [
    target.status === RefundAttemptStatus.REQUESTED || target.status === RefundAttemptStatus.PROCESSING,
    target.status !== RefundAttemptStatus.REQUESTED || target.executionCommand === null,
    target.status !== RefundAttemptStatus.PROCESSING || target.executionCommand !== null,
  ].every(Boolean);
  if (!valid) throw new EximbayCanaryProducerError("REFUND_CONTAMINATION");
}

function requireExactCanaryAttempt(aggregate: Aggregate, target: TargetAttempt): void {
  const expectedId = deriveEximbayCanaryRefundAttemptId(aggregate.id);
  const creation = target.transitions.find((transition) => transition.fromStatus === null);
  if (!creation) throw new EximbayCanaryProducerError("REFUND_CONTAMINATION");
  const valid = [
    target.id === expectedId,
    target.orderId === aggregate.order.id,
    target.paymentId === aggregate.id,
    target.amount === aggregate.amount,
    target.currency === "USD",
    target.provider === PaymentProvider.EXIMBAY,
    target.mode === PaymentMode.SANDBOX,
    target.actorType === RefundAttemptActorType.SYSTEM,
    target.actorUserId === null,
    target.providerRefundId === null,
    target.idempotencyKey === buildRefundAttemptIdempotencyKey(aggregate.id, target.id),
    target.reason === EXIMBAY_CANARY_TARGET_REASON,
    target.processedAt === null,
    target.failedAt === null,
    target.failureCode === null,
    target.safeFailureMessage === null,
    aggregate.order.status === OrderStatus.REFUND_PENDING,
    creation.toStatus === RefundAttemptStatus.REQUESTED,
    creation.orderStatusBefore === OrderStatus.PAID,
    creation.orderStatusAfter === OrderStatus.REFUND_PENDING,
    creation.actorType === RefundAttemptActorType.SYSTEM,
    creation.actorUserId === null,
    creation.reason === EXIMBAY_CANARY_TARGET_REASON,
    creation.operationKey === buildRefundRequestOperationKey(target.id),
    creation.createdAt.getTime() === target.requestedAt.getTime(),
    resolveRefundRequestCreationEvidence(target.transitions, target).kind === "matched",
  ].every(Boolean);
  if (!valid) throw new EximbayCanaryProducerError("REFUND_CONTAMINATION");
}

function requireExactSealedState(target: TargetAttempt): void {
  const command = target.executionCommand;
  const binding = target.providerOperationBinding;
  if (!command) throw new EximbayCanaryProducerError("TARGET_POSTCONDITION_FAILED");
  if (!binding) throw new EximbayCanaryProducerError("TARGET_POSTCONDITION_FAILED");
  const claim = target.transitions.find((transition) => (
    transition.fromStatus === RefundAttemptStatus.REQUESTED
  ));
  if (!claim) throw new EximbayCanaryProducerError("TARGET_POSTCONDITION_FAILED");
  const valid = [
    target.status === RefundAttemptStatus.PROCESSING,
    target.transitions.length === 2,
    command.status === RefundExecutionCommandStatus.READY,
    command.dispatchAttempt === 0,
    command.leaseGeneration === 0,
    command.leaseOwner === null,
    command.leaseUntil === null,
    command.leaseTokenHash === null,
    command.events.length === 0,
    command.dispatchAttempts.length === 0,
    command.evidence.length === 0,
    command.lastSafeErrorCode === null,
    command.lastSafeErrorMessage === null,
    claim.toStatus === RefundAttemptStatus.PROCESSING,
    claim.orderStatusBefore === OrderStatus.REFUND_PENDING,
    claim.orderStatusAfter === OrderStatus.REFUND_PENDING,
    claim.actorType === RefundAttemptActorType.SYSTEM,
    claim.actorUserId === null,
    claim.reason === CLAIM_TRANSITION_REASON,
    claim.operationKey === buildRefundExecutionClaimOperationKey(command.id),
    claim.createdAt.getTime() === command.availableAt.getTime(),
    binding.eligibilityProof === null,
    binding.eximbayPreflightObservations.length === 0,
  ].every(Boolean);
  if (!valid) throw new EximbayCanaryProducerError("TARGET_POSTCONDITION_FAILED");
}

function syntheticDigest(
  aggregate: Aggregate,
  attestation: EximbayCanaryAttendedAttestation,
  merchantAccountBindingId: string,
  credentialGenerationBindingId: string,
): string {
  const providerOrderId = aggregate.providerOrderId;
  const providerPaymentKey = aggregate.providerPaymentKey;
  const financialSucceededAt = aggregate.financialSucceededAt;
  const completedAt = aggregate.session.completedAt;
  if (!providerOrderId || !providerPaymentKey || !financialSucceededAt || !completedAt) {
    throw new EximbayCanaryProducerError("PAYMENT_NOT_ELIGIBLE");
  }
  return digest([
    EXIMBAY_CANARY_SYNTHETIC_PROVENANCE_VERSION,
    "EXIMBAY", "SANDBOX", "US", "USD", "CARD", "EN",
    aggregate.id, aggregate.checkoutSessionId, aggregate.order.id, aggregate.session.userId,
    providerOrderId, providerPaymentKey, financialSucceededAt.toISOString(),
    aggregate.status, aggregate.attemptLifecycle, aggregate.adapterExecutionKind,
    aggregate.initiationOutputKind, aggregate.routingRuleId, aggregate.amount,
    completedAt.toISOString(), aggregate.order.paidAt.toISOString(),
    syntheticContactDigest(aggregate),
    attestation.formatVersion,
    attestation.officialTestCredentialMaterialized,
    attestation.syntheticIdentityAttested,
    attestation.controlledNonCustomerContactAttested,
    attestation.noCustomerPiiAttested,
    merchantAccountBindingId,
    credentialGenerationBindingId,
    "ORDER_PAID_AT_ELIGIBILITY",
    "FRESH_SALE_NO_PRIOR_REFUND_OR_CANARY",
  ]);
}

function syntheticContactDigest(aggregate: Aggregate): string {
  const user = aggregate.session.user;
  const shipping = aggregate.order.shipping;
  if (!shipping) throw new EximbayCanaryProducerError("SYNTHETIC_IDENTITY_INVALID");
  return digest([
    "mira-refund-eximbay-canary-synthetic-contact/v1",
    user.id, user.email, user.name,
    shipping.recipientName, shipping.phone, shipping.country, shipping.postalCode,
    shipping.administrativeArea, shipping.city, shipping.addressLine1,
    shipping.addressLine2, shipping.memo,
  ]);
}

type SyntheticShipping = Readonly<{
  recipientName: string;
  phone: string;
  country: ShippingCountry;
  postalCode: string;
  administrativeArea: string;
  city: string;
  addressLine1: string;
  addressLine2: string | null;
  memo: string | null;
}>;

function exactSyntheticShipping(shipping: SyntheticShipping): boolean {
  return [
    shipping.recipientName === EXIMBAY_CANARY_EXACT_SYNTHETIC_NAME,
    shipping.phone === EXIMBAY_CANARY_EXACT_SYNTHETIC_PHONE,
    shipping.country === ShippingCountry.US,
    shipping.postalCode === EXIMBAY_CANARY_EXACT_SYNTHETIC_POSTAL_CODE,
    shipping.administrativeArea === EXIMBAY_CANARY_EXACT_SYNTHETIC_AREA,
    shipping.city === EXIMBAY_CANARY_EXACT_SYNTHETIC_CITY,
    shipping.addressLine1 === EXIMBAY_CANARY_EXACT_SYNTHETIC_ADDRESS,
    shipping.addressLine2 === null,
    shipping.memo === null,
  ].every(Boolean);
}

function sameShipping(
  left: NonNullable<Aggregate["session"]["shipping"]>,
  right: NonNullable<Aggregate["order"]["shipping"]>,
): boolean {
  return [
    left.recipientName === right.recipientName,
    left.phone === right.phone,
    left.country === right.country,
    left.postalCode === right.postalCode,
    left.administrativeArea === right.administrativeArea,
    left.city === right.city,
    left.addressLine1 === right.addressLine1,
    left.addressLine2 === right.addressLine2,
    left.memo === right.memo,
  ].every(Boolean);
}

async function lockAggregate(tx: Prisma.TransactionClient, paymentId: string): Promise<void> {
  const order = await tx.order.findUnique({ where: { paymentId }, select: { id: true } });
  if (!order) throw new EximbayCanaryProducerError("PAYMENT_NOT_ELIGIBLE");
  const lockedOrder = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "id" = ${order.id} FOR UPDATE
  `);
  const lockedPayment = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE
  `);
  if (lockedOrder.length !== 1 || lockedPayment.length !== 1) {
    throw new EximbayCanaryProducerError("PAYMENT_NOT_ELIGIBLE");
  }
}

async function lockCommand(tx: Prisma.TransactionClient, commandId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "RefundExecutionCommand" WHERE "id" = ${commandId} FOR UPDATE
  `);
  return rows.length === 1;
}

async function captureDatabaseTime(tx: Prisma.TransactionClient): Promise<Date> {
  const rows = await tx.$queryRaw<{ capturedAt: Date }[]>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `);
  const capturedAt = rows[0]?.capturedAt;
  if (rows.length !== 1 || !(capturedAt instanceof Date)) {
    throw new EximbayCanaryProducerError("DATABASE_TIME_UNAVAILABLE");
  }
  return capturedAt;
}

function loadPaymentAggregate(reader: Prisma.TransactionClient | PrismaClient, paymentId: string) {
  return reader.payment.findUnique({
    where: { id: paymentId },
    include: {
      session: { include: { user: true, shipping: true } },
      order: {
        include: {
          shipping: true,
          customerRefundIntakes: { select: { id: true } },
          refundAttempts: {
            orderBy: { createdAt: "asc" },
            include: {
              transitions: { orderBy: { createdAt: "asc" } },
              executionCommand: {
                include: {
                  events: true,
                  dispatchAttempts: true,
                  evidence: true,
                  eximbaySandboxCanaryApproval: true,
                },
              },
              providerOperationBinding: {
                include: { eligibilityProof: true, eximbayPreflightObservations: true },
              },
            },
          },
        },
      },
    },
  });
}

function hasOrder(value: Awaited<ReturnType<typeof loadPaymentAggregate>>): value is Aggregate {
  return value !== null && value.order !== null;
}

function requireLoadedAggregate(
  value: Awaited<ReturnType<typeof loadPaymentAggregate>>,
  errorCode: "PAYMENT_NOT_ELIGIBLE" | "TARGET_POSTCONDITION_FAILED",
): Aggregate {
  if (!hasOrder(value)) throw new EximbayCanaryProducerError(errorCode);
  return value;
}

function nonempty(value: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function digest(values: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify(values), "utf8").digest("hex");
}
