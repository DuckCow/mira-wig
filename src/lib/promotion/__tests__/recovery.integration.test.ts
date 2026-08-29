import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  CheckoutSessionStatus,
  CustomerRefundIntakeReasonCode,
  CustomerRefundIntakeStatus,
  FulfillmentType,
  OrderStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  PrismaClient,
  PromotionKind,
  PromotionPolicyStatus,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildRefundExecutionApplyOperationKey } from "@/lib/payment/refund/execution-result-contract";
import { EXECUTION_SUCCEEDED_TRANSITION_REASON } from "@/lib/payment/refund/execution-result-plan";
import { initiatePaymentAttempt } from "@/lib/payment/attempt/initiate";
import { completeFromCapture } from "@/lib/payment/complete";
import { PaymentMethod } from "@/lib/payment/providers/routing";
import { cancelEligibleMtoOrder } from "@/lib/order-cancellation/cancel";
import { replaceOutstandingCancellationRefund } from "@/lib/order-cancellation/replacement";
import {
  approveCustomerRefundIntake,
  CustomerIntakeReviewInvariantError,
} from "@/lib/payment/refund/customer-intake-review";
import {
  ensurePromotionRecoveryForOrder,
  readPromotionRecoverySnapshot,
} from "../recovery";
import {
  attemptPromotionRecoveryAfterRefundCommand,
  claimPromotionRecoveryReconciliationBatch,
  PROMOTION_RECOVERY_RECONCILIATION_SCOPE_KEY,
  reconcilePromotionRecoveries,
} from "../recovery-reentry";
import { priceSelectedPromotion } from "../redemption";

const ISSUANCE_ENABLED = Object.freeze({ PROMOTION_RECOVERY_ISSUANCE_ENABLED: "ENABLED" });
const RECONCILIATION_ENABLED = Object.freeze({
  PROMOTION_RECOVERY_ISSUANCE_ENABLED: "ENABLED",
  PROMOTION_RECOVERY_RECONCILIATION_ENABLED: "ENABLED",
});
const DAY_MS = 86_400_000;

interface OrderFixture {
  readonly orderId: string;
  readonly checkoutSessionId: string;
  readonly userId: string;
  readonly paymentId: string;
  readonly orderItemId: string;
  readonly sourceGrantId: string | null;
  readonly policyVersionId: string | null;
}

interface RecoveredFirstOrderFixture {
  readonly firstOrder: OrderFixture;
  readonly recoveredGrantId: string;
  readonly recoveredPolicyVersionId: string;
  readonly recoveredExpiresAt: Date;
  readonly redemptionAt: Date;
  readonly historicalClaimBefore: Readonly<{ firstOrderPromotionClaimedAt: Date | null }>;
}

interface OrderFixtureOptions {
  readonly orderId?: string;
  readonly promotion?: boolean;
  readonly kind?: PromotionKind;
  readonly lineDiscountAmount?: number;
  readonly cancellable?: boolean;
  readonly existingPromotion?: PromotionIdentity;
  readonly policyStatus?: PromotionPolicyStatus;
  readonly recoveryGraceDays?: number | null;
  readonly sourceExpiresAfterDays?: number | null;
}

interface PromotionIdentity {
  readonly userId: string;
  readonly policyVersionId: string;
  readonly grantId: string;
}

interface PromotionFixtureOptions {
  readonly policyStatus?: PromotionPolicyStatus;
  readonly recoveryGraceDays?: number | null;
  readonly sourceExpiresAfterDays?: number | null;
}

describe("promotion recovery entitlement", () => {
  let admin: Client;
  let client: PrismaClient;
  let schema: string;

  beforeAll(async () => {
    const connectionString = disposableDatabaseUrl();
    schema = `promo_recovery_${randomUUID().replaceAll("-", "")}`;
    admin = new Client({ connectionString });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`SET search_path TO "${schema}"`);
    await applyRepositoryMigrations(admin);
    client = isolatedPrismaClient(connectionString, schema);
  }, 120_000);

  afterAll(async () => {
    await client.$disconnect();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  });

  it("advances beyond the exact R3 inconsistent prefix with one lazy non-authoritative checkpoint", async () => {
    await withIsolatedRecoveryDatabase(async ({ client: isolated }) => {
      await expect(isolated.promotionRecoveryReconciliationCheckpoint.count()).resolves.toBe(0);
      await expect(reconcilePromotionRecoveries(isolated, {})).resolves.toMatchObject({
        kind: "DISABLED",
        examinedCount: 0,
      });
      await expect(isolated.promotionRecoveryReconciliationCheckpoint.count()).resolves.toBe(0);

      await expect(reconcilePromotionRecoveries(isolated, RECONCILIATION_ENABLED))
        .resolves.toEqual({
          kind: "COMPLETED",
          examinedCount: 0,
          issuedCount: 0,
          replayedCount: 0,
          inconsistentCount: 0,
          failedCount: 0,
        });
      await expect(isolated.promotionRecoveryReconciliationCheckpoint.findUnique({
        where: { scopeKey: PROMOTION_RECOVERY_RECONCILIATION_SCOPE_KEY },
        select: { scopeKey: true, lastOrderId: true },
      })).resolves.toEqual({
        scopeKey: PROMOTION_RECOVERY_RECONCILIATION_SCOPE_KEY,
        lastOrderId: null,
      });

      const inconsistentGrantIds: string[] = [];
      for (let index = 0; index < 25; index += 1) {
        const fixture = await fullyRefundedFixture(isolated, {
          orderId: stableRecoveryOrderId("r3", index),
          policyStatus: PromotionPolicyStatus.DRAFT,
        });
        if (fixture.sourceGrantId !== null) inconsistentGrantIds.push(fixture.sourceGrantId);
      }
      const eligible = await fullyRefundedFixture(isolated, {
        orderId: stableRecoveryOrderId("r3", 25),
      });

      await expect(reconcilePromotionRecoveries(isolated, RECONCILIATION_ENABLED))
        .resolves.toMatchObject({
          kind: "COMPLETED",
          examinedCount: 25,
          issuedCount: 0,
          inconsistentCount: 25,
        });
      await expect(isolated.promotionRecoveryReconciliationCheckpoint.findUniqueOrThrow({
        where: { scopeKey: PROMOTION_RECOVERY_RECONCILIATION_SCOPE_KEY },
        select: { lastOrderId: true },
      })).resolves.toEqual({ lastOrderId: stableRecoveryOrderId("r3", 24) });

      await expect(reconcilePromotionRecoveries(isolated, RECONCILIATION_ENABLED))
        .resolves.toMatchObject({
          kind: "COMPLETED",
          examinedCount: 1,
          issuedCount: 1,
          inconsistentCount: 0,
        });
      await expect(isolated.promotionGrant.count({
        where: { recoveredFromGrantId: eligible.sourceGrantId },
      })).resolves.toBe(1);
      await expect(isolated.promotionGrant.count({
        where: { recoveredFromGrantId: { in: inconsistentGrantIds } },
      })).resolves.toBe(0);
    });
  }, 120_000);

  it("traverses more than two bounded pages of permanent broad false positives", async () => {
    await withIsolatedRecoveryDatabase(async ({ client: isolated }) => {
      for (let index = 0; index < 50; index += 1) {
        await fullyRefundedFixture(isolated, {
          orderId: stableRecoveryOrderId("pressure", index),
          policyStatus: PromotionPolicyStatus.DRAFT,
        });
      }
      const eligible = await fullyRefundedFixture(isolated, {
        orderId: stableRecoveryOrderId("pressure", 50),
      });

      const outcomes = [];
      for (let cycle = 0; cycle < 3; cycle += 1) {
        outcomes.push(await reconcilePromotionRecoveries(isolated, RECONCILIATION_ENABLED));
      }
      expect(outcomes).toMatchObject([
        { examinedCount: 25, issuedCount: 0, inconsistentCount: 25 },
        { examinedCount: 25, issuedCount: 0, inconsistentCount: 25 },
        { examinedCount: 1, issuedCount: 1, inconsistentCount: 0 },
      ]);
      for (const outcome of outcomes) expect(outcome.examinedCount).toBeLessThanOrEqual(25);
      await expect(isolated.promotionGrant.count({
        where: { recoveredFromGrantId: eligible.sourceGrantId },
      })).resolves.toBe(1);
    });
  }, 180_000);

  it("wraps to revisit later eligibility and treats cursor loss or reset as rescan only", async () => {
    await withIsolatedRecoveryDatabase(async ({ client: isolated }) => {
      const fixture = await createOrderFixture(isolated, {
        orderId: stableRecoveryOrderId("later", 0),
      });
      await seedSucceededRefund(isolated, fixture, { ordinal: 1, quantity: 1 });
      const orderBefore = await isolated.order.findUniqueOrThrow({
        where: { id: fixture.orderId },
        select: { updatedAt: true },
      });

      await expect(reconcilePromotionRecoveries(isolated, RECONCILIATION_ENABLED))
        .resolves.toMatchObject({ kind: "COMPLETED", examinedCount: 1, issuedCount: 0 });
      await isolated.promotionRecoveryReconciliationCheckpoint.update({
        where: { scopeKey: PROMOTION_RECOVERY_RECONCILIATION_SCOPE_KEY },
        data: { lastOrderId: "zzzz-r4-cursor-beyond-all-orders" },
      });
      await seedSucceededRefund(isolated, fixture, { ordinal: 2, quantity: 1 });
      await seedSucceededRefund(isolated, fixture, { ordinal: 3, quantity: 1 });

      await expect(reconcilePromotionRecoveries(isolated, RECONCILIATION_ENABLED))
        .resolves.toMatchObject({ kind: "COMPLETED", examinedCount: 1, issuedCount: 1 });
      await expect(isolated.order.findUniqueOrThrow({
        where: { id: fixture.orderId },
        select: { updatedAt: true },
      })).resolves.toEqual(orderBefore);
      await expect(isolated.promotionGrant.count({
        where: { recoveredFromGrantId: fixture.sourceGrantId },
      })).resolves.toBe(1);

      await isolated.promotionRecoveryReconciliationCheckpoint.delete({
        where: { scopeKey: PROMOTION_RECOVERY_RECONCILIATION_SCOPE_KEY },
      });
      await expect(reconcilePromotionRecoveries(isolated, RECONCILIATION_ENABLED))
        .resolves.toMatchObject({ kind: "COMPLETED", examinedCount: 0, issuedCount: 0 });
      await isolated.promotionRecoveryReconciliationCheckpoint.update({
        where: { scopeKey: PROMOTION_RECOVERY_RECONCILIATION_SCOPE_KEY },
        data: { lastOrderId: null },
      });
      await expect(reconcilePromotionRecoveries(isolated, RECONCILIATION_ENABLED))
        .resolves.toMatchObject({ kind: "COMPLETED", examinedCount: 0, issuedCount: 0 });
      await expect(isolated.promotionGrant.count({
        where: { recoveredFromGrantId: fixture.sourceGrantId },
      })).resolves.toBe(1);
    });
  }, 120_000);

  it("serializes concurrent claims and revisits a claimed-but-unprocessed eligible Order after wrap", async () => {
    await withIsolatedRecoveryDatabase(async ({
      admin: isolatedAdmin,
      client: isolated,
      connectionString,
      schema: isolatedSchema,
    }) => {
      await reconcilePromotionRecoveries(isolated, RECONCILIATION_ENABLED);
      for (let index = 0; index < 30; index += 1) {
        await fullyRefundedFixture(isolated, {
          orderId: stableRecoveryOrderId("concurrent", index),
          policyStatus: PromotionPolicyStatus.DRAFT,
        });
      }
      const eligible = await fullyRefundedFixture(isolated, {
        orderId: stableRecoveryOrderId("concurrent", 30),
      });
      const firstClient = isolatedPrismaClient(connectionString, isolatedSchema);
      const secondClient = isolatedPrismaClient(connectionString, isolatedSchema);
      const blocker = new Client({ connectionString });
      await blocker.connect();
      await blocker.query(`SET search_path TO "${isolatedSchema}"`);
      await blocker.query("BEGIN");
      await blocker.query(`
        SELECT "scopeKey"
        FROM "PromotionRecoveryReconciliationCheckpoint"
        WHERE "scopeKey" = $1
        FOR UPDATE
      `, [PROMOTION_RECOVERY_RECONCILIATION_SCOPE_KEY]);
      try {
        const firstClaimPromise = claimPromotionRecoveryReconciliationBatch(
          firstClient,
          RECONCILIATION_ENABLED,
        );
        const secondClaimPromise = claimPromotionRecoveryReconciliationBatch(
          secondClient,
          RECONCILIATION_ENABLED,
        );
        await waitForCheckpointClaimWaiters(isolatedAdmin, 2);
        await blocker.query("COMMIT");
        const [firstClaim, secondClaim] = await Promise.all([firstClaimPromise, secondClaimPromise]);
        expect(firstClaim.kind).toBe("CLAIMED");
        expect(secondClaim.kind).toBe("CLAIMED");
        const orderIds = [...firstClaim.orderIds, ...secondClaim.orderIds];
        expect(firstClaim.orderIds).toHaveLength(25);
        expect(secondClaim.orderIds.length).toBeLessThanOrEqual(25);
        expect(orderIds).toHaveLength(31);
        expect(new Set(orderIds).size).toBe(31);
        expect(orderIds).toContain(eligible.orderId);
        await expect(isolated.promotionGrant.count({
          where: { recoveredFromGrantId: eligible.sourceGrantId },
        })).resolves.toBe(0);
      } finally {
        await rollbackQuietly(blocker);
        await blocker.end();
        await firstClient.$disconnect();
        await secondClient.$disconnect();
      }

      const afterClaimCrash = [
        await reconcilePromotionRecoveries(isolated, RECONCILIATION_ENABLED),
        await reconcilePromotionRecoveries(isolated, RECONCILIATION_ENABLED),
      ];
      for (const outcome of afterClaimCrash) {
        expect(outcome.examinedCount).toBeLessThanOrEqual(25);
      }
      await expect(isolated.promotionGrant.count({
        where: { recoveredFromGrantId: eligible.sourceGrantId },
      })).resolves.toBe(1);
      await reconcilePromotionRecoveries(isolated, RECONCILIATION_ENABLED);
      await expect(isolated.promotionGrant.count({
        where: { recoveredFromGrantId: eligible.sourceGrantId },
      })).resolves.toBe(1);
    });
  }, 180_000);

  it("classifies no-promotion, non-success noise, partial, and full reversal", async () => {
    const noPromotion = await createOrderFixture(client, { promotion: false });
    await expect(readPromotionRecoverySnapshot(client, noPromotion.orderId))
      .resolves.toMatchObject({ classification: { kind: "NOT_APPLICABLE" } });

    const partial = await createOrderFixture(client);
    await seedNonSuccessAttempt(client, partial, RefundAttemptStatus.FAILED_TERMINAL);
    await seedSucceededRefund(client, partial, { ordinal: 1, quantity: 1 });
    await expect(readPromotionRecoverySnapshot(client, partial.orderId))
      .resolves.toMatchObject({ classification: { kind: "NOT_YET_ELIGIBLE" } });
    await seedSucceededRefund(client, partial, { ordinal: 2, quantity: 1 });
    await expect(readPromotionRecoverySnapshot(client, partial.orderId))
      .resolves.toMatchObject({ classification: { kind: "NOT_YET_ELIGIBLE" } });
    const finalAt = await seedSucceededRefund(client, partial, { ordinal: 3, quantity: 1 });
    await expect(readPromotionRecoverySnapshot(client, partial.orderId))
      .resolves.toMatchObject({
        classification: { kind: "ELIGIBLE_NOT_ISSUED", recoveryEligibleAt: finalAt },
      });

    const cashShort = await createOrderFixture(client);
    await seedSucceededRefund(client, cashShort, {
      ordinal: 1,
      quantity: 3,
      merchandiseRefundAmount: 2_699,
    });
    await expect(readPromotionRecoverySnapshot(client, cashShort.orderId))
      .resolves.toMatchObject({ classification: { kind: "NOT_YET_ELIGIBLE" } });
  });

  it("fails closed for missing allocation, frozen snapshot drift, and success-evidence mismatch", async () => {
    const missing = await createOrderFixture(client);
    await seedSucceededRefund(client, missing, { ordinal: 1, quantity: 3, omitAllocation: true });
    await expect(readPromotionRecoverySnapshot(client, missing.orderId))
      .resolves.toMatchObject({ classification: { kind: "INCONSISTENT", reason: "REFUND_ECONOMIC_HISTORY" } });

    const snapshotDrift = await createOrderFixture(client, { lineDiscountAmount: 299 });
    await expect(readPromotionRecoverySnapshot(client, snapshotDrift.orderId))
      .resolves.toMatchObject({ classification: { kind: "INCONSISTENT", reason: "ORDER_PROMOTION_SNAPSHOT" } });

    const evidenceMismatch = await createOrderFixture(client);
    await seedSucceededRefund(client, evidenceMismatch, {
      ordinal: 1,
      quantity: 3,
      reportedAmount: 2_699,
    });
    await expect(readPromotionRecoverySnapshot(client, evidenceMismatch.orderId))
      .resolves.toMatchObject({ classification: { kind: "INCONSISTENT", reason: "REFUND_SUCCESS_EVIDENCE" } });
  });

  it("keeps disabled and malformed issuance fail-closed without creating a grant", async () => {
    const fixture = await fullyRefundedFixture(client);
    await expect(ensurePromotionRecoveryForOrder(client, fixture.orderId, {}))
      .resolves.toEqual({ ok: false, code: "FEATURE_DISABLED" });
    await expect(ensurePromotionRecoveryForOrder(client, fixture.orderId, {
      PROMOTION_RECOVERY_ISSUANCE_ENABLED: "true",
    })).rejects.toMatchObject({ name: "PromotionRecoveryActivationConfigError" });
    await expect(client.promotionGrant.count({
      where: { recoveredFromGrantId: fixture.sourceGrantId },
    })).resolves.toBe(0);
  });

  it("accepts RETIRED history, rejects DRAFT/revoked history, and applies only policy-owned expiry", async () => {
    const retired = await fullyRefundedFixture(client, { policyStatus: PromotionPolicyStatus.RETIRED });
    await expect(ensurePromotionRecoveryForOrder(client, retired.orderId, ISSUANCE_ENABLED))
      .resolves.toMatchObject({ ok: true, issuedNow: true });

    const draft = await fullyRefundedFixture(client, { policyStatus: PromotionPolicyStatus.DRAFT });
    await expect(readPromotionRecoverySnapshot(client, draft.orderId))
      .resolves.toMatchObject({ classification: { kind: "INCONSISTENT", reason: "ORDER_PROMOTION_SNAPSHOT" } });

    const revoked = await fullyRefundedFixture(client);
    await client.promotionGrant.update({
      where: { id: revoked.sourceGrantId ?? "" },
      data: { revokedAt: new Date() },
    });
    await expect(readPromotionRecoverySnapshot(client, revoked.orderId))
      .resolves.toMatchObject({ classification: { kind: "INCONSISTENT", reason: "ORDER_PROMOTION_SNAPSHOT" } });

    const missingGrace = await fullyRefundedFixture(client, { recoveryGraceDays: null });
    await expect(readPromotionRecoverySnapshot(client, missingGrace.orderId))
      .resolves.toMatchObject({ classification: { kind: "INCONSISTENT", reason: "RECOVERY_EXPIRY" } });

    const unlimited = await fullyRefundedFixture(client, {
      recoveryGraceDays: null,
      sourceExpiresAfterDays: null,
    });
    const unlimitedResult = await ensurePromotionRecoveryForOrder(client, unlimited.orderId, ISSUANCE_ENABLED);
    if (!unlimitedResult.ok || unlimitedResult.snapshot.classification.kind !== "ISSUED") {
      throw new Error("Expected unlimited recovery issuance.");
    }
    await expect(client.promotionGrant.findUniqueOrThrow({
      where: { id: unlimitedResult.snapshot.classification.recoveryGrantId },
      select: { expiresAt: true },
    })).resolves.toEqual({ expiresAt: null });

    const graceExtended = await fullyRefundedFixture(client, {
      recoveryGraceDays: 30,
      sourceExpiresAfterDays: 1,
    });
    const graceResult = await ensurePromotionRecoveryForOrder(client, graceExtended.orderId, ISSUANCE_ENABLED);
    if (!graceResult.ok || graceResult.snapshot.classification.kind !== "ISSUED") {
      throw new Error("Expected grace-extended recovery issuance.");
    }
    const graceGrant = await client.promotionGrant.findUniqueOrThrow({
      where: { id: graceResult.snapshot.classification.recoveryGrantId },
    });
    expect(graceGrant.expiresAt?.getTime()).toBe(
      graceResult.snapshot.classification.recoveryEligibleAt.getTime() + 30 * DAY_MS,
    );
  });

  it("serializes concurrent issuance to one exact successor and replays it", async () => {
    const fixture = await fullyRefundedFixture(client);
    const results = await Promise.all(Array.from({ length: 6 }, () => (
      ensurePromotionRecoveryForOrder(client, fixture.orderId, ISSUANCE_ENABLED)
    )));
    expect(results.every((result) => result.ok)).toBe(true);
    expect(results.filter((result) => result.ok && result.issuedNow)).toHaveLength(1);
    const successors = await client.promotionGrant.findMany({
      where: { recoveredFromGrantId: fixture.sourceGrantId },
    });
    expect(successors).toHaveLength(1);
    expect(successors[0]).toMatchObject({
      userId: fixture.userId,
      policyVersionId: fixture.policyVersionId,
      grantKey: `recovery:${fixture.sourceGrantId}`,
    });
    expect(successors[0]?.expiresAt).toEqual(
      (await client.promotionGrant.findUniqueOrThrow({ where: { id: fixture.sourceGrantId ?? "" } })).expiresAt,
    );
    await expect(ensurePromotionRecoveryForOrder(client, fixture.orderId, ISSUANCE_ENABLED))
      .resolves.toMatchObject({ ok: true, issuedNow: false, snapshot: { classification: { kind: "ISSUED" } } });
  });

  it("re-enters immediately by command and through the bounded reconciliation pass", async () => {
    const immediate = await fullyRefundedFixture(client);
    const command = await client.refundExecutionCommand.findFirstOrThrow({
      where: { refundAttempt: { orderId: immediate.orderId } },
      select: { id: true },
    });
    await expect(attemptPromotionRecoveryAfterRefundCommand(
      client,
      command.id,
      ISSUANCE_ENABLED,
    )).resolves.toBe("ISSUED");
    await expect(attemptPromotionRecoveryAfterRefundCommand(
      client,
      command.id,
      ISSUANCE_ENABLED,
    )).resolves.toBe("REPLAYED");

    const reconciled = await fullyRefundedFixture(client);
    const result = await reconcilePromotionRecoveries(client, {
      PROMOTION_RECOVERY_ISSUANCE_ENABLED: "ENABLED",
      PROMOTION_RECOVERY_RECONCILIATION_ENABLED: "ENABLED",
    });
    expect(result.kind).toBe("COMPLETED");
    await expect(client.promotionGrant.count({
      where: { recoveredFromGrantId: reconciled.sourceGrantId },
    })).resolves.toBe(1);

    const disabled = await fullyRefundedFixture(client);
    await expect(reconcilePromotionRecoveries(client, {}))
      .resolves.toMatchObject({ kind: "DISABLED", examinedCount: 0 });
    await expect(reconcilePromotionRecoveries(client, {
      PROMOTION_RECOVERY_ISSUANCE_ENABLED: "ENABLED",
      PROMOTION_RECOVERY_RECONCILIATION_ENABLED: "true",
    })).resolves.toMatchObject({ kind: "CONFIG_INVALID", examinedCount: 0 });
    await expect(client.promotionGrant.count({
      where: { recoveredFromGrantId: disabled.sourceGrantId },
    })).resolves.toBe(0);
  });

  it("keeps committed refund success durable when recovery insertion fails, then retries once", async () => {
    const fixture = await fullyRefundedFixture(client);
    const command = await client.refundExecutionCommand.findFirstOrThrow({
      where: { refundAttempt: { orderId: fixture.orderId } },
      select: { id: true, refundAttemptId: true },
    });
    await client.$executeRawUnsafe(`
      CREATE FUNCTION promo_c5_test_reject_recovery() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."recoveredFromGrantId" IS NOT NULL THEN
          RAISE EXCEPTION 'forced recovery insertion failure';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER promo_c5_test_reject_recovery
      BEFORE INSERT ON "PromotionGrant"
      FOR EACH ROW EXECUTE FUNCTION promo_c5_test_reject_recovery();
    `);
    try {
      await expect(attemptPromotionRecoveryAfterRefundCommand(client, command.id, ISSUANCE_ENABLED))
        .resolves.toBe("FAILED");
      const persistedAttempt = await client.refundAttempt.findUniqueOrThrow({
        where: { id: command.refundAttemptId },
        select: {
          status: true,
          processedAt: true,
          transitions: { select: { toStatus: true } },
          executionCommand: {
            select: {
              status: true,
              evidence: { select: { outcome: true, application: true } },
              dispatchAttempts: { select: { id: true } },
            },
          },
        },
      });
      expect(persistedAttempt.status).toBe(RefundAttemptStatus.SUCCEEDED);
      expect(persistedAttempt.processedAt).toBeInstanceOf(Date);
      expect(persistedAttempt.transitions.some(
        ({ toStatus }) => toStatus === RefundAttemptStatus.SUCCEEDED,
      )).toBe(true);
      expect(persistedAttempt.executionCommand).toEqual({
        status: RefundExecutionCommandStatus.DONE,
        evidence: [{
          outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
          application: RefundExecutionEvidenceApplication.APPLIED,
        }],
        dispatchAttempts: [],
      });
      await expect(client.promotionGrant.count({
        where: { recoveredFromGrantId: fixture.sourceGrantId },
      })).resolves.toBe(0);
    } finally {
      await client.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS promo_c5_test_reject_recovery ON "PromotionGrant";
        DROP FUNCTION IF EXISTS promo_c5_test_reject_recovery();
      `);
    }
    await expect(attemptPromotionRecoveryAfterRefundCommand(client, command.id, ISSUANCE_ENABLED))
      .resolves.toBe("ISSUED");
    await expect(client.promotionGrant.count({
      where: { recoveredFromGrantId: fixture.sourceGrantId },
    })).resolves.toBe(1);
  });

  it("preserves coupon allocation through customer-intake approval and exact replay", async () => {
    const fixture = await createOrderFixture(client);
    const secondOrderItemId = await splitCouponOrderIntoTwoLines(client, fixture);
    const intake = await client.customerRefundIntake.create({
      data: {
        orderId: fixture.orderId,
        customerUserId: fixture.userId,
        status: CustomerRefundIntakeStatus.SUBMITTED,
        reasonCode: CustomerRefundIntakeReasonCode.PRODUCT_DEFECT,
        submittedAt: new Date(),
      },
    });
    const firstLine = {
      orderItemId: fixture.orderItemId,
      quantity: 1,
      merchandiseRefundAmount: 1_800,
    };
    const secondLine = {
      orderItemId: secondOrderItemId,
      quantity: 1,
      merchandiseRefundAmount: 900,
    };
    const lines = [firstLine, secondLine];
    const input = {
      orderId: fixture.orderId,
      intakeId: intake.id,
      reviewedByUserId: "promo-c5-reviewer",
      amount: 2_700,
      merchantRationale: "Approve exact coupon refund economics.",
      lines,
      now: new Date(),
    };

    const first = await approveCustomerRefundIntake(client, input);
    if (!first.ok) throw new Error(`Expected coupon intake approval: ${first.code}`);
    const exactReplay = await approveCustomerRefundIntake(client, input);
    const reorderedReplay = await approveCustomerRefundIntake(client, {
      ...input,
      lines: [...lines].reverse(),
    });

    expect(first).toMatchObject({ ok: true, replayed: false });
    expect(first.attempt.lines).toEqual([...lines].sort(compareRefundLineIds));
    expect(exactReplay).toEqual({ ...first, replayed: true });
    expect(reorderedReplay).toEqual({ ...first, replayed: true });
    await expect(approveCustomerRefundIntake(client, {
      ...input,
      lines: [{ ...firstLine, merchandiseRefundAmount: 1_799 }, secondLine],
    })).rejects.toBeInstanceOf(CustomerIntakeReviewInvariantError);
    await expect(approveCustomerRefundIntake(client, {
      ...input,
      lines: [{ ...firstLine, quantity: 2 }, secondLine],
    })).rejects.toBeInstanceOf(CustomerIntakeReviewInvariantError);
    await expect(client.refundAttempt.count({ where: { orderId: fixture.orderId } })).resolves.toBe(1);
    await expect(client.refundAttemptLineEconomicAllocation.findMany({
      where: { refundAttempt: { orderId: fixture.orderId } },
      select: { orderItemId: true, merchandiseRefundAmount: true },
      orderBy: { orderItemId: "asc" },
    })).resolves.toEqual([...lines].sort(compareRefundLineIds).map((line) => ({
      orderItemId: line.orderItemId,
      merchandiseRefundAmount: line.merchandiseRefundAmount,
    })));

    try {
      await client.$executeRawUnsafe(
        'ALTER TABLE "RefundAttemptLineEconomicAllocation" DISABLE TRIGGER "RefundAttemptLineEconomicAllocation_immutable"',
      );
      await client.refundAttemptLineEconomicAllocation.deleteMany({
        where: { refundAttemptId: first.attempt.id },
      });
    } finally {
      await client.$executeRawUnsafe(
        'ALTER TABLE "RefundAttemptLineEconomicAllocation" ENABLE TRIGGER "RefundAttemptLineEconomicAllocation_immutable"',
      );
    }
    await expect(approveCustomerRefundIntake(client, input))
      .rejects.toBeInstanceOf(CustomerIntakeReviewInvariantError);
  });

  it("uses general C5 allocations for whole-Order cancellation and its bounded replacement", async () => {
    const completed = await createOrderFixture(client, { cancellable: true });
    const accepted = await cancelEligibleMtoOrder(client, {
      orderId: completed.orderId,
      requestKey: randomUUID(),
      requestedByUserId: completed.userId,
    });
    if (!accepted.ok) throw new Error(`Expected coupon cancellation: ${accepted.code}`);
    await expect(client.refundAttemptLineEconomicAllocation.findMany({
      where: { refundAttemptId: accepted.initialRefundAttemptId },
      select: { merchandiseRefundAmount: true },
    })).resolves.toEqual([{ merchandiseRefundAmount: 2_700 }]);
    await markRefundAttemptSucceeded(client, accepted.initialRefundAttemptId, completed.orderId);
    await expect(readPromotionRecoverySnapshot(client, completed.orderId))
      .resolves.toMatchObject({ classification: { kind: "ELIGIBLE_NOT_ISSUED" } });
    await expect(ensurePromotionRecoveryForOrder(client, completed.orderId, ISSUANCE_ENABLED))
      .resolves.toMatchObject({ ok: true, issuedNow: true });

    const replacementFixture = await createOrderFixture(client, { cancellable: true });
    const first = await cancelEligibleMtoOrder(client, {
      orderId: replacementFixture.orderId,
      requestKey: randomUUID(),
      requestedByUserId: replacementFixture.userId,
    });
    if (!first.ok) throw new Error(`Expected coupon cancellation: ${first.code}`);
    await markRefundAttemptTerminalNonExecution(client, first.initialRefundAttemptId, replacementFixture.orderId);
    const replacement = await replaceOutstandingCancellationRefund(client, {
      orderId: replacementFixture.orderId,
      requestKey: randomUUID(),
      requestedByAdminUserId: replacementFixture.userId,
    });
    if (!replacement.ok) throw new Error(`Expected coupon cancellation replacement: ${replacement.code}`);
    await expect(client.refundAttemptLineEconomicAllocation.findMany({
      where: { refundAttemptId: replacement.refundAttemptId },
      select: { merchandiseRefundAmount: true },
    })).resolves.toEqual([{ merchandiseRefundAmount: 2_700 }]);
  });

  it("keeps C0 creation identity historical while current obligation advances", async () => {
    const fixture = await createOrderFixture(client, { cancellable: true });
    const cancellationInput = {
      orderId: fixture.orderId,
      requestKey: randomUUID(),
      requestedByUserId: fixture.userId,
    };
    const accepted = await cancelEligibleMtoOrder(client, cancellationInput);
    if (!accepted.ok) throw new Error(`Expected cancellation acceptance: ${accepted.code}`);
    await expect(cancelEligibleMtoOrder(client, cancellationInput))
      .resolves.toMatchObject({ ok: true, replayed: true });

    await markRefundAttemptTerminalNonExecution(client, accepted.initialRefundAttemptId, fixture.orderId);
    const earlierKey = randomUUID();
    const earlier = await replaceOutstandingCancellationRefund(client, {
      orderId: fixture.orderId,
      requestKey: earlierKey,
      requestedByAdminUserId: fixture.userId,
    });
    if (!earlier.ok) throw new Error(`Expected earlier replacement: ${earlier.code}`);
    await expect(cancelEligibleMtoOrder(client, cancellationInput))
      .resolves.toMatchObject({ ok: true, replayed: true });

    await markRefundAttemptTerminalNonExecution(client, earlier.refundAttemptId, fixture.orderId);
    const laterKey = randomUUID();
    const later = await replaceOutstandingCancellationRefund(client, {
      orderId: fixture.orderId,
      requestKey: laterKey,
      requestedByAdminUserId: fixture.userId,
    });
    if (!later.ok) throw new Error(`Expected later replacement: ${later.code}`);
    await markRefundAttemptSucceeded(client, later.refundAttemptId, fixture.orderId);
    const attemptCount = await client.refundAttempt.count({ where: { orderId: fixture.orderId } });

    await expect(cancelEligibleMtoOrder(client, cancellationInput))
      .resolves.toMatchObject({ ok: true, replayed: true });
    await expect(replaceOutstandingCancellationRefund(client, {
      orderId: fixture.orderId,
      requestKey: earlierKey,
      requestedByAdminUserId: fixture.userId,
    })).resolves.toMatchObject({ ok: true, replayed: true, refundAttemptId: earlier.refundAttemptId });
    await expect(replaceOutstandingCancellationRefund(client, {
      orderId: fixture.orderId,
      requestKey: randomUUID(),
      requestedByAdminUserId: fixture.userId,
    })).resolves.toMatchObject({ ok: false, code: "NO_OUTSTANDING_OBLIGATION" });
    await expect(client.refundAttempt.count({ where: { orderId: fixture.orderId } }))
      .resolves.toBe(attemptCount);
  });

  it("rejects replacement replay when immutable allocation evidence differs", async () => {
    const fixture = await createOrderFixture(client, { cancellable: true });
    const accepted = await cancelEligibleMtoOrder(client, {
      orderId: fixture.orderId,
      requestKey: randomUUID(),
      requestedByUserId: fixture.userId,
    });
    if (!accepted.ok) throw new Error(`Expected cancellation acceptance: ${accepted.code}`);
    await markRefundAttemptTerminalNonExecution(client, accepted.initialRefundAttemptId, fixture.orderId);
    const requestKey = randomUUID();
    const replacement = await replaceOutstandingCancellationRefund(client, {
      orderId: fixture.orderId,
      requestKey,
      requestedByAdminUserId: fixture.userId,
    });
    if (!replacement.ok) throw new Error(`Expected replacement: ${replacement.code}`);
    try {
      await client.$executeRawUnsafe(
        'ALTER TABLE "RefundAttemptLineEconomicAllocation" DISABLE TRIGGER "RefundAttemptLineEconomicAllocation_immutable"',
      );
      await client.refundAttemptLineEconomicAllocation.updateMany({
        where: { refundAttemptId: replacement.refundAttemptId },
        data: { merchandiseRefundAmount: 2_699 },
      });
    } finally {
      await client.$executeRawUnsafe(
        'ALTER TABLE "RefundAttemptLineEconomicAllocation" ENABLE TRIGGER "RefundAttemptLineEconomicAllocation_immutable"',
      );
    }
    await expect(replaceOutstandingCancellationRefund(client, {
      orderId: fixture.orderId,
      requestKey,
      requestedByAdminUserId: fixture.userId,
    })).resolves.toMatchObject({ ok: false, code: "REQUEST_KEY_CONFLICT" });
  });

  it("discovers eligible recovery behind multiple bounded pages of non-progress", async () => {
    const partials: OrderFixture[] = [];
    for (let index = 0; index < 51; index += 1) {
      const partial = await createOrderFixture(client);
      await seedSucceededRefund(client, partial, { ordinal: 1, quantity: 1 });
      partials.push(partial);
    }
    const firstPass = await reconcilePromotionRecoveries(client, RECONCILIATION_ENABLED);
    expect(firstPass).toMatchObject({ kind: "COMPLETED" });
    expect(firstPass.examinedCount).toBeLessThanOrEqual(25);

    const eligible = await fullyRefundedFixture(client);
    const inconsistent = await createOrderFixture(client);
    await seedSucceededRefund(client, inconsistent, {
      ordinal: 1,
      quantity: 3,
      reportedAmount: 2_699,
    });
    const becomingEligible = partials[0];
    if (!becomingEligible) throw new Error("Expected a partial recovery fixture.");
    await seedSucceededRefund(client, becomingEligible, { ordinal: 2, quantity: 1 });
    await seedSucceededRefund(client, becomingEligible, { ordinal: 3, quantity: 1 });

    const outcomes = [];
    for (let cycle = 0; cycle < 6; cycle += 1) {
      outcomes.push(await reconcilePromotionRecoveries(client, RECONCILIATION_ENABLED));
      const issued = await client.promotionGrant.count({
        where: {
          recoveredFromGrantId: { in: [eligible.sourceGrantId ?? "", becomingEligible.sourceGrantId ?? ""] },
        },
      });
      if (issued === 2) break;
    }
    expect(outcomes.every(({ kind, examinedCount }) => (
      kind === "COMPLETED" && examinedCount <= 25
    ))).toBe(true);
    await expect(client.promotionGrant.count({
      where: { recoveredFromGrantId: eligible.sourceGrantId },
    })).resolves.toBe(1);
    await expect(client.promotionGrant.count({
      where: { recoveredFromGrantId: becomingEligible.sourceGrantId },
    })).resolves.toBe(1);
    await expect(client.promotionGrant.count({
      where: { recoveredFromGrantId: inconsistent.sourceGrantId },
    })).resolves.toBe(0);

    await reconcilePromotionRecoveries(client, RECONCILIATION_ENABLED);
    await expect(client.promotionGrant.count({
      where: { recoveredFromGrantId: eligible.sourceGrantId },
    })).resolves.toBe(1);
  }, 120_000);

  it("allows recovered first-order terms without a new claim and carries remaining validity recursively", async () => {
    const recovered = await issueAndInspectRecoveredFirstOrder(client);
    const secondOrder = await consumeRecoveredFirstOrder(client, recovered);
    await assertRecursiveRecovery(client, recovered, secondOrder);
    await assertForgedRecoveryRejected(client);
  });
});

async function issueAndInspectRecoveredFirstOrder(
  client: PrismaClient,
): Promise<RecoveredFirstOrderFixture> {
  const firstOrder = await fullyRefundedFixture(client, { kind: PromotionKind.SIGNUP });
  const historicalClaimBefore = await client.checkoutSession.findUniqueOrThrow({
    where: { id: firstOrder.checkoutSessionId },
    select: { firstOrderPromotionClaimedAt: true },
  });
  expect(historicalClaimBefore.firstOrderPromotionClaimedAt).toBeInstanceOf(Date);
  const issuance = await ensurePromotionRecoveryForOrder(client, firstOrder.orderId, ISSUANCE_ENABLED);
  const recoveredGrantId = requireIssuedRecoveryGrantId(issuance);
  const recovered = await client.promotionGrant.findUniqueOrThrow({
    where: { id: recoveredGrantId },
    include: {
      policyVersion: {
        include: { marketRules: { include: { market: true } } },
      },
    },
  });
  const redemptionAt = new Date(Math.max(
    recovered.validFrom.getTime(),
    recovered.issuedAt.getTime(),
  ) + 1);
  const recoveredExpiresAt = requireDate(recovered.expiresAt, "recovered expiry");
  const marketRule = requireFirst(recovered.policyVersion.marketRules, "promotion market rule");
  expect(recovered.userId).toBe(firstOrder.userId);
  expect(recovered.validFrom.getTime()).toBeLessThanOrEqual(redemptionAt.getTime());
  expect(redemptionAt.getTime()).toBeLessThan(recoveredExpiresAt.getTime());
  expect(recovered.revokedAt).toBeNull();
  expect(recovered.redeemedAt).toBeNull();
  expect(recovered.policyVersion.kind).toBe(PromotionKind.SIGNUP);
  expect(recovered.policyVersion.status).toBe(PromotionPolicyStatus.ACTIVE);
  expect(marketRule.currency).toBe("KRW");
  expect(marketRule.market.currency).toBe("KRW");
  expect(recovered.reservedCheckoutSessionId).toBeNull();
  const priced = await priceSelectedPromotion(client, {
    promotionGrantId: recovered.id,
    userId: firstOrder.userId,
    marketCode: "KR",
    currency: "KRW",
    lines: [{ lineId: "replacement-line", grossAmount: 3_000 }],
    now: redemptionAt,
  });
  expect(priced).toMatchObject({ firstOrderOnly: true, requiresFirstOrderClaim: false });
  return {
    firstOrder,
    recoveredGrantId: recovered.id,
    recoveredPolicyVersionId: recovered.policyVersionId,
    recoveredExpiresAt,
    redemptionAt,
    historicalClaimBefore,
  };
}

async function consumeRecoveredFirstOrder(
  client: PrismaClient,
  fixture: RecoveredFirstOrderFixture,
): Promise<OrderFixture> {
  const checkout = await createRecoveredCheckoutSession(
    client,
    fixture.firstOrder.userId,
    fixture.recoveredGrantId,
    fixture.redemptionAt,
  );
  const initiateInput = {
    sessionId: checkout.sessionId,
    userId: fixture.firstOrder.userId,
    adapterContext: {
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      market: "KR",
      method: PaymentMethod.MOCK,
      currency: "KRW",
      ruleId: `recovered-initiation-${randomUUID()}`,
      credentials: [],
      liveGuard: { kind: "blocked" as const, liveEnabled: false as const, reason: "test" },
    },
    now: fixture.redemptionAt,
    contactBoundaryClock: () => fixture.redemptionAt,
  };
  const initiated = await initiatePaymentAttempt(client, initiateInput);
  const resumed = await initiatePaymentAttempt(client, initiateInput);
  expect(resumed.paymentId).toBe(initiated.paymentId);
  await expect(client.checkoutSession.findUniqueOrThrow({ where: { id: checkout.sessionId } }))
    .resolves.toMatchObject({ firstOrderPromotionClaimedAt: null });
  const capture = {
    checkoutSessionId: checkout.sessionId,
    paymentId: initiated.paymentId,
    provider: PaymentProvider.MOCK,
    mode: PaymentMode.SANDBOX,
    providerPaymentKey: `recovered-capture-${randomUUID()}`,
    amount: checkout.totalAmount,
    currency: "KRW",
    receivedAt: fixture.redemptionAt,
    capturedAt: fixture.redemptionAt,
  };
  const completedOrderId = requireCompletedOrderId(await completeFromCapture(client, capture));
  await expect(completeFromCapture(client, capture)).resolves.toMatchObject({
    kind: "alreadyCompleted",
    orderId: completedOrderId,
  });
  await expect(client.checkoutSession.findUniqueOrThrow({
    where: { id: fixture.firstOrder.checkoutSessionId },
    select: { firstOrderPromotionClaimedAt: true },
  })).resolves.toEqual(fixture.historicalClaimBefore);
  const order = await client.order.findUniqueOrThrow({
    where: { id: completedOrderId },
    include: { items: true },
  });
  return {
    orderId: order.id,
    checkoutSessionId: order.checkoutSessionId,
    userId: order.userId,
    paymentId: order.paymentId,
    orderItemId: requireFirst(order.items, "recovered order item").id,
    sourceGrantId: fixture.recoveredGrantId,
    policyVersionId: fixture.recoveredPolicyVersionId,
  };
}

async function assertRecursiveRecovery(
  client: PrismaClient,
  fixture: RecoveredFirstOrderFixture,
  secondOrder: OrderFixture,
): Promise<void> {
  await seedSucceededRefund(client, secondOrder, { ordinal: 1, quantity: 3 });
  const issuance = await ensurePromotionRecoveryForOrder(client, secondOrder.orderId, ISSUANCE_ENABLED);
  const recoveryGrantId = requireIssuedRecoveryGrantId(issuance);
  const recursive = await client.promotionGrant.findUniqueOrThrow({ where: { id: recoveryGrantId } });
  const recursiveExpiry = requireDate(recursive.expiresAt, "recursive recovery expiry");
  const sourceRemaining = fixture.recoveredExpiresAt.getTime() - fixture.redemptionAt.getTime();
  const recursiveValidity = recursiveExpiry.getTime() - recursive.validFrom.getTime();
  expect(recursiveValidity).toBe(sourceRemaining);
  expect(recursiveValidity).toBeGreaterThan(30 * DAY_MS);
}

async function assertForgedRecoveryRejected(client: PrismaClient): Promise<void> {
  const userId = `forged_recovery_user_${randomUUID()}`;
  await client.user.create({ data: { id: userId, email: `${userId}@example.test` } });
  const source = await createPromotion(client, userId, PromotionKind.SIGNUP);
  const eligibleAt = new Date(Date.now() - 1_000);
  const forged = await client.promotionGrant.create({
    data: {
      userId,
      policyVersionId: source.policyVersionId,
      grantKey: `recovery:${source.grantId}`,
      originMarketCode: "KR",
      issuedAt: new Date(),
      validFrom: eligibleAt,
      expiresAt: new Date(Date.now() + DAY_MS),
      recoveredFromGrantId: source.grantId,
      recoveryEligibleAt: eligibleAt,
    },
  });
  await expect(priceSelectedPromotion(client, {
    promotionGrantId: forged.id,
    userId,
    marketCode: "KR",
    currency: "KRW",
    lines: [{ lineId: "forged-line", grossAmount: 3_000 }],
    now: new Date(),
  })).rejects.toMatchObject({ code: "PROMOTION_GRANT_UNAVAILABLE" });
}

function requireIssuedRecoveryGrantId(
  result: Awaited<ReturnType<typeof ensurePromotionRecoveryForOrder>>,
): string {
  if (!result.ok) throw new Error(`Expected recovery issuance: ${result.code}`);
  const { classification } = result.snapshot;
  if (classification.kind !== "ISSUED") throw new Error("Expected issued recovery classification.");
  return classification.recoveryGrantId;
}

function requireCompletedOrderId(
  result: Awaited<ReturnType<typeof completeFromCapture>>,
): string {
  if (result.kind === "completed") return result.orderId;
  if (result.kind === "alreadyCompleted") return result.orderId;
  throw new Error("Expected recovered checkout completion.");
}

function requireDate(value: Date | null, label: string): Date {
  if (value === null) throw new Error(`Expected ${label}.`);
  return value;
}

function requireFirst<T>(values: readonly T[], label: string): T {
  const first = values[0];
  if (first === undefined) throw new Error(`Expected ${label}.`);
  return first;
}

async function createOrderFixture(
  client: PrismaClient,
  options: OrderFixtureOptions = {},
): Promise<OrderFixture> {
  const { userId, promotionIdentity } = await resolveOrderPromotion(client, options);
  const promotion = promotionIdentity !== null;
  const promotionGrantId = optionalGrantId(promotionIdentity);
  await client.market.upsert({
    where: { code: "KR" },
    update: {},
    create: {
      code: "KR",
      currency: "KRW",
      shippableCountries: [ShippingCountry.KR],
      defaultLocale: "ko",
      isActive: true,
    },
  });
  const style = await client.wigStyle.create({
    data: {
      name: `Recovery style ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
      availableMarkets: { create: { marketCode: "KR", isActive: true } },
    },
  });
  const variant = await client.wigVariant.create({
    data: {
      wigStyleId: style.id,
      color: "Black",
      length: "Medium",
      curl: "Straight",
      price: 1_000,
      stock: 10,
      sku: `RECOVERY-${randomUUID()}`,
      fulfillmentType: FulfillmentType.MTO,
      marketPrices: { create: { marketCode: "KR", amount: 1_000 } },
    },
  });
  const discountAmount = promotion ? 300 : 0;
  const totalAmount = 3_000 - discountAmount;
  const session = await client.checkoutSession.create({
    data: {
      userId,
      marketCode: "KR",
      communicationLocale: "ko",
      promotionGrantId,
      currency: "KRW",
      status: CheckoutSessionStatus.COMPLETED,
      firstOrderPromotionClaimedAt: firstOrderClaimedAt(options.kind),
      subtotalAmount: 3_000,
      discountAmount,
      shippingAmount: 0,
      totalAmount,
      expiresAt: new Date(Date.now() + DAY_MS),
      completedAt: new Date(),
    },
  });
  const payment = await client.payment.create({
    data: {
      checkoutSessionId: session.id,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
      amount: totalAmount,
      currency: "KRW",
      idempotencyKey: `recovery-payment-${randomUUID()}`,
      providerPaymentKey: `recovery-provider-${randomUUID()}`,
      financialSucceededAt: new Date(),
      blockingEndedAt: new Date(),
    },
  });
  const order = await client.order.create({
    data: {
      ...(options.orderId === undefined ? {} : { id: options.orderId }),
      checkoutSessionId: session.id,
      paymentId: payment.id,
      userId,
      marketCode: "KR",
      promotionGrantId,
      currency: "KRW",
      subtotalAmount: 3_000,
      discountAmount,
      shippingAmount: 0,
      totalAmount,
      status: OrderStatus.PAID,
      paidAt: new Date(),
    },
  });
  const item = await client.orderItem.create({
    data: {
      orderId: order.id,
      variantId: variant.id,
      wigStyleId: style.id,
      quantity: 3,
      unitAmount: 1_000,
      discountAmount: lineDiscountAmount(promotion, options.lineDiscountAmount),
      fulfillmentType: FulfillmentType.MTO,
      snapshotData: { name: style.name },
      mr: manufacturingRequestData(options.cancellable),
    },
  });
  return {
    orderId: order.id,
    checkoutSessionId: session.id,
    userId,
    paymentId: payment.id,
    orderItemId: item.id,
    sourceGrantId: nullableGrantId(promotionIdentity),
    policyVersionId: nullablePolicyVersionId(promotionIdentity),
  };
}

async function splitCouponOrderIntoTwoLines(
  client: PrismaClient,
  fixture: OrderFixture,
): Promise<string> {
  await client.orderItem.update({
    where: { id: fixture.orderItemId },
    data: { quantity: 1, unitAmount: 2_000, discountAmount: 200 },
  });
  const style = await client.wigStyle.create({
    data: {
      name: `Coupon replay style ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
    },
  });
  const variant = await client.wigVariant.create({
    data: {
      wigStyleId: style.id,
      color: "Brown",
      length: "Short",
      curl: "Straight",
      price: 1_000,
      stock: 1,
      sku: `COUPON-REPLAY-${randomUUID()}`,
      fulfillmentType: FulfillmentType.MTO,
    },
  });
  const item = await client.orderItem.create({
    data: {
      orderId: fixture.orderId,
      variantId: variant.id,
      wigStyleId: style.id,
      quantity: 1,
      unitAmount: 1_000,
      discountAmount: 100,
      fulfillmentType: FulfillmentType.MTO,
      snapshotData: { name: style.name },
    },
  });
  return item.id;
}

function compareRefundLineIds(
  left: Readonly<{ orderItemId: string }>,
  right: Readonly<{ orderItemId: string }>,
): number {
  return left.orderItemId < right.orderItemId ? -1 : left.orderItemId > right.orderItemId ? 1 : 0;
}

async function resolveOrderPromotion(
  client: PrismaClient,
  options: OrderFixtureOptions,
): Promise<{ userId: string; promotionIdentity: PromotionIdentity | null }> {
  const existing = options.existingPromotion;
  if (existing !== undefined) return { userId: existing.userId, promotionIdentity: existing };
  const userId = `promo_recovery_user_${randomUUID()}`;
  await client.user.create({ data: { id: userId, email: `${userId}@example.test` } });
  if (options.promotion === false) return { userId, promotionIdentity: null };
  const promotionIdentity = await createPromotion(
    client,
    userId,
    options.kind ?? PromotionKind.BIRTHDAY,
    options,
  );
  return { userId, promotionIdentity };
}

function optionalGrantId(identity: PromotionIdentity | null): string | undefined {
  if (identity === null) return undefined;
  return identity.grantId;
}

function nullableGrantId(identity: PromotionIdentity | null): string | null {
  if (identity === null) return null;
  return identity.grantId;
}

function nullablePolicyVersionId(identity: PromotionIdentity | null): string | null {
  if (identity === null) return null;
  return identity.policyVersionId;
}

function firstOrderClaimedAt(kind: PromotionKind | undefined): Date | null {
  if (kind === PromotionKind.SIGNUP) return new Date();
  return null;
}

function lineDiscountAmount(promotion: boolean, override: number | undefined): number {
  if (!promotion) return 0;
  return override ?? 300;
}

function manufacturingRequestData(cancellable: boolean | undefined): { create: object } | undefined {
  if (cancellable === true) return { create: {} };
  return undefined;
}

async function markRefundAttemptSucceeded(
  client: PrismaClient,
  refundAttemptId: string,
  orderId: string,
): Promise<void> {
  const processedAt = new Date();
  const evidenceId = `recovery-cancel-success-${randomUUID()}`;
  const providerRefundId = `recovery-cancel-provider-${randomUUID()}`;
  await client.refundExecutionCommand.create({
    data: {
      refundAttemptId,
      status: RefundExecutionCommandStatus.DONE,
      evidence: {
        create: {
          id: evidenceId,
          source: RefundExecutionEvidenceSource.ADAPTER_RESPONSE,
          sourceDedupKey: `recovery-cancel-success-dedup-${randomUUID()}`,
          outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
          application: RefundExecutionEvidenceApplication.APPLIED,
          observedProviderRefundId: providerRefundId,
          reportedAmount: 2_700,
          reportedCurrency: "KRW",
          observedAt: processedAt,
        },
      },
    },
  });
  await client.refundAttempt.update({
    where: { id: refundAttemptId },
    data: { status: RefundAttemptStatus.SUCCEEDED, processedAt, providerRefundId },
  });
  await client.refundAttemptTransition.create({
    data: {
      refundAttemptId,
      fromStatus: RefundAttemptStatus.PROCESSING,
      toStatus: RefundAttemptStatus.SUCCEEDED,
      orderStatusBefore: OrderStatus.REFUND_PENDING,
      orderStatusAfter: OrderStatus.REFUNDED,
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      reason: EXECUTION_SUCCEEDED_TRANSITION_REASON,
      operationKey: buildRefundExecutionApplyOperationKey(evidenceId),
      createdAt: processedAt,
    },
  });
  await client.order.update({ where: { id: orderId }, data: { status: OrderStatus.REFUNDED } });
}

async function markRefundAttemptTerminalNonExecution(
  client: PrismaClient,
  refundAttemptId: string,
  orderId: string,
): Promise<void> {
  const failedAt = new Date();
  await client.refundExecutionCommand.create({
    data: {
      refundAttemptId,
      status: RefundExecutionCommandStatus.DONE,
      evidence: {
        create: {
          source: RefundExecutionEvidenceSource.OPERATOR,
          sourceDedupKey: `recovery-cancel-terminal-${randomUUID()}`,
          outcome: RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL,
          application: RefundExecutionEvidenceApplication.APPLIED,
          observedAt: failedAt,
        },
      },
    },
  });
  await client.refundAttempt.update({
    where: { id: refundAttemptId },
    data: { status: RefundAttemptStatus.FAILED_TERMINAL, failedAt },
  });
  await client.refundAttemptTransition.create({
    data: {
      refundAttemptId,
      fromStatus: RefundAttemptStatus.PROCESSING,
      toStatus: RefundAttemptStatus.FAILED_TERMINAL,
      orderStatusBefore: OrderStatus.REFUND_PENDING,
      orderStatusAfter: OrderStatus.PAID,
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      reason: "Confirmed terminal non-execution.",
      operationKey: `recovery-cancel-terminal-result-${randomUUID()}`,
      createdAt: failedAt,
    },
  });
  await client.order.update({ where: { id: orderId }, data: { status: OrderStatus.PAID } });
}

async function createRecoveredCheckoutSession(
  client: PrismaClient,
  userId: string,
  promotionGrantId: string,
  now: Date,
): Promise<{ sessionId: string; totalAmount: number }> {
  const style = await client.wigStyle.create({
    data: {
      name: `Recovered checkout ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
      availableMarkets: { create: { marketCode: "KR", isActive: true } },
    },
  });
  const variant = await client.wigVariant.create({
    data: {
      wigStyleId: style.id,
      color: "Black",
      length: "Medium",
      curl: "Straight",
      price: 1_000,
      stock: 10,
      sku: `RECOVERED-CHECKOUT-${randomUUID()}`,
      fulfillmentType: FulfillmentType.MTO,
      marketPrices: { create: { marketCode: "KR", amount: 1_000 } },
    },
  });
  const session = await client.checkoutSession.create({
    data: {
      userId,
      marketCode: "KR",
      communicationLocale: "ko",
      promotionGrantId,
      currency: "KRW",
      status: CheckoutSessionStatus.SUBMITTED,
      subtotalAmount: 3_000,
      discountAmount: 300,
      shippingAmount: 0,
      totalAmount: 2_700,
      expiresAt: new Date(now.getTime() + DAY_MS),
      lines: {
        create: {
          variantId: variant.id,
          wigStyleId: style.id,
          quantity: 3,
          unitAmount: 1_000,
          discountAmount: 300,
          fulfillmentType: FulfillmentType.MTO,
          snapshotData: { styleName: style.name },
        },
      },
      shipping: {
        create: {
          recipientName: "Recovery Buyer",
          phone: "010-1234-5678",
          country: ShippingCountry.KR,
          postalCode: "12345",
          administrativeArea: "서울특별시",
          city: "강남구",
          addressLine1: "테스트로 1",
        },
      },
    },
  });
  return { sessionId: session.id, totalAmount: session.totalAmount };
}

async function createPromotion(
  client: PrismaClient,
  userId: string,
  kind: PromotionKind,
  options: PromotionFixtureOptions = {},
): Promise<PromotionIdentity> {
  const now = new Date();
  const kindFields = promotionKindFields(kind);
  const policy = await client.promotionPolicyVersion.create({
    data: {
      programKey: `recovery-program-${randomUUID()}`,
      version: 1,
      kind,
      startsAt: new Date(now.getTime() - DAY_MS),
      endsAt: new Date(now.getTime() + 200 * DAY_MS),
      firstOrderOnly: kindFields.firstOrderOnly,
      requiresQualifyingPurchase: kindFields.requiresQualifyingPurchase,
      grantValidityDays: 120,
      recoveryGraceDays: recoveryGraceDays(options.recoveryGraceDays),
      birthdayWindowBeforeDays: kindFields.birthdayWindowDays,
      birthdayWindowAfterDays: kindFields.birthdayWindowDays,
      birthdayLeapDayObservation: kindFields.birthdayLeapDayObservation,
      marketRules: {
        create: {
          marketCode: "KR",
          currency: "KRW",
          rateBps: 1_000,
          maximumDiscountMinor: BigInt(100_000),
          minimumEligibleSubtotalMinor: null,
          eligibilityTimeZone: kindFields.eligibilityTimeZone,
        },
      },
    },
  });
  const policyStatus = options.policyStatus ?? PromotionPolicyStatus.ACTIVE;
  await transitionFixturePolicy(client, policy.id, policyStatus);
  const grant = await client.promotionGrant.create({
    data: {
      userId,
      policyVersionId: policy.id,
      grantKey: `recovery-source-${randomUUID()}`,
      originMarketCode: "KR",
      issuedAt: new Date(now.getTime() - DAY_MS),
      validFrom: new Date(now.getTime() - DAY_MS),
      expiresAt: sourceExpiry(now, options.sourceExpiresAfterDays),
      redeemedAt: now,
    },
  });
  return { userId, policyVersionId: policy.id, grantId: grant.id };
}

function promotionKindFields(kind: PromotionKind): Readonly<{
  firstOrderOnly: boolean;
  requiresQualifyingPurchase: boolean;
  birthdayWindowDays: number | null;
  birthdayLeapDayObservation: "FEB_28" | null;
  eligibilityTimeZone: string | null;
}> {
  const birthday = kind === PromotionKind.BIRTHDAY;
  return {
    firstOrderOnly: kind === PromotionKind.SIGNUP,
    requiresQualifyingPurchase: birthday,
    birthdayWindowDays: birthday ? 0 : null,
    birthdayLeapDayObservation: birthday ? "FEB_28" : null,
    eligibilityTimeZone: birthday ? "Asia/Seoul" : null,
  };
}

function recoveryGraceDays(value: number | null | undefined): number | null {
  if (value === undefined) return 30;
  return value;
}

function sourceExpiry(now: Date, days: number | null | undefined): Date | null {
  if (days === null) return null;
  return new Date(now.getTime() + (days ?? 100) * DAY_MS);
}

async function transitionFixturePolicy(
  client: PrismaClient,
  policyVersionId: string,
  status: PromotionPolicyStatus,
): Promise<void> {
  if (status === PromotionPolicyStatus.DRAFT) return;
  await client.promotionPolicyVersion.update({
    where: { id: policyVersionId },
    data: { status: PromotionPolicyStatus.ACTIVE },
  });
  if (status !== PromotionPolicyStatus.RETIRED) return;
  await client.promotionPolicyVersion.update({
    where: { id: policyVersionId },
    data: { status: PromotionPolicyStatus.RETIRED },
  });
}

async function seedSucceededRefund(
  client: PrismaClient,
  fixture: OrderFixture,
  options: Readonly<{
    ordinal: number;
    quantity: number;
    omitAllocation?: boolean;
    reportedAmount?: number;
    merchandiseRefundAmount?: number;
  }>,
): Promise<Date> {
  const processedAt = new Date(Date.now() - (10 - options.ordinal) * 1_000);
  const id = `recovery-refund-${randomUUID()}`;
  const amount = options.quantity * 900;
  const commandId = `recovery-command-${randomUUID()}`;
  const evidenceId = `recovery-evidence-${randomUUID()}`;
  const providerRefundId = `recovery-provider-refund-${randomUUID()}`;
  await client.refundAttempt.create({
    data: {
      id,
      orderId: fixture.orderId,
      paymentId: fixture.paymentId,
      amount,
      currency: "KRW",
      status: RefundAttemptStatus.SUCCEEDED,
      reason: "Verified successful merchandise refund",
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      providerRefundId,
      idempotencyKey: `recovery-refund-idempotency-${randomUUID()}`,
      requestedAt: new Date(processedAt.getTime() - 1_000),
      processedAt,
      executionCommand: {
        create: {
          id: commandId,
          status: RefundExecutionCommandStatus.DONE,
          evidence: {
            create: {
              id: evidenceId,
              source: RefundExecutionEvidenceSource.ADAPTER_RESPONSE,
              sourceDedupKey: `recovery-evidence-dedup-${randomUUID()}`,
              outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
              application: RefundExecutionEvidenceApplication.APPLIED,
              observedProviderRefundId: providerRefundId,
              reportedAmount: options.reportedAmount ?? amount,
              reportedCurrency: "KRW",
              observedAt: processedAt,
            },
          },
        },
      },
    },
  });
  await client.refundAttemptLine.create({
    data: {
      refundAttemptId: id,
      orderItemId: fixture.orderItemId,
      orderId: fixture.orderId,
      quantity: options.quantity,
      economicAllocation: options.omitAllocation
        ? undefined
        : { create: { merchandiseRefundAmount: options.merchandiseRefundAmount ?? amount } },
    },
  });
  await client.refundAttemptTransition.create({
    data: {
      refundAttemptId: id,
      fromStatus: RefundAttemptStatus.PROCESSING,
      toStatus: RefundAttemptStatus.SUCCEEDED,
      orderStatusBefore: OrderStatus.REFUND_PENDING,
      orderStatusAfter: options.ordinal === 3 || options.quantity === 3
        ? OrderStatus.REFUNDED
        : OrderStatus.PARTIALLY_REFUNDED,
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      reason: EXECUTION_SUCCEEDED_TRANSITION_REASON,
      operationKey: buildRefundExecutionApplyOperationKey(evidenceId),
      createdAt: processedAt,
    },
  });
  return processedAt;
}

async function seedNonSuccessAttempt(
  client: PrismaClient,
  fixture: OrderFixture,
  status: RefundAttemptStatus,
): Promise<void> {
  const id = `recovery-noise-${randomUUID()}`;
  await client.refundAttempt.create({
    data: {
      id,
      orderId: fixture.orderId,
      paymentId: fixture.paymentId,
      amount: 100,
      currency: "KRW",
      status,
      reason: "Non-success evidence",
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      idempotencyKey: `recovery-noise-idempotency-${randomUUID()}`,
      requestedAt: new Date(),
      failedAt: status === RefundAttemptStatus.FAILED_TERMINAL ? new Date() : null,
      lines: {
        create: {
          quantity: 1,
          orderItem: {
            connect: { id_orderId: { id: fixture.orderItemId, orderId: fixture.orderId } },
          },
        },
      },
    },
  });
}

async function fullyRefundedFixture(
  client: PrismaClient,
  options: OrderFixtureOptions = {},
): Promise<OrderFixture> {
  const fixture = await createOrderFixture(client, options);
  await seedSucceededRefund(client, fixture, { ordinal: 1, quantity: 3 });
  return fixture;
}

function stableRecoveryOrderId(scope: string, ordinal: number): string {
  return `r4-${scope}-${ordinal.toString().padStart(3, "0")}`;
}

interface IsolatedRecoveryDatabase {
  readonly admin: Client;
  readonly client: PrismaClient;
  readonly connectionString: string;
  readonly schema: string;
}

async function withIsolatedRecoveryDatabase(
  run: (database: IsolatedRecoveryDatabase) => Promise<void>,
): Promise<void> {
  const connectionString = disposableDatabaseUrl();
  const schema = `promo_recovery_r4_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString });
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await admin.query(`SET search_path TO "${schema}"`);
  await applyRepositoryMigrations(admin);
  const client = isolatedPrismaClient(connectionString, schema);
  try {
    await client.market.create({
      data: {
        code: "KR",
        currency: "KRW",
        shippableCountries: [ShippingCountry.KR],
        defaultLocale: "ko",
        isActive: true,
      },
    });
    await run({ admin, client, connectionString, schema });
  } finally {
    await client.$disconnect();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}

async function waitForCheckpointClaimWaiters(
  admin: Client,
  expectedCount: number,
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const waiting = await admin.query<{ count: number }>(`
      SELECT COUNT(*)::integer AS "count"
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
        AND query LIKE '%PromotionRecoveryReconciliationCheckpoint%'
    `);
    if ((waiting.rows[0]?.count ?? 0) >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("EXPECTED_CHECKPOINT_CLAIM_WAITERS");
}

async function rollbackQuietly(client: Client): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    return;
  }
}

async function applyRepositoryMigrations(client: Client): Promise<void> {
  const root = join(process.cwd(), "prisma/migrations");
  const entries = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name < right.name ? -1 : 1);
  for (const entry of entries) {
    const sql = await readFile(join(root, entry.name, "migration.sql"), "utf8");
    const enumSafeSql = sql.includes("ALTER TYPE") && sql.includes("ADD VALUE")
      ? `BEGIN;\n${sql.replace(
          /ALTER TYPE[^;]+ADD VALUE[^;]+;/gu,
          (statement) => `${statement}\nCOMMIT;\nBEGIN;`,
        )}\nCOMMIT;`
      : sql;
    await client.query(enumSafeSql);
  }
}

function isolatedPrismaClient(connectionString: string, schema: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg(
      { connectionString, options: `-c timezone=UTC -c search_path=${schema}` },
      { schema },
    ),
  });
}

function disposableDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required for promotion recovery tests.");
  const parsed = new URL(value);
  if (!(["127.0.0.1", "localhost"].includes(parsed.hostname))
    || parsed.pathname.replace(/^\//u, "") !== "wig_platform_test") {
    throw new Error("Promotion recovery tests require the disposable local database.");
  }
  return value;
}
