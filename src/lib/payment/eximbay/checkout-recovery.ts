import "server-only";

import {
  CheckoutSessionStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentEventSource,
  PaymentEventStatus,
  PaymentMode,
  PaymentProvider,
  PaymentRemediationStatus,
  Prisma,
  type Payment,
  type PrismaClient,
} from "@prisma/client";
import { isUsable } from "@/lib/payment/session";
import { hasUnresolvedSessionExposure } from "@/lib/payment/remediation";
import type { ProviderEnv } from "@/lib/payment/providers/credentials";
import {
  requireEximbayBf4ConfigFacts,
  resolveEximbayBf4Config,
  retrieveEximbayCheckoutRecoveryStatus,
  type EximbayBf4Fetch,
  type EximbayBf4OutcomeUnknownDiagnostic,
  type EximbayCheckoutRecoveryRetrieveResult,
} from "./bf4-contact";
import { EXIMBAY_BF4_EVENT_TYPE } from "./bf4-envelope";

export const EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED =
  "EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED";
export const EXIMBAY_CHECKOUT_RECOVERY_EVENT_TYPE = "EXIMBAY_NO_TRANSACTION_OBSERVED";
export const EXIMBAY_NO_TRANSACTION_OBSERVED = "EXIMBAY_NO_TRANSACTION_OBSERVED";
export const EXIMBAY_RELEASED_ATTEMPT_OUTCOME_UNKNOWN =
  "EXIMBAY_RELEASED_ATTEMPT_OUTCOME_UNKNOWN";
export const EXIMBAY_CHECKOUT_RECOVERY_OUTCOME_UNKNOWN_LOG_EVENT =
  "EXIMBAY_CHECKOUT_RECOVERY_OUTCOME_UNKNOWN_V1";

type RecoveryPayment = Pick<
  Payment,
  | "id"
  | "checkoutSessionId"
  | "provider"
  | "mode"
  | "status"
  | "attemptLifecycle"
  | "remediationStatus"
  | "amount"
  | "currency"
  | "providerOrderId"
  | "providerPaymentKey"
  | "contactStartedAt"
  | "financialSucceededAt"
  | "blockingEndedAt"
  | "suspendedByPaymentId"
  | "errorCode"
>;

export type EximbayCheckoutRecoveryResult =
  | Readonly<{ kind: "released"; paymentId: string; eventId: string; releasedAt: Date }>
  | Readonly<{ kind: "replayed"; paymentId: string; eventId: string; releasedAt: Date }>
  | Readonly<{
      kind: "notReleased";
      reason: "DISABLED" | "NOT_ELIGIBLE" | "TRANSACTION_OBSERVED" | "OUTCOME_UNKNOWN" | "STATE_CHANGED";
    }>;

export interface RecoverEximbayCheckoutInput {
  readonly checkoutSessionId: string;
  readonly paymentId: string;
  readonly authenticatedUserId: string;
  readonly env?: ProviderEnv;
  readonly transport: EximbayBf4Fetch;
  readonly now?: () => Date;
}

export class EximbayCheckoutRecoveryConfigError extends Error {
  constructor() {
    super("EXIMBAY_CHECKOUT_RECOVERY_INVALID_ACTIVATION");
    this.name = "EximbayCheckoutRecoveryConfigError";
  }
}

export function checkoutRecoveryTransmissionId(paymentId: string): string {
  return `eximbay:checkout-recovery:q004:${paymentId}`;
}

export async function recoverEximbayCheckout(
  client: PrismaClient,
  input: RecoverEximbayCheckoutInput,
): Promise<EximbayCheckoutRecoveryResult> {
  const env = input.env ?? process.env;
  const activation = parseActivation(env[EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED]);
  if (activation === "DISABLED") return Object.freeze({ kind: "notReleased", reason: "DISABLED" });
  if (activation === "INVALID") throw new EximbayCheckoutRecoveryConfigError();
  const preflight = await checkoutRecoveryPreflight(client, input);
  if (preflight.kind !== "eligible") return preflight.result;
  const initial = preflight.owned;
  const config = resolveEximbayBf4Config(initial.payment.mode, env);
  const retrieved = await retrieveEximbayCheckoutRecoveryStatus(config, {
    providerOrderId: requireProviderOrderId(initial.payment),
    currency: initial.payment.currency,
    amountWire: encodeAmountWire(initial.payment),
    language: "EN",
  }, input.transport);
  const providerDisposition = recoveryProviderDisposition(retrieved, initial.payment);
  if (providerDisposition !== null) return providerDisposition;

  const observedAt = input.now?.() ?? new Date();
  const configFacts = requireEximbayBf4ConfigFacts(config);
  return client.$transaction(async (tx) => releaseAfterQ004(tx, {
    ...input,
    observedAt,
    credentialBinding: configFacts.credentialBinding,
  }), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

type RecoveryPreflight =
  | Readonly<{ kind: "eligible"; owned: OwnedPayment }>
  | Readonly<{ kind: "result"; result: EximbayCheckoutRecoveryResult }>;

async function checkoutRecoveryPreflight(
  client: PrismaClient,
  input: RecoverEximbayCheckoutInput,
): Promise<RecoveryPreflight> {
  const owned = await loadOwnedPayment(client, input);
  if (!owned) return recoveryPreflightResult("NOT_ELIGIBLE");
  const replay = await loadExactReplay(client, owned.payment);
  if (replay.kind === "replayed") return Object.freeze({ kind: "result", result: replay });
  if (replay.kind === "split") throw new Error("EXIMBAY_CHECKOUT_RECOVERY_SPLIT_EVIDENCE");
  const eligible = await isEligibleBeforeContact(client, owned, input.now?.() ?? new Date());
  return eligible
    ? Object.freeze({ kind: "eligible", owned })
    : recoveryPreflightResult("NOT_ELIGIBLE");
}

function recoveryPreflightResult(
  reason: Extract<EximbayCheckoutRecoveryResult, { kind: "notReleased" }>["reason"],
): RecoveryPreflight {
  return Object.freeze({ kind: "result", result: Object.freeze({ kind: "notReleased", reason }) });
}

function recoveryProviderDisposition(
  retrieved: EximbayCheckoutRecoveryRetrieveResult,
  payment: RecoveryPayment,
): EximbayCheckoutRecoveryResult | null {
  if (retrieved.kind === "transactionObserved") {
    return Object.freeze({ kind: "notReleased", reason: "TRANSACTION_OBSERVED" });
  }
  if (retrieved.kind === "outcomeUnknown") {
    emitOutcomeUnknownDiagnostic({
      checkoutSessionId: payment.checkoutSessionId,
      paymentId: payment.id,
      diagnostic: retrieved.diagnostic,
    });
    return Object.freeze({ kind: "notReleased", reason: "OUTCOME_UNKNOWN" });
  }
  return null;
}

function emitOutcomeUnknownDiagnostic(input: Readonly<{
  checkoutSessionId: string;
  paymentId: string;
  diagnostic: EximbayBf4OutcomeUnknownDiagnostic;
}>): void {
  try {
    console.warn(JSON.stringify(Object.freeze({
      event: EXIMBAY_CHECKOUT_RECOVERY_OUTCOME_UNKNOWN_LOG_EVENT,
      checkoutSessionId: input.checkoutSessionId,
      paymentId: input.paymentId,
      mode: PaymentMode.SANDBOX,
      ...input.diagnostic,
    })));
  } catch {
    return;
  }
}

async function releaseAfterQ004(
  tx: Prisma.TransactionClient,
  input: RecoverEximbayCheckoutInput & { observedAt: Date; credentialBinding: string },
): Promise<EximbayCheckoutRecoveryResult> {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "CheckoutSession" WHERE "id" = ${input.checkoutSessionId} FOR UPDATE
  `);
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "Payment" WHERE "id" = ${input.paymentId} FOR UPDATE
  `);
  const current = await loadOwnedPayment(tx, input);
  if (!current) return Object.freeze({ kind: "notReleased", reason: "STATE_CHANGED" });
  const replay = await loadExactReplay(tx, current.payment);
  if (replay.kind === "replayed") return replay;
  if (replay.kind === "split") throw new Error("EXIMBAY_CHECKOUT_RECOVERY_SPLIT_EVIDENCE");
  if (!await isEligibleBeforeContact(tx, current, input.observedAt)) {
    return Object.freeze({ kind: "notReleased", reason: "STATE_CHANGED" });
  }
  if (await hasClaimedCallback(tx, current.payment)) {
    return Object.freeze({ kind: "notReleased", reason: "STATE_CHANGED" });
  }

  const transmissionId = checkoutRecoveryTransmissionId(current.payment.id);
  const event = await tx.paymentEvent.create({
    data: {
      provider: PaymentProvider.EXIMBAY,
      source: PaymentEventSource.API,
      transmissionId,
      eventType: EXIMBAY_CHECKOUT_RECOVERY_EVENT_TYPE,
      verifiedMode: PaymentMode.SANDBOX,
      verifiedCredentialBinding: input.credentialBinding,
      checkoutSessionId: current.payment.checkoutSessionId,
      raw: recoveryEvidence(current.payment, input.observedAt, input.credentialBinding),
      status: PaymentEventStatus.PROCESSED,
      receivedAt: input.observedAt,
      processedAt: input.observedAt,
    },
    select: { id: true },
  });
  const updated = await tx.payment.updateMany({
    where: exactEligiblePaymentWhere(current.payment),
    data: {
      blockingEndedAt: input.observedAt,
      errorCode: EXIMBAY_NO_TRANSACTION_OBSERVED,
      errorMessage: "Eximbay retrieve returned Q004 at the observation used to release the checkout retry slot.",
    },
  });
  if (updated.count !== 1) throw new Error("EXIMBAY_CHECKOUT_RECOVERY_RELEASE_CONFLICT");
  return Object.freeze({
    kind: "released",
    paymentId: current.payment.id,
    eventId: event.id,
    releasedAt: input.observedAt,
  });
}

type OwnedPayment = Readonly<{
  payment: RecoveryPayment;
  session: Readonly<{
    id: string;
    userId: string;
    status: CheckoutSessionStatus;
    expiresAt: Date;
    order: { id: string } | null;
  }>;
}>;

async function loadOwnedPayment(
  client: Pick<PrismaClient, "checkoutSession" | "payment"> | Prisma.TransactionClient,
  input: Pick<RecoverEximbayCheckoutInput, "checkoutSessionId" | "paymentId" | "authenticatedUserId">,
): Promise<OwnedPayment | null> {
  const session = await client.checkoutSession.findFirst({
    where: { id: input.checkoutSessionId, userId: input.authenticatedUserId },
    select: { id: true, userId: true, status: true, expiresAt: true, order: { select: { id: true } } },
  });
  if (!session) return null;
  const payment = await client.payment.findFirst({
    where: { id: input.paymentId, checkoutSessionId: session.id },
    select: recoveryPaymentSelect(),
  });
  return payment ? Object.freeze({ payment, session }) : null;
}

async function isEligibleBeforeContact(
  client: Pick<PrismaClient, "payment"> | Prisma.TransactionClient,
  owned: OwnedPayment,
  now: Date,
): Promise<boolean> {
  if (owned.session.order !== null || !isUsable(owned.session, now)) return false;
  if (!isExactRecoverableBlocker(owned.payment)) return false;
  if (await hasUnresolvedSessionExposure(client, owned.payment.checkoutSessionId)) return false;
  const blockers = await client.payment.count({
    where: { checkoutSessionId: owned.payment.checkoutSessionId, blockingEndedAt: null },
  });
  return blockers === 1;
}

export function isExactRecoverableBlocker(payment: RecoveryPayment): boolean {
  return ![
    payment.provider !== PaymentProvider.EXIMBAY,
    payment.mode !== PaymentMode.SANDBOX,
    payment.status !== PaymentAttemptStatus.INITIATED && payment.status !== PaymentAttemptStatus.AWAITING,
    payment.attemptLifecycle !== PaymentAttemptLifecycle.CONTACTED,
    payment.remediationStatus !== PaymentRemediationStatus.NONE,
    payment.contactStartedAt === null,
    payment.providerOrderId === null,
    payment.providerPaymentKey !== null,
    payment.financialSucceededAt !== null,
    payment.blockingEndedAt !== null,
    payment.suspendedByPaymentId !== null,
  ].some(Boolean);
}

export function isExactQ004ReleasedPayment(payment: RecoveryPayment): boolean {
  return ![
    payment.provider !== PaymentProvider.EXIMBAY,
    payment.mode !== PaymentMode.SANDBOX,
    payment.status !== PaymentAttemptStatus.INITIATED && payment.status !== PaymentAttemptStatus.AWAITING,
    payment.attemptLifecycle !== PaymentAttemptLifecycle.CONTACTED,
    payment.remediationStatus !== PaymentRemediationStatus.NONE,
    payment.contactStartedAt === null,
    payment.providerOrderId === null,
    payment.providerPaymentKey !== null,
    payment.financialSucceededAt !== null,
    payment.blockingEndedAt === null,
    payment.suspendedByPaymentId !== null,
    payment.errorCode !== EXIMBAY_NO_TRANSACTION_OBSERVED,
  ].some(Boolean);
}

type ReplayRead =
  | Exclude<EximbayCheckoutRecoveryResult, { kind: "released" | "notReleased" }>
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "split" }>;

async function loadExactReplay(
  client: Pick<PrismaClient, "paymentEvent"> | Prisma.TransactionClient,
  payment: RecoveryPayment,
): Promise<ReplayRead> {
  const event = await client.paymentEvent.findUnique({
    where: {
      provider_transmissionId: {
        provider: PaymentProvider.EXIMBAY,
        transmissionId: checkoutRecoveryTransmissionId(payment.id),
      },
    },
    select: {
      id: true,
      source: true,
      eventType: true,
      verifiedMode: true,
      verifiedCredentialBinding: true,
      checkoutSessionId: true,
      raw: true,
      status: true,
      receivedAt: true,
      processedAt: true,
    },
  });
  const released = isExactQ004ReleasedPayment(payment);
  if (!event && !released) return Object.freeze({ kind: "none" });
  if (!event || !released || !isExactQ004RecoveryEvent(event, payment)) return Object.freeze({ kind: "split" });
  const releasedAt = payment.blockingEndedAt;
  if (!releasedAt) return Object.freeze({ kind: "split" });
  return Object.freeze({
    kind: "replayed",
    paymentId: payment.id,
    eventId: event.id,
    releasedAt,
  });
}

async function hasClaimedCallback(
  tx: Prisma.TransactionClient,
  payment: RecoveryPayment,
): Promise<boolean> {
  const count = await tx.paymentEvent.count({
    where: {
      provider: PaymentProvider.EXIMBAY,
      source: PaymentEventSource.WEBHOOK,
      eventType: EXIMBAY_BF4_EVENT_TYPE,
      checkoutSessionId: payment.checkoutSessionId,
      OR: [
        { raw: { path: ["candidate", "orderId"], equals: payment.providerOrderId ?? "__missing__" } },
        { raw: { path: ["saleFacts", "providerOrderId"], equals: payment.providerOrderId ?? "__missing__" } },
      ],
    },
  });
  return count > 0;
}

function exactEligiblePaymentWhere(payment: RecoveryPayment): Prisma.PaymentWhereInput {
  return {
    id: payment.id,
    checkoutSessionId: payment.checkoutSessionId,
    provider: PaymentProvider.EXIMBAY,
    mode: PaymentMode.SANDBOX,
    status: { in: [PaymentAttemptStatus.INITIATED, PaymentAttemptStatus.AWAITING] },
    attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
    remediationStatus: PaymentRemediationStatus.NONE,
    providerOrderId: payment.providerOrderId,
    providerPaymentKey: null,
    contactStartedAt: { not: null },
    financialSucceededAt: null,
    blockingEndedAt: null,
    suspendedByPaymentId: null,
  };
}

function recoveryEvidence(
  payment: RecoveryPayment,
  observedAt: Date,
  credentialBinding: string,
): Prisma.InputJsonObject {
  return {
    schema: "eximbay.checkout-recovery.q004",
    version: 1,
    paymentId: payment.id,
    checkoutSessionId: payment.checkoutSessionId,
    providerOrderId: requireProviderOrderId(payment),
    mode: PaymentMode.SANDBOX,
    credentialBinding,
    providerCode: "Q004",
    observedAt: observedAt.toISOString(),
    providerResult: { rescode: "Q004" },
  };
}

export function isExactQ004RecoveryEvent(
  event: {
    source: PaymentEventSource;
    eventType: string;
    verifiedMode: PaymentMode | null;
    verifiedCredentialBinding: string | null;
    checkoutSessionId: string | null;
    raw: Prisma.JsonValue;
    status: PaymentEventStatus;
    receivedAt: Date;
    processedAt: Date | null;
  },
  payment: Pick<RecoveryPayment, "id" | "checkoutSessionId" | "providerOrderId" | "blockingEndedAt">,
): boolean {
  const metadataMismatch = [
    event.source !== PaymentEventSource.API,
    event.eventType !== EXIMBAY_CHECKOUT_RECOVERY_EVENT_TYPE,
    event.verifiedMode !== PaymentMode.SANDBOX,
    event.verifiedCredentialBinding === null,
    event.checkoutSessionId !== payment.checkoutSessionId,
    event.status !== PaymentEventStatus.PROCESSED,
    event.processedAt === null,
    payment.blockingEndedAt === null,
    !isRecord(event.raw),
  ].some(Boolean);
  if (metadataMismatch || event.processedAt === null || payment.blockingEndedAt === null || !isRecord(event.raw)) {
    return false;
  }
  if (event.receivedAt.getTime() !== payment.blockingEndedAt.getTime()
    || event.processedAt.getTime() !== payment.blockingEndedAt.getTime()) return false;
  const providerResult = event.raw.providerResult;
  return ![
    event.raw.schema !== "eximbay.checkout-recovery.q004",
    event.raw.version !== 1,
    event.raw.paymentId !== payment.id,
    event.raw.checkoutSessionId !== payment.checkoutSessionId,
    event.raw.providerOrderId !== payment.providerOrderId,
    event.raw.mode !== PaymentMode.SANDBOX,
    event.raw.credentialBinding !== event.verifiedCredentialBinding,
    event.raw.providerCode !== "Q004",
    event.raw.observedAt !== payment.blockingEndedAt.toISOString(),
    !isRecord(providerResult),
    isRecord(providerResult) && providerResult.rescode !== "Q004",
  ].some(Boolean);
}

function recoveryPaymentSelect(): Prisma.PaymentSelect {
  return {
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
    contactStartedAt: true,
    financialSucceededAt: true,
    blockingEndedAt: true,
    suspendedByPaymentId: true,
    errorCode: true,
  };
}

function parseActivation(value: string | undefined): "DISABLED" | "ENABLED" | "INVALID" {
  if (value === undefined || value.trim() === "") return "DISABLED";
  if (value === "ENABLED") return "ENABLED";
  return "INVALID";
}

function requireProviderOrderId(payment: RecoveryPayment): string {
  if (!payment.providerOrderId) throw new Error("EXIMBAY_CHECKOUT_RECOVERY_PROVIDER_ORDER_ID_MISSING");
  return payment.providerOrderId;
}

function encodeAmountWire(payment: Pick<RecoveryPayment, "currency" | "amount">): string {
  if (payment.currency === "JPY") return String(payment.amount);
  if (payment.currency !== "USD") throw new Error("EXIMBAY_CHECKOUT_RECOVERY_UNSUPPORTED_CURRENCY");
  const digits = String(payment.amount).padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function isRecord(value: unknown): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
