import type { PrismaClient } from "@prisma/client";
import { createTossRefundRecoveryOperation } from "../../src/lib/payment/refund/providers/toss/refund-recovery-orchestrator";
import { extractTossRefundEligibilityResponse } from "../../src/lib/payment/refund/providers/toss/refund-lookup-response";
import type { TossRefundLookupPort } from "../../src/lib/payment/refund/providers/toss/refund-lookup-http";
import type { ProviderCallBudget } from "./call-budget";
import type { H1Scenario } from "./contracts";
import type { ProviderFixture } from "./fixture-manifest";
import type { H1Ledger, RunLedgerStore } from "./run-ledger";
import {
  acceptanceOperationEnv, appendRuntimeLedger, protectedOwnershipOrNull,
} from "./runtime-ledger";

type Env = Readonly<Record<string, string | undefined>>;

export async function executeResumeGet(input: Readonly<{
  runId: string;
  scenarioId: H1Scenario;
  fixture: ProviderFixture;
  authorization: string;
  lookup: TossRefundLookupPort;
  budget: ProviderCallBudget;
  prisma: PrismaClient;
  ledgerStore: RunLedgerStore;
  ledger: H1Ledger;
  env: Env;
}>): Promise<Readonly<{ code: string; runId: string }>> {
  const response = await input.budget.wrapLookup(input.scenarioId, input.lookup)(
    input.fixture.paymentKey,
    input.authorization,
  );
  const eligible = response.kind === "response" && extractTossRefundEligibilityResponse(response.body, {
    paymentKey: input.fixture.paymentKey,
    conservativeNoLaterThanLookupTimestamp: Date.now(),
  }).kind === "eligible";
  const recoveryCode = eligible ? null : await applyResumeLookup(input, response);
  const current = await input.ledgerStore.loadLatest();
  await appendRuntimeLedger(input.ledgerStore, current, resumePhase(eligible, recoveryCode), {
    ...current?.payload,
    scenarioId: input.scenarioId,
    resumeLookupEligible: eligible,
    resumeRecoveryCode: recoveryCode,
  });
  return Object.freeze({ code: resumeCode(eligible, recoveryCode), runId: input.runId });
}

async function applyResumeLookup(
  input: Parameters<typeof executeResumeGet>[0],
  response: Awaited<ReturnType<TossRefundLookupPort>>,
): Promise<string | null> {
  const ownership = protectedOwnershipOrNull(input.ledger);
  if (!ownership?.refund || response.kind !== "response") return null;
  const replayLookup = () => Promise.resolve(response);
  const result = await createTossRefundRecoveryOperation({ lookup: replayLookup })(input.prisma, {
    commandId: ownership.refund.commandId,
    recoveryOwner: `h1-resume-${input.scenarioId}`,
  }, acceptanceOperationEnv(input.env));
  return result.ok ? "RECOVERED" : result.code;
}

function resumePhase(eligible: boolean, recoveryCode: string | null): H1Ledger["phase"] {
  if (eligible) return "HUMAN_POST_DECISION_REQUIRED";
  if (recoveryCode === "RECOVERED") return "LOCAL_COMMIT_COMPLETE";
  return recoveryCode === null ? "POST_RESPONSE_RECORDED" : "REVIEW_REQUIRED";
}

function resumeCode(eligible: boolean, recoveryCode: string | null): string {
  if (eligible) return "HUMAN_POST_DECISION_REQUIRED";
  if (recoveryCode === "RECOVERED") return "RESUME_RECOVERED";
  return recoveryCode === null ? "RESUME_GET_COMPLETE" : "RESUME_REVIEW_REQUIRED";
}
