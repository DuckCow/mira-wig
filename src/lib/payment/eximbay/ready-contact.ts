import "server-only";
import {
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentProvider,
  PaymentRemediationStatus,
  type PrismaClient,
} from "@prisma/client";
import {
  createEximbayReadyContactPlanCore,
  type EximbayReadyContactPlanCore,
  type TrustedEximbayReadySuccess,
} from "./ready-kernel";
import { createTrustedEximbayProviderOrderBinding } from "./ready";
import {
  requireEximbayReadyConfigFacts,
  resolveEximbayReadyConfig,
  type EximbayReadyConfig,
} from "./ready-config";
import {
  createCanonicalEximbayReadyFacts,
  type EximbayReadyBuyerFacts,
  type EximbayReadyPaymentFacts,
  type EximbayReadySessionFacts,
} from "./ready-facts";
import {
  executeEximbayReadyHttp,
  type EximbayReadyFetch,
} from "./ready-http";
import type { ProviderEnv } from "@/lib/payment/providers/credentials";
import type { PaymentMethod, PaymentMode } from "@/lib/payment/providers/routing";

export type { EximbayReadyFetch } from "./ready-http";
export { EXIMBAY_READY_TOTAL_DEADLINE_MS } from "./ready-http";

const preparedContactBrand: unique symbol = Symbol("PreparedEximbayReadyContact");
const freshAuthorityBrand: unique symbol = Symbol("FreshEximbayReadyAuthority");
const preparedAuthorities = new WeakMap<object, PreparedAuthority>();
const executedPreparedContacts = new WeakSet<object>();
const freshAuthorities = new WeakMap<object, FreshAuthority>();

interface PreparedSnapshot {
  readonly payment: EximbayReadyPaymentFacts;
  readonly session: EximbayReadySessionFacts;
  readonly buyer: EximbayReadyBuyerFacts;
  readonly method: PaymentMethod;
}

interface PreparedAuthority {
  readonly config: EximbayReadyConfig;
  readonly fetchImpl: EximbayReadyFetch;
  readonly plan: EximbayReadyContactPlanCore;
  readonly snapshot: PreparedSnapshot;
}

interface FreshAuthority {
  readonly plan: EximbayReadyContactPlanCore;
  readonly success: TrustedEximbayReadySuccess;
}

export interface PreparedEximbayReadyContact {
  readonly [preparedContactBrand]: true;
}

export interface FreshEximbayReadyAuthority {
  readonly [freshAuthorityBrand]: true;
}

export interface PrepareEximbayReadyContactInput {
  readonly paymentId: string;
  readonly checkoutSessionId: string;
  readonly userId: string;
  readonly mode: PaymentMode;
  readonly method: PaymentMethod;
  readonly env?: ProviderEnv;
  readonly fetchImpl?: EximbayReadyFetch;
}

export interface RevalidatedEximbayReadyContactInput {
  readonly payment: EximbayReadyPaymentFacts;
  readonly session: EximbayReadySessionFacts;
  readonly buyer: EximbayReadyBuyerFacts;
  readonly method: PaymentMethod;
}

export type EximbayReadyContactExecution =
  | Readonly<{ kind: "admittedSuccess"; freshAuthority: FreshEximbayReadyAuthority }>
  | Readonly<{ kind: "notAdmitted" }>;

export type EximbayReadyContactErrorCode =
  | "PAYMENT_NOT_FOUND"
  | "SESSION_NOT_FOUND"
  | "PAYMENT_NOT_CONTACT_AUTHORIZED"
  | "PAYMENT_MODE_MISMATCH"
  | "PREPARED_FACTS_DRIFT"
  | "PREPARED_CONTACT_ALREADY_EXECUTED"
  | "UNTRUSTED_PREPARED_CONTACT"
  | "UNTRUSTED_FRESH_AUTHORITY";

export class EximbayReadyContactError extends Error {
  constructor(readonly code: EximbayReadyContactErrorCode) {
    super(code);
    this.name = "EximbayReadyContactError";
  }
}

export async function prepareEximbayReadyContact(
  client: PrismaClient,
  input: PrepareEximbayReadyContactInput,
): Promise<PreparedEximbayReadyContact> {
  const payment = await loadPayment(client, input.paymentId);
  if (!payment) throw new EximbayReadyContactError("PAYMENT_NOT_FOUND");
  requireContactAuthorizedPayment(payment);
  if (payment.checkoutSessionId !== input.checkoutSessionId || payment.mode !== input.mode) {
    throw new EximbayReadyContactError("PAYMENT_MODE_MISMATCH");
  }
  const session = await loadSessionAndBuyer(client, input.checkoutSessionId);
  if (!session || session.userId !== input.userId) {
    throw new EximbayReadyContactError("SESSION_NOT_FOUND");
  }
  const config = resolveEximbayReadyConfig(payment.mode, input.env);
  const configFacts = requireEximbayReadyConfigFacts(config);
  const facts = createCanonicalEximbayReadyFacts({
    payment,
    session: sessionFacts(session),
    buyer: session.user,
    method: input.method,
    mid: configFacts.mid,
    paymentPublicOrigin: configFacts.paymentPublicOrigin,
  });
  const binding = await createTrustedEximbayProviderOrderBinding(
    facts.providerOrderCandidate,
    payment.id,
  );
  const plan = createEximbayReadyContactPlanCore(configFacts.mode, facts, binding);
  const prepared: PreparedEximbayReadyContact = { [preparedContactBrand]: true };
  Object.defineProperty(prepared, preparedContactBrand, { enumerable: false });
  preparedAuthorities.set(prepared, Object.freeze({
    config,
    fetchImpl: input.fetchImpl ?? globalThis.fetch,
    plan,
    snapshot: Object.freeze({
      payment: Object.freeze(payment),
      session: Object.freeze(sessionFacts(session)),
      buyer: Object.freeze(session.user),
      method: input.method,
    }),
  }));
  return Object.freeze(prepared);
}

export function assertPreparedEximbayReadyContact(
  prepared: PreparedEximbayReadyContact,
  current: RevalidatedEximbayReadyContactInput,
): void {
  const authority = requirePreparedAuthority(prepared);
  if (!samePayment(authority.snapshot.payment, current.payment)
    || !sameSession(authority.snapshot.session, current.session)
    || !sameBuyer(authority.snapshot.buyer, current.buyer)
    || authority.snapshot.method !== current.method) {
    throw new EximbayReadyContactError("PREPARED_FACTS_DRIFT");
  }
}

export async function executePreparedEximbayReadyContact(
  prepared: PreparedEximbayReadyContact,
): Promise<EximbayReadyContactExecution> {
  const authority = requirePreparedAuthority(prepared);
  if (executedPreparedContacts.has(prepared)) {
    throw new EximbayReadyContactError("PREPARED_CONTACT_ALREADY_EXECUTED");
  }
  executedPreparedContacts.add(prepared);
  const config = requireEximbayReadyConfigFacts(authority.config);
  const result = await executeEximbayReadyHttp(
    authority.plan,
    config.credentials,
    authority.fetchImpl,
  );
  if (result.kind === "notAdmitted") return Object.freeze({ kind: "notAdmitted" });
  const freshAuthority = createFreshAuthority(authority.plan, result.success);
  return Object.freeze({ kind: "admittedSuccess", freshAuthority });
}

export function consumeFreshEximbayReadyAuthority<T>(
  authority: FreshEximbayReadyAuthority,
  consumer: (
    plan: EximbayReadyContactPlanCore,
    success: TrustedEximbayReadySuccess,
  ) => T,
): T {
  const fresh = freshAuthorities.get(authority);
  if (!fresh) throw new EximbayReadyContactError("UNTRUSTED_FRESH_AUTHORITY");
  return consumer(fresh.plan, fresh.success);
}

function createFreshAuthority(
  plan: EximbayReadyContactPlanCore,
  success: TrustedEximbayReadySuccess,
): FreshEximbayReadyAuthority {
  const authority: FreshEximbayReadyAuthority = { [freshAuthorityBrand]: true };
  Object.defineProperty(authority, freshAuthorityBrand, { enumerable: false });
  freshAuthorities.set(authority, Object.freeze({ plan, success }));
  return Object.freeze(authority);
}

function requirePreparedAuthority(prepared: PreparedEximbayReadyContact): PreparedAuthority {
  const authority = preparedAuthorities.get(prepared);
  if (!authority) throw new EximbayReadyContactError("UNTRUSTED_PREPARED_CONTACT");
  return authority;
}

function requireContactAuthorizedPayment(payment: LoadedPayment): void {
  const invalid = [
    payment.provider !== PaymentProvider.EXIMBAY,
    payment.status !== PaymentAttemptStatus.INITIATED,
    payment.attemptLifecycle !== PaymentAttemptLifecycle.CONTACT_AUTHORIZED,
    payment.remediationStatus !== PaymentRemediationStatus.NONE,
    payment.contactStartedAt !== null,
    payment.providerRef !== null,
    payment.providerPaymentKey !== null,
    payment.initiationOutputKind !== null,
    payment.initiationApproveUrl !== null,
    payment.initiationCompletedAt !== null,
    payment.financialSucceededAt !== null,
    payment.blockingEndedAt !== null,
    payment.suspendedByPaymentId !== null,
  ].some(Boolean);
  if (invalid) {
    throw new EximbayReadyContactError("PAYMENT_NOT_CONTACT_AUTHORIZED");
  }
}

function samePayment(left: EximbayReadyPaymentFacts, right: EximbayReadyPaymentFacts): boolean {
  return left.id === right.id
    && left.checkoutSessionId === right.checkoutSessionId
    && left.provider === right.provider
    && left.mode === right.mode
    && left.providerOrderId === right.providerOrderId
    && left.amount === right.amount
    && left.currency === right.currency
    && left.routingRuleId === right.routingRuleId;
}

function sameSession(left: EximbayReadySessionFacts, right: EximbayReadySessionFacts): boolean {
  return left.id === right.id
    && left.userId === right.userId
    && left.marketCode === right.marketCode
    && left.currency === right.currency
    && left.totalAmount === right.totalAmount;
}

function sameBuyer(left: EximbayReadyBuyerFacts, right: EximbayReadyBuyerFacts): boolean {
  return left.id === right.id && left.name === right.name && left.email === right.email;
}

function sessionFacts(session: LoadedSession): EximbayReadySessionFacts {
  return {
    id: session.id,
    userId: session.userId,
    marketCode: session.marketCode,
    currency: session.currency,
    totalAmount: session.totalAmount,
  };
}

function loadPayment(client: PrismaClient, paymentId: string) {
  return client.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      checkoutSessionId: true,
      provider: true,
      mode: true,
      providerOrderId: true,
      amount: true,
      currency: true,
      routingRuleId: true,
      status: true,
      attemptLifecycle: true,
      remediationStatus: true,
      contactStartedAt: true,
      providerRef: true,
      providerPaymentKey: true,
      initiationOutputKind: true,
      initiationApproveUrl: true,
      initiationCompletedAt: true,
      financialSucceededAt: true,
      blockingEndedAt: true,
      suspendedByPaymentId: true,
    },
  });
}

function loadSessionAndBuyer(client: PrismaClient, sessionId: string) {
  return client.checkoutSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      userId: true,
      marketCode: true,
      currency: true,
      totalAmount: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
}

type LoadedPayment = NonNullable<Awaited<ReturnType<typeof loadPayment>>>;
type LoadedSession = NonNullable<Awaited<ReturnType<typeof loadSessionAndBuyer>>>;
