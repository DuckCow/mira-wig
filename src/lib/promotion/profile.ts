import "server-only";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { isValidBirthday } from "./birthday-calendar";
import { PromotionError } from "./errors";

export interface SetCustomerBirthdayInput {
  readonly userId: string;
  readonly birthdayMonth: number | null;
  readonly birthdayDay: number | null;
  readonly now: Date;
}

export async function setCustomerBirthday(
  client: PrismaClient,
  input: SetCustomerBirthdayInput,
) {
  validateBirthdayWrite(input);
  return client.$transaction(async (tx) => {
    await lockUser(tx, input.userId);
    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });
    if (!user) throw new PromotionError("USER_NOT_FOUND", "User not found.");
    const existing = await tx.customerBenefitProfile.findUnique({
      where: { userId: input.userId },
    });
    if (existing?.birthdayMonth === input.birthdayMonth
      && existing.birthdayDay === input.birthdayDay) return existing;
    if (existing?.birthdayMonth !== null && existing?.birthdayMonth !== undefined) {
      throw new PromotionError(
        "BIRTHDAY_CHANGE_REQUIRES_SUPPORT",
        "Changing an existing birthday requires support.",
      );
    }
    return tx.customerBenefitProfile.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        birthdayMonth: input.birthdayMonth,
        birthdayDay: input.birthdayDay,
        birthdaySetAt: input.now,
        birthdayUpdatedAt: input.now,
      },
      update: {
        birthdayMonth: input.birthdayMonth,
        birthdayDay: input.birthdayDay,
        birthdaySetAt: input.now,
        birthdayUpdatedAt: input.now,
      },
    });
  });
}

function validateBirthdayWrite(input: SetCustomerBirthdayInput): void {
  if (input.birthdayMonth === null || input.birthdayDay === null
    || !isValidBirthday(input.birthdayMonth, input.birthdayDay)) {
    throw new PromotionError("BIRTHDAY_DATE_INVALID", "Birthday month and day are invalid.");
  }
  if (Number.isNaN(input.now.getTime())) {
    throw new PromotionError("BIRTHDAY_DATE_INVALID", "Birthday write time is invalid.");
  }
}

async function lockUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
  `);
}
