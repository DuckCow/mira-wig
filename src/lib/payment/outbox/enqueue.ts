import { Prisma } from "@prisma/client";
import type { EnqueueOutboxInput } from "./types";

export async function enqueue(
  tx: Prisma.TransactionClient,
  input: EnqueueOutboxInput,
): Promise<void> {
  try {
    if (input.dedupKey) {
      await tx.paymentOutbox.createMany({
        data: buildCreateManyInput(input),
        skipDuplicates: true,
      });
      return;
    }

    await tx.paymentOutbox.create({
      data: {
        topic: input.topic,
        payload: input.payload,
        dedupKey: input.dedupKey ?? null,
      },
    });
  } catch (e) {
    if (input.dedupKey && isDedupConflict(e)) return;
    throw e;
  }
}

function buildCreateManyInput(input: EnqueueOutboxInput): Prisma.PaymentOutboxCreateManyInput {
  return {
    topic: input.topic,
    payload: input.payload,
    dedupKey: input.dedupKey ?? null,
    updatedAt: new Date(),
  };
}

function isDedupConflict(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    return e.code === "P2002" && hasDedupTarget(e);
  }
  if (!(e instanceof Error)) return false;
  return e.message.includes("Unique constraint") && e.message.includes("dedupKey");
}

function hasDedupTarget(e: Prisma.PrismaClientKnownRequestError): boolean {
  const target = e.meta?.target;
  if (typeof target === "string") return target.includes("dedupKey");
  if (!Array.isArray(target)) return false;
  return target.some((item) => typeof item === "string" && item.includes("dedupKey"));
}
