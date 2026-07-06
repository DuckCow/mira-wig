import { CheckoutSessionStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { CheckoutSessionTransition, TransitionCheckoutSessionInput } from "./types";

type SessionClient = Pick<Prisma.TransactionClient, "checkoutSession">;
type TransitionCandidate = { from: CheckoutSessionStatus; to: CheckoutSessionStatus };

export async function transitionCheckoutSession(
  client: SessionClient,
  input: TransitionCheckoutSessionInput,
): Promise<number> {
  if (!isDefinedTransition(input.transition)) return 0;
  const result = await client.checkoutSession.updateMany({
    where: { id: input.sessionId, status: input.transition.from },
    data: transitionData(input.transition.to, input.now),
  });
  return result.count;
}

export function isDefinedTransition(transition: TransitionCandidate): transition is CheckoutSessionTransition {
  if (transition.from === CheckoutSessionStatus.SUBMITTED) {
    return isSubmittedTarget(transition.to);
  }
  return transition.from === CheckoutSessionStatus.EXPIRED
    && transition.to === CheckoutSessionStatus.COMPLETED;
}

function isSubmittedTarget(to: CheckoutSessionStatus): boolean {
  return to === CheckoutSessionStatus.COMPLETED
    || to === CheckoutSessionStatus.FAILED
    || to === CheckoutSessionStatus.EXPIRED;
}

function transitionData(to: CheckoutSessionStatus, now: Date) {
  if (to === CheckoutSessionStatus.COMPLETED) {
    return { status: to, completedAt: now };
  }
  return { status: to };
}
