import type { PrismaClient } from "@prisma/client";
import { AcceptanceBootstrap, type AcceptanceBootstrapHandle } from "./bootstrap";
import {
  budgetRecordsFromPayload,
  type S3HistoryClassification,
  type S3HistoryExpectation,
} from "./budget-ledger";
import { requireCleanupAcknowledgement, type H1Scenario } from "./contracts";
import { appendRuntimeLedger } from "./runtime-ledger";
import type { H1Ledger, RunLedgerStore } from "./run-ledger";

export type RefundFixtureIds = Readonly<{
  refundAttemptId: string;
  commandId: string;
}>;
type CleanupContext = Readonly<{
  prisma: PrismaClient;
  bootstrap: AcceptanceBootstrap;
  ledger: RunLedgerStore;
}>;
type S3HistoryClassifier = (
  value: unknown,
  expectation: S3HistoryExpectation,
) => S3HistoryClassification;

export async function cleanupCommand(
  runId: string,
  env: Readonly<Record<string, string | undefined>>,
  context: CleanupContext,
  authorizedScenario: "S3" | null = null,
): Promise<Readonly<{ code: string; runId: string }>> {
  requireCleanupAcknowledgement(env, runId);
  const latest = await context.ledger.loadLatest();
  assertCleanupLedgerIdentity(latest, runId);
  if (authorizedScenario && latest.scenarioId !== authorizedScenario) {
    throw new Error("FIXTURE_SCENARIO_NOT_AUTHORIZED");
  }
  if (isProviderOnlyScenario(latest.scenarioId)) {
    await cleanupProviderOnlyRun(context.ledger, latest);
  } else {
    await cleanupOwnedRun(context, latest);
  }
  return Object.freeze({ code: "DATABASE_CLEANED", runId });
}

export function isProviderOnlyScenario(scenarioId: H1Ledger["scenarioId"]): boolean {
  return scenarioId === "S3" || scenarioId === "S4";
}

export function assertCleanupLedgerIdentity(
  ledger: H1Ledger | null,
  runId: string,
): asserts ledger is H1Ledger {
  if (!ledger || ledger.runId !== runId || ledger.payload.scenarioId !== ledger.scenarioId) {
    throw new Error("CLEANUP_LEDGER_INVALID");
  }
}

export async function cleanupProviderOnlyRun(
  ledger: RunLedgerStore,
  latest: H1Ledger,
): Promise<void> {
  if (latest.phase !== "SEALED") throw new Error("SEALED_EVIDENCE_REQUIRED");
  if (hasOwnershipPayload(latest)) throw new Error("PROVIDER_ONLY_OWNERSHIP_INVALID");
  await appendRuntimeLedger(ledger, latest, "DB_CLEANED", {
    ...latest.payload,
    cleanupComplete: true,
  });
}

export async function terminalizeS3History(
  store: RunLedgerStore,
  current: H1Ledger,
  classification: Extract<S3HistoryClassification, Readonly<{
    kind: "FAILED" | "INCOMPLETE" | "MALFORMED";
  }>>,
): Promise<string> {
  const existing = staticResultCode(current.payload.resultCode);
  if (current.phase === "REVIEW_REQUIRED") return existing ?? "S3_REVIEW_REQUIRED";
  const resultCode = terminalResultCode(classification);
  const counts = validIntentCounts(current.payload.callRecords);
  await appendRuntimeLedger(store, current, "REVIEW_REQUIRED", {
    ...current.payload,
    scenarioId: "S3",
    resultCode: Object.freeze([resultCode]),
    ...(counts ? { budgets: counts } : {}),
  });
  return resultCode;
}

export async function recoverS3ExecutionFailure(
  scenarioId: H1Scenario,
  store: RunLedgerStore,
  expectation: S3HistoryExpectation | undefined,
  classifier: S3HistoryClassifier,
  error: unknown,
): Promise<string> {
  if (scenarioId !== "S3") throw error;
  if (!expectation) throw new Error("S3_HISTORY_EXPECTATION_REQUIRED", { cause: error });
  const current = await store.loadLatest();
  if (!current) throw new Error("S3_FAILURE_LEDGER_REQUIRED", { cause: error });
  const history = classifier(current.payload.callRecords ?? [], expectation);
  if (isTerminalS3History(history)) return terminalizeS3History(store, current, history);
  throw error;
}

export async function durableS3TerminalCode(
  scenarioId: H1Scenario,
  store: RunLedgerStore,
  current: H1Ledger | null,
  expectation: S3HistoryExpectation | undefined,
  classifier: S3HistoryClassifier,
): Promise<string | null> {
  if (scenarioId !== "S3") return null;
  if (!expectation || !current) throw new Error("S3_DURABLE_PROOF_REQUIRED");
  const history = classifier(current.payload.callRecords ?? [], expectation);
  if (history.kind === "COMPLETE_SUCCESS") return null;
  if (isTerminalS3History(history)) return terminalizeS3History(store, current, history);
  throw new Error("S3_DURABLE_PROOF_REQUIRED");
}

export function isTerminalS3History(
  history: S3HistoryClassification,
): history is Extract<S3HistoryClassification, Readonly<{
  kind: "FAILED" | "INCOMPLETE" | "MALFORMED";
}>> {
  return history.kind === "FAILED" || history.kind === "INCOMPLETE" || history.kind === "MALFORMED";
}

export function hasS3ReplayObserved(value: unknown): boolean {
  return Array.isArray(value) && value.length === 1 && value[0] === "REPLAY_OBSERVED";
}

export function resolveS3ReturnCode(
  planned: "REPORT_ONLY" | "HUMAN_POST_DECISION_REQUIRED" | "S3_REVIEW_REQUIRED",
  value: unknown,
): string {
  return planned === "S3_REVIEW_REQUIRED" ? staticResultCode(value) ?? planned : planned;
}

function hasOwnershipPayload(ledger: H1Ledger): boolean {
  return Object.prototype.hasOwnProperty.call(ledger.payload, "bootstrapHandle")
    || Object.prototype.hasOwnProperty.call(ledger.payload, "refundFixture");
}

async function cleanupOwnedRun(context: CleanupContext, latest: H1Ledger): Promise<void> {
  if (latest.phase !== "SEALED" && latest.phase !== "DB_CLEANED") {
    throw new Error("SEALED_EVIDENCE_REQUIRED");
  }
  const ownership = parseCleanupOwnership(latest);
  await cleanupRunDatabase(context.prisma, context.bootstrap, ownership.handle, ownership.refund);
  await assertRunResidueZero(context.prisma, ownership.handle, ownership.refund);
  await appendRuntimeLedger(context.ledger, latest, "DB_CLEANED", {
    ...latest.payload,
    cleanupComplete: true,
  });
}

function parseCleanupOwnership(ledger: H1Ledger): Readonly<{
  handle: AcceptanceBootstrapHandle;
  refund: RefundFixtureIds | null;
}> {
  const handle = ledger.payload.bootstrapHandle;
  const refund = ledger.payload.refundFixture;
  if (!isBootstrapHandle(handle)) throw new Error("CLEANUP_LEDGER_INVALID");
  const parsedRefund = isRefundFixture(refund) ? refund : null;
  if ((ledger.scenarioId === "S1" || ledger.scenarioId === "S2" || ledger.scenarioId === "S5")
    && !parsedRefund) throw new Error("CLEANUP_LEDGER_INVALID");
  return Object.freeze({ handle, refund: parsedRefund });
}

export async function cleanupRunDatabase(
  client: PrismaClient,
  bootstrap: AcceptanceBootstrap,
  handle: AcceptanceBootstrapHandle,
  refund: RefundFixtureIds | null,
): Promise<void> {
  if (refund) {
    await client.$transaction(async (tx) => {
      const attempt = await tx.refundAttempt.findUnique({
        where: { id: refund.refundAttemptId },
        select: { orderId: true, executionCommand: { select: { id: true } } },
      });
      if (attempt && (attempt.orderId !== handle.orderId
        || attempt.executionCommand?.id !== refund.commandId)) {
        throw new Error("CLEANUP_OWNERSHIP_MISMATCH");
      }
      const dispatches = await tx.refundExecutionDispatchAttempt.findMany({
        where: { commandId: refund.commandId }, select: { id: true },
      });
      const dispatchIds = dispatches.map((row) => row.id);
      const binding = await tx.refundExecutionProviderOperationBinding.findUnique({
        where: { refundAttemptId: refund.refundAttemptId }, select: { id: true },
      });
      await tx.refundExecutionEvidence.deleteMany({ where: { commandId: refund.commandId } });
      await tx.refundExecutionProviderContactEligibilityProof.deleteMany({ where: { dispatchAttemptId: { in: dispatchIds } } });
      if (binding) await tx.refundExecutionProviderEligibilityProof.deleteMany({ where: { bindingId: binding.id } });
      await tx.refundExecutionProviderOperationBinding.deleteMany({ where: { refundAttemptId: refund.refundAttemptId } });
      await tx.refundExecutionDispatchAttempt.deleteMany({ where: { commandId: refund.commandId } });
      await tx.refundExecutionCommandEvent.deleteMany({ where: { commandId: refund.commandId } });
      await tx.refundExecutionCommand.deleteMany({ where: { id: refund.commandId, refundAttemptId: refund.refundAttemptId } });
      await tx.refundAttemptTransition.deleteMany({ where: { refundAttemptId: refund.refundAttemptId } });
      await tx.refundAttemptLine.deleteMany({ where: { refundAttemptId: refund.refundAttemptId } });
      await tx.refundAttempt.deleteMany({ where: { id: refund.refundAttemptId, orderId: handle.orderId } });
    });
  }
  await bootstrap.cleanup(handle);
}

export async function assertRunResidueZero(
  client: PrismaClient,
  handle: AcceptanceBootstrapHandle,
  refund: RefundFixtureIds | null,
): Promise<void> {
  const [user, session, payment, order, attempt, command] = await Promise.all([
    client.user.count({ where: { id: handle.userId } }),
    client.checkoutSession.count({ where: { id: handle.checkoutSessionId } }),
    client.payment.count({ where: { id: handle.paymentId } }),
    client.order.count({ where: { id: handle.orderId } }),
    refund ? client.refundAttempt.count({ where: { id: refund.refundAttemptId } }) : 0,
    refund ? client.refundExecutionCommand.count({ where: { id: refund.commandId } }) : 0,
  ]);
  if ([user, session, payment, order, attempt, command].some((count) => count !== 0)) {
    throw new Error("CLEANUP_RESIDUE_REMAINS");
  }
}

function terminalResultCode(
  classification: Parameters<typeof terminalizeS3History>[2],
): string {
  if (classification.kind === "FAILED") return "S3_REPLAY_PROBE_FAILED";
  if (classification.kind === "INCOMPLETE") return "S3_PROVIDER_CALL_INCOMPLETE";
  return "S3_PROVIDER_HISTORY_MALFORMED";
}

function validIntentCounts(value: unknown): Readonly<{ GET: number; POST: number }> | null {
  try {
    const intents = budgetRecordsFromPayload(value).filter((entry) => (
      entry.scenarioId === "S3" && entry.phase === "INTENT"
    ));
    return Object.freeze({
      GET: intents.filter((entry) => entry.kind === "GET").length,
      POST: intents.filter((entry) => entry.kind === "POST").length,
    });
  } catch {
    return null;
  }
}

function staticResultCode(value: unknown): string | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const code: unknown = value[0];
  return typeof code === "string" ? code : null;
}

function isBootstrapHandle(value: unknown): value is AcceptanceBootstrapHandle {
  return typeof value === "object" && value !== null && "runId" in value && "orderId" in value
    && "paymentId" in value && "userId" in value && "checkoutSessionId" in value;
}

function isRefundFixture(value: unknown): value is RefundFixtureIds {
  return typeof value === "object" && value !== null
    && "refundAttemptId" in value && "commandId" in value;
}
