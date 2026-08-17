import "server-only";
import {
  PaymentEventFailureStage,
  PaymentEventSource,
  PaymentEventStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentRemediationStatus,
  PaymentProvider,
  Prisma,
  type PaymentEvent,
  type PrismaClient,
} from "@prisma/client";
import {
  EXIMBAY_BF4_EVENT_TYPE,
  EXIMBAY_BF4_SCHEMA,
  EXIMBAY_BF4_VERSION,
  EximbayBf4Stage,
  eximbayBf4EnvelopeJson,
  eximbayBf4RawClaim,
  eximbayBf4RejectTombstone,
  eximbayBf4TransactionClaim,
  minimizeEximbayBf4Envelope,
  validateEximbayBf4Envelope,
  type EximbayBf4Envelope,
} from "./bf4-envelope";

type ClaimTx = Prisma.TransactionClient;
type EventClient = Pick<PrismaClient, "$transaction" | "paymentEvent">;

export type EximbayBf4PaymentCorrelation = NonNullable<Awaited<ReturnType<typeof correlateEximbayBf4Payment>>>;
export type EximbayBf4RecordedEvent = Pick<
  PaymentEvent,
  | "id"
  | "provider"
  | "source"
  | "transmissionId"
  | "eventType"
  | "verifiedMode"
  | "verifiedCredentialBinding"
  | "checkoutSessionId"
  | "providerPaymentKey"
  | "raw"
  | "status"
  | "receivedAt"
  | "processedAt"
>;

export type EximbayBf4ClaimResult =
  | Readonly<{ kind: "event"; event: EximbayBf4RecordedEvent; created: boolean }>
  | Readonly<{ kind: "rejectedReplay"; event: EximbayBf4RecordedEvent }>
  | Readonly<{ kind: "conflict" }>;

export interface EximbayBf4EventTransitionInput {
  readonly eventId: string;
  readonly expectedStage: EximbayBf4Envelope["stage"];
  readonly envelope: EximbayBf4Envelope;
  readonly verifiedMode?: "SANDBOX" | "LIVE";
  readonly verifiedCredentialBinding?: string;
  readonly providerPaymentKey?: string;
}

export type EximbayBf4SaleMoneyMismatchTransitionResult =
  | "ATOMIC_PAYMENT_AND_EVENT"
  | "EVENT_ONLY_UNSAFE_PAYMENT"
  | "CONFLICT";

class PostClaimTombstoneError extends Error {
  constructor() {
    super("BF4_POST_CLAIM_TOMBSTONE");
  }
}

export async function correlateEximbayBf4Payment(
  client: Pick<PrismaClient, "payment">,
  providerOrderId: string,
) {
  return client.payment.findUnique({
    where: {
      provider_providerOrderId: {
        provider: PaymentProvider.EXIMBAY,
        providerOrderId,
      },
    },
    select: {
      id: true,
      checkoutSessionId: true,
      provider: true,
      mode: true,
      status: true,
      attemptLifecycle: true,
      remediationStatus: true,
      amount: true,
      currency: true,
      providerOrderId: true,
      providerPaymentKey: true,
      initiationOutputKind: true,
      contactStartedAt: true,
      financialSucceededAt: true,
      blockingEndedAt: true,
      suspendedByPaymentId: true,
    },
  });
}

export async function transitionEximbayBf4ContactMarker(
  client: Pick<PrismaClient, "$transaction">,
  payment: EximbayBf4PaymentCorrelation,
  input: EximbayBf4EventTransitionInput,
): Promise<boolean> {
  return client.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "Payment" WHERE "id" = ${payment.id} FOR UPDATE
    `);
    const current = await correlateEximbayBf4Payment(tx, requireProviderOrderId(payment));
    if (!current || !sameContactAuthority(current, payment) || !contactSafePayment(current)) return false;
    return transitionEximbayBf4Event(tx, input);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function transitionEximbayBf4SaleMoneyMismatch(
  client: Pick<PrismaClient, "$transaction">,
  payment: EximbayBf4PaymentCorrelation,
  input: EximbayBf4EventTransitionInput,
): Promise<EximbayBf4SaleMoneyMismatchTransitionResult> {
  return client.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "Payment" WHERE "id" = ${payment.id} FOR UPDATE
    `);
    const current = await correlateEximbayBf4Payment(tx, requireProviderOrderId(payment));
    const safePayment = current !== null
      && sameContactAuthority(current, payment)
      && contactSafePayment(current)
      ? current
      : null;
    const eventPersisted = await transitionEximbayBf4Event(tx, input);
    if (!eventPersisted) return "CONFLICT";
    if (!safePayment) return "EVENT_ONLY_UNSAFE_PAYMENT";
    const updated = await tx.payment.updateMany({
      where: { id: safePayment.id },
      data: { attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN },
    });
    if (updated.count !== 1) throw new Error("BF4_SALE_MONEY_MISMATCH_PAYMENT_UPDATE_FAILED");
    return "ATOMIC_PAYMENT_AND_EVENT";
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function claimEximbayBf4Event(
  client: EventClient,
  payment: EximbayBf4PaymentCorrelation,
  envelopeInput: EximbayBf4Envelope,
): Promise<EximbayBf4ClaimResult> {
  const envelope = validateEximbayBf4Envelope(envelopeInput);
  const activeClaim = activeTransmissionId(envelope);
  const tombstone = eximbayBf4RejectTombstone(envelope.exactRawSha256);
  try {
    return await client.$transaction(
      (tx) => admitClaim(tx, payment, envelope, activeClaim, tombstone),
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  } catch (error) {
    if (error instanceof PostClaimTombstoneError) {
      return loadRejectedReplay(client, payment, envelope, tombstone);
    }
    if (isUniqueConflict(error)) return loadActiveReplay(client, payment, envelope, activeClaim);
    throw error;
  }
}

export async function transitionEximbayBf4Event(
  client: Pick<PrismaClient, "paymentEvent"> | ClaimTx,
  input: EximbayBf4EventTransitionInput,
): Promise<boolean> {
  const envelope = validateEximbayBf4Envelope(input.envelope);
  if (!allowedTransition(input.expectedStage, envelope.stage)) return false;
  const data = transitionData(envelope, input);
  const result = await client.paymentEvent.updateMany({
    where: eventStageWhere(input.eventId, input.expectedStage),
    data,
  });
  return result.count === 1;
}

export async function rotateEximbayBf4ClaimToRejected(
  tx: ClaimTx,
  eventId: string,
  expectedStage: typeof EximbayBf4Stage.VERIFY_OUTCOME_UNKNOWN,
  terminalAt: Date,
): Promise<boolean> {
  const event = await tx.paymentEvent.findUnique({ where: { id: eventId }, select: eventSelect() });
  if (!event || event.provider !== PaymentProvider.EXIMBAY || !event.transmissionId) return false;
  const current = validateEximbayBf4Envelope(event.raw);
  if (current.stage !== expectedStage) return false;
  const timestamp = terminalAt.toISOString();
  const envelope = minimizeEximbayBf4Envelope(current, {
    stage: EximbayBf4Stage.TERMINAL_REJECTED,
    verification: "DEFINITIVELY_REJECTED",
    retrieval: "NOT_ATTEMPTED",
    timestamps: {
      receivedAt: current.timestamps.receivedAt,
      stageChangedAt: timestamp,
      verifyContactMarkedAt: current.timestamps.verifyContactMarkedAt,
      terminalAt: timestamp,
    },
    diagnostic: "DEFINITIVE_REJECT",
  });
  const data: Prisma.PaymentEventUpdateManyMutationInput = {
    transmissionId: eximbayBf4RejectTombstone(current.exactRawSha256),
    raw: eximbayBf4EnvelopeJson(envelope),
    status: PaymentEventStatus.FAILED,
    processedAt: terminalAt,
    failureStage: PaymentEventFailureStage.PARSE,
    failureCode: "BF4.DEFINITIVE_REJECT",
    lastError: "BF4 verification definitively rejected the exact callback.",
  };
  const result = await tx.paymentEvent.updateMany({
    where: {
      ...eventStageWhere(eventId, expectedStage),
      transmissionId: event.transmissionId,
    },
    data,
  });
  return result.count === 1;
}

export async function loadEximbayBf4Event(
  client: Pick<PrismaClient, "paymentEvent">,
  eventId: string,
): Promise<EximbayBf4RecordedEvent | null> {
  return client.paymentEvent.findUnique({ where: { id: eventId }, select: eventSelect() });
}

async function admitClaim(
  tx: ClaimTx,
  payment: EximbayBf4PaymentCorrelation,
  envelope: EximbayBf4Envelope,
  activeClaim: string,
  tombstone: string,
): Promise<EximbayBf4ClaimResult> {
  const rejected = await findByTransmissionId(tx, tombstone);
  if (rejected) return exactRejectedReplay(rejected, payment, envelope);
  const event = await tx.paymentEvent.create({
    data: {
      provider: PaymentProvider.EXIMBAY,
      source: PaymentEventSource.WEBHOOK,
      transmissionId: activeClaim,
      eventType: EXIMBAY_BF4_EVENT_TYPE,
      checkoutSessionId: payment.checkoutSessionId,
      raw: eximbayBf4EnvelopeJson(envelope),
      status: PaymentEventStatus.RECEIVED,
      receivedAt: new Date(envelope.timestamps.receivedAt),
    },
    select: eventSelect(),
  });
  const postClaimRejected = await findByTransmissionId(tx, tombstone);
  if (postClaimRejected) throw new PostClaimTombstoneError();
  return Object.freeze({ kind: "event", event, created: true });
}

async function loadRejectedReplay(
  client: Pick<PrismaClient, "paymentEvent">,
  payment: EximbayBf4PaymentCorrelation,
  envelope: EximbayBf4Envelope,
  tombstone: string,
): Promise<EximbayBf4ClaimResult> {
  const event = await findByTransmissionId(client, tombstone);
  if (!event) return Object.freeze({ kind: "conflict" });
  return exactRejectedReplay(event, payment, envelope);
}

async function loadActiveReplay(
  client: Pick<PrismaClient, "paymentEvent">,
  payment: EximbayBf4PaymentCorrelation,
  incoming: EximbayBf4Envelope,
  activeClaim: string,
): Promise<EximbayBf4ClaimResult> {
  const event = await findByTransmissionId(client, activeClaim);
  if (!event || !exactActiveReplay(event, payment, incoming)) {
    return Object.freeze({ kind: "conflict" });
  }
  return Object.freeze({ kind: "event", event, created: false });
}

function exactRejectedReplay(
  event: EximbayBf4RecordedEvent,
  payment: EximbayBf4PaymentCorrelation,
  incoming: EximbayBf4Envelope,
): EximbayBf4ClaimResult {
  const stored = validateEximbayBf4Envelope(event.raw);
  const exact = event.provider === PaymentProvider.EXIMBAY
    && event.eventType === EXIMBAY_BF4_EVENT_TYPE
    && event.checkoutSessionId === payment.checkoutSessionId
    && stored.stage === EximbayBf4Stage.TERMINAL_REJECTED
    && stored.verification === "DEFINITIVELY_REJECTED"
    && stored.exactRawSha256 === incoming.exactRawSha256;
  if (!exact) return Object.freeze({ kind: "conflict" });
  return Object.freeze({ kind: "rejectedReplay", event });
}

function exactActiveReplay(
  event: EximbayBf4RecordedEvent,
  payment: EximbayBf4PaymentCorrelation,
  incoming: EximbayBf4Envelope,
): boolean {
  const eventMismatch = [
    event.provider !== PaymentProvider.EXIMBAY,
    event.source !== PaymentEventSource.WEBHOOK,
    event.eventType !== EXIMBAY_BF4_EVENT_TYPE,
    event.checkoutSessionId !== payment.checkoutSessionId,
  ].some(Boolean);
  if (eventMismatch) return false;
  const stored = validateEximbayBf4Envelope(event.raw);
  if (stored.exactRawSha256 !== incoming.exactRawSha256) return false;
  if (stored.exactRawQuery !== undefined) return matchesUnresolvedReplay(stored, incoming);
  return matchesMinimizedSaleReplay(stored, incoming);
}

function matchesUnresolvedReplay(
  stored: EximbayBf4Envelope,
  incoming: EximbayBf4Envelope,
): boolean {
  return ![
    stored.exactRawQuery !== incoming.exactRawQuery,
    stored.candidate?.orderId !== incoming.candidate?.orderId,
    stored.candidate?.transactionId !== incoming.candidate?.transactionId,
  ].some(Boolean);
}

function matchesMinimizedSaleReplay(
  stored: EximbayBf4Envelope,
  incoming: EximbayBf4Envelope,
): boolean {
  const saleFacts = stored.saleFacts;
  if (!saleFacts) return false;
  return saleFacts.providerOrderId === incoming.candidate?.orderId
    && saleFacts.transactionId === incoming.candidate?.transactionId;
}

function activeTransmissionId(envelope: EximbayBf4Envelope): string {
  const transactionId = envelope.candidate?.transactionId;
  if (transactionId) return eximbayBf4TransactionClaim(transactionId);
  return eximbayBf4RawClaim(envelope.exactRawSha256);
}

function sameContactAuthority(
  current: EximbayBf4PaymentCorrelation,
  expected: EximbayBf4PaymentCorrelation,
): boolean {
  return current.id === expected.id
    && current.checkoutSessionId === expected.checkoutSessionId
    && current.mode === expected.mode
    && current.providerOrderId === expected.providerOrderId
    && current.amount === expected.amount
    && current.currency === expected.currency;
}

function contactSafePayment(payment: EximbayBf4PaymentCorrelation): boolean {
  const lifecycleSafe = payment.attemptLifecycle === PaymentAttemptLifecycle.CONTACTED
    || payment.attemptLifecycle === PaymentAttemptLifecycle.OUTCOME_UNKNOWN;
  const statusSafe = payment.status === PaymentAttemptStatus.INITIATED
    || payment.status === PaymentAttemptStatus.AWAITING;
  return ![
    payment.provider !== PaymentProvider.EXIMBAY,
    payment.providerOrderId === null,
    payment.providerPaymentKey !== null,
    payment.contactStartedAt === null,
    payment.financialSucceededAt !== null,
    payment.remediationStatus !== PaymentRemediationStatus.NONE,
    payment.blockingEndedAt !== null,
    payment.suspendedByPaymentId !== null,
    !lifecycleSafe,
    !statusSafe,
  ].some(Boolean);
}

function requireProviderOrderId(payment: EximbayBf4PaymentCorrelation): string {
  if (!payment.providerOrderId) throw new Error("BF4_PROVIDER_ORDER_ID_MISSING");
  return payment.providerOrderId;
}

function transitionData(
  envelope: EximbayBf4Envelope,
  input: EximbayBf4EventTransitionInput,
): Prisma.PaymentEventUpdateManyMutationInput {
  const data: Prisma.PaymentEventUpdateManyMutationInput = {
    raw: eximbayBf4EnvelopeJson(envelope),
    status: outerStatus(envelope.stage),
    processedAt: terminalDate(envelope),
    failureStage: failureStage(envelope.stage),
    failureCode: failureCode(envelope),
    lastError: failureMessage(envelope),
  };
  if (input.verifiedMode !== undefined) data.verifiedMode = input.verifiedMode;
  if (input.verifiedCredentialBinding !== undefined) {
    data.verifiedCredentialBinding = input.verifiedCredentialBinding;
  }
  if (input.providerPaymentKey !== undefined) data.providerPaymentKey = input.providerPaymentKey;
  return data;
}

function eventStageWhere(eventId: string, expectedStage: EximbayBf4Envelope["stage"]): Prisma.PaymentEventWhereInput {
  return {
    id: eventId,
    provider: PaymentProvider.EXIMBAY,
    eventType: EXIMBAY_BF4_EVENT_TYPE,
    AND: [
      { raw: { path: ["schema"], equals: EXIMBAY_BF4_SCHEMA } },
      { raw: { path: ["version"], equals: EXIMBAY_BF4_VERSION } },
      { raw: { path: ["stage"], equals: expectedStage } },
    ],
  };
}

function allowedTransition(from: EximbayBf4Envelope["stage"], to: EximbayBf4Envelope["stage"]): boolean {
  const allowed = TRANSITIONS[from];
  return allowed.includes(to);
}

const TRANSITIONS: Readonly<Record<EximbayBf4Envelope["stage"], readonly EximbayBf4Envelope["stage"][]>> = Object.freeze({
  CLAIMED_PRE_VERIFY: [EximbayBf4Stage.VERIFY_OUTCOME_UNKNOWN],
  VERIFY_OUTCOME_UNKNOWN: [EximbayBf4Stage.VERIFIED_PENDING_RETRIEVE, EximbayBf4Stage.TERMINAL_REJECTED],
  VERIFIED_PENDING_RETRIEVE: [EximbayBf4Stage.RETRIEVE_OUTCOME_UNKNOWN],
  RETRIEVE_OUTCOME_UNKNOWN: [
    EximbayBf4Stage.VERIFIED_SALE_PENDING_COMPLETION,
    EximbayBf4Stage.VERIFIED_NON_SALE_REQUIRES_ADJUDICATION,
    EximbayBf4Stage.VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION,
  ],
  VERIFIED_SALE_PENDING_COMPLETION: [
    EximbayBf4Stage.COMPLETION_RETRYABLE,
    EximbayBf4Stage.TERMINAL_PROCESSED,
    EximbayBf4Stage.TERMINAL_REJECTED,
  ],
  VERIFIED_NON_SALE_REQUIRES_ADJUDICATION: [],
  VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION: [],
  COMPLETION_RETRYABLE: [EximbayBf4Stage.TERMINAL_PROCESSED, EximbayBf4Stage.TERMINAL_REJECTED],
  TERMINAL_PROCESSED: [],
  TERMINAL_REJECTED: [],
});

function outerStatus(stage: EximbayBf4Envelope["stage"]): PaymentEventStatus {
  if (stage === EximbayBf4Stage.TERMINAL_PROCESSED) return PaymentEventStatus.PROCESSED;
  if (stage === EximbayBf4Stage.TERMINAL_REJECTED) return PaymentEventStatus.FAILED;
  if (stage === EximbayBf4Stage.COMPLETION_RETRYABLE) return PaymentEventStatus.RETRYABLE_FAILED;
  return PaymentEventStatus.RECEIVED;
}

function terminalDate(envelope: EximbayBf4Envelope): Date | null {
  const terminalAt = envelope.timestamps.terminalAt;
  return terminalAt ? new Date(terminalAt) : null;
}

function failureStage(stage: EximbayBf4Envelope["stage"]): PaymentEventFailureStage | null {
  if (stage === EximbayBf4Stage.COMPLETION_RETRYABLE || stage === EximbayBf4Stage.TERMINAL_REJECTED) {
    return PaymentEventFailureStage.COMPLETE;
  }
  return null;
}

function failureCode(envelope: EximbayBf4Envelope): string | null {
  if (!envelope.diagnostic) return null;
  return `BF4.${envelope.diagnostic}`;
}

function failureMessage(envelope: EximbayBf4Envelope): string | null {
  if (!envelope.diagnostic) return null;
  return "BF4 processing stopped at a closed safe disposition.";
}

function findByTransmissionId(
  client: Pick<ClaimTx, "paymentEvent"> | Pick<PrismaClient, "paymentEvent">,
  transmissionId: string,
): Promise<EximbayBf4RecordedEvent | null> {
  return client.paymentEvent.findUnique({
    where: {
      provider_transmissionId: {
        provider: PaymentProvider.EXIMBAY,
        transmissionId,
      },
    },
    select: eventSelect(),
  });
}

function eventSelect(): Prisma.PaymentEventSelect {
  return {
    id: true,
    provider: true,
    source: true,
    transmissionId: true,
    eventType: true,
    verifiedMode: true,
    verifiedCredentialBinding: true,
    checkoutSessionId: true,
    providerPaymentKey: true,
    raw: true,
    status: true,
    receivedAt: true,
    processedAt: true,
  };
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code === "P2002"
    : hasErrorCode(error, "P2002");
}

function hasErrorCode(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return error.code === code;
}
