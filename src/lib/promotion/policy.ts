import "server-only";
import {
  Prisma,
  PromotionKind,
  PromotionPolicyStatus,
} from "@prisma/client";
import type {
  BirthdayLeapDayObservation,
  PrismaClient,
} from "@prisma/client";
import { isValidIanaTimeZone } from "./birthday-calendar";
import { PromotionError } from "./errors";

export interface ActivationMarketRule {
  readonly marketCode: string;
  readonly currency: string;
  readonly rateBps: number;
  readonly maximumDiscountMinor: bigint;
  readonly minimumEligibleSubtotalMinor: bigint | null;
  readonly eligibilityTimeZone: string | null;
  readonly market: { readonly currency: string } | null;
}

export interface ActivationPolicy {
  readonly status: PromotionPolicyStatus;
  readonly kind: PromotionKind;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly firstOrderOnly: boolean;
  readonly requiresQualifyingPurchase: boolean;
  readonly birthdayWindowBeforeDays: number | null;
  readonly birthdayWindowAfterDays: number | null;
  readonly birthdayLeapDayObservation: BirthdayLeapDayObservation | null;
  readonly marketRules: readonly ActivationMarketRule[];
}

export async function activatePromotionPolicyVersion(
  client: PrismaClient,
  policyVersionId: string,
) {
  return client.$transaction(async (tx) => {
    await lockPolicy(tx, policyVersionId);
    const policy = await loadPolicy(tx, policyVersionId);
    if (!policy) {
      throw new PromotionError("POLICY_ACTIVATION_INVALID", "Promotion policy was not found.");
    }
    await lockProgram(tx, policy.programKey);
    validatePromotionPolicyActivation(policy);
    await tx.promotionPolicyVersion.updateMany({
      where: {
        programKey: policy.programKey,
        status: PromotionPolicyStatus.ACTIVE,
        id: { not: policy.id },
      },
      data: { status: PromotionPolicyStatus.RETIRED },
    });
    const activated = await tx.promotionPolicyVersion.updateMany({
      where: { id: policy.id, status: PromotionPolicyStatus.DRAFT },
      data: { status: PromotionPolicyStatus.ACTIVE },
    });
    if (activated.count !== 1) {
      throw new PromotionError("POLICY_NOT_DRAFT", "Promotion policy is no longer a draft.");
    }
    return tx.promotionPolicyVersion.findUniqueOrThrow({
      where: { id: policy.id },
      include: { marketRules: true },
    });
  });
}

export function validatePromotionPolicyActivation(policy: ActivationPolicy): void {
  if (policy.status !== PromotionPolicyStatus.DRAFT) invalid("Promotion policy is not a draft.");
  if (policy.marketRules.length === 0) invalid("Promotion policy requires at least one Market rule.");
  if (policy.endsAt !== null && policy.startsAt >= policy.endsAt) {
    invalid("Promotion policy effective interval is invalid.");
  }
  for (const rule of policy.marketRules) validateMarketRule(rule, policy.kind);
  if (policy.kind === PromotionKind.SIGNUP && !policy.firstOrderOnly) {
    invalid("Signup promotion must be first-order-only.");
  }
  if (policy.kind === PromotionKind.BIRTHDAY) validateBirthdayPolicy(policy);
}

async function loadPolicy(tx: Prisma.TransactionClient, id: string) {
  return tx.promotionPolicyVersion.findUnique({
    where: { id },
    include: { marketRules: { include: { market: { select: { currency: true } } } } },
  });
}

function validateMarketRule(rule: ActivationMarketRule, kind: PromotionKind): void {
  if (!rule.market) invalid(`Unknown Market: ${rule.marketCode}`);
  if (rule.market.currency !== rule.currency) invalid(`Market currency mismatch: ${rule.marketCode}`);
  validateRate(rule);
  validateCap(rule);
  validateMinimum(rule);
  validateBirthdayTimeZone(rule, kind);
}

function validateRate(rule: ActivationMarketRule): void {
  if (Number.isInteger(rule.rateBps) && rule.rateBps >= 1 && rule.rateBps <= 10_000) return;
  invalid(`Invalid percentage rate: ${rule.marketCode}`);
}

function validateCap(rule: ActivationMarketRule): void {
  if (typeof rule.maximumDiscountMinor === "bigint"
    && rule.maximumDiscountMinor > BigInt(0)) return;
  invalid(`Invalid maximum discount: ${rule.marketCode}`);
}

function validateMinimum(rule: ActivationMarketRule): void {
  if (rule.minimumEligibleSubtotalMinor === null) return;
  if (typeof rule.minimumEligibleSubtotalMinor === "bigint"
    && rule.minimumEligibleSubtotalMinor >= BigInt(0)) return;
  invalid(`Invalid minimum subtotal: ${rule.marketCode}`);
}

function validateBirthdayTimeZone(rule: ActivationMarketRule, kind: PromotionKind): void {
  if (kind !== PromotionKind.BIRTHDAY) return;
  if (rule.eligibilityTimeZone !== null && isValidIanaTimeZone(rule.eligibilityTimeZone)) return;
  invalid(`Birthday Market timezone is invalid: ${rule.marketCode}`);
}

function validateBirthdayPolicy(policy: ActivationPolicy): void {
  if (!policy.requiresQualifyingPurchase) {
    invalid("Birthday promotion requires a qualifying purchase.");
  }
  if (!isNonnegativeInteger(policy.birthdayWindowBeforeDays)
    || !isNonnegativeInteger(policy.birthdayWindowAfterDays)) {
    invalid("Birthday promotion requires explicit nonnegative window values.");
  }
  if (policy.birthdayLeapDayObservation === null) {
    invalid("Birthday promotion requires an explicit leap-day rule.");
  }
}

function isNonnegativeInteger(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value >= 0;
}

function invalid(message: string): never {
  throw new PromotionError("POLICY_ACTIVATION_INVALID", message);
}

async function lockPolicy(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "PromotionPolicyVersion" WHERE "id" = ${id} FOR UPDATE
  `);
}

async function lockProgram(tx: Prisma.TransactionClient, programKey: string): Promise<void> {
  await tx.$queryRaw<{ lock: string }[]>(Prisma.sql`
    SELECT ''::text AS "lock"
    FROM (SELECT pg_advisory_xact_lock(hashtextextended(${programKey}, 0))) AS locked
  `);
}
