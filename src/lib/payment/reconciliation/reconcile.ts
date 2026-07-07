import type { PrismaClient } from "@prisma/client";
import { appendLayer1Findings } from "./layer1";
import { appendLayer2Findings } from "./layer2";
import { appendProviderConfirmFindings } from "./provider-confirm";
import type { ReconciliationFinding, ReconcilePaymentCoreOptions } from "./types";
import { normalizeOptions } from "./utils";

export async function reconcilePaymentCore(
  client: PrismaClient,
  options: ReconcilePaymentCoreOptions = {},
): Promise<ReconciliationFinding[]> {
  const normalized = normalizeOptions(options);
  const findings: ReconciliationFinding[] = [];
  await appendLayer1Findings(client, normalized, findings);
  await appendLayer2Findings(client, normalized, findings);
  await appendProviderConfirmFindings(client, normalized, findings);
  return findings;
}
