import {
  PaymentMode,
  PaymentProvider,
  RefundExecutionCommandEventType,
  RefundExecutionDispatchAttemptState,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
  type RefundExecutionDispatchAttempt,
} from "@prisma/client";
import {
  hasConsistentRefundAttemptLedgerIdentity,
  sumSucceededRefundAmount,
} from "../../invariants";
import type { EximbayCancelWireAuthority } from "./cancel-wire";
import { fingerprintEximbayCancelWire } from "./cancel-wire";
import type { EximbayRefundLookupAuthority } from "./refund-lookup";
import {
  EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
  EXIMBAY_REFUND_INQUIRY_CONTRACT_VERSION,
  EXIMBAY_REFUND_INQUIRY_PARSER_VERSION,
  EXIMBAY_REFUND_OPERATION_FAMILY_VERSION,
  classifyEximbayRefundType,
  deriveEximbayRefundOperationFamily,
  fingerprintEximbayRefundObservation,
  normalizeEximbayRefundPreflightFacts,
  type EximbayRefundPreflightConfig,
} from "./preflight-contract";
import type { LockedEximbayLifecycleState } from "./lifecycle-state";
import { deriveEximbayMerchantRefundId } from "./refund-id";

export type EximbayDispatchAuthority = Readonly<{
  cancel: EximbayCancelWireAuthority;
  lookup: EximbayRefundLookupAuthority;
  dispatch: RefundExecutionDispatchAttempt;
}>;

export function deriveEximbayDispatchAuthority(
  state: LockedEximbayLifecycleState,
  config: EximbayRefundPreflightConfig,
  ordinal: number,
): EximbayDispatchAuthority | null {
  if (!baseContextCoherent(state, config)) return null;
  const dispatch = selectedDispatch(state, ordinal);
  if (!dispatch) return null;
  const observation = preflightObservation(state);
  if (!observation) return null;
  const facts = normalizeEximbayRefundPreflightFacts(observation);
  if (!facts) return null;
  const classification = refundClassification(state, facts);
  if (!classification.ok) return null;
  const cancel = Object.freeze({
    mid: config.mid,
    merchantAccountBindingId: config.merchantAccountBindingId,
    credentialGenerationBindingId: config.credentialGenerationBindingId,
    originalTransactionId: facts.providerTransactionId,
    providerOrderId: facts.providerOrderId,
    currency: facts.currency,
    originalAmount: facts.originalAmount,
    refundableBalance: facts.refundableBalance,
    requestedAmount: state.context.target.amount,
    refundType: classification.refundType,
    providerOperationKey: dispatch.providerOperationKey,
    language: facts.currency === "JPY" ? "JP" as const : "EN" as const,
  });
  if (dispatch.requestFingerprint !== fingerprintEximbayCancelWire(cancel)) return null;
  return Object.freeze({
    cancel,
    lookup: Object.freeze({
      targetDispatchAttemptId: dispatch.id,
      mid: cancel.mid,
      providerOrderId: cancel.providerOrderId,
      originalTransactionId: cancel.originalTransactionId,
      currency: cancel.currency,
      originalAmount: cancel.originalAmount,
      preContactRefundableBalance: cancel.refundableBalance,
      expectedRefundAmount: cancel.requestedAmount,
      expectedRefundType: cancel.refundType,
      providerOperationKey: cancel.providerOperationKey,
      language: cancel.language,
    }),
    dispatch,
  });
}

function merchantRefundIdentityMatches(
  state: LockedEximbayLifecycleState,
  dispatch: RefundExecutionDispatchAttempt,
): boolean {
  if (!state.binding || (dispatch.ordinal !== 1 && dispatch.ordinal !== 2)) return false;
  try {
    return dispatch.providerOperationKey === deriveEximbayMerchantRefundId(
      state.binding.operationFamilyFingerprint,
      dispatch.ordinal,
    );
  } catch {
    return false;
  }
}

function selectedDispatch(
  state: LockedEximbayLifecycleState,
  ordinal: number,
): RefundExecutionDispatchAttempt | null {
  const dispatches = state.history.dispatchAttempts;
  if (!validDispatchSequence(dispatches, ordinal)) return null;
  const dispatch = dispatches[ordinal - 1];
  return dispatch && dispatch.provider === PaymentProvider.EXIMBAY
    && dispatch.mode === PaymentMode.SANDBOX
    && dispatch.commandId === state.context.command.id
    && merchantRefundIdentityMatches(state, dispatch)
    ? dispatch
    : null;
}

function validDispatchSequence(
  dispatches: readonly RefundExecutionDispatchAttempt[],
  ordinal: number,
): boolean {
  return (ordinal === 1 || ordinal === 2)
    && dispatches.length >= ordinal
    && dispatches.every((row, index) => row.ordinal === index + 1);
}

function refundClassification(
  state: LockedEximbayLifecycleState,
  facts: NonNullable<ReturnType<typeof normalizeEximbayRefundPreflightFacts>>,
): ReturnType<typeof classifyEximbayRefundType> {
  try {
    return classifyEximbayRefundType({
      requestedAmount: state.context.target.amount,
      paymentAmount: state.context.aggregate.payment.amount,
      paymentCurrency: state.context.aggregate.payment.currency,
      successfulRefundAmount: sumSucceededRefundAmount(state.context.aggregate.refundAttempts),
      historyCoherent: hasConsistentRefundAttemptLedgerIdentity(
        state.context.aggregate.payment,
        state.context.aggregate.refundAttempts,
      ),
      observation: facts,
    });
  } catch {
    return Object.freeze({ ok: false, code: "REFUND_NOT_LAWFUL" });
  }
}

export function hasExactContactMarker(authority: EximbayDispatchAuthority): boolean {
  return authority.dispatch.state === RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED
    && authority.dispatch.contactMarkedAt !== null;
}

export function hasLawfulEximbayR2Origin(
  state: LockedEximbayLifecycleState,
  authority: EximbayDispatchAuthority,
  config: EximbayRefundPreflightConfig,
): boolean {
  if (authority.dispatch.ordinal === 1) return true;
  const r1 = deriveEximbayDispatchAuthority(state, config, 1);
  if (!r1 || ![
    hasExactContactMarker(r1),
    r1.dispatch.providerOperationKey !== authority.dispatch.providerOperationKey,
  ].every(Boolean)) return false;
  const originEvidence = state.evidence.filter((row) => [
    row.commandId === state.context.command.id,
    row.source === RefundExecutionEvidenceSource.PROVIDER_LOOKUP,
    row.dispatchAttemptId === r1.dispatch.id,
    row.outcome === RefundExecutionEvidenceOutcome.NOT_EXECUTED_RETRYABLE,
    row.application === RefundExecutionEvidenceApplication.PARKED,
    row.authorizingLeaseGeneration === authority.dispatch.leaseGeneration,
    row.observedProviderRefundId === null,
    row.reportedAmount === null,
    row.reportedCurrency === null,
  ].every(Boolean));
  if (originEvidence.length !== 1) return false;
  const originEvents = r2OriginLookupPermitEvents(state, r1.dispatch).filter((event) => (
    event.leaseGeneration === authority.dispatch.leaseGeneration
  ));
  if (originEvents.length !== 1) return false;
  const originEvent = originEvents[0];
  const lookupOrdinal = r2OriginLookupPermitEvents(state, r1.dispatch).findIndex((event) => (
    event.id === originEvent.id
  )) + 1;
  return [
    lookupOrdinal >= 1,
    originEvidence[0].sourceDedupKey
      === `refund-provider-lookup:${state.context.command.id}:${r1.dispatch.id}:${lookupOrdinal}`,
    originEvent.occurredAt.getTime() >= r1.dispatch.contactMarkedAt!.getTime(),
    originEvidence[0].observedAt.getTime() >= originEvent.occurredAt.getTime(),
  ].every(Boolean);
}

function r2OriginLookupPermitEvents(
  state: LockedEximbayLifecycleState,
  dispatch: RefundExecutionDispatchAttempt,
) {
  return state.history.events.filter((event) => (
    event.eventType === RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED
      && event.dispatchAttempt === dispatch.ordinal
      && event.leaseGeneration > dispatch.leaseGeneration
  ));
}

function baseContextCoherent(
  state: LockedEximbayLifecycleState,
  config: EximbayRefundPreflightConfig,
): boolean {
  const { aggregate, target, command } = state.context;
  const payment = aggregate.payment;
  const binding = state.binding;
  if (!binding || state.observations.length !== 1 || !payment.providerPaymentKey
    || !payment.providerOrderId) return false;
  let family: ReturnType<typeof deriveEximbayRefundOperationFamily>;
  try {
    family = deriveEximbayRefundOperationFamily(
      target.idempotencyKey,
      payment.providerPaymentKey,
      target.amount,
      target.currency,
    );
  } catch {
    return false;
  }
  return [
    aggregate.status === "REFUND_PENDING",
    target.status === "PROCESSING",
    target.providerRefundId === null,
    target.paymentId === payment.id,
    target.provider === PaymentProvider.EXIMBAY,
    target.mode === PaymentMode.SANDBOX,
    payment.provider === PaymentProvider.EXIMBAY,
    payment.mode === PaymentMode.SANDBOX,
    payment.amount === aggregate.totalAmount,
    payment.currency === aggregate.currency,
    command.refundAttemptId === target.id,
    binding.refundAttemptId === target.id,
    binding.provider === PaymentProvider.EXIMBAY,
    binding.mode === PaymentMode.SANDBOX,
    binding.providerOperationFamilyKey === family.key,
    binding.operationFamilyKeyAlgorithmVersion === EXIMBAY_REFUND_OPERATION_FAMILY_VERSION,
    binding.wireContractVersion === EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
    binding.operationFamilyFingerprint === family.fingerprint,
    binding.merchantAccountBindingId === config.merchantAccountBindingId,
    binding.credentialGenerationBindingId === config.credentialGenerationBindingId,
    binding.eligibilityProof === null,
  ].every(Boolean);
}

function preflightObservation(state: LockedEximbayLifecycleState) {
  const binding = state.binding;
  const firstDispatch = state.history.dispatchAttempts[0];
  const observation = state.observations[0];
  if (!binding || !firstDispatch || !observation
    || !observationMetadataMatches(observation, binding.id, firstDispatch.leaseGeneration)) {
    return null;
  }
  const facts = normalizeEximbayRefundPreflightFacts(observation);
  if (!facts) return null;
  const expected = expectedObservationFingerprint(state, facts, observation.observedAt);
  return observation.observationFingerprint === expected ? observation : null;
}

function observationMetadataMatches(
  observation: LockedEximbayLifecycleState["observations"][number],
  bindingId: string,
  leaseGeneration: number,
): boolean {
  return observation.bindingId === bindingId
    && observation.observingLeaseGeneration === leaseGeneration
    && observation.inquiryContractVersion === EXIMBAY_REFUND_INQUIRY_CONTRACT_VERSION
    && observation.parserVersion === EXIMBAY_REFUND_INQUIRY_PARSER_VERSION;
}

function expectedObservationFingerprint(
  state: LockedEximbayLifecycleState,
  facts: NonNullable<ReturnType<typeof normalizeEximbayRefundPreflightFacts>>,
  observedAt: Date,
): string {
  const binding = state.binding;
  if (!binding) return "";
  return fingerprintEximbayRefundObservation({
    refundAttemptId: state.context.target.id,
    commandId: state.context.command.id,
    bindingId: binding.id,
    observingLeaseGeneration: state.history.dispatchAttempts[0].leaseGeneration,
    provider: PaymentProvider.EXIMBAY,
    mode: PaymentMode.SANDBOX,
    merchantAccountBindingId: binding.merchantAccountBindingId,
    credentialGenerationBindingId: binding.credentialGenerationBindingId,
    wireContractVersion: EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
    facts,
    observedAt,
  });
}
