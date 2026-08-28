import "server-only";
import {
  OrderStatus,
  PaymentAttemptStatus,
  Prisma,
  PromotionKind,
  PromotionPolicyStatus,
} from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { birthdayWindowAt } from "./birthday-calendar";
import { PromotionError } from "./errors";

export interface IssuePromotionGrantInput {
  readonly userId: string;
  readonly programKey: string;
  readonly marketCode: string;
  readonly now: Date;
}

export async function issueSignupPromotionGrant(
  client: PrismaClient,
  input: IssuePromotionGrantInput,
) {
  validateIssueInput(input);
  const replayIdentity = signupReplayIdentity(input);
  try {
    return await client.$transaction(async (tx) => {
      await lockProgram(tx, input.programKey);
      await lockUser(tx, input.userId);
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { id: true, emailVerified: true },
      });
      if (!user) throw new PromotionError("USER_NOT_FOUND", "User not found.");
      const replay = await findValidatedGrantReplay(tx, replayIdentity);
      if (replay) return replay;
      if (user.emailVerified === null) {
        throw new PromotionError("SIGNUP_EMAIL_NOT_VERIFIED", "Signup promotion requires verified email.");
      }
      const policy = await effectivePolicy(tx, PromotionKind.SIGNUP, input);
      const rule = requestedRule(policy, input.marketCode);
      const priorPurchase = await financiallyCompletedOrderExists(tx, input.userId, false);
      if (priorPurchase) {
        throw new PromotionError("SIGNUP_PRIOR_PURCHASE_EXISTS", "Signup promotion is limited to a first purchase.");
      }
      return tx.promotionGrant.create({
        data: {
          userId: input.userId,
          policyVersionId: policy.id,
          grantKey: replayIdentity.grantKey,
          originMarketCode: rule.marketCode,
          issuedAt: input.now,
          validFrom: input.now,
          expiresAt: grantExpiry(input.now, policy.grantValidityDays),
        },
      });
    });
  } catch (error) {
    return convergeGrantUniqueConflict(client, error, replayIdentity);
  }
}

export async function issueBirthdayPromotionGrant(
  client: PrismaClient,
  input: IssuePromotionGrantInput,
) {
  validateIssueInput(input);
  let replayIdentity: GrantReplayIdentity | null = null;
  try {
    return await client.$transaction((tx) => issueBirthdayInTransaction(
      tx,
      input,
      (identity) => {
        replayIdentity = identity;
      },
    ));
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    if (replayIdentity === null) grantIdentityConflict();
    return convergeGrantUniqueConflict(client, error, replayIdentity);
  }
}

export function signupGrantKey(programKey: string, userId: string): string {
  return `signup:${programKey}:${userId}`;
}

export function birthdayGrantKey(
  programKey: string,
  userId: string,
  benefitYear: number,
): string {
  return `birthday:${programKey}:${userId}:${benefitYear}`;
}

type PromotionTx = Prisma.TransactionClient;
type EffectivePolicy = NonNullable<Awaited<ReturnType<typeof effectivePolicy>>>;

async function issueBirthdayInTransaction(
  tx: PromotionTx,
  input: IssuePromotionGrantInput,
  rememberReplayIdentity: (identity: GrantReplayIdentity) => void,
) {
  await lockProgram(tx, input.programKey);
  await lockUser(tx, input.userId);
  const birthday = await requireUserBirthday(tx, input.userId);
  const policy = await effectivePolicy(tx, PromotionKind.BIRTHDAY, input);
  const rule = requestedRule(policy, input.marketCode);
  const match = requireBirthdayWindowMatch(policy, rule, birthday, input.now);
  const replayIdentity = birthdayReplayIdentity(input, match.benefitYear);
  rememberReplayIdentity(replayIdentity);
  const replay = await findValidatedGrantReplay(tx, replayIdentity);
  if (replay) return replay;
  const qualifyingPurchase = await financiallyCompletedOrderExists(tx, input.userId, true);
  if (!qualifyingPurchase) {
    throw new PromotionError("QUALIFYING_PURCHASE_REQUIRED", "Birthday promotion requires a qualifying purchase.");
  }
  return tx.promotionGrant.create({
    data: {
      userId: input.userId,
      policyVersionId: policy.id,
      grantKey: replayIdentity.grantKey,
      benefitYear: match.benefitYear,
      originMarketCode: rule.marketCode,
      issuedAt: input.now,
      validFrom: input.now,
      expiresAt: grantExpiry(input.now, policy.grantValidityDays),
    },
  });
}

interface GrantReplayIdentity {
  readonly grantKey: string;
  readonly userId: string;
  readonly programKey: string;
  readonly kind: PromotionKind;
  readonly benefitYear: number | null;
}

type PromotionGrantReader = Pick<Prisma.TransactionClient, "promotionGrant">;

function signupReplayIdentity(input: IssuePromotionGrantInput): GrantReplayIdentity {
  return Object.freeze({
    grantKey: signupGrantKey(input.programKey, input.userId),
    userId: input.userId,
    programKey: input.programKey,
    kind: PromotionKind.SIGNUP,
    benefitYear: null,
  });
}

function birthdayReplayIdentity(
  input: IssuePromotionGrantInput,
  benefitYear: number,
): GrantReplayIdentity {
  return Object.freeze({
    grantKey: birthdayGrantKey(input.programKey, input.userId, benefitYear),
    userId: input.userId,
    programKey: input.programKey,
    kind: PromotionKind.BIRTHDAY,
    benefitYear,
  });
}

async function findValidatedGrantReplay(
  client: PromotionGrantReader,
  expected: GrantReplayIdentity,
) {
  const existing = await client.promotionGrant.findUnique({
    where: { grantKey: expected.grantKey },
    include: {
      policyVersion: { select: { programKey: true, kind: true } },
    },
  });
  if (!existing) return null;
  if (existing.grantKey !== expected.grantKey
    || existing.userId !== expected.userId
    || existing.policyVersion.programKey !== expected.programKey
    || existing.policyVersion.kind !== expected.kind
    || existing.benefitYear !== expected.benefitYear) {
    grantIdentityConflict();
  }
  const { policyVersion: _policyVersion, ...grant } = existing;
  return grant;
}

async function convergeGrantUniqueConflict(
  client: PrismaClient,
  error: unknown,
  expected: GrantReplayIdentity,
) {
  if (!isUniqueConflict(error)) throw error;
  const replay = await findValidatedGrantReplay(client, expected);
  if (!replay) grantIdentityConflict();
  return replay;
}

function isUniqueConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2002";
  return typeof error === "object" && error !== null
    && "code" in error && error.code === "P2002";
}

function grantIdentityConflict(): never {
  throw new PromotionError(
    "PROMOTION_GRANT_IDENTITY_CONFLICT",
    "Existing promotion grant does not match the requested entitlement identity.",
  );
}

async function requireUserBirthday(tx: PromotionTx, userId: string) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      benefitProfile: { select: { birthdayMonth: true, birthdayDay: true } },
    },
  });
  if (!user) throw new PromotionError("USER_NOT_FOUND", "User not found.");
  const birthdayMonth = user.benefitProfile?.birthdayMonth;
  const birthdayDay = user.benefitProfile?.birthdayDay;
  if (birthdayMonth === null || birthdayMonth === undefined
    || birthdayDay === null || birthdayDay === undefined) {
    throw new PromotionError("BIRTHDAY_NOT_SET", "Birthday month and day are not set.");
  }
  return Object.freeze({ birthdayMonth, birthdayDay });
}

function requireBirthdayWindowMatch(
  policy: EffectivePolicy,
  rule: EffectivePolicy["marketRules"][number],
  birthday: { readonly birthdayMonth: number; readonly birthdayDay: number },
  now: Date,
) {
  const match = birthdayWindowAt({
    ...birthday,
    windowBeforeDays: requireBirthdayWindow(policy.birthdayWindowBeforeDays),
    windowAfterDays: requireBirthdayWindow(policy.birthdayWindowAfterDays),
    leapDayObservation: requireLeapRule(policy.birthdayLeapDayObservation),
    eligibilityTimeZone: requireTimeZone(rule.eligibilityTimeZone),
    now,
  });
  if (!match) {
    throw new PromotionError("BIRTHDAY_OUTSIDE_WINDOW", "Current instant is outside the birthday benefit window.");
  }
  return match;
}

async function effectivePolicy(
  tx: PromotionTx,
  kind: PromotionKind,
  input: IssuePromotionGrantInput,
) {
  const policy = await tx.promotionPolicyVersion.findFirst({
    where: {
      programKey: input.programKey,
      kind,
      status: PromotionPolicyStatus.ACTIVE,
      startsAt: { lte: input.now },
      OR: [{ endsAt: null }, { endsAt: { gt: input.now } }],
    },
    include: { marketRules: { where: { marketCode: input.marketCode } } },
  });
  if (!policy) {
    throw new PromotionError("NO_EFFECTIVE_POLICY", "No effective active promotion policy exists.");
  }
  return policy;
}

function requestedRule(policy: EffectivePolicy, marketCode: string) {
  const rule = policy.marketRules[0];
  if (!rule) {
    throw new PromotionError("MARKET_RULE_NOT_FOUND", `Promotion has no rule for Market ${marketCode}.`);
  }
  return rule;
}

async function financiallyCompletedOrderExists(
  tx: PromotionTx,
  userId: string,
  excludeFullyRefunded: boolean,
): Promise<boolean> {
  const order = await tx.order.findFirst({
    where: {
      userId,
      ...(excludeFullyRefunded ? {
        status: { in: [OrderStatus.PAID, OrderStatus.REFUND_PENDING, OrderStatus.PARTIALLY_REFUNDED] },
      } : {}),
      payment: {
        status: PaymentAttemptStatus.SUCCEEDED,
        financialSucceededAt: { not: null },
      },
    },
    select: { id: true },
  });
  return order !== null;
}

function validateIssueInput(input: IssuePromotionGrantInput): void {
  if (!input.userId.trim() || !input.programKey.trim() || !input.marketCode.trim()
    || Number.isNaN(input.now.getTime())) {
    throw new PromotionError("NO_EFFECTIVE_POLICY", "Promotion grant input is invalid.");
  }
}

function grantExpiry(now: Date, validityDays: number | null): Date | null {
  if (validityDays === null) return null;
  return new Date(now.getTime() + validityDays * 86_400_000);
}

function requireBirthdayWindow(value: number | null): number {
  if (value === null) {
    throw new PromotionError("NO_EFFECTIVE_POLICY", "Birthday policy window is incomplete.");
  }
  return value;
}

function requireLeapRule(value: "FEB_28" | "MAR_01" | null): "FEB_28" | "MAR_01" {
  if (value === null) {
    throw new PromotionError("NO_EFFECTIVE_POLICY", "Birthday leap-day rule is incomplete.");
  }
  return value;
}

function requireTimeZone(value: string | null): string {
  if (value === null) {
    throw new PromotionError("NO_EFFECTIVE_POLICY", "Birthday Market timezone is incomplete.");
  }
  return value;
}

async function lockProgram(tx: PromotionTx, programKey: string): Promise<void> {
  await tx.$queryRaw<{ lock: string }[]>(Prisma.sql`
    SELECT ''::text AS "lock"
    FROM (SELECT pg_advisory_xact_lock(hashtextextended(${programKey}, 0))) AS locked
  `);
}

async function lockUser(tx: PromotionTx, userId: string): Promise<void> {
  await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
  `);
}
