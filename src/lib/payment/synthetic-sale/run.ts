import "server-only";

import {
  CheckoutSessionStatus,
  OrderStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { initiatePaymentAttemptWithTransientAuthority } from "@/lib/payment/attempt/initiate";
import { materializeFreshEximbayReadyHandoffWithClient } from "@/lib/payment/eximbay/sdk-handoff";
import type { EximbayReadyHandoffV1 } from "@/lib/payment/eximbay/sdk-handoff-contract";
import type { EximbayReadyFetch } from "@/lib/payment/eximbay/ready-http";
import { ProviderCapability } from "@/lib/payment/providers/capabilities";
import type { ProviderFactoryContext } from "@/lib/payment/providers/contract";
import { credentialChecksForProvider, type ProviderEnv } from "@/lib/payment/providers/credentials";
import {
  liveGuardForProviderContext,
  PaymentMethod,
  resolveProviderForPayment,
  type ProviderResolution,
} from "@/lib/payment/providers/routing";
import {
  SYNTHETIC_SALE_AMOUNT_MINOR,
  SYNTHETIC_SALE_CURRENCY,
  SYNTHETIC_SALE_MARKET,
  SYNTHETIC_SALE_MID,
  SYNTHETIC_SALE_ROUTING_RULE,
  syntheticSaleRunIdentity,
  type SyntheticSaleRuntimeConfiguration,
} from "./contract";
import { materializeSyntheticSaleFixture, type SyntheticSaleFixture } from "./fixture";

export type SyntheticSaleStatus = "WAITING" | "CONTACTED" | "SUCCEEDED" | "FAILED" | "AMBIGUOUS";
type RuntimePhase = "READY" | "STARTING" | "CONTACTED";

export interface SyntheticSaleRunOwner {
  readonly capability: string;
  readonly runIdentity: string;
  start(): Promise<EximbayReadyHandoffV1>;
  status(sessionId?: string): Promise<Readonly<{ state: SyntheticSaleStatus; sessionId?: string }>>;
}

export function createSyntheticSaleRunOwner(
  client: PrismaClient,
  configuration: SyntheticSaleRuntimeConfiguration,
  fetchImpl: EximbayReadyFetch = fetch,
): SyntheticSaleRunOwner {
  const runIdentity = syntheticSaleRunIdentity(configuration.capability);
  let phase: RuntimePhase = "READY";
  let startFlight: Promise<EximbayReadyHandoffV1> | null = null;
  let fixture: SyntheticSaleFixture | null = null;

  const start = (): Promise<EximbayReadyHandoffV1> => {
    if (phase !== "READY" || startFlight) return Promise.reject(new Error("SYNTHETIC_SALE_ALREADY_STARTED"));
    phase = "STARTING";
    startFlight = executeStart(client, configuration, runIdentity, fetchImpl).then((result) => {
      fixture = result.fixture;
      phase = "CONTACTED";
      return result.handoff;
    }, (error: unknown) => {
      phase = "CONTACTED";
      throw error;
    });
    return startFlight;
  };
  return Object.freeze({
    capability: configuration.capability,
    runIdentity,
    start,
    status: (sessionId?: string) => readStatus(client, runIdentity, fixture, sessionId),
  });
}

async function executeStart(
  client: PrismaClient,
  configuration: SyntheticSaleRuntimeConfiguration,
  runIdentity: string,
  fetchImpl: EximbayReadyFetch,
): Promise<Readonly<{ fixture: SyntheticSaleFixture; handoff: EximbayReadyHandoffV1 }>> {
  const existing = await readStatus(client, runIdentity, null);
  if (existing.state !== "WAITING" || existing.sessionId) {
    throw new Error("SYNTHETIC_SALE_ALREADY_STARTED");
  }
  const fixture = await materializeSyntheticSaleFixture(client, runIdentity);
  const resolution = resolveProviderForPayment({
    market: SYNTHETIC_SALE_MARKET,
    method: PaymentMethod.CARD,
    currency: SYNTHETIC_SALE_CURRENCY,
    amountMinor: SYNTHETIC_SALE_AMOUNT_MINOR,
    mode: PaymentMode.SANDBOX,
  });
  if (!isExactRouting(resolution)) {
    throw new Error("SYNTHETIC_SALE_ROUTING_DRIFT");
  }
  const providerEnv: ProviderEnv = {
    ...configuration.providerEnv,
    PAYMENT_PUBLIC_ORIGIN: configuration.publicOrigin,
  };
  const execution = await initiatePaymentAttemptWithTransientAuthority(client, {
    sessionId: fixture.sessionId,
    userId: fixture.userId,
    adapterContext: syntheticProviderContext(resolution, providerEnv),
    eximbayReady: { env: providerEnv, fetchImpl },
  });
  if (execution.channel !== "FRESH_EXIMBAY_READY") throw new Error("SYNTHETIC_SALE_FRESH_READY_REQUIRED");
  const handoff = await materializeFreshEximbayReadyHandoffWithClient(
    client,
    execution.durable.paymentId,
    execution.freshAuthority,
  );
  if (handoff.mode !== PaymentMode.SANDBOX || handoff.payload.merchant.mid !== SYNTHETIC_SALE_MID) {
    throw new Error("SYNTHETIC_SALE_HANDOFF_DRIFT");
  }
  return Object.freeze({ fixture, handoff });
}

function syntheticProviderContext(
  resolution: ProviderResolution,
  env: ProviderEnv,
): ProviderFactoryContext {
  return Object.freeze({
    provider: resolution.selectedProvider,
    mode: resolution.mode,
    market: SYNTHETIC_SALE_MARKET,
    method: PaymentMethod.CARD,
    currency: SYNTHETIC_SALE_CURRENCY,
    ruleId: resolution.ruleId,
    credentials: credentialChecksForProvider({
      provider: resolution.selectedProvider,
      mode: resolution.mode,
      capability: ProviderCapability.ACTION_ADAPTER,
    }, env),
    liveGuard: liveGuardForProviderContext({
      provider: resolution.selectedProvider,
      market: SYNTHETIC_SALE_MARKET,
      method: PaymentMethod.CARD,
      currency: SYNTHETIC_SALE_CURRENCY,
      ruleId: resolution.ruleId,
    }),
  });
}

function isExactRouting(resolution: Readonly<{
  selectedProvider: PaymentProvider;
  ruleId: string;
  mode: string;
}>): boolean {
  return resolution.selectedProvider === PaymentProvider.EXIMBAY
    && resolution.ruleId === SYNTHETIC_SALE_ROUTING_RULE
    && resolution.mode === PaymentMode.SANDBOX;
}

async function readStatus(
  client: PrismaClient,
  runIdentity: string,
  knownFixture: SyntheticSaleFixture | null,
  requestedSessionId?: string,
): Promise<Readonly<{ state: SyntheticSaleStatus; sessionId?: string }>> {
  const userId = `exsale_user_${runIdentity}`;
  const sessions = await client.checkoutSession.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    take: 2,
    include: { payments: { orderBy: { createdAt: "asc" }, take: 2 }, order: true },
  });
  if (sessions.length === 0) return status("WAITING");
  if (sessions.length !== 1) return status("AMBIGUOUS");
  const session = sessions[0];
  if (!session) return status("AMBIGUOUS");
  return classifySession(session, requestedSessionId, knownFixture);
}

type StatusSession = Prisma.CheckoutSessionGetPayload<{
  include: { payments: true; order: true };
}>;

function classifySession(
  session: StatusSession,
  requestedSessionId: string | undefined,
  knownFixture: SyntheticSaleFixture | null,
): Readonly<{ state: SyntheticSaleStatus; sessionId?: string }> {
  if (invalidSessionIdentity(session.id, requestedSessionId, knownFixture)
    || session.payments.length > 1) return status("AMBIGUOUS");
  const payment = session.payments[0];
  if (!payment) return status("WAITING", session.id);
  return classifyPayment(session, payment);
}

function classifyPayment(
  session: StatusSession,
  payment: StatusSession["payments"][number],
): Readonly<{ state: SyntheticSaleStatus; sessionId?: string }> {
  if (payment.provider !== PaymentProvider.EXIMBAY || payment.mode !== PaymentMode.SANDBOX) {
    return status("AMBIGUOUS", session.id);
  }
  if (isSucceeded(session, payment)) return status("SUCCEEDED", session.id);
  if (payment.attemptLifecycle === PaymentAttemptLifecycle.OUTCOME_UNKNOWN) {
    return status("AMBIGUOUS", session.id);
  }
  return status(payment.status === PaymentAttemptStatus.FAILED ? "FAILED" : "CONTACTED", session.id);
}

function invalidSessionIdentity(
  sessionId: string,
  requestedSessionId: string | undefined,
  knownFixture: SyntheticSaleFixture | null,
): boolean {
  return (requestedSessionId !== undefined && requestedSessionId !== sessionId)
    || (knownFixture !== null && knownFixture.sessionId !== sessionId);
}

function isSucceeded(
  session: Readonly<{ status: CheckoutSessionStatus; order: null | Readonly<{ status: OrderStatus }> }>,
  payment: Readonly<{ status: PaymentAttemptStatus; attemptLifecycle: PaymentAttemptLifecycle }>,
): boolean {
  return payment.status === PaymentAttemptStatus.SUCCEEDED
    && payment.attemptLifecycle === PaymentAttemptLifecycle.FINALIZED
    && session.status === CheckoutSessionStatus.COMPLETED
    && session.order?.status === OrderStatus.PAID;
}

function status(
  state: SyntheticSaleStatus,
  sessionId?: string,
): Readonly<{ state: SyntheticSaleStatus; sessionId?: string }> {
  return Object.freeze(sessionId ? { state, sessionId } : { state });
}
