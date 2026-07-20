import type { PrismaClient } from "@prisma/client";
import { createTossRefundRecoveryOperation } from "../../src/lib/payment/refund/providers/toss/refund-recovery-orchestrator";
import { deriveTossRefundOperationKey } from "../../src/lib/payment/refund/providers/toss/refund-operation-key";
import { deriveTossRefundCancellationWireRequest } from "../../src/lib/payment/refund/providers/toss/refund-wire-request";
import { fingerprintTossRefundWireRequest } from "../../src/lib/payment/refund/providers/toss/refund-wire-fingerprint";
import { extractTossRefundEligibilityResponse } from "../../src/lib/payment/refund/providers/toss/refund-lookup-response";
import type { TossRefundLookupPort } from "../../src/lib/payment/refund/providers/toss/refund-lookup-http";
import type { TossRefundCancellationPort } from "../../src/lib/payment/refund/providers/toss/refund-cancellation-http";
import type { ProviderCallBudget } from "./call-budget";
import { budgetRecordsFromPayload, protectedPostRequest } from "./call-budget";
import { S4_PROVIDER_PROBE_RETIRED, type H1Scenario } from "./contracts";
import type { ProviderFixture } from "./fixture-manifest";
import type { H1Ledger } from "./run-ledger";
import { parseProtectedOwnership } from "./runtime-ledger";

export async function executeExplicitResumePost(input: Readonly<{
  prisma: PrismaClient;
  scenarioId: H1Scenario;
  runId: string;
  fixture: ProviderFixture;
  authorization: string;
  lookup: TossRefundLookupPort;
  cancellation: TossRefundCancellationPort;
  budget: ProviderCallBudget;
  env: Readonly<Record<string, string | undefined>>;
  ledger: H1Ledger;
}>): Promise<string> {
  if (input.scenarioId === "S4") throw new Error(S4_PROVIDER_PROBE_RETIRED);
  const lookup = input.budget.wrapLookup(input.scenarioId, input.lookup);
  if (input.scenarioId === "S3") {
    return resumeS3Probe(input, lookup, input.cancellation);
  }
  const cancellation = input.budget.wrapCancellation(input.scenarioId, input.cancellation);
  const ownership = parseProtectedOwnership(input.ledger);
  if (!ownership.refund) throw new Error("RESUME_POST_LEDGER_INVALID");
  await assertLocalResumeIdentity(input, ownership.refund.refundAttemptId);
  const result = await createTossRefundRecoveryOperation({ lookup, cancellation })(input.prisma, {
    commandId: ownership.refund.commandId,
    recoveryOwner: `h1-resume-${input.scenarioId}`,
  }, input.env);
  return result.ok ? "RESUME_POST_COMPLETE" : `RESUME_POST_${result.code}`;
}

async function assertLocalResumeIdentity(
  input: Parameters<typeof executeExplicitResumePost>[0],
  refundAttemptId: string,
): Promise<void> {
  const binding = await input.prisma.refundExecutionProviderOperationBinding.findUnique({
    where: { refundAttemptId },
    select: { providerOperationKey: true, wireRequestFingerprint: true },
  });
  if (!binding) throw new Error("RESUME_POST_IDENTITY_MISMATCH");
  const wireInput = {
    paymentKey: input.fixture.paymentKey,
    providerOperationKey: binding.providerOperationKey,
    cancelAmount: input.fixture.amount,
  };
  const wire = deriveTossRefundCancellationWireRequest(wireInput);
  const fingerprint = fingerprintTossRefundWireRequest(wireInput);
  if (binding.wireRequestFingerprint !== fingerprint
    || !matchesLastPost(input.ledger, protectedPostRequest(wire, JSON.stringify(wire.body)))) {
    throw new Error("RESUME_POST_IDENTITY_MISMATCH");
  }
}

async function resumeS3Probe(
  input: Parameters<typeof executeExplicitResumePost>[0],
  lookup: TossRefundLookupPort,
  cancellation: TossRefundCancellationPort,
): Promise<string> {
  const operationKey = deriveTossRefundOperationKey(`h1:${input.runId}:S3`);
  const wireInput = {
    paymentKey: input.fixture.paymentKey,
    providerOperationKey: operationKey,
    cancelAmount: input.fixture.amount,
  };
  const wire = deriveTossRefundCancellationWireRequest(wireInput);
  const expectedBody = JSON.stringify(wire.body);
  if (!matchesLastPost(input.ledger, protectedPostRequest(wire, expectedBody))) {
    throw new Error("RESUME_POST_IDENTITY_MISMATCH");
  }
  const observed = await lookup(input.fixture.paymentKey, input.authorization);
  if (observed.kind !== "response" || extractTossRefundEligibilityResponse(observed.body, {
    paymentKey: input.fixture.paymentKey,
    conservativeNoLaterThanLookupTimestamp: Date.now(),
  }).kind !== "eligible") throw new Error("RESUME_POST_ELIGIBILITY_REQUIRED");
  await input.budget.invokeProtected(
    "S3",
    "POST",
    protectedPostRequest(wire, expectedBody),
    () => cancellation(Object.freeze({ authorization: input.authorization, wire })),
  );
  return "RESUME_POST_COMPLETE";
}

function matchesLastPost(
  ledger: H1Ledger,
  expected: ReturnType<typeof protectedPostRequest>,
): boolean {
  const records = budgetRecordsFromPayload(ledger.payload.callRecords);
  const posts = records.filter((entry) => entry.kind === "POST" && entry.phase === "INTENT");
  const last = posts.at(-1);
  return last?.request.path === expected.path
    && last.request.canonicalBody === expected.canonicalBody
    && last.request.operationKey === expected.operationKey
    && last.request.wireFingerprint === expected.wireFingerprint;
}
