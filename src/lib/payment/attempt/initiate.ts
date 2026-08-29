import { randomUUID } from "crypto";
import {
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentInitiationOutputKind,
  PaymentProvider,
  PaymentRemediationStatus,
  Prisma,
} from "@prisma/client";
import type { Payment, PrismaClient } from "@prisma/client";
import {
  commerceIntegrityMessage,
  variantPurchasableInMarketFailure,
} from "@/lib/commerce-integrity";
import {
  hasSessionSuspensionCycle,
  hasUnresolvedSessionExposure,
} from "@/lib/payment/remediation";
import { generateEximbayProviderOrderId } from "@/lib/payment/attempt/provider-order-id";
import {
  assertPreparedEximbayReadyContact,
  EXIMBAY_READY_TOTAL_DEADLINE_MS,
  EximbayReadyContactError,
  executePreparedEximbayReadyContact,
  prepareEximbayReadyContact,
  type EximbayReadyContactExecution,
  type EximbayReadyFetch,
  type FreshEximbayReadyAuthority,
  type PreparedEximbayReadyContact,
} from "@/lib/payment/eximbay/ready-contact";
import { isUsable } from "@/lib/payment/session";
import type { ProviderEnv } from "@/lib/payment/providers/credentials";
import type { ProviderFactoryContext } from "@/lib/payment/providers/contract";
import {
  ProviderResolveException,
  resolveInitiationProvider,
} from "@/lib/payment/providers/initiation";
import type { PaymentMethod, PaymentMode } from "@/lib/payment/providers/routing";
import type {
  PaymentInitiationProvider,
  PaymentInitiateResult,
} from "@/lib/payment/providers/types";
import {
  PromotionRedemptionError,
  reserveSelectedPromotionForContact,
  selectedPromotionFirstOrderClassification,
} from "@/lib/promotion";

type InitiateTx = Prisma.TransactionClient;
type InitiateSession = NonNullable<Awaited<ReturnType<typeof loadCommerceSession>>>;
type InitiatedPayment = Pick<
  Payment,
  | "id"
  | "checkoutSessionId"
  | "provider"
  | "mode"
  | "adapterExecutionKind"
  | "status"
  | "attemptLifecycle"
  | "remediationStatus"
  | "amount"
  | "currency"
  | "idempotencyKey"
  | "routingRuleId"
  | "providerOrderId"
  | "providerRef"
  | "providerPaymentKey"
  | "initiationOutputKind"
  | "initiationApproveUrl"
  | "initiationCompletedAt"
  | "contactIntentAt"
  | "contactStartedAt"
  | "financialSucceededAt"
  | "blockingEndedAt"
  | "suspendedByPaymentId"
>;

type InitiateDecision =
  | { kind: "contact"; payment: InitiatedPayment }
  | { kind: "reuse"; payment: InitiatedPayment; initiateResult: PaymentInitiateResult };
type ContactClaim =
  | { kind: "claimed"; payment: InitiatedPayment }
  | { kind: "lost"; payment: InitiatedPayment; initiateResult: PaymentInitiateResult }
  | { kind: "sessionNotUsable" };

type ContactBoundaryClock = () => Date | Promise<Date>;
type DatabaseClockClient = Pick<PrismaClient, "$queryRaw">;

const EXIMBAY_READY_OBSERVATION_POLL_MS = 50;
const EXIMBAY_READY_OBSERVATION_MAX_READS =
  Math.ceil(EXIMBAY_READY_TOTAL_DEADLINE_MS / EXIMBAY_READY_OBSERVATION_POLL_MS) + 2;

export type PaymentInitiateErrorCode =
  | "SESSION_UNAVAILABLE"
  | "SESSION_NOT_USABLE"
  | "SESSION_TERMS_STALE"
  | "SESSION_REMEDIATION_REQUIRED"
  | "ATTEMPT_SUPERSEDED"
  | "ATTEMPT_OUTCOME_UNKNOWN"
  | "ATTEMPT_STATE_CONFLICT"
  | "PROVIDER_UNAVAILABLE";

export class PaymentInitiateException extends Error {
  constructor(
    public readonly code: PaymentInitiateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PaymentInitiateException";
  }
}

export interface InitiatePaymentAttemptInput {
  sessionId: string;
  userId: string;
  adapterContext: ProviderFactoryContext;
  now?: Date;
  contactBoundaryClock?: ContactBoundaryClock;
  eximbayReady?: Readonly<{
    env?: ProviderEnv;
    fetchImpl?: EximbayReadyFetch;
    afterPrepared?: () => void | Promise<void>;
  }>;
}

interface RuntimeInitiationInput {
  sessionId: string;
  userId: string;
  provider: PaymentInitiationProvider;
  mode: PaymentMode;
  method: PaymentMethod;
  routingRuleId: string;
  now?: Date;
  contactBoundaryClock?: ContactBoundaryClock;
  eximbayReady?: InitiatePaymentAttemptInput["eximbayReady"];
}

export interface InitiatePaymentAttemptResult {
  paymentId: string;
  provider: InitiatedPayment["provider"];
  status: InitiatedPayment["status"];
  initiateResult: PaymentInitiateResult;
}

type FreshEximbayReadyAttemptResult = InitiatePaymentAttemptResult & {
  readonly provider: typeof PaymentProvider.EXIMBAY;
  readonly initiateResult: Extract<PaymentInitiateResult, { kind: "ready" }>;
};

export type InitiatePaymentAttemptExecution =
  | Readonly<{
      channel: "DURABLE_ONLY";
      durable: InitiatePaymentAttemptResult;
    }>
  | Readonly<{
      channel: "FRESH_EXIMBAY_READY";
      durable: FreshEximbayReadyAttemptResult;
      freshAuthority: FreshEximbayReadyAuthority;
    }>;

export async function initiatePaymentAttempt(
  client: PrismaClient,
  input: InitiatePaymentAttemptInput,
): Promise<InitiatePaymentAttemptResult> {
  return (await executePaymentAttempt(client, input)).durable;
}

export function initiatePaymentAttemptWithTransientAuthority(
  client: PrismaClient,
  input: InitiatePaymentAttemptInput,
): Promise<InitiatePaymentAttemptExecution> {
  return executePaymentAttempt(client, input);
}

async function executePaymentAttempt(
  client: PrismaClient,
  input: InitiatePaymentAttemptInput,
): Promise<InitiatePaymentAttemptExecution> {
  let provider: PaymentInitiationProvider;
  try {
    provider = resolveInitiationProvider(input.adapterContext);
  } catch (error) {
    if (error instanceof ProviderResolveException) {
      throw new PaymentInitiateException("PROVIDER_UNAVAILABLE", "No payment provider is available.");
    }
    throw error;
  }
  return contactProviderForAttempt(client, {
    sessionId: input.sessionId,
    userId: input.userId,
    provider,
    mode: input.adapterContext.mode,
    method: input.adapterContext.method,
    routingRuleId: input.adapterContext.ruleId,
    now: input.now,
    contactBoundaryClock: input.contactBoundaryClock,
    eximbayReady: input.eximbayReady,
  });
}

async function contactProviderForAttempt(
  client: PrismaClient,
  input: RuntimeInitiationInput,
): Promise<InitiatePaymentAttemptExecution> {
  const authorizationNow = input.now ?? new Date();
  const decision = await client.$transaction((tx) => authorizeContact(tx, input, authorizationNow));
  if (decision.kind === "reuse") {
    return resolveDurableReuse(client, decision.payment, decision.initiateResult);
  }
  if (decision.payment.provider === PaymentProvider.EXIMBAY) {
    return contactEximbayForAttempt(client, decision.payment, input);
  }
  return durableOnly(await contactGenericProviderForAttempt(client, decision.payment, input));
}

async function contactGenericProviderForAttempt(
  client: PrismaClient,
  payment: InitiatedPayment,
  input: RuntimeInitiationInput,
): Promise<InitiatePaymentAttemptResult> {
  const claim = await markContactStarted(client, payment, input, null);
  if (claim.kind === "sessionNotUsable") throw sessionNotUsable();
  if (claim.kind === "lost") return toResult(claim.payment, claim.initiateResult);
  const contacted = claim.payment;
  let initiateResult: PaymentInitiateResult;
  try {
    initiateResult = await input.provider.initiate(toProviderInput(contacted));
  } catch {
    await markOutcomeUnknown(client, contacted.id);
    throw new PaymentInitiateException(
      "ATTEMPT_OUTCOME_UNKNOWN",
      "Provider contact outcome is unknown; this attempt requires reconciliation.",
    );
  }
  if (initiateResult.kind === "inProgress") {
    return toResult(contacted, initiateResult);
  }
  return persistInitiationOutput(
    client,
    contacted,
    initiateResult,
    requireContactStartedAt(contacted),
  );
}

async function contactEximbayForAttempt(
  client: PrismaClient,
  payment: InitiatedPayment,
  input: RuntimeInitiationInput,
): Promise<InitiatePaymentAttemptExecution> {
  const prepared = await prepareEximbayContact(client, payment, input);
  await input.eximbayReady?.afterPrepared?.();
  const claim = await claimPreparedEximbayContact(client, payment, input, prepared);
  if (claim.kind === "sessionNotUsable") throw sessionNotUsable();
  if (claim.kind === "lost") {
    return resolveDurableReuse(client, claim.payment, claim.initiateResult);
  }
  return contactEximbay(client, claim.payment, prepared);
}

async function resolveDurableReuse(
  client: PrismaClient,
  payment: InitiatedPayment,
  initiateResult: PaymentInitiateResult,
): Promise<InitiatePaymentAttemptExecution> {
  if (payment.provider === PaymentProvider.EXIMBAY
    && initiateResult.kind === "inProgress") {
    return observeEximbayReadyFlight(client, payment);
  }
  return durableOnly(toResult(payment, initiateResult));
}

async function observeEximbayReadyFlight(
  client: PrismaClient,
  payment: InitiatedPayment,
): Promise<InitiatePaymentAttemptExecution> {
  const initialObservation = await requirePayment(client, payment.id);
  const initialSettled = classifyObservedEximbayReadyFlight(initialObservation);
  if (initialSettled) return initialSettled;

  const contactStartedAt = requireObservableEximbayReadyFlight(initialObservation);
  const databaseNow = await captureDatabaseTime(client);
  const contactAgeMs = Math.max(0, databaseNow.getTime() - contactStartedAt.getTime());
  if (contactAgeMs >= EXIMBAY_READY_TOTAL_DEADLINE_MS) {
    return durableOnly(toResult(initialObservation, { kind: "inProgress" }));
  }
  const monotonicDeadline = performance.now() + EXIMBAY_READY_TOTAL_DEADLINE_MS;

  for (let readCount = 0; readCount < EXIMBAY_READY_OBSERVATION_MAX_READS; readCount += 1) {
    const observed = await requirePayment(client, payment.id);
    const settled = classifyObservedEximbayReadyFlight(observed, contactStartedAt);
    if (settled) return settled;

    const remainingMs = monotonicDeadline - performance.now();
    if (remainingMs <= 0) {
      return durableOnly(toResult(observed, { kind: "inProgress" }));
    }
    if (readCount === EXIMBAY_READY_OBSERVATION_MAX_READS - 1) {
      await delay(remainingMs);
      break;
    }
    await delay(Math.min(EXIMBAY_READY_OBSERVATION_POLL_MS, remainingMs));
  }

  const finalObservation = await requirePayment(client, payment.id);
  return classifyObservedEximbayReadyFlight(finalObservation, contactStartedAt)
    ?? durableOnly(toResult(finalObservation, { kind: "inProgress" }));
}

function classifyObservedEximbayReadyFlight(
  payment: InitiatedPayment,
  contactStartedAt?: Date,
): InitiatePaymentAttemptExecution | null {
  if (payment.attemptLifecycle === PaymentAttemptLifecycle.OUTCOME_UNKNOWN) {
    throw blockedAttemptError(payment);
  }
  const persisted = persistedInitiationResult(payment);
  if (persisted) return durableOnly(toResult(payment, persisted));
  if (isObservableEximbayReadyFlight(payment)
    && payment.contactStartedAt
    && (contactStartedAt === undefined
      || payment.contactStartedAt.getTime() === contactStartedAt.getTime())) {
    return null;
  }
  throw blockedAttemptError(payment);
}

function requireObservableEximbayReadyFlight(payment: InitiatedPayment): Date {
  if (!isObservableEximbayReadyFlight(payment) || !payment.contactStartedAt) {
    throw blockedAttemptError(payment);
  }
  return payment.contactStartedAt;
}

function isObservableEximbayReadyFlight(payment: InitiatedPayment): boolean {
  const invalid = [
    payment.provider !== PaymentProvider.EXIMBAY,
    payment.status !== PaymentAttemptStatus.INITIATED,
    payment.attemptLifecycle !== PaymentAttemptLifecycle.CONTACTED,
    payment.remediationStatus !== PaymentRemediationStatus.NONE,
    payment.providerRef !== null,
    payment.providerPaymentKey !== null,
    payment.initiationOutputKind !== null,
    payment.initiationApproveUrl !== null,
    payment.initiationCompletedAt !== null,
    payment.financialSucceededAt !== null,
    payment.blockingEndedAt !== null,
    payment.suspendedByPaymentId !== null,
  ].some(Boolean);
  return !invalid;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function claimPreparedEximbayContact(
  client: PrismaClient,
  payment: InitiatedPayment,
  input: RuntimeInitiationInput,
  prepared: PreparedEximbayReadyContact,
): Promise<ContactClaim> {
  try {
    return await markContactStarted(client, payment, input, prepared);
  } catch (error) {
    if (error instanceof EximbayReadyContactError) {
      throw new PaymentInitiateException("ATTEMPT_STATE_CONFLICT", "Prepared payment facts changed before contact.");
    }
    throw error;
  }
}

async function authorizeContact(
  tx: InitiateTx,
  input: RuntimeInitiationInput,
  now: Date,
): Promise<InitiateDecision> {
  await lockCheckoutSession(tx, input.sessionId);
  const session = await requireUsableSession(tx, input, now);
  if (await hasUnresolvedSessionExposure(tx, session.id)
    || await hasSessionSuspensionCycle(tx, session.id)) {
    throw remediationRequired();
  }
  const current = await loadBlockingPayment(tx, session.id);
  if (current) return decideForCurrent(tx, current, session, input, now);

  await validateCommerceAtContactBoundary(tx, session);
  return { kind: "contact", payment: await createContactAuthorizedPayment(tx, session, input, now) };
}

async function decideForCurrent(
  tx: InitiateTx,
  current: InitiatedPayment,
  session: InitiateSession,
  input: RuntimeInitiationInput,
  now: Date,
): Promise<InitiateDecision> {
  if (isEximbayModeMismatchBeforeSupersession(current, input)) {
    throw new PaymentInitiateException(
      "ATTEMPT_STATE_CONFLICT",
      "The existing Eximbay attempt mode does not match the requested mode.",
    );
  }
  if (isCompatibleAttempt(current, input, session)) {
    return decideCompatible(tx, current, session);
  }
  if (!isUncontactedAuthorized(current)) {
    throw blockedAttemptError(current);
  }

  await validateCommerceAtContactBoundary(tx, session);
  await supersedeUncontactedAuthorized(tx, current, now);
  return { kind: "contact", payment: await createContactAuthorizedPayment(tx, session, input, now) };
}

function isEximbayModeMismatchBeforeSupersession(
  current: InitiatedPayment,
  input: RuntimeInitiationInput,
): boolean {
  return current.provider === PaymentProvider.EXIMBAY
    && input.provider.code === PaymentProvider.EXIMBAY
    && isUncontactedAuthorized(current)
    && current.mode !== input.mode;
}

async function decideCompatible(
  tx: InitiateTx,
  current: InitiatedPayment,
  session: InitiateSession,
): Promise<InitiateDecision> {
  throwIfEximbayOutcomeUnknown(current);
  const persisted = persistedInitiationResult(current);
  if (persisted) return { kind: "reuse", payment: current, initiateResult: persisted };
  if (isUncontactedAuthorized(current)) {
    await validateCommerceAtContactBoundary(tx, session);
    return { kind: "contact", payment: current };
  }
  if (current.attemptLifecycle === PaymentAttemptLifecycle.CONTACTED) {
    return { kind: "reuse", payment: current, initiateResult: { kind: "inProgress" } };
  }
  throw blockedAttemptError(current);
}

function isUncontactedAuthorized(payment: InitiatedPayment): boolean {
  return payment.attemptLifecycle === PaymentAttemptLifecycle.CONTACT_AUTHORIZED
    && payment.contactStartedAt === null;
}

function blockedAttemptError(payment: InitiatedPayment): PaymentInitiateException {
  if (payment.attemptLifecycle === PaymentAttemptLifecycle.OUTCOME_UNKNOWN) {
    return new PaymentInitiateException(
      "ATTEMPT_OUTCOME_UNKNOWN",
      "A provider-contact outcome is unresolved for this checkout session.",
    );
  }
  return new PaymentInitiateException(
    "ATTEMPT_STATE_CONFLICT",
    "The checkout session already has a contacted, financially successful, or remediation-blocked attempt.",
  );
}

function remediationRequired(): PaymentInitiateException {
  return new PaymentInitiateException(
    "SESSION_REMEDIATION_REQUIRED",
    "This checkout session has unresolved payment exposure and requires remediation.",
  );
}

async function loadBlockingPayment(
  tx: InitiateTx,
  sessionId: string,
): Promise<InitiatedPayment | null> {
  const active = await tx.payment.findMany({
    where: { checkoutSessionId: sessionId, blockingEndedAt: null },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: paymentSelect(),
  });
  if (active.length > 1) {
    throw new PaymentInitiateException("ATTEMPT_STATE_CONFLICT", "Checkout session has multiple blocking payment attempts.");
  }
  return active[0] ?? null;
}

async function requireUsableSession(
  tx: InitiateTx,
  input: RuntimeInitiationInput,
  now: Date,
): Promise<InitiateSession> {
  const session = await loadCommerceSession(tx, input.sessionId);
  if (!session || session.userId !== input.userId) {
    throw new PaymentInitiateException("SESSION_UNAVAILABLE", "Checkout session is unavailable.");
  }
  if (!isUsable(session, now)) throw sessionNotUsable();
  return session;
}

function sessionNotUsable(): PaymentInitiateException {
  return new PaymentInitiateException("SESSION_NOT_USABLE", "Checkout session is not usable.");
}

async function validateCommerceAtContactBoundary(
  tx: InitiateTx,
  initial: InitiateSession,
): Promise<void> {
  if (initial.lines.length === 0) throw staleTerms("Frozen checkout session has no lines.");
  const market = await lockCommerceRows(tx, initial);
  const session = await loadCommerceSession(tx, initial.id);
  if (!session) throw new PaymentInitiateException("SESSION_UNAVAILABLE", "Checkout session is unavailable.");
  if (!market || market.code !== session.marketCode || !market.isActive || market.currency !== session.currency) {
    throw staleTerms("The checkout Market is inactive or no longer matches the frozen currency.");
  }
  validateFrozenTotals(session);
  for (const line of session.lines) validateCommerceLine(session, line);
}

function validateFrozenTotals(session: InitiateSession): void {
  const subtotal = session.lines.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0);
  const discount = session.lines.reduce((sum, line) => sum + line.discountAmount, 0);
  const lineDiscountsValid = session.lines.every((line) => (
    Number.isSafeInteger(line.discountAmount)
    && line.discountAmount >= 0
    && line.discountAmount <= line.unitAmount * line.quantity
  ));
  const promotionShapeValid = session.promotionGrantId === null
    ? session.discountAmount === 0 && discount === 0
    : session.discountAmount > 0;
  const checks = [
    session.lines.length > 0,
    subtotal === session.subtotalAmount,
    discount === session.discountAmount,
    lineDiscountsValid,
    promotionShapeValid,
    subtotal + session.shippingAmount - discount === session.totalAmount,
  ];
  if (checks.every(Boolean)) return;
  throw staleTerms("Frozen checkout totals are incoherent.");
}

async function reservePromotionAtContactBoundary(
  tx: InitiateTx,
  session: InitiateSession,
  contactBoundaryNow: Date,
): Promise<void> {
  if (session.promotionGrantId === null) return;
  try {
    const classification = await selectedPromotionFirstOrderClassification(tx, session.promotionGrantId);
    if (classification.requiresFirstOrderClaim) {
      await acquireFirstOrderPromotionClaim(tx, session, contactBoundaryNow);
    }
    await reserveSelectedPromotionForContact(tx, {
      promotionGrantId: session.promotionGrantId,
      reservationOwnerSessionId: session.id,
      expectedFirstOrderOnly: classification.firstOrderOnly,
      expectedRequiresFirstOrderClaim: classification.requiresFirstOrderClaim,
      userId: session.userId,
      marketCode: session.marketCode,
      currency: session.currency,
      now: contactBoundaryNow,
      frozenDiscountAmount: session.discountAmount,
      lines: session.lines.map((line) => ({
        lineId: line.variantId,
        grossAmount: line.unitAmount * line.quantity,
        frozenDiscountAmount: line.discountAmount,
      })),
    });
  } catch (error) {
    if (error instanceof PromotionRedemptionError) {
      throw staleTerms("Frozen promotion terms are no longer eligible for provider contact.");
    }
    throw error;
  }
}

async function acquireFirstOrderPromotionClaim(
  tx: InitiateTx,
  session: InitiateSession,
  claimedAt: Date,
): Promise<void> {
  if (session.firstOrderPromotionClaimedAt !== null) return;
  const claimed = await tx.checkoutSession.updateMany({
    where: {
      id: session.id,
      userId: session.userId,
      firstOrderPromotionClaimedAt: null,
    },
    data: { firstOrderPromotionClaimedAt: claimedAt },
  });
  if (claimed.count === 1) return;
  const current = await tx.checkoutSession.findUnique({
    where: { id: session.id },
    select: { firstOrderPromotionClaimedAt: true },
  });
  if (current?.firstOrderPromotionClaimedAt != null) return;
  throw staleTerms("First-order promotion contact ownership changed.");
}

function validateCommerceLine(
  session: InitiateSession,
  line: InitiateSession["lines"][number],
): void {
  const marketPrice = line.variant.marketPrices.find((price) => price.marketCode === session.marketCode);
  const failure = variantPurchasableInMarketFailure({
    selectedStyleId: line.wigStyleId,
    canonicalStyleId: line.variant.wigStyleId,
    styleActive: line.variant.wigStyle.isActive,
    stylePublishedInMarket: line.variant.wigStyle.availableMarkets.some((market) => (
      market.marketCode === session.marketCode && market.isActive
    )),
    variantActive: line.variant.isActive,
    hasMarketPrice: Boolean(marketPrice),
    stock: line.variant.stock,
    quantity: line.quantity,
  });
  if (failure) throw staleTerms(commerceIntegrityMessage(failure));
  if (marketPrice?.amount !== line.unitAmount || line.variant.fulfillmentType !== line.fulfillmentType) {
    throw staleTerms("Current commercial terms no longer match the frozen checkout session.");
  }
  if (session.currency.length === 0) throw staleTerms("Frozen checkout currency is invalid.");
}

function staleTerms(message: string): PaymentInitiateException {
  return new PaymentInitiateException("SESSION_TERMS_STALE", message);
}

async function lockCommerceRows(
  tx: InitiateTx,
  session: InitiateSession,
): Promise<{ code: string; currency: string; isActive: boolean } | null> {
  const variantIds = sortedUnique(session.lines.map((line) => line.variantId));
  const styleIds = sortedUnique(session.lines.flatMap((line) => [line.wigStyleId, line.variant.wigStyleId]));
  const markets = await tx.$queryRaw<{ code: string; currency: string; isActive: boolean }[]>(Prisma.sql`
    SELECT "code", "currency", "isActive"
    FROM "Market"
    WHERE "code" = ${session.marketCode}
    FOR UPDATE
  `);
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "CheckoutSessionLine"
    WHERE "sessionId" = ${session.id}
    ORDER BY "id" FOR UPDATE
  `);
  await lockIds(tx, "WigStyle", styleIds);
  await lockIds(tx, "WigVariant", variantIds);
  await tx.$queryRaw(Prisma.sql`
    SELECT "wigStyleId" FROM "WigStyleMarket"
    WHERE "wigStyleId" IN (${Prisma.join(styleIds)}) AND "marketCode" = ${session.marketCode}
    ORDER BY "wigStyleId" FOR UPDATE
  `);
  await tx.$queryRaw(Prisma.sql`
    SELECT "variantId" FROM "VariantMarketPrice"
    WHERE "variantId" IN (${Prisma.join(variantIds)}) AND "marketCode" = ${session.marketCode}
    ORDER BY "variantId" FOR UPDATE
  `);
  return markets[0] ?? null;
}

async function lockIds(tx: InitiateTx, table: "WigStyle" | "WigVariant", ids: string[]): Promise<void> {
  const identifier = Prisma.raw(`"${table}"`);
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM ${identifier}
    WHERE "id" IN (${Prisma.join(ids)})
    ORDER BY "id" FOR UPDATE
  `);
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

async function lockCheckoutSession(tx: InitiateTx, sessionId: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "CheckoutSession" WHERE "id" = ${sessionId} FOR UPDATE
  `);
}

async function supersedeUncontactedAuthorized(
  tx: InitiateTx,
  payment: InitiatedPayment,
  now: Date,
): Promise<void> {
  const result = await tx.payment.updateMany({
    where: {
      id: payment.id,
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACT_AUTHORIZED,
      remediationStatus: PaymentRemediationStatus.NONE,
      adapterExecutionKind: payment.adapterExecutionKind,
      contactStartedAt: null,
      providerRef: null,
      providerPaymentKey: null,
      initiationOutputKind: null,
      financialSucceededAt: null,
      blockingEndedAt: null,
    },
    data: {
      attemptLifecycle: PaymentAttemptLifecycle.SUPERSEDED,
      supersededAt: now,
      blockingEndedAt: now,
      errorCode: "PAYMENT_ATTEMPT_SUPERSEDED",
      errorMessage: "Superseded before provider contact by an incompatible payment request.",
    },
  });
  if (result.count !== 1) {
    throw new PaymentInitiateException("ATTEMPT_STATE_CONFLICT", "Authorized attempt changed during supersession.");
  }
}

async function createContactAuthorizedPayment(
  tx: InitiateTx,
  session: InitiateSession,
  input: RuntimeInitiationInput,
  now: Date,
): Promise<InitiatedPayment> {
  return tx.payment.create({
    data: {
      checkoutSessionId: session.id,
      provider: input.provider.code,
      mode: input.mode,
      adapterExecutionKind: input.provider.adapterExecutionKind,
      routingRuleId: input.routingRuleId,
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACT_AUTHORIZED,
      amount: session.totalAmount,
      currency: session.currency,
      providerOrderId: input.provider.code === PaymentProvider.EXIMBAY
        ? generateEximbayProviderOrderId()
        : null,
      idempotencyKey: initiateIdempotencyKey(session.id),
      contactIntentAt: now,
    },
    select: paymentSelect(),
  });
}

async function markContactStarted(
  client: PrismaClient,
  payment: InitiatedPayment,
  input: RuntimeInitiationInput,
  prepared: PreparedEximbayReadyContact | null,
): Promise<ContactClaim> {
  try {
    return await client.$transaction(async (tx) => {
      await lockCheckoutSession(tx, payment.checkoutSessionId);
      const session = await loadCommerceSession(tx, payment.checkoutSessionId);
      if (!session || session.userId !== input.userId) {
        throw new PaymentInitiateException("SESSION_UNAVAILABLE", "Checkout session is unavailable.");
      }
      if (await hasUnresolvedSessionExposure(tx, payment.checkoutSessionId)
        || await hasSessionSuspensionCycle(tx, payment.checkoutSessionId)) {
        throw remediationRequired();
      }
      await validateCommerceAtContactBoundary(tx, session);
      await assertEximbayPreparedFactsStillCurrent(tx, payment.id, session, input, prepared);
      const contactBoundaryNow = await captureContactBoundaryTime(tx, input.contactBoundaryClock);
      if (!isUsable(session, contactBoundaryNow)) {
        const closed = await closeUncontactedPaymentForUnusableSession(tx, payment, contactBoundaryNow);
        if (closed) return { kind: "sessionNotUsable" };
        return lostContactClaim(await requirePayment(tx, payment.id));
      }
      await reservePromotionAtContactBoundary(tx, session, contactBoundaryNow);
      const result = await tx.payment.updateMany({
        where: contactClaimWhere(payment, prepared),
        data: {
          attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
          contactStartedAt: contactBoundaryNow,
        },
      });
      if (result.count !== 1) {
        return lostContactClaim(await requirePayment(tx, payment.id));
      }
      return { kind: "claimed", payment: await requirePayment(tx, payment.id) };
    });
  } catch (error) {
    if (isContactClaimUniqueConflict(error)) {
      throw staleTerms("Another checkout owns first-order promotion contact authority.");
    }
    throw error;
  }
}

function isContactClaimUniqueConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2002";
  return typeof error === "object" && error !== null
    && "code" in error && error.code === "P2002";
}

function contactClaimWhere(
  payment: InitiatedPayment,
  prepared: PreparedEximbayReadyContact | null,
): Prisma.PaymentWhereInput {
  if (prepared) return strictEximbayUncontactedPaymentClaimWhere(payment);
  return uncontactedPaymentClaimWhere(payment);
}

async function assertEximbayPreparedFactsStillCurrent(
  tx: InitiateTx,
  paymentId: string,
  session: InitiateSession,
  input: RuntimeInitiationInput,
  prepared: PreparedEximbayReadyContact | null,
): Promise<void> {
  if (!prepared) return;
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "User" WHERE "id" = ${session.userId} FOR UPDATE
  `);
  const buyer = await tx.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true },
  });
  if (!buyer) throw new PaymentInitiateException("SESSION_UNAVAILABLE", "Checkout owner is unavailable.");
  const currentPayment = await requirePayment(tx, paymentId);
  assertPreparedEximbayReadyContact(prepared, {
    payment: currentPayment,
    session: {
      id: session.id,
      userId: session.userId,
      marketCode: session.marketCode,
      currency: session.currency,
      totalAmount: session.totalAmount,
    },
    buyer,
    method: input.method,
  });
}

async function captureContactBoundaryTime(
  tx: InitiateTx,
  clock: ContactBoundaryClock | undefined,
): Promise<Date> {
  if (clock) return requireValidContactBoundaryTime(await clock());
  return captureDatabaseTime(tx);
}

async function captureDatabaseTime(client: DatabaseClockClient): Promise<Date> {
  const rows = await client.$queryRaw<{ capturedAtMs: bigint }[]>(Prisma.sql`
    SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS "capturedAtMs"
  `);
  const capturedAtMs = rows[0]?.capturedAtMs;
  if (typeof capturedAtMs !== "bigint") throw new Error("Contact-boundary time is unavailable");
  return requireValidContactBoundaryTime(new Date(Number(capturedAtMs)));
}

function requireValidContactBoundaryTime(value: Date | undefined): Date {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Date(value.getTime());
  }
  throw new Error("Contact-boundary time is unavailable");
}

async function closeUncontactedPaymentForUnusableSession(
  tx: InitiateTx,
  payment: InitiatedPayment,
  now: Date,
): Promise<boolean> {
  const result = await tx.payment.updateMany({
    where: uncontactedPaymentClaimWhere(payment),
    data: {
      status: PaymentAttemptStatus.FAILED,
      attemptLifecycle: PaymentAttemptLifecycle.TERMINAL_FAILURE,
      blockingEndedAt: now,
      errorCode: "CHECKOUT_SESSION_NOT_USABLE",
      errorMessage: "Checkout session became unusable before provider contact.",
    },
  });
  return result.count === 1;
}

function uncontactedPaymentClaimWhere(payment: InitiatedPayment): Prisma.PaymentWhereInput {
  return {
    id: payment.id,
    checkoutSessionId: payment.checkoutSessionId,
    status: PaymentAttemptStatus.INITIATED,
    attemptLifecycle: PaymentAttemptLifecycle.CONTACT_AUTHORIZED,
    remediationStatus: PaymentRemediationStatus.NONE,
    adapterExecutionKind: payment.adapterExecutionKind,
    contactStartedAt: null,
    providerRef: null,
    providerPaymentKey: null,
    initiationOutputKind: null,
    initiationApproveUrl: null,
    initiationCompletedAt: null,
    financialSucceededAt: null,
    blockingEndedAt: null,
    suspendedByPaymentId: null,
  };
}

function strictEximbayUncontactedPaymentClaimWhere(
  payment: InitiatedPayment,
): Prisma.PaymentWhereInput {
  return {
    ...uncontactedPaymentClaimWhere(payment),
    provider: payment.provider,
    mode: payment.mode,
    providerOrderId: payment.providerOrderId,
    amount: payment.amount,
    currency: payment.currency,
    routingRuleId: payment.routingRuleId,
  };
}

function lostContactClaim(payment: InitiatedPayment): ContactClaim {
  throwIfEximbayOutcomeUnknown(payment);
  const persisted = persistedInitiationResult(payment);
  if (persisted) return { kind: "lost", payment, initiateResult: persisted };
  if (payment.attemptLifecycle === PaymentAttemptLifecycle.CONTACTED) {
    return { kind: "lost", payment, initiateResult: { kind: "inProgress" } };
  }
  throw blockedAttemptError(payment);
}

function throwIfEximbayOutcomeUnknown(payment: InitiatedPayment): void {
  if (payment.provider === PaymentProvider.EXIMBAY
    && payment.attemptLifecycle === PaymentAttemptLifecycle.OUTCOME_UNKNOWN) {
    throw blockedAttemptError(payment);
  }
}

async function markOutcomeUnknown(client: PrismaClient, paymentId: string): Promise<void> {
  await client.payment.updateMany({
    where: {
      id: paymentId,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      providerPaymentKey: null,
      blockingEndedAt: null,
    },
    data: {
      attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
      errorCode: "PROVIDER_INITIATE_OUTCOME_UNKNOWN",
      errorMessage: "Provider initiation outcome is unresolved.",
    },
  });
}

async function markEximbayOutcomeUnknown(client: PrismaClient, paymentId: string): Promise<void> {
  await client.payment.updateMany({
    where: {
      id: paymentId,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      providerPaymentKey: null,
      initiationOutputKind: null,
      blockingEndedAt: null,
    },
    data: {
      attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
      errorCode: "PROVIDER_INITIATE_OUTCOME_UNKNOWN",
      errorMessage: "Provider initiation outcome is unresolved.",
    },
  });
}

async function prepareEximbayContact(
  client: PrismaClient,
  payment: InitiatedPayment,
  input: RuntimeInitiationInput,
): Promise<PreparedEximbayReadyContact> {
  try {
    return await prepareEximbayReadyContact(client, {
      paymentId: payment.id,
      checkoutSessionId: payment.checkoutSessionId,
      userId: input.userId,
      mode: input.mode,
      method: input.method,
      env: input.eximbayReady?.env,
      fetchImpl: input.eximbayReady?.fetchImpl,
    });
  } catch (error) {
    if (error instanceof EximbayReadyContactError
      && error.code === "SESSION_NOT_FOUND") {
      throw new PaymentInitiateException("SESSION_UNAVAILABLE", "Checkout session is unavailable.");
    }
    if (error instanceof EximbayReadyContactError) {
      throw new PaymentInitiateException("ATTEMPT_STATE_CONFLICT", "Payment attempt changed before contact.");
    }
    throw new PaymentInitiateException("PROVIDER_UNAVAILABLE", "Eximbay READY preparation is unavailable.");
  }
}

async function contactEximbay(
  client: PrismaClient,
  contacted: InitiatedPayment,
  prepared: PreparedEximbayReadyContact,
): Promise<InitiatePaymentAttemptExecution> {
  let execution: EximbayReadyContactExecution;
  try {
    execution = await executePreparedEximbayReadyContact(prepared);
  } catch {
    return transitionEximbayToOutcomeUnknown(client, contacted.id);
  }
  if (execution.kind === "notAdmitted") {
    return transitionEximbayToOutcomeUnknown(client, contacted.id);
  }
  try {
    const durable = await persistInitiationOutput(
      client,
      contacted,
      { kind: "ready" },
      requireContactStartedAt(contacted),
    );
    if (durable.provider !== PaymentProvider.EXIMBAY
      || durable.initiateResult.kind !== "ready") {
      throw new PaymentInitiateException(
        "ATTEMPT_STATE_CONFLICT",
        "Persisted Eximbay READY result is inconsistent.",
      );
    }
    return Object.freeze({
      channel: "FRESH_EXIMBAY_READY",
      durable: Object.freeze({
        ...durable,
        provider: PaymentProvider.EXIMBAY,
        initiateResult: durable.initiateResult,
      }),
      freshAuthority: execution.freshAuthority,
    });
  } catch {
    return transitionEximbayToOutcomeUnknown(client, contacted.id);
  }
}

async function transitionEximbayToOutcomeUnknown(
  client: PrismaClient,
  paymentId: string,
): Promise<never> {
  try {
    await markEximbayOutcomeUnknown(client, paymentId);
  } catch {
    throw outcomeUnknown();
  }
  throw outcomeUnknown();
}

function outcomeUnknown(): PaymentInitiateException {
  return new PaymentInitiateException(
    "ATTEMPT_OUTCOME_UNKNOWN",
    "Provider contact outcome is unknown; this attempt requires reconciliation.",
  );
}

async function persistInitiationOutput(
  client: PrismaClient,
  payment: InitiatedPayment,
  initiateResult: Exclude<PaymentInitiateResult, { kind: "inProgress" }>,
  now: Date,
): Promise<InitiatePaymentAttemptResult> {
  const result = await client.payment.updateMany({
    where: {
      id: payment.id,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      initiationOutputKind: null,
      blockingEndedAt: null,
    },
    data: initiationOutputData(initiateResult, now),
  });
  if (result.count !== 1) throw new PaymentInitiateException("ATTEMPT_STATE_CONFLICT", "Payment attempt changed while initiation output was persisted.");
  const persisted = await requirePayment(client, payment.id);
  return toResult(persisted, initiateResult);
}

function initiationOutputData(
  result: Exclude<PaymentInitiateResult, { kind: "inProgress" }>,
  now: Date,
): Prisma.PaymentUpdateManyMutationInput {
  if (result.kind === "redirect") {
    return {
      status: PaymentAttemptStatus.AWAITING,
      initiationOutputKind: PaymentInitiationOutputKind.REDIRECT,
      initiationApproveUrl: result.approveUrl,
      initiationCompletedAt: now,
      providerRef: result.providerRef,
    };
  }
  return {
    initiationOutputKind: PaymentInitiationOutputKind.READY,
    initiationCompletedAt: now,
    providerRef: result.providerRef,
  };
}

function persistedInitiationResult(payment: InitiatedPayment): PaymentInitiateResult | null {
  const providerRef = payment.providerRef ?? undefined;
  if (payment.initiationOutputKind === PaymentInitiationOutputKind.READY) {
    return providerRef ? { kind: "ready", providerRef } : { kind: "ready" };
  }
  if (payment.initiationOutputKind === PaymentInitiationOutputKind.REDIRECT && payment.initiationApproveUrl) {
    return providerRef
      ? { kind: "redirect", approveUrl: payment.initiationApproveUrl, providerRef }
      : { kind: "redirect", approveUrl: payment.initiationApproveUrl };
  }
  return null;
}

function isCompatibleAttempt(
  payment: InitiatedPayment,
  input: RuntimeInitiationInput,
  session: InitiateSession,
): boolean {
  return payment.provider === input.provider.code
    && payment.mode === input.mode
    && payment.adapterExecutionKind === input.provider.adapterExecutionKind
    && payment.routingRuleId === input.routingRuleId
    && payment.remediationStatus === PaymentRemediationStatus.NONE
    && payment.amount === session.totalAmount
    && payment.currency === session.currency;
}

function toProviderInput(payment: InitiatedPayment) {
  return {
    checkoutSessionId: payment.checkoutSessionId,
    paymentId: payment.id,
    provider: payment.provider,
    amount: payment.amount,
    currency: payment.currency,
    idempotencyKey: payment.idempotencyKey,
  };
}

function requireContactStartedAt(payment: InitiatedPayment): Date {
  if (payment.contactStartedAt) return payment.contactStartedAt;
  throw new Error("Contacted payment is missing contactStartedAt");
}

function toResult(
  payment: InitiatedPayment,
  initiateResult: PaymentInitiateResult,
): InitiatePaymentAttemptResult {
  return { paymentId: payment.id, provider: payment.provider, status: payment.status, initiateResult };
}

function durableOnly(durable: InitiatePaymentAttemptResult): InitiatePaymentAttemptExecution {
  return Object.freeze({ channel: "DURABLE_ONLY", durable });
}

async function requirePayment(
  client: Pick<InitiateTx, "payment">,
  paymentId: string,
): Promise<InitiatedPayment> {
  const payment = await client.payment.findUnique({ where: { id: paymentId }, select: paymentSelect() });
  if (!payment) throw new PaymentInitiateException("ATTEMPT_STATE_CONFLICT", "Payment attempt disappeared.");
  return payment;
}

function loadCommerceSession(tx: InitiateTx, sessionId: string) {
  return tx.checkoutSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      userId: true,
      status: true,
      expiresAt: true,
      marketCode: true,
      promotionGrantId: true,
      firstOrderPromotionClaimedAt: true,
      subtotalAmount: true,
      discountAmount: true,
      shippingAmount: true,
      totalAmount: true,
      currency: true,
      lines: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          variantId: true,
          wigStyleId: true,
          quantity: true,
          unitAmount: true,
          discountAmount: true,
          fulfillmentType: true,
          variant: {
            select: {
              wigStyleId: true,
              stock: true,
              isActive: true,
              fulfillmentType: true,
              wigStyle: {
                select: {
                  isActive: true,
                  availableMarkets: {
                    select: { marketCode: true, isActive: true },
                  },
                },
              },
              marketPrices: { select: { marketCode: true, amount: true } },
            },
          },
        },
      },
    },
  });
}

function paymentSelect(): Prisma.PaymentSelect {
  return {
    id: true,
    checkoutSessionId: true,
    provider: true,
    mode: true,
    adapterExecutionKind: true,
    status: true,
    attemptLifecycle: true,
    remediationStatus: true,
    amount: true,
    currency: true,
    idempotencyKey: true,
    routingRuleId: true,
    providerOrderId: true,
    providerRef: true,
    providerPaymentKey: true,
    initiationOutputKind: true,
    initiationApproveUrl: true,
    initiationCompletedAt: true,
    contactIntentAt: true,
    contactStartedAt: true,
    financialSucceededAt: true,
    blockingEndedAt: true,
    suspendedByPaymentId: true,
  };
}

function initiateIdempotencyKey(sessionId: string): string {
  return `initiate:${sessionId}:${randomUUID()}`;
}
