import { createHash } from "node:crypto";
import {
  OrderStatus,
  PaymentAdapterExecutionKind,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandEventType,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  RefundExecutionEvidenceOutcome,
} from "@prisma/client";
import { calculateEximbayCanaryTargetDigest } from
  "../../src/lib/payment/refund/eximbay-refund-canary-target-binding.js";
import {
  hasConsistentRefundAttemptLedgerIdentity,
  sumSucceededRefundAmount,
} from "../../src/lib/payment/refund/invariants.js";
import { hasCoherentUncontactedLeaseEventHistory } from
  "../../src/lib/payment/refund/uncontacted-recovery-event-history.js";
import {
  EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
  EXIMBAY_REFUND_OPERATION_FAMILY_VERSION,
} from "../../src/lib/payment/refund/providers/eximbay/preflight-contract.js";

/* eslint-disable complexity -- This fixed-target, fail-closed adjudicator intentionally spells out each independent custody and readiness gate. */

export const REFUND_READINESS_BUSINESS_STATE_READBACK_MODE =
  "refund-readiness-business-state-readback" as const;
export const REFUND_READINESS_BUSINESS_STATE_READBACK_CODE =
  "REFUND_READINESS_BUSINESS_STATE_READBACK_COMPLETE" as const;
export const REFUND_READINESS_BUSINESS_STATE_READBACK_JOB =
  "mira-p3e-sbx-refund-readiness-readback" as const;
export const REFUND_READINESS_BUSINESS_STATE_READBACK_ROLE =
  "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam" as const;

export const REFUND_READINESS_FIXED_TARGET = Object.freeze({
  paymentId: "cmtsdmk16000201s6alc0evek",
  orderId: "cmtsdmo8r000401s671x1chsp",
  refundAttemptId: "eximbay-canary-7f9188b209f5f8504df28fe300e53aba980859e8",
  commandId: "cmtsdrrxk00010ss6we7g8qe7",
  providerOperationBindingId: "cmtsdrs0900030ss6qwxcgar6",
  historicalApprovalId: "eximbay-canary-approval-cd3e243b-97da-41d2-9bdc-c1dc001065cc",
  targetBindingDigest: "e9fc5296fa962cefbcfe17fd57f23c637ede5ed02408450146425ce2dbc1953c",
  syntheticProvenanceDigest: "710a63bda4810d0f1f974a82b33b476dedaa20cc14df6746eb3bb478790a4d75",
  providerOperationFamilyKey:
    "eximbay-refund-family-v1-a2d09d6749cea4634bcd11078f719631d8c0b8923e510985fd3f4caafd382f62",
  operationFamilyFingerprint: "a2d09d6749cea4634bcd11078f719631d8c0b8923e510985fd3f4caafd382f62",
  merchantAccountBindingId: "783244bb25ed5c7506bd3589e8b252e683c65f265068673dbe4d18e415477893",
  credentialGenerationBindingId: "2c03724ab5f9746b50815e888ef1619719b5ab1590ac69873487d337ffd50c73",
  executionReleasePolicyDigest:
    "5ee57ccdbedc79e0837df0491b9c5942fa47fa8462f1332f3766adfd24750be6",
  amount: 100,
  currency: "USD",
} as const);

const DATABASE_NAME = "refund_sandbox";
const MAX_ROWS = 64;
const REFUND_REENTRY_OPERATION = "EXIMBAY_SANDBOX_BOUND_ORDINAL_ZERO_REENTRY";
const REFUND_EMAIL_DEDUP_KEY =
  `customer-refund-succeeded:v1:${REFUND_READINESS_FIXED_TARGET.refundAttemptId}`;
const SHA256 = /^[0-9a-f]{64}$/u;

export const REFUND_READINESS_SQL = Object.freeze({
  begin: "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
  identity: `
    SELECT current_user AS "currentUser",
      current_database() AS "currentDatabase",
      current_setting('transaction_read_only') AS "transactionReadOnly",
      current_setting('transaction_isolation') AS "transactionIsolation",
      date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `,
  payment: `
    SELECT "id", "checkoutSessionId", "provider", "mode", "adapterExecutionKind",
      "status", "attemptLifecycle", "amount", "currency", "providerOrderId",
      "providerPaymentKey", "financialSucceededAt"
    FROM "Payment"
    WHERE "id" = $1
  `,
  order: `
    SELECT "id", "checkoutSessionId", "paymentId", "currency", "totalAmount", "status"
    FROM "Order"
    WHERE "id" = $1
  `,
  session: `
    SELECT "id", "communicationLocale"
    FROM "CheckoutSession"
    WHERE "id" = (
      SELECT "checkoutSessionId" FROM "Order" WHERE "id" = $1
    )
  `,
  attempts: `
    SELECT "id", "orderId", "paymentId", "amount", "currency", "status", "reason",
      "actorType", "actorUserId", "provider", "mode", "providerRefundId",
      "idempotencyKey", "requestedAt", "processedAt", "failedAt", "failureCode",
      "safeFailureMessage", "createdAt"
    FROM "RefundAttempt"
    WHERE "orderId" = $1 OR "paymentId" = $2
    ORDER BY "createdAt" ASC, "id" ASC
    LIMIT 65
  `,
  command: `
    SELECT "id", "refundAttemptId", "status", "availableAt", "leaseOwner",
      "leaseUntil", "leaseGeneration", "leaseTokenHash", "dispatchAttempt",
      "lastSafeErrorCode", "lastSafeErrorMessage"
    FROM "RefundExecutionCommand"
    WHERE "id" = $1
  `,
  approval: `
    SELECT "id", "formatVersion", "provider", "mode", "commandId",
      "targetBindingDigest", "consumedAt"
    FROM "EximbayRefundSandboxCanaryApproval"
    WHERE "commandId" = $1
  `,
  binding: `
    SELECT "id", "refundAttemptId", "provider", "mode", "providerOperationKey",
      "operationKeyAlgorithmVersion", "wireContractVersion", "wireRequestFingerprint",
      "merchantAccountBindingId", "credentialGenerationBindingId"
    FROM "RefundExecutionProviderOperationBinding"
    WHERE "id" = $1 OR "refundAttemptId" = $2
    LIMIT 65
  `,
  authorizations: `
    SELECT "id", "commandId", "refundAttemptId", "providerOperationBindingId",
      "targetBindingDigest", "expectedPredecessorGeneration", "operationClass",
      "releasePolicyDigest", "issuedAt", "expiresAt", "revokedAt", "consumedAt",
      "consumedLeaseEventId"
    FROM "RefundExecutionAuthorization"
    WHERE "commandId" = $1 OR "refundAttemptId" = $2
      OR "providerOperationBindingId" = $3
    ORDER BY "issuedAt" ASC, "id" ASC
    LIMIT 65
  `,
  commandEvents: `
    SELECT "id", "commandId", "eventType", "leaseGeneration", "dispatchAttempt",
      "occurredAt", "createdAt"
    FROM "RefundExecutionCommandEvent"
    WHERE "commandId" = $1
    ORDER BY "leaseGeneration" ASC, "occurredAt" ASC, "id" ASC
    LIMIT 65
  `,
  dispatchAttempts: `
    SELECT "id", "commandId", "state", "contactMarkedAt"
    FROM "RefundExecutionDispatchAttempt"
    WHERE "commandId" = $1
    ORDER BY "id" ASC
    LIMIT 65
  `,
  preflightObservations: `
    SELECT "id", "bindingId"
    FROM "RefundExecutionEximbayPreflightObservation"
    WHERE "bindingId" = $1
    ORDER BY "id" ASC
    LIMIT 65
  `,
  eligibilityProofs: `
    SELECT "id", "bindingId"
    FROM "RefundExecutionProviderEligibilityProof"
    WHERE "bindingId" = $1
    LIMIT 65
  `,
  contactProofs: `
    SELECT "id", "dispatchAttemptId"
    FROM "RefundExecutionProviderContactEligibilityProof"
    WHERE "dispatchAttemptId" IN (
      SELECT "id" FROM "RefundExecutionDispatchAttempt" WHERE "commandId" = $1
    )
    LIMIT 65
  `,
  evidence: `
    SELECT "id", "commandId", "outcome"
    FROM "RefundExecutionEvidence"
    WHERE "commandId" = $1
    ORDER BY "id" ASC
    LIMIT 65
  `,
  transitions: `
    SELECT "id", "refundAttemptId", "fromStatus", "toStatus", "orderStatusBefore",
      "orderStatusAfter", "actorType", "actorUserId", "reason", "operationKey", "createdAt"
    FROM "RefundAttemptTransition"
    WHERE "refundAttemptId" = $1
    ORDER BY "createdAt" ASC, "id" ASC
    LIMIT 65
  `,
  outbox: `
    SELECT "id", "dedupKey"
    FROM "PaymentOutbox"
    WHERE "dedupKey" = $1
    LIMIT 65
  `,
  commit: "COMMIT",
  rollback: "ROLLBACK",
} as const);

export type RefundReadinessQuery = (
  sql: string,
  parameters?: readonly unknown[],
) => Promise<readonly Readonly<Record<string, unknown>>[]>;

type ParsedState = Readonly<{
  capturedAt: Date;
  payment: Readonly<Record<string, unknown>> | null;
  order: Readonly<Record<string, unknown>> | null;
  session: Readonly<Record<string, unknown>> | null;
  attempts: readonly Readonly<Record<string, unknown>>[];
  command: Readonly<Record<string, unknown>> | null;
  approval: Readonly<Record<string, unknown>> | null;
  bindings: readonly Readonly<Record<string, unknown>>[];
  authorizations: readonly Readonly<Record<string, unknown>>[];
  commandEvents: readonly Readonly<Record<string, unknown>>[];
  dispatchAttempts: readonly Readonly<Record<string, unknown>>[];
  preflightObservations: readonly Readonly<Record<string, unknown>>[];
  eligibilityProofs: readonly Readonly<Record<string, unknown>>[];
  contactProofs: readonly Readonly<Record<string, unknown>>[];
  evidence: readonly Readonly<Record<string, unknown>>[];
  transitions: readonly Readonly<Record<string, unknown>>[];
  outbox: readonly Readonly<Record<string, unknown>>[];
  truncated: boolean;
}>;

type LifecycleClassification = "HISTORICAL_ONLY" | "ACTIVE_BLOCKER" | "NONE";
type EffectPhase = "NORMAL_SUCCESS" | "FAILURE_ONLY" | "CLEANUP_ONLY";
type EffectBudget = Readonly<{
  max: number;
  whyRequired?: string;
  phase?: EffectPhase;
  sourceOwner?: string;
}>;

export type RefundReadinessBusinessStateReadbackResult = Readonly<{
  ok: true;
  code: typeof REFUND_READINESS_BUSINESS_STATE_READBACK_CODE;
  terminalResult: string;
  dbSnapshotTime: string;
  databaseUser: typeof REFUND_READINESS_BUSINESS_STATE_READBACK_ROLE;
  transactionIsolation: "repeatable read";
  transactionReadOnly: true;
  fixedTarget: typeof REFUND_READINESS_FIXED_TARGET;
  payment: Readonly<Record<string, unknown>> | null;
  order: Readonly<Record<string, unknown>> | null;
  refundAttempt: Readonly<Record<string, unknown>> | null;
  refundExecutionCommand: Readonly<Record<string, unknown>> | null;
  targetBinding: Readonly<{
    expectedDigest: string;
    recomputedDigest: string | null;
    digestMatches: boolean;
    exactRelationsMatch: boolean;
    exactMoneyMatches: boolean;
  }>;
  providerOperationBinding: Readonly<{
    id: string | null;
    coherent: boolean;
    familyKeyMatches: boolean;
    familyFingerprintMatches: boolean;
    merchantBindingMatches: boolean;
    credentialBindingMatches: boolean;
  }>;
  authorizationInventory: Readonly<{
    rowsTotal: number;
    currentGenerationRows: number;
    currentGenerationUnusedUnexpired: number;
    currentGenerationUnusedExpired: number;
    currentGenerationRevoked: number;
    currentGenerationConsumed: number;
    otherGenerationRows: number;
    nextRequirement: "USE_EXISTING_EXACT_AUTHORIZATION" | "REVOKE_EXPIRED_THEN_ISSUE_ONE_FRESH_AUTHORIZATION" | "ISSUE_ONE_FRESH_AUTHORIZATION" | "BLOCKED";
    preExecutionRevocationRequired: boolean;
    rows: readonly Readonly<Record<string, unknown>>[];
  }>;
  currentGeneration: number | null;
  leaseState: Readonly<{
    state: "NONE" | "ACTIVE" | "EXPIRED" | "OTHER";
    ownerPresent: boolean;
    acquiredAt: string | null;
    expiresAt: string | null;
    blocksNextExecution: boolean;
    generationTransitionRequired: "YES" | "NO" | "BLOCKED";
  }>;
  dispatch: Readonly<{
    attemptCount: number;
    evidenceCount: number;
    preflightObservationCount: number;
    providerContactState: "PROVEN_NONE" | "PROVEN_CONTACTED" | "AMBIGUOUS";
  }>;
  successfulRefundTotal: Readonly<{
    capturedAmountMinor: number | null;
    totalSuccessfulRefundMinor: number | null;
    remainingRefundableAmountMinor: number | null;
    targetRefundMinor: 100;
  }>;
  exactTargetAlreadyRefunded: "YES" | "NO" | "AMBIGUOUS";
  duplicateRefundRisk: "NONE" | "MATERIAL" | "AMBIGUOUS";
  activeBlockers: Readonly<{
    manualReview: LifecycleClassification;
    parked: LifecycleClassification;
    waitingEvidence: LifecycleClassification;
    systemicFailure: LifecycleClassification;
    unknownOrUnclassified: LifecycleClassification;
  }>;
  durableHistoryCoherent: "YES" | "NO" | "AMBIGUOUS";
  autonomousDownstreamEffects: readonly Readonly<Record<string, unknown>>[];
  proposedOneShotEffectUpperBounds: Readonly<Record<string, EffectBudget>>;
  currentStateMatchesExactRefundTarget: boolean;
  currentProviderStateSafeForOneShot: boolean;
  exactFutureEffectBudgetEstablished: boolean;
  readyForOneShotLiveRefundAuthorityDecision: boolean;
  providerEffects: 0;
  durableWrites: 0;
}>;

export async function readRefundReadinessBusinessState(
  query: RefundReadinessQuery,
): Promise<RefundReadinessBusinessStateReadbackResult> {
  await query(REFUND_READINESS_SQL.begin);
  try {
    const result = await collectRefundReadiness(query);
    await query(REFUND_READINESS_SQL.commit);
    return result;
  } catch (error) {
    await query(REFUND_READINESS_SQL.rollback).catch(() => undefined);
    throw error;
  }
}

async function collectRefundReadiness(
  query: RefundReadinessQuery,
): Promise<RefundReadinessBusinessStateReadbackResult> {
  const identity = exactOne(await query(REFUND_READINESS_SQL.identity), "IDENTITY");
  requireIdentity(identity);
  const target = REFUND_READINESS_FIXED_TARGET;
  const state: ParsedState = Object.freeze({
    capturedAt: dateValue(identity.capturedAt),
    payment: exactOptional(await query(REFUND_READINESS_SQL.payment, [target.paymentId]), "PAYMENT"),
    order: exactOptional(await query(REFUND_READINESS_SQL.order, [target.orderId]), "ORDER"),
    session: exactOptional(await query(REFUND_READINESS_SQL.session, [target.orderId]), "SESSION"),
    attempts: bounded(await query(REFUND_READINESS_SQL.attempts, [target.orderId, target.paymentId])),
    command: exactOptional(await query(REFUND_READINESS_SQL.command, [target.commandId]), "COMMAND"),
    approval: exactOptional(await query(REFUND_READINESS_SQL.approval, [target.commandId]), "APPROVAL"),
    bindings: bounded(await query(REFUND_READINESS_SQL.binding, [target.providerOperationBindingId, target.refundAttemptId])),
    authorizations: bounded(await query(REFUND_READINESS_SQL.authorizations, [target.commandId, target.refundAttemptId, target.providerOperationBindingId])),
    commandEvents: bounded(await query(REFUND_READINESS_SQL.commandEvents, [target.commandId])),
    dispatchAttempts: bounded(await query(REFUND_READINESS_SQL.dispatchAttempts, [target.commandId])),
    preflightObservations: bounded(await query(REFUND_READINESS_SQL.preflightObservations, [target.providerOperationBindingId])),
    eligibilityProofs: bounded(await query(REFUND_READINESS_SQL.eligibilityProofs, [target.providerOperationBindingId])),
    contactProofs: bounded(await query(REFUND_READINESS_SQL.contactProofs, [target.commandId])),
    evidence: bounded(await query(REFUND_READINESS_SQL.evidence, [target.commandId])),
    transitions: bounded(await query(REFUND_READINESS_SQL.transitions, [target.refundAttemptId])),
    outbox: bounded(await query(REFUND_READINESS_SQL.outbox, [REFUND_EMAIL_DEDUP_KEY])),
    truncated: false,
  });
  const truncated = [
    state.attempts, state.bindings, state.authorizations, state.commandEvents,
    state.dispatchAttempts, state.preflightObservations, state.eligibilityProofs,
    state.contactProofs, state.evidence, state.transitions, state.outbox,
  ].some((rows) => rows.length > MAX_ROWS);
  const boundedState = Object.freeze({ ...state, truncated });
  return adjudicate(boundedState);
}

function adjudicate(state: ParsedState): RefundReadinessBusinessStateReadbackResult {
  const target = REFUND_READINESS_FIXED_TARGET;
  const attempts = state.attempts.slice(0, MAX_ROWS);
  const targetAttempt = attempts.find((row) => row.id === target.refundAttemptId) ?? null;
  const commandGeneration = integerOrNull(state.command?.leaseGeneration);
  const binding = state.bindings.slice(0, MAX_ROWS).find((row) => row.id === target.providerOperationBindingId) ?? null;
  const targetBinding = classifyTargetBinding(state, targetAttempt, binding);
  const providerBinding = classifyProviderBinding(targetAttempt, state.payment, binding);
  const authorizationInventory = classifyAuthorizations(
    state.authorizations.slice(0, MAX_ROWS),
    commandGeneration,
    state.capturedAt,
  );
  const leaseState = classifyLease(state.command, state.commandEvents.slice(0, MAX_ROWS), state.capturedAt);
  const providerContactState = classifyProviderContact(state);
  const refundTotal = calculateRefundTotal(state.payment, attempts);
  const alreadyRefunded = classifyAlreadyRefunded(targetAttempt, state.evidence.slice(0, MAX_ROWS));
  const blockers = classifyBlockers(targetAttempt, state.command);
  const history = classifyHistory(state, targetAttempt, binding, refundTotal);
  const currentStateMatches = targetBinding.digestMatches
    && targetBinding.exactRelationsMatch
    && targetBinding.exactMoneyMatches
    && providerBinding.coherent
    && exactFinancialState(state.payment, state.order, targetAttempt, state.command)
    && exactInitialTargetHistory(state, targetAttempt)
    && state.approval?.id === target.historicalApprovalId
    && state.approval?.formatVersion === "mira-refund-eximbay-sandbox-canary-approval/v1"
    && state.approval?.provider === PaymentProvider.EXIMBAY
    && state.approval?.mode === PaymentMode.SANDBOX
    && state.approval?.targetBindingDigest === target.targetBindingDigest
    && state.approval?.consumedAt instanceof Date;
  const providerSafe = providerContactState === "PROVEN_NONE";
  const noActiveBlocker = Object.values(blockers).every((value) => value !== "ACTIVE_BLOCKER");
  const budget = effectBudget(state, authorizationInventory, currentStateMatches);
  const budgetEstablished = Object.values(budget).every((entry) => (
    Number.isInteger(entry.max) && entry.max >= 0
  ));
  const duplicateRisk = alreadyRefunded === "YES"
    || (refundTotal.remainingRefundableAmountMinor !== null
      && refundTotal.remainingRefundableAmountMinor < target.amount)
    || providerContactState === "PROVEN_CONTACTED"
    ? "MATERIAL"
    : alreadyRefunded === "NO" && providerSafe && history === "YES"
      ? "NONE"
      : "AMBIGUOUS";
  const ready = [
    !state.truncated,
    currentStateMatches,
    leaseState.state === "EXPIRED",
    !leaseState.blocksNextExecution,
    authorizationInventory.nextRequirement !== "BLOCKED",
    providerSafe,
    alreadyRefunded === "NO",
    duplicateRisk === "NONE",
    noActiveBlocker,
    history === "YES",
    budgetEstablished,
  ].every(Boolean);
  return Object.freeze({
    ok: true,
    code: REFUND_READINESS_BUSINESS_STATE_READBACK_CODE,
    terminalResult: terminalResult(state, currentStateMatches, authorizationInventory, leaseState, providerContactState, alreadyRefunded, blockers, history, budgetEstablished, ready),
    dbSnapshotTime: state.capturedAt.toISOString(),
    databaseUser: REFUND_READINESS_BUSINESS_STATE_READBACK_ROLE,
    transactionIsolation: "repeatable read",
    transactionReadOnly: true,
    fixedTarget: target,
    payment: paymentOutput(state.payment),
    order: orderOutput(state.order),
    refundAttempt: attemptOutput(targetAttempt),
    refundExecutionCommand: commandOutput(state.command),
    targetBinding,
    providerOperationBinding: providerBinding,
    authorizationInventory,
    currentGeneration: commandGeneration,
    leaseState,
    dispatch: Object.freeze({
      attemptCount: state.dispatchAttempts.length,
      evidenceCount: state.evidence.length,
      preflightObservationCount: state.preflightObservations.length,
      providerContactState,
    }),
    successfulRefundTotal: refundTotal,
    exactTargetAlreadyRefunded: alreadyRefunded,
    duplicateRefundRisk: duplicateRisk,
    activeBlockers: blockers,
    durableHistoryCoherent: history,
    autonomousDownstreamEffects: downstreamEffects(state),
    proposedOneShotEffectUpperBounds: budget,
    currentStateMatchesExactRefundTarget: currentStateMatches,
    currentProviderStateSafeForOneShot: providerSafe,
    exactFutureEffectBudgetEstablished: budgetEstablished,
    readyForOneShotLiveRefundAuthorityDecision: ready,
    providerEffects: 0,
    durableWrites: 0,
  });
}

function classifyTargetBinding(
  state: ParsedState,
  attempt: Readonly<Record<string, unknown>> | null,
  binding: Readonly<Record<string, unknown>> | null,
) {
  const target = REFUND_READINESS_FIXED_TARGET;
  const exactRelationsMatch = state.payment?.id === target.paymentId
    && state.order?.id === target.orderId
    && state.order?.paymentId === target.paymentId
    && attempt?.id === target.refundAttemptId
    && attempt?.orderId === target.orderId
    && attempt?.paymentId === target.paymentId
    && state.command?.id === target.commandId
    && state.command?.refundAttemptId === target.refundAttemptId
    && binding?.id === target.providerOperationBindingId
    && binding?.refundAttemptId === target.refundAttemptId;
  const exactMoneyMatches = state.payment?.amount === target.amount
    && state.payment?.currency === target.currency
    && state.order?.totalAmount === target.amount
    && state.order?.currency === target.currency
    && attempt?.amount === target.amount
    && attempt?.currency === target.currency;
  const recomputedDigest = recomputeTargetDigest(state.payment, attempt, binding);
  return Object.freeze({
    expectedDigest: target.targetBindingDigest,
    recomputedDigest,
    digestMatches: recomputedDigest === target.targetBindingDigest,
    exactRelationsMatch,
    exactMoneyMatches,
  });
}

function recomputeTargetDigest(
  payment: Readonly<Record<string, unknown>> | null,
  attempt: Readonly<Record<string, unknown>> | null,
  binding: Readonly<Record<string, unknown>> | null,
): string | null {
  const target = REFUND_READINESS_FIXED_TARGET;
  if (!payment || !attempt || !binding || typeof payment.providerPaymentKey !== "string"
    || typeof attempt.idempotencyKey !== "string") return null;
  try {
    return calculateEximbayCanaryTargetDigest({
      commandId: target.commandId,
      refundAttemptId: target.refundAttemptId,
      paymentId: target.paymentId,
      providerOperationBindingId: target.providerOperationBindingId,
      amount: numberValue(attempt.amount),
      currency: stringValue(attempt.currency),
      idempotencyKey: attempt.idempotencyKey,
      providerOrderId: optionalString(payment.providerOrderId),
      providerPaymentKey: payment.providerPaymentKey,
      financialSucceededAt: optionalDate(payment.financialSucceededAt),
      providerOperationFamilyKey: stringValue(binding.providerOperationKey),
      operationFamilyFingerprint: stringValue(binding.wireRequestFingerprint),
      merchantAccountBindingId: stringValue(binding.merchantAccountBindingId),
      credentialGenerationBindingId: stringValue(binding.credentialGenerationBindingId),
      syntheticProvenanceDigest: target.syntheticProvenanceDigest,
    });
  } catch {
    return null;
  }
}

function classifyProviderBinding(
  attempt: Readonly<Record<string, unknown>> | null,
  payment: Readonly<Record<string, unknown>> | null,
  binding: Readonly<Record<string, unknown>> | null,
) {
  const target = REFUND_READINESS_FIXED_TARGET;
  const familyKeyMatches = binding?.providerOperationKey === target.providerOperationFamilyKey
    && typeof attempt?.idempotencyKey === "string"
    && typeof payment?.providerPaymentKey === "string";
  const familyFingerprintMatches = binding?.wireRequestFingerprint === target.operationFamilyFingerprint
    && typeof attempt?.idempotencyKey === "string"
    && typeof payment?.providerPaymentKey === "string";
  const merchantBindingMatches = binding?.merchantAccountBindingId === target.merchantAccountBindingId;
  const credentialBindingMatches = binding?.credentialGenerationBindingId === target.credentialGenerationBindingId;
  const coherent = binding?.id === target.providerOperationBindingId
    && binding?.refundAttemptId === target.refundAttemptId
    && binding?.provider === PaymentProvider.EXIMBAY
    && binding?.mode === PaymentMode.SANDBOX
    && binding?.operationKeyAlgorithmVersion === EXIMBAY_REFUND_OPERATION_FAMILY_VERSION
    && binding?.wireContractVersion === EXIMBAY_REFUND_CANCEL_WIRE_VERSION
    && familyKeyMatches && familyFingerprintMatches
    && merchantBindingMatches && credentialBindingMatches;
  return Object.freeze({
    id: typeof binding?.id === "string" ? binding.id : null,
    coherent,
    familyKeyMatches,
    familyFingerprintMatches,
    merchantBindingMatches,
    credentialBindingMatches,
  });
}

function classifyAuthorizations(
  rows: readonly Readonly<Record<string, unknown>>[],
  generation: number | null,
  capturedAt: Date,
) {
  const target = REFUND_READINESS_FIXED_TARGET;
  const summaries = rows.map((row) => {
    const rowGeneration = integerOrNull(row.expectedPredecessorGeneration);
    const expiredAtSnapshot = dateValue(row.expiresAt).getTime() <= capturedAt.getTime();
    const exact = row.commandId === target.commandId
      && row.refundAttemptId === target.refundAttemptId
      && row.providerOperationBindingId === target.providerOperationBindingId
      && row.targetBindingDigest === target.targetBindingDigest
      && row.operationClass === REFUND_REENTRY_OPERATION
      && row.releasePolicyDigest === target.executionReleasePolicyDigest;
    const consumed = row.consumedAt instanceof Date;
    const revoked = row.revokedAt instanceof Date;
    const state = consumed ? "CONSUMED" : revoked ? "REVOKED" : expiredAtSnapshot ? "EXPIRED" : "UNUSED";
    const current = generation !== null && rowGeneration === generation;
    return Object.freeze({
      id: stringValue(row.id),
      commandId: stringValue(row.commandId),
      generation: rowGeneration,
      targetBindingDigest: stringValue(row.targetBindingDigest),
      releasePolicyDigest: stringValue(row.releasePolicyDigest),
      state,
      issuedAt: dateValue(row.issuedAt).toISOString(),
      expiresAt: dateValue(row.expiresAt).toISOString(),
      consumedAt: optionalIso(row.consumedAt),
      revokedAt: optionalIso(row.revokedAt),
      expiredAtSnapshot,
      usableUnderCurrentInstalledSource: exact && current && state === "UNUSED",
      exact,
      current,
    });
  });
  const currentRows = summaries.filter((row) => row.current);
  const counts = {
    unused: currentRows.filter((row) => row.state === "UNUSED" && row.exact).length,
    expired: currentRows.filter((row) => row.state === "EXPIRED" && row.exact).length,
    revoked: currentRows.filter((row) => row.state === "REVOKED" && row.exact).length,
    consumed: currentRows.filter((row) => row.state === "CONSUMED" && row.exact).length,
  };
  const malformed = summaries.some((row) => !row.exact || row.generation === null);
  let nextRequirement: "USE_EXISTING_EXACT_AUTHORIZATION" | "REVOKE_EXPIRED_THEN_ISSUE_ONE_FRESH_AUTHORIZATION" | "ISSUE_ONE_FRESH_AUTHORIZATION" | "BLOCKED";
  if (generation === null || malformed || counts.unused > 1 || counts.expired > 1
    || counts.consumed > 0 || (counts.unused > 0 && counts.expired > 0)) nextRequirement = "BLOCKED";
  else if (counts.unused === 1) nextRequirement = "USE_EXISTING_EXACT_AUTHORIZATION";
  else if (counts.expired === 1) nextRequirement = "REVOKE_EXPIRED_THEN_ISSUE_ONE_FRESH_AUTHORIZATION";
  else nextRequirement = "ISSUE_ONE_FRESH_AUTHORIZATION";
  return Object.freeze({
    rowsTotal: summaries.length,
    currentGenerationRows: currentRows.length,
    currentGenerationUnusedUnexpired: counts.unused,
    currentGenerationUnusedExpired: counts.expired,
    currentGenerationRevoked: counts.revoked,
    currentGenerationConsumed: counts.consumed,
    otherGenerationRows: summaries.length - currentRows.length,
    nextRequirement,
    preExecutionRevocationRequired: nextRequirement === "REVOKE_EXPIRED_THEN_ISSUE_ONE_FRESH_AUTHORIZATION",
    rows: Object.freeze(summaries),
  });
}

function classifyLease(
  command: Readonly<Record<string, unknown>> | null,
  events: readonly Readonly<Record<string, unknown>>[],
  capturedAt: Date,
) {
  if (!command) return Object.freeze({
    state: "OTHER" as const, ownerPresent: false, acquiredAt: null, expiresAt: null,
    blocksNextExecution: true, generationTransitionRequired: "BLOCKED" as const,
  });
  const generation = integerOrNull(command.leaseGeneration);
  const ownerPresent = typeof command.leaseOwner === "string" && command.leaseOwner.trim().length > 0;
  const expires = optionalDate(command.leaseUntil);
  const tokenHashValid = typeof command.leaseTokenHash === "string" && SHA256.test(command.leaseTokenHash);
  const fullLease = command.status === RefundExecutionCommandStatus.LEASED
    && generation !== null && generation >= 1 && ownerPresent && expires !== null && tokenHashValid;
  const allAbsent = command.leaseOwner === null && command.leaseUntil === null && command.leaseTokenHash === null;
  const state = fullLease ? (expires.getTime() <= capturedAt.getTime() ? "EXPIRED" : "ACTIVE")
    : allAbsent ? "NONE" : "OTHER";
  const acquisition = generation === null ? null : [...events].reverse().find((event) => (
    event.eventType === RefundExecutionCommandEventType.LEASE_ACQUIRED
      && event.leaseGeneration === generation
  ));
  return Object.freeze({
    state,
    ownerPresent,
    acquiredAt: acquisition ? dateValue(acquisition.occurredAt).toISOString() : null,
    expiresAt: expires?.toISOString() ?? null,
    blocksNextExecution: state === "ACTIVE" || state === "OTHER",
    generationTransitionRequired: state === "EXPIRED" ? "YES" as const
      : state === "NONE" ? "NO" as const : "BLOCKED" as const,
  });
}

function classifyProviderContact(state: ParsedState): "PROVEN_NONE" | "PROVEN_CONTACTED" | "AMBIGUOUS" {
  const dispatches = state.dispatchAttempts.slice(0, MAX_ROWS);
  const contradictory = dispatches.some((row) => (
    row.state === RefundExecutionDispatchAttemptState.AUTHORIZED && row.contactMarkedAt !== null
  ) || (
    row.state === RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED
      && !(row.contactMarkedAt instanceof Date)
  ));
  if (state.truncated || contradictory || state.eligibilityProofs.length > 0
    && state.preflightObservations.length === 0) return "AMBIGUOUS";
  if (dispatches.some((row) => row.state === RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED
    || row.contactMarkedAt instanceof Date) || state.evidence.length > 0
    || state.contactProofs.length > 0 || state.preflightObservations.length > 0) {
    return "PROVEN_CONTACTED";
  }
  return dispatches.length === 0 && state.preflightObservations.length === 0
    && state.command?.dispatchAttempt === 0 ? "PROVEN_NONE" : "AMBIGUOUS";
}

function calculateRefundTotal(
  payment: Readonly<Record<string, unknown>> | null,
  attempts: readonly Readonly<Record<string, unknown>>[],
) {
  if (!payment) return Object.freeze({
    capturedAmountMinor: null, totalSuccessfulRefundMinor: null,
    remainingRefundableAmountMinor: null, targetRefundMinor: 100 as const,
  });
  try {
    const captured = numberValue(payment.amount);
    const normalized = attempts.map((row) => ({
      paymentId: stringValue(row.paymentId), currency: stringValue(row.currency),
      provider: providerValue(row.provider), mode: modeValue(row.mode),
      amount: numberValue(row.amount), status: attemptStatusValue(row.status),
    }));
    if (!hasConsistentRefundAttemptLedgerIdentity({
      id: stringValue(payment.id), currency: stringValue(payment.currency),
      provider: providerValue(payment.provider), mode: modeValue(payment.mode),
    }, normalized)) throw new Error("LEDGER_IDENTITY_INVALID");
    const succeeded = sumSucceededRefundAmount(normalized);
    if (succeeded > captured) throw new Error("OVER_REFUND");
    return Object.freeze({
      capturedAmountMinor: captured,
      totalSuccessfulRefundMinor: succeeded,
      remainingRefundableAmountMinor: captured - succeeded,
      targetRefundMinor: 100 as const,
    });
  } catch {
    return Object.freeze({
      capturedAmountMinor: integerOrNull(payment.amount), totalSuccessfulRefundMinor: null,
      remainingRefundableAmountMinor: null, targetRefundMinor: 100 as const,
    });
  }
}

function classifyAlreadyRefunded(
  attempt: Readonly<Record<string, unknown>> | null,
  evidence: readonly Readonly<Record<string, unknown>>[],
): "YES" | "NO" | "AMBIGUOUS" {
  if (!attempt) return "AMBIGUOUS";
  const succeededEvidence = evidence.filter((row) => row.outcome === RefundExecutionEvidenceOutcome.SUCCEEDED);
  const attemptSucceeded = attempt.status === RefundAttemptStatus.SUCCEEDED;
  const providerIdPresent = typeof attempt.providerRefundId === "string" && attempt.providerRefundId.length > 0;
  if (attemptSucceeded && providerIdPresent && succeededEvidence.length === 1) return "YES";
  if (attempt.status === RefundAttemptStatus.PROCESSING && !providerIdPresent && succeededEvidence.length === 0) return "NO";
  return "AMBIGUOUS";
}

function classifyBlockers(
  attempt: Readonly<Record<string, unknown>> | null,
  command: Readonly<Record<string, unknown>> | null,
) {
  const attemptStatus = attempt?.status;
  const commandStatus = command?.status;
  return Object.freeze({
    manualReview: lifecycle(attemptStatus === RefundAttemptStatus.MANUAL_REVIEW, false),
    parked: lifecycle(commandStatus === RefundExecutionCommandStatus.PARKED, false),
    waitingEvidence: lifecycle(
      commandStatus === RefundExecutionCommandStatus.WAITING_EVIDENCE
        || commandStatus === RefundExecutionCommandStatus.WAITING_RETRY,
      false,
    ),
    systemicFailure: lifecycle(
      typeof command?.lastSafeErrorCode === "string"
        && /(?:SYSTEMIC|INTERNAL)/u.test(command.lastSafeErrorCode),
      false,
    ),
    unknownOrUnclassified: lifecycle(
      !attempt || !command || !isRefundAttemptStatus(attemptStatus)
        || !isRefundExecutionCommandStatus(commandStatus),
      false,
    ),
  });
}

function classifyHistory(
  state: ParsedState,
  targetAttempt: Readonly<Record<string, unknown>> | null,
  binding: Readonly<Record<string, unknown>> | null,
  refundTotal: RefundReadinessBusinessStateReadbackResult["successfulRefundTotal"],
): "YES" | "NO" | "AMBIGUOUS" {
  if (state.truncated || !state.command || !targetAttempt || !binding
    || refundTotal.totalSuccessfulRefundMinor === null) return "AMBIGUOUS";
  try {
    const generation = numberValue(state.command.leaseGeneration);
    const events = state.commandEvents.map((row) => ({
      id: stringValue(row.id), commandId: stringValue(row.commandId),
      eventType: eventTypeValue(row.eventType), leaseGeneration: numberValue(row.leaseGeneration),
      dispatchAttempt: numberValue(row.dispatchAttempt), occurredAt: dateValue(row.occurredAt),
      createdAt: dateValue(row.createdAt),
    }));
    const leaseHistory = hasCoherentUncontactedLeaseEventHistory(
      REFUND_READINESS_FIXED_TARGET.commandId,
      generation,
      events,
      false,
    );
    const transitionCoherent = state.transitions.every((row) => (
      row.refundAttemptId === REFUND_READINESS_FIXED_TARGET.refundAttemptId
        && row.createdAt instanceof Date
    ));
    const authorizationEventCoherent = state.authorizations.every((row) => (
      row.consumedLeaseEventId === null || state.commandEvents.some((event) => (
        event.id === row.consumedLeaseEventId
          && event.eventType === RefundExecutionCommandEventType.LEASE_ACQUIRED
      ))
    ));
    return leaseHistory && transitionCoherent && authorizationEventCoherent ? "YES" : "NO";
  } catch {
    return "AMBIGUOUS";
  }
}

function exactFinancialState(
  payment: Readonly<Record<string, unknown>> | null,
  order: Readonly<Record<string, unknown>> | null,
  attempt: Readonly<Record<string, unknown>> | null,
  command: Readonly<Record<string, unknown>> | null,
): boolean {
  return payment?.provider === PaymentProvider.EXIMBAY
    && payment.mode === PaymentMode.SANDBOX
    && payment.adapterExecutionKind === PaymentAdapterExecutionKind.EXTERNAL
    && payment.status === PaymentAttemptStatus.SUCCEEDED
    && payment.attemptLifecycle === PaymentAttemptLifecycle.FINALIZED
    && payment.financialSucceededAt instanceof Date
    && typeof payment.providerOrderId === "string" && payment.providerOrderId.length > 0
    && typeof payment.providerPaymentKey === "string" && payment.providerPaymentKey.length > 0
    && order?.status === OrderStatus.REFUND_PENDING
    && attempt?.status === RefundAttemptStatus.PROCESSING
    && attempt.actorType === RefundAttemptActorType.SYSTEM
    && attempt.actorUserId === null
    && attempt.provider === PaymentProvider.EXIMBAY
    && attempt.mode === PaymentMode.SANDBOX
    && attempt.providerRefundId === null
    && attempt.processedAt === null
    && attempt.failedAt === null
    && attempt.failureCode === null
    && attempt.safeFailureMessage === null
    && command?.status === RefundExecutionCommandStatus.LEASED
    && command.dispatchAttempt === 0
    && command.lastSafeErrorCode === null
    && command.lastSafeErrorMessage === null;
}

function exactInitialTargetHistory(
  state: ParsedState,
  attempt: Readonly<Record<string, unknown>> | null,
): boolean {
  if (!attempt || !state.command || state.transitions.length !== 2) return false;
  const creation = state.transitions.find((row) => row.fromStatus === null);
  const claim = state.transitions.find((row) => row.fromStatus === RefundAttemptStatus.REQUESTED);
  const target = REFUND_READINESS_FIXED_TARGET;
  const reason = "Attended fresh synthetic Eximbay SANDBOX canary full refund.";
  return attempt.idempotencyKey === `refund:${target.paymentId}:${target.refundAttemptId}`
    && attempt.reason === reason
    && creation?.refundAttemptId === target.refundAttemptId
    && creation.toStatus === RefundAttemptStatus.REQUESTED
    && creation.orderStatusBefore === OrderStatus.PAID
    && creation.orderStatusAfter === OrderStatus.REFUND_PENDING
    && creation.actorType === RefundAttemptActorType.SYSTEM
    && creation.actorUserId === null
    && creation.reason === reason
    && creation.operationKey === `refund-request:${target.refundAttemptId}`
    && creation.createdAt instanceof Date
    && attempt.requestedAt instanceof Date
    && creation.createdAt.getTime() === attempt.requestedAt.getTime()
    && claim?.refundAttemptId === target.refundAttemptId
    && claim.toStatus === RefundAttemptStatus.PROCESSING
    && claim.orderStatusBefore === OrderStatus.REFUND_PENDING
    && claim.orderStatusAfter === OrderStatus.REFUND_PENDING
    && claim.actorType === RefundAttemptActorType.SYSTEM
    && claim.actorUserId === null
    && claim.reason === "Refund execution claimed."
    && claim.operationKey === `refund-exec-claim:${target.commandId}`
    && claim.createdAt instanceof Date
    && state.command.availableAt instanceof Date
    && claim.createdAt.getTime() === state.command.availableAt.getTime();
}

function downstreamEffects(state: ParsedState): readonly Readonly<Record<string, unknown>>[] {
  const locale = state.session?.communicationLocale;
  const emailIntentExpected = locale === "ko" || locale === "en" || locale === "ja";
  return Object.freeze([
    effect("RefundExecutionEvidence", "provider success persistence", true, false, true, false, true),
    effect("RefundAttempt status/provider result", "provider success persistence", true, false, true, false, true),
    effect("Order refund status", "provider success persistence", true, false, true, false, true),
    effect("RefundAttemptTransition", "successful terminal attempt transition", true, false, true, false, true),
    effect("RefundExecutionCommand DONE/lease clear", "provider success persistence", true, false, true, false, true),
    effect("PaymentEvent", "none in installed refund-success owner", false, false, false, true, false),
    effect("PaymentOutbox refund-success email intent", "valid CheckoutSession communicationLocale", emailIntentExpected, false, true, true, emailIntentExpected),
    effect("external refund-success email", "separate outbox dispatcher", false, true, false, true, false),
    effect("webhook/analytics publish", "no installed automatic refund-success owner", false, false, false, true, false),
  ]);
}

function effect(
  name: string,
  trigger: string,
  durableWrite: boolean,
  externalEffect: boolean,
  automaticAfterRefundSuccess: boolean,
  separatelyGated: boolean,
  expectedForThisTarget: boolean,
) {
  return Object.freeze({
    effect: name, trigger, durableWrite, externalEffect,
    automaticAfterRefundSuccess, separatelyGated, expectedForThisTarget,
  });
}

function effectBudget(
  state: ParsedState,
  authorization: RefundReadinessBusinessStateReadbackResult["authorizationInventory"],
  targetMatches: boolean,
): Readonly<Record<string, EffectBudget>> {
  const locale = state.session?.communicationLocale;
  const outboxExpected = (locale === "ko" || locale === "en" || locale === "ja")
    && state.outbox.length === 0;
  const issuance = authorization.nextRequirement === "USE_EXISTING_EXACT_AUTHORIZATION" ? 0
    : authorization.nextRequirement === "BLOCKED" ? -1 : 1;
  const revocation = authorization.preExecutionRevocationRequired ? 1
    : authorization.nextRequirement === "BLOCKED" ? -1 : 0;
  const financial = targetMatches ? 1 : -1;
  return Object.freeze({
    APPLICATION_ACTIVATION_DEPLOYMENTS_MAX: budget(1, "Temporarily enable the installed application admission gate.", "NORMAL_SUCCESS", "application-only deployment path"),
    APPLICATION_NORMAL_CLEANUP_DEPLOYMENTS_MAX: budget(1, "Return the application gate to DISABLED after a terminal normal result.", "CLEANUP_ONLY", "application-only deployment path"),
    APPLICATION_AMBIGUITY_CLEANUP_DEPLOYMENTS_MAX: budget(1, "Return the application gate to DISABLED after an ambiguous or failed execution.", "CLEANUP_ONLY", "application-only deployment path"),
    NEW_APPLICATION_REVISIONS_MAX: budget(2, "One activation revision and one mutually exclusive cleanup revision.", "CLEANUP_ONLY", "Cloud Run application deployment"),
    AUTHORIZATION_ISSUANCES_MAX: issuance < 0 ? budget(-1) : issuance === 0 ? budget(0) : budget(1, "Create one current-generation one-use authority when no usable exact grant exists.", "NORMAL_SUCCESS", "authorization/admin.ts"),
    AUTHORIZATION_REVOCATIONS_MAX: revocation < 0 ? budget(-1) : revocation === 0 ? budget(0) : budget(1, "Retire the single expired current-generation slot before replacement issuance.", "NORMAL_SUCCESS", "authorization/admin.ts"),
    AUTHORIZATION_CONSUMPTIONS_MAX: budget(financial, "Consume the one selected grant atomically with takeover.", "NORMAL_SUCCESS", "authorization/admission.ts"),
    GENERATION_TRANSITIONS_MAX: budget(financial, "Take over the exact expired predecessor lease once.", "NORMAL_SUCCESS", "uncontacted-recovery-persistence.ts"),
    LEASE_ACQUISITIONS_MAX: budget(financial, "The admitted takeover establishes one fresh lease.", "NORMAL_SUCCESS", "uncontacted-recovery-persistence.ts"),
    LEASE_EVENT_INSERTS_MAX: budget(financial, "The takeover appends one LEASE_ACQUIRED event.", "NORMAL_SUCCESS", "uncontacted-recovery-persistence.ts"),
    WORKER_EXECUTION_CREATE_INVOCATIONS_MAX: budget(1, "Create the single authorized Cloud Run worker execution.", "NORMAL_SUCCESS", "Cloud Run Job invocation"),
    WORKER_EXECUTIONS_MAX: budget(1, "The reviewed Job has one task and one execution pass.", "NORMAL_SUCCESS", "mira-eximbay-refund-canary"),
    WORKER_RETRIES_MAX: budget(0),
    DISPATCH_ATTEMPT_INSERTS_MAX: budget(financial, "Authorize only physical ordinal R1 before contact.", "NORMAL_SUCCESS", "providers/eximbay/authorize-first-dispatch.ts"),
    PRE_REFUND_PROVIDER_RETRIEVES_MAX: budget(financial, "Observe refundable Eximbay state before R1 authorization.", "NORMAL_SUCCESS", "providers/eximbay/preflight-retrieve.ts"),
    REFUND_TRANSPORT_INVOCATIONS_MAX: budget(financial, "Submit at most the one authorized R1 cancel.", "NORMAL_SUCCESS", "providers/eximbay/execute-contact.ts"),
    REFUND_TRANSPORT_RETRIES_MAX: budget(0),
    POST_REFUND_PROVIDER_RETRIEVES_MAX: budget(0),
    PROVIDER_RECONCILIATIONS_MAX: budget(0),
    REFUND_ATTEMPT_WRITES_MAX: budget(financial, "Finalize the exact attempt after provider success.", "NORMAL_SUCCESS", "execution-result-persistence.ts"),
    ORDER_WRITES_MAX: budget(financial, "Project the successful refund into the Order status.", "NORMAL_SUCCESS", "execution-result-persistence.ts"),
    PAYMENT_WRITES_MAX: budget(0),
    PAYMENT_OR_REFUND_EVENT_INSERTS_MAX: budget(financial < 0 ? -1 : financial * 2, "Persist one provider evidence row and one refund-attempt transition.", "NORMAL_SUCCESS", "execution-result-persistence.ts"),
    OUTBOX_INSERTS_MAX: outboxExpected ? budget(1, "Queue the installed refund-success email intent for a valid locale.", "NORMAL_SUCCESS", "payment/email/intent.ts") : budget(0),
    EXTERNAL_EMAIL_SENDS_MAX: budget(0),
    OTHER_EXTERNAL_EFFECTS_MAX: budget(0),
  });
}

function budget(max: number, whyRequired?: string, phase?: EffectPhase, sourceOwner?: string): EffectBudget {
  return Object.freeze({ max, ...(whyRequired ? { whyRequired, phase, sourceOwner } : {}) });
}

function terminalResult(
  state: ParsedState,
  currentStateMatches: boolean,
  authorization: RefundReadinessBusinessStateReadbackResult["authorizationInventory"],
  lease: RefundReadinessBusinessStateReadbackResult["leaseState"],
  providerContact: RefundReadinessBusinessStateReadbackResult["dispatch"]["providerContactState"],
  refunded: RefundReadinessBusinessStateReadbackResult["exactTargetAlreadyRefunded"],
  blockers: RefundReadinessBusinessStateReadbackResult["activeBlockers"],
  history: RefundReadinessBusinessStateReadbackResult["durableHistoryCoherent"],
  budgetEstablished: boolean,
  ready: boolean,
): string {
  if (ready) return "READY";
  if (!state.payment || !state.order || !state.command) return "TARGET_MISSING";
  if (authorization.nextRequirement === "BLOCKED") return "AUTHORIZATION_STATE_AMBIGUOUS";
  if (lease.state === "ACTIVE") return "ACTIVE_LEASE_BLOCKER";
  if (blockers.manualReview === "ACTIVE_BLOCKER") return "ACTIVE_MANUAL_REVIEW";
  if (blockers.parked === "ACTIVE_BLOCKER") return "ACTIVE_PARKED";
  if (blockers.waitingEvidence === "ACTIVE_BLOCKER") return "ACTIVE_WAITING_EVIDENCE";
  if (refunded === "YES") return "ALREADY_REFUNDED_OR_AMBIGUOUS";
  if (providerContact !== "PROVEN_NONE") return "PROVIDER_CONTACT_AMBIGUOUS";
  if (refunded !== "NO") return "ALREADY_REFUNDED_OR_AMBIGUOUS";
  if (!currentStateMatches) return "TARGET_BINDING_MISMATCH";
  if (history !== "YES") return "DURABLE_HISTORY_AMBIGUOUS";
  if (!budgetEstablished) return "EFFECT_BUDGET_UNESTABLISHED";
  return "TARGET_BINDING_MISMATCH";
}

function paymentOutput(row: Readonly<Record<string, unknown>> | null) {
  if (!row) return null;
  return Object.freeze({
    id: row.id, checkoutSessionId: row.checkoutSessionId, provider: row.provider,
    mode: row.mode, adapterExecutionKind: row.adapterExecutionKind, status: row.status,
    attemptLifecycle: row.attemptLifecycle, amount: row.amount, currency: row.currency,
    providerOrderIdPresent: typeof row.providerOrderId === "string",
    providerOrderIdSha256: digestOptional(row.providerOrderId),
    providerPaymentKeyPresent: typeof row.providerPaymentKey === "string",
    providerPaymentKeySha256: digestOptional(row.providerPaymentKey),
    financialSucceededAt: optionalIso(row.financialSucceededAt),
  });
}

function orderOutput(row: Readonly<Record<string, unknown>> | null) {
  if (!row) return null;
  return Object.freeze({
    id: row.id, checkoutSessionId: row.checkoutSessionId, paymentId: row.paymentId,
    currency: row.currency, totalAmount: row.totalAmount, status: row.status,
  });
}

function attemptOutput(row: Readonly<Record<string, unknown>> | null) {
  if (!row) return null;
  return Object.freeze({
    id: row.id, orderId: row.orderId, paymentId: row.paymentId, amount: row.amount,
    currency: row.currency, status: row.status, actorType: row.actorType,
    actorUserId: row.actorUserId, provider: row.provider, mode: row.mode,
    providerRefundIdPresent: typeof row.providerRefundId === "string",
    processedAt: optionalIso(row.processedAt), failedAt: optionalIso(row.failedAt),
    failureCode: row.failureCode,
  });
}

function commandOutput(row: Readonly<Record<string, unknown>> | null) {
  if (!row) return null;
  return Object.freeze({
    id: row.id, refundAttemptId: row.refundAttemptId, status: row.status,
    availableAt: optionalIso(row.availableAt), leaseOwner: row.leaseOwner,
    leaseUntil: optionalIso(row.leaseUntil), leaseGeneration: row.leaseGeneration,
    leaseTokenHashPresent: typeof row.leaseTokenHash === "string", dispatchAttempt: row.dispatchAttempt,
    lastSafeErrorCode: row.lastSafeErrorCode,
  });
}

function requireIdentity(row: Readonly<Record<string, unknown>>): void {
  if (row.currentUser !== REFUND_READINESS_BUSINESS_STATE_READBACK_ROLE
    || row.currentDatabase !== DATABASE_NAME
    || row.transactionReadOnly !== "on"
    || row.transactionIsolation !== "repeatable read") {
    throw new Error("REFUND_READINESS_DATABASE_IDENTITY_INVALID");
  }
}

function bounded(rows: readonly Readonly<Record<string, unknown>>[]) {
  return Object.freeze(rows.slice(0, MAX_ROWS + 1));
}

function exactOne(rows: readonly Readonly<Record<string, unknown>>[], label: string) {
  if (rows.length !== 1 || !rows[0]) throw new Error(`REFUND_READINESS_${label}_AMBIGUOUS`);
  return rows[0];
}

function exactOptional(rows: readonly Readonly<Record<string, unknown>>[], label: string) {
  if (rows.length > 1) throw new Error(`REFUND_READINESS_${label}_AMBIGUOUS`);
  return rows[0] ?? null;
}

function lifecycle(active: boolean, historical: boolean): LifecycleClassification {
  return active ? "ACTIVE_BLOCKER" : historical ? "HISTORICAL_ONLY" : "NONE";
}

function dateValue(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("REFUND_READINESS_DATE_INVALID");
  }
  return value;
}

function optionalDate(value: unknown): Date | null {
  return value === null || value === undefined ? null : dateValue(value);
}

function optionalIso(value: unknown): string | null {
  return optionalDate(value)?.toISOString() ?? null;
}

function stringValue(value: unknown): string {
  if (typeof value !== "string") throw new Error("REFUND_READINESS_STRING_INVALID");
  return value;
}

function optionalString(value: unknown): string | null {
  if (value === null) return null;
  return stringValue(value);
}

function numberValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error("REFUND_READINESS_NUMBER_INVALID");
  }
  return value;
}

function integerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function providerValue(value: unknown): PaymentProvider {
  switch (value) {
    case PaymentProvider.MOCK:
    case PaymentProvider.TOSS:
    case PaymentProvider.PAYPAL:
    case PaymentProvider.EXIMBAY:
      return value;
    default:
      throw new Error("REFUND_READINESS_PROVIDER_INVALID");
  }
}

function modeValue(value: unknown): PaymentMode {
  switch (value) {
    case PaymentMode.SANDBOX:
    case PaymentMode.LIVE:
      return value;
    default:
      throw new Error("REFUND_READINESS_MODE_INVALID");
  }
}

function attemptStatusValue(value: unknown): RefundAttemptStatus {
  if (isRefundAttemptStatus(value)) return value;
  throw new Error("REFUND_READINESS_ATTEMPT_STATUS_INVALID");
}

function isRefundAttemptStatus(value: unknown): value is RefundAttemptStatus {
  switch (value) {
    case RefundAttemptStatus.REQUESTED:
    case RefundAttemptStatus.PROCESSING:
    case RefundAttemptStatus.SUCCEEDED:
    case RefundAttemptStatus.FAILED_RETRYABLE:
    case RefundAttemptStatus.FAILED_TERMINAL:
    case RefundAttemptStatus.MANUAL_REVIEW:
    case RefundAttemptStatus.CANCELLED:
      return true;
    default:
      return false;
  }
}

function isRefundExecutionCommandStatus(
  value: unknown,
): value is RefundExecutionCommandStatus {
  switch (value) {
    case RefundExecutionCommandStatus.READY:
    case RefundExecutionCommandStatus.LEASED:
    case RefundExecutionCommandStatus.WAITING_EVIDENCE:
    case RefundExecutionCommandStatus.WAITING_RETRY:
    case RefundExecutionCommandStatus.PARKED:
    case RefundExecutionCommandStatus.DONE:
      return true;
    default:
      return false;
  }
}

function eventTypeValue(value: unknown): RefundExecutionCommandEventType {
  switch (value) {
    case RefundExecutionCommandEventType.LEASE_ACQUIRED:
    case RefundExecutionCommandEventType.PRE_CONTACT_RELEASED:
    case RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED:
      return value;
    default:
      throw new Error("REFUND_READINESS_EVENT_TYPE_INVALID");
  }
}

function digestOptional(value: unknown): string | null {
  return typeof value === "string"
    ? createHash("sha256").update(value, "utf8").digest("hex")
    : null;
}
