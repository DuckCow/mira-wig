export * from "./types";
export * from "./record-capture";
export * from "./transaction";
export * from "./compensate";

import type { PrismaClient } from "@prisma/client";
import { compensateTerminalFailure } from "./compensate";
import { recordCapture } from "./record-capture";
import { runCompletionTransaction } from "./transaction";
import type { CaptureFacts, CompleteFromCaptureResult } from "./types";

export async function completeFromCapture(
  client: PrismaClient,
  facts: CaptureFacts,
): Promise<CompleteFromCaptureResult> {
  const payment = await recordCapture(client, facts);
  const result = await runCompletionTransaction(client, facts, payment);
  if (result.kind === "terminalFailure") {
    return compensateTerminalFailure(client, result);
  }
  return result;
}
