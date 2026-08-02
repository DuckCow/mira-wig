import { createHash } from "node:crypto";
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
import type { H1LedgerPhase } from "./run-ledger";
import { assertAcceptanceScenarioExecutable, type H1Scenario } from "./contracts";
import type { ProviderFixture } from "./fixture-manifest";
import { marketReferenceCount, requireBootstrapProjection } from "./bootstrap-projection";

const KR_MARKET = Object.freeze({
  code: "KR",
  currency: "KRW",
  shippableCountries: ["KR"],
  defaultLocale: "ko",
  isActive: true,
});

export type AcceptanceBootstrapHandle = Readonly<{
  runId: string;
  scenarioId: H1Scenario;
  marketCode: "KR";
  marketCreatedByRun: boolean;
  userId: string;
  checkoutSessionId: string;
  paymentId: string;
  orderId: string;
  amount: number;
}>;

export type BootstrapProjection = Readonly<{
  orderStatus: "PAID";
  paymentStatus: "SUCCEEDED";
  paymentProvider: "TOSS";
  paymentMode: "SANDBOX";
  checkoutStatus: "COMPLETED";
  currency: "KRW";
  amount: number;
  refundAttempts: number;
  refundTransitions: number;
  commands: number;
  commandEvents: number;
  dispatches: number;
  bindings: number;
  eligibilityProofs: number;
  contactProofs: number;
  evidence: number;
  orderItems: number;
  orderShipping: number;
  checkoutLines: number;
}>;

export class AcceptanceBootstrap {
  constructor(readonly client: PrismaClient, readonly permittedDatabase: string) {}

  async createOrLoad(input: Readonly<{
    runId: string;
    scenarioId: H1Scenario;
    fixture: ProviderFixture;
    ledgerPhase: H1LedgerPhase;
    priorHandle?: AcceptanceBootstrapHandle;
    now?: Date;
  }>): Promise<Readonly<{ handle: AcceptanceBootstrapHandle; projection: BootstrapProjection }>> {
    assertAcceptanceScenarioExecutable(input.scenarioId);
    if (hasPossibleContact(input.ledgerPhase)) throw new Error("BOOTSTRAP_SEALED_AFTER_CONTACT");
    await this.assertDatabase();
    return this.client.$transaction((tx) => bootstrapInTransaction(tx, input));
  }

  async cleanup(handle: AcceptanceBootstrapHandle): Promise<void> {
    await this.assertDatabase();
    assertOwnedHandle(handle);
    await this.client.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: handle.orderId }, select: { userId: true, paymentId: true, checkoutSessionId: true } });
      if (order && (order.userId !== handle.userId || order.paymentId !== handle.paymentId
        || order.checkoutSessionId !== handle.checkoutSessionId)) throw new Error("BOOTSTRAP_OWNERSHIP_MISMATCH");
      await tx.order.deleteMany({ where: { id: handle.orderId, userId: handle.userId, paymentId: handle.paymentId } });
      await tx.payment.deleteMany({ where: { id: handle.paymentId, checkoutSessionId: handle.checkoutSessionId } });
      await tx.checkoutSession.deleteMany({ where: { id: handle.checkoutSessionId, userId: handle.userId } });
      await tx.user.deleteMany({ where: { id: handle.userId } });
      if (handle.marketCreatedByRun && await marketReferenceCount(tx) === 0) {
        await tx.market.deleteMany({ where: { code: "KR" } });
      }
    });
  }

  private async assertDatabase(): Promise<void> {
    const rows = await this.client.$queryRaw<{ databaseName: string }[]>`
      SELECT current_database() AS "databaseName"
    `;
    if (rows.length !== 1 || rows[0].databaseName !== this.permittedDatabase
      || (this.permittedDatabase !== "wig_platform_acceptance"
        && this.permittedDatabase !== "wig_platform_test")) {
      throw new Error("BOOTSTRAP_DATABASE_GUARD_FAILED");
    }
  }
}

async function bootstrapInTransaction(
  tx: Prisma.TransactionClient,
  input: Readonly<{
    runId: string;
    scenarioId: H1Scenario;
    fixture: ProviderFixture;
    priorHandle?: AcceptanceBootstrapHandle;
    now?: Date;
  }>,
) {
  if (input.fixture.scenarioId !== input.scenarioId) throw new Error("BOOTSTRAP_FIXTURE_MISMATCH");
  const now = input.now ?? new Date();
  const ids = ownedIds(input.runId, input.scenarioId);
  const marketCreatedNow = await ensureKrMarket(tx);
  const existing = await loadExisting(tx, ids);
  if (existing.count > 0) {
    if (!existing.complete) throw new Error("BOOTSTRAP_IMMUTABLE_MISMATCH");
    const marketCreatedByRun = requirePriorOwnership(input.priorHandle, input, ids);
    const handle = handleFor(input, ids, marketCreatedByRun);
    const projection = await requireBootstrapProjection(tx, handle, input.fixture);
    return Object.freeze({ handle, projection });
  }
  await ensureProviderIdentityUnused(tx, input.fixture.paymentKey);
  await createPreRefundRows(tx, input, ids, now);
  const handle = handleFor(input, ids, marketCreatedNow);
  const projection = await requireBootstrapProjection(tx, handle, input.fixture);
  return Object.freeze({ handle, projection });
}

function requirePriorOwnership(
  prior: AcceptanceBootstrapHandle | undefined,
  input: Readonly<{ runId: string; scenarioId: H1Scenario; fixture: ProviderFixture }>,
  ids: ReturnType<typeof ownedIds>,
): boolean {
  if (!prior || prior.runId !== input.runId || prior.scenarioId !== input.scenarioId
    || prior.userId !== ids.userId || prior.checkoutSessionId !== ids.checkoutSessionId
    || prior.paymentId !== ids.paymentId || prior.orderId !== ids.orderId
    || prior.amount !== input.fixture.amount || prior.marketCode !== "KR") {
    throw new Error("BOOTSTRAP_OWNERSHIP_REQUIRED");
  }
  return prior.marketCreatedByRun;
}

async function createPreRefundRows(
  tx: Prisma.TransactionClient,
  input: Readonly<{ scenarioId: H1Scenario; fixture: ProviderFixture }>,
  ids: ReturnType<typeof ownedIds>,
  now: Date,
): Promise<void> {
  await tx.user.create({
    data: { id: ids.userId, email: ids.email, name: `H1 ${input.scenarioId}` },
  });
  await tx.checkoutSession.create({ data: {
    id: ids.checkoutSessionId,
    userId: ids.userId,
    marketCode: "KR",
    currency: "KRW",
    status: CheckoutSessionStatus.COMPLETED,
    subtotalAmount: input.fixture.amount,
    shippingAmount: 0,
    totalAmount: input.fixture.amount,
    expiresAt: new Date(now.getTime() + 60 * 60_000),
    submittedAt: now,
    completedAt: now,
  } });
  await tx.payment.create({ data: {
    id: ids.paymentId,
    checkoutSessionId: ids.checkoutSessionId,
    provider: PaymentProvider.TOSS,
    mode: PaymentMode.SANDBOX,
    status: PaymentAttemptStatus.SUCCEEDED,
    attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
    amount: input.fixture.amount,
    currency: "KRW",
    providerRef: `h1-ref-${ids.digest}`,
    providerPaymentKey: input.fixture.paymentKey,
    contactIntentAt: now,
    contactStartedAt: now,
    financialSucceededAt: now,
    blockingEndedAt: now,
    idempotencyKey: `h1-payment-${ids.digest}`,
  } });
  await tx.order.create({ data: {
    id: ids.orderId,
    checkoutSessionId: ids.checkoutSessionId,
    paymentId: ids.paymentId,
    userId: ids.userId,
    marketCode: "KR",
    currency: "KRW",
    subtotalAmount: input.fixture.amount,
    shippingAmount: 0,
    totalAmount: input.fixture.amount,
    status: OrderStatus.PAID,
    paidAt: now,
  } });
}

async function ensureKrMarket(tx: Prisma.TransactionClient): Promise<boolean> {
  const existing = await tx.market.findUnique({ where: { code: "KR" } });
  if (existing) {
    if (existing.currency !== KR_MARKET.currency
      || existing.defaultLocale !== KR_MARKET.defaultLocale
      || existing.isActive !== KR_MARKET.isActive
      || existing.taxConfig !== null
      || existing.paymentConfig !== null
      || existing.shippableCountries.length !== 1
      || existing.shippableCountries[0] !== "KR") throw new Error("KR_MARKET_INCOMPATIBLE");
    return false;
  }
  await tx.market.create({ data: { ...KR_MARKET, shippableCountries: [...KR_MARKET.shippableCountries] } });
  return true;
}

function ownedIds(runId: string, scenarioId: H1Scenario) {
  const digest = createHash("sha256").update(`${runId}:${scenarioId}`).digest("hex").slice(0, 24);
  return Object.freeze({
    digest,
    userId: `h1_user_${digest}`,
    email: `h1+${digest}@example.test`,
    checkoutSessionId: `h1_session_${digest}`,
    paymentId: `h1_payment_${digest}`,
    orderId: `h1_order_${digest}`,
  });
}

async function loadExisting(tx: Prisma.TransactionClient, ids: ReturnType<typeof ownedIds>) {
  const [user, session, payment, order] = await Promise.all([
    tx.user.findUnique({ where: { id: ids.userId }, select: { id: true, email: true } }),
    tx.checkoutSession.findUnique({ where: { id: ids.checkoutSessionId }, select: { id: true } }),
    tx.payment.findUnique({ where: { id: ids.paymentId }, select: { id: true } }),
    tx.order.findUnique({ where: { id: ids.orderId }, select: { id: true } }),
  ]);
  const count = [user, session, payment, order].filter(Boolean).length;
  return Object.freeze({ count, complete: count === 4 && user?.email === ids.email });
}

async function ensureProviderIdentityUnused(tx: Prisma.TransactionClient, paymentKey: string): Promise<void> {
  const existing = await tx.payment.findUnique({
    where: { provider_providerPaymentKey: { provider: PaymentProvider.TOSS, providerPaymentKey: paymentKey } },
    select: { id: true },
  });
  if (existing) throw new Error("BOOTSTRAP_PROVIDER_IDENTITY_IN_USE");
}

function handleFor(
  input: Readonly<{ runId: string; scenarioId: H1Scenario; fixture: ProviderFixture }>,
  ids: ReturnType<typeof ownedIds>,
  marketCreatedByRun: boolean,
): AcceptanceBootstrapHandle {
  return Object.freeze({
    runId: input.runId,
    scenarioId: input.scenarioId,
    marketCode: "KR",
    marketCreatedByRun,
    userId: ids.userId,
    checkoutSessionId: ids.checkoutSessionId,
    paymentId: ids.paymentId,
    orderId: ids.orderId,
    amount: input.fixture.amount,
  });
}

function hasPossibleContact(phase: H1LedgerPhase): boolean {
  return ["POST_INTENT_RECORDED", "POST_RESPONSE_RECORDED", "HUMAN_POST_DECISION_REQUIRED",
    "LOCAL_COMMIT_COMPLETE", "REVIEW_REQUIRED", "SEALED", "DB_CLEANED"].includes(phase);
}

function assertOwnedHandle(handle: AcceptanceBootstrapHandle): void {
  const expected = ownedIds(handle.runId, handle.scenarioId);
  if (handle.userId !== expected.userId || handle.checkoutSessionId !== expected.checkoutSessionId
    || handle.paymentId !== expected.paymentId || handle.orderId !== expected.orderId) {
    throw new Error("BOOTSTRAP_OWNERSHIP_MISMATCH");
  }
}
