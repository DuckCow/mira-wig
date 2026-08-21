import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import {
  CheckoutSessionStatus,
  OrderStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  ShippingCountry,
} from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { deriveTossRefundOperationKey } from "../refund-operation-key";

const MARKET_CODE = "KR";
const NOW = new Date("2026-07-17T04:20:00.123Z");
const MIGRATION_NAME = "20260717100000_e3b1a_toss_refund_binding_contracts";
const MIGRATION_PATH = join(process.cwd(), "prisma/migrations", MIGRATION_NAME, "migration.sql");

interface TestContext {
  userId: string;
  orderId: string;
  paymentId: string;
  sessionId: string;
  refundAttemptId: string;
}

describe("E3B1A Toss refund binding schema", () => {
  let context: TestContext;

  beforeAll(async () => {
    const rows = await db.$queryRaw<{ databaseName: string }[]>`
      SELECT current_database() AS "databaseName"
    `;
    if (rows.length !== 1 || rows[0].databaseName !== "wig_platform_test") {
      throw new Error("E3B1A schema tests require independently isolated wig_platform_test.");
    }
  });

  beforeEach(async () => {
    context = await createFixture();
  });

  afterEach(async () => {
    await cleanup(context);
  });

  it("installs the pristine migration without fabricating rows", async () => {
    const migrations = await db.$queryRaw<{ applied: number }[]>(Prisma.sql`
      SELECT count(*)::int AS applied
      FROM "_prisma_migrations"
      WHERE migration_name = ${MIGRATION_NAME}
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    `);
    const [bindings, proofs] = await Promise.all([
      db.refundExecutionProviderOperationBinding.count(),
      db.refundExecutionProviderEligibilityProof.count(),
    ]);
    const migration = readFileSync(MIGRATION_PATH, "utf8");

    expect(migrations.length === 1 && migrations[0].applied === 1).toBe(true);
    expect(bindings === 0 && proofs === 0).toBe(true);
    expect(/(?:INSERT\s+INTO|UPDATE)\s+"RefundExecutionProvider/i.test(migration)).toBe(false);
  });

  it("exposes one binding and one proof through both Prisma relation directions", async () => {
    const binding = await db.refundExecutionProviderOperationBinding.create({
      data: bindingData(context.refundAttemptId),
      include: { refundAttempt: true },
    });
    const proof = await db.refundExecutionProviderEligibilityProof.create({
      data: proofData(binding.id),
      include: { binding: true },
    });
    const attempt = await db.refundAttempt.findUniqueOrThrow({
      where: { id: context.refundAttemptId },
      include: { providerOperationBinding: { include: { eligibilityProof: true } } },
    });

    expect(binding.refundAttempt.id === context.refundAttemptId).toBe(true);
    expect(proof.binding.id === binding.id).toBe(true);
    expect(attempt.providerOperationBinding?.eligibilityProof?.id === proof.id).toBe(true);
  });

  it.each([
    ["provider", { provider: PaymentProvider.MOCK }, "RefundProviderBinding_"],
    ["mode", { mode: PaymentMode.LIVE }, "RefundProviderBinding_mode_sandbox_check"],
    ["operation family", { providerOperationFamilyKey: "refund:local:key" }, "RefundProviderBinding_operation_key_format_check"],
    ["uppercase operation family", { providerOperationFamilyKey: `toss-refund-v1-${"A".repeat(64)}` }, "RefundProviderBinding_operation_key_format_check"],
    ["algorithm", { operationFamilyKeyAlgorithmVersion: "toss-refund-v2" }, "RefundProviderBinding_algorithm_version_check"],
    ["wire version", { wireContractVersion: "refund-provider-toss-wire/v2" }, "RefundProviderBinding_wire_version_check"],
    ["family fingerprint", { operationFamilyFingerprint: "A".repeat(64) }, "RefundProviderBinding_wire_fingerprint_check"],
    ["merchant grammar", { merchantAccountBindingId: "merchant:invalid" }, "RefundProviderBinding_merchant_label_check"],
    ["generation grammar", { credentialGenerationBindingId: "generation invalid" }, "RefundProviderBinding_generation_label_check"],
    ["merchant length", { merchantAccountBindingId: "m".repeat(65) }, "value too long"],
    ["generation length", { credentialGenerationBindingId: "g".repeat(65) }, "value too long"],
  ])("rejects an invalid binding $label", async (_label, override, failure) => {
    await expectDatabaseFailure(
      db.refundExecutionProviderOperationBinding.create({
        data: bindingData(context.refundAttemptId, override),
      }),
      failure,
    );
  });

  it("enforces one binding per attempt and globally unique provider operation keys", async () => {
    const first = await db.refundExecutionProviderOperationBinding.create({
      data: bindingData(context.refundAttemptId),
    });
    await expectPrismaCode(
      db.refundExecutionProviderOperationBinding.create({
        data: bindingData(context.refundAttemptId, {
          providerOperationFamilyKey: operationKey("duplicate"),
        }),
      }),
      "P2002",
    );
    const secondAttemptId = await createSecondAttempt(context);
    await expectPrismaCode(
      db.refundExecutionProviderOperationBinding.create({
        data: bindingData(secondAttemptId, {
          providerOperationFamilyKey: first.providerOperationFamilyKey,
        }),
      }),
      "P2002",
    );
  });

  it("permits equal binding labels and restricts RefundAttempt deletion", async () => {
    await db.refundExecutionProviderOperationBinding.create({
      data: bindingData(context.refundAttemptId, {
        merchantAccountBindingId: "same_label",
        credentialGenerationBindingId: "same_label",
      }),
    });

    await expectDatabaseFailure(
      db.refundAttempt.delete({ where: { id: context.refundAttemptId } }),
      "RefundProviderBinding_refundAttempt_fkey",
    );
  });

  it.each([
    ["blank payment key", { paymentKey: "   " }, "RefundEligibilityProof_payment_key_check"],
    ["control payment key", { paymentKey: "key\nvalue" }, "RefundEligibilityProof_payment_key_check"],
    ["oversize payment key", { paymentKey: "가".repeat(201) }, "value too long"],
    ["method", { method: "CARD" }, "RefundEligibilityProof_method_check"],
    ["easy pay", { easyPayPresent: true }, "RefundEligibilityProof_easy_pay_check"],
    ["currency", { currency: "USD" }, "RefundEligibilityProof_currency_check"],
    ["status", { providerStatus: "CANCELED" }, "RefundEligibilityProof_status_check"],
    ["total zero", { totalAmount: 0 }, "RefundEligibilityProof_total_positive_check"],
    ["balance zero", { balanceAmount: 0 }, "RefundEligibilityProof_balance_positive_check"],
    ["tax free", { taxFreeAmount: 1 }, "RefundEligibilityProof_tax_free_zero_check"],
    ["tax exempt", { taxExemptionAmount: 1 }, "RefundEligibilityProof_tax_exempt_zero_check"],
    ["cancels", { cancelsCount: 1 }, "RefundEligibilityProof_cancels_zero_check"],
    ["fingerprint", { eligibilityFingerprint: "A".repeat(64) }, "RefundEligibilityProof_fingerprint_check"],
  ])("rejects an invalid eligibility proof $label", async (_label, override, failure) => {
    const binding = await db.refundExecutionProviderOperationBinding.create({
      data: bindingData(context.refundAttemptId),
    });
    await expectDatabaseFailure(
      db.refundExecutionProviderEligibilityProof.create({ data: proofData(binding.id, override) }),
      failure,
    );
  });

  it("accepts payment-key and integer maxima with millisecond timestamp precision", async () => {
    const binding = await db.refundExecutionProviderOperationBinding.create({
      data: bindingData(context.refundAttemptId),
    });
    const proof = await db.refundExecutionProviderEligibilityProof.create({
      data: proofData(binding.id, {
        paymentKey: "가".repeat(200),
        totalAmount: 2_147_483_647,
        balanceAmount: 2_147_483_647,
      }),
    });

    expect(Array.from(proof.paymentKey).length).toBe(200);
    expect(proof.totalAmount === 2_147_483_647 && proof.balanceAmount === 2_147_483_647)
      .toBe(true);
    expect(proof.localReceivedAt.getTime() === NOW.getTime()).toBe(true);
  });

  it("enforces one proof per binding and restricts binding deletion", async () => {
    const binding = await db.refundExecutionProviderOperationBinding.create({
      data: bindingData(context.refundAttemptId),
    });
    await db.refundExecutionProviderEligibilityProof.create({ data: proofData(binding.id) });

    await expectPrismaCode(
      db.refundExecutionProviderEligibilityProof.create({
        data: proofData(binding.id, { paymentKey: "synthetic-second-key" }),
      }),
      "P2002",
    );
    await expectDatabaseFailure(
      db.refundExecutionProviderOperationBinding.delete({ where: { id: binding.id } }),
      "RefundEligibilityProof_binding_fkey",
    );
  });

  it("allows a pristine or MOCK-only dispatch history through migration preflight", async () => {
    await expect(runMigrationPreflight()).resolves.toBeUndefined();
    const command = await db.refundExecutionCommand.create({ data: commandData(context.refundAttemptId) });
    await db.refundExecutionDispatchAttempt.create({
      data: dispatchData(command.id, PaymentProvider.MOCK),
    });

    await expect(runMigrationPreflight()).resolves.toBeUndefined();
  });

  it("blocks migration preflight when any historical Toss dispatch exists", async () => {
    const command = await db.refundExecutionCommand.create({ data: commandData(context.refundAttemptId) });
    await db.refundExecutionDispatchAttempt.create({
      data: dispatchData(command.id, PaymentProvider.TOSS),
    });

    await expectDatabaseFailure(
      runMigrationPreflight(),
      "Toss refund binding migration requires zero Toss dispatch rows.",
    );
  });
});

function bindingData(
  refundAttemptId: string,
  override: Partial<Prisma.RefundExecutionProviderOperationBindingUncheckedCreateInput> = {},
): Prisma.RefundExecutionProviderOperationBindingUncheckedCreateInput {
  return {
    refundAttemptId,
    provider: PaymentProvider.TOSS,
    mode: PaymentMode.SANDBOX,
    providerOperationFamilyKey: operationKey(refundAttemptId),
    operationFamilyKeyAlgorithmVersion: "toss-refund-v1",
    wireContractVersion: "refund-provider-toss-wire/v1",
    operationFamilyFingerprint: "a".repeat(64),
    merchantAccountBindingId: "merchant_sandbox_1",
    credentialGenerationBindingId: "credential_generation_1",
    ...override,
  };
}

function proofData(
  bindingId: string,
  override: Partial<Prisma.RefundExecutionProviderEligibilityProofUncheckedCreateInput> = {},
): Prisma.RefundExecutionProviderEligibilityProofUncheckedCreateInput {
  return {
    bindingId,
    paymentKey: "synthetic-payment-key",
    method: "카드",
    easyPayPresent: false,
    currency: "KRW",
    providerStatus: "DONE",
    totalAmount: 85_000,
    balanceAmount: 85_000,
    taxFreeAmount: 0,
    taxExemptionAmount: 0,
    cancelsCount: 0,
    localReceivedAt: NOW,
    eligibilityFingerprint: "b".repeat(64),
    ...override,
  };
}

function operationKey(seed: string): string {
  return deriveTossRefundOperationKey(`refund:synthetic:${seed}`);
}

function commandData(refundAttemptId: string): Prisma.RefundExecutionCommandUncheckedCreateInput {
  return { refundAttemptId, status: RefundExecutionCommandStatus.READY, availableAt: NOW };
}

function dispatchData(
  commandId: string,
  provider: PaymentProvider,
): Prisma.RefundExecutionDispatchAttemptUncheckedCreateInput {
  return {
    commandId,
    ordinal: 1,
    leaseGeneration: 1,
    provider,
    mode: PaymentMode.SANDBOX,
    providerOperationKey: "synthetic-operation-key",
    requestFingerprint: "c".repeat(64),
    state: RefundExecutionDispatchAttemptState.AUTHORIZED,
    authorizedAt: NOW,
  };
}

async function runMigrationPreflight(): Promise<void> {
  const migration = readFileSync(MIGRATION_PATH, "utf8");
  const preflight = migration.match(/DO \$\$[\s\S]*?\$\$;/)?.[0];
  if (!preflight) throw new Error("E3B1A migration preflight block was not found.");
  await db.$executeRawUnsafe(preflight);
}

async function expectDatabaseFailure(promise: Promise<unknown>, marker: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(databaseErrorDetails(error).includes(marker)).toBe(true);
    return;
  }
  throw new Error("Expected E3B1A database constraint to reject the test write.");
}

async function expectPrismaCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error instanceof Prisma.PrismaClientKnownRequestError && error.code === code).toBe(true);
    return;
  }
  throw new Error("Expected E3B1A database uniqueness constraint to reject the test write.");
}

function databaseErrorDetails(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `${error.message}\n${JSON.stringify(error.meta)}`;
  }
  return error.message;
}

async function createFixture(): Promise<TestContext> {
  const identity = randomUUID();
  await ensureMarket();
  const userId = `e3b1a_${identity}`;
  await db.user.create({ data: { id: userId, email: `${userId}@example.test` } });
  const session = await db.checkoutSession.create({
    data: {
      userId,
      marketCode: MARKET_CODE,
      currency: "KRW",
      status: CheckoutSessionStatus.COMPLETED,
      subtotalAmount: 85_000,
      shippingAmount: 0,
      totalAmount: 85_000,
      expiresAt: new Date(NOW.getTime() + 30 * 60_000),
      completedAt: NOW,
    },
  });
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: session.id,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
      amount: 85_000,
      currency: "KRW",
      providerPaymentKey: `synthetic_payment_${identity}`,
      financialSucceededAt: NOW,
      blockingEndedAt: NOW,
      idempotencyKey: `synthetic_payment_idem_${identity}`,
    },
  });
  const order = await db.order.create({
    data: {
      checkoutSessionId: session.id,
      paymentId: payment.id,
      userId,
      marketCode: MARKET_CODE,
      currency: "KRW",
      subtotalAmount: 85_000,
      shippingAmount: 0,
      totalAmount: 85_000,
      status: OrderStatus.REFUND_PENDING,
      paidAt: NOW,
    },
  });
  const attempt = await createAttempt(order.id, payment.id, identity);
  return {
    userId,
    orderId: order.id,
    paymentId: payment.id,
    sessionId: session.id,
    refundAttemptId: attempt.id,
  };
}

async function createSecondAttempt(context: TestContext): Promise<string> {
  const identity = randomUUID();
  const attempt = await createAttempt(context.orderId, context.paymentId, identity);
  return attempt.id;
}

async function createAttempt(orderId: string, paymentId: string, identity: string) {
  return db.refundAttempt.create({
    data: {
      orderId,
      paymentId,
      amount: 85_000,
      currency: "KRW",
      status: RefundAttemptStatus.PROCESSING,
      reason: "E3B1A schema fixture",
      actorType: RefundAttemptActorType.SYSTEM,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      idempotencyKey: `refund:${paymentId}:${identity}`,
      requestedAt: NOW,
    },
  });
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
  const attempts = await db.refundAttempt.findMany({
    where: { orderId: context.orderId },
    select: { id: true, executionCommand: { select: { id: true } } },
  });
  const attemptIds = attempts.map((attempt) => attempt.id);
  const commandIds = attempts.flatMap((attempt) => (
    attempt.executionCommand ? [attempt.executionCommand.id] : []
  ));
  const bindings = await db.refundExecutionProviderOperationBinding.findMany({
    where: { refundAttemptId: { in: attemptIds } },
    select: { id: true },
  });
  const bindingIds = bindings.map((binding) => binding.id);
  await db.refundExecutionProviderContactEligibilityProof.deleteMany({
    where: { dispatchAttempt: { commandId: { in: commandIds } } },
  });
  await db.refundExecutionProviderEligibilityProof.deleteMany({
    where: { bindingId: { in: bindingIds } },
  });
  await db.refundExecutionProviderOperationBinding.deleteMany({ where: { id: { in: bindingIds } } });
  await db.refundExecutionDispatchAttempt.deleteMany({ where: { commandId: { in: commandIds } } });
  await db.refundExecutionCommandEvent.deleteMany({ where: { commandId: { in: commandIds } } });
  await db.refundExecutionEvidence.deleteMany({ where: { commandId: { in: commandIds } } });
  await db.refundExecutionCommand.deleteMany({ where: { id: { in: commandIds } } });
  await db.refundAttemptTransition.deleteMany({ where: { refundAttemptId: { in: attemptIds } } });
  await db.refundAttempt.deleteMany({ where: { id: { in: attemptIds } } });
  await db.order.deleteMany({ where: { id: context.orderId } });
  await db.payment.deleteMany({ where: { id: context.paymentId } });
  await db.checkoutSession.deleteMany({ where: { id: context.sessionId } });
  await db.user.deleteMany({ where: { id: context.userId } });
}
