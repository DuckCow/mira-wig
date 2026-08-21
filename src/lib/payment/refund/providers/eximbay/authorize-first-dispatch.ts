import { createHash } from "crypto";
import {
  PaymentMode,
  PaymentProvider,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  type PrismaClient,
} from "@prisma/client";
import {
  currentDispatchAuthorityFailure,
  isDispatchAuthorizationLedgerCoherent,
  normalizeAuthorizeRefundExecutionDispatchInput,
  type NormalizedAuthorizeRefundExecutionDispatchInput,
} from "../../dispatch-authorization-contract";
import {
  hasConsistentRefundAttemptLedgerIdentity,
  sumSucceededRefundAmount,
} from "../../invariants";
import { fingerprintEximbayCancelWire } from "./cancel-wire";
import {
  boundedEximbayRefundIdentifier,
  classifyEximbayRefundType,
  createEximbayRefundPreflightConfig,
  deriveEximbayRefundOperationFamily,
  EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
  EXIMBAY_REFUND_INQUIRY_CONTRACT_VERSION,
  EXIMBAY_REFUND_INQUIRY_PARSER_VERSION,
  EXIMBAY_REFUND_OPERATION_FAMILY_VERSION,
  fingerprintEximbayRefundObservation,
  normalizeEximbayRefundPreflightFacts,
  type EximbayRefundPreflightConfig,
  type EximbayRefundPreflightConfigInput,
  type EximbayRefundPreflightFacts,
  type EximbayRefundType,
} from "./preflight-contract";
import { deriveEximbayMerchantRefundId } from "./refund-id";
import {
  createEximbayRefundRetrievePlan,
  executeEximbayRefundRetrieve,
  type EximbayRefundRetrieveTransport,
} from "./preflight-retrieve";
import {
  discoverEximbayPreflightOwnership,
  isEximbayRefundContext,
  lockAndLoadEximbayPreflightState,
  type EximbayPreflightOwnership,
  type EximbayPreflightTx,
  type LockedEximbayPreflightState,
} from "./preflight-state";

export type AuthorizeEximbayFirstRefundDispatchInput = Readonly<{
  commandId: string;
  leaseGeneration: number;
  leaseToken: string;
}>;

export type EximbayFirstRefundAuthorizationFailureCode =
  | "INVALID_INPUT"
  | "COMMAND_NOT_FOUND_OR_INELIGIBLE"
  | "LEASE_FENCE_MISMATCH"
  | "LEASE_EXPIRED"
  | "CONTACT_RECOVERY_REQUIRED"
  | "BINDING_MISMATCH"
  | "REFUND_LEDGER_INCONSISTENT"
  | "PREFLIGHT_NOT_ADMITTED"
  | "PREFLIGHT_CONFLICT"
  | "REFUND_NOT_LAWFUL"
  | "PERSISTENCE_CONFLICT";

export type AuthorizeEximbayFirstRefundDispatchResult =
  | Readonly<{
      ok: true;
      replayed: boolean;
      authorization: Readonly<{
        commandId: string;
        dispatchAttempt: 1;
        leaseGeneration: number;
        preflightObservationId: string;
        refundType: EximbayRefundType;
        authorizedAt: string;
      }>;
    }>
  | Readonly<{
      ok: false;
      code: EximbayFirstRefundAuthorizationFailureCode;
      message: string;
    }>;

export type EximbayFirstRefundAuthorizerDependencies = Readonly<{
  config: EximbayRefundPreflightConfigInput;
  retrieve: EximbayRefundRetrieveTransport;
}>;

type PhaseOne =
  | Readonly<{ kind: "result"; result: AuthorizeEximbayFirstRefundDispatchResult }>
  | Readonly<{ kind: "lookup"; authority: PreflightAuthority }>
  | Readonly<{ kind: "ready"; authority: PreflightAuthority }>;

type PreflightAuthority = Readonly<{
  ownership: EximbayPreflightOwnership;
  commandId: string;
  bindingId: string;
  refundAttemptId: string;
  paymentId: string;
  providerOrderId: string;
  providerTransactionId: string;
  currency: "USD" | "JPY";
  originalAmount: number;
}>;

export function createEximbayFirstRefundDispatchAuthorizer(
  dependencies: EximbayFirstRefundAuthorizerDependencies,
) {
  const config = createEximbayRefundPreflightConfig(dependencies.config);
  return async (
    client: PrismaClient,
    input: AuthorizeEximbayFirstRefundDispatchInput,
  ): Promise<AuthorizeEximbayFirstRefundDispatchResult> => {
    const normalized = normalizeAuthorizeRefundExecutionDispatchInput(input);
    if (!normalized.ok) return failure("INVALID_INPUT", "Eximbay refund authorization input is invalid.");
    const phaseOne = await client.$transaction((tx) => classifyPhaseOne(
      tx, normalized.input, config,
    ));
    if (phaseOne.kind === "result") return phaseOne.result;
    if (phaseOne.kind === "ready") {
      return authorizeR1(client, phaseOne.authority, normalized.input, config);
    }
    const plan = createEximbayRefundRetrievePlan(config, {
      providerOrderId: phaseOne.authority.providerOrderId,
      providerTransactionId: phaseOne.authority.providerTransactionId,
      currency: phaseOne.authority.currency,
      originalAmount: phaseOne.authority.originalAmount,
    });
    const retrieved = await executeEximbayRefundRetrieve(plan, dependencies.retrieve);
    if (retrieved.kind !== "admitted") {
      return failure("PREFLIGHT_NOT_ADMITTED", "Eximbay refund preflight was not admitted.");
    }
    const admitted = await client.$transaction((tx) => admitObservation(
      tx, phaseOne.authority, normalized.input, config, retrieved.facts,
    ));
    if (!admitted.ok) return admitted;
    return authorizeR1(client, phaseOne.authority, normalized.input, config);
  };
}

async function classifyPhaseOne(
  tx: EximbayPreflightTx,
  input: NormalizedAuthorizeRefundExecutionDispatchInput,
  config: EximbayRefundPreflightConfig,
): Promise<PhaseOne> {
  const ownership = await discoverEximbayPreflightOwnership(tx, input.commandId);
  if (!ownership) return result(commandMissing());
  const state = await lockAndLoadEximbayPreflightState(
    tx, ownership, input.commandId, input.leaseGeneration,
  );
  if (!state) return result(commandMissing());
  return classifyLockedPhaseOne(tx, state, ownership, input, config);
}

async function classifyLockedPhaseOne(
  tx: EximbayPreflightTx,
  state: LockedEximbayPreflightState,
  ownership: EximbayPreflightOwnership,
  input: NormalizedAuthorizeRefundExecutionDispatchInput,
  config: EximbayRefundPreflightConfig,
): Promise<PhaseOne> {
  const invalid = classifyCurrentState(state, input);
  if (invalid) return result(invalid);
  if (state.structure.kind === "contacted") return result(contactRecovery());
  let binding = state.binding;
  if (!binding) binding = await createBinding(tx, state, config);
  if (!bindingMatches(state, binding, config)) return result(bindingMismatch());
  const authority = preflightAuthority(state, ownership, binding.id);
  if (!authority) return result(ledgerFailure());
  if (state.structure.kind === "replay") {
    return result(replayAuthorization(state, authority, input, config));
  }
  return state.observation
    ? Object.freeze({ kind: "ready", authority })
    : Object.freeze({ kind: "lookup", authority });
}

async function admitObservation(
  tx: EximbayPreflightTx,
  authority: PreflightAuthority,
  input: NormalizedAuthorizeRefundExecutionDispatchInput,
  config: EximbayRefundPreflightConfig,
  facts: EximbayRefundPreflightFacts,
): Promise<AuthorizeEximbayFirstRefundDispatchResult | Readonly<{ ok: true }>> {
  const state = await lockAndLoadEximbayPreflightState(
    tx, authority.ownership, authority.commandId, input.leaseGeneration,
  );
  if (!state) return commandMissing();
  const invalid = validateFreshState(state, authority, input, config);
  if (invalid) return invalid;
  if (!sameRetrievedAuthority(facts, authority, config)) return preflightConflict();
  if (state.observation) {
    return observationMatches(state, authority, config, facts)
      ? Object.freeze({ ok: true })
      : preflightConflict();
  }
  const fingerprint = observationFingerprint(state, authority, config, facts, state.capturedAt);
  await tx.refundExecutionEximbayPreflightObservation.create({
    data: {
      bindingId: authority.bindingId,
      observingLeaseGeneration: input.leaseGeneration,
      ...facts,
      observedAt: state.capturedAt,
      inquiryContractVersion: EXIMBAY_REFUND_INQUIRY_CONTRACT_VERSION,
      parserVersion: EXIMBAY_REFUND_INQUIRY_PARSER_VERSION,
      observationFingerprint: fingerprint,
    },
  });
  return Object.freeze({ ok: true });
}

async function authorizeR1(
  client: PrismaClient,
  authority: PreflightAuthority,
  input: NormalizedAuthorizeRefundExecutionDispatchInput,
  config: EximbayRefundPreflightConfig,
): Promise<AuthorizeEximbayFirstRefundDispatchResult> {
  try {
    return await client.$transaction((tx) => authorizeR1Transaction(
      tx, authority, input, config,
    ));
  } catch {
    return failure("PERSISTENCE_CONFLICT", "Eximbay R1 authorization persistence conflicted.");
  }
}

async function authorizeR1Transaction(
  tx: EximbayPreflightTx,
  authority: PreflightAuthority,
  input: NormalizedAuthorizeRefundExecutionDispatchInput,
  config: EximbayRefundPreflightConfig,
): Promise<AuthorizeEximbayFirstRefundDispatchResult> {
  const state = await lockAndLoadEximbayPreflightState(
    tx, authority.ownership, authority.commandId, input.leaseGeneration,
  );
  if (!state) return commandMissing();
  const invalid = validateAuthorityState(state, authority, input, config);
  if (invalid) return invalid;
  if (state.structure.kind === "replay") {
    return replayAuthorization(state, authority, input, config);
  }
  return persistFreshR1(tx, state, authority, input, config);
}

async function persistFreshR1(
  tx: EximbayPreflightTx,
  state: LockedEximbayPreflightState,
  authority: PreflightAuthority,
  input: NormalizedAuthorizeRefundExecutionDispatchInput,
  config: EximbayRefundPreflightConfig,
): Promise<AuthorizeEximbayFirstRefundDispatchResult> {
  if (state.structure.kind !== "new" || !state.observation
    || !observationMatches(state, authority, config)) return ledgerFailure();
  const classification = classifyFromState(state, state.observation);
  if (!classification.ok) return refundNotLawful();
  const physicalKey = derivePhysicalKey(state, 1);
  if (!physicalKey) return ledgerFailure();
  const dispatch = await tx.refundExecutionDispatchAttempt.create({
    data: {
      commandId: authority.commandId,
      ordinal: 1,
      leaseGeneration: input.leaseGeneration,
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX,
      providerOperationKey: physicalKey,
      requestFingerprint: physicalRequestFingerprint(state, physicalKey),
      state: RefundExecutionDispatchAttemptState.AUTHORIZED,
      authorizedAt: state.capturedAt,
      contactMarkedAt: null,
    },
  });
  const updated = await updateCommandOrdinal(tx, state, input);
  if (updated !== 1) throw new Error("EXIMBAY_R1_PERSISTENCE_CONFLICT");
  return success(
    authority.commandId,
    input.leaseGeneration,
    state.observation.id,
    classification.refundType,
    dispatch.authorizedAt,
    false,
  );
}

function classifyCurrentState(
  state: LockedEximbayPreflightState,
  input: NormalizedAuthorizeRefundExecutionDispatchInput,
): AuthorizeEximbayFirstRefundDispatchResult | null {
  const authorityFailure = currentDispatchAuthorityFailure(state.context.command, input, state.capturedAt);
  if (authorityFailure === "LEASE_FENCE_MISMATCH") return fenceFailure();
  if (authorityFailure === "LEASE_EXPIRED") return leaseExpired();
  if (!isEximbayRefundContext(state.context)
    || !isDispatchAuthorizationLedgerCoherent(state.context, state.history, state.structure)) {
    return ledgerFailure();
  }
  return null;
}

function validateFreshState(
  state: LockedEximbayPreflightState,
  authority: PreflightAuthority,
  input: NormalizedAuthorizeRefundExecutionDispatchInput,
  config: EximbayRefundPreflightConfig,
): AuthorizeEximbayFirstRefundDispatchResult | null {
  const invalid = validateAuthorityState(state, authority, input, config);
  if (invalid) return invalid;
  if (state.structure.kind === "new") return null;
  return state.structure.kind === "replay" && state.observation
    ? null
    : ledgerFailure();
}

function validateAuthorityState(
  state: LockedEximbayPreflightState,
  authority: PreflightAuthority,
  input: NormalizedAuthorizeRefundExecutionDispatchInput,
  config: EximbayRefundPreflightConfig,
): AuthorizeEximbayFirstRefundDispatchResult | null {
  const invalid = classifyCurrentState(state, input);
  if (invalid) return invalid;
  if (!state.binding || state.binding.id !== authority.bindingId
    || !bindingMatches(state, state.binding, config)) return bindingMismatch();
  const current = preflightAuthority(state, authority.ownership, state.binding.id);
  return current && sameAuthority(current, authority) ? null : ledgerFailure();
}

function createBinding(
  tx: EximbayPreflightTx,
  state: LockedEximbayPreflightState,
  config: EximbayRefundPreflightConfig,
) {
  const family = currentOperationFamily(state);
  if (!family) throw new Error("INVALID_EXIMBAY_OPERATION_FAMILY");
  return tx.refundExecutionProviderOperationBinding.create({
    data: {
      refundAttemptId: state.context.target.id,
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX,
      providerOperationFamilyKey: family.key,
      operationFamilyKeyAlgorithmVersion: EXIMBAY_REFUND_OPERATION_FAMILY_VERSION,
      wireContractVersion: EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
      operationFamilyFingerprint: family.fingerprint,
      merchantAccountBindingId: config.merchantAccountBindingId,
      credentialGenerationBindingId: config.credentialGenerationBindingId,
    },
    include: { eligibilityProof: true },
  });
}

function bindingMatches(
  state: LockedEximbayPreflightState,
  binding: NonNullable<LockedEximbayPreflightState["binding"]>,
  config: EximbayRefundPreflightConfig,
): boolean {
  const family = currentOperationFamily(state);
  if (!family) return false;
  return [
    binding.refundAttemptId === state.context.target.id,
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

function currentOperationFamily(state: LockedEximbayPreflightState) {
  const paymentKey = boundedEximbayRefundIdentifier(
    state.context.aggregate.payment.providerPaymentKey,
  );
  if (!paymentKey) return null;
  try {
    return deriveEximbayRefundOperationFamily(
      state.context.target.idempotencyKey,
      paymentKey,
      state.context.target.amount,
      state.context.target.currency,
    );
  } catch {
    return null;
  }
}

function preflightAuthority(
  state: LockedEximbayPreflightState,
  ownership: EximbayPreflightOwnership,
  bindingId: string,
): PreflightAuthority | null {
  const payment = state.context.aggregate.payment;
  const providerOrderId = boundedEximbayRefundIdentifier(payment.providerOrderId);
  const providerTransactionId = boundedEximbayRefundIdentifier(payment.providerPaymentKey);
  if (!providerOrderId || !providerTransactionId
    || (payment.currency !== "USD" && payment.currency !== "JPY")) return null;
  return Object.freeze({
    ownership,
    commandId: state.context.command.id,
    bindingId,
    refundAttemptId: state.context.target.id,
    paymentId: payment.id,
    providerOrderId,
    providerTransactionId,
    currency: payment.currency,
    originalAmount: payment.amount,
  });
}

function sameRetrievedAuthority(
  facts: EximbayRefundPreflightFacts,
  authority: PreflightAuthority,
  config: EximbayRefundPreflightConfig,
): boolean {
  const normalized = normalizeEximbayRefundPreflightFacts(facts);
  return normalized !== null
    && normalized.mid === config.mid
    && normalized.providerOrderId === authority.providerOrderId
    && normalized.providerTransactionId === authority.providerTransactionId
    && normalized.currency === authority.currency
    && normalized.originalAmount === authority.originalAmount;
}

function observationMatches(
  state: LockedEximbayPreflightState,
  authority: PreflightAuthority,
  config: EximbayRefundPreflightConfig,
  expectedFacts?: EximbayRefundPreflightFacts,
): boolean {
  const observation = state.observation;
  if (!observation) return false;
  const facts = normalizeEximbayRefundPreflightFacts(observation);
  if (!facts || !sameRetrievedAuthority(facts, authority, config)) return false;
  if (expectedFacts && !sameFacts(facts, expectedFacts)) return false;
  return [
    observation.bindingId === authority.bindingId,
    observation.observingLeaseGeneration === state.context.command.leaseGeneration,
    observation.inquiryContractVersion === EXIMBAY_REFUND_INQUIRY_CONTRACT_VERSION,
    observation.parserVersion === EXIMBAY_REFUND_INQUIRY_PARSER_VERSION,
    observation.observedAt.getTime() <= state.capturedAt.getTime(),
    observation.observationFingerprint === observationFingerprint(
      state, authority, config, facts, observation.observedAt,
    ),
  ].every(Boolean);
}

function observationFingerprint(
  state: LockedEximbayPreflightState,
  authority: PreflightAuthority,
  config: EximbayRefundPreflightConfig,
  facts: EximbayRefundPreflightFacts,
  observedAt: Date,
): string {
  return fingerprintEximbayRefundObservation({
    refundAttemptId: authority.refundAttemptId,
    commandId: authority.commandId,
    bindingId: authority.bindingId,
    observingLeaseGeneration: state.context.command.leaseGeneration,
    provider: PaymentProvider.EXIMBAY,
    mode: PaymentMode.SANDBOX,
    merchantAccountBindingId: config.merchantAccountBindingId,
    credentialGenerationBindingId: config.credentialGenerationBindingId,
    wireContractVersion: EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
    facts,
    observedAt,
  });
}

function classifyFromState(
  state: LockedEximbayPreflightState,
  observation: NonNullable<LockedEximbayPreflightState["observation"]>,
) {
  const attempts = state.context.aggregate.refundAttempts;
  const facts = normalizeEximbayRefundPreflightFacts(observation);
  if (!facts) return Object.freeze({ ok: false, code: "REFUND_NOT_LAWFUL" } as const);
  const identityCoherent = hasConsistentRefundAttemptLedgerIdentity(
    state.context.aggregate.payment,
    attempts,
  );
  try {
    const successfulRefundAmount = sumSucceededRefundAmount(attempts);
    return classifyEximbayRefundType({
      requestedAmount: state.context.target.amount,
      paymentAmount: state.context.aggregate.payment.amount,
      paymentCurrency: state.context.aggregate.payment.currency,
      successfulRefundAmount,
      historyCoherent: identityCoherent && attempts.every((attempt) => (
        Number.isInteger(attempt.amount) && attempt.amount >= 1
      )),
      observation: facts,
    });
  } catch {
    return Object.freeze({ ok: false, code: "REFUND_NOT_LAWFUL" } as const);
  }
}

function physicalRequestFingerprint(state: LockedEximbayPreflightState, physicalKey: string): string {
  if (!state.binding || !state.observation) throw new Error("INVALID_EXIMBAY_CANCEL_AUTHORITY");
  const observation = normalizeEximbayRefundPreflightFacts(state.observation);
  const classification = observation ? classifyFromState(state, state.observation) : null;
  if (!observation || !classification?.ok) throw new Error("INVALID_EXIMBAY_CANCEL_AUTHORITY");
  return fingerprintEximbayCancelWire({
    mid: observation.mid,
    merchantAccountBindingId: state.binding.merchantAccountBindingId,
    credentialGenerationBindingId: state.binding.credentialGenerationBindingId,
    originalTransactionId: observation.providerTransactionId,
    providerOrderId: observation.providerOrderId,
    currency: observation.currency,
    originalAmount: observation.originalAmount,
    refundableBalance: observation.refundableBalance,
    requestedAmount: state.context.target.amount,
    refundType: classification.refundType,
    providerOperationKey: physicalKey,
    language: observation.currency === "JPY" ? "JP" : "EN",
  });
}

function replayAuthorization(
  state: LockedEximbayPreflightState,
  authority: PreflightAuthority,
  input: NormalizedAuthorizeRefundExecutionDispatchInput,
  config: EximbayRefundPreflightConfig,
): AuthorizeEximbayFirstRefundDispatchResult {
  if (state.structure.kind !== "replay" || !state.observation
    || !observationMatches(state, authority, config)) return ledgerFailure();
  const classification = classifyFromState(state, state.observation);
  if (!classification.ok) return refundNotLawful();
  const physicalKey = derivePhysicalKey(state, 1);
  if (!physicalKey) return ledgerFailure();
  const dispatch = state.structure.attempt;
  if (![
    dispatch.commandId === authority.commandId,
    dispatch.ordinal === 1,
    dispatch.leaseGeneration === input.leaseGeneration,
    dispatch.provider === PaymentProvider.EXIMBAY,
    dispatch.mode === PaymentMode.SANDBOX,
    dispatch.providerOperationKey === physicalKey,
    dispatch.requestFingerprint === physicalRequestFingerprint(state, physicalKey),
    dispatch.state === RefundExecutionDispatchAttemptState.AUTHORIZED,
    dispatch.contactMarkedAt === null,
    dispatch.authorizedAt.getTime() >= state.observation.observedAt.getTime(),
  ].every(Boolean)) return ledgerFailure();
  return success(
    authority.commandId,
    input.leaseGeneration,
    state.observation.id,
    classification.refundType,
    dispatch.authorizedAt,
    true,
  );
}

function derivePhysicalKey(
  state: LockedEximbayPreflightState,
  ordinal: 1,
): string | null {
  if (!state.binding) return null;
  try {
    return deriveEximbayMerchantRefundId(state.binding.operationFamilyFingerprint, ordinal);
  } catch {
    return null;
  }
}

function updateCommandOrdinal(
  tx: EximbayPreflightTx,
  state: LockedEximbayPreflightState,
  input: NormalizedAuthorizeRefundExecutionDispatchInput,
): Promise<number> {
  const leaseTokenHash = createHash("sha256").update(input.leaseToken, "utf8").digest("hex");
  return tx.refundExecutionCommand.updateMany({
    where: {
      id: state.context.command.id,
      refundAttemptId: state.context.target.id,
      status: RefundExecutionCommandStatus.LEASED,
      leaseGeneration: input.leaseGeneration,
      leaseTokenHash,
      leaseUntil: { gt: state.capturedAt },
      dispatchAttempt: 0,
    },
    data: { dispatchAttempt: 1 },
  }).then((updated) => updated.count);
}

function sameAuthority(left: PreflightAuthority, right: PreflightAuthority): boolean {
  return [
    left.commandId === right.commandId,
    left.bindingId === right.bindingId,
    left.refundAttemptId === right.refundAttemptId,
    left.paymentId === right.paymentId,
    left.providerOrderId === right.providerOrderId,
    left.providerTransactionId === right.providerTransactionId,
    left.currency === right.currency,
    left.originalAmount === right.originalAmount,
    left.ownership.orderId === right.ownership.orderId,
  ].every(Boolean);
}

function sameFacts(left: EximbayRefundPreflightFacts, right: EximbayRefundPreflightFacts): boolean {
  return left.mid === right.mid
    && left.providerOrderId === right.providerOrderId
    && left.providerTransactionId === right.providerTransactionId
    && left.providerStatus === right.providerStatus
    && left.currency === right.currency
    && left.originalAmount === right.originalAmount
    && left.refundableBalance === right.refundableBalance;
}

function success(
  commandId: string,
  leaseGeneration: number,
  preflightObservationId: string,
  refundType: EximbayRefundType,
  authorizedAt: Date,
  replayed: boolean,
): AuthorizeEximbayFirstRefundDispatchResult {
  return Object.freeze({
    ok: true,
    replayed,
    authorization: Object.freeze({
      commandId,
      dispatchAttempt: 1,
      leaseGeneration,
      preflightObservationId,
      refundType,
      authorizedAt: authorizedAt.toISOString(),
    }),
  });
}

function result(value: AuthorizeEximbayFirstRefundDispatchResult): PhaseOne {
  return Object.freeze({ kind: "result", result: value });
}

function failure(
  code: EximbayFirstRefundAuthorizationFailureCode,
  message: string,
): AuthorizeEximbayFirstRefundDispatchResult {
  return Object.freeze({ ok: false, code, message });
}

const commandMissing = () => failure("COMMAND_NOT_FOUND_OR_INELIGIBLE", "Refund execution command is not eligible.");
const fenceFailure = () => failure("LEASE_FENCE_MISMATCH", "Refund execution lease fence does not match.");
const leaseExpired = () => failure("LEASE_EXPIRED", "Refund execution lease has expired.");
const contactRecovery = () => failure("CONTACT_RECOVERY_REQUIRED", "Eximbay refund contact state requires recovery.");
const bindingMismatch = () => failure("BINDING_MISMATCH", "Eximbay account or credential binding does not match.");
const ledgerFailure = () => failure("REFUND_LEDGER_INCONSISTENT", "Refund execution aggregate is inconsistent.");
const preflightConflict = () => failure("PREFLIGHT_CONFLICT", "Eximbay preflight observation conflicts with durable state.");
const refundNotLawful = () => failure("REFUND_NOT_LAWFUL", "Eximbay refund amount is not lawful under the admitted observation.");
