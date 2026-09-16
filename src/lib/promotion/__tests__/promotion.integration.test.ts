import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createPrismaPg } from "../../database/prisma-pg";
import {
  BirthdayLeapDayObservation,
  CheckoutSessionStatus,
  OrderStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  PrismaClient,
  PromotionKind,
  PromotionPolicyStatus,
  ShippingCountry,
} from "@prisma/client";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { PromotionError } from "../errors";
import {
  issueBirthdayPromotionGrant,
  issueSignupPromotionGrant,
} from "../grants";
import { activatePromotionPolicyVersion } from "../policy";
import { setCustomerBirthday } from "../profile";

const NOW = new Date("2026-08-28T12:00:00.000Z");

interface Fixture {
  readonly suffix: string;
  readonly userId: string;
  readonly programKey: string;
}

describe("PROMO-C0 durable foundation", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    const suffix = randomUUID();
    fixture = {
      suffix,
      userId: `promo_user_${suffix}`,
      programKey: `promo_program_${suffix}`,
    };
    await db.market.upsert({
      where: { code: "US" },
      update: {
        currency: "USD",
        shippableCountries: [ShippingCountry.US],
        defaultLocale: "en",
        isActive: true,
      },
      create: {
        code: "US",
        currency: "USD",
        shippableCountries: [ShippingCountry.US],
        defaultLocale: "en",
        isActive: true,
      },
    });
    await db.market.upsert({
      where: { code: "JP" },
      update: {
        currency: "JPY",
        shippableCountries: [ShippingCountry.JP],
        defaultLocale: "ja",
        isActive: true,
      },
      create: {
        code: "JP",
        currency: "JPY",
        shippableCountries: [ShippingCountry.JP],
        defaultLocale: "ja",
        isActive: true,
      },
    });
    await createUser(fixture.userId, false);
  });

  afterEach(async () => {
    await cleanupFixture(fixture);
  });

  describe("birthday profile", () => {
    it("sets an ordinary birthday, replays exactly, and persists no birth year", async () => {
      const created = await setCustomerBirthday(db, birthdayInput(fixture, 8, 28));
      const replayed = await setCustomerBirthday(
        db,
        birthdayInput(fixture, 8, 28, new Date(NOW.getTime() + 10_000)),
      );
      expect(replayed).toEqual(created);
      const columns = await db.$queryRaw<{ column_name: string }[]>(Prisma.sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'CustomerBenefitProfile'
      `);
      expect(columns).not.toContainEqual({ column_name: "birthYear" });
    });

    it("accepts Feb 29 and rejects impossible, bounded, and partial dates", async () => {
      await expect(setCustomerBirthday(db, birthdayInput(fixture, 2, 29))).resolves.toMatchObject({
        birthdayMonth: 2,
        birthdayDay: 29,
      });
      await createUser(`promo_user_invalid_${fixture.suffix}`, false);
      await expectPromotionCode(setCustomerBirthday(db, {
        ...birthdayInput(fixture, 4, 31),
        userId: `promo_user_invalid_${fixture.suffix}`,
      }), "BIRTHDAY_DATE_INVALID");
      await expectPromotionCode(setCustomerBirthday(db, {
        ...birthdayInput(fixture, 1, 1),
        userId: `promo_user_invalid_${fixture.suffix}`,
        birthdayDay: null,
      }), "BIRTHDAY_DATE_INVALID");
    });

    it("requires support for a changed birthday", async () => {
      await setCustomerBirthday(db, birthdayInput(fixture, 8, 28));
      await expectPromotionCode(
        setCustomerBirthday(db, birthdayInput(fixture, 8, 29)),
        "BIRTHDAY_CHANGE_REQUIRES_SUPPORT",
      );
    });
  });

  describe("policy activation", () => {
    it("atomically activates signup and birthday policy shapes", async () => {
      const signup = await createPolicy(fixture, PromotionKind.SIGNUP, 1);
      const activatedSignup = await activatePromotionPolicyVersion(db, signup.id);
      expect(activatedSignup.status).toBe(PromotionPolicyStatus.ACTIVE);

      const birthdayFixture = { ...fixture, programKey: `${fixture.programKey}_birthday` };
      const birthday = await createPolicy(birthdayFixture, PromotionKind.BIRTHDAY, 1);
      const activatedBirthday = await activatePromotionPolicyVersion(db, birthday.id);
      expect(activatedBirthday).toMatchObject({
        status: PromotionPolicyStatus.ACTIVE,
        requiresQualifyingPurchase: true,
        birthdayLeapDayObservation: BirthdayLeapDayObservation.FEB_28,
      });
    });

    it("retires the previous version and concurrent activation leaves one ACTIVE version", async () => {
      const first = await createPolicy(fixture, PromotionKind.SIGNUP, 1);
      const second = await createPolicy(fixture, PromotionKind.SIGNUP, 2);
      const results = await Promise.allSettled([
        activatePromotionPolicyVersion(db, first.id),
        activatePromotionPolicyVersion(db, second.id),
      ]);
      expect(results[0]?.status === "fulfilled" || results[1]?.status === "fulfilled").toBe(true);
      expect(await db.promotionPolicyVersion.count({
        where: { programKey: fixture.programKey, status: PromotionPolicyStatus.ACTIVE },
      })).toBe(1);
    });

    it("rejects no-rule activation and DB-invalid draft economics", async () => {
      const noRule = await db.promotionPolicyVersion.create({
        data: draftPolicyData(fixture, PromotionKind.SIGNUP, 1),
      });
      await expectPromotionCode(
        activatePromotionPolicyVersion(db, noRule.id),
        "POLICY_ACTIVATION_INVALID",
      );
      await expect(db.promotionPolicyVersion.create({
        data: { ...draftPolicyData(fixture, PromotionKind.SIGNUP, 0), version: 0 },
      })).rejects.toBeDefined();
      await expect(db.promotionMarketRule.create({
        data: {
          policyVersionId: noRule.id,
          marketCode: "US",
          currency: "USD",
          rateBps: 0,
          maximumDiscountMinor: BigInt(1),
        },
      })).rejects.toBeDefined();
    });

    it("makes active policy and rule economics immutable", async () => {
      const policy = await createAndActivatePolicy(fixture, PromotionKind.SIGNUP, 1);
      await expect(db.promotionPolicyVersion.update({
        where: { id: policy.id },
        data: { startsAt: new Date("2025-01-01T00:00:00.000Z") },
      })).rejects.toBeDefined();
      await expect(db.promotionMarketRule.update({
        where: {
          policyVersionId_marketCode: { policyVersionId: policy.id, marketCode: "US" },
        },
        data: { rateBps: 999 },
      })).rejects.toBeDefined();
      await expect(db.promotionPolicyVersion.update({
        where: { id: policy.id },
        data: { status: PromotionPolicyStatus.DRAFT },
      })).rejects.toBeDefined();
      await expect(db.promotionPolicyVersion.create({
        data: {
          ...draftPolicyData({ ...fixture, programKey: `${fixture.programKey}_direct` }, PromotionKind.SIGNUP, 1),
          status: PromotionPolicyStatus.ACTIVE,
        },
      })).rejects.toBeDefined();
    });

    it("rejects reparenting a Market rule between policy versions", async () => {
      const first = await createPolicy(fixture, PromotionKind.SIGNUP, 1);
      const second = await createPolicy(fixture, PromotionKind.SIGNUP, 2);
      await expect(db.promotionMarketRule.update({
        where: {
          policyVersionId_marketCode: { policyVersionId: first.id, marketCode: "US" },
        },
        data: { policyVersionId: second.id },
      })).rejects.toThrow("Promotion Market rule policy version is immutable");
    });

    it("blocks an invalid rule update across activation and rejects it after ACTIVE commits", async () => {
      const policy = await createPolicy(fixture, PromotionKind.BIRTHDAY, 1);
      const activationClient = createNamedPrismaClient(`promo_activation_${fixture.suffix}`);
      const barrier = await createRawClient(`promo_barrier_${fixture.suffix}`);
      const mutator = await createRawClient(`promo_mutator_${fixture.suffix}`);
      const observer = await createRawClient(`promo_observer_${fixture.suffix}`);
      try {
        await barrier.query("BEGIN");
        await barrier.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [fixture.programKey],
        );
        const activation = activatePromotionPolicyVersion(activationClient, policy.id);
        await waitForLockWait(observer, `promo_activation_${fixture.suffix}`);

        const mutation = mutator.query(`
          UPDATE "PromotionMarketRule"
          SET "currency" = 'JPY', "eligibilityTimeZone" = 'not/a-zone'
          WHERE "policyVersionId" = $1 AND "marketCode" = 'US'
        `, [policy.id]);
        await waitForLockWait(observer, `promo_mutator_${fixture.suffix}`);

        await barrier.query("COMMIT");
        await expect(activation).resolves.toMatchObject({ status: PromotionPolicyStatus.ACTIVE });
        await expect(mutation).rejects.toThrow(
          "Promotion Market rules are immutable after policy activation or use",
        );
        await expect(db.promotionMarketRule.findUniqueOrThrow({
          where: {
            policyVersionId_marketCode: { policyVersionId: policy.id, marketCode: "US" },
          },
        })).resolves.toMatchObject({ currency: "USD", eligibilityTimeZone: "America/New_York" });
      } finally {
        await rollbackQuietly(barrier);
        await rollbackQuietly(mutator);
        await Promise.all([
          activationClient.$disconnect(), barrier.end(), mutator.end(), observer.end(),
        ]);
      }
    });

    it("makes activation wait and validate the final committed rule mutation", async () => {
      const policy = await createPolicy(fixture, PromotionKind.BIRTHDAY, 1);
      const activationClient = createNamedPrismaClient(`promo_activation_${fixture.suffix}`);
      const mutator = await createRawClient(`promo_mutator_${fixture.suffix}`);
      const observer = await createRawClient(`promo_observer_${fixture.suffix}`);
      try {
        await mutator.query("BEGIN");
        await mutator.query(`
          UPDATE "PromotionMarketRule"
          SET "currency" = 'JPY', "eligibilityTimeZone" = 'not/a-zone'
          WHERE "policyVersionId" = $1 AND "marketCode" = 'US'
        `, [policy.id]);

        const activation = activatePromotionPolicyVersion(activationClient, policy.id);
        await waitForLockWait(observer, `promo_activation_${fixture.suffix}`);
        await mutator.query("COMMIT");

        await expectPromotionCode(activation, "POLICY_ACTIVATION_INVALID");
        await expect(db.promotionPolicyVersion.findUniqueOrThrow({
          where: { id: policy.id },
        })).resolves.toMatchObject({ status: PromotionPolicyStatus.DRAFT });
        await expect(db.promotionMarketRule.findUniqueOrThrow({
          where: {
            policyVersionId_marketCode: { policyVersionId: policy.id, marketCode: "US" },
          },
        })).resolves.toMatchObject({ currency: "JPY", eligibilityTimeZone: "not/a-zone" });
      } finally {
        await rollbackQuietly(mutator);
        await Promise.all([activationClient.$disconnect(), mutator.end(), observer.end()]);
      }
    });

    it.each(["INSERT", "DELETE"] as const)(
      "serializes %s rule mutation on the parent policy row",
      async (mutationKind) => {
        const policy = await createPolicy(fixture, PromotionKind.SIGNUP, 1);
        const owner = await createRawClient(`promo_owner_${fixture.suffix}`);
        const contender = await createRawClient(`promo_contender_${fixture.suffix}`);
        try {
          await owner.query("BEGIN");
          await owner.query(
            `SELECT "id" FROM "PromotionPolicyVersion" WHERE "id" = $1 FOR UPDATE`,
            [policy.id],
          );
          await contender.query("BEGIN");
          await contender.query("SET LOCAL lock_timeout = '250ms'");
          const mutation = mutationKind === "INSERT"
            ? contender.query(`
                INSERT INTO "PromotionMarketRule" (
                  "id", "policyVersionId", "marketCode", "currency", "rateBps",
                  "maximumDiscountMinor", "minimumEligibleSubtotalMinor", "eligibilityTimeZone"
                ) VALUES ($1, $2, 'JP', 'JPY', 500, 3000, NULL, NULL)
              `, [`promo_rule_${fixture.suffix}`, policy.id])
            : contender.query(`
                DELETE FROM "PromotionMarketRule"
                WHERE "policyVersionId" = $1 AND "marketCode" = 'US'
              `, [policy.id]);
          await expect(mutation).rejects.toMatchObject({ code: "55P03" });
        } finally {
          await rollbackQuietly(contender);
          await rollbackQuietly(owner);
          await Promise.all([owner.end(), contender.end()]);
        }
      },
    );
  });

  describe("signup grant", () => {
    it("rejects unverified users and users with a prior completed purchase", async () => {
      await createAndActivatePolicy(fixture, PromotionKind.SIGNUP, 1);
      await expectPromotionCode(issueSignupPromotionGrant(db, issueInput(fixture)), "SIGNUP_EMAIL_NOT_VERIFIED");
      await verifyUser(fixture.userId);
      await createCompletedOrder(fixture, OrderStatus.PAID);
      await expectPromotionCode(issueSignupPromotionGrant(db, issueInput(fixture)), "SIGNUP_PRIOR_PURCHASE_EXISTS");
    });

    it("issues once, replays, and converges under concurrency", async () => {
      await verifyUser(fixture.userId);
      await createAndActivatePolicy(fixture, PromotionKind.SIGNUP, 1);
      const [first, second] = await Promise.all([
        issueSignupPromotionGrant(db, issueInput(fixture)),
        issueSignupPromotionGrant(db, issueInput(fixture)),
      ]);
      expect(second.id).toBe(first.id);
      expect(await db.promotionGrant.count({ where: { userId: fixture.userId } })).toBe(1);
      await expect(issueSignupPromotionGrant(db, issueInput(fixture))).resolves.toEqual(first);
    });

    it("keeps signup grant identity program-scoped before contact consumption", async () => {
      await verifyUser(fixture.userId);
      const secondProgram = { ...fixture, programKey: `${fixture.programKey}_second` };
      await createAndActivatePolicy(fixture, PromotionKind.SIGNUP, 1);
      await createAndActivatePolicy(secondProgram, PromotionKind.SIGNUP, 1);

      const first = await issueSignupPromotionGrant(db, issueInput(fixture));
      const second = await issueSignupPromotionGrant(db, issueInput(secondProgram));

      expect(first.id).not.toBe(second.id);
      expect(first.grantKey).toBe(`signup:${fixture.programKey}:${fixture.userId}`);
      expect(second.grantKey).toBe(`signup:${secondProgram.programKey}:${fixture.userId}`);
      await expect(db.promotionGrant.count({ where: { userId: fixture.userId } })).resolves.toBe(2);
    });

    it("rejects missing effective policy and missing requested Market rule", async () => {
      await verifyUser(fixture.userId);
      await expectPromotionCode(issueSignupPromotionGrant(db, issueInput(fixture)), "NO_EFFECTIVE_POLICY");
      await createAndActivatePolicy(fixture, PromotionKind.SIGNUP, 1);
      await expectPromotionCode(issueSignupPromotionGrant(db, {
        ...issueInput(fixture),
        marketCode: "JP",
      }), "MARKET_RULE_NOT_FOUND");
    });

    it("does not issue a second signup grant after policy rollover", async () => {
      await verifyUser(fixture.userId);
      await createAndActivatePolicy(fixture, PromotionKind.SIGNUP, 1);
      const first = await issueSignupPromotionGrant(db, issueInput(fixture));
      await createAndActivatePolicy(fixture, PromotionKind.SIGNUP, 2);
      const replay = await issueSignupPromotionGrant(db, issueInput(fixture));
      expect(replay.id).toBe(first.id);
      expect(replay.policyVersionId).toBe(first.policyVersionId);
    });

    it.each([
      "wrong user",
      "wrong program",
      "wrong kind",
      "non-null benefit year",
    ] as const)("fails closed for a same-key signup grant with %s", async (conflict) => {
      await verifyUser(fixture.userId);
      const active = await createAndActivatePolicy(fixture, PromotionKind.SIGNUP, 1);
      const conflictingUserId = conflict === "wrong user"
        ? await createConflictUser(fixture)
        : fixture.userId;
      const conflictingPolicyId = await conflictingPolicyForSignup(fixture, active.id, conflict);
      await createGrantWithReplicationBypass({
        id: `promo_conflict_${fixture.suffix}`,
        userId: conflictingUserId,
        policyVersionId: conflictingPolicyId,
        grantKey: `signup:${fixture.programKey}:${fixture.userId}`,
        benefitYear: conflict === "non-null benefit year" ? 2026 : null,
      });

      await expectPromotionCode(
        issueSignupPromotionGrant(db, issueInput(fixture)),
        "PROMOTION_GRANT_IDENTITY_CONFLICT",
      );
    });

    it("validates signup identity after a real P2002 convergence re-read", async () => {
      await verifyUser(fixture.userId);
      const active = await createAndActivatePolicy(fixture, PromotionKind.SIGNUP, 1);
      const collisionClient = withGrantCreateCollision(grantCollision({
        id: `promo_p2002_${fixture.suffix}`,
        userId: fixture.userId,
        policyVersionId: active.id,
        grantKey: `signup:${fixture.programKey}:${fixture.userId}`,
        benefitYear: null,
      }));

      const replay = await issueSignupPromotionGrant(collisionClient, issueInput(fixture));
      expect(replay).toMatchObject({
        id: `promo_p2002_${fixture.suffix}`,
        userId: fixture.userId,
        policyVersionId: active.id,
      });
    });

    it("rejects conflicting signup identity after a real P2002 re-read", async () => {
      await verifyUser(fixture.userId);
      const active = await createAndActivatePolicy(fixture, PromotionKind.SIGNUP, 1);
      const otherUserId = await createConflictUser(fixture);
      const collisionClient = withGrantCreateCollision(grantCollision({
        id: `promo_p2002_conflict_${fixture.suffix}`,
        userId: otherUserId,
        policyVersionId: active.id,
        grantKey: `signup:${fixture.programKey}:${fixture.userId}`,
        benefitYear: null,
      }));

      await expectPromotionCode(
        issueSignupPromotionGrant(collisionClient, issueInput(fixture)),
        "PROMOTION_GRANT_IDENTITY_CONFLICT",
      );
    });
  });

  describe("birthday grant", () => {
    it("requires birthday, qualifying purchase, and the current window", async () => {
      const birthdayFixture = birthdayProgram(fixture);
      await createAndActivatePolicy(birthdayFixture, PromotionKind.BIRTHDAY, 1);
      await expectPromotionCode(issueBirthdayPromotionGrant(db, issueInput(birthdayFixture)), "BIRTHDAY_NOT_SET");
      await setCustomerBirthday(db, birthdayInput(fixture, 8, 28));
      await expectPromotionCode(
        issueBirthdayPromotionGrant(db, issueInput(birthdayFixture)),
        "QUALIFYING_PURCHASE_REQUIRED",
      );
      await createCompletedOrder(fixture, OrderStatus.PAID);
      await expectPromotionCode(issueBirthdayPromotionGrant(db, {
        ...issueInput(birthdayFixture),
        now: new Date("2026-10-01T12:00:00.000Z"),
      }), "BIRTHDAY_OUTSIDE_WINDOW");
    });

    it("issues once, converges concurrently, and survives same-year rollover", async () => {
      const birthdayFixture = birthdayProgram(fixture);
      await setCustomerBirthday(db, birthdayInput(fixture, 8, 28));
      await createCompletedOrder(fixture, OrderStatus.PAID);
      await createAndActivatePolicy(birthdayFixture, PromotionKind.BIRTHDAY, 1);
      const [first, second] = await Promise.all([
        issueBirthdayPromotionGrant(db, issueInput(birthdayFixture)),
        issueBirthdayPromotionGrant(db, issueInput(birthdayFixture)),
      ]);
      expect(second.id).toBe(first.id);
      expect(first.benefitYear).toBe(2026);
      await createAndActivatePolicy(birthdayFixture, PromotionKind.BIRTHDAY, 2);
      const replay = await issueBirthdayPromotionGrant(db, issueInput(birthdayFixture));
      expect(replay.id).toBe(first.id);
    });

    it("issues a distinct next-benefit-year grant", async () => {
      const birthdayFixture = birthdayProgram(fixture);
      await setCustomerBirthday(db, birthdayInput(fixture, 8, 28));
      await createCompletedOrder(fixture, OrderStatus.PAID);
      await createAndActivatePolicy(birthdayFixture, PromotionKind.BIRTHDAY, 1, {
        startsAt: new Date("2026-01-01T00:00:00.000Z"),
        endsAt: new Date("2028-01-01T00:00:00.000Z"),
      });
      const first = await issueBirthdayPromotionGrant(db, issueInput(birthdayFixture));
      const next = await issueBirthdayPromotionGrant(db, {
        ...issueInput(birthdayFixture),
        now: new Date("2027-08-28T12:00:00.000Z"),
      });
      expect(next.benefitYear).toBe(2027);
      expect(next.id).not.toBe(first.id);
    });

    it("excludes a fully-refunded-only customer from qualifying", async () => {
      const birthdayFixture = birthdayProgram(fixture);
      await setCustomerBirthday(db, birthdayInput(fixture, 8, 28));
      await createCompletedOrder(fixture, OrderStatus.REFUNDED);
      await createAndActivatePolicy(birthdayFixture, PromotionKind.BIRTHDAY, 1);
      await expectPromotionCode(
        issueBirthdayPromotionGrant(db, issueInput(birthdayFixture)),
        "QUALIFYING_PURCHASE_REQUIRED",
      );
    });

    it.each([
      "wrong user",
      "wrong program",
      "wrong kind",
      "wrong benefit year",
    ] as const)("fails closed for a same-key birthday grant with %s", async (conflict) => {
      const birthdayFixture = birthdayProgram(fixture);
      await setCustomerBirthday(db, birthdayInput(fixture, 8, 28));
      await createCompletedOrder(fixture, OrderStatus.PAID);
      const active = await createAndActivatePolicy(birthdayFixture, PromotionKind.BIRTHDAY, 1);
      const conflictingUserId = conflict === "wrong user"
        ? await createConflictUser(fixture)
        : fixture.userId;
      const conflictingPolicyId = await conflictingPolicyForBirthday(
        birthdayFixture,
        active.id,
        conflict,
      );
      await createGrantWithReplicationBypass({
        id: `promo_conflict_${fixture.suffix}`,
        userId: conflictingUserId,
        policyVersionId: conflictingPolicyId,
        grantKey: `birthday:${birthdayFixture.programKey}:${fixture.userId}:2026`,
        benefitYear: conflict === "wrong benefit year" ? 2025 : 2026,
      });

      await expectPromotionCode(
        issueBirthdayPromotionGrant(db, issueInput(birthdayFixture)),
        "PROMOTION_GRANT_IDENTITY_CONFLICT",
      );
    });

    it("validates birthday identity after a real P2002 convergence re-read", async () => {
      const birthdayFixture = birthdayProgram(fixture);
      await setCustomerBirthday(db, birthdayInput(fixture, 8, 28));
      await createCompletedOrder(fixture, OrderStatus.PAID);
      const active = await createAndActivatePolicy(birthdayFixture, PromotionKind.BIRTHDAY, 1);
      const collisionClient = withGrantCreateCollision(grantCollision({
        id: `promo_p2002_${fixture.suffix}`,
        userId: fixture.userId,
        policyVersionId: active.id,
        grantKey: `birthday:${birthdayFixture.programKey}:${fixture.userId}:2026`,
        benefitYear: 2026,
      }));

      const replay = await issueBirthdayPromotionGrant(
        collisionClient,
        issueInput(birthdayFixture),
      );
      expect(replay).toMatchObject({
        id: `promo_p2002_${fixture.suffix}`,
        userId: fixture.userId,
        policyVersionId: active.id,
        benefitYear: 2026,
      });
    });

    it("rejects conflicting birthday identity after a real P2002 re-read", async () => {
      const birthdayFixture = birthdayProgram(fixture);
      await setCustomerBirthday(db, birthdayInput(fixture, 8, 28));
      await createCompletedOrder(fixture, OrderStatus.PAID);
      const active = await createAndActivatePolicy(birthdayFixture, PromotionKind.BIRTHDAY, 1);
      const otherUserId = await createConflictUser(fixture);
      const collisionClient = withGrantCreateCollision(grantCollision({
        id: `promo_p2002_conflict_${fixture.suffix}`,
        userId: otherUserId,
        policyVersionId: active.id,
        grantKey: `birthday:${birthdayFixture.programKey}:${fixture.userId}:2026`,
        benefitYear: 2026,
      }));

      await expectPromotionCode(
        issueBirthdayPromotionGrant(collisionClient, issueInput(birthdayFixture)),
        "PROMOTION_GRANT_IDENTITY_CONFLICT",
      );
    });
  });
});

function birthdayProgram(fixture: Fixture): Fixture {
  return { ...fixture, programKey: `${fixture.programKey}_birthday` };
}

function birthdayInput(
  fixture: Fixture,
  birthdayMonth: number,
  birthdayDay: number,
  now = NOW,
) {
  return { userId: fixture.userId, birthdayMonth, birthdayDay, now };
}

function issueInput(fixture: Fixture) {
  return { userId: fixture.userId, programKey: fixture.programKey, marketCode: "US", now: NOW };
}

async function createUser(userId: string, verified: boolean): Promise<void> {
  await db.user.create({
    data: {
      id: userId,
      email: `${userId}@example.test`,
      emailVerified: verified ? NOW : null,
    },
  });
}

async function verifyUser(userId: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { emailVerified: NOW } });
}

interface PolicyOverrides {
  readonly startsAt?: Date;
  readonly endsAt?: Date;
}

async function createPolicy(
  fixture: Fixture,
  kind: PromotionKind,
  version: number,
  overrides: PolicyOverrides = {},
) {
  return db.promotionPolicyVersion.create({
    data: {
      ...draftPolicyData(fixture, kind, version),
      ...overrides,
      marketRules: {
        create: {
          marketCode: "US",
          currency: "USD",
          rateBps: 500,
          maximumDiscountMinor: BigInt(3_000),
          minimumEligibleSubtotalMinor: null,
          eligibilityTimeZone: kind === PromotionKind.BIRTHDAY ? "America/New_York" : null,
        },
      },
    },
  });
}

function draftPolicyData(fixture: Fixture, kind: PromotionKind, version: number) {
  const birthday = kind === PromotionKind.BIRTHDAY;
  return {
    programKey: fixture.programKey,
    version,
    kind,
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: new Date("2027-01-01T00:00:00.000Z"),
    firstOrderOnly: kind === PromotionKind.SIGNUP,
    requiresQualifyingPurchase: birthday,
    birthdayWindowBeforeDays: birthday ? 0 : null,
    birthdayWindowAfterDays: birthday ? 0 : null,
    birthdayLeapDayObservation: birthday ? BirthdayLeapDayObservation.FEB_28 : null,
  };
}

async function createAndActivatePolicy(
  fixture: Fixture,
  kind: PromotionKind,
  version: number,
  overrides: PolicyOverrides = {},
) {
  const policy = await createPolicy(fixture, kind, version, overrides);
  return activatePromotionPolicyVersion(db, policy.id);
}

async function createCompletedOrder(fixture: Fixture, status: OrderStatus): Promise<void> {
  const id = randomUUID();
  const session = await db.checkoutSession.create({
    data: {
      id: `promo_session_${id}`,
      userId: fixture.userId,
      marketCode: "US",
      currency: "USD",
      status: CheckoutSessionStatus.COMPLETED,
      subtotalAmount: 10_000,
      shippingAmount: 0,
      totalAmount: 10_000,
      expiresAt: new Date(NOW.getTime() + 60_000),
      completedAt: NOW,
    },
  });
  const payment = await db.payment.create({
    data: {
      id: `promo_payment_${id}`,
      checkoutSessionId: session.id,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
      amount: 10_000,
      currency: "USD",
      providerPaymentKey: `promo_provider_${id}`,
      idempotencyKey: `promo_idempotency_${id}`,
      financialSucceededAt: NOW,
      blockingEndedAt: NOW,
    },
  });
  await db.order.create({
    data: {
      id: `promo_order_${id}`,
      checkoutSessionId: session.id,
      paymentId: payment.id,
      userId: fixture.userId,
      marketCode: "US",
      currency: "USD",
      subtotalAmount: 10_000,
      shippingAmount: 0,
      totalAmount: 10_000,
      status,
      paidAt: NOW,
    },
  });
}

async function expectPromotionCode(
  promise: Promise<unknown>,
  code: PromotionError["code"],
): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

async function createConflictUser(fixture: Fixture): Promise<string> {
  const userId = `promo_user_conflict_${fixture.suffix}`;
  await createUser(userId, true);
  return userId;
}

async function conflictingPolicyForSignup(
  fixture: Fixture,
  activePolicyId: string,
  conflict: "wrong user" | "wrong program" | "wrong kind" | "non-null benefit year",
): Promise<string> {
  if (conflict === "wrong program") {
    return (await createPolicy(
      { ...fixture, programKey: `${fixture.programKey}_foreign` },
      PromotionKind.SIGNUP,
      1,
    )).id;
  }
  if (conflict === "wrong kind") {
    return (await createPolicy(fixture, PromotionKind.BIRTHDAY, 2)).id;
  }
  return activePolicyId;
}

async function conflictingPolicyForBirthday(
  fixture: Fixture,
  activePolicyId: string,
  conflict: "wrong user" | "wrong program" | "wrong kind" | "wrong benefit year",
): Promise<string> {
  if (conflict === "wrong program") {
    return (await createPolicy(
      { ...fixture, programKey: `${fixture.programKey}_foreign` },
      PromotionKind.BIRTHDAY,
      1,
    )).id;
  }
  if (conflict === "wrong kind") {
    return (await createPolicy(fixture, PromotionKind.SIGNUP, 2)).id;
  }
  return activePolicyId;
}

interface SeedGrantInput {
  readonly id: string;
  readonly userId: string;
  readonly policyVersionId: string;
  readonly grantKey: string;
  readonly benefitYear: number | null;
}

async function createGrantWithReplicationBypass(input: SeedGrantInput): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SET LOCAL session_replication_role = replica`);
    await tx.promotionGrant.create({
      data: {
        ...input,
        issuedAt: NOW,
        validFrom: NOW,
      },
    });
  });
}

function grantCollision(input: SeedGrantInput): () => Promise<void> {
  return () => createGrantWithReplicationBypass(input);
}

function withGrantCreateCollision(collision: () => Promise<void>): PrismaClient {
  let injected = false;
  return new Proxy(db, {
    get(target, property, receiver) {
      if (property !== "$transaction") {
        // Prisma's generated client has no type-safe generic property-forwarding API.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return Reflect.get(target, property, receiver);
      }
      return async <Result>(operation: (tx: Prisma.TransactionClient) => Promise<Result>) => (
        target.$transaction(async (tx) => {
          const promotionGrant = new Proxy(tx.promotionGrant, {
            get(delegate, delegateProperty, delegateReceiver) {
              if (delegateProperty !== "create") {
                // Prisma delegates likewise require dynamic forwarding for non-create methods.
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                return Reflect.get(delegate, delegateProperty, delegateReceiver);
              }
              return async (...parameters: Parameters<typeof delegate.create>) => {
                if (!injected) {
                  injected = true;
                  await collision();
                }
                return delegate.create(...parameters);
              };
            },
          });
          const wrapped = new Proxy(tx, {
            get(transaction, transactionProperty, transactionReceiver) {
              if (transactionProperty === "promotionGrant") return promotionGrant;
              // Transaction delegates not under test retain their generated behavior.
              // eslint-disable-next-line @typescript-eslint/no-unsafe-return
              return Reflect.get(transaction, transactionProperty, transactionReceiver);
            },
          });
          return operation(wrapped);
        })
      );
    },
  });
}

function createNamedPrismaClient(applicationName: string): PrismaClient {
  const connectionString = namedConnectionString(applicationName);
  return new PrismaClient({ adapter: createPrismaPg({ connectionString }) });
}

async function createRawClient(applicationName: string): Promise<Client> {
  const client = new Client({ connectionString: namedConnectionString(applicationName) });
  await client.connect();
  return client;
}

function namedConnectionString(applicationName: string): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required for promotion integration tests.");
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!local || !url.pathname.slice(1).startsWith("wig_platform_test")) {
    throw new Error("Promotion integration tests require a localhost wig_platform_test database.");
  }
  url.searchParams.delete("schema");
  url.searchParams.set("application_name", applicationName);
  return url.toString();
}

async function waitForLockWait(observer: Client, applicationName: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await observer.query<{ waiting: boolean }>(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE application_name = $1
          AND state = 'active'
          AND wait_event_type = 'Lock'
      ) AS waiting
    `, [applicationName]);
    if (result.rows[0]?.waiting) return;
    await delay(20);
  }
  throw new Error(`Expected PostgreSQL lock wait for ${applicationName}.`);
}

async function rollbackQuietly(client: Client): Promise<void> {
  await client.query("ROLLBACK").catch(() => undefined);
}

async function cleanupFixture(fixture: Fixture): Promise<void> {
  const userIds = [
    fixture.userId,
    `promo_user_invalid_${fixture.suffix}`,
    `promo_user_conflict_${fixture.suffix}`,
  ];
  await db.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SET LOCAL session_replication_role = replica`);
    await tx.promotionGrant.deleteMany({ where: { userId: { in: userIds } } });
    const policies = await tx.promotionPolicyVersion.findMany({
      where: { programKey: { startsWith: fixture.programKey } },
      select: { id: true },
    });
    const policyIds = policies.map((policy) => policy.id);
    await tx.promotionMarketRule.deleteMany({ where: { policyVersionId: { in: policyIds } } });
    await tx.promotionPolicyVersion.deleteMany({ where: { id: { in: policyIds } } });
    const sessions = await tx.checkoutSession.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    });
    const sessionIds = sessions.map((session) => session.id);
    await tx.order.deleteMany({ where: { userId: { in: userIds } } });
    await tx.payment.deleteMany({ where: { checkoutSessionId: { in: sessionIds } } });
    await tx.checkoutSession.deleteMany({ where: { id: { in: sessionIds } } });
    await tx.customerBenefitProfile.deleteMany({ where: { userId: { in: userIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  });
}
