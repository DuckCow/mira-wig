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
  type PrismaClient,
} from "@prisma/client";
import { hasUnresolvedSessionExposure } from "@/lib/payment/remediation";
import type { ProviderEnv } from "@/lib/payment/providers/credentials";
import {
  requireEximbayBf4ConfigFacts,
  resolveEximbayBf4Config,
  retrieveEximbayCheckoutRecoveryStatus,
  type EximbayBf4Fetch,
  type EximbayBf4OutcomeUnknownDiagnostic,
  type EximbayCheckoutRecoveryProviderObservation,
  type EximbayCheckoutRecoveryRetrieveResult,
} from "./bf4-contact";
import { EXIMBAY_BF4_EVENT_TYPE } from "./bf4-envelope";
import {
  checkoutRecoveryTransmissionId,
  EXIMBAY_CHECKOUT_RECOVERY_EVENT_TYPE,
  EXIMBAY_NO_TRANSACTION_OBSERVED,
  isExactQ004RecoveryEvent,
  isExactQ004ReleasedPayment,
  isExactRecoverableBlocker,
  type EximbayCheckoutRecoveryPayment,
} from "./checkout-recovery-state";

export {
  checkoutRecoveryTransmissionId,
  EXIMBAY_CHECKOUT_RECOVERY_EVENT_TYPE,
  EXIMBAY_NO_TRANSACTION_OBSERVED,
  isExactQ004RecoveryEvent,
  isExactQ004ReleasedPayment,
  isExactRecoverableBlocker,
} from "./checkout-recovery-state";

export const EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED =
  "EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED";
export const EXIMBAY_RELEASED_ATTEMPT_OUTCOME_UNKNOWN =
  "EXIMBAY_RELEASED_ATTEMPT_OUTCOME_UNKNOWN";
export const EXIMBAY_CHECKOUT_RECOVERY_OUTCOME_UNKNOWN_LOG_EVENT =
  "EXIMBAY_CHECKOUT_RECOVERY_OUTCOME_UNKNOWN_V1";

type RecoveryPayment = EximbayCheckoutRecoveryPayment;

export type EximbayCheckoutRecoveryObservation = Readonly<{
  schema: "eximbay.checkout-recovery.provider-observation";
  version: 1;
  application: Readonly<{
    checkoutSessionId: string;
    paymentId: string;
    providerOrderId: string;
    expectedAmountMinor: number;
    expectedCurrency: string;
  }>;
  providerResult: EximbayCheckoutRecoveryProviderObservation;
}>;

export type EximbayCheckoutRecoveryResult =
  | Readonly<{ kind: "released"; paymentId: string; eventId: string; releasedAt: Date }>
  | Readonly<{ kind: "replayed"; paymentId: string; eventId: string; releasedAt: Date }>
  | Readonly<{
      kind: "notReleased";
      reason: "TRANSACTION_OBSERVED";
      providerObservation: EximbayCheckoutRecoveryObservation;
    }>
  | Readonly<{
      kind: "notReleased";
      reason: "DISABLED" | "NOT_ELIGIBLE" | "OUTCOME_UNKNOWN" | "STATE_CHANGED";
    }>;

export interface RecoverEximbayCheckoutInput {
  readonly checkoutSessionId: string;
  readonly paymentId: string;
  readonly authenticatedUserId: string;
  readonly env?: ProviderEnv;
  readonly transport: EximbayBf4Fetch;
  readonly now?: () => Date;
  readonly emitDiagnostic?: (line: string) => void;
}

export class EximbayCheckoutRecoveryConfigError extends Error {
  constructor() {
    super("EXIMBAY_CHECKOUT_RECOVERY_INVALID_ACTIVATION");
    this.name = "EximbayCheckoutRecoveryConfigError";
  }
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
  const providerDisposition = recoveryProviderDisposition(
    retrieved,
    initial.payment,
    input.emitDiagnostic,
  );
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
  const eligible = await isEligibleBeforeContact(client, owned);
  return eligible
    ? Object.freeze({ kind: "eligible", owned })
    : recoveryPreflightResult("NOT_ELIGIBLE");
}

function recoveryPreflightResult(
  reason: Exclude<
    Extract<EximbayCheckoutRecoveryResult, { kind: "notReleased" }>["reason"],
    "TRANSACTION_OBSERVED"
  >,
): RecoveryPreflight {
  return Object.freeze({ kind: "result", result: Object.freeze({ kind: "notReleased", reason }) });
}

function recoveryProviderDisposition(
  retrieved: EximbayCheckoutRecoveryRetrieveResult,
  payment: RecoveryPayment,
  emitDiagnostic: ((line: string) => void) | undefined,
): EximbayCheckoutRecoveryResult | null {
  if (retrieved.kind === "transactionObserved") {
    return Object.freeze({
      kind: "notReleased",
      reason: "TRANSACTION_OBSERVED",
      providerObservation: checkoutRecoveryObservation(payment, retrieved.observation),
    });
  }
  if (retrieved.kind === "outcomeUnknown") {
    emitOutcomeUnknownDiagnostic({
      checkoutSessionId: payment.checkoutSessionId,
      paymentId: payment.id,
      diagnostic: retrieved.diagnostic,
    }, emitDiagnostic);
    return Object.freeze({ kind: "notReleased", reason: "OUTCOME_UNKNOWN" });
  }
  return null;
}

function checkoutRecoveryObservation(
  payment: RecoveryPayment,
  providerResult: EximbayCheckoutRecoveryProviderObservation,
): EximbayCheckoutRecoveryObservation {
  return Object.freeze({
    schema: "eximbay.checkout-recovery.provider-observation",
    version: 1,
    application: Object.freeze({
      checkoutSessionId: payment.checkoutSessionId,
      paymentId: payment.id,
      providerOrderId: requireProviderOrderId(payment),
      expectedAmountMinor: payment.amount,
      expectedCurrency: payment.currency,
    }),
    providerResult,
  });
}

function emitOutcomeUnknownDiagnostic(input: Readonly<{
  checkoutSessionId: string;
  paymentId: string;
  diagnostic: EximbayBf4OutcomeUnknownDiagnostic;
}>, emit: (line: string) => void = console.warn): void {
  try {
    emit(JSON.stringify(Object.freeze({
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
  if (!await isEligibleBeforeContact(tx, current)) {
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
    order: { id: string } | null;
  }>;
}>;

async function loadOwnedPayment(
  client: Pick<PrismaClient, "checkoutSession" | "payment"> | Prisma.TransactionClient,
  input: Pick<RecoverEximbayCheckoutInput, "checkoutSessionId" | "paymentId" | "authenticatedUserId">,
): Promise<OwnedPayment | null> {
  const session = await client.checkoutSession.findFirst({
    where: { id: input.checkoutSessionId, userId: input.authenticatedUserId },
    select: { id: true, userId: true, status: true, order: { select: { id: true } } },
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
): Promise<boolean> {
  if (!isEligibleContactedRecoverySession(owned.session)) return false;
  if (!isExactRecoverableBlocker(owned.payment)) return false;
  if (await hasUnresolvedSessionExposure(client, owned.payment.checkoutSessionId)) return false;
  const blockers = await client.payment.count({
    where: { checkoutSessionId: owned.payment.checkoutSessionId, blockingEndedAt: null },
  });
  return blockers === 1;
}

function isEligibleContactedRecoverySession(session: OwnedPayment["session"]): boolean {
  return session.status === CheckoutSessionStatus.SUBMITTED && session.order === null;
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
