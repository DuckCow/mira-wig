export * from "./types";
export * from "./record-capture";
export * from "./transaction";
export * from "./compensate";

import type { PrismaClient } from "@prisma/client";
import { compensateTerminalFailure } from "./compensate";
import { PaymentCaptureModeMismatchError, recordCapture } from "./record-capture";
import { runCompletionTransaction } from "./transaction";
import type { CaptureFacts, CompleteFromCaptureResult } from "./types";

export async function completeFromCapture(
  client: PrismaClient,
  facts: CaptureFacts,
): Promise<CompleteFromCaptureResult> {
  let payment;
  try {
    payment = await recordCapture(client, facts);
  } catch (e) {
    if (e instanceof PaymentCaptureModeMismatchError) {
      return compensateTerminalFailure(client, e.failure);
    }
    throw e;
  }
  const result = await runCompletionTransaction(client, facts, payment);
  if (result.kind === "terminalFailure") {
    return compensateTerminalFailure(client, result);
  }
  return result;
}
