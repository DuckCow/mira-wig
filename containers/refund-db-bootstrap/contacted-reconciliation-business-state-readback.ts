import {
  CheckoutSessionStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentEventSource,
  PaymentEventStatus,
  PaymentMode,
  PaymentProvider,
  PaymentRemediationStatus,
  type Prisma,
} from "@prisma/client";
import {
  checkoutRecoveryTransmissionId,
  EXIMBAY_CHECKOUT_RECOVERY_EVENT_TYPE,
  isExactQ004RecoveryEvent,
  type EximbayCheckoutRecoveryPayment,
} from "../../src/lib/payment/eximbay/checkout-recovery-state.js";
import {
  contactedReconciliationPaymentCandidate,
  type EximbayContactedReconciliationPaymentCandidate,
} from "../../src/lib/payment/refund/eximbay-contacted-reconciliation-selection.js";

export const EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID =
  "a764f61f4e4ba799ab16b318a676db65" as const;
export const EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID =
  "cmthg2mzu000001s6iuvx7u5x" as const;

export const CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_MODE =
  "contacted-reconciliation-business-state-readback" as const;
export const CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_CODE =
  "CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_COMPLETE" as const;
export const CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_JOB =
  "mira-p3e-sbx-contacted-readback" as const;
export const CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_ROLE =
  "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam" as const;
export const CONTACTED_RECONCILIATION_HISTORICAL_EXECUTION =
  "mira-p3e-sbx-contacted-reconciliation-vnnsq" as const;
export const CONTACTED_RECONCILIATION_HISTORICAL_EXECUTION_UID =
  "87d659b0-a6a3-4353-9678-c18f629df434" as const;

const DATABASE_NAME = "refund_sandbox";
const MAX_RESULT_ROWS = 64;
const Q004_TRANSMISSION_PREFIX = "eximbay:checkout-recovery:q004:";

export const READBACK_SQL = Object.freeze({
  begin: "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
  identity: `
    SELECT current_user AS "currentUser",
      current_database() AS "currentDatabase",
      current_setting('transaction_read_only') AS "transactionReadOnly",
      CURRENT_TIMESTAMP AS "capturedAt"
  `,
  session: `
    SELECT "id", "status", "expiresAt", "createdAt", "updatedAt"
    FROM "CheckoutSession"
    WHERE "id" = $1
  `,
  paymentCount: `
    SELECT count("id")::int AS "count"
    FROM "Payment"
    WHERE "checkoutSessionId" = $1
  `,
  payments: `
    SELECT "id", "checkoutSessionId", "provider", "mode", "status",
      "attemptLifecycle", "remediationStatus", "amount", "currency",
      "providerOrderId", "providerPaymentKey", "contactStartedAt",
      "financialSucceededAt", "blockingEndedAt", "suspendedByPaymentId",
      "errorCode", "errorMessage", "createdAt", "updatedAt"
    FROM "Payment"
    WHERE "checkoutSessionId" = $1
    ORDER BY "createdAt" ASC, "id" ASC
    LIMIT 65
  `,
  eventCount: `
    SELECT count("id")::int AS "count"
    FROM "PaymentEvent"
    WHERE "provider" = 'EXIMBAY'
      AND "eventType" = $2
      AND (
        "checkoutSessionId" = $1
        OR "transmissionId" = ANY($3::text[])
      )
  `,
  events: `
    SELECT "id", "provider", "source", "transmissionId", "eventType",
      "verifiedMode", "verifiedCredentialBinding", "checkoutSessionId",
      pg_column_size("raw") <= 8192 AS "rawWithinBound",
      CASE WHEN pg_column_size("raw") <= 8192 THEN "raw" ELSE NULL END AS "raw",
      "status", "receivedAt", "processedAt"
    FROM "PaymentEvent"
    WHERE "provider" = 'EXIMBAY'
      AND "eventType" = $2
      AND (
        "checkoutSessionId" = $1
        OR "transmissionId" = ANY($3::text[])
      )
    ORDER BY "receivedAt" ASC, "id" ASC
    LIMIT 65
  `,
  orderCount: `
    SELECT count("id")::int AS "count"
    FROM "Order"
    WHERE "checkoutSessionId" = $1 OR "paymentId" = ANY($2::text[])
  `,
  orders: `
    SELECT "id", "checkoutSessionId", "paymentId", "status", "createdAt", "updatedAt"
    FROM "Order"
    WHERE "checkoutSessionId" = $1 OR "paymentId" = ANY($2::text[])
    ORDER BY "createdAt" ASC, "id" ASC
    LIMIT 65
  `,
  commit: "COMMIT",
  rollback: "ROLLBACK",
} as const);

export type FixedReadbackQuery = (
  sql: string,
  parameters?: readonly unknown[],
) => Promise<readonly Readonly<Record<string, unknown>>[]>;

type SessionState = Readonly<{
  id: typeof EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID;
  status: CheckoutSessionStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}>;

type PaymentState = Readonly<{
  id: string;
  checkoutSessionId: typeof EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID;
  provider: PaymentProvider;
  mode: PaymentMode;
  status: PaymentAttemptStatus;
  attemptLifecycle: PaymentAttemptLifecycle;
  remediationStatus: PaymentRemediationStatus;
  amount: number;
  currency: string;
  providerOrderId: string | null;
  providerPaymentKeyPresent: boolean;
  contactStartedAt: string | null;
  financialSucceededAt: string | null;
  blockingEndedAt: string | null;
  suspendedByPaymentId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  candidateKind: EximbayContactedReconciliationPaymentCandidate["kind"] | null;
}>;

type EventState = Readonly<{
  id: string;
  paymentId: string | null;
  provider: PaymentProvider;
  source: PaymentEventSource;
  transmissionId: string | null;
  type: string;
  status: PaymentEventStatus;
  verifiedMode: PaymentMode | null;
  credentialBindingPresent: boolean;
  checkoutSessionId: string | null;
  receivedAt: string;
  processedAt: string | null;
  evidencePayloadWithinBound: boolean;
  exactQ004RecoveryEvidence: boolean;
}>;

type OrderState = Readonly<{
  id: string;
  checkoutSessionId: string;
  paymentId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}>;

export type ContactedReconciliationBusinessStateReadbackResult = Readonly<{
  ok: true;
  code: typeof CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_CODE;
  runId: typeof EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID;
  checkoutSessionId: typeof EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID;
  historicalExecution: typeof CONTACTED_RECONCILIATION_HISTORICAL_EXECUTION;
  historicalExecutionUid: typeof CONTACTED_RECONCILIATION_HISTORICAL_EXECUTION_UID;
  databaseUser: typeof CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_ROLE;
  transactionReadOnly: true;
  capturedAt: string;
  providerEffects: 0;
  businessRowMutations: 0;
  session: SessionState | null;
  paymentCount: number;
  relevantPaymentCount: number;
  paymentsTruncated: boolean;
  payments: readonly PaymentState[];
  selectedCandidate: EximbayContactedReconciliationPaymentCandidate | null;
  q004ObservedEventCount: number;
  eventsTruncated: boolean;
  q004Events: readonly EventState[];
  orderCount: number;
  ordersTruncated: boolean;
  orders: readonly OrderState[];
  q004ReleaseDurable: "YES" | "NO" | "AMBIGUOUS";
  contactedBlocker: "RELEASED" | "PRESERVED" | "AMBIGUOUS";
  freshSaleEligible: "YES" | "NOT_YET";
}>;

export async function readContactedReconciliationBusinessState(
  query: FixedReadbackQuery,
): Promise<ContactedReconciliationBusinessStateReadbackResult> {
  await query(READBACK_SQL.begin);
  try {
    const result = await collectReadback(query);
    await query(READBACK_SQL.commit);
    return result;
  } catch (error) {
    await query(READBACK_SQL.rollback).catch(() => undefined);
    throw error;
  }
}

async function collectReadback(
  query: FixedReadbackQuery,
): Promise<ContactedReconciliationBusinessStateReadbackResult> {
  const identity = exactOne(await query(READBACK_SQL.identity));
  requireReadbackIdentity(identity);
  const capturedAt = dateValue(identity.capturedAt);
  const session = parseOptionalSession(await query(READBACK_SQL.session, [
    EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
  ]));
  const paymentCount = parseCount(await query(READBACK_SQL.paymentCount, [
    EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
  ]));
  const paymentRows = await query(READBACK_SQL.payments, [
    EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
  ]);
  const paymentModels = paymentRows.slice(0, MAX_RESULT_ROWS).map(parsePaymentModel);
  const paymentCandidates = paymentModels.flatMap(paymentCandidateArray);
  const paymentIds = paymentModels.map(({ id }) => id);
  const eventParameters = [
    EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
    EXIMBAY_CHECKOUT_RECOVERY_EVENT_TYPE,
    paymentIds.map(checkoutRecoveryTransmissionId),
  ] as const;
  const q004ObservedEventCount = parseCount(await query(READBACK_SQL.eventCount, eventParameters));
  const eventRows = await query(READBACK_SQL.events, eventParameters);
  const q004Events = eventRows.slice(0, MAX_RESULT_ROWS)
    .map(parseEventModel)
    .map((event) => eventOutput(event, paymentModels));
  const orderParameters = [
    EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
    paymentIds,
  ] as const;
  const orderCount = parseCount(await query(READBACK_SQL.orderCount, orderParameters));
  const orderRows = await query(READBACK_SQL.orders, orderParameters);
  const truncation = truncationState(
    paymentCount,
    paymentRows.length,
    q004ObservedEventCount,
    eventRows.length,
    orderCount,
    orderRows.length,
  );
  const adjudication = adjudicate({
    session,
    capturedAt,
    paymentCount,
    paymentModels,
    paymentCandidates,
    q004ObservedEventCount,
    q004Events,
    orderCount,
    truncated: Object.values(truncation).some(Boolean),
  });
  return Object.freeze({
    ok: true,
    code: CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_CODE,
    runId: EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
    checkoutSessionId: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
    historicalExecution: CONTACTED_RECONCILIATION_HISTORICAL_EXECUTION,
    historicalExecutionUid: CONTACTED_RECONCILIATION_HISTORICAL_EXECUTION_UID,
    databaseUser: CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_ROLE,
    transactionReadOnly: true,
    capturedAt: capturedAt.toISOString(),
    providerEffects: 0,
    businessRowMutations: 0,
    session,
    paymentCount,
    relevantPaymentCount: paymentCandidates.length,
    paymentsTruncated: truncation.payments,
    payments: Object.freeze(paymentModels.map(paymentOutput)),
    selectedCandidate: singleCandidate(paymentCandidates),
    q004ObservedEventCount,
    eventsTruncated: truncation.events,
    q004Events: Object.freeze(q004Events),
    orderCount,
    ordersTruncated: truncation.orders,
    orders: Object.freeze(orderRows.slice(0, MAX_RESULT_ROWS).map(parseOrder)),
    ...adjudication,
  });
}

function requireReadbackIdentity(identity: Readonly<Record<string, unknown>>): void {
  if (identity.currentUser !== CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_ROLE
    || identity.currentDatabase !== DATABASE_NAME
    || identity.transactionReadOnly !== "on") throw new Error("READBACK_DATABASE_IDENTITY_INVALID");
}

function parseOptionalSession(
  rows: readonly Readonly<Record<string, unknown>>[],
): SessionState | null {
  if (rows.length > 1) throw new Error("READBACK_SESSION_AMBIGUOUS");
  return rows[0] ? parseSession(rows[0]) : null;
}

function paymentCandidateArray(
  payment: EximbayCheckoutRecoveryPayment,
): readonly EximbayContactedReconciliationPaymentCandidate[] {
  const candidate = contactedReconciliationPaymentCandidate(payment);
  return candidate ? Object.freeze([candidate]) : Object.freeze([]);
}

function singleCandidate(
  candidates: readonly EximbayContactedReconciliationPaymentCandidate[],
): EximbayContactedReconciliationPaymentCandidate | null {
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

function truncationState(
  paymentCount: number,
  paymentRows: number,
  eventCount: number,
  eventRows: number,
  orderCount: number,
  orderRows: number,
): Readonly<{ payments: boolean; events: boolean; orders: boolean }> {
  return Object.freeze({
    payments: Math.max(paymentCount, paymentRows) > MAX_RESULT_ROWS,
    events: Math.max(eventCount, eventRows) > MAX_RESULT_ROWS,
    orders: Math.max(orderCount, orderRows) > MAX_RESULT_ROWS,
  });
}

function adjudicate(input: Readonly<{
  session: SessionState | null;
  capturedAt: Date;
  paymentCount: number;
  paymentModels: readonly EximbayCheckoutRecoveryPayment[];
  paymentCandidates: readonly EximbayContactedReconciliationPaymentCandidate[];
  q004ObservedEventCount: number;
  q004Events: readonly EventState[];
  orderCount: number;
  truncated: boolean;
}>): Pick<ContactedReconciliationBusinessStateReadbackResult,
  "q004ReleaseDurable" | "contactedBlocker" | "freshSaleEligible"> {
  const candidate = singleCandidate(input.paymentCandidates);
  const exactEvents = input.q004Events.filter((event) => event.exactQ004RecoveryEvidence);
  const positive = positiveReleaseEvidence(input, candidate, exactEvents);
  const preserved = preservedBlockerEvidence(input, candidate);
  const q004ReleaseDurable = positive ? "YES" : preserved ? "NO" : "AMBIGUOUS";
  const contactedBlocker = positive ? "RELEASED" : preserved ? "PRESERVED" : "AMBIGUOUS";
  const noBlockingPayment = input.paymentModels.every((payment) => payment.blockingEndedAt !== null);
  const noUnresolvedExposure = input.paymentModels.every((payment) => !isUnresolvedExposure(payment));
  const usableSession = input.session?.status === CheckoutSessionStatus.SUBMITTED
    && new Date(input.session.expiresAt).getTime() > input.capturedAt.getTime();
  const freshSaleEligible = [
    positive,
    noBlockingPayment,
    noUnresolvedExposure,
    input.orderCount === 0,
    usableSession,
  ].every(Boolean) ? "YES" : "NOT_YET";
  return Object.freeze({ q004ReleaseDurable, contactedBlocker, freshSaleEligible });
}

function positiveReleaseEvidence(
  input: Parameters<typeof adjudicate>[0],
  candidate: EximbayContactedReconciliationPaymentCandidate | null,
  exactEvents: readonly EventState[],
): boolean {
  return [
    !input.truncated,
    input.session !== null,
    input.paymentCount === input.paymentModels.length,
    candidate?.kind === "REPLAY",
    input.q004ObservedEventCount === 1,
    exactEvents.length === 1,
    exactEvents[0]?.paymentId === candidate?.paymentId,
  ].every(Boolean);
}

function preservedBlockerEvidence(
  input: Parameters<typeof adjudicate>[0],
  candidate: EximbayContactedReconciliationPaymentCandidate | null,
): boolean {
  return [
    !input.truncated,
    input.session !== null,
    input.paymentCount === input.paymentModels.length,
    candidate?.kind === "ACTIVE",
    input.q004ObservedEventCount === 0,
  ].every(Boolean);
}

function isUnresolvedExposure(payment: EximbayCheckoutRecoveryPayment): boolean {
  if (payment.remediationStatus !== PaymentRemediationStatus.NONE
    && payment.remediationStatus !== PaymentRemediationStatus.REMEDIATED) return true;
  return [
    payment.provider === PaymentProvider.EXIMBAY,
    payment.mode === PaymentMode.SANDBOX,
    payment.status === PaymentAttemptStatus.INITIATED
      || payment.status === PaymentAttemptStatus.AWAITING,
    payment.attemptLifecycle === PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
    payment.remediationStatus === PaymentRemediationStatus.NONE,
    payment.providerOrderId !== null,
    payment.contactStartedAt !== null,
    payment.providerPaymentKey === null,
    payment.financialSucceededAt === null,
    payment.blockingEndedAt !== null,
    payment.suspendedByPaymentId === null,
    payment.errorCode === "EXIMBAY_RELEASED_ATTEMPT_OUTCOME_UNKNOWN",
  ].every(Boolean);
}

function paymentOutput(payment: EximbayCheckoutRecoveryPayment & Readonly<{
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}>): PaymentState {
  const candidate = contactedReconciliationPaymentCandidate(payment);
  return Object.freeze({
    id: payment.id,
    checkoutSessionId: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
    provider: payment.provider,
    mode: payment.mode,
    status: payment.status,
    attemptLifecycle: payment.attemptLifecycle,
    remediationStatus: payment.remediationStatus,
    amount: payment.amount,
    currency: payment.currency,
    providerOrderId: payment.providerOrderId,
    providerPaymentKeyPresent: payment.providerPaymentKey !== null,
    contactStartedAt: optionalIso(payment.contactStartedAt),
    financialSucceededAt: optionalIso(payment.financialSucceededAt),
    blockingEndedAt: optionalIso(payment.blockingEndedAt),
    suspendedByPaymentId: payment.suspendedByPaymentId,
    errorCode: payment.errorCode,
    errorMessage: payment.errorMessage,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
    candidateKind: candidate?.kind ?? null,
  });
}

function eventOutput(
  event: ParsedEvent,
  payments: readonly EximbayCheckoutRecoveryPayment[],
): EventState {
  const paymentId = event.transmissionId?.startsWith(Q004_TRANSMISSION_PREFIX)
    ? event.transmissionId.slice(Q004_TRANSMISSION_PREFIX.length)
    : null;
  const payment = payments.find((candidate) => candidate.id === paymentId);
  const exact = event.rawWithinBound && payment !== undefined
    && event.transmissionId === checkoutRecoveryTransmissionId(payment.id)
    && isExactQ004RecoveryEvent(event, payment);
  return Object.freeze({
    id: event.id,
    paymentId,
    provider: event.provider,
    source: event.source,
    transmissionId: event.transmissionId,
    type: event.eventType,
    status: event.status,
    verifiedMode: event.verifiedMode,
    credentialBindingPresent: event.verifiedCredentialBinding !== null,
    checkoutSessionId: event.checkoutSessionId,
    receivedAt: event.receivedAt.toISOString(),
    processedAt: optionalIso(event.processedAt),
    evidencePayloadWithinBound: event.rawWithinBound,
    exactQ004RecoveryEvidence: exact,
  });
}

type ParsedPayment = EximbayCheckoutRecoveryPayment & Readonly<{
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}>;

type ParsedEvent = Readonly<{
  id: string;
  provider: PaymentProvider;
  source: PaymentEventSource;
  transmissionId: string | null;
  eventType: string;
  verifiedMode: PaymentMode | null;
  verifiedCredentialBinding: string | null;
  checkoutSessionId: string | null;
  rawWithinBound: boolean;
  raw: Prisma.JsonValue;
  status: PaymentEventStatus;
  receivedAt: Date;
  processedAt: Date | null;
}>;

function parseSession(row: Readonly<Record<string, unknown>>): SessionState {
  if (row.id !== EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID) {
    throw new Error("READBACK_SESSION_INVALID");
  }
  return Object.freeze({
    id: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
    status: checkoutSessionStatus(row.status),
    expiresAt: dateValue(row.expiresAt).toISOString(),
    createdAt: dateValue(row.createdAt).toISOString(),
    updatedAt: dateValue(row.updatedAt).toISOString(),
  });
}

function parsePaymentModel(row: Readonly<Record<string, unknown>>): ParsedPayment {
  if (row.checkoutSessionId !== EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID) {
    throw new Error("READBACK_PAYMENT_TARGET_INVALID");
  }
  return Object.freeze({
    id: stringValue(row.id),
    checkoutSessionId: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
    provider: paymentProvider(row.provider),
    mode: paymentMode(row.mode),
    status: paymentStatus(row.status),
    attemptLifecycle: paymentLifecycle(row.attemptLifecycle),
    remediationStatus: remediationStatus(row.remediationStatus),
    amount: nonnegativeInteger(row.amount),
    currency: stringValue(row.currency),
    providerOrderId: nullableString(row.providerOrderId),
    providerPaymentKey: nullableString(row.providerPaymentKey),
    contactStartedAt: nullableDate(row.contactStartedAt),
    financialSucceededAt: nullableDate(row.financialSucceededAt),
    blockingEndedAt: nullableDate(row.blockingEndedAt),
    suspendedByPaymentId: nullableString(row.suspendedByPaymentId),
    errorCode: nullableString(row.errorCode),
    errorMessage: nullableString(row.errorMessage),
    createdAt: dateValue(row.createdAt),
    updatedAt: dateValue(row.updatedAt),
  });
}

function parseEventModel(row: Readonly<Record<string, unknown>>): ParsedEvent {
  return Object.freeze({
    id: stringValue(row.id),
    provider: paymentProvider(row.provider),
    source: paymentEventSource(row.source),
    transmissionId: nullableString(row.transmissionId),
    eventType: stringValue(row.eventType),
    verifiedMode: row.verifiedMode === null ? null : paymentMode(row.verifiedMode),
    verifiedCredentialBinding: nullableString(row.verifiedCredentialBinding),
    checkoutSessionId: nullableString(row.checkoutSessionId),
    rawWithinBound: booleanValue(row.rawWithinBound),
    raw: jsonValue(row.raw),
    status: paymentEventStatus(row.status),
    receivedAt: dateValue(row.receivedAt),
    processedAt: nullableDate(row.processedAt),
  });
}

function parseOrder(row: Readonly<Record<string, unknown>>): OrderState {
  return Object.freeze({
    id: stringValue(row.id),
    checkoutSessionId: stringValue(row.checkoutSessionId),
    paymentId: stringValue(row.paymentId),
    status: stringValue(row.status),
    createdAt: dateValue(row.createdAt).toISOString(),
    updatedAt: dateValue(row.updatedAt).toISOString(),
  });
}

function parseCount(rows: readonly Readonly<Record<string, unknown>>[]): number {
  return nonnegativeInteger(exactOne(rows).count);
}

function exactOne(
  rows: readonly Readonly<Record<string, unknown>>[],
): Readonly<Record<string, unknown>> {
  const row = rows[0];
  if (rows.length !== 1 || !row) throw new Error("READBACK_RESULT_SHAPE_INVALID");
  return row;
}

function checkoutSessionStatus(value: unknown): CheckoutSessionStatus {
  if (value === CheckoutSessionStatus.OPEN || value === CheckoutSessionStatus.SUBMITTED
    || value === CheckoutSessionStatus.COMPLETED || value === CheckoutSessionStatus.FAILED
    || value === CheckoutSessionStatus.EXPIRED) return value;
  throw new Error("READBACK_ENUM_INVALID");
}

function paymentProvider(value: unknown): PaymentProvider {
  if (value === PaymentProvider.MOCK || value === PaymentProvider.TOSS
    || value === PaymentProvider.PAYPAL || value === PaymentProvider.EXIMBAY) return value;
  throw new Error("READBACK_ENUM_INVALID");
}

function paymentMode(value: unknown): PaymentMode {
  if (value === PaymentMode.SANDBOX || value === PaymentMode.LIVE) return value;
  throw new Error("READBACK_ENUM_INVALID");
}

function paymentStatus(value: unknown): PaymentAttemptStatus {
  if (value === PaymentAttemptStatus.INITIATED || value === PaymentAttemptStatus.AWAITING
    || value === PaymentAttemptStatus.SUCCEEDED || value === PaymentAttemptStatus.FAILED
    || value === PaymentAttemptStatus.VOIDED) return value;
  throw new Error("READBACK_ENUM_INVALID");
}

function paymentLifecycle(value: unknown): PaymentAttemptLifecycle {
  if (value === PaymentAttemptLifecycle.CONTACT_AUTHORIZED
    || value === PaymentAttemptLifecycle.CONTACTED
    || value === PaymentAttemptLifecycle.OUTCOME_UNKNOWN
    || value === PaymentAttemptLifecycle.SUPERSEDED
    || value === PaymentAttemptLifecycle.TERMINAL_FAILURE
    || value === PaymentAttemptLifecycle.SUSPENDED
    || value === PaymentAttemptLifecycle.FINALIZED
    || value === PaymentAttemptLifecycle.TERMINAL_REMEDIATED) return value;
  throw new Error("READBACK_ENUM_INVALID");
}

function remediationStatus(value: unknown): PaymentRemediationStatus {
  if (value === PaymentRemediationStatus.NONE || value === PaymentRemediationStatus.REQUIRED
    || value === PaymentRemediationStatus.PENDING
    || value === PaymentRemediationStatus.RECONCILIATION_REQUIRED
    || value === PaymentRemediationStatus.REMEDIATED) return value;
  throw new Error("READBACK_ENUM_INVALID");
}

function paymentEventSource(value: unknown): PaymentEventSource {
  if (value === PaymentEventSource.API || value === PaymentEventSource.WEBHOOK) return value;
  throw new Error("READBACK_ENUM_INVALID");
}

function paymentEventStatus(value: unknown): PaymentEventStatus {
  if (value === PaymentEventStatus.RECEIVED || value === PaymentEventStatus.RETRYABLE_FAILED
    || value === PaymentEventStatus.PROCESSED || value === PaymentEventStatus.IGNORED
    || value === PaymentEventStatus.FAILED) return value;
  throw new Error("READBACK_ENUM_INVALID");
}

function jsonValue(value: unknown): Prisma.JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(jsonValue);
  if (typeof value === "object") {
    const result: Prisma.JsonObject = {};
    for (const [key, entry] of Object.entries(value)) result[key] = jsonValue(entry);
    return result;
  }
  throw new Error("READBACK_JSON_INVALID");
}

function stringValue(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("READBACK_STRING_INVALID");
  return value;
}

function nullableString(value: unknown): string | null {
  return value === null ? null : stringValue(value);
}

function dateValue(value: unknown): Date {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  throw new Error("READBACK_TIMESTAMP_INVALID");
}

function nullableDate(value: unknown): Date | null {
  return value === null ? null : dateValue(value);
}

function optionalIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function nonnegativeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("READBACK_INTEGER_INVALID");
  }
  return value;
}

function booleanValue(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("READBACK_BOOLEAN_INVALID");
  return value;
}
