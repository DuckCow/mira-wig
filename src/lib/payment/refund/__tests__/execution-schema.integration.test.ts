import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
  ShippingCountry,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";

const MARKET_CODE = "KR";
const NOW = new Date("2026-07-11T02:45:00.000Z");

interface TestContext {
  userId: string;
  orderId: string;
  paymentId: string;
  sessionId: string;
  refundAttemptId: string;
}

describe("refund execution schema", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createFixture();
  });

  afterEach(async () => {
    await cleanup(ctx);
  });

  it("owns at most one command per attempt and exposes both relation directions", async () => {
    const command = await db.refundExecutionCommand.create({
      data: commandData(ctx.refundAttemptId),
      include: { refundAttempt: true },
    });
    const attempt = await db.refundAttempt.findUniqueOrThrow({
      where: { id: ctx.refundAttemptId },
      include: { executionCommand: true },
    });

    expect(command.refundAttempt.id).toBe(ctx.refundAttemptId);
    expect(attempt.executionCommand?.id).toBe(command.id);

    await expectPrismaCode(
      db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId) }),
      "P2002",
    );
  });

  it.each([
    {
      label: "negative dispatch ordinal",
      override: { dispatchAttempt: -1 },
      constraint: "RefundExecutionCommand_dispatch_attempt_nonnegative_check",
    },
    {
      label: "LEASED without owner",
      override: {
        status: RefundExecutionCommandStatus.LEASED,
        leaseUntil: NOW,
        dispatchAttempt: 1,
      },
      constraint: "RefundExecutionCommand_lease_status_coherence_check",
    },
    {
      label: "LEASED without deadline",
      override: {
        status: RefundExecutionCommandStatus.LEASED,
        leaseOwner: "worker-1",
        dispatchAttempt: 1,
      },
      constraint: "RefundExecutionCommand_lease_status_coherence_check",
    },
    {
      label: "LEASED with zero ordinal",
      override: {
        status: RefundExecutionCommandStatus.LEASED,
        leaseOwner: "worker-1",
        leaseUntil: NOW,
        dispatchAttempt: 0,
      },
      constraint: "RefundExecutionCommand_leased_dispatch_attempt_check",
    },
    {
      label: "non-LEASED with lease fields",
      override: {
        status: RefundExecutionCommandStatus.READY,
        leaseOwner: "worker-1",
        leaseUntil: NOW,
      },
      constraint: "RefundExecutionCommand_lease_status_coherence_check",
    },
    {
      label: "blank lease owner",
      override: {
        status: RefundExecutionCommandStatus.LEASED,
        leaseOwner: "   ",
        leaseUntil: NOW,
        dispatchAttempt: 1,
      },
      constraint: "RefundExecutionCommand_lease_owner_nonblank_check",
    },
    {
      label: "blank safe error code",
      override: { lastSafeErrorCode: "   " },
      constraint: "RefundExecutionCommand_last_safe_error_code_nonblank_check",
    },
    {
      label: "blank safe error message",
      override: { lastSafeErrorMessage: "   " },
      constraint: "RefundExecutionCommand_last_safe_error_message_nonblank_check",
    },
  ])("rejects an incoherent command: $label", async ({ override, constraint }) => {
    await expectConstraint(
      db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId, override) }),
      constraint,
    );
  });

  it("accepts a coherent LEASED command with a positive persisted ordinal", async () => {
    const command = await db.refundExecutionCommand.create({
      data: commandData(ctx.refundAttemptId, {
        status: RefundExecutionCommandStatus.LEASED,
        leaseOwner: "worker-1",
        leaseUntil: NOW,
        dispatchAttempt: 1,
      }),
    });

    expect(command).toMatchObject({
      status: RefundExecutionCommandStatus.LEASED,
      leaseOwner: "worker-1",
      leaseUntil: NOW,
      dispatchAttempt: 1,
    });
  });

  it("stores evidence under its command, deduplicates globally, and restricts parent deletion", async () => {
    const command = await db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId) });
    const sourceDedupKey = `refund-result:${command.id}:1`;
    const evidence = await db.refundExecutionEvidence.create({
      data: evidenceData(command.id, { sourceDedupKey }),
      include: { command: { include: { refundAttempt: true } } },
    });

    expect(evidence.command.refundAttempt.id).toBe(ctx.refundAttemptId);
    await expectPrismaCode(
      db.refundExecutionEvidence.create({ data: evidenceData(command.id, { sourceDedupKey }) }),
      "P2002",
    );
    await expectConstraint(
      db.refundExecutionCommand.delete({ where: { id: command.id } }),
      "RefundExecutionEvidence_commandId_fkey",
    );
    await expectConstraint(
      db.refundAttempt.delete({ where: { id: ctx.refundAttemptId } }),
      "RefundExecutionCommand_refundAttemptId_fkey",
    );
  });

  it.each([
    {
      label: "amount without currency",
      override: { reportedAmount: 1_000 },
      constraint: "RefundExecutionEvidence_reported_pair_check",
    },
    {
      label: "currency without amount",
      override: { reportedCurrency: "KRW" },
      constraint: "RefundExecutionEvidence_reported_pair_check",
    },
    {
      label: "zero amount",
      override: { reportedAmount: 0, reportedCurrency: "KRW" },
      constraint: "RefundExecutionEvidence_reported_amount_positive_check",
    },
    {
      label: "negative amount",
      override: { reportedAmount: -1, reportedCurrency: "KRW" },
      constraint: "RefundExecutionEvidence_reported_amount_positive_check",
    },
    {
      label: "lowercase currency",
      override: { reportedAmount: 1, reportedCurrency: "krw" },
      constraint: "RefundExecutionEvidence_reported_currency_format_check",
    },
    {
      label: "malformed currency",
      override: { reportedAmount: 1, reportedCurrency: "KR" },
      constraint: "RefundExecutionEvidence_reported_currency_format_check",
    },
    {
      label: "blank source dedup key",
      override: { sourceDedupKey: "   " },
      constraint: "RefundExecutionEvidence_source_dedup_key_nonblank_check",
    },
    {
      label: "blank observed provider refund id",
      override: { observedProviderRefundId: "   " },
      constraint: "RefundExecutionEvidence_provider_refund_id_nonblank_check",
    },
    {
      label: "blank safe code",
      override: { safeCode: "   " },
      constraint: "RefundExecutionEvidence_safe_code_nonblank_check",
    },
    {
      label: "blank safe message",
      override: { safeMessage: "   " },
      constraint: "RefundExecutionEvidence_safe_message_nonblank_check",
    },
  ])("rejects invalid normalized evidence: $label", async ({ override, constraint }) => {
    const command = await db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId) });

    await expectConstraint(
      db.refundExecutionEvidence.create({ data: evidenceData(command.id, override) }),
      constraint,
    );
  });

  it("accepts evidence with both reported financial fields absent", async () => {
    const command = await db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId) });

    const evidence = await db.refundExecutionEvidence.create({ data: evidenceData(command.id) });

    expect(evidence).toMatchObject({ reportedAmount: null, reportedCurrency: null });
  });

  it("accepts positive uppercase reported pairs without enforcing expected-value equality", async () => {
    const command = await db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId) });

    const [matching, mismatched] = await Promise.all([
      db.refundExecutionEvidence.create({
        data: evidenceData(command.id, {
          sourceDedupKey: `refund-result:${command.id}:1`,
          reportedAmount: 1_000,
          reportedCurrency: "KRW",
        }),
      }),
      db.refundExecutionEvidence.create({
        data: evidenceData(command.id, {
          sourceDedupKey: `refund-result:${command.id}:2`,
          reportedAmount: 999,
          reportedCurrency: "USD",
          application: RefundExecutionEvidenceApplication.CONFLICT,
        }),
      }),
    ]);

    expect(matching).toMatchObject({ reportedAmount: 1_000, reportedCurrency: "KRW" });
    expect(mismatched).toMatchObject({
      reportedAmount: 999,
      reportedCurrency: "USD",
      application: RefundExecutionEvidenceApplication.CONFLICT,
    });
  });
});

function commandData(
  refundAttemptId: string,
  override: Partial<Prisma.RefundExecutionCommandUncheckedCreateInput> = {},
): Prisma.RefundExecutionCommandUncheckedCreateInput {
  return {
    refundAttemptId,
    availableAt: NOW,
    ...override,
  };
}

function evidenceData(
  commandId: string,
  override: Partial<Prisma.RefundExecutionEvidenceUncheckedCreateInput> = {},
): Prisma.RefundExecutionEvidenceUncheckedCreateInput {
  return {
    commandId,
    source: RefundExecutionEvidenceSource.ADAPTER_RESPONSE,
    sourceDedupKey: `refund-result:${commandId}:${randomUUID()}`,
    outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
    application: RefundExecutionEvidenceApplication.PARKED,
    observedAt: NOW,
    ...override,
  };
}

async function expectConstraint(promise: Promise<unknown>, constraint: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(errorDetails(error)).toContain(constraint);
    return;
  }
  throw new Error(`Expected database constraint ${constraint} to reject the write.`);
}

async function expectPrismaCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected Prisma error ${code}.`);
}

function errorDetails(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `${error.message}\n${JSON.stringify(error.meta)}`;
  }
  return error.message;
}

async function createFixture(): Promise<TestContext> {
  const identity = randomUUID();
  const userId = `refund_execution_schema_${identity}`;
  await ensureMarket();
  await db.user.create({ data: { id: userId, email: `${userId}@example.test` } });
  const session = await db.checkoutSession.create({
    data: {
      userId,
      marketCode: MARKET_CODE,
      currency: "KRW",
      status: CheckoutSessionStatus.COMPLETED,
      subtotalAmount: 1_000,
      shippingAmount: 0,
      totalAmount: 1_000,
      expiresAt: new Date(NOW.getTime() + 30 * 60_000),
      completedAt: NOW,
    },
  });
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: session.id,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      amount: 1_000,
      currency: "KRW",
      providerPaymentKey: `provider_payment_${identity}`,
      idempotencyKey: `payment_idem_${identity}`,
    },
  });
  const order = await db.order.create({
    data: {
      checkoutSessionId: session.id,
      paymentId: payment.id,
      userId,
      marketCode: MARKET_CODE,
      currency: "KRW",
      subtotalAmount: 1_000,
      shippingAmount: 0,
      totalAmount: 1_000,
      status: OrderStatus.REFUND_PENDING,
      paidAt: NOW,
    },
  });
  const refundAttempt = await db.refundAttempt.create({
    data: {
      orderId: order.id,
      paymentId: payment.id,
      amount: 1_000,
      currency: "KRW",
      status: RefundAttemptStatus.PROCESSING,
      reason: "Schema constraint fixture",
      actorType: RefundAttemptActorType.SYSTEM,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      idempotencyKey: `refund:${payment.id}:${identity}`,
      requestedAt: NOW,
    },
  });
  return {
    userId,
    orderId: order.id,
    paymentId: payment.id,
    sessionId: session.id,
    refundAttemptId: refundAttempt.id,
  };
}

async function ensureMarket(): Promise<void> {
  await db.market.upsert({
    where: { code: MARKET_CODE },
    update: {
      currency: "KRW",
      shippableCountries: [ShippingCountry.KR],
      defaultLocale: "ko",
      isActive: true,
    },
    create: {
      code: MARKET_CODE,
      currency: "KRW",
      shippableCountries: [ShippingCountry.KR],
      defaultLocale: "ko",
      isActive: true,
    },
  });
}

async function cleanup(context: TestContext): Promise<void> {
  const commands = await db.refundExecutionCommand.findMany({
    where: { refundAttemptId: context.refundAttemptId },
    select: { id: true },
  });
  const commandIds = commands.map((command) => command.id);
  await db.refundExecutionEvidence.deleteMany({ where: { commandId: { in: commandIds } } });
  await db.refundExecutionCommand.deleteMany({ where: { id: { in: commandIds } } });
  await db.refundAttemptTransition.deleteMany({ where: { refundAttemptId: context.refundAttemptId } });
  await db.refundAttempt.deleteMany({ where: { id: context.refundAttemptId } });
  await db.order.deleteMany({ where: { id: context.orderId } });
  await db.payment.deleteMany({ where: { id: context.paymentId } });
  await db.checkoutSession.deleteMany({ where: { id: context.sessionId } });
  await db.user.deleteMany({ where: { id: context.userId } });
}
