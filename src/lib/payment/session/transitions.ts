import { CheckoutSessionStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { TransitionCheckoutSessionInput } from "./types";

type SessionClient = Pick<Prisma.TransactionClient, "checkoutSession">;

export async function transitionCheckoutSession(
  client: SessionClient,
  input: TransitionCheckoutSessionInput,
): Promise<number> {
  if (!isDefinedTransition(input.to)) return 0;
  const result = await client.checkoutSession.updateMany({
    where: { id: input.sessionId, status: CheckoutSessionStatus.SUBMITTED },
    data: transitionData(input.to, input.now),
  });
  return result.count;
}

export function isDefinedTransition(to: CheckoutSessionStatus): boolean {
  return (
    to === CheckoutSessionStatus.COMPLETED
    || to === CheckoutSessionStatus.FAILED
    || to === CheckoutSessionStatus.EXPIRED
  );
}

function transitionData(to: CheckoutSessionStatus, now: Date) {
  if (to === CheckoutSessionStatus.COMPLETED) {
    return { status: to, completedAt: now };
  }
  return { status: to };
}
