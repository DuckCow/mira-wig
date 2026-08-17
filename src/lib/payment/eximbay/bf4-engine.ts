import "server-only";
import {
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentProvider,
  PaymentRemediationStatus,
  type PrismaClient,
} from "@prisma/client";
import { completeFromCapture, type CaptureFacts, type CompleteFromCaptureResult } from "@/lib/payment/complete";
import type { ProviderEnv } from "@/lib/payment/providers/credentials";
import {
  createEximbayProviderOrderCandidate,
  decodeEximbayAmount,
  parseUnverifiedEximbayStatus,
  validateTrustedEximbayFacts,
  type TrustedEximbayCompletionCandidate,
  type UnverifiedEximbayStatus,
} from "@/lib/payment/providers/eximbay";
import { createProviderVerifiedEximbayStatus } from "@/lib/payment/providers/eximbay/verified-status";
import type { EximbayPaymentMode } from "@/lib/payment/providers/eximbay/types";
import {
  requireEximbayBf4ConfigFacts,
  resolveEximbayBf4Config,
  retrieveEximbayBf4Status,
  verifyEximbayBf4Status,
  type EximbayBf4Config,
  type EximbayBf4Fetch,
  type EximbayBf4RetrievedPayment,
} from "./bf4-contact";
import {
  EXIMBAY_BF4_SCHEMA,
  EXIMBAY_BF4_VERSION,
  EximbayBf4Stage,
  exactRawSha256,
  minimizeEximbayBf4Envelope,
  validateEximbayBf4Envelope,
  type EximbayBf4Envelope,
  type EximbayBf4SaleFacts,
} from "./bf4-envelope";
import {
  claimEximbayBf4Event,
  correlateEximbayBf4Payment,
  loadEximbayBf4Event,
  transitionEximbayBf4ContactMarker,
  transitionEximbayBf4Event,
  transitionEximbayBf4SaleMoneyMismatch,
  type EximbayBf4PaymentCorrelation,
  type EximbayBf4RecordedEvent,
} from "./bf4-event";

export const EXIMBAY_BF4_SUCCESS_ACK = "rescode=0000&resmsg=Success";

export type EximbayBf4Acknowledgement =
  | Readonly<{ kind: "SUCCESS"; body: typeof EXIMBAY_BF4_SUCCESS_ACK }>
  | Readonly<{ kind: "NON_SUCCESS_EVIDENCE_GATED" }>;

export interface ProcessEximbayBf4StatusInput {
  readonly exactRawQuery: string;
  readonly receivedAt: Date;
  readonly modeCeiling: EximbayPaymentMode;
  readonly env: ProviderEnv;
  readonly transport: EximbayBf4Fetch;
  readonly now?: () => Date;
}

export interface ProcessEximbayBf4StatusResult {
  readonly kind: "handled" | "notCorrelated" | "conflict";
  readonly eventId?: string;
  readonly stage?: EximbayBf4Envelope["stage"];
  readonly acknowledgement: EximbayBf4Acknowledgement;
}

interface DriveContext {
  readonly client: PrismaClient;
  readonly payment: EximbayBf4PaymentCorrelation;
  readonly config: EximbayBf4Config;
  readonly transport: EximbayBf4Fetch;
  readonly now: () => Date;
}

export async function processEximbayBf4Status(
  client: PrismaClient,
  input: ProcessEximbayBf4StatusInput,
): Promise<ProcessEximbayBf4StatusResult> {
  const parsed = parseUnverifiedEximbayStatus(input.exactRawQuery);
  const payment = await correlateEximbayBf4Payment(client, parsed.fields.order_id ?? "");
  if (!payment) return noEvent("notCorrelated");
  if (payment.mode !== input.modeCeiling) return noEvent("conflict");
  const config = resolveEximbayBf4Config(payment.mode, input.env);
  const envelope = initialEnvelope(parsed, input.receivedAt);
  const claim = await claimEximbayBf4Event(client, payment, envelope);
  if (claim.kind === "conflict") return noEvent("conflict");
  if (claim.kind === "rejectedReplay") return resultFromEvent(claim.event);
  return driveEvent(claim.event, {
    client,
    payment,
    config,
    transport: input.transport,
    now: input.now ?? (() => new Date()),
  });
}

export function eximbayBf4Acknowledgement(
  envelopeInput: unknown,
): EximbayBf4Acknowledgement {
  const envelope = validateEximbayBf4Envelope(envelopeInput);
  if (envelope.stage === EximbayBf4Stage.TERMINAL_PROCESSED) {
    return Object.freeze({ kind: "SUCCESS", body: EXIMBAY_BF4_SUCCESS_ACK });
  }
  return Object.freeze({ kind: "NON_SUCCESS_EVIDENCE_GATED" });
}

async function driveEvent(
  event: EximbayBf4RecordedEvent,
  context: DriveContext,
): Promise<ProcessEximbayBf4StatusResult> {
  const envelope = validateEximbayBf4Envelope(event.raw);
  if (envelope.stage === EximbayBf4Stage.CLAIMED_PRE_VERIFY) {
    return beginVerify(event.id, envelope, context);
  }
  if (envelope.stage === EximbayBf4Stage.VERIFIED_PENDING_RETRIEVE) {
    return beginRetrieve(event.id, envelope, context);
  }
  if (envelope.stage === EximbayBf4Stage.VERIFIED_SALE_PENDING_COMPLETION
    || envelope.stage === EximbayBf4Stage.COMPLETION_RETRYABLE) {
    return completeStoredSale(event.id, envelope, context);
  }
  return handled(event.id, envelope);
}

async function beginVerify(
  eventId: string,
  envelope: EximbayBf4Envelope,
  context: DriveContext,
): Promise<ProcessEximbayBf4StatusResult> {
  const markedAt = context.now();
  const marked = preserveEnvelope(envelope, {
    stage: EximbayBf4Stage.VERIFY_OUTCOME_UNKNOWN,
    verification: "OUTCOME_UNKNOWN",
    retrieval: "NOT_ATTEMPTED",
    timestamps: {
      ...envelope.timestamps,
      stageChangedAt: markedAt.toISOString(),
      verifyContactMarkedAt: markedAt.toISOString(),
    },
  });
  const acquired = await transitionEximbayBf4ContactMarker(context.client, context.payment, {
    eventId,
    expectedStage: EximbayBf4Stage.CLAIMED_PRE_VERIFY,
    envelope: marked,
  });
  if (!acquired) return latestResult(context.client, eventId);
  const verify = await verifyEximbayBf4Status(
    context.config,
    requireExactRaw(marked),
    context.transport,
  );
  if (verify.kind === "outcomeUnknown") {
    await markPaymentOutcomeUnknown(context.client, context.payment);
    return handled(eventId, marked);
  }
  const admittedAt = context.now();
  const admitted = preserveEnvelope(marked, {
    stage: EximbayBf4Stage.VERIFIED_PENDING_RETRIEVE,
    verification: "ADMITTED",
    retrieval: "NOT_ATTEMPTED",
    timestamps: { ...marked.timestamps, stageChangedAt: admittedAt.toISOString() },
  });
  const config = requireEximbayBf4ConfigFacts(context.config);
  const persisted = await transitionEximbayBf4Event(context.client, {
    eventId,
    expectedStage: EximbayBf4Stage.VERIFY_OUTCOME_UNKNOWN,
    envelope: admitted,
    verifiedMode: config.mode,
    verifiedCredentialBinding: config.credentialBinding,
  });
  if (!persisted) {
    await markPaymentOutcomeUnknown(context.client, context.payment);
    return latestResult(context.client, eventId);
  }
  return beginRetrieve(eventId, admitted, context);
}

async function beginRetrieve(
  eventId: string,
  envelope: EximbayBf4Envelope,
  context: DriveContext,
): Promise<ProcessEximbayBf4StatusResult> {
  const markedAt = context.now();
  const marked = preserveEnvelope(envelope, {
    stage: EximbayBf4Stage.RETRIEVE_OUTCOME_UNKNOWN,
    verification: "ADMITTED",
    retrieval: "OUTCOME_UNKNOWN",
    timestamps: {
      ...envelope.timestamps,
      stageChangedAt: markedAt.toISOString(),
      retrieveContactMarkedAt: markedAt.toISOString(),
    },
  });
  const acquired = await transitionEximbayBf4ContactMarker(context.client, context.payment, {
    eventId,
    expectedStage: EximbayBf4Stage.VERIFIED_PENDING_RETRIEVE,
    envelope: marked,
  });
  if (!acquired) return latestResult(context.client, eventId);
  const retrieved = await retrieveEximbayBf4Status(context.config, {
    providerOrderId: requireProviderOrderId(context.payment),
    transactionId: requireCandidateTransactionId(marked),
    currency: context.payment.currency,
    amountWire: encodePersistedAmount(context.payment),
    language: context.payment.currency === "JPY" ? "JP" : "EN",
  }, context.transport);
  if (retrieved.kind === "outcomeUnknown") {
    await markPaymentOutcomeUnknown(context.client, context.payment);
    return handled(eventId, marked);
  }
  return admitRetrieved(eventId, marked, retrieved.payment, context);
}

async function admitRetrieved(
  eventId: string,
  envelope: EximbayBf4Envelope,
  retrieved: EximbayBf4RetrievedPayment,
  context: DriveContext,
): Promise<ProcessEximbayBf4StatusResult> {
  const amountMinor = decodeRetrievedAmount(retrieved);
  if (amountMinor === null) {
    await markPaymentOutcomeUnknown(context.client, context.payment);
    return handled(eventId, envelope);
  }
  const saleFacts = retrievedSaleFacts(retrieved, amountMinor);
  const expectedMid = requireEximbayBf4ConfigFacts(context.config).mid;
  if (retrieved.status !== "SALE") {
    if (!exactRetrievedIdentityAndMoney(retrieved, envelope, context.payment, expectedMid, amountMinor)) {
      await markPaymentOutcomeUnknown(context.client, context.payment);
      return handled(eventId, envelope);
    }
    const nonSale = preserveEnvelope(envelope, {
      stage: EximbayBf4Stage.VERIFIED_NON_SALE_REQUIRES_ADJUDICATION,
      verification: "ADMITTED",
      retrieval: "ADMITTED_NON_SALE",
      saleFacts,
      diagnostic: "NON_SALE",
      timestamps: changedTimestamps(envelope, context.now()),
    });
    await transitionEximbayBf4Event(context.client, {
      eventId,
      expectedStage: EximbayBf4Stage.RETRIEVE_OUTCOME_UNKNOWN,
      envelope: nonSale,
    });
    await markPaymentOutcomeUnknown(context.client, context.payment);
    return latestResult(context.client, eventId);
  }
  const mismatch = saleMismatch(
    retrieved,
    envelope,
    context.payment,
    expectedMid,
    amountMinor,
  );
  if (mismatch === "SALE_IDENTITY_MISMATCH") {
    return persistSaleIdentityMismatch(eventId, envelope, saleFacts, context);
  }
  if (mismatch === "SALE_MONEY_MISMATCH") {
    return persistSaleMoneyMismatch(eventId, envelope, saleFacts, context);
  }
  return persistExactSale(eventId, envelope, saleFacts, context);
}

async function persistSaleIdentityMismatch(
  eventId: string,
  envelope: EximbayBf4Envelope,
  saleFacts: EximbayBf4SaleFacts,
  context: DriveContext,
): Promise<ProcessEximbayBf4StatusResult> {
  const mismatch = saleMismatchEnvelope(
    envelope,
    saleFacts,
    "SALE_IDENTITY_MISMATCH",
    context.now(),
  );
  await transitionEximbayBf4Event(context.client, {
    eventId,
    expectedStage: EximbayBf4Stage.RETRIEVE_OUTCOME_UNKNOWN,
    envelope: mismatch,
  });
  return latestResult(context.client, eventId);
}

async function persistSaleMoneyMismatch(
  eventId: string,
  envelope: EximbayBf4Envelope,
  saleFacts: EximbayBf4SaleFacts,
  context: DriveContext,
): Promise<ProcessEximbayBf4StatusResult> {
  const mismatch = saleMismatchEnvelope(
    envelope,
    saleFacts,
    "SALE_MONEY_MISMATCH",
    context.now(),
  );
  await transitionEximbayBf4SaleMoneyMismatch(context.client, context.payment, {
    eventId,
    expectedStage: EximbayBf4Stage.RETRIEVE_OUTCOME_UNKNOWN,
    envelope: mismatch,
  });
  return latestResult(context.client, eventId);
}

function saleMismatchEnvelope(
  envelope: EximbayBf4Envelope,
  saleFacts: EximbayBf4SaleFacts,
  diagnostic: "SALE_IDENTITY_MISMATCH" | "SALE_MONEY_MISMATCH",
  changedAt: Date,
): EximbayBf4Envelope {
  return preserveEnvelope(envelope, {
    stage: EximbayBf4Stage.VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION,
    verification: "ADMITTED",
    retrieval: "ADMITTED_SALE_MISMATCH",
    saleFacts,
    diagnostic,
    timestamps: changedTimestamps(envelope, changedAt),
  });
}

async function persistExactSale(
  eventId: string,
  envelope: EximbayBf4Envelope,
  saleFacts: EximbayBf4SaleFacts,
  context: DriveContext,
): Promise<ProcessEximbayBf4StatusResult> {
  trustedCandidate(
    saleFacts,
    context.payment,
    requireEximbayBf4ConfigFacts(context.config).mid,
  );
  const sale = minimizeEximbayBf4Envelope(envelope, {
    stage: EximbayBf4Stage.VERIFIED_SALE_PENDING_COMPLETION,
    verification: "ADMITTED",
    retrieval: "ADMITTED_SALE",
    saleFacts,
    timestamps: changedTimestamps(envelope, context.now()),
  });
  const persisted = await transitionEximbayBf4Event(context.client, {
    eventId,
    expectedStage: EximbayBf4Stage.RETRIEVE_OUTCOME_UNKNOWN,
    envelope: sale,
    providerPaymentKey: saleFacts.transactionId,
  });
  if (!persisted) return latestResult(context.client, eventId);
  return completeStoredSale(eventId, sale, context);
}

async function completeStoredSale(
  eventId: string,
  envelope: EximbayBf4Envelope,
  context: DriveContext,
): Promise<ProcessEximbayBf4StatusResult> {
  const saleFacts = envelope.saleFacts;
  if (!saleFacts) return handled(eventId, envelope);
  const candidate = trustedCandidate(
    saleFacts,
    context.payment,
    requireEximbayBf4ConfigFacts(context.config).mid,
  );
  const facts = captureFacts(candidate, context.payment, envelope);
  let result: CompleteFromCaptureResult;
  try {
    result = await completeFromCapture(context.client, facts);
  } catch {
    return persistCompletionRetryable(eventId, envelope, context);
  }
  return persistCompletionResult(eventId, envelope, result, context);
}

async function persistCompletionResult(
  eventId: string,
  envelope: EximbayBf4Envelope,
  result: CompleteFromCaptureResult,
  context: DriveContext,
): Promise<ProcessEximbayBf4StatusResult> {
  if (result.kind === "retryableFailure") {
    return persistCompletionRetryable(eventId, envelope, context);
  }
  const terminalStage = result.kind === "compensationSkipped"
    ? EximbayBf4Stage.TERMINAL_REJECTED
    : EximbayBf4Stage.TERMINAL_PROCESSED;
  const terminalAt = context.now();
  const terminal = minimizeEximbayBf4Envelope(envelope, {
    stage: terminalStage,
    verification: "ADMITTED",
    retrieval: "ADMITTED_SALE",
    saleFacts: envelope.saleFacts,
    timestamps: {
      ...envelope.timestamps,
      stageChangedAt: terminalAt.toISOString(),
      terminalAt: terminalAt.toISOString(),
    },
    ...(terminalStage === EximbayBf4Stage.TERMINAL_REJECTED
      ? { diagnostic: "COMPLETION_TERMINAL" as const }
      : {}),
  });
  await transitionEximbayBf4Event(context.client, {
    eventId,
    expectedStage: envelope.stage,
    envelope: terminal,
  });
  return latestResult(context.client, eventId);
}

async function persistCompletionRetryable(
  eventId: string,
  envelope: EximbayBf4Envelope,
  context: DriveContext,
): Promise<ProcessEximbayBf4StatusResult> {
  if (envelope.stage === EximbayBf4Stage.COMPLETION_RETRYABLE) return handled(eventId, envelope);
  const retryable = minimizeEximbayBf4Envelope(envelope, {
    stage: EximbayBf4Stage.COMPLETION_RETRYABLE,
    verification: "ADMITTED",
    retrieval: "ADMITTED_SALE",
    saleFacts: envelope.saleFacts,
    diagnostic: "COMPLETION_RETRYABLE",
    timestamps: changedTimestamps(envelope, context.now()),
  });
  await transitionEximbayBf4Event(context.client, {
    eventId,
    expectedStage: EximbayBf4Stage.VERIFIED_SALE_PENDING_COMPLETION,
    envelope: retryable,
  });
  return latestResult(context.client, eventId);
}

function trustedCandidate(
  saleFacts: EximbayBf4SaleFacts,
  payment: EximbayBf4PaymentCorrelation,
  expectedMid: string,
): TrustedEximbayCompletionCandidate {
  const verified = createProviderVerifiedEximbayStatus({
    transactionType: "PAYMENT",
    rescode: "0000",
    status: saleFacts.status,
    mid: expectedMid,
    orderId: saleFacts.providerOrderId,
    currency: saleFacts.currency,
    amount: saleFacts.amountWire,
    transactionId: saleFacts.transactionId,
    correlation: {
      paymentIdentity: payment.id,
      provider: "EXIMBAY",
      mode: payment.mode,
    },
  });
  return validateTrustedEximbayFacts(verified, {
    paymentIdentity: payment.id,
    provider: "EXIMBAY",
    mode: payment.mode,
    currency: requireEximbayCurrency(payment.currency),
    amountMinor: payment.amount,
    providerOrderCandidate: createEximbayProviderOrderCandidate(payment.id),
    providerOrderId: requireProviderOrderId(payment),
    mid: saleFacts.mid,
  });
}

function captureFacts(
  candidate: TrustedEximbayCompletionCandidate,
  payment: EximbayBf4PaymentCorrelation,
  envelope: EximbayBf4Envelope,
): CaptureFacts {
  return {
    paymentId: payment.id,
    checkoutSessionId: payment.checkoutSessionId,
    provider: PaymentProvider.EXIMBAY,
    mode: payment.mode,
    providerPaymentKey: candidate.transactionId,
    amount: candidate.amountMinor,
    currency: candidate.currency,
    receivedAt: new Date(envelope.timestamps.receivedAt),
  };
}

function initialEnvelope(parsed: UnverifiedEximbayStatus, receivedAt: Date): EximbayBf4Envelope {
  const timestamp = receivedAt.toISOString();
  return validateEximbayBf4Envelope({
    schema: EXIMBAY_BF4_SCHEMA,
    version: EXIMBAY_BF4_VERSION,
    stage: EximbayBf4Stage.CLAIMED_PRE_VERIFY,
    exactRawQuery: parsed.exactRawQuery,
    exactRawSha256: exactRawSha256(parsed.exactRawQuery),
    candidate: {
      orderId: parsed.fields.order_id,
      transactionId: parsed.fields.transaction_id,
      resultCode: parsed.fields.rescode,
    },
    verification: "NOT_ATTEMPTED",
    retrieval: "NOT_ATTEMPTED",
    timestamps: { receivedAt: timestamp, stageChangedAt: timestamp },
  });
}

function preserveEnvelope(
  envelope: EximbayBf4Envelope,
  replacement: Pick<EximbayBf4Envelope, "stage" | "verification" | "retrieval" | "timestamps"> &
    Partial<Pick<EximbayBf4Envelope, "saleFacts" | "diagnostic">>,
): EximbayBf4Envelope {
  return validateEximbayBf4Envelope({
    schema: EXIMBAY_BF4_SCHEMA,
    version: EXIMBAY_BF4_VERSION,
    exactRawQuery: envelope.exactRawQuery,
    exactRawSha256: envelope.exactRawSha256,
    candidate: envelope.candidate,
    ...replacement,
  });
}

function retrievedSaleFacts(
  retrieved: EximbayBf4RetrievedPayment,
  amountMinor: number,
): EximbayBf4SaleFacts {
  return Object.freeze({
    mid: retrieved.mid,
    providerOrderId: retrieved.orderId,
    transactionId: retrieved.transactionId,
    currency: retrieved.currency,
    amountWire: retrieved.amount,
    amountMinor,
    status: retrieved.status,
    transactionDate: retrieved.transactionDate,
  });
}

function saleMismatch(
  retrieved: EximbayBf4RetrievedPayment,
  envelope: EximbayBf4Envelope,
  payment: EximbayBf4PaymentCorrelation,
  expectedMid: string,
  amountMinor: number,
): "SALE_IDENTITY_MISMATCH" | "SALE_MONEY_MISMATCH" | null {
  const callbackTransactionType = parseUnverifiedEximbayStatus(requireExactRaw(envelope))
    .fields.transaction_type;
  const identityMismatch = retrieved.mid !== expectedMid
    || retrieved.orderId !== payment.providerOrderId
    || retrieved.transactionId !== envelope.candidate?.transactionId
    || callbackTransactionType !== "PAYMENT";
  if (identityMismatch) return "SALE_IDENTITY_MISMATCH";
  if (retrieved.currency !== payment.currency || amountMinor !== payment.amount) {
    return "SALE_MONEY_MISMATCH";
  }
  return null;
}

function exactRetrievedIdentityAndMoney(
  retrieved: EximbayBf4RetrievedPayment,
  envelope: EximbayBf4Envelope,
  payment: EximbayBf4PaymentCorrelation,
  expectedMid: string,
  amountMinor: number,
): boolean {
  return retrieved.mid === expectedMid
    && retrieved.orderId === payment.providerOrderId
    && retrieved.transactionId === envelope.candidate?.transactionId
    && retrieved.currency === payment.currency
    && amountMinor === payment.amount;
}

function decodeRetrievedAmount(retrieved: EximbayBf4RetrievedPayment): number | null {
  try {
    return decodeEximbayAmount(retrieved.currency, retrieved.amount);
  } catch {
    return null;
  }
}

function encodePersistedAmount(payment: EximbayBf4PaymentCorrelation): string {
  if (payment.currency === "JPY") return String(payment.amount);
  if (payment.currency !== "USD") throw new Error("BF4_UNSUPPORTED_CURRENCY");
  const digits = String(payment.amount).padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function requireEximbayCurrency(currency: string): "USD" | "JPY" {
  if (currency === "USD" || currency === "JPY") return currency;
  throw new Error("BF4_UNSUPPORTED_CURRENCY");
}

function requireProviderOrderId(payment: EximbayBf4PaymentCorrelation): string {
  if (!payment.providerOrderId) throw new Error("BF4_PROVIDER_ORDER_ID_MISSING");
  return payment.providerOrderId;
}

function requireCandidateTransactionId(envelope: EximbayBf4Envelope): string {
  const transactionId = envelope.candidate?.transactionId;
  if (!transactionId) throw new Error("BF4_TRANSACTION_ID_MISSING");
  return transactionId;
}

function requireExactRaw(envelope: EximbayBf4Envelope): string {
  if (envelope.exactRawQuery === undefined) throw new Error("BF4_EXACT_RAW_MISSING");
  return envelope.exactRawQuery;
}

async function markPaymentOutcomeUnknown(
  client: Pick<PrismaClient, "payment">,
  payment: EximbayBf4PaymentCorrelation,
): Promise<void> {
  await client.payment.updateMany({
    where: safePaymentTransitionWhere(payment),
    data: { attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN },
  });
}

function safePaymentTransitionWhere(payment: EximbayBf4PaymentCorrelation) {
  return {
    id: payment.id,
    provider: PaymentProvider.EXIMBAY,
    providerOrderId: payment.providerOrderId,
    providerPaymentKey: null,
    contactStartedAt: { not: null },
    financialSucceededAt: null,
    remediationStatus: PaymentRemediationStatus.NONE,
    blockingEndedAt: null,
    suspendedByPaymentId: null,
    status: { in: [PaymentAttemptStatus.INITIATED, PaymentAttemptStatus.AWAITING] },
    attemptLifecycle: { in: [PaymentAttemptLifecycle.CONTACTED, PaymentAttemptLifecycle.OUTCOME_UNKNOWN] },
  };
}

function changedTimestamps(envelope: EximbayBf4Envelope, now: Date): EximbayBf4Envelope["timestamps"] {
  return { ...envelope.timestamps, stageChangedAt: now.toISOString() };
}

async function latestResult(client: PrismaClient, eventId: string): Promise<ProcessEximbayBf4StatusResult> {
  const event = await loadEximbayBf4Event(client, eventId);
  if (!event) return noEvent("conflict");
  return resultFromEvent(event);
}

function resultFromEvent(event: EximbayBf4RecordedEvent): ProcessEximbayBf4StatusResult {
  return handled(event.id, validateEximbayBf4Envelope(event.raw));
}

function handled(eventId: string, envelope: EximbayBf4Envelope): ProcessEximbayBf4StatusResult {
  return Object.freeze({
    kind: "handled",
    eventId,
    stage: envelope.stage,
    acknowledgement: eximbayBf4Acknowledgement(envelope),
  });
}

function noEvent(kind: "notCorrelated" | "conflict"): ProcessEximbayBf4StatusResult {
  const acknowledgement: EximbayBf4Acknowledgement = Object.freeze({
    kind: "NON_SUCCESS_EVIDENCE_GATED",
  });
  return Object.freeze({ kind, acknowledgement });
}
