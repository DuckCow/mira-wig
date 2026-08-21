import { createHash, randomBytes } from "node:crypto";
import {
  OrderStatus,
  RefundAttemptStatus,
  RefundExecutionCommandEventType,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { isRecord } from "@/lib/payment/providers/eximbay/validation";
import { REFUND_EXECUTION_LEASE_DURATION_MS } from "../../acquire-lease";
import { buildRefundExecutionApplyOperationKey } from "../../execution-result-contract";
import {
  persistResolution,
  ResolutionRollbackError,
} from "../../execution-result-persistence";
import {
  buildResolutionPlan,
  hasRefundProviderIdentityConflict,
  type ResolutionPlan,
} from "../../execution-result-plan";
import {
  createEximbayRefundPreflightConfig,
  type EximbayRefundPreflightConfigInput,
} from "./preflight-contract";
import { deriveEximbayMerchantRefundId } from "./refund-id";
import {
  fingerprintEximbayCancelWire,
  type EximbayCancelWireAuthority,
} from "./cancel-wire";
import {
  deriveEximbayDispatchAuthority,
  hasExactContactMarker,
  hasLawfulEximbayR2Origin,
  type EximbayDispatchAuthority,
} from "./lifecycle-authority";
import {
  discoverEximbayLifecycleOwnership,
  lockAndLoadEximbayLifecycleState,
  type LockedEximbayLifecycleState,
} from "./lifecycle-state";
import {
  EXIMBAY_REFUND_LOOKUP_MAX_CONTACTS,
  EXIMBAY_REFUND_LOOKUP_OFFSETS_MS,
  createEximbayRefundLookupPlan,
  executeEximbayRefundLookup,
  type EximbayRefundLookupResult,
  type EximbayRefundLookupTransport,
} from "./refund-lookup";

const INPUT_FIELDS = ["commandId", "recoveryOwner"] as const;
const OWNER_MAX_CODE_POINTS = 255;

export type ReconcileEximbayRefundInput = Readonly<{
  commandId: string;
  recoveryOwner: string;
}>;

export type ReconcileEximbayRefundResult =
  | Readonly<{
      ok: true;
      state: "SUCCEEDED" | "R2_AUTHORIZED" | "WAITING_EVIDENCE" | "PARKED";
      replayed: boolean;
      authorization?: Readonly<{
        commandId: string;
        dispatchAttempt: 2;
        leaseGeneration: number;
        leaseToken: string;
      }>;
    }>
  | Readonly<{ ok: false; code: string; message: string }>;

export type EximbayRefundReconciliationDependencies = Readonly<{
  config: EximbayRefundPreflightConfigInput;
  lookup: EximbayRefundLookupTransport;
}>;

type LookupFence = Readonly<{
  commandId: string;
  dispatchOrdinal: 1 | 2;
  lookupOrdinal: 1 | 2 | 3;
  recoveryGeneration: number;
  recoveryToken: string;
  authority: EximbayDispatchAuthority;
}>;

export function createEximbayRefundReconciler(
  dependencies: EximbayRefundReconciliationDependencies,
) {
  const config = createEximbayRefundPreflightConfig(dependencies.config);
  return async (
    client: PrismaClient,
    rawInput: ReconcileEximbayRefundInput,
  ): Promise<ReconcileEximbayRefundResult> => {
    const input = normalizeInput(rawInput);
    if (!input) return failure("INVALID_INPUT", "Eximbay reconciliation input is invalid.");
    const acquired = await acquireLookupFence(client, input, config);
    if ("ok" in acquired) return acquired;
    const lookup = await executeEximbayRefundLookup(
      createEximbayRefundLookupPlan(acquired.authority.lookup),
      acquired.authority.lookup,
      dependencies.lookup,
    );
    return applyLookupResult(client, acquired, lookup, config);
  };
}

async function acquireLookupFence(
  client: PrismaClient,
  input: ReconcileEximbayRefundInput,
  config: ReturnType<typeof createEximbayRefundPreflightConfig>,
): Promise<LookupFence | ReconcileEximbayRefundResult> {
  try {
    return await client.$transaction(async (tx) => {
      const ownership = await discoverEximbayLifecycleOwnership(tx, input.commandId);
      if (!ownership) return commandMissing();
      const state = await lockAndLoadEximbayLifecycleState(tx, ownership, input.commandId);
      if (!state) return commandMissing();
      return acquireLockedLookupFence(tx, state, input, config);
    });
  } catch (error) {
    if (error instanceof ReconciliationRollbackError || isPersistenceConflict(error)) {
      return failure("PERSISTENCE_CONFLICT", "Eximbay lookup fence conflicted.");
    }
    throw error;
  }
}

async function acquireLockedLookupFence(
  tx: Prisma.TransactionClient,
  state: LockedEximbayLifecycleState,
  input: ReconcileEximbayRefundInput,
  config: ReturnType<typeof createEximbayRefundPreflightConfig>,
): Promise<LookupFence | ReconcileEximbayRefundResult> {
  const durable = durableResult(state);
  if (durable) return durable;
  const ordinal = currentDispatchSequenceTip(state);
  if (!ordinal) return ledgerFailure();
  const authority = deriveEximbayDispatchAuthority(state, config, ordinal);
  if (!authority || !lookupAuthorityCoherent(state, authority, config)) return ledgerFailure();
  const permits = lookupPermitEvents(state, authority.dispatch);
  if (permits.length >= EXIMBAY_REFUND_LOOKUP_MAX_CONTACTS) {
    return handleExhaustedLookup(tx, state);
  }
  if (!lookupDue(state, authority, permits.length)) {
    return failure("LOOKUP_NOT_YET_DUE", "Eximbay refund lookup is not yet due.");
  }
  if (!recoverableCommandState(state)) {
    return failure("RECOVERY_LEASE_CONFLICT", "Eximbay refund recovery is already leased.");
  }
  return persistLookupFence(tx, state, input, authority, nextLookupOrdinal(permits.length));
}

function handleExhaustedLookup(
  tx: Prisma.TransactionClient,
  state: LockedEximbayLifecycleState,
): ReconcileEximbayRefundResult | Promise<ReconcileEximbayRefundResult> {
  return recoverableCommandState(state)
    ? parkWithoutLookup(tx, state, "EXIMBAY_LOOKUP_LIMIT_REACHED")
    : failure("RECOVERY_LEASE_CONFLICT", "Eximbay refund recovery is already leased.");
}

function lookupAuthorityCoherent(
  state: LockedEximbayLifecycleState,
  authority: EximbayDispatchAuthority,
  config: ReturnType<typeof createEximbayRefundPreflightConfig>,
): boolean {
  return hasExactContactMarker(authority)
    && coherentLookupBase(state, authority)
    && hasLawfulEximbayR2Origin(state, authority, config);
}

function currentDispatchSequenceTip(state: LockedEximbayLifecycleState): 1 | 2 | null {
  const ordinal = state.context.command.dispatchAttempt;
  if ((ordinal !== 1 && ordinal !== 2)
    || state.history.dispatchAttempts.length !== ordinal) return null;
  return state.history.dispatchAttempts.every((dispatch, index) => (
    dispatch.commandId === state.context.command.id && dispatch.ordinal === index + 1
  )) ? ordinal : null;
}

function lookupDue(
  state: LockedEximbayLifecycleState,
  authority: EximbayDispatchAuthority,
  completedPermits: number,
): boolean {
  const contactMarkedAt = authority.dispatch.contactMarkedAt;
  const offset = EXIMBAY_REFUND_LOOKUP_OFFSETS_MS[completedPermits];
  return contactMarkedAt !== null && offset !== undefined
    && state.capturedAt.getTime() >= contactMarkedAt.getTime() + offset;
}

function nextLookupOrdinal(count: number): 1 | 2 | 3 {
  if (count === 0) return 1;
  if (count === 1) return 2;
  if (count === 2) return 3;
  throw new Error("EXIMBAY_LOOKUP_LIMIT_REACHED");
}

async function persistLookupFence(
  tx: Prisma.TransactionClient,
  state: LockedEximbayLifecycleState,
  input: ReconcileEximbayRefundInput,
  authority: EximbayDispatchAuthority,
  lookupOrdinal: 1 | 2 | 3,
): Promise<LookupFence> {
  const recoveryGeneration = state.context.command.leaseGeneration + 1;
  const recoveryToken = randomBytes(32).toString("hex");
  const leaseUntil = new Date(
    state.capturedAt.getTime() + REFUND_EXECUTION_LEASE_DURATION_MS,
  );
  const updated = await tx.refundExecutionCommand.updateMany({
    where: exactCurrentCommandWhere(state),
    data: {
      status: RefundExecutionCommandStatus.LEASED,
      leaseOwner: input.recoveryOwner,
      leaseUntil,
      leaseGeneration: recoveryGeneration,
      leaseTokenHash: digest(recoveryToken),
    },
  });
  if (updated.count !== 1) throw new ReconciliationRollbackError();
  await tx.refundExecutionCommandEvent.create({ data: {
    commandId: input.commandId,
    eventType: RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED,
    leaseGeneration: recoveryGeneration,
    dispatchAttempt: authority.dispatch.ordinal,
    occurredAt: state.capturedAt,
  } });
  return Object.freeze({
    commandId: input.commandId,
    dispatchOrdinal: authority.dispatch.ordinal === 1 ? 1 : 2,
    lookupOrdinal,
    recoveryGeneration,
    recoveryToken,
    authority,
  });
}

async function applyLookupResult(
  client: PrismaClient,
  fence: LookupFence,
  lookup: EximbayRefundLookupResult,
  config: ReturnType<typeof createEximbayRefundPreflightConfig>,
): Promise<ReconcileEximbayRefundResult> {
  try {
    return await client.$transaction(async (tx) => {
      const ownership = await discoverEximbayLifecycleOwnership(tx, fence.commandId);
      if (!ownership) return commandMissing();
      const state = await lockAndLoadEximbayLifecycleState(tx, ownership, fence.commandId);
      if (!state) return commandMissing();
      return applyLockedLookupResult(tx, state, fence, lookup, config);
    });
  } catch (error) {
    if (error instanceof ResolutionRollbackError
      || error instanceof ReconciliationRollbackError
      || isPersistenceConflict(error)) {
      return failure("PERSISTENCE_CONFLICT", "Eximbay lookup result persistence conflicted.");
    }
    throw error;
  }
}

async function applyLockedLookupResult(
  tx: Prisma.TransactionClient,
  state: LockedEximbayLifecycleState,
  fence: LookupFence,
  lookup: EximbayRefundLookupResult,
  config: ReturnType<typeof createEximbayRefundPreflightConfig>,
): Promise<ReconcileEximbayRefundResult> {
  const durable = durableResult(state);
  if (durable) return durable;
  const authority = deriveEximbayDispatchAuthority(state, config, fence.dispatchOrdinal);
  if (!authority || !lookupFenceMatches(state, authority, fence)) return ledgerFailure();
  if (lookup.kind === "found") return applyFound(tx, state, fence, lookup);
  if (lookup.kind === "none") return applyNone(tx, state, fence);
  return lookup.kind === "conflict"
    ? parkConflict(tx, state, fence, lookup.code)
    : applyUnknown(tx, state, fence, lookup.code);
}

function applyNone(
  tx: Prisma.TransactionClient,
  state: LockedEximbayLifecycleState,
  fence: LookupFence,
): Promise<ReconcileEximbayRefundResult> {
  return fence.dispatchOrdinal === 1
    ? admitR2AfterNone(tx, state, fence)
    : parkR2None(tx, state, fence);
}

async function applyFound(
  tx: Prisma.TransactionClient,
  state: LockedEximbayLifecycleState,
  fence: LookupFence,
  lookup: Extract<EximbayRefundLookupResult, { kind: "found" }>,
): Promise<ReconcileEximbayRefundResult> {
  const observation = Object.freeze({
    outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
    observedProviderRefundId: lookup.providerRefundTransactionId,
    reportedAmount: lookup.refundAmount,
    reportedCurrency: fence.authority.lookup.currency,
    safeCode: null,
    safeMessage: null,
    observedAt: new Date(state.capturedAt.getTime()),
  });
  const identityConflict = await hasRefundProviderIdentityConflict(
    tx,
    state.context.target,
    observation,
  );
  const plan = buildResolutionPlan(
    state.context.aggregate,
    state.context.target,
    observation,
    state.capturedAt,
    identityConflict,
  );
  if ("ok" in plan) return ledgerFailure();
  const persisted = await persistResolution(
    tx,
    state.context,
    persistenceInput(fence, observation),
    plan,
    state.capturedAt,
    lookupProvenance(fence),
  );
  return persisted.ok
    ? Object.freeze({ ok: true, state: "SUCCEEDED", replayed: false })
    : ledgerFailure();
}

async function admitR2AfterNone(
  tx: Prisma.TransactionClient,
  state: LockedEximbayLifecycleState,
  fence: LookupFence,
): Promise<ReconcileEximbayRefundResult> {
  const recoveryKey = deriveRecoveryKey(state);
  if (state.history.dispatchAttempts.length !== 1
    || !recoveryKey
    || recoveryKey === fence.authority.dispatch.providerOperationKey
    || state.evidence.some((row) => (
      row.outcome === RefundExecutionEvidenceOutcome.SUCCEEDED
        && row.application === RefundExecutionEvidenceApplication.APPLIED
    ))) return ledgerFailure();
  await insertLookupEvidence(tx, state, fence, {
    outcome: RefundExecutionEvidenceOutcome.NOT_EXECUTED_RETRYABLE,
    application: RefundExecutionEvidenceApplication.PARKED,
    safeCode: "PROVIDER_NOT_EXECUTED_RETRYABLE",
    safeMessage: null,
  });
  const cancel: EximbayCancelWireAuthority = Object.freeze({
    ...fence.authority.cancel,
    providerOperationKey: recoveryKey,
  });
  const dispatch = await tx.refundExecutionDispatchAttempt.create({ data: {
    commandId: fence.commandId,
    ordinal: 2,
    leaseGeneration: fence.recoveryGeneration,
    provider: "EXIMBAY",
    mode: "SANDBOX",
    providerOperationKey: recoveryKey,
    requestFingerprint: fingerprintEximbayCancelWire(cancel),
    state: RefundExecutionDispatchAttemptState.AUTHORIZED,
    authorizedAt: state.capturedAt,
    contactMarkedAt: null,
  } });
  const updated = await tx.refundExecutionCommand.updateMany({
    where: exactFenceCommandWhere(state, fence),
    data: { dispatchAttempt: 2, lastSafeErrorCode: null, lastSafeErrorMessage: null },
  });
  if (updated.count !== 1 || dispatch.providerOperationKey === fence.authority.dispatch.providerOperationKey) {
    throw new ReconciliationRollbackError();
  }
  return Object.freeze({
    ok: true,
    state: "R2_AUTHORIZED",
    replayed: false,
    authorization: Object.freeze({
      commandId: fence.commandId,
      dispatchAttempt: 2,
      leaseGeneration: fence.recoveryGeneration,
      leaseToken: fence.recoveryToken,
    }),
  });
}

function deriveRecoveryKey(state: LockedEximbayLifecycleState): string | null {
  if (!state.binding) return null;
  try {
    return deriveEximbayMerchantRefundId(state.binding.operationFamilyFingerprint, 2);
  } catch {
    return null;
  }
}

async function parkR2None(
  tx: Prisma.TransactionClient,
  state: LockedEximbayLifecycleState,
  fence: LookupFence,
): Promise<ReconcileEximbayRefundResult> {
  return persistManualResult(
    tx,
    state,
    fence,
    RefundExecutionEvidenceOutcome.NOT_EXECUTED_RETRYABLE,
    RefundExecutionEvidenceApplication.PARKED,
    "EXIMBAY_R2_NONE_MANUAL_REVIEW",
    "Eximbay R2 was authoritatively not executed; automatic R3 is forbidden.",
  );
}

async function parkConflict(
  tx: Prisma.TransactionClient,
  state: LockedEximbayLifecycleState,
  fence: LookupFence,
  code: string,
): Promise<ReconcileEximbayRefundResult> {
  return persistManualResult(
    tx,
    state,
    fence,
    RefundExecutionEvidenceOutcome.UNKNOWN,
    RefundExecutionEvidenceApplication.CONFLICT,
    `EXIMBAY_LOOKUP_CONFLICT_${safeDiagnostic(code)}`,
    "Eximbay refund lookup returned conflicting identity or money.",
  );
}

async function applyUnknown(
  tx: Prisma.TransactionClient,
  state: LockedEximbayLifecycleState,
  fence: LookupFence,
  code: string,
): Promise<ReconcileEximbayRefundResult> {
  if (fence.lookupOrdinal === EXIMBAY_REFUND_LOOKUP_MAX_CONTACTS) {
    return persistManualResult(
      tx,
      state,
      fence,
      RefundExecutionEvidenceOutcome.UNKNOWN,
      RefundExecutionEvidenceApplication.PARKED,
      "EXIMBAY_LOOKUP_EXHAUSTED",
      "Eximbay refund lookup limit was reached without authoritative finality.",
    );
  }
  await insertLookupEvidence(tx, state, fence, {
    outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
    application: RefundExecutionEvidenceApplication.PARKED,
    safeCode: `EXIMBAY_LOOKUP_${safeDiagnostic(code)}`,
    safeMessage: null,
  });
  const due = new Date(
    fence.authority.dispatch.contactMarkedAt!.getTime()
      + EXIMBAY_REFUND_LOOKUP_OFFSETS_MS[fence.lookupOrdinal],
  );
  const updated = await tx.refundExecutionCommand.updateMany({
    where: exactFenceCommandWhere(state, fence),
    data: {
      status: RefundExecutionCommandStatus.WAITING_EVIDENCE,
      availableAt: due,
      leaseOwner: null,
      leaseUntil: null,
      leaseTokenHash: null,
      lastSafeErrorCode: "PROVIDER_OUTCOME_UNKNOWN",
      lastSafeErrorMessage: "Eximbay refund lookup remains inconclusive.",
    },
  });
  if (updated.count !== 1) throw new ReconciliationRollbackError();
  return Object.freeze({ ok: true, state: "WAITING_EVIDENCE", replayed: false });
}

async function persistManualResult(
  tx: Prisma.TransactionClient,
  state: LockedEximbayLifecycleState,
  fence: LookupFence,
  outcome: RefundExecutionEvidenceOutcome,
  application: RefundExecutionEvidenceApplication,
  safeCode: string,
  safeMessage: string,
): Promise<ReconcileEximbayRefundResult> {
  const observation = Object.freeze({
    outcome,
    observedProviderRefundId: null,
    reportedAmount: null,
    reportedCurrency: null,
    safeCode,
    safeMessage,
    observedAt: new Date(state.capturedAt.getTime()),
  });
  const plan: ResolutionPlan = {
    application,
    diagnostic: { safeCode, safeMessage },
    attemptStatus: RefundAttemptStatus.MANUAL_REVIEW,
    commandStatus: RefundExecutionCommandStatus.PARKED,
    orderStatus: OrderStatus.REFUND_PENDING,
    processedAt: null,
    failedAt: null,
    providerRefundId: null,
    transitionReason: application === RefundExecutionEvidenceApplication.CONFLICT
      ? "Eximbay refund lookup conflict requires manual review."
      : "Eximbay automatic refund recovery limit requires manual review.",
  };
  const persisted = await persistResolution(
    tx,
    state.context,
    persistenceInput(fence, observation),
    plan,
    state.capturedAt,
    lookupProvenance(fence),
  );
  return persisted.ok
    ? Object.freeze({ ok: true, state: "PARKED", replayed: false })
    : ledgerFailure();
}

async function insertLookupEvidence(
  tx: Prisma.TransactionClient,
  state: LockedEximbayLifecycleState,
  fence: LookupFence,
  input: Readonly<{
    outcome: RefundExecutionEvidenceOutcome;
    application: RefundExecutionEvidenceApplication;
    safeCode: string;
    safeMessage: string | null;
  }>,
): Promise<void> {
  await tx.refundExecutionEvidence.create({ data: {
    commandId: fence.commandId,
    source: RefundExecutionEvidenceSource.PROVIDER_LOOKUP,
    sourceDedupKey: lookupDedupKey(fence),
    outcome: input.outcome,
    application: input.application,
    observedProviderRefundId: null,
    reportedAmount: null,
    reportedCurrency: null,
    safeCode: input.safeCode,
    safeMessage: input.safeMessage,
    observedAt: state.capturedAt,
    dispatchAttemptId: fence.authority.dispatch.id,
    authorizingLeaseGeneration: fence.recoveryGeneration,
  } });
}

async function parkWithoutLookup(
  tx: Prisma.TransactionClient,
  state: LockedEximbayLifecycleState,
  safeCode: string,
): Promise<ReconcileEximbayRefundResult> {
  const authority = state.history.dispatchAttempts.at(-1);
  const permit = state.history.events.filter((event) => (
    event.eventType === RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED
      && event.dispatchAttempt === authority?.ordinal
  )).at(-1);
  if (!authority || !permit) return ledgerFailure();
  const lookupOrdinal = lookupPermitEvents(state, authority).length;
  if (lookupOrdinal !== EXIMBAY_REFUND_LOOKUP_MAX_CONTACTS) return ledgerFailure();
  const sourceDedupKey = `refund-provider-lookup:${state.context.command.id}:${authority.id}:${lookupOrdinal}`;
  let evidence = state.evidence.find((row) => row.sourceDedupKey === sourceDedupKey);
  if (!evidence) {
    evidence = await tx.refundExecutionEvidence.create({ data: {
      commandId: state.context.command.id,
      source: RefundExecutionEvidenceSource.PROVIDER_LOOKUP,
      sourceDedupKey,
      outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
      application: RefundExecutionEvidenceApplication.PARKED,
      observedProviderRefundId: null,
      reportedAmount: null,
      reportedCurrency: null,
      safeCode,
      safeMessage: "Eximbay refund lookup permit expired without authoritative finality.",
      observedAt: state.capturedAt,
      dispatchAttemptId: authority.id,
      authorizingLeaseGeneration: permit.leaseGeneration,
    } });
  }
  const updatedAttempt = await tx.refundAttempt.updateMany({
    where: { id: state.context.target.id, status: RefundAttemptStatus.PROCESSING },
    data: {
      status: RefundAttemptStatus.MANUAL_REVIEW,
      failureCode: safeCode,
      safeFailureMessage: "Eximbay refund lookup contact limit was reached.",
    },
  });
  const updatedCommand = await tx.refundExecutionCommand.updateMany({
    where: { id: state.context.command.id, status: state.context.command.status },
    data: {
      status: RefundExecutionCommandStatus.PARKED,
      leaseOwner: null,
      leaseUntil: null,
      leaseTokenHash: null,
      lastSafeErrorCode: safeCode,
      lastSafeErrorMessage: "Eximbay refund lookup contact limit was reached.",
    },
  });
  if (updatedAttempt.count !== 1 || updatedCommand.count !== 1) {
    throw new ReconciliationRollbackError();
  }
  await tx.refundAttemptTransition.create({ data: {
    refundAttemptId: state.context.target.id,
    fromStatus: RefundAttemptStatus.PROCESSING,
    toStatus: RefundAttemptStatus.MANUAL_REVIEW,
    orderStatusBefore: OrderStatus.REFUND_PENDING,
    orderStatusAfter: OrderStatus.REFUND_PENDING,
    actorType: "SYSTEM",
    actorUserId: null,
    reason: "Eximbay expired lookup permit requires manual review.",
    operationKey: buildRefundExecutionApplyOperationKey(evidence.id),
    createdAt: state.capturedAt,
  } });
  return Object.freeze({ ok: true, state: "PARKED", replayed: false });
}

function coherentLookupBase(
  state: LockedEximbayLifecycleState,
  authority: EximbayDispatchAuthority,
): boolean {
  const adapter = state.evidence.filter((row) => (
    row.dispatchAttemptId === authority.dispatch.id
      && row.source === RefundExecutionEvidenceSource.ADAPTER_RESPONSE
  ));
  const lawfulAdapterVariant = adapter.length === 0 || (
    adapter.length === 1
      && adapter[0].outcome === RefundExecutionEvidenceOutcome.UNKNOWN
      && adapter[0].application === RefundExecutionEvidenceApplication.PARKED
  );
  const noTerminalOrConflictingEvidence = state.evidence.every((row) => (
    row.outcome !== RefundExecutionEvidenceOutcome.SUCCEEDED
      && row.application !== RefundExecutionEvidenceApplication.APPLIED
      && row.application !== RefundExecutionEvidenceApplication.CONFLICT
  ));
  const dispatchIds = new Set(state.history.dispatchAttempts.map((row) => row.id));
  const allEvidenceBoundToKnownDispatch = state.evidence.every((row) => (
    row.dispatchAttemptId !== null && dispatchIds.has(row.dispatchAttemptId)
  ));
  return lawfulAdapterVariant
    && noTerminalOrConflictingEvidence
    && allEvidenceBoundToKnownDispatch
    && coherentAdapterHistory(state)
    && coherentLookupHistory(state);
}

function coherentAdapterHistory(state: LockedEximbayLifecycleState): boolean {
  return state.history.dispatchAttempts.every((dispatch) => {
    const evidence = state.evidence.filter((row) => (
      row.dispatchAttemptId === dispatch.id
        && row.source === RefundExecutionEvidenceSource.ADAPTER_RESPONSE
    ));
    if (evidence.length === 0) return true;
    if (evidence.length !== 1 || dispatch.contactMarkedAt === null) return false;
    const observation = evidence[0];
    return [
      dispatch.state === RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
      observation.outcome === RefundExecutionEvidenceOutcome.UNKNOWN,
      observation.application === RefundExecutionEvidenceApplication.PARKED,
      observation.sourceDedupKey
        === `refund-result:${state.context.command.id}:${dispatch.ordinal}`,
      observation.authorizingLeaseGeneration === dispatch.leaseGeneration,
      observation.observedAt.getTime() >= dispatch.contactMarkedAt.getTime(),
    ].every(Boolean);
  });
}

function coherentLookupHistory(state: LockedEximbayLifecycleState): boolean {
  const recoveryEvents = state.history.events.filter((event) => (
    event.eventType === RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED
  ));
  const permitsCoherent = new Set(recoveryEvents.map((event) => event.leaseGeneration)).size
    === recoveryEvents.length && recoveryEvents.every((event) => {
    const dispatch = state.history.dispatchAttempts.find((row) => (
      row.ordinal === event.dispatchAttempt
    ));
    return dispatch !== undefined && event.leaseGeneration > dispatch.leaseGeneration;
  }) && state.history.dispatchAttempts.every((dispatch) => (
    recoveryEvents.filter((event) => event.dispatchAttempt === dispatch.ordinal).length
      <= EXIMBAY_REFUND_LOOKUP_MAX_CONTACTS
  ));
  if (!permitsCoherent) return false;
  return state.evidence.filter((row) => (
    row.source === RefundExecutionEvidenceSource.PROVIDER_LOOKUP
  )).every((row) => {
    const dispatch = state.history.dispatchAttempts.find((candidate) => (
      candidate.id === row.dispatchAttemptId
    ));
    if (!dispatch) return false;
    const prefix = `refund-provider-lookup:${state.context.command.id}:${dispatch.id}:`;
    const ordinal = Number(row.sourceDedupKey.startsWith(prefix)
      ? row.sourceDedupKey.slice(prefix.length)
      : Number.NaN);
    if (!Number.isSafeInteger(ordinal) || ordinal < 1
      || ordinal > EXIMBAY_REFUND_LOOKUP_MAX_CONTACTS) return false;
    const permits = recoveryEvents.filter((event) => (
      event.dispatchAttempt === dispatch.ordinal
    ));
    return permits[ordinal - 1]?.leaseGeneration === row.authorizingLeaseGeneration;
  });
}

function lookupPermitEvents(
  state: LockedEximbayLifecycleState,
  dispatch: EximbayDispatchAuthority["dispatch"],
) {
  return state.history.events.filter((event) => (
    event.eventType === RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED
      && event.dispatchAttempt === dispatch.ordinal
      && event.leaseGeneration > dispatch.leaseGeneration
  ));
}

function recoverableCommandState(state: LockedEximbayLifecycleState): boolean {
  const command = state.context.command;
  if (command.status === RefundExecutionCommandStatus.WAITING_EVIDENCE) {
    return command.leaseOwner === null && command.leaseUntil === null
      && command.leaseTokenHash === null;
  }
  return command.status === RefundExecutionCommandStatus.LEASED
    && command.leaseUntil !== null
    && command.leaseUntil.getTime() <= state.capturedAt.getTime()
    && Boolean(command.leaseOwner)
    && Boolean(command.leaseTokenHash);
}

function lookupFenceMatches(
  state: LockedEximbayLifecycleState,
  authority: EximbayDispatchAuthority,
  fence: LookupFence,
): boolean {
  const command = state.context.command;
  const event = state.history.events.filter((row) => (
    row.eventType === RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED
      && row.leaseGeneration === fence.recoveryGeneration
      && row.dispatchAttempt === fence.dispatchOrdinal
  ));
  return command.status === RefundExecutionCommandStatus.LEASED
    && command.dispatchAttempt === fence.dispatchOrdinal
    && command.leaseGeneration === fence.recoveryGeneration
    && command.leaseTokenHash === digest(fence.recoveryToken)
    && authority.dispatch.id === fence.authority.dispatch.id
    && event.length === 1
    && !state.evidence.some((row) => row.sourceDedupKey === lookupDedupKey(fence));
}

function durableResult(state: LockedEximbayLifecycleState): ReconcileEximbayRefundResult | null {
  if (state.context.target.status === RefundAttemptStatus.SUCCEEDED
    && state.context.command.status === RefundExecutionCommandStatus.DONE) {
    return Object.freeze({ ok: true, state: "SUCCEEDED", replayed: true });
  }
  if (state.context.target.status === RefundAttemptStatus.MANUAL_REVIEW
    && state.context.command.status === RefundExecutionCommandStatus.PARKED) {
    return Object.freeze({ ok: true, state: "PARKED", replayed: true });
  }
  return null;
}

function exactCurrentCommandWhere(state: LockedEximbayLifecycleState) {
  const command = state.context.command;
  return {
    id: command.id,
    refundAttemptId: state.context.target.id,
    status: command.status,
    dispatchAttempt: command.dispatchAttempt,
    leaseGeneration: command.leaseGeneration,
    leaseOwner: command.leaseOwner,
    leaseUntil: command.leaseUntil,
    leaseTokenHash: command.leaseTokenHash,
  };
}

function exactFenceCommandWhere(
  state: LockedEximbayLifecycleState,
  fence: LookupFence,
) {
  return {
    id: fence.commandId,
    refundAttemptId: state.context.target.id,
    status: RefundExecutionCommandStatus.LEASED,
    dispatchAttempt: fence.dispatchOrdinal,
    leaseGeneration: fence.recoveryGeneration,
    leaseTokenHash: digest(fence.recoveryToken),
  };
}

function persistenceInput(
  fence: LookupFence,
  observation: Parameters<typeof persistResolution>[2]["observation"],
) {
  return Object.freeze({
    commandId: fence.commandId,
    dispatchAttempt: fence.dispatchOrdinal,
    leaseGeneration: fence.recoveryGeneration,
    leaseToken: fence.recoveryToken,
    observation,
  });
}

function lookupProvenance(fence: LookupFence) {
  return Object.freeze({
    source: RefundExecutionEvidenceSource.PROVIDER_LOOKUP,
    sourceDedupKey: lookupDedupKey(fence),
    dispatchAttemptId: fence.authority.dispatch.id,
    authorizingLeaseGeneration: fence.recoveryGeneration,
  });
}

function lookupDedupKey(fence: LookupFence): string {
  return `refund-provider-lookup:${fence.commandId}:${fence.authority.dispatch.id}:${fence.lookupOrdinal}`;
}

function normalizeInput(value: unknown): ReconcileEximbayRefundInput | null {
  if (!isRecord(value) || !hasExactInputFields(value) || !inputValuesValid(value)) return null;
  return Object.freeze({
    commandId: value.commandId,
    recoveryOwner: value.recoveryOwner,
  });
}

function hasExactInputFields(input: Record<string, unknown>): boolean {
  const keys = Reflect.ownKeys(input);
  return keys.length === INPUT_FIELDS.length
    && keys.every((key) => typeof key === "string"
      && INPUT_FIELDS.some((field) => field === key));
}

function inputValuesValid(input: Record<string, unknown>): input is Record<string, unknown> & {
  commandId: string;
  recoveryOwner: string;
} {
  return validCommandId(input.commandId) && validRecoveryOwner(input.recoveryOwner);
}

function validCommandId(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function validRecoveryOwner(value: unknown): value is string {
  return typeof value === "string" && value === value.trim() && Boolean(value)
    && Array.from(value).length <= OWNER_MAX_CODE_POINTS && !/\p{Cc}/u.test(value);
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeDiagnostic(code: string): string {
  return code.replace(/[^A-Z0-9_]/gu, "_").slice(0, 96) || "UNKNOWN";
}

function isPersistenceConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && error.code === "P2002";
}

class ReconciliationRollbackError extends Error {}

function failure(code: string, message: string): ReconcileEximbayRefundResult {
  return Object.freeze({ ok: false, code, message });
}

const commandMissing = () => failure(
  "COMMAND_NOT_FOUND_OR_INELIGIBLE",
  "Eximbay refund command is not eligible for reconciliation.",
);
const ledgerFailure = () => failure(
  "REFUND_LEDGER_INCONSISTENT",
  "Eximbay refund reconciliation aggregate is inconsistent.",
);
