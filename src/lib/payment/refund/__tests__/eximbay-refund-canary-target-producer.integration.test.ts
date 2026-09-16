import { deleteRetainedRefundTestHistory } from "./retained-refund-test-history";
import { randomUUID } from "node:crypto";
import {
  CheckoutSessionStatus,
  OrderStatus,
  PaymentAdapterExecutionKind,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentInitiationOutputKind,
  PaymentMode,
  PaymentProvider,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  ShippingCountry,
} from "@prisma/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { syntheticEximbayProviderOrderId } from "@/lib/payment/__tests__/eximbay-fixture";
import { loadEximbayCanaryCommittedContractDigests } from
  "../eximbay-refund-canary-committed-contracts";
import {
  EXIMBAY_CANARY_ATTENDED_ATTESTATION_VERSION,
  EXIMBAY_CANARY_EXACT_DATABASE_SECRET,
  EXIMBAY_CANARY_EXACT_DATABASE_SECRET_VERSION,
  EXIMBAY_CANARY_EXACT_CLOUD_SQL_CONDITION,
  EXIMBAY_CANARY_EXACT_IMAGE,
  EXIMBAY_CANARY_EXACT_JOB,
  EXIMBAY_CANARY_EXACT_MID,
  EXIMBAY_CANARY_EXACT_PROJECT,
  EXIMBAY_CANARY_EXACT_REGION,
  EXIMBAY_CANARY_EXACT_SECRET_RESOURCE,
  EXIMBAY_CANARY_EXACT_SECRET_VERSION,
  EXIMBAY_CANARY_EXACT_SERVICE_ACCOUNT,
  EXIMBAY_CANARY_RUNTIME_READBACK_VERSION,
  EXIMBAY_CANARY_TARGET_REASON,
  deriveEximbayCanaryRefundAttemptId,
  type EximbayCanaryRuntimeBindings,
} from "../eximbay-refund-canary-producer-contract";
import { claimRefundAttemptForEximbayCanarySystemExecution } from "../claim";
import { materializeEximbayRefundCanaryTarget } from
  "../eximbay-refund-canary-target-producer";
import { issueEximbayRefundCanaryApproval } from
  "../issue-eximbay-refund-canary-approval";
import { requestRefundAttemptInTransaction } from "../request";

type Fixture = Readonly<{
  userId: string;
  sessionId: string;
  paymentId: string;
  orderId: string;
  orderItemId: string;
  variantId: string;
  styleId: string;
}>;

type FixtureOptions = Readonly<{
  provider?: PaymentProvider;
  mode?: PaymentMode;
  status?: PaymentAttemptStatus;
  ageMs?: number;
  syntheticName?: string;
}>;

const fixtures: Fixture[] = [];
const installedAttestation = Object.freeze({
  formatVersion: EXIMBAY_CANARY_ATTENDED_ATTESTATION_VERSION,
  provider: "EXIMBAY" as const,
  mode: "SANDBOX" as const,
  mid: EXIMBAY_CANARY_EXACT_MID,
  secretResource: EXIMBAY_CANARY_EXACT_SECRET_RESOURCE,
  secretVersion: EXIMBAY_CANARY_EXACT_SECRET_VERSION,
  officialTestCredentialMaterialized: true as const,
  syntheticIdentityAttested: true as const,
  controlledNonCustomerContactAttested: true as const,
  noCustomerPiiAttested: true as const,
});
let contractDigests: Awaited<ReturnType<typeof loadEximbayCanaryCommittedContractDigests>>;

beforeAll(async () => {
  requireDisposableDatabaseUrl(process.env.DATABASE_URL);
  contractDigests = await loadEximbayCanaryCommittedContractDigests(process.cwd());
  await db.market.upsert({
    where: { code: "US" },
    update: {},
    create: {
      code: "US", currency: "USD", shippableCountries: [ShippingCountry.US],
      defaultLocale: "en", isActive: true,
    },
  });
});

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await cleanup(fixture);
});

describe("attended Eximbay canary target producer against disposable PostgreSQL", () => {
  it("materializes one exact SYSTEM/full target and later issues one dormant-runtime approval", async () => {
    const fixture = await createFixture();
    const target = await materialize(fixture);
    const aggregate = await db.payment.findUniqueOrThrow({
      where: { id: fixture.paymentId },
      include: { session: true, order: { include: { refundAttempts: {
        include: { executionCommand: true, providerOperationBinding: true, transitions: true },
      } } } },
    });
    const attempt = aggregate.order?.refundAttempts[0];
    expect(aggregate).toMatchObject({
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
      session: { status: CheckoutSessionStatus.COMPLETED },
      order: { status: OrderStatus.REFUND_PENDING },
    });
    expect(aggregate.order?.refundAttempts).toHaveLength(1);
    expect(attempt).toMatchObject({
      id: target.refundAttemptId,
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      amount: aggregate.amount,
      currency: "USD",
      status: RefundAttemptStatus.PROCESSING,
      executionCommand: {
        id: target.commandId,
        status: RefundExecutionCommandStatus.READY,
        dispatchAttempt: 0,
        leaseOwner: null,
        leaseUntil: null,
        leaseTokenHash: null,
      },
    });
    expect(attempt?.transitions).toHaveLength(2);
    expect(attempt?.providerOperationBinding).toMatchObject({
      id: target.providerOperationBindingId,
      merchantAccountBindingId: target.runtimeBindings.merchantAccountBindingId,
      credentialGenerationBindingId: target.runtimeBindings.credentialGenerationBindingId,
    });
    expect(await db.eximbayRefundSandboxCanaryApproval.count({
      where: { commandId: target.commandId },
    })).toBe(0);

    const approval = await issueEximbayRefundCanaryApproval(db, {
      paymentId: fixture.paymentId,
      attestation: installedAttestation,
      contractDigests,
      runtimeReadback: runtimeReadback(target.runtimeBindings),
      issuerPrincipalId: "operator@example.test",
    });
    const persisted = await db.eximbayRefundSandboxCanaryApproval.findUniqueOrThrow({
      where: { commandId: target.commandId },
    });
    expect(persisted).toMatchObject({
      id: approval.approvalId,
      targetBindingDigest: target.targetBindingDigest,
      approvalEvidenceDigest: approval.approvalEvidenceDigest,
      releaseBindingDigest: target.runtimeBindings.releaseBindingDigest,
      canaryJobBindingDigest: target.runtimeBindings.canaryJobBindingDigest,
      preflightJobBindingDigest: target.runtimeBindings.preflightJobBindingDigest,
      imageBindingDigest: target.runtimeBindings.imageBindingDigest,
      secretGenerationBindingDigest: target.runtimeBindings.secretGenerationBindingDigest,
      issuedByPrincipalId: "operator@example.test",
      consumedAt: null,
      consumedExecutionId: null,
      consumedExecutionBindingDigest: null,
    });
    expect(persisted.expiresAt.getTime() - persisted.approvedAt.getTime()).toBe(30 * 60_000);
  });

  it.each([
    ["non-EXIMBAY", { provider: PaymentProvider.TOSS }],
    ["non-SANDBOX", { mode: PaymentMode.LIVE }],
    ["nonterminal SALE", { status: PaymentAttemptStatus.INITIATED }],
    ["stale SALE", { ageMs: 31 * 60_000 }],
    ["nonsynthetic identity", { syntheticName: "Customer Name" }],
  ] satisfies ReadonlyArray<readonly [string, FixtureOptions]>) (
    "rejects %s before target mutation",
    async (_label, options) => {
      const fixture = await createFixture(options);
      await expect(materialize(fixture)).rejects.toThrow();
      expect(await db.refundAttempt.count({ where: { paymentId: fixture.paymentId } })).toBe(0);
      expect(await db.order.findUniqueOrThrow({ where: { id: fixture.orderId } }))
        .toMatchObject({ status: OrderStatus.PAID });
    },
  );

  it("rejects committed-contract drift before any target mutation", async () => {
    const fixture = await createFixture();
    await expect(materializeEximbayRefundCanaryTarget(db, {
      paymentId: fixture.paymentId,
      attestation: installedAttestation,
      contractDigests: { ...contractDigests, runtimeContractSha256: "0".repeat(64) },
    })).rejects.toThrow("COMMITTED_CONTRACT_DRIFT");
    expect(await db.refundAttempt.count({ where: { paymentId: fixture.paymentId } })).toBe(0);
    expect(await db.order.findUniqueOrThrow({ where: { id: fixture.orderId } }))
      .toMatchObject({ status: OrderStatus.PAID });
  });

  it.each([
    ["nonsynthetic", { syntheticName: "Customer Name" }],
    ["stale", { ageMs: 31 * 60_000 }],
  ] satisfies ReadonlyArray<readonly [string, FixtureOptions]>) (
    "does not claim an exact-looking %s SYSTEM/full attempt",
    async (_label, options) => {
      const fixture = await createFixture(options);
      const refundAttemptId = deriveEximbayCanaryRefundAttemptId(fixture.paymentId);
      const requestedAt = await databaseTime();
      const requested = await db.$transaction((tx) => requestRefundAttemptInTransaction(tx, {
        refundAttemptId,
        orderId: fixture.orderId,
        lines: [{ orderItemId: fixture.orderItemId, quantity: 1 }],
        amount: 1_234,
        reason: EXIMBAY_CANARY_TARGET_REASON,
        actorType: RefundAttemptActorType.SYSTEM,
        actorUserId: null,
        now: requestedAt,
      }, { allowEximbaySandboxCustomerApproval: true }));
      expect(requested.ok).toBe(true);
      const claimed = await claimRefundAttemptForEximbayCanarySystemExecution(db, {
        orderId: fixture.orderId,
        refundAttemptId,
        now: requestedAt,
        attestation: installedAttestation,
      });
      expect(claimed).toMatchObject({ ok: false, code: "CLAIM_CAPABILITY_UNSUPPORTED" });
      expect(await db.refundAttempt.findUniqueOrThrow({ where: { id: refundAttemptId } }))
        .toMatchObject({ status: RefundAttemptStatus.REQUESTED });
      expect(await db.refundExecutionCommand.count({ where: { refundAttemptId } })).toBe(0);
    },
  );

  it("rejects a preexisting partial ADMIN refund and wrong actor provenance", async () => {
    const fixture = await createFixture();
    const requested = await db.$transaction((tx) => requestRefundAttemptInTransaction(tx, {
      refundAttemptId: `prior-${randomUUID()}`,
      orderId: fixture.orderId,
      lines: [{ orderItemId: fixture.orderItemId, quantity: 1 }],
      amount: 1234,
      reason: "Prior partial refund",
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: "admin-operator",
      now: new Date(),
    }, { allowEximbaySandboxCustomerApproval: true }));
    expect(requested.ok).toBe(true);
    await expect(materialize(fixture)).rejects.toThrow("REFUND_CONTAMINATION");
    expect(await db.refundAttempt.count({ where: { paymentId: fixture.paymentId } })).toBe(1);
  });

  it("rejects duplicate materialization and duplicate approval without replacement", async () => {
    const fixture = await createFixture();
    const target = await materialize(fixture);
    await expect(materialize(fixture)).rejects.toThrow("TARGET_ALREADY_MATERIALIZED");
    const input = {
      paymentId: fixture.paymentId,
      attestation: installedAttestation,
      contractDigests,
      runtimeReadback: runtimeReadback(target.runtimeBindings),
      issuerPrincipalId: "operator@example.test",
    };
    await issueEximbayRefundCanaryApproval(db, input);
    await expect(issueEximbayRefundCanaryApproval(db, input))
      .rejects.toThrow("APPROVAL_ALREADY_EXISTS");
    expect(await db.eximbayRefundSandboxCanaryApproval.count({
      where: { commandId: target.commandId },
    })).toBe(1);
  });

  it("rejects changed target state and wrong runtime authority before approval insertion", async () => {
    const changed = await createFixture();
    const changedTarget = await materialize(changed);
    await db.refundExecutionCommand.update({
      where: { id: changedTarget.commandId }, data: { dispatchAttempt: 1 },
    });
    await expect(issueEximbayRefundCanaryApproval(db, {
      paymentId: changed.paymentId,
      attestation: installedAttestation,
      contractDigests,
      runtimeReadback: runtimeReadback(changedTarget.runtimeBindings),
      issuerPrincipalId: "operator@example.test",
    })).rejects.toThrow("TARGET_POSTCONDITION_FAILED");

    const wrongRuntime = await createFixture();
    const exactTarget = await materialize(wrongRuntime);
    const readback = runtimeReadback(exactTarget.runtimeBindings);
    readback.authority.releaseBindingDigest = "0".repeat(64);
    await expect(issueEximbayRefundCanaryApproval(db, {
      paymentId: wrongRuntime.paymentId,
      attestation: installedAttestation,
      contractDigests,
      runtimeReadback: readback,
      issuerPrincipalId: "operator@example.test",
    })).rejects.toThrow("RUNTIME_READBACK_INVALID");
    expect(await db.eximbayRefundSandboxCanaryApproval.count({
      where: { commandId: exactTarget.commandId },
    })).toBe(0);
  });

  it("rolls back the target request transaction when creation-transition persistence fails", async () => {
    const fixture = await createFixture();
    const attemptId = targetAttemptId(fixture.paymentId);
    await withRejectingInsertTrigger("RefundAttemptTransition", "refundAttemptId", attemptId, async () => {
      await expect(materialize(fixture)).rejects.toThrow();
    });
    expect(await db.refundAttempt.count({ where: { paymentId: fixture.paymentId } })).toBe(0);
    expect(await db.order.findUniqueOrThrow({ where: { id: fixture.orderId } }))
      .toMatchObject({ status: OrderStatus.PAID });
  });

  it("preserves committed request/claim boundaries when the sealer transaction rolls back", async () => {
    const fixture = await createFixture();
    const attemptId = targetAttemptId(fixture.paymentId);
    await withRejectingInsertTrigger(
      "RefundExecutionProviderOperationBinding", "refundAttemptId", attemptId,
      async () => { await expect(materialize(fixture)).rejects.toThrow("TARGET_SEAL_FAILED"); },
    );
    const attempt = await db.refundAttempt.findUniqueOrThrow({
      where: { id: attemptId }, include: { executionCommand: true, providerOperationBinding: true },
    });
    expect(attempt).toMatchObject({
      status: RefundAttemptStatus.PROCESSING,
      executionCommand: { status: RefundExecutionCommandStatus.READY },
      providerOperationBinding: null,
    });
  });

  it("rolls back approval insertion failure while preserving the sealed target", async () => {
    const fixture = await createFixture();
    const target = await materialize(fixture);
    await withRejectingInsertTrigger(
      "EximbayRefundSandboxCanaryApproval", "commandId", target.commandId,
      async () => {
        await expect(issueEximbayRefundCanaryApproval(db, {
          paymentId: fixture.paymentId,
          attestation: installedAttestation,
          contractDigests,
          runtimeReadback: runtimeReadback(target.runtimeBindings),
          issuerPrincipalId: "operator@example.test",
        })).rejects.toThrow("APPROVAL_INSERT_FAILED");
      },
    );
    expect(await db.eximbayRefundSandboxCanaryApproval.count({
      where: { commandId: target.commandId },
    })).toBe(0);
    expect(await db.refundExecutionProviderOperationBinding.count({
      where: { refundAttemptId: target.refundAttemptId },
    })).toBe(1);
  });
});

async function materialize(fixture: Fixture) {
  return materializeEximbayRefundCanaryTarget(db, {
    paymentId: fixture.paymentId,
    attestation: installedAttestation,
    contractDigests,
  });
}

async function createFixture(options: FixtureOptions = {}): Promise<Fixture> {
  const identity = randomUUID();
  const now = await databaseTime();
  const occurredAt = new Date(now.getTime() - (options.ageMs ?? 60_000));
  const paymentData = paymentFixtureData(options, identity, occurredAt);
  const userId = `canary-user-${identity}`;
  const paymentId = `canary-payment-${identity}`;
  const sessionId = `canary-session-${identity}`;
  const orderId = `canary-order-${identity}`;
  const styleId = `style-${identity}`;
  const variantId = `variant-${identity}`;
  const orderItemId = `item-${identity}`;
  const fixture = Object.freeze({ userId, paymentId, sessionId, orderId, orderItemId, variantId, styleId });
  await db.wigStyle.create({ data: { id: styleId, name: "Synthetic", category: "FASHION", tags: [], imageKeys: [] } });
  await db.wigVariant.create({ data: { id: variantId, wigStyleId: styleId, color: "black", length: "short", curl: "straight", price: 1234, sku: identity, fulfillmentType: "STOCKED" } });
  fixtures.push(fixture);
  await db.user.create({
    data: {
      id: userId,
      email: `mira-eximbay-canary+${identity}@example.test`,
      name: options.syntheticName ?? "Mira Eximbay Canary",
    },
  });
  await db.checkoutSession.create({
    data: {
      id: sessionId,
      userId,
      marketCode: "US",
      communicationLocale: "en",
      currency: "USD",
      status: CheckoutSessionStatus.COMPLETED,
      subtotalAmount: 1_234,
      shippingAmount: 0,
      totalAmount: 1_234,
      expiresAt: new Date(now.getTime() + 30 * 60_000),
      submittedAt: occurredAt,
      completedAt: occurredAt,
      shipping: { create: syntheticShipping() },
    },
  });
  await db.payment.create({
    data: {
      id: paymentId,
      checkoutSessionId: sessionId,
      ...paymentData,
      amount: 1_234,
      currency: "USD",
      idempotencyKey: `synthetic-payment-idempotency-${identity}`,
    },
  });
  await db.order.create({
    data: {
      id: orderId,
      checkoutSessionId: sessionId,
      paymentId,
      userId,
      marketCode: "US",
      currency: "USD",
      subtotalAmount: 1_234,
      shippingAmount: 0,
      totalAmount: 1_234,
      status: OrderStatus.PAID,
      paidAt: occurredAt,
      shipping: { create: syntheticShipping() },
    },
  });
  await db.checkoutSessionLine.create({ data: { sessionId, variantId, wigStyleId: styleId, quantity: 1,
    unitAmount: 1234, fulfillmentType: "STOCKED", snapshotData: {} } });
  await db.orderItem.create({ data: { id: orderItemId, orderId, variantId, wigStyleId: styleId, quantity: 1,
    unitAmount: 1234, fulfillmentType: "STOCKED", snapshotData: {} } });
  return fixture;
}

function paymentFixtureData(options: FixtureOptions, identity: string, occurredAt: Date) {
  const provider = options.provider ?? PaymentProvider.EXIMBAY;
  return {
    provider,
    mode: options.mode ?? PaymentMode.SANDBOX,
    adapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL,
    routingRuleId: "cfa.us.card.usd",
    status: options.status ?? PaymentAttemptStatus.SUCCEEDED,
    ...providerIdentity(provider),
    ...lifecycleEvidence(options.status, identity, occurredAt),
    contactIntentAt: occurredAt,
  };
}

function providerIdentity(provider: PaymentProvider) {
  return { providerOrderId: provider === PaymentProvider.EXIMBAY
    ? syntheticEximbayProviderOrderId()
    : null };
}

function lifecycleEvidence(
  status: PaymentAttemptStatus | undefined,
  identity: string,
  occurredAt: Date,
) {
  if (status === PaymentAttemptStatus.INITIATED) {
    return {
      attemptLifecycle: PaymentAttemptLifecycle.CONTACT_AUTHORIZED,
      providerPaymentKey: null,
      contactStartedAt: null,
      initiationOutputKind: null,
      initiationCompletedAt: null,
      financialSucceededAt: null,
      blockingEndedAt: null,
    };
  }
  return {
    attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
    providerPaymentKey: `synthetic-payment-key-${identity}`,
    contactStartedAt: occurredAt,
    initiationOutputKind: PaymentInitiationOutputKind.READY,
    initiationCompletedAt: occurredAt,
    financialSucceededAt: occurredAt,
    blockingEndedAt: occurredAt,
  };
}

function syntheticShipping() {
  return {
    recipientName: "Mira Eximbay Canary",
    phone: "+1-202-555-0100",
    country: ShippingCountry.US,
    postalCode: "10001",
    administrativeArea: "NY",
    city: "Synthetic City",
    addressLine1: "1 Synthetic Avenue",
    addressLine2: null,
    memo: null,
  };
}

function runtimeReadback(bindings: EximbayCanaryRuntimeBindings) {
  return {
    formatVersion: EXIMBAY_CANARY_RUNTIME_READBACK_VERSION,
    projectId: EXIMBAY_CANARY_EXACT_PROJECT,
    region: EXIMBAY_CANARY_EXACT_REGION,
    jobName: EXIMBAY_CANARY_EXACT_JOB,
    jobUid: "synthetic-job-uid",
    jobGeneration: "1",
    serviceAccountEmail: EXIMBAY_CANARY_EXACT_SERVICE_ACCOUNT,
    imageDigestUri: EXIMBAY_CANARY_EXACT_IMAGE,
    arguments: ["eximbay-canary-once"],
    taskCount: 1,
    parallelism: 1,
    maxRetries: 0,
    taskTimeoutSeconds: 150,
    automaticTrigger: false,
    executionCount: 0,
    resourceCount: 5,
    cloudSqlClientCondition: EXIMBAY_CANARY_EXACT_CLOUD_SQL_CONDITION,
    databaseSecretAccessor: true,
    providerSecretAccessor: true,
    invokerBindingCount: 0,
    schedulerTargetCount: 0,
    providerContactAuthorized: false,
    databaseSecretId: EXIMBAY_CANARY_EXACT_DATABASE_SECRET,
    databaseSecretVersion: EXIMBAY_CANARY_EXACT_DATABASE_SECRET_VERSION,
    providerSecretResource: EXIMBAY_CANARY_EXACT_SECRET_RESOURCE,
    providerSecretVersion: EXIMBAY_CANARY_EXACT_SECRET_VERSION,
    mid: EXIMBAY_CANARY_EXACT_MID,
    authority: { ...bindings },
  };
}

function targetAttemptId(paymentId: string): string {
  return deriveEximbayCanaryRefundAttemptId(paymentId);
}

async function withRejectingInsertTrigger(
  table: string,
  column: string,
  value: string,
  operation: () => Promise<void>,
): Promise<void> {
  const suffix = randomUUID().replaceAll("-", "");
  const functionName = `reject_canary_insert_${suffix}`;
  const triggerName = `reject_canary_insert_${suffix}`;
  await db.$executeRawUnsafe(`
    CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW."${column}" = '${value}' THEN RAISE EXCEPTION 'SYNTHETIC_INSERT_FAILURE'; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "${table}"
      FOR EACH ROW EXECUTE FUNCTION "${functionName}"();
  `);
  try {
    await operation();
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "${table}"`);
    await db.$executeRawUnsafe(`DROP FUNCTION "${functionName}"()`);
  }
}

async function databaseTime(): Promise<Date> {
  const rows = await db.$queryRaw<{ capturedAt: Date }[]>`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `;
  const value = rows[0]?.capturedAt;
  if (!(value instanceof Date)) throw new Error("DATABASE_TIME_UNAVAILABLE");
  return value;
}

async function cleanup(fixture: Fixture): Promise<void> {
  const attempts = await db.refundAttempt.findMany({
    where: { paymentId: fixture.paymentId }, select: { id: true, executionCommand: { select: { id: true } } },
  });
  const attemptIds = attempts.map((attempt) => attempt.id);
  const commandIds = attempts.flatMap((attempt) => attempt.executionCommand?.id ?? []);
  await deleteRetainedRefundTestHistory(commandIds);
  await db.refundAttemptLineEconomicAllocation.deleteMany({ where: { refundAttemptId: { in: attemptIds } } });
  await db.refundAttemptLine.deleteMany({ where: { refundAttemptId: { in: attemptIds } } });
  await db.eximbayRefundSandboxCanaryApproval.deleteMany({ where: { commandId: { in: commandIds } } });
  await db.refundExecutionProviderOperationBinding.deleteMany({
    where: { refundAttemptId: { in: attemptIds } },
  });
  await db.refundExecutionCommand.deleteMany({ where: { id: { in: commandIds } } });
  await db.refundAttemptTransition.deleteMany({ where: { refundAttemptId: { in: attemptIds } } });
  await db.customerRefundIntake.deleteMany({ where: { orderId: fixture.orderId } });
  await db.refundAttempt.deleteMany({ where: { id: { in: attemptIds } } });
  await db.orderShipping.deleteMany({ where: { orderId: fixture.orderId } });
  await db.orderItem.deleteMany({ where: { orderId: fixture.orderId } });
  await db.order.deleteMany({ where: { id: fixture.orderId } });
  await db.payment.deleteMany({ where: { id: fixture.paymentId } });
  await db.checkoutSessionShipping.deleteMany({ where: { sessionId: fixture.sessionId } });
  await db.checkoutSessionLine.deleteMany({ where: { sessionId: fixture.sessionId } });
  await db.checkoutSession.deleteMany({ where: { id: fixture.sessionId } });
  await db.user.deleteMany({ where: { id: fixture.userId } });
  await db.wigVariant.delete({ where: { id: fixture.variantId } });
  await db.wigStyle.delete({ where: { id: fixture.styleId } });
}

function requireDisposableDatabaseUrl(value: string | undefined): void {
  if (!value) throw new Error("DATABASE_URL_REQUIRED");
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)
    || decodeURIComponent(url.pathname) !== "/wig_platform_test") {
    throw new Error("DISPOSABLE_DATABASE_REQUIRED");
  }
}
