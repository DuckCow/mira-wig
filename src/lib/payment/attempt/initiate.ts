import { randomUUID } from "crypto";
import {
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentInitiationOutputKind,
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
import { isUsable } from "@/lib/payment/session";
import type { ProviderFactoryContext } from "@/lib/payment/providers/contract";
import {
  ProviderResolveException,
  resolveInitiationProvider,
} from "@/lib/payment/providers/initiation";
import type { PaymentMode } from "@/lib/payment/providers/routing";
import type {
  PaymentInitiationProvider,
  PaymentInitiateResult,
} from "@/lib/payment/providers/types";

type InitiateTx = Prisma.TransactionClient;
type InitiateSession = NonNullable<Awaited<ReturnType<typeof loadCommerceSession>>>;
type InitiatedPayment = Pick<
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
  | "idempotencyKey"
  | "routingRuleId"
  | "providerRef"
  | "providerPaymentKey"
  | "initiationOutputKind"
  | "initiationApproveUrl"
  | "contactIntentAt"
  | "contactStartedAt"
  | "financialSucceededAt"
>;

type InitiateDecision =
  | { kind: "contact"; payment: InitiatedPayment }
  | { kind: "reuse"; payment: InitiatedPayment; initiateResult: PaymentInitiateResult };
type ContactClaim =
  | { kind: "claimed"; payment: InitiatedPayment }
  | { kind: "lost"; payment: InitiatedPayment; initiateResult: PaymentInitiateResult }
  | { kind: "sessionNotUsable" };

type ContactBoundaryClock = () => Date | Promise<Date>;

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
}

interface RuntimeInitiationInput {
  sessionId: string;
  userId: string;
  provider: PaymentInitiationProvider;
  mode: PaymentMode;
  routingRuleId: string;
  now?: Date;
  contactBoundaryClock?: ContactBoundaryClock;
}

export interface InitiatePaymentAttemptResult {
  paymentId: string;
  provider: InitiatedPayment["provider"];
  status: InitiatedPayment["status"];
  initiateResult: PaymentInitiateResult;
}

export async function initiatePaymentAttempt(
  client: PrismaClient,
  input: InitiatePaymentAttemptInput,
): Promise<InitiatePaymentAttemptResult> {
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
    routingRuleId: input.adapterContext.ruleId,
    now: input.now,
    contactBoundaryClock: input.contactBoundaryClock,
  });
}

async function contactProviderForAttempt(
  client: PrismaClient,
  input: RuntimeInitiationInput,
): Promise<InitiatePaymentAttemptResult> {
  const authorizationNow = input.now ?? new Date();
  const decision = await client.$transaction((tx) => authorizeContact(tx, input, authorizationNow));
  if (decision.kind === "reuse") return toResult(decision.payment, decision.initiateResult);

  const claim = await markContactStarted(client, decision.payment, input);
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

async function decideCompatible(
  tx: InitiateTx,
  current: InitiatedPayment,
  session: InitiateSession,
): Promise<InitiateDecision> {
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
  if (session.lines.length > 0
    && subtotal === session.subtotalAmount
    && subtotal + session.shippingAmount === session.totalAmount) return;
  throw staleTerms("Frozen checkout totals are incoherent.");
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
      routingRuleId: input.routingRuleId,
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACT_AUTHORIZED,
      amount: session.totalAmount,
      currency: session.currency,
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
): Promise<ContactClaim> {
  return client.$transaction(async (tx) => {
    await lockCheckoutSession(tx, payment.checkoutSessionId);
    const contactBoundaryNow = await captureContactBoundaryTime(tx, input.contactBoundaryClock);
    const session = await loadCommerceSession(tx, payment.checkoutSessionId);
    if (!session || session.userId !== input.userId) {
      throw new PaymentInitiateException("SESSION_UNAVAILABLE", "Checkout session is unavailable.");
    }
    if (!isUsable(session, contactBoundaryNow)) {
      const closed = await closeUncontactedPaymentForUnusableSession(tx, payment, contactBoundaryNow);
      if (closed) return { kind: "sessionNotUsable" };
      return lostContactClaim(await requirePayment(tx, payment.id));
    }
    if (await hasUnresolvedSessionExposure(tx, payment.checkoutSessionId)
      || await hasSessionSuspensionCycle(tx, payment.checkoutSessionId)) {
      throw remediationRequired();
    }
    await validateCommerceAtContactBoundary(tx, session);
    const result = await tx.payment.updateMany({
      where: uncontactedPaymentClaimWhere(payment),
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
}

async function captureContactBoundaryTime(
  tx: InitiateTx,
  clock: ContactBoundaryClock | undefined,
): Promise<Date> {
  if (clock) return requireValidContactBoundaryTime(await clock());
  const rows = await tx.$queryRaw<{ capturedAtMs: bigint }[]>(Prisma.sql`
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

function lostContactClaim(payment: InitiatedPayment): ContactClaim {
  const persisted = persistedInitiationResult(payment);
  if (persisted) return { kind: "lost", payment, initiateResult: persisted };
  if (payment.attemptLifecycle === PaymentAttemptLifecycle.CONTACTED) {
    return { kind: "lost", payment, initiateResult: { kind: "inProgress" } };
  }
  throw blockedAttemptError(payment);
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
      subtotalAmount: true,
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
    status: true,
    attemptLifecycle: true,
    remediationStatus: true,
    amount: true,
    currency: true,
    idempotencyKey: true,
    routingRuleId: true,
    providerRef: true,
    providerPaymentKey: true,
    initiationOutputKind: true,
    initiationApproveUrl: true,
    contactIntentAt: true,
    contactStartedAt: true,
    financialSucceededAt: true,
  };
}

function initiateIdempotencyKey(sessionId: string): string {
  return `initiate:${sessionId}:${randomUUID()}`;
}
